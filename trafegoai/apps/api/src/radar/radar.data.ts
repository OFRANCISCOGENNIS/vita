/**
 * Dados de demonstração do Radar de Tendências.
 * Em produção, estes dados vêm dos provedores reais (ver radar.providers.ts):
 *  - Vídeos: YouTube Data API (REAL com YOUTUBE_API_KEY), TikTok Creative Center
 *  - Produtos: TikTok Creative Center (top products), Google Trends, marketplaces
 * O formato abaixo é o schema normalizado que os provedores devem produzir.
 */

export interface TrendingProduct {
  id: string;
  name: string;
  category: string;
  platforms: string[]; // onde está bombando: TIKTOK_SHOP, SHOPEE, MERCADO_LIVRE, AMAZON
  country: string; // BR, US, GLOBAL...
  priceRange: string;
  demandScore: number; // 0-100
  growth7d: number; // % de crescimento de interesse em 7 dias
  competition: 'BAIXA' | 'MEDIA' | 'ALTA';
  trend: number[]; // sparkline 12 semanas (interesse relativo 0-100)
  insight: string; // por que está em alta / como aproveitar
}

export interface TrendingVideo {
  id: string;
  title: string;
  platform: 'TIKTOK' | 'REELS' | 'SHORTS' | 'YOUTUBE';
  country: string;
  category: string;
  views: number;
  growth24h: number; // %
  format: string; // ex.: "UGC talking-head 9:16 · 34s"
  hook: string; // o gancho que segura os 3 primeiros segundos
  whyItWorks: string;
  url?: string;
}

