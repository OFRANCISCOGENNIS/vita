import * as XLSX from 'xlsx';
import { normCod, trim } from './utils';
import { descServico, DESC_SERVICO } from './descServico';
import type { Catalogs } from './types';

function readSheet(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'array' });
        resolve(wb);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function sheetToMatrix(ws: XLSX.WorkSheet): string[][] {
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
}

function colIdx(headers: string[], frags: string[]): number {
  const norm = (s: string) => s.trim().toUpperCase();
  for (const frag of frags) {
    const f = norm(frag);
    for (let j = 0; j < headers.length; j++) {
      if (norm(headers[j]) === f) return j;
    }
  }
  for (const frag of frags) {
    const f = norm(frag);
    for (let j = 0; j < headers.length; j++) {
      if (norm(headers[j]).includes(f)) return j;
    }
  }
  return -1;
}

export function emptyCatalogs(): Catalogs {
  return {
    mat: new Map(), srv: new Map(), cc: new Map(),
    cabo: new Map(), combo: new Map(), tipoCls: new Map(),
    descSrv: new Map(), cfg: new Map(), clsViagem: new Set(),
  };
}

export function loadBuiltinDescSrv(cats: Catalogs) {
  for (const [k, v] of Object.entries(DESC_SERVICO)) cats.descSrv.set(k, v);
}

export async function carregarCatalogoMateriais(file: File, cats: Catalogs) {
  const wb = await readSheet(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToMatrix(ws);
  if (rows.length < 2) return;
  const headers = rows[0].map(String);
  const cCod = colIdx(headers, ['COD MATERIAL', 'COD_MATERIAL', 'MATERIAL']);
  const cFam = colIdx(headers, ['FAMILIA']);
  const c1 = colIdx(headers, ['CLS1']);
  const c2 = colIdx(headers, ['CLS2']);
  const c3 = colIdx(headers, ['CLS3']);
  if (cCod < 0) return;
  for (let i = 1; i < rows.length; i++) {
    const cod = normCod(rows[i][cCod]);
    if (!cod || cats.mat.has(cod)) continue;
    const fam = cFam >= 0 ? trim(rows[i][cFam]) : '';
    const v1 = c1 >= 0 ? trim(rows[i][c1]) : '';
    const v2 = c2 >= 0 ? trim(rows[i][c2]) : '';
    const v3 = c3 >= 0 ? trim(rows[i][c3]) : '';
    cats.mat.set(cod, `${fam}|${v1}|${v2}|${v3}`);
  }
}

export async function carregarCatalogoServicos(file: File, cats: Catalogs) {
  const wb = await readSheet(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToMatrix(ws);
  if (rows.length < 2) return;
  const headers = rows[0].map(String);
  const cCod = colIdx(headers, ['COD SERVICO', 'COD_SERVICO', 'SERVICO']);
  const c1 = colIdx(headers, ['CLS1']);
  const c2 = colIdx(headers, ['CLS2']);
  const c3 = colIdx(headers, ['CLS3']);
  const cTA = colIdx(headers, ['TIPO APLICACAO', 'TIPO_APLICACAO', 'TIPO APLIC']);
  const cSeg = colIdx(headers, ['SEGMENTO']);
  if (cCod < 0) return;
  for (let i = 1; i < rows.length; i++) {
    const cod = normCod(rows[i][cCod]);
    if (!cod || cats.srv.has(cod)) continue;
    const v1 = c1 >= 0 ? trim(rows[i][c1]) : '';
    const v2 = c2 >= 0 ? trim(rows[i][c2]) : '';
    const v3 = c3 >= 0 ? trim(rows[i][c3]) : '';
    const ta = cTA >= 0 ? trim(rows[i][cTA]) : '';
    const seg = cSeg >= 0 ? trim(rows[i][cSeg]) : '';
    cats.srv.set(cod, `${v1}|${v2}|${v3}|${ta}|${seg}`);
  }
}

export async function carregarCatalogoClasse(file: File, cats: Catalogs) {
  const wb = await readSheet(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToMatrix(ws);
  if (rows.length < 2) return;
  const headers = rows[0].map(String);
  const cCod = colIdx(headers, ['CLASSE DE CUSTO', 'CLASSE_CUSTO', 'CLASSE']);
  const c1 = colIdx(headers, ['CLS1']);
  const c2 = colIdx(headers, ['CLS2']);
  const c3 = colIdx(headers, ['CLS3']);
  const cTA = colIdx(headers, ['TIPO APLICACAO', 'TIPO_APLICACAO', 'TIPO APLIC']);
  const cViagem = colIdx(headers, ['VIAGEM', 'IS_VIAGEM', 'CLASSE_VIAGEM']);
  if (cCod < 0) return;
  for (let i = 1; i < rows.length; i++) {
    const cod = normCod(rows[i][cCod]);
    if (!cod) continue;
    const v1 = c1 >= 0 ? trim(rows[i][c1]) : '';
    const v2 = c2 >= 0 ? trim(rows[i][c2]) : '';
    const v3 = c3 >= 0 ? trim(rows[i][c3]) : '';
    const ta = cTA >= 0 ? trim(rows[i][cTA]) : '';
    cats.cc.set(cod, `${v1}|${v2}|${v3}|${ta}`);
    if (cViagem >= 0 && trim(rows[i][cViagem]).toUpperCase() === 'S') {
      cats.clsViagem.add(cod);
    }
  }
}

export function catInfo(cats: Catalogs, codMat: string, idx: number): string {
  const v = cats.mat.get(codMat);
  if (!v) return '';
  const parts = v.split('|');
  return idx < parts.length ? parts[idx].trim() : '';
}

export function srvInfo(cats: Catalogs, codSrv: string, idx: number): string {
  const v = cats.srv.get(codSrv);
  if (!v) return '';
  const parts = v.split('|');
  return idx < parts.length ? parts[idx].trim() : '';
}

export function ccInfo(cats: Catalogs, classe: string, idx: number): string {
  const v = cats.cc.get(classe);
  if (!v) return '';
  const parts = v.split('|');
  return idx < parts.length ? parts[idx].trim() : '';
}

export function getDescServico(cats: Catalogs, cod: string): string {
  return cats.descSrv.get(cod) ?? descServico(cod);
}

