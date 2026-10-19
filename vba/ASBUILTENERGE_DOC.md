# ASBUILTENERGE — Documentação do módulo VBA (v4.0)

> **Arquivo principal e editável:** `vba/ASBUILTENERGE.bas` (cabeçalho interno `ASBUILTENERGE.bas v4.0`).
> Este MD é a **fonte de verdade** da documentação do módulo.
>
> **Fluxo de trabalho obrigatório para qualquer ajuste:**
> 1. **Ler este MD** antes de alterar o `.bas`.
> 2. Fazer o ajuste no `vba/ASBUILTENERGE.bas`.
> 3. **Atualizar este MD** refletindo o que mudou.

Módulo VBA para **ZWCAD 2024+** (compatível AutoCAD) que varre um desenho CAD de as-built de rede elétrica de distribuição e gera uma planilha Excel estruturada com o quantitativo de materiais (postes, cabos, chaves, trafos, aterramentos, etc.), classificados por status (instalado / desinstalado / existente) e família.

## Identidade e constantes (v4.0)

Metadados e status críticos agora ficam centralizados em constantes no topo do módulo:

| Constante | Valor | Uso |
|---|---|---|
| `APP_NOME` | `"ASBUILT ENERGE"` | Nome exibido na aba Log e na tela final |
| `APP_VERSAO` | `"4.0.0"` | Versão registrada na aba Log |
| `FORMATO_XLSX` | `51` | `xlOpenXMLWorkbook` no `SaveAs` |
| `XL_CENTRO` | `-4108` | `xlCenter` (alinhamento) |
| `XL_PLANILHA_OCULTA` | `0` | `xlSheetHidden` (abas auxiliares) |
| `STATUS_INSTALADO` | `"MATERIAIS INSTALADOS"` | Status padrão |
| `STATUS_DESINSTALADO` | `"MATERIAIS DESINSTALADOS"` | Status padrão |
| `STATUS_EXISTENTE` | `"MATERIAIS EXISTENTES"` | Status padrão |
| `STATUS_NAO_CLASSIFICADO` | `"NAO CLASSIFICADO"` | Status padrão |
| `DIAGNOSTICO_LAYERS` | `False` | Diagnóstico: MsgBox com os 1os 15 layers |

## Novidades da v4.0 (rastreabilidade, pendências e log)

- **Rastreabilidade na aba `Textos`**: duas colunas novas — **Fonte da Classificação** (col. 15) e **Revisão** (col. 16).
- **Pendências visíveis**: a antiga aba oculta `Alertas` virou a aba **visível** `Pendencias` (`CriarAbaPendencias`), que inclusive lista os **blocos de poste ignorados pelo filtro** (seção F).
- **Aba `Log`** (`CriarAbaLog`): registra aplicação, versão, DWG, início/fim, duração (segundos), contagens por fonte e o caminho do arquivo gerado.
- **Quantidade marcada em texto**: `ExtrairQuantidadeMarcada`/`QuantidadeDoTexto` leem marcadores `Q=`, `QT:`, `QTD =` no texto (sem confundir com `Q2=` de regras específicas).
- **Ordenação da aba Textos** corrigida para abranger todas as 16 colunas.

## Como usar

1. Abrir o `.dwg` do as-built no ZWCAD (ou AutoCAD).
2. `Alt+F11` (VBA IDE) → Importar `ASBUILTENERGE.bas` como módulo.
3. Rodar a macro `ExportarTextosParaExcel` (via `Alt+F8` ou `-VBARUN`).
4. O Excel é aberto em segundo plano (invisível), processado, salvo e fechado. O resultado vai para `%USERPROFILE%\Downloads\<NomeDoDesenho>_TEXTOS.xlsx` (ou com timestamp se já existir).
5. Ao final, uma tela HTA (`mshta.exe`) mostra um resumo da exportação.

## Fluxo de execução (`ExportarTextosParaExcel`)

