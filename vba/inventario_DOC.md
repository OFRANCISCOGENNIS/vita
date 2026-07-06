# inventario.bas — Documentação completa

Módulo VBA para Excel (`vba/inventario.bas`) que transforma uma base bruta de
inventário (colunas `MAT LIB SAP` / `MAT PRJ CAD`) em um conjunto de
relatórios de auditoria: aderência SAP x Projeto, racionalização NT.006,
preço unitário, alertas críticos e ranking de risco por obra.

**4.340 linhas físicas · 62 procedimentos (Subs/Functions) · 0 erros estruturais** (validado por `vba/tests/vba_lint.py`).

## Como usar

1. Abra a planilha com a base bruta de inventário (deve conter as colunas
   `MAT LIB SAP` e `MAT PRJ CAD` em alguma aba).
2. `Alt+F11` → Inserir → Módulo → Importar `inventario.bas` (ou colar o código).
3. Fechar o editor, `Alt+F8` → `GerarInventario` → Executar.
4. (Opcional) `Alt+F8` → `TestarLogicaInventario` → valida a lógica de negócio.
5. (Opcional) Botão **"Exportar devolucoes"** na aba `RESUMO SAP x PRJ`, ou
   `Alt+F8` → `ExportarDevolucoes`, gera planilha só com os PEP3 reprovados.

## Fluxo de execução (`GerarInventario`)

```
LogInit
  → GarantirConfig            (cria/lê a aba CONFIG; carrega mCfg/mComCrit/mTolAder/mCaboMax)
  → CarregarRegrasScore        (cria/lê a aba REGRAS CLASSIF - motor de score)
  → ValidarBase                (aborta com lista de colunas obrigatorias ausentes)
  → AcharBaseInventario        (localiza a aba com MAT LIB SAP + MAT PRJ CAD)
  → limpa abas de saida antigas
  → ProcessarSAPxPRJ           (etapa isolada: erro nao aborta as demais)
  → ProcessarResumoPEP3
  → ProcessarCOMInventario
  → ProcessarPrecoUnitario
  → ProcessarAlertaCritico     (inclui PU ANOMALO estatistico via IQR)
  → ProcessarRankingRisco
  → ProcessarAuditoriaClassif  (qualidade da classificacao: score + confianca)
  → ProcessarPainelGestor
  → AplicarDesignGlobal
  → AtualizarHistorico
  → ProcessarTendencia         (reincidencia e risco futuro por obra)
  → CriarNomesDefinidos
  → GravarLog                  (aba oculta LOG EXECUCAO)
  → MsgBox final (lista falhas de etapas, se houver)
```

Cada etapa roda com `On Error Resume Next` isolado + `FimEtapa` (registra
sucesso/falha e tempo no log); uma etapa com erro não impede a geração das
demais abas — no fim, o `MsgBox` avisa quais falharam.

## Abas geradas

| Aba | Descrição |
|-----|-----------|
| `PAINEL DO GESTOR` | Visão executiva: KPIs em cartões, ranking de alertas por tipo, drill-down para as demais abas |
| `ANALISE SAP x PRJ` | Aderência SAP x Projeto por item, veredito por PEP3 (APROVADO/REPROVADO), coluna `MOTIVO DEVOLUCAO PEP3` |
| `RESUMO SAP x PRJ` | 1 linha por obra (PEP3): situação, ODs, valor, valor não aderente, família reprovada, motivo. Tabela estruturada (`tblResumoPEP3`) + botão "Exportar devolucoes" |
| `RACIONALIZACAO COM` | Cruza materiais COM com o mapa NT.006 (razão material/âncora) |
| `PRECO UNITARIO` | PU calculado (VALOR/QTD) x faixa MIN/MAX de referência, com status DENTRO/ABAIXO/ACIMA/SEM REFERENCIA |
| `ALERTA CRITICO` | Cards de alertas (UC subvalorizado, material positivo em PEP ODD, preço não encontrado etc.) |
| `RANKING DE RISCO` | Score 0-100 por obra, combinando reprovação, alertas, divergência de PU e COM fora do NT.006 |
| `AUDITORIA CLASSIF` | Qualidade da classificação: FAMILIA da base × família sugerida pelo motor de score, com confiança (%), explicabilidade (tokens e pesos), métricas (taxa de divergência/ambiguidade/revisão manual) e TOP pares de divergência (erros sistêmicos) |
| `TENDENCIA` | Inteligência preditiva do histórico: reincidência de reprovação por obra, tendência (MELHOROU/PIOROU/ESTAVEL) e risco futuro projetado com recomendação |
| `CONFIG` | Parâmetros editáveis (tolerâncias, pesos do ranking, famílias COM críticas) |
| `REGRAS CLASSIF` | Regras ponderadas do motor de classificação (MODO/TOKEN/FAMILIA/PESO) — editáveis pelo usuário sem reprogramar |
| `HISTORICO` | Registro append-only por execução: situação/valor por PEP3 e diff (`NOVO`/`MANTEVE`/`MUDOU`) vs. a execução anterior |
| `LOG EXECUCAO` | Aba oculta com timestamp e duração de cada etapa |
| `TESTES` | Gerada sob demanda por `TestarLogicaInventario`, com o resultado de cada asserção |

