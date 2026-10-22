/**
 * Prova de ponta a ponta: lancar o IPVA anual e conferir que cada competencia
 * recebe UMA parcela, e que as 12 somam a guia.
 *
 * Testa o que o teste de unidade nao alcanca: que a parcela cai dentro do
 * periodo certo. Uma parcela gravada no ultimo dia da competencia e um corte de
 * periodo que termina nesse mesmo dia sao faceis de errar por um dia.
 */
const fs = require('fs');
const vm = require('vm');

const LANC = [];          // a "aba" Lancamentos
const ctx = {
  console,
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'f1e2d3c4-0000' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    lancarIpvaAnual_, calcularLinhasResumo_, periodoDoMes_, R_, L_,
    TOTAL_COL_RESUMO, somarMesesCompetencia_, PARCELAS_IPVA_,
  });
  __lanc = [];
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  param_ = function (n) { if (n === 'DIA_FIM_PERIODO') return 25; if (n === 'MES_REFERENCIA') return '2026-07'; return ''; };
  resolverVeiculo_ = function () { return { ok: true, veiculo: { placa: 'ABC1D23', ativo: true } }; };
  classificacaoVeiculoAtual_ = function () { return { centro: 'DEPÓSITO', categoria: 'Pesado' }; };
  novoIdLancamento_ = function () { return 'LAN-' + (__lanc.length + 1); };
  lerLancamentos_ = function () { return __lanc; };
  quantidadeLancamentosReais_ = function () { return __lanc.length; };
  proximaLinhaLancamento_ = function () { return __lanc.length + 2; };
  garantirCapacidadeLancamentos_ = function () {};
  invalidarCacheInicio_ = function () {};
  atualizarResumoSeguro_ = function () {};
  registrarLog_ = function () {};
  dadosVeiculosExecucao_ = function () {
    var v = new Array(20).fill('');
    v[COL_VEIC.PLACA - 1] = 'ABC1D23';
    v[COL_VEIC.DESCRICAO - 1] = 'Caminhao teste';
    v[COL_VEIC.CATEGORIA - 1] = 'Pesado';
    v[COL_VEIC.CENTRO - 1] = 'DEPÓSITO';
    v[COL_VEIC.IPVA - 1] = 9999;   // valor do cadastro: NAO pode entrar no mapa
    return [v];
  };
  aba_ = function () {
    return {
      getLastRow: function () { return __lanc.length + 1; },
      getRange: function (linha, col, nL, nC) {
        return {
          setValues: function (vals) {
            vals.forEach(function (l, i) {
              var alvo = linha - 2 + i;
              if (!__lanc[alvo]) __lanc[alvo] = new Array(TOTAL_COL_LANC).fill('');
              l.forEach(function (v, j) { __lanc[alvo][col - 1 + j] = v; });
            });
            return this;
          },
          setNumberFormat: function () { return this; },
          getValues: function () { return []; },
        };
      },
    };
  };
  ss_ = function () { return { getSheetByName: function () { return null; } }; };
`, ctx);

let falhas = 0;
const ck = (n, ok, d) => {
  console.log((ok ? '  OK   ' : '  FALHA') + ' ' + n + (d ? ' — ' + d : ''));
  if (!ok) falhas++;
};

console.log('--- lançando R$ 1.000 a partir de 2026-07 ---');
const r = ctx.lancarIpvaAnual_({
  placa: 'ABC1D23', valorAnual: 1000, documento: 'DUA-998877', mesInicial: '2026-07',
});
ck('lançou', r.ok, r.mensagem);
ck('gerou 12 linhas', ctx.__lanc.length === 12, ctx.__lanc.length + ' linha(s)');

const soma = ctx.__lanc.reduce((t, l) => t + Number(l[ctx.L_.VALOR] || 0), 0);
ck('as 12 somam a guia', Math.round(soma * 100) === 100000, 'R$ ' + soma.toFixed(2));
ck('todas são do tipo IPVA', ctx.__lanc.every(l => l[ctx.L_.TIPO] === 'IPVA'));
ck('todas carregam o documento', ctx.__lanc.every(l => l[ctx.L_.DOCUMENTO] === 'DUA-998877'));
ck('todas no mesmo grupo', new Set(ctx.__lanc.map(l =>
  (String(l[ctx.L_.OBSERVACAO]).match(/IPVA-[A-Z0-9]+/) || [''])[0])).size === 1);

console.log('');
console.log('--- cada competência recebe exatamente uma parcela ---');
let acumulado = 0;
for (let i = 0; i < 12; i++) {
  const comp = ctx.somarMesesCompetencia_('2026-07', i);
  const p = ctx.periodoDoMes_(comp);
  const dentro = ctx.__lanc.filter(l => {
    const d = l[ctx.L_.DATA];
    return d >= p.inicio && d <= p.fim;
  });
  acumulado += dentro.reduce((t, l) => t + Number(l[ctx.L_.VALOR] || 0), 0);
  ck(comp, dentro.length === 1,
    dentro.length + ' parcela(s) de R$ ' +
    dentro.reduce((t, l) => t + Number(l[ctx.L_.VALOR] || 0), 0).toFixed(2));
}
ck('as 12 competências cobrem a guia inteira',
  Math.round(acumulado * 100) === 100000, 'R$ ' + acumulado.toFixed(2));

console.log('');
console.log('--- o Resumo pega a parcela, não o cadastro ---');
const linhas = ctx.calcularLinhasResumo_(ctx.periodoDoMes_('2026-07'));
const ipvaResumo = Number(linhas[0][ctx.R_.IPVA]);
ck('IPVA do período = 1/12 da guia', Math.abs(ipvaResumo - 83.33) < 0.005,
  'R$ ' + ipvaResumo.toFixed(2));
ck('NÃO usou o cadastro (9999/12 = 833,25)', Math.abs(ipvaResumo - 833.25) > 1,
  'seria R$ 833,25 se lesse o cadastro');

console.log('');
console.log('--- documento repetido é recusado ---');
const dup = ctx.lancarIpvaAnual_({
  placa: 'ABC1D23', valorAnual: 1000, documento: 'DUA-998877', mesInicial: '2027-07',
});
ck('recusa e explica', dup.ok === false && dup.duplicidade === true, dup.mensagem.slice(0, 80));
ck('não duplicou as linhas', ctx.__lanc.length === 12, ctx.__lanc.length + ' linha(s)');

console.log('');
console.log(falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)');
process.exit(falhas === 0 ? 0 : 1);
