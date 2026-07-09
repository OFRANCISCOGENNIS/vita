/**
 * Seed de demonstração do TrafegoAI.
 * Cria: usuário demo, organização (plano Agência), 3 clientes, 6 contas
 * (Google, Meta e TikTok), campanhas/conjuntos/anúncios, 90 dias de métricas
 * diárias, mapa de calor horário, recomendações e anomalias de IA de exemplo,
 * regras de automação, metas e relatórios white-label.
 *
 * Login demo: demo@trafegoai.com / demo1234
 */
import { PrismaClient, Platform, MetricLevel } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Gerador pseudo-aleatório determinístico (mulberry32) para seed reprodutível
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 90;

interface CampaignSpec {
  name: string;
  objective: string;
  budget: number;
  // perfil de desempenho usado para gerar métricas coerentes
  baseSpend: number;
  roas: number; // receita média / gasto
  cvr: number; // conversões por clique
  ctr: number; // cliques por impressão
  trend: number; // drift diário (fadiga/escala)
  status?: 'ACTIVE' | 'PAUSED';
}

const ACCOUNTS: Array<{
  platform: Platform;
  externalId: string;
  name: string;
  client: string;
  campaigns: CampaignSpec[];
}> = [
  {
    platform: 'GOOGLE', externalId: '842-113-9027', name: 'Google Ads — Loja Vitta', client: 'Loja Vitta',
    campaigns: [
      { name: '[Search] Marca — Vitta', objective: 'SALES', budget: 150, baseSpend: 120, roas: 6.2, cvr: 0.062, ctr: 0.071, trend: 0.001 },
      { name: '[PMax] Catálogo Completo', objective: 'SALES', budget: 400, baseSpend: 350, roas: 3.4, cvr: 0.031, ctr: 0.019, trend: 0.002 },
      { name: '[Search] Genéricas — Suplementos', objective: 'SALES', budget: 250, baseSpend: 220, roas: 1.1, cvr: 0.012, ctr: 0.028, trend: -0.003 },
    ],
  },
  {
    platform: 'GOOGLE', externalId: '311-902-5561', name: 'Google Ads — Clínica Sorriso', client: 'Clínica Sorriso',
    campaigns: [
      { name: '[Search] Implante Dentário — POA', objective: 'LEADS', budget: 200, baseSpend: 180, roas: 4.8, cvr: 0.055, ctr: 0.064, trend: 0.001 },
      { name: '[Display] Remarketing Avaliação', objective: 'LEADS', budget: 60, baseSpend: 45, roas: 2.1, cvr: 0.018, ctr: 0.004, trend: 0 },
    ],
  },
  {
    platform: 'META', externalId: 'act_5530919274', name: 'Meta Ads — Loja Vitta', client: 'Loja Vitta',
    campaigns: [
      { name: '[CBO] Escala — Criativos Vencedores', objective: 'CONVERSIONS', budget: 500, baseSpend: 470, roas: 4.1, cvr: 0.029, ctr: 0.021, trend: -0.004 }, // fadiga
      { name: '[ABO] Teste de Criativos — Semana 27', objective: 'CONVERSIONS', budget: 150, baseSpend: 130, roas: 2.2, cvr: 0.017, ctr: 0.016, trend: 0.005 },
      { name: '[Remarketing] Carrinho Abandonado', objective: 'CONVERSIONS', budget: 100, baseSpend: 90, roas: 7.8, cvr: 0.081, ctr: 0.035, trend: 0.001 },
    ],
  },
  {
    platform: 'META', externalId: 'act_8812203471', name: 'Meta Ads — Academia Forte', client: 'Academia Forte',
    campaigns: [
      { name: '[Leads] Matrícula Julho — Feed+Reels', objective: 'LEADS', budget: 120, baseSpend: 105, roas: 3.0, cvr: 0.042, ctr: 0.024, trend: 0.002 },
      { name: '[Alcance] Institucional Bairro', objective: 'AWARENESS', budget: 40, baseSpend: 35, roas: 0.4, cvr: 0.002, ctr: 0.008, trend: -0.001, status: 'PAUSED' },
    ],
  },
  {
    platform: 'TIKTOK', externalId: '7218837745', name: 'TikTok Ads — Loja Vitta', client: 'Loja Vitta',
    campaigns: [
      { name: '[Spark] UGC Creatina — Influencers', objective: 'CONVERSIONS', budget: 200, baseSpend: 175, roas: 3.7, cvr: 0.022, ctr: 0.014, trend: 0.004 },
      { name: '[VSA] Top View Lançamento', objective: 'TRAFFIC', budget: 90, baseSpend: 80, roas: 0.9, cvr: 0.006, ctr: 0.011, trend: -0.002 },
    ],
  },
  {
    platform: 'TIKTOK', externalId: '7301ises114', name: 'TikTok Ads — Academia Forte', client: 'Academia Forte',
    campaigns: [
      { name: '[Leads] Desafio 30 dias', objective: 'LEADS', budget: 80, baseSpend: 70, roas: 2.6, cvr: 0.033, ctr: 0.018, trend: 0.003 },
    ],
  },
];

