// ============================================================================
// BLOCO 25 — AGENTES DE CONFIGURAÇÃO E VALIDAÇÃO
// ============================================================================
// Dois agentes novos no tick central do bloco 13 (60s, mesmo painel/log):
//   🔧 Configurador — vigia a coerência da configuração (expiração×TF, payout,
//      fatores × regime, parâmetros estudados da IA, pontuação impossível) e
//      oferece o CONSERTO EM 1 CLIQUE direto no log.
//   ✅ Validador — vigia a saúde estatística (par sem estudo da IA, faixa da
//      curva de calibração otimista, funil invertido, fator com acerto real
//      ruim, velas insuficientes) e sugere/agenda a correção.
// Dedupe por chave: cada problema só reaparece no log se sumir e voltar.

const agAcoes = {};
let agAcaoN = 0;
function agBotao(rotulo, fn) {
    const id = 'fx' + (++agAcaoN);
    agAcoes[id] = fn;
    return ` <button class="btn-ghost ag-fix" type="button" data-fix="${id}">${rotulo}</button>`;
}

// dedupe: avisa 1× enquanto o problema persistir; re-avisa se ele voltar
const agVistos = {};
function agAvisar(agente, chave, msg) {
    if (agVistos[chave]) return;
    agVistos[chave] = 1;
    agentesLog(agente, msg);
}
function agResolver(chave) { delete agVistos[chave]; }

const MAPA_LETRA_TOGGLE = {
    T: 'useTendencia', Ma: 'useEma200', Mo: 'useMomentum', V: 'useVolatilidade', E: 'useEstrutura',
    F: 'useFluxo', C: 'useCorrelacao', P: 'usePadrao', X: 'useMacd', B: 'useBollinger'
};

// ---- 🔧 Configurador ----
function agenteConfigurador() {
    const el = id => document.getElementById(id);

    // 1. Configuração inválida (números fora de faixa / incoerentes)
    const probs = typeof configProblemas === 'function' ? configProblemas() : [];
    if (probs.length) agAvisar('🔧 Config', 'cfgInvalida', '⚠ configuração inválida: ' + probs.join(' · ') + ' — corrija nos controles');
    else agResolver('cfgInvalida');

    // 2. Execução incoerente: expiração fora de 1–6× o timeframe
    const razao = expMinutes() / tfMinutes();
    if (razao < 1 || razao > 6) {
        agAvisar('🔧 Config', 'execRatio', `expiração ${expMinutes()}m = ${razao.toFixed(1)}× o TF (ideal 1–6×)` +
            agBotao('ajustar expiração', () => {
                const tf = tfMinutes();
                const boa = [1, 5, 15, 30, 60].find(e => e >= tf && e % tf === 0 && e / tf <= 6);
                if (boa) { el('expiracao').value = boa; recalcularSinaisApenas(); }
                return 'expiração ajustada p/ ' + boa + 'm';
            }));
    } else agResolver('execRatio');

    // 3. Payout inviável (<80%): o break-even sobe demais
    const payout = parseFloat(el('payout').value) || 87;
    if (payout < 80) agAvisar('🔧 Config', 'payoutBaixo', `payout ${payout}% exige ${pctTxt(1 / (1 + payout / 100))} de acerto só p/ empatar — confira o valor real da corretora`);
    else agResolver('payoutBaixo');

    // 4. Fatores × regime: os toggles não casam com o preset do regime atual
    if (dados && dados.length >= 210 && typeof PRESETS_REGIME !== 'undefined') {
        let reg = null; try { reg = regimeUltimo(); } catch (e) { }
        const p = reg && PRESETS_REGIME[reg];
        if (p) {
            const iguais = Object.keys(p.fatores).filter(id => { const x = el(id); return x && x.checked === !!p.fatores[id]; }).length;
            if (iguais < 7) {
                agAvisar('🔧 Config', 'presetRegime', `fatores não casam com o regime ${REGIME_ROTULO[reg] || reg} (${iguais}/10 alinhados)` +
                    agBotao('aplicar preset do regime', () => { aplicarPreset(reg); return 'preset ' + (REGIME_ROTULO[reg] || reg) + ' aplicado'; }));
            } else agResolver('presetRegime');
        }
    }

    // 5. Parâmetros estudados da IA diferentes dos controles atuais
    let reg2 = null; try { reg2 = regimeUltimo(); } catch (e) { }
    const cc = iaCache[symbolAtual() + '|' + (reg2 || '')] || iaCache[symbolAtual()];
    if (cc && cc.ms != null) {
        const difere = String(el('minScore').value) !== String(cc.ms) || String(el('rsiSobrevenda').value) !== String(cc.sv)
            || String(el('rsiSobrecompra').value) !== String(cc.sc) || String(el('estruturaLookback').value) !== String(cc.lk);
        if (difere) {
            agAvisar('🔧 Config', 'iaParams', `a IA estudou parâmetros melhores p/ este par (score≥${cc.ms} · RSI ${cc.sv}/${cc.sc} · exp ${cc.exp}m)` +
                agBotao('aplicar parâmetros da IA', () => {
                    el('minScore').value = cc.ms; el('rsiSobrevenda').value = cc.sv; el('rsiSobrecompra').value = cc.sc;
                    el('estruturaLookback').value = cc.lk; el('cooldownVelas').value = cc.cd; el('expiracao').value = cc.exp;
                    recalcularSinaisApenas();
                    return 'parâmetros da IA aplicados';
                }));
        } else agResolver('iaParams');
    }

    // 6. Pontuação impossível: exige mais fatores do que os ligados
    const en = (confLive && confLive.enabled) || 0;
    const ms = parseInt(el('minScore').value) || 0;
    if (en > 0 && ms > en && el('confMode').value !== 'estrita') {
        agAvisar('🔧 Config', 'minScoreAlto', `pontuação mínima ${ms} > ${en} fatores ligados — nunca haveria entrada` +
            agBotao('ajustar p/ ' + Math.max(2, en - 1), () => { el('minScore').value = Math.max(2, en - 1); recalcularSinaisApenas(); return 'pontuação ajustada'; }));
    } else agResolver('minScoreAlto');
}

