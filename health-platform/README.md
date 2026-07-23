# Plataforma de Saúde, Performance e Nutrição — arquitetura determinística

Sem IA externa: toda recomendação nasce de **fórmulas nomeadas** e de **consultas a um banco versionado**. Mesmo input → mesmo output, sempre.

## Artefatos

| Arquivo | O que é |
|---------|---------|
| `MEGA_PROMPT.md` | Especificação completa: 16 módulos + identidade, guardrails, arquitetura, formato de resposta, roadmap e padrão de qualidade |
| `DB_SCHEMA.sql` | Esquema relacional (PostgreSQL): ~40 tabelas em 10 blocos, tudo rastreável a `dataset_version` |
| `SEED.sql` | Dados de referência: 12 fórmulas, 18 diretrizes (ISSN/ACSM/Helms com fonte), 15 estratégias de dieta com contraindicações, 12 marcadores + faixas de exame, 5 regras de adaptação com explicação em 3 níveis, amostras TACO e de exercícios, anamnese priorizada |
| `engine/` | Implementação de referência do motor determinístico (JS puro, zero dependências) |

## Motor (`engine/`)

| Módulo | Cobre | Destaques |
|--------|-------|-----------|
| `formulas.js` | Módulos 3, 4, 14 | TMB (Mifflin/Katch-McArdle/Harris-Benedict com seleção por regra), TDEE, kcal-alvo com piso 1,1×TMB, macros por diretriz (Helms em déficit), US Navy %BF, Epley 1RM, zonas Karvonen/Tanaka, FFMI, água |
| `guardrails.js` | Parte B, Módulo 8 | Red flags (dor torácica, IMC<17,5 + cutting, indícios de TA, gestação, DM1, menor sem responsável, exame crítico) com semântica bloqueante/não bloqueante; interpretação educativa de exames por faixa |
| `dietGenerator.js` | Módulo 6 | Filtro por estratégia/alergia/restrição, contraindicação de dieta por condição do usuário, montagem de refeição proteína-primeiro com teto de 40 g/refeição, substituições isocalóricas por distância de macros |
| `workoutGenerator.js` | Módulo 7 | Filtro lesão/equipamento/nível, splits por frequência, faixas por objetivo, descanso por tipo de exercício, auditoria de volume semanal, progressão dupla automática (+2,5%/+5%) |
| `adaptation.js` | Módulos 9, 15 | Platô por regressão linear (tendência, não ruído; exige adesão ≥80% antes de cortar kcal), freio de perda rápida (>1,5%/sem → +10% kcal), ETA de meta com faixa de incerteza |

## Rodar os testes

```bash
cd engine && node test.js   # 48 testes, incluindo verificação de determinismo em cada módulo
```

## Propriedades garantidas por teste

- Determinismo: toda função pública testada com dupla execução + `deepStrictEqual`.
- Segurança: piso calórico 1,1×TMB; teto proteico por refeição; red flags bloqueiam geração; dietas contraindicadas recusadas; lesões excluem exercícios sem exceção.
- Auditabilidade: todo resultado carrega `{ formula, source, confidence }`.

> Aviso: conteúdo educativo; não substitui acompanhamento profissional presencial.
