/* Interface da landing. Regras de negócio ficam em logica.js. */
(function () {
  'use strict';

  var C = window.CONFIG;
  var L = window.Logica;
  var FANTASIAS = window.FANTASIAS;
  var TEMAS = window.TEMAS;

  var estado = { texto: '', tema: '', genero: '', tamanho: '', precoMax: '', dataFesta: '', soDisponiveis: false };

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
      estado.soDisponiveis = false;
      $('busca-texto').value = '';
      ['filtro-tema', 'filtro-genero', 'filtro-tamanho', 'filtro-preco'].forEach(function (id) { $(id).value = ''; });
      renderizarGrade();
    }
    $('limpar-filtros').addEventListener('click', limpar);
    $('vazio-limpar').addEventListener('click', limpar);

    var data = $('busca-data');
    data.min = hojeIso();
    data.addEventListener('change', function () {
      estado.dataFesta = data.value;
      registrar('escolheu_data', { data: data.value });
      renderizarGrade();
    });
    $('filtro-disponivel').addEventListener('change', function (e) {
      estado.soDisponiveis = e.target.checked;
      registrar('filtro_disponivel', { valor: e.target.checked });
      renderizarGrade();
    });

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

  /* ---------- estoque e período ---------- */
  function agenda() { return window.AGENDA || []; }
  function margemDe(loja) { return loja.margemHigienizacao == null ? 1 : loja.margemHigienizacao; }
  function periodoDe(f, extras) { return L.periodoAluguel(estado.dataFesta, hojeIso(), extras || 0, C.lojas[f.loja]); }
  function dispDe(f, periodo) { return L.disponibilidade(f, agenda(), periodo, margemDe(C.lojas[f.loja])); }
  function pecas(n) { return n === 1 ? '1 peça' : n + ' peças'; }

  function renderizarGrade() {
    var lista = L.filtrar(FANTASIAS, estado);
    var comData = !!estado.dataFesta && !!L.periodoAluguel(estado.dataFesta, hojeIso(), 0, {});
    var info = lista.map(function (f) {
      var per = comData ? periodoDe(f, 0) : null;
      var disp = dispDe(f, per);
      var livres = L.tamanhosLivres(disp);
      if (estado.tamanho) livres = livres.filter(function (t) { return t === estado.tamanho; });
      return { f: f, disp: disp, livres: livres };
    });
    var comLivre = info.filter(function (x) { return x.livres.length > 0; }).length;
    if (comData && estado.soDisponiveis) info = info.filter(function (x) { return x.livres.length > 0; });

    $('grade').innerHTML = info.map(function (x) {
      var f = x.f;
      var loja = C.lojas[f.loja];
      var total = Object.keys(x.disp).reduce(function (s, t) { return s + x.disp[t].total; }, 0);
      var selo = !comData
        ? '<span class="selo">' + pecas(total) + ' no acervo</span>'
        : x.livres.length
          ? '<span class="selo selo--livre">Livre na data: ' + x.livres.map(function (t) { return t + ' (' + x.disp[t].livres.length + ')'; }).join(' · ') + '</span>'
          : '<span class="selo selo--esgotado">Esgotada nesta data</span>';
      return '<li><button type="button" class="cartao' + (comData && !x.livres.length ? ' cartao--esgotado' : '') + '" data-id="' + esc(f.id) + '">' +
        capa(f, 'cartao__capa') +
        '<span class="cartao__info">' +
          '<span class="cartao__temas">' + f.temas.map(nomeTema).map(esc).join(' · ') + '</span>' +
          '<span class="cartao__nome">' + esc(f.nome) + '</span>' +
          (variasLojas() ? '<span class="cartao__loja">' + esc(loja.nome) + (loja.bairro ? ' · ' + esc(loja.bairro) : '') + '</span>' : '') +
          selo +
          '<span class="cartao__rodape">' +
            '<span class="cartao__preco">' + L.formatarPreco(f.preco) + ' <small>/ 3 dias</small></span>' +
            '<span class="cartao__tamanhos">' + L.ordenarTamanhos(Object.keys(f.tamanhos)).join(' ') + '</span>' +
          '</span>' +
        '</span></button></li>';
    }).join('');

    $('contagem').textContent = info.length === 1 ? '1 fantasia' : info.length + ' fantasias';
    $('vazio').hidden = info.length > 0;

    var check = $('filtro-disponivel');
    check.disabled = !comData;
    check.checked = comData && estado.soDisponiveis;
    $('info-data').innerHTML = comData
      ? 'Festa em <strong>' + esc(L.dataComDia(estado.dataFesta)) + '</strong>: ' + comLivre + ' de ' + lista.length +
        ' com peça livre' + (estado.tamanho ? ' no tamanho ' + esc(estado.tamanho) : '') + '. <button type="button" class="link" id="trocar-data">Trocar data</button>'
      : 'Informe a <button type="button" class="link" id="trocar-data">data da festa</button> para ver o que está livre.';
    $('trocar-data').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      $('busca-data').focus();
    });

    document.querySelectorAll('.chip').forEach(function (c) {
      c.classList.toggle('chip--ativo', c.dataset.tema === estado.tema);
      c.setAttribute('aria-pressed', c.dataset.tema === estado.tema ? 'true' : 'false');
    });
  }

  /* ---------- ficha da fantasia ---------- */
  var escolhas = {};   // escolhas por fantasia: voltam iguais se a ficha reabrir
  var ultimoPedido = null;   // último clique em reservar com peça livre (lido pela simulação)
  var fichaAtual = '';

  function abrirFicha(id, origem) {
    var f = FANTASIAS.find(function (x) { return x.id === id; });
    if (!f) return;
    fichaAtual = f.id;
    var loja = C.lojas[f.loja];
    var tamanhos = L.ordenarTamanhos(Object.keys(f.tamanhos));
    var sel = escolhas[f.id] = escolhas[f.id] || { tamanho: tamanhos.length === 1 ? tamanhos[0] : '', kit: [], extras: 0 };

    var opcoesExtras = [0, 1, 2, 3, 4].map(function (n) {
      var rotulo = n === 0 ? 'Sem dia extra' : '+' + n + (n === 1 ? ' dia' : ' dias') + ' (+' + L.formatarPreco(f.diaExtra * n) + ')';
      return '<option value="' + n + '"' + (sel.extras === n ? ' selected' : '') + '>' + rotulo + '</option>';
    }).join('');

    var corpo = $('ficha-corpo');
    corpo.innerHTML =
      '<div class="ficha__grade">' +
        capa(f, 'ficha__capa') +
        '<div class="ficha__info">' +
          '<p class="ficha__temas">' + f.temas.map(nomeTema).map(esc).join(' · ') + ' · cód. ' + esc(f.id) + '</p>' +
          '<h2 id="ficha-nome">' + esc(f.nome) + '</h2>' +
          '<p class="ficha__loja">' + esc(loja.nome) + (loja.endereco ? ' — ' + esc(loja.endereco) : loja.bairro ? ' — ' + esc(loja.bairro) : '') + '</p>' +
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
      '<div class="reserva-datas">' +
        '<label class="campo-data">Data da festa <input type="date" id="ficha-data" min="' + hojeIso() + '" value="' + esc(estado.dataFesta) + '"></label>' +
        '<label class="campo-data">Ficar mais dias? <select id="ficha-extras">' + opcoesExtras + '</select></label>' +
      '</div>' +
      '<p id="aviso-data" class="aviso-data" hidden></p>' +
      '<div id="ficha-periodo" class="periodo" aria-live="polite"></div>' +

      '<fieldset class="tamanhos"><legend>Tamanho</legend>' +
        tamanhos.map(function (t) {
          return '<label class="tam"><input type="radio" name="tam" value="' + t + '"' + (sel.tamanho === t ? ' checked' : '') + '>' +
            '<span><b>' + t + '</b><small class="tam__estoque" data-tam="' + t + '"></small></span></label>';
        }).join('') +
      '</fieldset>' +
      '<p id="ficha-disp" class="disp" aria-live="polite"></p>' +

      (f.kit.length ?
        '<fieldset class="kit"><legend>Complete o look</legend>' +
          f.kit.map(function (k) {
            return '<label class="kit__item"><input type="checkbox" value="' + esc(k.id) + '"' + (sel.kit.indexOf(k.id) !== -1 ? ' checked' : '') + '>' +
              '<span>' + esc(k.nome) + ' <small>(' + (k.tipo === 'venda' ? 'é seu' : 'aluguel') + ')</small></span>' +
              '<span class="kit__preco">+ ' + L.formatarPreco(k.preco) + '</span></label>';
          }).join('') +
        '</fieldset>' : '') +

      '<div class="resumo" id="resumo"></div>' +
      '<p class="politica"><strong>Cancelamento:</strong> ' + esc(loja.politicaCancelamento) +
        ' <strong>Caução:</strong> devolvida na entrega; só é retida se a vistoria de devolução mostrar dano que não está nas fotos da retirada.' +
        ' <strong>Atraso:</strong> cada dia além da devolução é cobrado como dia extra.</p>' +
      '<a class="botao botao--destaque botao--largo" id="botao-reservar" target="_blank" rel="noopener">Reservar pelo WhatsApp</a>' +
      '<p class="nota-reserva" id="nota-reserva"></p>';

    var whatsOk = L.numeroWhatsAppValido(loja.whatsapp);
    var situacao = {};   // última conta de disponibilidade, usada no clique

    function atualizar() {
      var per = periodoDe(f, sel.extras);
      var disp = dispDe(f, per);
      var o = L.calcularOrcamento(f, sel.kit, loja.sinal, per ? sel.extras : 0);
      var livreSel = sel.tamanho && disp[sel.tamanho] ? disp[sel.tamanho].livres : null;
      var indisponivel = !!(per && sel.tamanho && livreSel && !livreSel.length);
      situacao = { periodo: per, unidade: livreSel && livreSel.length ? livreSel[0] : '', indisponivel: indisponivel, orcamento: o };

      // período: quando retirar e quando devolver
      var caixa = $('ficha-periodo');
      if (per) {
        caixa.innerHTML =
          '<div class="periodo__linha">' +
            '<div><span>Retire</span><strong>' + esc(L.dataComDia(per.retirada)) + '</strong></div>' +
            '<div><span>Festa</span><strong>' + esc(L.dataComDia(per.dataFesta)) + '</strong></div>' +
            '<div class="periodo__devolver"><span>Devolva até</span><strong>' + esc(L.dataComDia(per.devolucao)) + '</strong></div>' +
          '</div>' +
          '<p class="periodo__nota">' + per.dias + ' dias com a fantasia' +
            (per.diasExtras ? ', incluindo ' + per.diasExtras + (per.diasExtras === 1 ? ' dia extra' : ' dias extras') : '') + '.' +
            (per.devolucaoAdiada ? ' A loja não abre no dia previsto, então a devolução passou para o próximo dia útil, sem custo.' : '') +
          '</p>';
        caixa.hidden = false;
      } else {
        caixa.innerHTML = '';
        caixa.hidden = true;
      }

      // estoque em cada botão de tamanho
      corpo.querySelectorAll('.tam__estoque').forEach(function (s) {
        var d = disp[s.dataset.tam];
        var esgotado = per && !d.livres.length;
        s.textContent = !per ? pecas(d.total) : esgotado ? 'esgotado' : d.livres.length + (d.livres.length === 1 ? ' livre' : ' livres');
        s.closest('.tam').classList.toggle('tam--esgotado', !!esgotado);
      });

      // texto de disponibilidade
      var txt = $('ficha-disp');
      var livres = L.tamanhosLivres(disp);
      if (!per) {
        txt.className = 'disp';
        txt.textContent = estado.dataFesta ? '' : 'Escolha a data da festa para ver quantas peças estão livres e quando devolver.';
      } else if (!sel.tamanho) {
        txt.className = 'disp' + (livres.length ? '' : ' disp--esgotado');
        txt.textContent = livres.length
          ? 'Livre nessa data: ' + livres.map(function (t) { return t + ' (' + disp[t].livres.length + ')'; }).join(', ') + '. Escolha o tamanho.'
          : 'Esgotada em todos os tamanhos nessa data.' + proxima(null);
      } else if (indisponivel) {
        var outros = livres.filter(function (t) { return t !== sel.tamanho; });
        txt.className = 'disp disp--esgotado';
        txt.textContent = 'O tamanho ' + sel.tamanho + ' está esgotado nessa data.' +
          (outros.length ? ' Livre: ' + outros.join(', ') + '.' : '') + proxima(sel.tamanho);
      } else {
        txt.className = 'disp disp--livre';
        txt.textContent = 'Tamanho ' + sel.tamanho + ': ' + livreSel.length + ' de ' + pecas(disp[sel.tamanho].total) + ' livre' + (livreSel.length === 1 ? '' : 's') + ' nessa data.';
      }

      $('resumo').innerHTML =
        '<div><span>Aluguel (3 dias)</span><span>' + L.formatarPreco(f.preco) + '</span></div>' +
        (o.diasExtras ? '<div><span>' + o.diasExtras + (o.diasExtras === 1 ? ' dia extra' : ' dias extras') + '</span><span>' + L.formatarPreco(o.valorDiasExtras) + '</span></div>' : '') +
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
      botao.textContent = indisponivel ? 'Perguntar outra data ou tamanho' : 'Reservar pelo WhatsApp';
      if (!whatsOk) {
        botao.removeAttribute('href');
        botao.setAttribute('aria-disabled', 'true');
        nota.textContent = 'WhatsApp desta loja ainda não configurado.';
        return;
      }
      var texto = L.mensagemReserva({
        nomeSite: C.nomeSite, fantasia: f, tamanho: sel.tamanho, dataFesta: estado.dataFesta,
        periodo: per, orcamento: o, indisponivel: indisponivel
      });
      botao.href = L.linkWhatsApp(loja.whatsapp, texto);
      botao.removeAttribute('aria-disabled');
      nota.textContent = indisponivel
        ? 'A loja pode ter peça voltando antes ou outra parecida.'
        : 'A loja confirma a reserva e envia a chave Pix do sinal.';
    }

    function proxima(tamanho) {
      var d = L.proximaDataLivre(f, agenda(), estado.dataFesta, hojeIso(), Object.assign({}, loja, { margemHigienizacao: margemDe(loja) }), tamanho);
      return d ? ' Próxima data de festa livre' + (tamanho ? ' no ' + tamanho : '') + ': ' + L.dataComDia(d) + '.' : '';
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
      renderizarGrade();
      atualizar();
    });
    $('ficha-extras').addEventListener('change', function (e) {
      sel.extras = Number(e.target.value) || 0;
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
      var per = situacao.periodo;
      ultimoPedido = situacao.indisponivel || !per || !situacao.unidade ? null : {
        fantasia: f.id, tamanho: sel.tamanho, unidade: situacao.unidade, retirada: per.retirada, devolucao: per.devolucao,
        dataFesta: per.dataFesta, diasExtras: per.diasExtras, kit: sel.kit.slice(),
        total: situacao.orcamento.total, sinal: situacao.orcamento.sinal, caucao: situacao.orcamento.caucao
      };
      registrar(situacao.indisponivel ? 'clique_pedir_outra_data' : 'clique_reservar', {
        id: f.id, loja: f.loja, tamanho: sel.tamanho || '', temData: !!per, itensKit: sel.kit.length,
        diasExtras: per ? per.diasExtras : 0,
        retirada: per ? per.retirada : '', devolucao: per ? per.devolucao : '', unidade: situacao.unidade
      });
    });

    atualizar();
    var dlg = $('ficha');
    if (!dlg.open) { dlg.showModal(); dlg.scrollTop = 0; }
    // "#f-HW01": nome simples no hash (sem "/"), que sobrevive a qualquer hospedagem.
    trocarHash('#f-' + f.id);
    if (origem !== 'atualizacao') registrar('abrir_ficha', { id: f.id, origem: origem });
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
      ['botao-atelie', 'clique_falar_atelie', 'Olá! Vi o site do ' + C.nomeSite + ' e procuro: ___ · Tamanho: ___ · Data da festa: ___'],
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

  /* Para a simulação (ou uma futura integração) atualizar a vitrine depois
   * que a agenda muda, e escolher a data da festa por fora. */
  window.FantasiaApp = {
    atualizar: function () {
      renderizarGrade();
      if ($('ficha').open && fichaAtual) abrirFicha(fichaAtual, 'atualizacao');
    },
    ultimoPedido: function () { return ultimoPedido; },
    definirData: function (iso) {
      estado.dataFesta = iso;
      $('busca-data').value = iso;
      this.atualizar();
    }
  };

  function variasLojas() { return Object.keys(C.lojas).length > 1; }

  // Logo configurado: entra no lugar do nome escrito, no topo e na abertura.
  function aplicarMarca() {
    document.querySelectorAll('[data-nome-site]').forEach(function (el) { el.textContent = C.nomeSite; });
    document.querySelectorAll('[data-atelie]').forEach(function (el) { el.textContent = C.atelie || ''; el.hidden = !C.atelie; });
    if (!C.logo) return;
    var alt = C.nomeSite + (C.atelie ? ' — ' + C.atelie : '');
    $('marca-topo').innerHTML = '<img class="marca__logo" src="' + esc(C.logo) + '" alt="' + esc(alt) + '">';
    $('hero-assinatura').innerHTML = '<img class="hero__logo" src="' + esc(C.logo) + '" alt="' + esc(alt) + '">';
  }

  /* ---------- início ---------- */
  aplicarMarca();
  document.title = C.nomeSite + ' — aluguel de trajes juninos e fantasias';
  avisarConfiguracao();
  montarFiltros();
  renderizarGrade();
  ligarFicha();
  ligarContatos();
})();
