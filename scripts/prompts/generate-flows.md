# Instrucciones: Generar sección `toolOrchestration.flows`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca `# Reglas de Agendamiento`, `# Solicitudes de Agendamiento`, `# Reprogramación y cancelación`
2. `_templates/base-<mode>.json` — usa los flows del template como base
3. `scripts/prompts/generate-intents.md` — para alinear flows con intents existentes
4. `structured-logic-standards.md` — sección "Flows y Steps"

## Reglas Obligatorias

### 1. Un flow por intent crítico
Cada intent que requiere acción del bot DEBE tener al menos un flow:
- `existing_appointment_confirmation` → flow de confirmación
- `existing_appointment_cancellation` → flow de cancelación
- `existing_appointment_inquiry` → flow de consulta (sin tools)
- `new_appointment_scheduling` → flow de agendamiento (modo dependiente)
- `general_inquiry` → flow informativo con `query_knowledge_base` disponible como fallback semántico
- `human_follow_up` → flow de tarea

### 2. Mapeo de tools por modo

**FULL MODE — Tools permitidas:**
- `resolve_patient`: Identificar/crear paciente antes de agendar
- `resolve_treatment`: Identificar tratamiento deseado
- `resolve_professional`: Identificar profesional por nombre/especialidad
- `resolve_availability_query`: Convertir frase natural de fecha a fechas concretas
- `check_availability`: Consultar disponibilidad de horarios
- `schedule_block`: Crear cita real (requiere resolve_patient + check_availability previos)
- `manage_schedule_block_status`: Confirmar/cancelar/marcar en camino una cita existente
- `manage_all_schedule_blocks_for_date`: Gestionar TODAS las citas de un día
- `create_task`: Crear tarea administrativa
- `lookup_patient`: Buscar paciente existente
- `query_protocol`: Consultar protocolo por ID
- `query_knowledge_base`: Buscar semánticamente en protocols, FAQ, responseTemplates y rules cuando la respuesta no está ya en contexto

**TASKS-ONLY MODE — Tools permitidas:**
- `manage_schedule_block_status` (gestionar citas existentes)
- `manage_all_schedule_blocks_for_date`
- `create_task` (principal tool para escalamiento humano)
- `lookup_patient` (solo lectura)
- `query_protocol`
- `query_knowledge_base` (fallback semántico para preguntas informativas)
- **PROHIBIDAS:** `check_availability`, `schedule_block`, `resolve_availability_query`, `resolve_patient`, `resolve_professional`, `resolve_treatment`

### 3. Flujos de agendamiento por modo

**GENERAL INQUIRY — AMBOS MODOS:**
```text
Step 1: query_knowledge_base disponible.
Responder directamente si la información ya está en contexto; invocar la tool solo cuando falte la respuesta.
allowedTools: ["query_knowledge_base"]
```

**FULL MODE (patrón canónico — ver `_templates/base-full.json`):**
```
Nueva cita (new_appointment_scheduling, selection.excludedCapabilities: ["hasResolvedPatient"]):
  Step 1: resolve_treatment + resolve_availability_query (paralelos, required: [])
  Step 2: check_availability (con treatmentId + fechas, required: ["hasResolvedTreatment"])
  Step 3: resolve_patient (SOLO cuando el paciente elige slot, required: [])
  Step 4: schedule_block (required: ["hasResolvedPatient"])
  ⚠️ El paciente se identifica AL FINAL, no al principio. NO pedir datos personales antes de mostrar horarios.
  ⚠️ INVARIANTE ANTI-CIRCULAR: 'required' solo consume capabilities establecidas por steps ANTERIORES; un step NUNCA requiere lo que establece su propia tool (el validador lo rechaza como error bloqueante).

Reprogramar cita existente (existing_appointment_rescheduling, selection.requiredCapabilities: ["hasActiveAppointment"]):
  Step 1: resolve_availability_query (resolver nuevas fechas, NO cancelar todavía)
  Step 2: check_availability (buscar nuevos horarios)
  Step 3: schedule_block (agendar la nueva cita; la antigua se cancela automáticamente después)
```

**TASKS-ONLY MODE:**
```
Cualquier solicitud de agendamiento:
  Step 1: create_task (recopilar datos y crear tarea para equipo humano)
  ResponseTemplate: "Un miembro de nuestro equipo se pondrá en contacto a la mayor brevedad posible."
```

