/**
 * Prova da guarda de KM acima do normal.
 *
 * O usuário: *"algumas vezes está aparecendo KM muito alto do que o normal,
 * teria como colocar um aviso e pedir confirmação?"*
 *
 * O sistema já recusava KM **menor** que a leitura anterior desde o começo. O
 * lado de cima estava aberto, e é por onde entra o dígito a mais: digitar
 * 1.015.000 no lugar de 101.500 não volta — estraga o km/l e o R$/km daquele
 * veículo e da frota inteira, e só aparece no fechamento, quando ninguém
 * lembra mais do lançamento.
 *
 * O que se guarda aqui:
 *  - a conta é **km por dia** desde a leitura anterior, não o KM absoluto:
 *    400.000 é normal numa carreta e absurdo numa moto;
 *  - a referência é a **mediana** do próprio veículo, não a média — uma
 *    leitura errada multiplica a média e passa a autorizar o erro seguinte,
 *    ainda maior;
 *  - **o servidor recusa**, não só a tela avisa;
 *  - e há um piso, para o aviso não tocar sem motivo: aviso que toca à toa é
 *    aviso que a pessoa aprende a fechar sem ler.
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
    ritmoDoVeiculo_, avaliarPercursoAlto_, textoPercursoAlto_, salvarLancamento_,
    ajustarLeituraOdometro_, webContextoLancamento, vizinhosOdometro_,
    FATOR_KM_ALTO_, PISO_KM_DIA_, L_, TOTAL_COL_LANC,
  });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoOperacional_ = function () {};
  exigirPerfilToken_ = function () {};
  autorizarContextoWeb_ = function () {};
  registrarLog_ = function () {};
  invalidarCacheInicio_ = function () {};
  invalidarCacheOdometro_ = function () {};
  atualizarResumoSeguro_ = function () {};
  garantirCapacidadeLancamentos_ = function () {};
  garantirLinhas_ = function () {};
  registrarPendenciasDoLancamento_ = function () {};
  gravarOdometro_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-11' : ''; };
  paramOuPadrao_ = function (n, p) { return __params[n] === undefined ? p : __params[n]; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoAtual_ = function () { return { inicio: new Date(2026, 9, 26, 0, 0, 0, 0),
                                         fim: new Date(2026, 10, 25, 23, 59, 59, 999) }; };
  periodoDoMes_ = function () { return periodoAtual_(); };
  lerOdometro_ = function () { return __odo; };
  lerLancamentos_ = function () { return []; };
  localizarDuplicidadeLancamento_ = function () { return null; };
  estadoTanque_ = function () { return { litros: 0, valor: 0, custoMedio: 0, precoLitro: 0,
    diferencaValorizacao: 0, litrosSemLastro: 0 }; };
  ss_ = function () { return { getSheetByName: function () { return null; } }; };
  resolverVeiculo_ = function (p) {
    const alvo = normalizaPlaca_(p);
    return alvo ? { ok: true, veiculo: { placa: alvo, ativo: true } }
                : { ok: false, mensagem: 'Informe a placa.' };
  };
  classificacaoVeiculoAtual_ = function () { return { centro: 'DEPOSITO', categoria: 'Truck Normal' }; };
  centroPermiteCombustivel_ = function () { return true; };
  ultimaLeituraOdometro_ = function () { return null; };
  recusarLeituraDePeriodoFechado_ = function () { return ''; };
  localizarLeituraOdometro_ = function () { return { linha: 2, iguais: 1 }; };
  novoIdLancamento_ = function () { return 'LAN-1'; };
  proximaLinhaLancamento_ = function () { return 2; };
  gravarLinhaLancamento_ = function () { return { ok: true }; };
  aba_ = function () {
    return {
      getLastRow: function () { return __odo.length + 1; },
      getMaxRows: function () { return __odo.length + 1; },
      getRange: function (linha, coluna, nL, nC) {
        return {
          getValues: function () {
            const saida = [];
            for (let i = 0; i < (nL || 1); i++) {
              const l = __odo[linha - 2 + i] || [];
              saida.push(l.slice(coluna - 1, coluna - 1 + (nC || 1)));
            }
            return saida;
          },
          setValue: function (v) { __odo[linha - 2][coluna - 1] = v; return this; },
          setValues: function () { return this; },
          setNumberFormat: function () { return this; },
        };
      },
    };
  };
`, ctx);
ctx.__params = {};

const dia = vm.runInContext('(function (m, d) { return new Date(2026, m, d, 12, 0, 0, 0); })', ctx);

/** Caminhão de rota: ~400 km/dia, leitura a cada 2 dias. */
function montarCaminhao() {
  const linhas = [];
  let km = 100000;
  for (let i = 0; i < 10; i++) {
    // Novembro: as datas têm de cair DENTRO da competência aberta
    // (26/10 a 25/11), senão o que a prova mede é o corte de período.
    linhas.push([dia(10, 1 + i * 2), 'AAA 0001', km]);
    km += 800;                       // 800 km em 2 dias = 400 km/dia
  }
  ctx.__odo = linhas;
  vm.runInContext('ODOMETRO_EXEC_CACHE_ = null; ODOMETRO_INDICE_EXEC_ = null;', ctx);
  // O KM da ÚLTIMA leitura gravada (19/11), não o próximo da sequência: é
  // contra ele que o percurso se mede.
  return linhas[linhas.length - 1][2];
}

