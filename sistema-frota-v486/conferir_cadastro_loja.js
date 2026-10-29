/**
 * Prova do cadastro de loja (centro de custo).
 *
 * O nome da loja é CHAVE em quatro lugares: a aba Centros, o cadastro de
 * Veículos, o snapshot de centro de cada lançamento e o bloco de percentual
 * da competência — mais o parâmetro BASE_RATEIO. Renomear e esquecer um
 * deles não dá erro: cria uma segunda loja fantasma, com parte dos veículos
 * ou parte do rateio, e o rateio passa a distribuir sobre uma base diferente
 * sem ninguém ter pedido.
 *
 * É o mesmo padrão de defeito que mais voltou neste projeto — um contrato
 * com vários lados, conferido de um lado só. Por isso quase toda prova aqui
 * olha os quatro.
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

const ABASFAKE = {};
const diario = { log: [], params: {} };
let lockLivre = true;

function novaAba(linhas, colunas) {
  const aba = {
    linhas: linhas, colunas: colunas || 3, apagadas: [], escritas: 0,
    getLastRow: function () { return aba.linhas.length + 1; },
    getMaxRows: function () { return aba.linhas.length + 1; },
    insertRowsAfter: function () {},
    deleteRow: function (n) { aba.apagadas.push(n); aba.linhas.splice(n - 2, 1); },
    getRange: function (linha, coluna, nL, nC) {
      nL = nL || 1; nC = nC || 1;
      if (linha < 2) throw new Error('intervalo invade o cabeçalho');
      return {
        getValues: function () {
          const saida = [];
          for (let i = 0; i < nL; i++) {
            const l = aba.linhas[linha - 2 + i] || [];
            saida.push(l.slice(coluna - 1, coluna - 1 + nC));
          }
          return saida;
        },
        setValues: function (v) {
          aba.escritas++;
          if (v.length !== nL) throw new Error('setValues: linhas fora do intervalo');
          v.forEach(function (lv, i) {
            if (lv.length !== nC) throw new Error('setValues: colunas fora do intervalo');
            const d = aba.linhas[linha - 2 + i] || (aba.linhas[linha - 2 + i] = []);
            lv.forEach(function (x, j) { d[coluna - 1 + j] = x; });
          });
          return this;
        },
        setValue: function (x) {
          const d = aba.linhas[linha - 2] || (aba.linhas[linha - 2] = []);
          d[coluna - 1] = x;
          return this;
        },
        setNumberFormat: function () { return this; },
        clearContent: function () { return this; },
      };
    },
  };
  return aba;
}

const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'uuid', formatDate: () => '29/10/2026' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => lockLivre, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { criarCentro_, renomearCentro_, excluirCentro_,
    webCriarCentro, webRenomearCentro, webExcluirCentro, validarNomeCentro_, trocarNaColuna_,
    chaveCentro_, centroJaCadastrado_, ABAS, COL_VEIC, COL_LANC, L_, COL_RM,
    CENTRO_ADM_CENTRAL_, LIMITE_NOME_CENTRO_ });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  autorizarContextoWeb_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  emailContextoAtual_ = function () { return 'fulano@giassi.com.br'; };
  param_ = function (n) { return __params[n] === undefined ? '' : __params[n]; };
  gravarParam_ = function (n, v) { __params[n] = v; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26), fim: new Date(2026, 10, 25) }; };
  aba_ = function (nome) { return __aba(nome); };
  ss_ = function () { return { getSheetByName: function (n) { return __aba(n); } }; };
  registrarLog_ = function (a, b) { __diario.log.push(a + ' | ' + b); };
  invalidarCacheInicio_ = function () {};
  lerLancamentos_ = function () { return __lancamentos; };
  quantidadeLancamentosReais_ = function () { return __lancamentos.length; };
  invalidarCacheLancamentos_ = function () {};
  gravarPercentuaisCompetencia_ = function (comp, itens) {
    __diario.log.push('percentuais:' + comp + ':' +
      itens.map(function (i) { return i.centro + '=' + i.percentual; }).join('|'));
  };
  // A aba do rateio mensal é a mesma dublê das outras: assim a prova olha o
  // que foi ESCRITO na planilha, não o que uma função intermediária disse.
  lerRateioMensal_ = function () { return __aba(ABAS.RATEIO_MENSAL).linhas; };
`, ctx);

ctx.__diario = diario;
ctx.__params = diario.params;
ctx.__aba = function (nome) { return ABASFAKE[nome]; };
ctx.__lancamentos = [];

const data = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); })', ctx);

function lanc(centro, dt) {
  const l = new Array(20).fill('');
  l[ctx.L_.CENTRO] = centro; l[ctx.L_.DATA] = dt; l[ctx.L_.PLACA] = 'ABC 1D23';
  return l;
}
function veic(placa, centro) {
  const v = new Array(20).fill('');
  v[ctx.COL_VEIC.PLACA - 1] = placa; v[ctx.COL_VEIC.CENTRO - 1] = centro;
  return v;
}

function zerar() {
  lockLivre = true;
  diario.log.length = 0;
  diario.params.MES_REFERENCIA = '2026-10';
  diario.params.BASE_RATEIO = 'DEPÓSITO,EMPILHADEIRAS';
  ABASFAKE[ctx.ABAS.CENTROS] = novaAba([['Loja 01', 0.2, 'SIM'], ['Loja 02', 0.3, 'SIM'],
    ['DEPÓSITO', 0, 'NAO'], ['ADM Central', 0, 'NAO']]);
  ABASFAKE[ctx.ABAS.VEICULOS] = novaAba([veic('AAA 0001', 'Loja 01'),
    veic('BBB 0002', 'Loja 02'), veic('CCC 0003', 'Loja 02')], 20);
  ABASFAKE[ctx.ABAS.LANCAMENTOS] = novaAba([], 20);
  ctx.__lancamentos = [];
  ABASFAKE[ctx.ABAS.RATEIO_MENSAL] = novaAba([], 6);
  ctx.CENTROS_EXEC_CACHE_ = null;
  vm.runInContext('CENTROS_EXEC_CACHE_ = null; VEICULOS_EXEC_CACHE_ = null; RATEIO_MENSAL_EXEC_CACHE_ = null;', ctx);
}
function centros() { return ABASFAKE[ctx.ABAS.CENTROS].linhas.map(function (l) { return l[0]; }); }

// ================================================================ CRIAR
console.log('\n1. Cadastrar loja');
zerar();
let r = ctx.criarCentro_('Loja 19 — Tubarão');
ok('cadastra', r.ok === true, JSON.stringify(r));
ok('entra na aba Centros', centros().indexOf('Loja 19 — Tubarão') !== -1, centros().join(','));
ok('entra com 0% e recebendo rateio',
  ABASFAKE[ctx.ABAS.CENTROS].linhas[4][1] === 0 &&
  ABASFAKE[ctx.ABAS.CENTROS].linhas[4][2] === 'SIM',
  JSON.stringify(ABASFAKE[ctx.ABAS.CENTROS].linhas[4]));
ok('fica no Log', diario.log.some(function (l) { return /Criar loja/.test(l); }));

console.log('\n2. O que o cadastro recusa');
zerar();
ok('nome em branco', ctx.criarCentro_('   ').ok === false);
ok('loja repetida', ctx.criarCentro_('Loja 01').ok === false);
// Duas lojas que só diferem por caixa ou acento viram duas na tela e uma soma
// de rateio que não fecha.
ok('repetida com outra caixa', ctx.criarCentro_('loja 01').ok === false,
  JSON.stringify(ctx.criarCentro_('loja 01')));
ok('repetida com acento diferente', ctx.criarCentro_('DEPOSITO').ok === false,
  JSON.stringify(ctx.criarCentro_('DEPOSITO')));
ok('espaço a mais no meio não cria uma segunda',
  ctx.criarCentro_('Loja  01').ok === false, JSON.stringify(ctx.criarCentro_('Loja  01')));
// BASE_RATEIO guarda os centros separados por vírgula.
ok('vírgula no nome', ctx.criarCentro_('Loja 20, Centro').ok === false);
ok('ponto e vírgula no nome', ctx.criarCentro_('Loja 20; Centro').ok === false);
ok('nome gigante', ctx.criarCentro_(new Array(80).join('x')).ok === false);
ok('nenhuma delas entrou na aba', ABASFAKE[ctx.ABAS.CENTROS].linhas.length === 4,
  centros().join(','));

// ============================================================= RENOMEAR
console.log('\n3. Renomear acerta os quatro lugares');
zerar();
diario.params.BASE_RATEIO = 'Loja 02,EMPILHADEIRAS';
ctx.__lancamentos = [lanc('Loja 02', data(2026, 10, 30)), lanc('Loja 01', data(2026, 10, 30))];
ABASFAKE[ctx.ABAS.LANCAMENTOS] = novaAba([lanc('Loja 02', data(2026, 10, 30)),
  lanc('Loja 01', data(2026, 10, 30))], 20);
// A competência 2026-09 já está encerrada: o percentual dela é histórico e
// NÃO pode mudar de nome junto. Sem ela na fixture, renomear "só as abertas"
// e renomear "todas" dão no mesmo, e a prova não distingue.
ABASFAKE[ctx.ABAS.RATEIO_MENSAL] = novaAba([['2026-09', 'Loja 02', 0.25, 'SIM', '', ''],
  ['2026-10', 'Loja 01', 0.2, 'SIM', '', ''],
  ['2026-10', 'Loja 02', 0.3, 'SIM', '', '']], 6);
r = ctx.renomearCentro_('Loja 02', 'Loja 02 — Içara');
ok('renomeia', r.ok === true, JSON.stringify(r));
ok('1) a aba Centros', centros().indexOf('Loja 02 — Içara') !== -1, centros().join(','));
ok('2) o cadastro dos veículos',
  ABASFAKE[ctx.ABAS.VEICULOS].linhas.filter(function (v) {
    return v[ctx.COL_VEIC.CENTRO - 1] === 'Loja 02 — Içara'; }).length === 2,
  JSON.stringify(ABASFAKE[ctx.ABAS.VEICULOS].linhas.map(function (v) { return v[3]; })));
ok('3) o snapshot do lançamento do período aberto',
  ABASFAKE[ctx.ABAS.LANCAMENTOS].linhas[0][ctx.L_.CENTRO] === 'Loja 02 — Içara',
  String(ABASFAKE[ctx.ABAS.LANCAMENTOS].linhas[0][ctx.L_.CENTRO]));
ok('4) o percentual da competência',
  ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas.some(function (l) { return l[1] === 'Loja 02 — Içara' && l[2] === 0.3; }),
  JSON.stringify(ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas));
ok('5) e a base do rateio', diario.params.BASE_RATEIO === 'Loja 02 — Içara,EMPILHADEIRAS',
  diario.params.BASE_RATEIO);
ok('a competência ENCERRADA fica com o nome antigo',
  ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas.some(function (l) {
    return String(l[0]) === '2026-09' && l[1] === 'Loja 02' && l[2] === 0.25; }),
  JSON.stringify(ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas.filter(function (l) { return String(l[0]) === '2026-09'; })));
// Regravar a competência inteira carimbaria data e responsável em linhas
// que ninguém tocou. Só a célula do nome muda.
ok('a linha da outra loja fica idêntica, sem carimbo novo',
  JSON.stringify(ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas.filter(function (l) {
    return l[1] === 'Loja 01'; })) ===
  JSON.stringify([['2026-10', 'Loja 01', 0.2, 'SIM', '', '']]),
  JSON.stringify(ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas));
ok('e a linha renomeada mantém percentual, recebe e carimbo',
  JSON.stringify(ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas.filter(function (l) {
    return l[1] === 'Loja 02 — Içara'; })) ===
  JSON.stringify([['2026-10', 'Loja 02 — Içara', 0.3, 'SIM', '', '']]),
  JSON.stringify(ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas));
ok('a outra loja não foi tocada em lugar nenhum',
  centros().indexOf('Loja 01') !== -1 &&
  ABASFAKE[ctx.ABAS.VEICULOS].linhas[0][ctx.COL_VEIC.CENTRO - 1] === 'Loja 01' &&
  ABASFAKE[ctx.ABAS.LANCAMENTOS].linhas[1][ctx.L_.CENTRO] === 'Loja 01' &&
  ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas.some(function (l) { return l[1] === 'Loja 01' && l[2] === 0.2; }));
ok('o percentual não muda de valor na mudança de nome',
  ABASFAKE[ctx.ABAS.RATEIO_MENSAL].linhas.filter(function (l) { return l[1] === 'Loja 02 — Içara'; })[0][2] === 0.3);

console.log('\n3b. A troca em coluna, direto');
// A guarda do lacre já impede chegar aqui com linha fechada, então pelo
// caminho de cima as duas versões de trocarNaColuna_ dão no mesmo. A segunda
// tranca só é alcançável aqui — e é ela que segura o histórico se a guarda
// um dia afrouxar.
zerar();
const col = novaAba([['Loja 02'], ['Loja 01'], ['Loja 02'], ['loja 02']], 1);
let trocadas = ctx.trocarNaColuna_(col, 1, 4, 'Loja 02', 'Loja Nova');
ok('troca todas as que casam, inclusive com outra caixa', trocadas === 3,
  String(trocadas) + ' • ' + JSON.stringify(col.linhas));
ok('e não encosta na que não casa', col.linhas[1][0] === 'Loja 01', JSON.stringify(col.linhas));

const col2 = novaAba([['Loja 02'], ['Loja 02'], ['Loja 02']], 1);
trocadas = ctx.trocarNaColuna_(col2, 1, 3, 'Loja 02', 'Loja Nova', [3]);
ok('com lista de linhas permitidas, troca só a da lista', trocadas === 1 &&
  col2.linhas.map(function (l) { return l[0]; }).join(',') === 'Loja 02,Loja Nova,Loja 02',
  JSON.stringify(col2.linhas));
ok('lista vazia não troca nada',
  ctx.trocarNaColuna_(novaAba([['Loja 02']], 1), 1, 1, 'Loja 02', 'X', []) === 0);
ok('aba sem linha nenhuma não quebra',
  ctx.trocarNaColuna_(novaAba([], 1), 1, 0, 'Loja 02', 'X') === 0);
// Reescrever a coluna inteira com os mesmos valores não muda nada e custa
// uma escrita de planilha — a operação mais cara do Apps Script.
const col3 = novaAba([['Loja 09'], ['Loja 08']], 1);
ctx.trocarNaColuna_(col3, 1, 2, 'Loja 02', 'X');
ok('quando nada casa, não escreve na planilha', col3.escritas === 0, String(col3.escritas));
ctx.trocarNaColuna_(col3, 1, 2, 'Loja 09', 'X');
ok('e quando casa, escreve uma vez só', col3.escritas === 1, String(col3.escritas));

console.log('\n4. O lacre do histórico');
zerar();
ctx.__lancamentos = [lanc('Loja 02', data(2026, 9, 10))];   // período já fechado
r = ctx.renomearCentro_('Loja 02', 'Loja 02 — Içara');
ok('loja com lançamento fechado não é renomeada', r.ok === false && r.temHistorico === true);
ok('e a mensagem explica o fantasma', /duas lojas/.test(r.mensagem), r.mensagem);
ok('a aba Centros fica como estava', centros().indexOf('Loja 02') !== -1, centros().join(','));
ok('e o cadastro dos veículos também',
  ABASFAKE[ctx.ABAS.VEICULOS].linhas[1][ctx.COL_VEIC.CENTRO - 1] === 'Loja 02');

console.log('\n5. Renomear: as outras recusas');
zerar();
ok('loja que não existe', ctx.renomearCentro_('Loja 99', 'Loja 98').ok === false);
ok('nome novo igual ao atual', ctx.renomearCentro_('Loja 01', 'Loja 01').ok === false);
ok('nome novo já usado por outra', ctx.renomearCentro_('Loja 01', 'Loja 02').ok === false,
  JSON.stringify(ctx.renomearCentro_('Loja 01', 'Loja 02')));
ok('nome novo vazio', ctx.renomearCentro_('Loja 01', '  ').ok === false);
// Trocar só a caixa ou o acento é renomeação legítima: não pode colidir
// consigo mesma.
r = ctx.renomearCentro_('Loja 01', 'LOJA 01');
ok('trocar só a caixa da própria loja é permitido', r.ok === true, JSON.stringify(r));
ok('e o nome na aba fica com a caixa nova', centros().indexOf('LOJA 01') !== -1, centros().join(','));
zerar();
lockLivre = false;
ok('sem a trava, não renomeia', ctx.renomearCentro_('Loja 01', 'Loja 1A').ok === false);
ok('e a aba fica como estava', centros().indexOf('Loja 01') !== -1);
lockLivre = true;

// ============================================================== EXCLUIR
console.log('\n6. Excluir loja');
zerar();
r = ctx.criarCentro_('Loja 19');
r = ctx.excluirCentro_('Loja 19');
ok('loja sem uso nenhum sai', r.ok === true, JSON.stringify(r));
ok('e some da aba', centros().indexOf('Loja 19') === -1, centros().join(','));
ok('fica no Log', diario.log.some(function (l) { return /Excluir loja \| Loja 19/.test(l); }));

console.log('\n7. O que impede excluir');
zerar();
r = ctx.excluirCentro_('Loja 02');
ok('loja com veículo não sai', r.ok === false && r.emUso === true, JSON.stringify(r));
ok('e diz quantos veículos', /2 veículo/.test(r.mensagem), r.mensagem);
ok('continua na aba', centros().indexOf('Loja 02') !== -1);

zerar();
ctx.criarCentro_('Loja 19');
ctx.__lancamentos = [lanc('Loja 19', data(2026, 10, 30))];
r = ctx.excluirCentro_('Loja 19');
ok('loja sem veículo mas com lançamento não sai', r.ok === false && r.emUso === true,
  JSON.stringify(r));
ok('continua na aba', centros().indexOf('Loja 19') !== -1);

zerar();
ctx.__lancamentos = [];
r = ctx.excluirCentro_('DEPÓSITO');
ok('loja que é base do rateio não sai', r.ok === false && r.emUso === true, JSON.stringify(r));
ok('e aponta o parâmetro', /BASE_RATEIO/.test(r.mensagem), r.mensagem);

zerar();
r = ctx.excluirCentro_(ctx.CENTRO_ADM_CENTRAL_);
ok('a loja do próprio sistema não sai', r.ok === false, JSON.stringify(r));
ok('continua na aba', centros().indexOf('ADM Central') !== -1);

zerar();
ok('loja que não existe', ctx.excluirCentro_('Loja 99').ok === false);
zerar();
lockLivre = false;
ctx.criarCentro_('Loja 19');
lockLivre = false;
ok('sem a trava, não exclui', ctx.excluirCentro_('Loja 19').ok === false);
lockLivre = true;

console.log('\n8. Excluir apaga só a linha certa');
zerar();
ctx.criarCentro_('Loja 19');
const antes = centros().length;
ctx.excluirCentro_('Loja 01');   // não tem veículo? tem — então usa a Loja 19
ctx.excluirCentro_('Loja 19');
ok('sai uma linha só', centros().length === antes - 1, centros().join(','));
ok('e as outras continuam todas',
  centros().join(',') === 'Loja 01,Loja 02,DEPÓSITO,ADM Central', centros().join(','));

console.log('\n9. Os callbacks da tela');
zerar();
ok('webCriarCentro', ctx.webCriarCentro('token', 'Loja 20').ok === true);
ok('webRenomearCentro', ctx.webRenomearCentro('token', 'Loja 20', 'Loja 21').ok === true);
ok('webExcluirCentro', ctx.webExcluirCentro('token', 'Loja 21').ok === true);
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
['webCriarCentro', 'webRenomearCentro', 'webExcluirCentro'].forEach(function (f) {
  ok(f + ' é só para ADMIN',
    new RegExp('function ' + f + '[\\s\\S]{0,120}autorizarContextoWeb_\\(token, .ADMIN.\\)').test(fonte),
    'cadastro de loja mexe em rateio: OPERADOR não pode');
});
const app = fs.readFileSync('App.html', 'utf8');
ok('a tela só mostra o cadastro para ADMIN',
  /\(admin\s*\n?\s*\? '<div class="cartao" style="max-width:620px"><b>Cadastrar loja<\/b>'/.test(app),
  'botão para quem não pode falha no servidor e parece defeito');
ok('e os botões por linha também', /admin \? ' <button[\s\S]{0,200}renomearLoja\(/.test(app));

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
