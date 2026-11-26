/**
 * Parâmetros do período e apagar período: os dois caminhos que mexem na base
 * inteira de uma vez.
 *
 * `webSalvarParametro` muda a competência aberta e o dia de corte — e mudar o
 * corte REESCREVE a competência de todo lançamento já registrado. `apagarPeriodo_`
 * apaga linhas de Lançamentos e de Odômetro por intervalo de data, e é chamado
 * pelo importador antes de trazer o mês de novo. Nenhum dos dois era citado por
 * suíte nenhuma.
 *
 * O que se prova aqui é sobretudo a RECUSA: parâmetro aceito errado não dá
 * erro, muda o significado de todos os relatórios de uma vez.
 */
const fs = require('fs');
const vm = require('vm');
const arquivo = 'Codigo.gs';

const abas = {};
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
      return r;
    },
    deleteRow: function (n) { aba.dados.splice(n - 1, 1); },
    deleteRows: function (inicio, quantas) { aba.dados.splice(inicio - 1, quantas); },
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
    newDataValidation: () => ({ requireValueInList: function () { return this; },
      setAllowInvalid: function () { return this; }, build: function () { return {}; } }),
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
  Object.assign(globalThis, { webSalvarParametro, apagarPeriodo_, periodoDoMes_,
    impactoDoCorteNosFechados_, textoImpactoDoCorte_,
    normalizarFormatosParametros_, LINHA_PARAM_INICIAL,
    normalizarMesReferencia_, PARAMETROS_PADRAO, salvarLancamento_, ABAS, COL_LANC, L_, COL_VEIC, COL_CENTRO });
  exigirExecucaoOperacional_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  registrarLog_ = function (acao, detalhe) { __log.push(acao + ': ' + detalhe); };
  atualizarResumoSeguro_ = function () {};
  invalidarCacheInicio_ = function () {};
  emailContextoAtual_ = function () { return 'operador@giassi.com.br'; };
  execucaoTemPlanilhaAtiva_ = function () { return true; };
  autorizarContextoWeb_ = function () {};
  exigirPerfilToken_ = function () {};
  atualizarResumoSeguro_ = function () { return 0; };
  // Efeitos pesados que não são o objeto desta prova.
  reconstruirRelatorios_ = function () { __efeitos.push('reconstruirRelatorios'); };
  montarCentralOperacional_ = function () { __efeitos.push('montarCentralOperacional'); };
  formatarLancamentos_ = function () { __efeitos.push('formatarLancamentos'); };
  invalidarCacheSaude_ = function () {};
  garantirTriggerAlertaDiario_ = function () {};
  gravarParam_ = function (nome, valor) {
    __gravados.push({ nome: nome, valor: valor });
    __param[nome] = valor;
    PARAM_EXEC_CACHE_ = null;
  };
  param_ = function (nome) {
    if (__param[nome] === undefined) throw new Error('Parâmetro não encontrado: ' + nome);
    return __param[nome];
  };
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
const PARAMETROS_PADRAO_N = ctx.PARAMETROS_PADRAO.length;

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


ctx.__gravados = [];
ctx.__efeitos = [];
ctx.__param = {
  MES_REFERENCIA: '2026-11', EMPRESA: 'Giassi', DIA_FIM_PERIODO: 25, DIA_INICIO_PERIODO: 26,
  DOMINIOS_LOGIN: 'giassi.com.br', HORA_ALERTA: 7, ESTOQUE_MINIMO_L: 500,
  CUSTO_HORA_MOTORISTA: 30, EMAIL_ALERTAS: '', BASE_RATEIO: 'LOJA', GRUPOS_FROTA: '',
};
function salvar(nome, valor) {
  ctx.__gravados = [];
  try { return ctx.webSalvarParametro('T', nome, valor); }
  catch (e) { return { ok: false, excecao: true, mensagem: e.message }; }
}
function gravouAlgo() { return ctx.__gravados.length > 0; }

