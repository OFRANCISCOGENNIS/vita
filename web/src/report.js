// =============================================================================
//  report.js — Agregações e exportações sobre os registros classificados.
//  -----------------------------------------------------------------------------
//  Espelha o "RESUMO - MATERIAIS AGRUPADOS" da aba CriarAbaStatus do VBA:
//  agrupa por Família + Nome do Material dentro de cada Status e soma Qtd
//  (e Metros para famílias de condutor/ramal).
// =============================================================================

import { ehFamiliaComMetros } from './engine.js';

/** Normaliza um texto para servir de chave de agrupamento (maiúsculas, espaços). */
export function normalizarChave(txt) {
  return String(txt ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Agrupa registros por STATUS -> (Família|Material).
 * @param {Array} registros saída de classificarLinha
 * @returns {Record<string, Array<{item,qtd,material,familia,metros}>>}
 */
export function resumoPorStatus(registros) {
  const porStatus = {};
  for (const r of registros) {
    if (r.familia === 'CLASSIFICAR' || r.familia === '-' ||
        r.familia === 'NAO CLASSIFICADO' || !r.familia) continue;

    const material = (r.nomeMaterial && r.nomeMaterial.trim())
      ? r.nomeMaterial.trim()
      : normalizarChave(r.texto);
    const chave = `${r.familia}|${material}`;

    (porStatus[r.status] ??= new Map());
    const mapa = porStatus[r.status];
    const prev = mapa.get(chave) ?? { material, familia: r.familia, qtd: 0, metros: 0 };
    prev.qtd += r.qtd || 1;
    if (ehFamiliaComMetros(r.familia)) prev.metros += r.metros || 0;
    mapa.set(chave, prev);
  }

  const out = {};
  for (const [status, mapa] of Object.entries(porStatus)) {
    out[status] = [...mapa.values()]
      .sort((a, b) => `${a.familia}${a.material}`.localeCompare(`${b.familia}${b.material}`))
      .map((g) => ({
        item: `${g.qtd} ${g.material}`,
        qtd: g.qtd,
        material: g.material,
        familia: g.familia,
        metros: g.metros || 0,
      }));
  }
  return out;
}

/** Totais por família (para o painel de indicadores e gráfico de barras). */
export function totaisPorFamilia(registros) {
  const m = new Map();
  for (const r of registros) m.set(r.familia, (m.get(r.familia) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Totais por status, na ordem canônica (para a faixa de distribuição). */
export function totaisPorStatus(registros) {
  const ordem = [
    'MATERIAIS INSTALADOS', 'MATERIAIS DESINSTALADOS',
    'MATERIAIS EXISTENTES', 'NAO CLASSIFICADO',
  ];
  const m = new Map();
  for (const r of registros) m.set(r.status, (m.get(r.status) ?? 0) + 1);
  return ordem.filter((s) => m.has(s)).map((s) => [s, m.get(s)]);
}

const CSV_COLS = [
  ['texto', 'Conteudo do Texto'], ['layer', 'Layer'], ['status', 'Status'],
  ['familia', 'Familia'], ['nomeMaterial', 'Nome do Material'],
  ['codEstrutura', 'Cod. Estrutura'], ['confianca', 'Confianca'], ['score', 'Score'],
  ['metros', 'Metros'], ['qtd', 'Qtd'], ['fonte', 'Fonte da Classificacao'],
  ['revisao', 'Revisao'],
];

const escapeCsv = (v) => {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Gera um CSV (separador ";", compatível com Excel pt-BR) dos registros. */
export function registrosParaCSV(registros) {
  const head = CSV_COLS.map(([, label]) => escapeCsv(label)).join(';');
  const linhas = registros.map((r) =>
    CSV_COLS.map(([key]) => escapeCsv(r[key])).join(';'));
  return '﻿' + [head, ...linhas].join('\r\n');
}
