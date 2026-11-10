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
    intervaloDeDatas_, relatorioAceitaPeriodo_, textoDosFiltros_, CATALOGO_RELATORIOS,
    formatoPlanilha_, TIPOS_NUMERICOS_RELATORIO_, relatorioPorTipo_, TIPOS_RELATORIO,
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
  // 18/11/2026, quarta: a semana de 16/11 ainda esta em curso, a de 09/11 ja
  // fechou, e novembro e a competencia ABERTA.
  hojeNoFuso_ = function () { return new Date(2026, 10, 18, 0, 0, 0, 0); };
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
function lanc(dia, placa, litros, valor, abast, tipo, mes) {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = new Date(2026, (mes === undefined ? 10 : mes), dia, 12, 0, 0, 0);
  l[ctx.L_.PLACA] = placa;
  l[ctx.L_.CENTRO] = 'DEPOSITO';
  l[ctx.L_.CATEGORIA] = 'Truck Normal';
  l[ctx.L_.TIPO] = tipo || 'Combustivel Terceiros';
  l[ctx.L_.TIPO_ABASTECIMENTO] = abast || 'Externo';
  l[ctx.L_.LITROS] = litros;
  l[ctx.L_.VALOR] = valor;
  l[ctx.L_.PERIODO] = (mes === undefined ? 10 : mes) === 9 ? '2026-10' : '2026-11';
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
  // OUTUBRO, mês COMPLETO: é contra ele que a variação se mede. Sem um
  // segundo período, "a variação só sai entre completos" não é exercitado.
  lanc(5, 'MCZ2627', 400, 2400, 'Externo', 'Combustivel Terceiros', 9),
];
const rel = ctx.relatorioDieselPeriodo_(null, null, null);
const sem = rel.consolidado;
ok('a tabela principal é o MÊS, que é a visão', rel.linhas.length === 2 &&
  /NOVEMBRO\/2026/.test(rel.linhas[0][0]), JSON.stringify(rel.linhas.map(function (l) { return l[0]; })));
ok('e a semana vem embaixo, que é o detalhe',
  sem.linhas.length === 3, JSON.stringify(sem.linhas.map(function (l) { return l[0]; })));
ok('a semana mais recente primeiro', /16\/11/.test(sem.linhas[0][0]), sem.linhas[0][0]);
ok('a semana em curso é marcada e não tem variação', (function () {
  // Hoje é 18/11 (quarta): a semana de 16/11 ainda não terminou.
  const emCurso = sem.linhas.filter(function (l) { return /16\/11/.test(l[0]); })[0];
  return emCurso && / \(em curso\)$/.test(emCurso[0]) && emCurso[4] === null;
})(), JSON.stringify(sem.linhas.map(function (l) { return [l[0], l[4]]; })));
ok('e entre as duas semanas COMPLETAS a variação sai', (function () {
  // 09/11 a 15/11 = 150 L contra 05/10 a 11/10 = 400 L: -62,5%.
  const fechada = sem.linhas.filter(function (l) { return /09\/11/.test(l[0]); })[0];
  return fechada && Math.abs(fechada[4] - (150 / 400 - 1) * 100) < 0.0001;
})(), JSON.stringify(sem.linhas.map(function (l) { return [l[0], l[4]]; })));
ok('o domingo entrou na semana da segunda anterior',
  sem.linhas[1][1] === 150, String(sem.linhas[1][1]));
ok('o carro a gasolina comprando fora ficou de fora',
  rel.totais[1] === 860, String(rel.totais[1]) + ' L — com os 40 L comprados fora seriam 900');
ok('mas o que saiu do TANQUE conta, mesmo com gasolina no cadastro', (function () {
  const so = ctx.relatorioDieselPeriodo_(null, null, 'CAR 0001');
  return so.totais[1] === 30 && so.totais[5] === 30;
})(), 'o tanque é DIESEL S10: esses litros têm de fechar com o saldo dele');
ok('o interno entra e aparece como litro do tanque',
  sem.linhas[0][5] === 230 && sem.linhas[0][6] === 80,
  JSON.stringify(sem.linhas[0]));
ok('o preço médio da linha é gasto/litros',
  Math.abs(sem.linhas[1][3] - (925 / 150)) < 0.0001, String(sem.linhas[1][3]));
// Media de medias daria outro numero, com a semana de 50 L pesando igual a de
// 280 L.
ok('e o do rodapé também, não a média das linhas',
  Math.abs(rel.totais[3] - (rel.totais[2] / rel.totais[1])) < 0.0001,
  String(rel.totais[3]));