console.log('\n1. Parâmetro que não existe não entra');
(function () {
  const r = salvar('PARAMETRO_INVENTADO', 'qualquer');
  ok('recusa', r.ok === false && /desconhecido/.test(String(r.mensagem)), r.mensagem);
  ok('e não grava nada', !gravouAlgo(), JSON.stringify(ctx.__gravados));
})();

console.log('\n2. Competência aberta (MES_REFERENCIA)');
(function () {
  const ruim = salvar('MES_REFERENCIA', 'novembro');
  ok('formato inválido é recusado',
    ruim.ok === false && /AAAA-MM/.test(String(ruim.mensagem)), ruim.mensagem);
  ok('e não grava', !gravouAlgo(), JSON.stringify(ctx.__gravados));
  const igual = salvar('MES_REFERENCIA', '2026-11');
  ok('mudar para o mês que já está aberto não faz nada',
    igual.ok === true && /já é/.test(String(igual.mensagem)) && !gravouAlgo(), igual.mensagem);
  const bom = salvar('MES_REFERENCIA', '2026-12');
  ok('mês válido é aceito', bom.ok === true, bom.mensagem);
  ok('e manda a tela recarregar (o período mudou embaixo dela)',
    bom.recarregar === true, JSON.stringify(bom));
  ok('a mensagem diz o intervalo novo, não só o mês',
    /\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}/.test(String(bom.mensagem)), bom.mensagem);
  ctx.__param.MES_REFERENCIA = '2026-11';
})();

console.log('\n3. Mês já fechado: aceita, mas AVISA');
(function () {
  novaAba('Fechado 2026-10', ['Período'], []);
  const r = salvar('MES_REFERENCIA', '2026-10');
  ok('reabrir um mês fechado é permitido', r.ok === true, r.mensagem);
  ok('com aviso de que vai divergir do fechamento guardado',
    /já tinha sido fechado/.test(String(r.mensagem)) && /Auditoria/.test(String(r.mensagem)),
    r.mensagem + ' — aceitar em silêncio esconderia a divergência até o fechamento seguinte');
  ctx.__param.MES_REFERENCIA = '2026-11';
})();

console.log('\n4. Dia de corte');
(function () {
  const derivado = salvar('DIA_INICIO_PERIODO', 1);
  ok('o dia de abertura não é editável: é derivado do corte',
    derivado.ok === false && /derivado/.test(String(derivado.mensagem)), derivado.mensagem);
  ok('e não grava', !gravouAlgo());
  [0, 32, 'abc'].forEach(function (v) {
    const r = salvar('DIA_FIM_PERIODO', v);
    ok('corte ' + JSON.stringify(v) + ' é recusado',
      r.ok === false && /1 a 31/.test(String(r.mensagem)), r.mensagem);
  });
  ctx.__efeitos = [];
  const bom = salvar('DIA_FIM_PERIODO', 28);
  ok('corte 28 é aceito', bom.ok === true, bom.mensagem);
  ok('e a competência da base inteira é recalculada',
    ctx.__efeitos.indexOf('formatarLancamentos') !== -1, JSON.stringify(ctx.__efeitos) +
    ' — a coluna Período é fórmula: sem reescrevê-la, os relatórios ficam com o corte velho');
  ok('o dia de abertura acompanha sozinho',
    ctx.__gravados.some(function (g) { return g.nome === 'DIA_INICIO_PERIODO'; }),
    JSON.stringify(ctx.__gravados));
  ctx.__param.DIA_FIM_PERIODO = 25;
  ctx.__param.DIA_INICIO_PERIODO = 26;
})();

