// ============================================================================
// BLOCO 27 — ÍCONES INFORMATIVOS (clique em qualquer ícone → cartão explicando)
// ============================================================================
// Todo ícone do app vira porta de entrada de conhecimento: clicar mostra um
// popover com o QUE é, COMO usar e (quando existe) o botão "abrir painel" que
// leva direto pra área responsável. Cobre: emoji dos títulos dos painéis,
// tiles da topbar, chips de fatores e elos do funil. O rail já navega sozinho.

// ---- Dicionário: painéis (id → explicação) ----
const INFO_PAINEIS = {
    painelIntel: ['🧠 Inteligência', 'Leituras compactas de Price Action, Liquidez, Smart Money e Volume/Delta da última vela — o resumo do que o mercado está fazendo agora.'],
    painelSub: ['📊 RSI & ATR', 'RSI mede o momentum (sobrevenda <30 / sobrecompra >70). ATR mede a volatilidade — acima da média = mercado com energia pra andar.'],
    painelFluxo: ['🔄 Fluxo de Volume', 'Delta compra×venda por vela (só cripto/Binance): barras verdes = agressão compradora dominou; vermelhas = vendedora.'],
    heatPanel: ['🗺️ Heatmap', 'Todos os ativos marcados, coloridos pela força do sinal agora. Clique num ativo pra abrir.'],
    scanPanel: ['🔎 Scanner', 'Varre as moedas marcadas e ranqueia as melhores entradas do momento pela confluência + parâmetros da IA. Atalho: S.'],
    iaPanel: ['🤖 IA', 'Busca em grade + walk-forward que encontra os parâmetros de maior acerto por par e regime. Roda em segundo plano (Web Worker). Atalho: I.'],
    agentesPanel: ['🕵️ Agentes', '6 agentes autônomos: otimizador em rodízio, sentinela de regime, auditor de calibração, professor de fatores, 🔧 configurador e ✅ validador — com conserto em 1 clique no log.'],
    pilotoPanel: ['🎮 Piloto Automático', 'Paper trading numa conta DEMO simulada: registra sozinho as entradas que passam no gatilho (nível A / funil ≥5) e acompanha saldo, acerto e drawdown. Não toca em corretora.'],
    riscoPanel: ['🛡 Gestão de Risco', 'Calcula o stake ideal (banca × risco%), a meta e o stop do dia em R$, e um guardião que lê o placar real de hoje: avisa quando você bate a meta, o stop ou uma sequência de perdas. Saber a hora de parar é a habilidade nº 1 em binárias.'],
    watchPanel: ['⭐ Watchlist', 'Lista de observação: acompanha preço e variação % de vários ativos ao vivo (atualiza a cada 30s), ordenada pela maior variação. Clique numa linha para abrir o ativo no gráfico — ache rápido quem está se mexendo mais.'],
    proPanel: ['📊 Volume Profile & Níveis', 'Perfil de volume com POC/área de valor + níveis automáticos no gráfico (Fibonacci e S/R).'],
    bookPanel: ['📖 Book & Times/Trades', 'Profundidade do book e fita de negócios ao vivo (Binance): pressão compra×venda e agressões grandes em destaque.'],
    painelPA: ['🧭 Price Action — Entradas', 'S/R + Fibonacci + LTA/LTB + micro×macro + padrões (doji, harami, CHoCH, topo/fundo duplo, triângulo). A entrada de qualidade nasce no TESTE de uma zona de confluência.'],
    painelEntradas: ['🔔 Avisos de Entrada', 'Tabela dos sinais gerados no histórico carregado, com horário, preço e expiração — a matéria-prima do backtest.'],
    painelMetricas: ['📈 Métricas de Análise', 'Backtest dos sinais: acerto, LB de Wilson 95%, expectativa por operação, sequência máxima de perdas e curva de capital.'],
    estudoPanel: ['📚 Estudos de Mercado', 'Análises por sessão, dia da semana e volatilidade — onde o setup rende mais.'],
    painelTV: ['📺 TradingView', 'Gráfico oficial do TradingView sincronizado com o par e timeframe abertos (precisa de internet).'],
    painelNews: ['📰 Notícias', 'Manchetes em tempo real; o filtro de notícias bloqueia entradas perto de evento (janela configurável).'],
    painelStatus: ['🎯 Status', 'Resumo da conexão, fonte de dados e estado geral do app.'],
    trainPanel: ['🎓 Treino de Leitura', 'Replay vela a vela para treinar a leitura: o app esconde o futuro e você decide antes de revelar.'],
    chartPanel: ['💹 Gráfico principal', 'Velas + EMAs 9/21/200 + sinais de entrada. Toggle 📐 traça LTA/LTB; toggle de níveis desenha Fibonacci e S/R.'],
    registroPanel: ['🗓️ Registro de Entradas', 'A memória REAL do app: cada virada de veredito vira uma linha, verificada como WIN/LOSS após a expiração. Alimenta a calibração, os pesos reais e o relatório. Clique numa linha pra ver o retrato completo.'],
    decisionPanel: ['🧠 Decisão Agora', 'O veredito ao vivo: fatores de confluência, portões (HTF/S-R/sessão/notícia/PA), selo A-B-C e funil de qualidade 0–6. Só notifica nível A.']
};

