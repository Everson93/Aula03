/**
 * Prova do modulo de comprovantes atrasados.
 *
 * A promessa que o modulo faz, e que o teste existe para cobrar: um comprovante
 * registrado NAO MEXE EM NADA ate alguem decidir incorpora-lo. Se mexer, ele
 * deixa de resolver o problema e passa a ser outro jeito de alterar um mes
 * fechado — que e exatamente o que o sistema inteiro vem evitando.
 *
 * E a segunda: ao incorporar, a despesa cai no periodo ABERTO, nunca na
 * competencia original. Usar a data verdadeira seria natural e estaria errado.
 */
const fs = require('fs');
const vm = require('vm');

const ABAS_FAKE = {};
function fakeSheet(nome, largura) {
  const dados = ABAS_FAKE[nome] || (ABAS_FAKE[nome] = []);
  return {
    getLastRow: () => dados.length + 1,
    getMaxRows: () => dados.length + 100,
    getRange: (linha, col, nL, nC) => ({
      getValue: () => { const l = dados[linha - 2]; return l ? l[col - 1] : ''; },
      setValue: (v) => { if (!dados[linha - 2]) dados[linha - 2] = new Array(largura).fill(''); dados[linha - 2][col - 1] = v; },
      getValues: () => {
        const saida = [];
        for (let i = 0; i < (nL || 1); i++) {
          const o = dados[linha - 2 + i] || new Array(largura).fill('');
          const l = [];
          for (let j = 0; j < (nC || 1); j++) l.push(o[col - 1 + j] === undefined ? '' : o[col - 1 + j]);
          saida.push(l);
        }
        return saida;
      },
      setValues: (vals) => {
        vals.forEach((l, i) => {
          const alvo = linha - 2 + i;
          if (!dados[alvo]) dados[alvo] = new Array(largura).fill('');
          l.forEach((v, j) => { dados[alvo][col - 1 + j] = v; });
        });
      },
      clearContent: () => {},
      setNumberFormat: function () { return this; },
    }),
  };
}

