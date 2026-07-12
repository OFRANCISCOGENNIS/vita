# 🥗 Consultor Nutricional

Aplicação web de nutrição baseada em evidência — calcula calorias e macros, monta cardápio semanal com variação treino/descanso, lista de compras e plano de treino. **100% offline, roda inteiramente no navegador**, sem back-end e sem enviar dados.

> ⚕️ Ferramenta **educacional** — não substitui avaliação de nutricionista ou médico.

## ✨ Funcionalidades

- **Triagem em 4 passos**: objetivo → perfil → saúde → preferências, com barra de progresso
- **Regra de parada de segurança**: condições clínicas, gestação/lactação, medicação relevante ou histórico de transtorno alimentar → não prescreve, encaminha a profissional
- **Cálculos**: TMB (Mifflin-St Jeor), TDEE, meta calórica por objetivo, macros (faixas ISSN 2017), água (35 ml/kg) e **IMC** com classificação OMS
- **Cardápio semanal (7 dias)** com variação diária de carboidratos, legumes, café e lanche
- **Ajuste treino × descanso**: carboidrato reduzido em dias de descanso, proteína mantida (ciclo de carboidratos — evidência moderada)
- **Seletor de dias de treino** da semana (ou derivação automática pelo nível de atividade)
- **Proteínas selecionáveis** para a lista de compras, por tipo de dieta (onívoro / vegetariano / vegano)
- **Plano de treino**: musculação, corrida, força e ciclismo — frequência, estrutura, progressão e nível de evidência
- **Persistência**: salva o progresso no `localStorage` (refresh não perde nada)
- **Exportar**: imprimir/PDF e copiar resumo para a área de transferência
- **Design futurista**: dark glassmorphism, aurora animada, acentos neon

## 🚀 Como usar

### Opção 1 — abrir direto (sem instalar nada)
Baixe `public/index.html` e abra no navegador (duplo-clique). Pronto.

### Opção 2 — servir localmente
```bash
npm install
npm start
# http://localhost:3000
```

## 🧪 Metodologia

| Métrica | Fórmula / Base |
|---------|----------------|
| TMB | Mifflin-St Jeor |
| TDEE | TMB × fator de atividade (PAL) |
| Proteína | 1,4–2,0 g/kg conforme objetivo (ISSN 2017, Morton et al. 2018) |
| IMC | peso / altura² (classificação OMS) |
| Água | 35 ml/kg |

Temas controversos (ciclo de carboidratos, timing de nutrientes) são apresentados com o **grau de evidência** correspondente, sem prometer resultados.

## 🔒 Privacidade

Nenhum dado sai do seu dispositivo. Todo o processamento é feito em JavaScript no navegador; a persistência usa apenas `localStorage` local.

## 🛠️ Stack

- Frontend estático puro (HTML + CSS + JS vanilla, sem dependências no cliente)
- `server.js` — Express opcional só para servir os arquivos estáticos localmente

## 📄 Licença

Uso educacional.
