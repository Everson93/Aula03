/**
 * Prova do modulo de depreciacao.
 *
 * A parte perigosa e a leitura do valor. "4.310" em pt-BR e quatro mil e
 * trezentos; "470.04" e quatrocentos e setenta. Confundir os dois multiplica
 * a depreciacao por mil e NAO da erro — grava o numero errado e segue.
 *
 * A segunda parte perigosa e a linha "Total Geral" no fim do arquivo do
 * contabil: importa-la criaria um bem fantasma com a soma de todos os outros.
 */
const fs = require('fs');
const vm = require('vm');

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: () => '2026-08' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    valorImportadoParaNumero_, linhaNaoEhBem_, analisarImportacaoDepreciacao_,
    valorDepreciacaoDoBem_, valoresDepreciacaoDaCompetencia_, chavePatrimonio_,
    conferirVinculoBemPlaca_, patrimonioFrouxo_,
    TIPOS_DESPESA, TIPOS_DESPESA_MANUAL, TIPOS_GERADOS_PELO_SISTEMA_,
    COL_VEIC, COL_DM, TOTAL_COL_VEIC, TOTAL_COL_DM,
    ORIGEM_DEP_CADASTRO_, ORIGEM_DEP_IMPORTADO_, ORIGEM_DEP_MANUAL_,
  });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  registrarLog_ = function () {};
  dadosVeiculosExecucao_ = function () { return __veic; };
  lerDepreciacaoMensal_ = function () { return __dep; };
  normalizarMesReferencia_ = function (m) { return String(m); };
