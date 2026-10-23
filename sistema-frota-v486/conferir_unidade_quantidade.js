/**
 * Prova de que a conferencia de preco unitario respeita a UNIDADE do tipo.
 *
 * O defeito: havia um teto unico de R$ 30 para tudo que tem quantidade, e o
 * texto dizia sempre "/L". Gas e medido em QUILOS — o sistema ja sabia disso
 * (TIPOS_QUANTIDADE_KG, e o formulario troca o rotulo para "Quantidade (kg)") —
 * mas a conferencia dividia valor por quilos e anunciava "R$ 213,00/L". Uma
 * empilhadeira a GLP aparecia com uma unidade que ela nao usa.
 *
 * O segundo caso e o lubrificante: oleo sintetico passa de R$ 30/L sem nada de
 * errado, e o teto do diesel acusava compra normal. Alarme que toca sempre e
 * alarme que ninguem le.
 */
const fs = require('fs');
const vm = require('vm');

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'f1e2d3c4', formatDate: (d) => String(d) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    unidadeQuantidade_, TETO_PRECO_UNITARIO_, TETO_PRECO_UNITARIO_PADRAO_,
    TIPOS_QUANTIDADE_KG, TIPOS_COM_LITROS, TIPOS_DESPESA,
    correcaoDaPendencia_, CORRECOES_PENDENCIA_, ABAS, COL_LANC,
    pendenciaPrecoUnitario_,
  });
  listaCentros_ = function () { return []; };
  listaCategorias_ = function () { return []; };
