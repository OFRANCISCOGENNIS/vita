# MoneyPrinterV2 — auditoria e evolução

Trabalho feito sobre um clone de [FujiwaraChoki/MoneyPrinterV2](https://github.com/FujiwaraChoki/MoneyPrinterV2)
(base: commit `5192af8`). Como aquele repositório é de terceiros, o resultado
está preservado aqui em duas formas equivalentes:

- **`patches/`** — commits prontos para aplicar no clone com `git am`:

  ```bash
  git clone https://github.com/FujiwaraChoki/MoneyPrinterV2.git
  cd MoneyPrinterV2
  git am /caminho/para/moneyprinterv2/patches/*.patch
  ```

- **`src/` e `web/`** — cópia dos arquivos finais, para consulta direta ou
  cópia manual por cima do clone.

## O que foi feito

### 1. Correções de robustez (`src/cache.py`, `src/config.py`)

- **`cache.py`**: o ciclo ler-modificar-escrever dos JSONs de conta em `.mp/`
  não tinha nenhuma proteção — dois processos concorrentes (ex.: dois cron
  jobs no mesmo minuto) perdiam escritas ou corrompiam o arquivo. Agora todo
  ciclo roda sob um lock de arquivo entre processos e a escrita é atômica
  (arquivo temporário + `os.replace`). Verificado com 12 processos × 40
  escritas simultâneas: 480/480 contas persistidas, JSON íntegro.
- **`config.py`**: cada um dos 30+ getters reabria e re-parseava
  `config.json` a cada chamada. Agora o arquivo é parseado uma vez e cacheado
  em memória, invalidando por (mtime, size) — 3.000 chamadas de getter
  passaram de 3.000 leituras de disco para 0, e edições no arquivo continuam
  sendo detectadas. O import de `srt_equalizer` virou lazy para não exigir a
  toolchain de legendas em consumidores que só usam config.

### 2. Painel web (`web/`)

Dashboard FastAPI + página única que substitui o menu de terminal, operando
sobre os mesmos dados do CLI (`.mp/*.json` e `config.json`):

```bash
pip install -r web/requirements.txt
uvicorn web.server:app --port 8000   # a partir da raiz do MoneyPrinterV2
```

- Painel com contadores e status do Ollama
- CRUD de contas YouTube/Twitter e produtos de afiliado
- Visualização de `config.json` com segredos mascarados
- `POST /api/jobs/{provider}/{account_id}` dispara a mesma geração do
  agendador do CLI (`src/cron.py`)
- Docs interativas em `/api/docs`

Testado de ponta a ponta: CRUD completo via API (201/204/404/422/503) e
frontend renderizado em navegador real.

### 3. Blueprint estratégico

A auditoria completa (10 dimensões: arquitetura, IA, conteúdo, tendências,
monetização, analytics, segurança, UX, moat e roadmap) com as 50 melhorias
priorizadas foi entregue como artifact "PRENSA" na sessão de trabalho.
