# AnaliseCKCP_OTIMIZADO — Documentação completa

Documentação de referência do módulo VBA `vba/AnaliseCKCP_OTIMIZADO.bas`.
Versão atual: **8.745 linhas · 71 Subs · 75 Functions** (módulo `AnaliseCKCP`).

> Para visão geral de arquitetura, fluxo e regras de negócio, ver `CLAUDE.md` e `ARCHITECTURE.md`.
> Este arquivo é o **índice detalhado por linha** de todos os procedimentos.

---

## 1. Ponto de entrada e UI

| Linha | Procedimento | Papel |
|------:|--------------|-------|
| 145 | `Sub GerarRelatorio()` | **Orquestrador principal.** Chama toda a cadeia de geração. |
| 261 | `Sub MostrarTelaFuturista(nLin, seg)` | Painel HUD final desenhado com Shapes. |
| 336 | `Sub AddTxt(...)` | Helper: caixa de texto no splash. |
| 357 | `Sub MetricBlock(...)` | Helper: bloco de métrica no splash. |
| 365 | `Sub LimparSplash()` | Remove shapes do splash. |
| 376 | `Sub FecharSplashCKCP([ignorar])` | Fecha o splash (callback do botão OK). |

## 2. Localização e mapeamento da base

| Linha | Procedimento | Papel |
|------:|--------------|-------|
| 386 | `Function LocalizarBase() As Worksheet` | Acha a aba com `Elemento PEP`. |
| 413 | `Function MapearColunas(ws) As Boolean` | Mapeia colunas do SAP (tolerante a acento). |
| 467 | `Function TemCabecalhosMinimos(ws) As Boolean` | Valida colunas obrigatórias. |
| 476 | `Function PontuarBase(ws) As Long` | Pontua abas candidatas à base. |
| 486 | `Function ColLike(ws, frags) As Long` | Busca coluna por fragmento. |
| 510 | `Function SemAcento(s) As String` | Normaliza acentuação. |
| 6405 | `Function ColExata(ws, frags) As Long` | Busca coluna por match exato. |

## 3. Carga de dados em memória

| Linha | Procedimento | Papel |
|------:|--------------|-------|
| 526 | `Sub CarregarDados(ws)` | Carrega base para o array `dados`. |
| 549 | `Function ValorCampo(lin, col, [padrao])` | Leitura de campo por índice. |
| 559 | `Function TextoCampo(lin, col, [padrao])` | Idem, como texto. |
| 563 | `Function ValorMatriz(m, lin, col, [padrao])` | Leitura em matriz arbitrária. |
| 573 | `Function TextoMatriz(m, lin, col, [padrao])` | Idem, como texto. |
| 534–546 | `LinhaCLS1/CLS2/CLS3/TipoAplic(lin)` | Extração de classificação por linha. |
| 593 | `Function MatInfoLinha(lin, idx)` | Info de material da linha. |
| 624 | `Function SrvInfoLinha(lin, idx)` | Info de serviço da linha. |

## 4. Catálogos (dicionários)

| Linha | Procedimento | Popula |
|------:|--------------|--------|
| 677 | `Sub CarregarCatalogoMateriais()` | `dCatMat` (MATERIAS_ATUAIS.xlsx) |
| 732 | `Sub CarregarDescServico()` | `dDescSrv` (catálogo **embutido** de descrições, `base_servi_os.xlsx`) |
| 1342 | `Function DescServico(cod)` | Consulta `dDescSrv`. |
| 1359 | `Function CatInfo(codMat, idx)` | Consulta `dCatMat`. |
| 1372 | `Sub CarregarCatalogoServicos()` | `dCatSrv` |
| 1466 | `Function SrvInfo(codSrv, idx)` | Consulta `dCatSrv`. |
| 1481 | `Sub CarregarCatalogoClasse()` | `dCatCC` |
| 1533 | `Sub CarregarClassificacaoClassesDados()` | Overrides curados de classe (42) + chama `CarregarClassesCustoAuto`. |
| 1613 | `Sub CarregarClassesCustoAuto()` | Base completa CLASSE_CUSTO_ATUAIS embutida (782 classes). |
| 1608 | `Sub AddClasseCusto(...)` | Insere classe. |
| 2360 | `Function CCInfo(codCC, idx)` | Consulta `dCatCC`. |
| 2376 | `Sub CarregarConversoesCabo()` | `dCabo` (KG→m) |
| 2411 | `Function CaboFator(codMat)` | Fator de cabo. |
| 2425 | `Sub CarregarComboServico()` | `dCombo` |
| 2476 | `Function ComboFator(codSrv)` | Fator combo. |
| 2498 | `Sub CarregarTipoClassif()` | `dTipoCls` (COM/UC/UAR) — curadas + `CarregarTipoClassifAuto` + CONFIG `FAM_UAR` |
| 2547 | `Sub CarregarTipoClassifAuto()` | 804 famílias UC/COM do CLS3 do catálogo (não sobrepõe curadas) |
| 3357 | `Sub AddTipoCls(fam, tipo)` | Insere família em `dTipoCls` se ainda não existir |
| 3368 | `Sub CarregarEquivSrvMat()` | `dFamEquiv` (CLS2 serviço → família material; + CONFIG `EQUIV_SRV_MAT`) |
| 3397 | `Sub CarregarSrvPuro()` | `dSrvPuro` (famílias sem material esperado; + CONFIG `SRV_PURO`) |

