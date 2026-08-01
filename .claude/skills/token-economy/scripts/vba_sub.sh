#!/usr/bin/env bash
# Extrai só o corpo de uma Sub/Function do módulo VBA (evita ler o arquivo inteiro).
# Uso: vba_sub.sh NomeDaRotina [arquivo.bas]
set -euo pipefail
name="$1"
f="${2:-vba/AnaliseCKCP_OTIMIZADO.bas}"
awk -v n="$name" '
  $0 ~ "(Sub|Function) " n "[( ]" {p=1}
  p {print NR"\t"$0}
  p && /^[[:space:]]*End (Sub|Function)/ {exit}
' "$f"
