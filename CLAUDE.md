# AnaliseCKCP — Análise de Custos CKCP RS2

Módulo VBA para Excel que transforma o export bruto do SAP (CKCP) em relatórios de análise de custo de obras de distribuição elétrica.

Fonte: `vba/AnaliseCKCP_OTIMIZADO.bas` (6.152 linhas, 131 rotinas). Entrada: `GerarRelatorio` (Alt+F8). Gera 21 abas (PAINEL EXECUTIVO, RAZAO CJ, MATERIAL vs SERVICO, ANALISE DE CA, ALERTAS CRITICOS, CONFIG, etc).

**Documentação completa** (fluxo de execução, dicionários de catálogos, tipo tItem, mapeamento de colunas, paleta de cores, catálogos externos, regras de negócio): `docs/REFERENCIA_COMPLETA.md` — leia POR SEÇÃO via Grep quando precisar, nunca inteiro.

## Fatos que você mais vai precisar

- Dados em memória: `dados` (array 2D), `nLin`; catálogos em Dictionaries (`dCatMat`, `dCatSrv`, `dCatCC`, `dCabo`, `dCombo`, `dTipoCls`, `dDescSrv`, `dCfg`).
- Vereditos ODI compartilhados via `dMvSVerd`/`dMvSFamNC`/`dMvSDif` (calculados em `Gerar_MaterialVsServico`, lidos em `Gerar_PainelExecutivo`).
- Sufixo PEP: `.I`=ODI, `.D`=ODD, `.M`=ODM, outro=OUTRO. Veredito ODI: APROVADO se todas as famílias (CLS2) aderentes.
- Overrides fixos: serviços `5500000582` e `5500000575` forçam `CLS2="COND PROT"`.
- `ClassificacaoPendente`: CLS3 vazio ou qualquer nível = "CLASSIFICAR".

## Economia de tokens (obrigatório)

Siga SEMPRE `.claude/skills/token-economy/SKILL.md`: respostas mínimas; nunca ler o `.bas` inteiro — use `.claude/skills/token-economy/scripts/vba_index.sh`, `vba_sub.sh` e `brain_server.py explain/path` (call graph); Grep 2 fases com `head_limit`; Read só com `offset`/`limit`; edições cirúrgicas; fatos reusáveis via `mem.sh`. Hook PreToolUse (`.claude/hooks/token_guard.py`) bloqueia violações.
