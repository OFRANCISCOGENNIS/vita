# AUDITOR ANEEL COMPLETO — Suíte de Testes de Auditoria BRR

Módulo VBA `vba/AUDITOR_ANEEL_COMPLETO.bas`. Dois pontos de entrada:

- `GerarRelatorio()` — análise de custos CKCP (Módulo 1).
- `AUDITOR_ANEEL_Main()` — auditoria forense/regulatória BRR (Módulos 2 e 3).

## Como usar a auditoria

1. Renomeie a aba com os lançamentos do SAP para **`DADOS`** (cabeçalhos na linha 1).
2. `Alt+F11` → Importar o `.bas` → `Alt+F8` → `AUDITOR_ANEEL_Main` → Executar.
3. Resultado consolidado na aba **`DASHBOARD`** (score 0–100) e **`RESUMO`**.

Colunas reconhecidas (match exato de cabeçalho): `PEP`, `CLASSE_CUSTO`, `DESC_CLASSE_CUSTO`,
`VALOR_MOEDA`, `DATA_LANCAMENTO`, `DATA_DOCUMENTO`, `NUM_DOC`, `MATERIAL`, `TEXTO_MATERIAL`,
`QTD_ENTRADA`, `DENOMINACAO`, `USUARIO`, `TIPO_DOC`, `TIPO_APLICACAO`, `UML`.
Sufixo do PEP: `.I` = ODI (investimento), `.D` = ODD (desativação), `.M` = ODM (manutenção).

## Os 27 testes

### Módulo 2 — Forenses (originais)
| # | Aba | O que verifica | Referência |
|---|-----|----------------|-----------|
| 1 | `CLASSIFICACAO` | CAPEX/OPEX/Inelegível por palavra-chave | REN 396/2010, PRORET 2.3 |
| 2 | `DUPLICIDADES` | Mesmo PEP+doc+valor repetido | PRORET 2.3 |
| 3 | `ATV_DRT` | Custos administrativos vs diretos (25/50/100%) | PRORET 2.3 |
| 4 | `RETROATIVOS` | Defasagem documento→lançamento (90/365 d) | CPC 23 |
| 5 | `ESTORNOS` | Ratio de estornos por PEP (5%/20%) | MCSE |
| 6 | `FORNECEDORES` | Concentração top-3 (50%/70%) | PRORET 2.3 |
| 7 | `BENFORD` | Lei de Benford, 1º dígito, MAD | Nigrini 2012 |
| 8 | `SOBREPRECO` | Preço unitário vs mediana por material | PRORET 2.3 / BPR |

### Módulo 3 — Extensão BRR (novos)
| # | Aba | O que a ANEEL audita | Referência | Severidade |
|---|-----|----------------------|-----------|-----------|
| 9 | `OPEX EM ODI` | OPEX/despesa capitalizado em ordem `.I` (saneamento do VOC) | PRORET 2.3 | >2% ou >R$50k = CRÍTICO |
| 10 | `CAPEX ODM ODD` | Investimento/material imobilizável em `.M`/`.D` | MCPSE 5.1.2 | >R$10k ou >20% = CRÍTICO |
| 11 | `DESPESAS VEDADAS` | Multa, doação, brinde, patrocínio, marketing, indenização em obra | MCSE (tolerância zero) | qualquer = CRÍTICO |
| 12 | `OBRIG ESPECIAIS` | Obra de terceiro (part. financeira/convênio/LpT/doação) sem crédito de OE deduzido da BRR | REN 1000/2021, PRORET 2.3 | IOE=0 = CRÍTICO |
| 13 | `AIC UNITIZACAO` | ODI com saldo parado (aging/paralisação) — fora da BRR até virar AIS | MCPSE 674/2015 | inativ>12m ou idade>24m = CRÍTICO |
| 14 | `JOA` | Juros sobre obras acima do teto (8% do direto); vedado em obra parada | MCSE 6.3.19, CPC 20 | >16% = CRÍTICO |
| 15 | `CUSTOS ADICIONAIS` | Decomposição principal/COM/CA/MOP/frete/viagem/adm vs BPR | REN 1.058/2023 | adic>50% ou COM>60% = CRÍTICO |
| 16 | `ATIVOS ADMIN` | Veículo, TI, software, móveis (BAR) em obra de rede | MCSE 17.3/17.4 | em `.I` = CRÍTICO |
| 17 | `DUPLIC ENTRE OBRAS` | Mesmo doc+material+valor em PEPs distintos | PRORET 2.3 | qualquer = CRÍTICO |
| 18 | `INTEGRIDADE CAD` | Qtd zerada com valor, UML vazio, qtd líquida negativa por material | MCPSE (UC/UAR) | qtd neg. líquida = CRÍTICO |
| 19 | `OBRA SEM LASTRO` | ODI relevante (≥R$50k) só com serviço, sem material físico | PRORET 2.3 (validação campo) | 0% físico = CRÍTICO |
| 20 | `TERRENOS SERVID` | Terreno/servidão a segregar (entra sem depreciação) | MCPSE Tab. XVI | >20% do PEP = CRÍTICO |

