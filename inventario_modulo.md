# Módulo VBA — `inventario.bas`

> Documentação técnica completa para leitura antes de qualquer ajuste.

---

## 1. Visão Geral

Módulo VBA (Excel) que gera análise inteligente de inventário de materiais para **redes de distribuição elétrica 15 kV** seguindo a norma **NT.006 / NT.018 Equatorial Energia**.

A partir de uma aba-base existente no workbook, o código apaga as abas de saída anteriores e recria **6 abas-relatório** com formatação executiva.

**Ponto de entrada único:** `GerarInventario()` (linha 209).

---

## 2. Estrutura do Arquivo

| Linha | Elemento | Função |
|-------|----------|--------|
| 1–8 | Declarações de módulo | Cache de preços, step de diagnóstico, constantes de tolerância |
| 17–26 | `Type tMaterial` | Estrutura de dados por material NT.006 |
| 29–122 | `CriarMapaNT006()` | Dicionário fixo código SAP → regra NT.006 |
| 124–136 | `AddMat` | Helper interno de `CriarMapaNT006` |
| 140–152 | `GetMat` | Desempacota `tMaterial` de string no Dictionary |
| 157–196 | `NormStr` / `NormCod` | Normalização de strings e códigos SAP |
| 198–204 | `ToNum` / `Val0` | Conversão segura para Double |
| 209–295 | `GerarInventario` | **Orquestrador principal** |
| 298–729 | `ProcessarSAPxPRJ` | Aba "ANALISE SAP x PRJ" |
| 732–966 | Funções auxiliares de classificação | `CaboComoCOM`, `EhComCritico`, `TemPalavra`, `ClassificarDesc` |
| 970–1024 | Funções de formatação / lógica | `FmtDif`, `EhAderente`, `FmtKPI`, `EhUnidadeInteira` |
| 1026–1310 | `ProcessarCOMInventario` | Aba "RACIONALIZACAO COM" |
| 1312–1401 | Helpers de layout COM | `CabecalhoRacioNT`, `EscreverLinhaRacioNT`, `FormatarColunasRacioNT` |
| 1402–1799 | `ProcessarAlertaCritico` | Aba "ALERTA CRITICO" |
| 1801–1955 | Preços | `Val0`, `CarregarPrecos`, `CaminhoBasePrecos`, `CarregarFaixaPrecos` |
| 1960–2126 | `ProcessarPrecoUnitario` | Aba "PRECO UNITARIO" |
| 2127–2381 | `ProcessarRankingRisco` | Aba "RANKING DE RISCO" |
| 2393–2605 | Design global | `CorAcento`, `InserirBarraNav`, `BotaoNav`, `AppendContagem`, `LinkCard`, `AplicarDesignGlobal` |
| 2608–2637 | `AcharBaseInventario` | Localiza a aba de dados pelo cabeçalho |
| 2643–2836 | `ProcessarPainelGestor` | Aba "PAINEL DO GESTOR" |
| 2839–2861 | `CardGestor` | Desenha um card de KPI (2 col × 3 lin) |

---

## 3. Fluxo de Execução

```
GerarInventario()
│
├── AcharBaseInventario()          → detecta aba com "MAT LIB SAP" e "MAT PRJ CAD"
│
├── [Deleta abas antigas]
│
├── ProcessarSAPxPRJ()             → aba "ANALISE SAP x PRJ"
├── ProcessarCOMInventario()       → aba "RACIONALIZACAO COM"
├── ProcessarPrecoUnitario()       → aba "PRECO UNITARIO"
├── ProcessarAlertaCritico()       → aba "ALERTA CRITICO"
├── ProcessarRankingRisco()        → aba "RANKING DE RISCO"
├── ProcessarPainelGestor()        → aba "PAINEL DO GESTOR" (1ª aba, criada por último)
│
└── AplicarDesignGlobal()          → cores de guia, barra de navegação, drill-down
```

---

## 4. Abas Geradas

