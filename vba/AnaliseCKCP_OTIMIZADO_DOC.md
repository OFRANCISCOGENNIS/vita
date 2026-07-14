# AnaliseCKCP_OTIMIZADO — Documentação completa

Documentação de referência do módulo VBA `vba/AnaliseCKCP_OTIMIZADO.bas`.
Versão atual: **7.987 linhas · 65 Subs · 72 Functions** (módulo `AnaliseCKCP`).

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
| 6032 | `Function ColExata(ws, frags) As Long` | Busca coluna por match exato. |

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
| 2431 | `Sub CarregarTipoClassif()` | `dTipoCls` (COM/UC/UAR) — curadas + `CarregarTipoClassifAuto` + CONFIG `FAM_UAR` |
| 2480 | `Sub CarregarTipoClassifAuto()` | 804 famílias UC/COM do CLS3 do catálogo (não sobrepõe curadas) |
| 3290 | `Sub AddTipoCls(fam, tipo)` | Insere família em `dTipoCls` se ainda não existir |
| 3301 | `Sub CarregarEquivSrvMat()` | `dFamEquiv` (CLS2 serviço → família material; + CONFIG `EQUIV_SRV_MAT`) |
| 3327 | `Sub CarregarSrvPuro()` | `dSrvPuro` (famílias sem material esperado; + CONFIG `SRV_PURO`) |

## 5. Helpers de classificação e cálculo

| Linha | Procedimento |
|------:|--------------|
| 581 | `Function Cls2SrvOverride(codSrv)` — overrides fixos (`COND PROT`) |
| 614 | `Function TipoPEPCodigo(pep)` |
| 623 | `Function TipoPEPANEEL(pep)` |
| 631 | `Function ClassificacaoPendente(cls1,cls2,cls3)` |
| 1315 | `Function NormCod(v)` |
| 3352 | `Function NormClassif(s)` |
| 3367 | `Function TipoDaClassif(classif, ...)` |
| 3384 | `Function FamiliaAlias(cls2)` — unifica COND* e aplica `dFamEquiv` |
| 3346 | `Function EhServicoPuro(cls2)` |
| 3398 | `Function EhCabo(cls2)` |
| 3405 | `Function CobertoReligador(cls2)` |
| 3411 | `Function DentroMargem(a, b)` |
| 3426 | `Function PEP3(pep)` — PEP 3º nível |
| 3435 | `Function SegmentoPI(pep)` |
| 3444 | `Function GrupoPerc(pep)` |
| 3453 | `Function EhMaterial(classif)` |
| 3458 | `Function ToNum(v)` |

## 6. Geradores de abas

| Linha | Procedimento | Aba |
|------:|--------------|-----|
| 3466 | `Sub Gerar_RazaoCJ()` | `RAZAO CJ` |
| 3526 | `Sub Gerar_MaterialVsServico()` | `MATERIAL vs SERVICO` (+ popula `dMvSVerd/dMvSFamNC/dMvSDif`) |
| 4077 | `Sub Gerar_AnaliseCA()` | `ANALISE DE CA` |
| 4298 | `Sub Gerar_ClasseDeCusto()` | `CLASSE DE CUSTO` |
| 4347 | `Sub Gerar_Material()` | `MATERIAL` |
| 4443 | `Sub Gerar_Servico()` | `SERVICO` |
| 4511 | `Sub Gerar_AlertasCriticos()` | `ALERTAS CRITICOS` |
| 4925 | `Sub Gerar_Regras()` | `REGRAS` |
| 5162 | `Sub Gerar_PainelExecutivo()` | `PAINEL EXECUTIVO` |
| 5423 | `Sub Gerar_ServicoSemMaterial()` | `SERVICO SEM MATERIAL` |
| 5522 | `Sub Gerar_PortfolioObra()` | `PORTFOLIO OBRA` |
| 5658 | `Sub Gerar_NaoClassificados()` | `NAO CLASSIFICADOS` |
| 5741 | `Sub Gerar_RacionalizacaoCOM()` | `RACIONALIZACAO COM` |
| 6445 | `Sub Gerar_MatVsServAT()` | `MAT vs SERV AT` (módulo AT) |
| 7694 | `Sub CriarPremissas()` | `PREMISSAS` |

### Helpers de ANALISE DE CA
4181 `ValorCat` · 4186 `CategoriaAnaliseCA` · 4234 `CategoriaPorClasseCusto` · 4249 `ClasseCustoDadosOutros` · 4255 `MapCategoriaCA`

### Helpers de ALERTAS
4863 `EscreverCardAlerta` · 4885 `EscreverCabecalhoAlerta`

