#!/usr/bin/env bash
# Loop nocturno de Faro: lanza iteraciones de Claude Code hasta .loop/DONE, máx. iteraciones u hora límite.
# Uso:  cd faro && bash scripts/overnight.sh
set -u

MAX_ITER=${MAX_ITER:-60}
MAX_TURNS=${MAX_TURNS:-120}
DEADLINE_HHMM=${DEADLINE_HHMM:-0730}   # hora Bogotá en que se detiene
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .loop/logs

# Instala la config de Claude Code del proyecto (permisos + subagente reviewer)
mkdir -p .claude/agents
[ -f .claude/settings.json ] || cp setup/claude/settings.json .claude/settings.json
[ -f .claude/agents/reviewer.md ] || cp setup/claude/agents/reviewer.md .claude/agents/reviewer.md

if [ ! -d .git ]; then
  git init -q -b main
  printf "node_modules\n.next\n.env*.local\n.env\n.loop/logs\nartifacts/tmp\n.pglite\n" > .gitignore
  git add -A && git commit -qm "chore: initial spec and loop protocol"
fi

i=0
while [ $i -lt "$MAX_ITER" ]; do
  i=$((i+1))
  now=$(TZ=America/Bogota date +%H%M)
  today=$(TZ=America/Bogota date +%Y-%m-%d)
  if [ "$today" = "2026-10-17" ] && [ "$now" -ge "$DEADLINE_HHMM" ] && [ "$now" -lt 1200 ]; then
    echo "Hora límite alcanzada ($now). Deteniendo."; break
  fi
  if [ -f .loop/DONE ]; then echo "DONE encontrado. Fin."; break; fi

  echo "=== Iteración $i · $(TZ=America/Bogota date) ===" | tee -a .loop/logs/runner.log
  claude -p "$(cat .loop/PROMPT.md)" \
    --max-turns "$MAX_TURNS" \
    --output-format text \
    > ".loop/logs/iter-$(printf %02d $i).log" 2>&1
  code=$?
  echo "Iteración $i terminó con código $code" | tee -a .loop/logs/runner.log
  tail -n 3 .loop/PROGRESS.log 2>/dev/null | tee -a .loop/logs/runner.log
  sleep 5
done
echo "Loop terminado tras $i iteraciones." | tee -a .loop/logs/runner.log
