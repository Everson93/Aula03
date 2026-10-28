/**
 * Banco de desempenho dos modulos, com dados sinteticos do tamanho da frota.
 *
 * Nao substitui medir na planilha: aqui nao ha I/O de Sheets, que e lento e
 * domina tudo. O que isto mede e o CUSTO DE CPU em JavaScript puro — e e
 * exatamente ali que mora o custo quadratico, o unico que piora sozinho
 * conforme a base cresce. Um numero que dobra quando os lancamentos dobram
 * e um problema; um numero que fica igual nao e.
 *
 *   node medir_modulos.js [veiculos] [lancamentos] [odometros]
 */
const fs = require('fs');
const vm = require('vm');

const VEICULOS = Number(process.argv[2] || 170);
const LANCAMENTOS = Number(process.argv[3] || 20000);
const ODOMETROS = Number(process.argv[4] || 8000);

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: (d) => '2026-07-01' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  MailApp: { getRemainingDailyQuota: () => 100, sendEmail: () => {} },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    gruposIpvaDaPlaca_, kmDoDia_, classificacaoVeiculoAtual_, resolverVeiculo_,
    alertasConsumo_, alertasOdometroEIpva_, alertasManutencao_, mediana_,
    classificacaoVeiculoAtualSemMemo_,
    calcularLinhasResumo_, custoVariavelResumo_,
    COL_VEIC, L_, R_, TOTAL_COL_LANC, TOTAL_COL_VEIC, TOTAL_COL_RESUMO,
    normalizaPlaca_,
  });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  registrarLog_ = function () {};
  param_ = function (n) { if (n === 'DIA_FIM_PERIODO') return 25; if (n === 'DIA_INICIO_PERIODO') return 26; return '2026-07'; };
  paramOuPadrao_ = function (n, p) { return p; };
  dadosVeiculosExecucao_ = function () { return __veic; };
  lerLancamentos_ = function () { return __lanc; };
  lerOdometro_ = function () { return __odo; };
  lerResumo_ = function () { return __resumo; };
  estadoTanque_ = function () { return { litros: 9999, valor: 0, custoMedio: 0, litrosSemLastro: 0 }; };
  contarPendenciasConferencia_ = function () { return 0; };
  lerComprovantes_ = function () { return []; };
  periodoAtual_ = function () { return { inicio: new Date(2026, 6, 1), fim: new Date(2026, 6, 31) }; };
  periodoDoMes_ = function () { return { inicio: new Date(2026, 6, 1), fim: new Date(2026, 6, 31) }; };
  formatarData_ = function () { return '01/07/2026'; };
  // Zera TUDO que e cache de execucao. Esquecer um indice aqui mede indice
  // quente e esconde o custo de construi-lo — a medida sairia lisonjeando a
  // propria mudanca que deveria julgar.
  globalThis.__zerarCaches = function () {
    VEICULOS_EXEC_CACHE_ = null;
    if (typeof CLASSIF_MEMO_EXEC_ !== 'undefined') CLASSIF_MEMO_EXEC_ = null;
    if (typeof IPVA_INDICE_EXEC_ !== 'undefined') IPVA_INDICE_EXEC_ = null;
    if (typeof ODOMETRO_INDICE_EXEC_ !== 'undefined') ODOMETRO_INDICE_EXEC_ = null;
  };
