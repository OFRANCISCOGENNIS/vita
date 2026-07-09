import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { DashboardService, DashFilters } from './dashboard.service';

function parseFilters(q: Record<string, string | undefined>): DashFilters {
  return {
    preset: q.preset,
    from: q.from,
    to: q.to,
    platform: q.platform as DashFilters['platform'],
    accountId: q.accountId,
    clientId: q.clientId,
    campaignId: q.campaignId,
  };
}

@Controller('dashboard')
@UseGuards(JwtGuard)
export class DashboardController {
  constructor(private dash: DashboardService) {}

  /** KPIs consolidados (Google+Meta+TikTok) com comparação vs. período anterior. */
  @Get('summary')
  summary(@Auth() auth: JwtPayload, @Query() q: Record<string, string>) {
    return this.dash.summary(auth.orgId, parseFilters(q));
  }

  /** Série diária gasto × receita (+ conversões) para o gráfico de evolução. */
  @Get('timeseries')
  timeseries(@Auth() auth: JwtPayload, @Query() q: Record<string, string>) {
    return this.dash.timeseries(auth.orgId, parseFilters(q));
  }

  /** Funil impressão → clique → conversão. */
  @Get('funnel')
  funnel(@Auth() auth: JwtPayload, @Query() q: Record<string, string>) {
    return this.dash.funnel(auth.orgId, parseFilters(q));
  }

  /** Distribuição de verba por plataforma. */
  @Get('platform-split')
  platformSplit(@Auth() auth: JwtPayload, @Query() q: Record<string, string>) {
    return this.dash.platformSplit(auth.orgId, parseFilters(q));
  }

  /** Mapa de calor dia-da-semana × hora com melhor desempenho. */
  @Get('heatmap')
  heatmap(@Auth() auth: JwtPayload, @Query() q: Record<string, string>) {
    return this.dash.heatmap(auth.orgId, parseFilters(q));
  }

  /** Cards de destaque: melhor/pior campanha, maior desperdício, oportunidade do dia. */
  @Get('highlights')
  highlights(@Auth() auth: JwtPayload, @Query() q: Record<string, string>) {
    return this.dash.highlights(auth.orgId, parseFilters(q));
  }
}