### Helpers de RACIONALIZACAO COM
5903 `CriarMapaNT006_RC` · 5995 `AddMatRC` · 6017 `EhPepEmergencia` · 6022 `AtvPrevista`

### Classes de viagem
5396 `EhClasseViagem` · 5407 `DescClasseViagem`

## 7. Escrita, ordenação e formatação de abas

| Linha | Procedimento |
|------:|--------------|
| 5000 | `Sub EscreverAba(nome, outp())` |
| 5038 | `Sub OrdenarAba(ws, nome, ...)` |
| 6045 | `Sub AplicarFreeze(ws, celula, ...)` |
| 6062 | `Function CategoriaVeredito(v)` |
| 6078 | `Sub ColorirColunaVeredito(ws, jc, nR)` |
| 6100 | `Sub PintarRunVeredito(ws, jc, ...)` |
| 6120 | `Sub PintarStatusRC(ws, linIni, ...)` |
| 6264 | `Function EhColunaVeredito(hh)` |
| 6271 | `Function CorAba(nome)` |
| 6289 | `Function FormatoColuna(hh)` |
| 6314 | `Sub FormatarVisualAba(ws, nome, ...)` |
| 6421 | `Sub OrganizarAbas()` |

## 8. Configuração (aba CONFIG)

| Linha | Procedimento |
|------:|--------------|
| 6140 | `Sub GarantirConfig()` |
| 6197 | `Sub CarregarConfig()` |
| 6224 | `Function CfgTxt(chave, padrao)` |
| 6235 | `Function CfgNum(chave, padrao)` |
| 6245 | `Function CaminhoCatalogo(chave, padrao)` |

## 9. Módulo AT (`MAT vs SERV AT`)

| Linha | Procedimento |
|------:|--------------|
| 6465 | `Sub CarregarDados_AT()` |
| 6523 | `Sub CarregarCorresp()` |
| 6589 | `Function AcharAbaCorresp()` |
| 6601 | `Function AchaCorrespNoWb(wb)` |
| 6619 | `Function NomeNorm(s)` |
| 6633 | `Sub AplicarRegrasPreAgrupamento()` |
| 6680 | `Sub AgruparItens()` |
| 6751 | `Sub AplicarRegrasPosAgrupamento()` |
| 6886 | `Sub PadronizarCls2()` |
| 6932 | `Sub CalcularMatSrv()` |
| 7043 | `Sub CalcularAderencia()` |
| 7251 | `Sub CalcularTipoCusto()` |
| 7267 | `Sub CalcularPctMop()` |
| 7306 | `Sub OrdenarPorGrupo()` |
| 7347 | `Sub QuickSortIdx(keys, idx, lo, hi)` |
| 7368 | `Function DeveOrdenar(a, b)` |
| 7389 | `Function TipoOrdem(a)` |
| 7399 | `Sub EscreverAbaAT()` |

### Helpers AT (códigos/serviços)
7575 `CleanCod` · 7583 `TemSaldo` · 7587 `ContemPalavra` · 7591 `EhAutoCorrespondente` · 7601 `EhNaCorresp` · 7611 `GetTipoServico` · 7626 `GetGrupoKey` · 7662 `PepExisteComSufixo` · 7672 `PepTemMob`

## 10. Helpers de PREMISSAS
7925 `SecaoTitulo` · 7937 `TabelaCabecalho` · 7952 `LinhaDados` · 7981 `AplicarBordas`

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

### Cobertura de classificação de famílias (804 famílias)

- **Antes**: só ~90 famílias tinham TIPO (UC/COM/UAR) na tabela curada `dTipoCls`; ~1.162 famílias dos catálogos ATUAIS ficavam sem TIPO (resolvidas só pelo fallback de CLS3 em runtime, restrito ao MATERIAL vs SERVICO e ALERTAS).
- **Agora**: `CarregarTipoClassifAuto` embute **804 famílias** com TIPO (UC/COM) derivado do **CLS3 dominante** do catálogo de materiais (maioria `MAT. UC` → UC, `MAT. COM` → COM). Classificação consistente em toda a cadeia (portfólio, serviço sem material, etc.), não só nos dois pontos com fallback.
- **Prioridade preservada**: ordem de carga = curadas (`CarregarTipoClassif`) → auto (preenche lacunas, `AddTipoCls` não sobrepõe) → `FAM_UAR` (override explícito). Famílias só-`RISCO`/`OUTROS` (sem UC/COM) e ruído (`(ANE)`, `SUCATA`, `LICENCA`) ficam de fora.
