# TrafegoAI — Resumo do que foi construído

Documento do que foi implementado, verificado e entregue. O projeto está na branch
`main` (PR #21 mergeada), na pasta `trafegoai/`.

## Visão geral

**TrafegoAI** é um SaaS de gestão de tráfego pago (Google Ads, Meta Ads e TikTok
Ads) num painel único, com uma camada de IA (diagnóstico, recomendações, chat,
criativos) e uma **máquina de inteligência de tendências** (produtos e vídeos em
alta + planejador de postagem). Roda em dois modos: **completo** (frontend + API +
Postgres + Redis + worker) e **demonstração** (100% no navegador, sem backend).

- **44** arquivos TypeScript no backend · **30** no frontend · **3** suítes de teste
- **15** módulos/controllers de API · **14** páginas de painel + landing + login +
  relatório compartilhável
- **15** testes automatizados (todos verdes)

## Arquitetura

```
apps/web (Next.js 14)  ──HTTP/WS──▶  apps/api (NestJS)
     │                                   │
     │ modo demo:                        ├── PostgreSQL (Prisma, schema + migrations)
     │ lib/mock.ts                       ├── Redis  ◀── worker (BullMQ): sync + regras
     │ (backend no navegador)            └── Conectores Google/Meta/TikTok
     │                                        + camada de normalização (MetricDaily)
     ▼
 Vercel/Netlify (sem backend)        Railway/Render (backend completo)
```

- **Normalização de métricas:** cada conector converte o formato nativo para o
  schema comum `MetricDaily` (spend, revenue, impressions, clicks, conversions,
  frequency) em nível de conta/campanha/conjunto/anúncio. ROAS, ROI, CPA, CPC,
  CPM, CTR e taxa de conversão são derivadas na leitura.
- **Tempo real:** WebSocket (Socket.IO) com relay via **Redis pub/sub**, então
  eventos do worker (regras agendadas) e de qualquer réplica da API chegam a todos
  os clientes.
- **Segurança/LGPD:** tokens OAuth criptografados em repouso (AES-256-GCM); dados
  sensíveis nunca em URL; toda ação que altera campanha/verba exige confirmação e
  gera `AuditLog`; a IA nunca gasta sozinha fora de regras criadas pelo usuário.

## Backend (NestJS + Prisma + BullMQ) — 15 módulos

| Módulo | O que faz |
|---|---|
| `auth` | JWT (registro/login), guard, `/auth/me`; ponto de integração p/ Google OAuth |
| `connections` | Status das contas conectadas, connect/callback OAuth, reauth, sync agora |
| `dashboard` | KPIs consolidados, comparação de período, timeseries, funil, split, heatmap, highlights |
| `campaigns` | Lista unificada, drill-down (conjuntos/anúncios), pausar/ativar/verba/duplicar, editar segmentação |
| `insights` | Diagnóstico IA, recomendações (aplicar/desfazer/dispensar), anomalias (z-score), ranking de criativos com fadiga |
| `chat` | Assistente que responde em pt-BR com base nos dados reais (LLM + fallback) |
| `rules` | CRUD de regras "se→então", **preview (dry-run)**, run-now; motor com guardrails |
| `goals` | Metas por cliente + **projeção de fim de mês** |
| `creatives` | Biblioteca + **gerador de criativos com IA** |
| `reports` | Relatórios white-label, envio, **dashboard compartilhável por link** |
| `billing` | Planos Starter/Pro/Agência, checkout Stripe (real + modo demo), webhook |
| `radar` | **Produtos e vídeos em alta** + planejador; YouTube Data API real |
| `notifications` | Feed unificado (anomalias + disparos de regra) p/ o sino |
| `audit` | Log de auditoria de toda ação sensível |
| `clients` | Clientes da agência |

Infra de apoio: `PrismaService`, `crypto.util` (AES-256-GCM), `metrics.util`
(derivadas + resolução de período), `LlmService` (Claude com fallback),
`RealtimeGateway` + `RealtimeRedisPublisher`, `SyncService` + `worker.main.ts`.

## Frontend (Next.js 14 + Tailwind + Zustand + Recharts + TanStack) — 14 páginas

Landing vendedora · Login/registro · **Dashboard** (12 KPIs, 4 gráficos, heatmap,
cards, alertas) · **Radar de Tendências** · **Planejador de Postagem** ·
**Campanhas** (tabela virtualizada, drill-down, comparação, CSV, ações,
segmentação) · **Recomendações IA** · **Assistente (chat)** · **Automações**
(com preview) · **Criativos** (ranking, fadiga, comparação, gerador) · **Metas &
Previsões** · **Relatórios** (white-label, PDF, link) · **Conexões** ·
**Auditoria** · **Planos** (toggle mensal/anual) · **Relatório compartilhável**
(`/r/[token]`, somente leitura, botão Baixar PDF).

Padrões: estados de loading/vazio/erro com retry em todas as telas; diálogo de
confirmação antes de qualquer ação que gasta dinheiro; sino de notificações em
tempo real; onboarding guiado; dark premium com toggle light; acessibilidade
(labels, aria, foco, contraste).

## Máquina de inteligência (Radar + Planejador)

- **Produtos em alta**: ranking por score de demanda, filtros por país e
  marketplace (TikTok Shop, Shopee, Mercado Livre, Amazon), crescimento em 7 dias,
  faixa de preço, concorrência, sparkline e insight de como aproveitar.
- **Vídeos em alta no mundo**: por rede (TikTok/Reels/Shorts/YouTube) e país, com
  views, crescimento 24h, formato, gancho e "por que funciona". **YouTube "Em alta"
  real via YouTube Data API v3** quando há `YOUTUBE_API_KEY` (cache 30 min).
- **Planejador**: melhores janelas por rede + "Analisar meu vídeo": a IA devolve
  veredito, 3 ganchos e plano por rede (título, hashtags, horário, formato, dica de
  tráfego pago).

## Modo demonstração (roda sem backend)

`apps/web/lib/mock.ts` é um "backend embutido no navegador" que responde a **todas**
as rotas com dados realistas (dashboard, campanhas, drill-down, radar, planejador,
recomendações, regras, metas, relatórios, billing, notificações) e muta estado em
memória. Ativado por `NEXT_PUBLIC_DEMO_MODE=true` (ou ausência de
`NEXT_PUBLIC_API_URL`). Permite publicar só o frontend, sem API/DB/Redis.

## Qualidade e verificação (feita ao vivo, não só typecheck)

- **Build** de API e web passando; **15/15 testes Jest** verdes (métricas
  derivadas, cripto de tokens, guardrails de orçamento).
- Ambiente real subido (Postgres + Redis): migrations + seed, **todos os endpoints
  GET → 200** e mutações (pausar, aplicar recomendação, chat, regras, checkout,
  segmentação, radar) funcionando.
- **WebSocket** verificado ponta a ponta (8 disparos de regra em tempo real) e o
  relay cross-process via Redis (evento do worker relaiado ao cliente).
- Modo demo verificado com a **API desligada**: login e navegação renderizando sem
  erros de console.
- Screenshots reais capturados de todas as telas principais (via Chromium headless).

## Deploy (3 caminhos documentados)

| Caminho | Arquivo | Backend? |
|---|---|---|
| **Vercel/Netlify (só frontend)** | `DEPLOY_SEM_BACKEND.md` + `apps/web/vercel.json` | Não — modo demo |
| **Railway** (API+worker+DB+Redis) | `DEPLOY_RAILWAY.md` + `apps/api/railway.json` | Sim |
| **Render** | `trafegoai/render.yaml` + `DEPLOY.md` | Sim |
| **Local** | `docker compose up` | Sim, de um comando |

Login demo: **demo@trafegoai.com / demo1234** (no modo demo, qualquer credencial entra).

## O que fica como ponto de integração (depende de credenciais/aprovação externas)

Documentado no código, como o próprio escopo prevê: chamadas de **escrita** reais
nas APIs do Google/Meta/TikTok (pausar/verba de verdade), login **Google OAuth**,
recuperação de senha por e-mail, e as fontes de tendência além do YouTube (TikTok
Creative Center, Google Trends, afiliados de marketplace). Tudo com o ponto de
integração marcado; sem as chaves, roda com dados curados/mock.

## Histórico

O projeto evoluiu ao longo de **14 commits** (PR #21, mergeada na `main`):
backend completo → frontend → correção de bug de hidratação → checkout Stripe,
comparação de criativos e motor de regras com dry-run → métricas por anúncio →
tempo real + drill-down + comparação de campanhas + testes + onboarding → tempo
real cross-process + PDF + segmentação → Radar + Planejador → config de deploy →
**modo demonstração sem backend**.