## Estruturas de dados

### `tMaterial` (mapa NT.006)

```vba
Private Type tMaterial
    Familia     As String   ' familia NT.006 (CRUZETA, ISOLADOR PILAR, PINO...)
    CodNT006    As String   ' codigo NT.006 (R-02, I-05, F-36...)
    DescrNT006  As String   ' descricao resumida
    EhAncora    As Boolean  ' True = referencia p/ calcular os demais
    AncoraDep   As String   ' familia ancora de que depende (se nao for ancora)
    RazaoMin    As Double   ' razao minima em relacao a ancora
    RazaoMax    As Double   ' razao maxima em relacao a ancora
    DescrRegra  As String   ' texto da regra NT.006
End Type
```

Populado por `CriarMapaNT006` (códigos SAP conhecidos) com fallback por
descrição em `ClassificarDesc` (ver seção abaixo).

### Variáveis de módulo (infra de melhorias)

| Variável | Tipo | Uso |
|---|---|---|
| `mFaixaCache` | Object | cache da faixa de preços externa (evita reabrir arquivo grande a cada chamada) |
| `mStep` | String | etapa atual, usada no diagnóstico de erro |
| `mCfg` | Object | Dictionary CHAVE→valor, carregado da aba CONFIG |
| `mComCrit` | Object | tokens normalizados de família COM crítica (configurável) |
| `mLog` | Collection | linhas do log de execução |
| `mFalhas` | String | acumula descrição das etapas que falharam |
| `mT0` | Double | `Timer` no início da execução |
| `mTolAder` | Double | tolerância de aderência (fração), cacheada da CONFIG |
| `mCaboMax` | Double | comprimento (m) abaixo do qual cabo isolado fica isento de UC |

### Dicionários montados em runtime (principais)

- `aprova` / `pep3Rep` — veredito APROVADO/REPROVADO por PEP4/PEP3 (`ProcessarSAPxPRJ`)
- `pep3RepFam` — família que reprovou cada PEP3 (usada no MOTIVO e na coluna de devolução)
- `precos` / `fx` (`CarregarPrecos`/`CarregarFaixaPrecos`) — preço de referência e faixa MIN/MAX por código

## Mapeamento de colunas esperado na base

Obrigatórias (`ValidarBase` aborta com a lista completa se faltar alguma):
`PEP3NIVEL`, `PEP4NIVEL`, `COD MAT`, `VALOR`, `FAMILIA`, `TIPO`, `SIT MAT`,
`MAT LIB SAP`, `MAT PRJ CAD`.

Opcionais (enriquecem os relatórios): `DESC MAT`, `UND`, `TIPO PEP`.

## Classificação de família por descrição (`ClassificarDesc`)

Fallback usado quando o código SAP não está no mapa NT.006. Percorre uma
cadeia de `ElseIf` por palavra/substring (normalizada via `NormStr`, sem
acento/pontuação). Ordem relevante (casos que dependem de desambiguação
rodam **antes** das regras genéricas):

