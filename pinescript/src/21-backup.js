// ============================================================================
// BLOCO 26 — BACKUP COMPLETO (exporta/importa TUDO em um arquivo)
// ============================================================================
// O app vive no navegador: limpar os dados do site apaga meses de registro,
// IA treinada e configuração. Este bloco fotografa TODAS as chaves do
// localStorage do QUANT OPS num JSON único (download) e restaura de volta.
// (O histórico de velas do IndexedDB fica de fora: é grande e se reconstrói
// sozinho — o que é insubstituível é o registro e o aprendizado.)

const BACKUP_CHAVES = [
    'ctrlEstado', 'filtrosSalvos', 'registroEntradas', 'iaCache', 'pesoFatores',
    'scanSel', 'pilotoCfg', 'paineisVis', 'agentesOn', 'autoReopt', 'regSoA',
    'modoSniper', 'tema', 'ctrlVisivel', 'cardsRecolhidos', 'tdKey'
];

function coletarBackup() {
    const o = { app: 'QUANT OPS', versao: 1, data: new Date().toISOString(), chaves: {} };
    BACKUP_CHAVES.forEach(k => {
        const v = localStorage.getItem(k);
        if (v != null) o.chaves[k] = v;
    });
    return o;
}

function aplicarBackup(o) {
    if (!o || o.app !== 'QUANT OPS' || !o.chaves) throw new Error('arquivo não é um backup do QUANT OPS');
    let n = 0;
    BACKUP_CHAVES.forEach(k => {
        if (k in o.chaves) { localStorage.setItem(k, o.chaves[k]); n++; }
    });
    return n;
}

function exportarBackup() {
    try {
        const blob = new Blob([JSON.stringify(coletarBackup(), null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'quantops-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        showToast('💾 Backup completo baixado — guarde em local seguro', 'ok');
    } catch (e) { showToast('Falha no backup: ' + e.message, 'err'); }
}

document.addEventListener('DOMContentLoaded', function () {
    const bE = document.getElementById('btnBackupExp');
    const bI = document.getElementById('backupImp');
    if (bE) bE.addEventListener('click', exportarBackup);
    if (bI) bI.addEventListener('change', function () {
        const f = this.files && this.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
            try {
                const n = aplicarBackup(JSON.parse(rd.result));
                showToast(`📂 Backup restaurado (${n} conjuntos) — recarregando…`, 'ok');
                setTimeout(() => location.reload(), 900);
            } catch (e) { showToast('Backup inválido: ' + e.message, 'err'); }
            this.value = '';
        };
        rd.readAsText(f);
    });
});
