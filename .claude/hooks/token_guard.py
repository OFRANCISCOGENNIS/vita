#!/usr/bin/env python3
"""PreToolUse guard da skill token-economy: bloqueia chamadas que despejam
conteúdo demais no contexto. Exit 2 = bloqueia (stderr vira feedback)."""
import json, os, re, sys

LIMIT_LINES = 200   # arquivo maior que isso exige Read com offset/limit
MAX_READ = 300      # limit máximo aceito num Read de arquivo grande

def lines_of(path):
    try:
        with open(path, "rb") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0

def main():
    data = json.load(sys.stdin)
    tool = data.get("tool_name", "")
    ti = data.get("tool_input", {})

    if tool == "Read":
        p = ti.get("file_path", "")
        if p.endswith((".png", ".jpg", ".jpeg", ".pdf", ".ipynb")):
            return
        n = lines_of(p)
        if n > LIMIT_LINES and not ti.get("limit"):
            sys.stderr.write(
                f"[token-economy] {os.path.basename(p)} tem {n} linhas. "
                f"Use Grep para localizar e Read com offset/limit (<= {MAX_READ}).")
            sys.exit(2)
        if n > LIMIT_LINES and ti.get("limit", 0) > MAX_READ:
            sys.stderr.write(
                f"[token-economy] limit={ti['limit']} alto demais para arquivo de "
                f"{n} linhas. Reduza para <= {MAX_READ} ou refine com Grep.")
            sys.exit(2)

    elif tool == "Bash":
        cmd = ti.get("command", "")
        if re.search(r"(^|[;&|]\s*)cat\s+[^|>]*$", cmd):
            sys.stderr.write(
                "[token-economy] 'cat' sem filtro despeja o arquivo inteiro no "
                "contexto. Use o tool Read (com limit) ou pipe para head/grep.")
            sys.exit(2)
        if re.search(r"(^|[;&|]\s*)(grep|find)\s", cmd):
            sys.stderr.write(
                "[token-economy] Use os tools Grep/Glob (saída paginada) em vez "
                "de grep/find no Bash.")
            sys.exit(2)

if __name__ == "__main__":
    main()
