'use strict';

// ============================================================
// inventario.js — lógica de análise portada do módulo VBA
// ============================================================

const TOL_SUBVAL    = 0.9;
const MIN_DIVERG_RS = 100;
const PESO_REPROV   = 40;
const PESO_ALERTA   = 4;  const CAP_ALERTA = 24;
const PESO_PU       = 3;  const CAP_PU     = 18;
const PESO_COM      = 2;  const CAP_COM    = 18;

// ── helpers ──────────────────────────────────────────────────

function normStr(s) {
    if (s === null || s === undefined) return '';
    let r = String(s).toUpperCase().trim();
    r = r.normalize('NFD').replace(/[̀-ͯ]/g, '');
    r = r.replace(/[.\/\-_]/g, '').replace(/\s+/g, ' ').trim();
    return r;
}

function normCod(v) {
    if (v === null || v === undefined || v === '') return '';
    let s = String(v).trim();
    if (s.endsWith('.0')) s = s.slice(0, -2);
    if (/[eE][+]/.test(s)) { try { s = Math.round(parseFloat(s)).toString(); } catch(e){} }
    return s;
}

function toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}

function temPalavra(descNorm, termo) {
    const s = ' ' + descNorm.replace(/[^A-Z0-9]/g, ' ') + ' ';
    return s.includes(' ' + termo + ' ');
}

