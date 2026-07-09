import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Platform } from '@prisma/client';
import { Auth, JwtGuard } from '../auth/jwt.guard';
import { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../common/prisma.service';
import { LlmService } from '../ai/llm.service';
import { CREATIVE_PROMPT, PLATFORM_HINTS } from '../ai/prompts';

class GenerateDto {
  @IsIn(['GOOGLE', 'META', 'TIKTOK']) platform: Platform;
  @IsString() product: string;
  @IsString() audience: string;
  @IsOptional() @IsString() tone?: string;
}

/** Biblioteca de criativos + gerador com IA (headlines, textos, CTAs, ângulos). */
@Controller('creatives')
@UseGuards(JwtGuard)
export class CreativesController {
  constructor(private prisma: PrismaService, private llm: LlmService) {}

  @Get()
  list(@Auth() auth: JwtPayload) {
    return this.prisma.creative.findMany({
      where: { orgId: auth.orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { ads: { select: { id: true, name: true } } },
    });
  }

  @Post('generate')
  async generate(@Auth() auth: JwtPayload, @Body() dto: GenerateDto) {
    const prompt = CREATIVE_PROMPT
      .replace(/\{PLATFORM\}/g, dto.platform)
      .replace('{PRODUCT}', dto.product)
      .replace('{AUDIENCE}', dto.audience)
      .replace('{TONE}', dto.tone ?? 'confiante e direto')
      .replace('{PLATFORM_HINT}', PLATFORM_HINTS[dto.platform]);

    let parsed: { angles: string[]; creatives: Array<{ headline: string; primaryText: string; description: string; cta: string }> } | null = null;
    const raw = await this.llm.complete(prompt);
    if (raw) {
      try {
        parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      } catch {
        parsed = null;
      }
    }
    if (!parsed) parsed = this.mockCreatives(dto); // modo demo sem ANTHROPIC_API_KEY

    const saved = [] as any[];
    for (let i = 0; i < parsed.creatives.length; i++) {
      const c = parsed.creatives[i];
      saved.push(await this.prisma.creative.create({
        data: {
          orgId: auth.orgId, platform: dto.platform, aiGenerated: true,
          headline: c.headline, primaryText: c.primaryText, description: c.description,
          cta: c.cta, angle: parsed.angles[i] ?? null,
        },
      }));
    }
    return { angles: parsed.angles, creatives: saved };
  }

  private mockCreatives(dto: GenerateDto) {
    return {
      angles: ['Dor: o problema que o público quer resolver', 'Desejo: o resultado que ele quer alcançar', 'Prova social: quem já conseguiu'],
      creatives: [
        { headline: `Cansado de resultados fracos?`, primaryText: `Se você já investiu em ${dto.product} e não viu retorno, o problema pode não ser o produto — é a estratégia. ${dto.audience} que aplicaram a abordagem certa mudaram de patamar. Descubra como no link.`, description: `A solução que ${dto.audience} procuram.`, cta: 'SAIBA_MAIS' },
        { headline: `Imagine seu resultado em 30 dias`, primaryText: `${dto.product} feito do jeito certo transforma a rotina de ${dto.audience}. Sem promessas mágicas: método, consistência e acompanhamento. Comece hoje e sinta a diferença no primeiro mês.`, description: `Comece hoje. Resultado no 1º mês.`, cta: 'COMPRAR_AGORA' },
        { headline: `+2.000 clientes satisfeitos`, primaryText: `"Eu duvidava, mas em 3 semanas já vi diferença." Depoimentos como esse chegam todos os dias de ${dto.audience} que escolheram ${dto.product}. Junte-se a quem já resolveu o problema.`, description: `Veja os depoimentos reais.`, cta: 'CADASTRE_SE' },
      ],
    };
  }
}
