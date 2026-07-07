// ============================================================================
// BLOCO 8 — CONEXÃO BINANCE (REST histórico + WebSocket ao vivo)
// ============================================================================

function setStatus(estado, texto) {
    const dot = document.getElementById('connDot');
    const txt = document.getElementById('connText');
    dot.className = 'conn-dot conn-' + estado;   // on | connecting | off | err
    txt.textContent = texto;
    document.getElementById('liveBadge').style.display = estado === 'on' ? 'inline-block' : 'none';
    // Skeleton loader: shimmer no gráfico enquanto conecta/carrega
    document.body.classList.toggle('carregando', estado === 'connecting');
}

async function carregarHistoricoBinance(symbol, interval, limit) {
    const url = `${BINANCE_REST}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const resp = await fetch(url);
    if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error('HTTP ' + resp.status + ' ' + t.slice(0, 120));
    }
    const arr = await resp.json();
    // Binance kline: [openTime, open, high, low, close, volume, closeTime,
    //  quoteVol, nTrades, takerBuyBaseVol, ...] — k[9] é o volume COMPRADO a
    // mercado (agressor); venda = volume total − k[9].
    return arr.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: +k[1], high: +k[2], low: +k[3], close: +k[4],
        volume: +k[5], buyVol: +k[9]
    }));
}

// Proxy do "Crypto IDX" da Binomo (índice sintético proprietário, sem feed
// público). Aproximação: cesta de criptos reais da Binance, cada uma normalizada
// em base 100 no primeiro fechamento; o índice é a média das velas normalizadas.
// NÃO reproduz os valores exatos da Binomo — é uma referência de comportamento.
const CRYPTOIDX_CESTA = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
// Carrega a cesta e devolve as velas do índice + fatores de normalização e a
// última vela de cada ativo (para o WebSocket combinar tick a tick ao vivo).
async function carregarCestaIDX(interval, limit) {
    const series = await Promise.all(CRYPTOIDX_CESTA.map(s =>
        carregarHistoricoBinance(s, interval, limit).then(d => ({ s, d })).catch(() => null)));
    const ok = series.filter(x => x && x.d && x.d.length);
    if (!ok.length) throw new Error('cesta Crypto IDX indisponível');
    const factors = {}; ok.forEach(x => factors[x.s] = 100 / x.d[0].close);   // base 100 por ativo
    const mapa = new Map();
    ok.forEach(x => {
        const f = factors[x.s];
        x.d.forEach(c => {
            let a = mapa.get(c.time);
            if (!a) { a = { o: 0, h: 0, l: 0, cl: 0, v: 0, bv: 0, n: 0 }; mapa.set(c.time, a); }
            a.o += c.open * f; a.h += c.high * f; a.l += c.low * f; a.cl += c.close * f;
            a.v += c.volume || 0; a.bv += c.buyVol || 0; a.n++;
        });
    });
    const candles = [...mapa.keys()].sort((x, y) => x - y)
        .filter(t => mapa.get(t).n === ok.length)   // só buckets com toda a cesta
        .map(t => { const a = mapa.get(t); return { time: t, open: a.o / a.n, high: a.h / a.n, low: a.l / a.n, close: a.cl / a.n, volume: a.v, buyVol: a.bv }; });
    const ultimos = {};
    ok.forEach(x => { const c = x.d[x.d.length - 1]; ultimos[x.s] = { time: c.time, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, V: c.buyVol }; });
    return { candles: candles.slice(Math.max(0, candles.length - limit)), factors, ultimos, syms: ok.map(x => x.s) };
}
async function carregarHistoricoCryptoIDX(interval, limit) { return (await carregarCestaIDX(interval, limit)).candles; }

// ---- WebSocket combinado do Crypto IDX (tick a tick, como os pares normais) ----
let idxWS = null, idxFactors = {}, idxLast = {}, idxSyms = [], idxConn = '';
function fecharIdxWS() { if (idxWS) { try { idxWS.onclose = null; idxWS.close(); } catch (e) {} idxWS = null; } idxConn = ''; }

// Monta a vela do índice no tempo t exigindo que todos os ativos já tenham
// reportado esse bucket (senão devolve null e espera os que faltam).
function idxCombinar(t) {
    let o = 0, h = 0, l = 0, c = 0, v = 0, bv = 0, n = 0;
    for (const s of idxSyms) {
        const b = idxLast[s];
        if (!b || b.time !== t) return null;
        const f = idxFactors[s];
        o += b.o * f; h += b.h * f; l += b.l * f; c += b.c * f; v += b.v || 0; bv += b.V || 0; n++;
    }
    return n ? { time: t, open: o / n, high: h / n, low: l / n, close: c / n, volume: v, buyVol: bv } : null;
}

function onIdxBar(bar, fechou) {
    const last = dados.length ? dados[dados.length - 1] : null;
    if (last && bar.time === last.time) { dados[dados.length - 1] = bar; atualizarUltimoCandle(fechou); }
    else if (!last || bar.time > last.time) { dados.push(bar); atualizarUltimoCandle(fechou); }
}

function conectarIdxWS(interval) {
    fecharIdxWS();
    const streams = idxSyms.map(s => s.toLowerCase() + '@kline_' + interval).join('/');
    const conn = 'IDX@' + interval; idxConn = conn;
    const sock = new WebSocket(`${BINANCE_WS}/stream?streams=${streams}`);
    idxWS = sock;
    sock.onopen = () => { if (idxConn === conn) setStatus('on', 'AO VIVO (tick a tick) • Crypto IDX ≈ cesta Binance'); };
    sock.onmessage = (ev) => {
        if (idxConn !== conn) return;
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        const k = msg.data && msg.data.k; if (!k) return;
        const sym = msg.data.s || k.s;
        if (idxFactors[sym] == null) return;
        const t = Math.floor(k.t / 1000);
        idxLast[sym] = { time: t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, V: +(k.V || 0) };
        const bar = idxCombinar(t);
        if (bar) onIdxBar(bar, k.x === true);
    };
    sock.onerror = () => { if (idxConn === conn) setStatus('err', 'Erro de conexão (Crypto IDX)'); };
    sock.onclose = () => {
        if (idxConn !== conn) return;
        setStatus('connecting', 'Reconectando Crypto IDX…');
        setTimeout(() => { if (idxConn === conn && fonte() === 'binance' && symbolAtual() === 'CRYPTOIDX') conectarIdxWS(interval); }, 2000);
    };
}

function fecharWS() {
    if (ws) {
        try { ws.onclose = null; ws.close(); } catch (e) {}
        ws = null;
    }
    fecharIdxWS();
}

function conectarWS(symbol, interval) {
    fecharWS();
    const stream = symbol.toLowerCase() + '@kline_' + interval;
    conexaoAtual = stream;
    setStatus('connecting', 'Conectando ao vivo…');
    const sock = new WebSocket(`${BINANCE_WS}/ws/${stream}`);
    ws = sock;

    sock.onopen = () => { if (conexaoAtual === stream) setStatus('on', `AO VIVO • ${symbol} ${interval}`); };
    sock.onmessage = (ev) => {
        if (conexaoAtual !== stream) return;
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg.k) return;
        onKline(msg.k);
    };
    sock.onerror = () => { if (conexaoAtual === stream) setStatus('err', 'Erro de conexão'); };
    sock.onclose = () => {
        if (conexaoAtual !== stream) return;              // troca de par/tf: ignore
        setStatus('connecting', 'Reconectando…');
        setTimeout(() => { if (conexaoAtual === stream && fonte() === 'binance') conectarWS(symbol, interval); }, 2000);
    };
}

// Trata cada mensagem de kline do WebSocket
function onKline(k) {
    const t = Math.floor(k.t / 1000);
    // k.V = taker buy base volume (compra agressora) do stream de klines
    const bar = { time: t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, buyVol: +(k.V || 0) };
    const last = dados.length ? dados[dados.length - 1] : null;

    if (last && t === last.time) {
        dados[dados.length - 1] = bar;              // atualiza vela em formação
        atualizarUltimoCandle(k.x === true);
    } else if (!last || t > last.time) {
        dados.push(bar);                            // nova vela
        atualizarUltimoCandle(k.x === true);
    }
}

// ============================================================================
// BLOCO 9 — ORQUESTRAÇÃO / CARGA
// ============================================================================

// ============================================================================
// FOREX / ÍNDICES / OURO — Yahoo Finance (keyless, sem CORS -> via proxy)
// ============================================================================

function pararPollYahoo() { if (yahooPollTimer) { clearInterval(yahooPollTimer); yahooPollTimer = null; } }

// Yahoo não tem CORS liberado nem WS público: usamos um proxy que embrulha a
// resposta em {contents:"..."} (mesmo mecanismo das notícias), com retry —
// esse proxy público é instável e às vezes devolve 500/522 transitórios.
async function fetchYahooJson(url, rodadas) {
    rodadas = rodadas || 3;
    let ultimoErro;
    for (let r = 0; r < rodadas; r++) {
        for (const p of YAHOO_PROXIES) {
            try {
                const resp = await fetch(p.montar(url));
                if (!resp.ok) throw new Error(p.nome + ' HTTP ' + resp.status);
                const inner = JSON.parse(await p.texto(resp));
                if (inner.chart && inner.chart.error) throw new Error(inner.chart.error.description || 'erro Yahoo');
                if (!inner.chart || !inner.chart.result || !inner.chart.result[0]) throw new Error('resposta vazia');
                return inner.chart.result[0];
            } catch (e) {
                ultimoErro = e;   // tenta o próximo proxy
            }
        }
        if (r < rodadas - 1) await new Promise(res => setTimeout(res, 600 * (r + 1)));  // backoff entre rodadas
    }
    throw ultimoErro || new Error('nenhum proxy respondeu');
}

function yahooIntervalStr(min) { return (min === 60 ? '60' : String(min)) + 'm'; }
function yahooRangeFor(min) {
    if (min <= 1) return '5d';
    if (min <= 15) return '1mo';
    if (min <= 30) return '3mo';
    return '6mo';
}

function parseYahooResult(r) {
    const ts = r.timestamp || [];
    const q = (r.indicators.quote || [{}])[0] || {};
    const out = [];
    for (let i = 0; i < ts.length; i++) {
        const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
        if (o == null || h == null || l == null || c == null) continue;   // vela sem pregão (mercado fechado)
        // Forex/índices via Yahoo não têm volume agressor real: sem dado -> 0
        // e buyVol = metade (neutro), para não simular fluxo inexistente.
        const vol = (q.volume && q.volume[i] != null) ? q.volume[i] : 0;
        out.push({ time: ts[i], open: +o, high: +h, low: +l, close: +c, volume: vol, buyVol: vol / 2 });
    }
    return out;
}

async function carregarHistoricoYahoo(codigo, intervalMin, limit) {
    const par = PARES_YAHOO[codigo];
    if (!par) throw new Error('par não suportado nesta fonte: ' + codigo);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(par.yahoo)}` +
        `?interval=${yahooIntervalStr(intervalMin)}&range=${yahooRangeFor(intervalMin)}`;
    const r = await fetchYahooJson(url);
    const candles = parseYahooResult(r);
    return candles.slice(Math.max(0, candles.length - limit));
}

