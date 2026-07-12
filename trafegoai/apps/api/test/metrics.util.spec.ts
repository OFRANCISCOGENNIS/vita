import { addInto, derive, emptyTotals, pctChange, resolvePeriod, round } from '../src/common/metrics.util';

describe('metrics.util — métricas derivadas', () => {
  it('deriva ROAS, CPA, CPC, CPM, CTR e taxa de conversão corretamente', () => {
    const d = derive({ spend: 1000, revenue: 4000, impressions: 100_000, clicks: 2000, conversions: 100 });
    expect(d.roas).toBe(4); // 4000/1000
    expect(d.roi).toBe(300); // (4000-1000)/1000 * 100
    expect(d.cpa).toBe(10); // 1000/100
    expect(d.cpc).toBe(0.5); // 1000/2000
    expect(d.cpm).toBe(10); // 1000/100000 * 1000
    expect(d.ctr).toBe(2); // 2000/100000 * 100
    expect(d.convRate).toBe(5); // 100/2000 * 100
  });

  it('não divide por zero (retorna 0 quando denominador é 0)', () => {
    const d = derive({ spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 });
    expect(d.roas).toBe(0);
    expect(d.cpa).toBe(0);
    expect(d.ctr).toBe(0);
  });

  it('addInto acumula linhas (aceita Decimal como string/number)', () => {
    const acc = emptyTotals();
    addInto(acc, { spend: '10.50', revenue: '20', impressions: 5, clicks: 2, conversions: 1 });
    addInto(acc, { spend: 4.5, revenue: 5, impressions: 3, clicks: 1, conversions: 0 });
    expect(acc.spend).toBe(15);
    expect(acc.revenue).toBe(25);
    expect(acc.impressions).toBe(8);
    expect(acc.clicks).toBe(3);
    expect(acc.conversions).toBe(1);
  });

  it('pctChange calcula variação e devolve null sem base', () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(80, 100)).toBe(-20);
    expect(pctChange(50, 0)).toBeNull();
  });

  it('round arredonda para N casas', () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(2.5, 0)).toBe(3);
  });
});

describe('metrics.util — resolução de período', () => {
  it('preset 7d cobre 7 dias e o período anterior é equivalente e imediatamente antes', () => {
    const p = resolvePeriod('7d');
    const spanDays = Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000) + 1;
    expect(spanDays).toBe(7);
    // o período anterior termina 1 dia antes do início do atual
    expect(p.prevTo.getTime()).toBe(p.from.getTime() - 86_400_000);
    const prevSpan = Math.round((p.prevTo.getTime() - p.prevFrom.getTime()) / 86_400_000) + 1;
    expect(prevSpan).toBe(7);
  });

  it('aceita intervalo personalizado from/to', () => {
    const p = resolvePeriod(undefined, '2026-01-01', '2026-01-10');
    expect(p.from.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(p.to.toISOString().slice(0, 10)).toBe('2026-01-10');
  });
});
