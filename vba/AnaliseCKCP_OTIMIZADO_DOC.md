# AnaliseCKCP_OTIMIZADO — Documentação completa

Documentação de referência do módulo VBA `vba/AnaliseCKCP_OTIMIZADO.bas`.
Versão atual: **7.166 linhas · 63 Subs · 72 Functions** (módulo `AnaliseCKCP`).

> Para visão geral de arquitetura, fluxo e regras de negócio, ver `CLAUDE.md` e `ARCHITECTURE.md`.
> Este arquivo é o **índice detalhado por linha** de todos os procedimentos.

---

## 1. Ponto de entrada e UI

| Linha | Procedimento | Papel |
|------:|--------------|-------|
| 117 | `Sub GerarRelatorio()` | **Orquestrador principal.** Chama toda a cadeia de geração. |
| 227 | `Sub MostrarTelaFuturista(nLin, seg)` | Painel HUD final desenhado com Shapes. |
| 302 | `Sub AddTxt(...)` | Helper: caixa de texto no splash. |
| 323 | `Sub MetricBlock(...)` | Helper: bloco de métrica no splash. |
| 331 | `Sub LimparSplash()` | Remove shapes do splash. |
| 342 | `Sub FecharSplashCKCP([ignorar])` | Fecha o splash (callback do botão OK). |

## 2. Localização e mapeamento da base

| Linha | Procedimento | Papel |
|------:|--------------|-------|
| 352 | `Function LocalizarBase() As Worksheet` | Acha a aba com `Elemento PEP`. |
| 379 | `Function MapearColunas(ws) As Boolean` | Mapeia colunas do SAP (tolerante a acento). |
| 433 | `Function TemCabecalhosMinimos(ws) As Boolean` | Valida colunas obrigatórias. |
| 442 | `Function PontuarBase(ws) As Long` | Pontua abas candidatas à base. |
| 452 | `Function ColLike(ws, frags) As Long` | Busca coluna por fragmento. |
| 476 | `Function SemAcento(s) As String` | Normaliza acentuação. |
| 5181 | `Function ColExata(ws, frags) As Long` | Busca coluna por match exato. |

## 3. Carga de dados em memória

| Linha | Procedimento | Papel |
|------:|--------------|-------|
| 492 | `Sub CarregarDados(ws)` | Carrega base para o array `dados`. |
| 515 | `Function ValorCampo(lin, col, [padrao])` | Leitura de campo por índice. |
| 525 | `Function TextoCampo(lin, col, [padrao])` | Idem, como texto. |
| 529 | `Function ValorMatriz(m, lin, col, [padrao])` | Leitura em matriz arbitrária. |
| 539 | `Function TextoMatriz(m, lin, col, [padrao])` | Idem, como texto. |
| 534–546 | `LinhaCLS1/CLS2/CLS3/TipoAplic(lin)` | Extração de classificação por linha. |
| 559 | `Function MatInfoLinha(lin, idx)` | Info de material da linha. |
| 590 | `Function SrvInfoLinha(lin, idx)` | Info de serviço da linha. |

## 4. Catálogos (dicionários)

| Linha | Procedimento | Popula |
|------:|--------------|--------|
| 643 | `Sub CarregarCatalogoMateriais()` | `dCatMat` (MATERIAS_ATUAIS.xlsx) |
| 698 | `Sub CarregarDescServico()` | `dDescSrv` (catálogo **embutido** de descrições, `base_servi_os.xlsx`) |
| 1308 | `Function DescServico(cod)` | Consulta `dDescSrv`. |
| 1325 | `Function CatInfo(codMat, idx)` | Consulta `dCatMat`. |
| 1338 | `Sub CarregarCatalogoServicos()` | `dCatSrv` |
| 1399 | `Function SrvInfo(codSrv, idx)` | Consulta `dCatSrv`. |
| 1414 | `Sub CarregarCatalogoClasse()` | `dCatCC` |
| 1466 | `Sub CarregarClassificacaoClassesDados()` | Overrides curados de classe (42) + chama `CarregarClassesCustoAuto`. |
| 1546 | `Sub CarregarClassesCustoAuto()` | Base completa CLASSE_CUSTO_ATUAIS embutida (782 classes). |
| 1541 | `Sub AddClasseCusto(...)` | Insere classe. |
| 2293 | `Function CCInfo(codCC, idx)` | Consulta `dCatCC`. |
| 2309 | `Sub CarregarConversoesCabo()` | `dCabo` (KG→m) |
| 2344 | `Function CaboFator(codMat)` | Fator de cabo. |
| 2358 | `Sub CarregarComboServico()` | `dCombo` |
| 2409 | `Function ComboFator(codSrv)` | Fator combo. |
| 2431 | `Sub CarregarTipoClassif()` | `dTipoCls` (COM/UC/UAR) |
| 2469 | `Sub CarregarEquivSrvMat()` | `dFamEquiv` (CLS2 serviço → família material; + CONFIG `EQUIV_SRV_MAT`) |
| 2495 | `Sub CarregarSrvPuro()` | `dSrvPuro` (famílias sem material esperado; + CONFIG `SRV_PURO`) |

