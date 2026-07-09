import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../common/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';

class ReportDto {
  @IsString() name: string;
  @IsOptional() @IsString() clientId?: string;
  @IsIn(['NONE', 'WEEKLY', 'MONTHLY']) schedule: string;
  @IsOptional() @IsArray() recipients?: string[];
}

/** Relatórios white-label (modo agência) + dashboard compartilhável por link. */
@Controller('reports')
export class ReportsController {
  constructor(private prisma: PrismaService, private dash: DashboardService) {}

  @Get()
  @UseGuards(JwtGuard)
  list(@Auth() auth: JwtPayload) {
    return this.prisma.report.findMany({
      where: { orgId: auth.orgId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  @UseGuards(JwtGuard)
  create(@Auth() auth: JwtPayload, @Body() dto: ReportDto) {
    return this.prisma.report.create({ data: { ...dto, recipients: dto.recipients ?? [], orgId: auth.orgId } });
  }

  @Delete(':id')
  @UseGuards(JwtGuard)
  async remove(@Auth() auth: JwtPayload, @Param('id') id: string) {
    await this.prisma.report.findFirstOrThrow({ where: { id, orgId: auth.orgId } });
    await this.prisma.report.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Envio por e-mail (agendado pelo worker conforme schedule).
   * PONTO DE INTEGRAÇÃO: renderizar PDF (ex.: puppeteer sobre a página
   * /relatorios/compartilhado) e enviar via provedor SMTP/Resend/SES.
   */
  @Post(':id/send')
  @UseGuards(JwtGuard)
  async send(@Auth() auth: JwtPayload, @Param('id') id: string) {
    const report = await this.prisma.report.findFirstOrThrow({ where: { id, orgId: auth.orgId } });
    await this.prisma.report.update({ where: { id }, data: { lastSentAt: new Date() } });
    return { sent: true, recipients: report.recipients };
  }

  /**
   * Dashboard somente-leitura para o cliente, SEM autenticação — acesso pelo
   * shareToken (não adivinhável). Nenhum dado sensível/token trafega aqui.
   */
  @Get('shared/:token')
  async shared(@Param('token') token: string) {
    const report = await this.prisma.report.findUnique({
      where: { shareToken: token },
      include: { client: true, org: true },
    });
    if (!report) return { error: 'Relatório não encontrado' };
    const filters = { preset: '30d', clientId: report.clientId ?? undefined } as any;
    const [summary, timeseries, platformSplit] = await Promise.all([
      this.dash.summary(report.orgId, filters),
      this.dash.timeseries(report.orgId, filters),
      this.dash.platformSplit(report.orgId, filters),
    ]);
    return {
      name: report.name,
      client: report.client?.name,
      brand: report.brand ?? { logoUrl: report.org.brandLogoUrl, color: report.org.brandColor, agency: report.org.name },
      summary, timeseries, platformSplit,
    };
  }
}
