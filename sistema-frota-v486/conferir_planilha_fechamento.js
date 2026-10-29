/**
 * Prova da planilha (.xlsx) do fechamento.
 *
 * O PDF so precisa estar certo na leitura. A planilha vai ser TRABALHADA: a
 * contabilidade soma, filtra e faz tabela dinamica em cima dela. Entao o que
 * se prova aqui e outra coisa — que valor saiu como NUMERO e nao como texto
 * parecido com dinheiro, que o total esta na coluna que o cabecalho promete,
 * e que a planilha temporaria usada para gerar o arquivo nao fica largada no
 * Drive nem quando a exportacao falha.
 *
 * A dublê de planilha valida DIMENSAO: escrever 9 colunas num intervalo de 7
 * reprova aqui, como reprovaria no Apps Script.
 */
const fs = require('fs');
const vm = require('vm');

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

// ---------------------------------------------------------------- a dublê

function colunaLetra(n) { return String.fromCharCode(64 + n); }

function novaAba(nome) {
  const aba = {
    nome: nome,
    maxRows: 1000,
    maxCols: 26,
    grade: {},          // 'linha,coluna' -> valor
    formatos: {},       // 'linha,coluna' -> formato
    estilos: {},        // 'linha,coluna' -> { fundo, negrito }
    congeladas: 0,
    larguras: {},
    setName: function (n) { aba.nome = n; return aba; },
    getName: function () { return aba.nome; },
    getMaxRows: function () { return aba.maxRows; },
    getMaxColumns: function () { return aba.maxCols; },
    insertRowsAfter: function (_d, q) { aba.maxRows += q; },
    insertColumnsAfter: function (_d, q) { aba.maxCols += q; },
    setFrozenRows: function (n) { aba.congeladas = n; },
    autoResizeColumns: function () {},
    setColumnWidth: function (c, l) { aba.larguras[c] = l; },
    setHiddenGridlines: function () { return aba; },
    clear: function () { aba.grade = {}; return aba; },
    getDataRange: function () { return aba.getRange(1, 1, aba.maxRows, aba.maxCols); },
    valor: function (l, c) { return aba.grade[l + ',' + c]; },
    formato: function (l, c) { return aba.formatos[l + ',' + c]; },
    getRange: function (a, b, c, d) {
      let linha = a, coluna = b, nL = c || 1, nC = d || 1;
      if (typeof a === 'string') {
        const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a);
        if (!m) throw new Error('intervalo invalido: ' + a);
        coluna = m[1].charCodeAt(0) - 64; linha = Number(m[2]);
        nC = m[3] ? (m[3].charCodeAt(0) - 64) - coluna + 1 : 1;
        nL = m[4] ? Number(m[4]) - linha + 1 : 1;
      }
      if (linha < 1 || coluna < 1) throw new Error('intervalo fora da aba');
      if (linha + nL - 1 > aba.maxRows) {
        throw new Error('intervalo passa da ultima linha da aba ' + aba.nome +
          ': pediu ate ' + (linha + nL - 1) + ', a aba tem ' + aba.maxRows);
      }
      if (coluna + nC - 1 > aba.maxCols) {
        throw new Error('intervalo passa da ultima coluna da aba ' + aba.nome);
      }
      const faixa = {
        setValues: function (v) {
          if (v.length !== nL) throw new Error('setValues: ' + v.length + ' linhas num intervalo de ' + nL);
          v.forEach(function (linhaV, i) {
            if (linhaV.length !== nC) {
              throw new Error('setValues: ' + linhaV.length + ' colunas num intervalo de ' + nC);
            }
            linhaV.forEach(function (x, j) { aba.grade[(linha + i) + ',' + (coluna + j)] = x; });
          });
          return faixa;
        },
        setValue: function (x) { aba.grade[linha + ',' + coluna] = x; return faixa; },
        merge: function () { return faixa; },
        setNumberFormat: function (f) {
          for (let i = 0; i < nL; i++) for (let j = 0; j < nC; j++) {
            aba.formatos[(linha + i) + ',' + (coluna + j)] = f;
          }
          return faixa;
        },
        setNumberFormats: function (m) {
          if (m.length !== nL) throw new Error('setNumberFormats: ' + m.length + ' linhas num intervalo de ' + nL);
          m.forEach(function (linhaF, i) {
            if (linhaF.length !== nC) throw new Error('setNumberFormats: ' + linhaF.length + ' colunas num intervalo de ' + nC);
            linhaF.forEach(function (f, j) { aba.formatos[(linha + i) + ',' + (coluna + j)] = f; });
          });
          return faixa;
        },
        setHorizontalAlignments: function (m) {
          if (m.length !== nL) throw new Error('setHorizontalAlignments: linhas fora do intervalo');
          m.forEach(function (linhaA) {
            if (linhaA.length !== nC) throw new Error('setHorizontalAlignments: colunas fora do intervalo');
          });
          return faixa;
        },
        setBackground: function (cor) {
          for (let i = 0; i < nL; i++) for (let j = 0; j < nC; j++) {
            const k = (linha + i) + ',' + (coluna + j);
            aba.estilos[k] = Object.assign({}, aba.estilos[k], { fundo: cor });
          }
          return faixa;
        },
        setFontWeight: function (p) {
          for (let i = 0; i < nL; i++) for (let j = 0; j < nC; j++) {
            const k = (linha + i) + ',' + (coluna + j);
            aba.estilos[k] = Object.assign({}, aba.estilos[k], { negrito: p === 'bold' });
          }
          return faixa;
        },
      };
      ['setFontColor', 'setFontSize', 'setWrap', 'setHorizontalAlignment',
       'setVerticalAlignment', 'setBorder'].forEach(function (m) {
        faixa[m] = function () { return faixa; };
      });
      return faixa;
    },
  };
  return aba;
}

