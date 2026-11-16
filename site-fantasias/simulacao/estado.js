/* Simulação — o "banco" da loja, guardado neste navegador.
 * Roda depois de logica.js e antes de app.js. Faz o papel que o Supabase vai
 * ter no MVP: reservas com status, pagamentos e vistorias. O site do cliente e o
 * painel do ateliê leem e escrevem aqui, então um pedido feito no site aparece
 * no painel, e um aluguel feito no balcão baixa o estoque que o cliente vê.
 *
 * Reservas de exemplo (agenda_exemplo.js) têm status "auto": o status sai das
 * datas em relação ao dia de trabalho escolhido no painel. Quando o painel age
 * sobre uma delas, a mudança fica gravada por cima. */
(function () {
  'use strict';
  var L = window.Logica;
  var C = window.CONFIG;
  var CHAVE = 'simulacao-cantinho-v2';
  var MINUTOS_PENDENTE = 30;

  var NOMES = ['Ana', 'Bruna', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Hugo', 'Isabela', 'João',
    'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sabrina', 'Tiago', 'Vanessa', 'Wesley'];
  var SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Lima', 'Carvalho', 'Ribeiro', 'Gomes'];

  function hojeReal() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function fantasiaDe(id) { return window.FANTASIAS.find(function (f) { return f.id === id; }); }
  function lojaDe(f) { return C.lojas[f.loja]; }
  function margemDe(f) { var l = lojaDe(f); return l.margemHigienizacao == null ? 1 : l.margemHigienizacao; }

  var exemplo = (window.AGENDA || []).map(function (r, i) {
    var f = fantasiaDe(r.fantasia);
    var o = L.calcularOrcamento(f, [], lojaDe(f).sinal, 0);
    return {
      id: 'E' + ('000' + (i + 1)).slice(-3), n: i, origem: 'exemplo', status: 'auto',
      cliente: { nome: NOMES[(i * 7) % NOMES.length] + ' ' + SOBRENOMES[(i * 3) % SOBRENOMES.length], whatsapp: '5591900' + ('00000' + (i * 137 % 99999)).slice(-5) + '0', cpf: '' },
      fantasia: r.fantasia, tamanho: r.tamanho, unidade: r.unidade, retirada: r.retirada, devolucao: r.devolucao,
      diasExtras: 0, kit: [], valores: { total: o.total, sinal: o.sinal, caucao: o.caucao },
      pagamentos: [], vistorias: {}
    };
  });

  // Sempre um objeto novo: reaproveitar arrays entre estados faria "Recomeçar" não apagar nada.
  function estadoNovo(dia) { return { criadas: [], alteracoes: {}, seq: 1, dia: dia || hojeReal() }; }
  var estado;
  try { estado = Object.assign(estadoNovo(), JSON.parse(localStorage.getItem(CHAVE)) || {}); } catch (e) { estado = estadoNovo(); }
  var ouvintes = [];
  var avisoArmazenamento = '';

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
      avisoArmazenamento = '';
    } catch (e) {
      avisoArmazenamento = 'O navegador não guardou a simulação (fotos ocupam espaço). Ela vale até fechar a página.';
    }
  }

  /* Status de uma reserva de exemplo no dia de trabalho. No dia da retirada ela
   * ainda está esperando o cliente (aparece em "Saem hoje"); do dia seguinte até
   * a devolução, está com ele. Uma em cada 23 fica "esquecida" com o cliente por
   * até 3 dias, para o painel ter atraso a mostrar. */
  function statusAuto(r, dia) {
    if (dia <= r.retirada) return { status: 'confirmada' };
    if (dia <= r.devolucao) return { status: 'retirada' };
    if (r.n % 23 === 0 && L.diasEntre(r.devolucao, dia) <= 3) return { status: 'retirada' };
    return { status: 'concluida', devolvidaEm: r.devolucao };
  }

  function resolver(r, dia) {
    var x = Object.assign({}, r, estado.alteracoes[r.id] || {});
    if (x.status === 'auto') Object.assign(x, statusAuto(x, dia));
    if (x.status === 'pendente' && x.expiraEm && Date.now() > x.expiraEm) x.status = 'expirada';
    return x;
  }

  function todas(dia) {
    var d = dia || estado.dia;
    return exemplo.concat(estado.criadas).map(function (r) { return resolver(r, d); });
  }

  /* Bloqueios para o cálculo de disponibilidade. Peça atrasada continua
   * bloqueada até o dia de trabalho: ela não voltou. */
  function agendaBloqueios() {
    var dia = estado.dia;
    return todas(dia).filter(function (r) {
      return r.status === 'pendente' || r.status === 'confirmada' || r.status === 'retirada' || r.status === 'concluida';
    }).map(function (r) {
      var fim = r.status === 'retirada' && dia > r.devolucao ? dia : r.devolucao;
      return { fantasia: r.fantasia, tamanho: r.tamanho, unidade: r.unidade, retirada: r.retirada, devolucao: fim };
    });
  }

  function publicar() {
    window.AGENDA = agendaBloqueios();
    if (window.FantasiaApp) window.FantasiaApp.atualizar();
    ouvintes.forEach(function (fn) { try { fn(); } catch (e) { /* um ouvinte não derruba os outros */ } });
  }

  function mudar(id, patch) {
    var criada = estado.criadas.find(function (r) { return r.id === id; });
    if (criada) Object.assign(criada, patch);
    else estado.alteracoes[id] = Object.assign(estado.alteracoes[id] || {}, patch);
    salvar();
    publicar();
  }

  function porId(id) { return todas().find(function (r) { return r.id === id; }); }

  function novoId() {
    var id = 'R' + ('000' + estado.seq).slice(-4);
    estado.seq++;
    return id;
  }

  function pagamento(tipo, valor, forma) {
    return { tipo: tipo, valor: Math.round(Number(valor) * 100) / 100, forma: forma || 'Pix', dia: estado.dia, hora: Date.now() };
  }

  var API = {
    MINUTOS_PENDENTE: MINUTOS_PENDENTE,
    FORMAS: ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'],
    dia: function () { return estado.dia; },
    definirDia: function (iso) { if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { estado.dia = iso; salvar(); publicar(); } },
    todas: todas,
    porId: porId,
    fantasiaDe: fantasiaDe,
    margemDe: margemDe,
    aviso: function () { return avisoArmazenamento; },
    aoMudar: function (fn) { ouvintes.push(fn); },

    // Pedido feito pelo site: segura a peça por 30 minutos esperando o sinal.
    criarPedidoSite: function (p) {
      var r = {
        id: novoId(), origem: 'site', status: 'pendente', expiraEm: Date.now() + MINUTOS_PENDENTE * 60000, criadoEm: Date.now(),
        cliente: { nome: '', whatsapp: '', cpf: '' },
        fantasia: p.fantasia, tamanho: p.tamanho, unidade: p.unidade, retirada: p.retirada, devolucao: p.devolucao,
        dataFesta: p.dataFesta, diasExtras: p.diasExtras || 0, kit: p.kit || [],
        valores: { total: p.total, sinal: p.sinal, caucao: p.caucao }, pagamentos: [], vistorias: {}
      };
      estado.criadas.push(r); salvar(); publicar();
      return r;
    },

    confirmarSinal: function (id, d) {
      var r = porId(id);
      mudar(id, {
        status: 'confirmada', expiraEm: null,
        cliente: Object.assign({}, r.cliente, d.cliente || {}),
        pagamentos: (r.pagamentos || []).concat([pagamento('sinal', r.valores.sinal, d.forma)])
      });
    },

    // Aluguel no balcão. d.recebido: { tipo: 'sinal' | 'total', forma }.
    criarBalcao: function (d) {
      var r = {
        id: novoId(), origem: 'balcao', status: 'confirmada', criadoEm: Date.now(),
        cliente: d.cliente, fantasia: d.fantasia, tamanho: d.tamanho, unidade: d.unidade,
        retirada: d.retirada, devolucao: d.devolucao, dataFesta: d.dataFesta, diasExtras: d.diasExtras || 0, kit: d.kit || [],
        valores: { total: d.total, sinal: d.sinal, caucao: d.caucao },
        pagamentos: [pagamento(d.recebido.tipo, d.recebido.tipo === 'total' ? d.total : d.sinal, d.recebido.forma)],
        vistorias: {}
      };
      estado.criadas.push(r); salvar(); publicar();
      return r;
    },

    // Quanto falta receber do aluguel (sem contar a caução).
    saldo: function (r) {
      var pago = (r.pagamentos || []).filter(function (p) { return p.tipo === 'sinal' || p.tipo === 'saldo' || p.tipo === 'total'; })
        .reduce(function (s, p) { return s + Math.round(p.valor * 100); }, 0);
      if (r.origem === 'exemplo' && !(r.pagamentos || []).length) pago = Math.round(r.valores.sinal * 100); // exemplo: sinal já pago
      return Math.max(0, Math.round(r.valores.total * 100) - pago) / 100;
    },
    caucaoRecebida: function (r) {
      return (r.pagamentos || []).some(function (p) { return p.tipo === 'caucao'; });
    },

    registrarRetirada: function (id, d) {
      var r = porId(id);
      var novos = [];
      if (d.saldo && d.saldo.valor > 0) novos.push(pagamento('saldo', d.saldo.valor, d.saldo.forma));
      if (d.caucao && d.caucao.valor > 0) novos.push(pagamento('caucao', d.caucao.valor, d.caucao.forma));
      mudar(id, {
        status: 'retirada', retiradoEm: estado.dia,
        pagamentos: (r.pagamentos || []).concat(novos),
        vistorias: Object.assign({}, r.vistorias, { retirada: d.vistoria })
      });
    },

    registrarDevolucao: function (id, d) {
      var r = porId(id);
      var novos = [];
      if (d.acerto.devolver > 0) novos.push(pagamento('caucao_devolvida', d.acerto.devolver, d.forma));
      if (d.acerto.cobrar > 0) novos.push(pagamento('cobranca', d.acerto.cobrar, d.formaCobranca || d.forma));
      mudar(id, {
        status: 'concluida', devolvidaEm: estado.dia,
        acerto: d.acerto, danos: d.danos,
        pagamentos: (r.pagamentos || []).concat(novos),
        vistorias: Object.assign({}, r.vistorias, { devolucao: d.vistoria })
      });
    },

    cancelar: function (id, d) {
      var r = porId(id);
      var novos = d && d.estorno > 0 ? [pagamento('estorno', d.estorno, d.forma)] : [];
      mudar(id, { status: 'cancelada', canceladoEm: estado.dia, motivo: (d && d.motivo) || '', pagamentos: (r.pagamentos || []).concat(novos) });
    },

    zerar: function () {
      estado = estadoNovo(estado.dia);
      salvar(); publicar();
    }
  };

  window.SIM_LOJA = API;
  window.AGENDA = agendaBloqueios();
  // Pedido pendente expira sozinho: a cada minuto a vitrine é recalculada.
  setInterval(function () {
    var mudou = false;
    estado.criadas.forEach(function (r) {
      if (r.status === 'pendente' && r.expiraEm && Date.now() > r.expiraEm) { r.status = 'expirada'; mudou = true; }
    });
    if (mudou) { salvar(); publicar(); }
  }, 60000);
})();
