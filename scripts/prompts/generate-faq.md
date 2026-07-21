# Instrucciones: Generar sección `faq`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca `# Preguntas Frecuentes` o `# FAQ`
2. Cualquier otra sección donde haya preguntas y respuestas explícitas

## Reglas Obligatorias

### 1. Extraer FAQ de los archivos de input
Busca la sección `# Preguntas Frecuentes` o `# FAQ` en todos los archivos en sedes/<nombre>/input/. Cada línea que empiece con `-` o `*` y contenga una pregunta (terminada en `?`) es un candidato.

### 2. Formato de cada FAQ entry
```json
{
  "question": "Pregunta exacta del paciente",
  "answer": "Respuesta clara y concisa",
  "condition": null
}
```

### 3. Respuestas
- Deben ser respuestas DIRECTAS, no evasivas
- Si la respuesta depende de contexto, dejar como texto genérico
- NO inventar información no presente en los archivos de input
- Si no sabes la respuesta exacta, usa un placeholder o `null`
- **Las FAQ son parte de la knowledge base del bot.** El bot usa `query_knowledge_base` para buscar en las FAQ cuando el paciente hace preguntas informativas. Cada pregunta/respuesta debe ser COMPLETA porque el bot la usará para responder directamente.

### 4. Preguntas mínimas (si no hay FAQ en los archivos de input)
Si el asesor no incluyó FAQ, genera estas 3 básicas:
- "¿Dónde están ubicados?"
- "¿Cuál es el horario de atención?"
- "¿Qué tratamientos ofrecen?"

### 5. condition (opcional)
Usar si la respuesta aplica solo en ciertas condiciones:
- Ejemplo: condition: "is_new_patient" → respuesta diferente para pacientes nuevos
- Si no aplica, usar `null`

## Anti-patrones a Evitar

❌ **Respuestas vacías**: Si hay pregunta, debe haber respuesta
❌ **Inventar respuestas**: Si los archivos de input no tienen la respuesta, no la inventes
❌ **Formato incorrecto**: question debe terminar en `?`
❌ **Preguntas sin respuesta**: Si la pregunta está en los archivos de input pero sin respuesta, usa `"Respuesta no especificada en los archivos de input."`

## Ejemplo de Output Correcto

```json
[
  {
    "question": "¿Dónde está la clínica?",
    "answer": "En C. Tendaleras, 22, 21001 Huelva, justo enfrente del parking del Mercado del Carmen.",
    "condition": null
  },
  {
    "question": "¿Horario de atención?",
    "answer": "Lunes, martes y jueves 09:00-14:00 y 16:00-19:00; miércoles 09:00-19:00 continuo; viernes 09:00-14:00.",
    "condition": null
  },
  {
    "question": "¿Valoración de medicina estética?",
    "answer": "La primera cita de valoración tiene un coste de 50 €, que se deducen del posterior tratamiento en caso de realizarse. Incluye de cortesía un diagnóstico facial avanzado con Observ520X y rutina dermocosmética personalizada.",
    "condition": null
  }
]
```

## Checklist antes de entregar
- [ ] Todas las preguntas de todos los archivos en sedes/<nombre>/input/ están incluidas
- [ ] Cada pregunta tiene respuesta (no vacía)
- [ ] Respuestas extraídas exactas de los archivos de input (no inventadas)
- [ ] Si no hay FAQ en los archivos de input, al menos 3 genéricas
- [ ] condition es null o tiene valor válido