export const DEMO_PRODUCTS: TrendingProduct[] = [
  { id: 'p1', name: 'Creatina monohidratada 300g', category: 'Suplementos', platforms: ['TIKTOK_SHOP', 'MERCADO_LIVRE'], country: 'BR', priceRange: 'R$ 60–120', demandScore: 94, growth7d: 38, competition: 'ALTA', trend: [42, 45, 48, 52, 55, 61, 63, 70, 74, 81, 89, 94], insight: 'Onda fitness contínua + criadores de "gym tok" citando marcas. Diferencie por sabor/pureza e prova social de resultados em 30 dias.' },
  { id: 'p2', name: 'Luminária de sol artificial (sunset lamp) 2.0', category: 'Casa & Decoração', platforms: ['TIKTOK_SHOP', 'SHOPEE'], country: 'GLOBAL', priceRange: 'R$ 35–90', demandScore: 88, growth7d: 61, competition: 'MEDIA', trend: [12, 15, 14, 18, 25, 31, 38, 47, 52, 66, 79, 88], insight: 'Estética "room makeover" voltou no TikTok. Vídeos de antes/depois do quarto convertem muito; CPC baixo em interesses de decoração.' },
  { id: 'p3', name: 'Escova alisadora térmica bivolt', category: 'Beleza', platforms: ['SHOPEE', 'MERCADO_LIVRE'], country: 'BR', priceRange: 'R$ 80–160', demandScore: 86, growth7d: 24, competition: 'ALTA', trend: [55, 58, 54, 60, 63, 61, 66, 70, 72, 75, 81, 86], insight: 'Demanda perene com pico pré-festas. Criativo vencedor: demonstração em cabelo real com timer na tela ("pronta em 6 min").' },
  { id: 'p4', name: 'Garrafinha com marcador de horário 2L', category: 'Fitness', platforms: ['SHOPEE', 'TIKTOK_SHOP'], country: 'BR', priceRange: 'R$ 25–55', demandScore: 82, growth7d: 45, competition: 'BAIXA', trend: [20, 22, 26, 24, 30, 35, 41, 48, 55, 63, 74, 82], insight: 'Trend "hidratação estética" + volta às aulas/academia. Margem alta e frete leve; ótimo produto de entrada para tráfego pago.' },
  { id: 'p5', name: 'Mini impressora térmica de bolso', category: 'Papelaria criativa', platforms: ['TIKTOK_SHOP', 'SHOPEE'], country: 'GLOBAL', priceRange: 'R$ 90–180', demandScore: 79, growth7d: 52, competition: 'MEDIA', trend: [18, 20, 25, 23, 28, 34, 40, 45, 52, 60, 71, 79], insight: 'Estudantes usando para "aesthetic notes". Vídeos POV de estudo com a impressora têm retenção altíssima; público 16-24.' },
  { id: 'p6', name: 'Kit clareador dental LED', category: 'Beleza', platforms: ['SHOPEE', 'AMAZON'], country: 'BR', priceRange: 'R$ 50–130', demandScore: 77, growth7d: 19, competition: 'ALTA', trend: [48, 52, 50, 55, 58, 60, 62, 66, 68, 70, 74, 77], insight: 'Antes/depois é o criativo dominante. Cuidado com claims de saúde nas políticas de anúncio — use "aparência" e não "tratamento".' },
  { id: 'p7', name: 'Suporte veicular magnético MagSafe', category: 'Acessórios de celular', platforms: ['MERCADO_LIVRE', 'AMAZON'], country: 'BR', priceRange: 'R$ 40–110', demandScore: 75, growth7d: 28, competition: 'MEDIA', trend: [35, 38, 40, 44, 42, 48, 52, 55, 60, 65, 70, 75], insight: 'Cresce junto com a base de iPhone no Brasil. Criativo de 15s "instala em 2 segundos" com carro em movimento performa bem.' },
  { id: 'p8', name: 'Air fryer acessórios (kit 12 peças)', category: 'Cozinha', platforms: ['SHOPEE', 'MERCADO_LIVRE'], country: 'BR', priceRange: 'R$ 30–70', demandScore: 73, growth7d: 15, competition: 'BAIXA', trend: [50, 52, 55, 53, 58, 56, 60, 62, 64, 67, 70, 73], insight: 'Pega carona na base gigante de air fryers já vendidas. Público 30+, converte bem em Reels de receita com o kit aparecendo.' },
  { id: 'p9', name: 'Tapete de yoga antiderrapante grosso', category: 'Fitness', platforms: ['AMAZON', 'MERCADO_LIVRE'], country: 'US', priceRange: 'US$ 20–45', demandScore: 71, growth7d: 22, competition: 'MEDIA', trend: [40, 42, 45, 48, 46, 50, 54, 56, 60, 63, 68, 71], insight: 'Janeiro fitness nos EUA. Criadores de pilates/yoga em alta; parcerias de afiliado custam menos que CPC frio.' },
  { id: 'p10', name: 'Organizador de maquiagem acrílico giratório', category: 'Casa & Decoração', platforms: ['SHOPEE', 'TIKTOK_SHOP'], country: 'BR', priceRange: 'R$ 45–95', demandScore: 69, growth7d: 33, competition: 'BAIXA', trend: [22, 25, 28, 30, 34, 38, 42, 48, 52, 58, 64, 69], insight: '"Organize with me" é formato com retenção alta. Produto visual — o vídeo vende sozinho, invista em demonstração ASMR.' },
  { id: 'p11', name: 'Fone condução óssea esportivo', category: 'Eletrônicos', platforms: ['AMAZON', 'MERCADO_LIVRE'], country: 'GLOBAL', priceRange: 'R$ 120–350', demandScore: 68, growth7d: 41, competition: 'MEDIA', trend: [25, 28, 30, 34, 38, 42, 45, 50, 54, 58, 63, 68], insight: 'Corredores e ciclistas migrando de in-ear. Ticket maior = ótimo para tráfego pago com funil de remarketing.' },
  { id: 'p12', name: 'Colágeno hidrolisado com vitamina C', category: 'Suplementos', platforms: ['MERCADO_LIVRE', 'SHOPEE'], country: 'BR', priceRange: 'R$ 45–110', demandScore: 66, growth7d: 12, competition: 'ALTA', trend: [52, 54, 55, 56, 58, 57, 60, 61, 62, 63, 65, 66], insight: 'Demanda estável 30-55 anos. Assinatura/recompra é a chave: CAC alto se pago, LTV compensa com e-mail/WhatsApp.' },
];

