// ============================================================================
// SIMULADOR CONFLUÊNCIA MULTI-FATOR — LÓGICA E RENDERIZAÇÃO
// ============================================================================

// Variáveis globais
let dados = [];
let sinaisLong = [];
let sinaisShort = [];
let chartPreco, chartRsi, chartAtr;

// ============================================================================
// BLOCO 1 — FUNÇÕES UTILITÁRIAS
// ============================================================================

/**
 * SMA (Simple Moving Average)
 */
function sma(array, period) {
    const result = [];
    for (let i = 0; i < array.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                sum += array[j];
            }
            result.push(sum / period);
        }
    }
    return result;
}

/**
 * EMA (Exponential Moving Average)
 */
function ema(array, period) {
    const result = [];
    const multiplier = 2 / (period + 1);

    let smaValue = null;
    for (let i = 0; i < array.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else if (i === period - 1) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += array[j];
            }
            smaValue = sum / period;
            result.push(smaValue);
        } else {
            smaValue = (array[i] - smaValue) * multiplier + smaValue;
            result.push(smaValue);
        }
    }
    return result;
}

/**
 * RSI (Relative Strength Index)
 */
function rsi(array, period) {
    const result = [];
    const changes = [];

    for (let i = 1; i < array.length; i++) {
        changes.push(array[i] - array[i - 1]);
    }

    for (let i = 0; i < changes.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            let gainSum = 0, lossSum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                if (changes[j] > 0) gainSum += changes[j];
                else lossSum += Math.abs(changes[j]);
            }
            const avgGain = gainSum / period;
            const avgLoss = lossSum / period;
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsiValue = 100 - (100 / (1 + rs));
            result.push(rsiValue);
        }
    }
    return result;
}

/**
 * ATR (Average True Range)
 */
function atr(high, low, close, period) {
    const result = [];
    const tr = [];

    for (let i = 0; i < close.length; i++) {
        let trValue;
        if (i === 0) {
            trValue = high[i] - low[i];
        } else {
            trValue = Math.max(
                high[i] - low[i],
                Math.abs(high[i] - close[i - 1]),
                Math.abs(low[i] - close[i - 1])
            );
        }
        tr.push(trValue);
    }

    const atrValues = sma(tr, period);
    return atrValues;
}

/**
 * Crossover: prev <= prevPrev e curr > currPrev
 */
function crossover(curr, prev, currPrev, prevPrev) {
    if (prev === null || prevPrev === null || currPrev === null) return false;
    return prevPrev <= prev && curr > currPrev;
}

/**
 * Crossunder: prev >= prevPrev e curr < currPrev
 */
function crossunder(curr, prev, currPrev, prevPrev) {
    if (prev === null || prevPrev === null || currPrev === null) return false;
    return prevPrev >= prev && curr < currPrev;
}

// ============================================================================
// BLOCO 2 — GERAÇÃO DE DADOS SIMULADOS
// ============================================================================

function gerarDadosSim(numCandles, volatilidade) {
    const dados = [];
    let preco = 100;

    for (let i = 0; i < numCandles; i++) {
        const open = preco;
        const change = (Math.random() - 0.5) * volatilidade;
        const close = open + change;
        const high = Math.max(open, close) * (1 + Math.random() * 0.01);
        const low = Math.min(open, close) * (1 - Math.random() * 0.01);

        dados.push({
            index: i,
            open: parseFloat(open.toFixed(4)),
            high: parseFloat(high.toFixed(4)),
            low: parseFloat(low.toFixed(4)),
            close: parseFloat(close.toFixed(4)),
            volume: Math.floor(Math.random() * 1000000) + 100000
        });

        preco = close;
    }

    return dados;
}

// ============================================================================
// BLOCO 3 — CÁLCULO DO INDICADOR
// ============================================================================

