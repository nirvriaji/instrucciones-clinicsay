# Instrucciones: Generar sección `toolOrchestration.flows`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca `# Reglas de Agendamiento`, `# Solicitudes de Agendamiento`, `# Reprogramación y cancelación`
2. `_templates/base-<mode>.json` — usa los flows del template como base
3. `scripts/prompts/generate-intents.md` — para alinear flows con intents existentes
4. `structured-logic-standards.md` — sección "Flows y Steps"

## Reglas Obligatorias

### 1. Un flow por intent crítico
Cada intent que requiere acción del bot DEBE tener al menos un flow:
- `appointment_confirmation` → flow de confirmación
- `appointment_cancellation` → flow de cancelación
- `appointment_inquiry` → flow de consulta (sin tools)
- `scheduling_request` → flow de agendamiento (modo dependiente)
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

**FULL MODE:**
```
Nuevo paciente:
  Step 1: resolve_patient (obligatorio)
  Step 2: resolve_treatment + resolve_professional + resolve_availability_query (paralelos si no dependen)
  Step 3: check_availability (requiere fechas resueltas)
  Step 4: schedule_block (requiere paciente + disponibilidad)

Paciente existente:
  Step 1: lookup_patient + resolve_treatment + resolve_professional
  Step 2: resolve_availability_query
  Step 3: check_availability
  Step 4: schedule_block
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
- `required`: array de **capability flags** (features booleanas) que deben estar activas para permitir este step. NUNCA tool names. Ejemplo: `["scheduling"]` si el step requiere que la clínica tenga scheduling activo. Si no hay requirements de capabilities, usar `[]`.
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

- **Dependencias críticas:**
  - `resolve_patient` DEBE ir antes de `schedule_block`
  - `check_availability` DEBE ir antes de `schedule_block`
  - `resolve_availability_query` DEBE ir antes de `check_availability`

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
❌ **Flow sin steps**: Cada flow debe tener al menos 1 step
❌ **Step sin tools array**: Siempre debe ser array, incluso vacío `[]` para flows informativos
❌ **schedule_block sin resolve_patient previo**: Violación de dependencia
❌ **responseTemplate en flow informativo**: No es necesario, el LLM responde naturalmente
❌ **parallel=true con dependencias**: Si step 2 usa resultado de step 1, parallel debe ser false
❌ **`required` con tool names**: `required` debe contener capabilities booleanas (ej: `["scheduling"]`) o `[]`, NUNCA nombres de tools como `["create_task"]` o `["manage_schedule_block_status"]` → BLOQUEA LA EJECUCIÓN DE TOOLS

## Ejemplo de Output Correcto (FULL MODE)

```json
{
  "new_patient_booking": {
    "intent": "scheduling_request",
    "description": "Paciente SIN historial previo que quiere reservar su primera sesión o consulta. Requiere creación de paciente antes de agendar.",
    "steps": [
      {
        "step": 1,
        "tools": ["resolve_patient"],
        "parallel": false,
        "required": [],
        "note": "Crear o identificar paciente. Obligatorio antes de agendar."
      },
      {
        "step": 2,
        "tools": ["resolve_treatment", "resolve_professional", "resolve_availability_query"],
        "parallel": true,
        "required": [],
        "note": "Identificar tratamiento (obligatorio), profesional (opcional) y convertir fecha natural a concreta."
      },
      {
        "step": 3,
        "tools": ["check_availability"],
        "parallel": false,
        "required": [],
        "note": "Consultar disponibilidad con los parámetros resueltos."
      },
      {
        "step": 4,
        "tools": ["schedule_block"],
        "parallel": false,
        "required": [],
        "note": "Crear la cita con el slot elegido. Solo después de check_availability."
      }
    ]
  },
  "confirm_existing_appointment": {
    "intent": "appointment_confirmation",
    "description": "El paciente confirma asistencia a una cita existente, especialmente como respuesta a un recordatorio.",
    "steps": [
      {
        "step": 1,
        "tools": ["manage_schedule_block_status"],
        "parallel": false,
        "required": [],
        "note": "Marcar CONFIRMADA cada cita del día."
      }
    ],
    "responseTemplate": "Tu cita ha quedado confirmada. Te esperamos.",
    "responseTemplateMode": "literal",
    "allowedTools": ["manage_schedule_block_status"]
  }
}
```

## Ejemplo de Output Correcto (TASKS-ONLY MODE)

```json
{
  "any_scheduling_request": {
    "intent": "scheduling_request",
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
- [ ] En full mode: flows de booking con secuencia correcta (resolve → check → schedule)
- [ ] En tasks-only mode: NINGUNA scheduling tool (check_availability, schedule_block, etc.)
- [ ] responseTemplate presente en flows de manage_schedule_block_status
- [ ] allowedTools incluye exactamente las tools del flow (si se usa)
- [ ] Steps ordenados con dependencias correctas
- [ ] parallel=true solo cuando steps son independientes
- [ ] Notes explicativas para cada step
