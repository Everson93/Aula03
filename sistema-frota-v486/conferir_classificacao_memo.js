/**
 * Prova do memo da classificação de veículo, e da escrita da depreciação.
 *
 * O que importa aqui NÃO é "ficou mais rápido" — é "continua dando a mesma
 * resposta, e para de dar a resposta velha quando o cadastro muda". Um memo
 * que sobrevive à alteração do cadastro grava centro errado dentro do
 * lançamento, em silêncio, e isso é pior que a lentidão que ele resolve.
 */
const fs = require('fs');
const vm = require('vm');

/**
 * Faixa falsa que CONFERE as dimensões, como a de verdade.
 *
 * A versão anterior aceitava gravar 9 colunas numa faixa pedida de 7 — e no
 * Apps Script isso lança. Um duplê mais permissivo que a coisa real aprova
 * código que quebra em produção, que é o pior defeito que um duplê pode ter.
 */
function fakeRange(reg, linhas, colunas) {
  const r = {
    setValues: function (v) {
      const lv = v.length, cv = (v[0] || []).length;
      if (linhas !== undefined && lv !== linhas) {
        throw new Error('setValues: faixa pedida com ' + linhas + ' linha(s), valores com ' + lv);
      }
      if (colunas !== undefined && cv !== colunas) {
        throw new Error('setValues: faixa pedida com ' + colunas + ' coluna(s), valores com ' + cv);
      }
      reg.escritas.push({ tipo: 'setValues', linhas: lv, colunas: cv, valores: v });
      return r;
    },
    setValue: function () { return r; },
    setNumberFormat: function () { return r; },
    getValues: function () { return reg.leitura || []; },
    getDisplayValues: function () { return reg.leitura || []; },
    clearContent: function () { return r; },
  };
  return r;
}

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', formatDate: () => '20261028' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  MailApp: { getRemainingDailyQuota: () => 100, sendEmail: () => {} },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    classificacaoVeiculoAtual_, classificacaoVeiculoAtualSemMemo_, resolverVeiculo_,
    dadosVeiculosExecucao_, COL_VEIC, COL_LANC, TOTAL_COL_VEIC,
    normalizarCentroCusto_, normalizaPlaca_, statusDepreciacaoMensal_,
    gerarDepreciacaoMensal_,
  });
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  registrarLog_ = function () {};
  // A fonte dos veículos: o teste troca __veiculos e zera o cache, exatamente
  // como os onze pontos do código fazem.
  dadosVeiculosExecucao_ = function () {
    if (VEICULOS_EXEC_CACHE_) return VEICULOS_EXEC_CACHE_;
    VEICULOS_EXEC_CACHE_ = __veiculos;
    return VEICULOS_EXEC_CACHE_;
  };
  globalThis.zerarCacheVeiculos = function () { VEICULOS_EXEC_CACHE_ = null; };
  globalThis.espiarMemo = function () { return CLASSIF_MEMO_EXEC_; };
