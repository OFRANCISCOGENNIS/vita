# CortaAí — Especificação técnica compartilhada (contratos)

> Este documento é o contrato entre `apps/web` (Next.js 14) e `apps/api` (FastAPI).
> Qualquer mudança de shape de dados deve ser refletida nos dois lados.

## Visão do produto

SaaS "máquina de cortes": Radar Viral (pesquisa de tendências) → importação/upload de
vídeo longo → IA gera cortes ranqueados por score viral → editor no navegador →
exportação em até 4K com .srt, capa e descrição. UI 100% em português do Brasil.

## Serviços (docker-compose)

| Serviço  | Porta | Descrição |
|----------|-------|-----------|
| web      | 3000  | Next.js 14 App Router |
| api      | 8000  | FastAPI (REST + WebSocket) |
| worker   | —     | Celery worker (FFmpeg, Whisper, análise multimodal) |
| radar    | —     | Celery beat — jobs agendados do Radar Viral |
| postgres | 5432  | PostgreSQL 16 |
| redis    | 6379  | Fila Celery + cache do Radar |
| minio    | 9000/9001 | Storage S3-compatível |

## Base URL da API

`http://localhost:8000/api/v1` — o frontend lê de `NEXT_PUBLIC_API_URL`.
WebSocket de progresso: `ws://localhost:8000/api/v1/ws/progress/{job_id}`.

O frontend DEVE funcionar de forma autônoma com dados mockados (lib/mock-data.ts)
quando a API não responder — todo fetch tem fallback para mock.

## Entidades (PostgreSQL)

- **users**: id (uuid), email, password_hash, name, avatar_url, google_id, plan (`free|pro|studio`), minutes_used_month, branding_kit (jsonb: logo_url, font, colors[], caption_preset), created_at
- **projects**: id, user_id, title, source_type (`upload|youtube|twitch|vimeo`), source_url, original_filename, duration_seconds, resolution (`720p|1080p|1440p|2160p`), fps, language (`pt-BR|en|es|auto`), status (`importing|transcribing|analyzing|ready|error`), thumbnail_url, storage_key, created_at
- **cuts**: id, project_id, title, title_options (jsonb: string[3]), description, hashtags (jsonb), start_seconds, end_seconds, viral_score (0–100), score_breakdown (jsonb: hook, retention, emotion, niche_fit), transcript (jsonb: [{word, start, end, speaker}]), mode (`viral|qa|tutorial|quotes|manual`), suggested_sound (jsonb), best_post_time, status (`suggested|edited|rendering|rendered`), edit_state (jsonb: timeline do editor), created_at
- **jobs**: id, user_id, project_id, cut_id (nullable), type (`import|transcribe|analyze|render|radar_scan`), status (`queued|running|done|error`), progress (0–100), eta_seconds, error_message, payload (jsonb), created_at, finished_at
- **subscriptions**: id, user_id, stripe_customer_id, stripe_subscription_id, plan, interval (`month|year`), status, current_period_end
- **trend_videos**: id, platform (`youtube|tiktok|instagram`), external_id, url, title, channel, thumbnail_url, niche, language, duration_seconds, views, views_per_hour, likes, comments, published_at, retention_index (0–100), fetched_at
- **trend_analyses** (Raio-X): id, trend_video_id, sound (jsonb), image (jsonb), structure (jsonb), retention_timeline (jsonb: [{second, retention_pct, marker}]), generated_at
- **niche_patterns**: id, niche, period (`24h|7d|30d`), avg_duration, top_caption_styles (jsonb), trending_sounds (jsonb), top_hooks (jsonb), best_post_times (jsonb), computed_at
- **niche_alerts**: id, user_id, niche, enabled, last_notified_at

### Shapes jsonb do Raio-X (contrato exato)

```jsonc
// trend_analyses.sound
{ "track": "Nome da música", "trackTrending": true, "bpm": 128, "energy": 0.82,
  "soundEffects": ["whoosh", "ding"], "voice": {"wordsPerMinute": 168, "pauses": "estratégicas", "tone": "enérgico"},
  "strategicSilences": [{"atSecond": 12, "durationMs": 800}] }

// trend_analyses.image
{ "cutsPerMinute": 22, "zoomPunches": 6, "dominantPalette": ["#111827", "#F59E0B", "#FFFFFF"],
  "captions": {"present": true, "style": "hormozi", "position": "centro"},
  "onScreenText": true, "lighting": "alta, fundo escuro", "framing": "close" }

// trend_analyses.structure
{ "hookType": "pergunta", "hookText": "Você sabia que...", "narrativeArc": "promessa → prova → virada → CTA",
  "idealDuration": 34, "cta": "comenta EU QUERO", "perfectLoop": true }

// trend_analyses.retention_timeline (um ponto por segundo)
[ {"second": 0, "retentionPct": 100, "marker": "gancho de pergunta"},
  {"second": 3, "retentionPct": 96, "marker": null}, ... ]

// cuts.score_breakdown
{ "hook": 92, "retention": 85, "emotion": 78, "nicheFit": 88 }

// cuts.suggested_sound
{ "track": "Nome", "reason": "som em alta no nicho finanças esta semana", "trendVideoId": "uuid" }
```

