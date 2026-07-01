import * as XLSX from 'xlsx';
import { mapearColunas } from './mapearColunas';
import { normCod, toNum, trim, ehMaterial, tipoPEPANEEL, tipoPEPCodigo,
         pep3, familiaAlias, grupoPerc, classificacaoPendente, cls2SrvOverride } from './utils';
import { catInfo, srvInfo, ccInfo, getDescServico } from './catalogos';
import type { ColMap, Matrix, Row, ReportSheet, AnalysisResult, Catalogs } from './types';

// ─── helpers ────────────────────────────────────────────────────────────────

function field(dados: Matrix, i: number, col: number): unknown {
  if (col < 0 || col >= dados[i].length) return '';
  return dados[i][col];
}
function txt(dados: Matrix, i: number, col: number): string {
  return trim(field(dados, i, col));
}
function num(dados: Matrix, i: number, col: number): number {
  return toNum(field(dados, i, col));
}

function matInfoLinha(dados: Matrix, i: number, idx: number, cols: ColMap, cats: Catalogs): string {
  const cod = normCod(field(dados, i, cols.material));
  const fromCat = catInfo(cats, cod, idx);
  if (fromCat) return fromCat;
  if (idx >= 1 && idx <= 3) {
    const fromCC = ccInfo(cats, txt(dados, i, cols.classe), idx - 1);
    if (fromCC) return fromCC;
  }
  if (idx === 0) return '(SEM FAMILIA)';
  if (idx === 1) return txt(dados, i, cols.cls1Raw);
  if (idx === 2) return txt(dados, i, cols.cls2Raw);
  if (idx === 3) return txt(dados, i, cols.cls3Raw);
  return '';
}

function srvInfoLinha(dados: Matrix, i: number, idx: number, cols: ColMap, cats: Catalogs): string {
  const cod = normCod(field(dados, i, cols.material));
  if (idx === 1) {
    const ov = cls2SrvOverride(cod);
    if (ov) return ov;
  }
  const fromCat = srvInfo(cats, cod, idx);
  if (fromCat) return fromCat;
  if (idx >= 0 && idx <= 2) {
    const fromCC = ccInfo(cats, txt(dados, i, cols.classe), idx);
    if (fromCC) return fromCC;
  }
  if (idx === 0) return txt(dados, i, cols.cls1Raw);
  if (idx === 1) return txt(dados, i, cols.cls2Raw);
  if (idx === 2) return txt(dados, i, cols.cls3Raw);
  if (idx === 3) return txt(dados, i, cols.tipoAplicRaw);
  return '';
}

// ─── sheet reading ───────────────────────────────────────────────────────────

export async function lerPlanilha(file: File): Promise<{ headers: string[]; dados: Matrix }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'array', cellDates: true });
        // Prioritize the sheet with "Elemento PEP" in row 1
        let wsName = wb.SheetNames[0];
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
            if (cell && String(cell.v).trim().toUpperCase() === 'ELEMENTO PEP') {
              wsName = name; break;
            }
          }
        }
        const raw: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wsName], {
          header: 1, defval: '', raw: false,
        }) as unknown[][];
        const headers = (raw[0] ?? []).map(String);
        const dados: Matrix = (raw.slice(1) as Row[]);
        resolve({ headers, dados });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── relatórios ─────────────────────────────────────────────────────────────

function gerarRazaoCJ(dados: Matrix, cols: ColMap, cats: Catalogs, rawHeaders: string[]): ReportSheet {
  const addCls1 = cols.cls1Raw < 0;
  const addCls2 = cols.cls2Raw < 0;
  const addCls3 = cols.cls3Raw < 0;
  const addTA = cols.tipoAplicRaw < 0;

  const headers = [...rawHeaders];
  if (addCls1) headers.push('CLS1');
  if (addCls2) headers.push('CLS2');
  if (addCls3) headers.push('CLS3');
  if (addTA) headers.push('TIPO_APLICACAO');

  const rows: Row[] = [];
  for (let i = 0; i < dados.length; i++) {
    if (!trim(dados[i][cols.pep] as string)) continue;
    const row: Row = [...dados[i]];
    const isMat = ehMaterial(txt(dados, i, cols.classif));
    if (addCls1) row.push(isMat ? matInfoLinha(dados, i, 1, cols, cats) : srvInfoLinha(dados, i, 0, cols, cats));
    if (addCls2) row.push(isMat ? matInfoLinha(dados, i, 2, cols, cats) : srvInfoLinha(dados, i, 1, cols, cats));
    if (addCls3) row.push(isMat ? matInfoLinha(dados, i, 3, cols, cats) : srvInfoLinha(dados, i, 2, cols, cats));
    if (addTA) row.push(isMat ? txt(dados, i, cols.tipoAplicRaw) : srvInfoLinha(dados, i, 3, cols, cats));
    rows.push(row);
  }
  return { name: 'RAZAO CJ', headers, rows };
}

