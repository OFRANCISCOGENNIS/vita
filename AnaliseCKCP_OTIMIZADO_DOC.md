# AnaliseCKCP_OTIMIZADO.bas — Documentação completa

Documentação de referência do módulo VBA `vba/AnaliseCKCP_OTIMIZADO.bas`. Este
arquivo é a fonte de verdade para o índice de Subs/Functions com números de
linha — deve ser **lido antes de qualquer alteração** no `.bas` e **atualizado
depois de qualquer alteração** (linhas deslocadas, subs/functions
adicionadas/removidas, novas entradas de catálogo, etc).

Visão geral de negócio, fluxo de execução, abas geradas, dicionários e regras
já estão descritos no `CLAUDE.md` da raiz do repositório — este documento foca
no índice técnico linha a linha do código-fonte.

## Metadados do arquivo

| Item | Valor |
|------|-------|
| Arquivo | `vba/AnaliseCKCP_OTIMIZADO.bas` |
| VB_Name | `AnaliseCKCP` |
| Linhas | 6.175 |
| Subs | 60 |
| Functions | 71 |
| Option Explicit | Sim |

## Variáveis e estado de módulo (linhas 15–59)

- `gEtapa` (17): rastreio de etapa atual, usado pelo handler de erro `Falha` em `GerarRelatorio` para diagnóstico.
- Índices de coluna da base crua (20–30): `cPEP`, `cClasse`, `cDescClasse`, `cMaterial`, `cTexto`, `cQtd`, `cUML`, `cValor`, `cClassif`, `cDescSA`, `cCentro`, `cEmpresa`, `cObj`, `cDenObj`, `cDenClasse`, `cDocCompra`, `cNumDoc`, `cDenominacao`, `cUsuario`, `cNumDocRef`, `cDataLanc`, `cHora`, `cDataEntrada`, `cTipoDoc`, `cAno`, `cDivisao`, `cDataDoc`, `cLinhaLanc`, `cODI`, `cSA`, `cDocEstorno`, `cOrgEstorno`, `cEstorno`, `cRefEstorno`, `cOperRef`, `cCLS1Raw`, `cCLS2Raw`, `cCLS3Raw`, `cTipoAplicRaw` — todos preenchidos por `MapearColunas`.
- Cores do módulo principal (33–35): `COR_HDR`, `COR_OK`, `COR_BAD`.
- Estado de dados (37–39): `wsRaw`, `dados`, `nLin`.
- Dicionários de catálogo (40–45): `dCatMat`, `dCatSrv`, `dCatCC`, `dCabo`, `dCombo`, `dTipoCls`.
- `rawHeaders`, `rawColCount`, `gSplashOK` (46–48).
- Compartilhamento entre módulos — Fase 1.2 (50–54): `dMvSVerd`, `dMvSFamNC`, `dMvSDif` (vereditos ODI de `Gerar_MaterialVsServico` reusados em `Gerar_PainelExecutivo`).
- Cache de CONFIG — Fase 4.1 (56–58): `dCfg`, `dClsViagem`.
- Cores do módulo AT (67–79): `COR_HEADER`, `COR_INCONF_BG`, `COR_INCONF_FG`, `COR_ADER_OK`, `COR_ADER_DIV`, `COR_ADER_ERR`, `COR_GRUPO_A`, `COR_GRUPO_B`, `COR_SEM_GRUPO_A`, `COR_TIPO_D_BG`, `COR_TIPO_D_FG`, `COR_TIPO_C_BG`, `COR_TIPO_C_FG`.
- `tItem` (81–102): registro usado em `aItens()` no módulo `MAT vs SERV AT` (ver `CLAUDE.md` para os campos).

## Índice de Subs e Functions (linha → assinatura)

### Rotina principal e splash

| Linha | Assinatura |
|-------|------------|
| 115 | `Sub GerarRelatorio()` |
| 218 | `Private Sub MostrarTelaFuturista(ByVal nLin As Long, ByVal seg As Double)` |
| 293 | `Private Sub AddTxt(ws As Worksheet, nm As String, L As Double, T As Double, _)` |
| 314 | `Private Sub MetricBlock(ws As Worksheet, nm As String, L As Double, T As Double, _)` |
| 322 | `Private Sub LimparSplash()` |
| 333 | `Public Sub FecharSplash(Optional ByVal ignorar As Variant)` |

### Localização, mapeamento e carga da base

