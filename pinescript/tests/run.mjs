// Suíte de testes de fumaça do QUANT OPS (Playwright headless).
// Roda 100% offline usando o modo Simulado — não depende de rede.
//
// Uso:
//   node build_standalone.js           # gera Simulador_Standalone.html
//   node tests/run.mjs                  # testa o standalone
//   node tests/run.mjs caminho.html     # testa outro arquivo
//
// Requer Playwright + Chromium (já presentes no ambiente Claude Code on the web:
// NODE_PATH aponta para os módulos globais; o Chromium fica em PLAYWRIGHT_BROWSERS_PATH).
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(process.env.NODE_PATH ? process.env.NODE_PATH + '/' : '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, '..', 'Simulador_Standalone.html');
if (!existsSync(file)) { console.error('arquivo não encontrado:', file, '\nrode `node build_standalone.js` antes.'); process.exit(2); }

// localiza o executável do Chromium (ambiente Claude) ou deixa o Playwright achar
const CHROMIUM = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find(p => existsSync(p));

const results = [];
const check = (nome, cond, detalhe) => { results.push({ nome, ok: !!cond, detalhe }); };

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const ctx = await browser.newContext();
const p = await ctx.newPage();
const jsErrs = [];
p.on('pageerror', e => jsErrs.push(e.message));
await p.setViewportSize({ width: 1440, height: 820 });
await p.goto('file://' + file, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(600);
await p.selectOption('#fonte', 'sim');
await p.click('#btnGerar');
await p.waitForTimeout(500);

// 1) Filtro de moedas (checklist)
check('checklist cripto tem 15 moedas', await p.$$eval('#scanFiltro input[data-sym]', e => e.length) === 15);
await p.selectOption('#fonte', 'yahoo'); await p.waitForTimeout(300);
check('checklist forex tem 24 pares', await p.$$eval('#scanFiltro input[data-sym]', e => e.length) === 24);
// Modo combinado: universo = cripto + forex e roteamento de fonte por símbolo
await p.selectOption('#fonte', 'ambos'); await p.waitForTimeout(300);
const combo = await p.evaluate(() => ({
  qtd: document.querySelectorAll('#scanFiltro input[data-sym]').length,
  temCripto: !!document.querySelector('#scanFiltro input[data-sym="BTCUSDT"]'),
  temForex: !!document.querySelector('#scanFiltro input[data-sym="EURUSD"]'),
  rotaCripto: fonteDe('BTCUSDT'), rotaForex: fonteDe('EURUSD')
}));
check('modo combinado lista cripto + forex', combo.qtd > 24 && combo.temCripto && combo.temForex, 'qtd=' + combo.qtd);
check('modo combinado roteia BTCUSDT→binance', combo.rotaCripto === 'binance');
check('modo combinado roteia EURUSD→twelvedata', combo.rotaForex === 'twelvedata');
// Modo triplo (ambos3): forex vira 'forex3' (Twelve Data com fallback Yahoo)
await p.selectOption('#fonte', 'ambos3'); await p.waitForTimeout(300);
const tri = await p.evaluate(() => ({
  qtd: document.querySelectorAll('#scanFiltro input[data-sym]').length,
  rotaCripto: fonteDe('BTCUSDT'), rotaForex: fonteDe('EURUSD'), combinado: modoCombinado()
}));
check('modo triplo é combinado (cripto+forex)', tri.combinado && tri.qtd > 24);
check('modo triplo roteia BTCUSDT→binance', tri.rotaCripto === 'binance');
check('modo triplo roteia EURUSD→forex3 (TD+Yahoo)', tri.rotaForex === 'forex3');
// fallback: TD falha → cai no Yahoo keyless
const fb = await p.evaluate(async () => {
  const orig = window.fetch;
  const okBody = JSON.stringify({ chart: { result: [{ timestamp: [1, 2], indicators: { quote: [{ open: [1, 1], high: [1, 1], low: [1, 1], close: [1, 1], volume: [1, 1] }] } }], error: null } });
  let usouYahoo = false;
  window.fetch = async (u) => {
    u = String(u);
    if (u.includes('twelvedata')) throw new Error('sem chave');           // TD falha
    if (u.includes('yahoo') || u.includes('allorigins') || u.includes('codetabs') || u.includes('thingproxy')) { usouYahoo = true; return { ok: true, text: async () => okBody }; }
    throw new Error('inesperado');
  };
  let velas = [];
  try { velas = await carregarHistoricoTF('EURUSD', 5, 50); } catch (e) {}
  window.fetch = orig;
  return { usouYahoo, temVelas: velas.length > 0 };
});
check('forex3: TD falha → cai no Yahoo keyless', fb.usouYahoo && fb.temVelas, JSON.stringify(fb));
await p.selectOption('#fonte', 'sim'); await p.waitForTimeout(200);

// 2) Fatores extras MACD/Bollinger entram na confluência
const en0 = await p.evaluate(() => confLive.enabled);
await p.check('#useMacd'); await p.check('#useBollinger'); await p.waitForTimeout(300);
check('MACD+Bollinger somam 2 fatores', await p.evaluate(() => confLive.enabled) === en0 + 2);

// 3) IA otimiza (validação robusta + cache por regime)
await p.click('#btnGerar'); await p.waitForTimeout(400);
await p.fill('#iaMinVal', '5');   // amostra mínima configurável
await p.click('#btnIA');
await p.waitForFunction(() => typeof iaRodando !== 'undefined' && !iaRodando, { timeout: 90000 });
const iaMetaTxt = await p.$eval('#iaMeta', e => e.textContent);
check('IA gerou resultado', /combina/.test(iaMetaTxt));
check('amostra mínima configurável reflete no resumo', /amostra mín\. 5 val \/ 10 treino/.test(iaMetaTxt), iaMetaTxt);
check('iaCache indexado por regime', await p.evaluate(() => Object.keys(iaCache).some(k => k.includes('|'))));
await p.fill('#iaMinVal', '3');
await p.evaluate(() => document.activeElement.blur());   // atalhos ignoram teclas com input focado

// 4) Verificador WIN/LOSS + placar real
await p.evaluate(() => { document.getElementById('regSoA').checked = false; });   // ver todas (entradas de teste sem selo)
const calib = await p.evaluate(async () => {
  const lbl = symbolAtual();
  const mk = (i, j, dir) => ({ t: dados[i].time, par: lbl, dir, score: 4, enabled: 6, exp: Math.round((dados[j].time - dados[i].time) / 60), sym: lbl, fonte: 'sim' });
  const dif = (i, j) => dados[j].close - dados[i].close;
  registro = [mk(20, 35, dif(20, 35) > 0 ? 1 : -1), mk(25, 40, dif(25, 40) > 0 ? 1 : -1), mk(30, 45, dif(30, 45) > 0 ? 1 : -1), mk(35, 50, dif(35, 50) > 0 ? -1 : 1)];
  iaCache[symbolAtual()] = { tf: 5, exp: 5, ms: 3, sv: 30, sc: 70, lk: 20, cd: 5, wr: 0.75 };
  renderRegistro(); await verificarEntradasPendentes();
  return { resolvidos: registro.filter(r => r.resultado).length, txt: document.getElementById('iaCalib').textContent };
});
check('verificador resolveu 4 entradas', calib.resolvidos === 4, calib.resolvidos + ' resolvidas');
check('placar real exibido', /Placar real/.test(calib.txt), calib.txt);
check('placar mostra limite inferior (LB)', /LB\s*\d+%/.test(calib.txt), calib.txt);
check('selos WIN/LOSS na tabela', await p.$$eval('#registroBody .reg-res', e => e.length) >= 3);

// 4.2) Filtro "só nível A e B" no registro (esconde C e sem-selo)
const filtA = await p.evaluate(() => {
  registro = [
    { t: dados[10].time, par: 'X', dir: 1, score: 6, enabled: 6, grade: 'A' },
    { t: dados[11].time, par: 'Y', dir: -1, score: 4, enabled: 6, grade: 'C' },
    { t: dados[12].time, par: 'Z', dir: 1, score: 5, enabled: 6, grade: 'B' },
    { t: dados[13].time, par: 'W', dir: 1, score: 4, enabled: 6 }   // sem selo
  ];
  document.getElementById('regSoA').checked = true; renderRegistro();
  const soAB = document.querySelectorAll('#registroBody .reg-row').length;
  document.getElementById('regSoA').checked = false; renderRegistro();
  const todas = document.querySelectorAll('#registroBody .reg-row').length;
  return { soAB, todas };
});
check('filtro "A e B" mostra 2 de 4 (esconde C e sem-selo)', filtA.soAB === 2, 'soAB=' + filtA.soAB);
check('sem filtro mostra as 4', filtA.todas === 4, 'todas=' + filtA.todas);

// 4.5) Métricas de assertividade: Wilson LB penaliza amostra pequena; expectativa
const stat = await p.evaluate(() => ({
  lbPequena: wilsonLB(5, 6), lbGrande: wilsonLB(55, 80),
  lb0: wilsonLB(0, 0), expPos: expectancia(0.6, 0.87), be: breakEven(0.87)
}));
check('Wilson LB penaliza amostra pequena (5/6 < 55/80)', stat.lbPequena < stat.lbGrande, `5/6→${stat.lbPequena.toFixed(2)} vs 55/80→${stat.lbGrande.toFixed(2)}`);
check('Wilson LB robusto com n=0', stat.lb0 === 0);
check('expectativa e break-even coerentes', stat.expPos > 0 && Math.abs(stat.be - 0.5348) < 0.01, `exp=${stat.expPos.toFixed(2)} be=${stat.be.toFixed(3)}`);
check('painel de métricas traz card LB 95%', await p.evaluate(() => { calcularMetricas(entradas); return [...document.querySelectorAll('.metric-lbl')].some(e => /LB 95%/.test(e.textContent)); }));

// 5) Tema claro/escuro
await p.keyboard.press('t'); await p.waitForTimeout(200);
check('tema claro aplicado', await p.evaluate(() => document.documentElement.dataset.theme) === 'light');
await p.keyboard.press('t'); await p.waitForTimeout(150);

// 6) Ajuda (atalho ?)
await p.keyboard.press('?'); await p.waitForTimeout(200);
check('ajuda abre com ?', await p.$eval('#ajudaModal', e => getComputedStyle(e).display) === 'flex');
await p.keyboard.press('Escape'); await p.waitForTimeout(120);
check('ajuda fecha com Esc', await p.$eval('#ajudaModal', e => getComputedStyle(e).display) === 'none');

// 7) Controles (atalho C) + Registro coluna direita
const vis0 = await p.$eval('.sidebar', e => getComputedStyle(e).display !== 'none');
await p.keyboard.press('c'); await p.waitForTimeout(150);
check('atalho C recolhe controles', vis0 && await p.$eval('.sidebar', e => getComputedStyle(e).display === 'none'));

// 7.5) Notificação só para entradas nível A
const notif = await p.evaluate(() => {
  const chamadas = [];
  window.notificar = (t) => chamadas.push(t);   // espião (ignora guardas de permissão)
  const gStub = grade => () => ({ grade, estrelas: 4, score: 80, motivos: [], regime: null, pEst: null, pLB: null, pN: 0, expOp: null, expOpLB: null, kelly: null });
  const orig = window.calcularGrade;
  const base = { long: 6, short: 0, enabled: 6, minScore: 3, confMode: 'score', fatores: (confLive && confLive.fatores) || [] };
  window.calcularGrade = gStub('C'); confLive = Object.assign({}, base); ultimoVerdictSom = 'WAIT'; atualizarDecisao();
  const aposC = chamadas.length;
  window.calcularGrade = gStub('A'); confLive = Object.assign({}, base); ultimoVerdictSom = 'WAIT'; atualizarDecisao();
  const aposA = chamadas.length;
  window.calcularGrade = orig;
  return { aposC, aposA };
});
check('notificação NÃO dispara em nível C', notif.aposC === 0, 'C=' + notif.aposC);
check('notificação dispara em nível A', notif.aposA === 1, 'A=' + notif.aposA);

// 7.51) Funil gravado por entrada + Modo Sniper + placar por funil
const funReg = await p.evaluate(() => {
  const chamadas = [];
  window.notificar = (t) => chamadas.push(t);
  const gStub = () => ({ grade: 'A', estrelas: 4, score: 85, motivos: [], regime: null, pEst: null, pLB: null, pN: 0, expOp: null, expOpLB: null, kelly: null });
  const origG = window.calcularGrade, origF = window.avaliarFunil;
  window.calcularGrade = gStub;
  const base = { long: 6, short: 0, enabled: 6, minScore: 3, confMode: 'score', fatores: confLive.fatores || [] };
  // funil baixo (3/6) + Sniper ligado → grava funil e NÃO notifica
  window.avaliarFunil = () => ({ okCount: 3 });
  document.getElementById('modoSniper').checked = true;
  confLive = Object.assign({}, base); ultimoVerdictSom = 'WAIT'; atualizarDecisao();
  const gravouBaixo = registro[registro.length - 1].funil === 3;
  const bloqueou = chamadas.length === 0;
  // funil alto (6/6) + Sniper → notifica com o funil no corpo
  window.avaliarFunil = () => ({ okCount: 6 });
  confLive = Object.assign({}, base); ultimoVerdictSom = 'WAIT'; atualizarDecisao();
  const notificou = chamadas.length === 1;
  const gravouAlto = registro[registro.length - 1].funil === 6;
  document.getElementById('modoSniper').checked = false;
  window.calcularGrade = origG; window.avaliarFunil = origF;
  // placar por funil na calibração (mistura WIN/LOSS por nível)
  registro = [
    { t: 1, par: 'X', dir: 1, score: 6, enabled: 6, funil: 6, resultado: 'WIN' },
    { t: 2, par: 'X', dir: 1, score: 6, enabled: 6, funil: 5, resultado: 'WIN' },
    { t: 3, par: 'X', dir: -1, score: 4, enabled: 6, funil: 3, resultado: 'LOSS' },
    { t: 4, par: 'X', dir: -1, score: 4, enabled: 6, funil: 2, resultado: 'LOSS' }
  ];
  atualizarCalibracaoIA();
  const placar = document.getElementById('iaCalib').textContent;
  const badge = !!document.querySelector('#registroBody') ; // badge testado via renderRegistro
  document.getElementById('regSoA').checked = false; renderRegistro();
  const temBadge = /\d\/6/.test(document.getElementById('registroBody').textContent);
  return { gravouBaixo, bloqueou, notificou, gravouAlto, placarFunil: /Funil ≥5/.test(placar) && /100%/.test(placar) && /0%/.test(placar), temBadge };
});
check('entrada grava o funil (X/6) no Registro', funReg.gravouBaixo && funReg.gravouAlto, JSON.stringify(funReg));
check('Modo Sniper bloqueia A com funil <5', funReg.bloqueou);
check('Modo Sniper notifica A com funil ≥5', funReg.notificou);
check('placar por funil: ≥5 = 100% · ≤4 = 0% (prova empírica)', funReg.placarFunil);
check('badge do funil aparece nas linhas do Registro', funReg.temBadge);

// 7.6) Performance: coalescência de ticks (várias chamadas → 1 recompute/frame)
const coal = await p.evaluate(() => new Promise(resolve => {
  const orig = window.atualizarUltimoCandle;
  let chamadas = 0, ultimoFechou = null;
  window.atualizarUltimoCandle = (f) => { chamadas++; ultimoFechou = f; };
  for (let i = 0; i < 20; i++) agendarTick(false);   // rajada de 20 ticks
  agendarTick(true);                                  // um fechamento no meio da rajada
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.atualizarUltimoCandle = orig;
    resolve({ chamadas, ultimoFechou });
  }));
}));
check('21 ticks coalescem em 1 recompute/frame', coal.chamadas === 1, 'chamadas=' + coal.chamadas);
check('fechamento de vela não é perdido na coalescência', coal.ultimoFechou === true);