// ---- ✅ Validador ----
function agenteValidador() {
    // 1. Par aberto sem estudo da IA (sem cache p/ símbolo nem símbolo|regime)
    const sym = symbolAtual();
    let reg = null; try { reg = regimeUltimo(); } catch (e) { }
    if (dados && dados.length >= 210 && !iaCache[sym] && !iaCache[sym + '|' + (reg || '')]) {
        agAvisar('✅ Validador', 'semIA', `${sym} nunca foi estudado pela IA — sem evidência p/ o selo A` +
            agBotao('estudar agora', () => { if (!agFilaOtim.includes(sym)) agFilaOtim.unshift(sym); return sym + ' na fila de estudo (próximo tick)'; }));
    } else agResolver('semIA');

    // 2. Velas insuficientes p/ estatística (mín. ~210)
    if (dados && dados.length > 0 && dados.length < 210) {
        agAvisar('✅ Validador', 'poucasVelas', `só ${dados.length} velas carregadas — mínimo ~210 p/ IA/backtest` +
            agBotao('carregar 500 velas', () => { document.getElementById('numCandles').value = 500; carregar(); return 'recarregando com 500 velas'; }));
    } else agResolver('poucasVelas');

    // 3. Curva de calibração: alguma faixa com 5+ ops prometendo mais do que entrega
    if (typeof curvaCalibracao === 'function') {
        const ruim = curvaCalibracao(registro).find(c => c.n >= 5 && c.real < c.prev - 0.07);
        if (ruim) {
            if (!agFilaOtim.includes(sym)) agFilaOtim.unshift(sym);
            agAvisar('✅ Validador', 'calibFaixa', `faixa prevista ${ruim.faixa} entregou só ${pctTxt(ruim.real)} (${ruim.n} ops) — reestudo agendado`);
        } else agResolver('calibFaixa');
    }

    // 4. Funil invertido: entradas de funil baixo acertando MAIS que as de funil alto
    const res = registro.filter(r => (r.resultado === 'WIN' || r.resultado === 'LOSS') && r.funil != null);
    const alto = res.filter(r => r.funil >= 5), baixo = res.filter(r => r.funil <= 4);
    if (alto.length >= 5 && baixo.length >= 5) {
        const wr = a => a.filter(r => r.resultado === 'WIN').length / a.length;
        if (wr(baixo) > wr(alto) + 0.10) {
            agAvisar('✅ Validador', 'funilInv', `funil INVERTIDO: ≤4 acerta ${pctTxt(wr(baixo))} vs ≥5 ${pctTxt(wr(alto))} — os portões atuais podem estar filtrando errado; revise HTF/sessão/S-R`);
        } else agResolver('funilInv');
    }

    // 5. Fator com acerto real ruim (10+ amostras, <45%): sugerir desligar
    if (typeof pesosReaisCalc === 'function') {
        const pesos = pesosReaisCalc(registro);
        Object.keys(pesos).forEach(k => {
            const o = pesos[k], idT = MAPA_LETRA_TOGGLE[k], elT = idT && document.getElementById(idT);
            const chave = 'fatorRuim' + k;
            if (o.n >= 10 && o.wr < 0.45 && elT && elT.checked) {
                agAvisar('✅ Validador', chave, `${FATORES_NOMES[k] || k} acerta só ${pctTxt(o.wr)} na vida real (${o.n} ops)` +
                    agBotao('desligar ' + (FATORES_NOMES[k] || k), () => { elT.checked = false; recalcularSinaisApenas(); return (FATORES_NOMES[k] || k) + ' desligado'; }));
            } else agResolver(chave);
        });
    }
}

// ---- Clique nos botões de conserto do log (delegado) ----
document.addEventListener('DOMContentLoaded', function () {
    const log = document.getElementById('agentesLog');
    if (!log) return;
    log.addEventListener('click', e => {
        const b = e.target.closest('.ag-fix');
        if (!b || !agAcoes[b.dataset.fix]) return;
        let resultado;
        try { resultado = agAcoes[b.dataset.fix]() || 'aplicado'; } catch (err) { resultado = 'falhou: ' + err.message; }
        delete agAcoes[b.dataset.fix];
        agentesLog('✔ Conserto', resultado);
    });
});