console.log('\n1. O ritmo normal sai da MEDIANA, não da média');
const ultimoKm = montarCaminhao();
let r = ctx.ritmoDoVeiculo_('AAA 0001');
ok('mediana de 400 km/dia', Math.abs(r.mediana - 400) < 0.001, String(r.mediana));
ok('com amostras suficientes', r.amostras >= 3, String(r.amostras));
// Uma leitura errada multiplica a MEDIA e passaria a autorizar o proximo
// erro, ainda maior. A mediana ignora o ponto fora da curva.
ok('uma leitura absurda no meio não move a mediana', (function () {
  const linhas = ctx.__odo.slice();
  // DENTRO da sequência, não antes dela: uma leitura absurda anterior a tudo
  // só produziria percurso negativo, que o cálculo já descarta — e a prova
  // não estaria exercitando nada.
  linhas.splice(5, 0, [dia(10, 10), 'AAA 0001', 9000000]);
  linhas.splice(6, 0, [dia(10, 11), 'AAA 0001', 104000]);
  ctx.__odo = linhas;
  vm.runInContext('ODOMETRO_EXEC_CACHE_ = null;', ctx);
  const m = ctx.ritmoDoVeiculo_('AAA 0001').mediana;
  montarCaminhao();
  return m < 2000;
})(), 'com média, um 9.000.000 no meio levaria o limite junto');

console.log('\n2. O dígito a mais é pego');
montarCaminhao();
const dataNova = dia(10, 21);
let a = ctx.avaliarPercursoAlto_('AAA 0001', ultimoKm * 10, dataNova);
ok('um zero a mais dispara', a.alto === true, JSON.stringify(a.kmPorDia));
ok('e a mensagem mostra a conta, não só "inválido"', (function () {
  const t = ctx.textoPercursoAlto_(a);
  return /km em/.test(t) && /km por dia/.test(t) && /dígito a mais/.test(t);
})(), ctx.textoPercursoAlto_(a));

console.log('\n3. O dia a dia normal NÃO dispara');
// 21/11 contra a última leitura, de 19/11: dois dias.
a = ctx.avaliarPercursoAlto_('AAA 0001', ultimoKm + 1600, dataNova);
ok('rodar o de sempre passa (800 km/dia)', a.alto === false, numBRdebug(a));
a = ctx.avaliarPercursoAlto_('AAA 0001', ultimoKm + 2000, dataNova);
ok('e um dia mais puxado também (1.000 km/dia)', a.alto === false,
  numBRdebug(a) + ' — limite é 3 x 400 = 1.200');
function numBRdebug(x) { return JSON.stringify({ kmDia: x.kmPorDia, limite: x.limite }); }
a = ctx.avaliarPercursoAlto_('AAA 0001', ultimoKm + 6000, dataNova);
ok('mas o triplo do normal dispara (3.000 km/dia)', a.alto === true, numBRdebug(a));

