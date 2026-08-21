import { semAcento } from './utils';
import type { ColMap } from './types';

function colLike(headers: string[], frags: string[]): number {
  const norm = (s: string) => semAcento(s.trim().toUpperCase());
  // exact match first
  for (const frag of frags) {
    const f = norm(frag);
    for (let j = 0; j < headers.length; j++) {
      if (norm(headers[j]) === f) return j;
    }
  }
  // contains match
  for (const frag of frags) {
    const f = norm(frag);
    for (let j = 0; j < headers.length; j++) {
      if (norm(headers[j]).includes(f)) return j;
    }
  }
  return -1;
}

function colExata(headers: string[], candidates: string[]): number {
  const norm = (s: string) => semAcento(s.trim().toUpperCase());
  for (const c of candidates) {
    const f = norm(c);
    for (let j = 0; j < headers.length; j++) {
      if (norm(headers[j]) === f) return j;
    }
  }
  return -1;
}

export function mapearColunas(headers: string[]): ColMap | null {
  const c = (frags: string[]) => colLike(headers, frags);
  const e = (candidates: string[]) => colExata(headers, candidates);

  const pep = c(['ELEMENTO PEP', 'PEP']);
  const classif = c(['CLASSIFICA']);
  const valor = c(['VALOR/MOEDA', 'VALOR_MOEDA', 'VALOR MOEDA']);
  const qtd = c(['QTD.TOTAL', 'QTD_ENTRADA', 'QTD ENTRADA']);
  const material = c(['MATERIAL']);

  if (pep < 0 || classif < 0 || valor < 0 || qtd < 0 || material < 0) return null;

  const empresa = c(['EMPRESA']) >= 0 ? c(['EMPRESA']) : c(['DIVISAO']);
  const divisao = c(['DIVISAO']) >= 0 ? c(['DIVISAO']) : c(['EMPRESA']);

  return {
    pep,
    classe: c(['CLASSE DE CUSTO', 'CLASSE_CUSTO', 'CLASSE CUSTO']),
    descClasse: c(['DESCR.CLASSE', 'DENOM.CLASSE', 'DESC_CLASSE']),
    material,
    texto: c(['TEXTO BREVE', 'TEXTO_MATERIAL']),
    qtd,
    uml: c(['UNID.MEDIDA', 'UML']),
    valor,
    classif,
    descSA: c(['DESCRICAO SA', 'DESCRICAO_SA', 'DESCR SA']),
    empresa,
    divisao,
    obj: c(['OBJETO']),
    denObj: c(['DENOMINACAO_OBJETO', 'DENOMINACAO OBJETO']),
    numDoc: c(['NUM_DOC', 'NUM DOC']),
    denominacao: c(['DENOMINACAO']),
    usuario: c(['USUARIO']),
    dataLanc: c(['DATA_LANCAMENTO', 'DATA LANCAMENTO']),
    odi: c(['ODI_ANEEL', 'ODI ANEEL']),
    sa: e(['SA']),
    cls1Raw: c(['CLS1']),
    cls2Raw: c(['CLS2']),
    cls3Raw: c(['CLS3']),
    tipoAplicRaw: c(['TIPO_APLICACAO', 'TIPO APLICACAO', 'TIPO APLIC']),
  };
}
