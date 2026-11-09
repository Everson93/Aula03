/**
 * Prova do histórico de abastecimentos e do estorno.
 *
 * A tela antiga que o usuário usava mostrava, numa janela só, a sequência de
 * abastecimentos do veículo com odômetro, percurso, média e o botão de
 * estornar. Sem isso, quando o KM digitado sai menor que o último, a única
 * saída era marcar "forçar" — e forçar é a decisão errada na maioria das
 * vezes: o normal é o KM GRAVADO estar errado, não o que a pessoa tem na mão.
 *
 * O que se prova aqui é a aritmética da sequência (percurso e média, que é
 * onde o erro se esconde) e que o estorno não inventa um caminho próprio de
 * exclusão — ele passa pelo mesmo `excluirLancamento_` que já guarda cópia,
 * recusa período fechado e devolve os litros ao tanque.
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

const diario = { excluidos: [], janelas: [] };
const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: {
    getUuid: () => 'x',
    formatDate: function (d, _tz, padrao) {
      const p = n => ('0' + n).slice(-2);
      if (padrao === 'yyyy-MM-dd') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { historicoAbastecimentos_, webHistoricoAbastecimentos,
    webEstornarAbastecimento, ultimoOdometro, ultimaLeituraOdometro_,
    lerLancamentosRecentes_, JANELAS_HISTORICO_,
    L_, TIPOS_COMBUSTIVEL, ABASTECIMENTO_INTERNO });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  exigirPerfilToken_ = function () {};
  autorizarContextoWeb_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-11' : ''; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26, 0, 0, 0, 0),
                                         fim: new Date(2026, 10, 25, 23, 59, 59, 999) }; };
  periodoDoMes_ = function () { return periodoAtual_(); };
  formatarData_ = function (d) { const z = n => ('0'+n).slice(-2);
    return z(d.getDate()) + '/' + z(d.getMonth()+1) + '/' + d.getFullYear(); };
  lerOdometro_ = function () { return __odometro; };
  // A janela e o ponto da V4.35: o painel le so o FIM de Lancamentos. A
  // dublê conta quantas linhas foram pedidas, para a prova ver a janela
  // funcionando em vez de acreditar nela.
  quantidadeLancamentosReais_ = function () { return __lancamentos.length; };
  ultimaLinhaLancamentoReal_ = function () { return __lancamentos.length + 1; };
  aba_ = function () {
    return {
      getLastRow: function () { return __lancamentos.length + 1; },
      getRange: function (linha, coluna, nL, nC) {
        return { getValues: function () {
          __diario.janelas.push(nL);
          const saida = [];
          for (let i = 0; i < nL; i++) {
            const l = __lancamentos[linha - 2 + i] || [];
            saida.push(l.slice(coluna - 1, coluna - 1 + nC));
          }
          return saida;
        } };
      },
    };
  };
  mesCompetenciaDaData_ = function () { return '2026-11'; };
  resolverVeiculo_ = function (p) { return { ok: true, veiculo: { placa: String(p || '') } }; };
  excluirLancamento_ = function (id, motivo) {
    __diario.excluidos.push({ id: id, motivo: motivo });
    if (String(motivo || '').trim().length < 10) {
      return { ok: false, mensagem: 'Escreva uma justificativa com pelo menos 10 caracteres.' };
    }
    __lancamentos = __lancamentos.filter(function (l) { return String(l[L_.ID]) !== String(id); });
    return { ok: true, mensagem: 'Lançamento excluído.' };
  };
`, ctx);
ctx.__diario = diario;
const data = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); })', ctx);

function lanc(dt, placa, litros, valor, id, extras) {
  const l = new Array(20).fill('');
  const e = extras || {};
  l[ctx.L_.DATA] = dt; l[ctx.L_.PLACA] = placa;
  l[ctx.L_.TIPO] = e.tipo || 'Combustivel Proprio';
  l[ctx.L_.LITROS] = litros; l[ctx.L_.VALOR] = valor; l[ctx.L_.ID] = id;
  l[ctx.L_.DOCUMENTO] = e.nf || ''; l[ctx.L_.TIPO_ABASTECIMENTO] = e.abast || '';
  return l;
}

function montar() {
  // Sequência real: 100.000 → 100.500 → 100.900. A terceira leitura é MENOR
  // que a segunda (erro de digitação): é o caso que o painel existe para
  // mostrar. E o dia 20 tem DUAS leituras: ambíguo, o sistema diz "não sei".
  ctx.__lancamentos = [
    lanc(data(2026, 11, 2), 'AAA 0001', 100, 610, 'LAN-1', { nf: 'NF 1' }),
    lanc(data(2026, 11, 8), 'AAA 0001', 125, 762.5, 'LAN-2', { nf: 'NF 2' }),
    lanc(data(2026, 11, 14), 'AAA 0001', 80, 488, 'LAN-3', { abast: 'Interno' }),
    lanc(data(2026, 11, 20), 'AAA 0001', 90, 549, 'LAN-4'),
    lanc(data(2026, 11, 8), 'BBB 0002', 300, 1830, 'LAN-5'),
    lanc(data(2026, 11, 9), 'AAA 0001', 0, 450, 'LAN-6', { tipo: 'Oficina Despesa' }),
  ];
  ctx.__odometro = [
    [data(2026, 11, 2), 'AAA 0001', 100000],
    [data(2026, 11, 8), 'AAA 0001', 100500],
    [data(2026, 11, 14), 'AAA 0001', 10090],    // digitou faltando um dígito
    [data(2026, 11, 20), 'AAA 0001', 101400],
    [data(2026, 11, 20), 'AAA 0001', 101450],   // duas no mesmo dia: ambíguo
    [data(2026, 11, 8), 'BBB 0002', 50000],
  ];
  vm.runInContext('ODOMETRO_EXEC_CACHE_ = null; ODOMETRO_INDICE_EXEC_ = null;', ctx);
  diario.excluidos.length = 0;
}

console.log('\n1. A sequência do veículo');
montar();
const h = ctx.historicoAbastecimentos_('AAA 0001', 30);
ok('só os abastecimentos entram, não a oficina',
  h.linhas.length === 4, String(h.linhas.length));
ok('e só deste veículo',
  !h.linhas.some(function (l) { return l.id === 'LAN-5'; }));
ok('o mais recente vem primeiro', h.linhas[0].id === 'LAN-4', h.linhas[0].id);
ok('a data sai formatada para o operador', h.linhas[0].dataBR === '20/11/2026', h.linhas[0].dataBR);
ok('e o ISO vai junto, que é por onde a leitura é identificada',
  h.linhas[0].dataIso === '2026-11-20', h.linhas[0].dataIso);

console.log('\n2. Percurso e média, que é onde o erro aparece');
function por(id) { return h.linhas.filter(function (l) { return l.id === id; })[0]; }
ok('o primeiro não tem percurso: não há anterior',
  por('LAN-1').percurso === null && por('LAN-1').media === null,
  JSON.stringify([por('LAN-1').percurso, por('LAN-1').media]));
ok('o segundo roda 500 km', por('LAN-2').percurso === 500, String(por('LAN-2').percurso));
ok('e faz 4 km/L com 125 litros', por('LAN-2').media === 4, String(por('LAN-2').media));
// 10.090 contra 100.500: o dígito que faltou.
ok('o terceiro aparece com percurso NEGATIVO', por('LAN-3').percurso === -90410,
  String(por('LAN-3').percurso));
ok('e marcado como retrocesso', por('LAN-3').retrocedeu === true);
ok('o que não retrocedeu não fica marcado', por('LAN-2').retrocedeu === false);
// Duas leituras no dia 20: o indice devolve vazio em vez de escolher uma.
ok('dia com DUAS leituras não inventa odômetro', por('LAN-4').km === null,
  String(por('LAN-4').km));
ok('e sem odômetro não há percurso nem média',
  por('LAN-4').percurso === null && por('LAN-4').media === null);

console.log('\n3. O rodapé');
const t = h.totais;
ok('conta os abastecimentos', t.abastecimentos === 4, String(t.abastecimentos));
ok('soma os litros', t.litros === 395, String(t.litros));
ok('soma o valor', t.valor === 2409.5, String(t.valor));
// Só o percurso POSITIVO entra: somar os -90.410 daria um total negativo e
// uma média sem sentido.
ok('o percurso soma só o que andou para a frente', t.percurso === 500,
  String(t.percurso));
ok('a média do período é percurso / litros, não média das médias',
  Math.abs(t.media - 500 / 395) < 1e-9, String(t.media));
ok('avisa quantos retrocessos existem', t.retrocessos === 1, String(t.retrocessos));
ok('e quantos ficaram sem leitura', t.semLeitura === 1, String(t.semLeitura));

console.log('\n4. Cantos');
montar();
ok('veículo sem abastecimento devolve lista vazia e explica', (function () {
  const v = ctx.historicoAbastecimentos_('ZZZ 9999', 30);
  return v.linhas.length === 0 && /Nenhum abastecimento/.test(v.mensagem);
})());
ok('placa em branco não varre a base inteira', (function () {
  const v = ctx.historicoAbastecimentos_('', 30);
  return v.linhas.length === 0 && /Informe o veículo/.test(v.mensagem);
})());
ok('o limite corta os mais antigos, não os recentes', (function () {
  const v = ctx.historicoAbastecimentos_('AAA 0001', 2);
  return v.linhas.length === 2 && v.linhas[0].id === 'LAN-4' && v.linhas[1].id === 'LAN-3';
})());
// V4.35: o rodapé passou a ser dos que APARECEM, como na tela antiga
// ("Média no período"). Totalizar a base inteira obrigaria a lê-la inteira
// — que é o que deixava o painel lento — e daria um número que não fecha
// com nenhuma coluna da tela.
ok('o rodapé é do que aparece, e fecha com as linhas', (function () {
  const v = ctx.historicoAbastecimentos_('AAA 0001', 2);
  const soma = v.linhas.reduce(function (t, l) { return t + l.litros; }, 0);
  return v.totais.abastecimentos === 2 && v.totais.litros === soma;
})(), 'rodapé que não fecha com as colunas da tela é pior que rodapé nenhum');

console.log('\n4b. A janela: lê o fim da base, não a base inteira');
montar();
diario.janelas.length = 0;
ctx.historicoAbastecimentos_('AAA 0001', 30);
ok('uma leitura só quando a base cabe na primeira janela',
  diario.janelas.length === 1, JSON.stringify(diario.janelas));
ok('e ela não pede mais linhas do que existem',
  diario.janelas[0] === ctx.__lancamentos.length, String(diario.janelas[0]));
// Base grande: a janela tem de parar na primeira quando ja achou o
// suficiente, senao a economia some.
ok('numa base grande, para na primeira janela quando já achou', (function () {
  const grande = [];
  for (let i = 0; i < 20000; i++) {
    grande.push(lanc(data(2026, 11, (i % 25) + 1), 'P' + (i % 170), 50, 300, 'L' + i));
  }
  ctx.__lancamentos = grande;
  diario.janelas.length = 0;
  const v = ctx.historicoAbastecimentos_('P5', 30);
  return diario.janelas.length === 1 && diario.janelas[0] === 8000 && v.linhas.length === 30;
})(), JSON.stringify(diario.janelas));
ok('mas AMPLIA quando o veículo é raro no fim da base', (function () {
  const grande = [];
  // O veículo raro só aparece no começo: a primeira janela não o alcança.
  for (let i = 0; i < 20000; i++) {
    grande.push(lanc(data(2026, 11, (i % 25) + 1), i < 50 ? 'RARO 1' : 'P' + (i % 170),
      50, 300, 'L' + i));
  }
  ctx.__lancamentos = grande;
  diario.janelas.length = 0;
  const v = ctx.historicoAbastecimentos_('RARO 1', 30);
  return diario.janelas.length === 2 && v.linhas.length === 30;
})(), JSON.stringify(diario.janelas));
// A janela procura `quantos + 1`, nao `quantos`. O mais antigo que VAI
// APARECER precisa do anterior a ele para ter percurso: parar com a conta
// exata deixaria a ultima linha da tela sempre sem KM percorrido — e sem
// erro nenhum, so um traco onde deveria haver numero.
ok('procura um a mais, para o mais antigo da tela ter percurso', (function () {
  const grande = [];
  for (let i = 0; i < 20000; i++) {
    grande.push(lanc(data(2026, 11, (i % 25) + 1), 'P' + (i % 170), 50, 300, 'L' + i));
  }
  // Exatamente 3 (= o limite pedido) na ultima janela de 8.000, e um quarto
  // antes dela. Com a folga, a janela amplia e o 4º da o percurso do 3º.
  grande[100] = lanc(data(2026, 11, 5), 'FOLGA 1', 100, 600, 'F-0');
  grande[12000] = lanc(data(2026, 11, 10), 'FOLGA 1', 100, 600, 'F-1');
  grande[15000] = lanc(data(2026, 11, 15), 'FOLGA 1', 100, 600, 'F-2');
  grande[18000] = lanc(data(2026, 11, 20), 'FOLGA 1', 100, 600, 'F-3');
  ctx.__lancamentos = grande;
  ctx.__odometro = [
    [data(2026, 11, 5), 'FOLGA 1', 100000],
    [data(2026, 11, 10), 'FOLGA 1', 101000],
    [data(2026, 11, 15), 'FOLGA 1', 102000],
    [data(2026, 11, 20), 'FOLGA 1', 103000],
  ];
  vm.runInContext('ODOMETRO_EXEC_CACHE_ = null; ODOMETRO_INDICE_EXEC_ = null;', ctx);
  diario.janelas.length = 0;
  const v = ctx.historicoAbastecimentos_('FOLGA 1', 3);
  // 3 linhas na tela (o 4º só serve de referência) e a mais antiga COM
  // percurso.
  return v.linhas.length === 3 && v.linhas[2].id === 'F-1' && v.linhas[2].percurso === 1000;
})(), 'traço onde deveria haver percurso não dá erro, só esconde a conta');
ok('e o rodapé conta o percurso dessa folga uma vez só', (function () {
  const v = ctx.historicoAbastecimentos_('FOLGA 1', 3);
  // 3 x 1.000: o do F-1 (contra o F-0, que não aparece) e os dois seguintes.
  return v.totais.abastecimentos === 3 && v.totais.percurso === 3000 &&
    v.totais.litros === 300;
})());
ok('e diz que o que mostrou é uma janela', (function () {
  return /janela dos lançamentos/.test(ctx.historicoAbastecimentos_('P5', 30).mensagem);
})());
montar();
ok('base pequena não é chamada de janela',
  !/janela/.test(ctx.historicoAbastecimentos_('AAA 0001', 30).mensagem));

console.log('\n4c. A última leitura vem junto, para a tela não pedir de novo');
montar();
const hh = ctx.historicoAbastecimentos_('AAA 0001', 30);
ok('o histórico traz a última leitura do odômetro',
  hh.ultimaLeitura && hh.ultimaLeitura.km === 101450,
  JSON.stringify(hh.ultimaLeitura));
ok('e é a MESMA que o endpoint antigo devolveria',
  JSON.stringify(hh.ultimaLeitura) === JSON.stringify(ctx.ultimoOdometro('AAA 0001')),
  JSON.stringify([hh.ultimaLeitura, ctx.ultimoOdometro('AAA 0001')]));
ok('veículo sem leitura devolve nulo, não erro',
  ctx.historicoAbastecimentos_('ZZZ 9999', 30).ultimaLeitura === null);

console.log('\n5. Estornar');
montar();
let r = ctx.webEstornarAbastecimento('t', 'LAN-2', 'odômetro digitado errado, refazer', 'AAA 0001');
ok('estorna', r.ok === true, JSON.stringify(r));
// Um caminho proprio de exclusao aqui perderia a copia em Excluidos, o lacre
// do periodo fechado e a devolucao dos litros ao tanque.
ok('passa pelo excluirLancamento_, não por um caminho próprio',
  diario.excluidos.length === 1 && diario.excluidos[0].id === 'LAN-2',
  JSON.stringify(diario.excluidos));
ok('a justificativa vai junto',
  /odômetro digitado errado/.test(diario.excluidos[0].motivo), diario.excluidos[0].motivo);
ok('devolve o histórico JÁ sem a linha estornada',
  r.historico && r.historico.linhas.length === 3 &&
  !r.historico.linhas.some(function (l) { return l.id === 'LAN-2'; }),
  JSON.stringify((r.historico || {}).linhas || []));
ok('e do veículo certo', r.historico.placa === 'AAA 0001', r.historico.placa);

montar();
r = ctx.webEstornarAbastecimento('t', 'LAN-2', 'erro', 'AAA 0001');
ok('justificativa curta é recusada pelo mesmo caminho', r.ok === false, JSON.stringify(r));
ok('e nada é estornado',
  ctx.historicoAbastecimentos_('AAA 0001', 30).linhas.length === 4);
ok('o histórico não vem junto quando falha', r.historico === undefined);

console.log('\n6. As duas pontas, tela e servidor');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
const app = fs.readFileSync('App.html', 'utf8');
ok('o estorno é só para quem pode gravar',
  /function webEstornarAbastecimento[\s\S]{0,160}autorizarContextoWeb_\(token, \['OPERADOR', 'ADMIN'\]\)/.test(fonte));
ok('a tela esconde os botões de quem não pode',
  /\['OPERADOR', 'ADMIN'\]\.indexOf\(SESSAO\.perfil\) !== -1;/.test(app),
  'botão que o servidor recusa parece defeito');
ok('o painel abre sozinho quando o KM digitado é menor',
  /function avaliarKmDigitado[\s\S]{0,400}km >= Number\(ULTIMO_ODOMETRO\.km/.test(app),
  'era só a caixinha "forçar", e forçar quase sempre é a escolha errada');
// Com 'input' o painel abriria a cada tecla: digitar 3 de 31.500 e menor que
// o ultimo por um instante.
ok('mas no change, não a cada tecla',
  /el\('km'\)\.addEventListener\('change', avaliarKmDigitado\)/.test(app));
ok('e há um botão para abrir o painel a qualquer momento',
  /abrirHistoricoAbastecimento\(\)/.test(app));
ok('a alteração de KM usa o ajuste que já existia, com a referência estável',
  /webAjustarOdometro\(TOKEN, \{ placa: HIST_ABAST\.placa, data: l\.dataIso, km: l\.km \}/.test(app),
  'número de linha envelhece; placa + dia + valor não');
// As DUAS pontas da economia da V4.35: o servidor manda `ultimaLeitura`
// junto e a tela a aproveita. Provar so o servidor deixaria passar uma tela
// que continua pedindo de novo — a ida extra volta sem quebrar nada.
ok('o servidor manda a última leitura junto com o histórico',
  /ultimaLeitura: ultimaLeituraOdometro_\(alvo\)/.test(fonte));
ok('e a tela aproveita em vez de pedir outra vez',
  /function abrirHistoricoAbastecimento[\s\S]{0,900}h\.ultimaLeitura !== undefined[\s\S]{0,120}ULTIMO_ODOMETRO = h\.ultimaLeitura/
    .test(app),
  'cada google.script.run relê a planilha do zero: a ida extra custa mais que a conta');
const trechoEstorno = app.slice(app.indexOf('function estornarAbastecimento'),
                                app.indexOf('function avisoHistorico'));
ok('e nem o estorno volta ao servidor só pela dica',
  /r\.ok && r\.historico/.test(trechoEstorno) && !/consultarOdometro\(\)/.test(trechoEstorno),
  'o histórico que acabou de voltar já atualizou a dica');
ok('linha sem leitura não oferece "alterar KM"',
  /l\.km === null \? '<span class="sub2">sem leitura<\/span>'/.test(app),
  'alterar o que não existe devolveria erro e pareceria defeito');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
