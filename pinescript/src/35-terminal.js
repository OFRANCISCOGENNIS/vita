// ============================================================================
// BLOCO 40 — TERMINAL LAYER v3 (skin institucional: ícones SVG + acordeão)
// ============================================================================
// Camada de APRESENTAÇÃO aditiva: troca os emojis estruturais dos títulos por
// ícones SVG limpos (lucide-like), transforma a sidebar em acordeão com busca
// e botão de fechar, e repalheta topbar/nav. Não altera nenhuma lógica.
/* Camada aditiva v3: acordeão+busca no drawer, fechar drawer, limpeza de emojis estruturais + ícones SVG. */
(function(){
  var K='qoUiAcordeaoV2';
  var I={ // ícones lucide-like
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    chart:'<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    shield:'<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/>',
    gauge:'<path d="M12 15l4-6"/><path d="M4 17a9 9 0 1 1 16 0"/>',
    cpu:'<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    bell:'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
    book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/>',
    eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    play:'<polygon points="6 3 20 12 6 21 6 3"/>',
    star:'<polygon points="12 2 15 9 22 9.3 16.6 14 18.4 21 12 17 5.6 21 7.4 14 2 9.3 9 9"/>',
    layers:'<polygon points="12 2 22 8 12 14 2 8 12 2"/><path d="M2 13l10 6 10-6"/>',
    zap:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    news:'<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V7"/><path d="M12 7h6M12 11h6M12 15h6"/>',
    flow:'<path d="M3 6h7a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h5"/><path d="M18 15l3 3-3 3M3 3v6"/>',
    tv:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M17 2l-5 5-5-5"/>',
    grad:'<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    book2:'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    compass:'<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    help:'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    db:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
    radio:'<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
    clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3 1.1-2.2 2.6-3.5 5-4-.4 2 0 3.5 1 5 1.3 1.9 2 3.5 2 5.5a6 6 0 1 1-12 0c0-1.1.3-2.2 1-3 .5 1.2 1 2 1.5 2z"/>',
    trend:'<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    ban:'<circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/>'
  };
  function svg(name){return '<svg class="qo-ico" viewBox="0 0 24 24" aria-hidden="true">'+(I[name]||I.layers)+'</svg>';}
  var MAP=[[/fonte de dados/i,'radio'],[/gráfico & expira/i,'clock'],[/^dados/i,'db'],[/backup/i,'save'],
    [/tendência/i,'trend'],[/momentum/i,'flame'],[/volatilidade/i,'zap'],[/estrutura/i,'layers'],
    [/fatores extras/i,'layers'],[/estratégia/i,'gauge'],[/meus filtros/i,'save'],[/conflu/i,'target'],
    [/treino/i,'grad'],[/moedas/i,'target'],[/alertas de preço/i,'bell'],[/^alertas/i,'bell'],
    [/fluxo de volume/i,'flow'],[/anti-ruído/i,'ban'],[/heatmap/i,'layers'],[/melhores entradas/i,'search'],
    [/ia — melhores/i,'cpu'],[/agentes/i,'eye'],[/piloto/i,'play'],[/watchlist/i,'star'],
    [/gestão de risco/i,'shield'],[/volume profile/i,'chart'],[/book de ofertas/i,'book'],
    [/price action/i,'compass'],[/estudos de mercado/i,'book2'],[/treino de leitura/i,'grad'],
    [/preço \(velas\)|velas/i,'chart'],[/rsi/i,'flame'],[/atr/i,'zap'],[/avisos de entrada/i,'bell'],
    [/métricas/i,'gauge'],[/tradingview/i,'tv'],[/notícias/i,'news'],[/status/i,'gauge'],
    [/registro de entradas/i,'calendar'],[/ajuda/i,'help'],[/análise mestre/i,'grad'],[/controles/i,'settings']];
  var EMO=/[\u{1F000}-\u{1FAFF}\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{2049}\u{203C}\u{2139}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2B50}\u{3030}]/gu;
  function iconFor(txt){for(var i=0;i<MAP.length;i++)if(MAP[i][0].test(txt))return MAP[i][1];return null;}
  function clean(h){
    var tn=null;
    for(var i=0;i<h.childNodes.length;i++){var n=h.childNodes[i];if(n.nodeType===3&&n.textContent.trim()){tn=n;break;}}
    if(!tn)return;
    var raw=tn.textContent, txt=raw.replace(EMO,'').replace(/^\s+/,'');
    if(txt===raw&&h.dataset.qoIco)return;
    tn.textContent=txt;
    if(!h.dataset.qoIco){var ic=iconFor(h.textContent||raw);if(ic){h.insertAdjacentHTML('afterbegin',svg(ic));h.dataset.qoIco='1';}}
  }
  function cleanHeaders(root){
    (root||document).querySelectorAll('.chart-container>h2,.sidebar h3,.ajuda-card h2,.estudo-grid h4').forEach(clean);
  }
  function boot(){
    var sb=document.querySelector('.sidebar'); if(!sb||sb.dataset.qoV3) return; sb.dataset.qoV3='1';
    /* header do drawer: ícone + fechar */
    var h2=sb.querySelector(':scope>h2');
    if(h2){
      clean(h2);
      var x=document.createElement('button'); x.id='qoDrawerFechar'; x.type='button';
      x.setAttribute('aria-label','Fechar controles'); x.textContent='\u2715';
      x.addEventListener('click',function(){var b=document.getElementById('btnControles'); if(b)b.click(); else sb.classList.add('oculta');});
      h2.appendChild(x);
      var busca=document.createElement('input');
      busca.type='search'; busca.id='qoCtrlBusca'; busca.placeholder='Buscar controle\u2026';
      busca.setAttribute('aria-label','Buscar controle');
      h2.parentNode.insertBefore(busca,h2.nextSibling);
      var grupos=[].slice.call(sb.querySelectorAll('.control-group'));
      busca.addEventListener('input',function(){
        var q=busca.value.trim().toLowerCase();
        grupos.forEach(function(g){
          var hit=!q||(g.textContent||'').toLowerCase().indexOf(q)>=0;
          g.classList.toggle('qo-busca-off',!hit);
          if(q&&hit)g.classList.remove('qo-acc-fechado');
        });
      });
      var st={}; try{st=JSON.parse(localStorage.getItem(K)||'{}')||{};}catch(e){st={};}
      grupos.forEach(function(g,i){
        var h3=g.querySelector('h3'); if(!h3)return;
        var id=(h3.textContent||('g'+i)).replace(EMO,'').trim().slice(0,40);
        h3.setAttribute('role','button'); h3.tabIndex=0;
        if(st[id]===0)g.classList.add('qo-acc-fechado');
        h3.setAttribute('aria-expanded',String(!g.classList.contains('qo-acc-fechado')));
        function tg(){
          g.classList.toggle('qo-acc-fechado');
          var ab=!g.classList.contains('qo-acc-fechado');
          h3.setAttribute('aria-expanded',String(ab)); st[id]=ab?1:0;
          try{localStorage.setItem(K,JSON.stringify(st));}catch(e){}
        }
        h3.addEventListener('click',tg);
        h3.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();tg();}});
      });
    }
    cleanHeaders();
    /* topbar: emojis → ícones */
    var tops={btnAnaliseTop:'grad',btnControles:'settings',btnTema:'moon',btnAjuda:'help'};
    Object.keys(tops).forEach(function(id){
      var b=document.getElementById(id); if(!b)return;
      var label=b.textContent.replace(EMO,'').trim();
      b.innerHTML=svg(tops[id])+(label?' '+label:'');
      if(!label)b.setAttribute('aria-label',b.title||id);
    });
    /* nav mobile: emojis → ícones */
    var mn={decisao:'gauge',grafico:'chart',watch:'star',risco:'shield',controles:'settings'};
    document.querySelectorAll('#mobileNav button').forEach(function(b){
      var s=b.querySelector('span'); var ic=mn[b.getAttribute('data-act')];
      if(s&&ic)s.innerHTML=svg(ic);
    });
    var nav=document.getElementById('mobileNav'); if(nav)nav.setAttribute('role','tablist');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(cleanHeaders,2000); setTimeout(cleanHeaders,6000);
})();