## 5. Helpers de classificação e cálculo

| Linha | Procedimento |
|------:|--------------|
| 581 | `Function Cls2SrvOverride(codSrv)` — overrides fixos (`COND PROT`) |
| 614 | `Function TipoPEPCodigo(pep)` |
| 623 | `Function TipoPEPANEEL(pep)` |
| 631 | `Function ClassificacaoPendente(cls1,cls2,cls3)` |
| 1315 | `Function NormCod(v)` |
| 2520 | `Function NormClassif(s)` |
| 2535 | `Function TipoDaClassif(classif, ...)` |
| 2552 | `Function FamiliaAlias(cls2)` — unifica COND* e aplica `dFamEquiv` |
| 2514 | `Function EhServicoPuro(cls2)` |
| 2566 | `Function EhCabo(cls2)` |
| 2573 | `Function CobertoReligador(cls2)` |
| 2579 | `Function DentroMargem(a, b)` |
| 2594 | `Function PEP3(pep)` — PEP 3º nível |
| 2603 | `Function SegmentoPI(pep)` |
| 2612 | `Function GrupoPerc(pep)` |
| 2621 | `Function EhMaterial(classif)` |
| 2626 | `Function ToNum(v)` |

## 6. Geradores de abas

| Linha | Procedimento | Aba |
|------:|--------------|-----|
| 2634 | `Sub Gerar_RazaoCJ()` | `RAZAO CJ` |
| 2694 | `Sub Gerar_MaterialVsServico()` | `MATERIAL vs SERVICO` (+ popula `dMvSVerd/dMvSFamNC/dMvSDif`) |
| 3227 | `Sub Gerar_AnaliseCA()` | `ANALISE DE CA` |
| 3448 | `Sub Gerar_ClasseDeCusto()` | `CLASSE DE CUSTO` |
| 3497 | `Sub Gerar_Material()` | `MATERIAL` |
| 3593 | `Sub Gerar_Servico()` | `SERVICO` |
| 3661 | `Sub Gerar_AlertasCriticos()` | `ALERTAS CRITICOS` |
| 4074 | `Sub Gerar_Regras()` | `REGRAS` |
| 4311 | `Sub Gerar_PainelExecutivo()` | `PAINEL EXECUTIVO` |
| 4572 | `Sub Gerar_ServicoSemMaterial()` | `SERVICO SEM MATERIAL` |
| 4671 | `Sub Gerar_PortfolioObra()` | `PORTFOLIO OBRA` |
| 4807 | `Sub Gerar_NaoClassificados()` | `NAO CLASSIFICADOS` |
| 4890 | `Sub Gerar_RacionalizacaoCOM()` | `RACIONALIZACAO COM` |
| 5593 | `Sub Gerar_MatVsServAT()` | `MAT vs SERV AT` (módulo AT) |
| 6842 | `Sub CriarPremissas()` | `PREMISSAS` |

### Helpers de ANALISE DE CA
3331 `ValorCat` · 3336 `CategoriaAnaliseCA` · 3384 `CategoriaPorClasseCusto` · 3399 `ClasseCustoDadosOutros` · 3405 `MapCategoriaCA`

### Helpers de ALERTAS
4012 `EscreverCardAlerta` · 4034 `EscreverCabecalhoAlerta`

### Helpers de RACIONALIZACAO COM
5052 `CriarMapaNT006_RC` · 5144 `AddMatRC` · 5166 `EhPepEmergencia` · 5171 `AtvPrevista`

### Classes de viagem
4545 `EhClasseViagem` · 4556 `DescClasseViagem`

## 7. Escrita, ordenação e formatação de abas