### 4.1 PAINEL DO GESTOR
- Visão executiva com 8 cards de KPI dispostos em 2 linhas de 4.
- **Linha 1 de cards (linha 4):** Valor total da obra · PEPs analisados · PEPs aprovados · PEPs reprovados.
- **Linha 2 de cards (linha 8):** Alertas críticos · Divergências de preço · Sobrepreço potencial · Valor em risco.
- Ranking de alertas por tipo com mini-barras de bloco (█).
- Cards são **clicáveis** (hyperlinks para a aba de origem, via `LinkCard`).

### 4.2 ANALISE SAP x PRJ
- Compara `MAT LIB SAP` (realizado SAP) vs `MAT PRJ CAD` (projetado).
- **Lógica de aprovação por PEP3:**
  - Avalia itens `TIPO=UC` e `TIPO=COM` de famílias críticas (CH FUS / PARA RAIO).
  - Um único item não aderente reprova **todo o PEP3**, arrastando as demais linhas.
  - Resultado: `APROVADO` / `REPROVADO` / `SEM UC`.
- 5 cards de KPI no topo (ODs, % PEP3 aprovados, % reprovados, Valor SAP, Valor não aderente) — **reativos ao AutoFilter** via fórmulas `SUMPRODUCT` em colunas ocultas AD:AH.
- Formatação condicional: listras zebra, cores por família, destaque automático de `NAO ADERENTE` e divergências > 20.

### 4.3 RACIONALIZACAO COM
- Analisa materiais `TIPO=COM` comparando quantidade liberada vs faixa prevista pela NT.006.
- Classifica por **família NT.006** (mapa por código SAP com fallback por descrição).
- Calcula âncoras (cruzeta, haste, suporte etc.) e verifica a razão dependente/âncora.
- Status possíveis: `ANCORA` · `OK` · `INSUFICIENTE` · `EXCESSO` · `EXCESSO EXAGERADO` · `SEM ANCORA` · `QTD ZERO` · `ESTORNO SEM ENTRADA` · `SEM REFERENCIA`.
- Fallback: quando a âncora está ausente no PEP4, agrega no nível PEP3 (`ancNivel3`).

### 4.4 PRECO UNITARIO
- Calcula PU = VALOR / QTD e compara com faixa MIN/MAX da base de preços.
- Status: `DENTRO DA FAIXA` · `ABAIXO DO MINIMO` · `ACIMA DO MAXIMO`.
- Sobrepreço potencial calculado para itens ACIMA DO MAXIMO: `(PU − MAX) × QTD`.

### 4.5 ALERTA CRITICO
- Consolida 13 tipos de alerta com chips coloridos semânticos:

| Tipo | Descrição |
|------|-----------|
| `ODI SEM UC` | ODI sem itens TIPO=UC com quantidade efetiva |
| `ODI SEM COM` | ODI sem nenhum material TIPO=COM |
| `PEP SEM UC` | PEP3 inteiro sem nenhum item UC |
| `MATERIAL NEGATIVO` | Material negativo em ODI/ODM/ODS (esperado positivo) |
| `MATERIAL POSITIVO EM ODD` | Material positivo em ODD (esperado negativo — desmonte) |
| `POSTE EM PEP .M` | Poste em PEP4 com sufixo `.M` (ODM) |
| `POSTE EM PEP .S` | Poste em PEP4 com sufixo `.S` (ODS) |
| `UC SUBVALORIZADO` | PU < 90% da referência E divergência ≥ R$ 100 |
| `UC - PRECO NAO ENCONTRADO` | Código SAP sem preço na aba PRECOS |
| `UC - COD MATERIAL VAZIO` | UC sem código de material |
| `LACRE x MEDIDOR` | Relação lacres/medidores diferente de 2:1 |
| `PU ABAIXO MIN` | Importado de PRECO UNITARIO |
| `PU ACIMA MAX` | Importado de PRECO UNITARIO |

### 4.6 RANKING DE RISCO
- Score por PEP3 (0–100) somando pontos de 4 dimensões:

| Dimensão | Peso | Teto |
|----------|------|------|
| Reprovado na Análise SAP×PRJ | 40 pts | — |
| Por alerta crítico | 4 pts/alerta | 24 pts |
| Por divergência de preço unitário | 3 pts/diverg. | 18 pts |
| Por COM fora do NT.006 | 2 pts/item | 18 pts |

