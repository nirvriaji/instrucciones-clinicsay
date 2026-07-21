# Instrucciones: Generar sección `protocols`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca secciones que mencionen "protocolo", "primera visita", "procedimiento", "guía de tratamiento"
2. `structured-logic-standards.md` — sección "Protocol"

## Reglas Obligatorias

### 1. ¿Qué es un protocolo?
Un protocolo es una guía de tratamiento que se activa cuando el paciente menciona un tratamiento específico. Incluye:
- `name`: Nombre del protocolo
- `description`: Qué incluye, duración, requisitos
- `responseTemplate`: Texto inyectado en el system prompt cuando se activa
- `sections`: Lista de secciones del protocolo (opcional)

### 2. Cuándo crear protocols
Solo si las los archivos de input mencionan protocolos explícitos:
- "Primera visita requiere..."
- "Protocolo de implantes: valoración + 3D + planificación"
- "Tratamiento de Endolift requiere sesión previa de fotografía y consentimiento"

### 3. Formato
```json
{
  "protocol_id": {
    "name": "Nombre del protocolo",
    "description": "Descripción detallada de qué incluye el protocolo",
    "responseTemplate": "Texto COMPLETO que el bot usará para responder. Debe incluir TODA la información relevante: precios, condiciones, pasos, restricciones.",
    "sections": ["Regla 1", "Regla 2", "Regla 3"]
  }
}
```

**CRÍTICO — `responseTemplate` es la fuente de verdad del bot:**
- El bot usa la tool `query_knowledge_base` para buscar en los protocolos cuando el paciente hace preguntas informativas.
- Por eso, `responseTemplate` debe ser COMPLETO, no un resumen. Incluye: precios, duración, condiciones, pasos, ejemplos de respuesta.
- `sections` debe incluir las reglas de negocio explícitas (ej: "Si semanas < 8, ofrecer X", "Precio 59€ para 14-17 semanas").
- Si la info está incompleta, el bot no podrá responder correctamente.

**RESTRICCIÓN DEL SCHEMA DEL BACKEND:**
- Un protocolo SOLO puede tener: `name`, `description`, `responseTemplate`, `sections`
- **NO incluir `rules` dentro de protocolos.** El backend rechazará el JSON si un protocolo contiene `rules`.
- Si hay reglas de negocio asociadas a un protocolo (ej: "si semanas < 8, ofrecer X"), deben ir en el array `rules` global del JSON, NO dentro del objeto del protocolo.

### 4. Si NO hay protocolos en los archivos de input
Generar objeto vacío: `{}`
NO inventes protocolos que no existan.

## Anti-patrones a Evitar

❌ **Inventar protocolos**: Si los archivos de input no mencionan protocolos, no los crees
❌ **Confundir con FAQ**: Un protocolo NO es una pregunta frecuente
❌ **responseTemplate vacío**: Si hay protocolo, responseTemplate debe tener contenido

## Ejemplo de Output Correcto

```json
{
  "first_visit_protocol": {
    "name": "Primera visita de valoración",
    "description": "Protocolo para pacientes nuevos que solicitan valoración médica estética. Incluye diagnóstico facial con Observ520X y rutina dermocosmética personalizada.",
    "responseTemplate": "En su primera visita realizaremos un diagnóstico facial avanzado con Observ520X y le entregaremos una rutina dermocosmética personalizada. El coste de la valoración es de 50€, que se deducen del tratamiento si lo realiza.",
    "sections": ["Recepción y anamnesis", "Diagnóstico con Observ520X", "Propuesta de tratamiento personalizado", "Rutina dermocosmética"]
  }
}
```

## Checklist antes de entregar
- [ ] Solo protocols que aparecen explícitamente en los archivos de input
- [ ] Cada protocolo tiene name, description, responseTemplate
- [ ] responseTemplate no está vacío si existe el protocolo
- [ ] Si no hay protocolos: objeto vacío `{}`