`, ctx);

const D = vm.runInContext('(function (a,m,d) { return new Date(a,m,d); })', ctx);

function placaDe(i) { return 'AAA' + (1000 + (i % VEICULOS)); }

ctx.__veic = [];
for (let i = 0; i < VEICULOS; i++) {
  const l = new Array(ctx.TOTAL_COL_VEIC).fill('');
  l[ctx.COL_VEIC.PLACA - 1] = placaDe(i);
  l[ctx.COL_VEIC.CODIGO - 1] = 'P' + i;
  l[ctx.COL_VEIC.DESCRICAO - 1] = 'Veiculo ' + i;
  l[ctx.COL_VEIC.CATEGORIA - 1] = ['Leve', 'Carreta Normal', 'Truck Normal', 'Moto'][i % 4];
  l[ctx.COL_VEIC.CENTRO - 1] = 'LOJA ' + (i % 8);
  l[ctx.COL_VEIC.ATIVO - 1] = 'SIM';
  l[ctx.COL_VEIC.IPVA - 1] = 1200;
  l[ctx.COL_VEIC.DEPRECIACAO - 1] = 300;
  ctx.__veic.push(l);
}
ctx.__lanc = [];
for (let i = 0; i < LANCAMENTOS; i++) {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = D(2026, 6, (i % 28) + 1);
  l[ctx.L_.PLACA] = placaDe(i);
  l[ctx.L_.TIPO] = i % 7 === 0 ? 'IPVA' : 'Combustivel Proprio';
  l[ctx.L_.VALOR] = 100 + (i % 500);
  l[ctx.L_.LITROS] = 50;
  l[ctx.L_.OBSERVACAO] = i % 7 === 0 ? 'Parcela IPVA-2026A' : '';
  l[ctx.L_.PERIODO] = '2026-07';
  l.linhaPlanilha = i + 2;
  ctx.__lanc.push(l);
}
ctx.__odo = [];
for (let i = 0; i < ODOMETROS; i++) {
  ctx.__odo.push([D(2026, 6, (i % 28) + 1), placaDe(i), 10000 + i]);
}
ctx.__resumo = [];
for (let i = 0; i < VEICULOS; i++) {
  const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
  l[ctx.R_.PLACA] = placaDe(i);
  l[ctx.R_.CATEGORIA] = ['Leve', 'Carreta Normal', 'Truck Normal', 'Moto'][i % 4];
  l[ctx.R_.KM] = 2000 + (i % 500);
  l[ctx.R_.LITROS] = 250;
  l[ctx.R_.COMBUSTIVEL] = 1800;
  l[ctx.R_.OFICINA] = i % 20 === 0 ? 3000 : 200;
  l[ctx.R_.TOTAL] = 2000;
  l[ctx.R_.KM_LITRO] = 8;
  l[ctx.R_.RS_KM] = 1;
  ctx.__resumo.push(l);
}

function medir(nome, fn, vezes) {
  vezes = vezes || 1;
  ctx.__zerarCaches();
  try { fn(); } catch (e) { console.log(pad(nome) + '  — não mediu: ' + e.message); return null; }
  ctx.__zerarCaches();
  let soma = 0n;
  for (let i = 0; i < vezes; i++) {
    ctx.__zerarCaches();          // cada volta parte de execucao limpa
    const t0 = process.hrtime.bigint();
    fn();
    soma += process.hrtime.bigint() - t0;
  }
  const ms = Number(soma) / 1e6 / vezes;
  console.log(pad(nome) + '  ' + ms.toFixed(1).padStart(9) + ' ms');
  return ms;
}
function pad(s) { return (s + ' ').padEnd(46, '.'); }

console.log('Frota sintética: ' + VEICULOS + ' veículos, ' +
  LANCAMENTOS + ' lançamentos, ' + ODOMETROS + ' odômetros\n');
const r = {};

console.log('— IPVA');
r.ipvaUma = medir('gruposIpvaDaPlaca_ (uma placa)', function () {
  ctx.gruposIpvaDaPlaca_('AAA1005');
}, 20);
r.ipvaTodas = medir('IPVA de toda a frota (o que a tela faz)', function () {
  ctx.__veic.forEach(function (v) { ctx.gruposIpvaDaPlaca_(v[ctx.COL_VEIC.PLACA - 1]); });
});

console.log('\n— Odômetro');
r.kmUm = medir('kmDoDia_ (uma consulta)', function () {
  ctx.kmDoDia_('AAA1005', D(2026, 6, 10));
}, 20);
r.km300 = medir('kmDoDia_ × 300 (tela de correção)', function () {
  for (let i = 0; i < 300; i++) ctx.kmDoDia_(placaDe(i), D(2026, 6, (i % 28) + 1));
});

console.log('\n— Classificação de veículo');
r.classUma = medir('classificacaoVeiculoAtual_ (placa nova)', function () {
  ctx.__zerarCaches();
  ctx.classificacaoVeiculoAtual_('AAA1005');
}, 20);
r.classFrota = medir('classificação da frota inteira', function () {
  ctx.__veic.forEach(function (v) { ctx.classificacaoVeiculoAtual_(v[ctx.COL_VEIC.PLACA - 1]); });
});
r.classFrotaSem = medir('  idem, SEM memo (comparação)', function () {
  ctx.__veic.forEach(function (v) { ctx.classificacaoVeiculoAtualSemMemo_(v[ctx.COL_VEIC.PLACA - 1]); });
});
r.classRepetidaSem = medir('mesma placa × 1000, SEM memo', function () {
  for (let i = 0; i < 1000; i++) ctx.classificacaoVeiculoAtualSemMemo_('AAA1005');
});
r.classRepetida = medir('mesma placa × 1000 (memo)', function () {
  for (let i = 0; i < 1000; i++) ctx.classificacaoVeiculoAtual_('AAA1005');
});

console.log('\n— Alerta diário');
r.consumo = medir('alertasConsumo_', function () { ctx.alertasConsumo_(); });
r.manut = medir('alertasManutencao_', function () { ctx.alertasManutencao_(); });
r.odoIpva = medir('alertasOdometroEIpva_', function () { ctx.alertasOdometroEIpva_(); });

console.log('\n— Resumo');
r.resumo = medir('calcularLinhasResumo_', function () { ctx.calcularLinhasResumo_(); });

const total = Object.keys(r).reduce(function (s, k) { return s + (r[k] || 0); }, 0);
console.log('\nSoma das medidas: ' + total.toFixed(1) + ' ms');
