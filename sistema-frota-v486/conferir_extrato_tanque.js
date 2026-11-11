/**
 * Prova do extrato do tanque e do histórico de aferições.
 *
 * O usuário pediu, nesta ordem: extrato por período, histórico de aferições e
 * — a frase que manda no desenho — *"no relatório eu preciso saber só quantos
 * litros foram dados baixa do estoque"*. Então o número que abre o relatório
 * é esse, e ele é coluna própria, não uma conta de somar linhas.
 *
 * O que se guarda aqui:
 *  - **a conta fecha**: saldo inicial + entradas + ajustes − baixa = saldo
 *    final. Um extrato que não fecha é pior que extrato nenhum, porque
 *    parece conferido;
 *  - **baixa é saída do TANQUE**, não compra. Abastecimento externo não
 *    encosta no estoque, e contá-lo dobraria o consumo;
 *  - **aferição não é carga**. Ela entra na aba `Carga na Bomba` com o
 *    documento `AJUSTE-ESTOQUE`; somá-la às notas faria uma correção para
 *    menos virar "compra negativa" no meio das NFs;
 *  - o saldo ao fim de cada dia, que é o que dispensa refazer a conta na mão.
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

const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: {
    getUuid: () => 'x',
    formatDate: function (d, _tz, padrao) {
      const z = n => ('0' + n).slice(-2);
      if (padrao === 'yyyy-MM-dd') return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
      return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    relatorioExtratoTanque_, relatorioAfericoes_, movimentosDoTanque_, saldoAntesDe_,
    estadoTanque_, intervaloDeDatas_, blocosDoRelatorio_, relatorioPorTipo_,
    CATALOGO_RELATORIOS, COL_CARGA, L_, TOTAL_COL_LANC, PRODUTO_DIESEL, PRODUTO_ARLA,
    PREFIXO_AJUSTE_ESTOQUE_,
  });
  exigirExecucaoLeitura_ = function () {};
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-11' : ''; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  timezone_ = function () { return 'America/Sao_Paulo'; };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26, 0, 0, 0, 0),
                                         fim: new Date(2026, 10, 25, 23, 59, 59, 999) }; };
  periodoDoMes_ = function () { return periodoAtual_(); };
  lerCargasBomba_ = function () { return __cargas; };
  lerLancamentos_ = function () { return __lanc; };
`, ctx);

const dia = vm.runInContext('(function (d) { return new Date(2026, 10, d, 12, 0, 0, 0); })', ctx);

function carga(d, documento, produto, litros, valor, obs) {
  const c = [];
  c[ctx.COL_CARGA.DATA - 1] = dia(d);
  c[ctx.COL_CARGA.DOCUMENTO - 1] = documento;
  c[ctx.COL_CARGA.PRODUTO - 1] = produto;
  c[ctx.COL_CARGA.QUANTIDADE - 1] = litros;
  c[ctx.COL_CARGA.VALOR - 1] = valor;
  c[ctx.COL_CARGA.OBSERVACAO - 1] = obs || '';
  return c;
}
function abast(d, placa, litros, valor, origem) {
  const l = new Array(ctx.TOTAL_COL_LANC).fill('');
  l[ctx.L_.DATA] = dia(d);
  l[ctx.L_.PLACA] = placa;
  l[ctx.L_.TIPO] = 'Combustivel Proprio';
  l[ctx.L_.TIPO_ABASTECIMENTO] = origem || 'Interno';
  l[ctx.L_.LITROS] = litros;
  l[ctx.L_.VALOR] = valor;
  l[ctx.L_.ID] = 'LAN-' + d + '-' + placa;
  return l;
}

function montar() {
  ctx.__cargas = [
    carga(2, 'NF 1000', 'DIESEL S10', 5000, 30000),
    carga(10, 'NF 1001', 'DIESEL S10', 3000, 18600),
    // Aferição: entra na MESMA aba, com o documento AJUSTE-ESTOQUE.
    carga(12, 'AJUSTE-ESTOQUE', 'DIESEL S10', -40, -248,
      'Ajuste de estoque por joao@giassi: saldo do sistema 2.000,000 L, medido 1.960,000 L • régua mensal'),
    carga(6, 'NF 2000', 'ARLA 32', 400, 1600),
  ];
  ctx.__lanc = [
    abast(3, 'AAA 0001', 1000, 6000),
    abast(5, 'BBB 0002', 2000, 12000),
    abast(11, 'CCC 0003', 500, 3100),
    // Externo: NÃO encosta no tanque.
    abast(11, 'DDD 0004', 900, 5600, 'Externo'),
  ];
  vm.runInContext('LANCAMENTOS_EXEC_CACHE_ = null; CARGAS_EXEC_CACHE_ = null;', ctx);
}

console.log('\n1. O que é baixa e o que não é');
montar();
const janelaMes = ctx.intervaloDeDatas_(null, { inicio: dia(1), fim: dia(30) });
const mov = ctx.movimentosDoTanque_('DIESEL S10', janelaMes);
ok('a baixa é só o abastecimento INTERNO',
  mov.litrosBaixa === 3500, String(mov.litrosBaixa) + ' L — com o externo seriam 4.400');
ok('o abastecimento externo não entra', mov.baixas.every(function (b) {
  return b.placa !== 'DDD 0004';
}));
ok('a carga de ARLA não entra no diesel',
  mov.cargas.every(function (c) { return c.documento !== 'NF 2000'; }));
// Somar a afericao as notas faria uma correcao para menos virar "compra
// negativa" no meio das NFs.
ok('a aferição NÃO conta como carga',
  mov.litrosEntrada === 8000 && mov.cargas.length === 2,
  String(mov.litrosEntrada) + ' L em ' + mov.cargas.length + ' carga(s)');
ok('ela vai para a conta de ajuste, com sinal',
  mov.litrosAjuste === -40 && mov.ajustes.length === 1, String(mov.litrosAjuste));

console.log('\n2. A conta fecha');
const rel = ctx.relatorioExtratoTanque_({ de: '2026-11-01', ate: '2026-11-30' });
const linhaDiesel = rel.linhas.filter(function (l) { return l[0] === 'DIESEL S10'; })[0];
ok('o diesel aparece no resumo', !!linhaDiesel, JSON.stringify(rel.linhas));
ok('saldo inicial + entradas + ajustes − baixa = saldo final', (function () {
  const inicial = linhaDiesel[1], entrou = linhaDiesel[2], baixa = linhaDiesel[3];
  const ajuste = linhaDiesel[4], final = linhaDiesel[5];
  return Math.abs(inicial + entrou + ajuste - baixa - final) < 0.001;
})(), JSON.stringify(linhaDiesel) + ' — extrato que não fecha é pior que extrato nenhum');
ok('e os números são os do período', linhaDiesel[2] === 8000 && linhaDiesel[3] === 3500 &&
  linhaDiesel[4] === -40, JSON.stringify(linhaDiesel));

console.log('\n3. O número que o usuário pediu abre o relatório');
ok('a mensagem começa pela baixa do estoque',
  /^Baixa do estoque no período: 3\.500,0 L/.test(rel.mensagem), rel.mensagem);
ok('e explica o que é baixa, para ninguém somar a compra de fora',
  /abastecimento interno do veículo/.test(rel.mensagem) &&
  /Compra feita fora não passa por aqui/.test(rel.mensagem));
ok('a baixa também é COLUNA, não uma conta a fazer',
  rel.colunas[3].titulo === 'Baixa do estoque (L)', rel.colunas[3].titulo);

console.log('\n4. Dia a dia, com saldo ao fim de cada dia');
const blocos = ctx.blocosDoRelatorio_(rel, 'depois');
const diaADia = blocos.filter(function (b) { return /Dia a dia/.test(b.titulo); })[0];
ok('o bloco existe', !!diaADia, JSON.stringify(blocos.map(function (b) { return b.titulo; })));
ok('mais recente primeiro', diaADia.linhas[0][0] === '12/11/2026', diaADia.linhas[0][0]);
ok('cada dia tem o saldo do fim do dia', (function () {
  // Ordem crescente: 02 (+5000) 03 (-1000) 05 (-2000) 10 (+3000) 11 (-500) 12 (-40)
  const esperado = { '02/11/2026': 5000, '03/11/2026': 4000, '05/11/2026': 2000,
    '10/11/2026': 5000, '11/11/2026': 4500, '12/11/2026': 4460 };
  return diaADia.linhas.every(function (l) { return Math.abs(l[4] - esperado[l[0]]) < 0.001; });
})(), JSON.stringify(diaADia.linhas));
ok('o rodapé do dia a dia bate com o resumo',
  diaADia.totais[1] === 8000 && diaADia.totais[2] === 3500 && diaADia.totais[3] === -40,
  JSON.stringify(diaADia.totais));
ok('e não totaliza o SALDO, que não se soma',
  diaADia.totais[4] === null, 'somar saldos de dias diferentes não significa nada');

console.log('\n5. Cargas e aferições, cada uma no seu bloco');
const blocoCargas = blocos.filter(function (b) { return /Cargas recebidas/.test(b.titulo); })[0];
ok('as cargas saem com NF e R$/litro',
  blocoCargas && blocoCargas.linhas.length === 3, JSON.stringify(blocoCargas && blocoCargas.linhas.length));
ok('e a aferição não está entre elas',
  blocoCargas.linhas.every(function (l) { return !/AJUSTE/.test(String(l[2])); }));
const blocoAfer = blocos.filter(function (b) { return /Aferições/.test(b.titulo); })[0];
ok('a aferição tem bloco próprio', !!blocoAfer);
ok('com a justificativa e quem fez',
  /joao@giassi/.test(String(blocoAfer.linhas[0][4])) &&
  /régua mensal/.test(String(blocoAfer.linhas[0][4])),
  'ajuste sem justificativa visível é ajuste que ninguém audita');

console.log('\n6. As aferições como relatório próprio');
const afer = ctx.relatorioAfericoes_({ de: '2026-11-01', ate: '2026-11-30' });
ok('lista a aferição', afer.linhas.length === 1, JSON.stringify(afer.linhas));
ok('as colunas são as MESMAS do bloco do extrato',
  JSON.stringify(afer.colunas) === JSON.stringify(blocoAfer.colunas),
  'duas definições seriam a chance de uma ganhar coluna e a outra não');
ok('o total soma a diferença', afer.totais[2] === -40, String(afer.totais[2]));
ok('e a mensagem diz o que é sobra e o que é falta',
  /Sobra é entrada, falta é saída/.test(afer.mensagem), afer.mensagem);
ok('período sem aferição não é erro, é frase',
  /Nenhuma aferição/.test(
    ctx.relatorioAfericoes_({ de: '2026-01-01', ate: '2026-01-31' }).mensagem));

console.log('\n7. O período recorta de verdade');
const soInicio = ctx.relatorioExtratoTanque_({ de: '2026-11-01', ate: '2026-11-04' });
const dieselCurto = soInicio.linhas.filter(function (l) { return l[0] === 'DIESEL S10'; })[0];
ok('entradas só do recorte', dieselCurto[2] === 5000, String(dieselCurto[2]));
ok('baixa só do recorte', dieselCurto[3] === 1000, String(dieselCurto[3]));
ok('e o saldo final é o do fim do recorte, não o de hoje',
  dieselCurto[5] === 4000, String(dieselCurto[5]));
ok('e o dia a dia do recorte parte desse saldo, não do zero', (function () {
  const meio = ctx.relatorioExtratoTanque_({ de: '2026-11-10', ate: '2026-11-30' });
  const bloco = ctx.blocosDoRelatorio_(meio, 'depois')
    .filter(function (b2) { return /Dia a dia/.test(b2.titulo); })[0];
  // Antes do dia 10 havia 2.000 L. No dia 10 entram 3.000 => 5.000 no fim do dia.
  const d10 = bloco.linhas.filter(function (l) { return l[0] === '10/11/2026'; })[0];
  return d10 && Math.abs(d10[4] - 5000) < 0.001;
})(), 'saldo corrente partindo do zero faria a ficha fechar num número que não existe');
ok('saldo inicial de um recorte que começa no meio traz o que já havia', (function () {
  const meio = ctx.relatorioExtratoTanque_({ de: '2026-11-10', ate: '2026-11-30' });
  const d = meio.linhas.filter(function (l) { return l[0] === 'DIESEL S10'; })[0];
  // Até 09/11: +5000 −1000 −2000 = 2000 L.
  return Math.abs(d[1] - 2000) < 0.001;
})(), 'saldo inicial zerado faria o extrato não fechar com o mês anterior');

console.log('\n8. Os dois relatórios estão no catálogo e no despacho');
['Extrato do tanque', 'Aferições de estoque do tanque'].forEach(function (nome) {
  ok('"' + nome + '" está no catálogo', !!ctx.CATALOGO_RELATORIOS[nome]);
  ok('"' + nome + '" aceita período',
    ctx.CATALOGO_RELATORIOS[nome].fonte === 'lancamentos');
  ok('"' + nome + '": o despacho conhece', (function () {
    const r = ctx.relatorioPorTipo_(nome, null, null, null, '', { de: '2026-11-01', ate: '2026-11-30' });
    return r && r.colunas && !/desconhecido/.test(r.mensagem || '');
  })(), 'relatório no catálogo sem case no despacho devolve "Relatório desconhecido"');
  ok('"' + nome + '": catálogo e função têm as MESMAS colunas',
    ctx.CATALOGO_RELATORIOS[nome].colunas.length ===
      ctx.relatorioPorTipo_(nome, null, null, null, '', null).colunas.length);
});

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
