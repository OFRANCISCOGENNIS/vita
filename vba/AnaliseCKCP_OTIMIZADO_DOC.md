# AnaliseCKCP_OTIMIZADO — Documentação completa

Documentação de referência do módulo VBA `vba/AnaliseCKCP_OTIMIZADO.bas`.
Versão atual: **6.175 linhas · 60 Subs · 71 Functions** (módulo `AnaliseCKCP`).

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
| 4245 | `Function ColExata(ws, frags) As Long` | Busca coluna por match exato. |

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
| 1212 | `Function DescServico(cod)` | Consulta `dDescSrv`. |
| 1229 | `Function CatInfo(codMat, idx)` | Consulta `dCatMat`. |
| 1242 | `Sub CarregarCatalogoServicos()` | `dCatSrv` |
| 1294 | `Function SrvInfo(codSrv, idx)` | Consulta `dCatSrv`. |
| 1309 | `Sub CarregarCatalogoClasse()` | `dCatCC` |
| 1360 | `Sub CarregarClassificacaoClassesDados()` | Classes embutidas. |
| 1431 | `Sub AddClasseCusto(...)` | Insere classe. |
| 1437 | `Function CCInfo(codCC, idx)` | Consulta `dCatCC`. |
| 1453 | `Sub CarregarConversoesCabo()` | `dCabo` (KG→m) |
| 1488 | `Function CaboFator(codMat)` | Fator de cabo. |
| 1502 | `Sub CarregarComboServico()` | `dCombo` |
| 1553 | `Function ComboFator(codSrv)` | Fator combo. |
| 1575 | `Sub CarregarTipoClassif()` | `dTipoCls` (COM/UC/UAR) |

## 5. Helpers de classificação e cálculo

| Linha | Procedimento |
|------:|--------------|
| 572 | `Function Cls2SrvOverride(codSrv)` — overrides fixos (`COND PROT`) |
| 605 | `Function TipoPEPCodigo(pep)` |
| 614 | `Function TipoPEPANEEL(pep)` |
| 622 | `Function ClassificacaoPendente(cls1,cls2,cls3)` |
| 1219 | `Function NormCod(v)` |
| 1606 | `Function NormClassif(s)` |
| 1621 | `Function TipoDaClassif(classif, ...)` |
| 1638 | `Function FamiliaAlias(cls2)` |
| 1646 | `Function EhCabo(cls2)` |
| 1653 | `Function CobertoReligador(cls2)` |
| 1659 | `Function DentroMargem(a, b)` |
| 1674 | `Function PEP3(pep)` — PEP 3º nível |
| 1683 | `Function SegmentoPI(pep)` |
| 1692 | `Function GrupoPerc(pep)` |
| 1701 | `Function EhMaterial(classif)` |
| 1706 | `Function ToNum(v)` |

## 6. Geradores de abas

| Linha | Procedimento | Aba |
|------:|--------------|-----|
| 1714 | `Sub Gerar_RazaoCJ()` | `RAZAO CJ` |
| 1774 | `Sub Gerar_MaterialVsServico()` | `MATERIAL vs SERVICO` (+ popula `dMvSVerd/dMvSFamNC/dMvSDif`) |
| 2307 | `Sub Gerar_AnaliseCA()` | `ANALISE DE CA` |
| 2524 | `Sub Gerar_ClasseDeCusto()` | `CLASSE DE CUSTO` |
| 2573 | `Sub Gerar_Material()` | `MATERIAL` |
| 2659 | `Sub Gerar_Servico()` | `SERVICO` |
| 2727 | `Sub Gerar_AlertasCriticos()` | `ALERTAS CRITICOS` |
| 3140 | `Sub Gerar_Regras()` | `REGRAS` |
| 3377 | `Sub Gerar_PainelExecutivo()` | `PAINEL EXECUTIVO` |
| 3638 | `Sub Gerar_ServicoSemMaterial()` | `SERVICO SEM MATERIAL` |
| 3735 | `Sub Gerar_PortfolioObra()` | `PORTFOLIO OBRA` |
| 3871 | `Sub Gerar_NaoClassificados()` | `NAO CLASSIFICADOS` |
| 3954 | `Sub Gerar_RacionalizacaoCOM()` | `RACIONALIZACAO COM` |
| 4633 | `Sub Gerar_MatVsServAT()` | `MAT vs SERV AT` (módulo AT) |
| 5882 | `Sub CriarPremissas()` | `PREMISSAS` |

