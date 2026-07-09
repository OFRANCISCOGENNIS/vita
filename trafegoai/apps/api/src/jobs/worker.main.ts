/**
 * Processo WORKER (separado da API) — consome as filas BullMQ:
 *  - metrics-sync: busca métricas nos conectores e grava normalizado no banco
 *  - automation-rules: roda o motor de regras "se → então" de todas as orgs
 *
 * Escala horizontal: docker compose up --scale worker=4
 */
import 'reflect-metadata';
import { Worker } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RulesEngine } from '../rules/rules.engine';
import { GoogleAdsConnector } from '../connectors/google.connector';
import { MetaAdsConnector } from '../connectors/meta.connector';
import { TikTokAdsConnector } from '../connectors/tiktok.connector';
import { decryptToken } from '../common/crypto.util';
import { RULES_QUEUE, SYNC_QUEUE, redisConnection } from './sync.service';

const prisma = new PrismaService();
const rulesEngine = new RulesEngine(prisma, new AuditService(prisma));
const connectors = {
  GOOGLE: new GoogleAdsConnector(),
  META: new MetaAdsConnector(),
  TIKTOK: new TikTokAdsConnector(),
};

async function syncAccount(accountId: string) {
  const account = await prisma.adAccount.findUnique({ where: { id: accountId } });
  if (!account) return;
  const connector = connectors[account.platform];
  const token = decryptToken(account.accessTokenEnc ?? '');
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  // Em modo demo os conectores retornam vazio (métricas já vêm do seed);
  // com credenciais reais, cada linha normalizada é upsertada aqui.
  const metrics = await connector.fetchMetrics(token, account.externalId, from, to);
  for (const m of metrics) {
    const entity = await resolveInternalId(account.id, m.level, m.externalRefId);
    if (!entity) continue;
    await prisma.metricDaily.upsert({
      where: { date_level_refId: { date: new Date(`${m.date}T00:00:00Z`), level: m.level, refId: entity } },
      create: {
        date: new Date(`${m.date}T00:00:00Z`), level: m.level, refId: entity,
        accountId: account.id, platform: account.platform,
        spend: m.spend, revenue: m.revenue, impressions: m.impressions,
        clicks: m.clicks, conversions: m.conversions, frequency: m.frequency,
      },
      update: { spend: m.spend, revenue: m.revenue, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions, frequency: m.frequency },
    });
  }
  await prisma.adAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date() } });
  console.log(`[worker] sync ${account.name} ok (${metrics.length} métricas)`);
}

async function resolveInternalId(accountId: string, level: string, externalRefId: string): Promise<string | null> {
  if (level === 'ACCOUNT') return accountId;
  if (level === 'CAMPAIGN') {
    const c = await prisma.campaign.findFirst({ where: { accountId, externalId: externalRefId } });
    return c?.id ?? null;
  }
  if (level === 'ADSET') {
    const s = await prisma.adSet.findFirst({ where: { externalId: externalRefId, campaign: { accountId } } });
    return s?.id ?? null;
  }
  const a = await prisma.ad.findFirst({ where: { externalId: externalRefId, adSet: { campaign: { accountId } } } });
  return a?.id ?? null;
}

new Worker(SYNC_QUEUE, async (job) => {
  if (job.name === 'sync-account') {
    await syncAccount(job.data.accountId);
  } else {
    const accounts = await prisma.adAccount.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const a of accounts) await syncAccount(a.id);
  }
}, { connection: redisConnection(), concurrency: 4 });

new Worker(RULES_QUEUE, async () => {
  await rulesEngine.runForAllOrgs();
}, { connection: redisConnection() });

console.log('[worker] TrafegoAI worker ativo — filas: metrics-sync, automation-rules');
