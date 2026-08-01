#!/usr/bin/env python3
"""PreToolUse guard da skill token-economy: bloqueia chamadas que despejam
conteúdo demais no contexto. Exit 2 = bloqueia (stderr vira feedback)."""
import json, os, re, sys, tempfile

LIMIT_LINES = 200    # arquivo maior que isso exige Read com offset/limit
MAX_READ = 300       # limit máximo aceito num Read de arquivo grande
MAX_SLICES = 6       # leituras fatiadas do mesmo arquivo grande antes de barrar

def lines_of(path):
    try:
        with open(path, "rb") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0

def slice_count(path, bump=True):
    """Conta Reads fatiados por arquivo (detecta leitura serial do arquivo todo)."""
    state = os.path.join(tempfile.gettempdir(), "token_guard_reads.json")
    try:
        d = json.load(open(state))
    except Exception:
        d = {}
    d[path] = d.get(path, 0) + (1 if bump else 0)
    try:
        json.dump(d, open(state, "w"))
    except OSError:
        pass
    return d[path]

def block(msg):
    sys.stderr.write("[token-economy] " + msg)
    sys.exit(2)

def main():
    data = json.load(sys.stdin)
    tool = data.get("tool_name", "")
    ti = data.get("tool_input", {})

    if tool == "Read":
        p = ti.get("file_path", "")
        if p.endswith((".png", ".jpg", ".jpeg", ".pdf", ".ipynb")):
            return
        n = lines_of(p)
        if n > LIMIT_LINES:
            if not ti.get("limit"):
                block(f"{os.path.basename(p)} tem {n} linhas. Use Grep para "
                      f"localizar e Read com offset/limit (<= {MAX_READ}).")
            if ti.get("limit", 0) > MAX_READ:
                block(f"limit={ti['limit']} alto demais para arquivo de {n} "
                      f"linhas. Reduza para <= {MAX_READ} ou refine com Grep.")
            if slice_count(p) > MAX_SLICES:
                block(f"{MAX_SLICES}+ leituras fatiadas de {os.path.basename(p)} "
                      "nesta sessão — você está lendo o arquivo inteiro em partes. "
                      "Use vba_sub.sh/vba_index.sh ou delegue ao subagente Explore.")

    elif tool == "Grep":
        if not ti.get("head_limit") and ti.get("output_mode") == "content":
            block("Grep de conteúdo sem head_limit pode despejar 250 linhas. "
                  "Adicione head_limit (<= 30) ou use files_with_matches antes.")
        if (ti.get("-C") or 0) + (ti.get("-A") or 0) + (ti.get("-B") or 0) > 10:
            block("Contexto de Grep grande demais (>10 linhas por match). "
                  "Localize a linha e use Read com offset/limit.")

    elif tool == "Bash":
        cmd = ti.get("command", "")
        if re.search(r"(^|[;&|]\s*)cat\s+[^|>]*$", cmd):
            block("'cat' sem filtro despeja o arquivo inteiro no contexto. "
                  "Use o tool Read (com limit) ou pipe para head/grep.")
        if re.search(r"(^|[;&|]\s*)(grep|find)\s", cmd):
            block("Use os tools Grep/Glob (saída paginada) em vez de grep/find no Bash.")

if __name__ == "__main__":
    main()