## Endpoints REST (prefixo /api/v1)

### Auth
- `POST /auth/register` {email, password, name} → {token, user}
- `POST /auth/login` {email, password} → {token, user}
- `POST /auth/google` {id_token} → {token, user}  // INTEGRAÇÃO PAGA/EXTERNA: Google OAuth
- `POST /auth/password-reset` {email} → 204
- `GET  /auth/me` → user

### Radar Viral
- `GET /radar/trends?niche=&q=&period=24h|7d|30d&language=&min_duration=&max_duration=&platform=` → {items: TrendVideo[]}
- `GET /radar/videos/{id}` → TrendVideo
- `GET /radar/videos/{id}/xray` → TrendAnalysis
- `GET /radar/niches` → {niches: string[]}
- `GET /radar/niches/{niche}/patterns?period=7d` → NichePattern
- `POST /radar/alerts` {niche} / `GET /radar/alerts` / `DELETE /radar/alerts/{id}`
- Ações de integração radar→produção:
  - `POST /radar/videos/{id}/use-sound` {cutId} → aplica som sugerido ao corte
  - `POST /radar/videos/{id}/use-caption-style` {projectId} → aplica preset de legenda
  - `POST /radar/videos/{id}/inspire-cut` {projectId} → job que gera corte inspirado no formato

### Projetos e cortes
- `POST /projects/upload-init` {filename, sizeBytes, contentType} → {uploadId, chunkSize, presignedUrls[]}  // upload em chunks p/ MinIO
- `POST /projects/upload-complete` {uploadId} → Project
- `POST /projects/import-url` {url, quality} → Project (job de import via yt-dlp)
- `GET  /projects/url-preview?url=` → {title, channel, durationSeconds, thumbnailUrl, availableResolutions[]}
- `GET  /projects` / `GET /projects/{id}` / `DELETE /projects/{id}`
- `POST /projects/{id}/generate-cuts` {mode, aggressiveness: 1..5, count} → {jobId}
- `GET  /projects/{id}/cuts` → Cut[]
- `PATCH /cuts/{id}` (edit_state, título, etc.) / `POST /cuts/{id}/regenerate` → Cut

### Render e exportação
- `POST /renders` {cutIds[], resolution, fps, codec (`h264|h265`), preset} → {jobs: Job[]}
- `GET  /renders/{jobId}` → Job (+ downloadUrl, srtUrl, thumbUrl, metaTxtUrl quando done)
- `POST /renders/batch-zip` {jobIds[]} → {zipUrl}

### Dashboard, billing, admin
- `GET  /dashboard/stats` → {minutesProcessed, cutsGenerated, recentProjects[], usageSeries[], nicheHighlights[]}
- `POST /billing/checkout` {plan, interval} → {checkoutUrl}   // INTEGRAÇÃO PAGA: Stripe
- `POST /billing/webhook` (Stripe webhook)
- `GET  /admin/metrics` / `GET /admin/users` / `GET /admin/jobs` (role admin)

## Planos

| Plano | Minutos/mês | Resolução máx. | Marca d'água | Radar | Preço mensal |
|-------|-------------|----------------|--------------|-------|--------------|
| Free | 60 | 720p | sim | limitado (top 5, sem Raio-X completo) | R$ 0 |
| Pro | 600 | 4K | não | completo | R$ 79 (anual R$ 63/mês) |
| Studio | ilimitado | 4K | não | completo + alertas + API | R$ 199 (anual R$ 159/mês) |

## Presets de plataforma (safe zones no editor)

| Preset | Resolução | Duração máx | Safe zone |
|--------|-----------|-------------|-----------|
| TikTok | 1080×1920 (até 2160×3840) | 10 min | 108px topo, 320px rodapé, 120px laterais |
| Reels  | 1080×1920 | 90 s | 220px topo, 420px rodapé |
| Shorts | 1080×1920 | 60 s | 120px topo, 240px rodapé |

## Presets de legenda (8)

`hormozi`, `karaoke`, `neon`, `minimal`, `boldEmoji`, `highlightBox`, `typewriter`, `gradientAnimated`.

## Nichos seed do Radar

`finanças`, `fitness`, `podcast`, `humor`, `educação`, `tecnologia`, `beleza`, `games`.

