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

/* ---------- infantil ---------- */
prova('ordem: infantil antes do adulto', L.ordenarTamanhos(['M', '10', '2', 'PP']).join() === '2,10,PP,M');
prova('criança de 110 cm e 20 kg veste 6', L.sugerirTamanho(110, 20, ['2', '4', '6', '8']).tamanho === '6');
prova('criança alta e leve: vale a altura (130 cm, 25 kg → 10)', L.sugerirTamanho(130, 25, ['8', '10', '12']).tamanho === '10');
prova('criança sem o tamanho ideal sobe (ideal 4 → 6)', L.sugerirTamanho(100, 16, ['6', '8']).tamanho === '6' && !L.sugerirTamanho(100, 16, ['6', '8']).exato);
prova('peça adulta continua na tabela adulta', L.sugerirTamanho(165, 60, ['P', 'M']).tamanho === 'P');
prova('filtro por público', L.filtrar([{ id: 'a', nome: 'x', temas: [], genero: 'unissex', preco: 1, tamanhos: {}, publico: 'infantil' }, { id: 'b', nome: 'y', temas: [], genero: 'unissex', preco: 1, tamanhos: {} }], { publico: 'adulto' }).map(x => x.id).join() === 'b');

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

/* ---------- balcão: CPF, acerto, cancelamento, situação da peça ---------- */
prova('CPF válido', L.cpfValido('529.982.247-25') && L.cpfValido('52998224725'));
prova('CPF com dígito errado', !L.cpfValido('529.982.247-24'));
prova('CPF com segundo dígito errado', !L.cpfValido('529.982.247-15'));
prova('CPF repetido', !L.cpfValido('111.111.111-11'));
prova('CPF curto', !L.cpfValido('5299822472'));
prova('CPF com resto 10 vira 0', L.cpfValido('123.456.789-09'));
let ac = L.acertoDevolucao({ caucao: 100, danos: [], diasAtraso: 0, valorDiaAtraso: 35 });
prova('devolução sem problema devolve a caução toda', ac.devolver === 100 && ac.retido === 0 && ac.cobrar === 0, ac);
ac = L.acertoDevolucao({ caucao: 100, danos: [{ descricao: 'barra descosturada', valor: 25.5 }], diasAtraso: 1, valorDiaAtraso: 35 });
prova('dano + 1 dia de atraso saem da caução', ac.multa === 35 && ac.danos === 25.5 && ac.retido === 60.5 && ac.devolver === 39.5 && ac.cobrar === 0, ac);
ac = L.acertoDevolucao({ caucao: 60, danos: [{ valor: 40 }], diasAtraso: 2, valorDiaAtraso: 25 });
prova('o que passa da caução é cobrado à parte', ac.retido === 60 && ac.devolver === 0 && ac.cobrar === 30, ac);
prova('atraso negativo não vira crédito', L.acertoDevolucao({ caucao: 50, diasAtraso: -3, valorDiaAtraso: 20 }).devolver === 50);
prova('dano negativo ignorado', L.acertoDevolucao({ caucao: 50, danos: [{ valor: -10 }] }).devolver === 50);
prova('acerto em centavos', L.acertoDevolucao({ caucao: 0.15, danos: [{ valor: 0.14 }] }).devolver === 0.01);
let rb = L.reembolsoCancelamento(42, '2027-02-05', '2027-01-29');
prova('cancelar 7 dias antes devolve o sinal todo', rb.integral && rb.valor === 42, rb);
rb = L.reembolsoCancelamento(42, '2027-02-05', '2027-01-30');
prova('cancelar 6 dias antes segue a política da loja', !rb.integral && rb.valor === 0 && rb.diasAntes === 6, rb);
const rs = [
  { unidade: 'A-M-1', status: 'retirada', retirada: '2027-02-05', devolucao: '2027-02-08' },
  { unidade: 'A-M-2', status: 'concluida', retirada: '2027-02-01', devolucao: '2027-02-04', devolvidaEm: '2027-02-04' },
  { unidade: 'A-M-3', status: 'confirmada', retirada: '2027-02-05', devolucao: '2027-02-08' },
  { unidade: 'A-M-4', status: 'cancelada', retirada: '2027-02-05', devolucao: '2027-02-08' },
  { unidade: 'A-M-4', status: 'confirmada', retirada: '2027-02-12', devolucao: '2027-02-15' }
];
const sit = (u, dia) => L.situacaoUnidade(u, rs, dia, 1);
prova('peça com o cliente', sit('A-M-1', '2027-02-06').estado === 'com-cliente');
prova('peça atrasada', sit('A-M-1', '2027-02-10').estado === 'atrasada' && sit('A-M-1', '2027-02-10').diasAtraso === 2);
prova('no dia da devolução ainda não é atraso', sit('A-M-1', '2027-02-08').estado === 'com-cliente');
prova('higienização no dia seguinte à devolução', sit('A-M-2', '2027-02-05').estado === 'higienizacao' && sit('A-M-2', '2027-02-05').ate === '2027-02-05');
prova('livre depois da higienização', sit('A-M-2', '2027-02-06').estado === 'livre');
prova('sai hoje', sit('A-M-3', '2027-02-05').estado === 'sai-hoje');
prova('cancelada não ocupa e a próxima aparece', sit('A-M-4', '2027-02-05').estado === 'livre' && sit('A-M-4', '2027-02-05').proxima.retirada === '2027-02-12');