```
inicioExecucao = Now
Monta mapa Layer → Cor ACI (CorLayerSegura)
  → Itera ThisDrawing.Blocks (ModelSpace/Layout/XRef) procurando TEXT/MTEXT
      → Classifica cada texto: Familia + Score de confiança (ClassificarComConfianca)
      → Status (StatusPorLayer), Nome Base (poste), Cod. Estrutura (Mid(txt,10,7))
      → Fonte da Classificação (FonteClassificacaoTexto) + Revisão (RevisaoTexto)
  → Cria Workbook Excel (Excel.Application invisível)
  → Aba "Textos"  — 1 linha por TEXT/MTEXT, 16 colunas
  → Aba "Resumo"  — agregações + 2 gráficos (barras, pizza)
  → LerBlocosComAtributos  (postes/estruturas; _POSTE/RDARA034/RDARA1100 = DUPLO;
                            registra rejeitadoNome/Motivo/X/Y + postesIgnorados)
  → LerBlocosCabo          (RDARA1110/1111 — cabos)
  → LerBlocosOutros        (trafo, chave, religador, para-raio, mufla, isolador…)
  → LerBlocosPiaui         (blocos-símbolo sem atributos — padrão Piauí)
  → Unifica em arrays u* (uTipo/uFam/uBloco/uStat/uDesc/uBase/uDist/uMet/uX/uY)
  → CriarAbaStatus × 3     — "Mat. Instalados/Desinstalados/Existentes"
                             (resumo agrupado "8 D11600": Item/Qtd/Material/
                              Família/Descrição/Metros)
  → CriarAbaPendencias     — VISÍVEL (confiança baixa, CLASSIFICAR, coord. dup.,
                             status não classif., postes ignorados pelo filtro)
  → CalcularProximidade + CriarAbaVinculos   (oculta)
  → CriarAbaBOM            — Quantitativo (BOM) (oculta)
  → CriarAbaBlocosPorFamilia ("Blocos")
  → CriarAbaLog ("Log")    — metadados + contagens + duração + caminho
  → Oculta Vinculos e Quantitativo (BOM); move "Blocos" para 1ª aba
  → wb.SaveAs (.xlsx, FORMATO_XLSX) + Close + Quit
  → MostrarAnimacaoVelocidade  (tela HTA de resultado)
```

Tratamento de erro: `On Error GoTo TratarErro` captura `Err.Number/Description/Source` + a variável `estagio` (atualizada a cada etapa), mostrando um `MsgBox` com o estágio exato da falha. Não há fallback quando `n = 0` (sem TEXT/MTEXT) — o fluxo continua e gera as abas baseadas em blocos.

## Abas geradas

| Aba | Visível? | Origem | Descrição |
|-----|----------|--------|-----------|
| `Blocos` | sim (1ª) | `CriarAbaBlocosPorFamilia` | Todos os blocos (postes+cabos+outros+Piauí) em seções por família |
| `Textos` | sim | fluxo principal | 1 linha por TEXT/MTEXT; 16 colunas (ver abaixo) |
| `Resumo` | sim | fluxo principal | Agregações por família/status/altura/cabo + gráficos |
| `Mat. Instalados` | sim | `CriarAbaStatus` | Resumo agrupado `"8 D11600"` — status INSTALADOS |
| `Mat. Desinstalados` | sim | `CriarAbaStatus` | Idem — status DESINSTALADOS |
| `Mat. Existentes` | sim | `CriarAbaStatus` | Idem — status EXISTENTES |
| `Pendencias` | sim | `CriarAbaPendencias` | Confiança baixa, CLASSIFICAR, coords duplicadas, não classificados, **postes ignorados pelo filtro** |
| `Vinculos` | **oculta** | `CriarAbaVinculos` | Cada item vinculado ao poste mais próximo (X,Y) |
| `Quantitativo (BOM)` | **oculta** | `CriarAbaBOM` | Quantitativo por Status × Família × Descrição |
| `Log` | sim | `CriarAbaLog` | Metadados da execução (app, versão, DWG, tempos, contagens, saída) |

> A aba `Alertas` da v3 **não existe mais** — foi substituída pela `Pendencias` (visível). As abas `Postes (Blocos)`, `Cabos (Blocos)` e a `Blocos` unificada (`CriarAbaBlocos`/`CriarAbaCabos`/`CriarAbaBlocosUnificada`) existem como rotinas mas o fluxo principal usa `CriarAbaBlocosPorFamilia`.

