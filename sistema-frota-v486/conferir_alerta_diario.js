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
    numBR_, alertasConsumo_, rubricaDominante_, ROTULO_CUSTO_VARIAVEL_,
    alertasManutencao_, custoRodagemResumo_, custoManutencaoResumo_,
    referenciaPorCategoria_, referenciaDaLinha_, preencherReferenciaRodagem_,
    TOTAL_COL_RESUMO, letraColuna_,
    R_CUSTO_RODAGEM_, R_CUSTO_MANUTENCAO_, paramOuPadrao_,
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

console.log('\n11. Manutenção é evento, não rotina');
// Caso real: SXC 9I77, uma Saveiro com 456 km no mês e R$ 2.130 de oficina —
// preventiva, confirmada pelo usuário. O km/l estava normal (5,23) e ela
// aparecia no bloco "consumo fora da curva" a R$ 6,103/km.
//
// A aritmética estava certa e o aviso estava errado: julgava um gasto POR
// EVENTO com a régua de um gasto POR MÊS. Vinte mil km de preventiva pagos
// num mês só não são o custo daquele mês.
limpar();
function comOficina(placa, km, litros, combustivel, oficina, lavacao) {
  const l = linhaResumo(placa, km, litros, combustivel);
  l[ctx.R_.OFICINA] = oficina;
  l[ctx.R_.LAVACAO] = lavacao || 0;
  l[ctx.R_.TOTAL] = combustivel + oficina + (lavacao || 0);
  l[ctx.R_.RS_KM] = km > 0 ? l[ctx.R_.TOTAL] / km : 0;
  return l;
}
ctx.__resumo = [
  comOficina('REF1', 2000, 250, 3500, 800),
  comOficina('REF2', 2000, 250, 3600, 700),
  comOficina('REF3', 2000, 250, 3400, 900),
  comOficina('REF4', 2000, 250, 3500, 800),
  comOficina('SXC9I77', 456, 87.14, 542.71, 2130, 110.14),
];
const consumo = ctx.alertasConsumo_().join(' | ');
ok('a preventiva NÃO é mais chamada de consumo fora da curva',
  consumo.indexOf('SXC9I77') === -1,
  'era este o falso alarme: ' + consumo);
ok('e o bloco de consumo fica vazio, porque não havia nada de errado no consumo',
  !/SXC|REF/.test(consumo), consumo);

const manut = ctx.alertasManutencao_();
const linhaSxc = manut.filter(function (x) { return x.indexOf('SXC9I77') === 0; })[0] || '';
ok('mas o gasto continua sendo mostrado', linhaSxc !== '',
  'tirar do bloco errado não pode virar esconder');
ok('com o valor cheio', /R\$ 2\.130,00/.test(linhaSxc), linhaSxc);
ok('e a rodagem em que ele se dilui', /456 km/.test(linhaSxc), linhaSxc);
ok('dizendo que o corte é por valor, não por desvio',
  manut.some(function (x) { return /corte por valor/.test(x); }), manut.join(' | '));
ok('quem gastou pouco em oficina não entra', !/REF[1-4]/.test(manut.join(' | ')), manut.join(' | '));

// Ordem importa: quem gastou mais aparece primeiro.
limpar();
ctx.__resumo = [
  comOficina('PEQ', 2000, 250, 3000, 1600),
  comOficina('GRA', 2000, 250, 3000, 9000),
];
const ordenado = ctx.alertasManutencao_();
// Sem esta guarda, uma mutação que esvazia a lista rebenta o teste com
// TypeError em vez de reprovar — e crash não é reprovação, é ruído.
ok('os dois entram na lista', ordenado.length >= 2, JSON.stringify(ordenado));
ok('o maior gasto vem primeiro', (ordenado[0] || '').indexOf('GRA') === 0, ordenado[0]);
ok('e o menor depois', (ordenado[1] || '').indexOf('PEQ') === 0, ordenado[1]);

// Um veículo parado que teve oficina: dividir por zero km não pode virar Infinity.
limpar();
const parado2 = comOficina('PARADO', 0, 0, 0, 5000);
ctx.__resumo = [parado2];
const semKm = ctx.alertasManutencao_()[0] || '';
ok('veículo sem rodagem não vira Infinity por km',
  /sem rodagem no mês/.test(semKm) && !/Infinity|NaN/.test(semKm), semKm);