function fmt2(v) {
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── mapa NT.006 ───────────────────────────────────────────────

function criarMapaNT006() {
    const mk = (familia, nt006, descr, ehAncora, ancoraDep, razaoMin, razaoMax, regra) =>
        ({ familia, nt006, descr, ehAncora, ancoraDep, razaoMin, razaoMax, regra });

    const m = new Map();
    const a = (cod, ...args) => m.set(cod, mk(...args));

    // CRUZETAS (âncora)
    a('133100007','CRUZETA','R-02','Cruzeta concreto T 1900mm',true,'',0,0,'');
    a('133100001','CRUZETA','R-02','Cruzeta concreto L 1700mm',true,'',0,0,'');
    a('133100006','CRUZETA','R-02','Cruzeta concreto T 2200mm',true,'',0,0,'');
    a('133400012','CRUZETA','R-02','Cruzeta PRFV 90x112,5 2,4m',true,'',0,0,'');
    a('133400003','CRUZETA','R-02','Cruzeta PRFV',true,'',0,0,'');
    a('133400004','CRUZETA','R-02','Cruzeta PRFV',true,'',0,0,'');

    // ISOLADOR PILAR
    a('123140003','ISOLADOR PILAR','I-05','Isolador pilar 15kV M16',false,'CRUZETA',2,3.5,'2-3 iso. pilar por cruzeta');
    a('123140016','ISOLADOR PILAR','I-05','Isolador pilar 24,2kV M16',false,'CRUZETA',2,3.5,'2-3 iso. pilar por cruzeta');
    a('123140015','ISOLADOR PILAR','I-05','Isolador pilar polim. 25kV',false,'CRUZETA',2,3.5,'2-3 iso. pilar por cruzeta');
    a('123140014','ISOLADOR PILAR','I-05','Isolador pilar',false,'CRUZETA',2,3.5,'2-3 iso. pilar por cruzeta');

    // ISOL SUSPENSAO (âncora)
    a('123230001','ISOL SUSPENSAO','I-06','Isolador suspensao polim. 15kV',true,'',0,0,'');
    a('123230002','ISOL SUSPENSAO','I-06','Isolador suspensao',true,'',0,0,'');

    // ARRUELAS
    a('134830013','ARRUELA','A-02','Arruela quad. 38x38x3mm F18',false,'CRUZETA',2,9,'2-8 arruelas por cruzeta');
    a('134830014','ARRUELA','A-02','Arruela quad. lis 18x50x3mm',false,'CRUZETA',2,9,'2-8 arruelas por cruzeta');
    a('134830051','ARRUELA','A-02','Arruela red pres M18',false,'CRUZETA',2,9,'2-8 arruelas por cruzeta');

    // PARAFUSOS
    a('134700040','PARAFUSO','F-30','Parafuso cab qd 125mm M16x2',false,'CRUZETA',1,8,'1-8 parafusos por cruzeta');
    a('134700043','PARAFUSO','F-30','Parafuso cab qd 200mm M16x2',false,'CRUZETA',1,8,'1-8 parafusos por cruzeta');
    a('134700046','PARAFUSO','F-30','Parafuso cab qd 250mm M16x2',false,'CRUZETA',1,8,'1-8 parafusos por cruzeta');
    a('134700047','PARAFUSO','F-30','Parafuso cab qd 300mm M16x2',false,'CRUZETA',1,8,'1-8 parafusos por cruzeta');
    a('134700049','PARAFUSO','F-30','Parafuso cab qd 400mm M16x2',false,'CRUZETA',1,8,'1-8 parafusos por cruzeta');
    a('134700028','PARAFUSO','F-30','Parafuso cab abaul 16x45mm',false,'CRUZETA',1,8,'1-8 parafusos por cruzeta');
    a('134700030','PARAFUSO','F-30','Parafuso cab abaul 16x150mm',false,'CRUZETA',1,8,'1-8 parafusos por cruzeta');
    a('134700082','PARAFUSO','F-30','Parafuso rosca dupla 16x500',false,'CRUZETA',1,8,'1-8 parafusos por cruzeta');

    // PINOS
    a('134280005','PINO','F-36','Pino iso pilar autotrav M16x2',false,'CRUZETA',2,3.5,'~3 pinos por cruzeta');
    a('134280002','PINO','F-37','Pino curto suporte topo',false,'CRUZETA',1,2.5,'1-2 pinos curtos por cruzeta');

    // PORCA
    a('134800002','PORCA','A-21','Porca quad. M16x2',false,'CRUZETA',2,6.5,'2-6 porcas por cruzeta');

    // SELA CRUZETA
    a('134380004','SELA CRUZETA','-','Sela cruzeta 110x116mm',false,'CRUZETA',2,4,'2-3 selas por cruzeta trifasica');
    a('134380005','SELA CRUZETA','-','Sela cruzeta',false,'CRUZETA',2,4,'2-3 selas por cruzeta');

    // MAO FRANCESA
    a('134100006','MAO FRANCESA','-','Mao francesa plana 726x38x5mm',false,'CRUZETA',0.5,2.5,'1-2 maos-francesas por cruzeta');

    // GANCHO OLHAL (âncora)
    a('134250015','GANCHO OLHAL','F-13','Gancho olhal 5000daN',true,'',0,0,'');

    // MANILHA / OLHAL
    a('134200006','MANILHA','F-22','Manilha sapatilha 5000daN',false,'GANCHO OLHAL',0.8,1.2,'1 manilha por ponto de suspensao');
    a('134250023','OLHAL PARAFUSO','-','Olhal parafuso M16 5000daN',false,'GANCHO OLHAL',0.8,1.2,'1 olhal por ponto de suspensao');
    a('134740023','PARAFUSO OLHAL','F-34','Parafuso olhal M16x250mm',false,'GANCHO OLHAL',0.8,1.2,'1 parafuso olhal por ponto de suspensao');

    // HASTE DE ATERRAMENTO (âncora)
    a('134600010','HASTE TERRA','F-17','Haste aco-cobreado 14,3mm 2,4m',true,'',0,0,'');
    a('134600004','HASTE TERRA','F-17','Haste aco-cobreado 12,7mm 2,4m',true,'',0,0,'');

    // CONECTOR HASTE
    a('124140026','CONEC HASTE','M-10','Conector cunha haste 6-16mm',false,'HASTE TERRA',0.8,1.2,'1 conector por haste');
    a('124140078','CONEC HASTE','M-10','Conector aterramento p/haste',false,'HASTE TERRA',0.8,1.2,'1 conector por haste');
    a('124140011','CONEC HASTE','M-10','Conector cunha haste',false,'HASTE TERRA',0.8,1.2,'1 conector por haste');

    // SUP PARA-RAIOS (âncora)
    a('134190064','SUP PARA-RAIO','F-47','Suporte L para-raios 38x205',true,'',0,0,'');

    // PARA-RAIOS
    a('104010001','PARA-RAIO','E-29','Para-raios ZnO 12kV 10kA',false,'SUP PARA-RAIO',0.8,1.2,'1 para-raios por suporte');
    a('104010004','PARA-RAIO','E-29','Para-raios ZnO 15kV',false,'SUP PARA-RAIO',0.8,1.2,'1 para-raios por suporte');

    // CHAVE FUSIVEL (âncora)
    a('105300003','CHAVE FUSIVEL','E-09','Chave fusivel 15kV 100A base C',true,'',0,0,'');

    // TRAFO (âncora)
    a('102100035','TRAFO','E-45','Trafo trifasico 13,8kV 500kVA',true,'',0,0,'');
    a('102100036','TRAFO','E-45','Trafo trifasico 13,8kV',true,'',0,0,'');
    a('102100030','TRAFO','E-45','Trafo monofasico',true,'',0,0,'');

    // CONEC RAMAL
    a('124010010','CONEC RAMAL','O-02','Conector cunha CuEst tipo II',true,'',0,0,'');
    a('124010012','CONEC RAMAL','O-02','Conector cunha CuEst tipo III',true,'',0,0,'');

    return m;
}

// ── classificação por descrição (fallback) ───────────────────

function classificarDesc(descNorm) {
    const mk = (familia, nt006, ehAncora, ancoraDep, razaoMin, razaoMax, regra) =>
        ({ familia, nt006, ehAncora, ancoraDep, razaoMin, razaoMax, regra, isDesc: true });

    if (descNorm.includes('CRUZETA'))
        return mk('CRUZETA','R-02',true,'',0,0,'');
    if (descNorm.includes('ISOLADOR') && (descNorm.includes('DISCO') || descNorm.includes('SUSPENS')))
        return mk('ISOL SUSPENSAO','I-06',true,'',0,0,'');
    if (descNorm.includes('HASTE') && (descNorm.includes('TERRA') || descNorm.includes('ATERR') || descNorm.includes('COBRE')))
        return mk('HASTE TERRA','F-17',true,'',0,0,'');
    if (descNorm.includes('CHAVE') && descNorm.includes('FUS'))
        return mk('CHAVE FUSIVEL','E-09',true,'',0,0,'');
    if (descNorm.includes('CHAVE'))
        return mk('CHAVE FACA/SECC','E-10',true,'',0,0,'Chave faca/seccionadora');
    if (descNorm.includes('TRAFO') || descNorm.includes('TRANSFORMADOR'))
        return mk('TRAFO','E-45',true,'',0,0,'');
    if (descNorm.includes('GANCHO') && descNorm.includes('OLHAL'))
        return mk('GANCHO OLHAL','F-13',true,'',0,0,'');
    if (descNorm.includes('SUPORTE') && (descNorm.includes('PARARAIO') || descNorm.includes('PARA RAIO')))
        return mk('SUP PARA-RAIO','F-47',true,'',0,0,'');

    if (descNorm.includes('ISOLADOR') && descNorm.includes('PILAR'))
        return mk('ISOLADOR PILAR','I-05',false,'CRUZETA',2,3.5,'2-3 por cruzeta');
    if (descNorm.includes('MAO FRANCESA'))
        return mk('MAO FRANCESA','-',false,'CRUZETA',0.5,2.5,'1-2 por cruzeta');
    if (temPalavra(descNorm,'SELA'))
        return mk('SELA CRUZETA','-',false,'CRUZETA',2,4,'2-4 por cruzeta');
    if (descNorm.includes('ARRUELA'))
        return mk('ARRUELA','A-02',false,'CRUZETA',2,9,'2-8 por cruzeta');
    if (descNorm.includes('PORCA'))
        return mk('PORCA','A-21',false,'CRUZETA',2,6.5,'2-6 por cruzeta');
    if (temPalavra(descNorm,'PINO'))
        return mk('PINO','-',false,'CRUZETA',1,3.5,'1-3 por cruzeta');
    if (descNorm.includes('PARAFUSO') && descNorm.includes('OLHAL'))
        return mk('PARAFUSO OLHAL','F-34',false,'GANCHO OLHAL',0.8,1.2,'1 por ponto de suspensao');
    if (descNorm.includes('PARAFUSO'))
        return mk('PARAFUSO','F-30',false,'CRUZETA',1,8,'1-8 por cruzeta');

    if (descNorm.includes('PARARAIO') || descNorm.includes('PARA RAIO'))
        return mk('PARA-RAIO','E-29',false,'SUP PARA-RAIO',0.8,1.2,'1 por suporte');
    if (descNorm.includes('MANILHA'))
        return mk('MANILHA','F-22',false,'GANCHO OLHAL',0.8,1.2,'1 por ponto de suspensao');
    if (descNorm.includes('OLHAL'))
        return mk('OLHAL','-',false,'GANCHO OLHAL',0.8,1.2,'1 por ponto de suspensao');
    if (descNorm.includes('CONECTOR') && (descNorm.includes('HASTE') || descNorm.includes('ATERR') || descNorm.includes('CUNHA')))
        return mk('CONEC HASTE','M-10',false,'HASTE TERRA',0.8,1.2,'1 por haste');

    if (descNorm.includes('CORDOALHA') || descNorm.includes('ESTICADOR') || descNorm.includes('SAPATA') ||
        (descNorm.includes('HASTE') && descNorm.includes('ANCORA')))
        return mk('ESTAI','ES',true,'',0,0,'Conjunto de estai');
    if (temPalavra(descNorm,'DPS') || (descNorm.includes('PROTETOR') && descNorm.includes('SURTO')))
        return mk('DPS','DPS',true,'',0,0,'Protetor de surto BT');
    if (descNorm.includes('CABO') || descNorm.includes('CONDUTOR') || temPalavra(descNorm,'FIO') ||
        temPalavra(descNorm,'CAA') || temPalavra(descNorm,'CAZ'))
        return mk('CABO/CONDUTOR','COND',true,'',0,0,'Condutor - metros');
    if (descNorm.includes('POSTE'))
        return mk('POSTE','POSTE',true,'',0,0,'Poste - estrutura de suporte');
    if (descNorm.includes('CAIXA') && (descNorm.includes('MEDI') || descNorm.includes('POLICARB') || descNorm.includes('MONOF') || descNorm.includes('POLIF')))
        return mk('CAIXA MEDICAO','CX-M',false,'MEDIDOR',0.8,1.2,'1 caixa por medidor');
    if (descNorm.includes('CAIXA'))
        return mk('CAIXA','CX',true,'',0,0,'');
    if (descNorm.includes('MEDIDOR'))
        return mk('MEDIDOR','MED',true,'',0,0,'Medidor de energia');
    if (descNorm.includes('LACRE'))
        return mk('LACRE','LACRE',false,'MEDIDOR',1.8,2.2,'2 lacres por medidor');
    if (descNorm.includes('ARMACAO'))
        return mk('ARMACAO SEC','F-01',true,'',0,0,'Armacao secundaria BT');
    if (descNorm.includes('ROLDANA'))
        return mk('ROLDANA','-',false,'ARMACAO SEC',0.8,1.2,'1 roldana por armacao');
    if (descNorm.includes('GRAMPO'))
        return mk('GRAMPO','F-20',true,'',0,0,'Grampo de ancoragem');
    if (temPalavra(descNorm,'ELO') || (descNorm.includes('FUSIVEL') && !descNorm.includes('CHAVE')))
        return mk('ELO FUSIVEL','E-12',false,'CHAVE FUSIVEL',0.8,3.5,'1-3 elos por chave fusivel');
    if (temPalavra(descNorm,'CINTA'))
        return mk('CINTA POSTE','-',false,'POSTE',1,4,'1-4 cintas por poste');
    if (descNorm.includes('CONECTOR') || descNorm.includes('CONEX'))
        return mk('CONECTOR','M-01',true,'',0,0,'Conector eletrico');
    if (temPalavra(descNorm,'LUVA'))
        return mk('LUVA EMENDA','M-05',true,'',0,0,'Luva de emenda');
    if (temPalavra(descNorm,'FITA') || descNorm.includes('FECHO') || descNorm.includes('FIVELA'))
        return mk('FITA/FECHO','F-50',true,'',0,0,'Fita/fecho de aco inox');
    if (descNorm.includes('TERMINAL') || descNorm.includes('CABECOTE') || descNorm.includes('MUFLA'))
        return mk('TERMINAL/MUFLA','M-30',true,'',0,0,'Terminacao de cabo');
    if (descNorm.includes('ESTRIBO'))
        return mk('ESTRIBO','M-40',true,'',0,0,'Estribo de derivacao');
    if (descNorm.includes('RELIGADOR') || descNorm.includes('SECCIONA') || descNorm.includes('DISJUNTOR') || descNorm.includes('REGULADOR'))
        return mk('EQUIP MANOBRA','EQ',true,'',0,0,'Equipamento de manobra');
    if (temPalavra(descNorm,'BUCHA'))
        return mk('BUCHA','-',false,'CRUZETA',1,8,'Bucha/fixacao por cruzeta');
    if (descNorm.includes('ESPACADOR') || descNorm.includes('BRACO') || descNorm.includes('LOSANGULAR'))
        return mk('REDE COMPACTA','NT018',true,'',0,0,'Rede compacta');
    if (descNorm.includes('ALCA') && descNorm.includes('PREFORM'))
        return mk('ALCA PREFORMADA','F-04',true,'',0,0,'Alca preformada');
    if (temPalavra(descNorm,'ANEL') || temPalavra(descNorm,'LACO') || temPalavra(descNorm,'ALCA'))
        return mk('REDE COMPACTA','NT018',true,'',0,0,'Acessorio rede compacta');
    if (descNorm.includes('ELETRODUTO'))
        return mk('ELETRODUTO','ED',true,'',0,0,'Eletroduto/duto de descida');
    if (descNorm.includes('ABRACADEIRA') || descNorm.includes('CANTONEIRA') || descNorm.includes('PERFIL') || descNorm.includes('CHAPA'))
        return mk('FERRAGEM','FE',true,'',0,0,'Ferragem de fixacao');
    if (temPalavra(descNorm,'ARAME'))
        return mk('ARAME','AR',true,'',0,0,'Arame de amarracao');
    if (descNorm.includes('SUPORTE'))
        return mk('SUPORTE','SUP',true,'',0,0,'Suporte generico');

    return null;
}

// ── regras de negócio ─────────────────────────────────────────

function ehAderente(fam, libV, prjV, rawSitNorm) {
    const isMarg = fam.startsWith('COND') || fam.startsWith('CABO') || fam === 'RAMAL';
    if (isMarg && libV !== '' && prjV !== '' && !isNaN(parseFloat(libV)) && !isNaN(parseFloat(prjV))) {
        const l = parseFloat(libV), p = parseFloat(prjV);
        if (p === 0) return l === 0;
        return Math.abs(l - p) <= 0.1 * Math.abs(p);
    }
    return rawSitNorm === 'ADERENTE';
}

function ehComCritico(famNorm) {
    const f = famNorm.replace(/\s/g, '');
    return f.includes('CHFUS') || f.includes('CHAVEFUS') || f.includes('PARARAIO');
}

function caboComoCOM(fam, libV) {
    return fam === 'CABO ISOLADO' && !isNaN(parseFloat(libV)) && Math.abs(parseFloat(libV)) < 15;
}

function ehUnidadeInteira(uml) {
    const u = normStr(uml);
    return !['M','MT','MTS','KM','KG','G','GR','T','TON','L','LT','M2','M3'].includes(u);
}

// ── localizar aba base ────────────────────────────────────────

function acharBaseInventario(wb) {
    const ignorar = new Set(['PAINEL DO GESTOR','ANALISE SAP x PRJ','RESUMO SAP x PRJ',
        'RACIONALIZACAO COM','ALERTA CRITICO','PRECO UNITARIO','RANKING DE RISCO']);
    for (const name of wb.SheetNames) {
        if (ignorar.has(name)) continue;
        const ws = wb.Sheets[name];
        const ref = ws['!ref'];
        if (!ref) continue;
        const range = XLSX.utils.decode_range(ref);
        if (range.e.r < 1) continue;
        let hasSAP = false, hasPRJ = false;
        for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r: 0, c });
            const cell = ws[addr];
            if (!cell) continue;
            const h = normStr(cell.v);
            if (h === 'MAT LIB SAP') hasSAP = true;
            if (h === 'MAT PRJ CAD') hasPRJ = true;
        }
        if (hasSAP && hasPRJ) return name;
    }
    return null;
}

