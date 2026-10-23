/**
 * Regra estatica: TODA pendencia registrada como corrigivel por campo precisa
 * produzir um detalhe de onde o alvo seja extraivel.
 *
 * Por que isto existe: "Leitura de KM menor que a anterior" estava registrada
 * como corrigivel, mas o coletor escrevia o detalhe como
 *   "2026-10 • 06/10/2026: 677096 < 678573 (linha 96)"
 * com o numero no FIM, enquanto todas as outras escrevem "linha 96 • ...". O
 * parser nao reconhecia, correcaoDaPendencia_ devolvia null, e o campo
 * simplesmente NAO APARECIA na tela. Sem erro, sem aviso — a pendencia so ficava
 * impossivel de resolver.
 *
 * Um teste de unidade do parser nao pegaria isso: o parser estava certo para o
 * formato que ele conhecia. O que faltava era confrontar os dois lados — quem
 * REGISTRA a correcao e quem ESCREVE o detalhe. E o que esta regra faz, lendo o
 * proprio codigo-fonte.
 */
const fs = require('fs');
const vm = require('vm');

const fonte = fs.readFileSync('Codigo.gs', 'utf8');

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: (d) => String(d) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fonte + `
  Object.assign(globalThis, {
    CORRECOES_PENDENCIA_, CORRECOES_PENDENCIA_PREFIXO_, ACOES_PENDENCIA_,
    specDaPendencia_, linhaAlvoPendencia_, correcaoDaPendencia_, ABAS,
  });
  listaCentros_ = function () { return ['Loja 01']; };
  listaCategorias_ = function () { return ['Leve']; };
  listaPlacas_ = function () { return ['AAA1A11']; };
`, ctx, { filename: 'Codigo.gs' });

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}

/** Extrai o literal do PROBLEMA e a expressão do DETALHE de cada problemas.push. */
function pushesDoColetor() {
  const achados = [];
  let i = 0;
  while (true) {
    const p = fonte.indexOf('problemas.push([', i);
    if (p === -1) break;
    // fecha pelo balanceamento de colchetes, nao por regex: os detalhes contem
    // concatenacoes com parenteses e colchetes dentro.
    let k = p + 'problemas.push('.length, d = 0;
    const ini = k;
    while (k < fonte.length) {
      if (fonte[k] === '[') d++;
      else if (fonte[k] === ']') { d--; if (d === 0) break; }
      k++;
    }
    achados.push({ corpo: fonte.slice(ini + 1, k), pos: p });
    i = k;
  }
  return achados;
}

/** Divide o corpo do push nos 4 argumentos de topo. */
function argumentos(corpo) {
  const partes = [];
  let atual = '', d = 0, aspas = null;
  for (let i = 0; i < corpo.length; i++) {
    const c = corpo[i];
    if (aspas) {
      atual += c;
      if (c === '\\') { atual += corpo[++i] || ''; continue; }
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === "'" || c === '"') { aspas = c; atual += c; continue; }
    if ('([{'.indexOf(c) !== -1) d++;
    if (')]}'.indexOf(c) !== -1) d--;
    if (c === ',' && d === 0) { partes.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

const pushes = pushesDoColetor();
console.log('\n1. Leitura do código-fonte');
ok('achou os problemas.push do coletor', pushes.length >= 25, pushes.length + ' encontrados');

// Nomes de problema registrados como corrigíveis por campo.
const registrados = Object.keys(ctx.CORRECOES_PENDENCIA_);
const prefixos = ctx.CORRECOES_PENDENCIA_PREFIXO_.map(function (p) { return p.prefixo; });

console.log('\n2. Todo problema corrigível produz um alvo localizável');
const semAlvo = [];
const conferidos = [];
pushes.forEach(function (push) {
  const args = argumentos(push.corpo);
  if (args.length < 3) return;
  // 3o argumento = nome do problema; só interessa quando é literal puro
  const m = /^'((?:[^'\\]|\\.)*)'$/.exec(args[2]);
  if (!m) return;
  const problema = m[1].replace(/\\'/g, "'");
  const spec = ctx.CORRECOES_PENDENCIA_[problema];
  if (!spec) return;
  conferidos.push(problema);
  // Localização por placa não precisa de número de linha.
  if (spec.localizar === 'placa') return;
  const detalhe = args[3] || '';
  // O detalhe tem de COMEÇAR com o literal 'linha ' — é o contrato.
  if (!/^'linha\s*'/.test(detalhe.trim())) {
    semAlvo.push({ problema: problema, detalhe: detalhe.split('\n')[0].slice(0, 90) });
  }
});

ok('a regra realmente conferiu as correções registradas',
  conferidos.length >= 10, conferidos.length + ' problema(s) conferido(s)');
ok('nenhuma correção registrada fica sem alvo no detalhe',
  semAlvo.length === 0,
  semAlvo.map(function (x) {
    return x.problema + '\n          detalhe: ' + x.detalhe +
      '\n          -> o detalhe precisa começar com \'linha \', senão o campo não aparece na tela';
  }).join('\n        '));

console.log('\n3. O parser lê os formatos que existem');
ok('formato padrão "linha 96 • ..."', ctx.linhaAlvoPendencia_('linha 96 • 2026-10: 677096 < 678573') === 96);
ok('detalhe só com o número', ctx.linhaAlvoPendencia_('linha 35') === 35);
ok('rede de segurança para "(linha 96)" no fim',
  ctx.linhaAlvoPendencia_('2026-10 • 06/10/2026: 677096 < 678573 (linha 96)') === 96,
  'formato antigo da leitura retrocedida — não pode voltar a sumir da tela');
ok('detalhe sem linha nenhuma devolve 0', ctx.linhaAlvoPendencia_('99,5%') === 0);
ok('número solto NÃO é confundido com linha', ctx.linhaAlvoPendencia_('R$ 213,00/kg em Gás') === 0);

console.log('\n4. O caso que motivou esta regra');
const c = ctx.correcaoDaPendencia_(ctx.ABAS.ODOMETRO, 'Leitura de KM menor que a anterior',
  'linha 96 • 2026-10 • 06/10/2026: 677096 < 678573', 'RLI0I64');
ok('"Leitura de KM menor que a anterior" agora oferece campo', c !== null, JSON.stringify(c));
ok('e aponta para a linha 96', c && c.linha === 96, JSON.stringify(c && c.linha));
ok('no formato antigo também funciona, pela rede de segurança',
  ctx.correcaoDaPendencia_(ctx.ABAS.ODOMETRO, 'Leitura de KM menor que a anterior',
    '2026-10 • 06/10/2026: 677096 < 678573 (linha 96)', 'RLI0I64') !== null);

console.log('\n5. Nenhum problema fica sem campo E sem caminho');
const semNada = [];
pushes.forEach(function (push) {
  const args = argumentos(push.corpo);
  if (args.length < 3) return;
  const m = /^'((?:[^'\\]|\\.)*)'$/.exec(args[2]);
  if (!m) return;
  const problema = m[1].replace(/\\'/g, "'");
  if (ctx.CORRECOES_PENDENCIA_[problema]) return;
  if (ctx.ACOES_PENDENCIA_[problema]) return;
  if (prefixos.some(function (p) { return problema.indexOf(p) === 0; })) return;
  if (semNada.indexOf(problema) === -1) semNada.push(problema);
});
console.log('     sem campo e sem caminho: ' + (semNada.length ? semNada.join(' | ') : 'nenhum'));
ok('no máximo 2 tipos ficam sem campo e sem caminho',
  semNada.length <= 2,
  'cada um destes deixa o operador sem saída na tela:\n        ' + semNada.join('\n        '));

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
