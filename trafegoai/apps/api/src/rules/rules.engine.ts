import { Injectable, Logger, Optional } from '@nestjs/common';
import { AutomationRule, Platform } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { addInto, derive, emptyTotals, round } from '../common/metrics.util';
import { AuditService } from '../audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { nextBudget as computeNextBudget } from './rules.guardrails';

/**
 * Motor das regras de automação "se → então".
 *
 * Avalia a métrica na janela configurada (windowDays) por campanha; a condição
 * precisa valer em TODOS os dias da janela para disparar (evita reagir a ruído
 * de um único dia). Executado pelo worker (BullMQ, a cada 15 min) e sob demanda.
 *
 * Guardrails de segurança:
 *  - só executa regras que o PRÓPRIO usuário criou e ATIVOU (a IA nunca gasta sozinha);
 *  - cooldown de 24h por alvo (não redispara na mesma campanha);
 *  - orçamento nunca passa de MAX_BUDGET nem cai abaixo de MIN_BUDGET;
 *  - variação de verba por disparo limitada a MAX_STEP_PCT;
 *  - no máximo MAX_ACTIONS_PER_RUN ações por execução (freio contra runaway).
 *
 * `preview()` faz um dry-run: retorna o que DISPARARIA, sem alterar nada.
 */
@Injectable()
export class RulesEngine {
  private readonly logger = new Logger(RulesEngine.name);

  private static readonly MAX_ACTIONS_PER_RUN = 50;

  // gateway opcional: presente na API (emite em tempo real), ausente no worker
  constructor(private prisma: PrismaService, private audit: AuditService, @Optional() private realtime?: RealtimeGateway) {}

  async runForAllOrgs() {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    for (const org of orgs) await this.runForOrg(org.id);
  }

  async runForOrg(orgId: string) {
    return this.execute(orgId, false);
  }

  /** Dry-run: mostra o que cada regra ativa DISPARARIA agora, sem executar. */
  async preview(orgId: string) {
    return this.execute(orgId, true);
  }

  private async execute(orgId: string, dryRun: boolean) {
    const rules = await this.prisma.automationRule.findMany({ where: { orgId, enabled: true } });
    const fired: Array<{ rule: string; target: string; action: string; detail: string; from?: number; to?: number }> = [];
    let actions = 0;

    for (const rule of rules) {
      const scope = rule.scope as { level?: string; platform?: string; accountId?: string; campaignIds?: string[] };
      const campaigns = await this.prisma.campaign.findMany({
        where: {
          status: 'ACTIVE',
          ...(scope.campaignIds?.length ? { id: { in: scope.campaignIds } } : {}),
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
        if (!dryRun && actions >= RulesEngine.MAX_ACTIONS_PER_RUN) {
          this.logger.warn(`Limite de ${RulesEngine.MAX_ACTIONS_PER_RUN} ações/execução atingido — regras restantes adiadas.`);
          break;
        }
        const rows = await this.prisma.metricDaily.findMany({
          where: { level: 'CAMPAIGN', refId: campaign.id, date: { gte: since } },
          orderBy: { date: 'asc' },
        });
        if (rows.length < rule.windowDays) continue;

        const holdsEveryDay = rows.every((r) => this.conditionHolds(rule, {
          spend: Number(r.spend), revenue: Number(r.revenue), impressions: r.impressions, clicks: r.clicks, conversions: r.conversions,
        }));
        if (!holdsEveryDay) continue;

        // Cooldown de 24h por alvo (mesmo em dry-run, sinalizamos que está em cooldown)
        const recent = await this.prisma.ruleExecution.findFirst({
          where: { ruleId: rule.id, targetId: campaign.id, firedAt: { gte: new Date(Date.now() - 86_400_000) } },
        });
        if (recent && !dryRun) continue;

        const t = emptyTotals();
        rows.forEach((r) => addInto(t, r));
        const agg = derive(t);
        const aggValue = (agg as any)[rule.metric.toLowerCase()] ?? 0;
        const detail = `${rule.metric} ${rule.operator === 'GT' ? '>' : '<'} ${rule.threshold} por ${rule.windowDays} dias (agregado: ${aggValue}).${recent ? ' [em cooldown]' : ''}`;

        let from: number | undefined;
        let to: number | undefined;
        if (rule.action.includes('BUDGET')) {
          from = Number(campaign.budgetDaily ?? 0);
          to = this.nextBudget(rule, from);
        }

        if (!dryRun && !recent) {
          await this.applyAction(rule, campaign, orgId, from, to);
          await this.prisma.ruleExecution.create({
            data: { ruleId: rule.id, targetType: 'CAMPAIGN', targetId: campaign.id, targetName: campaign.name, detail: `${detail} Ação: ${rule.action}.` },
          });
          await this.audit.log({ orgId }, 'RULE_FIRED', 'CAMPAIGN', campaign.id, from !== undefined ? { budgetDaily: from } : null, { rule: rule.name, action: rule.action, ...(to !== undefined ? { budgetDaily: to } : {}) });
          this.realtime?.emitToOrg(orgId, 'notification', { type: 'rule', severity: 'INFO', title: `Regra disparada: ${rule.name}`, message: `${campaign.name} — ${detail} Ação: ${rule.action}.`, at: new Date() });
          actions++;
        }
        fired.push({ rule: rule.name, target: campaign.name, action: rule.action, detail, from, to });
      }
      if (!dryRun) await this.prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
    }

    if (!dryRun && fired.length) this.logger.log(`Regras disparadas: ${fired.map((f) => `${f.rule} → ${f.target}`).join('; ')}`);
    return { dryRun, count: fired.length, fired };
  }

  private conditionHolds(rule: AutomationRule, raw: { spend: number; revenue: number; impressions: number; clicks: number; conversions: number }): boolean {
    const d = derive(raw);
    const value = ({ CPA: d.cpa, ROAS: d.roas, SPEND: d.spend, CTR: d.ctr, CPC: d.cpc } as Record<string, number>)[rule.metric] ?? 0;
    return rule.operator === 'GT' ? value > Number(rule.threshold) : value < Number(rule.threshold);
  }

  /** Próximo orçamento respeitando teto de variação, piso e teto absolutos. */
  private nextBudget(rule: AutomationRule, current: number): number {
    return computeNextBudget(rule.action as 'INCREASE_BUDGET' | 'DECREASE_BUDGET', current, Number(rule.actionValue ?? 10));
  }

  private async applyAction(rule: AutomationRule, campaign: { id: string; accountId: string; name: string }, orgId: string, from?: number, to?: number) {
    switch (rule.action) {
      case 'PAUSE':
        // PONTO DE INTEGRAÇÃO: pausa real via conector da plataforma
        await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } });
        break;
      case 'INCREASE_BUDGET':
      case 'DECREASE_BUDGET':
        if (to !== undefined) await this.prisma.campaign.update({ where: { id: campaign.id }, data: { budgetDaily: to } });
        break;
      case 'NOTIFY':
        await this.prisma.anomaly.create({
          data: { orgId, accountId: campaign.accountId, severity: 'INFO', metric: 'RULE_NOTIFY', message: `Regra "${rule.name}": ${campaign.name} atingiu a condição configurada.` },
        });
        break;
    }
  }
}