const ctx = {
  console: { log: console.log, error: () => {} },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: {
    getUuid: () => 'abcd1234-0000',
    formatDate: (d, tz, f) => {
      const p = (n) => (n < 10 ? '0' : '') + n;
      return f === 'yyyy-MM-dd'
        ? d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        : p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    webRegistrarComprovante, webIncorporarComprovante, webDescartarComprovante,
    webComprovantes, lerComprovantes_, invalidarCacheComprovantes_,
    COL_COMP, TOTAL_COL_COMP, COMP_PENDENTE_, COMP_INCORPORADO_, COMP_DESCARTADO_,
    ABAS, COL_LANC, TOTAL_COL_LANC, L_, TIPOS_DESPESA,
  });
  exigirExecucaoMutacao_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirPerfilToken_ = function () { return { perfil: __perfil, email: 'op@giassi.com.br' }; };
  autorizarContextoWeb_ = function () { return { perfil: __perfil, email: 'op@giassi.com.br' }; };
  registrarLog_ = function (a, d) { __log.push(a); };
  invalidarCacheInicio_ = function () {};
  invalidarCacheLancamentos_ = function () {};
  marcarResumoDesatualizado_ = function () {};
  garantirLinhas_ = function () {};
  garantirColunas_ = function () {};
  garantirCabecalhoAba_ = function () {};
  garantirValidacaoTiposLancamento_ = function () {};
  timezone_ = function () { return 'America/Sao_Paulo'; };
  novoIdLancamento_ = function () { return 'LAN-NOVO-1'; };
  proximaLinhaLancamento_ = function () { return __lanc.length + 2; };
  normalizaPlaca_ = function (p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  normalizarCentroCusto_ = function (v) { return String(v || '').trim(); };
  formatarData_ = function (d) {
    if (!(d instanceof Date)) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  };
  mesCompetenciaDaData_ = function (d) {
    // corte dia 25: a partir do dia 26 pertence ao mês seguinte
    var mes = d.getMonth() + 1, ano = d.getFullYear();
    if (d.getDate() >= 26) { mes++; if (mes > 12) { mes = 1; ano++; } }
    return ano + '-' + (mes < 10 ? '0' : '') + mes;
  };
  periodoAtual_ = function () { return __periodo; };
  resolverVeiculo_ = function (e) {
    var p = normalizaPlaca_(e);
    if (p !== 'AAA1A11' && String(e).trim() !== '7788') {
      return { ok: false, mensagem: 'Veículo não encontrado: ' + e };
    }
    return { ok: true, veiculo: { placa: 'AAA1A11', centro: 'Loja 08', categoria: 'Leve' } };
  };
  __perfil = 'ADMIN';
  __log = [];
  __lanc = [];
`, ctx, { filename: 'Codigo.gs' });

const dataVm = vm.runInContext('(function (a, m, d) { return new Date(a, m - 1, d, 12, 0, 0); })', ctx);
ctx.__periodo = { inicio: dataVm(2026, 10, 26), fim: dataVm(2026, 11, 25) };

ctx.aba_ = function (nome) {
  if (nome === ctx.ABAS.COMPROVANTES) return fakeSheet(nome, ctx.TOTAL_COL_COMP);
  if (nome === ctx.ABAS.LANCAMENTOS) return fakeSheet(nome, ctx.TOTAL_COL_LANC);
  return fakeSheet(nome, 20);
};
ctx.ss_ = function () {
  return { getSheetByName: (n) => (ABAS_FAKE[n] ? fakeSheet(n, ctx.TOTAL_COL_COMP) : null) };
};

let falhas = 0, provas = 0;
function ok(t, c, d) {
  provas++;
  if (c) { console.log('  ok   ' + t); return; }
  falhas++;
  console.log('  FALHA ' + t + (d ? '\n        ' + d : ''));
}
function limpar() {
  ABAS_FAKE[ctx.ABAS.COMPROVANTES] = [];
  ABAS_FAKE[ctx.ABAS.LANCAMENTOS] = [];
  ctx.__lanc = ABAS_FAKE[ctx.ABAS.LANCAMENTOS];
  ctx.__log = [];
  ctx.__perfil = 'ADMIN';
  ctx.invalidarCacheComprovantes_();
}
function registrar(extra) {
  const base = { veiculo: 'AAA1A11', data: '2026-09-14', tipo: 'Combustivel Terceiros',
    litros: '60', valor: '420,50', km: '148320', documento: 'NF-9911' };
  Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
  const r = ctx.webRegistrarComprovante('t', base);
  ctx.invalidarCacheComprovantes_();
  return r;
}

console.log('\n1. Registro do comprovante atrasado');
limpar();
let r = registrar();
ok('aceita data de setembro com o período de novembro aberto', r.ok === true, JSON.stringify(r));
ok('a mensagem deixa claro que não afeta fechamento',
  /NÃO entra em nenhum fechamento/.test(r.mensagem || ''), r.mensagem);
let c = ctx.lerComprovantes_()[0];
ok('nasce PENDENTE', String(c[ctx.COL_COMP.SITUACAO - 1]) === ctx.COMP_PENDENTE_);
ok('guarda a competência de origem, não a aberta',
  String(c[ctx.COL_COMP.COMPETENCIA - 1]) === '2026-09',
  String(c[ctx.COL_COMP.COMPETENCIA - 1]));
ok('guarda o KM do papel', Number(c[ctx.COL_COMP.KM - 1]) === 148320);
ok('congela o centro de custo do veículo', String(c[ctx.COL_COMP.CENTRO - 1]) === 'Loja 08');

console.log('\n2. A PROMESSA: nada é tocado antes de incorporar');
ok('nenhum lançamento foi criado', ABAS_FAKE[ctx.ABAS.LANCAMENTOS].length === 0,
  'se criasse, o comprovante seria só outro jeito de mexer num mês fechado');
ok('e o registro fica na aba apartada', ctx.lerComprovantes_().length === 1);

console.log('\n3. Data dentro do período aberto é recusada');
limpar();
r = registrar({ data: '2026-11-10' });
ok('recusa, porque ali não há atraso', r.ok === false, JSON.stringify(r));
ok('e manda usar o lançamento normal', /Novo lançamento/.test(r.mensagem || ''), r.mensagem);
r = registrar({ data: '2026-12-20' });
ok('data no futuro também é recusada', r.ok === false, r.mensagem);

console.log('\n4. Validações do papel');
limpar();
ok('veículo inexistente é recusado', registrar({ veiculo: 'ZZZ0Z00' }).ok === false);
ok('aceita por PATRIMÔNIO, não só placa', registrar({ veiculo: '7788' }).ok === true);
limpar();
ok('valor zero é recusado', registrar({ valor: '0' }).ok === false);
ok('tipo inválido é recusado', registrar({ tipo: 'Inventado' }).ok === false);
ok('litros em tipo sem quantidade é recusado',
  registrar({ tipo: 'Multa', litros: '30' }).ok === false,
  'a mesma regra do lançamento normal');
limpar();
ok('valor com vírgula é aceito', registrar({ valor: '1.234,56' }).ok === true);
ok('e grava como número', Number(ctx.lerComprovantes_()[0][ctx.COL_COMP.VALOR - 1]) === 1234.56,
  String(ctx.lerComprovantes_()[0][ctx.COL_COMP.VALOR - 1]));

console.log('\n5. Duplicata');
limpar();
registrar();
r = registrar();
ok('o mesmo papel duas vezes é barrado', r.ok === false && r.duplicidade === true, JSON.stringify(r));
ok('mas passa com confirmação explícita', registrar({ confirmarDuplicado: true }).ok === true,
  'o atraso faz justamente perder a noção do que já entrou — barrar sem saída travaria o trabalho');

console.log('\n6. Incorporar: cai no período ABERTO, não na competência original');
limpar();
registrar();
r = ctx.webIncorporarComprovante('t', 2);
ctx.invalidarCacheComprovantes_();
ok('a incorporação funciona', r.ok === true, JSON.stringify(r));
const lanc = ABAS_FAKE[ctx.ABAS.LANCAMENTOS][0];
ok('criou exatamente um lançamento', ABAS_FAKE[ctx.ABAS.LANCAMENTOS].length === 1);
const dataLanc = lanc[ctx.L_.DATA];
ok('a data do lançamento está DENTRO do período aberto',
  dataLanc >= ctx.__periodo.inicio && dataLanc <= ctx.__periodo.fim,
  ctx.formatarData_(dataLanc) + ' — usar a data original jogaria a despesa num mês fechado');
ok('a data ORIGINAL ficou na observação',
  /14\/09\/2026/.test(String(lanc[ctx.L_.OBSERVACAO])), String(lanc[ctx.L_.OBSERVACAO]));
ok('a competência de origem também', /2026-09/.test(String(lanc[ctx.L_.OBSERVACAO])));
ok('valor e litros vieram do comprovante',
  Number(lanc[ctx.L_.VALOR]) === 420.5 && Number(lanc[ctx.L_.LITROS]) === 60);
ok('o comprovante virou INCORPORADO',
  String(ctx.lerComprovantes_()[0][ctx.COL_COMP.SITUACAO - 1]) === ctx.COMP_INCORPORADO_);
ok('e guarda o ID do lançamento gerado, para rastrear',
  String(ctx.lerComprovantes_()[0][ctx.COL_COMP.ID_LANCAMENTO - 1]) === 'LAN-NOVO-1');
ok('avisa que os litros pioram o km/l do mês que recebe',
  /km\/l deste mês piora/.test(r.mensagem || ''), r.mensagem);

console.log('\n7. Incorporar duas vezes não duplica a despesa');
r = ctx.webIncorporarComprovante('t', 2);
ok('a segunda tentativa é recusada', r.ok === false, JSON.stringify(r));
ok('e continua havendo UM lançamento só', ABAS_FAKE[ctx.ABAS.LANCAMENTOS].length === 1);

console.log('\n8. Descarte');
limpar();
registrar();
ok('descarte sem motivo é recusado', ctx.webDescartarComprovante('t', 2, '').ok === false);
ok('descarte com motivo funciona',
  ctx.webDescartarComprovante('t', 2, 'duplicata do NF-9911').ok === true);
ctx.invalidarCacheComprovantes_();
ok('vira DESCARTADO',
  String(ctx.lerComprovantes_()[0][ctx.COL_COMP.SITUACAO - 1]) === ctx.COMP_DESCARTADO_);
ok('o motivo fica na observação',
  /duplicata do NF-9911/.test(String(ctx.lerComprovantes_()[0][ctx.COL_COMP.OBSERVACAO - 1])));
ok('e não criou lançamento nenhum', ABAS_FAKE[ctx.ABAS.LANCAMENTOS].length === 0);

limpar();
registrar();
ctx.webIncorporarComprovante('t', 2);
ctx.invalidarCacheComprovantes_();
ok('já incorporado não pode ser descartado',
  ctx.webDescartarComprovante('t', 2, 'mudei de ideia').ok === false,
  'o lançamento já existe na base; desfazer é pela tela de exclusão, com justificativa');

console.log('\n9. Relatório de fora de período');
limpar();
registrar({ data: '2026-09-14', valor: '420,50' });
registrar({ data: '2026-08-03', valor: '300', documento: 'NF-100' });
registrar({ data: '2026-09-20', valor: '100', documento: 'NF-200' });
const rel = ctx.webComprovantes('t', 'PENDENTE');
ok('conta os pendentes', rel.pendentes === 3, String(rel.pendentes));
ok('soma o valor fora do mapa', Math.abs(rel.valorPendente - 820.5) < 0.01, String(rel.valorPendente));
ok('agrupa por competência de origem', rel.porCompetencia.length === 2,
  JSON.stringify(rel.porCompetencia));
ok('setembro tem 2 comprovantes',
  rel.porCompetencia.filter(function (x) { return x.competencia === '2026-09'; })[0].qtd === 2);
ok('a mensagem diz que nada afeta fechamento',
  /afeta fechamento até ser incorporado/.test(rel.mensagem), rel.mensagem);
ok('o filtro DESCARTADO não mostra os pendentes',
  ctx.webComprovantes('t', 'DESCARTADO').itens.length === 0);
ok('TODOS mostra os três', ctx.webComprovantes('t', 'TODOS').itens.length === 3);

console.log('\n10. Perfil');
limpar();
registrar();
ctx.__perfil = 'OPERADOR';
ok('OPERADOR registra comprovante', registrar({ documento: 'NF-OP' }).ok === true,
  'quem recebe o papel na loja é quem lança');

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