// ---- Dicionário: tiles da topbar (id do span → explicação) ----
const INFO_METRICAS = {
    qoMercado: ['Mercado Atual', 'Viés dominante da leitura ao vivo: BULLISH (compra), BEARISH (venda) ou NEUTRO — resumo dos fatores de confluência.'],
    qoConf: ['Confiança', 'Força do lado dominante: % dos fatores ligados apontando na mesma direção. Anel cheio = confluência total.'],
    qoRegime: ['Regime', 'Caráter do mercado agora: 📈 tendencial (segue), ↔ lateral (reverte nas bandas) ou 🔥 volátil (reduz exposição). A IA guarda parâmetros por regime.'],
    qoVolat: ['Volatilidade', 'ATR atual vs a média: Alta = movimento com energia (bom p/ rompimento), Baixa = mercado parado (sinais fracos).'],
    qoSessao: ['Sessão', 'Sessão de mercado ativa (Londres / Nova York / Ásia). Londres+NY concentram o volume — o portão de sessão opera só nelas.'],
    qoAprov: ['Operações Aprovadas', 'Sinais do histórico que passaram por TODOS os portões de qualidade.'],
    qoBloq: ['Bloqueadas', 'Sinais barrados pelos portões (HTF, S/R, sessão, notícia, PA) — o filtro trabalhando a seu favor.'],
    qoExpect: ['Expectativa Matemática', 'R$ esperado por R$1 arriscado, dado o acerto do backtest e o payout: positivo = paga no longo prazo; negativo = não opere.']
};

// ---- Dicionário: fatores de confluência (nome no chip → explicação) ----
const INFO_FATORES = {
    'Tendência': 'Cruzamento das EMAs rápida×lenta (9×21): rápida acima = viés de alta. É o fator de direção básico.',
    'EMA 200': 'Posição do preço vs a média de 200 períodos — o viés macro. Operar contra ela exige motivo forte.',
    'RSI': 'Reversão do momentum: saiu de sobrevenda cruzando pra cima = CALL; de sobrecompra pra baixo = PUT.',
    'ATR': 'Volatilidade acima da média (não-direcional): confirma que o mercado tem energia pro movimento.',
    'Estrutura': 'Rompimento do topo/fundo recente (lookback configurável) — o mercado saiu do range.',
    'Fluxo': 'Delta compra×venda na janela (só cripto): agressão dominante indica o lado do dinheiro.',
    'Correlação': 'Maioria dos pares de referência apontando na mesma direção — o setor confirma.',
    'Padrão': 'Vela de reversão (engolfo/martelo) confirmando o sinal na última vela.',
    'MACD': 'Histograma do MACD: positivo e subindo = momentum de alta; negativo e caindo = de baixa.',
    'Bollinger': 'Fechamento fora das bandas 2σ = esticado demais — sinal de reversão à média.',
    'PA zona': 'Portão de Price Action: mostra o lado da zona (suporte/LTA ▲ ou resistência/LTB ▼) a ≤ X ATR. Com o filtro ligado, só entra no TESTE de uma zona.'
};

// ---- Dicionário: elos do funil ----
const INFO_ELOS = {
    'Regime': 'Os fatores ligados casam com o preset do regime detectado? Estratégia errada pro mercado atual derruba o acerto.',
    'Confluência': 'Lado dominante com ≥4 fatores ou ≥70% dos ligados — sinal com participação de verdade, não empate.',
    'Portões': 'HTF a favor, longe de S/R contrário, sessão forte e sem notícia próxima — o contexto libera a entrada.',
    'Evidência': 'Amostra ≥10 operações E expectativa positiva no limite inferior de Wilson — edge provado, não sorte.',
    'Calibração': 'A previsão da IA está batendo com o placar REAL do Registro? IA otimista = reotimizar antes de confiar.',
    'Execução': 'Expiração 1–6× o timeframe e payout ≥80% — a mecânica da operação não pode sabotar o edge.'
};

