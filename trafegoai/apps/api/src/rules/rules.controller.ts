import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../common/prisma.service';
import { RulesEngine } from './rules.engine';

class RuleDto {
  @IsString() name: string;
  @IsIn(['CPA', 'ROAS', 'SPEND', 'CTR', 'CPC']) metric: string;
  @IsIn(['GT', 'LT']) operator: string;
  @IsNumber() threshold: number;
  @IsInt() @Min(1) @Max(30) windowDays: number;
  @IsIn(['PAUSE', 'INCREASE_BUDGET', 'DECREASE_BUDGET', 'NOTIFY']) action: string;
  @IsOptional() @IsNumber() actionValue?: number;
  @IsObject() scope: Record<string, unknown>;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

/** Regras "se → então" criadas pelo usuário; executadas em background pelo worker. */
@Controller('rules')
@UseGuards(JwtGuard)
export class RulesController {
  constructor(private prisma: PrismaService, private engine: RulesEngine) {}

  @Get()
  list(@Auth() auth: JwtPayload) {
    return this.prisma.automationRule.findMany({
      where: { orgId: auth.orgId },
      orderBy: { createdAt: 'desc' },
      include: { executions: { orderBy: { firedAt: 'desc' }, take: 5 } },
    });
  }

  @Post()
  create(@Auth() auth: JwtPayload, @Body() dto: RuleDto) {
    return this.prisma.automationRule.create({
      data: { ...dto, scope: dto.scope as object, orgId: auth.orgId },
    });
  }

  @Patch(':id')
  async update(@Auth() auth: JwtPayload, @Param('id') id: string, @Body() dto: Partial<RuleDto>) {
    await this.prisma.automationRule.findFirstOrThrow({ where: { id, orgId: auth.orgId } });
    return this.prisma.automationRule.update({ where: { id }, data: { ...dto, scope: dto.scope as object | undefined } });
  }

  @Delete(':id')
  async remove(@Auth() auth: JwtPayload, @Param('id') id: string) {
    await this.prisma.automationRule.findFirstOrThrow({ where: { id, orgId: auth.orgId } });
    await this.prisma.ruleExecution.deleteMany({ where: { ruleId: id } });
    await this.prisma.automationRule.delete({ where: { id } });
    return { deleted: true };
  }

  /** Executa todas as regras da organização imediatamente (além do agendamento). */
  @Post('run-now')
  runNow(@Auth() auth: JwtPayload) {
    return this.engine.runForOrg(auth.orgId);
  }

  @Get(':id/executions')
  async executions(@Auth() auth: JwtPayload, @Param('id') id: string) {
    await this.prisma.automationRule.findFirstOrThrow({ where: { id, orgId: auth.orgId } });
    return this.prisma.ruleExecution.findMany({ where: { ruleId: id }, orderBy: { firedAt: 'desc' }, take: 50 });
  }
}
