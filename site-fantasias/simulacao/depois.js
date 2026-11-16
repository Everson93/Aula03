/* Simulação, parte 2 — roda depois do app.js. Monta a faixa de simulação,
 * a conversa de WhatsApp de mentira e o painel de medição. */
(function () {
  'use strict';
  var SIM = window.SIMULACAO;
  var L = window.Logica;
  var CHAVE = 'simulacao-fantasias-eventos';

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

  /* ---------- reservas simuladas (confirmadas nesta simulação) ---------- */
  var CHAVE_RESERVAS = 'simulacao-fantasias-reservas';
  var DATAS_RAPIDAS = [['2026-12-31', 'Réveillon 31/12'], ['2027-02-06', 'Carnaval 06/02'], ['2027-06-19', 'Arraiá 19/06']];
  var simuladas = [];
  try { simuladas = JSON.parse(localStorage.getItem(CHAVE_RESERVAS)) || []; } catch (e) { simuladas = []; }
  function salvarReservas() {
    try { localStorage.setItem(CHAVE_RESERVAS, JSON.stringify(simuladas)); } catch (e) { /* sem armazenamento */ }
  }
  function aplicarReservas() {
    window.AGENDA = (window.AGENDA || []).filter(function (r) { return !r.simulada; }).concat(simuladas);
    if (window.FantasiaApp) window.FantasiaApp.atualizar();
  }

  /* ---------- faixa de simulação ---------- */
  var faixa = el('div', { class: 'sim-faixa', role: 'note' },
    '<div class="largura sim-faixa__linha">' +
      '<p><strong>Simulação.</strong> Nada é enviado. Estoque e reservas são de exemplo.</p>' +
      '<div class="sim-faixa__datas" role="group" aria-label="Testar com a data">' +
        '<span>Testar com:</span>' +
        DATAS_RAPIDAS.map(function (d) { return '<button type="button" class="sim-data" data-data="' + d[0] + '">' + d[1] + '</button>'; }).join('') +
      '</div>' +
      '<div class="sim-faixa__acoes">' +
        '<button type="button" class="sim-faixa__botao" id="sim-abrir-estoque">Estoque</button>' +
        '<button type="button" class="sim-faixa__botao" id="sim-abrir-medicao">Medição <span id="sim-contador">0</span></button>' +
      '</div>' +
    '</div>');
  document.body.insertBefore(faixa, document.body.firstChild);

  /* ---------- conversa de WhatsApp ---------- */
  var conversa = el('dialog', { class: 'sim-whats', id: 'sim-whats', 'aria-labelledby': 'sim-whats-nome' },
    '<div class="sim-whats__topo">' +
      '<span class="sim-whats__avatar" id="sim-whats-avatar" aria-hidden="true"></span>' +
      '<div><p class="sim-whats__nome" id="sim-whats-nome"></p><p class="sim-whats__sub">conversa simulada · número de teste</p></div>' +
      '<button type="button" class="sim-whats__fechar" id="sim-whats-fechar" aria-label="Fechar">×</button>' +
    '</div>' +
    '<div class="sim-whats__chat"><div class="sim-balao"><p id="sim-whats-texto"></p><span class="sim-balao__hora" id="sim-whats-hora"></span></div></div>' +
    '<div class="sim-whats__acoes">' +
      '<button type="button" class="botao botao--leve" id="sim-copiar">Copiar mensagem</button>' +
      '<form class="sim-teste" id="sim-teste">' +
        '<label for="sim-meu-numero">Quer ver no seu WhatsApp? Seu número com DDD</label>' +
        '<div class="sim-teste__linha">' +
          '<input id="sim-meu-numero" inputmode="numeric" placeholder="91 98888-7777" autocomplete="tel-national">' +
          '<button type="submit" class="botao botao--destaque">Gerar link</button>' +
        '</div>' +
        '<p class="sim-teste__resultado" id="sim-teste-resultado" aria-live="polite"></p>' +
      '</form>' +
      '<div class="sim-confirmar" id="sim-confirmar" hidden>' +
        '<p id="sim-confirmar-texto"></p>' +
        '<button type="button" class="botao botao--destaque" id="sim-confirmar-botao">Simular: loja confirmou e o sinal foi pago</button>' +
      '</div>' +
      '<p class="sim-whats__nota">No site publicado, este botão abre o WhatsApp da loja com a mensagem acima já escrita. A loja confirma a data e manda a chave Pix do sinal.</p>' +
    '</div>');
  document.body.appendChild(conversa);

  var textoAtual = '';
  var pendente = null;   // reserva do último clique, esperando a "loja" confirmar

  // Chamado quando o app registra o clique (logo depois da conversa abrir).
  function prepararConfirmacao(item) {
    var box = document.getElementById('sim-confirmar');
    var txt = document.getElementById('sim-confirmar-texto');
    var botao = document.getElementById('sim-confirmar-botao');
    var d = item.dados;
    if (item.evento !== 'clique_reservar') { box.hidden = true; return; }
    box.hidden = false;
    if (!d.unidade) {
      pendente = null;
      botao.hidden = true;
      txt.textContent = 'Para simular a confirmação da loja, escolha a data da festa e um tamanho livre.';
      return;
    }
    pendente = { fantasia: d.id, tamanho: d.tamanho, unidade: d.unidade, retirada: d.retirada, devolucao: d.devolucao, simulada: true };
    botao.hidden = false;
    txt.textContent = 'A loja separa a peça ' + d.unidade + ' de ' + L.dataBR(d.retirada) + ' a ' + L.dataBR(d.devolucao) +
      ' (mais a higienização). O estoque dessa data baixa na vitrine.';
  }
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
    pendente = null;
    if (!conversa.open) conversa.showModal();
  };
  document.getElementById('sim-whats-fechar').addEventListener('click', function () { conversa.close(); });
  document.getElementById('sim-confirmar-botao').addEventListener('click', function () {
    if (!pendente) return;
    simuladas.push(pendente);
    salvarReservas();
    window.dataLayer.push({ event: 'sinal_pago', id: pendente.fantasia, unidade: pendente.unidade, origem: 'simulado' });
    pendente = null;
    conversa.close();
    aplicarReservas();
  });
  conversa.addEventListener('click', function (e) { if (e.target === conversa) conversa.close(); });

  document.getElementById('sim-copiar').addEventListener('click', function () {
    var botao = this;
    var texto = textoAtual;
    function marcar() {
      var alvo = document.getElementById('sim-whats-texto');
      var r = document.createRange(); r.selectNodeContents(alvo);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      botao.textContent = 'Texto selecionado: use Ctrl+C';
    }
    try {
      navigator.clipboard.writeText(texto).then(function () { botao.textContent = 'Copiada'; }, marcar);
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
    escolheu_data: 'Escolheu a data da festa', filtro_disponivel: 'Filtrou só disponíveis', sinal_pago: 'Sinal pago (simulado)',
    clique_grupo: 'Pediu orçamento de grupo',
    clique_parceiro: 'Loja quer ser parceira', clique_nao_encontrei: 'Não encontrou a fantasia',
    filtro_tema: 'Filtrou por tema', filtro_genero: 'Filtrou por gênero', filtro_tamanho: 'Filtrou por tamanho', filtro_precoMax: 'Filtrou por preço'
  };
  var painel = el('dialog', { class: 'sim-medicao', id: 'sim-medicao', 'aria-labelledby': 'sim-medicao-titulo' },
    '<div class="sim-medicao__topo"><h2 id="sim-medicao-titulo">Medição da validação</h2>' +
      '<button type="button" class="sim-whats__fechar" id="sim-medicao-fechar" aria-label="Fechar">×</button></div>' +
    '<p class="sim-medicao__intro">O que esta página registra enquanto você navega. No site publicado, estes eventos vão para o Plausible ou o Google Analytics. As reservas pagas você conta à parte, pelo WhatsApp.</p>' +
    '<div class="sim-funil" id="sim-funil"></div>' +
    '<div class="sim-medicao__barra"><h3>Eventos</h3>' +
      '<div><button type="button" class="botao botao--leve" id="sim-nova-visita">Simular nova visita</button> ' +
      '<button type="button" class="botao botao--leve" id="sim-zerar">Zerar</button></div></div>' +
    '<ol class="sim-eventos" id="sim-eventos"></ol>');
  document.body.appendChild(painel);

  function contar(nome) { return historico.filter(function (x) { return x.evento === nome; }).length; }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '—'; }

  function renderizarPainel() {
    var v = contar('visita'), f = contar('abrir_ficha'), r = contar('clique_reservar'), pg = contar('sinal_pago');
    document.getElementById('sim-contador').textContent = historico.length;
    document.getElementById('sim-funil').innerHTML = [
      ['Visitas', v, ''],
      ['Abriram uma fantasia', f, pct(f, v) + ' das visitas'],
      ['Clicaram em reservar', r, pct(r, v) + ' das visitas'],
      ['Sinal pago', pg, pct(pg, v) + ' das visitas · simulado']
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
    if (item.evento === 'clique_reservar' || item.evento === 'clique_pedir_outra_data') prepararConfirmacao(item);
  };
  // Eventos que o app.js disparou antes desta parte carregar (ex.: ficha aberta por link).
  SIM.eventos.forEach(function (item) { historico.push(item); });
  window.dataLayer.push({ event: 'visita', origem: 'carregou a página' });

  document.getElementById('sim-abrir-medicao').addEventListener('click', function () { renderizarPainel(); painel.showModal(); });
  document.getElementById('sim-medicao-fechar').addEventListener('click', function () { painel.close(); });
  painel.addEventListener('click', function (e) { if (e.target === painel) painel.close(); });
  document.getElementById('sim-nova-visita').addEventListener('click', function () {
    window.dataLayer.push({ event: 'visita', origem: 'simulada' });
  });
  document.getElementById('sim-zerar').addEventListener('click', function () {
    historico = []; salvar(); renderizarPainel();
  });

  /* ---------- painel de estoque ---------- */
  var estoque = el('dialog', { class: 'sim-medicao sim-estoque', id: 'sim-estoque', 'aria-labelledby': 'sim-estoque-titulo' },
    '<div class="sim-medicao__topo"><h2 id="sim-estoque-titulo">Estoque e agenda</h2>' +
      '<button type="button" class="sim-whats__fechar" id="sim-estoque-fechar" aria-label="Fechar">×</button></div>' +
    '<p class="sim-medicao__intro">Peças livres na data da festa, contando retirada, devolução e 1 dia de higienização de cada reserva. Abra uma fantasia para ver a agenda de cada peça.</p>' +
    '<div class="sim-estoque__barra">' +
      '<label for="sim-estoque-data">Festa em</label>' +
      '<input type="date" id="sim-estoque-data">' +
      '<button type="button" class="botao botao--leve" id="sim-estoque-usar">Usar na vitrine</button>' +
      '<button type="button" class="botao botao--leve" id="sim-estoque-limpar">Apagar reservas simuladas</button>' +
    '</div>' +
    '<p class="sim-estoque__resumo" id="sim-estoque-resumo"></p>' +
    '<div id="sim-estoque-lista"></div>');
  document.body.appendChild(estoque);

  function nomesLojas(f) { return window.CONFIG.lojas[f.loja]; }

  function renderizarEstoque() {
    var data = document.getElementById('sim-estoque-data').value;
    var hoje = (function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })();
    var agenda = window.AGENDA || [];
    var cont = { esgotada: 0, parcial: 0, livre: 0 };
    var html = window.FANTASIAS.map(function (f) {
      var loja = nomesLojas(f);
      var margem = loja.margemHigienizacao == null ? 1 : loja.margemHigienizacao;
      var per = L.periodoAluguel(data, hoje, 0, loja);
      var disp = L.disponibilidade(f, agenda, per, margem);
      var tams = Object.keys(disp);
      var livres = L.tamanhosLivres(disp);
      var situ = !per ? 'livre' : !livres.length ? 'esgotada' : livres.length < tams.length ? 'parcial' : 'livre';
      cont[situ]++;
      var chips = tams.map(function (t) {
        var d = disp[t];
        var cls = !per ? '' : !d.livres.length ? ' sim-chip--zero' : d.livres.length < d.total ? ' sim-chip--parcial' : ' sim-chip--ok';
        return '<span class="sim-chip' + cls + '">' + t + ' <b>' + d.livres.length + '/' + d.total + '</b></span>';
      }).join('');
      var unidades = tams.map(function (t) {
        return L.unidades(f, t).map(function (u) {
          var res = agenda.filter(function (r) { return r.unidade === u && r.devolucao >= hoje; })
            .sort(function (a, b) { return a.retirada < b.retirada ? -1 : 1; });
          var ocupada = per && res.some(function (r) {
            return per.retirada <= L.somarDias(r.devolucao, margem) && r.retirada <= L.somarDias(per.devolucao, margem);
          });
          return '<li class="' + (ocupada ? 'sim-un--ocupada' : '') + '"><span class="sim-un__id">' + esc(u) + '</span>' +
            '<span class="sim-un__res">' + (res.length ? res.map(function (r) {
              return '<span class="sim-res' + (r.simulada ? ' sim-res--sim' : '') + '">' + L.dataBR(r.retirada).slice(0, 5) + '–' + L.dataBR(r.devolucao).slice(0, 5) + '</span>';
            }).join('') : '<span class="sim-un__vazia">sem reservas</span>') + '</span></li>';
        }).join('');
      }).join('');
      return '<details class="sim-fant sim-fant--' + situ + '"><summary>' +
        '<span class="sim-fant__nome">' + esc(f.nome) + ' <small>' + esc(f.id) + ' · ' + esc(loja.nome) + '</small></span>' +
        '<span class="sim-fant__chips">' + chips + '</span></summary>' +
        (per ? '<p class="sim-fant__per">Período para essa festa: retirada ' + esc(L.dataComDia(per.retirada)) + ', devolução ' + esc(L.dataComDia(per.devolucao)) + '. Peças em vermelho estão ocupadas nesse período.</p>' : '') +
        '<ul class="sim-un">' + unidades + '</ul></details>';
    }).join('');
    document.getElementById('sim-estoque-lista').innerHTML = html;
    var nSim = agenda.filter(function (r) { return r.simulada; }).length;
    document.getElementById('sim-estoque-resumo').innerHTML = (L.periodoAluguel(data, hoje, 0, {})
      ? '<strong>' + esc(L.dataComDia(data)) + ':</strong> ' + cont.esgotada + ' esgotadas, ' + cont.parcial + ' com algum tamanho esgotado, ' + cont.livre + ' livres. '
      : 'Escolha uma data futura. ') +
      agenda.length + ' reservas na agenda' + (nSim ? ' (' + nSim + ' confirmadas por você nesta simulação)' : '') + '.';
  }

  document.getElementById('sim-abrir-estoque').addEventListener('click', function () {
    var campo = document.getElementById('sim-estoque-data');
    campo.value = document.getElementById('busca-data').value || campo.value || '2027-02-06';
    renderizarEstoque();
    estoque.showModal();
  });
  document.getElementById('sim-estoque-fechar').addEventListener('click', function () { estoque.close(); });
  estoque.addEventListener('click', function (e) { if (e.target === estoque) estoque.close(); });
  document.getElementById('sim-estoque-data').addEventListener('change', renderizarEstoque);
  document.getElementById('sim-estoque-usar').addEventListener('click', function () {
    window.FantasiaApp.definirData(document.getElementById('sim-estoque-data').value);
    estoque.close();
    document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('sim-estoque-limpar').addEventListener('click', function () {
    simuladas = []; salvarReservas(); aplicarReservas(); renderizarEstoque();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.sim-data'), function (b) {
    b.addEventListener('click', function () {
      window.FantasiaApp.definirData(b.dataset.data);
      document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
    });
  });

  aplicarReservas();
  renderizarPainel();
})();
