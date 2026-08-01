---
name: token-economy
description: Modo de máxima economia de tokens do Claude Code (princípios Karpathy/LLM-OS). Use quando o usuário pedir respostas curtas, economizar tokens/custo, "modo econômico", reduzir contexto, ou ao trabalhar em arquivos grandes (ex. vba/AnaliseCKCP_OTIMIZADO.bas, 6k+ linhas).
---

# Token Economy — modelo mental LLM-OS (Karpathy)

O modelo é a CPU; o contexto é a RAM — pequena, cara, e tudo que entra nela é
re-pago em TODOS os turnos seguintes. Disco (arquivos) é quase grátis. Logo:
**compute em disco, traga ao contexto só o resultado destilado.**

## Princípios

1. RAM cara, disco barato. Saída volumosa → arquivo no scratchpad; contexto recebe só o caminho + 3 linhas de conclusão.
2. Retrieval > stuffing. Nunca "ler para entender": índice + grep dirigido + Read de faixa. Um token que não entra vale mais que dez comprimidos depois.
3. Memória destilada. Fato/decisão que será reusado → `scripts/mem.sh add "..."` (grava em `.claude/MEMORY.md`); recupere com `mem.sh get [filtro]`. Não re-derive nem re-explique o que já está anotado.
4. Cache é física, não mágica. O prompt cache invalida em qualquer mudança a montante (trocar modelo, editar system prompt). Não provoque invalidação à toa; agrupe trabalho no mesmo modelo/sessão.
5. Compressão sem perda primeiro. Corte o que não muda a decisão do leitor; o que ficar, escreva claro. Fragmentos ilegíveis que forçam re-pergunta custam mais que a frase inteira.
6. Meça, não ache. `scripts/token_report.py` lê os transcripts e mostra tokens reais por modelo/tool e os results mais pesados. Ataque o top da lista, não a intuição.

## Regras duras de entrada

- Arquivo >200 linhas: Read SEMPRE com `offset`/`limit` (≤300). Antes, localize com Grep (`output_mode:"content"`, `-n`, `head_limit:20`).
- Grep em 2 fases: `files_with_matches` → conteúdo só no arquivo certo. `-o` quando só o match interessa.
- `.bas` grande: `scripts/vba_index.sh [arq] [filtro]` (nome+linha por rotina) e `scripts/vba_sub.sh Nome` (só o corpo). Jamais o módulo inteiro.
- Bash: saída longa sempre filtrada (`| head`, `wc -l`, `cut`). Nada de `cat`/`grep`/`find` cru — hook bloqueia.
- Nunca re-ler arquivo recém-editado; nunca recolar no chat o que já está num tool result.

## Saída

- Menor resposta que resolve; sem intro, resumo final, eco da pergunta ou "vou fazer X".
- Sem listas/negrito/cabeçalhos salvo indispensável; exemplos só se pedidos.
- Código: trecho + 1 linha de contexto; referencie `arquivo:linha` em vez de colar.
- Ambíguo → UMA pergunta curta.

## Edições e delegação

- Edit cirúrgico, `replace_all` para renomeações; jamais Write de arquivo inteiro por poucas linhas.
- Independentes em paralelo (1 bloco); busca ampla/incerta → subagente Explore (dumps ficam fora do seu contexto).

## Cérebro (grafo estilo Obsidian)

`python3 scripts/brain_server.py [porta]` sobe http://localhost:8765 com o grafo interativo: notas de `.claude/brain/*.md` (+ MEMORY.md) via `[[wikilinks]]`, menções a rotinas do `.bas`, e o grafo de chamadas caller→callee extraído do próprio código. Arestas com proveniência (sólida=EXTRACTED, tracejada=INFERRED), cor=comunidade, busca de caminho na UI.

CLI sem navegador (barato em tokens — use no lugar de ler código para rastrear fluxo):
- `brain_server.py explain Gerar_MaterialVsServico` → fonte+linha, grau, conexões com direção/proveniência
- `brain_server.py path "Nota A" RotinaB` → cadeia mais curta entre dois nós

Destile pesquisas em notas curtas em `.claude/brain/` — vira memória navegável entre sessões.

## Gatilho mental

Antes de cada tool call: "isso traz >100 linhas à RAM? dá para obter só a resposta via script/filtro/disco?" Se sim, refine primeiro.
