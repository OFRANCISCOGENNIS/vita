// ============================================================================
// BLOCO 24 — RELATÓRIO SEMANAL (HTML autocontido, baixado pelo navegador)
// ============================================================================
// Fotografa a performance REAL do período (registro verificado): placar geral
// com limite inferior de Wilson, quebras por selo/funil/par, curva de
// calibração, acerto por fator e a configuração vigente. É o espelho honesto:
// se o edge não aparece aqui, ele não existe.

function _relPct(x) { return (x * 100).toFixed(0) + '%'; }
function _relLinha(rot, val) { return `<tr><td>${rot}</td><td><b>${val}</b></td></tr>`; }

function gerarRelatorioHTML(dias) {
    dias = dias || 7;
    const agora = Math.floor(Date.now() / 1000);
    const corte = agora - dias * 86400;
    const regs = (typeof registro !== 'undefined' ? registro : []).filter(r => r.t >= corte);
    const res = regs.filter(r => r.resultado === 'WIN' || r.resultado === 'LOSS');
    const wins = res.filter(r => r.resultado === 'WIN').length;
    const wr = res.length ? wins / res.length : null;
    const lb = res.length ? wilsonLB(wins, res.length) : null;
    const payout = Math.max(0.01, (parseFloat(document.getElementById('payout').value) || 87) / 100);
    const beWR = 1 / (1 + payout);

    const grupo = (rotFn) => {
        const g = {};
        res.forEach(r => { const k = rotFn(r); if (k == null) return; g[k] = g[k] || { n: 0, w: 0 }; g[k].n++; if (r.resultado === 'WIN') g[k].w++; });
        return Object.keys(g).map(k => ({ k, n: g[k].n, w: g[k].w, wr: g[k].w / g[k].n })).sort((a, b) => b.n - a.n);
    };
    const porGrade = grupo(r => r.grade || 'sem selo');
    const porFunil = grupo(r => r.funil == null ? null : (r.funil >= 5 ? 'funil ≥5' : 'funil ≤4'));
    const porPar = grupo(r => r.par);
    const curva = typeof curvaCalibracao === 'function' ? curvaCalibracao(regs) : [];
    const pesos = typeof pesosReaisCalc === 'function' ? pesosReaisCalc(regs) : {};

    const fatoresOn = (confLive.fatores || []).filter(f => f.on).map(f => f.nome).join(' · ') || '—';
    const portoes = ['useHtf:TF maior', 'useSessao:Sessões', 'useSR:S/R', 'usePA:Price Action', 'useNewsFilter:Notícias', 'usePesoIA:Pesos IA', 'modoSniper:Sniper']
        .map(s => { const [id, rot] = s.split(':'); const el = document.getElementById(id); return el && el.checked ? rot : null; })
        .filter(Boolean).join(' · ') || 'nenhum';

    const tbl = (titulo, linhas) => linhas.length
        ? `<h2>${titulo}</h2><table>${linhas.map(g => `<tr><td>${g.k}</td><td>${g.w}/${g.n}</td><td><b>${_relPct(g.wr)}</b></td></tr>`).join('')}</table>` : '';

    const veredito = wr == null ? 'Sem operações verificadas no período — nada a provar ainda.'
        : lb >= beWR ? `✅ Edge estatístico PRESENTE no período: mesmo no limite inferior (${_relPct(lb)}), o acerto supera o break-even (${_relPct(beWR)}).`
        : wr >= beWR ? `⚠️ Acerto acima do break-even (${_relPct(wr)} vs ${_relPct(beWR)}), mas a amostra (${res.length} ops) ainda NÃO garante edge no limite inferior (${_relPct(lb)}). Continue registrando.`
        : `❌ SEM edge no período: acerto ${_relPct(wr)} abaixo do break-even ${_relPct(beWR)}. O relatório existe para isto — não opere contra a evidência.`;

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>QUANT OPS — Relatório ${dias} dias</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;background:#0b101a;color:#c9d4e5;max-width:820px;margin:24px auto;padding:0 16px;line-height:1.55}
h1{font-size:22px;background:linear-gradient(100deg,#22D3EE,#8B5CF6,#EC4899);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:15px;margin:22px 0 8px;color:#fff;border-left:4px solid #8B5CF6;padding-left:8px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
td{padding:5px 8px;border-bottom:1px solid rgba(170,181,197,.14)}
td:last-child{text-align:right}
.veredito{background:rgba(139,92,246,.10);border:1px solid rgba(139,92,246,.35);border-radius:10px;padding:12px 14px;font-size:14px}
.nota{font-size:12px;color:#6E7A8C;margin-top:20px;border-top:1px solid rgba(170,181,197,.14);padding-top:10px}
b{color:#fff}
</style></head><body>
<h1>◈ QUANT OPS — Relatório de ${dias} dias</h1>
<p>Período: ${new Date(corte * 1000).toLocaleDateString('pt-BR')} → ${new Date(agora * 1000).toLocaleDateString('pt-BR')} · gerado em ${new Date().toLocaleString('pt-BR')}</p>
<div class="veredito">${veredito}</div>
<h2>Placar geral</h2><table>
${_relLinha('Entradas registradas', regs.length)}
${_relLinha('Verificadas (WIN/LOSS)', res.length)}
${wr != null ? _relLinha('Acerto real', `${_relPct(wr)} (${wins}/${res.length})`) : ''}
${lb != null ? _relLinha('Limite inferior de Wilson (95%)', _relPct(lb)) : ''}
${_relLinha('Break-even do payout ' + Math.round(payout * 100) + '%', _relPct(beWR))}
${wr != null ? _relLinha('Expectativa por operação', ((expectancia(wr, payout) >= 0 ? '+' : '') + expectancia(wr, payout).toFixed(2)) + ' por unidade') : ''}
</table>
${tbl('Por selo de qualidade', porGrade)}
${tbl('Por funil no momento da entrada', porFunil)}
${tbl('Por par', porPar)}
${curva.length ? '<h2>Curva de calibração (previsto × realizado)</h2><table>' + curva.map(c => `<tr><td>previsto ${c.faixa}</td><td>${c.n} ops</td><td><b>real ${_relPct(c.real)}</b></td></tr>`).join('') + '</table>' : ''}
${Object.keys(pesos).length ? '<h2>Acerto real por fator (alinhado à entrada)</h2><table>' + Object.keys(MAPA_FATOR_LETRA).filter(n => pesos[MAPA_FATOR_LETRA[n]]).map(n => { const o = pesos[MAPA_FATOR_LETRA[n]]; return `<tr><td>${n}</td><td>${o.w}/${o.n}</td><td><b>${_relPct(o.wr)}</b></td></tr>`; }).join('') + '</table>' : ''}
<h2>Configuração vigente</h2><table>
${_relLinha('Fatores ligados', fatoresOn)}
${_relLinha('Portões ligados', portoes)}
${_relLinha('Par / TF / expiração', `${symbolAtual()} · M${tfMinutes()} · ${expMinutes()}m`)}
</table>
<p class="nota">⚠️ FERRAMENTA DE ESTUDO — não é recomendação de investimento. Opções binárias/expirações curtas são de altíssimo risco; payout &lt;100% exige acerto sustentado acima do break-even só para empatar. Este relatório mostra a evidência real — decida com ela, não contra ela.</p>
</body></html>`;
}

function baixarRelatorio(dias) {
    try {
        const html = gerarRelatorioHTML(dias || 7);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'quantops-relatorio-' + new Date().toISOString().slice(0, 10) + '.html';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        showToast('📄 Relatório dos últimos ' + (dias || 7) + ' dias baixado', 'ok');
    } catch (e) { showToast('Falha ao gerar relatório: ' + e.message, 'err'); }
}

document.addEventListener('DOMContentLoaded', function () {
    const b = document.getElementById('btnRelatorio');
    if (b) b.addEventListener('click', () => baixarRelatorio(7));
});
