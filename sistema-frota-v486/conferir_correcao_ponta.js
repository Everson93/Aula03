/**
 * Ponta a ponta: corrigir uma pendencia pela tela e conferir que o COLETOR DE
 * VERDADE para de reporta-la.
 *
 * Esta suite existe porque a outra nao provava isso. conferir_corrigir_pendencia.js
 * stubba `coletarProblemas_ = function () { return []; }` — entao ela confirma
 * que o campo foi gravado e que a revalidacao foi CHAMADA, e nada mais. Se a
 * gravacao nao satisfizesse a condicao que gerou a pendencia, o teste passaria
 * igual e a pendencia continuaria na tela.
 *
 * E o mesmo vicio de sempre, pela quinta vez: o teste olha um lado do contrato.
 * Aqui os dois lados sao `webCorrigirPendencia` (quem grava) e `coletarProblemas_`
 * (quem julga) — e so exercitando os dois juntos da para afirmar que corrigir
 * resolve.
 */
const fs = require('fs');
const vm = require('vm');

const ABAS_FAKE = {};

/**
 * Planilha falsa com indexacao 1-based de verdade: dados[0] e a LINHA 1.
 *
 * A primeira versao mapeava dados[linha - 2], o que funciona para abas cujos
 * dados comecam na linha 2 e quebra para a de Pendencias, cujo cabecalho fica na
 * 2 e os dados na 3. O cabecalho entrava na lista como se fosse pendencia. Um
 * fixture errado reprova codigo certo — e, pior, pode aprovar codigo errado.
 */
function fake(nome, largura) {
  const dados = ABAS_FAKE[nome] || (ABAS_FAKE[nome] = []);
  function linhaDe(n) {
    while (dados.length < n) dados.push(new Array(largura).fill(''));
    if (!dados[n - 1]) dados[n - 1] = new Array(largura).fill('');
    return dados[n - 1];
  }
  const api = {
    getLastRow: () => dados.length,
    getLastColumn: () => largura,
    getMaxRows: () => dados.length + 50,
    getDataRange: () => api.getRange(1, 1, Math.max(dados.length, 1), largura),
    getRange: (linha, col, nL, nC) => ({
      getValue: () => { const l = dados[linha - 1]; return l ? l[col - 1] : ''; },
      setValue: function (v) { linhaDe(linha)[col - 1] = v; return this; },
      getValues: () => {
        const saida = [];
        for (let i = 0; i < (nL || 1); i++) {
          const o = dados[linha - 1 + i] || new Array(largura).fill('');
          const l = [];
          for (let j = 0; j < (nC || 1); j++) l.push(o[col - 1 + j] === undefined ? '' : o[col - 1 + j]);
          saida.push(l);
        }
        return saida;
      },
      getDisplayValues: function () {
        return this.getValues().map(function (l) {
          return l.map(function (v) { return String(v == null ? '' : v); });
        });
      },
      setValues: (vals) => {
        vals.forEach((l, i) => {
          const alvo = linhaDe(linha + i);
          l.forEach((v, j) => { alvo[col - 1 + j] = v; });
        });
      },
      clearContent: function () { return this; },
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
      breakApart: function () { return this; },
    }),
    clear: () => { dados.length = 0; },
    clearConditionalFormatRules: () => {},
    setConditionalFormatRules: () => {},
    setFrozenRows: () => {},
    setColumnWidth: () => {},
    setRowHeight: () => {},
  };
  return api;
}

const ctx = {
  console: { log: console.log, error: (m) => { ERROS.push(String(m)); } },
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
const ERROS = [];
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    coletarProblemas_, escreverConferencia_, webCorrigirPendencia, webPendencias,
    contarPendenciasConferencia_, ABAS, COL_LANC, COL_VEIC, TOTAL_COL_LANC,
    TOTAL_COL_VEIC, L_, NATUREZAS_OFICINA, TIPOS_DESPESA,
  });
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirPerfilToken_ = function () { return { perfil: 'ADMIN' }; };
  autorizarContextoWeb_ = function () { return { perfil: 'ADMIN' }; };
  registrarLog_ = function () {};
  invalidarCacheInicio_ = function () {};
  invalidarCacheSaude_ = function () {};
  marcarResumoDesatualizado_ = function () {};
  garantirResumoAtualizado_ = function () {};
  removerFiltro_ = function () {};
  estilizarCabecalho_ = function () {};
  fx_ = function (x) { return x; };
  dataHoraBR_ = function () { return 'NOW()'; };
  garantirLinhas_ = function () {};
  garantirColunas_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  listaCentros_ = function () { return ['DEPÓSITO', 'Loja 08']; };
  listaCategorias_ = function () { return ['Leve', 'Pesado']; };
  listaPlacas_ = function () { return ['AAA1A11', 'BBB2B22']; };
  depreciacaoPodeContarComoPendencia_ = function () { return false; };
  statusDepreciacaoMensal_ = function () { return { itens: [], liberada: false }; };
  quantidadeLancamentosReais_ = function () { return __nLanc(); };
  formatarData_ = function (d) {
    if (!(d instanceof Date)) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  };
  periodoAtual_ = function () { return __periodo; };
