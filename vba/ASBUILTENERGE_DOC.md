# ASBUILTENERGE (ExportTextos.bas) — Extração de As-Built de Desenhos CAD

Módulo VBA para **ZWCAD 2024+** (compatível AutoCAD) que varre um desenho CAD de as-built de rede elétrica de distribuição e gera uma planilha Excel estruturada com o quantitativo de materiais (postes, cabos, chaves, trafos, aterramentos, etc.), classificados por status (instalado / desinstalado / existente) e família.

## Arquivo fonte

`vba/ASBUILTENERGE.bas` — cabeçalho interno `ExportTextos.bas v3.2`, 4.481 linhas.

> Observação: o nome interno do módulo (`ExportTextos`) difere do nome do arquivo enviado (`ASBUILTENERGE`). Ambos se referem ao mesmo código-fonte.

## Como usar

1. Abrir o desenho `.dwg` do as-built no ZWCAD (ou AutoCAD).
2. `Alt+F11` (VBA IDE) → Importar `ASBUILTENERGE.bas` como módulo.
3. Rodar a macro `ExportarTextosParaExcel` (via `Alt+F8` ou `-VBARUN`).
4. O Excel é aberto em segundo plano (invisível), processado, salvo e fechado automaticamente. O resultado é salvo em `%USERPROFILE%\Downloads\<NomeDoDesenho>_TEXTOS.xlsx` (ou com timestamp se já existir).
5. Ao final, uma tela HTA (`mshta.exe`) exibe um resumo da exportação (contagens) — ver `MostrarAnimacaoVelocidade`.

## Fluxo de execução (`ExportarTextosParaExcel`, linha 3521)

```
Monta mapa Layer → Cor ACI (CorLayerSegura)
  → Itera ThisDrawing.Blocks (ModelSpace/Layout/XRef) procurando TEXT/MTEXT
      → Classifica cada texto: Familia + Score de confiança (ClassificarComConfianca)
      → Extrai Status (StatusPorLayer), Nome Base (poste), Cod. Estrutura (Mid(txt,10,7))
  → Cria Workbook Excel (Excel.Application invisível)
  → Aba "Textos"      — 1 linha por TEXT/MTEXT lido, com todas as colunas calculadas
  → Aba "Resumo"       — agregações (por família, status, altura de poste, cabos, outros) + gráficos
  → LerBlocosComAtributos   — INSERTs de postes com atributos NUMERO/EXISTENTE/PROJETADO/...
  → LerBlocosCabo           — INSERTs RDARA1110/1111 (cabos) com atributos TCABO/DISTANCIA/...
  → LerBlocosOutros         — INSERTs genéricos (trafo, chave, religador, para-raio, mufla...)
  → LerBlocosPiaui          — blocos-símbolo sem atributos (padrão Piauí: PP, EP, CB_AT...)
  → Unifica tudo em arrays u* (uTipo/uFam/uBloco/uStat/uDesc/uBase/uDist/uMet/uX/uY)
  → CriarAbaStatus × 3      — "Mat. Instalados" / "Mat. Desinstalados" / "Mat. Existentes"
  → CriarAbaAlertas         — (só se houver textos) inconsistências/baixa confiança
  → CalcularProximidade + CriarAbaVinculos   — vincula item → poste mais próximo (X,Y)
  → CriarAbaBOM             — quantitativo agrupado por Status/Família/Descrição
  → CriarAbaBlocosPorFamilia ("Blocos")      — aba unificada organizada em seções por família
  → Oculta abas auxiliares (Alertas, Vinculos, Quantitativo (BOM))
  → Move "Blocos" para 1ª posição, depois CriarAbaPainel insere "PAINEL" como 1ª aba
  → wb.SaveAs (.xlsx) + wb.Close + xl.Quit
  → MostrarAnimacaoVelocidade   — tela HTA de resultado (mshta.exe)
```

Tratamento de erro: `On Error GoTo TratarErro` captura `Err.Number/Description/Source` e a variável `estagio` (atualizada a cada etapa), mostrando um `MsgBox` com o estágio exato da falha. Não há fallback quando `n = 0` (nenhum TEXT/MTEXT) — o fluxo continua e gera as abas baseadas em blocos normalmente.

## Abas geradas

