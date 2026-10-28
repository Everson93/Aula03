/**
 * Guarda estatica contra laco quadratico.
 *
 * Le o proprio codigo-fonte e procura: (a) funcao que varre uma colecao de
 * base sendo chamada DENTRO de um laco, e (b) escrita de planilha dentro de
 * laco. Os dois sao a causa de quase toda lentidao neste projeto — e nenhum
 * aparece em teste de comportamento, porque o resultado continua certo, so
 * demora.
 *
 * A lista ACEITAS congela o que ja existe e foi avaliado. O valor da suite
 * esta em reprovar o que for NOVO: um laco quadratico escrito hoje custa
 * minutos para consertar e meses para descobrir.
 *
 * Para ver os numeros em vez do veredito:  node medir_modulos.js
 */
const fs = require("fs");
const src = fs.readFileSync("Codigo.gs", "utf8");
const linhas = src.split('\n');

const funcoes = {}; let atual = null;
linhas.forEach(function (l, i) {
  const m = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(l);
  if (m) { atual = { nome: m[1], ini: i, corpo: [] }; funcoes[m[1]] = atual; }
  if (atual) { atual.corpo.push(l); if (l === '}') { atual.fim = i; atual = null; } }
});
const nomes = Object.keys(funcoes);
const corpoDe = {}; nomes.forEach(function (n) { corpoDe[n] = funcoes[n].corpo.join('\n'); });

// Leitor cacheado por execucao: a 2a chamada em diante e de graca.
const CACHEADO = {};
nomes.forEach(function (n) {
  const c = corpoDe[n];
  if (/if\s*\(\s*[A-Z_0-9]*CACHE[A-Z_0-9]*\s*\)\s*return\s+[A-Z_0-9]*CACHE/.test(c) ||
      /if\s*\(\s*[A-Z_0-9]*_EXEC_[A-Z_0-9]*\s*\)\s*return/.test(c) ||
      // indice amarrado a identidade da fonte: so reconstroi quando a fonte muda
      /[A-Z_0-9]*_EXEC_[A-Z_0-9]*\.fonte\s*===/.test(c)) CACHEADO[n] = true;
});

// Varredor: percorre uma colecao inteira vinda de leitura de base.
const BASES = ['dadosVeiculosExecucao_','lerLancamentos_','lerResumo_','lerOdometro_',
  'dadosCentrosExecucao_','lerCargasBomba_','lerComprovantes_','lerRateioMensal_',
  'lerOrcamento_','dadosFornecedoresExecucao_'];
