// =============================================================================
//  engine.js — Motor de classificação de materiais de as-built (port do VBA)
//  -----------------------------------------------------------------------------
//  Porte fiel das regras do módulo ASBUILTENERGE.bas (v4.0) para JavaScript.
//  Entrada: linhas de texto do as-built (coluna "Conteúdo do Texto") + layer.
//  Saída: família, status, nome do material, confiança, fonte e revisão.
//
//  Mantém os MESMOS nomes de família/status do VBA para compatibilidade com
//  as planilhas geradas pela macro. Sem dependências externas (ES module puro).
// =============================================================================

export const STATUS = {
  INSTALADO: 'MATERIAIS INSTALADOS',
  DESINSTALADO: 'MATERIAIS DESINSTALADOS',
  EXISTENTE: 'MATERIAIS EXISTENTES',
  NAO_CLASSIFICADO: 'NAO CLASSIFICADO',
};

const isDigit = (ch) => ch >= '0' && ch <= '9';
const isAZ = (ch) => ch >= 'A' && ch <= 'Z';

// --- Limpeza de texto --------------------------------------------------------

/** Remove códigos de formatação de MText (\f...; \P, chaves). */
export function removerCodigosMText(s) {
  let r = String(s ?? '').replace(/\\P/g, ' ').replace(/\\p/g, ' ');
  let out = '';
  let i = 0;
  while (i < r.length) {
    const ch = r[i];
    if (ch === '\\' && i < r.length - 1) {
      const nxt = r[i + 1];
      if ('fFhHcCqQwWlLoOkKpPaAtT'.includes(nxt)) {
        const j = r.indexOf(';', i + 1);
        i = j >= 0 ? j + 1 : i + 2;
      } else {
        out += ch;
        i += 1;
      }
    } else if (ch === '{' || ch === '}') {
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** Remove o envoltório "#(...)" (ou apenas "#") de material desinstalado. */
export function removerEnvoltorioHashtag(s) {
  let r = String(s ?? '');
  if (r.startsWith('#')) {
    r = r.slice(1).trim();
    if (r.length > 0 && r.startsWith('(')) {
      r = r.endsWith(')') ? r.slice(1, -1) : r.slice(1);
    }
  }
  return r;
}

/** True se o texto (sem códigos MText) começa com "#". */
export function comecaComHashtag(txt) {
  const s = removerCodigosMText(txt).replace(/^\s+/, '');
  return s.length > 0 && s[0] === '#';
}

/** True se, após remover dígitos/espaços iniciais, o resto começa com `palavra`. */
export function comecaComPalavra(txt, palavra) {
  const s = String(txt ?? '').trim().toUpperCase();
  let i = 0;
  while (i < s.length && (isDigit(s[i]) || s[i] === ' ')) i += 1;
  return s.slice(i, i + palavra.length) === palavra.toUpperCase();
}

// --- Extração de nome base / código SAP -------------------------------------

/** "C12/600 N3 S021" -> "C12/600"; "M11 N1" -> "M11"; "DT11/300" -> "DT11/300". */
export function extrairNomeBasePoste(txt) {
  let s = removerEnvoltorioHashtag(removerCodigosMText(txt).trim().toUpperCase());
  let i = 0;
  let prefix = '';
  while (i < s.length && prefix.length < 3 && isAZ(s[i])) { prefix += s[i]; i += 1; }
  if (prefix.length === 0) return '';
  if (i < s.length && s[i] === ' ') i += 1;
  let d1 = '';
  while (i < s.length && isDigit(s[i])) { d1 += s[i]; i += 1; }
  if (d1.length === 0) return '';
  if (i < s.length && s[i] === '/') {
    i += 1;
    let d2 = '';
    while (i < s.length && isDigit(s[i])) { d2 += s[i]; i += 1; }
    if (d2.length > 0) return prefix + d1 + '/' + d2;
  }
  return prefix + d1;
}

/** D->POSTE DT, V->POSTE FIBRA, C->POSTE CIRCULAR, M->POSTE DE MADEIRA, else "". */
export function familiaPosteDoPrefixo(codigo) {
  const p = String(codigo ?? '').trim().toUpperCase()[0] ?? '';
  switch (p) {
    case 'D': return 'POSTE DT';
    case 'V': return 'POSTE FIBRA';
    case 'C': return 'POSTE CIRCULAR';
    case 'M': return 'POSTE DE MADEIRA';
    default: return '';
  }
}

/** True quando o texto tem o formato de código SAP "<8 dígitos><separador>...". */
export function ehCodigoEstruturaSAP(txt) {
  const s = removerEnvoltorioHashtag(String(txt ?? '').trim()).trim();
  if (s.length < 10) return false;
  for (let i = 0; i < 8; i += 1) if (!isDigit(s[i])) return false;
  const ch = s[8].toUpperCase();
  return !(isDigit(ch) || isAZ(ch));
}

// --- Ramal com metragem entre parênteses ------------------------------------

export function ehPadraoRamalMetros(s) {
  s = String(s ?? '');
  for (let i = 0; i < s.length - 1; i += 1) {
    if (isAZ(s[i])) {
      let j = i + 1;
      let digs = '';
      while (j < s.length && isDigit(s[j])) { digs += s[j]; j += 1; }
      if (digs.length > 0 && j < s.length && s[j] === '(') return true;
    }
  }
  return false;
}

/** Primeiro código do padrão RAMAL (ex.: "7T10(...)" -> "T10"). */
export function extrairCodigoRamal(texto) {
  let s = removerEnvoltorioHashtag(removerCodigosMText(texto).trim().toUpperCase());
  for (let i = 0; i < s.length - 1; i += 1) {
    if (isAZ(s[i])) {
      let j = i + 1;
      let digs = '';
      while (j < s.length && isDigit(s[j])) { digs += s[j]; j += 1; }
      if (digs.length > 0 && j < s.length && s[j] === '(') return s[i] + digs;
    }
  }
  return '';
}

/** Soma os inteiros dentro dos parênteses de um texto de RAMAL. */
export function somarMetrosRamal(texto) {
  let s = removerEnvoltorioHashtag(removerCodigosMText(texto).trim().toUpperCase());
  let total = 0;
  let dentro = false;
  let num = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '(') { dentro = true; num = ''; }
    else if (ch === ')') { if (dentro && num) total += parseInt(num, 10); dentro = false; num = ''; }
    else if (ch === '+') { if (dentro && num) total += parseInt(num, 10); num = ''; }
    else if (dentro && isDigit(ch)) num += ch;
  }
  return total;
}

function regexEstruturaMT(s) {
  s = String(s ?? '').trim();
  if (s.length === 0) return false;
  if (s.includes('ESTRUTURA MT')) return true;
  const c1 = s[0];
  if ((c1 === 'T' || c1 === 'N' || c1 === 'U') && s.length >= 2 && isDigit(s[1])) return true;
  return false;
}

// --- Classificação por família (algoritmo legado) ----------------------------

export function classificarFamilia(txt) {
  let s = removerEnvoltorioHashtag(removerCodigosMText(txt).trim().toUpperCase());
  if (s.length === 0) return '-';

  if (s.includes('ATERR') || s.includes('FRANKLIN') ||
      s.includes('ATER"') || s.includes('ATER "') ||
      comecaComPalavra(s, 'HAST')) return 'ATERRAMENTO';
  if (s.includes('MUFLA')) return 'MUFLA';
  if (s.includes('PR -') || s.includes('PR-') || s.includes('PR ') ||
      s.includes('PARA RAIO') || s.includes('PARA-RAIO') || s.includes('PARARAIO'))
    return s.includes('BT') ? 'PARA RAIO BT' : 'PARA RAIO MT';
  if (s.includes('ELO')) return 'ELO';
  if (s.includes('CH.FUS') || s.includes('CH FUS') || s.includes('CH. FUS') ||
      s.includes('CORTA CIRCUITO') || s.includes('CORTA-CIRCUITO') ||
      (s.includes('KV') && s.includes('KA'))) return 'CH FUS';
  if (s.includes('CH.FACA') || s.includes('CH FACA') ||
      (s.includes('630A') && s.includes('27KV'))) return 'CH FACA';
  if (s.includes('TR 01') || s.includes('KVA') ||
      (s.includes('V-') && s.includes('KV'))) return 'TRAFO';
  if (s.includes('MM²') || s.includes('MM2') ||
      (s.includes('Ø') && s.includes('MM')) || ehPadraoRamalMetros(s)) return 'RAMAL';
  if (s.includes('#CAA') || s.includes('# CAA') || s.includes('CAA') ||
      (s.includes('M MT ') && s.includes('KV')) ||
      (s.includes(' MT ') && s.includes('KV') && s.includes('#'))) return 'COND NU';
  if (s.slice(0, 2) === 'DT' && s.includes('/')) return 'POSTE DT';
  if (s[0] === 'C' && s.includes('/') && isDigit(s[1] ?? '')) return 'POSTE CIRCULAR';
  if (s[0] === 'M' && (s.includes(' ') || s.includes('-')) &&
      (isDigit(s[1] ?? '') || isDigit(s[2] ?? ''))) return 'POSTE DE MADEIRA';
  if (s[0] === 'V' && (s.includes(' ') || s.includes('-')) &&
      (isDigit(s[1] ?? '') || isDigit(s[2] ?? ''))) return 'POSTE FIBRA';
  if (regexEstruturaMT(s)) return 'ESTRUTURA MT';
  return 'CLASSIFICAR';
}

export function statusPorLayer(layerName) {
  const s = String(layerName ?? '').trim().toUpperCase();
  if (s.includes('RAMAIS_NO_MODEL') || s.includes('RAMAIS NO MODEL')) return STATUS.INSTALADO;
  if (s.includes('#INSTALADO')) return STATUS.INSTALADO;
  if (s.includes('#RETIRADO')) return STATUS.DESINSTALADO;
  if (s.includes('TEXTOS A IMPLANTAR') || s.includes('A IMPLANTAR')) return STATUS.INSTALADO;
  if (s.includes('TEXTOS A REMOVER') || s.includes('A REMOVER')) return STATUS.DESINSTALADO;
  if (s.includes('TEXTOS EXISTENTES') || s.includes('EXISTENTES')) return STATUS.EXISTENTE;
  return STATUS.NAO_CLASSIFICADO;
}

export function familiaPorLayer(ly) {
  const s = String(ly ?? '').toUpperCase();
  if (s.includes('ATERR')) return 'ATERRAMENTO';
  if (s.includes('MUFLA')) return 'MUFLA';
  if (s.includes('PARARAIO') || s.includes('PARA-RAIO') || s.includes('PARA_RAIO') || s.includes('PR_BT'))
    return s.includes('BT') ? 'PARA RAIO BT' : 'PARA RAIO MT';
  if (s.includes('ELO')) return 'ELO';
  if (s.includes('CHFUS') || s.includes('CH_FUS') || s.includes('FUSIVEL')) return 'CH FUS';
  if (s.includes('CHFACA') || s.includes('CH_FACA') || s.includes('SECCIONADORA')) return 'CH FACA';
  if (s.includes('TRAFO') || s.includes('TRANSFORM')) return 'TRAFO';
  if (s.includes('RAMAIS_NO_MODEL') || s.includes('RAMAIS NO MODEL') || s.includes('RAMAL')) return 'RAMAL';
  if (s.includes('COND_ISOL') || s.includes('COND ISOL') || s.includes('ISOLADO')) return 'COND ISOLADO';
  if (s.includes('COND_NU') || s.includes('COND NU') || s.includes('CABO_NU')) return 'COND NU';
  if (s.includes('POSTE_DT') || s.includes('POSTEDT')) return 'POSTE DT';
  if (s.includes('MADEIRA')) return 'POSTE DE MADEIRA';
  if (s.includes('FIBRA')) return 'POSTE FIBRA';
  if (s.includes('POSTE')) return 'POSTE CIRCULAR';
  if (s.includes('ESTRUT')) return 'ESTRUTURA MT';
  return '';
}

/** Retorna { familia, score } combinando conteúdo + layer. */
export function classificarComConfianca(txt, layerName) {
  const s = removerCodigosMText(txt).trim().toUpperCase();
  const ly = String(layerName ?? '').trim().toUpperCase();
  let famBase = classificarFamilia(txt);
  let score = 0;

  if (s.includes('ATERR')) score += 40;
  if (s.includes('MUFLA')) score += 40;
  if (s.includes('PARA RAIO') || s.includes('PARA-RAIO')) score += 40;
  if (s.includes('CH.FUS') || s.includes('CH FUS')) score += 40;
  if (s.includes('CH.FACA') || s.includes('CH FACA')) score += 40;
  if (s.includes('KVA')) score += 40;
  if (s.includes('#CAA') || s.includes('# CAA')) score += 40;
  if (s.includes('ELO')) score += 45;
  if (ehPadraoRamalMetros(removerEnvoltorioHashtag(s))) score += 50;

  if (s.includes('PR -') || s.includes('PR-')) score += 25;
  if (s.includes('MM²') || s.includes('MM2')) score += 30;
  if (s.includes('Ø')) score += 20;
  if (s.includes('KV')) score += 15;
  if (s.includes('TR 01')) score += 30;
  if (s.includes('/') && s.length > 2) score += 10;

  if (extrairNomeBasePoste(txt) !== '') {
    if (['POSTE CIRCULAR', 'POSTE DT', 'POSTE DE MADEIRA', 'POSTE FIBRA'].includes(famBase)) score += 45;
    else score += 20;
  }

  const layerDica = familiaPorLayer(ly);
  if (layerDica) {
    if (layerDica === famBase) score += 30;
    else { famBase = layerDica; score += 25; }
  }
  if (famBase === 'CLASSIFICAR' && layerDica) { famBase = layerDica; score = 60; }
  if (famBase === 'CLASSIFICAR') score = Math.floor(score / 3);
  if (s.length === 0) { famBase = '-'; score = 0; }

  score = Math.max(0, Math.min(100, score));
  return { familia: famBase, score };
}

export function nivelConfianca(score) {
  if (score >= 70) return 'Alta';
  if (score >= 45) return 'Media';
  return 'Baixa';
}

export function extrairNomeMaterial(familia, nomeBase, nomeBaseEst, texto) {
  switch (familia) {
    case 'POSTE DT': case 'POSTE FIBRA': case 'POSTE CIRCULAR': case 'POSTE DE MADEIRA':
      return nomeBaseEst || nomeBase;
    case 'RAMAL':
      return extrairCodigoRamal(texto);
    default:
      return '';
  }
}

/** Quantidade marcada no texto (Q=, QT:, QTD =); 0 se ausente. */
export function extrairQuantidadeMarcada(txt) {
  const s = removerEnvoltorioHashtag(String(txt ?? '').trim()).toUpperCase();
  for (let i = 0; i < s.length; i += 1) {
    const prev = i > 0 ? s[i - 1] : '';
    if (s[i] === 'Q' && (i === 0 || !'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.includes(prev))) {
      let j = i + 1;
      if (s[j] === 'T') { j += 1; if (s[j] === 'D') j += 1; }
      while (j < s.length && s[j] === ' ') j += 1;
      if (j < s.length && (s[j] === '=' || s[j] === ':')) {
        j += 1;
        while (j < s.length && s[j] === ' ') j += 1;
        let num = '';
        while (j < s.length && (isDigit(s[j]) || s[j] === ',' || s[j] === '.')) { num += s[j]; j += 1; }
        num = num.replace(',', '.');
        const v = parseFloat(num);
        if (!Number.isNaN(v) && v > 0) return v;
      }
    }
  }
  return 0;
}

export function quantidadeDoTexto(txt) {
  const q = extrairQuantidadeMarcada(txt);
  return q > 0 ? Math.round(q) : 1;
}

export function fonteClassificacaoTexto(txt, layerName, familia, codEstrutura) {
  const ly = String(layerName ?? '').trim().toUpperCase();
  if (String(txt ?? '').trim().length === 0) return 'TEXTO VAZIO';
  if (comecaComHashtag(txt)) return 'HASHTAG + CONTEUDO';
  if (ly.includes('RAMAIS_NO_MODEL') || ly.includes('RAMAIS NO MODEL')) return 'REGRA DO LAYER RAMAL';
  if (String(codEstrutura ?? '').trim().length > 0 && extrairNomeBasePoste(codEstrutura).length > 0) return 'CODIGO SAP';
  if (familiaPorLayer(ly).length > 0) return 'CONTEUDO + LAYER';
  if (familia === 'CLASSIFICAR' || familia === '-') return 'SEM REGRA SUFICIENTE';
  return 'CONTEUDO';
}

export function revisaoTexto(status, familia, confianca) {
  if (status === STATUS.NAO_CLASSIFICADO || familia === 'CLASSIFICAR' ||
      familia === '-' || confianca === 'Baixa') return 'REVISAR';
  return 'OK';
}

// --- Orquestrador: classifica uma linha completa -----------------------------

/**
 * Classifica uma linha de as-built (conteúdo + layer), espelhando a lógica
 * por texto da macro ExportarTextosParaExcel (incl. prioridade do código SAP).
 * @returns {{texto,layer,status,familia,nomeBase,nomeMaterial,codEstrutura,
 *            confianca,score,fonte,revisao,metros,qtd}}
 */
export function classificarLinha(texto, layer = '') {
  const conteudo = removerCodigosMText(texto);
  let { familia, score } = classificarComConfianca(conteudo, layer);

  let codEst = '';
  if (ehCodigoEstruturaSAP(conteudo)) {
    const base = removerEnvoltorioHashtag(conteudo.trim());
    codEst = base.slice(9, 16).trim();
  }
  let nomeBaseEst = '';
  if (codEst) {
    nomeBaseEst = extrairNomeBasePoste(codEst);
    if (nomeBaseEst) {
      const famPoste = familiaPosteDoPrefixo(nomeBaseEst);
      if (famPoste) { familia = famPoste; score = 90; } // código SAP tem prioridade
    }
  }

  const status = statusPorLayer(layer);
  const nomeBase = extrairNomeBasePoste(conteudo);
  const nomeMaterial = extrairNomeMaterial(familia, nomeBase, nomeBaseEst, conteudo);
  const confianca = nivelConfianca(score);
  const fonte = fonteClassificacaoTexto(conteudo, layer, familia, codEst);
  const revisao = revisaoTexto(status, familia, confianca);
  const metros = familia === 'RAMAL' ? somarMetrosRamal(conteudo) : 0;
  const qtd = quantidadeDoTexto(conteudo);

  return {
    texto: String(texto ?? ''), layer: String(layer ?? ''),
    status, familia, nomeBase, nomeMaterial, codEstrutura: codEst,
    confianca, score, fonte, revisao, metros, qtd,
  };
}

const FAMILIAS_COM_METROS = new Set(['CABO', 'RAMAL', 'COND NU', 'COND ISOLADO']);
export const ehFamiliaComMetros = (fam) => FAMILIAS_COM_METROS.has(fam);