### Colunas da aba `Textos` (16)

| # | Coluna | Origem |
|---|--------|--------|
| 1 | Layer | `ent.Layer` |
| 2 | Status | `StatusPorLayer` |
| 3 | Cor ACI | `CorEntidadeSegura`/layer |
| 4 | Nome da Cor | `NomeCorACI` |
| 5 | Conteudo do Texto | TEXT/MTEXT (MText sem códigos) |
| 6 | Familia | `ClassificarComConfianca` |
| 7 | Nome Base (Poste) | `ExtrairNomeBasePoste` |
| 8 | Confianca | `NivelConfianca` (Alta/Media/Baixa) |
| 9 | Score | 0–100 |
| 10–11 | X, Y | ponto de inserção |
| 12 | Altura Texto | `.Height` |
| 13 | Cod. Estrutura | `Mid(texto,10,7)` (destaque amarelo) |
| 14 | Nome do Material | `ExtrairNomeMaterial` (destaque amarelo) |
| 15 | **Fonte da Classificacao** | `FonteClassificacaoTexto` (destaque) |
| 16 | **Revisao** | `RevisaoTexto` (OK / REVISAR) |

**Fonte da Classificação** (`FonteClassificacaoTexto`) retorna, por prioridade: `TEXTO VAZIO` → `HASHTAG + CONTEUDO` → `REGRA DO LAYER RAMAL` → `CODIGO SAP` → `CONTEUDO + LAYER` → `SEM REGRA SUFICIENTE` → `CONTEUDO`.

**Revisão** (`RevisaoTexto`) = `REVISAR` quando status = NÃO CLASSIFICADO, ou família = `CLASSIFICAR`/`-`, ou confiança = `Baixa`; senão `OK`.

## Estrutura de dados em memória

### Arrays paralelos — textos (TEXT/MTEXT)

```vba
arrLayer(), arrAci(), arrCor(), arrTexto(), arrFam(), arrStatus()
arrNomeBase(), arrScore(), arrConfianca(), arrX(), arrY(), arrH()
arrCodEst()         ' Mid(texto,10,7)
arrNomeMaterial()   ' Nome do Material
' (col. 15/16 são calculadas na escrita via FonteClassificacaoTexto/RevisaoTexto)
```

### Arrays paralelos — blocos unificados (u*)

```vba
uTipo(), uFam(), uBloco(), uStat(), uNum(), uDesc(), uBase(),
uDist(), uMet(), uX(), uY()
```

### Rastreio de rejeições (novo na v4.0)

Blocos de poste que não passam no filtro Existente/Projetado são guardados para a aba `Pendencias`:

```vba
rejeitadoNome(), rejeitadoMotivo(), rejeitadoX(), rejeitadoY()
postesIgnorados   ' contagem
```

### Fontes de leitura de blocos

| Função | Blocos alvo | Observações |
|---|---|---|
| `LerBlocosComAtributos` | `RDARA034`, `RDARA1100`, `_POSTE`, demais `RDARA*` com NUMERO+EXISTENTE/PROJETADO | `RDARA034`/`RDARA1100`/`_POSTE` são **DUPLO** (2 linhas: existente + projetado) |
| `LerBlocosCabo` | `RDARA1110`/`RDARA1111` (ou nome com "CABO") | Atributos `TCABO`, `DISTANCIA`, `=DISTANC`, `AM_AI_FA`, `AM_AI_NE`, `DIST_OB` |
| `LerBlocosOutros` | demais `INSERT` com atributos (não poste nem cabo) | Trafo, chave fusível/faca, para-raio, religador, regulador, mufla, isolador — via `FamiliaDeBloco` |
| `LerBlocosPiaui` | blocos-símbolo **sem atributos** (padrão Piauí/PLPT) | `PP`→poste inst.; `EP/PE/PEXIS`→poste exist.; `CB_AT*/CB_BT*`→cabo inst.; `CHAVEP`→chave inst.; `CHFE`→chave exist.; `STRAFOE`/`T7-E`→trafo exist. |

## Regras de negócio principais

