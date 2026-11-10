/**
 * Prova do combustível por loja (V4.36).
 *
 * Pedido do usuário: nas lojas 01 a 19 e nos CB01 a CB10 o veículo não lança
 * combustível — ele fica na loja e abastece por conta dela, fora do sistema de
 * frota.
 *
 * O que se guarda aqui são os TRÊS lados do mesmo contrato, que é onde este
 * projeto erra desde o começo:
 *   1. o servidor RECUSA o lançamento (tela escondida continua alcançável);
 *   2. a tela não oferece o que o servidor recusa (senão é promessa falsa);
 *   3. o km/l da frota não conta o KM de quem não abastece pelo sistema —
 *      esse é o lado silencioso: ninguém vê, e a média sobe sozinha.
 *
 * E o quarto, que não é do contrato mas derruba instalação: coluna nova tem de
 * ser opcional. Planilha que ainda não rodou o Instalar não pode mudar de
 * comportamento.
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
    centroSemCombustivelPorPadrao_, centroPermiteCombustivel_, veiculoPermiteCombustivel_,
    textoPermite_, dadosCentrosExecucao_, definirCombustivelDoCentro_,
    preencherCombustivelDosCentros_, salvarLancamento_, webContextoLancamento,
    COL_CENTRO, TOTAL_COL_CENTRO, R_,
  });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoOperacional_ = function () {};
  exigirPerfilToken_ = function () {};
  autorizarContextoWeb_ = function () {};
  registrarLog_ = function () {};
  invalidarCacheInicio_ = function () {};
  atualizarResumoSeguro_ = function () {};
  garantirCapacidadeLancamentos_ = function () {};
  garantirLinhas_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-11' : ''; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26, 0, 0, 0, 0),
                                         fim: new Date(2026, 10, 25, 23, 59, 59, 999) }; };
  periodoDoMes_ = function () { return periodoAtual_(); };
  resolverVeiculo_ = function (p) {
    const alvo = normalizaPlaca_(p);
    const achado = __veiculos[alvo];
    if (!achado) return { ok: false, mensagem: 'Veículo não encontrado.' };
    return { ok: true, veiculo: { placa: alvo, ativo: true } };
  };
  classificacaoVeiculoAtual_ = function (p) {
    return { centro: __veiculos[normalizaPlaca_(p)] || '', categoria: 'Truck Normal' };
  };
  ultimaLeituraOdometro_ = function () { return null; };
  lerLancamentos_ = function () { return []; };
  novoIdLancamento_ = function () { return 'LAN-1'; };
  // O caminho FELIZ do salvarLancamento_ continua para dentro (duplicidade,
  // tanque, Resumo). Aqui o que se prova e a RECUSA; os dubles abaixo cortam o
  // resto para a prova nao virar uma copia da planilha inteira.
  localizarDuplicidadeLancamento_ = function () { return null; };
  estadoTanque_ = function () { return { litros: 0, valor: 0, custoMedio: 0, precoLitro: 0,
    diferencaValorizacao: 0, litrosSemLastro: 0 }; };
  gravarLinhaLancamento_ = function () { return { ok: true }; };
  registrarPendenciasDoLancamento_ = function () {};
  ss_ = function () { return { getSheetByName: function () { return null; } }; };
  proximaLinhaLancamento_ = function () { return 2; };
  aba_ = function (nome) {
    // O limite de colunas vale so para a aba Centros, que e a do campo novo.
    // Aplica-lo a Lancamentos faria a gravacao quebrar por um motivo que nao
    // tem nada a ver com o que se prova aqui.
    const limite = nome === ABAS.CENTROS ? __colunas : 99;
    return {
      getLastRow: function () { return __centros.length + 1; },
      getMaxRows: function () { return __centros.length + 1; },
      getMaxColumns: function () { return limite; },
      getRange: function (linha, coluna, nL, nC) {
        // O Sheets LANCA quando o intervalo passa da ultima coluna da aba. Sem
        // isso o duble aceitaria pedir a coluna 4 de uma planilha que so tem
        // 3 — que e exatamente a instalacao que ainda nao rodou o Instalar.
        if (coluna + (nC || 1) - 1 > limite) {
          throw new Error('The number of columns in the range must be at least 1');
        }
        return {
          getValues: function () {
            const saida = [];
            for (let i = 0; i < (nL || 1); i++) {
              const l = __centros[linha - 2 + i] || [];
              saida.push(l.slice(coluna - 1, coluna - 1 + (nC || 1)));
            }
            return saida;
          },
          setValues: function (vals) {
            vals.forEach(function (l, i) {
              const alvo = linha - 2 + i;
              if (!__centros[alvo]) __centros[alvo] = [];
              l.forEach(function (v, j) { __centros[alvo][coluna - 1 + j] = v; });
            });
            return this;
          },
          setValue: function (v) {
            const alvo = linha - 2;
            if (!__centros[alvo]) __centros[alvo] = [];
            __centros[alvo][coluna - 1] = v;
            return this;
          },
          setNumberFormat: function () { return this; },
        };
      },
    };
  };
`, ctx);

function montar(colunas) {
  ctx.__colunas = colunas === undefined ? 4 : colunas;
  ctx.__centros = [
    ['DEPOSITO', 0.5, 'SIM', 'SIM'],
    ['LOJA 01', 0.1, 'SIM', 'NAO'],
    ['LOJA 20', 0.1, 'SIM', 'SIM'],
    ['CB05', 0.1, 'SIM', 'NAO'],
  ];
  ctx.__veiculos = { 'ABC1D23': 'DEPOSITO', 'XYZ9W88': 'LOJA 01', 'QQQ1A11': 'CB05' };
  vm.runInContext('CENTROS_EXEC_CACHE_ = null; CENTROS_COMBUSTIVEL_EXEC_ = null;', ctx);
}

console.log('\n1. Quem nasce bloqueado, lido do número e não do texto');
// "Loja 01", "LOJA 1 — Tubarão" e "01" são a mesma loja escrita de três
// jeitos: comparar texto erraria nos três.
[['Loja 01', true], ['LOJA 1 - Tubarão', true], ['01', true], ['Loja 19', true],
 ['loja 9', true], ['CB01', true], ['CB 10', true], ['Cb05', true],
 ['Loja 20', false], ['LOJA 21', false], ['CB11', false], ['CB 0', false],
 ['DEPÓSITO', false], ['ADM Central', false], ['Loja Matriz', false],
].forEach(function (par) {
  ok('"' + par[0] + '" ' + (par[1] ? 'nasce sem combustível' : 'nasce normal'),
    ctx.centroSemCombustivelPorPadrao_(par[0]) === par[1]);
});

console.log('\n2. Célula vazia é SIM: coluna nova não muda o que já funcionava');
montar(3);                      // planilha que ainda não rodou o Instalar
ctx.__centros.forEach(function (l) { l.length = 3; });
vm.runInContext('CENTROS_EXEC_CACHE_ = null; CENTROS_COMBUSTIVEL_EXEC_ = null;', ctx);
// Sem o try, um erro aqui MATA a suíte em vez de reprovar — e suíte morta
// não produz FALHA nenhuma, o que lida de longe parece aprovação.
function semEstourar(fn) {
  try { return { ok: true, valor: fn() }; } catch (e) { return { ok: false, erro: e.message }; }
}
const leitura = semEstourar(function () { return ctx.dadosCentrosExecucao_(); });
ok('a leitura não estoura pedindo coluna que não existe', leitura.ok, leitura.erro);
const permiteSemColuna = semEstourar(function () { return ctx.centroPermiteCombustivel_('LOJA 01'); });
ok('sem a coluna, toda loja lança combustível',
  permiteSemColuna.ok && permiteSemColuna.valor === true,
  permiteSemColuna.erro || 'instalação antiga não pode mudar de comportamento sozinha');
[['', true], ['SIM', true], ['sim', true], ['NAO', false], ['não', false],
 ['NÃO', false], ['N', false], ['0', false], ['qualquer coisa', true],
].forEach(function (par) {
  ok('"' + par[0] + '" => ' + (par[1] ? 'lança' : 'não lança'),
    ctx.textoPermite_(par[0]) === par[1]);
});

console.log('\n3. O servidor recusa — é o lado que vale');
montar();
let r = ctx.salvarLancamento_({
  placa: 'XYZ9W88', tipo: 'Combustivel Terceiros', data: '2026-11-10',
  valor: 500, litros: 80, documento: 'NF 1',
});
ok('loja 01 não lança combustível', r.ok === false, r.mensagem);
ok('e a mensagem diz qual loja e como liberar',
  /LOJA 01/.test(r.mensagem) && /Centros de custo/.test(r.mensagem), r.mensagem);
r = ctx.salvarLancamento_({
  placa: 'QQQ1A11', tipo: 'Combustivel Proprio', data: '2026-11-10',
  valor: 500, litros: 80, documento: 'NF 2',
});
ok('CB05 também não', r.ok === false, r.mensagem);
// A recusa é do COMBUSTÍVEL, não do veículo: a loja continua tendo oficina,
// pneu e pedágio. Bloquear tudo seria tirar o veículo do sistema.
r = ctx.salvarLancamento_({
  placa: 'XYZ9W88', tipo: 'Pneus', data: '2026-11-10', valor: 500, documento: 'NF 3',
});
ok('mas as outras despesas da mesma loja passam', r.ok !== false,
  r.mensagem || 'bloquear tudo seria tirar o veículo do sistema');
r = ctx.salvarLancamento_({
  placa: 'ABC1D23', tipo: 'Combustivel Terceiros', data: '2026-11-10',
  valor: 500, litros: 80, documento: 'NF 4',
});
ok('e o veículo do DEPOSITO abastece normalmente', r.ok !== false, r.mensagem);

console.log('\n4. A tela sabe antes de a pessoa preencher');
const ctxTela = ctx.webContextoLancamento('T', 'XYZ9W88');
ok('o contexto do lançamento diz que a loja não lança',
  ctxTela.permiteCombustivel === false && ctxTela.centro === 'LOJA 01',
  JSON.stringify(ctxTela));
ok('e vem na MESMA ida da última leitura',
  Object.prototype.hasOwnProperty.call(ctxTela, 'ultimaLeitura'),
  'duas idas seriam duas execuções novas do Apps Script');
ok('veículo desconhecido não bloqueia nada',
  ctx.webContextoLancamento('T', 'NAO EXISTE').permiteCombustivel === true,
  'bloquear o que não se conhece esconde erro de cadastro');

console.log('\n5. Ligar e desligar pela tela de lojas');
montar();
r = ctx.definirCombustivelDoCentro_('LOJA 01', true);
ok('liberou', r.ok === true, r.mensagem);
ok('e passou a valer na hora', ctx.centroPermiteCombustivel_('LOJA 01') === true);
ok('o lançamento que era recusado passa', ctx.salvarLancamento_({
  placa: 'XYZ9W88', tipo: 'Combustivel Terceiros', data: '2026-11-10',
  valor: 500, litros: 80, documento: 'NF 5',
}).ok !== false, 'cache não invalidado deixaria a tela mentindo até a próxima execução');
r = ctx.definirCombustivelDoCentro_('LOJA 01', false);
ok('e volta a bloquear', r.ok === true && ctx.centroPermiteCombustivel_('LOJA 01') === false);
ok('loja que não existe é recusada com nome',
  ctx.definirCombustivelDoCentro_('LOJA 99', false).ok === false);

console.log('\n6. O Instalar preenche, mas não atropela quem já decidiu');
montar();
ctx.__centros[0][3] = '';       // DEPOSITO sem decisão
ctx.__centros[1][3] = 'SIM';    // LOJA 01 liberada POR EXCEÇÃO, à mão
ctx.__centros[3][3] = '';       // CB05 sem decisão
vm.runInContext('CENTROS_EXEC_CACHE_ = null; CENTROS_COMBUSTIVEL_EXEC_ = null;', ctx);
const preenchidos = ctx.preencherCombustivelDosCentros_();
ok('preencheu só as vazias', preenchidos === 2, String(preenchidos));
ok('DEPOSITO ficou liberado', ctx.__centros[0][3] === 'SIM');
ok('CB05 nasceu bloqueado', ctx.__centros[3][3] === 'NAO');
ok('e a LOJA 01 liberada à mão CONTINUA liberada', ctx.__centros[1][3] === 'SIM',
  'o Instalar roda a cada versão: sobrescrever aqui desfaz a decisão do usuário toda vez');

console.log('\n7. O km/l não conta o KM de quem não abastece pelo sistema');
// É o lado silencioso. O veículo roda e abastece por fora: contar o KM com
// zero litro faz a média da frota subir sozinha e descrever uma frota que não
// existe. O KM continua no total e no R$/km, que são contas de outra coisa.
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ok('existe um divisor separado para o km/l',
  /kmCombustivel/.test(fonte) &&
  /kmLitro: totais\.litros > 0 \? totais\.kmCombustivel \/ totais\.litros/.test(fonte));
ok('e o grupo de frota usa o mesmo critério',
  /kmLitro: g\.litros > 0 \? g\.kmCombustivel \/ g\.litros/.test(fonte),
  'frota e grupo com critérios diferentes param de fechar entre si');
ok('o KM total continua inteiro',
  /totais\.km \+= Number\(linha\[R_\.KM\]\) \|\| 0;/.test(fonte),
  'R$/km é outra conta: o veículo rodou de verdade');

console.log('\n8. As duas pontas da tela');
const app = fs.readFileSync('App.html', 'utf8');
ok('a tela de lançamento pergunta pela loja ao trocar de veículo',
  /webContextoLancamento\(TOKEN, el\('placa'\)\.value\)/.test(app));
ok('e tira os tipos de combustível da lista',
  /permite \|\| combustiveis\.indexOf\(t\) === -1/.test(app),
  'deixar na tela o que o servidor recusa é promessa falsa');
ok('dizendo por quê, com o nome da loja',
  /não \' \+\s*\'lança combustível/.test(app) || /não <\/b>/.test(app) ||
  /lança combustível: o veículo abastece por conta dela/.test(app));
ok('a tela de lojas mostra a coluna',
  /<th class="num">Combustível<\/th>/.test(app));
ok('e deixa o ADMIN ligar e desligar',
  /webCentroCombustivel\(TOKEN, item\.centro, !bloquear\)/.test(app));
ok('gravando na hora, não no botão de salvar rateio',
  /Combustível NÃO é por competência/.test(app),
  'o percentual é por competência; abastecer ou não é de hoje');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
