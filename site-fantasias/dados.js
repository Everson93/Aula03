/* ===== Acervo da vitrine =====
 * ESTES DADOS SÃO EXEMPLOS. Troque pelas peças reais das lojas parceiras.
 *
 * Campos de cada fantasia:
 *   id         código curto que aparece na mensagem do WhatsApp
 *   nome       nome descritivo — nada de marca registrada (veja o README)
 *   loja       chave da loja em config.js
 *   temas      ids da lista TEMAS abaixo
 *   genero     'feminino' | 'masculino' | 'unissex'
 *   preco      aluguel do período padrão (3 dias), em reais
 *   diaExtra   cada dia além do período
 *   caucao     valor devolvido na entrega sem dano novo
 *   tamanhos   { P: [busto, cintura, quadril, altura], ... } em cm
 *   estoque    { P: 2, M: 3 } — quantas peças físicas de cada tamanho
 *   inclui     o que vem na peça
 *   kit        complementos; tipo 'venda' (descartável) ou 'aluguel'
 *   fotos      caminhos das fotos reais, ex.: ['fotos/bruxa-1.jpg']
 *              (vazio = cartão ilustrativo com a cor da peça)
 */
window.TEMAS = [
  { id: 'junina', nome: 'Festa junina' },
  { id: 'carnaval', nome: 'Carnaval' },
  { id: 'halloween', nome: 'Halloween' },
  { id: 'decadas', nome: 'Anos 20 a 90' },
  { id: 'medieval', nome: 'Medieval e realeza' },
  { id: 'herois', nome: 'Heróis e aventura' },
  { id: 'historia', nome: 'Personagens históricos' }
];

