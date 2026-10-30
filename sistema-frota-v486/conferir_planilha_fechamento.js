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
    mesclados: [],
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
        merge: function () { aba.mesclados.push({ linha: linha, coluna: coluna, nC: nC }); return faixa; },
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

// O id NAO pode vir de diario.criadas.length: os blocos zeram essa lista e o
// id se repetia, fazendo a prova da lixeira passar com o id de uma planilha
// anterior. Contador proprio, que so cresce.
let seqPlanilha = 0;
function novaPlanilha(nome) {
  const abas = [novaAba('Página1')];
  const id = 'ID_' + (seqPlanilha++);
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
    gerarXlsxRelatorio_, webRelatorioXlsx, relatorioPorTipo_, CATALOGO_RELATORIOS,
    escreverRelatorioNaAba_, formatoPlanilha_, contextoDoFechamento_, htmlFechamentoPdf_,
    largurasDoCatalogo_,
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
  lerLancamentos_ = function () { return []; };
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

console.log('\n1. A aba única, no formato do modelo');
const arquivo = gerar();
const planilha = diario.criadas[0];
const nomes = planilha.getSheets().map(function (a) { return a.getName(); });
ok('uma aba só, sem a de informações',
  nomes.join(' | ') === 'Relatorio', nomes.join(' | '));
ok('o arquivo sai com o nome da competência',
  arquivo.getName() === 'Frota_Fechamento_2026-10.xlsx', arquivo.getName());
ok('e guardado na pasta de relatórios', diario.arquivos.length === 1);

const rel = planilha.getSheets()[0];
const CAB = 4, PRIMEIRA = 5, TOTAL = 10;   // 5 veículos na fixture

console.log('\n2. Valor é número, não texto que parece dinheiro');
// A contabilidade vai SOMAR estas células. Texto formatado passa
// despercebido na tela e quebra toda fórmula em cima.
ok('o combustível da primeira linha é número',
  typeof rel.valor(PRIMEIRA, 4) === 'number',
  typeof rel.valor(PRIMEIRA, 4) + ' = ' + rel.valor(PRIMEIRA, 4));
ok('é o valor cru, sem R$ nem separador', rel.valor(PRIMEIRA, 22) === 400,
  String(rel.valor(PRIMEIRA, 22)));
ok('quem formata é o formato de exibição', rel.formato(PRIMEIRA, 22) === 'R$ #,##0.00',
  String(rel.formato(PRIMEIRA, 22)));
ok('litros têm três casas, não formato de moeda',
  rel.formato(PRIMEIRA, 3) === '#,##0.000', String(rel.formato(PRIMEIRA, 3)));
ok('KM/litro é média, sem o % que o tipo "decimal" põe',
  rel.formato(PRIMEIRA, 20) === '#,##0.00', String(rel.formato(PRIMEIRA, 20)));
ok('a coluna de texto não ganha formato de moeda',
  rel.formato(PRIMEIRA, 1) === '@', String(rel.formato(PRIMEIRA, 1)));

console.log('\n3. As colunas e os grupos do modelo');
ok('a placa abre', rel.valor(CAB, 1) === 'Placa', String(rel.valor(CAB, 1)));
ok('o setor fecha', rel.valor(CAB, 23) === 'Setor', String(rel.valor(CAB, 23)));
ok('o TOTAL vem antes do setor', rel.valor(CAB, 22) === 'TOTAL R$', String(rel.valor(CAB, 22)));
ok('nenhuma coluna é de IPVA', (function () {
  for (let c = 1; c <= 23; c++) if (/IPVA/.test(String(rel.valor(CAB, c) || ''))) return false;
  return true;
})());
// O modelo junta "Combustível" por cima de litros e R$. A faixa de grupo vai
// na linha de cima do cabeçalho, que antes ficava vazia.
ok('a faixa "Combustível" fica sobre as colunas dele',
  rel.valor(CAB - 1, 3) === 'Combustível', String(rel.valor(CAB - 1, 3)));
ok('e "Lubrificante" sobre as dele',
  rel.valor(CAB - 1, 6) === 'Lubrificante', String(rel.valor(CAB - 1, 6)));
ok('a faixa não escreve por cima da placa',
  !rel.valor(CAB - 1, 1), String(rel.valor(CAB - 1, 1)));

console.log('\n4. A ordem e o setor');
ok('a primeira linha é a Loja 01', rel.valor(PRIMEIRA, 23) === 'Loja 01',
  String(rel.valor(PRIMEIRA, 23)));
ok('ordena por setor, não por valor',
  [rel.valor(5, 23), rel.valor(6, 23), rel.valor(7, 23), rel.valor(8, 23)].join(',') ===
  'Loja 01,Loja 02,Loja 02,Loja 10',
  [rel.valor(5, 23), rel.valor(6, 23), rel.valor(7, 23), rel.valor(8, 23)].join(','));
ok('dentro do setor, por placa',
  rel.valor(6, 1) === 'AAA 0001' && rel.valor(7, 1) === 'CCC 0003',
  rel.valor(6, 1) + ',' + rel.valor(7, 1));
ok('veículo sem centro de custo sai avisando, no fim',
  rel.valor(9, 23) === '⚠ sem loja', String(rel.valor(9, 23)));
ok('todo veículo do Resumo aparece, inclusive sem gasto nenhum',
  rel.valor(TOTAL, 1) === 'TOTAL', String(rel.valor(TOTAL, 1)));

console.log('\n5. O total e a capa');
// 2400 + 850 + 8900 + 400 + 600, sem os 150 de IPVA.
ok('o TOTAL soma as rubricas sem o IPVA', rel.valor(TOTAL, 22) === 13150,
  String(rel.valor(TOTAL, 22)));
ok('com o IPVA daria outro número', rel.valor(TOTAL, 22) !== 13150 + 150);
ok('a depreciação entra no total', rel.valor(TOTAL, 18) === 7000,
  String(rel.valor(TOTAL, 18)));
ok('as médias não são somadas no rodapé',
  (rel.valor(TOTAL, 20) === '' || rel.valor(TOTAL, 20) === undefined) &&
  (rel.valor(TOTAL, 21) === '' || rel.valor(TOTAL, 21) === undefined),
  rel.valor(TOTAL, 20) + ' / ' + rel.valor(TOTAL, 21));
ok('o total também é número', typeof rel.valor(TOTAL, 22) === 'number');

// A capa separada virou a linha de contexto, logo abaixo do título: quem
// recebe abre o arquivo e vê de onde o número veio, na mesma tela.
const contexto = String(rel.valor(2, 1) || '');
ok('o contexto traz a empresa', /GIASSI/.test(contexto), contexto);
ok('e a competência', /2026-10/.test(contexto), contexto);
ok('e o período', /26\/09\/2026 a 25\/10\/2026/.test(contexto), contexto);
ok('e quem gerou', /fulano@giassi\.com\.br/.test(contexto), contexto);
ok('e por que não há IPVA', /IPVA não tem coluna/.test(contexto), contexto);
ok('e o que o TOTAL soma', /inclusive multa e depreciação/.test(contexto), contexto);
ok('o contexto NÃO é mesclado nas 23 colunas',
  rel.mesclados.filter(function (m) { return m.linha <= 2; }).length === 0,
  'mesclar o título e pedir autoResize alargava a coluna A até meia tela');

console.log('\n5b. As colunas não saem com largura de autoResize');
ok('toda coluna recebe largura declarada',
  Object.keys(rel.larguras).length === 23, Object.keys(rel.larguras).length + ' de 23');
ok('a coluna da placa é estreita, não do tamanho do título',
  rel.larguras[1] === 100, String(rel.larguras[1]));
ok('e nenhuma passa de 320px', Object.keys(rel.larguras).every(function (k) {
  return rel.larguras[k] <= 320; }), JSON.stringify(rel.larguras));
ok('as larguras vêm do catálogo do relatório',
  ctx.largurasDoCatalogo_('Relatório Operacional dos Veículos')[0] === 100);
ok('relatório sem catálogo cai no padrão por tipo',
  ctx.largurasDoCatalogo_('Não existe') === null);

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

console.log('\n9b. Qualquer relatório da tela em planilha');
// O mesmo exportador do fechamento, para não existir um caminho que formata
// e outro que entrega texto.
diario.criadas.length = 0; diario.arquivos.length = 0; diario.fetch.length = 0;
let rx = ctx.webRelatorioXlsx('token', 'Relatório Operacional dos Veículos', {});
ok('exporta o relatório pedido', rx.ok === true && /\.xlsx$/.test(rx.nome), JSON.stringify(rx));
ok('o nome do arquivo traz o relatório e a competência',
  rx.nome === 'Frota_Relatorio_Operacional_dos_Veiculos_2026-10.xlsx', rx.nome);
ok('pede a exportação em xlsx', /[?&]format=xlsx\b/.test(diario.fetch[0].url));
ok('a temporária vai para a lixeira',
  diario.lixeira.indexOf(diario.criadas[0].getId()) !== -1, diario.lixeira.join(','));
const abaRx = diario.criadas[0].getSheets()[0];
ok('o valor sai como número, igual ao do fechamento',
  typeof abaRx.valor(5, 22) === 'number' && abaRx.formato(5, 22) === 'R$ #,##0.00',
  typeof abaRx.valor(5, 22) + ' / ' + abaRx.formato(5, 22));
ok('o subtítulo registra os filtros usados', (function () {
  diario.criadas.length = 0;
  ctx.webRelatorioXlsx('token', 'Relatório Operacional dos Veículos', { centro: 'Loja 02' });
  return /centro: Loja 02/.test(String(diario.criadas[0].getSheets()[0].valor(2, 1)));
})(), String(diario.criadas.length ? diario.criadas[0].getSheets()[0].valor(2, 1) : ''));
ok('e o filtro realmente filtra', (function () {
  diario.criadas.length = 0;
  ctx.webRelatorioXlsx('token', 'Relatório Operacional dos Veículos', { centro: 'Loja 02' });
  const a = diario.criadas[0].getSheets()[0];
  return a.valor(5, 23) === 'Loja 02' && a.valor(7, 1) === 'TOTAL';
})(), 'exportar sem aplicar o filtro entrega um arquivo diferente do que está na tela');
// Relatorio que nao existe nao pode virar arquivo vazio na pasta do Drive.
let erroRx = null;
diario.criadas.length = 0; diario.arquivos.length = 0;
try { ctx.webRelatorioXlsx('token', 'Relatório Inventado', {}); } catch (e) { erroRx = e; }
ok('relatório desconhecido é recusado', !!erroRx && /desconhecido/.test(erroRx.message),
  erroRx ? erroRx.message : 'gerou sem reclamar');
ok('e não cria planilha nem arquivo',
  diario.criadas.length === 0 && diario.arquivos.length === 0);

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
  diario.criadas[0].getSheets()[0].valor(4 + 1200 + 1, 1) === 'TOTAL');

console.log(falhas ? '\n' + falhas + ' FALHA(S) de ' + provas : '\nTUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
