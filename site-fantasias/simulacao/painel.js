/* Simulação — sistema do ateliê (a "tela do adm"). Abre com #painel.
 * Menu: Início · Nova venda (PDV) · Pedidos · Clientes · Acervo · Caixa · Privacidade.
 * Lê e grava em window.SIM_LOJA (simulacao/estado.js). Regras de dinheiro, datas,
 * disponibilidade, pagamento, caixa e LGPD vêm de logica.js e têm provas.
 *
 * Desenho apoiado em pesquisa (ver PESQUISA_PAINEL.md): sistemas de locação de
 * trajes (agenda de retirada/devolução, bloqueio por peça, contrato), PDVs de
 * varejo (pagamento dividido, troco só no dinheiro, conferir "aprovado" antes de
 * fechar, caixa com abertura, sangria, suprimento e conferência cega) e LGPD
 * (dado mínimo por finalidade, consentimento de marketing à parte e registrado,
 * direitos do titular, prazo de guarda). */
(function () {
  'use strict';
  var LOJA = window.SIM_LOJA;
  var L = window.Logica;
  var C = window.CONFIG;
  var FANTASIAS = window.FANTASIAS;
  var PAG = C.pagamentos;
  var FORMAS = L.FORMAS_PAGAMENTO;

  var STATUS = {
    pendente: ['Aguardando sinal', 'aviso'], confirmada: ['Confirmado', 'info'], retirada: ['Com o cliente', 'magenta'],
    atrasada: ['Atrasado', 'erro'], concluida: ['Concluído', 'ok'], cancelada: ['Cancelado', 'neutro'], expirada: ['Expirado', 'neutro']
  };
  var TIPOS = {
    sinal: 'Sinal', saldo: 'Saldo do aluguel', total: 'Pedido pago', caucao: 'Caução recebida',
    cobranca: 'Cobrança de dano/atraso', caucao_devolvida: 'Caução devolvida', estorno: 'Estorno de sinal'
  };
  var FOTOS = [['frente', 'Frente'], ['costas', 'Costas'], ['barra', 'Barra'], ['detalhes', 'Detalhes']];
  var DEFEITOS = ['Mancha', 'Rasgo', 'Botão ou zíper', 'Barra descosturada', 'Desbotado', 'Peça faltando'];
  var ICONES = {
    inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    venda: 'M4 5h2l2.4 10.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L21 8H7M10 20a1 1 0 1 0 0 .01M18 20a1 1 0 1 0 0 .01',
    pedidos: 'M8 4h8l1 2h3v15H4V6h3zM8 11h8M8 15h6',
    clientes: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.7',
    acervo: 'M12 4a2 2 0 0 1 2 2c0 1.5-2 2-2 3.5M12 9.5L3 16h18zM3 16v2h18v-2',
    caixa: 'M3 7h18v12H3zM3 11h18M7 15h3',
    privacidade: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4'
  };
  var PAGINAS = [['inicio', 'Início'], ['venda', 'Nova venda'], ['pedidos', 'Pedidos'], ['clientes', 'Clientes'],
    ['acervo', 'Acervo'], ['caixa', 'Caixa'], ['privacidade', 'Privacidade']];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var R$ = L.formatarPreco;
  function curta(iso) { var d = L.dataComDia(iso); return d ? d.slice(0, 10) : ''; }
  function dia() { return LOJA.dia(); }
  function hora(ms) { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function icone(n) { return '<svg class="sis-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONES[n] + '"/></svg>'; }
  // "1.234,56" | "95" | "95,5" -> número
  function lerValor(t) {
    var s = String(t == null ? '' : t).trim().replace(/[R$\s]/g, '');
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }
  function campoValor(n) { return n ? String(n.toFixed(2)).replace('.', ',') : ''; } // valor para <input> (não é texto de leitura)
  function visivel(p) { return p.status === 'retirada' && dia() > p.devolucao ? 'atrasada' : p.status; }
  function chip(p) { var s = STATUS[visivel(p)] || [p.status, 'neutro']; return '<span class="pn-status pn-status--' + s[1] + '">' + s[0] + '</span>'; }
  function nome(p) { return LOJA.nomeCliente(p); }
  function pecasTxt(p) {
    return (p.itens || []).map(function (it) { var f = LOJA.fantasiaDe(it.fantasia); return (f ? f.nome : it.fantasia) + ' ' + it.tamanho; }).join(' + ') ||
      (p.complementos || []).map(function (k) { return k.nome + (k.qtd > 1 ? ' ×' + k.qtd : ''); }).join(', ');
  }
  function unidadesTxt(p) { return (p.itens || []).map(function (it) { return it.unidade; }).join(', '); }
  function formatarCpf(c) { return String(c || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
  function formatarFone(w) { var d = String(w || '').replace(/\D/g, '').replace(/^55/, ''); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d; }

  /* ---------- estrutura ---------- */
  var raiz = document.createElement('div');
  raiz.id = 'painel';
  raiz.className = 'sis';
  raiz.hidden = true;
  raiz.innerHTML =
    '<aside class="sis-menu" aria-label="Menu do sistema">' +
      '<div class="sis-marca"><span class="sis-marca__nome">' + esc(C.nomeSite) + '</span><span class="sis-marca__sub">Gestão do ateliê</span></div>' +
      '<nav class="sis-nav">' + PAGINAS.map(function (p) {
        return '<button type="button" class="sis-nav__item" data-pagina="' + p[0] + '">' + icone(p[0]) + '<span>' + p[1] + '</span><span class="sis-nav__conta" id="sis-conta-' + p[0] + '" hidden></span></button>';
      }).join('') + '</nav>' +
      '<div class="sis-menu__pe">' +
        '<label for="sis-operador">Atendente</label>' +
        '<select id="sis-operador">' + (C.operadores || ['Atendente']).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="sis-link" id="sis-zerar">Recomeçar a simulação</button>' +
      '</div>' +
    '</aside>' +
    '<div class="sis-area">' +
      '<header class="sis-topo">' +
        '<div class="sis-topo__titulo"><h1 id="sis-titulo">Início</h1><span id="sis-sub"></span></div>' +
        '<div class="sis-topo__dir">' +
          '<div class="sis-dia"><button type="button" class="pn-icone" id="sis-dia-ant" aria-label="Dia anterior">‹</button>' +
            '<input type="date" id="sis-dia" aria-label="Dia de trabalho">' +
            '<button type="button" class="pn-icone" id="sis-dia-prox" aria-label="Próximo dia">›</button></div>' +
          '<button type="button" class="sis-caixa" id="sis-caixa"></button>' +
        '</div>' +
      '</header>' +
      '<p class="sis-aviso" id="sis-aviso" hidden></p>' +
      '<main class="sis-conteudo" id="sis-conteudo"></main>' +
      '<p class="sis-rodape">Simulação: tudo fica neste navegador. No sistema de verdade, cada atendente entra com login e senha.</p>' +
    '</div>';
  document.body.appendChild(raiz);

  var modal = document.createElement('dialog');
  modal.className = 'pn-modal';
  modal.id = 'painel-modal';
  modal.setAttribute('aria-labelledby', 'pn-modal-titulo');
  document.body.appendChild(modal);
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });

  var pagina = 'inicio';
  function mostrar() {
    var ativo = location.hash === '#painel';
    document.body.classList.toggle('modo-painel', ativo);
    raiz.hidden = !ativo;
    if (ativo) { render(); window.scrollTo(0, 0); }
  }
  window.addEventListener('hashchange', mostrar);

  raiz.querySelector('.sis-nav').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pagina]');
    if (b) irPara(b.dataset.pagina);
  });
  function irPara(p) { pagina = p; render(); $('sis-conteudo').scrollTop = 0; window.scrollTo(0, 0); }
  $('sis-dia').addEventListener('change', function (e) { LOJA.definirDia(e.target.value); });
  $('sis-dia-ant').addEventListener('click', function () { LOJA.definirDia(L.somarDias(dia(), -1)); });
  $('sis-dia-prox').addEventListener('click', function () { LOJA.definirDia(L.somarDias(dia(), 1)); });
  $('sis-operador').addEventListener('change', function (e) { LOJA.definirOperador(e.target.value); });
  $('sis-caixa').addEventListener('click', function () { irPara('caixa'); });
  $('sis-zerar').addEventListener('click', function () { LOJA.zerar(); carrinho = carrinhoNovo(); });
  LOJA.aoMudar(function () {
    if (raiz.hidden) return;
    if (pagina === 'venda') { topo(); atualizarVenda(); } else render();
  });

  function topo() {
    $('sis-dia').value = dia();
    $('sis-operador').value = LOJA.operador();
    $('sis-titulo').textContent = PAGINAS.find(function (p) { return p[0] === pagina; })[1];
    $('sis-sub').textContent = L.dataComDia(dia());
    raiz.querySelectorAll('.sis-nav__item').forEach(function (b) { b.setAttribute('aria-current', b.dataset.pagina === pagina ? 'page' : 'false'); });
    var cx = LOJA.caixaAberto();
    var bc = $('sis-caixa');
    if (cx) {
      var e = L.esperadoCaixa(cx);
      bc.className = 'sis-caixa sis-caixa--aberto';
      bc.innerHTML = '<span class="sis-luz"></span>Caixa aberto · ' + R$(e.dinheiro) + ' na gaveta';
    } else {
      bc.className = 'sis-caixa sis-caixa--fechado';
      bc.innerHTML = '<span class="sis-luz"></span>Caixa fechado · abrir';
    }
    var rs = LOJA.todos();
    contar('inicio', rs.filter(function (p) { return p.status === 'pendente'; }).length + rs.filter(function (p) { return visivel(p) === 'atrasada'; }).length);
    contar('privacidade', LOJA.solicitacoes().filter(function (s) { return s.status === 'aberta'; }).length);
    var av = LOJA.aviso();
    $('sis-aviso').textContent = av;
    $('sis-aviso').hidden = !av;
  }
  function contar(p, n) { var el = $('sis-conta-' + p); el.textContent = n; el.hidden = !n; }

  function render() {
    topo();
    var corpo = $('sis-conteudo');
    if (pagina === 'inicio') corpo.innerHTML = htmlInicio();
    else if (pagina === 'venda') { corpo.innerHTML = htmlVenda(); ligarVenda(); atualizarVenda(); }
    else if (pagina === 'pedidos') { corpo.innerHTML = htmlPedidos(); ligarBusca('sis-busca-ped', function (v) { buscaPedidos = v; }); }
    else if (pagina === 'clientes') { corpo.innerHTML = htmlClientes(); ligarBusca('sis-busca-cli', function (v) { buscaClientes = v; }); }
    else if (pagina === 'acervo') corpo.innerHTML = htmlAcervo();
    else if (pagina === 'caixa') { corpo.innerHTML = htmlCaixa(); ligarCaixa(); }
    else corpo.innerHTML = htmlPrivacidade();
  }
  function ligarBusca(id, guardar) {
    var b = $(id);
    if (!b) return;
    b.addEventListener('input', function (e) {
      guardar(e.target.value); limite = 40;
      var pos = e.target.selectionStart; render();
      var n = $(id); n.focus(); n.setSelectionRange(pos, pos);
    });
  }

  // Ações por delegação: data-acao + data-id em qualquer botão do sistema ou do modal.
  function acionar(e) {
    var b = e.target.closest('[data-acao]');
    if (!b) return;
    var id = b.dataset.id, a = b.dataset.acao;
    if (a === 'detalhe') abrirPedido(id);
    else if (a === 'confirmar') abrirSinal(id);
    else if (a === 'recusar') { LOJA.cancelar(id, { motivo: 'Recusado pelo ateliê' }); if (modal.open) modal.close(); }
    else if (a === 'retirar') abrirRetirada(id);
    else if (a === 'devolver') abrirDevolucao(id);
    else if (a === 'ir-dia') LOJA.definirDia(b.dataset.dia);
    else if (a === 'cliente') abrirCliente(id);
    else if (a === 'novo-cliente') abrirCadastro(null, b.dataset.volta);
    else if (a === 'filtro') { filtroPedidos = b.dataset.filtro; limite = 40; render(); }
    else if (a === 'mais') { limite += 40; render(); }
    else if (a === 'ir') irPara(b.dataset.pagina);
  }
  raiz.addEventListener('click', acionar);
  modal.addEventListener('click', acionar);

  function botao(acao, id, texto, forte, extra) {
    return '<button type="button" class="botao ' + (forte ? 'botao--destaque' : 'botao--leve') + ' pn-botao" data-acao="' + acao + '"' + (id ? ' data-id="' + id + '"' : '') + (extra || '') + '>' + texto + '</button>';
  }
  function linha(p, extra, acoes) {
    return '<tr>' +
      '<td><button type="button" class="sis-link sis-forte" data-acao="detalhe" data-id="' + p.id + '">' + p.id + '</button></td>' +
      '<td>' + (p.clienteId ? '<button type="button" class="sis-link" data-acao="cliente" data-id="' + p.clienteId + '">' + esc(nome(p)) + '</button>' : esc(nome(p))) + '</td>' +
      '<td>' + esc(pecasTxt(p)) + '<div class="sis-mudo pn-cod">' + esc(unidadesTxt(p)) + '</div></td>' +
      '<td class="sis-num">' + curta(p.retirada) + ' → ' + curta(p.devolucao) + (extra ? '<div class="sis-mudo">' + extra + '</div>' : '') + '</td>' +
      '<td>' + chip(p) + '</td>' +
      '<td class="sis-acoes">' + (acoes || '') + '</td></tr>';
  }
  function tabelaPedidos(lista, vazio) {
    if (!lista.length) return '<div class="pn-vazio"><p>' + vazio + '</p></div>';
    return '<div class="sis-tabela-rolagem"><table class="sis-tabela"><thead><tr><th>Pedido</th><th>Cliente</th><th>Peças</th><th>Retirada → devolução</th><th>Situação</th><th></th></tr></thead><tbody>' +
      lista.join('') + '</tbody></table></div>';
  }
  function tile(rotulo, valor, tom, sub) {
    return '<div class="pn-tile' + (tom ? ' pn-tile--' + tom : '') + '"><span>' + rotulo + '</span><strong>' + valor + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  }
  function cartao(titulo, dica, corpo, acoes) {
    return '<section class="sis-cartao"><header class="sis-cartao__topo"><div><h2>' + titulo + '</h2>' + (dica ? '<p class="pn-dica">' + dica + '</p>' : '') + '</div>' + (acoes || '') + '</header>' + corpo + '</section>';
  }
  function lembrete(p) {
    var c = p.clienteId && LOJA.clientePorId(p.clienteId);
    if (!c || !L.numeroWhatsAppValido(c.whatsapp)) return '';
    var f = LOJA.fantasiaDe(p.itens[0].fantasia);
    var texto = 'Olá, ' + c.nome.split(' ')[0] + '! Aqui é do ' + C.nomeSite + '. A devolução do pedido ' + p.id + ' (' + pecasTxt(p) + ') era em ' + L.dataBR(p.devolucao) +
      '. Cada dia de atraso é cobrado como dia extra (' + R$(f.diaExtra) + ' por peça). Podemos combinar a devolução para hoje?';
    return '<a class="botao botao--leve pn-botao" href="' + esc(L.linkWhatsApp(c.whatsapp, texto)) + '" target="_blank" rel="noopener">WhatsApp</a>';
  }

  /* =====================================================================
   * INÍCIO
   * ===================================================================== */
  function htmlInicio() {
    var d = dia();
    var rs = LOJA.todos();
    var pend = rs.filter(function (p) { return p.status === 'pendente'; });
    var sai = rs.filter(function (p) { return p.status === 'confirmada' && p.retirada <= d && (p.itens || []).length; }).sort(function (a, b) { return a.retirada < b.retirada ? -1 : 1; });
    var volta = rs.filter(function (p) { return p.status === 'retirada' && p.devolucao === d; });
    var atr = rs.filter(function (p) { return visivel(p) === 'atrasada'; });
    var cx = LOJA.caixaAberto();
    var recebido = cx ? cx.movimentos.filter(function (m) { return m.tipo === 'entrada' && m.dia === d && m.forma !== 'vale'; }).reduce(function (s, m) { return s + Math.round(m.valor * 100); }, 0) / 100 : 0;
    var sols = LOJA.solicitacoes().filter(function (s) { return s.status === 'aberta'; });

    var html = '<div class="pn-resumo">' +
      tile('Saem hoje', sai.length, sai.length ? 'retirada' : '') +
      tile('Voltam hoje', volta.length, '') +
      tile('Atrasados', atr.length, atr.length ? 'erro' : '') +
      tile('Pedidos do site', pend.length, pend.length ? 'aviso' : '') +
      tile('Recebido hoje', R$(recebido), '', cx ? 'no caixa aberto' : 'caixa fechado') + '</div>';
    if (!cx) html += '<div class="sis-alerta"><span>O caixa está fechado: sem ele não dá para receber sinal, saldo nem caução.</span>' + botao('ir', '', 'Abrir o caixa', true, ' data-pagina="caixa"') + '</div>';
    if (sols.length) html += '<div class="sis-alerta sis-alerta--aviso"><span>' + sols.length + ' pedido(s) de cliente sobre os dados dele, com prazo de resposta.</span>' + botao('ir', '', 'Ver em Privacidade', false, ' data-pagina="privacidade"') + '</div>';

    if (pend.length) html += cartao('Pedidos do site aguardando sinal', 'O cliente reservou pelo site e combina o Pix no WhatsApp. A peça fica segura por ' + LOJA.MINUTOS_PENDENTE + ' minutos.',
      tabelaPedidos(pend.map(function (p) {
        var min = Math.max(0, Math.ceil((p.expiraEm - Date.now()) / 60000));
        return linha(p, 'sinal ' + R$(p.valores.sinal) + ' · expira em ' + min + ' min', botao('confirmar', p.id, 'Sinal recebido', true) + botao('recusar', p.id, 'Recusar'));
      }), ''));
    html += cartao('Saem hoje', 'Receba o saldo e a caução e faça a vistoria com fotos antes de entregar.',
      tabelaPedidos(sai.map(function (p) {
        var x = p.retirada < d ? '<strong class="pn-alerta">devia ter saído ' + curta(p.retirada) + '</strong> · ' : '';
        return linha(p, x + 'receber ' + R$(LOJA.saldo(p)) + ' + caução ' + R$(p.valores.caucao), botao('retirar', p.id, 'Entregar', true));
      }), 'Nenhuma peça sai hoje.'));
    html += cartao('Voltam hoje', 'Compare com as fotos da entrega antes de devolver a caução.',
      tabelaPedidos(volta.map(function (p) { return linha(p, 'caução ' + R$(p.valores.caucao), botao('devolver', p.id, 'Receber de volta', true)); }), 'Nenhuma peça volta hoje.'));
    if (atr.length) html += cartao('Atrasados', 'Cada dia além da devolução é cobrado como dia extra e sai da caução.',
      tabelaPedidos(atr.map(function (p) {
        var n = L.diasEntre(p.devolucao, d);
        return linha(p, '<strong class="pn-alerta">' + n + (n === 1 ? ' dia' : ' dias') + ' de atraso</strong>', lembrete(p) + botao('devolver', p.id, 'Receber de volta', true));
      }), ''));
    if (!sai.length && !volta.length && !atr.length && !pend.length) {
      var prox = rs.filter(function (p) { return (p.status === 'confirmada' && p.retirada > d) || (p.status === 'retirada' && p.devolucao > d); })
        .map(function (p) { return p.status === 'confirmada' ? p.retirada : p.devolucao; }).sort()[0];
      if (prox) html += '<div class="pn-vazio"><p>Próximo dia com movimento: <strong>' + esc(L.dataComDia(prox)) + '</strong></p>' + botao('ir-dia', '', 'Ir para esse dia', false, ' data-dia="' + prox + '"') + '</div>';
    }
    return html;
  }

  /* =====================================================================
   * NOVA VENDA (PDV)
   * ===================================================================== */
  function carrinhoNovo() {
    return { clienteId: '', buscaCliente: '', dataFesta: '', extras: 0, itens: [], complementos: [], desconto: '', motivoDesconto: '',
      busca: '', fantasia: '', tamanho: '', recebe: 'sinal' };
  }
  var carrinho = carrinhoNovo();

  function periodoCarrinho() {
    if (!carrinho.dataFesta) return null;
    return L.periodoAluguel(carrinho.dataFesta, dia(), carrinho.extras, C.lojas[Object.keys(C.lojas)[0]]);
  }
  function valoresCarrinho() {
    var per = periodoCarrinho();
    return LOJA.calcularPedido({ itens: carrinho.itens, complementos: carrinho.complementos, desconto: { valor: lerValor(carrinho.desconto) || 0 }, diasExtras: per ? per.diasExtras : 0 });
  }
  // Peças do carrinho que deixaram de estar livres (mudou a data, ou outro pedido pegou).
  function conflitos() {
    var per = periodoCarrinho();
    if (!per) return [];
    return carrinho.itens.filter(function (it) {
      var f = LOJA.fantasiaDe(it.fantasia);
      return L.disponibilidade(f, window.AGENDA, per, LOJA.margemDe(f))[it.tamanho].livres.indexOf(it.unidade) === -1;
    });
  }

  function htmlVenda() {
    return '<div class="sis-pdv">' +
      '<div class="sis-pdv__montagem">' +
        cartao('Cliente', 'Obrigatório para aluguel (vai no contrato). Venda só de complementos pode ser sem cadastro.',
          '<div id="pdv-cliente"></div>') +
        cartao('Datas', 'A retirada e a devolução saem da data da festa, como no site.',
          '<div class="pn-campos"><label>Data da festa <input type="date" id="pdv-festa" min="' + dia() + '" value="' + esc(carrinho.dataFesta) + '"></label>' +
          '<label>Dias extras <select id="pdv-extras">' + [0, 1, 2, 3, 4].map(function (n) { return '<option value="' + n + '"' + (carrinho.extras === n ? ' selected' : '') + '>' + (n ? '+' + n : 'Nenhum') + '</option>'; }).join('') + '</select></label></div>' +
          '<div id="pdv-periodo"></div>') +
        cartao('Peças para alugar', 'Busque a fantasia, escolha o tamanho e a peça física. Pode pôr várias no mesmo pedido (família, quadrilha).',
          '<input type="search" id="pdv-busca" class="pn-busca" placeholder="Nome, código ou tema (noiva, JN03, junina)" autocomplete="off" value="' + esc(carrinho.busca) + '">' +
          '<div id="pdv-resultados" class="pn-resultados"></div><div id="pdv-escolha"></div>') +
        cartao('Complementos', 'Maquiagem e descartáveis são vendidos; os outros são alugados junto.', '<div id="pdv-complementos"></div>') +
      '</div>' +
      '<aside class="sis-pdv__resumo"><div class="sis-cartao sis-cupom">' +
        '<h2>Pedido</h2><div id="pdv-itens"></div>' +
        '<div class="pn-campos pn-campos--desconto"><label>Desconto (R$) <input id="pdv-desconto" inputmode="decimal" placeholder="0,00" value="' + esc(carrinho.desconto) + '"></label>' +
        '<label>Motivo <input id="pdv-motivo" placeholder="Ex.: quadrilha com 6 peças" value="' + esc(carrinho.motivoDesconto) + '"></label></div>' +
        '<div id="pdv-totais"></div>' +
        '<div class="pn-campos" id="pdv-recebe-box"><label>Receber agora <select id="pdv-recebe"><option value="sinal"' + (carrinho.recebe === 'sinal' ? ' selected' : '') + '>Só o sinal (resto na retirada)</option><option value="total"' + (carrinho.recebe === 'total' ? ' selected' : '') + '>O pedido inteiro</option></select></label></div>' +
        '<ul class="pn-erros" id="pdv-erros" hidden></ul>' +
        '<button type="button" class="botao botao--destaque botao--largo" id="pdv-pagar">Ir para o pagamento</button>' +
        '<button type="button" class="sis-link" id="pdv-limpar">Limpar pedido</button>' +
      '</div></aside></div>';
  }

  function ligarVenda() {
    var area = $('sis-conteudo');
    $('pdv-festa').addEventListener('change', function (e) { carrinho.dataFesta = e.target.value; atualizarVenda(); });
    $('pdv-extras').addEventListener('change', function (e) { carrinho.extras = Number(e.target.value) || 0; atualizarVenda(); });
    $('pdv-busca').addEventListener('input', function (e) { carrinho.busca = e.target.value; carrinho.fantasia = ''; atualizarVenda(); });
    $('pdv-desconto').addEventListener('input', function (e) { carrinho.desconto = e.target.value; atualizarTotais(); });
    $('pdv-motivo').addEventListener('input', function (e) { carrinho.motivoDesconto = e.target.value; });
    $('pdv-recebe').addEventListener('change', function (e) { carrinho.recebe = e.target.value; atualizarTotais(); });
    $('pdv-limpar').addEventListener('click', function () { carrinho = carrinhoNovo(); render(); });
    $('pdv-pagar').addEventListener('click', irPagamento);
    area.addEventListener('input', function (e) {
      if (e.target.id === 'pdv-busca-cli') { carrinho.buscaCliente = e.target.value; pintarCliente(true); }
    });
    area.addEventListener('click', function (e) {
      var t = e.target.closest('[data-pdv]');
      if (!t) return;
      var a = t.dataset.pdv, v = t.dataset.v;
      if (a === 'cliente') { carrinho.clienteId = v; carrinho.buscaCliente = ''; atualizarVenda(); }
      else if (a === 'trocar-cliente') { carrinho.clienteId = ''; atualizarVenda(); setTimeout(function () { var b = $('pdv-busca-cli'); if (b) b.focus(); }); }
      else if (a === 'fantasia') { carrinho.fantasia = v; carrinho.tamanho = ''; atualizarVenda(); }
      else if (a === 'tamanho') { carrinho.tamanho = v; atualizarVenda(); }
      else if (a === 'adicionar') {
        var f = LOJA.fantasiaDe(carrinho.fantasia);
        var un = $('pdv-unidade').value;
        carrinho.itens.push({ fantasia: f.id, tamanho: carrinho.tamanho, unidade: un, preco: f.preco, diaExtra: f.diaExtra, caucao: f.caucao });
        carrinho.fantasia = ''; carrinho.tamanho = ''; carrinho.busca = '';
        $('pdv-busca').value = '';
        atualizarVenda();
      } else if (a === 'tirar') { carrinho.itens.splice(Number(v), 1); atualizarVenda(); }
      else if (a === 'comp-mais' || a === 'comp-menos') {
        var k = JSON.parse(v);
        var at = carrinho.complementos.find(function (c) { return c.fantasia === k.fantasia && c.kitId === k.kitId; });
        if (a === 'comp-mais') { if (at) at.qtd++; else carrinho.complementos.push(Object.assign({ qtd: 1 }, k)); }
        else if (at) { at.qtd--; if (!at.qtd) carrinho.complementos.splice(carrinho.complementos.indexOf(at), 1); }
        atualizarVenda();
      }
    });
  }

  function pintarCliente(soResultados) {
    var box = $('pdv-cliente');
    if (!box) return;
    var c = carrinho.clienteId && LOJA.clientePorId(carrinho.clienteId);
    if (c) {
      box.innerHTML = '<div class="pn-escolhida"><div><strong>' + esc(c.nome) + '</strong> <span class="pn-cod">' + c.id + '</span><br>' +
        '<small>CPF ' + L.mascararCpf(c.cpf) + ' · ' + esc(formatarFone(c.whatsapp)) + (c.credito ? ' · <strong>crédito na loja ' + R$(c.credito) + '</strong>' : '') + '</small></div>' +
        '<button type="button" class="sis-link" data-pdv="trocar-cliente">Trocar</button></div>';
      return;
    }
    var termo = L.normalizar(carrinho.buscaCliente);
    var dig = carrinho.buscaCliente.replace(/\D/g, '');
    var achados = termo.length < 2 ? [] : LOJA.clientes().filter(function (x) {
      return !x.anonimizado && (L.normalizar(x.nome).indexOf(termo) !== -1 || (dig.length >= 3 && (x.cpf.indexOf(dig) !== -1 || x.whatsapp.indexOf(dig) !== -1)));
    }).slice(0, 6);
    var res = '<div class="sis-lista-cli">' + (termo.length < 2 ? '<p class="pn-dica">Digite ao menos 2 letras do nome, ou parte do CPF ou do WhatsApp.</p>' :
      achados.length ? achados.map(function (x) {
        return '<button type="button" class="pn-resultado" data-pdv="cliente" data-v="' + x.id + '"><span><strong>' + esc(x.nome) + '</strong><br><small>CPF ' + L.mascararCpf(x.cpf) + ' · ' + esc(formatarFone(x.whatsapp)) + '</small></span></button>';
      }).join('') : '<p class="pn-dica">Ninguém com esse nome, CPF ou WhatsApp.</p>') + '</div>';
    if (soResultados && box.querySelector('.sis-lista-cli')) { box.querySelector('.sis-lista-cli').outerHTML = res; return; }
    box.innerHTML = '<div class="sis-linha-busca"><input type="search" id="pdv-busca-cli" class="pn-busca" placeholder="Buscar por nome, CPF ou WhatsApp" autocomplete="off" value="' + esc(carrinho.buscaCliente) + '">' +
      botao('novo-cliente', '', '+ Novo cliente', false, ' data-volta="venda"') + '</div>' + res;
  }

  function atualizarVenda() {
    if (!$('pdv-cliente')) return;
    pintarCliente(false);
    var per = periodoCarrinho();
    $('pdv-periodo').innerHTML = per
      ? '<div class="pn-periodo"><div><span>Retira</span><strong>' + esc(L.dataComDia(per.retirada)) + '</strong></div>' +
        '<div><span>Festa</span><strong>' + esc(L.dataComDia(per.dataFesta)) + '</strong></div>' +
        '<div><span>Devolve até</span><strong class="pn-devolve">' + esc(L.dataComDia(per.devolucao)) + '</strong></div></div>' +
        (per.retirada === dia() ? '<p class="pn-msg pn-msg--ok">Retirada é hoje: depois do pagamento já dá para entregar.</p>' : '')
      : '<p class="pn-dica">Escolha a data da festa para ver as peças livres.</p>';

    // busca e escolha de peça
    var res = $('pdv-resultados'), esc1 = $('pdv-escolha');
    var f = carrinho.fantasia && LOJA.fantasiaDe(carrinho.fantasia);
    if (f) {
      res.innerHTML = '';
      var disp = L.disponibilidade(f, window.AGENDA, per, LOJA.margemDe(f));
      var noCarrinho = carrinho.itens.map(function (it) { return it.unidade; });
      Object.keys(disp).forEach(function (t) { disp[t].livres = disp[t].livres.filter(function (u) { return noCarrinho.indexOf(u) === -1; }); });
      var livres = carrinho.tamanho ? disp[carrinho.tamanho].livres : [];
      esc1.innerHTML = '<div class="pn-escolhida"><span class="pn-cor" style="--cor:' + esc(f.cor) + '"></span><div><strong>' + esc(f.nome) + '</strong> <span class="pn-cod">' + f.id + '</span><br><small>' +
          R$(f.preco) + ' / 3 dias · dia extra ' + R$(f.diaExtra) + ' · caução ' + R$(f.caucao) + '</small></div>' +
          '<button type="button" class="sis-link" data-pdv="fantasia" data-v="">Trocar</button></div>' +
        (per ? '<div class="pn-tams">' + Object.keys(disp).map(function (t) {
          var n = disp[t].livres.length;
          return '<button type="button" class="pn-tam' + (carrinho.tamanho === t ? ' pn-tam--sel' : '') + '" data-pdv="tamanho" data-v="' + t + '"' + (!n ? ' disabled' : '') + '><b>' + t + '</b><small>' + (n ? n + ' livre' + (n === 1 ? '' : 's') : 'esgotado') + '</small></button>';
        }).join('') + '</div>' +
        (carrinho.tamanho && livres.length ? '<div class="sis-linha-busca"><label class="pn-unidade">Peça <select id="pdv-unidade">' + livres.map(function (u) { return '<option>' + u + '</option>'; }).join('') + '</select></label>' +
          '<button type="button" class="botao botao--destaque pn-botao" data-pdv="adicionar">Adicionar ao pedido</button></div>' : '')
        : '<p class="pn-msg pn-msg--erro">Escolha a data da festa antes de pôr peças.</p>');
    } else {
      esc1.innerHTML = '';
      var lista = carrinho.busca ? L.filtrar(FANTASIAS, { texto: carrinho.busca }) : FANTASIAS.filter(function (x) { return x.temas.indexOf('junina') !== -1; });
      res.innerHTML = (carrinho.busca ? '' : '<p class="pn-dica">Juninas (digite para buscar todas):</p>') + lista.slice(0, 8).map(function (x) {
        return '<button type="button" class="pn-resultado" data-pdv="fantasia" data-v="' + x.id + '"><span class="pn-cor" style="--cor:' + esc(x.cor) + '"></span>' +
          '<span><strong>' + esc(x.nome) + '</strong> <span class="pn-cod">' + x.id + '</span><br><small>' + R$(x.preco) + ' · ' + L.ordenarTamanhos(Object.keys(x.tamanhos)).join(' ') + '</small></span></button>';
      }).join('') + (lista.length ? '' : '<p class="pn-dica">Nenhuma fantasia com esse nome.</p>');
    }

    // complementos: os das peças do pedido primeiro, depois todos
    var vistos = {}, comps = [];
    var ordem = carrinho.itens.map(function (it) { return it.fantasia; }).concat(FANTASIAS.map(function (x) { return x.id; }));
    ordem.forEach(function (fid) {
      var fx = LOJA.fantasiaDe(fid);
      (fx.kit || []).forEach(function (k) {
        var chave = k.nome + '|' + k.preco;
        if (vistos[chave]) return;
        vistos[chave] = 1;
        comps.push({ fantasia: fid, kitId: k.id, nome: k.nome, tipo: k.tipo, preco: k.preco });
      });
    });
    $('pdv-complementos').innerHTML = '<div class="sis-tabela-rolagem"><table class="sis-tabela sis-tabela--compacta"><tbody>' + comps.slice(0, 14).map(function (k) {
      var at = carrinho.complementos.find(function (c) { return c.fantasia === k.fantasia && c.kitId === k.kitId; });
      var dados = esc(JSON.stringify(k));
      return '<tr><td>' + esc(k.nome) + ' <small class="sis-mudo">(' + (k.tipo === 'venda' ? 'venda' : 'aluguel') + ')</small></td><td class="sis-num">' + R$(k.preco) + '</td>' +
        '<td class="sis-qtd"><button type="button" class="pn-icone" data-pdv="comp-menos" data-v="' + dados + '" aria-label="Tirar um">−</button><span>' + (at ? at.qtd : 0) + '</span>' +
        '<button type="button" class="pn-icone" data-pdv="comp-mais" data-v="' + dados + '" aria-label="Pôr um">+</button></td></tr>';
    }).join('') + '</tbody></table></div>';

    // itens do cupom
    var conf = conflitos();
    $('pdv-itens').innerHTML = (carrinho.itens.length || carrinho.complementos.length) ? '<ul class="sis-cupom__itens">' +
      carrinho.itens.map(function (it, i) {
        var fx = LOJA.fantasiaDe(it.fantasia);
        var ruim = conf.indexOf(it) !== -1;
        return '<li' + (ruim ? ' class="sis-ruim"' : '') + '><span>' + esc(fx.nome) + ' ' + it.tamanho + '<small class="pn-cod">' + it.unidade + (ruim ? ' · não está livre nessa data' : '') + '</small></span>' +
          '<span class="sis-num">' + R$(it.preco) + '</span><button type="button" class="pn-icone" data-pdv="tirar" data-v="' + i + '" aria-label="Tirar do pedido">×</button></li>';
      }).join('') +
      carrinho.complementos.map(function (k) {
        return '<li><span>' + esc(k.nome) + (k.qtd > 1 ? ' ×' + k.qtd : '') + '</span><span class="sis-num">' + R$(k.preco * k.qtd) + '</span><span></span></li>';
      }).join('') + '</ul>' : '<p class="pn-dica">Pedido vazio.</p>';
    atualizarTotais();
  }

  function atualizarTotais() {
    if (!$('pdv-totais')) return;
    var v = valoresCarrinho();
    var temAluguel = carrinho.itens.length > 0;
    var agora = !temAluguel || carrinho.recebe === 'total' ? v.total : v.sinal;
    $('pdv-recebe-box').hidden = !temAluguel;
    $('pdv-totais').innerHTML = '<dl class="pn-conta-tab">' +
      (temAluguel ? '<div><dt>Aluguel (' + carrinho.itens.length + (carrinho.itens.length === 1 ? ' peça' : ' peças') + ')</dt><dd>' + R$(v.aluguel) + '</dd></div>' : '') +
      (v.extras ? '<div><dt>Dias extras</dt><dd>' + R$(v.extras) + '</dd></div>' : '') +
      (v.complementos ? '<div><dt>Complementos</dt><dd>' + R$(v.complementos) + '</dd></div>' : '') +
      (v.desconto ? '<div><dt>Desconto</dt><dd>− ' + R$(v.desconto) + '</dd></div>' : '') +
      '<div class="pn-total"><dt>Total</dt><dd>' + R$(v.total) + '</dd></div>' +
      (temAluguel ? '<div><dt>Caução (na entrega, volta na devolução)</dt><dd>' + R$(v.caucao) + '</dd></div>' : '') +
      '<div class="sis-receber"><dt>Receber agora</dt><dd>' + R$(agora) + '</dd></div></dl>';
  }

  function errosCarrinho() {
    var e = [];
    var per = periodoCarrinho();
    if (!carrinho.itens.length && !carrinho.complementos.length) e.push('Ponha ao menos uma peça ou um complemento.');
    if (carrinho.itens.length && !carrinho.clienteId) e.push('Aluguel precisa de cliente cadastrado (vai no contrato).');
    if (carrinho.itens.length && !per) e.push('Escolha a data da festa.');
    if (conflitos().length) e.push('Tire as peças marcadas: não estão livres nessa data.');
    var d = lerValor(carrinho.desconto);
    if (carrinho.desconto && !(d >= 0)) e.push('Desconto em reais, por exemplo 10,00.');
    if (d > 0 && !carrinho.motivoDesconto.trim()) e.push('Diga o motivo do desconto (fica no pedido).');
    return e;
  }

  function irPagamento() {
    var e = errosCarrinho();
    var ul = $('pdv-erros');
    ul.innerHTML = e.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    ul.hidden = !e.length;
    if (e.length) return;
    if (!LOJA.caixaAberto()) { pedirCaixa(irPagamento); return; }
    var v = valoresCarrinho();
    var temAluguel = carrinho.itens.length > 0;
    var devido = !temAluguel || carrinho.recebe === 'total' ? v.total : v.sinal;
    var cli = carrinho.clienteId && LOJA.clientePorId(carrinho.clienteId);
    abrirModal('Pagamento', '<p>' + (temAluguel ? (carrinho.recebe === 'total' ? 'Pedido inteiro' : 'Sinal de ' + v.percentualSinal + '% do pedido') : 'Venda de complementos') + (cli ? ' · ' + esc(cli.nome) : '') + '</p>' +
      '<div id="pg-editor"></div>',
      '<button type="button" class="botao botao--leve" id="pg-voltar">Voltar</button><button type="button" class="botao botao--destaque" id="pg-ok" disabled>Finalizar</button>');
    var ed = editorPagamento($('pg-editor'), devido, { valeDisponivel: cli ? cli.credito : 0, aoMudar: function (r) { $('pg-ok').disabled = !r.ok; } });
    $('pg-voltar').addEventListener('click', function () { modal.close(); });
    $('pg-ok').addEventListener('click', function () {
      var r = ed.resultado();
      if (!r.ok) return;
      var per = periodoCarrinho();
      var p = LOJA.criarPedidoBalcao({
        clienteId: carrinho.clienteId || null, periodo: temAluguel ? per : null, itens: carrinho.itens.slice(), complementos: carrinho.complementos.slice(),
        desconto: { valor: lerValor(carrinho.desconto) || 0, motivo: carrinho.motivoDesconto.trim() }, recebe: carrinho.recebe, linhas: ed.linhas()
      });
      carrinho = carrinhoNovo();
      abrirRecibo(p.id, r.troco);
    });
  }

  /* ---------- editor de pagamento (várias formas, troco, parcelas, conferência) ---------- */
  function editorPagamento(box, devido, op) {
    var linhas = [{ forma: 'pix', valor: devido, entregue: '', parcelas: 1, confirmado: false, nsu: '' }];
    var ultimo = null;
    function lido() {
      return linhas.map(function (l) { return { forma: l.forma, valor: lerValor(l.valor), entregue: l.forma === 'dinheiro' && l.entregue !== '' ? lerValor(l.entregue) : null, parcelas: Number(l.parcelas) || 1, confirmado: l.confirmado, nsu: l.nsu }; });
    }
    function conta() { ultimo = L.validarPagamentos(devido, lido(), { valeDisponivel: op.valeDisponivel || 0, parcelas: PAG }); return ultimo; }
    function pintar() {
      box.innerHTML = '<div class="pg-devido"><span>Valor a receber</span><strong>' + R$(devido) + '</strong></div>' +
        '<div class="pg-linhas">' + linhas.map(function (l, i) {
          var f = FORMAS[l.forma];
          var v = lerValor(l.valor) || 0;
          var extra = '';
          if (l.forma === 'dinheiro') extra = '<label>Cliente entregou <input data-pg="entregue" data-i="' + i + '" inputmode="decimal" placeholder="' + campoValor(v) + '" value="' + esc(l.entregue) + '"></label><span class="pg-troco" id="pg-troco-' + i + '"></span>';
          if (l.forma === 'pix') extra = '<span class="pg-info">Chave Pix: <strong>' + esc(PAG.chavePix || '(preencha em config.js)') + '</strong></span>' +
            '<label class="pg-ok"><input type="checkbox" data-pg="confirmado" data-i="' + i + '"' + (l.confirmado ? ' checked' : '') + '> Conferi o crédito no app do banco</label>';
          if (l.forma === 'credito') {
            var max = L.maxParcelas(v, PAG);
            extra = '<label>Parcelas <select data-pg="parcelas" data-i="' + i + '">' + Array.from({ length: max }, function (_, k) {
              var n = k + 1, parc = L.dividirParcelas(v, n);
              return '<option value="' + n + '"' + (Number(l.parcelas) === n ? ' selected' : '') + '>' + n + 'x de ' + R$(parc[parc.length - 1]) + (n === 1 ? ' (à vista)' : ' sem juros') + '</option>';
            }).join('') + '</select></label>';
          }
          if (f.cartao) extra += '<label class="pg-ok"><input type="checkbox" data-pg="confirmado" data-i="' + i + '"' + (l.confirmado ? ' checked' : '') + '> Maquininha mostrou "aprovado"</label>' +
            '<label>Autorização/NSU (opcional) <input data-pg="nsu" data-i="' + i + '" value="' + esc(l.nsu) + '" inputmode="numeric"></label>';
          if (l.forma === 'vale') extra = '<span class="pg-info">Crédito disponível: <strong>' + R$(op.valeDisponivel || 0) + '</strong></span>';
          return '<div class="pg-linha">' +
            '<div class="pg-linha__base"><select data-pg="forma" data-i="' + i + '" aria-label="Forma de pagamento">' + Object.keys(FORMAS).filter(function (k) { return k !== 'vale' || (op.valeDisponivel || 0) > 0 || l.forma === 'vale'; }).map(function (k) {
              return '<option value="' + k + '"' + (k === l.forma ? ' selected' : '') + '>' + FORMAS[k].nome + '</option>';
            }).join('') + '</select>' +
            '<input data-pg="valor" data-i="' + i + '" inputmode="decimal" aria-label="Valor" value="' + esc(typeof l.valor === 'number' ? campoValor(l.valor) : l.valor) + '">' +
            (linhas.length > 1 ? '<button type="button" class="pn-icone" data-pg="tirar" data-i="' + i + '" aria-label="Tirar esta forma">×</button>' : '') + '</div>' +
            '<div class="pg-linha__extra">' + extra + '</div></div>';
        }).join('') + '</div>' +
        '<button type="button" class="sis-link" data-pg="mais">+ Dividir em outra forma de pagamento</button>' +
        '<dl class="pg-status" id="pg-status"></dl><ul class="pn-erros" id="pg-erros" hidden></ul>';
      status();
    }
    function status() {
      var r = conta();
      $('pg-status').innerHTML = '<div><dt>Recebido</dt><dd>' + R$(r.soma) + '</dd></div><div' + (r.falta ? ' class="pg-falta"' : '') + '><dt>Falta</dt><dd>' + R$(r.falta) + '</dd></div>' +
        '<div' + (r.troco ? ' class="pg-dartroco"' : '') + '><dt>Troco</dt><dd>' + R$(r.troco) + '</dd></div>';
      linhas.forEach(function (l, i) {
        var t = $('pg-troco-' + i);
        if (t) { var tr = l.entregue !== '' ? (lerValor(l.entregue) || 0) - (lerValor(l.valor) || 0) : 0; t.textContent = tr > 0 ? 'Troco: ' + R$(Math.round(tr * 100) / 100) : ''; }
      });
      var ul = $('pg-erros');
      var mostrar = r.erros.filter(function (e) { return !/confirme/.test(e) || r.falta === 0; });
      ul.innerHTML = mostrar.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('');
      ul.hidden = !mostrar.length;
      if (op.aoMudar) op.aoMudar(r);
    }
    box.addEventListener('input', function (e) {
      var k = e.target.dataset.pg, i = Number(e.target.dataset.i);
      if (k === 'valor' || k === 'entregue' || k === 'nsu') { linhas[i][k] = e.target.value; status(); }
    });
    box.addEventListener('change', function (e) {
      var k = e.target.dataset.pg, i = Number(e.target.dataset.i);
      if (k === 'forma') { linhas[i].forma = e.target.value; linhas[i].confirmado = false; linhas[i].parcelas = 1; pintar(); }
      else if (k === 'parcelas') { linhas[i].parcelas = Number(e.target.value); status(); }
      else if (k === 'confirmado') { linhas[i].confirmado = e.target.checked; status(); }
      else if (k === 'valor' && linhas[i].forma === 'credito') { pintar(); } // as parcelas dependem do valor
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pg]');
      if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
      if (b.dataset.pg === 'mais') { var r = conta(); linhas.push({ forma: 'dinheiro', valor: r.falta || '', entregue: '', parcelas: 1, confirmado: false, nsu: '' }); pintar(); }
      if (b.dataset.pg === 'tirar') { linhas.splice(Number(b.dataset.i), 1); pintar(); }
    });
    pintar();
    return { linhas: lido, resultado: conta };
  }

  function pedirCaixa(depois) {
    abrirModal('Abrir o caixa', '<p>Para receber pagamentos, abra o caixa com o dinheiro que está na gaveta para troco.</p>' +
      '<div class="pn-campos"><label>Fundo de troco (R$) <input id="cx-fundo" inputmode="decimal" value="100,00"></label></div><p class="pn-msg pn-msg--erro" id="cx-erro" hidden></p>',
      '<button type="button" class="botao botao--leve" id="cx-voltar">Voltar</button><button type="button" class="botao botao--destaque" id="cx-abrir">Abrir caixa</button>');
    $('cx-voltar').addEventListener('click', function () { modal.close(); });
    $('cx-abrir').addEventListener('click', function () {
      var v = lerValor($('cx-fundo').value);
      if (!(v >= 0)) { $('cx-erro').textContent = 'Valor em reais, por exemplo 100,00.'; $('cx-erro').hidden = false; return; }
      LOJA.abrirCaixa(v);
      modal.close();
      if (depois) depois();
    });
  }

  function abrirRecibo(id, troco) {
    var p = LOJA.porId(id);
    var cli = p.clienteId && LOJA.clientePorId(p.clienteId);
    abrirModal('Pedido ' + p.id + ' registrado',
      '<div class="sis-recibo">' +
        '<p class="sis-recibo__marca">' + esc(C.nomeSite) + ' · ' + esc(C.atelie) + '</p>' +
        '<p>Recibo do pedido <strong>' + p.id + '</strong> · ' + esc(L.dataBR(dia())) + ' · atendente ' + esc(LOJA.operador()) + '</p>' +
        (cli ? '<p>Cliente: ' + esc(cli.nome) + ' · CPF ' + L.mascararCpf(cli.cpf) + '</p>' : '<p>Cliente não identificado</p>') +
        ((p.itens || []).length ? '<p>Retira ' + esc(L.dataComDia(p.retirada)) + ' · devolve até <strong>' + esc(L.dataComDia(p.devolucao)) + '</strong></p>' : '') +
        htmlValores(p) + htmlPagamentos(p) +
        (troco ? '<p class="pn-msg pn-msg--ok">Troco: ' + R$(troco) + '</p>' : '') +
        '<p class="sis-mudo">Recibo simples, não é documento fiscal. A nota fiscal (NFC-e) sai do emissor do ateliê.</p>' +
      '</div>',
      ((p.itens || []).length && p.retirada === dia() ? botao('retirar', p.id, 'Entregar agora', true) : '') +
      '<button type="button" class="botao botao--leve" id="rc-ok">Fechar</button>');
    $('rc-ok').addEventListener('click', function () { modal.close(); render(); });
  }

  function htmlValores(p) {
    var v = p.valores;
    return '<dl class="pn-conta-tab">' +
      (p.itens || []).map(function (it) { var f = LOJA.fantasiaDe(it.fantasia); return '<div><dt>' + esc(f.nome) + ' ' + it.tamanho + ' <span class="pn-cod">' + it.unidade + '</span></dt><dd>' + R$(it.preco) + '</dd></div>'; }).join('') +
      (v.extras ? '<div><dt>Dias extras (' + p.diasExtras + ')</dt><dd>' + R$(v.extras) + '</dd></div>' : '') +
      (p.complementos || []).map(function (k) { return '<div><dt>' + esc(k.nome) + (k.qtd > 1 ? ' ×' + k.qtd : '') + '</dt><dd>' + R$(k.preco * (k.qtd || 1)) + '</dd></div>'; }).join('') +
      (v.desconto ? '<div><dt>Desconto' + (p.desconto && p.desconto.motivo ? ' (' + esc(p.desconto.motivo) + ')' : '') + '</dt><dd>− ' + R$(v.desconto) + '</dd></div>' : '') +
      '<div class="pn-total"><dt>Total</dt><dd>' + R$(v.total) + '</dd></div>' +
      ((p.itens || []).length ? '<div><dt>Falta receber do aluguel</dt><dd>' + R$(LOJA.saldo(p)) + '</dd></div><div><dt>Caução</dt><dd>' + R$(v.caucao) + '</dd></div>' : '') + '</dl>';
  }
  function htmlPagamentos(p) {
    var pags = p.pagamentos || [];
    if (!pags.length) return '<p class="pn-dica">' + (p.origem === 'exemplo' ? 'Pedido de exemplo: o sinal já foi pago antes.' : 'Nenhum pagamento ainda.') + '</p>';
    return '<div class="sis-tabela-rolagem"><table class="sis-tabela sis-tabela--compacta"><thead><tr><th>Dia</th><th>O quê</th><th>Forma</th><th class="sis-num">Valor</th></tr></thead><tbody>' + pags.map(function (x) {
      var saida = x.tipo === 'caucao_devolvida' || x.tipo === 'estorno';
      return '<tr><td>' + esc(L.dataBR(x.dia).slice(0, 5)) + '</td><td>' + TIPOS[x.tipo] + '</td><td>' + esc(FORMAS[x.forma] ? FORMAS[x.forma].nome : x.forma) + (x.parcelas > 1 ? ' ' + x.parcelas + 'x' : '') + '</td>' +
        '<td class="sis-num ' + (saida ? 'pn-saida' : 'pn-entrada') + '">' + (saida ? '− ' : '+ ') + R$(x.valor) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  /* =====================================================================
   * MODAIS: pedido, sinal, entrega, devolução, cancelamento
   * ===================================================================== */
  function abrirModal(titulo, corpo, rodape) {
    modal.innerHTML = '<div class="pn-modal__topo"><h2 id="pn-modal-titulo">' + titulo + '</h2>' +
      '<button type="button" class="sim-whats__fechar" id="pn-modal-fechar" aria-label="Fechar">×</button></div>' +
      '<div class="pn-modal__corpo">' + corpo + '</div>' + (rodape ? '<div class="pn-modal__rodape">' + rodape + '</div>' : '');
    $('pn-modal-fechar').addEventListener('click', function () { modal.close(); });
    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
  }
  function cabeca(p) {
    return '<div class="pn-cabeca"><p><strong>' + esc(nome(p)) + '</strong> <span class="pn-cod">' + p.id + '</span> ' + chip(p) + '</p>' +
      '<p>' + esc(pecasTxt(p)) + ' · <span class="pn-cod">' + esc(unidadesTxt(p)) + '</span></p>' +
      ((p.itens || []).length ? '<p>Retira ' + esc(L.dataComDia(p.retirada)) + ' · devolve até <strong>' + esc(L.dataComDia(p.devolucao)) + '</strong></p>' : '') + '</div>';
  }

  function abrirPedido(id) {
    var p = LOJA.porId(id);
    var st = visivel(p);
    var acoes = '';
    if (st === 'pendente') acoes = botao('confirmar', p.id, 'Sinal recebido', true) + botao('recusar', p.id, 'Recusar');
    if (st === 'confirmada' && (p.itens || []).length) acoes = (dia() >= p.retirada ? botao('retirar', p.id, 'Entregar', true) : '') + '<button type="button" class="botao botao--leve pn-botao" id="pd-cancelar">Cancelar pedido</button>';
    if (st === 'retirada' || st === 'atrasada') acoes = lembrete(p) + botao('devolver', p.id, 'Receber de volta', true);
    abrirModal('Pedido ' + p.id, cabeca(p) +
      '<p class="sis-mudo">Origem: ' + ({ site: 'pedido pelo site', balcao: 'balcão', exemplo: 'pedido de exemplo' }[p.origem]) + (p.dataFesta ? ' · festa ' + esc(L.dataBR(p.dataFesta)) : '') + '</p>' +
      '<h3>Valores</h3>' + htmlValores(p) + '<h3>Pagamentos</h3>' + htmlPagamentos(p) +
      (p.acerto ? '<h3>Acerto da devolução</h3><p>Retido ' + R$(p.acerto.retido) + ' (atraso ' + R$(p.acerto.multa) + ', danos ' + R$(p.acerto.danos) + ') · devolvido ' + R$(p.acerto.devolver) + (p.acerto.cobrar ? ' · cobrado à parte ' + R$(p.acerto.cobrar) : '') + '</p>' : '') +
      (p.vistorias && p.vistorias.retirada ? htmlLaudo(p.vistorias.retirada, 'Laudo da entrega') : '') +
      (p.vistorias && p.vistorias.devolucao ? htmlLaudo(p.vistorias.devolucao, 'Laudo da devolução') : '') +
      (p.virouCredito ? '<p class="pn-msg pn-msg--ok">Cancelado: ' + R$(p.virouCredito) + ' viraram crédito na loja para o cliente.</p>' : '') +
      '<div id="pd-cancelamento"></div>', acoes);
    var bc = $('pd-cancelar');
    if (bc) bc.addEventListener('click', function () { mostrarCancelamento(p); });
  }

  function mostrarCancelamento(p) {
    var pago = Math.round((p.valores.total - LOJA.saldo(p)) * 100) / 100;
    var rb = L.reembolsoCancelamento(pago, p.retirada, dia());
    $('pd-cancelamento').innerHTML = '<div class="pn-cancelar"><h3>Cancelar</h3>' +
      (rb.integral ? '<p>Faltam ' + rb.diasAntes + ' dias para a retirada: o cliente recebe de volta <strong>' + R$(pago) + '</strong>.</p>' +
        '<div class="pn-campos"><label>Estornar por <select id="pd-forma">' + ['pix', 'dinheiro', 'debito', 'credito'].map(function (k) { return '<option value="' + k + '">' + FORMAS[k].nome + '</option>'; }).join('') + '</select></label></div>'
        : '<p>Faltam ' + Math.max(0, rb.diasAntes) + ' dias para a retirada (menos de 7). Pela política do ateliê, os <strong>' + R$(pago) + '</strong> pagos viram crédito na loja para o cliente usar em outra data.</p>') +
      '<button type="button" class="botao botao--destaque" id="pd-ok">' + (rb.integral ? 'Cancelar e estornar ' + R$(pago) : 'Cancelar e gerar crédito de ' + R$(pago)) + '</button></div>';
    $('pd-ok').addEventListener('click', function () {
      if (rb.integral && !LOJA.caixaAberto()) { pedirCaixa(function () { mostrarCancelamentoDepois(p, rb); }); return; }
      mostrarCancelamentoDepois(p, rb);
    });
  }
  function mostrarCancelamentoDepois(p, rb) {
    var forma = $('pd-forma') ? $('pd-forma').value : 'pix';
    LOJA.cancelar(p.id, { forma: rb.integral ? forma : null, motivo: rb.integral ? 'Cancelado com estorno' : 'Cancelado; sinal em crédito' });
    if (modal.open) modal.close();
  }

  // Pedido do site: escolhe ou cadastra o cliente e registra o Pix do sinal.
  function abrirSinal(id) {
    if (!LOJA.caixaAberto()) { pedirCaixa(function () { abrirSinal(id); }); return; }
    var p = LOJA.porId(id);
    var escolhido = '';
    abrirModal('Sinal recebido · ' + p.id, cabeca(p) +
      '<h3>1. Quem é o cliente</h3><div class="sis-linha-busca"><input type="search" id="sn-busca" class="pn-busca" placeholder="Buscar por nome, CPF ou WhatsApp">' +
      botao('novo-cliente', '', '+ Novo cliente', false, ' data-volta="sinal:' + p.id + '"') + '</div><div id="sn-res"></div>' +
      '<h3>2. Pagamento do sinal</h3><div id="sn-pg"></div>',
      '<button type="button" class="botao botao--leve" id="sn-voltar">Voltar</button><button type="button" class="botao botao--destaque" id="sn-ok" disabled>Confirmar pedido</button>');
    var ok = false;
    var ed = editorPagamento($('sn-pg'), p.valores.sinal, { aoMudar: function (r) { ok = r.ok; $('sn-ok').disabled = !(ok && escolhido); } });
    function achar() {
      var t = L.normalizar($('sn-busca').value), dg = $('sn-busca').value.replace(/\D/g, '');
      var lista = t.length < 2 ? [] : LOJA.clientes().filter(function (x) { return !x.anonimizado && (L.normalizar(x.nome).indexOf(t) !== -1 || (dg.length >= 3 && (x.cpf.indexOf(dg) !== -1 || x.whatsapp.indexOf(dg) !== -1))); }).slice(0, 5);
      $('sn-res').innerHTML = lista.map(function (x) {
        return '<label class="sis-opcao"><input type="radio" name="sn-cli" value="' + x.id + '"' + (x.id === escolhido ? ' checked' : '') + '> ' + esc(x.nome) + ' <small class="sis-mudo">CPF ' + L.mascararCpf(x.cpf) + ' · ' + esc(formatarFone(x.whatsapp)) + '</small></label>';
      }).join('') || '<p class="pn-dica">Busque o cliente; se for a primeira vez, cadastre.</p>';
    }
    $('sn-busca').addEventListener('input', achar);
    $('sn-res').addEventListener('change', function (e) { escolhido = e.target.value; $('sn-ok').disabled = !(ok && escolhido); });
    $('sn-voltar').addEventListener('click', function () { modal.close(); });
    $('sn-ok').addEventListener('click', function () {
      LOJA.confirmarSinal(p.id, { clienteId: escolhido, linhas: ed.linhas() });
      modal.close();
    });
    achar();
  }

  /* ---------- fotos da vistoria ---------- */
  function htmlFotos(pref) {
    return '<div class="pn-fotos">' + FOTOS.map(function (f) {
      return '<div class="pn-foto"><div class="pn-foto__img" id="' + pref + '-img-' + f[0] + '"><span>' + f[1] + '</span></div>' +
        '<label class="pn-foto__botao">Tirar foto<input type="file" accept="image/*" capture="environment" data-foto="' + f[0] + '"></label>' +
        '<button type="button" class="sis-link" data-simular="' + f[0] + '">simular</button></div>';
    }).join('') + '</div>';
  }
  function reduzir(src, cb) {
    var img = new Image();
    img.onload = function () {
      var k = Math.min(1, 320 / Math.max(img.width, img.height));
      var cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cb(cv.toDataURL('image/jpeg', 0.7));
    };
    img.src = src;
  }
  function fotoSimulada(rot, p) {
    var cv = document.createElement('canvas'); cv.width = 240; cv.height = 300;
    var g = cv.getContext('2d');
    g.fillStyle = LOJA.fantasiaDe(p.itens[0].fantasia).cor; g.fillRect(0, 0, 240, 300);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 22px sans-serif'; g.fillText(rot, 16, 40);
    g.font = '14px sans-serif'; g.fillText(unidadesTxt(p).slice(0, 26), 16, 64); g.fillText(L.dataBR(dia()), 16, 84); g.fillText('foto simulada', 16, 280);
    return cv.toDataURL('image/jpeg', 0.6);
  }
  function ligarFotos(pref, p, fotos) {
    modal.querySelectorAll('[data-foto]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var a = inp.files && inp.files[0];
        if (!a) return;
        var r = new FileReader();
        r.onload = function () { reduzir(r.result, function (u) { fotos[inp.dataset.foto] = u; pintar(); }); };
        r.readAsDataURL(a);
      });
    });
    modal.querySelectorAll('[data-simular]').forEach(function (b) {
      b.addEventListener('click', function () { fotos[b.dataset.simular] = fotoSimulada(FOTOS.find(function (x) { return x[0] === b.dataset.simular; })[1], p); pintar(); });
    });
    function pintar() {
      FOTOS.forEach(function (f) {
        var box = $(pref + '-img-' + f[0]);
        box.innerHTML = fotos[f[0]] ? '<img src="' + fotos[f[0]] + '" alt="' + f[1] + '">' : '<span>' + f[1] + '</span>';
        box.classList.toggle('pn-foto__img--ok', !!fotos[f[0]]);
      });
    }
  }
  function htmlLaudo(v, titulo) {
    if (!v) return '<p class="pn-dica">' + titulo + ': sem laudo no simulador (pedido de exemplo).</p>';
    var fotos = FOTOS.map(function (f) { return v.fotos && v.fotos[f[0]] ? '<figure><img src="' + v.fotos[f[0]] + '" alt="' + f[1] + '"><figcaption>' + f[1] + '</figcaption></figure>' : ''; }).join('');
    return '<div class="pn-laudo"><p><strong>' + titulo + '</strong> · ' + esc(L.dataComDia(v.dia)) + '</p>' +
      (fotos ? '<div class="pn-laudo__fotos">' + fotos + '</div>' : v.fotosApagadasEm ? '<p class="sis-mudo">Fotos apagadas em ' + esc(L.dataBR(v.fotosApagadasEm)) + ' (fim do prazo de guarda).</p>' : '') +
      '<p>Defeitos anotados: ' + ((v.defeitos || []).length || v.obs ? esc((v.defeitos || []).concat(v.obs ? [v.obs] : []).join('; ')) : 'nenhum') + '</p></div>';
  }

  function abrirRetirada(id) {
    if (!LOJA.caixaAberto()) { pedirCaixa(function () { abrirRetirada(id); }); return; }
    var p = LOJA.porId(id);
    var saldo = LOJA.saldo(p);
    var caucaoPaga = LOJA.caucaoRecebida(p);
    var cli = p.clienteId && LOJA.clientePorId(p.clienteId);
    var fotos = {}, defeitos = [];
    var okS = !saldo, okC = caucaoPaga;
    abrirModal('Entrega · ' + p.id, cabeca(p) +
      '<h3>1. Saldo do aluguel</h3>' + (saldo ? '<div id="rt-saldo"></div>' : '<p class="pn-msg pn-msg--ok">Aluguel já pago.</p>') +
      '<h3>2. Caução (volta na devolução)</h3>' + (caucaoPaga ? '<p class="pn-msg pn-msg--ok">Caução já recebida.</p>' : '<div id="rt-caucao"></div>') +
      '<h3>3. Vistoria com fotos</h3><p class="pn-dica">As quatro fotos são obrigatórias, de cada peça. Elas protegem o ateliê e o cliente na devolução.</p>' + htmlFotos('rt') +
      '<p class="pn-rotulo">Defeitos que a peça já tem</p><div class="pn-chips" id="rt-def">' + DEFEITOS.map(function (d) { return '<button type="button" class="pn-chip" aria-pressed="false" data-def="' + esc(d) + '">' + esc(d) + '</button>'; }).join('') + '</div>' +
      '<label class="pn-bloco">Onde e como <textarea id="rt-obs" rows="2" placeholder="Ex.: mancha pequena na barra, lado esquerdo"></textarea></label>' +
      '<label class="pn-aceite"><input type="checkbox" id="rt-aceite"> O cliente conferiu as fotos, os defeitos e assinou o contrato.</label>' +
      '<p class="pn-msg pn-msg--erro" id="rt-erro" hidden></p>',
      '<button type="button" class="botao botao--leve" id="rt-voltar">Agora não</button><button type="button" class="botao botao--destaque" id="rt-ok">Confirmar entrega</button>');
    var edS = saldo ? editorPagamento($('rt-saldo'), saldo, { valeDisponivel: cli ? cli.credito : 0, aoMudar: function (r) { okS = r.ok; } }) : null;
    var edC = caucaoPaga ? null : editorPagamento($('rt-caucao'), p.valores.caucao, { aoMudar: function (r) { okC = r.ok; } });
    ligarFotos('rt', p, fotos);
    $('rt-def').addEventListener('click', function (e) {
      var b = e.target.closest('[data-def]'); if (!b) return;
      var on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      defeitos = on ? defeitos.concat([b.dataset.def]) : defeitos.filter(function (d) { return d !== b.dataset.def; });
    });
    $('rt-voltar').addEventListener('click', function () { modal.close(); });
    $('rt-ok').addEventListener('click', function () {
      var faltam = FOTOS.filter(function (f) { return !fotos[f[0]]; }).map(function (f) { return f[1].toLowerCase(); });
      var erro = !okS ? 'Feche o pagamento do saldo.' : !okC ? 'Feche o pagamento da caução.' : faltam.length ? 'Falta foto: ' + faltam.join(', ') + '.' : !$('rt-aceite').checked ? 'Marque que o cliente conferiu e assinou.' : '';
      if (erro) { $('rt-erro').textContent = erro; $('rt-erro').hidden = false; return; }
      LOJA.registrarRetirada(id, { linhasSaldo: edS ? edS.linhas() : [], linhasCaucao: edC ? edC.linhas() : [],
        vistoria: { dia: dia(), fotos: fotos, defeitos: defeitos, obs: $('rt-obs').value.trim() } });
      modal.close();
    });
  }

  function abrirDevolucao(id) {
    if (!LOJA.caixaAberto()) { pedirCaixa(function () { abrirDevolucao(id); }); return; }
    var p = LOJA.porId(id);
    var diaExtra = p.itens.reduce(function (s, it) { return s + it.diaExtra; }, 0);
    var atraso = Math.max(0, L.diasEntre(p.devolucao, dia()) || 0);
    var fotos = {}, danos = [];
    var edCob = null, okCob = true;
    abrirModal('Devolução · ' + p.id, cabeca(p) +
      (atraso ? '<p class="pn-msg pn-msg--erro">Voltou com ' + atraso + (atraso === 1 ? ' dia' : ' dias') + ' de atraso: ' + R$(atraso * diaExtra) + ' (dia extra das peças: ' + R$(diaExtra) + ').</p>' : '<p class="pn-msg pn-msg--ok">Dentro do prazo.</p>') +
      htmlLaudo(p.vistorias && p.vistorias.retirada, 'Laudo da entrega') +
      '<h3>1. Fotos da devolução</h3>' + htmlFotos('dv') +
      '<h3>2. Dano novo</h3><p class="pn-dica">Só o que não está no laudo da entrega, cada item com seu valor: é o que o cliente recebe por escrito.</p>' +
      '<ul class="pn-danos" id="dv-danos"></ul>' +
      '<div class="pn-campos pn-campos--dano"><label>O quê <input id="dv-desc" placeholder="Ex.: rasgo de 3 cm na manga"></label><label>Valor (R$) <input id="dv-valor" inputmode="decimal" placeholder="0,00"></label>' +
      '<button type="button" class="botao botao--leve" id="dv-add">Adicionar</button></div>' +
      '<h3>3. Acerto da caução</h3><div id="dv-acerto"></div>' +
      '<div class="pn-campos" id="dv-forma-box"><label>Devolver a caução por <select id="dv-forma">' + ['pix', 'dinheiro'].map(function (k) { return '<option value="' + k + '">' + FORMAS[k].nome + '</option>'; }).join('') + '</select></label></div>' +
      '<div id="dv-cobranca"></div>' +
      '<label class="pn-aceite"><input type="checkbox" id="dv-aceite"> O cliente conferiu as fotos e o acerto.</label><p class="pn-msg pn-msg--erro" id="dv-erro" hidden></p>',
      '<button type="button" class="botao botao--leve" id="dv-voltar">Agora não</button><button type="button" class="botao botao--destaque" id="dv-ok">Confirmar devolução</button>');
    function conta() { return L.acertoDevolucao({ caucao: p.valores.caucao, danos: danos, diasAtraso: atraso, valorDiaAtraso: diaExtra }); }
    var cobrarAntes = -1;
    function pintar() {
      $('dv-danos').innerHTML = danos.length ? danos.map(function (d, i) { return '<li><span>' + esc(d.descricao) + '</span><span>' + R$(d.valor) + '</span><button type="button" class="sis-link" data-rem="' + i + '">tirar</button></li>'; }).join('') : '<li class="pn-dica">Nenhum dano novo.</li>';
      var a = conta();
      $('dv-acerto').innerHTML = '<dl class="pn-conta-tab"><div><dt>Caução</dt><dd>' + R$(a.caucao) + '</dd></div>' +
        (a.multa ? '<div><dt>Atraso (' + a.diasAtraso + ' dia' + (a.diasAtraso === 1 ? '' : 's') + ')</dt><dd>− ' + R$(a.multa) + '</dd></div>' : '') +
        (a.danos ? '<div><dt>Danos novos</dt><dd>− ' + R$(a.danos) + '</dd></div>' : '') +
        '<div class="pn-total"><dt>Devolver ao cliente</dt><dd>' + R$(a.devolver) + '</dd></div>' +
        (a.cobrar ? '<div class="pn-cobrar"><dt>Passou da caução: cobrar</dt><dd>' + R$(a.cobrar) + '</dd></div>' : '') + '</dl>';
      $('dv-forma-box').hidden = !a.devolver;
      if (a.cobrar !== cobrarAntes) {
        cobrarAntes = a.cobrar;
        if (a.cobrar) { $('dv-cobranca').innerHTML = '<h3>Receber a diferença</h3><div id="dv-cob-ed"></div>'; edCob = editorPagamento($('dv-cob-ed'), a.cobrar, { aoMudar: function (r) { okCob = r.ok; } }); }
        else { $('dv-cobranca').innerHTML = ''; edCob = null; okCob = true; }
      }
    }
    ligarFotos('dv', p, fotos);
    $('dv-add').addEventListener('click', function () {
      var desc = $('dv-desc').value.trim(), v = lerValor($('dv-valor').value);
      if (!desc || !(v > 0)) { $('dv-erro').textContent = 'Descreva o dano e ponha um valor maior que zero.'; $('dv-erro').hidden = false; return; }
      $('dv-erro').hidden = true; danos.push({ descricao: desc, valor: v }); $('dv-desc').value = ''; $('dv-valor').value = ''; pintar();
    });
    $('dv-danos').addEventListener('click', function (e) { var b = e.target.closest('[data-rem]'); if (b) { danos.splice(Number(b.dataset.rem), 1); pintar(); } });
    $('dv-voltar').addEventListener('click', function () { modal.close(); });
    $('dv-ok').addEventListener('click', function () {
      var faltam = FOTOS.filter(function (f) { return !fotos[f[0]]; }).map(function (f) { return f[1].toLowerCase(); });
      var erro = faltam.length ? 'Falta foto: ' + faltam.join(', ') + '.' : !okCob ? 'Feche o pagamento da diferença.' : !$('dv-aceite').checked ? 'Marque que o cliente conferiu o acerto.' : '';
      if (erro) { $('dv-erro').textContent = erro; $('dv-erro').hidden = false; return; }
      LOJA.registrarDevolucao(id, { acerto: conta(), danos: danos.slice(), forma: $('dv-forma').value, linhasCobranca: edCob ? edCob.linhas() : null,
        vistoria: { dia: dia(), fotos: fotos, defeitos: danos.map(function (d) { return d.descricao; }), obs: '' } });
      modal.close();
    });
    pintar();
  }

  /* =====================================================================
   * PEDIDOS
   * ===================================================================== */
  var filtroPedidos = 'ativas', buscaPedidos = '', limite = 40;
  var FILTROS = [
    ['ativas', 'Em andamento', function (s) { return s === 'pendente' || s === 'confirmada' || s === 'retirada' || s === 'atrasada'; }],
    ['pendente', 'Aguardando sinal', function (s) { return s === 'pendente'; }],
    ['confirmada', 'Confirmados', function (s) { return s === 'confirmada'; }],
    ['retirada', 'Com o cliente', function (s) { return s === 'retirada'; }],
    ['atrasada', 'Atrasados', function (s) { return s === 'atrasada'; }],
    ['concluida', 'Concluídos', function (s) { return s === 'concluida'; }],
    ['cancelada', 'Cancelados', function (s) { return s === 'cancelada' || s === 'expirada'; }],
    ['todas', 'Todos', function () { return true; }]
  ];
  function htmlPedidos() {
    var rs = LOJA.todos();
    var filtro = FILTROS.find(function (x) { return x[0] === filtroPedidos; });
    var t = L.normalizar(buscaPedidos);
    var desc = filtroPedidos === 'concluida' || filtroPedidos === 'cancelada';
    var lista = rs.filter(function (p) { return filtro[2](visivel(p)); }).filter(function (p) {
      return !t || L.normalizar([p.id, nome(p), pecasTxt(p), unidadesTxt(p)].join(' ')).indexOf(t) !== -1;
    }).sort(function (a, b) { var r = a.retirada < b.retirada ? -1 : a.retirada > b.retirada ? 1 : 0; return desc ? -r : r; });
    return '<div class="sis-barra">' + botao('ir', '', '+ Nova venda', true, ' data-pagina="venda"') +
      '<input type="search" id="sis-busca-ped" class="pn-busca" placeholder="Buscar por pedido, cliente, fantasia ou peça" value="' + esc(buscaPedidos) + '"></div>' +
      '<div class="pn-filtros">' + FILTROS.map(function (x) {
        var n = rs.filter(function (p) { return x[2](visivel(p)); }).length;
        return '<button type="button" class="pn-filtro" data-acao="filtro" data-filtro="' + x[0] + '" aria-pressed="' + (x[0] === filtroPedidos) + '">' + x[1] + ' <span>' + n + '</span></button>';
      }).join('') + '</div>' +
      tabelaPedidos(lista.slice(0, limite).map(function (p) {
        var s = visivel(p);
        var a = s === 'pendente' ? botao('confirmar', p.id, 'Sinal recebido', true) : s === 'confirmada' && dia() >= p.retirada && (p.itens || []).length ? botao('retirar', p.id, 'Entregar', true)
          : s === 'retirada' || s === 'atrasada' ? botao('devolver', p.id, 'Receber de volta') : '';
        return linha(p, R$(p.valores.total) + (LOJA.saldo(p) && s !== 'cancelada' ? ' · falta ' + R$(LOJA.saldo(p)) : ''), a);
      }), 'Nenhum pedido neste filtro.') +
      (lista.length > limite ? '<button type="button" class="botao botao--leve" data-acao="mais">Mostrar mais (' + (lista.length - limite) + ')</button>' : '');
  }

  /* =====================================================================
   * CLIENTES (cadastro dentro da LGPD)
   * ===================================================================== */
  var buscaClientes = '';
  function htmlClientes() {
    var t = L.normalizar(buscaClientes), dg = buscaClientes.replace(/\D/g, '');
    var todos = LOJA.clientes();
    var lista = todos.filter(function (c) {
      return !t || L.normalizar(c.nome).indexOf(t) !== -1 || (dg.length >= 3 && (c.cpf.indexOf(dg) !== -1 || c.whatsapp.indexOf(dg) !== -1));
    }).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
    var linhas = LOJA.linhasPorPeca();
    return '<div class="sis-barra">' + botao('novo-cliente', '', '+ Novo cliente', true) +
      '<input type="search" id="sis-busca-cli" class="pn-busca" placeholder="Buscar por nome, CPF ou WhatsApp" value="' + esc(buscaClientes) + '"></div>' +
      '<p class="pn-dica">' + todos.length + ' clientes. O CPF aparece mascarado na lista; o número completo só na ficha, e ver fica registrado.</p>' +
      '<div class="sis-tabela-rolagem"><table class="sis-tabela"><thead><tr><th>Cliente</th><th>CPF</th><th>WhatsApp</th><th class="sis-num">Locações</th><th class="sis-num">Crédito</th><th>Novidades</th></tr></thead><tbody>' +
      lista.slice(0, limite).map(function (c) {
        var n = linhas.filter(function (l) { return l.clienteId === c.id; }).length;
        return '<tr><td><button type="button" class="sis-link sis-forte" data-acao="cliente" data-id="' + c.id + '">' + esc(c.nome) + '</button> <span class="pn-cod">' + c.id + '</span></td>' +
          '<td class="pn-cod">' + (c.anonimizado ? '—' : L.mascararCpf(c.cpf)) + '</td><td>' + esc(formatarFone(c.whatsapp)) + '</td><td class="sis-num">' + n + '</td>' +
          '<td class="sis-num">' + (c.credito ? R$(c.credito) : '') + '</td><td>' + (c.marketing && c.marketing.consentido ? '<span class="pn-status pn-status--ok">aceitou</span>' : '<span class="sis-mudo">não</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (lista.length > limite ? '<button type="button" class="botao botao--leve" data-acao="mais">Mostrar mais (' + (lista.length - limite) + ')</button>' : '');
  }

  var AVISO = function () {
    return '<div class="sis-aviso-priv"><p><strong>Aviso de privacidade</strong> (versão ' + esc(C.lgpd.versaoAviso) + ') — leia ou mostre ao cliente:</p>' +
      '<p>O ' + esc(C.atelie) + ' usa seu nome, CPF, WhatsApp e endereço para fazer e cumprir o contrato de aluguel: identificar quem leva a peça, avisar de retirada e devolução e cobrar se ela não voltar. ' +
      'E-mail, RG e medidas são opcionais. Não vendemos nem passamos seus dados a terceiros; o contador e a maquininha recebem só o necessário para nota e pagamento. ' +
      'Guardamos o cadastro por ' + C.lgpd.retencaoCadastroAnos + ' anos depois da última locação e as fotos da vistoria por ' + C.lgpd.retencaoFotosMeses + ' meses depois da devolução. ' +
      'Você pode pedir para ver, corrigir ou apagar seus dados pelo WhatsApp do ateliê; respondemos em até ' + C.lgpd.prazoRespostaDias + ' dias.</p></div>';
  };

  function abrirCadastro(id, volta) {
    var c = id ? LOJA.clientePorId(id) : { nome: '', cpf: '', whatsapp: '', email: '', rg: '', endereco: { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: C.cidade === 'sua cidade' ? '' : C.cidade, uf: '' }, medidas: null };
    var e = c.endereco || {};
    function campo(idc, rot, val, extra) { return '<label>' + rot + ' <input id="cd-' + idc + '" value="' + esc(val || '') + '"' + (extra || '') + '></label>'; }
    abrirModal(id ? 'Corrigir cadastro · ' + c.id : 'Novo cliente',
      (id ? '' : AVISO()) +
      '<h3>Necessário para o contrato</h3><div class="pn-campos">' +
        campo('nome', 'Nome completo', c.nome, ' autocomplete="off"') + campo('cpf', 'CPF', c.cpf ? formatarCpf(c.cpf) : '', ' inputmode="numeric" placeholder="000.000.000-00"') +
        campo('whats', 'WhatsApp com DDD', c.whatsapp ? formatarFone(c.whatsapp) : '', ' inputmode="tel" placeholder="(91) 98888-7777"') + '</div>' +
      '<div class="pn-campos">' + campo('cep', 'CEP', e.cep, ' inputmode="numeric"') + campo('rua', 'Rua', e.rua) + campo('numero', 'Número', e.numero) + '</div>' +
      '<div class="pn-campos">' + campo('comp', 'Complemento', e.complemento) + campo('bairro', 'Bairro', e.bairro) + campo('cidade', 'Cidade', e.cidade) + campo('uf', 'UF', e.uf, ' maxlength="2"') + '</div>' +
      '<h3>Opcional</h3><div class="pn-campos">' + campo('email', 'E-mail', c.email, ' inputmode="email"') + campo('rg', 'RG', c.rg) +
        campo('altura', 'Altura (cm), para sugerir tamanho', c.medidas && c.medidas.altura, ' inputmode="numeric"') + campo('peso', 'Peso (kg)', c.medidas && c.medidas.peso, ' inputmode="numeric"') + '</div>' +
      (id ? '' : '<label class="pn-aceite"><input type="checkbox" id="cd-aviso"> Mostrei o aviso de privacidade ao cliente.</label>' +
        '<label class="pn-aceite pn-aceite--opcional"><input type="checkbox" id="cd-mkt"> O cliente <strong>quer</strong> receber novidades e promoções pelo WhatsApp. <small>(Opcional; pergunte. Ele pode desistir quando quiser.)</small></label>') +
      '<ul class="pn-erros" id="cd-erros" hidden></ul>',
      '<button type="button" class="botao botao--leve" id="cd-voltar">Voltar</button><button type="button" class="botao botao--destaque" id="cd-ok">' + (id ? 'Salvar correção' : 'Cadastrar') + '</button>');
    $('cd-voltar').addEventListener('click', function () { modal.close(); });
    $('cd-ok').addEventListener('click', function () {
      var v = function (k) { return $('cd-' + k).value.trim(); };
      var alt = Number(v('altura')), pes = Number(v('peso'));
      var dados = { id: id || null, nome: v('nome'), cpf: v('cpf'), whatsapp: v('whats'), email: v('email'), rg: v('rg'),
        endereco: { cep: v('cep').replace(/\D/g, ''), rua: v('rua'), numero: v('numero'), complemento: v('comp'), bairro: v('bairro'), cidade: v('cidade'), uf: v('uf').toUpperCase() },
        medidas: alt > 0 || pes > 0 ? { altura: alt || null, peso: pes || null } : null,
        marketing: !id && $('cd-mkt').checked, avisoPrivacidade: id ? true : $('cd-aviso').checked };
      var erros = L.validarCliente(dados);
      var ul = $('cd-erros');
      if (erros.length) { ul.innerHTML = '<li>Falta: ' + erros.map(esc).join(' ') + '</li>'; ul.hidden = false; return; }
      var r = LOJA.salvarCliente(dados);
      if (r.erro) { ul.innerHTML = '<li>' + esc(r.erro) + '</li>'; ul.hidden = false; return; }
      modal.close();
      if (volta === 'venda') { carrinho.clienteId = r.id; irPara('venda'); }
      else if (volta && volta.indexOf('sinal:') === 0) abrirSinal(volta.slice(6));
      else abrirCliente(r.id);
    });
  }

  function abrirCliente(id) {
    var c = LOJA.clientePorId(id);
    var pedidos = LOJA.pedidosDoCliente(id).sort(function (a, b) { return a.retirada < b.retirada ? 1 : -1; });
    var sit = LOJA.situacaoEliminacao(id);
    var e = c.endereco || {};
    var mk = c.marketing || {};
    abrirModal(esc(c.nome),
      (c.anonimizado ? '<p class="pn-msg pn-msg--ok">Cadastro anonimizado em ' + esc(L.dataBR(c.anonimizadoEm)) + '. O histórico de locações ficou, sem dados que identifiquem a pessoa.</p>' :
      '<dl class="pn-conta-tab sis-ficha">' +
        '<div><dt>CPF</dt><dd><span id="cl-cpf">' + L.mascararCpf(c.cpf) + '</span> <button type="button" class="sis-link" id="cl-ver-cpf">mostrar</button></dd></div>' +
        '<div><dt>WhatsApp</dt><dd>' + esc(formatarFone(c.whatsapp)) + '</dd></div>' +
        '<div><dt>Endereço</dt><dd>' + esc([e.rua, e.numero, e.complemento, e.bairro, e.cidade, e.uf].filter(Boolean).join(', ')) + ' · CEP ' + esc(e.cep) + '</dd></div>' +
        (c.email ? '<div><dt>E-mail</dt><dd>' + esc(c.email) + '</dd></div>' : '') +
        (c.rg ? '<div><dt>RG</dt><dd>' + esc(c.rg) + '</dd></div>' : '') +
        (c.medidas ? '<div><dt>Medidas</dt><dd>' + (c.medidas.altura ? c.medidas.altura + ' cm' : '') + (c.medidas.peso ? ' · ' + c.medidas.peso + ' kg' : '') + '</dd></div>' : '') +
        '<div><dt>Crédito na loja</dt><dd>' + R$(c.credito || 0) + '</dd></div>' +
        '<div><dt>Aviso de privacidade</dt><dd>' + (c.avisoPrivacidade ? 'mostrado em ' + esc(L.dataBR(c.avisoPrivacidade.em)) + ' (versão ' + esc(c.avisoPrivacidade.versao) + ')' : '—') + '</dd></div>' +
        '<div><dt>Novidades pelo WhatsApp</dt><dd>' + (mk.consentido ? 'aceitou em ' + esc(L.dataBR(mk.em)) + ' (versão ' + esc(mk.versao) + ', com ' + esc(mk.por || '') + ')' : mk.revogadoEm ? 'desistiu em ' + esc(L.dataBR(mk.revogadoEm)) : 'não aceitou') +
          ' <button type="button" class="sis-link" id="cl-mkt">' + (mk.consentido ? 'registrar que desistiu' : 'registrar que aceitou') + '</button></dd></div>' +
      '</dl>') +
      '<h3>Locações</h3>' + tabelaPedidos(pedidos.slice(0, 8).map(function (p) { return linha(p, R$(p.valores.total), ''); }), 'Nenhuma locação.') +
      (c.anonimizado ? '' : '<h3>Direitos do titular (LGPD)</h3><div class="sis-direitos">' +
        '<button type="button" class="botao botao--leve pn-botao" id="cl-exportar">Ver e copiar todos os dados</button>' +
        '<button type="button" class="botao botao--leve pn-botao" id="cl-corrigir">Corrigir dados</button>' +
        '<button type="button" class="botao botao--leve pn-botao" id="cl-pedido">Registrar pedido do cliente</button>' +
        '<button type="button" class="botao botao--leve pn-botao" id="cl-apagar"' + (sit.pode ? '' : ' disabled') + '>Anonimizar cadastro</button></div>' +
        (sit.pode ? '' : '<p class="pn-dica">Ainda não dá para apagar: ' + (sit.motivo === 'locacao' ? 'tem locação em andamento.' : 'a guarda vai até ' + esc(L.dataBR(sit.ate)) + ' (' + C.lgpd.retencaoCadastroAnos + ' anos depois da última locação, para defesa em eventual reclamação). Os dados ficam só para isso e para nada mais.') + '</p>') +
        '<div id="cl-extra"></div>') +
      '<h3>Histórico de acesso e alterações</h3><ul class="sis-log">' + (c.log || []).slice().reverse().map(function (l) {
        return '<li><span>' + esc(L.dataBR(l.quando)) + (l.hora ? ' ' + hora(l.hora) : '') + '</span><span>' + esc(l.quem || '') + '</span><span>' + esc(l.acao) + '</span></li>';
      }).join('') + '</ul>');
    if (c.anonimizado) return;
    $('cl-ver-cpf').addEventListener('click', function () {
      $('cl-cpf').textContent = formatarCpf(c.cpf); this.remove();
      LOJA.registrarAcesso(id, 'Viu o CPF completo');
    });
    $('cl-mkt').addEventListener('click', function () { LOJA.definirMarketing(id, !mk.consentido); abrirCliente(id); });
    $('cl-corrigir').addEventListener('click', function () { abrirCadastro(id); });
    $('cl-exportar').addEventListener('click', function () {
      var dados = { cliente: LOJA.clientePorId(id), locacoes: LOJA.pedidosDoCliente(id).map(function (p) { return { pedido: p.id, pecas: pecasTxt(p), retirada: p.retirada, devolucao: p.devolucao, status: p.status, total: p.valores.total }; }) };
      dados.cliente = Object.assign({}, dados.cliente, { log: undefined });
      LOJA.registrarAcesso(id, 'Exportou os dados a pedido do titular');
      $('cl-extra').innerHTML = '<p class="pn-dica">Envie ao cliente pelo canal que ele pediu.</p><textarea class="sis-json" readonly rows="10">' + esc(JSON.stringify(dados, null, 2)) + '</textarea>' +
        '<button type="button" class="botao botao--leve pn-botao" id="cl-copiar">Copiar</button>';
      $('cl-copiar').addEventListener('click', function () {
        var ta = modal.querySelector('.sis-json'), b = this;
        try { navigator.clipboard.writeText(ta.value).then(function () { b.textContent = 'Copiado'; }, function () { ta.select(); b.textContent = 'Selecionado: use Ctrl+C'; }); }
        catch (x) { ta.select(); b.textContent = 'Selecionado: use Ctrl+C'; }
      });
    });
    $('cl-pedido').addEventListener('click', function () {
      $('cl-extra').innerHTML = '<div class="pn-campos"><label>O cliente pediu <select id="cl-tipo"><option>Ver os dados</option><option>Corrigir dados</option><option>Eliminação dos dados</option><option>Saber com quem os dados são compartilhados</option><option>Revogar consentimento</option></select></label>' +
        '<label>Por onde <select id="cl-canal"><option>WhatsApp</option><option>No balcão</option><option>E-mail</option></select></label></div>' +
        '<button type="button" class="botao botao--destaque pn-botao" id="cl-reg">Registrar (prazo de ' + C.lgpd.prazoRespostaDias + ' dias)</button>';
      $('cl-reg').addEventListener('click', function () { LOJA.abrirSolicitacao(id, $('cl-tipo').value, $('cl-canal').value); abrirCliente(id); });
    });
    $('cl-apagar').addEventListener('click', function () {
      $('cl-extra').innerHTML = '<div class="pn-cancelar"><p>Anonimizar tira nome, CPF, WhatsApp, endereço, e-mail, RG e medidas. As locações ficam no histórico, sem identificar a pessoa. Não tem volta.</p>' +
        '<button type="button" class="botao botao--destaque pn-botao" id="cl-apagar-ok">Anonimizar agora</button></div>';
      $('cl-apagar-ok').addEventListener('click', function () { LOJA.anonimizar(id); abrirCliente(id); });
    });
  }

  /* =====================================================================
   * ACERVO
   * ===================================================================== */
  var ESTADOS = { livre: ['Livre', 'ok'], 'sai-hoje': ['Sai hoje', 'info'], 'com-cliente': ['Com o cliente', 'magenta'], atrasada: ['Atrasada', 'erro'], higienizacao: ['Higienização', 'aviso'] };
  function htmlAcervo() {
    var d = dia();
    var linhas = LOJA.linhasPorPeca();
    var cont = { livre: 0, 'sai-hoje': 0, 'com-cliente': 0, atrasada: 0, higienizacao: 0 };
    var blocos = FANTASIAS.map(function (f) {
      var m = LOJA.margemDe(f), livres = 0, total = 0;
      var lis = L.ordenarTamanhos(Object.keys(f.tamanhos)).map(function (t) {
        return L.unidades(f, t).map(function (u) {
          var s = L.situacaoUnidade(u, linhas, d, m);
          cont[s.estado]++; total++; if (s.estado === 'livre') livres++;
          var e = ESTADOS[s.estado];
          var info = s.estado === 'livre' ? (s.proxima ? 'próxima saída ' + curta(s.proxima.retirada) + ' · ' + esc(nome(s.proxima.pedido)) : 'sem reservas futuras')
            : s.estado === 'higienizacao' ? 'livre a partir de ' + curta(L.somarDias(s.ate, 1))
            : s.estado === 'atrasada' ? esc(nome(s.reserva.pedido)) + ' · ' + s.diasAtraso + ' dia(s) de atraso'
            : s.estado === 'com-cliente' ? esc(nome(s.reserva.pedido)) + ' · devolve ' + curta(s.reserva.devolucao) : esc(nome(s.reserva.pedido));
          return '<tr><td class="pn-cod">' + u + '</td><td><span class="pn-status pn-status--' + e[1] + '">' + e[0] + '</span></td><td>' + info + '</td></tr>';
        }).join('');
      }).join('');
      return '<details class="pn-fant"><summary><span class="pn-cor" style="--cor:' + esc(f.cor) + '"></span><strong>' + esc(f.nome) + '</strong> <span class="pn-cod">' + f.id + '</span>' +
        '<span class="pn-fant__total">' + livres + ' de ' + total + ' livres hoje</span></summary><table class="sis-tabela sis-tabela--compacta"><tbody>' + lis + '</tbody></table></details>';
    });
    return '<div class="pn-resumo">' + Object.keys(cont).map(function (k) { return tile(ESTADOS[k][0], cont[k], k === 'atrasada' && cont[k] ? 'erro' : ''); }).join('') + '</div>' +
      '<p class="pn-dica">Onde está cada peça física em ' + esc(L.dataComDia(d)) + '. Toque numa fantasia para ver as peças.</p>' + blocos.join('');
  }

  /* =====================================================================
   * CAIXA
   * ===================================================================== */
  function htmlCaixa() {
    var cx = LOJA.caixaAberto();
    var hist = LOJA.caixas().filter(function (x) { return x.fechadoEm; }).reverse();
    var histHtml = hist.length ? cartao('Caixas fechados', '', '<div class="sis-tabela-rolagem"><table class="sis-tabela"><thead><tr><th>Caixa</th><th>Aberto</th><th>Fechado</th><th class="sis-num">Diferença</th></tr></thead><tbody>' +
      hist.map(function (h) {
        var dif = h.conferencia.diferenca;
        return '<tr><td class="pn-cod">' + h.id + '</td><td>' + esc(L.dataBR(h.abertoEm.dia)) + ' ' + hora(h.abertoEm.hora) + ' · ' + esc(h.abertoEm.quem) + '</td><td>' + esc(L.dataBR(h.fechadoEm.dia)) + ' ' + hora(h.fechadoEm.hora) + ' · ' + esc(h.fechadoEm.quem) + '</td>' +
          '<td class="sis-num ' + (dif ? 'pn-saida' : 'pn-entrada') + '">' + (dif ? R$(dif) : 'conferiu') + '</td></tr>';
      }).join('') + '</tbody></table></div>') : '';
    if (!cx) {
      return cartao('Caixa fechado', 'Conte o dinheiro da gaveta e abra o caixa com esse valor de troco. Sem caixa aberto, o sistema não recebe pagamentos.',
        '<div class="pn-campos"><label>Fundo de troco (R$) <input id="cx-fundo-pg" inputmode="decimal" value="100,00"></label><label>Atendente <input value="' + esc(LOJA.operador()) + '" disabled></label></div>' +
        '<button type="button" class="botao botao--destaque" id="cx-abrir-pg">Abrir caixa</button>') + histHtml;
    }
    var e = L.esperadoCaixa(cx);
    var ent = {}, sai = {};
    Object.keys(FORMAS).forEach(function (f) { ent[f] = 0; sai[f] = 0; });
    cx.movimentos.forEach(function (m) {
      var f = m.tipo === 'sangria' || m.tipo === 'suprimento' ? 'dinheiro' : m.forma;
      if (m.tipo === 'entrada' || m.tipo === 'suprimento') ent[f] += Math.round(m.valor * 100); else sai[f] += Math.round(m.valor * 100);
    });
    var taxas = 0, totEnt = 0;
    cx.movimentos.filter(function (m) { return m.tipo === 'entrada' && m.forma !== 'vale'; }).forEach(function (m) {
      taxas += Math.round(L.taxaEstimada(m.valor, m.forma, m.parcelas || 1, PAG.taxas).taxa * 100);
      totEnt += Math.round(m.valor * 100);
    });
    return '<div class="pn-resumo">' + tile('Fundo de troco', R$(cx.fundo)) + tile('Entradas', R$(totEnt / 100)) +
      tile('Dinheiro na gaveta', R$(e.dinheiro), '', 'esperado agora') + tile('Taxas estimadas', R$(taxas / 100), '', 'cartão (taxas de exemplo)') + '</div>' +
      cartao('Caixa ' + cx.id + ' aberto', 'Aberto em ' + esc(L.dataBR(cx.abertoEm.dia)) + ' às ' + hora(cx.abertoEm.hora) + ' por ' + esc(cx.abertoEm.quem) + '.',
        '<div class="sis-tabela-rolagem"><table class="sis-tabela"><thead><tr><th>Forma</th><th class="sis-num">Entradas</th><th class="sis-num">Saídas</th><th class="sis-num">Saldo esperado</th></tr></thead><tbody>' +
        Object.keys(FORMAS).map(function (f) {
          return '<tr><td>' + FORMAS[f].nome + (f === 'vale' ? ' <small class="sis-mudo">(não é dinheiro)</small>' : '') + '</td><td class="sis-num">' + R$(ent[f] / 100) + '</td><td class="sis-num">' + R$(sai[f] / 100) + '</td><td class="sis-num"><strong>' + R$(e[f]) + '</strong></td></tr>';
        }).join('') + '</tbody></table></div>',
        '<div class="sis-botoes">' + '<button type="button" class="botao botao--leve pn-botao" id="cx-sup">Suprimento</button><button type="button" class="botao botao--leve pn-botao" id="cx-san">Sangria</button>' +
        '<button type="button" class="botao botao--destaque pn-botao" id="cx-fechar">Fechar caixa</button></div>') +
      cartao('Lançamentos', '', cx.movimentos.length ? '<div class="sis-tabela-rolagem"><table class="sis-tabela"><thead><tr><th>Hora</th><th>O quê</th><th>Forma</th><th>Atendente</th><th class="sis-num">Valor</th></tr></thead><tbody>' +
        cx.movimentos.slice().reverse().map(function (m) {
          var mais = m.tipo === 'entrada' || m.tipo === 'suprimento';
          var oque = m.tipo === 'sangria' ? 'Sangria' + (m.motivo ? ': ' + m.motivo : '') : m.tipo === 'suprimento' ? 'Suprimento' + (m.motivo ? ': ' + m.motivo : '') : m.motivo;
          return '<tr><td>' + hora(m.hora) + '</td><td>' + (m.ref ? '<button type="button" class="sis-link" data-acao="detalhe" data-id="' + m.ref + '">' + esc(oque) + '</button>' : esc(oque)) + '</td>' +
            '<td>' + (FORMAS[m.forma] ? FORMAS[m.forma].nome : 'Dinheiro') + '</td><td>' + esc(m.quem) + '</td><td class="sis-num ' + (mais ? 'pn-entrada' : 'pn-saida') + '">' + (mais ? '+ ' : '− ') + R$(m.valor) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="pn-vazio"><p>Nenhum lançamento ainda.</p></div>') + histHtml;
  }
  function ligarCaixa() {
    var ab = $('cx-abrir-pg');
    if (ab) ab.addEventListener('click', function () { var v = lerValor($('cx-fundo-pg').value); if (v >= 0) LOJA.abrirCaixa(v); });
    var sup = $('cx-sup'), san = $('cx-san'), fe = $('cx-fechar');
    if (sup) sup.addEventListener('click', function () { movCaixa('suprimento'); });
    if (san) san.addEventListener('click', function () { movCaixa('sangria'); });
    if (fe) fe.addEventListener('click', fecharCaixa);
  }
  function movCaixa(tipo) {
    abrirModal(tipo === 'sangria' ? 'Sangria (tirar dinheiro da gaveta)' : 'Suprimento (pôr dinheiro na gaveta)',
      '<div class="pn-campos"><label>Valor (R$) <input id="mv-valor" inputmode="decimal"></label><label>Motivo <input id="mv-motivo" placeholder="' + (tipo === 'sangria' ? 'Ex.: depósito no banco' : 'Ex.: reforço de troco') + '"></label></div><p class="pn-msg pn-msg--erro" id="mv-erro" hidden></p>',
      '<button type="button" class="botao botao--leve" id="mv-voltar">Voltar</button><button type="button" class="botao botao--destaque" id="mv-ok">Registrar</button>');
    $('mv-voltar').addEventListener('click', function () { modal.close(); });
    $('mv-ok').addEventListener('click', function () {
      var v = lerValor($('mv-valor').value), mo = $('mv-motivo').value.trim();
      var e = L.esperadoCaixa(LOJA.caixaAberto());
      var erro = !(v > 0) ? 'Valor maior que zero.' : !mo ? 'Diga o motivo (fica no caixa).' : tipo === 'sangria' && v > e.dinheiro ? 'A gaveta só tem ' + R$(e.dinheiro) + '.' : '';
      if (erro) { $('mv-erro').textContent = erro; $('mv-erro').hidden = false; return; }
      LOJA[tipo](v, mo); modal.close();
    });
  }
  function fecharCaixa() {
    var formas = ['dinheiro', 'pix', 'debito', 'credito'];
    abrirModal('Fechar caixa · conferência cega',
      '<p>Conte o que tem, sem olhar o sistema: dinheiro na gaveta, Pix no extrato do banco e cartões no relatório da maquininha. O sistema só mostra o esperado depois.</p>' +
      '<div class="pn-campos">' + formas.map(function (f) { return '<label>' + FORMAS[f].nome + ' (R$) <input id="fc-' + f + '" inputmode="decimal" placeholder="0,00"></label>'; }).join('') + '</div><p class="pn-msg pn-msg--erro" id="fc-erro" hidden></p>',
      '<button type="button" class="botao botao--leve" id="fc-voltar">Voltar</button><button type="button" class="botao botao--destaque" id="fc-ok">Conferir e fechar</button>');
    $('fc-voltar').addEventListener('click', function () { modal.close(); });
    $('fc-ok').addEventListener('click', function () {
      var contado = {}, ruim = false;
      formas.forEach(function (f) { var v = $('fc-' + f).value.trim(); var n = v === '' ? 0 : lerValor(v); if (!(n >= 0)) ruim = true; contado[f] = n; });
      if (ruim) { $('fc-erro').textContent = 'Valores em reais, por exemplo 150,00.'; $('fc-erro').hidden = false; return; }
      var cx = LOJA.fecharCaixa(contado);
      var c = cx.conferencia;
      abrirModal('Caixa ' + cx.id + ' fechado',
        '<p class="pn-msg ' + (c.confere ? 'pn-msg--ok">Tudo conferiu.' : 'pn-msg--erro">Diferença de ' + R$(c.diferenca) + '. Fica registrada no histórico.') + '</p>' +
        '<div class="sis-tabela-rolagem"><table class="sis-tabela"><thead><tr><th>Forma</th><th class="sis-num">Esperado</th><th class="sis-num">Contado</th><th class="sis-num">Diferença</th></tr></thead><tbody>' +
        c.linhas.map(function (l) { return '<tr><td>' + FORMAS[l.forma].nome + '</td><td class="sis-num">' + R$(l.esperado) + '</td><td class="sis-num">' + R$(l.contado) + '</td><td class="sis-num ' + (l.diferenca ? 'pn-saida' : '') + '">' + R$(l.diferenca) + '</td></tr>'; }).join('') +
        '</tbody></table></div>', '<button type="button" class="botao botao--destaque" id="fc-fim">Fechar</button>');
      $('fc-fim').addEventListener('click', function () { modal.close(); });
    });
  }

  /* =====================================================================
   * PRIVACIDADE (LGPD)
   * ===================================================================== */
  function htmlPrivacidade() {
    var sols = LOJA.solicitacoes().slice().reverse();
    var fotos = LOJA.fotosVencidas();
    var vencidos = LOJA.clientes().filter(function (c) {
      if (c.anonimizado) return false;
      var ps = LOJA.pedidosDoCliente(c.id);
      return ps.some(function (p) { return p.status === 'concluida'; }) && LOJA.situacaoEliminacao(c.id).pode;
    });
    var ROPA = [
      ['Nome, CPF, RG (opcional)', 'Identificar quem leva a peça; contrato', 'Execução de contrato (art. 7º, V)', C.lgpd.retencaoCadastroAnos + ' anos após a última locação'],
      ['WhatsApp', 'Avisos de retirada, devolução e atraso', 'Execução de contrato (art. 7º, V)', 'Idem'],
      ['Endereço', 'Cobrança se a peça não voltar', 'Execução de contrato (art. 7º, V)', 'Idem'],
      ['Fotos da vistoria', 'Provar o estado da peça na entrega e na volta', 'Execução de contrato e defesa (art. 7º, V e VI)', C.lgpd.retencaoFotosMeses + ' meses após a devolução'],
      ['Pagamentos', 'Caixa, nota fiscal, contabilidade', 'Obrigação legal (art. 7º, II)', 'Prazo fiscal'],
      ['WhatsApp para novidades', 'Promoções e lançamentos', 'Consentimento (art. 7º, I), à parte e revogável', 'Até o cliente desistir'],
      ['Medidas (opcional)', 'Sugerir o tamanho', 'A pedido do cliente (art. 7º, V)', 'Com o cadastro']
    ];
    return cartao('O que o ateliê guarda e por quê', 'Registro simplificado das operações de tratamento, como a ANPD permite a agentes de pequeno porte (Resolução CD/ANPD nº 2/2022). Nada além disso é pedido ao cliente.',
        '<div class="sis-tabela-rolagem"><table class="sis-tabela"><thead><tr><th>Dado</th><th>Para quê</th><th>Base legal (LGPD)</th><th>Por quanto tempo</th></tr></thead><tbody>' +
        ROPA.map(function (r) { return '<tr><td>' + r.map(esc).join('</td><td>') + '</td></tr>'; }).join('') + '</tbody></table></div>') +
      cartao('Pedidos dos clientes sobre os próprios dados', 'Ver, corrigir, apagar, saber com quem compartilha, revogar consentimento. Prazo de resposta: ' + C.lgpd.prazoRespostaDias + ' dias. Registre na ficha do cliente.',
        sols.length ? '<div class="sis-tabela-rolagem"><table class="sis-tabela"><thead><tr><th>Pedido</th><th>Cliente</th><th>O quê</th><th>Aberto</th><th>Prazo</th><th>Situação</th><th></th></tr></thead><tbody>' + sols.map(function (s) {
          var c = LOJA.clientePorId(s.clienteId);
          var vencido = s.status === 'aberta' && dia() > s.prazo;
          return '<tr><td class="pn-cod">' + s.id + '</td><td><button type="button" class="sis-link" data-acao="cliente" data-id="' + s.clienteId + '">' + esc(c ? c.nome : s.clienteId) + '</button></td><td>' + esc(s.tipo) + ' <small class="sis-mudo">(' + esc(s.canal) + ')</small></td>' +
            '<td>' + esc(L.dataBR(s.em)) + '</td><td class="' + (vencido ? 'pn-saida' : '') + '">' + esc(L.dataBR(s.prazo)) + '</td>' +
            '<td>' + (s.status === 'aberta' ? '<span class="pn-status pn-status--' + (vencido ? 'erro">Vencido' : 'aviso">Aberto') + '</span>' : '<span class="pn-status pn-status--ok">Atendido ' + esc(L.dataBR(s.respondidaEm)) + '</span>') + '</td>' +
            '<td>' + (s.status === 'aberta' ? '<button type="button" class="botao botao--leve pn-botao" data-resp="' + s.id + '">Marcar atendido</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="pn-vazio"><p>Nenhum pedido registrado.</p></div>') +
      cartao('Prazos de guarda vencidos', 'Depois do prazo, o dado não tem mais motivo para ficar.',
        '<p>Fotos de vistoria com mais de ' + C.lgpd.retencaoFotosMeses + ' meses: <strong>' + fotos.length + '</strong> pedido(s). ' +
          (fotos.length ? '<button type="button" class="botao botao--leve pn-botao" id="pv-fotos">Apagar essas fotos</button>' : '') + '</p>' +
        '<p>Clientes sem locação há mais de ' + C.lgpd.retencaoCadastroAnos + ' anos: <strong>' + vencidos.length + '</strong>. ' +
          (vencidos.length ? vencidos.slice(0, 5).map(function (c) { return '<button type="button" class="sis-link" data-acao="cliente" data-id="' + c.id + '">' + esc(c.nome) + '</button>'; }).join(', ') : '') + '</p>' +
        '<p class="pn-dica">Dica para testar: avance o dia de trabalho para depois de 2032 e os clientes de exemplo aparecem aqui.</p>') +
      cartao('Aviso de privacidade para o cliente', 'É o texto mostrado no cadastro. Mude em config.js (lgpd) e troque a versão quando o texto mudar.', AVISO()) +
      cartao('Segurança', '', '<ul class="sis-lista"><li>CPF mascarado em listas; ver o número completo fica registrado no histórico do cliente.</li>' +
        '<li>Cada ação registra o atendente; no sistema de verdade, cada um entra com o próprio login.</li>' +
        '<li>Fotos reduzidas (320 px) e apagadas no fim da guarda.</li>' +
        '<li>Vazamento de dados: avise a ANPD e os clientes afetados (LGPD, art. 48).</li></ul>');
  }
  raiz.addEventListener('click', function (e) {
    var r = e.target.closest('[data-resp]');
    if (r) LOJA.responderSolicitacao(r.dataset.resp, 'Atendido');
    if (e.target.id === 'pv-fotos') LOJA.apagarFotosVencidas();
  });

  mostrar();
})();