// ── leitura da aba base para array de objetos ────────────────

function lerBase(wb, sheetName) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (raw.length < 2) return { colunas: {}, dados: [] };

    const hdrs = raw[0].map(h => normStr(h));
    const colunas = {};
    const mapeamento = {
        'PEP3NIVEL':'pep3', 'PEP4NIVEL':'pep4', 'NOTA':'nota', 'CLASSE':'classe',
        'COD MAT':'cod', 'VALOR':'valor', 'DESC MAT':'desc', 'UND':'und',
        'MAT LIB SAP':'libSAP', 'MAT PRJ CAD':'prjCAD', 'TIPO':'tipo',
        'FAMILIA':'familia', 'SIT MAT':'sit', 'TIPO PEP':'tipoPep'
    };
    hdrs.forEach((h, i) => { if (mapeamento[h]) colunas[mapeamento[h]] = i; });

    const dados = raw.slice(1).map(row => {
        const obj = {};
        for (const [key, idx] of Object.entries(colunas)) {
            obj[key] = row[idx] !== undefined ? row[idx] : '';
        }
        return obj;
    }).filter(r => r.pep4 || r.cod);

    return { colunas, dados };
}

// ── ANÁLISE SAP × PRJ ─────────────────────────────────────────

function processarSAPxPRJ(dados) {
    const aprova   = new Map(); // pep4 → bool
    const temUC    = new Map(); // pep4 → bool
    const p4pep3   = new Map(); // pep4 → pep3
    const pep3Rep  = new Map(); // pep3 → bool
    const pep3UC   = new Map(); // pep3 → bool
    const pep3Fam  = new Map(); // pep3 → famílias culpadas

    let sumValor = 0, sumNaoAder = 0;
    const allP4 = new Set();

    for (const row of dados) {
        const pep4   = String(row.pep4 || '').trim();
        const pep3   = String(row.pep3 || '').trim();
        const tipo   = normStr(row.tipo);
        const sitN   = normStr(row.sit);
        const famN   = normStr(row.familia);
        const libV   = row.libSAP;
        const prjV   = row.prjCAD;
        const valor  = toNum(row.valor);

        if (pep4) {
            allP4.add(pep4);
            if (!p4pep3.has(pep4)) p4pep3.set(pep4, pep3);
        }

        const ehAval = (tipo === 'UC') || (tipo === 'COM' && ehComCritico(famN));
        if (pep4 && ehAval && !caboComoCOM(famN, libV)) {
            if (!temUC.has(pep4)) temUC.set(pep4, true);
            if (!aprova.has(pep4)) aprova.set(pep4, true);
            if (!ehAderente(famN, libV, prjV, sitN) && sitN !== 'NULO') {
                aprova.set(pep4, false);
                const f = String(row.familia || '(sem familia)').trim();
                pep3Fam.set(pep3, pep3Fam.has(pep3) ? pep3Fam.get(pep3) + ', ' + f : f);
            }
        }

        sumValor += valor;
        if (!ehAderente(famN, libV, prjV, sitN) && sitN !== 'NULO') sumNaoAder += Math.abs(valor);
    }

    // rollup PEP3
    for (const [p4, p3] of p4pep3) {
        if (!temUC.has(p4)) continue;
        if (!pep3UC.has(p3)) pep3UC.set(p3, true);
        if (!pep3Rep.has(p3)) pep3Rep.set(p3, false);
        if (!aprova.get(p4)) pep3Rep.set(p3, true);
    }

    let nAprov = 0, nReprov = 0;
    for (const [, rep] of pep3Rep) { if (rep) nReprov++; else nAprov++; }

    // enriquecer linhas
    const linhas = dados.map(row => {
        const pep4  = String(row.pep4 || '').trim();
        const pep3  = String(row.pep3 || '').trim();
        const tipo  = normStr(row.tipo);
        const sitN  = normStr(row.sit);
        const famN  = normStr(row.familia);
        const libV  = row.libSAP;
        const prjV  = row.prjCAD;

        let sitText = String(row.sit || '').trim();
        if ((famN.startsWith('COND') || famN.startsWith('CABO') || famN === 'RAMAL') &&
            !isNaN(parseFloat(libV)) && !isNaN(parseFloat(prjV))) {
            sitText = ehAderente(famN, libV, prjV, sitN) ? 'ADERENTE' : 'NAO ADERENTE';
        }

        const p3Rep = pep3UC.has(pep3) && pep3Rep.get(pep3);
        let aprovacao, motivo;

        if (p3Rep) {
            aprovacao = 'REPROVADO';
            if (tipo === 'UC' && !ehAderente(famN, libV, prjV, sitN) && sitN !== 'NULO')
                motivo = `UC não aderente: SAP=${libV} / PRJ=${prjV}`;
            else if (caboComoCOM(famN, libV))
                motivo = `Cabo isolado arrastado | Família reprovada: ${pep3Fam.get(pep3) || ''}`;
            else
                motivo = `Arrastado pela reprovação do PEP3 | Família reprovada: ${pep3Fam.get(pep3) || ''}`;
        } else if (caboComoCOM(famN, libV)) {
            aprovacao = 'APROVADO';
            motivo = 'Cabo isolado < 15m - isento de UC';
        } else if (!pep3UC.has(pep3)) {
            aprovacao = 'SEM UC';
            motivo = 'PEP3 sem UC nem COM crítico para avaliar';
        } else {
            aprovacao = 'APROVADO';
            motivo = 'Todos os itens avaliados do PEP3 aderentes';
        }

        return { ...row, sitText, aprovacao, motivo };
    });

    return {
        linhas,
        nPep4: allP4.size,
        nAprov,
        nReprov,
        sumValor,
        sumNaoAder,
        pep3Rep,
        pep3UC,
    };
}

