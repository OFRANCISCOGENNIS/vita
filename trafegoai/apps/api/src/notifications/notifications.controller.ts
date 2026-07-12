import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../common/prisma.service';

/**
 * Central de notificações: feed unificado de anomalias abertas + disparos
 * recentes de regras de automação. Alimenta o sino no topo do painel.
 * Os eventos em tempo real chegam via WebSocket (canal 'notification');
 * este endpoint é o histórico/fallback.
 */
@Controller('notifications')
@UseGuards(JwtGuard)
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Auth() auth: JwtPayload) {
    const [anomalies, executions] = await Promise.all([
      this.prisma.anomaly.findMany({ where: { orgId: auth.orgId, resolved: false }, orderBy: { detectedAt: 'desc' }, take: 20 }),
      this.prisma.ruleExecution.findMany({
        where: { rule: { orgId: auth.orgId }, firedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        orderBy: { firedAt: 'desc' }, take: 20, include: { rule: { select: { name: true } } },
      }),
    ]);
    const items = [
      ...anomalies.map((a) => ({
        id: `anom-${a.id}`, type: 'anomaly' as const, severity: a.severity,
        title: a.metric === 'SPEND_SPIKE' ? 'Pico de gasto' : a.metric === 'CONVERSION_DROP' ? 'Queda de conversões' : a.metric === 'NO_DELIVERY' ? 'Conta sem entrega' : 'Alerta',
        message: a.message, at: a.detectedAt,
      })),
      ...executions.map((e) => ({
        id: `rule-${e.id}`, type: 'rule' as const, severity: 'INFO',
        title: `Regra disparada: ${e.rule.name}`, message: `${e.targetName} — ${e.detail}`, at: e.firedAt,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 30);

    return { items, unread: anomalies.length };
  }

  /** Marca todas as anomalias como resolvidas (limpa o sino). */
  @Post('read-all')
  async readAll(@Auth() auth: JwtPayload) {
    await this.prisma.anomaly.updateMany({ where: { orgId: auth.orgId, resolved: false }, data: { resolved: true } });
    return { ok: true };
  }
}
