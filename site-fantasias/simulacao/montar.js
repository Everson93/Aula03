/* Monta a versão de simulação da landing num único HTML (para publicar como
 * artefato e testar antes de subir). Lê os arquivos reais do site — a
 * simulação nunca diverge do que vai ao ar — e acrescenta só a camada de
 * simulação: WhatsApp de mentira e painel de medição.
 *
 * Uso: node simulacao/montar.js <arquivo-de-saida.html> */
'use strict';
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8');
const saida = process.argv[2];
if (!saida) { console.error('uso: node simulacao/montar.js <saida.html>'); process.exit(2); }

const html = ler('index.html');
const corpo = /<body>([\s\S]*)<\/body>/.exec(html)[1]
  .replace(/<script src="[^"]+"><\/script>\s*/g, '');

const scripts = ['config.js', 'simulacao/antes.js', 'dados.js', 'simulacao/agenda_exemplo.js', 'logica.js',
  'simulacao/estado.js', 'app.js', 'simulacao/depois.js', 'simulacao/painel.js'];
for (const s of scripts) {
  if (/<\/script/i.test(ler(s))) throw new Error(s + ' contém </script> e quebraria o HTML inline');
}

// Fontes do Google: as mesmas linhas do <head> do site (o artefato só aceita fontes de lá).
const fontes = (html.match(/<link rel="(?:stylesheet|preconnect)" href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g) || []);

const pagina = [
  '<title>Simulador Cantinho da Day</title>',
  '<meta name="description" content="Simulação do site de aluguel de trajes juninos e fantasias antes de publicar.">',
  ...fontes,
  '<style>', ler('estilo.css'), ler('simulacao/simulacao.css'), ler('simulacao/painel.css'), '</style>',
  corpo.trim(),
  ...scripts.map(s => '<script>/* ' + s + ' */\n' + ler(s) + '\n</script>')
].join('\n');

fs.writeFileSync(saida, pagina);
console.log('montado: ' + saida + ' (' + Math.round(pagina.length / 1024) + ' KB)');
