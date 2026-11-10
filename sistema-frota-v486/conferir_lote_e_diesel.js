/**
 * Prova da classificação em lote e do relatório de diesel por semana e mês.
 *
 * As duas coisas nasceram do mesmo pedido, e uma depende da outra: o filtro
 * por grupo de frota sai da CATEGORIA do cadastro, e sem ela preenchida
 * "Frota Entregas" volta vazio e parece defeito.
 *
 * O que se guarda aqui:
 *  - lote: só a coluna Categoria é tocada (o resto do cadastro fica como
 *    está), quem não foi encontrado é DITO item por item, e a lista colada
 *    aceita o que a vida entrega (vírgula, ponto e vírgula, linha em branco);
 *  - diesel: o que entra como diesel e o que fica de fora, a semana que
 *    começa na segunda, e o rodapé que é valor/litros e não média de médias.
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

const diario = { log: [] };
const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: {
    getUuid: () => 'x',
    formatDate: function (d, _tz, padrao) {
      const z = n => ('0' + n).slice(-2);
      if (padrao === 'yyyy-MM-dd') return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
      if (padrao === 'yyyy-MM') return d.getFullYear() + '-' + z(d.getMonth() + 1);
      return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    classificarVeiculosEmLote_, itensColados_, relatorioDieselPeriodo_,
    inicioDaSemana_, ehDieselDoVeiculo_, tipoEhNumerico_, tabelaRelatorioPdf_,
    COL_VEIC, TOTAL_COL_VEIC, L_, TOTAL_COL_LANC, SEMANAS_DIESEL_, MESES_DIESEL_,
  });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  exigirPerfilToken_ = function () {};
  autorizarContextoWeb_ = function () {};
  registrarLog_ = function (acao, detalhe) { __diario.log.push(acao + ': ' + detalhe); };
  invalidarCacheInicio_ = function () {};
  atualizarResumoSeguro_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-11' : (n === 'EMPRESA' ? 'Giassi' : ''); };
  normalizarMesReferencia_ = function (m) { return String(m); };
  hojeNoFuso_ = function () { return new Date(2026, 10, 10, 0, 0, 0, 0); };   // terça
  dadosVeiculosExecucao_ = function () { return __veiculos; };
  lerLancamentos_ = function () { return __lanc; };
  aba_ = function () {
    return {
      getLastRow: function () { return __veiculos.length + 1; },
      getMaxRows: function () { return __veiculos.length + 1; },
      getRange: function (linha, coluna, nL, nC) {
        return {
          getValues: function () {
            const saida = [];
            for (let i = 0; i < (nL || 1); i++) {
              const l = __veiculos[linha - 2 + i] || [];
              saida.push(l.slice(coluna - 1, coluna - 1 + (nC || 1)));
            }
            return saida;
          },
          setValues: function (vals) {
            __diario.escritas = (__diario.escritas || 0) + 1;
            vals.forEach(function (l, i) {
              const alvo = linha - 2 + i;
              if (!__veiculos[alvo]) __veiculos[alvo] = [];
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
ctx.__diario = diario;

function veic(placa, patrimonio, descricao, categoria, combustivel) {
  const v = new Array(ctx.TOTAL_COL_VEIC).fill('');
  v[ctx.COL_VEIC.PLACA - 1] = placa;
  v[ctx.COL_VEIC.CODIGO - 1] = patrimonio;
  v[ctx.COL_VEIC.DESCRICAO - 1] = descricao;
  v[ctx.COL_VEIC.CATEGORIA - 1] = categoria;
  v[ctx.COL_VEIC.CENTRO - 1] = 'DEPOSITO';
  v[ctx.COL_VEIC.ATIVO - 1] = 'SIM';
  v[ctx.COL_VEIC.DEPRECIACAO - 1] = 1234;
  v[ctx.COL_VEIC.COMBUSTIVEL - 1] = combustivel || '';
  return v;
}

function montarVeiculos() {
  ctx.__veiculos = [
    veic('MCZ2627', '15482', 'Carreta carga seca', 'Leve', 'Diesel'),
    veic('QHK 4E72', '15483', 'Caminhão frigorífico', 'Leve', 'Diesel'),
    veic('MBI1011', '15484', 'Carreta frigorífica', 'Carro', ''),
    veic('CAR 0001', '15485', 'Gol da gerência', 'Carro', 'Gasolina'),
  ];
  vm.runInContext('VEICULOS_EXEC_CACHE_ = null; CLASSIF_MEMO_EXEC_ = null;', ctx);
  diario.log.length = 0;
  diario.escritas = 0;
}

function categoriaDe(i) { return ctx.__veiculos[i][ctx.COL_VEIC.CATEGORIA - 1]; }

console.log('\n1. O texto colado vira lista');
[['MCZ2627\nQHK 4E72', 2], ['MCZ2627, QHK 4E72', 2], ['MCZ2627;QHK 4E72;', 2],
 ['MCZ2627\n\n\nQHK 4E72\n', 2], ['  MCZ2627  ', 1], ['', 0], ['\n , ; \n', 0],
].forEach(function (par) {
  ok('"' + par[0].replace(/\n/g, '\\n') + '" => ' + par[1] + ' item(ns)',
    ctx.itensColados_(par[0]).length === par[1]);
});
// O hifen NAO separa: a frota do usuario tem placa gravada em par
// (cavalo-carreta) e `normalizaPlaca_` ja trata o hifen como espaco. Quebrar
// ali transformaria um veiculo em dois que nao existem.
ok('o hífen NÃO separa (placa em par fica inteira)',
  ctx.itensColados_('MCZ2627-QHC8466').length === 1,
  JSON.stringify(ctx.itensColados_('MCZ2627-QHC8466')));

console.log('\n2. Classificar em lote');
montarVeiculos();
let r = ctx.classificarVeiculosEmLote_('Carreta Normal', 'MCZ2627\nMBI1011');
ok('classificou os dois', r.ok && r.alterados.length === 2, JSON.stringify(r));
ok('e gravou a categoria', categoriaDe(0) === 'Carreta Normal' && categoriaDe(2) === 'Carreta Normal');
ok('quem não estava na lista não mudou', categoriaDe(1) === 'Leve' && categoriaDe(3) === 'Carro');
// Gravar a linha inteira levaria junto um valor lido antes de outra edicao, e
// escrever linha a linha seriam 30 escritas.
ok('só a coluna Categoria foi tocada',
  ctx.__veiculos[0][ctx.COL_VEIC.DESCRICAO - 1] === 'Carreta carga seca' &&
  ctx.__veiculos[0][ctx.COL_VEIC.DEPRECIACAO - 1] === 1234 &&
  ctx.__veiculos[0][ctx.COL_VEIC.COMBUSTIVEL - 1] === 'Diesel');
ok('e numa escrita só', diario.escritas === 1, String(diario.escritas));
ok('o log diz quem mudou', /Classificar veículos/.test(diario.log.join(' ')) &&
  /MCZ2627/.test(diario.log.join(' ')));

montarVeiculos();
r = ctx.classificarVeiculosEmLote_('Truck Normal', '15482\n15483');
ok('aceita número de patrimônio, não só placa',
  r.alterados.length === 2 && categoriaDe(0) === 'Truck Normal', JSON.stringify(r.alterados));

montarVeiculos();
r = ctx.classificarVeiculosEmLote_('Truck Normal', 'MCZ2627\nNAO EXISTE\nOUTRA');
ok('diz QUAIS não foram encontrados',
  r.naoEncontrados.length === 2 && r.naoEncontrados.indexOf('NAO EXISTE') !== -1,
  '"2 não encontrados" sem dizer quais obriga a conferir os 30 na mão');
ok('e classifica os que existem mesmo assim', r.alterados.length === 1);
ok('a mensagem junta os três números',
  /1 veículo\(s\) classificado\(s\)/.test(r.mensagem) && /não encontrado/.test(r.mensagem),
  r.mensagem);

montarVeiculos();
ctx.classificarVeiculosEmLote_('Truck Normal', 'MCZ2627');
diario.escritas = 0;
r = ctx.classificarVeiculosEmLote_('Truck Normal', 'MCZ2627');
ok('quem já estava na categoria não conta como alterado',
  r.alterados.length === 0 && r.jaEstavam.length === 1, JSON.stringify(r));
ok('e não escreve na planilha à toa', diario.escritas === 0, String(diario.escritas));

montarVeiculos();
r = ctx.classificarVeiculosEmLote_('Truck Normal', 'MCZ2627\nMCZ2627\n15482');
// As tres entradas sao o MESMO veiculo (placa, placa de novo, e o patrimonio
// dele). Sem a guarda de repetidos, a segunda e a terceira cairiam em
// `jaEstavam` — e a tela diria "2 já estavam assim" sobre um veiculo so.
ok('repetido na lista conta uma vez só',
  r.alterados.length === 1 && r.jaEstavam.length === 0 && r.naoEncontrados.length === 0,
  JSON.stringify({ alterados: r.alterados, jaEstavam: r.jaEstavam }));

ok('categoria inexistente é recusada',
  ctx.classificarVeiculosEmLote_('Catamarã', 'MCZ2627').ok === false);
ok('lista vazia é recusada com instrução',
  /Cole as placas/.test(ctx.classificarVeiculosEmLote_('Truck Normal', '   ').mensagem));
ok('e há teto de itens por vez', (function () {
  const muitos = [];
  for (let i = 0; i < 501; i++) muitos.push('P' + i);
  return ctx.classificarVeiculosEmLote_('Truck Normal', muitos.join('\n')).ok === false;
})());

console.log('\n3. A semana começa na segunda');
// Domingo pertence a semana que comecou na segunda ANTERIOR. Sem isso o
// domingo abriria uma semana sozinho e toda semana sairia partida em duas.
const seg = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); })', ctx);
ok('segunda cai nela mesma',
  ctx.inicioDaSemana_(seg(2026, 11, 9)).getDate() === 9);
ok('quarta recua para a segunda',
  ctx.inicioDaSemana_(seg(2026, 11, 11)).getDate() === 9);
ok('domingo recua para a segunda ANTERIOR, não abre semana nova',
  ctx.inicioDaSemana_(seg(2026, 11, 15)).getDate() === 9,
  'domingo com getDay()=0 recuaria 0 dias e viraria início de semana');
ok('e a semana seguinte começa na segunda certa',
  ctx.inicioDaSemana_(seg(2026, 11, 16)).getDate() === 16);

console.log('\n4. O que conta como diesel');
ok('cadastro vazio conta como diesel, mas marcado como não declarado',
  ctx.ehDieselDoVeiculo_('').diesel === true && ctx.ehDieselDoVeiculo_('').declarado === false);
ok('Diesel conta', ctx.ehDieselDoVeiculo_('Diesel').diesel === true);
ok('Gasolina não conta', ctx.ehDieselDoVeiculo_('Gasolina').diesel === false);
ok('Flex não conta como diesel', ctx.ehDieselDoVeiculo_('Flex').diesel === false);
ok('acento e caixa não atrapalham', ctx.ehDieselDoVeiculo_('  diésel  ').diesel === true);

console.log('\n5. O relatório de diesel');
function lanc(dia, placa, litros, valor, abast, tipo) {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = new Date(2026, 10, dia, 12, 0, 0, 0);
  l[ctx.L_.PLACA] = placa;
  l[ctx.L_.CENTRO] = 'DEPOSITO';
  l[ctx.L_.CATEGORIA] = 'Truck Normal';
  l[ctx.L_.TIPO] = tipo || 'Combustivel Terceiros';
  l[ctx.L_.TIPO_ABASTECIMENTO] = abast || 'Externo';
  l[ctx.L_.LITROS] = litros;
  l[ctx.L_.VALOR] = valor;
  l[ctx.L_.PERIODO] = '2026-11';
  return l;
}
montarVeiculos();
ctx.__lanc = [
  lanc(9, 'MCZ2627', 100, 600),                              // semana de 09/11
  lanc(15, 'MCZ2627', 50, 325),                              // domingo da MESMA semana
  lanc(16, 'QHK 4E72', 200, 1200, 'Interno', 'Combustivel Proprio'),  // semana seguinte
  lanc(16, 'CAR 0001', 40, 280),                             // gasolina: fora
  lanc(17, 'MBI1011', 80, 520),                              // sem cadastro: conta, mas avisa
  // Veiculo com GASOLINA no cadastro abastecendo pelo TANQUE. O tanque e
  // DIESEL S10: esses litros sairam de diesel, qualquer que seja o cadastro.
  // A divergencia e erro de cadastro, nao combustivel diferente — e tirar
  // esses litros faria o relatorio nao fechar com o saldo do tanque.
  lanc(17, 'CAR 0001', 30, 180, 'Interno', 'Combustivel Proprio'),
];
const rel = ctx.relatorioDieselPeriodo_(null, null, null);
ok('duas semanas', rel.linhas.length === 2, JSON.stringify(rel.linhas.map(function (l) { return l[0]; })));
ok('a mais recente primeiro', /16\/11/.test(rel.linhas[0][0]), rel.linhas[0][0]);
ok('o domingo entrou na semana da segunda anterior',
  rel.linhas[1][2] === 150, String(rel.linhas[1][2]));
ok('o carro a gasolina comprando fora ficou de fora',
  rel.totais[2] === 460, String(rel.totais[2]) + ' L — com os 40 L comprados fora seriam 500');
ok('mas o que saiu do TANQUE conta, mesmo com gasolina no cadastro', (function () {
  const so = ctx.relatorioDieselPeriodo_(null, null, 'CAR 0001');
  return so.totais[2] === 30 && so.totais[5] === 30;
})(), 'o tanque é DIESEL S10: esses litros têm de fechar com o saldo dele');
ok('o interno entra e aparece como litro do tanque',
  rel.linhas[0][5] === 230 && rel.linhas[0][6] === 80,
  JSON.stringify(rel.linhas[0]));
ok('o R$/litro da linha é valor/litros',
  Math.abs(rel.linhas[1][4] - (925 / 150)) < 0.0001, String(rel.linhas[1][4]));
// Media de medias daria outro numero, com a semana de 50 L pesando igual a de
// 280 L.
ok('e o do rodapé também, não a média das semanas',
  Math.abs(rel.totais[4] - (rel.totais[3] / rel.totais[2])) < 0.0001,
  String(rel.totais[4]));
ok('o consolidado mensal vem junto',
  rel.consolidado && rel.consolidado.linhas.length === 1 &&
  rel.consolidado.linhas[0][0] === '2026-11', JSON.stringify(rel.consolidado && rel.consolidado.linhas));
// Semana e mes sao DOIS acumuladores, com um `if (interno)` cada. Conferir so
// litros e valor deixaria o mensal livre para trocar tanque por fora sem que
// nada acusasse — e a tabela de baixo contradiria a de cima na mesma folha.
ok('e fecha com a soma das semanas, coluna por coluna',
  [1, 2, 3, 5, 6].every(function (i) {
    return rel.consolidado.totais[i] === rel.totais[i];
  }),
  JSON.stringify([rel.totais, rel.consolidado.totais]));
ok('avisa quantos litros vieram de veículo sem combustível declarado',
  /80,000 L vieram de 1 veículo\(s\)/.test(rel.mensagem), rel.mensagem);
ok('o filtro por grupo vale aqui também', (function () {
  const so = ctx.relatorioDieselPeriodo_(null, 'GRUPO:Apoio', null);
  return so.linhas.length === 0;
})(), 'todos os lançamentos do fixture são Truck Normal');
ok('e o filtro por veículo',
  ctx.relatorioDieselPeriodo_(null, null, 'MCZ2627').totais[2] === 150);

console.log('\n6. Número que o usuário lê não sai cru');
// Era defeito EM PRODUÇÃO: 'litros' e 'media' não estavam na lista de tipos
// numéricos, então no PDF a célula caía no ramo de texto e saía "248.065" —
// que em pt-BR se lê como MILHAR. O PDF do fechamento já saía assim.
ok('litros é tipo numérico', ctx.tipoEhNumerico_('litros') === true);
ok('media também', ctx.tipoEhNumerico_('media') === true);
const html = ctx.tabelaRelatorioPdf_({
  colunas: [{ titulo: 'Semana', tipo: 'texto' }, { titulo: 'Litros', tipo: 'litros' },
    { titulo: 'KM/l', tipo: 'media' }],
  linhas: [['09/11 a 15/11', 248.0655, 3.456]],
  totais: [null, 248.0655, 3.456],
});
ok('o PDF escreve litros com vírgula e 3 casas', /248,066/.test(html), html.slice(0, 400));
ok('e a média com vírgula e 2 casas', /3,46/.test(html));
ok('sem ponto decimal solto em lugar nenhum',
  !/>\s*248\.0655\s*</.test(html),
  'ponto decimal em pt-BR se lê como separador de milhar — e não dá erro, mente');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