`, ctx, { filename: 'Codigo.gs' });

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

function veiculo(placa, patrimonio, descricao, categoria, centro, ativo) {
  const l = new Array(ctx.TOTAL_COL_VEIC).fill('');
  l[ctx.COL_VEIC.PLACA - 1] = placa;
  l[ctx.COL_VEIC.CODIGO - 1] = patrimonio;
  l[ctx.COL_VEIC.DESCRICAO - 1] = descricao;
  l[ctx.COL_VEIC.CATEGORIA - 1] = categoria;
  l[ctx.COL_VEIC.CENTRO - 1] = centro;
  l[ctx.COL_VEIC.ATIVO - 1] = ativo === false ? 'NAO' : 'SIM';
  l[ctx.COL_VEIC.DEPRECIACAO - 1] = 100;
  return l;
}

function montarFrota(n) {
  const lista = [];
  for (let i = 0; i < n; i++) {
    lista.push(veiculo('AAA' + (1000 + i), 'P' + i, 'Veículo ' + i, 'Leve', 'LOJA ' + (i % 5)));
  }
  return lista;
}

console.log('\n1. O memo não muda a resposta');
ctx.__veiculos = montarFrota(20);
ctx.zerarCacheVeiculos();
let iguais = true, exemplo = '';
ctx.__veiculos.forEach(function (v) {
  const placa = v[ctx.COL_VEIC.PLACA - 1];
  const a = ctx.classificacaoVeiculoAtual_(placa);
  const b = ctx.classificacaoVeiculoAtualSemMemo_(placa);
  if (a.centro !== b.centro || a.categoria !== b.categoria) {
    iguais = false; exemplo = placa + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b);
  }
});
ok('memo e não-memo concordam em toda a frota', iguais, exemplo);
ok('placa inexistente continua dando "sem cadastro"',
  ctx.classificacaoVeiculoAtual_('ZZZ9999').centro === '⚠ sem cadastro');
ok('e isso também é memoizado sem virar outra coisa',
  ctx.classificacaoVeiculoAtual_('ZZZ9999').centro === '⚠ sem cadastro');

console.log('\n2. O memo realmente evita a varredura');
ctx.__veiculos = montarFrota(20);
ctx.zerarCacheVeiculos();
const resolverReal = ctx.resolverVeiculo_;
let varreduras = 0;
ctx.resolverVeiculo_ = function (a, b) { varreduras++; return resolverReal(a, b); };
for (let i = 0; i < 50; i++) ctx.classificacaoVeiculoAtual_('AAA1003');
ok('cinquenta consultas à mesma placa varrem uma vez só', varreduras === 1, 'varreduras: ' + varreduras);
varreduras = 0;
ctx.classificacaoVeiculoAtual_('AAA1004');
ok('placa nova ainda varre', varreduras === 1, 'varreduras: ' + varreduras);
ctx.resolverVeiculo_ = resolverReal;

console.log('\n3. O MEMO CAI QUANDO O CADASTRO MUDA');
// Esta é a prova que importa. Um memo que sobrevive à troca do cadastro grava
// o centro antigo dentro do lançamento, e ninguém vê.
ctx.__veiculos = [veiculo('XYZ1234', 'P9', 'Saveiro', 'Leve', 'DEPÓSITO')];
ctx.zerarCacheVeiculos();
ok('antes: o centro é o do cadastro',
  ctx.classificacaoVeiculoAtual_('XYZ1234').centro === 'DEPÓSITO',
  ctx.classificacaoVeiculoAtual_('XYZ1234').centro);

// O veículo muda de centro, e o código zera o cache — como os onze pontos fazem.
ctx.__veiculos = [veiculo('XYZ1234', 'P9', 'Saveiro', 'Leve', 'LOJA 7')];
ctx.zerarCacheVeiculos();
ok('depois: o memo NÃO devolve o centro velho',
  ctx.classificacaoVeiculoAtual_('XYZ1234').centro === 'LOJA 7',
  'devolveu ' + ctx.classificacaoVeiculoAtual_('XYZ1234').centro + ' — memo velho vazando para o lançamento');
ok('a categoria acompanha',
  ctx.classificacaoVeiculoAtual_('XYZ1234').categoria === 'Leve');

// E muda de categoria também.
ctx.__veiculos = [veiculo('XYZ1234', 'P9', 'Saveiro', 'Carreta Normal', 'LOJA 7')];
ctx.zerarCacheVeiculos();
ok('troca de categoria também atravessa o memo',
  ctx.classificacaoVeiculoAtual_('XYZ1234').categoria === 'Carreta Normal',
  ctx.classificacaoVeiculoAtual_('XYZ1234').categoria);

console.log('\n4. O memo não pode ser corrompido de fora');
ctx.__veiculos = [veiculo('XYZ1234', 'P9', 'Saveiro', 'Leve', 'DEPÓSITO')];
ctx.zerarCacheVeiculos();
// A primeira chamada é cópia nos dois casos — ela não prova nada. O
// envenenamento só é possível a partir da segunda, quando o memo já existe.
ctx.classificacaoVeiculoAtual_('XYZ1234').centro = 'LIXO 1';
const segundo = ctx.classificacaoVeiculoAtual_('XYZ1234');
ok('a segunda chamada não trouxe o lixo da primeira',
  segundo.centro === 'DEPÓSITO', segundo.centro);
segundo.centro = 'LIXO 2';
ok('e mexer na segunda não envenena a terceira',
  ctx.classificacaoVeiculoAtual_('XYZ1234').centro === 'DEPÓSITO',
  ctx.classificacaoVeiculoAtual_('XYZ1234').centro);
segundo.categoria = 'LIXO 3';
ok('a categoria também é cópia',
  ctx.classificacaoVeiculoAtual_('XYZ1234').categoria === 'Leve',
  ctx.classificacaoVeiculoAtual_('XYZ1234').categoria);
ok('uma placa chamada __proto__ não alcança o protótipo',
  ctx.classificacaoVeiculoAtual_('__proto__').centro === '⚠ sem cadastro',
  JSON.stringify(ctx.classificacaoVeiculoAtual_('__proto__')));
ok('nem uma chamada "constructor"',
  ctx.classificacaoVeiculoAtual_('constructor').centro === '⚠ sem cadastro');

console.log('\n5. A depreciação escreve classificação sem reconsultar');
ctx.__veiculos = montarFrota(30);
ctx.zerarCacheVeiculos();
const reg = { escritas: [] };
vm.runInContext(`
  aba_ = function () { return {
    getRange: function (l, c, nl, nc) { return __fakeRange(l, c, nl, nc); },
    getLastRow: function () { return 1; } }; };
  proximaLinhaLancamento_ = function () { return 500; };
  periodoDoMes_ = function () { return { inicio: new Date(2026, 6, 1), fim: new Date(2026, 6, 31) }; };
  atualizarResumoSeguro_ = function () { return 0; };
  invalidarCacheInicio_ = function () {};
  novoIdLancamento_ = function () { return 'LAN-20261028-TESTE'; };
  nomeDoMes_ = function () { return 'julho'; };
  formatarData_ = function (d) { return '31/07/2026'; };