console.log('\n5. Os outros parâmetros também são conferidos');
(function () {
  const casos = [
    ['EMPRESA', '   ', /EMPRESA não pode ficar vazia/],
    ['DOMINIOS_LOGIN', 'isso não é domínio', /Domínio inválido|pelo menos um domínio/],
    ['HORA_ALERTA', 24, /0 a 23/],
    ['ESTOQUE_MINIMO_L', -1, /maior ou igual a zero/],
    ['CUSTO_HORA_MOTORISTA', -5, /não negativo/],
    ['BASE_RATEIO', '', /não pode ficar vazia/],
  ];
  casos.forEach(function (c) {
    const r = salvar(c[0], c[1]);
    ok(c[0] + ' com valor inválido é recusado',
      r.ok === false && c[2].test(String(r.mensagem)), r.mensagem);
    ok('  …e nada é gravado', !gravouAlgo(), JSON.stringify(ctx.__gravados));
  });
})();

console.log('\n6. Apagar período apaga o intervalo — e só ele');
(function () {
  const lanc = abas['Lançamentos'];
  const odo = abas['Odômetro'];
  lanc.dados.length = 1;
  odo.dados.length = 1;
  function linha(dia, placa, id) {
    const l = new Array(lanc.maxCols).fill('');
    l[0] = d(2026, dia < 26 ? 11 : 10, dia < 26 ? dia : dia);
    l[1] = placa; l[2] = 'Pneus'; l[4] = 100; l[10] = id;
    return l;
  }
  // Período aberto: 26/10 a 25/11. Dentro: 01/11 e 20/11. Fora: 30/11.
  lanc.dados.push(linha(1, 'AAA 0001', 'LAN-DENTRO-1'));
  lanc.dados.push(linha(20, 'AAA 0001', 'LAN-DENTRO-2'));
  const fora = new Array(lanc.maxCols).fill('');
  fora[0] = d(2026, 11, 30); fora[1] = 'AAA 0001'; fora[2] = 'Pneus'; fora[4] = 100;
  fora[10] = 'LAN-FORA';
  lanc.dados.push(fora);
  // Uma linha com data inválida: a limitação conhecida, provada em vez de suposta.
  const semData = new Array(lanc.maxCols).fill('');
  semData[1] = 'AAA 0001'; semData[2] = 'Pneus'; semData[4] = 100; semData[10] = 'LAN-SEM-DATA';
  lanc.dados.push(semData);
  odo.dados.push([d(2026, 11, 2), 'AAA 0001', 1000]);
  odo.dados.push([d(2026, 11, 30), 'AAA 0001', 2000]);
  vm.runInContext('invalidarCacheLancamentos_(); invalidarCacheOdometro_();', ctx);

  ctx.apagarPeriodo_(ctx.periodoDoMes_('2026-11'));
  const ids = lanc.dados.slice(1).filter(function (l) { return l[1]; })
    .map(function (l) { return String(l[10]); });
  ok('os lançamentos do período saíram',
    ids.indexOf('LAN-DENTRO-1') === -1 && ids.indexOf('LAN-DENTRO-2') === -1, JSON.stringify(ids));
  ok('o de fora do período ficou', ids.indexOf('LAN-FORA') !== -1, JSON.stringify(ids));
  ok('a leitura de odômetro do período saiu e a de fora ficou',
    odo.dados.slice(1).filter(function (l) { return l[1]; }).length === 1 &&
    Number(odo.dados[1][2]) === 2000,
    JSON.stringify(odo.dados.slice(1)));
  ok('LIMITAÇÃO CONHECIDA: linha sem data válida NÃO é apagada',
    ids.indexOf('LAN-SEM-DATA') !== -1, JSON.stringify(ids) +
    ' — ela sobrevive à reimportação e vira lançamento órfão; está no ANALISE_TECNICA');
})();