// ---- Popover ----
let _infoPop = null;
function mostrarInfoPop(x, y, titulo, corpo, acaoRotulo, acaoFn) {
    fecharInfoPop();
    const p = document.createElement('div');
    p.id = 'infoPop';
    p.innerHTML = `<div class="ip-tit">${titulo}</div><div class="ip-corpo">${corpo}</div>` +
        (acaoRotulo ? `<button type="button" class="btn-mini ip-acao">${acaoRotulo}</button>` : '');
    document.body.appendChild(p);
    const W = p.offsetWidth || 300, H = p.offsetHeight || 120;
    p.style.left = Math.max(8, Math.min(window.innerWidth - W - 8, x - W / 2)) + 'px';
    p.style.top = Math.max(8, Math.min(window.innerHeight - H - 8, y + 14)) + 'px';
    if (acaoFn) p.querySelector('.ip-acao').addEventListener('click', () => { fecharInfoPop(); acaoFn(); });
    _infoPop = p;
}
function fecharInfoPop() { if (_infoPop) { _infoPop.remove(); _infoPop = null; } }

// Abre o painel responsável (mostra no rail, revela e rola até ele)
function irParaPainel(id) {
    try { if (typeof railMostrar === 'function') railMostrar(id); } catch (e) { }
    const el = document.getElementById(id);
    if (el) { el.style.display = ''; el.classList.remove('painel-oculto'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

// ---- Envolve o emoji inicial de cada título de painel num alvo clicável ----
function prepararIconesTitulos() {
    document.querySelectorAll('.chart-container').forEach(cc => {
        const h2 = cc.querySelector(':scope > h2');
        if (!h2 || !h2.firstChild || h2.firstChild.nodeType !== 3) return;
        if (!INFO_PAINEIS[cc.id]) return;    // só envolve quando há explicação p/ mostrar
        const txt = h2.firstChild.nodeValue;
        const m = txt.match(/^\s*(\S+)\s/);
        if (!m || /\w/.test(m[1])) return;   // só se o 1º token for ícone (sem letras/números)
        const span = document.createElement('span');
        span.className = 'ico-info';
        span.title = 'clique: o que é este painel';
        span.textContent = m[1];
        span.dataset.painel = cc.id;
        h2.firstChild.nodeValue = txt.slice(m[0].length - 1);
        h2.insertBefore(span, h2.firstChild);
    });
    // painel de decisão não é .chart-container: registra pelo seletor próprio
    const dp = document.querySelector('.decision-panel');
    if (dp && !dp.id) dp.id = 'decisionPanel';
}

// ---- Delegação global de cliques ----
document.addEventListener('click', function (e) {
    if (_infoPop && !_infoPop.contains(e.target)) fecharInfoPop();

    // 1) emoji do título do painel → info do painel (sem recolher o card)
    const ico = e.target.closest('.ico-info');
    if (ico) {
        e.stopPropagation();
        const id = ico.dataset.painel || (ico.closest('.chart-container') || {}).id;
        const inf = INFO_PAINEIS[id];
        if (inf) mostrarInfoPop(e.clientX, e.clientY, inf[0], inf[1]);
        return;
    }
    // 2) tile da topbar → info da métrica
    const stat = e.target.closest('.qo-stat');
    if (stat) {
        const id = [...stat.querySelectorAll('span[id]')].map(s => s.id).find(i => INFO_METRICAS[i]);
        const inf = id && INFO_METRICAS[id];
        if (inf) mostrarInfoPop(e.clientX, e.clientY, '📊 ' + inf[0], inf[1], 'abrir Decisão Agora', () => irParaPainel('decisionPanel'));
        return;
    }
    // 3) chip de fator → info do fator
    const chip = e.target.closest('.decision-chip');
    if (chip && chip.closest('#decisionChips')) {
        const nome = Object.keys(INFO_FATORES).find(n => chip.textContent.indexOf(n) === 0);
        if (nome) mostrarInfoPop(e.clientX, e.clientY, '🎯 ' + nome, INFO_FATORES[nome] +
            (chip.classList.contains('chip-off') ? '<br><em>Este fator está DESLIGADO — ligue nos controles p/ entrar na confluência.</em>' : ''));
        return;
    }
    // 4) elo do funil → info do elo
    const elo = e.target.closest('.funil-elo');
    if (elo) {
        const nome = Object.keys(INFO_ELOS).find(n => elo.textContent.includes(n));
        if (nome) mostrarInfoPop(e.clientX, e.clientY, '🔗 Elo: ' + nome,
            INFO_ELOS[nome] + '<br><em>Estado agora: ' + (elo.title || '—') + '</em>');
        return;
    }
}, true);

document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharInfoPop(); });
document.addEventListener('DOMContentLoaded', prepararIconesTitulos);