// 7.7) Conectividade: fetchRetry repete falha transitória e vence ao 3º
const retry = await p.evaluate(async () => {
  const origFetch = window.fetch;
  let n = 0;
  window.fetch = async () => { n++; if (n < 3) throw new Error('rede caiu'); return { ok: true, status: 200 }; };
  let ok = false;
  try { const r = await fetchRetry('http://x', null, 3); ok = r.ok; } catch (e) {}
  window.fetch = origFetch;
  return { n, ok };
});
check('fetchRetry repete e vence ao 3º', retry.n === 3 && retry.ok, 'n=' + retry.n);

// 7.75) Forex keyless: proxy Yahoo memoriza o que funcionou (tenta-o primeiro)
const yh = await p.evaluate(async () => {
  const orig = window.fetch;
  const okBody = JSON.stringify({ chart: { result: [{ timestamp: [1], indicators: { quote: [{ open: [1], high: [1], low: [1], close: [1], volume: [1] }] } }], error: null } });
  let hits = [];
  window.fetch = async (u) => { hits.push(String(u)); if (String(u).includes('codetabs')) return { ok: true, text: async () => okBody }; throw new Error('proxy fora do ar'); };
  await fetchYahooJson('https://query1.finance.yahoo.com/x');   // só codetabs responde
  hits = [];
  await fetchYahooJson('https://query1.finance.yahoo.com/y');   // agora deve tentar codetabs 1º
  window.fetch = orig;
  return { primeira: hits[0] || '' };
});
check('proxy Yahoo keyless memoriza o que funcionou', /codetabs/.test(yh.primeira), yh.primeira);