const diario = { criadas: [], lixeira: [], fetch: [], arquivos: [], log: [] };

function novaPlanilha(nome) {
  const abas = [novaAba('Página1')];
  const id = 'ID_' + diario.criadas.length;
  const p = {
    id: id, nome: nome, abas: abas,
    getId: function () { return id; },
    getSheets: function () { return abas; },
    insertSheet: function (n) { const a = novaAba(n); abas.push(a); return a; },
    setActiveSheet: function () {},
  };
  diario.criadas.push(p);
  return p;
}

let httpCodigo = 200;

const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, setProperties: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {}, create: novaPlanilha },
  Utilities: { getUuid: () => 'abcdef1234', formatDate: () => '29/10/2026 09:14' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true }) },
  ScriptApp: { getOAuthToken: () => 'TOKEN_FALSO' },
  UrlFetchApp: {
    fetch: function (url, opcoes) {
      diario.fetch.push({ url: url, opcoes: opcoes });
      return {
        getResponseCode: function () { return httpCodigo; },
        getBlob: function () {
          const b = { nome: '' };
          b.setName = function (n) { b.nome = n; return b; };
          return b;
        },
      };
    },
  },
  DriveApp: {
    getFileById: function (id) {
      return { setTrashed: function () { diario.lixeira.push(id); } };
    },
  },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { gerarXlsxFechamento_, webFechamentoXlsx, dadosFechamento_,
    escreverRelatorioNaAba_, formatoPlanilha_, capaPlanilhaFechamento_, htmlFechamentoPdf_,
    tipoEhNumerico_, col_, R_, TOTAL_COL_RESUMO, PASTA_RELATORIOS });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  autorizarContextoWeb_ = function () {};
  registrarLog_ = function (a, b) { __diario.log.push(a + ' | ' + b); };
  param_ = function (n) {
    if (n === 'EMPRESA') return 'GIASSI & CIA. LTDA.';
    if (n === 'MES_REFERENCIA') return '2026-10';
    return '';
  };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoDoMes_ = function () { return { inicio: new Date(2026, 8, 26), fim: new Date(2026, 9, 25) }; };
  formatarData_ = function (d) { return ('0'+d.getDate()).slice(-2) + '/' +
    ('0'+(d.getMonth()+1)).slice(-2) + '/' + d.getFullYear(); };
  timezone_ = function () { return 'America/Sao_Paulo'; };
  emailContextoAtual_ = function () { return 'fulano@giassi.com.br'; };
  lerResumo_ = function () { return __resumo || []; };
  dadosVeiculosExecucao_ = function () { return []; };
  pastaDeRelatorios_ = function () {
    return { createFile: function (blob) {
      __diario.arquivos.push(blob.nome);
      return { getName: function () { return blob.nome; },
               getUrl: function () { return 'https://drive/' + blob.nome; } };
    } };
  };
