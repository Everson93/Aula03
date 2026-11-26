/**
 * A pendência de KM rodado: cobrar o que falta, não o que ainda não existe.
 *
 * Queixa do usuário: *"quando abasteço a primeira vez o veículo acusa que tem
 * que ter 2 registros de KM, não faz sentido"*. E não faz mesmo. KM rodado é
 * maior menos menor leitura DO PERÍODO — ele só existe a partir da SEGUNDA
 * leitura. No primeiro abastecimento do veículo no mês, zero é a resposta
 * certa, não um descuido de ninguém.
 *
 * A pendência antiga disparava sempre que o KM rodado era zero. O que ela
 * queria pegar — "abasteceu e ninguém anotou o KM" — continua sendo pego; o
 * que ela não pode fazer é cobrar uma segunda leitura que ainda não podia
 * existir. Pendência que não procede ensina a ignorar a lista inteira, e aí a
 * que procede também passa batido.
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

// Dia 5 de novembro: o meio do período aberto (26/10 a 25/11). É quando o
// usuário importa a depreciação, e é o único instante em que a diferença entre
// "data fora do período" e "data depois de hoje" aparece.
const HOJE_FIXO = '2026-11-05';

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
      // HOJE é fixo. Enquanto vinha do relógio, a suíte provava coisas
      // diferentes em dias diferentes: a prova do "período futuro" passava em
      // 26/11 sem testar nada, porque a data real já tinha passado do período.
      if (padrao === 'yyyy-MM-dd') {
        if (d === undefined || d === null) return HOJE_FIXO;
        return (Math.abs(d.getTime() - Date.now()) < 60000)
          ? HOJE_FIXO
          : d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
      }
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
  Object.assign(globalThis, { coletarProblemas_, acaoDaPendencia_, R_, TOTAL_COL_RESUMO,
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


// ---- aba Resumo: é dela que sai a pendência de KM rodado
const resumo = novaAba('Resumo', ['Resumo'], []);
function montarResumoFake(linhas) {
  resumo.dados.length = 1;
  resumo.dados.push(new Array(ctx.TOTAL_COL_RESUMO).fill(''));
  resumo.dados.push(new Array(ctx.TOTAL_COL_RESUMO).fill(''));
  linhas.forEach(function (v) {
    const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
    l[ctx.R_.PLACA] = v.placa;
    l[ctx.R_.LITROS] = v.litros;
    l[ctx.R_.KM] = v.km;
    l[ctx.R_.TOTAL] = v.total === undefined ? 100 : v.total;
    resumo.dados.push(l);
  });
}
function problemasDe(placa) {
  return ctx.coletarProblemas_({ fechamento: true })
    .filter(function (p) { return String(p[1]).replace(/\s/g, '') === placa.replace(/\s/g, ''); })
    .map(function (p) { return String(p[2]); });
}
function leitura(dia, placa, km) {
  abas['Odômetro'].dados.push([d(2026, 11, dia), placa, km]);
  vm.runInContext('invalidarCacheOdometro_();', ctx);
}
function abastecer(dia, litros, km) {
  const r = gravar({
    placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-' + ('0' + dia).slice(-2),
    litros: litros, valor: litros * 6, documento: 'NF ' + dia + '-' + litros,
    km: km || '', confirmarKmAlto: true, forcarKm: true, permitirDuplicado: true,
  });
  if (!r.ok) console.log('      (recusado: ' + String(r.mensagem).split('\n')[0] + ')');
  return r;
}

console.log('\n1. Primeiro abastecimento do período NÃO é pendência');
(function () {
  abas['Odômetro'].dados.length = 1;
  vm.runInContext('invalidarCacheOdometro_();', ctx);
  abastecer(5, 100, 50000);
  montarResumoFake([{ placa: 'AAA 0001', litros: 100, km: 0 }]);
  const p = problemasDe('AAA 0001');
  ok('nenhuma pendência de KM rodado', p.every(function (x) { return !/KM/.test(x); }),
    JSON.stringify(p) + ' — uma leitura, um abastecimento: o KM rodado nasce da segunda');
})();

console.log('\n2. Abasteceu e não anotou KM nenhum: isso SIM é pendência');
(function () {
  abas['Odômetro'].dados.length = 1;
  vm.runInContext('invalidarCacheOdometro_();', ctx);
  montarResumoFake([{ placa: 'AAA 0001', litros: 100, km: 0 }]);
  const p = problemasDe('AAA 0001');
  ok('acusa a falta', p.indexOf('Abasteceu e não registrou KM nenhum') !== -1, JSON.stringify(p));
  const acao = ctx.acaoDaPendencia_('Abasteceu e não registrou KM nenhum');
  ok('e a tela sabe o que oferecer', !!acao && acao.tela === 'lancar', JSON.stringify(acao));
})();

console.log('\n3. Abasteceu duas vezes e só anotou um KM');
(function () {
  abas['Odômetro'].dados.length = 1;
  vm.runInContext('invalidarCacheOdometro_();', ctx);
  abastecer(6, 80, 50500);
  abastecer(9, 90);            // sem KM: é esta leitura que falta
  montarResumoFake([{ placa: 'AAA 0001', litros: 170, km: 0 }]);
  const p = problemasDe('AAA 0001');
  ok('acusa que falta leitura',
    p.indexOf('Abasteceu mais de uma vez e só tem uma leitura de KM') !== -1, JSON.stringify(p));
  ok('e não acusa a falta total, que seria mentira',
    p.indexOf('Abasteceu e não registrou KM nenhum') === -1, JSON.stringify(p));
})();

console.log('\n4. Duas leituras e nenhum KM entre elas');
(function () {
  abas['Odômetro'].dados.length = 1;
  vm.runInContext('invalidarCacheOdometro_();', ctx);
  leitura(10, 'AAA 0001', 60000);
  leitura(14, 'AAA 0001', 60000);
  montarResumoFake([{ placa: 'AAA 0001', litros: 100, km: 0 }]);
  const p = problemasDe('AAA 0001');
  ok('acusa leituras iguais',
    p.indexOf('Leituras de KM do período são todas iguais') !== -1, JSON.stringify(p) +
    ' — ou o veículo não rodou, ou alguma leitura foi repetida');
  ok('e a explicação diz as duas possibilidades',
    /não rodou/.test(ctx.acaoDaPendencia_('Leituras de KM do período são todas iguais').explicacao) &&
    /repetida/.test(ctx.acaoDaPendencia_('Leituras de KM do período são todas iguais').explicacao));
})();

console.log('\n5. Com KM rodado, nada a cobrar');
(function () {
  abas['Odômetro'].dados.length = 1;
  vm.runInContext('invalidarCacheOdometro_();', ctx);
  leitura(10, 'AAA 0001', 60000);
  leitura(14, 'AAA 0001', 61200);
  montarResumoFake([{ placa: 'AAA 0001', litros: 100, km: 1200 }]);
  const p = problemasDe('AAA 0001');
  ok('nenhuma pendência de KM', p.every(function (x) { return !/KM/.test(x); }), JSON.stringify(p));
})();

console.log('\n6. Leitura de OUTRO período não conta como leitura deste');
(function () {
  abas['Odômetro'].dados.length = 1;
  vm.runInContext('invalidarCacheOdometro_();', ctx);
  // Período aberto: 26/10 a 25/11. Esta é de setembro.
  abas['Odômetro'].dados.push([d(2026, 9, 10), 'AAA 0001', 40000]);
  vm.runInContext('invalidarCacheOdometro_();', ctx);
  montarResumoFake([{ placa: 'AAA 0001', litros: 100, km: 0 }]);
  const p = problemasDe('AAA 0001');
  ok('continua sendo "não registrou KM nenhum" NESTE período',
    p.indexOf('Abasteceu e não registrou KM nenhum') !== -1, JSON.stringify(p) +
    ' — leitura de outro mês não mede percurso nenhum deste');
})();

console.log('\n7. Regras estáticas');
const fonte = fs.readFileSync(arquivo, 'utf8');
(function () {
  ok('a pendência antiga, que cobrava sempre, não existe mais',
    fonte.indexOf('Abasteceu mas não tem KM rodado no período') === -1,
    'ela disparava no primeiro abastecimento do mês, quando zero é a resposta certa');
  ['Abasteceu e não registrou KM nenhum',
   'Abasteceu mais de uma vez e só tem uma leitura de KM',
   'Leituras de KM do período são todas iguais'].forEach(function (nome) {
    ok('"' + nome + '" tem explicação na tela', !!ctx.acaoDaPendencia_(nome),
      'pendência sem explicação vira adivinhação para quem opera');
  });
  ok('as leituras são contadas só dentro do período',
    /if \(data >= periodo\.inicio && data <= periodo\.fim\) \{[\s\S]{0,140}leiturasNoPeriodo/.test(fonte));
})();

console.log('\n5. Depreciação com data do fim do período não é "período futuro"');
// V4.49: a depreciação deixou de esperar o último dia do período para ser
// LANÇADA, mas o lançamento continua datado no último dia — é o que mantém o
// custo na competência certa. Importando no dia 5, isso é uma data que ainda
// não chegou, e a pendência "Lançamento em período futuro" nasceu para pegar
// quem digitou o ano errado.
//
// A pergunta que esta prova responde é se aquela checagem olha o PERÍODO ou o
// RELÓGIO. Se olhasse o relógio, importar no dia 5 criaria 166 pendências
// impossíveis de resolver — o mesmo estrago do IPVA em parcelas, que já custou
// uma versão para consertar.
(function () {
  function depreciar(dia, mes) {
    const l = new Array(ctx.TOTAL_COL_LANC || 15).fill('');
    l[ctx.L_.DATA] = d(2026, mes, dia);
    l[ctx.L_.PLACA] = 'AAA 0001';
    l[ctx.L_.TIPO] = 'Depreciação';
    l[ctx.L_.VALOR] = 800;
    l[ctx.L_.CENTRO] = 'DEPÓSITO';
    l[ctx.L_.CATEGORIA] = 'Truck Normal';
    l[ctx.L_.ID] = 'LAN-DEP' + mes + dia;
    abas['Lançamentos'].dados.push(l);
    vm.runInContext('invalidarCacheLancamentos_();', ctx);
  }
  const antes = abas['Lançamentos'].dados.length;

  // Último dia do período aberto (26/10 a 25/11): a data que o gerador usa.
  depreciar(25, 11);
  montarResumoFake([{ placa: 'AAA 0001', litros: 0, km: 0 }]);
  let p = problemasDe('AAA 0001');
  ok('datada no último dia do período: não é período futuro',
    p.every(function (x) { return !/futuro/i.test(x); }), JSON.stringify(p));

  // E a checagem está VIVA: um dia depois do período continua sendo acusado.
  // Sem esta segunda metade, apagar a regra inteira faria a prova de cima passar.
  depreciar(26, 11);
  p = problemasDe('AAA 0001');
  ok('e um dia DEPOIS do período continua sendo acusado',
    p.some(function (x) { return /futuro/i.test(x); }), JSON.stringify(p));

  abas['Lançamentos'].dados.length = antes;
  vm.runInContext('invalidarCacheLancamentos_();', ctx);
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