// Consumo de verdade continua sendo pego.
limpar();
ctx.__resumo = [
  linhaResumo('REF1', 4000, 500, 4000),
  linhaResumo('REF2', 4000, 500, 4000),
  linhaResumo('REF3', 4000, 500, 4000),
  linhaResumo('REF4', 4000, 500, 4000),
  linhaResumo('BEBE', 4000, 2000, 16000),
];
const bebe = ctx.alertasConsumo_().filter(function (a) { return a.indexOf('BEBE') === 0; })[0] || '';
ok('quem realmente gasta demais na rodagem continua sendo pego', bebe !== '', 'o remédio não pode matar o alerta');
ok('e o texto agora diz "rodagem", não "variável"', /custo de rodagem/.test(bebe), bebe);
ok('com a composição', /100% é combustível/.test(bebe), bebe);

// As duas listas de colunas têm de particionar a antiga, sem sobra nem sobreposição.
ok('rodagem + manutenção = todo o custo variável, sem perder coluna',
  ctx.R_CUSTO_RODAGEM_.concat(ctx.R_CUSTO_MANUTENCAO_).sort().join(',') ===
  ctx.R_CUSTO_VARIAVEL_.slice().sort().join(','),
  'uma coluna fora das duas listas sumiria de todos os alertas');
ok('e nenhuma coluna está nas duas',
  !ctx.R_CUSTO_RODAGEM_.some(function (n) { return ctx.R_CUSTO_MANUTENCAO_.indexOf(n) !== -1; }));
const somaL = comOficina('X', 1000, 100, 700, 300, 50);
ok('as duas somas reconstroem o custo variável',
  Math.abs(ctx.custoRodagemResumo_(somaL) + ctx.custoManutencaoResumo_(somaL) -
    ctx.custoVariavelResumo_(somaL)) < 1e-9);

// O parâmetro é novo: toda instalação que ainda não rodou o Instalar não o tem,
// e `param_` lança nesse caso. Derrubar o alerta inteiro por causa disso
// trocaria um aviso útil por silêncio.
//
// Este teste tem de FORÇAR o lançamento: no ambiente de prova `param_` devolve
// undefined em vez de lançar, e a versão anterior passava pelo ramo errado —
// aprovava o `catch` sem nunca entrar nele.
const paramReal = ctx.param_;
ctx.param_ = function () { throw new Error('Parâmetro "X" não encontrado na aba Parâmetros.'); };
let caiuNoPadrao = null;
try { caiuNoPadrao = ctx.paramOuPadrao_('MANUTENCAO_RELEVANTE_RS', 1500); }
catch (e) { caiuNoPadrao = 'LANÇOU: ' + e.message; }
ok('param_ que lança cai no padrão em vez de derrubar o bloco',
  caiuNoPadrao === 1500, String(caiuNoPadrao));

// E o bloco inteiro continua de pé com o parâmetro faltando.
limpar();
ctx.__resumo = [comOficina('SXC9I77', 456, 87.14, 542.71, 2130, 110.14)];
let blocoVivo;
try { blocoVivo = ctx.alertasManutencao_(); } catch (e) { blocoVivo = 'LANÇOU: ' + e.message; }
ok('o bloco de manutenção sobrevive à falta do parâmetro',
  Array.isArray(blocoVivo) && /SXC9I77/.test(blocoVivo.join(' ')), String(blocoVivo));
ctx.param_ = paramReal;

ok('valor presente é usado, não o padrão',
  ctx.paramOuPadrao_ && (function () {
    const salvo = ctx.param_;
    ctx.param_ = function () { return 4000; };
    const r = ctx.paramOuPadrao_('MANUTENCAO_RELEVANTE_RS', 1500);
    ctx.param_ = salvo;
    return r === 4000;
  })(), 'o padrão não pode ganhar de um valor configurado');