ok('dois meses, o mais recente em cima',
  rel.linhas.length === 2 && /NOVEMBRO/.test(rel.linhas[0][0]) && /OUTUBRO/.test(rel.linhas[1][0]),
  JSON.stringify(rel.linhas.map(function (l) { return l[0]; })));
ok('o mês em curso é marcado como tal',
  / \(em curso\)$/.test(rel.linhas[0][0]), rel.linhas[0][0]);
ok('e NÃO ganha variação contra um mês inteiro',
  rel.linhas[0][4] === null,
  'comparar meio mês com um mês inteiro é uma mentira que não dá erro, só uma seta para baixo');
ok('outubro, que está completo, também não tem contra o que medir',
  rel.linhas[1][4] === null, 'é a linha mais antiga da janela');
ok('mas entre dois COMPLETOS a variação sai', (function () {
  // Recorte que exclui novembro: outubro passa a ser o mais recente e ganha
  // um anterior... não; aqui o que se prova é a conta, com dois meses
  // completos fabricados.
  const antes = ctx.__lanc;
  ctx.__lanc = [
    lanc(5, 'MCZ2627', 100, 600, 'Externo', 'Combustivel Terceiros', 8),   // setembro
    lanc(5, 'MCZ2627', 150, 900, 'Externo', 'Combustivel Terceiros', 9),   // outubro
  ];
  ctx.__lanc[0][ctx.L_.PERIODO] = '2026-09';
  const r2 = ctx.relatorioDieselPeriodo_(null, null, null);
  ctx.__lanc = antes;
  // Outubro (150 L) contra setembro (100 L) = +50%.
  return r2.linhas.length === 2 && Math.abs(r2.linhas[0][4] - 50) < 0.0001;
})(), 'variação de litros contra o período anterior');
// Semana e mes sao DOIS acumuladores, com um `if (interno)` cada. Conferir so
// litros e valor deixaria o mensal livre para trocar tanque por fora sem que
// nada acusasse — e a tabela de baixo contradiria a de cima na mesma folha.
ok('e as duas tabelas fecham entre si, coluna por coluna',
  [1, 2, 5, 6, 7].every(function (i) { return sem.totais[i] === rel.totais[i]; }),
  JSON.stringify([rel.totais, sem.totais]));
ok('avisa quantos litros vieram de veículo sem combustível declarado',
  /80,000 L vieram de 1 veículo\(s\)/.test(rel.mensagem), rel.mensagem);
ok('o filtro por grupo vale aqui também', (function () {
  const so = ctx.relatorioDieselPeriodo_(null, 'GRUPO:Apoio', null);
  return so.linhas.length === 0;
})(), 'todos os lançamentos do fixture são Truck Normal');
ok('e o filtro por veículo',
  ctx.relatorioDieselPeriodo_(null, null, 'MCZ2627').totais[1] === 550,
  String(ctx.relatorioDieselPeriodo_(null, null, 'MCZ2627').totais[1]));
ok('a mensagem abre com um resumo que se lê sozinho',
  /^No período: 860,000 L de diesel, R\$ 5\.225,00, preço médio R\$ 6,076\/L\./.test(rel.mensagem) &&
  /230,000 L saíram do tanque e 630,000 L foram comprados fora/.test(rel.mensagem),
  rel.mensagem);

console.log('\n5b. O filtro de período');
const periodoSoUmaSemana = ctx.relatorioDieselPeriodo_(null, null, null,
  { de: '2026-11-16', ate: '2026-11-22' });
ok('corta pelo intervalo escolhido',
  periodoSoUmaSemana.consolidado.linhas.length === 1, JSON.stringify(
    periodoSoUmaSemana.consolidado.linhas.map(function (l) { return l[0]; })));
ok('e o total é só do que ficou',
  periodoSoUmaSemana.totais[1] === 310, String(periodoSoUmaSemana.totais[1]));
ok('a mensagem diz qual recorte está valendo',
  /Recorte: de 16\/11\/2026 a 22\/11\/2026\./.test(periodoSoUmaSemana.mensagem),
  periodoSoUmaSemana.mensagem);
ok('sem recorte, a mensagem diz o padrão em vez de calar',
  /Últimos 12 meses/.test(rel.mensagem));