| Aba | Origem | Descrição |
|-----|--------|-----------|
| `PAINEL` | `CriarAbaPainel` | Dashboard executivo — primeira aba, números consolidados |
| `Blocos` | `CriarAbaBlocosPorFamilia` | Todos os blocos (postes+cabos+outros+Piauí) organizados em seções por família |
| `Textos` | fluxo principal | 1 linha por TEXT/MTEXT do desenho, com classificação completa (colunas 1-13 + coluna 14 "Nome do Material") |
| `Resumo` | fluxo principal | Agregações por família/status/altura/cabo + 2 gráficos (barras, pizza) |
| `Mat. Instalados` | `CriarAbaStatus` | Só o resumo agrupado (Item "8 D11600", Qtd, Material, Família/Tipo, Metros) — status "MATERIAIS INSTALADOS" |
| `Mat. Desinstalados` | `CriarAbaStatus` | Idem, para status "MATERIAIS DESINSTALADOS" |
| `Mat. Existentes` | `CriarAbaStatus` | Idem, para status "MATERIAIS EXISTENTES" |
| `Alertas` *(oculta)* | `CriarAbaAlertas` | Confiança baixa, família `CLASSIFICAR`, coordenadas duplicadas, status não classificado, postes com status conflitante |
| `Vinculos` *(oculta)* | `CriarAbaVinculos` | Cada item vinculado ao poste mais próximo (proximidade X,Y) |
| `Quantitativo (BOM)` *(oculta)* | `CriarAbaBOM` | Quantitativo agrupado por Status × Família × Descrição (metros para cabos, contagem para o resto) |

## Estrutura de dados em memória

### Arrays paralelos — textos (TEXT/MTEXT do desenho)

Populados no laço principal de `ExportarTextosParaExcel`, redimensionados dinamicamente (capacidade dobra ao estourar):

```vba
arrLayer()    As String   ' nome do layer
arrAci()      As Integer  ' cor ACI resolvida (entidade > layer > fallback 7)
arrCor()      As String   ' nome amigável da cor (NomeCorACI)
arrTexto()    As String   ' conteúdo do TEXT/MTEXT (MText sem códigos de formatação)
arrFam()      As String   ' família classificada (ClassificarComConfianca)
arrStatus()   As String   ' status pelo layer (StatusPorLayer)
arrNomeBase() As String   ' nome base extraído (ExtrairNomeBasePoste)
arrScore()    As Integer  ' score de confiança 0..100
arrConfianca() As String  ' "Alta" / "Media" / "Baixa" (NivelConfianca)
arrX(), arrY() As Double  ' ponto de inserção
arrH()        As Double   ' altura do texto
arrCodEst()   As String   ' Mid(texto, 10, 7) — código de estrutura fixo por posição
arrNomeMaterial() As String ' NOME DO MATERIAL (planilha RECLASSIFICAR MATERIAL — ver abaixo)
```

### Arrays paralelos — blocos unificados (u*)

Montados a partir de 4 fontes (postes, cabos, outros, Piauí) e usados por `CriarAbaStatus`, `CriarAbaBlocosPorFamilia`, `CriarAbaPainel`:

```vba
uTipo(), uFam()   As String   ' tipo/família final (pode ser reclassificado por descrição)
uBloco()          As String   ' nome do bloco (INSERT) no CAD
uStat()           As String   ' status final (MATERIAIS INSTALADOS/DESINSTALADOS/EXISTENTES)
uNum()            As String   ' atributo NUMERO (só postes)
uDesc()           As String   ' descrição textual (atributo relevante ou concatenação)
uBase()           As String   ' nome base / família do cabo
uDist()           As String   ' distância textual (ex.: "485,5m")
uMet()            As Double   ' metros (só cabos)
uX(), uY()        As Double   ' coordenadas
```

### Tipos de fonte de bloco

| Função de leitura | Blocos alvo | Observações |
|---|---|---|
| `LerBlocosComAtributos` | `RDARA034`, `RDARA1100`, demais `RDARA*` com atributo NUMERO+EXISTENTE/PROJETADO | Postes/estruturas. `RDARA034`/`RDARA1100` são "DUPLO": geram 2 linhas (existente + projetado) |
| `LerBlocosCabo` | `RDARA1110`/`RDARA1111` (ou nome contendo "CABO") | Cabos com atributos `TCABO`, `DISTANCIA`, `=DISTANC` (calculada), `AM_AI_FA`, `AM_AI_NE`, `DIST_OB` |
| `LerBlocosOutros` | Demais `INSERT` com atributos, que não são poste nem cabo | Trafo, chave fusível/faca, para-raio, religador, regulador, mufla, aterramento, etc. Classificados via `FamiliaDeBloco` |
| `LerBlocosPiaui` | Blocos-símbolo **sem atributos**, identificados só pelo **nome** (padrão Piauí/PLPT) | `PP`→poste instalado, `EP/PE/PEXIS`→poste existente, `CB_AT*/CB_BT*`→cabo instalado, `CHAVEP`→chave instalada, `CHFE`→chave existente, `STRAFOE`/`T7-E`→trafo existente |

