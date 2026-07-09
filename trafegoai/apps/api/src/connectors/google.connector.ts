import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { BaseMockConnector } from './base.connector';

/**
 * Conector Google Ads API (v16+).
 *
 * PONTOS DE INTEGRAÇÃO (substituir os métodos herdados do mock):
 * - OAuth: https://accounts.google.com/o/oauth2/v2/auth com scope
 *   https://www.googleapis.com/auth/adwords; troca de code em
 *   https://oauth2.googleapis.com/token.
 * - Campanhas/métricas: POST https://googleads.googleapis.com/v16/customers/{id}/googleAds:searchStream
 *   com GAQL, ex.:
 *     SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.conversions_value,
 *            metrics.impressions, metrics.clicks, metrics.conversions, segments.date
 *     FROM campaign WHERE segments.date BETWEEN '{from}' AND '{to}'
 *   Normalização: cost_micros/1e6 → spend; conversions_value → revenue.
 * - Escrita: campaignService.mutate (status ENABLED/PAUSED) e
 *   campaignBudgetService.mutate (amount_micros).
 * - Rate limits: usar developer token; respeitar limites por CID e retry com
 *   backoff exponencial em RESOURCE_EXHAUSTED.
 */
@Injectable()
export class GoogleAdsConnector extends BaseMockConnector {
  platform = Platform.GOOGLE;

  getAuthUrl(state: string): string {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    if (!clientId) return `/conexoes/mock-oauth?platform=google&state=${state}`; // modo demo
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${process.env.API_URL ?? 'http://localhost:4000'}/connections/google/callback`,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/adwords',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
}
