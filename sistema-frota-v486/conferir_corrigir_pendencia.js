/**
 * Prova da correcao de pendencia na propria tela.
 *
 * A asserção que mais importa nao e "gravou". E "NAO gravou na linha errada".
 * O numero da linha vem de uma conferencia que rodou antes; se alguem apagou
 * uma linha de Lançamentos desde entao, "linha 35" aponta hoje para outro
 * lancamento. Escrever ali corromperia um registro que estava certo, em
 * silencio — e silencio e o pior defeito possivel num sistema de custo.
 */
const fs = require('fs');
const vm = require('vm');

const ABAS_FAKE = {};
let REVALIDOU = 0;

function fakeSheet(nome) {
  const dados = ABAS_FAKE[nome] || (ABAS_FAKE[nome] = []);
  return {
    getLastRow: () => dados.length + 1,
    getMaxRows: () => dados.length + 50,
    getRange: (linha, col, nL, nC) => ({
      getValue: () => {
        const l = dados[linha - 2];
        return l ? l[col - 1] : '';
      },
      setValue: (v) => {
        if (!dados[linha - 2]) dados[linha - 2] = [];
        dados[linha - 2][col - 1] = v;
      },
      getValues: () => {
        const saida = [];
        for (let i = 0; i < (nL || 1); i++) {
          const o = dados[linha - 2 + i] || [];
          const l = [];
          for (let j = 0; j < (nC || 1); j++) l.push(o[col - 1 + j] === undefined ? '' : o[col - 1 + j]);
          saida.push(l);
        }
        return saida;
      },
      setValues: () => {},
      setNumberFormat: () => {},
    }),
  };
}

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'f1e2d3c4', formatDate: (d) => String(d) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    webCorrigirPendencia, correcaoDaPendencia_, linhaAlvoPendencia_,
    valorCorrecaoPendencia_, CORRECOES_PENDENCIA_, ABAS, COL_LANC, COL_VEIC,
    NATUREZAS_OFICINA, TIPOS_DESPESA,
  });
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirPerfilToken_ = function () { return { perfil: __perfil, email: 'op@giassi.com.br' }; };
  autorizarContextoWeb_ = function () { return { perfil: __perfil, email: 'op@giassi.com.br' }; };
  registrarLog_ = function (a, d) { __log.push(a + ' | ' + d); };
  invalidarCacheInicio_ = function () {};
  invalidarCacheSaude_ = function () {};
  invalidarCacheLancamentos_ = function () {};
  invalidarCacheOdometro_ = function () {};
  marcarResumoDesatualizado_ = function () {};
  listaCentros_ = function () { return ['DEPÓSITO', 'Loja 01', 'Loja 02']; };
  listaCategorias_ = function () { return ['Leve', 'Pesado']; };
  coletarProblemas_ = function () { return []; };
  escreverConferencia_ = function () { __revalidou++; };
  contarPendenciasConferencia_ = function () { return 0; };
  normalizaPlaca_ = function (p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  __log = [];
  __revalidou = 0;
  __perfil = 'OPERADOR';
`, ctx, { filename: 'Codigo.gs' });

ctx.garantirAbaPendencias_ = function () { return fakeSheet('PEND'); };
ctx.aba_ = function (nome) { return fakeSheet(nome); };
ctx.ss_ = function () { return { getSheetByName: (n) => (ABAS_FAKE[n] ? fakeSheet(n) : null) }; };

const L = ctx.ABAS.LANCAMENTOS, V = ctx.ABAS.VEICULOS, O = ctx.ABAS.ODOMETRO;

function montarBase() {
  ABAS_FAKE['PEND'] = [];
  ABAS_FAKE[L] = [];
  ABAS_FAKE[V] = [];
  ABAS_FAKE[O] = [];
  ctx.__log = [];
  ctx.__revalidou = 0;
  ctx.__perfil = 'OPERADOR';
  // Lançamentos: linhas 2..5 (indice 0..3)
  for (let i = 0; i < 4; i++) {
    const l = new Array(20).fill('');
    l[ctx.COL_LANC.PLACA - 1] = ['AAA1A11', 'BBB2B22', 'MKZ6729', 'DDD4D44'][i];
    l[ctx.COL_LANC.TIPO - 1] = 'Oficina';
    l[ctx.COL_LANC.VALOR - 1] = 100;
    ABAS_FAKE[L].push(l);
  }
}
// pendencia na linha 3 da aba PEND: [origem, placa, problema, detalhe]
function pend(origem, placa, problema, detalhe) {
  ABAS_FAKE['PEND'] = [[], []];  // linhas 2 e 3 do sheet real = indices 0 e 1
  ABAS_FAKE['PEND'][1] = [origem, placa, problema, detalhe, 'PENDENTE', '', ''];
  return 3;
}

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}

// ---- 1. o caso do print ------------------------------------------------------
console.log('\n1. Oficina sem detalhe (o caso real)');
montarBase();
// MKZ6729 esta na linha 4 (indice 2)
let lp = pend(L, 'MKZ 6729', 'Oficina sem detalhe da peça/serviço',
  'linha 4 • descreva o que foi comprado ou executado');
let r = ctx.webCorrigirPendencia('t', lp, 'Troca do alternador');
ok('a correção é aceita', r.ok === true, JSON.stringify(r));
ok('gravou no campo certo da linha certa',
  ABAS_FAKE[L][2][ctx.COL_LANC.DETALHE_OFICINA - 1] === 'Troca do alternador',
  JSON.stringify(ABAS_FAKE[L][2][ctx.COL_LANC.DETALHE_OFICINA - 1]));
ok('não encostou nas outras linhas',
  !ABAS_FAKE[L][1][ctx.COL_LANC.DETALHE_OFICINA - 1] &&
  !ABAS_FAKE[L][3][ctx.COL_LANC.DETALHE_OFICINA - 1]);
ok('revalidou a conferência depois de gravar', ctx.__revalidou === 1, 'revalidou ' + ctx.__revalidou);
ok('registrou no log com o valor antigo e o novo',
  ctx.__log.some(function (x) { return x.indexOf('Corrigir pendência') === 0 && x.indexOf('Troca do alternador') !== -1; }),
  JSON.stringify(ctx.__log));

// ---- 2. A PROTEÇÃO: a base mudou desde a conferência ------------------------
console.log('\n2. A linha alvo não é mais do mesmo veículo');
montarBase();
lp = pend(L, 'MKZ 6729', 'Oficina sem detalhe da peça/serviço', 'linha 4 • descreva');
// alguem apagou uma linha: a 4 agora e de outro veiculo
ABAS_FAKE[L][2][ctx.COL_LANC.PLACA - 1] = 'ZZZ9Z99';
r = ctx.webCorrigirPendencia('t', lp, 'Troca do alternador');
ok('a gravação é RECUSADA', r.ok === false, JSON.stringify(r));
ok('a mensagem manda revalidar', /[Rr]evalidar/.test(r.mensagem || ''), r.mensagem);
ok('o lançamento alheio ficou intacto',
  !ABAS_FAKE[L][2][ctx.COL_LANC.DETALHE_OFICINA - 1],
  'escreveu ' + JSON.stringify(ABAS_FAKE[L][2][ctx.COL_LANC.DETALHE_OFICINA - 1]));

console.log('\n3. A linha alvo nem existe mais');
montarBase();
lp = pend(L, 'AAA1A11', 'Oficina sem detalhe da peça/serviço', 'linha 99 • descreva');
r = ctx.webCorrigirPendencia('t', lp, 'qualquer coisa');
ok('recusa linha fora da aba', r.ok === false, JSON.stringify(r));

// ---- 4. validação do valor ---------------------------------------------------
console.log('\n4. Validação do que foi digitado');
montarBase();
lp = pend(L, 'AAA1A11', 'Oficina sem detalhe da peça/serviço', 'linha 2 • descreva');
ok('texto vazio é recusado', ctx.webCorrigirPendencia('t', lp, '   ').ok === false);
ok('texto curto demais é recusado', ctx.webCorrigirPendencia('t', lp, 'ok').ok === false,
  'um "ok" no detalhe não ajuda ninguém a cobrar garantia depois');
ok('nada foi gravado nas tentativas recusadas',
  !ABAS_FAKE[L][0][ctx.COL_LANC.DETALHE_OFICINA - 1]);

montarBase();
lp = pend(L, 'AAA1A11', 'Oficina sem natureza da despesa', 'linha 2 • classifique');
ok('valor fora da lista é recusado', ctx.webCorrigirPendencia('t', lp, 'Inventado').ok === false);
r = ctx.webCorrigirPendencia('t', lp, ctx.NATUREZAS_OFICINA[0]);
ok('valor da lista é aceito', r.ok === true, JSON.stringify(r));
ok('gravou a natureza',
  ABAS_FAKE[L][0][ctx.COL_LANC.NATUREZA_OFICINA - 1] === ctx.NATUREZAS_OFICINA[0]);

montarBase();
lp = pend(L, 'AAA1A11', 'Valor negativo', 'linha 2');
ok('valor negativo continua sendo recusado', ctx.webCorrigirPendencia('t', lp, '-50').ok === false);
ok('número com vírgula é aceito', ctx.webCorrigirPendencia('t', lp, '1.234,56').ok === true);
ok('e grava como número, não texto',
  ABAS_FAKE[L][0][ctx.COL_LANC.VALOR - 1] === 1234.56,
  JSON.stringify(ABAS_FAKE[L][0][ctx.COL_LANC.VALOR - 1]));

// ---- 5. perfil ---------------------------------------------------------------
console.log('\n5. Cadastro de veículo é ADMIN');
montarBase();
const v = new Array(20).fill('');
v[ctx.COL_VEIC.PLACA - 1] = 'AAA1A11';
ABAS_FAKE[V].push(v);
lp = pend(V, 'AAA1A11', 'Veículo ativo sem centro de custo', '');
ctx.__perfil = 'OPERADOR';
r = ctx.webCorrigirPendencia('t', lp, 'Loja 01');
ok('OPERADOR não altera o cadastro do veículo', r.ok === false, JSON.stringify(r));
ok('o cadastro ficou intacto', !ABAS_FAKE[V][0][ctx.COL_VEIC.CENTRO - 1]);
ctx.__perfil = 'ADMIN';
r = ctx.webCorrigirPendencia('t', lp, 'Loja 01');
ok('ADMIN altera', r.ok === true, JSON.stringify(r));
ok('achou a linha pela placa, sem número de linha no detalhe',
  ABAS_FAKE[V][0][ctx.COL_VEIC.CENTRO - 1] === 'Loja 01');

// ---- 6. o que NÃO é corrigível -----------------------------------------------
console.log('\n6. Pendências que não se resolvem por um campo');
montarBase();
lp = pend(ctx.ABAS.CENTROS, '', 'Soma dos percentuais de rateio não fecha 100%', '99,5%');
ok('soma de rateio não oferece correção', ctx.webCorrigirPendencia('t', lp, '100').ok === false);
ok('e a tela não mostra campo para ela',
  ctx.correcaoDaPendencia_(ctx.ABAS.CENTROS, 'Soma dos percentuais de rateio não fecha 100%', '99,5%', '') === null);
ok('data inválida fica de fora de propósito (muda a competência)',
  ctx.correcaoDaPendencia_(L, 'Data inválida', 'linha 2', 'AAA1A11') === null);
ok('detalhe sem "linha N" não vira campo editável',
  ctx.correcaoDaPendencia_(L, 'Oficina sem detalhe da peça/serviço', 'sem número', 'AAA1A11') === null,
  'na dúvida sobre a linha, é melhor não oferecer do que gravar no lugar errado');

// ---- 7. a tela recebe o que precisa -----------------------------------------
console.log('\n7. O que a tela recebe');
const c = ctx.correcaoDaPendencia_(L, 'Oficina sem natureza da despesa',
  'linha 4 • classifique', 'MKZ 6729');
ok('tipo, rótulo e linha vêm preenchidos',
  c && c.tipo === 'lista' && c.linha === 4 && c.rotulo, JSON.stringify(c));
ok('as opções da lista vêm junto', c && c.opcoes && c.opcoes.length > 0, JSON.stringify(c && c.opcoes));
const cv = ctx.correcaoDaPendencia_(V, 'Veículo ativo sem centro de custo', '', 'AAA1A11');
ok('correção de cadastro vem marcada como somenteAdmin', cv && cv.somenteAdmin === true, JSON.stringify(cv));

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