// ── RACIONALIZAÇÃO COM (NT.006) ───────────────────────────────

function processarCOMInventario(dados) {
    const nt006 = criarMapaNT006();
    const liquidQ    = new Map(); // "pep4|cod" → qtd
    const liquidInfo = new Map(); // "pep4|cod" → {pep4, pep3, cod, desc, und}
    const ancoras    = new Map(); // "pep4|familia" → qtd
    const ancorasP3  = new Map(); // "pep3|familia" → qtd
    const ancoraInfo = new Map(); // "pep4|familia" → "cod - desc"

    for (const row of dados) {
        if (normStr(row.tipo) !== 'COM') continue;
        const pep4 = String(row.pep4 || '').trim();
        const pep3 = String(row.pep3 || '').trim();
        const cod  = normCod(row.cod);
        const qtd  = toNum(row.libSAP);
        const key  = `${pep4}|${cod}`;

        if (liquidQ.has(key)) {
            liquidQ.set(key, liquidQ.get(key) + qtd);
        } else {
            liquidQ.set(key, qtd);
            liquidInfo.set(key, { pep4, pep3, cod, desc: String(row.desc || ''), und: String(row.und || '') });
        }
    }

    // calcular âncoras
    for (const [key, qtd] of liquidQ) {
        const [pep4] = key.split('|');
        const { pep3, cod, desc } = liquidInfo.get(key);
        let tm = nt006.has(cod) ? nt006.get(cod) : classificarDesc(normStr(desc));
        if (!tm || !tm.ehAncora) continue;
        const aKey  = `${pep4}|${tm.familia}`;
        const aKey3 = `${pep3}|${tm.familia}`;
        ancoras.set(aKey,   (ancoras.get(aKey)  || 0) + qtd);
        ancorasP3.set(aKey3,(ancorasP3.get(aKey3)||0) + qtd);
        if (!ancoraInfo.has(aKey)) ancoraInfo.set(aKey, `${cod} - ${desc}`);
    }

    const linhas = [];
    const processedKeys = [...liquidQ.keys()].sort();

    for (const key of processedKeys) {
        const [pep4] = key.split('|');
        const { pep3, cod, desc, und } = liquidInfo.get(key);
        const qtdL = liquidQ.get(key);
        const descN = normStr(desc);
        let tm = nt006.has(cod) ? nt006.get(cod) : classificarDesc(descN);

        let familia='SEM REFERENCIA', nt006cod='-', ehAnc=false, ancoraFam='';
        let faixaMin=0, faixaMax=0, regra='', status='SEM REFERENCIA';
        let ancNivel3=false, ligadoA='-';

        if (tm) {
            familia   = tm.familia;
            nt006cod  = tm.nt006 || tm.CodNT006 || '-';
            ehAnc     = tm.ehAncora;
            ancoraFam = tm.ancoraDep || '';
            regra     = tm.regra || tm.DescrRegra || '';

            if (ehAnc) {
                status = qtdL < 0 ? 'ESTORNO SEM ENTRADA' : qtdL === 0 ? 'QTD ZERO' : 'ANCORA';
                ligadoA = '(é a própria referência)';
            } else {
                const ancKey  = `${pep4}|${ancoraFam}`;
                const ancKey3 = `${pep3}|${ancoraFam}`;
                let qtdAnc = ancoras.get(ancKey) || 0;
                if (qtdAnc <= 0 && ancorasP3.get(ancKey3) > 0) {
                    qtdAnc = ancorasP3.get(ancKey3);
                    ancNivel3 = true;
                }
                if (qtdAnc > 0) {
                    faixaMin = qtdAnc * (tm.razaoMin || 0);
                    faixaMax = qtdAnc * (tm.razaoMax || 0);
                    if (ehUnidadeInteira(und)) {
                        faixaMin = Math.floor(faixaMin);
                        faixaMax = Math.ceil(faixaMax);
                    }
                    status = qtdL < 0 ? 'ESTORNO SEM ENTRADA'
                           : qtdL < faixaMin ? 'INSUFICIENTE'
                           : faixaMax > 0 && qtdL >= faixaMax * 2 ? 'EXCESSO EXAGERADO'
                           : qtdL > faixaMax ? 'EXCESSO'
                           : 'OK';
                    const ai = ancoraInfo.get(ancKey);
                    ligadoA = ai ? `${ai} (${ancoraFam}, qtd ${qtdAnc.toFixed(2).replace(/\.?0+$/,'')})` : ancoraFam;
                    if (ancNivel3) ligadoA += ' [agregada no PEP3]';
                } else {
                    status = 'SEM ANCORA';
                    ligadoA = `${ancoraFam} (AUSENTE no PEP)`;
                }
            }
        }

        const previstoTxt = faixaMax > 0
            ? `${faixaMin.toFixed(2).replace(/\.?0+$/,'')} a ${faixaMax.toFixed(2).replace(/\.?0+$/, '')}`
            : '-';

        const obs = {
            'ANCORA':             'Material de referência (âncora)',
            'OK':                 'Dentro do previsto',
            'INSUFICIENTE':       `Veio MENOS que o previsto (faltaram ${(faixaMin - qtdL).toFixed(2).replace(/\.?0+$/, '')})`,
            'EXCESSO':            `Veio MAIS que o previsto (excedeu ${(qtdL - faixaMax).toFixed(2).replace(/\.?0+$/, '')})`,
            'EXCESSO EXAGERADO':  `Veio MUITO acima do previsto (${(faixaMax > 0 ? qtdL/faixaMax : 0).toFixed(1)}x o máximo)`,
            'SEM ANCORA':         `Sem ${ancoraFam} no PEP para comparar`,
            'QTD ZERO':           'Quantidade zero na obra',
            'ESTORNO SEM ENTRADA':'Estorno sem entrada correspondente',
            'SEM REFERENCIA':     'Material fora da NT.006',
        }[status] || '';

        linhas.push({ pep4, pep3, cod, desc, familia, nt006: nt006cod, ligadoA, qtd: qtdL, previsto: previstoTxt, status, obs, isDesc: !!(tm && tm.isDesc) });
    }

    return { linhas };
}

