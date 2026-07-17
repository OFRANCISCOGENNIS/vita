import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../ai/llm.service';
import { DEMO_PRODUCTS, DEMO_VIDEOS, POSTING_WINDOWS, TrendingProduct, TrendingVideo } from './radar.data';

/**
 * Radar de Tendências — a "máquina de inteligência":
 *  - Produtos em alta (o que está vendendo) por país/categoria/plataforma
 *  - Vídeos em alta no mundo por rede social
 *  - Planejador de postagem: como/quando postar seus vídeos em cada rede
 *
 * PROVEDORES REAIS (pontos de integração):
 *  - YouTube Data API v3 (IMPLEMENTADO — real com YOUTUBE_API_KEY): videos?chart=mostPopular
 *  - TikTok Creative Center: top products/hashtags/vídeos por país
 *    https://ads.tiktok.com/business/creativecenter — API interna, requer conta TikTok Ads
 *  - Google Trends (interesse de busca por produto): sem API oficial; usar
 *    biblioteca não-oficial ou o endpoint de widgets com cache agressivo
 *  - Marketplaces (Shopee/Meli/Amazon best sellers): APIs de afiliados oficiais
 * Sem chaves, o radar roda com o dataset curado de demonstração (radar.data.ts).
 */
@Injectable()
export class RadarService {
  private readonly logger = new Logger(RadarService.name);
  private ytCache: { at: number; videos: TrendingVideo[] } | null = null;

  constructor(private llm: LlmService) {}

  products(filters: { country?: string; category?: string; platform?: string }): { source: string; items: TrendingProduct[] } {
    let items = [...DEMO_PRODUCTS];
    if (filters.country) items = items.filter((p) => p.country === filters.country || p.country === 'GLOBAL');
    if (filters.category) items = items.filter((p) => p.category === filters.category);
    if (filters.platform) items = items.filter((p) => p.platforms.includes(filters.platform!));
    items.sort((a, b) => b.demandScore - a.demandScore);
    return { source: 'curated', items };
  }

  async videos(filters: { platform?: string; country?: string; category?: string }): Promise<{ source: string; items: TrendingVideo[] }> {
    let items = [...DEMO_VIDEOS];
    let source = 'curated';

    // Integração REAL: YouTube mostPopular quando há chave (cache de 30 min)
    if (process.env.YOUTUBE_API_KEY && (!filters.platform || filters.platform === 'YOUTUBE' || filters.platform === 'SHORTS')) {
      const yt = await this.fetchYouTubeTrending(filters.country ?? 'BR');
      if (yt.length) {
        items = [...yt, ...items.filter((v) => v.platform !== 'YOUTUBE')];
        source = 'youtube-api+curated';
      }
    }

    if (filters.platform) items = items.filter((v) => v.platform === filters.platform);
    if (filters.country) items = items.filter((v) => v.country === filters.country || v.country === 'GLOBAL');
    if (filters.category) items = items.filter((v) => v.category === filters.category);
    items.sort((a, b) => b.growth24h - a.growth24h);
    return { source, items };
  }

