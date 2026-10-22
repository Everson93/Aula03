/**
 * Prova do que a V4.9 veio consertar: alterar o percentual do mes aberto NAO
 * pode mexer no rateio de um mes ja apurado.
 *
 * Esse era o defeito silencioso da V4.8 — o total continuava fechando, so a
 * divisao entre as lojas mudava, e por isso ninguem percebia. Um teste que so
 * conferisse "a soma bate" passaria com o bug de volta. Aqui a asserção central
 * compara a DIVISAO, loja por loja, antes e depois de mexer no mes seguinte.
 */
const fs = require('fs');
const vm = require('vm');

const ABAS_FAKE = {};   // nome da aba -> matriz de valores (sem cabecalho)

function fakeSheet(nome, largura) {
  const dados = ABAS_FAKE[nome] || (ABAS_FAKE[nome] = []);
  return {
    getLastRow: () => dados.length + 1,
    getMaxRows: () => Math.max(dados.length + 1, 100),
    getRange: (linha, col, nL, nC) => ({
      getValues: () => {
        const saida = [];
        for (let i = 0; i < nL; i++) {
          const origem = dados[linha - 2 + i] || new Array(largura).fill('');
          saida.push(origem.slice(col - 1, col - 1 + nC));
        }
        return saida;
      },
      setValues: (vals) => {
        vals.forEach((l, i) => {
          const alvo = linha - 2 + i;
          if (!dados[alvo]) dados[alvo] = new Array(largura).fill('');
          l.forEach((v, j) => { dados[alvo][col - 1 + j] = v; });
        });
      },
      clearContent: () => { dados.length = 0; },
      setNumberFormat: () => {},
    }),
  };
}

const ctx = {
  console,
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'f1e2d3c4-0000' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);

let MES_CORRENTE = '2026-07';

vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    percentuaisDaCompetencia_, gravarPercentuaisCompetencia_, apurarRateio_,
    webSalvarRateioLote, webOrcamento, webRateio, orcamentoDaCompetencia_,
    gravarOrcamentoCompetencia_, fracaoPeriodoDecorrida_, periodoDoMes_,
    invalidarCacheRateioMensal_, invalidarCacheOrcamento_, COL_RM, COL_ORC,
    semearRateioCompetenciaAtual_, percentuaisDosCentros_,
    TOTAL_COL_RM, TOTAL_COL_ORC, ABAS, R_, TOTAL_COL_RESUMO,
  });
  __resumoPorMes = {};
  __centros = [];
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirPerfilToken_ = function () {};
  autorizarContextoWeb_ = function () {};
  registrarLog_ = function () {};
  invalidarCacheInicio_ = function () {};
  emailContextoAtual_ = function () { return 'teste@giassi.com.br'; };
  garantirLinhas_ = function () {};
  garantirColunas_ = function () {};
  dadosCentrosExecucao_ = function () { return __centros; };
  lerResumo_ = function () { return __resumoPorMes[__mesCorrente] || []; };
  calcularLinhasResumo_ = function (p) { return __resumoPorMes[p.mesRef] || []; };
  competenciasDisponiveis_ = function () { return [__mesCorrente]; };