// ── ALERTAS CRÍTICOS ──────────────────────────────────────────

function processarAlertaCritico(dados, precos) {
    precos = precos || new Map();
    const alertas = [];
    const p4pep3  = new Map();
    const p4odi   = new Map();
    const p4uc    = new Map();
    const ucNzP4  = new Map();
    const p4com   = new Map();
    const pep3All = new Map();
    const pep3UC  = new Map();
    const medP4   = new Map();
    const lacreP4 = new Map();
    const medPep3 = new Map();

    for (const row of dados) {
        const pep4   = String(row.pep4 || '').trim();
        const pep3   = String(row.pep3 || '').trim();
        const tipo   = normStr(row.tipo);
        const tipoPep= normStr(row.tipoPep || '');

        if (!pep4) continue;
        if (!p4pep3.has(pep4)) p4pep3.set(pep4, pep3);
        if (!p4odi.has(pep4)) p4odi.set(pep4, false);
        if (tipoPep === 'I' || pep4.endsWith('.I')) p4odi.set(pep4, true);
        if (tipo === 'UC') { p4uc.set(pep4, true); if (toNum(row.libSAP) !== 0) ucNzP4.set(pep4, true); }
        if (tipo === 'COM') p4com.set(pep4, true);

        if (pep3) {
            if (!pep3All.has(pep3)) pep3All.set(pep3, pep4);
            if (tipo === 'UC') pep3UC.set(pep3, true);
        }

        const suf = pep4.slice(-2).toUpperCase();
        if (suf === '.M') {
            const dN = normStr(String(row.desc || '') + ' ' + normStr(String(row.familia || '')));
            if (!medPep3.has(pep4)) medPep3.set(pep4, pep3);
            if (dN.includes('MEDIDOR') && !dN.includes('CAIXA')) medP4.set(pep4, (medP4.get(pep4) || 0) + toNum(row.libSAP));
            if (dN.includes('LACRE')) lacreP4.set(pep4, (lacreP4.get(pep4) || 0) + toNum(row.libSAP));
        }
    }

    // ODI sem UC / sem COM
    for (const [pep4, pep3] of p4pep3) {
        if (p4odi.get(pep4) && !ucNzP4.has(pep4))
            alertas.push({ tipo:'ODI SEM UC', pep3, pep4, motivo: p4uc.has(pep4) ? 'ODI com TODAS as UC zeradas (MAT LIB SAP = 0)' : 'ODI sem nenhum item TIPO=UC' });
        if (p4odi.get(pep4) && !p4com.has(pep4))
            alertas.push({ tipo:'ODI SEM COM', pep3, pep4, motivo:'ODI sem nenhum material TIPO=COM' });
    }

    // PEP3 sem UC
    for (const [pep3, pep4] of pep3All) {
        if (!pep3UC.has(pep3))
            alertas.push({ tipo:'PEP SEM UC', pep3, pep4, motivo:'PEP3 sem nenhum item TIPO=UC cadastrado' });
    }

    // por linha
    for (const row of dados) {
        const pep4  = String(row.pep4 || '').trim();
        const pep3  = String(row.pep3 || '').trim();
        const tipo  = normStr(row.tipo);
        const famN  = normStr(String(row.familia || ''));
        const cod   = String(row.cod || '').trim();
        const desc  = String(row.desc || '');
        const valor = toNum(row.valor);
        const qtd   = toNum(row.libSAP);
        const suf   = pep4.slice(-2).toUpperCase();

        if (!pep4) continue;

        if ((suf === '.M' || pep4.includes('.M.')) && famN.includes('POSTE'))
            alertas.push({ tipo:'POSTE EM PEP .M', pep3, pep4, cod, desc, familia: String(row.familia || ''), valor, qtd, motivo:'Poste em PEP4 com sufixo .M (ODM)' });
        if ((suf === '.S' || pep4.includes('.S.')) && famN.includes('POSTE'))
            alertas.push({ tipo:'POSTE EM PEP .S', pep3, pep4, cod, desc, familia: String(row.familia || ''), valor, qtd, motivo:'Poste em PEP4 com sufixo .S (ODS)' });

        const odTp = {'.I':'ODI','.M':'ODM','.S':'ODS','.D':'ODD'}[suf] || '';
        if (['ODI','ODM','ODS'].includes(odTp) && qtd < 0 && cod)
            alertas.push({ tipo:'MATERIAL NEGATIVO', pep3, pep4, cod, desc, familia: String(row.familia || ''), valor, qtd, motivo:`Material NEGATIVO em PEP ${odTp} (esperado positivo)` });
        else if (odTp === 'ODD' && qtd > 0 && cod)
            alertas.push({ tipo:'MATERIAL POSITIVO EM ODD', pep3, pep4, cod, desc, familia: String(row.familia || ''), valor, qtd, motivo:'Material POSITIVO em PEP ODD (esperado negativo/desmonte)' });

        if (tipo === 'UC' && !famN.startsWith('COND') && !famN.startsWith('CABO') && !cod)
            alertas.push({ tipo:'UC - COD MATERIAL VAZIO', pep3, pep4, desc, familia: String(row.familia || ''), valor, motivo:'Código de material não preenchido' });

        // subvalorização de UC (só quando há base de preços carregada)
        if (precos.size > 0 && tipo === 'UC' && !famN.startsWith('COND') && !famN.startsWith('CABO') && cod) {
            const codN = normCod(cod);
            if (precos.has(codN) && qtd > 0 && valor > 0) {
                const refP = precos.get(codN), unit = valor / qtd;
                if (refP > 0 && unit < refP * TOL_SUBVAL && (refP - unit) * qtd >= MIN_DIVERG_RS)
                    alertas.push({ tipo:'UC SUBVALORIZADO', pep3, pep4, cod, desc, familia: String(row.familia || ''), valor, qtd, pu: unit, ref: refP,
                        motivo:`PU ${fmt2(unit)} abaixo de ${Math.round(TOL_SUBVAL*100)}% da referência (${fmt2(refP)})` });
            } else if (codN && qtd > 0 && valor > 0) {
                alertas.push({ tipo:'UC - PRECO NAO ENCONTRADO', pep3, pep4, cod, desc, familia: String(row.familia || ''), valor, qtd,
                    motivo:'Material sem preço de referência na base de preços' });
            }
        }
    }

    // lacre × medidor
    for (const [pep4, qMed] of medP4) {
        const qLac = lacreP4.get(pep4) || 0;
        const espLac = 2 * qMed;
        if (qMed > 0 && qLac !== espLac) {
            const pep3 = medPep3.get(pep4) || '';
            alertas.push({
                tipo:'LACRE x MEDIDOR', pep3, pep4, familia:'MEDIDOR / LACRE', qtd: qLac, referencia: espLac,
                motivo:`${qMed} medidor(es) → esperado ${espLac} lacres, veio ${qLac} ${qLac < espLac ? `(FALTAM ${espLac-qLac})` : `(SOBRAM ${qLac-espLac})`}`
            });
        }
    }
    for (const [pep4, qLac] of lacreP4) {
        if (!medP4.has(pep4) && qLac !== 0)
            alertas.push({ tipo:'LACRE x MEDIDOR', pep3: medPep3.get(pep4)||'', pep4, familia:'MEDIDOR / LACRE', qtd: qLac, referencia: 0, motivo:`Lacre sem medidor no PEP ODM (veio ${qLac})` });
    }

    return { alertas };
}

