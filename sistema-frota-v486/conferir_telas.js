/**
 * Regra estatica: toda tela do menu tem de ser alcançável.
 *
 * Uma tela precisa estar em TRES lugares para existir de verdade:
 *   1. o MENU do App.html, com a funcao que a desenha;
 *   2. TELAS_WEB, senao doGet recusa abrir direto por ?pagina=;
 *   3. TELAS_POR_PERFIL, que e o que o menu REALMENTE mostra.
 *
 * Faltar no 3 nao da erro nenhum: a tela simplesmente nao aparece para ninguem,
 * e a funcionalidade fica entregue e invisivel. Foi o que aconteceu com
 * 'orcamento' (V4.9) e 'comprovantes' (V4.11) — as duas descobertas pelo
 * usuario perguntando "onde esta?", nao por teste.
 *
 * Nenhuma suite anterior pegaria: o servidor respondia certo, os callbacks
 * resolviam, as funcoes existiam. O que faltava era o ACORDO entre tres listas
 * que vivem em arquivos diferentes — e so uma regra que leia as tres cobra isso.
 */
const fs = require('fs');

const gs = fs.readFileSync('Codigo.gs', 'utf8');
const app = fs.readFileSync('App.html', 'utf8');

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}

/** Itens do MENU: id, rótulo e nome da função que desenha. */
function itensDoMenu() {
  const itens = [];
  const re = /\{ id: '([a-z]+)',[^}]*?rotulo: '([^']*)'[^}]*?fn: ([A-Za-z0-9_]+)\s*\}/g;
  let m;
  while ((m = re.exec(app))) itens.push({ id: m[1], rotulo: m[2], fn: m[3] });
  return itens;
}

function listaDeArray(fonte, inicio, fim) {
  const i = fonte.indexOf(inicio);
  if (i === -1) return [];
  const j = fonte.indexOf(fim, i);
  return (fonte.slice(i, j).match(/'([a-z]+)'/g) || []).map(function (x) { return x.slice(1, -1); });
}

const menu = itensDoMenu();
const telasWeb = listaDeArray(gs, 'const TELAS_WEB', '];');

const perfis = {};
const bloco = gs.slice(gs.indexOf('const TELAS_POR_PERFIL'), gs.indexOf('/** Colunas da aba Lançamentos'));
['CONSULTA', 'OPERADOR', 'ADMIN'].forEach(function (p) {
  const i = bloco.indexOf(p + ': [');
  const j = bloco.indexOf(']', i);
  perfis[p] = (bloco.slice(i, j).match(/'([a-z]+)'/g) || []).map(function (x) { return x.slice(1, -1); });
});

console.log('\n1. Leitura das três listas');
ok('achou os itens do menu', menu.length >= 15, menu.length + ' itens');
ok('achou TELAS_WEB', telasWeb.length >= 15, telasWeb.length + ' telas');
ok('achou os três perfis',
  perfis.CONSULTA.length && perfis.OPERADOR.length && perfis.ADMIN.length,
  JSON.stringify(Object.keys(perfis).map(function (p) { return p + '=' + perfis[p].length; })));

console.log('\n2. Toda tela do menu é alcançável');
const foraDeTelasWeb = menu.filter(function (i) { return telasWeb.indexOf(i.id) === -1; });
ok('nenhuma tela do menu fica fora de TELAS_WEB', foraDeTelasWeb.length === 0,
  foraDeTelasWeb.map(function (i) { return i.id + ' (' + i.rotulo + ')'; }).join(', ') +
  '\n        -> doGet recusa abrir essa tela direto por ?pagina=');

const invisiveis = menu.filter(function (i) { return perfis.ADMIN.indexOf(i.id) === -1; });
ok('nenhuma tela do menu é invisível para o ADMIN', invisiveis.length === 0,
  invisiveis.map(function (i) { return i.id + ' (' + i.rotulo + ')'; }).join(', ') +
  '\n        -> a tela existe, o servidor responde, e o item NÃO aparece no menu');

console.log('\n3. A função que desenha cada tela existe');
const semFuncao = menu.filter(function (i) {
  return app.indexOf('function ' + i.fn + '(') === -1;
});
ok('toda entrada do menu aponta para uma função existente', semFuncao.length === 0,
  semFuncao.map(function (i) { return i.id + ' -> ' + i.fn; }).join(', '));

console.log('\n4. Nenhum perfil recebe tela que não existe');
const inventadas = [];
Object.keys(perfis).forEach(function (p) {
  perfis[p].forEach(function (id) {
    if (!menu.some(function (i) { return i.id === id; })) inventadas.push(p + ':' + id);
  });
});
ok('nenhum perfil aponta para tela inexistente', inventadas.length === 0,
  inventadas.join(', ') + '\n        -> id morto na lista de permissão esconde erro de digitação');

console.log('\n5. Hierarquia dos perfis');
const consultaForaDeOperador = perfis.CONSULTA.filter(function (id) {
  return perfis.OPERADOR.indexOf(id) === -1;
});
const operadorForaDeAdmin = perfis.OPERADOR.filter(function (id) {
  return perfis.ADMIN.indexOf(id) === -1;
});
ok('OPERADOR enxerga tudo que CONSULTA enxerga', consultaForaDeOperador.length === 0,
  consultaForaDeOperador.join(', '));
ok('ADMIN enxerga tudo que OPERADOR enxerga', operadorForaDeAdmin.length === 0,
  operadorForaDeAdmin.join(', ') + '\n        -> perfil mais alto com MENOS acesso é sempre esquecimento');

console.log('\n6. As telas desta rodada, por nome');
['orcamento', 'comprovantes'].forEach(function (id) {
  const item = menu.filter(function (i) { return i.id === id; })[0];
  ok('"' + id + '" está no menu e visível para o ADMIN',
    !!item && perfis.ADMIN.indexOf(id) !== -1,
    'era exatamente o defeito: entregue e invisível');
});
ok('"comprovantes" também para o OPERADOR, que é quem recebe o papel',
  perfis.OPERADOR.indexOf('comprovantes') !== -1);
ok('"comprovantes" NÃO para CONSULTA, que não registra nada',
  perfis.CONSULTA.indexOf('comprovantes') === -1,
  'a tela é um formulário de registro; mostrá-la a quem o servidor recusa é promessa falsa');

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
