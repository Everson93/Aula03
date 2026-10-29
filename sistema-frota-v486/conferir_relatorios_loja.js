/**
 * Prova dos relatorios por loja.
 *
 * O veiculo ja e vinculado a loja pelo centro de custo do cadastro, entao
 * "por loja" e agrupar por R_.CENTRO. O que precisa ser provado nao e a soma
 * — e que NADA se perca no agrupamento: veiculo sem centro, loja sem
 * depreciacao, filtro aplicado. Linha que some de um relatorio e dinheiro que
 * ninguem cobra.
 */
const fs = require('fs');
const vm = require('vm');

const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: () => '2026-10' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    relatorioDepreciacaoPorLoja_, relatorioManutencaoPorLoja_, relatorioPorTipo_,
    CATALOGO_RELATORIOS, TIPOS_RELATORIO, TIPOS_RELATORIO_PLANILHA,
    R_, TOTAL_COL_RESUMO,
  });
  exigirExecucaoLeitura_ = function () {};
  lerResumo_ = function () { return __resumo; };
`, ctx);

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

function veic(placa, desc, cat, centro, dep, oficina, pneus) {
  const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
  l[ctx.R_.PLACA] = placa;
  l[ctx.R_.DESCRICAO] = desc;
  l[ctx.R_.CATEGORIA] = cat;
  l[ctx.R_.CENTRO] = centro;
  l[ctx.R_.DEPRECIACAO] = dep || 0;
  l[ctx.R_.OFICINA] = oficina || 0;
  l[ctx.R_.PNEUS] = pneus || 0;
  return l;
}

ctx.__resumo = [
  veic('AAA 0001', 'Fiorino', 'Leve', 'Loja 02', 300, 1000, 0),
  veic('BBB 0002', 'Saveiro', 'Leve', 'Loja 10', 400, 500, 200),
  veic('CCC 0003', 'Truck',   'Truck Normal', 'Loja 02', 1200, 4000, 1000),
  veic('DDD 0004', 'Moto',    'Moto', 'Loja 1', 100, 0, 0),
  veic('EEE 0005', 'Carreta', 'Carreta Normal', 'Loja 10', 2000, 0, 0),
];

console.log('\n1. Depreciação por loja');
let r = ctx.relatorioDepreciacaoPorLoja_(null, null, null);
ok('uma linha por loja, não por veículo', r.linhas.length === 3,
  JSON.stringify(r.linhas.map(function (l) { return l[0]; })));
ok('as lojas saem em ordem numérica',
  r.linhas.map(function (l) { return l[0]; }).join(',') === 'Loja 1,Loja 02,Loja 10',
  r.linhas.map(function (l) { return l[0]; }).join(','));
ok('soma a depreciação da loja', r.linhas[1][2] === 1500, String(r.linhas[1][2]));
ok('conta os veículos da loja', r.linhas[1][1] === 2, String(r.linhas[1][1]));
ok('a fatia é sobre o total', Math.abs(r.linhas[1][3] - (1500 / 4000) * 100) < 0.01,
  String(r.linhas[1][3]));
ok('o total fecha com a soma', r.totais[2] === 4000, String(r.totais[2]));
ok('e conta todos os veículos', r.totais[1] === 5, String(r.totais[1]));

console.log('\n2. O que NÃO pode sumir no agrupamento');
// Veículo sem centro é dinheiro que existe e não tem dono. Some da lista =
// o total do relatório deixa de bater com o Resumo, sem aviso.
ctx.__resumo = ctx.__resumo.concat([veic('FFF 0006', 'Órfão', 'Leve', '', 700, 900, 0)]);
r = ctx.relatorioDepreciacaoPorLoja_(null, null, null);
const semCentro = r.linhas.filter(function (l) { return l[0] === '(sem centro)'; });
ok('veículo sem centro vira "(sem centro)", não desaparece',
  semCentro.length === 1 && semCentro[0][2] === 700, JSON.stringify(r.linhas));
ok('e entra no total', r.totais[2] === 4700, String(r.totais[2]));

// Veículo sem depreciação não polui a lista.
ctx.__resumo.push(veic('GGG 0007', 'Sem dep', 'Leve', 'Loja 02', 0, 100, 0));
r = ctx.relatorioDepreciacaoPorLoja_(null, null, null);
ok('veículo com depreciação zero não conta como veículo da loja',
  r.linhas.filter(function (l) { return l[0] === 'Loja 02'; })[0][1] === 2,
  'a coluna conta quem deprecia, não quem existe');

console.log('\n3. Manutenção por loja, com o veículo');
r = ctx.relatorioManutencaoPorLoja_(null, null, null);
ok('uma linha por veículo', r.linhas.length === 5,
  JSON.stringify(r.linhas.map(function (l) { return l[1]; })));
ok('tem a coluna do veículo', r.colunas[1].titulo === 'Placa / ID' &&
  r.colunas[2].titulo === 'Veículo', JSON.stringify(r.colunas.map(function (c) { return c.titulo; })));
ok('quem não teve manutenção fica de fora',
  !r.linhas.some(function (l) { return l[1] === 'EEE 0005'; }),
  'carreta sem oficina nem pneus');
ok('as lojas saem em ordem numérica',
  r.linhas.map(function (l) { return l[0]; }).join(',') ===
  '(sem centro),Loja 02,Loja 02,Loja 02,Loja 10',
  r.linhas.map(function (l) { return l[0]; }).join(','));
ok('dentro da loja, o maior gasto primeiro',
  r.linhas.filter(function (l) { return l[0] === 'Loja 02'; })
    .map(function (l) { return l[6]; }).join(',') === '5000,1000,100',
  r.linhas.filter(function (l) { return l[0] === 'Loja 02'; })
    .map(function (l) { return l[6]; }).join(','));
ok('a manutenção é oficina + pneus',
  r.linhas.filter(function (l) { return l[1] === 'CCC 0003'; })[0][6] === 5000);
ok('a fatia é sobre a LOJA, não sobre o total geral',
  Math.abs(r.linhas.filter(function (l) { return l[1] === 'CCC 0003'; })[0][7] -
    (5000 / 6100) * 100) < 0.01,
  String(r.linhas.filter(function (l) { return l[1] === 'CCC 0003'; })[0][7]));
ok('as fatias de uma loja somam 100%',
  Math.abs(r.linhas.filter(function (l) { return l[0] === 'Loja 02'; })
    .reduce(function (t, l) { return t + l[7]; }, 0) - 100) < 0.01);
ok('os totais somam oficina e pneus separados',
  r.totais[4] === 6500 && r.totais[5] === 1200 && r.totais[6] === 7700,
  JSON.stringify([r.totais[4], r.totais[5], r.totais[6]]));

console.log('\n4. Os filtros continuam valendo');
r = ctx.relatorioManutencaoPorLoja_('Loja 02', null, null);
ok('filtro de centro reduz a lista', r.linhas.length === 3 &&
  r.linhas.every(function (l) { return l[0] === 'Loja 02'; }),
  JSON.stringify(r.linhas.map(function (l) { return l[0]; })));
ok('e a fatia continua sobre a loja filtrada',
  Math.abs(r.linhas[0][7] - (5000 / 6100) * 100) < 0.01, String(r.linhas[0][7]));
r = ctx.relatorioDepreciacaoPorLoja_(null, 'Moto', null);
ok('filtro de categoria também', r.linhas.length === 1 && r.linhas[0][0] === 'Loja 1',
  JSON.stringify(r.linhas));

console.log('\n5. Lista vazia não quebra');
ctx.__resumo = [];
r = ctx.relatorioDepreciacaoPorLoja_(null, null, null);
ok('depreciação sem dados devolve lista vazia', r.linhas.length === 0 && r.totais[2] === 0);
ok('sem divisão por zero', !JSON.stringify(r).match(/NaN|Infinity/));
r = ctx.relatorioManutencaoPorLoja_(null, null, null);
ok('manutenção sem dados devolve lista vazia', r.linhas.length === 0 && r.totais[6] === 0);
ok('sem divisão por zero', !JSON.stringify(r).match(/NaN|Infinity/));

console.log('\n6. Registrados no catálogo e no despacho');
// Três pontas: o catálogo (que gera a lista da tela), o despacho (que chama a
// função) e a função. Faltar uma não dá erro — dá relatório que não abre, ou
// item de menu que não existe.
['Depreciação por loja', 'Manutenção por loja'].forEach(function (nome) {
  ok(nome + ': está no catálogo', !!ctx.CATALOGO_RELATORIOS[nome]);
  ok(nome + ': aparece na lista de tipos', ctx.TIPOS_RELATORIO.indexOf(nome) !== -1);
  ok(nome + ': o despacho conhece', (function () {
    ctx.__resumo = [veic('X', 'x', 'Leve', 'Loja 01', 10, 10, 0)];
    const res = ctx.relatorioPorTipo_(nome, null, null, null, '');
    return res && res.linhas && !/desconhecido/.test(res.mensagem || '');
  })(), 'relatório no catálogo sem case no despacho devolve "Relatório desconhecido"');
  ok(nome + ': tem descrição', (ctx.CATALOGO_RELATORIOS[nome].descricao || '').length > 20);
  ok(nome + ': é só do app', ctx.CATALOGO_RELATORIOS[nome].somenteApp === true,
    'não tem fórmula de QUERY para a aba Relatórios');
  ok(nome + ': fica fora da lista da planilha',
    ctx.TIPOS_RELATORIO_PLANILHA.indexOf(nome) === -1);
  const cat = ctx.CATALOGO_RELATORIOS[nome];
  ctx.__resumo = [veic('X', 'x', 'Leve', 'Loja 01', 10, 10, 0)];
  const res = ctx.relatorioPorTipo_(nome, null, null, null, '');
  ok(nome + ': o catálogo e a função têm as MESMAS colunas',
    cat.colunas.length === res.colunas.length,
    cat.colunas.length + ' no catálogo x ' + res.colunas.length + ' na função');
  ok(nome + ': e na mesma ordem',
    cat.colunas.map(function (c) { return c[0]; }).join('|') ===
    res.colunas.map(function (c) { return c.titulo; }).join('|'),
    cat.colunas.map(function (c) { return c[0]; }).join('|') + '  ≠  ' +
    res.colunas.map(function (c) { return c.titulo; }).join('|'));
});

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
