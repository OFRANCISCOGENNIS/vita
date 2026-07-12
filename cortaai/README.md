# ✂️ CortaAí

**Descubra o que viraliza. Corte. Exporte em 4K. Tudo em um só lugar.**

CortaAí é uma máquina industrial de produzir vídeos curtos, tudo em um único site:

1. **Radar Viral** — pesquisa o que está viralizando no seu nicho, ranqueia por
   **Índice de Retenção Estimado** e gera o **Raio-X** de cada vídeo (som, imagem,
   estrutura e curva de retenção segundo a segundo).
2. **Cérebro de IA de cortes** — transforma qualquer vídeo longo em 5–20 cortes
   ranqueados por score viral (0–100), cruzando o SEU vídeo com os padrões atuais
   do nicho vindos do Radar.
3. **Editor profissional no navegador** — timeline multi-trilha, reenquadramento
   inteligente, legendas dinâmicas palavra por palavra (8+ presets), edição
   baseada em texto, camadas e áudio com ducking.
4. **Exportação em até 4K** — pipeline que nunca reescala para cima, fila de
   render com workers paralelos, lote em .zip com `.srt`, capa e descrição prontos.

Interface 100% em português do Brasil.

---

## Backend real em 1 clique (Render, grátis)

O site publicado (GitHub Pages) roda em modo demonstração. Para ligar o Radar
com dados ao vivo, transcrição no servidor, renderização final e o Estúdio IA
de verdade:

1. Crie uma conta em [render.com](https://render.com) (dá para entrar com o GitHub).
2. Clique em **[Deploy no Render](https://render.com/deploy?repo=https://github.com/OFRANCISCOGENNIS/anonymousKS)**
   (New → Blueprint → este repositório). O `render.yaml` da raiz configura tudo
   sozinho — plano **grátis**, contêiner único com SQLite/tarefas inline/ffmpeg.
3. Ao terminar (~5 min), copie a URL do serviço (ex.:
   `https://cortaai-api.onrender.com`).
4. No site do CortaAí, abra **Configurações → Backend real** e cole a URL em
   **Testar e conectar**. Pronto.

Notas do plano grátis: o serviço hiberna após ~15 min ocioso (a primeira
chamada demora ~1 min para acordar) e o disco é efêmero. Para dados
persistentes, aponte `DATABASE_URL` para um Postgres.

## Subindo tudo com um comando

Pré-requisitos: Docker + Docker Compose.

```bash
cd cortaai
cp .env.example .env        # chaves opcionais em dev — roda em modo demo sem elas
docker compose up --build
```

| Serviço | URL |
|---------|-----|
| Web (Next.js) | http://localhost:3000 |
| API (FastAPI + Swagger) | http://localhost:8000/docs |
| MinIO Console | http://localhost:9001 (cortaai / cortaai-secret) |

**Conta demo (seed automático):** `demo@cortaai.com` / `demo1234`
(admin: `admin@cortaai.com` / `admin1234`)

O seed pré-popula o Radar Viral com vídeos, análises Raio-X completas e padrões
de nicho, além de 3 projetos com cortes ranqueados — o produto é demonstrável
imediatamente, sem nenhuma chave de API.

## Desenvolvimento fora do Docker

```bash
# Frontend (funciona 100% standalone com dados mockados se a API estiver fora)
cd apps/web && npm install && npm run dev      # http://localhost:3000

# Backend
cd apps/api && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload                  # http://localhost:8000

# Worker + Radar (precisam de Redis)
celery -A app.workers.celery_app worker --loglevel=info
celery -A app.workers.celery_app beat --loglevel=info
```

Atalhos no `Makefile`: `make up`, `make logs`, `make seed`, `make test`, `make clean`.

## Variáveis de ambiente e chaves de API

Todas opcionais em desenvolvimento (fallbacks determinísticos embutidos). Veja
`.env.example`. Pontos de integração paga estão marcados no código com
`# INTEGRAÇÃO PAGA:` / `// INTEGRAÇÃO PAGA:`.

| Chave | Serviço | Usada em |
|-------|---------|----------|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe | Checkout e assinaturas (`routers/billing.py`) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 | Radar Viral real (`workers/tasks_radar.py`) |
| `OPENAI_API_KEY` ou `ANTHROPIC_API_KEY` | LLM | Score viral, títulos, hashtags, relatórios Raio-X (`services/llm.py` — prompts documentados) |
| `GOOGLE_OAUTH_CLIENT_ID` | Google | Login com Google (`routers/auth.py`) |
| `JWT_SECRET` | — | Assinatura dos tokens (obrigatória em produção) |

## Arquitetura

```
cortaai/
├── docker-compose.yml      # web + api + worker + radar + postgres + redis + minio
├── SPEC.md                 # contrato compartilhado front↔back (entidades, endpoints, shapes)
├── apps/
│   ├── web/                # Next.js 14 (App Router) + TS + Tailwind + Zustand + Recharts
│   └── api/                # FastAPI + SQLAlchemy 2 + Alembic + Celery + Redis + MinIO
└── Makefile
```

**Fluxo de dados:**

```
Radar Viral (Celery beat, cron)
  → YouTube Data API (com cache Redis p/ cota) → Índice de Retenção → trend_videos
  → agregação por nicho (6/6h) → niche_patterns
Upload em chunks (MinIO presigned) / yt-dlp por URL
  → fila import → transcrição (Whisper) → análise multimodal (FFmpeg + PySceneDetect + librosa)
  → motor de score viral (cruza com niche_patterns do Radar) → cortes sugeridos
Editor (edit_state em jsonb, autosave)
  → fila de render (FFmpeg: crop com keyframes, legendas ASS/libass, preset slow + CRF baixo,
    NUNCA reescala para cima) → MinIO (vídeo + .srt + capa + descrição .txt + .zip em lote)
  → progresso em tempo real via WebSocket (Redis pub/sub)
```

**Banco:** PostgreSQL 16 com migrations Alembic (`apps/api/alembic/`). Schema:
`users`, `projects`, `cuts`, `jobs`, `subscriptions`, `trend_videos`,
`trend_analyses`, `niche_patterns`, `niche_alerts`.

## Planos

| Plano | Minutos/mês | Resolução | Marca d'água | Radar |
|-------|-------------|-----------|--------------|-------|
| Free | 60 | 720p | sim | limitado |
| Pro | 600 | 4K | não | completo |
| Studio | ilimitado | 4K | não | completo + alertas + API |

## Como escalar os workers

O processamento pesado (FFmpeg/Whisper/análise) roda em workers Celery
desacoplados da API — escale-os independentemente:

```bash
# local
docker compose up --scale worker=4 -d

# produção: um pool de máquinas com GPU para tasks_transcribe (Whisper large)
# e um pool CPU-otimizado para tasks_render (FFmpeg preset slow).
# Roteie por fila: celery -A app.workers.celery_app worker -Q render --concurrency=8
```

Recomendações de produção:
- Filas separadas (`import`, `transcribe`, `analyze`, `render`, `radar`) com
  autoscaling por profundidade de fila.
- MinIO → S3/R2 com lifecycle (originais 30 dias, renders 90 dias) — as URLs já
  são assinadas.
- O Radar usa cache Redis com TTL para não estourar a cota da YouTube Data API
  (10.000 unidades/dia): buscas idênticas dentro da janela reutilizam o cache.

## Testes

```bash
cd apps/api && python -m pytest -q     # sanidade da API, scoring e retenção
cd apps/web && npm run build           # type-check + build de produção
```
