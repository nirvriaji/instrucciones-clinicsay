# Instrucciones: Generar sección `identity`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca la sección `# Identidad` y `# Datos de Contacto`
2. `_templates/base-<mode>.json` — usa la estructura del campo `identity` como scaffold
3. `structured-logic-standards.md` — sección "Identity" si existe

## Reglas Obligatorias

1. **botName**: Extrae el nombre del bot de la primera línea de `# Identidad`.
   - Ejemplo: "Eres Ana, asistente virtual..." → botName = "Ana"
   - Si no está claro, usa "Asistente"

2. **clinicName**: Extrae el nombre completo de la clínica.
   - Ejemplo: "Clínica Martínez-Boné" → clinicName = "Clínica Martínez-Boné"
   - Si no está claro, usa "La Clínica"

3. **address, phone, email, website, openingHours**: Extrae de `# Datos de Contacto`.
   - Si alguno falta, usa `null` (no inventes)

4. **language**: Detecta idioma principal.
   - Si los archivos de input dicen "español de España" → "es"
   - Si mencionan inglés/portugués como alternativas → "auto"

5. **persona**: Resume el rol del bot en 1 frase.
   - Ejemplo: "Asistente virtual de Clínica Martínez-Boné para atención por WhatsApp"

6. **tone**: Extrae los adjetivos de tono de `# Identidad` o `# Reglas de Estilo`.
   - Ejemplo: "profesional, cercano, elegante, claro y prudente"
   - Usa exactamente los adjetivos que aparecen en las los archivos de input

7. **escalationMessage**: Mensaje cuando el bot deriva a humano.
   - Full mode: "Te paso con atención humana."
   - Tasks-only mode: "Un miembro de nuestro equipo se pondrá en contacto contigo."
   - Si los archivos de input tienen mensaje específico de escalamiento, úsalo.

8. **welcomeMessage, farewellMessage**: `null` si no aparecen en los archivos de input.

9. **socialLinks**: Si hay redes sociales, DEBE ser array de objetos:
   ```json
   [
     {"platform": "instagram", "url": "@ECOBABY_5D"},
     {"platform": "facebook", "url": "@ecobaby5dmalaga"}
   ]
   ```
   - NUNCA objeto plano: `{"instagram": "...", "facebook": "..."}` ❌
   - Si no hay redes sociales en los archivos de input, usar `null`

10. **additionalContacts**: Si hay contactos adicionales, DEBE ser array de objetos:
    ```json
    [
      {"type": "whatsapp", "value": "711 20 94 44", "label": null},
      {"type": "address", "value": "C. San Isidro, 12...", "label": "Sede Granada"}
    ]
    ```
    - NUNCA objeto plano: `{"whatsapp": "...", "granadaAddress": "..."}` ❌
    - Si no hay contactos adicionales en los archivos de input, usar `null`

## Anti-patrones a Evitar

❌ **Objetos planos para socialLinks/additionalContacts**: El backend rechaza objetos planos. Usa arrays de objetos con estructura exacta.

❌ NO inventes datos de contacto que no estén en los archivos de input
❌ NO uses "Clínica Demo" o placeholders genéricos
❌ NO omitas el tone si aparece en las los archivos de input
❌ NO pongas strings vacíos ("") — usa `null` si falta

## Ejemplo de Output Correcto

```json
{
  "botName": "Ana",
  "clinicName": "Clínica Martínez-Boné",
  "address": "C. Tendaleras, 22, 21001 Huelva",
  "phone": "633 662 617",
  "email": "clinica@martinez-bone.com",
  "website": "https://martinez-bone.com/",
  "openingHours": "Lunes, martes y jueves: 09:00-14:00 y 16:00-19:00. Miércoles: 09:00-19:00 continuo. Viernes: 09:00-14:00.",
  "language": "es",
  "persona": "Asistente virtual de Clínica Martínez-Boné para atención por WhatsApp",
  "tone": "profesional, cercano, elegante, claro y prudente",
  "welcomeMessage": null,
  "farewellMessage": null,
  "escalationMessage": "Te paso con atención humana.",
  "socialLinks": null,
  "additionalContacts": null
}
```

## Checklist antes de entregar
- [ ] `botName` extraído exacto de los archivos de input
- [ ] `clinicName` extraído exacto de los archivos de input
- [ ] Datos de contacto (address, phone, email, website) solo si aparecen en los archivos de input
- [ ] `tone` refleja los adjetivos reales de la clínica
- [ ] `escalationMessage` apropiado para el modo (full/tasks-only)
- [ ] Campos faltantes son `null`, no strings vacíos ni inventados
