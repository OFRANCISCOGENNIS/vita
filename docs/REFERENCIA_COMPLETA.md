# AnaliseCKCP — Análise de Custos CKCP RS2

Módulo VBA para Excel que transforma o export bruto do SAP (CKCP) em um conjunto de relatórios estruturados de análise de custo de obras de distribuição elétrica.

## Arquivo fonte

`vba/AnaliseCKCP_OTIMIZADO.bas` — 6.153 linhas, 60 Subs, 71 Functions.

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
  → OrganizarAbas
  → MostrarTelaFuturista        (painel HUD desenhado com Shapes)
```

## Abas geradas (21)

| Aba | Descrição |
|-----|-----------|
| `PAINEL EXECUTIVO` | Visão consolidada executiva por PEP 3º nível |
| `RAZAO CJ` | Razão por CJ — detalhamento de lançamentos |
| `MATERIAL vs SERVICO` | Aderência material×serviço por família / ODI |
| `MAT vs SERV AT` | Módulo AT (alta tensão) — avaliação por grupo/PEP |
| `ANALISE DE CA` | Análise por Categoria Analítica (CA) |
| `CLASSE DE CUSTO` | Resumo por classe de custo SAP |
| `MATERIAL` | Detalhe de materiais |
| `SERVICO` | Detalhe de serviços |
| `ALERTAS CRITICOS` | Cards de alertas (regras violadas, inconformidades) |
| `REGRAS` | Tabela de regras aplicadas |
| `SERVICO SEM MATERIAL` | Serviços lançados sem material correspondente |
| `PORTFOLIO OBRA` | Portfólio de obras por PEP |
| `NAO CLASSIFICADOS` | Itens sem classificação CLS1/2/3 |
| `RACIONALIZACAO COM` | Racionalização de itens COM |
| `CONFIG` | Parâmetros centralizados (editável pelo usuário) |
| `PREMISSAS` | Premissas e regras de negócio documentadas |

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
| `dCatCC` | CLASSE_CUSTO | `"CLS1\|CLS2\|CLS3\|TIPO_APLIC"` (782 classes embutidas via `CarregarClassesCustoAuto` + 42 overrides curados) |
| `dCabo` | COD_MATERIAL | fator KG→metros (Double) |
| `dCombo` | COD_SERVICO | fator multiplicador (Double) |
| `dTipoCls` | CLS2 normalizada | `"COM"` / `"UC"` / `"UAR"` |
| `dDescSrv` | COD_SERVICO | descrição textual (embutido + `TEXTO BREVE` de `SERVICOS_ATUAIS` em runtime) |
| `dCfg` | CHAVE | valor (da aba CONFIG) |
| `dFamEquiv` | CLS2 serviço normalizada | família de material equivalente (+ CONFIG `EQUIV_SRV_MAT`) |
| `dSrvPuro` | CLS2 serviço normalizada | 1 = serviço sem material esperado (+ CONFIG `SRV_PURO`) |
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

Ver `vba/AnaliseCKCP_OTIMIZADO.bas` ou o arquivo de documentação completo `vba/AnaliseCKCP_OTIMIZADO_DOC.md` para o índice com números de linha (linha exata de cada Sub/Function).

## Modo Objetivo — protocolo de trabalho (economia de tokens)

Ao trabalhar neste repositório, siga este protocolo para respostas e ações objetivas:

1. **Responda direto.** Sem preâmbulo, sem repetir o pedido, sem resumo redundante. Entregue o resultado e pare.
2. **Ação > explicação.** Faça a alteração no `.bas` e mostre só o essencial (linha alterada + motivo em 1 frase). Não cole blocos grandes de código já existente.
3. **Localize por índice.** Use `vba/AnaliseCKCP_OTIMIZADO_DOC.md` para achar a linha da Sub/Function antes de abrir o arquivo. Leia só o trecho necessário (`offset`/`limit`), nunca as 6k+ linhas inteiras.
4. **Busca cirúrgica.** Prefira `Grep` por nome de procedimento/dicionário a varreduras amplas.
5. **Diffs mínimos.** Uma edição = uma mudança lógica. Não reformate código não relacionado.
6. **Sem perguntas desnecessárias.** Se há padrão óbvio, aplique e informe em 1 linha; só pergunte quando a escolha muda o resultado.
7. **Confirmação enxuta.** Ao concluir: o que mudou, em qual(is) linha(s)/Sub(s) e se foi commitado — em poucas linhas.
8. **Exportar sempre.** Após qualquer ajuste no `.bas`, sempre entregar o arquivo atualizado ao usuário (enviar o `vba/AnaliseCKCP_OTIMIZADO.bas`), sem precisar pedir.
