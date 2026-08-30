# Clínica Demo Salud

## Identidad
- **Nombre:** Clínica Demo Salud
- **Dirección:** Calle Ficticia 123, 28001 Madrid
- **Teléfono:** +34 600 123 456
- **Email:** hola@clinicademo.es
- **Horario:** Lunes a viernes 08:30 - 21:00, Sábados 09:00 - 14:00

## Servicios
- Fisioterapia general: 40€/sesión, bono 3 sesiones 110€
- Osteopatía: 50€/sesión
- Indiba: 45€/sesión

## Profesionales
- Dra. Marta López (fisioterapia, osteopatía)
- Dr. Carlos Ruiz (fisioterapia, Indiba)

## Políticas
- Cancelación con 24h de antelación
- Pagos: efectivo, tarjeta, Bizum, transferencia
- Cuenta bancaria: ES33 2100 2274 60 0100766156

## FAQs
- ¿Cuánto cuesta una sesión? → 40€, bono 3x110€
- ¿Dónde estáis? → Calle Ficticia 123, Madrid
- ¿Qué formas de pago aceptáis? → Efectivo, tarjeta, Bizum, transferencia
- ¿Tenéis bonos? → Sí, bono de 3 sesiones por 110€

## Tono de voz
- Cercano, profesional, breve
- Sin emojis ni markdown
- Siempre en español

## Configuración didáctica reflejada en output

Los outputs de esta sede muestran también configuración del contrato actual del backend, aunque no son datos de la clínica: `maxVisibleSlots` limita los huecos visibles, `globalSchedulingPolicies` expresa los minutos de inicio permitidos y `treatmentSelectionGuidance` orienta al orquestador sobre cómo aclarar la petición del paciente. La guía se inyecta en el prompt del orquestador, no en `resolve_treatment`.

Formato conceptual, sin IDs de base de datos:

```text
maxVisibleSlots: 4
globalSchedulingPolicies: [{ treatmentId: null, allowedStartMinutes: [0, 30] }]
treatmentSelectionGuidance: "distinguir paciente nuevo/existente y valoración/tratamiento usando solo el catálogo"
```

En la policy, `treatmentId: null` representa la regla global de esta sede demo. Una policy particular con un `treatmentId` real tendría prioridad sobre ella; si no hay configuración, el default es `0, 5, ..., 55`. El output full documenta además el orden seguro de booking y reagendamiento, mientras que tasks-only muestra el uso de `create_task` y que la tarea posterior a una cancelación es opcional.
