// Gera Simulador_Standalone.html: um único arquivo HTML com CSS, JS e Chart.js
// embutidos, para abrir direto no navegador (file://) sem servidor.
// Uso: node build_standalone.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const chartjs = fs.readFileSync(path.join(dir, 'chart.umd.min.js'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');

html = html.replace(
  /<!-- Chart\.js vendorizado localmente \(funciona 100% offline\) -->\s*<script src="chart\.umd\.min\.js"><\/script>/,
  '<script>\n' + chartjs + '\n</script>'
);
html = html.replace(/<link rel="stylesheet" href="styles\.css">/, '<style>\n' + css + '\n</style>');
html = html.replace(/<script src="app\.js"><\/script>/, '<script>\n' + app + '\n</script>');

const leftovers = (html.match(/(href="styles\.css"|src="app\.js"|src="chart\.umd\.min\.js")/g) || []);
if (leftovers.length) { console.error('FALHA: referências externas restantes:', leftovers); process.exit(1); }

fs.writeFileSync(path.join(dir, 'Simulador_Standalone.html'), html);
console.log('OK: Simulador_Standalone.html gerado (' + html.length + ' bytes)');