console.log('\n4. Veículo parado não vira alarme falso');
// Empilhadeira: 8 km/dia. Sem piso, uma ida a oficina (60 km) seria "7x o
// normal" — e aviso que toca a toa e aviso que a pessoa fecha sem ler.
ctx.__odo = [];
let kmE = 5000;
for (let i = 0; i < 8; i++) { ctx.__odo.push([dia(9, 1 + i), 'EMP 0001', kmE]); kmE += 8; }
vm.runInContext('ODOMETRO_EXEC_CACHE_ = null;', ctx);
ok('a mediana dela é baixa', ctx.ritmoDoVeiculo_('EMP 0001').mediana === 8);
ok('60 km num dia não dispara',
  ctx.avaliarPercursoAlto_('EMP 0001', kmE + 60, dia(9, 10)).alto === false,
  'o piso de ' + ctx.PISO_KM_DIA_ + ' km/dia existe para isto');
ok('mas 5.000 km num dia dispara',
  ctx.avaliarPercursoAlto_('EMP 0001', kmE + 5000, dia(9, 10)).alto === true);

console.log('\n5. Sem histórico, vale o teto do parâmetro');
ctx.__odo = [[dia(9, 1), 'NOVO 1', 1000]];
vm.runInContext('ODOMETRO_EXEC_CACHE_ = null;', ctx);
ok('uma leitura só não inventa um "normal"',
  ctx.ritmoDoVeiculo_('NOVO 1').amostras === 0,
  'transformar a primeira leitura em regra é pior que não ter regra');
ok('900 km num dia passa (abaixo do teto de 1.500)',
  ctx.avaliarPercursoAlto_('NOVO 1', 1900, dia(9, 2)).alto === false);
ok('e 5.000 km num dia não passa',
  ctx.avaliarPercursoAlto_('NOVO 1', 6000, dia(9, 2)).alto === true);
ok('o teto é parâmetro, não número cravado', (function () {
  ctx.__params.KM_DIA_MAXIMO = 300;
  const estreito = ctx.avaliarPercursoAlto_('NOVO 1', 1900, dia(9, 2)).alto;
  ctx.__params = {};
  return estreito === true;
})());
// O teto vale SEMPRE: veiculo de ritmo alto nao ganha licenca para o digito
// a mais.
ok('o teto vale mesmo para quem tem mediana alta', (function () {
  montarCaminhao();
  ctx.__params.KM_DIA_MAXIMO = 500;
  const r2 = ctx.avaliarPercursoAlto_('AAA 0001', ultimoKm + 2400, dia(10, 21));
  ctx.__params = {};
  return r2.alto === true;   // 2.400 km em 2 dias = 1.200 km/dia > teto 500
})());

console.log('\n6. Primeira leitura do veículo não tem contra o que medir');
ctx.__odo = [];
vm.runInContext('ODOMETRO_EXEC_CACHE_ = null;', ctx);
ok('sem leitura anterior, não dispara',
  ctx.avaliarPercursoAlto_('ZZZ 9999', 500000, dia(9, 2)).alto === false,
  'não há percurso para medir; acusar aqui seria acusar o cadastro novo');

console.log('\n7. O SERVIDOR recusa — é o lado que vale');
montarCaminhao();
let s = ctx.salvarLancamento_({
  placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-21',
  valor: 600, litros: 100, km: ultimoKm * 10, documento: 'NF 1',
});
ok('lançamento com KM absurdo é recusado', s.ok === false, s.mensagem);
ok('e a recusa explica a conta', /km por dia/.test(s.mensagem || ''), s.mensagem);
ok('e diz como confirmar',
  /confirmar KM acima do normal/.test(s.mensagem || ''), s.mensagem);
