# Instrucciones: Generar sección `responseTemplates`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca `# Reglas de Estilo`, `# Reglas de precio`, `# Operativa de Citas Existentes`
2. `scripts/prompts/generate-flows.md` — para saber qué flows usan responseTemplate
3. `_templates/base-<mode>.json` — templates base como referencia

## Reglas Obligatorias

### 1. Template por flow con responseTemplate
Si un flow tiene `responseTemplate`, DEBE existir una entrada en `responseTemplates` con esa key.

**Los templates también son parte de la knowledge base del bot.** El bot usa `query_knowledge_base` para buscar en los templates cuando no tiene la respuesta en contexto. Asegúrate de que los templates contengan información útil y completa, no solo placeholders genéricos.

### 2. Texto que refleja el TONO de la clínica
Lee los adjetivos de tone de la identidad y ajusta los mensajes:
- Si tone es "formal, elegante" → "Le confirmo que su cita ha quedado registrada."
- Si tone es "cercano, cálido" → "¡Perfecto! Tu cita está confirmada. Te esperamos con ganas."
- Si tone es "profesional, breve" → "Cita confirmada. Te esperamos."

### 3. Templates obligatorios (mínimo)
El backend REQUIERE estos 3 templates obligatorios:

| Template Key | Cuándo usar | Ejemplo |
|---|---|---|
| `information_not_available` | El bot no tiene la respuesta en contexto | "No tengo información sobre eso en este momento. ¿Quieres que lo consulte con el equipo?" |
| `out_of_scope` | El paciente pregunta algo fuera de la clínica | "Soy el asistente de {{CLINIC_NAME}} y solo puedo ayudarte con nuestros servicios, tratamientos y citas. ¿En qué puedo ayudarte?" |
| `farewell` | Despedida de la conversación | "Gracias por contactar con {{CLINIC_NAME}}. Si necesitas algo más, estamos aquí." |

Además, crea templates para cada flow que use `responseTemplate`:

| Template Key | Cuándo usar | Ejemplo Full | Ejemplo Tasks-Only |
|---|---|---|---|
| `greeting` | Saludo inicial | "¿En qué puedo ayudarle?" | "¿En qué puedo ayudarle?" |
| `confirmation` | Cita confirmada | "Tu cita ha quedado confirmada. Te esperamos." | "Tu cita ha quedado confirmada. Te esperamos." |
| `cancellation` | Cita cancelada | "Tu cita ha sido cancelada. Si deseas reprogramar, podemos ayudarte." | "Tu cita ha sido cancelada. Si deseas reprogramar, podemos ayudarte." |
| `no_appointments` | No hay citas | "No aparecen citas programadas. ¿Puedo ayudarte con algo más?" | Igual |
| `task_created` | Tarea creada | "Un miembro de nuestro equipo se pondrá en contacto contigo." | "Un miembro de nuestro equipo se pondrá en contacto a la mayor brevedad posible." (solo si el asesor configuró `create_task`) |

### 4. Templates adicionales para full mode
- `booking_options`: "He encontrado estas opciones: {options}. ¿Cuál prefieres?"
- `booking_confirmed`: "Tu cita ha quedado agendada para {fecha} a las {hora}. Te esperamos."

### 5. mode de template (REGLA BLOQUEANTE)
- `"literal"`: El bot usa el texto EXACTO (reemplazando variables si las hay)
- `"model"`: El LLM genera respuesta libre basada en el contexto
- Usa `"model"` obligatoriamente para respuestas conversacionales, informativas, de reserva/reprogramación, consultas, despedidas, mantener cita y tareas.
- Usa `"literal"` únicamente para respuestas operativas de una cita existente: confirmación, cancelación definitiva y aviso de llegada tarde/en camino, incluidos recordatorios.
- Esta regla aplica tanto a `responseTemplates.<key>.mode` como a `flow.responseTemplateMode`.
- Un template conversacional en `literal` es un error bloqueante: impide que la IA adapte la respuesta al contexto y puede producir respuestas rígidas o incorrectas.
- En una consulta informativa de reagendamiento, el texto debe pedir confirmación y nunca afirmar que la cita ya cambió.
- La cancelación por no asistencia debe confirmar solo la cancelación. La oferta de una cita nueva pertenece a la continuación posterior a la aceptación del paciente.
- En tasks-only, no presupongas que toda solicitud genera una tarea: el asesor puede elegir cancelación-only, cancelación + tarea, tarea-only o respuesta informativa sin acción.
- Los templates de recordatorio/confirmación y cancelación siguen sin cambios.

