# CortaAí — Servidor de IA pesada (opcional)

O CortaAí funciona **100% no navegador** e não precisa deste servidor para
nada do dia a dia — editar vídeo e foto, exportar, e até a **IA leve** (remover
fundo) rodam no seu aparelho, sem servidor e sem custo.

Este servidor existe só para os recursos que **não cabem no navegador** porque
exigem GPU e modelos gigantes:

- Gerar vídeo por IA (texto → vídeo)
- (espaço para: super-resolução pesada, expansão/remix por IA…)

> ⚠️ **Ninguém hospeda isso por você.** Você sobe num provedor de sua escolha e
> paga a inferência. Sem uma chave configurada, os endpoints de IA respondem
> `501` (não configurado) e o app continua funcionando normalmente sem eles.

## Rodar localmente

```bash
cd cortaai/server
npm install
REPLICATE_API_TOKEN=seu_token VIDEO_MODEL_VERSION=versao_do_modelo npm start
# → http://localhost:8787/api/health
```

## Variáveis de ambiente

| Variável | Para quê |
|----------|----------|
| `PORT` | Porta (padrão 8787) |
| `ALLOWED_ORIGIN` | Origem do frontend, ex.: `https://ofranciscogennis.github.io` |
| `REPLICATE_API_TOKEN` | Token do [Replicate](https://replicate.com) — habilita a IA |
| `VIDEO_MODEL_VERSION` | Versão do modelo de vídeo no Replicate |

## Deploy (exemplo: Railway)

1. Crie um projeto no [Railway](https://railway.app) apontando para `cortaai/server`.
2. Em **Variables**, adicione `REPLICATE_API_TOKEN`, `VIDEO_MODEL_VERSION` e
   `ALLOWED_ORIGIN=https://ofranciscogennis.github.io`.
3. Deploy. O Railway te dá uma URL pública (ex.: `https://cortaai-ai.up.railway.app`).
4. No frontend, defina `NEXT_PUBLIC_AI_SERVER_URL` com essa URL e rebuild — o
   app passa a mostrar os botões de IA pesada quando `/api/health` responder
   `aiEnabled: true`.

## Endpoints

- `GET /api/health` → `{ ok, aiEnabled, features }`
- `POST /api/generate-video` `{ prompt, seconds }` → `{ url }` (501 se sem chave/modelo)

## Custo e privacidade

A inferência é cobrada pelo provedor (Replicate/fal/etc.) por uso. As imagens/
prompts enviados ao endpoint saem do aparelho do usuário para o seu servidor e
de lá para o provedor — deixe isso claro na sua política de privacidade.
