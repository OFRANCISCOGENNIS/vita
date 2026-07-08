---
name: token-economy
description: Modo de máxima economia de tokens do Claude Code. Use quando o usuário pedir respostas curtas, economizar tokens/custo, "modo econômico", reduzir contexto, ou ao trabalhar em arquivos grandes (ex. vba/AnaliseCKCP_OTIMIZADO.bas, 6k+ linhas). Corta verbosidade e impõe padrões de leitura/busca/edição que evitam carregar conteúdo desnecessário no contexto.
---

# Token Economy

Objetivo: gastar o mínimo de tokens de entrada (contexto) e saída (resposta) que ainda resolve a tarefa. Entrada domina o custo — a maior alavanca é NÃO trazer conteúdo para o contexto.

## Saída (resposta ao usuário)

- Menor resposta que resolve. Sem intro, sem resumo final, sem eco da pergunta, sem "vou fazer X".
- Sem listas/negrito/cabeçalhos salvo indispensável. Sem exemplos salvo pedido.
- Não ofereça ajuda extra. Terminou = 1 frase.
- Ambíguo → UMA pergunta curta (AskUserQuestion), nunca hipóteses longas.
- Código citado: só o trecho + 1 linha de contexto. Referencie por `arquivo:linha` em vez de colar blocos.

## Entrada (o que entra no contexto) — regras duras

1. Arquivo >200 linhas: PROIBIDO Read sem `offset`/`limit`. Localize antes com Grep (`output_mode:"content"`, `-n`, `head_limit:20`), depois Read só a faixa (limit ≤ 80).
2. Grep em 2 fases: `files_with_matches` → conteúdo só no arquivo certo. Sempre `head_limit`. Use `-o` quando só o match interessa.
3. `.bas` grande: `scripts/vba_index.sh [arquivo] [filtro]` dá nome+linha de cada Sub/Function; `scripts/vba_sub.sh Nome` extrai só o corpo de uma rotina. Nunca leia o módulo inteiro.
4. Bash: toda saída potencialmente longa termina em `| head -N` ou filtro (`wc -l`, `grep -c`, `cut`). Nunca `cat` de arquivo — use os tools.
5. Nunca re-leia arquivo recém-editado/escrito para conferir; o harness rastreia o estado.
6. Não repita no chat conteúdo que já está num tool result — referencie.
7. Não re-derive fatos já estabelecidos na conversa.

## Edições

- Edit cirúrgico: old/new mínimos e únicos. `replace_all` para renomeações. Jamais Write de arquivo inteiro para mudar poucas linhas.
- Agrupe edições no mesmo arquivo num turno; chamadas independentes em paralelo (1 bloco).

## Delegação e contexto

- Busca ampla/incerta em muitos arquivos → subagente `Explore` (devolve só a conclusão; dumps ficam fora do seu contexto).
- Tarefa isolada e pesada em leitura → subagente, se o usuário permitir.
- Resultado intermediário volumoso que será reusado → grave em arquivo no scratchpad e referencie o caminho, não recole no chat.

## Anti-padrões (nunca)

- "Ler para entender o projeto" varrendo arquivos: use CLAUDE.md + índice + grep dirigido.
- Reexecutar comando só para reformatar saída já obtida.
- Listar diretório inteiro quando um Glob com padrão resolve.
- Verificação redundante (build+teste+lint) quando 1 checagem prova a mudança.

## Medição real

`scripts/token_report.py [dir_transcripts]` lê os JSONL de `~/.claude/projects/<projeto>/` e mostra tokens reais por modelo (input/cache/output), chamadas por tool e os tool results mais pesados — use para provar onde a sessão gastou e atacar a origem. Lembre: um tool result pesado reentra no contexto de todos os turnos seguintes.

## Gatilho mental

Antes de qualquer tool call: "isso vai trazer >100 linhas ao contexto? existe forma de obter só a resposta?" Se sim, refine primeiro.