function gerarMaterial(dados: Matrix, cols: ColMap, cats: Catalogs): ReportSheet {
  const dQ = new Map<string, number>();
  const dV = new Map<string, number>();
  const dFirst = new Map<string, number>();

  for (let i = 0; i < dados.length; i++) {
    const pep = trim(dados[i][cols.pep] as string);
    if (!pep) continue;
    if (!ehMaterial(txt(dados, i, cols.classif))) continue;
    const cod = normCod(field(dados, i, cols.material));
    const cl = txt(dados, i, cols.classif).toUpperCase();
    const k = `${pep}|${cod}|${cl}`;
    if (!dFirst.has(k)) dFirst.set(k, i);
    dQ.set(k, (dQ.get(k) ?? 0) + num(dados, i, cols.qtd));
    dV.set(k, (dV.get(k) ?? 0) + num(dados, i, cols.valor));
  }

  const headers = ['PEP4NIVEL','PEP3','TIPO_PEP','CLASSE_CUSTO','MATERIAL','TEXTO_MATERIAL',
                   'UML','QTD_ENTRADA','VALOR_MOEDA','CLASSIFICACAO','CLS2','PRECO_UNITARIO','ADERENCIA'];
  const rows: Row[] = [];

  for (const [k, fi] of dFirst) {
    const q = Math.round((dQ.get(k) ?? 0) * 100) / 100;
    const v = Math.round((dV.get(k) ?? 0) * 100) / 100;
    if (q === 0 && v === 0) continue;
    const pep = trim(dados[fi][cols.pep] as string);
    const aderencia = tipoPEPCodigo(pep) === 'D'
      ? (q > 0 || v > 0 ? 'NAO ADERENTE' : 'ADERENTE')
      : (q < 0 || v < 0 ? 'NAO ADERENTE' : 'ADERENTE');
    rows.push([
      pep, pep3(pep), tipoPEPANEEL(pep),
      txt(dados, fi, cols.classe),
      normCod(field(dados, fi, cols.material)),
      txt(dados, fi, cols.texto),
      txt(dados, fi, cols.uml),
      q, v,
      txt(dados, fi, cols.classif),
      matInfoLinha(dados, fi, 2, cols, cats),
      q !== 0 ? Math.round((dV.get(k)! / dQ.get(k)!) * 10000) / 10000 : '',
      aderencia,
    ]);
  }
  return { name: 'MATERIAL', headers, rows };
}

function gerarServico(dados: Matrix, cols: ColMap, cats: Catalogs): ReportSheet {
  const dQ = new Map<string, number>();
  const dV = new Map<string, number>();
  const dFirst = new Map<string, number>();

  for (let i = 0; i < dados.length; i++) {
    const pep = trim(dados[i][cols.pep] as string);
    if (!pep) continue;
    if (ehMaterial(txt(dados, i, cols.classif))) continue;
    const cod = normCod(field(dados, i, cols.material));
    if (!cod || cod === '0') continue;
    const k = `${pep}|${cod}`;
    if (!dFirst.has(k)) dFirst.set(k, i);
    dQ.set(k, (dQ.get(k) ?? 0) + num(dados, i, cols.qtd));
    dV.set(k, (dV.get(k) ?? 0) + num(dados, i, cols.valor));
  }

  const headers = ['PEP4NIVEL','PEP3','TIPO_PEP','COD_SERVICO','DESCRICAO_SERVICO',
                   'CLASSE_CUSTO','QTD_ENTRADA','VALOR_MOEDA','CLS1','CLS2','CLS3','TIPO_APLICACAO','GRUPO_PERC'];
  const rows: Row[] = [];

  for (const [k, fi] of dFirst) {
    const q = Math.round((dQ.get(k) ?? 0) * 100) / 100;
    const v = Math.round((dV.get(k) ?? 0) * 100) / 100;
    if (q === 0 && v === 0) continue;
    const pep = trim(dados[fi][cols.pep] as string);
    const cod = normCod(field(dados, fi, cols.material));
    rows.push([
      pep, pep3(pep), tipoPEPANEEL(pep),
      cod,
      getDescServico(cats, cod),
      txt(dados, fi, cols.classe),
      q, v,
      srvInfoLinha(dados, fi, 0, cols, cats),
      srvInfoLinha(dados, fi, 1, cols, cats),
      srvInfoLinha(dados, fi, 2, cols, cats),
      srvInfoLinha(dados, fi, 3, cols, cats),
      grupoPerc(pep),
    ]);
  }
  return { name: 'SERVICO', headers, rows };
}