| Linha | Assinatura |
|-------|------------|
| 343 | `Private Function LocalizarBase() As Worksheet` |
| 370 | `Private Function MapearColunas(ws As Worksheet) As Boolean` |
| 424 | `Private Function TemCabecalhosMinimos(ws As Worksheet) As Boolean` |
| 433 | `Private Function PontuarBase(ws As Worksheet) As Long` |
| 443 | `Private Function ColLike(ws As Worksheet, frags As Variant) As Long` |
| 467 | `Private Function SemAcento(ByVal s As String) As String` |
| 483 | `Private Sub CarregarDados(ws As Worksheet)` |
| 506 | `Private Function ValorCampo(ByVal lin As Long, ByVal col As Long, Optional ByVal padrao As Variant = "") As Variant` |
| 516 | `Private Function TextoCampo(ByVal lin As Long, ByVal col As Long, Optional ByVal padrao As String = "") As String` |
| 520 | `Private Function ValorMatriz(m As Variant, ByVal lin As Long, ByVal col As Long, Optional ByVal padrao As Variant = "") As Variant` |
| 530 | `Private Function TextoMatriz(m As Variant, ByVal lin As Long, ByVal col As Long, Optional ByVal padrao As String = "") As String` |
| 534 | `Private Function LinhaCLS1(ByVal lin As Long) As String` |
| 538 | `Private Function LinhaCLS2(ByVal lin As Long) As String` |
| 542 | `Private Function LinhaCLS3(ByVal lin As Long) As String` |
| 546 | `Private Function LinhaTipoAplic(ByVal lin As Long) As String` |
| 550 | `Private Function MatInfoLinha(ByVal lin As Long, ByVal idx As Long) As String` |
| 572 | `Private Function Cls2SrvOverride(codSrv As Variant) As String` |
| 581 | `Private Function SrvInfoLinha(ByVal lin As Long, ByVal idx As Long) As String` |
| 605 | `Private Function TipoPEPCodigo(ByVal pep As String) As String` |
| 614 | `Private Function TipoPEPANEEL(ByVal pep As String) As String` |
| 622 | `Private Function ClassificacaoPendente(ByVal cls1 As String, ByVal cls2 As String, ByVal cls3 As String) As Boolean` |

### Catálogos externos e embutidos

| Linha | Assinatura |
|-------|------------|
| 634 | `Private Sub CarregarCatalogoMateriais()` |
| 688 | `Private Sub CarregarDescServico()` — catálogo embutido `dDescSrv` (COD_SERVICO → descrição), fonte: planilha `base_servi_os.xlsx` |
| 1212 | `Private Function DescServico(ByVal cod As String) As String` |
| 1219 | `Private Function NormCod(v As Variant) As String` |
| 1229 | `Private Function CatInfo(codMat As Variant, idx As Long) As String` |
| 1242 | `Private Sub CarregarCatalogoServicos()` |
| 1294 | `Private Function SrvInfo(codSrv As Variant, idx As Long) As String` |
| 1309 | `Private Sub CarregarCatalogoClasse()` |
| 1360 | `Private Sub CarregarClassificacaoClassesDados()` |
| 1431 | `Private Sub AddClasseCusto(ByVal cod As String, ByVal cls1 As String, ByVal cls2 As String, ByVal cls3 As String)` |
| 1437 | `Private Function CCInfo(codCC As Variant, idx As Long) As String` |
| 1453 | `Private Sub CarregarConversoesCabo()` |
| 1488 | `Private Function CaboFator(codMat As Variant) As Double` |
| 1502 | `Private Sub CarregarComboServico()` |
| 1553 | `Private Function ComboFator(codSrv As Variant) As Double` |
| 1575 | `Private Sub CarregarTipoClassif()` |
| 1606 | `Private Function NormClassif(ByVal s As String) As String` |
| 1621 | `Private Function TipoDaClassif(ByVal classif As String, _)` |

### Utilitárias de classificação e cálculo

| Linha | Assinatura |
|-------|------------|
| 1638 | `Private Function FamiliaAlias(ByVal cls2 As String) As String` |
| 1646 | `Private Function EhCabo(ByVal cls2 As String) As Boolean` |
| 1653 | `Private Function CobertoReligador(ByVal cls2 As String) As Boolean` |
| 1659 | `Private Function DentroMargem(ByVal a As Double, ByVal b As Double) As Boolean` |
| 1674 | `Private Function PEP3(ByVal pep As String) As String` |
| 1683 | `Private Function SegmentoPI(ByVal pep As String) As String` |
| 1692 | `Private Function GrupoPerc(ByVal pep As String) As String` |
| 1701 | `Private Function EhMaterial(ByVal classif As String) As Boolean` |
| 1706 | `Private Function ToNum(v As Variant) As Double` |

