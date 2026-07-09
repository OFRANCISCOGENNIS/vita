import { Platform } from '@prisma/client';
import { AdsConnector, NormalizedCampaign, NormalizedMetric, OAuthTokens } from './connector.types';

/**
 * Implementação base em MODO MOCK.
 *
 * Enquanto os apps de desenvolvedor não são aprovados nas plataformas
 * (ver README, seção "Credenciais de API"), os conectores herdam este
 * comportamento simulado: OAuth devolve tokens fake e as ações de escrita
 * apenas resolvem. As leituras de métricas em modo demo vêm do seed do banco,
 * portanto fetchMetrics/fetchCampaigns retornam vazio aqui.
 *
 * Cada conector real sobrescreve os métodos com chamadas HTTP à API oficial —
 * os PONTOS DE INTEGRAÇÃO estão comentados em cada subclasse.
 */
export abstract class BaseMockConnector implements AdsConnector {
  abstract platform: Platform;
  abstract getAuthUrl(state: string): string;

  async exchangeCode(_code: string): Promise<OAuthTokens> {
    return {
      accessToken: `mock-access-${this.platform.toLowerCase()}`,
      refreshToken: `mock-refresh-${this.platform.toLowerCase()}`,
      expiresAt: new Date(Date.now() + 55 * 60_000),
    };
  }

  async refreshTokens(_refreshToken: string): Promise<OAuthTokens> {
    return this.exchangeCode('refresh');
  }

  async fetchCampaigns(): Promise<NormalizedCampaign[]> {
    return []; // modo demo: campanhas vêm do seed
  }

  async fetchMetrics(): Promise<NormalizedMetric[]> {
    return []; // modo demo: métricas vêm do seed
  }

  async pauseCampaign(): Promise<void> {}
  async activateCampaign(): Promise<void> {}
  async updateBudget(): Promise<void> {}
  async duplicateCampaign(): Promise<string> {
    return `dup-${Date.now().toString(36)}`;
  }
}
