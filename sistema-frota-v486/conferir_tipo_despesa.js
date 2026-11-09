/**
 * Prova da normalização do tipo de despesa e do gás na exportação.
 *
 * Estas funcionalidades vieram de fora deste repositório, instaladas direto
 * no Apps Script, e entraram na unificação de 09/11/2026 sem teste nenhum.
 *
 * O defeito que elas consertam é dos piores que este projeto já teve: o
 * Resumo casava o tipo do lançamento com o mapa de colunas por igualdade de
 * string. Um "Gás" com o acento DECOMPOSTO — a + U+0301, que o Sheets grava
 * ao colar de certos lugares — não casava, caía no `indice === undefined`,
 * e o valor sumia do Resumo. Sem erro, sem aviso: o total só vinha menor.
 */
const fs = require('fs');
const vm = require('vm');

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

const avisos = [];
const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: () => '09/11/2026' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { chaveTipoDespesa_, mapaTipoColunaResumo_,
    resumoComGasNoCombustivel_, diagnosticarGasNoResumo, calcularLinhasResumo_,
    R_, L_, COL_VEIC, TOTAL_COL_RESUMO, TIPOS_COMBUSTIVEL });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-10' : ''; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26), fim: new Date(2026, 10, 25) }; };
  periodoDoMes_ = function () { return periodoAtual_(); };
  lerLancamentos_ = function () { return __lancamentos; };
  dadosVeiculosExecucao_ = function () { return __veic; };
  lerOdometro_ = function () { return []; };
  ss_ = function () { return { getSheetByName: function () { return null; } }; };
  param_ = function (n) {
    if (n === 'MES_REFERENCIA') return '2026-10';
    if (n === 'CUSTO_HORA_MOTORISTA') return 0;
    return '';
  };
  alerta_ = function (t, c) { __avisos.push({ titulo: t, corpo: c }); };
