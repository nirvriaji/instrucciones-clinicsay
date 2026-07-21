# Instrucciones: Generar sección `rules`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca `# Reglas de Agendamiento`, `# Situaciones que van a Tarea`, `# Tratamientos donde No Mencionar Precio`
2. `structured-logic-standards.md` — sección "Rules are Filters, Never Executors"
3. Los intents ya generados — cada rule DEBE referenciar un intent existente

## Reglas Obligatorias

### 0. Schema compliance — propiedades prohibidas
- **NO generar `products` ni `shipping` como propiedades top-level.** Fueron eliminados del schema del backend. La información de productos, envíos, precios de catálogo, métodos de pago, etc. debe ir en:
  - `responseTemplates` (respuestas predefinidas con precios)
  - `faq` (preguntas frecuentes sobre productos/envíos)
  - `protocols` (guías de tratamiento que mencionen productos)
  - `rules` o `intents` (reglas de negocio sobre productos)

### 1. Regla por intent
Cada intent del catálogo DEBE tener al menos una rule asociada. El array `rules` NUNCA puede estar vacío.

### 2. action SOLO "allow" o "block"
- `"allow"`: El bot procede con el flow asociado al intent
- `"block"`: El bot rechaza la solicitud sin ejecutar el flow
- **NUNCA** usar otras acciones (create_task, redirect, etc. en rules)

### 3. Estructura de cada rule
```json
{
  "id": "identificador_unico_snake_case",
  "intent": "nombre_del_intent",
  "description": "Descripción semántica de CUÁNDO aplica esta regla",
  "action": "allow|block",
  "conditionLogic": null,
  "conditions": null,
  "reason": null,
  "message": null,
  "protocolId": null,
  "requiredFields": null,
  "note": null,
  "priority": null,
  "hidePrice": null,
  "redirectToTask": null,
  "informOnly": null
}
```

### 4. Descripción semántica
Describe en lenguaje natural CUÁNDO se activa esta regla:
- ❌ MAL: "El paciente dice 'cancelar'"
- ✅ BIEN: "El paciente comunica que no podrá asistir a una cita ya reservada y solicita anularla"

### 5. Rules especiales por modo y contexto

**Tasks-only mode:**
- `scheduling_request`: `action: "allow"`, `redirectToTask: true` (obligatorio)

**Full mode:**
- `scheduling_request`: `action: "allow"`, `redirectToTask: null` (el bot agenda directamente)

**Reglas de negocio de los archivos de input:**
Si las los archivos de input mencionan restricciones específicas, CREA rules con `conditions`:
- Ejemplo: "No agendar los viernes" → rule con `conditions: [{ field: "day_of_week", operator: "not_in", value: ["friday"] }]`
- Ejemplo: "Pacientes nuevos solo valoración" → rule con `conditions` que verifique tipo de paciente
- Ejemplo: "Menores de edad → tarea" → rule con `conditions` que verifique edad

### 6. conditions (opcional pero potente)
Solo usar si las los archivos de input tienen reglas explícitas:
```json
{
  "field": "day_of_week",
  "operator": "not_in",
  "value": ["friday"],
  "negated": null,
  "note": "La clínica no agenda citas los viernes"
}
```
Operadores permitidos: `"equals"`, `"in"`, `"not_in"`, `"gt"`, `"lt"`, `"gte"`, `"lte"`, `"contains"`, `"exists"`

### 7. Campos opcionales
- `hidePrice`: `true` si el intent es de un tratamiento donde NO se menciona precio (según los archivos de input)
- `priority`: **OBLIGATORIO como número entero ≥ 0.** NUNCA usar `null`. Número mayor = mayor prioridad (para ordenar evaluación). Valor por defecto: `0`.
- `note`: Explicación interna para el asesor

## Anti-patrones a Evitar

❌ **Array vacío**: `rules: []` → ROMPE el sistema. Mínimo 1 rule por intent.
❌ **Info fragmentada**: La información de precios, catálogo, reglas debe ir en `protocols` y `faq`, no solo en `rules`. El bot usa `query_knowledge_base` para buscar en esas secciones. Si la info solo está en `rules`, el bot no la encontrará para responder preguntas informativas.
❌ **Action inválido**: `"create_task"`, `"redirect"`, `"message"` en action
❌ **Rule sin description**: Cada rule DEBE tener description semántica
❌ **Rule con intent inexistente**: Si `intent: "foo"`, `"foo"` debe estar en el catálogo
❌ **Lógica de negocio en rules**: No pongas "crear tarea" en una rule. Eso va en el flow.
❌ **Ignorar restricciones de los archivos de input**: Si dice "no los viernes", créale una rule

## Ejemplo de Output Correcto

```json
[
  {
    "id": "ask_about_existing_appointment",
    "intent": "appointment_inquiry",
    "description": "El paciente consulta información sobre citas que ya tiene reservadas, como horarios, fechas o tratamientos programados.",
    "action": "allow",
    "priority": 0,
    "note": "El backend inyecta las citas del paciente en el system prompt (ASSOCIATED_PATIENTS). El bot responde sin llamar tools."
  },
  {
    "id": "confirm_existing_appointment",
    "intent": "appointment_confirmation",
    "description": "El paciente confirma asistencia a una cita existente con un afirmativo breve o respondiendo a un recordatorio.",
    "action": "allow",
    "priority": 0,
    "note": "Permitir continuar para ejecutar manage_schedule_block_status (CONFIRMADA)."
  },
  {
    "id": "cancel_existing_appointment",
    "intent": "appointment_cancellation",
    "description": "El paciente solicita cancelar una o más citas existentes, o responde a un recordatorio indicando que no asistirá.",
    "action": "allow",
    "priority": 0,
    "note": "Permitir continuar para ejecutar el flow de cancelación."
  },
  {
    "id": "scheduling_request",
    "intent": "scheduling_request",
    "description": "El paciente solicita una nueva cita, reprogramar una cita existente, o consultar disponibilidad.",
    "action": "allow",
    "priority": 0,
    "redirectToTask": false,
    "note": "En full mode, el bot agenda directamente. En tasks-only, redirectToTask debe ser true."
  },
  {
    "id": "endolift_no_fridays",
    "intent": "scheduling_request",
    "description": "El paciente solicita agendar Endolift. Esta regla aplica restricciones específicas del tratamiento.",
    "action": "block",
    "priority": 0,
    "conditions": [
      {
        "field": "treatment_name",
        "operator": "equals",
        "value": "endolift",
        "note": "Endolift tiene restricciones especiales"
      }
    ],
    "reason": "Endolift requiere valoración médica previa con el Dr. Pablo García y señal de 30€",
    "note": "Si el paciente solicita Endolift, redirigir a tarea o valoración"
  }
]
```

## Checklist antes de entregar
- [ ] Al menos 1 rule por cada intent del catálogo
- [ ] NINGUNA rule con action diferente de "allow" o "block"
- [ ] Cada rule tiene `description` semántica
- [ ] Cada `intent` referenciado existe en el catálogo
- [ ] En tasks-only: `scheduling_request` tiene `redirectToTask: true`
- [ ] Reglas de negocio de los archivos de input convertidas a rules con conditions si aplica
- [ ] `hidePrice: true` para intents de tratamientos donde no se menciona precio
- [ ] **`priority` es un número entero ≥ 0 en TODAS las rules. NUNCA `null`.**
- [ ] Array `rules` no está vacío
