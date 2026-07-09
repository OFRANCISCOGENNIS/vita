import { Injectable } from '@nestjs/common';
import { Platform, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { addInto, derive, emptyTotals, pctChange, resolvePeriod, round } from '../common/metrics.util';

export interface DashFilters {
  preset?: string; // today | 7d | 30d
  from?: string;
  to?: string;
  platform?: Platform;
  accountId?: string;
  clientId?: string;
  campaignId?: string;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private where(orgId: string, f: DashFilters, from: Date, to: Date): Prisma.MetricDailyWhereInput {
    return {
      account: { orgId, ...(f.clientId ? { clientId: f.clientId } : {}) },
      level: 'CAMPAIGN', // agregamos sempre no nível campanha
      ...(f.campaignId ? { refId: f.campaignId } : {}),
      ...(f.platform ? { platform: f.platform } : {}),
      ...(f.accountId ? { accountId: f.accountId } : {}),
      date: { gte: from, lte: to },
    };
  }

  async summary(orgId: string, f: DashFilters) {
    const p = resolvePeriod(f.preset, f.from, f.to);
    const [rows, prevRows] = await Promise.all([
      this.prisma.metricDaily.findMany({ where: this.where(orgId, f, p.from, p.to) }),
      this.prisma.metricDaily.findMany({ where: this.where(orgId, f, p.prevFrom, p.prevTo) }),
    ]);
    const cur = emptyTotals();
    rows.forEach((r) => addInto(cur, r));
    const prev = emptyTotals();
    prevRows.forEach((r) => addInto(prev, r));
    const c = derive(cur);
    const pv = derive(prev);
    const delta = (key: keyof typeof c) => pctChange(Number(c[key]), Number(pv[key]));
    return {
      period: { from: p.from, to: p.to },
      totals: c,
      previous: pv,
      change: {
        spend: delta('spend'), revenue: delta('revenue'), roas: delta('roas'), roi: delta('roi'),
        cpa: delta('cpa'), cpc: delta('cpc'), cpm: delta('cpm'), ctr: delta('ctr'),
        convRate: delta('convRate'), impressions: delta('impressions'),
        clicks: delta('clicks'), conversions: delta('conversions'),
      },
    };
  }

  async timeseries(orgId: string, f: DashFilters) {
    const p = resolvePeriod(f.preset, f.from, f.to);
    const rows = await this.prisma.metricDaily.findMany({
      where: this.where(orgId, f, p.from, p.to),
      orderBy: { date: 'asc' },
    });
    const byDay = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, emptyTotals());
      addInto(byDay.get(key)!, r);
    }
    return [...byDay.entries()].map(([date, t]) => ({ date, ...derive(t) }));
  }

  async funnel(orgId: string, f: DashFilters) {
    const p = resolvePeriod(f.preset, f.from, f.to);
    const rows = await this.prisma.metricDaily.findMany({ where: this.where(orgId, f, p.from, p.to) });
    const t = emptyTotals();
    rows.forEach((r) => addInto(t, r));
    return [
      { stage: 'Impressões', value: t.impressions },
      { stage: 'Cliques', value: t.clicks },
      { stage: 'Conversões', value: t.conversions },
    ];
  }

  async platformSplit(orgId: string, f: DashFilters) {
    const p = resolvePeriod(f.preset, f.from, f.to);
    const rows = await this.prisma.metricDaily.findMany({ where: this.where(orgId, f, p.from, p.to) });
    const byPlatform = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const r of rows) {
      if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, emptyTotals());
      addInto(byPlatform.get(r.platform)!, r);
    }
    return [...byPlatform.entries()].map(([platform, t]) => ({ platform, ...derive(t) }));
  }

  async heatmap(orgId: string, f: DashFilters) {
    const cells = await this.prisma.hourlyPerformance.findMany({
      where: {
        account: { orgId, ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.platform ? { platform: f.platform } : {}) },
        ...(f.accountId ? { accountId: f.accountId } : {}),
      },
    });
    const agg = new Map<string, { spend: number; conversions: number; revenue: number }>();
    for (const c of cells) {
      const key = `${c.dayOfWeek}-${c.hour}`;
      const cur = agg.get(key) ?? { spend: 0, conversions: 0, revenue: 0 };
      cur.spend += Number(c.spend);
      cur.conversions += c.conversions;
      cur.revenue += Number(c.revenue);
      agg.set(key, cur);
    }
    return [...agg.entries()].map(([key, v]) => {
      const [dayOfWeek, hour] = key.split('-').map(Number);
      return { dayOfWeek, hour, ...v, cpa: v.conversions > 0 ? round(v.spend / v.conversions) : null };
    });
  }

  async highlights(orgId: string, f: DashFilters) {
    const p = resolvePeriod(f.preset, f.from, f.to);
    const rows = await this.prisma.metricDaily.findMany({ where: this.where(orgId, { ...f, campaignId: undefined }, p.from, p.to) });
    const byCampaign = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const r of rows) {
      if (!byCampaign.has(r.refId)) byCampaign.set(r.refId, emptyTotals());
      addInto(byCampaign.get(r.refId)!, r);
    }
    const campaigns = await this.prisma.campaign.findMany({
      where: { id: { in: [...byCampaign.keys()] } },
      include: { account: true },
    });
    const stats = campaigns.map((c) => {
      const d = derive(byCampaign.get(c.id)!);
      return { id: c.id, name: c.name, platform: c.account.platform, ...d };
    }).filter((s) => s.spend > 50); // ignora campanhas irrelevantes no período
    if (stats.length === 0) return { best: null, worst: null, waste: null, opportunity: null };

    const best = [...stats].sort((a, b) => b.roas - a.roas)[0];
    const worst = [...stats].sort((a, b) => a.roas - b.roas)[0];
    const waste = [...stats].sort((a, b) => (b.spend - b.revenue) - (a.spend - a.revenue))[0];
    const opportunity = [...stats].filter((s) => s.roas >= 3).sort((a, b) => b.roas * b.spend - a.roas * a.spend)[0] ?? best;
    return {
      best, worst,
      waste: { ...waste, wasted: round(Math.max(waste.spend - waste.revenue, 0)) },
      opportunity: opportunity ? { ...opportunity, hint: 'ROAS alto e estável — candidata a escala gradual de verba' } : null,
    };
  }
}