### Helpers de ANALISE DE CA
2411 `ValorCat` · 2416 `CategoriaAnaliseCA` · 2464 `CategoriaPorClasseCusto` · 2479 `ClasseCustoDadosOutros` · 2485 `MapCategoriaCA`

### Helpers de ALERTAS
3078 `EscreverCardAlerta` · 3100 `EscreverCabecalhoAlerta`

### Helpers de RACIONALIZACAO COM
4116 `CriarMapaNT006_RC` · 4208 `AddMatRC` · 4230 `EhPepEmergencia` · 4235 `AtvPrevista`

### Classes de viagem
3611 `EhClasseViagem` · 3622 `DescClasseViagem`

## 7. Escrita, ordenação e formatação de abas

| Linha | Procedimento |
|------:|--------------|
| 3215 | `Sub EscreverAba(nome, outp())` |
| 3253 | `Sub OrdenarAba(ws, nome, ...)` |
| 4258 | `Sub AplicarFreeze(ws, celula, ...)` |
| 4275 | `Function CategoriaVeredito(v)` |
| 4291 | `Sub ColorirColunaVeredito(ws, jc, nR)` |
| 4313 | `Sub PintarRunVeredito(ws, jc, ...)` |
| 4333 | `Sub PintarStatusRC(ws, linIni, ...)` |
| 4474 | `Function EhColunaVeredito(hh)` |
| 4481 | `Function CorAba(nome)` |
| 4499 | `Function FormatoColuna(hh)` |
| 4521 | `Sub FormatarVisualAba(ws, nome, ...)` |
| 4609 | `Sub OrganizarAbas()` |

## 8. Configuração (aba CONFIG)

| Linha | Procedimento |
|------:|--------------|
| 4353 | `Sub GarantirConfig()` |
| 4407 | `Sub CarregarConfig()` |
| 4434 | `Function CfgTxt(chave, padrao)` |
| 4445 | `Function CfgNum(chave, padrao)` |
| 4455 | `Function CaminhoCatalogo(chave, padrao)` |

## 9. Módulo AT (`MAT vs SERV AT`)

| Linha | Procedimento |
|------:|--------------|
| 4653 | `Sub CarregarDados_AT()` |
| 4711 | `Sub CarregarCorresp()` |
| 4777 | `Function AcharAbaCorresp()` |
| 4789 | `Function AchaCorrespNoWb(wb)` |
| 4807 | `Function NomeNorm(s)` |
| 4821 | `Sub AplicarRegrasPreAgrupamento()` |
| 4868 | `Sub AgruparItens()` |
| 4939 | `Sub AplicarRegrasPosAgrupamento()` |
| 5074 | `Sub PadronizarCls2()` |
| 5120 | `Sub CalcularMatSrv()` |
| 5231 | `Sub CalcularAderencia()` |
| 5439 | `Sub CalcularTipoCusto()` |
| 5455 | `Sub CalcularPctMop()` |
| 5494 | `Sub OrdenarPorGrupo()` |
| 5535 | `Sub QuickSortIdx(keys, idx, lo, hi)` |
| 5556 | `Function DeveOrdenar(a, b)` |
| 5577 | `Function TipoOrdem(a)` |
| 5587 | `Sub EscreverAbaAT()` |

### Helpers AT (códigos/serviços)
5763 `CleanCod` · 5771 `TemSaldo` · 5775 `ContemPalavra` · 5779 `EhAutoCorrespondente` · 5789 `EhNaCorresp` · 5799 `GetTipoServico` · 5814 `GetGrupoKey` · 5850 `PepExisteComSufixo` · 5860 `PepTemMob`

## 10. Helpers de PREMISSAS
6113 `SecaoTitulo` · 6125 `TabelaCabecalho` · 6140 `LinhaDados` · 6169 `AplicarBordas`

---

## Mudanças vs. versão anterior (OTIMIZADO → OTIMIZADO2)

- **Conjunto de procedimentos idêntico** (60 Subs / 71 Functions).
- Única alteração funcional: **expansão do catálogo embutido `dDescSrv`** em `CarregarDescServico` (linha 688) com ~23 novos mapeamentos `COD_SERVICO → descrição` provenientes de `base_servi_os.xlsx` (ex.: `5028000005` FABRICACAO E INSTALACAO PLACA DA OBRA, `5040100002` FUNDACAO TIPO C1, `5054100001` INSTALACAO E INTERLIG EQUIP COMUNICACAO).
- Sem mudança de assinatura, fluxo ou regras de negócio.
