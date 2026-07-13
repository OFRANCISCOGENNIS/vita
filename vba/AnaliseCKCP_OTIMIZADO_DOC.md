# AnaliseCKCP_OTIMIZADO — Documentação completa

Documentação de referência do módulo VBA `vba/AnaliseCKCP_OTIMIZADO.bas`.
Versão atual: **6.271 linhas · 60 Subs · 71 Functions** (módulo `AnaliseCKCP`).

> Para visão geral de arquitetura, fluxo e regras de negócio, ver `CLAUDE.md` e `ARCHITECTURE.md`.
> Este arquivo é o **índice detalhado por linha** de todos os procedimentos.

---

## 1. Ponto de entrada e UI

| Linha | Procedimento | Papel |
|------:|--------------|-------|
| 115 | `Sub GerarRelatorio()` | **Orquestrador principal.** Chama toda a cadeia de geração. |
| 218 | `Sub MostrarTelaFuturista(nLin, seg)` | Painel HUD final desenhado com Shapes. |
| 293 | `Sub AddTxt(...)` | Helper: caixa de texto no splash. |
| 314 | `Sub MetricBlock(...)` | Helper: bloco de métrica no splash. |
| 322 | `Sub LimparSplash()` | Remove shapes do splash. |
| 333 | `Sub FecharSplash([ignorar])` | Fecha o splash (callback OnTime). |

## 2. Localização e mapeamento da base

| Linha | Procedimento | Papel |
|------:|--------------|-------|
| 343 | `Function LocalizarBase() As Worksheet` | Acha a aba com `Elemento PEP`. |
| 370 | `Function MapearColunas(ws) As Boolean` | Mapeia colunas do SAP (tolerante a acento). |
| 424 | `Function TemCabecalhosMinimos(ws) As Boolean` | Valida colunas obrigatórias. |
| 433 | `Function PontuarBase(ws) As Long` | Pontua abas candidatas à base. |
| 443 | `Function ColLike(ws, frags) As Long` | Busca coluna por fragmento. |
| 467 | `Function SemAcento(s) As String` | Normaliza acentuação. |
| 4341 | `Function ColExata(ws, frags) As Long` | Busca coluna por match exato. |

## 3. Carga de dados em memória

| Linha | Procedimento | Papel |
|------:|--------------|-------|
| 483 | `Sub CarregarDados(ws)` | Carrega base para o array `dados`. |
| 506 | `Function ValorCampo(lin, col, [padrao])` | Leitura de campo por índice. |
| 516 | `Function TextoCampo(lin, col, [padrao])` | Idem, como texto. |
| 520 | `Function ValorMatriz(m, lin, col, [padrao])` | Leitura em matriz arbitrária. |
| 530 | `Function TextoMatriz(m, lin, col, [padrao])` | Idem, como texto. |
| 534–546 | `LinhaCLS1/CLS2/CLS3/TipoAplic(lin)` | Extração de classificação por linha. |
| 550 | `Function MatInfoLinha(lin, idx)` | Info de material da linha. |
| 581 | `Function SrvInfoLinha(lin, idx)` | Info de serviço da linha. |

## 4. Catálogos (dicionários)

| Linha | Procedimento | Popula |
|------:|--------------|--------|
| 634 | `Sub CarregarCatalogoMateriais()` | `dCatMat` (MATERIAS_ATUAIS.xlsx) |
| 688 | `Sub CarregarDescServico()` | `dDescSrv` (catálogo **embutido** de descrições, `base_servi_os.xlsx`) |
| 1298 | `Function DescServico(cod)` | Consulta `dDescSrv`. |
| 1315 | `Function CatInfo(codMat, idx)` | Consulta `dCatMat`. |
| 1328 | `Sub CarregarCatalogoServicos()` | `dCatSrv` |
| 1380 | `Function SrvInfo(codSrv, idx)` | Consulta `dCatSrv`. |
| 1395 | `Sub CarregarCatalogoClasse()` | `dCatCC` |
| 1446 | `Sub CarregarClassificacaoClassesDados()` | Classes embutidas. |
| 1517 | `Sub AddClasseCusto(...)` | Insere classe. |
| 1523 | `Function CCInfo(codCC, idx)` | Consulta `dCatCC`. |
| 1539 | `Sub CarregarConversoesCabo()` | `dCabo` (KG→m) |
| 1574 | `Function CaboFator(codMat)` | Fator de cabo. |
| 1588 | `Sub CarregarComboServico()` | `dCombo` |
| 1639 | `Function ComboFator(codSrv)` | Fator combo. |
| 1661 | `Sub CarregarTipoClassif()` | `dTipoCls` (COM/UC/UAR) |

