#!/usr/bin/env bash
# Statusline do Claude Code: modelo + custo da sessão em US$ + contexto usado.
# Recebe JSON no stdin; torna a economia VISÍVEL a cada turno.
exec python3 -c '
import json, sys
d = json.load(sys.stdin)
model = d.get("model", {}).get("display_name", "?")
cost = (d.get("cost") or {}).get("total_cost_usd")
ctx = d.get("context_window") or {}
used = ctx.get("used_tokens") or ctx.get("context_used_tokens")
parts = [f"🤖 {model}"]
if cost is not None:
    parts.append(f"💸 US${cost:.2f}")
if used:
    parts.append(f"🧠 {used//1000}k ctx")
print("  ".join(parts))
'
