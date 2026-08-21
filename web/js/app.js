'use strict';

// ============================================================
// app.js — UI layer
// ============================================================

let RESULTADO = null;
let currentFileName = '';
let currentWB = null;
let currentWBPrecos = null;

// ── COLORS MAP ────────────────────────────────────────────────

const ALERTA_COLORS = {
    'ODI SEM UC':                '#D97706',
    'ODI SEM COM':               '#1D4ED8',
    'PEP SEM UC':                '#C2410C',
    'MATERIAL NEGATIVO':         '#B91C1C',
    'MATERIAL POSITIVO EM ODD':  '#D97706',
    'POSTE EM PEP .M':           '#1D4ED8',
    'POSTE EM PEP .S':           '#0F766E',
    'LACRE x MEDIDOR':           '#6D28D9',
    'UC SUBVALORIZADO':          '#B91C1C',
    'UC - PRECO NAO ENCONTRADO': '#92400E',
    'UC - COD MATERIAL VAZIO':   '#6B7280',
    'PU ABAIXO MIN':             '#92400E',
    'PU ACIMA MAX':              '#B91C1C',
};

function alertaColor(tipo) { return ALERTA_COLORS[tipo] || '#6B7280'; }

// ── FORMATAÇÃO ────────────────────────────────────────────────

function fmtMoeda(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return 'R$ ' + (v/1e6).toFixed(1) + ' MM';
    if (a >= 1e3) return 'R$ ' + (v/1e3).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.') + ' mil';
    return 'R$ ' + v.toFixed(2).replace('.', ',');
}

function fmtNum(v) { return v.toLocaleString('pt-BR'); }

function chipAprov(ap) {
    const map = { 'APROVADO':'aprovado','REPROVADO':'reprovado','SEM UC':'semuc' };
    const cls = map[ap] || 'semuc';
    return `<span class="chip chip-${cls}">${ap}</span>`;
}

function chipSit(s) {
    const t = s.toUpperCase();
    if (t.includes('NAO ADER') || t.includes('NÃO ADER')) return `<span class="chip chip-naoaderente">${s}</span>`;
    if (t.includes('ADERENTE')) return `<span class="chip chip-aderente">${s}</span>`;
    if (t.includes('NULO')) return `<span class="chip chip-nulo">${s}</span>`;
    return `<span class="chip chip-semrisco">${s}</span>`;
}

function chipStatus(st) {
    const map = {
        'OK':'ok','ANCORA':'ancora','EXCESSO':'excesso','EXCESSO EXAGERADO':'exagerado',
        'INSUFICIENTE':'insuficiente','SEM ANCORA':'semancora','QTD ZERO':'qdtzero',
        'ESTORNO SEM ENTRADA':'estorno','SEM REFERENCIA':'semreferencia'
    };
    return `<span class="chip chip-${map[st]||'semreferencia'}">${st}</span>`;
}

function chipRisco(r) {
    const map = { 'ALTO':'alto','MEDIO':'medio','BAIXO':'baixo','OK':'semrisco' };
    return `<span class="chip chip-${map[r]||'semrisco'}">${r}</span>`;
}

function chipPU(s) {
    const map = { 'DENTRO':'ok','ABAIXO DO MINIMO':'insuficiente','ACIMA DO MAXIMO':'reprovado','SEM REFERENCIA':'semreferencia' };
    return `<span class="chip chip-${map[s]||'semreferencia'}">${s}</span>`;
}