## Regras de negócio principais

### Status por LAYER (`StatusPorLayer`)
Fallback quando o bloco não define status.

| Palavra-chave no layer | Status |
|---|---|
| `RAMAIS_NO_MODEL` / `RAMAIS NO MODEL` | MATERIAIS INSTALADOS (regra explícita, prioridade máxima) |
| `#INSTALADO` | MATERIAIS INSTALADOS |
| `#RETIRADO` | MATERIAIS DESINSTALADOS |
| `TEXTOS A IMPLANTAR` / `A IMPLANTAR` | MATERIAIS INSTALADOS |
| `TEXTOS A REMOVER` / `A REMOVER` | MATERIAIS DESINSTALADOS |
| `TEXTOS EXISTENTES` / `EXISTENTES` | MATERIAIS EXISTENTES |
| (nenhuma) | NAO CLASSIFICADO |

### Status por NOME DO BLOCO (`StatusPorBloco`) — **prioridade sobre o layer**

| Bloco | Status |
|---|---|
| `RDARA034`, `RDARA1100` | `DUPLO` (existente=desinstalado quando ambos preenchidos ou hashtag; projetado=sempre instalado) |
| `RDARA1110`, `RDARA1011`, `RDARA121` | MATERIAIS INSTALADOS |
| `RDARA1111`, `RDARA120` | MATERIAIS DESINSTALADOS |
| `RDARA164`, `RDARA511`, `RDARA513`, `RDARA514`, `RDARA532`, `RDARA537`, `RDARA547` | MATERIAIS EXISTENTES |
| `RDARA1002`, `RDARA1018`, `RDARA1023`, `RDARA1125`, `RDARA175`, `RDARA512` | MATERIAIS INSTALADOS (reclassificação — planilha "RECLASSIFICAR MATERIAL") |

`BlocoCasa` faz o match seguro: aceita nome exato ou sufixo de versão (`RDARA120V3`), mas nunca casa com outro dígito (`RDARA120` ≠ `RDARA1200`).

**Regra do `#`**: qualquer atributo/texto começando com `#` força status **MATERIAIS DESINSTALADOS**, sobrepondo tudo (`ComecaComHashtag` / `temHashPoste`).

### Classificação de família — texto livre (`ClassificarFamilia` + `ClassificarComConfianca`)

Famílias reconhecidas por palavra-chave no conteúdo do TEXT/MTEXT: `ATERRAMENTO`, `MUFLA`, `PARA RAIO BT/MT`, `ELO`, `CH FUS`, `CH FACA`, `TRAFO`, `RAMAL` (padrão `mm²` **ou** padrão `<qtd><CODIGO>(<metros>+...)` — ver abaixo), `COND NU` (padrão `#CAA`), `POSTE DT` (prefixo `DT`), `POSTE CIRCULAR` (prefixo `C`), `POSTE DE MADEIRA` (prefixo `M`, ex. `M9`, `M11`), `POSTE FIBRA` (prefixo `V`, ex. `V9600`, `V11300`), `ESTRUTURA MT` (regex `[TNU]\d`). Sem match → `CLASSIFICAR`.

Antes de qualquer comparação, `ClassificarFamilia`/`ExtrairNomeBasePoste` chamam `RemoverEnvoltorioHashtag`, que desembrulha textos de material desinstalado no formato `#(...)` (ex.: `"#(M9-S203-EPP)"` → `"M9-S203-EPP"`) para que as regras de prefixo continuem funcionando — o `#` em si já é tratado à parte para o STATUS.

