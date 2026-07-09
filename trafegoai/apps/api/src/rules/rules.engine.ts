import { Injectable, Logger } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { addInto, derive, emptyTotals, round } from '../common/metrics.util';
import { AuditService } from '../audit/audit.service';

/**
 * Motor das regras de automação "se → então".
 * Avalia a métrica na janela configurada (windowDays) por campanha e, se a
 * condição valer em TODOS os dias da janela, dispara a ação.
 * Executado pelo worker (BullMQ, job repetível a cada 15 min) e sob demanda.
 *
 * Nota de segurança: só executa ações dentro de regras que o PRÓPRIO usuário
 * criou e ativou — a IA nunca gasta/pausa nada sozinha fora disso.
 */
@Injectable()
export class RulesEngine {
  private readonly logger = new Logger(RulesEngine.name);

  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async runForAllOrgs() {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    for (const org of orgs) await this.runForOrg(org.id);
  }

  async runForOrg(orgId: string) {
    const rules = await this.prisma.automationRule.findMany({ where: { orgId, enabled: true } });
    const fired: string[] = [];
    for (const rule of rules) {
      const scope = rule.scope as { level?: string; platform?: string; accountId?: string };
      const campaigns = await this.prisma.campaign.findMany({
        where: {
          status: 'ACTIVE',
          account: {
            orgId,
            ...(scope.platform ? { platform: scope.platform as Platform } : {}),
            ...(scope.accountId ? { id: scope.accountId } : {}),
          },
        },
        include: { account: true },
      });

      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - rule.windowDays);

      for (const campaign of campaigns) {
        const rows = await this.prisma.metricDaily.findMany({
          where: { level: 'CAMPAIGN', refId: campaign.id, date: { gte: since } },
          orderBy: { date: 'asc' },
        });
        if (rows.length < rule.windowDays) continue;

        // A condição precisa valer em todos os dias da janela (evita reagir a ruído de 1 dia)
        const holdsEveryDay = rows.every((r) => {
          const d = derive({ spend: Number(r.spend), revenue: Number(r.revenue), impressions: r.impressions, clicks: r.clicks, conversions: r.conversions });
          const value = { CPA: d.cpa, ROAS: d.roas, SPEND: d.spend, CTR: d.ctr, CPC: d.cpc }[rule.metric] ?? 0;
          return rule.operator === 'GT' ? value > Number(rule.threshold) : value < Number(rule.threshold);
        });
        if (!holdsEveryDay) continue;

        // Evita disparo repetido no mesmo alvo em 24h
        const recent = await this.prisma.ruleExecution.findFirst({
          where: { ruleId: rule.id, targetId: campaign.id, firedAt: { gte: new Date(Date.now() - 86_400_000) } },
        });
        if (recent) continue;

        const t = emptyTotals();
        rows.forEach((r) => addInto(t, r));
        const agg = derive(t);
        const detail = `${rule.metric} ${rule.operator === 'GT' ? '>' : '<'} ${rule.threshold} por ${rule.windowDays} dias (valor agregado: ${agg[rule.metric.toLowerCase() as 'cpa']}).`;

        switch (rule.action) {
          case 'PAUSE':
            // PONTO DE INTEGRAÇÃO: pausa real via conector da plataforma
            await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } });
            break;
          case 'INCREASE_BUDGET':
          case 'DECREASE_BUDGET': {
            const factor = 1 + (Number(rule.actionValue ?? 10) / 100) * (rule.action === 'INCREASE_BUDGET' ? 1 : -1);
            const next = round(Math.max(Number(campaign.budgetDaily ?? 0) * factor, 1));
            await this.prisma.campaign.update({ where: { id: campaign.id }, data: { budgetDaily: next } });
            break;
          }
          case 'NOTIFY':
            await this.prisma.anomaly.create({
              data: { orgId, accountId: campaign.accountId, severity: 'INFO', metric: 'RULE_NOTIFY', message: `Regra "${rule.name}": ${campaign.name} — ${detail}` },
            });
            break;
        }

        await this.prisma.ruleExecution.create({
          data: { ruleId: rule.id, targetType: 'CAMPAIGN', targetId: campaign.id, targetName: campaign.name, detail: `${detail} Ação: ${rule.action}.` },
        });
        await this.audit.log({ orgId }, 'RULE_FIRED', 'CAMPAIGN', campaign.id, null, { rule: rule.name, action: rule.action });
        fired.push(`${rule.name} → ${campaign.name}`);
      }
      await this.prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
    }
    if (fired.length) this.logger.log(`Regras disparadas: ${fired.join('; ')}`);
    return { fired };
  }
}
