/* Regras puras da landing — sem DOM, para rodar no navegador e no Node.
 * Valores em dinheiro são tratados em centavos para não acumular erro de ponto flutuante. */
(function (raiz, fabrica) {
  var mod = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else raiz.Logica = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Infantil (idade em anos, numeração brasileira) e adulto.
  var TAMANHOS_INFANTIS = ['2', '4', '6', '8', '10', '12', '14'];
  var ORDEM_TAMANHOS = TAMANHOS_INFANTIS.concat(['PP', 'P', 'M', 'G', 'GG', 'XG']);

  // Tabela genérica de referência (adulto). Cada linha: tamanho, altura máx (cm), peso máx (kg).
  var TABELA_REFERENCIA = [
    ['PP', 155, 50],
    ['P', 165, 60],
    ['M', 172, 72],
    ['G', 180, 85],
    ['GG', 188, 100],
    ['XG', 999, 999]
  ];
  // Infantil: altura máx (cm) e peso máx (kg) de referência por tamanho.
  var TABELA_INFANTIL = [
    ['2', 92, 14], ['4', 104, 17], ['6', 116, 22], ['8', 128, 28], ['10', 140, 35], ['12', 152, 43], ['14', 999, 999]
  ];
  function ehInfantil(tamanhos) {
    return (tamanhos || []).length > 0 && tamanhos.every(function (t) { return TAMANHOS_INFANTIS.indexOf(t) !== -1; });
  }

  // Preço sempre em pt-BR: "R$ 1.234,50". Nunca toFixed — o ponto se lê como milhar.
  function formatarPreco(reais) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reais);
  }

  function centavos(reais) {
    return Math.round(Number(reais) * 100);
  }

  // "2027-02-13" -> "13/02/2027". Lê a string, sem passar por Date (fuso não desloca o dia).
  function dataBR(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  function diasEntre(isoInicio, isoFim) {
    var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoInicio || '');
    var b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoFim || '');
    if (!a || !b) return null;
    var ua = Date.UTC(+a[1], +a[2] - 1, +a[3]);
    var ub = Date.UTC(+b[1], +b[2] - 1, +b[3]);
    return Math.round((ub - ua) / 86400000);
  }

  var RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  var DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  // Aritmética de datas sempre em UTC sobre a string ISO: horário de verão e fuso não mexem no dia.
  function somarDias(iso, n) {
    var m = RE_ISO.exec(iso || '');
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  function diaSemana(iso) {
    var m = RE_ISO.exec(iso || '');
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() : -1;
  }

  // "sex, 05/02/2027"
  function dataComDia(iso) {
    var d = diaSemana(iso);
    return d < 0 ? '' : DIAS_SEMANA[d] + ', ' + dataBR(iso);
  }

  /* Período do aluguel para uma festa.
   * Padrão de 3 dias: retira na véspera, devolve no dia seguinte à festa.
   * Cada dia extra empurra a devolução. Dia em que a loja não abre
   * (loja.diasFechados, 0 = domingo) nunca é dia de retirada nem de devolução:
   * a retirada recua (sem passar de hoje) e a devolução avança — sem custo.
   * Devolve null para data inválida ou que já passou. */
  function periodoAluguel(dataFesta, hoje, diasExtras, loja) {
    if (!RE_ISO.test(dataFesta || '') || !RE_ISO.test(hoje || '') || dataFesta < hoje) return null;
    var fechados = (loja && loja.diasFechados) || [];
    var fechado = function (iso) { return fechados.indexOf(diaSemana(iso)) !== -1; };
    var extras = Math.max(0, Math.floor(Number(diasExtras) || 0));
    var i;

    var retirada = somarDias(dataFesta, -1);
    for (i = 0; i < 7 && fechado(retirada) && retirada > hoje; i++) retirada = somarDias(retirada, -1);
    if (retirada < hoje) retirada = hoje;
    for (i = 0; i < 7 && fechado(retirada) && retirada < dataFesta; i++) retirada = somarDias(retirada, 1);

    var devolucaoPadrao = somarDias(dataFesta, 1 + extras);
    var devolucao = devolucaoPadrao;
    for (i = 0; i < 7 && fechado(devolucao); i++) devolucao = somarDias(devolucao, 1);

    return {
      dataFesta: dataFesta,
      retirada: retirada,
      devolucao: devolucao,
      dias: diasEntre(retirada, devolucao) + 1,
      diasExtras: extras,
      devolucaoAdiada: devolucao !== devolucaoPadrao
    };
  }

  /* ---------- estoque e agenda ----------
   * Cada peça física é uma unidade: "HW01-M-2" é a 2ª bruxa M.
   * Uma reserva ocupa a unidade da retirada até a devolução + a margem de
   * higienização da loja. Duas reservas da mesma unidade não podem se cruzar
   * (é a constraint de exclusão que o banco do MVP vai ter). */
  function unidades(fantasia, tamanho) {
    var n = (fantasia.estoque && fantasia.estoque[tamanho]) || 0;
    var lista = [];
    for (var i = 1; i <= n; i++) lista.push(fantasia.id + '-' + tamanho + '-' + i);
    return lista;
  }

  function seCruzam(ini1, fim1, ini2, fim2) {
    return ini1 <= fim2 && ini2 <= fim1;
  }

  function unidadeLivre(unidade, agenda, periodo, margem) {
    var fimNovo = somarDias(periodo.devolucao, margem);
    return !agenda.some(function (r) {
      return r.unidade === unidade && seCruzam(periodo.retirada, fimNovo, r.retirada, somarDias(r.devolucao, margem));
    });
  }

  /* { M: { total: 3, livres: ['HW01-M-1', ...] }, ... }. Sem período, todas as unidades contam como livres. */
  function disponibilidade(fantasia, agenda, periodo, margem) {
    var res = {};
    ordenarTamanhos(Object.keys(fantasia.tamanhos)).forEach(function (t) {
      var todas = unidades(fantasia, t);
      res[t] = {
        total: todas.length,
        livres: periodo ? todas.filter(function (u) { return unidadeLivre(u, agenda || [], periodo, margem || 0); }) : todas
      };
    });
    return res;
  }

  function tamanhosLivres(disp) {
    return Object.keys(disp).filter(function (t) { return disp[t].livres.length > 0; });
  }

  /* Primeira data de festa, a partir de dataFesta, em que o tamanho (ou qualquer tamanho) tem unidade livre. */
  function proximaDataLivre(fantasia, agenda, dataFesta, hoje, loja, tamanho, limiteDias) {
    var limite = limiteDias || 60;
    for (var i = 1; i <= limite; i++) {
      var data = somarDias(dataFesta, i);
      var per = periodoAluguel(data, hoje, 0, loja);
      if (!per) continue;
      var disp = disponibilidade(fantasia, agenda, per, loja.margemHigienizacao);
      var ok = tamanho ? (disp[tamanho] && disp[tamanho].livres.length > 0) : tamanhosLivres(disp).length > 0;
      if (ok) return data;
    }
    return null;
  }

  /* Confere a agenda como o banco conferiria: unidade existe, datas em ordem,
   * e nenhuma unidade com duas reservas que se cruzam (contando a margem). */
  function validarAgenda(fantasias, agenda, lojas) {
    var erros = [];
    var porId = {};
    fantasias.forEach(function (f) { porId[f.id] = f; });
    agenda.forEach(function (r, i) {
      var f = porId[r.fantasia];
      if (!f) { erros.push('reserva ' + i + ': fantasia ' + r.fantasia + ' não existe'); return; }
      if (unidades(f, r.tamanho).indexOf(r.unidade) === -1) erros.push('reserva ' + i + ': unidade ' + r.unidade + ' não existe no estoque');
      if (!RE_ISO.test(r.retirada) || !RE_ISO.test(r.devolucao) || r.retirada > r.devolucao) erros.push('reserva ' + i + ': datas inválidas');
      var margem = (lojas[f.loja] && lojas[f.loja].margemHigienizacao) || 0;
      for (var j = 0; j < i; j++) {
        var o = agenda[j];
        if (o.unidade === r.unidade &&
            seCruzam(r.retirada, somarDias(r.devolucao, margem), o.retirada, somarDias(o.devolucao, margem))) {
          erros.push('reservas ' + j + ' e ' + i + ' cruzam na unidade ' + r.unidade);
        }
      }
    });
    return erros;
  }

  /* Acessório alugado (vassoura, chapéu, espada) não tem etiqueta por peça:
   * tem quantidade. Livres = estoque − o pico de uso em qualquer dia do período
   * pedido (cada reserva ocupa da retirada até a devolução + margem). Pico por
   * dia, e não soma de tudo que cruza o período: duas reservas em sequência não
   * contam em dobro. reservas: [{ retirada, devolucao, qtd }] */
  function kitLivres(estoque, reservas, periodo, margem) {
    var total = Math.max(0, Math.floor(Number(estoque) || 0));
    if (!periodo) return total;
    var fim = somarDias(periodo.devolucao, margem || 0), pico = 0;
    for (var dia = periodo.retirada, i = 0; dia <= fim && i < 60; dia = somarDias(dia, 1), i++) {
      var uso = (reservas || []).reduce(function (s, r) {
        return s + (r.retirada <= dia && dia <= somarDias(r.devolucao, margem || 0) ? (r.qtd || 1) : 0);
      }, 0);
      if (uso > pico) pico = uso;
    }
    return Math.max(0, total - pico);
  }

  /* ---------- balcão e painel do ateliê ---------- */

  // CPF pelos dois dígitos verificadores. Rejeita sequências repetidas (111.111.111-11).
  function cpfValido(cpf) {
    var d = String(cpf || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (var t = 9; t < 11; t++) {
      var soma = 0;
      for (var i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
      if ((soma * 10) % 11 % 10 !== Number(d[t])) return false;
    }
    return true;
  }

  /* Acerto na devolução. A caução cobre multa de atraso e danos NOVOS
   * (os que não estão no laudo da retirada), cada um com valor próprio.
   * O que passar da caução é cobrado à parte; o que sobrar volta ao cliente.
   * { caucao, danos: [{ descricao, valor }], diasAtraso, valorDiaAtraso } */
  function acertoDevolucao(d) {
    var caucao = centavos(d.caucao || 0);
    var atraso = Math.max(0, Math.floor(Number(d.diasAtraso) || 0));
    var multa = atraso * centavos(d.valorDiaAtraso || 0);
    var danos = (d.danos || []).reduce(function (s, x) { return s + Math.max(0, centavos(x.valor || 0)); }, 0);
    var descontos = multa + danos;
    var retido = Math.min(caucao, descontos);
    return {
      caucao: caucao / 100,
      diasAtraso: atraso,
      multa: multa / 100,
      danos: danos / 100,
      retido: retido / 100,
      devolver: (caucao - retido) / 100,
      cobrar: (descontos - retido) / 100
    };
  }

  /* Cancelamento: até 7 dias antes da retirada, o sinal volta inteiro (CDC e regra
   * do site). Depois disso vale a política da loja, que o painel mostra. */
  function reembolsoCancelamento(sinalPago, retirada, hoje) {
    var dias = diasEntre(hoje, retirada);
    var integral = dias !== null && dias >= 7;
    return { integral: integral, diasAntes: dias, valor: integral ? centavos(sinalPago || 0) / 100 : 0 };
  }

  /* Onde está cada peça física num dia. reservas: [{ unidade, status, retirada,
   * devolucao, devolvidaEm }] com status já resolvido ('pendente', 'confirmada',
   * 'retirada', 'concluida', 'cancelada'). Prioridade: atrasada > com o cliente >
   * higienização > sai hoje > livre. */
  function situacaoUnidade(unidade, reservas, dia, margem) {
    var minhas = reservas.filter(function (r) { return r.unidade === unidade && r.status !== 'cancelada'; });
    var achar = function (cond) { for (var i = 0; i < minhas.length; i++) if (cond(minhas[i])) return minhas[i]; return null; };
    var r;
    if ((r = achar(function (x) { return x.status === 'retirada' && dia > x.devolucao; }))) {
      return { estado: 'atrasada', reserva: r, diasAtraso: diasEntre(r.devolucao, dia) };
    }
    if ((r = achar(function (x) { return x.status === 'retirada'; }))) return { estado: 'com-cliente', reserva: r };
    if ((r = achar(function (x) {
      return x.status === 'concluida' && x.devolvidaEm && dia >= x.devolvidaEm && dia <= somarDias(x.devolvidaEm, margem);
    }))) return { estado: 'higienizacao', reserva: r, ate: somarDias(r.devolvidaEm, margem) };
    if ((r = achar(function (x) { return (x.status === 'confirmada' || x.status === 'pendente') && x.retirada === dia; }))) {
      return { estado: 'sai-hoje', reserva: r };
    }
    var futuras = minhas.filter(function (x) { return (x.status === 'confirmada' || x.status === 'pendente') && x.retirada > dia; })
      .sort(function (a, b) { return a.retirada < b.retirada ? -1 : 1; });
    return { estado: 'livre', proxima: futuras[0] || null };
  }

  /* ---------- pagamentos (PDV) ----------
   * Cada linha de pagamento tem forma e valor. Troco só sai do dinheiro:
   * Pix, cartão e vale nunca passam do que falta. Pix e cartão só contam
   * depois de confirmados (Pix no app do banco, cartão "aprovado" na maquininha). */
  var FORMAS_PAGAMENTO = {
    dinheiro: { nome: 'Dinheiro' },
    pix: { nome: 'Pix', confirmar: true },
    debito: { nome: 'Cartão de débito', confirmar: true, cartao: true },
    credito: { nome: 'Cartão de crédito', confirmar: true, cartao: true, parcela: true },
    vale: { nome: 'Crédito na loja (vale)' }
  };

  // Divide em parcelas de centavos inteiros; a primeira leva o resto.
  function dividirParcelas(valor, n) {
    var c = centavos(valor), q = Math.max(1, Math.floor(Number(n) || 1));
    var base = Math.floor(c / q), resto = c - base * q;
    var lista = [];
    for (var i = 0; i < q; i++) lista.push((base + (i === 0 ? resto : 0)) / 100);
    return lista;
  }

  // Quantas parcelas cabem: até o máximo, sem parcela menor que a mínima.
  function maxParcelas(valor, cfg) {
    var max = (cfg && cfg.parcelasMax) || 1, min = (cfg && cfg.parcelaMinima) || 0;
    var cabe = min > 0 ? Math.floor(centavos(valor) / centavos(min)) : max;
    return Math.max(1, Math.min(max, cabe));
  }

  // Taxa estimada da maquininha (só para mostrar o líquido; a real vem da adquirente).
  function taxaEstimada(valor, forma, parcelas, taxas) {
    var t = taxas || {};
    var pct = forma === 'debito' ? t.debito : forma === 'credito' ? ((parcelas || 1) > 1 ? t.creditoParcelado : t.creditoVista) : forma === 'pix' ? t.pix : 0;
    var c = centavos(valor), taxa = Math.round(c * (Number(pct) || 0) / 100);
    return { percentual: Number(pct) || 0, taxa: taxa / 100, liquido: (c - taxa) / 100 };
  }

  /* linhas: [{ forma, valor, entregue?, parcelas?, confirmado? }]
   * opcoes: { valeDisponivel, parcelas: cfg } */
  function validarPagamentos(devido, linhas, opcoes) {
    var o = opcoes || {};
    var alvo = centavos(devido), soma = 0, naoDinheiro = 0, troco = 0, vale = 0;
    var erros = [];
    (linhas || []).forEach(function (l, i) {
      var n = i + 1, v = centavos(l.valor || 0), f = FORMAS_PAGAMENTO[l.forma];
      if (!f) { erros.push('Linha ' + n + ': escolha a forma de pagamento.'); return; }
      if (!(v > 0)) { erros.push('Linha ' + n + ' (' + f.nome + '): valor precisa ser maior que zero.'); return; }
      soma += v;
      if (l.forma === 'dinheiro') {
        var ent = l.entregue === '' || l.entregue == null ? v : centavos(l.entregue);
        if (ent < v) erros.push('Linha ' + n + ' (Dinheiro): o cliente entregou menos que o valor.');
        else troco += ent - v;
      } else {
        naoDinheiro += v;
        if (f.confirmar && !l.confirmado) erros.push('Linha ' + n + ' (' + f.nome + '): confirme ' + (f.cartao ? 'o "aprovado" na maquininha.' : 'o crédito no app do banco.'));
        if (l.forma === 'credito') {
          var p = Math.max(1, Math.floor(Number(l.parcelas) || 1));
          if (p > maxParcelas(v / 100, o.parcelas)) erros.push('Linha ' + n + ' (Crédito): no máximo ' + maxParcelas(v / 100, o.parcelas) + 'x para esse valor.');
        }
        if (l.forma === 'vale') vale += v;
      }
    });
    if (vale > centavos(o.valeDisponivel || 0)) erros.push('O cliente tem só ' + formatarPreco(centavos(o.valeDisponivel || 0) / 100) + ' de crédito na loja.');
    if (naoDinheiro > alvo) erros.push('Pix, cartão e vale passaram do total: troco só sai do dinheiro.');
    else if (soma > alvo) erros.push('A soma passou do total. Se o cliente deu mais em dinheiro, ponha o valor certo e o que ele entregou: o troco é calculado.');
    return { ok: !erros.length && soma === alvo, devido: alvo / 100, soma: soma / 100, falta: Math.max(0, alvo - soma) / 100, troco: troco / 100, erros: erros };
  }

  /* ---------- caixa ----------
   * caixa: { fundo, movimentos: [{ tipo, forma, valor }] }
   * tipo: 'entrada' | 'saida' | 'suprimento' | 'sangria'. Troco é saída em dinheiro. */
  function esperadoCaixa(caixa) {
    var e = {};
    Object.keys(FORMAS_PAGAMENTO).forEach(function (f) { e[f] = 0; });
    e.dinheiro = centavos(caixa.fundo || 0);
    (caixa.movimentos || []).forEach(function (m) {
      var v = centavos(m.valor || 0), f = m.tipo === 'suprimento' || m.tipo === 'sangria' ? 'dinheiro' : m.forma;
      if (!(f in e)) e[f] = 0;
      e[f] += m.tipo === 'entrada' || m.tipo === 'suprimento' ? v : -v;
    });
    Object.keys(e).forEach(function (f) { e[f] = e[f] / 100; });
    return e;
  }

  function conferirCaixa(esperado, contado) {
    var linhas = Object.keys(esperado).map(function (f) {
      var es = centavos(esperado[f]), co = centavos((contado || {})[f] || 0);
      return { forma: f, esperado: es / 100, contado: co / 100, diferenca: (co - es) / 100 };
    });
    var total = linhas.reduce(function (s, l) { return s + centavos(l.diferenca); }, 0) / 100;
    return { linhas: linhas, diferenca: total, confere: linhas.every(function (l) { return l.diferenca === 0; }) };
  }

  /* ---------- cadastro de cliente (LGPD) ----------
   * Só o necessário para o contrato de locação (art. 7º, V): identificar quem
   * leva a peça (nome, CPF), falar com ele (WhatsApp) e cobrar se ela não
   * voltar (endereço). E-mail, RG e medidas são opcionais. Marketing pede
   * consentimento à parte (art. 7º, I e art. 8º), nunca marcado de fábrica. */
  // "(91) 98888-7777" ou "91988887777" -> "5591988887777"
  function normalizarWhatsApp(w) {
    var d = String(w || '').replace(/\D/g, '');
    return d.length === 10 || d.length === 11 ? '55' + d : d;
  }

  function mascararCpf(cpf) {
    var d = String(cpf || '').replace(/\D/g, '');
    return d.length === 11 ? '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**' : '';
  }

  function validarCliente(c) {
    var erros = [];
    var e = c.endereco || {};
    if (String(c.nome || '').trim().split(/\s+/).length < 2) erros.push('Nome e sobrenome.');
    if (!cpfValido(c.cpf)) erros.push('CPF válido.');
    if (!numeroWhatsAppValido(normalizarWhatsApp(c.whatsapp))) erros.push('WhatsApp com DDD.');
    if (String(e.cep || '').replace(/\D/g, '').length !== 8) erros.push('CEP com 8 números.');
    if (!String(e.rua || '').trim() || !String(e.numero || '').trim() || !String(e.bairro || '').trim() || !String(e.cidade || '').trim()) erros.push('Endereço completo (rua, número, bairro, cidade).');
    if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) erros.push('E-mail em formato válido (ou deixe em branco).');
    if (!c.avisoPrivacidade) erros.push('Mostrar o aviso de privacidade ao cliente.');
    return erros;
  }

  function somarAnos(iso, anos) {
    var m = RE_ISO.exec(iso || '');
    if (!m) return '';
    var ano = +m[1] + anos, mes = m[2], dia = m[3];
    if (mes === '02' && dia === '29' && !((ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0)) dia = '28';
    return ano + '-' + mes + '-' + dia;
  }

  /* Pode apagar (anonimizar) o cadastro? Não com locação em andamento, nem
   * antes de terminar a guarda depois da última locação (defesa em eventual
   * reclamação: art. 16, I e art. 7º, VI). pedidos: [{ status, devolucao, devolvidaEm }] */
  function situacaoEliminacao(pedidos, hoje, anos) {
    var ativos = pedidos.filter(function (p) { return p.status === 'pendente' || p.status === 'confirmada' || p.status === 'retirada'; });
    if (ativos.length) return { pode: false, motivo: 'locacao', ate: '' };
    var ultima = pedidos.filter(function (p) { return p.status === 'concluida'; })
      .map(function (p) { return p.devolvidaEm || p.devolucao; }).sort().pop();
    if (!ultima) return { pode: true, motivo: '', ate: '' };
    var ate = somarAnos(ultima, anos);
    return hoje >= ate ? { pode: true, motivo: '', ate: ate } : { pode: false, motivo: 'guarda', ate: ate };
  }

  // Tira tudo que identifica a pessoa; o histórico de locações fica, sem nome.
  function anonimizarCliente(c, quando) {
    return {
      id: c.id, anonimizado: true, nome: 'Cliente anonimizado ' + c.id, cpf: '', whatsapp: '', email: '', rg: '',
      endereco: null, medidas: null, credito: 0, marketing: { consentido: false },
      criadoEm: c.criadoEm, anonimizadoEm: quando,
      log: [{ quando: quando, acao: 'Dados pessoais anonimizados a pedido do titular ou fim da guarda' }]
    };
  }

  /* ---------- site: onde estamos ----------
   * horarios: [{ dias: [1,2,3,4,5], abre: '09:00', fecha: '18:00' }] — 0 = domingo. */
  var NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var SCHEMA_DIAS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  function horaCurta(h) { var m = /^(\d{1,2}):(\d{2})$/.exec(h || ''); return m ? Number(m[1]) + 'h' + (m[2] === '00' ? '' : m[2]) : ''; }
  function faixaDias(d) {
    var l = d.slice().sort(function (a, b) { return a - b; });
    var seguidos = l.every(function (x, i) { return i === 0 || x === l[i - 1] + 1; });
    if (l.length === 1) return NOMES_DIAS[l[0]];
    if (seguidos && l.length > 2) return NOMES_DIAS[l[0]] + ' a ' + NOMES_DIAS[l[l.length - 1]].toLowerCase();
    return l.map(function (x, i) { return i ? NOMES_DIAS[x].toLowerCase() : NOMES_DIAS[x]; }).join(', ').replace(/, ([^,]*)$/, ' e $1');
  }
  // ["Segunda a sexta: 9h às 18h", "Sábado: 9h às 13h", "Domingo: fechado"]
  function textoHorarios(horarios) {
    var abertos = {};
    var linhas = (horarios || []).map(function (h) {
      h.dias.forEach(function (d) { abertos[d] = 1; });
      return faixaDias(h.dias) + ': ' + horaCurta(h.abre) + ' às ' + horaCurta(h.fecha);
    });
    var fechados = [0, 1, 2, 3, 4, 5, 6].filter(function (d) { return !abertos[d]; });
    if (fechados.length) linhas.push(faixaDias(fechados) + ': fechado');
    return linhas;
  }
  function diasSemHorario(horarios) {
    var abertos = {};
    (horarios || []).forEach(function (h) { h.dias.forEach(function (d) { abertos[d] = 1; }); });
    return [0, 1, 2, 3, 4, 5, 6].filter(function (d) { return !abertos[d]; });
  }
  function linkMapa(endereco) {
    return endereco ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(endereco) : '';
  }
  // Dados estruturados (schema.org) para o Google mostrar endereço, horário e telefone.
  function dadosEstruturados(cfg, url) {
    var local = cfg.local || {};
    var loja = cfg.lojas[Object.keys(cfg.lojas)[0]];
    var d = { '@context': 'https://schema.org', '@type': 'ClothingStore', name: cfg.nomeSite,
      alternateName: cfg.atelie, description: 'Aluguel de trajes juninos e fantasias.' };
    if (url) d.url = url;
    if (loja.whatsapp) d.telephone = '+' + loja.whatsapp;
    if (local.endereco) d.address = { '@type': 'PostalAddress', streetAddress: local.endereco, addressLocality: local.cidade || '', addressRegion: local.uf || '', addressCountry: 'BR' };
    if ((local.horarios || []).length) d.openingHoursSpecification = local.horarios.map(function (h) {
      return { '@type': 'OpeningHoursSpecification', dayOfWeek: h.dias.map(function (x) { return 'https://schema.org/' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][x]; }), opens: h.abre, closes: h.fecha };
    });
    if (cfg.instagram) d.sameAs = ['https://www.instagram.com/' + cfg.instagram.replace(/^@/, '')];
    return d;
  }

  /* ---------- agenda de prova ----------
   * Horários de prova de um dia: de "abre" até "fecha − duração", de duração em
   * duração. Cada horário comporta "provadores" provas ao mesmo tempo.
   * ocupados: ['09:30', '09:30', '14:00'] (uma entrada por prova marcada). */
  function minutos(h) { var m = /^(\d{1,2}):(\d{2})$/.exec(h || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }
  function hhmm(min) { return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2); }
  function horariosDeProva(dataIso, horarios, duracaoMin, ocupados, provadores) {
    var dsem = diaSemana(dataIso);
    var dur = Math.max(5, Number(duracaoMin) || 30), cap = Math.max(1, Number(provadores) || 1);
    var out = [];
    (horarios || []).filter(function (h) { return h.dias.indexOf(dsem) !== -1; }).forEach(function (h) {
      for (var t = minutos(h.abre); t + dur <= minutos(h.fecha); t += dur) {
        var hora = hhmm(t);
        var usados = (ocupados || []).filter(function (o) { return o === hora; }).length;
        out.push({ hora: hora, usados: usados, livre: usados < cap });
      }
    });
    return out;
  }

  /* ---------- orçamento para grupos ----------
   * d: { nomeSite, id, para, itens: [{ nome, tamanho, preco }], complementos: [{ nome, qtd, preco }],
   *      periodo, valores: { total, sinal, caucao, desconto, percentualSinal }, validoAte } */
  function textoOrcamento(d) {
    var grupos = {}, ordem = [];
    (d.itens || []).forEach(function (it) {
      if (!grupos[it.nome]) { grupos[it.nome] = { n: 0, tams: [], valor: 0 }; ordem.push(it.nome); }
      var g = grupos[it.nome];
      g.n++; g.valor += centavos(it.preco);
      if (g.tams.indexOf(it.tamanho) === -1) g.tams.push(it.tamanho);
    });
    var v = d.valores;
    var l = ['Orçamento ' + d.id + ' — ' + d.nomeSite + (d.para ? '\nPara: ' + d.para : ''), ''];
    if (d.periodo) l.push('Festa: ' + dataComDia(d.periodo.dataFesta) + '\nRetirada: ' + dataComDia(d.periodo.retirada) + ' · Devolução: ' + dataComDia(d.periodo.devolucao), '');
    ordem.forEach(function (nome) {
      var g = grupos[nome];
      l.push('• ' + g.n + '× ' + nome + ' (' + (g.tams.length > 1 ? 'tamanhos ' : 'tamanho ') + ordenarTamanhos(g.tams).join(', ') + '): ' + formatarPreco(g.valor / 100));
    });
    (d.complementos || []).forEach(function (k) { l.push('• ' + (k.qtd || 1) + '× ' + k.nome + ': ' + formatarPreco(centavos(k.preco) * (k.qtd || 1) / 100)); });
    l.push('');
    if (v.desconto) l.push('Desconto: − ' + formatarPreco(v.desconto));
    l.push('Total: ' + formatarPreco(v.total));
    if ((d.itens || []).length) {
      l.push('Sinal para garantir as peças (' + v.percentualSinal + '%): ' + formatarPreco(v.sinal));
      l.push('Caução (volta na devolução): ' + formatarPreco(v.caucao));
    }
    l.push('', 'Válido até ' + dataBR(d.validoAte) + '. As peças só ficam garantidas depois do sinal.');
    return l.join('\n');
  }

  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  function ordenarTamanhos(lista) {
    return lista.slice().sort(function (a, b) {
      return ORDEM_TAMANHOS.indexOf(a) - ORDEM_TAMANHOS.indexOf(b);
    });
  }

  /* Sugere o tamanho pela altura e pelo peso: vale o maior dos dois índices
   * (quem é alto e magro ainda precisa do comprimento). Se a fantasia não tem
   * o tamanho ideal, sobe para o próximo disponível; se não houver maior,
   * devolve null — sugerir um menor seria mentir. */
  function sugerirTamanho(alturaCm, pesoKg, disponiveis) {
    var altura = Number(alturaCm);
    var peso = Number(pesoKg);
    if (!(altura > 0) || !(peso > 0)) return null;

    // Peça infantil usa a tabela de criança; o resto, a de adulto.
    var tabela = ehInfantil(disponiveis) ? TABELA_INFANTIL : TABELA_REFERENCIA;
    var idxAltura = tabela.findIndex(function (l) { return altura <= l[1]; });
    var idxPeso = tabela.findIndex(function (l) { return peso <= l[2]; });
    var ideal = tabela[Math.max(idxAltura, idxPeso)][0];

    var lista = ordenarTamanhos(disponiveis || []);
    if (lista.indexOf(ideal) !== -1) return { tamanho: ideal, ideal: ideal, exato: true };
    var posIdeal = ORDEM_TAMANHOS.indexOf(ideal);
    for (var i = 0; i < lista.length; i++) {
      if (ORDEM_TAMANHOS.indexOf(lista[i]) > posIdeal) {
        return { tamanho: lista[i], ideal: ideal, exato: false };
      }
    }
    return { tamanho: null, ideal: ideal, exato: false };
  }

  /* filtros: { texto, tema, genero, precoMax, tamanho } — todos opcionais. */
  function filtrar(fantasias, filtros) {
    var f = filtros || {};
    var termo = normalizar(f.texto);
    return fantasias.filter(function (x) {
      if (f.tema && x.temas.indexOf(f.tema) === -1) return false;
      if (f.genero && x.genero !== f.genero && x.genero !== 'unissex') return false;
      if (f.publico && (x.publico || 'adulto') !== f.publico) return false;
      if (f.precoMax && x.preco > Number(f.precoMax)) return false;
      if (f.tamanho && !Object.prototype.hasOwnProperty.call(x.tamanhos, f.tamanho)) return false;
      if (termo) {
        var alvo = normalizar([x.nome, x.descricao, x.temas.join(' '), (x.palavras || []).join(' ')].join(' '));
        var partes = termo.split(/\s+/);
        for (var i = 0; i < partes.length; i++) if (alvo.indexOf(partes[i]) === -1) return false;
      }
      return true;
    });
  }

  /* Orçamento estimado. kitIds: ids dos itens do kit marcados.
   * O sinal incide sobre aluguel + kit; a caução é à parte (devolvida). */
  function calcularOrcamento(fantasia, kitIds, percentualSinal, diasExtras) {
    var marcados = (fantasia.kit || []).filter(function (k) { return (kitIds || []).indexOf(k.id) !== -1; });
    var extras = Math.max(0, Math.floor(Number(diasExtras) || 0));
    var extra = centavos(fantasia.diaExtra || 0) * extras;
    var aluguel = centavos(fantasia.preco) + extra;
    var kit = marcados.reduce(function (s, k) { return s + centavos(k.preco); }, 0);
    var total = aluguel + kit;
    var pct = Math.min(50, Math.max(30, Number(percentualSinal) || 30));
    var sinal = Math.round((total * pct) / 100);
    return {
      aluguel: aluguel / 100,
      diasExtras: extras,
      valorDiasExtras: extra / 100,
      kit: kit / 100,
      total: total / 100,
      percentualSinal: pct,
      sinal: sinal / 100,
      saldo: (total - sinal) / 100,
      caucao: centavos(fantasia.caucao) / 100,
      itensKit: marcados
    };
  }

  /* dados: { nomeSite, fantasia, tamanho, dataFesta, periodo, orcamento, indisponivel }
   * indisponivel = o tamanho escolhido não tem unidade livre na data: a mensagem
   * vira pergunta (outra data ou tamanho), para a loja não ler como reserva. */
  function mensagemReserva(dados) {
    var f = dados.fantasia;
    var o = dados.orcamento;
    var p = dados.periodo;
    var linhas = [
      dados.indisponivel
        ? 'Olá! Vi no site ' + dados.nomeSite + ' que esta fantasia está esgotada na minha data. Têm outra data ou tamanho?'
        : 'Olá! Vi no site ' + dados.nomeSite + ' e quero reservar:',
      '',
      '• Fantasia: ' + f.nome + ' (cód. ' + f.id + ')',
      '• Tamanho: ' + (dados.tamanho || 'preciso de ajuda para escolher'),
      '• Data da festa: ' + (dataComDia(dados.dataFesta) || 'ainda não defini')
    ];
    if (p) {
      linhas.push('• Retirada: ' + dataComDia(p.retirada));
      linhas.push('• Devolução: ' + dataComDia(p.devolucao) +
        (p.diasExtras ? ' (' + p.diasExtras + (p.diasExtras === 1 ? ' dia extra' : ' dias extras') + ')' : ''));
    }
    if (o.itensKit.length) {
      linhas.push('• Kit: ' + o.itensKit.map(function (k) { return k.nome; }).join(', '));
    }
    linhas.push('• Total estimado: ' + formatarPreco(o.total) + ' (sinal de ' + o.percentualSinal + '%: ' + formatarPreco(o.sinal) + ')');
    linhas.push('• Caução: ' + formatarPreco(o.caucao));
    linhas.push('', dados.indisponivel ? 'Obrigado!' : (p ? 'Pelo site aparece disponível. Podem confirmar?' : 'Está disponível nessa data?'));
    return linhas.join('\n');
  }


  function numeroWhatsAppValido(numero) {
    return /^55\d{10,11}$/.test(String(numero || ''));
  }

  function linkWhatsApp(numero, texto) {
    return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto);
  }

  return {
    ORDEM_TAMANHOS: ORDEM_TAMANHOS,
    TAMANHOS_INFANTIS: TAMANHOS_INFANTIS,
    ehInfantil: ehInfantil,
    formatarPreco: formatarPreco,
    dataBR: dataBR,
    diasEntre: diasEntre,
    normalizar: normalizar,
    ordenarTamanhos: ordenarTamanhos,
    sugerirTamanho: sugerirTamanho,
    filtrar: filtrar,
    calcularOrcamento: calcularOrcamento,
    somarDias: somarDias,
    diaSemana: diaSemana,
    dataComDia: dataComDia,
    periodoAluguel: periodoAluguel,
    unidades: unidades,
    disponibilidade: disponibilidade,
    tamanhosLivres: tamanhosLivres,
    proximaDataLivre: proximaDataLivre,
    validarAgenda: validarAgenda,
    kitLivres: kitLivres,
    textoHorarios: textoHorarios,
    textoOrcamento: textoOrcamento,
    horariosDeProva: horariosDeProva,
    diasSemHorario: diasSemHorario,
    linkMapa: linkMapa,
    dadosEstruturados: dadosEstruturados,
    cpfValido: cpfValido,
    FORMAS_PAGAMENTO: FORMAS_PAGAMENTO,
    dividirParcelas: dividirParcelas,
    maxParcelas: maxParcelas,
    taxaEstimada: taxaEstimada,
    validarPagamentos: validarPagamentos,
    esperadoCaixa: esperadoCaixa,
    conferirCaixa: conferirCaixa,
    mascararCpf: mascararCpf,
    normalizarWhatsApp: normalizarWhatsApp,
    validarCliente: validarCliente,
    somarAnos: somarAnos,
    situacaoEliminacao: situacaoEliminacao,
    anonimizarCliente: anonimizarCliente,
    acertoDevolucao: acertoDevolucao,
    reembolsoCancelamento: reembolsoCancelamento,
    situacaoUnidade: situacaoUnidade,
    mensagemReserva: mensagemReserva,
    numeroWhatsAppValido: numeroWhatsAppValido,
    linkWhatsApp: linkWhatsApp
  };
});