### 6. Variables (placeholders) en templates
El backend reemplaza automáticamente estos placeholders con datos reales de la operación:
- `{fecha}` → "sábado 10 de octubre"
- `{hora}` → "15:00"
- `{profesional}` → "Dra. Marta López"
- `{tratamiento}` → "Sesión de fisioterapia"
- `{options}` → lista de opciones (booking_options)
- `{citaCancelada}` → "sábado 10 de octubre a las 15:00" (solo en cancelación)

Las sedes pueden usar estos placeholders o NO usarlos. Ambos son válidos:
- Genérico: "Tu cita ha quedado confirmada. Te esperamos."
- Con placeholders: "Tu cita del {fecha} a las {hora} ha quedado confirmada."

## Anti-patrones a Evitar

❌ **Mensajes genéricos sin tono**: "Cita confirmada." → MAL (no refleja personalidad)
❌ **Emojis o markdown**: Los templates deben ser texto plano para WhatsApp
❌ **Mencionar tools o reglas**: "Usaré manage_schedule_block_status para confirmar" → NUNCA
❌ **Inventar datos**: No pongas "Te esperamos a las 10:00" si el template es genérico
❌ **Tasks-only prometiendo agendamiento**: "Tu cita ha quedado agendada" → MAL en tasks-only
❌ **IDs técnicos al paciente**: NUNCA incluir `blockId` (ej: `01KZH...`) en templates. Usar texto natural.

## Ejemplo de Output Correcto

```json
{
  "greeting": {
    "text": "¿En qué puedo ayudarle?",
    "mode": "literal"
  },
  "confirmation": {
    "text": "Perfecto, la cita está confirmada. Muchas gracias.",
    "mode": "literal"
  },
  "cancellation": {
    "text": "Tu cita ha sido cancelada. Si deseas reprogramar, podemos ayudarte.",
    "mode": "literal"
  },
  "no_appointments": {
    "text": "No aparecen citas programadas. ¿Puedo ayudarte con algo más?",
    "mode": "literal"
  },
  "task_created": {
    "text": "Para orientarle correctamente, prefiero pasar su caso al equipo médico para que lo revise con criterio profesional.",
    "mode": "literal"
  },
  "booking_options": {
    "text": "He encontrado estas opciones: [options]. ¿Cuál prefieres?",
    "mode": "model"
  },
  "booking_confirmed": {
    "text": "Tu cita ha quedado agendada para [date] a las [time]. Te esperamos.",
    "mode": "model"
  }
}
```

## Checklist antes de entregar
- [ ] Templates requeridos presentes: `information_not_available`, `out_of_scope`, `farewell`
- [ ] Un template por cada `responseTemplate` usado en flows
- [ ] Texto refleja el tono de la clínica (lee identity.tone)
- [ ] Tasks-only NO promete agendamiento directo
- [ ] Full mode tiene templates para booking (options, confirmed)
- [ ] Texto plano, sin markdown ni emojis
- [ ] Variables en formato [variable]
- [ ] Todos los templates conversacionales usan `mode: "model"`
- [ ] Solo confirmación, cancelación definitiva y llegada tarde/en camino usan `mode: "literal"`
- [ ] Los flows mantienen la misma política en `responseTemplateMode`
