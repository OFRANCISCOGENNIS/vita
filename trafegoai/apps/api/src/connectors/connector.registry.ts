import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { AdsConnector } from './connector.types';
import { GoogleAdsConnector } from './google.connector';
import { MetaAdsConnector } from './meta.connector';
import { TikTokAdsConnector } from './tiktok.connector';

/** Resolve o conector correto por plataforma (camada de normalização única). */
@Injectable()
export class ConnectorRegistry {
  constructor(
    private google: GoogleAdsConnector,
    private meta: MetaAdsConnector,
    private tiktok: TikTokAdsConnector,
  ) {}

  get(platform: Platform): AdsConnector {
    switch (platform) {
      case Platform.GOOGLE: return this.google;
      case Platform.META: return this.meta;
      case Platform.TIKTOK: return this.tiktok;
    }
  }
}
