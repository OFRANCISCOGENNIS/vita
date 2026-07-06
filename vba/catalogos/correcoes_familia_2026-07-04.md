# Correção de FAMILIA — materiais com descrição abreviada

Auditoria de 16 materiais sem classificação correta de FAMILIA, feita cruzando
a descrição (`DESC MAT`) com a lógica de classificação `ClassificarDesc` do
módulo `vba/inventario.bas` (fallback por descrição da NT.006/NT.018).

## Tabela de correções

| DESC MAT | UND | FAMILIA anterior | FAMILIA corrigida | Motivo |
|---|---|---|---|---|
| FIO CU MOLE 2,5MM2 750V PVC VM | M | CABO ISOLADO | **CABO ISOLADO** ✅ | Fio de cobre com isolação PVC — mantém |
| CONEC PAR FEND 16-35/6-35 PM-BR71035 BLQ | UN | MAT. COM | **CONECTOR** | "CONEC PAR FEND" = conector perfurante de fenda (cunha p/ ramal) |
| TP,17,5KV,USO EXTERNO,TIPO GSCT004/1,BLQ | UN | TP | **TP** ✅ | Transformador de Potencial — mantém |
| CABO IS CU MOL 16MM² 750V PVC PT CL5 | MT | MAT. COM | **CABO ISOLADO** ⚠️ | "CABO IS" = cabo isolado, mesma família do item 1 |
| LUVA,EME,COMP,AL,35MM2,C,PRE-REU,D710.89 | UN | MAT. COM | **LUVA EMENDA** | Luva de emenda por compressão em alumínio |
| TD 1F FN 34,5KV 50KVA 220V 3 OV PDE | UN | TRAFO | **TRAFO** ✅ | TD = Transformador de Distribuição — mantém |
| TD 1F FN 13,8KV 50KVA 220V 3 OV PDE | UN | TRAFO | **TRAFO** ✅ | mantém |
| TERMINAL ANEL/OLH TB CU 1F/1C 6MM² AM | UN | TERMIJNAO | **TERMINAL/MUFLA** ⚠️ | Corrige erro de digitação ("TERMIJNAO") |
| PLACA IDENTIF POSTE 65X400MM FIX BLQ | UN | MAT. COM | **MAT. COM** ✅ | Placa de identificação, não é o poste em si — mantém |
| SUP,EQUIP, P/CH FACA BY-PASS,34.5KV-BLQ | UN | MAT. COM | **SUPORTE** | Suporte de fixação p/ chave faca by-pass |
| POSTE CONC CIRC 12M 800DAN BLQ | UN | POSTE RD | **POSTE RD** ✅ | mantém |
| CONECTOR,TERM,PINO,1X35-185,M16,D71060 | UN | MAT. COM | **CONECTOR** ⚠️ | Terminal tipo pino de compressão — é conector, não confundir com "PINO" de cruzeta |
| ALÇA,PREF,DUPLA,CB CAA 4 AWG,102MM,BLQ | UN | MAT. COM | **ALCA PREFORMADA** | "PREF" = preformada; alça de ancoragem p/ cabo CAA |
| PINO,ISOL,CRUZETA MAD,CHUMBO,15KV,140MM | UN | MAT. COM | **PINO** ⚠️ | Pino isolador p/ cruzeta de madeira (família PINO, dependente de CRUZETA) |
| CON PER EST CB COB 15/25KV 50-185MM2 PDE | UN | MAT. COM | **CONECTOR** | Conector perfurante estanhado p/ cabo de cobre |
| TD 1F FN 13,8KV 50KVA 220V 3 OV PDE | UN | TRAFO | **TRAFO** ✅ | mantém |

**Legenda:** ✅ já estava correto · ⚠️ era um bug real de classificação (não apenas item novo/ambíguo)

## Resumo das correções (8 itens)

- item 2 → CONECTOR
- item 4 → CABO ISOLADO (estava em MAT. COM por engano)
- item 5 → LUVA EMENDA
- item 8 → TERMINAL/MUFLA (corrige o typo "TERMIJNAO")
- item 10 → SUPORTE
- item 12 → CONECTOR
- item 13 → ALCA PREFORMADA
- item 14 → PINO

## Ambiguidade "PINO" — atenção especial

Os itens 12 e 14 citam "PINO" na descrição em sentidos diferentes:

- **Item 14** — pino isolador de cruzeta (família **PINO** real, dependente de CRUZETA)
- **Item 12** — conector tipo pino de compressão (família **CONECTOR**)

Se o catálogo mestre (`MATERIAS_ATUAIS.xlsx`) for classificado automaticamente
por substring, vale revisar esse caso manualmente para não confundir as duas
famílias.

## Correções aplicadas em `ClassificarDesc` (vba/inventario.bas)

Commit `2d3b937`. Regras novas/ajustadas na função de fallback por descrição:

1. **PINO vs CRUZETA** — pino isolador de cruzeta de madeira agora é
   reconhecido antes da regra genérica de cruzeta (ancora).
2. **PINO vs CONECTOR** — quando "PINO" aparece junto de "CONECTOR"/"TERM"
   (terminal tipo pino de compressão), classifica como CONECTOR.
3. **PLACA IDENTIFICACAO** — nova família, checada antes de POSTE (evita que
   a placa "vire" poste só por citar onde é fixada).
4. **CONECTOR** — reconhece as abreviações de catálogo "CONEC" e "CON PER".
5. **ALCA PREFORMADA** — reconhece a abreviação "PREF" e não cai mais em
   CABO/CONDUTOR quando cita um cabo CAA.
6. **SUPORTE** — nova regra para abreviação "SUP" + "CH FACA"/"BY-PASS".

Validado com simulador Python fiel à lógica (sem Excel disponível no ambiente)
e travado com 7 novos testes de regressão em `TestarLogicaInventario`. Lint
estático: 54 procedimentos, 0 erros estruturais.
