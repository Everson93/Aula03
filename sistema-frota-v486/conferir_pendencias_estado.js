/**
 * Revisao do modulo de pendencias: o que acontece ENTRE duas revalidacoes.
 *
 * Tres defeitos achados na revisao, todos da mesma familia — estado que o
 * operador escreveu (status, observacao) sendo perdido ou aplicado no item
 * errado, sempre em silencio:
 *
 *  1. RESOLVIDO escondia problema que continuava existindo. Antes da V4.9.1,
 *     marcar resolvido era a UNICA forma de limpar a tela, e o habito ficou.
 *     Um lancamento sem centro de custo sumia da contagem e seguia errado.
 *  2. A chave da pendencia incluia o NUMERO DA LINHA. Excluir um lancamento
 *     sobe as linhas de baixo uma casa, entao uma exclusao apagava o status e
 *     a observacao de todas as pendencias abaixo.
 *  3. webAtualizarPendencia gravava num numero de linha sem conferir se ainda
 *     era a mesma pendencia.
 */
const fs = require('fs');
const vm = require('vm');

const PEND = [];   // linhas 3.. da aba de pendencias (indice 0 = linha 3)

function fakePend() {
  return {
    getLastRow: () => PEND.length + 2,
    getMaxRows: () => PEND.length + 50,
    getDataRange: () => ({ breakApart: () => {} }),
    clear: () => {},
    clearConditionalFormatRules: () => {},
    setConditionalFormatRules: () => {},
    setFrozenRows: () => {},
    setColumnWidth: () => {},
    getRange: (linha, col, nL, nC) => ({
      getValue: () => { const l = PEND[linha - 3]; return l ? l[col - 1] : ''; },
      setValue: function (v) {
        if (!PEND[linha - 3]) PEND[linha - 3] = new Array(7).fill('');
        PEND[linha - 3][col - 1] = v;
        return this;
      },
      getValues: () => {
        const saida = [];
        for (let i = 0; i < (nL || 1); i++) {
          const o = PEND[linha - 3 + i] || new Array(7).fill('');
          const l = [];
          for (let j = 0; j < (nC || 1); j++) l.push(o[col - 1 + j] === undefined ? '' : o[col - 1 + j]);
          saida.push(l);
        }
        return saida;
      },
      setValues: (vals) => {
        vals.forEach((l, i) => {
          const alvo = linha - 3 + i;
          PEND[alvo] = PEND[alvo] || new Array(7).fill('');
          l.forEach((v, j) => { PEND[alvo][col - 1 + j] = v; });
        });
      },
      getDisplayValues: function () {
        return this.getValues().map(function (l) {
          return l.map(function (v) { return String(v == null ? '' : v); });
        });
      },
      setNumberFormat: function () { return this; },
      setFontColor: function () { return this; },
      setBackground: function () { return this; },
      setFontWeight: function () { return this; },
      setFontSize: function () { return this; },
      setVerticalAlignment: function () { return this; },
      setFormula: function () { return this; },
      merge: function () { return this; },
      setDataValidation: function () { return this; },
      createFilter: function () { return this; },
    }),
    setRowHeight: () => {},
  };
}

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => null, flush: () => {},
    newDataValidation: () => ({ requireValueInList: function () { return this; },
      setAllowInvalid: function () { return this; }, build: () => ({}) }),
    newConditionalFormatRule: () => ({ whenFormulaSatisfied: function () { return this; },
      setBackground: function () { return this; }, setRanges: function () { return this; },
      build: () => ({}) }),
  },
  Utilities: { getUuid: () => 'x', formatDate: () => '' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    chavePendencia_, casarAnteriores_, resolvidoSobrevive_, escreverConferencia_,
    webAtualizarPendencia, contarPendenciasConferencia_, specDaPendencia_, ABAS,
  });
  exigirExecucaoMutacao_ = function () {};
  autorizarContextoWeb_ = function () { return { perfil: 'ADMIN' }; };
  registrarLog_ = function () {};
  invalidarCacheInicio_ = function () {};
  removerFiltro_ = function () {};
  estilizarCabecalho_ = function () {};
  fx_ = function (x) { return x; };
  dataHoraBR_ = function () { return 'NOW()'; };
  depreciacaoPodeContarComoPendencia_ = function () { return true; };
  ehPendenciaDepreciacao_ = function () { return false; };
  listaCentros_ = function () { return []; };
  listaCategorias_ = function () { return []; };
  listaPlacas_ = function () { return []; };
