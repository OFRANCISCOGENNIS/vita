import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { BaseMockConnector } from './base.connector';

/**
 * Conector Meta Marketing API (Graph API v19+) — Facebook e Instagram.
 *
 * PONTOS DE INTEGRAÇÃO:
 * - OAuth: https://www.facebook.com/v19.0/dialog/oauth com scopes
 *   ads_read, ads_management, business_management; troca de code em
 *   GET https://graph.facebook.com/v19.0/oauth/access_token. Trocar por
 *   long-lived token (60 dias) via grant_type=fb_exchange_token.
 * - Métricas: GET /{ad_account_id}/insights?level=campaign&time_increment=1
 *   &fields=spend,impressions,clicks,actions,action_values,frequency
 *   Normalização: action_values[type=purchase] → revenue;
 *   actions[type=purchase|lead] → conversions.
 * - Escrita: POST /{campaign_id} { status: 'PAUSED' | 'ACTIVE' };
 *   POST /{campaign_id} { daily_budget: <centavos> }; /copies para duplicar.
 * - Rate limits: header X-Business-Use-Case-Usage; pausar quando >80% e
 *   reagendar o job de sync.
 */
@Injectable()
export class MetaAdsConnector extends BaseMockConnector {
  platform = Platform.META;

  getAuthUrl(state: string): string {
    const appId = process.env.META_APP_ID;
    if (!appId) return `/conexoes/mock-oauth?platform=meta&state=${state}`; // modo demo
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: `${process.env.API_URL ?? 'http://localhost:4000'}/connections/meta/callback`,
      scope: 'ads_read,ads_management,business_management',
      response_type: 'code',
      state,
    });
    return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
  }
}
