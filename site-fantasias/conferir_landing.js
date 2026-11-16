/* Provas da landing: lógica pura + coerência entre dados, config e página.
 * Uso: node conferir_landing.js   (sai com código 1 se alguma prova falhar) */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const L = require('./logica.js');

let ok = 0, falhas = 0;
function prova(nome, cond, detalhe) {
  if (cond) { ok++; return; }
  falhas++;
  console.log('FALHA: ' + nome + (detalhe !== undefined ? ' — ' + JSON.stringify(detalhe) : ''));
}

// Carrega config.js e dados.js como o navegador faria.
const janela = {};
const ctx = vm.createContext({ window: janela });
for (const f of ['config.js', 'dados.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}
const C = janela.CONFIG, FANTASIAS = janela.FANTASIAS, TEMAS = janela.TEMAS;

/* ---------- formatação pt-BR ---------- */
const nb = s => s.replace(/\s/g, ' '); // Intl usa espaço não separável
prova('preço com vírgula decimal', nb(L.formatarPreco(1234.5)) === 'R$ 1.234,50', L.formatarPreco(1234.5));
prova('preço inteiro', nb(L.formatarPreco(80)) === 'R$ 80,00');
prova('dataBR', L.dataBR('2027-02-13') === '13/02/2027');
prova('dataBR vazia', L.dataBR('') === '' && L.dataBR(undefined) === '');
prova('diasEntre atravessa mês', L.diasEntre('2027-01-30', '2027-02-02') === 3);
prova('diasEntre negativo', L.diasEntre('2027-02-02', '2027-01-30') === -3);
prova('diasEntre inválido', L.diasEntre('', '2027-01-01') === null);

/* ---------- sugestão de tamanho ---------- */
const todos = ['PP', 'P', 'M', 'G', 'GG', 'XG'];
prova('baixa e leve = PP', L.sugerirTamanho(150, 45, todos).tamanho === 'PP');
prova('altura manda quando é maior', L.sugerirTamanho(178, 55, todos).tamanho === 'G');
prova('peso manda quando é maior', L.sugerirTamanho(160, 80, todos).tamanho === 'G');
prova('limite incluso (165 / 60 = P)', L.sugerirTamanho(165, 60, todos).tamanho === 'P');
prova('sem dados = null', L.sugerirTamanho('', 70, todos) === null);
let r = L.sugerirTamanho(168, 70, ['P', 'G', 'GG']);
prova('sem o ideal, sobe para o próximo', r.tamanho === 'G' && r.ideal === 'M' && r.exato === false, r);
r = L.sugerirTamanho(185, 95, ['P', 'M']);
prova('nunca sugere menor que o ideal', r.tamanho === null && r.ideal === 'GG', r);
r = L.sugerirTamanho(150, 45, ['G', 'M']);
prova('lista fora de ordem: sobe para o menor maior', r.tamanho === 'M', r);

/* ---------- filtro ---------- */
const amostra = [
  { id: 'a', nome: 'Bruxa Clássica', descricao: 'vestido', temas: ['halloween'], genero: 'feminino', preco: 140, tamanhos: { P: [], M: [] }, palavras: ['feiticeira'] },
  { id: 'b', nome: 'Pierrô', descricao: 'bata', temas: ['carnaval'], genero: 'unissex', preco: 110, tamanhos: { G: [] }, palavras: [] },
  { id: 'c', nome: 'Vampiro', descricao: 'capa', temas: ['halloween'], genero: 'masculino', preco: 150, tamanhos: { M: [] }, palavras: [] }
];
const ids = l => l.map(x => x.id).join(',');
prova('sem filtro devolve tudo', ids(L.filtrar(amostra, {})) === 'a,b,c');
prova('tema', ids(L.filtrar(amostra, { tema: 'halloween' })) === 'a,c');
prova('gênero inclui unissex', ids(L.filtrar(amostra, { genero: 'masculino' })) === 'b,c');
prova('preço máximo', ids(L.filtrar(amostra, { precoMax: '140' })) === 'a,b');
prova('tamanho', ids(L.filtrar(amostra, { tamanho: 'M' })) === 'a,c');
prova('texto sem acento acha com acento', ids(L.filtrar(amostra, { texto: 'pierro' })) === 'b');
prova('acento no meio da palavra (Múmia por mumia)', L.filtrar([{ id: 'm', nome: 'Múmia', descricao: '', temas: [], genero: 'unissex', preco: 1, tamanhos: {} }], { texto: 'mumia' }).length === 1);
prova('texto acha palavra-chave', ids(L.filtrar(amostra, { texto: 'Feiticeira' })) === 'a');
prova('texto com duas palavras exige as duas', ids(L.filtrar(amostra, { texto: 'bruxa capa' })) === '');

/* ---------- orçamento ---------- */
const fan = { preco: 140, caucao: 100, kit: [{ id: 'x', nome: 'X', preco: 15 }, { id: 'y', nome: 'Y', preco: 22.9 }] };
let o = L.calcularOrcamento(fan, ['x', 'y'], 30);
prova('total soma kit marcado', o.total === 177.9, o);
prova('sinal 30%', o.sinal === 53.37, o);
prova('sinal + saldo = total', Math.round((o.sinal + o.saldo) * 100) === Math.round(o.total * 100), o);
prova('caução fora do total', o.caucao === 100 && o.total === 177.9);
o = L.calcularOrcamento(fan, [], 40);
prova('sem kit', o.total === 140 && o.kit === 0 && o.sinal === 56, o);
prova('sinal abaixo de 30% sobe para 30', L.calcularOrcamento(fan, [], 10).percentualSinal === 30);
prova('sinal acima de 50% desce para 50', L.calcularOrcamento(fan, [], 80).percentualSinal === 50);
prova('kit inexistente ignorado', L.calcularOrcamento(fan, ['zzz'], 30).total === 140);
o = L.calcularOrcamento({ preco: 0.14, caucao: 0, kit: [{ id: 'k', nome: 'k', preco: 0.01 }] }, ['k'], 50);
prova('centavos sem erro de ponto flutuante (0,14 + 0,01 dá 0,15000000000000002 sem centavos)', o.total === 0.15, o);

/* ---------- mensagem do WhatsApp ---------- */
const msg = L.mensagemReserva({
  nomeSite: 'Site', tamanho: 'M', dataFesta: '2027-02-13',
  fantasia: { id: 'HW01', nome: 'Bruxa' },
  orcamento: L.calcularOrcamento(fan, ['x'], 30)
});
prova('mensagem traz código', msg.includes('cód. HW01'));
prova('mensagem traz data em pt-BR', msg.includes('13/02/2027'));
prova('mensagem traz tamanho', msg.includes('Tamanho: M'));
prova('mensagem traz kit', msg.includes('Kit: X'));
prova('mensagem traz total pt-BR', nb(msg).includes('R$ 155,00'), msg);
prova('mensagem sem ponto decimal em valor', !/\d\.\d{2}\b/.test(msg), msg);
const semData = L.mensagemReserva({ nomeSite: 'S', tamanho: '', dataFesta: '', fantasia: { id: 'A', nome: 'A' }, orcamento: L.calcularOrcamento(fan, [], 30) });
prova('mensagem sem data e sem tamanho', semData.includes('ainda não defini') && semData.includes('preciso de ajuda'));
prova('mensagem sem kit não tem linha de kit', !semData.includes('Kit:'));

prova('número válido celular', L.numeroWhatsAppValido('5591988887777'));
prova('número válido fixo', L.numeroWhatsAppValido('559132223333'));
prova('número sem 55 inválido', !L.numeroWhatsAppValido('91988887777'));
prova('número com máscara inválido', !L.numeroWhatsAppValido('+55 (91) 98888-7777'));
prova('número vazio inválido', !L.numeroWhatsAppValido(''));
const link = L.linkWhatsApp('5591988887777', 'Olá & tchau\nlinha');
prova('link codifica texto', link === 'https://wa.me/5591988887777?text=Ol%C3%A1%20%26%20tchau%0Alinha', link);

/* ---------- coerência dos dados ---------- */
const idsTemas = new Set(TEMAS.map(t => t.id));
const vistos = new Set();
const proibidos = /marvel|disney|batman|superman|homem[- ]aranha|spider|frozen|elsa|mulher[- ]maravilha|harry potter|jack sparrow|piratas do caribe|star wars|pokemon/i;
for (const f of FANTASIAS) {
  const q = 'fantasia ' + f.id;
  prova(q + ': id único', !vistos.has(f.id)); vistos.add(f.id);
  prova(q + ': id curto alfanumérico', /^\w{2,8}$/.test(f.id), f.id);
  prova(q + ': loja existe em config.js', !!C.lojas[f.loja], f.loja);
  prova(q + ': temas existem', f.temas.length > 0 && f.temas.every(t => idsTemas.has(t)), f.temas);
  prova(q + ': gênero válido', ['feminino', 'masculino', 'unissex'].includes(f.genero), f.genero);
  prova(q + ': valores positivos', f.preco > 0 && f.diaExtra > 0 && f.caucao >= 0);
  const tams = Object.keys(f.tamanhos);
  prova(q + ': tem tamanho', tams.length > 0);
  prova(q + ': tamanhos conhecidos', tams.every(t => L.ORDEM_TAMANHOS.includes(t)), tams);
  prova(q + ': 4 medidas por tamanho', tams.every(t => f.tamanhos[t].length === 4 && f.tamanhos[t].every(n => n > 0)));
  const kitIds = (f.kit || []).map(k => k.id);
  prova(q + ': kit com ids únicos', new Set(kitIds).size === kitIds.length);
  prova(q + ': kit com tipo válido', (f.kit || []).every(k => ['venda', 'aluguel'].includes(k.tipo) && k.preco > 0));
  prova(q + ': nome sem marca registrada', !proibidos.test(f.nome + ' ' + f.descricao + ' ' + (f.palavras || []).join(' ')), f.nome);
  prova(q + ': cor hexadecimal', /^#[0-9a-f]{6}$/i.test(f.cor), f.cor);
}
prova('vitrine entre 20 e 30 peças (meta da validação)', FANTASIAS.length >= 20 && FANTASIAS.length <= 30, FANTASIAS.length);
for (const t of TEMAS) prova('tema ' + t.id + ' tem ao menos uma peça', FANTASIAS.some(f => f.temas.includes(t.id)));
for (const k of Object.keys(C.lojas)) {
  const lj = C.lojas[k];
  prova('loja ' + k + ': sinal entre 30 e 50', lj.sinal >= 30 && lj.sinal <= 50, lj.sinal);
  prova('loja ' + k + ': política de cancelamento escrita', typeof lj.politicaCancelamento === 'string' && lj.politicaCancelamento.length > 20);
  prova('loja ' + k + ': whatsapp vazio ou válido', lj.whatsapp === '' || L.numeroWhatsAppValido(lj.whatsapp), lj.whatsapp);
}

/* ---------- contrato HTML <-> app.js ---------- */
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const idsHtml = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
// ids que o app.js cria dentro da ficha
const idsFicha = new Set([...app.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
const pedidos = new Set([...app.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]));
for (const id of pedidos) prova('app.js pede #' + id + ' e ele existe', idsHtml.has(id) || idsFicha.has(id), id);
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
prova('ordem dos scripts: config, dados, lógica, app', scripts.join(',') === 'config.js,dados.js,logica.js,app.js', scripts);
for (const s of scripts) prova('script ' + s + ' existe', fs.existsSync(path.join(__dirname, s)));
prova('app.js compila', (() => { try { new vm.Script(app); return true; } catch (e) { return false; } })());
prova('nenhum toFixed em app.js/logica.js', !/toFixed\(/.test(app + fs.readFileSync(path.join(__dirname, 'logica.js'), 'utf8')));

console.log((falhas ? 'REPROVADO' : 'OK') + ' — ' + ok + ' provas aprovadas, ' + falhas + ' falhas');
process.exit(falhas ? 1 : 0);
