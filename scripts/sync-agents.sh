#!/usr/bin/env bash
#
# sync-agents.sh — Instala/actualiza los agentes builder en el directorio
# global de agentes de opencode.
#
# Uso:
#   bash scripts/sync-agents.sh [directorio-destino]
#
# Destino por defecto (Linux/macOS):
#   ~/.config/opencode/agents/
#
# Windows:
#   Este script necesita Git Bash o WSL. Alternativamente, usa los comandos
#   PowerShell documentados en AGENTS/README.md
#   (destino: %APPDATA%\opencode\agents\).
#
# Nota: los prompts de los agentes localizan la raíz del repo dinámicamente
# (bloque "⚠️ RUTA DEL REPO"), por lo que NO hace falta editar rutas dentro
# de los archivos copiados — la misma copia sirve en cualquier máquina.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$HOME/.config/opencode/agents}"

mkdir -p "$TARGET"
cp "$ROOT/AGENTS/builder-full.md" "$ROOT/AGENTS/builder-tasks-only.md" "$TARGET/"

echo "✅ Agentes sincronizados → $TARGET"
echo "   - builder-full.md"
echo "   - builder-tasks-only.md"
echo "   Los prompts localizan la raíz del repo dinámicamente; no hace falta editar rutas."
echo "⚠️  Reinicia opencode para cargar los cambios (los agentes se cargan al arrancar)."
