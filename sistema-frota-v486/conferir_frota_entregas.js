/**
 * Prova do filtro por GRUPO de frota nos relatórios (V4.36).
 *
 * O usuário mandou a lista da frota de entregas — Carga Seca e Frigorífico,
 * Caminhão e Carreta — e pediu um filtro que puxe só os gastos dela. Essas
 * quatro já são categorias do cadastro, e o parâmetro GRUPOS_FROTA já as
 * juntava num grupo só. Então o que faltava não era o grupo: era poder
 * FILTRAR por ele.
 *
 * O risco desta mudança tem nome. A comparação de categoria estava repetida em
 * oito lugares (`String(linha) !== categoria`). Oito lugares seriam oito
 * chances de um relatório ignorar o grupo em silêncio e devolver a frota
 * inteira — sem erro nenhum, só um número maior do que devia. Por isso a
 * comparação ganhou um dono único, e há regra estática cobrando que ninguém
 * volte a comparar por fora.
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

const diario = { params: {} };
const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: () => '2026-11' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    categoriaCasa_, rotuloFiltroCategoria_, grupoDaCategoria_, gruposFrota_,
    relatorioPorTipo_, webRelatorio, migrarGrupoTransporteParaEntregas_,
    PREFIXO_FILTRO_GRUPO_, PARAMETROS_PADRAO, R_, TOTAL_COL_RESUMO,
  });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  exigirPerfilToken_ = function () {};
  registrarLog_ = function () {};
  lerResumo_ = function () { return __resumo; };
  // Os relatorios sao de DUAS fontes: uns leem o Resumo (R_.CATEGORIA), outros
  // os lancamentos (L_.CATEGORIA). Sao dois lados do mesmo filtro, e provar so
  // um deixaria metade dos relatorios ignorando o grupo.
  lerLancamentos_ = function () { return __lanc; };
  Object.assign(globalThis, { L_: L_, TOTAL_COL_LANC: TOTAL_COL_LANC });
  param_ = function (n) { return __params[n] === undefined ? '' : __params[n]; };
  paramOuPadrao_ = function (n, p) { return __params[n] === undefined || __params[n] === '' ? p : __params[n]; };
  gravarParam_ = function (n, v) { __params[n] = v; };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26), fim: new Date(2026, 10, 25) }; };
  periodoDoMes_ = function () { return periodoAtual_(); };
  litrosLubrificantePorPlaca_ = function () { return {}; };
  letraCombustivelVeiculo_ = function () { return 'D'; };
  dadosVeiculosExecucao_ = function () { return []; };
  formatarData_ = function () { return '26/10/2026'; };
  resolverVeiculo_ = function (p) { return { ok: true, veiculo: { placa: String(p) } }; };
`, ctx);

const PADRAO = 'Frota Entregas: Truck Normal, Truck Frigorifico, Carreta Normal, ' +
  'Carreta Frigorifica | Apoio: Carro, Moto, Leve | Operação interna: Empilhadeira/Paleteira, Maquina';
ctx.__params = { GRUPOS_FROTA: PADRAO, MES_REFERENCIA: '2026-11', EMPRESA: 'Giassi' };

function veic(placa, desc, cat, centro, oficina, combustivel) {
  const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
  l[ctx.R_.PLACA] = placa;
  l[ctx.R_.DESCRICAO] = desc;
  l[ctx.R_.CATEGORIA] = cat;
  l[ctx.R_.CENTRO] = centro;
  // KM > 0: o ranking e por custo/km e descarta quem nao rodou — sem isso a
  // prova dele mediria o divisor, nao o filtro.
  l[ctx.R_.KM] = 1000;
  l[ctx.R_.OFICINA] = oficina || 0;
  l[ctx.R_.COMBUSTIVEL] = combustivel || 0;
  l[ctx.R_.TOTAL] = (oficina || 0) + (combustivel || 0);
  return l;
}

// A frota do papel do usuário, mais dois de fora para o filtro ter o que cortar.
ctx.__resumo = [
  veic('MCZ2627', 'Carreta carga seca', 'Carreta Normal', 'DEPOSITO', 1000, 5000),
  veic('QHK 4E72', 'Caminhão frigorífico', 'Truck Frigorifico', 'DEPOSITO', 2000, 7000),
  veic('MBI1011', 'Carreta frigorífica', 'Carreta Frigorifica', 'DEPOSITO', 500, 4000),
  veic('RYH8B57', 'Caminhão carga seca', 'Truck Normal', 'DEPOSITO', 300, 3000),
  veic('CAR 0001', 'Gol da gerência', 'Carro', 'ADM Central', 100, 400),
  veic('EMP 0001', 'Empilhadeira', 'Empilhadeira/Paleteira', 'DEPOSITO', 900, 0),
];

function lanc(placa, cat, tipo, litros, valor) {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = new Date(2026, 10, 10, 12, 0, 0, 0);
  l[ctx.L_.PLACA] = placa;
  l[ctx.L_.CATEGORIA] = cat;
  l[ctx.L_.CENTRO] = 'DEPOSITO';
  l[ctx.L_.TIPO] = tipo;
  l[ctx.L_.LITROS] = litros || 0;
  l[ctx.L_.VALOR] = valor || 0;
  return l;
}
ctx.__lanc = [
  lanc('MCZ2627', 'Carreta Normal', 'Combustivel Terceiros', 300, 1800),
  lanc('QHK 4E72', 'Truck Frigorifico', 'Combustivel Proprio', 200, 1200),
  lanc('MBI1011', 'Carreta Frigorifica', 'Combustivel Terceiros', 150, 900),
  lanc('RYH8B57', 'Truck Normal', 'Combustivel Terceiros', 100, 600),
  lanc('CAR 0001', 'Carro', 'Combustivel Terceiros', 40, 260),
  lanc('EMP 0001', 'Empilhadeira/Paleteira', 'Combustivel Proprio', 20, 120),
];

console.log('\n1. O que o filtro quer dizer');
ok('filtro vazio aceita tudo', ctx.categoriaCasa_('Carro', '') === true);
ok('categoria casa exata', ctx.categoriaCasa_('Carro', 'Carro') === true);
ok('e não casa parecida', ctx.categoriaCasa_('Carro', 'Carreta Normal') === false);
ok('GRUPO: casa pelo grupo da categoria',
  ctx.categoriaCasa_('Carreta Normal', 'GRUPO:Frota Entregas') === true);
ok('e recusa quem é de outro grupo',
  ctx.categoriaCasa_('Carro', 'GRUPO:Frota Entregas') === false);
ok('categoria fora de qualquer grupo cai em "Outros"',
  ctx.grupoDaCategoria_('Bicicleta') === 'Outros' &&
  ctx.categoriaCasa_('Bicicleta', 'GRUPO:Outros') === true);
// Uma categoria chamada "GRUPO:x" nao existe no cadastro; o que importa e que
// o prefixo nunca seja confundido com nome de categoria de verdade.
ok('o prefixo não vaza para a comparação de categoria',
  ctx.categoriaCasa_('GRUPO:Frota Entregas', 'GRUPO:Frota Entregas') === false,
  'o valor da linha é a categoria do veículo, nunca o filtro');
ok('o rótulo da mensagem distingue os dois',
  ctx.rotuloFiltroCategoria_('GRUPO:Frota Entregas') === 'no grupo Frota Entregas' &&
  ctx.rotuloFiltroCategoria_('Carro') === 'na categoria Carro');

console.log('\n2. O relatório puxa só a frota do grupo');
const rel = ctx.relatorioPorTipo_('Relatório Operacional dos Veículos', null,
  'GRUPO:Frota Entregas', null, '');
const placas = rel.linhas.map(function (l) { return l[0]; }).sort();
ok('são os quatro da planilha, e só eles',
  JSON.stringify(placas) === JSON.stringify(['MBI1011', 'MCZ2627', 'QHK 4E72', 'RYH8B57']),
  JSON.stringify(placas));
ok('o carro da gerência ficou de fora', placas.indexOf('CAR 0001') === -1);
ok('a empilhadeira também', placas.indexOf('EMP 0001') === -1);
ok('e sem filtro vêm todos',
  ctx.relatorioPorTipo_('Relatório Operacional dos Veículos', null, null, null, '')
    .linhas.length === 6);
ok('filtrar por UMA categoria do grupo continua funcionando',
  ctx.relatorioPorTipo_('Relatório Operacional dos Veículos', null, 'Truck Normal', null, '')
    .linhas.length === 1,
  'o campo é um só: categoria OU grupo');

console.log('\n3. Todo relatório obedece, não só o primeiro');
// Era o risco da mudanca: a comparacao estava repetida em oito lugares.
[['Despesas por veículo (exceto depreciação)', 4],
 ['Manutenção por veículo', 4],
 ['Ranking de custo por KM', 4],
 ['Combustível lançado por veículo', 4],
].forEach(function (par) {
  const r = ctx.relatorioPorTipo_(par[0], null, 'GRUPO:Frota Entregas', null, '');
  const linhas = r.linhas || [];
  // Contar nao basta: 0 linha tambem "nao traz quem nao e do grupo". A prova e
  // que vieram os QUATRO e que os dois de fora nao aparecem em lugar nenhum
  // da tabela.
  const texto = JSON.stringify(linhas);
  ok('"' + par[0] + '" traz o grupo inteiro',
    linhas.length === par[1], linhas.length + ' linha(s), esperado ' + par[1]);
  ok('"' + par[0] + '" não traz quem é de fora',
    texto.indexOf('CAR 0001') === -1 && texto.indexOf('EMP 0001') === -1,
    texto.slice(0, 120));
});
ok('nenhum relatório compara categoria por fora do dono', (function () {
  const fonte = fs.readFileSync('Codigo.gs', 'utf8');
  return !/categoria\s*&&\s*String\(/.test(fonte);
})(), 'oito comparações soltas eram oito chances de ignorar o grupo em silêncio');
ok('e a função dona existe com um nome só',
  (fs.readFileSync('Codigo.gs', 'utf8').match(/^function categoriaCasa_\(/gm) || []).length === 1);

console.log('\n4. O grupo se chama Frota Entregas');
ok('o padrão do parâmetro já vem com o nome', (function () {
  const p = ctx.PARAMETROS_PADRAO.filter(function (x) { return x[0] === 'GRUPOS_FROTA'; })[0];
  return p && p[1].indexOf('Frota Entregas:') === 0;
})());
ok('e junta as quatro categorias da planilha do usuário', (function () {
  const g = ctx.gruposFrota_();
  return ['Truck Normal', 'Truck Frigorifico', 'Carreta Normal', 'Carreta Frigorifica']
    .every(function (c) { return ctx.grupoDaCategoria_(c) === 'Frota Entregas'; }) &&
    g.ordem[0] === 'Frota Entregas';
})());

console.log('\n5. A migração do nome antigo');
ctx.__params.GRUPOS_FROTA = 'Transporte: Truck Normal, Carreta Normal | Apoio: Carro';
ok('renomeia o padrão antigo', ctx.migrarGrupoTransporteParaEntregas_() === true);
ok('mantendo a lista intacta',
  ctx.__params.GRUPOS_FROTA === 'Frota Entregas: Truck Normal, Carreta Normal | Apoio: Carro',
  ctx.__params.GRUPOS_FROTA);
ok('e não renomeia de novo na segunda vez',
  ctx.migrarGrupoTransporteParaEntregas_() === false);
// O Instalar roda a cada versao: sobrescrever a escolha do usuario toda vez e
// a forma mais rapida de ele parar de confiar no botao.
ctx.__params.GRUPOS_FROTA = 'Frota do Seu João: Truck Normal';
ok('quem já renomeou à mão não é atropelado',
  ctx.migrarGrupoTransporteParaEntregas_() === false &&
  ctx.__params.GRUPOS_FROTA === 'Frota do Seu João: Truck Normal');

console.log('\n6. A tela: um campo só, com os grupos em cima');
const app = fs.readFileSync('App.html', 'utf8');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ok('o servidor manda a lista de grupos junto dos filtros',
  (fonte.match(/grupos: gruposFrota_\(\)\.ordem/g) || []).length === 2,
  'as duas portas: webFiltros e o pacote do início');
ok('a tela monta um campo só, "Categoria ou grupo"',
  /Categoria ou grupo/.test(app) && /seletorCategoriaOuGrupo\('relCategoria'\)/.test(app));
ok('com os grupos num optgroup separado',
  /<optgroup label="Grupos de frota">/.test(app) && /<optgroup label="Categorias">/.test(app),
  'misturados, "Carreta Normal" e "Frota Entregas" pareceriam a mesma coisa');
ok('e o valor vai com o prefixo que o servidor conhece',
  /var v = 'GRUPO:' \+ g;/.test(app));
ok('a exportação em planilha usa o MESMO filtro',
  (app.match(/categoria: el\('relCategoria'\)\.value/g) || []).length === 2,
  'tela e planilha com filtros diferentes é a pior forma de descobrir um defeito');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