1. **PINO** (isolador de cruzeta) — checado antes de CRUZETA e excluindo
   "CONECTOR"/"TERM" (para não capturar conector tipo pino de compressão).
2. **PLACA IDENTIFICACAO** — checado antes de POSTE (a placa cita o poste
   onde é fixada, mas não é o poste).
3. Âncoras estruturais: CRUZETA, ISOL SUSPENSAO, HASTE TERRA, CHAVE FUSIVEL,
   CHAVE FACA/SECC, TRAFO, GANCHO OLHAL, SUP PARA-RAIO.
4. Dependentes da cruzeta: ISOLADOR PILAR, MAO FRANCESA, SELA CRUZETA,
   ARRUELA, PORCA, PARAFUSO OLHAL, PARAFUSO.
5. Dependentes de outras âncoras: PARA-RAIO, MANILHA, OLHAL, CONEC HASTE.
6. ESTAI, DPS, **CABO/CONDUTOR** (exclui descrições com "ALCA" — alça é
   acessório de amarração, não o cabo), POSTE, CAIXA (MEDICAO/genérica),
   MEDIDOR, LACRE, ELO FUSIVEL, CINTA POSTE, ARMACAO SEC, ROLDANA, GRAMPO.
7. **CONECTOR** — reconhece "CONECTOR", "CONEX" e as abreviações de
   catálogo "CONEC" e "CON PER" (conector perfurante).
8. LUVA EMENDA, FITA/FECHO, TERMINAL/MUFLA, ESTRIBO, EQUIP MANOBRA, BUCHA,
   REDE COMPACTA.
9. **ALCA PREFORMADA** — reconhece "PREFORM" e a abreviação "PREF".
10. ANEL/LACO/ALCA (rede compacta genérica), ELETRODUTO, FERRAGEM, ARAME.
11. SUPORTE — substring "SUPORTE", e uma regra dedicada para a abreviação
    "SUP" combinada com "CH FACA"/"CHAVE FACA"/"BYPASS"/"BY PASS".

Se nenhuma regra casar, `ClassificarDesc` retorna `False` (item fica sem
classificação automática). Casos reais de abreviação de catálogo que motivaram
os ajustes acima estão documentados em `vba/catalogos/correcoes_familia_2026-07-04.md`.

## Motor de classificação por score (v2)

Além da cadeia determinística `ClassificarDesc`, o módulo tem um **motor de
classificação ponderado** (`ClassificarDescScore`) usado pela aba
`AUDITORIA CLASSIF`:

- **Regras ponderadas**: cada regra é `MODO | TOKEN | FAMILIA | PESO`, onde
  MODO é `P` (palavra inteira), `S` (substring) ou `C` (combo — todos os
  tokens separados por `+` devem estar presentes). ~100 regras embutidas,
  materializadas na aba `REGRAS CLASSIF` na primeira execução e **lidas de lá**
  nas seguintes — o usuário ajusta tokens/pesos sem tocar no código.
- **Score por família**: soma dos pesos das regras que casam com a descrição
  normalizada; vence a família com maior pontuação.
- **Confiança**: `100 × top1 / (top1 + top2)` — 100% quando só uma família
  pontua; cai conforme a segunda colocada se aproxima. Abaixo de
  `CONF_MINIMA` (CONFIG), o material é marcado para revisão manual.
- **Explicabilidade**: a coluna MOTIVOS lista os tokens que pontuaram, ex.:
  `CONECTOR(+60), CONEC(+35), TERM(+25)`.

A `AUDITORIA CLASSIF` compara a FAMILIA da base com a sugerida e agrupa em:
`DIVERGE` (conflito real), `REVISAR (AMBIGUO)` (confiança baixa),
`SEM SUGESTAO` (nenhuma regra casou), `SUGESTAO (BASE GENERICA)` (base traz
catch-all como "MAT. COM") e `CONFERE`. O bloco "TOP PARES DE DIVERGENCIA"
funciona como matriz de confusão acionável: mostra os pares
`família base → família sugerida` mais frequentes (erros sistêmicos).

## Detecção estatística de anomalia de PU

