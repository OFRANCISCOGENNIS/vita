// =============================================================================
//  ui.js — Controlador da interface do MVP (sem framework, ES module).
//  Lê os textos colados, chama o motor e renderiza tabela + resumo + CSV.
// =============================================================================

import { classificarLinha, STATUS } from './engine.js';
import { resumoPorStatus, totaisPorFamilia, totaisPorStatus, registrosParaCSV } from './report.js';
import { barrasFamilia, faixaStatus } from './charts.js';

const $ = (sel) => document.querySelector(sel);

function setMsg(texto, erro = false) {
  const el = $('#msg');
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('erro', !!erro);
  el.hidden = !texto;
  if (texto && !erro) setTimeout(() => { if (el.textContent === texto) { el.hidden = true; } }, 4000);
}

const EXEMPLO = [
  '66046515-D11600-N3-PR-S1I',
  '70049288-V9600-S3I',
  '7T10(30m+18m+25m+30m+26m+10m+10)',
  '4T10(12m+11m+15m+14m)-2Q10(20m+18m)',
  '1 CORTA CIRCUITO',
  '3 PARA-RAIOS-25kV',
  '#(M9-S203-EPP)',
  'ATER "EQP"',
  '3#4(4)CAA',
  'C12/600 N3-N3D S021',
  'DT11/300 N1 S034',
  '75 KVA TRIF 15 KV',
  'C/TALA',
].join('\n');

const COR_STATUS = {
  [STATUS.INSTALADO]: 'st-inst',
  [STATUS.DESINSTALADO]: 'st-desinst',
  [STATUS.EXISTENTE]: 'st-exist',
  [STATUS.NAO_CLASSIFICADO]: 'st-nc',
};

let ultimoResultado = [];

function parseEntrada(raw, layerGlobal) {
  const linhas = raw.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  return linhas.map((linha) => {
    // Suporta "layer<TAB>texto" ou "layer ;; texto"; senão usa o layer global.
    let layer = layerGlobal;
    let texto = linha;
    if (linha.includes('\t')) {
      const [l, ...resto] = linha.split('\t');
      layer = l.trim();
      texto = resto.join('\t').trim();
    } else if (linha.includes(';;')) {
      const [l, ...resto] = linha.split(';;');
      layer = l.trim();
      texto = resto.join(';;').trim();
    }
    return { texto, layer };
  });
}

function badge(valor, classe) {
  const span = document.createElement('span');
  span.className = `badge ${classe}`;
  span.textContent = valor;
  return span;
}

function renderIndicadores(registros) {
  const total = registros.length;
  const revisar = registros.filter((r) => r.revisao === 'REVISAR').length;
  const classificados = registros.filter(
    (r) => r.familia !== 'CLASSIFICAR' && r.familia !== '-' && r.familia !== 'NAO CLASSIFICADO',
  ).length;
  const familias = new Set(registros.map((r) => r.familia)).size;
  const cards = [
    ['Textos', total],
    ['Classificados', classificados],
    ['A revisar', revisar],
    ['Famílias', familias],
  ];
  const box = $('#indicadores');
  box.innerHTML = '';
  for (const [label, valor] of cards) {
    const c = document.createElement('div');
    c.className = 'kpi';
    c.innerHTML = `<div class="kpi-valor">${valor}</div><div class="kpi-label">${label}</div>`;
    box.appendChild(c);
  }
}