export const DEMO_VIDEOS: TrendingVideo[] = [
  { id: 'v1', title: 'POV: você acordou 4h47 para treinar (rotina realista)', platform: 'TIKTOK', country: 'BR', category: 'Fitness', views: 12_400_000, growth24h: 84, format: 'POV cinematográfico 9:16 · 28s', hook: 'Relógio marcando 4:47 + despertador cortado no 1º segundo', whyItWorks: 'Rotina aspiracional + realismo (sem glamour). Comentários discutindo "vale a pena?" alimentam o algoritmo.' },
  { id: 'v2', title: 'I tested 5 viral Amazon kitchen gadgets so you don\'t have to', platform: 'SHORTS', country: 'US', category: 'Reviews', views: 8_900_000, growth24h: 66, format: 'Talking-head + demo rápida · 58s', hook: '"Number 3 should be illegal" no primeiro frame', whyItWorks: 'Formato lista + curiosidade. Cada gadget é um mini-loop de expectativa/resultado. Alto potencial de afiliado.' },
  { id: 'v3', title: 'Transformei meu quarto gastando R$ 300 (antes/depois)', platform: 'REELS', country: 'BR', category: 'Casa & Decoração', views: 6_700_000, growth24h: 59, format: 'Timelapse antes/depois · 22s', hook: 'Quarto bagunçado com texto "meu quarto era assim"', whyItWorks: 'Antes/depois com orçamento baixo é replicável — salva/compartilha alto. Produtos aparecem naturalmente (sunset lamp, LED).' },
  { id: 'v4', title: 'Nail art com produtos da Shopee que parecem caros', platform: 'TIKTOK', country: 'BR', category: 'Beleza', views: 5_800_000, growth24h: 47, format: 'Close-up macro ASMR · 41s', hook: 'Mão entrando no quadro com unha finalizada + "tudo da Shopee"', whyItWorks: 'ASMR + revelação de preço baixo. Comentários pedindo link = tráfego orgânico para loja.' },
  { id: 'v5', title: 'Day in my life: dona de e-commerce que fatura 6 dígitos', platform: 'REELS', country: 'BR', category: 'Empreendedorismo', views: 4_900_000, growth24h: 55, format: 'Vlog dinâmico com legendas grandes · 45s', hook: '"Todo mundo acha que eu só posto foto" + print de faturamento', whyItWorks: 'Bastidor de negócio + prova. Atrai aspirantes a lojista — público perfeito para infoproduto/mentoria.' },
  { id: 'v6', title: 'The 3-second rule that doubled my TikTok views', platform: 'YOUTUBE', country: 'US', category: 'Marketing', views: 3_200_000, growth24h: 31, format: 'Talking-head com b-roll · 8min12', hook: 'Gráfico de views dobrando na thumbnail', whyItWorks: 'Promessa específica e mensurável. Retém porque entrega o método aos 40s e aprofunda depois — modelo para conteúdo educativo.' },
  { id: 'v7', title: 'Receita de brownie de whey na air fryer (3 ingredientes)', platform: 'REELS', country: 'BR', category: 'Receitas fit', views: 4_100_000, growth24h: 43, format: 'Mãos + panela POV · 31s', hook: '"3 ingredientes e SEM açúcar" com os ingredientes na bancada', whyItWorks: 'Receita curta + restrição (sem açúcar) + air fryer = três trends numa. Salvamentos altíssimos.' },
  { id: 'v8', title: 'Unboxing mini impressora + organizando meu caderno de estudos', platform: 'TIKTOK', country: 'GLOBAL', category: 'Estudo/aesthetic', views: 3_800_000, growth24h: 72, format: 'Top-down desk POV · 36s', hook: 'Peel do papel térmico saindo da impressora (satisfying)', whyItWorks: 'Study-tok em alta global. Som satisfying + produto visível = vídeo que vende sem parecer anúncio.' },
  { id: 'v9', title: 'Peguei um carro por assinatura por 30 dias — a conta real', platform: 'YOUTUBE', country: 'BR', category: 'Finanças', views: 2_100_000, growth24h: 26, format: 'Documental com planilha na tela · 12min40', hook: 'Planilha com número final borrado na thumb', whyItWorks: 'Custo real revelado no fim = retenção até o final. Formato "eu testei e fiz a conta" cresce no YT Brasil.' },
  { id: 'v10', title: 'ASMR restocking da minha geladeira de bebidas', platform: 'TIKTOK', country: 'US', category: 'ASMR/Organização', views: 7_300_000, growth24h: 38, format: 'Top-down restock · 52s', hook: 'Primeira lata deslizando no organizador acrílico', whyItWorks: 'Restock ASMR é formato perene. Organizadores/dispensers aparecem — categoria inteira de produtos surfa esses vídeos.' },
];

/** Melhores janelas de postagem ORGÂNICA por rede (fuso de Brasília, dados de mercado). */
export const POSTING_WINDOWS = [
  { platform: 'TIKTOK', days: 'ter–qui', windows: ['11h–13h', '19h–22h'], notes: 'Poste 1-3x/dia; o pico de FYP brasileiro é 20h-22h. Vídeos <35s com gancho nos 2 primeiros segundos.' },
  { platform: 'REELS', days: 'seg–sex', windows: ['12h–14h', '18h–21h'], notes: 'Reels com áudio em alta ganham distribuição extra. Poste no feed + stories com enquete para engajamento inicial.' },
  { platform: 'SHORTS', days: 'todos', windows: ['12h–15h', '19h–23h'], notes: 'Shorts alimentam o canal longo: termine com gancho para o vídeo completo. Consistência diária pesa mais que horário.' },
  { platform: 'YOUTUBE', days: 'qui–dom', windows: ['11h', '18h'], notes: 'Vídeos longos: publique 2h antes do pico para indexar. Thumb + título respondem 80% do CTR.' },
];