console.log('\n6b. Mudar o corte avisa o que acontece com mês já fechado');
// Mudar o dia de corte reescreve a competência de TODA a base, inclusive a de
// meses já fechados com hash de integridade. Não é proibido — o usuário trocou
// para mês civil de propósito. O que não pode é acontecer em silêncio: a
// Auditoria aponta a divergência depois, e três meses adiante ninguém lembra
// por quê.
(function () {
  const lanc = abas['Lançamentos'];
  lanc.dados.length = 1;
  function linha(dia, mes, id) {
    const l = new Array(lanc.maxCols).fill('');
    l[0] = d(2026, mes, dia); l[1] = 'AAA 0001'; l[2] = 'Pneus'; l[4] = 100; l[10] = id;
    return l;
  }
  // Com corte 25: 28/10 e 30/10 são competência 2026-11. Com mês civil: 2026-10.
  lanc.dados.push(linha(28, 10, 'LAN-A'));
  lanc.dados.push(linha(30, 10, 'LAN-B'));
  lanc.dados.push(linha(10, 11, 'LAN-C'));   // novembro nos dois critérios
  // O caso que SAI de um mês fechado: com corte 25, 26/09 é competência
  // 2026-10 (fechada); com mês civil, volta para setembro. Foi o que aconteceu
  // de verdade na planilha do usuário — 89 lançamentos, R$ 100 mil.
  lanc.dados.push(linha(26, 9, 'LAN-D'));
  vm.runInContext('invalidarCacheLancamentos_(); CORTE_COMPETENCIA_EXEC_ = null;', ctx);
  novaAba('Histórico', ['Período', 'Total', 'Qtd', 'Hash', 'Em', 'Quem'], [['2026-10', 1, 1, 'h', '', '']]);
  const imp = ctx.impactoDoCorteNosFechados_(31);
  ok('conta os lançamentos que trocam de competência', imp.movidos === 3,
    JSON.stringify(imp) + ' — 28/10 e 30/10 entram em outubro; 26/09 SAI dele');
  ok('acusa tanto quem entra quanto quem SAI do mês fechado',
    imp.fechadosAfetados[0].lancamentos === 3, JSON.stringify(imp.fechadosAfetados) +
    ' — olhar só um lado deixaria passar o lançamento que o fechado perde');
  ok('e aponta o mês FECHADO afetado',
    imp.fechadosAfetados.length === 1 && imp.fechadosAfetados[0].mes === '2026-10',
    JSON.stringify(imp.fechadosAfetados));
  const texto = ctx.textoImpactoDoCorte_(imp);
  ok('o aviso cita o mês e fala do hash',
    /2026-10/.test(texto) && /hash de integridade/.test(texto), texto);
  ok('e diz o que fazer para alinhar', /reabra e feche/i.test(texto), texto);
  const semFechado = ctx.textoImpactoDoCorte_({ movidos: 0, fechadosAfetados: [] });
  ok('sem nada para avisar, não enche a mensagem', semFechado === '', JSON.stringify(semFechado));
  // E o caminho inteiro: o aviso chega na resposta de quem trocou o corte.
  ctx.__efeitos = [];
  const r = salvar('DIA_FIM_PERIODO', 31);
  ok('trocar para mês civil é aceito', r.ok === true, r.mensagem);
  ok('e a resposta carrega o aviso do mês fechado',
    /JÁ FECHADA/.test(String(r.mensagem)) && /2026-10/.test(String(r.mensagem)),
    r.mensagem);
  ctx.__param.DIA_FIM_PERIODO = 25;
  vm.runInContext('CORTE_COMPETENCIA_EXEC_ = null;', ctx);
})();

