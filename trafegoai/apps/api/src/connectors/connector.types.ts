import { Platform } from '@prisma/client';

/**
 * Schema comum: toda métrica de qualquer plataforma é normalizada para este
 * formato antes de ser persistida em MetricDaily. Métricas derivadas
 * (ROAS, CPA, CPC, CPM, CTR, taxa de conversão) são calculadas na leitura.
 */
export interface NormalizedMetric {
  date: string; // YYYY-MM-DD
  level: 'ACCOUNT' | 'CAMPAIGN' | 'ADSET' | 'AD';
  externalRefId: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  frequency?: number;
}

export interface NormalizedCampaign {
  externalId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  objective?: string;
  budgetDaily?: number;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/**
 * Contrato de um conector de plataforma de anúncios.
 * Implementações reais devem respeitar os rate limits documentados de cada API
 * (ver comentários em cada conector) e usar cache para leituras repetidas.
 */
export interface AdsConnector {
  platform: Platform;
  /** URL para iniciar o fluxo OAuth de conexão da conta de anúncios. */
  getAuthUrl(state: string): string;
  /** Troca o `code` do callback OAuth por tokens. */
  exchangeCode(code: string): Promise<OAuthTokens>;
  /** Renova o access token expirado. */
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
  /** Lista campanhas da conta. */
  fetchCampaigns(accessToken: string, accountExternalId: string): Promise<NormalizedCampaign[]>;
  /** Busca métricas diárias no intervalo, já normalizadas. */
  fetchMetrics(accessToken: string, accountExternalId: string, from: string, to: string): Promise<NormalizedMetric[]>;
  /** Ações de escrita — sempre precedidas de confirmação do usuário no painel. */
  pauseCampaign(accessToken: string, campaignExternalId: string): Promise<void>;
  activateCampaign(accessToken: string, campaignExternalId: string): Promise<void>;
  updateBudget(accessToken: string, campaignExternalId: string, dailyBudget: number): Promise<void>;
  duplicateCampaign(accessToken: string, campaignExternalId: string): Promise<string>;
}
