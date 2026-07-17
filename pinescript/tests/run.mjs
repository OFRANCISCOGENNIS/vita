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

// 4.6) Detalhe da entrada: 1 clique → motivos + gráfico + horários (entrar × sair)
const det = await p.evaluate(() => {
  const t0 = dados[20].time, exp = 5;
  registro = [{
    t: t0, par: 'EUR/USD', dir: 1, score: 5, enabled: 6, exp, sym: 'EURUSD', fonte: 'sim', grade: 'A',
    det: {
      veredito: 'CALL', entryPrice: dados[20].close, grade: 'A', score: 82, pEst: 0.62, pLB: 0.56, pN: 40, expOp: 0.15,
      motivos: ['amostra pequena (8 ops) — pouca confiança'],
      fatores: [{ nome: 'Tendência', dir: 1 }, { nome: 'RSI', dir: -1 }, { nome: 'MACD', dir: 1 }],
      funil: [{ rot: 'Regime', ok: true }, { rot: 'Confluência', ok: true }, { rot: 'Portões', ok: false }, { rot: 'Evidência', ok: true }, { rot: 'Calibração', ok: null }, { rot: 'Execução', ok: true }],
      velas: dados.slice(0, 21).map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }))
    }
  }];
  document.getElementById('regSoA').checked = false; renderRegistro();
  abrirDetalheEntrada(0);
  const modal = document.getElementById('detalheModal');
  const p2 = n => String(n).padStart(2, '0');
  const hEsp = d => { const x = new Date(d * 1000); return p2(x.getHours()) + ':' + p2(x.getMinutes()); };
  return {
    aberto: modal.style.display === 'flex',
    hor: document.getElementById('detHorarios').textContent,
    entrarEsp: hEsp(t0), sairEsp: hEsp(t0 + exp * 60),
    nFatores: document.querySelectorAll('#detFatores .det-chip').length,
    nFunil: document.querySelectorAll('#detFunil .funil-elo').length,
    ressalva: document.getElementById('detRessalvas').textContent,
    rowIdx: (document.querySelector('#registroBody .reg-row') || {}).dataset ? document.querySelector('#registroBody .reg-row').dataset.idx : null
  };
});
check('detalhe abre no clique (modal visível)', det.aberto);
check('horário de ENTRAR correto', det.hor.includes(det.entrarEsp), det.hor);
check('horário de SAIR = entrada + expiração', det.hor.includes(det.sairEsp), 'esperado ' + det.sairEsp + ' em: ' + det.hor);
check('motivos: 3 fatores em chips', det.nFatores === 3, 'nFatores=' + det.nFatores);
check('funil: 6 elos no detalhe', det.nFunil === 6, 'nFunil=' + det.nFunil);
await p.waitForSelector('#detGrafico canvas', { timeout: 3000 }).catch(() => {});
check('mini-gráfico desenhado (canvas)', await p.$$eval('#detGrafico canvas', e => e.length) > 0);
check('ressalvas do selo exibidas', /amostra pequena/.test(det.ressalva), det.ressalva);
check('linha do Registro carrega data-idx clicável', det.rowIdx === '0', 'idx=' + det.rowIdx);
// fecha o modal (Escape) para não interferir nos próximos testes
await p.keyboard.press('Escape');
check('detalhe fecha no Escape', await p.evaluate(() => document.getElementById('detalheModal').style.display === 'none'));

// 4.7) Filtro Price Action (LTA/LTB + S/R): portão que só deixa entrar no teste da zona
const paChip = await p.evaluate(() => {
  const antes = confLive.enabled;
  document.getElementById('usePA').checked = true; recalcularSinaisApenas();
  return {
    on: confLive.usePA, enabledIgual: confLive.enabled === antes,
    chip: [...document.querySelectorAll('.decision-chip')].some(e => /PA zona/.test(e.textContent)),
    temFlags: typeof confLive.paOkLong === 'boolean' && typeof confLive.paOkShort === 'boolean'
  };
});
check('filtro PA liga: chip "PA zona" aparece', paChip.on && paChip.chip);
check('filtro PA é portão (não altera a pontuação de fatores)', paChip.enabledIgual);
check('confLive carrega paOkLong/paOkShort', paChip.temFlags);
const paGate = await p.evaluate(() => {
  const bak = confLive;
  document.getElementById('useNewsFilter').checked = false;
  confLive = Object.assign({}, confLive, { long: 6, short: 0, enabled: 6, minScore: 3, confMode: 'score', usePA: true, paOkLong: false, paOkShort: true });
  atualizarDecisao();
  const txt = document.getElementById('decisionVerdict').textContent;
  const motivo = document.getElementById('decisionReason').textContent;
  confLive.paOkLong = true; atualizarDecisao();
  const txt2 = document.getElementById('decisionVerdict').textContent;
  confLive = bak; document.getElementById('usePA').checked = false; recalcularSinaisApenas();
  return { txt, motivo, txt2 };
});
check('PA bloqueia CALL longe de suporte/LTA (vira AGUARDAR 📐)', /AGUARDAR 📐/.test(paGate.txt), paGate.txt);
check('motivo do bloqueio cita suporte/LTA e a tolerância', /suporte\/LTA/.test(paGate.motivo) && /ATR/.test(paGate.motivo), paGate.motivo);
check('no teste da zona a CALL volta a valer', /CALL/.test(paGate.txt2), paGate.txt2);

// 4.8) Meus filtros: salvar / aplicar / excluir presets do usuário
const filtros = await p.evaluate(() => {
  localStorage.removeItem('filtrosSalvos');
  // estado A: MACD ligado, PA ligado com tolerância 1.2
  document.getElementById('useMacd').checked = true;
  document.getElementById('usePA').checked = true;
  document.getElementById('paAtr').value = '1.2';
  document.getElementById('filtroNome').value = 'meu scalp';
  filtroSalvar();
  const salvou = !!JSON.parse(localStorage.getItem('filtrosSalvos'))['meu scalp'];
  const noSelect = [...document.querySelectorAll('#filtrosSalvos option')].some(o => o.value === 'meu scalp');
  // muda tudo (estado B) e aplica o salvo de volta
  document.getElementById('useMacd').checked = false;
  document.getElementById('usePA').checked = false;
  document.getElementById('paAtr').value = '0.3';
  filtroAplicar('meu scalp');
  const restaurou = document.getElementById('useMacd').checked
    && document.getElementById('usePA').checked
    && document.getElementById('paAtr').value === '1.2';
  // excluir
  document.getElementById('filtrosSalvos').value = 'meu scalp';
  filtroExcluir();
  const excluiu = !JSON.parse(localStorage.getItem('filtrosSalvos'))['meu scalp']
    && ![...document.querySelectorAll('#filtrosSalvos option')].some(o => o.value === 'meu scalp');
  // limpa o estado p/ não interferir nos próximos testes
  document.getElementById('usePA').checked = false; document.getElementById('paAtr').value = '0.8';
  recalcularSinaisApenas();
  return { salvou, noSelect, restaurou, excluiu };
});
check('filtro salvo persiste e entra no seletor', filtros.salvou && filtros.noSelect);
check('aplicar restaura fatores, portões e tolerâncias', filtros.restaurou);
check('excluir remove do storage e do seletor', filtros.excluiu);

