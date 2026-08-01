#!/usr/bin/env python3
"""Cérebro estilo Obsidian/Graphify: servidor local que liga todas as
notas/pesquisas num grafo interativo (força-dirigido, canvas, sem deps).

Nós = notas .md em .claude/brain/ + .claude/MEMORY.md + rotinas do módulo VBA.
Arestas = [[wikilinks]] (EXTRACTED, explícita) e menções a Sub/Function
(INFERRED, por regex) — proveniência inspirada no Graphify (tree-sitter
EXTRACTED/INFERRED). Comunidades = componentes conexos, coloridos por grupo.
Caminho entre dois nós via /api/path?from=&to= (BFS, ideia do `graphify path`).

Uso: brain_server.py [porta]           (padrão 8765)
Notas: escreva .md em .claude/brain/ com [[NomeDeOutraNota]] ou nomes de rotinas.
"""
import glob, json, os, re, sys
from collections import deque
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ROOT = os.getcwd()
BRAIN = os.path.join(ROOT, ".claude", "brain")
MEMORY = os.path.join(ROOT, ".claude", "MEMORY.md")
BAS = os.path.join(ROOT, "vba", "AnaliseCKCP_OTIMIZADO.bas")

def vba_routines():
    out = {}
    try:
        with open(BAS, encoding="utf-8", errors="replace") as f:
            for i, ln in enumerate(f, 1):
                m = re.match(r"\s*(?:Public |Private )?(Sub|Function) (\w+)", ln)
                if m:
                    out[m.group(2)] = i
    except OSError:
        pass
    return out

def vba_calls(routines):
    """Grafo de chamadas do .bas: caller -> callee (determinístico, EXTRACTED)."""
    edges, cur = set(), None
    try:
        with open(BAS, encoding="utf-8", errors="replace") as f:
            for ln in f:
                m = re.match(r"\s*(?:Public |Private )?(?:Sub|Function) (\w+)", ln)
                if m:
                    cur = m.group(1)
                    continue
                if re.match(r"\s*End (Sub|Function)", ln):
                    cur = None
                    continue
                if cur:
                    code = ln.split("'")[0]  # ignora comentários
                    for r in routines:
                        if r != cur and re.search(r"\b" + re.escape(r) + r"\b", code):
                            edges.add((cur, r))
    except OSError:
        pass
    return sorted(edges)

def notes():
    os.makedirs(BRAIN, exist_ok=True)
    out = {}
    for p in glob.glob(os.path.join(BRAIN, "**", "*.md"), recursive=True):
        out[os.path.splitext(os.path.basename(p))[0]] = p
    if os.path.isfile(MEMORY):
        out["MEMORY"] = MEMORY
    return out

def _components(node_ids, edges):
    """Comunidades = componentes conexos (union-find leve, sem dependências)."""
    parent = {n: n for n in node_ids}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    for a, b, *_ in edges:
        if a in parent and b in parent:
            union(a, b)
    roots = {}
    for n in node_ids:
        roots.setdefault(find(n), len(roots))
    return {n: roots[find(n)] for n in node_ids}

def build_graph():
    ns, routines = notes(), vba_routines()
    nodes, edges, seen = [], [], set()
    def add(nid, kind):
        if nid not in seen:
            seen.add(nid)
            nodes.append({"id": nid, "kind": kind})
    for name in ns:
        add(name, "note")
    for name, path in ns.items():
        try:
            txt = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for target in re.findall(r"\[\[([^\]|#]+)", txt):
            target = target.strip()
            add(target, "note" if target in ns else "ghost")
            edges.append([name, target, "extracted", "links"])  # wikilink explícito
        for r in routines:
            if re.search(r"\b" + re.escape(r) + r"\b", txt):
                add(r, "vba")
                edges.append([name, r, "inferred", "mentions"])  # menção por regex
    # grafo de chamadas do próprio .bas (só rotinas já presentes ou chamadas
    # por/para elas entram, para não poluir o grafo com as 131 de uma vez;
    # exceto se não houver nota nenhuma — aí mostra o call graph inteiro)
    calls = vba_calls(routines)
    seed = {n["id"] for n in nodes if n["kind"] == "vba"} or set(routines)
    for a, b in calls:
        if a in seed or b in seed:
            add(a, "vba"); add(b, "vba")
            edges.append([a, b, "extracted", "calls"])
    comm = _components([n["id"] for n in nodes], edges)
    for n in nodes:
        n["community"] = comm[n["id"]]
    return {"nodes": nodes, "edges": edges,
            "stats": {"notas": len(ns), "rotinas_vba": len(routines),
                       "comunidades": len(set(comm.values()))}}

