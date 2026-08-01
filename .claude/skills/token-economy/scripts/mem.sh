#!/usr/bin/env bash
# Memória de trabalho em disco (LLM-OS: contexto = RAM cara; disco = barato).
# Destila fatos/decisões para .claude/MEMORY.md; dedup automático e teto de linhas.
# Uso: mem.sh add "fato curto" | mem.sh get [filtro] | mem.sh clear
set -euo pipefail
M="${MEM_FILE:-.claude/MEMORY.md}"
CAP="${MEM_CAP:-100}"
case "${1:-get}" in
  add)
    shift
    line="- $*"
    grep -qxF "$line" "$M" 2>/dev/null && { echo "(duplicado, ignorado)"; exit 0; }
    printf '%s\n' "$line" >> "$M"
    n=$(wc -l < "$M")
    [ "$n" -gt "$CAP" ] && echo "AVISO: $M com $n linhas (teto $CAP) — destile/apague notas velhas." >&2
    ;;
  get)  [ -f "$M" ] && { [ -n "${2:-}" ] && grep -i "$2" "$M" || cat "$M"; } || echo "(vazia)";;
  clear) : > "$M";;
  *) echo "uso: mem.sh add|get|clear" >&2; exit 1;;
esac
