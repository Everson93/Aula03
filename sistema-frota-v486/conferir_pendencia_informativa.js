/**
 * Informativo não é pendência.
 *
 * Queixa do usuário, com a tela na mão: *"por que está aparecendo esse erro? o
 * veículo por acabar não tendo custo no mês"*. O texto que ele viu começa com
 * **"Não é defeito"** — e mesmo assim a linha entrava na fila como PENDENTE,
 * contava no painel e **bloqueava o fechamento do mês**. O sistema dizia uma
 * coisa no texto e fazia outra no resto.
 *
 * Quem opera resolvia do único jeito possível: marcando RESOLVIDO num ponto
 * que não tinha o que resolver, só para destravar o fechamento. Isso gasta a
 * confiança na lista inteira — e a pendência que procede some no meio.
 *
 * O catálogo já classificava essa linha como `tipo: 'informativo'`. O que
 * faltava era o resto do sistema respeitar a própria classificação.
 */
const fs = require('fs');
const vm = require('vm');
const arquivo = 'Codigo.gs';

let __validacao = null;
const abas = {};
/** Faixa de enfeite: aceita tudo e não guarda nada. */
function __rangeDeEnfeite() {
  const r = {};
  ['merge', 'setFormula', 'setValue', 'setValues', 'setBackground', 'setFontColor',
   'setFontWeight', 'setFontSize', 'setVerticalAlignment', 'setNumberFormat',
   'setDataValidation', 'createFilter', 'clearContent', 'breakApart',
   'setHorizontalAlignment', 'setWrap', 'setBorder']
    .forEach(function (nome) { r[nome] = function () { return r; }; });
  r.getValues = function () { return [[]]; };
  r.getDisplayValues = function () { return [[]]; };
  return r;
}
function novaAba(nome, cabecalho, linhas) {
  const dados = [cabecalho.slice()].concat((linhas || []).map(l => l.slice()));
  const aba = {
    nome: nome,
    dados: dados,
    maxCols: Math.max(cabecalho.length, 30),
    getName: () => nome,
    getLastRow: function () {
      let ultima = 0;
      aba.dados.forEach(function (l, i) {
        if (l.some(function (v) { return v !== '' && v !== null && v !== undefined; })) ultima = i + 1;
      });
      return ultima;
    },
    getMaxRows: function () { return Math.max(aba.dados.length, 100); },
    getMaxColumns: function () { return aba.maxCols; },
    getLastColumn: function () { return aba.maxCols; },
    insertRowsAfter: function (depois, quantas) {
      for (let i = 0; i < quantas; i++) aba.dados.push(new Array(aba.maxCols).fill(''));
    },
    insertColumnsAfter: function () {},
    setFrozenRows: function () {}, setFrozenColumns: function () {},
    setRowHeight: function () {}, setColumnWidth: function () {},
    getDataRange: function () { return aba.getRange(1, 1, aba.getMaxRows(), aba.maxCols); },
    getRange: function (linha, coluna, nL, nC) {
      // A aba de conferência é formatada com getRange('A1:G1') e uma penca de
      // chamadas de aparência. Nada disso é o objeto da prova, mas o dublê
      // precisa aguentar: função que falta vira exceção e mata a suíte.
      if (typeof linha === 'string') return __rangeDeEnfeite();
      nL = nL || 1; nC = nC || 1;
      if (linha + nL - 1 > aba.getMaxRows()) {
        throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      }
      if (coluna + nC - 1 > aba.maxCols) {
        throw new Error('The number of columns in the range must be at least 1');
      }
      const r = {
        getValues: function () {
          const saida = [];
          for (let i = 0; i < nL; i++) {
            const l = aba.dados[linha - 1 + i] || new Array(aba.maxCols).fill('');
            saida.push(l.slice(coluna - 1, coluna - 1 + nC));
          }
          return saida;
        },
        getValue: function () { return r.getValues()[0][0]; },
        getDisplayValues: function () {
          return r.getValues().map(function (l) {
            return l.map(function (v) {
              if (v instanceof Date) {
                const z = n => ('0' + n).slice(-2);
                return z(v.getDate()) + '/' + z(v.getMonth() + 1) + '/' + v.getFullYear();
              }
              return v === null || v === undefined ? '' : String(v);
            });
          });
        },
        setValues: function (vals) {
          vals.forEach(function (l, i) {
            const alvo = linha - 1 + i;
            while (aba.dados.length <= alvo) aba.dados.push(new Array(aba.maxCols).fill(''));
            l.forEach(function (v, j) { aba.dados[alvo][coluna - 1 + j] = v; });
          });
          return r;
        },
        setValue: function (v) { return r.setValues([[v]]); },
        clearContent: function () {
          for (let i = 0; i < nL; i++) {
            const alvo = linha - 1 + i;
            if (!aba.dados[alvo]) continue;
            for (let j = 0; j < nC; j++) aba.dados[alvo][coluna - 1 + j] = '';
          }
          return r;
        },
        setNumberFormat: () => r, setNumberFormats: () => r,
        setHorizontalAlignment: () => r, setHorizontalAlignments: () => r,
        setFontWeight: () => r, setFontSize: () => r, setFontColor: () => r,
        setBackground: () => r, setWrap: () => r, setFontStyle: () => r,
        merge: () => r, insertCheckboxes: () => r, setDataValidation: () => r,
        getDataValidation: function () { return null; },
        /**
         * Ctrl+Seta de verdade, que é o que o Sheets faz:
         *  - partindo de célula VAZIA, pula para a primeira com conteúdo;
         *  - partindo de célula CHEIA, vai para a ÚLTIMA do bloco contíguo —
         *    ou seja, subindo, para o TOPO do bloco.
         * O dublê antigo devolvia sempre a última linha com dado, e com isso
         * escondia exatamente o defeito que se procura aqui.
         */
        getNextDataCell: function (direcao) {
          const cheia = function (l) {
            const v = (aba.dados[l - 1] || [])[coluna - 1];
            return v !== '' && v !== null && v !== undefined;
          };
          const passo = direcao === 'UP' ? -1 : 1;
          const limite = direcao === 'UP' ? 1 : aba.getMaxRows();
          let l = linha;
          if (!cheia(l)) {
            while (l !== limite && !cheia(l + passo)) l += passo;
            if (cheia(l + passo)) l += passo;
          } else {
            while (l !== limite && cheia(l + passo)) l += passo;
          }
          return aba.getRange(l, coluna, 1, 1);
        },
        getRow: function () { return linha; },
        offset: function (dl, dc, nl, nc) { return aba.getRange(linha + dl, coluna + dc, nl || nL, nc || nC); },
      };
      ['merge', 'setFormula', 'setBackground', 'setFontColor', 'setFontWeight',
       'setFontSize', 'setVerticalAlignment', 'setDataValidation', 'createFilter',
       'setHorizontalAlignment', 'setWrap', 'setBorder', 'setFontStyle', 'setFontLine',
       'clearDataValidations', 'setNote', 'insertCheckboxes']
        .forEach(function (nome) { if (!r[nome]) r[nome] = function () { return r; }; });
      return r;
    },
    setRowHeight: function () { return aba; },
    setFrozenRows: function () { return aba; },
    setColumnWidth: function () { return aba; },
    deleteRow: function (n) { aba.dados.splice(n - 1, 1); },
  };
  abas[nome] = aba;
  return aba;
}