async function main() {
  const ifEmpty = process.argv.includes('--if-empty');
  if (ifEmpty && (await prisma.user.count()) > 0) {
    console.log('Seed: banco já populado, pulando.');
    return;
  }

  console.log('Seed: criando dados de demonstração…');
  const rand = rng(42);

  const user = await prisma.user.create({
    data: { email: 'demo@trafegoai.com', name: 'Gestor Demo', passwordHash: await bcrypt.hash('demo1234', 10) },
  });
  const org = await prisma.organization.create({
    data: { name: 'Agência Demo Performance', plan: 'AGENCY', brandColor: '#6366f1' },
  });
  await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: 'ADMIN' } });

  const clientNames = ['Loja Vitta', 'Clínica Sorriso', 'Academia Forte'];
  const clients = new Map<string, string>();
  for (const name of clientNames) {
    const c = await prisma.client.create({ data: { orgId: org.id, name } });
    clients.set(name, c.id);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const acc of ACCOUNTS) {
    const account = await prisma.adAccount.create({
      data: {
        orgId: org.id,
        clientId: clients.get(acc.client),
        platform: acc.platform,
        externalId: acc.externalId,
        name: acc.name,
        status: acc.platform === 'TIKTOK' && acc.client === 'Academia Forte' ? 'EXPIRED' : 'ACTIVE',
        statusDetail: acc.platform === 'TIKTOK' && acc.client === 'Academia Forte' ? 'Token expirado — reautentique a conexão' : null,
        lastSyncAt: new Date(Date.now() - Math.floor(rand() * 3600_000)),
        // Em produção estes campos guardam tokens OAuth reais criptografados (AES-256-GCM)
        accessTokenEnc: 'mock:encrypted',
        refreshTokenEnc: 'mock:encrypted',
      },
    });

    const dailyRows: any[] = [];
    let campIdx = 0;
    for (const spec of acc.campaigns) {
      campIdx++;
      const campaign = await prisma.campaign.create({
        data: {
          accountId: account.id,
          externalId: `${acc.externalId}-c${campIdx}`,
          name: spec.name,
          status: spec.status ?? 'ACTIVE',
          objective: spec.objective,
          budgetDaily: spec.budget,
        },
      });

      // 2 conjuntos + 2 anúncios por conjunto para as tabelas hierárquicas
      for (let s = 1; s <= 2; s++) {
        const adSet = await prisma.adSet.create({
          data: {
            campaignId: campaign.id,
            externalId: `${campaign.externalId}-s${s}`,
            name: s === 1 ? 'Público Frio — Interesses' : 'Lookalike 1% Compradores',
            status: 'ACTIVE',
            targeting: { idade: '25-45', genero: 'todos', local: 'Brasil', interesses: s === 1 ? ['fitness', 'saúde'] : ['lookalike'] },
          },
        });
        for (let a = 1; a <= 2; a++) {
          const creative = await prisma.creative.create({
            data: {
              orgId: org.id,
              platform: acc.platform,
              headline: a === 1 ? `Oferta ${spec.name.slice(0, 24)}` : `Prova social ${s}.${a} — depoimento real`,
              primaryText: 'Criativo de demonstração gerado pelo seed.',
              cta: 'COMPRAR_AGORA',
            },
          });
          await prisma.ad.create({
            data: {
              adSetId: adSet.id,
              externalId: `${adSet.externalId}-a${a}`,
              name: `AD ${s}.${a} — ${a === 1 ? 'Imagem estática' : 'Vídeo UGC'}`,
              status: 'ACTIVE',
              creativeId: creative.id,
            },
          });
        }
      }

      // 90 dias de métricas diárias no nível de campanha
      for (let d = DAYS - 1; d >= 0; d--) {
        const date = new Date(today.getTime() - d * 86_400_000);
        const drift = 1 + spec.trend * (DAYS - d);
        const weekday = date.getUTCDay();
        const weekFactor = weekday === 0 || weekday === 6 ? 0.75 : 1;
        const noise = 0.8 + rand() * 0.4;
        const spend = spec.baseSpend * drift * weekFactor * noise;
        const ctrNow = spec.ctr * (spec.trend < 0 ? 1 + spec.trend * (DAYS - d) * 1.5 : 1) * (0.9 + rand() * 0.2);
        const cpc = 0.6 + rand() * 1.8;
        const clicks = Math.max(1, Math.round(spend / cpc));
        const impressions = Math.round(clicks / Math.max(ctrNow, 0.001));
        const conversions = Math.round(clicks * spec.cvr * (0.85 + rand() * 0.3));
        const revenue = spend * spec.roas * (0.85 + rand() * 0.3) * drift;
        dailyRows.push({
          date, level: MetricLevel.CAMPAIGN, refId: campaign.id, accountId: account.id,
          platform: acc.platform,
          spend: Math.round(spend * 100) / 100,
          revenue: Math.round(revenue * 100) / 100,
          impressions, clicks, conversions,
          frequency: Math.round((1.4 + (spec.trend < 0 ? (DAYS - d) * 0.025 : 0) + rand() * 0.4) * 100) / 100,
        });
      }
    }
    await prisma.metricDaily.createMany({ data: dailyRows });

    // Mapa de calor horário (dia-da-semana × hora)
    const hourly: any[] = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let h = 0; h < 24; h++) {
        const peak = Math.exp(-Math.pow(h - 20, 2) / 18) + 0.6 * Math.exp(-Math.pow(h - 12, 2) / 10);
        const base = (dow >= 1 && dow <= 5 ? 1 : 0.7) * (0.15 + peak);
        hourly.push({
          accountId: account.id, dayOfWeek: dow, hour: h,
          spend: Math.round(base * 40 * (0.8 + rand() * 0.4) * 100) / 100,
          conversions: Math.round(base * 6 * (0.7 + rand() * 0.6)),
          revenue: Math.round(base * 160 * (0.8 + rand() * 0.4) * 100) / 100,
        });
      }
    }
    await prisma.hourlyPerformance.createMany({ data: hourly });
  }

  // ---------- Recomendações de IA de exemplo ----------
  const accounts = await prisma.adAccount.findMany({ where: { orgId: org.id } });
  const byName = (frag: string) => accounts.find((a) => a.name.includes(frag))!;
  const campaigns = await prisma.campaign.findMany();
  const byCamp = (frag: string) => campaigns.find((c) => c.name.includes(frag))!;

  await prisma.recommendation.createMany({
    data: [
      {
        orgId: org.id, accountId: byName('Google Ads — Loja Vitta').id, priority: 1,
        type: 'REALLOCATE_BUDGET',
        title: 'Realocar R$ 150/dia de "Genéricas — Suplementos" para "Marca — Vitta"',
        why: 'A campanha de genéricas tem ROAS de 1,1 (abaixo do break-even de 1,5) há 21 dias, enquanto a campanha de marca mantém ROAS 6,2 e perde impressões por orçamento limitado (parcela de impressão perdida ~34%).',
        impactEstimate: '+R$ 18.400/mês em receita estimada',
        payload: { action: 'REALLOCATE_BUDGET', fromCampaignId: byCamp('Genéricas').id, toCampaignId: byCamp('Marca — Vitta').id, amount: 150 },
      },
      {
        orgId: org.id, accountId: byName('Meta Ads — Loja Vitta').id, priority: 2,
        type: 'SWAP_CREATIVE',
        title: 'Trocar criativos da campanha "[CBO] Escala" — fadiga detectada',
        why: 'CTR caiu 38% nos últimos 14 dias (2,1% → 1,3%) e a frequência subiu de 1,6 para 3,4. Padrão clássico de fadiga de criativo: o público já viu os anúncios várias vezes.',
        impactEstimate: 'Recuperar ~R$ 6.100/mês de eficiência de mídia',
        payload: { action: 'SWAP_CREATIVE', campaignId: byCamp('[CBO] Escala').id },
      },
      {
        orgId: org.id, accountId: byName('Meta Ads — Loja Vitta').id, priority: 3,
        type: 'SCALE_CAMPAIGN',
        title: 'Escalar "[Remarketing] Carrinho Abandonado" em +20% de verba',
        why: 'ROAS de 7,8 estável há 30 dias com CPA 52% abaixo da meta. Escala gradual (+20% a cada 3 dias) preserva a fase de aprendizado do algoritmo.',
        impactEstimate: '+R$ 4.700/mês em receita com risco baixo',
        payload: { action: 'INCREASE_BUDGET', campaignId: byCamp('Carrinho Abandonado').id, percent: 20 },
      },
      {
        orgId: org.id, accountId: byName('TikTok Ads — Loja Vitta').id, priority: 4,
        type: 'PAUSE_ADSET',
        title: 'Pausar "[VSA] Top View Lançamento" — CPA acima da meta',
        why: 'CPA atual de R$ 96 contra meta de R$ 45, sem melhora após 14 dias. Tráfego frio de topo sem funil de remarketing configurado nesta conta.',
        impactEstimate: 'Economia de ~R$ 2.400/mês em verba desperdiçada',
        payload: { action: 'PAUSE', campaignId: byCamp('Top View').id },
      },
      {
        orgId: org.id, accountId: byName('Google Ads — Clínica Sorriso').id, priority: 5,
        type: 'ADJUST_SCHEDULE',
        title: 'Concentrar lances entre 19h e 22h nos dias úteis',
        why: 'O mapa de calor mostra que 41% das conversões acontecem entre 19h–22h com CPA 35% menor. Ajuste de programação de anúncios captura esse padrão.',
        impactEstimate: '-18% de CPA estimado na conta',
        payload: { action: 'ADJUST_SCHEDULE', accountId: byName('Google Ads — Clínica Sorriso').id, window: { days: [1, 2, 3, 4, 5], hours: [19, 22] } },
      },
    ],
  });

  await prisma.anomaly.createMany({
    data: [
      { orgId: org.id, accountId: byName('Meta Ads — Loja Vitta').id, severity: 'CRITICAL', metric: 'SPEND_SPIKE', message: 'Gasto da campanha "[CBO] Escala" subiu 62% nas últimas 24h sem aumento proporcional de conversões.' },
      { orgId: org.id, accountId: byName('TikTok Ads — Academia Forte').id, severity: 'CRITICAL', metric: 'NO_DELIVERY', message: 'Conta sem entrega há 2 dias: token de acesso expirado. Reautentique a conexão.' },
      { orgId: org.id, accountId: byName('Google Ads — Loja Vitta').id, severity: 'WARNING', metric: 'CONVERSION_DROP', message: 'Conversões da conta caíram 28% vs. média dos últimos 7 dias. Verifique o tracking do site (última conversão registrada há 9h).' },
    ],
  });

  // ---------- Regras de automação ----------
  const rule1 = await prisma.automationRule.create({
    data: {
      orgId: org.id, name: 'Pausar conjunto com CPA > R$ 50 por 3 dias',
      metric: 'CPA', operator: 'GT', threshold: 50, windowDays: 3,
      action: 'PAUSE', scope: { level: 'ADSET' },
      lastRunAt: new Date(Date.now() - 3600_000),
    },
  });
  await prisma.automationRule.create({
    data: {
      orgId: org.id, name: 'Escalar +20% campanhas com ROAS > 3 por 2 dias',
      metric: 'ROAS', operator: 'GT', threshold: 3, windowDays: 2,
      action: 'INCREASE_BUDGET', actionValue: 20, scope: { level: 'CAMPAIGN' },
      lastRunAt: new Date(Date.now() - 3600_000),
    },
  });
  await prisma.ruleExecution.create({
    data: {
      ruleId: rule1.id, targetType: 'ADSET', targetId: 'demo', targetName: 'Público Frio — Interesses ([VSA] Top View)',
      detail: 'CPA de R$ 96,40 > R$ 50,00 por 3 dias consecutivos → conjunto pausado automaticamente.',
    },
  });

  // ---------- Metas ----------
  const month = today.toISOString().slice(0, 7);
  for (const [name, id] of clients) {
    await prisma.goal.create({
      data: {
        orgId: org.id, clientId: id, month,
        targetRoas: name === 'Loja Vitta' ? 4 : 3,
        targetCpa: name === 'Clínica Sorriso' ? 60 : 45,
        monthlyBudget: name === 'Loja Vitta' ? 45000 : 12000,
      },
    });
  }

  // ---------- Relatórios white-label ----------
  for (const [name, id] of clients) {
    await prisma.report.create({
      data: {
        orgId: org.id, clientId: id, name: `Relatório Mensal — ${name}`,
        schedule: 'MONTHLY', recipients: [`contato@${name.toLowerCase().replace(/\s/g, '')}.com.br`],
      },
    });
  }

  console.log('Seed concluído. Login: demo@trafegoai.com / demo1234');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
