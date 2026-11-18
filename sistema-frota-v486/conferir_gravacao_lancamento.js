/**
 * Gravação de lançamento de ponta a ponta, numa planilha falsa COMPLETA.
 *
 * Esta suíte nasceu de uma revisão pedida pelo usuário — *"não está salvando
 * lançamentos"* — e do buraco que a revisão expôs: **nenhuma suíte gravava de
 * verdade**. Todas dublavam `gravarLinhaLancamento_` e companhia, então o
 * caminho que o operador usa todo dia não tinha prova nenhuma de ponta a
 * ponta.
 *
 * Aqui nada do caminho de gravação é dublado: a aba responde `getRange`,
 * `setValues`, `getLastRow` e `getNextDataCell` como a de verdade, e o que
 * quebrar aqui quebra lá.
 *
 * Duas regras que o dublê tem de respeitar, senão a prova mente:
 *  - as datas são criadas DENTRO do vm (`instanceof Date` não atravessa
 *    realm, e `lerCargasBomba_` usa `instanceof`);
 *  - pedir intervalo além da última coluna LANÇA, como no Sheets.
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
  Object.assign(globalThis, { salvarLancamento_, ABAS, COL_LANC, L_, COL_VEIC, COL_CENTRO });
  exigirExecucaoOperacional_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  registrarLog_ = function () {};
  atualizarResumoSeguro_ = function () {};
  invalidarCacheInicio_ = function () {};
  emailContextoAtual_ = function () { return 'operador@giassi.com.br'; };
  execucaoTemPlanilhaAtiva_ = function () { return true; };
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

console.log('\n1. O que tem de gravar, grava');
let r = gravar({
  placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-12',
  litros: 300, valor: 1800, documento: 'NF 1', km: 104800,
});
ok('combustível externo com KM', r.ok === true, r.mensagem);
ok('e a linha foi parar na aba', linhasGravadas().length === 1,
  JSON.stringify(linhasGravadas().length));
ok('com a placa, o tipo, os litros e o valor certos',
  cel(0, 1) === 'AAA 0001' && cel(0, 2) === 'Combustivel Terceiros' &&
  cel(0, 3) === 300 && cel(0, 4) === 1800,
  JSON.stringify(linhasGravadas()[0]));
ok('e com ID', /^LAN-/.test(String(cel(0, 10))), String(cel(0, 10)));
ok('o KM foi para a aba Odômetro', abas['Odômetro'].getLastRow() === 5,
  String(abas['Odômetro'].getLastRow()));

r = gravar({
  placa: 'AAA 0001', tipo: 'Combustivel Proprio', data: '2026-11-13',
  litros: 200, valor: 0, documento: 'NF 2', km: 105200, tipoAbastecimento: 'Interno',
});
ok('abastecimento interno grava', r.ok === true, r.mensagem);
// O interno nao tem preco proprio: o custo e o do tanque naquele momento.
ok('e vale o preço do tanque (200 L x R$ 6,00)',
  cel(1, 4) === 1200, String(cel(1, 4)));
ok('a mensagem diz o preço cobrado pela bomba',
  /bomba a R\$ 6,0000\/L/.test(r.mensagem), r.mensagem);

r = gravar({ placa: 'AAA 0001', tipo: 'Pneus', data: '2026-11-12', valor: 2200, documento: 'NF 9' });
ok('despesa sem KM grava', r.ok === true, r.mensagem);
r = gravar({
  placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-14',
  litros: 100, valor: 620, documento: 'NF 3',
});
ok('combustível SEM KM também grava', r.ok === true, r.mensagem);
r = gravar({
  placa: 'AAA 0001', tipo: 'Oficina Despesa', data: '2026-11-12', valor: 450,
  documento: 'OS 77', naturezaOficina: 'Peça de reposição', detalheOficina: 'pastilha',
  fornecedor: 'POSTO X',
});
ok('oficina com natureza e fornecedor grava', r.ok === true, r.mensagem);
ok('nenhuma dessas passou por exceção',
  linhasGravadas().length === 5, String(linhasGravadas().length));

console.log('\n2. O que tem de recusar, recusa — e explica');
r = gravar({
  placa: 'BBB 0002', tipo: 'Combustivel Terceiros', data: '2026-11-12',
  litros: 100, valor: 620, documento: 'NF 4',
});
ok('veículo de loja sem combustível é recusado', r.ok === false, r.mensagem);
ok('dizendo qual loja e como liberar',
  /LOJA 05/.test(r.mensagem) && /Centros de custo/.test(r.mensagem), r.mensagem);
r = gravar({
  placa: 'AAA 0001', tipo: 'Oficina Despesa', data: '2026-11-12', valor: 450, documento: 'OS 78',
});
ok('oficina sem natureza é recusada', r.ok === false, r.mensagem);
ok('e nada disso sujou a base', linhasGravadas().length === 5,
  'recusa que grava meia linha é pior que recusa nenhuma');

console.log('\n3. O KM com dígito a mais, e o veículo que travava');
r = gravar({
  placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-15',
  litros: 300, valor: 1800, documento: 'NF 5', km: 1048000,
});
ok('KM absurdo é recusado', r.ok === false, r.mensagem);
r = gravar({
  placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-16',
  litros: 300, valor: 1800, documento: 'NF 6', km: 1048000, confirmarKmAlto: true,
});
ok('mas com a confirmação grava', r.ok === true, r.mensagem);
// Era aqui que o veiculo travava: dali em diante TODO lancamento seguinte vem
// menor que o numero errado, e a mensagem mandava "forcar" — que grava como
// troca de odometro e deixa o erro de pe.
r = gravar({
  placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-17',
  litros: 300, valor: 1800, documento: 'NF 7', km: 105800,
});
ok('o lançamento seguinte, com o KM certo, é recusado', r.ok === false, r.mensagem);
ok('mas a mensagem acusa a leitura ANTERIOR',
  /essa leitura anterior é que parece errada/.test(r.mensagem), r.mensagem);
ok('e manda corrigir no histórico, não forçar',
  /Histórico \/ estornar/.test(r.mensagem), r.mensagem);

console.log('\n4. Aba cheia até a última linha: não pode gravar por cima');
// `getNextDataCell(UP)` a partir de uma celula CHEIA sobe para o TOPO do
// bloco contiguo, nao para a ultima linha com dado. Quando a aba enche ate o
// fim, `ultimaLinhaLancamentoReal_` devolvia uma linha la em cima — e o
// lancamento seguinte era gravado POR CIMA de um ja existente, com o sistema
// dizendo "gravado". Dois lancamentos somem de uma vez: o novo, que nunca
// aparece, e o antigo, que foi sobrescrito.
(function () {
  const lanc = abas['Lançamentos'];
  const antes = linhasGravadas().length;
  // Enche a aba ate a ultima linha.
  while (lanc.dados.length < lanc.getMaxRows()) lanc.dados.push(new Array(lanc.maxCols).fill(''));
  for (let i = antes + 1; i < lanc.getMaxRows(); i++) {
    lanc.dados[i] = [d(2026, 11, 10), 'CCC 0003', 'Pneus', '', 100, 'NF ' + i, '', 'DEPOSITO',
      'Truck Normal', '', 'LAN-ANTIGO-' + i, '', '', '', ''];
  }
  const cheias = linhasGravadas().length;
  const r2 = gravar({
    placa: 'AAA 0001', tipo: 'Pneus', data: '2026-11-19', valor: 999, documento: 'NF CHEIA',
  });
  const depois = linhasGravadas().length;
  ok('ou grava numa linha nova, ou recusa — nunca por cima',
    r2.ok === false || depois === cheias + 1,
    'disse "' + String(r2.mensagem).slice(0, 80) + '" e a base foi de ' + cheias + ' para ' + depois);
  ok('e, quando não dá para gravar, ele DIZ que não gravou',
    r2.ok === true ||
    /não foi possível gravar|NÃO foi registrado/i.test(String(r2.mensagem)),
    'mensagem de sucesso sobre uma gravação que não aconteceu é o pior defeito possível: ' +
    'ninguém procura o que já foi dado como feito');
  ok('e nenhum lançamento antigo foi sobrescrito',
    linhasGravadas().filter(function (l) { return /^LAN-ANTIGO/.test(String(l[10])); }).length >=
      cheias - antes,
    'o lançamento sobrescrito some sem deixar rastro');
})();

console.log('\n4b. A conferência de leitura vale por si');
// Mesmo que a linha seja calculada certo, gravar e NAO conferir deixa a porta
// aberta para qualquer outra causa (permissao, aba protegida, filtro) passar
// como sucesso.
ok('o servidor relê a linha antes de dizer "gravado"', (function () {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  // A frase está quebrada em duas linhas no fonte; procurar a string inteira
  // não acha, e a prova passaria a medir a formatação em vez do conteúdo.
  return /const conferido = lancamentos\.getRange\(linha, 1, 1, TOTAL_COL_LANC\)\.getValues\(\)\[0\];/
    .test(fonte) && /O lançamento NÃO foi /.test(fonte);
})());
ok('e a conferência compara o ID E a placa', (function () {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  return /conferido\[L_\.ID\][\s\S]{0,120}normalizaPlaca_\(conferido\[L_\.PLACA\]\) !== placa/.test(fonte);
})(), 'só o ID não basta: a linha pode ter o ID certo e a placa de outro lançamento');
ok('a pergunta "qual é a última linha" tem um dono só', (function () {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  return (fonte.match(/^function ultimaLinhaComDado_/gm) || []).length === 1 &&
    (fonte.match(/getNextDataCell\(SpreadsheetApp\.Direction\.UP\)/g) || []).length === 1;
})(), 'a guarda do Ctrl+Seta existia num lugar e faltava em dois');

console.log('\n5. A base fica íntegra');
ok('toda linha gravada tem data, placa, tipo e ID', linhasGravadas().every(function (l) {
  return l[0] && l[1] && l[2] && /^LAN-/.test(String(l[10]));
}), JSON.stringify(linhasGravadas().map(function (l) { return [l[1], l[2], l[10]]; })));
ok('e o centro e a categoria foram fotografados do cadastro',
  linhasGravadas().every(function (l) { return l[7] === 'DEPOSITO' && l[8] === 'Truck Normal'; }),
  'sem o retrato, mudar o veículo de loja reescreveria o passado');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