// Piso configurado acima do gasto: o veículo sai da lista.
limpar();
ctx.__resumo = [comOficina('SXC9I77', 456, 87.14, 542.71, 2130, 110.14)];
const salvoP = ctx.param_;
ctx.param_ = function () { return 5000; };
ok('piso alto tira o veículo da lista', ctx.alertasManutencao_().length === 0,
  'o parâmetro tem de mandar de verdade');
ctx.param_ = function () { return 0; };
ok('piso zero desliga o bloco', ctx.alertasManutencao_().length === 0);
ctx.param_ = salvoP;

// E a função de rubrica dominante, nos cantos.
const vazia = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
ok('linha sem nenhum custo não inventa rubrica', ctx.rubricaDominante_(vazia) === null);
const empate = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
empate[ctx.R_.OFICINA] = 100; empate[ctx.R_.PNEUS] = 100;
ok('empate escolhe um e não quebra', ctx.rubricaDominante_(empate) !== null);
ok('e a fração do empate é metade', Math.abs(ctx.rubricaDominante_(empate).fracao - 0.5) < 1e-9);
ok('toda coluna de custo variável tem rótulo em português',
  ctx.R_CUSTO_VARIAVEL_.every(function (n) { return !!ctx.ROTULO_CUSTO_VARIAVEL_[n]; }),
  'uma coluna sem rótulo cairia no nome interno da constante');


