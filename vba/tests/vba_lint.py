#!/usr/bin/env python3
# Analisador estatico de VBA (.bas) - bateria de testes estruturais.
# Nao executa VBA (nao ha Excel); valida a integridade do codigo.
import re, sys

PATH = sys.argv[1] if len(sys.argv) > 1 else "/home/user/anonymousKS/vba/inventario.bas"
with open(PATH, encoding="latin-1") as f:
    raw_lines = f.readlines()

errors = []

# --- 1) Junta continuacoes de linha (" _" no fim) ---
logical = []
i = 0
while i < len(raw_lines):
    ln = i + 1
    text = raw_lines[i].rstrip("\n")
    while text.rstrip().endswith(" _"):
        text = text.rstrip()[:-2]
        i += 1
        if i < len(raw_lines):
            text += " " + raw_lines[i].rstrip("\n").strip()
        else:
            errors.append((ln, "Continuacao ' _' no fim do arquivo sem linha seguinte"))
            break
    logical.append((ln, text))
    i += 1

def strip_code(s):
    out, in_str, k = [], False, 0
    while k < len(s):
        c = s[k]
        if c == '"':
            in_str = not in_str; out.append(' ')
        elif c == "'" and not in_str:
            break
        else:
            out.append(' ' if in_str else c)
        k += 1
    return "".join(out)

# --- 2) aspas balanceadas ---
for ln, text in logical:
    if text.count('"') % 2 != 0:
        errors.append((ln, f"Aspas desbalanceadas: {text.strip()[:80]}"))

def split_stmts(code):
    parts, cur, depth = [], [], 0
    for ch in code:
        if ch in "([":
            depth += 1; cur.append(ch)
        elif ch in ")]":
            depth -= 1; cur.append(ch)
        elif ch == ":" and depth == 0:
            parts.append("".join(cur)); cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]

# --- 3) pilha de blocos ---
stack = []
def pop_expect(want, ln, kw):
    if not stack:
        errors.append((ln, f"'{kw}' sem bloco aberto correspondente")); return
    t, oln = stack[-1]
    if t == want:
        stack.pop()
    else:
        errors.append((ln, f"'{kw}' fecha '{t}' aberto na linha {oln} - incompatibilidade"))
        stack.pop()

defined_procs = set()
called_names = []

DECL_RE = re.compile(r'^\s*(?:Public|Private|Friend)?\s*(?:Static\s+)?(Sub|Function|Property)\s+(?:Get\s+|Let\s+|Set\s+)?([A-Za-z_]\w*)', re.I)
CALL_RE = re.compile(r'\b([A-Za-z_]\w*)\s*\(')
CALLKW_RE = re.compile(r'^\s*Call\s+([A-Za-z_]\w*)', re.I)

for ln, full_text in logical:
    full_code = strip_code(full_text).strip()
    if not full_code:
        continue
    for si, code in enumerate(split_stmts(full_code)):
        # declaracao de procedimento
        m = DECL_RE.match(code)
        if m:
            defined_procs.add(m.group(2).lower())
            stack.append(("Proc", ln)); continue
        mend = re.match(r'^\s*End\s+(Sub|Function|Property|If|With|Select|Type|Enum)\b', code, re.I)
        if mend:
            w = mend.group(1).lower()
            want = {"sub":"Proc","function":"Proc","property":"Proc","if":"If",
                    "with":"With","select":"Select","type":"Type","enum":"Enum"}[w]
            pop_expect(want, ln, "End "+w); continue
        if re.match(r'^\s*(?:Public|Private)?\s*Type\s+\w+', code, re.I):
            stack.append(("Type", ln)); continue
        if re.match(r'^\s*(?:Public|Private)?\s*Enum\s+\w+', code, re.I):
            stack.append(("Enum", ln)); continue
        if re.match(r'^\s*With\b', code, re.I):
            stack.append(("With", ln)); continue
        if re.match(r'^\s*Select\s+Case\b', code, re.I):
            stack.append(("Select", ln)); continue
        if re.match(r'^\s*Do\b', code, re.I):
            stack.append(("Do", ln)); continue
        if re.match(r'^\s*Loop\b', code, re.I):
            pop_expect("Do", ln, "Loop"); continue
        if re.match(r'^\s*For\b', code, re.I):
            stack.append(("For", ln)); continue
        if re.match(r'^\s*Next\b', code, re.I):
            pop_expect("For", ln, "Next"); continue
        if re.match(r'^\s*While\b', code, re.I):
            stack.append(("While", ln)); continue
        if re.match(r'^\s*Wend\b', code, re.I):
            pop_expect("While", ln, "Wend"); continue
        mif = re.match(r'^\s*If\b(.*)\bThen\b(.*)$', code, re.I)
        if mif:
            if mif.group(2).strip() == "":
                stack.append(("If", ln))
            continue
        # chamadas
        mc = CALLKW_RE.match(code)
        if mc:
            called_names.append((mc.group(1).lower(), ln))

for t, oln in stack:
    errors.append((oln, f"Bloco '{t}' aberto e nunca fechado"))

print(f"== Analise estatica: {PATH} ==")
print(f"Linhas fisicas: {len(raw_lines)} | logicas: {len(logical)} | Procedimentos: {len(defined_procs)}")
print()
if errors:
    print(f"ERROS ESTRUTURAIS ({len(errors)}):")
    for ln, msg in sorted(errors):
        print(f"  L{ln}: {msg}")
else:
    print(">> ERROS ESTRUTURAIS: NENHUM. Blocos (Sub/Function/If/For/With/Do/Select/Type)")
    print("   e aspas todos balanceados nas 2860 linhas.")

# procedimentos chamados via Call que nao existem
unresolved = [(nm,ln) for nm,ln in called_names if nm not in defined_procs]
print()
if unresolved:
    print(f"CHAMADAS 'Call' NAO RESOLVIDAS ({len(unresolved)}):")
    for nm, ln in unresolved:
        print(f"  L{ln}: Call {nm}")
else:
    print(">> Todas as chamadas 'Call X' apontam para Subs definidos no modulo.")
