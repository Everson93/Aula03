/**
 * Prova dos grupos de frota.
 *
 * O invariante que manda: a SOMA DOS GRUPOS TEM DE FECHAR COM O TOTAL. Se uma
 * categoria ficar fora de todos os grupos, ou aparecer em dois, o painel mostra
 * recortes que nao somam o que a empresa gastou — e, pior, continua parecendo
 * certo, porque cada numero isolado e plausivel.
 *
 * Por que os grupos saem da CATEGORIA e nao de uma coluna nova: categoria certa
 * implica grupo certo, sem nada a preencher por veiculo. Uma coluna a mais seria
 * mais um campo para ficar vazio.
 */
const fs = require('fs');
const vm = require('vm');

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: () => '2026-10-26' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    gruposFrota_, grupoDaCategoria_, chaveCategoria_, GRUPO_FROTA_OUTROS_,
    R_, TOTAL_COL_RESUMO, PARAMETROS_PADRAO, CATEGORIAS_VEICULO_PADRAO,
  });
`, ctx, { filename: 'Codigo.gs' });

const PADRAO = ctx.PARAMETROS_PADRAO.filter(function (p) { return p[0] === 'GRUPOS_FROTA'; })[0][1];
let CONFIG = PADRAO;
ctx.param_ = function (n) { return n === 'GRUPOS_FROTA' ? CONFIG : ''; };

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}

// ---- 1. o parâmetro padrão -------------------------------------------------
console.log('\n1. Configuração padrão');
let m = ctx.gruposFrota_();
ok('tem os três grupos, na ordem declarada',
  JSON.stringify(m.ordem) === JSON.stringify(['Transporte', 'Apoio', 'Operação interna']),
  JSON.stringify(m.ordem));
ok('Carreta Normal cai em Transporte', ctx.grupoDaCategoria_('Carreta Normal') === 'Transporte');
ok('Moto cai em Apoio', ctx.grupoDaCategoria_('Moto') === 'Apoio');
ok('Empilhadeira cai em Operação interna',
  ctx.grupoDaCategoria_('Empilhadeira/Paleteira') === 'Operação interna');

console.log('\n2. TODA categoria padrão está mapeada');
const orfas = ctx.CATEGORIAS_VEICULO_PADRAO.filter(function (c) {
  return ctx.grupoDaCategoria_(c) === ctx.GRUPO_FROTA_OUTROS_;
});
ok('nenhuma categoria do cadastro fica sem grupo', orfas.length === 0,
  'sem grupo: ' + orfas.join(', ') + ' — cairiam em "Outros" e o usuário não saberia por quê');

console.log('\n3. Comparação tolerante a acento e caixa');
ok('"OPERAÇÃO INTERNA" casa com "Operação interna"',
  ctx.chaveCategoria_('OPERAÇÃO INTERNA') === ctx.chaveCategoria_('Operação interna'));
ok('"empilhadeira/paleteira" em minúscula casa',
  ctx.grupoDaCategoria_('empilhadeira/paleteira') === 'Operação interna');
ok('"Truck Frigorifico" com espaço sobrando casa',
  ctx.grupoDaCategoria_('  Truck Frigorifico  ') === 'Transporte');
ok('categoria desconhecida vai para Outros, não para o primeiro grupo',
  ctx.grupoDaCategoria_('Drone') === ctx.GRUPO_FROTA_OUTROS_);
ok('categoria vazia vai para Outros', ctx.grupoDaCategoria_('') === ctx.GRUPO_FROTA_OUTROS_);

// ---- 4. O INVARIANTE: os grupos fecham com o total -------------------------
console.log('\n4. A soma dos grupos fecha com o total');
// Categoria repetida em dois grupos: o perigo é somar o mesmo custo duas vezes.
CONFIG = 'A: Carro, Moto | B: Moto, Maquina';
m = ctx.gruposFrota_();
ok('categoria em dois grupos fica só no primeiro (não duplica custo)',
  ctx.grupoDaCategoria_('Moto', m) === 'A',
  'ficou em ' + ctx.grupoDaCategoria_('Moto', m) + ' — em dois grupos, o custo da Moto ' +
  'entraria duas vezes e os grupos somariam mais que a frota');

CONFIG = PADRAO;
// Simula a agregação do painel sobre uma frota de teste.
function linha(categoria, total, km, litros) {
  const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
  l[ctx.R_.CATEGORIA] = categoria;
  l[ctx.R_.TOTAL] = total;
  l[ctx.R_.KM] = km;
  l[ctx.R_.LITROS] = litros;
  return l;
}
const frota = [
  linha('Carreta Normal', 50000, 20000, 8000),
  linha('Truck Normal', 30000, 15000, 5000),
  linha('Carro', 4000, 8000, 800),
  linha('Moto', 500, 2000, 50),
  linha('Empilhadeira/Paleteira', 9000, 300, 400),
  linha('Drone', 777, 10, 0),              // categoria fora de qualquer grupo
];
const mapa = ctx.gruposFrota_();
const porGrupo = {};
frota.forEach(function (l) {
  const g = ctx.grupoDaCategoria_(l[ctx.R_.CATEGORIA], mapa);
  porGrupo[g] = (porGrupo[g] || 0) + l[ctx.R_.TOTAL];
});
const totalFrota = frota.reduce(function (t, l) { return t + l[ctx.R_.TOTAL]; }, 0);
const somaGrupos = Object.keys(porGrupo).reduce(function (t, g) { return t + porGrupo[g]; }, 0);
ok('a soma dos grupos é exatamente o total da frota', somaGrupos === totalFrota,
  somaGrupos + ' x ' + totalFrota);
ok('a categoria não mapeada aparece em "Outros", não some',
  porGrupo[ctx.GRUPO_FROTA_OUTROS_] === 777,
  'sumir em silêncio faria os grupos não fecharem e ninguém saberia onde foi parar');
ok('Transporte soma as duas categorias dele', porGrupo['Transporte'] === 80000, String(porGrupo['Transporte']));

console.log('\n5. É isso que resolve o indicador sem sentido');
// Frota inteira: 45.310 km e 14.250 litros -> 3,18 km/l, que não é de ninguém.
const kmTodos = frota.reduce(function (t, l) { return t + l[ctx.R_.KM]; }, 0);
const litrosTodos = frota.reduce(function (t, l) { return t + l[ctx.R_.LITROS]; }, 0);
const transp = frota.filter(function (l) { return ctx.grupoDaCategoria_(l[ctx.R_.CATEGORIA], mapa) === 'Transporte'; });
const kmT = transp.reduce(function (t, l) { return t + l[ctx.R_.KM]; }, 0);
const litrosT = transp.reduce(function (t, l) { return t + l[ctx.R_.LITROS]; }, 0);
const apoio = frota.filter(function (l) { return ctx.grupoDaCategoria_(l[ctx.R_.CATEGORIA], mapa) === 'Apoio'; });
const kmA = apoio.reduce(function (t, l) { return t + l[ctx.R_.KM]; }, 0);
const litrosA = apoio.reduce(function (t, l) { return t + l[ctx.R_.LITROS]; }, 0);
console.log('     frota inteira: ' + (kmTodos / litrosTodos).toFixed(2) + ' km/l');
console.log('     transporte:    ' + (kmT / litrosT).toFixed(2) + ' km/l');
console.log('     apoio:         ' + (kmA / litrosA).toFixed(2) + ' km/l');
// O limiar absoluto que eu tinha posto aqui (0,5 km/l) era arbitrário e quase
// reprovou uma fixture correta. A afirmação que importa não é "o número do
// grupo difere do da frota" — é que o número da frota NÃO É DE NINGUÉM: ele
// fica entre os grupos, e os grupos são mundos diferentes entre si.
const frotaKmL = kmTodos / litrosTodos;
const transpKmL = kmT / litrosT;
const apoioKmL = kmA / litrosA;
ok('o km/l da frota fica ENTRE os grupos — não descreve nenhum deles',
  transpKmL < frotaKmL && frotaKmL < apoioKmL,
  transpKmL.toFixed(2) + ' < ' + frotaKmL.toFixed(2) + ' < ' + apoioKmL.toFixed(2));
ok('e os dois grupos são mundos diferentes (mais que o dobro)',
  apoioKmL > 2 * transpKmL,
  'apoio ' + apoioKmL.toFixed(2) + ' contra transporte ' + transpKmL.toFixed(2) +
  ' — com uma diferença dessas, uma média única não serve de indicador');
// A asserção que eu tinha aqui — "o R$/km do transporte difere do da frota" —
// era FALSA, e a fixture mostrou. O transporte responde por 80 mil dos 94 mil
// de custo: é correto que a média da frota fique colada na dele. O risco real é
// o oposto, e é este que o teste passa a cobrar: o grupo DOMINANTE sequestra a
// média, e o número da frota passa a mentir sobre os grupos pequenos.
const custoKmFrota = totalFrota / kmTodos;
const custoKmApoio = porGrupo['Apoio'] / kmA;
ok('a média da frota mente sobre o grupo pequeno',
  Math.abs(custoKmApoio - custoKmFrota) / custoKmFrota > 0.5,
  'apoio R$ ' + custoKmApoio.toFixed(3) + '/km contra R$ ' + custoKmFrota.toFixed(3) +
  ' da frota — quem olhasse só a frota acharia o apoio caríssimo');
ok('e fica colada no grupo dominante, como tem de ficar',
  Math.abs(porGrupo['Transporte'] / kmT - custoKmFrota) / custoKmFrota < 0.2,
  'não é defeito: o transporte é 85% do custo, então ele manda na média');

console.log('\n6. Parâmetro malformado não derruba o painel');
CONFIG = '';
ok('vazio não quebra e manda tudo para Outros',
  ctx.gruposFrota_().ordem.length === 0 && ctx.grupoDaCategoria_('Carro') === ctx.GRUPO_FROTA_OUTROS_);
CONFIG = 'sem dois pontos | : sem nome | Vazio:';
m = ctx.gruposFrota_();
ok('pedaços inválidos são ignorados sem erro', m.ordem.length === 0, JSON.stringify(m.ordem));
CONFIG = 'Transporte: Carreta Normal';
ok('um grupo só também funciona', ctx.grupoDaCategoria_('Carreta Normal') === 'Transporte');

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