## 5. Helpers de classificação e cálculo

| Linha | Procedimento |
|------:|--------------|
| 615 | `Function Cls2SrvOverride(codSrv)` — overrides fixos (`COND PROT`) |
| 648 | `Function TipoPEPCodigo(pep)` |
| 657 | `Function TipoPEPANEEL(pep)` |
| 665 | `Function ClassificacaoPendente(cls1,cls2,cls3)` |
| 1349 | `Function NormCod(v)` |
| 3428 | `Function NormClassif(s)` |
| 3443 | `Function TipoDaClassif(classif, ...)` |
| 3460 | `Function FamiliaAlias(cls2)` — unifica COND* e aplica `dFamEquiv` |
| 3422 | `Function EhServicoPuro(cls2)` |
| 3474 | `Function EhCabo(cls2)` |
| 3481 | `Function CobertoReligador(cls2)` |
| 3487 | `Function DentroMargem(a, b)` |
| 3502 | `Function PEP3(pep)` — PEP 3º nível |
| 3511 | `Function SegmentoPI(pep)` |
| 3520 | `Function GrupoPerc(pep)` |
| 3529 | `Function EhMaterial(classif)` |
| 3534 | `Function ToNum(v)` |

## 6. Geradores de abas

| Linha | Procedimento | Aba |
|------:|--------------|-----|
| 3542 | `Sub Gerar_RazaoCJ()` | `RAZAO CJ` |
| 3602 | `Sub Gerar_MaterialVsServico()` | `MATERIAL vs SERVICO` (+ popula `dMvSVerd/dMvSFamNC/dMvSDif`) |
| 4168 | `Sub Gerar_AnaliseCA()` | `ANALISE DE CA` |
| 4389 | `Sub Gerar_ClasseDeCusto()` | `CLASSE DE CUSTO` |
| 4438 | `Sub Gerar_Material()` | `MATERIAL` |
| 4575 | `Sub Gerar_Servico()` | `SERVICO` |
| 4729 | `Sub Gerar_AlertasCriticos()` | `ALERTAS CRITICOS` |
| 5241 | `Sub Gerar_Regras()` | `REGRAS` |
| 5489 | `Sub Gerar_PainelExecutivo()` | `PAINEL EXECUTIVO` |
| 5751 | `Sub Gerar_ServicoSemMaterial()` | `SERVICO SEM MATERIAL` |
| 5856 | `Sub Gerar_PortfolioObra()` | `PORTFOLIO OBRA` |
| 6031 | `Sub Gerar_NaoClassificados()` | `NAO CLASSIFICADOS` |
| 6114 | `Sub Gerar_RacionalizacaoCOM()` | `RACIONALIZACAO COM` |
| 6939 | `Sub Gerar_MatVsServAT()` | `MAT vs SERV AT` (módulo AT) |
| 8204 | `Sub CriarPremissas()` | `PREMISSAS` |

### Helpers de ANALISE DE CA
4272 `ValorCat` · 4277 `CategoriaAnaliseCA` · 4325 `CategoriaPorClasseCusto` · 4340 `ClasseCustoDadosOutros` · 4346 `MapCategoriaCA`

### Helpers de ALERTAS
5153 `EscreverCardAlerta` · 5195 `EscreverCabecalhoAlerta`

### Helpers de RACIONALIZACAO COM
6276 `CriarMapaNT006_RC` · 6368 `AddMatRC` · 6390 `EhPepEmergencia` · 6395 `AtvPrevista`

### Classes de viagem
5724 `EhClasseViagem` · 5735 `DescClasseViagem`

## 7. Escrita, ordenação e formatação de abas

| Linha | Procedimento |
|------:|--------------|
| 5327 | `Sub EscreverAba(nome, outp())` |
| 5365 | `Sub OrdenarAba(ws, nome, ...)` |
| 6418 | `Sub AplicarFreeze(ws, celula, ...)` |
| 6435 | `Function CategoriaVeredito(v)` |
| 6451 | `Sub ColorirColunaVeredito(ws, jc, nR)` |
| 6473 | `Sub PintarRunVeredito(ws, jc, ...)` |
| 6494 | `Sub PintarStatusRC(ws, linIni, ...)` |
| 6639 | `Function EhColunaVeredito(hh)` |
| 6647 | `Function CorAba(nome)` |
| 6665 | `Function FormatoColuna(hh)` |
| 6692 | `Sub FormatarVisualAba(ws, nome, ...)` |
| 6915 | `Sub OrganizarAbas()` |