function gerarMaterialVsServico(
  dados: Matrix, cols: ColMap, cats: Catalogs,
  mvSVerd: Map<string, string>, mvSFamNC: Map<string, number>, mvSDif: Map<string, number>
): ReportSheet {
  const dMat = new Map<string, number>();
  const dSrv = new Map<string, number>();
  const dKeys = new Set<string>();

  for (let i = 0; i < dados.length; i++) {
    const pep = trim(dados[i][cols.pep] as string);
    if (!pep) continue;
    let q = num(dados, i, cols.qtd);
    const isMat = ehMaterial(txt(dados, i, cols.classif));
    if (isMat) {
      let cls2 = matInfoLinha(dados, i, 2, cols, cats) || '(SEM CLS2)';
      cls2 = familiaAlias(cls2);
      const k = `${pep}|${cls2}`;
      dMat.set(k, (dMat.get(k) ?? 0) + q);
      dKeys.add(k);
    } else {
      let cls2 = srvInfoLinha(dados, i, 1, cols, cats) || '(SEM CLS2)';
      cls2 = familiaAlias(cls2);
      const k = `${pep}|${cls2}`;
      dSrv.set(k, (dSrv.get(k) ?? 0) + q);
      dKeys.add(k);
    }
  }

  const TOLS = 0.05;
  const headers = ['PEP4NIVEL','PEP3','TIPO_PEP','FAMILIA','QTD_MATERIAL','QTD_SERVICO','DIFERENCA','ADERENCIA'];
  const rows: Row[] = [];

  // group vereditos by PEP3 for ODI
  const pep3Fams = new Map<string, { total: number; nc: number; dif: number }>();

  for (const k of dKeys) {
    const [pep, cls2] = k.split('|');
    const mq = Math.round((dMat.get(k) ?? 0) * 100) / 100;
    const sq = Math.round((dSrv.get(k) ?? 0) * 100) / 100;
    if (mq === 0 && sq === 0) continue;
    const dif = mq - sq;
    const pctDif = mq !== 0 ? Math.abs(dif) / Math.abs(mq) : (sq !== 0 ? 1 : 0);
    const aderente = pctDif <= TOLS;
    rows.push([pep, pep3(pep), tipoPEPANEEL(pep), cls2, mq, sq, dif, aderente ? 'ADERENTE' : 'NAO ADERENTE']);

    const p3 = pep3(pep);
    if (tipoPEPCodigo(pep) === 'I') {
      if (!pep3Fams.has(p3)) pep3Fams.set(p3, { total: 0, nc: 0, dif: 0 });
      const acc = pep3Fams.get(p3)!;
      acc.total++;
      if (!aderente) { acc.nc++; acc.dif += Math.abs(dif); }
    }
  }

  for (const [p3, acc] of pep3Fams) {
    const verd = acc.nc === 0 ? 'APROVADO' : 'REPROVADO';
    mvSVerd.set(p3, verd);
    mvSFamNC.set(p3, acc.nc);
    mvSDif.set(p3, acc.dif);
  }

  return { name: 'MATERIAL vs SERVICO', headers, rows };
}

