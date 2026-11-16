/* Simulação — painel do ateliê (a "tela do adm"). Abre com #painel.
 * Abas: Hoje · Balcão (novo aluguel na loja) · Reservas · Acervo · Caixa.
 * Lê e grava em window.SIM_LOJA (simulacao/estado.js). Regras de dinheiro,
 * datas e disponibilidade vêm de logica.js — as mesmas do site do cliente. */
(function () {
  'use strict';
  var LOJA = window.SIM_LOJA;
  var L = window.Logica;
  var C = window.CONFIG;
  var FANTASIAS = window.FANTASIAS;

  var STATUS = {
    pendente: ['Aguardando sinal', 'aviso'], confirmada: ['Confirmada', 'info'], retirada: ['Com o cliente', 'magenta'],
    atrasada: ['Atrasada', 'erro'], concluida: ['Concluída', 'ok'], cancelada: ['Cancelada', 'neutro'], expirada: ['Expirada', 'neutro']
  };
  var TIPOS = {
    sinal: 'Sinal', saldo: 'Saldo do aluguel', total: 'Aluguel (total)', caucao: 'Caução recebida',
    cobranca: 'Cobrança de dano/atraso', caucao_devolvida: 'Caução devolvida', estorno: 'Estorno de sinal'
  };
  var SAIDAS = ['caucao_devolvida', 'estorno'];
  var FOTOS = [['frente', 'Frente'], ['costas', 'Costas'], ['barra', 'Barra'], ['detalhes', 'Detalhes']];
  var DEFEITOS = ['Mancha', 'Rasgo', 'Botão ou zíper', 'Barra descosturada', 'Desbotado', 'Peça faltando'];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var R$ = L.formatarPreco;
  function curta(iso) { var d = L.dataComDia(iso); return d ? d.slice(0, 10) : ''; } // "sex, 05/02"
  function lojaDe(f) { return C.lojas[f.loja]; }
  function dia() { return LOJA.dia(); }
  function visivel(r) { return r.status === 'retirada' && dia() > r.devolucao ? 'atrasada' : r.status; }
  function chip(r) { var s = STATUS[visivel(r)] || [r.status, 'neutro']; return '<span class="pn-status pn-status--' + s[1] + '">' + s[0] + '</span>'; }
  function nome(r) { return r.cliente && r.cliente.nome ? r.cliente.nome : 'Cliente do site (sem nome ainda)'; }
  function peca(r) { var f = LOJA.fantasiaDe(r.fantasia); return (f ? f.nome : r.fantasia) + ' · ' + r.tamanho; }
  function opcoesFormas(sel) { return LOJA.FORMAS.map(function (f) { return '<option' + (f === sel ? ' selected' : '') + '>' + f + '</option>'; }).join(''); }

  /* ---------- estrutura ---------- */
  var raiz = document.createElement('section');
  raiz.id = 'painel';
  raiz.className = 'painel';
  raiz.hidden = true;
  raiz.setAttribute('aria-label', 'Painel do ateliê');
  raiz.innerHTML =
    '<div class="painel__topo"><div class="largura painel__topo-linha">' +
      '<div class="painel__titulo"><span class="painel__marca">' + esc(C.nomeSite) + '</span><h1>Painel do ateliê</h1></div>' +
      '<div class="painel__dia">' +
        '<label for="painel-dia">Dia de trabalho</label>' +
        '<div class="painel__dia-ctrl">' +
          '<button type="button" class="pn-icone" id="painel-dia-ant" aria-label="Dia anterior">‹</button>' +
          '<input type="date" id="painel-dia">' +
          '<button type="button" class="pn-icone" id="painel-dia-prox" aria-label="Próximo dia">›</button>' +
        '</div>' +
        '<span class="painel__dia-nome" id="painel-dia-nome"></span>' +
      '</div>' +
    '</div>' +
    '<nav class="largura painel__abas" aria-label="Seções do painel">' +
      [['hoje', 'Hoje'], ['balcao', 'Novo aluguel no balcão'], ['reservas', 'Reservas'], ['acervo', 'Acervo'], ['caixa', 'Caixa']].map(function (a) {
        return '<button type="button" class="painel__aba" data-aba="' + a[0] + '">' + a[1] + '</button>';
      }).join('') +
    '</nav></div>' +
    '<p class="largura painel__aviso" id="painel-aviso" hidden></p>' +
    '<div class="largura painel__corpo" id="painel-corpo"></div>' +
    '<div class="largura painel__pe"><button type="button" class="link" id="painel-zerar">Recomeçar a simulação</button> · ' +
      'Simulação: nada sai deste navegador. No sistema de verdade este painel fica atrás de login.</div>';
  document.body.appendChild(raiz);

  var modal = document.createElement('dialog');
  modal.className = 'pn-modal';
  modal.id = 'painel-modal';
  modal.setAttribute('aria-labelledby', 'pn-modal-titulo');
  document.body.appendChild(modal);
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });

  var aba = 'hoje';

  function mostrar() {
    var ativo = location.hash === '#painel';
    document.body.classList.toggle('modo-painel', ativo);
    raiz.hidden = !ativo;
    if (ativo) { render(); window.scrollTo(0, 0); }
  }
  window.addEventListener('hashchange', mostrar);

  raiz.querySelector('.painel__abas').addEventListener('click', function (e) {
    var b = e.target.closest('[data-aba]');
    if (!b) return;
    aba = b.dataset.aba;
    render();
  });
  $('painel-dia').addEventListener('change', function (e) { LOJA.definirDia(e.target.value); });
  $('painel-dia-ant').addEventListener('click', function () { LOJA.definirDia(L.somarDias(dia(), -1)); });
  $('painel-dia-prox').addEventListener('click', function () { LOJA.definirDia(L.somarDias(dia(), 1)); });
  $('painel-zerar').addEventListener('click', function () {
    LOJA.zerar();
    balcao = novoBalcao();
  });
  LOJA.aoMudar(function () {
    if (raiz.hidden) return;
    if (aba === 'balcao') { atualizarBalcao(); cabecalho(); } else render();
  });

  function cabecalho() {
    $('painel-dia').value = dia();
    $('painel-dia-nome').textContent = L.dataComDia(dia());
    raiz.querySelectorAll('.painel__aba').forEach(function (b) {
      b.setAttribute('aria-current', b.dataset.aba === aba ? 'page' : 'false');
    });
    var aviso = LOJA.aviso();
    $('painel-aviso').textContent = aviso;
    $('painel-aviso').hidden = !aviso;
  }

  function render() {
    cabecalho();
    var corpo = $('painel-corpo');
    if (aba === 'hoje') corpo.innerHTML = htmlHoje();
    else if (aba === 'balcao') { corpo.innerHTML = htmlBalcao(); ligarBalcao(); atualizarBalcao(); }
    else if (aba === 'reservas') corpo.innerHTML = htmlReservas();
    else if (aba === 'acervo') corpo.innerHTML = htmlAcervo();
    else corpo.innerHTML = htmlCaixa();
  }

  // Ações por delegação: data-acao + data-id em qualquer botão do painel ou do modal.
  function acionar(e) {
    var b = e.target.closest('[data-acao]');
    if (!b) return;
    var id = b.dataset.id;
    var acao = b.dataset.acao;
    if (acao === 'detalhe') abrirDetalhe(id);
    else if (acao === 'confirmar') abrirConfirmarSinal(id);
    else if (acao === 'recusar') { LOJA.cancelar(id, { motivo: 'Recusado pelo ateliê' }); }
    else if (acao === 'retirar') abrirRetirada(id);
    else if (acao === 'devolver') abrirDevolucao(id);
    else if (acao === 'ir-dia') LOJA.definirDia(b.dataset.dia);
    else if (acao === 'filtro') { filtroReservas = b.dataset.filtro; limiteReservas = 40; render(); }
    else if (acao === 'mais') { limiteReservas += 40; render(); }
    if (modal.open && e.currentTarget === modal && (acao === 'recusar')) modal.close();
  }
  raiz.addEventListener('click', acionar);
  modal.addEventListener('click', acionar);

  /* ---------- linha de reserva (Hoje e Reservas) ---------- */
  function linha(r, extra, acoes) {
    return '<li class="pn-linha">' +
      '<div class="pn-linha__info">' +
        '<p class="pn-linha__cliente"><button type="button" class="link" data-acao="detalhe" data-id="' + r.id + '">' + esc(nome(r)) + '</button>' +
          ' <span class="pn-cod">' + r.id + '</span> ' + chip(r) + '</p>' +
        '<p class="pn-linha__peca">' + esc(peca(r)) + ' <span class="pn-cod">' + esc(r.unidade) + '</span></p>' +
        '<p class="pn-linha__datas">' + curta(r.retirada) + ' → ' + curta(r.devolucao) + (extra ? ' · ' + extra : '') + '</p>' +
      '</div>' +
      '<div class="pn-linha__acoes">' + (acoes || '') + '</div></li>';
  }
  function botao(acao, id, texto, forte) {
    return '<button type="button" class="botao ' + (forte ? 'botao--destaque' : 'botao--leve') + ' pn-botao" data-acao="' + acao + '" data-id="' + id + '">' + texto + '</button>';
  }

  function lembrete(r) {
    var f = LOJA.fantasiaDe(r.fantasia);
    var texto = 'Olá, ' + nome(r).split(' ')[0] + '! Aqui é do ' + C.nomeSite + '. A fantasia ' + f.nome +
      ' tinha devolução em ' + L.dataBR(r.devolucao) + '. Cada dia de atraso é cobrado como dia extra (' + R$(f.diaExtra) +
      '). Podemos combinar a devolução para hoje?';
    var num = String(r.cliente.whatsapp || '').replace(/\D/g, '');
    if (!L.numeroWhatsAppValido(num)) return '';
    return '<a class="botao botao--leve pn-botao" href="' + esc(L.linkWhatsApp(num, texto)) + '" target="_blank" rel="noopener">Lembrar no WhatsApp</a>';
  }

  /* ---------- aba Hoje ---------- */
  function htmlHoje() {
    var d = dia();
    var rs = LOJA.todas();
    var pend = rs.filter(function (r) { return r.status === 'pendente'; });
    var sai = rs.filter(function (r) { return r.status === 'confirmada' && r.retirada <= d; })
      .sort(function (a, b) { return a.retirada < b.retirada ? -1 : 1; });
    var volta = rs.filter(function (r) { return r.status === 'retirada' && r.devolucao === d; });
    var atr = rs.filter(function (r) { return r.status === 'retirada' && d > r.devolucao; });
    var hig = rs.filter(function (r) {
      var f = LOJA.fantasiaDe(r.fantasia);
      return r.status === 'concluida' && r.devolvidaEm && d >= r.devolvidaEm && d <= L.somarDias(r.devolvidaEm, LOJA.margemDe(f));
    });

    var resumo = '<div class="pn-resumo">' +
      tile('Saem hoje', sai.length, sai.length ? 'retirada' : '') +
      tile('Voltam hoje', volta.length, '') +
      tile('Atrasadas', atr.length, atr.length ? 'erro' : '') +
      tile('Pedidos do site', pend.length, pend.length ? 'aviso' : '') +
      '</div>';

    var blocos = [];
    if (pend.length) blocos.push(secao('Pedidos do site aguardando sinal', 'O cliente reservou pelo site e combina o Pix no WhatsApp. A peça fica segura por ' + LOJA.MINUTOS_PENDENTE + ' minutos.',
      pend.map(function (r) {
        var min = Math.max(0, Math.ceil((r.expiraEm - Date.now()) / 60000));
        return linha(r, 'sinal ' + R$(r.valores.sinal) + ' · expira em ' + min + ' min',
          botao('confirmar', r.id, 'Sinal recebido', true) + botao('recusar', r.id, 'Recusar'));
      })));
    if (sai.length) blocos.push(secao('Saem hoje', 'Receba o saldo e a caução, e faça a vistoria com fotos antes de entregar.',
      sai.map(function (r) {
        var atrasoRet = r.retirada < d ? '<strong class="pn-alerta">devia ter retirado ' + curta(r.retirada) + '</strong> · ' : '';
        return linha(r, atrasoRet + 'a receber ' + R$(LOJA.saldo(r)) + ' + caução ' + R$(r.valores.caucao), botao('retirar', r.id, 'Entregar', true));
      })));
    if (volta.length) blocos.push(secao('Voltam hoje', 'Vistoria de devolução: compare com as fotos da retirada antes de devolver a caução.',
      volta.map(function (r) { return linha(r, 'caução ' + R$(r.valores.caucao), botao('devolver', r.id, 'Receber de volta', true)); })));
    if (atr.length) blocos.push(secao('Atrasadas', 'Cada dia além da devolução é cobrado como dia extra e sai da caução.',
      atr.map(function (r) {
        var f = LOJA.fantasiaDe(r.fantasia);
        var n = L.diasEntre(r.devolucao, d);
        return linha(r, '<strong class="pn-alerta">' + n + (n === 1 ? ' dia' : ' dias') + ' de atraso · ' + R$(n * f.diaExtra) + '</strong>',
          lembrete(r) + botao('devolver', r.id, 'Receber de volta', true));
      })));
    if (hig.length) blocos.push(secao('Em higienização', 'Peças que voltaram e ainda não podem sair de novo.',
      hig.map(function (r) {
        var f = LOJA.fantasiaDe(r.fantasia);
        return linha(r, 'livre a partir de ' + curta(L.somarDias(r.devolvidaEm, LOJA.margemDe(f) + 1)), '');
      })));

    if (!blocos.length) {
      var prox = rs.filter(function (r) { return (r.status === 'confirmada' && r.retirada > d) || (r.status === 'retirada' && r.devolucao > d); })
        .map(function (r) { return r.status === 'confirmada' ? r.retirada : r.devolucao; }).sort()[0];
      blocos.push('<div class="pn-vazio"><p><strong>Nada para hoje.</strong> Nenhuma peça sai nem volta em ' + esc(L.dataComDia(d)) + '.</p>' +
        (prox ? '<button type="button" class="botao botao--leve" data-acao="ir-dia" data-dia="' + prox + '">Ir para o próximo dia com movimento: ' + esc(L.dataComDia(prox)) + '</button>' : '') +
        '<p class="pn-dica">Para alugar para quem está na loja, use <strong>Novo aluguel no balcão</strong>.</p></div>');
    }
    return resumo + blocos.join('');
  }
  function tile(rotulo, n, tom) {
    return '<div class="pn-tile' + (tom ? ' pn-tile--' + tom : '') + '"><span>' + rotulo + '</span><strong>' + n + '</strong></div>';
  }
  function secao(titulo, dica, itens) {
    return '<section class="pn-secao"><h2>' + titulo + ' <span class="pn-conta">' + itens.length + '</span></h2>' +
      '<p class="pn-dica">' + dica + '</p><ul class="pn-lista">' + itens.join('') + '</ul></section>';
  }

  /* ---------- aba Balcão: aluguel para quem está na loja ---------- */
  function novoBalcao() {
    return { fantasia: '', busca: '', dataFesta: '', extras: 0, tamanho: '', unidade: '', kit: [],
      cliente: { nome: '', whatsapp: '', cpf: '' }, receber: 'total', forma: 'Pix', erros: [] };
  }
  var balcao = novoBalcao();

  function htmlBalcao() {
    return '<form class="pn-balcao" id="pn-balcao" novalidate>' +
      '<p class="pn-dica">Cliente na loja: escolha a peça, a data da festa e o tamanho. O estoque é o mesmo do site, então o que você alugar aqui some da vitrine nessa data.</p>' +
      '<fieldset class="pn-passo"><legend><span>1</span> Fantasia</legend>' +
        '<input type="search" id="pn-b-busca" placeholder="Nome, código ou tema (ex.: noiva, JN03, junina)" autocomplete="off" value="' + esc(balcao.busca) + '">' +
        '<div id="pn-b-resultados" class="pn-resultados"></div>' +
        '<div id="pn-b-escolhida"></div>' +
      '</fieldset>' +
      '<fieldset class="pn-passo"><legend><span>2</span> Datas</legend>' +
        '<div class="pn-campos">' +
          '<label>Data da festa <input type="date" id="pn-b-festa" min="' + dia() + '" value="' + esc(balcao.dataFesta || dia()) + '"></label>' +
          '<label>Dias extras <select id="pn-b-extras">' + [0, 1, 2, 3, 4].map(function (n) { return '<option value="' + n + '"' + (balcao.extras === n ? ' selected' : '') + '>' + (n ? '+' + n : 'Nenhum') + '</option>'; }).join('') + '</select></label>' +
        '</div>' +
        '<div id="pn-b-periodo"></div>' +
      '</fieldset>' +
      '<fieldset class="pn-passo"><legend><span>3</span> Tamanho e peça</legend><div id="pn-b-tamanhos"><p class="pn-dica">Escolha a fantasia primeiro.</p></div></fieldset>' +
      '<fieldset class="pn-passo"><legend><span>4</span> Cliente</legend>' +
        '<div class="pn-campos">' +
          '<label>Nome completo <input id="pn-b-nome" autocomplete="off" value="' + esc(balcao.cliente.nome) + '"></label>' +
          '<label>WhatsApp com DDD <input id="pn-b-whats" inputmode="tel" placeholder="91 98888-7777" value="' + esc(balcao.cliente.whatsapp) + '"></label>' +
          '<label>CPF <input id="pn-b-cpf" inputmode="numeric" placeholder="000.000.000-00" value="' + esc(balcao.cliente.cpf) + '"><small id="pn-b-cpf-msg" class="pn-msg"></small></label>' +
        '</div>' +
      '</fieldset>' +
      '<fieldset class="pn-passo"><legend><span>5</span> Complementos</legend><div id="pn-b-kit"><p class="pn-dica">Escolha a fantasia primeiro.</p></div></fieldset>' +
      '<fieldset class="pn-passo"><legend><span>6</span> Pagamento</legend>' +
        '<div id="pn-b-resumo"></div>' +
        '<div class="pn-campos">' +
          '<label>Recebe agora <select id="pn-b-receber"><option value="total"' + (balcao.receber === 'total' ? ' selected' : '') + '>Aluguel inteiro</option><option value="sinal"' + (balcao.receber === 'sinal' ? ' selected' : '') + '>Só o sinal (resto na retirada)</option></select></label>' +
          '<label>Forma <select id="pn-b-forma">' + opcoesFormas(balcao.forma) + '</select></label>' +
        '</div>' +
      '</fieldset>' +
      '<ul class="pn-erros" id="pn-b-erros" hidden></ul>' +
      '<div class="pn-balcao__fim">' +
        '<button type="submit" class="botao botao--leve" id="pn-b-reservar">Reservar para retirar depois</button>' +
        '<button type="button" class="botao botao--destaque" id="pn-b-agora">Alugar e entregar agora</button>' +
      '</div>' +
    '</form>';
  }

  function contaBalcao() {
    var f = balcao.fantasia && LOJA.fantasiaDe(balcao.fantasia);
    if (!f) return { f: null };
    var loja = lojaDe(f);
    var per = L.periodoAluguel(balcao.dataFesta || dia(), dia(), balcao.extras, loja);
    var disp = L.disponibilidade(f, window.AGENDA, per, LOJA.margemDe(f));
    var o = L.calcularOrcamento(f, balcao.kit, loja.sinal, per ? balcao.extras : 0);
    return { f: f, loja: loja, per: per, disp: disp, o: o };
  }

  function ligarBalcao() {
    var form = $('pn-balcao');
    $('pn-b-busca').addEventListener('input', function (e) { balcao.busca = e.target.value; atualizarBalcao(); });
    $('pn-b-festa').addEventListener('change', function (e) { balcao.dataFesta = e.target.value; balcao.unidade = ''; atualizarBalcao(); });
    $('pn-b-extras').addEventListener('change', function (e) { balcao.extras = Number(e.target.value) || 0; balcao.unidade = ''; atualizarBalcao(); });
    $('pn-b-nome').addEventListener('input', function (e) { balcao.cliente.nome = e.target.value; });
    $('pn-b-whats').addEventListener('input', function (e) { balcao.cliente.whatsapp = e.target.value; });
    $('pn-b-cpf').addEventListener('input', function (e) {
      balcao.cliente.cpf = e.target.value;
      var d = e.target.value.replace(/\D/g, '');
      var msg = $('pn-b-cpf-msg');
      msg.textContent = d.length < 11 ? '' : L.cpfValido(d) ? 'CPF válido' : 'CPF inválido: confira os números';
      msg.className = 'pn-msg' + (d.length < 11 ? '' : L.cpfValido(d) ? ' pn-msg--ok' : ' pn-msg--erro');
    });
    $('pn-b-receber').addEventListener('change', function (e) { balcao.receber = e.target.value; atualizarBalcao(); });
    $('pn-b-forma').addEventListener('change', function (e) { balcao.forma = e.target.value; });
    form.addEventListener('click', function (e) {
      var esc1 = e.target.closest('[data-escolher]');
      if (esc1) { balcao.fantasia = esc1.dataset.escolher; balcao.tamanho = ''; balcao.unidade = ''; balcao.kit = []; atualizarBalcao(); return; }
      if (e.target.closest('[data-trocar]')) { balcao.fantasia = ''; atualizarBalcao(); $('pn-b-busca').focus(); return; }
      var t = e.target.closest('[data-tam]');
      if (t && !t.disabled) { balcao.tamanho = t.dataset.tam; balcao.unidade = ''; atualizarBalcao(); }
    });
    form.addEventListener('change', function (e) {
      if (e.target.id === 'pn-b-unidade') balcao.unidade = e.target.value;
      if (e.target.name === 'pn-b-kit') {
        balcao.kit = Array.prototype.filter.call(form.querySelectorAll('[name="pn-b-kit"]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
        atualizarBalcao();
      }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); finalizarBalcao(false); });
    $('pn-b-agora').addEventListener('click', function () { finalizarBalcao(true); });
  }

  function atualizarBalcao() {
    if (!$('pn-balcao')) return;
    var c = contaBalcao();
    // 1. resultados da busca
    var res = $('pn-b-resultados');
    if (c.f) {
      res.innerHTML = '';
      $('pn-b-escolhida').innerHTML = '<div class="pn-escolhida"><span class="pn-cor" style="--cor:' + esc(c.f.cor) + '"></span>' +
        '<div><strong>' + esc(c.f.nome) + '</strong> <span class="pn-cod">' + c.f.id + '</span><br><small>' + R$(c.f.preco) + ' / 3 dias · dia extra ' + R$(c.f.diaExtra) + ' · caução ' + R$(c.f.caucao) + '</small></div>' +
        '<button type="button" class="link" data-trocar>Trocar</button></div>';
    } else {
      $('pn-b-escolhida').innerHTML = '';
      var lista = balcao.busca ? L.filtrar(FANTASIAS, { texto: balcao.busca }) : FANTASIAS.filter(function (f) { return f.temas.indexOf('junina') !== -1; });
      res.innerHTML = (balcao.busca ? '' : '<p class="pn-dica">Juninas (digite para buscar todas):</p>') +
        (lista.length ? lista.slice(0, 8).map(function (f) {
          return '<button type="button" class="pn-resultado" data-escolher="' + f.id + '"><span class="pn-cor" style="--cor:' + esc(f.cor) + '"></span>' +
            '<span><strong>' + esc(f.nome) + '</strong> <span class="pn-cod">' + f.id + '</span><br><small>' + R$(f.preco) + ' · ' + L.ordenarTamanhos(Object.keys(f.tamanhos)).join(' ') + '</small></span></button>';
        }).join('') : '<p class="pn-dica">Nenhuma fantasia com esse nome.</p>');
    }
    // 2. período
    var per = c.f ? c.per : L.periodoAluguel(balcao.dataFesta || dia(), dia(), balcao.extras, C.lojas[Object.keys(C.lojas)[0]]);
    $('pn-b-periodo').innerHTML = per
      ? '<div class="pn-periodo"><div><span>Retira</span><strong>' + esc(L.dataComDia(per.retirada)) + '</strong></div>' +
        '<div><span>Festa</span><strong>' + esc(L.dataComDia(per.dataFesta)) + '</strong></div>' +
        '<div><span>Devolve até</span><strong class="pn-devolve">' + esc(L.dataComDia(per.devolucao)) + '</strong></div></div>' +
        (per.retirada === dia() ? '<p class="pn-msg pn-msg--ok">Retirada é hoje: dá para entregar agora.</p>' : '<p class="pn-dica">Retirada em ' + esc(L.dataComDia(per.retirada)) + ': reserve agora e entregue nesse dia.</p>') +
        (per.devolucaoAdiada ? '<p class="pn-dica">A loja não abre no dia previsto: a devolução passou para o próximo dia útil, sem custo.</p>' : '')
      : '<p class="pn-msg pn-msg--erro">Escolha uma data de festa a partir de hoje.</p>';
    // 3. tamanhos com estoque
    if (c.f) {
      var tams = Object.keys(c.disp);
      if (balcao.tamanho && !c.disp[balcao.tamanho]) balcao.tamanho = '';
      var livres = balcao.tamanho && c.per ? c.disp[balcao.tamanho].livres : [];
      if (balcao.tamanho && livres.indexOf(balcao.unidade) === -1) balcao.unidade = livres[0] || '';
      $('pn-b-tamanhos').innerHTML = '<div class="pn-tams">' + tams.map(function (t) {
        var d = c.disp[t];
        var n = c.per ? d.livres.length : d.total;
        return '<button type="button" class="pn-tam' + (balcao.tamanho === t ? ' pn-tam--sel' : '') + '" data-tam="' + t + '"' + (c.per && !n ? ' disabled' : '') + '>' +
          '<b>' + t + '</b><small>' + (c.per ? (n ? n + ' de ' + d.total + ' livre' + (n === 1 ? '' : 's') : 'esgotado') : d.total + ' no acervo') + '</small></button>';
      }).join('') + '</div>' +
        (balcao.tamanho && livres.length ? '<label class="pn-unidade">Peça <select id="pn-b-unidade">' + livres.map(function (u) {
          return '<option' + (u === balcao.unidade ? ' selected' : '') + '>' + u + '</option>';
        }).join('') + '</select><small>Etiqueta da peça física que vai sair.</small></label>' : '') +
        '<div class="tabela-rolagem"><table class="pn-medidas"><thead><tr><th></th><th>Busto</th><th>Cintura</th><th>Quadril</th><th>Altura</th></tr></thead><tbody>' +
        L.ordenarTamanhos(Object.keys(c.f.tamanhos)).map(function (t) { var m = c.f.tamanhos[t]; return '<tr' + (t === balcao.tamanho ? ' class="pn-sel"' : '') + '><th>' + t + '</th><td>' + m[0] + '</td><td>' + m[1] + '</td><td>' + m[2] + '</td><td>até ' + m[3] + '</td></tr>'; }).join('') +
        '</tbody></table></div>';
      // 5. complementos
      $('pn-b-kit').innerHTML = c.f.kit.length ? c.f.kit.map(function (k) {
        return '<label class="pn-kit"><input type="checkbox" name="pn-b-kit" value="' + esc(k.id) + '"' + (balcao.kit.indexOf(k.id) !== -1 ? ' checked' : '') + '> ' +
          esc(k.nome) + ' <small>(' + (k.tipo === 'venda' ? 'venda' : 'aluguel') + ')</small><span>' + R$(k.preco) + '</span></label>';
      }).join('') : '<p class="pn-dica">Esta fantasia não tem complementos.</p>';
    } else {
      $('pn-b-tamanhos').innerHTML = '<p class="pn-dica">Escolha a fantasia primeiro.</p>';
      $('pn-b-kit').innerHTML = '<p class="pn-dica">Escolha a fantasia primeiro.</p>';
    }
    // 6. resumo
    if (c.f) {
      var o = c.o;
      var agora = balcao.receber === 'total' ? o.total : o.sinal;
      $('pn-b-resumo').innerHTML = '<dl class="pn-conta-tab">' +
        '<div><dt>Aluguel (3 dias)</dt><dd>' + R$(c.f.preco) + '</dd></div>' +
        (o.diasExtras ? '<div><dt>' + o.diasExtras + ' dia(s) extra(s)</dt><dd>' + R$(o.valorDiasExtras) + '</dd></div>' : '') +
        (o.kit ? '<div><dt>Complementos</dt><dd>' + R$(o.kit) + '</dd></div>' : '') +
        '<div class="pn-total"><dt>Total do aluguel</dt><dd>' + R$(o.total) + '</dd></div>' +
        '<div><dt>Recebe agora</dt><dd><strong>' + R$(agora) + '</strong></dd></div>' +
        '<div><dt>Falta na retirada</dt><dd>' + R$(Math.round((o.total - agora) * 100) / 100) + '</dd></div>' +
        '<div><dt>Caução (na retirada, volta na devolução)</dt><dd>' + R$(o.caucao) + '</dd></div></dl>';
    } else {
      $('pn-b-resumo').innerHTML = '<p class="pn-dica">O valor aparece quando a fantasia for escolhida.</p>';
    }
    var agoraBtn = $('pn-b-agora');
    agoraBtn.hidden = !(per && per.retirada === dia());
  }

  function finalizarBalcao(entregarAgora) {
    var c = contaBalcao();
    var erros = [];
    var whats = balcao.cliente.whatsapp.replace(/\D/g, '');
    if (whats.length === 10 || whats.length === 11) whats = '55' + whats;
    if (!c.f) erros.push('Escolha a fantasia.');
    if (c.f && !c.per) erros.push('Escolha uma data de festa a partir de hoje.');
    if (c.f && c.per && !balcao.tamanho) erros.push('Escolha um tamanho com peça livre.');
    if (c.f && c.per && balcao.tamanho && !balcao.unidade) erros.push('Esse tamanho não tem peça livre nessa data.');
    if (balcao.cliente.nome.trim().split(/\s+/).length < 2) erros.push('Escreva o nome e o sobrenome do cliente.');
    if (!L.numeroWhatsAppValido(whats)) erros.push('WhatsApp incompleto: DDD + número.');
    if (!L.cpfValido(balcao.cliente.cpf)) erros.push('CPF inválido. Ele vai no contrato e protege a peça.');
    var ul = $('pn-b-erros');
    ul.innerHTML = erros.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    ul.hidden = !erros.length;
    if (erros.length) { ul.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var r = LOJA.criarBalcao({
      cliente: { nome: balcao.cliente.nome.trim(), whatsapp: whats, cpf: balcao.cliente.cpf.replace(/\D/g, '') },
      fantasia: c.f.id, tamanho: balcao.tamanho, unidade: balcao.unidade,
      retirada: c.per.retirada, devolucao: c.per.devolucao, dataFesta: c.per.dataFesta, diasExtras: c.per.diasExtras, kit: balcao.kit.slice(),
      total: c.o.total, sinal: c.o.sinal, caucao: c.o.caucao,
      recebido: { tipo: balcao.receber, forma: balcao.forma }
    });
    balcao = novoBalcao();
    if (entregarAgora) { aba = 'hoje'; render(); abrirRetirada(r.id); }
    else { aba = 'hoje'; render(); abrirDetalhe(r.id, 'Reserva ' + r.id + ' criada. Ela aparece em "Saem hoje" no dia ' + L.dataBR(r.retirada) + '.'); }
  }

  /* ---------- fotos da vistoria ---------- */
  function htmlFotos(prefixo) {
    return '<div class="pn-fotos">' + FOTOS.map(function (f) {
      return '<div class="pn-foto" data-slot="' + f[0] + '">' +
        '<div class="pn-foto__img" id="' + prefixo + '-img-' + f[0] + '"><span>' + f[1] + '</span></div>' +
        '<label class="pn-foto__botao">Tirar foto<input type="file" accept="image/*" capture="environment" data-foto="' + f[0] + '"></label>' +
        '<button type="button" class="link" data-simular="' + f[0] + '">simular</button></div>';
    }).join('') + '</div>';
  }
  function reduzir(src, cb) {
    var img = new Image();
    img.onload = function () {
      var lado = 320, k = Math.min(1, lado / Math.max(img.width, img.height));
      var cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cb(cv.toDataURL('image/jpeg', 0.7));
    };
    img.src = src;
  }
  function fotoSimulada(rotulo, r) {
    var cv = document.createElement('canvas'); cv.width = 240; cv.height = 300;
    var g = cv.getContext('2d');
    var f = LOJA.fantasiaDe(r.fantasia);
    g.fillStyle = f.cor; g.fillRect(0, 0, 240, 300);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 22px sans-serif'; g.fillText(rotulo, 16, 40);
    g.font = '14px sans-serif'; g.fillText(r.unidade, 16, 64); g.fillText(L.dataBR(dia()), 16, 84);
    g.fillText('foto simulada', 16, 280);
    return cv.toDataURL('image/jpeg', 0.6);
  }
  function ligarFotos(prefixo, r, fotos, aoMudar) {
    modal.querySelectorAll('[data-foto]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var arq = inp.files && inp.files[0];
        if (!arq) return;
        var leitor = new FileReader();
        leitor.onload = function () { reduzir(leitor.result, function (url) { fotos[inp.dataset.foto] = url; pintar(); }); };
        leitor.readAsDataURL(arq);
      });
    });
    modal.querySelectorAll('[data-simular]').forEach(function (b) {
      b.addEventListener('click', function () {
        var rot = FOTOS.find(function (x) { return x[0] === b.dataset.simular; })[1];
        fotos[b.dataset.simular] = fotoSimulada(rot, r);
        pintar();
      });
    });
    function pintar() {
      FOTOS.forEach(function (f) {
        var box = $(prefixo + '-img-' + f[0]);
        box.innerHTML = fotos[f[0]] ? '<img src="' + fotos[f[0]] + '" alt="' + f[1] + '">' : '<span>' + f[1] + '</span>';
        box.classList.toggle('pn-foto__img--ok', !!fotos[f[0]]);
      });
      if (aoMudar) aoMudar();
    }
  }
  function htmlLaudo(v, titulo) {
    if (!v) return '<p class="pn-dica">' + titulo + ': sem laudo registrado no simulador (reserva de exemplo).</p>';
    return '<div class="pn-laudo"><p><strong>' + titulo + '</strong> · ' + esc(L.dataComDia(v.dia)) + '</p>' +
      '<div class="pn-laudo__fotos">' + FOTOS.map(function (f) {
        return v.fotos[f[0]] ? '<figure><img src="' + v.fotos[f[0]] + '" alt="' + f[1] + '"><figcaption>' + f[1] + '</figcaption></figure>' : '';
      }).join('') + '</div>' +
      '<p>Defeitos anotados: ' + (v.defeitos.length || v.obs ? esc(v.defeitos.concat(v.obs ? [v.obs] : []).join('; ')) : 'nenhum') + '</p></div>';
  }

  function abrirModal(titulo, corpo, rodape) {
    modal.innerHTML = '<div class="pn-modal__topo"><h2 id="pn-modal-titulo">' + titulo + '</h2>' +
      '<button type="button" class="sim-whats__fechar" id="pn-modal-fechar" aria-label="Fechar">×</button></div>' +
      '<div class="pn-modal__corpo">' + corpo + '</div>' +
      (rodape ? '<div class="pn-modal__rodape">' + rodape + '</div>' : '');
    $('pn-modal-fechar').addEventListener('click', function () { modal.close(); });
    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
  }
  function cabecaReserva(r) {
    return '<div class="pn-cabeca"><p><strong>' + esc(nome(r)) + '</strong> <span class="pn-cod">' + r.id + '</span> ' + chip(r) + '</p>' +
      '<p>' + esc(peca(r)) + ' · peça <span class="pn-cod">' + esc(r.unidade) + '</span></p>' +
      '<p>Retira ' + esc(L.dataComDia(r.retirada)) + ' · devolve até <strong>' + esc(L.dataComDia(r.devolucao)) + '</strong></p></div>';
  }

  /* ---------- sinal recebido (pedido do site) ---------- */
  function abrirConfirmarSinal(id) {
    var r = LOJA.porId(id);
    abrirModal('Sinal recebido · ' + r.id,
      cabecaReserva(r) +
      '<p>Confira o comprovante do Pix de <strong>' + R$(r.valores.sinal) + '</strong> no WhatsApp e complete os dados do cliente.</p>' +
      '<div class="pn-campos">' +
        '<label>Nome completo <input id="pn-s-nome" value="' + esc(r.cliente.nome) + '"></label>' +
        '<label>WhatsApp com DDD <input id="pn-s-whats" inputmode="tel" value="' + esc(r.cliente.whatsapp) + '"></label>' +
        '<label>Forma <select id="pn-s-forma">' + opcoesFormas('Pix') + '</select></label>' +
      '</div><p class="pn-msg pn-msg--erro" id="pn-s-erro" hidden></p>',
      '<button type="button" class="botao botao--leve" id="pn-s-cancelar">Voltar</button>' +
      '<button type="button" class="botao botao--destaque" id="pn-s-ok">Confirmar reserva</button>');
    $('pn-s-cancelar').addEventListener('click', function () { modal.close(); });
    $('pn-s-ok').addEventListener('click', function () {
      var whats = $('pn-s-whats').value.replace(/\D/g, '');
      if (whats.length === 10 || whats.length === 11) whats = '55' + whats;
      var erro = $('pn-s-nome').value.trim().split(/\s+/).length < 2 ? 'Escreva nome e sobrenome.' : !L.numeroWhatsAppValido(whats) ? 'WhatsApp incompleto.' : '';
      if (erro) { $('pn-s-erro').textContent = erro; $('pn-s-erro').hidden = false; return; }
      LOJA.confirmarSinal(id, { cliente: { nome: $('pn-s-nome').value.trim(), whatsapp: whats }, forma: $('pn-s-forma').value });
      modal.close();
    });
  }

  /* ---------- entrega (retirada) ---------- */
  function abrirRetirada(id) {
    var r = LOJA.porId(id);
    var saldo = LOJA.saldo(r);
    var caucaoPaga = LOJA.caucaoRecebida(r);
    var fotos = {}, defeitos = [];
    abrirModal('Entrega · ' + r.id,
      cabecaReserva(r) +
      '<h3>1. Receber</h3><dl class="pn-conta-tab">' +
        '<div><dt>Saldo do aluguel</dt><dd>' + (saldo ? R$(saldo) + ' <select id="pn-r-forma-saldo" aria-label="Forma do saldo">' + opcoesFormas('Pix') + '</select>' : 'pago') + '</dd></div>' +
        '<div><dt>Caução (volta na devolução)</dt><dd>' + (caucaoPaga ? 'recebida' : R$(r.valores.caucao) + ' <select id="pn-r-forma-caucao" aria-label="Forma da caução">' + opcoesFormas('Pix') + '</select>') + '</dd></div>' +
      '</dl>' +
      '<h3>2. Vistoria com fotos</h3><p class="pn-dica">As quatro fotos são obrigatórias. Elas protegem o ateliê e o cliente na hora da devolução.</p>' +
      htmlFotos('pn-r') +
      '<p class="pn-rotulo">Defeitos que a peça já tem</p><div class="pn-chips" id="pn-r-defeitos">' +
        DEFEITOS.map(function (d) { return '<button type="button" class="pn-chip" aria-pressed="false" data-def="' + esc(d) + '">' + esc(d) + '</button>'; }).join('') + '</div>' +
      '<label class="pn-bloco">Onde e como (opcional) <textarea id="pn-r-obs" rows="2" placeholder="Ex.: mancha pequena na barra, lado esquerdo"></textarea></label>' +
      '<label class="pn-aceite"><input type="checkbox" id="pn-r-aceite"> O cliente conferiu as fotos e os defeitos anotados.</label>' +
      '<p class="pn-msg pn-msg--erro" id="pn-r-erro" hidden></p>',
      '<button type="button" class="botao botao--leve" id="pn-r-voltar">Agora não</button>' +
      '<button type="button" class="botao botao--destaque" id="pn-r-ok">Confirmar entrega</button>');
    ligarFotos('pn-r', r, fotos);
    $('pn-r-defeitos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-def]');
      if (!b) return;
      var on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      defeitos = on ? defeitos.concat([b.dataset.def]) : defeitos.filter(function (d) { return d !== b.dataset.def; });
    });
    $('pn-r-voltar').addEventListener('click', function () { modal.close(); });
    $('pn-r-ok').addEventListener('click', function () {
      var faltam = FOTOS.filter(function (f) { return !fotos[f[0]]; }).map(function (f) { return f[1].toLowerCase(); });
      var erro = faltam.length ? 'Falta foto: ' + faltam.join(', ') + '.' : !$('pn-r-aceite').checked ? 'Marque que o cliente conferiu a vistoria.' : '';
      if (erro) { $('pn-r-erro').textContent = erro; $('pn-r-erro').hidden = false; return; }
      LOJA.registrarRetirada(id, {
        saldo: saldo ? { valor: saldo, forma: $('pn-r-forma-saldo').value } : null,
        caucao: caucaoPaga ? null : { valor: r.valores.caucao, forma: $('pn-r-forma-caucao').value },
        vistoria: { dia: dia(), fotos: fotos, defeitos: defeitos, obs: $('pn-r-obs').value.trim() }
      });
      modal.close();
    });
  }

  /* ---------- devolução ---------- */
  function abrirDevolucao(id) {
    var r = LOJA.porId(id);
    var f = LOJA.fantasiaDe(r.fantasia);
    var atraso = Math.max(0, L.diasEntre(r.devolucao, dia()) || 0);
    var fotos = {}, danos = [];
    abrirModal('Devolução · ' + r.id,
      cabecaReserva(r) +
      (atraso ? '<p class="pn-msg pn-msg--erro">Voltou com ' + atraso + (atraso === 1 ? ' dia' : ' dias') + ' de atraso: ' + R$(atraso * f.diaExtra) + ' (dia extra de ' + R$(f.diaExtra) + ').</p>' : '<p class="pn-msg pn-msg--ok">Dentro do prazo.</p>') +
      htmlLaudo(r.vistorias && r.vistorias.retirada, 'Laudo da entrega') +
      '<h3>1. Fotos da devolução</h3>' + htmlFotos('pn-d') +
      '<h3>2. Dano novo</h3><p class="pn-dica">Só o que não está no laudo da entrega. Cada item com o seu valor: é isso que o cliente recebe por escrito.</p>' +
      '<ul class="pn-danos" id="pn-d-danos"></ul>' +
      '<div class="pn-campos pn-campos--dano"><label>O quê <input id="pn-d-desc" placeholder="Ex.: rasgo de 3 cm na manga"></label>' +
        '<label>Valor (R$) <input id="pn-d-valor" inputmode="decimal" placeholder="0,00"></label>' +
        '<button type="button" class="botao botao--leve" id="pn-d-add">Adicionar</button></div>' +
      '<h3>3. Acerto da caução</h3><div id="pn-d-acerto"></div>' +
      '<div class="pn-campos"><label>Forma do acerto (devolução ou cobrança) <select id="pn-d-forma">' + opcoesFormas('Pix') + '</select></label></div>' +
      '<label class="pn-aceite"><input type="checkbox" id="pn-d-aceite"> O cliente conferiu as fotos e o acerto.</label>' +
      '<p class="pn-msg pn-msg--erro" id="pn-d-erro" hidden></p>',
      '<button type="button" class="botao botao--leve" id="pn-d-voltar">Agora não</button>' +
      '<button type="button" class="botao botao--destaque" id="pn-d-ok">Confirmar devolução</button>');

    function conta() { return L.acertoDevolucao({ caucao: r.valores.caucao, danos: danos, diasAtraso: atraso, valorDiaAtraso: f.diaExtra }); }
    function pintar() {
      $('pn-d-danos').innerHTML = danos.length ? danos.map(function (d, i) {
        return '<li><span>' + esc(d.descricao) + '</span><span>' + R$(d.valor) + '</span><button type="button" class="link" data-rem="' + i + '">tirar</button></li>';
      }).join('') : '<li class="pn-dica">Nenhum dano novo.</li>';
      var a = conta();
      $('pn-d-acerto').innerHTML = '<dl class="pn-conta-tab">' +
        '<div><dt>Caução</dt><dd>' + R$(a.caucao) + '</dd></div>' +
        (a.multa ? '<div><dt>Atraso (' + a.diasAtraso + ' dia' + (a.diasAtraso === 1 ? '' : 's') + ')</dt><dd>− ' + R$(a.multa) + '</dd></div>' : '') +
        (a.danos ? '<div><dt>Danos novos</dt><dd>− ' + R$(a.danos) + '</dd></div>' : '') +
        '<div class="pn-total"><dt>Devolver ao cliente</dt><dd>' + R$(a.devolver) + '</dd></div>' +
        (a.cobrar ? '<div class="pn-cobrar"><dt>Passou da caução: cobrar</dt><dd>' + R$(a.cobrar) + '</dd></div>' : '') + '</dl>';
    }
    ligarFotos('pn-d', r, fotos);
    $('pn-d-add').addEventListener('click', function () {
      var desc = $('pn-d-desc').value.trim();
      var valor = Number($('pn-d-valor').value.replace(/\./g, '').replace(',', '.'));
      if (!desc || !(valor > 0)) { $('pn-d-erro').textContent = 'Descreva o dano e ponha um valor maior que zero.'; $('pn-d-erro').hidden = false; return; }
      $('pn-d-erro').hidden = true;
      danos.push({ descricao: desc, valor: valor });
      $('pn-d-desc').value = ''; $('pn-d-valor').value = '';
      pintar();
    });
    $('pn-d-danos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rem]');
      if (b) { danos.splice(Number(b.dataset.rem), 1); pintar(); }
    });
    $('pn-d-voltar').addEventListener('click', function () { modal.close(); });
    $('pn-d-ok').addEventListener('click', function () {
      var faltam = FOTOS.filter(function (x) { return !fotos[x[0]]; }).map(function (x) { return x[1].toLowerCase(); });
      var erro = faltam.length ? 'Falta foto: ' + faltam.join(', ') + '.' : !$('pn-d-aceite').checked ? 'Marque que o cliente conferiu o acerto.' : '';
      if (erro) { $('pn-d-erro').textContent = erro; $('pn-d-erro').hidden = false; return; }
      LOJA.registrarDevolucao(id, { acerto: conta(), danos: danos.slice(), forma: $('pn-d-forma').value, vistoria: { dia: dia(), fotos: fotos, defeitos: danos.map(function (d) { return d.descricao; }), obs: '' } });
      modal.close();
    });
    pintar();
  }

  /* ---------- detalhe e cancelamento ---------- */
  function abrirDetalhe(id, recado) {
    var r = LOJA.porId(id);
    var f = LOJA.fantasiaDe(r.fantasia);
    var st = visivel(r);
    var pags = r.pagamentos || [];
    var acoes = '';
    if (st === 'pendente') acoes = botao('confirmar', r.id, 'Sinal recebido', true) + botao('recusar', r.id, 'Recusar');
    if (st === 'confirmada') acoes = (dia() >= r.retirada ? botao('retirar', r.id, 'Entregar', true) : '<span class="pn-dica">Entrega a partir de ' + esc(L.dataComDia(r.retirada)) + '</span>') +
      '<button type="button" class="botao botao--leve pn-botao" id="pn-x-cancelar">Cancelar reserva</button>';
    if (st === 'retirada' || st === 'atrasada') acoes = lembrete(r) + botao('devolver', r.id, 'Receber de volta', true);
    abrirModal('Reserva ' + r.id,
      (recado ? '<p class="pn-msg pn-msg--ok">' + esc(recado) + '</p>' : '') +
      cabecaReserva(r) +
      '<dl class="pn-conta-tab">' +
        '<div><dt>Origem</dt><dd>' + ({ site: 'Pedido pelo site', balcao: 'Balcão', exemplo: 'Reserva de exemplo' }[r.origem]) + '</dd></div>' +
        (r.cliente.whatsapp ? '<div><dt>WhatsApp</dt><dd>+' + esc(r.cliente.whatsapp) + '</dd></div>' : '') +
        (r.cliente.cpf ? '<div><dt>CPF</dt><dd>' + esc(r.cliente.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')) + '</dd></div>' : '') +
        '<div><dt>Total do aluguel</dt><dd>' + R$(r.valores.total) + '</dd></div>' +
        '<div><dt>Falta receber</dt><dd>' + R$(LOJA.saldo(r)) + '</dd></div>' +
        '<div><dt>Caução</dt><dd>' + R$(r.valores.caucao) + '</dd></div>' +
        (r.kit && r.kit.length ? '<div><dt>Complementos</dt><dd>' + esc(r.kit.map(function (k) { var x = f.kit.find(function (y) { return y.id === k; }); return x ? x.nome : k; }).join(', ')) + '</dd></div>' : '') +
        (r.acerto ? '<div><dt>Acerto da devolução</dt><dd>retido ' + R$(r.acerto.retido) + ' · devolvido ' + R$(r.acerto.devolver) + (r.acerto.cobrar ? ' · cobrado ' + R$(r.acerto.cobrar) : '') + '</dd></div>' : '') +
      '</dl>' +
      '<h3>Pagamentos</h3>' + (pags.length ? '<ul class="pn-pags">' + pags.map(function (p) {
        return '<li><span>' + esc(L.dataBR(p.dia)) + '</span><span>' + TIPOS[p.tipo] + ' · ' + esc(p.forma) + '</span><span class="' + (SAIDAS.indexOf(p.tipo) !== -1 ? 'pn-saida' : 'pn-entrada') + '">' + (SAIDAS.indexOf(p.tipo) !== -1 ? '− ' : '+ ') + R$(p.valor) + '</span></li>';
      }).join('') + '</ul>' : '<p class="pn-dica">' + (r.origem === 'exemplo' ? 'Reserva de exemplo: considera-se que o sinal já foi pago.' : 'Nenhum pagamento ainda.') + '</p>') +
      (r.vistorias && r.vistorias.retirada ? htmlLaudo(r.vistorias.retirada, 'Laudo da entrega') : '') +
      (r.vistorias && r.vistorias.devolucao ? htmlLaudo(r.vistorias.devolucao, 'Laudo da devolução') : '') +
      '<div id="pn-x-cancelamento"></div>',
      acoes);
    var bc = $('pn-x-cancelar');
    if (bc) bc.addEventListener('click', function () { mostrarCancelamento(r); });
  }

  function mostrarCancelamento(r) {
    var sinalPago = (r.pagamentos || []).filter(function (p) { return p.tipo === 'sinal' || p.tipo === 'total'; }).reduce(function (s, p) { return s + p.valor; }, 0) ||
      (r.origem === 'exemplo' ? r.valores.sinal : 0);
    var rb = L.reembolsoCancelamento(sinalPago, r.retirada, dia());
    var loja = lojaDe(LOJA.fantasiaDe(r.fantasia));
    $('pn-x-cancelamento').innerHTML = '<div class="pn-cancelar"><h3>Cancelar</h3>' +
      (rb.integral
        ? '<p>Faltam ' + rb.diasAntes + ' dias para a retirada: o cliente recebe de volta <strong>' + R$(sinalPago) + '</strong>.</p>'
        : '<p>Faltam ' + Math.max(0, rb.diasAntes) + ' dias para a retirada (menos de 7). Vale a política do ateliê: <em>' + esc(loja.politicaCancelamento) + '</em></p>') +
      '<div class="pn-campos"><label>Estorno por <select id="pn-x-forma">' + opcoesFormas('Pix') + '</select></label></div>' +
      '<button type="button" class="botao botao--destaque" id="pn-x-ok">' + (rb.integral ? 'Cancelar e estornar ' + R$(sinalPago) : 'Cancelar (sinal vira crédito)') + '</button></div>';
    $('pn-x-ok').addEventListener('click', function () {
      LOJA.cancelar(r.id, { estorno: rb.integral ? sinalPago : 0, forma: $('pn-x-forma').value, motivo: rb.integral ? 'Cancelado com estorno' : 'Cancelado; sinal em crédito' });
      modal.close();
    });
  }

  /* ---------- aba Reservas ---------- */
  var filtroReservas = 'ativas', buscaReservas = '', limiteReservas = 40;
  var FILTROS = [
    ['ativas', 'Em andamento', function (s) { return s === 'pendente' || s === 'confirmada' || s === 'retirada' || s === 'atrasada'; }],
    ['pendente', 'Aguardando sinal', function (s) { return s === 'pendente'; }],
    ['confirmada', 'Confirmadas', function (s) { return s === 'confirmada'; }],
    ['retirada', 'Com o cliente', function (s) { return s === 'retirada'; }],
    ['atrasada', 'Atrasadas', function (s) { return s === 'atrasada'; }],
    ['concluida', 'Concluídas', function (s) { return s === 'concluida'; }],
    ['cancelada', 'Canceladas', function (s) { return s === 'cancelada' || s === 'expirada'; }],
    ['todas', 'Todas', function () { return true; }]
  ];
  function htmlReservas() {
    var rs = LOJA.todas();
    var filtro = FILTROS.find(function (x) { return x[0] === filtroReservas; });
    var termo = L.normalizar(buscaReservas);
    var lista = rs.filter(function (r) { return filtro[2](visivel(r)); }).filter(function (r) {
      if (!termo) return true;
      var f = LOJA.fantasiaDe(r.fantasia);
      return L.normalizar([r.id, nome(r), f.nome, r.unidade].join(' ')).indexOf(termo) !== -1;
    }).sort(function (a, b) {
      var ka = filtroReservas === 'concluida' || filtroReservas === 'cancelada' ? b.retirada : a.retirada;
      var kb = filtroReservas === 'concluida' || filtroReservas === 'cancelada' ? a.retirada : b.retirada;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    setTimeout(function () {
      var b = $('pn-busca-res');
      if (b) b.addEventListener('input', function (e) { buscaReservas = e.target.value; limiteReservas = 40; var pos = e.target.selectionStart; render(); var n = $('pn-busca-res'); n.focus(); n.setSelectionRange(pos, pos); });
    });
    return '<div class="pn-filtros">' + FILTROS.map(function (x) {
      var n = rs.filter(function (r) { return x[2](visivel(r)); }).length;
      return '<button type="button" class="pn-filtro" data-acao="filtro" data-filtro="' + x[0] + '" aria-pressed="' + (x[0] === filtroReservas) + '">' + x[1] + ' <span>' + n + '</span></button>';
    }).join('') + '</div>' +
      '<input type="search" id="pn-busca-res" class="pn-busca" placeholder="Buscar por cliente, código, fantasia ou peça" value="' + esc(buscaReservas) + '">' +
      (lista.length ? '<ul class="pn-lista">' + lista.slice(0, limiteReservas).map(function (r) {
        var s = visivel(r);
        var acao = s === 'pendente' ? botao('confirmar', r.id, 'Sinal recebido', true)
          : s === 'confirmada' && dia() >= r.retirada ? botao('retirar', r.id, 'Entregar', true)
          : s === 'retirada' || s === 'atrasada' ? botao('devolver', r.id, 'Receber de volta')
          : '';
        return linha(r, r.origem === 'balcao' ? 'balcão' : r.origem === 'site' ? 'site' : '', acao + botao('detalhe', r.id, 'Abrir'));
      }).join('') + '</ul>' +
      (lista.length > limiteReservas ? '<button type="button" class="botao botao--leve" data-acao="mais">Mostrar mais (' + (lista.length - limiteReservas) + ')</button>' : '')
      : '<div class="pn-vazio"><p>Nenhuma reserva neste filtro.</p></div>');
  }

  /* ---------- aba Acervo ---------- */
  var ESTADOS = {
    livre: ['Livre', 'ok'], 'sai-hoje': ['Sai hoje', 'info'], 'com-cliente': ['Com o cliente', 'magenta'],
    atrasada: ['Atrasada', 'erro'], higienizacao: ['Higienização', 'aviso']
  };
  function htmlAcervo() {
    var d = dia();
    var rs = LOJA.todas();
    var cont = { livre: 0, 'sai-hoje': 0, 'com-cliente': 0, atrasada: 0, higienizacao: 0 };
    var blocos = FANTASIAS.map(function (f) {
      var m = LOJA.margemDe(f);
      var linhas = L.ordenarTamanhos(Object.keys(f.tamanhos)).map(function (t) {
        return L.unidades(f, t).map(function (u) {
          var s = L.situacaoUnidade(u, rs, d, m);
          cont[s.estado]++;
          var e = ESTADOS[s.estado];
          var info = s.estado === 'livre' ? (s.proxima ? 'próxima saída ' + curta(s.proxima.retirada) + ' (' + esc(nome(s.proxima)) + ')' : 'sem reservas futuras')
            : s.estado === 'higienizacao' ? 'livre a partir de ' + curta(L.somarDias(s.ate, 1))
            : s.estado === 'atrasada' ? esc(nome(s.reserva)) + ' · ' + s.diasAtraso + ' dia(s) de atraso'
            : s.estado === 'com-cliente' ? esc(nome(s.reserva)) + ' · devolve ' + curta(s.reserva.devolucao)
            : esc(nome(s.reserva));
          return '<li><span class="pn-cod">' + u + '</span><span class="pn-status pn-status--' + e[1] + '">' + e[0] + '</span><span class="pn-un__info">' + info + '</span></li>';
        }).join('');
      }).join('');
      var total = Object.keys(f.estoque || {}).reduce(function (s, t) { return s + f.estoque[t]; }, 0);
      return '<details class="pn-fant"><summary><span class="pn-cor" style="--cor:' + esc(f.cor) + '"></span><strong>' + esc(f.nome) + '</strong> <span class="pn-cod">' + f.id + '</span><span class="pn-fant__total">' + total + ' peças</span></summary><ul class="pn-un">' + linhas + '</ul></details>';
    });
    return '<div class="pn-resumo">' + Object.keys(cont).map(function (k) { return tile(ESTADOS[k][0], cont[k], ESTADOS[k][1] === 'erro' && cont[k] ? 'erro' : ''); }).join('') + '</div>' +
      '<p class="pn-dica">Situação de cada peça física em ' + esc(L.dataComDia(d)) + '. Toque numa fantasia para ver as peças.</p>' + blocos.join('');
  }

  /* ---------- aba Caixa ---------- */
  function htmlCaixa() {
    var d = dia();
    var rs = LOJA.todas();
    var movs = [];
    rs.forEach(function (r) { (r.pagamentos || []).forEach(function (p) { movs.push({ p: p, r: r }); }); });
    var doDia = movs.filter(function (x) { return x.p.dia === d; }).sort(function (a, b) { return a.p.hora - b.p.hora; });
    var soma = function (lista, saida) {
      return lista.filter(function (x) { return (SAIDAS.indexOf(x.p.tipo) !== -1) === saida; }).reduce(function (s, x) { return s + Math.round(x.p.valor * 100); }, 0) / 100;
    };
    var ent = soma(doDia, false), sai = soma(doDia, true);
    var porForma = {};
    doDia.forEach(function (x) {
      var k = x.p.forma;
      porForma[k] = (porForma[k] || 0) + (SAIDAS.indexOf(x.p.tipo) !== -1 ? -1 : 1) * Math.round(x.p.valor * 100);
    });
    var emPoder = rs.filter(function (r) { return r.status === 'retirada' && LOJA.caucaoRecebida(r); }).reduce(function (s, r) { return s + Math.round(r.valores.caucao * 100); }, 0) / 100;
    return '<div class="pn-resumo">' + tile('Entradas', R$(ent), '') + tile('Saídas', R$(sai), '') + tile('Saldo do dia', R$(ent - sai), '') + tile('Cauções em mãos', R$(emPoder), '') + '</div>' +
      '<p class="pn-dica">Movimento de ' + esc(L.dataComDia(d)) + '. Só entra aqui o que foi registrado neste painel (as reservas de exemplo não lançam no caixa). Caução em mãos é dinheiro do cliente: volta na devolução.</p>' +
      (Object.keys(porForma).length ? '<h2 class="pn-h2">Por forma de pagamento</h2><ul class="pn-pags">' + Object.keys(porForma).map(function (k) {
        return '<li><span>' + esc(k) + '</span><span></span><span>' + R$(porForma[k] / 100) + '</span></li>';
      }).join('') + '</ul>' : '') +
      '<h2 class="pn-h2">Lançamentos</h2>' +
      (doDia.length ? '<ul class="pn-pags">' + doDia.map(function (x) {
        var s = SAIDAS.indexOf(x.p.tipo) !== -1;
        return '<li><span>' + new Date(x.p.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
          '<span>' + TIPOS[x.p.tipo] + ' · ' + esc(x.p.forma) + ' · <button type="button" class="link" data-acao="detalhe" data-id="' + x.r.id + '">' + esc(nome(x.r)) + ' (' + x.r.id + ')</button></span>' +
          '<span class="' + (s ? 'pn-saida' : 'pn-entrada') + '">' + (s ? '− ' : '+ ') + R$(x.p.valor) + '</span></li>';
      }).join('') + '</ul>' : '<div class="pn-vazio"><p>Nenhum lançamento neste dia.</p></div>');
  }

  mostrar();
})();
