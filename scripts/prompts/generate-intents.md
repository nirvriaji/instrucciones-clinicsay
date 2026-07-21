# Instrucciones: Generar sección `intents`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca `# Tratamientos y Servicios Disponibles`, `# Reglas de Agendamiento`, `# Situaciones que van a Tarea`
2. `_templates/base-<mode>.json` — usa los baseline intents como base
3. `structured-logic-standards.md` — sección "Intent Catalog" y "Baseline Intents"
4. `scripts/prompts/generate-flows.md` — para alinear intents con flows

## Reglas Obligatorias

### 1. Baseline Intents (SIEMPRE presentes)
Crea exactamente estos 6 intents como mínimo:

| ID | Descripción |
|---|---|
| `appointment_confirmation` | El paciente confirma asistencia a una cita ya reservada, normalmente respondiendo a un recordatorio con un afirmativo breve. |
| `appointment_cancellation` | El paciente cancela una cita existente o indica que no podrá asistir. |
| `appointment_inquiry` | El paciente pregunta por citas que ya tiene reservadas (horarios, fechas, tratamientos). La información ya está en el contexto. |
| `scheduling_request` | El paciente quiere reservar una NUEVA cita o consultar disponibilidad. |
| `general_inquiry` | Preguntas generales sobre la clínica: horarios, ubicación, contacto, precios fijos, servicios. |
| `human_follow_up` | Solicitudes que requieren seguimiento humano y no encajan en los intents anteriores. |

### 2. Intents adicionales por modo
**Si `mode === 'full'`:**
- `appointment_reschedule_request`: El paciente quiere MOVER una cita ya agendada a otra fecha u hora.
- `patient_running_late`: El paciente avisa que llegará tarde a una cita confirmada.

### 3. Intents por servicio
Por cada servicio/tratamiento mencionado en `# Tratamientos y Servicios Disponibles`:
- Crea intent `${servicio}_inquiry` donde `servicio` es el nombre en snake_case inglés
- La descripción debe ser SEMÁNTICA (describir QUÉ quiere el paciente y CUÁNDO aplica)
- Si el servicio tiene profesional asignado, menciónalo en la descripción
- Si el servicio tiene restricciones (señal, solo valoración, no pacientes nuevos), menciónalas

### 4. Ejemplos
Incluye 2-3 ejemplos realistas por intent. Los ejemplos son frases que un paciente real enviaría por WhatsApp.

### 5. IDs
- Usa `snake_case` en inglés para los IDs
- Ejemplo: "Valoración de Endolift" → `endolift_evaluation_inquiry`
- Ejemplo: "Limpieza facial" → `facial_cleansing_inquiry`

### 6. Descripciones semánticas
- Describe el OBJETIVO del paciente, no keywords
- Menciona contexto relevante (profesional, restricciones, requisitos)
- Usa español natural

## Anti-patrones a Evitar

❌ **Keyword salad**: "El paciente dice 'quiero cita', 'agendar', 'reservar'" → MAL
✅ **Semántica**: "El paciente quiere reservar una NUEVA cita o consultar disponibilidad" → BIEN

❌ **Genérico**: "El paciente pregunta por endolift" → MAL
✅ **Contextual**: "El paciente pregunta por Endolift, un tratamiento exclusivo del Dr. Pablo García que requiere señal de reserva de 30€" → BIEN

❌ **Omitir profesionales**: Si los archivos de input dicen "Endolift con Dr. Pablo García", el intent DEBE mencionarlo

❌ **Omitir restricciones**: Si hay "solo mañanas", "requiere señal", "no pacientes nuevos", incluir en descripción

❌ **IDs en español**: `consulta_inquiry` → MAL (debe ser `consultation_inquiry` o similar)

## Ejemplo de Output Correcto

```json
{
  "appointment_confirmation": {
    "description": "El paciente confirma asistencia a una cita ya reservada, normalmente respondiendo a un recordatorio con un afirmativo breve.",
    "examples": ["confirmo", "ahí estaré", "sí, asistiré"]
  },
  "endolift_evaluation_inquiry": {
    "description": "El paciente pregunta por Endolift, un tratamiento de láser fibra exclusivo del Dr. Pablo García que requiere señal de reserva de 30€ y valoración médica previa.",
    "examples": ["¿qué es el endolift?", "precio de endolift", "quiero información del tratamiento endolift"]
  },
  "ultraformer_mpt_inquiry": {
    "description": "El paciente pregunta por ULTRAFORMER MPT, un tratamiento de ultrasonido focalizado. En pacientes nuevos requiere señal de reserva de 150€.",
    "examples": ["¿qué es el ultraformer?", "precio de ultraformer mpt", "¿cuánto cuesta el ultraformer?"]
  },
  "facial_cleansing_inquiry": {
    "description": "El paciente pregunta por limpieza facial o microdermoabrasión, tratamientos estéticos que puede realizar Natalia o Victoria. Permite agendamiento directo incluso en pacientes nuevos.",
    "examples": ["quiero limpieza facial", "¿hacéis microdermoabrasión?", "precio de limpieza de cara"]
  }
}
```

## Checklist antes de entregar
- [ ] 6 baseline intents presentes con descriptions semánticas
- [ ] Si full mode: appointment_reschedule_request y patient_running_late incluidos
- [ ] Un intent por cada servicio mencionado en los archivos de input
- [ ] Descripción menciona profesional asignado si existe
- [ ] Descripción menciona restricciones relevantes (señal, valoración obligatoria, etc.)
- [ ] 2-3 ejemplos realistas por intent
- [ ] IDs en snake_case inglés
- [ ] Descripciones en español natural, no keyword salad
- [ ] Ningún intent inventado que no esté en los archivos de input