function calcularIndicador(dados) {
    // Obter inputs
    const useTendencia = document.getElementById('useTendencia').checked;
    const emaRapidaLen = parseInt(document.getElementById('emaRapida').value);
    const emaLentaLen = parseInt(document.getElementById('emaLenta').value);
    const useEma200 = document.getElementById('useEma200').checked;

    const useMomentum = document.getElementById('useMomentum').checked;
    const rsiLen = parseInt(document.getElementById('rsiLen').value);
    const rsiSobrevenda = parseInt(document.getElementById('rsiSobrevenda').value);
    const rsiSobrecompra = parseInt(document.getElementById('rsiSobrecompra').value);

    const useVolatilidade = document.getElementById('useVolatilidade').checked;
    const atrLen = parseInt(document.getElementById('atrLen').value);
    const atrMediaLen = parseInt(document.getElementById('atrMediaLen').value);

    const useEstrutura = document.getElementById('useEstrutura').checked;
    const estruturaLookback = parseInt(document.getElementById('estruturaLookback').value);

    const confirmarFechamento = document.getElementById('confirmarFechamento').checked;
    const cooldownVelas = parseInt(document.getElementById('cooldownVelas').value);

    // Extrair arrays
    const closes = dados.map(d => d.close);
    const highs = dados.map(d => d.high);
    const lows = dados.map(d => d.low);
    const volumes = dados.map(d => d.volume);

    // Calcular EMAs
    const emaRapida = ema(closes, emaRapidaLen);
    const emaLenta = ema(closes, emaLentaLen);
    const ema200 = ema(closes, 200);

    // Calcular RSI
    const rsiValues = rsi(closes, rsiLen);

    // Calcular ATR
    const atrValues = atr(highs, lows, closes, atrLen);
    const atrMedia = sma(atrValues, atrMediaLen);

    // Calcular máxima/mínima recente
    const maxRecente = [];
    const minRecente = [];
    for (let i = 0; i < closes.length; i++) {
        if (i === 0) {
            maxRecente.push(highs[i]);
            minRecente.push(lows[i]);
        } else {
            let max = -Infinity, min = Infinity;
            const start = Math.max(0, i - estruturaLookback);
            for (let j = start; j < i; j++) {
                max = Math.max(max, highs[j]);
                min = Math.min(min, lows[j]);
            }
            maxRecente.push(max);
            minRecente.push(min);
        }
    }

    // Calcular sinais
    sinaisLong = [];
    sinaisShort = [];
    let barrasDesdeUltimoSinal = 999999;

    for (let i = 1; i < closes.length; i++) {
        barrasDesdeUltimoSinal++;

        // Condições brutas
        const rawTendenciaLong = emaRapida[i] !== null && emaLenta[i] !== null && emaRapida[i] > emaLenta[i];
        const rawTendenciaShort = emaRapida[i] !== null && emaLenta[i] !== null && emaRapida[i] < emaLenta[i];

        const rawMacroLong = ema200[i] !== null && closes[i] > ema200[i];
        const rawMacroShort = ema200[i] !== null && closes[i] < ema200[i];

        const rawMomentumLong = rsiValues[i] !== null && rsiValues[i - 1] !== null &&
            crossover(rsiValues[i], rsiValues[i - 1], rsiSobrevenda, rsiSobrevenda);
        const rawMomentumShort = rsiValues[i] !== null && rsiValues[i - 1] !== null &&
            crossunder(rsiValues[i], rsiValues[i - 1], rsiSobrecompra, rsiSobrecompra);

        const rawVolatilidade = atrValues[i] !== null && atrMedia[i] !== null && atrValues[i] > atrMedia[i];

        const rawEstruturaLong = closes[i] > maxRecente[i - 1];
        const rawEstruturaShort = closes[i] < minRecente[i - 1];

        // Aplicar toggles
        const condTendenciaLong = !useTendencia || rawTendenciaLong;
        const condTendenciaShort = !useTendencia || rawTendenciaShort;

        const condMacroLong = !useEma200 || rawMacroLong;
        const condMacroShort = !useEma200 || rawMacroShort;

        const condMomentumLong = !useMomentum || rawMomentumLong;
        const condMomentumShort = !useMomentum || rawMomentumShort;

        const condVolatilidade = !useVolatilidade || rawVolatilidade;

        const condEstruturaLong = !useEstrutura || rawEstruturaLong;
        const condEstruturaShort = !useEstrutura || rawEstruturaShort;

        // Confluência
        const sinalLongBruto = condTendenciaLong && condMacroLong && condMomentumLong && condVolatilidade && condEstruturaLong;
        const sinalShortBruto = condTendenciaShort && condMacroShort && condMomentumShort && condVolatilidade && condEstruturaShort;

        // Cooldown
        const condCooldown = barrasDesdeUltimoSinal >= cooldownVelas;

        // Sinais finais
        if (sinalLongBruto && condCooldown) {
            sinaisLong.push({
                index: i,
                preco: closes[i],
                filtros: {
                    tendencia: rawTendenciaLong,
                    macro: rawMacroLong,
                    momentum: rawMomentumLong,
                    volatilidade: rawVolatilidade,
                    estrutura: rawEstruturaLong
                }
            });
            barrasDesdeUltimoSinal = 0;
        }

        if (sinalShortBruto && condCooldown && sinalLongBruto === false) {
            sinaisShort.push({
                index: i,
                preco: closes[i],
                filtros: {
                    tendencia: rawTendenciaShort,
                    macro: rawMacroShort,
                    momentum: rawMomentumShort,
                    volatilidade: rawVolatilidade,
                    estrutura: rawEstruturaShort
                }
            });
            barrasDesdeUltimoSinal = 0;
        }
    }

    return {
        closes,
        emaRapida,
        emaLenta,
        ema200,
        rsiValues,
        atrValues,
        atrMedia,
        sinaisLong,
        sinaisShort
    };
}