`, ctx, { filename: 'Codigo.gs' });

const dataVm = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0); })', ctx);
ctx.__periodo = { inicio: dataVm(2026, 10, 26), fim: dataVm(2026, 11, 25), mesRef: '2026-11' };
ctx.__nLanc = function () { return Math.max(0, (ABAS_FAKE[ctx.ABAS.LANCAMENTOS] || []).length - 1); };

const LARG = {};
LARG[ctx.ABAS.LANCAMENTOS] = ctx.TOTAL_COL_LANC;
LARG[ctx.ABAS.VEICULOS] = ctx.TOTAL_COL_VEIC;
LARG[ctx.ABAS.CENTROS] = 3;
LARG[ctx.ABAS.ODOMETRO] = 3;
LARG[ctx.ABAS.RESUMO] = 24;
LARG[ctx.ABAS.CONFERENCIA] = 7;
ctx.aba_ = function (nome) { return fake(nome, LARG[nome] || 10); };
ctx.ss_ = function () {
  return { getSheetByName: function (n) { return ABAS_FAKE[n] ? fake(n, LARG[n] || 10) : null; } };
};
ctx.garantirAbaPendencias_ = function () { return fake(ctx.ABAS.CONFERENCIA, 7); };
ctx.lerOdometro_ = function () { return ABAS_FAKE[ctx.ABAS.ODOMETRO] || []; };

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}

function montar() {
  ERROS.length = 0;
  ABAS_FAKE[ctx.ABAS.LANCAMENTOS] = [];
  ABAS_FAKE[ctx.ABAS.ODOMETRO] = [];
  ABAS_FAKE[ctx.ABAS.RESUMO] = [];
  ABAS_FAKE[ctx.ABAS.CONFERENCIA] = [];
  const v = new Array(ctx.TOTAL_COL_VEIC).fill('');
  v[ctx.COL_VEIC.PLACA - 1] = 'AAA1A11';
  v[ctx.COL_VEIC.DESCRICAO - 1] = 'Caminhão';
  v[ctx.COL_VEIC.CATEGORIA - 1] = 'Pesado';
  v[ctx.COL_VEIC.CENTRO - 1] = 'Loja 08';
  v[ctx.COL_VEIC.ATIVO - 1] = 'SIM';
  ABAS_FAKE[ctx.ABAS.VEICULOS] = [new Array(ctx.TOTAL_COL_VEIC).fill('cab'), v];
  ABAS_FAKE[ctx.ABAS.CENTROS] = [['cab', 'cab', 'cab'],
    ['DEPÓSITO', 0.5, 'NAO'], ['Loja 08', 0.5, 'SIM']];
}

/** Lançamento de oficina no período aberto, propositalmente incompleto. */
function oficinaIncompleta() {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = dataVm(2026, 11, 10);
  l[ctx.L_.PLACA] = 'AAA1A11';
  l[ctx.L_.TIPO] = 'Oficina Despesa';
  l[ctx.L_.VALOR] = 500;
  l[ctx.L_.DOCUMENTO] = 'OS-1';
  l[ctx.L_.CENTRO] = 'Loja 08';
  l[ctx.L_.CATEGORIA] = 'Pesado';
  l[ctx.L_.ID] = 'LAN-1';
  l[ctx.L_.NATUREZA_OFICINA] = 'Peça';
  l[ctx.L_.DETALHE_OFICINA] = '';     // <- o problema
  ABAS_FAKE[ctx.ABAS.LANCAMENTOS] = [new Array(ctx.TOTAL_COL_LANC).fill('cab'), l];
}

/** Pendências ficam da linha 3 para baixo; 1 é o título e 2 o cabeçalho. */
function nomesDasPendencias() {
  return (ABAS_FAKE[ctx.ABAS.CONFERENCIA] || []).slice(2)
    .filter(function (l) { return l && l[0] && String(l[0]).trim() !== 'Nenhum problema encontrado.'; })
    .map(function (l) { return l[2]; });
}
function linhaDaPendencia(nome) {
  const i = (ABAS_FAKE[ctx.ABAS.CONFERENCIA] || [])
    .findIndex(function (l) { return l && l[2] === nome; });
  return i === -1 ? -1 : i + 1;   // indice 0 = linha 1
}

console.log('\n1. O coletor acha o problema');
montar();
oficinaIncompleta();
ctx.escreverConferencia_(ctx.coletarProblemas_());
let nomes = nomesDasPendencias();
ok('"Oficina sem detalhe da peça/serviço" está na lista',
  nomes.indexOf('Oficina sem detalhe da peça/serviço') !== -1, JSON.stringify(nomes));

console.log('\n2. A PROVA QUE FALTAVA: corrigir faz a pendência sumir');
const linhaPend = linhaDaPendencia('Oficina sem detalhe da peça/serviço');
const r = ctx.webCorrigirPendencia('t', linhaPend, 'Troca do alternador');
ok('a correção é aceita', r.ok === true, JSON.stringify(r) + ' | erros: ' + JSON.stringify(ERROS));
ok('o campo foi gravado no lançamento',
  ABAS_FAKE[ctx.ABAS.LANCAMENTOS][1][ctx.L_.DETALHE_OFICINA] === 'Troca do alternador',
  JSON.stringify(ABAS_FAKE[ctx.ABAS.LANCAMENTOS][1][ctx.L_.DETALHE_OFICINA]));
nomes = nomesDasPendencias();
ok('e o COLETOR REAL não a reporta mais',
  nomes.indexOf('Oficina sem detalhe da peça/serviço') === -1,
  'ainda na lista: ' + JSON.stringify(nomes) +
  '\n        -> é exatamente o sintoma relatado: "mesmo corrigindo, elas permanecem ali"');
ok('a revalidação não engoliu nenhum erro', ERROS.length === 0, JSON.stringify(ERROS));
ok('e a contagem reflete isso', r.pendentes === ctx.contarPendenciasConferencia_(),
  r.pendentes + ' x ' + ctx.contarPendenciasConferencia_());

console.log('\n3. Corrigir com valor que NÃO resolve mantém a pendência');
montar();
oficinaIncompleta();
ABAS_FAKE[ctx.ABAS.LANCAMENTOS][1][ctx.L_.NATUREZA_OFICINA] = '';   // outro problema
ctx.escreverConferencia_(ctx.coletarProblemas_());
const antes = nomesDasPendencias().length;
const lp = linhaDaPendencia('Oficina sem detalhe da peça/serviço');
ctx.webCorrigirPendencia('t', lp, 'Troca do alternador');
const depois = nomesDasPendencias();
ok('some só a que foi corrigida', depois.length === antes - 1,
  antes + ' -> ' + depois.length + ' ' + JSON.stringify(depois));
ok('a outra continua, como deve', depois.indexOf('Oficina sem natureza da despesa') !== -1,
  JSON.stringify(depois));

console.log('\n3b. O caso do gás: corrigir o campo errado não resolve, e o sistema DIZ');
// Caso real: "Preço por quilo fora da curva", R$ 63,90/kg num botijão. A
// correção oferecida é a QUANTIDADE — mas se o errado for o VALOR, nenhuma
// quantidade plausível resolve, e antes o item só voltava, sem explicação.
montar();
(function () {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = dataVm(2026, 11, 10);
  l[ctx.L_.PLACA] = 'AAA1A11';
  l[ctx.L_.TIPO] = 'Gás';
  l[ctx.L_.LITROS] = 20;
  // Valor grosseiramente errado (três mil num botijão). Precisa de mais de
  // 100 kg para sair da curva, e o maior botijão é 45 — então NENHUMA
  // quantidade plausível resolve, que é justamente o caso a cobrir.
  l[ctx.L_.VALOR] = 3000;
  l[ctx.L_.DOCUMENTO] = 'NF-7';
  l[ctx.L_.CENTRO] = 'Loja 08';
  l[ctx.L_.CATEGORIA] = 'Pesado';
  l[ctx.L_.ID] = 'LAN-G';
  ABAS_FAKE[ctx.ABAS.LANCAMENTOS] = [new Array(ctx.TOTAL_COL_LANC).fill('cab'), l];
})();
ctx.escreverConferencia_(ctx.coletarProblemas_());
ok('o problema aparece', nomesDasPendencias().indexOf('Preço por quilo fora da curva') !== -1,
  JSON.stringify(nomesDasPendencias()));
const lg = linhaDaPendencia('Preço por quilo fora da curva');
const rg = ctx.webCorrigirPendencia('t', lg, '45');   // o maior botijão que existe
ok('a quantidade é gravada', ABAS_FAKE[ctx.ABAS.LANCAMENTOS][1][ctx.L_.LITROS] === 45,
  String(ABAS_FAKE[ctx.ABAS.LANCAMENTOS][1][ctx.L_.LITROS]));
ok('o sistema avisa que NÃO resolveu', rg.resolvida === false, JSON.stringify(rg));
ok('e mostra o número recalculado', /66\.67\/kg/.test(rg.mensagem || ''), rg.mensagem);
ok('e diz onde consertar de verdade',
  /Corrigir \/ excluir lançamento/.test(rg.mensagem || ''), rg.mensagem);

console.log('\n3c. Corrigindo o campo certo, ele confirma que resolveu');
montar();
(function () {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = dataVm(2026, 11, 10);
  l[ctx.L_.PLACA] = 'AAA1A11';
  l[ctx.L_.TIPO] = 'Gás';
  l[ctx.L_.LITROS] = 1;            // botijão lançado como 1 unidade
  l[ctx.L_.VALOR] = 63.90;
  l[ctx.L_.DOCUMENTO] = 'NF-8';
  l[ctx.L_.CENTRO] = 'Loja 08';
  l[ctx.L_.CATEGORIA] = 'Pesado';
  l[ctx.L_.ID] = 'LAN-H';
  ABAS_FAKE[ctx.ABAS.LANCAMENTOS] = [new Array(ctx.TOTAL_COL_LANC).fill('cab'), l];
})();
ctx.escreverConferencia_(ctx.coletarProblemas_());
const rh = ctx.webCorrigirPendencia('t', linhaDaPendencia('Preço por quilo fora da curva'), '20');
ok('informa que resolveu', rh.resolvida === true, JSON.stringify(rh));
ok('e a pendência sai da lista',
  nomesDasPendencias().indexOf('Preço por quilo fora da curva') === -1,
  JSON.stringify(nomesDasPendencias()));

console.log('\n4. Quando a revalidação falha, o operador tem de saber');
// É o caso real de quem colou o código novo sem rodar "Instalar / atualizar":
// coletarProblemas_ chama garantirResumoAtualizado_, que lança com a aba Resumo
// na largura antiga. Antes isso virava uma frase mansa no fim de uma mensagem
// VERDE — o operador corrigia, via o item continuar na tela, e corrigia de novo.
montar();
oficinaIncompleta();
ctx.escreverConferencia_(ctx.coletarProblemas_());
const lpf = linhaDaPendencia('Oficina sem detalhe da peça/serviço');
const coletorBom = ctx.coletarProblemas_;
vm.runInContext('coletarProblemas_ = function () { throw new Error("Resumo com 20 colunas; esperadas 24"); };', ctx);
const rf = ctx.webCorrigirPendencia('t', lpf, 'Troca do alternador');
ok('o campo é gravado mesmo assim',
  ABAS_FAKE[ctx.ABAS.LANCAMENTOS][1][ctx.L_.DETALHE_OFICINA] === 'Troca do alternador',
  'a correção pegou; o que falhou foi só refazer a lista');
ok('a resposta marca que NÃO revalidou', rf.revalidou === false, JSON.stringify(rf));
ok('a mensagem diz que o item vai continuar aparecendo',
  /continua aparecendo na tela/.test(rf.mensagem || ''), rf.mensagem);
ok('e entrega o motivo real, não uma frase genérica',
  /20 colunas/.test(rf.mensagem || ''), rf.mensagem);
ok('e aponta o conserto', /Instalar \/ atualizar/.test(rf.mensagem || ''), rf.mensagem);
vm.runInContext('coletarProblemas_ = __coletorBom;', Object.assign(ctx, { __coletorBom: coletorBom }));
ok('com o coletor de volta, revalidar funciona',
  ctx.webCorrigirPendencia('t', linhaDaPendencia('Oficina sem natureza da despesa') > 0
    ? linhaDaPendencia('Oficina sem natureza da despesa') : lpf, 'Peça').revalidou !== false);

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