### Status por LAYER (`StatusPorLayer`)
| Palavra-chave no layer | Status |
|---|---|
| `RAMAIS_NO_MODEL` | `MATERIAIS INSTALADOS` (prioridade máxima) |
| `#INSTALADO` | `MATERIAIS INSTALADOS` |
| `#RETIRADO` | `MATERIAIS DESINSTALADOS` |
| `A IMPLANTAR` | `MATERIAIS INSTALADOS` |
| `A REMOVER` | `MATERIAIS DESINSTALADOS` |
| `EXISTENTES` | `MATERIAIS EXISTENTES` |
| (nenhuma) | `NAO CLASSIFICADO` |

### Status por NOME DO BLOCO (`StatusPorBloco`) — prioridade sobre o layer
| Bloco | Status |
|---|---|
| `RDARA034`, `RDARA1100`, `_POSTE` | `DUPLO` |
| `RDARA1110`, `RDARA1011`, `RDARA121` | INSTALADOS |
| `RDARA1111`, `RDARA120` | DESINSTALADOS |
| `RDARA164`, `RDARA511`, `RDARA513`, `RDARA514`, `RDARA532`, `RDARA537`, `RDARA547` | EXISTENTES |
| `RDARA1002`, `RDARA1018`, `RDARA1023`, `RDARA1125`, `RDARA175`, `RDARA512` | INSTALADOS (reclassificação) |

`BlocoCasa` casa nome exato ou sufixo de versão (`RDARA120V3`), nunca com outro dígito (`RDARA120` ≠ `RDARA1200`).

**Regra do `#`:** texto/atributo iniciando com `#` força `MATERIAIS DESINSTALADOS` (`ComecaComHashtag`).

#### Bloco `_POSTE` (DUPLO)
Atributos `PST_EXISTENTE` / `PST_INSTALAR` (e `PST_ID` = Nº componente): **Estrutura Existente** sozinha → EXISTENTES; **Existente + a Instalar** → existente vira DESINSTALADOS; **Estrutura a Instalar** → sempre INSTALADOS.

### Classificação de família — texto (`ClassificarFamilia` / `ClassificarComConfianca`)
Famílias por palavra-chave: `ATERRAMENTO` (`ATERR`, `FRANKLIN`, `ATER"`/`ATER "`, ou texto começando com `HAST` após a quantidade — `ComecaComPalavra`), `MUFLA`, `PARA RAIO BT/MT` (`PR RAIO`/`PR-`/`PARA RAIO`/`PARARAIO`), `ELO`, `CH FUS` (`CH FUS`/`CH. FUS`/`CORTA CIRCUITO`/`kV`+`kA`), `CH FACA`, `TRAFO`, `RAMAL` (`mm²` ou `<qtd><CÓDIGO>(<metros>+...)`), `COND NU` (`CAA`), `POSTE DT` (`DT`), `POSTE CIRCULAR` (`C`+dígito+`/`), `POSTE DE MADEIRA` (`M`+dígito), `POSTE FIBRA` (`V`+dígito), `ESTRUTURA MT` (`[TNU]\d`). Sem match → `CLASSIFICAR`.

Antes das comparações, remove-se o envoltório `#(...)` via `RemoverEnvoltorioHashtag`.

### Código SAP de estrutura (prioridade) — `EhCodigoEstruturaSAP` + `FamiliaPosteDoPrefixo`
`Mid(texto,10,7)` só é usado quando o texto tem o formato `<8 dígitos><separador>...` (código SAP, ex.: `66046515-D11600-N3-PR-S1I`). Quando o código extraído começa por prefixo de poste reconhecido (D→DT, V→FIBRA, C→CIRCULAR, M→MADEIRA), **essa família tem prioridade** sobre palavras-chave (anotações acessórias como `-PR-`/`-TR-` não sobrepõem o material principal). `FamiliaPosteDoPrefixo` retorna `""` para prefixos não-poste (N/S/T…), que **não** forçam POSTE.

