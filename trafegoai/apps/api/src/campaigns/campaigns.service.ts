import { Injectable, NotFoundException } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { decryptToken } from '../common/crypto.util';
import { addInto, derive, emptyTotals, resolvePeriod } from '../common/metrics.util';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { JwtPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CampaignsService {
  constructor(
    private prisma: PrismaService,
    private registry: ConnectorRegistry,
    private audit: AuditService,
  ) {}

  async list(orgId: string, q: Record<string, string>) {
    const p = resolvePeriod(q.preset, q.from, q.to);
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        account: {
          orgId,
          ...(q.platform ? { platform: q.platform as Platform } : {}),
          ...(q.accountId ? { id: q.accountId } : {}),
          ...(q.clientId ? { clientId: q.clientId } : {}),
        },
        ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
      },
      include: { account: { include: { client: true } } },
    });
    const metrics = await this.prisma.metricDaily.findMany({
      where: { level: 'CAMPAIGN', refId: { in: campaigns.map((c) => c.id) }, date: { gte: p.from, lte: p.to } },
    });
    const byRef = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const m of metrics) {
      if (!byRef.has(m.refId)) byRef.set(m.refId, emptyTotals());
      addInto(byRef.get(m.refId)!, m);
    }
    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      budgetDaily: c.budgetDaily ? Number(c.budgetDaily) : null,
      platform: c.account.platform,
      account: c.account.name,
      client: c.account.client?.name ?? null,
      ...derive(byRef.get(c.id) ?? emptyTotals()),
    }));
  }

  async children(orgId: string, campaignId: string, q: Record<string, string>) {
    const p = resolvePeriod(q.preset, q.from, q.to);
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, account: { orgId } },
      include: { adSets: { include: { ads: { include: { creative: true } } } } },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    const refIds = campaign.adSets.flatMap((s) => [s.id, ...s.ads.map((a) => a.id)]);
    const metrics = await this.prisma.metricDaily.findMany({
      where: { refId: { in: refIds }, date: { gte: p.from, lte: p.to } },
    });
    const byRef = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const m of metrics) {
      if (!byRef.has(m.refId)) byRef.set(m.refId, emptyTotals());
      addInto(byRef.get(m.refId)!, m);
    }
    const totals = (id: string) => derive(byRef.get(id) ?? emptyTotals());
    return campaign.adSets.map((s) => ({
      id: s.id, name: s.name, status: s.status, targeting: s.targeting,
      ...totals(s.id),
      ads: s.ads.map((a) => ({
        id: a.id, name: a.name, status: a.status,
        creative: a.creative ? { headline: a.creative.headline, imageUrl: a.creative.imageUrl } : null,
        ...totals(a.id),
      })),
    }));
  }

  async setStatus(auth: JwtPayload, id: string, status: 'ACTIVE' | 'PAUSED') {
    const campaign = await this.getOwned(auth.orgId, id);
    const connector = this.registry.get(campaign.account.platform);
    const token = decryptToken(campaign.account.accessTokenEnc ?? '');
    // PONTO DE INTEGRAÇÃO: chamada real de mutação de status na plataforma
    if (status === 'PAUSED') await connector.pauseCampaign(token, campaign.externalId);
    else await connector.activateCampaign(token, campaign.externalId);

    const updated = await this.prisma.campaign.update({ where: { id }, data: { status } });
    await this.audit.log(auth, status === 'PAUSED' ? 'CAMPAIGN_PAUSED' : 'CAMPAIGN_ACTIVATED', 'CAMPAIGN', id, { status: campaign.status }, { status });
    return updated;
  }

  async updateBudget(auth: JwtPayload, id: string, budgetDaily: number) {
    const campaign = await this.getOwned(auth.orgId, id);
    const connector = this.registry.get(campaign.account.platform);
    await connector.updateBudget(decryptToken(campaign.account.accessTokenEnc ?? ''), campaign.externalId, budgetDaily);
    const updated = await this.prisma.campaign.update({ where: { id }, data: { budgetDaily } });
    await this.audit.log(auth, 'BUDGET_CHANGED', 'CAMPAIGN', id, { budgetDaily: Number(campaign.budgetDaily) }, { budgetDaily });
    return updated;
  }

  async duplicate(auth: JwtPayload, id: string) {
    const campaign = await this.getOwned(auth.orgId, id);
    const connector = this.registry.get(campaign.account.platform);
    const newExternalId = await connector.duplicateCampaign(decryptToken(campaign.account.accessTokenEnc ?? ''), campaign.externalId);
    const copy = await this.prisma.campaign.create({
      data: {
        accountId: campaign.accountId,
        externalId: newExternalId,
        name: `${campaign.name} (cópia)`,
        status: 'PAUSED', // duplicatas nascem pausadas — nunca gastam sem revisão
        objective: campaign.objective,
        budgetDaily: campaign.budgetDaily,
      },
    });
    await this.audit.log(auth, 'CAMPAIGN_DUPLICATED', 'CAMPAIGN', id, null, { copyId: copy.id });
    return copy;
  }

  private async getOwned(orgId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, account: { orgId } },
      include: { account: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return campaign;
  }
}
