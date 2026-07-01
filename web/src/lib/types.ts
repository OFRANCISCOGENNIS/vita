export interface ColMap {
  pep: number; classe: number; descClasse: number; material: number;
  texto: number; qtd: number; uml: number; valor: number;
  classif: number; descSA: number; empresa: number; divisao: number;
  obj: number; denObj: number; numDoc: number; denominacao: number;
  usuario: number; dataLanc: number; odi: number; sa: number;
  cls1Raw: number; cls2Raw: number; cls3Raw: number; tipoAplicRaw: number;
  [key: string]: number;
}

export type Row = (string | number | Date | null)[];
export type Matrix = Row[];

export interface Catalogs {
  mat: Map<string, string>;      // COD -> "FAMILIA|CLS1|CLS2|CLS3"
  srv: Map<string, string>;      // COD -> "CLS1|CLS2|CLS3|TIPO_APLIC|SEGMENTO"
  cc: Map<string, string>;       // CLASSE -> "CLS1|CLS2|CLS3|TIPO_APLIC"
  cabo: Map<string, number>;     // COD -> fator KG→m
  combo: Map<string, number>;    // COD -> fator multiplicador
  tipoCls: Map<string, string>;  // CLS2 -> COM/UC/UAR
  descSrv: Map<string, string>;  // COD -> descrição
  cfg: Map<string, string>;      // CONFIG key -> value
  clsViagem: Set<string>;        // classes de viagem
}

export interface ProcessedData {
  rawHeaders: string[];
  dados: Matrix;
  nLin: number;
  cols: ColMap;
  catalogs: Catalogs;
}

export interface ReportSheet {
  name: string;
  headers: string[];
  rows: Row[];
}

export interface AnalysisResult {
  sheets: Map<string, ReportSheet>;
  nLin: number;
  tempoMs: number;
  // vereditos compartilhados entre MaterialVsServico e PainelExecutivo
  mvSVerd: Map<string, string>;
  mvSFamNC: Map<string, number>;
  mvSDif: Map<string, number>;
}
