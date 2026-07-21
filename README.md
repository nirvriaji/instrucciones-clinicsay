# Clinicsay Instruction Builder

> **Generador conversacional de instrucciones JSON para chatbots de clínicas.**
> El asesor conversa con un agente de IA que lee las notas de la clínica y genera el JSON directamente.

---

## 📥 Instalación en Windows

### 1. Descarga este repo

Descarga y descomprime el repo en tu equipo, por ejemplo en:

```
C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay
```

### 2. Instala Node.js (requerido para los scripts de validación)

El agente ejecuta scripts de Node.js para validar el JSON generado. **Necesitas Node.js instalado.**

**Recomendado: usar nvm-windows (Node Version Manager)**

#### 2.1. Instalar nvm-windows

1. Descarga el instalador desde: https://github.com/coreybutler/nvm-windows/releases
2. Busca el archivo `nvm-setup.exe` en la última release y descárgalo.
3. Ejecuta el instalador y sigue los pasos (acepta las opciones por defecto).

#### 2.2. Instalar Node.js con nvm

Abre **PowerShell** o **CMD** como Administrador y ejecuta:

```powershell
# Instalar la versión LTS recomendada de Node.js
nvm install 20.11.0

# Usar esa versión
nvm use 20.11.0

# Verificar que está instalado
node --version   # Debe mostrar v20.11.0 o similar
npm --version    # Debe mostrar 10.x.x
```

> 💡 **¿Por qué nvm-windows?** Te permite cambiar entre versiones de Node.js fácilmente. Si algún script necesita una versión específica, puedes cambiar sin reinstalar todo.

#### 2.3. Verificar la instalación

Dentro de la carpeta del repo, ejecuta:

```powershell
cd C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay
node scripts/validate-and-save.js --sede demo --mode tasks-only
```

Si ves un mensaje de error tipo "JSON not found" o similar, significa que Node.js está funcionando correctamente (solo falta tener un JSON generado).

Si ves "node is not recognized", reinicia PowerShell/CMD o tu equipo.

---

### 3. Instala los agentes de opencode desktop

Los agentes son las "system instructions" que le dicen a la IA cómo generar el JSON.

**Ruta destino en Windows:**

```
%APPDATA%\opencode\agents\
```

Normalmente es:

```
C:\Users\<TuUsuario>\AppData\Roaming\opencode\agents\
```

**Para instalar:**

1. Abre el Explorador de Archivos.
2. Escribe `%APPDATA%\opencode\agents\` en la barra de direcciones (créala si no existe).
3. Copia estos dos archivos desde el repo descargado:
   - `AGENTS\builder-tasks-only.md`
   - `AGENTS\builder-full.md`

**O usando PowerShell (como Administrador):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:APPDATA\opencode\agents"
Copy-Item "C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay\AGENTS\builder-tasks-only.md" "$env:APPDATA\opencode\agents\"
Copy-Item "C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay\AGENTS\builder-full.md" "$env:APPDATA\opencode\agents\"
```

Verifica en opencode desktop con el comando:
```
/list agents
```

Deberías ver `builder-full` y `builder-tasks-only`.

> 📖 **¿Problemas?** Lee `AGENTS/README.md` para más detalles.

### 4. Elige tu modo

| Modo | Tu clínica tiene... |
|---|---|
| **`builder-full`** | Agenda digital (Google Calendar, software de citas). El bot agenda citas reales. |
| **`builder-tasks-only`** | No tiene agenda digital / prefiere control humano. El bot crea tareas para el equipo. |

En opencode desktop, selecciona el agente:
```
/select builder-tasks-only
```

---

## 🚀 Uso rápido

### Paso 1: Prepara tus notas

Crea la carpeta para tu clínica dentro del repo:

```
C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay\sedes\mi-clinica\input\
```

Coloca ahí tus archivos de notas. Puedes incluir:
- **Uno o varios archivos** `.md` (Markdown) con la información de la clínica
- **Archivos `.json`** con lógica estructurada previa (si la tienes)
- **Archivos `.txt`** con notas adicionales
- **Cualquier combinación** de los anteriores

El agente leerá **todos** los archivos de la carpeta `input/` automáticamente.

**Ejemplo:**
```
sedes\mi-clinica\input\
├── notas-principales.md   ← Notas principales
├── servicios.md           ← Info extra
└── logic-previa.json      ← JSON anterior (opcional)
```

Usa `sedes\demo\input\` como ejemplo de cómo organizar las notas.

### Paso 2: Inicia la conversación con el agente

Dile al agente:
> "Hola, quiero generar instrucciones para mi-clinica"

El agente hará:
1. **Leer** todos tus archivos de `input/` (`.md`, `.json`, `.txt`)
2. **Leer** la documentación de referencia (templates + prompts)
3. **Generar** el JSON completo paso a paso
4. **Validar** estructura y cross-references
5. **Detectar** gaps entre tus notas y el JSON
6. **Preguntarte** por datos faltantes
7. **Entregar** el JSON final validado

El agente te preguntará: **"¿Correcto? ¿Falta algo?"**

Tú apruebas o pides cambios en el chat.

### 🔄 Paso 3: Segunda pasada obligatoria (best practice)

> ⚠️ **IMPORTANTE:** Después de recibir el JSON, **siempre pídele al agente una segunda pasada** para verificar que no haya gaps entre el JSON generado y los archivos de input.

Dile explícitamente:
> "Por favor, haz una segunda pasada revisando todos los archivos de input para verificar que no haya información faltante o gaps en el JSON generado."

El agente:
1. Releerá todos los archivos de `input/`
2. Comparará contra el JSON generado
3. Detectará cualquier inconsistencia o dato faltante
4. Corregirá lo necesario y revalidará

**Nunca consideres una tarea terminada sin esta segunda verificación.**

### Paso 4: Copia el JSON generado

El JSON final estará en:
```
sedes\mi-clinica\output\structured-logic.json
```

---

## 📝 Cómo escribir tus notas

Puedes usar **uno o varios archivos** en la carpeta `input/`. Cada archivo puede tener el nombre que quieras y extensión `.md`, `.txt` o `.json`.

Usa `#` headers para organizar la información. Estas son las secciones recomendadas:

### `# Identidad`
- Nombre del bot, nombre de la clínica, tono, personalidad
- Qué puede y no puede hacer el bot
- Reglas de idioma

### `# Datos de Contacto`
- Dirección, teléfono, email, web
- Horario de apertura

### `# Reglas de Estilo`
- Reglas de saludo
- Tono y longitud de mensajes
- Política de emojis
- Reglas de detección de idioma

### `# Tratamientos y Servicios Disponibles`
- Lista de servicios/tratamientos
- Qué profesional realiza cada uno (si es específico)
- Cuáles se pueden agendar directamente
- Cuáles requieren revisión humana
- Señales/depósitos requeridos (si hay)

### `# Reglas de Agendamiento`
- Proceso de agendamiento
- Reglas de cancelación
- Pacientes nuevos vs existentes
- Manejo de emergencias

### `# Tratamientos donde No Mencionar Precio`
- Lista de tratamientos donde no se debe mencionar precio

### `# Situaciones que van a Tarea`
- Qué casos se derivan al equipo humano

### `# Datos Mínimos para Agendar`
- Datos requeridos antes de agendar

### `# Preguntas Frecuentes`
- Preguntas comunes y respuestas

---

## 🏗️ Arquitectura

```
Agente (LLM)                   Scripts (Node.js)
────────────────────────────────────────────────────
Lee archivos input/*.md          validate-and-save.js
Lee prompts/*.md               → valida schema
Genera JSON                    → checkea cross-references
Edita JSON directamente        → checkea modo
                               gap-detector.js
                               → compara notas vs JSON
                               → detecta info faltante
                               check-structure.js
                               → verifica completitud
```

**Regla:** El agente genera. Los scripts validan. Nunca al revés.

---

## 📁 Estructura del repo

```
instrucciones-clinicsay/
├── AGENTS/                          ← System instructions para opencode
│   ├── README.md                    ← Cómo instalar los agentes en Windows
│   ├── builder-full.md              ← Agente modo full
│   └── builder-tasks-only.md        ← Agente modo tasks-only
├── README.md                        ← Este archivo (manual del asesor)
├── structured-logic-standards.md    ← Estándares del dominio (referencia técnica)
├── scripts/
│   ├── prompts/                     ← Prompts modulares (8 guías)
│   │   ├── generate-identity.md
│   │   ├── generate-intents.md
│   │   ├── generate-flows.md
│   │   ├── generate-rules.md
│   │   ├── generate-templates.md
│   │   ├── generate-faq.md
│   │   ├── generate-protocols.md
│   │   └── README.md
│   ├── validate-and-save.js       ← Validador principal
│   ├── gap-detector.js            ← Detector de gaps
│   ├── check-structure.js         ← Verificador de estructura
│   └── lib/                        ← Librerías de soporte
├── _templates/
│   ├── base-full.json              ← Template estructural full
│   └── base-tasks-only.json        ← Template estructural tasks-only
└── sedes/
    ├── demo/
    │   ├── input/
    │   │   └── *.md / *.json / *.txt ← Ejemplo de notas
    │   └── output/                 ← Archivos generados aquí
    └── <tu-clinica>/
        ├── input/
        │   └── *.md / *.json / *.txt  ← Tus notas (tú creas esto)
        └── output/
            ├── structured-logic.json  ← Output final (agente genera esto)
            └── gaps.json              ← Reporte de gaps (scripts generan esto)
```

---

## ⚙️ Scripts (ejecución manual)

Normalmente el agente ejecuta estos scripts automáticamente, pero puedes correrlos manualmente si tienes Node.js instalado:

```bash
# Validar JSON y guardar como final
node scripts/validate-and-save.js --sede mi-clinica --mode tasks-only

# Detectar gaps entre anotaciones y JSON
node scripts/gap-detector.js --sede mi-clinica --mode tasks-only

# Verificar estructura completa
node scripts/check-structure.js --sede mi-clinica
```

---

## 🔀 Full vs Tasks-Only

| Característica | Full | Tasks-Only |
|---|---|---|
| Agenda citas reales | ✅ Sí | ❌ No |
| Consulta disponibilidad | ✅ Sí | ❌ No |
| Confirma/cancela existentes | ✅ Sí | ✅ Sí |
| Crea tareas | ✅ Sí | ✅ Sí |
| Recomendado para | Clínicas con agenda digital | Clínicas sin agenda / control humano |

---

## 🆘 Solución de problemas

### "No encuentro anotaciones"
El agente te explicará el formato esperado y esperará a que crees las notas.

### Errores de validación
El agente te los explicará en español. Causas comunes:
- Falta un intent requerido (ej. `scheduling_request`)
- Un flow referencia un intent que no existe en el catálogo
- Modo tasks-only usando tools de scheduling

### Gap detection
El agente preguntará cosas como:
- "Detecté que Endolift menciona 'Dr. Pablo García' en tus notas pero no en el JSON. ¿Es correcto?"
- "Hay una señal de 30€ mencionada. ¿Aplica siempre o solo para pacientes nuevos?"

---

## 📄 Licencia

Internal use only — Clinicsay project.