const ctx = {
  console: console,
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => planilha,
    flush: () => {},
    Direction: { UP: 'UP', DOWN: 'DOWN', NEXT: 'NEXT', PREVIOUS: 'PREVIOUS' },
    DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST' },
    newDataValidation: () => ({ requireValueInList: function (lista) { __validacao = lista; return this; },
      setAllowInvalid: function () { return this; },
      setHelpText: function () { return this; }, build: function () { return {}; } }),
    newConditionalFormatRule: () => ({
      whenFormulaSatisfied: function (f) { this.__f = f; return this; },
      setBackground: function () { return this; },
      setRanges: function () { return this; },
      build: function () { return { formula: this.__f }; } }),
  },
  Utilities: {
    getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    formatDate: function (d, _tz, padrao) {
      const z = n => ('0' + n).slice(-2);
      if (padrao === 'yyyy-MM-dd') return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
      if (padrao === 'yyyyMMdd') return '' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate());
      if (padrao === 'yyyy-MM') return d.getFullYear() + '-' + z(d.getMonth() + 1);
      return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, removeAll: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'operador@giassi.com.br' }),
             getEffectiveUser: () => ({ getEmail: () => 'operador@giassi.com.br' }) },
};
const planilha = {
  getSheetByName: (n) => abas[n] || null,
  getSheets: () => Object.keys(abas).map(k => abas[k]),
  insertSheet: (n) => novaAba(n, []),
  getId: () => 'planilha-fake',
  getSpreadsheetTimeZone: () => 'America/Sao_Paulo',
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(arquivo, 'utf8') + `
  Object.assign(globalThis, { escreverConferencia_, estadoConferencia_, webPendencias,
    pendenciaEhInformativa_, STATUS_INFORMATIVO_, STATUS_PENDENCIA_, ACOES_PENDENCIA_,
    coletarProblemas_, acaoDaPendencia_, R_, TOTAL_COL_RESUMO,
    periodoAtual_, salvarLancamento_, ABAS, COL_LANC, L_, COL_VEIC, COL_CENTRO });
  exigirExecucaoOperacional_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  registrarLog_ = function (acao, detalhe) { __log.push(acao + ': ' + detalhe); };
  atualizarResumoSeguro_ = function () {};
  invalidarCacheInicio_ = function () {};
  emailContextoAtual_ = function () { return 'operador@giassi.com.br'; };
  execucaoTemPlanilhaAtiva_ = function () { return true; };
  autorizarContextoWeb_ = function () {};
  garantirResumoAtualizado_ = function () { return 0; };
  statusDepreciacaoMensal_ = function () { return { liberada: false, itens: [] }; };
  pendenciasDeComprovante_ = function () { return []; };
  verificarIntegridadeHistorico_ = function () { return []; };
  exigirPerfilToken_ = function () {};
  // O separador de fórmula se descobre criando uma aba temporária na
  // planilha de verdade; aqui ele é fixado no do pt-BR, que é o do usuário.
  separadorFormula_ = function () { return ';'; };
  listasDeCorrecao_ = function () { return {}; };
  depreciacaoPodeContarComoPendencia_ = function () { return true; };
  removerFiltro_ = function () {};
  estilizarCabecalho_ = function () {};
`, ctx);

