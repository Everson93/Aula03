/**
 * Prova da gravação do cadastro de veículo.
 *
 * O que se guarda aqui é o contrato do `manter`: campo que a tela NÃO manda
 * conserva o que já está na célula. Isso deixou de ser detalhe na V4.36,
 * quando o campo Emplacamento saiu da tela: sem o `manter`, a primeira edição
 * de cada veículo zeraria em silêncio um valor histórico de 167 linhas — e
 * zerar não dá erro, só apaga.
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
  Utilities: { getUuid: () => 'x' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { webSalvarVeiculo, webVeiculo, COL_VEIC, TOTAL_COL_VEIC });
  autorizarContextoWeb_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  registrarLog_ = function () {};
  invalidarCacheInicio_ = function () {};
  atualizarResumoSeguro_ = function () {};
  listaCentros_ = function () { return ['DEPOSITO']; };
  normalizarCentroCusto_ = function (c) { return String(c || '').trim().toUpperCase(); };
  listaPlacas_ = function () { return __veiculos.map(function (v) { return v[0]; }); };
  dadosVeiculosExecucao_ = function () { return __veiculos; };
  aba_ = function () {
    return {
      getLastRow: function () { return __veiculos.length + 1; },
      getRange: function (linha, coluna, nL, nC) {
        return {
          getValues: function () {
            const saida = [];
            for (let i = 0; i < nL; i++) {
              const l = __veiculos[linha - 2 + i] || new Array(TOTAL_COL_VEIC).fill('');
              saida.push(l.slice(coluna - 1, coluna - 1 + nC));
            }
            return saida;
          },
          setValues: function (vals) {
            vals.forEach(function (l, i) {
              const alvo = linha - 2 + i;
              if (!__veiculos[alvo]) __veiculos[alvo] = new Array(TOTAL_COL_VEIC).fill('');
              l.forEach(function (v, j) { __veiculos[alvo][coluna - 1 + j] = v; });
            });
            return this;
          },
          setNumberFormat: function () { return this; },
        };
      },
    };
  };
`, ctx);

function montar() {
  const v = new Array(ctx.TOTAL_COL_VEIC).fill('');
  v[ctx.COL_VEIC.PLACA - 1] = 'ABC1D23';
  v[ctx.COL_VEIC.DESCRICAO - 1] = 'Caminhao';
  v[ctx.COL_VEIC.CATEGORIA - 1] = 'Truck Normal';
  v[ctx.COL_VEIC.CENTRO - 1] = 'DEPOSITO';
  v[ctx.COL_VEIC.DEPRECIACAO - 1] = 1200;
  v[ctx.COL_VEIC.EMPLACAMENTO - 1] = 777;   // valor histórico, de antes da V4.36
  v[ctx.COL_VEIC.SEGURO - 1] = 300;
  v[ctx.COL_VEIC.IPVA - 1] = 2400;
  ctx.__veiculos = [v];
  vm.runInContext('VEICULOS_EXEC_CACHE_ = null;', ctx);
}

function celula(coluna) { return ctx.__veiculos[0][coluna - 1]; }

console.log('\n1. Campo que a tela não manda não é apagado');
montar();
// Exatamente o que a tela da V4.36 manda: sem `emplacamento`.
let r = ctx.webSalvarVeiculo('T', {
  placa: 'ABC1D23', descricao: 'Caminhao', categoria: 'Truck Normal', centro: 'DEPOSITO',
  depreciacao: 1300, seguro: 300, ipva: 2400, bonus: 0, precoCombustivel: 0,
});
ok('gravou', r.ok, r.mensagem);
ok('o Emplacamento histórico continua na célula', celula(ctx.COL_VEIC.EMPLACAMENTO) === 777,
  String(celula(ctx.COL_VEIC.EMPLACAMENTO)) + ' — zerar não dá erro, só apaga');
ok('e o que foi mandado foi gravado', celula(ctx.COL_VEIC.DEPRECIACAO) === 1300,
  String(celula(ctx.COL_VEIC.DEPRECIACAO)));
ok('o IPVA anual, que FICOU, continua editável', (function () {
  ctx.webSalvarVeiculo('T', {
    placa: 'ABC1D23', descricao: 'Caminhao', categoria: 'Truck Normal', centro: 'DEPOSITO',
    depreciacao: 1300, seguro: 300, ipva: 3600, bonus: 0, precoCombustivel: 0,
  });
  return celula(ctx.COL_VEIC.IPVA) === 3600;
})(), String(celula(ctx.COL_VEIC.IPVA)));

console.log('\n2. Veículo novo não inventa valor para o campo que saiu');
montar();
r = ctx.webSalvarVeiculo('T', {
  placa: 'XYZ9W88', descricao: 'Carro', categoria: 'Carro', centro: 'DEPOSITO',
  depreciacao: 500, seguro: 0, ipva: 0, bonus: 0, precoCombustivel: 0,
});
ok('cadastrou o novo', r.ok, r.mensagem);
ok('e o Emplacamento dele nasce zerado',
  (Number(ctx.__veiculos[1][ctx.COL_VEIC.EMPLACAMENTO - 1]) || 0) === 0,
  String(ctx.__veiculos[1][ctx.COL_VEIC.EMPLACAMENTO - 1]));

console.log('\n3. As duas pontas: a tela não mostra, o servidor não edita');
const app = fs.readFileSync('App.html', 'utf8');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ok('a tela não tem mais o campo', !/vEmplacamento/.test(app));
ok('e não manda mais o valor', !/emplacamento: el\(/.test(app));
ok('o servidor grava pelo `manter`, não pelo que veio da tela',
  /emplacamento: Number\(manter\(dados\.emplacamento, COL_VEIC\.EMPLACAMENTO - 1, 0\)\)/.test(fonte),
  'sem o manter, a primeira edição de cada veículo zera o histórico');
ok('e o cabeçalho da planilha diz que a coluna não é mais usada',
  /'Emplacamento \(não usado\)'/.test(fonte));

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