### 4. Reglas de steps
- `step`: número secuencial (1, 2, 3...)
- `tools`: array de strings (tool names)
- `parallel`: `true` solo si las tools no dependen entre sí
- `required`: array de **capability flags** que deben estar presentes para ejecutar este step. NUNCA tool names. Flags válidas: `hasResolvedTreatment`, `hasResolvedPatient`, `hasResolvedProfessional`, `hasShownSlots`, `hasSelectedSlot`, `hasCreatedAppointment`, `hasCreatedTask`, `hasResolvedAvailabilityQuery`. Ejemplo: `["hasResolvedPatient"]` en el step final de booking. Si no hay requirements, usar `[]`. **INVARIANTE TÉCNICO (bloqueante):** la flag solo puede CONSUMIRSE; debe haber sido establecida por tools de steps ANTERIORES (`resolve_treatment`→`hasResolvedTreatment`, `resolve_patient`/`lookup_patient`→`hasResolvedPatient`, `resolve_professional`→`hasResolvedProfessional`, `check_availability`→`hasShownSlots`, `schedule_block`→`hasCreatedAppointment`, `create_task`→`hasCreatedTask`, `resolve_availability_query`→`hasResolvedAvailabilityQuery`). Un step que requiere lo que su propia tool establece es una dependencia circular y bloquea el flow en runtime.
- `note`: explicación para el LLM de qué hacer en este step
- **NO usar `condition` dentro de steps.** El schema del backend solo permite: `step`, `tools`, `parallel`, `required`, `note`. Si un step tiene una condición (ej: "solo si tiene múltiples citas"), escríbela en el campo `note`.

**Ejemplo correcto (condición en note):**
```json
{
  "step": 2,
  "tools": ["create_task"],
  "parallel": false,
  "required": [],
  "note": "Crear tarea. Condición: solo si el paciente tiene múltiples citas el mismo día o presenta una queja."
}
```

- **Dependencias críticas (patrón canónico):**
  - `check_availability` DEBE ir antes de `schedule_block`
  - `resolve_availability_query` DEBE ir antes de `check_availability`
  - `resolve_patient` va en su **propio step anterior** a `schedule_block` (el paciente se identifica al elegir slot, no antes; `schedule_block` declara `required: ["hasResolvedPatient"]`). En bookings de paciente nuevo NO va en step 1.

### 5. responseTemplate
- **OBLIGATORIO** en flows que usan `manage_schedule_block_status`
- Opcional en otros flows
- Si presente, debe ser texto exacto que el bot usará (mode: "literal")
- Si ausente, el LLM genera respuesta natural (o usa fallback del backend)

### 6. allowedTools
- **Opcional pero recomendado**
- Lista explícita de tools que el LLM puede usar en ese flow
- Si presente, debe incluir EXACTAMENTE las tools del flow, ni más ni menos

## Anti-patrones a Evitar

❌ **Tasks-only con scheduling tools**: `check_availability` o `schedule_block` en modo tasks-only → ERROR CRÍTICO
❌ **Flow sin steps ni responseTemplate**: Un flow puede tener `steps: []` si tiene `responseTemplate` o `allowsSilence` (ej: inquiry flows o farewell). Si no tiene ninguno de los dos, el bot no sabrá cómo responder.
❌ **Step sin tools array**: Siempre debe ser array, incluso vacío `[]` para flows informativos
❌ **schedule_block sin resolve_patient previo**: Violación de dependencia
❌ **responseTemplate en flow informativo**: No es necesario, el LLM responde naturalmente
❌ **parallel=true con dependencias**: Si step 2 usa resultado de step 1, parallel debe ser false
❌ **`required` con tool names**: `required` debe contener capability flags (ej: `["hasResolvedPatient"]`) o `[]`, NUNCA nombres de tools como `["create_task"]` o `["manage_schedule_block_status"]` → BLOQUEA LA EJECUCIÓN DE TOOLS

## Ejemplo de Output Correcto (FULL MODE)

```json
{
  "new_appointment_scheduling": {
    "intent": "new_appointment_scheduling",
    "description": "El paciente (o alguien en su nombre) quiere reservar una NUEVA cita. Tambien incluye 'restablecer' una cita cancelada en este mismo turno de conversacion.",
    "selection": {
      "excludedCapabilities": ["hasResolvedPatient"]
    },
    "steps": [
      {
        "step": 1,
        "tools": ["resolve_treatment", "resolve_availability_query"],
        "parallel": true,
        "required": [],
        "note": "Identificar tratamiento y traducir fechas. NO pedir datos del paciente todavia."
      },
      {
        "step": 2,
        "tools": ["check_availability"],
        "parallel": false,
        "required": ["hasResolvedTreatment"],
        "note": "Buscar horarios con treatmentId + fechas (condicion: treatment_resolved)"
      },
      {
        "step": 3,
        "tools": ["resolve_patient"],
        "parallel": false,
        "required": [],
        "note": "Solo cuando el paciente elige un slot: resolver identidad (condicion: slot_selected)"
      },
      {
        "step": 4,
        "tools": ["schedule_block"],
        "parallel": false,
        "required": ["hasResolvedPatient"],
        "note": "Agendar solo cuando el paciente elige un slot y la identidad esta resuelta (condicion: patient_resolved && slot_selected)"
      }
    ]
  },
  "confirm_existing_appointment": {
    "intent": "existing_appointment_confirmation",
    "description": "El paciente confirma asistencia a una cita YA EXISTENTE: respondiendo a un recordatorio (IS_REMINDER_REPLY=true) o teniendo una cita activa en el contexto. NO usar cuando el bot acaba de PROPONER una hora nueva para agendar: en ese caso la intención es new_appointment_scheduling (continuar el agendamiento).",
    "selection": {
      "requiredCapabilities": ["hasActiveAppointment"]
    },
    "steps": [
      {
        "step": 1,
        "tools": ["manage_schedule_block_status"],
        "parallel": false,
        "required": [],
        "note": "Marcar CONFIRMADA cada cita del día. El gate determinista de selection impide activar este flow sin cita real (nunca confirmar aire)."
      }
    ],
    "responseTemplate": "Tu cita ha quedado confirmada. Te esperamos.",
    "responseTemplateMode": "literal",
    "allowedTools": ["manage_schedule_block_status"]
  }
}
```

