# Agentes de Opencode para Clinicsay Builder

Estos son los **system instructions** (agentes) de opencode desktop que permiten generar instrucciones JSON para chatbots de clínicas.

## ¿Qué hay aquí?

| Archivo | Modo | Descripción |
|---|---|---|
| `builder-tasks-only.md` | Tasks-Only | Bot que NO agenda citas. Solo gestiona citas existentes y crea tareas para el equipo humano. |
| `builder-full.md` | Full | Bot que SÍ agenda citas reales automáticamente. |

---

## Requisitos previos

### Node.js (obligatorio)

El agente ejecuta scripts de validación (`validate-and-save.js`, `gap-detector.js`, `check-structure.js`) que requieren **Node.js**.

**Instalación recomendada con nvm-windows:**

1. Descarga nvm-windows desde: https://github.com/coreybutler/nvm-windows/releases
2. Instala `nvm-setup.exe`
3. Abre PowerShell como Administrador:
   ```powershell
   nvm install 20.11.0
   nvm use 20.11.0
   node --version  # Debe mostrar v20.11.0
   ```

> 📖 **Guía completa:** Lee la sección "Instala Node.js" en el `README.md` principal del repo.

---

## Instalación en Windows

### 1. Ubicación de los agentes

Opencode desktop en Windows lee los agentes desde:

```
%APPDATA%\opencode\agents\
```

Que normalmente se resuelve a:

```
C:\Users\<TuUsuario>\AppData\Roaming\opencode\agents\
```

> 💡 **Tip:** Puedes escribir `%APPDATA%` en la barra de direcciones del Explorador de Archivos para navegar directamente a esa carpeta.

### 2. Copiar los archivos

1. Abre el Explorador de Archivos.
2. Navega a `%APPDATA%\opencode\agents\` (créala si no existe).
3. Copia estos dos archivos desde el repo descargado:
   - `AGENTS\builder-tasks-only.md`
   - `AGENTS\builder-full.md`

**O usando PowerShell:**

```powershell
# Crear la carpeta si no existe
New-Item -ItemType Directory -Force -Path "$env:APPDATA\opencode\agents"

# Copiar los agentes (ajusta la ruta del repo según donde lo descargaste)
Copy-Item "C:\Users\<TuUsuario>\Downloads\instrucciones-clinicsay\AGENTS\builder-tasks-only.md" "$env:APPDATA\opencode\agents\"
Copy-Item "C:\Users\<TuUsuario>\Downloads\instrucciones-clinicsay\AGENTS\builder-full.md" "$env:APPDATA\opencode\agents\"
```

### 3. Verificar la instalación

Abre opencode desktop y ejecuta:

```
/list agents
```

Deberías ver:
- `builder-full`
- `builder-tasks-only`

### 4. Elegir el agente correcto

**¿Cuál usar?**

| Tu clínica tiene... | Usa |
|---|---|---|
| Agenda digital (Google Calendar, software de citas) | `builder-full` |
| No tiene agenda digital / prefiere control humano | `builder-tasks-only` |
| Solo captación de leads | `builder-tasks-only` |

### 5. Empezar a trabajar

Dentro de opencode desktop, selecciona el agente:

```
/select builder-tasks-only
```

O:

```
/select builder-full
```

Luego dile:

> "Hola, quiero generar instrucciones para mi-clinica"

El agente te guiará paso a paso.

---

## 🔄 Segunda pasada obligatoria (best practice)

> ⚠️ **IMPORTANTE:** Siempre que el agente genere el JSON de una clínica, **pídele explícitamente una segunda pasada** para verificar que no hay gaps entre el JSON generado y los archivos de input.

Después de que el agente entregue el JSON final, dile:

> "Por favor, haz una segunda pasada revisando todos los archivos de input para verificar que no haya información faltante o gaps en el JSON generado."

El agente ejecutará automáticamente:
1. Releerá todos los archivos de `input/`
2. Comparará contra el JSON generado
3. Detectará cualquier inconsistencia o dato faltante
4. Corregirá lo que sea necesario

**Nunca consideres una tarea terminada sin esta segunda verificación.**

---

## Solución de problemas

### "No veo los agentes en la lista"
- Verifica que los archivos estén en `%APPDATA%\opencode\agents\`
- Asegúrate de que tengan extensión `.md`
- Reinicia opencode desktop

### "Los archivos están pero no funcionan"
- Verifica que opencode tenga permisos para leer `%APPDATA%\opencode\`
- Prueba moverlos a `%LOCALAPPDATA%\opencode\agents\` si el anterior no funciona

---

## Actualización

Cuando haya nuevas versiones de estos agentes:
1. Descarga la última versión del repo
2. Sobrescribe los archivos en `%APPDATA%\opencode\agents\`
3. Reinicia opencode desktop
