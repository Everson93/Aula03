/* Simulação — o "banco" do ateliê, guardado neste navegador.
 * Roda depois de logica.js e antes de app.js. Faz o papel que o banco de dados
 * vai ter no sistema de verdade:
 *   pedidos  — uma ou mais peças alugadas + complementos, com pagamentos e vistorias
 *   clientes — cadastro mínimo (LGPD), consentimento de marketing, crédito na loja
 *   caixas   — abertura, entradas e saídas por forma, sangria, suprimento, fechamento
 *   pedidos do titular — ver, corrigir, apagar, revogar (prazo de resposta)
 * O site do cliente e o painel do ateliê leem e escrevem aqui.
 *
 * Pedidos de exemplo (agenda_exemplo.js) têm status "auto": sai das datas em
 * relação ao dia de trabalho do painel. O que o painel faz neles fica gravado por cima. */
(function () {
  'use strict';
  var L = window.Logica;
  var C = window.CONFIG;
  var CHAVE = 'simulacao-cantinho-v3';
  var MINUTOS_PENDENTE = 30;
  var ATIVOS = ['pendente', 'confirmada', 'retirada'];

  var NOMES = ['Ana', 'Bruna', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Hugo', 'Isabela', 'João',
    'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sabrina', 'Tiago', 'Vanessa', 'Wesley'];
  var SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Lima', 'Carvalho', 'Ribeiro', 'Gomes'];
  var RUAS = ['Rua das Flores', 'Travessa São João', 'Avenida Central', 'Rua do Arraial', 'Passagem Boa Vista'];
  var BAIRROS = ['Centro', 'Jardim', 'Vila Nova', 'Umarizal', 'Pedreira'];

  function hojeReal() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function fantasiaDe(id) { return window.FANTASIAS.find(function (f) { return f.id === id; }); }
  function lojaDe(f) { return C.lojas[f.loja]; }
  function margemDe(f) { var l = lojaDe(f); return l.margemHigienizacao == null ? 1 : l.margemHigienizacao; }
  function cent(v) { return Math.round(Number(v || 0) * 100); }

  // CPF de exemplo com dígitos verificadores certos (só para a simulação).
  function cpfExemplo(n) {
    var d = String(100000000 + (n * 7919) % 899999999).split('').map(Number);
    for (var t = 9; t < 11; t++) {
      var s = 0;
      for (var i = 0; i < t; i++) s += d[i] * (t + 1 - i);
      d.push((s * 10) % 11 % 10);
    }
    return d.join('');
  }

  /* ---------- clientes e pedidos de exemplo ---------- */
  var clientesExemplo = [];
  var clientePorNome = {};
  function clienteExemplo(nome) {
    if (clientePorNome[nome]) return clientePorNome[nome];
    var n = clientesExemplo.length + 1;
    var c = {
      id: 'CE' + ('00' + n).slice(-3), origem: 'exemplo', nome: nome, cpf: cpfExemplo(n),
      whatsapp: '5591' + (900000000 + n * 7351 % 99999999), email: '', rg: '',
      endereco: { cep: '66' + ('00000' + (n * 377 % 99999)).slice(-6), rua: RUAS[n % RUAS.length], numero: String(10 + n * 3), bairro: BAIRROS[n % BAIRROS.length], cidade: C.cidade === 'sua cidade' ? 'Belém' : C.cidade, uf: 'PA', complemento: '' },
      medidas: null, credito: 0,
      avisoPrivacidade: { em: '2026-10-01', versao: C.lgpd.versaoAviso },
      marketing: n % 3 === 0 ? { consentido: true, em: '2026-10-01', versao: C.lgpd.versaoAviso, por: 'Néia', canal: 'WhatsApp' } : { consentido: false },
      criadoEm: '2026-10-01', log: [{ quando: '2026-10-01', quem: 'Néia', acao: 'Cadastro criado no balcão (exemplo)' }]
    };
    clientesExemplo.push(c);
    clientePorNome[nome] = c;
    return c;
  }

  function item(f, tamanho, unidade) {
    return { fantasia: f.id, tamanho: tamanho, unidade: unidade, preco: f.preco, diaExtra: f.diaExtra, caucao: f.caucao };
  }

  var exemplo = (window.AGENDA || []).map(function (r, i) {
    var f = fantasiaDe(r.fantasia);
    var o = L.calcularOrcamento(f, [], lojaDe(f).sinal, 0);
    var cli = clienteExemplo(NOMES[(i * 7) % NOMES.length] + ' ' + SOBRENOMES[(i * 3) % SOBRENOMES.length]);
    return {
      id: 'E' + ('000' + (i + 1)).slice(-3), n: i, origem: 'exemplo', status: 'auto', clienteId: cli.id,
      retirada: r.retirada, devolucao: r.devolucao, dataFesta: '', diasExtras: 0,
      itens: [item(f, r.tamanho, r.unidade)], complementos: [], desconto: { valor: 0, motivo: '' },
      valores: { aluguel: o.aluguel, extras: 0, complementos: 0, desconto: 0, total: o.total, sinal: o.sinal, caucao: o.caucao },
      pagamentos: [], vistorias: {}
    };
  });

  /* ---------- estado guardado ---------- */
  function estadoNovo(dia) {
    return { dia: dia || hojeReal(), operador: ((C.operadores || [])[0] || { nome: 'Atendente' }).nome, seq: { P: 1, C: 1, X: 1, S: 1, M: 1, B: 1, A: 1, O: 1, W: 1 },
      pedidos: [], alteracoes: {}, clientes: [], clientesAlt: {}, caixas: [], solicitacoes: [], bloqueios: [], provas: [], orcamentos: [], espera: [] };
  }
  var estado;
  try {
    var salvo = JSON.parse(localStorage.getItem(CHAVE)) || {};
    estado = Object.assign(estadoNovo(), salvo);
    estado.seq = Object.assign(estadoNovo().seq, salvo.seq || {});
    ['B', 'A', 'O', 'W'].forEach(function (k) { if (!estado.seq[k]) estado.seq[k] = 1; });
    estado.bloqueios = estado.bloqueios || [];
    estado.provas = estado.provas || [];
    estado.orcamentos = estado.orcamentos || [];
    estado.espera = estado.espera || [];
  } catch (e) { estado = estadoNovo(); }
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
  function novoId(letra, tam) {
    var n = estado.seq[letra]++;
    return letra + ('0000' + n).slice(-(tam || 4));
  }
  function agora() { return Date.now(); }

  /* ---------- pedidos ---------- */
  function statusAuto(p, dia) {
    if (dia <= p.retirada) return { status: 'confirmada' };
    if (dia <= p.devolucao) return { status: 'retirada' };
    if (p.n % 23 === 0 && L.diasEntre(p.devolucao, dia) <= 3) return { status: 'retirada' };
    return { status: 'concluida', devolvidaEm: p.devolucao };
  }
  function resolver(p, dia) {
    var x = Object.assign({}, p, estado.alteracoes[p.id] || {});
    if (x.status === 'auto') Object.assign(x, statusAuto(x, dia));
    if (x.status === 'pendente' && x.expiraEm && agora() > x.expiraEm) x.status = 'expirada';
    return x;
  }
  function todos(dia) {
    var d = dia || estado.dia;
    return exemplo.concat(estado.pedidos).map(function (p) { return resolver(p, d); });
  }
  function porId(id) { return todos().find(function (p) { return p.id === id; }); }

  // Uma linha por peça física: é o que a disponibilidade e o acervo enxergam.
  function linhasPorPeca(lista) {
    var out = [];
    lista.forEach(function (p) {
      (p.itens || []).forEach(function (it) {
        out.push({ pedido: p, id: p.id, unidade: it.unidade, fantasia: it.fantasia, tamanho: it.tamanho,
          status: p.status, retirada: p.retirada, devolucao: p.devolucao, devolvidaEm: p.devolvidaEm, clienteId: p.clienteId, cliente: p.cliente });
      });
    });
    return out;
  }
  // Bloqueio manual (conserto, ajuste...): ocupa de "de" até "ate", sem margem extra depois.
  function bloqueiosAtivos() { return estado.bloqueios.filter(function (b) { return !b.liberadoEm; }); }
  function agendaBloqueios() {
    var dia = estado.dia;
    var reservas = linhasPorPeca(todos(dia)).filter(function (r) {
      return r.status === 'pendente' || r.status === 'confirmada' || r.status === 'retirada' || r.status === 'concluida';
    }).map(function (r) {
      var fim = r.status === 'retirada' && dia > r.devolucao ? dia : r.devolucao;
      return { fantasia: r.fantasia, tamanho: r.tamanho, unidade: r.unidade, retirada: r.retirada, devolucao: fim };
    });
    return reservas.concat(bloqueiosAtivos().map(function (b) {
      var f = fantasiaDe(b.fantasia);
      return { fantasia: b.fantasia, tamanho: b.tamanho, unidade: b.unidade, retirada: b.de, devolucao: L.somarDias(b.ate, -margemDe(f)), bloqueio: b.id };
    }));
  }

  // Acessórios alugados em cada pedido ativo ou já devolvido (para o pico de uso por dia).
  function agendaKits() {
    var dia = estado.dia;
    var out = [];
    todos(dia).forEach(function (p) {
      if (['pendente', 'confirmada', 'retirada', 'concluida'].indexOf(p.status) === -1) return;
      (p.complementos || []).forEach(function (k) {
        if (k.tipo !== 'aluguel' || !k.kitId) return;
        out.push({ fantasia: k.fantasia, kitId: k.kitId, qtd: k.qtd || 1, retirada: p.retirada,
          devolucao: p.status === 'retirada' && dia > p.devolucao ? dia : p.devolucao });
      });
    });
    return out;
  }
  function kitLivres(fantasiaId, kitId, periodo) {
    var f = fantasiaDe(fantasiaId);
    var k = f && (f.kit || []).find(function (x) { return x.id === kitId; });
    if (!k) return 0;
    var reservas = agendaKits().filter(function (r) { return r.fantasia === fantasiaId && r.kitId === kitId; });
    return L.kitLivres(k.estoque, reservas, periodo, margemDe(f));
  }

  function publicar() {
    window.AGENDA = agendaBloqueios();
    window.AGENDA_KITS = agendaKits();
    if (window.FantasiaApp) window.FantasiaApp.atualizar();
    ouvintes.forEach(function (fn) { try { fn(); } catch (e) { /* um ouvinte não derruba os outros */ } });
  }
  function mudar(id, patch) {
    var criado = estado.pedidos.find(function (p) { return p.id === id; });
    if (criado) Object.assign(criado, patch);
    else estado.alteracoes[id] = Object.assign(estado.alteracoes[id] || {}, patch);
    salvar(); publicar();
  }

  /* ---------- clientes ---------- */
  function clientes() {
    return clientesExemplo.concat(estado.clientes).map(function (c) {
      return Object.assign({}, c, estado.clientesAlt[c.id] || {});
    });
  }
  function clientePorId(id) { return clientes().find(function (c) { return c.id === id; }); }
  function mudarCliente(id, patch, acao) {
    var atual = clientePorId(id);
    var log = (atual.log || []).concat(acao ? [{ quando: estado.dia, hora: agora(), quem: estado.operador, acao: acao }] : []);
    var p = Object.assign({}, patch, { log: log, atualizadoEm: estado.dia });
    var criado = estado.clientes.find(function (c) { return c.id === id; });
    if (criado) Object.assign(criado, p);
    else estado.clientesAlt[id] = Object.assign(estado.clientesAlt[id] || {}, p);
    salvar(); publicar();
  }

  /* ---------- caixa ---------- */
  // Regra de acesso conferida também aqui, não só na tela: botão escondido não é segurança.
  function exigir(acao) {
    if (!L.pode(estado.operador, acao, C.operadores, C.permissoes)) throw new Error('Sem permissão: ' + acao);
  }

  function caixaAberto() { return estado.caixas.find(function (c) { return !c.fechadoEm; }) || null; }
  function movimento(tipo, forma, valor, motivo, ref, parcelas) {
    var cx = caixaAberto();
    if (!cx) throw new Error('Caixa fechado');
    // Caixa é do dia: o de ontem precisa ser conferido e fechado antes de receber hoje.
    if (cx.abertoEm.dia !== estado.dia) throw new Error('Caixa de outro dia');
    cx.movimentos.push({ id: novoId('M', 5), tipo: tipo, forma: forma, valor: cent(valor) / 100, motivo: motivo || '', ref: ref || '', parcelas: parcelas || 1, dia: estado.dia, hora: agora(), quem: estado.operador });
  }

  /* Recebe as linhas de pagamento de um pedido: cada uma vira pagamento no
   * pedido e entrada no caixa; o troco sai do caixa em dinheiro; vale abate
   * do crédito do cliente. */
  function receber(p, tipo, linhas) {
    var novos = [];
    var troco = 0;
    linhas.forEach(function (l) {
      var v = cent(l.valor) / 100;
      novos.push({ tipo: tipo, forma: l.forma, valor: v, parcelas: l.forma === 'credito' ? Math.max(1, Number(l.parcelas) || 1) : 1,
        nsu: l.nsu || '', dia: estado.dia, hora: agora(), quem: estado.operador });
      // Dinheiro entra pelo que o cliente entregou; o troco sai em seguida.
      var entregue = l.forma === 'dinheiro' && l.entregue != null && l.entregue !== '' ? cent(l.entregue) : cent(v);
      movimento('entrada', l.forma, entregue / 100, rotulo(tipo) + ' · ' + p.id, p.id, l.forma === 'credito' ? Math.max(1, Number(l.parcelas) || 1) : 1);
      troco += entregue - cent(v);
      if (l.forma === 'vale' && p.clienteId) {
        var c = clientePorId(p.clienteId);
        mudarCliente(c.id, { credito: (cent(c.credito) - cent(v)) / 100 }, 'Usou ' + L.formatarPreco(v) + ' de crédito na loja no pedido ' + p.id);
      }
    });
    if (troco > 0) movimento('saida', 'dinheiro', troco / 100, 'Troco · ' + p.id, p.id);
    return (p.pagamentos || []).concat(novos);
  }
  function pagar(p, tipo, forma, valor) {
    movimento('saida', forma, valor, rotulo(tipo) + ' · ' + p.id, p.id);
    return { tipo: tipo, forma: forma, valor: cent(valor) / 100, parcelas: 1, dia: estado.dia, hora: agora(), quem: estado.operador };
  }
  function rotulo(tipo) {
    return { sinal: 'Sinal', saldo: 'Saldo do aluguel', total: 'Pedido pago', caucao: 'Caução recebida', cobranca: 'Cobrança de dano/atraso',
      caucao_devolvida: 'Caução devolvida', estorno: 'Estorno de sinal' }[tipo] || tipo;
  }

  function pagoAluguel(p) {
    var pago = (p.pagamentos || []).filter(function (x) { return x.tipo === 'sinal' || x.tipo === 'saldo' || x.tipo === 'total'; })
      .reduce(function (s, x) { return s + cent(x.valor); }, 0);
    var temSinal = (p.pagamentos || []).some(function (x) { return x.tipo === 'sinal' || x.tipo === 'total'; });
    if (p.origem === 'exemplo' && !temSinal) pago += cent(p.valores.sinal); // exemplo: sinal já pago antes
    return pago;
  }

  /* Valores de um pedido montado no balcão. itens: peças; complementos: [{ fantasia, kitId, qtd }]. */
  function calcularPedido(d) {
    var extras = Math.max(0, d.diasExtras || 0);
    var aluguel = 0, ext = 0, caucao = 0, comp = 0;
    d.itens.forEach(function (it) { aluguel += cent(it.preco); ext += cent(it.diaExtra) * extras; caucao += cent(it.caucao); });
    (d.complementos || []).forEach(function (k) { comp += cent(k.preco) * (k.qtd || 1); });
    var bruto = aluguel + ext + comp;
    var desc = Math.min(bruto, Math.max(0, cent(d.desconto && d.desconto.valor)));
    var total = bruto - desc;
    var pct = C.lojas[Object.keys(C.lojas)[0]].sinal;
    return { aluguel: aluguel / 100, extras: ext / 100, complementos: comp / 100, desconto: desc / 100, total: total / 100,
      sinal: Math.round(total * pct / 100) / 100, caucao: caucao / 100, percentualSinal: pct };
  }

  var API = {
    MINUTOS_PENDENTE: MINUTOS_PENDENTE,
    ATIVOS: ATIVOS,
    dia: function () { return estado.dia; },
    definirDia: function (iso) { if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { estado.dia = iso; salvar(); publicar(); } },
    operador: function () { return estado.operador; },
    papel: function () { return L.papelDe(estado.operador, C.operadores); },
    pode: function (acao) { return L.pode(estado.operador, acao, C.operadores, C.permissoes); },
    definirOperador: function (nome) { estado.operador = nome; salvar(); publicar(); },
    aviso: function () { return avisoArmazenamento; },
    aoMudar: function (fn) { ouvintes.push(fn); },
    fantasiaDe: fantasiaDe,
    margemDe: margemDe,
    calcularPedido: calcularPedido,
    kitLivres: kitLivres,

    todos: todos,
    todas: todos,
    porId: porId,
    linhasPorPeca: function () { return linhasPorPeca(todos()); },
    saldo: function (p) { return Math.max(0, cent(p.valores.total) - pagoAluguel(p)) / 100; },
    caucaoRecebida: function (p) { return p.origem === 'exemplo' && p.status === 'retirada' ? true : (p.pagamentos || []).some(function (x) { return x.tipo === 'caucao'; }); },
    nomeCliente: function (p) {
      if (p.clienteId) { var c = clientePorId(p.clienteId); if (c) return c.nome; }
      return p.nomeSite || 'Cliente do site (sem cadastro)';
    },

    // Pedido feito pelo site: segura a peça por 30 minutos esperando o sinal.
    criarPedidoSite: function (d) {
      var f = fantasiaDe(d.fantasia);
      var p = {
        id: novoId('P'), origem: 'site', status: 'pendente', expiraEm: agora() + MINUTOS_PENDENTE * 60000, criadoEm: agora(),
        clienteId: null, retirada: d.retirada, devolucao: d.devolucao, dataFesta: d.dataFesta, diasExtras: d.diasExtras || 0,
        itens: [item(f, d.tamanho, d.unidade)],
        complementos: (d.kit || []).map(function (k) { var x = f.kit.find(function (y) { return y.id === k; }); return { fantasia: f.id, kitId: k, nome: x.nome, tipo: x.tipo, preco: x.preco, qtd: 1 }; }),
        desconto: { valor: 0, motivo: '' },
        valores: { aluguel: f.preco, extras: (d.diasExtras || 0) * f.diaExtra, complementos: 0, desconto: 0, total: d.total, sinal: d.sinal, caucao: d.caucao },
        pagamentos: [], vistorias: {}
      };
      estado.pedidos.push(p); salvar(); publicar();
      return p;
    },

    confirmarSinal: function (id, d) {
      var p = porId(id);
      mudar(id, { status: 'confirmada', expiraEm: null, clienteId: d.clienteId, pagamentos: receber(Object.assign({}, p, { clienteId: d.clienteId }), 'sinal', d.linhas) });
    },

    /* Pedido no balcão. d: { clienteId, periodo, itens, complementos, desconto, recebe: 'sinal'|'total', linhas } */
    criarPedidoBalcao: function (d) {
      var v = calcularPedido({ itens: d.itens, complementos: d.complementos, desconto: d.desconto, diasExtras: d.periodo ? d.periodo.diasExtras : 0 });
      var soVenda = !d.itens.length;
      if (soVenda && (d.complementos || []).some(function (k) { return k.tipo === 'aluguel'; })) {
        throw new Error('Acessório de aluguel só vai junto com uma peça alugada');
      }
      var p = {
        id: novoId('P'), origem: 'balcao', status: soVenda ? 'concluida' : 'confirmada', criadoEm: agora(), clienteId: d.clienteId,
        retirada: d.periodo ? d.periodo.retirada : estado.dia, devolucao: d.periodo ? d.periodo.devolucao : estado.dia,
        devolvidaEm: soVenda ? estado.dia : undefined,
        dataFesta: d.periodo ? d.periodo.dataFesta : '', diasExtras: d.periodo ? d.periodo.diasExtras : 0,
        itens: d.itens, complementos: d.complementos || [], desconto: d.desconto || { valor: 0, motivo: '' },
        valores: v, pagamentos: [], vistorias: {}
      };
      p.pagamentos = receber(p, soVenda || d.recebe === 'total' ? 'total' : 'sinal', d.linhas);
      estado.pedidos.push(p); salvar(); publicar();
      return p;
    },

    /* Entrega. Serve também para pedido do site ainda sem sinal (cliente veio
     * pagar tudo na loja): sem pagamento anterior, o aluguel inteiro entra como saldo. */
    registrarRetirada: function (id, d) {
      var p = porId(id);
      if (!p.clienteId && d.clienteId) p = Object.assign({}, p, { clienteId: d.clienteId }); // vale do cliente precisa dele vinculado
      var pags = p.pagamentos || [];
      if (d.linhasSaldo && d.linhasSaldo.length) pags = receber(Object.assign({}, p, { pagamentos: pags }), 'saldo', d.linhasSaldo);
      if (d.linhasCaucao && d.linhasCaucao.length) pags = receber(Object.assign({}, p, { pagamentos: pags }), 'caucao', d.linhasCaucao);
      var patch = { status: 'retirada', retiradoEm: estado.dia, expiraEm: null, pagamentos: pags, vistorias: Object.assign({}, p.vistorias, { retirada: d.vistoria }) };
      if (d.clienteId) patch.clienteId = d.clienteId; // quem reservou pelo site e se cadastrou no balcão
      mudar(id, patch);
    },

    registrarDevolucao: function (id, d) {
      var p = porId(id);
      var pags = (p.pagamentos || []).slice();
      if (d.acerto.devolver > 0) pags.push(pagar(p, 'caucao_devolvida', d.forma, d.acerto.devolver));
      if (d.acerto.cobrar > 0 && d.linhasCobranca) pags = receber(Object.assign({}, p, { pagamentos: pags }), 'cobranca', d.linhasCobranca);
      mudar(id, { status: 'concluida', devolvidaEm: estado.dia, acerto: d.acerto, danos: d.danos, pagamentos: pags,
        vistorias: Object.assign({}, p.vistorias, { devolucao: d.vistoria }) });
    },

    /* Cancelamento: até 7 dias antes, estorno do sinal; depois, o sinal vira crédito na loja (política). */
    cancelar: function (id, d) {
      var p = porId(id);
      if (p.status !== 'pendente') exigir('cancelarPedido'); // recusar pedido do site sem sinal é livre
      var pags = (p.pagamentos || []).slice();
      var pago = pagoAluguel(p) / 100;
      var rb = L.reembolsoCancelamento(pago, p.retirada, estado.dia);
      var patch = { status: 'cancelada', canceladoEm: estado.dia, motivo: (d && d.motivo) || '' };
      if (pago > 0 && rb.integral && d && d.forma) pags.push(pagar(p, 'estorno', d.forma, pago));
      else if (pago > 0 && p.clienteId) {
        var c = clientePorId(p.clienteId);
        mudarCliente(c.id, { credito: (cent(c.credito) + cent(pago)) / 100 }, 'Sinal de ' + L.formatarPreco(pago) + ' do pedido ' + p.id + ' virou crédito na loja');
        patch.virouCredito = pago;
      }
      patch.pagamentos = pags;
      mudar(id, patch);
    },

    /* ---------- clientes ---------- */
    clientes: clientes,
    clientePorId: clientePorId,
    pedidosDoCliente: function (id) { return todos().filter(function (p) { return p.clienteId === id; }); },
    salvarCliente: function (dados) {
      var base = {
        nome: dados.nome.trim(), cpf: String(dados.cpf).replace(/\D/g, ''), whatsapp: L.normalizarWhatsApp(dados.whatsapp),
        email: (dados.email || '').trim(), rg: (dados.rg || '').trim(), endereco: dados.endereco, medidas: dados.medidas || null
      };
      var outroCpf = clientes().find(function (c) { return c.cpf && c.cpf === base.cpf && c.id !== dados.id; });
      if (outroCpf) return { erro: 'Já existe cliente com esse CPF: ' + outroCpf.nome + ' (' + outroCpf.id + ').', existente: outroCpf };
      if (dados.id) {
        var antigo = clientePorId(dados.id);
        var mudou = Object.keys(base).filter(function (k) { return JSON.stringify(antigo[k]) !== JSON.stringify(base[k]); });
        mudarCliente(dados.id, base, mudou.length ? 'Dados corrigidos: ' + mudou.join(', ') : '');
        return clientePorId(dados.id);
      }
      var c = Object.assign(base, {
        id: novoId('C'), origem: 'balcao', credito: 0, criadoEm: estado.dia,
        avisoPrivacidade: { em: estado.dia, versao: C.lgpd.versaoAviso, por: estado.operador },
        marketing: dados.marketing ? { consentido: true, em: estado.dia, versao: C.lgpd.versaoAviso, por: estado.operador, canal: 'WhatsApp' } : { consentido: false },
        log: [{ quando: estado.dia, hora: agora(), quem: estado.operador, acao: 'Cadastro criado; aviso de privacidade mostrado (versão ' + C.lgpd.versaoAviso + ')' + (dados.marketing ? '; aceitou receber novidades pelo WhatsApp' : '') }]
      });
      estado.clientes.push(c); salvar(); publicar();
      return c;
    },
    registrarAcesso: function (id, oque) { mudarCliente(id, {}, oque); },
    definirMarketing: function (id, sim) {
      mudarCliente(id, { marketing: sim ? { consentido: true, em: estado.dia, versao: C.lgpd.versaoAviso, por: estado.operador, canal: 'WhatsApp' } : { consentido: false, revogadoEm: estado.dia } },
        sim ? 'Aceitou receber novidades pelo WhatsApp' : 'Revogou o consentimento de marketing');
    },
    situacaoEliminacao: function (id) {
      return L.situacaoEliminacao(API.pedidosDoCliente(id), estado.dia, C.lgpd.retencaoCadastroAnos);
    },
    anonimizar: function (id) {
      exigir('anonimizar');
      var c = clientePorId(id);
      var novo = L.anonimizarCliente(c, estado.dia);
      var criado = estado.clientes.find(function (x) { return x.id === id; });
      if (criado) { Object.keys(criado).forEach(function (k) { delete criado[k]; }); Object.assign(criado, novo); }
      else estado.clientesAlt[id] = novo;
      estado.solicitacoes.forEach(function (s) { if (s.clienteId === id && s.status === 'aberta') { s.status = 'atendida'; s.respondidaEm = estado.dia; } });
      salvar(); publicar();
    },
    solicitacoes: function () { return estado.solicitacoes.slice(); },
    abrirSolicitacao: function (clienteId, tipo, canal) {
      var s = { id: novoId('S'), clienteId: clienteId, tipo: tipo, canal: canal || 'WhatsApp', em: estado.dia, prazo: L.somarDias(estado.dia, C.lgpd.prazoRespostaDias), status: 'aberta' };
      estado.solicitacoes.push(s);
      mudarCliente(clienteId, {}, 'Pedido do titular registrado: ' + tipo);
      return s;
    },
    responderSolicitacao: function (id, resposta) {
      var s = estado.solicitacoes.find(function (x) { return x.id === id; });
      s.status = 'atendida'; s.respondidaEm = estado.dia; s.resposta = resposta;
      salvar(); publicar();
    },

    /* ---------- caixa ---------- */
    caixaAberto: caixaAberto,
    caixaDeOutroDia: function () { var cx = caixaAberto(); return !!cx && cx.abertoEm.dia !== estado.dia; },
    caixas: function () { return estado.caixas.slice(); },
    abrirCaixa: function (fundo) {
      if (caixaAberto()) return caixaAberto();
      var cx = { id: novoId('X'), abertoEm: { dia: estado.dia, hora: agora(), quem: estado.operador }, fundo: cent(fundo) / 100, movimentos: [] };
      estado.caixas.push(cx); salvar(); publicar();
      return cx;
    },
    suprimento: function (valor, motivo) { exigir('suprimento'); movimento('suprimento', 'dinheiro', valor, motivo); salvar(); publicar(); },
    sangria: function (valor, motivo) { exigir('sangria'); movimento('sangria', 'dinheiro', valor, motivo); salvar(); publicar(); },
    fecharCaixa: function (contado) {
      var cx = caixaAberto();
      var esp = L.esperadoCaixa(cx);
      delete esp.vale; // vale não é dinheiro: não se conta na gaveta
      cx.conferencia = L.conferirCaixa(esp, contado);
      cx.fechadoEm = { dia: estado.dia, hora: agora(), quem: estado.operador };
      salvar(); publicar();
      return cx;
    },

    /* Fotos da vistoria: guardadas por retencaoFotosMeses depois da devolução. */
    fotosVencidas: function () {
      var meses = C.lgpd.retencaoFotosMeses;
      return todos().filter(function (p) {
        var v = p.vistorias || {};
        var tem = ['retirada', 'devolucao'].some(function (k) { return v[k] && v[k].fotos && Object.keys(v[k].fotos).length; });
        return tem && p.status === 'concluida' && p.devolvidaEm && estado.dia >= L.somarDias(p.devolvidaEm, Math.round(meses * 30.44));
      });
    },
    apagarFotosVencidas: function () {
      exigir('apagarFotos');
      var lista = API.fotosVencidas();
      lista.forEach(function (p) {
        var v = JSON.parse(JSON.stringify(p.vistorias || {}));
        ['retirada', 'devolucao'].forEach(function (k) { if (v[k]) { v[k].fotos = {}; v[k].fotosApagadasEm = estado.dia; } });
        mudar(p.id, { vistorias: v });
      });
      return lista.length;
    },

    /* ---------- bloqueio de peça ---------- */
    bloqueios: function () { return estado.bloqueios.slice(); },
    bloqueioNoDia: function (unidade, dia) {
      var d = dia || estado.dia;
      return bloqueiosAtivos().find(function (b) { return b.unidade === unidade && b.de <= d && d <= b.ate; }) || null;
    },
    bloquear: function (d) {
      if (!d.de || !d.ate || d.ate < d.de) return { erro: 'A data final precisa ser igual ou depois da inicial.' };
      var f = fantasiaDe(d.fantasia), m = margemDe(f);
      // Não bloqueia em cima de reserva: a peça prometida a um cliente não pode sumir.
      var conflito = linhasPorPeca(todos()).filter(function (r) {
        return r.unidade === d.unidade && ['pendente', 'confirmada', 'retirada'].indexOf(r.status) !== -1 &&
          d.de <= L.somarDias(r.devolucao, m) && r.retirada <= d.ate;
      });
      if (conflito.length) return { erro: 'A peça está reservada nesse período (' + conflito.map(function (r) { return r.id; }).join(', ') + '). Troque a data ou a peça do pedido antes.' };
      var b = { id: novoId('B'), unidade: d.unidade, fantasia: d.fantasia, tamanho: d.tamanho, de: d.de, ate: d.ate, motivo: d.motivo, obs: d.obs || '',
        por: estado.operador, criadoEm: estado.dia };
      estado.bloqueios.push(b); salvar(); publicar();
      return b;
    },
    liberar: function (id) {
      var b = estado.bloqueios.find(function (x) { return x.id === id; });
      if (b) { b.liberadoEm = estado.dia; b.liberadoPor = estado.operador; salvar(); publicar(); }
    },

    /* ---------- agenda de prova ---------- */
    provas: function (dia) {
      return estado.provas.filter(function (x) { return !dia || x.dia === dia; })
        .sort(function (a, b) { return (a.dia + a.hora) < (b.dia + b.hora) ? -1 : 1; });
    },
    horariosDeProva: function (dia) {
      var ocupados = estado.provas.filter(function (x) { return x.dia === dia && x.status === 'marcada'; }).map(function (x) { return x.hora; });
      return L.horariosDeProva(dia, (C.local || {}).horarios, C.provas.duracaoMinutos, ocupados, C.provas.provadores);
    },
    /* d: { clienteId?, nome, whatsapp, dia, hora, fantasias: [ids], obs } — para a prova
     * basta nome e WhatsApp (dado mínimo); o cadastro completo fica para o contrato. */
    marcarProva: function (d) {
      var cli = d.clienteId && clientePorId(d.clienteId);
      var nome = cli ? cli.nome : String(d.nome || '').trim();
      var whats = cli ? cli.whatsapp : L.normalizarWhatsApp(d.whatsapp);
      if (!nome) return { erro: 'Diga o nome de quem vem provar.' };
      if (!L.numeroWhatsAppValido(whats)) return { erro: 'WhatsApp com DDD, para lembrar da prova.' };
      if (d.dia < estado.dia) return { erro: 'Esse dia já passou.' };
      var h = API.horariosDeProva(d.dia).find(function (x) { return x.hora === d.hora; });
      if (!h) return { erro: 'O ateliê não atende nesse dia e horário.' };
      if (!h.livre) return { erro: 'Esse horário já está ocupado.' };
      var p = { id: novoId('A'), clienteId: cli ? cli.id : null, nome: nome, whatsapp: whats, dia: d.dia, hora: d.hora,
        fantasias: d.fantasias || [], obs: d.obs || '', status: 'marcada', por: estado.operador, criadoEm: estado.dia };
      estado.provas.push(p); salvar(); publicar();
      return p;
    },
    atualizarProva: function (id, status) {
      var p = estado.provas.find(function (x) { return x.id === id; });
      if (p) { p.status = status; p.atualizadaEm = estado.dia; salvar(); publicar(); }
    },

    /* ---------- orçamento (não cobra e não segura peça) ---------- */
    orcamentos: function () {
      return estado.orcamentos.map(function (o) {
        var x = Object.assign({}, o);
        if (x.status === 'aberto' && estado.dia > x.validoAte) x.status = 'vencido';
        return x;
      }).sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    },
    orcamentoPorId: function (id) { return API.orcamentos().find(function (o) { return o.id === id; }); },
    criarOrcamento: function (d) {
      var itens = d.itens || [], comps = d.complementos || [];
      if (!itens.length && !comps.length) return { erro: 'Orçamento vazio.' };
      if (itens.length && !d.periodo) return { erro: 'Escolha a data da festa.' };
      var o = { id: novoId('O'), para: (d.para || '').trim(), clienteId: d.clienteId || null, periodo: d.periodo || null,
        itens: itens.slice(), complementos: comps.slice(), desconto: d.desconto || { valor: 0, motivo: '' },
        valores: calcularPedido({ itens: itens, complementos: comps, desconto: d.desconto, diasExtras: d.periodo ? d.periodo.diasExtras : 0 }),
        validoAte: L.somarDias(estado.dia, C.orcamento.validadeDias), status: 'aberto', por: estado.operador, criadoEm: estado.dia };
      estado.orcamentos.push(o); salvar(); publicar();
      return o;
    },
    marcarOrcamentoConvertido: function (id, pedidoId) {
      var o = estado.orcamentos.find(function (x) { return x.id === id; });
      if (o) { o.status = 'convertido'; o.pedidoId = pedidoId; o.convertidoEm = estado.dia; salvar(); publicar(); }
    },
    cancelarOrcamento: function (id) {
      var o = estado.orcamentos.find(function (x) { return x.id === id; });
      if (o) { o.status = 'cancelado'; salvar(); publicar(); }
    },

    /* ---------- lista de espera ----------
     * Quem quer uma peça esgotada na data. "Liberou" é calculado na hora: o
     * tamanho tem peça livre no período da festa (cancelamento, bloqueio
     * liberado, devolução antecipada...). Data da festa passada = encerrada. */
    espera: function () {
      return estado.espera.map(function (w) {
        var x = Object.assign({}, w);
        if (x.status === 'aguardando' || x.status === 'avisado') {
          var per = L.periodoAluguel(x.dataFesta, estado.dia, 0, lojaDe(fantasiaDe(x.fantasia)));
          if (!per) x.status = 'passou';
          else {
            var f = fantasiaDe(x.fantasia);
            var livres = L.disponibilidade(f, agendaBloqueios(), per, margemDe(f))[x.tamanho].livres;
            x.liberou = livres.length > 0;
            x.periodo = per;
          }
        }
        return x;
      }).sort(function (a, b) { return a.dataFesta < b.dataFesta ? -1 : 1; });
    },
    entrarEspera: function (d) {
      var nome = String(d.nome || '').trim(), whats = L.normalizarWhatsApp(d.whatsapp);
      if (!nome) return { erro: 'Diga o nome.' };
      if (!L.numeroWhatsAppValido(whats)) return { erro: 'WhatsApp com DDD, para avisar quando liberar.' };
      var f = fantasiaDe(d.fantasia);
      if (!f || !f.tamanhos[d.tamanho]) return { erro: 'Escolha a fantasia e o tamanho.' };
      if (!L.periodoAluguel(d.dataFesta, estado.dia, 0, lojaDe(f))) return { erro: 'A data da festa precisa ser hoje ou depois.' };
      var w = { id: novoId('W'), nome: nome, whatsapp: whats, fantasia: d.fantasia, tamanho: d.tamanho, dataFesta: d.dataFesta,
        status: 'aguardando', origem: d.origem || 'balcao', criadoEm: estado.dia, por: estado.operador };
      estado.espera.push(w); salvar(); publicar();
      return w;
    },
    atualizarEspera: function (id, status) {
      var w = estado.espera.find(function (x) { return x.id === id; });
      if (w) { w.status = status; w.atualizadoEm = estado.dia; salvar(); publicar(); }
    },

    zerar: function () {
      estado = estadoNovo(estado.dia);
      salvar(); publicar();
    }
  };

  window.SIM_LOJA = API;
  window.AGENDA = agendaBloqueios();
  window.AGENDA_KITS = agendaKits();
  setInterval(function () {
    var mudou = false;
    estado.pedidos.forEach(function (p) {
      if (p.status === 'pendente' && p.expiraEm && agora() > p.expiraEm) { p.status = 'expirada'; mudou = true; }
    });
    if (mudou) { salvar(); publicar(); }
  }, 60000);
})();