- Classificação: `ALTO` ≥ 60 · `MEDIO` ≥ 30 · `BAIXO` > 0 · `OK` = 0.
- Ordenado por score desc; empate resolvido por valor da obra desc.

---

## 5. Mapa NT.006 — `CriarMapaNT006()`

Dicionário `Scripting.Dictionary` com chave = código SAP e valor = string serializada de `tMaterial` separada por `|`.

### Famílias cadastradas no mapa fixo

| Família | Cód NT.006 | Tipo | Razão mín/máx |
|---------|-----------|------|---------------|
| CRUZETA | R-02 | Âncora | — |
| ISOLADOR PILAR | I-05 | Dep. CRUZETA | 2–3,5 |
| ISOL SUSPENSAO | I-06 | Âncora | — |
| ARRUELA | A-02 | Dep. CRUZETA | 2–9 |
| PARAFUSO | F-30 | Dep. CRUZETA | 1–8 |
| PINO | F-36/F-37 | Dep. CRUZETA | 1–3,5 |
| PORCA | A-21 | Dep. CRUZETA | 2–6,5 |
| SELA CRUZETA | — | Dep. CRUZETA | 2–4 |
| MAO FRANCESA | — | Dep. CRUZETA | 0,5–2,5 |
| GANCHO OLHAL | F-13 | Âncora | — |
| MANILHA | F-22 | Dep. GANCHO OLHAL | 0,8–1,2 |
| OLHAL PARAFUSO | — | Dep. GANCHO OLHAL | 0,8–1,2 |
| PARAFUSO OLHAL | F-34 | Dep. GANCHO OLHAL | 0,8–1,2 |
| HASTE TERRA | F-17 | Âncora | — |
| CONEC HASTE | M-10 | Dep. HASTE TERRA | 0,8–1,2 |
| SUP PARA-RAIO | F-47 | Âncora | — |
| PARA-RAIO | E-29 | Dep. SUP PARA-RAIO | 0,8–1,2 |
| CHAVE FUSIVEL | E-09 | Âncora | — |
| TRAFO | E-45 | Âncora | — |
| CONEC RAMAL | O-02 | Âncora | — |

### Famílias classificadas por descrição (`ClassificarDesc`)

Fallback aplicado quando o código SAP não consta no mapa. Classifica por palavras-chave na descrição normalizada:

- **Âncoras adicionais:** ESTAI, DPS, CABO/CONDUTOR, POSTE, MEDIDOR, CAIXA, LACRE*, ARMACAO SEC, GRAMPO, CONECTOR, LUVA EMENDA, FITA/FECHO, TERMINAL/MUFLA, ESTRIBO, EQUIP MANOBRA, REDE COMPACTA, ALCA PREFORMADA, ELETRODUTO, FERRAGEM, ARAME, SUPORTE.
- **Dependentes adicionais:** ROLDANA (dep. ARMACAO SEC), ELO FUSIVEL (dep. CHAVE FUSIVEL), CINTA POSTE (dep. POSTE), CAIXA MEDICAO (dep. MEDIDOR).

> *LACRE: razão 1,8–2,2 (2 lacres por medidor ODM).

---

## 6. Base de Preços — `CarregarPrecos` / `CarregarFaixaPrecos`

### Fontes (em ordem de prioridade)

1. **Aba interna `PRECOS`** — colunas: `COD MATERIAL` (col 1), `PRECO` (col 2). Preço único por código.
2. **Aba interna `BASE PRECOS` / `BASE DE PRECOS` / `BASE DE PREÇOS`** — colunas: `MATERIAL` · `TEXTO MATERIAL` · `UML` · `MIN PU` · `MAX PU`. Faixa por código.
3. **Arquivo externo `BASE DE PREÇOS.xlsx`** — buscado nas pastas abaixo, nessa ordem:

```
<pasta do workbook>
%USERPROFILE%\OneDrive - GRUPO EQUATORIAL ENERGIA\Área de Trabalho\claude
%USERPROFILE%\OneDrive\Área de Trabalho\claude
%USERPROFILE%\Área de Trabalho\claude
%USERPROFILE%\Desktop\claude
```

**Fallback:** se só a faixa MIN/MAX estiver disponível (fontes 2 ou 3), o preço usado na comparação de subvalorização é o ponto médio `(MIN + MAX) / 2`.