s = ctx.salvarLancamento_({
  placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-21',
  valor: 600, litros: 100, km: ultimoKm * 10, documento: 'NF 1',
  confirmarKmAlto: true,
});
ok('com a confirmação, passa', s.ok !== false, s.mensagem);
s = ctx.salvarLancamento_({
  placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-21',
  valor: 600, litros: 100, km: ultimoKm + 1600, documento: 'NF 2',
});
ok('e o KM normal não precisa de confirmação nenhuma', s.ok !== false, s.mensagem);
// O formulario da planilha e a Central tem "forcar" e nao tem a caixa nova.
// Sem isto ficariam sem saida — e as duas condicoes sao mutuamente
// exclusivas: um KM nao pode ser ao mesmo tempo MENOR que a leitura anterior
// e muito ACIMA dela.
ok('"forçar" também vale como confirmação, para quem lança pela planilha',
  ctx.salvarLancamento_({
    placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-21',
    valor: 600, litros: 100, km: ultimoKm * 10, documento: 'NF 3', forcarKm: true,
  }).ok !== false);
ok('e a recusa ensina as duas saídas',
  /confirmar KM acima do normal/.test(
    ctx.salvarLancamento_({
      placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-21',
      valor: 600, litros: 100, km: ultimoKm * 10, documento: 'NF 4',
    }).mensagem) &&
  /no formulário da planilha/.test(
    ctx.salvarLancamento_({
      placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-21',
      valor: 600, litros: 100, km: ultimoKm * 10, documento: 'NF 5',
    }).mensagem));

console.log('\n8. Corrigir uma leitura tem a MESMA guarda');
// E onde o digito a mais tem a melhor chance: a pessoa ja esta convencida de
// que o valor gravado esta errado, e digita o "certo" com pressa.
montarCaminhao();
let aj = ctx.ajustarLeituraOdometro_(
  { placa: 'AAA 0001', data: '2026-11-19', km: 108000 }, 9000000);
ok('ajuste com KM absurdo é recusado', aj.ok === false, aj.mensagem);
ok('e marca `kmAlto`, para a tela poder perguntar', aj.kmAlto === true,
  'sem isso a única saída seria desistir da correção');
aj = ctx.ajustarLeituraOdometro_(
  { placa: 'AAA 0001', data: '2026-11-19', km: 108000 }, 9000000, true);
ok('com a confirmação, grava', aj.ok === true, aj.mensagem);

console.log('\n9. A tela sabe antes de a pessoa clicar em gravar');
montarCaminhao();
const ctxv = ctx.webContextoLancamento('T', 'AAA 0001');
ok('o contexto traz o ritmo do veículo',
  ctxv.ritmoKmDia && Math.abs(ctxv.ritmoKmDia.mediana - 400) < 0.001,
  JSON.stringify(ctxv.ritmoKmDia));
ok('e o limite já calculado, na MESMA ida da última leitura',
  Math.abs(ctxv.ritmoKmDia.limite - 1200) < 0.001,
  '3 x 400 = 1.200, abaixo do teto de 1.500');

const app = fs.readFileSync('App.html', 'utf8');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ok('a tela avalia o lado de cima junto com o de baixo',
  /function avaliarKmDigitado\(\)[\s\S]{0,300}avaliarKmAlto\(\);/.test(app),
  'avaliar só um lado deixa o outro passar em silêncio');
ok('e a conta da tela é km por dia, como a do servidor',
  /var kmDia = percurso \/ Math\.max\(dias, 1\);/.test(app) &&
  /kmDia > RITMO_KM\.limite/.test(app));
ok('a confirmação vai junto no callback',
  /confirmarKmAlto: !!\(el\('confirmarKmAlto'\) && el\('confirmarKmAlto'\)\.checked\)/.test(app),
  'caixa na tela que o callback não envia é promessa falsa');
ok('mudar a DATA reavalia (ela entra na conta de km/dia)',
  /avaliarKmAlto\(\);\s*\n\s*\}\);/.test(app));
ok('e a correção de leitura pergunta em vez de só recusar',
  /r\.kmAlto && confirm\(/.test(app));
ok('o servidor tem um dono só da frase',
  (fonte.match(/^function textoPercursoAlto_/gm) || []).length === 1 &&
  (fonte.match(/textoPercursoAlto_\(/g) || []).length >= 3,
  'a definição e os dois usos');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