Score de confiança (0-100, ver `ClassificarComConfianca`): soma pontos por padrão de conteúdo (sinais fortes = 40-50 pts: `ATERR`, `MUFLA`, `PARA RAIO`, `CH.FUS`, `CH.FACA`, `KVA`, `#CAA`, `ELO`, padrão RAMAL com parênteses; sinais médios = 10-30 pts) + reforço/correção pelo nome do **layer** (`FamiliaPorLayer`, ±25-30 pts, agora com dicas para `MADEIRA`/`FIBRA` também). Nível: `>=70` Alta, `45..69` Media, `<45` Baixa (`NivelConfianca`).

#### RAMAL com metragem entre parênteses (`EhPadraoRamalMetros` / `ExtrairCodigoRamal` / `SomarMetrosRamal`)

Padrão reconhecido: `<quantidade opcional><CODIGO letras+dígitos>(<trecho1>+<trecho2>+...)`, ex.: `"7T10(30m+18m+25m+30m+26m+10m+10)"` ou `"4T10(12m+11m+15m+14m)-2Q10(20m+18m)"` (pode haver múltiplos grupos separados por `-`; múltiplos grupos possíveis). Também aceito envolto em `"#(...)"` quando desinstalado.
- `ExtrairCodigoRamal` retorna o **primeiro** código encontrado (ex.: `"T10"`) — usado como "NOME DO MATERIAL" mesmo quando há mais de um grupo no mesmo texto.
- `SomarMetrosRamal` soma **todos** os valores numéricos dentro de **todos** os grupos de parênteses do texto (aceita valores com ou sem sufixo `"m"`).

#### Postes por prefixo de código (`FamiliaPosteDoPrefixo`)

Quando o poste é identificado via o "Cod. Estrutura" posicional (`Mid(texto,10,7)`, ver abaixo) em vez do início do texto, a família específica é deduzida pelo prefixo do código extraído:

| Prefixo | Família |
|---|---|
| `D...` (ex.: `D11600`) | `POSTE DT` |
| `V...` (ex.: `V9600`, `V11300`) | `POSTE FIBRA` |
| `C...` | `POSTE CIRCULAR` |
| `M...` (ex.: `M9`, `M11`) | `POSTE DE MADEIRA` |
| outro | `POSTE` (genérico) |

#### Coluna "Nome do Material" (`ExtrairNomeMaterial`)

Nova coluna na aba `Textos` (posição 14, após "Cod. Estrutura"), calculada a partir da família já determinada:
- Famílias de poste (`POSTE DT/FIBRA/CIRCULAR/DE MADEIRA`) → código do poste (`D11600`, `V9600`, `M9`, etc.), priorizando o valor extraído via Cod. Estrutura quando presente.
- `RAMAL` → código do material via `ExtrairCodigoRamal` (ex.: `T10`).
- Demais famílias → vazio.

Essa reclassificação foi levantada a partir da planilha `RECLASSIFICAR.xlsx` (abas `TEXTOS` e `BLOCO`), fornecida pelo usuário como base de exemplos reais para calibrar as regras acima.

### Classificação de família — blocos com atributos (`FamiliaDeBloco`)
Prioridade: (1) `FamiliaForcadaBloco` (mapa fixo por nome de bloco — ver tabela de status acima), (2) `EhBlocoCabo`/`EhBlocoPoste` (nome ou palavra "CABO"/"POSTE"), (3) palavra-chave em nome+atributos (RELIGADOR, REGULADOR, PARA RAIO, FUSIVEL, CH FACA, CHAVE, TRAFO, MUFLA, ATERR, MEDIDOR, CAPACITOR, RAMAL) → senão `OUTRO`.

### Reclassificação na unificação (dentro de `ExportarTextosParaExcel`)
Ao montar os arrays `u*`, a descrição do bloco de poste/outro é reavaliada:
- contém `ATERR` → família `ATERRAMENTO`
- começa com `MT`/`BT` → família `CABO` (mesmo vindo de um bloco "poste")
- nome base com **1 dígito** (ex.: `CE1`, `N3`) → `ESTRUTURA` (não `POSTE`, que exige ≥2 dígitos — `ContaDigitosBase`)
- caso contrário → `POSTE`
- descrição começando com `#` → força `MATERIAIS DESINSTALADOS`

### Extração de nome base de poste (`ExtrairNomeBasePoste` / `ExtrairNomeBasePosteBloco`)
Extrai prefixo de letras (até 3) + primeiro bloco de dígitos + opcionalmente `/dígitos`. Ex.: `"C12/600 N3-N3D S021"` → `"C12/600"`; `"M11 N1 S024 EA1"` → `"M11"`; `"DT11/300 N1 S034"` → `"DT11/300"`.

