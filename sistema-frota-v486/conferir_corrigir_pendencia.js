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
    NATUREZAS_OFICINA, TIPOS_DESPESA, specDaPendencia_, acaoDaPendencia_,
    webAcaoPendencia, travaCompetenciaFechada_, ACOES_PENDENCIA_,
    opcoesDaLista_, listasDeCorrecao_,
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
  listaPlacas_ = function () { return ['AAA1A11', 'BBB2B22', 'MKZ6729']; };
  competenciasFechadas_ = function () { return __fechadas; };
  mesCompetenciaDaData_ = function (d) {
    var m = d.getMonth() + 1;
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
  };
  garantirIdsLancamentos_ = function () { __ids++; return 7; };
  __fechadas = {};
  __ids = 0;
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
// Até a V4.9.2 esta prova dizia o contrário: "data fica de fora". Datas
// entraram, mas com a trava de competência fechada — ver bloco 8. A prova foi
// invertida junto com a decisão, não apagada.
ok('data agora É corrigível (a proteção virou trava, não exclusão)',
  ctx.correcaoDaPendencia_(L, 'Data inválida', 'linha 2', 'AAA1A11') !== null);
ok('e vem marcada como campo de data',
  ctx.correcaoDaPendencia_(L, 'Data inválida', 'linha 2', 'AAA1A11').campos[0].tipo === 'data');
ok('detalhe sem "linha N" não vira campo editável',
  ctx.correcaoDaPendencia_(L, 'Oficina sem detalhe da peça/serviço', 'sem número', 'AAA1A11') === null,
  'na dúvida sobre a linha, é melhor não oferecer do que gravar no lugar errado');

// ---- 7. a tela recebe o que precisa -----------------------------------------
console.log('\n7. O que a tela recebe');
const c = ctx.correcaoDaPendencia_(L, 'Oficina sem natureza da despesa',
  'linha 4 • classifique', 'MKZ 6729');
// A correção passou a devolver uma LISTA de campos: preço fora da curva
// oferece valor e quantidade, e um formato só para os dois casos evita dois
// caminhos de código.
ok('tipo, rótulo e linha vêm preenchidos',
  c && c.linha === 4 && c.campos.length === 1 && c.campos[0].tipo === 'lista' &&
  c.campos[0].rotulo, JSON.stringify(c));
// A spec passou a nomear a lista em vez de carregá-la: as opções viajam UMA vez
// na resposta, não em cada pendência. Ver opcoesDaLista_.
ok('a correção nomeia a lista a usar', c && c.campos[0].lista === 'naturezas',
  JSON.stringify(c && c.campos));
ok('e o nome resolve numa lista não vazia',
  ctx.opcoesDaLista_('naturezas').length > 0, JSON.stringify(ctx.opcoesDaLista_('naturezas')));
ok('nome desconhecido devolve lista vazia, sem quebrar',
  JSON.stringify(ctx.opcoesDaLista_('inexistente')) === '[]');
const cv = ctx.correcaoDaPendencia_(V, 'Veículo ativo sem centro de custo', '', 'AAA1A11');
ok('correção de cadastro vem marcada como somenteAdmin', cv && cv.somenteAdmin === true, JSON.stringify(cv));

// ---- 8. datas: a trava da competência fechada ------------------------------
// Datas ficaram de fora ate a V4.9.2 porque mudam a COMPETENCIA do lancamento.
// Entraram com trava nos DOIS lados: nao se empurra despesa para dentro de um
// mes assinado, e tambem nao se tira de dentro dele — tirar muda o total e o
// hash por tras, e o fechamento deixa de valer sem ninguem saber.
console.log('\n8. Correção de data e competência fechada');
const dataNoVm = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0); })', ctx);

