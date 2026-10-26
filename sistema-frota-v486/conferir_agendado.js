/**
 * Prova de que parcela de IPVA agendada NAO e pendencia.
 *
 * O defeito: a V4.8.7 passou a lancar o IPVA como 12 parcelas, cada uma datada
 * no fim da SUA competencia — inclusive as que ainda nao chegaram. O validador
 * de "lancamento em periodo futuro", escrito antes disso, condenava cada uma.
 * Resultado real na frota do usuario: 110 pendencias, quase todas de parcelas
 * agendadas, que ninguem consegue resolver porque nao sao problema.
 *
 * A linha que o teste nao pode deixar passar e a do meio: parcela agendada sai,
 * mas IPVA avulso com data errada CONTINUA sendo acusado. Uma isencao larga
 * demais calaria o validador justamente para o tipo em que o erro de digitacao
 * e mais caro.
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
  Utilities: { getUuid: () => 'x', formatDate: () => '' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    lancamentoAgendado_, L_, COL_LANC, TOTAL_COL_LANC, PREFIXO_GRUPO_IPVA_,
    lancarIpvaAnual_, somarMesesCompetencia_, PARCELAS_IPVA_, periodoDoMes_,
  });
`, ctx, { filename: 'Codigo.gs' });

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}

function lanc(tipo, observacao) {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.TIPO] = tipo;
  l[ctx.L_.OBSERVACAO] = observacao || '';
  return l;
}

console.log('\n1. Reconhecimento da parcela agendada');
ok('parcela de IPVA com marcador de grupo é agendada',
  ctx.lancamentoAgendado_(lanc('IPVA', 'IPVA-A1B2C3D4 • competência 2026-12')) === true);
ok('IPVA AVULSO, sem grupo, NÃO é agendado',
  ctx.lancamentoAgendado_(lanc('IPVA', 'pago no banco')) === false,
  'se fosse, um IPVA digitado com 2027 no lugar de 2026 nunca mais seria acusado');
ok('IPVA com observação vazia não é agendado',
  ctx.lancamentoAgendado_(lanc('IPVA', '')) === false);
ok('combustível com texto parecido na observação não é agendado',
  ctx.lancamentoAgendado_(lanc('Combustivel Proprio', 'IPVA-A1B2C3D4')) === false,
  'o tipo tem de ser IPVA; só o texto não basta');
ok('outro tipo qualquer não é agendado',
  ctx.lancamentoAgendado_(lanc('Oficina Despesa', 'IPVA-X')) === false);
ok('o marcador usa o prefixo real do sistema, não um literal solto',
  ctx.lancamentoAgendado_(lanc('IPVA', ctx.PREFIXO_GRUPO_IPVA_ + 'FFFF0000')) === true);

console.log('\n2. A regra do validador, reproduzida');
// Espelha a decisao do coletor: `futuro && !agendado` acusa;
// `!noPeriodoAtual && (!futuro || agendado)` sai antes das demais checagens.
function avaliar(linha, data, periodo) {
  const noPeriodoAtual = data >= periodo.inicio && data <= periodo.fim;
  const futuro = data > periodo.fim;
  const agendado = ctx.lancamentoAgendado_(linha);
  return {
    acusaFuturo: futuro && !agendado,
    saiAntesDasDemais: !noPeriodoAtual && (!futuro || agendado),
  };
}
const periodo = { inicio: new Date(2026, 9, 26), fim: new Date(2026, 10, 25) };
const futura = new Date(2026, 11, 26);     // 26/12/2026, o caso do print
const dentro = new Date(2026, 10, 10);
const passada = new Date(2026, 5, 10);

let r = avaliar(lanc('IPVA', 'IPVA-A1B2C3D4 • competência 2026-12'), futura, periodo);
ok('parcela agendada no futuro NÃO é acusada', r.acusaFuturo === false);
ok('e nem passa pelas checagens do mês aberto', r.saiAntesDasDemais === true,
  'sem isso ela ainda seria avaliada como se fosse do mês que está fechando');

r = avaliar(lanc('IPVA', 'pago no banco'), futura, periodo);
ok('IPVA avulso com data futura CONTINUA sendo acusado', r.acusaFuturo === true);

r = avaliar(lanc('Combustivel Proprio', ''), futura, periodo);
ok('abastecimento com data futura continua sendo acusado', r.acusaFuturo === true,
  'é o erro de digitação que o validador existe para pegar');

r = avaliar(lanc('IPVA', 'IPVA-A1B2C3D4 • competência 2026-11'), dentro, periodo);
ok('parcela agendada que chegou no mês aberto é avaliada normalmente',
  r.saiAntesDasDemais === false,
  'quando a competência dela abre, centro, categoria e placa voltam a valer');
ok('e não é acusada de futuro, porque não é futuro', r.acusaFuturo === false);

r = avaliar(lanc('IPVA', 'IPVA-A1B2C3D4 • competência 2026-06'), passada, periodo);
ok('parcela já vencida sai como qualquer registro histórico',
  r.saiAntesDasDemais === true && r.acusaFuturo === false);

console.log('\n3. Quantas parcelas futuras cada lançamento de IPVA gera');
// A versao anterior deste bloco afirmava "com 55 veiculos passa de 100
// pendencias". Era um palpite sobre dados que o teste nao enxerga, disfarcado
// de prova — e reprovou, porque o numero dependia de QUANDO o IPVA foi lancado.
// O que da para afirmar e a propriedade, nao o total da frota do usuario.
function futurasDepoisDe(mesLancamento, mesAberto) {
  let n = 0;
  for (let i = 0; i < ctx.PARCELAS_IPVA_; i++) {
    if (ctx.somarMesesCompetencia_(mesLancamento, i) > mesAberto) n++;
  }
  return n;
}
console.log('     competência aberta 2026-11, IPVA lançado em:');
['2026-01', '2026-06', '2026-10', '2026-11'].forEach(function (m) {
  console.log('       ' + m + ' -> ' + futurasDepoisDe(m, '2026-11') + ' parcela(s) futura(s)');
});
ok('IPVA lançado na competência aberta gera ' + (ctx.PARCELAS_IPVA_ - 1) + ' parcelas futuras',
  futurasDepoisDe('2026-11', '2026-11') === ctx.PARCELAS_IPVA_ - 1,
  String(futurasDepoisDe('2026-11', '2026-11')));
ok('e vai caindo de uma em uma a cada mês que passa',
  futurasDepoisDe('2026-01', '2026-11') === 1 &&
  futurasDepoisDe('2026-01', '2026-10') === 2,
  'o acúmulo depende de quando cada veículo foi lançado — por isso o total ' +
  'da frota não é previsível pelo teste');
ok('depois do ciclo inteiro, nenhuma parcela fica no futuro',
  futurasDepoisDe('2026-01', '2026-12') === 0);

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