## 8. Configuração (aba CONFIG)

| Linha | Procedimento |
|------:|--------------|
| 6515 | `Sub GarantirConfig()` |
| 6572 | `Sub CarregarConfig()` |
| 6599 | `Function CfgTxt(chave, padrao)` |
| 6610 | `Function CfgNum(chave, padrao)` |
| 6620 | `Function CaminhoCatalogo(chave, padrao)` |

## 9. Módulo AT (`MAT vs SERV AT`)

| Linha | Procedimento |
|------:|--------------|
| 6959 | `Sub CarregarDados_AT()` |
| 7017 | `Sub CarregarCorresp()` |
| 7083 | `Function AcharAbaCorresp()` |
| 7095 | `Function AchaCorrespNoWb(wb)` |
| 7113 | `Function NomeNorm(s)` |
| 7127 | `Sub AplicarRegrasPreAgrupamento()` |
| 7174 | `Sub AgruparItens()` |
| 7245 | `Sub AplicarRegrasPosAgrupamento()` |
| 7380 | `Sub PadronizarCls2()` |
| 7426 | `Sub CalcularMatSrv()` |
| 7537 | `Sub CalcularAderencia()` |
| 7745 | `Sub CalcularTipoCusto()` |
| 7761 | `Sub CalcularPctMop()` |
| 7800 | `Sub OrdenarPorGrupo()` |
| 7841 | `Sub QuickSortIdx(keys, idx, lo, hi)` |
| 7862 | `Function DeveOrdenar(a, b)` |
| 7883 | `Function TipoOrdem(a)` |
| 7893 | `Sub EscreverAbaAT()` |

### Helpers AT (códigos/serviços)
8085 `CleanCod` · 8093 `TemSaldo` · 8097 `ContemPalavra` · 8101 `EhAutoCorrespondente` · 8111 `EhNaCorresp` · 8121 `GetTipoServico` · 8136 `GetGrupoKey` · 8172 `PepExisteComSufixo` · 8182 `PepTemMob`

## 10. Helpers de PREMISSAS
8435 `SecaoTitulo` · 8447 `TabelaCabecalho` · 8462 `LinhaDados` · 8491 `AplicarBordas`

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

### Redesign da camada visual (design tokens)

- **Design tokens centralizados**: bloco de constantes `COR_UI_*` + `FONTE_UI` no topo do módulo — fonte única de verdade para cores de cabeçalho, zebra, borda, tinta, barras de dados e semântica (OK/BAD/WARN/NEU/INFO, fundo+texto). Toda a camada visual passou a referenciar esses tokens.
- **Novos helpers de formatação**: `LarguraMaxColuna` (largura por tipo de coluna), `FormatoNegativo` (formato numérico com negativos em vermelho) e `PrepararImpressao` (configura área de impressão/cabeçalho por aba — chamado em ALERTAS, abas padrão, CHECKLIST e PREMISSAS).
- `FormatarVisualAba`, ALERTAS CRITICOS (cards/seções), PAINEL EXECUTIVO e CHECKLIST repaginados sobre os tokens. Lógica de negócio inalterada.

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

### Pós-merge #15 (branch reiniciada da main)

- **OBS2 (MATERIAL vs SERVICO)**: motivo do veredito do PEP3 replicado em todas as linhas do PEP3 (aprovação com margem usada; reprova com motivo agregado).
- **Aba SERVICO ampliada (16 colunas)**:
  - `UND` (unidade de medida): UML do lançamento SAP; fallback coluna `UN` do catálogo (`dCatSrv` idx 5).
  - `DESCRICAO_SERVICO` com fallback ao `TEXTO BREVE` da própria base (também em SERVICO SEM MATERIAL).
  - `ALERTA_VALOR`: automatiza o "CHECK DE VALOR DO SERVICO" (VALOR/QTD negativos → sinalizado; senão OK).
  - `APROPRIACAO`: automatiza o "CHECK DE APROPRIACAO CORRETA DE SERVICO" — `TIPO_APLICACAO` ODI* lançado em PEP `.D` (ou ODD* em `.I`) → `VERIFICAR`; fallback por palavra-chave (INST em ODD, RET/DESATIV/DESMONT em ODI). Colunas pintadas automaticamente (verde OK / vermelho VERIFICAR).
- **CHECKLIST CKCP**: macro avulsa `GerarChecklistCKCP` (Alt+F8) cria aba com as 27 etapas do processo (STATUS via dropdown com cores, CORTE ID, % concluído automático). Não-destrutiva e fora do `GerarRelatorio`.
- `EhColunaVeredito` reconhece `APROPRIACAO`; `CategoriaVeredito` reconhece `VERIFICAR` (vermelho).