// ============================================================================
// BLOCO 4 — RENDERIZAÇÃO DOS GRÁFICOS
// ============================================================================

function renderizarGraficos(resultado) {
    const indices = Array.from({ length: dados.length }, (_, i) => i);

    // Marcadores de sinais: arrays alinhados aos índices, preço no sinal e null no resto
    const markerLong = resultado.closes.map(() => null);
    const markerShort = resultado.closes.map(() => null);
    sinaisLong.forEach(s => { markerLong[s.index] = s.preco; });
    sinaisShort.forEach(s => { markerShort[s.index] = s.preco; });

    // Gráfico de Preço + EMAs
    const ctxPreco = document.getElementById('chartPreco').getContext('2d');
    if (chartPreco) chartPreco.destroy();

    chartPreco = new Chart(ctxPreco, {
        type: 'line',
        data: {
            labels: indices,
            datasets: [
                {
                    label: 'Fechamento',
                    data: resultado.closes,
                    borderColor: '#2c3e50',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y'
                },
                {
                    label: 'EMA Rápida (9)',
                    data: resultado.emaRapida,
                    borderColor: '#3498db',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    tension: 0.2,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    yAxisID: 'y'
                },
                {
                    label: 'EMA Lenta (21)',
                    data: resultado.emaLenta,
                    borderColor: '#f39c12',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    tension: 0.2,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    yAxisID: 'y'
                },
                {
                    label: 'EMA 200 (viés macro)',
                    data: resultado.ema200,
                    borderColor: '#9b59b6',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    tension: 0.2,
                    pointRadius: 0,
                    borderDash: [2, 2],
                    yAxisID: 'y'
                },
                {
                    label: '▲ Sinal LONG',
                    data: markerLong,
                    borderColor: '#27ae60',
                    backgroundColor: '#27ae60',
                    showLine: false,
                    pointStyle: 'triangle',
                    pointRadius: 9,
                    pointHoverRadius: 12,
                    pointRotation: 0,
                    yAxisID: 'y'
                },
                {
                    label: '▼ Sinal SHORT',
                    data: markerShort,
                    borderColor: '#e74c3c',
                    backgroundColor: '#e74c3c',
                    showLine: false,
                    pointStyle: 'triangle',
                    pointRadius: 9,
                    pointHoverRadius: 12,
                    pointRotation: 180,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left'
                },
                x: {
                    display: false
                }
            }
        }
    });

    // Gráfico de RSI
    const ctxRsi = document.getElementById('chartRsi').getContext('2d');
    if (chartRsi) chartRsi.destroy();

    // Plugin que desenha as linhas de referência do RSI (30 e 70)
    const rsiRefLines = {
        id: 'rsiRefLines',
        afterDatasetsDraw(chart) {
            const { ctx, scales: { y } } = chart;
            const yTop = y.getPixelForValue(70);
            const yBottom = y.getPixelForValue(30);

            ctx.save();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            ctx.beginPath();
            ctx.moveTo(chart.chartArea.left, yTop);
            ctx.lineTo(chart.chartArea.right, yTop);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(chart.chartArea.left, yBottom);
            ctx.lineTo(chart.chartArea.right, yBottom);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.restore();
        }
    };

    chartRsi = new Chart(ctxRsi, {
        type: 'line',
        plugins: [rsiRefLines],
        data: {
            labels: indices,
            datasets: [
                {
                    label: 'RSI (14)',
                    data: resultado.rsiValues,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 0,
                    fill: true,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' },
                annotation: {}
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    min: 0,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            if (value === 30 || value === 70) return value;
                            return '';
                        }
                    }
                },
                x: {
                    display: false
                }
            }
        }
    });

    // Gráfico de ATR
    const ctxAtr = document.getElementById('chartAtr').getContext('2d');
    if (chartAtr) chartAtr.destroy();

    chartAtr = new Chart(ctxAtr, {
        type: 'line',
        data: {
            labels: indices,
            datasets: [
                {
                    label: 'ATR (14)',
                    data: resultado.atrValues,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 0,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Média ATR (50)',
                    data: resultado.atrMedia,
                    borderColor: '#16a085',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    tension: 0.2,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left'
                },
                x: {
                    display: false
                }
            }
        }
    });

    // Atualizar status panel
    atualizarStatusPanel(resultado);
}

