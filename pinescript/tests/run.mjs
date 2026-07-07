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
await p.selectOption('#fonte', 'sim'); await p.waitForTimeout(200);

// 2) Fatores extras MACD/Bollinger entram na confluência
const en0 = await p.evaluate(() => confLive.enabled);
await p.check('#useMacd'); await p.check('#useBollinger'); await p.waitForTimeout(300);
check('MACD+Bollinger somam 2 fatores', await p.evaluate(() => confLive.enabled) === en0 + 2);

// 3) IA otimiza (validação robusta + cache por regime)
await p.click('#btnGerar'); await p.waitForTimeout(400);
await p.click('#btnIA');
await p.waitForFunction(() => typeof iaRodando !== 'undefined' && !iaRodando, { timeout: 90000 });
check('IA gerou resultado', /combina/.test(await p.$eval('#iaMeta', e => e.textContent)));
check('iaCache indexado por regime', await p.evaluate(() => Object.keys(iaCache).some(k => k.includes('|'))));

// 4) Verificador WIN/LOSS + placar real
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

// 8) PWA manifest
check('PWA manifest presente', await p.$eval('link[rel=manifest]', e => e.href.startsWith('data:application/manifest')));

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