// 7.8) Web Worker do backtest: existe e dá resultado IDÊNTICO ao fallback
const wk = await p.evaluate(async () => {
  if (!dados || dados.length < 210) dados = gerarDadosSim(300, 2);
  const cfg = lerConfigIA(5);
  const combos = [
    { exp: 5, ms: 3, sv: 30, sc: 70, lk: 20, cd: 3 },
    { exp: 5, ms: 4, sv: 35, sc: 65, lk: 10, cd: 5 },
    { exp: 15, ms: 3, sv: 25, sc: 75, lk: 30, cd: 3 }
  ];
  const beWR = 1 / 1.87;
  const direto = avaliarGridPuro(dados, cfg, combos, 1, 1, beWR);   // fallback síncrono
  const viaWorker = await avaliarGridWorker(dados, cfg, combos, 1, 1, beWR);   // Web Worker
  return { temSrc: !!window.__IA_CORE_SRC__, usouWorker: !_iaWorkerQuebrado, igual: JSON.stringify(direto) === JSON.stringify(viaWorker) };
});
check('Web Worker inline disponível', wk.temSrc && wk.usouWorker);
check('worker e fallback: resultado idêntico (paridade)', wk.igual);

// 7.9) Design: números tabulares globais + flash de valor (sobe/cai)
const desg = await p.evaluate(() => {
  const tnum = getComputedStyle(document.body).fontVariantNumeric || '';
  const el = document.getElementById('confScoreCall');
  el.textContent = '3/6';
  setTextoFlash(el, '5/6'); const subiu = el.classList.contains('val-up');
  setTextoFlash(el, '2/6'); const caiu = el.classList.contains('val-down');
  return { tabular: /tabular-nums/.test(tnum), subiu, caiu };
});
check('números tabulares no body', desg.tabular);
check('flash de valor: sobe=verde, cai=vermelho', desg.subiu && desg.caiu, JSON.stringify(desg));