console.log('\n6c. As células de parâmetro não são data');
// Na planilha do usuário, HORA_ALERTA aparecia como 07/01/1900 e
// ESTOQUE_MINIMO_L como 14/05/1901: os valores (7 e 500) estavam certos, o
// formato da célula é que tinha ficado dd/mm/yyyy de quando as linhas do
// "PERÍODO CALCULADO" ocupavam aquelas posições, versões atrás.
//
// E o dublê aqui IMITA A CONVERSÃO do Sheets: sair do formato texto reinterpreta
// o conteúdo na hora. Sem isso a prova olhava só o formato final — que terminava
// certo — e aprovava um código que destruía a competência no caminho.
function fakeParametros(valorInicial) {
  const estado = { valor: valorInicial, formato: '@', formatos: [], escritas: [] };
  function cel(linha, coluna, nL) {
    const daPrimeira = linha === 4 && coluna === 2;
    const abrange = daPrimeira || (coluna === 2 && linha <= 4 && 4 < linha + (nL || 1));
    return {
      setNumberFormat: function (f) {
        if (abrange) {
          estado.formatos.push(f);
          // A conversão do Sheets: texto que parece data deixa de ser texto.
          if (f !== '@' && /^\d{4}-\d{1,2}$/.test(String(estado.valor))) {
            const partes = String(estado.valor).split('-');
            estado.valor = Math.round(
              (Date.UTC(Number(partes[0]), Number(partes[1]) - 1, 1) - Date.UTC(1899, 11, 30)) / 86400000);
          }
          estado.formato = f;
        }
        return this;
      },
      setValue: function (v) { if (abrange) { estado.valor = v; estado.escritas.push(v); } return this; },
      getValue: function () { return abrange ? estado.valor : ''; },
    };
  }
  return { estado: estado, fake: { getRange: cel } };
}
(function () {
  const alvo = fakeParametros('2026-12');
  ctx.normalizarFormatosParametros_(alvo.fake, PARAMETROS_PADRAO_N);
  ok('a linha do MES_REFERENCIA nunca sai do formato texto',
    alvo.estado.formatos.every(function (f) { return f === '@'; }),
    'aplicou ' + JSON.stringify(alvo.estado.formatos) +
    ' — sair de "@" converte "2026-12" em data na hora, e o "@" de volta mostra 46357');
  ok('e a competência continua valendo 2026-12 depois da normalização',
    alvo.estado.valor === '2026-12', 'ficou ' + JSON.stringify(alvo.estado.valor));

  // A célula que JÁ nasceu convertida tem de se consertar sozinha: 46357 é
  // 01/12/2026, e foi o número que apareceu no erro do usuário.
  const quebrada = fakeParametros(46357);
  ctx.normalizarFormatosParametros_(quebrada.fake, PARAMETROS_PADRAO_N);
  ok('a célula que já estava com o número de série volta a ser AAAA-MM',
    quebrada.estado.valor === '2026-12', 'ficou ' + JSON.stringify(quebrada.estado.valor));

  // Valor que ninguém sabe ler não é apagado: melhor estranho que vazio.
  const perdida = fakeParametros('novembro');
  ctx.normalizarFormatosParametros_(perdida.fake, PARAMETROS_PADRAO_N);
  ok('valor ilegível é mantido, não apagado', perdida.estado.valor === 'novembro',
    'ficou ' + JSON.stringify(perdida.estado.valor));

  // As OUTRAS linhas é que precisam perder o formato de data.
  const outras = {};
  ctx.normalizarFormatosParametros_({
    getRange: function (linha, coluna, nL) {
      return { setNumberFormat: function (f) {
        for (let i = 0; i < (nL || 1); i++) outras[(linha + i) + ':' + coluna] = f;
        return this;
      }, setValue: function () { return this; }, getValue: function () { return '2026-12'; } };
    },
  }, PARAMETROS_PADRAO_N);
  const ini = ctx.LINHA_PARAM_INICIAL;
  ok('as outras linhas de parâmetro saem do formato de data',
    [...Array(PARAMETROS_PADRAO_N - 1).keys()].every(function (i) {
      return outras[(ini + 1 + i) + ':2'] === 'General';
    }), JSON.stringify(outras));
  ok('e a normalização cobre a lista de parâmetros inteira',
    PARAMETROS_PADRAO_N === ctx.PARAMETROS_PADRAO.length && PARAMETROS_PADRAO_N > 1,
    'uma lista com um item só faria a prova passar sem testar nada');

  const fonte = fs.readFileSync(arquivo, 'utf8');
  ok('o Instalar e a troca de período chamam a normalização',
    // A CHAMADA, não a definição: a linha do `function` casa com o mesmo
    // texto, e a regra contaria três onde há duas.
    (fonte.match(/^\s+normalizarFormatosParametros_\(sheet/gm) || []).length === 2,
    'só no Instalar obrigaria a reinstalar para consertar o formato');
})();

console.log('\n6d. Competência lida de um número de série');
// O erro que o usuário viu: "MES_REFERENCIA inválido: 46357". Com formato de
// texto por cima de um valor já convertido, a célula devolve o SERIAL, não um
// Date — e a leitura morria aí, sem caminho de volta.
(function () {
  ok('46357 é lido como 2026-12', ctx.normalizarMesReferencia_(46357) === '2026-12',
    'virou ' + ctx.normalizarMesReferencia_(46357));
  ok('o serial também é aceito como texto', ctx.normalizarMesReferencia_('46357') === '2026-12',
    'a célula com formato "@" devolve o número como texto');
  ok('46327 é lido como 2026-11', ctx.normalizarMesReferencia_(46327) === '2026-11');
  ok('o último dia do mês não escorrega para o mês seguinte',
    ctx.normalizarMesReferencia_(46356) === '2026-11',
    '46356 = 30/11/2026; arredondar para cima trocaria a competência');
  let erro = '';
  try { ctx.normalizarMesReferencia_(7); } catch (e) { erro = e.message; }
  ok('HORA_ALERTA = 7 não vira janeiro de 1900', /inválido/.test(erro),
    'aceitar qualquer número faria um parâmetro trocado passar por competência');
  erro = '';
  try { ctx.normalizarMesReferencia_(500); } catch (e) { erro = e.message; }
  ok('ESTOQUE_MINIMO_L = 500 também não', /inválido/.test(erro), erro);
  erro = '';
  try { ctx.normalizarMesReferencia_('2026'); } catch (e) { erro = e.message; }
  ok('"2026" sozinho continua inválido', /inválido/.test(erro),
    'um ano sem mês não é competência');
})();

console.log('\n7. Regras estáticas');
const fonte = fs.readFileSync(arquivo, 'utf8');
(function () {
  ok('só parâmetro do catálogo pode ser gravado',
    /const permitidos = PARAMETROS_PADRAO\.map[\s\S]{0,160}Parâmetro desconhecido/.test(fonte),
    'sem a lista, qualquer nome entraria na aba Parâmetros e ninguém saberia de onde veio');
  ok('mudar o corte reescreve a competência ANTES dos relatórios', (function () {
    const corpo = fonte.slice(fonte.indexOf('function webSalvarParametro'),
      fonte.indexOf('function webFornecedores'));
    // CHAMADA, não menção: o comentário logo acima cita
    // `reconstruirRelatorios_()` para explicar por que ele não basta, e
    // procurar o texto cru encontrava o comentário — a prova mediria a
    // documentação em vez da ordem de execução.
    function posicaoDaChamada(nome) {
      const m = new RegExp('^\\s*' + nome + '\\(\\);', 'm').exec(corpo);
      return m ? m.index : -1;
    }
    const fmt = posicaoDaChamada('formatarLancamentos_');
    const rel = posicaoDaChamada('reconstruirRelatorios_');
    return fmt > 0 && rel > 0 && fmt < rel;
  })(), 'na ordem inversa, os relatórios saem com o corte velho');
  ok('apagar período apaga Lançamentos E Odômetro',
    /\[ABAS\.LANCAMENTOS, ABAS\.ODOMETRO\]\.forEach/.test(fonte),
    'apagar só um lado deixaria KM de um mês que não tem mais lançamento');
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