// ── RANKING DE RISCO ──────────────────────────────────────────

function processarRankingRisco(resultSAP, resultCOM, resultAlertas, resultPU) {
    const valOb = new Map(), repOb = new Map(), alOb = new Map(), comOb = new Map(),
          puOb = new Map(), sobOb = new Map();

    // dados da análise SAP×PRJ
    for (const row of resultSAP.linhas) {
        const p3 = String(row.pep3 || '').trim();
        if (!p3) continue;
        valOb.set(p3, (valOb.get(p3) || 0) + Math.abs(toNum(row.valor)));
        if (!repOb.has(p3)) repOb.set(p3, false);
        if (row.aprovacao === 'REPROVADO') repOb.set(p3, true);
    }

    // alertas
    for (const al of resultAlertas.alertas) {
        const p3 = al.pep3;
        if (!p3) continue;
        alOb.set(p3, (alOb.get(p3) || 0) + 1);
        if (!valOb.has(p3)) valOb.set(p3, 0);
    }

    // divergências de preço unitário + sobrepreço potencial
    if (resultPU) {
        for (const row of resultPU.linhas) {
            const p3 = row.pep3;
            if (!p3) continue;
            if (row.status === 'ABAIXO DO MINIMO' || row.status === 'ACIMA DO MAXIMO') {
                puOb.set(p3, (puOb.get(p3) || 0) + 1);
                if (!valOb.has(p3)) valOb.set(p3, 0);
                if (row.sobre > 0) sobOb.set(p3, (sobOb.get(p3) || 0) + row.sobre);
            }
        }
    }

    // COM fora do previsto
    for (const row of resultCOM.linhas) {
        const p3 = row.pep3;
        if (!p3) continue;
        if (['INSUFICIENTE','EXCESSO','EXCESSO EXAGERADO','QTD ZERO'].includes(row.status)) {
            comOb.set(p3, (comOb.get(p3) || 0) + 1);
            if (!valOb.has(p3)) valOb.set(p3, 0);
        }
    }

    const obras = [];
    for (const [p3] of valOb) {
        let score = 0;
        if (repOb.get(p3)) score += PESO_REPROV;
        score += Math.min((alOb.get(p3) || 0) * PESO_ALERTA, CAP_ALERTA);
        score += Math.min((puOb.get(p3) || 0) * PESO_PU, CAP_PU);
        score += Math.min((comOb.get(p3) || 0) * PESO_COM, CAP_COM);
        if (score > 100) score = 100;

        const risco = score >= 60 ? 'ALTO' : score >= 30 ? 'MEDIO' : score > 0 ? 'BAIXO' : 'OK';
        const parts = [];
        if (repOb.get(p3)) parts.push('REPROVADO na análise SAP×PRJ');
        if (alOb.get(p3)) parts.push(`${alOb.get(p3)} alerta(s) crítico(s)`);
        if (puOb.get(p3)) {
            let t = `${puOb.get(p3)} diverg. de preço`;
            if (sobOb.get(p3) > 0) t += ` (sobrepreço R$ ${fmt2(sobOb.get(p3))})`;
            parts.push(t);
        }
        if (comOb.get(p3)) parts.push(`${comOb.get(p3)} COM fora do previsto`);
        const diagnostico = parts.join(' | ') || 'Sem apontamentos';

        obras.push({ pep3: p3, valor: valOb.get(p3)||0, situacao: repOb.get(p3) ? 'REPROVADO' : 'APROVADO',
            alertas: alOb.get(p3)||0, divergPU: puOb.get(p3)||0, sobrepreco: sobOb.get(p3)||0, comFora: comOb.get(p3)||0,
            score, risco, diagnostico });
    }

    obras.sort((a, b) => b.score - a.score || b.valor - a.valor);
    return { obras };
}

