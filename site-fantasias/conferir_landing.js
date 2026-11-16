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
for (const f of ['config.js', 'dados.js', 'agenda.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}
const C = janela.CONFIG, FANTASIAS = janela.FANTASIAS, TEMAS = janela.TEMAS, AGENDA = janela.AGENDA;

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

/* ---------- datas e período do aluguel ---------- */
prova('somarDias vira o ano', L.somarDias('2026-12-31', 1) === '2027-01-01');
prova('somarDias 29/02 em ano bissexto', L.somarDias('2028-02-28', 1) === '2028-02-29');
prova('somarDias negativo vira o mês', L.somarDias('2027-03-01', -1) === '2027-02-28');
prova('diaSemana: 06/02/2027 é sábado', L.diaSemana('2027-02-06') === 6);
prova('dataComDia', L.dataComDia('2027-02-05') === 'sex, 05/02/2027', L.dataComDia('2027-02-05'));
const lojaDom = { diasFechados: [0], margemHigienizacao: 1 };
let per = L.periodoAluguel('2027-02-03', '2026-11-16', 0, lojaDom); // quarta
prova('padrão: véspera a dia seguinte, 3 dias', per.retirada === '2027-02-02' && per.devolucao === '2027-02-04' && per.dias === 3 && !per.devolucaoAdiada, per);
per = L.periodoAluguel('2027-02-06', '2026-11-16', 0, lojaDom); // sábado: devolução cairia no domingo
prova('devolução no domingo passa para segunda', per.retirada === '2027-02-05' && per.devolucao === '2027-02-08' && per.devolucaoAdiada, per);
per = L.periodoAluguel('2027-02-08', '2026-11-16', 0, lojaDom); // segunda: retirada cairia no domingo
prova('retirada no domingo recua para sábado', per.retirada === '2027-02-06' && per.devolucao === '2027-02-09', per);
per = L.periodoAluguel('2027-02-03', '2026-11-16', 2, lojaDom);
prova('dias extras empurram a devolução', per.devolucao === '2027-02-06' && per.diasExtras === 2 && per.dias === 5, per);
per = L.periodoAluguel('2026-11-17', '2026-11-17', 0, lojaDom); // terça: a véspera (segunda) já passou e a loja abre nela
prova('festa hoje: retirada não vai para o passado', per.retirada === '2026-11-17' && per.devolucao === '2026-11-18', per);
per = L.periodoAluguel('2026-11-15', '2026-11-16', 0, lojaDom);
prova('festa que já passou não tem período', per === null);
prova('data inválida não tem período', L.periodoAluguel('', '2026-11-16', 0, lojaDom) === null);
per = L.periodoAluguel('2027-02-06', '2026-11-16', 0, {});
prova('loja sem dias fechados devolve no domingo', per.devolucao === '2027-02-07' && !per.devolucaoAdiada, per);

/* ---------- estoque por unidade ---------- */
const fe = { id: 'T1', loja: 'x', tamanhos: { M: [], G: [] }, estoque: { M: 2, G: 1 } };
prova('unidades numeradas', L.unidades(fe, 'M').join(',') === 'T1-M-1,T1-M-2');
const pFesta = L.periodoAluguel('2027-02-06', '2026-11-16', 0, lojaDom); // 05/02 a 08/02
const livres = (ag, perX, m) => { const d = L.disponibilidade(fe, ag, perX, m); return d.M.livres.join(',') + '|' + d.G.livres.join(','); };
prova('sem reservas: tudo livre', livres([], pFesta, 1) === 'T1-M-1,T1-M-2|T1-G-1');
prova('sem data: todas as peças contam', livres([{ unidade: 'T1-G-1', retirada: '2027-02-05', devolucao: '2027-02-08' }], null, 1) === 'T1-M-1,T1-M-2|T1-G-1');
prova('reserva no mesmo período ocupa a peça', livres([{ unidade: 'T1-G-1', retirada: '2027-02-05', devolucao: '2027-02-08' }], pFesta, 1) === 'T1-M-1,T1-M-2|');
prova('higienização: devolução em 04/02 + 1 dia bloqueia retirada em 05/02',
  livres([{ unidade: 'T1-M-1', retirada: '2027-02-02', devolucao: '2027-02-04' }], pFesta, 1) === 'T1-M-2|T1-G-1');
prova('sem margem, devolução em 04/02 libera retirada em 05/02',
  livres([{ unidade: 'T1-M-1', retirada: '2027-02-02', devolucao: '2027-02-04' }], pFesta, 0) === 'T1-M-1,T1-M-2|T1-G-1');
prova('margem da reserva NOVA também conta (retirada alheia no dia seguinte à devolução)',
  livres([{ unidade: 'T1-M-1', retirada: '2027-02-09', devolucao: '2027-02-11' }], pFesta, 1) === 'T1-M-2|T1-G-1');
prova('reserva dois dias depois da margem não atrapalha',
  livres([{ unidade: 'T1-M-1', retirada: '2027-02-10', devolucao: '2027-02-12' }], pFesta, 1) === 'T1-M-1,T1-M-2|T1-G-1');
prova('duas reservas em sequência na mesma peça ocupam UMA peça, não duas',
  livres([{ unidade: 'T1-M-1', retirada: '2027-02-02', devolucao: '2027-02-05' },
          { unidade: 'T1-M-1', retirada: '2027-02-07', devolucao: '2027-02-09' }], pFesta, 1) === 'T1-M-2|T1-G-1');
prova('tamanhosLivres', L.tamanhosLivres(L.disponibilidade(fe, [{ unidade: 'T1-G-1', retirada: '2027-02-05', devolucao: '2027-02-08' }], pFesta, 1)).join() === 'M');
const agCheia = [{ unidade: 'T1-G-1', retirada: '2027-02-05', devolucao: '2027-02-08' }];
prova('próxima data livre pula a margem', L.proximaDataLivre(fe, agCheia, '2027-02-06', '2026-11-16', lojaDom, 'G') === '2027-02-11',
  L.proximaDataLivre(fe, agCheia, '2027-02-06', '2026-11-16', lojaDom, 'G'));
prova('próxima data livre sem tamanho: qualquer um', L.proximaDataLivre(fe, agCheia, '2027-02-06', '2026-11-16', lojaDom, null) === '2027-02-07');
prova('validarAgenda acha cruzamento', L.validarAgenda([fe], [
  { fantasia: 'T1', tamanho: 'G', unidade: 'T1-G-1', retirada: '2027-02-05', devolucao: '2027-02-08' },
  { fantasia: 'T1', tamanho: 'G', unidade: 'T1-G-1', retirada: '2027-02-09', devolucao: '2027-02-10' }], { x: lojaDom }).length === 1);
prova('validarAgenda acha unidade inexistente', L.validarAgenda([fe], [
  { fantasia: 'T1', tamanho: 'G', unidade: 'T1-G-2', retirada: '2027-02-05', devolucao: '2027-02-08' }], { x: lojaDom }).length === 1);
prova('validarAgenda aceita sequência com folga', L.validarAgenda([fe], [
  { fantasia: 'T1', tamanho: 'G', unidade: 'T1-G-1', retirada: '2027-02-05', devolucao: '2027-02-08' },
  { fantasia: 'T1', tamanho: 'G', unidade: 'T1-G-1', retirada: '2027-02-10', devolucao: '2027-02-12' }], { x: lojaDom }).length === 0);

/* ---------- orçamento e mensagem com período ---------- */
const fx = { id: 'Z', nome: 'Z', preco: 140, diaExtra: 35, caucao: 100, kit: [] };
o = L.calcularOrcamento(fx, [], 30, 2);
prova('dias extras somam no aluguel', o.aluguel === 210 && o.valorDiasExtras === 70 && o.total === 210 && o.diasExtras === 2, o);
prova('sem dias extras, aluguel é o preço', L.calcularOrcamento(fx, [], 30).aluguel === 140);
const perMsg = L.periodoAluguel('2027-02-06', '2026-11-16', 1, lojaDom);
const msgPer = L.mensagemReserva({ nomeSite: 'S', tamanho: 'M', dataFesta: '2027-02-06', periodo: perMsg, fantasia: fx, orcamento: L.calcularOrcamento(fx, [], 30, 1) });
prova('mensagem traz retirada', msgPer.includes('Retirada: sex, 05/02/2027'), msgPer);
prova('mensagem traz devolução e dia extra', msgPer.includes('Devolução: seg, 08/02/2027 (1 dia extra)'), msgPer);
const msgEsg = L.mensagemReserva({ nomeSite: 'S', tamanho: 'M', dataFesta: '2027-02-06', periodo: perMsg, fantasia: fx, orcamento: L.calcularOrcamento(fx, [], 30), indisponivel: true });
prova('mensagem de esgotada não pede reserva', msgEsg.includes('esgotada') && !msgEsg.includes('quero reservar'), msgEsg);

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
  const est = f.estoque || {};
  prova(q + ': estoque para cada tamanho, e só para eles', Object.keys(est).sort().join() === tams.slice().sort().join(), [tams, est]);
  prova(q + ': estoque inteiro positivo', Object.values(est).every(n => Number.isInteger(n) && n > 0), est);
}
prova('vitrine entre 20 e 30 peças (meta da validação)', FANTASIAS.length >= 20 && FANTASIAS.length <= 30, FANTASIAS.length);
for (const t of TEMAS) prova('tema ' + t.id + ' tem ao menos uma peça', FANTASIAS.some(f => f.temas.includes(t.id)));
for (const k of Object.keys(C.lojas)) {
  const lj = C.lojas[k];
  prova('loja ' + k + ': sinal entre 30 e 50', lj.sinal >= 30 && lj.sinal <= 50, lj.sinal);
  prova('loja ' + k + ': política de cancelamento escrita', typeof lj.politicaCancelamento === 'string' && lj.politicaCancelamento.length > 20);
  prova('loja ' + k + ': margem de higienização inteira (0 a 7)', Number.isInteger(lj.margemHigienizacao) && lj.margemHigienizacao >= 0 && lj.margemHigienizacao <= 7, lj.margemHigienizacao);
  prova('loja ' + k + ': dias fechados válidos e loja abre algum dia', Array.isArray(lj.diasFechados) && lj.diasFechados.every(d => Number.isInteger(d) && d >= 0 && d <= 6) && lj.diasFechados.length < 7, lj.diasFechados);
  prova('loja ' + k + ': whatsapp vazio ou válido', lj.whatsapp === '' || L.numeroWhatsAppValido(lj.whatsapp), lj.whatsapp);
}

/* ---------- marca ---------- */
const htmlMarca = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
prova('nome e ateliê configurados', C.nomeSite === 'Cantinho da Day' && C.atelie === 'Ateliê Néia Gonçalves');
prova('logo vazio ou arquivo existente', C.logo === '' || fs.existsSync(path.join(__dirname, C.logo)), C.logo);
prova('fontes da marca no <head>', /fonts\.googleapis\.com\/css2\?family=Dancing\+Script[^"]*Lobster[^"]*Nunito/.test(htmlMarca));
prova('todo [data-nome-site] do HTML vem com o nome certo', [...htmlMarca.matchAll(/data-nome-site>([^<]*)</g)].every(m => m[1] === C.nomeSite));
prova('sem lojas fictícias antigas no site', !/Lantejoula|Casa do Figurino|Baú das Fantasias|Fantasia na Data/.test(htmlMarca + fs.readFileSync(path.join(__dirname, 'dados.js'), 'utf8') + fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8')));
prova('festa junina é o primeiro tema', TEMAS[0].id === 'junina');
prova('acervo junino com ao menos 5 peças', FANTASIAS.filter(f => f.temas.includes('junina')).length >= 5);

/* ---------- agendas: a "constraint de exclusão" conferida estaticamente ---------- */
prova('agenda.js é lista', Array.isArray(AGENDA));
prova('agenda.js sem conflito', L.validarAgenda(FANTASIAS, AGENDA, C.lojas).length === 0, L.validarAgenda(FANTASIAS, AGENDA, C.lojas).slice(0, 3));
prova('agenda.js do site não tem reserva de exemplo', AGENDA.every(r => !r.simulada));
{
  const j2 = {};
  const c2 = vm.createContext({ window: j2 });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'simulacao', 'agenda_exemplo.js'), 'utf8'), c2);
  const ex = j2.AGENDA;
  const errosEx = L.validarAgenda(FANTASIAS, ex, C.lojas);
  prova('agenda de exemplo sem conflito', errosEx.length === 0, errosEx.slice(0, 3));
  prova('agenda de exemplo tem reservas', ex.length > 50, ex.length);
  // O cenário da simulação precisa ter de tudo no sábado de Carnaval: esgotada, parcial e livre.
  const situ = { esg: 0, parc: 0, livre: 0 };
  for (const f of FANTASIAS) {
    const lj = C.lojas[f.loja];
    const d = L.disponibilidade(f, ex, L.periodoAluguel('2027-02-06', '2026-11-16', 0, lj), lj.margemHigienizacao);
    const liv = L.tamanhosLivres(d).length, tot = Object.keys(d).length;
    situ[liv === 0 ? 'esg' : liv < tot ? 'parc' : 'livre']++;
  }
  prova('Carnaval de exemplo tem esgotadas, parciais e livres', situ.esg > 0 && situ.parc > 0 && situ.livre > 0, situ);
  // reproduzível: gerar de novo dá o mesmo arquivo
  const antes = fs.readFileSync(path.join(__dirname, 'simulacao', 'agenda_exemplo.js'), 'utf8');
  const g = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'simulacao', 'gerar_agenda.js')]);
  const depois = fs.readFileSync(path.join(__dirname, 'simulacao', 'agenda_exemplo.js'), 'utf8');
  prova('gerador da agenda é determinístico e está em dia com dados.js', g.status === 0 && antes === depois);
  if (antes !== depois) fs.writeFileSync(path.join(__dirname, 'simulacao', 'agenda_exemplo.js'), antes);
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
prova('ordem dos scripts: config, dados, agenda, lógica, app', scripts.join(',') === 'config.js,dados.js,agenda.js,logica.js,app.js', scripts);
for (const s of scripts) prova('script ' + s + ' existe', fs.existsSync(path.join(__dirname, s)));
prova('app.js compila', (() => { try { new vm.Script(app); return true; } catch (e) { return false; } })());
prova('nenhum toFixed em app.js/logica.js', !/toFixed\(/.test(app + fs.readFileSync(path.join(__dirname, 'logica.js'), 'utf8')));

/* ---------- simulação (artefato) ---------- */
const os = require('os');
const saidaSim = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sim-')), 'sim.html');
const montou = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'simulacao', 'montar.js'), saidaSim]);
prova('simulação monta', montou.status === 0, String(montou.stderr));
if (montou.status === 0) {
  const sim = fs.readFileSync(saidaSim, 'utf8');
  prova('simulação sem <html>/<head>/<body> próprios', !/<(html|head|body)[\s>]/i.test(sim));
  prova('simulação com <title> no início', /^<title>[^<]{3,60}<\/title>/.test(sim));
  const blocos = [...sim.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  prova('simulação com 7 scripts inline', blocos.length === 7, blocos.length);
  prova('simulação usa a agenda de exemplo, não a real', sim.includes('/* simulacao/agenda_exemplo.js */') && !sim.includes('/* agenda.js */'));
  blocos.forEach((b, i) => prova('script inline ' + i + ' compila', (() => { try { new vm.Script(b); return true; } catch (e) { return false; } })()));
  prova('simulação sem script externo', !/<script src=/.test(sim));
  const links = sim.match(/<link [^>]*>/g) || [];
  prova('simulação só carrega CSS do Google Fonts', links.every(l => /href="https:\/\/fonts\.(googleapis|gstatic)\.com/.test(l)), links);
  prova('simulação leva as fontes da marca', /family=Dancing\+Script[^"]*family=Lobster[^"]*family=Nunito/.test(sim));
  prova('antes.js vem antes do app.js', sim.indexOf('simulacao/antes.js') < sim.indexOf('/* app.js */'));
  for (const id of ['ficha', 'grade', 'busca-data']) prova('simulação mantém #' + id, sim.includes('id="' + id + '"'));
}

console.log((falhas ? 'REPROVADO' : 'OK') + ' — ' + ok + ' provas aprovadas, ' + falhas + ' falhas');
process.exit(falhas ? 1 : 0);