function renderTabela(registros) {
  const tbody = $('#tabela tbody');
  tbody.innerHTML = '';
  for (const r of registros) {
    const tr = document.createElement('tr');
    if (r.revisao === 'REVISAR') tr.classList.add('linha-revisar');

    const cells = [
      r.texto,
      r.layer,
      null, // status badge
      r.familia,
      r.nomeMaterial,
      r.codEstrutura,
      null, // confiança badge
      r.metros || '',
      r.fonte,
      null, // revisão badge
    ];
    cells.forEach((valor, idx) => {
      const td = document.createElement('td');
      if (idx === 2) td.appendChild(badge(r.status, COR_STATUS[r.status] ?? 'st-nc'));
      else if (idx === 6) td.appendChild(badge(r.confianca, `cf-${r.confianca.toLowerCase()}`));
      else if (idx === 9) td.appendChild(badge(r.revisao, r.revisao === 'OK' ? 'rv-ok' : 'rv-rev'));
      else td.textContent = valor ?? '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

function renderGraficos(registros) {
  const box = $('#graficos');
  if (!box) return;
  const fam = totaisPorFamilia(registros).filter(([f]) => f && f !== '-');
  const status = totaisPorStatus(registros);
  box.innerHTML = `
    <div class="grafico-card">
      <h4>Total por família</h4>
      ${barrasFamilia(fam) || '<p class="vazio">Sem dados.</p>'}
    </div>
    <div class="grafico-card">
      <h4>Distribuição por status</h4>
      ${faixaStatus(status) || '<p class="vazio">Sem dados.</p>'}
    </div>`;
}

function renderResumo(registros) {
  const porStatus = resumoPorStatus(registros);
  const box = $('#resumo');
  box.innerHTML = '';
  const ordem = [STATUS.INSTALADO, STATUS.DESINSTALADO, STATUS.EXISTENTE, STATUS.NAO_CLASSIFICADO];
  for (const status of ordem) {
    const grupos = porStatus[status];
    if (!grupos || grupos.length === 0) continue;
    const secao = document.createElement('section');
    secao.className = 'resumo-secao';
    const totalItens = grupos.reduce((s, g) => s + g.qtd, 0);
    secao.innerHTML = `<h3 class="${COR_STATUS[status] ?? 'st-nc'}">${status} <span>(${totalItens})</span></h3>`;
    const ul = document.createElement('ul');
    for (const g of grupos) {
      const li = document.createElement('li');
      const metros = g.metros ? ` · ${g.metros} m` : '';
      li.innerHTML = `<strong>${g.item}</strong> <em>${g.familia}${metros}</em>`;
      ul.appendChild(li);
    }
    secao.appendChild(ul);
    box.appendChild(secao);
  }
  if (box.children.length === 0) box.innerHTML = '<p class="vazio">Nada classificado ainda.</p>';
}

function classificar() {
  const raw = $('#entrada').value;
  const layerGlobal = $('#layer').value.trim();
  const itens = parseEntrada(raw, layerGlobal);
  ultimoResultado = itens.map(({ texto, layer }) => classificarLinha(texto, layer));

  renderIndicadores(ultimoResultado);
  renderGraficos(ultimoResultado);
  renderResumo(ultimoResultado);
  renderTabela(ultimoResultado);
  $('#resultados').hidden = ultimoResultado.length === 0;
  $('#btn-csv').disabled = ultimoResultado.length === 0;
}

async function copiarCSV() {
  if (ultimoResultado.length === 0) return;
  const csv = registrosParaCSV(ultimoResultado);
  const btn = $('#btn-csv');
  const original = btn.textContent;
  const avisar = (txt) => { btn.textContent = txt; setTimeout(() => { btn.textContent = original; }, 1800); };

  // Copiar é o caminho confiável em qualquer contexto (inclusive no sandbox
  // de preview, onde downloads por link não funcionam).
  try {
    await navigator.clipboard.writeText(csv);
    avisar('CSV copiado ✓');
    return;
  } catch { /* segue para fallback */ }

  // Fallback 1: seleção de texto para cópia manual.
  try {
    const ta = document.createElement('textarea');
    ta.value = csv;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) { avisar('CSV copiado ✓'); return; }
  } catch { /* segue para fallback de download */ }

  // Fallback 2: download (funciona quando o app é servido do repositório).
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'asbuilt_classificado.csv';
    a.click();
    URL.revokeObjectURL(url);
    avisar('CSV gerado ✓');
  } catch {
    avisar('Falhou — copie manualmente');
  }
}

// --- Importação de arquivo (xlsx / csv) -------------------------------------

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Extrai [{texto, layer}] de uma matriz de linhas (array de arrays). */
function extrairDeMatriz(linhas) {
  if (!linhas || linhas.length === 0) return [];
  // Procura a linha de cabeçalho da aba "Textos".
  let hdr = -1;
  for (let i = 0; i < Math.min(linhas.length, 5); i += 1) {
    const cels = (linhas[i] || []).map(semAcento);
    if (cels.some((c) => c.includes('CONTEUDO'))) { hdr = i; break; }
  }
  if (hdr >= 0) {
    const cels = linhas[hdr].map(semAcento);
    const cConteudo = cels.findIndex((c) => c.includes('CONTEUDO'));
    const cLayer = cels.findIndex((c) => c === 'LAYER' || c.includes('LAYER'));
    return linhas.slice(hdr + 1)
      .map((row) => ({
        texto: String(row[cConteudo] ?? '').trim(),
        layer: cLayer >= 0 ? String(row[cLayer] ?? '').trim() : '',
      }))
      .filter((r) => r.texto.length > 0);
  }
  // Sem cabeçalho: heurística — texto = célula mais longa; layer = célula de status.
  const RE_STATUS = /^#|INSTALAD|RETIRAD|EXISTENT|IMPLANTAR|REMOVER|RAMAIS/i;
  return linhas
    .map((row) => {
      const cels = (row || []).map((c) => String(c ?? '').trim()).filter(Boolean);
      if (cels.length === 0) return null;
      const texto = cels.reduce((a, b) => (b.length > a.length ? b : a), '');
      const layer = cels.find((c) => RE_STATUS.test(c) && c !== texto) ?? '';
      return { texto, layer };
    })
    .filter((r) => r && r.texto.length > 0);
}

function parseCSV(txt) {
  const linhas = txt.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  return linhas.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')));
}

function aplicarItens(itens) {
  if (!itens.length) { setMsg('Nenhum texto reconhecido no arquivo.', true); return; }
  // Mostra o que foi carregado no textarea (layer<TAB>texto) e classifica.
  $('#entrada').value = itens.map((r) => (r.layer ? `${r.layer}\t${r.texto}` : r.texto)).join('\n');
  classificar();
}

async function importarArquivo(file) {
  if (!file) return;
  const nome = file.name.toLowerCase();
  try {
    if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
      const txt = await file.text();
      aplicarItens(extrairDeMatriz(parseCSV(txt)));
    } else if (nome.endsWith('.xlsx') || nome.endsWith('.xls') || nome.endsWith('.xlsm')) {
      if (typeof XLSX === 'undefined') { setMsg('Leitor de Excel não carregou. Verifique a conexão.', true); return; }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const nomeAba = wb.SheetNames.find((s) => semAcento(s).includes('TEXTO')) || wb.SheetNames[0];
      const ws = wb.Sheets[nomeAba];
      const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false });
      aplicarItens(extrairDeMatriz(linhas));
    } else {
      setMsg('Formato não suportado. Use .xlsx, .csv ou .txt.', true);
    }
  } catch (e) {
    setMsg('Falha ao ler o arquivo: ' + (e && e.message ? e.message : e), true);
  }
}