## 5. Helpers de classificação e cálculo

| Linha | Procedimento |
|------:|--------------|
| 572 | `Function Cls2SrvOverride(codSrv)` — overrides fixos (`COND PROT`) |
| 605 | `Function TipoPEPCodigo(pep)` |
| 614 | `Function TipoPEPANEEL(pep)` |
| 622 | `Function ClassificacaoPendente(cls1,cls2,cls3)` |
| 1305 | `Function NormCod(v)` |
| 1692 | `Function NormClassif(s)` |
| 1707 | `Function TipoDaClassif(classif, ...)` |
| 1724 | `Function FamiliaAlias(cls2)` |
| 1732 | `Function EhCabo(cls2)` |
| 1739 | `Function CobertoReligador(cls2)` |
| 1745 | `Function DentroMargem(a, b)` |
| 1760 | `Function PEP3(pep)` — PEP 3º nível |
| 1769 | `Function SegmentoPI(pep)` |
| 1778 | `Function GrupoPerc(pep)` |
| 1787 | `Function EhMaterial(classif)` |
| 1792 | `Function ToNum(v)` |

## 6. Geradores de abas

| Linha | Procedimento | Aba |
|------:|--------------|-----|
| 1800 | `Sub Gerar_RazaoCJ()` | `RAZAO CJ` |
| 1860 | `Sub Gerar_MaterialVsServico()` | `MATERIAL vs SERVICO` (+ popula `dMvSVerd/dMvSFamNC/dMvSDif`) |
| 2393 | `Sub Gerar_AnaliseCA()` | `ANALISE DE CA` |
| 2610 | `Sub Gerar_ClasseDeCusto()` | `CLASSE DE CUSTO` |
| 2659 | `Sub Gerar_Material()` | `MATERIAL` |
| 2755 | `Sub Gerar_Servico()` | `SERVICO` |
| 2823 | `Sub Gerar_AlertasCriticos()` | `ALERTAS CRITICOS` |
| 3236 | `Sub Gerar_Regras()` | `REGRAS` |
| 3473 | `Sub Gerar_PainelExecutivo()` | `PAINEL EXECUTIVO` |
| 3734 | `Sub Gerar_ServicoSemMaterial()` | `SERVICO SEM MATERIAL` |
| 3831 | `Sub Gerar_PortfolioObra()` | `PORTFOLIO OBRA` |
| 3967 | `Sub Gerar_NaoClassificados()` | `NAO CLASSIFICADOS` |
| 4050 | `Sub Gerar_RacionalizacaoCOM()` | `RACIONALIZACAO COM` |
| 4729 | `Sub Gerar_MatVsServAT()` | `MAT vs SERV AT` (módulo AT) |
| 5978 | `Sub CriarPremissas()` | `PREMISSAS` |

### Helpers de ANALISE DE CA
2497 `ValorCat` · 2502 `CategoriaAnaliseCA` · 2550 `CategoriaPorClasseCusto` · 2565 `ClasseCustoDadosOutros` · 2571 `MapCategoriaCA`

### Helpers de ALERTAS
3174 `EscreverCardAlerta` · 3196 `EscreverCabecalhoAlerta`

### Helpers de RACIONALIZACAO COM
4212 `CriarMapaNT006_RC` · 4304 `AddMatRC` · 4326 `EhPepEmergencia` · 4331 `AtvPrevista`

### Classes de viagem
3707 `EhClasseViagem` · 3718 `DescClasseViagem`

