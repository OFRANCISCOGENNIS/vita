#!/usr/bin/env node
// Gera web/inventario-standalone.html — versão única 100% offline (HTML+CSS+JS inline)
// a partir dos arquivos-fonte em web/ + libs vendorizadas em web/vendor/.
// Rode: node web/build-standalone.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const vendor = path.join(dir, 'vendor');

let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const css  = fs.readFileSync(path.join(dir, 'css/style.css'), 'utf8');
const xlsx = fs.readFileSync(path.join(vendor, 'xlsx.full.min.js'), 'utf8');
const chartjs = fs.readFileSync(path.join(vendor, 'chart.umd.min.js'), 'utf8');
const inv  = fs.readFileSync(path.join(dir, 'js/inventario.js'), 'utf8');
const app  = fs.readFileSync(path.join(dir, 'js/app.js'), 'utf8');

// IMPORTANTE: usar FUNÇÕES de substituição (não strings) — strings de
// replacement interpretam $&, $`, $', $1... e o JS minificado das libs
// contém essas sequências, o que duplicaria/corromperia o HTML.
// Também escapamos qualquer "</script" embutido por segurança.
const wrapScript = code => '<script>\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>';
const wrapStyle  = code => '<style>\n' + code + '\n</style>';

html = html
  .replace(/<link rel="stylesheet" href="css\/style.css">/, () => wrapStyle(css))
  .replace(/<script src="https:\/\/cdn\.sheetjs\.com[^"]+"><\/script>/, () => wrapScript(xlsx))
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^"]+"><\/script>/, () => wrapScript(chartjs))
  .replace(/<script src="js\/inventario\.js"><\/script>/, () => wrapScript(inv))
  .replace(/<script src="js\/app\.js"><\/script>/, () => wrapScript(app));

const out = path.join(dir, 'inventario-standalone.html');
fs.writeFileSync(out, html);
console.log('Gerado:', out, '(' + Math.round(html.length/1024) + ' KB)');
