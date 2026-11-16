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
  function calcularOrcamento(fantasia, kitIds, percentualSinal) {
    var marcados = (fantasia.kit || []).filter(function (k) { return (kitIds || []).indexOf(k.id) !== -1; });
    var aluguel = centavos(fantasia.preco);
    var kit = marcados.reduce(function (s, k) { return s + centavos(k.preco); }, 0);
    var total = aluguel + kit;
    var pct = Math.min(50, Math.max(30, Number(percentualSinal) || 30));
    var sinal = Math.round((total * pct) / 100);
    return {
      aluguel: aluguel / 100,
      kit: kit / 100,
      total: total / 100,
      percentualSinal: pct,
      sinal: sinal / 100,
      saldo: (total - sinal) / 100,
      caucao: centavos(fantasia.caucao) / 100,
      itensKit: marcados
    };
  }

  function mensagemReserva(dados) {
    var f = dados.fantasia;
    var o = dados.orcamento;
    var linhas = [
      'Olá! Vi no site ' + dados.nomeSite + ' e quero reservar:',
      '',
      '• Fantasia: ' + f.nome + ' (cód. ' + f.id + ')',
      '• Tamanho: ' + (dados.tamanho || 'preciso de ajuda para escolher'),
      '• Data da festa: ' + (dataBR(dados.dataFesta) || 'ainda não defini')
    ];
    if (o.itensKit.length) {
      linhas.push('• Kit: ' + o.itensKit.map(function (k) { return k.nome; }).join(', '));
    }
    linhas.push('• Total estimado: ' + formatarPreco(o.total) + ' (sinal de ' + o.percentualSinal + '%: ' + formatarPreco(o.sinal) + ')');
    linhas.push('• Caução: ' + formatarPreco(o.caucao));
    linhas.push('', 'Está disponível nessa data?');
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
    mensagemReserva: mensagemReserva,
    numeroWhatsAppValido: numeroWhatsAppValido,
    linkWhatsApp: linkWhatsApp
  };
});