`, ctx);

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}
const n_ = (x) => ctx.valorImportadoParaNumero_(x);

console.log('\n1. O valor, do jeito que chega de uma colagem');
ok('ponto como decimal, 2 casas (como vem do arquivo)', n_('4310.09') === 4310.09, String(n_('4310.09')));
ok('470.04 é quatrocentos e setenta, não quatrocentos e setenta mil',
  n_('470.04') === 470.04, String(n_('470.04')));
ok('PONTO COMO MILHAR: 4.310 é quatro mil e trezentos',
  n_('4.310') === 4310, String(n_('4.310')) + ' — errar aqui multiplica a depreciação por mil');
ok('vírgula como decimal', n_('4310,09') === 4310.09, String(n_('4310,09')));
ok('ponto milhar + vírgula decimal (colagem pt-BR típica)',
  n_('4.310,09') === 4310.09, String(n_('4.310,09')));
ok('dois pontos de milhar', n_('1.234.567,89') === 1234567.89, String(n_('1.234.567,89')));
ok('vírgula milhar + ponto decimal (colagem en-US)',
  n_('1,234,567.89') === 1234567.89, String(n_('1,234,567.89')));
ok('prefixo R$', n_('R$ 1.234,56') === 1234.56, String(n_('R$ 1.234,56')));
ok('espaços em volta', n_('  741,97  ') === 741.97, String(n_('  741,97  ')));
ok('inteiro simples', n_('500') === 500, String(n_('500')));
ok('ruído de ponto flutuante do arquivo arredonda a centavo',
  n_('470.0400000000001') === 470.04, String(n_('470.0400000000001')));
ok('3102.0099999999998 vira 3102,01', n_('3102.0099999999998') === 3102.01, String(n_('3102.0099999999998')));

console.log('\n2. O que NÃO é valor');
ok('vazio não é zero, é nada', n_('') === null && n_(null) === null && n_(undefined) === null);
ok('texto não vira número', n_('Total Geral') === null, String(n_('Total Geral')));
ok('número com letra é recusado', n_('12a3') === null, String(n_('12a3')));
ok('negativo com sinal', n_('-500,00') === -500, String(n_('-500,00')));
ok('negativo entre parênteses (contábil)', n_('(500,00)') === -500, String(n_('(500,00)')));
ok('vírgula de milhar sozinha é ambígua e recusada', n_('1,234,567') === null, String(n_('1,234,567')));

console.log('\n3. Linhas que não são bem');
ok('cabeçalho "Bem"', ctx.linhaNaoEhBem_('Bem') === true);
ok('cabeçalho "Patrimônio"', ctx.linhaNaoEhBem_('Patrimônio') === true);
ok('A LINHA "Total Geral" NÃO É UM BEM', ctx.linhaNaoEhBem_('Total Geral') === true,
  'importá-la criaria um bem fantasma com a soma de todos os outros');
ok('"TOTAL" sozinho também', ctx.linhaNaoEhBem_('TOTAL') === true);
ok('"total geral" minúsculo', ctx.linhaNaoEhBem_('total geral') === true);
ok('vazio não é bem', ctx.linhaNaoEhBem_('') === true && ctx.linhaNaoEhBem_(null) === true);
ok('um patrimônio É um bem', ctx.linhaNaoEhBem_('10042709') === false);
ok('patrimônio com letra também', ctx.linhaNaoEhBem_('MAQ-07') === false);

console.log('\n4. O arquivo de verdade, como ele é');
function veic(pat, placa, desc, centro, dep) {
  const l = new Array(ctx.TOTAL_COL_VEIC).fill('');
  l[ctx.COL_VEIC.CODIGO - 1] = pat;
  l[ctx.COL_VEIC.PLACA - 1] = placa;
  l[ctx.COL_VEIC.DESCRICAO - 1] = desc;
  l[ctx.COL_VEIC.CENTRO - 1] = centro;
  l[ctx.COL_VEIC.ATIVO - 1] = 'SIM';
  l[ctx.COL_VEIC.DEPRECIACAO - 1] = dep || 0;
  return l;
}
ctx.__veic = [
  veic('10000017', 'AAA 0001', 'Caminhão', 'LOJA 1', 999),
  veic('10001099', 'BBB 0002', 'Carro', 'LOJA 2', 999),
  veic('10041887', 'MAQ 0003', 'Empilhadeira', 'DEPÓSITO', 999),
];
ctx.__dep = [];
// Exatamente o formato do arquivo: duas linhas em branco, cabeçalho, dados, total.
const colado = [
  '', '',
  'Bem\t Valor',
  '10000017\t4310.09',
  '10001099\t208.34',
  '10041887\t3266.6400000000003',
  '99999999\t111.11',
  'Total Geral\t7896.05',
].join('\n');
const r = ctx.analisarImportacaoDepreciacao_(colado);
ok('leu os quatro bens', r.quantidade === 4, JSON.stringify(r.quantidade));
ok('o "Total Geral" NÃO virou um bem',
  !r.itens.some(function (i) { return i.valor > 7000; }), JSON.stringify(r.itens));
ok('as linhas em branco e o cabeçalho não viraram recusa',
  r.ignoradas.length === 0, JSON.stringify(r.ignoradas));
ok('o total bate com a soma dos bens',
  Math.abs(r.total - (4310.09 + 208.34 + 3266.64 + 111.11)) < 0.005, String(r.total));
ok('casou a placa de quem tem cadastro',
  r.itens[0].placa === 'AAA 0001' && r.itens[2].placa === 'MAQ 0003', JSON.stringify(r.itens[0]));
ok('o bem sem cadastro fica marcado', r.semCadastro.join() === '99999999', JSON.stringify(r.semCadastro));
ok('e não conta como pronto', r.prontos === 3, String(r.prontos));

console.log('\n5. Casos sujos de colagem');
ctx.__dep = [];
const sujo = [
  '10000017;4.310,09',               // separador ponto e vírgula, pt-BR
  '10001099\tR$ 208,34',
  '10041887\t',                       // sem valor
  '10000017\t100,00',                 // DUPLICADO
  'lixo qualquer\tabc',
  '10001099\t0',                      // zero
].join('\n');
const r2 = ctx.analisarImportacaoDepreciacao_(sujo);
ok('aceita ponto e vírgula como separador de coluna',
  r2.itens[0].valor === 4310.09 + 100, JSON.stringify(r2.itens[0]));
ok('o duplicado SOMA e é contado, não sobrescreve em silêncio',
  r2.duplicadas === 1 && r2.itens[0].vezes === 2, JSON.stringify(r2.itens[0]));
ok('linha sem valor entra em ignoradas com o motivo',
  r2.ignoradas.some(function (i) { return /não reconhecido|sem a coluna/.test(i.motivo); }),
  JSON.stringify(r2.ignoradas));
ok('valor zero é recusado, não gravado como zero',
  r2.ignoradas.some(function (i) { return /zero ou negativo/.test(i.motivo); }),
  JSON.stringify(r2.ignoradas));
ok('nenhuma linha some sem explicação',
  r2.quantidade + r2.ignoradas.length >= 4, JSON.stringify({q: r2.quantidade, ign: r2.ignoradas.length}));

console.log('\n6. Patrimônio repetido em dois veículos');
ctx.__veic = ctx.__veic.concat([veic('10000017', 'ZZZ 9999', 'Clone', 'LOJA 9', 1)]);
const r3 = ctx.analisarImportacaoDepreciacao_('10000017\t100,00');
ok('não escolhe um dos dois no escuro', r3.itens[0].placa === '', JSON.stringify(r3.itens[0]));
ok('avisa que é ambíguo', r3.ambiguos.join() === '10000017', JSON.stringify(r3.ambiguos));
ctx.__veic = ctx.__veic.slice(0, 3);

console.log('\n7. O arquivo manda; o cadastro é reserva');
ctx.__dep = [];
function dep(mes, bem, valor, origem) {
  const l = new Array(ctx.TOTAL_COL_DM).fill('');
  l[ctx.COL_DM.COMPETENCIA - 1] = mes;
  l[ctx.COL_DM.BEM - 1] = bem;
  l[ctx.COL_DM.VALOR - 1] = valor;
  l[ctx.COL_DM.ORIGEM - 1] = origem || 'IMPORTADO';
  return l;
}
ctx.__dep = [dep('2026-08', '10000017', 4310.09), dep('2026-07', '10000017', 4000)];
let vals = ctx.valoresDepreciacaoDaCompetencia_('2026-08');
let v = ctx.valorDepreciacaoDoBem_('10000017', 999, vals);
ok('usa o valor do arquivo da competência', v.valor === 4310.09, JSON.stringify(v));
ok('e diz que veio do arquivo', v.origem === ctx.ORIGEM_DEP_IMPORTADO_, v.origem);
v = ctx.valorDepreciacaoDoBem_('10001099', 777, vals);
ok('bem fora do arquivo cai na reserva do cadastro', v.valor === 777, JSON.stringify(v));
ok('E DIZ que usou a reserva', v.origem === ctx.ORIGEM_DEP_CADASTRO_,
  v.origem + ' — reserva silenciosa seria indistinguível de valor conferido');
ok('não vaza valor de outra competência',
  ctx.valorDepreciacaoDoBem_('10000017', 1, ctx.valoresDepreciacaoDaCompetencia_('2026-09')).valor === 1);
ok('a competência de julho continua com o dela',
  ctx.valorDepreciacaoDoBem_('10000017', 1, ctx.valoresDepreciacaoDaCompetencia_('2026-07')).valor === 4000);
ok('valor zero no arquivo cai na reserva, não deprecia zero',
  ctx.valorDepreciacaoDoBem_('X', 555, { '#X': { valor: 0, origem: 'IMPORTADO' } }).valor === 555);
// Quem protege contra chave de protótipo aqui NÃO é o prefixo '#' dos mapas —
// é `chavePatrimonio_`, que maiusculiza: '__PROTO__' não é propriedade de
// protótipo nenhum. O prefixo é reforço. Se um dia alguém fizer
// chavePatrimonio_ preservar a caixa, a proteção real some — por isso ela é
// que está sendo provada.
ok('chavePatrimonio_ maiusculiza, e é isso que fecha a porta do protótipo',
  ctx.chavePatrimonio_('__proto__') === '__PROTO__', ctx.chavePatrimonio_('__proto__'));
ok('um bem "__proto__" cai na reserva como qualquer outro desconhecido',
  ctx.valorDepreciacaoDoBem_('__proto__', 42, vals).valor === 42);
ok('e "constructor" também',
  ctx.valorDepreciacaoDoBem_('constructor', 42, vals).valor === 42);
// E o reforço continua lá: o fonte tem de montar as chaves com prefixo.
const fonteDep = fs.readFileSync('Codigo.gs', 'utf8');
ok('os mapas da depreciação montam a chave com prefixo',
  /const chave = '#' \+ bem;/.test(fonteDep) &&
  /m\['#' \+ bem\]/.test(fonteDep) &&
  /const chave = '#' \+ chavePatrimonio_\(patrimonio\);/.test(fonteDep),
  'reforço contra chave de protótipo, caso chavePatrimonio_ deixe de maiusculizar');

console.log('\n8. O índice da competência cai quando os dados mudam');
ctx.__dep = [dep('2026-08', '10000017', 100)];
ok('antes: 100', ctx.valoresDepreciacaoDaCompetencia_('2026-08')['#10000017'].valor === 100);
ctx.__dep = [dep('2026-08', '10000017', 200)];
ok('depois de corrigir, devolve o novo',
  ctx.valoresDepreciacaoDaCompetencia_('2026-08')['#10000017'].valor === 200,
  'índice velho respondendo');

console.log('\n9. Depreciação sai do formulário, mas continua válida no que já existe');
ok('TIPOS_DESPESA ainda tem Depreciação',
  ctx.TIPOS_DESPESA.indexOf('Depreciação') !== -1,
  'tirar daqui invalidaria todos os lançamentos de depreciação já gravados');
ok('o formulário NÃO oferece mais Depreciação',
  ctx.TIPOS_DESPESA_MANUAL.indexOf('Depreciação') === -1,
  ctx.TIPOS_DESPESA_MANUAL.join(', '));
ok('e não perdeu nenhum outro tipo pelo caminho',
  ctx.TIPOS_DESPESA_MANUAL.length === ctx.TIPOS_DESPESA.length - ctx.TIPOS_GERADOS_PELO_SISTEMA_.length,
  ctx.TIPOS_DESPESA_MANUAL.length + ' vs ' + ctx.TIPOS_DESPESA.length);
ok('todo tipo do formulário é um tipo válido',
  ctx.TIPOS_DESPESA_MANUAL.every(function (t) { return ctx.TIPOS_DESPESA.indexOf(t) !== -1; }));
ok('IPVA continua sendo digitável (quem lança informa o valor anual)',
  ctx.TIPOS_DESPESA_MANUAL.indexOf('IPVA') !== -1);

console.log('\n10. As duas pontas do contrato, lidas do código-fonte');
// Validação tem de usar a lista CHEIA; formulário, a lista MANUAL. Trocar uma
// pela outra não quebra nenhum teste de comportamento: ou passa a recusar
// lançamento antigo, ou volta a oferecer Depreciação. Só o fonte denuncia.
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
function linhaDe(re) { return (fonte.split('\n').filter(function (l) { return re.test(l); })); }
ok('a validação da aba usa a lista cheia',
  linhaDe(/requireValueInList\(TIPOS_DESPESA,/).length >= 2,
  'a validação da planilha precisa continuar aceitando Depreciação');
ok('validarLancamento usa a lista cheia',
  /TIPOS_DESPESA\.indexOf\(dados\.tipo\)/.test(fonte));
ok('o payload do formulário usa a lista manual',
  /tipos: TIPOS_DESPESA_MANUAL,/.test(fonte));
ok('a lista de opções da correção usa a manual',
  /if \(nome === 'tipos'\) return TIPOS_DESPESA_MANUAL\.slice\(\);/.test(fonte));

console.log('\n10b. O vínculo placa ↔ bem');
// A falha silenciosa: veículo ativo SEM patrimônio nunca casa com o arquivo,
// nunca dá erro, e deprecia pela reserva do cadastro para sempre. Só aparece
// quando alguém soma o Resumo à mão e compara com o contábil.
ctx.__dep = [];
ctx.__veic = [
  veic('10000017', 'AAA 0001', 'Caminhão', 'LOJA 1', 100),
  veic('',         'BBB 0002', 'Carro sem patrimônio', 'LOJA 2', 100),
  veic('10001099', 'CCC 0003', 'Van', 'LOJA 3', 100),
];
let vin = ctx.conferirVinculoBemPlaca_();
ok('conta os ativos', vin.ativos === 3, String(vin.ativos));
ok('ACHA o veículo ativo sem patrimônio',
  vin.semPatrimonio.length === 1 && (vin.semPatrimonio[0] || {}).placa === 'BBB 0002',
  JSON.stringify(vin.semPatrimonio));
ok('e diz quantos estão prontos', vin.comPatrimonio === 2, String(vin.comPatrimonio));
ok('não declara OK com um faltando', vin.ok === false);

// Veículo inativo sem patrimônio não é problema: ele não deprecia.
const inativo = veic('', 'DDD 0004', 'Vendido', 'LOJA 4', 0);
inativo[ctx.COL_VEIC.ATIVO - 1] = 'NAO';
ctx.__veic = ctx.__veic.concat([inativo]);
vin = ctx.conferirVinculoBemPlaca_();
ok('veículo INATIVO sem patrimônio não entra na lista',
  vin.semPatrimonio.length === 1, JSON.stringify(vin.semPatrimonio));

// Patrimônio duplicado.
ctx.__veic = [
  veic('10000017', 'AAA 0001', 'Um', 'LOJA 1', 100),
  veic('10000017', 'ZZZ 9999', 'Outro', 'LOJA 9', 100),
];
vin = ctx.conferirVinculoBemPlaca_();
ok('acha patrimônio em dois veículos',
  vin.duplicados.length === 1 && (vin.duplicados[0] || { placas: [] }).placas.length === 2,
  JSON.stringify(vin.duplicados));

// Zero à esquerda: o caso que engana o olho.
ctx.__veic = [
  veic('10000017',   'AAA 0001', 'Um', 'LOJA 1', 100),
  veic('0010000017', 'ZZZ 9999', 'Outro', 'LOJA 9', 100),
];
vin = ctx.conferirVinculoBemPlaca_();
ok('acha códigos que só diferem em zero à esquerda',
  vin.parecidos.length === 1 &&
  (vin.parecidos[0] || { formas: [] }).formas.length === 2,
  JSON.stringify(vin.parecidos));
ok('mas NÃO os trata como duplicados', vin.duplicados.length === 0,
  'são códigos diferentes para o sistema; juntá-los seria decidir no escuro');

// Cadastro limpo.
ctx.__veic = [
  veic('10000017', 'AAA 0001', 'Um', 'LOJA 1', 100),
  veic('10001099', 'BBB 0002', 'Dois', 'LOJA 2', 100),
];
vin = ctx.conferirVinculoBemPlaca_();
ok('cadastro limpo declara OK', vin.ok === true, JSON.stringify(vin));

console.log('\n10c. Quase-acerto: avisa, não casa');
ctx.__veic = [veic('0010000017', 'ZZZ 9999', 'Caminhão', 'LOJA 9', 100)];
const rq = ctx.analisarImportacaoDepreciacao_('10000017\t500,00');
ok('NÃO casa sozinho por zero à esquerda', (rq.itens[0] || {}).placa === '',
  'casar sozinho mandaria a depreciação para o veículo errado, em silêncio');
// Acesso defensivo: a mutação que apaga os quase-acertos tem de REPROVAR,
// não rebentar com TypeError. Crash não é reprovação, é ruído.
const q0 = rq.quaseAcertos[0] || {};
ok('mas avisa que quase casou', rq.quaseAcertos.length === 1 &&
  q0.noArquivo === '10000017' && q0.noCadastro === '0010000017',
  JSON.stringify(rq.quaseAcertos));
ok('e diz de que veículo se trata', q0.placa === 'ZZZ 9999', JSON.stringify(q0));
ok('o bem continua contado como sem cadastro', rq.semCadastro.join() === '10000017');

// Bem que não parece com nada não gera quase-acerto falso.
const rq2 = ctx.analisarImportacaoDepreciacao_('77777777\t500,00');
ok('bem sem nenhuma semelhança não inventa quase-acerto',
  rq2.quaseAcertos.length === 0, JSON.stringify(rq2.quaseAcertos));

// Quando casa exato, não há quase-acerto.
ctx.__veic = [veic('10000017', 'AAA 0001', 'Caminhão', 'LOJA 1', 100)];
const rq3 = ctx.analisarImportacaoDepreciacao_('10000017\t500,00');
ok('casamento exato não vira quase-acerto',
  rq3.quaseAcertos.length === 0 && (rq3.itens[0] || {}).placa === 'AAA 0001',
  JSON.stringify(rq3.itens[0]));

ok('patrimonioFrouxo_ tira zero à esquerda', ctx.patrimonioFrouxo_('0010000017') === '10000017');
ok('e pontuação', ctx.patrimonioFrouxo_('100.000-17') === '10000017');
ok('código só de zeros não vira vazio', ctx.patrimonioFrouxo_('000') === '000');

console.log('\n11. Aba nova registrada em TODAS as listas');
// Toda aba de dados tem de aparecer em sete lugares: criação, proteção, ordem,
// cor, invalidação no onEdit, validação de backup e zeramento. Esquecer um
// não quebra nada hoje — quebra meses depois, de um jeito difícil de ligar à
// causa. Foi assim que Orçamento e Comprovantes ficaram invisíveis no menu
// por duas versões (V4.11.1).
const ABAS_DE_DADOS = ['RATEIO_MENSAL', 'ORCAMENTO', 'COMPROVANTES', 'DEPRECIACAO_MENSAL'];
// Em vez de casar cada bloco por regex frágil, conta as ocorrências de cada
// aba no fonte: as já consolidadas dão a referência do que é "estar em todas".
const fonteA = fs.readFileSync('Codigo.gs', 'utf8');
function ocorrencias(nome) {
  return (fonteA.match(new RegExp('ABAS\\.' + nome + '\\b', 'g')) || []).length;
}
const refs = ABAS_DE_DADOS.map(function (n) { return { nome: n, n: ocorrencias(n) }; });
const minimoConsolidado = Math.min(
  ocorrencias('RATEIO_MENSAL'), ocorrencias('ORCAMENTO'), ocorrencias('COMPROVANTES'));
ok('a aba nova aparece tantas vezes quanto as já consolidadas',
  ocorrencias('DEPRECIACAO_MENSAL') >= minimoConsolidado - 2,
  JSON.stringify(refs) + ' — mínimo das consolidadas: ' + minimoConsolidado);

[['cabeçalho', /CABECALHOS\[ABAS\.DEPRECIACAO_MENSAL\]/],
 ['largura das colunas', /LARGURAS\[ABAS\.DEPRECIACAO_MENSAL\]/],
 ['linhas mínimas', /LINHAS_MINIMAS\[ABAS\.DEPRECIACAO_MENSAL\]/],
 ['cor', /cores\[ABAS\.DEPRECIACAO_MENSAL\]/],
 ['criação', /ABAS\.COMPROVANTES, ABAS\.DEPRECIACAO_MENSAL\]/],
 ['proteção', /ABAS\.DEPRECIACAO_MENSAL\]\.forEach\(function\(n\)\{ exigirFolha/],
 ['invalidação no onEdit', /ABAS\.DEPRECIACAO_MENSAL\]\.indexOf\(nomeAba\)/],
 ['validação de backup', /\[ABAS\.DEPRECIACAO_MENSAL, TOTAL_COL_DM\]/],
 ['zeramento do sistema', /limparLinhas\(ABAS\.DEPRECIACAO_MENSAL/],
].forEach(function (par) {
  ok('registrada em: ' + par[0], par[1].test(fonteA), 'falta registrar a aba aqui');
});

console.log('\n12. A tela chama o que o servidor oferece');
const app = fs.readFileSync('App.html', 'utf8');
['webDepreciacao', 'webDepreciacaoAnalisar', 'webDepreciacaoImportar',
 'webDepreciacaoSalvarBem', 'webDepreciacaoExcluirBem'].forEach(function (f) {
  ok(f + ' existe no servidor e é chamada na tela',
    new RegExp('function ' + f + '\\s*\\(').test(fonteA) && app.indexOf('.' + f + '(') !== -1,
    'uma ponta sem a outra é botão que não faz nada, ou função morta');
});
ok('a tela não grava sem o passo de conferência',
  app.indexOf('webDepreciacaoAnalisar') < app.indexOf('webDepreciacaoImportar'),
  'o botão de gravar só aparece depois da prévia com o total');

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
