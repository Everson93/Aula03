/**
 * Prova do alerta diario.
 *
 * A regra que mais importa aqui nao e "detectou o problema" — e "FICOU CALADO
 * quando nao havia problema". Um e-mail diario de "tudo certo" vira filtro no
 * Outlook em duas semanas, e junto com ele some o dia em que havia algo. Por
 * isso o cenario limpo tem teste proprio.
 *
 * A segunda regra: o criterio de custo por km tem de ser o MESMO da formatacao
 * condicional do Resumo (acima de 2x a media da frota). Dois criterios parecidos
 * mas diferentes seriam pior que nenhum — a tela diria uma coisa e o e-mail outra.
 */
const fs = require('fs');
const vm = require('vm');

const ENVIADOS = [];
const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'f1e2d3c4-0000', formatDate: (d) => d.toISOString().slice(0, 10) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  MailApp: {
    getRemainingDailyQuota: () => 100,
    sendEmail: (m) => { ENVIADOS.push(m); },
  },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    alertasConsumo_, alertasTanqueEPendencias_, alertasOdometroEIpva_,
    montarAlertasDiarios_, destinatariosAlerta_, enviarAlertasDiariosAgendado_,
    corpoAlertaHtml_, R_, TOTAL_COL_RESUMO, COL_VEIC, PRODUTOS_BOMBA,
    custoVariavelResumo_, R_CUSTO_VARIAVEL_, MINIMO_VEICULOS_REFERENCIA_, mediana_,
    numBR_, alertasConsumo_,
    MAXIMO_ITENS_POR_BLOCO_,
  });
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  registrarLog_ = function () {};
  lerResumo_ = function () { return __resumo; };
  estadoTanque_ = function (produto) { return __tanques[produto] || { litros: 9999, valor: 0, custoMedio: 0, litrosSemLastro: 0 }; };
  contarPendenciasConferencia_ = function () { return __pendencias; };
  lerOdometro_ = function () { return __odometro; };
  dadosVeiculosExecucao_ = function () { return __veiculos; };
  gruposIpvaDaPlaca_ = function (p) { return __ipva[p] || {}; };
  periodoAtual_ = function () { return { inicio: new Date(2026, 6, 1), fim: new Date(2026, 6, 31) }; };
  periodoDoMes_ = function () { return { inicio: new Date(2026, 6, 1), fim: new Date(2026, 6, 31) }; };
  formatarData_ = function (d) { return d.toISOString().slice(0, 10); };
  normalizaPlaca_ = function (p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
`, ctx, { filename: 'Codigo.gs' });

// Um Date construido AQUI nao passa no `instanceof Date` de dentro do vm: sao
// realms diferentes, com construtores diferentes. Sem esta fabrica os testes de
// odometro passavam com lista vazia — aprovando o codigo sem exercitar nada.
const novaData = vm.runInContext('(function (a, m, d) { return new Date(a, m, d); })', ctx);

/**
 * `custo` entra como COMBUSTIVEL (custo variável). A regra não olha mais
 * R_.TOTAL: depreciação, IPVA, seguro e multa correm com o veículo parado.
 */
function linhaResumo(placa, km, litros, custo, categoria, fixo) {
  const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
  l[ctx.R_.PLACA] = placa;
  l[ctx.R_.CATEGORIA] = categoria || 'Carro';
  l[ctx.R_.KM] = km;
  l[ctx.R_.LITROS] = litros;
  l[ctx.R_.COMBUSTIVEL] = custo;
  l[ctx.R_.DEPRECIACAO] = fixo || 0;
  l[ctx.R_.TOTAL] = custo + (fixo || 0);
  l[ctx.R_.KM_LITRO] = litros > 0 ? km / litros : 0;
  l[ctx.R_.RS_KM] = km > 0 ? (custo + (fixo || 0)) / km : 0;
  return l;
}
/** Quatro veículos iguais de uma categoria, para ela servir de referência. */
function grupo(prefixo, categoria, km, litros, custo) {
  const saida = [];
  for (let i = 1; i <= 4; i++) saida.push(linhaResumo(prefixo + i, km, litros, custo, categoria));
  return saida;
}

function limpar() {
  ENVIADOS.length = 0;
  ctx.__resumo = [];
  ctx.__tanques = {};
  ctx.__pendencias = 0;
  ctx.__odometro = [];
  ctx.__veiculos = [];
  ctx.__ipva = {};
  ctx.__emails = 'gestor@giassi.com.br';
}
ctx.param_ = function (n) {
  if (n === 'EMAIL_ALERTAS') return ctx.__emails;
  if (n === 'MES_REFERENCIA') return '2026-07';
  if (n === 'ESTOQUE_MINIMO_L') return 500;
  if (n === 'EMPRESA') return 'GIASSI';
  if (n === 'DIA_FIM_PERIODO') return 25;
  return '';
};

let falhas = 0, provas = 0;
function ok(titulo, condicao, detalhe) {
  provas++;
  if (condicao) { console.log('  ok   ' + titulo); return; }
  falhas++;
  console.log('  FALHA ' + titulo + (detalhe ? '\n        ' + detalhe : ''));
}

// ---- 1. silêncio quando está tudo certo -------------------------------------
console.log('\n1. Frota saudável: o sistema fica calado');
limpar();
ctx.__resumo = grupo('CAR', 'Carro', 10000, 1000, 6000);
let r = ctx.enviarAlertasDiariosAgendado_();
ok('nada a relatar', ctx.montarAlertasDiarios_().total === 0,
  JSON.stringify(ctx.montarAlertasDiarios_().blocos));
ok('nenhum e-mail enviado', ENVIADOS.length === 0 && r.enviado === false, JSON.stringify(r));

// ---- 2. O CASO REAL: frota mista ---------------------------------------------
// Era isto que gerava 74 avisos: carros a ~10 km/l puxavam a media, e TODA
// carreta — que faz 2,5 km/l normalmente — caía abaixo da metade dela.
console.log('\n2. Frota mista: carreta não é carro fora da curva');
limpar();
ctx.__resumo = grupo('CAR', 'Carro', 10000, 1000, 6000)            // 10 km/l
  .concat(grupo('CRT', 'Carreta Normal', 10000, 4000, 24000));     // 2,5 km/l, normal
let achados = ctx.alertasConsumo_();
ok('nenhuma carreta é acusada por ser carreta', achados.length === 0,
  JSON.stringify(achados));

console.log('\n3. Mas o desvio DENTRO da categoria continua sendo pego');
limpar();
ctx.__resumo = grupo('CAR', 'Carro', 10000, 1000, 6000)
  .concat(grupo('CRT', 'Carreta Normal', 10000, 4000, 24000));
// uma carreta bebendo o dobro das outras carretas
ctx.__resumo.push(linhaResumo('CRT9', 10000, 9000, 54000, 'Carreta Normal'));
achados = ctx.alertasConsumo_();
ok('a carreta ruim aparece', achados.some(function (a) { return a.indexOf('CRT9') === 0; }),
  JSON.stringify(achados));
ok('e nomeia a categoria usada como referência',
  achados.some(function (a) { return a.indexOf('Carreta Normal') !== -1; }), JSON.stringify(achados));
ok('as carretas normais continuam de fora',
  !achados.some(function (a) { return /^CRT[1-4] /.test(a); }), JSON.stringify(achados));
ok('e nenhum carro foi arrastado junto',
  !achados.some(function (a) { return a.indexOf('CAR') === 0; }), JSON.stringify(achados));

console.log('\n3b. Um achado por veículo, não dois');
ok('o veículo que desvia nos DOIS critérios gera UMA linha',
  achados.filter(function (a) { return a.indexOf('CRT9') === 0; }).length === 1,
  JSON.stringify(achados.filter(function (a) { return a.indexOf('CRT9') === 0; })));
ok('e a linha menciona os dois desvios',
  achados.filter(function (a) { return a.indexOf('CRT9') === 0; })[0].indexOf(';') !== -1,
  achados.filter(function (a) { return a.indexOf('CRT9') === 0; })[0]);

console.log('\n3c. Custo fixo não entra no R$/km');
limpar();
ctx.__resumo = grupo('CAR', 'Carro', 10000, 1000, 6000);
// mesmo consumo dos outros, mas carregando IPVA e depreciação pesados
ctx.__resumo.push(linhaResumo('CAR9', 10000, 1000, 6000, 'Carro', 90000));
ok('veículo com depreciação alta e consumo normal NÃO é acusado',
  !ctx.alertasConsumo_().some(function (a) { return a.indexOf('CAR9') === 0; }),
  JSON.stringify(ctx.alertasConsumo_()));
ok('custoVariavelResumo_ ignora mesmo o fixo',
  ctx.custoVariavelResumo_(ctx.__resumo[4]) === 6000,
  String(ctx.custoVariavelResumo_(ctx.__resumo[4])));

console.log('\n3d. Rodagem baixa não vira outlier');
limpar();
ctx.__resumo = grupo('CAR', 'Carro', 10000, 1000, 6000);
// rodou 100 km e teve uma oficina de 3.000: R$ 30/km, mas sem significado
const parado = linhaResumo('CAR8', 100, 10, 60, 'Carro');
parado[ctx.R_.OFICINA] = 3000;
ctx.__resumo.push(parado);
achados = ctx.alertasConsumo_();
ok('o veículo que mal rodou não é acusado',
  !achados.some(function (a) { return a.indexOf('CAR8') === 0; }), JSON.stringify(achados));
ok('mas o alerta DIZ que ele ficou de fora, em vez de omitir',
  achados.some(function (a) { return a.indexOf('rodagem baixa') !== -1; }), JSON.stringify(achados));

console.log('\n3e. Categoria pequena demais não serve de referência');
limpar();
ctx.__resumo = grupo('CAR', 'Carro', 10000, 1000, 6000)
  .concat([linhaResumo('MOT1', 5000, 100, 600, 'Moto'),
           linhaResumo('MOT2', 5000, 500, 3000, 'Moto')]);   // só 2 motos
achados = ctx.alertasConsumo_();
ok('não acusa nada numa categoria com menos de ' + ctx.MINIMO_VEICULOS_REFERENCIA_,
  !achados.some(function (a) { return a.indexOf('MOT') === 0; }), JSON.stringify(achados));
ok('e avisa quantos ficaram sem referência',
  achados.some(function (a) { return a.indexOf('menos de') !== -1; }), JSON.stringify(achados));

// ---- 4. tanque e pendências --------------------------------------------------
console.log('\n4. Tanque e pendências');
limpar();
ctx.__tanques = {
  'DIESEL S10': { litros: 120, valor: 600, custoMedio: 5, litrosSemLastro: 0 },
  'ARLA 32': { litros: 800, valor: 0, custoMedio: 0, litrosSemLastro: 40 },
};
ctx.__pendencias = 3;
achados = ctx.alertasTanqueEPendencias_();
ok('saldo abaixo do mínimo entra', achados.some(function (a) { return a.indexOf('DIESEL') === 0 && a.indexOf('mínimo') !== -1; }), JSON.stringify(achados));
ok('ARLA com saldo bom não vira alerta de saldo',
  !achados.some(function (a) { return a.indexOf('ARLA') === 0 && a.indexOf('mínimo') !== -1; }), JSON.stringify(achados));
ok('saída sem lastro entra', achados.some(function (a) { return a.indexOf('sem carga') !== -1; }), JSON.stringify(achados));
ok('pendências de conferência entram', achados.some(function (a) { return a.indexOf('3 pendência') === 0; }), JSON.stringify(achados));

// ---- 5. odômetro retrocedido -------------------------------------------------
console.log('\n5. Odômetro retrocedido');
limpar();
ctx.__odometro = [
  [novaData(2026, 6, 5), 'AAA1A11', 10000],
  [novaData(2026, 6, 10), 'AAA1A11', 9500],     // retrocedeu
  [novaData(2026, 6, 15), 'AAA1A11', 10500],
  [novaData(2026, 6, 7), 'BBB2B22', 2000],
  [novaData(2026, 6, 12), 'BBB2B22', 2300],     // normal
];
achados = ctx.alertasOdometroEIpva_();
ok('a leitura que retrocedeu aparece',
  achados.some(function (a) { return a.indexOf('AAA1A11') === 0 && a.indexOf('menor') !== -1; }),
  JSON.stringify(achados));
ok('a placa que só subiu não aparece',
  !achados.some(function (a) { return a.indexOf('BBB2B22') === 0; }), JSON.stringify(achados));
// Leitura fora do periodo aberto nao e assunto do alerta de hoje.
limpar();
ctx.__odometro = [
  [novaData(2026, 3, 5), 'AAA1A11', 10000],
  [novaData(2026, 3, 10), 'AAA1A11', 9500],
];
ok('retrocesso fora do período aberto não entra', ctx.alertasOdometroEIpva_().length === 0,
  JSON.stringify(ctx.alertasOdometroEIpva_()));

// ---- 6. IPVA cadastrado sem parcela lançada ---------------------------------
console.log('\n6. IPVA no cadastro sem parcela lançada');
limpar();
function veic(placa, ipva, ativo) {
  const v = new Array(20).fill('');
  v[ctx.COL_VEIC.PLACA - 1] = placa;
  v[ctx.COL_VEIC.IPVA - 1] = ipva;
  v[ctx.COL_VEIC.ATIVO - 1] = ativo;
  return v;
}
ctx.__veiculos = [
  veic('AAA1A11', 2400, 'SIM'),   // esqueceram de lancar
  veic('BBB2B22', 1800, 'SIM'),   // lancado
  veic('CCC3C33', 3000, 'NAO'),   // inativo: nao cobra
  veic('DDD4D44', 0, 'SIM'),      // sem IPVA
];
ctx.__ipva = { BBB2B22: { 'IPVA-2026': { parcelas: 12, total: 1800 } } };
achados = ctx.alertasOdometroEIpva_();
ok('veículo com IPVA no cadastro e sem parcela aparece',
  achados.some(function (a) { return a.indexOf('AAA1A11') === 0; }), JSON.stringify(achados));
ok('veículo já lançado não aparece',
  !achados.some(function (a) { return a.indexOf('BBB2B22') === 0; }), JSON.stringify(achados));
ok('veículo inativo não aparece',
  !achados.some(function (a) { return a.indexOf('CCC3C33') === 0; }), JSON.stringify(achados));
ok('veículo sem IPVA não aparece',
  !achados.some(function (a) { return a.indexOf('DDD4D44') === 0; }), JSON.stringify(achados));

// ---- 7. envio ----------------------------------------------------------------
console.log('\n7. Envio');
limpar();
ctx.__pendencias = 2;
r = ctx.enviarAlertasDiariosAgendado_();
ok('com achado, envia', r.enviado === true && ENVIADOS.length === 1, JSON.stringify(r));
// A contagem e de PONTOS DE ATENCAO, nao de pendencias: "2 pendências em aberto"
// e uma linha so. Confundir os dois faria o assunto mentir.
ok('o assunto traz a contagem de pontos', ENVIADOS[0] && /1 ponto/.test(ENVIADOS[0].subject),
  ENVIADOS[0] && ENVIADOS[0].subject);

limpar();
ctx.__emails = '';
ctx.__pendencias = 5;
r = ctx.enviarAlertasDiariosAgendado_();
ok('EMAIL_ALERTAS vazio desliga o envio', r.enviado === false && ENVIADOS.length === 0,
  JSON.stringify(r));

limpar();
ctx.__emails = 'nao-e-email, outro@giassi.com.br , outro@giassi.com.br';
ok('endereço inválido é descartado e duplicata some',
  JSON.stringify(ctx.destinatariosAlerta_()) === JSON.stringify(['outro@giassi.com.br']),
  JSON.stringify(ctx.destinatariosAlerta_()));

// Um bloco que explode nao pode levar os outros junto.
console.log('\n8. Um bloco com erro não derruba os outros');
limpar();
ctx.__pendencias = 4;
vm.runInContext('__consumoBom = alertasConsumo_; ' +
  'alertasConsumo_ = function () { throw new Error("falha proposital"); };', ctx);
const comErro = ctx.montarAlertasDiarios_();
ok('o bloco quebrado vira aviso em vez de matar o alerta',
  comErro.blocos.some(function (b) { return b.itens.some(function (i) { return i.indexOf('Não foi possível') === 0; }); }),
  JSON.stringify(comErro.blocos));
ok('os outros blocos continuam chegando',
  comErro.blocos.some(function (b) { return b.itens.some(function (i) { return i.indexOf('4 pendência') === 0; }); }),
  JSON.stringify(comErro.blocos));
// Restaura: sem isto o stub que lança vaza para os blocos seguintes, e a falha
// aparece longe de onde foi plantada.
vm.runInContext('alertasConsumo_ = __consumoBom;', ctx);

console.log('\n8b. Por que mediana e não média');
// O defeito que a propria fixture revelou: com 4 carretas normais + 1 bebendo o
// dobro, a MEDIA sobe o bastante para a culpada passar. A mediana nao se move.
const custos = [2.4, 2.4, 2.4, 2.4, 5.4];
const media = custos.reduce(function (a, b) { return a + b; }, 0) / custos.length;
ok('a média seria arrastada pelo próprio outlier (5,4 não passa de 2x ' + media.toFixed(2) + ')',
  !(5.4 > 2 * media), 'média ' + media.toFixed(3));
ok('a mediana não se move e o outlier é pego',
  5.4 > 2 * ctx.mediana_(custos), 'mediana ' + ctx.mediana_(custos));
ok('mediana de lista par é a média dos dois do meio', ctx.mediana_([1, 2, 3, 4]) === 2.5);
ok('mediana de lista vazia é 0, sem NaN', ctx.mediana_([]) === 0);
ok('mediana não depende da ordem de entrada',
  ctx.mediana_([5.4, 2.4, 2.4, 2.4, 2.4]) === ctx.mediana_(custos));

console.log('\n9. O e-mail não deixa um bloco engolir os outros');
limpar();
const muitos = { blocos: [{ titulo: 'Consumo fora da curva',
  itens: Array.apply(null, Array(74)).map(function (_, i) { return 'VEI' + i + ' — algo'; }) },
  { titulo: 'Tanque e pendências', itens: ['saldo baixo'] }], total: 75 };
const html = ctx.corpoAlertaHtml_(muitos, '2026-10');
ok('mostra no máximo ' + ctx.MAXIMO_ITENS_POR_BLOCO_ + ' itens do bloco grande',
  (html.match(/<li>VEI/g) || []).length === ctx.MAXIMO_ITENS_POR_BLOCO_,
  (html.match(/<li>VEI/g) || []).length + ' itens');
ok('diz quantos ficaram de fora', /e mais 62/.test(html));
ok('mas a contagem no título continua a real', /\(74\)/.test(html));
ok('e o bloco seguinte continua chegando', /saldo baixo/.test(html),
  'de nada adianta cortar se o bloco pequeno sumir junto');

console.log('\n10. Número em formato brasileiro');
// "R$ 4.604/km" — saída do toFixed — se lê como quatro mil reais por km em
// pt-BR, porque ponto é separador de MILHAR. Num relatório de custo isso não
// parece erro de formatação: parece catástrofe.
limpar();
ctx.__resumo = [
  linhaResumo('CAR1', 10000, 1000, 6000),
  linhaResumo('CAR2', 10000, 1000, 6000),
  linhaResumo('CAR3', 10000, 1000, 6000),
  linhaResumo('CAR4', 10000, 1000, 6000),
  linhaResumo('CAR9', 10000, 1000, 46040),   // custo variável R$ 4,604/km
];
const txt = ctx.alertasConsumo_().filter(function (a) { return a.indexOf('CAR9') === 0; })[0];
ok('usa vírgula decimal', /R\$ 4,604\/km/.test(txt || ''), txt);
ok('e NÃO ponto, que leria como milhar', !/R\$ 4\.604\/km/.test(txt || ''), txt);
ok('numBR_ formata com vírgula', ctx.numBR_(4.604, 3) === '4,604', ctx.numBR_(4.604, 3));
ok('e com ponto no milhar, que é o certo em pt-BR',
  ctx.numBR_(1278.5, 2) === '1.278,50', ctx.numBR_(1278.5, 2));
ok('zero e nulo não viram NaN', ctx.numBR_(0, 2) === '0,00' && ctx.numBR_(null, 2) === '0,00');

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
