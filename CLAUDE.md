# AnaliseCKCP — Análise de Custos CKCP RS2

Módulo VBA para Excel que transforma o export bruto do SAP (CKCP) em um conjunto de relatórios estruturados de análise de custo de obras de distribuição elétrica.

## Arquivo fonte

`vba/AnaliseCKCP_OTIMIZADO.bas` — 6.855 linhas, 70 Subs, 74 Functions.

## Como usar

1. Abra o `EXPORT.XLSX` (dados brutos do SAP) no Excel.
2. `Alt+F11` → Inserir → Módulo → Importar o arquivo `.bas` (ou colar o código).
3. Fechar o editor, `Alt+F8` → `GerarRelatorio` → Executar.

A base bruta deve ter os cabeçalhos do SAP na linha 1:
`Elemento PEP`, `Classe de custo`, `Material`, `Qtd.total entrada`, `Valor/moeda objeto`, `Classificação`, `Descrição SA`, etc.

## Fluxo de execução (`GerarRelatorio`)

```
GarantirConfig / CarregarConfig
  → RemoverAbasObsoletas
  → LocalizarBase          (localiza aba com "Elemento PEP")
  → MapearColunas          (mapeia colunas pelos cabeçalhos, tolerante a acentos)
  → CarregarDados          (carrega base para array em memória)
  → CarregarCatalogoMateriais   (MATERIAS_ATUAIS.xlsx — FAMILIA, CLS1/2/3)
  → CarregarCatalogoServicos    (CLS1/2/3, TIPO_APLIC, SEGMENTO)
  → CarregarCatalogoClasse      (CLASSE DE CUSTO → CLS1/2/3 + TIPO_APLIC)
  → CarregarConversoesCabo      (KG → metros para cabos)
  → CarregarComboServico        (fator multiplicador por serviço combo)
  → CarregarTipoClassif         (CLS2 normalizada → TIPO: COM/UC/UAR)
  → CarregarDescServico         (catálogo embutido: COD_SERVICO → descrição)
  → Gerar_RazaoCJ
  → Gerar_AlertasCriticos
  → Gerar_MaterialVsServico     (+ popula dMvSVerd/dMvSFamNC/dMvSDif em memória)
  → Gerar_Material
  → Gerar_Servico
  → Gerar_AnaliseCA
  → Gerar_ServicoSemMaterial
  → Gerar_NaoClassificados
  → Gerar_RacionalizacaoCOM
  → Gerar_Regras
  → Gerar_Melhorias             (analises v2 — ver bloco abaixo)
  → OrganizarAbas
  → MostrarTelaFuturista        (painel HUD desenhado com Shapes)
```

### Gerar_Melhorias (analises v2)

Orquestra 8 análises adicionais, cada uma numa aba própria (escritas via
`EscreverColecaoAba` → `EscreverAba`, com o mesmo visual das demais abas):

```
Gerar_PrecoOutlier        → PRECO OUTLIER        (preço unitário fora da mediana do material)
Gerar_MaterialSemServico  → MATERIAL SEM SERVICO (material sem serviço da mesma família)
Gerar_QualidadeClassif    → QUALIDADE CLASSIF    (% do valor com CLS1/2/3 completos por PEP3)
Gerar_Duplicados          → DUPLICADOS           (PEP+MATERIAL+QTD+VALOR+DATA repetidos)
Gerar_ScorePep            → SCORE PEP            (nota 0–100 consolidada por PEP3)
Gerar_BenchmarkPep        → BENCHMARK PEP        (%material vs mediana do grupo/tipo de PEP)
Gerar_AnaliseTemporal     → ANALISE TEMPORAL     (PEP parado / concentração fim de mês; requer data)
Gerar_Estornos            → ESTORNOS             (% estornado por PEP; requer coluna de estorno)
```

Helpers: `EscreverColecaoAba`, `MedianaDeColecao`, `ToData`, `EhAderenteValQtd`.

## Abas geradas