## Convenções

- UI em pt-BR; código (variáveis/comentários técnicos) em inglês; comentários `// INTEGRAÇÃO PAGA:` marcam pontos de serviços externos (Stripe, OpenAI/Anthropic, Google OAuth, YouTube Data API).
- IDs uuid v4 em string.
- Datas ISO 8601 UTC.
- Erros da API: `{ "error": { "code": string, "message": string } }`.

---

# APÊNDICE — Módulo ESTÚDIO IA (geração de vídeo por IA, estilo Kling)

Novo módulo central: gerar e dirigir vídeo por IA. 8 funções. Todas são
integrações de IA generativa pesada (GPU/API paga) — a plataforma constrói a
UI + o ponto de integração com fallback determinístico de demonstração.

`// INTEGRAÇÃO PAGA: Kling AI API` (ou equivalente Runway/Luma/Pika) marca os pontos.

## Entidade nova: `generations`

- id (uuid), user_id, project_id (nullable), cut_id (nullable)
- function: `text_to_video | image_to_video | extend | frames | motion_brush | lip_sync | camera | effect_template`
- prompt (text, nullable), params (jsonb — específico por função, ver abaixo)
- input_asset_url (nullable), input_asset_url_2 (nullable, p/ frames início/fim)
- status: `queued | running | done | error`, progress (0–100), error_message
- result_url (nullable), thumbnail_url (nullable), duration_seconds, resolution, fps
- model (`kling-v1 | mock`), created_at, finished_at

Progresso em tempo real reutiliza o WebSocket existente `/ws/progress/{job_id}`.

### Shapes de `params` (contrato)

```jsonc
// text_to_video
{ "aspectRatio": "9:16|1:1|16:9|4:5", "duration": 5, "style": "cinematográfico|anime|realista|3D",
  "cameraMovement": "none|zoom_in|orbit|pan_left", "negativePrompt": "" }
// image_to_video
{ "motion": "sutil|moderado|intenso", "duration": 5, "cameraMovement": "none|zoom_in|..." }
// extend
{ "seconds": 4, "direction": "forward|loop" }   // gera continuação / loop perfeito
// frames  (quadro inicial e final)
{ "duration": 5 }                                // usa input_asset_url + input_asset_url_2
// motion_brush
{ "strokes": [ {"path": [[x,y],...], "direction": [dx,dy], "intensity": 0.7} ], "duration": 5 }
// lip_sync
{ "source": "ttsText|audioUrl", "ttsText": "", "voice": "pt-BR-Francisca|...", "language": "pt-BR" }
// camera
{ "moves": [ {"type": "zoom_in|pan_left|orbit|tilt_up|dolly", "startSecond": 0, "endSecond": 3} ] }
// effect_template
{ "template": "explodir|abraco|envelhecer|transformar|derreter|inflar" }
```

## Endpoints REST (prefixo /api/v1/studio)

- `POST /studio/text-to-video`   {prompt, params} → Generation
- `POST /studio/image-to-video`  {inputAssetUrl, prompt?, params} → Generation
- `POST /studio/extend`          {cutId? | generationId?, params} → Generation
- `POST /studio/frames`          {startImageUrl, endImageUrl, params} → Generation
- `POST /studio/motion-brush`    {inputAssetUrl, params} → Generation
- `POST /studio/lip-sync`        {cutId? | inputAssetUrl?, params} → Generation
- `POST /studio/camera`          {cutId? | inputAssetUrl?, params} → Generation
- `POST /studio/effect`          {inputAssetUrl, params} → Generation
- `GET  /studio/generations`     → Generation[]
- `GET  /studio/generations/{id}`→ Generation
- `GET  /studio/effect-templates`→ {templates: [{id, label, thumbnailUrl, previewUrl}]}
- `POST /studio/generations/{id}/to-cut` {projectId?} → cria um Cut a partir da geração (integra com editor/biblioteca)

## Frontend

- Novo item de menu no sidebar do `/app`: **"Estúdio IA"** (`/app/estudio`, ícone `Sparkles` ou `Wand2`), logo após "Novo projeto".
- Página `/app/estudio`: coluna esquerda com as 8 ferramentas (tabs), painel central de configuração + área de resultado/preview, e galeria "Gerações recentes" com status/progresso ao vivo.
- Cada geração concluída tem ações: **"Enviar para o editor"**, **"Salvar na biblioteca"**, **"Usar como capa"**.
- Fallback: sem API, `mock-data.ts` fornece gerações de exemplo e o progresso é simulado no cliente (como a fila de render). Thumbnails/preview via SVG data-URI local.
- Todos os estados (loading/vazio/erro/sucesso), pt-BR, sem botão morto.