**Cache de execução:** `mFaixaCache` — carregado uma vez por execução de `GerarInventario`. Limpo no início do `GerarInventario`.

---

## 7. Constantes e Parâmetros de Tolerância

| Constante | Valor padrão | Localização | Significado |
|-----------|-------------|-------------|-------------|
| `TOL_SUBVAL` | `0.9` (90%) | linha 11 | Limiar de subvalorização: alerta se PU < 90% da referência |
| `MIN_DIVERG_RS` | `100` | linha 14 | Materialidade mínima em R$ para gerar alerta de subvalorização (0 = desativado) |
| Margem de aderência (condutores) | `10%` | `EhAderente`, linha 995 | Tolerância de ±10% para `CABO`/`COND`/`RAMAL` |
| `PESO_REPROV` | `40` | linha 2131 | Peso de obra reprovada no score de risco |
| `PESO_ALERTA` | `4` / teto `24` | linhas 2132–2133 | Peso por alerta crítico |
| `PESO_PU` | `3` / teto `18` | linhas 2135–2136 | Peso por divergência de PU |
| `PESO_COM` | `2` / teto `18` | linhas 2137–2138 | Peso por COM fora do NT.006 |
| Excesso exagerado | `≥ 2×` o máximo | linha 1223 | Dobro do máximo vira "EXCESSO EXAGERADO" |
| Relação lacre/medidor | `2:1` | linha 1662 | 1 medidor ODM → 2 lacres esperados |
| Cabo isolado isento (UC) | `< 15 m` | `CaboComoCOM`, linha 733 | CABO ISOLADO com MAT LIB SAP < 15 m é tratado como COM (isento de UC) |

---

## 8. Lógica de Aprovação/Reprovação (PEP3)

```
Para cada linha da base:
  SE TIPO = "UC" OU (TIPO = "COM" E família é crítica*):
    SE NÃO é CaboComoCOM:
      marca o PEP4 como avaliável
      SE NÃO aderente E situação ≠ "NULO":
        reprova o PEP4 → reprovação se propaga para o PEP3 inteiro

*famílias críticas: CH FUS, CHAVE FUS, PARA RAIO (MT/BT)
```

**Rollup PEP3:** qualquer PEP4 reprovado reprova o PEP3. Todas as linhas do PEP3 recebem `REPROVADO` na coluna APROVACAO com motivo especificando a família culpada.

**Cabo isolado isento:** `CABO ISOLADO` com `MAT LIB SAP < 15 m` recebe `APROVADO` com motivo "Cabo isolado < 15m — isento de UC", mesmo que o PEP3 esteja reprovado por outro motivo.

---

## 9. Localização da Aba Base — `AcharBaseInventario()`

Percorre **todas** as abas do workbook ignorando as abas de saída geradas pelo próprio módulo. Identifica a aba base pela presença simultânea das colunas `MAT LIB SAP` e `MAT PRJ CAD` na linha 1 (cabeçalho). A primeira aba que satisfizer a condição é usada.

---

## 10. Colunas Esperadas na Aba Base

| Nome no cabeçalho | Uso |
|-------------------|-----|
| `PEP3NIVEL` | Código do PEP nível 3 (obra) |
| `PEP4NIVEL` | Código do PEP nível 4 (ordem/atividade) |
| `NOTA` | Número da nota |
| `CLASSE` | Classe do material |
| `COD MAT` | Código SAP do material |
| `VALOR` | Valor financeiro do item |
| `DESC MAT` | Descrição do material |
| `UND` | Unidade de medida |
| `MAT LIB SAP` | Quantidade realizada (SAP) |
| `MAT PRJ CAD` | Quantidade projetada (CAD/projeto) |
| `TIPO` | Tipo do item: `UC` ou `COM` |
| `FAMILIA` | Família do material |
| `SIT MAT` | Situação: `ADERENTE` / `NAO ADERENTE` / `NULO` |
| `APROVACAO` | (saída) Resultado da aprovação |
| `MOTIVO` | (saída) Texto explicativo |
| `TIPO PEP` | Sufixo do PEP (ex: `I` → ODI) |