// 4.9) Perfil de Abertura: perfil máximo, persistência de controles e aquecimento da IA
const boot = await p.evaluate(() => {
  // fotografa o estado p/ devolver no fim (o suite depende dos toggles atuais)
  const fot = {}; BOOT_IDS.forEach(id => { const el = document.getElementById(id); if (el) fot[id] = el.type === 'checkbox' ? el.checked : el.value; });
  // 1) perfil máxima qualidade
  aplicarPerfilMaximo();
  const gates = ['useHtf', 'useSessao', 'useSR', 'usePA', 'useNewsFilter', 'usePesoIA', 'useGrade', 'useMacd', 'usePadrao']
    .every(id => document.getElementById(id).checked);
  const min4 = document.getElementById('minScore').value === '4';
  const bollOff = !document.getElementById('useBollinger').checked;
  // 2) persistência: salva, bagunça, restaura
  document.getElementById('useMacd').checked = true;
  document.getElementById('paAtr').value = '1.5';
  salvarEstadoControles();
  document.getElementById('useMacd').checked = false;
  document.getElementById('paAtr').value = '0.2';
  const restaurou = restaurarEstadoControles()
    && document.getElementById('useMacd').checked
    && document.getElementById('paAtr').value === '1.5';
  // devolve o estado original e persiste (p/ não vazar pros próximos testes)
  Object.keys(fot).forEach(id => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = fot[id]; else el.value = fot[id]; });
  salvarEstadoControles(); recalcularSinaisApenas();
  return { gates, min4, bollOff, restaurou, automacao: !!navigator.webdriver };
});
check('perfil máximo liga fatores + todos os portões', boot.gates && boot.bollOff);
check('perfil máximo exige 4 fatores (balanceado)', boot.min4);
check('controles persistem (salvar → restaurar)', boot.restaurou);
check('automação detectada: automatismos de boot pulados nos testes', boot.automacao);
const aqueceu = await p.evaluate(async () => {
  // par sem cache → aquece; com cache → não repete
  const sym = symbolAtual();
  const bakCache = iaCache[sym]; delete iaCache[sym];
  Object.keys(iaCache).filter(k => k.startsWith(sym + '|')).forEach(k => delete iaCache[k]);
  _bootIAJaRodou = false;
  const rodou = await aquecerIAsePreciso();          // sim: treina o par atual
  const temCache = !!iaCache[sym] || Object.keys(iaCache).some(k => k.startsWith(sym + '|'));
  _bootIAJaRodou = false;
  const repetiu = await aquecerIAsePreciso();        // agora há cache → false
  if (bakCache) iaCache[sym] = bakCache;
  return { rodou, temCache, repetiu };
});
check('IA aquece sozinha quando o par não tem parâmetros', aqueceu.rodou && aqueceu.temCache, JSON.stringify(aqueceu));
check('com cache existente a IA não re-treina no boot', aqueceu.repetiu === false);
check('auto-reotimização vem ligada de fábrica', await p.evaluate(() => document.getElementById('autoReopt').checked));

// 4.9.1) Histórico acumulado (IndexedDB): gravar → contar → mesclar p/ IA → limpar
const hist = await p.evaluate(async () => {
  await historicoLimpar();
  const mk = (t0, n) => Array.from({ length: n }, (_, i) => ({ time: t0 + i * 300, open: 1, high: 2, low: 0.5, close: 1.5, volume: 3 }));
  await historicoGravar('TESTE', 5, mk(1000000, 300));
  const i1 = await historicoInfo('TESTE', 5);
  await historicoGravar('TESTE', 5, mk(1000000 + 150 * 300, 300));   // 150 sobrepostas + 150 novas
  const i2 = await historicoInfo('TESTE', 5);
  const frescas = mk(1000000 + 400 * 300, 100);
  const merged = await historicoParaIA('TESTE', 5, frescas);
  const ordenado = merged.every((v, i) => i === 0 || v.time > merged[i - 1].time);
  const unico = new Set(merged.map(v => v.time)).size === merged.length;
  const info3 = await historicoInfo('TESTE', 5);
  await historicoLimpar();
  const zerado = (await historicoInfo('TESTE', 5)).n === 0;
  return { n1: i1.n, n2: i2.n, mergedLen: merged.length, ordenado, unico, n3: info3.n, zerado };
});
check('histórico grava 300 velas', hist.n1 === 300, 'n=' + hist.n1);
check('regravar sobreposto deduplica (450 únicas)', hist.n2 === 450, 'n=' + hist.n2);
// 300 + 300 (150 sobrepostas) + 100 frescas (50 sobrepostas) = 500 tempos únicos
check('merge p/ IA: antigo + fresco, ordenado e sem duplicata', hist.mergedLen === 500 && hist.ordenado && hist.unico, 'len=' + hist.mergedLen);
check('rodada da IA engorda o histórico (500 únicas)', hist.n3 === 500, 'n=' + hist.n3);
check('limpar zera o histórico', hist.zerado);

// 4.9.2) Calibração real: curva previsto×realizado + pesos por fator
const calib2 = await p.evaluate(() => {
  const mk = (pEst, resultado, fatores, dir) => ({ t: 1, dir: dir || 1, resultado, det: { pEst, fatores: fatores || [] } });
  const regs = [
    mk(0.62, 'WIN'), mk(0.63, 'WIN'), mk(0.61, 'LOSS'),              // faixa 60–65: 2/3
    mk(0.52, 'LOSS'), mk(0.53, 'LOSS'),                              // faixa 50–55: 0/2
  ];
  const curva = curvaCalibracao(regs);
  const f60 = curva.find(c => c.faixa === '60–65%'), f50 = curva.find(c => c.faixa === '50–55%');
  // pesos por fator: Tendência alinhada em 12 entradas, 9 WIN → wr .75 → peso 1.25 (cap)
  const regsP = Array.from({ length: 12 }, (_, i) =>
    mk(0.6, i < 9 ? 'WIN' : 'LOSS', [{ nome: 'Tendência', dir: 1 }, { nome: 'RSI', dir: -1 }], 1));
  const pesos = pesosReaisCalc(regsP);
  return {
    f60ok: f60 && f60.n === 3 && Math.abs(f60.real - 2 / 3) < 0.01,
    f50ok: f50 && f50.n === 2 && f50.real === 0,
    tendN: pesos.T ? pesos.T.n : 0, tendWr: pesos.T ? pesos.T.wr : 0,
    rsiIgnorado: !pesos.Mo,                                     // RSI apontou contra: não conta
    peso: pesoRealFator(pesos, 'T'), pesoNeutro: pesoRealFator(pesos, 'X')
  };
});
check('curva: faixa 60–65% com 3 ops e real 67%', calib2.f60ok);
check('curva: faixa 50–55% com real 0%', calib2.f50ok);
check('fator alinhado conta (12 amostras, wr 75%) · contra não conta', calib2.tendN === 12 && Math.abs(calib2.tendWr - 0.75) < 0.01 && calib2.rsiIgnorado);
check('peso real: wr 75% → ×1.25 (cap) · sem amostra → ×1 neutro', calib2.peso === 1.25 && calib2.pesoNeutro === 1);

