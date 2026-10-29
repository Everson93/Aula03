/**
 * Prova do PDF do rateio.
 *
 * O que importa aqui nao e "ficou bonito" — e que o documento NAO MINTA. Um
 * PDF sai da mesa e circula: se o total nao fechar, ou se as ressalvas da
 * apuracao ficarem de fora, alguem decide com base nele sem saber o que nao
 * esta ali.
 *
 * O visual e conferido a olho, gerando o HTML e abrindo. Estas provas cuidam
 * dos numeros e do que precisa estar escrito.
 */
const fs = require('fs');
const vm = require('vm');

const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null, flush: () => {} },
  Utilities: { getUuid: () => 'x', formatDate: () => '29/10/2026 09:14' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, { htmlRateioPdf_, escHtml_, brlPdf_, numBR_, VERSAO_SISTEMA });
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  param_ = function (n) {
    if (n === 'EMPRESA') return __empresa;
    if (n === 'BASE_RATEIO') return 'DEPÓSITO,EMPILHADEIRAS';
    if (n === 'MES_REFERENCIA') return '2026-10';
    return '';
  };
  normalizarMesReferencia_ = function (m) { return String(m); };
  periodoDoMes_ = function () { return { inicio: new Date(2026, 8, 26), fim: new Date(2026, 9, 25) }; };
  formatarData_ = function (d) { return ('0'+d.getDate()).slice(-2) + '/' +
    ('0'+(d.getMonth()+1)).slice(-2) + '/' + d.getFullYear(); };
  nomeDoMes_ = function () { return 'outubro de 2026'; };
  timezone_ = function () { return 'America/Sao_Paulo'; };
  emailContextoAtual_ = function () { return 'fulano@giassi.com.br'; };
  apurarRateio_ = function () { return __apuracao; };