// Fonte "Forex-like" (Forex/índices/ouro): sem volume agressor real
function ehForex() { const f = fonte(); return f === 'yahoo' || f === 'twelvedata'; }

// ---- Twelve Data (Forex/Índices/Ouro com chave grátis; tem CORS próprio) ----
function tdIntervalStr(min) { return min === 60 ? '1h' : min + 'min'; }
function tdKey() { return (document.getElementById('tdKey').value || 'demo').trim(); }

function parseTwelveData(json) {
    if (!json.values) return [];
    const out = [];
    // values vêm do mais recente p/ o mais antigo: percorremos de trás p/ frente
    for (let i = json.values.length - 1; i >= 0; i--) {
        const v = json.values[i];
        const t = Math.floor(Date.parse(v.datetime.replace(' ', 'T') + 'Z') / 1000);
        if (isNaN(t)) continue;
        const vol = v.volume != null ? +v.volume : 0;
        out.push({ time: t, open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: vol, buyVol: vol / 2 });
    }
    return out;
}

async function carregarHistoricoTwelveData(codigo, intervalMin, limit) {
    const par = PARES_YAHOO[codigo];
    if (!par || !par.td) throw new Error('par não suportado nesta fonte: ' + codigo);
    const url = `${TWELVEDATA_BASE}/time_series?symbol=${encodeURIComponent(par.td)}` +
        `&interval=${tdIntervalStr(intervalMin)}&outputsize=${Math.min(5000, limit)}&timezone=UTC&apikey=${encodeURIComponent(tdKey())}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    if (json.status === 'error' || (json.code && json.code >= 400)) throw new Error(json.message || 'erro Twelve Data');
    const candles = parseTwelveData(json);
    if (!candles.length) throw new Error('sem dados para ' + codigo);
    return candles;
}

// Nem Yahoo nem Twelve Data (free) têm WebSocket público: aproximamos "tempo
// real" reconsultando as últimas velas por polling (REST) a cada 15s.
function iniciarPollForex(codigo, intervalMin, carregador, label) {
    pararPollYahoo();
    yahooPollTimer = setInterval(async () => {
        if (!ehForex() || treino) return;
        try {
            const recentes = await carregador(codigo, intervalMin, 3);
            recentes.forEach(bar => {
                const last = dados.length ? dados[dados.length - 1] : null;
                if (last && bar.time === last.time) {
                    dados[dados.length - 1] = bar;
                    atualizarUltimoCandle(false);
                } else if (!last || bar.time > last.time) {
                    dados.push(bar);
                    atualizarUltimoCandle(true);
                }
            });
            setStatus('on', `AO VIVO (polling 15s) • ${label}`);
        } catch (e) {
            setStatus('err', 'Falha ao atualizar: ' + (e.message || e));
        }
    }, 15000);
}

// Fluxo/Correlação dependem de volume real (indisponível em Forex/índices/ouro).
// Desativa os controles nessas fontes e restaura o estado anterior ao voltar p/ cripto.
function atualizarDisponibilidadeFluxo() {
    const semVol = ehForex();
    const elFluxo = document.getElementById('useFluxo');
    const elCorr = document.getElementById('useCorrelacao');
    if (semVol) {
        if (fluxoStateAntesYahoo === null) fluxoStateAntesYahoo = { fluxo: elFluxo.checked, corr: elCorr.checked };
        elFluxo.checked = false;
        elCorr.checked = false;
    } else if (fluxoStateAntesYahoo) {
        elFluxo.checked = fluxoStateAntesYahoo.fluxo;
        elCorr.checked = fluxoStateAntesYahoo.corr;
        fluxoStateAntesYahoo = null;
    }
    elFluxo.disabled = semVol;
    elCorr.disabled = semVol;
    document.getElementById('fluxoJanela').disabled = semVol;
    document.getElementById('refPairs').disabled = semVol;
}

async function carregar() {
    // Trocar fonte/par/timeframe ou recarregar encerra um treino em andamento
    if (treino) {
        treino = null;
        document.getElementById('trainPanel').style.display = 'none';
        document.getElementById('btnTreinar').textContent = 'Treinar leitura (replay)';
    }
    fecharWS();
    pararPollYahoo();
    atualizarDisponibilidadeFluxo();
    if (refTimer) { clearInterval(refTimer); refTimer = null; }

    if (fonte() === 'sim') {
        conexaoAtual = '';
        setStatus('off', 'Simulado (offline)');
        const numCandles = parseInt(document.getElementById('numCandles').value);
        const volatilidade = parseFloat(document.getElementById('volatility').value);
        dados = gerarDadosSim(numCandles, volatilidade);
        refPares = gerarRefParesSim(dados);
        redesenharTudo(true);
        return;
    }

    if (fonte() === 'twelvedata') {
        conexaoAtual = '';
        const codigo = symbolAtual();
        if (!PARES_YAHOO[codigo]) {
            setStatus('err', `Par "${codigo}" não está na lista de Forex/Índices/Ouro`);
            return;
        }
        setStatus('connecting', `Carregando ${PARES_YAHOO[codigo].label} (Twelve Data)…`);
        const limit = Math.min(1000, Math.max(50, parseInt(document.getElementById('numCandles').value) || 300));
        try {
            dados = await carregarHistoricoTwelveData(codigo, tfMinutes(), limit);
            refPares = [];
            redesenharTudo(true);
            const label = PARES_YAHOO[codigo].label + ' · Twelve Data';
            setStatus('on', `AO VIVO (polling 15s) • ${label}`);
            iniciarPollForex(codigo, tfMinutes(), carregarHistoricoTwelveData, label);
        } catch (err) {
            console.warn('Twelve Data falhou, tentando Yahoo…', err);
            const dica = /api key|apikey|401|limit|grow|plan/i.test(err.message || '') ? ' (chave demo/limite? pegue a sua em twelvedata.com)' : '';
            setStatus('connecting', `Twelve Data indisponível${dica} — tentando Yahoo…`);
            // Auto-fallback p/ Yahoo (keyless) antes de desistir
            try {
                dados = await carregarHistoricoYahoo(codigo, tfMinutes(), Math.min(500, limit));
                if (!dados.length) throw new Error('vazio');
                refPares = [];
                redesenharTudo(true);
                const label = PARES_YAHOO[codigo].label + ' · Yahoo (fallback)';
                setStatus('on', `AO VIVO (polling 15s) • ${label}`);
                iniciarPollForex(codigo, tfMinutes(), carregarHistoricoYahoo, label);
            } catch (err2) {
                console.error('Yahoo também falhou:', err2);
                setStatus('err', `Twelve Data e Yahoo indisponíveis${dica} — mostrando SIMULADO. Clique em "Recarregar / Gerar".`);
                dados = gerarDadosSim(parseInt(document.getElementById('numCandles').value) || 300, 2);
                refPares = [];
                redesenharTudo(true);
            }
        }
        return;
    }

    if (fonte() === 'yahoo') {
        conexaoAtual = '';
        const codigo = symbolAtual();
        if (!PARES_YAHOO[codigo]) {
            setStatus('err', `Par "${codigo}" não está na lista de Forex/Índices/Ouro`);
            return;
        }
        setStatus('connecting', `Carregando ${PARES_YAHOO[codigo].label} (Yahoo, testando proxies)…`);
        const limit = Math.min(500, Math.max(50, parseInt(document.getElementById('numCandles').value) || 300));
        try {
            dados = await carregarHistoricoYahoo(codigo, tfMinutes(), limit);
            if (!dados.length) throw new Error('sem dados para ' + codigo);
            refPares = [];   // correlação não se aplica entre fontes distintas
            redesenharTudo(true);
            setStatus('on', `AO VIVO (polling 15s) • ${PARES_YAHOO[codigo].label}`);
            iniciarPollForex(codigo, tfMinutes(), carregarHistoricoYahoo, PARES_YAHOO[codigo].label);
        } catch (err) {
            console.error('Erro ao carregar Yahoo:', err);
            // Proxies indisponíveis: mostra SIMULADO (deixando claro) e permite retry
            setStatus('err', 'Proxy indisponível — mostrando SIMULADO. Clique em "Recarregar / Gerar" p/ tentar de novo.');
            dados = gerarDadosSim(parseInt(document.getElementById('numCandles').value) || 300, 2);
            refPares = [];
            redesenharTudo(true);
        }
        return;
    }

    // Binance ao vivo
    const symbol = symbolAtual();
    const interval = binanceInterval();
    const limit = Math.min(1000, Math.max(50, parseInt(document.getElementById('numCandles').value) || 300));

    // Crypto IDX (proxy): cesta de criptos combinada tick a tick via WebSocket
    if (symbol === 'CRYPTOIDX') {
        setStatus('connecting', 'Montando Crypto IDX (proxy)…');
        try {
            const cesta = await carregarCestaIDX(interval, limit);
            if (!cesta.candles.length) throw new Error('cesta vazia');
            dados = cesta.candles;
            idxFactors = cesta.factors; idxLast = cesta.ultimos; idxSyms = cesta.syms;
            refPares = [];
            redesenharTudo(true);
            conectarIdxWS(interval);   // stream combinado — atualiza a última vela a cada tick
        } catch (err) {
            setStatus('err', 'Crypto IDX indisponível: ' + (err.message || err));
        }
        return;
    }

    setStatus('connecting', 'Carregando histórico…');
    try {
        dados = await carregarHistoricoBinance(symbol, interval, limit);
        if (!dados.length) throw new Error('sem dados para ' + symbol);
        await carregarRefPares();          // pares de referência p/ fluxo/correlação
        redesenharTudo(true);
        conectarWS(symbol, interval);
        // Pares de referência não têm WS próprio: renova via REST a cada 60s
        refTimer = setInterval(async () => {
            if (fonte() !== 'binance' || treino) return;
            await carregarRefPares();
            recalcularSinaisApenas();
        }, 60000);
    } catch (err) {
        setStatus('err', 'Falha: ' + (err.message || err));
        console.error('Erro ao carregar Binance:', err);
        // fallback visual: gera simulado para não deixar a tela vazia
        dados = gerarDadosSim(parseInt(document.getElementById('numCandles').value), 2);
        refPares = gerarRefParesSim(dados);
        redesenharTudo(true);
    }
}

// Só recalcula sinais/entradas sobre os dados atuais (sem recarregar/reconectar)
function recalcularSinaisApenas() {
    if (!dados.length) { carregar(); return; }
    recomputarIndicadores();
    recomputarSinais();
    recomputarEntradas();
    // Atualiza séries de linha (mudança de parâmetros pode alterar todos os pontos)
    const times = dados.map(d => d.time);
    serieEma9.setData(toLine(times, computed.emaR));
    serieEma21.setData(toLine(times, computed.emaL));
    serieEma200.setData(document.getElementById('useEma200').checked ? toLine(times, computed.ema200) : []);
    serieRsi.setData(toLine(times, computed.rsiValues));
    serieAtr.setData(toLine(times, computed.atrValues));
    serieAtrMedia.setData(toLine(times, computed.atrMedia));
    atualizarMarcadores();
    atualizarPaineis();
    atualizarLegenda();
}

const SCAN_CRIPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT', 'DOTUSDT', 'TRXUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT'];

// Pares de câmbio (moedas fiat contra USDT) que a Binance pode listar. Só os que
// existirem de fato no exchangeInfo entram no checklist — a validação acontece em
// runtime (carregarSimbolos), evitando entradas mortas. A Binance cota tudo em
// USDT, então só há X/USDT (não há cruzados tipo EUR/GBP nessa fonte).
const FOREX_BINANCE_CAND = {
    EURUSDT: 'EUR/USDT (Euro)',
    GBPUSDT: 'GBP/USDT (Libra)',
    AUDUSDT: 'AUD/USDT (Dólar AUS)',
    NZDUSDT: 'NZD/USDT (Dólar NZ)',
    AEURUSDT: 'AEUR/USDT (Euro stable)',
    EURIUSDT: 'EURI/USDT (Euro stable)'
};
let forexBinanceOk = [];   // preenchido após o exchangeInfo (só os pares reais)

// ---- FILTRO DE MOEDAS DO SCANNER (checklist "🎯 Moedas p/ análise") ----
// scanSel guarda só as EXCEÇÕES: uma moeda vale como marcada por padrão;
// só entra aqui quando o usuário desmarca (false) ou marca de volta (true).
let scanSel = JSON.parse(localStorage.getItem('scanSel') || '{}');
function scanChecked(s) { return scanSel[s] !== false; }
function scanUniverse() { return ehForex() ? Object.keys(PARES_YAHOO) : SCAN_CRIPTO.concat(forexBinanceOk); }
function scanLabel(s) { return PARES_YAHOO[s] ? PARES_YAHOO[s].label : (FOREX_BINANCE_CAND[s] || s); }
function salvarScanSel() { localStorage.setItem('scanSel', JSON.stringify(scanSel)); }
function atualizarScanFiltroMeta() {
    const m = document.getElementById('scanFiltroMeta');
    if (!m) return;
    const uni = scanUniverse();
    m.textContent = uni.filter(scanChecked).length + '/' + uni.length;
}
function renderScanFiltro() {
    const box = document.getElementById('scanFiltro');
    if (!box) return;
    box.innerHTML = scanUniverse().map(s =>
        `<label class="scan-fil"><input type="checkbox" data-sym="${s}"${scanChecked(s) ? ' checked' : ''}> <span>${scanLabel(s)}</span></label>`
    ).join('');
    box.querySelectorAll('input[data-sym]').forEach(cb => cb.addEventListener('change', function () {
        scanSel[this.dataset.sym] = this.checked;
        salvarScanSel();
        atualizarScanFiltroMeta();
    }));
    atualizarScanFiltroMeta();
}

async function escanear() {
    const f = fonte();
    if (f === 'sim') { showToast('Troque a fonte para Binance ou Forex para escanear.', 'err'); return; }
    const btn = document.getElementById('btnScan');
    btn.disabled = true; btn.textContent = 'Escaneando…';
    const loader = f === 'binance' ? carregarHistoricoBinance : f === 'twelvedata' ? carregarHistoricoTwelveData : carregarHistoricoYahoo;
    const lista = (f === 'binance' ? SCAN_CRIPTO.concat(forexBinanceOk) : Object.keys(PARES_YAHOO)).filter(scanChecked);
    if (!lista.length) { showToast('Marque ao menos uma moeda no filtro "🎯 Moedas p/ análise".', 'err'); btn.disabled = false; btn.textContent = '🔎 Escanear melhores entradas'; return; }
    const arg = f === 'binance' ? binanceInterval() : tfMinutes();
    const confMode = document.getElementById('confMode').value;
    const minScoreG = parseInt(document.getElementById('minScore').value);
    const dSave = dados;
    // Salva parâmetros e desliga o filtro HTF (não se aplica a outros símbolos no scan)
    const el = id => document.getElementById(id);
    const pIds = ['minScore', 'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas', 'useHtf', 'usePesoIA'];
    const pSave = {}; pIds.forEach(i => pSave[i] = el(i).type === 'checkbox' ? el(i).checked : el(i).value);
    el('useHtf').checked = false;
    el('usePesoIA').checked = false;   // peso é por par; no scan usamos os params já afinados
    htfTrend = [];
    const res = [];
    heatData = [];   // heatmap é reconstruído a cada varredura
    for (const s of lista) {
        try {
            const d = await comCache(f + '|' + s + '|' + arg + '|400', () => loader(s, arg, 400));
            if (!d || d.length < 210) continue;
            // Scanner + IA: aplica os melhores parâmetros já otimizados para este par,
            // preferindo o conjunto afinado para o REGIME atual do próprio ativo
            dados = d; recomputarIndicadores();
            const cc = iaCache[s + '|' + regimeUltimo()] || iaCache[s];
            const tuned = !!cc;
            if (cc) { el('minScore').value = cc.ms; el('rsiSobrevenda').value = cc.sv; el('rsiSobrecompra').value = cc.sc; el('estruturaLookback').value = cc.lk; el('cooldownVelas').value = cc.cd; }
            else { el('minScore').value = pSave.minScore; el('rsiSobrevenda').value = pSave.rsiSobrevenda; el('rsiSobrecompra').value = pSave.rsiSobrecompra; el('estruturaLookback').value = pSave.estruturaLookback; el('cooldownVelas').value = pSave.cooldownVelas; }
            const minScore = cc ? cc.ms : minScoreG;
            recomputarSinais();
            const { long, short, enabled } = confLive;
            const alvo = confMode === 'estrita' ? enabled : Math.min(minScore, enabled);
            const domScore = Math.max(long, short);
            heatData.push({
                s, label: PARES_YAHOO[s] ? PARES_YAHOO[s].label : s,
                score: Math.round(domScore / (enabled || 1) * 100),
                dir: long > short ? 1 : short > long ? -1 : 0
            });
            const wrLB = cc && cc.wrLB != null ? cc.wrLB : null;   // acerto validado (limite inferior 95%)
            if (long >= alvo && long > short) res.push({ s, dir: 1, score: long, enabled, tuned, wrLB });
            else if (short >= alvo && short > long) res.push({ s, dir: -1, score: short, enabled, tuned, wrLB });
        } catch (e) { }
    }
    renderHeat();
    pIds.forEach(i => { if (el(i).type === 'checkbox') el(i).checked = pSave[i]; else el(i).value = pSave[i]; });
    dados = dSave; recomputarIndicadores();
    if (el('useHtf').checked) { await carregarHtf(); }
    recomputarSinais();
    // Ranqueia por EDGE ESTATÍSTICO VALIDADO primeiro (pares cujo acerto no limite
    // inferior supera o break-even), depois pela força da confluência atual.
    const payoutSc = Math.max(0.01, (parseFloat(el('payout').value) || 87) / 100);
    const beWRSc = 1 / (1 + payoutSc);
    res.forEach(r => r.edgeLB = r.wrLB != null ? r.wrLB - beWRSc : null);
    res.sort((a, b) => {
        const va = a.edgeLB != null && a.edgeLB >= 0 ? 1 : 0, vb = b.edgeLB != null && b.edgeLB >= 0 ? 1 : 0;
        return vb - va || (b.edgeLB ?? -1) - (a.edgeLB ?? -1) || b.score - a.score;
    });
    document.getElementById('scanMeta').textContent = res.length + '/' + lista.length;
    const elList = document.getElementById('scanList');
    elList.innerHTML = res.length ? res.map(r => {
        const lbl = PARES_YAHOO[r.s] ? PARES_YAHOO[r.s].label : r.s;
        const tag = r.tuned ? ' <span class="scan-tuned" title="parâmetros otimizados pela IA">✦</span>' : '';
        const lbTag = r.wrLB != null ? ` <span class="${r.edgeLB >= 0 ? 'chip-dir-up' : 'chip-dir-down'}" title="acerto validado no limite inferior (95%) vs break-even ${pctTxt(beWRSc)}">${pctTxt(r.wrLB)}✓</span>` : '';
        return `<span class="decision-chip scan-item" data-s="${r.s}">${lbl}${tag} <span class="${r.dir === 1 ? 'chip-dir-up' : 'chip-dir-down'}">${r.dir === 1 ? '▲ CALL' : '▼ PUT'} ${r.score}/${r.enabled}</span>${lbTag}</span>`;
    }).join('') : '<span class="decision-context">Nenhuma moeda com entrada agora — afrouxe a confluência ou troque o timeframe.</span>';
    elList.querySelectorAll('.scan-item').forEach(x => x.addEventListener('click', () => {
        const s = x.getAttribute('data-s');
        document.getElementById('fonte').value = PARES_YAHOO[s] ? (ehForex() ? f : 'twelvedata') : 'binance';
        document.getElementById('symbol').value = s;
        montarWidgetTV(); carregar();
    }));
    document.getElementById('scanPanel').style.display = 'block';
    res.forEach(r => registrarEntrada(PARES_YAHOO[r.s] ? PARES_YAHOO[r.s].label : r.s, r.dir, r.score, r.enabled,
        { exp: (iaCache[r.s] && iaCache[r.s].exp) || parseInt(el('expiracao').value) || 5, sym: r.s, fonte: f }));
    if (res.length) renderRegistro();
    if (res.length && document.getElementById('somAtivo').checked) tocarSom(res[0].dir);
    btn.disabled = false; btn.textContent = '🔎 Escanear melhores entradas';
}

