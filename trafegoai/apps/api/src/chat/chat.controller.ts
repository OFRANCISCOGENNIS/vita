import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../common/prisma.service';
import { LlmService } from '../ai/llm.service';
import { CHAT_PROMPT } from '../ai/prompts';
import { InsightsService } from '../insights/insights.service';
import { CampaignsService } from '../campaigns/campaigns.service';

class AskDto {
  @IsString() @MinLength(2) question: string;
}

/** Assistente de chat: pergunta em português, resposta baseada nos dados reais. */
@Controller('chat')
@UseGuards(JwtGuard)
export class ChatController {
  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
    private insights: InsightsService,
    private campaigns: CampaignsService,
  ) {}

  @Get('history')
  history(@Auth() auth: JwtPayload) {
    return this.prisma.chatMessage.findMany({
      where: { orgId: auth.orgId, userId: auth.sub },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  @Post()
  async ask(@Auth() auth: JwtPayload, @Body() dto: AskDto) {
    await this.prisma.chatMessage.create({
      data: { orgId: auth.orgId, userId: auth.sub, role: 'user', content: dto.question },
    });
    const context = await this.insights.buildContext(auth.orgId);
    const fromLlm = await this.llm.complete(
      CHAT_PROMPT.replace('{DATA}', context).replace('{QUESTION}', dto.question),
    );
    const answer = fromLlm ?? (await this.heuristicAnswer(auth.orgId, dto.question));
    const saved = await this.prisma.chatMessage.create({
      data: { orgId: auth.orgId, userId: auth.sub, role: 'assistant', content: answer },
    });
    return saved;
  }

  /** Resposta heurística de demonstração quando não há chave de LLM. */
  private async heuristicAnswer(orgId: string, question: string): Promise<string> {
    const rows = await this.campaigns.list(orgId, { preset: '7d' });
    const q = question.toLowerCase();
    const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const best = [...rows].filter((r) => r.spend > 50).sort((a, b) => b.roas - a.roas)[0];
    const worst = [...rows].filter((r) => r.spend > 50).sort((a, b) => a.roas - b.roas)[0];
    const total = rows.reduce((acc, r) => ({ spend: acc.spend + r.spend, revenue: acc.revenue + r.revenue }), { spend: 0, revenue: 0 });

    if (q.includes('escalar') || q.includes('criativo')) {
      return `Nos últimos 7 dias, a melhor candidata a escala é **${best?.name}** (${best?.platform}), com ROAS de ${best?.roas.toFixed(1)} e CPA de ${brl(best?.cpa ?? 0)}. Recomendo aumentar a verba em +20% a cada 3 dias para não resetar o aprendizado do algoritmo.\n\n*(Resposta em modo demonstração — configure ANTHROPIC_API_KEY para análises completas com IA.)*`;
    }
    if (q.includes('caí') || q.includes('cair') || q.includes('queda') || q.includes('venda')) {
      return `Nos últimos 7 dias você investiu ${brl(total.spend)} e gerou ${brl(total.revenue)} em receita. O principal ofensor é **${worst?.name}** (ROAS ${worst?.roas.toFixed(1)}). Vale conferir também as anomalias abertas na aba Recomendações — detectei possível problema de tracking em uma das contas.\n\n*(Resposta em modo demonstração — configure ANTHROPIC_API_KEY para análises completas com IA.)*`;
    }
    return `Resumo dos últimos 7 dias: investimento de ${brl(total.spend)}, receita de ${brl(total.revenue)} (ROAS ${(total.revenue / Math.max(total.spend, 1)).toFixed(1)}). Melhor campanha: **${best?.name}** (ROAS ${best?.roas.toFixed(1)}). Pior: **${worst?.name}** (ROAS ${worst?.roas.toFixed(1)}). Pergunte, por exemplo: "qual criativo devo escalar?"\n\n*(Resposta em modo demonstração — configure ANTHROPIC_API_KEY para análises completas com IA.)*`;
  }
}
