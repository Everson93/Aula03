/**
 * Cache da apuracao de competencia passada.
 *
 * Trocar o mes no Rateio ou no Orcamento recalculava varrendo a base inteira a
 * cada clique. O resultado e um mapa de ~30 centros — cabe folgado no cache.
 *
 * A prova que manda nao e "ficou rapido": e que o numero do cache e IDENTICO ao
 * recalculado. Cache que devolve numero diferente e pior que cache nenhum,
 * porque o erro aparece so na divisao entre as lojas, que e exatamente onde
 * ninguem confere.
 *
 * A segunda: qualquer escrita invalida. Nao da para enumerar chaves no
 * CacheService, entao a validade vem de uma GERACAO no nome da chave — basta
 * ela avancar e todas as chaves antigas viram inalcancaveis de uma vez.
 */
const fs = require('fs');
const vm = require('vm');

const CACHE = {};
let LEITURAS_DA_BASE = 0;
const LOG_ERRO = [];
const PROPS = {};

const ctx = {
  console: { log: console.log, error: (m) => LOG_ERRO.push(String(m)) },
  PropertiesService: {
    getDocumentProperties: () => ({
      getProperty: (k) => (PROPS[k] === undefined ? null : PROPS[k]),
      setProperty: (k, v) => { PROPS[k] = v; },
      deleteProperty: (k) => { delete PROPS[k]; },
    }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: () => '' },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => (CACHE[k] === undefined ? null : CACHE[k]),
      put: (k, v) => { if (String(v).length > 100000) throw new Error('too large'); CACHE[k] = v; },
      remove: (k) => { delete CACHE[k]; },
    }),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    custoDiretoPorCentro_, geracaoBase_, avancarGeracaoBase_, guardarNoCache_,
    invalidarCacheInicio_, apurarRateio_, R_, TOTAL_COL_RESUMO,
    PROP_GERACAO_BASE_, LIMITE_CACHE_BYTES_, CACHE_APURACAO_PREFIXO_,
  });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  invalidarCacheBootstrap_ = function () {};
  invalidarCacheSaude_ = function () {};
  invalidarCacheLancamentos_ = function () {};
  invalidarCacheFornecedores_ = function () {};
  invalidarCacheOdometro_ = function () {};
  invalidarCacheRateioMensal_ = function () {};
  invalidarCacheOrcamento_ = function () {};
  invalidarCacheComprovantes_ = function () {};
  normalizarCentroCusto_ = function (v) { return String(v || '').trim(); };
  periodoDoMes_ = function (m) { return { mesRef: m, inicio: new Date(), fim: new Date() }; };
  lerResumo_ = function () { return __resumoCorrente; };
  calcularLinhasResumo_ = function (p) { __leituras++; return __resumoPorMes[p.mesRef] || []; };
  __leituras = 0;