// ============================================================================
// BLOCO 5 — ATUALIZAR PAINEL DE STATUS
// ============================================================================

function atualizarStatusPanel(resultado) {
    // Contadores
    document.getElementById('countLong').textContent = sinaisLong.length;
    document.getElementById('countShort').textContent = sinaisShort.length;

    // Último sinal
    let lastSignal = '–';
    if (sinaisLong.length > 0) {
        lastSignal = `LONG em ${sinaisLong[sinaisLong.length - 1].index}`;
    } else if (sinaisShort.length > 0) {
        lastSignal = `SHORT em ${sinaisShort[sinaisShort.length - 1].index}`;
    }
    document.getElementById('lastSignal').textContent = lastSignal;

    // Dica quando não há sinais (confluência estrita é rara — isso é esperado)
    const hint = document.getElementById('signalHint');
    if (sinaisLong.length === 0 && sinaisShort.length === 0) {
        const poucasVelas = dados.length < 200 && document.getElementById('useEma200').checked;
        hint.textContent = poucasVelas
            ? '💡 Filtro EMA 200 ativo, mas há menos de 200 velas — gere mais velas ou desligue a EMA 200.'
            : '💡 Nenhum sinal com estes filtros. A confluência estrita é rara por design — afrouxe um filtro (ex.: desligar Estrutura ou Momentum) ou gere novos dados.';
        hint.style.display = 'block';
    } else {
        hint.style.display = 'none';
    }

    // Viés atual
    const lastClose = resultado.closes[resultado.closes.length - 1];
    const lastEmaRapida = resultado.emaRapida[resultado.emaRapida.length - 1];
    const lastEmaLenta = resultado.emaLenta[resultado.emaLenta.length - 1];
    const lastEma200 = resultado.ema200[resultado.ema200.length - 1];

    let bias = 'NEUTRO';
    if (lastEmaRapida !== null && lastEmaLenta !== null && lastEma200 !== null) {
        if (lastEmaRapida > lastEmaLenta && lastClose > lastEma200) {
            bias = '🟢 ALTA';
        } else if (lastEmaRapida < lastEmaLenta && lastClose < lastEma200) {
            bias = '🔴 BAIXA';
        }
    }
    document.getElementById('currentBias').textContent = bias;

    // Status dos filtros
    const filtersStatus = document.getElementById('filtersStatus');
    filtersStatus.innerHTML = '';

    const useTendencia = document.getElementById('useTendencia').checked;
    const useMomentum = document.getElementById('useMomentum').checked;
    const useVolatilidade = document.getElementById('useVolatilidade').checked;
    const useEstrutura = document.getElementById('useEstrutura').checked;

    const filters = [
        { name: 'Tendência (EMA)', enabled: useTendencia },
        { name: 'Macro (EMA200)', enabled: document.getElementById('useEma200').checked },
        { name: 'Momentum (RSI)', enabled: useMomentum },
        { name: 'Volatilidade (ATR)', enabled: useVolatilidade },
        { name: 'Estrutura', enabled: useEstrutura }
    ];

    filters.forEach(f => {
        const filterDiv = document.createElement('div');
        filterDiv.className = 'filter-item';
        filterDiv.innerHTML = `
            <span>${f.name}</span>
            <span class="filter-status-icon ${f.enabled ? 'filter-status-ok' : 'filter-status-disabled'}">
                ${f.enabled ? '✓' : '–'}
            </span>
        `;
        filtersStatus.appendChild(filterDiv);
    });
}

// ============================================================================
// BLOCO 6 — EVENT LISTENERS
// ============================================================================

document.getElementById('btnGerar').addEventListener('click', function() {
    const numCandles = parseInt(document.getElementById('numCandles').value);
    const volatilidade = parseFloat(document.getElementById('volatility').value);

    dados = gerarDadosSim(numCandles, volatilidade);
    const resultado = calcularIndicador(dados);
    renderizarGraficos(resultado);
});

document.getElementById('btnRecalcular').addEventListener('click', function() {
    if (dados.length === 0) {
        alert('Gere dados primeiro clicando em "Gerar Dados"');
        return;
    }
    const resultado = calcularIndicador(dados);
    renderizarGraficos(resultado);
});

// Gerar dados iniciais ao carregar
window.addEventListener('load', function() {
    const numCandles = parseInt(document.getElementById('numCandles').value);
    const volatilidade = parseFloat(document.getElementById('volatility').value);

    dados = gerarDadosSim(numCandles, volatilidade);
    const resultado = calcularIndicador(dados);
    renderizarGraficos(resultado);
});
