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

  instagram: '',          // ex.: '@cantinhodaday' (aparece no rodapé)

  // Onde fica o ateliê: aparece no site (seção "Onde estamos"), no Google e no contrato.
  // Horários: 0 = domingo ... 6 = sábado. Dia sem horário aparece como "fechado" e
  // precisa bater com diasFechados da loja (a suíte confere).
  local: {
    endereco: '',          // ex.: 'Travessa São Pedro, 120, Umarizal'
    cidade: '',            // ex.: 'Belém'
    uf: '',                // ex.: 'PA'
    referencia: '',        // ex.: 'ao lado da padaria Estrela'
    horarios: [
      { dias: [1, 2, 3, 4, 5], abre: '09:00', fecha: '18:00' },
      { dias: [6], abre: '09:00', fecha: '13:00' }
    ]
  },

  // Medição do site: 'plausible' (sem cookies, recomendado) ou 'ga4' (usa cookies:
  // aí a lei pede aviso e escolha do visitante antes de medir). Vazio = sem medição.
  medicao: 'plausible',
  ga4Id: '',               // com medicao 'ga4': o ID de medição (G-XXXXXXX). Não cole o script do GA no index.html:
                           // o site carrega sozinho, só depois do "Aceitar" do visitante.

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

  // Painel do ateliê (balcão). Usado pelo sistema de gestão; a vitrine não lê.
  pagamentos: {
    chavePix: '',            // e-mail, CPF/CNPJ, celular ou chave aleatória do ateliê
    parcelasMax: 6,          // crédito em até 6x...
    parcelaMinima: 50,       // ...sem parcela menor que R$ 50
    // Taxas da maquininha em %, só para estimar o líquido no fechamento do caixa.
    // São valores de EXEMPLO: confirme as suas com a adquirente (mudam por plano e prazo).
    taxas: { pix: 0, debito: 1.99, creditoVista: 4.99, creditoParcelado: 6.99 }
  },

  // LGPD: quanto tempo guardar e em quanto tempo responder ao cliente.
  lgpd: {
    retencaoCadastroAnos: 5,  // depois da última locação (prazo do CDC para reclamações)
    retencaoFotosMeses: 6,    // fotos da vistoria, depois da devolução
    prazoRespostaDias: 15,    // pedido do titular (ver, corrigir, apagar)
    versaoAviso: '2026-11'    // muda quando o texto do aviso de privacidade mudar
  },

  // Quem atende e o que cada papel pode fazer. No sistema de verdade, cada um entra
  // com login e senha; aqui, a troca de atendente no menu simula o login.
  operadores: [
    { nome: 'Néia', papel: 'dona' },
    { nome: 'Atendente', papel: 'atendente' }
  ],
  // O que só a dona faz (dinheiro que sai da gaveta, dados pessoais completos,
  // apagar dados, cancelar com estorno, desconto grande, relatórios).
  permissoes: {
    dona: ['sangria', 'suprimento', 'verCpf', 'exportarDados', 'anonimizar', 'apagarFotos', 'cancelarPedido', 'descontoAcimaLimite', 'relatorios', 'bloquear'],
    atendente: ['bloquear']
  },
  limiteDescontoAtendente: 10,   // % do pedido que o atendente pode dar sem a dona

  // Agenda de prova: duração de cada prova e quantas pessoas provam ao mesmo tempo.
  provas: { duracaoMinutos: 30, provadores: 1 },

  // Orçamento para grupos (escolas, quadrilhas, empresas): validade em dias.
  orcamento: { validadeDias: 7 },

  // Dados do ateliê que vão no contrato. Vazio = sai uma linha para preencher à mão.
  contrato: {
    documento: '',               // CNPJ ou CPF do ateliê
    endereco: '',                // rua, número, bairro, cidade
    horarioDevolucao: '18h',     // a peça volta até esse horário no dia da devolução
    prazoDevolucaoCaucao: 0,     // dias úteis para devolver a caução (0 = na hora)
    diasParaPerda: 7,            // dias de atraso sem resposta para tratar a peça como perdida
    validadeCreditoMeses: 6      // validade do crédito na loja quando o sinal vira crédito
  },

  /* Medição: se você instalar o Plausible ou o Google Analytics (GA4) no
   * index.html, os eventos vão para lá automaticamente. Não precisa mexer aqui. */
  mostrarEventosNoConsole: false
};
