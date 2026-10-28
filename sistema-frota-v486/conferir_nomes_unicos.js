/**
 * Nenhum nome definido duas vezes.
 *
 * Em Apps Script todos os .gs viram UM escopo. Duas funcoes com o mesmo nome
 * nao dao erro: a ultima sobrescreve a primeira, em silencio, e todo chamador
 * da primeira passa a receber outra coisa.
 *
 * Foi assim que a V4.16 quebrou. Eu criei `somarColunas_(linha, colunas)`, que
 * soma UMA linha por nomes de coluna e devolve um NUMERO. Ja existia
 * `somarColunas_(linhas, indices)`, que soma VARIAS linhas por indices e
 * devolve um ARRAY. A minha ficou depois no arquivo, entao venceu — e os onze
 * chamadores nos relatorios passaram a fazer `numero[0]`, que e undefined.
 *
 * Nem `node --check` nem as 598 provas de comportamento pegaram: cada suite
 * carrega o que precisa e nenhuma exercitava os dois usos no mesmo lugar. So
 * olhar o fonte pega.
 */
const fs = require('fs');

const ARQUIVOS = process.argv.slice(2);
if (!ARQUIVOS.length) ARQUIVOS.push('Codigo.gs');

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

function duplicados(linhas, re, rotulo) {
  const onde = {};
  linhas.forEach(function (l, i) {
    const m = re.exec(l);
    if (!m) return;
    (onde[m[1]] || (onde[m[1]] = [])).push(i + 1);
  });
  return Object.keys(onde)
    .filter(function (n) { return onde[n].length > 1; })
    .map(function (n) { return rotulo + ' ' + n + ' nas linhas ' + onde[n].join(', '); });
}

ARQUIVOS.forEach(function (arq) {
  console.log('\n' + arq);
  const linhas = fs.readFileSync(arq, 'utf8').split('\n');

  const fn = duplicados(linhas, /^function\s+([A-Za-z_$][\w$]*)\s*\(/, 'função');
  ok('nenhuma função definida duas vezes', fn.length === 0,
    fn.join('\n        ') + (fn.length
      ? '\n        A última vence, em silêncio. Renomeie a nova.' : ''));

  const cs = duplicados(linhas, /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, 'constante');
  ok('nenhuma constante de topo declarada duas vezes', cs.length === 0,
    cs.join('\n        '));

  // Função e constante com o mesmo nome: a atribuição vence a declaração.
  const nomesFn = {}, nomesCs = {};
  linhas.forEach(function (l) {
    let m = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(l);
    if (m) nomesFn[m[1]] = true;
    m = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(l);
    if (m) nomesCs[m[1]] = true;
  });
  const colisao = Object.keys(nomesFn).filter(function (n) { return nomesCs[n]; });
  ok('nenhum nome é função e constante ao mesmo tempo', colisao.length === 0,
    colisao.join(', '));
});

// A colisão concreta que motivou esta suíte: as duas assinaturas continuam
// distintas, cada uma com o nome que descreve o que ela faz.
console.log('\nA colisão da V4.16');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ok('a dos relatórios continua somarColunas_(linhas, indices)',
  /function somarColunas_\(linhas, indices\)/.test(fonte));
ok('a do Resumo tem nome próprio', /function somarColunasDoResumo_\(linha, colunas\)/.test(fonte));
ok('e os relatórios chamam a que devolve array',
  /somarColunas_\(dados, \[R_\./.test(fonte));
ok('o custo de rodagem chama a que devolve número',
  /somarColunasDoResumo_\(linha, R_CUSTO_RODAGEM_\)/.test(fonte));

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
