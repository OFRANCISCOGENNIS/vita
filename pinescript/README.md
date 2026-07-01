# 📊 Simulador: Confluência Multi-Fator [Forex/Cripto]

Um **simulador visual interativo** do indicador Pine Script v5 em HTML/CSS/JavaScript puro que roda 100% localmente no navegador.

## 🚀 Como usar

### Opção 1: Python SimpleHTTPServer (Python 3)

```bash
cd pinescript/
python3 -m http.server 8000
```

Então abra o navegador em: **http://localhost:8000**

### Opção 2: Node.js http-server

```bash
npm install -g http-server
cd pinescript/
http-server -p 8000
```

Acesse: **http://localhost:8000**

### Opção 3: Node.js embutido (sem instalação)

```bash
cd pinescript/
node -e "const http = require('http'); const fs = require('fs'); const path = require('path'); const server = http.createServer((req, res) => { const file = path.join(__dirname, req.url === '/' ? 'index.html' : req.url); fs.readFile(file, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(err ? '404' : data); }); }); server.listen(8000, () => console.log('http://localhost:8000')); });"
```

### Opção 4: PHP embutido (PHP 5.4+)

```bash
cd pinescript/
php -S localhost:8000
```

---

## 📋 Funcionalidades

### 🎮 Controles em Tempo Real

- **Tendência (EMAs)**
  - EMA Rápida (default 9)
  - EMA Lenta (default 21)
  - EMA 200 (viés macro)
  - Toggle on/off para desativar este fator

- **Momentum (RSI)**
  - Período do RSI (default 14)
  - Zona de Sobrevenda (default 30)
  - Zona de Sobrecompra (default 70)
  - Toggle on/off

- **Volatilidade (ATR)**
  - Período do ATR (default 14)
  - Média do ATR (default 50)
  - Toggle on/off

- **Estrutura (Rompimento)**
  - Lookback (nº de velas, default 20)
  - Valida rompimento da máxima/mínima recente
  - Toggle on/off

- **Anti-Ruído**
  - Confirmação de fechamento de vela
  - Cooldown entre sinais (default 5 velas)

### 📊 Gráficos Interativos

1. **Preço & Tendência (EMAs)**
   - Linha de fechamento
   - EMA Rápida (azul tracejada)
   - EMA Lenta (laranja tracejada)
   - EMA 200 (roxo fina)

2. **RSI (Momentum)**
   - Gráfico em área com linhas de referência (30/70)
   - Sobrevenda e sobrecompra marcadas

3. **ATR (Volatilidade)**
   - ATR atual vs Média do ATR
   - Identifica períodos laterais (ATR < Média)

4. **Status de Sinais**
   - Total de sinais LONG e SHORT
   - Último sinal disparado
   - Viés atual (ALTA / BAIXA / NEUTRO)
   - Status de cada filtro (✓ ativo / – desligado)

### 🎯 Simulação

- **Gerar Dados**: cria série OHLC aleatória parametrizável
  - Nº de velas: 20-500
  - Volatilidade: 0.5%-10%
- **Recalcular Sinais**: roda o indicador com os parâmetros atuais
- Todos os cálculos acontecem no navegador (sem backend)

---

## 📈 Lógica de Confluência

Um sinal LONG dispara quando **TODOS** os fatores abaixo se alinham (cada um pode ser desligado):

```
✓ Tendência: EMA Rápida > EMA Lenta
✓ Macro:     Preço > EMA 200
✓ Momentum:  RSI cruzando acima de 30 (sobrevenda)
✓ ATR:       ATR Atual > Média do ATR (movimento com força)
✓ Estrutura: Preço rompendo máxima recente
✓ Cooldown:  N velas desde o último sinal
```

**SHORT** é o espelho (todas as condições invertidas).

---

## 🔧 Arquivos

```
pinescript/
├── index.html          # Página principal (HTML5)
├── styles.css          # Estilo responsivo
├── app.js              # Lógica do indicador + renderização
├── README.md           # Este arquivo
└── Confluencia_Multi_Fator_Forex_Cripto.pine  # Código Pine Script v5 original
```

---

## 💡 Dicas de Uso

### Testar Diferentes Combinações de Filtros

1. Gere dados com uma volatilidade realista (ex.: 2%)
2. Desative filtros um a um (ex.: desativar ATR, depois EMA 200)
3. Observe como o número de sinais muda
4. Procure a combinação que melhor se adapta ao seu estilo

### Validar Sinais

- Use o gráfico de RSI para confirmar a zona de entrada
- Verifique no gráfico de ATR se o mercado tem força no momento do sinal
- Compare com o gráfico de preço: o rompimento é real?

### Anti-Ruído

- Aumente o **Cooldown** (ex.: 10 velas) para filtrar ruído em M1/M5
- Ative **Confirmação de fechamento** para evitar sinais prematuros
- Diminua a **volatilidade dos dados** para testar em mercado lateral

---

## ⚠️ Aviso Importante

**FERRAMENTA DE ESTUDO. Não é recomendação financeira.**

Este simulador é 100% educacional:
- Não conecta a nenhuma corretora ou API real
- Não envia ou executa ordens
- Os dados são simulados (OHLC aleatório)

**Antes de usar o indicador real em produção:**
1. ✅ Backtest extenso (mínimo 6 meses de histórico)
2. ✅ Forward test (2-4 semanas em conta demo)
3. ✅ Validação de entrada/saída e risco/retorno
4. ✅ Atenção especial em M1/M5 (spread, corretagem corroem o edge)

---

## 📝 Referências

- **Indicador Pine Script original**: `Confluencia_Multi_Fator_Forex_Cripto.pine`
- **Documentação**: Comentários em PT dentro do código
- **Gráficos**: Chart.js v3 (cdn)

---

## 🐛 Troubleshooting

### "Erro de CORS ao carregar Chart.js"
→ Use o servidor Python/Node/PHP acima (não abra o HTML diretamente)

### "Os gráficos não aparecem"
→ Abra o console do navegador (F12) e verifique se há erros JavaScript

### "Mudei os parâmetros mas nada aconteceu"
→ Clique em **"🔄 Recalcular Sinais"** após ajustar os inputs

---

**Versão**: 1.0  
**Atualizado**: 2026-07-01  
**Autor**: Claude (Anthropic)
