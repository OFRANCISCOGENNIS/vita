// ============================================================================
// BLOCO 30 — FERRAMENTAS DE EXECUÇÃO (countdown da vela · alertas de preço · ticker)
// ============================================================================
// 1. ⏳ COUNTDOWN: quanto falta pra vela atual fechar — em binárias, entrar no
//    começo da vela muda o resultado; o timer fica na barra do gráfico.
// 2. 🔔 ALERTAS DE PREÇO: arma o modo, clica no gráfico e nasce uma linha
//    tracejada âmbar; quando o preço cruza, toca som + notifica + toast e o
//    alerta se consome (one-shot). Persistidos por símbolo (localStorage).
// 3. 💲 TICKER: preço atual + variação % da janela carregada, ao vivo.

let alertasPreco = [];
try { alertasPreco = JSON.parse(localStorage.getItem('alertasPreco') || '[]'); } catch (e) { }
let _alertaLinhas = [];
let _armandoAlerta = false, _alertaClickHooked = false, _alertaPrevClose = null;

function _precoTxt(v) {
    const c = dados && dados.length ? dados[dados.length - 1].close : v;
    return (+v).toFixed(c < 10 ? 5 : 2);
}
function _salvarAlertas() { localStorage.setItem('alertasPreco', JSON.stringify(alertasPreco)); }

// ---- Linhas + chips dos alertas do símbolo aberto ----
function alertasRedesenhar() {
    _alertaLinhas.forEach(l => { try { serieVelas.removePriceLine(l); } catch (e) { } });
    _alertaLinhas = [];
    if (serieVelas) {
        alertasPreco.filter(a => a.sym === symbolAtual()).forEach(a => {
            _alertaLinhas.push(serieVelas.createPriceLine({
                price: a.price, color: '#F59E0B', lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true, title: '🔔 alerta'
            }));
        });
    }
    const box = document.getElementById('alertaChips');
    if (box) {
        const meus = alertasPreco.filter(a => a.sym === symbolAtual());
        box.innerHTML = meus.map(a =>
            `<span class="alerta-chip">🔔 ${_precoTxt(a.price)}<button type="button" data-preco="${a.price}" title="remover alerta">✕</button></span>`).join('');
    }
}

function criarAlertaPreco(price) {
    alertasPreco.push({ sym: symbolAtual(), price: +price });
    _salvarAlertas();
    alertasRedesenhar();
    showToast('🔔 Alerta criado em ' + _precoTxt(price) + ' — som + notificação quando o preço cruzar', 'ok');
}

function removerAlertaPreco(price) {
    alertasPreco = alertasPreco.filter(a => !(a.sym === symbolAtual() && Math.abs(a.price - price) < 1e-9));
    _salvarAlertas();
    alertasRedesenhar();
}

// Chamado a cada tick (03): dispara e consome alertas cruzados
function alertasVerificar() {
    if (!dados || !dados.length) return;
    const c = dados[dados.length - 1].close;
    if (_alertaPrevClose == null) { _alertaPrevClose = c; return; }
    const lbl = PARES_YAHOO[symbolAtual()] ? PARES_YAHOO[symbolAtual()].label : symbolAtual();
    let disparou = false;
    alertasPreco = alertasPreco.filter(a => {
        if (a.sym !== symbolAtual()) return true;
        const cruzou = (_alertaPrevClose <= a.price && c >= a.price) || (_alertaPrevClose >= a.price && c <= a.price);
        if (!cruzou) return true;
        disparou = true;
        showToast(`🔔 ALERTA: ${lbl} cruzou ${_precoTxt(a.price)} (agora ${_precoTxt(c)})`, 'ok');
        try { tocarSom(c >= a.price ? 1 : -1); } catch (e) { }
        try { notificar(`🔔 Alerta de preço — ${lbl}`, `cruzou ${_precoTxt(a.price)} · agora ${_precoTxt(c)}`); } catch (e) { }
        try { if (typeof registrarAlertaDisparado === 'function') registrarAlertaDisparado(a.sym, a.price, c); } catch (e) { }
        return false;   // one-shot: consome
    });
    if (disparou) { _salvarAlertas(); alertasRedesenhar(); }
    _alertaPrevClose = c;
}

// ---- Armar alerta: próximo clique no gráfico vira o nível ----
function armarAlertaPreco() {
    const btn = document.getElementById('btnAlerta');
    if (!chartPreco || !serieVelas) { showToast('Carregue o gráfico primeiro.', 'err'); return; }
    if (!_alertaClickHooked) {
        _alertaClickHooked = true;
        chartPreco.subscribeClick(p => {
            if (!_armandoAlerta || !p.point) return;
            const price = serieVelas.coordinateToPrice(p.point.y);
            if (price == null || !isFinite(price)) return;
            _armandoAlerta = false;
            if (btn) btn.classList.remove('is-active');
            criarAlertaPreco(+price);
        });
    }
    _armandoAlerta = !_armandoAlerta;
    if (btn) btn.classList.toggle('is-active', _armandoAlerta);
    showToast(_armandoAlerta ? '🎯 Clique no gráfico, no preço onde quer o alerta' : 'Modo alerta cancelado', 'info');
}

// ---- ⏳ Countdown da vela (função pura + timer de 1s) ----
function contagemVela(lastTime, tfMin, agoraSec) { return (lastTime + tfMin * 60) - agoraSec; }

function _fmtSeg(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

function atualizarExecucaoUI() {
    const timer = document.getElementById('velaTimer');
    const tp = document.getElementById('tickPreco');
    const tv = document.getElementById('tickVar');
    if (!dados || !dados.length) { if (timer) timer.textContent = ''; return; }
    const last = dados[dados.length - 1];
    // countdown: só faz sentido com vela "de agora" (feed ao vivo)
    if (timer) {
        const s = contagemVela(last.time, tfMinutes(), Math.floor(Date.now() / 1000));
        if (s > 0 && s <= tfMinutes() * 60) {
            timer.textContent = '⏳ ' + _fmtSeg(s);
            timer.classList.toggle('vela-urgente', s <= 10);
            timer.title = 'a vela ' + (typeof rotTf === 'function' ? rotTf(tfMinutes()) : '') + ' fecha em ' + _fmtSeg(s);
        } else { timer.textContent = ''; timer.classList.remove('vela-urgente'); }
    }
    // ticker: preço + variação da janela carregada
    if (tp && tv) {
        const c = last.close, base = dados[0].close;
        tp.textContent = _precoTxt(c);
        if (base) {
            const v = (c / base - 1) * 100;
            tv.textContent = (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
            tv.className = 'tick-var ' + (v >= 0 ? 'tick-up' : 'tick-down');
            tv.title = 'variação na janela carregada (' + dados.length + ' velas)';
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const b = document.getElementById('btnAlerta');
    if (b) b.addEventListener('click', armarAlertaPreco);
    const chips = document.getElementById('alertaChips');
    if (chips) chips.addEventListener('click', e => {
        const x = e.target.closest('button[data-preco]');
        if (x) removerAlertaPreco(+x.dataset.preco);
    });
    setInterval(() => { if (!document.hidden) atualizarExecucaoUI(); }, 1000);   // pausa com aba oculta
});