// ---- a planilha como ela é depois do Instalar
// Datas criadas DENTRO do vm: `lerCargasBomba_` e outros usam `instanceof
// Date`, que não atravessa realm. No Apps Script há um realm só, então isso é
// limitação do dublê — mas se o dublê não respeitar, a prova mente.
const d = vm.runInContext('(function (a, m, dd) { return new Date(a, m - 1, dd, 12, 0, 0, 0); })', ctx);
novaAba('Parâmetros', ['Parâmetro', 'Valor', 'Descrição'], [
  [], [], [],
  ['EMPRESA', 'Giassi', ''], ['MES_REFERENCIA', '2026-11', ''],
  ['DIA_FIM_PERIODO', 25, ''], ['DIA_INICIO_PERIODO', 26, ''],
]);
novaAba('Centros de Custo', ['Centro de Custo', '% Rateio Depósito', 'Recebe Rateio', 'Combustível'], [
  ['DEPOSITO', 0.5, 'SIM', 'SIM'],
  ['LOJA 05', 0.5, 'SIM', 'NAO'],
]);
const veic = (placa, centro) => {
  const v = new Array(14).fill('');
  v[0] = placa; v[1] = 'Caminhão'; v[2] = 'Truck Normal'; v[3] = centro;
  v[4] = '15482'; v[5] = 1200; v[10] = 'SIM'; v[12] = 2400; v[13] = 'Diesel';
  return v;
};
novaAba('Veículos', ['Placa / ID', 'Descrição', 'Categoria', 'Centro de Custo', 'Código Patrimônio',
  'Depreciação Mensal', 'Emplacamento (não usado)', 'Seguro', 'Bônus', 'Preço Comb. Próprio',
  'Ativo', 'Aba de Origem', 'IPVA Anual', 'Combustível'],
  [veic('AAA 0001', 'DEPOSITO'), veic('BBB 0002', 'LOJA 05')]);
novaAba('Lançamentos', ['Data', 'Placa / ID', 'Tipo / Natureza', 'Litros', 'Valor R$',
  'NF / Documento', 'Observação', 'Centro de Custo', 'Categoria', 'Período',
  'ID', 'Natureza Oficina', 'Detalhe', 'Fornecedor', 'Tipo Abastecimento'], []);
