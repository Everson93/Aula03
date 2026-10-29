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
  Object.assign(globalThis, { htmlRateioPdf_, escHtml_, brlPdf_, numBR_, VERSAO_SISTEMA,
    compararCentroNatural_ });
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
ok('não há mais indicador de maior centro', h.indexOf('Maior centro') === -1);
// V4.22.4: a tabela passou a sair em ordem NUMÉRICA de centro. É assim que
// alguém procura uma loja num papel; por valor serve para a tela.
ok('a tabela sai em ordem numérica de loja',
  corpoTabela(h).indexOf('Loja 01') < corpoTabela(h).indexOf('Loja 02') &&
  corpoTabela(h).indexOf('Loja 02') < corpoTabela(h).indexOf('Loja 03'),
  (corpoTabela(h).match(/Loja \d+/g) || []).join(' '));
ok('e NÃO por valor', corpoTabela(h).indexOf('Loja 01') < corpoTabela(h).indexOf('Loja 03'),
  'Loja 03 é a de maior total, e mesmo assim vem depois da 01');
ok('a soma das fatias dá 100%', h.indexOf('100,00%') !== -1);
// V4.22.2: a tabela passou a listar SÓ quem recebe rateio. Os centros-base
// ficam com total zero depois de distribuir, e linha de zeros no meio da
// lista é ruído. A coluna "Distribuído" saiu junto: para loja era sempre
// travessão.
// Só o CORPO da tabela: o cabeçalho cita a base do rateio de propósito
// ("base do rateio: DEPÓSITO, EMPILHADEIRAS"), e procurar o nome no documento
// inteiro reprovava por causa dele.
function corpoTabela(html) {
  const m = /<tbody>([\s\S]*?)<\/tbody>/.exec(html);
  return m ? m[1] : '';
}
ok('os centros-base NÃO aparecem nas linhas da tabela',
  corpoTabela(h).indexOf('DEPÓSITO') === -1 &&
  corpoTabela(h).indexOf('EMPILHADEIRAS') === -1,
  corpoTabela(h).slice(0, 160));
ok('mas o cabeçalho continua dizendo qual é a base',
  /base do rateio: DEPÓSITO, EMPILHADEIRAS/.test(h),
  'quem lê precisa saber de onde veio o rateio');
ok('a coluna Distribuído saiu', h.indexOf('>Distribuído<') === -1);
ok('e o total da tabela é o das lojas', /TOTAL<\/td>[\s\S]{0,400}R\$ 60\.000,00/.test(h),
  'sem centro fora, o total das lojas é o total da frota');

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
const principal = kpi(h, 'Custo total da frota');
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

ok('não há mais indicador de centros que recebem',
  !kpi(h, 'Centros que recebem'),
  'a contagem está na própria tabela');

ok('não há mais indicador de média', !kpi(h, 'Média por centro'),
  'num rateio por percentual a média não diz nada que o percentual já não diga');
ok('sobrou UM indicador, o do custo total',
  (h.match(/<div class="rot">[^<]*<\/div><div class="val">/g) || []).length === 1,
  (h.match(/<div class="rot">([^<]*)<\/div><div class="val">/g) || []).join(' | '));

// Centro que não recebe e tem custo: o dinheiro não chegou a loja nenhuma.
const comSobra = apuracao();
comSobra.linhas.push({ centro: 'ADM CENTRAL', direto: 5000, percentual: 0, recebe: false,
  rateio: 0, distribuido: 0, total: 5000, orfao: false });
ctx.__apuracao = comSobra;
const h2 = ctx.htmlRateioPdf_('2026-10');
// Com o indicador de centros fora, a linha abaixo da tabela passou a ser o
// ÚNICO lugar que diz quanto ficou fora das lojas. Ela vale ainda mais.
//
// E é aqui que dá para provar que o indicador mostra o total da FROTA: na
// fixture sem sobra ele coincide com o total das lojas, e trocar um pelo
// outro passava despercebido.
ok('o indicador mostra o total da frota, não o das lojas',
  (kpi(h2, 'Custo total da frota') || {}).valor === 'R$ 65.000,00',
  (kpi(h2, 'Custo total da frota') || {}).valor + ' — 60.000 das lojas + 5.000 fora');
ok('e o rótulo é "da frota", não "rateado": parte não foi rateada',
  h2.indexOf('Custo total rateado') === -1);
// O dinheiro fora da lista NÃO pode sumir: sem esta linha o PDF fecharia num
// número diferente do Resumo e ninguém saberia por quê.
ok('o custo fora das lojas é dito abaixo da tabela',
  /class="fora"[\s\S]{0,300}R\$ 5\.000,00/.test(h2), 'faltou a linha de conferência');
ok('com o total da frota ao lado, para fechar com o Resumo',
  /class="fora"[\s\S]{0,400}R\$ 65\.000,00/.test(h2), '60.000 das lojas + 5.000 fora');
ok('e o centro que não recebe fica fora da tabela',
  !/ADM CENTRAL<\/td>/.test(h2) && !/>ADM CENTRAL</.test(h2.split('class="fora"')[0]),
  'ele é citado na linha de conferência, não na lista');