`, ctx);
ctx.__diario = diario;

// ------------------------------------------------------------- a fixture
//
// A loja 01 tem o MENOR gasto de manutenção: assim a ordem por loja e a ordem
// por valor não coincidem, e a prova distingue as duas.
function veic(placa, desc, cat, centro, dep, oficina, pneus, extras) {
  const l = new Array(ctx.TOTAL_COL_RESUMO).fill(0);
  l[ctx.R_.PLACA] = placa; l[ctx.R_.DESCRICAO] = desc; l[ctx.R_.CATEGORIA] = cat;
  l[ctx.R_.CENTRO] = centro; l[ctx.R_.DEPRECIACAO] = dep;
  l[ctx.R_.OFICINA] = oficina; l[ctx.R_.PNEUS] = pneus;
  const e = extras || {};
  l[ctx.R_.COMBUSTIVEL] = e.combustivel || 0;
  l[ctx.R_.IPVA] = e.ipva || 0;
  l[ctx.R_.PEDAGIO] = e.pedagio || 0;
  return l;
}
ctx.__resumo = [
  veic('AAA 0001', 'Palio', 'Leve', 'Loja 02', 1000, 800, 200, { combustivel: 400, ipva: 60 }),
  veic('BBB 0002', 'Scania', 'Carreta Normal', 'Loja 10', 700, 0, 0, { pedagio: 150, ipva: 90 }),
  veic('CCC 0003', 'Gol', 'Leve', 'Loja 02', 5000, 3000, 0, { combustivel: 900 }),
  veic('DDD 0004', 'Moto', 'Moto', 'Loja 01', 300, 100, 0),
  veic('EEE 0005', 'Furgão', 'Leve', '', 0, 500, 0, { combustivel: 100 }),
];

function gerar() {
  diario.criadas.length = 0; diario.lixeira.length = 0;
  diario.fetch.length = 0; diario.arquivos.length = 0;
  return ctx.gerarXlsxFechamento_('');
}

console.log('\n1. As abas e a ordem delas');
const arquivo = gerar();
const planilha = diario.criadas[0];
const nomes = planilha.getSheets().map(function (a) { return a.getName(); });
ok('três abas: capa, depreciação e despesas',
  nomes.join(' | ') === '0_Informacoes | 1_Depreciacao | 2_Despesas', nomes.join(' | '));
ok('o arquivo sai com o nome da competência',
  arquivo.getName() === 'Frota_Fechamento_2026-10.xlsx', arquivo.getName());
ok('e guardado na pasta de relatórios', diario.arquivos.length === 1);

const dep = planilha.getSheets()[1];
const man = planilha.getSheets()[2];

console.log('\n2. Valor é número, não texto que parece dinheiro');
// A contabilidade vai SOMAR estas células. Texto formatado passa despercebido
// na tela e quebra toda fórmula em cima.
const celulaValor = dep.valor(5, 4);
ok('a depreciação da primeira linha é número',
  typeof celulaValor === 'number', typeof celulaValor + ' = ' + celulaValor);
ok('é o valor cru, sem R$ nem separador',
  celulaValor === 300, String(celulaValor));
ok('quem formata é o formato de exibição da célula',
  dep.formato(5, 4) === 'R$ #,##0.00', String(dep.formato(5, 4)));
ok('a coluna de texto não ganha formato de moeda',
  dep.formato(5, 1) === '@', String(dep.formato(5, 1)));
ok('formatoPlanilha_ cobre os tipos declarados',
  ctx.formatoPlanilha_('moeda') === 'R$ #,##0.00' &&
  ctx.formatoPlanilha_('moeda3') === 'R$ #,##0.000' &&
  ctx.formatoPlanilha_('numero') === '#,##0' &&
  ctx.formatoPlanilha_('decimal') === '#,##0.00"%"' &&
  ctx.formatoPlanilha_('texto') === '@');

console.log('\n3. A loja abre as duas abas');
ok('Loja é o cabeçalho da coluna 1 na depreciação', dep.valor(4, 1) === 'Loja', String(dep.valor(4, 1)));
ok('Loja é o cabeçalho da coluna 1 nas despesas', man.valor(4, 1) === 'Loja', String(man.valor(4, 1)));
ok('a primeira linha da depreciação é a Loja 01', dep.valor(5, 1) === 'Loja 01', String(dep.valor(5, 1)));
ok('a primeira linha das despesas é a Loja 01', man.valor(5, 1) === 'Loja 01', String(man.valor(5, 1)));
ok('as despesas não estão ordenadas só por valor: a Loja 01 gastou menos',
  man.valor(5, 9) === 100, String(man.valor(5, 9)));
// O aviso tem de aparecer, mas no FIM: um documento que vai para a
// contabilidade não abre com uma linha de problema.
ok('veículo sem centro de custo sai avisando, não em branco',
  man.valor(9, 1) === '⚠ sem loja', String(man.valor(9, 1)));
ok('e sai depois das lojas de verdade, não na frente',
  ['Loja 01', 'Loja 02', 'Loja 02', 'Loja 10'].join(',') ===
  [man.valor(5, 1), man.valor(6, 1), man.valor(7, 1), man.valor(8, 1)].join(','),
  [man.valor(5, 1), man.valor(6, 1), man.valor(7, 1), man.valor(8, 1), man.valor(9, 1)].join(','));

console.log('\n4. O total');
// O índice do total já andou uma casa quando a Loja entrou na frente. Aqui a
// prova é posicional: o total fica sob o cabeçalho que o promete.
const linhaTotalDep = 4 + 4 + 1;   // cabeçalho + 4 veículos com depreciação + 1
ok('a linha de total da depreciação diz TOTAL',
  dep.valor(linhaTotalDep, 1) === 'TOTAL', String(dep.valor(linhaTotalDep, 1)));
ok('e soma os quatro valores', dep.valor(linhaTotalDep, 4) === 7000,
  String(dep.valor(linhaTotalDep, 4)));
const linhaTotalMan = 4 + 5 + 1;
// Toda a despesa menos depreciação e IPVA: 1400+150+3900+100+600 = 6150.
ok('o total das despesas fica sob o cabeçalho "Despesa"',
  man.valor(4, 9) === 'Despesa' && man.valor(linhaTotalMan, 9) === 6150,
  man.valor(4, 9) + ' = ' + man.valor(linhaTotalMan, 9));
ok('e não é o total dos pneus',
  man.valor(linhaTotalMan, 7) === 200, String(man.valor(linhaTotalMan, 7)));
ok('o IPVA não está em lugar nenhum da aba',
  man.valor(linhaTotalMan, 9) !== 6150 + 150, String(man.valor(linhaTotalMan, 9)));
ok('o combustível entra na soma', man.valor(linhaTotalMan, 5) === 1400,
  String(man.valor(linhaTotalMan, 5)));
ok('e o pedágio entra em "Outros"', man.valor(linhaTotalMan, 8) === 150,
  String(man.valor(linhaTotalMan, 8)));
ok('o total também é número', typeof dep.valor(linhaTotalDep, 4) === 'number');
ok('a célula de total tem formato de moeda',
  dep.formato(linhaTotalDep, 4) === 'R$ #,##0.00');

console.log('\n5. A capa');
const capa = planilha.getSheets()[0];
function procurarNaCapa(rotulo) {
  for (let l = 1; l <= 20; l++) if (capa.valor(l, 1) === rotulo) return capa.valor(l, 2);
  return undefined;
}
ok('a capa traz a competência', procurarNaCapa('Competência') === '2026-10');
ok('a capa traz a depreciação como número', procurarNaCapa('Depreciação R$') === 7000);
ok('a capa traz as despesas como número',
  procurarNaCapa('Despesas R$ (exceto depreciação)') === 6150,
  String(procurarNaCapa('Despesas R$ (exceto depreciação)')));
ok('e diz o que ficou fora da seção 2',
  /IPVA/.test(String(procurarNaCapa('Fora da seção 2'))),
  String(procurarNaCapa('Fora da seção 2')));
ok('e o que há dentro de "Outros"',
  String(procurarNaCapa('Dentro de "Outros"')).indexOf('pedágio') !== -1,
  String(procurarNaCapa('Dentro de \"Outros\"')));
ok('os totais da capa batem com os das abas',
  procurarNaCapa('Depreciação R$') === dep.valor(linhaTotalDep, 4) &&
  procurarNaCapa('Despesas R$ (exceto depreciação)') === man.valor(linhaTotalMan, 9));

console.log('\n6. A exportação e a planilha temporária');
ok('pede a exportação em xlsx',
  /[?&]format=xlsx\b/.test(diario.fetch[0].url), diario.fetch[0].url);
ok('exporta a temporária, não a planilha do sistema',
  diario.fetch[0].url.indexOf('/' + planilha.getId() + '/') !== -1, diario.fetch[0].url);
ok('vai autenticada', /Bearer /.test(diario.fetch[0].opcoes.headers.Authorization));
ok('a temporária vai para a lixeira',
  diario.lixeira.indexOf(planilha.getId()) !== -1, diario.lixeira.join(','));
ok('o nome da temporária não se confunde com o do arquivo entregue',
  planilha.nome.indexOf('temp') !== -1, planilha.nome);
ok('registra no Log', diario.log.some(function (l) { return /Planilha do fechamento/.test(l); }));

console.log('\n7. Quando a exportação falha');
// Sem o finally, cada tentativa frustrada deixava uma planilha largada no
// Drive do usuário — e ninguém vai limpar isso à mão.
httpCodigo = 500;
let erro = null;
try { gerar(); } catch (e) { erro = e; }
httpCodigo = 200;
ok('o erro sobe, em vez de entregar arquivo vazio', !!erro && /HTTP 500/.test(erro.message),
  erro ? erro.message : 'nenhum erro');
ok('nenhum arquivo é criado na pasta', diario.arquivos.length === 0);
ok('e a temporária vai para a lixeira mesmo assim',
  diario.lixeira.length === 1 && diario.lixeira[0] === diario.criadas[0].getId(),
  diario.lixeira.join(','));

console.log('\n8. Os dois formatos leem a mesma regra de competência');
function recusa(fn) {
  try { fn(); return null; } catch (e) { return e.message; }
}
diario.criadas.length = 0;
const msgXlsx = recusa(function () { ctx.gerarXlsxFechamento_('2026-09'); });
const msgPdf = recusa(function () { ctx.htmlFechamentoPdf_('2026-09'); });
ok('a planilha recusa competência fechada', !!msgXlsx && /competência aberta/.test(msgXlsx), String(msgXlsx));
ok('o PDF recusa com a mesma mensagem', msgPdf === msgXlsx, String(msgPdf) + ' ≠ ' + String(msgXlsx));
ok('a recusa vem ANTES de criar a planilha temporária',
  diario.criadas.length === 0, String(diario.criadas.length) + ' criada(s)');

console.log('\n9. O callback da tela');
diario.criadas.length = 0; diario.arquivos.length = 0;
const r = ctx.webFechamentoXlsx('token', '');
ok('devolve ok, nome, url e pasta',
  r.ok === true && /\.xlsx$/.test(r.nome) && /^https:\/\//.test(r.url) &&
  r.pasta === ctx.PASTA_RELATORIOS, JSON.stringify(r));
ok('a mensagem fala em planilha, não em PDF',
  /planilha/i.test(r.mensagem) && !/PDF/i.test(r.mensagem), r.mensagem);

console.log('\n10. A aba não é escrita fora do seu tamanho');
// A dublê reprova intervalo maior que a aba, como o Apps Script faz. Esta
// prova existe para o caso de uma frota maior que a aba padrão.
const grande = [];
for (let i = 0; i < 1200; i++) grande.push(veic('P' + i, 'X', 'Leve', 'Loja 05', 10, 10, 0));
ctx.__resumo = grande;
let erroGrande = null;
try { gerar(); } catch (e) { erroGrande = e; }
ok('1200 veículos cabem: a aba cresce antes de escrever', !erroGrande,
  erroGrande ? erroGrande.message : '');
ok('e o total continua na última linha de dados + 1',
  diario.criadas[0].getSheets()[1].valor(4 + 1200 + 1, 1) === 'TOTAL');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
