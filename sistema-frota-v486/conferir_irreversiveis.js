/**
 * Prova dos caminhos IRREVERSÍVEIS do sistema.
 *
 * Fechar o período, excluir um veículo, corrigir um lançamento e ajustar o
 * estoque da bomba são as quatro operações que não têm "desfazer" pela tela.
 * Estavam sem teste desde sempre — a auditoria apontou isso três vezes.
 *
 * O que se prova aqui NÃO é o resultado bonito: é o que cada uma RECUSA, e
 * que ao recusar ela não deixa meio caminho andado. Um fechamento que grava
 * a competência nova e falha na exportação é pior que um fechamento que não
 * acontece: ninguém percebe, e o mês seguinte abre em cima de uma base que
 * não foi fotografada.
 *
 * Por isso quase toda prova aqui olha o RASTRO — a ordem das operações — e
 * não só o valor devolvido.
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

const rastro = [];
function anotar(x) { rastro.push(x); return x; }

// ---------------------------------------------------------- dublê de aba
function novaAba(linhas) {
  const aba = {
    linhas: linhas,
    apagadas: [],
    getLastRow: function () { return aba.linhas.length + 1; },
    deleteRow: function (n) { aba.apagadas.push(n); aba.linhas.splice(n - 2, 1); },
    getRange: function (linha, coluna, nL, nC) {
      nL = nL || 1; nC = nC || 1;
      return {
        getValues: function () {
          const saida = [];
          for (let i = 0; i < nL; i++) {
            const l = aba.linhas[linha - 2 + i] || [];
            saida.push(l.slice(coluna - 1, coluna - 1 + nC));
          }
          return saida;
        },
        setValues: function (v) {
          if (v.length !== nL) throw new Error('setValues: linhas fora do intervalo');
          v.forEach(function (lv, i) {
            if (lv.length !== nC) throw new Error('setValues: colunas fora do intervalo');
            const destino = aba.linhas[linha - 2 + i] || (aba.linhas[linha - 2 + i] = []);
            lv.forEach(function (x, j) { destino[coluna - 1 + j] = x; });
          });
        },
        setValue: function (x) { anotar('setValue'); return this; },
        setNumberFormat: function () { return this; },
      };
    },
  };
  return aba;
}

const ABASFAKE = {};
let lockLivre = true;

const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: {
    getUuid: () => 'uuid',
    formatDate: function (d, _tz, padrao) {
      const p = n => ('0' + n).slice(-2);
      if (padrao === 'yyyy-MM-dd') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => lockLivre, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { executarFechamentoCritico_, webFecharPeriodo, excluirVeiculo_,
    webExcluirVeiculo, webAjustarEstoqueBomba, MIN_JUSTIFICATIVA_, PRODUTOS_BOMBA,
    L_, COL_VEIC, ABAS });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  autorizarContextoWeb_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  emailContextoAtual_ = function () { return 'fulano@giassi.com.br'; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? __mesAberto : ''; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoDoMes_ = function () { return { inicio: new Date(2026, 9, 26), fim: new Date(2026, 10, 25) }; };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26), fim: new Date(2026, 10, 25) }; };
  nomeDoMes_ = function (m) { return 'mês ' + m; };
  proximoMes_ = function () { return '2026-11'; };
  aba_ = function (nome) { return __aba(nome); };
  ss_ = function () { return { getSheetByName: function (n) { return __aba(n); } }; };

  // --- tudo que o fechamento aciona vira rastro
  validarFechamentoCompleto_ = function () { __anotar('validar'); return __validacao; };
  reconstruirRelatorios_ = function () { __anotar('reconstruir'); };
  totalGeralResumo_ = function () { __anotar('total'); return 894859.11; };
  criarBackupSistema_ = function () { __anotar('backup'); return { nome: 'bk' }; };
  exportarPeriodoPlanilha_ = function () { __anotar('exportacao'); return __exportacao(); };
  congelarResumo_ = function () { __anotar('congelar'); };
  gravarHistorico_ = function () { __anotar('historico'); };
  gravarParam_ = function (n, v) { __anotar('gravarParam:' + n + '=' + v); if (n === 'MES_REFERENCIA') __mesAberto = v; };
  escreverConferencia_ = function () { __anotar('conferencia'); };
  coletarProblemas_ = function () { return []; };
  invalidarCacheInicio_ = function () {};
  periodoLivreAtivo_ = function () { return null; };
  registrarLog_ = function (a) { __anotar('log:' + a); };
  atualizarResumoSeguro_ = function () { __anotar('resumo'); };
  garantirLinhas_ = function () {};

  // --- exclusão de veículo
  resolverVeiculo_ = function (p) { return __resolver(p); };
  lerLancamentos_ = function () { return __lancamentos; };
  excluirLancamento_ = function (id) { __anotar('excluirLancamento:' + id); return { ok: true }; };
  invalidarCacheLancamentos_ = function () {};
  invalidarCacheOdometro_ = function () { __anotar('invalidarOdometro'); };

  // --- bomba: o caminho feliz precisa existir, senao tirar uma guarda so
  // faz o teste estourar — e um teste que estoura nao distingue "pegou o
  // defeito" de "o arquivo nao compila".
  estadoTanque_ = function () { return { litros: 1000, custoMedio: 6.1 }; };
  finalizarCorrecaoBomba_ = function () { __anotar('finalizarBomba'); return ''; };
`, ctx);

// Date criado FORA do vm não passa no `instanceof Date` de dentro — e aqui
// isso não deixava a fixture vazia, DESLIGAVA uma guarda: o lançamento caía
// no ramo `!(data instanceof Date)` e passava por "período fechado" sem
// nunca ter sido comparado com data nenhuma. A fábrica roda dentro do vm.
const data = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); })', ctx);

ctx.__anotar = anotar;
ctx.__aba = function (nome) { return ABASFAKE[nome]; };
ctx.__mesAberto = '2026-10';
ctx.__validacao = { ok: true };
ctx.__exportacao = function () { return { nome: 'export' }; };
ctx.__lancamentos = [];
ctx.__resolver = function () { return { ok: true, veiculo: { placa: 'ABC 1D23' } }; };

function zerar() {
  rastro.length = 0;
  lockLivre = true;
  ctx.__mesAberto = '2026-10';
  ctx.__validacao = { ok: true };
  ctx.__exportacao = function () { return { nome: 'export' }; };
  ctx.__lancamentos = [];
  ABASFAKE[ctx.ABAS.ODOMETRO] = novaAba([]);
  ABASFAKE[ctx.ABAS.CARGA_BOMBA] = novaAba([]);
  // O alvo NAO e a primeira linha: com ele em cima, apagar "a primeira" e
  // apagar "a que casa" dao no mesmo, e a prova nao distingue as duas.
  ABASFAKE[ctx.ABAS.VEICULOS] = novaAba([['XYZ 9K88'], ['ABC 1D23'], ['KLM 7P11']]);
}
function antes(a, b) {
  const ia = rastro.findIndex(function (x) { return x.indexOf(a) === 0; });
  const ib = rastro.findIndex(function (x) { return x.indexOf(b) === 0; });
  return ia !== -1 && ib !== -1 && ia < ib;
}
function tem(p) { return rastro.some(function (x) { return x.indexOf(p) === 0; }); }

// ============================================================ 1. FECHAMENTO
console.log('\n1. Fechar período: a confirmação');
zerar();
let r = ctx.webFecharPeriodo('token', '2026-09');
ok('competência digitada errada não fecha', r.ok === false, JSON.stringify(r));
ok('e nada foi acionado', rastro.length === 0, rastro.join(' → '));
zerar();
r = ctx.webFecharPeriodo('token', '');
ok('confirmação vazia também não', r.ok === false && rastro.length === 0);
zerar();
r = ctx.webFecharPeriodo('token', ' 2026-10 ');
ok('espaço em volta não atrapalha quem digitou certo', r.ok === true, JSON.stringify(r));

console.log('\n2. A ordem das operações irreversíveis');
zerar();
ctx.executarFechamentoCritico_('2026-10');
ok('valida antes de qualquer escrita', antes('validar', 'backup'), rastro.join(' → '));
ok('o backup vem antes da exportação', antes('backup', 'exportacao'));
// Se a competência avançasse antes da fotografia, um erro na exportação
// deixaria o mês aberto novo sobre uma base nunca fotografada.
ok('a fotografia do período vem ANTES de avançar a competência',
  antes('exportacao', 'gravarParam:MES_REFERENCIA'), rastro.join(' → '));
ok('o Resumo é congelado antes de avançar a competência',
  antes('congelar', 'gravarParam:MES_REFERENCIA'),
  'congelar depois congelaria o mês errado');
ok('o Histórico é gravado antes de avançar',
  antes('historico', 'gravarParam:MES_REFERENCIA'));
ok('e a competência vira a seguinte', ctx.__mesAberto === '2026-11', ctx.__mesAberto);

console.log('\n3. O que bloqueia o fechamento');
zerar();
ctx.__validacao = { ok: false, mensagem: 'Regularize a depreciação mensal.' };
r = ctx.executarFechamentoCritico_('2026-10');
ok('validação reprovada devolve a mensagem dela', r.ok === false && /depreciação/.test(r.mensagem));
ok('não cria backup', !tem('backup'), rastro.join(' → '));
ok('não exporta', !tem('exportacao'));
ok('não congela o Resumo', !tem('congelar'));
ok('não avança a competência',
  !tem('gravarParam:MES_REFERENCIA') && ctx.__mesAberto === '2026-10');

zerar();
ctx.__mesAberto = '2026-11';          // outra aba fechou enquanto esta pensava
r = ctx.executarFechamentoCritico_('2026-10');
ok('competência que mudou no meio do caminho não fecha', r.ok === false,
  JSON.stringify(r));
ok('e nem chega a validar', !tem('validar'), rastro.join(' → '));

zerar();
lockLivre = false;
r = ctx.executarFechamentoCritico_('2026-10');
ok('sem a trava, não fecha', r.ok === false && rastro.length === 0, rastro.join(' → '));
lockLivre = true;

console.log('\n4. Quando a fotografia do período falha');
// É o ponto mais perigoso: o backup já foi feito, e se a competência
// avançasse o mês seguinte abriria sobre uma base não fotografada.
zerar();
ctx.__exportacao = function () { throw new Error('Drive indisponível'); };
let erro = null;
try { ctx.executarFechamentoCritico_('2026-10'); } catch (e) { erro = e; }
ok('o erro sobe, em vez de "fechado com sucesso"', !!erro && /Drive/.test(erro.message),
  erro ? erro.message : 'nenhum erro');
ok('a competência NÃO avança', ctx.__mesAberto === '2026-10', ctx.__mesAberto);
ok('o Resumo não é congelado', !tem('congelar'), rastro.join(' → '));
ok('e o Histórico não é gravado', !tem('historico'));

// ====================================================== 5. EXCLUIR VEÍCULO
console.log('\n5. Excluir veículo: justificativa');
zerar();
r = ctx.excluirVeiculo_('ABC 1D23', 'erro', true);
ok('justificativa curta não exclui', r.ok === false && /justificativa/.test(r.mensagem));
ok('nada foi tocado', rastro.length === 0 && ABASFAKE[ctx.ABAS.VEICULOS].apagadas.length === 0);

const MOTIVO = 'veículo devolvido ao leasing em outubro';

console.log('\n6. O lacre do histórico tem dois lados');
// Lançamento fechado E leitura de KM fechada. Olhar só um lado foi o defeito
// que mais voltou neste projeto.
zerar();
const fechado = []; fechado[ctx.L_.PLACA] = 'ABC 1D23';
fechado[ctx.L_.DATA] = data(2026, 9, 10); fechado[ctx.L_.ID] = 'LAN-1';
ctx.__lancamentos = [fechado];
r = ctx.excluirVeiculo_('ABC 1D23', MOTIVO, true);
ok('lançamento em período fechado barra a exclusão', r.ok === false && r.temHistorico === true);
ok('e a mensagem oferece a saída certa (INATIVO)', /INATIVO/.test(r.mensagem), r.mensagem);
ok('nenhum lançamento foi excluído', !tem('excluirLancamento'), rastro.join(' → '));
ok('o veículo continua no cadastro', ABASFAKE[ctx.ABAS.VEICULOS].apagadas.length === 0);

zerar();
ABASFAKE[ctx.ABAS.ODOMETRO] = novaAba([[data(2026, 9, 10), 'ABC 1D23', 50000]]);
r = ctx.excluirVeiculo_('ABC 1D23', MOTIVO, true);
ok('só a leitura de KM fechada também barra', r.ok === false && r.temHistorico === true,
  JSON.stringify(r));
ok('e fala em leitura de KM, não em lançamento', /leitura\(s\) de KM/.test(r.mensagem), r.mensagem);
ok('o veículo continua no cadastro', ABASFAKE[ctx.ABAS.VEICULOS].apagadas.length === 0);

console.log('\n7. Lançamento no período aberto pede confirmação');
zerar();
const aberto = []; aberto[ctx.L_.PLACA] = 'ABC 1D23';
aberto[ctx.L_.DATA] = data(2026, 10, 30); aberto[ctx.L_.ID] = 'LAN-2';
ctx.__lancamentos = [aberto];
r = ctx.excluirVeiculo_('ABC 1D23', MOTIVO, false);
ok('sem confirmar, não exclui', r.ok === false && r.precisaConfirmarLancamentos === true);
ok('e diz quantos são', r.quantidade === 1, JSON.stringify(r));
ok('nenhum lançamento foi excluído', !tem('excluirLancamento'));

zerar();
ctx.__lancamentos = [aberto];
ABASFAKE[ctx.ABAS.ODOMETRO] = novaAba([[data(2026, 10, 30), 'ABC 1D23', 51000],
                                       [data(2026, 10, 30), 'XYZ 9K88', 9000]]);
r = ctx.excluirVeiculo_('ABC 1D23', MOTIVO, true);
ok('confirmando, exclui', r.ok === true, JSON.stringify(r));
ok('o lançamento sai antes do veículo', antes('excluirLancamento', 'log:Excluir veículo'),
  rastro.join(' → '));
ok('a leitura de KM do veículo sai', ABASFAKE[ctx.ABAS.ODOMETRO].apagadas.length === 1);
ok('a do outro veículo fica',
  ABASFAKE[ctx.ABAS.ODOMETRO].linhas.length === 1 &&
  ABASFAKE[ctx.ABAS.ODOMETRO].linhas[0][1] === 'XYZ 9K88',
  JSON.stringify(ABASFAKE[ctx.ABAS.ODOMETRO].linhas));
ok('a linha do veículo sai do cadastro, e só ela',
  ABASFAKE[ctx.ABAS.VEICULOS].linhas.map(function (l) { return l[0]; }).join(',') ===
  'XYZ 9K88,KLM 7P11',
  JSON.stringify(ABASFAKE[ctx.ABAS.VEICULOS].linhas));
ok('fica registrado no Log com o motivo', tem('log:Excluir veículo'));

console.log('\n8. Veículo que não existe');
zerar();
ctx.__resolver = function () { return { ok: false, mensagem: 'Veículo não encontrado.' }; };
r = ctx.excluirVeiculo_('NAO EXISTE', MOTIVO, true);
ok('recusa sem tocar em nada', r.ok === false && rastro.length === 0, rastro.join(' → '));
ctx.__resolver = function () { return { ok: true, veiculo: { placa: 'ABC 1D23' } }; };

zerar();
lockLivre = false;
r = ctx.excluirVeiculo_('ABC 1D23', MOTIVO, true);
ok('sem a trava, não exclui', r.ok === false && rastro.length === 0);
lockLivre = true;

// ================================================== 9. AJUSTE DA BOMBA
console.log('\n9. Ajuste de estoque da bomba');
zerar();
r = ctx.webAjustarEstoqueBomba('token', 'DIESEL S10', 100, '2026-10-20', 'erro');
ok('justificativa curta não ajusta', r.ok === false && /justificativa/i.test(r.mensagem));
r = ctx.webAjustarEstoqueBomba('token', 'GASOLINA', 100, '2026-10-20', MOTIVO);
ok('produto que não é da bomba não ajusta', r.ok === false && /Produto inválido/.test(r.mensagem));
r = ctx.webAjustarEstoqueBomba('token', ctx.PRODUTOS_BOMBA[0], -1, '2026-10-20', MOTIVO);
ok('saldo negativo não ajusta', r.ok === false && /saldo real/.test(r.mensagem), JSON.stringify(r));
r = ctx.webAjustarEstoqueBomba('token', ctx.PRODUTOS_BOMBA[0], 'abc', '2026-10-20', MOTIVO);
ok('saldo que não é número não ajusta', r.ok === false);
ok('nenhuma das recusas escreveu', rastro.length === 0, rastro.join(' → '));

// Com o caminho feliz disponível, tirar uma guarda produz um AJUSTE — e é
// isso que as provas acima têm de reprovar, não um erro de execução.
zerar();
ABASFAKE[ctx.ABAS.CARGA_BOMBA] = novaAba([]);
r = ctx.webAjustarEstoqueBomba('token', ctx.PRODUTOS_BOMBA[0], 900, '2026-10-20', MOTIVO);
ok('saldo medido válido ajusta de verdade', r.ok === true && /900/.test(r.mensagem),
  JSON.stringify(r));
ok('e grava a linha de ajuste na aba da bomba',
  ABASFAKE[ctx.ABAS.CARGA_BOMBA].linhas.length === 1,
  JSON.stringify(ABASFAKE[ctx.ABAS.CARGA_BOMBA].linhas));
ok('a diferença lançada é medido menos sistema',
  ABASFAKE[ctx.ABAS.CARGA_BOMBA].linhas[0][3] === -100,
  JSON.stringify(ABASFAKE[ctx.ABAS.CARGA_BOMBA].linhas[0]));
zerar();
ABASFAKE[ctx.ABAS.CARGA_BOMBA] = novaAba([]);
r = ctx.webAjustarEstoqueBomba('token', ctx.PRODUTOS_BOMBA[0], 1000, '2026-10-20', MOTIVO);
ok('saldo igual ao do sistema não lança nada',
  r.ok === true && /Nada a ajustar/.test(r.mensagem) &&
  ABASFAKE[ctx.ABAS.CARGA_BOMBA].linhas.length === 0, JSON.stringify(r));

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