const ITERA = /\.(forEach|map|filter|some|every|reduce|find|findIndex|flatMap)\s*\(|\bfor\s*\(|\bwhile\s*\(/;
const VARREDOR = {};
nomes.forEach(function (n) {
  const c = corpoDe[n];
  const leBase = BASES.some(function (b) { return c.indexOf(b + '(') !== -1; });
  if (leBase && ITERA.test(c)) VARREDOR[n] = true;
});
// Sem propagacao transitiva: ela marcava ate numB R_ como varredor, e um
// relatorio cheio de falso positivo e um relatorio que ninguem le.

function spanLaco(corpo, i) {
  let nivel = 0, iniciou = false;
  for (let j = i; j < corpo.length; j++) {
    for (const ch of corpo[j]) { if (ch === '{') { nivel++; iniciou = true; } else if (ch === '}') nivel--; }
    if (iniciou && nivel <= 0) return j;
  }
  return -1;
}

const quadraticos = [], escritas = [];
const ABRE = /\.(forEach|map|filter|some|every|reduce|flatMap)\s*\(\s*function|\bfor\s*\(|\bwhile\s*\(/;
nomes.forEach(function (n) {
  const corpo = funcoes[n].corpo;
  for (let i = 0; i < corpo.length; i++) {
    if (!ABRE.test(corpo[i])) continue;
    const fim = spanLaco(corpo, i);
    if (fim <= i) continue;
    // A linha que ABRE o laço contém a expressão-fonte: `opcoesVeiculos_().forEach(`
    // é uma chamada só, não uma por volta. Começar o corpo depois dela.
    const cabeca = corpo[i];
    const posAbre = cabeca.indexOf('{');
    const dentro = [posAbre === -1 ? '' : cabeca.slice(posAbre)]
      .concat(corpo.slice(i + 1, fim + 1)).join('\n');

    // (a) escrita de planilha dentro de laco — o matador classico do Apps Script
    const esc = /\.(setValue|setValues|setNumberFormat|setBackground|setFontWeight|clearContent|setFormula)\s*\(/.exec(dentro);
    if (esc && /getRange\s*\(/.test(dentro)) {
      escritas.push({ onde: n, linha: funcoes[n].ini + i + 1, metodo: esc[1] });
    }
    // (b) varredor chamado dentro de laco
    let m; const re = /\b([a-z][A-Za-z0-9]*_?)\s*\(/g; const vistos = {};
    while ((m = re.exec(dentro))) {
      const f = m[1];
      if (f === n || vistos[f] || !funcoes[f]) continue;
      vistos[f] = true;
      if (VARREDOR[f] && !CACHEADO[f]) {
        quadraticos.push({ onde: n, linha: funcoes[n].ini + i + 1, chama: f });
      }
    }
  }
});


// ---------------------------------------------------------------- veredito
//
// Cada entrada foi olhada. O motivo de aceitar esta ao lado; quando deixar de
// valer, a entrada sai daqui e o conserto entra no codigo.
const ACEITAS = {
  'onEdit -> resolverVeiculo_':
    'colagem no Odômetro: limitado às linhas coladas, não à frota',
  'webTanques -> estadoTanque_':
    'laço sobre PRODUTOS_BOMBA (punhado de produtos), não sobre a frota',
  'alertasTanqueEPendencias_ -> estadoTanque_':
    'idem: um por produto da bomba',
  'corrigirLancamento_ -> recalcularAbastecimentosInternos_':
    'correção de abastecimento interno; roda sobre um lançamento por vez',
  'corrigirLancamento_ -> estadoTanque_':
    'idem',
  'finalizarCorrecaoBomba_ -> recalcularAbastecimentosInternos_':
    'idem',
  'finalizarCorrecaoBomba_ -> estadoTanque_':
    'idem',
  'excluirVeiculo_ -> excluirLancamento_':
    'CONHECIDO E NÃO RESOLVIDO: apaga um lançamento por vez, cada um com ' +
    'leitura e remoção de linha. Veículo com histórico longo demora. Está na ' +
    'lista do LEIA-ME junto com a suíte do fechamento.',
};

// Escrita de planilha dentro de laço: a maioria é montagem de aba, que só roda
// no "Instalar / atualizar sistema". Lentidão ali é aceitável; nas demais, não.
const ESCRITA_ACEITA = /^(montar|formatar|gravarParam_|gravarHistorico_|escreverCabecalhoRelatorio_|arquivarExcedenteLog_|corrigirCelulasComErroVeiculos_|atualizarResumoSemLock_|zerarSistema_|restaurarDadosDeBackupSemLock_|removerLinhaLancamento_|webExcluirCargaBomba|repararLancamentosDeslocados_|webCorrigirPendencia)/;

let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

console.log('\n1. Nenhuma varredura NOVA dentro de laço');
const novas = [];
quadraticos.forEach(function (a) {
  const chave = a.onde + ' -> ' + a.chama;
  if (!ACEITAS[chave]) novas.push(chave + '  (' + a.onde + ':' + a.linha + ')');
});
ok('nenhuma varredura de coleção dentro de laço fora da lista',
  novas.length === 0,
  novas.length ? ('NOVA(S):\n          ' + novas.join('\n          ') +
    '\n        Ou é laço quadrático e precisa de índice, ou é aceitável e entra em ACEITAS com o motivo.') : '');

console.log('\n2. A lista de aceitas não tem entrada morta');
const vivas = {};
quadraticos.forEach(function (a) { vivas[a.onde + ' -> ' + a.chama] = true; });
const mortas = Object.keys(ACEITAS).filter(function (k) { return !vivas[k]; });
ok('toda entrada aceita ainda existe no código', mortas.length === 0,
  mortas.length ? ('resolvida(s), pode(m) sair da lista:\n          ' + mortas.join('\n          ')) : '');

console.log('\n3. Nenhuma escrita NOVA de planilha dentro de laço');
const escritasNovas = escritas.filter(function (a) { return !ESCRITA_ACEITA.test(a.onde); })
  .map(function (a) { return a.onde + ':' + a.linha + ' ' + a.metodo + '()'; });
ok('escrita célula a célula só nas rotinas de montagem',
  escritasNovas.length === 0,
  escritasNovas.length ? ('NOVA(S):\n          ' + escritasNovas.join('\n          ') +
    '\n        Junte num setValues único; escrita por célula é o custo mais caro do Apps Script.') : '');

console.log('\n4. Os índices de execução continuam amarrados à fonte');
// Se alguém trocar a checagem de identidade por uma flag, o índice passa a
// responder com dados velhos — e nenhum teste de comportamento pega, porque
// dentro de UMA execução a resposta continua certa.
[['CLASSIF_MEMO_EXEC_', 'classificação de veículo'],
 ['IPVA_INDICE_EXEC_', 'IPVA por placa'],
 ['ODOMETRO_INDICE_EXEC_', 'odômetro por placa e dia']].forEach(function (par) {
  // Vale a forma afirmativa (X && X.fonte === f) e a negada
  // (!X || X.fonte !== f): as duas comparam a identidade da fonte.
  const re = new RegExp(par[0] + '\\.fonte\\s*[!=]==');
  ok(par[1] + ': invalida pela identidade da fonte', re.test(src),
    'sem a comparação de fonte, o índice responde com dados de antes da alteração');
});

console.log('\nFunções: ' + nomes.length + ' | varredores: ' + Object.keys(VARREDOR).length +
  ' | leitores cacheados: ' + Object.keys(CACHEADO).length);
console.log(falhas ? 'FALHOU: ' + falhas + ' de ' + provas : 'TUDO OK: ' + provas + ' provas');
process.exit(falhas ? 1 : 0);