---

# REVISÃO 2 — Sem pagamentos/planos · Radar real (keyless) · Geração real (FFmpeg)

Mudança de rumo decidida com o usuário. Vale para front e back.

## A) Remover pagamentos e planos TOTALMENTE

O CortaAí deixa de ser um SaaS com cobrança. Remover por completo:

- **Backend**: router `billing.py` e sua inclusão em `main.py`; `schemas/billing.py`;
  `services/plans.py` (limites por plano); modelo `subscription.py` e a tabela
  `subscriptions` (migration nova que a remove); campos `plan` e
  `minutes_used_month` do modelo `user` (migration + schema + seed); TODOS os gates
  de plano (respostas 402 `upgrade_required`, `studio_free_generation_limit`,
  limites de resolução/minutos/radar) — tudo liberado para todos, sem limite.
  Config: remover `stripe_*` e `studio_free_generation_limit`. Manter auth normal.
- **Frontend**: excluir a rota `/precos`, `components/pricing-section.tsx`, o toggle
  mensal/anual, e qualquer menção a Free/Pro/Studio, cota de minutos, marca d'água
  por plano, badges "Plano X", travas de upgrade. Landing: trocar a seção de planos
  por uma seção de recursos/CTA (sem preço). Dashboard/config: remover barras de
  cota de plano. Tipos/mocks: remover `plan` de `User`.
- Remover do README/`.env.example` as chaves Stripe e a linha de planos.

## B) Radar Viral REAL sem YOUTUBE_API_KEY (via yt-dlp)

`workers/tasks_radar.py` + `services/` passam a buscar tendências reais do YouTube
**sem chave**, usando `yt-dlp` (já é dependência):

- Busca por nicho/palavra-chave: `yt-dlp "ytsearchN:<termo> #shorts"` com
  `--dump-json --flat-playlist` (extrai id, título, canal, duração, views, thumb).
- Enriquecer top-N com `--dump-json` por vídeo (like_count, comment_count, data).
- Calcular `retention_index` com `services/retention.py` (já existe) a partir dos
  números reais (views/hora, like/view, comentário/view).
- Cache em Redis com TTL (ex.: 30 min) por consulta, para não repetir chamadas.
- Offline/sem rede: cair no seed mockado atual (fallback já existente).
- Raio-X (`trend_analyses`): quando não houver LLM, seguir com o gerador
  determinístico atual sobre os dados reais do vídeo (som/imagem/estrutura/curva).
- `config`: remover `youtube_api_key` como requisito; manter opcional/sem uso.

## C) Geração de vídeo REAL com FFmpeg (sem Kling, sem chave)

`services/generative.py` + `workers/tasks_generative.py` param de mockar e passam a
**produzir arquivos .mp4 de verdade** com FFmpeg (já disponível no container/Docker),
salvando no storage (MinIO/local) e devolvendo `result_url` + thumbnail real
(frame extraído do vídeo). Implementar por função (`function`):

- **text_to_video**: clipe tipográfico animado — fundo em gradiente/cor da paleta,
  o `prompt` em texto grande com fade/scale (drawtext), duração/aspect dos params.
- **image_to_video**: anima a imagem de entrada com `zoompan` (Ken Burns) +
  movimento de câmera dos params; duração configurável.
- **frames**: crossfade/morph simples entre `input_asset_url` (início) e
  `input_asset_url_2` (fim) via `xfade`.
- **extend**: prolonga o clipe de origem (loop/`tpad`/boomerang) por `seconds`.
- **motion_brush**: aplica deslocamento/parallax na(s) região(ões) dos `strokes`
  sobre a imagem (aproximação real com crop+overlay animado).
- **camera**: aplica a sequência de `moves` (zoom/pan/tilt) via `zoompan`/`crop`.
- **effect_template**: efeitos reais por template (explodir=scale rápido, derreter=
  wave/displace, etc.) com filtros FFmpeg.
- **lip_sync**: sem modelo real de lip-sync sem chave — gerar clipe com a forma de
  onda/legenda do áudio/TTS sincronizada (aproximação honesta) e comentar no código
  que o lip-sync fotorrealista exigiria um modelo externo (ponto `# INTEGRAÇÃO PAGA`).
- Progresso real por etapas do FFmpeg publicado no WS existente.
- Se o FFmpeg não existir no ambiente de teste, cair em placeholder (mas nos testes,
  verificar que o comando FFmpeg é montado corretamente e, quando `ffmpeg` existir,
  que um .mp4 não-vazio é produzido).

## Resultado esperado
App sem qualquer cobrança/plano; Radar puxando vídeos reais do YouTube sem chave;
Estúdio IA gerando vídeos .mp4 reais localmente. Builds e testes verdes.
