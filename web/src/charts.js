// =============================================================================
//  charts.js — Gráficos do resumo, desenhados com HTML/CSS (sem biblioteca).
//  Barras proporcionais e faixa de status; cores vêm dos tokens do tema.
// =============================================================================

const CLASSE_STATUS = {
  'MATERIAIS INSTALADOS': 'st-inst',
  'MATERIAIS DESINSTALADOS': 'st-desinst',
  'MATERIAIS EXISTENTES': 'st-exist',
  'NAO CLASSIFICADO': 'st-nc',
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Barras horizontais "Total por família".
 * @param {Array<[string,number]>} totais pares [familia, qtd] já ordenados desc.
 * @param {number} maxLinhas número máximo de barras (demais agrupadas em "outras").
 */
export function barrasFamilia(totais, maxLinhas = 10) {
  if (!totais.length) return '';
  let dados = totais;
  if (totais.length > maxLinhas) {
    const topo = totais.slice(0, maxLinhas - 1);
    const resto = totais.slice(maxLinhas - 1).reduce((s, [, v]) => s + v, 0);
    dados = [...topo, ['outras', resto]];
  }
  const max = Math.max(...dados.map(([, v]) => v), 1);
  const linhas = dados.map(([fam, v]) => `
    <div class="barra-linha">
      <span class="barra-rot" title="${esc(fam)}">${esc(fam)}</span>
      <span class="barra-trilho"><span class="barra-fill" style="width:${(v / max) * 100}%"></span></span>
      <span class="barra-val">${v}</span>
    </div>`).join('');
  return `<div class="grafico-barras" role="img" aria-label="Total por família de material">${linhas}</div>`;
}

/**
 * Faixa empilhada de distribuição por status + legenda.
 * @param {Array<[string,number]>} totaisStatus pares [status, qtd].
 */
export function faixaStatus(totaisStatus) {
  if (!totaisStatus.length) return '';
  const total = totaisStatus.reduce((s, [, v]) => s + v, 0) || 1;
  const segs = totaisStatus.map(([st, v]) =>
    `<span class="faixa-seg ${CLASSE_STATUS[st] ?? 'st-nc'}" style="width:${(v / total) * 100}%" title="${esc(st)}: ${v}"></span>`).join('');
  const legenda = totaisStatus.map(([st, v]) => `
    <span class="legenda-item">
      <span class="legenda-cor ${CLASSE_STATUS[st] ?? 'st-nc'}"></span>
      ${esc(st)} <strong>${v}</strong>
    </span>`).join('');
  return `
    <div class="faixa-status" role="img" aria-label="Distribuição por status">${segs}</div>
    <div class="legenda">${legenda}</div>`;
}