| Linha | Procedimento |
|------:|--------------|
| 4149 | `Sub EscreverAba(nome, outp())` |
| 4187 | `Sub OrdenarAba(ws, nome, ...)` |
| 5194 | `Sub AplicarFreeze(ws, celula, ...)` |
| 5211 | `Function CategoriaVeredito(v)` |
| 5227 | `Sub ColorirColunaVeredito(ws, jc, nR)` |
| 5249 | `Sub PintarRunVeredito(ws, jc, ...)` |
| 5269 | `Sub PintarStatusRC(ws, linIni, ...)` |
| 5412 | `Function EhColunaVeredito(hh)` |
| 5419 | `Function CorAba(nome)` |
| 5437 | `Function FormatoColuna(hh)` |
| 5462 | `Sub FormatarVisualAba(ws, nome, ...)` |
| 5569 | `Sub OrganizarAbas()` |

## 8. Configuração (aba CONFIG)

| Linha | Procedimento |
|------:|--------------|
| 5289 | `Sub GarantirConfig()` |
| 5345 | `Sub CarregarConfig()` |
| 5372 | `Function CfgTxt(chave, padrao)` |
| 5383 | `Function CfgNum(chave, padrao)` |
| 5393 | `Function CaminhoCatalogo(chave, padrao)` |

## 9. Módulo AT (`MAT vs SERV AT`)

| Linha | Procedimento |
|------:|--------------|
| 5613 | `Sub CarregarDados_AT()` |
| 5671 | `Sub CarregarCorresp()` |
| 5737 | `Function AcharAbaCorresp()` |
| 5749 | `Function AchaCorrespNoWb(wb)` |
| 5767 | `Function NomeNorm(s)` |
| 5781 | `Sub AplicarRegrasPreAgrupamento()` |
| 5828 | `Sub AgruparItens()` |
| 5899 | `Sub AplicarRegrasPosAgrupamento()` |
| 6034 | `Sub PadronizarCls2()` |
| 6080 | `Sub CalcularMatSrv()` |
| 6191 | `Sub CalcularAderencia()` |
| 6399 | `Sub CalcularTipoCusto()` |
| 6415 | `Sub CalcularPctMop()` |
| 6454 | `Sub OrdenarPorGrupo()` |
| 6495 | `Sub QuickSortIdx(keys, idx, lo, hi)` |
| 6516 | `Function DeveOrdenar(a, b)` |
| 6537 | `Function TipoOrdem(a)` |
| 6547 | `Sub EscreverAbaAT()` |

### Helpers AT (códigos/serviços)
6723 `CleanCod` · 6731 `TemSaldo` · 6735 `ContemPalavra` · 6739 `EhAutoCorrespondente` · 6749 `EhNaCorresp` · 6759 `GetTipoServico` · 6774 `GetGrupoKey` · 6810 `PepExisteComSufixo` · 6820 `PepTemMob`

## 10. Helpers de PREMISSAS
7073 `SecaoTitulo` · 7085 `TabelaCabecalho` · 7100 `LinhaDados` · 7129 `AplicarBordas`

---

## Mudanças vs. versão anterior (OTIMIZADO → OTIMIZADO2)

- **Conjunto de procedimentos idêntico** (60 Subs / 71 Functions).
- Catálogo embutido `dDescSrv` (`CarregarDescServico`, linha 688) expandido em três leituras:
  1. +23 mapeamentos de `base_servi_os.xlsx`.
  2. +85 mapeamentos de `classificar_servi_os.xlsx` (colunas `Nº de serviço` / `Denominação`), sem sobreposição com os códigos já existentes.
- Novas regras de `ADERENCIA` na aba `MATERIAL` (`Gerar_Material`): `QTD=0+VALOR≠0`, sinais opostos QTD×VALOR, ou `VALOR=0+QTD≠0` → `NAO ADERENTE` (prioridade sobre a regra por tipo de PEP).

### Atualização com catálogos ATUAIS (CLASSE_CUSTO / MATERIAIS / SERVICOS)

- **Classe de custo embutida completa**: novo `CarregarClassesCustoAuto` embute as 782 classes de `CLASSE_CUSTO_ATUAIS_2.xlsx` (CLS1/2/3). Os 42 overrides curados de `CarregarClassificacaoClassesDados` rodam **depois** e mantêm prioridade (ex.: `MOP_CUSTEIO`, `EMENDA`). `ANALISE DE CA` passa a classificar corretamente mesmo sem o arquivo externo.
- **Descrições de serviço vindas do arquivo**: `CarregarCatalogoServicos` agora também popula `dDescSrv` a partir de `TEXTO BREVE` de `SERVICOS_ATUAIS_2.xlsx` (6.780 serviços), preenchendo descrições faltantes. Descrições embutidas mantêm prioridade — por isso `CarregarDescServico` passou a rodar **antes** do catálogo externo.
- **Auto-localização dos arquivos novos**: caminhos-padrão dos loaders atualizados para achar `MATERIAS_ATUAIS_4.xlsx`, `SERVICOS_ATUAIS_2.xlsx` e `CLASSE_CUSTO_ATUAIS_2.xlsx` em `Downloads` (mantendo os nomes antigos como fallback).
- Materiais (15.030) e serviços (6.780) continuam lidos de disco em runtime (grandes demais para embutir); só a classe de custo foi embutida.

