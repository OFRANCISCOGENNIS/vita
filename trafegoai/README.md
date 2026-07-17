# 🚀 TrafegoAI — Gestor de Tráfego Pago com IA

Todas as suas campanhas do **Google Ads**, **Meta Ads** (Facebook/Instagram) e **TikTok Ads** em um só painel — analisadas e otimizadas por IA. Dashboard unificado, recomendações acionáveis com "aplicar em 1 clique", regras de automação, gerador de criativos, metas com previsão e relatórios white-label para agências.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 (App Router) · React · TypeScript · TailwindCSS · Zustand · Recharts · TanStack Table/Virtual |
| Backend | NestJS (TypeScript) · Prisma · Socket.IO |
| Jobs | BullMQ + Redis (sync de métricas de hora em hora; regras de automação a cada 15 min) |
| Banco | PostgreSQL (schema completo com migrations Prisma) |
| IA | Claude (Anthropic) — diagnósticos, chat, criativos; fallback heurístico sem chave |
| Infra | Docker Compose (web, api, worker, redis, postgres) |

## Subir tudo com um comando

```bash
cd trafegoai
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:4000
- **Login demo:** `demo@trafegoai.com` / `demo1234`

O seed roda automaticamente no primeiro boot e cria uma agência de exemplo com 3 clientes, 6 contas conectadas (2 por plataforma), campanhas/conjuntos/anúncios, **90 dias de métricas**, mapa de calor, recomendações e anomalias de IA, regras de automação, metas e relatórios white-label.

## Setup local (sem Docker)

```bash
# 1. Suba Postgres e Redis (ou use docker compose up postgres redis)
# 2. API
cd apps/api
cp ../../.env.example .env      # ajuste DATABASE_URL/REDIS_URL se necessário
npm install
npx prisma migrate dev          # cria as tabelas
npm run seed                    # dados de demonstração
npm run dev                     # API em :4000
node dist/jobs/worker.main.js   # (opcional) worker de jobs após `npm run build`

# 3. Web
cd ../web
npm install
NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev   # web em :3000
```

## Variáveis de ambiente

Ver `.env.example` (comentado). As essenciais:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Redis (filas BullMQ) |
| `JWT_SECRET` | Assinatura dos tokens de sessão |
| `TOKEN_ENCRYPTION_KEY` | Chave AES-256 (32 bytes hex) — criptografa tokens OAuth em repouso (LGPD) |
| `ANTHROPIC_API_KEY` | IA generativa (opcional — sem ela roda em modo demo/heurístico) |

## Credenciais de API por plataforma

As três plataformas exigem **conta de desenvolvedor e aprovação de app**. Enquanto o acesso não é liberado, o TrafegoAI funciona 100% com os dados do seed (modo demo) — os pontos de integração estão comentados nos conectores (`apps/api/src/connectors/*.ts`).

### Google Ads API
1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com) e ative a **Google Ads API**.
2. Solicite um **Developer Token** no [API Center](https://ads.google.com/aw/apicenter) da sua conta de administrador (começa em modo teste; produção requer aprovação).
3. Crie credenciais **OAuth 2.0 (Web)** com redirect `http://localhost:4000/connections/google/callback`.
4. Preencha `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`.

### Meta Marketing API (Facebook/Instagram)
1. Crie um app tipo **Business** em [developers.facebook.com](https://developers.facebook.com).
2. Adicione o produto **Marketing API** e solicite acesso avançado a `ads_read` e `ads_management` (App Review).
3. Redirect OAuth: `http://localhost:4000/connections/meta/callback`.
4. Preencha `META_APP_ID` e `META_APP_SECRET`.

### TikTok Marketing API
1. Registre-se em [business-api.tiktok.com](https://business-api.tiktok.com) e crie um app de desenvolvedor.
2. Solicite os escopos de **Ads Management** (requer aprovação do app pelo time do TikTok).
3. Redirect OAuth: `http://localhost:4000/connections/tiktok/callback`.
4. Preencha `TIKTOK_APP_ID` e `TIKTOK_APP_SECRET`.

## Como escalar os workers

O worker consome as filas `metrics-sync` e `automation-rules`, é stateless e escala horizontalmente:

```bash
docker compose up --scale worker=4
```

Cada worker processa até 4 sincronizações em paralelo (`concurrency: 4` em `apps/api/src/jobs/worker.main.ts`). Os conectores devem respeitar os rate limits de cada plataforma (documentados nos comentários de cada conector); os jobs usam retry com backoff exponencial.

## Arquitetura

```
apps/web  (Next.js 14) ──HTTP/WS──▶ apps/api (NestJS)
                                       │
                     ┌─────────────────┼──────────────────┐
                     ▼                 ▼                  ▼
                PostgreSQL          Redis ◀────── worker (BullMQ)
              (Prisma schema)    (filas/cache)   sync + regras de automação
                                       │
                     conectores: Google Ads · Meta · TikTok
                     (camada de normalização → schema comum MetricDaily)
```

- **Normalização:** cada conector converte o formato nativo da plataforma para o schema comum (`MetricDaily`: spend, revenue, impressions, clicks, conversions, frequency). ROAS/CPA/CPC/CPM/CTR são derivadas na leitura (`common/metrics.util.ts`).
- **Segurança/LGPD:** tokens OAuth criptografados com AES-256-GCM em repouso; dados sensíveis nunca em URL; toda ação que altera campanha/verba exige confirmação e gera `AuditLog`; a IA **nunca** executa nada sozinha fora de regras criadas e ativadas pelo usuário.
- **IA:** prompts documentados em `apps/api/src/ai/prompts.ts`; detecção de anomalias por z-score sobre as séries diárias (`insights.service.ts`); sem `ANTHROPIC_API_KEY` tudo roda em modo heurístico de demonstração.

## Funcionalidades

- ✅ **Radar de Tendências**: produtos em alta (o que está vendendo) por país/marketplace com score de demanda, crescimento e insight de como aproveitar; vídeos em alta no mundo por rede (TikTok/Reels/Shorts/YouTube) com formato, gancho e por que funciona — YouTube via Data API real com `YOUTUBE_API_KEY`
- ✅ **Planejador de Postagem**: melhores janelas por rede + análise do seu vídeo pela IA antes de subir (ganchos, título/hashtags por rede, horário e dica de tráfego pago)
- ✅ Dashboard unificado com 12 KPIs, comparação vs. período anterior, evolução gasto×receita, funil, distribuição por plataforma, mapa de calor de horários, cards de destaque e alertas de anomalias
- ✅ Tabela de campanhas unificada (3 plataformas) com colunas configuráveis, ordenação, busca, virtualização e ações com confirmação (pausar/ativar/verba/duplicar)
- ✅ Diagnóstico automático da IA + recomendações priorizadas com "aplicar com 1 clique" e desfazer
- ✅ Regras de automação "se → então" rodando em background
- ✅ Assistente de chat em português analisando os dados reais
- ✅ Detecção de anomalias (pico de gasto, queda de conversão, conta sem entrega, tracking quebrado)
- ✅ Metas por cliente com barra de progresso e projeção de fim de mês
- ✅ Gerador de criativos com IA + ranking com detecção de fadiga
- ✅ Relatórios white-label, envio agendado e dashboard compartilhável por link (somente leitura)
- ✅ Auth JWT + organizações/planos (Starter/Pro/Agência) + log de auditoria
