import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
@UseGuards(JwtGuard)
export class CampaignsController {
  constructor(private svc: CampaignsService) {}

  /** Tabela unificada de campanhas (Google+Meta+TikTok) com métricas do período. */
  @Get()
  list(@Auth() auth: JwtPayload, @Query() q: Record<string, string>) {
    return this.svc.list(auth.orgId, q);
  }

  /** Conjuntos e anúncios de uma campanha (drill-down) com métricas. */
  @Get(':id/children')
  children(@Auth() auth: JwtPayload, @Param('id') id: string, @Query() q: Record<string, string>) {
    return this.svc.children(auth.orgId, id, q);
  }

  /**
   * Ações de escrita — o frontend SEMPRE mostra diálogo de confirmação antes.
   * Cada ação chama o conector da plataforma e registra AuditLog.
   */
  @Post(':id/pause')
  pause(@Auth() auth: JwtPayload, @Param('id') id: string) {
    return this.svc.setStatus(auth, id, 'PAUSED');
  }

  @Post(':id/activate')
  activate(@Auth() auth: JwtPayload, @Param('id') id: string) {
    return this.svc.setStatus(auth, id, 'ACTIVE');
  }

  @Patch(':id/budget')
  budget(@Auth() auth: JwtPayload, @Param('id') id: string, @Body('budgetDaily') budgetDaily: number) {
    if (!Number.isFinite(budgetDaily) || budgetDaily <= 0) {
      throw new BadRequestException('Orçamento diário deve ser um valor positivo');
    }
    return this.svc.updateBudget(auth, id, budgetDaily);
  }

  @Post(':id/duplicate')
  duplicate(@Auth() auth: JwtPayload, @Param('id') id: string) {
    return this.svc.duplicate(auth, id);
  }
}