### Quantidade embutida em blocos / textos
- Para famílias **sem metragem real** (tudo exceto `CABO`/`RAMAL`/`COND NU`/`COND ISOLADO` — `EhFamiliaComMetros`), o campo `uMet`/`bMet` carrega uma **quantidade** embutida:
  - **ISOLADOR**: nº no início da descrição (`ExtrairQuantidadeInicial`) — `"3 ISOL. SUSP."` → 3.
  - **CH FUSIVEL**: valor de `Q2=` na descrição pipe-delimitada (`ExtrairValorChaveNumerico`).
  - demais: 1 por bloco.
- Para **textos** (v4.0): `QuantidadeDoTexto`/`ExtrairQuantidadeMarcada` leem marcadores `Q=`/`QT:`/`QTD =`; sem marcador, 1 por texto.
- No resumo (`CriarAbaStatus`), a coluna **Qtd** soma essas quantidades; para famílias com metragem real, a metragem vai em **Metros (total)**.

### Metros com decimal (`ExtrairMetrosCabo`)
Em textos tipo `"716.0m"`, conta só os dígitos **antes do ponto** como metros (ignora a fração).

### Vínculo por proximidade (`CalcularProximidade`)
Para cada item não-poste, encontra o poste mais próximo (distância euclidiana X,Y). Usado na aba `Vinculos` (oculta).

## Aba `Log` (`CriarAbaLog` / `EscreverCampoLog`)
Tabela Campo × Valor com: Aplicação, Versão, DWG, Início, Fim, Duração (segundos), Textos, Postes aceitos, Postes ignorados, Cabos, Outros materiais, Blocos Piauí, Registros unificados, Arquivo de saída.

## Aba `Pendencias` (`CriarAbaPendencias`)
Seções: **A)** confiança Baixa · **B)** família `CLASSIFICAR` · **C)** coordenadas duplicadas · **D)** status `NAO CLASSIFICADO` · **E)** mesmo nome base em status conflitantes · **F)** blocos de poste ignorados pelo filtro Existente/Projetado (usa `rejeitadoNome/Motivo/X/Y` + `postesIgnorados`).

## Pontos de atenção para futuras mudanças
- **`Mid(texto,10,7)`** é posicional e frágil — só dispara quando `EhCodigoEstruturaSAP` confirma o formato `<8 dígitos><separador>`, e só força poste para prefixos D/V/C/M.
- **`ReDim Preserve`**: todo array novo precisa entrar nos blocos de crescimento espelhados (leitura de texto e as 2 linhas de postes DUPLO).
- **`BlocoCasa`** é a barreira contra falso-positivo entre blocos (`RDARA120` vs `RDARA1200`).
- **`FamiliaPosteDoPrefixo` → `""`** para prefixos não reconhecidos (evita superclassificação como POSTE).
- **Padrão Piauí** coexiste com o RS (`RDARA*`) por não haver sobreposição de nomes.
- **Vinculos / Quantitativo (BOM) só com `n > 0`** (precisam de textos soltos).
- **Automação Excel** sem tratamento de versão (`CreateObject("Excel.Application")`) — falhas caem em `TratarErro`.

## Diferença em relação ao `AnaliseCKCP_OTIMIZADO.bas`
Projeto **independente**: ASBUILTENERGE opera sobre **desenhos CAD** (ZWCAD/AutoCAD, via blocos/atributos/textos); `AnaliseCKCP` opera sobre **planilhas de export do SAP (CKCP)** dentro do Excel. Não compartilham dicionários, variáveis globais nem fluxo.

## Índice de Subs/Functions (71)
O índice completo com números de linha está no próprio `.bas` (`grep -nE "^(Private|Public) (Sub|Function) "`). Principais blocos: leitura de cor (`CorLayerSegura`/`CorEntidadeSegura`), status (`StatusPorLayer`/`StatusPorBloco`), classificação (`ClassificarFamilia`/`ClassificarComConfianca`/`FamiliaDeBloco`), extração (`ExtrairNomeBasePoste`/`ExtrairNomeMaterial`/`ExtrairQuantidade*`), rastreabilidade (`FonteClassificacaoTexto`/`RevisaoTexto`), leitura de blocos (`LerBlocos*`), abas (`CriarAba*`), macro principal (`ExportarTextosParaExcel`) e tela final (`MostrarAnimacaoVelocidade`).