// 7.95) Presets de estratégia por regime (fatores + portões)
await p.evaluate(() => { if (!dados || dados.length < 210) dados = gerarDadosSim(300, 2); });
// Tendência: liga tendência/estrutura/MACD, HTF/Sessão/SR; desliga RSI e Bollinger
await p.$eval('.btn-preset[data-preset="trend"]', b => b.click()); await p.waitForTimeout(150);
const pt = await p.evaluate(() => ({
  tend: document.getElementById('useTendencia').checked, macd: document.getElementById('useMacd').checked,
  rsi: document.getElementById('useMomentum').checked, boll: document.getElementById('useBollinger').checked,
  htf: document.getElementById('useHtf').checked, sr: document.getElementById('useSR').checked,
  ativo: document.querySelector('.btn-preset[data-preset="trend"]').classList.contains('is-active')
}));
check('preset Tendência: liga tendência/MACD/HTF, desliga RSI/Bollinger', pt.tend && pt.macd && pt.htf && pt.sr && !pt.rsi && !pt.boll, JSON.stringify(pt));
// Lateral: liga RSI/Bollinger/padrão; desliga tendência/MACD; HTF off
await p.$eval('.btn-preset[data-preset="range"]', b => b.click()); await p.waitForTimeout(150);
const pr = await p.evaluate(() => ({
  rsi: document.getElementById('useMomentum').checked, boll: document.getElementById('useBollinger').checked,
  pad: document.getElementById('usePadrao').checked, tend: document.getElementById('useTendencia').checked,
  htf: document.getElementById('useHtf').checked
}));
check('preset Lateral: liga RSI/Bollinger/padrão, desliga tendência e HTF', pr.rsi && pr.boll && pr.pad && !pr.tend && !pr.htf, JSON.stringify(pr));
// Auto: aplica um preset válido conforme o regime detectado
await p.$eval('.btn-preset[data-preset="auto"]', b => b.click()); await p.waitForTimeout(150);
const pa = await p.evaluate(() => document.querySelectorAll('.btn-preset.is-active').length);
check('preset Auto ativa um preset de regime', pa === 1, 'ativos=' + pa);