def shortest_path(frm, to):
    g = build_graph()
    adj = {}
    for a, b, *_ in g["edges"]:
        adj.setdefault(a, set()).add(b)
        adj.setdefault(b, set()).add(a)
    if frm not in adj or to not in adj:
        return None
    prev, q = {frm: None}, deque([frm])
    while q:
        cur = q.popleft()
        if cur == to:
            path = []
            while cur is not None:
                path.append(cur)
                cur = prev[cur]
            return list(reversed(path))
        for nxt in adj.get(cur, ()):
            if nxt not in prev:
                prev[nxt] = cur
                q.append(nxt)
    return None

PAGE = """<!doctype html><meta charset=utf-8><title>Brain — AnaliseCKCP</title>
<style>body{margin:0;background:#16161d;color:#dcd7ba;font:13px/1.4 system-ui}
#top{padding:8px 14px;background:#1f1f28;display:flex;gap:14px;align-items:center}
#top b{color:#7e9cd8}canvas{display:block}#note{position:fixed;right:0;top:42px;
bottom:0;width:34%;overflow:auto;background:#1f1f28;padding:14px;white-space:pre-wrap;
border-left:1px solid #2a2a37;display:none}input{background:#16161d;color:#dcd7ba;
border:1px solid #2a2a37;padding:4px 8px;border-radius:4px;width:110px}
#pathmsg{color:#e6c384}</style>
<div id=top><b>🧠 Brain</b><span id=stats></span>
<input id=q placeholder="filtrar...">
<input id=pf placeholder="caminho: de"><input id=pt placeholder="até">
<button onclick="findPath()">path</button><span id=pathmsg></span>
<span style="color:#727169">cor=comunidade · tracejado=inferido · sólido=extraído · clique abre</span></div>
<canvas id=c></canvas><div id=note></div>
<script>
let G,N=[],E=[],highlight=null;const c=document.getElementById('c'),x=c.getContext('2d');
function fit(){c.width=innerWidth;c.height=innerHeight-42}fit();onresize=fit;
const PAL=['#7e9cd8','#98bb6c','#e6c384','#c34043','#957fb8','#7fb4ca','#dca561'];
fetch('/api/graph').then(r=>r.json()).then(g=>{G=g;
document.getElementById('stats').textContent=`${g.stats.notas} notas · ${g.stats.rotinas_vba} rotinas VBA · ${g.edges.length} ligações · ${g.stats.comunidades} comunidades`;
N=g.nodes.map(n=>({...n,x:Math.random()*c.width,y:Math.random()*c.height,vx:0,vy:0}));
E=g.edges.map(([a,b,t])=>[N.findIndex(n=>n.id==a),N.findIndex(n=>n.id==b),t]).filter(e=>e[0]>=0&&e[1]>=0);
loop()});
function loop(){for(let it=0;it<3;it++){
for(const[a,b]of E){const A=N[a],B=N[b],dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1,f=(d-90)*0.002;
A.vx+=dx/d*f*d;A.vy+=dy/d*f*d;B.vx-=dx/d*f*d;B.vy-=dy/d*f*d}
for(let i=0;i<N.length;i++)for(let j=i+1;j<N.length;j++){const A=N[i],B=N[j];
let dx=B.x-A.x,dy=B.y-A.y,d2=dx*dx+dy*dy+0.1,f=1200/d2;
A.vx-=dx*f;A.vy-=dy*f;B.vx+=dx*f;B.vy+=dy*f}
for(const n of N){n.vx+=(c.width/2-n.x)*0.0005;n.vy+=(c.height/2-n.y)*0.0005;
n.x+=n.vx*=0.85;n.y+=n.vy*=0.85}}
draw();requestAnimationFrame(loop)}
function draw(){x.clearRect(0,0,c.width,c.height);const q=document.getElementById('q').value.toLowerCase();
for(const[a,b,t]of E){const A=N[a],B=N[b];
x.strokeStyle=highlight&&highlight.has(a)&&highlight.has(b)?'#e6c384':'#2a2a37';
x.lineWidth=highlight&&highlight.has(a)&&highlight.has(b)?2:1;
x.setLineDash(t=='inferred'?[4,3]:[]);
x.beginPath();x.moveTo(A.x,A.y);x.lineTo(B.x,B.y);x.stroke()}
x.setLineDash([]);
for(const n of N){const hit=q&&n.id.toLowerCase().includes(q);
x.fillStyle=hit?'#ffffff':PAL[n.community%PAL.length];x.beginPath();
x.arc(n.x,n.y,n.kind=='note'?7:5,0,7);x.fill();
x.fillStyle=hit?'#ffffff':'#9c9a90';x.fillText(n.id,n.x+9,n.y+4)}}
c.onclick=e=>{const mx=e.offsetX,my=e.offsetY;
const n=N.find(n=>Math.hypot(n.x-mx,n.y-my)<10);const box=document.getElementById('note');
if(!n){box.style.display='none';return}
fetch('/api/node?id='+encodeURIComponent(n.id)).then(r=>r.text()).then(t=>{
box.textContent=t;box.style.display='block'})};
document.getElementById('q').oninput=draw;
function findPath(){
const a=document.getElementById('pf').value,b=document.getElementById('pt').value;
fetch(`/api/path?from=${encodeURIComponent(a)}&to=${encodeURIComponent(b)}`).then(r=>r.json()).then(p=>{
const m=document.getElementById('pathmsg');
if(!p.path){m.textContent='sem caminho';highlight=null;return}
m.textContent=p.path.join(' → ');
highlight=new Set(p.path.map(id=>N.findIndex(n=>n.id==id)))})}
</script>"""

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, body, ctype="text/html; charset=utf-8", code=200):
        b = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/":
            self._send(PAGE)
        elif u.path == "/api/graph":
            self._send(json.dumps(build_graph()), "application/json")
        elif u.path == "/api/path":
            qs = parse_qs(u.query)
            frm, to = qs.get("from", [""])[0], qs.get("to", [""])[0]
            self._send(json.dumps({"path": shortest_path(frm, to)}), "application/json")
        elif u.path == "/api/node":
            nid = parse_qs(u.query).get("id", [""])[0]
            ns, rs = notes(), vba_routines()
            if nid in ns:
                self._send(open(ns[nid], encoding="utf-8", errors="replace").read(),
                           "text/plain; charset=utf-8")
            elif nid in rs:
                # extrai o corpo da rotina, mesmo truque do vba_sub.sh
                out, on = [], False
                for i, ln in enumerate(open(BAS, encoding="utf-8", errors="replace"), 1):
                    if not on and re.search(r"(Sub|Function) " + re.escape(nid) + r"[( ]", ln):
                        on = True
                    if on:
                        out.append(f"{i}\t{ln.rstrip()}")
                        if re.match(r"\s*End (Sub|Function)", ln):
                            break
                self._send("\n".join(out) or "(não encontrada)", "text/plain; charset=utf-8")
            else:
                self._send(f"(nota fantasma: crie .claude/brain/{nid}.md)",
                           "text/plain; charset=utf-8")
        else:
            self._send("404", code=404)

