/* Regras puras da landing — sem DOM, para rodar no navegador e no Node.
 * Valores em dinheiro são tratados em centavos para não acumular erro de ponto flutuante. */
(function (raiz, fabrica) {
  var mod = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else raiz.Logica = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG'];

  // Tabela genérica de referência (adulto). Cada linha: tamanho, altura máx (cm), peso máx (kg).
  var TABELA_REFERENCIA = [
    ['PP', 155, 50],
    ['P', 165, 60],
    ['M', 172, 72],
    ['G', 180, 85],
    ['GG', 188, 100],
    ['XG', 999, 999]
  ];

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

    var idxAltura = TABELA_REFERENCIA.findIndex(function (l) { return altura <= l[1]; });
    var idxPeso = TABELA_REFERENCIA.findIndex(function (l) { return peso <= l[2]; });
    var ideal = TABELA_REFERENCIA[Math.max(idxAltura, idxPeso)][0];

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
    mensagemReserva: mensagemReserva,
    numeroWhatsAppValido: numeroWhatsAppValido,
    linkWhatsApp: linkWhatsApp
  };
});
