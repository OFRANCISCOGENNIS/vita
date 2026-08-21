"""
webapp — Interface web do detector (stdlib apenas, sem dependências).

É um SITE DE ANÁLISE, não um bot. O backend reutiliza exatamente o mesmo
núcleo testado (`math_core` via `ArbitrageDetector`) — não há reimplementação
da matemática no navegador. O frontend só coleta odds e desenha o resultado
que o Python calcula.

    python -m football_arb.webapp            # http://127.0.0.1:8000
    python -m football_arb.webapp --port 9000 --host 0.0.0.0

Rotas:
    GET  /                -> página HTML
    GET  /api/mock        -> detecção sobre o MockProvider (sem credencial)
    POST /api/detect      -> {market, outcomes[], bankroll, min_margin}
                             -> uma detecção; 200 mesmo sem arbitragem
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .detector import MARKET_OUTCOMES, ArbitrageDetector
from .models import Bookmaker, Event, Outcome
from .output import to_json
from .providers import MockProvider

_PAGE = r"""<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>football_arb — detector de arbitragem (análise)</title>
<style>
  :root{
    --bg:#0d1117; --panel:#161b22; --panel2:#1c232d; --line:#30363d;
    --txt:#e6edf3; --muted:#9aa7b4; --accent:#3fb950; --bad:#f85149;
    --warn:#d29922; --blue:#58a6ff;
  }
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.5 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;
    background:var(--bg);color:var(--txt)}
  a{color:var(--blue)}
  header{padding:20px 24px;border-bottom:1px solid var(--line);background:var(--panel)}
  h1{margin:0;font-size:20px;letter-spacing:.3px}
  .tag{display:inline-block;margin-top:6px;font-size:12px;color:var(--bg);
    background:var(--warn);padding:3px 8px;border-radius:5px;font-weight:700}
  .wrap{max-width:1040px;margin:0 auto;padding:24px}
  .grid{display:grid;grid-template-columns:340px 1fr;gap:20px}
  @media(max-width:820px){.grid{grid-template-columns:1fr}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px}
  .card h2{margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
  label{display:block;font-size:12px;color:var(--muted);margin:10px 0 4px}
  input,select{width:100%;background:var(--panel2);border:1px solid var(--line);
    color:var(--txt);border-radius:7px;padding:8px 10px;font-size:14px}
  .row{display:grid;grid-template-columns:1fr 90px 1fr;gap:8px;align-items:end}
  .row .lbl{font-weight:700;text-align:center;color:var(--blue)}
  button{cursor:pointer;border:1px solid var(--line);border-radius:8px;
    padding:9px 14px;font-size:14px;font-weight:600;background:var(--panel2);color:var(--txt)}
  button.primary{background:var(--accent);border-color:var(--accent);color:#04260f}
  .btns{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
  .muted{color:var(--muted);font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
  th{color:var(--muted);text-transform:uppercase;font-size:11px;letter-spacing:.4px}
  .kpi{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px}
  .kpi div{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:10px 14px;min-width:120px}
  .kpi b{display:block;font-size:22px}
  .kpi small{color:var(--muted);text-transform:uppercase;font-size:11px;letter-spacing:.4px}
  .ok{color:var(--accent)} .no{color:var(--bad)}
  .flags{margin-top:12px}
  .flag{display:inline-block;background:#3d1f1f;border:1px solid var(--bad);color:#ffb3ad;
    padding:3px 8px;border-radius:6px;font-size:12px;margin:3px 4px 0 0}
  .empty{color:var(--muted);padding:20px 0}
  footer{max-width:1040px;margin:0 auto;padding:0 24px 40px;color:var(--muted);font-size:12px}
  code{background:var(--panel2);padding:1px 5px;border-radius:4px}
</style>
</head>
<body>
<header>
  <h1>⚽ football_arb — detector de arbitragem</h1>
  <span class="tag">FERRAMENTA DE ANÁLISE — NÃO EXECUTA APOSTAS · NÃO FAZ LOGIN</span>
</header>

<div class="wrap grid">
  <div class="card">
    <h2>Entrada de odds</h2>
    <label>Mercado</label>
    <select id="market">
      <option value="1X2">1X2 (3-way)</option>
      <option value="2WAY">2-way</option>
    </select>

    <div id="legs"></div>

    <label>Bankroll (banca)</label>
    <input id="bankroll" type="number" value="1000" min="0.01" step="1">
    <label>Margem mínima (%) — colchão p/ movimento de odd e arredondamento</label>
    <input id="minmargin" type="number" value="1" min="0" step="0.1">

    <div class="btns">
      <button class="primary" onclick="detect()">Analisar</button>
      <button onclick="loadMock()">Carregar exemplo (mock)</button>
    </div>
    <p class="muted" style="margin-top:14px">
      A matemática roda no backend Python (mesmo código testado do pacote).
      O navegador só exibe o resultado.
    </p>
  </div>

  <div class="card">
    <h2>Resultado</h2>
    <div id="out"><div class="empty">Preencha as odds e clique em <b>Analisar</b>.</div></div>
  </div>
</div>

<footer>
  <b>Por que NÃO executa apostas:</b> delay de odds (a odd lida já pode ter mudado),
  limitação/ban de conta, slippage entre pernas (as apostas não entram no mesmo instante),
  e suspensão de mercado. Por isso <b>nenhuma oportunidade é "risk-free"</b> — cada uma
  carrega flags de risco não quantificável. Este site apenas analisa números.
</footer>

<script>
const LABELS = {"1X2":[["1","Casa"],["X","Empate"],["2","Fora"]],
                "2WAY":[["HOME","Casa"],["AWAY","Fora"]]};
function renderLegs(){
  const m = market.value, box = document.getElementById('legs');
  box.innerHTML = LABELS[m].map(([code,desc],i)=>`
    <label>${desc} (${code}) — casa e odd</label>
    <div class="row">
      <input id="book_${i}" placeholder="casa" value="">
      <div class="lbl">${code}</div>
      <input id="odd_${i}" type="number" step="0.01" min="1.01" placeholder="odd" value="">
    </div>`).join('');
}
market.addEventListener('change', ()=>{renderLegs(); clearOut();});
function clearOut(){document.getElementById('out').innerHTML =
  '<div class="empty">Preencha as odds e clique em <b>Analisar</b>.</div>';}

function collect(){
  const m = market.value;
  const outcomes = LABELS[m].map(([code],i)=>({
    label: code,
    odd: parseFloat(document.getElementById('odd_'+i).value),
    bookmaker: (document.getElementById('book_'+i).value || 'casa'+(i+1))
  }));
  return {market:m, outcomes,
    bankroll: parseFloat(bankroll.value),
    min_margin: parseFloat(minmargin.value)/100};
}

async function detect(){
  const body = collect();
  if(body.outcomes.some(o=>!(o.odd>1))){ alert('Preencha odds decimais > 1.0 em todas as pernas.'); return; }
  const r = await fetch('/api/detect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await r.json();
  if(!r.ok){ alert(data.error||'Erro'); return; }
  render(data);
}
async function loadMock(){
  const r = await fetch('/api/mock'); render(await r.json(), true);
}

function render(data, multi=false){
  const opps = data.opportunities;
  const out = document.getElementById('out');
  if(!opps.length){
    out.innerHTML = `<div class="empty"><b class="no">Sem arbitragem</b> acima da margem mínima.
      arb_index = ${data.arb_index?.toFixed(4) ?? '—'} (índice ≥ 1 significa margem da casa; não há oportunidade).</div>`;
    return;
  }
  out.innerHTML = opps.map(o=>oppHtml(o)).join('<hr style="border-color:#30363d;margin:20px 0">');
}

function oppHtml(o){
  const legs = o.legs.map(l=>`<tr>
      <td><b>${l.label}</b></td><td>${l.bookmaker}</td>
      <td>${l.odd.toFixed(2)}</td><td>${l.stake.toFixed(2)}</td>
      <td>${l.payout.toFixed(2)}</td></tr>`).join('');
  const flags = o.risk_flags.map(f=>`<span class="flag">${f}</span>`).join('');
  return `
    <div style="font-size:16px;font-weight:700;margin-bottom:8px">${o.event} <span class="muted">[${o.market}]</span></div>
    <div class="kpi">
      <div><small>arb index</small><b>${o.arb_index.toFixed(4)}</b></div>
      <div><small>margem</small><b class="ok">${(o.margin*100).toFixed(2)}%</b></div>
      <div><small>lucro</small><b class="ok">${o.profit.toFixed(2)}</b></div>
      <div><small>ROI</small><b class="ok">${o.roi_pct.toFixed(2)}%</b></div>
      <div><small>idade odd</small><b>${o.odd_age_seconds.toFixed(0)}s</b></div>
    </div>
    <table><thead><tr><th>perna</th><th>casa</th><th>odd</th><th>stake</th><th>payout</th></tr></thead>
      <tbody>${legs}</tbody></table>
    <div class="flags"><b class="no">Riscos não quantificados</b> (jamais "risk-free"): ${flags}</div>`;
}

renderLegs();
</script>
</body>
</html>"""


def _detect_single(payload: dict[str, Any]) -> dict[str, Any]:
    """Constrói um Event a partir do JSON do form e roda o detector."""
    market = str(payload.get("market", "")).upper()
    if market not in MARKET_OUTCOMES:
        raise ValueError(f"Mercado inválido: {market!r}")
    bankroll = float(payload.get("bankroll", 1000.0))
    min_margin = float(payload.get("min_margin", 0.01))

    now = datetime.now(timezone.utc)
    outcomes = []
    for oc in payload.get("outcomes", []):
        outcomes.append(
            Outcome(
                label=str(oc["label"]),
                odd=float(oc["odd"]),
                bookmaker=Bookmaker(str(oc.get("bookmaker", "casa"))),
                timestamp=now,
            )
        )
    event = Event(
        event_id="WEB",
        home=str(payload.get("home", "Casa")),
        away=str(payload.get("away", "Fora")),
        market=market,
        outcomes=outcomes,
    )

    detector = ArbitrageDetector(bankroll=bankroll, min_margin=min_margin)
    opps = detector.detect([event])
    # arb_index é informativo mesmo quando NÃO há oportunidade — devolvemos
    # para o front explicar "índice >= 1, sem arbitragem".
    from . import math_core

    idx = None
    try:
        idx = math_core.arb_index([o.odd for o in outcomes])
    except ValueError:
        idx = None
    return {
        "arb_index": idx,
        "opportunities": json.loads(to_json(opps)),
    }


class _Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: Any) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

    def log_message(self, *args: Any) -> None:  # silencia log ruidoso
        pass

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            self._send(200, _PAGE.encode("utf-8"), "text/html; charset=utf-8")
        elif self.path == "/api/mock":
            detector = ArbitrageDetector()
            opps = detector.detect(MockProvider().fetch_events())
            self._json(200, {"arb_index": None,
                             "opportunities": json.loads(to_json(opps))})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/api/detect":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self._json(200, _detect_single(payload))
        except (ValueError, KeyError, TypeError) as exc:
            self._json(400, {"error": str(exc)})


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="football_arb.webapp",
        description="Site de ANÁLISE de arbitragem (não executa apostas).",
    )
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    args = p.parse_args(argv)

    server = ThreadingHTTPServer((args.host, args.port), _Handler)
    print(f"football_arb (ANÁLISE, não executa apostas) em "
          f"http://{args.host}:{args.port}  — Ctrl+C para parar")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
