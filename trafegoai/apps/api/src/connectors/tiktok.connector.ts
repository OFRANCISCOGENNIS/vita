import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { BaseMockConnector } from './base.connector';

/**
 * Conector TikTok Marketing API (Business API v1.3).
 *
 * PONTOS DE INTEGRAÇÃO:
 * - OAuth: https://business-api.tiktok.com/portal/auth?app_id=...&state=...
 *   troca de auth_code em POST /open_api/v1.3/oauth2/access_token/.
 * - Métricas: GET /open_api/v1.3/report/integrated/get/ com
 *   report_type=BASIC, dimensions=["campaign_id","stat_time_day"],
 *   metrics=["spend","impressions","clicks","conversion","total_complete_payment_rate","frequency"]
 *   Normalização: complete_payment (valor) → revenue; conversion → conversions.
 * - Escrita: POST /open_api/v1.3/campaign/status/update/ (ENABLE/DISABLE);
 *   POST /campaign/update/ para budget.
 * - Rate limits: 10 QPS por app por padrão; enfileirar e respeitar o header
 *   de quota; cache de relatórios de dias fechados (imutáveis).
 */
@Injectable()
export class TikTokAdsConnector extends BaseMockConnector {
  platform = Platform.TIKTOK;

  getAuthUrl(state: string): string {
    const appId = process.env.TIKTOK_APP_ID;
    if (!appId) return `/conexoes/mock-oauth?platform=tiktok&state=${state}`; // modo demo
    const params = new URLSearchParams({ app_id: appId, state, redirect_uri: `${process.env.API_URL ?? 'http://localhost:4000'}/connections/tiktok/callback` });
    return `https://business-api.tiktok.com/portal/auth?${params}`;
  }
}
