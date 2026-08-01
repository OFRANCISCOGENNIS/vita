#!/usr/bin/env python3
"""Relatório real de consumo de tokens do Claude Code a partir dos transcripts
JSONL (~/.claude/projects/<projeto>/*.jsonl). Mostra tokens por modelo, custo de
cache, e os tool calls que mais despejaram conteúdo no contexto.

Uso: token_report.py [dir_ou_arquivo_jsonl] [--top N]
Sem argumento: usa o projeto atual (cwd) em ~/.claude/projects.
"""
import glob, json, os, sys

# USD por MTok (input, cache-read, cache-write 5m, output) — edite se os preços mudarem
PRICE = {
    "claude-fable-5":    (10.0, 1.0, 12.5, 50.0),
    "claude-opus-4-8":   (5.0, 0.5, 6.25, 25.0),
    "claude-opus-4-7":   (5.0, 0.5, 6.25, 25.0),
    "claude-sonnet-5":   (3.0, 0.3, 3.75, 15.0),
    "claude-sonnet-4-6": (3.0, 0.3, 3.75, 15.0),
    "claude-haiku-4-5":  (1.0, 0.1, 1.25, 5.0),
}

def cost_usd(model, m):
    for k, (pi, pcr, pcw, po) in PRICE.items():
        if model.startswith(k):
            return (m["inp"] * pi + m["cr"] * pcr + m["cw"] * pcw + m["out"] * po) / 1e6
    return None

def project_dir():
    slug = os.getcwd().replace("/", "-")
    return os.path.expanduser(f"~/.claude/projects/{slug}")

def iter_lines(paths):
    for p in paths:
        try:
            with open(p, encoding="utf-8") as f:
                for ln in f:
                    try:
                        yield json.loads(ln)
                    except json.JSONDecodeError:
                        pass
        except OSError:
            pass

def blob_len(x):
    if isinstance(x, str):
        return len(x)
    if isinstance(x, list):
        return sum(blob_len(i) for i in x)
    if isinstance(x, dict):
        return blob_len(x.get("text") or x.get("content") or "")
    return 0

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    top = 10
    if "--top" in sys.argv:
        top = int(sys.argv[sys.argv.index("--top") + 1])
    target = args[0] if args else project_dir()
    paths = [target] if os.path.isfile(target) else sorted(
        glob.glob(os.path.join(target, "*.jsonl")))
    if not paths:
        sys.exit(f"nenhum transcript em {target}")

    models, tools, results = {}, {}, []
    pending = {}  # tool_use_id -> (tool, resumo)
    for rec in iter_lines(paths):
        msg = rec.get("message") or {}
        u = msg.get("usage")
        if u:
            m = models.setdefault(msg.get("model", "?"),
                                  dict(inp=0, out=0, cr=0, cw=0, n=0))
            m["inp"] += u.get("input_tokens", 0)
            m["out"] += u.get("output_tokens", 0)
            m["cr"] += u.get("cache_read_input_tokens", 0)
            m["cw"] += u.get("cache_creation_input_tokens", 0)
            m["n"] += 1
        for c in (msg.get("content") or []) if isinstance(msg.get("content"), list) else []:
            t = c.get("type")
            if t == "tool_use":
                name = c.get("name", "?")
                tools[name] = tools.get(name, 0) + 1
                inp = c.get("input", {})
                hint = inp.get("file_path") or inp.get("command") or inp.get("pattern") or ""
                pending[c.get("id")] = (name, str(hint)[:70])
            elif t == "tool_result":
                name, hint = pending.pop(c.get("tool_use_id"), ("?", ""))
                results.append((blob_len(c.get("content")), name, hint))

    print(f"transcripts: {len(paths)}\n")
    print("== tokens por modelo (input não-cacheado / cache-read / cache-write / output / turnos)")
    total_usd = 0.0
    for k, m in sorted(models.items(), key=lambda kv: -kv[1]["inp"] - kv[1]["cw"]):
        c = cost_usd(k, m)
        extra = f"  ~US${c:,.2f}" if c is not None else ""
        total_usd += c or 0
        print(f"  {k}: in={m['inp']:,} cr={m['cr']:,} cw={m['cw']:,} out={m['out']:,} n={m['n']}{extra}")
    print(f"  TOTAL estimado: ~US${total_usd:,.2f}")

    print("\n== chamadas por tool")
    for k, v in sorted(tools.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}")

    print(f"\n== top {top} tool results mais pesados (chars ~= tokens*4)")
    for size, name, hint in sorted(results, reverse=True)[:top]:
        print(f"  {size:>9,} ch  {name}  {hint}")

    heavy = sum(s for s, _, _ in results if s > 20000)
    total = sum(s for s, _, _ in results) or 1
    print(f"\nresults >20k chars respondem por {100*heavy//total}% do volume de tool output.")
    print("Cada result pesado reentra no contexto de TODOS os turnos seguintes — corte na origem.")

if __name__ == "__main__":
    main()
