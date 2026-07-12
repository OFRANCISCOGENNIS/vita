# Colocar o TrafegoAI no ar

O TrafegoAI é full-stack (Postgres + Redis + API + worker + frontend). Há dois
caminhos para um **URL público**.

> **Nota sobre este monorepo:** o `render.yaml` da RAIZ pertence ao projeto
> **CortaAí** (o Render só detecta um blueprint na raiz). O blueprint do TrafegoAI
> fica em **`trafegoai/render.yaml`**. Por isso, para o TrafegoAI a **Opção B
> (Vercel + Railway)** é a recomendada; para usar o Render, veja a Opção A.

## Opção A — Render usando o blueprint do TrafegoAI

O blueprint está em `trafegoai/render.yaml` (não na raiz, que é do CortaAí).
Duas formas de usar:
- **Serviços manuais:** no dashboard do Render, crie os serviços a partir das
  imagens Docker `trafegoai/apps/api/Dockerfile` (api + worker) e
  `trafegoai/apps/web/Dockerfile` (web), mais um Postgres e um Redis, usando os
  comandos e variáveis descritos em `trafegoai/render.yaml` como referência.
- **Blueprint dedicado:** se preferir o fluxo de Blueprint, mantenha o TrafegoAI
  num repositório próprio (ou fork) com `render.yaml` na raiz — aí o
  **New Blueprint Instance** provisiona Postgres, Redis, `trafegoai-api`
  (migrations + seed automáticos), `trafegoai-worker` e `trafegoai-web` de uma vez.

**Passo manual (uma vez):** o frontend embute `NEXT_PUBLIC_API_URL` em build time,
e a URL da API só existe após o 1º deploy. No serviço **trafegoai-web →
Environment**, defina `NEXT_PUBLIC_API_URL = https://trafegoai-api.onrender.com`
(URL real da sua API) e faça **Manual Deploy → Clear build cache & deploy**.
Login demo: `demo@trafegoai.com` / `demo1234`.

> Plano free hiberna após ociosidade (~30s no primeiro acesso). Para produção, use planos pagos.

## Opção B — Vercel (frontend) + Railway (API/worker/DB/Redis) — recomendada

**Backend no Railway:**
1. https://railway.app → New Project → Deploy from GitHub → este repo.
2. Adicione os plugins **PostgreSQL** e **Redis** (Railway injeta `DATABASE_URL`/`REDIS_URL`).
3. Crie dois serviços a partir de `apps/api/Dockerfile`:
   - **api** — start: `sh -c "npx prisma migrate deploy && npm run seed:ifempty && node dist/src/main.js"`
   - **worker** — start: `node dist/src/jobs/worker.main.js`
4. Defina `JWT_SECRET` e `TOKEN_ENCRYPTION_KEY` (32 bytes). Exponha a porta da API.

**Frontend na Vercel:**
1. https://vercel.com → Import Project → este repo → root `trafegoai/apps/web`.
2. Env var `NEXT_PUBLIC_API_URL = https://<sua-api-no-railway>`.
3. Deploy. A Vercel dá o URL público do painel.

## Rodar localmente (sem nuvem)

```bash
cd trafegoai && docker compose up --build
# web http://localhost:3000 · api http://localhost:4000 · demo@trafegoai.com / demo1234
```

## Credenciais opcionais (ativam integrações reais)

Todas são opcionais — sem elas o app roda com o seed e IA em modo demo:
`ANTHROPIC_API_KEY` (IA), `GOOGLE_ADS_*`/`META_*`/`TIKTOK_*` (contas de anúncio),
`STRIPE_SECRET_KEY` + `STRIPE_PRICE_*` (checkout real). Veja `.env.example`.
