/**
 * Prova do preço do litro do tanque interno.
 *
 * Até a V4.33 o abastecimento interno era valorizado pelo CUSTO MÉDIO do
 * tanque. A partir da V4.34, pelo preço da ÚLTIMA carga — decisão do
 * usuário em 09/11/2026.
 *
 * Isto nunca teve suíte, e é o cálculo que define quanto cada veículo é
 * cobrado por litro: errar aqui não dá erro em lugar nenhum, só distribui
 * dinheiro errado entre as lojas no rateio.
 *
 * A armadilha específica desta mudança é que a simulação do tanque existe em
 * DOIS lacos — `estadoTanque_`, que valoriza na hora de gravar, e
 * `recalcularAbastecimentosInternos_`, que revaloriza quando uma carga é
 * corrigida. Mudar um só faz o valor gravado divergir do valor que o
 * recálculo põe no lugar, e o número muda sozinho na próxima carga.
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
  Object.assign(globalThis, { estadoTanque_, precoLitroCarga_, webCustoBomba,
    PRODUTO_DIESEL, PRODUTO_ARLA, COL_CARGA, L_, ABASTECIMENTO_INTERNO });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  exigirPerfilToken_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-11' : ''; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26, 0, 0, 0, 0),
                                         fim: new Date(2026, 10, 25, 23, 59, 59, 999) }; };
  periodoDoMes_ = function () { return periodoAtual_(); };
  lerCargasBomba_ = function () { return __cargas; };
  lerLancamentos_ = function () { return __lancamentos; };
`, ctx);
const data = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); })', ctx);

function carga(dt, produto, litros, valor) {
  const c = new Array(8).fill('');
  c[ctx.COL_CARGA.DATA - 1] = dt; c[ctx.COL_CARGA.PRODUTO - 1] = produto;
  c[ctx.COL_CARGA.QUANTIDADE - 1] = litros; c[ctx.COL_CARGA.VALOR - 1] = valor;
  return c;
}
function saida(dt, placa, litros) {
  const l = new Array(20).fill('');
  l[ctx.L_.DATA] = dt; l[ctx.L_.PLACA] = placa; l[ctx.L_.TIPO] = 'Combustivel Proprio';
  l[ctx.L_.LITROS] = litros; l[ctx.L_.TIPO_ABASTECIMENTO] = 'Interno';
  return l;
}

// Duas cargas de preço BEM diferente: 1.000 L a R$ 6,00 e 1.000 L a R$ 8,00.
// Média depois da segunda = 7,00; última carga = 8,00. Fixture que não
// distingue os dois critérios não prova nada aqui.
function montar() {
  ctx.__cargas = [
    carga(data(2026, 11, 1), 'DIESEL S10', 1000, 6000),
    carga(data(2026, 11, 10), 'DIESEL S10', 1000, 8000),
  ];
  ctx.__lancamentos = [];
}

console.log('\n1. O preço de uma carga');
ok('é valor dividido por litros', ctx.precoLitroCarga_(1000, 6000) === 6);
ok('litro zero não vira divisão por zero', ctx.precoLitroCarga_(0, 500) === 0);
// O ajuste de estoque entra na mesma aba, com litros NEGATIVOS. É aqui que
// ele é barrado — e é por isso que o laço pode somar sem um `if` próprio.
ok('litro negativo também devolve zero', ctx.precoLitroCarga_(-40, -280) === 0,
  String(ctx.precoLitroCarga_(-40, -280)));
ok('nem texto', ctx.precoLitroCarga_('x', 'y') === 0);

console.log('\n2. O litro sai pelo preço da ÚLTIMA carga');
montar();
let e = ctx.estadoTanque_('DIESEL S10', null);
ok('o preço cobrado é o da última carga', e.precoLitro === 8, String(e.precoLitro));
ok('e NÃO a média das duas', e.precoLitro !== 7, 'média seria 7,00');
ok('o custo médio do estoque continua existindo, como referência',
  e.custoMedio === 7, String(e.custoMedio));
ok('o saldo em litros não muda com o critério', e.litros === 2000, String(e.litros));
ok('nem o valor pago pelo que está no tanque', e.valor === 14000, String(e.valor));

console.log('\n3. Antes da segunda carga, o preço é o da primeira');
e = ctx.estadoTanque_('DIESEL S10', data(2026, 11, 5));
ok('cobra 6,00 em 05/11', e.precoLitro === 6, String(e.precoLitro));
ok('e o médio também é 6,00, porque só houve uma carga', e.custoMedio === 6);
e = ctx.estadoTanque_('DIESEL S10', data(2026, 10, 20));
ok('sem carga nenhuma até a data, não há preço', e.precoLitro === 0, String(e.precoLitro));

console.log('\n4. A diferença entre cobrar pelo último e pela média fica visível');
montar();
// 500 L saem DEPOIS da segunda carga: cobrados a 8,00 (R$ 4.000) quando a
// média era 7,00 (R$ 3.500). Diferença de R$ 500 a mais.
ctx.__lancamentos = [saida(data(2026, 11, 12), 'AAA 0001', 500)];
e = ctx.estadoTanque_('DIESEL S10', null);
ok('a diferença de valorização é declarada', e.diferencaValorizacao === 500,
  String(e.diferencaValorizacao));
ok('o saldo em litros desce normalmente', e.litros === 1500, String(e.litros));
// O saldo em R$ continua sendo o que foi PAGO pelo que sobrou: o critério
// muda o que se cobra do veículo, não o dinheiro que entrou no tanque.
ok('o valor do estoque continua pelo que foi pago',
  Math.abs(e.valor - 10500) < 0.0001, String(e.valor));
ok('sem saída nenhuma, a diferença é zero', (function () {
  montar();
  return ctx.estadoTanque_('DIESEL S10', null).diferencaValorizacao === 0;
})());
ok('com um preço só, a diferença também é zero', (function () {
  ctx.__cargas = [carga(data(2026, 11, 1), 'DIESEL S10', 1000, 6000)];
  ctx.__lancamentos = [saida(data(2026, 11, 5), 'AAA 0001', 300)];
  return ctx.estadoTanque_('DIESEL S10', null).diferencaValorizacao === 0;
})(), 'cobrar pelo último e pela média dá no mesmo quando só houve uma carga');

console.log('\n5. Ajuste de estoque não redefine o preço');
montar();
// O ajuste entra na aba de cargas com litros NEGATIVOS (perda medida). Se
// ele redefinisse o preço, o litro passaria a sair por um número que nunca
// foi preço de nota nenhuma.
// O ajuste é valorizado a 7,00: é assim que as linhas gravadas ANTES da
// V4.34 ficaram, pelo custo médio da época. Com -40 L a -320 (8,00, o mesmo
// preço da carga), redefinir o preço ou não daria no mesmo e a prova não
// distinguiria as duas coisas.
ctx.__cargas = ctx.__cargas.concat([carga(data(2026, 11, 15), 'DIESEL S10', -40, -280)]);
e = ctx.estadoTanque_('DIESEL S10', null);
ok('o preço continua o da última carga de verdade', e.precoLitro === 8, String(e.precoLitro));
ok('e não vira o preço implícito do ajuste', e.precoLitro !== 7,
  'o litro sairia por um número que não foi preço de nota nenhuma');
ok('e o saldo desce pelo ajuste', e.litros === 1960, String(e.litros));

console.log('\n6. Produtos separados');
montar();
ctx.__cargas = ctx.__cargas.concat([carga(data(2026, 11, 20), 'ARLA 32', 200, 1000)]);
ok('o Arla tem preço próprio', ctx.estadoTanque_('ARLA 32', null).precoLitro === 5,
  String(ctx.estadoTanque_('ARLA 32', null).precoLitro));
ok('e não contamina o diesel', ctx.estadoTanque_('DIESEL S10', null).precoLitro === 8,
  'uma carga de Arla não pode mudar o preço do diesel');

console.log('\n7. A tela mostra o preço cobrado, e o médio ao lado');
montar();
const w = ctx.webCustoBomba('t', '2026-11-12');
ok('o campo que a tela lê traz o preço cobrado', w.custoMedio === 8, String(w.custoMedio));
ok('o custo médio do estoque vai junto, com nome próprio',
  w.custoMedioEstoque === 7, String(w.custoMedioEstoque));
ok('e a diferença também', w.diferencaValorizacao === 0, String(w.diferencaValorizacao));
ok('disponível segue o preço, não a média', w.disponivel === true);
ok('sem carga até a data, não está disponível',
  ctx.webCustoBomba('t', '2026-10-20').disponivel === false);

console.log('\n8. As duas simulações do tanque cobram igual');
// Este é o ponto da mudança. `estadoTanque_` valoriza na hora de gravar e
// `recalcularAbastecimentosInternos_` revaloriza quando uma carga é
// corrigida. Se uma cobrasse pela média e a outra pelo último preço, o
// valor gravado mudaria sozinho na próxima correção de carga.
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
function corpo(nome) {
  const m = fonte.match(new RegExp('function ' + nome + '\\([\\s\\S]*?\\n\\}'));
  return m ? m[0] : '';
}
const est = corpo('estadoTanque_');
const rec = corpo('recalcularAbastecimentosInternos_');
ok('as duas existem e foram achadas', est.length > 200 && rec.length > 200);
ok('as duas derivam o preço do mesmo lugar',
  /precoLitro = precoLitroCarga_\(m\.litros, m\.valor\)/.test(est) &&
  /precoLitro = precoLitroCarga_\(m\.litros, m\.valor\)/.test(rec),
  'duas divisões escritas à mão são duas chances de uma arredondar diferente');
ok('o recálculo valoriza pelo preço, não pela média',
  /const novo = Math\.round\(m\.litros \* precoLitro \* 100\) \/ 100/.test(rec),
  'se revalorizasse pela média, o valor gravado mudaria sozinho na próxima carga');
ok('e a gravação do lançamento também',
  /custoBomba = tanque\.precoLitro;/.test(fonte));
ok('o ajuste de estoque usa o mesmo preço',
  /const valorAjuste = Math\.round\(diferenca \* e\.precoLitro \* 100\) \/ 100/.test(fonte),
  'ajuste pela média e abastecimento pelo último preço saem do mesmo tanque a preços diferentes');
ok('nenhum consumidor ficou valorizando pela média',
  !/tanque\.custoMedio > 0/.test(fonte) && !/e\.custoMedio > 0/.test(fonte),
  (fonte.match(/\w+\.custoMedio > 0/g) || []).join(', '));

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