### Módulo 4 — Forense de dados
Indícios de manipulação nos próprios lançamentos. Não geram glosa direta — servem para
**priorizar a amostra documental**. Peso menor no score.

| # | Aba | O que detecta | Referência | Severidade |
|---|-----|---------------|-----------|-----------|
| 21 | `VALORES REDONDOS` | Excesso de lançamentos em múltiplos exatos de R$ 1.000 | ISA 240 | >15% dos lanç. = CRÍTICO |
| 22 | `FDS FERIADOS` | Lançamentos em sábado/domingo/feriado nacional, por usuário | ISA 240 | ≥5 e >10% = CRÍTICO |
| 23 | `CUTOFF EXERCICIO` | Concentração de custo em dezembro (regularização em bloco) | CPC 23 | dez >30% do ano = CRÍTICO |
| 24 | `FRACIONAMENTO` | ≥3 docs no mesmo dia/PEP/usuário, todos < alçada, soma > alçada | praxe TCU/CGU | ≥5 docs = CRÍTICO |
| 25 | `BENFORD D2` | Lei de Benford no 2º dígito (MAD) | Nigrini 2012 | MAD ≥1,2 = não-conformidade |
| 26 | `USUARIOS` | Concentração de valor lançado por usuário (segregação de funções) | ISA 240 | top >60% = CRÍTICO |
| 27 | `ESTORNO RELANC` | Estorno seguido de relançamento com valor alterado em ≤30 dias | ISA 240 | relançado a maior = CRÍTICO |

## Score de Compliance

Parte de 100 e desconta por achado, com teto por teste:
- **Testes de glosa** (9–20): CRÍTICO −2 / ATENÇÃO −0,5.
- **Testes forenses** (21–27): CRÍTICO −1 / ATENÇÃO −0,25 (indiciários).

Faixas: **≥85** Baixo Risco · **65–84** Atenção · **45–64** Risco Elevado · **<45** Crítico.

## Parâmetros (constantes no `.bas`, ajustáveis)

`AUD_OPEX_ATENCAO=2%` · `AUD_JOA_TETO=8%` · `AUD_CA_TETO=35%` · `AUD_COM_TETO=40%`
`AUD_AIC_ATEN_M=6` / `AUD_AIC_CRIT_M=12` / `AUD_AIC_IDADE_M=24` meses · `AUD_LASTRO_MIN=R$50k`
`AUD_MAT_MIN=R$1k` (materialidade de ruído) · `AUD_OE_RATIO_MIN=10%`.

Forenses: `FOR_REDONDO_ATEN=5%` / `FOR_REDONDO_CRIT=15%` · `FOR_DEZ_ATEN=15%` / `FOR_DEZ_CRIT=30%`
`FOR_FRAC_NDOC=3` / `FOR_FRAC_NDOC_CR=5` · `FOR_USR_ATEN=40%` / `FOR_USR_CRIT=60%`
`FOR_RELANC_DIAS=30` / `FOR_RELANC_DELTA=20%` · `FOR_BENF2_*` = 0,8 / 1,0 / 1,2 (MAD Nigrini).

## Observações metodológicas

- Testes de **Obrigações Especiais**, **terrenos** e **ativos administrativos** usam marcadores
  heurísticos (palavras em `DENOMINACAO`/`DESC_CLASSE_CUSTO`); exigem triagem documental antes de
  concluir glosa. Cada aba traz nota de rodapé com o alerta.
- A **data-base** de aging (testes 13) usa a maior `DATA_LANCAMENTO` da base, permitindo rodar sobre
  exports históricos sem depender da data atual.
- Os limiares de COM/CA/sobrepreço são *proxy* analítico; a glosa oficial usa o BPR por tipologia.
- Itens auditados pela ANEEL que **não** são verificáveis só com o export (inspeção física de campo,
  laudo de avaliação a valor de mercado, conciliação com a BDGD, WACC do ciclo) ficam fora do escopo
  automatizável e devem ser tratados na validação documental.
- Os testes forenses (21–27) apontam **indícios estatísticos**, não irregularidade comprovada.
  Usuários de integração/batch concentram lançamentos e podem rodar fora do expediente
  legitimamente — validar a natureza do usuário antes de concluir (testes 22 e 26).
- `ESTORNO RELANC` serializa data/valor com `Str`/`Val` (locale-independentes) em vez de
  `CStr`/`CDbl`, que quebrariam em ambiente pt-BR com vírgula decimal.
