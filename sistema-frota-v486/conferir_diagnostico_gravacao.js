/**
 * "Onde foi gravado?" — a planilha e a linha, provadas.
 *
 * O usuario viu tres vezes a mensagem "Lançamento gravado" sem o lancamento
 * aparecer na planilha. A V4.40.3 fechou o caso de gravar POR CIMA de outra
 * linha; o que sobrou nao e a gravacao, e a INFORMACAO: dizer "gravado" sem
 * dizer em QUE arquivo e em QUE linha nao da para conferir. As tres causas que
 * restam — planilha diferente (copia que ainda aponta para a original), linha
 * longe (dado solto empurrando a gravacao para a linha 9.001) e filtro na aba
 * — ficam todas visiveis neste diagnostico.
 *
 * O dublê e o mesmo de conferir_gravacao_lancamento.js (aba de verdade, com
 * getNextDataCell imitando Ctrl+Seta), mais o ID guardado nas propriedades do
 * script, que e o que revela a copia.
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
    getScriptProperties: () => ({
      getProperty: (k) => (k === 'PLANILHA_ID' ? PROP_PLANILHA_ID : null),
      setProperty: () => {}, deleteProperty: () => {} }),
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
    // UUID DIFERENTE a cada chamada: com um fixo, todo lançamento nasce com
    // o mesmo ID e a busca por ID acharia sempre o primeiro — a suíte
    // aprovaria um diagnóstico que devolve a linha errada.
    // O ID do lançamento é feito dos 10 PRIMEIROS caracteres do UUID, então
    // o contador vai na frente. No fim, todo lançamento nasceria com o mesmo
    // ID e a busca por ID acharia sempre o primeiro — a suíte aprovaria um
    // diagnóstico que devolve a linha errada.
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
let PROP_PLANILHA_ID = 'planilha-fake';
const planilha = {
  getName: () => 'MAPA FROTA 2026',
  getUrl: () => 'https://docs.google.com/spreadsheets/d/planilha-fake/edit',
  getSheetByName: (n) => abas[n] || null,
  getSheets: () => Object.keys(abas).map(k => abas[k]),
  insertSheet: (n) => novaAba(n, []),
  getId: () => 'planilha-fake',
  getSpreadsheetTimeZone: () => 'America/Sao_Paulo',
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(arquivo, 'utf8') + `
  Object.assign(globalThis, { salvarLancamento_, ABAS, COL_LANC, L_, COL_VEIC, COL_CENTRO,
    diagnosticoGravacao_, textoDiagnosticoGravacao_, sobrasAbaixoDosLancamentos_ });
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

console.log('\n1. O diagnóstico diz EM QUE ARQUIVO o sistema grava');
// Sem isto a pessoa nao tem o que conferir: o app da web abre a planilha por
// um ID guardado, e uma COPIA da planilha continua gravando na original.
(function () {
  const d = ctx.diagnosticoGravacao_(null);
  ok('o nome da planilha', d.planilha.nome === 'MAPA FROTA 2026', JSON.stringify(d.planilha));
  ok('o link, para abrir e olhar', /docs\.google\.com/.test(String(d.planilha.url)), d.planilha.url);
  ok('e de onde veio essa identificação',
    /planilha aberta|PROPRIEDADES|propriedades/i.test(String(d.planilha.origem)), d.planilha.origem);
  const t = ctx.textoDiagnosticoGravacao_(d);
  ok('o texto traz nome e link juntos',
    t.indexOf('MAPA FROTA 2026') !== -1 && t.indexOf('docs.google.com') !== -1, t.slice(0, 200));
})();

console.log('\n2. A armadilha da CÓPIA é acusada por nome');
// Copiar a planilha copia o script E as propriedades: a copia guarda o ID da
// ORIGINAL e grava la. O sistema acerta, o arquivo e outro, e a tela diz
// "gravado" com razao. E o unico caso em que "gravado" e verdade e o
// lancamento nao esta aqui.
(function () {
  PROP_PLANILHA_ID = 'outra-planilha-qualquer';
  const d = ctx.diagnosticoGravacao_(null);
  ok('o diagnóstico marca a suspeita de cópia', d.planilha.copiaSuspeita === true,
    JSON.stringify(d.planilha));
  const t = ctx.textoDiagnosticoGravacao_(d);
  ok('e o texto explica o que fazer',
    /CÓPIA|cópia/.test(t) && /Instalar \/ atualizar sistema/.test(t), t);
  PROP_PLANILHA_ID = 'planilha-fake';
  ok('planilha certa não vira suspeita',
    ctx.diagnosticoGravacao_(null).planilha.copiaSuspeita === false, 'falso positivo assusta sem motivo');
})();

console.log('\n3. A LINHA de cada lançamento');
(function () {
  const r = gravar({
    placa: 'AAA 0001', tipo: 'Combustivel Terceiros', data: '2026-11-12',
    litros: 300, valor: 1800, documento: 'NF 1',
  });
  ok('gravou', r.ok === true, r.mensagem);
  ok('a mensagem de sucesso diz a linha', /linha \d+/.test(String(r.mensagem)), r.mensagem);
  const d = ctx.diagnosticoGravacao_(null);
  ok('o diagnóstico conta 1 lançamento', d.aba.lancamentos === 1, JSON.stringify(d.aba));
  ok('e aponta a linha dele', d.aba.ultimaLinhaComPlaca === 2, JSON.stringify(d.aba));
  ok('e diz para onde vai o próximo', d.aba.proximaLinha === 3, JSON.stringify(d.aba));
  ok('os últimos lançamentos vêm com linha e ID',
    d.ultimos.length === 1 && d.ultimos[0].linha === 2 && /^LAN/.test(String(d.ultimos[0].id)),
    JSON.stringify(d.ultimos));
  const t = ctx.textoDiagnosticoGravacao_(d);
  ok('e o texto mostra litros em pt-BR (300,000 L, não 300.000)',
    t.indexOf('300,000 L') !== -1, t);
})();

console.log('\n4. Procurar pelo ID: a pergunta que o usuário faz');
(function () {
  const id = ctx.diagnosticoGravacao_(null).ultimos[0].id;
  const achado = ctx.diagnosticoGravacao_(id);
  ok('acha o ID e devolve a linha',
    achado.procurado && achado.procurado.achado === true && achado.procurado.linha === 2,
    JSON.stringify(achado.procurado));
  ok('o texto diz a linha em letras',
    /está na LINHA 2/.test(ctx.textoDiagnosticoGravacao_(achado)),
    ctx.textoDiagnosticoGravacao_(achado));
  const sumido = ctx.diagnosticoGravacao_('LAN-NAO-EXISTE');
  ok('e, quando não acha, NÃO diz que achou',
    sumido.procurado && sumido.procurado.achado === false, JSON.stringify(sumido.procurado));
  ok('e manda conferir a outra planilha — é a única causa que sobra',
    /NÃO está nesta aba/.test(ctx.textoDiagnosticoGravacao_(sumido)) &&
    /outra planilha/.test(ctx.textoDiagnosticoGravacao_(sumido)),
    ctx.textoDiagnosticoGravacao_(sumido));
})();

console.log('\n5. Dado solto lá embaixo (fora da coluna da placa)');
// Isto NAO empurra a gravacao — a linha de destino sai da coluna PLACA —, mas
// atrapalha a conferencia: a aba parece ter dado onde nao ha lancamento.
// Dizer a verdade exata aqui importa: prometer que este caso move a gravacao
// mandaria o usuario limpar a coisa errada.
(function () {
  const lanc = abas['Lançamentos'];
  while (lanc.dados.length < 60) lanc.dados.push(new Array(lanc.maxCols).fill(''));
  lanc.dados[59] = new Array(lanc.maxCols).fill('');
  lanc.dados[59][ctx.COL_LANC.OBSERVACAO - 1] = 'teste antigo';
  const d = ctx.diagnosticoGravacao_(null);
  ok('acusa que existe dado abaixo do último lançamento', d.aba.dadoSolto === true,
    JSON.stringify(d.aba));
  ok('e diz até que linha', d.aba.ultimaLinhaComQualquerDado === 60, JSON.stringify(d.aba));
  ok('e em que coluna', /observacao|observação/i.test(String(d.aba.colunaDoUltimoDado)),
    d.aba.colunaDoUltimoDado);
  const sobras = ctx.sobrasAbaixoDosLancamentos_();
  ok('a lista de sobras aponta a linha',
    sobras.linhas.length === 1 && sobras.linhas[0].linha === 60, JSON.stringify(sobras));
  ok('e mostra o conteúdo, para a pessoa decidir se apaga',
    /teste antigo/.test(String(sobras.linhas[0].conteudo)), JSON.stringify(sobras.linhas[0]));
  const r = gravar({
    placa: 'AAA 0001', tipo: 'Pneus', data: '2026-11-13', valor: 500, documento: 'NF 9',
  });
  ok('e a gravação segue na sequência normal, sem pular',
    r.ok === true && /linha 3/.test(r.mensagem),
    r.mensagem + ' — sobra fora da coluna PLACA não move a gravação');
  lanc.dados[59] = new Array(lanc.maxCols).fill('');
})();

console.log('\n6. Placa solta lá embaixo: é ESTA que empurra a gravação');
// Uma placa perdida na linha 60 (importacao antiga, colagem, teste) faz TODO
// lancamento novo ir para a 61 — gravado de verdade, abaixo de dezenas de
// linhas vazias. E o caso "diz gravado e nao aparece" que nao e defeito de
// gravacao nenhum: e a pessoa olhando a linha 4 enquanto o dado esta na 61.
(function () {
  const lanc = abas['Lançamentos'];
  lanc.dados[59] = new Array(lanc.maxCols).fill('');
  lanc.dados[59][ctx.COL_LANC.PLACA - 1] = 'AAA 0001';
  const r = gravar({
    placa: 'AAA 0001', tipo: 'Pneus', data: '2026-11-14', valor: 700, documento: 'NF 10',
  });
  ok('o lançamento vai para depois da placa solta',
    r.ok === true && /linha 61/.test(String(r.mensagem)),
    r.mensagem + ' — e sem a linha na mensagem ninguém o encontraria');
  const d = ctx.diagnosticoGravacao_(null);
  ok('e o diagnóstico mostra o vão', d.aba.buracos > 50, JSON.stringify(d.aba));
  ok('contando o vão como linha sem placa, não como lançamento',
    d.aba.buracos === d.aba.linhasNoBloco - d.aba.lancamentos, JSON.stringify(d.aba));
  ok('o texto avisa das linhas sem placa',
    /linha\(s\) sem placa/.test(ctx.textoDiagnosticoGravacao_(d)),
    ctx.textoDiagnosticoGravacao_(d));
  ok('e o último lançamento aparece com a linha 61',
    d.ultimos.some(function (l) { return l.linha === 61; }), JSON.stringify(d.ultimos));
  // Procurar POR ID tem de devolver a linha de verdade, nao a primeira. Um
  // numero chumbado aqui mandaria a pessoa olhar a linha 2 e nao achar nada.
  const alvo = d.ultimos.filter(function (l) { return l.linha === 61; })[0];
  const achado = ctx.diagnosticoGravacao_(alvo ? alvo.id : 'sem-id');
  ok('e procurar esse ID devolve a linha 61, não a primeira',
    achado.procurado && achado.procurado.achado === true && achado.procurado.linha === 61,
    JSON.stringify(achado.procurado));
  ok('com a placa e o valor, para a pessoa reconhecer o lançamento',
    achado.procurado && achado.procurado.placa === 'AAA 0001' && achado.procurado.valor === 700,
    JSON.stringify(achado.procurado));
})();

console.log('\n7. Regras estáticas: o dono da informação é um só');
const fonte = fs.readFileSync(arquivo, 'utf8');
(function () {
  const trecho = fonte.slice(fonte.indexOf('function salvarLancamento_'),
    fonte.indexOf('function salvarLancamentoPlanilha'));
  ok('a mensagem de sucesso carrega a linha', /linha \' \+ linha/.test(trecho),
    'sem a linha, "gravado" não dá para conferir');
  ok('o Log também registra a linha', /registrarLog_\(\'Lançamento\'[\s\S]{0,160}linha/.test(trecho),
    'o Log é onde se olha depois, quando a tela já fechou');
  ok('nenhum toFixed no caminho de gravação', trecho.indexOf('toFixed') === -1,
    'ponto decimal em pt-BR se lê como milhar: 1234.50 vira "mil duzentos e trinta e quatro mil"');
  ok('a tela tem o botão de conferir onde gravou',
    fs.readFileSync('App.html', 'utf8').indexOf('webDiagnosticoGravacao') !== -1,
    'o diagnóstico que só existe no menu da planilha não serve a quem opera pelo app');
  ok('e o endpoint existe no servidor', /function webDiagnosticoGravacao\(/.test(fonte),
    'callback sem função é erro só no clique');
  ok('o menu da planilha também abre o diagnóstico',
    /addItem\('🔎 Onde foi gravado/.test(fonte),
    'dentro da planilha é onde se compara o nome do arquivo');
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
