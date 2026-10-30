/**
 * Prova do relatório "Combustível lançado por veículo".
 *
 * O relatório "Abastecimento e consumo" já dá o total do mês por veículo,
 * tirado do Resumo. Este dá a ORIGEM desse total: cada abastecimento, com o
 * preço do litro daquele abastecimento.
 *
 * É esse preço unitário que justifica o relatório existir — a média do mês
 * esconde o abastecimento caro. Sete abastecimentos a R$ 6,10 e um a
 * R$ 9,40 fecham numa média que parece normal. Por isso quase toda prova
 * aqui é sobre a aritmética por linha e por veículo não virar média de
 * médias.
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
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { relatorioCombustivelLancado_, relatorioPorTipo_,
    consolidadoOficina_, CATALOGO_RELATORIOS, L_, COL_VEIC, TIPOS_COMBUSTIVEL,
    ABASTECIMENTO_INTERNO, ABASTECIMENTO_EXTERNO });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-10' : ''; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26), fim: new Date(2026, 10, 25) }; };
  periodoDoMes_ = function () { return periodoAtual_(); };
  lerLancamentos_ = function () { return __lancamentos; };
  dadosVeiculosExecucao_ = function () { return __veic; };
`, ctx);

const data = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); })', ctx);

function lanc(dt, placa, tipo, litros, valor, extras) {
  const l = new Array(20).fill('');
  const e = extras || {};
  l[ctx.L_.DATA] = dt; l[ctx.L_.PLACA] = placa; l[ctx.L_.TIPO] = tipo;
  l[ctx.L_.LITROS] = litros; l[ctx.L_.VALOR] = valor;
  l[ctx.L_.DOCUMENTO] = e.nf || ''; l[ctx.L_.CENTRO] = e.centro || 'Loja 02';
  l[ctx.L_.CATEGORIA] = e.categoria || 'Leve'; l[ctx.L_.ID] = e.id || 'LAN-X';
  l[ctx.L_.TIPO_ABASTECIMENTO] = e.abastecimento || '';
  return l;
}
function veic(placa, descricao, patrimonio) {
  const v = new Array(20).fill('');
  v[ctx.COL_VEIC.PLACA - 1] = placa;
  v[ctx.COL_VEIC.DESCRICAO - 1] = descricao;
  v[ctx.COL_VEIC.CODIGO - 1] = patrimonio;
  return v;
}

ctx.__veic = [veic('AAA 0001', 'Fiorino', '10000017'), veic('BBB 0002', 'Scania', '10001099')];

// O caro é o ÚLTIMO abastecimento da AAA: R$ 9,40/L contra R$ 6,10. Na média
// do mês ele some; é justamente o que este relatório existe para mostrar.
ctx.__lancamentos = [
  lanc(data(2026, 10, 5), 'AAA 0001', 'Combustivel Terceiros', 40, 244, { nf: 'NF 1', id: 'LAN-1' }),
  lanc(data(2026, 10, 12), 'AAA 0001', 'Combustivel Terceiros', 50, 305, { nf: 'NF 2', id: 'LAN-2' }),
  lanc(data(2026, 10, 20), 'AAA 0001', 'Combustivel Terceiros', 10, 94, { nf: 'NF 3', id: 'LAN-3' }),
  lanc(data(2026, 10, 18), 'BBB 0002', 'Combustivel Proprio', 300, 1830,
    { nf: 'INT', id: 'LAN-4', centro: 'Loja 10', categoria: 'Carreta Normal',
      abastecimento: 'Interno' }),
  // Ruídos que NÃO podem entrar: outro tipo de despesa e um mês anterior.
  lanc(data(2026, 10, 15), 'AAA 0001', 'Oficina Despesa', 0, 500, { id: 'LAN-5' }),
  lanc(data(2026, 8, 3), 'AAA 0001', 'Combustivel Terceiros', 45, 270, { id: 'LAN-6' }),
];

const C = { DATA: 0, PLACA: 1, PATRIMONIO: 2, VEICULO: 3, TIPO: 4, ABAST: 5, NF: 6,
  LITROS: 7, VALOR: 8, PRECO: 9, CENTRO: 10, ID: 11 };

console.log('\n1. Só combustível entra');
const r = ctx.relatorioCombustivelLancado_(null, null, null);
ok('a oficina fica de fora',
  !r.linhas.some(function (l) { return l[C.ID] === 'LAN-5'; }),
  r.linhas.map(function (l) { return l[C.ID]; }).join(','));
ok('os dois tipos de combustível entram',
  r.linhas.filter(function (l) { return /Combustivel/.test(l[C.TIPO]); }).length === r.linhas.length);
// Detalhamento usa TODA a base, como o de oficina: conferir consumo exige
// olhar para tras.
ok('o mês anterior entra: o relatório é de toda a base',
  r.linhas.some(function (l) { return l[C.ID] === 'LAN-6'; }),
  r.linhas.map(function (l) { return l[C.ID]; }).join(','));
ok('cinco abastecimentos ao todo', r.linhas.length === 5, String(r.linhas.length));

console.log('\n2. A linha traz litros, valor e o preço daquele abastecimento');
const caro = r.linhas.filter(function (l) { return l[C.ID] === 'LAN-3'; })[0];
ok('litros', caro[C.LITROS] === 10, String(caro[C.LITROS]));
ok('valor', caro[C.VALOR] === 94, String(caro[C.VALOR]));
ok('e o R$/litro é desta linha, não a média do veículo',
  caro[C.PRECO] === 9.4, String(caro[C.PRECO]));
const barato = r.linhas.filter(function (l) { return l[C.ID] === 'LAN-1'; })[0];
ok('o abastecimento normal fica em 6,10', barato[C.PRECO] === 6.1, String(barato[C.PRECO]));
ok('os dois preços são diferentes na mesma placa', caro[C.PRECO] !== barato[C.PRECO],
  'se fossem iguais, a prova não distinguiria preço da linha de média do veículo');
ok('a nota acompanha a linha certa', caro[C.NF] === 'NF 3', String(caro[C.NF]));
ok('o patrimônio vem do cadastro', caro[C.PATRIMONIO] === '10000017', String(caro[C.PATRIMONIO]));
ok('e o veículo também', caro[C.VEICULO] === 'Fiorino', String(caro[C.VEICULO]));
ok('abastecimento interno é identificado',
  r.linhas.filter(function (l) { return l[C.ID] === 'LAN-4'; })[0][C.ABAST] ===
  ctx.ABASTECIMENTO_INTERNO,
  r.linhas.filter(function (l) { return l[C.ID] === 'LAN-4'; })[0][C.ABAST]);
ok('litro zero não vira divisão por zero', (function () {
  const guardado = ctx.__lancamentos;
  ctx.__lancamentos = [lanc(data(2026, 10, 5), 'AAA 0001', 'Combustivel Terceiros', 0, 50, { id: 'Z' })];
  const z = ctx.relatorioCombustivelLancado_(null, null, null);
  ctx.__lancamentos = guardado;
  return z.linhas[0][C.PRECO] === 0 && isFinite(z.linhas[0][C.PRECO]);
})(), 'NaN e Infinity somem no PDF e viram célula vazia');

console.log('\n3. Mais recente primeiro');
ok('a ordem é da data mais nova para a mais velha',
  r.linhas.map(function (l) { return l[C.ID]; }).join(',') === 'LAN-3,LAN-4,LAN-2,LAN-1,LAN-6',
  r.linhas.map(function (l) { return l[C.DATA] + '/' + l[C.ID]; }).join(' '));

console.log('\n4. O rodapé');
// 40+50+10+300+45 = 445 L; 244+305+94+1830+270 = 2.743
ok('soma os litros', r.totais[C.LITROS] === 445, String(r.totais[C.LITROS]));
ok('soma o valor', r.totais[C.VALOR] === 2743, String(r.totais[C.VALOR]));
// Media das medias daria 6,88; valor/litros da 6,163...
ok('o preço do rodapé é valor total / litros totais',
  Math.abs(r.totais[C.PRECO] - 2743 / 445) < 1e-9, String(r.totais[C.PRECO]));
ok('e NÃO é a média dos preços das linhas', (function () {
  const media = r.linhas.reduce(function (t, l) { return t + l[C.PRECO]; }, 0) / r.linhas.length;
  return Math.abs(r.totais[C.PRECO] - media) > 0.01;
})(), 'um abastecimento de 10 L pesaria igual a um de 300');
ok('as colunas de texto não ganham total',
  r.totais[C.PLACA] === null && r.totais[C.CENTRO] === null);

console.log('\n5. O consolidado por veículo');
const c = r.consolidado;
ok('uma linha por veículo', c.linhas.length === 2, String(c.linhas.length));
ok('o que mais gastou vem primeiro', c.linhas[0][0] === 'BBB 0002', c.linhas[0][0]);
ok('conta os abastecimentos', c.linhas[1][2] === 4, String(c.linhas[1][2]));
ok('soma os litros do veículo', c.linhas[1][3] === 145, String(c.linhas[1][3]));
ok('soma o valor do veículo', c.linhas[1][4] === 913, String(c.linhas[1][4]));
ok('e o R$/litro do veículo é valor / litros',
  Math.abs(c.linhas[1][5] - 913 / 145) < 1e-9, String(c.linhas[1][5]));
ok('o rodapé do consolidado bate com o da tabela',
  c.totais[3] === r.totais[C.LITROS] && c.totais[4] === r.totais[C.VALOR],
  JSON.stringify(c.totais));
// O consolidado vem PRONTO: antes a tela montava as colunas, e isso amarrava
// todo consolidado ao formato da oficina.
ok('o consolidado vem com as colunas dele', c.colunas.length === 6 &&
  c.colunas[2].titulo === 'Abastecimentos' && c.colunas[5].titulo === 'R$ / litro',
  c.colunas.map(function (x) { return x.titulo; }).join(' | '));
ok('e não com a coluna de natureza, que é da oficina',
  !c.colunas.some(function (x) { return /Natureza/.test(x.titulo); }),
  c.colunas.map(function (x) { return x.titulo; }).join(' | '));
ok('o consolidado da oficina continua com as colunas dele',
  ctx.consolidadoOficina_([{ placa: 'A', descricao: 'x', itens: 1, valor: 10, naturezas: { Peça: 10 } }])
    .colunas.map(function (x) { return x.titulo; }).join('|') ===
  'Placa|Veículo|Serviços|Natureza que mais pesou|Total');

console.log('\n6. Os filtros');
ok('filtra por placa',
  ctx.relatorioCombustivelLancado_(null, null, 'BBB 0002').linhas.length === 1);
ok('filtra por centro',
  ctx.relatorioCombustivelLancado_('Loja 10', null, null).linhas.length === 1);
ok('filtra por categoria',
  ctx.relatorioCombustivelLancado_(null, 'Carreta Normal', null).linhas.length === 1);
ok('o consolidado acompanha o filtro',
  ctx.relatorioCombustivelLancado_('Loja 10', null, null).consolidado.linhas.length === 1,
  'consolidado da frota inteira ao lado de uma tabela filtrada é mentira');
ok('sem combustível nenhum, não quebra', (function () {
  const guardado = ctx.__lancamentos;
  ctx.__lancamentos = [];
  const vazio = ctx.relatorioCombustivelLancado_(null, null, null);
  ctx.__lancamentos = guardado;
  return vazio.linhas.length === 0 && vazio.consolidado.linhas.length === 0 &&
    vazio.totais[C.PRECO] === 0;
})());

console.log('\n7. A tela alcança o relatório');
ok('está no catálogo', !!ctx.CATALOGO_RELATORIOS['Combustível lançado por veículo']);
ok('e o despachante conhece o nome',
  ctx.relatorioPorTipo_('Combustível lançado por veículo', null, null, null, '').linhas.length === 5,
  'nome no catálogo sem case no switch devolve relatório vazio, sem erro');
ok('as colunas do catálogo batem com as do relatório',
  ctx.CATALOGO_RELATORIOS['Combustível lançado por veículo'].colunas.length === r.colunas.length,
  ctx.CATALOGO_RELATORIOS['Combustível lançado por veículo'].colunas.length + ' x ' + r.colunas.length);
ok('e na mesma ordem',
  ctx.CATALOGO_RELATORIOS['Combustível lançado por veículo'].colunas
    .map(function (x) { return x[0]; }).join('|') ===
  r.colunas.map(function (x) { return x.titulo; }).join('|'),
  'catálogo fora de ordem = planilha exportada com cabeçalho trocado');

const app = fs.readFileSync('App.html', 'utf8');
ok('a tela desenha o consolidado que o servidor manda',
  /tabela\(dados\.consolidado\)/.test(app) && app.indexOf('porVeiculo') === -1,
  'a tela montava as colunas do consolidado, amarrando todos ao formato da oficina');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