`, ctx);
ctx.__fakeRange = function (linha, coluna, nLinhas, nColunas) {
  return fakeRange(reg, nLinhas, nColunas);
};
// Status fabricado: trinta veículos pendentes, com centro e categoria prontos.
const itensFake = [];
for (let i = 0; i < 30; i++) {
  itensFake.push({ placa: 'AAA' + (1000 + i), descricao: 'Veículo ' + i,
    centro: 'LOJA ' + (i % 5), centroLancamento: 'LOJA ' + (i % 5),
    categoriaLancamento: 'Leve', valorMensal: 100, lancado: 0,
    lancadoForaData: 0, situacao: 'PENDENTE' });
}
vm.runInContext('statusDepreciacaoMensal_ = function () { return __status; };', ctx);
ctx.__status = { mes: '2026-07', mesExtenso: 'julho', liberada: true,
  dataLancamento: '31/07/2026', itens: itensFake };
let varreduras2 = 0;
const resolver2 = ctx.resolverVeiculo_;
ctx.resolverVeiculo_ = function (a, b) { varreduras2++; return resolver2(a, b); };
let r, erroGeracao = '';
try { r = ctx.gerarDepreciacaoMensal_(); }
catch (e) { r = { gerados: -1 }; erroGeracao = e.message; }
ctx.resolverVeiculo_ = resolver2;

ok('a geração não lança', erroGeracao === '', erroGeracao);
ok('gerou as trinta linhas', r.gerados === 30, JSON.stringify(r.gerados));
ok('NENHUMA busca de veículo durante a geração', varreduras2 === 0,
  varreduras2 + ' busca(s) — era uma varredura da frota inteira por linha');

const blocos = reg.escritas.filter(function (e) { return e.linhas === 30; });
const comClasse = blocos.filter(function (e) { return e.colunas === ctx.COL_LANC.CATEGORIA; });
ok('o bloco principal vai numa escrita só, até a coluna CATEGORIA',
  comClasse.length === 1, JSON.stringify(blocos.map(function (e) { return e.colunas; })));
const amostra = comClasse[0].valores[3];
ok('com o centro do veículo na coluna certa',
  amostra[ctx.COL_LANC.CENTRO - 1] === 'LOJA 3', JSON.stringify(amostra));
ok('e a categoria na seguinte',
  amostra[ctx.COL_LANC.CATEGORIA - 1] === 'Leve', JSON.stringify(amostra));
ok('a data e a placa continuam nos lugares de sempre',
  amostra[ctx.COL_LANC.PLACA - 1] === 'AAA1003' &&
  String(amostra[ctx.COL_LANC.TIPO - 1]) === 'Depreciação', JSON.stringify(amostra));

console.log('\n6. O status entrega os campos que a geração consome');
// Se statusDepreciacaoMensal_ parar de preencher centroLancamento, a geração
// grava vazio sem reclamar. Esta prova liga as duas pontas.
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ok('statusDepreciacaoMensal_ preenche centroLancamento',
  /centroLancamento:\s*normalizarCentroCusto_/.test(fonte));
ok('e categoriaLancamento', /categoriaLancamento:\s*String\(v\[COL_VEIC\.CATEGORIA/.test(fonte));
ok('e a geração consome exatamente esses dois nomes',
  /faltantes\[k\]\.centroLancamento/.test(fonte) && /faltantes\[k\]\.categoriaLancamento/.test(fonte));

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