// 4.9.3) Relatório semanal: HTML gerado com placar e veredito
const rel = await p.evaluate(() => {
  registro = [
    { t: Math.floor(Date.now() / 1000) - 3600, par: 'EUR/USD', dir: 1, score: 5, enabled: 6, grade: 'A', funil: 5, resultado: 'WIN', det: { pEst: 0.62, fatores: [] } },
    { t: Math.floor(Date.now() / 1000) - 7200, par: 'EUR/USD', dir: -1, score: 4, enabled: 6, grade: 'B', funil: 3, resultado: 'LOSS', det: { pEst: 0.55, fatores: [] } }
  ];
  const html = gerarRelatorioHTML(7);
  return {
    temTitulo: /QUANT OPS — Relatório/.test(html),
    temPlacar: /Acerto real/.test(html) && /1\/2/.test(html),
    temBreakEven: /Break-even/.test(html),
    temAviso: /FERRAMENTA DE ESTUDO/.test(html),
    temBotao: !!document.getElementById('btnRelatorio')
  };
});
check('relatório: título, placar 1/2, break-even e aviso de risco', rel.temTitulo && rel.temPlacar && rel.temBreakEven && rel.temAviso);
check('botão 📄 Relatório presente no Registro', rel.temBotao);

// 4.9.4) PWA: sw.js existe e o standalone registra o Service Worker (https)
import { readFileSync } from 'fs';
const swSrc = readFileSync(path.join(here, '..', 'sw.js'), 'utf8');
const htmlBuild = readFileSync(file, 'utf8');
check('sw.js: network-first com fallback de cache', /quantops-v/.test(swSrc) && /caches\.match/.test(swSrc));
check('standalone registra o SW (só em http/https)', /serviceWorker/.test(htmlBuild) && /register\(['"]sw\.js/.test(htmlBuild));

// 4.9.5) Agentes de configuração (🔧) e validação (✅) com conserto em 1 clique
const agCfg = await p.evaluate(() => {
  // isolamento: fotografa TUDO que os consertos podem tocar e zera o estado dos agentes
  const IDS = ['timeframe', 'expiracao', 'payout', 'minScore', 'rsiSobrevenda', 'rsiSobrecompra', 'estruturaLookback', 'cooldownVelas'];
  const bak = {}; IDS.forEach(id => bak[id] = document.getElementById(id).value);
  const bakFila = agFilaOtim.slice();
  agLog = []; Object.keys(agVistos).forEach(k => delete agVistos[k]);
  // execução incoerente: TF 5m com expiração 1m (razão 0.2×)
  document.getElementById('timeframe').value = '5';
  document.getElementById('expiracao').value = '1';
  agenteConfigurador();
  const msg = agLog.find(l => /expiração 1m/.test(l.msg));
  // payout inviável
  document.getElementById('payout').value = '70';
  agenteConfigurador();
  const msgPayout = agLog.find(l => /payout 70%/.test(l.msg));
  // conserto em 1 clique: acha ESPECIFICAMENTE o botão da expiração pelo rótulo
  renderAgentes();
  const btn = [...document.querySelectorAll('#agentesLog .ag-fix')].find(b => /ajustar expiração/.test(b.textContent));
  let consertou = false;
  if (btn && agAcoes[btn.dataset.fix]) { agAcoes[btn.dataset.fix](); consertou = document.getElementById('expiracao').value === '5'; }
  agenteConfigurador();   // mesmo problema (payout) não re-loga
  const dedupe = agLog.filter(l => /payout 70%/.test(l.msg)).length === 1
    && agLog.filter(l => /expiração 1m/.test(l.msg)).length === 1;
  // restaura tudo (inclusive a fila e o dedupe) p/ não vazar pros próximos testes
  IDS.forEach(id => document.getElementById(id).value = bak[id]);
  agFilaOtim = bakFila; agLog = []; Object.keys(agVistos).forEach(k => delete agVistos[k]);
  recalcularSinaisApenas();
  return { avisou: !!msg, temBotao: /ag-fix/.test(msg ? msg.msg : ''), avisouPayout: !!msgPayout, consertou, dedupe };
});
check('🔧 Configurador avisa expiração incoerente com botão de conserto', agCfg.avisou && agCfg.temBotao);
check('🔧 Configurador avisa payout inviável (<80%)', agCfg.avisouPayout);
check('conserto em 1 clique ajusta a expiração p/ 5m', agCfg.consertou);
check('dedupe: o mesmo problema não repete no log', agCfg.dedupe);
const agVal = await p.evaluate(() => {
  agLog = []; Object.keys(agVistos).forEach(k => delete agVistos[k]);
  // fator ruim: Tendência alinhada em 12 entradas com 4 WIN (33%)
  const bakReg = registro;
  registro = Array.from({ length: 12 }, (_, i) => ({
    t: 1, dir: 1, resultado: i < 4 ? 'WIN' : 'LOSS',
    det: { pEst: 0.6, fatores: [{ nome: 'Tendência', dir: 1 }] }
  }));
  const bakT = document.getElementById('useTendencia').checked;
  document.getElementById('useTendencia').checked = true;
  agenteValidador();
  const msg = agLog.find(l => /Tendência acerta só/.test(l.msg));
  // executa o desligamento sugerido
  renderAgentes();
  const btns = [...document.querySelectorAll('#agentesLog .ag-fix')];
  const bDesl = btns.find(b => agAcoes[b.dataset.fix] && /desligar/.test(b.textContent));
  let desligou = false;
  if (bDesl) { agAcoes[bDesl.dataset.fix](); desligou = !document.getElementById('useTendencia').checked; }
  // funil invertido: ≤4 acertando muito mais que ≥5
  registro = [
    ...Array.from({ length: 6 }, () => ({ t: 1, dir: 1, funil: 5, resultado: 'LOSS' })),
    ...Array.from({ length: 6 }, () => ({ t: 1, dir: 1, funil: 3, resultado: 'WIN' }))
  ];
  agenteValidador();
  const msgFunil = agLog.find(l => /INVERTIDO/.test(l.msg));
  // restaura o estado (registro, toggle, fila de estudo, dedupe e log)
  registro = bakReg; document.getElementById('useTendencia').checked = bakT;
  agFilaOtim = []; agLog = [];
  Object.keys(agVistos).forEach(k => delete agVistos[k]);
  recalcularSinaisApenas();
  return { avisou: !!msg, desligou, avisouFunil: !!msgFunil };
});
check('✅ Validador detecta fator com acerto real ruim', agVal.avisou);
check('conserto: desliga o fator ruim em 1 clique', agVal.desligou);
check('✅ Validador detecta funil invertido', agVal.avisouFunil);

// 4.9.6) Backup completo + diário da operação
const bkp = await p.evaluate(() => {
  // backup: coletar → alterar → aplicar → restaurado
  localStorage.setItem('modoSniper', '1');
  const b = coletarBackup();
  const temChaves = b.app === 'QUANT OPS' && 'modoSniper' in b.chaves && 'registroEntradas' in b.chaves;
  localStorage.setItem('modoSniper', '0');
  const n = aplicarBackup(b);
  const restaurou = localStorage.getItem('modoSniper') === '1';
  localStorage.setItem('modoSniper', '0');
  // backup inválido é rejeitado
  let rejeitou = false;
  try { aplicarBackup({ app: 'OUTRO' }); } catch (e) { rejeitou = true; }
  // diário: nota + tags persistem e marcam a linha com 📝
  registro = [{ t: dados[10].time, par: 'EUR/USD', dir: 1, score: 5, enabled: 6, grade: 'A' }];
  abrirDetalheEntrada(0);
  salvarNotaEntrada(0, 'testei a zona e segurei a entrada', ['✅ plano seguido', '🎯 zona perfeita']);
  const salvo = JSON.parse(localStorage.getItem('registroEntradas'))[0];
  document.getElementById('regSoA').checked = false; renderRegistro();
  const badge = !!document.querySelector('#registroBody .reg-nota');
  // reabrir mostra a nota e as tags ativas
  abrirDetalheEntrada(0);
  const notaNaTela = document.getElementById('detNota').value.includes('segurei');
  const tagsOn = document.querySelectorAll('#detTags .det-tag-on').length;
  fecharDetalhe();
  // relatório inclui o diário
  const rel = gerarRelatorioHTML(7000);   // janela larga p/ pegar o t simulado
  const noRelatorio = /Diário da semana/.test(rel) && /segurei a entrada/.test(rel);
  return { temChaves, n, restaurou, rejeitou, notaSalva: salvo.nota, tagsSalvas: (salvo.tags || []).length, badge, notaNaTela, tagsOn, noRelatorio };
});
check('backup coleta as chaves do app', bkp.temChaves && bkp.n >= 2);
check('backup restaura o valor alterado', bkp.restaurou);
check('backup de outro app é rejeitado', bkp.rejeitou);
check('diário: nota e 2 tags persistem no registro', /segurei/.test(bkp.notaSalva) && bkp.tagsSalvas === 2);
check('linha do Registro ganha o badge 📝', bkp.badge);
check('reabrir o detalhe mostra nota e tags ativas', bkp.notaNaTela && bkp.tagsOn === 2);
check('relatório inclui a seção Diário da semana', bkp.noRelatorio);

// 4.9.7) Ícones informativos: clique → popover explicando (painel/métrica/fator/elo)
const infos = await p.evaluate(() => {
  const clique = el => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 })); };
  // emoji do título do painel principal
  const ico = document.querySelector('#chartPanel .ico-info');
  let popPainel = null;
  if (ico) { clique(ico); popPainel = document.getElementById('infoPop'); }
  const painelOk = ico && popPainel && /Gráfico principal/.test(popPainel.textContent);
  const naoRecolheu = !document.querySelector('#chartPanel').classList.contains('recolhido');
  // tile da topbar
  clique(document.querySelector('.qo-stat'));
  const popStat = document.getElementById('infoPop');
  const statOk = popStat && /Mercado Atual/.test(popStat.textContent) && /abrir Decisão/.test(popStat.textContent);
  // chip de fator
  const chip = document.querySelector('#decisionChips .decision-chip');
  let chipOk = false;
  if (chip) { clique(chip); const pp = document.getElementById('infoPop'); chipOk = !!pp && pp.textContent.length > 40; }
  // elo do funil
  const elo = document.querySelector('.funil-elo');
  let eloOk = false;
  if (elo) { clique(elo); const pp = document.getElementById('infoPop'); eloOk = !!pp && /Elo:/.test(pp.textContent); }
  // Escape fecha
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  const fechou = !document.getElementById('infoPop');
  const qtdIcones = document.querySelectorAll('.ico-info').length;
  return { painelOk, naoRecolheu, statOk, chipOk, eloOk, fechou, qtdIcones };
});
check('emoji do painel → popover com a explicação (sem recolher o card)', infos.painelOk && infos.naoRecolheu);
check('tile da topbar → popover com ação "abrir Decisão"', infos.statOk);
check('chip de fator → popover explicativo', infos.chipOk);
check('elo do funil → popover "Elo:"', infos.eloOk);
check('Escape fecha o popover', infos.fechou);
check('ícones clicáveis nos títulos (10+ painéis)', infos.qtdIcones >= 10, 'n=' + infos.qtdIcones);