### Geradores de abas (relatórios)

| Linha | Assinatura | Aba gerada |
|-------|------------|------------|
| 1714 | `Private Sub Gerar_RazaoCJ()` | `RAZAO CJ` |
| 1774 | `Private Sub Gerar_MaterialVsServico()` | `MATERIAL vs SERVICO` (popula `dMvSVerd`/`dMvSFamNC`/`dMvSDif`) |
| 2307 | `Private Sub Gerar_AnaliseCA()` | `ANALISE DE CA` |
| 2411 | `Private Function ValorCat(dGrp As Object, ByVal pep As String, ByVal cat As String) As Double` | — |
| 2416 | `Private Function CategoriaAnaliseCA(ByVal lin As Long) As String` | — |
| 2464 | `Private Function CategoriaPorClasseCusto(ByVal lin As Long) As String` | — |
| 2479 | `Private Function ClasseCustoDadosOutros(codCC As Variant) As Boolean` | — |
| 2485 | `Private Function MapCategoriaCA(ByVal valor As String) As String` | — |
| 2524 | `Private Sub Gerar_ClasseDeCusto()` | `CLASSE DE CUSTO` |
| 2573 | `Private Sub Gerar_Material()` | `MATERIAL` |
| 2659 | `Private Sub Gerar_Servico()` | `SERVICO` |
| 2727 | `Private Sub Gerar_AlertasCriticos()` | `ALERTAS CRITICOS` |
| 3078 | `Private Sub EscreverCardAlerta(ws As Worksheet, ByVal r As Long, ByVal c As Long, _)` | — |
| 3100 | `Private Function EscreverCabecalhoAlerta(ws As Worksheet, ByVal startRow As Long, _)` | — |
| 3140 | `Private Sub Gerar_Regras()` | `REGRAS` |
| 3215 | `Private Sub EscreverAba(nome As String, outp() As Variant)` | (helper genérico) |
| 3253 | `Private Sub OrdenarAba(ws As Worksheet, ByVal nome As String, _)` | (helper genérico) |
| 3377 | `Private Sub Gerar_PainelExecutivo()` | `PAINEL EXECUTIVO` (consome `dMvSVerd`/`dMvSFamNC`/`dMvSDif`) |
| 3611 | `Private Function EhClasseViagem(ByVal cod As String) As Boolean` | — |
| 3622 | `Private Function DescClasseViagem(ByVal cod As String) As String` | — |
| 3638 | `Private Sub Gerar_ServicoSemMaterial()` | `SERVICO SEM MATERIAL` |
| 3735 | `Private Sub Gerar_PortfolioObra()` | `PORTFOLIO OBRA` |
| 3871 | `Private Sub Gerar_NaoClassificados()` | `NAO CLASSIFICADOS` |
| 3954 | `Private Sub Gerar_RacionalizacaoCOM()` | `RACIONALIZACAO COM` |
| 4116 | `Private Function CriarMapaNT006_RC() As Object` | — |
| 4208 | `Private Sub AddMatRC(d As Object, ByVal cod As String, ByVal familia As String, _)` | — |
| 4230 | `Private Function EhPepEmergencia(ByVal pep As String) As Boolean` | — |
| 4235 | `Private Function AtvPrevista(ByVal pep As String, ByVal valorMaoObra As Double) As Double` | — |

### Formatação, config e organização

| Linha | Assinatura |
|-------|------------|
| 4245 | `Private Function ColExata(ws As Worksheet, frags As Variant) As Long` |
| 4258 | `Private Sub AplicarFreeze(ws As Worksheet, ByVal celula As String, _)` |
| 4275 | `Private Function CategoriaVeredito(ByVal v As String) As Long` |
| 4291 | `Private Sub ColorirColunaVeredito(ws As Worksheet, ByVal jc As Long, ByVal nR As Long)` |
| 4313 | `Private Sub PintarRunVeredito(ws As Worksheet, ByVal jc As Long, _)` |
| 4333 | `Private Sub PintarStatusRC(ws As Worksheet, ByVal linIni As Long, _)` |
| 4353 | `Private Sub GarantirConfig()` |
| 4407 | `Private Sub CarregarConfig()` |
| 4434 | `Private Function CfgTxt(ByVal chave As String, ByVal padrao As String) As String` |
| 4445 | `Private Function CfgNum(ByVal chave As String, ByVal padrao As Double) As Double` |
| 4455 | `Private Function CaminhoCatalogo(ByVal chave As String, ByVal padrao As String) As String` |
| 4474 | `Private Function EhColunaVeredito(ByVal hh As String) As Boolean` |
| 4481 | `Private Function CorAba(ByVal nome As String) As Long` |
| 4499 | `Private Function FormatoColuna(ByVal hh As String) As String` |
| 4521 | `Private Sub FormatarVisualAba(ws As Worksheet, ByVal nome As String, _)` |
| 4609 | `Private Sub OrganizarAbas()` |

