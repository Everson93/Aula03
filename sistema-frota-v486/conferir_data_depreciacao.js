/**
 * Prova da confirmação da data da depreciação.
 *
 * Veio de fora deste repositório e entrou na unificação de 09/11/2026 sem
 * teste. É código que ESCREVE na aba de Lançamentos, numa coluna só, em
 * bloco — a operação mais fácil de errar que existe aqui: basta o índice da
 * linha andar e a confirmação carimba o lançamento do vizinho.
 *
 * O que se prova é que o carimbo cai na linha certa e em mais nenhuma, e
 * que a situação do veículo muda de DATA INCORRETA para concluída sem o
 * valor ser contado duas vezes.
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

let LANC = [];
const diario = { log: [], escritas: 0, conferencia: 0 };
let lockLivre = true;

function abaLancamentos() {
  return {
    getLastRow: function () { return LANC.length + 1; },
    getRange: function (linha, coluna, nL, nC) {
      nL = nL || 1; nC = nC || 1;
      if (linha < 2) throw new Error('intervalo invade o cabeçalho');
      if (linha + nL - 1 > LANC.length + 1) throw new Error('intervalo passa da última linha');
      return {
        getValues: function () {
          const saida = [];
          for (let i = 0; i < nL; i++) saida.push(LANC[linha - 2 + i].slice(coluna - 1, coluna - 1 + nC));
          return saida;
        },
        setValues: function (v) {
          diario.escritas++;
          if (v.length !== nL) throw new Error('setValues: ' + v.length + ' linhas num intervalo de ' + nL);
          v.forEach(function (lv, i) {
            if (lv.length !== nC) throw new Error('setValues: colunas fora do intervalo');
            lv.forEach(function (x, j) { LANC[linha - 2 + i][coluna - 1 + j] = x; });
          });
        },
      };
    },
  };
}

const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: {
    getUuid: () => 'x',
    formatDate: function (d, _tz, padrao) {
      const p = n => ('0' + n).slice(-2);
      if (padrao === 'yyyy-MM-dd') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' 10:00';
    },
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => lockLivre, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { confirmarDataDepreciacao_, observacaoConfirmaData_,
    webDepreciacaoConfirmarData, MARCA_DATA_DEP_CONFIRMADA_, COL_LANC, L_ });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  autorizarContextoWeb_ = function () {};
  exigirCompetenciaAberta_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  emailContextoAtual_ = function () { return 'fulano@giassi.com.br'; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-10' : ''; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  // O periodo real termina as 23:59:59.999. Um dublê que terminava a
  // meia-noite jogava o lançamento do PRÓPRIO dia 25 para fora do laço, e
  // com isso escondia a guarda de "já está na data certa": tirá-la do
  // código não mudava nada. Dublê mais estrito que o original esconde guarda.
  periodoDoMes_ = function () {
    return { inicio: new Date(2026, 8, 26, 0, 0, 0, 0), fim: new Date(2026, 9, 25, 23, 59, 59, 999) };
  };
  dataUltimoDiaPeriodo_ = function (p) {
    return new Date(p.fim.getFullYear(), p.fim.getMonth(), p.fim.getDate(), 0, 0, 0, 0);
  };
  periodoAtual_ = function () { return periodoDoMes_(); };
  formatarData_ = function (d) { const z = n => ('0'+n).slice(-2);
    return z(d.getDate()) + '/' + z(d.getMonth()+1) + '/' + d.getFullYear(); };
  statusDepreciacaoMensal_ = function () { return __status; };
  aba_ = function () { return __aba(); };
  ss_ = function () { return { getSheetByName: function () { return __aba(); } }; };
  ultimaLinhaLancamentoReal_ = function () { return __lancs().length + 1; };
  registrarLog_ = function (a, b) { __diario.log.push(a + ' | ' + b); };
  invalidarCacheLancamentos_ = function () {};
  invalidarCacheInicio_ = function () {};
  coletarProblemas_ = function () { return []; };
  escreverConferencia_ = function () { __diario.conferencia++; };
  webDepreciacao = function () { return { recarregado: true }; };
`, ctx);
ctx.__diario = diario;
ctx.__aba = abaLancamentos;
ctx.__lancs = function () { return LANC; };
const data = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); })', ctx);

const DIA_CERTO = () => data(2026, 10, 25);
const O = ctx.COL_LANC.OBSERVACAO - 1;

function lanc(dt, placa, tipo, valor, obs) {
  const l = new Array(20).fill('');
  l[ctx.L_.DATA] = dt; l[ctx.L_.PLACA] = placa; l[ctx.L_.TIPO] = tipo;
  l[ctx.L_.VALOR] = valor; l[O] = obs || '';
  return l;
}

function resetar() {
  diario.log.length = 0; diario.escritas = 0; diario.conferencia = 0;
  lockLivre = true;
  // A placa alvo NÃO é a primeira linha, e há vizinhos de todos os tipos que
  // o laço precisa pular: outro veículo, outro tipo de despesa, data certa e
  // data de outro mês. Com o alvo em cima, carimbar "a primeira" e carimbar
  // "a que casa" dariam no mesmo.
  LANC = [
    lanc(data(2026, 10, 25), 'AAA 0001', 'Depreciação', 300),              // 2 - data certa
    lanc(data(2026, 10, 10), 'BBB 0002', 'Depreciação', 500),              // 3 - ALVO
    lanc(data(2026, 10, 10), 'BBB 0002', 'Oficina Despesa', 900),          // 4 - outro tipo
    lanc(data(2026, 10, 12), 'CCC 0003', 'Depreciação', 700),              // 5 - outra placa
    lanc(data(2026, 8, 10), 'BBB 0002', 'Depreciação', 400),               // 6 - outro mês
    lanc(data(2026, 10, 18), 'BBB 0002', 'Depreciacao', 100, 'obs antiga'),// 7 - ALVO, sem cedilha
    // O MESMO veículo alvo, já na data certa: sem esta linha, a guarda da
    // data e a guarda da placa dariam no mesmo, e tirar a da data passaria.
    lanc(data(2026, 10, 25), 'BBB 0002', 'Depreciação', 50),               // 8 - alvo, data OK
  ];
  ctx.__status = {
    mes: '2026-10', mesExtenso: 'outubro de 2026',
    itens: [
      { placa: 'AAA 0001', situacao: 'CONCLUÍDO' },
      { placa: 'BBB 0002', situacao: 'DATA INCORRETA' },
      { placa: 'CCC 0003', situacao: 'DATA INCORRETA' },
    ],
  };
}

console.log('\n1. Carimba a linha certa, e só ela');
resetar();
let r = ctx.confirmarDataDepreciacao_(['BBB 0002']);
ok('confirma', r.ok === true, JSON.stringify(r));
ok('as duas linhas do veículo no período recebem a marca',
  ctx.observacaoConfirmaData_(LANC[1][O]) && ctx.observacaoConfirmaData_(LANC[5][O]),
  JSON.stringify([LANC[1][O], LANC[5][O]]));
ok('o lançamento de OFICINA do mesmo veículo e dia NÃO é tocado',
  LANC[2][O] === '', JSON.stringify(LANC[2][O]));
ok('a outra placa não é tocada', LANC[3][O] === '', JSON.stringify(LANC[3][O]));
ok('a depreciação de outro MÊS não é tocada', LANC[4][O] === '', JSON.stringify(LANC[4][O]));
ok('a que já estava na data certa não é tocada', LANC[0][O] === '', JSON.stringify(LANC[0][O]));
ok('nem a do PRÓPRIO veículo alvo que já estava na data certa',
  LANC[6][O] === '', JSON.stringify(LANC[6][O]));
ok('a observação antiga é preservada', /obs antiga/.test(LANC[5][O]), LANC[5][O]);
// O corte de 1000 caracteres tem de comer o fim da observação, nunca a marca.
ok('e a marca vem na FRENTE dela',
  LANC[5][O].indexOf(ctx.MARCA_DATA_DEP_CONFIRMADA_) === 0, LANC[5][O]);
ok('a marca diz a data lançada e a exigida',
  /lançada em 18\/10\/2026, exigido 25\/10\/2026/.test(LANC[5][O]), LANC[5][O]);
ok('e quem confirmou', /fulano@giassi\.com\.br/.test(LANC[5][O]), LANC[5][O]);

console.log('\n2. Uma escrita só, e a coluna certa');
ok('a coluna de observação é gravada numa chamada', diario.escritas === 1,
  String(diario.escritas));
ok('a data do lançamento NÃO é alterada',
  LANC[1][ctx.L_.DATA].getDate() === 10, String(LANC[1][ctx.L_.DATA]));
ok('nem o valor', LANC[1][ctx.L_.VALOR] === 500, String(LANC[1][ctx.L_.VALOR]));
ok('revalida a conferência depois', diario.conferencia === 1, String(diario.conferencia));
ok('e registra no Log com a placa',
  diario.log.some(function (l) { return /Confirmar data/.test(l) && /BBB 0002/.test(l); }),
  diario.log.join(' // '));
ok('o retorno conta os lançamentos confirmados',
  r.confirmados.length === 1 && r.confirmados[0].lancamentos === 2 &&
  r.confirmados[0].valor === 600, JSON.stringify(r.confirmados));

console.log('\n3. Sem filtro, confirma todas as que estão fora de data');
resetar();
r = ctx.confirmarDataDepreciacao_([]);
ok('pega as duas placas com DATA INCORRETA', r.confirmados.length === 2,
  JSON.stringify(r.confirmados.map(function (c) { return c.placa; })));
ok('e a que já estava certa continua sem marca', LANC[0][O] === '');

console.log('\n4. Não carimba duas vezes');
resetar();
ctx.confirmarDataDepreciacao_(['BBB 0002']);
const antes = LANC[1][O];
const r2 = ctx.confirmarDataDepreciacao_(['BBB 0002']);
ok('a segunda confirmação não encontra nada', r2.ok === false, JSON.stringify(r2));
ok('e a observação fica exatamente como estava', LANC[1][O] === antes, LANC[1][O]);
ok('sem carimbo empilhado',
  (LANC[1][O].match(/\[DATA CONFIRMADA/g) || []).length === 1, LANC[1][O]);

console.log('\n5. O que recusa');
resetar();
ctx.__status.itens = [{ placa: 'AAA 0001', situacao: 'CONCLUÍDO' }];
r = ctx.confirmarDataDepreciacao_([]);
ok('nenhuma com data incorreta: recusa e explica', r.ok === false &&
  /Nenhuma depreciação com data incorreta/.test(r.mensagem), r.mensagem);
ok('e não escreve nada', diario.escritas === 0, String(diario.escritas));

resetar();
r = ctx.confirmarDataDepreciacao_(['ZZZ 9999']);
ok('placa que não está fora de data: recusa', r.ok === false, JSON.stringify(r));
ok('e não escreve nada', diario.escritas === 0, String(diario.escritas));

resetar();
lockLivre = false;
r = ctx.confirmarDataDepreciacao_(['BBB 0002']);
ok('sem a trava, não confirma', r.ok === false && diario.escritas === 0, JSON.stringify(r));
lockLivre = true;

console.log('\n6. A situação do veículo depois');
resetar();
ctx.confirmarDataDepreciacao_(['BBB 0002']);
ok('a marca é reconhecida por observacaoConfirmaData_',
  ctx.observacaoConfirmaData_(LANC[1][O]) === true);
ok('e texto qualquer não passa por confirmação',
  ctx.observacaoConfirmaData_('lançado fora da data, avisei o contábil') === false);
ok('nem observação vazia', ctx.observacaoConfirmaData_('') === false &&
  ctx.observacaoConfirmaData_(null) === false);

console.log('\n7. O callback da tela');
resetar();
const rw = ctx.webDepreciacaoConfirmarData('token', ['BBB 0002']);
ok('confirma e devolve a tela já recarregada',
  rw.ok === true && rw.dados && rw.dados.recarregado === true, JSON.stringify(rw));
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ok('e é só para ADMIN',
  /function webDepreciacaoConfirmarData[\s\S]{0,140}autorizarContextoWeb_\(token, 'ADMIN'\)/.test(fonte),
  'confirmar data mexe em lançamento: OPERADOR não pode');
const app = fs.readFileSync('App.html', 'utf8');
ok('a tela tem o botão', /depConfirmarData\(this\)/.test(app));

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
