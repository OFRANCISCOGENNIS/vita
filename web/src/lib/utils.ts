const semAcCache = new Map<string, string>();

export function semAcento(s: string): string {
  const upper = s.toUpperCase();
  if (semAcCache.has(upper)) return semAcCache.get(upper)!;
  const result = upper.normalize('NFD').replace(/[̀-ͯ]/g, '');
  semAcCache.set(upper, result);
  return result;
}

export function normCod(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  // remove leading zeros e trata número float (ex: 5022000234.0)
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0) return String(Math.trunc(n));
  return s;
}

export function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function trim(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function ehMaterial(classif: string): boolean {
  const c = semAcento(classif.toUpperCase());
  return c.includes('MATERIAL') || c.includes('MATERIA') || c === 'ESTORNO MATERIAL';
}

export function tipoPEPCodigo(pep: string): 'I' | 'D' | 'M' | 'S' {
  const suf = pep.trim().slice(-2).toUpperCase();
  if (suf === '.I') return 'I';
  if (suf === '.D') return 'D';
  if (suf === '.M') return 'M';
  return 'S';
}

export function tipoPEPANEEL(pep: string): string {
  const c = tipoPEPCodigo(pep);
  if (c === 'I') return 'ODI';
  if (c === 'D') return 'ODD';
  if (c === 'M') return 'ODM';
  return 'OUTRO';
}

export function pep3(pep: string): string {
  const parts = pep.trim().split('.');
  if (parts.length >= 3) return parts.slice(0, 3).join('.');
  return pep.trim();
}

export function familiaAlias(cls2: string): string {
  const c = semAcento(cls2.toUpperCase().trim());
  if (c === 'CONDUTOR PROTEGIDO' || c === 'CONDPROT') return 'COND PROT';
  if (c === 'CONDUTOR NU' || c === 'CONDNU') return 'COND NU';
  return cls2.trim().toUpperCase();
}

export function grupoPerc(pep: string): string {
  const tipo = tipoPEPCodigo(pep);
  if (tipo === 'I') return 'ODI';
  if (tipo === 'D') return 'ODD';
  if (tipo === 'M') return 'ODM';
  return 'OUTROS';
}

export function classificacaoPendente(cls1: string, cls2: string, cls3: string): boolean {
  const s1 = semAcento(cls1.trim());
  const s2 = semAcento(cls2.trim());
  const s3 = semAcento(cls3.trim());
  return s3 === '' || s3 === 'CLASSIFICAR' || s2 === 'CLASSIFICAR' || s1 === 'CLASSIFICAR';
}

export function cls2SrvOverride(codSrv: string): string {
  if (codSrv === '5500000582' || codSrv === '5500000575') return 'COND PROT';
  return '';
}
