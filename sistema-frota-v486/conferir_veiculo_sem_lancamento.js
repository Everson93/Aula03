/**
 * Veículo parado: relatório, não pendência.
 *
 * O usuário viu a linha "Sem nenhum custo no período" na fila de conferência,
 * com um texto que começa em **"Não é defeito"**, e respondeu o óbvio: *"é mais
 * fácil então criar um relatório de veículos sem lançamento e remover eles
 * dali"*. Ele está certo, e a diferença não é de palavra — pendência é algo que
 * alguém tem de resolver para o mês fechar; isto é uma lista para DECIDIR, e
 * decidir pode ser não fazer nada.
 *
 * O que se prova aqui: a linha saiu da conferência (não conta, não bloqueia o
 * fechamento, não existe mais), e o relatório que ficou no lugar responde as
 * duas perguntas úteis — quem está parado há tempo demais para continuar
 * cadastrado como ativo, e quem está rodando sem ninguém lançar.
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
  Object.assign(globalThis, { relatorioSemLancamento_, escreverConferencia_,
    estadoConferencia_, webPendencias, CATALOGO_RELATORIOS,
    STATUS_INFORMATIVO_, STATUS_PENDENCIA_, ACOES_PENDENCIA_,
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



// A aba de conferência, com o mínimo que escreverConferencia_ precisa.
const conf = novaAba('Conferência', ['Origem', 'Placa / ID', 'Problema', 'Detalhe',
  'Status', 'Observação', 'Validado em'], []);
conf.clear = function () { conf.dados.length = 1; conf.dados[0] = new Array(conf.maxCols).fill(''); };
conf.clearConditionalFormatRules = function () {};
conf.setConditionalFormatRules = function () {};
conf.getDataRange = function () { return { breakApart: function () {} }; };
vm.runInContext('garantirAbaPendencias_ = function () { return __conf; };', ctx);
ctx.__conf = conf;

const V = abas['Veículos'];
function cadastrar(placa, centro, ativo, categoria) {
  const l = new Array(15).fill('');
  l[0] = placa; l[1] = 'Veículo ' + placa; l[2] = categoria || 'Truck Normal';
  l[3] = centro; l[10] = ativo === false ? 'NAO' : 'SIM'; l[13] = 'Diesel';
  V.dados.push(l);
  vm.runInContext('VEICULOS_EXEC_CACHE_ = null;', ctx);
}
function lancar(placa, dia, mes, tipo) {
  const lanc = abas['Lançamentos'];
  const l = new Array(lanc.maxCols).fill('');
  l[0] = d(2026, mes || 11, dia); l[1] = placa; l[2] = tipo || 'Pneus'; l[4] = 100;
  l[7] = 'DEPOSITO'; l[8] = 'Truck Normal'; l[10] = 'LAN-' + placa + '-' + mes + dia;
  lanc.dados.push(l);
  vm.runInContext('invalidarCacheLancamentos_();', ctx);
}
function linhasDoRelatorio() { return ctx.relatorioSemLancamento_(null, null, null, null).linhas; }
function placasNoRelatorio() {
  return linhasDoRelatorio().map(function (l) { return String(l[0]); });
}

console.log('\n1. A pendência não existe mais');
(function () {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  ok('nada mais gera "Sem nenhum custo no período"',
    !/problemas\.push\(\[ABAS\.RESUMO, placa, 'Sem nenhum custo no período'/.test(fonte),
    'o texto dela começava com "Não é defeito" e ela bloqueava o fechamento');
  ok('e a explicação dela saiu do catálogo junto',
    !ctx.ACOES_PENDENCIA_['Sem nenhum custo no período'],
    'explicação órfã é pior que nenhuma: descreve algo que não acontece mais');
  ok('o status INFORMATIVO continua ACEITO, para a base da V4.46',
    ctx.STATUS_PENDENCIA_.indexOf('INFORMATIVO') !== -1,
    'se a revalidação recusasse, as linhas da V4.46 voltariam a PENDENTE — e a ' +
    'travar o fechamento por uma versão de meia hora atrás');
  // E, de fato, uma linha gravada pela V4.46 não conta nem bloqueia.
  conf.dados.length = 2;
  conf.dados.push(['Resumo', 'AAA 0001', 'Sem nenhum custo no período', 'x',
    'INFORMATIVO', '', '']);
  ok('linha antiga com esse status não conta como pendência',
    ctx.estadoConferencia_().pendentes === 0, JSON.stringify(ctx.estadoConferencia_()));
})();

console.log('\n2. O relatório responde quem está parado');
(function () {
  // Período aberto: 26/10 a 25/11/2026.
  cadastrar('PAR 0001', 'DEPOSITO');            // parado há meses
  cadastrar('ROD 0002', 'DEPOSITO');            // rodando
  cadastrar('NOV 0003', 'DEPOSITO');            // nunca teve lançamento
  cadastrar('OFF 0004', 'DEPOSITO', false);     // inativo e parado
  lancar('PAR 0001', 10, 7);                    // último lançamento em julho
  lancar('ROD 0002', 10, 11);                   // lançou no período
  const placas = placasNoRelatorio();
  ok('o parado aparece', placas.indexOf('PAR 0001') !== -1, JSON.stringify(placas));
  ok('quem lançou no período NÃO aparece', placas.indexOf('ROD 0002') === -1,
    JSON.stringify(placas));
  ok('quem nunca lançou aparece', placas.indexOf('NOV 0003') !== -1, JSON.stringify(placas));
  ok('e o inativo não entra: parado é o esperado dele',
    placas.indexOf('OFF 0004') === -1, JSON.stringify(placas) +
    ' — misturá-lo com os ativos faria a lista de decisão crescer com o que já foi decidido');
  // Ordem: primeiro quem NUNCA lançou (cadastro que talvez nem devesse existir),
  // depois os parados há mais tempo. É a ordem em que se decide.
  const linhas = linhasDoRelatorio();
  const ultimoSemData = linhas.map(function (l) { return l[4] === null; }).lastIndexOf(true);
  const primeiroComData = linhas.map(function (l) { return l[4] !== null; }).indexOf(true);
  ok('quem nunca lançou vem antes de quem tem data',
    primeiroComData === -1 || ultimoSemData < primeiroComData,
    JSON.stringify(linhas.map(function (l) { return [l[0], l[5]]; })));
  ok('e entre os com data, o mais parado primeiro', (function () {
    const dias = linhas.filter(function (l) { return l[4] !== null; })
      .map(function (l) { return l[5]; });
    return dias.every(function (v, i) { return i === 0 || dias[i - 1] >= v; });
  })(), JSON.stringify(linhas.map(function (l) { return [l[0], l[5]]; })));
})();

console.log('\n3. As colunas sustentam a decisão');
(function () {
  const linha = linhasDoRelatorio().filter(function (l) { return l[0] === 'PAR 0001'; })[0];
  ok('traz a data do último lançamento',
    Object.prototype.toString.call(linha[4]) === '[object Date]', JSON.stringify(linha));
  ok('e há quantos dias está parado', linha[5] > 90, JSON.stringify(linha[5]) +
    ' — é esta coluna que sustenta a conversa de inativar');
  ok('e o que ele lançou por último', String(linha[6]) === 'Pneus', JSON.stringify(linha[6]));
  // Dois lançamentos em meses diferentes, o mais ANTIGO gravado primeiro: a
  // coluna tem de mostrar o ÚLTIMO, senão "dias sem lançar" conta a partir da
  // data errada e o veículo parece parado há mais tempo do que está.
  cadastrar('DOI 0006', 'DEPOSITO');
  lancar('DOI 0006', 5, 5, 'Lavacao/Graxa');
  lancar('DOI 0006', 20, 8, 'Oficina Despesa');
  const dois = linhasDoRelatorio().filter(function (l) { return l[0] === 'DOI 0006'; })[0];
  ok('com dois lançamentos, mostra o mais recente',
    String(dois[6]) === 'Oficina Despesa' && dois[4].getMonth() === 7,
    JSON.stringify([String(dois[6]), dois[4] && dois[4].toISOString().slice(0, 10)]));
  ok('e os dias contam a partir dele',
    dois[5] < linhasDoRelatorio().filter(function (l) { return l[0] === 'PAR 0001'; })[0][5],
    'agosto é mais perto de hoje que julho');

  const nunca = linhasDoRelatorio().filter(function (l) { return l[0] === 'NOV 0003'; })[0];
  ok('quem nunca lançou mostra isso por extenso, sem data inventada',
    nunca[4] === null && /nunca teve lançamento/.test(String(nunca[6])), JSON.stringify(nunca));
  ok('e os dias ficam em branco, não em zero', nunca[5] === null,
    JSON.stringify(nunca[5]) + ' — zero dias parado seria o contrário do que acontece');
})();

console.log('\n3b. Quem só espera a depreciação do mês fica num bloco à parte');
// Na planilha real do usuário, 83 de 166 veículos ativos apareciam "sem
// lançamento" — e mais de 60 eram leves de loja cujo último lançamento foi a
// depreciação automática do mês anterior. Eles não estão abandonados: estão
// esperando a depreciação deste mês, que só é gerada no último dia. Misturar
// os dois faz a lista de decisão nascer com 60 linhas que não pedem decisão.
(function () {
  cadastrar('DEP 0007', 'DEPOSITO');
  // 20/10 fica FORA do período aberto (26/10 a 25/11) — é a depreciação do
  // mês anterior, que é exatamente o caso real.
  lancar('DEP 0007', 20, 10, 'Depreciação');
  const rel = ctx.relatorioSemLancamento_(null, null, null, null);
  const principal = rel.linhas.map(function (l) { return String(l[0]); });
  const bloco = rel.blocos.filter(function (b) { return /depreciação do mês/i.test(b.titulo); })[0];
  const nele = bloco.linhas.map(function (l) { return String(l[0]); });
  ok('ele NÃO está na lista de decisão', principal.indexOf('DEP 0007') === -1,
    JSON.stringify(principal));
  ok('está no bloco de quem espera a depreciação', nele.indexOf('DEP 0007') !== -1,
    JSON.stringify(nele));
  ok('e quem parou de verdade continua na lista principal',
    principal.indexOf('PAR 0001') !== -1, JSON.stringify(principal));
  ok('o subtítulo diz quantos são de cada tipo',
    /só esperam a depreciação do mês/.test(
      rel.blocos.filter(function (b) { return /Há quanto tempo/.test(b.titulo); })[0].subtitulo),
    rel.blocos.filter(function (b) { return /Há quanto tempo/.test(b.titulo); })[0].subtitulo);
  ok('e as faixas de tempo contam só os parados de verdade',
    rel.blocos.filter(function (b) { return /Há quanto tempo/.test(b.titulo); })[0]
      .linhas.reduce(function (s, l) { return s + l[1]; }, 0) === principal.length,
    'senão o número da faixa não bate com a lista que está logo abaixo');
})();

console.log('\n4. Os dois lados do cadastro');
(function () {
  lancar('OFF 0004', 12, 11);     // inativo que recebeu lançamento no período
  vm.runInContext('VEICULOS_EXEC_CACHE_ = null;', ctx);
  const rel = ctx.relatorioSemLancamento_(null, null, null, null);
  const outro = rel.blocos.filter(function (b) { return /inativo/i.test(b.titulo); })[0];
  ok('o inativo COM lançamento aparece no bloco do outro lado',
    outro.linhas.some(function (l) { return String(l[0]) === 'OFF 0004'; }),
    JSON.stringify(outro.linhas));
  const faixas = rel.blocos.filter(function (b) { return /Há quanto tempo/.test(b.titulo); })[0];
  ok('o bloco de faixas separa quem nunca lançou dos parados',
    faixas.linhas.some(function (l) { return /Nunca tiveram/.test(String(l[0])); }) &&
    faixas.linhas.some(function (l) { return /mais de 90/.test(String(l[0])); }),
    JSON.stringify(faixas.linhas));
  ok('e o subtítulo diz quantos de quantos', /de \d+ veículo\(s\) ativo\(s\)/.test(faixas.subtitulo),
    faixas.subtitulo);
})();

console.log('\n5. Filtros e período');
(function () {
  cadastrar('LOJ 0005', 'LOJA 05');
  const soDeposito = ctx.relatorioSemLancamento_('DEPOSITO', null, null, null).linhas
    .map(function (l) { return String(l[0]); });
  ok('filtro de loja recorta a lista', soDeposito.indexOf('LOJ 0005') === -1 &&
    soDeposito.indexOf('PAR 0001') !== -1, JSON.stringify(soDeposito));
  // Em julho, o PAR 0001 lançou: no recorte de julho ele não está parado.
  const julho = ctx.relatorioSemLancamento_(null, null, null,
    { de: '2026-07-01', ate: '2026-07-31' }).linhas.map(function (l) { return String(l[0]); });
  ok('o período escolhido muda quem está parado', julho.indexOf('PAR 0001') === -1,
    JSON.stringify(julho) + ' — em julho ele lançou');
})();

console.log('\n6. Regras estáticas');
(function () {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  ok('o relatório está no catálogo e no switch',
    !!ctx.CATALOGO_RELATORIOS['Veículos sem lançamento no período'] &&
    fonte.indexOf("case 'Veículos sem lançamento no período':") !== -1);
  ok('e aceita recorte de datas (a fonte é a base de lançamentos)',
    ctx.CATALOGO_RELATORIOS['Veículos sem lançamento no período'].fonte === 'lancamentos');
  ok('a base é lida UMA vez para as duas perguntas',
    (fonte.slice(fonte.indexOf('function relatorioSemLancamento_'),
      fonte.indexOf('function relatorioFrotaTransporte_'))
      .match(/lerLancamentos_\(\)/g) || []).length === 1,
    'quem teve lançamento no recorte e qual foi o último de cada um saem da mesma passada');
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
