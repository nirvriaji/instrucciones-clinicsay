# scripts/lib — Librerías del repo

Esta carpeta contiene las librerías que usan los scripts de validación y diagnóstico.

---

## Estructura

```
scripts/lib/
├── backend-source/     ← Mirror del backend (context codebase)
├── backend-validator/  ← Réplica funcional del validador (se usa con scripts)
└── schemas/            ← Esquemas JSON exportados
```

---

## backend-source/ — Context codebase del módulo del chatbot

**Qué es:** Mirror exacto del código fuente del módulo del chatbot del backend, importado manualmente.

**Para qué sirve:** Cuando un lead presenta un comportamiento inesperado (ej. no agenda, crea tarea en lugar de cita, responde fuera de contexto), los agentes pueden leer este código para compararlo con el JSON de producción de la clínica y determinar:

- ¿El problema está en el **JSON de la clínica** (error de configuración)?
- ¿El problema está en el **código del backend** (bug del sistema)?

**Archivos incluidos:**
- `validators/` — Lógica de validación del JSON
- `domain/chat/` — Tipos, intents canónicos, tool definitions
- `application/chat/use-cases/RunToolCycle/tool-call-policy.ts` — Política de tools en runtime
- `structured-logic-json-schema.ts` — Schema que valida el JSON
- `canonical-intents.ts` — Intents canónicos del sistema

**Quién lo mantiene:** Solo el administrador del sistema, ejecutando `sync-backend.sh`. Los asesores no lo tocan.

---

## backend-validator/ — Réplica funcional del validador

**Qué es:** Versión adaptada del validador del backend, con imports normalizados, que usan los scripts de validación locales.

**Para qué sirve:** Validar los JSONs de clínicas antes de entregarlos. Se usa con:
- `scripts/validate-and-save.js`
- `scripts/lib/backend-validator/run-validation.ts`

**Quién lo mantiene:** Solo el administrador del sistema. Los asesores no lo tocan.

---

## schemas/

**Qué es:** Schemas JSON exportados del backend (`structured-logic-schema.json`).

**Para qué sirve:** Referencia técnica del schema de `structuredLogic`. Se genera con un comando manual (ver `README.md` raíz).

---

## Cuándo usar cada carpeta

| Tarea | Carpeta a usar |
|---|---|
| Validar JSON de clínica antes de entregar | `backend-validator/` |
| Investigar por qué un lead se comportó raro | `backend-source/` |
| Entender el schema del JSON | `schemas/` |

---

## Reglas para asesores

- **NO modifiques** nada en `backend-source/` ni `backend-validator/`
- Si necesitas que se actualice el código del backend importado, pide al administrador que ejecute `sync-backend.sh`
- Si el validador local no detecta un error pero el backend lo rechaza, reporta al administrador — no intentes corregirlo tú
