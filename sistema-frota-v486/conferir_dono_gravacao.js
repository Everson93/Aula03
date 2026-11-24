/**
 * O DONO ÚNICO da gravação de lançamento (V4.43).
 *
 * Cinco caminhos escreviam linha de lançamento — o formulário, a depreciação
 * do mês, as 12 parcelas de IPVA, o importador e o desfazer da correção — e só
 * o primeiro tinha guarda de linha livre e releitura. Os outros quatro gravam
 * em BLOCO: onde um erro não apaga um lançamento, apaga N.
 *
 * Três invariantes se provam aqui, e os três nasceram de defeito real:
 *
 *  1. a linha de destino tem de estar livre — para o bloco inteiro;
 *  2. a linha vai COMPLETA. Os blocos antigos escreviam até a coluna I e o ID,
 *     deixando natureza, detalhe, fornecedor e TIPO DE ABASTECIMENTO do
 *     lançamento anterior na linha. O campo que decide se o litro saiu do
 *     tanque, herdado de outro lançamento;
 *  3. o cache de lançamentos da execução cai na hora da gravação. Sem isso, o
 *     Resumo era recalculado SEM o lançamento recém-gravado e gravado assim —
 *     a aba Lançamentos certa e o Resumo, o Dashboard e o rateio sem o valor.
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
            // Planilha não tem buraco: linha que existe é linha preenchível.
            if (!aba.dados[alvo]) aba.dados[alvo] = new Array(aba.maxCols).fill('');
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
  Object.assign(globalThis, { gravarBlocoLancamentos_, linhasLivresParaLancamentos_,
    linhaLancamento_, calcularLinhasResumo_, lerLancamentos_, periodoAtual_, R_,
    gerarDepreciacaoMensal_, salvarLancamento_, ABAS, COL_LANC, L_, COL_VEIC, COL_CENTRO });
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


function placasNaAba() {
  return abas['Lançamentos'].dados.slice(1)
    .map(function (l) { return String(l[0 + 1] || ''); })
    .filter(function (p) { return p; });
}
function linhaDaAba(n) { return abas['Lançamentos'].dados[n - 1] || []; }

console.log('\n1. O bloco só entra em N linhas livres SEGUIDAS');
(function () {
  const lanc = abas['Lançamentos'];
  function linhaFake(n) {
    while (lanc.dados.length <= n - 1) lanc.dados.push(new Array(lanc.maxCols).fill(''));
    if (!lanc.dados[n - 1]) lanc.dados[n - 1] = new Array(lanc.maxCols).fill('');
    return lanc.dados[n - 1];
  }
  // Um lançamento na linha 5 e o cálculo da última linha SABOTADO para 1 —
  // que é exatamente o que a armadilha do Ctrl+Seta fazia sozinha. Para uma
  // linha só, a 2 serve; para um bloco de cinco, começar na 2 apagaria a 5.
  const l5 = linhaFake(5);
  l5[1] = 'TRK 9999';
  l5[10] = 'LAN-ANTIGO-X';
  const alvo = vm.runInContext('aba_(ABAS.LANCAMENTOS)', ctx);
  // Guarda a original: `delete globalThis.x` NÃO desfaz uma declaração de
  // função (a propriedade não é configurável), e a sabotagem vazava para os
  // blocos seguintes — que então provavam outra coisa sem ninguém notar.
  const ultimaOriginal = vm.runInContext('ultimaLinhaLancamentoReal_', ctx);
  vm.runInContext('ultimaLinhaLancamentoReal_ = function () { return 1; };', ctx);
  const d1 = ctx.linhasLivresParaLancamentos_(alvo, 1);
  ok('uma linha cabe antes do lançamento da linha 5', d1.linha === 2, JSON.stringify(d1));
  const d5 = ctx.linhasLivresParaLancamentos_(alvo, 5);
  ok('cinco linhas seguidas começam DEPOIS dele', d5.linha === 6,
    JSON.stringify(d5) + ' — começar na 2 apagaria o lançamento da linha 5');
  ok('e o sistema sabe que teve de pular', d5.pulou === 4, JSON.stringify(d5));
  ctx.ultimaLinhaLancamentoReal_ = ultimaOriginal;
  lanc.dados[4] = new Array(lanc.maxCols).fill('');
})();

console.log('\n2. A linha vai COMPLETA: nada do antigo sobra');
(function () {
  const lanc = abas['Lançamentos'];
  const alvo = vm.runInContext('aba_(ABAS.LANCAMENTOS)', ctx);
  // Uma linha "fantasma": sem placa (então conta como livre), mas com os
  // campos do fim preenchidos — exatamente o que sobra de um estorno.
  lanc.dados[1] = new Array(lanc.maxCols).fill('');
  lanc.dados[1][ctx.COL_LANC.NATUREZA_OFICINA - 1] = 'Motor / transmissão';
  lanc.dados[1][ctx.COL_LANC.FORNECEDOR - 1] = 'FORNECEDOR VELHO';
  lanc.dados[1][ctx.COL_LANC.TIPO_ABASTECIMENTO - 1] = 'Interno';
  const r = ctx.gravarBlocoLancamentos_(alvo, [ctx.linhaLancamento_({
    DATA: d(2026, 11, 12), PLACA: 'AAA 0001', TIPO: 'Pneus', VALOR: 500,
    DOCUMENTO: 'NF NOVA', CENTRO: 'DEPOSITO', CATEGORIA: 'Truck Normal', ID: 'LAN-NOVO-1',
  })]);
  ok('gravou', r.ok === true && r.linha === 2, JSON.stringify(r));
  const l = linhaDaAba(2);
  ok('o fornecedor velho foi embora',
    String(l[ctx.COL_LANC.FORNECEDOR - 1] || '') === '', JSON.stringify(l));
  ok('e o TIPO DE ABASTECIMENTO velho também',
    String(l[ctx.COL_LANC.TIPO_ABASTECIMENTO - 1] || '') === '',
    JSON.stringify(l) + ' — é o campo que decide se o litro saiu do tanque');
  ok('a natureza de oficina velha idem',
    String(l[ctx.COL_LANC.NATUREZA_OFICINA - 1] || '') === '', JSON.stringify(l));
})();

console.log('\n3. A releitura vale para TODAS as linhas do bloco');
(function () {
  const alvo = vm.runInContext('aba_(ABAS.LANCAMENTOS)', ctx);
  const linhas = [1, 2, 3].map(function (i) {
    return ctx.linhaLancamento_({
      DATA: d(2026, 11, 10 + i), PLACA: 'AAA 0001', TIPO: 'Pneus', VALOR: 100 * i,
      DOCUMENTO: 'NF B' + i, CENTRO: 'DEPOSITO', CATEGORIA: 'Truck Normal',
      ID: 'LAN-BLOCO-' + i,
    });
  });
  const r = ctx.gravarBlocoLancamentos_(alvo, linhas);
  ok('as três entraram', r.ok === true && r.gravadas === 3, JSON.stringify(r));
  const ids = [0, 1, 2].map(function (i) { return String(linhaDaAba(r.linha + i)[10] || ''); });
  ok('cada linha com o seu ID', ids.join(',') === 'LAN-BLOCO-1,LAN-BLOCO-2,LAN-BLOCO-3',
    JSON.stringify(ids));
  // Sabota a ÚLTIMA linha do bloco entre a escrita e a conferência: a prova de
  // que a releitura não olha só a primeira.
  const original = abas['Lançamentos'].getRange;
  const linhas2 = [1, 2].map(function (i) {
    return ctx.linhaLancamento_({
      DATA: d(2026, 11, 15), PLACA: 'AAA 0001', TIPO: 'Pneus', VALOR: 50,
      DOCUMENTO: 'NF C' + i, CENTRO: 'DEPOSITO', CATEGORIA: 'Truck Normal',
      ID: 'LAN-SABOTADO-' + i,
    });
  });
  const antes = placasNaAba().length;
  abas['Lançamentos'].getRange = function (linha, coluna, nL, nC) {
    const faixa = original.call(this, linha, coluna, nL, nC);
    const setValues = faixa.setValues;
    faixa.setValues = function (vals) {
      const saida = setValues.call(faixa, vals);
      // depois de escrever, alguém mexe na segunda linha
      if (nL === 2 && coluna === 1) abas['Lançamentos'].dados[linha][1] = 'XXX 0000';
      return saida;
    };
    return faixa;
  };
  const r2 = ctx.gravarBlocoLancamentos_(alvo, linhas2);
  abas['Lançamentos'].getRange = original;
  ok('mexeram na 2ª linha do bloco e a conferência PEGOU',
    r2.ok === false && /NÃO foi registrado/.test(String(r2.mensagem)),
    JSON.stringify(r2) + ' — conferir só a primeira linha aprovaria o bloco inteiro');
})();

console.log('\n4. O cache da execução cai na gravação');
// Este é o defeito que sobrou depois da V4.41: no abastecimento INTERNO o
// `estadoTanque_` lê os lançamentos ANTES de gravar e enche o cache da
// execução. Sem invalidar, o `atualizarResumoPlacaSeguro_` logo adiante
// recalculava a linha do veículo a partir do cache velho — e gravava no Resumo
// o veículo SEM o lançamento recém-feito.
(function () {
  function totalNoResumo(placa) {
    const linhas = ctx.calcularLinhasResumo_(ctx.periodoAtual_());
    const l = linhas.filter(function (x) {
      return String(x[ctx.R_.PLACA]).replace(/\s/g, '') === placa.replace(/\s/g, '');
    })[0];
    return l ? l[ctx.R_.TOTAL] : null;
  }
  const antes = totalNoResumo('AAA 0001');
  const r = gravar({
    placa: 'AAA 0001', tipo: 'Combustivel Proprio', tipoAbastecimento: 'Interno',
    data: '2026-11-18', litros: 100, valor: '', km: 108000,
    confirmarKmAlto: true, forcarKm: true,
  });
  ok('abastecimento interno gravou', r.ok === true, r.mensagem);
  ok('e o lançamento aparece na leitura seguinte, na MESMA execução',
    ctx.lerLancamentos_().some(function (l) { return String(l[10]) === String(r.id); }),
    'o cache da execução escondia o lançamento recém-gravado de todo mundo ' +
    'que lesse depois — inclusive do recálculo do Resumo');
  const depois = totalNoResumo('AAA 0001');
  ok('o Resumo recalculado JÁ enxerga o valor', depois > antes,
    'antes ' + antes + ' / depois ' + depois +
    ' — era isto que gravava no Resumo o veículo sem o abastecimento');
  ok('e o valor é o do tanque (100 L a R$ 6,00)', Math.abs(depois - antes - 600) < 0.01,
    'antes ' + antes + ' / depois ' + depois);
})();

console.log('\n5. Regras estáticas: um dono, e só um');
const fonte = fs.readFileSync(arquivo, 'utf8');
/**
 * Em que FUNÇÃO cada coisa está — contagem crua não diz quem é o dono.
 *
 * Por corpo, não por linha: no dono único a faixa é criada numa linha e
 * escrita em outra, e uma regra que olhasse linha a linha deixaria de ver
 * justamente quem ela existe para reconhecer.
 */
