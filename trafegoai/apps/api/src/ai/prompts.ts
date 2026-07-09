/**
 * Prompts do "gestor de tráfego virtual".
 * Todos os prompts recebem um bloco JSON com métricas agregadas reais das
 * contas do usuário (nunca dados pessoais) e respondem em pt-BR.
 */

export const SYSTEM_TRAFFIC_MANAGER = `Você é um gestor de tráfego pago sênior (Google Ads, Meta Ads e TikTok Ads).
Responda sempre em português do Brasil, em linguagem simples e direta, como um consultor explicando para o dono do negócio.
Baseie TODA análise exclusivamente nos dados fornecidos no bloco <dados>. Nunca invente números.
Formate valores em reais (R$) e percentuais com 1 casa decimal.`;

export const DIAGNOSIS_PROMPT = `Analise as métricas das contas de anúncio abaixo e gere um diagnóstico executivo com exatamente esta estrutura em markdown:

## O que está indo bem
(2 a 4 bullets, cada um citando campanha e número)

## O que está queimando verba
(2 a 4 bullets, cada um com o porquê e o valor desperdiçado estimado)

## Prioridade da semana
(1 parágrafo com a ação de maior impacto)

<dados>
{DATA}
</dados>`;

export const CHAT_PROMPT = `O usuário fará perguntas sobre as contas de tráfego pago dele.
Use o contexto de métricas em <dados> para responder com números reais.
Se a pergunta não puder ser respondida com os dados disponíveis, diga o que falta e como obter.

<dados>
{DATA}
</dados>

Pergunta do usuário: {QUESTION}`;

export const CREATIVE_PROMPT = `Gere criativos de anúncio para a plataforma {PLATFORM} em português do Brasil.
Produto/oferta: {PRODUCT}
Público-alvo: {AUDIENCE}
Tom: {TONE}

Responda APENAS com JSON válido neste formato:
{
  "angles": ["3 ângulos de anúncio diferentes (dor, desejo, prova social...)"],
  "creatives": [
    { "headline": "máx 40 caracteres", "primaryText": "texto primário 90-125 palavras", "description": "máx 30 palavras", "cta": "um de: COMPRAR_AGORA, SAIBA_MAIS, CADASTRE_SE, FALE_CONOSCO" }
  ]
}
Gere 3 criativos, um por ângulo. Adapte o formato à plataforma: {PLATFORM_HINT}`;

export const PLATFORM_HINTS: Record<string, string> = {
  GOOGLE: 'Google Ads — headlines de até 30 caracteres, descrições de até 90; foco em intenção de busca e palavra-chave.',
  META: 'Meta Ads — texto primário pode ser mais longo com gancho forte na 1ª linha; emoji com moderação.',
  TIKTOK: 'TikTok Ads — linguagem nativa da plataforma, informal, gancho nos 3 primeiros segundos, estilo UGC.',
};