montarBase();
ctx.__fechadas = {};
let lpd = pend(L, 'AAA1A11', 'Data inválida', 'linha 2');
ABAS_FAKE[L][0][ctx.COL_LANC.DATA - 1] = '';
r = ctx.webCorrigirPendencia('t', lpd, '2026-07-15');
ok('com nenhum mês fechado, a data é gravada', r.ok === true, JSON.stringify(r));
// `instanceof Date` nao atravessa realms: este Date nasceu DENTRO do vm, com
// outro construtor. Object.prototype.toString nao depende do realm.
function ehData(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
ok('gravou um Date, não texto', ehData(ABAS_FAKE[L][0][ctx.COL_LANC.DATA - 1]),
  Object.prototype.toString.call(ABAS_FAKE[L][0][ctx.COL_LANC.DATA - 1]));
ok('e no dia certo — sem recuar um dia por fuso',
  ABAS_FAKE[L][0][ctx.COL_LANC.DATA - 1].getDate() === 15,
  'dia ' + ABAS_FAKE[L][0][ctx.COL_LANC.DATA - 1].getDate());

montarBase();
ctx.__fechadas = { '2026-06': true };
lpd = pend(L, 'AAA1A11', 'Data inválida', 'linha 2');
ABAS_FAKE[L][0][ctx.COL_LANC.DATA - 1] = '';
r = ctx.webCorrigirPendencia('t', lpd, '2026-06-10');
ok('empurrar para dentro de um mês FECHADO é recusado', r.ok === false, JSON.stringify(r));
ok('a mensagem nomeia a competência', /2026-06/.test(r.mensagem || ''), r.mensagem);
ok('nada foi gravado', !ehData(ABAS_FAKE[L][0][ctx.COL_LANC.DATA - 1]));

montarBase();
ctx.__fechadas = { '2026-06': true };
lpd = pend(L, 'AAA1A11', 'Lançamento em período futuro', 'linha 2');
ABAS_FAKE[L][0][ctx.COL_LANC.DATA - 1] = dataNoVm(2026, 6, 10);   // ja esta num mes fechado
r = ctx.webCorrigirPendencia('t', lpd, '2026-07-10');
ok('TIRAR de um mês fechado também é recusado', r.ok === false, JSON.stringify(r));
ok('o lançamento ficou onde estava',
  ABAS_FAKE[L][0][ctx.COL_LANC.DATA - 1].getMonth() === 5);

montarBase();
ctx.__fechadas = {};
lpd = pend(L, 'AAA1A11', 'Data inválida', 'linha 2');
ok('data inexistente é recusada', ctx.webCorrigirPendencia('t', lpd, '2026-02-30').ok === false);
ok('texto que não é data é recusado', ctx.webCorrigirPendencia('t', lpd, '15/07/2026').ok === false,
  'o <input type=date> manda AAAA-MM-DD; outro formato é sinal de algo errado');
ok('data muito no futuro é recusada', ctx.webCorrigirPendencia('t', lpd, '2099-01-01').ok === false);

// ---- 9. as novas correções de campo ----------------------------------------
console.log('\n9. Campos que passaram a ser corrigíveis');
montarBase();
lpd = pend(L, 'ZZZ9Z99', 'Placa não cadastrada em Veículos', 'linha 2');
ABAS_FAKE[L][0][ctx.COL_LANC.PLACA - 1] = 'ZZZ9Z99';
ok('placa fora da lista é recusada', ctx.webCorrigirPendencia('t', lpd, 'QQQ0Q00').ok === false);
r = ctx.webCorrigirPendencia('t', lpd, 'BBB2B22');
ok('placa da lista é aceita', r.ok === true, JSON.stringify(r));
ok('trocou a placa do lançamento',
  ABAS_FAKE[L][0][ctx.COL_LANC.PLACA - 1] === 'BBB2B22');

montarBase();
const vi = new Array(20).fill('');
vi[ctx.COL_VEIC.PLACA - 1] = 'AAA1A11';
vi[ctx.COL_VEIC.ATIVO - 1] = 'NAO';
ABAS_FAKE[V].push(vi);
lpd = pend(V, 'AAA1A11', 'Lançamento do período em veículo inativo', '');
ctx.__perfil = 'ADMIN';
r = ctx.webCorrigirPendencia('t', lpd, 'SIM');
ok('ADMIN reativa o veículo', r.ok === true && ABAS_FAKE[V][0][ctx.COL_VEIC.ATIVO - 1] === 'SIM',
  JSON.stringify(r));

// ---- 10. busca por prefixo ---------------------------------------------------
console.log('\n10. Problemas cujo nome carrega o valor');
const cpref = ctx.correcaoDaPendencia_(V, 'Descrição do veículo com erro (#REF!)', '', 'AAA1A11');
ok('"Descrição do veículo com erro (#REF!)" encontra a spec por prefixo',
  cpref !== null && cpref.campos[0].rotulo === 'Descrição', JSON.stringify(cpref));
ok('e a de Categoria vai para a coluna da Categoria',
  ctx.specDaPendencia_('Categoria do veículo com erro (#N/A)').coluna === ctx.COL_VEIC.CATEGORIA);
ok('prefixo não casa com problema diferente',
  ctx.specDaPendencia_('Veículo ativo sem categoria').coluna === ctx.COL_VEIC.CATEGORIA);
ok('problema sem spec nenhuma continua devolvendo null',
  ctx.specDaPendencia_('Alguma coisa que não existe') === null);

// ---- 11. ações para o que não é campo ---------------------------------------
console.log('\n11. O que não se resolve por um campo ganhou caminho');
montarBase();
ctx.__perfil = 'ADMIN';
lpd = pend(L, 'AAA1A11', 'Lançamento sem ID de auditoria', 'linha 2');
r = ctx.webAcaoPendencia('t', lpd);
ok('a rotina de IDs roda', r.ok === true && ctx.__ids === 1, JSON.stringify(r));
ok('e diz quantos foram', /7 lançamento/.test(r.mensagem || ''), r.mensagem);

montarBase();
lpd = pend(ctx.ABAS.CENTROS, '', 'Soma dos percentuais de rateio não fecha 100%', '99,5%');
r = ctx.webAcaoPendencia('t', lpd);
ok('atalho não é rotina: webAcaoPendencia recusa', r.ok === false, JSON.stringify(r));
const atalho = ctx.acaoDaPendencia_('Soma dos percentuais de rateio não fecha 100%');
ok('mas a tela recebe o atalho para centros',
  atalho && atalho.tipo === 'atalho' && atalho.tela === 'centros', JSON.stringify(atalho));
ok('"Sem nenhum custo no período" é informativo, não defeito',
  ctx.acaoDaPendencia_('Sem nenhum custo no período').tipo === 'informativo');
ok('toda ação traz explicação, senão o operador fica sem saber o porquê',
  Object.keys(ctx.ACOES_PENDENCIA_).every(function (k) {
    return String(ctx.ACOES_PENDENCIA_[k].explicacao || '').length > 20;
  }));

console.log('\n12. Nenhuma correção carrega a lista inteira junto');
// Guarda de regressão: a lista de opções não pode voltar para dentro do item.
// Com 110 pendências e 170 veículos, as cópias idênticas eram 117 KB de JSON —
// 63% da resposta — e 110 reconstruções da lista por requisição.
const comLista = [];
Object.keys(ctx.CORRECOES_PENDENCIA_).forEach(function (nome) {
  const spec = ctx.CORRECOES_PENDENCIA_[nome];
  if (spec.opcoes !== undefined) comLista.push(nome);
  if (spec.tipo === 'lista' && !spec.lista) comLista.push(nome + ' (tipo lista sem nome de lista)');
});
ok('toda spec de lista nomeia a lista, nenhuma carrega a lista', comLista.length === 0,
  comLista.join(', '));
const amostra = ctx.correcaoDaPendencia_(L, 'Oficina sem natureza da despesa',
  'linha 4 • classifique', 'MKZ 6729');
ok('e o que vai para a tela não traz array de opções',
  amostra && amostra.campos.every(function (x) {
    return x.opcoes === undefined && (x.tipo !== 'lista' || typeof x.lista === 'string');
  }),
  JSON.stringify(amostra));
const listas = ctx.listasDeCorrecao_();
ok('listasDeCorrecao_ cobre todas as listas nomeadas',
  Object.keys(listas).length >= 5, JSON.stringify(Object.keys(listas)));
ok('e cada nome resolve numa lista', Object.keys(listas).every(function (k) {
  return Array.isArray(listas[k]);
}), JSON.stringify(listas));

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
