/**
 * Regra estatica: toda funcao CHAMADA no HTML tem de existir no HTML.
 *
 * Por que isto existe. Ao reescrever `blocoCorrecao`, meu recorte foi de
 * "function blocoCorrecao" ate "function corrigirPendencia" — e entre as duas
 * moravam `blocoAcao` e `rodarAcaoPendencia`, que sumiram junto. A chamada
 * `blocoCorrecao(p)+blocoAcao(p)` continuou la, e a tela de pendencias passou a
 * morrer inteira com ReferenceError.
 *
 * Nenhuma suite pegou:
 *   - conferir_callbacks.js confere so as cadeias google.script.run;
 *   - a checagem de handlers confere so onclick/onchange inline.
 * Chamada JS comum dentro do codigo de renderizacao nao era conferida por
 * ninguem — e e a forma mais comum de chamar funcao que existe.
 *
 * Sexta ocorrencia do mesmo padrao: a verificacao olha um lado do contrato.
 */
const fs = require('fs');

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}

// Nomes que o navegador/linguagem fornecem, ou que vêm do servidor pela cadeia
// google.script.run — nenhum deles precisa existir no HTML.
const GLOBAIS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new',
  'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'RegExp',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'alert', 'confirm',
  'prompt', 'console', 'window', 'document', 'google', 'Set', 'Map', 'Promise',
  'requestAnimationFrame', 'fetch', 'URL', 'Error', 'Intl', 'escape', 'unescape',
  // nomes do navegador com a mesma cara dos do projeto
  'getElementById', 'querySelector', 'querySelectorAll', 'addEventListener',
  'removeEventListener', 'createElement', 'toLocaleString', 'toFixed', 'parseFloat',
  // funções de CSS: o <style> está no mesmo arquivo e translateY( passa no crivo
  'translateY', 'translateX', 'translateZ', 'scaleX', 'scaleY', 'rotateZ',
  'minmax', 'drop-shadow',
]);

/**
 * Procura chamadas a funcoes do PROJETO que nao existem.
 *
 * Nao tenta separar codigo de texto. A primeira versao tentou, e um literal de
 * expressao regular — `/[&<>"]/g` — tem aspas dentro: o varredor achou que
 * abria uma string e engoliu o resto do arquivo, deixando "2 funcoes
 * definidas" de 194. Escrever um tokenizador de JavaScript para isto seria
 * desproporcional.
 *
 * Em vez disso, so considera nomes com a cara das funcoes deste projeto:
 * comecam em minuscula, tem maiuscula no meio e ao menos 6 letras
 * (`blocoAcao`, `rodarAcaoPendencia`, `telaComprovantes`). Palavra solta dentro
 * de frase em portugues — "1 pendência (" — nao passa nesse crivo, e foi
 * exatamente o ruido que afogou a primeira tentativa.
 *
 * O preco e nao cobrir funcoes de nome curto ou todo minusculo. Aceito: o
 * defeito real tinha a cara que esta regra pega, e uma regra que dispara 27
 * falsos positivos nao e lida por ninguem.
 */
const NOME_DO_PROJETO = /^[a-z][A-Za-z0-9_$]*[A-Z][A-Za-z0-9_$]*$/;

function conferir(arquivo) {
  const codigo = fs.readFileSync(arquivo, 'utf8');

  const definidas = new Set();
  let m;
  const reDef = /function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  while ((m = reDef.exec(codigo))) definidas.add(m[1]);
  const reVar = /(?:var|let|const)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:function|\()/g;
  while ((m = reVar.exec(codigo))) definidas.add(m[1]);

  const chamadas = {};
  const reCall = /(^|[^.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  while ((m = reCall.exec(codigo))) {
    const nome = m[2];
    if (GLOBAIS.has(nome)) continue;
    if (definidas.has(nome)) continue;
    if (nome.length < 6 || !NOME_DO_PROJETO.test(nome)) continue;
    chamadas[nome] = (chamadas[nome] || 0) + 1;
  }
  return { definidas: definidas, orfas: chamadas };
}

['App.html', 'Lancamento.html', 'Central.html'].forEach(function (arq) {
  console.log('\n' + arq);
  const r = conferir(arq);
  const nomes = Object.keys(r.orfas);
  ok(r.definidas.size + ' função(ões) definida(s); nenhuma chamada sem definição',
    nomes.length === 0,
    nomes.map(function (n) { return n + '() — ' + r.orfas[n] + ' chamada(s)'; }).join('\n        ') +
    '\n        -> ReferenceError derruba a tela inteira, sem mensagem útil');
});

console.log('\nAs funções que o defeito apagou');
const app = fs.readFileSync('App.html', 'utf8');
['blocoCorrecao', 'blocoAcao', 'rodarAcaoPendencia', 'corrigirPendencia',
 'renderPendencias', 'salvarPendencia'].forEach(function (f) {
  ok(f + ' existe', app.indexOf('function ' + f + '(') !== -1);
});

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
