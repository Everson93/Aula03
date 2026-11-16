/* ===== Configuração — é aqui que você troca nome, lojas e WhatsApp =====
 * Número no formato internacional, só dígitos: 55 + DDD + número.
 * Ex.: (91) 98888-7777  ->  "5591988887777"
 * Enquanto um número não estiver preenchido, o site mostra um aviso no topo
 * e o botão "Reservar" fica desativado (para não mandar ninguém a lugar nenhum). */
window.CONFIG = {
  nomeSite: 'Fantasia na Data',
  cidade: 'sua cidade',

  // Recebe pedidos de grupo, dúvidas e lojas interessadas em parceria.
  whatsappCentral: '',

  // Cada loja parceira. "sinal" é o percentual cobrado para garantir (30 a 50).
  // "margemHigienizacao": dias que a peça fica parada depois da devolução (padrão 1).
  // "diasFechados": dias sem atendimento, 0 = domingo ... 6 = sábado. Retirada e
  // devolução nunca caem nesses dias.
  lojas: {
    lantejoula: {
      nome: 'Ateliê Lantejoula',
      bairro: 'Centro',
      whatsapp: '',
      sinal: 30,
      margemHigienizacao: 1,
      diasFechados: [0],
      politicaCancelamento: 'Até 7 dias antes da retirada: sinal devolvido integralmente. Depois disso, o sinal vira crédito para outra data.'
    },
    figurino: {
      nome: 'Casa do Figurino',
      bairro: 'Jardim',
      whatsapp: '',
      sinal: 40,
      margemHigienizacao: 1,
      diasFechados: [0],
      politicaCancelamento: 'Até 7 dias antes da retirada: sinal devolvido integralmente. Depois disso, 50% do sinal é devolvido.'
    },
    bau: {
      nome: 'Baú das Fantasias',
      bairro: 'Vila Nova',
      whatsapp: '',
      sinal: 50,
      margemHigienizacao: 1,
      diasFechados: [0],
      politicaCancelamento: 'Até 7 dias antes da retirada: sinal devolvido integralmente. Depois disso, o sinal não é devolvido.'
    }
  },

  /* Medição: se você instalar o Plausible ou o Google Analytics (GA4) no
   * index.html, os eventos vão para lá automaticamente. Não precisa mexer aqui. */
  mostrarEventosNoConsole: false
};
