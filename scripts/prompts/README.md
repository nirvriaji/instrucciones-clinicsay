# Prompts Modulares del Clinicsay Builder

## Qué son

Los prompts modulares son **instrucciones detalladas** que el agente LLM lee antes de generar cada sección del JSON. Son el "cerebro" de la generación — le dicen al agente CÓMO generar contenido de alta calidad.

## Arquitectura

```
Agente → Lee todos los archivos en sedes/<nombre>/input/ + generate-<section>.md → Genera JSON → Scripts validan
```

## Lista de Prompts

| Archivo | Sección del JSON | Qué instruye |
|---|---|---|
| `generate-identity.md` | `identity` | Cómo extraer datos de contacto, tono, persona |
| `generate-intents.md` | `intents` | Cómo crear catálogo semántico con profesionales y restricciones |
| `generate-flows.md` | `toolOrchestration.flows` | Cómo mapear intents a flows con tools correctas por modo |
| `generate-rules.md` | `rules` | Cómo crear reglas de negocio (allow/block) con condiciones |
| `generate-templates.md` | `responseTemplates` | Cómo generar mensajes que reflejen el tono de la clínica |
| `generate-faq.md` | `faq` | Cómo extraer preguntas frecuentes de los archivos de input |
| `generate-protocols.md` | `protocols` | Cómo identificar y crear protocolos de tratamiento |

## Cuándo editar estos prompts

**Edita un prompt modular cuando:**
- Quieres cambiar cómo se genera una sección (ej: "ahora los intents deben incluir precios")
- Descubres un nuevo anti-patrón que el agente comete
- Necesitas agregar una nueva regla de negocio

**NO edites el prompt del agente principal** (`builder-full.md` / `builder-tasks-only.md`) para cambios de generación — edita estos prompts modulares.

## Estructura de cada prompt

Todos siguen el mismo formato:

```markdown
# Instrucciones: Generar sección `X`

## Qué debes leer antes de empezar
- Lista de archivos de referencia

## Reglas Obligatorias
1. Regla 1
2. Regla 2
...

## Anti-patrones a Evitar
❌ MAL: ...
✅ BIEN: ...

## Ejemplo de Output Correcto
```json
...
```

## Checklist antes de entregar
- [ ] ...
```

## Flujo de trabajo del agente

1. **Lectura**: El agente lee el prompt modular ANTES de generar la sección
2. **Generación**: El agente aplica las reglas del prompt + datos de todos los archivos en sedes/<nombre>/input/
3. **Checklist**: El agente verifica que cumplió todas las reglas del checklist
4. **Validación**: Scripts verifican que el output es válido

## Ejemplo práctico

**Asesor tiene:** "Valoración de Endolift con Dr. Pablo García (gestionar señal de 30 € siempre)"

**generate-intents.md le dice al agente:**
> "Si el servicio tiene profesional asignado, menciónalo en la descripción"
> "Si tiene restricciones (señal, valoración obligatoria), inclúyelas"

**Resultado:**
```json
"endolift_evaluation_inquiry": {
  "description": "El paciente pregunta por Endolift, un tratamiento de láser fibra exclusivo del Dr. Pablo García que requiere señal de reserva de 30€ y valoración médica previa.",
  "examples": ["¿qué es el endolift?", "precio de endolift"]
}
```

## Añadir nuevos prompts

Para añadir una nueva sección al JSON:
1. Crear `scripts/prompts/generate-<seccion>.md`
2. Seguir la estructura estándar (Reglas, Anti-patrones, Ejemplo, Checklist)
3. Actualizar `builder-full.md` y `builder-tasks-only.md` para que el agente lea el nuevo prompt