novaAba('Odômetro', ['Data', 'Placa / ID', 'KM / Horímetro'], [
  [d(2026, 11, 2), 'AAA 0001', 100000],
  [d(2026, 11, 6), 'AAA 0001', 101600],
  [d(2026, 11, 10), 'AAA 0001', 103200],
]);
novaAba('Carga na Bomba', ['Data', 'NF / Documento', 'Produto', 'Quantidade (L)',
  'Valor Total R$', 'R$ / Litro', 'Observação'], [
  [d(2026, 11, 1), 'NF 500', 'DIESEL S10', 5000, 30000, 6, ''],
]);
novaAba('Fornecedores', ['Nome', 'Ramo', 'Ativo'], [['POSTO X', 'Posto', 'SIM']]);
novaAba('Conferência', ['Data', 'Origem', 'Placa', 'Problema', 'Detalhe', 'Situação', 'Observação'], []);
novaAba('Log', ['Quando', 'Quem', 'Ação', 'Detalhe'], []);

ctx.__log = [];
let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

function gravar(dados) {
  try { return ctx.salvarLancamento_(dados); }
  catch (e) { return { ok: false, excecao: true, mensagem: e.message + ' | ' + (e.stack || '').split('\n')[1] }; }
}
function linhasGravadas() {
  return abas['Lançamentos'].dados.slice(1).filter(function (l) { return l[1]; });
}
/**
 * Célula de uma linha gravada, sem estourar quando a linha não existe.
 *
 * Indexar direto (`linhasGravadas()[1][4]`) MATA a suíte quando o defeito é
 * justamente "gravou menos linhas" — e suíte morta não produz FALHA nenhuma,
 * o que lido de longe parece aprovação.
 */
function cel(i, k) {
  const l = linhasGravadas()[i];
  return l ? l[k] : undefined;
}



// A aba de conferência, com o mínimo que escreverConferencia_ e
// estadoConferencia_ precisam: ela é lida e reescrita de verdade.
const conf = novaAba('Conferência', ['Origem', 'Placa / ID', 'Problema', 'Detalhe',
  'Status', 'Observação', 'Validado em'], []);
conf.clear = function () { conf.dados.length = 1; conf.dados[0] = new Array(conf.maxCols).fill(''); };
conf.clearConditionalFormatRules = function () {};
conf.setConditionalFormatRules = function () {};
conf.getDataRange = function () { return { breakApart: function () {} }; };
conf.setColumnWidth = function () {};
vm.runInContext('garantirAbaPendencias_ = function () { return __conf; };', ctx);
ctx.__conf = conf;

function escrever(problemas) {
  ctx.escreverConferencia_(problemas);
}
function linhasDaAba() {
  return conf.dados.slice(2).filter(function (l) { return l[0]; });
}
function statusDe(problema) {
  const l = linhasDaAba().filter(function (x) { return String(x[2]) === problema; })[0];
  return l ? String(l[4]) : null;
}
const SEM_CUSTO = 'Sem nenhum custo no período';
const UM_DEFEITO = 'Lançamento sem ID de auditoria';

console.log('\n1. O catálogo já dizia: é informação, não defeito');
ok('"' + SEM_CUSTO + '" está marcada como informativa',
  ctx.pendenciaEhInformativa_(SEM_CUSTO) === true,
  'o texto dela começa com "Não é defeito"');
ok('e uma pendência de verdade não é', ctx.pendenciaEhInformativa_(UM_DEFEITO) === false);

console.log('\n2. Ela entra na aba com status INFORMATIVO');
(function () {
  escrever([
    ['Resumo', 'AAA 0001', SEM_CUSTO, '2026-11 • confirmar se ficou parado'],
    ['Lançamentos', 'BBB 0002', UM_DEFEITO, 'linha 5'],
  ]);
  ok('a informativa nasce como INFORMATIVO', statusDe(SEM_CUSTO) === 'INFORMATIVO',
    JSON.stringify(statusDe(SEM_CUSTO)));
  ok('e a pendência de verdade nasce como PENDENTE', statusDe(UM_DEFEITO) === 'PENDENTE',
    JSON.stringify(statusDe(UM_DEFEITO)));
})();

console.log('\n3. Ela não conta como pendência — e não bloqueia o fechamento');
(function () {
  const e = ctx.estadoConferencia_();
  ok('o contador de pendências vê só a de verdade', e.pendentes === 1,
    JSON.stringify(e) + ' — é este número que o fechamento usa para bloquear');
  ok('e conta os informativos à parte', e.informativos === 1, JSON.stringify(e));
  ok('informativo não vira "exceção aprovada" no fechamento',
    (e.excecoes || []).every(function (x) { return x.problema !== SEM_CUSTO; }),
    JSON.stringify(e.excecoes) + ' — exceção é algo que alguém analisou e liberou');
})();

