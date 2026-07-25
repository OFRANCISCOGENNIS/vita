# Prompt — TrafegoAI: Gestor de Tráfego Pago com IA + Máquina de Inteligência de Tendências

> Cole tudo abaixo na sua ferramenta de IA de desenvolvimento (Claude Code, Cursor, etc.).
> Este prompt reflete o produto **como ele foi efetivamente construído**, incluindo o
> Radar de Tendências, o Planejador de Postagem e o **modo demonstração** (roda 100%
> sem backend, para deploy só do frontend).

---

Você é um engenheiro sênior full-stack de plataformas de marketing e um gestor de
tráfego pago experiente. Construa um SaaS completo, funcional e com qualidade de
produção chamado **TrafegoAI** — um gestor de tráfego pago que roda 100% online e
ajuda o usuário a conseguir as melhores métricas em **Google Ads, Meta Ads
(Facebook/Instagram) e TikTok Ads** num único painel, com uma camada de IA que
analisa, sugere e otimiza campanhas — e uma **máquina de inteligência** que mostra
produtos em alta (que estão vendendo) e vídeos em alta no mundo, além de planejar
como/quando postar em cada rede social.

## Regras gerais de qualidade (obrigatórias)
- TypeScript em todo o projeto; código modular e reutilizável.
- Todos os estados tratados: loading (skeletons), vazio, erro (com retry), sucesso.
- Nenhum botão morto; toda ação dá feedback.
- Performance: lazy loading, virtualização de tabelas grandes, cache de leitura.
- Acessibilidade: contraste AA, navegação por teclado, labels em inputs.
- Textos da interface em **português do Brasil**.
- LGPD: consentimento de dados, tokens OAuth criptografados em repouso
  (AES-256-GCM), dados sensíveis nunca em URL.
- **Toda ação que gasta dinheiro ou altera campanhas exige confirmação explícita**
  e gera log de auditoria. A IA nunca executa nada sozinha fora de regras de
  automação que o próprio usuário criou e ativou.

## 1. Arquitetura técnica (implemente exatamente assim)
- **Frontend:** Next.js 14 (App Router) + React + TypeScript + TailwindCSS +
  Zustand; gráficos com Recharts; tabelas com TanStack Table + virtualização.
- **Backend:** NestJS (TypeScript) + Prisma; WebSockets (Socket.IO) para tempo
  real; jobs agendados com BullMQ + Redis (sync de métricas de hora em hora e
  motor de regras a cada 15 min); worker em processo separado (escala horizontal).
- **Banco:** PostgreSQL com schema completo e migrations (usuários, organizações,
  clientes, contas conectadas, campanhas/conjuntos/anúncios, métricas diárias
  normalizadas em nível de conta/campanha/conjunto/anúncio, regras, recomendações,
  anomalias, metas, relatórios, auditoria, chat).
- **Integrações:** conectores para Google Ads API, Meta Marketing API e TikTok
  Marketing API com uma **camada de normalização** que unifica as métricas num
  schema comum (`MetricDaily`); ROAS/ROI/CPA/CPC/CPM/CTR/tx. conversão são
  derivadas na leitura; respeito a rate limits e cache. Pontos de integração
  documentados no código (o app funciona com dados mockados enquanto o acesso às
  APIs não é liberado).
- **IA:** LLM (Claude) para diagnósticos, recomendações, chat, criativos e análise
  de posts, com **fallback heurístico** quando não há chave; pipeline de detecção
  de anomalias por z-score sobre as séries diárias. Prompts documentados no código.
- **Infra:** Docker Compose com todos os serviços (web, api, worker, redis,
  postgres) rodando com um comando; seed automático no primeiro boot.
- **README** com setup local, variáveis de ambiente, como registrar os apps de
  desenvolvedor em cada plataforma e obter as credenciais, e como escalar os workers.

## 2. Modo demonstração (roda sem backend) — obrigatório
Implemente um **"backend embutido no navegador"**: quando `NEXT_PUBLIC_DEMO_MODE=true`
(ou quando não há API real configurada), o cliente HTTP roteia todas as chamadas
para um módulo de mock que responde com dados realistas e muta estado em memória
(pausar campanha, aplicar recomendação, trocar plano, editar segmentação, etc.).
Isso permite **publicar só o frontend** (Vercel/Netlify) com um link público, sem
API/Postgres/Redis. Quando quiser o backend real, basta trocar a variável por
`NEXT_PUBLIC_API_URL`. Documente os dois caminhos de deploy.

## 3. Conexão de contas (multi-plataforma)
- OAuth oficial para conectar cada conta de anúncios; múltiplas contas por
  plataforma e gestão de vários clientes (modo agência).
- Sincronização automática agendada + botão "sincronizar agora" + indicador de
  "última atualização".
- Tela de status de cada conexão (ativa, expirada, com erro) e reautenticação fácil.

## 4. Dashboard unificado
- Visão consolidada (Google + Meta + TikTok): investimento, receita, ROAS, ROI,
  CPA, CPC, CPM, CTR, taxa de conversão, impressões, cliques, conversões.
- Filtros por período (hoje, 7d, 30d, personalizado), plataforma, conta/cliente.
- Comparação vs. período anterior com variação percentual e setas de tendência.
- Gráficos: evolução gasto × receita, funil (impressão → clique → conversão),
  distribuição de verba por plataforma, mapa de calor de horários/dias.
