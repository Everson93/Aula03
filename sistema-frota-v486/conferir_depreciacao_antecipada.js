/**
 * Prova da depreciação que não espera o último dia do período (V4.49).
 *
 * O portão era de CALENDÁRIO: antes do último dia do período a depreciação não
 * podia ser gerada nem lançada. Isso fazia sentido enquanto o valor vinha do
 * CADASTRO do veículo, que o usuário pode editar até o fim do mês — gerar no
 * dia 5 congelaria um número que ainda vai mudar.
 *
 * Mas quando o valor vem de um ARQUIVO importado ele já está definido. Esperar
 * o dia 30 para gravar o que se sabe no dia 5 não protege nada: só faz o custo
 * chegar atrasado ao Resumo, e foi a origem das sessenta linhas de "veículo sem
 * lançamento" que o usuário viu.
 *
 * O que se prova aqui tem três lados, e o defeito mora em qualquer um deles:
 *   1. o portão olha a competência CERTA (importar outubro não libera novembro);
 *   2. sem importação a regra ANTIGA continua valendo — tirar o portão inteiro
 *      encheria o painel de 166 pendências no dia 1 de cada mês;
 *   3. importar GRAVA o lançamento, e grava o valor antes de gerar.
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

let DEP = [];          // a aba Depreciação Mensal
let HOJE = '2026-11-05';
const diario = { ordem: [], log: [], gerados: 0 };
let gerarLanca = null; // quando preenchido, gerarDepreciacaoMensal_ lança

const ctx = {
  console: { log: () => {}, error: () => {} },
  Utilities: {
    getUuid: () => 'x',
    formatDate: function (d, _tz, padrao) {
      const p = n => ('0' + n).slice(-2);
      // hojeNoFuso_ é a função DE VERDADE: o que o duplê controla é o relógio,
      // não a conversão. Trocar hojeNoFuso_ por um duplê esconderia um erro de
      // fuso dentro dela.
      if (padrao === 'yyyy-MM-dd') return d === ctx.__agora ? HOJE
        : d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      if (padrao === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { depreciacaoLiberada_, competenciaTemValorImportado_,
    textoDepreciacaoAguardando_, webDepreciacaoImportar, hojeNoFuso_,
    dataUltimoDiaPeriodo_, COL_DM, TOTAL_COL_DM });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  autorizarContextoWeb_ = function () {};
  exigirCompetenciaAberta_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  ss_ = function () { return { getSpreadsheetTimeZone: function () { return 'America/Sao_Paulo'; } }; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-11' : ''; };
  lerDepreciacaoMensal_ = function () { return __dep(); };
  invalidarCacheInicio_ = function () {};
  registrarLog_ = function (a, b) { __diario.log.push(a + ' | ' + b); };
  webDepreciacao = function () { return { recarregado: true }; };
  analisarImportacaoDepreciacao_ = function () { return __analise(); };
  gravarDepreciacaoCompetencia_ = function (mes, itens) {
    __diario.ordem.push('gravar:' + mes + ':' + itens.length);
    return itens.length;
  };
  gerarDepreciacaoMensal_ = function () {
    __diario.ordem.push('gerar');
    if (__gerarLanca()) throw new Error(__gerarLanca());
    return { gerados: __diario.gerados, mensagem: __diario.gerados ? '' : 'Nenhuma depreciação pendente para gerar.' };
  };
  globalThis.__agora = null;
`, ctx);
ctx.__dep = function () { return DEP; };
ctx.__diario = diario;
ctx.__gerarLanca = function () { return gerarLanca; };
ctx.__analise = function () { return ANALISE; };

// Date criado AQUI não passa no `instanceof Date` de dentro do vm: realms
// diferentes. Sem a fábrica, a competência em formato de data cairia no ramo
// de texto e a prova não provaria nada.
const D = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d); })', ctx);
// hojeNoFuso_ chama `new Date()` lá dentro; marcamos qual objeto é "agora"
// instalando um Date fixo como o que o construtor devolve não é possível, então
// o duplê de formatDate reconhece pelo valor do ano corrente.
vm.runInContext('__agora = null; hojeNoFuso_original = hojeNoFuso_;', ctx);
vm.runInContext(`hojeNoFuso_ = function () {
  const p = String(__hojeTexto()).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0, 0);
};`, ctx);
ctx.__hojeTexto = function () { return HOJE; };

let ANALISE = null;
const PERIODO_NOV = { inicio: D(2026, 11, 1), fim: new Date(2026, 10, 30, 23, 59, 59, 999) };

function linhaDep(competencia, bem, valor) {
  const l = new Array(ctx.TOTAL_COL_DM).fill('');
  l[ctx.COL_DM.COMPETENCIA - 1] = competencia;
  l[ctx.COL_DM.BEM - 1] = bem;
  l[ctx.COL_DM.VALOR - 1] = valor;
  return l;
}

console.log('\n1. A competência tem valor próprio?');
(function () {
  DEP = [];
  ok('aba vazia: não tem', ctx.competenciaTemValorImportado_('2026-11') === false);
  DEP = [linhaDep('2026-11', 'PAT-1', 100)];
  ok('competência importada: tem', ctx.competenciaTemValorImportado_('2026-11') === true);
  ok('OUTRA competência não tem', ctx.competenciaTemValorImportado_('2026-10') === false,
    'olhar "a aba tem alguma linha" liberaria todo mês depois do primeiro import');
  DEP = [linhaDep('2026-10', 'PAT-1', 100), linhaDep('2026-12', 'PAT-2', 200)];
  ok('vizinhas dos dois lados não liberam novembro',
    ctx.competenciaTemValorImportado_('2026-11') === false, JSON.stringify(DEP.map(l => l[0])));
  // A célula de competência vira Date sozinha quando não está em formato texto:
  // é o defeito que já produziu a aba "Fechado Wed Jul 01 2026..." no Histórico.
  DEP = [linhaDep(D(2026, 11, 1), 'PAT-1', 100)];
  ok('competência que o Sheets converteu em data ainda casa',
    ctx.competenciaTemValorImportado_('2026-11') === true,
    'a aba guarda Date quando a coluna perde o formato texto');
  DEP = [linhaDep('2026-11', 'PAT-1', 100)];
  ok('mesRef vazio não libera', ctx.competenciaTemValorImportado_('') === false);
  ok('mesRef ilegível não libera e não explode',
    ctx.competenciaTemValorImportado_('novembro') === false);
  ok('mesRef ausente não libera', ctx.competenciaTemValorImportado_(undefined) === false,
    'undefined liberando seria o pior caso: todo chamador que esquecesse o argumento passaria');

  // Os chamadores passam param_('MES_REFERENCIA') — e essa célula, como a
  // V4.48.1 mostrou, nem sempre guarda o texto "2026-11": pode ter virado Date
  // ou número de série. O mesRef precisa ser NORMALIZADO antes de comparar, e
  // não só convertido para string.
  ok('mesRef em formato de data casa com a competência de texto',
    ctx.competenciaTemValorImportado_(D(2026, 11, 1)) === true,
    'String(Date) não se parece com "2026-11" de jeito nenhum');
  ok('mesRef com mês de um dígito casa',
    ctx.competenciaTemValorImportado_('2026-1') === false &&
    (DEP = [linhaDep('2026-01', 'PAT-1', 100)], ctx.competenciaTemValorImportado_('2026-1') === true),
    '"2026-1" e "2026-01" são a mesma competência');
  DEP = [linhaDep('2026-11', 'PAT-1', 100)];
})();

console.log('\n2. O portão');
(function () {
  HOJE = '2026-11-05';
  DEP = [linhaDep('2026-11', 'PAT-1', 100)];
  ok('IMPORTADO no dia 5: liberada', ctx.depreciacaoLiberada_(PERIODO_NOV, '2026-11') === true,
    'é o pedido do usuário: importou, entra');
  DEP = [];
  ok('sem importar, no dia 5: NÃO liberada',
    ctx.depreciacaoLiberada_(PERIODO_NOV, '2026-11') === false,
    'tirar o portão inteiro poria 166 pendências no painel no dia 1 de cada mês');
  HOJE = '2026-11-30';
  ok('sem importar, no último dia: liberada',
    ctx.depreciacaoLiberada_(PERIODO_NOV, '2026-11') === true);
  HOJE = '2026-12-03';
  ok('sem importar, depois do último dia: liberada',
    ctx.depreciacaoLiberada_(PERIODO_NOV, '2026-11') === true);
  HOJE = '2026-11-29';
  ok('um dia antes do último ainda não libera',
    ctx.depreciacaoLiberada_(PERIODO_NOV, '2026-11') === false,
    'a borda é o último dia, não a véspera');
  HOJE = '2026-11-05';
  DEP = [linhaDep('2026-10', 'PAT-1', 100)];
  ok('importar OUTUBRO não libera novembro',
    ctx.depreciacaoLiberada_(PERIODO_NOV, '2026-11') === false,
    'é o lado que um portão frouxo erraria em silêncio');
  DEP = [linhaDep('2026-11', 'PAT-1', 100)];
  ok('sem o mesRef, cai na regra do calendário',
    ctx.depreciacaoLiberada_(PERIODO_NOV) === false,
    'por isso existe a regra estática exigindo os dois argumentos');
})();

console.log('\n3. O texto diz o que fazer');
(function () {
  const t = ctx.textoDepreciacaoAguardando_(PERIODO_NOV, 'novembro de 2026');
  ok('cita a competência', t.indexOf('novembro de 2026') !== -1, t);
  ok('manda importar', /[Ii]mporte a planilha/.test(t), t);
  ok('e diz a data em que o cadastro passa a valer', t.indexOf('30/11/2026') !== -1, t);
})();

console.log('\n4. Importar grava o lançamento');
function importar(mes) {
  diario.ordem.length = 0; diario.log.length = 0;
  // Exceção que escapa tem de virar FALHA, não derrubar a suíte: um arquivo que
  // morre produz zero linhas de FALHA e passa por aprovação para quem conta
  // linhas em vez de ler o código de saída.
  try { return ctx.webDepreciacaoImportar('tk', 'colagem', mes); }
  catch (e) { return { ok: false, escapou: e.message, mensagem: '' }; }
}
(function () {
  ANALISE = { itens: [{ bem: 'PAT-1', placa: 'AAA 0001', valor: 100 },
                      { bem: 'PAT-2', placa: 'BBB 0002', valor: 200 }], semCadastro: [] };
  diario.gerados = 2; gerarLanca = null;

  let r = importar('2026-11');
  ok('grava o valor E gera o lançamento', r.ok === true && r.lancados === 2, JSON.stringify(r.mensagem));
  ok('nessa ordem: o valor primeiro', diario.ordem.join('>') === 'gravar:2026-11:2>gerar',
    diario.ordem.join('>') + ' — gerar antes de gravar não encontraria valor nenhum');
  ok('a mensagem diz quantos lançamentos saíram',
    /2 lançamento\(s\) de depreciação gerado\(s\)/.test(r.mensagem), r.mensagem);

  // Competência que não é a aberta: gerarDepreciacaoMensal_ trabalha sobre
  // MES_REFERENCIA, e gerar aqui lançaria no período errado, em silêncio.
  r = importar('2026-10');
  ok('competência fora da aberta: grava e NÃO gera',
    r.ok === true && r.lancados === 0 && diario.ordem.indexOf('gerar') === -1,
    diario.ordem.join('>'));
  ok('e a mensagem explica por que não lançou',
    /fora da aberta/.test(r.mensagem), r.mensagem);

  // O valor ESTÁ gravado; dizer que a importação falhou faria o usuário
  // importar de novo sem necessidade.
  gerarLanca = 'cota de tempo esgotada';
  r = importar('2026-11');
  ok('lançamento que falha não derruba a importação',
    r.ok === true && !r.escapou,
    r.escapou ? 'a exceção escapou de webDepreciacaoImportar: ' + r.escapou : JSON.stringify(r));
  ok('mas a mensagem avisa e manda usar o botão',
    /lançamento automático falhou/.test(r.mensagem) && /Gerar depreciação mensal/.test(r.mensagem),
    r.mensagem);
  ok('e a falha fica no Log', diario.log.some(l => /lançamento automático falhou/.test(l)),
    JSON.stringify(diario.log));
  gerarLanca = null;

  diario.gerados = 0;
  r = importar('2026-11');
  ok('sem nada pendente, não inventa contagem',
    r.lancados === 0 && !/lançamento\(s\) de depreciação gerado/.test(r.mensagem), r.mensagem);

  ANALISE = { itens: [], semCadastro: [{ bem: 'PAT-9' }] };
  r = importar('2026-11');
  ok('colagem que não casa com o cadastro não gera nada',
    r.ok === false && diario.ordem.length === 0, diario.ordem.join('>'));
})();

console.log('\n5. Regras estáticas');
(function () {
  const fonte = fs.readFileSync('Codigo.gs', 'utf8');
  // Ler até o parêntese que FECHA, contando os de dentro. Um `[^)]*` para no
  // primeiro `)` e corta `depreciacaoLiberada_(periodoAtual_(), param_(...))` no
  // meio, acusando de falta de argumento justamente a chamada mais completa.
  // Foi o que esta regra fez na primeira versão dela.
  function chamadasDe(nome, texto) {
    const saida = [];
    let i = texto.indexOf(nome + '(');
    while (i !== -1) {
      const definicao = /function\s*$/.test(texto.slice(Math.max(0, i - 12), i));
      let j = i + nome.length, nivel = 0;
      do {
        if (texto[j] === '(') nivel++;
        else if (texto[j] === ')') nivel--;
        j++;
      } while (nivel > 0 && j < texto.length);
      if (!definicao) saida.push(texto.slice(i, j));
      i = texto.indexOf(nome + '(', j);
    }
    return saida;
  }
  function argumentos(chamada) {
    const dentro = chamada.slice(chamada.indexOf('(') + 1, chamada.lastIndexOf(')'));
    let nivel = 0, n = dentro.trim() ? 1 : 0;
    for (const c of dentro) {
      if (c === '(') nivel++;
      else if (c === ')') nivel--;
      else if (c === ',' && nivel === 0) n++;
    }
    return n;
  }
  const chamadas = chamadasDe('depreciacaoLiberada_', fonte);
  const semMes = chamadas.filter(function (c) { return argumentos(c) < 2; });
  ok('todo chamador de depreciacaoLiberada_ passa a competência',
    chamadas.length >= 4 && semMes.length === 0,
    chamadas.length + ' chamada(s), sem competência: ' + JSON.stringify(semMes) +
    ' — sem o argumento a função cai na regra antiga sem erro nenhum');
  ok('e a leitura das chamadas conta parêntese aninhado',
    argumentos('f(a(), b(c, d))') === 2 && argumentos('f(a())') === 1 && argumentos('f()') === 0,
    'sem isso a regra acusa a chamada certa e absolve a errada');
  ok('a assinatura exige os dois',
    /function depreciacaoLiberada_\(periodo, mesRef\)/.test(fonte));
  ok('importar chama o gerador',
    /function webDepreciacaoImportar[\s\S]{0,3000}gerarDepreciacaoMensal_\(\)/.test(fonte));
  ok('e só na competência aberta',
    /alvo === normalizarMesReferencia_\(param_\('MES_REFERENCIA'\)\)[\s\S]{0,400}gerarDepreciacaoMensal_\(\)/
      .test(fonte),
    'sem a comparação, importar outubro lançaria dentro de novembro');
  ok('o gerador automático está dentro de try/catch',
    /try \{[\s\S]{0,300}gerarDepreciacaoMensal_\(\)[\s\S]{0,600}\} catch/.test(fonte),
    'o valor fica gravado mesmo quando o lançamento falha');
  ok('a mensagem de "aguardando" tem dono único',
    (fonte.match(/só pode ser inserida no último dia/g) || []).length === 0 &&
    (fonte.match(/function textoDepreciacaoAguardando_/g) || []).length === 1,
    'duas redações divergem na primeira vez que uma delas mudar');
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