`, ctx);
ctx.__avisos = avisos;
const data = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); })', ctx);

const ACENTO_COMBINANTE = 'Gás';   // "Gás" com o "a" decomposto

console.log('\n1. A chave do tipo');
ok('tira o acento', ctx.chaveTipoDespesa_('Gás') === 'gas');
ok('tira a caixa', ctx.chaveTipoDespesa_('GÁS') === 'gas');
ok('junta o acento combinante na mesma chave',
  ctx.chaveTipoDespesa_(ACENTO_COMBINANTE) === 'gas',
  ctx.chaveTipoDespesa_(ACENTO_COMBINANTE));
ok('e as três formas batem entre si',
  ctx.chaveTipoDespesa_('Gás') === ctx.chaveTipoDespesa_(ACENTO_COMBINANTE) &&
  ctx.chaveTipoDespesa_('gas') === ctx.chaveTipoDespesa_('Gás'));
ok('espaço sobrando não cria outro tipo',
  ctx.chaveTipoDespesa_('  Oficina   Despesa ') === ctx.chaveTipoDespesa_('Oficina Despesa'));
ok('nulo não quebra', ctx.chaveTipoDespesa_(null) === '' && ctx.chaveTipoDespesa_(undefined) === '');
ok('tipos diferentes continuam diferentes',
  ctx.chaveTipoDespesa_('Pneus') !== ctx.chaveTipoDespesa_('Multa'));

console.log('\n2. O mapa sai indexado pela chave');
const mapa = ctx.mapaTipoColunaResumo_();
ok('nenhuma chave do mapa tem maiúscula ou acento',
  Object.keys(mapa).every(function (k) { return k === ctx.chaveTipoDespesa_(k); }),
  Object.keys(mapa).filter(function (k) { return k !== ctx.chaveTipoDespesa_(k); }).join(', '));
ok('o nome de exibição não serve mais de chave', mapa['Gás'] === undefined,
  'se servisse, metade das consultas casaria por acidente e a outra metade não');
ok('e a chave normalizada acha a coluna', mapa[ctx.chaveTipoDespesa_('Gás')] === ctx.R_.GAS);

console.log('\n3. O gás entra no Resumo, escrito como for');
function veic(placa) {
  const v = new Array(20).fill('');
  v[ctx.COL_VEIC.PLACA - 1] = placa; v[ctx.COL_VEIC.ATIVO - 1] = 'SIM';
  v[ctx.COL_VEIC.DESCRICAO - 1] = 'Empilhadeira'; v[ctx.COL_VEIC.CATEGORIA - 1] = 'Empilhadeira/Paleteira';
  v[ctx.COL_VEIC.CENTRO - 1] = 'DEPÓSITO';
  return v;
}
function lanc(placa, tipo, valor, litros) {
  const l = new Array(20).fill('');
  l[ctx.L_.DATA] = data(2026, 10, 30); l[ctx.L_.PLACA] = placa;
  l[ctx.L_.TIPO] = tipo; l[ctx.L_.VALOR] = valor; l[ctx.L_.LITROS] = litros || 0;
  return l;
}
ctx.__veic = [veic('AAA 0001'), veic('BBB 0002'), veic('CCC 0003')];
ctx.__lancamentos = [
  lanc('AAA 0001', 'Gás', 100, 20),
  lanc('BBB 0002', ACENTO_COMBINANTE, 200, 40),   // o que sumia
  lanc('CCC 0003', 'GAS', 300, 60),
];
const linhas = ctx.calcularLinhasResumo_();
function doVeiculo(p) {
  return linhas.filter(function (l) { return String(l[ctx.R_.PLACA]).indexOf(p) !== -1; })[0] || [];
}
ok('o "Gás" normal entra', doVeiculo('AAA')[ctx.R_.GAS] === 100, String(doVeiculo('AAA')[ctx.R_.GAS]));
ok('o do acento combinante TAMBÉM entra',
  doVeiculo('BBB')[ctx.R_.GAS] === 200, String(doVeiculo('BBB')[ctx.R_.GAS]));
ok('e o "GAS" em caixa alta sem acento', doVeiculo('CCC')[ctx.R_.GAS] === 300,
  String(doVeiculo('CCC')[ctx.R_.GAS]));
ok('os quilos vão para a coluna de kg, não para litros de combustível',
  doVeiculo('BBB')[ctx.R_.GAS_KG] === 40 && doVeiculo('BBB')[ctx.R_.LITROS] === 0,
  'kg ' + doVeiculo('BBB')[ctx.R_.GAS_KG] + ' / litros ' + doVeiculo('BBB')[ctx.R_.LITROS]);
ok('e o gás entra no TOTAL do veículo', doVeiculo('BBB')[ctx.R_.TOTAL] === 200,
  String(doVeiculo('BBB')[ctx.R_.TOTAL]));

console.log('\n4. O diagnóstico aponta o que o Resumo não soma');
avisos.length = 0;
ctx.__lancamentos = [
  lanc('AAA 0001', 'Gás', 100, 20),
  lanc('AAA 0001', 'Combustivel Alcool', 80, 10),   // tipo que não existe no mapa
  lanc('BBB 0002', 'Combustivel Alcool', 20, 3),
];
ctx.diagnosticarGasNoResumo();
ok('avisa quando há tipo fora do mapa', avisos.length === 1 &&
  /Combustivel Alcool/.test(avisos[0].corpo), JSON.stringify(avisos[0]));
ok('conta os lançamentos e soma o valor perdido',
  /2 lançamento\(s\)/.test(avisos[0].corpo) && /100,00/.test(avisos[0].corpo),
  avisos[0].corpo);
ok('e NÃO acusa o gás, que o Resumo soma', !/"Gás"/.test(avisos[0].corpo), avisos[0].corpo);
avisos.length = 0;
ctx.__lancamentos = [lanc('AAA 0001', 'Gás', 100, 20)];
ctx.diagnosticarGasNoResumo();
ok('com tudo reconhecido, diz isso em vez de ficar calado',
  avisos.length === 1 && /Todos os lançamentos/.test(avisos[0].corpo), JSON.stringify(avisos[0]));

console.log('\n5. Na exportação, o gás vai dentro de Combustível');
const cab = ['Placa / ID', 'Combustível R$', 'Gás R$', 'TOTAL R$'];
const antes = [['FROTA'], cab, ['AAA 0001', 500, 100, 600], ['BBB 0002', 300, 0, 300]];
const depois = ctx.resumoComGasNoCombustivel_(antes);
ok('soma o gás na coluna do combustível', depois[2][1] === 600, String(depois[2][1]));
ok('quem não teve gás fica igual', depois[3][1] === 300, String(depois[3][1]));
// O TOTAL ja incluia o gas: somar de novo faria o arquivo divergir do Resumo.
ok('o TOTAL não muda', depois[2][3] === 600 && depois[3][3] === 300,
  'o total já incluía o gás; mexer nele faria o arquivo divergir do Resumo');
ok('o rótulo avisa que foi somado', depois[1][1] === 'Combustível + Gás R$', depois[1][1]);
ok('e a coluna do gás continua, dizendo que já está contada',
  /já somado/.test(depois[1][2]), depois[1][2]);
ok('o original não é alterado', antes[2][1] === 500 && antes[1][1] === 'Combustível R$',
  'alterar a matriz recebida mexeria na aba de origem de quem chamou');
// Fotografia antiga ("Fechado 2026-03") nao tem a coluna de gas.
ok('planilha sem coluna de gás passa intacta', (function () {
  const velho = [['FROTA'], ['Placa / ID', 'Combustível R$', 'TOTAL R$'], ['AAA', 500, 500]];
  return JSON.stringify(ctx.resumoComGasNoCombustivel_(velho)) === JSON.stringify(velho);
})());
ok('matriz curta demais não quebra',
  JSON.stringify(ctx.resumoComGasNoCombustivel_([['x']])) === JSON.stringify([['x']]) &&
  ctx.resumoComGasNoCombustivel_(null) === null);
ok('célula de gás vazia não vira NaN', (function () {
  const r = ctx.resumoComGasNoCombustivel_([['F'], cab, ['AAA', 500, '', 500]]);
  return r[2][1] === 500;
})());

console.log('\n6. A exportação usa isso dos dois lados');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
const exp = (fonte.match(/function resumoExportacaoPeriodo_[\s\S]*?\n}/) || [''])[0];
ok('a competência aberta passa pelo ajuste',
  /mesRef===atual[\s\S]{0,120}resumoComGasNoCombustivel_/.test(exp), exp.slice(0, 200));
ok('e a fotografia congelada também',
  (exp.match(/resumoComGasNoCombustivel_/g) || []).length === 2,
  'um lado só faria o arquivo do mês fechado divergir do mês aberto');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
