/* Simulação, parte 1 — roda depois do config.js e antes do app.js.
 * Dá a cada loja um número fictício (para os botões ficarem ativos) e
 * intercepta todo link do WhatsApp: em vez de abrir o app, mostra a
 * conversa que a loja receberia. Também captura os eventos de medição. */
(function () {
  'use strict';
  var C = window.CONFIG;
  var numeros = {};

  // Números fictícios no formato válido (55 + 11 dígitos). Nunca saem da página.
  C.whatsappCentral = '5500900000000';
  numeros[C.whatsappCentral] = 'Atendimento ' + C.nomeSite;
  Object.keys(C.lojas).forEach(function (k, i) {
    C.lojas[k].whatsapp = '550090000000' + (i + 1);
    numeros[C.lojas[k].whatsapp] = C.lojas[k].nome;
  });

  var SIM = window.SIMULACAO = { numeros: numeros, eventos: [], aoEvento: null, aoWhatsApp: null };

  // Medição: o app.js empurra eventos no dataLayer. Aqui eles viram registro visível.
  var camada = [];
  camada.push = function (ev) {
    var copia = Object.assign({}, ev);
    var nome = copia.event; delete copia.event;
    var item = { evento: nome, dados: copia, hora: new Date() };
    SIM.eventos.push(item);
    if (SIM.aoEvento) SIM.aoEvento(item);
    return Array.prototype.push.call(this, ev);
  };
  window.dataLayer = camada;

  // Intercepta wa.me na fase de captura, antes do navegador seguir o link.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="https://wa.me/"]');
    if (!a || a.hasAttribute('data-real')) return;
    e.preventDefault();
    var m = /^https:\/\/wa\.me\/(\d+)\?text=(.*)$/.exec(a.getAttribute('href'));
    if (m && SIM.aoWhatsApp) SIM.aoWhatsApp(m[1], decodeURIComponent(m[2]));
  }, true);
})();