function gerarNaoClassificados(dados: Matrix, cols: ColMap, cats: Catalogs): ReportSheet {
  const headers = ['PEP4NIVEL','PEP3','TIPO_PEP','MATERIAL','TEXTO_MATERIAL',
                   'CLASSIFICACAO','CLS1','CLS2','CLS3','VALOR_MOEDA','QTD_ENTRADA'];
  const rows: Row[] = [];

  for (let i = 0; i < dados.length; i++) {
    const pep = trim(dados[i][cols.pep] as string);
    if (!pep) continue;
    const isMat = ehMaterial(txt(dados, i, cols.classif));
    const cls1 = isMat ? matInfoLinha(dados, i, 1, cols, cats) : srvInfoLinha(dados, i, 0, cols, cats);
    const cls2 = isMat ? matInfoLinha(dados, i, 2, cols, cats) : srvInfoLinha(dados, i, 1, cols, cats);
    const cls3 = isMat ? matInfoLinha(dados, i, 3, cols, cats) : srvInfoLinha(dados, i, 2, cols, cats);
    if (!classificacaoPendente(cls1, cls2, cls3)) continue;
    rows.push([
      pep, pep3(pep), tipoPEPANEEL(pep),
      normCod(field(dados, i, cols.material)),
      txt(dados, i, cols.texto),
      txt(dados, i, cols.classif),
      cls1, cls2, cls3,
      num(dados, i, cols.valor),
      num(dados, i, cols.qtd),
    ]);
  }
  return { name: 'NAO CLASSIFICADOS', headers, rows };
}

function gerarServicoSemMaterial(dados: Matrix, cols: ColMap, cats: Catalogs): ReportSheet {
  // PEPs that have services but no material
  const pepTemMat = new Set<string>();
  const pepSrv = new Map<string, number[]>();

  for (let i = 0; i < dados.length; i++) {
    const pep = trim(dados[i][cols.pep] as string);
    if (!pep) continue;
    if (ehMaterial(txt(dados, i, cols.classif))) {
      pepTemMat.add(pep);
    } else {
      if (!pepSrv.has(pep)) pepSrv.set(pep, []);
      pepSrv.get(pep)!.push(i);
    }
  }

  const headers = ['PEP4NIVEL','PEP3','TIPO_PEP','COD_SERVICO','DESCRICAO_SERVICO','VALOR_MOEDA','QTD_ENTRADA'];
  const rows: Row[] = [];
  for (const [pep, indices] of pepSrv) {
    if (pepTemMat.has(pep)) continue;
    for (const i of indices) {
      const cod = normCod(field(dados, i, cols.material));
      rows.push([
        pep, pep3(pep), tipoPEPANEEL(pep),
        cod, getDescServico(cats, cod),
        num(dados, i, cols.valor),
        num(dados, i, cols.qtd),
      ]);
    }
  }
  return { name: 'SERVICO SEM MATERIAL', headers, rows };
}

// ─── main entry point ────────────────────────────────────────────────────────

export async function processar(file: File, cats: Catalogs): Promise<AnalysisResult> {
  const t0 = performance.now();

  const { headers: rawHeaders, dados } = await lerPlanilha(file);
  const cols = mapearColunas(rawHeaders);
  if (!cols) throw new Error('Colunas obrigatórias não encontradas (PEP, Classificação, Valor, Qtd, Material)');

  // count valid lines
  let nLin = 0;
  for (const row of dados) {
    if (trim(row[cols.pep] as string)) nLin++;
  }
  if (nLin === 0) throw new Error('Nenhuma linha com PEP preenchido encontrada na base.');

  const mvSVerd = new Map<string, string>();
  const mvSFamNC = new Map<string, number>();
  const mvSDif = new Map<string, number>();

  const sheets = new Map<string, ReportSheet>();

  const razaoCJ = gerarRazaoCJ(dados, cols, cats, rawHeaders);
  sheets.set(razaoCJ.name, razaoCJ);

  const mvs = gerarMaterialVsServico(dados, cols, cats, mvSVerd, mvSFamNC, mvSDif);
  sheets.set(mvs.name, mvs);

  const mat = gerarMaterial(dados, cols, cats);
  sheets.set(mat.name, mat);

  const srv = gerarServico(dados, cols, cats);
  sheets.set(srv.name, srv);

  const nc = gerarNaoClassificados(dados, cols, cats);
  sheets.set(nc.name, nc);

  const ssm = gerarServicoSemMaterial(dados, cols, cats);
  sheets.set(ssm.name, ssm);

  return {
    sheets,
    nLin,
    tempoMs: Math.round(performance.now() - t0),
    mvSVerd, mvSFamNC, mvSDif,
  };
}
