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

function linhaResumo(placa, km, litros, total) {
  const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
  l[ctx.R_.PLACA] = placa;
  l[ctx.R_.KM] = km;
  l[ctx.R_.LITROS] = litros;
  l[ctx.R_.TOTAL] = total;
  l[ctx.R_.KM_LITRO] = litros > 0 ? km / litros : 0;
  l[ctx.R_.RS_KM] = km > 0 ? total / km : 0;
  return l;
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
// frota homogenea: ninguem fora da curva, tanque cheio, nada pendente
ctx.__resumo = [
  linhaResumo('AAA1A11', 10000, 2000, 10000),
  linhaResumo('BBB2B22', 12000, 2400, 12000),
  linhaResumo('CCC3C33', 11000, 2200, 11000),
];
let r = ctx.enviarAlertasDiariosAgendado_();
ok('nada a relatar', ctx.montarAlertasDiarios_().total === 0,
  JSON.stringify(ctx.montarAlertasDiarios_().blocos));
ok('nenhum e-mail enviado', ENVIADOS.length === 0 && r.enviado === false, JSON.stringify(r));

// ---- 2. custo por km fora da curva ------------------------------------------
console.log('\n2. Custo por km acima de 2x a média da frota');
limpar();
// frota em ~R$1/km; o DDD gasta R$4/km
ctx.__resumo = [
  linhaResumo('AAA1A11', 10000, 2000, 10000),
  linhaResumo('BBB2B22', 10000, 2000, 10000),
  linhaResumo('DDD4D44', 1000, 200, 4000),
];
let achados = ctx.alertasConsumo_();
ok('o veículo caro aparece', achados.some(function (a) { return a.indexOf('DDD4D44') === 0; }),
  JSON.stringify(achados));
ok('os veículos normais não aparecem',
  !achados.some(function (a) { return a.indexOf('AAA') === 0 || a.indexOf('BBB') === 0; }),
  JSON.stringify(achados));
// Prova que o criterio e 2x, e nao "acima da media": um veiculo 50% acima da
// media e caro, mas a tela nao o marca — o e-mail tambem nao pode marcar.
limpar();
ctx.__resumo = [
  linhaResumo('AAA1A11', 10000, 2000, 10000),
  linhaResumo('BBB2B22', 10000, 2000, 10000),
  linhaResumo('EEE5E55', 10000, 2000, 15000),   // 1,5x a media
];
ok('1,5x a média NÃO dispara (mesmo critério do Resumo: 2x)',
  !ctx.alertasConsumo_().some(function (a) { return a.indexOf('EEE5E55') === 0 && a.indexOf('custo por km') !== -1; }),
  JSON.stringify(ctx.alertasConsumo_()));

// ---- 3. consumo (km/l) abaixo da metade -------------------------------------
console.log('\n3. Consumo abaixo da metade da média');
limpar();
ctx.__resumo = [
  linhaResumo('AAA1A11', 10000, 2000, 10000),   // 5 km/l
  linhaResumo('BBB2B22', 10000, 2000, 10000),   // 5 km/l
  linhaResumo('FFF6F66', 1000, 1000, 1000),     // 1 km/l
];
ok('o veículo beberrão aparece',
  ctx.alertasConsumo_().some(function (a) { return a.indexOf('FFF6F66') === 0 && a.indexOf('km/l') !== -1; }),
  JSON.stringify(ctx.alertasConsumo_()));

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
const originalConsumo = ctx.alertasConsumo_;
vm.runInContext('alertasConsumo_ = function () { throw new Error("falha proposital"); };', ctx);
const comErro = ctx.montarAlertasDiarios_();
ok('o bloco quebrado vira aviso em vez de matar o alerta',
  comErro.blocos.some(function (b) { return b.itens.some(function (i) { return i.indexOf('Não foi possível') === 0; }); }),
  JSON.stringify(comErro.blocos));
ok('os outros blocos continuam chegando',
  comErro.blocos.some(function (b) { return b.itens.some(function (i) { return i.indexOf('4 pendência') === 0; }); }),
  JSON.stringify(comErro.blocos));

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