// Com dinheiro fora, "total das lojas" e "total da frota" deixam de ser o
// mesmo número — e é só aí que dá para provar qual dos dois a tabela usa.
// Na fixture sem sobra os dois coincidem, e trocar um pelo outro passava.
// Escopado na PRÓPRIA linha de total: a versão anterior olhava 400
// caracteres à frente e pegava junto o R$ 65.000,00 da linha de conferência,
// que vem logo depois da tabela. Reprovava por vizinhança, não por defeito.
function linhaTotal(html) {
  const m = /<tr class="total">([\s\S]*?)<\/tr>/.exec(html);
  return m ? m[1] : '';
}
ok('o TOTAL da tabela é o das lojas, não o da frota',
  linhaTotal(h2).indexOf('R$ 60.000,00') !== -1 &&
  linhaTotal(h2).indexOf('R$ 65.000,00') === -1,
  linhaTotal(h2).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
// A maior loja tem 23.000 de 60.000 = 38,33%. Sobre 65.000 daria 35,38%.
ok('a fatia da maior loja é sobre o total das lojas',
  /38,33%/.test(h2) && !/35,38%/.test(h2),
  (h2.match(/>[0-9]+,[0-9]{2}%</g) || []).join(' '));
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
ok('centro órfão é dito nas observações', /não estão cadastrados.*SEM CADASTRO/.test(h));
ok('e o valor dele aparece na linha de conferência',
  /class="fora"[\s\S]{0,300}R\$ 500,00/.test(h),
  'órfão não recebe rateio, então sai da tabela — mas o custo dele não some');

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
ok('e o indicador do total mostra zero, sem quebrar',
  (kpi(h, 'Custo total da frota') || {}).valor === 'R$ 0,00',
  (kpi(h, 'Custo total da frota') || {}).valor);
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

console.log('\n9. Ordem numérica, não alfabética');
// "Loja 10" vem depois de "Loja 2" para uma pessoa e ANTES para a comparação
// alfabética, que olha caractere a caractere: '1' < '2'. Com os nomes zerados
// à esquerda o alfabético até acerta — mas basta UM centro cadastrado sem o
// zero para a lista sair fora de ordem, e ninguém desconfia de uma lista: só
// procura e não acha.
const C = ctx.compararCentroNatural_;
ok('Loja 2 vem antes de Loja 10', C('Loja 2', 'Loja 10') < 0, String(C('Loja 2', 'Loja 10')));
ok('e Loja 10 depois de Loja 9', C('Loja 10', 'Loja 9') > 0);
ok('com zero à esquerda também funciona', C('Loja 02', 'Loja 10') < 0);
ok('zero à esquerda e sem zero são o mesmo número',
  C('Loja 02', 'Loja 2') === 0, String(C('Loja 02', 'Loja 2')));
ok('nome igual dá zero', C('DEPÓSITO', 'DEPÓSITO') === 0);
ok('nomes sem número caem no alfabético',
  C('ADM Central', 'Depósito') < 0, String(C('ADM Central', 'Depósito')));
ok('maiúscula e minúscula não mudam a ordem',
  C('loja 5', 'LOJA 5') === 0, String(C('loja 5', 'LOJA 5')));
ok('nome mais curto vem antes do mais longo que começa igual',
  C('Loja', 'Loja 1') < 0, String(C('Loja', 'Loja 1')));
ok('nulo não quebra', C(null, 'Loja 1') < 0 && C(undefined, undefined) === 0);
ok('número de dois trechos é comparado trecho a trecho',
  C('CD 2 Loja 10', 'CD 2 Loja 9') > 0 && C('CD 1 Loja 99', 'CD 2 Loja 1') < 0);

// A prova que importa: uma lista fora de padrão sai em ordem.
const misto = apuracao();
misto.linhas = [
  { centro: 'Loja 10', direto: 100, percentual: 0.25, recebe: true, rateio: 100, distribuido: 0, total: 200, orfao: false },
  { centro: 'Loja 2',  direto: 900, percentual: 0.25, recebe: true, rateio: 100, distribuido: 0, total: 1000, orfao: false },
  { centro: 'Loja 09', direto: 100, percentual: 0.25, recebe: true, rateio: 100, distribuido: 0, total: 200, orfao: false },
  { centro: 'Loja 1',  direto: 100, percentual: 0.25, recebe: true, rateio: 100, distribuido: 0, total: 200, orfao: false },
];
ctx.__apuracao = misto;
const hm = ctx.htmlRateioPdf_('2026-10');
const ordem = (corpoTabela(hm).match(/Loja \d+/g) || []);
ok('mistura de "Loja 2" e "Loja 09" sai na ordem certa',
  ordem.join(',') === 'Loja 1,Loja 2,Loja 09,Loja 10', ordem.join(','));
ok('e a de maior valor não vai para o topo só por isso',
  ordem[1] === 'Loja 2', 'Loja 2 tem o maior total e está em segundo, pelo número');
ctx.__apuracao = apuracao();

console.log('\n' + (falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas'));
process.exit(falhas ? 1 : 0);