// 4.9.8) Definição da estrutura de Price Action (Dow/SMC + virada CHoCH)
const estr = await p.evaluate(() => {
  const d = (rotulos, uH, uL) => definirEstrutura({ rotulos, uH, uL });
  return {
    alta: d(['HL', 'HH', 'HL', 'HH'], 'HH', 'HL'),
    baixa: d(['LH', 'LL', 'LH', 'LL'], 'LH', 'LL'),
    viradaBaixa: d(['HL', 'HH', 'LH', 'LL'], 'LH', 'LL'),   // o caso do print: era "Indefinida"
    viradaAlta: d(['LH', 'LL', 'HL', 'HH'], 'HH', 'HL'),
    compressao: d(['HH', 'HL', 'LH', 'HL'], 'LH', 'HL'),
    indef: d([], null, null),
    naTela: document.getElementById('qoPA') ? document.getElementById('qoPA').textContent : ''
  };
});
check('HH+HL define Alta', /Alta/.test(estr.alta.nome) && estr.alta.dir === 1, estr.alta.nome);
check('LH+LL define Baixa', /Baixa/.test(estr.baixa.nome) && estr.baixa.dir === -1, estr.baixa.nome);
check('HL·HH → LH·LL = Virando p/ baixa (CHoCH), não Indefinida', /Virando p\/ baixa/.test(estr.viradaBaixa.nome) && estr.viradaBaixa.dir === -1, estr.viradaBaixa.nome);
check('LH·LL → HL·HH = Virando p/ alta (CHoCH)', /Virando p\/ alta/.test(estr.viradaAlta.nome) && estr.viradaAlta.dir === 1, estr.viradaAlta.nome);
check('LH+HL = Compressão (triângulo)', /Compressão/.test(estr.compressao.nome) && estr.compressao.dir === 0, estr.compressao.nome);
check('sem swings suficientes = Indefinida', estr.indef.nome === 'Indefinida');
check('card PRICE ACTION renderiza a estrutura definida', /Estrutura/.test(estr.naTela) && !/Altista|Baixista/.test(estr.naTela));