Colunas ausentes são toleradas: o índice fica 0 e a lógica usa fallbacks ou ignora o campo.

---

## 11. Colunas Auxiliares Ocultas (AD:AH) — Aba ANALISE SAP x PRJ

| Col | Nome | Fórmula/Valor | Uso |
|-----|------|---------------|-----|
| AD (30) | `vis` | `=SUBTOTAL(102,$AE...)` | 1 se a linha está visível no AutoFilter |
| AE (31) | `p4` | 1 na 1ª linha de cada PEP4 | KPI dinâmico: ODs visíveis |
| AF (32) | `p3` | 1 na 1ª linha de cada PEP3 avaliável | KPI dinâmico: PEP3 analisados |
| AG (33) | `rep` | 1 se o PEP3 é reprovado | KPI dinâmico: PEP3 reprovados |
| AH (34) | `vna` | valor absoluto do item não aderente | KPI dinâmico: valor não aderente |

Os cards da linha 6 usam `SUMPRODUCT(vis, px)` para reagir ao filtro em tempo real.

---

## 12. Design Global — `AplicarDesignGlobal()`

Executada **por último** para não interferir nas leituras entre abas:

1. **Aba PRECO UNITARIO** ganha banda de título com contadores (única que não tinha).
2. **Contadores dinâmicos** nos títulos de ALERTA CRITICO e RANKING DE RISCO.
3. **RACIONALIZACAO COM** recebe contador de itens fora do previsto.
4. **Cor da guia (Tab)** de cada aba — paleta própria por relatório:

| Aba | Cor |
|-----|-----|
| PAINEL DO GESTOR | Navy `#111827` |
| ANALISE SAP x PRJ | Azul `#1F4E79` |
| RACIONALIZACAO COM | Índigo `#5E549E` |
| PRECO UNITARIO | Petróleo `#156082` |
| ALERTA CRITICO | Vermelho `#B00000` |
| RANKING DE RISCO | Âmbar `#B07C00` |

5. **Drill-down:** cards do PAINEL viram hyperlinks para a aba de origem.
6. **Barra de navegação** (Shapes arredondados clicáveis) inserida na linha 1 de **todas** as abas — inserção por último porque desloca o conteúdo 1 linha e exige refazer o congelamento de painéis.

---

## 13. Pontos de Atenção / Candidatos a Ajuste

### 13.1 Caminho da base de preços (frágil)
- Localização: `CaminhoBasePrecos()`, linha 1852.
- Hardcoded para pastas OneDrive da Equatorial + Desktop. Se o arquivo mudar de lugar ou em outra máquina, o preço externo não carrega silenciosamente (sem aviso ao usuário).
- **Mitigação recomendada:** exibir aviso quando `CaminhoBasePrecos` retornar vazio e a aba interna também não for encontrada.

### 13.2 Tolerâncias embutidas no código
- `TOL_SUBVAL = 0.9` e `MIN_DIVERG_RS = 100` (linhas 11–14) — fáceis de ajustar, mas exigem edição do código.
- Margem de aderência de 10% para condutores está embutida em `EhAderente` (linha 995).
- Pesos do score de risco são `Const` dentro de `ProcessarRankingRisco` (linhas 2131–2138).
- **Mitigação recomendada:** centralizar em uma aba de configuração ou no topo do módulo como constantes nomeadas agrupadas.

### 13.3 Mapa NT.006 duplicado
- As razões mín/máx estão definidas tanto em `CriarMapaNT006` (para códigos SAP conhecidos) quanto em `ClassificarDesc` (para fallback por descrição). Uma mudança de regra precisa ser feita nos dois lugares.

### 13.4 Ordenação O(n²)
- `ProcessarCOMInventario` e `ProcessarRankingRisco` usam bubble sort manual. Para bases pequenas é irrelevante; para > 5.000 linhas pode ser lento.

### 13.5 Coloração da coluna APROVACAO por loop (linha 691)
- Coluna 14 recebe cor linha a linha via loop VBA (sem formatação condicional), porque `FormatConditions` com fórmulas em português falham no Excel PT-BR.
- É o comportamento intencional (comentado no código), mas torna a formatação estática — alterar o valor depois não atualiza a cor automaticamente.