`, ctx, { filename: 'Codigo.gs' });

ctx.param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-11' : ''; };

function linha(centro, total) {
  const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
  l[ctx.R_.CENTRO] = centro;
  l[ctx.R_.TOTAL] = total;
  return l;
}
ctx.__resumoCorrente = [linha('Loja 01', 1000), linha('DEPÓSITO', 5000)];
ctx.__resumoPorMes = {
  '2026-09': [linha('Loja 01', 2500.55), linha('Loja 02', 1200.10), linha('DEPÓSITO', 9000)],
  '2026-08': [linha('Loja 01', 777), linha('DEPÓSITO', 100)],
};

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}
function zerar() {
  Object.keys(CACHE).forEach(function (k) { delete CACHE[k]; });
  Object.keys(PROPS).forEach(function (k) { delete PROPS[k]; });
  LOG_ERRO.length = 0;
  ctx.__leituras = 0;
  vm.runInContext('GERACAO_BASE_EXEC_ = null; GERACAO_JA_AVANCADA_ = false;', ctx);
}
function leituras() { return ctx.__leituras; }

console.log('\n1. Competência aberta não passa pelo cache de apuração');
zerar();
let r = ctx.custoDiretoPorCentro_('2026-11');
ok('vem do Resumo, não de calcularLinhasResumo_', leituras() === 0, String(leituras()));
ok('marcada como não aproximada', r.aproximado === false);
ok('e nada foi parar no cache de apuração',
  Object.keys(CACHE).filter(function (k) { return k.indexOf(ctx.CACHE_APURACAO_PREFIXO_) === 0; }).length === 0,
  JSON.stringify(Object.keys(CACHE)));

console.log('\n2. Competência passada: calcula uma vez, depois vem do cache');
zerar();
const primeira = ctx.custoDiretoPorCentro_('2026-09');
ok('a primeira varre a base', leituras() === 1, String(leituras()));
ok('e não é cacheHit', primeira.cacheHit === false);
const segunda = ctx.custoDiretoPorCentro_('2026-09');
ok('a segunda NÃO varre de novo', leituras() === 1, String(leituras()) + ' varredura(s)');
ok('e é cacheHit', segunda.cacheHit === true, JSON.stringify(segunda));

console.log('\n3. A PROVA QUE MANDA: o número é idêntico');
ok('centro por centro, sem diferença',
  JSON.stringify(primeira.direto) === JSON.stringify(segunda.direto),
  JSON.stringify(primeira.direto) + '\n        ' + JSON.stringify(segunda.direto));
ok('os centavos sobrevivem ao JSON', segunda.direto['Loja 01'] === 2500.55,
  String(segunda.direto['Loja 01']));
ok('o total bate com a soma do Resumo daquele mês',
  Object.keys(segunda.direto).reduce(function (t, k) { return t + segunda.direto[k]; }, 0) ===
  ctx.__resumoPorMes['2026-09'].reduce(function (t, l) { return t + l[ctx.R_.TOTAL]; }, 0));

console.log('\n4. Meses diferentes não se misturam');
zerar();
const set = ctx.custoDiretoPorCentro_('2026-09');
const ago = ctx.custoDiretoPorCentro_('2026-08');
ok('agosto tem o número de agosto', ago.direto['Loja 01'] === 777, JSON.stringify(ago.direto));
ok('setembro continua com o dele', set.direto['Loja 01'] === 2500.55);
ok('duas chaves distintas no cache',
  Object.keys(CACHE).filter(function (k) { return k.indexOf('APUR_') === 0; }).length === 2,
  JSON.stringify(Object.keys(CACHE)));

console.log('\n5. Qualquer escrita invalida tudo');
zerar();
ctx.custoDiretoPorCentro_('2026-09');
ok('entrou no cache', leituras() === 1);
ctx.custoDiretoPorCentro_('2026-09');
ok('segunda vez não recalcula', leituras() === 1);
// uma gravação qualquer no sistema passa por aqui
vm.runInContext('GERACAO_JA_AVANCADA_ = false;', ctx);   // nova execução
ctx.invalidarCacheInicio_();
vm.runInContext('GERACAO_BASE_EXEC_ = null;', ctx);
const depois = ctx.custoDiretoPorCentro_('2026-09');
ok('depois da escrita, recalcula', leituras() === 2, String(leituras()));
ok('e não veio do cache', depois.cacheHit === false);

console.log('\n6. A geração avança uma vez só por execução');
zerar();
ctx.custoDiretoPorCentro_('2026-09');
const antes = PROPS[ctx.PROP_GERACAO_BASE_];
ctx.invalidarCacheInicio_();
ctx.invalidarCacheInicio_();
ctx.invalidarCacheInicio_();
ok('três invalidações, uma escrita de propriedade',
  Number(PROPS[ctx.PROP_GERACAO_BASE_]) === Number(antes || 0) + 1,
  'de ' + antes + ' para ' + PROPS[ctx.PROP_GERACAO_BASE_] +
  ' — 25 caminhos chamam isso; sem a trava seriam 25 escritas');

console.log('\n7. Sem a propriedade, nunca acerta o cache (falha segura)');
zerar();
const propsQuebradas = { getProperty: function () { throw new Error('sem acesso'); },
  setProperty: function () { throw new Error('sem acesso'); } };
const originalProps = ctx.PropertiesService.getDocumentProperties;
ctx.PropertiesService.getDocumentProperties = function () { return propsQuebradas; };
ctx.custoDiretoPorCentro_('2026-09');
vm.runInContext('GERACAO_BASE_EXEC_ = null;', ctx);
ctx.custoDiretoPorCentro_('2026-09');
ok('recalcula sempre em vez de arriscar número velho', leituras() === 2, String(leituras()));
ok('e não deixa chave órfã no cache',
  Object.keys(CACHE).filter(function (k) { return k.indexOf('APUR_') === 0; }).length === 0,
  JSON.stringify(Object.keys(CACHE)) +
  ' — a 1ª versão gerava chave com Date.now(), que colide no mesmo milissegundo ' +
  'e ainda enchia o cache de entradas inalcançáveis');
ok('e avisa no log', LOG_ERRO.some(function (m) { return /não será cacheada/.test(m); }),
  JSON.stringify(LOG_ERRO));
ctx.PropertiesService.getDocumentProperties = originalProps;

console.log('\n8. Cache grande demais avisa em vez de sumir calado');
zerar();
const gigante = {};
for (let i = 0; i < 9000; i++) gigante['centro-com-nome-longo-numero-' + i] = i * 1.37;
const guardou = ctx.guardarNoCache_('X', gigante, 60, 'teste');
ok('não guarda', guardou === false);
ok('e registra o motivo com o tamanho',
  LOG_ERRO.some(function (m) { return /KB passa do limite/.test(m); }), JSON.stringify(LOG_ERRO));
ok('objeto pequeno guarda normalmente',
  ctx.guardarNoCache_('Y', { a: 1 }, 60, 'teste') === true);

console.log('\n9. apurarRateio_ continua fechando com o Resumo do mês');
zerar();
ctx.listaCentros_ = function () { return []; };
const totalResumo = ctx.__resumoPorMes['2026-09'].reduce(function (t, l) { return t + l[ctx.R_.TOTAL]; }, 0);
const d1 = ctx.custoDiretoPorCentro_('2026-09').direto;
const d2 = ctx.custoDiretoPorCentro_('2026-09').direto;   // agora do cache
[['recalculado', d1], ['do cache', d2]].forEach(function (par) {
  const soma = Object.keys(par[1]).reduce(function (t, k) { return t + par[1][k]; }, 0);
  ok('total ' + par[0] + ' fecha com o Resumo', Math.abs(soma - totalResumo) < 0.005,
    soma + ' x ' + totalResumo);
});

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