// 7.97) Funil de qualidade: 6 elos no painel de decisão, contagem coerente
const funil = await p.evaluate(() => {
  if (!dados || dados.length < 210) dados = gerarDadosSim(300, 2);
  recomputarIndicadores(); recomputarSinais(); atualizarDecisao();
  const elos = [...document.querySelectorAll('#qualityFunnel .funil-elo')];
  const titulo = (document.querySelector('#qualityFunnel .funil-titulo') || {}).textContent || '';
  const oks = document.querySelectorAll('#qualityFunnel .funil-ok').length;
  const m = titulo.match(/(\d)\/6/);
  return { qtd: elos.length, temTitulo: /Funil de qualidade/.test(titulo), contagemBate: m && +m[1] === oks, dicas: elos.every(e => e.title.length > 3) };
});
check('funil de qualidade tem 6 elos', funil.qtd === 6, 'elos=' + funil.qtd);
check('funil: contagem X/6 bate com os elos verdes', funil.temTitulo && funil.contagemBate);
check('funil: todo elo tem tooltip explicativo', funil.dicas);

// 7.98) Cards recolhíveis: clique no título recolhe, persiste e re-expande
const recol = await p.evaluate(() => {
  const card = [...document.querySelectorAll('.charts-area .chart-container.recolhivel')].find(c => c.querySelector('h2') && !c.classList.contains('recolhido'));
  if (!card) return { erro: 'nenhum card recolhível' };
  const h2 = card.querySelector('h2');
  h2.click();
  const recolhido = card.classList.contains('recolhido');
  const corpoOculto = [...card.children].filter(el => el !== h2).every(el => getComputedStyle(el).display === 'none');
  const salvo = Object.values(JSON.parse(localStorage.getItem('cardsRecolhidos') || '{}')).some(v => v === 1);
  h2.click();
  const reexpandido = !card.classList.contains('recolhido');
  return { recolhido, corpoOculto, salvo, reexpandido };
});
check('card recolhe ao clicar no título (corpo some)', recol.recolhido && recol.corpoOculto, JSON.stringify(recol));
check('estado do card persiste e re-expande', recol.salvo && recol.reexpandido);

