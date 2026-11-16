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

const scripts = ['config.js', 'simulacao/antes.js', 'dados.js', 'simulacao/agenda_exemplo.js', 'logica.js', 'app.js', 'simulacao/depois.js'];
for (const s of scripts) {
  if (/<\/script/i.test(ler(s))) throw new Error(s + ' contém </script> e quebraria o HTML inline');
}

const pagina = [
  '<title>Simulador Fantasia na Data</title>',
  '<meta name="description" content="Simulação da landing de aluguel de fantasias antes de publicar.">',
  '<style>', ler('estilo.css'), ler('simulacao/simulacao.css'), '</style>',
  corpo.trim(),
  ...scripts.map(s => '<script>/* ' + s + ' */\n' + ler(s) + '\n</script>')
].join('\n');

fs.writeFileSync(saida, pagina);
console.log('montado: ' + saida + ' (' + Math.round(pagina.length / 1024) + ' KB)');
