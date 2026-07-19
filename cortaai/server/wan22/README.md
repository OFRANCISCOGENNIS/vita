# CortaAí × Wan2.2 — gerar vídeo por IA (self-host, opcional)

Integra o [Wan2.2](https://github.com/Wan-Video/Wan2.2) (modelo aberto de
geração de vídeo da Alibaba, licença Apache 2.0) ao CortaAí. O app continua
100% no navegador; **este servidor roda na SUA máquina/servidor com GPU** —
ninguém hospeda por você e o site publicado funciona normalmente sem ele.

## O que você precisa (honesto)

| Modelo | Tarefa | VRAM mínima | Exemplo de GPU |
|--------|--------|-------------|----------------|
| `Wan2.2-TI2V-5B` (**recomendado**) | texto→vídeo E imagem→vídeo, 720P@24fps | ~24 GB | RTX 4090 |
| `Wan2.2-T2V-A14B` | texto→vídeo 480P/720P | ~80 GB | A100/H100 |
| `Wan2.2-I2V-A14B` | imagem→vídeo 480P/720P | ~80 GB | A100/H100 |

Sem GPU dessas, o Wan2.2 não roda — não há como "dar um jeito" no navegador.
Cada vídeo (~5 s) leva alguns minutos mesmo numa 4090.

## Instalação

```bash
# 1) O Wan2.2 (código + dependências; requer torch >= 2.4.0)
git clone https://github.com/Wan-Video/Wan2.2.git
cd Wan2.2
pip install -r requirements.txt

# 2) Os pesos (recomendado: TI2V-5B, ~17 GB)
pip install "huggingface_hub[cli]"
huggingface-cli download Wan-AI/Wan2.2-TI2V-5B --local-dir ./Wan2.2-TI2V-5B

# 3) Este wrapper
cd ..
pip install -r cortaai/server/wan22/requirements.txt
```

## Rodar

```bash
WAN22_DIR=./Wan2.2 \
ALLOWED_ORIGIN=https://ofranciscogennis.github.io \
python cortaai/server/wan22/server.py
# → http://localhost:8787/api/health
```

Depois, no CortaAí: **Gerar vídeo (IA)** → cole a URL do servidor (ex.
`http://localhost:8787`) → **Testar conexão**. Para usar de outro aparelho,
exponha a porta (ex. [Tailscale](https://tailscale.com) ou um túnel HTTPS).

## Variáveis de ambiente

| Variável | Padrão | Para quê |
|----------|--------|----------|
| `WAN22_DIR` | `./Wan2.2` | pasta do clone do Wan2.2 |
| `WAN22_CKPT_DIR` | `$WAN22_DIR/Wan2.2-TI2V-5B` | pasta dos pesos |
| `WAN22_TASK` | `ti2v-5B` | `ti2v-5B` \| `t2v-A14B` \| `i2v-A14B` |
| `WAN22_SIZE` | `1280*704` | tamanho padrão |
| `WAN22_EXTRA_ARGS` | `--offload_model True --convert_model_dtype --t5_cpu` | flags extras do `generate.py` |
| `WAN22_PYTHON` | `python` | python do venv do Wan2.2 |
| `ALLOWED_ORIGIN` | `*` | origem do frontend (CORS) |
| `PORT` | `8787` | porta |

## API

- `GET /api/health` → `{ ok, aiEnabled, service: "cortaai-wan22", features, model }`
- `POST /api/generate-video` `{ prompt, imageDataUrl?, size? }` → `{ jobId }`
  (409 se a GPU já está ocupada; 501 se o Wan2.2 não está instalado)
- `GET /api/jobs/{id}` → `{ status: queued|running|done|error, error?, logTail }`
- `GET /api/jobs/{id}/video` → o MP4 gerado

O frontend também continua compatível com o servidor Node ao lado
(`cortaai/server`, via Replicate), que responde `{ url }` direto.