`, ctx, { filename: 'Codigo.gs' });

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}

// Chama a MESMA funcao que o coletor chama. Reescrever a regra aqui faria o
// teste passar enquanto a producao fizesse outra coisa — ja aconteceu neste
// projeto, com os relatorios de evolucao lendo o campo errado.
function avaliar(tipo, valor, quantidade) {
  const p = ctx.pendenciaPrecoUnitario_(tipo, valor, quantidade, 86, 'PLACA1');
  const teto = ctx.TETO_PRECO_UNITARIO_[tipo] === undefined
    ? ctx.TETO_PRECO_UNITARIO_PADRAO_ : ctx.TETO_PRECO_UNITARIO_[tipo];
  return { acusa: p !== null, problema: p, teto: teto,
    unidade: ctx.unidadeQuantidade_(tipo), unitario: valor / quantidade,
    detalhe: p ? p[3] : '' };
}

// ---- 1. a unidade -----------------------------------------------------------
console.log('\n1. Unidade por tipo');
ok('Gás é medido em kg', ctx.unidadeQuantidade_('Gás') === 'kg');
ok('combustível é medido em L', ctx.unidadeQuantidade_('Combustivel Proprio') === 'L');
ok('Arla 32 é medido em L', ctx.unidadeQuantidade_('Arla 32') === 'L');
ok('a unidade sai de TIPOS_QUANTIDADE_KG, não de uma lista nova',
  ctx.TIPOS_QUANTIDADE_KG.every(function (t) { return ctx.unidadeQuantidade_(t) === 'kg'; }) &&
  ctx.TIPOS_COM_LITROS.filter(function (t) { return ctx.TIPOS_QUANTIDADE_KG.indexOf(t) === -1; })
    .every(function (t) { return ctx.unidadeQuantidade_(t) === 'L'; }));

// ---- 2. o caso do print -----------------------------------------------------
console.log('\n2. EMP YALE N 02 — o caso do print');
let r = avaliar('Gás', 213, 1);          // um botijão lançado como quantidade 1
ok('ainda acusa (213 por unidade é erro mesmo)', r.acusa === true);
ok('mas agora a unidade é kg, não L', r.unidade === 'kg', 'veio ' + r.unidade);
ok('o texto da pendência diz /kg e não /L',
  r.detalhe.indexOf('/kg') !== -1 && r.detalhe.indexOf('/L') === -1, r.detalhe);
ok('o problema se chama "Preço por quilo fora da curva"',
  r.problema[2] === 'Preço por quilo fora da curva', r.problema[2]);
ok('e a dica explica o botijão', /P20 = 20 kg/.test(r.detalhe), r.detalhe);
ok('o detalhe começa com "linha N", senão a correção na tela não acha a linha',
  /^linha 86 /.test(r.detalhe), r.detalhe);

r = avaliar('Gás', 213, 20);             // o mesmo botijão, lançado como P20
ok('P20 lançado em quilos NÃO acusa (R$ 10,65/kg é preço normal)',
  r.acusa === false, 'R$ ' + r.unitario.toFixed(2) + '/kg contra teto ' + r.teto);
r = avaliar('Gás', 110, 13);
ok('P13 a R$ 110 também não acusa', r.acusa === false, 'R$ ' + r.unitario.toFixed(2) + '/kg');

// ---- 3. lubrificante --------------------------------------------------------
console.log('\n3. Lubrificante: o teto do diesel acusava compra normal');
r = avaliar('Lubrificante', 60, 1);
ok('óleo sintético a R$ 60/L não acusa mais', r.acusa === false,
  'teto do lubrificante é ' + r.teto);
r = avaliar('Lubrificante', 5000, 1);
ok('mas erro grosso de digitação continua acusando', r.acusa === true);

// ---- 4. combustível não afrouxou -------------------------------------------
console.log('\n4. O teto do combustível continua onde estava');
ok('diesel a R$ 6,20/L não acusa', avaliar('Combustivel Proprio', 620, 100).acusa === false);
const diesel = avaliar('Combustivel Proprio', 620, 10);
ok('diesel a R$ 62/L acusa', diesel.acusa === true);
ok('e continua dizendo /L', diesel.detalhe.indexOf('/L') !== -1, diesel.detalhe);
ok('com o nome antigo do problema, para não perder as pendências já tratadas',
  diesel.problema[2] === 'Preço por litro fora da curva', diesel.problema[2]);
ok('o teto do combustível continua 30', avaliar('Combustivel Proprio', 1, 1).teto === 30);
ok('Arla 32 continua com teto 30', avaliar('Arla 32', 1, 1).teto === 30);

// ---- 5. tipo sem teto declarado cai no padrão ------------------------------
console.log('\n5. Tipo sem teto declarado');
ok('usa o padrão de 30, não undefined', avaliar('Pneus', 100, 1).teto === 30);
ok('e a comparação funciona (não vira NaN)', avaliar('Pneus', 100, 1).acusa === true);
ok('quantidade zero não gera pendência nem divisão por zero',
  ctx.pendenciaPrecoUnitario_('Gás', 213, 0, 86, 'P') === null);
ok('valor zero também não', ctx.pendenciaPrecoUnitario_('Gás', 0, 20, 86, 'P') === null);

// ---- 6. a pendência de quilo é corrigível na tela --------------------------
console.log('\n6. Correção na tela');
const c = ctx.correcaoDaPendencia_(ctx.ABAS.LANCAMENTOS, 'Preço por quilo fora da curva',
  'linha 86 • R$ 213.00/kg em Gás', 'EMP YALE N 02');
ok('oferece correção', c !== null, JSON.stringify(c));
ok('o campo é a QUANTIDADE, não o valor',
  c && c.rotulo.indexOf('kg') !== -1, c && c.rotulo);
ok('a ajuda diz os tamanhos de botijão',
  c && /P13|P20|P45/.test(c.ajuda), c && c.ajuda);
ok('e aponta para a coluna de quantidade do lançamento',
  ctx.CORRECOES_PENDENCIA_['Preço por quilo fora da curva'].coluna === ctx.COL_LANC.LITROS);
ok('a versão em litro continua existindo como problema próprio',
  ctx.correcaoDaPendencia_(ctx.ABAS.LANCAMENTOS, 'Preço por litro fora da curva',
    'linha 86 • R$ 62.00/L em Combustivel Proprio', 'AAA1A11') === null,
  'em litro o errado tanto pode ser o valor quanto a quantidade — não se oferece palpite');

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