// --- Tema (claro / escuro / sistema) ----------------------------------------

const TEMA_CHAVE = 'asbuilt-tema';
const CICLO = ['system', 'light', 'dark'];
const ROTULO = { system: '🖥 Sistema', light: '☀ Claro', dark: '🌙 Escuro' };

function aplicarTema(modo) {
  const root = document.documentElement;
  if (modo === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', modo);
  const btn = $('#btn-tema');
  if (btn) btn.textContent = ROTULO[modo];
  try { localStorage.setItem(TEMA_CHAVE, modo); } catch { /* ignora */ }
}

function initTema() {
  let modo = 'system';
  try { modo = localStorage.getItem(TEMA_CHAVE) || 'system'; } catch { /* ignora */ }
  if (!CICLO.includes(modo)) modo = 'system';
  aplicarTema(modo);
  const btn = $('#btn-tema');
  if (btn) btn.addEventListener('click', () => {
    const atual = document.documentElement.getAttribute('data-theme') || 'system';
    aplicarTema(CICLO[(CICLO.indexOf(atual) + 1) % CICLO.length]);
  });
}

function init() {
  initTema();
  $('#btn-classificar').addEventListener('click', classificar);
  $('#btn-exemplo').addEventListener('click', () => { $('#entrada').value = EXEMPLO; classificar(); });
  $('#btn-limpar').addEventListener('click', () => {
    $('#entrada').value = '';
    $('#resultados').hidden = true;
    ultimoResultado = [];
  });
  $('#btn-csv').addEventListener('click', copiarCSV);

  // Upload de arquivo (botão + input)
  const inputArq = $('#arquivo');
  if (inputArq) {
    inputArq.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) { importarArquivo(f); setMsg(`Arquivo "${f.name}" carregado.`); }
      e.target.value = '';
    });
  }
  // Drag & drop sobre a zona de entrada
  const zona = $('#zona-drop');
  if (zona) {
    ['dragover', 'dragenter'].forEach((ev) => zona.addEventListener(ev, (e) => {
      e.preventDefault(); zona.classList.add('arrastando');
    }));
    ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => {
      e.preventDefault(); zona.classList.remove('arrastando');
    }));
    zona.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { importarArquivo(f); setMsg(`Arquivo "${f.name}" carregado.`); }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
