/* Interface da landing. Regras de negócio ficam em logica.js. */
(function () {
  'use strict';

  var C = window.CONFIG;
  var L = window.Logica;
  var FANTASIAS = window.FANTASIAS;
  var TEMAS = window.TEMAS;

  var estado = { texto: '', tema: '', genero: '', tamanho: '', precoMax: '', dataFesta: '' };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hojeIso() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------- medição ---------- */
  function registrar(evento, props) {
    props = props || {};
    try {
      if (typeof window.plausible === 'function') window.plausible(evento, { props: props });
      if (typeof window.gtag === 'function') window.gtag('event', evento, props);
      (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: evento }, props));
      if (C.mostrarEventosNoConsole) console.info('[evento]', evento, props);
    } catch (e) { /* medição nunca derruba a página */ }
  }

  /* ---------- configuração incompleta ---------- */
  function avisarConfiguracao() {
    var faltando = [];
    if (!L.numeroWhatsAppValido(C.whatsappCentral)) faltando.push('WhatsApp central');
    Object.keys(C.lojas).forEach(function (k) {
      if (!L.numeroWhatsAppValido(C.lojas[k].whatsapp)) faltando.push('WhatsApp de ' + C.lojas[k].nome);
    });
    if (!faltando.length) return;
    var el = $('aviso-config');
    el.textContent = 'Configuração pendente em config.js: ' + faltando.join(', ') +
      '. Os botões desses contatos ficam desativados até preencher.';
    el.hidden = false;
  }

  /* ---------- filtros ---------- */
  function montarFiltros() {
    var chips = $('chips-temas');
    var selTema = $('filtro-tema');
    TEMAS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = t.nome;
      b.dataset.tema = t.id;
      b.addEventListener('click', function () {
        estado.tema = estado.tema === t.id ? '' : t.id;
        selTema.value = estado.tema;
        registrar('filtro_tema', { tema: t.id, origem: 'chip' });
        renderizarGrade();
        $('catalogo').scrollIntoView({ behavior: 'smooth' });
      });
      chips.appendChild(b);
      selTema.add(new Option(t.nome, t.id));
    });

    var presentes = {};
    FANTASIAS.forEach(function (f) { Object.keys(f.tamanhos).forEach(function (t) { presentes[t] = 1; }); });
    L.ordenarTamanhos(Object.keys(presentes)).forEach(function (t) { $('filtro-tamanho').add(new Option(t, t)); });

    [['filtro-tema', 'tema'], ['filtro-genero', 'genero'], ['filtro-tamanho', 'tamanho'], ['filtro-preco', 'precoMax']]
      .forEach(function (par) {
        $(par[0]).addEventListener('change', function (e) {
          estado[par[1]] = e.target.value;
          registrar('filtro_' + par[1], { valor: e.target.value });
          renderizarGrade();
        });
      });

    function limpar() {
      estado.texto = estado.tema = estado.genero = estado.tamanho = estado.precoMax = '';
      $('busca-texto').value = '';
      ['filtro-tema', 'filtro-genero', 'filtro-tamanho', 'filtro-preco'].forEach(function (id) { $(id).value = ''; });
      renderizarGrade();
    }
    $('limpar-filtros').addEventListener('click', limpar);
    $('vazio-limpar').addEventListener('click', limpar);

    var data = $('busca-data');
    data.min = hojeIso();
    data.addEventListener('change', function () { estado.dataFesta = data.value; });

    $('form-busca').addEventListener('submit', function (e) {
      e.preventDefault();
      estado.texto = $('busca-texto').value;
      estado.dataFesta = data.value;
      registrar('busca', { termo: estado.texto, temData: !!estado.dataFesta });
      renderizarGrade();
      $('catalogo').scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ---------- grade ---------- */
  function capa(f, classe) {
    if (f.fotos && f.fotos.length) {
      return '<div class="' + classe + '"><img src="' + esc(f.fotos[0]) + '" alt="' + esc(f.nome) + '" loading="lazy"></div>';
    }
    var inicial = f.nome.charAt(0);
    return '<div class="' + classe + ' capa--ilustrativa" style="--cor:' + esc(f.cor) + '">' +
      '<span class="capa__inicial" aria-hidden="true">' + esc(inicial) + '</span>' +
      '<span class="capa__selo">foto ilustrativa</span></div>';
  }

  function nomeTema(id) {
    var t = TEMAS.find(function (x) { return x.id === id; });
    return t ? t.nome : id;
  }

  function renderizarGrade() {
    var lista = L.filtrar(FANTASIAS, estado);
    var grade = $('grade');
    grade.innerHTML = lista.map(function (f) {
      var loja = C.lojas[f.loja];
      return '<li><button type="button" class="cartao" data-id="' + esc(f.id) + '">' +
        capa(f, 'cartao__capa') +
        '<span class="cartao__info">' +
          '<span class="cartao__temas">' + f.temas.map(nomeTema).map(esc).join(' · ') + '</span>' +
          '<span class="cartao__nome">' + esc(f.nome) + '</span>' +
          '<span class="cartao__loja">' + esc(loja.nome) + ' · ' + esc(loja.bairro) + '</span>' +
          '<span class="cartao__rodape">' +
            '<span class="cartao__preco">' + L.formatarPreco(f.preco) + ' <small>/ 3 dias</small></span>' +
            '<span class="cartao__tamanhos">' + L.ordenarTamanhos(Object.keys(f.tamanhos)).join(' ') + '</span>' +
          '</span>' +
        '</span></button></li>';
    }).join('');

    $('contagem').textContent = lista.length === 1 ? '1 fantasia' : lista.length + ' fantasias';
    $('vazio').hidden = lista.length > 0;

    document.querySelectorAll('.chip').forEach(function (c) {
      c.classList.toggle('chip--ativo', c.dataset.tema === estado.tema);
      c.setAttribute('aria-pressed', c.dataset.tema === estado.tema ? 'true' : 'false');
    });
  }

  /* ---------- ficha da fantasia ---------- */
  function abrirFicha(id, origem) {
    var f = FANTASIAS.find(function (x) { return x.id === id; });
    if (!f) return;
    var loja = C.lojas[f.loja];
    var tamanhos = L.ordenarTamanhos(Object.keys(f.tamanhos));
    var sel = { tamanho: tamanhos.length === 1 ? tamanhos[0] : '', kit: [] };

    var corpo = $('ficha-corpo');
    corpo.innerHTML =
      '<div class="ficha__grade">' +
        capa(f, 'ficha__capa') +
        '<div class="ficha__info">' +
          '<p class="ficha__temas">' + f.temas.map(nomeTema).map(esc).join(' · ') + ' · cód. ' + esc(f.id) + '</p>' +
          '<h2 id="ficha-nome">' + esc(f.nome) + '</h2>' +
          '<p class="ficha__loja">' + esc(loja.nome) + ' — ' + esc(loja.bairro) + '</p>' +
          '<p>' + esc(f.descricao) + '</p>' +
          '<dl class="valores">' +
            '<div><dt>Aluguel (3 dias)</dt><dd>' + L.formatarPreco(f.preco) + '</dd></div>' +
            '<div><dt>Dia extra</dt><dd>' + L.formatarPreco(f.diaExtra) + '</dd></div>' +
            '<div><dt>Caução</dt><dd>' + L.formatarPreco(f.caucao) + '</dd></div>' +
          '</dl>' +
          '<p class="inclui"><strong>Vem com:</strong> ' + f.inclui.map(esc).join(', ') + '</p>' +
        '</div>' +
      '</div>' +

      '<h3>Medidas da peça (cm)</h3>' +
      '<div class="tabela-rolagem"><table class="medidas"><thead><tr><th>Tamanho</th><th>Busto</th><th>Cintura</th><th>Quadril</th><th>Altura</th></tr></thead><tbody>' +
        tamanhos.map(function (t) {
          var m = f.tamanhos[t];
          return '<tr data-tam="' + t + '"><th>' + t + '</th><td>' + m[0] + '</td><td>' + m[1] + '</td><td>' + m[2] + '</td><td>até ' + m[3] + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' +

      '<div class="sugestao">' +
        '<p><strong>Qual tamanho?</strong> Informe sua altura e peso:</p>' +
        '<div class="sugestao__campos">' +
          '<label>Altura (cm) <input type="number" id="sug-altura" min="120" max="220" inputmode="numeric"></label>' +
          '<label>Peso (kg) <input type="number" id="sug-peso" min="30" max="200" inputmode="numeric"></label>' +
        '</div>' +
        '<p id="sug-resultado" class="sugestao__resultado" aria-live="polite"></p>' +
      '</div>' +

      '<h3>Sua reserva</h3>' +
      '<fieldset class="tamanhos"><legend>Tamanho</legend>' +
        tamanhos.map(function (t) {
          return '<label class="tam"><input type="radio" name="tam" value="' + t + '"' + (sel.tamanho === t ? ' checked' : '') + '><span>' + t + '</span></label>';
        }).join('') +
      '</fieldset>' +
      '<label class="campo-data">Data da festa <input type="date" id="ficha-data" min="' + hojeIso() + '" value="' + esc(estado.dataFesta) + '"></label>' +
      '<p id="aviso-data" class="aviso-data" hidden></p>' +

      (f.kit.length ?
        '<fieldset class="kit"><legend>Complete o look</legend>' +
          f.kit.map(function (k) {
            return '<label class="kit__item"><input type="checkbox" value="' + esc(k.id) + '">' +
              '<span>' + esc(k.nome) + ' <small>(' + (k.tipo === 'venda' ? 'é seu' : 'aluguel') + ')</small></span>' +
              '<span class="kit__preco">+ ' + L.formatarPreco(k.preco) + '</span></label>';
          }).join('') +
        '</fieldset>' : '') +

      '<div class="resumo" id="resumo"></div>' +
      '<p class="politica"><strong>Cancelamento:</strong> ' + esc(loja.politicaCancelamento) +
        ' <strong>Caução:</strong> devolvida na entrega; só é retida se a vistoria de devolução mostrar dano que não está nas fotos da retirada.</p>' +
      '<a class="botao botao--destaque botao--largo" id="botao-reservar" target="_blank" rel="noopener">Reservar pelo WhatsApp</a>' +
      '<p class="nota-reserva" id="nota-reserva"></p>';

    var whatsOk = L.numeroWhatsAppValido(loja.whatsapp);

    function atualizar() {
      var o = L.calcularOrcamento(f, sel.kit, loja.sinal);
      $('resumo').innerHTML =
        '<div><span>Aluguel</span><span>' + L.formatarPreco(o.aluguel) + '</span></div>' +
        (o.kit ? '<div><span>Complementos</span><span>' + L.formatarPreco(o.kit) + '</span></div>' : '') +
        '<div class="resumo__total"><span>Total</span><span>' + L.formatarPreco(o.total) + '</span></div>' +
        '<div class="resumo__sinal"><span>Sinal para garantir (' + o.percentualSinal + '%, via Pix)</span><span>' + L.formatarPreco(o.sinal) + '</span></div>' +
        '<div><span>Saldo na retirada</span><span>' + L.formatarPreco(o.saldo) + '</span></div>' +
        '<div><span>Caução (devolvida)</span><span>' + L.formatarPreco(o.caucao) + '</span></div>';

      var dias = L.diasEntre(hojeIso(), estado.dataFesta);
      var aviso = $('aviso-data');
      if (dias !== null && dias < 0) {
        aviso.textContent = 'Essa data já passou.';
        aviso.hidden = false;
      } else if (dias !== null && dias < 7) {
        aviso.textContent = 'Faltam menos de 7 dias: se cancelar, vale a política da loja (o reembolso integral do sinal é só até 7 dias antes).';
        aviso.hidden = false;
      } else {
        aviso.hidden = true;
      }

      document.querySelectorAll('.medidas tr[data-tam]').forEach(function (tr) {
        tr.classList.toggle('medidas--sel', tr.dataset.tam === sel.tamanho);
      });

      var botao = $('botao-reservar');
      var nota = $('nota-reserva');
      if (!whatsOk) {
        botao.removeAttribute('href');
        botao.setAttribute('aria-disabled', 'true');
        nota.textContent = 'WhatsApp desta loja ainda não configurado.';
        return;
      }
      var texto = L.mensagemReserva({
        nomeSite: C.nomeSite, fantasia: f, tamanho: sel.tamanho, dataFesta: estado.dataFesta, orcamento: o
      });
      botao.href = L.linkWhatsApp(loja.whatsapp, texto);
      botao.removeAttribute('aria-disabled');
      nota.textContent = 'A loja confirma a disponibilidade na data e envia a chave Pix do sinal.';
    }

    corpo.querySelectorAll('input[name="tam"]').forEach(function (r) {
      r.addEventListener('change', function () { sel.tamanho = r.value; atualizar(); });
    });
    corpo.querySelectorAll('.kit input').forEach(function (c) {
      c.addEventListener('change', function () {
        sel.kit = Array.prototype.filter.call(corpo.querySelectorAll('.kit input'), function (x) { return x.checked; })
          .map(function (x) { return x.value; });
        atualizar();
      });
    });
    $('ficha-data').addEventListener('change', function (e) {
      estado.dataFesta = e.target.value;
      $('busca-data').value = e.target.value;
      atualizar();
    });

    function sugerir() {
      var r = L.sugerirTamanho($('sug-altura').value, $('sug-peso').value, tamanhos);
      var out = $('sug-resultado');
      if (!r) { out.textContent = ''; return; }
      if (r.exato) {
        out.textContent = 'Sugerimos o tamanho ' + r.tamanho + '. Confira busto e quadril na tabela.';
      } else if (r.tamanho) {
        out.textContent = 'Sua referência seria ' + r.ideal + ', que esta peça não tem. O mais próximo é ' + r.tamanho + ' (um pouco maior).';
      } else {
        out.textContent = 'Sua referência seria ' + r.ideal + ', maior que os tamanhos desta peça. Pergunte à loja por ajuste.';
        return;
      }
      sel.tamanho = r.tamanho;
      var radio = corpo.querySelector('input[name="tam"][value="' + r.tamanho + '"]');
      if (radio) radio.checked = true;
      registrar('sugestao_tamanho', { id: f.id, ideal: r.ideal, sugerido: r.tamanho || '' });
      atualizar();
    }
    $('sug-altura').addEventListener('change', sugerir);
    $('sug-peso').addEventListener('change', sugerir);

    $('botao-reservar').addEventListener('click', function (e) {
      if (!whatsOk) { e.preventDefault(); return; }
      registrar('clique_reservar', {
        id: f.id, loja: f.loja, tamanho: sel.tamanho || '', temData: !!estado.dataFesta, itensKit: sel.kit.length
      });
    });

    atualizar();
    var dlg = $('ficha');
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
    // "#f-HW01": nome simples no hash (sem "/"), que sobrevive a qualquer hospedagem.
    trocarHash('#f-' + f.id);
    registrar('abrir_ficha', { id: f.id, origem: origem });
  }

  function ligarFicha() {
    $('grade').addEventListener('click', function (e) {
      var c = e.target.closest('.cartao');
      if (c) abrirFicha(c.dataset.id, 'grade');
    });
    var dlg = $('ficha');
    dlg.addEventListener('close', function () {
      if (/^#f[-\/]/.test(location.hash)) trocarHash('');
    });
    // Clique fora do conteúdo fecha.
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

    var m = /^#f[-\/](\w+)$/.exec(location.hash); // aceita também o formato antigo #f/HW01
    if (m) abrirFicha(m[1], 'link');
  }

  function trocarHash(h) {
    if (location.hash === h) return;
    try { history.replaceState(null, '', h || (location.pathname + location.search)); } catch (e) { /* moldura sem history */ }
  }

  /* ---------- botões de contato geral ---------- */
  function ligarContatos() {
    var ok = L.numeroWhatsAppValido(C.whatsappCentral);
    var alvos = [
      ['botao-grupo', 'clique_grupo', 'Olá! Quero um orçamento de fantasias para um grupo. Tema: ___ · Quantidade: ___ · Data: ___'],
      ['botao-parceiro', 'clique_parceiro', 'Olá! Tenho uma loja/ateliê de fantasias e quero ser parceiro do ' + C.nomeSite + '.'],
      ['vazio-whats', 'clique_nao_encontrei', 'Olá! Não encontrei no site a fantasia que procuro: ___']
    ];
    alvos.forEach(function (a) {
      var el = $(a[0]);
      if (!ok) {
        el.removeAttribute('href');
        el.setAttribute('aria-disabled', 'true');
        el.title = 'WhatsApp central ainda não configurado';
        el.addEventListener('click', function (e) { e.preventDefault(); });
        return;
      }
      el.href = L.linkWhatsApp(C.whatsappCentral, a[2]);
      el.target = '_blank';
      el.rel = 'noopener';
      el.addEventListener('click', function () { registrar(a[1], {}); });
    });
  }

  /* ---------- início ---------- */
  document.querySelectorAll('[data-nome-site]').forEach(function (el) { el.textContent = C.nomeSite; });
  document.title = C.nomeSite + ' — aluguel de fantasias com reserva garantida';
  avisarConfiguracao();
  montarFiltros();
  renderizarGrade();
  ligarFicha();
  ligarContatos();
})();