### Código de Estrutura fixo
Para cada TEXT/MTEXT, extrai `Mid(conteudo, 10, 7)` como "Cod. Estrutura" (coluna fixa por posição de caractere — assume um formato de texto padronizado do desenho, ex.: `"66046515-D11600-N3-PR-S1I"` → `"D11600"`). Se esse trecho tiver padrão de poste válido e a família ainda não foi determinada, a família passa a ser deduzida pelo prefixo do código via `FamiliaPosteDoPrefixo` (score 85) em vez do genérico `POSTE`.

### Vínculo por proximidade (`CalcularProximidade`)
Para cada item que não é poste, encontra o poste mais próximo (distância euclidiana em X,Y). Postes vinculam consigo mesmos (distância 0). Usado na aba `Vinculos`.

## Cores e Layout

| Constante/uso | Cor | Contexto |
|---|---|---|
| Título "MATERIAIS INSTALADOS" | Verde `RGB(0,112,0)` | `CriarAbaStatus` |
| Título "MATERIAIS DESINSTALADOS" | Vermelho `RGB(180,0,0)` | `CriarAbaStatus` |
| Título "MATERIAIS EXISTENTES" | Azul `RGB(0,70,140)` | `CriarAbaStatus` |
| Confiança Alta/Media/Baixa | Verde/Amarelo/Vermelho `RGB(198,239,206)` / `RGB(255,235,156)` / `RGB(255,199,206)` | Aba `Textos` |
| Cabeçalhos de seção | Azul `RGB(68,114,196)` texto branco | `EscreverSecao` (aba Resumo) |
| Título aba Alertas | Vermelho `RGB(192,0,0)` | `CriarAbaAlertas` |

## Gráficos (aba Resumo)

`AdicionarGraficos`: escreve dados auxiliares em colunas ocultas (P/Q para família, S/T para status) e cria:
- Gráfico de barras horizontais (`xlBarClustered`) — Total por Família de Material.
- Gráfico de pizza (`xlPie`) — Distribuição por Status, com rótulos de percentual.

## Tela final (HTA)

`MostrarAnimacaoVelocidade` (linha 4393) gera um `.hta` temporário e o abre via `mshta.exe` (requer Windows), exibindo um resumo simples e "flat" (sem animações) com as contagens da exportação (textos, postes, cabos, outros, Piauí, caminho do arquivo salvo).

## Diferenças em relação ao módulo `AnaliseCKCP_OTIMIZADO.bas`

Este módulo é um projeto **independente** do `AnaliseCKCP_OTIMIZADO.bas` (documentado no `CLAUDE.md` da raiz): opera sobre **desenhos CAD** (ZWCAD/AutoCAD, via automação de blocos/atributos/entidades de texto) para gerar o levantamento de as-built, enquanto o `AnaliseCKCP` opera sobre **planilhas de export do SAP (CKCP)** dentro do próprio Excel. Não compartilham dicionários, variáveis globais nem fluxo de execução.

## Pontos de atenção para futuras mudanças

- **`Mid(texto, 10, 7)`** (Cod. Estrutura) é posicional e frágil — qualquer mudança no padrão de texto do desenho quebra essa extração.
- **Filtro `nB > cap` / `ReDim Preserve`**: todo array novo precisa ser adicionado nos blocos de crescimento (há 4 pontos de crescimento espelhados: leitura de texto, leitura de postes DUPLO linha 1 e linha 2).
- **`BlocoCasa`** é a única barreira contra falso-positivo entre blocos (`RDARA120` vs `RDARA1200`) — qualquer novo código de bloco deve ser adicionado com atenção a colisões de prefixo.
- **Padrão Piauí (`MapaPiaui`) coexiste com o padrão RS (`RDARA*`)** por não haver sobreposição de nomes; novos padrões regionais devem seguir o mesmo cuidado.
- **Abas auxiliares (`Alertas`, `Vinculos`, `Quantitativo (BOM)`) só são geradas se `n > 0`** (existem textos soltos no desenho) — desenhos 100% baseados em blocos com atributos não as populam.
- **Automação Excel é síncrona e sem tratamento de versão** (`CreateObject("Excel.Application")`) — falhas de Excel não instalado ou versão incompatível caem no handler genérico `TratarErro`.
