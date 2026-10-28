/**
 * O JavaScript dentro de cada HTML tem de COMPILAR.
 *
 * Um erro de sintaxe num <script> nao quebra so a linha onde esta: o navegador
 * descarta o bloco inteiro e NENHUMA funcao e definida. O sintoma nao aponta
 * para a causa — aparece como "entrar is not defined" no primeiro clique, a
 * dois mil linhas de distancia do erro de verdade.
 *
 * Foi assim duas vezes. Na V4.13.1 por um recorte que apagou funcoes; na
 * V4.19.2 por duas barras invertidas que se perderam na edicao:
 *
 *   '...competência?\n\n'   virou   '...competência?
 *                                   '
 *   onclick="abrir(\'x\')"  virou   onclick="abrir('x')"
 *
 * Nenhuma das outras suites pega: todas leem o HTML como TEXTO, e texto
 * quebrado continua sendo texto. So um parser pega.
 *
 *   node conferir_sintaxe_html.js App.html Lancamento.html Central.html
 */
const fs = require('fs');
const vm = require('vm');

const ARQUIVOS = process.argv.slice(2);
if (!ARQUIVOS.length) ARQUIVOS.push('App.html', 'Lancamento.html', 'Central.html');

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

/** Recorta os <script> que têm código (ignora os que só carregam src). */
function scriptsDe(html) {
  const blocos = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    // A linha onde o bloco começa, para o erro apontar para o arquivo real.
    const linhaInicial = html.slice(0, m.index).split('\n').length;
    blocos.push({ codigo: m[2], linha: linhaInicial });
  }
  return blocos;
}

ARQUIVOS.forEach(function (arq) {
  console.log('\n' + arq);
  if (!fs.existsSync(arq)) { ok('existe', false, 'arquivo não encontrado'); return; }
  const html = fs.readFileSync(arq, 'utf8');
  const blocos = scriptsDe(html);
  ok('tem bloco de script', blocos.length > 0, 'nenhum <script> com código');

  blocos.forEach(function (b, i) {
    let erro = '';
    try {
      // new vm.Script compila sem executar: é o parser do V8, o mesmo do
      // navegador, e não roda uma linha do código.
      new vm.Script(b.codigo, { filename: arq });
    } catch (e) {
      erro = e.message;
      // A linha que o V8 aponta é relativa ao bloco; soma o início.
      const m = /:(\d+)\b/.exec(String(e.stack || '').split('\n')[0] || '');
      if (m) erro += ' (perto da linha ' + (Number(m[1]) + b.linha - 1) + ' do arquivo)';
    }
    ok('bloco ' + (i + 1) + ' compila', erro === '',
      erro + (erro ? '\n        Um <script> com erro de sintaxe não define NENHUMA função: ' +
        'o sintoma aparece como "X is not defined" no primeiro clique.' : ''));
  });
});

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
