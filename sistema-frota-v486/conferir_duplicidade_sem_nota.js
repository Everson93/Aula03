/**
 * Lançamento em dobro — inclusive SEM nota fiscal.
 *
 * A auditoria do projeto achou o buraco: a assinatura de duplicidade exigia o
 * número do documento, e abastecimento INTERNO não tem NF por decisão de
 * projeto (a nota é a da carga do tanque). Resultado: o fluxo mais usado da
 * operação era o único sem NENHUMA guarda contra lançamento em dobro — dois
 * envios baixavam o tanque duas vezes e estragavam o km/L do veículo.
 *
 * Havia um segundo motivo, independente do primeiro: a conferência rodava
 * ANTES do cálculo do custo do tanque. No interno o valor não vem da tela, vem
 * do tanque; comparar o valor digitado (zero) com o valor gravado (R$ 600)
 * nunca acharia nada, mesmo que a assinatura existisse. Por isso ela mudou de
 * lugar: compara o que vai ser GRAVADO.
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
  Object.assign(globalThis, { assinaturaLancamento_, localizarDuplicidadeLancamento_,
    textoDuplicidadeLancamento_, salvarLancamento_, ABAS, COL_LANC, L_, COL_VEIC, COL_CENTRO });
  exigirExecucaoOperacional_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  registrarLog_ = function (acao, detalhe) { __log.push(acao + ': ' + detalhe); };
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
  // CCC 0003 existe para a prova de "outra placa": BBB 0002 está numa loja
  // que não lança combustível, e a recusa viria por outro motivo.
  [veic('AAA 0001', 'DEPOSITO'), veic('BBB 0002', 'LOJA 05'), veic('CCC 0003', 'DEPOSITO')]);
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


function abastecer(extra) {
  const dados = {
    placa: 'AAA 0001', tipo: 'Combustivel Proprio', tipoAbastecimento: 'Interno',
    data: '2026-11-12', litros: 100, valor: '', km: '',
  };
  Object.keys(extra || {}).forEach(function (k) { dados[k] = extra[k]; });
  return gravar(dados);
}

console.log('\n1. A assinatura existe mesmo sem documento');
(function () {
  const dt = d(2026, 11, 12);
  const semDoc = ctx.assinaturaLancamento_(dt, 'AAA 0001', 'Combustivel Proprio', 600, '', 100);
  ok('lançamento sem NF tem assinatura', !!semDoc, JSON.stringify(semDoc));
  const comDoc = ctx.assinaturaLancamento_(dt, 'AAA 0001', 'Combustivel Proprio', 600, 'NF 1', 100);
  ok('com NF, outra assinatura', comDoc !== semDoc, semDoc + ' / ' + comDoc);
  ok('e as duas não se confundem por acaso',
    /^S\|/.test(semDoc) && /^D\|/.test(comDoc),
    'um lançamento COM nota não é duplicata de um SEM nota');
  const outrosLitros = ctx.assinaturaLancamento_(dt, 'AAA 0001', 'Combustivel Proprio', 600, '', 90);
  ok('litros diferentes, assinatura diferente', outrosLitros !== semDoc);
  const outroDia = ctx.assinaturaLancamento_(d(2026, 11, 13), 'AAA 0001', 'Combustivel Proprio', 600, '', 100);
  ok('dia diferente, assinatura diferente', outroDia !== semDoc);
})();

console.log('\n2. O segundo abastecimento interno igual é barrado');
(function () {
  const r1 = abastecer();
  ok('o primeiro grava', r1.ok === true, r1.mensagem);
  const r2 = abastecer();
  ok('o segundo IGUAL é recusado', r2.ok === false, r2.mensagem);
  ok('e a recusa é marcada como duplicidade (a tela oferece confirmar)',
    r2.duplicidade === true, JSON.stringify(r2));
  ok('a mensagem explica que sem NF a conferência é o conjunto',
    /MESMA data, placa, tipo, valor/.test(String(r2.mensagem)) &&
    /não tem NF/.test(String(r2.mensagem)), r2.mensagem);
  ok('ela diz o ID e a linha do lançamento que já existe',
    /ID LAN[^,]*, linha \d+/.test(String(r2.mensagem)), r2.mensagem);
  ok('e a base continua com UM abastecimento',
    linhasGravadas().filter(function (l) { return l[2] === 'Combustivel Proprio'; }).length === 1,
    'o tanque seria baixado duas vezes');
})();

console.log('\n3. Confirmando, grava — a recusa é um aviso, não uma parede');
(function () {
  const r = abastecer({ permitirDuplicado: true });
  ok('o operador confirma e o lançamento entra', r.ok === true, r.mensagem);
  ok('agora são dois',
    linhasGravadas().filter(function (l) { return l[2] === 'Combustivel Proprio'; }).length === 2,
    'quem abastece duas vezes no mesmo dia, com os mesmos litros, existe');
})();

console.log('\n4. O que NÃO pode ser confundido com duplicidade');
(function () {
  const r1 = abastecer({ litros: 80 });
  ok('litros diferentes passam direto', r1.ok === true, r1.mensagem);
  const r2 = abastecer({ data: '2026-11-13', litros: 100 });
  ok('outro dia passa direto', r2.ok === true, r2.mensagem);
  const r3 = gravar({
    placa: 'CCC 0003', tipo: 'Combustivel Proprio', tipoAbastecimento: 'Interno',
    data: '2026-11-12', litros: 100, valor: '',
  });
  ok('outra placa passa direto', r3.ok === true, r3.mensagem);
  // Com NF, a regra de sempre continua valendo.
  const r4 = gravar({ placa: 'AAA 0001', tipo: 'Pneus', data: '2026-11-14',
    valor: 900, documento: 'NF PNEU 1' });
  ok('despesa com NF grava', r4.ok === true, r4.mensagem);
  const r5 = gravar({ placa: 'AAA 0001', tipo: 'Pneus', data: '2026-11-14',
    valor: 900, documento: 'NF PNEU 1' });
  ok('e a mesma NF, de novo, é barrada pelo documento',
    r5.ok === false && r5.duplicidade === true && /documento "NF PNEU 1"/.test(String(r5.mensagem)),
    r5.mensagem);
  const r6 = gravar({ placa: 'AAA 0001', tipo: 'Pneus', data: '2026-11-14',
    valor: 900, documento: 'NF PNEU 2' });
  ok('NF diferente passa', r6.ok === true, r6.mensagem);
  // O lado que falta: um lançamento SEM nota, igual em tudo a um COM nota, não
  // é duplicata dele — a nota é justamente o que os distingue. Para saber isso,
  // a busca precisa LER a coluna do documento das linhas já gravadas.
  const r7 = gravar({ placa: 'AAA 0001', tipo: 'Pneus', data: '2026-11-14', valor: 900 });
  ok('sem NF, mesmo valor e dia de um lançamento COM NF, passa',
    r7.ok === true, r7.mensagem + ' — a nota é o que distingue os dois');
  const r8 = gravar({ placa: 'AAA 0001', tipo: 'Pneus', data: '2026-11-14', valor: 900 });
  ok('e o segundo SEM NF, aí sim, é barrado',
    r8.ok === false && r8.duplicidade === true, r8.mensagem);
})();

console.log('\n5. Uma despesa sem NF e sem litros também é conferida');
(function () {
  const um = gravar({ placa: 'AAA 0001', tipo: 'Lavacao/Graxa', data: '2026-11-16', valor: 120 });
  ok('a primeira lavação grava', um.ok === true, um.mensagem);
  const dois = gravar({ placa: 'AAA 0001', tipo: 'Lavacao/Graxa', data: '2026-11-16', valor: 120 });
  ok('a segunda igual é barrada', dois.ok === false && dois.duplicidade === true, dois.mensagem);
  ok('e a mensagem não inventa litros que não existem',
    !/ L\b/.test(String(dois.mensagem)), dois.mensagem);
  const outra = gravar({ placa: 'AAA 0001', tipo: 'Lavacao/Graxa', data: '2026-11-16', valor: 80 });
  ok('valor diferente no mesmo dia passa', outra.ok === true,
    outra.mensagem + ' — duas lavações diferentes no mesmo dia não são duplicata');
})();

console.log('\n6. Regras estáticas');
const fonte = fs.readFileSync(arquivo, 'utf8');
(function () {
  ok('a conferência compara o valor que vai ser GRAVADO',
    /localizarDuplicidadeLancamento_\(data, placa, dados\.tipo, valorFinal, documentoFinal, litros\)/
      .test(fonte),
    'com o valor digitado, o abastecimento interno nunca casaria: o valor dele vem do tanque');
  ok('e ela roda DEPOIS do custo do tanque', (function () {
    const corpo = fonte.slice(fonte.indexOf('function salvarLancamento_'),
      fonte.indexOf('function salvarLancamentoPlanilha'));
    return corpo.indexOf('estadoTanque_(produtoTanque, data)') <
      corpo.indexOf('localizarDuplicidadeLancamento_(data, placa');
  })(), 'antes do cálculo, valorFinal ainda é o valor digitado');
  ok('a assinatura separa COM nota de SEM nota',
    /return 'D\|'/.test(fonte) && /return 'S\|'/.test(fonte));
  ok('a auditoria lê a coluna certa do documento',
    /assinaturaLancamento_\(l\[L_\.DATA\],l\[L_\.PLACA\],l\[L_\.TIPO\],l\[L_\.VALOR\],l\[L_\.DOCUMENTO\],l\[L_\.LITROS\]\)/
      .test(fonte),
    'ela comparava l[6], que é a OBSERVAÇÃO desde a V4.7.2 — contava duplicidade de outra coluna');
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
