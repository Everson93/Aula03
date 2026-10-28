/**
 * Prova dos indices de execucao (IPVA por placa, odometro por placa+dia).
 *
 * Os dois trocaram "varrer tudo a cada consulta" por "varrer uma vez e
 * consultar mapa". O ganho e grande e o risco tambem: um indice que sobrevive
 * a mudanca dos dados responde com o passado, e ninguem ve. Por isso a prova
 * central nao e de velocidade — e de INVALIDACAO.
 */
const fs = require('fs');
const vm = require('vm');

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: () => '2026-07-01' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    gruposIpvaDaPlaca_, kmDoDia_, indiceIpvaPorPlaca_, indiceOdometroPorPlacaDia_,
    L_, TOTAL_COL_LANC, normalizaPlaca_, mesmoDia_,
  });
  exigirExecucaoLeitura_ = function () {};
  lerLancamentos_ = function () { return __lanc; };
  lerOdometro_ = function () { return __odo; };
`, ctx);
const D = vm.runInContext('(function (a,m,d) { return new Date(a,m,d); })', ctx);

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}
function lanc(placa, tipo, valor, obs, periodo) {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = D(2026, 6, 10);
  l[ctx.L_.PLACA] = placa; l[ctx.L_.TIPO] = tipo; l[ctx.L_.VALOR] = valor;
  l[ctx.L_.OBSERVACAO] = obs || ''; l[ctx.L_.PERIODO] = periodo || '2026-07';
  return l;
}

console.log('\n1. IPVA: o índice responde o mesmo que a varredura');
ctx.__lanc = [
  lanc('ABC 1D23', 'IPVA', 100, 'Parcela 1/12 IPVA-2026A', '2026-01'),
  lanc('ABC 1D23', 'IPVA', 100, 'Parcela 2/12 IPVA-2026A', '2026-02'),
  lanc('ABC 1D23', 'IPVA', 50, 'avulso sem grupo', '2026-03'),
  lanc('ABC 1D23', 'Combustivel Proprio', 900, '', '2026-01'),
  lanc('XYZ 9876', 'IPVA', 70, 'IPVA-2026B', '2026-01'),
];
let g = ctx.gruposIpvaDaPlaca_('ABC 1D23');
ok('agrupa pelo código IPVA-xxxx', g['IPVA-2026A'] && g['IPVA-2026A'].parcelas === 2,
  JSON.stringify(g));
ok('soma o valor do grupo', g['IPVA-2026A'].total === 200, JSON.stringify(g['IPVA-2026A']));
ok('guarda as competências', g['IPVA-2026A'].competencias.join(',') === '2026-01,2026-02',
  JSON.stringify(g['IPVA-2026A'].competencias));
ok('lançamento sem código vai para "(sem grupo)"', g['(sem grupo)'] && g['(sem grupo)'].total === 50,
  JSON.stringify(g));
ok('não mistura o que não é IPVA', !g['IPVA-2026B'] && Object.keys(g).length === 2, JSON.stringify(Object.keys(g)));
ok('não mistura placa de outro veículo',
  ctx.gruposIpvaDaPlaca_('XYZ 9876')['IPVA-2026B'].total === 70);
ok('placa sem IPVA devolve objeto vazio',
  JSON.stringify(ctx.gruposIpvaDaPlaca_('NAO 0000')) === '{}');
// normalizaPlaca_ troca o traço por espaço: 'abc-1d23' vira 'ABC 1D23'.
ok('a placa é normalizada (traço vira espaço, minúscula sobe)',
  ctx.gruposIpvaDaPlaca_('abc-1d23')['IPVA-2026A'].total === 200,
  JSON.stringify(ctx.gruposIpvaDaPlaca_('abc-1d23')));

console.log('\n2. IPVA: O ÍNDICE CAI QUANDO OS LANÇAMENTOS MUDAM');
ok('antes: duas parcelas', ctx.gruposIpvaDaPlaca_('ABC 1D23')['IPVA-2026A'].parcelas === 2);
ctx.__lanc = ctx.__lanc.concat([lanc('ABC 1D23', 'IPVA', 100, 'Parcela 3/12 IPVA-2026A', '2026-03')]);
ok('depois de lançar a terceira parcela, o índice acompanha',
  ctx.gruposIpvaDaPlaca_('ABC 1D23')['IPVA-2026A'].parcelas === 3,
  'ficou em ' + ctx.gruposIpvaDaPlaca_('ABC 1D23')['IPVA-2026A'].parcelas + ' — índice velho respondendo');
ctx.__lanc = [];
ok('e esvaziar os lançamentos esvazia o índice',
  JSON.stringify(ctx.gruposIpvaDaPlaca_('ABC 1D23')) === '{}');

console.log('\n3. IPVA: o resultado é cópia');
ctx.__lanc = [lanc('ABC 1D23', 'IPVA', 100, 'IPVA-2026A', '2026-01')];
const g1 = ctx.gruposIpvaDaPlaca_('ABC 1D23');
g1['IPVA-2026A'].total = 999999;
g1['IPVA-2026A'].competencias.push('LIXO');
const g2 = ctx.gruposIpvaDaPlaca_('ABC 1D23');
ok('mexer no total devolvido não envenena o índice', g2['IPVA-2026A'].total === 100, String(g2['IPVA-2026A'].total));
ok('nem mexer na lista de competências', g2['IPVA-2026A'].competencias.length === 1,
  JSON.stringify(g2['IPVA-2026A'].competencias));
// Sem o prefixo na chave, mapa['__proto__'] devolve o protótipo do Object e o
// código segue lendo propriedades dele. Tem de reprovar, não rebentar.
let proto;
try { proto = JSON.stringify(ctx.gruposIpvaDaPlaca_('__proto__')); }
catch (e) { proto = 'LANÇOU: ' + e.message; }
ok('uma placa "__proto__" não alcança o protótipo', proto === '{}', String(proto));
let ctor;
try { ctor = JSON.stringify(ctx.gruposIpvaDaPlaca_('constructor')); }
catch (e) { ctor = 'LANÇOU: ' + e.message; }
ok('nem uma placa "constructor"', ctor === '{}', String(ctor));

console.log('\n4. Odômetro: a regra da leitura única é preservada');
ctx.__odo = [
  [D(2026, 6, 10), 'ABC 1D23', 51000],
  [D(2026, 6, 11), 'ABC 1D23', 51200],
  [D(2026, 6, 10), 'XYZ 9876', 30000],
  [D(2026, 6, 12), 'DUP 0001', 1000],
  [D(2026, 6, 12), 'DUP 0001', 1100],
];
ok('leitura única devolve o km', ctx.kmDoDia_('ABC 1D23', D(2026, 6, 10)) === 51000,
  String(ctx.kmDoDia_('ABC 1D23', D(2026, 6, 10))));
ok('o outro dia devolve o outro km', ctx.kmDoDia_('ABC 1D23', D(2026, 6, 11)) === 51200);
ok('DUAS leituras no mesmo dia são ambíguas e devolvem vazio',
  ctx.kmDoDia_('DUP 0001', D(2026, 6, 12)) === '',
  'devolveu ' + ctx.kmDoDia_('DUP 0001', D(2026, 6, 12)) + ' — a ambiguidade tem de continuar sendo ambiguidade');
ok('dia sem leitura devolve vazio', ctx.kmDoDia_('ABC 1D23', D(2026, 6, 20)) === '');
ok('placa sem leitura devolve vazio', ctx.kmDoDia_('NAO 0000', D(2026, 6, 10)) === '');
ok('data que não é Date devolve vazio', ctx.kmDoDia_('ABC 1D23', '10/07/2026') === '');
ok('data nula devolve vazio', ctx.kmDoDia_('ABC 1D23', null) === '');
ok('placa normalizada (traço vira espaço)', ctx.kmDoDia_('abc-1d23', D(2026, 6, 10)) === 51000,
  String(ctx.kmDoDia_('abc-1d23', D(2026, 6, 10))));
ok('não confunde dias de meses diferentes',
  ctx.kmDoDia_('ABC 1D23', D(2026, 5, 10)) === '');
ok('nem de anos diferentes', ctx.kmDoDia_('ABC 1D23', D(2025, 6, 10)) === '');

console.log('\n5. Odômetro: O ÍNDICE CAI QUANDO AS LEITURAS MUDAM');
ok('antes: 51000', ctx.kmDoDia_('ABC 1D23', D(2026, 6, 10)) === 51000);
ctx.__odo = [[D(2026, 6, 10), 'ABC 1D23', 52000]];
ok('depois de corrigir a leitura, devolve a nova',
  ctx.kmDoDia_('ABC 1D23', D(2026, 6, 10)) === 52000,
  'devolveu ' + ctx.kmDoDia_('ABC 1D23', D(2026, 6, 10)) + ' — índice velho respondendo');
ctx.__odo = ctx.__odo.concat([[D(2026, 6, 10), 'ABC 1D23', 52500]]);
ok('e lançar uma segunda leitura no dia volta a ser ambíguo',
  ctx.kmDoDia_('ABC 1D23', D(2026, 6, 10)) === '');
ctx.__odo = [];
ok('sem leituras, vazio', ctx.kmDoDia_('ABC 1D23', D(2026, 6, 10)) === '');

console.log('\n6. Linha a linha vale o mesmo que o índice');
// Prova cruzada: para uma base sortida, o índice tem de concordar com a
// varredura ingênua em TODA combinação de placa e dia.
ctx.__odo = [];
const placas = ['AAA 0001', 'BBB 0002', 'CCC 0003'];
for (let i = 0; i < 60; i++) {
  ctx.__odo.push([D(2026, 6, (i % 10) + 1), placas[i % 3], 1000 + i]);
}
let divergiu = '';
placas.forEach(function (p) {
  for (let dia = 1; dia <= 12; dia++) {
    const data = D(2026, 6, dia);
    const ingenuo = ctx.__odo.filter(function (o) {
      return ctx.normalizaPlaca_(o[1]) === ctx.normalizaPlaca_(p) && ctx.mesmoDia_(o[0], data);
    });
    const esperado = ingenuo.length === 1 ? Number(ingenuo[0][2]) || '' : '';
    const obtido = ctx.kmDoDia_(p, data);
    if (esperado !== obtido) divergiu = p + ' dia ' + dia + ': esperado ' + esperado + ', obtido ' + obtido;
  }
});
ok('índice e varredura ingênua concordam em 36 combinações', divergiu === '', divergiu);

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
