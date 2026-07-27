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

# --- 4) Escopo por procedimento: declaracao duplicada e uso antes do Dim ---
# Reproduz dois erros de compilacao do VBA que a analise de blocos nao pega:
#   "Declaracao duplicada no escopo atual" e "Variavel nao definida".
PARAM_SPLIT = re.compile(r'^\s*(?:Optional\s+)?(?:ByVal\s+|ByRef\s+|ParamArray\s+)?([A-Za-z_]\w*)', re.I)
DIM_RE = re.compile(r'(?:^|[^A-Za-z_.])(?:Dim|Const|Static)\s+([A-Za-z_]\w*)', re.I)
USE_RE = re.compile(r'(?<![A-Za-z0-9_.])([A-Za-z_]\w*)(?![A-Za-z0-9_])')

def parse_params(sig):
    k = sig.find("(")
    if k < 0:
        return []
    depth, end = 0, -1
    for j in range(k, len(sig)):
        if sig[j] == "(":
            depth += 1
        elif sig[j] == ")":
            depth -= 1
            if depth == 0:
                end = j; break
    if end < 0:
        return []
    inner, parts, cur, d = sig[k+1:end], [], [], 0
    for ch in inner:
        if ch in "([":
            d += 1; cur.append(ch)
        elif ch in ")]":
            d -= 1; cur.append(ch)
        elif ch == "," and d == 0:
            parts.append("".join(cur)); cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    names = []
    for p in parts:
        mp = PARAM_SPLIT.match(p)
        if mp:
            names.append(mp.group(1))
    return names

scope_errors = []
cur_proc = None      # (nome, linha, {var_lower: linha}, [linhas do corpo])
for ln, full_text in logical:
    code = strip_code(full_text).strip()
    if not code:
        continue
    m = DECL_RE.match(code)
    if m and cur_proc is None:
        declared = {}
        for pname in parse_params(code):
            declared[pname.lower()] = (ln, "parametro")
        cur_proc = [m.group(2), ln, declared, []]
        continue
    if re.match(r'^\s*End\s+(Sub|Function|Property)\b', code, re.I) and cur_proc:
        name, pln, declared, body = cur_proc
        # uso antes do Dim (VBA: "Variavel nao definida" sob Option Explicit)
        for bln, bcode in body:
            if re.match(r'^\s*(Dim|Const|Static)\b', bcode, re.I):
                continue
            for mu in USE_RE.finditer(bcode):
                lv = mu.group(1).lower()
                if lv in declared:
                    dln, kind = declared[lv]
                    if kind == "dim" and bln < dln:
                        scope_errors.append((bln, f"[{name}] '{mu.group(1)}' usado antes do Dim (linha {dln})"))
        cur_proc = None
        continue
    if cur_proc:
        name, pln, declared, body = cur_proc
        for md in DIM_RE.finditer(code):
            v = md.group(1)
            lv = v.lower()
            if lv in declared:
                dln, kind = declared[lv]
                origem = "parametro" if kind == "parametro" else f"Dim na linha {dln}"
                scope_errors.append((ln, f"[{name}] declaracao duplicada de '{v}' (ja existe como {origem})"))
            else:
                declared[lv] = (ln, "dim")
        body.append((ln, code))

errors.extend(scope_errors)

print(f"== Analise estatica: {PATH} ==")
print(f"Linhas fisicas: {len(raw_lines)} | logicas: {len(logical)} | Procedimentos: {len(defined_procs)}")
print()
if errors:
    print(f"ERROS ESTRUTURAIS ({len(errors)}):")
    for ln, msg in sorted(errors):
        print(f"  L{ln}: {msg}")
else:
    print(">> ERROS ESTRUTURAIS: NENHUM. Blocos (Sub/Function/If/For/With/Do/Select/Type)")
    print(f"   e aspas balanceados nas {len(logical)} linhas logicas.")
    print("   Sem declaracao duplicada e sem uso de variavel antes do Dim.")

# procedimentos chamados via Call que nao existem
unresolved = [(nm,ln) for nm,ln in called_names if nm not in defined_procs]
print()
if unresolved:
    print(f"CHAMADAS 'Call' NAO RESOLVIDAS ({len(unresolved)}):")
    for nm, ln in unresolved:
        print(f"  L{ln}: Call {nm}")
else:
    print(">> Todas as chamadas 'Call X' apontam para Subs definidos no modulo.")
