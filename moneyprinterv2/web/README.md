# Painel web do MoneyPrinterV2

Dashboard que substitui o menu de terminal, operando sobre os mesmos dados do
CLI (`.mp/*.json` e `config.json`): contas criadas aqui aparecem no menu de
terminal e vice-versa.

## Rodando

```bash
pip install -r web/requirements.txt
uvicorn web.server:app --port 8000
```

Abra <http://127.0.0.1:8000>. A documentação interativa da API fica em
`/api/docs`.

Se `config.json` não existir, o servidor cria um a partir de
`config.example.json` na primeira subida.

## O que dá para fazer

- **Painel** — contagem de contas, vídeos, posts e produtos + status do Ollama.
- **YouTube / Twitter** — listar, criar e remover contas.
- **Afiliados** — listar e cadastrar produtos vinculados a uma conta Twitter.
- **Config** — visualizar `config.json` com segredos mascarados.
- **Jobs** — `POST /api/jobs/{provider}/{account_id}` dispara a mesma geração
  usada pelo agendador do CLI (`src/cron.py`); exige Ollama acessível.
