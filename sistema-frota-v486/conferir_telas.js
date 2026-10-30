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

console.log('\n4. Depois de gravar, o formulário não guarda o veículo');
// Placa que fica preenchida lança o gasto seguinte no veículo anterior — e
// isso só aparece no fechamento, quando ninguém lembra mais.

const limpeza = (app.match(/\['placa'[^\]]*\]\s*\n?\s*\.forEach\(function \(id\) \{ if \(el\(id\)\) el\(id\)\.value = ''; \}\);/) || [''])[0];
ok('a placa está na lista de campos limpos depois de gravar', limpeza !== '',
  'sem ela o lançamento seguinte sai na placa anterior');
['litros', 'valor', 'km', 'documento', 'observacao'].forEach(function (campo) {
  ok('e ' + campo + ' continua sendo limpo', limpeza.indexOf("'" + campo + "'") !== -1,
    'acrescentar a placa não pode ter derrubado os outros');
});
// `el('placa').focus()` tambem aparece na tela de comprovantes: a prova tem
// de olhar o foco DEPOIS da gravacao, nao em qualquer lugar do arquivo.
ok('o foco volta para a placa depois de gravar',
  /carregarUltimos\(\);\s*\n\s*if \(el\('placa'\)\) el\('placa'\)\.focus\(\);/.test(app),
  'quem lança em série digita a próxima placa em seguida');

console.log('\n5. Exportar em planilha o relatório da tela');
ok('o botão existe na tela de relatórios', /baixarRelatorioXlsx\(this\)/.test(app));
ok('e manda os MESMOS filtros que a tela usou',
  /webRelatorioXlsx\(TOKEN, tipo, \{[\s\S]{0,260}centro:[\s\S]{0,260}categoria:[\s\S]{0,260}veiculo:[\s\S]{0,260}termo:/.test(app),
  'exportar sem os filtros entrega um arquivo diferente do que está na tela');
ok('o servidor refaz o relatório em vez de receber a tabela pronta',
  /function gerarXlsxRelatorio_[\s\S]{0,900}relatorioPorTipo_\(nome,/.test(gs),
  'tabela vinda do cliente envelhece entre o desenho e o clique, e é adulterável');
ok('e usa o mesmo escritor de aba do fechamento',
  /function gerarXlsxRelatorio_[\s\S]{0,1800}escreverRelatorioNaAba_\(/.test(gs),
  'um exportador próprio faria um caminho formatar e o outro entregar texto');

console.log('\n6. O campo de e-mail da planilha');
ok('existe na tela de relatórios', /id="relEmail"/.test(app));
ok('e no cartão do fechamento', /id="fechEmail"/.test(app));
ok('o relatório manda o e-mail junto com os filtros',
  /webRelatorioXlsx\(TOKEN, tipo, \{[\s\S]{0,320}\}, el\('relEmail'\)/.test(app),
  'campo na tela que o callback não envia é promessa falsa');
ok('o fechamento manda só na planilha, não no PDF',
  /webFechamentoXlsx\(TOKEN, '', el\('fechEmail'\)/.test(app) &&
  /webFechamentoPdf\(TOKEN, ''\);/.test(app),
  'o PDF é para arquivar; mandar os dois pelo mesmo campo seria surpresa');
ok('o servidor valida o e-mail ANTES de montar a planilha', (function () {
  const f = (gs.match(/function webFechamentoXlsx[\s\S]*?\n\}/) || [''])[0];
  return f.indexOf('listaDeEmails_') !== -1 &&
    f.indexOf('listaDeEmails_') < f.indexOf('gerarXlsxFechamento_');
})(), 'errar o endereço depois de dois minutos de geração obriga a refazer tudo');
ok('e a validação tem um dono só',
  (gs.match(/\^\[\^@\\s\]\+@\[\^@\\s\]\+/g) || []).length === 1,
  'duas cópias da mesma regra de validação, duas chances de uma afrouxar');

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