`, ctx);

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

ctx.__empresa = 'GIASSI & CIA. LTDA.';

function apuracao(extras) {
  // O maior total é a Loja 03, NÃO a primeira da lista: trocar "o maior" por
  // "o primeiro" tem de reprovar, e com o maior em primeiro lugar não reprova.
  const pcts = [0.20, 0.25, 0.40, 0.15];
  const diretos = [1000, 2000, 3000, 4000];
  const base = 50000;
  const soma = pcts.reduce(function (a, b) { return a + b; }, 0);
  const linhas = pcts.map(function (p, i) {
    const rateio = base * p * (1 / soma);
    return { centro: 'Loja 0' + (i + 1), direto: diretos[i], percentual: p, recebe: true,
      rateio: rateio, distribuido: 0, total: diretos[i] + rateio, orfao: false };
  });
  linhas.push({ centro: 'DEPÓSITO', direto: 30000, percentual: 0, recebe: false,
    rateio: 0, distribuido: -30000, total: 0, orfao: false });
  linhas.push({ centro: 'EMPILHADEIRAS', direto: 20000, percentual: 0, recebe: false,
    rateio: 0, distribuido: -20000, total: 0, orfao: false });
  const a = { competencia: '2026-10', linhas: linhas, orfaos: [], valorBase: base,
    somaPercentual: soma, origemPercentuais: '2026-10', proprio: true,
    aproximado: false, cacheHit: false };
  Object.keys(extras || {}).forEach(function (k) { a[k] = extras[k]; });
  return a;
}

console.log('\n1. O documento fecha com a apuração');
ctx.__apuracao = apuracao();
let h = ctx.htmlRateioPdf_('2026-10');
ok('o total geral é a soma dos diretos', h.indexOf('R$ 60.000,00') !== -1,
  '1000+2000+3000+4000+30000+20000 = 60.000');
ok('o valor rateado é a base inteira', h.indexOf('R$ 50.000,00') !== -1,
  'o que sai dos centros-base volta inteiro para os que recebem');
ok('o maior centro é o de maior TOTAL, não o primeiro da lista',
  /Maior centro<\/div><div class="val">Loja 03/.test(h),
  (h.match(/Maior centro<\/div><div class="val">[^<]*/) || [''])[0]);
ok('a soma das fatias dá 100%', h.indexOf('100,00%') !== -1);
ok('o distribuído aparece negativo', /R\$ -50\.000,00/.test(h), 'o total distribuído');
// Conta a CLASSE aplicada na linha, não a palavra solta: `tag-base` também
// aparece na folha de estilo, e contá-la lá dava 3 em vez de 2.
ok('cada centro-base é marcado como quem distribui',
  (h.match(/class="tag tag-base"/g) || []).length === 2,
  String((h.match(/class="tag tag-base"/g) || []).length));

console.log('\n1b. O número de cima é o TOTAL');
// Trocar o indicador principal do total para o valor redistribuído (ou o
// contrário) não quebrava nenhuma prova: elas conferiam que o número aparecia
// em ALGUM lugar do documento, não em qual. O indicador de cima é o que a
// pessoa lê primeiro e repete na reunião — ele tem contrato próprio.
function kpi(html, rotulo) {
  const re = new RegExp('<div class="rot">' + rotulo +
    '</div><div class="val">([^<]*)</div>(?:<div class="rot">([^<]*)</div>)?');
  const m = re.exec(html);
  return m ? { valor: m[1], sub: m[2] || '' } : null;
}
const principal = kpi(h, 'Custo total rateado');
ok('o indicador principal existe', !!principal, 'rótulos dos indicadores: ' +
  JSON.stringify((h.match(/<div class="rot">[^<]*<\/div><div class="val">/g) || [])));
ok('e mostra o TOTAL, não o valor redistribuído',
  principal && principal.valor === 'R$ 60.000,00',
  principal ? principal.valor : '(sem indicador)');
ok('o redistribuído vai na linha de baixo',
  principal && /sendo R\$ 50\.000,00 redistribuídos/.test(principal.sub),
  principal ? principal.sub : '');
ok('e NÃO como indicador separado, que repetiria o mesmo número',
  !kpi(h, 'Valor rateado'),
  'o que sai dos centros-base volta inteiro: dois indicadores mostrariam 60.000 duas vezes');

const centros = kpi(h, 'Centros que recebem');
ok('com todo o custo alocado, o indicador diz isso',
  centros && /todo o custo alocado/.test(centros.sub), centros ? centros.sub : '');

const media = kpi(h, 'Média por centro');
ok('a média é o total dividido pelos que recebem',
  media && media.valor === 'R$ 15.000,00', media ? media.valor : '');

// Centro que não recebe e tem custo: o dinheiro não chegou a loja nenhuma.
const comSobra = apuracao();
comSobra.linhas.push({ centro: 'ADM CENTRAL', direto: 5000, percentual: 0, recebe: false,
  rateio: 0, distribuido: 0, total: 5000, orfao: false });
ctx.__apuracao = comSobra;
const h2 = ctx.htmlRateioPdf_('2026-10');
const centros2 = kpi(h2, 'Centros que recebem');
ok('custo que ficou fora das lojas é dito no indicador',
  centros2 && /R\$ 5\.000,00 fora das lojas/.test(centros2.sub),
  centros2 ? centros2.sub : '');
ok('e a média desconta esse valor',
  (kpi(h2, 'Média por centro') || {}).valor === 'R$ 15.000,00',
  (kpi(h2, 'Média por centro') || {}).valor + ' — (65.000 - 5.000) / 4');
ctx.__apuracao = apuracao();
h = ctx.htmlRateioPdf_('2026-10');

console.log('\n2. Números em pt-BR, nunca com ponto decimal');
ok('vírgula decimal', /R\$ 60\.000,00/.test(h));
ok('ponto no milhar', !/R\$ 60000\.00/.test(h));
ok('percentual com vírgula', /40,00%/.test(h), 'o percentual da Loja 03');
ok('nada de NaN nem undefined', !/NaN|undefined/.test(h), h.slice(0, 200));

console.log('\n3. As ressalvas NÃO podem ficar de fora');
// Um PDF circula. Se a apuração tem condição e o papel não diz, quem lê
// decide sem saber.
// Desvio que IMPORTA é dito. 90% significa que um décimo do custo do depósito
// ficaria sem destino se não houvesse normalização.
ctx.__apuracao = apuracao({ somaPercentual: 0.9 });
h = ctx.htmlRateioPdf_('2026-10');
ok('percentual que não soma 100% é dito', /normaliza para 100%/.test(h), 'soma 90%');
ok('e diz quanto soma de verdade', /90,000%/.test(h));

// Ruído de arredondamento NÃO vira ressalva. Os percentuais herdados da
// planilha antiga somam 100,001%; avisar sobre isso todo mês ensinaria a
// pular o bloco de observações — e aí some junto o aviso que importa.
ctx.__apuracao = apuracao({ somaPercentual: 1.00001 });
h = ctx.htmlRateioPdf_('2026-10');
ok('ruído de 0,001% não vira ressalva', !/normaliza para 100%/.test(h),
  'ressalva por ruído ensina a ignorar ressalva');

ctx.__apuracao = apuracao({ proprio: false, origemPercentuais: '2026-09' });
h = ctx.htmlRateioPdf_('2026-10');
ok('percentual herdado é dito', /herdados da competência 2026-09/.test(h));

ctx.__apuracao = apuracao({ proprio: false, origemPercentuais: 'cadastro' });
h = ctx.htmlRateioPdf_('2026-10');
ok('percentual do cadastro é dito', /usou os do cadastro de centros/.test(h));

ctx.__apuracao = apuracao({ aproximado: true, cacheHit: true });
h = ctx.htmlRateioPdf_('2026-10');
ok('competência encerrada é dita', /Competência encerrada/.test(h));
ok('e diz que veio do cache', /lida do cache/.test(h));

ctx.__apuracao = apuracao({ aproximado: true, cacheHit: false });
h = ctx.htmlRateioPdf_('2026-10');
ok('ou que foi recalculada', /recalculada a partir dos lançamentos/.test(h));

const comOrfao = apuracao();
comOrfao.linhas.push({ centro: 'SEM CADASTRO', direto: 500, percentual: 0, recebe: false,
  rateio: 0, distribuido: 0, total: 500, orfao: true });
comOrfao.orfaos = ['SEM CADASTRO'];
ctx.__apuracao = comOrfao;
h = ctx.htmlRateioPdf_('2026-10');
ok('centro órfão é dito', /não estão cadastrados.*SEM CADASTRO/.test(h));
ok('e marcado na linha', /class="orfao"/.test(h));

console.log('\n4. Apuração limpa não inventa ressalva');
ctx.__apuracao = apuracao();
h = ctx.htmlRateioPdf_('2026-10');
ok('sem ressalva, o bloco nem aparece', h.indexOf('OBSERVAÇÕES') === -1 &&
  h.indexOf('Observações desta apuração') === -1,
  'um bloco vazio ensina a ignorar o bloco');

console.log('\n5. Rastreabilidade do documento');
ok('traz a competência', /2026-10/.test(h));
ok('e o período por extenso', /26\/09\/2026 a 25\/10\/2026/.test(h));
ok('e a base do rateio', /DEPÓSITO, EMPILHADEIRAS/.test(h));
ok('e quem gerou', /fulano@giassi\.com\.br/.test(h));
ok('e quando', /29\/10\/2026 09:14/.test(h));
ok('e a versão do sistema', h.indexOf('v' + ctx.VERSAO_SISTEMA) !== -1, ctx.VERSAO_SISTEMA);
ok('e o nome da empresa', /GIASSI &amp; CIA\. LTDA\./.test(h), 'com o & escapado');

console.log('\n6. Texto da planilha não vira HTML');
// Nome de centro é digitado por gente. Um "<" solto quebraria o documento,
// e um "<script>" seria pior que quebrar.
const perigoso = apuracao();
perigoso.linhas[0].centro = '<script>alert(1)</script> & "Loja"';
ctx.__apuracao = perigoso;
h = ctx.htmlRateioPdf_('2026-10');
ok('a tag é escapada', h.indexOf('<script>alert(1)</script>') === -1, 'injeção no PDF');
ok('e aparece como texto', /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(h));
ok('o & vira entidade', /&amp; &quot;Loja&quot;/.test(h));
ok('escHtml_ cobre os cinco caracteres',
  ctx.escHtml_('<>&"\'') === '&lt;&gt;&amp;&quot;&#39;', ctx.escHtml_('<>&"\''));
ok('e aceita nulo sem quebrar', ctx.escHtml_(null) === '' && ctx.escHtml_(undefined) === '');

console.log('\n7. Cantos');
ctx.__apuracao = { competencia: '2026-10', linhas: [], orfaos: [], valorBase: 0,
  somaPercentual: 0, origemPercentuais: '2026-10', proprio: true,
  aproximado: false, cacheHit: false };
let erroVazio = '';
try { h = ctx.htmlRateioPdf_('2026-10'); } catch (e) { erroVazio = e.message; }
ok('competência sem nenhum centro não quebra', erroVazio === '', erroVazio);
ok('e o maior centro vira travessão', /Maior centro<\/div><div class="val">—/.test(h), h.slice(0, 100));
ok('sem divisão por zero', !/NaN|Infinity/.test(h));
// Quem de fato impede o NaN de chegar ao papel é `numBR_`: ele faz
// `Number(valor || 0)`, e NaN é falsy. A guarda `totalGeral > 0` é reforço.
// Como é o numBR_ que segura, é ele que está sendo provado.
ok('numBR_ transforma NaN em zero, e é isso que segura o PDF',
  ctx.numBR_(NaN, 1) === '0,0', ctx.numBR_(NaN, 1));
ok('e Infinity também', ctx.numBR_(1 / 0, 2) === '0,00' || !/Infinity/.test(ctx.numBR_(1 / 0, 2)),
  ctx.numBR_(1 / 0, 2));

console.log('\n8. O PDF é montado, não é foto da aba');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ok('htmlRateioPdf_ monta o documento', /function htmlRateioPdf_\(mesRef\)/.test(fonte));
ok('e a conversão é HTML → PDF', /newBlob\(html, MimeType\.HTML, nome\)\.getAs\(MimeType\.PDF\)/.test(fonte));
ok('a exportação por foto da aba continua existindo, para as outras abas',
  /function exportarAbaComoPdf_\(nomeAba\)/.test(fonte),
  'são coisas diferentes e as duas têm uso');
ok('o PDF usa numBR_, nunca toFixed',
  !/function brlPdf_[\s\S]{0,200}toFixed/.test(fonte),
  'ponto decimal se lê como milhar em pt-BR');
const app = fs.readFileSync('App.html', 'utf8');
ok('a tela chama webRateioPdf', app.indexOf('.webRateioPdf(TOKEN') !== -1);
ok('e manda a competência que está na tela', /webRateioPdf\(TOKEN, mes\)/.test(app));
ok('com vigia de tempo, como os outros botões longos', /comVigia\(botao, 'Gerando…'/.test(app));

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