def cli_explain(nid):
    g = build_graph()
    node = next((n for n in g["nodes"] if n["id"] == nid), None)
    if not node:
        cands = [n["id"] for n in g["nodes"] if nid.lower() in n["id"].lower()]
        sys.exit(f"nó '{nid}' não encontrado." +
                 (f" Parecidos: {', '.join(cands[:5])}" if cands else ""))
    rts = vba_routines()
    out_e = [(b, p, r) for a, b, p, r in g["edges"] if a == nid]
    in_e = [(a, p, r) for a, b, p, r in g["edges"] if b == nid]
    print(f"Node: {nid}")
    if nid in rts:
        print(f"  Source:    vba/AnaliseCKCP_OTIMIZADO.bas L{rts[nid]}")
    print(f"  Kind:      {node['kind']}")
    print(f"  Community: {node['community']}")
    print(f"  Degree:    {len(out_e) + len(in_e)}\n")
    print(f"Connections ({len(out_e) + len(in_e)}):")
    for b, p, r in out_e:
        print(f"  --> {b} [{r}] [{p.upper()}]")
    for a, p, r in in_e:
        print(f"  <-- {a} [{r}] [{p.upper()}]")

def cli_path(a, b):
    p = shortest_path(a, b)
    if not p:
        sys.exit("sem caminho")
    print(f"Shortest path ({len(p) - 1} hops):")
    print("  " + " --> ".join(p))

if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "explain" and len(args) == 2:
        cli_explain(args[1])
    elif args and args[0] == "path" and len(args) == 3:
        cli_path(args[1], args[2])
    else:
        port = int(args[1]) if len(args) > 1 and args[0] == "serve" else \
               int(args[0]) if args and args[0].isdigit() else 8765
        print(f"🧠 brain em http://localhost:{port}  (notas: .claude/brain/*.md)")
        print("CLI: brain_server.py explain <nó> | path <de> <até> | serve [porta]")
        HTTPServer(("127.0.0.1", port), H).serve_forever()
