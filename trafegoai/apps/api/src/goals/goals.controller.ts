import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../common/prisma.service';
import { addInto, derive, emptyTotals, round } from '../common/metrics.util';

class GoalDto {
  @IsOptional() @IsString() clientId?: string;
  @Matches(/^\d{4}-\d{2}$/) month: string;
  @IsOptional() @IsNumber() targetRoas?: number;
  @IsOptional() @IsNumber() targetCpa?: number;
  @IsOptional() @IsNumber() monthlyBudget?: number;
}

/** Metas por cliente + previsão de fim de mês com base no ritmo atual. */
@Controller('goals')
@UseGuards(JwtGuard)
export class GoalsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Auth() auth: JwtPayload, @Query('month') monthQ?: string) {
    const month = monthQ ?? new Date().toISOString().slice(0, 7);
    const goals = await this.prisma.goal.findMany({
      where: { orgId: auth.orgId, month },
      include: { client: true },
    });

    const monthStart = new Date(`${month}-01T00:00:00Z`);
    const nextMonth = new Date(monthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const daysInMonth = Math.round((nextMonth.getTime() - monthStart.getTime()) / 86_400_000);
    const now = new Date();
    const isCurrentMonth = now.toISOString().slice(0, 7) === month;
    const daysElapsed = isCurrentMonth
      ? Math.max(now.getUTCDate() - 1, 1)
      : daysInMonth;

    const results = [] as any[];
    for (const goal of goals) {
      const rows = await this.prisma.metricDaily.findMany({
        where: {
          level: 'CAMPAIGN',
          date: { gte: monthStart, lt: nextMonth },
          account: { orgId: auth.orgId, ...(goal.clientId ? { clientId: goal.clientId } : {}) },
        },
      });
      const t = emptyTotals();
      rows.forEach((r) => addInto(t, r));
      const d = derive(t);
      const pace = daysInMonth / daysElapsed; // projeção linear: "se manter o ritmo"
      results.push({
        id: goal.id,
        client: goal.client?.name ?? 'Organização',
        clientId: goal.clientId,
        month,
        targets: {
          roas: goal.targetRoas ? Number(goal.targetRoas) : null,
          cpa: goal.targetCpa ? Number(goal.targetCpa) : null,
          budget: goal.monthlyBudget ? Number(goal.monthlyBudget) : null,
        },
        current: { spend: d.spend, revenue: d.revenue, roas: d.roas, cpa: d.cpa, conversions: d.conversions },
        progress: {
          budgetUsedPct: goal.monthlyBudget ? round((d.spend / Number(goal.monthlyBudget)) * 100, 1) : null,
          roasVsTargetPct: goal.targetRoas ? round((d.roas / Number(goal.targetRoas)) * 100, 1) : null,
        },
        forecast: {
          spend: round(d.spend * pace),
          revenue: round(d.revenue * pace),
          conversions: Math.round(d.conversions * pace),
          roas: d.roas, // ROAS projetado = ROAS corrente (razão não muda com projeção linear)
          willExceedBudget: goal.monthlyBudget ? d.spend * pace > Number(goal.monthlyBudget) : null,
          willHitRoas: goal.targetRoas ? d.roas >= Number(goal.targetRoas) : null,
        },
      });
    }
    return results;
  }

  @Post()
  upsert(@Auth() auth: JwtPayload, @Body() dto: GoalDto) {
    return this.prisma.goal.upsert({
      where: { orgId_clientId_month: { orgId: auth.orgId, clientId: dto.clientId ?? null as any, month: dto.month } },
      create: { ...dto, orgId: auth.orgId },
      update: { targetRoas: dto.targetRoas, targetCpa: dto.targetCpa, monthlyBudget: dto.monthlyBudget },
    });
  }
}