// ── BASE DE PREÇOS ────────────────────────────────────────────

// Faixa MIN/MAX por código. Procura aba interna no workbook principal
// (BASE PRECOS / BASE DE PRECOS / BASE DE PREÇOS); se não houver e um
// workbook de preços for fornecido, usa a aba correspondente dele (ou a 1ª).
// Colunas: MATERIAL | TEXTO MATERIAL | MIN PU | MAX PU. Retorna Map cod → {min,max,texto}.
function carregarFaixaPrecos(wb, wbPrecos) {
    const fx = new Map();
    const faixaNomes = ['BASE PRECOS', 'BASE DE PRECOS'];

    let src = null, sheetName = null;
    for (const n of (wb.SheetNames || [])) if (faixaNomes.includes(normStr(n))) { src = wb; sheetName = n; break; }
    if (!src && wbPrecos && wbPrecos.SheetNames) {
        for (const n of wbPrecos.SheetNames) if (faixaNomes.includes(normStr(n))) { src = wbPrecos; sheetName = n; break; }
        if (!src && wbPrecos.SheetNames.length) { src = wbPrecos; sheetName = wbPrecos.SheetNames[0]; }
    }
    if (!src) return fx;

    const raw = XLSX.utils.sheet_to_json(src.Sheets[sheetName], { header: 1, defval: '' });
    if (raw.length < 2) return fx;

    const hdr = raw[0].map(h => normStr(h));
    let cMat = -1, cTxt = -1, cMin = -1, cMax = -1;
    hdr.forEach((h, i) => {
        if (h === 'MATERIAL') cMat = i;
        else if (h === 'TEXTO MATERIAL') cTxt = i;
        else if (h === 'MIN PU') cMin = i;
        else if (h === 'MAX PU') cMax = i;
    });
    if (cMat < 0) cMat = 0;
    if (cTxt < 0) cTxt = 1;
    if (cMin < 0) cMin = 3;
    if (cMax < 0) cMax = 4;

    for (let r = 1; r < raw.length; r++) {
        const cod = normCod(raw[r][cMat]);
        if (cod && !fx.has(cod))
            fx.set(cod, { min: toNum(raw[r][cMin]), max: toNum(raw[r][cMax]), texto: String(raw[r][cTxt] || '').trim() });
    }
    return fx;
}

