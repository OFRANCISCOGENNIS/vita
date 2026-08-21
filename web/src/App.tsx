import { useState, useCallback } from 'react';
import { UploadZone } from './components/UploadZone';
import { DataTable } from './components/DataTable';
import { processar } from './lib/processador';
import {
  emptyCatalogs, loadBuiltinDescSrv, carregarCatalogoMateriais,
  carregarCatalogoServicos, carregarCatalogoClasse,
} from './lib/catalogos';
import type { AnalysisResult, Catalogs } from './lib/types';
import { AlertCircle, CheckCircle2, Loader2, BarChart3, FileText, Zap } from 'lucide-react';

const TAB_ORDER = [
  'MATERIAL vs SERVICO', 'MATERIAL', 'SERVICO',
  'RAZAO CJ', 'NAO CLASSIFICADOS', 'SERVICO SEM MATERIAL',
];

export default function App() {
  const [exportFile, setExportFile] = useState<File | null>(null);
  const [matFile, setMatFile] = useState<File | null>(null);
  const [srvFile, setSrvFile] = useState<File | null>(null);
  const [ccFile, setCcFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    if (!exportFile) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const cats: Catalogs = emptyCatalogs();

      loadBuiltinDescSrv(cats);

      if (matFile) await carregarCatalogoMateriais(matFile, cats);
      if (srvFile) await carregarCatalogoServicos(srvFile, cats);
      if (ccFile) await carregarCatalogoClasse(ccFile, cats);

      const res = await processar(exportFile, cats);
      setResult(res);
      setActiveTab(res.sheets.has('MATERIAL vs SERVICO') ? 'MATERIAL vs SERVICO' : [...res.sheets.keys()][0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [exportFile, matFile, srvFile, ccFile]);

  const tabs = result ? TAB_ORDER.filter(t => result.sheets.has(t)) : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* header */}
      <header className="bg-slate-800 text-white px-6 py-4 flex items-center gap-3 shadow-lg">
        <BarChart3 size={24} className="text-blue-400" />
        <div>
          <h1 className="text-lg font-bold leading-none">AnaliseCKCP</h1>
          <p className="text-xs text-slate-400 mt-0.5">Análise de Custos CKCP RS2</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* upload section */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-slate-500" />
            <h2 className="font-semibold text-slate-700">Arquivos de entrada</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1">
              <p className="text-xs font-medium text-slate-600 mb-1.5">Base SAP (obrigatório)</p>
              <UploadZone label="EXPORT.XLSX" onFile={setExportFile} file={exportFile} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Catálogo de Materiais</p>
              <UploadZone label="MATERIAS_ATUAIS.xlsx" onFile={setMatFile} file={matFile} optional />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Catálogo de Serviços</p>
              <UploadZone label="SERVICOS_ATUAIS.xlsx" onFile={setSrvFile} file={srvFile} optional />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Catálogo de Classes</p>
              <UploadZone label="CLASSES_CUSTO.xlsx" onFile={setCcFile} file={ccFile} optional />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={run}
              disabled={!exportFile || loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {loading ? 'Processando...' : 'Gerar Relatório'}
            </button>
            {result && (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 size={16} />
                <span>{result.nLin.toLocaleString('pt-BR')} linhas processadas em {result.tempoMs}ms</span>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* results */}
        {result && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {/* summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-gray-100 border-b border-gray-200">
              {tabs.map(t => {
                const sheet = result.sheets.get(t)!;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-3 py-3 text-left transition-colors hover:bg-slate-50
                      ${activeTab === t ? 'bg-blue-50 border-b-2 border-blue-500' : ''}`}
                  >
                    <div className="text-xs text-gray-500 truncate">{t}</div>
                    <div className="text-lg font-bold text-slate-800">{sheet.rows.length.toLocaleString('pt-BR')}</div>
                  </button>
                );
              })}
            </div>

            {/* active sheet */}
            <div className="p-5">
              {activeTab && result.sheets.has(activeTab) && (
                <DataTable
                  headers={result.sheets.get(activeTab)!.headers}
                  rows={result.sheets.get(activeTab)!.rows}
                />
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
