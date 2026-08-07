// ============================================================================
// BLOCO 39 — TOUR GUIADO (primeira abertura)
// ============================================================================
// 5 balões destacando o essencial: o semáforo, o gráfico, a troca de par, o
// funil e a gestão de risco. Roda 1× (localStorage 'tourVisto'); pode reabrir
// pelo ❔ Ajuda. Sem libs — spotlight via box-shadow gigante + balão posicionado.

const TOUR_PASSOS = [
    { sel: '#semaforo', titulo: '🚦 Semáforo de decisão', txt: 'A resposta única: ENTRAR / ESPERAR / EVITAR. Ele funde confluência, selo A/B/C, funil, timeframes e o guardião de banca. Só entre no 🟢.' },
    { sel: '#chartQuickbar', titulo: '💱 Par e timeframe', txt: 'Troque a moeda e o tempo do gráfico (M1–H1) aqui. Em ⋯ Ferramentas ficam zonas, LTA/LTB, alertas e exportar.' },
    { sel: '#qualityFunnel', titulo: '🔎 Funil de qualidade', txt: 'Os 6 elos que precisam fechar para o sinal merecer dinheiro. 5–6 verdes = entrada de verdade.' },
    { sel: '#railPaineis', titulo: '📊 Painéis', txt: 'Cada ícone abre uma ferramenta: Scanner, IA, Price Action, Watchlist e a 🛡 Gestão de Risco. Clique no emoji de um título para ele se explicar.' },
    { sel: '.decision-panel', titulo: '⚠️ Lembre-se', txt: 'É ferramenta de ESTUDO. Opções binárias com payout <100% favorecem a casa. Use o guardião de banca e pare quando ele mandar. Bons estudos!' }
];

let _tourI = 0;
function _tourEl() {
    let ov = document.getElementById('tourOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'tourOverlay';
    ov.innerHTML = '<div id="tourSpot"></div><div id="tourBalao"><h4 id="tourTit"></h4><p id="tourTxt"></p>' +
        '<div class="tour-nav"><span id="tourPasso"></span><span><button type="button" id="tourPular" class="btn-ghost">Pular</button> <button type="button" id="tourNext" class="btn-primary" style="width:auto;padding:7px 16px;">Próximo</button></span></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#tourPular').addEventListener('click', tourFechar);
    ov.querySelector('#tourNext').addEventListener('click', () => tourPasso(_tourI + 1));
    return ov;
}

function tourPasso(i) {
    const passos = TOUR_PASSOS.filter(p => document.querySelector(p.sel));
    if (i >= passos.length) { tourFechar(); return; }
    _tourI = i;
    const ov = _tourEl(); ov.style.display = 'block';
    const p = passos[i];
    const alvo = document.querySelector(p.sel);
    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        const r = alvo.getBoundingClientRect();
        const spot = document.getElementById('tourSpot');
        const pad = 6;
        spot.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;`;
        document.getElementById('tourTit').textContent = p.titulo;
        document.getElementById('tourTxt').textContent = p.txt;
        document.getElementById('tourPasso').textContent = (i + 1) + '/' + passos.length;
        document.getElementById('tourNext').textContent = i === passos.length - 1 ? 'Concluir' : 'Próximo';
        // balão acima ou abaixo do alvo conforme o espaço
        const balao = document.getElementById('tourBalao');
        const abaixo = r.bottom + 180 < window.innerHeight;
        balao.style.top = (abaixo ? r.bottom + 14 : Math.max(10, r.top - 172)) + 'px';
        balao.style.left = Math.max(10, Math.min(window.innerWidth - 330, r.left)) + 'px';
    }, 350);
}

function tourFechar() {
    const ov = document.getElementById('tourOverlay');
    if (ov) ov.style.display = 'none';
    localStorage.setItem('tourVisto', '1');
}
function tourIniciar() { _tourI = 0; tourPasso(0); }

document.addEventListener('DOMContentLoaded', function () {
    // botão "rever tour" na ajuda
    const aj = document.getElementById('ajudaFechar');
    // primeira vez: dispara após o app assentar (não em automação/testes)
    if (!localStorage.getItem('tourVisto') && !navigator.webdriver) {
        setTimeout(() => { try { tourIniciar(); } catch (e) { } }, 2600);
    }
    const b = document.getElementById('btnTour');
    if (b) b.addEventListener('click', () => { tourFechar(); localStorage.removeItem('tourVisto'); tourIniciar(); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('tourOverlay') && document.getElementById('tourOverlay').style.display === 'block') tourFechar(); });