| Aba | Descrição |
|-----|-----------|
| `PAINEL EXECUTIVO` | Visão consolidada executiva por PEP 3º nível |
| `RAZAO CJ` | Razão por CJ — detalhamento de lançamentos |
| `MATERIAL vs SERVICO` | Aderência material×serviço por família / ODI |
| `MAT vs SERV AT` | Módulo AT (alta tensão) — avaliação por grupo/PEP |
| `ANALISE DE CA` | Análise por Categoria Analítica (CA) |
| `CLASSE DE CUSTO` | Resumo por classe de custo SAP |
| `MATERIAL` | Detalhe de materiais (coluna ADERENCIA por sinal) |
| `SERVICO` | Detalhe de serviços (coluna ADERENCIA por sinal) |
| `ALERTAS CRITICOS` | Cards de alertas; Seção B ordenada por materialidade + severidade |
| `REGRAS` | Tabela de regras aplicadas |
| `SERVICO SEM MATERIAL` | Serviços lançados sem material correspondente |
| `PORTFOLIO OBRA` | Portfólio de obras por PEP |
| `NAO CLASSIFICADOS` | Itens sem classificação CLS1/2/3 |
| `RACIONALIZACAO COM` | Racionalização de itens COM |
| `CONFIG` | Parâmetros centralizados (editável pelo usuário) |
| `PREMISSAS` | Premissas e regras de negócio documentadas |
| `PRECO OUTLIER` | Preço unitário fora da mediana do material (melhoria v2) |
| `MATERIAL SEM SERVICO` | Material sem serviço da mesma família (melhoria v2) |
| `QUALIDADE CLASSIF` | % do valor com classificação completa por PEP3 (melhoria v2) |
| `DUPLICADOS` | Lançamentos duplicados (melhoria v2) |
| `SCORE PEP` | Nota 0–100 consolidada por PEP3 (melhoria v2) |
| `BENCHMARK PEP` | Composição de custo vs mediana do grupo (melhoria v2) |
| `ANALISE TEMPORAL` | PEP parado / concentração no fim do mês (melhoria v2) |
| `ESTORNOS` | % estornado por PEP e estornos sem referência (melhoria v2) |

### Parâmetros da CONFIG adicionados (melhorias v2)

| Chave | Padrão | Uso |
|-------|--------|-----|
| `MARGEM_ABS_MIN` | `0` | Piso absoluto da aderência MAT vs SRV (diferença ≤ piso = aderente) |
| `OUTLIER_PCT` | `50` | Desvio % do preço unitário vs mediana para sinalizar |
| `OUTLIER_MIN_AMOSTRAS` | `4` | Amostra mínima por material para calcular a mediana |
| `SEV_ALTA_RS` | `50000` | Valor absoluto para severidade ALTA nos ALERTAS CRITICOS |
| `SEV_MEDIA_RS` | `10000` | Valor absoluto para severidade MEDIA nos ALERTAS CRITICOS |
| `PEP_PARADO_MESES` | `6` | Meses sem lançamento para marcar PEP PARADO |

## Estrutura de dados em memória

### Variáveis globais principais

```vba
Private wsRaw As Worksheet        ' aba com dados brutos
Private dados As Variant          ' array 2D com todos os dados (carregado uma vez)
Private nLin As Long              ' qtd de linhas com PEP preenchido
```

### Dicionários de catálogos

| Dicionário | Chave | Valor |
|------------|-------|-------|
| `dCatMat` | COD_MATERIAL | `"FAMILIA\|CLS1\|CLS2\|CLS3"` |
| `dCatSrv` | COD_SERVICO | `"CLS1\|CLS2\|CLS3\|TIPO_APLIC\|SEGMENTO"` |
| `dCatCC` | CLASSE_CUSTO | `"CLS1\|CLS2\|CLS3\|TIPO_APLIC"` |
| `dCabo` | COD_MATERIAL | fator KG→metros (Double) |
| `dCombo` | COD_SERVICO | fator multiplicador (Double) |
| `dTipoCls` | CLS2 normalizada | `"COM"` / `"UC"` / `"UAR"` |
| `dDescSrv` | COD_SERVICO | descrição textual (catálogo embutido) |
| `dCfg` | CHAVE | valor (da aba CONFIG) |
| `dClsViagem` | CLASSE_CUSTO | 1 (flag: é classe de viagem) |

### Compartilhamento entre módulos (fase 1.2)

Vereditos ODI calculados em `Gerar_MaterialVsServico` são reutilizados em `Gerar_PainelExecutivo` via:

```vba
Private dMvSVerd  As Object   ' PEP3NIVEL -> "APROVADO"/"REPROVADO"
Private dMvSFamNC As Object   ' PEP3NIVEL -> qtd famílias NAO ADERENTES
Private dMvSDif   As Object   ' PEP3NIVEL -> soma das diferenças
```

### Tipo tItem (módulo AT)

Usado em `aItens()` para o módulo `MAT vs SERV AT`:

```vba
Private Type tItem
    Empresa, Segmento, TipoObraAneel, Pep3Nivel, Pep, Tipo  As String
    Material, TextoMaterial, Uml                             As String
    ValorMoeda, QtdEntrada                                   As Double
    Cls1, Cls2, Cls2Orig, TipoCusto                          As String
    Mat, Srv                                                  As Double
    Aderencia, Inconformidade                                 As String
    PctMop                                                    As Double
    GrupoKey                                                  As String
End Type
```

