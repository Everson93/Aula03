/* ===== Configuração — é aqui que você troca nome, lojas e WhatsApp =====
 * Número no formato internacional, só dígitos: 55 + DDD + número.
 * Ex.: (91) 98888-7777  ->  "5591988887777"
 * Enquanto um número não estiver preenchido, o site mostra um aviso no topo
 * e o botão "Reservar" fica desativado (para não mandar ninguém a lugar nenhum). */
window.CONFIG = {
  nomeSite: 'Cantinho da Day',
  atelie: 'Ateliê Néia Gonçalves',
  cidade: 'sua cidade',

  // Logo: salve a imagem nesta pasta (ex.: logo.png) e ponha o nome aqui.
  // Vazio = o site escreve o nome com a letra cursiva da marca.
  logo: '',

  // WhatsApp para pedido de grupo e "não achei o que procuro".
  // Pode ser o mesmo número da loja.
  whatsappCentral: '',

  // "sinal": percentual cobrado para garantir (30 a 50).
  // "margemHigienizacao": dias que a peça fica parada depois da devolução (padrão 1).
  // "diasFechados": dias sem atendimento, 0 = domingo ... 6 = sábado. Retirada e
  // devolução nunca caem nesses dias.
  // "endereco": aparece na ficha e no rodapé quando preenchido.
  lojas: {
    neia: {
      nome: 'Ateliê Néia Gonçalves',
      bairro: '',
      endereco: '',
      whatsapp: '',
      sinal: 30,
      margemHigienizacao: 1,
      diasFechados: [0],
      politicaCancelamento: 'Até 7 dias antes da retirada: sinal devolvido integralmente. Depois disso, o sinal vira crédito para outra data.'
    }
  },

  /* Medição: se você instalar o Plausible ou o Google Analytics (GA4) no
   * index.html, os eventos vão para lá automaticamente. Não precisa mexer aqui. */
  mostrarEventosNoConsole: false
};