console.log('\n4. Só a informativa some da fila; a de verdade fica');
(function () {
  escrever([['Resumo', 'AAA 0001', SEM_CUSTO, 'x']]);
  const e = ctx.estadoConferencia_();
  ok('mês só com informativos não tem pendência nenhuma', e.pendentes === 0,
    JSON.stringify(e) + ' — antes, um veículo parado travava o fechamento do mês inteiro');
  const w = ctx.webPendencias('T');
  ok('a tela também não a conta como aberta', w.total === 0 && w.pendentes === 0,
    JSON.stringify({ total: w.total, pendentes: w.pendentes, informativos: w.informativos }));
  ok('e informa quantos informativos existem', w.informativos === 1,
    JSON.stringify(w.informativos) + ' — sem o número, some do painel em vez de mudar de lugar');
  ok('mas ela continua VISÍVEL na lista', w.linhas.length === 1,
    'esconder não é o objetivo: um veículo sem custo nenhum no mês merece um olhar');
  ok('com o status que diz o que ela é', w.linhas[0].status === 'INFORMATIVO',
    JSON.stringify(w.linhas[0].status));
  ok('e a tela sabe que ela é informativa pelo catálogo',
    w.linhas[0].acao && w.linhas[0].acao.tipo === 'informativo', JSON.stringify(w.linhas[0].acao));
})();

console.log('\n5. A escolha de quem operou é respeitada');
(function () {
  escrever([['Resumo', 'AAA 0001', SEM_CUSTO, 'x']]);
  // Alguém marcou EM ANÁLISE: quer olhar esse veículo.
  linhasDaAba()[0][4] = 'EM ANÁLISE';
  escrever([['Resumo', 'AAA 0001', SEM_CUSTO, 'x']]);
  ok('revalidar NÃO desfaz o EM ANÁLISE', statusDe(SEM_CUSTO) === 'EM ANÁLISE',
    JSON.stringify(statusDe(SEM_CUSTO)) + ' — trocar por baixo o que a pessoa marcou ' +
    'é pior do que a classificação errada que isto conserta');
  ok('e aí ela VOLTA a contar como aberta', ctx.estadoConferencia_().pendentes === 1,
    'quem pediu para olhar quer ver na fila');
})();

console.log('\n6. Base antiga: a linha que já estava como PENDENTE');
// Quem já usava o sistema tem essa linha gravada como PENDENTE, do jeito
// antigo. A revalidação tem de reclassificá-la — senão o veículo sem custo
// continua travando o fechamento até alguém marcar RESOLVIDO à mão.
(function () {
  escrever([['Resumo', 'AAA 0001', SEM_CUSTO, 'x']]);
  linhasDaAba()[0][4] = 'PENDENTE';     // como a versão anterior gravava
  ok('antes da revalidação ela conta como pendência',
    ctx.estadoConferencia_().pendentes === 1, JSON.stringify(ctx.estadoConferencia_()));
  escrever([['Resumo', 'AAA 0001', SEM_CUSTO, 'x']]);
  ok('revalidar reclassifica a linha antiga', statusDe(SEM_CUSTO) === 'INFORMATIVO',
    JSON.stringify(statusDe(SEM_CUSTO)) + ' — sem isto, quem já usa o sistema ' +
    'continuaria com o fechamento travado por um veículo parado');
  ok('e ela para de contar', ctx.estadoConferencia_().pendentes === 0,
    JSON.stringify(ctx.estadoConferencia_()));
})();

console.log('\n7. Regras estáticas');
const fonte = fs.readFileSync(arquivo, 'utf8');
const tela = fs.readFileSync('App.html', 'utf8');
(function () {
  ok('INFORMATIVO é um status aceito pela validação da aba',
    /requireValueInList\(STATUS_PENDENCIA_, true\)/.test(fonte),
    'status fora da lista faz o Sheets RECUSAR a escrita — e a linha fica pela metade');
  ok('a lista de status tem um dono só',
    (fonte.match(/const STATUS_PENDENCIA_ = /g) || []).length === 1 &&
    !/\['PENDENTE', 'EM ANÁLISE', 'RESOLVIDO'\]/.test(fonte),
    'duas listas divergiriam: uma aceitaria o status que a outra recusa');
  ok('o filtro "em aberto" da tela esconde o informativo',
    /p\.status === 'RESOLVIDO' \|\| p\.status === 'INFORMATIVO'/.test(tela));
  ok('e o painel mostra quantos são, dizendo que não bloqueiam',
    /Informativos/.test(tela) && /não bloqueiam o fechamento/.test(tela));
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