`, ctx, { filename: 'Codigo.gs' });

ctx.garantirAbaPendencias_ = function () { return fakePend(); };
ctx.aba_ = function () { return fakePend(); };
ctx.ss_ = function () { return { getSheetByName: () => fakePend() }; };

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}
function problema(origem, placa, nome, detalhe) { return [origem, placa, nome, detalhe]; }
function estado() {
  return PEND.filter(function (l) { return l && l[0]; })
    .map(function (l) { return { problema: l[2], detalhe: l[3], status: l[4], obs: l[5] }; });
}
function marcar(i, status, obs) { PEND[i][4] = status; PEND[i][5] = obs || ''; }

const L = ctx.ABAS.LANCAMENTOS;

// ---- 1. a chave não depende mais do número da linha ------------------------
console.log('\n1. Chave estável a deslocamento de linha');
ok('"linha 10 • x" e "linha 7 • x" têm a MESMA chave',
  ctx.chavePendencia_(problema(L, 'AAA1A11', 'Valor negativo', 'linha 10 • x')) ===
  ctx.chavePendencia_(problema(L, 'AAA1A11', 'Valor negativo', 'linha 7 • x')),
  'excluir um lançamento sobe as linhas de baixo; com o número na chave, todas perdiam o status');
ok('mas detalhes diferentes continuam sendo chaves diferentes',
  ctx.chavePendencia_(problema(L, 'AAA1A11', 'Valor negativo', 'linha 10 • R$ -5')) !==
  ctx.chavePendencia_(problema(L, 'AAA1A11', 'Valor negativo', 'linha 10 • R$ -9')));
ok('placas diferentes continuam separadas',
  ctx.chavePendencia_(problema(L, 'AAA1A11', 'Valor negativo', 'linha 10')) !==
  ctx.chavePendencia_(problema(L, 'BBB2B22', 'Valor negativo', 'linha 10')));

console.log('\n2. O caso real: exclusão de lançamento desloca tudo abaixo');
PEND.length = 0;
ctx.escreverConferencia_([
  problema(L, 'AAA1A11', 'Oficina sem NF/OS/documento', 'linha 10 • informe o documento'),
  problema(L, 'BBB2B22', 'Oficina sem NF/OS/documento', 'linha 20 • informe o documento'),
]);
marcar(0, 'EM ANÁLISE', 'cobrando a oficina');
marcar(1, 'EM ANÁLISE', 'nota perdida, pedindo 2ª via');
// o operador exclui um lançamento acima: tudo abaixo sobe uma casa
ctx.escreverConferencia_([
  problema(L, 'AAA1A11', 'Oficina sem NF/OS/documento', 'linha 9 • informe o documento'),
  problema(L, 'BBB2B22', 'Oficina sem NF/OS/documento', 'linha 19 • informe o documento'),
]);
let e = estado();
ok('o status sobreviveu ao deslocamento',
  e[0].status === 'EM ANÁLISE' && e[1].status === 'EM ANÁLISE',
  JSON.stringify(e.map(function (x) { return x.status; })));
ok('e a observação também',
  e[0].obs === 'cobrando a oficina' && e[1].obs === 'nota perdida, pedindo 2ª via',
  JSON.stringify(e.map(function (x) { return x.obs; })));

console.log('\n3. Duas pendências iguais do mesmo veículo não se misturam');
PEND.length = 0;
ctx.escreverConferencia_([
  problema(L, 'AAA1A11', 'Valor negativo', 'linha 5'),
  problema(L, 'AAA1A11', 'Valor negativo', 'linha 8'),
]);
marcar(0, 'EM ANÁLISE', 'primeira');
marcar(1, 'PENDENTE', '');
ctx.escreverConferencia_([
  problema(L, 'AAA1A11', 'Valor negativo', 'linha 5'),
  problema(L, 'AAA1A11', 'Valor negativo', 'linha 8'),
]);
e = estado();
ok('a primeira mantém EM ANÁLISE e a segunda segue PENDENTE',
  e[0].status === 'EM ANÁLISE' && e[1].status === 'PENDENTE',
  JSON.stringify(e.map(function (x) { return x.status + '/' + x.obs; })) +
  ' — um mapa simples daria o mesmo status às duas');

// ---- 4. RESOLVIDO não esconde problema que persiste ------------------------
console.log('\n4. RESOLVIDO em problema que tem conserto');
PEND.length = 0;
ctx.escreverConferencia_([problema(L, 'AAA1A11', 'Oficina sem detalhe da peça/serviço', 'linha 5 • descreva')]);
marcar(0, 'RESOLVIDO', 'falei com o Marcos');
ctx.escreverConferencia_([problema(L, 'AAA1A11', 'Oficina sem detalhe da peça/serviço', 'linha 5 • descreva')]);
e = estado();
ok('volta a PENDENTE, porque o coletor ainda o encontra', e[0].status === 'PENDENTE',
  e[0].status + ' — o dado continua errado por mais que alguém tenha dito que não');
ok('a observação do operador é preservada', /falei com o Marcos/.test(e[0].obs), e[0].obs);
ok('e o motivo da volta é anotado', /continua na base/.test(e[0].obs), e[0].obs);

console.log('\n5. RESOLVIDO em problema de julgamento sobrevive');
PEND.length = 0;
ctx.escreverConferencia_([[ctx.ABAS.RESUMO, 'CCC3C33', 'Sem nenhum custo no período', 'parado']]);
marcar(0, 'RESOLVIDO', 'veículo encostado, previsto');
ctx.escreverConferencia_([[ctx.ABAS.RESUMO, 'CCC3C33', 'Sem nenhum custo no período', 'parado']]);
e = estado();
ok('continua RESOLVIDO', e[0].status === 'RESOLVIDO',
  'não tem conserto por campo: é julgamento do operador, e repetir o aviso todo mês ' +
  'ensina a ignorar a tela');
ok('resolvidoSobrevive_ separa os dois casos',
  ctx.resolvidoSobrevive_('Sem nenhum custo no período') === true &&
  ctx.resolvidoSobrevive_('Oficina sem detalhe da peça/serviço') === false);

console.log('\n6. E some da contagem só quando é legítimo');
PEND.length = 0;
ctx.escreverConferencia_([
  problema(L, 'AAA1A11', 'Oficina sem detalhe da peça/serviço', 'linha 5 • descreva'),
  [ctx.ABAS.RESUMO, 'CCC3C33', 'Sem nenhum custo no período', 'parado'],
]);
marcar(0, 'RESOLVIDO', '');
marcar(1, 'RESOLVIDO', '');
ctx.escreverConferencia_([
  problema(L, 'AAA1A11', 'Oficina sem detalhe da peça/serviço', 'linha 5 • descreva'),
  [ctx.ABAS.RESUMO, 'CCC3C33', 'Sem nenhum custo no período', 'parado'],
]);
ok('a contagem volta a enxergar o que tem conserto', ctx.contarPendenciasConferencia_() === 1,
  String(ctx.contarPendenciasConferencia_()) + ' — o de julgamento continua fora da conta');

// ---- 7. gravar status no item certo ----------------------------------------
console.log('\n7. Salvar status com a lista mudada por baixo');
PEND.length = 0;
ctx.escreverConferencia_([
  problema(L, 'AAA1A11', 'Valor negativo', 'linha 5'),
  problema(L, 'BBB2B22', 'Oficina sem NF/OS/documento', 'linha 9'),
]);
let r = ctx.webAtualizarPendencia('t', 3, 'EM ANÁLISE', 'ok', 'Valor negativo');
ok('grava quando o problema confere', r.ok === true, JSON.stringify(r));
ok('e grava na linha certa', PEND[0][4] === 'EM ANÁLISE', JSON.stringify(PEND[0]));

r = ctx.webAtualizarPendencia('t', 4, 'RESOLVIDO', 'resolvi', 'Valor negativo');
ok('RECUSA quando a linha virou outra pendência', r.ok === false, JSON.stringify(r));
ok('a mensagem nomeia o que estava e o que está',
  /Valor negativo/.test(r.mensagem) && /Oficina sem NF/.test(r.mensagem), r.mensagem);
ok('e nada foi gravado na pendência alheia', PEND[1][4] !== 'RESOLVIDO', JSON.stringify(PEND[1]));
ok('pede recarregar a tela', r.recarregar === true);

r = ctx.webAtualizarPendencia('t', 4, 'EM ANÁLISE', 'x', '');
ok('sem o esperado, continua funcionando (compatível com tela antiga)', r.ok === true,
  JSON.stringify(r));

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