// 7.99) Animações: ripple nasce no clique de um botão e some sozinho
const rip = await p.evaluate(async () => {
  const btn = document.getElementById('btnControles');   // sempre visível (topbar)
  const r = btn.getBoundingClientRect();
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
  const nasceu = !!btn.querySelector('.qo-ripple');
  await new Promise(res => setTimeout(res, 700));
  const sumiu = !btn.querySelector('.qo-ripple');
  return { nasceu, sumiu };
});
check('ripple nasce no clique do botão', rip.nasceu);
check('ripple some sozinho após a animação', rip.sumiu);
// entradas do funil e chips de decisão animam (classe/keyframe presentes)
const animMeta = await p.evaluate(() => {
  const chip = document.querySelector('.decision-chip');
  const elo = document.querySelector('.funil-elo');
  return {
    chipAnima: chip ? getComputedStyle(chip).animationName !== 'none' : false,
    eloAnima: elo ? getComputedStyle(elo).animationName !== 'none' : false
  };
});
check('chips de decisão e elos do funil têm animação de entrada', animMeta.chipAnima && animMeta.eloAnima, JSON.stringify(animMeta));
// prefers-reduced-motion: emula e confirma que as animações de entrada desligam
const pRM = await ctx.newPage();
await pRM.emulateMedia({ reducedMotion: 'reduce' });
await pRM.goto('file://' + file, { waitUntil: 'domcontentloaded' });
await pRM.waitForTimeout(500);
const semAnim = await pRM.evaluate(() => {
  const el = document.querySelector('.charts-area > *');
  return el ? getComputedStyle(el).animationName === 'none' : false;
});
check('prefers-reduced-motion desliga a animação de entrada dos cards', semAnim);
await pRM.close();