`, ctx, { filename: 'Codigo.gs' });

// ---- fixture ----------------------------------------------------------------
function linhaResumo(placa, centro, total) {
  const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
  l[ctx.R_.PLACA] = placa;
  l[ctx.R_.CENTRO] = centro;
  l[ctx.R_.TOTAL] = total;
  return l;
}

ctx.__centros = [
  ['DEPÓSITO', 0, 'NAO'],
  ['Loja 01', 0.30, 'SIM'],
  ['Loja 02', 0.30, 'SIM'],
  ['Loja 03', 0.40, 'SIM'],
];
// Mesmo custo nos dois meses, de proposito: assim qualquer diferenca na divisao
// so pode ter vindo do percentual, nunca do movimento.
['2026-06', '2026-07'].forEach(function (mes) {
  ctx.__resumoPorMes[mes] = [
    linhaResumo('DEP0001', 'DEPÓSITO', 10000),
    linhaResumo('AAA1A11', 'Loja 01', 1000),
    linhaResumo('BBB2B22', 'Loja 02', 1000),
    linhaResumo('CCC3C33', 'Loja 03', 1000),
  ];
});

ctx.__mesCorrente = MES_CORRENTE;
ctx.param_ = function (n) {
  if (n === 'MES_REFERENCIA') return ctx.__mesCorrente;
  if (n === 'DIA_FIM_PERIODO') return 25;
  if (n === 'BASE_RATEIO') return 'DEPÓSITO';
  return '';
};
ctx.aba_ = function (nome) {
  if (nome === ctx.ABAS.RATEIO_MENSAL) return fakeSheet(nome, ctx.TOTAL_COL_RM);
  if (nome === ctx.ABAS.ORCAMENTO) return fakeSheet(nome, ctx.TOTAL_COL_ORC);
  if (nome === ctx.ABAS.CENTROS) return fakeSheet(nome, 3);
  return fakeSheet(nome, 10);
};
ctx.ss_ = function () {
  return { getSheetByName: function (nome) { return ABAS_FAKE[nome] ? fakeSheet(nome, 10) : null; } };
};
// A aba Centros do fake espelha __centros, para o espelhamento ser observavel.
ABAS_FAKE[ctx.ABAS.CENTROS] = ctx.__centros;
ABAS_FAKE[ctx.ABAS.RATEIO_MENSAL] = [];
ABAS_FAKE[ctx.ABAS.ORCAMENTO] = [];
ctx.CENTROS_EXEC_CACHE_ = null;

// ---- infraestrutura de asserção ---------------------------------------------
let falhas = 0, provas = 0;
function ok(titulo, condicao, detalhe) {
  provas++;
  if (condicao) { console.log('  ok   ' + titulo); return; }
  falhas++;
  console.log('  FALHA ' + titulo + (detalhe ? '\n        ' + detalhe : ''));
}
function perto(a, b, tol) { return Math.abs(Number(a) - Number(b)) <= (tol === undefined ? 0.005 : tol); }
function divisao(mes) {
  const antes = ctx.__mesCorrente;
  ctx.__mesCorrente = mes;
  ctx.invalidarCacheRateioMensal_();
  const a = ctx.apurarRateio_(mes);
  ctx.__mesCorrente = antes;
  const mapa = {};
  a.linhas.forEach(function (l) { mapa[l.centro] = l.total; });
  return mapa;
}

// ---- 1. unidade: % da tela (3,83) vira fracao (0,0383) ----------------------
console.log('\n1. Unidade do percentual');
ctx.__mesCorrente = '2026-06';
ctx.webSalvarRateioLote('t', { competencia: '2026-06', itens: [
  { centro: 'DEPÓSITO', percentual: 0, recebe: false },
  { centro: 'Loja 01', percentual: 30, recebe: true },
  { centro: 'Loja 02', percentual: 30, recebe: true },
  { centro: 'Loja 03', percentual: 40, recebe: true },
] });
ctx.invalidarCacheRateioMensal_();
const junho = ctx.percentuaisDaCompetencia_('2026-06');
ok('30 na tela vira 0,30 na base',
  perto(junho.percentuais['Loja 01'].percentual, 0.30, 1e-9),
  'gravou ' + junho.percentuais['Loja 01'].percentual + ' — se gravasse 30, a loja ' +
  'receberia trinta vezes a base');
ok('bloco de junho é próprio, não herdado', junho.proprio === true);

// ---- 2. O TESTE CENTRAL: mexer em julho não mexe em junho -------------------
console.log('\n2. Isolamento entre competências (o defeito da V4.8)');
const junhoAntes = divisao('2026-06');
ctx.__mesCorrente = '2026-07';
ctx.webSalvarRateioLote('t', { competencia: '2026-07', itens: [
  { centro: 'DEPÓSITO', percentual: 0, recebe: false },
  { centro: 'Loja 01', percentual: 80, recebe: true },   // mudanca violenta de proposito
  { centro: 'Loja 02', percentual: 10, recebe: true },
  { centro: 'Loja 03', percentual: 10, recebe: true },
] });
ctx.invalidarCacheRateioMensal_();
const junhoDepois = divisao('2026-06');
const julho = divisao('2026-07');

ok('a divisão de junho não mudou, loja por loja',
  ['Loja 01', 'Loja 02', 'Loja 03'].every(function (c) {
    return perto(junhoAntes[c], junhoDepois[c]);
  }),
  'antes ' + JSON.stringify(junhoAntes) + '\n        depois ' + JSON.stringify(junhoDepois));
ok('junho manteve 30/30/40 (Loja 01 = 1000 + 30% de 10000)',
  perto(junhoDepois['Loja 01'], 4000), 'veio ' + junhoDepois['Loja 01']);
ok('julho usa os percentuais novos (Loja 01 = 1000 + 80% de 10000)',
  perto(julho['Loja 01'], 9000), 'veio ' + julho['Loja 01']);
// Sem esta, o teste acima passaria se as duas competencias dessem o mesmo numero
// por acaso — e o bug era exatamente "as duas dao o mesmo numero".
ok('as duas competências de fato divergem',
  !perto(junhoDepois['Loja 01'], julho['Loja 01']));

// ---- 3. Herança -------------------------------------------------------------
console.log('\n3. Herança de competência sem bloco próprio');
const agosto = ctx.percentuaisDaCompetencia_('2026-08');
ok('agosto herda de julho, o mês gravado mais recente anterior',
  agosto.origem === '2026-07' && agosto.proprio === false,
  'origem=' + agosto.origem);
const maio = ctx.percentuaisDaCompetencia_('2026-05');
ok('maio NÃO herda de junho (um mês não herda do futuro)',
  maio.origem === 'cadastro',
  'origem=' + maio.origem + ' — herdar do futuro reescreveria o passado por outra porta');

// ---- 4. Fechamento fecha ----------------------------------------------------
console.log('\n4. Competência encerrada não aceita gravação');
ctx.__mesCorrente = '2026-07';
const recusa = ctx.webSalvarRateioLote('t', { competencia: '2026-06', itens: [
  { centro: 'Loja 01', percentual: 99, recebe: true },
] });
ok('gravar em junho com julho aberto é recusado', recusa.ok === false, JSON.stringify(recusa));
ok('junho continua intacto depois da recusa', perto(divisao('2026-06')['Loja 01'], 4000));

// ---- 5. Normalização quando a soma não fecha 100% ---------------------------
console.log('\n5. Soma diferente de 100% ainda fecha com o Resumo');
ctx.__mesCorrente = '2026-09';
ctx.webSalvarRateioLote('t', { competencia: '2026-09', itens: [
  { centro: 'DEPÓSITO', percentual: 0, recebe: false },
  { centro: 'Loja 01', percentual: 20, recebe: true },
  { centro: 'Loja 02', percentual: 20, recebe: true },
  { centro: 'Loja 03', percentual: 20, recebe: true },   // soma 60%, nao 100
] });
ctx.invalidarCacheRateioMensal_();
ctx.__resumoPorMes['2026-09'] = ctx.__resumoPorMes['2026-07'];
const nove = ctx.apurarRateio_('2026-09');
const totalRateado = nove.linhas.reduce(function (s, l) { return s + l.total; }, 0);
const totalResumo = ctx.__resumoPorMes['2026-09'].reduce(function (s, l) { return s + l[ctx.R_.TOTAL]; }, 0);
ok('o total rateado fecha com o total do Resumo mesmo somando 60%',
  perto(totalRateado, totalResumo),
  'rateado ' + totalRateado.toFixed(2) + ' x resumo ' + totalResumo.toFixed(2));
ok('a soma crua é mesmo 60%, então a normalização está sendo exercida',
  perto(nove.somaPercentual * 100, 60));

// ---- 6. Orçamento usa o MESMO realizado do rateio ---------------------------
console.log('\n6. Orçamento');
ctx.__mesCorrente = '2026-07';
ctx.gravarOrcamentoCompetencia_('2026-07', [
  { centro: 'Loja 01', valor: 5000 },    // vai estourar: realizado 9000
  { centro: 'Loja 02', valor: 50000 },   // folgado
], 'teste@giassi.com.br');
ctx.invalidarCacheOrcamento_();
const orc = ctx.webOrcamento('t', '2026-07');
const porCentro = {};
orc.linhas.forEach(function (l) { porCentro[l[0]] = l; });

ok('realizado da Loja 01 no orçamento == total dela no rateio',
  perto(porCentro['Loja 01'][2], julho['Loja 01']),
  'orçamento ' + porCentro['Loja 01'][2] + ' x rateio ' + julho['Loja 01']);
ok('Loja 01 marcada como ESTOUROU (9000 contra 5000)',
  porCentro['Loja 01'][6] === 'ESTOUROU', porCentro['Loja 01'][6]);
ok('desvio da Loja 01 é +4000', perto(porCentro['Loja 01'][3], 4000));
ok('Loja 02 está DENTRO', porCentro['Loja 02'][6] === 'DENTRO', porCentro['Loja 02'][6]);
ok('Loja 03, sem previsto, aparece como SEM ORÇAMENTO',
  porCentro['Loja 03'] && porCentro['Loja 03'][6] === 'SEM ORÇAMENTO',
  porCentro['Loja 03'] ? porCentro['Loja 03'][6] : 'não apareceu');
ok('todo centro cadastrado pode ser orçado, mesmo sem gasto',
  orc.itens.length === 4,
  'vieram ' + orc.itens.length + ' — um centro novo sem movimento ficaria impossível de orçar');

// ---- 7. Projeção ------------------------------------------------------------
console.log('\n7. Projeção do período');
const p = ctx.periodoDoMes_('2026-07');
const meio = new Date(p.inicio.getTime() + (p.fim - p.inicio) / 2);
const f = ctx.fracaoPeriodoDecorrida_(p, meio);
ok('na metade do período a fração fica perto de 0,5', perto(f.fracao, 0.5, 0.05), 'veio ' + f.fracao);
const inicio = ctx.fracaoPeriodoDecorrida_(p, p.inicio);
ok('no primeiro dia a fração não é zero (projeção não vai ao infinito)',
  inicio.fracao > 0, 'veio ' + inicio.fracao);
const depois = ctx.fracaoPeriodoDecorrida_(p, new Date(p.fim.getTime() + 86400000));
ok('período encerrado tem fração 1 (nada a projetar)', perto(depois.fracao, 1));

// ---- 8. O vão da transição para a V4.9 --------------------------------------
// Instala em julho, ninguem toca na tela, fecha julho. Em agosto o operador
// ajusta o rateio. Sem a semeadura, julho ficaria sem bloco, cairia na aba
// Centros — que ja foi espelhada com os valores de AGOSTO — e herdaria do
// futuro. E o mesmo defeito da V4.8, voltando pela porta dos fundos.
console.log('\n8. Transição para a V4.9: o mês de instalação');
ABAS_FAKE[ctx.ABAS.RATEIO_MENSAL].length = 0;
ctx.invalidarCacheRateioMensal_();
ctx.__centros.length = 0;
[['DEPÓSITO', 0, 'NAO'], ['Loja 01', 0.30, 'SIM'], ['Loja 02', 0.30, 'SIM'], ['Loja 03', 0.40, 'SIM']]
  .forEach(function (l) { ctx.__centros.push(l); });
ctx.__mesCorrente = '2026-07';
ctx.__resumoPorMes['2026-07'] = ctx.__resumoPorMes['2026-06'];

ctx.semearRateioCompetenciaAtual_();                       // <- o que a instalação faz
ctx.invalidarCacheRateioMensal_();
ok('a instalação deixa julho com bloco próprio',
  ctx.percentuaisDaCompetencia_('2026-07').proprio === true);
const julhoNaInstalacao = divisao('2026-07');

// agora agosto abre e o operador muda tudo
ctx.__mesCorrente = '2026-08';
ctx.__resumoPorMes['2026-08'] = ctx.__resumoPorMes['2026-06'];
ctx.webSalvarRateioLote('t', { competencia: '2026-08', itens: [
  { centro: 'DEPÓSITO', percentual: 0, recebe: false },
  { centro: 'Loja 01', percentual: 90, recebe: true },
  { centro: 'Loja 02', percentual: 5, recebe: true },
  { centro: 'Loja 03', percentual: 5, recebe: true },
] });
ctx.invalidarCacheRateioMensal_();
ok('julho continua com a divisão de julho depois de agosto mexer',
  perto(divisao('2026-07')['Loja 01'], julhoNaInstalacao['Loja 01']),
  'na instalação ' + julhoNaInstalacao['Loja 01'] + ', agora ' + divisao('2026-07')['Loja 01']);
ok('e julho de fato difere de agosto',
  !perto(divisao('2026-07')['Loja 01'], divisao('2026-08')['Loja 01']));
ok('semear de novo não duplica o bloco', ctx.semearRateioCompetenciaAtual_() === 0);

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
