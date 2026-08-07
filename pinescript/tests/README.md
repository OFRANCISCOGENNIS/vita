# Testes — QUANT OPS

Suíte de fumaça (smoke tests) que dirige o simulador num navegador headless
(Chromium via Playwright) e verifica as principais funcionalidades. Roda 100%
**offline** usando o modo Simulado — não depende de Binance/Yahoo.

## Como rodar

```bash
cd pinescript
node build_standalone.js      # gera o Simulador_Standalone.html a partir de src/
node tests/run.mjs            # testa o standalone (sai com código != 0 se falhar)
```

Para testar outro arquivo:

```bash
node tests/run.mjs caminho/para/arquivo.html
```

## O que é verificado

1. Checklist de moedas muda entre cripto (15) e forex (24)
2. MACD + Bollinger entram na confluência
3. IA otimiza (validação robusta) e indexa o cache por regime
4. Verificador automático marca WIN/LOSS e mostra o placar real
5. Selos ✓/✗ aparecem no Registro
6. Tema claro/escuro (atalho `T`)
7. Painel de ajuda abre/fecha (atalho `?` / `Esc`)
8. Atalho `C` recolhe os controles
9. Manifest do PWA presente
10. Nenhum erro de JavaScript no console

## Requisitos

- Playwright + Chromium instalados. No ambiente do Claude Code on the web eles já
  estão disponíveis (`NODE_PATH` aponta para os módulos globais e o Chromium fica
  em `PLAYWRIGHT_BROWSERS_PATH`). Fora dele: `npm i -D playwright && npx playwright install chromium`.

## Estrutura do código-fonte

O app é editado em `pinescript/src/*.js` (módulos em ordem de execução). O
`build_standalone.js` concatena esses arquivos, regenera `app.js` (bundle usado
pela versão modular `index.html`), minifica e embute tudo no
`Simulador_Standalone.html`. **Edite `src/`, não o `app.js`** (ele é gerado).
