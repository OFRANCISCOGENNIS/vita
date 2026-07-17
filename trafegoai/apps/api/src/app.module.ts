import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './common/prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtGuard } from './auth/jwt.guard';
import { ConnectionsController } from './connections/connections.controller';
import { ConnectorRegistry } from './connectors/connector.registry';
import { GoogleAdsConnector } from './connectors/google.connector';
import { MetaAdsConnector } from './connectors/meta.connector';
import { TikTokAdsConnector } from './connectors/tiktok.connector';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { CampaignsController } from './campaigns/campaigns.controller';
import { CampaignsService } from './campaigns/campaigns.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { LlmService } from './ai/llm.service';
import { InsightsController } from './insights/insights.controller';
import { InsightsService } from './insights/insights.service';
import { ChatController } from './chat/chat.controller';
import { RulesController } from './rules/rules.controller';
import { RulesEngine } from './rules/rules.engine';
import { GoalsController } from './goals/goals.controller';
import { CreativesController } from './creatives/creatives.controller';
import { ReportsController } from './reports/reports.controller';
import { ClientsController } from './clients/clients.controller';
import { BillingController } from './billing/billing.controller';
import { BillingService } from './billing/billing.service';
import { NotificationsController } from './notifications/notifications.controller';
import { RadarController } from './radar/radar.controller';
import { RadarService } from './radar/radar.service';
import { SyncService } from './jobs/sync.service';
import { RealtimeGateway } from './realtime/realtime.gateway';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [
    AuthController,
    ConnectionsController,
    DashboardController,
    CampaignsController,
    AuditController,
    InsightsController,
    ChatController,
    RulesController,
    GoalsController,
    CreativesController,
    ReportsController,
    ClientsController,
    BillingController,
    NotificationsController,
    RadarController,
  ],
  providers: [
    PrismaService,
    AuthService,
    JwtGuard,
    ConnectorRegistry,
    GoogleAdsConnector,
    MetaAdsConnector,
    TikTokAdsConnector,
    DashboardService,
    CampaignsService,
    AuditService,
    LlmService,
    InsightsService,
    RulesEngine,
    SyncService,
    RealtimeGateway,
    BillingService,
    RadarService,
  ],
})
export class AppModule {}
