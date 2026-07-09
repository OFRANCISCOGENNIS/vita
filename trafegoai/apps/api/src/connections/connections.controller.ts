import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { encryptToken } from '../common/crypto.util';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { SyncService } from '../jobs/sync.service';

@Controller('connections')
@UseGuards(JwtGuard)
export class ConnectionsController {
  constructor(
    private prisma: PrismaService,
    private registry: ConnectorRegistry,
    private sync: SyncService,
  ) {}

  /** Status de todas as conexões da organização (ativa, expirada, erro). */
  @Get()
  async list(@Auth() auth: JwtPayload) {
    const accounts = await this.prisma.adAccount.findMany({
      where: { orgId: auth.orgId },
      include: { client: true },
      orderBy: [{ platform: 'asc' }, { name: 'asc' }],
    });
    return accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      externalId: a.externalId,
      name: a.name,
      client: a.client?.name ?? null,
      status: a.status,
      statusDetail: a.statusDetail,
      lastSyncAt: a.lastSyncAt,
      currency: a.currency,
    }));
  }

  /** Inicia o fluxo OAuth de conexão de uma nova conta de anúncios. */
  @Post(':platform/connect')
  connect(@Auth() auth: JwtPayload, @Param('platform') platform: string) {
    const p = platform.toUpperCase() as Platform;
    const state = Buffer.from(JSON.stringify({ orgId: auth.orgId, p })).toString('base64url');
    return { authUrl: this.registry.get(p).getAuthUrl(state) };
  }

  /**
   * Callback OAuth. Em produção cada plataforma redireciona para cá com ?code.
   * Tokens são criptografados (AES-256-GCM) antes de tocar o banco — LGPD.
   */
  @Get(':platform/callback')
  async callback(@Param('platform') platform: string, @Query('code') code: string, @Query('state') state: string) {
    const p = platform.toUpperCase() as Platform;
    const { orgId } = JSON.parse(Buffer.from(state, 'base64url').toString());
    const tokens = await this.registry.get(p).exchangeCode(code);
    // PONTO DE INTEGRAÇÃO: listar contas acessíveis do usuário na plataforma
    // (Google: listAccessibleCustomers; Meta: /me/adaccounts; TikTok: /advertiser/get)
    // e deixar o usuário escolher quais conectar. Em modo demo criamos uma conta exemplo.
    const account = await this.prisma.adAccount.create({
      data: {
        orgId, platform: p,
        externalId: `new-${Date.now().toString(36)}`,
        name: `Nova conta ${p}`,
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        tokenExpiresAt: tokens.expiresAt,
      },
    });
    return { connected: true, accountId: account.id };
  }

  /** Reautenticação de conexão expirada. */
  @Post(':id/reauth')
  async reauth(@Auth() auth: JwtPayload, @Param('id') id: string) {
    const account = await this.prisma.adAccount.findFirstOrThrow({ where: { id, orgId: auth.orgId } });
    const tokens = await this.registry.get(account.platform).refreshTokens('mock');
    await this.prisma.adAccount.update({
      where: { id },
      data: {
        status: 'ACTIVE', statusDetail: null,
        accessTokenEnc: encryptToken(tokens.accessToken),
        tokenExpiresAt: tokens.expiresAt,
      },
    });
    return { ok: true };
  }

  /** Botão "sincronizar agora" — enfileira o job de sync imediato. */
  @Post(':id/sync')
  async syncNow(@Auth() auth: JwtPayload, @Param('id') id: string) {
    await this.prisma.adAccount.findFirstOrThrow({ where: { id, orgId: auth.orgId } });
    await this.sync.enqueueSync(id);
    return { queued: true };
  }
}