/* ---------- PDV: pagamentos e caixa ---------- */
prova('parcelas somam o total e a 1ª leva o resto', L.dividirParcelas(100, 3).join() === '33.34,33.33,33.33');
prova('parcela única', L.dividirParcelas(95, 1).join() === '95');
prova('máximo de parcelas respeita a mínima', L.maxParcelas(160, { parcelasMax: 6, parcelaMinima: 50 }) === 3);
prova('máximo de parcelas respeita o teto', L.maxParcelas(1000, { parcelasMax: 6, parcelaMinima: 50 }) === 6);
prova('valor pequeno: 1x', L.maxParcelas(30, { parcelasMax: 6, parcelaMinima: 50 }) === 1);
let tx = L.taxaEstimada(100, 'credito', 3, { creditoVista: 4.99, creditoParcelado: 6.99 });
prova('taxa do crédito parcelado', tx.taxa === 6.99 && tx.liquido === 93.01, tx);
prova('taxa do débito', L.taxaEstimada(100, 'debito', 1, { debito: 1.99 }).liquido === 98.01);
prova('dinheiro sem taxa', L.taxaEstimada(100, 'dinheiro', 1, { debito: 1.99 }).taxa === 0);
let vp = L.validarPagamentos(110, [{ forma: 'pix', valor: 60, confirmado: true }, { forma: 'dinheiro', valor: 50, entregue: 100 }]);
prova('pagamento misto Pix + dinheiro com troco', vp.ok && vp.troco === 50 && vp.falta === 0, vp);
vp = L.validarPagamentos(110, [{ forma: 'pix', valor: 60, confirmado: true }]);
prova('falta mostrada e não fecha', !vp.ok && vp.falta === 50 && !vp.erros.length, vp);
vp = L.validarPagamentos(110, [{ forma: 'pix', valor: 120, confirmado: true }]);
prova('Pix acima do total é recusado (troco só no dinheiro)', !vp.ok && vp.erros.some(e => /troco só sai do dinheiro/.test(e)), vp);
vp = L.validarPagamentos(110, [{ forma: 'debito', valor: 110 }]);
prova('cartão sem "aprovado" não fecha', !vp.ok && vp.erros.some(e => /aprovado/.test(e)), vp);
vp = L.validarPagamentos(110, [{ forma: 'dinheiro', valor: 110, entregue: 100 }]);
prova('dinheiro entregue menor que o valor', !vp.ok && vp.erros.some(e => /menos que o valor/.test(e)));
vp = L.validarPagamentos(160, [{ forma: 'credito', valor: 160, parcelas: 4, confirmado: true }], { parcelas: { parcelasMax: 6, parcelaMinima: 50 } });
prova('crédito em parcelas demais para o valor', !vp.ok && vp.erros.some(e => /no máximo 3x/.test(e)), vp);
vp = L.validarPagamentos(100, [{ forma: 'vale', valor: 40 }, { forma: 'pix', valor: 60, confirmado: true }], { valeDisponivel: 30 });
prova('vale maior que o crédito do cliente', !vp.ok && vp.erros.some(e => /crédito na loja/.test(e)), vp);
vp = L.validarPagamentos(100, [{ forma: 'vale', valor: 30 }, { forma: 'pix', valor: 70, confirmado: true }], { valeDisponivel: 30 });
prova('vale + Pix fecham', vp.ok, vp);
prova('pagamento em centavos', L.validarPagamentos(0.15, [{ forma: 'dinheiro', valor: 0.14 }, { forma: 'dinheiro', valor: 0.01 }]).ok);
const cx = L.esperadoCaixa({ fundo: 200, movimentos: [
  { tipo: 'entrada', forma: 'dinheiro', valor: 100 }, { tipo: 'saida', forma: 'dinheiro', valor: 15 },
  { tipo: 'entrada', forma: 'pix', valor: 60 }, { tipo: 'sangria', valor: 150 }, { tipo: 'suprimento', valor: 20 },
  { tipo: 'saida', forma: 'pix', valor: 10 } ] });
prova('esperado do caixa: dinheiro = fundo + entradas − troco − sangria + suprimento', cx.dinheiro === 155 && cx.pix === 50, cx);
const cf = L.conferirCaixa(cx, { dinheiro: 150, pix: 50 });
prova('conferência acha a diferença por forma', !cf.confere && cf.diferenca === -5 && cf.linhas.find(l => l.forma === 'dinheiro').diferenca === -5, cf);
prova('conferência que bate', L.conferirCaixa({ dinheiro: 10, pix: 0 }, { dinheiro: 10 }).confere);