### Fase de melhorias de análise e design (jul/2026)

- **Fix crítico ANALISE DE CA**: `MapCategoriaCA` normaliza `.` → espaço — `MAT. UC`, `MAT. COM` e `MAT.COM` (grafia de 13.7k linhas dos catálogos ATUAIS) agora mapeiam para `MAT UC`/`MAT COM` em vez de caírem em `OUTROS`.
- **Regularização serviço→material**: `dFamEquiv` (`CarregarEquivSrvMat`) liga famílias de serviço a famílias de material equivalentes via `FamiliaAlias` (vale para MATERIAL vs SERVICO e SERVICO SEM MATERIAL). Embutidos: `CH FUSIVEL→CH FUS`, `CONEXAO→CONECTOR`, `TENSIONAR→COND PROT`, `ESTRUTURA/ESTRUT MT RSB→CRUZETA`, `ESTRUT RDC→ESPACADOR LOSAG`. Extensível pela chave `EQUIV_SRV_MAT` da CONFIG.
- **Serviço puro**: `dSrvPuro` (`CarregarSrvPuro`) marca famílias sem material esperado (PODA, CIVIL, FUNDACAO, FRETE/TRANSP, PROJETO, MOBILIZAR…) — na aba SERVICO SEM MATERIAL o RISCO vira `N/A (SERVICO PURO)` em vez de falso alerta. Extensível pela chave `SRV_PURO`.
- **+16 famílias com TIPO** no `dTipoCls` por analogia (TORRE MET/CONC, POSTE_TORRE, TRAFO DE FORCA, DISJ SE, CH SEC TRI, BANCO CAPACITOR = UC; ISOLADOR AT, CONECTOR, CABO FIB OPT, VIGA/SUPORTE/ANEL CONC, CANTONEIRA, PAINEL MET, TUBO FOFO = COM).
- **Design**: data bars verdes em colunas VALOR/DIF/TOTAL, contorno da tabela, corpo centrado verticalmente, formato inteiro para contagens (`QTD_LANCAMENTOS`, `N *`), CONFIG com caminhos dos catálogos novos e as 2 chaves novas.

### Fix falso "SEM UC"

- **Sintoma**: PEP com material UC recebia veredito/alerta `SEM UC`.
- **Causa**: a detecção de família UC dependia só de `TipoDaClassif(CLS2)` (tabela fixa `dTipoCls`), e ~1.162 famílias de material dos catálogos ATUAIS não estão nessa tabela → não contavam como UC.
- **Fix**: quando a família não tem TIPO na tabela, usa o CLS3 real do item (`MAT. UC`/`MAT. COM`) como fallback. Corrigido nos dois pontos de detecção: `Gerar_MaterialVsServico` (novo `dFamTipo` por família, a partir do CLS3) e `Gerar_AlertasCriticos` (seção A "PEPs sem UC", fallback inline por linha).

### UAR equivalente a UC (não alertar "SEM UC")

- Regra: PEP que só tem família **UAR** (sem UC) não deve gerar alerta "SEM UC" — UAR é equivalente a UC. Já era aplicado às 6 famílias UAR fixas (`CP_CS_MD`, `TER_LEITURA`, `RELE`, `BOMBA SUBM`, `PAINEL CONTR EXAUSTOR`, `CONTROLADOR`), que são excluídas de todas as seções de ALERTAS CRÍTICOS e ficam `APROVADO` em MATERIAL vs SERVICO.
- **Limitação**: os catálogos ATUAIS não trazem "UAR" em nenhuma coluna estruturada (CLS1/2/3, TIPO_APLICACAO) — só em texto livre. Logo, famílias UAR fora das 6 fixas não são reconhecidas automaticamente.
- **Solução**: nova chave CONFIG `FAM_UAR` (`CarregarTipoClassif`) — lista de famílias (CLS2) a tratar como UAR, separadas por `;`. Declaração explícita **sobrepõe** a tabela fixa. Ex.: `FAM_UAR = SISTEMA CFTV;CERCA ELETRICA`.