// Dono UNICO do recorte: o historico de abastecimentos usa o mesmo. Duas
// implementacoes seriam a chance de o relatorio cortar o dia ao meio-dia e o
// historico a meia-noite, mostrando numeros diferentes do mesmo periodo.
const j = ctx.intervaloDeDatas_({ de: '2026-11-16', ate: '2026-11-16' });
ok('o dia escolhido entra inteiro, nas duas pontas',
  j.inicio.getHours() === 0 && j.fim.getHours() === 23 && j.fim.getMinutes() === 59);
ok('data pela metade é ignorada, não vira erro',
  ctx.intervaloDeDatas_({ de: '2026-11-3', ate: 'xx' }).ativo === false);
ok('sem escolha vale o padrão que o relatório já tinha', (function () {
  const padrao = { inicio: new Date(2026, 9, 26), fim: new Date(2026, 10, 25) };
  const sem = ctx.intervaloDeDatas_(null, padrao);
  return sem.ativo === false && sem.inicio === padrao.inicio && sem.fim === padrao.fim;
})());
ok('e com escolha o padrão é SUBSTITUÍDO, não cruzado', (function () {
  const padrao = { inicio: new Date(2026, 9, 26), fim: new Date(2026, 10, 25) };
  const com = ctx.intervaloDeDatas_({ de: '2026-01-01', ate: '2026-01-31' }, padrao);
  return com.ativo === true && com.contem(new Date(2026, 0, 15, 8, 0, 0)) === true;
})(), 'cruzar com o mês aberto devolveria vazio sem explicar por quê');

console.log('\n5c. O período só é oferecido onde age');
// Relatorio que le o Resumo e da competencia ABERTA por construcao: o Resumo e
// recalculado para o mes aberto. Oferecer o campo ali seria um filtro que nao
// age — o numero sai igual e a pessoa acha que filtrou.
ok('quem lê lançamentos aceita',
  ctx.relatorioAceitaPeriodo_('Diesel por mês e por semana') === true &&
  ctx.relatorioAceitaPeriodo_('Extrato de lançamentos do período') === true);
ok('quem lê o Resumo não aceita',
  ctx.relatorioAceitaPeriodo_('Relatório Operacional dos Veículos') === false &&
  ctx.relatorioAceitaPeriodo_('Abastecimento e consumo') === false);
ok('e isso deriva da FONTE, não de uma lista à parte', (function () {
  return Object.keys(ctx.CATALOGO_RELATORIOS).every(function (t) {
    return ctx.relatorioAceitaPeriodo_(t) === (ctx.CATALOGO_RELATORIOS[t].fonte === 'lancamentos');
  });
})(), 'lista à parte é mais um lugar para esquecer ao criar relatório novo');
ok('o arquivo diz no cabeçalho qual período o gerou',
  /período: de 01\/11\/2026 a 30\/11\/2026/.test(
    ctx.textoDosFiltros_('Diesel por mês e por semana',
      { periodo: { de: '2026-11-01', ate: '2026-11-30' } })),
  'dois PDFs do mesmo relatório com números diferentes e nada escrito que explique');
ok('e não promete período em quem não o aceita',
  ctx.textoDosFiltros_('Relatório Operacional dos Veículos',
    { periodo: { de: '2026-11-01', ate: '2026-11-30' } }) === '');

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

console.log('\n7. Os TRÊS formatadores conhecem os mesmos tipos');
// Esta e a regra que teria pego o defeito antes dele chegar ao usuario. Um
// tipo de coluna e declarado UMA vez, na funcao do relatorio, e e lido por
// tres formatadores diferentes: a tela, o PDF e a planilha. Quando um deles
// nao conhece o tipo, a coluna cai no ramo de texto e sai como numero cru —
// sem erro, so com o ponto decimal que em pt-BR se le como milhar. Foi o que
// aconteceu com 'litros' e 'media': o PDF ja sabia, a tela nao.
const fonte7 = fs.readFileSync('Codigo.gs', 'utf8');
const app7 = fs.readFileSync('App.html', 'utf8');
const tiposUsados = {};
(fonte7.match(/col_\('[^']*', *'([a-z0-9]+)'\)/g) || []).forEach(function (t) {
  tiposUsados[t.match(/, *'([a-z0-9]+)'\)$/)[1]] = true;
});
const formatarTela = (app7.match(/function formatar\(valor, tipo\)[\s\S]*?\n  \}/) || [''])[0];
const numericoTela = (app7.match(/function numerico\(tipo\)[\s\S]*?\n  \}/) || [''])[0];
const celulaPdf = (fonte7.match(/function tabelaRelatorioPdf_[\s\S]*?\n  \}/) || [''])[0];
ok('há mais de um tipo em uso', Object.keys(tiposUsados).length >= 6,
  JSON.stringify(Object.keys(tiposUsados)));