window.FANTASIAS = [
  {
    id: 'HW01', nome: 'Bruxa Clássica de Veludo', loja: 'neia', temas: ['halloween'], genero: 'feminino',
    preco: 140, diaExtra: 35, caucao: 100, cor: '#3b2a5a',
    descricao: 'Vestido longo de veludo com mangas sino e chapéu pontudo estruturado.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172] },
    estoque: { P: 2, M: 3, G: 2 },
    inclui: ['Vestido', 'Chapéu', 'Cinto de corda'],
    kit: [
      { id: 'vassoura', nome: 'Vassoura decorativa', tipo: 'aluguel', preco: 15 },
      { id: 'maq-verde', nome: 'Maquiagem verde e preta', tipo: 'venda', preco: 22 }
    ],
    palavras: ['feiticeira'], fotos: []
  },
  {
    id: 'HW02', nome: 'Vampiro Vitoriano', loja: 'neia', temas: ['halloween'], genero: 'masculino',
    preco: 150, diaExtra: 40, caucao: 120, cor: '#5a1220',
    descricao: 'Sobrecasaca com gola alta, colete bordado e capa com forro vermelho.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180], GG: [114, 102, 116, 186] },
    estoque: { M: 3, G: 2, GG: 1 },
    inclui: ['Sobrecasaca', 'Colete', 'Capa', 'Plastrom'],
    kit: [
      { id: 'presas', nome: 'Presas de vampiro', tipo: 'venda', preco: 12 },
      { id: 'sangue', nome: 'Sangue cenográfico', tipo: 'venda', preco: 15 }
    ],
    palavras: ['dracula', 'conde'], fotos: []
  },
  {
    id: 'HW03', nome: 'Catrina — Caveira Mexicana', loja: 'neia', temas: ['halloween'], genero: 'feminino',
    preco: 160, diaExtra: 40, caucao: 120, cor: '#8a2b4f',
    descricao: 'Vestido rodado com babados e arranjo de flores para a cabeça.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166] },
    estoque: { P: 2, M: 3 },
    inclui: ['Vestido', 'Arranjo de flores', 'Xale de renda'],
    kit: [{ id: 'maq-catrina', nome: 'Kit de maquiagem de caveira', tipo: 'venda', preco: 35 }],
    palavras: ['dia de los muertos', 'mexico'], fotos: []
  },
  {
    id: 'HW04', nome: 'Múmia Egípcia', loja: 'neia', temas: ['halloween', 'historia'], genero: 'unissex',
    preco: 95, diaExtra: 25, caucao: 60, cor: '#8f7a55',
    descricao: 'Macacão com faixas costuradas — não solta na festa.',
    tamanhos: { P: [88, 72, 96, 162], M: [96, 80, 102, 170], G: [104, 90, 110, 178] },
    estoque: { P: 2, M: 3, G: 2 },
    inclui: ['Macacão', 'Capuz'],
    kit: [{ id: 'maq-po', nome: 'Pó envelhecedor', tipo: 'venda', preco: 18 }],
    palavras: [], fotos: []
  },
  {
    id: 'HW05', nome: 'Noiva Zumbi', loja: 'neia', temas: ['halloween'], genero: 'feminino',
    preco: 130, diaExtra: 35, caucao: 100, cor: '#55605a',
    descricao: 'Vestido de noiva envelhecido, véu rasgado e buquê seco.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172] },
    estoque: { P: 2, M: 3, G: 2 },
    inclui: ['Vestido', 'Véu', 'Buquê'],
    kit: [{ id: 'sangue2', nome: 'Sangue cenográfico', tipo: 'venda', preco: 15 }],
    palavras: ['morta-viva'], fotos: []
  },
  {
    id: 'HW06', nome: 'Lobisomem', loja: 'neia', temas: ['halloween'], genero: 'masculino',
    preco: 180, diaExtra: 45, caucao: 150, cor: '#4a3a2a',
    descricao: 'Camisa rasgada com pelagem aplicada, luvas de garra e máscara de látex.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180] },
    estoque: { M: 1, G: 1 },
    inclui: ['Camisa', 'Calça', 'Máscara', 'Luvas'],
    kit: [], palavras: ['lobo'], fotos: []
  },
  {
    id: 'CV01', nome: 'Melindrosa Anos 20', loja: 'neia', temas: ['carnaval', 'decadas'], genero: 'feminino',
    preco: 150, diaExtra: 35, caucao: 120, cor: '#1f3b4d',
    descricao: 'Vestido de franjas com paetês, faixa de cabeça com pena.',
    tamanhos: { PP: [80, 62, 88, 155], P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172] },
    estoque: { PP: 1, P: 2, M: 2, G: 2 },
    inclui: ['Vestido', 'Faixa com pena', 'Colar de pérolas'],
    kit: [
      { id: 'piteira', nome: 'Piteira cenográfica', tipo: 'aluguel', preco: 10 },
      { id: 'luvas', nome: 'Luvas longas', tipo: 'aluguel', preco: 15 }
    ],
    palavras: ['charleston', 'gatsby'], fotos: []
  },
  {
    id: 'CV02', nome: 'Pierrô', loja: 'neia', temas: ['carnaval'], genero: 'unissex',
    preco: 110, diaExtra: 30, caucao: 80, cor: '#2b2b3a',
    descricao: 'Bata branca com pompons pretos e gola franzida.',
    tamanhos: { P: [88, 72, 96, 162], M: [96, 80, 102, 170], G: [104, 90, 110, 178], GG: [114, 102, 116, 186] },
    estoque: { P: 2, M: 3, G: 2, GG: 1 },
    inclui: ['Bata', 'Calça', 'Gola', 'Touca'],
    kit: [{ id: 'maq-branca', nome: 'Maquiagem branca com lágrima', tipo: 'venda', preco: 20 }],
    palavras: ['carnaval antigo'], fotos: []
  },
  {
    id: 'CV03', nome: 'Colombina', loja: 'neia', temas: ['carnaval'], genero: 'feminino',
    preco: 120, diaExtra: 30, caucao: 90, cor: '#7a2f5a',
    descricao: 'Vestido de losangos com saia armada e máscara de mão.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166] },
    estoque: { P: 2, M: 3 },
    inclui: ['Vestido', 'Máscara de mão'],
    kit: [{ id: 'confete', nome: 'Pacote de confete e serpentina', tipo: 'venda', preco: 10 }],
    palavras: ['arlequina'], fotos: []
  },
  {
    id: 'CV04', nome: 'Marinheiro de Bloco', loja: 'neia', temas: ['carnaval'], genero: 'masculino',
    preco: 85, diaExtra: 20, caucao: 60, cor: '#1d3f7a',
    descricao: 'Camisa com gola marinheira, calça branca e quepe.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180], GG: [114, 102, 116, 186] },
    estoque: { M: 3, G: 2, GG: 1 },
    inclui: ['Camisa', 'Calça', 'Quepe'],
    kit: [], palavras: ['bloco'], fotos: []
  },
  {
    id: 'CV05', nome: 'Havaiana', loja: 'neia', temas: ['carnaval'], genero: 'feminino',
    preco: 80, diaExtra: 20, caucao: 50, cor: '#c0532b',
    descricao: 'Saia de ráfia, top estampado e colar de flores.',
    tamanhos: { PP: [80, 62, 88, 155], P: [86, 68, 94, 160], M: [92, 74, 100, 166] },
    estoque: { PP: 1, P: 2, M: 3 },
    inclui: ['Saia', 'Top', 'Colar de flores'],
    kit: [{ id: 'flor-cabelo', nome: 'Flor de cabelo', tipo: 'venda', preco: 8 }],
    palavras: ['hula', 'praia'], fotos: []
  },
  {
    id: 'CV06', nome: 'Rei Momo', loja: 'neia', temas: ['carnaval', 'medieval'], genero: 'masculino',
    preco: 220, diaExtra: 50, caucao: 180, cor: '#8a6a14',
    descricao: 'Manto bordado, coroa e cetro — peça de destaque para desfile.',
    tamanhos: { G: [106, 94, 108, 180], GG: [114, 102, 116, 186], XG: [124, 112, 124, 190] },
    estoque: { G: 1, GG: 1, XG: 1 },
    inclui: ['Manto', 'Túnica', 'Coroa', 'Cetro'],
    kit: [], palavras: ['rei'], fotos: []
  },
  {
    id: 'JN01', nome: 'Caipira Vestido Xadrez', loja: 'neia', temas: ['junina'], genero: 'feminino',
    preco: 90, diaExtra: 20, caucao: 60, cor: '#a0322a',
    descricao: 'Vestido xadrez com babados de renda e laço de fita.',
    tamanhos: { PP: [80, 62, 88, 155], P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172] },
    estoque: { PP: 1, P: 2, M: 3, G: 2 },
    inclui: ['Vestido', 'Laço de cabelo'],
    kit: [
      { id: 'chapeu-palha', nome: 'Chapéu de palha', tipo: 'aluguel', preco: 12 },
      { id: 'sardas', nome: 'Lápis para sardas', tipo: 'venda', preco: 8 }
    ],
    palavras: ['sao joao', 'quadrilha', 'arraia'], fotos: []
  },
  {
    id: 'JN02', nome: 'Caipira Camisa Xadrez e Remendo', loja: 'neia', temas: ['junina'], genero: 'masculino',
    preco: 80, diaExtra: 20, caucao: 50, cor: '#6b4a1f',
    descricao: 'Camisa xadrez, calça com remendos e lenço no pescoço.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180], GG: [114, 102, 116, 186] },
    estoque: { M: 3, G: 2, GG: 1 },
    inclui: ['Camisa', 'Calça', 'Lenço'],
    kit: [{ id: 'chapeu-palha2', nome: 'Chapéu de palha', tipo: 'aluguel', preco: 12 }],
    palavras: ['sao joao', 'quadrilha', 'arraia'], fotos: []
  },
  {
    id: 'JN03', nome: 'Noiva da Quadrilha', loja: 'neia', temas: ['junina'], genero: 'feminino',
    preco: 160, diaExtra: 40, caucao: 120, cor: '#b0175f',
    descricao: 'Vestido de chita com renda, saia armada de babados, véu curto e buquê de flores de tecido.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172] },
    estoque: { P: 1, M: 2, G: 1 },
    inclui: ['Vestido', 'Anágua', 'Véu', 'Buquê'],
    kit: [{ id: 'sardas3', nome: 'Lápis para sardas', tipo: 'venda', preco: 8 }],
    palavras: ['casamento caipira', 'quadrilha', 'sao joao', 'arraia'], fotos: []
  },
  {
    id: 'JN04', nome: 'Noivo da Quadrilha', loja: 'neia', temas: ['junina'], genero: 'masculino',
    preco: 120, diaExtra: 30, caucao: 90, cor: '#7a4a1f',
    descricao: 'Paletó de xadrez com remendos, calça de barra dobrada, gravata de chita e chapéu de palha.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180], GG: [114, 102, 116, 186] },
    estoque: { M: 2, G: 2, GG: 1 },
    inclui: ['Paletó', 'Calça', 'Gravata', 'Chapéu de palha'],
    kit: [{ id: 'bigode', nome: 'Bigode e costeleta para pintar', tipo: 'venda', preco: 8 }],
    palavras: ['casamento caipira', 'quadrilha', 'sao joao', 'arraia'], fotos: []
  },
  {
    id: 'JN05', nome: 'Caipira Chita Florida', loja: 'neia', temas: ['junina'], genero: 'feminino',
    preco: 95, diaExtra: 25, caucao: 60, cor: '#d4462f',
    descricao: 'Vestido rodado de chita com bolero de renda e fita de cetim na cintura.',
    tamanhos: { PP: [80, 62, 88, 155], P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172], GG: [108, 90, 116, 176] },
    estoque: { PP: 1, P: 3, M: 3, G: 2, GG: 1 },
    inclui: ['Vestido', 'Bolero', 'Fita'],
    kit: [
      { id: 'chapeu-palha3', nome: 'Chapéu de palha com flores', tipo: 'aluguel', preco: 15 },
      { id: 'sardas4', nome: 'Lápis para sardas', tipo: 'venda', preco: 8 }
    ],
    palavras: ['chita', 'sao joao', 'quadrilha', 'arraia'], fotos: []
  },
  {
    id: 'JN06', nome: 'Sanfoneiro do Arraiá', loja: 'neia', temas: ['junina'], genero: 'masculino',
    preco: 110, diaExtra: 25, caucao: 80, cor: '#8a5a1a',
    descricao: 'Gibão de couro sintético, camisa de botão, lenço vermelho e chapéu de cangaceiro em meia-lua.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180] },
    estoque: { M: 1, G: 1 },
    inclui: ['Gibão', 'Camisa', 'Lenço', 'Chapéu'],
    kit: [], palavras: ['forro', 'nordeste', 'sao joao', 'vaqueiro'], fotos: []
  },
  {
    id: 'DC01', nome: 'Roqueira Anos 80', loja: 'neia', temas: ['decadas', 'carnaval'], genero: 'feminino',
    preco: 110, diaExtra: 25, caucao: 80, cor: '#3a1f4d',
    descricao: 'Jaqueta de couro sintético com tachas, saia de tule e meia arrastão.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172] },
    estoque: { P: 2, M: 3, G: 2 },
    inclui: ['Jaqueta', 'Saia', 'Meia arrastão'],
    kit: [{ id: 'spray-cabelo', nome: 'Spray de cabelo colorido', tipo: 'venda', preco: 25 }],
    palavras: ['rock', 'punk', 'anos 80'], fotos: []
  },
  {
    id: 'DC02', nome: 'Aeróbica Anos 80', loja: 'neia', temas: ['decadas'], genero: 'unissex',
    preco: 80, diaExtra: 20, caucao: 50, cor: '#b0306a',
    descricao: 'Collant neon, polaina e faixa de cabeça.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172] },
    estoque: { P: 2, M: 3, G: 2 },
    inclui: ['Collant', 'Polainas', 'Faixa', 'Munhequeiras'],
    kit: [], palavras: ['neon', 'anos 80', 'ginastica'], fotos: []
  },
  {
    id: 'DC03', nome: 'Disco Anos 70', loja: 'neia', temas: ['decadas'], genero: 'masculino',
    preco: 130, diaExtra: 30, caucao: 100, cor: '#7a5a14',
    descricao: 'Terno boca de sino brilhante com camisa de gola grande.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180] },
    estoque: { M: 3, G: 2 },
    inclui: ['Paletó', 'Calça', 'Camisa'],
    kit: [{ id: 'peruca-black', nome: 'Peruca black power', tipo: 'aluguel', preco: 25 }],
    palavras: ['discoteca', 'anos 70', 'dancing'], fotos: []
  },
  {
    id: 'DC04', nome: 'Hippie Paz e Amor', loja: 'neia', temas: ['decadas', 'carnaval'], genero: 'unissex',
    preco: 85, diaExtra: 20, caucao: 50, cor: '#5a7a2a',
    descricao: 'Bata indiana, calça boca de sino e faixa de cabeça com flores.',
    tamanhos: { P: [88, 72, 96, 162], M: [96, 80, 102, 170], G: [104, 90, 110, 178] },
    estoque: { P: 2, M: 3, G: 2 },
    inclui: ['Bata', 'Calça', 'Faixa'],
    kit: [{ id: 'oculos-redondo', nome: 'Óculos redondo colorido', tipo: 'venda', preco: 15 }],
    palavras: ['anos 60', 'anos 70', 'woodstock'], fotos: []
  },
  {
    id: 'MD01', nome: 'Rainha Medieval', loja: 'neia', temas: ['medieval'], genero: 'feminino',
    preco: 260, diaExtra: 60, caucao: 200, cor: '#5a1a3a',
    descricao: 'Vestido de brocado com cauda, mangas longas e tiara.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172], GG: [108, 90, 116, 176] },
    estoque: { P: 1, M: 1, G: 1, GG: 1 },
    inclui: ['Vestido', 'Tiara', 'Cinto de metal'],
    kit: [], palavras: ['princesa', 'nobre'], fotos: []
  },
  {
    id: 'MD02', nome: 'Cavaleiro de Armadura', loja: 'neia', temas: ['medieval', 'herois'], genero: 'masculino',
    preco: 300, diaExtra: 70, caucao: 250, cor: '#4a5560',
    descricao: 'Cota de malha têxtil, peitoral de EVA pintado, elmo e escudo.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180] },
    estoque: { M: 1, G: 1 },
    inclui: ['Túnica', 'Cota de malha', 'Peitoral', 'Elmo', 'Escudo'],
    kit: [{ id: 'espada', nome: 'Espada de espuma', tipo: 'aluguel', preco: 20 }],
    palavras: ['armadura', 'templario'], fotos: []
  },
  {
    id: 'HR01', nome: 'Super-herói de Capa Vermelha', loja: 'neia', temas: ['herois', 'carnaval'], genero: 'masculino',
    preco: 120, diaExtra: 30, caucao: 90, cor: '#1a3a8a',
    descricao: 'Macacão azul com musculatura acolchoada e capa vermelha.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180], GG: [114, 102, 116, 186] },
    estoque: { M: 3, G: 2, GG: 1 },
    inclui: ['Macacão', 'Capa', 'Cinto'],
    kit: [], palavras: ['heroi', 'super'], fotos: []
  },
  {
    id: 'HR02', nome: 'Pirata Corsário', loja: 'neia', temas: ['herois', 'carnaval'], genero: 'masculino',
    preco: 140, diaExtra: 35, caucao: 100, cor: '#3a2a1a',
    descricao: 'Casaca longa, camisa bufante, faixa de cintura e chapéu tricórnio.',
    tamanhos: { M: [98, 86, 100, 175], G: [106, 94, 108, 180] },
    estoque: { M: 3, G: 2 },
    inclui: ['Casaca', 'Camisa', 'Faixa', 'Chapéu'],
    kit: [
      { id: 'tapa-olho', nome: 'Tapa-olho', tipo: 'venda', preco: 6 },
      { id: 'espada-pirata', nome: 'Espada de espuma', tipo: 'aluguel', preco: 20 }
    ],
    palavras: ['capitao', 'navio'], fotos: []
  },
  {
    id: 'HR03', nome: 'Pirata Capitã', loja: 'neia', temas: ['herois', 'carnaval'], genero: 'feminino',
    preco: 140, diaExtra: 35, caucao: 100, cor: '#6a2a1a',
    descricao: 'Corpete, saia assimétrica, camisa bufante e chapéu com pena.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172] },
    estoque: { P: 2, M: 3, G: 2 },
    inclui: ['Corpete', 'Saia', 'Camisa', 'Chapéu'],
    kit: [{ id: 'tapa-olho2', nome: 'Tapa-olho', tipo: 'venda', preco: 6 }],
    palavras: ['capita', 'navio'], fotos: []
  },
  {
    id: 'HS01', nome: 'Rainha Egípcia', loja: 'neia', temas: ['historia', 'carnaval'], genero: 'feminino',
    preco: 190, diaExtra: 45, caucao: 150, cor: '#1a5a5a',
    descricao: 'Vestido plissado branco, gola larga dourada e coroa de serpente.',
    tamanhos: { P: [86, 68, 94, 160], M: [92, 74, 100, 166], G: [100, 82, 108, 172] },
    estoque: { P: 2, M: 3, G: 2 },
    inclui: ['Vestido', 'Gola', 'Coroa', 'Braceletes'],
    kit: [{ id: 'delineador', nome: 'Delineador gráfico', tipo: 'venda', preco: 18 }],
    palavras: ['cleopatra', 'egito', 'farao'], fotos: []
  }
];
