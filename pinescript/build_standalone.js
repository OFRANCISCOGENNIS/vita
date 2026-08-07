// Gera Simulador_Standalone.html: um único arquivo HTML com CSS, JS e as libs
// (Lightweight Charts) embutidos, para abrir direto no navegador (file://) sem
// servidor. Uso: node build_standalone.js
//
// Fonte da verdade do app: pinescript/src/*.js (módulos em ordem). O build
// concatena esses arquivos, regenera app.js (bundle usado pela versão modular),
// minifica com esbuild (só espaços/comentários e sintaxe — NÃO renomeia
// identificadores, então nada externo quebra) e embute tudo no HTML. Se o
// esbuild não estiver disponível (offline), o build segue sem minificar.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dir = __dirname;

function minificar(src, tipo) {
  try {
    const args = ['-y', 'esbuild', '--loader=' + tipo];
    if (tipo === 'js') args.push('--minify-whitespace', '--minify-syntax');
    else args.push('--minify');
    const out = execFileSync('npx', args, { input: src, maxBuffer: 64 * 1024 * 1024, timeout: 90000 }).toString();
    return out && out.length ? out : src;
  } catch (e) {
    console.warn('aviso: minificação de ' + tipo + ' indisponível (' + String(e.message).split('\n')[0] + ') — usando fonte sem minificar');
    return src;
  }
}

// 1) Concatena os módulos src/*.js (ordem alfabética = ordem de execução) e
//    regenera app.js — mantém a versão modular (index.html) e o bundle em sincronia.
const srcDir = path.join(dir, 'src');
const modulos = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();
const bundle = modulos.map(f => fs.readFileSync(path.join(srcDir, f), 'utf8')).join('');
fs.writeFileSync(path.join(dir, 'app.js'), bundle);
console.log('bundle: ' + modulos.length + ' módulos -> app.js (' + bundle.length + ' bytes)');

let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const lwc = fs.readFileSync(path.join(dir, 'lightweight-charts.standalone.production.js'), 'utf8');
const css = minificar(fs.readFileSync(path.join(dir, 'styles.css'), 'utf8'), 'css');

// Núcleo de backtest (07-backtest.js) também vai como STRING p/ criar o Web
// Worker inline (Blob) — assim o standalone continua sendo um arquivo único.
const coreSrc = minificar(fs.readFileSync(path.join(srcDir, '07-backtest.js'), 'utf8'), 'js');
const app = 'window.__IA_CORE_SRC__=' + JSON.stringify(coreSrc) + ';\n' + minificar(bundle, 'js');

html = html.replace(
  /<!-- TradingView Lightweight Charts vendorizado localmente \(100% offline\) -->\s*<script src="lightweight-charts\.standalone\.production\.js"><\/script>/,
  '<script>\n' + lwc + '\n</script>'
);
html = html.replace(/<link rel="stylesheet" href="styles\.css">/, '<style>\n' + css + '\n</style>');
// Substitui o bloco de módulos (APP:START..APP:END) pelo bundle inline
html = html.replace(/<!-- APP:START[\s\S]*?<!-- APP:END -->/, '<script>\n' + app + '\n</script>');

const leftovers = (html.match(/(href="styles\.css"|src="app\.js"|src="src\/|src="lightweight-charts\.standalone\.production\.js")/g) || []);
if (leftovers.length) { console.error('FALHA: referências externas restantes:', leftovers); process.exit(1); }

fs.writeFileSync(path.join(dir, 'Simulador_Standalone.html'), html);
console.log('OK: Simulador_Standalone.html gerado (' + html.length + ' bytes)');