function fmt2js(v) {
    const n = parseFloat(v);
    return isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── TABLE BUILDER ─────────────────────────────────────────────

class DataTable {
    constructor(containerEl, { columns, data, pageSize = 50, defaultSort = null }) {
        this.container   = containerEl;
        this.columns     = columns;
        this.allData     = data;
        this.filtered    = [...data];
        this.pageSize    = pageSize;
        this.page        = 1;
        this.sortCol     = defaultSort ? defaultSort[0] : null;
        this.sortDir     = defaultSort ? defaultSort[1] : 'asc';
        this.globalTerm  = '';
        this.globalCol   = null;
        this.colFilters  = {};   // { key: { type:'text'|'exact', val:string } }
        this.render();
    }

    applyFilters() {
        this.filtered = this.allData.filter(row => {
            // global toolbar search
            if (this.globalTerm) {
                const t = this.globalTerm.toLowerCase();
                if (this.globalCol) {
                    if (!String(row[this.globalCol] || '').toLowerCase().includes(t)) return false;
                } else {
                    if (!this.columns.some(c => String(row[c.key] || '').toLowerCase().includes(t))) return false;
                }
            }
            // per-column filters
            for (const [key, f] of Object.entries(this.colFilters)) {
                if (!f.val) continue;
                const cell = String(row[key] || '');
                if (f.type === 'exact') { if (cell !== f.val) return false; }
                else                    { if (!cell.toLowerCase().includes(f.val.toLowerCase())) return false; }
            }
            return true;
        });
        this.page = 1;
        this.renderBody();
        this.renderPager();
    }

    filter(term, colKey) {
        this.globalTerm = term || '';
        this.globalCol  = colKey || null;
        this.applyFilters();
    }

    filterExact(val, colKey) {
        this.colFilters[colKey] = { type: 'exact', val: val || '' };
        this.applyFilters();
    }

    enableColumnFilters(defs) {
        // defs: array aligned with this.columns
        // each entry: null | { type:'text' } | { type:'select', options:[] }
        this._cfDefs = defs;
        this._renderFilterRow();
    }

    _renderFilterRow() {
        const thead = this.thead.parentElement;
        const old = thead.querySelector('tr.filter-row');
        if (old) old.remove();

        const tr = document.createElement('tr');
        tr.className = 'filter-row';

        this.columns.forEach((col, i) => {
            const def = this._cfDefs && this._cfDefs[i];
            const th = document.createElement('th');
            if (!def) {
                tr.appendChild(th);
                return;
            }
            if (def.type === 'select') {
                const sel = document.createElement('select');
                sel.className = 'col-filter-select';
                sel.innerHTML = '<option value="">Todos</option>' +
                    def.options.map(o => `<option value="${o}">${o}</option>`).join('');
                sel.addEventListener('change', () => {
                    this.colFilters[col.key] = { type: 'exact', val: sel.value };
                    this.applyFilters();
                });
                th.appendChild(sel);
            } else {
                const inp = document.createElement('input');
                inp.className = 'col-filter-input';
                inp.placeholder = '🔍 filtrar';
                inp.addEventListener('input', () => {
                    this.colFilters[col.key] = { type: 'text', val: inp.value };
                    this.applyFilters();
                });
                th.appendChild(inp);
            }
            tr.appendChild(th);
        });

        thead.appendChild(tr);
    }

    sort(key) {
        if (this.sortCol === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        else { this.sortCol = key; this.sortDir = 'asc'; }
        const d = this.sortDir === 'asc' ? 1 : -1;
        this.filtered.sort((a, b) => {
            const va = a[key], vb = b[key];
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * d;
            return String(va || '').localeCompare(String(vb || '')) * d;
        });
        this.renderBody();
        this.renderHeaders();
    }

    getPage() {
        const start = (this.page - 1) * this.pageSize;
        return this.filtered.slice(start, start + this.pageSize);
    }

    exportXLSX() {
        if (!window.XLSX) { alert('SheetJS não disponível'); return; }
        const headers = this.columns.map(c => c.label);
        const rows = this.filtered.map(row =>
            this.columns.map(c => {
                const v = row[c.key];
                if (v === undefined || v === null) return '';
                if (typeof v === 'number') return v;
                return String(v);
            })
        );
        const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = headers.map((h, i) => ({
            wch: Math.min(50, Math.max(h.length + 2, ...rows.slice(0, 200).map(r => String(r[i] || '').length)))
        }));
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Dados');
        window.XLSX.writeFile(wb, 'inventario_export.xlsx');
    }

    render() {
        this.container.innerHTML = `
        <div class="table-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;" class="toolbar-left"></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="table-count"></span>
            <button class="export-btn" onclick="this.closest('.table-wrap').dispatchEvent(new Event('export'))">⬇ CSV</button>
            <button class="export-btn excel-btn" onclick="this.closest('.table-wrap').dispatchEvent(new Event('exportxlsx'))">⬇ Excel</button>
          </div>
        </div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead><tr></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="table-pagination"></div>`;
        this.thead = this.container.querySelector('thead tr');
        this.tbody = this.container.querySelector('tbody');
        this.pager = this.container.querySelector('.table-pagination');
        this.countEl = this.container.querySelector('.table-count');

        this.container.addEventListener('export',      () => this.exportCSV());
        this.container.addEventListener('exportxlsx', () => this.exportXLSX());
        this.renderHeaders();
        this.renderBody();
        this.renderPager();
    }

    renderHeaders() {
        this.thead.innerHTML = this.columns.map(c => {
            let cls = '';
            if (this.sortCol === c.key) cls = this.sortDir;
            return `<th class="${cls}" data-key="${c.key}">${c.label}<span class="sort-icon"></span></th>`;
        }).join('');
        this.thead.querySelectorAll('th').forEach(th => {
            th.addEventListener('click', () => this.sort(th.dataset.key));
        });
    }

    renderBody() {
        const rows = this.getPage();
        if (!rows.length) {
            this.tbody.innerHTML = `<tr><td colspan="${this.columns.length}" style="text-align:center;padding:32px;color:var(--muted)">Nenhum registro encontrado</td></tr>`;
        } else {
            this.tbody.innerHTML = rows.map(row =>
                `<tr>${this.columns.map(c => `<td title="${String(row[c.key]||'')}">${c.render ? c.render(row[c.key], row) : (row[c.key] !== undefined ? String(row[c.key]) : '')}</td>`).join('')}</tr>`
            ).join('');
        }
        this.countEl.textContent = `${this.filtered.length.toLocaleString('pt-BR')} registro(s)`;
    }

    renderPager() {
        const total = Math.ceil(this.filtered.length / this.pageSize);
        if (total <= 1) { this.pager.innerHTML = ''; return; }
        const pages = [];
        for (let i = 1; i <= Math.min(total, 7); i++) pages.push(i);
        this.pager.innerHTML = `
          <button class="page-btn" ${this.page===1?'disabled':''} onclick="this.closest('.table-pagination')._dt.changePage(${this.page-1})">‹ Ant</button>
          ${pages.map(p => `<button class="page-btn ${p===this.page?'active':''}" onclick="this.closest('.table-pagination')._dt.changePage(${p})">${p}</button>`).join('')}
          ${total > 7 ? `<span style="color:var(--muted)">... ${total}</span>` : ''}
          <button class="page-btn" ${this.page===total?'disabled':''} onclick="this.closest('.table-pagination')._dt.changePage(${this.page+1})">Próx ›</button>`;
        this.pager._dt = this;
    }

    changePage(p) {
        const total = Math.ceil(this.filtered.length / this.pageSize);
        this.page = Math.max(1, Math.min(p, total));
        this.renderBody();
        this.renderPager();
    }

    exportCSV() {
        const headers = this.columns.map(c => `"${c.label}"`).join(',');
        const rows = this.filtered.map(row =>
            this.columns.map(c => `"${String(row[c.key] || '').replace(/"/g, '""')}"`).join(',')
        );
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = 'inventario_export.csv'; a.click();
        URL.revokeObjectURL(url);
    }

    addSearch(label, colKey) {
        const toolbar = this.container.querySelector('.toolbar-left');
        const inp = document.createElement('input');
        inp.className = 'search-box';
        inp.placeholder = label || 'Pesquisar...';
        inp.style.width = '200px';
        inp.addEventListener('input', () => this.filter(inp.value, colKey || null));
        toolbar.appendChild(inp);
        return inp;
    }

    addSelect(label, options, colKey) {
        const toolbar = this.container.querySelector('.toolbar-left');
        const sel = document.createElement('select');
        sel.className = 'filter-select';
        sel.innerHTML = `<option value="">— ${label} —</option>` + options.map(o => `<option value="${o}">${o}</option>`).join('');
        sel.addEventListener('change', () => this.filterExact(sel.value, colKey));
        toolbar.appendChild(sel);
        return sel;
    }
}

// ── EXPORTAÇÃO EXCEL COMPLETA ─────────────────────────────────

function exportarExcelCompleto(res) {
    const X = window.XLSX;
    if (!X) { alert('SheetJS não disponível'); return; }

    // Paleta fiel ao INVENTARIO_RS_PROJ_2.xlsx
    const C = {
        navy:    '0A2540',
        teal:    '00B388',
        red:     'C00000',
        amber:   'C05700',
        kpiBg:   'F8F9FA',
        white:   'FFFFFF',
        aprovBg: 'C6EFCE', aprovFg: '006100',
        reprovBg:'FFC7CE', reprovFg:'9C0006',
        warnBg:  'FFEB9C', warnFg:  '9C5700',
        data:    '1E293B',
    };

    const FMT_BRL = 'R$ #,##0.00';
    const FMT_N2  = '#,##0.00';
    const FMT_N0  = '#,##0';

    // Row heights (pt) for the 9-header rows
    const HDR_H = [20, 20, 16, 6, 16, 34, 6, 24, 26];

    const fl  = (rgb) => ({ patternType: 'solid', fgColor: { rgb } });
    const fnt = (nm, sz, bold, rgb) => ({ name: nm, sz, bold, color: { rgb } });
    const SEG = 'Segoe UI';

    function cv(v, s, z) {
        if (v === null || v === undefined) v = '';
        const t = typeof v === 'number' ? 'n' : 's';
        const cell = { t, v };
        if (s) cell.s = s;
        if (z && t === 'n') cell.z = z;
        return cell;
    }

    function sc(ws, r, c, cell) { ws[X.utils.encode_cell({ r, c })] = cell; }

    // KPI positions: pairs at cols 0-1, 3-4, 6-7, 9-10 (gaps at 2,5,8,11)
    const KPI_PAIRS = [[0,1],[3,4],[6,7],[9,10]];
    const KPI_COLORS = [C.navy, C.teal, C.red, C.amber];

    // Fills rows 0-7 of ws with the branded header block
    // kpiDefs: [{label, value, fmt}] up to 4
    // tabs: [{name}], activeIdx: which tab is highlighted teal
    function buildHeader(ws, title, kpiDefs, tabs, activeIdx, numCols) {
        // Rows 0-1: solid navy band
        for (let r = 0; r <= 1; r++)
            for (let c = 0; c < numCols; c++)
                sc(ws, r, c, cv('', { fill: fl(C.navy) }));

        // Row 2: teal title bar
        sc(ws, 2, 0, cv(title, {
            font: fnt(SEG, 11, true, C.white),
            fill: fl(C.teal),
            alignment: { horizontal: 'left', vertical: 'center', indent: 1 }
        }));
        for (let c = 1; c < numCols; c++) sc(ws, 2, c, cv('', { fill: fl(C.teal) }));

        // Row 3: navy gap
        for (let c = 0; c < numCols; c++) sc(ws, 3, c, cv('', { fill: fl(C.navy) }));

        // Row 4: KPI labels; Row 5: KPI values; gaps at cols 2,5,8,11
        for (let c = 0; c < numCols; c++) {
            sc(ws, 4, c, cv('', { fill: fl(C.navy) }));
            sc(ws, 5, c, cv('', { fill: fl(C.kpiBg) }));
        }
        kpiDefs.forEach((kpi, i) => {
            if (i >= 4) return;
            const [c1, c2] = KPI_PAIRS[i];
            if (c1 >= numCols) return;
            const clr = KPI_COLORS[i];
            sc(ws, 4, c1, cv(kpi.label, {
                font: fnt(SEG, 9, true, C.white),
                fill: fl(clr),
                alignment: { horizontal: 'center', vertical: 'center' }
            }));
            if (c2 < numCols) sc(ws, 4, c2, cv('', { fill: fl(clr) }));

            const isNum = typeof kpi.value === 'number';
            sc(ws, 5, c1, cv(isNum ? kpi.value : (kpi.value != null ? String(kpi.value) : '—'), {
                font: fnt(SEG, 18, true, clr),
                fill: fl(C.kpiBg),
                alignment: { horizontal: 'center', vertical: 'center' }
            }, isNum ? kpi.fmt : null));
            if (c2 < numCols) sc(ws, 5, c2, cv('', { fill: fl(C.kpiBg) }));
        });

        // Row 6: navy gap
        for (let c = 0; c < numCols; c++) sc(ws, 6, c, cv('', { fill: fl(C.navy) }));

        // Row 7: section tabs distributed evenly
        const tabW = Math.floor(numCols / tabs.length);
        tabs.forEach((tab, t) => {
            const c1 = t * tabW;
            const c2 = t === tabs.length - 1 ? numCols - 1 : c1 + tabW - 1;
            const active = t === activeIdx;
            sc(ws, 7, c1, cv(tab.name, {
                font: fnt(SEG, 10, active, C.white),
                fill: fl(active ? C.teal : C.navy),
                alignment: { horizontal: 'center', vertical: 'center' }
            }));
            for (let c = c1 + 1; c <= c2 && c < numCols; c++)
                sc(ws, 7, c, cv('', { fill: fl(active ? C.teal : C.navy) }));
        });
    }

    // Fills row 8 (column headers)
    function buildColHeaders(ws, headers) {
        headers.forEach((h, c) => sc(ws, 8, c, cv(h, {
            font: fnt(SEG, 10, true, C.white),
            fill: fl(C.navy),
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
        })));
    }

    // Compute !merges for header block
    function headerMerges(kpiDefs, tabs, numCols) {
        const m = [
            { s:{r:0,c:0}, e:{r:1,c:numCols-1} },   // navy band
            { s:{r:2,c:0}, e:{r:2,c:numCols-1} },   // title
            { s:{r:3,c:0}, e:{r:3,c:numCols-1} },   // gap
            { s:{r:6,c:0}, e:{r:6,c:numCols-1} },   // gap
        ];
        kpiDefs.forEach((_, i) => {
            if (i >= 4) return;
            const [c1, c2] = KPI_PAIRS[i];
            if (c2 < numCols) {
                m.push({ s:{r:4,c:c1}, e:{r:4,c:c2} });
                m.push({ s:{r:5,c:c1}, e:{r:5,c:c2} });
            }
        });
        const tabW = Math.floor(numCols / tabs.length);
        tabs.forEach((_, t) => {
            const c1 = t * tabW;
            const c2 = t === tabs.length - 1 ? numCols - 1 : c1 + tabW - 1;
            if (c2 > c1) m.push({ s:{r:7,c:c1}, e:{r:7,c:c2} });
        });
        return m;
    }

    // Full sheet builder: header (9 rows) + data starting at row 9
    function makeSheet(activeTabIdx, colHdrs, colWidths, dataRows, styleFn) {
        const ws = {};
        const numCols = colHdrs.length;
        const nPep3 = res.resultSAP.nAprov + res.resultSAP.nReprov;
        const kpis = [
            { label: 'VALOR TOTAL',    value: res.resultSAP.sumValor,            fmt: FMT_BRL },
            { label: 'APROVADOS',      value: res.resultSAP.nAprov,              fmt: FMT_N0  },
            { label: 'ALERTAS',        value: res.resultAlertas.alertas.length,  fmt: FMT_N0  },
            { label: 'REPROVADOS',     value: res.resultSAP.nReprov,             fmt: FMT_N0  },
        ];

        buildHeader(ws, TITLE, kpis, TABS, activeTabIdx, numCols);
        buildColHeaders(ws, colHdrs);

        dataRows.forEach((row, ri) => {
            const r = 9 + ri;
            row.forEach((v, c) => {
                const isNum = typeof v === 'number';
                sc(ws, r, c, cv(v !== null ? v : '', {
                    font: fnt(SEG, 9, false, C.data),
                    fill: fl(C.white),
                    alignment: { horizontal: isNum ? 'right' : 'left', vertical: 'center' }
                }));
            });
            if (styleFn) styleFn(ws, r, row);
        });

        const lastR = Math.max(9, 9 + dataRows.length - 1);
        ws['!ref']        = X.utils.encode_range({ s:{r:0,c:0}, e:{r:lastR,c:numCols-1} });
        ws['!cols']       = colWidths.map(w => ({ wch: w }));
        ws['!rows']       = [...HDR_H.map(h => ({ hpt: h })), ...dataRows.map(() => ({ hpt: 15 }))];
        ws['!sheetViews'] = [{ state:'frozen', ySplit:9, topLeftCell:'A10' }];
        ws['!autofilter'] = { ref: X.utils.encode_range({ s:{r:8,c:0}, e:{r:8,c:numCols-1} }) };
        ws['!merges']     = headerMerges(kpis, TABS, numCols);
        return ws;
    }

    // Status cell helpers
    function sAprov(v) {
        const u = String(v||'').toUpperCase();
        if (u === 'APROVADO')  return { fill:fl(C.aprovBg),  font:fnt(SEG,9,true, C.aprovFg),  alignment:{horizontal:'center',vertical:'center'} };
        if (u === 'REPROVADO') return { fill:fl(C.reprovBg), font:fnt(SEG,9,true, C.reprovFg), alignment:{horizontal:'center',vertical:'center'} };
        return null;
    }
    function sSit(v) {
        const u = String(v||'').toUpperCase();
        if (u.includes('NÃO') || u.includes('NAO')) return { fill:fl(C.reprovBg), font:fnt(SEG,9,false,C.reprovFg), alignment:{horizontal:'left',vertical:'center'} };
        if (u.includes('ADER'))                     return { fill:fl(C.aprovBg),  font:fnt(SEG,9,false,C.aprovFg),  alignment:{horizontal:'left',vertical:'center'} };
        return null;
    }
    function sRisco(v) {
        const u = String(v||'').toUpperCase();
        if (u === 'ALTO')              return { fill:fl(C.reprovBg), font:fnt(SEG,9,true, C.reprovFg), alignment:{horizontal:'center',vertical:'center'} };
        if (u === 'MEDIO'||u==='MÉDIO') return { fill:fl(C.warnBg),  font:fnt(SEG,9,false,C.warnFg),  alignment:{horizontal:'center',vertical:'center'} };
        if (u === 'BAIXO')             return { fill:fl(C.aprovBg),  font:fnt(SEG,9,false,C.aprovFg),  alignment:{horizontal:'center',vertical:'center'} };
        return null;
    }
    function sCom(v) {
        const u = String(v||'').toUpperCase();
        if (u === 'OK')                               return { fill:fl(C.aprovBg), font:fnt(SEG,9,false,C.aprovFg), alignment:{horizontal:'center',vertical:'center'} };
        if (u.includes('EXCESSO')||u==='INSUFICIENTE'||u.includes('SEM')||u==='ESTORNO SEM ENTRADA') return { fill:fl(C.warnBg), font:fnt(SEG,9,false,C.warnFg), alignment:{horizontal:'center',vertical:'center'} };
        return null;
    }
    function sPU(v) {
        const u = String(v||'').toUpperCase();
        if (u === 'DENTRO')           return { fill:fl(C.aprovBg),  font:fnt(SEG,9,false,C.aprovFg),  alignment:{horizontal:'center',vertical:'center'} };
        if (u === 'ABAIXO DO MINIMO') return { fill:fl(C.warnBg),   font:fnt(SEG,9,false,C.warnFg),   alignment:{horizontal:'center',vertical:'center'} };
        if (u === 'ACIMA DO MAXIMO')  return { fill:fl(C.reprovBg), font:fnt(SEG,9,true, C.reprovFg), alignment:{horizontal:'center',vertical:'center'} };
        return null;
    }

    // ── Setup ──────────────────────────────────────────────────────────────
    const wb    = X.utils.book_new();
    const pu    = res.resultPU || { nDiverg:0, sobreprecoTotal:0, linhas:[] };
    const hoje  = new Date().toLocaleDateString('pt-BR');
    const hojeF = hoje.replace(/\//g,'-');
    const TITLE = `INVENTÁRIO INTELIGENTE 15kV  |  Atualização: ${hoje}`;
    const TABS  = [
        { name:'RESUMO' }, { name:'SAP × PRJ' }, { name:'RACIONALIZAÇÃO' },
        { name:'ALERTAS' }, { name:'RISCO' },
        ...(res.temPrecos ? [{ name:'PREÇO UNIT.' }] : []),
    ];

    // ── ABA 1: RESUMO ──────────────────────────────────────────────────────
    {
        const numCols = 8;
        const ws = {};
        const nPep3 = res.resultSAP.nAprov + res.resultSAP.nReprov;
        const kpis = [
            { label:'VALOR TOTAL',   value:res.resultSAP.sumValor,           fmt:FMT_BRL },
            { label:'APROVADOS',     value:res.resultSAP.nAprov,             fmt:FMT_N0  },
            { label:'ALERTAS',       value:res.resultAlertas.alertas.length, fmt:FMT_N0  },
            { label:'REPROVADOS',    value:res.resultSAP.nReprov,            fmt:FMT_N0  },
        ];
        buildHeader(ws, TITLE, kpis, TABS, 0, numCols);

        // Row 8: table column headers
        ['INDICADOR','','VALOR','','INDICADOR','','VALOR',''].forEach((h,c) =>
            sc(ws, 8, c, cv(h, {
                font: fnt(SEG,10,true,C.white), fill:fl(C.navy),
                alignment:{ horizontal:'center', vertical:'center' }
            }))
        );

        // KPI comparison rows (9-12)
        const rows = [
            ['Valor Total da Obra',    res.resultSAP.sumValor,       FMT_BRL,  'Alertas Críticos',        res.resultAlertas.alertas.length, FMT_N0],
            ['PEPs Analisados',        nPep3,                         FMT_N0,   'Divergências de Preço',   res.temPrecos ? pu.nDiverg : null, FMT_N0],
            ['PEPs Aprovados',         res.resultSAP.nAprov,          FMT_N0,   'Sobrepreço Potencial',    res.temPrecos ? pu.sobreprecoTotal : null, FMT_BRL],
            ['PEPs Reprovados',        res.resultSAP.nReprov,         FMT_N0,   'Valor em Risco',          res.resultSAP.sumNaoAder, FMT_BRL],
        ];
        rows.forEach(([l1,v1,z1,l2,v2,z2], ri) => {
            const r = 9 + ri;
            const sL = { font:fnt(SEG,9,true,C.data),  fill:fl(C.white), alignment:{horizontal:'left',vertical:'center'} };
            const sV = (clr) => ({ font:fnt(SEG,9,true,clr), fill:fl(C.white), alignment:{horizontal:'right',vertical:'center'} });
            const sG = { fill:fl(C.white) };
            sc(ws,r,0, cv(l1, sL)); sc(ws,r,1, cv('',sG));
            sc(ws,r,2, cv(v1!==null?v1:'—', sV(KPI_COLORS[0]), v1!==null?z1:null));
            sc(ws,r,3, cv('',sG));
            sc(ws,r,4, cv(l2, sL)); sc(ws,r,5, cv('',sG));
            sc(ws,r,6, cv(v2!==null?v2:'—', sV(KPI_COLORS[3]), v2!==null?z2:null));
            sc(ws,r,7, cv('',sG));
        });

        // Alert breakdown sub-table
        const tiposCont = {};
        for (const al of res.resultAlertas.alertas) tiposCont[al.tipo] = (tiposCont[al.tipo]||0)+1;
        const tipos = Object.entries(tiposCont).sort((a,b) => b[1]-a[1]);
        const alStart = 9 + rows.length + 1;

        // gap row
        for (let c=0;c<numCols;c++) sc(ws, alStart-1, c, cv('', {fill:fl(C.white)}));

        // sub-header
        ['TIPO DE ALERTA','','OCORRÊNCIAS','% DO TOTAL','','','',''].forEach((h,c) =>
            sc(ws, alStart, c, cv(h, {
                font:fnt(SEG,10,true,C.white), fill:fl(C.amber),
                alignment:{horizontal:'center',vertical:'center'}
            }))
        );

        const totAl = res.resultAlertas.alertas.length || 1;
        tipos.forEach(([tipo,cnt], ri) => {
            const r = alStart+1+ri;
            sc(ws,r,0, cv(tipo, {font:fnt(SEG,9,false,C.data), fill:fl(C.white), alignment:{horizontal:'left',vertical:'center'}}));
            sc(ws,r,1, cv('', {fill:fl(C.white)}));
            sc(ws,r,2, cv(cnt, {font:fnt(SEG,9,false,C.data), fill:fl(C.white), alignment:{horizontal:'right',vertical:'center'}}));
            sc(ws,r,3, cv(cnt/totAl, {font:fnt(SEG,9,false,C.data), fill:fl(C.white), alignment:{horizontal:'right',vertical:'center'}}, '0.0%'));
            for(let c=4;c<numCols;c++) sc(ws,r,c,cv('',{fill:fl(C.white)}));
        });

        const lastR = alStart + tipos.length;
        ws['!ref']        = X.utils.encode_range({s:{r:0,c:0},e:{r:lastR,c:numCols-1}});
        ws['!cols']       = [30,3,16,3,30,3,16,3].map(w=>({wch:w}));
        ws['!rows']       = [...HDR_H.map(h=>({hpt:h})), ...Array(lastR-8).fill({hpt:15})];
        ws['!sheetViews'] = [{state:'frozen',ySplit:9,topLeftCell:'A10'}];
        ws['!autofilter'] = {ref:X.utils.encode_range({s:{r:8,c:0},e:{r:8,c:numCols-1}})};
        ws['!merges']     = [
            ...headerMerges(kpis, TABS, numCols),
            {s:{r:8,c:0},e:{r:8,c:1}}, {s:{r:8,c:4},e:{r:8,c:5}},
            {s:{r:alStart,c:0},e:{r:alStart,c:numCols-1}},
        ];
        X.utils.book_append_sheet(wb, ws, 'Resumo');
    }

    // ── ABA 2: ANÁLISE SAP × PRJ ───────────────────────────────────────────
    {
        const ws = makeSheet(
            1,
            ['PEP3','PEP4','Cód Material','Família','Tipo','Descrição','SAP','PRJ','Valor R$','Situação','Aprovação','Motivo'],
            [28,28,14,14,8,40,8,8,14,20,12,36],
            res.resultSAP.linhas.map(r => [
                r.pep3, r.pep4, r.cod, r.familia, r.tipo, r.desc,
                r.libSAP!==''&&r.libSAP!=null ? toNum(r.libSAP) : null,
                r.prjCAD!==''&&r.prjCAD!=null ? toNum(r.prjCAD) : null,
                r.valor ? toNum(r.valor) : null,
                r.sitText, r.aprovacao, r.motivo
            ]),
            (ws, r, row) => {
                const a8=X.utils.encode_cell({r,c:8}); if(ws[a8]?.t==='n') ws[a8].z=FMT_BRL;
                [6,7].forEach(c=>{const a=X.utils.encode_cell({r,c});if(ws[a]?.t==='n') ws[a].z=FMT_N2;});
                const s9=sSit(row[9]);  if(s9) ws[X.utils.encode_cell({r,c:9})].s=s9;
                const s10=sAprov(row[10]); if(s10) ws[X.utils.encode_cell({r,c:10})].s=s10;
            }
        );
        X.utils.book_append_sheet(wb, ws, 'Análise SAP×PRJ');
    }

    // ── ABA 3: RACIONALIZAÇÃO COM ──────────────────────────────────────────
    {
        const ws = makeSheet(
            2,
            ['PEP4','PEP3','Cód','Descrição','Família','NT.006','Ligado a','Qtd Veio','Previsto','Status','Observação'],
            [28,28,12,40,14,12,28,10,12,18,36],
            res.resultCOM.linhas.map(r => [
                r.pep4, r.pep3, r.cod, r.desc, r.familia, r.nt006, r.ligadoA,
                typeof r.qtd==='number' ? r.qtd : null,
                r.previsto, r.status, r.obs
            ]),
            (ws, r, row) => {
                const a7=X.utils.encode_cell({r,c:7}); if(ws[a7]?.t==='n') ws[a7].z=FMT_N2;
                const s=sCom(row[9]); if(s) ws[X.utils.encode_cell({r,c:9})].s=s;
            }
        );
        X.utils.book_append_sheet(wb, ws, 'Racionalização COM');
    }

    // ── ABA 4: ALERTAS CRÍTICOS ────────────────────────────────────────────
    {
        const ws = makeSheet(
            3,
            ['Tipo de Alerta','PEP3','PEP4','Cód Material','Descrição','Família','Valor R$','Qtd','Motivo'],
            [24,28,28,14,40,14,14,8,44],
            res.resultAlertas.alertas.map(a => [
                a.tipo, a.pep3, a.pep4, a.cod, a.desc, a.familia,
                a.valor ? toNum(a.valor) : null,
                a.qtd!==undefined&&a.qtd!=='' ? a.qtd : null,
                a.motivo
            ]),
            (ws, r, row) => {
                const a0=X.utils.encode_cell({r,c:0});
                if(ws[a0]) ws[a0].s={ font:fnt(SEG,9,true,C.amber), fill:fl('FFF8E1'), alignment:{horizontal:'left',vertical:'center'} };
                const a6=X.utils.encode_cell({r,c:6}); if(ws[a6]?.t==='n') ws[a6].z=FMT_BRL;
            }
        );
        X.utils.book_append_sheet(wb, ws, 'Alertas Críticos');
    }

    // ── ABA 5: RANKING DE RISCO ────────────────────────────────────────────
    {
        const ws = makeSheet(
            4,
            ['#','PEP3','Valor Obra R$','Situação','Alertas','Diverg. Preço','Sobrepreço R$','COM Fora','Score','Risco','Diagnóstico'],
            [5,28,14,12,8,13,14,10,8,10,52],
            res.resultRanking.obras.map((o,i) => [
                i+1, o.pep3,
                typeof o.valor==='number'?o.valor:null,
                o.situacao, o.alertas, o.divergPU,
                typeof o.sobrepreco==='number'?o.sobrepreco:null,
                o.comFora, o.score, o.risco, o.diagnostico
            ]),
            (ws, r, row) => {
                const a2=X.utils.encode_cell({r,c:2}); if(ws[a2]?.t==='n') ws[a2].z=FMT_BRL;
                const a6=X.utils.encode_cell({r,c:6}); if(ws[a6]?.t==='n') ws[a6].z=FMT_BRL;
                const s3=sAprov(row[3]);  if(s3)  ws[X.utils.encode_cell({r,c:3})].s=s3;
                const s9=sRisco(row[9]);  if(s9)  ws[X.utils.encode_cell({r,c:9})].s=s9;
            }
        );
        X.utils.book_append_sheet(wb, ws, 'Ranking de Risco');
    }

    // ── ABA 6: PREÇO UNITÁRIO (se disponível) ──────────────────────────────
    if (res.temPrecos && pu.linhas.length) {
        const ws = makeSheet(
            5,
            ['PEP3','PEP4','OD','Cód','Descrição','Und','Qtd','Valor R$','PU','Min PU','Max PU','Status','Observação'],
            [28,28,8,12,40,6,10,14,12,10,10,18,36],
            pu.linhas.map(l => [
                l.pep3, l.pep4, l.tipoOD, l.cod, l.desc, l.und,
                typeof l.qtd==='number'?l.qtd:null,
                typeof l.valor==='number'?l.valor:null,
                typeof l.pu==='number'?l.pu:null,
                l.min!==''&&l.min!=null?Number(l.min):null,
                l.max!==''&&l.max!=null?Number(l.max):null,
                l.status, l.obs
            ]),
            (ws, r, row) => {
                const a7=X.utils.encode_cell({r,c:7}); if(ws[a7]?.t==='n') ws[a7].z=FMT_BRL;
                [8,9,10].forEach(c=>{const a=X.utils.encode_cell({r,c});if(ws[a]?.t==='n') ws[a].z=FMT_N2;});
                const s=sPU(row[11]); if(s) ws[X.utils.encode_cell({r,c:11})].s=s;
            }
        );
        X.utils.book_append_sheet(wb, ws, 'Preço Unitário');
    }

    X.writeFile(wb, `Inventario_15kV_${hojeF}.xlsx`, { cellStyles:true, bookType:'xlsx' });
}

// ── PAINEL DO GESTOR ──────────────────────────────────────────

function renderPainel(res) {
    const { resultSAP, resultAlertas, resultRanking } = res;
    const nPep3 = resultSAP.nAprov + resultSAP.nReprov;
    const pctAprov = nPep3 > 0 ? Math.round(resultSAP.nAprov / nPep3 * 100) : 0;
    const nAlertas = resultAlertas.alertas.length;
    const pu = res.resultPU || { nDiverg: 0, sobreprecoTotal: 0, linhas: [] };

    // contagem por tipo de alerta
    const tiposCont = {};
    for (const al of resultAlertas.alertas) tiposCont[al.tipo] = (tiposCont[al.tipo] || 0) + 1;
    const tiposOrdenados = Object.entries(tiposCont).sort((a, b) => b[1] - a[1]);
    const maxTipo = tiposOrdenados[0]?.[1] || 1;

    document.getElementById('painel-content').innerHTML = `
    <div class="painel-actions">
      <button class="btn-excel-full" onclick="exportarExcelCompleto(RESULTADO)">
        ⬇ Exportar Relatório Excel Completo
      </button>
    </div>
    <div class="cards-row cards-4">
      <div class="kpi-card">
        <div class="kpi-label">Valor Total da Obra</div>
        <div class="kpi-value azul">${fmtMoeda(resultSAP.sumValor)}</div>
        <div class="kpi-sub">soma dos itens analisados</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">PEPs Analisados</div>
        <div class="kpi-value">${fmtNum(nPep3)}</div>
        <div class="kpi-sub">PEP3 com UC ou COM crítico</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">PEPs Aprovados</div>
        <div class="kpi-value green">${fmtNum(resultSAP.nAprov)} <small style="font-size:16px">(${pctAprov}%)</small></div>
        <div class="kpi-sub">todos os itens aderentes</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">PEPs Reprovados</div>
        <div class="kpi-value red">${fmtNum(resultSAP.nReprov)}</div>
        <div class="kpi-sub">ao menos 1 item não aderente</div>
      </div>
    </div>
    <div class="cards-row cards-4">
      <div class="kpi-card">
        <div class="kpi-label">Alertas Críticos</div>
        <div class="kpi-value amber">${fmtNum(nAlertas)}</div>
        <div class="kpi-sub">apontamentos encontrados</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Divergências de Preço</div>
        <div class="kpi-value ${res.temPrecos ? 'amber' : ''}">${res.temPrecos ? fmtNum(pu.nDiverg) : '—'}</div>
        <div class="kpi-sub">${res.temPrecos ? 'PU fora da faixa min/max' : 'sem base de preços'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Sobrepreço Potencial</div>
        <div class="kpi-value ${res.temPrecos ? 'red' : ''}">${res.temPrecos ? fmtMoeda(pu.sobreprecoTotal) : '—'}</div>
        <div class="kpi-sub">${res.temPrecos ? '(PU − max) × qtd' : 'carregue a base de preços'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Valor em Risco</div>
        <div class="kpi-value red">${fmtMoeda(resultSAP.sumNaoAder)}</div>
        <div class="kpi-sub">itens não aderentes</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Aprovação dos PEP3</h3>
        <div class="chart-container"><canvas id="chart-aprov"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Distribuição de Risco das Obras</h3>
        <div class="chart-container"><canvas id="chart-risco"></canvas></div>
      </div>
    </div>

    <div class="section-title" style="margin-top:8px">Alertas Críticos por Tipo</div>
    <div class="table-wrap" style="padding:16px 20px">
      ${nAlertas === 0
        ? '<div class="empty-state"><div class="icon">✅</div><p>Nenhum alerta crítico encontrado. Parabéns!</p></div>'
        : tiposOrdenados.map(([tipo, cnt]) => `
          <div class="alert-type-bar">
            <div class="alert-type-name"><span class="chip-alerta" style="background:${alertaColor(tipo)}">${tipo}</span></div>
            <div class="alert-type-bar-fill" style="max-width:${Math.round(cnt/maxTipo*100)}%;background:${alertaColor(tipo)}"></div>
            <div class="alert-type-count">${cnt}</div>
            <div class="alert-type-pct">${Math.round(cnt/nAlertas*100)}%</div>
          </div>`).join('')
      }
    </div>`;

    // charts
    const aprov = new Chart(document.getElementById('chart-aprov'), {
        type: 'doughnut',
        data: {
            labels: ['Aprovados', 'Reprovados', 'Sem UC'],
            datasets: [{ data: [resultSAP.nAprov, resultSAP.nReprov, nPep3 === 0 ? 0 : 0],
                backgroundColor: ['#16A34A','#DC2626','#9CA3AF'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
    });

    const riskoCounts = { ALTO: 0, MEDIO: 0, BAIXO: 0, OK: 0 };
    for (const o of resultRanking.obras) riskoCounts[o.risco]++;
    new Chart(document.getElementById('chart-risco'), {
        type: 'bar',
        data: {
            labels: ['ALTO', 'MÉDIO', 'BAIXO', 'OK'],
            datasets: [{ data: [riskoCounts.ALTO, riskoCounts.MEDIO, riskoCounts.BAIXO, riskoCounts.OK],
                backgroundColor: ['#DC2626','#D97706','#1D4ED8','#16A34A'], borderRadius: 6, borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { font: { size: 11 } } }, x: { ticks: { font: { size: 11 } } } } }
    });
}

// ── ANÁLISE SAP × PRJ ─────────────────────────────────────────

function renderAnalise(res) {
    const el = document.getElementById('analise-content');
    el.innerHTML = '<div class="table-wrap" id="tbl-analise"></div>';

    const linhas = res.resultSAP.linhas;

    // compute option lists before building DataTable
    const uniq = (key) => [...new Set(linhas.map(r => r[key]).filter(Boolean))].sort();
    const famOpts   = uniq('familia');
    const tipoOpts  = uniq('tipo');
    const sitOpts   = uniq('sitText');
    const aprovOpts = uniq('aprovacao');

    const cols = [
        { key:'pep3',     label:'PEP3' },
        { key:'pep4',     label:'PEP4' },
        { key:'cod',      label:'Cód Material', render: v => `<span class="mono">${v||''}</span>` },
        { key:'familia',  label:'Família' },
        { key:'tipo',     label:'Tipo' },
        { key:'desc',     label:'Descrição' },
        { key:'libSAP',   label:'SAP',      render: v => `<span class="text-right">${v !== '' && v !== undefined ? toNum(v).toFixed(2).replace(/\.?0+$/,'') : ''}</span>` },
        { key:'prjCAD',   label:'PRJ',      render: v => `<span class="text-right">${v !== '' && v !== undefined ? toNum(v).toFixed(2).replace(/\.?0+$/,'') : ''}</span>` },
        { key:'valor',    label:'Valor R$', render: v => v ? fmtMoeda(toNum(v)) : '' },
        { key:'sitText',  label:'Situação', render: v => chipSit(v||'') },
        { key:'aprovacao',label:'Aprovação',render: v => chipAprov(v||'') },
        { key:'motivo',   label:'Motivo' },
    ];

    const dt = new DataTable(document.getElementById('tbl-analise'), {
        columns: cols, data: linhas, pageSize: 100
    });

    // toolbar: global search only (column filters handle the rest)
    dt.addSearch('Busca global...', null);

    // per-column filter row
    dt.enableColumnFilters([
        { type: 'text' },                          // pep3
        { type: 'text' },                          // pep4
        { type: 'text' },                          // cod
        { type: 'select', options: famOpts },      // familia
        { type: 'select', options: tipoOpts },     // tipo
        { type: 'text' },                          // desc
        null,                                      // libSAP (numérico)
        null,                                      // prjCAD (numérico)
        null,                                      // valor  (numérico)
        { type: 'select', options: sitOpts },      // sitText
        { type: 'select', options: aprovOpts },    // aprovacao
        { type: 'text' },                          // motivo
    ]);
}

// ── RACIONALIZAÇÃO COM ────────────────────────────────────────

function renderCOM(res) {
    const el = document.getElementById('com-content');
    el.innerHTML = '<div class="table-wrap" id="tbl-com"></div>';

    const cols = [
        { key:'pep4',    label:'PEP4' },
        { key:'pep3',    label:'PEP3' },
        { key:'cod',     label:'Cód', render: v => `<span class="mono">${v||''}</span>` },
        { key:'desc',    label:'Descrição' },
        { key:'familia', label:'Família' },
        { key:'nt006',   label:'NT.006' },
        { key:'ligadoA', label:'Ligado a (âncora)' },
        { key:'qtd',     label:'Veio', render: v => typeof v === 'number' ? v.toLocaleString('pt-BR', {minimumFractionDigits:0,maximumFractionDigits:2}) : v },
        { key:'previsto',label:'Previsto' },
        { key:'status',  label:'Status', render: v => chipStatus(v||'SEM REFERENCIA') },
        { key:'obs',     label:'Observação' },
    ];

    const dt = new DataTable(document.getElementById('tbl-com'), {
        columns: cols, data: res.resultCOM.linhas, pageSize: 100
    });
    dt.addSearch('Pesquisar...', null);

    const stOpts = [...new Set(res.resultCOM.linhas.map(r => r.status).filter(Boolean))].sort();
    dt.addSelect('Status', stOpts, 'status');

    const famOpts = [...new Set(res.resultCOM.linhas.map(r => r.familia).filter(Boolean))].sort();
    dt.addSelect('Família', famOpts, 'familia');
}

// ── PREÇO UNITÁRIO ────────────────────────────────────────────

function renderPreco(res) {
    const el = document.getElementById('preco-content');

    if (!res.temPrecos) {
        el.innerHTML = `
          <div class="table-wrap" style="padding:32px 20px">
            <div class="empty-state">
              <div class="icon">💰</div>
              <p>Nenhuma base de preços carregada.</p>
              <p style="font-size:12px;color:var(--muted);max-width:540px;margin:8px auto 16px">
                Carregue o arquivo <b>BASE DE PREÇOS.xlsx</b> (colunas <b>MATERIAL</b>, <b>MIN PU</b>, <b>MAX PU</b>)
                para habilitar a análise de preço unitário, os alertas de subvalorização e o peso de preço no ranking de risco.
              </p>
              <button class="btn-upload" onclick="document.getElementById('preco-file-input').click()">Carregar base de preços</button>
              <input type="file" id="preco-file-input" accept=".xlsx,.xlsm,.xls" style="display:none">
              <div class="upload-error" id="preco-error" style="margin-top:12px"></div>
            </div>
          </div>`;
        document.getElementById('preco-file-input').addEventListener('change', e => processPrecoFile(e.target.files[0]));
        return;
    }

    const pu = res.resultPU;
    const nDentro = pu.linhas.filter(l => l.status === 'DENTRO').length;

    el.innerHTML = `
      <div class="cards-row cards-4">
        <div class="kpi-card"><div class="kpi-label">Itens com PU</div><div class="kpi-value">${fmtNum(pu.linhas.length)}</div><div class="kpi-sub">com código, qtd e valor</div></div>
        <div class="kpi-card"><div class="kpi-label">Dentro da Faixa</div><div class="kpi-value green">${fmtNum(nDentro)}</div><div class="kpi-sub">PU entre min e max</div></div>
        <div class="kpi-card"><div class="kpi-label">Divergências</div><div class="kpi-value amber">${fmtNum(pu.nDiverg)}</div><div class="kpi-sub">abaixo do min ou acima do max</div></div>
        <div class="kpi-card"><div class="kpi-label">Sobrepreço Potencial</div><div class="kpi-value red">${fmtMoeda(pu.sobreprecoTotal)}</div><div class="kpi-sub">(PU − max) × qtd</div></div>
      </div>
      <div style="text-align:right;margin-bottom:8px">
        <button class="btn-reset" onclick="document.getElementById('preco-file-input2').click()">↻ Trocar base de preços</button>
        <input type="file" id="preco-file-input2" accept=".xlsx,.xlsm,.xls" style="display:none">
      </div>
      <div class="table-wrap" id="tbl-preco"></div>`;

    document.getElementById('preco-file-input2').addEventListener('change', e => processPrecoFile(e.target.files[0]));

    const cols = [
        { key:'pep3',   label:'PEP3' },
        { key:'pep4',   label:'PEP4' },
        { key:'tipoOD', label:'OD' },
        { key:'cod',    label:'Cód', render: v => `<span class="mono">${v||''}</span>` },
        { key:'desc',   label:'Descrição' },
        { key:'und',    label:'Und' },
        { key:'qtd',    label:'Qtd', render: v => fmt2js(v) },
        { key:'valor',  label:'Valor R$', render: v => fmtMoeda(v) },
        { key:'pu',     label:'PU', render: v => fmt2js(v) },
        { key:'min',    label:'Min PU', render: v => v === '' ? '' : fmt2js(v) },
        { key:'max',    label:'Max PU', render: v => v === '' ? '' : fmt2js(v) },
        { key:'status', label:'Status', render: v => chipPU(v||'') },
        { key:'obs',    label:'Observação' },
    ];

    const dt = new DataTable(document.getElementById('tbl-preco'), { columns: cols, data: pu.linhas, pageSize: 100 });
    dt.addSearch('Pesquisar...', null);
    const stOpts = [...new Set(pu.linhas.map(r => r.status).filter(Boolean))];
    dt.addSelect('Status', stOpts, 'status');
    const odOpts = [...new Set(pu.linhas.map(r => r.tipoOD).filter(Boolean))].sort();
    dt.addSelect('OD', odOpts, 'tipoOD');
}

// ── ALERTAS CRÍTICOS ──────────────────────────────────────────

function renderAlertas(res) {
    const el = document.getElementById('alertas-content');
    el.innerHTML = '<div class="table-wrap" id="tbl-alertas"></div>';

    const cols = [
        { key:'tipo', label:'Tipo de Alerta',
          render: v => `<span class="chip-alerta" style="background:${alertaColor(v)}">${v||''}</span>` },
        { key:'pep3', label:'PEP3' },
        { key:'pep4', label:'PEP4' },
        { key:'cod',  label:'Cód', render: v => `<span class="mono">${v||''}</span>` },
        { key:'desc', label:'Descrição' },
        { key:'familia', label:'Família' },
        { key:'valor', label:'Valor R$', render: v => v ? fmtMoeda(toNum(v)) : '' },
        { key:'qtd',  label:'Qtd', render: v => v !== undefined && v !== '' ? String(v) : '' },
        { key:'motivo', label:'Motivo' },
    ];

    const dt = new DataTable(document.getElementById('tbl-alertas'), {
        columns: cols, data: res.resultAlertas.alertas, pageSize: 100
    });
    dt.addSearch('Pesquisar...', null);

    const tipoOpts = [...new Set(res.resultAlertas.alertas.map(r => r.tipo).filter(Boolean))].sort();
    dt.addSelect('Tipo', tipoOpts, 'tipo');
}

// ── RANKING DE RISCO ──────────────────────────────────────────

function renderRanking(res) {
    const el = document.getElementById('ranking-content');
    el.innerHTML = '<div class="table-wrap" id="tbl-ranking"></div>';

    const dados = res.resultRanking.obras.map((o, i) => ({ rank: i+1, ...o }));

    const cols = [
        { key:'rank',        label:'#', render: v => `<b>${v}</b>` },
        { key:'pep3',        label:'PEP3' },
        { key:'valor',       label:'Valor Obra', render: v => fmtMoeda(v) },
        { key:'situacao',    label:'Situação', render: v => chipAprov(v) },
        { key:'alertas',     label:'Alertas', render: v => v ? `<b style="color:var(--red)">${v}</b>` : '0' },
        { key:'divergPU',    label:'Diverg. Preço', render: v => v ? `<b style="color:var(--amber)">${v}</b>` : '0' },
        { key:'sobrepreco',  label:'Sobrepreço R$', render: v => v ? fmtMoeda(v) : '—' },
        { key:'comFora',     label:'COM Fora NT.006', render: v => v ? `<b style="color:var(--amber)">${v}</b>` : '0' },
        { key:'score',       label:'Score', render: v => `<b>${v}</b>` },
        { key:'risco',       label:'Risco', render: v => chipRisco(v) },
        { key:'diagnostico', label:'Diagnóstico' },
    ];

    const dt = new DataTable(document.getElementById('tbl-ranking'), {
        columns: cols, data: dados, pageSize: 100, defaultSort: ['rank', 'asc']
    });

    const rOpts = ['ALTO','MEDIO','BAIXO','OK'];
    dt.addSelect('Risco', rOpts, 'risco');
}

// ── TABS ───────────────────────────────────────────────────────

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('pane-' + btn.dataset.tab).classList.add('active');
        });
    });
}

// ── RENDER ALL ────────────────────────────────────────────────

function renderAll(res) {
    RESULTADO = res;
    renderPainel(res);
    renderAnalise(res);
    renderCOM(res);
    renderPreco(res);
    renderAlertas(res);
    renderRanking(res);
}

// ── FILE HANDLING ─────────────────────────────────────────────

function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function showError(msg) {
    const el = document.getElementById('upload-error');
    el.textContent = msg;
    el.style.display = 'block';
}

function hideError() {
    document.getElementById('upload-error').style.display = 'none';
}

function processFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xlsm|xls)$/i)) {
        showError('Por favor, selecione um arquivo Excel (.xlsx, .xlsm ou .xls).'); return;
    }
    hideError();
    currentFileName = file.name;
    showLoading(true);

    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = new Uint8Array(e.target.result);
            currentWB = XLSX.read(data, { type: 'array' });
            currentWBPrecos = null;
            setTimeout(() => {
                try {
                    const res = Inventario.gerarInventario(currentWB, currentWBPrecos);
                    showLoading(false);
                    if (res.erro) { showError(res.erro); return; }
                    document.getElementById('upload-section').style.display = 'none';
                    document.getElementById('app').style.display = 'block';
                    document.getElementById('app-filename').textContent = file.name;
                    renderAll(res);
                } catch(err) {
                    showLoading(false);
                    showError('Erro ao processar: ' + err.message);
                    console.error(err);
                }
            }, 50);
        } catch(err) {
            showLoading(false);
            showError('Erro ao ler o arquivo: ' + err.message);
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}

