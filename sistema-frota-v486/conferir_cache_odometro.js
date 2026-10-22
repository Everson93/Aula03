/**
 * Confere o cache de execucao do odometro.
 *
 * Duas coisas, e a segunda importa mais: que ele EVITE releituras, e que caia
 * quando alguem escreve. Um cache que serve a leitura anterior a uma gravacao
 * feita na mesma execucao e pior do que nao ter cache nenhum — o erro passa a
 * depender da ordem das chamadas, que ninguem consegue prever lendo o codigo.
 */
const fs = require('fs');
const vm = require('vm');

let leituras = 0;
const linhas = [
  [new Date(2026, 6, 1), 'ABC1D23', 100000],
  [new Date(2026, 6, 10), 'ABC1D23', 101000],
];

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
  Object.assign(globalThis, { lerOdometro_, invalidarCacheOdometro_, kmDoDia_, normalizaPlaca_ });
  __linhas = [];
  __leituras = 0;
  ss_ = function () {
    return { getSheetByName: function () {
      return {
        getLastRow: function () { return __linhas.length + 1; },
        getRange: function () {
          return { getValues: function () { __leituras++; return __linhas; } };
        },
      };
    } };
  };
`, ctx);
ctx.__linhas = linhas;

let falhas = 0;
const ck = (n, ok, d) => {
  console.log((ok ? '  OK   ' : '  FALHA') + ' ' + n + (d ? ' — ' + d : ''));
  if (!ok) falhas++;
};

console.log('--- o cache evita releitura ---');
ctx.__leituras = 0;
ctx.lerOdometro_(); ctx.lerOdometro_(); ctx.lerOdometro_();
ck('três chamadas, uma leitura da aba', ctx.__leituras === 1, ctx.__leituras + ' leitura(s)');
ck('devolve as linhas', ctx.lerOdometro_().length === 2);

console.log('');
console.log('--- invalidar força releitura ---');
ctx.invalidarCacheOdometro_();
ctx.lerOdometro_();
ck('releu depois de invalidar', ctx.__leituras === 2, ctx.__leituras + ' leitura(s)');

console.log('');
console.log('--- o perigo: gravação no meio da execução ---');
ctx.__leituras = 0;
ctx.invalidarCacheOdometro_();
ck('antes: 2 leituras conhecidas', ctx.lerOdometro_().length === 2);
// simula a gravação de uma leitura nova
ctx.__linhas = linhas.concat([[new Date(2026, 6, 20), 'ABC1D23', 102000]]);
ck('SEM invalidar, o cache esconde a linha nova',
   ctx.lerOdometro_().length === 2, 'serviria ' + ctx.lerOdometro_().length + ' de 3');
ctx.invalidarCacheOdometro_();
ck('COM invalidar, a linha nova aparece', ctx.lerOdometro_().length === 3);

console.log('');
console.log('--- todo ponto que escreve no odômetro invalida ---');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
// Escrita de DADO: a variavel da aba de odometro recebendo setValues/deleteRow.
// Cabecalho (linha 1) e escrita em OUTRA aba no mesmo trecho nao contam — foi o
// que a primeira versao deste teste confundiu, acusando quatro falsos positivos.
const escritas = [...fonte.matchAll(
  /\b(odo|odometro)\.(?:getRange\([^)]*\)\.setValues|deleteRow)\(/g)];
const semInvalidar = escritas.filter(m => {
  const depois = fonte.slice(m.index, m.index + 500);
  return !/invalidarCacheOdometro_\(\)/.test(depois);
});
ck('nenhuma escrita sem invalidação próxima', semInvalidar.length === 0,
   escritas.length + ' escrita(s) de dado, ' + semInvalidar.length + ' sem invalidar');

console.log('');
console.log('--- nenhum leitor varre a aba por fora ---');
const diretas = (fonte.match(/od(o|ometro)\.getRange\(2,\s*1,/g) || []).length;
ck('leitura direta só dentro de lerOdometro_', diretas <= 1, diretas + ' ocorrência(s)');

console.log('');
console.log(falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)');
process.exit(falhas === 0 ? 0 : 1);