## Mapeamento de colunas

`MapearColunas` é tolerante a acentos e variações de nome via `ColLike` (busca por fragmento) e `ColExata` (match exato). Colunas obrigatórias:

- `Elemento PEP` / `PEP`
- `Classificação` (qualquer fragmento "CLASSIFICA")
- `Valor/moeda objeto` / `VALOR_MOEDA`
- `Qtd.total entrada` / `QTD_ENTRADA`
- `Material`

Colunas opcionais (enriquecem os relatórios): Classe de custo, Texto breve, UML, Descrição SA, Empresa, Divisão, Objeto, Denominação, Usuário, Nº doc, Data lançamento, ODI_ANEEL, SA, CLS1/2/3 raw, Tipo aplicação, etc.

## Tipos de PEP (sufixo)

| Sufixo | Código | ANEEL |
|--------|--------|-------|
| `.I` | `"I"` | ODI |
| `.D` | `"D"` | ODD |
| `.M` | `"M"` | ODM |
| outro | `"S"` | OUTRO |

## Paleta de cores

### Módulo principal

| Constante | Cor | Uso |
|-----------|-----|-----|
| `COR_HDR` | Azul escuro `#1F497D` | Cabeçalhos |
| `COR_OK` | Verde claro `#C6EFCE` | Aprovado / OK |
| `COR_BAD` | Vermelho claro `#FFC7CE` | Reprovado / alerta |

### Módulo AT

| Constante | Cor | Uso |
|-----------|-----|-----|
| `COR_HEADER` | Vermelho escuro | Cabeçalho AT |
| `COR_INCONF_BG` | Azul claro | Inconformidade (fundo) |
| `COR_ADER_OK` | Verde | Aderente |
| `COR_ADER_DIV` | Ciano | Aderente com divergência |
| `COR_ADER_ERR` | Roxo/vermelho | Não aderente |
| `COR_TIPO_D_BG` | Laranja claro | Tipo D (fundo) |
| `COR_TIPO_C_BG` | Verde claro | Tipo C (fundo) |

## Catálogos externos necessários

| Arquivo | Caminho padrão | Conteúdo |
|---------|----------------|----------|
| `MATERIAS_ATUAIS.xlsx` | `%USERPROFILE%\Downloads\` | COD_MATERIAL, FAMILIA, CLS1, CLS2, CLS3 |
| Catálogo de serviços | configurável via CONFIG | COD_SERVICO, CLS1, CLS2, CLS3, TIPO_APLIC, SEGMENTO |
| Catálogo de classes | configurável via CONFIG | CLASSE_CUSTO, CLS1, CLS2, CLS3, TIPO_APLIC |
| Conversões de cabo | configurável via CONFIG | COD_MATERIAL, fator KG→m |
| Serviços combo | configurável via CONFIG | COD_SERVICO, fator multiplicador |

Se o arquivo não for encontrado automaticamente, o VBA abre um `GetOpenFilename` para seleção manual. Cancelar pula o catálogo (relatório roda sem ele, com classificação incompleta).

## Overrides fixos embutidos

Dois códigos de serviço recebem `CLS2 = "COND PROT"` forçado para casar com material cabo na aba `MATERIAL vs SERVICO`:

- `5500000582` — AHO204_B_INST RD COMPACT(SPACE CAB)MT-LM
- `5500000575` — AHO202_A_INST COND. 70/120 MM CB/AL-LM

## Regras de negócio principais

- **Aderência material×serviço**: por família (CLS2), compara valor de material com valor de serviço dentro do mesmo PEP 3º nível. Tolerância configurável na aba CONFIG.
- **Veredito ODI**: PEP do tipo ODI é APROVADO se todas as famílias estão aderentes; REPROVADO caso contrário.
- **ClassificacaoPendente**: CLS3 vazio, ou qualquer nível com valor "CLASSIFICAR".
- **Classes de viagem**: marcadas no catálogo de classes; excluídas de certas análises.
- **PEP emergência**: identificado por função `EhPepEmergencia`; tratamento diferenciado.
- **Racionalização COM**: cruza itens COM com mapa NT006 para identificar sobreposições.

## Índice rápido de Subs/Functions

Ver `vba/AnaliseCKCP_OTIMIZADO.bas` ou o arquivo de documentação completo `AnaliseCKCP_OTIMIZADO_DOC.md` para o índice com números de linha.
