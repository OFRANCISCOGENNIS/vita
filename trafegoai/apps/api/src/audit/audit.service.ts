import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { JwtPayload } from '../auth/auth.service';

/**
 * Log de auditoria: toda ação que gasta dinheiro ou altera campanhas
 * (pausar, verba, escalar, aplicar recomendação, regra disparada) passa por aqui.
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(auth: JwtPayload | { orgId: string }, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
    return this.prisma.auditLog.create({
      data: {
        orgId: auth.orgId,
        userId: 'sub' in auth ? auth.sub : null,
        action, targetType, targetId,
        before: before === null || before === undefined ? undefined : (before as object),
        after: after === null || after === undefined ? undefined : (after as object),
      },
    });
  }

  list(orgId: string) {
    return this.prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { name: true, email: true } } },
    });
  }
}
