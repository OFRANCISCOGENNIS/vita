// =============================================================================
//  ui.js — Controlador da interface do MVP (sem framework, ES module).
//  Lê os textos colados, chama o motor e renderiza tabela + resumo + CSV.
// =============================================================================

import { classificarLinha, STATUS } from './engine.js';
import { resumoPorStatus, totaisPorFamilia, registrosParaCSV } from './report.js';

const $ = (sel) => document.querySelector(sel);

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
  renderTabela(ultimoResultado);
  renderResumo(ultimoResultado);
  $('#resultados').hidden = ultimoResultado.length === 0;
  $('#btn-csv').disabled = ultimoResultado.length === 0;
}

function baixarCSV() {
  if (ultimoResultado.length === 0) return;
  const blob = new Blob([registrosParaCSV(ultimoResultado)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'asbuilt_classificado.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function init() {
  $('#btn-classificar').addEventListener('click', classificar);
  $('#btn-exemplo').addEventListener('click', () => { $('#entrada').value = EXEMPLO; classificar(); });
  $('#btn-limpar').addEventListener('click', () => {
    $('#entrada').value = '';
    $('#resultados').hidden = true;
    ultimoResultado = [];
  });
  $('#btn-csv').addEventListener('click', baixarCSV);
}

document.addEventListener('DOMContentLoaded', init);
