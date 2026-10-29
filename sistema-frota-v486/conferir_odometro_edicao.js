/**
 * Prova da alteração e da exclusão de leitura de odômetro pelo relatório.
 *
 * O KM entra no consumo, no R$/km e no alerta de fora da curva. Mexer nele
 * pela tela e acertar a linha ERRADA é pior que não ter o botão: o número
 * muda, nada dá erro, e o veículo certo passa a mentir.
 *
 * A aba Odômetro não tem coluna de ID — são três colunas desde a primeira
 * versão. Então o que se prova aqui é que a identidade placa + dia + valor
 * acha a linha certa mesmo quando a base andou debaixo do relatório.
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

// A base de odômetro, como linhas da aba (linha 2 em diante).
let base = [];
const diario = { log: [], escritas: [], apagadas: [] };

// Date criado FORA do vm nao passa no `instanceof Date` de dentro, e o
// relatorio descarta a leitura em silencio — a fixture ficaria vazia e as
// provas passariam sem provar nada. A fabrica roda dentro do vm.
let dia = null;   // preenchido assim que o contexto existe

function abaOdometro() {
  return {
    getLastRow: function () { return base.length + 1; },
    getRange: function (linha, coluna, nL, nC) {
      nL = nL || 1; nC = nC || 1;
      if (linha < 2 || linha > base.length + 1) throw new Error('linha fora da aba: ' + linha);
      return {
        getValues: function () {
          const saida = [];
          for (let i = 0; i < nL; i++) saida.push(base[linha - 2 + i].slice(coluna - 1, coluna - 1 + nC));
          return saida;
        },
        setValue: function (v) {
          diario.escritas.push({ linha: linha, coluna: coluna, valor: v });
          base[linha - 2][coluna - 1] = v;
        },
      };
    },
    deleteRow: function (linha) {
      diario.apagadas.push(linha);
      base.splice(linha - 2, 1);
    },
  };
}

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
  LockService: { getScriptLock: () => ({ tryLock: () => ctx.__lockLivre, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { ajustarLeituraOdometro_, excluirLeituraOdometro_,
    localizarLeituraOdometro_, isoDoDia_, relatorioHistoricoKm_,
    webAjustarOdometro, webExcluirOdometro, invalidarCacheOdometro_, ABAS, col_ });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  autorizarContextoWeb_ = function () {};
  registrarLog_ = function (a, b) { __diario.log.push(a + ' | ' + b); };
  param_ = function (n) { return n === 'MES_REFERENCIA' ? '2026-10' : ''; };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoDoMes_ = function () { return { inicio: new Date(2026, 8, 26, 0, 0, 0),
                                         fim: new Date(2026, 9, 25, 23, 59, 59) }; };
  mesCompetenciaDaData_ = function () { return '2026-09'; };
  timezone_ = function () { return 'America/Sao_Paulo'; };
  emailContextoAtual_ = function () { return 'fulano@giassi.com.br'; };
  aba_ = function () { return __aba(); };
  ss_ = function () { return { getSheetByName: function () { return __aba(); } }; };
  mapaVeiculosPorPlaca_ = function () { return { 'SXN 4J64': { descricao: 'COSTELATION',
    centro: 'Loja 05', categoria: 'Carreta Normal' } }; };
`, ctx);
ctx.__diario = diario;
ctx.__aba = abaOdometro;
ctx.__lockLivre = true;
dia = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); })', ctx);

function resetar() {
  base = [
    [dia(2026, 9, 29), 'SXN 4J64', 58256],
    [dia(2026, 10, 6), 'SXN 4J64', 59149],
    [dia(2026, 10, 12), 'SXN 4J64', 60095],
    [dia(2026, 10, 20), 'SXN 4J64', 61004],
    [dia(2026, 10, 20), 'SXN 4J64', 150583],   // o erro de digitação da tela
    [dia(2026, 10, 27), 'SXN 4J64', 61978],
  ];
  diario.log.length = 0; diario.escritas.length = 0; diario.apagadas.length = 0;
  ctx.invalidarCacheOdometro_();
}

function ref(d, km, placa) {
  return { placa: placa || 'SXN 4J64', data: d, km: km };
}

console.log('\n1. O relatório entrega uma referência por leitura');
resetar();
const rel = ctx.relatorioHistoricoKm_(null, null, 'SXN 4J64');
ok('vem uma referência para cada linha', rel.refs.length === rel.linhas.length,
  rel.refs.length + ' refs para ' + rel.linhas.length + ' linhas');
ok('a linha de resumo do veículo não tem referência', rel.refs[0] === null);
ok('as linhas de leitura têm', rel.refs.slice(1).every(function (r) { return r && r.placa; }));
ok('a referência traz placa, dia ISO e KM',
  rel.refs[1].placa === 'SXN 4J64' && rel.refs[1].data === '2026-10-27' && rel.refs[1].km === 61978,
  JSON.stringify(rel.refs[1]));
// Na tela, texto em coluna numérica virava NaN na linha do veículo.
ok('a linha do veículo não põe texto em coluna numérica',
  typeof rel.linhas[0][2] !== 'string' || rel.linhas[0][2] === '',
  'Leitura (KM) = ' + JSON.stringify(rel.linhas[0][2]));
ok('nem em KM/dia',
  typeof rel.linhas[0][5] !== 'string' || rel.linhas[0][5] === '',
  'KM/dia = ' + JSON.stringify(rel.linhas[0][5]));
ok('o total rodado cai na coluna "Rodou desde a anterior"',
  rel.linhas[0][3] === 61978 - 58256, String(rel.linhas[0][3]));
ok('a contagem de leituras vai para Observação, que é texto',
  /6 leitura\(s\)/.test(String(rel.linhas[0][6])), String(rel.linhas[0][6]));

console.log('\n2. Alterar acerta a leitura certa');
resetar();
let r = ctx.ajustarLeituraOdometro_(ref('2026-10-20', 150583), 60583);
ok('devolve ok', r.ok === true, r.mensagem);
ok('escreve na linha da leitura errada, não na outra do mesmo dia',
  diario.escritas.length === 1 && diario.escritas[0].linha === 6 &&
  diario.escritas[0].coluna === 3 && diario.escritas[0].valor === 60583,
  JSON.stringify(diario.escritas));
ok('a leitura de 61.004 do mesmo dia fica intacta', base[3][2] === 61004);
ok('a mensagem mostra o de-para', /150\.583/.test(r.mensagem) && /60\.583/.test(r.mensagem), r.mensagem);
ok('e avisa que o consumo só muda depois de atualizar',
  /Atualizar relatórios/.test(r.mensagem), r.mensagem);
ok('o de-para fica no Log',
  diario.log.some(function (l) { return /Odômetro alterado/.test(l) && /150\.583 → 60\.583/.test(l); }),
  diario.log.join(' // '));

console.log('\n3. Excluir');
resetar();
r = ctx.excluirLeituraOdometro_(ref('2026-10-20', 150583));
ok('devolve ok', r.ok === true, r.mensagem);
ok('apaga a linha da leitura errada', diario.apagadas.join(',') === '6', diario.apagadas.join(','));
ok('a base fica com cinco leituras', base.length === 5);
ok('e a de 61.004 continua lá',
  base.some(function (l) { return l[2] === 61004; }));
ok('registra no Log', diario.log.some(function (l) { return /Odômetro excluído/.test(l); }));

console.log('\n4. O número da linha não serve de identidade');
// Entre desenhar o relatório e clicar no botão, alguém excluiu uma linha
// acima. O alvo desceu. Mirar pelo número da linha gravaria no vizinho.
resetar();
const alvo = ref('2026-10-27', 61978);
base.splice(1, 1);                       // some a leitura de 06/10
ctx.invalidarCacheOdometro_();
r = ctx.ajustarLeituraOdometro_(alvo, 61900);
ok('ainda acerta a leitura certa depois do deslocamento',
  r.ok === true && base[base.length - 1][2] === 61900, JSON.stringify(base[base.length - 1]));
ok('e não encostou na leitura que ficou no lugar antigo',
  base[3][2] === 150583, String(base[3][2]));

console.log('\n4b. A identidade são os três: placa, dia e valor');
// Com um veículo só, e sem KM repetido, conferir a placa ou conferir o dia
// dá no mesmo que não conferir — a fixture não distingue. Aqui há um sósia
// de cada: outro veículo com a MESMA leitura no MESMO dia, e o mesmo
// veículo com o MESMO KM em outro dia.
resetar();
base = [
  [dia(2026, 10, 10), 'SXN 4J64', 70000],
  [dia(2026, 10, 20), 'ABC 1D23', 70000],   // sósia pela placa
  [dia(2026, 10, 20), 'SXN 4J64', 70000],   // o alvo
  [dia(2026, 10, 25), 'SXN 4J64', 70000],
];
ctx.invalidarCacheOdometro_();
r = ctx.ajustarLeituraOdometro_(ref('2026-10-20', 70000), 70500);
ok('acha o alvo entre os sósias', r.ok === true, JSON.stringify(r));
ok('escreve na linha 4, a do veículo e do dia certos',
  diario.escritas.length === 1 && diario.escritas[0].linha === 4,
  JSON.stringify(diario.escritas));
ok('o veículo de outra placa no mesmo dia fica intacto',
  base[1][1] === 'ABC 1D23' && base[1][2] === 70000);
ok('a leitura de outro dia com o mesmo KM fica intacta',
  base[0][2] === 70000 && base[3][2] === 70000);
ok('e não houve "idênticas": os três campos separam as quatro linhas',
  !/idênticas/.test(r.mensagem), r.mensagem);

console.log('\n5. Leitura que não existe mais');
resetar();
r = ctx.ajustarLeituraOdometro_(ref('2026-10-27', 99999), 60000);
ok('recusa em vez de gravar em qualquer linha', r.ok === false, JSON.stringify(r));
ok('e explica que a base mudou', /não está mais na base/.test(r.mensagem), r.mensagem);
ok('nada foi escrito', diario.escritas.length === 0);
r = ctx.excluirLeituraOdometro_(ref('2026-10-27', 99999));
ok('o mesmo ao excluir', r.ok === false && diario.apagadas.length === 0, JSON.stringify(r));

console.log('\n6. Leituras idênticas');
// Duas linhas iguais já são uma duplicidade. Recusar deixaria o usuário sem
// saída pela tela; age-se numa e diz-se quantas eram.
resetar();
base.push([dia(2026, 10, 27), 'SXN 4J64', 61978]);
ctx.invalidarCacheOdometro_();
r = ctx.excluirLeituraOdometro_(ref('2026-10-27', 61978));
ok('exclui uma', r.ok === true && base.filter(function (l) { return l[2] === 61978; }).length === 1);
ok('e diz que havia duas', /2 leituras idênticas/.test(r.mensagem), r.mensagem);

console.log('\n7. Período fechado tem lacre');
// A competência 2026-10 vai de 26/09 a 25/10: 29/09 está ABERTO. A leitura
// travada tem de ser anterior ao início do período, senão a prova passa
// sem o lacre existir.
resetar();
base.unshift([dia(2026, 9, 20), 'SXN 4J64', 57800]);
ctx.invalidarCacheOdometro_();
r = ctx.ajustarLeituraOdometro_(ref('2026-09-20', 57800), 57000);
ok('não altera leitura de mês fechado', r.ok === false, JSON.stringify(r));
ok('e manda reabrir o mês', /Reabra o mês/.test(r.mensagem), r.mensagem);
ok('nada foi escrito', diario.escritas.length === 0);
r = ctx.excluirLeituraOdometro_(ref('2026-09-20', 57800));
ok('nem exclui', r.ok === false && diario.apagadas.length === 0, JSON.stringify(r));
ok('e a mensagem fala em excluir, não em alterar',
  /excluir a leitura/.test(r.mensagem), r.mensagem);
ok('o primeiro dia do período aberto já pode', (function () {
  resetar();
  return ctx.ajustarLeituraOdometro_(ref('2026-09-29', 58256), 58300).ok === true;
})(), '29/09 está dentro do período 26/09–25/10');

console.log('\n8. KM inválido');
resetar();
[0, -5, 'abc', null, ''].forEach(function (valor) {
  const resp = ctx.ajustarLeituraOdometro_(ref('2026-10-27', 61978), valor);
  ok('recusa KM ' + JSON.stringify(valor), resp.ok === false, JSON.stringify(resp));
});
ok('nada foi escrito', diario.escritas.length === 0);
r = ctx.ajustarLeituraOdometro_(ref('2026-10-27', 61978), 61978);
ok('recusa KM igual ao que já está gravado', r.ok === false && /igual/.test(r.mensagem), r.mensagem);

console.log('\n9. Referência malformada');
resetar();
[{ placa: '', data: '2026-10-27', km: 61978 },
 { placa: 'SXN 4J64', data: '27/10/2026', km: 61978 },
 { placa: 'SXN 4J64', data: '2026-10-27', km: 'x' },
 null].forEach(function (mau) {
  const resp = ctx.ajustarLeituraOdometro_(mau, 60000);
  ok('recusa ref ' + JSON.stringify(mau), resp.ok === false, JSON.stringify(resp));
});
ok('nada foi escrito', diario.escritas.length === 0);

console.log('\n10. Trava e cache');
resetar();
ctx.__lockLivre = false;
r = ctx.ajustarLeituraOdometro_(ref('2026-10-27', 61978), 61900);
ok('sem a trava, não escreve', r.ok === false && diario.escritas.length === 0, JSON.stringify(r));
ctx.__lockLivre = true;
resetar();
ctx.relatorioHistoricoKm_(null, null, 'SXN 4J64');       // enche o cache
// 61.500 e não 60.583: há DUAS leituras em 20/10, e a corrigida tem de ficar
// acima da outra para a sequência voltar a subir.
ctx.ajustarLeituraOdometro_(ref('2026-10-20', 150583), 61500);
const depois = ctx.relatorioHistoricoKm_(null, null, 'SXN 4J64');
ok('o relatório relido já mostra o valor novo',
  depois.refs.some(function (x) { return x && x.km === 61500; }) &&
  !depois.refs.some(function (x) { return x && x.km === 150583; }),
  depois.refs.filter(Boolean).map(function (x) { return x.km; }).join(','));
ok('e o "retrocedeu" sumiu com a correção',
  depois.linhas.every(function (l) { return !/retrocedeu/.test(String(l[6])); }),
  depois.linhas.map(function (l) { return l[6]; }).join(' | '));

console.log('\n11. Os callbacks da tela');
resetar();
ok('webAjustarOdometro chega no servidor',
  ctx.webAjustarOdometro('token', ref('2026-10-20', 150583), 60583).ok === true);
resetar();
ok('webExcluirOdometro também',
  ctx.webExcluirOdometro('token', ref('2026-10-20', 150583)).ok === true);

console.log('\n12. As duas pontas: tela e servidor');
const app = fs.readFileSync('App.html', 'utf8');
ok('a tela só mostra os botões para quem pode gravar',
  /\['OPERADOR', 'ADMIN'\]\.indexOf\(SESSAO\.perfil\) === -1\) return dados;/.test(app),
  'botão para quem não pode gravar falha no servidor e parece defeito');
ok('e o servidor exige os mesmos perfis',
  /function webAjustarOdometro[\s\S]{0,120}\['OPERADOR', 'ADMIN'\]/.test(fs.readFileSync('Codigo.gs', 'utf8')) &&
  /function webExcluirOdometro[\s\S]{0,120}\['OPERADOR', 'ADMIN'\]/.test(fs.readFileSync('Codigo.gs', 'utf8')),
  'a tela esconder não basta: o callback é chamável direto');
ok('a linha sem referência não ganha botão',
  /if \(!dados\.refs\[i\]\) return l\.concat\(\[''\]\);/.test(app));
ok('a confirmação sobrevive ao recarregamento do relatório',
  /AVISO_LEITURA = ''/.test(app) && /aviso \+ resumo \+/.test(app),
  'escrever direto no saidaRel some quando o relatório recalcula');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