/* ---------- cadastro de cliente (LGPD) ---------- */
prova('WhatsApp normalizado', L.normalizarWhatsApp('(91) 98888-7777') === '5591988887777' && L.normalizarWhatsApp('5591988887777') === '5591988887777');
prova('CPF mascarado na lista', L.mascararCpf('529.982.247-25') === '***.982.247-**');
const cli = { nome: 'Maria das Dores', cpf: '52998224725', whatsapp: '91 98888-7777', email: '',
  endereco: { cep: '66010-000', rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Belém' }, avisoPrivacidade: true };
prova('cadastro mínimo completo passa', L.validarCliente(cli).length === 0, L.validarCliente(cli));
prova('sem aviso de privacidade não cadastra', L.validarCliente(Object.assign({}, cli, { avisoPrivacidade: false })).some(e => /aviso de privacidade/.test(e)));
prova('e-mail é opcional mas validado', L.validarCliente(Object.assign({}, cli, { email: 'maria@' })).length === 1);
prova('endereço incompleto', L.validarCliente(Object.assign({}, cli, { endereco: { cep: '66010000' } })).some(e => /Endereço/.test(e)));
prova('somarAnos', L.somarAnos('2027-02-08', 5) === '2032-02-08' && L.somarAnos('2028-02-29', 1) === '2029-02-28');
let se = L.situacaoEliminacao([{ status: 'retirada', devolucao: '2027-02-08' }], '2027-02-07', 5);
prova('não apaga com locação em andamento', !se.pode && se.motivo === 'locacao');
se = L.situacaoEliminacao([{ status: 'concluida', devolucao: '2027-02-08', devolvidaEm: '2027-02-09' }], '2030-01-01', 5);
prova('guarda de 5 anos depois da última devolução', !se.pode && se.motivo === 'guarda' && se.ate === '2032-02-09', se);
se = L.situacaoEliminacao([{ status: 'concluida', devolucao: '2027-02-08', devolvidaEm: '2027-02-09' }], '2032-02-09', 5);
prova('depois da guarda pode apagar', se.pode);
prova('sem locação pode apagar', L.situacaoEliminacao([{ status: 'cancelada' }], '2027-01-01', 5).pode);
const an = L.anonimizarCliente(Object.assign({ id: 'C0007', rg: '123', credito: 20, marketing: { consentido: true } }, cli), '2032-03-01');
prova('anonimizar tira o que identifica', !an.cpf && !an.whatsapp && !an.endereco && !an.rg && an.nome === 'Cliente anonimizado C0007' && !an.marketing.consentido && an.anonimizado, an);

/* ---------- contrato preenchido ---------- */
{
  const Ct = require('./contrato.js');
  const jc = {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8'), vm.createContext({ window: jc }));
  const cfgC = jc.CONFIG;
  const fx = id => FANTASIAS.find(f => f.id === id);
  const pedidoC = {
    id: 'P0007', origem: 'balcao', retirada: '2027-02-05', devolucao: '2027-02-08', dataFesta: '2027-02-06', diasExtras: 1,
    itens: [{ fantasia: 'JN05', tamanho: 'M', unidade: 'JN05-M-2', preco: 95, diaExtra: 25, caucao: 60 },
            { fantasia: 'JN04', tamanho: 'G', unidade: 'JN04-G-1', preco: 120, diaExtra: 30, caucao: 90 }],
    complementos: [{ nome: 'Lápis para sardas', tipo: 'venda', preco: 8, qtd: 2 }],
    desconto: { valor: 10, motivo: 'casal de quadrilha' },
    valores: { aluguel: 215, extras: 55, complementos: 16, desconto: 10, total: 276, sinal: 82.8, caucao: 150 },
    pagamentos: [{ tipo: 'sinal', forma: 'pix', valor: 82.8, parcelas: 1 }, { tipo: 'saldo', forma: 'credito', valor: 193.2, parcelas: 2 }, { tipo: 'caucao', forma: 'dinheiro', valor: 150, parcelas: 1 }],
    vistorias: { retirada: { dia: '2027-02-05', fotos: { frente: 'x', costas: 'x', barra: 'x', detalhes: 'x' }, defeitos: ['Mancha'], obs: 'mancha pequena na barra' } }
  };
  const cliC = { nome: 'Maria <b>das</b> Dores', cpf: '52998224725', whatsapp: '5591988887777', rg: '', email: '',
    endereco: { cep: '66010000', rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Belém', uf: 'PA' }, marketing: { consentido: true } };
  const g = Ct.gerar({ pedido: pedidoC, cliente: cliC, fantasiaDe: fx, config: cfgC, hoje: '2027-02-05', operador: 'Néia' });
  const tx = g.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  prova('contrato: número do pedido', tx.includes('Contrato nº P0007'));
  prova('contrato: CPF completo formatado', tx.includes('529.982.247-25'));
  prova('contrato: nome do cliente escapado (sem HTML injetado)', g.html.includes('Maria &lt;b&gt;das&lt;/b&gt; Dores') && !g.html.includes('<b>das</b>'));
  prova('contrato: endereço com CEP formatado', tx.includes('CEP 66010-000'));
  prova('contrato: as duas peças com etiqueta e reposição', tx.includes('JN05-M-2') && tx.includes('JN04-G-1') && tx.includes(L.formatarPreco(fx('JN05').reposicao).replace(/\s/g, ' ')));
  prova('contrato: itens que acompanham', tx.includes(fx('JN05').inclui.join(', ')));
  prova('contrato: devolução com dia da semana e horário', tx.includes('seg, 08/02/2027, até 18h'));
  prova('contrato: atraso = soma do dia extra das peças (25 + 30)', tx.replace(/\s/g, ' ').includes('R$ 55,00 por dia'));
  prova('contrato: desconto com motivo', tx.includes('casal de quadrilha'));
  prova('contrato: formas e parcelas', tx.includes('Cartão de crédito 2x') && tx.includes('Pix'));
  prova('contrato: total e caução em pt-BR', tx.replace(/\s/g, ' ').includes('R$ 276,00') && tx.replace(/\s/g, ' ').includes('R$ 150,00'));
  prova('contrato: cláusulas 1 a 12 em ordem', [1,2,3,4,5,6,7,8,9,10,11,12].every((n, i, a) => i === 0 || g.html.indexOf('<h2>' + n + '.') > g.html.indexOf('<h2>' + a[i - 1] + '.')));
  prova('contrato: laudo com o defeito anotado e fotos marcadas', tx.includes('mancha pequena na barra') && tx.includes('☑ frente'));
  prova('contrato: devolução em branco antes da volta', tx.includes('Na devolução — data'));
  prova('contrato: data por extenso', tx.includes('5 de fevereiro de 2027'));
  prova('contrato: consentimento de marketing citado só se dado', tx.includes('aceitou, à parte') &&
    !Ct.gerar({ pedido: pedidoC, cliente: Object.assign({}, cliC, { marketing: { consentido: false } }), fantasiaDe: fx, config: cfgC, hoje: '2027-02-05' }).html.includes('aceitou, à parte'));
  prova('contrato: pendências quando falta CNPJ e endereço do ateliê', g.pendencias.includes('CNPJ/CPF do ateliê') && g.pendencias.includes('endereço do ateliê'));
  prova('contrato: sem undefined, NaN ou null', !/undefined|NaN|null/.test(tx), tx.match(/.{30}(undefined|NaN|null).{30}/));
  prova('contrato: nenhum valor com ponto decimal', !/\d\.\d{2}\b/.test(tx), tx.match(/.{20}\d\.\d{2}\b.{10}/));
  const dev = Object.assign({}, pedidoC, { vistorias: Object.assign({}, pedidoC.vistorias, { devolucao: { dia: '2027-02-10', fotos: { frente: 'y' }, defeitos: [] } }),
    danos: [{ descricao: 'botão arrancado', valor: 12 }], acerto: L.acertoDevolucao({ caucao: 150, danos: [{ valor: 12 }], diasAtraso: 2, valorDiaAtraso: 55 }) });
  const tx2 = Ct.gerar({ pedido: dev, cliente: cliC, fantasiaDe: fx, config: cfgC, hoje: '2027-02-10' }).html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  prova('contrato após a devolução: dano e acerto preenchidos', tx2.includes('botão arrancado') && tx2.replace(/\s/g, ' ').includes('R$ 28,00'), tx2.slice(-600));
  const cfgOk = Object.assign({}, cfgC, { contrato: Object.assign({}, cfgC.contrato, { documento: '12.345.678/0001-90', endereco: 'Rua B, 20, Centro, Belém' }) });
  const g3 = Ct.gerar({ pedido: pedidoC, cliente: cliC, fantasiaDe: fx, config: cfgOk, hoje: '2027-02-05' });
  prova('contrato: com dados do ateliê, sem pendências e cidade da assinatura', !g3.pendencias.length && g3.html.includes('12.345.678/0001-90') && g3.html.includes('Belém, 5 de fevereiro de 2027'));
}

/* ---------- estoque de acessório alugado ---------- */
{
  const perK = { retirada: '2027-02-05', devolucao: '2027-02-08' };
  prova('acessório: sem reservas, todo o estoque', L.kitLivres(3, [], perK, 1) === 3);
  prova('acessório: reserva no período ocupa', L.kitLivres(3, [{ retirada: '2027-02-05', devolucao: '2027-02-08', qtd: 2 }], perK, 1) === 1);
  prova('acessório: margem de higienização conta', L.kitLivres(1, [{ retirada: '2027-02-01', devolucao: '2027-02-04', qtd: 1 }], perK, 1) === 0);
  prova('acessório: duas reservas em sequência contam o pico, não a soma',
    L.kitLivres(2, [{ retirada: '2027-02-01', devolucao: '2027-02-05', qtd: 1 }, { retirada: '2027-02-08', devolucao: '2027-02-10', qtd: 1 }], perK, 0) === 1);
  prova('acessório: nunca negativo', L.kitLivres(1, [{ retirada: '2027-02-05', devolucao: '2027-02-08', qtd: 3 }], perK, 1) === 0);
  prova('acessório: sem período, estoque inteiro', L.kitLivres(2, [{ retirada: '2027-02-05', devolucao: '2027-02-08', qtd: 2 }], null, 1) === 2);
}

/* ---------- site: onde estamos, Google ---------- */
{
  const hs = [{ dias: [1, 2, 3, 4, 5], abre: '09:00', fecha: '18:00' }, { dias: [6], abre: '09:00', fecha: '13:30' }];
  prova('horários em texto', L.textoHorarios(hs).join(' | ') === 'Segunda a sexta: 9h às 18h | Sábado: 9h às 13h30 | Domingo: fechado', L.textoHorarios(hs));
  prova('horários salteados', L.textoHorarios([{ dias: [2, 4], abre: '14:00', fecha: '18:00' }])[0] === 'Terça e quinta: 14h às 18h', L.textoHorarios([{ dias: [2, 4], abre: '14:00', fecha: '18:00' }]));
  prova('dias sem horário', L.diasSemHorario(hs).join() === '0');
  prova('link do mapa codificado', L.linkMapa('Rua A, 10 & B') === 'https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010%20%26%20B' && L.linkMapa('') === '');
  const jl = L.dadosEstruturados(Object.assign({}, C, { instagram: '@cantinho', local: { endereco: 'Rua A, 10', cidade: 'Belém', uf: 'PA', horarios: hs } }), 'https://exemplo.com');
  prova('dados para o Google: nome, endereço, horários, Instagram', jl['@type'] === 'ClothingStore' && jl.address.addressLocality === 'Belém' && jl.openingHoursSpecification.length === 2 &&
    jl.openingHoursSpecification[0].dayOfWeek[0] === 'https://schema.org/Monday' && jl.sameAs[0] === 'https://www.instagram.com/cantinho');
  prova('dados para o Google sem endereço não inventam endereço', !L.dadosEstruturados(C).address);
  prova('config: dias fechados batem com os horários do site', L.diasSemHorario(C.local.horarios).join() === C.lojas[Object.keys(C.lojas)[0]].diasFechados.slice().sort().join(),
    [L.diasSemHorario(C.local.horarios), C.lojas[Object.keys(C.lojas)[0]].diasFechados]);
  prova('config: medição conhecida', ['', 'plausible', 'ga4'].includes(C.medicao));
}

/* ---------- agenda de prova ---------- */
{
  const hs = [{ dias: [1, 2, 3, 4, 5], abre: '09:00', fecha: '11:00' }, { dias: [6], abre: '09:00', fecha: '10:00' }];
  const seg = L.horariosDeProva('2027-02-01', hs, 30, [], 1); // segunda
  prova('provas de 30 min das 9h às 11h: 4 horários', seg.map(x => x.hora).join() === '09:00,09:30,10:00,10:30', seg);
  prova('domingo sem prova', L.horariosDeProva('2027-01-31', hs, 30, [], 1).length === 0);
  prova('sábado com o horário do sábado', L.horariosDeProva('2027-02-06', hs, 30, [], 1).length === 2);
  prova('horário ocupado não fica livre', !L.horariosDeProva('2027-02-01', hs, 30, ['09:30'], 1).find(x => x.hora === '09:30').livre);
  prova('dois provadores: um ocupado ainda deixa livre', L.horariosDeProva('2027-02-01', hs, 30, ['09:30'], 2).find(x => x.hora === '09:30').livre);
  prova('prova longa não passa do fechamento', L.horariosDeProva('2027-02-01', hs, 45, [], 1).map(x => x.hora).join() === '09:00,09:45', L.horariosDeProva('2027-02-01', hs, 45, [], 1));
  prova('config: prova e orçamento', C.provas.duracaoMinutos > 0 && C.provas.provadores >= 1 && C.orcamento.validadeDias > 0);
}

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
  prova(q + ': público e numeração combinam (infantil só 2 a 14, adulto só PP a XG)', (f.publico === 'infantil') === L.ehInfantil(tams) && ['adulto', 'infantil', undefined].includes(f.publico), [f.publico, tams]);
  prova(q + ': 4 medidas por tamanho', tams.every(t => f.tamanhos[t].length === 4 && f.tamanhos[t].every(n => n > 0)));
  const kitIds = (f.kit || []).map(k => k.id);
  prova(q + ': kit com ids únicos', new Set(kitIds).size === kitIds.length);
  prova(q + ': kit com tipo válido', (f.kit || []).every(k => ['venda', 'aluguel'].includes(k.tipo) && k.preco > 0));
  prova(q + ': acessório de aluguel tem estoque', (f.kit || []).filter(k => k.tipo === 'aluguel').every(k => Number.isInteger(k.estoque) && k.estoque > 0));
  prova(q + ': nome sem marca registrada', !proibidos.test(f.nome + ' ' + f.descricao + ' ' + (f.palavras || []).join(' ')), f.nome);
  prova(q + ': cor hexadecimal', /^#[0-9a-f]{6}$/i.test(f.cor), f.cor);
  prova(q + ': reposição maior que a caução', f.reposicao > f.caucao, [f.reposicao, f.caucao]);
  const est = f.estoque || {};
  prova(q + ': estoque para cada tamanho, e só para eles', Object.keys(est).sort().join() === tams.slice().sort().join(), [tams, est]);
  prova(q + ': estoque inteiro positivo', Object.values(est).every(n => Number.isInteger(n) && n > 0), est);
}
// A especificação pedia 20 a 30 peças na vitrine de validação; com o infantil, o teto passou a 40.
prova('vitrine entre 20 e 40 peças', FANTASIAS.length >= 20 && FANTASIAS.length <= 40, FANTASIAS.length);
prova('acervo infantil com ao menos 4 peças juninas', FANTASIAS.filter(f => f.publico === 'infantil' && f.temas.includes('junina')).length >= 4);
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

/* ---------- estado da loja na simulação (painel do ateliê) ---------- */
{
  const guardado = {};
  const jan = { Logica: L, localStorage: { getItem: k => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); } } };
  const ctxE = vm.createContext({ window: jan, localStorage: jan.localStorage, setInterval: () => 0, Date, JSON, Math });
  for (const f of ['config.js', 'dados.js', 'simulacao/agenda_exemplo.js', 'simulacao/estado.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctxE, { filename: f });
  }
  const S = jan.SIM_LOJA;
  const lojaN = jan.CONFIG.lojas.neia;
  S.definirDia('2027-03-10'); // dia sem movimento na agenda de exemplo
  const fJ = jan.FANTASIAS.find(f => f.id === 'JN05');
  const livresM = festa => L.disponibilidade(fJ, jan.AGENDA, L.periodoAluguel(festa, S.dia(), 0, lojaN), 1).M.livres.length;
  const antes = livresM('2027-03-11');
  prova('estado: exemplo carregado (pedidos e clientes)', S.todos().length > 300 && S.clientes().length > 20);
  prova('clientes de exemplo com CPF válido', S.clientes().every(c => L.cpfValido(c.cpf)));
  prova('clientes de exemplo passam na validação', S.clientes().every(c => L.validarCliente(Object.assign({}, c, { avisoPrivacidade: true })).length === 0), L.validarCliente(Object.assign({}, S.clientes()[0], { avisoPrivacidade: true })));
  const per = L.periodoAluguel('2027-03-11', S.dia(), 0, lojaN);

  // pedido do site retirado na loja: cliente cadastra no balcão e paga tudo na entrega
  S.abrirCaixa(0);
  const perS = L.periodoAluguel('2027-03-11', S.dia(), 0, lojaN);
  const pedS = S.criarPedidoSite({ fantasia: 'JN05', tamanho: 'P', unidade: 'JN05-P-2', retirada: perS.retirada, devolucao: perS.devolucao, total: 95, sinal: 28.5, caucao: 60 });
  prova('pedido do site sem cliente', !S.porId(pedS.id).clienteId && S.saldo(S.porId(pedS.id)) === 95);
  S.registrarRetirada(pedS.id, { clienteId: 'CE002', linhasSaldo: [{ forma: 'pix', valor: 95, confirmado: true }], linhasCaucao: [{ forma: 'dinheiro', valor: 60, entregue: 60 }], vistoria: { dia: S.dia(), fotos: {}, defeitos: [], obs: '' } });
  const rS = S.porId(pedS.id);
  prova('retirada do pedido do site: vincula o cliente, recebe tudo e entrega', rS.status === 'retirada' && rS.clienteId === 'CE002' && S.saldo(rS) === 0 && S.caucaoRecebida(rS), rS);
  // cliente do site com crédito na loja paga parte com o vale
  const cliV = S.salvarCliente({ nome: 'Rita Vale', cpf: '111.444.777-35', whatsapp: '91 95555-4444', endereco: { cep: '66000000', rua: 'R', numero: '1', bairro: 'B', cidade: 'C', uf: 'PA' } });
  const pV0 = S.criarPedidoBalcao({ clienteId: cliV.id, periodo: L.periodoAluguel(L.somarDias(S.dia(), 3), S.dia(), 0, lojaN), itens: [{ fantasia: 'JN05', tamanho: 'G', unidade: 'JN05-G-2', preco: 95, diaExtra: 25, caucao: 60 }],
    complementos: [], desconto: { valor: 0 }, recebe: 'sinal', linhas: [{ forma: 'pix', valor: 28.5, confirmado: true }] });
  S.cancelar(pV0.id, {});
  const pedV = S.criarPedidoSite({ fantasia: 'JN05', tamanho: 'M', unidade: 'JN05-M-3', retirada: perS.retirada, devolucao: perS.devolucao, total: 95, sinal: 28.5, caucao: 60 });
  S.registrarRetirada(pedV.id, { clienteId: cliV.id, linhasSaldo: [{ forma: 'vale', valor: 28.5 }, { forma: 'pix', valor: 66.5, confirmado: true }], linhasCaucao: [{ forma: 'pix', valor: 60, confirmado: true }], vistoria: { dia: S.dia(), fotos: {}, defeitos: [], obs: '' } });
  prova('retirada do site com vale: crédito do cliente abatido', S.clientePorId(cliV.id).credito === 0 && S.saldo(S.porId(pedV.id)) === 0, S.clientePorId(cliV.id).credito);
  S.zerar(); S.definirDia('2027-03-10');

  // pedido do site segura a peça; recusado, libera
  const ped = S.criarPedidoSite({ fantasia: 'JN05', tamanho: 'M', unidade: 'JN05-M-1', retirada: per.retirada, devolucao: per.devolucao, total: 95, sinal: 28.5, caucao: 60 });
  prova('pedido do site nasce aguardando sinal e segura a peça', S.porId(ped.id).status === 'pendente' && livresM('2027-03-11') === antes - 1);
  S.cancelar(ped.id, { motivo: 'teste' });
  prova('pedido recusado libera a peça', livresM('2027-03-11') === antes);

  // sem caixa aberto não recebe
  let erroCaixa = '';
  try { S.criarPedidoBalcao({ clienteId: 'CE001', periodo: per, itens: [], complementos: [{ nome: 'x', preco: 8, qtd: 1 }], linhas: [{ forma: 'dinheiro', valor: 8 }] }); } catch (e) { erroCaixa = e.message; }
  prova('sem caixa aberto não registra pagamento', erroCaixa === 'Caixa fechado');
  S.abrirCaixa(200);
  prova('caixa aberto com fundo', S.caixaAberto() && S.caixaAberto().fundo === 200);

  // cliente novo (LGPD)
  const dadosCli = { nome: 'Maria Teste', cpf: '529.982.247-25', whatsapp: '(91) 98888-7777', email: '', rg: '',
    endereco: { cep: '66010000', rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Belém', uf: 'PA' }, marketing: false };
  const cli = S.salvarCliente(dadosCli);
  prova('cliente salvo com WhatsApp normalizado e aviso registrado', cli.id && cli.whatsapp === '5591988887777' && cli.avisoPrivacidade.versao && !cli.marketing.consentido);
  const outroEx = S.clientes().find(x => x.origem === 'exemplo');
  const rCorr = S.salvarCliente(Object.assign({}, cli, { id: cli.id, cpf: outroEx.cpf, avisoPrivacidade: true }));
  prova('correção de cadastro não aceita CPF de outro cliente', rCorr.erro && S.clientes().filter(c => c.cpf === outroEx.cpf).length === 1, rCorr);
  prova('CPF repetido não cria outro cadastro', S.salvarCliente(dadosCli).erro && S.clientes().filter(c => c.cpf === '52998224725').length === 1);
  S.definirMarketing(cli.id, true);
  prova('consentimento de marketing registrado com data e versão', S.clientePorId(cli.id).marketing.consentido && S.clientePorId(cli.id).marketing.em === S.dia());
  S.definirMarketing(cli.id, false);
  prova('revogação registrada no histórico', !S.clientePorId(cli.id).marketing.consentido && S.clientePorId(cli.id).log.some(l => /Revogou/.test(l.acao)));

  // pedido no balcão: 2 peças + complemento, desconto, pagamento misto com troco
  const itens = [{ fantasia: 'JN05', tamanho: 'M', unidade: 'JN05-M-2', preco: 95, diaExtra: 25, caucao: 60 },
                 { fantasia: 'JN05', tamanho: 'G', unidade: 'JN05-G-1', preco: 95, diaExtra: 25, caucao: 60 }];
  const v = S.calcularPedido({ itens, complementos: [{ nome: 'Lápis', preco: 8, qtd: 2 }], desconto: { valor: 6 }, diasExtras: 0 });
  prova('pedido: 2 × 95 + 2 × 8 − 6 = 200; caução 120; sinal 30% = 60', v.total === 200 && v.caucao === 120 && v.sinal === 60, v);
  const b = S.criarPedidoBalcao({ clienteId: cli.id, periodo: per, itens, complementos: [{ nome: 'Lápis', preco: 8, qtd: 2 }], desconto: { valor: 6, motivo: 'quadrilha' },
    recebe: 'sinal', linhas: [{ forma: 'pix', valor: 40, confirmado: true }, { forma: 'dinheiro', valor: 20, entregue: 50 }] });
  let r = S.porId(b.id);
  prova('balcão: confirmado, sinal em 2 formas, saldo 140', r.status === 'confirmada' && r.pagamentos.length === 2 && S.saldo(r) === 140);
  prova('balcão baixa o estoque das duas peças', livresM('2027-03-11') === antes - 1 && L.disponibilidade(fJ, jan.AGENDA, per, 1).G.livres.indexOf('JN05-G-1') === -1);
  let esp = L.esperadoCaixa(S.caixaAberto());
  prova('caixa: fundo 200 + 20 dinheiro (troco 30 já saiu) e 40 no Pix', esp.dinheiro === 220 && esp.pix === 40, esp);

  // entrega: saldo no crédito 2x e caução em dinheiro
  S.registrarRetirada(b.id, { linhasSaldo: [{ forma: 'credito', valor: 140, parcelas: 2, confirmado: true }], linhasCaucao: [{ forma: 'dinheiro', valor: 120, entregue: 120 }], vistoria: { dia: S.dia(), fotos: {}, defeitos: [], obs: '' } });
  r = S.porId(b.id);
  prova('entrega: com o cliente, nada a receber, caução recebida', r.status === 'retirada' && S.saldo(r) === 0 && S.caucaoRecebida(r));
  prova('crédito parcelado guardado com as parcelas', r.pagamentos.some(p => p.forma === 'credito' && p.parcelas === 2));

  // devolução atrasada com dano: caução devolvida em dinheiro sai do caixa
  // virada do dia: fecha o caixa de ontem (conferido) e abre o de hoje com o dinheiro da gaveta
  const ontem = L.esperadoCaixa(S.caixaAberto());
  S.definirDia(L.somarDias(per.devolucao, 2));
  prova('caixa de ontem aberto é detectado na virada', S.caixaDeOutroDia());
  const fechOntem = S.fecharCaixa({ dinheiro: ontem.dinheiro, pix: ontem.pix, debito: ontem.debito, credito: ontem.credito });
  prova('caixa de ontem fecha conferido', fechOntem.conferencia.confere && ontem.dinheiro === 340 && ontem.credito === 140, ontem);
  S.abrirCaixa(ontem.dinheiro);
  const ag = jan.AGENDA.find(x => x.unidade === 'JN05-M-2' && x.retirada === per.retirada);
  prova('peça atrasada continua bloqueada até hoje', ag.devolucao === S.dia(), ag);
  const acerto = L.acertoDevolucao({ caucao: 120, danos: [{ descricao: 'botão', valor: 5 }], diasAtraso: 2, valorDiaAtraso: 50 });
  S.registrarDevolucao(b.id, { acerto, danos: [], forma: 'dinheiro', vistoria: { dia: S.dia(), fotos: {}, defeitos: [], obs: '' } });
  r = S.porId(b.id);
  prova('devolução: concluída, devolve 15 da caução', r.status === 'concluida' && r.acerto.devolver === 15 && r.pagamentos.some(p => p.tipo === 'caucao_devolvida' && p.valor === 15), r.acerto);
  esp = L.esperadoCaixa(S.caixaAberto());
  prova('caixa de hoje: fundo 340 (gaveta de ontem) − 15 devolvidos = 325', esp.dinheiro === 325 && esp.credito === 0, esp);
  prova('situação: higienização no dia da devolução', L.situacaoUnidade('JN05-M-2', S.linhasPorPeca(), S.dia(), 1).estado === 'higienizacao');

  // sangria, suprimento e fechamento com conferência cega
  S.sangria(100, 'depósito'); S.suprimento(10, 'troco');
  const fechado = S.fecharCaixa({ dinheiro: 230, pix: 0, debito: 0, credito: 0 });
  prova('fechamento acha os R$ 5 faltando no dinheiro', fechado.fechadoEm && !fechado.conferencia.confere && fechado.conferencia.diferenca === -5, fechado.conferencia);
  prova('vale não entra na conferência da gaveta', !fechado.conferencia.linhas.some(l => l.forma === 'vale'));

  // cancelamento com menos de 7 dias: sinal vira crédito, que paga outro pedido como vale
  S.abrirCaixa(0);
  const per2 = L.periodoAluguel(L.somarDias(S.dia(), 3), S.dia(), 0, lojaN);
  const c2 = S.criarPedidoBalcao({ clienteId: cli.id, periodo: per2, itens: [{ fantasia: 'JN05', tamanho: 'P', unidade: 'JN05-P-1', preco: 95, diaExtra: 25, caucao: 60 }],
    complementos: [], desconto: { valor: 0 }, recebe: 'sinal', linhas: [{ forma: 'pix', valor: 28.5, confirmado: true }] });
  S.cancelar(c2.id, { motivo: 'desistiu' });
  prova('cancelou a 3 dias: sinal vira crédito na loja', S.porId(c2.id).status === 'cancelada' && S.clientePorId(cli.id).credito === 28.5);
  S.criarPedidoBalcao({ clienteId: cli.id, periodo: null, itens: [], complementos: [{ nome: 'Lápis', preco: 8, qtd: 1 }], desconto: { valor: 0 }, linhas: [{ forma: 'vale', valor: 8 }] });
  prova('vale abate do crédito', S.clientePorId(cli.id).credito === 20.5);

  // venda avulsa não leva acessório de aluguel; com peça, o acessório ocupa estoque
  let erroAvulsa = '';
  try { S.criarPedidoBalcao({ clienteId: null, periodo: null, itens: [], complementos: [{ fantasia: 'HW01', kitId: 'vassoura', nome: 'Vassoura', tipo: 'aluguel', preco: 15, qtd: 1 }], desconto: { valor: 0 }, linhas: [{ forma: 'dinheiro', valor: 15 }] }); } catch (e) { erroAvulsa = e.message; }
  prova('acessório de aluguel não sai em venda avulsa', /só vai junto com uma peça alugada/.test(erroAvulsa));
  const perK2 = L.periodoAluguel(L.somarDias(S.dia(), 1), S.dia(), 0, lojaN);
  const antesK = S.kitLivres('HW01', 'vassoura', perK2);
  S.criarPedidoBalcao({ clienteId: 'CE003', periodo: perK2, itens: [{ fantasia: 'HW01', tamanho: 'M', unidade: 'HW01-M-3', preco: 140, diaExtra: 35, caucao: 100 }],
    complementos: [{ fantasia: 'HW01', kitId: 'vassoura', nome: 'Vassoura decorativa', tipo: 'aluguel', preco: 15, qtd: 2 }], desconto: { valor: 0 }, recebe: 'total', linhas: [{ forma: 'pix', valor: 170, confirmado: true }] });
  prova('acessório alugado baixa o estoque na data (3 → 1)', antesK === 3 && S.kitLivres('HW01', 'vassoura', perK2) === 1, [antesK, S.kitLivres('HW01', 'vassoura', perK2)]);
  prova('agenda de acessórios publicada para o site', jan.AGENDA_KITS.some(k => k.kitId === 'vassoura' && k.qtd === 2));

  // caixa é do dia
  const diaCx = S.dia();
  S.definirDia(L.somarDias(diaCx, 1));
  let erroDia = '';
  try { S.criarPedidoBalcao({ clienteId: null, periodo: null, itens: [], complementos: [{ nome: 'Lápis', tipo: 'venda', preco: 8, qtd: 1 }], desconto: { valor: 0 }, linhas: [{ forma: 'dinheiro', valor: 8 }] }); } catch (e) { erroDia = e.message; }
  prova('caixa de ontem não recebe hoje', S.caixaDeOutroDia() && erroDia === 'Caixa de outro dia');
  S.definirDia(diaCx);
  prova('no próprio dia o caixa recebe', !S.caixaDeOutroDia());

  // bloqueio de peça para conserto
  const fB = jan.FANTASIAS.find(f => f.id === 'JN03');
  const perB = L.periodoAluguel(L.somarDias(S.dia(), 10), S.dia(), 0, lojaN);
  const livresB = () => L.disponibilidade(fB, jan.AGENDA, perB, 1).M.livres;
  const unB = livresB()[0];
  const bl = S.bloquear({ unidade: unB, fantasia: 'JN03', tamanho: 'M', de: perB.retirada, ate: perB.devolucao, motivo: 'Conserto' });
  prova('bloqueio tira a peça da data', bl.id && livresB().indexOf(unB) === -1);
  prova('bloqueio aparece no dia', S.bloqueioNoDia(unB, perB.retirada).id === bl.id && !S.bloqueioNoDia(unB, L.somarDias(perB.devolucao, 1)));
  prova('bloqueio termina no "até": o dia seguinte já fica livre', L.disponibilidade(fB, jan.AGENDA, L.periodoAluguel(L.somarDias(perB.devolucao, 2), S.dia(), 0, lojaN), 1).M.livres.indexOf(unB) !== -1);
  S.liberar(bl.id);
  prova('liberar devolve a peça', livresB().indexOf(unB) !== -1);
  const resB = S.criarPedidoBalcao({ clienteId: 'CE004', periodo: perB, itens: [{ fantasia: 'JN03', tamanho: 'M', unidade: unB, preco: 160, diaExtra: 40, caucao: 120 }],
    complementos: [], desconto: { valor: 0 }, recebe: 'total', linhas: [{ forma: 'pix', valor: 160, confirmado: true }] });
  const blC = S.bloquear({ unidade: unB, fantasia: 'JN03', tamanho: 'M', de: perB.retirada, ate: perB.retirada, motivo: 'Conserto' });
  prova('não bloqueia peça reservada (avisa o pedido)', blC.erro && blC.erro.includes(resB.id), blC);
  prova('datas do bloqueio em ordem', S.bloquear({ unidade: unB, fantasia: 'JN03', tamanho: 'M', de: '2027-01-10', ate: '2027-01-09', motivo: 'x' }).erro);

  // agenda de prova (seg a sex 9h-18h, sáb 9h-13h no config de exemplo)
  const diaProva = (() => { let d = L.somarDias(S.dia(), 1); while (L.diaSemana(d) !== 2) d = L.somarDias(d, 1); return d; })(); // próxima terça
  const pv = S.marcarProva({ nome: 'Dona Rosa (escola)', whatsapp: '91 96666-5555', dia: diaProva, hora: '10:00', fantasias: ['IN01', 'IN02'] });
  prova('prova marcada com o mínimo (nome e WhatsApp)', pv.id && pv.whatsapp === '5591966665555' && S.provas(diaProva).length === 1);
  prova('horário da prova fica ocupado', !S.horariosDeProva(diaProva).find(x => x.hora === '10:00').livre);
  prova('não marca duas provas no mesmo horário', /ocupado/.test(S.marcarProva({ nome: 'Outra', whatsapp: '91 95555-1111', dia: diaProva, hora: '10:00' }).erro || ''));
  prova('não marca fora do horário', /não atende/.test(S.marcarProva({ nome: 'Outra', whatsapp: '91 95555-1111', dia: diaProva, hora: '19:00' }).erro || ''));
  prova('não marca no domingo', /não atende/.test(S.marcarProva({ nome: 'Outra', whatsapp: '91 95555-1111', dia: L.somarDias(diaProva, 5), hora: '10:00' }).erro || ''));
  prova('prova pede WhatsApp', /WhatsApp/.test(S.marcarProva({ nome: 'Outra', whatsapp: '123', dia: diaProva, hora: '11:00' }).erro || ''));
  S.atualizarProva(pv.id, 'cancelada');
  prova('prova cancelada libera o horário', S.horariosDeProva(diaProva).find(x => x.hora === '10:00').livre);

  // LGPD: eliminação respeita a guarda; anonimizar tira os dados e mantém o histórico
  const sit = S.situacaoEliminacao(cli.id);
  prova('cliente com locação recente: guarda até 5 anos depois', !sit.pode && sit.motivo === 'guarda', sit);
  const sol = S.abrirSolicitacao(cli.id, 'Eliminação dos dados');
  prova('pedido do titular com prazo de 15 dias', sol.prazo === L.somarDias(S.dia(), 15));
  S.anonimizar(cli.id);
  const an = S.clientePorId(cli.id);
  prova('anonimizado: sem CPF e sem WhatsApp, pedidos mantidos', an.anonimizado && !an.cpf && !an.whatsapp && S.pedidosDoCliente(cli.id).length >= 2);
  prova('pedido do titular fechado ao anonimizar', S.solicitacoes().find(x => x.id === sol.id).status === 'atendida');
  S.abrirCaixa(0);
  const pf = S.criarPedidoBalcao({ clienteId: 'CE001', periodo: L.periodoAluguel(L.somarDias(S.dia(), 1), S.dia(), 0, lojaN), itens: [{ fantasia: 'JN05', tamanho: 'GG', unidade: 'JN05-GG-1', preco: 95, diaExtra: 25, caucao: 60 }],
    complementos: [], desconto: { valor: 0 }, recebe: 'total', linhas: [{ forma: 'pix', valor: 95, confirmado: true }] });
  S.registrarRetirada(pf.id, { linhasCaucao: [{ forma: 'pix', valor: 60, confirmado: true }], vistoria: { dia: S.dia(), fotos: { frente: 'data:x' }, defeitos: [], obs: '' } });
  S.registrarDevolucao(pf.id, { acerto: L.acertoDevolucao({ caucao: 60 }), danos: [], forma: 'pix', vistoria: { dia: S.dia(), fotos: { frente: 'data:y' }, defeitos: [], obs: '' } });
  prova('fotos ainda dentro da guarda', S.fotosVencidas().length === 0);
  const diaVolta = S.dia();
  S.definirDia(L.somarDias(diaVolta, 183));
  prova('fotos vencidas depois de 6 meses', S.fotosVencidas().some(x => x.id === pf.id));
  S.apagarFotosVencidas();
  prova('fotos apagadas, laudo escrito mantido', !Object.keys(S.porId(pf.id).vistorias.retirada.fotos).length && S.porId(pf.id).vistorias.retirada.fotosApagadasEm && S.porId(pf.id).status === 'concluida');
  prova('estado guardado no navegador', typeof guardado['simulacao-cantinho-v3'] === 'string' && guardado['simulacao-cantinho-v3'].includes(b.id));

  const ex = S.todos().find(x => x.origem === 'exemplo');
  S.definirDia(L.somarDias(ex.retirada, -1));
  prova('exemplo antes da retirada: confirmada', S.porId(ex.id).status === 'confirmada');
  const exR = S.porId(ex.id);
  prova('exemplo: sinal conta como pago, falta só o saldo', S.saldo(exR) === Math.round((exR.valores.total - exR.valores.sinal) * 100) / 100 && S.saldo(exR) < exR.valores.total, [S.saldo(exR), exR.valores]);
  S.definirDia(ex.retirada);
  prova('exemplo no dia da retirada: esperando o cliente (sai hoje)', S.porId(ex.id).status === 'confirmada');
  S.definirDia(L.somarDias(ex.retirada, 1));
  prova('exemplo no dia seguinte: com o cliente', S.porId(ex.id).status === 'retirada');
  S.zerar();
  prova('recomeçar apaga pedidos, clientes e caixas criados', !S.porId(b.id) && !S.clientePorId(cli.id) && !S.caixas().length);
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
for (const m of html.matchAll(/(?:href|content)="([\w-]+\.(?:svg|png))"/g)) prova('arquivo ' + m[1] + ' referenciado no <head> existe', fs.existsSync(path.join(__dirname, m[1])));
prova('prévia de link: og:title, og:description e og:image', ['og:title', 'og:description', 'og:image'].every(k => html.includes('property="' + k + '"')));
prova('estilo: [hidden] vence display de componentes', /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(fs.readFileSync(path.join(__dirname, 'estilo.css'), 'utf8')));
prova('ícone da aba declarado', /<link rel="icon" href="favicon.svg"/.test(html));
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
  prova('simulação com 10 scripts inline', blocos.length === 10, blocos.length);
  prova('contrato carrega depois da lógica', sim.indexOf('/* logica.js */') < sim.indexOf('/* contrato.js */'));
  prova('estado da loja carrega antes do app (a vitrine nasce com a agenda certa)', sim.indexOf('/* simulacao/estado.js */') < sim.indexOf('/* app.js */') && sim.indexOf('/* logica.js */') < sim.indexOf('/* simulacao/estado.js */'));
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
