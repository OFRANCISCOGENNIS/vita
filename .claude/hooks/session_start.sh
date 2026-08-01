#!/usr/bin/env bash
# SessionStart: injeta contexto mínimo e útil — memória destilada + índice do .bas.
# Sai barato: só cabeçalhos, nunca conteúdo bruto.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
echo "=== token-economy: contexto inicial mínimo ==="
if [ -s .claude/MEMORY.md ]; then
  echo "--- MEMORY.md (fatos destilados; use mem.sh) ---"
  head -40 .claude/MEMORY.md
fi
f=vba/AnaliseCKCP_OTIMIZADO.bas
if [ -f "$f" ]; then
  n=$(grep -cE '^[[:space:]]*(Public |Private )?(Sub|Function) ' "$f")
  echo "--- $f: $(wc -l < "$f") linhas, $n rotinas. NÃO leia inteiro; use vba_index.sh / vba_sub.sh ---"
fi
exit 0