// Preço de referência (único) por código, p/ alerta de subvalorização.
// Prioriza aba interna "PRECOS" (cod col 1, preço col 2); senão usa o ponto
// médio (min+max)/2 da faixa.
function carregarPrecos(wb, faixa) {
    const precos = new Map();
    const sheetName = (wb.SheetNames || []).find(n => normStr(n) === 'PRECOS');
    if (sheetName) {
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
        for (let r = 1; r < raw.length; r++) {
            const cod = normCod(raw[r][0]), p = toNum(raw[r][1]);
            if (cod && p > 0 && !precos.has(cod)) precos.set(cod, p);
        }
    }
    if (precos.size === 0 && faixa) {
        for (const [cod, f] of faixa) {
            let mx = f.max; if (mx <= 0) mx = f.min;
            const md = (f.min + mx) / 2;
            if (md > 0) precos.set(cod, md);
        }
    }
    return precos;
}

// ── PREÇO UNITÁRIO ────────────────────────────────────────────

function processarPrecoUnitario(dados, faixa) {
    const linhas = [];
    let nDiverg = 0, sobreprecoTotal = 0;

    for (const row of dados) {
        const cod   = normCod(row.cod);
        const qtd   = toNum(row.libSAP);
        const valor = toNum(row.valor);
        if (!cod || qtd === 0 || valor === 0) continue;

        const pu = valor / qtd;
        const f  = faixa.get(cod);
        let status, obs, mn = '', mx = '', sobre = 0;

        if (f) {
            mn = f.min; mx = f.max;
            if (pu < mn) {
                status = 'ABAIXO DO MINIMO'; obs = `PU ${fmt2(pu)} < min ${fmt2(mn)}`; nDiverg++;
            } else if (pu > mx) {
                status = 'ACIMA DO MAXIMO'; obs = `PU ${fmt2(pu)} > max ${fmt2(mx)}`; nDiverg++;
                if (qtd > 0) { sobre = (pu - mx) * qtd; sobreprecoTotal += sobre; }
            } else {
                status = 'DENTRO'; obs = `Dentro da faixa (${fmt2(mn)} a ${fmt2(mx)})`;
            }
        } else {
            status = 'SEM REFERENCIA'; obs = 'Material sem faixa na base de preços';
        }

        const pep4U   = String(row.pep4 || '').trim().toUpperCase();
        const suf     = pep4U.slice(-2);
        const tipoPep = normStr(row.tipoPep || '');
        const tipoOD  = suf === '.I' ? 'ODI' : suf === '.M' ? 'ODM' : suf === '.S' ? 'ODS' : suf === '.D' ? 'ODD'
                      : tipoPep === 'I' ? 'ODI' : tipoPep === 'M' ? 'ODM' : tipoPep === 'S' ? 'ODS' : tipoPep === 'D' ? 'ODD' : '-';

        linhas.push({
            pep3: String(row.pep3 || '').trim(), pep4: String(row.pep4 || '').trim(),
            tipo: String(row.tipo || '').trim(), cod, desc: String(row.desc || ''), und: String(row.und || ''),
            qtd, valor, pu, min: f ? mn : '', max: f ? mx : '', status, obs, tipoOD, sobre
        });
    }

    return { linhas, nDiverg, sobreprecoTotal };
}

// ── ENTRY POINT ───────────────────────────────────────────────

function gerarInventario(wb, wbPrecos) {
    const sheetName = acharBaseInventario(wb);
    if (!sheetName) return { erro: 'Nenhuma aba com "MAT LIB SAP" e "MAT PRJ CAD" foi encontrada.' };

    const { dados } = lerBase(wb, sheetName);
    if (!dados.length) return { erro: 'A aba base está vazia.' };

    const faixa     = carregarFaixaPrecos(wb, wbPrecos);
    const temPrecos = faixa.size > 0;
    const precos    = temPrecos ? carregarPrecos(wb, faixa) : new Map();

    const resultSAP     = processarSAPxPRJ(dados);
    const resultCOM     = processarCOMInventario(dados);
    const resultPU      = temPrecos ? processarPrecoUnitario(dados, faixa) : { linhas: [], nDiverg: 0, sobreprecoTotal: 0 };
    const resultAlertas = processarAlertaCritico(dados, precos);
    const resultRanking = processarRankingRisco(resultSAP, resultCOM, resultAlertas, resultPU);

    return { sheetName, temPrecos, resultSAP, resultCOM, resultPU, resultAlertas, resultRanking };
}

window.Inventario = { gerarInventario };