## GATE DETERMINISTA DEL CICLO DE VIDA DE CITAS (OBLIGATORIO)

Los flujos que ACTÚAN sobre una cita existente SIEMPRE llevan `selection.requiredCapabilities: ["hasActiveAppointment"]`:

| Flow | Nombre (full) | Nombre (tasks-only) |
|------|---------------|---------------------|
| Confirmar | `confirm_appointment` | `confirm_existing_appointment` |
| Reagendar | `reschedule_appointment` | `reschedule_existing_appointment` |
| Cancelar | `cancel_appointment` | `cancel_existing_appointment` |
| Llegada tarde | `on_the_way` | `mark_on_the_way` |
| Mantener cita | `keep_appointment_flow` | `keep_appointment_flow` |

```json
"selection": { "requiredCapabilities": ["hasActiveAppointment"] }
```

- **Determinista y del backend:** la capability se computa de datos (bloque futuro no cancelado o link de recordatorio), NUNCA del LLM.
- **Sin cita real, el flow es inelegible por construcción:** un "sí" desnudo NUNCA produce acción ni mensaje falso ("He movido tu cita", "He cancelado tu cita", "¡Muchas gracias!", "tu cita sigue confirmada").
- **NO llevan gate** (no escriben): `reschedule_inquiry`, `cancellation_inquiry`. **NO se aplica** a flujos custom de clases (ej: Pilates — dominio distinto).
- **`existing_appointment_rescheduling` (descripción sin ambigüedad):** excluir explícitamente "el paciente elige una hora de las opciones que el bot acaba de ofrecer para una NUEVA cita" — eso es `new_appointment_scheduling` (continuar el agendamiento). Ejemplos válidos SOLO de mover cita existente: "muévela al jueves", "cámbiamela a la tarde", "adelántala una hora".
- **Fallback elegante:** cuando todos son inelegibles, el LLM responde conversacionalmente (puede usar la plantilla `no_appointments` si existe) — nunca afirma una acción que no ocurrió.
```

## Ejemplo de Output Correcto (TASKS-ONLY MODE)

```json
{
  "any_scheduling_request": {
    "intent": "new_appointment_scheduling",
    "description": "El paciente solicita agendar una nueva cita, reprogramar, o consultar disponibilidad. El bot NO agenda directamente: recopila datos y crea tarea para equipo humano.",
    "steps": [
      {
        "step": 1,
        "tools": ["create_task"],
        "parallel": false,
        "required": [],
        "note": "Recopilar nombre, apellidos, teléfono, tratamiento deseado, fechas/horarios preferidos, profesional si aplica, primera visita o paciente existente, y crear una tarea para que el equipo humano gestione el agendamiento."
      }
    ],
    "responseTemplate": "Un miembro de nuestro equipo se pondrá en contacto a la mayor brevedad posible. O si lo prefiere, puede llamar directamente al teléfono de la clínica.",
    "responseTemplateMode": "literal",
    "allowedTools": ["create_task"]
  }
}
```

## Checklist antes de entregar
- [ ] Un flow por cada intent que requiere acción
- [ ] En full mode: flows de booking con patrón canónico de 5 steps (entidades → disponibilidad → paciente → agenda al final; `selection` para distinguir nuevo/existente; SIN required circulares: un step nunca requiere lo que establece su propia tool)
- [ ] En tasks-only mode: NINGUNA scheduling tool (check_availability, schedule_block, etc.)
- [ ] responseTemplate presente en flows de manage_schedule_block_status
- [ ] allowedTools incluye exactamente las tools del flow (si se usa)
- [ ] Steps ordenados con dependencias correctas
- [ ] parallel=true solo cuando steps son independientes
- [ ] Notes explicativas para cada step
- [ ] **GATE ciclo de vida: los 5 flujos de acción sobre cita existente (confirm, reschedule, cancel, running-late, keep) llevan `selection.requiredCapabilities: ["hasActiveAppointment"]`**
- [ ] `existing_appointment_rescheduling` excluye "elegir hora de opciones propuestas para cita nueva" en su descripción