### 13.6 Bug no `ProcessarPrecoUnitario` — STATUS sobrescreve MAX PU (linhas 2043–2044)
- A linha 2043 escreve `mx` na coluna 11 (MAX PU) e a linha 2044 imediatamente sobrescreve a **mesma** coluna 11 com `st` (STATUS). O cabeçalho coloca STATUS na coluna 12.
- Consequência: a coluna 12 (STATUS) fica **vazia**, e o MAX PU é perdido.
- O `ProcessarRankingRisco` lê o STATUS de PU na coluna 12 (`pp(r, 12)`), que está vazia → **a dimensão de preço unitário nunca pontua no score de risco do VBA**, apesar de `PESO_PU = 3` estar definido.
- **Correção sugerida:** `ws.Cells(outRow, 11).Value = mx` e `ws.Cells(outRow, 12).Value = st`.
- *A versão web já implementa o comportamento correto: MIN/MAX e STATUS em campos separados, e o PU efetivamente entra no score do ranking.*

### 13.7 `On Error Resume Next` extensivo
- Usado em vários blocos de formatação para tolerar erros de UI (congelamento de painéis, AutoFilter). Pode mascarar erros reais durante depuração.

---

## 14. Dependências Externas

| Dependência | Obrigatória | Comportamento se ausente |
|-------------|------------|--------------------------|
| Aba base com `MAT LIB SAP` e `MAT PRJ CAD` | **Sim** | MsgBox de erro e saída |
| Aba `PRECOS` (interna) | Não | Fallback para faixa MIN/MAX |
| Aba `BASE PRECOS` / `BASE DE PRECOS` (interna) | Não | Fallback para arquivo externo |
| Arquivo `BASE DE PREÇOS.xlsx` (externo) | Não | Preços não comparados; alertas de subvalorização suprimidos |
| `Scripting.Dictionary` (Windows Script) | **Sim** | Erro em ambiente não-Windows |

---

## 15. Referência Rápida de Funções

```
GerarInventario()                  → ponto de entrada público
AcharBaseInventario(wb)            → Worksheet | Nothing
ProcessarSAPxPRJ(wsBase, wsDet)
ProcessarCOMInventario(wsBase, wsCom)
ProcessarPrecoUnitario(wsBase, ws)
ProcessarAlertaCritico(wsBase, ws)
ProcessarRankingRisco(wb, wsDet, wsCom, wsPU, wsAlertaC)
ProcessarPainelGestor(wb, wsBase, wsDet, wsPU, wsAlertaC) → Worksheet
AplicarDesignGlobal(wb)

CriarMapaNT006()                   → Object (Dictionary)
GetMat(d, cod)                     → tMaterial
AddMat(d, cod, familia, nt006, ...) → (modifica d)
ClassificarDesc(descNorm, tm)      → Boolean

EhAderente(fam, libV, prjV, sit)   → Boolean
EhComCritico(famNorm)              → Boolean
CaboComoCOM(fam, libV)             → Boolean
EhUnidadeInteira(uml)              → Boolean
TemPalavra(descNorm, termo)        → Boolean

CarregarPrecos(wb)                 → Object (Dictionary cod→preço)
CarregarFaixaPrecos(wb)            → Object (Dictionary cod→"min|max|texto")
CaminhoBasePrecos(wb)              → String (caminho completo ou "")

NormStr(s)                         → String (upper, sem acentos/pontuação)
NormCod(v)                         → String (remove ".0" e notação científica)
ToNum(v) / Val0(v)                 → Double (0 em caso de erro)
FmtKPI(v)                          → String ("R$ 1,2 MM" / "R$ 500 mil" / "R$ 99")
FmtDif(libV, prjV)                 → String (" | Dif=+3 (42,9% acima)")

CardGestor(ws, topRow, leftCol, titulo, valor, corFundo, corValor)
InserirBarraNav(ws, nomes, rots, atual, congRow)
BotaoNav(ws, x, destino, rotulo, ehAtual)
LinkCard(ws, topRow, leftCol, destino)
AppendContagem(wb, aba, primeiraLinhaDados, sufixo)
CorAcento(nome)                    → Long (RGB)
```
