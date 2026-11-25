/**
 * A carga da bomba: o número que define o custo de TODO abastecimento interno.
 *
 * A auditoria do projeto apontou que `webSalvarCargaBomba`, `webEditarCargaBomba`,
 * `webExcluirCargaBomba` e `webAjustarEstoqueBomba` não eram citados por
 * nenhuma suíte — e corrigir uma carga **revaloriza** todos os abastecimentos
 * internos do período aberto a partir daquela data. Errar aqui não erra um
 * lançamento: erra o custo de combustível do mês inteiro, para trás.
 *
 * O que se prova aqui é, principalmente, o que NÃO pode ser tocado pela
 * revalorização: abastecimento externo (tem NF própria), outro produto, data
 * anterior à da carga corrigida, fora do período aberto e — o mais delicado —
 * lançamento legado, aquele cujo valor foi digitado antes de existir controle
 * de bomba. Reescrever um desses é reescrever história que ninguém pediu.
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
  };
  abas[nome] = aba;
  return aba;
}

let __uuid = 0;
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
    // UUID diferente a cada chamada: o ID do lançamento são os 10 primeiros
    // caracteres dele. Com um fixo, todo lançamento nasce com o mesmo ID e
    // procurar "o valor do lançamento X" devolve sempre o primeiro — a suíte
    // mediria outra linha sem notar.
    getUuid: () => String(++__uuid).padStart(8, '0') + '-bbbb-cccc-dddd-eeeeeeeeeeee',
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
  Object.assign(globalThis, { webSalvarCargaBomba, webEditarCargaBomba,
    webExcluirCargaBomba, webAjustarEstoqueBomba, cargaPorLinha_, ehAjusteEstoque_,
    estadoTanque_, lerCargasBomba_, COL_CARGA, PRODUTO_DIESEL, PRODUTO_ARLA,
    MIN_JUSTIFICATIVA_, salvarLancamento_, ABAS, COL_LANC, L_, COL_VEIC, COL_CENTRO });
  exigirExecucaoOperacional_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  registrarLog_ = function (acao, detalhe) { __log.push(acao + ': ' + detalhe); };
  atualizarResumoSeguro_ = function () {};
  invalidarCacheInicio_ = function () {};
  emailContextoAtual_ = function () { return 'operador@giassi.com.br'; };
  execucaoTemPlanilhaAtiva_ = function () { return true; };
  autorizarContextoWeb_ = function () {};
  atualizarResumoSeguro_ = function () { return 0; };
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


const cargas = abas['Carga na Bomba'];
function linhasCarga() {
  return cargas.dados.slice(1).filter(function (l) { return l[COL.DOCUMENTO - 1]; });
}
const COL = { DATA: 1, DOCUMENTO: 2, PRODUTO: 3, QUANTIDADE: 4, VALOR: 5, PRECO_LITRO: 6, OBSERVACAO: 7 };
function valorDoLancamento(id) {
  const l = abas['Lançamentos'].dados.slice(1).filter(function (x) { return String(x[10]) === id; })[0];
  return l ? Number(l[4]) : null;
}
function abastecer(dia, litros, extra) {
  const dados = {
    placa: 'AAA 0001', tipo: 'Combustivel Proprio', tipoAbastecimento: 'Interno',
    data: '2026-11-' + ('0' + dia).slice(-2), litros: litros, valor: '',
    permitirDuplicado: true,
  };
  Object.keys(extra || {}).forEach(function (k) { dados[k] = extra[k]; });
  const r = gravar(dados);
  if (!r.ok) console.log('      (abastecimento recusado: ' + String(r.mensagem).split('\n')[0] + ')');
  return r;
}
const JUSTIFICATIVA = 'NF veio com o valor errado do fornecedor';

console.log('\n1. Registrar carga: o que entra e o que é recusado');
(function () {
  const r = ctx.webSalvarCargaBomba('T', { data: '2026-11-03', produto: 'DIESEL S10',
    quantidade: 2000, valor: 14000, documento: 'NF 700' });
  ok('carga válida entra', r.ok === true, r.mensagem);
  const semNf = ctx.webSalvarCargaBomba('T', { data: '2026-11-03', produto: 'DIESEL S10',
    quantidade: 100, valor: 700, documento: '' });
  ok('sem NF é recusada', semNf.ok === false && /NF da carga/.test(semNf.mensagem), semNf.mensagem);
  const zero = ctx.webSalvarCargaBomba('T', { data: '2026-11-03', produto: 'DIESEL S10',
    quantidade: 0, valor: 700, documento: 'NF 701' });
  ok('quantidade zero é recusada', zero.ok === false, zero.mensagem);
  const produto = ctx.webSalvarCargaBomba('T', { data: '2026-11-03', produto: 'GASOLINA',
    quantidade: 100, valor: 700, documento: 'NF 702' });
  ok('produto que não é do tanque é recusado',
    produto.ok === false && /Produto inválido/.test(produto.mensagem), produto.mensagem);
  const repetida = ctx.webSalvarCargaBomba('T', { data: '2026-11-03', produto: 'DIESEL S10',
    quantidade: 2000, valor: 14000, documento: 'NF 700' });
  ok('a MESMA NF, no mesmo dia, pede confirmação',
    repetida.ok === false && repetida.duplicidade === true, repetida.mensagem);
  const confirmada = ctx.webSalvarCargaBomba('T', { data: '2026-11-03', produto: 'DIESEL S10',
    quantidade: 2000, valor: 14000, documento: 'NF 700', confirmarDuplicidade: true });
  ok('e passa quando o operador confirma', confirmada.ok === true, confirmada.mensagem);
})();

console.log('\n2. Corrigir a carga revaloriza o abastecimento interno');
// A fixture já tem NF 500: 5.000 L por R$ 30.000 (R$ 6,00/L) em 01/11.
// Cada abastecimento interno sai pelo preço da ÚLTIMA carga até aquela data.
(function () {
  // Desfaz o que o bloco 1 colocou no tanque, para o preço do litro ser só o da NF 500.
  while (linhasCarga().length > 1) {
    const ultima = linhasCarga().length + 1;
    cargas.dados[ultima - 1] = new Array(cargas.maxCols).fill('');
  }
  vm.runInContext('invalidarCacheLancamentos_(); CARGAS_EXEC_CACHE_ = null;', ctx);
  const a = abastecer(5, 100);
  ok('o abastecimento interno sai a R$ 6,00/L', valorDoLancamento(a.id) === 600,
    JSON.stringify(valorDoLancamento(a.id)));

  const original = { data: '2026-11-01', produto: 'DIESEL S10', documento: 'NF 500' };
  const r = ctx.webEditarCargaBomba('T', 2, original, { data: '2026-11-01',
    produto: 'DIESEL S10', quantidade: 5000, valor: 25000, documento: 'NF 500' }, JUSTIFICATIVA);
  ok('a correção é aceita', r.ok === true, r.mensagem);
  ok('e o abastecimento foi revalorizado para R$ 5,00/L', valorDoLancamento(a.id) === 500,
    JSON.stringify(valorDoLancamento(a.id)) +
    ' — sem isto, o custo do mês fica com o preço da nota errada');
  ok('a mensagem diz quantos foram revalorizados e a diferença',
    /1 abastecimento\(s\) interno\(s\) do período aberto foram revalorizados/.test(r.mensagem) &&
    /R\$ -100,00/.test(r.mensagem), r.mensagem);
  ok('e informa o saldo e o preço do litro depois da correção',
    /saldo .* L, litro a R\$ 5,0000/.test(r.mensagem), r.mensagem);
})();

console.log('\n3. O que a revalorização NÃO pode tocar');
(function () {
  // Externo: tem NF própria, o valor é o da nota do posto.
  const ext = gravar({ placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-06',
    litros: 50, valor: 400, documento: 'NF POSTO 1', permitirDuplicado: true });
  // ARLA: outro tanque. Um EXTERNO (nota própria) e um INTERNO, que sai do
  // tanque de ARLA — é ele que prova que corrigir a carga de diesel não mexe
  // no outro produto.
  const arla = gravar({ placa: 'AAA 0001', tipo: 'Arla 32', tipoAbastecimento: 'Externo',
    data: '2026-11-06', litros: 20, valor: 180, documento: 'NF ARLA 1', permitirDuplicado: true });
  ctx.webSalvarCargaBomba('T', { data: '2026-11-02', produto: 'ARLA 32',
    quantidade: 500, valor: 1500, documento: 'NF ARLA CARGA' });
  vm.runInContext('invalidarCacheLancamentos_(); CARGAS_EXEC_CACHE_ = null;', ctx);
  const arlaInterno = gravar({ placa: 'AAA 0001', tipo: 'Arla 32', tipoAbastecimento: 'Interno',
    data: '2026-11-06', litros: 10, valor: '', permitirDuplicado: true });
  ok('o ARLA interno sai a R$ 3,00/L (a carga dele)',
    valorDoLancamento(arlaInterno.id) === 30, JSON.stringify(valorDoLancamento(arlaInterno.id)));
  // Legado: interno gravado SEM a origem marcada (valor digitado à mão, antes
  // do controle de bomba). A coluna O fica vazia de propósito.
  const legado = abastecer(7, 70);
  const linhaLegado = abas['Lançamentos'].dados.slice(1)
    .filter(function (x) { return String(x[10]) === legado.id; })[0];
  linhaLegado[14] = '';          // tipo de abastecimento apagado
  linhaLegado[4] = 123.45;       // valor "digitado à mão"
  vm.runInContext('invalidarCacheLancamentos_();', ctx);

  const original = { data: '2026-11-01', produto: 'DIESEL S10', documento: 'NF 500' };
  const r = ctx.webEditarCargaBomba('T', 2, original, { data: '2026-11-01',
    produto: 'DIESEL S10', quantidade: 5000, valor: 20000, documento: 'NF 500' }, JUSTIFICATIVA);
  ok('a correção roda', r.ok === true, r.mensagem);
  ok('o abastecimento EXTERNO fica com o valor da nota dele',
    valorDoLancamento(ext.id) === 400, JSON.stringify(valorDoLancamento(ext.id)));
  ok('o ARLA externo não é tocado pela carga de diesel',
    valorDoLancamento(arla.id) === 180, JSON.stringify(valorDoLancamento(arla.id)));
  ok('e o ARLA INTERNO também não — é outro tanque, outro preço',
    valorDoLancamento(arlaInterno.id) === 30, JSON.stringify(valorDoLancamento(arlaInterno.id)) +
    ' — misturar os dois produtos na mesma simulação dá preço de litro de ninguém');
  ok('e o lançamento LEGADO, sem origem marcada, fica como estava',
    valorDoLancamento(legado.id) === 123.45, JSON.stringify(valorDoLancamento(legado.id)) +
    ' — reescrever valor digitado à mão é reescrever história que ninguém pediu');
})();

console.log('\n4. A data da correção limita o que é revalorizado');
(function () {
  // Carga nova em 10/11: só o que vem a partir dali pode mudar quando ELA é corrigida.
  ctx.webSalvarCargaBomba('T', { data: '2026-11-10', produto: 'DIESEL S10',
    quantidade: 1000, valor: 8000, documento: 'NF 800' });
  const antes = abastecer(8, 10);
  const depois = abastecer(12, 10);
  const valorAntes = valorDoLancamento(antes.id);
  const valorDepois = valorDoLancamento(depois.id);
  ok('antes da carga nova, o litro ainda é o da carga velha', valorAntes === 40,
    JSON.stringify(valorAntes));
  ok('depois dela, o litro é o da carga nova', valorDepois === 80, JSON.stringify(valorDepois));
  const linha = linhasCarga().length + 1;   // a carga NF 800 é a última
  const r = ctx.webEditarCargaBomba('T', linha,
    { data: '2026-11-10', produto: 'DIESEL S10', documento: 'NF 800' },
    { data: '2026-11-10', produto: 'DIESEL S10', quantidade: 1000, valor: 9000,
      documento: 'NF 800' }, JUSTIFICATIVA);
  ok('corrigir a carga de 10/11 é aceito', r.ok === true, r.mensagem);
  ok('o abastecimento de 12/11 muda', valorDoLancamento(depois.id) === 90,
    JSON.stringify(valorDoLancamento(depois.id)));
  ok('e o de 08/11 NÃO muda', valorDoLancamento(antes.id) === valorAntes,
    JSON.stringify(valorDoLancamento(antes.id)) + ' — ele é anterior à carga corrigida');
  // O caso que separa "não mudou porque o preço é o mesmo" de "não foi tocado":
  // um interno anterior cujo valor gravado DIVERGE da simulação de hoje. Se a
  // revalorização ignorar a data da carga corrigida, ela reescreve este aqui.
  const linhaAntes = abas['Lançamentos'].dados.slice(1)
    .filter(function (x) { return String(x[10]) === antes.id; })[0];
  linhaAntes[4] = 999;
  vm.runInContext('invalidarCacheLancamentos_();', ctx);
  const r2 = ctx.webEditarCargaBomba('T', linha,
    { data: '2026-11-10', produto: 'DIESEL S10', documento: 'NF 800' },
    { data: '2026-11-10', produto: 'DIESEL S10', quantidade: 1000, valor: 9500,
      documento: 'NF 800' }, JUSTIFICATIVA);
  ok('corrigir de novo a carga de 10/11 é aceito', r2.ok === true, r2.mensagem);
  ok('o valor divergente ANTERIOR à carga continua intocado',
    valorDoLancamento(antes.id) === 999, JSON.stringify(valorDoLancamento(antes.id)) +
    ' — corrigir a carga de 10/11 não autoriza reescrever o que veio antes dela');
  ok('e o de 12/11 acompanha a correção nova', valorDoLancamento(depois.id) === 95,
    JSON.stringify(valorDoLancamento(depois.id)));
})();

console.log('\n5. Tela desatualizada não corrige a carga errada');
(function () {
  const certo = { data: '2026-11-01', produto: 'DIESEL S10', documento: 'NF 500' };
  ok('linha fora da faixa é recusada', ctx.cargaPorLinha_(999, certo) === null);
  ok('linha 1 (cabeçalho) é recusada', ctx.cargaPorLinha_(1, certo) === null);
  ok('NF diferente da que a tela mostrou é recusada',
    ctx.cargaPorLinha_(2, { data: '2026-11-01', produto: 'DIESEL S10', documento: 'NF OUTRA' }) === null,
    'é o que impede corrigir a carga errada depois que outra pessoa mexeu na lista');
  ok('produto diferente é recusado',
    ctx.cargaPorLinha_(2, { data: '2026-11-01', produto: 'ARLA 32', documento: 'NF 500' }) === null);
  ok('data diferente é recusada',
    ctx.cargaPorLinha_(2, { data: '2026-11-02', produto: 'DIESEL S10', documento: 'NF 500' }) === null);
  ok('e a carga certa é encontrada', !!ctx.cargaPorLinha_(2, certo));
  const r = ctx.webEditarCargaBomba('T', 2,
    { data: '2026-11-01', produto: 'DIESEL S10', documento: 'NF OUTRA' },
    { data: '2026-11-01', produto: 'DIESEL S10', quantidade: 1, valor: 1, documento: 'X' },
    JUSTIFICATIVA);
  ok('a edição com tela velha para antes de escrever',
    r.ok === false && /A carga mudou/.test(r.mensagem), r.mensagem);
})();

console.log('\n6. Justificativa é obrigatória para mexer em carga');
(function () {
  const original = { data: '2026-11-01', produto: 'DIESEL S10', documento: 'NF 500' };
  const curta = ctx.webEditarCargaBomba('T', 2, original, { data: '2026-11-01',
    produto: 'DIESEL S10', quantidade: 5000, valor: 1, documento: 'NF 500' }, 'erro');
  ok('justificativa curta é recusada na correção',
    curta.ok === false && new RegExp(String(ctx.MIN_JUSTIFICATIVA_)).test(curta.mensagem), curta.mensagem);
  const semMotivo = ctx.webExcluirCargaBomba('T', 2, original, '');
  ok('e na exclusão também', semMotivo.ok === false && /justificativa/.test(semMotivo.mensagem),
    semMotivo.mensagem);
})();

console.log('\n7. Ajuste de estoque (aferição)');
(function () {
  const e = ctx.estadoTanque_(ctx.PRODUTO_DIESEL, null);
  const r0 = ctx.webAjustarEstoqueBomba('T', 'DIESEL S10', e.litros, '2026-11-20', JUSTIFICATIVA);
  ok('saldo igual ao do sistema: nada a ajustar',
    r0.ok === true && /Nada a ajustar/.test(r0.mensagem), r0.mensagem);
  const curta = ctx.webAjustarEstoqueBomba('T', 'DIESEL S10', 10, '2026-11-20', 'x');
  ok('sem justificativa, não ajusta', curta.ok === false, curta.mensagem);
  const prod = ctx.webAjustarEstoqueBomba('T', 'GASOLINA', 10, '2026-11-20', JUSTIFICATIVA);
  ok('produto fora do tanque é recusado', prod.ok === false, prod.mensagem);
  const negativo = ctx.webAjustarEstoqueBomba('T', 'DIESEL S10', -5, '2026-11-20', JUSTIFICATIVA);
  ok('saldo negativo é recusado', negativo.ok === false, negativo.mensagem);

  const alvo = Math.round((e.litros - 25) * 1000) / 1000;
  const r = ctx.webAjustarEstoqueBomba('T', 'DIESEL S10', alvo, '2026-11-20', JUSTIFICATIVA);
  ok('a falta medida vira movimento de ajuste', r.ok === true, r.mensagem);
  const ajuste = linhasCarga().filter(function (l) {
    return ctx.ehAjusteEstoque_(l[COL.DOCUMENTO - 1]);
  })[0];
  ok('a linha do ajuste é marcada como AJUSTE-ESTOQUE', !!ajuste, JSON.stringify(linhasCarga().length));
  ok('com a diferença em litros, negativa', Math.abs(Number(ajuste[COL.QUANTIDADE - 1]) + 25) < 0.001,
    JSON.stringify(ajuste));
  ok('e a observação registra o saldo medido e o motivo',
    /medido/.test(String(ajuste[COL.OBSERVACAO - 1])) &&
    new RegExp(JUSTIFICATIVA).test(String(ajuste[COL.OBSERVACAO - 1])), JSON.stringify(ajuste));
  const depois = ctx.estadoTanque_(ctx.PRODUTO_DIESEL, null);
  ok('o saldo do tanque passa a ser o medido', Math.abs(depois.litros - alvo) < 0.001,
    depois.litros + ' / ' + alvo);
})();

console.log('\n8. Excluir carga');
(function () {
  const antes = linhasCarga().length;
  const docs = linhasCarga().map(function (l) { return String(l[COL.DOCUMENTO - 1]); });
  const r = ctx.webExcluirCargaBomba('T', 2,
    { data: '2026-11-01', produto: 'DIESEL S10', documento: 'NF 500' }, JUSTIFICATIVA);
  ok('exclui com justificativa', r.ok === true, r.mensagem);
  ok('a lista encurta em uma', linhasCarga().length === antes - 1,
    antes + ' -> ' + linhasCarga().length);
  ok('e é a NF 500 que sai, não outra',
    linhasCarga().every(function (l) { return String(l[COL.DOCUMENTO - 1]) !== 'NF 500'; }),
    JSON.stringify(docs) + ' -> ' + JSON.stringify(linhasCarga().map(function (l) {
      return String(l[COL.DOCUMENTO - 1]); })));
  ok('as cargas de baixo subiram inteiras, sem embaralhar',
    linhasCarga().every(function (l) {
      return l[COL.PRODUTO - 1] && Number(l[COL.QUANTIDADE - 1]) !== 0;
    }), JSON.stringify(linhasCarga()));
})();

console.log('\n9. Regras estáticas');
const fonte = fs.readFileSync(arquivo, 'utf8');
(function () {
  ok('toda mexida em carga passa pelo lock',
    (fonte.match(/function web(Salvar|Editar|Excluir)CargaBomba|function webAjustarEstoqueBomba/g) || []).length === 4 &&
    (function () {
      return ['webSalvarCargaBomba', 'webEditarCargaBomba', 'webExcluirCargaBomba',
        'webAjustarEstoqueBomba'].every(function (nome) {
        const corpo = fonte.slice(fonte.indexOf('function ' + nome), fonte.indexOf('function ' + nome) + 1600);
        return /LockService\.getScriptLock\(\)/.test(corpo);
      });
    })(),
    'duas correções ao mesmo tempo revalorizariam a mesma base em cima uma da outra');
  ok('a revalorização só toca abastecimento com origem Interno EXPLÍCITA',
    /const explicito = String\(valores\[m\.indice\]\[L_\.TIPO_ABASTECIMENTO\]/.test(fonte),
    'sem isso, o valor digitado à mão antes do controle de bomba seria reescrito');
  ok('e só dentro do período aberto',
    /d >= periodo\.inicio && d <= periodo\.fim/.test(fonte),
    'mês fechado tem hash de integridade: mexer nele é romper o fechamento');
  ok('a correção invalida o cache de lançamentos antes de recalcular',
    /function finalizarCorrecaoBomba_[\s\S]{0,120}invalidarCacheLancamentos_\(\);/.test(fonte));
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