function processPrecoFile(file) {
    if (!file || !currentWB) return;
    const errEl = document.getElementById('preco-error');
    const setErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };
    if (!file.name.match(/\.(xlsx|xlsm|xls)$/i)) {
        setErr('Selecione um arquivo Excel válido (.xlsx, .xlsm ou .xls).'); return;
    }
    showLoading(true);
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = new Uint8Array(e.target.result);
            currentWBPrecos = XLSX.read(data, { type: 'array' });
            setTimeout(() => {
                try {
                    const res = Inventario.gerarInventario(currentWB, currentWBPrecos);
                    showLoading(false);
                    if (res.erro) { setErr(res.erro); return; }
                    if (!res.temPrecos) {
                        currentWBPrecos = null;
                        renderAll(res);
                        const e2 = document.getElementById('preco-error');
                        if (e2) {
                            e2.textContent = 'Nenhuma faixa de preço reconhecida (esperado colunas MATERIAL, MIN PU, MAX PU).';
                            e2.style.display = 'block';
                        }
                    } else {
                        renderAll(res);
                    }
                } catch (err) {
                    showLoading(false); setErr('Erro ao processar: ' + err.message); console.error(err);
                }
            }, 50);
        } catch (err) {
            showLoading(false); setErr('Erro ao ler o arquivo: ' + err.message); console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ── INIT ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initTabs();

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => processFile(fileInput.files[0]));

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.classList.remove('dragover');
        processFile(e.dataTransfer.files[0]);
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        document.getElementById('app').style.display = 'none';
        document.getElementById('upload-section').style.display = 'flex';
        fileInput.value = '';
        hideError();
    });
});

// helper exposed for table cells
function toNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
