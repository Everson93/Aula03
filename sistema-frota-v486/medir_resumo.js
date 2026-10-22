/**
 * Mede onde o tempo vai no calculo do Resumo.
 *
 * Mede em vez de supor: o Resumo deixou de ser formula e virou JS, entao a
 * intuicao da versao antiga (varredura de SUMIFS) nao vale mais. O gargalo
 * agora, se existir, esta no laco sobre os lancamentos.
 */
const fs = require('fs');
const vm = require('vm');

const VEICULOS = Number(process.argv[2] || 170);
const LANCAMENTOS = Number(process.argv[3] || 20000);
const ODOMETROS = Number(process.argv[4] || 8000);

const ctx = {
  console,
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    calcularLinhasResumo_, normalizaPlaca_, periodoDoMes_, COL_VEIC, L_, R_,
    TOTAL_COL_LANC, TIPOS_DESPESA,
  });
  exigirExecucaoLeitura_ = function () {};
  param_ = function (n) { if (n === 'DIA_FIM_PERIODO') return 25; return '2026-07'; };
  __veic = []; __lanc = []; __odo = [];
  dadosVeiculosExecucao_ = function () { return __veic; };
  lerLancamentos_ = function () { return __lanc; };
  lerOdometro_ = function () { return __odo; };
  ss_ = function () { return { getSheetByName: function () { return { getLastRow: function () { return 2; } }; } }; };
`, ctx);

const D = vm.runInContext('Date', ctx);
const placa = i => 'ABC' + String(1000 + i).slice(-4);

ctx.__veic = Array.from({ length: VEICULOS }, (_, i) => {
  const v = new Array(20).fill('');
  v[ctx.COL_VEIC.PLACA - 1] = placa(i);
  v[ctx.COL_VEIC.DESCRICAO - 1] = 'Veiculo ' + i;
  v[ctx.COL_VEIC.CATEGORIA - 1] = 'Pesado';
  v[ctx.COL_VEIC.CENTRO - 1] = 'LOJA ' + (i % 30);
  return v;
});

const tipos = ['Combustivel Proprio', 'Oficina Despesa', 'Pneus', 'Multa', 'Diaria/Pedagio'];
ctx.__lanc = Array.from({ length: LANCAMENTOS }, (_, i) => {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = new D(2026, 6, 1 + (i % 24));
  l[ctx.L_.PLACA] = placa(i % VEICULOS);
  l[ctx.L_.TIPO] = tipos[i % tipos.length];
  l[ctx.L_.VALOR] = 100 + (i % 500);
  l[ctx.L_.LITROS] = 50;
  return l;
});
ctx.__odo = Array.from({ length: ODOMETROS }, (_, i) =>
  [new D(2026, 6, 1 + (i % 24)), placa(i % VEICULOS), 100000 + i * 7]);

function medir(nome, fn, voltas) {
  const n = voltas || 5;
  fn();                                   // aquece
  const t = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn();
  const ms = Number(process.hrtime.bigint() - t) / 1e6 / n;
  console.log('  ' + nome.padEnd(42) + ms.toFixed(1).padStart(8) + ' ms');
  return ms;
}

console.log('cenário: ' + VEICULOS + ' veículos, ' + LANCAMENTOS.toLocaleString('pt-BR') +
  ' lançamentos, ' + ODOMETROS.toLocaleString('pt-BR') + ' leituras');
console.log('');
console.log('--- tempo de CPU (sem o custo das chamadas ao Sheets) ---');
const periodo = ctx.periodoDoMes_('2026-07');
const total = medir('calcularLinhasResumo_ (completo)', () => ctx.calcularLinhasResumo_(periodo));

// quanto disso e so normalizaPlaca_?
const placas = ctx.__lanc.map(l => l[ctx.L_.PLACA]);
const normal = medir('normalizaPlaca_ × ' + LANCAMENTOS.toLocaleString('pt-BR'),
  () => { for (let i = 0; i < placas.length; i++) ctx.normalizaPlaca_(placas[i]); });
const placasOdo = ctx.__odo.map(o => o[1]);
const normalOdo = medir('normalizaPlaca_ × ' + ODOMETROS.toLocaleString('pt-BR') + ' (odômetro)',
  () => { for (let i = 0; i < placasOdo.length; i++) ctx.normalizaPlaca_(placasOdo[i]); });

console.log('');
console.log('--- onde o tempo está ---');
const pct = v => (v / total * 100).toFixed(0) + '%';
console.log('  normalizar placa (lançamentos + odômetro)   ' +
  (normal + normalOdo).toFixed(1).padStart(8) + ' ms   ' + pct(normal + normalOdo));
console.log('  o resto do cálculo                          ' +
  (total - normal - normalOdo).toFixed(1).padStart(8) + ' ms   ' + pct(total - normal - normalOdo));