console.log('\n12. A planilha e o alerta usam a MESMA regra');
// Até a V4.20 a formatação condicional do Resumo era `$U4 > 2*$U$3`: o R$/km
// de cada veículo contra o dobro do número da FROTA INTEIRA. Com transporte a
// 85% do custo, pintava toda carreta de vermelho, todo dia — enquanto o
// alerta, desde a V4.9.5, já julgava por mediana da categoria.
//
// Duas regras parecidas e diferentes são piores que uma só: a tela diz uma
// coisa e o e-mail diz outra, e quem lê não sabe em qual acreditar.
limpar();
// A fixture que originou o problema: carros a ~10 km/l e carretas a ~2,5.
ctx.__resumo = [
  linhaResumo('CAR1', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR2', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR3', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR4', 3000, 300, 2400, 'Carro'),
  linhaResumo('CARRETA1', 8000, 3200, 22000, 'Carreta Normal'),
  linhaResumo('CARRETA2', 8000, 3200, 22000, 'Carreta Normal'),
  linhaResumo('CARRETA3', 8000, 3200, 22000, 'Carreta Normal'),
  linhaResumo('CARRETA4', 8000, 3200, 22000, 'Carreta Normal'),
];
const comRef = ctx.preencherReferenciaRodagem_(ctx.__resumo.map(function (l) { return l.slice(); }));
function pintada(l) {
  const r = Number(l[ctx.R_.RS_KM_RODAGEM]) || 0;
  const lim = Number(l[ctx.R_.LIMITE_CATEGORIA]) || 0;
  return r > 0 && lim > 0 && r > lim;
}
ok('NENHUMA carreta é pintada por ser carreta',
  !comRef.some(function (l) { return /CARRETA/.test(String(l[ctx.R_.PLACA])) && pintada(l); }),
  JSON.stringify(comRef.filter(pintada).map(function (l) { return l[ctx.R_.PLACA]; })));
ok('nem os carros', !comRef.some(pintada), 'frota uniforme não tem fora da curva');
ok('e o alerta concorda: fica calado',
  ctx.alertasConsumo_().length === 0, JSON.stringify(ctx.alertasConsumo_()));

// A regra ANTIGA pintaria as carretas. Esta prova mostra o que foi consertado.
const mediaFrota = comRef.reduce(function (t, l) { return t + (Number(l[ctx.R_.RS_KM_RODAGEM]) || 0); }, 0) / comRef.length;
const carreta = comRef.filter(function (l) { return String(l[ctx.R_.PLACA]) === 'CARRETA1'; })[0];
ok('a régua da frota inteira é o que estava errado',
  Number(carreta[ctx.R_.RS_KM_RODAGEM]) > mediaFrota,
  'a carreta está acima da média da frota — e isso é NORMAL para uma carreta');

console.log('\n13. Uma carreta realmente cara é pintada');
limpar();
ctx.__resumo = [
  linhaResumo('CAR1', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR2', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR3', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR4', 3000, 300, 2400, 'Carro'),
  linhaResumo('CARRETA1', 8000, 3200, 22000, 'Carreta Normal'),
  linhaResumo('CARRETA2', 8000, 3200, 22000, 'Carreta Normal'),
  linhaResumo('CARRETA3', 8000, 3200, 22000, 'Carreta Normal'),
  linhaResumo('CARRETA4', 8000, 3200, 22000, 'Carreta Normal'),
  linhaResumo('BEBONA', 8000, 3200, 70000, 'Carreta Normal'),
];
const comRef2 = ctx.preencherReferenciaRodagem_(ctx.__resumo.map(function (l) { return l.slice(); }));
const pintadas = comRef2.filter(pintada).map(function (l) { return String(l[ctx.R_.PLACA]); });
ok('a carreta que bebe o triplo das outras carretas É pintada',
  pintadas.join() === 'BEBONA', JSON.stringify(pintadas));
ok('e o alerta aponta a mesma placa',
  ctx.alertasConsumo_().filter(function (a) { return a.indexOf('BEBONA') === 0; }).length === 1,
  JSON.stringify(ctx.alertasConsumo_()));
ok('e NÃO aponta mais ninguém',
  ctx.alertasConsumo_().filter(function (a) { return a.indexOf('—') !== 0; }).length === 1,
  JSON.stringify(ctx.alertasConsumo_()));

console.log('\n13b. O limite é 2× a mediana, não 1×');
// A fixture anterior era uniforme demais: com uma carreta a 3× da mediana,
// trocar o limite de 2× para 1× não muda quem é pintado. Precisa de alguém
// ENTRE as duas réguas, que só o 2× deixa passar.
limpar();
ctx.__resumo = [
  linhaResumo('REF1', 4000, 500, 4000, 'Carro'),
  linhaResumo('REF2', 4000, 500, 4000, 'Carro'),
  linhaResumo('REF3', 4000, 500, 4000, 'Carro'),
  linhaResumo('REF4', 4000, 500, 4000, 'Carro'),
  linhaResumo('MEIO', 4000, 500, 6000, 'Carro'),   // 1,5× a mediana
  linhaResumo('ACIMA', 4000, 500, 10000, 'Carro'), // 2,5× a mediana
];
const r13 = ctx.preencherReferenciaRodagem_(ctx.__resumo.map(function (l) { return l.slice(); }));
function porPlaca13(p) { return r13.filter(function (l) { return String(l[ctx.R_.PLACA]) === p; })[0]; }
ok('quem está a 1,5× da mediana NÃO é pintado', !pintada(porPlaca13('MEIO')),
  'rodagem ' + porPlaca13('MEIO')[ctx.R_.RS_KM_RODAGEM] + ' vs limite ' + porPlaca13('MEIO')[ctx.R_.LIMITE_CATEGORIA]);
ok('quem está a 2,5× É pintado', pintada(porPlaca13('ACIMA')),
  'rodagem ' + porPlaca13('ACIMA')[ctx.R_.RS_KM_RODAGEM] + ' vs limite ' + porPlaca13('ACIMA')[ctx.R_.LIMITE_CATEGORIA]);
ok('o limite é exatamente o dobro da mediana',
  Math.abs(Number(porPlaca13('REF1')[ctx.R_.LIMITE_CATEGORIA]) - 2 * (4000 / 4000)) < 0.002,
  String(porPlaca13('REF1')[ctx.R_.LIMITE_CATEGORIA]));
ok('e o alerta aponta só o de 2,5×',
  ctx.alertasConsumo_().filter(function (a) { return a.indexOf('—') !== 0; }).join() .indexOf('ACIMA') === 0,
  JSON.stringify(ctx.alertasConsumo_()));

console.log('\n13c. A coluna mostra RODAGEM, não o custo variável');
// Sem oficina nas fixtures, rodagem e custo variável dão o mesmo número e a
// prova não distinguia os dois. O caso real é a Saveiro: oficina enorme,
// rodagem normal.
limpar();
const saveiro = linhaResumo('SAVEIRO', 2000, 250, 1600, 'Carro');
saveiro[ctx.R_.OFICINA] = 20000;
saveiro[ctx.R_.TOTAL] = 21600;
ctx.__resumo = [
  linhaResumo('REF1', 2000, 250, 1600, 'Carro'),
  linhaResumo('REF2', 2000, 250, 1600, 'Carro'),
  linhaResumo('REF3', 2000, 250, 1600, 'Carro'),
  linhaResumo('REF4', 2000, 250, 1600, 'Carro'),
  saveiro,
];
const r13c = ctx.preencherReferenciaRodagem_(ctx.__resumo.map(function (l) { return l.slice(); }));
const sv = r13c.filter(function (l) { return String(l[ctx.R_.PLACA]) === 'SAVEIRO'; })[0];
ok('a coluna ignora os R$ 20.000 de oficina',
  Math.abs(Number(sv[ctx.R_.RS_KM_RODAGEM]) - 0.8) < 0.002,
  'deu ' + sv[ctx.R_.RS_KM_RODAGEM] + ' — com oficina daria 10,8');
ok('e por isso a Saveiro NÃO é pintada', !pintada(sv),
  'manutenção é gasto por evento; julgá-la por km pinta todo mês de preventiva');

console.log('\n14. Sem referência não é "dentro da curva"');
limpar();
ctx.__resumo = [
  linhaResumo('SOZINHA', 1000, 400, 9000, 'Maquina'),
  linhaResumo('CAR1', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR2', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR3', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR4', 3000, 300, 2400, 'Carro'),
];
const comRef3 = ctx.preencherReferenciaRodagem_(ctx.__resumo.map(function (l) { return l.slice(); }));
const sozinha = comRef3.filter(function (l) { return String(l[ctx.R_.PLACA]) === 'SOZINHA'; })[0];
ok('categoria com menos de 4 veículos fica com limite VAZIO',
  sozinha[ctx.R_.LIMITE_CATEGORIA] === '', JSON.stringify(sozinha[ctx.R_.LIMITE_CATEGORIA]));
ok('vazio, NÃO zero: zero seria lido como limite zero e pintaria tudo',
  sozinha[ctx.R_.LIMITE_CATEGORIA] !== 0);
ok('mas o custo de rodagem dela é calculado assim mesmo',
  Number(sozinha[ctx.R_.RS_KM_RODAGEM]) > 0, String(sozinha[ctx.R_.RS_KM_RODAGEM]));
ok('e ela não é pintada', !pintada(sozinha));

// Rodagem baixa também fica sem limite.
limpar();
ctx.__resumo = [
  linhaResumo('CAR1', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR2', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR3', 3000, 300, 2400, 'Carro'),
  linhaResumo('CAR4', 3000, 300, 2400, 'Carro'),
  linhaResumo('PARADO', 50, 5, 5000, 'Carro'),
];
const comRef4 = ctx.preencherReferenciaRodagem_(ctx.__resumo.map(function (l) { return l.slice(); }));
const parado4 = comRef4.filter(function (l) { return String(l[ctx.R_.PLACA]) === 'PARADO'; })[0];
ok('veículo abaixo do piso de rodagem fica sem limite',
  parado4[ctx.R_.LIMITE_CATEGORIA] === '', JSON.stringify(parado4[ctx.R_.LIMITE_CATEGORIA]));
ok('e não é pintado, apesar do R$/km altíssimo',
  !pintada(parado4), String(parado4[ctx.R_.RS_KM_RODAGEM]));

// Duas guardas, não uma: a categoria pode ter 4+ veículos e mesmo assim
// sobrar pouca gente DEPOIS do piso de rodagem. A fixture acima só exercitava
// a primeira (categoria pequena); esta exercita a segunda.
limpar();
ctx.__resumo = [
  linhaResumo('RODA1', 10000, 1000, 8000, 'Truck Normal'),
  linhaResumo('RODA2', 10000, 1000, 8000, 'Truck Normal'),
  linhaResumo('RODA3', 10000, 1000, 24000, 'Truck Normal'),  // caro, mas são só 3
  linhaResumo('PARADO1', 100, 10, 500, 'Truck Normal'),
  linhaResumo('PARADO2', 100, 10, 500, 'Truck Normal'),
];
const r14b = ctx.preencherReferenciaRodagem_(ctx.__resumo.map(function (l) { return l.slice(); }));
ok('5 veículos na categoria, mas só 3 acima do piso: NINGUÉM tem limite',
  r14b.every(function (l) { return l[ctx.R_.LIMITE_CATEGORIA] === ''; }),
  JSON.stringify(r14b.map(function (l) { return [String(l[ctx.R_.PLACA]), l[ctx.R_.LIMITE_CATEGORIA]]; })));
ok('e ninguém é pintado, nem o caro', !r14b.some(pintada),
  'com três veículos a referência é o próprio ruído');
ok('o alerta também fica calado sobre eles',
  ctx.alertasConsumo_().every(function (a) { return a.indexOf('—') === 0; }),
  JSON.stringify(ctx.alertasConsumo_()));

// A primeira guarda (categoria pequena) parece redundante com a segunda
// (poucos avaliados) — a segunda pega todos os casos da primeira. Mas ela
// muda o MOTIVO informado, e motivo errado manda o operador consertar a coisa
// errada. Numa categoria de dois veículos, um deles parado, a causa é a
// categoria ser pequena; não é a rodagem de ninguém.
limpar();
ctx.__resumo = [
  linhaResumo('DUPLA1', 10000, 1000, 8000, 'Moto'),
  linhaResumo('DUPLA2', 100, 10, 500, 'Moto'),
];
const msgs = ctx.alertasConsumo_().join(' | ');
ok('os dois são atribuídos à categoria pequena',
  /2 veículo\(s\) não avaliados: a categoria deles tem/.test(msgs), msgs);
ok('e NENHUM é culpado de rodagem baixa',
  !/não avaliados por rodagem baixa/.test(msgs),
  msgs + ' — a causa é a categoria ter dois veículos, não a moto estar parada');

console.log('\n15. As duas pontas, lidas do fonte');
const fonteR = fs.readFileSync('Codigo.gs', 'utf8');
ok('a regra mora numa função só', /function referenciaPorCategoria_\(linhas\)/.test(fonteR));
ok('o alerta a consome', /function alertasConsumo_[\s\S]{0,400}referenciaPorCategoria_\(linhas\)/.test(fonteR));
ok('e o Resumo também, pela preencherReferenciaRodagem_',
  /preencherReferenciaRodagem_\(calcularLinhasResumo_/.test(fonteR));
ok('a regra ANTIGA da frota inteira não existe mais',
  !/\$U4>2\*\$U\$3/.test(fonteR),
  'era ela que pintava toda carreta');
ok('a formatação condicional usa as colunas novas',
  /R_\.RS_KM_RODAGEM \+ 1[\s\S]{0,400}R_\.LIMITE_CATEGORIA \+ 1/.test(fonteR));
ok('pinta a coluna que é julgada, não a R$/km total',
  /setRanges\(\[sheet\.getRange\(4, R_\.RS_KM_RODAGEM \+ 1/.test(fonteR),
  'pintar o total com a régua da rodagem seria colorir um número com a régua de outro');
ok('as duas colunas novas estão no fim, depois do Gás',
  ctx.R_.RS_KM_RODAGEM > ctx.R_.GAS && ctx.R_.LIMITE_CATEGORIA > ctx.R_.RS_KM_RODAGEM,
  'as letras A..V são referenciadas por fórmula em Relatórios, Dashboard e Rateio');
ok('e o total de colunas acompanha', ctx.TOTAL_COL_RESUMO === ctx.R_.LIMITE_CATEGORIA + 1,
  String(ctx.TOTAL_COL_RESUMO));
ok('são as colunas Y e Z', ctx.letraColuna_(ctx.R_.RS_KM_RODAGEM + 1) === 'Y' &&
  ctx.letraColuna_(ctx.R_.LIMITE_CATEGORIA + 1) === 'Z',
  ctx.letraColuna_(ctx.R_.RS_KM_RODAGEM + 1) + '/' + ctx.letraColuna_(ctx.R_.LIMITE_CATEGORIA + 1));

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