// 4.9.9) Zonas S/R no gráfico + rótulos de estrutura + Análise Mestre
const zonas = await p.evaluate(() => {
  const z = calcularZonasSR();
  const todas = [...z.resist, ...z.supor];
  const comForca = todas.every(x => /FORTE|MÉDIA|FRACA/.test(x.forca) && x.n >= 1);
  const ladosCertos = z.resist.every(x => x.preco > z.close) && z.supor.every(x => x.preco < z.close);
  // liga o toggle → overlay com faixas rotuladas + marcadores HH/HL/LH/LL
  document.getElementById('zonasAtivo').checked = true;
  desenharZonasSR(true);
  const faixas = document.querySelectorAll('#zonasOverlay .zona-faixa').length;
  const rotulo = document.querySelector('#zonasOverlay .zona-rot');
  const temRotulo = rotulo && /ZONA DE (SUPORTE|RESISTÊNCIA)/.test(rotulo.textContent) && /toque/.test(rotulo.textContent);
  const marcs = marcadoresEstrutura();
  const temHHHL = marcs.some(m => /HH|HL|LH|LL/.test(m.text));
  // desliga → overlay some
  desenharZonasSR(false);
  document.getElementById('zonasAtivo').checked = false;
  const limpou = !document.getElementById('zonasOverlay');
  return { qtd: todas.length, comForca, ladosCertos, faixas, temRotulo, temHHHL, limpou };
});
check('zonas S/R calculadas com força por toques', zonas.qtd >= 2 && zonas.comForca, 'qtd=' + zonas.qtd);
check('resistências acima do preço · suportes abaixo', zonas.ladosCertos);
check('toggle 🟩 desenha faixas rotuladas no gráfico', zonas.faixas >= 2 && zonas.temRotulo, 'faixas=' + zonas.faixas);
check('pivôs recebem rótulos HH/HL/LH/LL', zonas.temHHHL);
check('desligar remove o overlay', zonas.limpou);
const am = await p.evaluate(() => {
  const html = gerarAnaliseMestre();
  const partes = ['Contexto geral', 'Estrutura de mercado', 'Linhas de tendência', 'Zonas de suporte', 'Pullback', 'Liquidez', 'Plano de trade', 'Confluências', 'Cenários', 'Psicologia', 'notas 0–10'];
  const temTudo = partes.every(t => html.includes(t));
  abrirAnaliseMestre();
  const aberto = document.getElementById('analiseModal').style.display === 'flex';
  const temNotas = document.querySelectorAll('#analiseBody .am-tabela tr').length >= 8;
  const temPlano = /Stop técnico|Sem zonas suficientes/.test(document.getElementById('analiseBody').textContent);
  document.getElementById('analiseFechar').click();
  const fechou = document.getElementById('analiseModal').style.display === 'none';
  return { temTudo, aberto, temNotas, temPlano, fechou };
});
// botões de 1 clique no cabeçalho do gráfico espelham os toggles
const btnsChart = await p.evaluate(() => {
  const b = document.getElementById('btnZonasChart');
  b.click();
  const ligou = document.getElementById('zonasAtivo').checked && b.classList.contains('is-active')
    && document.querySelectorAll('#zonasOverlay .zona-faixa').length >= 1;
  b.click();
  const desligou = !document.getElementById('zonasAtivo').checked && !document.getElementById('zonasOverlay');
  const temNiveis = !!document.getElementById('btnNiveisChart');
  return { ligou, desligou, temNiveis };
});
check('botão 🟩 no gráfico liga zonas em 1 clique (e marca ativo)', btnsChart.ligou);
check('segundo clique desliga e limpa', btnsChart.desligou);
check('botão 📐 LTA/LTB+Fib presente no gráfico', btnsChart.temNiveis);
check('Análise Mestre cobre as 13 seções do roteiro', am.temTudo);
check('modal 🎓 abre com tabela de notas e plano de trade', am.aberto && am.temNotas && am.temPlano);
check('modal 🎓 fecha no ✕', am.fechou);
const amTop = await p.evaluate(() => {
  const b = document.getElementById('btnAnaliseTop');
  if (!b) return { existe: false };
  b.click();
  const abriu = document.getElementById('analiseModal').style.display === 'flex';
  document.getElementById('analiseFechar').click();
  return { existe: true, abriu, naTopbar: !!b.closest('.qo-topbar') };
});
check('🎓 Análise na barra superior (perto de Controles/tema/ajuda) abre o modal', amTop.existe && amTop.abriu && amTop.naTopbar);
// ⛶ Ampliar: gráfico principal 500px ↔ ~72% da janela, persistido
const amp = await p.evaluate(async () => {
  const alt = () => document.querySelector('#chartPreco canvas') ? document.getElementById('chartPreco').clientHeight : 0;
  localStorage.setItem('chartAlto', '0');
  window.dispatchEvent(new Event('resize'));
  await new Promise(r => setTimeout(r, 120));
  const normal = alt();
  document.getElementById('btnChartMax').click();
  await new Promise(r => setTimeout(r, 120));
  const grande = alt();
  const rotulo = document.getElementById('btnChartMax').textContent;
  document.getElementById('btnChartMax').click();
  await new Promise(r => setTimeout(r, 120));
  const voltou = alt();
  return { normal, grande, voltou, rotulo, persistiu: localStorage.getItem('chartAlto') === '0' };
});
check('modo compacto = 500px', amp.normal >= 480 && amp.normal <= 520, 'h=' + amp.normal);
check('⛶ amplia p/ 1200px (padrão) e vira "Reduzir"', amp.grande === 1200 && /Reduzir/.test(amp.rotulo), 'h=' + amp.grande);
check('segundo clique volta ao padrão e persiste', amp.voltou === amp.normal && amp.persistiu);
// Fluidez: pivôs memoizados na mesma vela · animações pausam com a aba oculta
const fluido = await p.evaluate(() => {
  const a = acharPivotsSR(), b = acharPivotsSR();
  const memo = a === b;                                    // mesma referência = cache
  dados.push({ ...dados[dados.length - 1], time: dados[dados.length - 1].time + 300 });
  recomputarIndicadores();
  const c = acharPivotsSR();
  const invalida = c !== a;                                // vela nova = recalcula
  dados.pop(); recomputarIndicadores(); acharPivotsSR();
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  const pausou = document.body.classList.contains('anim-pausa');
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  const voltouAnim = !document.body.classList.contains('anim-pausa');
  return { memo, invalida, pausou, voltouAnim };
});
check('pivôs S/R memoizados (mesma vela = mesmo objeto)', fluido.memo && fluido.invalida);
// Camada iOS/macOS: switches nos toggles + lupa do Dock no rail
const ios = await p.evaluate(() => {
  const chk = document.querySelector('.control-group > label > input[type="checkbox"]');
  const cs = chk ? getComputedStyle(chk) : null;
  const switchOk = cs && cs.appearance === 'none' && parseInt(cs.width) === 36 && parseInt(cs.borderRadius) === 11;
  // lupa: mousemove no rail escala o botão mais próximo do cursor
  const rail = document.getElementById('railPaineis');
  const b0 = rail.querySelector('.rail-btn');
  const r = b0.getBoundingClientRect();
  rail.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 5, clientY: r.top + r.height / 2 }));
  return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
    const cresceu = /scale\(1\.[3-5]/.test(b0.style.transform);
    rail.dispatchEvent(new MouseEvent('mouseleave'));
    requestAnimationFrame(() => res({ switchOk, cresceu, limpou: b0.style.transform === '' || true }));
  })));
});
check('toggles viram switches estilo iOS (36×21, appearance none)', ios.switchOk);
check('lupa do Dock: ícone sob o cursor cresce ~1.5×', ios.cresceu);
check('aba oculta pausa animações · voltar retoma', fluido.pausou && fluido.voltouAnim);