### Módulo AT — `MAT vs SERV AT`

| Linha | Assinatura |
|-------|------------|
| 4633 | `Private Sub Gerar_MatVsServAT()` |
| 4653 | `Private Sub CarregarDados_AT()` |
| 4711 | `Private Sub CarregarCorresp()` |
| 4777 | `Private Function AcharAbaCorresp() As Worksheet` |
| 4789 | `Private Function AchaCorrespNoWb(ByVal wb As Workbook) As Worksheet` |
| 4807 | `Private Function NomeNorm(ByVal s As String) As String` |
| 4821 | `Private Sub AplicarRegrasPreAgrupamento()` |
| 4868 | `Private Sub AgruparItens()` |
| 4939 | `Private Sub AplicarRegrasPosAgrupamento()` |
| 5074 | `Private Sub PadronizarCls2()` |
| 5120 | `Private Sub CalcularMatSrv()` |
| 5231 | `Private Sub CalcularAderencia()` |
| 5439 | `Private Sub CalcularTipoCusto()` |
| 5455 | `Private Sub CalcularPctMop()` |
| 5494 | `Private Sub OrdenarPorGrupo()` |
| 5535 | `Private Sub QuickSortIdx(keys() As String, idx() As Long, ByVal lo As Long, ByVal hi As Long)` |
| 5556 | `Private Function DeveOrdenar(a As tItem, b As tItem) As Boolean` |
| 5577 | `Private Function TipoOrdem(a As tItem) As Integer` |
| 5587 | `Private Sub EscreverAbaAT()` |
| 5763 | `Private Function CleanCod(v As String) As String` |
| 5771 | `Private Function TemSaldo(val As Double, qtd As Double) As Boolean` |
| 5775 | `Private Function ContemPalavra(txt As String, palavra As String) As Boolean` |
| 5779 | `Private Function EhAutoCorrespondente(code As String) As Boolean` |
| 5789 | `Private Function EhNaCorresp(code As String) As Boolean` |
| 5799 | `Private Function GetTipoServico(code As String) As String` |
| 5814 | `Private Function GetGrupoKey(code As String) As String` |
| 5850 | `Private Function PepExisteComSufixo(pep3 As String, sufixo As String) As Boolean` |
| 5860 | `Private Function PepTemMob(pep3 As String, sufixo As String) As Boolean` |

### Aba `PREMISSAS`

| Linha | Assinatura |
|-------|------------|
| 5882 | `Private Sub CriarPremissas()` |
| 6113 | `Private Sub SecaoTitulo(ws As Worksheet, rowN As Integer, titulo As String)` |
| 6125 | `Private Sub TabelaCabecalho(ws As Worksheet, rowN As Integer, cols As Variant)` |
| 6140 | `Private Sub LinhaDados(ws As Worksheet, rowN As Integer, _)` |
| 6169 | `Private Sub AplicarBordas(ws As Worksheet, r1 As Integer, r2 As Integer, c2 As Integer)` |

## Catálogo embutido `dDescSrv` (`CarregarDescServico`, linhas 688–1210)

Mapa estático `COD_SERVICO → descrição textual`, usado por `DescServico()`
para exibir descrição legível de serviços em relatórios quando o catálogo
externo de serviços não traz a descrição. Alimentado manualmente a partir de
exports SAP / planilha `base_servi_os.xlsx`.

## Histórico de alterações

| Data | Alteração |
|------|-----------|
| 2026-07-06 | Criação deste documento (índice completo de Subs/Functions com linhas). Adicionadas 22 novas entradas ao catálogo embutido `dDescSrv` em `CarregarDescServico` (linha ~1187), oriundas da planilha `base_servi_os.xlsx`: `5028000005`, `5040000002`, `5040000006`, `5040000008`, `5040100002`, `5040100004`, `5040100005`, `5040100046`, `5040200011`, `5040300014`, `5040300016`, `5042000005`, `5042000020`, `5042100005`, `5042300008`, `5042400003`, `5045400001`, `5045800006`, `5045900007`, `5050200013`, `5054100001`, `5054200013`. Arquivo passou de 6.152 para 6.175 linhas; índice de Subs/Functions abaixo já reflete os novos números de linha (deslocamento de +22/+23 a partir da linha ~1188). |
