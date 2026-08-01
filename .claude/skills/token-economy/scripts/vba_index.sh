#!/usr/bin/env bash
# Índice barato do módulo VBA: nome + linha de cada Sub/Function.
# Uso: vba_index.sh [arquivo.bas] [filtro]
# Ex.: vba_index.sh vba/AnaliseCKCP_OTIMIZADO.bas Gerar
set -euo pipefail
f="${1:-vba/AnaliseCKCP_OTIMIZADO.bas}"
q="${2:-}"
grep -nE '^[[:space:]]*(Public |Private )?(Sub|Function) ' "$f" \
  | sed -E 's/^([0-9]+):[[:space:]]*(Public |Private )?(Sub|Function) ([A-Za-z0-9_]+).*/\1\t\3 \4/' \
  | { [ -n "$q" ] && grep -i "$q" || cat; }