Para materiais **sem faixa de referência** na base de preços, com **5+
lançamentos**, o `ProcessarAlertaCritico` calcula quartis (Q1/Q3) do PU do
próprio material e alerta lançamentos fora de `[Q1 − 1,5×IQR ; Q3 + 1,5×IQR]`
(critério de Tukey, robusto a outliers), respeitando a materialidade mínima
`MIN_DIVERG_RS`. Alerta: `PU ANOMALO (ESTATISTICO)`.

## Regras de negócio principais

- **Aderência SAP x Projeto**: para famílias de condutor/cabo/ramal, compara
  `MAT LIB SAP` x `MAT PRJ CAD` com tolerância `mTolAder` (config
  `TOL_ADERENCIA_PCT`, default 10%); para os demais materiais, usa o campo
  `SIT MAT` (`ADERENTE`/`NAO ADERENTE`).
- **Veredito por PEP3**: PEP4 avaliável (TIPO=UC, ou TIPO=COM com família
  crítica) que não é aderente reprova o PEP4 e, por rollup, todo o PEP3.
  Linhas de um PEP3 reprovado recebem `REPROVADO` mesmo que o item em si
  fosse isento (ex.: cabo isolado curto), e a coluna `MOTIVO DEVOLUCAO PEP3`
  repete o mesmo texto ("Devolvido por divergencia de `<FAMILIA>`") em todas
  as linhas da obra.
- **Cabo isolado curto isento de UC**: `CaboComoCOM` — comprimento abaixo de
  `mCaboMax` (config `CABO_ISOLADO_MAX_M`, default 15m) não reprova o PEP3.
- **Família COM crítica**: `EhComCritico` — lista configurável (`COM_CRITICO`
  na CONFIG, default `CH FUS; PARA RAIO`); só COM dessas famílias reprovam.
- **UC subvalorizado**: alerta se PU < `TOL_SUBVAL` × referência (config,
  default 0,9) e a divergência em R$ ≥ `MIN_DIVERG_RS` (config, default 100).
- **Score de risco por obra** (`ProcessarRankingRisco`): soma ponderada
  (config `PESO_REPROV`/`PESO_ALERTA`/`CAP_ALERTA`/`PESO_PU`/`CAP_PU`/
  `PESO_COM`/`CAP_COM`) de reprovação SAP x PRJ, nº de alertas críticos,
  divergências de PU e itens COM fora do NT.006, capado em 100.

## Chaves da aba CONFIG

| Chave | Default | Uso |
|---|---|---|
| `TOL_ADERENCIA_PCT` | 0,1 | tolerância de aderência SAP x PRJ (fração) |
| `TOL_SUBVAL` | 0,9 | limiar de UC subvalorizado (fator sobre a referência) |
| `MIN_DIVERG_RS` | 100 | materialidade mínima em R$ para o alerta de subvalorização |
| `CABO_ISOLADO_MAX_M` | 15 | comprimento (m) abaixo do qual cabo isolado é isento de UC |
| `CORTE_DIVERG_QTD` | 20 | destaque de divergência de quantidade na ANALISE SAP x PRJ |
| `PESO_REPROV` / `PESO_ALERTA` / `CAP_ALERTA` / `PESO_PU` / `CAP_PU` / `PESO_COM` / `CAP_COM` | 40/4/24/3/18/2/18 | pesos e tetos do score do RANKING DE RISCO |
| `COM_CRITICO` | `CH FUS; PARA RAIO` | famílias COM que reprovam o PEP3 (separadas por `;`) |
| `CONF_MINIMA` | 60 | confiança mínima (%) do motor de score; abaixo disso o material vai para "REVISAR (AMBIGUO)" na AUDITORIA CLASSIF |

## Índice de Subs/Functions (ordem no arquivo)

