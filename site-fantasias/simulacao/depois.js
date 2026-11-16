/* Simulação, parte 2 — roda depois do app.js. Monta a faixa de simulação
 * (troca entre site do cliente e painel do ateliê), a conversa de WhatsApp de
 * mentira e o painel de medição. Pedido feito no site vira reserva "aguardando
 * sinal" no painel do ateliê (simulacao/estado.js). */
(function () {
  'use strict';
  var SIM = window.SIMULACAO;
  var LOJA = window.SIM_LOJA;
  var L = window.Logica;
  var CHAVE = 'simulacao-fantasias-eventos';
  var DATAS_RAPIDAS = [['2026-12-31', 'Réveillon 31/12'], ['2027-02-06', 'Carnaval 06/02'], ['2027-06-19', 'Arraiá 19/06']];

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hora(d) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /* ---------- eventos guardados neste navegador ---------- */
  var historico = [];
  try {
    historico = (JSON.parse(localStorage.getItem(CHAVE)) || []).map(function (x) {
      return { evento: x.evento, dados: x.dados, hora: new Date(x.hora) };
    });
  } catch (e) { historico = []; }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(historico.slice(-300))); } catch (e) { /* sem armazenamento */ }
  }

  /* ---------- faixa de simulação ---------- */
  var faixa = el('div', { class: 'sim-faixa', role: 'note' },
    '<div class="largura sim-faixa__linha">' +
      '<nav class="sim-vistas" aria-label="Qual tela">' +
        '<a href="#" class="sim-vista" id="sim-vista-site">Site do cliente</a>' +
        '<a href="#painel" class="sim-vista" id="sim-vista-painel">Painel do ateliê <span class="sim-vista__conta" id="sim-conta-pedidos" hidden></span></a>' +
      '</nav>' +
      '<div class="sim-faixa__datas" id="sim-datas" role="group" aria-label="Testar com a data da festa">' +
        '<span>Testar com:</span>' +
        DATAS_RAPIDAS.map(function (d) { return '<button type="button" class="sim-data" data-data="' + d[0] + '">' + d[1] + '</button>'; }).join('') +
      '</div>' +
      '<button type="button" class="sim-faixa__botao" id="sim-abrir-medicao">Medição <span id="sim-contador">0</span></button>' +
    '</div>');
  document.body.insertBefore(faixa, document.body.firstChild);

  function marcarVista() {
    var painel = location.hash === '#painel';
    document.getElementById('sim-vista-site').setAttribute('aria-current', painel ? 'false' : 'page');
    document.getElementById('sim-vista-painel').setAttribute('aria-current', painel ? 'page' : 'false');
    document.getElementById('sim-datas').hidden = painel;
  }
  window.addEventListener('hashchange', marcarVista);
  marcarVista();

  function contarPedidos() {
    var n = LOJA.todas().filter(function (r) { return r.status === 'pendente'; }).length;
    var c = document.getElementById('sim-conta-pedidos');
    c.textContent = n;
    c.hidden = !n;
  }
  LOJA.aoMudar(contarPedidos);
  contarPedidos();

  /* ---------- conversa de WhatsApp ---------- */
  var conversa = el('dialog', { class: 'sim-whats', id: 'sim-whats', 'aria-labelledby': 'sim-whats-nome' },
    '<div class="sim-whats__topo">' +
      '<span class="sim-whats__avatar" id="sim-whats-avatar" aria-hidden="true"></span>' +
      '<div><p class="sim-whats__nome" id="sim-whats-nome"></p><p class="sim-whats__sub">conversa simulada · número de teste</p></div>' +
      '<button type="button" class="sim-whats__fechar" id="sim-whats-fechar" aria-label="Fechar">×</button>' +
    '</div>' +
    '<div class="sim-whats__chat"><div class="sim-balao"><p id="sim-whats-texto"></p><span class="sim-balao__hora" id="sim-whats-hora"></span></div></div>' +
    '<div class="sim-whats__acoes">' +
      '<div class="sim-confirmar" id="sim-confirmar" hidden>' +
        '<p id="sim-confirmar-texto"></p>' +
        '<a href="#painel" class="botao botao--destaque" id="sim-ir-painel">Ver no painel do ateliê</a>' +
      '</div>' +
      '<button type="button" class="botao botao--leve" id="sim-copiar">Copiar mensagem</button>' +
      '<form class="sim-teste" id="sim-teste">' +
        '<label for="sim-meu-numero">Quer ver no seu WhatsApp? Seu número com DDD</label>' +
        '<div class="sim-teste__linha">' +
          '<input id="sim-meu-numero" inputmode="numeric" placeholder="91 98888-7777" autocomplete="tel-national">' +
          '<button type="submit" class="botao botao--destaque">Gerar link</button>' +
        '</div>' +
        '<p class="sim-teste__resultado" id="sim-teste-resultado" aria-live="polite"></p>' +
      '</form>' +
      '<p class="sim-whats__nota">No site publicado, este botão abre o WhatsApp do ateliê com a mensagem acima já escrita.</p>' +
    '</div>');
  document.body.appendChild(conversa);

  var textoAtual = '';
  SIM.aoWhatsApp = function (numero, texto) {
    var nome = SIM.numeros[numero] || ('+' + numero);
    textoAtual = texto;
    document.getElementById('sim-whats-nome').textContent = nome;
    document.getElementById('sim-whats-avatar').textContent = nome.charAt(0);
    document.getElementById('sim-whats-texto').textContent = texto;
    document.getElementById('sim-whats-hora').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' ✓✓';
    document.getElementById('sim-teste-resultado').innerHTML = '';
    document.getElementById('sim-copiar').textContent = 'Copiar mensagem';
    document.getElementById('sim-confirmar').hidden = true;
    if (!conversa.open) conversa.showModal();
  };

  // O app registra o clique logo depois da conversa abrir: aí o pedido vai para o painel.
  function pedidoDoSite(item) {
    var box = document.getElementById('sim-confirmar');
    var txt = document.getElementById('sim-confirmar-texto');
    var link = document.getElementById('sim-ir-painel');
    if (item.evento !== 'clique_reservar') return;
    var p = window.FantasiaApp.ultimoPedido();
    box.hidden = false;
    if (!p) {
      link.hidden = true;
      txt.textContent = 'Para o pedido entrar no painel do ateliê, escolha a data da festa e um tamanho livre.';
      return;
    }
    var r = LOJA.criarPedidoSite(p);
    link.hidden = false;
    txt.textContent = 'Pedido ' + r.id + ' entrou no painel do ateliê como "aguardando sinal". A peça ' + r.unidade +
      ' fica segura por ' + LOJA.MINUTOS_PENDENTE + ' minutos; sem sinal, volta a ficar livre.';
  }
  document.getElementById('sim-ir-painel').addEventListener('click', function () {
    conversa.close();
    var ficha = document.getElementById('ficha');
    if (ficha.open) ficha.close();
  });

  document.getElementById('sim-whats-fechar').addEventListener('click', function () { conversa.close(); });
  conversa.addEventListener('click', function (e) { if (e.target === conversa) conversa.close(); });

  document.getElementById('sim-copiar').addEventListener('click', function () {
    var botao = this;
    function marcar() {
      var alvo = document.getElementById('sim-whats-texto');
      var r = document.createRange(); r.selectNodeContents(alvo);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      botao.textContent = 'Texto selecionado: use Ctrl+C';
    }
    try {
      navigator.clipboard.writeText(textoAtual).then(function () { botao.textContent = 'Copiada'; }, marcar);
    } catch (e) { marcar(); }
  });

  document.getElementById('sim-teste').addEventListener('submit', function (e) {
    e.preventDefault();
    var digitos = document.getElementById('sim-meu-numero').value.replace(/\D/g, '');
    if (digitos.length >= 10 && digitos.length <= 11) digitos = '55' + digitos;
    var out = document.getElementById('sim-teste-resultado');
    if (!L.numeroWhatsAppValido(digitos)) {
      out.textContent = 'Número incompleto. Use DDD + número, por exemplo 91 98888-7777.';
      return;
    }
    out.innerHTML = '<a data-real href="' + esc(L.linkWhatsApp(digitos, textoAtual)) + '" target="_blank" rel="noopener">Abrir conversa com +' + esc(digitos) + '</a>' +
      '<span>Se o link não abrir aqui, copie a mensagem acima.</span>';
  });

  /* ---------- painel de medição ---------- */
  var NOMES = {
    visita: 'Visita', busca: 'Busca', abrir_ficha: 'Abriu fantasia', sugestao_tamanho: 'Usou sugestão de tamanho',
    clique_reservar: 'Clicou em reservar', clique_pedir_outra_data: 'Pediu outra data (esgotada)',
    escolheu_data: 'Escolheu a data da festa', filtro_disponivel: 'Filtrou só disponíveis',
    clique_grupo: 'Pediu orçamento de grupo', clique_falar_atelie: 'Falou com o ateliê', clique_nao_encontrei: 'Não encontrou a fantasia',
    filtro_tema: 'Filtrou por tema', filtro_genero: 'Filtrou por gênero', filtro_tamanho: 'Filtrou por tamanho', filtro_precoMax: 'Filtrou por preço'
  };
  var painel = el('dialog', { class: 'sim-medicao', id: 'sim-medicao', 'aria-labelledby': 'sim-medicao-titulo' },
    '<div class="sim-medicao__topo"><h2 id="sim-medicao-titulo">Medição da validação</h2>' +
      '<button type="button" class="sim-whats__fechar" id="sim-medicao-fechar" aria-label="Fechar">×</button></div>' +
    '<p class="sim-medicao__intro">O que o site registra enquanto você navega. No site publicado, estes eventos vão para o Plausible ou o Google Analytics. O sinal pago conta quando o ateliê confirma o sinal no painel.</p>' +
    '<div class="sim-funil" id="sim-funil"></div>' +
    '<div class="sim-medicao__barra"><h3>Eventos</h3>' +
      '<div><button type="button" class="botao botao--leve" id="sim-nova-visita">Simular nova visita</button> ' +
      '<button type="button" class="botao botao--leve" id="sim-zerar">Zerar</button></div></div>' +
    '<ol class="sim-eventos" id="sim-eventos"></ol>');
  document.body.appendChild(painel);

  function contar(nome) { return historico.filter(function (x) { return x.evento === nome; }).length; }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '—'; }

  function renderizarPainel() {
    var v = contar('visita'), f = contar('abrir_ficha'), r = contar('clique_reservar');
    var pg = LOJA.todas().filter(function (x) { return x.origem === 'site' && (x.pagamentos || []).some(function (p) { return p.tipo === 'sinal'; }); }).length;
    document.getElementById('sim-contador').textContent = historico.length;
    document.getElementById('sim-funil').innerHTML = [
      ['Visitas', v, ''],
      ['Abriram uma fantasia', f, pct(f, v) + ' das visitas'],
      ['Clicaram em reservar', r, pct(r, v) + ' das visitas'],
      ['Sinal pago (pedidos do site)', pg, pct(pg, v) + ' das visitas']
    ].map(function (c) {
      return '<div class="sim-funil__etapa"><span class="sim-funil__rotulo">' + c[0] + '</span>' +
        '<strong>' + c[1] + '</strong><span class="sim-funil__taxa">' + c[2] + '</span></div>';
    }).join('');
    var lista = document.getElementById('sim-eventos');
    if (!historico.length) {
      lista.innerHTML = '<li class="sim-eventos__vazio">Nenhum evento ainda. Busque, abra uma fantasia e clique em reservar.</li>';
      return;
    }
    lista.innerHTML = historico.slice().reverse().slice(0, 80).map(function (x) {
      var dados = Object.keys(x.dados || {}).filter(function (k) { return x.dados[k] !== '' && x.dados[k] != null; })
        .map(function (k) { var v = x.dados[k]; return esc(k) + ': ' + esc(v === true ? 'sim' : v === false ? 'não' : v); }).join(' · ');
      return '<li><span class="sim-eventos__hora">' + hora(x.hora) + '</span>' +
        '<span class="sim-eventos__nome">' + esc(NOMES[x.evento] || x.evento) + '</span>' +
        (dados ? '<span class="sim-eventos__dados">' + dados + '</span>' : '') + '</li>';
    }).join('');
  }

  SIM.aoEvento = function (item) {
    historico.push(item); salvar(); renderizarPainel();
    if (item.evento === 'clique_reservar') pedidoDoSite(item);
  };
  SIM.eventos.forEach(function (item) { historico.push(item); });
  window.dataLayer.push({ event: 'visita', origem: 'carregou a página' });
  LOJA.aoMudar(renderizarPainel);

  document.getElementById('sim-abrir-medicao').addEventListener('click', function () { renderizarPainel(); painel.showModal(); });
  document.getElementById('sim-medicao-fechar').addEventListener('click', function () { painel.close(); });
  painel.addEventListener('click', function (e) { if (e.target === painel) painel.close(); });
  document.getElementById('sim-nova-visita').addEventListener('click', function () {
    window.dataLayer.push({ event: 'visita', origem: 'simulada' });
  });
  document.getElementById('sim-zerar').addEventListener('click', function () {
    historico = []; salvar(); renderizarPainel();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.sim-data'), function (b) {
    b.addEventListener('click', function () {
      window.FantasiaApp.definirData(b.dataset.data);
      document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
    });
  });

  renderizarPainel();
})();