Object.keys(tiposUsados).sort().forEach(function (tipo) {
  if (tipo === 'texto' || tipo === 'data') return;   // texto sai como texto nos três
  ok('"' + tipo + '": a tela sabe formatar',
    new RegExp("case '" + tipo + "':").test(formatarTela),
    'cai no default e sai como número cru');
  ok('"' + tipo + '": o PDF sabe formatar',
    new RegExp("tipo === '" + tipo + "'").test(celulaPdf));
  ok('"' + tipo + '": a planilha tem formato próprio',
    ctx.formatoPlanilha_(tipo) !== '@',
    'formato "@" grava número como TEXTO: a contabilidade não consegue somar');
  ok('"' + tipo + '": é numérico nos dois lados',
    ctx.TIPOS_NUMERICOS_RELATORIO_.indexOf(tipo) !== -1 &&
    new RegExp("'" + tipo + "'").test(numericoTela),
    'alinhamento e soma do rodapé saem desta lista');
});

ok('os litros agregados saem com 1 casa, não 3', (function () {
  const litros = rel.colunas.filter(function (c) { return /Litros|\(L\)/.test(c.titulo); });
  return litros.length === 3 && litros.every(function (c) { return c.tipo === 'volume'; });
})(), '"14.902,100" num total de mês não acrescenta informação e atrapalha a leitura');

console.log('\n8. Tabela de uma linha não repete o total');
// Era o que fazia o relatório parecer duplicado: a tabela com UMA linha
// mostrava o mesmo número de novo, em negrito, logo abaixo.
const umaLinha = { colunas: [{ titulo: 'Mês', tipo: 'texto' }, { titulo: 'L', tipo: 'volume' }],
  linhas: [['NOVEMBRO/2026', 100]], totais: [null, 100] };
ok('o PDF não escreve TOTAL com uma linha só',
  !/TOTAL/.test(ctx.tabelaRelatorioPdf_(umaLinha)));
ok('mas escreve com duas',
  /TOTAL/.test(ctx.tabelaRelatorioPdf_({ colunas: umaLinha.colunas,
    linhas: [['NOVEMBRO/2026', 100], ['OUTUBRO/2026', 50]], totais: [null, 150] })));
ok('a tela segue a mesma regra',
  /dados\.totais && dados\.totais\.length && dados\.linhas\.length > 1/.test(app7));
ok('e a planilha também', (function () {
  // Ancora no ESCRITOR DE ABA: a mesma condicao existe no PDF, e procurar
  // solta no arquivo inteiro deixava a prova passar com a planilha quebrada.
  const escritor = fonte7.slice(fonte7.indexOf('function escreverRelatorioNaAba_'));
  const corpo = escritor.slice(0, escritor.indexOf('\nfunction '));
  return /rel\.totais && rel\.totais\.length && rel\.linhas\.length > 1/.test(corpo) &&
    /consolidado\.totais\.length && consolidado\.linhas\.length > 1/.test(corpo);
})());

console.log('\n9. Duas tabelas seguidas dizem qual é qual');
const relT = ctx.relatorioDieselPeriodo_(null, null, null);
ok('a de cima tem título', relT.titulo === 'Mês a mês');
ok('a de baixo também', relT.consolidado.titulo === 'Semana a semana');
ok('e explica que é o mesmo total aberto por semana',
  /mesmo período da tabela acima/.test(relT.consolidado.subtitulo || ''),
  'dois blocos com o mesmo total parecem número repetido por engano');
ok('a tela desenha o título da tabela', (function () {
  // Montar a variavel nao basta: ela tem de entrar no HTML que volta. Era
  // justamente o que o mutante "nao desenha o titulo" explorava.
  const fn = (app7.match(/function tabela\(dados, vazio, opcoes\)[\s\S]*?\n  \}/) || [''])[0];
  return /esc\(dados\.titulo\)/.test(fn) &&
    /return titulo \+ '<div class="cartao" style="padding:0/.test(fn) &&
    /return titulo \+ '<div class="cartao">' \+ esc\(vazio/.test(fn);
})(), 'inclusive na tabela vazia: sem título, "Nada para mostrar" não diz de quê');
ok('e o PDF desenha os dois títulos e o subtítulo',
  /escHtml_\(rel\.titulo\)/.test(fonte7) &&
  /escHtml_\(consolidado\.titulo \|\| 'Consolidado'\)/.test(fonte7) &&
  /escHtml_\(consolidado\.subtitulo\)/.test(fonte7));

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