| Linha | Procedimento | Descrição |
|---|---|---|
| 40 | `CriarMapaNT006()` Function | monta o dicionário COD_SAP → `tMaterial` (âncoras e dependentes NT.006) |
| 135 | `AddMat` Sub | adiciona uma entrada ao mapa NT.006 |
| 151 | `GetMat()` Function | desempacota `tMaterial` a partir da string armazenada no Dictionary |
| 168 | `NormStr()` Function | normaliza texto: upper-case, remove acentos/pontuação |
| 195 | `NormCod()` Function | normaliza código (remove ".0", trata notação científica) |
| 209 | `ToNum()` Function | converte Variant para Double com fallback 0 |
| **220** | **`GerarInventario()` Sub** | **ponto de entrada público** — orquestra todo o fluxo |
| 382 | `ProcessarSAPxPRJ` Sub | gera a aba ANALISE SAP x PRJ (aderência, veredito por PEP3, cards) |
| 828 | `CaboComoCOM()` Function | True se cabo isolado curto (isento de UC) |
| 840 | `EhComCritico()` Function | True se família COM é crítica (config `COM_CRITICO`) |
| 857 | `TemPalavra()` Function | match por palavra inteira (evita falso positivo de substring) |
| 875 | `ClassificarDesc()` Function | fallback determinístico de classificação por descrição (ver seção acima) |
| 1091 | `FmtDif()` Function | formata diferença SAP-PRJ com sinal e percentual |
| 1107 | `EhAderente()` Function | regra de aderência (tolerância p/ condutor/cabo/ramal; senão usa SIT MAT) |
| 1124 | `FmtKPI()` Function | formata valor em R$ / mil / MM |
| 1138 | `EhUnidadeInteira()` Function | True se a unidade é contável (não decimal) |
| 1148 | `ProcessarCOMInventario` Sub | gera a aba RACIONALIZACAO COM (razão material x NT.006) |
| 1436 | `CabecalhoRacioNT` Sub | desenha o cabeçalho da RACIONALIZACAO COM |
| 1464 | `CoresStatusRacio` Sub | cores/ícone por status de racionalização |
| 1481 | `FormatarLinhasRacioNT` Sub | formatação em lote (base + blocos por status) |
| 1530 | `QuickSortStr` Sub | quicksort de array de strings (ordenação da racionalização) |
| 1546 | `FormatarColunasRacioNT` Sub | larguras de coluna da RACIONALIZACAO COM |
| 1555 | `ProcessarAlertaCritico` Sub | gera a aba ALERTA CRITICO (inclui PU ANOMALO estatístico via IQR) |
| 2050 | `Val0()` Function | converte Variant para Double (0 se vazio/erro) |
| 2058 | `CarregarPrecos()` Function | carrega preço de referência por código (aba PRECOS, ou ponto médio da faixa) |
| 2103 | `CaminhoBasePrecos()` Function | localiza o arquivo externo BASE DE PRECOS.xlsx em pastas padrão |
| 2137 | `CarregarFaixaPrecos()` Function | carrega faixa MIN/MAX de preço (aba interna ou arquivo externo) |
| 2211 | `ProcessarPrecoUnitario` Sub | gera a aba PRECO UNITARIO (PU x faixa, status, TIPO OD) |
| 2399 | `ProcessarRankingRisco` Sub | gera a aba RANKING DE RISCO (score 0-100 por obra) |
| 2692 | `CorAcento()` Function | cor de destaque (guia da aba) por nome de aba |
| 2706 | `InserirBarraNav` Sub | desenha a barra de navegação clicável no topo das abas |
| 2734 | `BotaoNav` Sub | desenha um botão individual da barra de navegação |
| 2766 | `AppendContagem` Sub | acrescenta contador dinâmico ao título de uma aba |
| 2783 | `LinkCard` Sub | transforma um card do painel em hyperlink (drill-down) |
| 2799 | `AplicarDesignGlobal` Sub | identidade visual unificada (guias, navegação, contadores, drill-down) |
| 2913 | `AcharBaseInventario()` Function | localiza a aba com `MAT LIB SAP` + `MAT PRJ CAD` |
| 2948 | `ProcessarPainelGestor()` Function | gera a aba PAINEL DO GESTOR (KPIs, ranking de alertas) |
| 3148 | `CardGestor` Sub | desenha um cartão de KPI no painel |
| 3177 | `FimEtapa` Sub | registra sucesso/falha + tempo de uma etapa no log (erro granular) |
| 3187 | `GarantirConfig` Sub | cria/lê a aba CONFIG; popula `mCfg`/`mComCrit`/`mTolAder`/`mCaboMax` |
| 3251 | `CfgS()` Function | lê valor string da CONFIG (com default) |
| 3260 | `CfgD()` Function | lê valor numérico da CONFIG (com default) |
| 3268 | `LogInit` Sub | inicializa o log de execução (`mLog`, `mT0`) |
| 3274 | `LogAdd` Sub | adiciona uma linha ao log em memória |
| 3279 | `GravarLog` Sub | grava o log na aba oculta LOG EXECUCAO |
| 3306 | `ValidarBase()` Function | retorna a lista de colunas obrigatórias ausentes na base |
| 3325 | `MotivoFamilia()` Function | extrai o nome da família do texto de motivo de devolução |
| 3331 | `ProcessarResumoPEP3` Sub | gera a aba RESUMO SAP x PRJ (1 linha/obra) + botão de exportação |
| 3481 | `ExportarDevolucoes()` Sub | exporta os PEP3 reprovados para uma nova planilha |
| 3530 | `AtualizarHistorico` Sub | grava execução atual na aba HISTORICO e sinaliza mudanças vs. anterior |
| 3588 | `CriarNomesDefinidos` Sub | cria os nomes definidos (`dadosAnalise`, `dadosPrecoUnitario`, `dadosRanking`) |
| 3594 | `DefinirNome` Sub | helper que resolve o range e cria um nome definido |
| **3614** | **`TestarLogicaInventario()` Sub** | **testes de lógica de negócio** (roda dentro do Excel, aba TESTES) |
| 3703 | `RegTest` Sub | helper que registra o resultado de uma asserção |
| 3715 | `RegrasScoreEmbutidas()` Function | regras ponderadas embutidas do motor de score (MODO\|TOKEN\|FAMILIA\|PESO) |
| 3762 | `CarregarRegrasEmbutidas` Sub | carrega as regras embutidas para os arrays do módulo |
| 3781 | `CarregarRegrasScore` Sub | cria/lê a aba REGRAS CLASSIF (regras editáveis pelo usuário) |
| 3834 | `ClassificarDescScore()` Function | motor de score: família vencedora + confiança (%) + explicabilidade |
| 3890 | `ProcessarAuditoriaClassif` Sub | gera a aba AUDITORIA CLASSIF (métricas de qualidade + pares de divergência) |
| 4148 | `ProcessarTendencia` Sub | gera a aba TENDENCIA (reincidência, tendência e risco futuro por obra) |
| 4312 | `QuickSortDbl` Sub | quicksort de array de doubles (estatística de PU) |
| 4329 | `Percentil()` Function | percentil com interpolação linear (Q1/mediana/Q3 p/ IQR) |