- Cards de destaque: melhor campanha, pior campanha, maior desperdício,
  oportunidade do dia. Alertas visuais quando uma métrica-chave sai do padrão.

## 5. Gestão de campanhas
- Tabela unificada de campanhas (3 plataformas) com colunas configuráveis,
  ordenação, busca e **virtualização**; **export CSV**.
- Ações via API com confirmação: pausar/ativar, ajustar orçamento, duplicar.
- **Drill-down**: expandir campanha → conjuntos e anúncios com métricas reais.
- **Comparação lado a lado** de campanhas e de criativos (destaque do melhor por
  métrica).
- **Editar segmentação básica** dos conjuntos (idade, gênero, local, interesses).
- Análise de criativos: ranking por desempenho, preview e **detecção de fadiga**
  (queda de CTR + aumento de frequência ao longo do tempo).

## 6. Camada de IA (o gestor de tráfego virtual)
- **Diagnóstico automático** em linguagem simples: o que vai bem, o que queima
  verba e por quê.
- **Recomendações acionáveis** priorizadas por impacto, cada uma com o "porquê" e
  o ganho estimado (realocar verba, pausar conjunto caro, escalar vencedora, trocar
  criativo com fadiga, ajustar horários).
- **Aplicar com um clique** (via API, com confirmação e **desfazer**).
- **Regras de automação "se → então"** rodando em background, com **modo preview
  (dry-run)** e guardrails de orçamento (piso, teto, variação máxima por disparo).
- **Assistente de chat** em português analisando os dados reais das contas.
- **Detecção de anomalias** em tempo real (pico de gasto, queda de conversão,
  conta sem entrega, tracking quebrado) com notificações via WebSocket.

## 7. Máquina de inteligência — Radar + Planejador (diferencial)
- **Radar de Produtos em alta:** o que está vendendo por país e marketplace
  (TikTok Shop, Shopee, Mercado Livre, Amazon), com score de demanda, crescimento
  em 7 dias, faixa de preço, nível de concorrência, gráfico de tendência e um
  **insight de como aproveitar** (criativo, público, se vale tráfego pago).
- **Radar de Vídeos em alta no mundo** por rede (TikTok, Reels, Shorts, YouTube) e
  país, com views, crescimento em 24h, **formato, o gancho dos 3 primeiros
  segundos e por que o vídeo funciona**. Integração **real** com a **YouTube Data
  API v3** quando houver `YOUTUBE_API_KEY`; TikTok Creative Center, Google Trends e
  APIs de afiliados de marketplaces como pontos de integração documentados.
- **Planejador de Postagem:** melhores janelas de postagem por rede + **"Analisar
  meu vídeo antes de postar"**: a IA devolve um veredito honesto, 3 ganchos e um
  plano por rede (título adaptado, hashtags, melhor horário, formato e **dica de
  tráfego pago**). Conecte com o mapa de calor das contas (orgânico nas janelas,
  lances pagos nos horários que mais convertem).

## 8. Metas, previsões e criativos
- Metas por conta/cliente (ROAS, CPA-alvo, orçamento mensal) com barra de progresso
  e **projeção de fim de mês** com base no ritmo atual.
- **Gerador de criativos com IA:** headlines, textos primários, descrições, CTAs e
  ângulos de anúncio adaptados por plataforma e público.
- Biblioteca de criativos com histórico de desempenho.

## 9. Relatórios (modo agência)
- Relatórios **white-label** por cliente (logo, cores da agência), agendamento de
  envio por e-mail.
- **Dashboard compartilhável por link** (somente leitura) e **exportação em PDF**
  (impressão do navegador com estilos de impressão dedicados).
- Múltiplos clientes com permissões (admin, gestor, cliente-visualização).

## 10. Contas e monetização
- Auth: e-mail + Google OAuth; recuperação de senha; organizações/times com papéis.
- Planos: Starter, Pro, Agência; checkout Stripe com toggle mensal/anual (2 meses
  grátis no anual) e webhook; sem chave, o checkout roda em modo demo aplicando o
  plano na hora.
- Onboarding guiado: conectar 1ª conta → ver o primeiro diagnóstico da IA →
  aplicar/criar automação.

## 11. Design / UI
- Dark mode premium com opção light; visual de painel financeiro/BI, denso em
  dados sem poluir. Tipografia forte (Inter/Space Grotesk), gráficos claros, badges
  de status coloridos, microanimações. Totalmente responsivo.
- Landing page vendedora (hero "Todas as suas campanhas do Google, Meta e TikTok
  em um só painel — otimizadas por IA", prova social, como funciona, planos, FAQ).
  SEO completo.

## Qualidade e verificação
- Suíte de testes (Jest) para as funções puras críticas: cálculo de métricas
  derivadas, criptografia de tokens (round-trip AES-256-GCM) e guardrails de
  orçamento das regras.
- Dados de seed que demonstram o produto imediatamente: agência com clientes,
  contas conectadas nas 3 plataformas, 90 dias de métricas (em nível de campanha e
  de anúncio), recomendações, anomalias, regras, metas, relatórios e o Radar.

## Entregáveis
Projeto completo e funcional; Docker Compose de um comando; modo demo para deploy
só do frontend; guias de deploy (Vercel sem backend, Railway e Render com backend);
comentários indicando os pontos de integração com as APIs oficiais.
