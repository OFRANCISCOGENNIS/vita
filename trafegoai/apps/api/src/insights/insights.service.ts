import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { addInto, derive, emptyTotals, round } from '../common/metrics.util';
import { LlmService } from '../ai/llm.service';
import { DIAGNOSIS_PROMPT } from '../ai/prompts';
import { JwtPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class InsightsService {
  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
    private audit: AuditService,
    private campaigns: CampaignsService,
    private realtime: RealtimeGateway,
  ) {}

  /** Snapshot compacto das métricas por campanha, usado como contexto da IA. */
  async buildContext(orgId: string): Promise<string> {
    const rows = await this.campaigns.list(orgId, { preset: '30d' });
    const compact = rows.map((r) => ({
      campanha: r.name, plataforma: r.platform, status: r.status,
      gasto: r.spend, receita: r.revenue, roas: r.roas, cpa: r.cpa,
      ctr: r.ctr, conversoes: r.conversions,
    }));
    return JSON.stringify({ periodo: 'últimos 30 dias', campanhas: compact }, null, 1);
  }

  /** Diagnóstico automático em linguagem simples (LLM, com fallback heurístico). */
  async diagnostics(orgId: string) {
    const context = await this.buildContext(orgId);
    const fromLlm = await this.llm.complete(DIAGNOSIS_PROMPT.replace('{DATA}', context));
    if (fromLlm) return { source: 'llm', markdown: fromLlm };

    // Fallback heurístico (modo demo, sem chave de API)
    const rows = await this.campaigns.list(orgId, { preset: '30d' });
    const active = rows.filter((r) => r.spend > 100);
    const good = [...active].sort((a, b) => b.roas - a.roas).slice(0, 3);
    const bad = [...active].filter((r) => r.roas < 1.5).sort((a, b) => (b.spend - b.revenue) - (a.spend - a.revenue)).slice(0, 3);
    const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const md = [
      '## O que está indo bem',
      ...good.map((g) => `- **${g.name}** (${g.platform}): ROAS ${g.roas.toFixed(1)} com ${brl(g.revenue)} de receita sobre ${brl(g.spend)} investidos.`),
      '',
      '## O que está queimando verba',
      ...(bad.length
        ? bad.map((b) => `- **${b.name}** (${b.platform}): ROAS ${b.roas.toFixed(1)} — desperdício estimado de ${brl(Math.max(b.spend - b.revenue, 0))} nos últimos 30 dias. CPA de ${brl(b.cpa)}.`)
        : ['- Nenhuma campanha com desperdício relevante no período. Bom trabalho!']),
      '',
      '## Prioridade da semana',
      bad.length
        ? `Realocar a verba de **${bad[0].name}** (ROAS ${bad[0].roas.toFixed(1)}) para **${good[0]?.name}** (ROAS ${good[0]?.roas.toFixed(1)}). Só essa mudança tende a recuperar ${brl(Math.max(bad[0].spend - bad[0].revenue, 0))}/mês em eficiência de mídia.`
        : `Escalar gradualmente **${good[0]?.name}** (+20% de verba a cada 3 dias) preservando a fase de aprendizado.`,
    ].join('\n');
    return { source: 'heuristic', markdown: md };
  }

  listRecommendations(orgId: string) {
    return this.prisma.recommendation.findMany({
      where: { orgId, status: { in: ['OPEN', 'APPLIED'] } },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }],
    });
  }

  /**
   * "Aplicar com um clique": executa a ação da recomendação via conector da
   * plataforma. O frontend exige confirmação explícita antes de chamar aqui,
   * e o payload guarda o estado anterior para permitir desfazer.
   */
  async applyRecommendation(auth: JwtPayload, id: string) {
    const rec = await this.prisma.recommendation.findFirst({ where: { id, orgId: auth.orgId } });
    if (!rec) throw new NotFoundException('Recomendação não encontrada');
    if (rec.status !== 'OPEN') throw new BadRequestException('Recomendação já aplicada ou dispensada');

    const payload = rec.payload as any;
    const undo: any = { action: payload.action };
    switch (payload.action) {
      case 'PAUSE': {
        const c = await this.prisma.campaign.findUnique({ where: { id: payload.campaignId } });
        undo.previousStatus = c?.status;
        await this.campaigns.setStatus(auth, payload.campaignId, 'PAUSED');
        break;
      }
      case 'INCREASE_BUDGET': {
        const c = await this.prisma.campaign.findUnique({ where: { id: payload.campaignId } });
        const current = Number(c?.budgetDaily ?? 0);
        undo.previousBudget = current;
        await this.campaigns.updateBudget(auth, payload.campaignId, round(current * (1 + payload.percent / 100)));
        break;
      }
      case 'REALLOCATE_BUDGET': {
        const from = await this.prisma.campaign.findUnique({ where: { id: payload.fromCampaignId } });
        const to = await this.prisma.campaign.findUnique({ where: { id: payload.toCampaignId } });
        undo.previous = { from: Number(from?.budgetDaily ?? 0), to: Number(to?.budgetDaily ?? 0) };
        await this.campaigns.updateBudget(auth, payload.fromCampaignId, Math.max(Number(from?.budgetDaily ?? 0) - payload.amount, 1));
        await this.campaigns.updateBudget(auth, payload.toCampaignId, Number(to?.budgetDaily ?? 0) + payload.amount);
        break;
      }
      default:
        // SWAP_CREATIVE / ADJUST_SCHEDULE: registradas como tarefa aplicada;
        // PONTO DE INTEGRAÇÃO: mutações de criativo/ad schedule nas APIs oficiais.
        break;
    }

    const updated = await this.prisma.recommendation.update({
      where: { id },
      data: { status: 'APPLIED', appliedAt: new Date(), payload: { ...payload, undo } },
    });
    await this.audit.log(auth, 'RECOMMENDATION_APPLIED', 'RECOMMENDATION', id, null, { type: rec.type });
    return updated;
  }

  /** Desfaz uma recomendação aplicada usando o estado salvo no payload. */
  async undoRecommendation(auth: JwtPayload, id: string) {
    const rec = await this.prisma.recommendation.findFirst({ where: { id, orgId: auth.orgId } });
    if (!rec || rec.status !== 'APPLIED') throw new BadRequestException('Nada para desfazer');
    const payload = rec.payload as any;
    const undo = payload.undo ?? {};
    switch (payload.action) {
      case 'PAUSE':
        if (undo.previousStatus === 'ACTIVE') await this.campaigns.setStatus(auth, payload.campaignId, 'ACTIVE');
        break;
      case 'INCREASE_BUDGET':
        if (undo.previousBudget > 0) await this.campaigns.updateBudget(auth, payload.campaignId, undo.previousBudget);
        break;
      case 'REALLOCATE_BUDGET':
        if (undo.previous) {
          await this.campaigns.updateBudget(auth, payload.fromCampaignId, undo.previous.from);
          await this.campaigns.updateBudget(auth, payload.toCampaignId, undo.previous.to);
        }
        break;
    }
    const updated = await this.prisma.recommendation.update({ where: { id }, data: { status: 'UNDONE' } });
    await this.audit.log(auth, 'RECOMMENDATION_UNDONE', 'RECOMMENDATION', id, null, null);
    return updated;
  }

  async dismissRecommendation(auth: JwtPayload, id: string) {
    const rec = await this.prisma.recommendation.findFirst({ where: { id, orgId: auth.orgId } });
    if (!rec) throw new NotFoundException('Recomendação não encontrada');
    return this.prisma.recommendation.update({ where: { id }, data: { status: 'DISMISSED' } });
  }

  listAnomalies(orgId: string) {
    return this.prisma.anomaly.findMany({ where: { orgId, resolved: false }, orderBy: { detectedAt: 'desc' } });
  }

  /**
   * Pipeline de detecção de anomalias: compara o último dia com a média/desvio
   * dos 14 anteriores (z-score) por conta, para gasto e conversões.
   * Roda no worker (jobs/rules) e sob demanda aqui.
   */
  async detectAnomalies(orgId: string) {
    const accounts = await this.prisma.adAccount.findMany({ where: { orgId } });
    const created: string[] = [];
    for (const acc of accounts) {
      const rows = await this.prisma.metricDaily.findMany({
        where: { accountId: acc.id, level: 'CAMPAIGN' },
        orderBy: { date: 'desc' },
        take: 15 * 6, // 15 dias × campanhas
      });
      const byDay = new Map<string, { spend: number; conversions: number }>();
      for (const r of rows) {
        const k = r.date.toISOString().slice(0, 10);
        const cur = byDay.get(k) ?? { spend: 0, conversions: 0 };
        cur.spend += Number(r.spend);
        cur.conversions += r.conversions;
        byDay.set(k, cur);
      }
      const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, v]) => v);
      if (days.length < 8) continue;
      const [last, ...hist] = days;
      for (const metric of ['spend', 'conversions'] as const) {
        const values = hist.map((h) => h[metric]);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
        const z = (last[metric] - mean) / sd;
        if (metric === 'spend' && z > 3) {
          const a = await this.prisma.anomaly.create({
            data: { orgId, accountId: acc.id, severity: 'CRITICAL', metric: 'SPEND_SPIKE', message: `Pico de gasto em ${acc.name}: R$ ${round(last.spend)} vs média de R$ ${round(mean)} (z=${round(z, 1)}).` },
          });
          created.push(a.id);
          this.realtime.emitToOrg(orgId, 'notification', { type: 'anomaly', severity: a.severity, title: 'Pico de gasto detectado', message: a.message, at: a.detectedAt });
        }
        if (metric === 'conversions' && z < -3) {
          const a = await this.prisma.anomaly.create({
            data: { orgId, accountId: acc.id, severity: 'WARNING', metric: 'CONVERSION_DROP', message: `Queda de conversões em ${acc.name}: ${last.conversions} vs média de ${round(mean, 0)}. Verifique o tracking.` },
          });
          created.push(a.id);
          this.realtime.emitToOrg(orgId, 'notification', { type: 'anomaly', severity: a.severity, title: 'Queda de conversões', message: a.message, at: a.detectedAt });
        }
      }
    }
    return { created: created.length };
  }

  /**
   * Ranking de criativos com métricas REAIS por anúncio (nível AD) e detecção
   * de fadiga por anúncio (CTR em queda na 2ª metade do período + frequência alta).
   */
  async creativeRanking(orgId: string) {
    const ads = await this.prisma.ad.findMany({
      where: { adSet: { campaign: { account: { orgId } } } },
      include: { creative: true, adSet: { include: { campaign: { include: { account: true } } } } },
    });
    const adIds = ads.map((a) => a.id);
    const metrics = await this.prisma.metricDaily.findMany({
      where: { level: 'AD', refId: { in: adIds } },
      orderBy: { date: 'asc' },
    });
    const byAd = new Map<string, typeof metrics>();
    for (const m of metrics) {
      if (!byAd.has(m.refId)) byAd.set(m.refId, []);
      byAd.get(m.refId)!.push(m);
    }

    const ctrOf = (slice: typeof metrics) => {
      const t = emptyTotals();
      slice.forEach((r) => addInto(t, r));
      return derive(t).ctr;
    };

    return ads.map((a) => {
      const series = byAd.get(a.id) ?? [];
      const t = emptyTotals();
      series.forEach((r) => addInto(t, r));
      const d = derive(t);
      // Fadiga: compara CTR da 1ª metade × 2ª metade + frequência recente
      const half = Math.floor(series.length / 2);
      const early = ctrOf(series.slice(0, half));
      const late = ctrOf(series.slice(half));
      const lastFreq = Number(series[series.length - 1]?.frequency ?? 0);
      const ctrDrop = early > 0 ? round(((early - late) / early) * 100, 1) : 0;
      return {
        id: a.id, name: a.name, status: a.status,
        campaign: a.adSet.campaign.name,
        platform: a.adSet.campaign.account.platform,
        creative: a.creative ? { headline: a.creative.headline, primaryText: a.creative.primaryText, imageUrl: a.creative.imageUrl } : null,
        ctr: d.ctr, cpa: d.cpa, roas: d.roas, spend: round(d.spend),
        fatigue: { fatigued: ctrDrop > 22 && lastFreq > 2.5, ctrDrop, freq: lastFreq },
      };
    }).sort((a, b) => b.roas - a.roas);
  }
}