// 4.10) Padrões de preço (Fase 2): doji, harami, CHoCH, topo/fundo duplo, triângulo
const pads = await p.evaluate(() => {
  const doji = ehDoji(10, 10.5, 9.5, 10.02) && !ehDoji(10, 10.5, 9.5, 10.4);
  const haramiAlta = ehHarami({ open: 10, high: 10.1, low: 8.9, close: 9 }, { open: 9.3, high: 9.6, low: 9.2, close: 9.5 }) === 1;
  const haramiFora = ehHarami({ open: 10, high: 10.1, low: 8.9, close: 9 }, { open: 9.3, high: 10.9, low: 9.2, close: 10.8 }) === 0;
  const topo = topoFundoDuplo({ res: [{ i: 10, price: 100 }, { i: 20, price: 100.1 }], sup: [] }, 0.5);
  const fundo = topoFundoDuplo({ res: [], sup: [{ i: 10, price: 90 }, { i: 20, price: 90.2 }] }, 0.5);
  const chochBaixa = detectarCHoCH({ res: [{ i: 5, price: 101 }, { i: 15, price: 102 }], sup: [{ i: 10, price: 99 }, { i: 20, price: 99.8 }] }, 99.0);
  const chochAlta = detectarCHoCH({ res: [{ i: 5, price: 102 }, { i: 15, price: 101 }], sup: [{ i: 10, price: 99.8 }, { i: 20, price: 99 }] }, 101.5);
  const tri = trianguloOuCanal({ sup: [{ i: 0, price: 10 }, { i: 10, price: 11 }], res: [{ i: 5, price: 20 }, { i: 15, price: 19 }] }, 20, 0.5);
  const canal = trianguloOuCanal({ sup: [{ i: 0, price: 10 }, { i: 10, price: 11 }], res: [{ i: 5, price: 15 }, { i: 15, price: 16.1 }] }, 20, 0.5);
  const atuais = padroesAtuais();   // dados simulados: só não pode quebrar
  const painel = document.getElementById('paBody') ? document.getElementById('paBody').textContent : '';
  return {
    doji, haramiAlta, haramiFora,
    topoOk: !!topo && topo.dir === -1, fundoOk: !!fundo && fundo.dir === 1,
    chochBaixa, chochAlta,
    triOk: !!tri && /triângulo/.test(tri.tipo), canalOk: !!canal && canal.tipo === 'canal de alta',
    atuaisArr: Array.isArray(atuais), painelTemLinha: /Padrões de preço/.test(painel)
  };
});
check('doji: corpo ≤10% do range (e não-doji rejeitado)', pads.doji);
check('harami de alta detectado · corpo fora rejeitado', pads.haramiAlta && pads.haramiFora);
check('topo duplo (dir -1) e fundo duplo (dir +1)', pads.topoOk && pads.fundoOk, JSON.stringify([pads.topoOk, pads.fundoOk]));
check('CHoCH: quebra de alta = -1 · quebra de baixa = +1', pads.chochBaixa === -1 && pads.chochAlta === 1, `baixa=${pads.chochBaixa} alta=${pads.chochAlta}`);
check('LTA+LTB = triângulo · fundos e topos subindo = canal de alta', pads.triOk && pads.canalOk);
check('painel 🧭 mostra a linha "Padrões de preço"', pads.atuaisArr && pads.painelTemLinha);

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
  await new Promise(res => setTimeout(res, 1100));
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

// 7.996) Fim de semana / OTC: detector, filtro de mercado aberto e aviso
const otc = await p.evaluate(() => {
  const sab = Date.UTC(2026, 6, 11, 12);      // sábado 11/jul/2026
  const qua = Date.UTC(2026, 6, 8, 12);       // quarta
  const sexNoite = Date.UTC(2026, 6, 10, 22); // sexta 22h UTC (fechado)
  const domNoite = Date.UTC(2026, 6, 12, 22); // domingo 22h UTC (reaberto)
  return { sab: forexFechado(sab), qua: forexFechado(qua), sexN: forexFechado(sexNoite), domN: forexFechado(domNoite) };
});
check('forexFechado: sáb/sex-noite fechado · qua/dom-noite aberto', otc.sab && otc.sexN && !otc.qua && !otc.domN, JSON.stringify(otc));
const fmOtc = await p.evaluate(() => {
  const orig = window.forexFechado;
  window.forexFechado = () => true;   // força fim de semana
  const r = filtrarMercadoAberto(['BTCUSDT', 'EURUSD', 'ETHUSDT', 'XAUUSD']);
  document.getElementById('fonte').value = 'ambos3'; atualizarAvisoOTC();
  const banner = document.getElementById('otcAviso').style.display !== 'none';
  window.forexFechado = orig;
  document.getElementById('fonte').value = 'sim'; atualizarAvisoOTC();
  const bannerSim = document.getElementById('otcAviso').style.display === 'none';
  return { puladas: r.puladas, sobraram: r.lista.join(','), banner, bannerSim };
});
check('fim de semana: forex sai da análise, cripto fica', fmOtc.puladas === 2 && fmOtc.sobraram === 'BTCUSDT,ETHUSDT', JSON.stringify(fmOtc));
check('aviso OTC aparece com fonte forex no fim de semana (e some no sim)', fmOtc.banner && fmOtc.bannerSim);

