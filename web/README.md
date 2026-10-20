# AsBuilt Energe — Web MVP

MVP de site que **porta o motor de classificação** do módulo VBA `vba/ASBUILTENERGE.bas` (v4.0) para o navegador. Você cola os textos do as-built e o site devolve **família, status, nome do material, confiança, fonte da classificação e revisão**, além do **resumo agrupado** (`N D11600`) e exportação **CSV**.

> Continuação do projeto ASBUILTENERGE como aplicação web. O processamento é 100% client-side — nenhum dado sai do dispositivo.

## Arquitetura (modular, sem framework)

```
web/
├── index.html          # Shell da UI
├── assets/
│   └── app.css         # Estilos (claro/escuro, responsivo)
├── src/
│   ├── engine.js       # Motor: porte fiel das regras do .bas (ES module)
│   ├── report.js       # Agregações (resumo por status) + CSV
│   └── ui.js           # Controlador da interface (DOM)
├── package.json
└── README.md
```

Camadas separadas e escaláveis:
- **engine.js** — lógica de domínio pura (sem DOM): `classificarLinha`, `classificarFamilia`, `statusPorLayer`, `familiaPosteDoPrefixo`, `ehCodigoEstruturaSAP`, `somarMetrosRamal`, etc. Testável fora do navegador.
- **report.js** — agrega os registros (`resumoPorStatus`, `totaisPorFamilia`, `registrosParaCSV`).
- **ui.js** — só orquestra entrada/saída e renderização.

## Como rodar

Por usar ES modules, precisa de um servidor estático (abrir o `index.html` via `file://` não carrega os módulos):

```bash
cd web
python3 -m http.server 8080      # ou: npm run dev
# abra http://localhost:8080
```

## Formato de entrada

- Um texto por linha (coluna "Conteúdo do Texto" do as-built).
- O **Layer** (que define o status) pode ser informado no campo global, ou por linha:
  - `LAYER⇥texto` (tab) ou `LAYER ;; texto`.

## Regras portadas

As mesmas do `.bas` v4.0 (ver `vba/ASBUILTENERGE_DOC.md`): famílias por palavra-chave, prioridade do **código SAP** (`<8 dígitos><sep>`), poste por prefixo (D/V/C/M), ramal com metragem entre parênteses, status por layer (`#INSTALADO`/`#RETIRADO`/`EXISTENTES`…), confiança (Alta/Média/Baixa) e marcação **REVISAR**.

## Fluxo de manutenção

Este web app **espelha** o motor do VBA. Ao mudar regra de classificação:
1. Ler `vba/ASBUILTENERGE_DOC.md`.
2. Ajustar o `.bas` e atualizar o MD.
3. Refletir a mesma regra em `web/src/engine.js` (manter nomes de família/status idênticos).