## Testes

- **Estrutural (fora do Excel)**: `python3 vba/tests/vba_lint.py vba/inventario.bas`
  — balanceamento de blocos, aspas, procedimentos duplicados, `Call` não
  resolvido, `Option Explicit`. Ver `vba/tests/README.md`.
- **Lógica de negócio (dentro do Excel)**: `Alt+F8` → `TestarLogicaInventario`
  — asserções sobre `EhComCritico`, `CaboComoCOM`, `EhAderente`,
  `EhUnidadeInteira`, `GetMat`/`CriarMapaNT006` e `ClassificarDesc` (casos
  reais de descrição abreviada). Resultado em `MsgBox` + aba `TESTES`.

## Limitações conhecidas

- `ClassificarDesc` é um fallback por substring/palavra: descrições muito
  abreviadas ou ambíguas (ex.: "PINO" aparecendo tanto em pino isolador
  quanto em conector tipo pino) exigem regras específicas — ver seção de
  classificação acima e `vba/catalogos/correcoes_familia_2026-07-04.md`.
- `CaminhoBasePrecos` procura o arquivo externo em pastas fixas
  (OneDrive/Desktop do usuário); se não encontrar, cai no ponto médio da
  faixa ou pede seleção manual conforme o fluxo de `CarregarFaixaPrecos`.
- Sem Excel/VBA neste ambiente de desenvolvimento — toda validação é
  estática (lint) ou por simulação; a lógica de negócio deve ser confirmada
  rodando `GerarInventario` + `TestarLogicaInventario` numa base real.