// FASE 1 — ESTABILIDADE
// lerNum: clamp de faixa, NaN→default, realce visual
const ln = await p.evaluate(() => {
  const el = document.getElementById('emaRapida');
  const antes = el.value;
  el.value = '999'; const alto = lerNum('emaRapida');            // > max 50
  const marcado = el.classList.contains('input-invalido');
  el.value = '';    const vazio = lerNum('emaRapida');           // NaN → default
  const cd = document.getElementById('cooldownVelas'); const cdAntes = cd.value;
  cd.value = '-5';  const neg = lerNum('cooldownVelas');         // < min 0
  el.value = antes; cd.value = cdAntes; lerNum('emaRapida');
  return { alto, marcado, vazio, neg };
});
check('lerNum clampa acima do máximo (999→50)', ln.alto === 50);
check('lerNum realça o campo corrigido', ln.marcado);
check('lerNum trata vazio/NaN (→ default)', Number.isFinite(ln.vazio) && ln.vazio >= 1);
check('lerNum clampa abaixo do mínimo (-5→0)', ln.neg === 0);
// configProblemas + gate de decisão (EMA rápida ≥ lenta bloqueia veredito)
const cfg = await p.evaluate(() => {
  const er = document.getElementById('emaRapida'), el = document.getElementById('emaLenta');
  const a = er.value, b = el.value;
  er.value = '30'; el.value = '10';   // rápida ≥ lenta = incoerente
  const probs = configProblemas().length;
  recomputarIndicadores(); recomputarSinais(); atualizarDecisao();
  const verd = document.getElementById('decisionVerdict').textContent;
  er.value = a; el.value = b; recomputarIndicadores(); recomputarSinais(); atualizarDecisao();
  return { probs, verd };
});
check('configProblemas detecta EMA rápida ≥ lenta', cfg.probs >= 1);
check('decisão bloqueia com CONFIG INVÁLIDA (não gera sinal-lixo)', /CONFIG INV/.test(cfg.verd), cfg.verd);
// fetchTimeout aborta requisição pendurada (servidor que nunca responde)
const to = await p.evaluate(async () => {
  const orig = window.fetch;
  window.fetch = (u, o) => new Promise((_, rej) => { if (o && o.signal) o.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
  const t0 = Date.now(); let abortou = false;
  try { await fetchTimeout('http://x', {}, 300); } catch (e) { abortou = true; }
  window.fetch = orig;
  return { abortou, ms: Date.now() - t0 };
});
check('fetchTimeout aborta request pendurada (~300ms)', to.abortou && to.ms < 1500, JSON.stringify(to));
// window.onerror mantém o app vivo (não derruba a tela)
const err = await p.evaluate(() => new Promise(res => {
  let capturado = false;
  const h = () => { capturado = true; };
  window.addEventListener('error', h, { once: true });
  setTimeout(() => { throw new Error('boom-teste'); }, 0);       // erro assíncrono não tratado
  setTimeout(() => { window.removeEventListener('error', h); res({ capturado, vivo: typeof atualizarDecisao === 'function' }); }, 120);
}));
check('window.onerror captura erro e mantém o app vivo', err.capturado && err.vivo);

// 7.999) Piloto Automático (paper trading): gatilho, contabilidade e zerar
const piloto = await p.evaluate(() => {
  pilotoCfg = { ativo: true, gatilho: 'af5', saldoIni: 1000, stake: 100, stakeTipo: 'fixo', epoch: 0 };
  document.getElementById('payout').value = '90';
  // gatilho A+funil≥5: A com funil 6 passa; A com funil 4 não; C com funil 6 não
  const q1 = pilotoQualifica('A', 6), q2 = pilotoQualifica('A', 4), q3 = pilotoQualifica('C', 6);
  // conta demo: 2 WIN + 1 LOSS, stake 100, payout 0.90 → +90+90−100 = +80
  registro = [
    { t: 10, par: 'X', dir: 1, score: 6, enabled: 6, paper: 1, stake: 100, payout: 0.9, resultado: 'WIN' },
    { t: 20, par: 'X', dir: 1, score: 6, enabled: 6, paper: 1, stake: 100, payout: 0.9, resultado: 'WIN' },
    { t: 30, par: 'X', dir: -1, score: 6, enabled: 6, paper: 1, stake: 100, payout: 0.9, resultado: 'LOSS' },
    { t: 40, par: 'X', dir: 1, score: 6, enabled: 6, paper: 1, stake: 100, payout: 0.9 }   // aberta (pendente)
  ];
  const c = calcularContaDemo();
  // stake % do saldo: 10% de 1080 = 108
  pilotoCfg.stakeTipo = 'pct'; pilotoCfg.stake = 10;
  const stakePct = pilotoStakeAtual();
  // zerar: epoch > tudo → saldo volta ao inicial
  pilotoCfg.epoch = 50;
  const cZerado = calcularContaDemo();
  return { q1, q2, q3, saldo: c.saldo, ops: c.ops, pend: c.pend, wr: c.wr, stakePct, saldoZerado: cZerado.saldo, opsZerado: cZerado.ops };
});
check('piloto: gatilho A+funil≥5 qualifica só A com funil ≥5', piloto.q1 && !piloto.q2 && !piloto.q3, JSON.stringify(piloto));
check('piloto: conta demo soma P&L (2W+1L @90% = +80 → 1080)', Math.abs(piloto.saldo - 1080) < 0.01, 'saldo=' + piloto.saldo);
check('piloto: pendente não entra no saldo (3 resolvidas, 1 aberta)', piloto.ops === 3 && piloto.pend === 1);
check('piloto: stake % usa saldo atual (10% de 1080 = 108)', Math.abs(piloto.stakePct - 108) < 0.01, 's=' + piloto.stakePct);
check('piloto: zerar reseta o saldo ao inicial', Math.abs(piloto.saldoZerado - 1000) < 0.01 && piloto.opsZerado === 0);

// FERRAMENTAS PRO (estilo Profit): funções puras + integração
const pro = await p.evaluate(() => {
  // Volume Profile: 3 velas com preço típico no mesmo bucket → POC ali
  const velas = [
    { high: 10.2, low: 9.8, close: 10.0, volume: 100 },
    { high: 10.3, low: 9.9, close: 10.1, volume: 300 },
    { high: 12.0, low: 11.6, close: 11.8, volume: 50 },
    { high: 8.4, low: 8.0, close: 8.2, volume: 60 }
  ];
  const vp = volumeProfile(velas, 8);
  const precoPoc = vp.lo + (vp.poc + 0.5) * vp.passo;
  // Fibonacci: perna de alta (fundo antes do topo) → 50% = (hi+lo)/2
  const sobe = [];
  for (let i = 0; i < 30; i++) sobe.push({ high: 100 + i, low: 99 + i, close: 100 + i });
  const fib = fibNiveis(sobe);
  const meio = fib.niveis.find(n => n.k === 0.5).preco;
  // Imbalance: só compra = +1; equilibrado = 0
  const imbC = bookImbalance([[1, 10]], []);
  const imbE = bookImbalance([[1, 5]], [[2, 5]]);
  // Níveis no gráfico: toggle liga (cria price lines) e desliga (remove)
  if (!dados || dados.length < 210) { dados = gerarDadosSim(300, 2); recomputarIndicadores(); }
  alternarNiveis(true); const nLinhas = linhasNiveis.length;
  alternarNiveis(false); const zerou = linhasNiveis.length === 0;
  // Painel VP renderiza com dados carregados
  renderVolumeProfile();
  const vpLinhas = document.querySelectorAll('#vpBody .vp-row').length;
  const temPoc = !!document.querySelector('#vpBody .vp-poc');
  return { precoPoc, alta: fib.alta, meio, imbC, imbE, nLinhas, zerou, vpLinhas, temPoc };
});
check('volumeProfile: POC no bucket de maior volume (~10.1)', pro.precoPoc > 9.5 && pro.precoPoc < 10.7, 'poc=' + pro.precoPoc);
check('fibNiveis: perna de alta e 50% no meio da perna', pro.alta && Math.abs(pro.meio - (sobreMeio => sobreMeio)((129 + 99) / 2)) < 0.75, 'meio=' + pro.meio);
check('bookImbalance: só compra=+1 · equilibrado=0', pro.imbC === 1 && pro.imbE === 0);
check('níveis no gráfico: liga cria linhas (fib+S/R), desliga remove', pro.nLinhas >= 7 && pro.zerou, 'linhas=' + pro.nLinhas);
check('Volume Profile renderiza 24 faixas com POC marcado', pro.vpLinhas === 24 && pro.temPoc, 'linhas=' + pro.vpLinhas);
// Book: mensagem clara quando o par não é Binance ao ligar
const bookMsgTxt = await p.evaluate(() => {
  document.getElementById('bookAtivo').checked = true; ligarBook();
  const t = document.getElementById('bookDom').textContent;
  document.getElementById('bookAtivo').checked = false; pararBook();
  return t;
});
check('book avisa quando o par não é Binance (fonte sim)', /Binance/.test(bookMsgTxt), bookMsgTxt.slice(0, 60));

// MODO MINIMALISTA: rail de painéis
const rail = await p.evaluate(() => {
  const botoes = document.querySelectorAll('#railPaineis .rail-btn').length;
  // padrão de teste: estado salvo pelo fluxo anterior pode ter aberto scan/ia — zera
  PAINEIS_MENU.forEach(x => paineisVis[x.id] = 0); salvarPaineis(); PAINEIS_MENU.forEach(x => aplicarPainel(x.id));
  const fluxoOculto = getComputedStyle(document.getElementById('painelFluxo')).display === 'none';
  const decisaoVisivel = getComputedStyle(document.querySelector('.decision-panel')).display !== 'none';
  const precoVisivel = !!document.getElementById('chartPreco');
  // clique no ícone abre o painel e persiste
  document.querySelector('.rail-btn[data-p="painelFluxo"]').click();
  const abriu = getComputedStyle(document.getElementById('painelFluxo')).display !== 'none';
  const salvo = JSON.parse(localStorage.getItem('paineisVis')).painelFluxo === 1;
  const iconeAtivo = document.querySelector('.rail-btn[data-p="painelFluxo"]').classList.contains('is-on');
  // railMostrar (auto-abre do scanner/IA) revela painel oculto
  railMostrar('scanPanel');
  const scanRevelado = !document.getElementById('scanPanel').classList.contains('painel-oculto');
  document.querySelector('.rail-btn[data-p="painelFluxo"]').click();   // fecha de volta
  return { botoes, fluxoOculto, decisaoVisivel, precoVisivel, abriu, salvo, iconeAtivo, scanRevelado };
});
check('rail tem 17 painéis + botão "todos"', rail.botoes === 18, 'botoes=' + rail.botoes);
check('minimalista: secundários ocultos, decisão+gráfico visíveis', rail.fluxoOculto && rail.decisaoVisivel && rail.precoVisivel, JSON.stringify(rail));
check('clique no ícone abre o painel, persiste e marca o ícone', rail.abriu && rail.salvo && rail.iconeAtivo);
check('railMostrar revela painel auto-aberto (scanner)', rail.scanRevelado);

// PRICE ACTION — estudo de entradas: LTA/LTB, zonas de confluência, painel
const paT = await p.evaluate(() => {
  // LTA: fundos ascendentes colineares → linha com 3 toques e inclinação > 0
  const lta = calcularLT([{ i: 0, price: 100 }, { i: 10, price: 102 }, { i: 20, price: 104 }], 30, 'LTA', 0.35, 1);
  // LTB: topos descendentes; e direção errada (subindo) não vira LTB
  const ltb = calcularLT([{ i: 0, price: 110 }, { i: 10, price: 108 }, { i: 20, price: 106 }], 30, 'LTB', 0.35, 1);
  const ltbErrada = calcularLT([{ i: 0, price: 100 }, { i: 10, price: 105 }], 30, 'LTB', 0.35, 1);
  // Zonas: 100 e 100.2 se agrupam (tol 0.5); 105 fica só
  const zonas = zonasConfluencia([{ preco: 100, rotulo: 'S' }, { preco: 100.2, rotulo: 'fib 61.8' }, { preco: 105, rotulo: 'R' }], 0.5);
  // Painel: renderiza com dados simulados
  if (!dados || dados.length < 210) { dados = gerarDadosSim(300, 2); recomputarIndicadores(); }
  renderPriceAction();
  const linhas = document.querySelectorAll('#paBody .kv').length;
  const leitura = document.getElementById('paLeitura').textContent;
  // LTA/LTB no gráfico acompanham o toggle 📐
  alternarNiveis(true); const comLT = !!(serieLTA || serieLTB);
  alternarNiveis(false); const semLT = !serieLTA && !serieLTB;
  return { ltaOk: !!lta && lta.slope > 0 && lta.toques >= 3, ltbOk: !!ltb && ltb.slope < 0, ltbErrada: ltbErrada === null,
           zonaN: zonas[0].n, zonaItens: zonas[0].itens.join('+'), linhas, temLeitura: leitura.length > 20, comLT, semLT };
});
check('calcularLT: LTA com 3 toques e inclinação positiva', paT.ltaOk, JSON.stringify(paT));
check('calcularLT: LTB descendente ok · direção errada rejeitada', paT.ltbOk && paT.ltbErrada);
check('zonasConfluencia agrupa níveis próximos (S+fib)', paT.zonaN === 2 && /S\+fib/.test(paT.zonaItens), paT.zonaItens);
check('painel Price Action renderiza 8 linhas + leitura da entrada', paT.linhas === 8 && paT.temLeitura, 'linhas=' + paT.linhas);
check('LTA/LTB traçadas no gráfico seguem o toggle 📐', paT.comLT && paT.semLT);

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

// 9) Sem erros de JS (exceto o 'boom-teste' lançado de propósito no teste do onerror)
const errsReais = jsErrs.filter(m => !/boom-teste/.test(m));
check('sem erros de JavaScript', errsReais.length === 0, errsReais.join(' | '));

await browser.close();

// Relatório
let falhas = 0;
for (const r of results) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.nome + (r.ok || !r.detalhe ? '' : '  — ' + r.detalhe));
  if (!r.ok) falhas++;
}
console.log('\n' + (results.length - falhas) + '/' + results.length + ' testes passaram.');
process.exit(falhas ? 1 : 0);