  private async fetchYouTubeTrending(country: string): Promise<TrendingVideo[]> {
    if (this.ytCache && Date.now() - this.ytCache.at < 30 * 60_000) return this.ytCache.videos;
    try {
      const params = new URLSearchParams({
        part: 'snippet,statistics,contentDetails',
        chart: 'mostPopular',
        regionCode: country === 'GLOBAL' ? 'US' : country,
        maxResults: '12',
        key: process.env.YOUTUBE_API_KEY!,
      });
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
      if (!res.ok) {
        this.logger.warn(`YouTube API respondeu ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { items: Array<{ id: string; snippet: { title: string; categoryId: string }; statistics: { viewCount: string }; contentDetails: { duration: string } }> };
      const videos = data.items.map((it) => ({
        id: `yt-${it.id}`,
        title: it.snippet.title,
        platform: 'YOUTUBE' as const,
        country,
        category: 'Em alta agora',
        views: Number(it.statistics.viewCount),
        growth24h: 0,
        format: `YouTube · ${it.contentDetails.duration.replace('PT', '').toLowerCase()}`,
        hook: '—',
        whyItWorks: 'No topo do "Em alta" do YouTube agora (via YouTube Data API).',
        url: `https://youtube.com/watch?v=${it.id}`,
      }));
      this.ytCache = { at: Date.now(), videos };
      return videos;
    } catch (e) {
      this.logger.warn(`YouTube API falhou: ${(e as Error).message}`);
      return [];
    }
  }

  postingWindows() {
    return POSTING_WINDOWS;
  }

  /**
   * IA: analisa o vídeo/post do usuário e devolve um plano por rede
   * (gancho, título, hashtags, horário, formato). Com ANTHROPIC_API_KEY usa o
   * LLM; sem, devolve um plano heurístico baseado nas janelas + boas práticas.
   */
  async analyzePost(input: { title: string; description?: string; niche: string; goal: string }) {
    const prompt = `Você é um estrategista de conteúdo e tráfego pago. Analise este vídeo e monte um plano de postagem por rede (TikTok, Reels, Shorts, YouTube).

Vídeo: "${input.title}"
Descrição: ${input.description ?? '—'}
Nicho: ${input.niche}
Objetivo: ${input.goal}

Responda APENAS com JSON válido:
{
  "verdict": "1 frase honesta sobre o potencial",
  "hookSuggestions": ["3 ganchos para os 3 primeiros segundos"],
  "perPlatform": [
    { "platform": "TIKTOK|REELS|SHORTS|YOUTUBE", "title": "título adaptado", "hashtags": ["5-8"], "bestTime": "janela", "formatTip": "dica de formato/duração", "paidTip": "como usar em tráfego pago (ou null)" }
  ]
}`;
    const raw = await this.llm.complete(prompt);
    if (raw) {
      try {
        return { source: 'llm', plan: JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) };
      } catch {
        this.logger.warn('LLM devolveu JSON inválido no analyzePost — usando heurística');
      }
    }
    // Plano heurístico (modo demo)
    const tag = input.niche.toLowerCase().replace(/\s+/g, '');
    return {
      source: 'heuristic',
      plan: {
        verdict: `"${input.title}" tem potencial se o gancho aparecer nos 2 primeiros segundos — hoje o título descreve, mas não fisga.`,
        hookSuggestions: [
          `Comece com o resultado final na tela ("olha o que aconteceu…") e só depois o processo`,
          `Texto na tela com número específico ("${input.goal} em 7 dias?") no primeiro frame`,
          `Pergunta direta ao público de ${input.niche} que gera comentário discordando`,
        ],
        perPlatform: [
          { platform: 'TIKTOK', title: `${input.title} (ninguém te conta isso)`, hashtags: [`#${tag}`, '#fy', '#dicas', '#brasil', '#aprendanotiktok'], bestTime: 'ter–qui · 19h–22h', formatTip: '9:16, corte a cada 2-3s, legenda grande, máx. 35s', paidTip: 'Suba como Spark Ad usando o post orgânico que performar melhor em 48h' },
          { platform: 'REELS', title: input.title, hashtags: [`#${tag}`, '#reels', '#dicasrapidas', '#viral'], bestTime: 'seg–sex · 18h–21h', formatTip: 'Use áudio em alta do momento; primeiro frame legível sem som', paidTip: 'Impulsione o Reel com melhor taxa de salvamento, não o de mais likes' },
          { platform: 'SHORTS', title: `${input.title} #shorts`, hashtags: [`#${tag}`, '#shorts'], bestTime: 'todos os dias · 12h–15h ou 19h–23h', formatTip: 'Termine com gancho para o vídeo longo do canal', paidTip: null },
          { platform: 'YOUTUBE', title: `${input.title} — o guia completo`, hashtags: [`#${tag}`], bestTime: 'qui–dom · 11h ou 18h', formatTip: 'Versão longa 8-12min; entregue a promessa no 1º minuto e aprofunde', paidTip: 'Use como destino de tráfego de descoberta (custo por view baixo no nicho)' },
        ],
      },
    };
  }
}
