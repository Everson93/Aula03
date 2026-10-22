/**
 * Confere o aquecimento de cache (V4.8.7).
 *
 * Nasceu de uma medicao real: servidor 3.259 ms = login 956 + estrutura 896 +
 * painel 1.187, os tres por ERRO DE CACHE. Os 2.083 ms de estrutura e painel
 * eram recalculo que o primeiro usuario da manha pagava sozinho.
 *
 * O que precisa ficar travado: que o gatilho realmente reaqueca os dois caches,
 * que uma falha num deles nao derrube o outro, e que o TTL seja MAIOR que o
 * intervalo do gatilho — TTL menor que o intervalo deixa buraco, e o aquecimento
 * viraria enfeite.
 */
const fs = require('fs');
const vm = require('vm');

function montar(falhar) {
  const chamadas = [];
  const ctx = {
    console: { log(){}, error(){} },
    PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
                         getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => null },
    Utilities: { getUuid: () => 'x' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    ScriptApp: { getProjectTriggers: () => [] },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
    Object.assign(globalThis, {
      aquecerCachesAgendado_, CACHE_INICIO_SEGUNDOS_, CACHE_BOOTSTRAP_META_SEGUNDOS_,
      FUNCAO_AQUECER_CACHES_,
    });
    __chamadas = [];
    __falhar = ${JSON.stringify(falhar || '')};
    bootstrapMetaComCache_ = function (f) {
      __chamadas.push('meta:' + f);
      if (__falhar === 'meta') throw new Error('falha simulada na meta');
      return { ok: true };
    };
    dadosInicioComCache_ = function (f) {
      __chamadas.push('inicio:' + f);
      if (__falhar === 'inicio') throw new Error('falha simulada no início');
      return { ok: true };
    };
  `, ctx);
  return ctx;
}

let falhas = 0;
const ck = (n, ok, d) => {
  console.log((ok ? '  OK   ' : '  FALHA') + ' ' + n + (d ? ' — ' + d : ''));
  if (!ok) falhas++;
};

console.log('--- o gatilho reaquece os dois caches, forçando o recálculo ---');
let ctx = montar();
const n = ctx.aquecerCachesAgendado_();
ck('aqueceu os dois', n === 2, n + ' de 2');
ck('forçou a atualização (não aceitou cache velho)',
  ctx.__chamadas.join(',') === 'meta:true,inicio:true', ctx.__chamadas.join(', '));

console.log('');
console.log('--- falha num cache não impede o outro ---');
ctx = montar('meta');
ck('meta falhou, início aqueceu', ctx.aquecerCachesAgendado_() === 1 &&
  ctx.__chamadas.indexOf('inicio:true') !== -1, ctx.__chamadas.join(', '));
ctx = montar('inicio');
ck('início falhou, meta aqueceu', ctx.aquecerCachesAgendado_() === 1 &&
  ctx.__chamadas.indexOf('meta:true') !== -1, ctx.__chamadas.join(', '));

console.log('');
console.log('--- o TTL cobre o intervalo do gatilho ---');
ctx = montar();
const INTERVALO = 5 * 60;   // o gatilho roda a cada 5 min
ck('TTL do painel > intervalo', ctx.CACHE_INICIO_SEGUNDOS_ > INTERVALO,
  ctx.CACHE_INICIO_SEGUNDOS_ + 's vs ' + INTERVALO + 's');
ck('TTL da estrutura > intervalo', ctx.CACHE_BOOTSTRAP_META_SEGUNDOS_ > INTERVALO,
  ctx.CACHE_BOOTSTRAP_META_SEGUNDOS_ + 's vs ' + INTERVALO + 's');
ck('com folga de pelo menos uma passagem perdida',
  ctx.CACHE_INICIO_SEGUNDOS_ >= INTERVALO * 2 &&
  ctx.CACHE_BOOTSTRAP_META_SEGUNDOS_ >= INTERVALO * 2,
  'um atraso do Google não deixa buraco');

console.log('');
console.log('--- o gatilho está declarado com o nome da função real ---');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ck('FUNCAO_AQUECER_CACHES_ aponta para função existente',
  fonte.indexOf('function ' + ctx.FUNCAO_AQUECER_CACHES_ + '(') !== -1,
  ctx.FUNCAO_AQUECER_CACHES_);
ck('criado a cada 5 minutos', /FUNCAO_AQUECER_CACHES_\)\.timeBased\(\)\.everyMinutes\(5\)/.test(fonte));
ck('entra no garantirAutomacoesSistema_', /aquecimentoCriado: garantirTriggerAquecerCaches_\(\)/.test(fonte));

console.log('');
console.log(falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)');
process.exit(falhas === 0 ? 0 : 1);