function funcoesComCorpo(regexes) {
  const linhas = fonte.split('\n');
  const corpos = {};
  let atual = null;
  linhas.forEach(function (l) {
    const m = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(l);
    if (m) { atual = m[1]; corpos[atual] = []; }
    if (atual) {
      corpos[atual].push(l);
      if (l === '}') atual = null;
    }
  });
  return Object.keys(corpos).filter(function (nome) {
    const corpo = corpos[nome].join('\n');
    return regexes.every(function (r) { return r.test(corpo); });
  }).sort();
}
function funcoesQueContem(regex) { return funcoesComCorpo([regex]); }
(function () {
  const quemPergunta = funcoesQueContem(/proximaLinhaLancamento_\(\)/);
  ok('só o dono pergunta "qual é a próxima linha"',
    quemPergunta.join(',') === 'linhasLivresParaLancamentos_,montarDiagnosticoGravacao_,proximaLinhaLancamento_',
    quemPergunta.join(', ') + ' — fora a definição e o diagnóstico (que só LÊ), ' +
    'qualquer outra é um caminho de gravação sem guarda');
  // Congela quem mexe na linha de lançamento — a mesma ideia da lista ACEITAS
  // de conferir_desempenho.js: o valor está em reprovar o que for NOVO.
  const ESCRITORES_ACEITOS = {
    gravarBlocoLancamentos_: 'o dono único: escolhe linha livre, grava e confere',
    garantirIdsLancamentos_: 'preenche ID que falta em base antiga; não cria linha',
    restaurarDadosDeBackupSemLock_: 'restaura a aba inteira a partir de um backup',
    repararLancamentosDeslocados_: 'conserta linha existente desalinhada',
    ajustarValoresDepreciacao_: 'corrige o valor de depreciação já lançada',
    onEdit: 'reage à digitação direta na aba; não acrescenta lançamento',
  };
  const quemEscreve = funcoesComCorpo([/getRange\([^)]*COL_LANC\.(ID|PERIODO)/, /setValues\(/]);
  const novos = quemEscreve.filter(function (n) { return !ESCRITORES_ACEITOS[n]; });
  ok('nenhum escritor NOVO na linha de lançamento', novos.length === 0,
    novos.join(', ') + ' — todo escritor novo tem de pegar a linha com ' +
    'gravarBlocoLancamentos_, senão volta a existir caminho sem guarda. ' +
    'Se for legítimo, entra em ESCRITORES_ACEITOS com o motivo.');
  const sumiram = Object.keys(ESCRITORES_ACEITOS).filter(function (n) {
    return quemEscreve.indexOf(n) === -1;
  });
  ok('e a lista de aceitos não tem nome morto', sumiram.length === 0,
    sumiram.join(', ') + ' — lista que não acompanha o código deixa de proteger');
  ok('a depreciação do mês passa pelo dono',
    /const gravacao = gravarBlocoLancamentos_\(sheet, linhas, \{ formatar: true \}\);[\s\S]{0,220}Depreciação NÃO gerada/
      .test(fonte), 'e recusa dizendo que NÃO gerou');
  ok('o IPVA em 12 parcelas também', /IPVA NÃO lançado\./.test(fonte));
  ok('o importador também', /Importação interrompida: /.test(fonte));
  ok('e o desfazer da correção confere antes de dizer que manteve o original',
    /lançamento original NÃO voltou para a base/.test(fonte),
    'dizer "o original foi mantido" sem conferir é prometer o contrário do que pode ter acontecido');
  ok('o cache de lançamentos cai dentro do dono',
    /invalidarCacheLancamentos_\(\);[\s\S]{0,200}SpreadsheetApp\.flush\(\);[\s\S]{0,200}const conferido = sheet\.getRange/
      .test(fonte), 'fora dele, cada caminho novo esqueceria de novo');
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