## 7. Escrita, ordenação e formatação de abas

| Linha | Procedimento |
|------:|--------------|
| 3311 | `Sub EscreverAba(nome, outp())` |
| 3349 | `Sub OrdenarAba(ws, nome, ...)` |
| 4354 | `Sub AplicarFreeze(ws, celula, ...)` |
| 4371 | `Function CategoriaVeredito(v)` |
| 4387 | `Sub ColorirColunaVeredito(ws, jc, nR)` |
| 4409 | `Sub PintarRunVeredito(ws, jc, ...)` |
| 4429 | `Sub PintarStatusRC(ws, linIni, ...)` |
| 4570 | `Function EhColunaVeredito(hh)` |
| 4577 | `Function CorAba(nome)` |
| 4595 | `Function FormatoColuna(hh)` |
| 4617 | `Sub FormatarVisualAba(ws, nome, ...)` |
| 4705 | `Sub OrganizarAbas()` |

## 8. Configuração (aba CONFIG)

| Linha | Procedimento |
|------:|--------------|
| 4449 | `Sub GarantirConfig()` |
| 4503 | `Sub CarregarConfig()` |
| 4530 | `Function CfgTxt(chave, padrao)` |
| 4541 | `Function CfgNum(chave, padrao)` |
| 4551 | `Function CaminhoCatalogo(chave, padrao)` |

## 9. Módulo AT (`MAT vs SERV AT`)

| Linha | Procedimento |
|------:|--------------|
| 4749 | `Sub CarregarDados_AT()` |
| 4807 | `Sub CarregarCorresp()` |
| 4873 | `Function AcharAbaCorresp()` |
| 4885 | `Function AchaCorrespNoWb(wb)` |
| 4903 | `Function NomeNorm(s)` |
| 4917 | `Sub AplicarRegrasPreAgrupamento()` |
| 4964 | `Sub AgruparItens()` |
| 5035 | `Sub AplicarRegrasPosAgrupamento()` |
| 5170 | `Sub PadronizarCls2()` |
| 5216 | `Sub CalcularMatSrv()` |
| 5327 | `Sub CalcularAderencia()` |
| 5535 | `Sub CalcularTipoCusto()` |
| 5551 | `Sub CalcularPctMop()` |
| 5590 | `Sub OrdenarPorGrupo()` |
| 5631 | `Sub QuickSortIdx(keys, idx, lo, hi)` |
| 5652 | `Function DeveOrdenar(a, b)` |
| 5673 | `Function TipoOrdem(a)` |
| 5683 | `Sub EscreverAbaAT()` |

### Helpers AT (códigos/serviços)
5859 `CleanCod` · 5867 `TemSaldo` · 5871 `ContemPalavra` · 5875 `EhAutoCorrespondente` · 5885 `EhNaCorresp` · 5895 `GetTipoServico` · 5910 `GetGrupoKey` · 5946 `PepExisteComSufixo` · 5956 `PepTemMob`

## 10. Helpers de PREMISSAS
6209 `SecaoTitulo` · 6221 `TabelaCabecalho` · 6236 `LinhaDados` · 6265 `AplicarBordas`

---

## Mudanças vs. versão anterior (OTIMIZADO → OTIMIZADO2)

- **Conjunto de procedimentos idêntico** (60 Subs / 71 Functions).
- Catálogo embutido `dDescSrv` (`CarregarDescServico`, linha 688) expandido em três leituras:
  1. +23 mapeamentos de `base_servi_os.xlsx`.
  2. +85 mapeamentos de `classificar_servi_os.xlsx` (colunas `Nº de serviço` / `Denominação`), sem sobreposição com os códigos já existentes.
- Novas regras de `ADERENCIA` na aba `MATERIAL` (`Gerar_Material`, ~linha 2696): `QTD=0+VALOR≠0`, sinais opostos QTD×VALOR, ou `VALOR=0+QTD≠0` → `NAO ADERENTE` (prioridade sobre a regra por tipo de PEP).
- Sem mudança de assinatura ou fluxo geral.