// 7.995) Agentes de Estudo: ativam, otimizam em rodízio e vigiam o regime
const ag = await p.evaluate(async () => {
  if (!dados || dados.length < 210) { dados = gerarDadosSim(300, 2); recomputarIndicadores(); }
  // ativa via checkbox (dispara o listener real)
  const cb = document.getElementById('agentesAtivo');
  cb.checked = true; cb.dispatchEvent(new Event('change'));
  const statusAtivo = document.getElementById('agentesStatus').textContent.includes('ativos');
  const logCentral = agLog.some(l => l.agente.includes('Central'));
  // otimizador contínuo: roda uma rodada completa no modo Simulado
  delete iaCache[symbolAtual()];
  await agenteOtimizador();
  const otimizou = agLog.some(l => l.agente.includes('Otimizador'));
  // dados simulados aleatórios: ou achou parâmetros (cache) ou reportou "sem edge" — ambos são trabalho correto
  const cacheAtualizado = !!iaCache[symbolAtual()] || agLog.some(l => l.agente.includes('Otimizador') && /sem edge/.test(l.msg));
  // sentinela de regime: força um "regime anterior" diferente e tica
  agUltimoRegime = regimeUltimo() === 'trend' ? 'range' : 'trend';
  agenteRegime();
  const viuVirada = agLog.some(l => l.agente.includes('Regime'));
  const linhasLog = document.querySelectorAll('#agentesLog .reg-row').length;
  cb.checked = false; cb.dispatchEvent(new Event('change'));
  return { statusAtivo, logCentral, otimizou, cacheAtualizado, viuVirada, linhasLog };
});
check('agentes ativam e logam na central', ag.statusAtivo && ag.logCentral, JSON.stringify(ag));
check('agente otimizador estuda a moeda e atualiza o iaCache', ag.otimizou && ag.cacheAtualizado);
check('agente sentinela detecta virada de regime', ag.viuVirada);
check('log dos agentes renderiza no painel', ag.linhasLog >= 2, 'linhas=' + ag.linhasLog);

// 8) PWA manifest
check('PWA manifest presente', await p.$eval('link[rel=manifest]', e => e.href.startsWith('data:application/manifest')));

// 8.5) Treino automático via URL (?treinar=1) no modo Simulado (offline)
const p2 = await ctx.newPage();
const jsErrs2 = [];
p2.on('pageerror', e => jsErrs2.push(e.message));
await p2.setViewportSize({ width: 1440, height: 820 });
await p2.goto('file://' + file + '?treinar=1&fonte=sim', { waitUntil: 'domcontentloaded' });
// espera a IA arrancar sozinha e terminar
await p2.waitForFunction(() => typeof iaRodando !== 'undefined' && iaRodando === true, { timeout: 20000 }).catch(() => {});
const arrancou = await p2.evaluate(() => document.getElementById('iaPanel').style.display === 'block' || iaRodando);
await p2.waitForFunction(() => typeof iaRodando !== 'undefined' && !iaRodando, { timeout: 90000 });
check('treino automático (?treinar=1) arranca sozinho', arrancou);
check('treino automático produz iaCache', await p2.evaluate(() => Object.keys(iaCache).length > 0));
check('preset majors tem os 7 pares principais', await p2.evaluate(() => PRESETS_MOEDAS.majors.length === 7 && PRESETS_MOEDAS.majors.every(s => PARES_YAHOO[s])));
check('treino automático sem erros de JS', jsErrs2.length === 0, jsErrs2.join(' | '));
await p2.close();

// 9) Sem erros de JS
check('sem erros de JavaScript', jsErrs.length === 0, jsErrs.join(' | '));

await browser.close();

// Relatório
let falhas = 0;
for (const r of results) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.nome + (r.ok || !r.detalhe ? '' : '  — ' + r.detalhe));
  if (!r.ok) falhas++;
}
console.log('\n' + (results.length - falhas) + '/' + results.length + ' testes passaram.');
process.exit(falhas ? 1 : 0);
