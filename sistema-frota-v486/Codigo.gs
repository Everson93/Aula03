/**
 * SISTEMA DE CONTROLE DE CUSTOS DE FROTA
 * =======================================
 * ARQUIVO GERADO - nao edite aqui.
 * Fonte: apps-script/*.gs  |  Regerar: python3 scripts/gerar_script_unico.py
 *
 * Cole este arquivo como "Codigo.gs" e o Lancamento.html como arquivo HTML.
 * Depois recarregue a planilha e use o menu "Sistema de Frota".
 */


// ==========================================================================
// 00_Config.gs
// ==========================================================================

/**
 * Sistema de Controle de Custos de Frota
 * ---------------------------------------
 * Configuracao central: nomes de abas, tipos de despesa e paleta.
 * Todo o resto do codigo referencia estas constantes - mudou aqui, mudou tudo.
 */

const ABAS = {
  PARAMETROS: 'Parâmetros',
  CENTROS: 'Centros de Custo',
  VEICULOS: 'Veículos',
  LANCAMENTOS: 'Lançamentos',
  ODOMETRO: 'Odômetro',
  HISTORICO: 'Histórico',
  RESUMO: 'Resumo',
  RATEIO: 'Rateio por Centro',
  DASHBOARD: 'Dashboard',
  CONSULTA: 'Consulta Veículo',
  CONFERENCIA: 'Pendências de Conferência',
  RELATORIOS: 'Relatórios',
  LOG: 'Log de Atividade',
  USUARIOS: 'Usuários',
  CENTRAL_OPERACIONAL: 'Central Operacional',
  FORNECEDORES: 'Fornecedores',
  CARGA_BOMBA: 'Carga na Bomba',
  // V4.8: trilha de auditoria das despesas excluídas (com justificativa).
  EXCLUIDOS: 'Lançamentos Excluídos',
  // V4.9: o % de rateio passou a ser gravado POR COMPETÊNCIA. Ver
  // percentuaisDaCompetencia_ para o porquê.
  RATEIO_MENSAL: 'Rateio Mensal',
  ORCAMENTO: 'Orçamento',
  // V4.11: comprovantes que chegam depois da competência fechar. Ficam FORA da
  // contabilidade até alguém decidir incorporá-los. Ver COL_COMP.
  COMPROVANTES: 'Comprovantes Atrasados',
};

/** Tipos de despesa aceitos no lancamento (ordem = ordem do dropdown). */
const TIPOS_DESPESA = [
  'Combustivel Proprio',
  'Combustivel Terceiros',
  'Lubrificante',
  'Lavacao/Graxa',
  'Oficina Despesa',
  'Oficina Ativo',
  'Oficina Deb Loja',
  'Pneus',
  'Multa',
  'Diaria/Pedagio',
  'Depreciação',
  'Emplacamento/IPVA/Seguro',
  // V4.8.7: IPVA deixou de sair do cadastro e virou despesa LANCADA. Quem lanca
  // informa o valor ANUAL uma vez; o sistema grava as 12 parcelas, uma por
  // competencia. Ver lancarIpvaAnual_.
  'IPVA',
  'Arla 32',
  // V4.8: plotagem/adesivagem do veículo. É ATIVO (imobilizado), como a Oficina Ativo:
  // aparece no Resumo, mas não soma no custo operacional do período.
  'Plotagem',
  // V4.8: gás (GLP/GNV), medido em QUILOS (usa o campo de quantidade do lançamento).
  'Gás',
  // V4.8: gastos com carro novo (aquisição/preparação). É ATIVO, como a Plotagem.
  'Carro Novo',
];

/** Tipos que aceitam litros (o formulario libera o campo). */
const TIPOS_COM_LITROS = [
  'Combustivel Proprio',
  'Combustivel Terceiros',
  'Lubrificante',
  'Arla 32',
  'Gás',
];

/**
 * Grupos de frota, lidos do parametro GRUPOS_FROTA.
 *
 * Existe porque custo por km e km/l da FROTA INTEIRA nao significam nada quando
 * a frota vai de moto a carreta frigorifica: a media fica entre dois mundos e
 * nao descreve nenhum dos dois. "R$/km da frota de transporte" e um numero de
 * gestao; "R$/km da frota" nao e.
 *
 * O agrupamento sai da CATEGORIA, que o cadastro ja mantem, e nao de uma coluna
 * nova: categoria certa implica grupo certo, sem nada a preencher por veiculo.
 *
 * Formato: "Transporte: Truck Normal, Carreta Normal | Apoio: Carro, Moto"
 */
const GRUPO_FROTA_OUTROS_ = 'Outros';

function gruposFrota_() {
  const bruto = String(param_('GRUPOS_FROTA') || '');
  const ordem = [];
  const porCategoria = {};
  bruto.split('|').forEach(function (parte) {
    const pos = parte.indexOf(':');
    if (pos === -1) return;
    const nome = parte.slice(0, pos).trim();
    if (!nome) return;
    const categorias = parte.slice(pos + 1).split(',')
      .map(function (c) { return c.trim(); })
      .filter(function (c) { return c; });
    if (!categorias.length) return;
    if (ordem.indexOf(nome) === -1) ordem.push(nome);
    categorias.forEach(function (c) {
      // Primeira ocorrencia vence: uma categoria listada em dois grupos somaria
      // o mesmo custo duas vezes, e os grupos deixariam de fechar com o total.
      if (porCategoria[chaveCategoria_(c)] === undefined) porCategoria[chaveCategoria_(c)] = nome;
    });
  });
  return { ordem: ordem, porCategoria: porCategoria };
}

/** Chave de comparacao de categoria: sem acento, sem caixa, sem espaco sobrando. */
function chaveCategoria_(valor) {
  return String(valor == null ? '' : valor).trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function grupoDaCategoria_(categoria, mapa) {
  const m = mapa || gruposFrota_();
  return m.porCategoria[chaveCategoria_(categoria)] || GRUPO_FROTA_OUTROS_;
}

/** Tipos cuja quantidade é em quilos, não litros (o formulário troca o rótulo). */
const TIPOS_QUANTIDADE_KG = ['Gás'];

/**
 * Teto de sanidade do preço unitário, por tipo de despesa.
 *
 * Existia UM teto de R$ 30 para tudo que tem quantidade, e ele errava de dois
 * jeitos:
 *
 *  - **Gás** é medido em QUILOS, não litros (TIPOS_QUANTIDADE_KG). A conferência
 *    dividia valor por quilos e anunciava o resultado como "R$/L". Uma
 *    empilhadeira a GLP aparecia com "R$ 213,00/L", unidade que ela não usa.
 *  - **Lubrificante** passa fácil de R$ 30/L — óleo sintético custa mais que
 *    isso. O teto do diesel acusava compra normal como fora da curva, e alarme
 *    que toca sempre é alarme que ninguém lê.
 *
 * Os valores são tetos de ABSURDO, não de mercado: servem para pegar erro grosso
 * de digitação, não para discutir preço.
 */
const TETO_PRECO_UNITARIO_ = {
  'Combustivel Proprio': 30,
  'Combustivel Terceiros': 30,
  'Arla 32': 30,
  'Lubrificante': 200,
  'Gás': 30,          // por QUILO; GLP de botijão gira em torno de R$ 8/kg
};
const TETO_PRECO_UNITARIO_PADRAO_ = 30;

/** Unidade da quantidade de um tipo de despesa: 'kg' para gás, 'L' para o resto. */
function unidadeQuantidade_(tipo) {
  return TIPOS_QUANTIDADE_KG.indexOf(String(tipo || '').trim()) !== -1 ? 'kg' : 'L';
}

/**
 * Decide se o preço unitário de um lançamento é absurdo. Devolve a linha de
 * pendência, ou null.
 *
 * Função pura, separada do coletor de propósito: o coletor lê a planilha
 * inteira e não dá para exercitá-lo num teste. Com a decisão aqui, o teste
 * chama exatamente o que roda em produção — em vez de reescrever a regra e
 * passar enquanto o sistema faz outra coisa.
 */
function pendenciaPrecoUnitario_(tipo, valor, quantidade, numeroLinha, placa) {
  const q = Number(quantidade) || 0;
  const v = Number(valor) || 0;
  if (q <= 0 || v <= 0) return null;
  const nome = String(tipo || '').trim();
  const teto = TETO_PRECO_UNITARIO_[nome] === undefined
    ? TETO_PRECO_UNITARIO_PADRAO_ : TETO_PRECO_UNITARIO_[nome];
  const unitario = v / q;
  if (unitario <= teto) return null;

  const unidade = unidadeQuantidade_(nome);
  // Gás quase sempre cai aqui pelo mesmo motivo: o operador registra UM botijão
  // em vez dos quilos dele. A dica diz isso, em vez de deixar o número solto.
  // A CONTA INTEIRA, nao so o resultado.
  //
  // Mostrando apenas "R$ 63,90/kg", o operador nao tem como saber se o errado e
  // o valor ou a quantidade — e o sistema oferece corrigir a quantidade, o que
  // o leva a digitar a mesma que ja estava la e concluir que nada funciona.
  // Com os dois numeros a vista, "R$ 1.278,00 / 20 kg" denuncia sozinho qual
  // dos dois esta fora: botijao de 20 kg nao custa mil e duzentos reais.
  const conta = 'R$ ' + v.toFixed(2).replace('.', ',') + ' / ' +
    Number(q.toFixed(3)) + ' ' + unidade + ' = R$ ' +
    unitario.toFixed(2).replace('.', ',') + '/' + unidade;
  const dica = unidade === 'kg'
    ? ' • confira qual dos dois está errado: botijão P13 = 13 kg, P20 = 20 kg, ' +
      'P45 = 45 kg'
    : ' • confira qual dos dois está errado';
  return [ABAS.LANCAMENTOS, placa,
    unidade === 'kg' ? 'Preço por quilo fora da curva' : 'Preço por litro fora da curva',
    'linha ' + numeroLinha + ' • ' + conta + ' em ' + nome + dica];
}

/**
 * Tipo de abastecimento (V4.7.2).
 *
 * Interno = saiu do tanque proprio, entao o custo vem do preco medio da bomba e
 * nao existe NF do abastecimento (a NF e a da carga do tanque).
 * Externo = posto de terceiros, com NF e valor digitados.
 *
 * Repare que isto CONVERSA com o tipo de despesa, que ja separava
 * "Combustivel Proprio" de "Combustivel Terceiros". Por isso o campo e derivado
 * do tipo quando vem vazio: manter dois campos que podem se contradizer e receita
 * de relatorio errado.
 */
const ABASTECIMENTO_INTERNO = 'Interno';
const ABASTECIMENTO_EXTERNO = 'Externo';
const TIPOS_ABASTECIMENTO = [ABASTECIMENTO_INTERNO, ABASTECIMENTO_EXTERNO];

/**
 * Combustivel move o odometro; ARLA nao.
 *
 * Sao dois conceitos que antes moravam na mesma lista: TIPOS_COMBUSTIVEL decide
 * quem libera o campo KM, e TIPOS_DO_TANQUE decide quem pode sair do tanque
 * interno e por isso escolhe Interno/Externo. ARLA entra no segundo e nao no
 * primeiro — juntar os dois faria o ARLA pedir leitura de odometro e sujar a
 * serie que alimenta KM/litro.
 */
const TIPOS_COMBUSTIVEL = ['Combustivel Proprio', 'Combustivel Terceiros'];
const TIPOS_DO_TANQUE = TIPOS_COMBUSTIVEL.concat(['Arla 32']);

/** Produtos guardados no tanque interno. */
const PRODUTO_DIESEL = 'DIESEL S10';
const PRODUTO_ARLA = 'ARLA 32';
const PRODUTOS_BOMBA = [PRODUTO_DIESEL, PRODUTO_ARLA];

/** Ramos de fornecedor, para o dropdown do cadastro. */
const TIPOS_FORNECEDOR = [
  'Oficina mecanica',
  'Auto eletrica',
  'Funilaria / pintura',
  'Pecas e acessorios',
  'Pneus',
  'Lavacao / lubrificacao',
  'Posto de combustivel',
  'Distribuidora de combustivel',
  'Seguradora',
  'Outro',
];

/** Colunas da aba Fornecedores (1-indexado). */
const COL_FORN = {
  NOME: 1,
  CNPJ: 2,
  TIPO: 3,
  ATIVO: 4,
  OBSERVACAO: 5,
};

/**
 * Colunas da aba Carga na Bomba (1-indexado).
 *
 * PRECO_LITRO e formula, nao digitacao: valor / quantidade. Deixar o usuario
 * digitar os tres abriria espaco para os tres nao fecharem entre si.
 */
const COL_CARGA = {
  DATA: 1,
  DOCUMENTO: 2,
  PRODUTO: 3,
  QUANTIDADE: 4,
  VALOR: 5,
  PRECO_LITRO: 6,
  OBSERVACAO: 7,
};

const LIMITE_CARGA_BOMBA = 5000;

/** Tipos que NAO entram no custo operacional do veiculo. */
const TIPOS_FORA_DO_CUSTO = ['Oficina Ativo', 'Oficina Deb Loja', 'Plotagem', 'Carro Novo'];

/** Tipos classificados como ATIVO (imobilizado). Somam juntos na coluna K do Resumo. */
const TIPOS_ATIVO = ['Oficina Ativo', 'Plotagem', 'Carro Novo'];

/** Tipos que exigem NF/documento além dos de oficina. */
const TIPOS_EXIGEM_DOCUMENTO = ['Plotagem', 'Carro Novo'];

/**
 * Categorias de veículo oferecidas no cadastro (V4.8).
 * A lista final é esta + as categorias que já existem na aba Veículos, então nenhuma
 * categoria antiga some do formulário.
 */
const CATEGORIAS_VEICULO_PADRAO = [
  'Leve',
  'Carro',
  'Moto',
  'Truck Normal',
  'Truck Frigorifico',
  'Carreta Normal',
  'Carreta Frigorifica',
  'Empilhadeira/Paleteira',
  'Maquina',
];

/** Tipos de lançamento que exigem detalhamento de oficina/manutenção. */
const TIPOS_OFICINA = ['Oficina Despesa', 'Oficina Ativo', 'Oficina Deb Loja'];

/** Classificação gerencial do gasto de oficina. */
const NATUREZA_OFICINA_LEGADO_ = 'Legado — não detalhado';
const PROP_BASELINE_OFICINA_V47_ = 'BASELINE_OFICINA_V47_CONCLUIDO';

const NATUREZAS_OFICINA = [
  'Peça de reposição',
  'Mão de obra / serviço mecânico',
  'Serviço',
  'Elétrica / eletrônica',
  'Funilaria / pintura',
  'Ar-condicionado / refrigeração',
  'Freios / suspensão',
  'Motor / transmissão',
  'Guincho / socorro',
  'Tacógrafo / rastreamento',
  'Outros',
];

const CORES = {
  // Tema institucional Grupo Giassi.
  // Manual oficial: Laranja Pantone 158C + Preto Pantone Black C.
  LARANJA: '#F47820',
  LARANJA_CLARO: '#FDE9D9',
  PRETO: '#231F20',
  GRAFITE: '#4A4546',
  CINZA: '#F3F1F0',
  VERDE: '#E2EFDA',
  VERMELHO: '#FCE4E4',
  AMARELO: '#FFF2CC',
  BRANCO: '#FFFFFF',
  TEXTO_CLARO: '#231F20', // texto sobre o laranja institucional: contraste superior ao branco
};

/** Perfis de acesso do App da Web. */
const PERFIS_ACESSO = ['CONSULTA', 'OPERADOR', 'ADMIN'];

/** Telas que cada perfil poderá visualizar no App. */
/**
 * Telas visiveis em cada perfil.
 *
 * ATENCAO: esta lista e o que o menu do app realmente mostra. Uma tela pode
 * existir no App.html, estar em TELAS_WEB e mesmo assim NAO APARECER para
 * ninguem se o id faltar aqui — foi o que aconteceu com 'orcamento' (V4.9) e
 * 'comprovantes' (V4.11), entregues e invisiveis ate alguem perguntar onde
 * estavam. Ha regra estatica cobrando as tres listas: conferir_telas.js.
 */
const TELAS_POR_PERFIL = {
  // Carga na bomba e operacao do dia a dia; cadastro de fornecedor e administrativo,
  // porque criar fornecedor solto derrubaria a consistencia do relatorio por fornecedor.
  // Orcamento entra como LEITURA: a gravacao e barrada no servidor (ADMIN).
  CONSULTA: ['inicio', 'consulta', 'relatorios', 'resumo', 'rateio', 'orcamento',
    'veiculos', 'centros', 'fornecedores'],
  // Comprovante atrasado e do OPERADOR: quem recebe o papel na loja e quem registra.
  // Incorporar e descartar continuam sendo ADMIN, barrados no servidor.
  OPERADOR: ['inicio', 'lancar', 'lancamentos', 'bomba', 'comprovantes', 'consulta',
    'relatorios', 'resumo', 'rateio', 'orcamento',
    'veiculos', 'centros', 'fornecedores', 'pendencias'],
  ADMIN: ['inicio', 'lancar', 'lancamentos', 'bomba', 'comprovantes', 'consulta',
    'relatorios', 'resumo', 'rateio', 'orcamento',
    'veiculos', 'fornecedores', 'centros', 'pendencias', 'depreciacao', 'ipva', 'fechamento',
    'saude', 'config', 'usuarios', 'log'],
};

/** Colunas da aba Lançamentos (1-indexado). */
/**
 * Colunas da aba Lançamentos (1-indexado).
 *
 * V4.7.2 removeu SETOR: era digitado à mão no formulário e duplicava CENTRO, que
 * já vem do cadastro do veículo a cada gravação. Um dado, uma fonte. As colunas à
 * direita andaram uma casa para a esquerda — quem tem base antiga passa pela
 * migração em migrarSchemaV472_().
 *
 * FORNECEDOR e TIPO_ABASTECIMENTO entraram no fim, onde acrescentar não desloca nada.
 */
const COL_LANC = {
  DATA: 1,
  PLACA: 2,
  TIPO: 3,
  LITROS: 4,
  VALOR: 5,
  DOCUMENTO: 6,
  OBSERVACAO: 7,
  CENTRO: 8,
  CATEGORIA: 9,
  PERIODO: 10,
  ID: 11,
  NATUREZA_OFICINA: 12,
  DETALHE_OFICINA: 13,
  FORNECEDOR: 14,
  TIPO_ABASTECIMENTO: 15,
};

const PROP_SCHEMA_V472_ = 'SCHEMA_V472_CONCLUIDO';

/**
 * Migração única do schema V4.7 -> V4.7.2.
 *
 * Três movimentos, nesta ordem:
 *   1. Lançamentos: apaga a coluna Setor (era a 6), o que puxa tudo à direita
 *      uma casa para a esquerda — o Sheets move os DADOS junto, não só o rótulo.
 *   2. Lançamentos: garante as colunas Fornecedor e Tipo de Abastecimento no fim.
 *   3. Veículos: garante a coluna IPVA Anual no fim.
 *
 * É idempotente e reconhece o estado pelo CONTEÚDO do cabeçalho, não por um
 * contador de versão: uma base restaurada de backup antigo, ou já migrada à mão,
 * cai no ramo certo. A flag em Properties é só atalho para não reler o cabeçalho
 * a cada abertura.
 *
 * NÃO roda sozinha em fluxo de leitura: quem chama é o instalador, que já faz
 * backup antes. Apagar coluna é destrutivo e não deve acontecer por acidente.
 */
function migrarSchemaV472_() {
  exigirExecucaoMutacao_();
  const props = PropertiesService.getDocumentProperties();
  const planilha = ss_();
  const passos = [];

  const lancamentos = planilha.getSheetByName(ABAS.LANCAMENTOS);
  if (lancamentos && lancamentos.getMaxColumns() >= 6) {
    const rotulo = String(lancamentos.getRange(1, 6).getDisplayValue() || '').trim();
    // Só apaga se a coluna 6 for mesmo o Setor. Se alguém já migrou, aqui está
    // 'NF / Documento / OS' e não se toca em nada.
    if (rotulo.toUpperCase() === 'SETOR') {
      lancamentos.deleteColumn(6);
      passos.push('coluna Setor removida de ' + ABAS.LANCAMENTOS);
    }
  }
  if (lancamentos) {
    garantirColunas_(lancamentos, TOTAL_COL_LANC);
    lancamentos.getRange(1, 1, 1, TOTAL_COL_LANC)
      .setValues([CABECALHOS[ABAS.LANCAMENTOS]]);
    passos.push('cabeçalho de ' + ABAS.LANCAMENTOS + ' com ' + TOTAL_COL_LANC + ' colunas');
  }

  const veiculos = planilha.getSheetByName(ABAS.VEICULOS);
  if (veiculos) {
    garantirColunas_(veiculos, TOTAL_COL_VEIC);
    veiculos.getRange(1, 1, 1, TOTAL_COL_VEIC).setValues([CABECALHOS[ABAS.VEICULOS]]);
    passos.push('cabeçalho de ' + ABAS.VEICULOS + ' com ' + TOTAL_COL_VEIC + ' colunas');
  }

  props.setProperty(PROP_SCHEMA_V472_, 'SIM');
  if (passos.length) registrarLog_('Migração schema V4.7.2', passos.join(' • '));
  return { migrado: true, passos: passos };
}

/** Numero da coluna -> letra ("A", "Z", "AA"). Usado para montar faixas de QUERY. */
function letraColuna_(numero) {
  let n = Math.max(1, Math.floor(numero));
  let letra = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/**
 * VLOOKUP na aba Resumo por INDICE NOMEADO (R_), nao por numero solto.
 *
 * Os indices literais aqui eram 20, 17, 19, 18... e cada coluna nova no Resumo
 * exigia lembrar de corrigir todos. Com R_ o deslocamento acontece sozinho.
 */
function vlookupResumo_(refResumo, indiceR, padrao) {
  return '=IFERROR(VLOOKUP($H$3,' + refResumo + '!$A:$' + letraColuna_(TOTAL_COL_RESUMO) +
    ',' + (indiceR + 1) + ',FALSE),' + (padrao === undefined ? '0' : padrao) + ')';
}

/** Maior índice de um mapa de colunas — a largura real da aba. */
function totalColunas_(mapa) {
  return Object.keys(mapa).reduce(function (maior, chave) {
    return Math.max(maior, mapa[chave]);
  }, 0);
}

// Contagens derivadas. Antes eram literais espalhados (getRange(..., 8), (..., 12)),
// e cada coluna nova exigia caçar todos eles.
const TOTAL_COL_LANC = totalColunas_(COL_LANC);
/** Bloco contíguo que o formulário grava de uma vez: DATA..OBSERVAÇÃO. */
const BLOCO_ENTRADA_LANC = COL_LANC.OBSERVACAO;

/** Colunas da aba Veículos (1-indexado). */
const COL_VEIC = {
  PLACA: 1,
  DESCRICAO: 2,
  CATEGORIA: 3,
  CENTRO: 4,
  CODIGO: 5,
  DEPRECIACAO: 6,
  EMPLACAMENTO: 7,
  SEGURO: 8,
  BONUS: 9,
  PRECO_COMBUSTIVEL: 10,
  ATIVO: 11,
  ABA_ORIGEM: 12,
  // V4.7.2: IPVA anual. O 1/12 é gerado todo mês pela mesma máquina da depreciação.
  // Acrescentado no fim de propósito: assim nenhuma coluna existente se desloca.
  IPVA: 13,
};

const TOTAL_COL_VEIC = totalColunas_(COL_VEIC);

/** Parametros gravados na aba Parâmetros, na ordem em que sao escritos. */
const PARAMETROS_PADRAO = [
  ['MES_REFERENCIA', '2026-07', 'Período aberto, no formato AAAA-MM'],
  ['EMPRESA', 'GIASSI & CIA. LTDA.', 'Nome exibido no cabeçalho dos relatórios'],
  ['CUSTO_HORA_MOTORISTA', 12.65, 'R$/hora usado no custo por motorista'],
  ['DIA_INICIO_PERIODO', 26, 'Dia de abertura do período (mês anterior)'],
  ['DIA_FIM_PERIODO', 25, 'Dia de fechamento do período (mês de referência)'],
  ['BASE_RATEIO', 'DEPÓSITO,EMPILHADEIRAS', 'Centros cujo custo é rateado para as filiais'],
  ['DOMINIOS_LOGIN', 'giassi.com.br', 'Domínios corporativos permitidos no login, separados por vírgula'],
  ['EMAIL_ALERTAS', '', 'E-mails que recebem o alerta diário, separados por vírgula (vazio desliga)'],
  ['HORA_ALERTA', 7, 'Hora do dia (0-23) em que o alerta diário é enviado'],
  ['ESTOQUE_MINIMO_L', 500, 'Litros abaixo dos quais o tanque interno entra no alerta diário'],
  ['GRUPOS_FROTA',
    'Transporte: Truck Normal, Truck Frigorifico, Carreta Normal, Carreta Frigorifica | ' +
    'Apoio: Carro, Moto, Leve | Operação interna: Empilhadeira/Paleteira, Maquina',
    'Grupos de frota para os indicadores. Formato: Nome: categoria, categoria | Nome: ...'],
];

/** Linha da aba Parâmetros onde cada valor fica (a instalacao reescreve tudo). */
const LINHA_PARAM_INICIAL = 4;

/**
 * Limites usados nas formulas de matriz. Referencia de coluna inteira faria o
 * Sheets varrer 1 milhao de linhas por veiculo - com 167 veiculos o recalculo
 * trava. A V4.5 amplia a capacidade de Lançamentos automaticamente antes
 * de atingir o limite, mantendo as fórmulas em faixas controladas.
 */
// V4.8: 5.000 (era 20.000). A grade menor deixa cada edição mais leve; a expansão
// automática (garantirCapacidadeLancamentos_) dobra a capacidade ao atingir 80%.
const LIMITE_LANCAMENTOS = 5000;
const LIMITE_VEICULOS = 1000;
const FATOR_EXPANSAO_LANCAMENTOS_ = 2;
const LIMIAR_EXPANSAO_LANCAMENTOS_ = 0.80;
const PROP_CAPACIDADE_LANCAMENTOS_ = 'CAPACIDADE_LANCAMENTOS_V46';
const PROP_VERSAO_INSTALADA_ = 'VERSAO_SISTEMA_INSTALADA_V46';
const CACHE_SAUDE_RAPIDA_ = 'SAUDE_RAPIDA_V47';
const CACHE_SAUDE_RAPIDA_SEGUNDOS_ = 300;
const MAX_TENTATIVAS_LOGIN_ = 5;
const BLOQUEIO_LOGIN_SEGUNDOS_ = 600;
const PREFIXO_FALHA_LOGIN_ = 'LOGIN_FAIL_V46_';

/** Blindagem operacional V4: saúde, autorreparo e backups sem abrir o editor. */
const VERSAO_SISTEMA = '4.13.1';
const PASTA_BACKUPS_SISTEMA_ = 'Backups Sistema Frota';
const PREFIXO_BACKUP_SISTEMA_ = 'Sistema_Frota_BACKUP_';
const MAX_BACKUPS_SISTEMA_ = 30;
const HORA_BACKUP_AUTOMATICO_ = 3; // gatilho roda dentro da janela das 03h
const FUNCAO_BACKUP_AUTOMATICO_ = 'backupAutomaticoDiario_';
const FUNCAO_AUDITORIA_EDICAO_ = 'auditoriaEdicaoInstalavel_';
const FUNCAO_FLUSH_LOGINS_ = 'processarLoginsPendentesAgendado_';
const FUNCAO_AQUECER_CACHES_ = 'aquecerCachesAgendado_';

// ==========================================================================
// 01_Utils.gs
// ==========================================================================

/**
 * Funcoes de apoio usadas por todos os modulos.
 */

/**
 * A planilha do sistema.
 * Dentro da planilha, é a ativa. No app da web não existe planilha "ativa"
 * em alguns cenários de implantação, então caímos no ID gravado na instalação.
 */
let SS_EXEC_CACHE_ = null;
let TZ_EXEC_CACHE_ = null;
let PARAM_EXEC_CACHE_ = null;
let VEICULOS_EXEC_CACHE_ = null;
let CENTROS_EXEC_CACHE_ = null;

// Caches entre execuções do Web App. Evitam abrir a planilha em todo refresh.
const CACHE_BOOTSTRAP_META_ = 'BOOTSTRAP_META_V47';
// TTLs alongados na V4.8.7 junto com o gatilho de aquecimento: sem quem reaqueca,
// TTL longo so adia o erro de cache; COM o gatilho de 5 min, ele garante que a
// entrada nunca vence entre uma passagem e outra.
const CACHE_BOOTSTRAP_META_SEGUNDOS_ = 900; // 15 min (gatilho reaquece a cada 5)
const CACHE_USUARIO_ACESSO_PREFIXO_ = 'USER_ACL_V46_';
const CACHE_USUARIO_ACESSO_SEGUNDOS_ = 60;  // alteração de acesso propaga em até 1 min
const CACHE_USUARIO_LOGIN_PREFIXO_ = 'USER_AUTH_V46_';
const CACHE_USUARIO_LOGIN_SEGUNDOS_ = 180; // evita reler Usuários durante logins próximos
const PREFIXO_LOG_LOGIN_PENDENTE_ = 'LOGIN_PEND_V46_';
let ULTIMO_USUARIO_CACHE_HIT_ = false;
let ULTIMO_LOGIN_CACHE_HIT_ = false;
let ULTIMO_META_CACHE_HIT_ = false;

function ss_() {
  if (SS_EXEC_CACHE_) return SS_EXEC_CACHE_;
  const ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (ativa) {
    SS_EXEC_CACHE_ = ativa;
    return SS_EXEC_CACHE_;
  }
  const id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (!id) {
    throw new Error(
      'Planilha não identificada. Abra a planilha e rode ' +
      '"Instalar / atualizar sistema" uma vez antes de publicar o app da web.');
  }
  SS_EXEC_CACHE_ = SpreadsheetApp.openById(id);
  return SS_EXEC_CACHE_;
}

function timezone_() {
  if (!TZ_EXEC_CACHE_) TZ_EXEC_CACHE_ = ss_().getSpreadsheetTimeZone();
  return TZ_EXEC_CACHE_;
}

/** Guarda o ID da planilha para o app da web conseguir achá-la. */
function registrarPlanilha_() {
  const ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (ativa) {
    PropertiesService.getScriptProperties().setProperty('PLANILHA_ID', ativa.getId());
  }
}

/** Devolve a aba pelo nome, criando se necessario. */
function aba_(nome, criarSeFaltar) {
  const planilha = ss_();
  let sheet = planilha.getSheetByName(nome);
  if (!sheet && criarSeFaltar) {
    sheet = planilha.insertSheet(nome);
  }
  if (!sheet) {
    throw new Error('Aba "' + nome + '" não encontrada. Rode "Instalar / atualizar sistema".');
  }
  return sheet;
}

/** Migra o nome antigo da conferência sem perder conteúdo. */
function garantirAbaPendencias_(criarSeFaltar) {
  const planilha = ss_();
  let atual = planilha.getSheetByName(ABAS.CONFERENCIA);
  if (atual) return atual;
  const antiga = planilha.getSheetByName('Conferência Migração');
  if (antiga) {
    antiga.setName(ABAS.CONFERENCIA);
    return antiga;
  }
  if (criarSeFaltar) return planilha.insertSheet(ABAS.CONFERENCIA);
  return null;
}

/** Referencia de aba pronta para uso em fórmula (com aspas por causa dos acentos). */
function ref_(nome) {
  return "'" + nome + "'";
}

// ------------------------------------------------- separador das fórmulas
//
// Numa planilha em português o separador de argumentos é ";", não ",". Escrever
// "=SUM(A1,B1)" numa planilha pt-BR não dá erro de cálculo: dá erro de LEITURA,
// e a célula inteira vira #ERROR!. Como o Apps Script grava a fórmula como texto,
// sem traduzir, todo o sistema escreve com vírgula e converte na hora de gravar.

let SEPARADOR_CACHE = null;

/**
 * Descobre o separador desta planilha na prática: grava "=SUM(1,1)" numa aba
 * temporária e vê se o resultado é 2. Mais confiável do que manter uma lista de
 * locales — quem manda é o comportamento real do arquivo.
 */
function detectarSeparador_() {
  const planilha = ss_();
  let separador = ';';
  let temp = null;
  try {
    temp = planilha.insertSheet('__teste_separador__');
    temp.getRange('A1').setFormula('=SUM(1,1)');  // separador-ok: é a sonda
    SpreadsheetApp.flush();
    if (Number(temp.getRange('A1').getValue()) === 2) separador = ',';
  } catch (erro) {
    separador = ';';
  } finally {
    if (temp) planilha.deleteSheet(temp);
  }
  PropertiesService.getDocumentProperties().setProperty('SEPARADOR_FORMULA', separador);
  SEPARADOR_CACHE = separador;
  return separador;
}

function separadorFormula_() {
  if (SEPARADOR_CACHE) return SEPARADOR_CACHE;
  const salvo = PropertiesService.getDocumentProperties().getProperty('SEPARADOR_FORMULA');
  if (salvo) {
    SEPARADOR_CACHE = salvo;
    return salvo;
  }
  return detectarSeparador_();
}

/**
 * Troca as vírgulas que separam argumentos por ponto e vírgula, deixando
 * intactas as que estão dentro de texto — o "select A, B" de uma QUERY e o
 * "DEPÓSITO,EMPILHADEIRAS" de um parâmetro precisam continuar com vírgula.
 */
function adaptarSeparadores_(formula) {
  let saida = '';
  let emAspasDuplas = false;
  let emAspasSimples = false;

  for (let i = 0; i < formula.length; i++) {
    const c = formula[i];

    if (emAspasDuplas) {
      // "" é a forma de escapar aspas dentro de texto no Sheets
      if (c === '"' && formula[i + 1] === '"') { saida += '""'; i++; continue; }
      if (c === '"') emAspasDuplas = false;
      saida += c;
      continue;
    }
    if (emAspasSimples) {
      if (c === "'") emAspasSimples = false;
      saida += c;
      continue;
    }
    if (c === '"') { emAspasDuplas = true; saida += c; continue; }
    if (c === "'") { emAspasSimples = true; saida += c; continue; }

    saida += c === ',' ? ';' : c;
  }
  return saida;
}

/** Prepara uma fórmula para gravação nesta planilha. */
function fx_(formula) {
  return separadorFormula_() === ',' ? formula : adaptarSeparadores_(formula);
}

// ------------------------------------------------- datas dentro de fórmula
//
// TEXT(data;"yyyy-mm-dd") depende do idioma: em português o código do ano é
// "aaaa", não "yyyy". O sintoma é pior que o do separador, porque não dá erro —
// devolve texto errado em silêncio, e a coluna Período (que é DADO, não enfeite)
// sai furada. Montar a data juntando YEAR/MONTH/DAY não depende de idioma nenhum.

function doisDigitos_(expressao) {
  return 'RIGHT("0"&' + expressao + ',2)';
}

/** dd/mm/aaaa — para títulos e mensagens. */
function dataBR_(referencia) {
  return doisDigitos_('DAY(' + referencia + ')') + '&"/"&' +
    doisDigitos_('MONTH(' + referencia + ')') + '&"/"&YEAR(' + referencia + ')';
}

/** aaaa-mm-dd — formato que o literal `date` da QUERY exige. */
function dataIso_(referencia) {
  return 'YEAR(' + referencia + ')&"-"&' +
    doisDigitos_('MONTH(' + referencia + ')') + '&"-"&' +
    doisDigitos_('DAY(' + referencia + ')');
}

/** aaaa-mm — chave de competência. */
function mesIso_(referencia) {
  return 'YEAR(' + referencia + ')&"-"&' + doisDigitos_('MONTH(' + referencia + ')');
}

/** dd/mm/aaaa hh:mm — carimbo de quando o relatório foi gerado. */
function dataHoraBR_(referencia) {
  return dataBR_(referencia) + '&" "&' + doisDigitos_('HOUR(' + referencia + ')') +
    '&":"&' + doisDigitos_('MINUTE(' + referencia + ')');
}

function toast_(mensagem, titulo) {
  ss_().toast(mensagem, titulo || 'Sistema de Frota', 6);
}

function alerta_(titulo, mensagem) {
  SpreadsheetApp.getUi().alert(titulo, mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Lê um parâmetro da aba Parâmetros pelo nome. */
function parametrosExecucao_() {
  if (PARAM_EXEC_CACHE_) return PARAM_EXEC_CACHE_;
  const sheet = aba_(ABAS.PARAMETROS);
  const linhas = Math.max(sheet.getLastRow() - LINHA_PARAM_INICIAL + 1, 1);
  const dados = sheet.getRange(LINHA_PARAM_INICIAL, 1, linhas, 2).getValues();
  const mapa = {};
  dados.forEach(function (linha) {
    const chave = String(linha[0] == null ? '' : linha[0]).trim();
    if (chave) mapa[chave] = linha[1];
  });
  PARAM_EXEC_CACHE_ = mapa;
  return PARAM_EXEC_CACHE_;
}

function param_(nome) {
  exigirExecucaoLeitura_();
  const mapa = parametrosExecucao_();
  if (Object.prototype.hasOwnProperty.call(mapa, nome)) return mapa[nome];
  throw new Error('Parâmetro "' + nome + '" não encontrado na aba ' + ABAS.PARAMETROS + '.');
}

function gravarParam_(nome, valor) {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.PARAMETROS);
  const total = Math.max(sheet.getLastRow() - LINHA_PARAM_INICIAL + 1, 1);
  const intervalo = sheet.getRange(LINHA_PARAM_INICIAL, 1, total, 2);
  const dados = intervalo.getValues();
  for (let i = 0; i < dados.length; i++) {
    if (String(dados[i][0]).trim() === nome) {
      const celula = sheet.getRange(LINHA_PARAM_INICIAL + i, 2);
      // A competência é texto: sem o formato '@' o Sheets converte "2026-08" em data.
      if (nome === 'MES_REFERENCIA') celula.setNumberFormat('@');
      celula.setValue(valor);
      PARAM_EXEC_CACHE_ = null;
      CORTE_COMPETENCIA_EXEC_ = null;
      if (nome === 'MES_REFERENCIA') aplicarPeriodoNaPlanilha_();
      invalidarCacheInicio_();
      return;
    }
  }
  throw new Error('Parâmetro "' + nome + '" não existe.');
}

/**
 * Normaliza a competência para AAAA-MM.
 * Aceita texto ("2026-07") e também uma Date devolvida pelo Google Sheets.
 */
/** Competência que contém a data atual segundo a regra operacional 26→25. */
function mesReferenciaSugeridoHoje_() {
  const agora = new Date();
  const partes = Utilities.formatDate(agora, timezone_(), 'yyyy-MM-dd').split('-').map(Number);
  let ano = partes[0], mes = partes[1];
  if (partes[2] >= 26) { mes++; if (mes > 12) { mes = 1; ano++; } }
  return ano + '-' + ('0' + mes).slice(-2);
}

function normalizarMesReferencia_(mesRef) {
  if (mesRef instanceof Date && !isNaN(mesRef.getTime())) {
    return Utilities.formatDate(mesRef, ss_().getSpreadsheetTimeZone(), 'yyyy-MM');
  }

  const texto = String(mesRef == null ? '' : mesRef).trim();
  const m = /^(\d{4})-(\d{1,2})$/.exec(texto);
  if (m) {
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    if (mes >= 1 && mes <= 12) return ano + '-' + ('0' + mes).slice(-2);
  }

  // Também aceita dd/mm/aaaa caso a célula tenha sido convertida para texto de data.
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (br) {
    const mes = Number(br[2]);
    const ano = Number(br[3]);
    if (mes >= 1 && mes <= 12) return ano + '-' + ('0' + mes).slice(-2);
  }

  // V4.8: uma competência gravada numa célula SEM formato texto vira data, e ao ser
  // lida como texto chega assim: "Wed Jul 01 2026 04:00:00 GMT-0300 (...)". Foi o que
  // produziu a linha e a aba "Fechado Wed Jul 01 2026..." no Histórico.
  if (/^[A-Za-z]{3} [A-Za-z]{3} \d{1,2} \d{4}/.test(texto)) {
    const d = new Date(texto);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, timezone_(), 'yyyy-MM');
  }

  throw new Error('MES_REFERENCIA inválido: "' + texto + '". Use o formato AAAA-MM, por exemplo 2026-07.');
}

/**
 * Regra fixa do sistema: a competência termina no dia 25.
 * Ex.: 2026-07 = 26/06/2026 até 25/07/2026.
 */
/**
 * Dia de corte do período (V4.7.2 — antes era 25, fixo no código).
 *
 * DIA_FIM_PERIODO é a ÚNICA fonte da verdade. DIA_INICIO_PERIODO passa a ser
 * derivado (corte + 1) e só existe para leitura: dois parâmetros independentes
 * permitiriam gravar início 10 com fim 25, e aí o período teria buraco ou
 * sobreposição sem ninguém perceber.
 *
 * corte >= 28 significa MÊS CIVIL (dia 1 ao último dia do mês de referência).
 * Sem isso, um corte de 29 ou 30 pediria um dia que fevereiro não tem.
 */
const DIA_CORTE_PADRAO_ = 25;
const DIA_CORTE_MES_CIVIL_ = 28;

function diaCortePeriodo_() {
  let corte;
  try {
    corte = Number(param_('DIA_FIM_PERIODO'));
  } catch (e) {
    // Durante a instalação a aba Parâmetros pode ainda não existir.
    corte = DIA_CORTE_PADRAO_;
  }
  if (!isFinite(corte)) corte = DIA_CORTE_PADRAO_;
  corte = Math.floor(corte);
  if (corte < 1) corte = 1;
  if (corte > 31) corte = 31;
  return corte;
}

function ehMesCivil_(corte) {
  return (corte === undefined ? diaCortePeriodo_() : corte) >= DIA_CORTE_MES_CIVIL_;
}

/** Primeiro dia do período, para exibição. Derivado, nunca gravado. */
function diaInicioPeriodo_() {
  const corte = diaCortePeriodo_();
  return ehMesCivil_(corte) ? 1 : corte + 1;
}

function periodoDoMes_(mesRef) {
  const normalizado = normalizarMesReferencia_(mesRef);
  const livre = periodoLivreAtivo_(normalizado);
  if (livre) return { inicio: livre.inicio, fim: livre.fim, mesRef: normalizado, corte: diaCortePeriodo_(), livre: true };
  const partes = normalizado.split('-');
  const ano = Number(partes[0]);
  const mes = Number(partes[1]);
  const corte = diaCortePeriodo_();

  if (ehMesCivil_(corte)) {
    // dia 0 do mês seguinte = último dia do mês, sem tabela de 28/30/31.
    const inicioCivil = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    const fimCivil = new Date(ano, mes, 0, 23, 59, 59, 999);
    return { inicio: inicioCivil, fim: fimCivil, mesRef: normalizado, corte: corte };
  }

  const inicio = new Date(ano, mes - 2, corte + 1, 0, 0, 0, 0);
  const fim = new Date(ano, mes - 1, corte, 23, 59, 59, 999);
  return { inicio: inicio, fim: fim, mesRef: normalizado, corte: corte };
}

function periodoAtual_() {
  return periodoDoMes_(param_('MES_REFERENCIA'));
}

// ----------------------------------------------------- período com datas livres (V4.8)
/**
 * O ADMIN pode definir a data inicial e a final do período aberto livremente, sem
 * seguir o dia de corte. Fica guardado junto com a competência a que se refere: se a
 * competência mudar (fechamento, reabertura, troca manual), as datas livres deixam de
 * valer sozinhas e o período volta a seguir o dia de corte.
 */
const PROP_PERIODO_LIVRE_ = 'PERIODO_LIVRE_V48';
let PERIODO_LIVRE_EXEC_ = undefined;

function lerPeriodoLivre_() {
  if (PERIODO_LIVRE_EXEC_ !== undefined) return PERIODO_LIVRE_EXEC_;
  PERIODO_LIVRE_EXEC_ = null;
  try {
    const bruto = PropertiesService.getDocumentProperties().getProperty(PROP_PERIODO_LIVRE_);
    if (bruto) {
      const o = JSON.parse(bruto);
      const ini = parseDataIsoEstrita_(o.inicio), fim = parseDataIsoEstrita_(o.fim);
      if (o.mes && ini && fim) {
        PERIODO_LIVRE_EXEC_ = {
          mes: o.mes,
          inicio: new Date(ini.getFullYear(), ini.getMonth(), ini.getDate(), 0, 0, 0, 0),
          fim: new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999),
        };
      }
    }
  } catch (e) { PERIODO_LIVRE_EXEC_ = null; }
  return PERIODO_LIVRE_EXEC_;
}

/** Período livre em vigor para a competência informada (ou null). */
function periodoLivreAtivo_(mesRef) {
  const livre = lerPeriodoLivre_();
  return livre && mesRef && livre.mes === mesRef ? livre : null;
}

function gravarPeriodoLivre_(mes, inicio, fim) {
  const iso = function (d) { return Utilities.formatDate(d, timezone_(), 'yyyy-MM-dd'); };
  PropertiesService.getDocumentProperties().setProperty(PROP_PERIODO_LIVRE_,
    JSON.stringify({ mes: mes, inicio: iso(inicio), fim: iso(fim) }));
  PERIODO_LIVRE_EXEC_ = undefined;
  CORTE_COMPETENCIA_EXEC_ = null;
}

function limparPeriodoLivre_() {
  PropertiesService.getDocumentProperties().deleteProperty(PROP_PERIODO_LIVRE_);
  PERIODO_LIVRE_EXEC_ = undefined;
  CORTE_COMPETENCIA_EXEC_ = null;
}

/**
 * Define o período aberto com datas livres. A competência (nome do mês nos relatórios)
 * é o mês da data final. Uso interno: quem chama já validou o perfil ADMIN.
 */
function definirPeriodoLivre_(inicioIso, fimIso) {
  const ini = parseDataIsoEstrita_(inicioIso);
  const fim = parseDataIsoEstrita_(fimIso);
  if (!ini || !fim) return { ok: false, mensagem: 'Informe a data inicial e a data final do período.' };
  if (ini > fim) return { ok: false, mensagem: 'A data inicial precisa ser anterior (ou igual) à data final.' };
  const dias = Math.round((fim - ini) / 86400000) + 1;
  if (dias > 92) return { ok: false, mensagem: 'O período pode ter no máximo 92 dias (3 meses). Foram informados ' + dias + '.' };
  const mes = Utilities.formatDate(fim, timezone_(), 'yyyy-MM');
  const anterior = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  gravarPeriodoLivre_(mes, ini, fim);
  const contexto = CONTEXTO_SISTEMA_INTERNO_;
  CONTEXTO_SISTEMA_INTERNO_ = true;
  try {
    gravarParam_('MES_REFERENCIA', mes);   // também sincroniza as células do período
    reconstruirRelatorios_();
    montarCentralOperacional_();
  } finally { CONTEXTO_SISTEMA_INTERNO_ = contexto; }
  invalidarCacheInicio_();
  const p = periodoAtual_();
  registrarLog_('Período com datas livres', anterior + ' -> ' + mes + ' • ' + formatarData_(p.inicio) + ' a ' + formatarData_(p.fim));
  return {
    ok: true, recarregar: true,
    mensagem: 'Período aberto: ' + formatarData_(p.inicio) + ' a ' + formatarData_(p.fim) +
      ' (competência ' + nomeDoMes_(mes) + '). Lançamentos agora aceitam datas nesse intervalo e os relatórios foram recalculados.' +
      (ss_().getSheetByName('Fechado ' + mes) ? ' Atenção: ' + nomeDoMes_(mes) + ' já tinha sido fechado.' : ''),
  };
}

/** Volta o período aberto a seguir o dia de corte (26 a 25, ou o configurado). */
function voltarPeriodoPadrao_() {
  limparPeriodoLivre_();
  const contexto = CONTEXTO_SISTEMA_INTERNO_;
  CONTEXTO_SISTEMA_INTERNO_ = true;
  try {
    aplicarPeriodoNaPlanilha_();
    reconstruirRelatorios_();
    montarCentralOperacional_();
  } finally { CONTEXTO_SISTEMA_INTERNO_ = contexto; }
  invalidarCacheInicio_();
  const p = periodoAtual_();
  registrarLog_('Período padrão restaurado', formatarData_(p.inicio) + ' a ' + formatarData_(p.fim));
  return { ok: true, recarregar: true, mensagem: 'Período voltou ao padrão: ' + formatarData_(p.inicio) + ' a ' + formatarData_(p.fim) + '.' };
}

function webPeriodo(token) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const mes = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const p = periodoAtual_();
  const iso = function (d) { return Utilities.formatDate(d, timezone_(), 'yyyy-MM-dd'); };
  return { mes: mes, mesExtenso: nomeDoMes_(mes), inicio: iso(p.inicio), fim: iso(p.fim),
    livre: !!periodoLivreAtivo_(mes), corte: diaCortePeriodo_() };
}

function webDefinirPeriodoLivre(token, inicioIso, fimIso) {
  autorizarContextoWeb_(token, 'ADMIN');
  return definirPeriodoLivre_(inicioIso, fimIso);
}

function webVoltarPeriodoPadrao(token) {
  autorizarContextoWeb_(token, 'ADMIN');
  return voltarPeriodoPadrao_();
}

/** "2026-07" -> "JULHO/2026" */
function nomeDoMes_(mesRef) {
  const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const normalizado = normalizarMesReferencia_(mesRef);
  const partes = normalizado.split('-');
  return meses[Number(partes[1]) - 1] + '/' + partes[0];
}

function formatarData_(data) {
  if (!(data instanceof Date) || isNaN(data.getTime())) return '';
  return Utilities.formatDate(data, timezone_(), 'dd/MM/yyyy');
}


/** Converte AAAA-MM-DD sem aceitar normalização silenciosa (ex.: 31/02 -> março). */
function parseDataIsoEstrita_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate(), 12, 0, 0, 0);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor || '').trim());
  if (!m) return null;
  const ano=Number(m[1]), mes=Number(m[2]), dia=Number(m[3]);
  const d=new Date(ano,mes-1,dia,12,0,0,0);
  if (d.getFullYear()!==ano || d.getMonth()!==mes-1 || d.getDate()!==dia) return null;
  return d;
}

/** Normaliza placa/ID: maiúsculas, um espaço só, sem hífen. */
function normalizaPlaca_(valor) {
  return String(valor == null ? '' : valor)
    .toUpperCase()
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Última linha realmente ocupada por um lançamento, usando a coluna Placa e ignorando spills de ARRAYFORMULA. */
function ultimaLinhaLancamentoReal_() {
  const sheet = ss_().getSheetByName(ABAS.LANCAMENTOS);
  if (!sheet) return 1;
  const max = sheet.getMaxRows();
  if (max < 2) return 1;
  const linha = sheet.getRange(max, COL_LANC.PLACA)
    .getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
  return linha >= 2 ? linha : 1;
}

function quantidadeLancamentosReais_() {
  return Math.max(ultimaLinhaLancamentoReal_() - 1, 0);
}

function proximaLinhaLancamento_() {
  return Math.max(2, ultimaLinhaLancamentoReal_() + 1);
}

/** Lista de placas cadastradas (coluna A da aba Veículos). */
function dadosVeiculosExecucao_() {
  if (VEICULOS_EXEC_CACHE_) return VEICULOS_EXEC_CACHE_;
  const sheet = aba_(ABAS.VEICULOS);
  if (sheet.getLastRow() < 2) {
    VEICULOS_EXEC_CACHE_ = [];
    return VEICULOS_EXEC_CACHE_;
  }
  VEICULOS_EXEC_CACHE_ = sheet.getRange(2, 1, sheet.getLastRow() - 1, TOTAL_COL_VEIC).getValues();
  return VEICULOS_EXEC_CACHE_;
}

function listaPlacas_(somenteAtivos) {
  exigirExecucaoLeitura_();
  return dadosVeiculosExecucao_()
    .filter(function (linha) {
      if (!linha[COL_VEIC.PLACA - 1]) return false;
      if (!somenteAtivos) return true;
      return String(linha[COL_VEIC.ATIVO - 1]).toUpperCase() !== 'NAO';
    })
    .map(function (linha) { return String(linha[COL_VEIC.PLACA - 1]).trim(); });
}


/** Chave textual usada para localizar número de patrimônio sem alterar a placa oficial. */
function chavePatrimonio_(valor) {
  return String(valor == null ? '' : valor).trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Lista rica de veículos para busca por placa ou patrimônio nas interfaces. */
function opcoesVeiculos_(somenteAtivos) {
  exigirExecucaoLeitura_();
  return dadosVeiculosExecucao_()
    .filter(function(linha) {
      if (!linha[COL_VEIC.PLACA - 1]) return false;
      return !somenteAtivos || String(linha[COL_VEIC.ATIVO - 1] || '').trim().toUpperCase() !== 'NAO';
    })
    .map(function(linha) {
      const placa = String(linha[COL_VEIC.PLACA - 1] || '').trim();
      const patrimonio = String(linha[COL_VEIC.CODIGO - 1] || '').trim();
      const descricao = String(linha[COL_VEIC.DESCRICAO - 1] || '').trim();
      return {
        placa: placa,
        patrimonio: patrimonio,
        descricao: descricao,
        ativo: String(linha[COL_VEIC.ATIVO - 1] || '').trim().toUpperCase() !== 'NAO',
        // V4.8.7: valor SUGERIDO ao lancar o IPVA anual. Nao e o que entra no mapa
        // — o mapa soma as parcelas lancadas.
        ipva: Number(linha[COL_VEIC.IPVA - 1]) || 0,
        rotulo: placa + (patrimonio ? ' • Patrimônio ' + patrimonio : '') + (descricao ? ' • ' + descricao : '')
      };
    });
}

/**
 * Resolve uma entrada de usuário para a identidade oficial do veículo.
 * Aceita placa/ID, Código Patrimônio e, quando houver somente um resultado,
 * uma descrição parcial. Nunca grava patrimônio na base: o retorno sempre usa a placa oficial.
 */
function resolverVeiculo_(entrada, somenteAtivos) {
  const bruto = String(entrada == null ? '' : entrada).trim();
  if (!bruto) return { ok:false, mensagem:'Informe a placa/ID ou o patrimônio.' };
  const termo = bruto.toUpperCase();
  const termoPlaca = normalizaPlaca_(bruto.split(/[•|—]/)[0]);
  const termoPatrimonio = chavePatrimonio_(bruto);
  const dados = dadosVeiculosExecucao_().filter(function(linha) {
    if (!linha[COL_VEIC.PLACA - 1]) return false;
    return !somenteAtivos || String(linha[COL_VEIC.ATIVO - 1] || '').trim().toUpperCase() !== 'NAO';
  });

  function objeto(linha) {
    return {
      placa: String(linha[COL_VEIC.PLACA - 1] || '').trim(),
      patrimonio: String(linha[COL_VEIC.CODIGO - 1] || '').trim(),
      descricao: String(linha[COL_VEIC.DESCRICAO - 1] || '').trim(),
      categoria: String(linha[COL_VEIC.CATEGORIA - 1] || '').trim(),
      centro: normalizarCentroCusto_(linha[COL_VEIC.CENTRO - 1]),
      ativo: String(linha[COL_VEIC.ATIVO - 1] || '').trim().toUpperCase() !== 'NAO'
    };
  }

  let achados = dados.filter(function(linha) {
    return normalizaPlaca_(linha[COL_VEIC.PLACA - 1]) === termoPlaca ||
      (termoPatrimonio && chavePatrimonio_(linha[COL_VEIC.CODIGO - 1]) === termoPatrimonio);
  });
  if (achados.length === 1) return { ok:true, veiculo:objeto(achados[0]) };
  if (achados.length > 1) {
    return { ok:false, ambiguo:true, mensagem:'A busca "' + bruto + '" corresponde a mais de um veículo. Use a placa/ID.',
      candidatos:achados.slice(0,8).map(function(l){return objeto(l);}) };
  }

  // Se o navegador enviou o rótulo completo do datalist, recupera a placa do início.
  achados = dados.filter(function(linha) {
    const placa = String(linha[COL_VEIC.PLACA - 1] || '').trim().toUpperCase();
    return termo.indexOf(placa + ' •') === 0 || termo.indexOf(placa + ' —') === 0;
  });
  if (achados.length === 1) return { ok:true, veiculo:objeto(achados[0]) };

  // Descrição parcial é apenas conveniência e só é aceita quando identifica um único bem.
  achados = dados.filter(function(linha) {
    const descricao = String(linha[COL_VEIC.DESCRICAO - 1] || '').trim().toUpperCase();
    return descricao && descricao.indexOf(termo) !== -1;
  });
  if (achados.length === 1) return { ok:true, veiculo:objeto(achados[0]) };
  if (achados.length > 1) {
    return { ok:false, ambiguo:true, mensagem:'A descrição "' + bruto + '" encontrou vários veículos. Informe placa/ID ou patrimônio.',
      candidatos:achados.slice(0,8).map(function(l){return objeto(l);}) };
  }
  return { ok:false, mensagem:'Veículo não encontrado para "' + bruto + '". Informe placa/ID ou Código Patrimônio cadastrado.' };
}

/** Aplica o visual padrão de cabeçalho a um intervalo. */
function estilizarCabecalho_(intervalo) {
  intervalo
    .setBackground(CORES.LARANJA)
    .setFontColor(CORES.TEXTO_CLARO)
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center')
    .setWrap(true);
}

/** Remove todos os gráficos de uma aba_(para poder recriá-los). */
function limparGraficos_(sheet) {
  sheet.getCharts().forEach(function (grafico) { sheet.removeChart(grafico); });
}

/** Remove o filtro da aba, se houver (clear() não remove). */
function removerFiltro_(sheet) {
  const filtro = sheet.getFilter();
  if (filtro) filtro.remove();
}

/**
 * Garante que a aba tenha pelo menos `linhas` linhas.
 * Fórmula que aponta para além da última linha da grade devolve #REF!,
 * então os intervalos limitados só funcionam com a grade dimensionada.
 */
function garantirLinhas_(sheet, linhas) {
  const faltam = linhas - sheet.getMaxRows();
  if (faltam > 0) sheet.insertRowsAfter(sheet.getMaxRows(), faltam);
}

/**
 * Mesma ideia para colunas. Os relatórios em pivot geram uma coluna por centro
 * de custo — hoje 34 — e estourariam as 26 colunas padrão de uma aba nova.
 */
function garantirColunas_(sheet, colunas) {
  const faltam = colunas - sheet.getMaxColumns();
  if (faltam > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), faltam);
}

/** Capacidade atual das fórmulas de Lançamentos. Cresce sem editar o código. */
/**
 * V4.8: encolhe as abas Lançamentos e Odômetro para o tamanho necessário. Bases antigas
 * nasceram com 20.000 linhas; a coluna Período, as validações e as formatações rodavam
 * em todas elas. Mantém folga de 50% sobre o volume real (mínimo LIMITE_LANCAMENTOS) e
 * nunca apaga linha com conteúdo.
 */
function reduzirCapacidadeLancamentos_() {
  const props = PropertiesService.getDocumentProperties();
  const lanc = ss_().getSheetByName(ABAS.LANCAMENTOS);
  const odo = ss_().getSheetByName(ABAS.ODOMETRO);
  if (!lanc) return null;
  const atual = Number(props.getProperty(PROP_CAPACIDADE_LANCAMENTOS_) || 0) || lanc.getMaxRows();
  // Última linha com QUALQUER dado digitado (A:I e K:O; J é fórmula).
  function ultimaComDado(sheet, colunas) {
    const max = sheet.getMaxRows();
    let ultima = 1;
    colunas.forEach(function (c) {
      const v = sheet.getRange(max, c).getValue() !== '' ? max
        : sheet.getRange(max, c).getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
      if (v > ultima) ultima = v;
    });
    return ultima;
  }
  const colsLanc = [];
  for (let c = 1; c <= TOTAL_COL_LANC; c++) if (c !== COL_LANC.PERIODO) colsLanc.push(c);
  const usadas = Math.max(ultimaComDado(lanc, colsLanc), odo ? ultimaComDado(odo, [1, 2, 3]) : 1);
  let alvo = Math.max(LIMITE_LANCAMENTOS, Math.ceil(usadas * 1.5 / 1000) * 1000);
  if (alvo >= lanc.getMaxRows() && alvo >= atual) return { reduziu: false, capacidade: atual };
  [lanc, odo].forEach(function (sheet) {
    if (!sheet) return;
    const max = sheet.getMaxRows();
    if (max > alvo) sheet.deleteRows(alvo + 1, max - alvo);
  });
  props.setProperty(PROP_CAPACIDADE_LANCAMENTOS_, String(alvo));
  registrarLog_('Reduzir capacidade', atual + ' -> ' + alvo + ' linhas (usadas: ' + usadas + ')');
  return { reduziu: true, capacidade: alvo };
}

function limiteLancamentosAtual_() {
  let atual = Number(PropertiesService.getDocumentProperties().getProperty(PROP_CAPACIDADE_LANCAMENTOS_) || LIMITE_LANCAMENTOS);
  if (!isFinite(atual) || atual < LIMITE_LANCAMENTOS) atual = LIMITE_LANCAMENTOS;
  return Math.floor(atual);
}

// ----------------------------------------------- teto de varredura (V4.7.1)
/**
 * As formulas do Resumo varriam a CAPACIDADE alocada (20.000 linhas), nao o
 * volume real de lancamentos. Com 3.000 lancamentos isso percorria 17.000 linhas
 * vazias, 18 vezes (15 SUMIFS + COUNTIFS/MAXIFS/MINIFS) por linha de veiculo.
 *
 * Aqui a varredura acompanha o uso, em degraus de mil, para a formula nao
 * precisar ser reescrita a cada gravacao.
 *
 * REGRA DE SEGURANCA: em qualquer duvida o teto volta a ser a capacidade cheia.
 * Errar para o lado lento e so lentidao; errar para o lado curto some com
 * lancamento do relatorio em silencio, que e o unico defeito inaceitavel aqui.
 * O teto tambem nunca passa da capacidade - apontar alem da grade daria #REF!.
 */
const DEGRAU_VARREDURA_LANCAMENTOS_ = 1000;
const MARGEM_VARREDURA_LANCAMENTOS_ = 500;

function fimLancamentosFormula_() {
  const capacidade = limiteLancamentosAtual_();
  let usados;
  try {
    usados = quantidadeLancamentosReais_();
  } catch (e) {
    return capacidade;
  }
  if (!isFinite(usados) || usados < 0) return capacidade;
  const alvo = Math.ceil((usados + MARGEM_VARREDURA_LANCAMENTOS_) / DEGRAU_VARREDURA_LANCAMENTOS_) *
    DEGRAU_VARREDURA_LANCAMENTOS_;
  return Math.min(Math.max(alvo, DEGRAU_VARREDURA_LANCAMENTOS_), capacidade);
}

/**
 * Altura fechada das formulas matriciais do Resumo.
 *
 * $A4:$A aberto fazia o ARRAYFORMULA calcular ~1.100 linhas (a aba e dimensionada
 * em LIMITE_VEICULOS + 100) para uma frota de ~170 veiculos. E IF() dentro de
 * ARRAYFORMULA nao faz curto-circuito: o Sheets calcula os dois ramos inteiros
 * antes de escolher, entao os SUMIFS rodavam tambem nas ~900 linhas vazias.
 */
const DEGRAU_LINHAS_RESUMO_ = 50;
const MARGEM_LINHAS_RESUMO_ = 25;
const PRIMEIRA_LINHA_RESUMO_ = 4;

function alturaResumo_() {
  const teto = LIMITE_VEICULOS + 100;   // altura fisica garantida por montarResumo_
  let veiculos;
  try {
    const sheet = ss_().getSheetByName(ABAS.VEICULOS);
    veiculos = sheet ? Math.max(sheet.getLastRow() - 1, 0) : null;
  } catch (e) {
    veiculos = null;
  }
  if (veiculos === null || !isFinite(veiculos)) return teto;   // na duvida, varre tudo
  const alvo = Math.ceil((veiculos + MARGEM_LINHAS_RESUMO_) / DEGRAU_LINHAS_RESUMO_) *
    DEGRAU_LINHAS_RESUMO_;
  return Math.min(PRIMEIRA_LINHA_RESUMO_ - 1 + Math.max(alvo, DEGRAU_LINHAS_RESUMO_), teto);
}

/** Os dois tetos juntos: muda a assinatura, as formulas do Resumo sao regravadas. */
const PROP_VARREDURA_RESUMO_ = 'VARREDURA_RESUMO_V471';

function assinaturaVarredura_() {
  return fimLancamentosFormula_() + 'x' + alturaResumo_();
}

/**
 * V4.8: o Resumo deixou de ter fórmulas matriciais (ver calcularLinhasResumo_), então
 * não existe mais teto de varredura para sincronizar. Mantida como no-op porque vários
 * fluxos antigos ainda a chamam.
 */
function sincronizarVarreduraResumo_() {
  return { alterou: false, assinatura: '' };
}

/**
 * Ponto unico por onde passam todas as gravacoes que mexem no volume da base.
 *
 * Alem de expandir a capacidade (comportamento original), V4.7.1 sincroniza aqui
 * o teto de varredura das formulas do Resumo. Antes desta versao havia um vao
 * silencioso: ao expandir de 20 mil para 40 mil linhas, as formulas do Resumo
 * continuavam apontando para 20 mil ate alguem reconstruir os relatorios a mao.
 */
function garantirCapacidadeLancamentos_(minimoOuForcar) {
  return garantirCapacidadeLancamentosBase_(minimoOuForcar);
}

/**
 * Expande a base antes que as fórmulas cheguem ao limite. A expansão é geométrica
 * (20 mil -> 40 mil -> 80 mil...) e regrava somente as fórmulas/formatos necessários.
 */
function garantirCapacidadeLancamentosBase_(minimoOuForcar) {
  const sheet = ss_().getSheetByName(ABAS.LANCAMENTOS);
  const odo = ss_().getSheetByName(ABAS.ODOMETRO);
  if (!sheet) return { expandiu: false, capacidade: limiteLancamentosAtual_() };
  const atual = limiteLancamentosAtual_();
  const usados = quantidadeLancamentosReais_();
  const minimoSolicitado = typeof minimoOuForcar === 'number' && isFinite(minimoOuForcar)
    ? Math.max(0, Math.ceil(minimoOuForcar)) : 0;
  const forcar = minimoOuForcar === true;
  const atingiuLimiar = usados >= Math.floor(atual * LIMIAR_EXPANSAO_LANCAMENTOS_);
  const precisaPorTamanho = minimoSolicitado > atual || usados + 1 > atual;
  if (!forcar && !atingiuLimiar && !precisaPorTamanho) {
    return { expandiu: false, capacidade: atual, usados: usados };
  }

  let alvo = Math.max(usados + 1, minimoSolicitado);
  // Quando atingiu o limiar, expande preventivamente mesmo que ainda caiba na capacidade atual.
  if (forcar || atingiuLimiar) alvo = Math.max(alvo, atual + 1);
  let nova = atual;
  while (nova < alvo) nova *= FATOR_EXPANSAO_LANCAMENTOS_;
  if (nova === atual) return { expandiu: false, capacidade: atual, usados: usados };

  // Só publica a nova capacidade depois que a grade foi realmente ampliada.
  // Se o Sheets atingir algum limite físico, preservamos o parâmetro anterior
  // para não deixar fórmulas apontando para uma faixa que não existe.
  const propsCapacidade = PropertiesService.getDocumentProperties();
  try {
    garantirLinhas_(sheet, nova);
    if (odo) garantirLinhas_(odo, nova);
    propsCapacidade.setProperty(PROP_CAPACIDADE_LANCAMENTOS_, String(nova));

    // Atualiza os intervalos matriciais como operação interna já autorizada pelo fluxo chamador.
    const contextoInternoAnterior = CONTEXTO_SISTEMA_INTERNO_;
    CONTEXTO_SISTEMA_INTERNO_ = true;
    try {
      formatarLancamentos_();
      if (odo) formatarOdometro_();
    } finally {
      CONTEXTO_SISTEMA_INTERNO_ = contextoInternoAnterior;
    }
  } catch (e) {
    propsCapacidade.setProperty(PROP_CAPACIDADE_LANCAMENTOS_, String(atual));
    throw new Error('Não foi possível ampliar a capacidade de ' + atual + ' para ' + nova +
      ' linhas. A capacidade anterior foi preservada. Detalhe: ' + e.message);
  }
  invalidarCacheSaude_();
  registrarLog_('Expandir capacidade', usados + ' / ' + atual + ' -> ' + nova + ' linhas');
  return { expandiu: true, capacidade: nova, usados: usados };
}

// ==========================================================================
// 02_Estrutura.gs
// ==========================================================================

/**
 * Criacao e formatacao das abas de DADOS + intervalos nomeados + validacoes.
 * Tudo aqui e idempotente: pode rodar quantas vezes quiser sem perder dados.
 */

const CENTRO_ADM_CENTRAL_ = 'ADM Central';

/**
 * Normaliza nomes legados de centro de custo.
 * Regra operacional: o antigo código AC passa a ser ADM Central.
 */
function normalizarCentroCusto_(valor) {
  const texto = String(valor == null ? '' : valor).trim();
  const chave = texto.toUpperCase();
  if (chave === 'AC' || chave === CENTRO_ADM_CENTRAL_.toUpperCase()) return CENTRO_ADM_CENTRAL_;
  return texto;
}

/**
 * Migração idempotente do centro legado AC para ADM Central.
 * - garante ADM Central na aba Centros de Custo;
 * - troca AC por ADM Central no cadastro de Veículos;
 * - preserva percentuais existentes se houver uma linha AC antiga;
 * - quando o centro precisa ser criado do zero, usa 0% e Recebe Rateio = NAO
 *   para não alterar silenciosamente o rateio já fechado em 100%.
 */
function migrarCentroAcParaAdmCentral_() {
  exigirExecucaoMutacao_();
  const centrosSheet = aba_(ABAS.CENTROS, true);
  const veiculosSheet = aba_(ABAS.VEICULOS, true);

  // ---- Centros de Custo
  const ultimaCentros = Math.max(centrosSheet.getLastRow(), 1);
  const dadosCentros = ultimaCentros >= 2
    ? centrosSheet.getRange(2, 1, ultimaCentros - 1, 3).getValues()
    : [];

  let linhaAdm = -1;
  let linhaAc = -1;
  dadosCentros.forEach(function (linha, i) {
    const nome = String(linha[0] || '').trim();
    if (nome.toUpperCase() === CENTRO_ADM_CENTRAL_.toUpperCase() && linhaAdm === -1) linhaAdm = i + 2;
    if (nome.toUpperCase() === 'AC' && linhaAc === -1) linhaAc = i + 2;
  });

  if (linhaAdm === -1 && linhaAc !== -1) {
    // Se já existia AC como centro, apenas renomeia e preserva %/Recebe Rateio.
    centrosSheet.getRange(linhaAc, 1).setValue(CENTRO_ADM_CENTRAL_);
    linhaAdm = linhaAc;
  } else if (linhaAdm === -1) {
    // Centro novo: não interfere na soma de rateio existente.
    linhaAdm = centrosSheet.getLastRow() + 1;
    centrosSheet.getRange(linhaAdm, 1, 1, 3)
      .setValues([[CENTRO_ADM_CENTRAL_, 0, 'NAO']]);
  } else {
    // Padroniza a grafia caso já existisse como ADM CENTRAL/adm central.
    centrosSheet.getRange(linhaAdm, 1).setValue(CENTRO_ADM_CENTRAL_);
  }

  // Se por algum motivo coexistirem AC e ADM Central, preserva uma eventual
  // configuração útil da linha AC e remove a linha duplicada por completo.
  if (linhaAc !== -1 && linhaAdm !== linhaAc) {
    const ac = centrosSheet.getRange(linhaAc, 1, 1, 3).getValues()[0];
    const adm = centrosSheet.getRange(linhaAdm, 1, 1, 3).getValues()[0];
    if ((!adm[1] || Number(adm[1]) === 0) && Number(ac[1]) !== 0) adm[1] = ac[1];
    if (!String(adm[2] || '').trim() && String(ac[2] || '').trim()) adm[2] = ac[2];
    adm[0] = CENTRO_ADM_CENTRAL_;
    centrosSheet.getRange(linhaAdm, 1, 1, 3).setValues([adm]);
    centrosSheet.getRange(linhaAc, 1, 1, 3).clearContent();
  }

  // ---- Veículos: AC -> ADM Central
  if (veiculosSheet.getLastRow() >= 2) {
    const intervalo = veiculosSheet.getRange(2, COL_VEIC.CENTRO, veiculosSheet.getLastRow() - 1, 1);
    const valores = intervalo.getValues();
    let alterados = 0;
    valores.forEach(function (linha) {
      const atual = String(linha[0] || '').trim();
      const normalizado = normalizarCentroCusto_(atual);
      if (atual && normalizado !== atual) {
        linha[0] = normalizado;
        alterados++;
      }
    });
    if (alterados) intervalo.setValues(valores);
  }

  CENTROS_EXEC_CACHE_ = null;
  VEICULOS_EXEC_CACHE_ = null;
  invalidarCacheInicio_();
}

const CABECALHOS = {};
CABECALHOS[ABAS.CENTROS] = ['Centro de Custo', '% Rateio Depósito', 'Recebe Rateio'];
CABECALHOS[ABAS.VEICULOS] = ['Placa / ID', 'Descrição', 'Categoria', 'Centro de Custo',
  'Código Patrimônio', 'Depreciação Mensal', 'Emplacamento', 'Seguro', 'Bônus',
  'Preço Comb. Próprio', 'Ativo', 'Aba de Origem', 'IPVA Anual'];
CABECALHOS[ABAS.LANCAMENTOS] = ['Data', 'Placa / ID', 'Tipo de Despesa', 'Litros',
  'Valor R$', 'NF / Documento / OS', 'Observação', 'Centro de Custo',
  'Categoria', 'Período', 'ID Lançamento', 'Natureza da Oficina', 'Detalhe da Peça / Serviço',
  'Fornecedor', 'Tipo de Abastecimento'];
CABECALHOS[ABAS.ODOMETRO] = ['Data', 'Placa / ID', 'KM / Horímetro'];
CABECALHOS[ABAS.FORNECEDORES] = ['Fornecedor', 'CNPJ', 'Ramo', 'Ativo', 'Observação'];
CABECALHOS[ABAS.CARGA_BOMBA] = ['Data', 'NF / Documento', 'Produto', 'Quantidade (L)',
  'Valor Total R$', 'R$ / Litro', 'Observação'];
CABECALHOS[ABAS.HISTORICO] = ['Período', 'Total Geral R$', 'Qtd. Lançamentos', 'Hash Integridade', 'Fechado / Baseline em', 'Responsável / Origem'];
CABECALHOS[ABAS.RATEIO_MENSAL] = ['Competência', 'Centro de Custo', '% Rateio',
  'Recebe Rateio', 'Atualizado em', 'Responsável'];
CABECALHOS[ABAS.ORCAMENTO] = ['Competência', 'Centro de Custo', 'Valor Previsto R$',
  'Atualizado em', 'Responsável'];
CABECALHOS[ABAS.COMPROVANTES] = ['Data do Abastecimento', 'Placa / ID', 'Tipo de Despesa',
  'Litros', 'Valor R$', 'KM no Comprovante', 'NF / Documento', 'Centro de Custo',
  'Competência de Origem', 'Situação', 'Observação', 'Registrado em', 'Registrado por',
  'Incorporado em', 'ID do Lançamento Gerado'];

const LARGURAS = {};
LARGURAS[ABAS.CENTROS] = [180, 140, 120];
LARGURAS[ABAS.VEICULOS] = [110, 200, 170, 150, 130, 140, 130, 100, 80, 140, 70, 130, 110];
LARGURAS[ABAS.LANCAMENTOS] = [95, 110, 190, 90, 110, 145, 220, 150, 150, 90, 155, 190, 300, 190, 145];
LARGURAS[ABAS.ODOMETRO] = [95, 110, 130];
LARGURAS[ABAS.FORNECEDORES] = [230, 160, 190, 70, 300];
LARGURAS[ABAS.CARGA_BOMBA] = [95, 150, 130, 130, 140, 110, 380];
LARGURAS[ABAS.HISTORICO] = [130, 150, 125, 360, 165, 220];
LARGURAS[ABAS.RATEIO_MENSAL] = [110, 200, 110, 120, 150, 220];
LARGURAS[ABAS.ORCAMENTO] = [110, 200, 150, 150, 220];
LARGURAS[ABAS.COMPROVANTES] = [130, 110, 170, 90, 110, 140, 150, 150, 130, 115, 260,
  140, 200, 140, 160];

/** Quantidade mínima de linhas de cada aba de dados (ver LIMITE_* em 00_Config). */
const LINHAS_MINIMAS = {};
LINHAS_MINIMAS[ABAS.CENTROS] = 200;
LINHAS_MINIMAS[ABAS.VEICULOS] = LIMITE_VEICULOS;
LINHAS_MINIMAS[ABAS.LANCAMENTOS] = LIMITE_LANCAMENTOS;
LINHAS_MINIMAS[ABAS.ODOMETRO] = LIMITE_LANCAMENTOS;
LINHAS_MINIMAS[ABAS.HISTORICO] = 200;
LINHAS_MINIMAS[ABAS.FORNECEDORES] = 500;
LINHAS_MINIMAS[ABAS.CARGA_BOMBA] = LIMITE_CARGA_BOMBA;
// 200 centros x 60 competências: cinco anos de histórico sem precisar ampliar.
LINHAS_MINIMAS[ABAS.RATEIO_MENSAL] = 12000;
LINHAS_MINIMAS[ABAS.ORCAMENTO] = 12000;
LINHAS_MINIMAS[ABAS.COMPROVANTES] = 3000;

/** Cria as abas de dados que ainda nao existem e padroniza o visual. */
function montarAbasDeDados_() {
  exigirExecucaoMutacao_();
  montarParametros_();
  garantirAbaPendencias_(true);

  [ABAS.CENTROS, ABAS.VEICULOS, ABAS.LANCAMENTOS, ABAS.ODOMETRO, ABAS.HISTORICO,
   ABAS.FORNECEDORES, ABAS.CARGA_BOMBA, ABAS.RATEIO_MENSAL, ABAS.ORCAMENTO,
   ABAS.COMPROVANTES]
    .forEach(function (nome) {
      const sheet = aba_(nome, true);
      const minimoLinhas = (nome === ABAS.LANCAMENTOS || nome === ABAS.ODOMETRO)
        ? limiteLancamentosAtual_() : LINHAS_MINIMAS[nome];
      garantirLinhas_(sheet, minimoLinhas);
      const cabecalho = CABECALHOS[nome];
      garantirColunas_(sheet, cabecalho.length);
      // Cabeçalhos são estrutura do sistema, não dado operacional; reescrevê-los é seguro
      // e permite evoluir o schema (ex.: metadados de integridade do Histórico).
      sheet.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
      estilizarCabecalho_(sheet.getRange(1, 1, 1, cabecalho.length));
      sheet.setRowHeight(1, 32);
      sheet.setFrozenRows(1);
      LARGURAS[nome].forEach(function (largura, i) {
        sheet.setColumnWidth(i + 1, largura);
      });
    });

  // Corrige o centro legado AC e garante o novo centro ADM Central antes de
  // montar fórmulas, validações e relatórios.
  migrarCentroAcParaAdmCentral_();

  formatarLancamentos_();
  formatarOdometro_();
  formatarVeiculos_();
  formatarCentros_();
  formatarHistorico_();
  formatarFornecedores_();
  formatarCargaBomba_();
  garantirMetadadosHistorico_();
  criarIntervalosNomeados_();
  aplicarValidacoes_();
}

// ==========================================================================
// Fornecedores e Carga na Bomba (V4.7.2)
// ==========================================================================

function formatarFornecedores_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.FORNECEDORES);
  const ultima = sheet.getMaxRows();
  sheet.getRange(2, COL_FORN.CNPJ, ultima - 1, 1).setNumberFormat('@');
  sheet.setFrozenColumns(1);
}

function formatarCargaBomba_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.CARGA_BOMBA);
  const ultima = sheet.getMaxRows();
  sheet.getRange(2, COL_CARGA.DATA, ultima - 1, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, COL_CARGA.DOCUMENTO, ultima - 1, 1).setNumberFormat('@');
  sheet.getRange(2, COL_CARGA.QUANTIDADE, ultima - 1, 1).setNumberFormat('#,##0.000');
  sheet.getRange(2, COL_CARGA.VALOR, ultima - 1, 1).setNumberFormat('R$ #,##0.00');
  sheet.getRange(2, COL_CARGA.PRECO_LITRO, ultima - 1, 1).setNumberFormat('R$ #,##0.0000');

  // R$/litro e derivado: valor / quantidade. Se fosse digitado, os tres campos
  // poderiam nao fechar entre si e ninguem saberia qual acreditar.
  const fim = LIMITE_CARGA_BOMBA;
  const q = 'D2:D' + fim;
  const v = 'E2:E' + fim;
  sheet.getRange(1, COL_CARGA.PRECO_LITRO).setFormula(fx_(
    '={"R$ / Litro";ARRAYFORMULA(IF(' + q + '="","",IF(' + q + '=0,0,' + v + '/' + q + ')))}'));
  sheet.getRange(2, COL_CARGA.PRECO_LITRO, ultima - 1, 1)
    .setBackground(CORES.CINZA).setFontColor('#555555');
  sheet.setFrozenColumns(2);
}

/** Fornecedores em memoria, com cache de execucao (mesmo padrao dos veiculos). */
let FORNECEDORES_EXEC_CACHE_ = null;

function dadosFornecedoresExecucao_() {
  if (FORNECEDORES_EXEC_CACHE_) return FORNECEDORES_EXEC_CACHE_;
  const sheet = ss_().getSheetByName(ABAS.FORNECEDORES);
  if (!sheet || sheet.getLastRow() < 2) {
    FORNECEDORES_EXEC_CACHE_ = [];
    return FORNECEDORES_EXEC_CACHE_;
  }
  FORNECEDORES_EXEC_CACHE_ = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, totalColunas_(COL_FORN)).getValues()
    .filter(function (l) { return String(l[COL_FORN.NOME - 1] || '').trim(); });
  return FORNECEDORES_EXEC_CACHE_;
}

function listaFornecedores_(somenteAtivos) {
  exigirExecucaoLeitura_();
  const vistos = {};
  return dadosFornecedoresExecucao_()
    .filter(function (l) {
      if (somenteAtivos === false) return true;
      return String(l[COL_FORN.ATIVO - 1] || 'SIM').trim().toUpperCase() !== 'NAO';
    })
    .map(function (l) { return String(l[COL_FORN.NOME - 1]).trim(); })
    .filter(function (nome) {
      if (!nome || vistos[nome]) return false;
      vistos[nome] = true;
      return true;
    });
}

/** Leituras da bomba, ordenadas por data. Linha invalida e ignorada, nao quebra. */
function lerCargasBomba_() {
  exigirExecucaoLeitura_();
  const sheet = ss_().getSheetByName(ABAS.CARGA_BOMBA);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, totalColunas_(COL_CARGA)).getValues()
    .map(function (l, i) { l.linha = i + 2; return l; })   // linha da planilha, para editar/excluir
    .filter(function (l) {
      const data = l[COL_CARGA.DATA - 1];
      const qtd = Number(l[COL_CARGA.QUANTIDADE - 1]);
      // V4.8: ajuste de estoque pode ser negativo (sobra/perda apurada na medição).
      const ajuste = ehAjusteEstoque_(l[COL_CARGA.DOCUMENTO - 1]);
      return data instanceof Date && !isNaN(data.getTime()) && (qtd > 0 || (ajuste && qtd !== 0));
    })
    .sort(function (a, b) { return a[COL_CARGA.DATA - 1] - b[COL_CARGA.DATA - 1] || a.linha - b.linha; });
}

/** O tipo de despesa diz de qual produto o abastecimento saiu. */
function produtoDoTipo_(tipo) {
  const t = String(tipo || '');
  if (t.indexOf('Combustivel') === 0) return PRODUTO_DIESEL;
  if (t === 'Arla 32') return PRODUTO_ARLA;
  return null;
}

/**
 * Estado do tanque de um produto ATE uma data: litros e valor em estoque, e o
 * custo medio ponderado movel resultante.
 *
 * Media MOVEL, nao media simples do periodo: cada carga recalcula o custo do
 * saldo inteiro, e cada retirada sai pelo custo vigente NAQUELE momento. Com uma
 * media simples, um abastecimento de janeiro seria valorizado por uma carga de
 * marco — o custo do veiculo mudaria depois do fato consumado.
 *
 * Retiradas sao os abastecimentos internos ja lancados. O lancamento em curso
 * ainda nao esta na base, entao chamar isto antes de gravar devolve exatamente
 * o custo que ele deve receber.
 */
function estadoTanque_(produto, dataReferencia) {
  const alvo = String(produto || PRODUTO_DIESEL).trim().toUpperCase();
  const limite = dataReferencia instanceof Date && !isNaN(dataReferencia.getTime())
    ? dataReferencia : null;

  const movimentos = [];
  lerCargasBomba_().forEach(function (c) {
    if (String(c[COL_CARGA.PRODUTO - 1] || '').trim().toUpperCase() !== alvo) return;
    const data = c[COL_CARGA.DATA - 1];
    if (limite && data > limite) return;
    movimentos.push({
      data: data, entrada: true,
      litros: Number(c[COL_CARGA.QUANTIDADE - 1]) || 0,
      valor: Number(c[COL_CARGA.VALOR - 1]) || 0,
    });
  });

  lerLancamentos_().forEach(function (l) {
    if (produtoDoTipo_(l[L_.TIPO]) !== alvo) return;
    if (tipoAbastecimentoDe_(l[L_.TIPO], l[L_.TIPO_ABASTECIMENTO]) !== ABASTECIMENTO_INTERNO) return;
    const data = l[L_.DATA];
    if (!(data instanceof Date) || isNaN(data.getTime())) return;
    if (limite && data > limite) return;
    const litros = Number(l[L_.LITROS]) || 0;
    if (litros <= 0) return;
    movimentos.push({ data: data, entrada: false, litros: litros, valor: 0 });
  });

  // Empate de data: entrada antes de saida. O contrario faria o tanque ficar
  // negativo no dia em que a carga chega e e consumida na mesma data.
  movimentos.sort(function (a, b) {
    if (a.data - b.data !== 0) return a.data - b.data;
    return (a.entrada === b.entrada) ? 0 : (a.entrada ? -1 : 1);
  });

  let litros = 0;
  let valor = 0;
  let custoMedio = 0;
  let litrosSemLastro = 0;
  movimentos.forEach(function (m) {
    if (m.entrada) {
      litros += m.litros;
      valor += m.valor;
      custoMedio = litros > 0 ? valor / litros : custoMedio;
      return;
    }
    if (litros <= 0) {
      // Saida sem estoque: acontece quando ha abastecimento interno antes de
      // qualquer carga registrada. Nao inventa custo — contabiliza para a
      // conferencia acusar.
      litrosSemLastro += m.litros;
      return;
    }
    const consumidos = Math.min(m.litros, litros);
    litrosSemLastro += m.litros - consumidos;
    valor -= consumidos * custoMedio;
    litros -= consumidos;
    if (litros <= 0.0001) { litros = 0; valor = 0; }
  });

  return {
    produto: alvo,
    litros: litros,
    valor: valor,
    custoMedio: custoMedio,
    litrosSemLastro: litrosSemLastro,
  };
}

/**
 * Tipo de abastecimento efetivo.
 *
 * Campo vazio (base legada, ou importacao) cai no que o TIPO DE DESPESA ja dizia:
 * "Combustivel Proprio" saiu do tanque, "Combustivel Terceiros" veio de posto.
 * Assim o historico inteiro responde a pergunta sem precisar ser reeditado.
 */
function tipoAbastecimentoDe_(tipo, valorGravado) {
  const gravado = String(valorGravado || '').trim();
  if (gravado) {
    return gravado.toUpperCase() === ABASTECIMENTO_INTERNO.toUpperCase()
      ? ABASTECIMENTO_INTERNO : ABASTECIMENTO_EXTERNO;
  }
  const t = String(tipo || '');
  if (TIPOS_DO_TANQUE.indexOf(t) === -1) return '';
  // ARLA nao tem par Proprio/Terceiros para herdar, entao campo vazio cai em
  // Externo: e o lado que NAO mexe no estoque do tanque, e supor consumo que
  // talvez nao tenha existido seria pior do que pedir a informacao.
  if (t === 'Arla 32') return ABASTECIMENTO_EXTERNO;
  return t === 'Combustivel Proprio'
    ? ABASTECIMENTO_INTERNO : ABASTECIMENTO_EXTERNO;
}

function invalidarCacheFornecedores_() {
  FORNECEDORES_EXEC_CACHE_ = null;
}

/** Reescreve a aba Parâmetros num layout fixo, preservando valores já digitados. */
function montarParametros_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.PARAMETROS, true);
  const existentes = {};
  if (sheet.getLastRow() >= LINHA_PARAM_INICIAL) {
    sheet.getRange(LINHA_PARAM_INICIAL, 1, sheet.getLastRow() - LINHA_PARAM_INICIAL + 1, 2)
      .getValues()
      .forEach(function (linha) {
        if (linha[0]) existentes[String(linha[0]).trim()] = linha[1];
      });
  }

  sheet.clear();
  sheet.getRange('A1').setValue('PARÂMETROS DO SISTEMA')
    .setFontSize(14).setFontWeight('bold').setFontColor(CORES.LARANJA);
  sheet.getRange('A2').setValue('Altere apenas a coluna B. O período é recalculado sozinho.  •  Código V' + VERSAO_SISTEMA)
    .setFontStyle('italic').setFontColor('#666666');

  const cabecalho = sheet.getRange(3, 1, 1, 3);
  cabecalho.setValues([['Parâmetro', 'Valor', 'Descrição']]);
  estilizarCabecalho_(cabecalho);

  // V4.7.2: o corte é saneado UMA vez, antes do laço. DIA_INICIO_PERIODO vem antes
  // de DIA_FIM_PERIODO na lista, então derivar um do outro dentro do laço dependeria
  // da ordem dos parâmetros — coisa que ninguém lembra ao inserir um item novo.
  let corteSaneado = Math.floor(Number(
    existentes.hasOwnProperty('DIA_FIM_PERIODO') && existentes['DIA_FIM_PERIODO'] !== ''
      ? existentes['DIA_FIM_PERIODO'] : DIA_CORTE_PADRAO_));
  if (!isFinite(corteSaneado) || corteSaneado < 1 || corteSaneado > 31) {
    corteSaneado = DIA_CORTE_PADRAO_;
  }
  const inicioDerivado = corteSaneado >= DIA_CORTE_MES_CIVIL_ ? 1 : corteSaneado + 1;

  const linhas = PARAMETROS_PADRAO.map(function (p) {
    let valor = existentes.hasOwnProperty(p[0]) && existentes[p[0]] !== '' ? existentes[p[0]] : p[1];

    // Não perpetua um MES_REFERENCIA corrompido (ex.: NaN-NaN) de uma versão anterior.
    // Mantém o valor existente somente se estiver no formato AAAA-MM e representar mês 01..12.
    if (p[0] === 'MES_REFERENCIA') {
      // Em uma instalação nova, a competência nasce automaticamente no período que contém hoje.
      if (!existentes.hasOwnProperty(p[0]) || existentes[p[0]] === '') valor = mesReferenciaSugeridoHoje_();
      try {
        valor = normalizarMesReferencia_(valor);
      } catch (e) {
        valor = mesReferenciaSugeridoHoje_();
      }
    }

    // O corte deixou de ser fixo: o instalador SANEIA em vez de sobrescrever, então
    // um corte legítimo configurado pelo administrador sobrevive à reinstalação.
    if (p[0] === 'DIA_FIM_PERIODO') valor = corteSaneado;
    if (p[0] === 'DIA_INICIO_PERIODO') valor = inicioDerivado;

    // V4.5: autorrecuperação de parâmetros administrativos após restauração/edição manual.
    // Se um valor incompatível entrar por um backup antigo, o instalador corrige sem exigir código.
    if (p[0] === 'EMPRESA') {
      valor = String(valor || '').trim().slice(0, 150) || String(p[1]);
    }
    if (p[0] === 'CUSTO_HORA_MOTORISTA') {
      const custo = Number(String(valor).replace(',', '.'));
      valor = isFinite(custo) && custo >= 0 && custo <= 1000000 ? custo : p[1];
    }
    if (p[0] === 'BASE_RATEIO') {
      valor = String(valor || '').trim().slice(0, 500) || String(p[1]);
    }
    if (p[0] === 'DOMINIOS_LOGIN') {
      const dominios = normalizarDominiosLogin_(valor);
      valor = dominios.dominios.length && !dominios.invalidos.length ? dominios.valor : String(p[1]);
    }

    return [p[0], valor, p[2]];
  });
  sheet.getRange(LINHA_PARAM_INICIAL, 1, linhas.length, 3).setValues(linhas);
  // Impede o Sheets de converter 2026-07 automaticamente em uma data.
  sheet.getRange(LINHA_PARAM_INICIAL, 2).setNumberFormat('@').setValue(String(linhas[0][1]));
  sheet.getRange(LINHA_PARAM_INICIAL, 2, linhas.length, 1)
    .setBackground(CORES.LARANJA_CLARO)
    .setFontWeight('bold')
    .setHorizontalAlignment('left');

  const linhaCalc = LINHA_PARAM_INICIAL + linhas.length + 1;
  sheet.getRange(linhaCalc, 1).setValue('PERÍODO CALCULADO')
    .setFontWeight('bold').setFontColor(CORES.LARANJA);

  const celMes = 'B' + LINHA_PARAM_INICIAL;
  const celDiaIni = 'B' + (LINHA_PARAM_INICIAL + 3);
  const celDiaFim = 'B' + (LINHA_PARAM_INICIAL + 4);

  // V4.8: o período usa o dia de corte (B8), não mais 26/25 fixos. Com o corte
  // configurável, as fórmulas fixas davam um PERIODO_INI/FIM diferente do que o script
  // usava — e todo relatório por fórmula filtrava outro intervalo.
  const fPeriodo = formulasPeriodoParametros_();
  sheet.getRange(linhaCalc + 1, 1).setValue('Início do período');
  sheet.getRange(linhaCalc + 1, 2).setFormula(fx_(fPeriodo.inicio));
  sheet.getRange(linhaCalc + 2, 1).setValue('Fim do período');
  sheet.getRange(linhaCalc + 2, 2).setFormula(fx_(fPeriodo.fim));
  sheet.getRange(linhaCalc + 3, 1).setValue('Lançamentos no período');
  // Faixa fechada: A:A inteiro varria a grade toda (20 mil+ linhas) a cada edição.
  const fimLanc = limiteLancamentosAtual_();
  sheet.getRange(linhaCalc + 3, 2).setFormula(fx_(
    '=COUNTIFS(' + ref_(ABAS.LANCAMENTOS) + '!A2:A' + fimLanc + ',">="&B' + (linhaCalc + 1) +
    ',' + ref_(ABAS.LANCAMENTOS) + '!A2:A' + fimLanc + ',"<"&(B' + (linhaCalc + 2) + '+1))'));
  // (V4.8: "< fim+1" com número inteiro. O "+0,99999" anterior foi escrito com ponto
  // decimal e virava #ERROR! em planilha pt-BR, onde o decimal é vírgula.)
  sheet.getRange(linhaCalc + 4, 1).setValue('Soma dos % de rateio');
  sheet.getRange(linhaCalc + 4, 2).setFormula(fx_(
    '=SUM(' + ref_(ABAS.CENTROS) + '!B2:B)'));

  sheet.getRange(linhaCalc + 1, 2, 2, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(linhaCalc + 4, 2).setNumberFormat('0.00%');
  sheet.getRange(linhaCalc + 1, 2, 4, 1)
    .setBackground(CORES.CINZA).setFontWeight('bold');

  // alerta visual quando os percentuais nao fecham 100%
  const regra = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(fx_('=ROUND(B' + (linhaCalc + 4) + ',4)<>1'))
    .setBackground(CORES.VERMELHO)
    .setRanges([sheet.getRange(linhaCalc + 4, 2)])
    .build();
  sheet.setConditionalFormatRules([regra]);

  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 190);
  sheet.setColumnWidth(3, 420);
  sheet.setHiddenGridlines(true);

  PropertiesService.getDocumentProperties()
    .setProperty('LINHA_PERIODO_INI', String(linhaCalc + 1));
  // Se houver período com datas livres, as células recebem as datas escolhidas.
  aplicarPeriodoNaPlanilha_();
}

/** Fórmulas padrão (por dia de corte) de início/fim do período na aba Parâmetros. */
function formulasPeriodoParametros_() {
  const celMes = 'B' + LINHA_PARAM_INICIAL;
  const celDiaFim = 'B' + (LINHA_PARAM_INICIAL + 4);
  const anoMes = 'VALUE(LEFT(' + celMes + ',4)),VALUE(MID(' + celMes + ',6,2))';
  return {
    inicio: '=IF(' + celDiaFim + '>=' + DIA_CORTE_MES_CIVIL_ + ',DATE(' + anoMes + ',1),' +
      'DATE(VALUE(LEFT(' + celMes + ',4)),VALUE(MID(' + celMes + ',6,2))-1,' + celDiaFim + '+1))',
    fim: '=IF(' + celDiaFim + '>=' + DIA_CORTE_MES_CIVIL_ + ',' +
      'DATE(VALUE(LEFT(' + celMes + ',4)),VALUE(MID(' + celMes + ',6,2))+1,0),' +
      'DATE(' + anoMes + ',' + celDiaFim + '))',
  };
}

/**
 * Sincroniza as células PERIODO_INI/PERIODO_FIM (usadas pelas fórmulas da planilha:
 * títulos, Consulta, Relatórios) com o período em vigor: datas livres, quando houver,
 * ou as fórmulas padrão do dia de corte.
 */
function aplicarPeriodoNaPlanilha_() {
  const sheet = ss_().getSheetByName(ABAS.PARAMETROS);
  const linhaIni = Number(PropertiesService.getDocumentProperties().getProperty('LINHA_PERIODO_INI'));
  if (!sheet || !linhaIni) return;
  let mes = '';
  try { mes = normalizarMesReferencia_(sheet.getRange(LINHA_PARAM_INICIAL, 2).getValue()); } catch (e) { mes = ''; }
  const livre = periodoLivreAtivo_(mes);
  const celIni = sheet.getRange(linhaIni, 2);
  const celFim = sheet.getRange(linhaIni + 1, 2);
  if (livre) {
    celIni.setValue(new Date(livre.inicio.getFullYear(), livre.inicio.getMonth(), livre.inicio.getDate()));
    celFim.setValue(new Date(livre.fim.getFullYear(), livre.fim.getMonth(), livre.fim.getDate()));
    sheet.getRange(linhaIni, 3).setValue('DATAS LIVRES — para mudar, digite novas datas em B' + linhaIni +
      '/B' + (linhaIni + 1) + '; para voltar à regra do dia de corte, altere DIA_FIM_PERIODO');
  } else {
    const f = formulasPeriodoParametros_();
    celIni.setFormula(fx_(f.inicio));
    celFim.setFormula(fx_(f.fim));
    sheet.getRange(linhaIni, 3).setValue('');
  }
  celIni.setNumberFormat('dd/mm/yyyy');
  celFim.setNumberFormat('dd/mm/yyyy');
  // Contagem de lançamentos do período (regravada aqui para corrigir planilhas que
  // ficaram com a fórmula antiga "+0.99999", que dava #ERROR! em pt-BR).
  const fimLanc = limiteLancamentosAtual_();
  sheet.getRange(linhaIni + 2, 2).setFormula(fx_(
    '=COUNTIFS(' + ref_(ABAS.LANCAMENTOS) + '!A2:A' + fimLanc + ',">="&B' + linhaIni +
    ',' + ref_(ABAS.LANCAMENTOS) + '!A2:A' + fimLanc + ',"<"&(B' + (linhaIni + 1) + '+1))'))
    .setNumberFormat('#,##0');
  sheet.getRange('A2').setValue('Altere apenas a coluna B. O período é recalculado sozinho.  •  Código V' + VERSAO_SISTEMA);
}

function criarIntervalosNomeados_() {
  exigirExecucaoMutacao_();
  const planilha = ss_();
  const sheet = aba_(ABAS.PARAMETROS);
  const linhaIni = Number(PropertiesService.getDocumentProperties().getProperty('LINHA_PERIODO_INI'));

  const nomeados = {
    PERIODO_INI: sheet.getRange(linhaIni, 2),
    PERIODO_FIM: sheet.getRange(linhaIni + 1, 2),
    PARAM_MES: sheet.getRange(LINHA_PARAM_INICIAL, 2),
    PARAM_EMPRESA: sheet.getRange(LINHA_PARAM_INICIAL + 1, 2),
    PARAM_HORA_MOTORISTA: sheet.getRange(LINHA_PARAM_INICIAL + 2, 2),
    PARAM_DIA_INICIO: sheet.getRange(LINHA_PARAM_INICIAL + 3, 2),
    PARAM_DIA_FIM: sheet.getRange(LINHA_PARAM_INICIAL + 4, 2),
    PARAM_BASE_RATEIO: sheet.getRange(LINHA_PARAM_INICIAL + 5, 2),
  };

  planilha.getNamedRanges().forEach(function (nr) {
    if (nomeados.hasOwnProperty(nr.getName())) nr.remove();
  });
  Object.keys(nomeados).forEach(function (nome) {
    planilha.setNamedRange(nome, nomeados[nome]);
  });
}

function novoIdLancamento_() {
  const data = Utilities.formatDate(new Date(), timezone_(), 'yyyyMMdd');
  return 'LAN-' + data + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

/** Garante IDs para o histórico sem alterar os dados financeiros. */
function garantirIdsLancamentos_() {
  const sheet = ss_().getSheetByName(ABAS.LANCAMENTOS);
  if (!sheet || quantidadeLancamentosReais_() < 1) return 0;
  garantirColunas_(sheet, COL_LANC.ID);
  const n = quantidadeLancamentosReais_();
  const placas = sheet.getRange(2, COL_LANC.PLACA, n, 1).getDisplayValues();
  const ids = sheet.getRange(2, COL_LANC.ID, n, 1).getDisplayValues();
  let mudou = false, total = 0;
  for (let i = 0; i < n; i++) {
    if (!String(placas[i][0] || '').trim() || String(ids[i][0] || '').trim()) continue;
    ids[i][0] = novoIdLancamento_();
    mudou = true; total++;
  }
  if (mudou) sheet.getRange(2, COL_LANC.ID, n, 1).setValues(ids).setNumberFormat('@');
  return total;
}

/** Assinatura conservadora: só bloqueia duplicidade quando existe Documento. */
function assinaturaLancamento_(data, placa, tipo, valor, documento) {
  const doc = String(documento || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!doc) return '';
  const dataChave = data instanceof Date && !isNaN(data.getTime())
    ? Utilities.formatDate(data, timezone_(), 'yyyy-MM-dd') : String(data || '');
  return [dataChave, normalizaPlaca_(placa), String(tipo || '').trim().toUpperCase(),
    Number(valor || 0).toFixed(2), doc].join('|');
}

function localizarDuplicidadeLancamento_(data, placa, tipo, valor, documento) {
  const alvo = assinaturaLancamento_(data, placa, tipo, valor, documento);
  if (!alvo) return null;
  const sheet = ss_().getSheetByName(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (!sheet || n < 1) return null;

  // O documento costuma ser único. Primeiro lemos apenas a coluna G (1 célula por linha),
  // em vez de trazer as 12 colunas da base em todo lançamento. Só buscamos a linha completa
  // quando o documento normalizado coincide — importante quando a base crescer.
  const docAlvo = String(documento || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const documentos = sheet.getRange(2, COL_LANC.DOCUMENTO, n, 1).getDisplayValues();
  for (let i = documentos.length - 1; i >= 0; i--) {
    const docLinha = String(documentos[i][0] || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (docLinha !== docAlvo) continue;
    const numeroLinha = i + 2;
    const l = sheet.getRange(numeroLinha, 1, 1, COL_LANC.ID).getValues()[0];
    // Indices nomeados: l[6] era o Documento no layout ate a V4.7 e virou a Observacao
    // na V4.7.2. Cru, isso comparava a assinatura contra o campo errado e a deteccao
    // de duplicidade parava de achar duplicata nenhuma — em silencio.
    if (assinaturaLancamento_(l[L_.DATA], l[L_.PLACA], l[L_.TIPO], l[L_.VALOR],
        l[L_.DOCUMENTO]) === alvo) {
      return {
        linha: numeroLinha,
        id: String(l[L_.ID] || ''),
        documento: String(l[L_.DOCUMENTO] || ''),
      };
    }
  }
  return null;
}

function classificacaoVeiculoAtual_(placaOuPatrimonio) {
  const resolvido = resolverVeiculo_(placaOuPatrimonio, false);
  if (!resolvido.ok) return { centro: '⚠ sem cadastro', categoria: '⚠ sem cadastro' };
  return {
    centro: normalizarCentroCusto_(resolvido.veiculo.centro) || '⚠ sem cadastro',
    categoria: String(resolvido.veiculo.categoria || '').trim() || '⚠ sem cadastro'
  };
}

/**
 * Centro/Categoria deixam de ser lookup vivo e viram snapshots do lançamento.
 * Na migração, os valores já exibidos pela versão anterior são preservados como baseline.
 */
function garantirSnapshotsClassificacaoLancamentos_() {
  const sheet = ss_().getSheetByName(ABAS.LANCAMENTOS);
  if (!sheet) return 0;
  const n = quantidadeLancamentosReais_();
  const faixaCab = sheet.getRange(1, COL_LANC.CENTRO, 1, 2);
  const formulasCab = faixaCab.getFormulas()[0];
  const migrandoFormulaAntiga = formulasCab.some(function(f){ return !!String(f || '').trim(); });
  const existentes = n > 0 ? sheet.getRange(2, COL_LANC.CENTRO, n, 2).getDisplayValues() : [];
  const placas = n > 0 ? sheet.getRange(2, COL_LANC.PLACA, n, 1).getDisplayValues() : [];
  faixaCab.setValues([['Centro de Custo', 'Categoria']]);
  if (!n) return 0;
  let alterados = 0;
  for (let i = 0; i < n; i++) {
    if (!String(placas[i][0] || '').trim()) continue;
    const atualCentro = String(existentes[i][0] || '').trim();
    const atualCategoria = String(existentes[i][1] || '').trim();
    const precisaCentro = !atualCentro || atualCentro === '⚠ sem cadastro' || atualCentro === '#REF!';
    const precisaCategoria = !atualCategoria || atualCategoria === '⚠ sem cadastro' || atualCategoria === '#REF!';
    if (!precisaCentro && !precisaCategoria) continue;
    const c = classificacaoVeiculoAtual_(placas[i][0]);
    if (precisaCentro) existentes[i][0] = c.centro;
    if (precisaCategoria) existentes[i][1] = c.categoria;
    alterados++;
  }
  if (migrandoFormulaAntiga || alterados) sheet.getRange(2, COL_LANC.CENTRO, n, 2).setValues(existentes);
  return alterados;
}

function preencherClassificacaoLinhaLancamento_(sheet, linha, placa) {
  const c = classificacaoVeiculoAtual_(placa);
  sheet.getRange(linha, COL_LANC.CENTRO, 1, 2).setValues([[c.centro, c.categoria]]);
  return c;
}

/**
 * Migração única V4.7: registros de oficina criados antes do novo detalhamento recebem
 * uma marca explícita de legado. Assim a atualização não cria pendências retroativas nem
 * inventa peça/serviço que não existia na origem.
 */
function garantirBaselineDetalhesOficina_() {
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty(PROP_BASELINE_OFICINA_V47_) === 'SIM') return 0;
  const sheet = ss_().getSheetByName(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (!sheet || n < 1) {
    props.setProperty(PROP_BASELINE_OFICINA_V47_, 'SIM');
    return 0;
  }
  garantirColunas_(sheet, TOTAL_COL_LANC);
  const tipos = sheet.getRange(2, COL_LANC.TIPO, n, 1).getDisplayValues();
  const detalhes = sheet.getRange(2, COL_LANC.NATUREZA_OFICINA, n, 2).getDisplayValues();
  let alterados = 0;
  for (let i = 0; i < n; i++) {
    const tipo = String(tipos[i][0] || '').trim();
    if (TIPOS_OFICINA.indexOf(tipo) === -1) continue;
    const nat = String(detalhes[i][0] || '').trim();
    const det = String(detalhes[i][1] || '').trim();
    if (nat || det) continue;
    detalhes[i][0] = NATUREZA_OFICINA_LEGADO_;
    detalhes[i][1] = 'Registro anterior à V4.7; peça/serviço não estava discriminado na versão de origem.';
    alterados++;
  }
  if (alterados) sheet.getRange(2, COL_LANC.NATUREZA_OFICINA, n, 2).setValues(detalhes);
  props.setProperty(PROP_BASELINE_OFICINA_V47_, 'SIM');
  return alterados;
}

/**
 * V4.8: conserta linhas coladas com as colunas deslocadas uma casa para a direita
 * (layout antigo, com a coluna Setor). Sintomas nessas linhas: um valor digitado na
 * coluna J (Período), que derruba a fórmula da coluna inteira com #REF!, e um nome de
 * CENTRO gravado no lugar da CATEGORIA.
 *
 * Não adivinha o significado do que estava deslocado: preserva o texto na Observação
 * (com a marca "colagem deslocada"), refaz Centro/Categoria pelo cadastro do veículo e
 * limpa J. Valor, data, placa, tipo e documento não são tocados.
 */
function repararLancamentosDeslocados_(sheet) {
  const n = quantidadeLancamentosReais_();
  if (n < 1) return 0;
  // Sem a fórmula em J1, o que sobra em J2:J é só o que foi digitado/colado.
  sheet.getRange(1, COL_LANC.PERIODO).setValue('Período');
  SpreadsheetApp.flush();
  const dados = sheet.getRange(2, 1, n, TOTAL_COL_LANC).getValues();
  const centros = {};
  dadosCentrosExecucao_().forEach(function (c) {
    const nome = normalizarCentroCusto_(c[0]);
    if (nome) centros[nome.toUpperCase()] = true;
  });
  const categorias = {};
  CATEGORIAS_VEICULO_PADRAO.concat(dadosVeiculosExecucao_().map(function (v) {
    return String(v[COL_VEIC.CATEGORIA - 1] || '');
  })).forEach(function (c) { if (String(c).trim()) categorias[String(c).trim().toUpperCase()] = true; });

  let corrigidas = 0;
  dados.forEach(function (l, i) {
    if (!String(l[L_.PLACA] || '').trim()) return;
    const literalJ = String(l[L_.PERIODO] == null ? '' : l[L_.PERIODO]).trim();
    const cat = String(l[L_.CATEGORIA] || '').trim().toUpperCase();
    const categoriaEhCentro = cat && centros[cat] && !categorias[cat];
    if (!literalJ && !categoriaEhCentro) return;
    const linha = i + 2;
    const deslocado = [l[L_.OBSERVACAO], l[L_.CENTRO]]
      .map(function (x) { return String(x == null ? '' : x).trim(); })
      .filter(function (x) { return x; });
    const c = classificacaoVeiculoAtual_(l[L_.PLACA]);
    sheet.getRange(linha, COL_LANC.OBSERVACAO).setValue(
      deslocado.length ? ('Colagem deslocada corrigida — ' + deslocado.join(' | ')).slice(0, 1000) : '');
    sheet.getRange(linha, COL_LANC.CENTRO, 1, 2).setValues([[c.centro, c.categoria]]);
    sheet.getRange(linha, COL_LANC.PERIODO).clearContent();
    corrigidas++;
  });
  if (corrigidas) registrarLog_('Reparar lançamentos deslocados', corrigidas + ' linha(s) realinhada(s); coluna Período restaurada');
  return corrigidas;
}

/**
 * V4.8: renomeações pedidas pela operação.
 *   - natureza de oficina "Peça + serviço" passa a ser "Serviço" (base inteira: a
 *     natureza não entra no lacre de integridade dos meses fechados);
 *   - categoria de veículo "Carro Novo" passa a ser "Carro" (cadastro e lançamentos do
 *     período aberto; a categoria de meses fechados faz parte do lacre e não muda).
 */
function migrarNomesV48_() {
  let total = 0;
  const lanc = ss_().getSheetByName(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (lanc && n > 0) {
    const nat = lanc.getRange(2, COL_LANC.NATUREZA_OFICINA, n, 1);
    const vNat = nat.getValues();
    let mudouNat = false;
    vNat.forEach(function (l) { if (String(l[0]).trim() === 'Peça + serviço') { l[0] = 'Serviço'; mudouNat = true; total++; } });
    if (mudouNat) nat.setValues(vNat);
    let inicio = null;
    try { inicio = periodoAtual_().inicio; } catch (e) { inicio = null; }
    if (inicio) {
      const datas = lanc.getRange(2, COL_LANC.DATA, n, 1).getValues();
      const cat = lanc.getRange(2, COL_LANC.CATEGORIA, n, 1);
      const vCat = cat.getValues();
      let mudouCat = false;
      vCat.forEach(function (l, i) {
        const d = datas[i][0];
        if (String(l[0]).trim() === 'Carro Novo' && d instanceof Date && d >= inicio) { l[0] = 'Carro'; mudouCat = true; total++; }
      });
      if (mudouCat) cat.setValues(vCat);
    }
  }
  const veic = ss_().getSheetByName(ABAS.VEICULOS);
  if (veic && veic.getLastRow() > 1) {
    const faixa = veic.getRange(2, COL_VEIC.CATEGORIA, veic.getLastRow() - 1, 1);
    const v = faixa.getValues();
    let mudou = false;
    v.forEach(function (l) { if (String(l[0]).trim() === 'Carro Novo') { l[0] = 'Carro'; mudou = true; total++; } });
    if (mudou) { faixa.setValues(v); VEICULOS_EXEC_CACHE_ = null; }
  }
  if (total) registrarLog_('Renomear nomes V4.8', total + ' célula(s): "Peça + serviço" → "Serviço", categoria "Carro Novo" → "Carro"');
  return total;
}

function formatarLancamentos_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.LANCAMENTOS);
  const ultima = sheet.getMaxRows();
  repararLancamentosDeslocados_(sheet);
  migrarNomesV48_();
  sheet.getRange(2, COL_LANC.DATA, ultima - 1, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, COL_LANC.LITROS, ultima - 1, 1).setNumberFormat('#,##0.000');
  sheet.getRange(2, COL_LANC.VALOR, ultima - 1, 1).setNumberFormat('R$ #,##0.00');

  // Centro/Categoria são snapshots imutáveis do momento do lançamento.
  garantirSnapshotsClassificacaoLancamentos_();

  // Período de competência: dia de corte configurável (DIA_FIM_PERIODO).
  // Continua sem EDATE, que sobre faixa matricial pode propagar #REF! na coluna toda.
  //
  // A versão anterior deslocava 7 dias quando DAY >= 26. Esse truque não generaliza:
  // com corte 1, o dia 31 somado a 31 cairia DOIS meses à frente. DATE() com o mês
  // incrementado resolve na aritmética de calendário — DATE(a,13,1) já vira janeiro
  // do ano seguinte sozinho — e continua indiferente a idioma.
  //
  // Em mês civil (corte >= 28) o corte vira 31 na fórmula, e aí nada desloca:
  // a competência é o próprio mês da data.
  const corteCompetencia = ehMesCivil_() ? 31 : diaCortePeriodo_();
  const faixaData = 'A2:A' + limiteLancamentosAtual_();
  const dataCompetencia = 'DATE(YEAR(' + faixaData + '),MONTH(' + faixaData + ')+' +
    'IF(DAY(' + faixaData + ')>' + corteCompetencia + ',1,0),1)';
  sheet.getRange(1, COL_LANC.PERIODO).setFormula(fx_(
    '={"Período";ARRAYFORMULA(IF(' + faixaData + '="","",' +
    mesIso_(dataCompetencia) + '))}'));

  // ID imutável de negócio. Linhas antigas recebem ID uma única vez na atualização.
  sheet.getRange(1, COL_LANC.ID).setValue('ID Lançamento');
  garantirIdsLancamentos_();
  garantirBaselineDetalhesOficina_();

  estilizarCabecalho_(sheet.getRange(1, COL_LANC.CENTRO, 1, 4));
  sheet.getRange(2, COL_LANC.CENTRO, ultima - 1, 3)
    .setBackground(CORES.CINZA).setFontColor('#555555');
  sheet.getRange(2, COL_LANC.ID, ultima - 1, 1)
    .setBackground('#FAF9F8').setFontColor('#706B6C').setNumberFormat('@');
  sheet.getRange(2, COL_LANC.NATUREZA_OFICINA, ultima - 1, 2)
    .setBackground('#FFF9F4').setFontColor('#4A4546');
  sheet.getRange(1, COL_LANC.NATUREZA_OFICINA).setNote(
    'Preencher nos tipos Oficina Despesa / Oficina Ativo / Oficina Deb Loja.');
  sheet.getRange(1, COL_LANC.DETALHE_OFICINA).setNote(
    'Descreva a peça ou serviço: ex. pastilha de freio dianteira, reparo alternador, troca de embreagem.');
  // I:L são campos técnicos (classificação congelada, competência e ID). Ficam ocultos
  // para reduzir edição acidental; ADMIN pode alternar a visualização pelo menu.
  try { sheet.hideColumns(COL_LANC.CENTRO, COL_LANC.ID - COL_LANC.CENTRO + 1); } catch (e) {}

  const regras = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(fx_('=AND($B2<>"",$I2="⚠ sem cadastro")'))
      .setBackground(CORES.VERMELHO)
      .setRanges([sheet.getRange(2, 1, ultima - 1, COL_LANC.PERIODO)])
      .build(),
    // V4.8 (velocidade): a regra que pintava datas fora do período usava INDIRECT em
    // todas as linhas — função volátil, recalculada a cada edição em qualquer aba.
    // Removida: os formulários já recusam data fora do período e a Validação acusa.
  ];
  sheet.setConditionalFormatRules(regras);
  sheet.setFrozenColumns(2);
}

function formatarOdometro_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.ODOMETRO);
  const ultima = sheet.getMaxRows();
  sheet.getRange(2, 1, ultima - 1, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, 3, ultima - 1, 1).setNumberFormat('#,##0');
}

/**
 * V4.8: células de texto do cadastro com fórmula quebrada (ex.: "=#REF!", sobra de cópia
 * de outra planilha) viram um aviso legível. Senão o erro se espalha para o Resumo, o
 * Dashboard e os Relatórios, e o "Verificar fórmulas" acusa erro onde não há fórmula.
 */
function corrigirCelulasComErroVeiculos_(sheet) {
  const n = sheet.getLastRow() - 1;
  if (n < 1) return 0;
  let corrigidas = 0;
  [[COL_VEIC.DESCRICAO, '⚠ DESCRIÇÃO A CORRIGIR'], [COL_VEIC.CATEGORIA, '⚠ CATEGORIA A CORRIGIR'],
   [COL_VEIC.CENTRO, '⚠ CENTRO A CORRIGIR'], [COL_VEIC.CODIGO, '']].forEach(function (c) {
    const faixa = sheet.getRange(2, c[0], n, 1);
    const valores = faixa.getValues();
    const formulas = faixa.getFormulas();
    let mudou = false;
    valores.forEach(function (l, i) {
      const erro = ERROS_DE_CELULA.indexOf(String(l[0]).trim()) !== -1 || /#REF!/i.test(formulas[i][0]);
      if (erro) { l[0] = c[1]; mudou = true; corrigidas++; }
      else if (formulas[i][0]) { /* fórmula válida: mantém o valor calculado */ }
    });
    if (mudou) faixa.setValues(valores);
  });
  if (corrigidas) registrarLog_('Cadastro de veículos', corrigidas + ' célula(s) com erro (#REF!) marcadas para correção');
  return corrigidas;
}

function formatarVeiculos_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.VEICULOS);
  corrigirCelulasComErroVeiculos_(sheet);
  VEICULOS_EXEC_CACHE_ = null;
  const ultima = sheet.getMaxRows();
  [COL_VEIC.DEPRECIACAO, COL_VEIC.EMPLACAMENTO, COL_VEIC.SEGURO, COL_VEIC.IPVA].forEach(function (c) {
    sheet.getRange(2, c, ultima - 1, 1).setNumberFormat('R$ #,##0.00');
  });
  sheet.getRange(2, COL_VEIC.PRECO_COMBUSTIVEL, ultima - 1, 1).setNumberFormat('R$ #,##0.000');
  sheet.setFrozenColumns(1);

  const regra = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(fx_('=$K2="NAO"'))
    .setBackground('#efefef')
    .setFontColor('#999999')
    .setRanges([sheet.getRange(2, 1, ultima - 1, COL_VEIC.ABA_ORIGEM)])
    .build();
  sheet.setConditionalFormatRules([regra]);
}

function formatarCentros_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.CENTROS);
  const ultima = sheet.getMaxRows();
  sheet.getRange(2, 2, ultima - 1, 1).setNumberFormat('0.000%');
}

function formatarHistorico_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.HISTORICO);
  // V4.8: remove linhas duplicadas da mesma competência (ex.: "Wed Jul 01 2026 ..."
  // gravada como texto ao lado da linha 2026-07 correta). Fica a que tem lacre (hash).
  if (sheet.getLastRow() >= 3) {
    const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    const melhor = {};
    dados.forEach(function (l, i) {
      let mes = '';
      try { mes = normalizarMesReferencia_(l[0]); } catch (e) { return; }
      const pontos = (String(l[3] || '').trim() ? 2 : 0) + (l[0] instanceof Date ? 1 : 0);
      if (!melhor[mes] || pontos > melhor[mes].pontos) melhor[mes] = { i: i, pontos: pontos };
    });
    const apagar = [];
    dados.forEach(function (l, i) {
      let mes = '';
      try { mes = normalizarMesReferencia_(l[0]); } catch (e) { return; }
      if (melhor[mes] && melhor[mes].i !== i) apagar.push(i + 2);
    });
    apagar.reverse().forEach(function (linha) { sheet.deleteRow(linha); });
    if (apagar.length) registrarLog_('Histórico', apagar.length + ' linha(s) duplicada(s) removida(s)');
  }
  const ultima = sheet.getMaxRows();
  sheet.getRange(2, 2, ultima - 1, 1).setNumberFormat('R$ #,##0.00');
  sheet.getRange(2, 3, ultima - 1, 1).setNumberFormat('#,##0');
  sheet.getRange(2, 4, ultima - 1, 1).setNumberFormat('@');
  sheet.getRange(2, 5, ultima - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
}

/** Dropdowns de placa, tipo de despesa e centro de custo. */
function aplicarValidacoes_() {
  exigirExecucaoMutacao_();
  const veiculos = aba_(ABAS.VEICULOS);
  const centros = aba_(ABAS.CENTROS);
  const lancamentos = aba_(ABAS.LANCAMENTOS);
  const odometro = aba_(ABAS.ODOMETRO);

  const regraPlaca = SpreadsheetApp.newDataValidation()
    .requireValueInRange(veiculos.getRange('A2:A'), true)
    .setAllowInvalid(true)
    .setHelpText('Selecione uma placa/ID. Nos formulários do sistema também é possível informar o Código Patrimônio.')
    .build();

  const regraTipo = SpreadsheetApp.newDataValidation()
    .requireValueInList(TIPOS_DESPESA, true)
    .setAllowInvalid(false)
    .setHelpText('Escolha um dos tipos de despesa do sistema.')
    .build();

  const regraNaturezaOficina = SpreadsheetApp.newDataValidation()
    .requireValueInList(NATUREZAS_OFICINA.concat([NATUREZA_OFICINA_LEGADO_]), true)
    .setAllowInvalid(false)
    .setHelpText('Obrigatório nos lançamentos de Oficina. Escolha a natureza principal do gasto.')
    .build();

  const regraCentro = SpreadsheetApp.newDataValidation()
    .requireValueInRange(centros.getRange('A2:A'), true)
    .setAllowInvalid(true)
    .build();

  const regraSimNao = SpreadsheetApp.newDataValidation()
    .requireValueInList(['SIM', 'NAO'], true)
    .setAllowInvalid(false)
    .build();

  lancamentos.getRange(2, COL_LANC.PLACA, lancamentos.getMaxRows() - 1, 1).setDataValidation(regraPlaca);
  lancamentos.getRange(2, COL_LANC.TIPO, lancamentos.getMaxRows() - 1, 1).setDataValidation(regraTipo);
  lancamentos.getRange(2, COL_LANC.NATUREZA_OFICINA, lancamentos.getMaxRows() - 1, 1)
    .setDataValidation(regraNaturezaOficina);
  odometro.getRange(2, 2, odometro.getMaxRows() - 1, 1).setDataValidation(regraPlaca);
  veiculos.getRange(2, COL_VEIC.CENTRO, veiculos.getMaxRows() - 1, 1).setDataValidation(regraCentro);
  veiculos.getRange(2, COL_VEIC.ATIVO, veiculos.getMaxRows() - 1, 1).setDataValidation(regraSimNao);
  // V4.8: dropdown de categoria (inclui "Carro Novo"); aceita outra categoria digitada.
  veiculos.getRange(2, COL_VEIC.CATEGORIA, veiculos.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(listaCategorias_(), true)
      .setAllowInvalid(true).setHelpText('Escolha a categoria do veículo (ex.: Leve, Carro Novo, Truck).').build());
  centros.getRange(2, 3, centros.getMaxRows() - 1, 1).setDataValidation(regraSimNao);

  // ----- V4.7.2: fornecedores, tipo de abastecimento e carga na bomba
  const fornecedores = ss_().getSheetByName(ABAS.FORNECEDORES);
  const bomba = ss_().getSheetByName(ABAS.CARGA_BOMBA);

  if (fornecedores) {
    const regraFornecedor = SpreadsheetApp.newDataValidation()
      .requireValueInRange(fornecedores.getRange('A2:A'), true)
      .setAllowInvalid(true)
      .setHelpText('Escolha um fornecedor cadastrado na aba ' + ABAS.FORNECEDORES + '.')
      .build();
    lancamentos.getRange(2, COL_LANC.FORNECEDOR, lancamentos.getMaxRows() - 1, 1)
      .setDataValidation(regraFornecedor);
    fornecedores.getRange(2, COL_FORN.TIPO, fornecedores.getMaxRows() - 1, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(TIPOS_FORNECEDOR, true).setAllowInvalid(true).build());
    fornecedores.getRange(2, COL_FORN.ATIVO, fornecedores.getMaxRows() - 1, 1)
      .setDataValidation(regraSimNao);
  }

  lancamentos.getRange(2, COL_LANC.TIPO_ABASTECIMENTO, lancamentos.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(TIPOS_ABASTECIMENTO, true).setAllowInvalid(true)
      .setHelpText('Interno = tanque próprio (custo vem da bomba). Externo = posto, com NF.')
      .build());

  if (bomba) {
    bomba.getRange(2, COL_CARGA.PRODUTO, bomba.getMaxRows() - 1, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(PRODUTOS_BOMBA, true).setAllowInvalid(false).build());
  }
}

// ==========================================================================
// 03_Relatorios.gs
// ==========================================================================

/**
 * Abas calculadas: Resumo, Rateio por Centro, Dashboard e Consulta Veículo.
 * Nenhuma delas guarda dado digitado - sao 100% formula sobre as abas de dados,
 * entao podem ser reconstruidas a qualquer momento.
 */

/**
 * Envolve uma expressao num ARRAYFORMULA que ignora linhas vazias.
 *
 * ultimaLinha (V4.7.1) fecha a altura do array. Sem ela o comportamento e o
 * original ($A4:$A aberto) - e o que o Rateio continua usando, porque la a
 * coluna A e de centros de custo, com dimensao propria.
 */
function arr_(expressao, ultimaLinha) {
  const fim = ultimaLinha || '';
  return '=ARRAYFORMULA(IF($A4:$A' + fim + '="","",' + expressao + '))';
}

// ---------------------------------------------------------------- RESUMO

/** Colunas congeladas no Resumo (placa + descrição). O título é dividido aqui. */
const COLUNAS_CONGELADAS_RESUMO = 2;

// V4.7.2: 'IPVA R$' entrou como coluna N, ao lado de Emplacamento e Seguro — os
// tres sao encargos anuais do cadastro, diluidos por mes. Tudo de N para a direita
// andou uma casa; o TOTAL segue sendo a ultima coluna, agora U.
// 'Arla 32 R$' entrou como coluna H, junto do Lubrificante — os dois sao fluidos
// de consumo que nao sao combustivel. 'Litros Comb.' (E) segue contando SO litro de
// combustivel: somar ARLA ali estragaria o KM/litro de toda a frota.
const RESUMO_COLUNAS = ['Placa / ID', 'Descrição', 'Categoria', 'Centro de Custo',
  'Litros Comb.', 'Combustível R$', 'Lubrificante R$', 'Arla 32 R$', 'Lavação/Graxa R$',
  'Oficina R$', 'Ativo (Oficina/Plotagem/Carro Novo) R$', 'Pneus R$', 'Multa R$', 'Emplacamento R$',
  'IPVA R$', 'Seguro R$', 'Diária/Pedágio R$', 'Depreciação R$', 'KM Rodado',
  'KM/Litro', 'R$ por KM', 'TOTAL R$',
  // V4.8: gás entra DEPOIS do total, para nenhuma coluna existente mudar de letra
  // (relatórios, Dashboard e Rateio referenciam as letras A..V).
  'Gás (kg)', 'Gás R$'];

/**
 * RESUMO CALCULADO PELO SCRIPT (V4.8)
 * -----------------------------------
 * Até a V4.7 a linha 4 do Resumo tinha 20 ARRAYFORMULA com SUMIFS/MAXIFS/MINIFS.
 * Havia dois problemas graves:
 *
 *   1. CORREÇÃO: no Google Sheets, SUMIFS, MAXIFS e MINIFS NÃO iteram sobre um
 *      critério matricial dentro de ARRAYFORMULA — devolvem um único número, que é
 *      repetido em todas as linhas. Resultado real na base: todos os 168 veículos
 *      com os mesmos 1.005 litros e R$ 3.768,75 (os valores do primeiro veículo), e
 *      os relatórios/contadores mostrando dados que não correspondiam ao lançado.
 *   2. DESEMPENHO: ~18 varreduras de milhares de linhas por veículo, recalculadas a
 *      cada edição em qualquer aba — a principal causa de lentidão da planilha.
 *
 * Agora o Resumo é calculado em memória (uma leitura de Lançamentos, Odômetro e
 * Veículos) e gravado como VALORES num único setValues. Mesmo layout de colunas, então
 * Dashboard, Rateio, Consulta, Relatórios e o Web App continuam lendo do mesmo lugar.
 *
 * Quando recalcula: em toda gravação/exclusão feita pelo sistema, em "Atualizar
 * relatórios", no fechamento/reabertura e quando alguém edita as abas de dados à mão
 * (o onEdit marca o Resumo como desatualizado e o próximo acesso recalcula).
 */
const PROP_RESUMO_DESATUALIZADO_ = 'RESUMO_DESATUALIZADO_V48';

/** Célula com erro de fórmula (#REF!, #N/A…) vira texto vazio no Resumo. */
function textoSemErro_(valor) {
  const t = String(valor == null ? '' : valor);
  return ERROS_DE_CELULA.indexOf(t.trim()) !== -1 ? '' : t;
}

/** Tipo de despesa -> índice (R_) da coluna de valor no Resumo. */
function mapaTipoColunaResumo_() {
  const m = {};
  m['Combustivel Proprio'] = R_.COMBUSTIVEL;
  m['Combustivel Terceiros'] = R_.COMBUSTIVEL;
  m['Lubrificante'] = R_.LUBRIFICANTE;
  m['Arla 32'] = R_.ARLA;
  m['Lavacao/Graxa'] = R_.LAVACAO;
  m['Oficina Despesa'] = R_.OFICINA;
  m['Oficina Deb Loja'] = R_.OFICINA;
  m['Oficina Ativo'] = R_.OFICINA_ATIVO;
  m['Plotagem'] = R_.OFICINA_ATIVO;
  m['Carro Novo'] = R_.OFICINA_ATIVO;
  m['Gás'] = R_.GAS;
  m['Pneus'] = R_.PNEUS;
  m['Multa'] = R_.MULTA;
  m['Emplacamento/IPVA/Seguro'] = R_.EMPLACAMENTO;
  m['IPVA'] = R_.IPVA;
  m['Diaria/Pedagio'] = R_.PEDAGIO;
  m['Depreciação'] = R_.DEPRECIACAO;
  m['Depreciacao'] = R_.DEPRECIACAO;
  return m;
}

/** Colunas que compõem o TOTAL (Ativo fica de fora: é imobilizado, não despesa). */
const R_COMPOEM_TOTAL_ = ['COMBUSTIVEL', 'LUBRIFICANTE', 'ARLA', 'LAVACAO', 'OFICINA',
  'PNEUS', 'MULTA', 'EMPLACAMENTO', 'IPVA', 'SEGURO', 'PEDAGIO', 'DEPRECIACAO', 'GAS'];

/**
 * Calcula as linhas do Resumo (uma por veículo cadastrado) para o período informado.
 * Função pura sobre os dados lidos: não escreve nada.
 */
function calcularLinhasResumo_(periodo) {
  const p = periodo || periodoAtual_();
  const ini = p.inicio.getTime();
  const fim = p.fim.getTime();
  const largura = TOTAL_COL_RESUMO;
  const linhas = [];
  const porPlaca = {};

  dadosVeiculosExecucao_().forEach(function (v) {
    const placa = String(v[COL_VEIC.PLACA - 1] || '').trim();
    if (!placa) return;
    const chave = normalizaPlaca_(placa);
    if (porPlaca[chave]) return; // placa duplicada no cadastro: conta uma vez
    const l = new Array(largura).fill(0);
    l[R_.PLACA] = placa;
    l[R_.DESCRICAO] = textoSemErro_(v[COL_VEIC.DESCRICAO - 1]);
    l[R_.CATEGORIA] = textoSemErro_(v[COL_VEIC.CATEGORIA - 1]);
    l[R_.CENTRO] = normalizarCentroCusto_(v[COL_VEIC.CENTRO - 1]);
    // Encargos fixos do cadastro, diluídos no mês (mesma regra das fórmulas antigas).
    l[R_.EMPLACAMENTO] = Number(v[COL_VEIC.EMPLACAMENTO - 1]) || 0;
    // IPVA NAO entra aqui: desde a V4.8.7 ele e despesa lancada em 12 parcelas e
    // chega pelo laco de lancamentos, como qualquer outro tipo. O campo IPVA do
    // cadastro virou apenas o valor SUGERIDO na hora de lancar.
    l[R_.SEGURO] = Number(v[COL_VEIC.SEGURO - 1]) || 0;
    porPlaca[chave] = l;
    linhas.push(l);
  });

  const colunaDoTipo = mapaTipoColunaResumo_();
  lerLancamentos_().forEach(function (lanc) {
    const data = lanc[L_.DATA];
    if (!(data instanceof Date)) return;
    const t = data.getTime();
    if (isNaN(t) || t < ini || t > fim) return;
    const l = porPlaca[normalizaPlaca_(lanc[L_.PLACA])];
    if (!l) return;
    const tipo = String(lanc[L_.TIPO] || '').trim();
    const indice = colunaDoTipo[tipo];
    if (indice === undefined) return;
    l[indice] += Number(lanc[L_.VALOR]) || 0;
    if (TIPOS_COMBUSTIVEL.indexOf(tipo) !== -1) l[R_.LITROS] += Number(lanc[L_.LITROS]) || 0;
    if (tipo === 'Gás') l[R_.GAS_KG] += Number(lanc[L_.LITROS]) || 0;
  });

  // KM rodado = maior - menor leitura do período (exige pelo menos 2 leituras).
  const odo = ss_().getSheetByName(ABAS.ODOMETRO);
  if (odo && odo.getLastRow() >= 2) {
    const leituras = {};
    lerOdometro_().forEach(function (o) {
      const data = o[0];
      if (!(data instanceof Date)) return;
      const t = data.getTime();
      if (isNaN(t) || t < ini || t > fim) return;
      const km = Number(o[2]);
      if (!isFinite(km) || o[2] === '' || o[2] === null) return;
      const chave = normalizaPlaca_(o[1]);
      if (!porPlaca[chave]) return;
      const r = leituras[chave] || (leituras[chave] = { n: 0, min: km, max: km });
      r.n++;
      if (km < r.min) r.min = km;
      if (km > r.max) r.max = km;
    });
    Object.keys(leituras).forEach(function (chave) {
      const r = leituras[chave];
      porPlaca[chave][R_.KM] = r.n >= 2 ? r.max - r.min : 0;
    });
  }

  linhas.forEach(function (l) {
    let total = 0;
    R_COMPOEM_TOTAL_.forEach(function (nome) { total += Number(l[R_[nome]]) || 0; });
    // arredonda em centavos para o total bater com a soma que o usuário faz na tela
    Object.keys(R_).forEach(function (nome) {
      const i = R_[nome];
      if (typeof l[i] === 'number' && i !== R_.LITROS && i !== R_.KM && i !== R_.GAS_KG) l[i] = Math.round(l[i] * 100) / 100;
    });
    l[R_.TOTAL] = Math.round(total * 100) / 100;
    l[R_.LITROS] = Math.round(l[R_.LITROS] * 1000) / 1000;
    l[R_.GAS_KG] = Math.round(l[R_.GAS_KG] * 1000) / 1000;
    l[R_.KM_LITRO] = l[R_.LITROS] > 0 ? l[R_.KM] / l[R_.LITROS] : 0;
    l[R_.RS_KM] = l[R_.KM] > 0 ? l[R_.TOTAL] / l[R_.KM] : 0;
  });
  return linhas;
}

/**
 * Recalcula e grava os valores do Resumo. Uso interno (sem checagem de perfil): é
 * chamado depois de operações que já foram autorizadas. Devolve quantos veículos.
 */
/**
 * Recalcula e regrava o Resumo inteiro.
 *
 * TRAVADO desde a V4.8.7, e o motivo nao e teorico: lerResumo_ chama
 * garantirResumoAtualizado_, entao ABRIR o dashboard pode disparar esta escrita.
 * Dois usuarios abrindo ao mesmo tempo, depois de alguem editar a aba a mao,
 * entravam os dois aqui. Entre o clearContent de um e o setValues do outro, um
 * terceiro leitor encontrava o Resumo VAZIO — e caia no "Não foi possível
 * calcular o Resumo", que e mensagem de falha grave para uma condicao passageira.
 *
 * Quem nao pega o lock NAO recalcula em paralelo: devolve -2 para o chamador
 * reler o que o outro acabou de gravar. Recalcular junto e justamente o que
 * produz a janela de aba vazia.
 */
const RESUMO_OCUPADO_ = -2;

function atualizarResumo_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return RESUMO_OCUPADO_;
  try {
    return atualizarResumoSemLock_();
  } finally {
    lock.releaseLock();
  }
}

function atualizarResumoSemLock_() {
  const sheet = ss_().getSheetByName(ABAS.RESUMO);
  if (!sheet) return 0;
  garantirColunas_(sheet, TOTAL_COL_RESUMO);
  const linhas = calcularLinhasResumo_(periodoAtual_());
  const largura = TOTAL_COL_RESUMO;
  const inicio = PRIMEIRA_LINHA_RESUMO_;
  garantirLinhas_(sheet, Math.max(inicio + linhas.length + 5, LIMITE_VEICULOS + 100));
  const ocupadas = Math.max(sheet.getLastRow() - inicio + 1, 0);
  // Remove resíduos (fórmulas antigas ou veículos excluídos) antes de gravar.
  if (ocupadas > 0) sheet.getRange(inicio, 1, ocupadas, largura).clearContent();
  if (linhas.length) sheet.getRange(inicio, 1, linhas.length, largura).setValues(linhas);
  // Cabeçalho das colunas novas (ex.: Gás) antes de o Instalar redesenhar a aba.
  const cab = sheet.getRange(2, 1, 1, largura);
  const rotulos = cab.getValues()[0];
  if (RESUMO_COLUNAS.some(function (r, i) { return i > R_.TOTAL && String(rotulos[i] || '') !== r; })) {
    sheet.getRange(2, R_.TOTAL + 2, 1, largura - R_.TOTAL - 1).setValues([RESUMO_COLUNAS.slice(R_.TOTAL + 1)]);
  }
  try { PropertiesService.getDocumentProperties().deleteProperty(PROP_RESUMO_DESATUALIZADO_); } catch (e) {}
  try { CacheService.getScriptCache().remove(CACHE_INICIO_ATUAL_); } catch (e) {}
  return linhas.length;
}

/**
 * Garante que as regras de validação das colunas Tipo e Natureza aceitam os valores
 * atuais do sistema (evita gravação interrompida depois de uma atualização de código
 * sem rodar o Instalar). Só regrava a regra quando falta algum valor.
 */
function garantirValidacaoTiposLancamento_(sheet, tipo, natureza) {
  function listaDaRegra(coluna) {
    try {
      const regra = sheet.getRange(2, coluna).getDataValidation();
      if (!regra) return null;
      const crit = regra.getCriteriaValues();
      return crit && Array.isArray(crit[0]) ? crit[0].map(String) : null;
    } catch (e) { return null; }
  }
  const max = sheet.getMaxRows() - 1;
  const tipos = listaDaRegra(COL_LANC.TIPO);
  if (tipos && tipo && tipos.indexOf(String(tipo)) === -1) {
    sheet.getRange(2, COL_LANC.TIPO, max, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(TIPOS_DESPESA, true).setAllowInvalid(false)
      .setHelpText('Escolha um dos tipos de despesa do sistema.').build());
  }
  const nats = listaDaRegra(COL_LANC.NATUREZA_OFICINA);
  if (nats && natureza && nats.indexOf(String(natureza)) === -1) {
    sheet.getRange(2, COL_LANC.NATUREZA_OFICINA, max, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(NATUREZAS_OFICINA.concat([NATUREZA_OFICINA_LEGADO_]), true).setAllowInvalid(false)
      .setHelpText('Obrigatório nos lançamentos de Oficina. Escolha a natureza principal do gasto.').build());
  }
}

/**
 * V4.8 (velocidade): depois de UM lançamento só a linha daquele veículo muda. Grava só
 * essa linha (1 x 22 células) em vez de limpar e regravar o Resumo inteiro. Se a ordem
 * da aba não bater com o cadastro (veículo novo, excluído...), cai no recálculo completo.
 */
function atualizarResumoPlacaSeguro_(placa) {
  try {
    const sheet = ss_().getSheetByName(ABAS.RESUMO);
    if (!sheet) return 0;
    const alvo = normalizaPlaca_(placa);
    const linhas = calcularLinhasResumo_(periodoAtual_());
    const i = linhas.map(function (l) { return normalizaPlaca_(l[R_.PLACA]); }).indexOf(alvo);
    const linhaAba = PRIMEIRA_LINHA_RESUMO_ + i;
    const naAba = i >= 0 ? normalizaPlaca_(sheet.getRange(linhaAba, 1).getValue()) : '';
    const totalAba = Math.max(sheet.getLastRow() - PRIMEIRA_LINHA_RESUMO_ + 1, 0);
    if (i < 0 || naAba !== alvo || totalAba !== linhas.length) return atualizarResumoSeguro_();
    // Mesma trava do recalculo completo: esta grava uma linha so, mas pode cair
    // no meio de um clearContent do recalculo inteiro e escrever numa aba que
    // esta prestes a ser limpa.
    const lockLinha = LockService.getScriptLock();
    if (!lockLinha.tryLock(15000)) return atualizarResumoSeguro_();
    try {
      sheet.getRange(linhaAba, 1, 1, TOTAL_COL_RESUMO).setValues([linhas[i]]);
    } finally {
      lockLinha.releaseLock();
    }
    try { CacheService.getScriptCache().remove(CACHE_INICIO_ATUAL_); } catch (e) {}
    return 1;
  } catch (erro) {
    return atualizarResumoSeguro_();
  }
}

/** Versão tolerante: nunca derruba a operação principal (gravação, exclusão...). */
let ULTIMO_ERRO_RESUMO_ = '';

function atualizarResumoSeguro_() {
  try {
    ULTIMO_ERRO_RESUMO_ = '';
    return atualizarResumo_();
  } catch (erro) {
    ULTIMO_ERRO_RESUMO_ = String(erro && erro.message || erro);
    console.error('atualizarResumo_: ' + erro.message);
    marcarResumoDesatualizado_();
    try { registrarLog_('Aviso Resumo', 'recalcular falhou: ' + erro.message); } catch (e) {}
    return -1;
  }
}

/**
 * TOTAL R$ do período. Antes o fechamento lia a célula T3, que desde a entrada das
 * colunas Arla e IPVA passou a ser o KM/Litro — o Histórico recebia o número errado.
 */
function totalGeralResumo_() {
  SpreadsheetApp.flush();
  const celula = letraColuna_(R_.TOTAL + 1) + '3';
  return Number(aba_(ABAS.RESUMO).getRange(celula).getValue()) || 0;
}

function marcarResumoDesatualizado_() {
  try { PropertiesService.getDocumentProperties().setProperty(PROP_RESUMO_DESATUALIZADO_, '1'); } catch (e) {}
}

/** Recalcula só se alguém editou as abas de dados à mão desde o último cálculo. */
/** Espera quem esta recalculando terminar. Nao recalcula: so da a vez. */
function aguardarResumoLivre_() {
  const espera = LockService.getScriptLock();
  try { espera.waitLock(25000); } catch (e) { /* segue com o que houver na aba */ }
  finally { try { espera.releaseLock(); } catch (e) {} }
}

function garantirResumoAtualizado_() {
  let sujo = false;
  try { sujo = PropertiesService.getDocumentProperties().getProperty(PROP_RESUMO_DESATUALIZADO_) === '1'; } catch (e) {}
  if (!sujo) return;
  // Outro processo ja esta recalculando: esperar o lock dele e mais barato (e mais
  // correto) do que recalcular por cima. Ao sair, a aba ja tem o resultado dele.
  if (atualizarResumoSeguro_() === RESUMO_OCUPADO_) aguardarResumoLivre_();
}

function montarResumo_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.RESUMO, true);
  garantirLinhas_(sheet, LIMITE_VEICULOS + 100);
  garantirColunas_(sheet, RESUMO_COLUNAS.length);
  removerFiltro_(sheet);
  sheet.clear();
  limparGraficos_(sheet);
  sheet.clearConditionalFormatRules();

  const n = RESUMO_COLUNAS.length;

  // O título vai em dois blocos: A1:B1 e C1:T1. Um bloco único de A1 até T1
  // impediria congelar as 2 primeiras colunas — o Sheets recusa congelamento
  // que corte uma célula mesclada ao meio.
  sheet.getRange(1, 1, 1, n).breakApart();
  sheet.getRange(1, 1, 1, COLUNAS_CONGELADAS_RESUMO).merge()
    .setValue('RESUMO OPERACIONAL');
  sheet.getRange(1, COLUNAS_CONGELADAS_RESUMO + 1, 1, n - COLUNAS_CONGELADAS_RESUMO).merge()
    .setFormula(fx_(
      '=PARAM_EMPRESA&"   |   PERÍODO: "&' + dataBR_('PERIODO_INI') +
      '&" a "&' + dataBR_('PERIODO_FIM')));
  sheet.getRange(1, 1, 1, n)
    .setBackground(CORES.LARANJA).setFontColor(CORES.TEXTO_CLARO)
    .setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);

  sheet.getRange(2, 1, 1, n).setValues([RESUMO_COLUNAS]);
  estilizarCabecalho_(sheet.getRange(2, 1, 1, n));
  sheet.setRowHeight(2, 34);

  // ----- linha 3: totais gerais (sempre visivel)
  sheet.getRange('A3').setValue('TOTAL GERAL');
  sheet.getRange('D3').setFormula(fx_('=COUNTA(A4:A)&" veículos"'));
  ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'V', 'W', 'X']
    .forEach(function (c) {
      sheet.getRange(c + '3').setFormula(fx_('=SUM(' + c + '4:' + c + ')'));
    });
  // T3 e U3 são médias da FROTA (KM total / litros totais), não soma das médias.
  sheet.getRange('T3').setFormula(fx_('=IFERROR(S3/E3,0)'));
  sheet.getRange('U3').setFormula(fx_('=IFERROR(V3/S3,0)'));
  sheet.getRange(3, 1, 1, n)
    .setBackground(CORES.LARANJA_CLARO).setFontWeight('bold').setBorder(
      true, true, true, true, false, false, CORES.LARANJA, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // ----- linha 4 em diante: VALORES calculados pelo script (V4.8)
  atualizarResumo_();
  // A propriedade do teto de varredura das fórmulas antigas não se aplica mais.
  PropertiesService.getDocumentProperties().deleteProperty(PROP_VARREDURA_RESUMO_);

  // ----- visual
  const ultima = sheet.getMaxRows();
  sheet.getRange(3, 5, ultima - 2, 1).setNumberFormat('#,##0.000');
  'FGHIJKLMNOPQR'.split('').concat(['V']).forEach(function (c) {
    sheet.getRange(c + '3:' + c).setNumberFormat('R$ #,##0.00');
  });
  sheet.getRange('S3:S').setNumberFormat('#,##0');
  sheet.getRange('T3:T').setNumberFormat('#,##0.00;-#,##0.00;""');
  sheet.getRange('U3:U').setNumberFormat('R$ #,##0.000;-R$ #,##0.000;""');
  sheet.getRange('V3:V').setFontWeight('bold');
  sheet.getRange('W3:W').setNumberFormat('#,##0.000');
  sheet.getRange('X3:X').setNumberFormat('R$ #,##0.00');

  [110, 190, 155, 140, 105, 125, 120, 110, 120, 120, 150, 110, 100, 120, 110, 110, 130, 125, 105, 95, 105, 130, 95, 115]
    .forEach(function (largura, i) { sheet.setColumnWidth(i + 1, largura); });
  sheet.setFrozenRows(3);
  sheet.setFrozenColumns(COLUNAS_CONGELADAS_RESUMO);

  sheet.setConditionalFormatRules([
    // veiculo sem nenhum custo no periodo
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(fx_('=AND($A4<>"",$V4=0)'))
      .setBackground('#f5f5f5').setFontColor('#999999')
      .setRanges([sheet.getRange(4, 1, ultima - 3, RESUMO_COLUNAS.length)])
      .build(),
    // consumo fora da curva: acima de 2x a media da frota
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(fx_('=AND($U4>0,$U$3>0,$U4>2*$U$3)'))
      .setBackground(CORES.VERMELHO).setBold(true)
      .setRanges([sheet.getRange(4, R_.RS_KM + 1, ultima - 3, 1)])
      .build(),
  ]);

  sheet.getRange(2, 1, sheet.getMaxRows() - 1, RESUMO_COLUNAS.length).createFilter();
  return sheet;
}

// ------------------------------------------------------- RATEIO POR CENTRO

const RATEIO_COLUNAS = ['Centro de Custo', 'Custo Direto R$', 'Recebe Rateio',
  '% Rateio', 'Rateio Recebido R$', 'Custo Distribuído R$', 'TOTAL R$', '% do Total'];

function montarRateio_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.RATEIO, true);
  garantirLinhas_(sheet, 300);
  sheet.clear();
  limparGraficos_(sheet);
  sheet.clearConditionalFormatRules();

  const C = ref_(ABAS.CENTROS);
  const R = ref_(ABAS.RESUMO);
  // V4.8: coluna do TOTAL derivada de R_. Era 'T' fixo, que virou KM/Litro quando o
  // Resumo ganhou Arla e IPVA — o rateio distribuía KM/litro em vez de reais.
  const LT = letraColuna_(R_.TOTAL + 1);
  const n = RATEIO_COLUNAS.length;

  sheet.getRange(1, 1, 1, n).breakApart();
  sheet.getRange('A1').setFormula(fx_(
    '="RATEIO POR CENTRO DE CUSTO   |   "&PARAM_MES&"   |   base do rateio: "&PARAM_BASE_RATEIO'));
  sheet.getRange(1, 1, 1, n).merge()
    .setBackground(CORES.LARANJA).setFontColor(CORES.TEXTO_CLARO)
    .setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);

  sheet.getRange(2, 1, 1, n).setValues([RATEIO_COLUNAS]);
  estilizarCabecalho_(sheet.getRange(2, 1, 1, n));

  sheet.getRange('A3').setValue('TOTAL GERAL');
  ['B', 'E', 'F', 'G', 'H'].forEach(function (c) {
    sheet.getRange(c + '3').setFormula(fx_('=SUM(' + c + '4:' + c + ')'));
  });
  sheet.getRange(3, 1, 1, n)
    .setBackground(CORES.LARANJA_CLARO).setFontWeight('bold');

  // valor total a distribuir = soma dos centros listados em BASE_RATEIO
  sheet.getRange('J2').setValue('Valor a distribuir (base)');
  sheet.getRange('K2').setFormula(fx_(
    '=SUMPRODUCT(SUMIF(' + R + '!$D$4:$D,TRIM(SPLIT(PARAM_BASE_RATEIO,",")),' + R + '!$' + LT + '$4:$' + LT + '))'));
  sheet.getRange('J3').setValue('Soma dos percentuais');
  sheet.getRange('K3').setFormula(fx_('=SUM(' + C + '!B2:B)'));
  sheet.getRange('J4').setValue('Sobra (centro não cadastrado)');
  sheet.getRange('K4').setFormula(fx_('=ROUND(G3-' + R + '!' + LT + '3,2)'));
  sheet.getRange('J2:J4').setFontWeight('bold');
  sheet.getRange('K2').setNumberFormat('R$ #,##0.00');
  sheet.getRange('K3').setNumberFormat('0.00%');
  sheet.getRange('K4').setNumberFormat('R$ #,##0.00');
  sheet.getRange('J2:K4').setBackground(CORES.CINZA);

  sheet.getRange('A4').setFormula(fx_(
    '=ARRAYFORMULA(IFERROR(FILTER(' + C + '!A2:A,' + C + '!A2:A<>""),""))'));
  sheet.getRange('B4').setFormula(fx_(
    arr_('SUMIF(' + R + '!$D$4:$D,$A4:$A,' + R + '!$' + LT + '$4:$' + LT + ')')));
  sheet.getRange('C4').setFormula(fx_(
    arr_('IFERROR(VLOOKUP($A4:$A,' + C + '!$A:$C,3,FALSE),"NAO")')));
  sheet.getRange('D4').setFormula(fx_(
    arr_('IFERROR(VLOOKUP($A4:$A,' + C + '!$A:$C,2,FALSE),0)')));
  // divide pela soma dos percentuais: eles somam 100,001% na base herdada, e sem
  // normalizar o rateio distribui mais do que existe
  sheet.getRange('E4').setFormula(fx_(
    arr_('IF($C4:$C="SIM",IF($K$3=0,0,$K$2*$D4:$D/$K$3),0)')));
  sheet.getRange('F4').setFormula(fx_(
    arr_('IF(ISNUMBER(MATCH($A4:$A,TRIM(SPLIT(PARAM_BASE_RATEIO,",")),0)),-$B4:$B,0)')));
  sheet.getRange('G4').setFormula(fx_(arr_('$B4:$B+$E4:$E+$F4:$F')));
  sheet.getRange('H4').setFormula(fx_(arr_('IF($G$3=0,"",$G4:$G/$G$3)')));

  ['B', 'E', 'F', 'G'].forEach(function (c) {
    sheet.getRange(c + '3:' + c).setNumberFormat('R$ #,##0.00');
  });
  sheet.getRange('D3:D').setNumberFormat('0.000%');
  sheet.getRange('H3:H').setNumberFormat('0.00%');
  sheet.getRange('G3:G').setFontWeight('bold');
  [190, 140, 110, 100, 145, 150, 140, 100].forEach(function (largura, i) {
    sheet.setColumnWidth(i + 1, largura);
  });
  sheet.setFrozenRows(3);

  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(fx_('=$F4<0'))
      .setBackground(CORES.AMARELO)
      .setRanges([sheet.getRange(4, 1, sheet.getMaxRows() - 3, n)])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(fx_('=ROUND($K$3,4)<>1'))
      .setBackground(CORES.VERMELHO)
      .setRanges([sheet.getRange('K3')])
      .build(),
  ]);
  return sheet;
}

// ------------------------------------------------------------- DASHBOARD

function montarDashboard_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.DASHBOARD, true);
  sheet.clear();
  limparGraficos_(sheet);
  sheet.clearConditionalFormatRules();
  sheet.setHiddenGridlines(true);

  const R = ref_(ABAS.RESUMO);
  const H = ref_(ABAS.HISTORICO);

  sheet.getRange('A1:L1').breakApart();
  sheet.getRange('A1').setFormula(fx_(
    '=PARAM_EMPRESA&"   —   PAINEL DE CUSTOS DA FROTA   —   "&PARAM_MES'));
  sheet.getRange('A1:L1').merge()
    .setBackground(CORES.LARANJA).setFontColor(CORES.TEXTO_CLARO)
    .setFontWeight('bold').setFontSize(16).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 46);

  // ----- cartoes de indicador
  // V4.8: letras derivadas de R_. As antigas (T3, S3, Q3) ficaram para trás quando o
  // Resumo ganhou colunas: o card "Custo total" mostrava KM/Litro, "Custo por KM"
  // mostrava o KM rodado, e "KM rodados" mostrava a diária/pedágio.
  const LR = function (indice) { return R + '!' + letraColuna_(indice + 1) + '3'; };
  const cartoes = [
    ['CUSTO TOTAL DO PERÍODO', '=' + LR(R_.TOTAL), 'R$ #,##0.00'],
    ['CUSTO POR KM', '=' + LR(R_.RS_KM), 'R$ #,##0.000'],
    ['KM RODADOS', '=' + LR(R_.KM), '#,##0'],
    ['LITROS ABASTECIDOS', '=' + LR(R_.LITROS), '#,##0'],
    ['PREÇO MÉDIO DO LITRO', '=IFERROR(' + LR(R_.COMBUSTIVEL) + '/' + LR(R_.LITROS) + ',"")', 'R$ #,##0.000'],
    ['VARIAÇÃO vs. MÊS ANTERIOR',
      '=IFERROR(' + LR(R_.TOTAL) + '/INDEX(' + H + '!B:B,COUNTA(' + H + '!B:B))-1,"")', '0.0%'],
  ];
  cartoes.forEach(function (cartao, i) {
    const coluna = 1 + i * 2;
    sheet.getRange(3, coluna, 1, 2).merge().setValue(cartao[0])
      .setBackground(CORES.LARANJA_CLARO).setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setFontColor(CORES.LARANJA);
    const valor = sheet.getRange(4, coluna, 1, 2).merge();
    valor.setFormula(fx_(cartao[1])).setNumberFormat(cartao[2])
      .setFontSize(15).setFontWeight('bold')
      .setHorizontalAlignment('center').setBackground(CORES.BRANCO)
      .setBorder(true, true, true, true, false, false, CORES.LARANJA_CLARO,
        SpreadsheetApp.BorderStyle.SOLID);
  });
  sheet.setRowHeight(3, 26);
  sheet.setRowHeight(4, 40);

  // variacao: verde quando cai, vermelho quando sobe
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0).setFontColor('#c00000')
      .setRanges([sheet.getRange('K4:L4')]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0).setFontColor('#1e7145')
      .setRanges([sheet.getRange('K4:L4')]).build(),
  ]);

  // ----- despesa por natureza
  sheet.getRange('A6').setValue('DESPESA POR NATUREZA')
    .setFontWeight('bold').setFontColor(CORES.LARANJA);
  const L = function (indice) { return letraColuna_(indice + 1); };
  // Emplacamento e IPVA dividem uma linha para caber o Gás sem empurrar os blocos de baixo.
  const naturezas = [
    ['Combustível', [R_.COMBUSTIVEL]], ['Gás', [R_.GAS]], ['Lubrificante', [R_.LUBRIFICANTE]],
    ['Arla 32', [R_.ARLA]], ['Lavação/Graxa', [R_.LAVACAO]],
    ['Oficina', [R_.OFICINA]], ['Pneus', [R_.PNEUS]], ['Multas', [R_.MULTA]],
    ['Emplacamento/IPVA', [R_.EMPLACAMENTO, R_.IPVA]],
    ['Seguro', [R_.SEGURO]], ['Diária/Pedágio', [R_.PEDAGIO]],
    ['Depreciação', [R_.DEPRECIACAO]],
  ];
  sheet.getRange(7, 1, 1, 3).setValues([['Natureza', 'Valor R$', '% do Total']]);
  estilizarCabecalho_(sheet.getRange(7, 1, 1, 3));
  naturezas.forEach(function (item, i) {
    const linha = 8 + i;
    sheet.getRange(linha, 1).setValue(item[0]);
    sheet.getRange(linha, 2).setFormula(fx_('=' + item[1].map(function (i) {
      return R + '!' + L(i) + '3';
    }).join('+')));
    sheet.getRange(linha, 3).setFormula(fx_('=IFERROR(B' + linha + '/$B$' + (8 + naturezas.length) + ',"")'));
  });
  const linhaTotalNat = 8 + naturezas.length;
  sheet.getRange(linhaTotalNat, 1).setValue('TOTAL');
  sheet.getRange(linhaTotalNat, 2).setFormula(fx_('=SUM(B8:B' + (linhaTotalNat - 1) + ')'));
  sheet.getRange(linhaTotalNat, 3).setValue(1);
  sheet.getRange(linhaTotalNat, 1, 1, 3).setFontWeight('bold').setBackground(CORES.LARANJA_CLARO);
  sheet.getRange(8, 2, naturezas.length + 1, 1).setNumberFormat('R$ #,##0.00');
  sheet.getRange(8, 3, naturezas.length + 1, 1).setNumberFormat('0.0%');

  // ----- custo por categoria de frota
  sheet.getRange('E6').setValue('CUSTO POR CATEGORIA DE FROTA')
    .setFontWeight('bold').setFontColor(CORES.LARANJA);
  sheet.getRange('E7').setFormula(fx_(
    '=IFERROR(QUERY(' + R + '!$A$4:$V,' +
    '"select C, count(A), sum(V), sum(S) where C is not null group by C order by sum(V) desc ' +
    'label C \'Categoria\', count(A) \'Veículos\', sum(V) \'Total R$\', sum(S) \'KM\'",0),"")'));
  estilizarCabecalho_(sheet.getRange('E7:H7'));
  sheet.getRange('I7').setValue('R$ / KM');
  estilizarCabecalho_(sheet.getRange('I7'));
  // Esta matriz pertence apenas ao bloco por categoria (linhas 8 a 20).
  // Não pode avançar até I22, pois I22 é o cabeçalho "Variação" da Evolução Mensal.
  sheet.getRange('I8').setFormula(fx_(
    '=ARRAYFORMULA(IF(E8:E20="","",IF(N(H8:H20)=0,"",G8:G20/H8:H20)))'));
  sheet.getRange('G8:G20').setNumberFormat('R$ #,##0.00');
  sheet.getRange('H8:H20').setNumberFormat('#,##0');
  sheet.getRange('I8:I20').setNumberFormat('R$ #,##0.000');

  // ----- top 15 veiculos
  sheet.getRange('A21').setValue('15 VEÍCULOS DE MAIOR CUSTO NO PERÍODO')
    .setFontWeight('bold').setFontColor(CORES.LARANJA);
  sheet.getRange('A22').setFormula(fx_(
    '=IFERROR(QUERY(' + R + '!$A$4:$V,' +
    '"select A, B, D, S, V where V > 0 order by V desc limit 15 ' +
    'label A \'Placa\', B \'Veículo\', D \'Centro de Custo\', S \'KM\', V \'Total R$\'",0),"")'));
  estilizarCabecalho_(sheet.getRange('A22:E22'));
  sheet.getRange('D23:D').setNumberFormat('#,##0');
  sheet.getRange('E23:E').setNumberFormat('R$ #,##0.00');

  // ----- evolucao mensal
  sheet.getRange('G21').setValue('EVOLUÇÃO MENSAL')
    .setFontWeight('bold').setFontColor(CORES.LARANJA);
  sheet.getRange('G22').setFormula(fx_(
    '=IFERROR(QUERY(' + H + '!A:B,"select A, B where A is not null order by A",1),"")'));
  estilizarCabecalho_(sheet.getRange('G22:H22'));
  sheet.getRange('I22').setValue('Variação');
  estilizarCabecalho_(sheet.getRange('I22'));
  sheet.getRange('I23').setFormula(fx_(
    '=ARRAYFORMULA(IF(G23:G="","",IF(ROW(G23:G)=23,"",IFERROR(H23:H/OFFSET(H23:H,-1,0)-1,""))))'));
  sheet.getRange('H23:H').setNumberFormat('R$ #,##0.00');
  sheet.getRange('I23:I').setNumberFormat('0.0%');

  [150, 130, 100, 30, 170, 90, 130, 100, 100, 30, 140, 110]
    .forEach(function (largura, i) { sheet.setColumnWidth(i + 1, largura); });

  criarGraficosDashboard_(sheet);
  return sheet;
}

function criarGraficosDashboard_(sheet) {
  exigirExecucaoMutacao_();
  const naturezas = sheet.getRange('A8:B19');
  const pizza = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(naturezas)
    .setPosition(6, 11, 0, 0)
    .setOption('title', 'Composição da despesa')
    .setOption('pieHole', 0.45)
    .setOption('legend', { position: 'right', textStyle: { fontSize: 10 } })
    .setOption('width', 430)
    .setOption('height', 260)
    .build();
  sheet.insertChart(pizza);

  const evolucao = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange('G22:H140'))
    .setPosition(21, 11, 0, 0)
    .setOption('title', 'Custo total por período')
    .setOption('legend', { position: 'none' })
    .setOption('width', 430)
    .setOption('height', 260)
    .build();
  sheet.insertChart(evolucao);
}

// -------------------------------------------------------- CONSULTA VEÍCULO

function montarConsulta_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.CONSULTA, true);
  sheet.clear();
  limparGraficos_(sheet);
  sheet.setHiddenGridlines(true);

  const R = ref_(ABAS.RESUMO);
  const L = ref_(ABAS.LANCAMENTOS);
  const O = ref_(ABAS.ODOMETRO);

  sheet.getRange('A1:H1').breakApart();
  sheet.getRange('A1:H1').merge().setValue('CONSULTA POR VEÍCULO')
    .setBackground(CORES.LARANJA).setFontColor(CORES.TEXTO_CLARO)
    .setFontWeight('bold').setFontSize(14).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);

  sheet.getRange('A3').setValue('Placa / patrimônio:').setFontWeight('bold');
  const celula = sheet.getRange('B3');
  celula.setBackground(CORES.AMARELO).setFontWeight('bold').setFontSize(12)
    .setBorder(true, true, true, true, false, false, CORES.LARANJA,
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  celula.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(aba_(ABAS.VEICULOS).getRange('A2:A'), true)
      .setAllowInvalid(true)
      .setHelpText('Escolha uma placa/ID ou digite o número do patrimônio.')
      .build());
  if (!celula.getValue()) {
    const placas = listaPlacas_(false);
    if (placas.length) celula.setValue(placas[0]);
  }
  const VConsulta = ref_(ABAS.VEICULOS);
  // H3 é uma célula técnica: converte placa OU patrimônio para a placa/ID oficial.
  sheet.getRange('H3').setFormula(fx_(
    '=IFERROR(VLOOKUP($B$3,' + VConsulta + '!$A:$E,1,FALSE),' +
    'IFERROR(INDEX(' + VConsulta + '!$A:$A,MATCH(TO_TEXT($B$3),ARRAYFORMULA(TO_TEXT(' + VConsulta + '!$E:$E)),0)),""))'))
    .setNumberFormat(';;;');
  sheet.getRange('D3').setFormula(fx_(
    '=IF($H$3="","Veículo não encontrado",' +
    'IFERROR(VLOOKUP($H$3,' + VConsulta + '!$A:$E,2,FALSE),"")&"  •  Patrimônio "&' +
    'IFERROR(VLOOKUP($H$3,' + VConsulta + '!$A:$E,5,FALSE),"-")&"  •  "&' +
    'IFERROR(VLOOKUP($H$3,' + VConsulta + '!$A:$E,4,FALSE),""))'));
  sheet.getRange('D3').setFontStyle('italic').setFontColor('#444444');

  const indicadores = [
    ['Custo total no período', vlookupResumo_(R, R_.TOTAL), 'R$ #,##0.00'],
    ['KM rodados', vlookupResumo_(R, R_.KM), '#,##0'],
    ['R$ por KM', vlookupResumo_(R, R_.RS_KM, '""'), 'R$ #,##0.000'],
    ['KM por litro', vlookupResumo_(R, R_.KM_LITRO, '""'), '#,##0.00'],
    ['Litros abastecidos', vlookupResumo_(R, R_.LITROS), '#,##0.000'],
    ['Oficina no período', vlookupResumo_(R, R_.OFICINA), 'R$ #,##0.00'],
    ['IPVA no período (1/12)', vlookupResumo_(R, R_.IPVA), 'R$ #,##0.00'],
  ];
  indicadores.forEach(function (item, i) {
    const coluna = 1 + i;
    sheet.getRange(5, coluna).setValue(item[0])
      .setBackground(CORES.LARANJA_CLARO).setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setWrap(true).setFontColor(CORES.LARANJA);
    sheet.getRange(6, coluna).setFormula(fx_(item[1])).setNumberFormat(item[2])
      .setFontSize(13).setFontWeight('bold').setHorizontalAlignment('center')
      .setBorder(true, true, true, true, false, false, CORES.LARANJA_CLARO,
        SpreadsheetApp.BorderStyle.SOLID);
  });
  sheet.setRowHeight(5, 32);
  sheet.setRowHeight(6, 36);

  sheet.getRange('A8').setValue('LANÇAMENTOS DO PERÍODO')
    .setFontWeight('bold').setFontColor(CORES.LARANJA);
  sheet.getRange('A9').setFormula(fx_(
    '=IFERROR(QUERY(' + L + '!$A$2:$G,' +
    '"select A, C, D, E, F, G where B = \'"&$H$3&"\' ' +
    'and A >= date \'"&' + dataIso_('PERIODO_INI') + '&"\' ' +
    'and A < date \'"&' + dataIso_('(PERIODO_FIM+1)') + '&"\' order by A ' +
    'label A \'Data\', C \'Tipo de Despesa\', D \'Litros\', E \'Valor R$\', ' +
    'F \'Documento\', G \'Observação\'",0),"Sem lançamentos no período.")'));
  estilizarCabecalho_(sheet.getRange('A9:F9'));
  sheet.getRange('A10:A').setNumberFormat('dd/mm/yyyy');
  sheet.getRange('C10:C').setNumberFormat('#,##0.000');
  sheet.getRange('D10:D').setNumberFormat('R$ #,##0.00');

  sheet.getRange('I8').setValue('LEITURAS DE ODÔMETRO')
    .setFontWeight('bold').setFontColor(CORES.LARANJA);
  sheet.getRange('I9').setFormula(fx_(
    '=IFERROR(QUERY(' + O + '!$A$2:$C,' +
    '"select A, C where B = \'"&$H$3&"\' ' +
    'and A >= date \'"&' + dataIso_('PERIODO_INI') + '&"\' ' +
    'and A < date \'"&' + dataIso_('(PERIODO_FIM+1)') + '&"\' order by A ' +
    'label A \'Data\', C \'KM\'",0),"Sem leituras no período.")'));
  estilizarCabecalho_(sheet.getRange('I9:J9'));
  sheet.getRange('I10:I').setNumberFormat('dd/mm/yyyy');
  sheet.getRange('J10:J').setNumberFormat('#,##0');

  [130, 130, 110, 110, 90, 130, 220, 30, 110, 110]
    .forEach(function (largura, i) { sheet.setColumnWidth(i + 1, largura); });
  sheet.setFrozenRows(9);
  return sheet;
}

/** Reconstrói todas as abas calculadas. */
function reconstruirRelatorios_() {
  exigirExecucaoMutacao_();
  montarResumo_();
  montarRateio_();
  montarDashboard_();
  montarConsulta_();
  SpreadsheetApp.flush();      // o Resumo precisa estar calculado...
  montarCentralRelatorios_();   // ...porque os relatórios consultam ele
  SpreadsheetApp.flush();
}

// ==========================================================================
// 04_Lancamento.gs
// ==========================================================================

/**
 * Formulario lateral de lancamento diario.
 * Substitui a digitacao direta na aba de cada veiculo do modelo antigo.
 */

function abrirFormularioLancamento() {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Esta ação só funciona com a planilha aberta: use o menu 🚚 Sistema de Frota dentro da planilha (o botão Executar do editor não abre telas).');
  exigirExecucaoOperacional_();
  const html = HtmlService.createTemplateFromFile('Lancamento')
    .evaluate()
    .setTitle('Novo lançamento')
    .setWidth(360);
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Dados que o formulario precisa para montar os campos. */
function dadosFormulario() {
  exigirExecucaoLeitura_();
  const mesRef = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const periodo = periodoDoMes_(mesRef);
  const hoje = new Date();
  const dentroDoPeriodo = hoje >= periodo.inicio && hoje <= periodo.fim;
  const tz = timezone_();
  return {
    placas: listaPlacas_(true), // legado/compatibilidade
    veiculos: opcoesVeiculos_(true),
    tipos: TIPOS_DESPESA,
    tiposComLitros: TIPOS_COM_LITROS,
    tiposOficina: TIPOS_OFICINA,
    tiposExigemDocumento: TIPOS_EXIGEM_DOCUMENTO,
    tiposKg: TIPOS_QUANTIDADE_KG,
    tiposAtivo: TIPOS_ATIVO,
    naturezasOficina: NATUREZAS_OFICINA,
    // V4.7.2: o formulario precisa saber quais tipos aceitam KM (so combustivel),
    // quais fornecedores existem e quais sao os produtos da bomba.
    tiposCombustivel: TIPOS_COMBUSTIVEL,
    tiposDoTanque: TIPOS_DO_TANQUE,
    tiposAbastecimento: TIPOS_ABASTECIMENTO,
    fornecedores: listaFornecedores_(true),
    tiposFornecedor: TIPOS_FORNECEDOR,
    produtosBomba: PRODUTOS_BOMBA,
    mes: mesRef,
    inicio: Utilities.formatDate(periodo.inicio, tz, 'yyyy-MM-dd'),
    fim: Utilities.formatDate(periodo.fim, tz, 'yyyy-MM-dd'),
    dataSugerida: Utilities.formatDate(dentroDoPeriodo ? hoje : periodo.fim, tz, 'yyyy-MM-dd'),
  };
}

/**
 * Custo da bomba para o formulario lateral da planilha.
 *
 * Gemeo de webCustoBomba, sem token: o sidebar roda dentro da planilha e a
 * identidade ja vem do proprio Apps Script, entao quem controla o acesso aqui e
 * exigirExecucaoLeitura_, nao uma sessao web.
 */
function webCustoBombaPlanilha(dataIso) {
  exigirExecucaoLeitura_();
  if (!execucaoTemPlanilhaAtiva_()) {
    throw new Error('Disponível somente pelo formulário da planilha vinculada.');
  }
  const data = parseDataIsoEstrita_(dataIso || '');
  const tanque = estadoTanque_(PRODUTO_DIESEL, data);
  return {
    produto: PRODUTO_DIESEL,
    custoMedio: tanque.custoMedio,
    saldo: tanque.litros,
    disponivel: tanque.custoMedio > 0,
  };
}

/** Última leitura de odômetro registrada para a placa (para conferência no form). */
function ultimoOdometro(placa) {
  exigirExecucaoLeitura_();
  const sheet = aba_(ABAS.ODOMETRO);
  if (sheet.getLastRow() < 2) return null;
  const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  let melhor = null;
  const resolvido = resolverVeiculo_(placa, false);
  if (!resolvido.ok) return null;
  const alvo = normalizaPlaca_(resolvido.veiculo.placa);
  dados.forEach(function (linha) {
    if (normalizaPlaca_(linha[1]) !== alvo || !(linha[0] instanceof Date) || isNaN(linha[0].getTime())) return;
    const kmLinha = Number(linha[2]);
    if (!isFinite(kmLinha)) return;
    if (!melhor || linha[0] > melhor.data ||
        (linha[0].getTime() === melhor.data.getTime() && kmLinha > melhor.km)) {
      melhor = { data: linha[0], km: kmLinha };
    }
  });
  if (!melhor) return null;
  return { data: formatarData_(melhor.data), km: melhor.km };
}

/**
 * Leituras imediatamente antes/depois da data informada.
 * Usa datas estritamente menores/maiores porque o modelo guarda somente o dia,
 * não a hora; várias leituras no mesmo dia não têm ordem cronológica confiável.
 */
function vizinhosOdometro_(placa, data) {
  const sheet = aba_(ABAS.ODOMETRO);
  if (!data || !(data instanceof Date) || sheet.getLastRow() < 2) {
    return { anterior: null, posterior: null };
  }
  const alvo = normalizaPlaca_(placa);
  const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  let anterior = null, posterior = null;
  dados.forEach(function(linha) {
    const d = linha[0];
    const km = Number(linha[2]);
    if (normalizaPlaca_(linha[1]) !== alvo || !(d instanceof Date) || isNaN(d.getTime()) || !isFinite(km)) return;
    if (d < data) {
      if (!anterior || d > anterior.data || (d.getTime() === anterior.data.getTime() && km > anterior.km)) {
        anterior = { data: d, km: km };
      }
    } else if (d > data) {
      if (!posterior || d < posterior.data || (d.getTime() === posterior.data.getTime() && km < posterior.km)) {
        posterior = { data: d, km: km };
      }
    }
  });
  return { anterior: anterior, posterior: posterior };
}

/**
 * Grava um lancamento (e, se informado, a leitura de odometro).
 * Devolve uma mensagem de confirmacao para a sidebar.
 */
function salvarLancamento_(dados, opcoesSalvar) {
  exigirExecucaoOperacional_();
  // semLock: chamado de dentro de uma operação que já detém o lock (ex.: correção).
  const semLockSalvar = !!(opcoesSalvar && opcoesSalvar.semLock === true);
  const lock = LockService.getScriptLock();
  if (!semLockSalvar && !lock.tryLock(15000)) {
    return { ok: false, mensagem: 'Outro lançamento está sendo processado. Aguarde alguns segundos e tente novamente.' };
  }
  try {
    garantirCapacidadeLancamentos_(false);
    const erros = [];
    const resolucaoVeiculo = resolverVeiculo_(dados.placa, false);
    const placa = resolucaoVeiculo.ok ? normalizaPlaca_(resolucaoVeiculo.veiculo.placa) : '';
    if (!resolucaoVeiculo.ok) {
      erros.push(resolucaoVeiculo.mensagem || 'Informe a placa/ID ou o patrimônio.');
    } else if (!resolucaoVeiculo.veiculo.ativo) {
      erros.push('Veículo "' + placa + '" está inativo. Reative o cadastro antes de registrar novos lançamentos.');
    }
    if (TIPOS_DESPESA.indexOf(dados.tipo) === -1) erros.push('Tipo de despesa inválido.');
    if (!dados.data) erros.push('Informe a data.');

    const valor = dados.valor === '' || dados.valor == null ? 0 : Number(dados.valor);
    const litros = dados.litros === '' || dados.litros == null ? 0 : Number(dados.litros);
    const documento = String(dados.documento || '').trim().slice(0, 160);
    const observacao = String(dados.observacao || '').trim().slice(0, 1000);
    const ehOficina = TIPOS_OFICINA.indexOf(String(dados.tipo || '').trim()) !== -1;
    const tipoLimpo = String(dados.tipo || '').trim();
    const ehCombustivel = TIPOS_COMBUSTIVEL.indexOf(tipoLimpo) !== -1;
    const saiDoTanque = TIPOS_DO_TANQUE.indexOf(tipoLimpo) !== -1;
    const naturezaOficina = ehOficina ? String(dados.naturezaOficina || '').trim().slice(0, 120) : '';
    const detalheOficina = ehOficina ? String(dados.detalheOficina || '').trim().slice(0, 500) : '';
    const fornecedor = String(dados.fornecedor || '').trim().slice(0, 180);
    // Vazio cai no que o tipo de despesa ja dizia (Proprio = Interno).
    const tipoAbastecimento = saiDoTanque
      ? tipoAbastecimentoDe_(dados.tipo, dados.tipoAbastecimento) : '';

    if (ehOficina) {
      if (NATUREZAS_OFICINA.indexOf(naturezaOficina) === -1) erros.push('Escolha a natureza da despesa de oficina.');
      if (!detalheOficina) erros.push('Descreva a peça de reposição ou o serviço realizado.');
      if (!documento) erros.push('Informe o número da NF, OS ou documento da despesa de oficina.');
      // Fornecedor NAO e obrigatorio: servico feito na propria oficina, retrabalho
      // e debito de loja nao tem terceiro do outro lado. Exigir ali empurraria o
      // operador a escolher um fornecedor qualquer so para o formulario passar —
      // e um dado errado e pior do que campo vazio no relatorio por fornecedor.
    }
    // O fornecedor tem de existir no cadastro; caso contrario o relatorio por
    // fornecedor viraria uma lista de grafias diferentes da mesma empresa.
    if (fornecedor && listaFornecedores_(false).indexOf(fornecedor) === -1) {
      erros.push('Fornecedor não cadastrado: ' + fornecedor + '. Cadastre-o antes de lançar.');
    }
    if (TIPOS_EXIGEM_DOCUMENTO.indexOf(tipoLimpo) !== -1 && !documento) {
      erros.push('Informe a NF / documento da ' + tipoLimpo.toLowerCase() + '.');
    }
    if (saiDoTanque && tipoAbastecimento === ABASTECIMENTO_EXTERNO) {
      if (!documento) erros.push('Abastecimento externo exige o número da NF.');
      if (!(valor > 0)) erros.push('Abastecimento externo exige o valor da NF.');
    }
    // Interno nao tem NF propria: a nota e a da CARGA do tanque, ja registrada em
    // "Carga na Bomba". Exigir documento aqui faria o operador inventar um numero,
    // e um numero inventado e pior que campo vazio na hora de conferir.
    const documentoFinal = (saiDoTanque && tipoAbastecimento === ABASTECIMENTO_INTERNO)
      ? '' : documento;
    if (!isFinite(valor) || !isFinite(litros)) erros.push('Valor e litros precisam ser numéricos.');
    if (isFinite(valor) && isFinite(litros) && (valor < 0 || litros < 0)) erros.push('Valor e litros não podem ser negativos.');
    if (isFinite(valor) && isFinite(litros) && valor === 0 && litros === 0) erros.push('Informe pelo menos o valor ou os litros.');
    if (isFinite(valor) && valor > 1000000000) erros.push('Valor acima do limite de segurança. Confira o lançamento.');
    if (isFinite(litros) && litros > 1000000) erros.push('Quantidade de litros acima do limite de segurança. Confira o lançamento.');

    const data = parseDataIsoEstrita_(dados.data);
    const periodo = periodoAtual_();
    if (!data) {
      erros.push('Data inválida.');
    } else if (data < periodo.inicio || data > periodo.fim) {
      erros.push('Data fora do período aberto (' +
        formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim) + ').');
    }

    if (dados.tipo === 'Depreciação' && placa && data) {
      const dataFechamentoDep = dataUltimoDiaPeriodo_(periodo);
      if (!mesmaData_(data, dataFechamentoDep)) {
        erros.push('A depreciação só pode ser lançada no último dia do período (' +
          formatarData_(dataFechamentoDep) + ').');
      }
      if (!depreciacaoLiberada_(periodo)) {
        erros.push('A depreciação desta competência só é liberada no último dia do período (' +
          formatarData_(dataFechamentoDep) + ').');
      }
      const existenteDep = totalDepreciacaoLancadaPlacaPeriodo_(placa, periodo);
      if (existenteDep > 0) {
        erros.push('Já existe depreciação lançada para ' + placa + ' neste período (R$ ' +
          existenteDep.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ').');
      }
    }

    const duplicado = data && isFinite(valor)
      ? localizarDuplicidadeLancamento_(data, placa, dados.tipo, valor, documento) : null;
    if (duplicado && dados.permitirDuplicado !== true) {
      erros.push('Possível lançamento duplicado: o documento "' + documento +
        '" já foi lançado para esta placa/data/tipo/valor' +
        (duplicado.id ? ' (ID ' + duplicado.id + ')' : '') + '. Revise antes de continuar.');
    }

    // Item 3 do escopo: KM so faz sentido no abastecimento. Manutencao, multa e
    // pedagio nao movem odometro, e um KM digitado ali sujava a serie que alimenta
    // o consumo (KM/litro) e o custo por KM.
    let km = dados.km === '' || dados.km == null ? null : Number(dados.km);
    if (km !== null && !ehCombustivel) {
      erros.push('KM / horímetro só é aceito em lançamento de combustível. ' +
        'Este tipo de despesa não movimenta o odômetro.');
      km = null;
    }
    if (km !== null) {
      if (!isFinite(km) || !(km > 0)) {
        erros.push('KM/horímetro deve ser um número maior que zero.');
      } else if (km > 1000000000) {
        erros.push('KM/horímetro acima do limite de segurança. Confira a leitura.');
      } else if (data) {
        const vizinhos = vizinhosOdometro_(placa, data);
        if (vizinhos.anterior && km < vizinhos.anterior.km && !dados.forcarKm) {
          erros.push('KM ' + km.toLocaleString('pt-BR') + ' é menor que a leitura anterior (' +
            vizinhos.anterior.km.toLocaleString('pt-BR') + ' em ' + formatarData_(vizinhos.anterior.data) +
            '). Marque "forçar" se houve troca/zeragem real do odômetro.');
        }
        if (vizinhos.posterior && km > vizinhos.posterior.km && !dados.forcarKm) {
          erros.push('KM ' + km.toLocaleString('pt-BR') + ' é maior que uma leitura posterior (' +
            vizinhos.posterior.km.toLocaleString('pt-BR') + ' em ' + formatarData_(vizinhos.posterior.data) +
            '). Confira a data/KM ou marque "forçar" somente se a sequência excepcional for legítima.');
        }
      }
    }

    if (erros.length) return { ok: false, mensagem: erros.join('\n'), duplicidade: !!duplicado };

    // Abastecimento INTERNO nao tem preco proprio: o custo e o do tanque naquele
    // momento. Calculado aqui, DEPOIS das validacoes e ANTES de gravar, porque
    // estadoTanque_ le os lancamentos ja existentes — se este ja estivesse na base,
    // ele consumiria a si mesmo.
    let valorFinal = valor;
    let custoBomba = null;
    if (saiDoTanque && tipoAbastecimento === ABASTECIMENTO_INTERNO && litros > 0) {
      const produtoTanque = produtoDoTipo_(dados.tipo) || PRODUTO_DIESEL;
      const tanque = estadoTanque_(produtoTanque, data);
      if (!(tanque.custoMedio > 0)) {
        return {
          ok: false,
          mensagem: 'Não há carga de ' + produtoTanque + ' registrada até ' +
            formatarData_(data) + ', então o sistema não sabe quanto custa o litro do tanque. ' +
            'Registre a NF de carga em "' + ABAS.CARGA_BOMBA + '" antes deste abastecimento.',
        };
      }
      if (tanque.litros < litros) {
        return {
          ok: false,
          mensagem: 'O tanque tem ' + tanque.litros.toFixed(3) + ' L de ' + produtoTanque +
            ' em ' + formatarData_(data) + ', menos que os ' + litros.toFixed(3) +
            ' L deste abastecimento. Confira a carga da bomba ou a quantidade lançada.',
        };
      }
      custoBomba = tanque.custoMedio;
      valorFinal = Math.round(litros * custoBomba * 100) / 100;
    }

    const lancamentos = aba_(ABAS.LANCAMENTOS);
    const idLancamento = novoIdLancamento_();
    const linha = proximaLinhaLancamento_();
    // V4.8 (velocidade): a linha inteira em DUAS gravações (antes eram 9 + 3 formatos).
    // Os formatos de coluna já vêm da instalação; a coluna J (Período) é fórmula e fica de fora.
    const veic = resolucaoVeiculo.veiculo;
    const centroSnap = normalizarCentroCusto_(veic.centro) || '⚠ sem cadastro';
    const categoriaSnap = String(veic.categoria || '').trim() || '⚠ sem cadastro';
    // A lista de validação da coluna Tipo/Natureza pode ser de uma versão anterior (sem
    // "Gás", "Carro Novo", "Serviço"...). Com validação estrita o Google grava a data e
    // a placa e interrompe no tipo, deixando a linha pela metade. Atualiza antes.
    garantirValidacaoTiposLancamento_(lancamentos, dados.tipo, naturezaOficina);
    try {
      lancamentos.getRange(linha, 1, 1, COL_LANC.PERIODO - 1).setValues([[
        data, placa, dados.tipo, litros || '', valorFinal || 0,
        documentoFinal, observacao, centroSnap, categoriaSnap
      ]]);
      lancamentos.getRange(linha, COL_LANC.ID, 1, TOTAL_COL_LANC - COL_LANC.ID + 1).setValues([[
        idLancamento, naturezaOficina, detalheOficina, fornecedor, tipoAbastecimento
      ]]);
    } catch (erroGravacao) {
      // Nunca deixa linha pela metade na base.
      try {
        lancamentos.getRange(linha, 1, 1, COL_LANC.PERIODO - 1).clearContent();
        lancamentos.getRange(linha, COL_LANC.ID, 1, TOTAL_COL_LANC - COL_LANC.ID + 1).clearContent();
      } catch (e) {}
      return { ok: false, mensagem: 'Não foi possível gravar: ' + erroGravacao.message +
        ' Rode "Instalar / atualizar sistema" na planilha e tente de novo.' };
    }

    let mensagem = 'Lançamento gravado: ' + placa + ' • ' + dados.tipo +
      (ehOficina ? ' • ' + naturezaOficina : '') +
      (fornecedor ? ' • ' + fornecedor : '') +
      ' • R$ ' + valorFinal.toFixed(2).replace('.', ',') + ' • ' + idLancamento;
    if (custoBomba !== null) {
      mensagem += ' • bomba a R$ ' + custoBomba.toFixed(4).replace('.', ',') + '/L';
    }

    if (km !== null) {
      const odometro = aba_(ABAS.ODOMETRO);
      const linhaOdo = odometro.getLastRow() + 1;
      garantirLinhas_(odometro, linhaOdo);
      odometro.getRange(linhaOdo, 1, 1, 3).setValues([[data, placa, km]]);
      // O cache tem de cair AQUI, nao so no fim da requisicao: o proprio fluxo
      // de gravacao le o odometro depois (resumo, validacao), e serviria a
      // leitura anterior a esta — cache velho e pior do que cache nenhum.
      invalidarCacheOdometro_();
      mensagem += ' • KM ' + km;
    }

    registrarLog_('Lançamento', idLancamento + ' • ' + placa + ' • ' + dados.tipo + ' • R$ ' + valorFinal.toFixed(2));
    invalidarCacheInicio_();
    // V4.8: o Resumo é recalculado aqui (antes era fórmula), só na linha do veículo
    // afetado. Dentro do lock, então duas gravações simultâneas não se atropelam.
    atualizarResumoPlacaSeguro_(placa);
    return { ok: true, mensagem: mensagem, id: idLancamento, valor: valorFinal, custoBomba: custoBomba };
  } finally {
    if (!semLockSalvar) lock.releaseLock();
  }
}


/** Gateway público exclusivo do formulário lateral vinculado à planilha. */
function salvarLancamentoPlanilha(dados) {
  if (!execucaoTemPlanilhaAtiva_() || !emailUsuarioPlanilha_(null)) {
    throw new Error('Este endpoint de lançamento só pode ser usado pelo formulário da planilha vinculada.');
  }
  return salvarLancamento_(dados);
}

// ==========================================================================
// 05_Importador.gs
// ==========================================================================

/**
 * Importa um MAPA no formato antigo (uma aba por veiculo) para as tabelas
 * normalizadas. Serve para trazer meses anteriores ou para conviver com o
 * modelo antigo durante a transicao.
 *
 * O arquivo precisa estar no Drive JA CONVERTIDO para Planilhas Google
 * (Arquivo > Salvar como Planilhas Google), porque o Apps Script nao le .xlsx.
 */

const ABAS_IGNORADAS_IMPORT = ['Resumo', 'Grafico', 'Gráfico', 'Centro Custo',
  'Centro de Custo', 'Parâmetros', 'Dashboard'];

/** Layout antigo: coluna (1-indexada) de cada informacao. */
const LAYOUT_ANTIGO = {
  veiculo: {
    litrosTerceiros: 2, valorTerceiros: 3, litrosProprio: 4, valorProprio: 5,
    litrosLubrificante: 6, valorLubrificante: 7, lavacao: 8, oficinaDespesa: 9,
    oficinaAtivo: 10, oficinaDebLoja: 11, pneus: 12, multa: 13,
    pedagio: 14, odometro: 15, setor: 16, total: 17,
  },
  empilhadeira: {
    litrosTerceiros: 2, valorTerceiros: 3, litrosProprio: 4, valorProprio: 5,
    litrosLubrificante: 6, valorLubrificante: 7, lavacao: 8, oficinaDespesa: 9,
    oficinaAtivo: 10, pneus: 11, emplacamento: 12, pedagio: 13,
    odometro: 14, setor: 15, total: 16,
  },
};

/** campo do layout -> tipo de despesa do sistema (e campo de litros, se houver). */
const MAPA_TIPOS = [
  { tipo: 'Combustivel Terceiros', valor: 'valorTerceiros', litros: 'litrosTerceiros' },
  { tipo: 'Combustivel Proprio', valor: 'valorProprio', litros: 'litrosProprio' },
  { tipo: 'Lubrificante', valor: 'valorLubrificante', litros: 'litrosLubrificante' },
  { tipo: 'Lavacao/Graxa', valor: 'lavacao' },
  { tipo: 'Oficina Despesa', valor: 'oficinaDespesa' },
  { tipo: 'Oficina Ativo', valor: 'oficinaAtivo' },
  { tipo: 'Oficina Deb Loja', valor: 'oficinaDebLoja' },
  { tipo: 'Pneus', valor: 'pneus' },
  { tipo: 'Multa', valor: 'multa' },
  { tipo: 'Diaria/Pedagio', valor: 'pedagio' },
  { tipo: 'Emplacamento/IPVA/Seguro', valor: 'emplacamento' },
];

function importarMapaAntigo() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();

  const respostaUrl = ui.prompt(
    'Importar MAPA antigo',
    `Cole o link (ou o ID) da planilha no formato antigo.

Ela precisa estar no Drive convertida para Planilhas Google.`,
    ui.ButtonSet.OK_CANCEL);
  if (respostaUrl.getSelectedButton() !== ui.Button.OK) return;
  const id = extrairIdPlanilha_(respostaUrl.getResponseText());
  if (!id) { alerta_('Importação', 'Não consegui identificar o ID da planilha.'); return; }

  const respostaMes = ui.prompt(
    'Período do arquivo',
    `Qual o mês de referência desse MAPA? Use o formato AAAA-MM (ex.: 2026-07).

O período vai do dia 26 do mês anterior ao dia 25 desse mês.`,
    ui.ButtonSet.OK_CANCEL);
  if (respostaMes.getSelectedButton() !== ui.Button.OK) return;
  let mesRef = '';
  try { mesRef = normalizarMesReferencia_(respostaMes.getResponseText().trim()); }
  catch (e) { alerta_('Importação', 'Mês inválido. Use o formato AAAA-MM.'); return; }

  const periodo = periodoDoMes_(mesRef);
  toast_('Validando a planilha de origem…');
  let resultado;
  try { resultado = lerMapaAntigo_(id, periodo); }
  catch (e) {
    alerta_('Importação cancelada', `A origem não pôde ser lida. Nada foi alterado.\n\n${e.message}`);
    return;
  }
  if (!resultado || resultado.abasLidas < 1 || !resultado.lancamentos.length) {
    alerta_('Importação cancelada', 'Nenhum lançamento válido foi preparado. Nada foi alterado.');
    return;
  }

  const jaExistem = contarLancamentosNoPeriodo_(periodo);
  if (jaExistem > 0) {
    const confirma = ui.alert(
      'Substituir período existente?',
      `Origem validada: ${resultado.abasLidas} aba(s), ${resultado.lancamentos.length} lançamento(s).

A base atual possui ${jaExistem} lançamento(s) em ${formatarData_(periodo.inicio)} a ${formatarData_(periodo.fim)}.

SIM = criar backup e substituir o período
NÃO = cancelar sem alterar nada.`,
      ui.ButtonSet.YES_NO);
    if (confirma !== ui.Button.YES) return;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    alerta_('Importação', 'Outra operação crítica está em andamento. Tente novamente em instantes.');
    return;
  }
  let backup = null;
  try {
    // Com o lock já obtido, o backup representa exatamente o estado que será substituído.
    backup = criarBackupSistema_('pré-importação ' + mesRef);
    if (jaExistem > 0) apagarPeriodo_(periodo);
    const usadosDepois = resultado.lancamentos.length + quantidadeLancamentosReais_();
    garantirCapacidadeLancamentos_(usadosDepois + 1);
    if (resultado.lancamentos.length) {
      const sheet = aba_(ABAS.LANCAMENTOS);
      const primeira = proximaLinhaLancamento_();
      // V4.8: cada linha importada tem 7 campos (DATA..OBSERVAÇÃO). Gravar numa faixa de
      // 8 colunas fazia o setValues falhar e a importação inteira ser revertida.
      sheet.getRange(primeira, 1, resultado.lancamentos.length, BLOCO_ENTRADA_LANC).setValues(resultado.lancamentos);
      const ids = resultado.lancamentos.map(function(){ return [novoIdLancamento_()]; });
      sheet.getRange(primeira, COL_LANC.ID, ids.length, 1).setValues(ids).setNumberFormat('@');
      const classImport = resultado.lancamentos.map(function (l) {
        const c = classificacaoVeiculoAtual_(l[1]);
        return [c.centro, c.categoria];
      });
      sheet.getRange(primeira, COL_LANC.CENTRO, classImport.length, 2).setValues(classImport);
    }
    if (resultado.odometros.length) {
      const sheet = aba_(ABAS.ODOMETRO);
      sheet.getRange(sheet.getLastRow() + 1, 1, resultado.odometros.length, 3).setValues(resultado.odometros);
      invalidarCacheOdometro_();
    }
    cadastrarVeiculosNovos_(resultado.veiculos);
    formatarLancamentos_();
    formatarOdometro_();
    reconstruirRelatorios_();
    escreverConferencia_(coletarProblemas_());
    invalidarCacheInicio_();
    registrarLog_('Importar MAPA antigo', mesRef + ' • ' + resultado.lancamentos.length +
      ' lançamentos • backup ' + backup.nome);
  } catch (e) {
    if (!backup) {
      alerta_('Importação cancelada', 'Não foi possível criar/validar o backup obrigatório. Nada foi substituído.\n\n' + e.message);
      return;
    }
    registrarLog_('Falha importação', mesRef + ' • ' + e.message + ' • restaurando ' + backup.nome);
    try { restaurarDadosDeBackupSemLock_(backup.id); }
    catch (rest) {
      alerta_('Falha crítica na importação', `A importação falhou e a restauração automática também encontrou erro.

Backup preservado: ${backup.nome}

Importação: ${e.message}
Restauração: ${rest.message}`);
      throw e;
    }
    alerta_('Importação revertida', `A importação encontrou um erro e o sistema restaurou automaticamente o backup anterior.\n\n${e.message}`);
    return;
  } finally {
    lock.releaseLock();
  }

  alerta_('Importação concluída',
    `Abas lidas: ${resultado.abasLidas}
Lançamentos importados: ${resultado.lancamentos.length}
Leituras de odômetro: ${resultado.odometros.length}
Veículos novos cadastrados: ${resultado.novos}

Backup de segurança: ${backup.nome}

` +
    (resultado.avisos.length ? 'Avisos:\n• ' + resultado.avisos.slice(0, 15).join('\n• ') : 'Nenhum aviso.'));
}

function extrairIdPlanilha_(texto) {
  const valor = String(texto || '').trim();
  const m = valor.match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

function lerMapaAntigo_(id, periodo) {
  const origem = SpreadsheetApp.openById(id);
  const calendario = calendarioDoPeriodo_(periodo);
  const lancamentos = [];
  const odometros = [];
  const veiculos = [];
  const avisos = [];
  let abasLidas = 0;

  origem.getSheets().forEach(function (sheet) {
    const nome = sheet.getName();
    if (ABAS_IGNORADAS_IMPORT.indexOf(nome) !== -1) return;
    if (sheet.getLastRow() < 36) return;

    const bloco = sheet.getRange(1, 1, 40, 18).getValues();
    const ehVeiculo = String(bloco[1][16]).trim().toUpperCase() === 'TOTAL' ||
      String(bloco[3][16]).trim().toUpperCase().indexOf('VE') === 0;
    const cols = ehVeiculo ? LAYOUT_ANTIGO.veiculo : LAYOUT_ANTIGO.empilhadeira;
    abasLidas++;

    const placa = normalizaPlaca_(nome);
    veiculos.push({
      placa: placa,
      descricao: String(bloco[0][6] || bloco[0][5] || '').trim(),
      depreciacao: numero_(bloco[38][3]),
      emplacamento: ehVeiculo ? numero_(bloco[0][10]) : 0,
      seguro: ehVeiculo ? numero_(bloco[0][12]) : 0,
      bonus: numero_(bloco[0][2]),
      codigo: String(bloco[38][4] || bloco[38][2] || '').trim(),
      aba: nome,
    });

    for (let linha = 5; linha <= 35; linha++) {
      const dia = numero_(bloco[linha][0]);
      if (!dia) continue;
      const data = calendario[dia];
      if (!data) continue;
      const setor = String(bloco[linha][cols.setor - 1] || '').trim();

      MAPA_TIPOS.forEach(function (item) {
        if (!cols[item.valor]) return;
        const valor = numero_(bloco[linha][cols[item.valor] - 1]);
        const litros = item.litros ? numero_(bloco[linha][cols[item.litros] - 1]) : 0;
        if (!valor && !litros) return;
        lancamentos.push([
          data, placa, item.tipo,
          litros || '', valor || 0, '',
          'Importado de ' + nome + (setor ? ' • setor de origem: ' + setor : ''),
        ]);
      });

      const km = numero_(bloco[linha][cols.odometro - 1]);
      if (km) odometros.push([data, placa, km]);
    }

    const totalAba = numero_(bloco[36][cols.total - 1]);
    if (totalAba) {
      const totalLido = lancamentos
        .filter(function (l) {
          return l[1] === placa && TIPOS_FORA_DO_CUSTO.indexOf(l[2]) === -1;
        })
        .reduce(function (soma, l) { return soma + Number(l[4] || 0); }, 0);
      if (Math.abs(totalAba - totalLido) > 0.05) {
        avisos.push(nome + ': total da aba ' + totalAba.toFixed(2) +
          ' x importado ' + totalLido.toFixed(2));
      }
    }
  });

  const novos = cadastrarVeiculosNovos_(veiculos, true);
  return {
    lancamentos: lancamentos,
    odometros: odometros,
    veiculos: veiculos,
    abasLidas: abasLidas,
    novos: novos,
    avisos: avisos,
  };
}

/**
 * Dia da linha -> data real. As linhas 26..31 caem no mes anterior; quando o mes
 * tem menos dias, sobram linhas que sao dobradas no ultimo dia real.
 */
function calendarioDoPeriodo_(periodo) {
  const calendario = {};
  const ultimoDiaAnterior = new Date(
    periodo.inicio.getFullYear(), periodo.inicio.getMonth() + 1, 0).getDate();
  for (let dia = periodo.inicio.getDate(); dia <= 31; dia++) {
    calendario[dia] = new Date(
      periodo.inicio.getFullYear(), periodo.inicio.getMonth(),
      Math.min(dia, ultimoDiaAnterior));
  }
  for (let dia = 1; dia <= periodo.fim.getDate(); dia++) {
    calendario[dia] = new Date(periodo.fim.getFullYear(), periodo.fim.getMonth(), dia);
  }
  return calendario;
}

function numero_(valor) {
  if (typeof valor === 'number') return valor;
  const limpo = String(valor == null ? '' : valor).replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

/** Acrescenta na aba Veículos os IDs que ainda nao existem. Retorna quantos entraram. */
function cadastrarVeiculosNovos_(veiculos, apenasContar) {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.VEICULOS);
  const existentes = {};
  listaPlacas_(false).forEach(function (p) { existentes[p] = true; });

  const novos = veiculos.filter(function (v) { return v.placa && !existentes[v.placa]; });
  if (apenasContar) return novos.length;
  if (!novos.length) return 0;

  const linhas = novos.map(function (v) {
    return [v.placa, v.descricao, 'Leve', '', v.codigo, v.depreciacao,
      v.emplacamento, v.seguro, v.bonus, '', 'SIM', v.aba, 0];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, TOTAL_COL_VEIC).setValues(linhas);
  VEICULOS_EXEC_CACHE_ = null;
  invalidarCacheInicio_();
  marcarResumoDesatualizado_();
  return linhas.length;
}

function contarLancamentosCompetencia_(mesRef) {
  // V4.8: conta pela DATA, não pela coluna J. Com J em #REF! a contagem dava zero e
  // o contador "lançamentos no período" do painel ficava vazio.
  const alvo = normalizarMesReferencia_(mesRef);
  const periodo = periodoDoMes_(alvo);
  const sheet = aba_(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (n < 1) return 0;
  return sheet.getRange(2, 1, n, 2).getValues().reduce(function (total, l) {
    const d = l[0];
    return total + (l[1] && d instanceof Date && d >= periodo.inicio && d <= periodo.fim ? 1 : 0);
  }, 0);
}

function contarLancamentosNoPeriodo_(periodo) {
  if (periodo && periodo.mesRef) return contarLancamentosCompetencia_(periodo.mesRef);
  const sheet = aba_(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (n < 1) return 0;
  return sheet.getRange(2, 1, n, 1).getValues()
    .filter(function (linha) {
      const data = linha[0];
      return data instanceof Date && data >= periodo.inicio && data <= periodo.fim;
    }).length;
}

/** Apaga lançamentos e leituras de odômetro dentro do período informado. */
function apagarPeriodo_(periodo) {
  exigirExecucaoMutacao_();
  [ABAS.LANCAMENTOS, ABAS.ODOMETRO].forEach(function (nome) {
    const sheet = aba_(nome);
    const ultimaDados = nome === ABAS.LANCAMENTOS ? ultimaLinhaLancamentoReal_() : sheet.getLastRow();
    if (ultimaDados < 2) return;
    const datas = sheet.getRange(2, 1, ultimaDados - 1, 1).getValues();
    const linhas = [];
    datas.forEach(function(l, i) {
      const data = l[0];
      if (data instanceof Date && data >= periodo.inicio && data <= periodo.fim) linhas.push(i + 2);
    });
    // Exclui blocos contíguos de baixo para cima: muito mais rápido que deleteRow linha a linha.
    for (let i = linhas.length - 1; i >= 0;) {
      let fim = linhas[i], inicio = fim;
      while (i > 0 && linhas[i - 1] === inicio - 1) { i--; inicio = linhas[i]; }
      sheet.deleteRows(inicio, fim - inicio + 1);
      i--;
    }
  });
}

// ==========================================================================
// 06_Fechamento.gs
// ==========================================================================

/**
 * Fechamento do periodo: congela o Resumo numa aba de arquivo, grava o total no
 * Historico e abre o mes seguinte.
 */

function validarFechamentoCompleto_() {
  const dep = statusDepreciacaoMensal_();
  if (!dep.liberada) return { ok: false, mensagem: 'Fechamento ainda não liberado. Disponível a partir de ' + dep.dataLancamento + '.' };
  if (dep.pendentes > 0 || dep.divergentes > 0) {
    return { ok: false, mensagem: 'Regularize a depreciação mensal. Pendentes: ' + dep.pendentes + ' • Divergentes: ' + dep.divergentes + '.' };
  }
  const problemas = coletarProblemas_({ fechamento: true });
  escreverConferencia_(problemas);
  const pendencias = contarPendenciasConferencia_();
  if (pendencias > 0) {
    return { ok: false, mensagem: 'Fechamento bloqueado: existem ' + pendencias +
      ' pendência(s) ativa(s). Resolva ou marque como RESOLVIDO após conferência e revalide os dados.' };
  }
  return { ok: true, depreciacao: dep, pendencias: 0 };
}

function executarFechamentoCritico_(mesRef) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, mensagem: 'Outra operação crítica está em andamento. Tente novamente em instantes.' };
  try {
    const atual = normalizarMesReferencia_(param_('MES_REFERENCIA'));
    if (atual !== mesRef) return { ok: false, mensagem: 'A competência mudou durante a operação. Atualize a tela e tente novamente.' };
    const validacao = validarFechamentoCompleto_();
    if (!validacao.ok) return validacao;
    reconstruirRelatorios_();
    const total = totalGeralResumo_();
    const backup = criarBackupSistema_('pré-fechamento ' + mesRef);
    // Fotografia independente obrigatória: se falhar, o fechamento não avança.
    const exportacao = exportarPeriodoPlanilha_(mesRef, 'automático pré-fechamento');
    congelarResumo_(mesRef);
    gravarHistorico_(mesRef, total);
    // Período com datas livres: o próximo começa no dia seguinte ao fim dele, para não
    // deixar dias sem período (buraco) nem contados duas vezes.
    const livreFechado = periodoLivreAtivo_(mesRef);
    const proximo = proximoMes_(mesRef);
    if (livreFechado) {
      limparPeriodoLivre_();
      const fimPadrao = periodoDoMes_(proximo).fim;
      const iniProx = new Date(livreFechado.fim.getFullYear(), livreFechado.fim.getMonth(), livreFechado.fim.getDate() + 1);
      if (iniProx <= fimPadrao) gravarPeriodoLivre_(proximo, iniProx, fimPadrao);
    }
    gravarParam_('MES_REFERENCIA', proximo);
    reconstruirRelatorios_();
    escreverConferencia_(coletarProblemas_());
    invalidarCacheInicio_();
    registrarLog_('Fechar período', mesRef + ' • R$ ' + Number(total).toFixed(2) + ' • backup ' + backup.nome);
    return { ok: true, total: Number(total) || 0, backup: backup, exportacao: exportacao };
  } finally { lock.releaseLock(); }
}

function fecharPeriodo() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();
  const mesRef = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const periodo = periodoAtual_();
  const previa = validarFechamentoCompleto_();
  if (!previa.ok) { alerta_('Fechamento bloqueado', previa.mensagem); return; }
  reconstruirRelatorios_();
  const total = totalGeralResumo_();
  const confirma = ui.alert(
    'Fechar ' + nomeDoMes_(mesRef),
    `Período: ${formatarData_(periodo.inicio)} a ${formatarData_(periodo.fim)}
Custo total apurado: R$ ${Number(total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Pendências ativas: 0

O sistema validará novamente, criará um backup verificado, uma exportação independente do período e só então fechará. Confirma?`,
    ui.ButtonSet.YES_NO);
  if (confirma !== ui.Button.YES) return;
  const r = executarFechamentoCritico_(mesRef);
  if (!r.ok) { alerta_('Fechamento não realizado', r.mensagem); return; }
  alerta_('Período fechado', `${nomeDoMes_(mesRef)} fechado em R$ ${r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.

Backup: ${r.backup.nome}
Exportação do período: ${r.exportacao ? r.exportacao.nome : 'não informada'}
Agora o sistema está aberto em ${nomeDoMes_(proximoMes_(mesRef))}.`);
}

/** Copia o Resumo do mês para uma aba somente-leitura. */
function congelarResumo_(mesRef) {
  exigirExecucaoMutacao_();
  const nome = 'Fechado ' + mesRef;
  const planilha = ss_();
  const existente = planilha.getSheetByName(nome);
  if (existente) planilha.deleteSheet(existente);

  const resumo = aba_(ABAS.RESUMO);
  const copia = resumo.copyTo(planilha).setName(nome);
  const intervalo = copia.getDataRange();
  intervalo.copyTo(intervalo, SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
  const filtro = copia.getFilter();
  if (filtro) filtro.remove();
  copia.setTabColor('#999999');
  planilha.setActiveSheet(copia);
  planilha.moveActiveSheet(planilha.getNumSheets());
  // A fotografia do fechamento nasce protegida; não depende de uma sincronização posterior.
  try { protegerFolhaPerfil_(copia, nome, emailsUsuariosAtivosPorPerfil_(['ADMIN']), []); }
  catch (e) { registrarLog_('Aviso proteção fechamento', nome + ' • ' + e.message); }
  return copia;
}

/** Hash SHA-256 em hexadecimal para lacre de integridade histórica. */
function hashIntegridade_(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(texto == null ? '' : texto), Utilities.Charset.UTF_8);
  return bytes.map(function(b){ const v=b<0?b+256:b; return ('0'+v.toString(16)).slice(-2); }).join('');
}

/**
 * Competência (AAAA-MM) de uma data, pelo MESMO dia de corte do período.
 * V4.8: antes o 26 era fixo aqui, enquanto o resto do sistema já usava DIA_FIM_PERIODO.
 * O corte é lido uma vez por execução (cache), porque isto roda uma vez por lançamento.
 */
let CORTE_COMPETENCIA_EXEC_ = null;

function mesCompetenciaDaData_(data) {
  if (!(data instanceof Date) || isNaN(data.getTime())) return '';
  if (CORTE_COMPETENCIA_EXEC_ === null) {
    CORTE_COMPETENCIA_EXEC_ = ehMesCivil_() ? 31 : diaCortePeriodo_();
  }
  // Datas dentro de um período com datas livres pertencem à competência dele.
  const livre = lerPeriodoLivre_();
  if (livre && data >= livre.inicio && data <= livre.fim) return livre.mes;
  let ano = data.getFullYear();
  let mes = data.getMonth() + 1;
  if (data.getDate() > CORTE_COMPETENCIA_EXEC_) { mes++; if (mes > 12) { mes = 1; ano++; } }
  const pelaRegra = ano + '-' + ('0' + mes).slice(-2);
  // Dias que o corte poria na competência livre, mas que ficaram fora das datas
  // escolhidas, vão para o mês vizinho (depois do fim -> seguinte; antes -> anterior).
  if (livre && pelaRegra === livre.mes) {
    if (data > livre.fim) return proximoMes_(livre.mes);
    if (data < livre.inicio) {
      const partes = livre.mes.split('-').map(Number);
      const m = partes[1] === 1 ? 12 : partes[1] - 1;
      return (partes[1] === 1 ? partes[0] - 1 : partes[0]) + '-' + ('0' + m).slice(-2);
    }
  }
  return pelaRegra;
}

/**
 * Lê uma vez Lançamentos/Odômetro e monta um lacre por competência.
 * O hash é independente da ordem das linhas e inclui o ID do lançamento.
 */
function snapshotIntegridadeBase_() {
  const grupos = {};
  function grupo(mes) {
    if (!grupos[mes]) grupos[mes] = { itens: [], qtdLancamentos: 0, qtdOdometros: 0 };
    return grupos[mes];
  }
  const lanc = ss_().getSheetByName(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (lanc && n > 0) {
    const dados = lanc.getRange(2, 1, n, COL_LANC.ID).getValues();
    dados.forEach(function(l) {
      if (!l[1] || !(l[0] instanceof Date) || isNaN(l[0].getTime())) return;
      const mes = mesCompetenciaDaData_(l[0]);
      const g = grupo(mes);
      const dataIso_ = Utilities.formatDate(l[0], timezone_(), 'yyyy-MM-dd');
      // Campos nomeados. Alem de corrigir o deslocamento, isto documenta o que
      // entra no hash — e o hash de um periodo fechado nao pode mudar por acidente.
      //
      // ATENCAO: a composicao MUDOU na V4.7.2, porque o Setor saiu da base. Hash de
      // periodo fechado antes da migracao nao bate mais, e nao ha como recalcula-lo:
      // o dado de origem nao existe. Por isso o prefixo de versao — assim a diferenca
      // aparece como "schema diferente", e nao como "base adulterada".
      const item = ['L2', dataIso_, normalizaPlaca_(l[L_.PLACA]), String(l[L_.TIPO]||'').trim(),
        Number(l[L_.LITROS]||0).toFixed(6), Number(l[L_.VALOR]||0).toFixed(2),
        String(l[L_.DOCUMENTO]||'').trim(), String(l[L_.OBSERVACAO]||'').trim(),
        String(l[L_.CENTRO]||'').trim(), String(l[L_.CATEGORIA]||'').trim(),
        String(l[L_.ID]||'').trim()].join('|');
      g.itens.push(item); g.qtdLancamentos++;
    });
  }
  const odo = ss_().getSheetByName(ABAS.ODOMETRO);
  if (odo && odo.getLastRow() >= 2) {
    lerOdometro_().forEach(function(l) {
      if (!l[1] || !(l[0] instanceof Date) || isNaN(l[0].getTime())) return;
      const mes = mesCompetenciaDaData_(l[0]);
      const g = grupo(mes);
      const dataIso_ = Utilities.formatDate(l[0], timezone_(), 'yyyy-MM-dd');
      g.itens.push(['O', dataIso_, normalizaPlaca_(l[1]), Number(l[2]||0).toFixed(3)].join('|'));
      g.qtdOdometros++;
    });
  }
  Object.keys(grupos).forEach(function(mes) {
    grupos[mes].itens.sort();
    grupos[mes].hash = hashIntegridade_(grupos[mes].itens.join('\n'));
    delete grupos[mes].itens;
  });
  return grupos;
}

/** Cria um baseline V4.5 para históricos antigos que ainda não tinham lacre. */
function garantirMetadadosHistorico_() {
  const sheet = ss_().getSheetByName(ABAS.HISTORICO);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  garantirColunas_(sheet, 6);
  const linhas = sheet.getLastRow()-1;
  const dados = sheet.getRange(2,1,linhas,6).getValues();
  const snapshot = snapshotIntegridadeBase_();
  let alterou = false, total = 0;
  dados.forEach(function(l) {
    let mes='';
    try { mes = normalizarMesReferencia_(l[0]); } catch(e) { return; }
    if (String(l[3]||'').trim()) return;
    const s = snapshot[mes] || { hash: hashIntegridade_(''), qtdLancamentos: 0, qtdOdometros: 0 };
    l[2] = s.qtdLancamentos;
    l[3] = s.hash;
    l[4] = new Date();
    l[5] = 'BASELINE V4.5 — estado existente na atualização';
    alterou = true; total++;
  });
  if (alterou) sheet.getRange(2,1,linhas,6).setValues(dados);
  return total;
}

function auditarIntegridadeHistorico_() {
  const sheet = ss_().getSheetByName(ABAS.HISTORICO);
  if (!sheet || sheet.getLastRow() < 2) return { ok:true, divergencias:[], semHash:0, semFechado:[], verificados:0 };
  const snapshot = snapshotIntegridadeBase_();
  const dados = sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues();
  const divergencias=[]; const semFechado=[]; let semHash=0, verificados=0;
  dados.forEach(function(l) {
    if (!l[0]) return;
    let mes=''; try { mes=normalizarMesReferencia_(l[0]); } catch(e) { return; }
    if (!ss_().getSheetByName('Fechado ' + mes)) semFechado.push(mes);
    const esperado=String(l[3]||'').trim();
    if (!esperado) { semHash++; return; }
    const atual=(snapshot[mes]||{hash:hashIntegridade_('')}).hash;
    verificados++;
    if (atual !== esperado) divergencias.push(mes);
  });
  const ok = divergencias.length===0 && semHash===0;
  if (ok) {
    try { PropertiesService.getScriptProperties().deleteProperty(PROP_ALERTA_INTEGRIDADE_HISTORICO_); } catch (e) {}
    invalidarCacheSaude_();
  }
  return { ok: ok, divergencias:divergencias, semHash:semHash, semFechado:semFechado, verificados:verificados };
}

/** Insere (ou atualiza) a linha do mês no Histórico e sela a base fechada. */
function gravarHistorico_(mesRef, total) {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.HISTORICO);
  garantirColunas_(sheet, 6);
  const snap = snapshotIntegridadeBase_()[mesRef] || { hash: hashIntegridade_(''), qtdLancamentos: 0 };
  const responsavel = emailContextoAtual_();
  const linhaNova = [mesRef, total, snap.qtdLancamentos || 0, snap.hash, new Date(), responsavel];
  const ultima = sheet.getLastRow();
  if (ultima >= 2) {
    const periodos = sheet.getRange(2, 1, ultima - 1, 1).getValues();
    for (let i = 0; i < periodos.length; i++) {
      // V4.8: compara normalizado. A célula pode guardar uma data (o Sheets converte
      // "2026-07" sozinho), e a comparação de texto criava uma linha duplicada.
      let mesLinha = '';
      try { mesLinha = normalizarMesReferencia_(periodos[i][0]); } catch (e) { mesLinha = String(periodos[i][0]).trim(); }
      if (mesLinha === mesRef) {
        sheet.getRange(i + 2, 1).setNumberFormat('@');
        sheet.getRange(i + 2, 1, 1, 6).setValues([linhaNova]);
        sheet.getRange(i + 2, 2).setNumberFormat('R$ #,##0.00');
        sheet.getRange(i + 2, 5).setNumberFormat('dd/mm/yyyy hh:mm:ss');
        return;
      }
    }
  }
  const nova = sheet.getLastRow() + 1;
  sheet.getRange(nova, 1).setNumberFormat('@');
  sheet.getRange(nova, 1, 1, 6).setValues([linhaNova]);
  sheet.getRange(sheet.getLastRow(), 2).setNumberFormat('R$ #,##0.00');
  sheet.getRange(sheet.getLastRow(), 5).setNumberFormat('dd/mm/yyyy hh:mm:ss');
}


/** "2026-07" -> "2026-08" */
function proximoMes_(mesRef) {
  const partes = String(mesRef).trim().split('-');
  let ano = Number(partes[0]);
  let mes = Number(partes[1]) + 1;
  if (mes > 12) { mes = 1; ano++; }
  return ano + '-' + ('0' + mes).slice(-2);
}

/** Volta o sistema para o mês anterior (desfaz um avanço feito por engano). */
function reabrirMesAnterior() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();
  const mesRef = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const partes = mesRef.split('-');
  let ano = Number(partes[0]);
  let mes = Number(partes[1]) - 1;
  if (mes < 1) { mes = 12; ano--; }
  const anterior = ano + '-' + ('0' + mes).slice(-2);

  const confirma = ui.alert('Reabrir período',
    'Voltar o parâmetro MES_REFERENCIA de ' + mesRef + ' para ' + anterior + '?\n' +
    'As abas "Fechado ..." já criadas continuam intactas. Um backup validado será criado antes da alteração.',
    ui.ButtonSet.YES_NO);
  if (confirma !== ui.Button.YES) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) { alerta_('Reabertura', 'Outra operação crítica está em andamento. Tente novamente em instantes.'); return; }
  try {
    const atual = normalizarMesReferencia_(param_('MES_REFERENCIA'));
    if (atual !== mesRef) { alerta_('Reabertura cancelada', 'A competência mudou durante a operação. Atualize e tente novamente.'); return; }
    const backup = criarBackupSistema_('pré-reabertura ' + mesRef + ' -> ' + anterior);
    gravarParam_('MES_REFERENCIA', anterior);
    reconstruirRelatorios_();
    escreverConferencia_(coletarProblemas_());
    invalidarCacheInicio_();
    registrarLog_('Reabrir período', mesRef + ' -> ' + anterior + ' • backup ' + backup.nome);
    toast_('Período reaberto em ' + nomeDoMes_(anterior));
  } finally { lock.releaseLock(); }
}

// ==========================================================================
// 07_Validacao.gs
// ==========================================================================

/**
 * Conferencia de qualidade dos dados. Gera a aba "Pendências de Conferência"
 * com tudo que precisa de olho humano antes de fechar o mes.
 */

function validarDados() {
  exigirExecucaoMutacao_();
  const problemas = coletarProblemas_();
  escreverConferencia_(problemas);
  invalidarCacheInicio_();
  registrarLog_('Validar dados', problemas.length + ' ponto(s)');
  alerta_('Validação concluída',
    problemas.length
      ? 'Encontrei ' + problemas.length + ' ponto(s) para conferir.\n' +
        'Veja a aba "' + ABAS.CONFERENCIA + '".'
      : 'Nenhum problema encontrado. Dados consistentes.');
}

/** Roda todas as checagens e devolve a lista de problemas. */
function coletarProblemas_(opcoesColeta) {
  const problemas = [];
  const periodo = periodoAtual_();
  const placas = {};
  const placasAtivas = {};
  const veiculosDados = aba_(ABAS.VEICULOS).getDataRange().getValues().slice(1);
  const patrimonios = {};
  veiculosDados.forEach(function (linha) {
    const placa = String(linha[COL_VEIC.PLACA - 1] || '').trim();
    if (!placa) return;
    placas[placa] = linha;
    if (String(linha[COL_VEIC.ATIVO - 1] || '').trim().toUpperCase() !== 'NAO') placasAtivas[placa] = true;
    const pat = chavePatrimonio_(linha[COL_VEIC.CODIGO - 1]);
    if (pat) { if(!patrimonios[pat]) patrimonios[pat]=[]; patrimonios[pat].push(placa); }
  });
  Object.keys(patrimonios).forEach(function(pat){
    if(patrimonios[pat].length>1) problemas.push([ABAS.VEICULOS,pat,'Código Patrimônio duplicado',patrimonios[pat].join(', ')]);
  });

  // ---- V4.8: células do cadastro com erro de fórmula (ex.: descrição "=#REF!").
  veiculosDados.forEach(function (linha, i) {
    const placa = String(linha[COL_VEIC.PLACA - 1] || '').trim();
    if (!placa) return;
    [[COL_VEIC.DESCRICAO, 'Descrição'], [COL_VEIC.CATEGORIA, 'Categoria'], [COL_VEIC.CENTRO, 'Centro de Custo']]
      .forEach(function (c) {
        const t = String(linha[c[0] - 1] == null ? '' : linha[c[0] - 1]).trim();
        if (ERROS_DE_CELULA.indexOf(t) !== -1 || t.indexOf('⚠') === 0 && t.indexOf('A CORRIGIR') !== -1) {
          problemas.push([ABAS.VEICULOS, placa, c[1] + ' do veículo com erro (' + t + ')',
            'linha ' + (i + 2) + ' • digite o valor correto na coluna ' + letraColuna_(c[0])]);
        }
      });
  });

  // ---- cadastro dos veículos ativos: inativos não devem gerar pendência mensal sozinhos.
  Object.keys(placasAtivas).forEach(function (placa) {
    const v = placas[placa];
    if (!v[COL_VEIC.CENTRO - 1]) {
      problemas.push([ABAS.VEICULOS, placa, 'Veículo ativo sem centro de custo', '']);
    }
    if (!v[COL_VEIC.CATEGORIA - 1]) {
      problemas.push([ABAS.VEICULOS, placa, 'Veículo ativo sem categoria', '']);
    }
  });

  const centros = {};
  aba_(ABAS.CENTROS).getDataRange().getValues().slice(1).forEach(function (linha) {
    const nomeCentro = normalizarCentroCusto_(linha[0]);
    if (nomeCentro) centros[nomeCentro] = linha;
  });
  Object.keys(placasAtivas).forEach(function (placa) {
    const centro = normalizarCentroCusto_(placas[placa][COL_VEIC.CENTRO - 1]);
    if (centro && !centros[centro]) {
      problemas.push([ABAS.VEICULOS, placa,
        'Centro de custo do veículo ativo não existe na aba Centros de Custo', centro]);
    }
  });

  const somaPercentuais = Object.keys(centros).reduce(function (soma, nome) {
    return soma + Number(centros[nome][1] || 0);
  }, 0);
  if (Math.abs(somaPercentuais - 1) > 0.0001) {
    problemas.push([ABAS.CENTROS, '', 'Soma dos percentuais de rateio não fecha 100%',
      (somaPercentuais * 100).toFixed(3) + '%']);
  }

  // ---- lançamentos
  // Pendências mensais devem refletir o período ABERTO. Histórico fechado é auditado
  // pelo lacre SHA-256/Auditoria Profunda, não volta a bloquear todos os meses seguintes.
  const lancamentos = aba_(ABAS.LANCAMENTOS);
  const qtdLancamentosValidacao = quantidadeLancamentosReais_();
  if (qtdLancamentosValidacao >= 1) {
    const dados = lancamentos.getRange(2, 1, qtdLancamentosValidacao, TOTAL_COL_LANC).getValues();
    const contagemIds = {};
    dados.forEach(function(linha) {
      const id = String(linha[COL_LANC.ID - 1] || '').trim();
      if (id) contagemIds[id] = (contagemIds[id] || 0) + 1;
    });

    dados.forEach(function (linha, i) {
      const numeroLinha = i + 2;
      const data = linha[COL_LANC.DATA - 1];
      const placa = String(linha[COL_LANC.PLACA - 1] || '').trim();
      const tipo = String(linha[COL_LANC.TIPO - 1] || '').trim();
      const valor = Number(linha[COL_LANC.VALOR - 1] || 0);
      const litros = Number(linha[COL_LANC.LITROS - 1] || 0);
      const idLancamento = String(linha[COL_LANC.ID - 1] || '').trim();
      if (!placa && !valor && !litros) return;

      const dataValida = data instanceof Date && !isNaN(data.getTime());
      if (!dataValida) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Data inválida', 'linha ' + numeroLinha]);
        return; // sem data válida não é seguro inferir competência.
      }

      const noPeriodoAtual = data >= periodo.inicio && data <= periodo.fim;
      const futuro = data > periodo.fim;
      // Parcela de IPVA agendada tem data futura de propósito. Ver lancamentoAgendado_.
      const agendado = lancamentoAgendado_(linha);
      if (futuro && !agendado) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Lançamento em período futuro',
          'linha ' + numeroLinha + ' • ' + formatarData_(data)]);
      }
      // Registro anterior ao período aberto permanece na base para histórico, mas não é
      // uma pendência mensal. Integridade histórica é tratada separadamente pelo hash.
      // A parcela agendada segue a mesma regra: fora do mês aberto, ela existe na base
      // e não é assunto do fechamento de agora. Quando a competência dela abrir, as
      // checagens de centro, categoria e placa passam a valer normalmente.
      if (!noPeriodoAtual && (!futuro || agendado)) return;

      if (!idLancamento) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Lançamento sem ID de auditoria', 'linha ' + numeroLinha]);
      } else if ((contagemIds[idLancamento] || 0) > 1) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'ID de lançamento duplicado',
          'linha ' + numeroLinha + ' • ' + idLancamento]);
      }

      if (placa && !placas[placa]) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Placa não cadastrada em Veículos', 'linha ' + numeroLinha]);
      } else if (placa && !placasAtivas[placa]) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Lançamento do período em veículo inativo',
          'linha ' + numeroLinha + ' • reative o cadastro ou confirme/corrija o lançamento']);
      }

      const centroSnapshot = String(linha[COL_LANC.CENTRO - 1] || '').trim();
      const categoriaSnapshot = String(linha[COL_LANC.CATEGORIA - 1] || '').trim();
      if (!centroSnapshot || centroSnapshot === '⚠ sem cadastro' || centroSnapshot === '#REF!') {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Lançamento sem centro de custo congelado', 'linha ' + numeroLinha]);
      }
      if (!categoriaSnapshot || categoriaSnapshot === '⚠ sem cadastro' || categoriaSnapshot === '#REF!') {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Lançamento sem categoria congelada', 'linha ' + numeroLinha]);
      }
      if (!tipo) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Lançamento incompleto (sem tipo de despesa)',
          'linha ' + numeroLinha + ' • exclua em "Corrigir / excluir lançamento" e lance de novo']);
      }
      if (tipo && TIPOS_DESPESA.indexOf(tipo) === -1) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Tipo de despesa desconhecido',
          'linha ' + numeroLinha + ' • ' + tipo]);
      }
      if (TIPOS_OFICINA.indexOf(tipo) !== -1) {
        const naturezaOficina = String(linha[COL_LANC.NATUREZA_OFICINA - 1] || '').trim();
        const detalheOficina = String(linha[COL_LANC.DETALHE_OFICINA - 1] || '').trim();
        const documentoOficina = String(linha[COL_LANC.DOCUMENTO - 1] || '').trim();
        const legadoOficina = naturezaOficina === NATUREZA_OFICINA_LEGADO_;
        if (!legadoOficina && NATUREZAS_OFICINA.indexOf(naturezaOficina) === -1) {
          problemas.push([ABAS.LANCAMENTOS, placa, 'Oficina sem natureza da despesa',
            'linha ' + numeroLinha + ' • classifique como peça, serviço ou outra natureza']);
        }
        if (!legadoOficina && !detalheOficina) {
          problemas.push([ABAS.LANCAMENTOS, placa, 'Oficina sem detalhe da peça/serviço',
            'linha ' + numeroLinha + ' • descreva o que foi comprado ou executado']);
        }
        if (!legadoOficina && !documentoOficina) {
          problemas.push([ABAS.LANCAMENTOS, placa, 'Oficina sem NF/OS/documento',
            'linha ' + numeroLinha + ' • informe o documento que comprova a despesa']);
        }
      }
      if (valor < 0) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Valor negativo', 'linha ' + numeroLinha]);
      }
      if (litros > 0 && TIPOS_COM_LITROS.indexOf(tipo) === -1) {
        problemas.push([ABAS.LANCAMENTOS, placa, 'Litros informados num tipo que não é abastecimento',
          'linha ' + numeroLinha + ' • ' + tipo]);
      }
      const precoAbsurdo = pendenciaPrecoUnitario_(tipo, valor, litros, numeroLinha, placa);
      if (precoAbsurdo) problemas.push(precoAbsurdo);
    });
  }

  // ---- odômetro
  // Usa todo o histórico apenas como referência de sequência, mas só gera pendência
  // quando a leitura problemática pertence ao período aberto (ou está no futuro).
  const odometro = aba_(ABAS.ODOMETRO);
  if (odometro.getLastRow() >= 2) {
    const brutos = lerOdometro_();
    const dadosValidos = [];
    brutos.forEach(function(l, i) {
      const linhaPlanilha = i + 2;
      const data = l[0];
      const placa = String(l[1] || '').trim();
      const km = Number(l[2]);
      if (!placa && !l[2]) return;
      if (!(data instanceof Date) || isNaN(data.getTime())) {
        problemas.push([ABAS.ODOMETRO, placa, 'Data de odômetro inválida', 'linha ' + linhaPlanilha]);
        return;
      }
      if (data > periodo.fim) {
        problemas.push([ABAS.ODOMETRO, placa, 'Leitura de KM em período futuro',
          'linha ' + linhaPlanilha + ' • ' + formatarData_(data)]);
      }
      if (!isFinite(km) || km <= 0) {
        if (data >= periodo.inicio) problemas.push([ABAS.ODOMETRO, placa, 'KM/horímetro inválido', 'linha ' + linhaPlanilha]);
        return;
      }
      dadosValidos.push([data, placa, km, linhaPlanilha]);
    });
    dadosValidos.sort(function (a, b) {
      const placaA = String(a[1]), placaB = String(b[1]);
      if (placaA !== placaB) return placaA < placaB ? -1 : 1;
      return a[0] - b[0];
    });
    for (let i = 1; i < dadosValidos.length; i++) {
      if (String(dadosValidos[i][1]) !== String(dadosValidos[i - 1][1])) continue;
      const dataAtual = dadosValidos[i][0];
      if (dataAtual < periodo.inicio || dataAtual > periodo.fim) continue;
      if (Number(dadosValidos[i][2]) < Number(dadosValidos[i - 1][2])) {
        // O numero da linha vem PRIMEIRO, como em todas as outras pendencias:
        // e dele que a correcao na tela tira o alvo. Esta aqui estava com
        // "(linha N)" no fim e, por isso, era a unica corrigivel que nao
        // oferecia o campo — o parser nao a reconhecia.
        problemas.push([ABAS.ODOMETRO, String(dadosValidos[i][1]),
          'Leitura de KM menor que a anterior',
          'linha ' + dadosValidos[i][3] + ' • ' + periodo.mesRef + ' • ' +
          formatarData_(dataAtual) + ': ' + dadosValidos[i][2] +
          ' < ' + dadosValidos[i - 1][2]]);
      }
    }
  }

  // ---- (V4.8) o Resumo não usa mais fórmulas com teto de varredura: é recalculado
  // pelo script a partir da base inteira, então a checagem antiga deixou de existir.
  garantirResumoAtualizado_();

  // ---- indicadores do período atual
  // V4.8: "sem custo" e "sem KM rodado" só são conferidos NA VALIDAÇÃO DO FECHAMENTO.
  // Durante o período os valores ainda estão sendo lançados, e essas conferências
  // viravam pendência falsa a cada validação.
  const resumo = aba_(ABAS.RESUMO);
  if (opcoesColeta && opcoesColeta.fechamento === true && resumo.getLastRow() >= 4) {
    resumo.getRange(4, 1, resumo.getLastRow() - 3, TOTAL_COL_RESUMO).getValues().forEach(function (linha) {
      const placa = String(linha[R_.PLACA] || '').trim();
      if (!placa) return;
      const litros = Number(linha[R_.LITROS] || 0);
      const km = Number(linha[R_.KM] || 0);
      const total = Number(linha[R_.TOTAL] || 0);
      if (litros > 0 && km === 0) {
        problemas.push([ABAS.RESUMO, placa,
          'Abasteceu mas não tem KM rodado no período',
          periodo.mesRef + ' • faltam leituras de odômetro']);
      }
      // Veículo ativo sem custo é um ponto de conferência, não um erro histórico.
      // A competência no detalhe impede que um RESOLVIDO de um mês seja herdado pelo mês seguinte.
      if (total === 0 && placasAtivas[placa]) {
        problemas.push([ABAS.RESUMO, placa, 'Sem nenhum custo no período',
          periodo.mesRef + ' • confirmar se o veículo ficou parado nesta competência']);
      }
    });
  }

  // ---- depreciação mensal: só entra na conferência no último dia do período.
  const dep = statusDepreciacaoMensal_();
  if (dep.liberada) {
    dep.itens.forEach(function (item) {
      if (item.situacao === 'PENDENTE') {
        problemas.push([ABAS.VEICULOS, item.placa, 'Depreciação mensal não lançada',
          dep.mesExtenso + ' • lançamento exigido em ' + dep.dataLancamento +
          ' • previsto R$ ' + item.valorMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })]);
      } else if (item.situacao === 'DIVERGENTE') {
        problemas.push([ABAS.LANCAMENTOS, item.placa, 'Depreciação mensal divergente',
          dep.mesExtenso + ' • previsto R$ ' + item.valorMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) +
          ' • lançado R$ ' + item.lancado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })]);
      } else if (item.situacao === 'DATA INCORRETA') {
        problemas.push([ABAS.LANCAMENTOS, item.placa, 'Depreciação lançada fora do último dia do período',
          dep.mesExtenso + ' • data correta ' + dep.dataLancamento +
          ' • valor fora da data R$ ' + item.lancadoForaData.toLocaleString('pt-BR', { minimumFractionDigits: 2 })]);
      }
    });
  }

  return problemas;
}

function ehPendenciaDepreciacao_(problema) {
  return String(problema || '').toLowerCase().indexOf('deprecia') !== -1;
}

function depreciacaoPodeContarComoPendencia_() {
  try { return depreciacaoLiberada_(periodoAtual_()) === true; } catch (e) { return false; }
}

function contarPendenciasConferencia_() {
  const sheet = garantirAbaPendencias_(false);
  if (!sheet || sheet.getLastRow() < 3) return 0;
  const dados = sheet.getRange(3, 1, sheet.getLastRow() - 2, 5).getDisplayValues();
  const contarDepreciacao = depreciacaoPodeContarComoPendencia_();
  return dados.reduce(function (total, linha) {
    const origem = String(linha[0] || '').trim();
    if (!origem || origem === 'Nenhum problema encontrado.') return total;
    if (!contarDepreciacao && ehPendenciaDepreciacao_(linha[2])) return total;
    const status = String(linha[4] || 'PENDENTE').trim().toUpperCase();
    return status === 'RESOLVIDO' ? total : total + 1;
  }, 0);
}

/**
 * Chave de uma pendencia, para casar o que foi coletado agora com o status e a
 * observacao de antes.
 *
 * O numero da linha sai da chave de proposito. Excluir um lancamento nao apaga
 * a linha: ele SOBE as de baixo uma casa (ver removerLinhaLancamento_). Com o
 * numero na chave, uma exclusao mudava a chave de TODAS as pendencias abaixo, e
 * o operador perdia o status e a observacao que tinha escrito — sem erro, sem
 * aviso, e sem relacao aparente com o que ele acabou de fazer.
 *
 * Duas pendencias iguais do mesmo veiculo passam a ter a MESMA chave. Isso nao
 * as confunde: escreverConferencia_ casa a primeira com a primeira, a segunda
 * com a segunda. Veja casarAnteriores_.
 */
function chavePendencia_(linha) {
  const detalhe = String(linha[3] == null ? '' : linha[3]).trim()
    .replace(/^linha\s+\d+\s*(•\s*)?/, '');
  return [linha[0], linha[1], linha[2], detalhe].map(function (x) {
    return String(x == null ? '' : x).trim();
  }).join('||');
}

/**
 * Casa cada pendencia nova com a anterior de mesma chave, por ordem de
 * aparicao. Fila por chave em vez de um valor so: com duas pendencias iguais do
 * mesmo veiculo, um mapa simples daria o mesmo status as duas, e marcar uma
 * como EM ANALISE marcaria a outra junto.
 */
function casarAnteriores_(linhasAnteriores) {
  const filas = {};
  linhasAnteriores.forEach(function (linha) {
    const k = chavePendencia_(linha);
    (filas[k] || (filas[k] = [])).push({
      status: String(linha[4] || 'PENDENTE').trim().toUpperCase(),
      observacao: String(linha[5] || ''),
    });
  });
  return {
    proximo: function (problema) {
      const fila = filas[chavePendencia_(problema)];
      return (fila && fila.length) ? fila.shift() : {};
    },
  };
}

/**
 * RESOLVIDO sobrevive a revalidacao? Depende do tipo de problema.
 *
 * Para quem NAO tem conserto por campo — "sem nenhum custo no periodo" num
 * veiculo que de fato ficou parado — marcar resolvido e um julgamento do
 * operador, e tem de valer nas proximas revalidacoes. Senao o aviso volta todo
 * mes e ele aprende a ignorar a tela.
 *
 * Para quem TEM conserto (CORRECOES_PENDENCIA_), nao: se o coletor ainda o
 * encontra, o dado continua errado. Antes da V4.9.1 marcar RESOLVIDO era a
 * UNICA forma de limpar a tela, e o habito ficou — com o efeito de sumir da
 * contagem um lancamento que segue sem centro de custo. Agora ele volta a
 * PENDENTE, com a observacao preservada e o motivo anotado.
 */
function resolvidoSobrevive_(problema) {
  return !specDaPendencia_(problema);
}

/**
 * Recria a lista ativa de pendências, preservando status/observação quando o
 * mesmo problema continua existindo. Itens RESOLVIDOS permanecem registrados como
 * exceções já conferidas; se a inconsistência desaparecer, somem na revalidação.
 */
function escreverConferencia_(problemas) {
  exigirExecucaoMutacao_();
  const sheet = garantirAbaPendencias_(true);
  const brutasAnteriores = (sheet.getLastRow() >= 3)
    ? sheet.getRange(3, 1, sheet.getLastRow() - 2, 7).getValues().filter(function (linha) {
      return linha[0] && String(linha[0]).trim() !== 'Nenhum problema encontrado.';
    })
    : [];
  const anteriores = casarAnteriores_(brutasAnteriores);

  removerFiltro_(sheet);
  // A versão antiga tinha A1:D1 mesclado; desfaz antes de ampliar o cabeçalho para A1:G1.
  sheet.getDataRange().breakApart();
  sheet.clear();
  sheet.clearConditionalFormatRules();

  sheet.getRange('A1:G1').merge()
    .setFormula(fx_('="PENDÊNCIAS DE CONFERÊNCIA   —   atualizada em "&' + dataHoraBR_('NOW()')))
    .setBackground(CORES.LARANJA).setFontColor(CORES.TEXTO_CLARO)
    .setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);

  const cabecalho = ['Origem', 'Placa / ID', 'Problema', 'Detalhe', 'Status', 'Observação', 'Validado em'];
  sheet.getRange(2, 1, 1, cabecalho.length).setValues([cabecalho]);
  estilizarCabecalho_(sheet.getRange(2, 1, 1, cabecalho.length));

  if (problemas.length) {
    const agora = new Date();
    const linhas = problemas.map(function (p) {
      const ant = anteriores.proximo(p);
      let status = String(ant.status || 'PENDENTE').toUpperCase();
      if (['PENDENTE', 'EM ANÁLISE', 'RESOLVIDO'].indexOf(status) === -1) status = 'PENDENTE';
      let observacao = ant.observacao || '';
      // O problema foi coletado DE NOVO: se ele tem conserto por campo, não está
      // resolvido, por mais que alguém tenha dito que estava.
      if (status === 'RESOLVIDO' && !resolvidoSobrevive_(p[2])) {
        status = 'PENDENTE';
        observacao = ('↩ marcado como resolvido, mas o problema continua na base. ' +
          observacao).trim().slice(0, 500);
      }
      return [p[0], p[1], p[2], p[3], status, observacao, agora];
    });
    sheet.getRange(3, 1, linhas.length, 7).setValues(linhas);
    sheet.getRange(3, 7, linhas.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');

    const regraStatus = SpreadsheetApp.newDataValidation()
      .requireValueInList(['PENDENTE', 'EM ANÁLISE', 'RESOLVIDO'], true)
      .setAllowInvalid(false).build();
    sheet.getRange(3, 5, linhas.length, 1).setDataValidation(regraStatus);

    const faixa = sheet.getRange(3, 1, linhas.length, 7);
    const regras = [
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(fx_('=$E3="PENDENTE"'))
        .setBackground(CORES.VERMELHO).setRanges([faixa]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(fx_('=$E3="EM ANÁLISE"'))
        .setBackground(CORES.AMARELO).setRanges([faixa]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(fx_('=$E3="RESOLVIDO"'))
        .setBackground(CORES.VERDE).setRanges([faixa]).build()
    ];
    sheet.setConditionalFormatRules(regras);
    sheet.getRange(2, 1, 1, 7).createFilter();
  } else {
    sheet.getRange('A3').setValue('Nenhum problema encontrado.').setFontColor('#1e7145');
  }

  [170, 130, 360, 300, 120, 320, 150].forEach(function (largura, i) {
    sheet.setColumnWidth(i + 1, largura);
  });
  sheet.setFrozenRows(2);
}

// --------------------------------------------------- diagnóstico de fórmulas

const ERROS_DE_CELULA = ['#ERROR!', '#REF!', '#NAME?', '#VALUE!', '#DIV/0!',
  '#N/A', '#NUM!', '#NULL!'];

/**
 * Varre as abas calculadas atrás de célula com erro e diz exatamente onde está.
 * Serve para responder de cara a pergunta "sobrou alguma fórmula quebrada?".
 */
function verificarFormulas_() {
  const planilha = ss_();
  const alvos = [ABAS.RESUMO, ABAS.RATEIO, ABAS.DASHBOARD, ABAS.RELATORIOS,
    ABAS.CONSULTA, ABAS.LANCAMENTOS, ABAS.PARAMETROS];
  const problemas = [];
  let celulasLidas = 0;

  alvos.forEach(function (nome) {
    const sheet = planilha.getSheetByName(nome);
    if (!sheet || sheet.getLastRow() < 1) return;
    const linhas = Math.min(sheet.getLastRow(), 400);
    const colunas = Math.min(sheet.getLastColumn(), 40);
    if (!linhas || !colunas) return;

    const valores = sheet.getRange(1, 1, linhas, colunas).getValues();
    const formulas = sheet.getRange(1, 1, linhas, colunas).getFormulas();
    celulasLidas += linhas * colunas;

    for (let i = 0; i < linhas; i++) {
      for (let j = 0; j < colunas; j++) {
        const valor = String(valores[i][j]);
        if (ERROS_DE_CELULA.indexOf(valor) === -1) continue;
        problemas.push([
          nome,
          sheet.getRange(i + 1, j + 1).getA1Notation(),
          valor,
          String(formulas[i][j] || '').slice(0, 220) ||
            '(sem fórmula: é um VALOR com erro copiado de outra aba — ' +
            (nome === ABAS.RESUMO || nome === ABAS.RELATORIOS
              ? 'confira o cadastro na aba Veículos e rode Atualizar relatórios)'
              : 'apague e digite o valor correto)'),
        ]);
      }
    }
  });

  return { problemas: problemas, celulasLidas: celulasLidas };
}

function agruparErrosFormula_(problemas) {
  const grupos = {};
  (problemas || []).forEach(function(p) {
    const a1 = String(p[1] || '');
    const col_ = (a1.match(/^[A-Z]+/) || ['?'])[0];
    const chave = [p[0], col_, p[2], p[3]].join('|');
    if (!grupos[chave]) grupos[chave] = { aba:p[0], coluna:col_, erro:p[2], formula:p[3], quantidade:0, primeira:a1, ultima:a1 };
    grupos[chave].quantidade++;
    grupos[chave].ultima = a1;
  });
  return Object.keys(grupos).map(function(k){ return grupos[k]; });
}

/** Auditoria detalhada da matriz de proteção por perfil. */
function auditarProtecoesPerfil_() {
  const planilha = ss_();
  const admins = emailsUsuariosAtivosPorPerfil_(['ADMIN']);
  const operacionais = emailsUsuariosAtivosPorPerfil_(['OPERADOR','ADMIN']);
  const todos = emailsUsuariosAtivosPorPerfil_(['CONSULTA','OPERADOR','ADMIN']);
  const falhas = [];
  let verificacoes = 0;

  function listaEsperada(emails) { return normalizarEmailsProtecao_(emails).sort(); }
  function emailsProtecao(p) {
    try { return p.getEditors().map(function(u){ return String(u.getEmail()||'').trim().toLowerCase(); }).filter(Boolean).sort(); }
    catch(e) { return []; }
  }
  function validarComum(rotulo, p, esperados) {
    verificacoes++;
    if (!p) { falhas.push(rotulo + ': proteção ausente'); return; }
    if (p.isWarningOnly()) falhas.push(rotulo + ': proteção está somente em aviso');
    try { if (p.canDomainEdit()) falhas.push(rotulo + ': edição por domínio está habilitada'); } catch(e) {}
    const eds = emailsProtecao(p);
    const exp = listaEsperada(esperados || []);
    exp.forEach(function(e){ if (eds.indexOf(e)<0) falhas.push(rotulo + ': editor esperado ausente ' + e); });
    eds.forEach(function(e){ if (exp.indexOf(e)<0) falhas.push(rotulo + ': editor não previsto ' + e); });
  }
  function protecaoFolha(nome) {
    const sheet=planilha.getSheetByName(nome); if(!sheet)return null;
    return sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).filter(function(x){
      return String(x.getDescription()||'').indexOf('Sistema de Frota — perfil —')===0;
    })[0] || null;
  }
  function exigirFolha(nome, esperados, faixasLiberadasEsperadas) {
    const sheet=planilha.getSheetByName(nome); if(!sheet){falhas.push(nome+': aba ausente');return;}
    const p = protecaoFolha(nome);
    validarComum(nome, p, esperados);
    if (!p) return;
    const esperadas = (faixasLiberadasEsperadas || []).map(function(a1){
      try { return sheet.getRange(a1).getA1Notation(); } catch(e) { return String(a1); }
    }).sort();
    let atuais = [];
    try { atuais = p.getUnprotectedRanges().map(function(r){ return r.getA1Notation(); }).sort(); }
    catch(e) { falhas.push(nome + ': não foi possível ler as faixas liberadas'); return; }
    esperadas.forEach(function(a1){ if (atuais.indexOf(a1) < 0) falhas.push(nome + ': faixa liberada esperada ausente ' + a1); });
    atuais.forEach(function(a1){ if (esperadas.indexOf(a1) < 0) falhas.push(nome + ': faixa liberada não prevista ' + a1); });
  }
  function exigirFaixa(nome, a1, esperados) {
    const sheet=planilha.getSheetByName(nome); if(!sheet)return;
    const alvo=sheet.getRange(a1).getA1Notation();
    const p=sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).filter(function(x){
      try { return x.getRange().getA1Notation()===alvo && String(x.getDescription()||'').indexOf('Sistema de Frota — perfil —')===0; }
      catch(e){return false;}
    })[0] || null;
    validarComum(nome+'!'+alvo,p,esperados);
  }

  [ABAS.DASHBOARD,ABAS.RATEIO,ABAS.LOG,ABAS.PARAMETROS,ABAS.USUARIOS,
   ABAS.VEICULOS,ABAS.CENTROS,ABAS.HISTORICO,
   ABAS.RATEIO_MENSAL,ABAS.ORCAMENTO,ABAS.COMPROVANTES].forEach(function(n){ exigirFolha(n,admins,[]); });
  exigirFolha(ABAS.RESUMO,operacionais,[]);
  exigirFolha(ABAS.CONSULTA,admins,['B3']);
  exigirFaixa(ABAS.CONSULTA,'B3',todos);

  const filtrosRel = [CEL_TIPO,CEL_CENTRO,CEL_CATEGORIA,CEL_VEICULO];
  exigirFolha(ABAS.RELATORIOS,admins,filtrosRel);
  filtrosRel.forEach(function(a1){ exigirFaixa(ABAS.RELATORIOS,a1,todos); });

  const conf=planilha.getSheetByName(ABAS.CONFERENCIA);
  const faixaConf = conf ? 'E3:F'+conf.getMaxRows() : '';
  exigirFolha(ABAS.CONFERENCIA,admins,faixaConf?[faixaConf]:[]);
  if(conf) exigirFaixa(ABAS.CONFERENCIA,faixaConf,operacionais);

  const opCentral = ['B8','E8','H8','B10','E10','H10','B12','E12','H12','B14:D14','F14:J14','B16:J16','B19','E19'];
  const admCentral = ['B25','E25','H25'];
  const navCentral = ['B29','E29','H29','J29'];
  exigirFolha(ABAS.CENTRAL_OPERACIONAL,admins,opCentral.concat(admCentral,navCentral));
  opCentral.forEach(function(a1){ exigirFaixa(ABAS.CENTRAL_OPERACIONAL,a1,operacionais); });
  admCentral.forEach(function(a1){ exigirFaixa(ABAS.CENTRAL_OPERACIONAL,a1,admins); });
  navCentral.forEach(function(a1){ exigirFaixa(ABAS.CENTRAL_OPERACIONAL,a1,todos); });

  exigirFolha(ABAS.LANCAMENTOS,operacionais,[]);
  exigirFaixa(ABAS.LANCAMENTOS,'A1:' + letraColuna_(TOTAL_COL_LANC) + '1',admins);
  exigirFaixa(ABAS.LANCAMENTOS,letraColuna_(COL_LANC.PERIODO) + ':' + letraColuna_(COL_LANC.PERIODO),admins);
  exigirFolha(ABAS.ODOMETRO,operacionais,[]);
  exigirFaixa(ABAS.ODOMETRO,'A1:C1',admins);
  // Carga da bomba e operacao do dia a dia; cadastro de fornecedor e administrativo.
  exigirFolha(ABAS.CARGA_BOMBA,operacionais,[]);
  exigirFaixa(ABAS.CARGA_BOMBA,'A1:G1',admins);
  exigirFolha(ABAS.FORNECEDORES,admins,[]);

  planilha.getSheets().forEach(function(sheet){
    if (/^Fechado\s+\d{4}-\d{2}$/i.test(sheet.getName())) exigirFolha(sheet.getName(),admins,[]);
    if (/^Log Arquivo\s+\d{4}$/i.test(sheet.getName())) exigirFolha(sheet.getName(),admins,[]);
  });

  return { ok: !falhas.length, falhas: falhas, verificacoes: verificacoes };
}

/** Versão de menu: mostra o resultado e escreve o detalhe numa aba. */
function verificarFormulasComRelatorio() {
  exigirExecucaoMutacao_();
  toast_('Varrendo as abas calculadas…');
  const resultado = verificarFormulas_();
  const separador = separadorFormula_();

  if (!resultado.problemas.length) {
    const antiga = ss_().getSheetByName('Fórmulas com Erro');
    if (antiga) { try { ss_().deleteSheet(antiga); } catch (e) {} }
    alerta_('Fórmulas conferidas',
      'Nenhuma célula com erro em ' + resultado.celulasLidas + ' verificadas.\n\n' +
      'Separador desta planilha: "' + separador + '".');
    return;
  }

  const sheet = aba_('Fórmulas com Erro', true);
  removerFiltro_(sheet);
  sheet.clear();
  sheet.getRange(1, 1, 1, 4)
    .setValues([['Aba', 'Célula', 'Erro', 'Fórmula']]);
  estilizarCabecalho_(sheet.getRange(1, 1, 1, 4));
  sheet.getRange(2, 1, resultado.problemas.length, 4).setValues(resultado.problemas);
  [150, 90, 100, 700].forEach(function (l, i) { sheet.setColumnWidth(i + 1, l); });
  sheet.setFrozenRows(1);
  planilhaAtiva_(sheet);

  const tipos = {};
  resultado.problemas.forEach(function (p) { tipos[p[2]] = (tipos[p[2]] || 0) + 1; });
  const resumoTipos = Object.keys(tipos)
    .map(function (t) { return t + ': ' + tipos[t]; }).join(', ');

  alerta_('Fórmulas com erro',
    resultado.problemas.length + ' célula(s) com erro.\n' + resumoTipos + '\n\n' +
    'Separador desta planilha: "' + separador + '".\n\n' +
    (tipos['#ERROR!']
      ? 'Erro de LEITURA da fórmula (normalmente separador errado). ' +
        'Rode "Instalar / atualizar sistema" com o código atualizado.\n\n'
      : '') +
    'O detalhe, com a fórmula de cada célula, está na aba "Fórmulas com Erro".');
}

function planilhaAtiva_(sheet) {
  ss_().setActiveSheet(sheet);
}

// ==========================================================================
// 08_Menu.gs
// ==========================================================================

/**
 * Menu do sistema e rotina de instalacao.
 * Este e o arquivo por onde tudo comeca.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  const lancamentos = ui.createMenu('Lançamentos')
    .addItem('➕ Novo lançamento', 'abrirFormularioLancamento')
    .addItem('📋 Ir para Lançamentos', 'irParaLancamentos')
    .addItem('🛣️ Ir para Odômetro', 'irParaOdometro')
    .addItem('🗑️ Excluir lançamento (com justificativa)', 'excluirLancamentoPlanilha')
    .addSeparator()
    .addItem('📥 Importar MAPA antigo', 'importarMapaAntigo');

  const relatorios = ui.createMenu('Relatórios')
    .addItem('📊 Dashboard', 'irParaDashboard')
    .addItem('📈 Central de Relatórios', 'irParaRelatorios')
    .addItem('📋 Resumo por veículo', 'irParaResumo')
    .addItem('🏬 Rateio por centro de custo', 'irParaRateio')
    .addItem('🔍 Consultar um veículo', 'irParaConsulta')
    .addSeparator()
    .addItem('📦 Exportar período em planilha', 'exportarPeriodoComAviso')
    .addItem('📄 Exportar a aba atual em PDF', 'exportarAbaAtualPdf')
    .addItem('✉️ Enviar a aba atual por e-mail', 'enviarResumoPorEmail');

  const cadastros = ui.createMenu('Cadastros')
    .addItem('🚛 Veículos', 'irParaVeiculos')
    .addItem('🏬 Centros de custo', 'irParaCentros')
    .addItem('⚙️ Parâmetros', 'irParaParametros')
    .addSeparator()
    .addItem('🗑️ Excluir veículo', 'excluirVeiculoPlanilha');

  const fechamento = ui.createMenu('Fechamento')
    .addItem('⚠️ Pendências de conferência', 'irParaPendencias')
    .addItem('✅ Validar dados', 'validarDados')
    .addItem('📉 Gerar depreciação mensal', 'gerarDepreciacaoMensalComAviso')
    .addItem('🔒 Fechar período', 'fecharPeriodo')
    .addItem('↩️ Reabrir mês anterior', 'reabrirMesAnterior')
    .addItem('📅 Alterar período aberto', 'alterarPeriodoPlanilha')
    .addItem('🗓️ Definir datas do período (início e fim)', 'definirPeriodoLivrePlanilha')
    .addSeparator()
    .addItem('📦 Exportar período em planilha', 'exportarPeriodoComAviso')
    .addItem('📚 Histórico mensal', 'irParaHistorico');

  const contingencia = ui.createMenu('Contingência')
    .addItem('🧰 Abrir Central Operacional', 'irParaCentralOperacional')
    .addItem('💾 Salvar lançamento preenchido', 'salvarLancamentoCentralOperacional')
    .addSeparator()
    .addItem('✅ Validar dados', 'validarDados')
    .addItem('🔄 Atualizar relatórios', 'atualizarRelatorios')
    .addItem('📉 Gerar depreciação mensal', 'gerarDepreciacaoMensalComAviso')
    .addSeparator()
    .addItem('🛡️ Diagnosticar sistema', 'diagnosticarSistemaPlanilha')
    .addItem('🔬 Auditoria profunda', 'auditoriaProfundaPlanilha')
    .addItem('💾 Criar backup agora', 'criarBackupSistemaComAviso')
    .addItem('🛠️ Reparar sistema', 'repararSistemaComAviso');

  const administracao = ui.createMenu('Administração')
    .addItem('⚙️ Instalar / atualizar sistema', 'instalar')
    .addItem('🔑 Redefinir senha do administrador', 'redefinirSenhaAdministrador')
    .addItem('🔄 Atualizar relatórios', 'atualizarRelatorios')
    .addItem('🔐 Sincronizar proteção por perfil', 'protegerAbasCalculadasComAviso')
    .addItem('🩺 Verificar fórmulas', 'verificarFormulasComRelatorio')
    .addItem('🔬 Auditoria profunda', 'auditoriaProfundaPlanilha')
    .addItem('🧩 Mostrar/ocultar colunas técnicas', 'alternarColunasTecnicasLancamentos')
    .addSeparator()
    .addItem('📱 Link do app da web', 'mostrarLinkDoApp')
    .addItem('🧾 Log de atividade', 'irParaLog')
    .addItem('ℹ️ Sobre o sistema', 'sobre')
    .addSeparator()
    .addItem('🧨 Zerar sistema (apagar informações)', 'zerarSistemaPlanilha');

  ui.createMenu('🚚 Sistema de Frota')
    .addItem('🎛️ Central de Controle', 'abrirCentral')
    .addItem('🧰 Central Operacional (contingência)', 'irParaCentralOperacional')
    .addItem('➕ Novo lançamento', 'abrirFormularioLancamento')
    .addSeparator()
    .addSubMenu(lancamentos)
    .addSubMenu(relatorios)
    .addSubMenu(cadastros)
    .addSubMenu(fechamento)
    .addSubMenu(contingencia)
    .addSubMenu(administracao)
    .addToUi();
}

/**
 * Instala (ou reinstala) o sistema: cria as abas que faltam, padroniza formato,
 * validacoes e reconstroi todos os relatorios. Pode rodar quantas vezes quiser.
 */
function instalar() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();
  const inicio = new Date();
  const propsDocumento = PropertiesService.getDocumentProperties();
  const versaoAnterior = String(propsDocumento.getProperty(PROP_VERSAO_INSTALADA_) || '');
  const tinhaBaseAnterior = !!(ss_().getSheetByName(ABAS.LANCAMENTOS) ||
    ss_().getSheetByName(ABAS.VEICULOS) || ss_().getSheetByName(ABAS.PARAMETROS));
  let backupPreMigracao = null;

  registrarPlanilha_();

  // Antes de uma mudança de versão, preserva uma cópia bruta exatamente como estava.
  // Não depende do schema novo e serve como rollback caso a migração seja interrompida.
  if (tinhaBaseAnterior && versaoAnterior !== VERSAO_SISTEMA) {
    toast_('Criando backup pré-atualização…', 'Instalação');
    try { backupPreMigracao = criarBackupPreMigracao_('antes de atualizar para V' + VERSAO_SISTEMA); }
    catch (e) { throw new Error('Atualização interrompida: não foi possível criar o backup pré-migração. ' + e.message); }
  }

  // precisa vir antes de qualquer fórmula: numa planilha em português o
  // separador é ";" e escrever com "," faz a célula virar #ERROR!
  const separador = detectarSeparador_();

  // Migração de schema V4.7.2 ANTES de montar as abas: montarAbasDeDados_ reescreve
  // cabeçalhos, e se a coluna Setor ainda estivesse lá os rótulos novos cairiam
  // sobre dados antigos — cada lançamento passaria a ter o Setor rotulado como NF.
  // Depende do backup pré-migração acima, que já rodou.
  if (tinhaBaseAnterior) {
    toast_('Migrando o schema…', 'Instalação');
    migrarSchemaV472_();
  }

  toast_('Otimizando o tamanho das abas…', 'Instalação');
  try { reduzirCapacidadeLancamentos_(); } catch (e) { registrarLog_('Reduzir capacidade - aviso', e.message); }

  toast_('Preparando as abas de dados…', 'Instalação');
  montarAbasDeDados_();
  montarLog_();
  const acessoInicial = montarUsuarios_();
  const capacidadeAtualInst = limiteLancamentosAtual_();
  if (quantidadeLancamentosReais_() >= capacidadeAtualInst * LIMIAR_EXPANSAO_LANCAMENTOS_) {
    garantirCapacidadeLancamentos_(quantidadeLancamentosReais_() + 1);
  }

  // Antes dos relatórios: congela os percentuais da competência aberta, para o
  // mês de transição não ficar sem bloco próprio.
  try { semearRateioCompetenciaAtual_(); }
  catch (e) { registrarLog_('Semear rateio da competência - aviso', e.message); }

  toast_('Montando os relatórios…', 'Instalação');
  reconstruirRelatorios_();
  escreverConferencia_(coletarProblemas_());
  montarCentralOperacional_();

  toast_('Aplicando proteção por perfil…', 'Instalação');
  protegerAbasCalculadas_();

  organizarAbas_();

  // Blindagem V4.5: automações + backup já no schema novo e validado.
  let avisoBlindagem = '';
  try {
    garantirAutomacoesSistema_();
    garantirBackupInicial_();
    propsDocumento.setProperty(PROP_VERSAO_INSTALADA_, VERSAO_SISTEMA);
  } catch (e) {
    avisoBlindagem = 'ATENÇÃO: a estrutura foi atualizada, mas a blindagem automática precisa ser verificada em Saúde do Sistema. ' + e.message;
    registrarLog_('Blindagem V4.5 - aviso', e.message);
  }

  ss_().setActiveSheet(aba_(ABAS.CENTRAL_OPERACIONAL));
  invalidarCacheInicio_();

  const segundos = Math.round((new Date() - inicio) / 1000);
  registrarLog_('Instalar sistema', 'concluído em ' + segundos + 's');

  ui.alert('Sistema instalado',
    'Versão do código: V' + VERSAO_SISTEMA + ' — tudo pronto em ' + segundos + 's.\n' +
    'Separador de fórmulas desta planilha: "' + separador + '"\n\n' +
    'DADOS: Parâmetros, Centros de Custo, Veículos, Lançamentos, Odômetro, Histórico.\n' +
    'CALCULADO: Resumo, Rateio, Dashboard, Relatórios, Consulta Veículo.\n' +
    'CONTROLE: Central Operacional, Pendências de Conferência, Log de Atividade, Usuários.\n\n' +
    (acessoInicial ? 'ADMIN INICIAL: ' + acessoInicial.email + '\nSENHA TEMPORÁRIA: ' + acessoInicial.senhaTemporaria + '\n\nGuarde esta senha e altere no primeiro acesso.\n\n' : '') +
    'A aba "Central Operacional" é o modo de contingência e funciona sem depender da publicação do Web App.\n' +
    (backupPreMigracao ? 'Backup pré-atualização preservado: ' + backupPreMigracao.nome + '\n' : '') +
    (avisoBlindagem ? '\n' + avisoBlindagem + '\n' : '') +
    'Comece por ela ou pela "🎛️ Central de Controle".',
    ui.ButtonSet.OK);
}

/** Coloca as abas numa ordem que faz sentido para quem usa. */
function organizarAbas_() {
  exigirExecucaoMutacao_();
  const planilha = ss_();
  const ordem = [ABAS.CENTRAL_OPERACIONAL, ABAS.DASHBOARD, ABAS.RESUMO, ABAS.RELATORIOS, ABAS.RATEIO, ABAS.CONSULTA,
    ABAS.LANCAMENTOS, ABAS.ODOMETRO, ABAS.CARGA_BOMBA, ABAS.VEICULOS, ABAS.CENTROS,
    ABAS.RATEIO_MENSAL, ABAS.ORCAMENTO, ABAS.COMPROVANTES, ABAS.FORNECEDORES,
    ABAS.HISTORICO, ABAS.PARAMETROS, ABAS.CONFERENCIA, ABAS.USUARIOS, ABAS.LOG];
  ordem.forEach(function (nome, i) {
    const sheet = planilha.getSheetByName(nome);
    if (!sheet) return;
    planilha.setActiveSheet(sheet);
    planilha.moveActiveSheet(i + 1);
  });

  const cores = {};
  cores[ABAS.CENTRAL_OPERACIONAL] = CORES.LARANJA;
  cores[ABAS.DASHBOARD] = CORES.LARANJA;
  cores[ABAS.RESUMO] = CORES.PRETO;
  cores[ABAS.RELATORIOS] = CORES.PRETO;
  cores[ABAS.RATEIO] = CORES.GRAFITE;
  cores[ABAS.CONSULTA] = CORES.LARANJA;
  cores[ABAS.LANCAMENTOS] = CORES.LARANJA;
  cores[ABAS.ODOMETRO] = CORES.LARANJA;
  cores[ABAS.VEICULOS] = CORES.GRAFITE;
  cores[ABAS.CENTROS] = CORES.GRAFITE;
  cores[ABAS.RATEIO_MENSAL] = CORES.GRAFITE;
  cores[ABAS.ORCAMENTO] = CORES.GRAFITE;
  cores[ABAS.COMPROVANTES] = CORES.LARANJA;
  cores[ABAS.FORNECEDORES] = CORES.GRAFITE;
  cores[ABAS.CARGA_BOMBA] = CORES.LARANJA;
  cores[ABAS.HISTORICO] = CORES.PRETO;
  cores[ABAS.PARAMETROS] = '#6F6A6B';
  cores[ABAS.CONFERENCIA] = '#A52422';
  cores[ABAS.USUARIOS] = CORES.PRETO;
  cores[ABAS.LOG] = '#9B9694';
  Object.keys(cores).forEach(function (nome) {
    const sheet = planilha.getSheetByName(nome);
    if (sheet) sheet.setTabColor(cores[nome]);
  });
}

function atualizarRelatorios() {
  exigirExecucaoMutacao_();
  toast_('Recalculando…');
  reconstruirRelatorios_();
  invalidarCacheInicio_();
  registrarLog_('Atualizar relatórios', '');
  toast_('Relatórios atualizados.');
}

function protegerAbasCalculadasComAviso() {
  exigirExecucaoMutacao_();
  const r = protegerAbasCalculadas_();
  alerta_('Proteção por perfil sincronizada',
    'Proteção real aplicada às abas do sistema.\n\n' +
    'CONSULTA: edita apenas os filtros liberados (ex.: Consulta Veículo B3).\n' +
    'OPERADOR: além dos filtros, usa os campos operacionais da Central e as bases de lançamento/odômetro.\n' +
    'ADMIN: mantém acesso administrativo e consegue refazer as proteções.\n\n' +
    'Usuários contemplados: ' + r.todos + ' ativo(s), sendo ' + r.operacionais +
    ' operacional(is) e ' + r.admins + ' ADMIN(s).');
}

// ------------------------------------------------------------ navegação

function irPara_(nomeAba) {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Navegação disponível somente pela planilha vinculada.');
  ss_().setActiveSheet(aba_(nomeAba, true));
}

function irParaCentralOperacional() { irPara_(ABAS.CENTRAL_OPERACIONAL); }
function irParaDashboard() { irPara_(ABAS.DASHBOARD); }
function irParaResumo() { irPara_(ABAS.RESUMO); }
function irParaRateio() { irPara_(ABAS.RATEIO); }
function irParaConsulta() { irPara_(ABAS.CONSULTA); }
function irParaLancamentos() { irPara_(ABAS.LANCAMENTOS); }
function irParaOdometro() { irPara_(ABAS.ODOMETRO); }
function irParaVeiculos() { irPara_(ABAS.VEICULOS); }
function irParaCentros() { irPara_(ABAS.CENTROS); }
function irParaParametros() { irPara_(ABAS.PARAMETROS); }
function irParaHistorico() { irPara_(ABAS.HISTORICO); }
function irParaPendencias() { irPara_(ABAS.CONFERENCIA); }

function gerarDepreciacaoMensalComAviso() {
  exigirExecucaoMutacao_();
  const r = gerarDepreciacaoMensal_();
  escreverConferencia_(coletarProblemas_());
  alerta_('Depreciação mensal', r.mensagem + '\n\nPendentes restantes: ' + r.status.pendentes +
    '\nDivergentes: ' + r.status.divergentes);
}

function alternarColunasTecnicasLancamentos() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.LANCAMENTOS);
  const ocultas = sheet.isColumnHiddenByUser(COL_LANC.CENTRO);
  if (ocultas) {
    sheet.showColumns(COL_LANC.CENTRO, COL_LANC.ID - COL_LANC.CENTRO + 1);
    toast_('Colunas técnicas I:L exibidas para auditoria.');
  } else {
    sheet.hideColumns(COL_LANC.CENTRO, COL_LANC.ID - COL_LANC.CENTRO + 1);
    toast_('Colunas técnicas I:L ocultadas.');
  }
}

function sobre() {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Esta ação só funciona com a planilha aberta: use o menu 🚚 Sistema de Frota dentro da planilha (o botão Executar do editor não abre telas).');
  const mesRef = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const periodo = periodoAtual_();
  alerta_('Sistema de Controle de Custos de Frota',
    'Período aberto: ' + nomeDoMes_(mesRef) + ' (' +
    formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim) + ')\n' +
    'Veículos cadastrados: ' + listaPlacas_(false).length +
    ' (' + listaPlacas_(true).length + ' ativos)\n' +
    'Lançamentos na base: ' + quantidadeLancamentosReais_() + '\n\n' +
    'Como funciona:\n' +
    '• Você lança as despesas em uma única tabela (aba Lançamentos).\n' +
    '• O Resumo é recalculado pelo sistema a cada gravação; Rateio, Dashboard e Relatórios saem dele.\n' +
    '• No fim do mês, "Fechar período" congela o Resumo e abre o mês seguinte.\n\n' +
    'Nenhuma aba calculada guarda dado digitado: pode reconstruir sem medo.');
}

// ==========================================================================
// 08B_Autenticacao.gs
// ==========================================================================

/**
 * Autenticação própria para o App da Web.
 *
 * Motivo: quando o Web App é implantado como "executar como eu",
 * Session.getActiveUser().getEmail() não é uma identidade confiável do visitante.
 * A planilha continua privada e cada usuário recebe uma sessão temporária.
 */

const TEMPO_SESSAO_SEGUNDOS = 21600; // 6 horas

/**
 * Contexto de segurança da execução atual.
 * Uma chamada pública antiga só pode alterar dados quando:
 *  - veio de uma API web que validou um token nesta mesma execução; ou
 *  - foi disparada diretamente na planilha por um usuário ADMIN.
 */
let CONTEXTO_WEB_AUTORIZADO_ = false;
let CONTEXTO_WEB_USUARIO_ = null;
let CONTEXTO_SISTEMA_INTERNO_ = false;
let CONTEXTO_PLANILHA_AUTORIZADO_ = null;

function execucaoTemPlanilhaAtiva_() {
  try {
    const ativa = SpreadsheetApp.getActiveSpreadsheet();
    if (!ativa) return false;
    const registrada = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
    if (registrada && ativa.getId() !== registrada) return false;
    // No Web App não existe uma UI de planilha vinculada à execução. Exigir getUi()
    // reduz a superfície dos gateways usados exclusivamente por sidebar/menu.
    SpreadsheetApp.getUi();
    return true;
  } catch (e) { return false; }
}

function emailAtivoSeguro_() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { return ''; }
}

function emailEfetivoSomenteBootstrap_() {
  try { return String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { return ''; }
}

/** Identidade para auditoria: token autenticado > contexto da planilha > ActiveUser. */
function emailContextoAtual_() {
  if (CONTEXTO_WEB_USUARIO_ && CONTEXTO_WEB_USUARIO_.email) return CONTEXTO_WEB_USUARIO_.email;
  if (CONTEXTO_PLANILHA_AUTORIZADO_ && CONTEXTO_PLANILHA_AUTORIZADO_.email) return CONTEXTO_PLANILHA_AUTORIZADO_.email;
  return emailAtivoSeguro_() || '(desconhecido)';
}

/** Identidade do usuário que está operando diretamente na planilha. */
function emailUsuarioPlanilha_(e) {
  if (!execucaoTemPlanilhaAtiva_()) return '';
  let email = '';
  try {
    if (e && e.user && typeof e.user.getEmail === 'function') email = e.user.getEmail() || '';
  } catch (erro) {}
  if (!email) email = emailAtivoSeguro_();
  return String(email || '').trim().toLowerCase();
}

/** Autoriza uma operação vinda da Central Operacional/planilha pelo cadastro interno. */
function autorizarContextoPlanilha_(e, permitidos) {
  const perfis = Array.isArray(permitidos) ? permitidos : [permitidos];
  const email = emailUsuarioPlanilha_(e);
  if (!email) {
    throw new Error('Não foi possível identificar seu e-mail corporativo. Use o menu "🚚 Sistema de Frota" para executar esta ação.');
  }
  const usuario = buscarUsuarioPorEmail_(email);
  if (!usuario || !usuario.ativo || perfis.indexOf(usuario.perfil) === -1) {
    throw new Error('Acesso negado para ' + email + '. Esta ação exige perfil ' + perfis.join(' ou ') + '.');
  }
  CONTEXTO_PLANILHA_AUTORIZADO_ = { email: email, perfil: usuario.perfil, nome: usuario.nome || email };
  return CONTEXTO_PLANILHA_AUTORIZADO_;
}

/** Operações de lançamento podem ser executadas por OPERADOR e ADMIN. */
function exigirExecucaoOperacional_() {
  if (CONTEXTO_WEB_AUTORIZADO_ && CONTEXTO_WEB_USUARIO_) return true;
  if (!execucaoTemPlanilhaAtiva_()) {
    throw new Error('Operação bloqueada fora de uma sessão autenticada ou da planilha vinculada.');
  }
  if (CONTEXTO_PLANILHA_AUTORIZADO_ &&
      ['OPERADOR', 'ADMIN'].indexOf(CONTEXTO_PLANILHA_AUTORIZADO_.perfil) !== -1) return true;

  const sheet = ss_().getSheetByName(ABAS.USUARIOS);
  const email = emailUsuarioPlanilha_(null);
  if (!sheet || sheet.getLastRow() < 2) return true; // primeira instalação apenas
  if (!email) throw new Error('Não foi possível identificar seu e-mail corporativo. Use uma conta Google cadastrada em Usuários.');
  const usuario = buscarUsuarioPorEmail_(email);
  if (!usuario || !usuario.ativo || ['OPERADOR', 'ADMIN'].indexOf(usuario.perfil) === -1) {
    throw new Error('Apenas OPERADOR ou ADMIN pode registrar lançamentos pela planilha.');
  }
  CONTEXTO_PLANILHA_AUTORIZADO_ = { email: usuario.email, perfil: usuario.perfil, nome: usuario.nome || usuario.email };
  return true;
}

/** Leituras sensíveis só podem ocorrer via token ou dentro da planilha vinculada. */
function exigirExecucaoLeitura_() {
  if (CONTEXTO_WEB_USUARIO_) return true;
  // Rotinas internas já autorizadas (ex.: recálculo do Resumo no gatilho instalável).
  if (CONTEXTO_SISTEMA_INTERNO_) return true;
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Leitura bloqueada fora de uma sessão autenticada.');
  const sheet = ss_().getSheetByName(ABAS.USUARIOS);
  if (!sheet || sheet.getLastRow() < 2) return true;
  const email = emailUsuarioPlanilha_(null);
  const usuario = email ? buscarUsuarioPorEmail_(email) : null;
  if (!usuario || !usuario.ativo || PERFIS_ACESSO.indexOf(usuario.perfil) === -1) {
    throw new Error('Acesso não autorizado à base do sistema.');
  }
  return true;
}

function autorizarContextoWeb_(token, permitidos) {
  const sessao = exigirPerfilToken_(token, permitidos);
  CONTEXTO_WEB_AUTORIZADO_ = true;
  CONTEXTO_WEB_USUARIO_ = sessao;
  return sessao;
}

function exigirExecucaoMutacao_() {
  if (CONTEXTO_SISTEMA_INTERNO_) return true;
  if (CONTEXTO_WEB_AUTORIZADO_ && CONTEXTO_WEB_USUARIO_) return true;
  if (!execucaoTemPlanilhaAtiva_()) {
    throw new Error('Operação administrativa bloqueada fora de uma sessão autenticada ou da planilha vinculada.');
  }
  if (CONTEXTO_PLANILHA_AUTORIZADO_ && CONTEXTO_PLANILHA_AUTORIZADO_.perfil === 'ADMIN') return true;

  const sheet = ss_().getSheetByName(ABAS.USUARIOS);
  const semAcl = !sheet || sheet.getLastRow() < 2;
  let email = emailAtivoSeguro_();
  // EffectiveUser é aceito SOMENTE no bootstrap inicial, quando ainda não existe ACL.
  if (semAcl) {
    email = email || emailEfetivoSomenteBootstrap_();
    if (!email) throw new Error('Não foi possível identificar a conta para a instalação inicial.');
    return true;
  }
  if (!email) throw new Error('Operação administrativa bloqueada: não foi possível identificar o usuário ativo.');
  const usuario = buscarUsuarioPorEmail_(email);
  if (!usuario || !usuario.ativo || usuario.perfil !== 'ADMIN') {
    throw new Error('Apenas administradores podem alterar a base pela planilha.');
  }
  CONTEXTO_PLANILHA_AUTORIZADO_ = { email: usuario.email, perfil: usuario.perfil, nome: usuario.nome || usuario.email };
  return true;
}

function montarUsuarios_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.USUARIOS, true);
  const cabecalho = ['Email', 'Nome', 'Perfil', 'Salt', 'Senha Hash', 'Ativo', 'Observação', 'Trocar Senha'];
  sheet.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  estilizarCabecalho_(sheet.getRange(1, 1, 1, cabecalho.length));
  sheet.setFrozenRows(1);
  [260, 220, 130, 260, 420, 90, 360, 120].forEach(function (largura, i) {
    sheet.setColumnWidth(i + 1, largura);
  });
  // Salt e hash são técnicos: ficam ocultos para reduzir risco de edição acidental.
  try { sheet.hideColumns(4, 2); } catch (e) {}

  const validaPerfil = SpreadsheetApp.newDataValidation()
    .requireValueInList(PERFIS_ACESSO, true).setAllowInvalid(false).build();
  sheet.getRange('C2:C').setDataValidation(validaPerfil);

  const validaAtivo = SpreadsheetApp.newDataValidation()
    .requireValueInList(['SIM', 'NAO'], true).setAllowInvalid(false).build();
  sheet.getRange('F2:F').setDataValidation(validaAtivo);
  sheet.getRange('H2:H').setDataValidation(validaAtivo);

  // Cadastros antigos não tinham a coluna Trocar Senha. Mantemos como NÃO.
  if (sheet.getLastRow() >= 2) {
    const pendentes = sheet.getRange(2, 8, sheet.getLastRow() - 1, 1).getValues();
    let mudou = false;
    pendentes.forEach(function (linha) {
      if (!String(linha[0] || '').trim()) { linha[0] = 'NAO'; mudou = true; }
    });
    if (mudou) sheet.getRange(2, 8, pendentes.length, 1).setValues(pendentes);
  }

  // Primeiro administrador: a conta que executou a instalação.
  if (sheet.getLastRow() < 2) {
    const email = String(
      Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ''
    ).trim().toLowerCase();
    if (email) {
      const senhaTemporaria = gerarSenhaTemporaria_();
      const salt = Utilities.getUuid();
      sheet.appendRow([
        email, 'Administrador inicial', 'ADMIN', salt,
        hashSenha_(senhaTemporaria, salt), 'SIM',
        'Criado automaticamente na instalação; altere a senha após o primeiro acesso.', 'SIM'
      ]);
      return { email: email, senhaTemporaria: senhaTemporaria };
    }
  }
  return null;
}

/**
 * Recuperação administrativa pela própria planilha.
 * Gera uma nova senha temporária para o ADMIN que está executando o script
 * e obriga a definição de uma senha definitiva no próximo acesso ao Web App.
 */
function redefinirSenhaAdministrador() {
  exigirExecucaoMutacao_();
  const email = emailAtivoSeguro_();
  if (!email) throw new Error('Não foi possível identificar a conta administradora atual pela planilha.');

  const usuario = buscarUsuarioPorEmail_(email);
  if (!usuario || usuario.perfil !== 'ADMIN') {
    throw new Error('A conta atual não está cadastrada como ADMIN na aba Usuários.');
  }

  const senhaTemporaria = gerarSenhaTemporaria_();
  const novoSalt = Utilities.getUuid();
  const sheet = aba_(ABAS.USUARIOS);
  sheet.getRange(usuario.linha, 4).setValue(novoSalt);
  sheet.getRange(usuario.linha, 5).setValue(hashSenha_(senhaTemporaria, novoSalt));
  sheet.getRange(usuario.linha, 6).setValue('SIM');
  sheet.getRange(usuario.linha, 8).setValue('SIM');
  incrementarVersaoSessaoUsuario_(email);
  registrarLog_('Redefinir senha ADMIN', email + ' • senha temporária gerada');

  SpreadsheetApp.getUi().alert(
    'Senha do administrador redefinida',
    'USUÁRIO: ' + email + '\n\n' +
    'SENHA TEMPORÁRIA: ' + senhaTemporaria + '\n\n' +
    'No próximo acesso ao Web App será obrigatório criar uma senha definitiva.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function gerarSenhaTemporaria_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

/** Senha temporária escolhida pelo ADMIN. Nunca é persistida em texto puro. */
function validarSenhaTemporariaAdmin_(senha) {
  const valor = String(senha == null ? '' : senha);
  if (!valor) return { ok: true, fornecida: false, senha: '' };
  if (valor.length < 10) return { ok: false, mensagem: 'A senha temporária precisa ter pelo menos 10 caracteres.' };
  if (valor.length > 128) return { ok: false, mensagem: 'A senha temporária pode ter no máximo 128 caracteres.' };
  if (valor !== valor.trim()) return { ok: false, mensagem: 'A senha temporária não pode começar ou terminar com espaço.' };
  return { ok: true, fornecida: true, senha: valor };
}

function hashSenha_(senha, salt) {
  const texto = String(salt) + '|' + String(senha);
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function buscarUsuarioPorEmail_(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return null;
  const sheet = ss_().getSheetByName(ABAS.USUARIOS);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  for (let i = 0; i < dados.length; i++) {
    if (String(dados[i][0] || '').trim().toLowerCase() !== alvo) continue;
    return {
      linha: i + 2,
      email: alvo,
      nome: String(dados[i][1] || alvo),
      perfil: String(dados[i][2] || '').trim().toUpperCase(),
      salt: String(dados[i][3] || ''),
      senhaHash: String(dados[i][4] || ''),
      ativo: String(dados[i][5] || '').trim().toUpperCase() === 'SIM',
      trocarSenha: String(dados[i][7] || '').trim().toUpperCase() === 'SIM',
    };
  }
  return null;
}

/** ACL curta para não reler a aba Usuários em toda chamada autenticada. */
function estadoUsuarioAcesso_(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return null;
  const cache = CacheService.getScriptCache();
  const chave = CACHE_USUARIO_ACESSO_PREFIXO_ + alvo;
  const bruto = cache.get(chave);
  if (bruto) {
    try {
      ULTIMO_USUARIO_CACHE_HIT_ = true;
      return JSON.parse(bruto);
    } catch (e) {}
  }
  ULTIMO_USUARIO_CACHE_HIT_ = false;
  const usuario = buscarUsuarioPorEmail_(alvo);
  if (!usuario) return null;
  const estado = {
    email: usuario.email, nome: usuario.nome, perfil: usuario.perfil,
    ativo: usuario.ativo, trocarSenha: usuario.trocarSenha === true,
    authVersion: versaoSessaoUsuario_(usuario.email)
  };
  try { cache.put(chave, JSON.stringify(estado), CACHE_USUARIO_ACESSO_SEGUNDOS_); } catch (e) {}
  return estado;
}

function invalidarCacheUsuario_(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return;
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(CACHE_USUARIO_ACESSO_PREFIXO_ + alvo);
    cache.remove(CACHE_USUARIO_LOGIN_PREFIXO_ + alvo);
  } catch (e) {}
}

/** Versão de autenticação por usuário: redefinir senha/perfil revoga sessões antigas. */
function chaveVersaoSessaoUsuario_(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, alvo, Utilities.Charset.UTF_8);
  const hex = bytes.map(function(b){ const v=b<0?b+256:b; return ('0'+v.toString(16)).slice(-2); }).join('');
  return 'USER_SESSION_VER_' + hex.slice(0, 24);
}

function versaoSessaoUsuario_(email) {
  const chave = chaveVersaoSessaoUsuario_(email);
  if (!chave) return 1;
  const atual = Number(PropertiesService.getScriptProperties().getProperty(chave) || 1);
  return isFinite(atual) && atual >= 1 ? Math.floor(atual) : 1;
}

function incrementarVersaoSessaoUsuario_(email) {
  const chave = chaveVersaoSessaoUsuario_(email);
  if (!chave) return 1;
  const nova = versaoSessaoUsuario_(email) + 1;
  PropertiesService.getScriptProperties().setProperty(chave, String(nova));
  invalidarCacheUsuario_(email);
  return nova;
}

/**
 * Registro de login sem abrir a planilha durante a autenticação.
 * O evento fica alguns instantes nas Script Properties e é descarregado no Log
 * na próxima operação normal. Assim o login não espera um appendRow().
 */
function registrarLoginPendente_(usuario) {
  try {
    const chave = PREFIXO_LOG_LOGIN_PENDENTE_ + Date.now() + '_' + Utilities.getUuid().slice(0, 8);
    PropertiesService.getScriptProperties().setProperty(chave, JSON.stringify({
      quando: new Date().toISOString(),
      quem: usuario.email,
      acao: 'Login no Web App',
      detalhe: usuario.email + ' • ' + usuario.perfil
    }));
  } catch (e) {}
}

function descarregarLoginsPendentes_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const todos = props.getProperties();
    const chaves = Object.keys(todos).filter(function (k) {
      return k.indexOf(PREFIXO_LOG_LOGIN_PENDENTE_) === 0;
    }).sort();
    if (!chaves.length) return 0;

    const sheet = ss_().getSheetByName(ABAS.LOG);
    if (!sheet) return 0;
    const linhas = [];
    const consumidas = [];
    chaves.slice(0, 100).forEach(function (chave) {
      try {
        const item = JSON.parse(todos[chave]);
        linhas.push([new Date(item.quando), item.quem || '(desconhecido)', item.acao || 'Login no Web App', item.detalhe || '']);
        consumidas.push(chave);
      } catch (e) {
        consumidas.push(chave);
      }
    });
    if (linhas.length) {
      const primeira = sheet.getLastRow() + 1;
      sheet.getRange(primeira, 1, linhas.length, 4).setValues(linhas);
      sheet.getRange(primeira, 1, linhas.length, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    }
    consumidas.forEach(function (chave) { props.deleteProperty(chave); });
    arquivarExcedenteLog_();
    return linhas.length;
  } catch (e) {
    console.error('descarregarLoginsPendentes_: ' + e.message);
    return 0;
  }
}

/** Credenciais em cache servidor-side. A senha nunca é armazenada, apenas salt/hash já existentes. */
function usuarioLoginComCache_(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return null;
  const cache = CacheService.getScriptCache();
  const chave = CACHE_USUARIO_LOGIN_PREFIXO_ + alvo;
  const bruto = cache.get(chave);
  if (bruto) {
    try {
      ULTIMO_LOGIN_CACHE_HIT_ = true;
      return JSON.parse(bruto);
    } catch (e) {}
  }
  ULTIMO_LOGIN_CACHE_HIT_ = false;
  const usuario = buscarUsuarioPorEmail_(alvo);
  if (!usuario) return null;
  try { cache.put(chave, JSON.stringify(usuario), CACHE_USUARIO_LOGIN_SEGUNDOS_); } catch (e) {}
  return usuario;
}

function aquecerCacheAcessoUsuario_(usuario) {
  try {
    CacheService.getScriptCache().put(
      CACHE_USUARIO_ACESSO_PREFIXO_ + usuario.email,
      JSON.stringify({
        email: usuario.email, nome: usuario.nome, perfil: usuario.perfil,
        ativo: usuario.ativo, trocarSenha: usuario.trocarSenha === true,
        authVersion: versaoSessaoUsuario_(usuario.email)
      }),
      CACHE_USUARIO_ACESSO_SEGUNDOS_);
  } catch (e) {}
}

function chaveFalhaLogin_(email) {
  return PREFIXO_FALHA_LOGIN_ + String(email || '').trim().toLowerCase();
}

function estadoFalhaLogin_(email) {
  const cache = CacheService.getScriptCache();
  const bruto = cache.get(chaveFalhaLogin_(email));
  if (!bruto) return { tentativas: 0 };
  try { return JSON.parse(bruto); } catch (e) { return { tentativas: 0 }; }
}

function registrarFalhaLogin_(email) {
  const cache = CacheService.getScriptCache();
  const estado = estadoFalhaLogin_(email);
  estado.tentativas = Number(estado.tentativas || 0) + 1;
  estado.ultimoMs = Date.now();
  try { cache.put(chaveFalhaLogin_(email), JSON.stringify(estado), BLOQUEIO_LOGIN_SEGUNDOS_); } catch (e) {}
  return estado.tentativas;
}

function limparFalhasLogin_(email) {
  try { CacheService.getScriptCache().remove(chaveFalhaLogin_(email)); } catch (e) {}
}

function normalizarDominiosLogin_(valor) {
  const dominios = String(valor || '').split(/[,;\s]+/)
    .map(function(d){ return d.trim().toLowerCase().replace(/^@/,''); }).filter(Boolean)
    .filter(function(d,i,a){ return a.indexOf(d) === i; });
  const regex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  const invalidos = dominios.filter(function(d){ return !regex.test(d); });
  return { dominios: dominios, invalidos: invalidos, valor: dominios.join(',') };
}

function dominiosLoginPermitidos_() {
  try {
    const mapa = parametrosExecucao_();
    const r = normalizarDominiosLogin_(mapa.DOMINIOS_LOGIN || '');
    // Falha fechada: parâmetro vazio/corrompido nunca amplia acesso; volta ao domínio corporativo padrão.
    return r.dominios.length && !r.invalidos.length ? r.dominios : ['giassi.com.br'];
  } catch (e) { return ['giassi.com.br']; }
}

function emailDominioPermitido_(email) {
  const dominios = dominiosLoginPermitidos_();
  if (!dominios.length) return true;
  const partes = String(email || '').trim().toLowerCase().split('@');
  return partes.length === 2 && dominios.indexOf(partes[1]) !== -1;
}

function autenticarUsuario_(email, senha) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!emailDominioPermitido_(alvo)) return { ok: false, mensagem: 'Usuário ou senha inválidos.' };
  const falhas = estadoFalhaLogin_(alvo);
  if (Number(falhas.tentativas || 0) >= MAX_TENTATIVAS_LOGIN_) {
    return { ok: false, mensagem: 'Muitas tentativas inválidas. Aguarde alguns minutos e tente novamente.' };
  }
  const usuario = usuarioLoginComCache_(alvo);
  if (!usuario || !usuario.ativo || !usuario.salt || !usuario.senhaHash ||
      hashSenha_(senha, usuario.salt) !== usuario.senhaHash) {
    registrarFalhaLogin_(alvo);
    return { ok: false, mensagem: 'Usuário ou senha inválidos.' };
  }
  if (PERFIS_ACESSO.indexOf(usuario.perfil) === -1) {
    registrarFalhaLogin_(alvo);
    return { ok: false, mensagem: 'Usuário ou senha inválidos.' };
  }
  limparFalhasLogin_(alvo);
  return { ok: true, usuario: usuario };
}

/**
 * Lastro das sessoes em PropertiesService (V4.8.7).
 *
 * O CacheService e memoria com DESPEJO: a entrada pode sumir muito antes das 6
 * horas de TTL, sob pressao do proprio Google. O sintoma e o usuario deslogar
 * sozinho, sem padrao, no meio do expediente — reclamacao praticamente
 * impossivel de diagnosticar, porque nao se reproduz.
 *
 * O cache continua sendo o caminho rapido. Isto aqui e so a rede: na falha de
 * leitura, a sessao e reconstruida e o cache reidratado.
 *
 * A chave gravada e o HASH do token, nao o token. Quem conseguir ler as
 * Properties leva hashes, nao credenciais utilizaveis — e o custo e um digest
 * por acesso que ja errou o cache.
 */
const PREFIXO_LASTRO_SESSAO_ = 'SESL_';

function chaveLastroSessao_(token) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8);
  return PREFIXO_LASTRO_SESSAO_ + bytes.map(function (b) {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('').slice(0, 32);
}

function gravarLastroSessao_(token, email) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      chaveLastroSessao_(token),
      JSON.stringify({ email: email, exp: Date.now() + TEMPO_SESSAO_SEGUNDOS * 1000 }));
  } catch (e) { /* lastro e melhoria, nao pode derrubar o login */ }
}

function removerLastroSessao_(token) {
  try { PropertiesService.getScriptProperties().deleteProperty(chaveLastroSessao_(token)); }
  catch (e) {}
}

/** Reconstroi a sessao a partir do lastro quando o cache despejou a entrada. */
function sessaoDoLastro_(token) {
  let bruto = null;
  try { bruto = PropertiesService.getScriptProperties().getProperty(chaveLastroSessao_(token)); }
  catch (e) { return null; }
  if (!bruto) return null;
  let dados;
  try { dados = JSON.parse(bruto); } catch (e) { return null; }
  if (!dados || !dados.email || !(Number(dados.exp) > Date.now())) {
    removerLastroSessao_(token);
    return null;
  }
  // O perfil NAO vem do lastro: vem do cadastro, agora. Guardar o perfil aqui
  // faria uma sessao sobreviver a um rebaixamento de permissao.
  const atual = estadoUsuarioAcesso_(dados.email);
  if (!atual || !atual.ativo) {
    removerLastroSessao_(token);
    return null;
  }
  return {
    email: dados.email, nome: atual.nome || '', perfil: atual.perfil,
    telas: TELAS_POR_PERFIL[atual.perfil] || [],
    trocarSenha: atual.trocarSenha === true,
    authVersion: Number(atual.authVersion || 1),
  };
}

/** Limpa lastros vencidos. Chamado pelo flush horario que ja existe. */
function limparLastrosVencidos_() {
  let props;
  try { props = PropertiesService.getScriptProperties(); } catch (e) { return 0; }
  const todas = props.getProperties();
  let removidos = 0;
  Object.keys(todas).forEach(function (chave) {
    if (chave.indexOf(PREFIXO_LASTRO_SESSAO_) !== 0) return;
    let exp = 0;
    try { exp = Number(JSON.parse(todas[chave]).exp) || 0; } catch (e) { exp = 0; }
    if (!(exp > Date.now())) { try { props.deleteProperty(chave); removidos++; } catch (e) {} }
  });
  return removidos;
}

function criarSessaoWeb_(usuario) {
  CONTEXTO_WEB_AUTORIZADO_ = true;
  const token = Utilities.getUuid() + Utilities.getUuid();
  const sessao = {
    email: usuario.email, nome: usuario.nome, perfil: usuario.perfil,
    telas: TELAS_POR_PERFIL[usuario.perfil] || [], trocarSenha: usuario.trocarSenha === true,
    authVersion: versaoSessaoUsuario_(usuario.email)
  };
  CONTEXTO_WEB_USUARIO_ = sessao;
  CacheService.getScriptCache().put(
    'SESSAO_' + token, JSON.stringify(sessao), TEMPO_SESSAO_SEGUNDOS);
  gravarLastroSessao_(token, usuario.email);
  aquecerCacheAcessoUsuario_(usuario);
  registrarLoginPendente_(usuario);
  return { token: token, sessao: sessao };
}

/** Entrada legada mantida para compatibilidade com versões anteriores do HTML. */
function webLogin(email, senha) {
  const auth = autenticarUsuario_(email, senha);
  if (!auth.ok) return auth;
  const criada = criarSessaoWeb_(auth.usuario);
  return { ok: true, token: criada.token, usuario: criada.sessao };
}

function sessaoPorToken_(token) {
  if (!token) throw new Error('Sessão ausente. Entre novamente no sistema.');
  const cache = CacheService.getScriptCache();
  const chave = 'SESSAO_' + String(token);
  let sessao;
  const bruto = cache.get(chave);
  if (bruto) {
    sessao = JSON.parse(bruto);
  } else {
    // Cache vazio nao significa sessao expirada: pode ter sido despejado.
    sessao = sessaoDoLastro_(token);
    if (!sessao) throw new Error('Sua sessão expirou. Entre novamente no sistema.');
    cache.put(chave, JSON.stringify(sessao), TEMPO_SESSAO_SEGUNDOS);   // reidrata
  }

  // Revalida o cadastro com ACL de curta duração. Evita reler Usuários a cada tela.
  const atual = estadoUsuarioAcesso_(sessao.email);
  if (!atual || !atual.ativo || atual.perfil !== sessao.perfil ||
      Number(atual.authVersion || 1) !== Number(sessao.authVersion || 1)) {
    cache.remove(chave);
    removerLastroSessao_(token);
    throw new Error('Seu acesso, senha ou perfil foi alterado. Entre novamente.');
  }

  sessao.nome = atual.nome || sessao.nome;
  sessao.trocarSenha = atual.trocarSenha === true;
  // Permissões de tela são recalculadas a cada chamada para que novas versões
  // administrativas apareçam sem exigir novo login.
  sessao.telas = TELAS_POR_PERFIL[atual.perfil] || [];
  const atualizado = JSON.stringify(sessao);
  cache.put(chave, atualizado, TEMPO_SESSAO_SEGUNDOS); // renova enquanto estiver usando
  return sessao;
}

function exigirPerfilToken_(token, permitidos) {
  const sessao = sessaoPorToken_(token);
  CONTEXTO_WEB_USUARIO_ = sessao;
  if (sessao.trocarSenha === true) {
    throw new Error('Troca de senha obrigatória. Defina sua senha definitiva para continuar.');
  }
  const perfis = Array.isArray(permitidos) ? permitidos : [permitidos];
  if (perfis.indexOf(sessao.perfil) === -1) {
    registrarLog_('Acesso negado', sessao.email + ' • requer ' + perfis.join('/'));
    throw new Error('Acesso negado para o perfil ' + sessao.perfil + '.');
  }
  return sessao;
}

function webSessao(token) {
  const s = sessaoPorToken_(token);
  if (PERFIS_ACESSO.indexOf(s.perfil) === -1) {
    return { ok: false, mensagem: 'Perfil de acesso inválido.' };
  }
  return { ok: true, usuario: s };
}

function webLogout(token) {
  if (token) {
    CacheService.getScriptCache().remove('SESSAO_' + String(token));
    // Sem isto o logout nao encerraria nada: o proximo acesso com o mesmo token
    // reconstruiria a sessao pelo lastro.
    removerLastroSessao_(token);
  }
  return { ok: true };
}

function webTrocarMinhaSenha(token, senhaAtual, novaSenha) {
  const sessao = sessaoPorToken_(token);
  if (PERFIS_ACESSO.indexOf(sessao.perfil) === -1) {
    return { ok: false, mensagem: 'Perfil de acesso inválido.' };
  }
  CONTEXTO_WEB_AUTORIZADO_ = true;
  CONTEXTO_WEB_USUARIO_ = sessao;
  if (String(novaSenha || '').length < 10) {
    return { ok: false, mensagem: 'A nova senha precisa ter pelo menos 10 caracteres.' };
  }
  if (String(novaSenha) === String(senhaAtual || '')) {
    return { ok: false, mensagem: 'A nova senha precisa ser diferente da senha temporária/atual.' };
  }
  const usuario = buscarUsuarioPorEmail_(sessao.email);
  if (!usuario || hashSenha_(senhaAtual, usuario.salt) !== usuario.senhaHash) {
    return { ok: false, mensagem: 'Senha atual incorreta.' };
  }
  const novoSalt = Utilities.getUuid();
  const sheet = aba_(ABAS.USUARIOS);
  sheet.getRange(usuario.linha, 4).setValue(novoSalt);
  sheet.getRange(usuario.linha, 5).setValue(hashSenha_(novaSenha, novoSalt));
  sheet.getRange(usuario.linha, 8).setValue('NAO');
  const novaVersaoSessao = incrementarVersaoSessaoUsuario_(sessao.email);

  sessao.trocarSenha = false;
  sessao.authVersion = novaVersaoSessao;
  aquecerCacheAcessoUsuario_({
    email: sessao.email, nome: sessao.nome, perfil: sessao.perfil, ativo: true, trocarSenha: false
  });
  CacheService.getScriptCache().put(
    'SESSAO_' + String(token), JSON.stringify(sessao), TEMPO_SESSAO_SEGUNDOS);
  registrarLog_('Trocar senha', sessao.email);
  return { ok: true, mensagem: 'Senha definitiva cadastrada com sucesso.', usuario: sessao };
}

function webUsuarios(token) {
  exigirPerfilToken_(token, 'ADMIN');
  const sheet = aba_(ABAS.USUARIOS);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter(function (l) { return l[0]; })
    .map(function (l) {
      return { email: l[0], nome: l[1], perfil: l[2], ativo: l[5], observacao: l[6], trocarSenha: l[7] };
    });
}

function webSalvarUsuario(token, dados) {
  const admin = autorizarContextoWeb_(token, 'ADMIN');
  const email = String(dados.email || '').trim().toLowerCase();
  const emailOriginal = String(dados.emailOriginal || '').trim().toLowerCase();
  const perfil = String(dados.perfil || '').trim().toUpperCase();
  const nomeUsuario = String(dados.nome || email).trim().slice(0, 150) || email;
  const observacaoUsuario = String(dados.observacao || '').trim().slice(0, 500);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) return { ok: false, mensagem: 'E-mail inválido.' };
  if (emailOriginal && emailOriginal !== email) {
    return { ok: false, mensagem: 'O e-mail é a identidade do usuário e não pode ser renomeado. Crie o novo usuário e depois desative o cadastro antigo.' };
  }
  if (!emailDominioPermitido_(email)) return { ok: false, mensagem: 'E-mail fora dos domínios corporativos permitidos em DOMINIOS_LOGIN.' };
  if (PERFIS_ACESSO.indexOf(perfil) === -1) return { ok: false, mensagem: 'Perfil inválido.' };

  const sheet = aba_(ABAS.USUARIOS);
  const existente = emailOriginal ? buscarUsuarioPorEmail_(emailOriginal) : buscarUsuarioPorEmail_(email);
  if (emailOriginal && !existente) return { ok: false, mensagem: 'O usuário original não foi localizado. Atualize a lista antes de salvar.' };
  let linha = existente ? existente.linha : sheet.getLastRow() + 1;
  let salt = existente ? existente.salt : Utilities.getUuid();
  let senhaHash = existente ? existente.senhaHash : '';
  let senhaTemporaria = '';
  let trocarSenha = existente && existente.trocarSenha ? 'SIM' : 'NAO';

  let senhaDefinidaPeloAdmin = false;
  if (!existente || dados.redefinirSenha === true) {
    const validacaoSenha = validarSenhaTemporariaAdmin_(dados.senhaTemporaria);
    if (!validacaoSenha.ok) return { ok: false, mensagem: validacaoSenha.mensagem };
    senhaDefinidaPeloAdmin = validacaoSenha.fornecida === true;
    senhaTemporaria = senhaDefinidaPeloAdmin ? validacaoSenha.senha : gerarSenhaTemporaria_();
    salt = Utilities.getUuid();
    senhaHash = hashSenha_(senhaTemporaria, salt);
    trocarSenha = 'SIM';
  }

  // Blindagem: depois que houver administradores, o sistema nunca permite
  // desativar/rebaixar um ADMIN ativo se isso deixar menos de 2 ADMINs ativos.
  const novoAtivo = dados.ativo === false ? false : true;
  const existenteEraAdminAtivo = !!(existente && existente.ativo && existente.perfil === 'ADMIN');
  const continuaraAdminAtivo = perfil === 'ADMIN' && novoAtivo;
  if (existenteEraAdminAtivo && !continuaraAdminAtivo) {
    const adminsAtivos = listarAdminsAtivos_();
    if (adminsAtivos.length <= 2) {
      return {
        ok: false,
        mensagem: 'Operação bloqueada. O sistema precisa manter pelo menos 2 administradores ativos. ' +
          'Cadastre/ative outro ADMIN antes de desativar ou alterar o perfil de ' + email + '.'
      };
    }
  }

  sheet.getRange(linha, 1, 1, 8).setValues([[
    email, nomeUsuario, perfil, salt, senhaHash,
    dados.ativo === false ? 'NAO' : 'SIM', observacaoUsuario, trocarSenha
  ]]);
  const mudouPermissao = !existente || existente.perfil !== perfil || existente.ativo !== novoAtivo;
  const mudouSeguranca = mudouPermissao || dados.redefinirSenha === true;
  if (mudouSeguranca) incrementarVersaoSessaoUsuario_(email);
  else invalidarCacheUsuario_(email); // nome/observação propagam sem derrubar a sessão
  invalidarCacheSaude_();
  registrarLog_('Cadastro de usuário', admin.email + ' → ' + email + ' • ' + perfil +
    (mudouSeguranca ? ' • sessões anteriores revogadas' : ''));

  let avisoProtecao = '';
  if (mudouPermissao) {
    try {
      protegerAbasCalculadas_();
    } catch (e) {
      avisoProtecao = ' Usuário salvo, mas a proteção por perfil não pôde ser sincronizada automaticamente: ' + e.message;
      registrarLog_('Aviso proteção por perfil', email + ' • ' + e.message);
    }
  }
  return {
    ok: true, mensagem: (existente ? 'Usuário atualizado.' : 'Usuário criado.') + avisoProtecao,
    // Só devolvemos a senha quando o sistema a gerou. Se o ADMIN digitou, ela não
    // volta pelo servidor e nunca é gravada no Log/planilha em texto puro.
    senhaTemporaria: senhaDefinidaPeloAdmin ? '' : senhaTemporaria,
    senhaDefinidaPeloAdmin: senhaDefinidaPeloAdmin
  };
}

/** Gera uma sugestão de senha temporária para o ADMIN copiar/entregar ao usuário. */
function webGerarSenhaTemporaria(token) {
  exigirPerfilToken_(token, 'ADMIN');
  return { ok: true, senha: gerarSenhaTemporaria_() };
}

/** Exclui um usuário do cadastro interno com proteção contra perda de administração. */
function webExcluirUsuario(token, email, confirmacao) {
  const admin = autorizarContextoWeb_(token, 'ADMIN');
  const alvo = String(email || '').trim().toLowerCase();
  const confirma = String(confirmacao || '').trim().toLowerCase();
  if (!alvo || confirma !== alvo) {
    return { ok: false, mensagem: 'Confirmação inválida. Informe exatamente o e-mail do usuário que será excluído.' };
  }
  if (alvo === String(admin.email || '').trim().toLowerCase()) {
    return { ok: false, mensagem: 'Você não pode excluir a própria conta enquanto está conectado. Use outro ADMIN para essa operação.' };
  }

  const usuario = buscarUsuarioPorEmail_(alvo);
  if (!usuario) return { ok: false, mensagem: 'Usuário não encontrado.' };
  if (usuario.ativo && usuario.perfil === 'ADMIN' && listarAdminsAtivos_().length <= 2) {
    return { ok: false, mensagem: 'Operação bloqueada. O sistema precisa manter pelo menos 2 administradores ativos.' };
  }

  const sheet = aba_(ABAS.USUARIOS);
  const backupLinha = sheet.getRange(usuario.linha, 1, 1, 8).getValues()[0];
  incrementarVersaoSessaoUsuario_(alvo); // derruba sessões já emitidas
  sheet.deleteRow(usuario.linha);
  invalidarCacheUsuario_(alvo);
  invalidarCacheSaude_();

  try {
    protegerAbasCalculadas_();
  } catch (e) {
    // Se não conseguimos retirar o usuário das exceções de proteção, restaura o
    // cadastro para não deixar a ACL interna divergente das proteções reais.
    try {
      sheet.insertRowBefore(usuario.linha);
      sheet.getRange(usuario.linha, 1, 1, 8).setValues([backupLinha]);
      invalidarCacheUsuario_(alvo);
      protegerAbasCalculadas_();
    } catch (rollbackErro) {}
    registrarLog_('Falha ao excluir usuário', admin.email + ' → ' + alvo + ' • ' + e.message);
    return { ok: false, mensagem: 'A exclusão foi revertida porque as proteções não puderam ser sincronizadas: ' + e.message };
  }

  registrarLog_('Excluir usuário', admin.email + ' → ' + alvo + ' • ' + usuario.perfil);
  return {
    ok: true,
    mensagem: 'Usuário ' + alvo + ' excluído do sistema e removido das permissões internas. ' +
      'Se ele também tiver acesso ao arquivo pelo botão Compartilhar do Google Drive, remova esse compartilhamento separadamente.'
  };
}

// ==========================================================================
// 09_WebApp.gs
// ==========================================================================

/**
 * App da web: lancamento pelo celular, sem abrir a planilha.
 *
 * Publicacao: Implantar > Nova implantacao > Tipo "App da Web".
 *   Executar como .......: Eu (dono da planilha)
 *   Quem pode acessar ...: Somente pessoas da organizacao  <- IMPORTANTE
 *
 * Com "Executar como: eu", o código roda com a identidade do implantador.
 * Por isso nenhuma mutação confia em EffectiveUser: o App exige a sessão/token interno.
 * Mantenha o acesso da implantação restrito à organização; o login interno é uma camada adicional.
 *
 * Depois de qualquer alteracao no codigo, publique uma NOVA VERSAO da
 * implantacao; o link continua o mesmo.
 */

/** Telas que o app aceita como ponto de entrada (?p=...). */
const TELAS_WEB = ['inicio', 'lancar', 'lancamentos', 'bomba', 'comprovantes', 'consulta', 'relatorios', 'resumo', 'rateio',
  'orcamento', 'veiculos', 'fornecedores', 'centros', 'pendencias', 'depreciacao', 'ipva', 'fechamento',
  'saude', 'config', 'usuarios', 'log'];

function doGet(e) {
  const pedida = (e && e.parameter && e.parameter.p) || 'inicio';
  const template = HtmlService.createTemplateFromFile('App');
  template.paginaInicial = TELAS_WEB.indexOf(pedida) !== -1 ? pedida : 'inicio';

  return template.evaluate()
    .setTitle('Sistema de Frota')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Verifica se o sistema já foi instalado (o app depende das abas de dados). */
function sistemaInstalado_() {
  try {
    const planilha = ss_();
    return [ABAS.PARAMETROS, ABAS.VEICULOS, ABAS.LANCAMENTOS]
      .every(function (nome) { return planilha.getSheetByName(nome) !== null; });
  } catch (erro) {
    return false;
  }
}

/** Estado inicial do app: período, listas e quem está usando. */
function dadosApp_() {
  exigirExecucaoLeitura_();
  if (!sistemaInstalado_()) {
    return {
      ok: false,
      mensagem: 'O sistema ainda não foi instalado nesta planilha. ' +
        'Abra a planilha e rode "🚚 Sistema de Frota → Instalar / atualizar sistema".',
    };
  }
  const base = dadosFormulario();
  base.ok = true;
  base.usuario = Session.getActiveUser().getEmail() || '';
  return base;
}

/** Estado inicial autenticado do Web App. */
function webDadosApp(token) {
  const sessao = exigirPerfilToken_(token, PERFIS_ACESSO);
  const base = dadosApp_();
  if (!base.ok) return base;
  base.usuario = sessao.email;
  base.nomeUsuario = sessao.nome;
  base.perfil = sessao.perfil;
  base.telas = sessao.telas;
  return base;
}

/** Metadados estáveis da abertura: formulário + filtros. */
function bootstrapMetaComCache_(forcar) {
  const cache = CacheService.getScriptCache();
  if (!forcar) {
    const bruto = cache.get(CACHE_BOOTSTRAP_META_);
    if (bruto) {
      try {
        ULTIMO_META_CACHE_HIT_ = true;
        return JSON.parse(bruto);
      } catch (e) {}
    }
  }

  ULTIMO_META_CACHE_HIT_ = false;
  if (!sistemaInstalado_()) {
    return { ok:false, mensagem:'O sistema ainda não foi instalado nesta planilha. Rode "Instalar / atualizar sistema".' };
  }
  const pacote = {
    ok: true,
    config: dadosFormulario(),
    filtros: { centros: listaCentros_(), categorias: listaCategorias_() }
  };
  try { cache.put(CACHE_BOOTSTRAP_META_, JSON.stringify(pacote), CACHE_BOOTSTRAP_META_SEGUNDOS_); } catch (e) {}
  return pacote;
}

function invalidarCacheBootstrap_() {
  try { CacheService.getScriptCache().remove(CACHE_BOOTSTRAP_META_); } catch (e) {}
}

/**
 * Carga inicial otimizada do Web App. Reúne sessão, formulário, filtros e, quando
 * a tela inicial é o dashboard, os indicadores em UMA única chamada cliente→servidor.
 */
function montarBootstrapParaSessao_(sessao, paginaInicial, diagnosticoBase) {
  const t0 = Date.now();
  if (PERFIS_ACESSO.indexOf(sessao.perfil) === -1) {
    return { ok: false, mensagem: 'Perfil de acesso inválido.' };
  }
  if (sessao.trocarSenha === true) {
    return { ok: true, trocarSenha: true, usuario: sessao };
  }

  const tMeta = Date.now();
  const meta = bootstrapMetaComCache_(false);
  const metaMs = Date.now() - tMeta;
  const metaCache = ULTIMO_META_CACHE_HIT_;
  if (!meta || !meta.ok) return meta;

  const inicial = String(paginaInicial || 'inicio');
  const tInicio = Date.now();
  const inicio = inicial === 'inicio' ? dadosInicioComCache_(false) : null;
  const inicioMs = Date.now() - tInicio;
  const base = diagnosticoBase || {};
  const totalMs = Number(base.tempoAnteriorMs || 0) + (Date.now() - t0);

  if (inicio) {
    inicio.tempoServidorMs = totalMs;
    inicio.diagnostico = {
      loginMs: base.loginMs == null ? null : Number(base.loginMs),
      loginCache: base.loginCache === true,
      sessaoMs: Number(base.sessaoMs || 0),
      metaMs: metaMs,
      inicioMs: inicioMs,
      usuarioCache: base.usuarioCache === true,
      metaCache: metaCache,
      dashboardCache: inicio.cacheHit === true
    };
  }

  return {
    ok: true,
    trocarSenha: false,
    usuario: sessao,
    config: meta.config,
    filtros: meta.filtros,
    inicio: inicio
  };
}

function webBootstrap(token, paginaInicial) {
  const t0 = Date.now();
  const tSessao = Date.now();
  const sessao = sessaoPorToken_(token);
  const sessaoMs = Date.now() - tSessao;
  return montarBootstrapParaSessao_(sessao, paginaInicial, {
    sessaoMs: sessaoMs,
    usuarioCache: ULTIMO_USUARIO_CACHE_HIT_,
    tempoAnteriorMs: Date.now() - t0
  });
}

/**
 * V4.2: autentica e devolve a carga inicial completa em UMA chamada cliente→servidor.
 * Evita o ciclo webLogin() -> resposta -> webBootstrap() que duplicava latência.
 */
function webLoginBootstrap(email, senha, paginaInicial) {
  const t0 = Date.now();
  const auth = autenticarUsuario_(email, senha);
  const loginMs = Date.now() - t0;
  const loginCache = ULTIMO_LOGIN_CACHE_HIT_;
  if (!auth.ok) return auth;

  const criada = criarSessaoWeb_(auth.usuario);
  if (criada.sessao.trocarSenha === true) {
    return { ok: true, token: criada.token, usuario: criada.sessao, trocarSenha: true };
  }

  const pacote = montarBootstrapParaSessao_(criada.sessao, paginaInicial, {
    loginMs: loginMs,
    loginCache: loginCache,
    sessaoMs: 0,
    usuarioCache: true,
    tempoAnteriorMs: Date.now() - t0
  });
  pacote.token = criada.token;
  return pacote;
}


/** APIs autenticadas para recursos legados usados também pela planilha. */
function webUltimoOdometro(token, placa) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  return ultimoOdometro(placa);
}

function webUltimosLancamentos(token, quantidade) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  return ultimosLancamentos_(quantidade);
}

function webSalvarLancamento(token, dados) {
  autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  const resposta = salvarLancamento_(dados);
  if (resposta && resposta.ok) invalidarCacheInicio_();
  return resposta;
}

/** Últimos lançamentos gravados, para conferência rápida no celular. */
function ultimosLancamentos_(quantidade) {
  exigirExecucaoLeitura_();
  if (!sistemaInstalado_()) return [];
  const sheet = aba_(ABAS.LANCAMENTOS);
  const total = quantidadeLancamentosReais_();
  if (total < 1) return [];
  const solicitado = Math.max(1, Math.min(50, Math.floor(Number(quantidade || 8)) || 8));
  const quantas = Math.min(solicitado, total);
  const ultima = ultimaLinhaLancamentoReal_();
  return sheet.getRange(ultima - quantas + 1, 1, quantas, 5).getValues()
    .reverse()
    .map(function (linha) {
      return {
        data: linha[0] instanceof Date ? formatarData_(linha[0]) : String(linha[0]),
        placa: String(linha[1] || ''),
        tipo: String(linha[2] || ''),
        valor: Number(linha[4]) || 0,
      };
    });
}

/** Mostra a URL do app publicado (menu da planilha). */
function mostrarLinkDoApp() {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Esta ação só funciona com a planilha aberta: use o menu 🚚 Sistema de Frota dentro da planilha (o botão Executar do editor não abre telas).');
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    alerta_('App da web',
      'O app ainda não foi publicado.\n\n' +
      'No editor do Apps Script: Implantar → Nova implantação → tipo "App da Web".\n' +
      'Executar como: Eu.\n' +
      'Quem pode acessar: somente pessoas da sua organização.');
    return;
  }
  alerta_('App da web publicado',
    'O sistema completo roda neste link:\n\n' + url + '\n\n' +
    'Atalhos diretos para uma tela: acrescente ?p=lancar, ?p=relatorios, ' +
    '?p=consulta, ?p=fechamento…\n\n' +
    'Depois de alterar o código, publique uma nova versão da mesma implantação ' +
    'para o link continuar valendo.');
}

// ==========================================================================
// 10_RelatoriosAvancados.gs
// ==========================================================================

/**
 * Aba "Relatorios": um painel com seletor de relatorio + filtros.
 *
 * A logica: o script escreve UMA formula QUERY na linha 7, montada conforme a
 * selecao. O resultado continua sendo formula viva - muda um lancamento, o
 * relatorio acompanha - mas cada relatorio tem cabecalho, formato e largura
 * proprios, o que nao daria para fazer com uma formula generica.
 */

const CEL_TIPO = 'B3';
const CEL_CENTRO = 'D3';
const CEL_CATEGORIA = 'F3';
const CEL_VEICULO = 'H3';
const LINHA_RELATORIO = 7;

/**
 * Catalogo de relatorios.
 *   fonte .....: 'resumo' (1 linha por veiculo, periodo aberto) ou
 *                'lancamentos' (base completa, todos os meses)
 *   selecao ...: clausula "select" da QUERY
 *   ordem .....: clausula "order by"
 *   onde ......: filtro fixo do relatorio
 *   filtros ...: quais filtros da barra se aplicam
 *   colunas ...: [rotulo, formato, largura] de cada coluna do resultado
 */
const CATALOGO_RELATORIOS = {
  'Gerencial por Centro de Custo': {
    descricao: 'Todos os veículos agrupados por centro de custo, com o custo do período.',
    fonte: 'resumo',
    selecao: 'D, A, B, C, F, H, X, J, L, Q, O, R, S, V',
    onde: 'A is not null',
    ordem: 'D, V desc',
    filtros: ['centro', 'categoria', 'veiculoResumo'],
    colunas: [
      ['Centro de Custo', '@', 150],
      ['Placa / ID', '@', 105],
      ['Veículo', '@', 175],
      ['Categoria', '@', 150],
      ['Combustível', 'R$ #,##0.00', 115],
      ['Arla', 'R$ #,##0.00', 105],
      ['Gás', 'R$ #,##0.00', 100],
      ['Oficina', 'R$ #,##0.00', 110],
      ['Pneus', 'R$ #,##0.00', 105],
      ['Diária/Pedágio', 'R$ #,##0.00', 120],
      ['IPVA (1/12)', 'R$ #,##0.00', 115],
      ['Depreciação', 'R$ #,##0.00', 115],
      ['KM Rodado', '#,##0', 100],
      ['TOTAL', 'R$ #,##0.00', 125],
    ],
  },

  'Manutenção — oficina e pneus': {
    descricao: 'Quem está consumindo manutenção, do maior para o menor.',
    fonte: 'resumo',
    selecao: 'A, B, C, D, J, L, J+L, O, S, V',
    onde: 'J+L > 0',
    ordem: 'J+L desc',
    filtros: ['centro', 'categoria', 'veiculoResumo'],
    colunas: [
      ['Placa / ID', '@', 105],
      ['Veículo', '@', 175],
      ['Categoria', '@', 150],
      ['Centro de Custo', '@', 150],
      ['Oficina', 'R$ #,##0.00', 115],
      ['Pneus', 'R$ #,##0.00', 110],
      ['Manutenção total', 'R$ #,##0.00', 135],
      ['IPVA (1/12)', 'R$ #,##0.00', 115],
      ['KM Rodado', '#,##0', 100],
      ['Custo total', 'R$ #,##0.00', 125],
    ],
  },

  'Abastecimento e consumo': {
    descricao: 'Litros, preço médio pago por litro e km/litro de cada veículo.',
    fonte: 'resumo',
    selecao: 'A, B, C, E, F, F/E, S, T, U, O',
    onde: 'E > 0',
    ordem: 'F desc',
    filtros: ['centro', 'categoria', 'veiculoResumo'],
    colunas: [
      ['Placa / ID', '@', 105],
      ['Veículo', '@', 175],
      ['Categoria', '@', 150],
      ['Litros', '#,##0.000', 105],
      ['Valor gasto', 'R$ #,##0.00', 125],
      ['Preço médio/litro', 'R$ #,##0.000', 140],
      ['KM Rodado', '#,##0', 100],
      ['KM por litro', '#,##0.00', 115],
      ['R$ por KM', 'R$ #,##0.000', 110],
      ['IPVA (1/12)', 'R$ #,##0.00', 115],
    ],
  },

  'Ranking de custo por KM': {
    descricao: 'Do mais caro para o mais barato por quilômetro rodado.',
    fonte: 'resumo',
    selecao: 'A, B, C, D, S, O, V, U',
    onde: 'S > 0',
    ordem: 'U desc',
    filtros: ['centro', 'categoria', 'veiculoResumo'],
    colunas: [
      ['Placa / ID', '@', 105],
      ['Veículo', '@', 175],
      ['Categoria', '@', 150],
      ['Centro de Custo', '@', 150],
      ['KM Rodado', '#,##0', 105],
      ['IPVA (1/12)', 'R$ #,##0.00', 115],
      ['Custo total', 'R$ #,##0.00', 125],
      ['R$ por KM', 'R$ #,##0.000', 115],
    ],
  },

  'IPVA por veículo': {
    descricao: 'Valor anual do cadastro e o um doze avos que entra no período. ' +
      'Veículo sem IPVA cadastrado não aparece aqui nem soma no mapa.',
    fonte: 'resumo',
    selecao: 'A, B, C, D, O, O*12, V',
    onde: 'O > 0',
    ordem: 'O desc',
    filtros: ['centro', 'categoria', 'veiculoResumo'],
    colunas: [
      ['Placa / ID', '@', 105],
      ['Veículo', '@', 175],
      ['Categoria', '@', 150],
      ['Centro de Custo', '@', 150],
      ['IPVA no período (1/12)', 'R$ #,##0.00', 165],
      ['IPVA anual', 'R$ #,##0.00', 125],
      ['Custo total do veículo', 'R$ #,##0.00', 165],
    ],
  },

  'Manutenção realizada por veículo': {
    descricao: 'Histórico de manutenção: cada serviço, a natureza e a peça trocada, ' +
      'agrupado por veículo. Usa toda a base, não só o período aberto.',
    fonte: 'lancamentos',
    selecao: 'B, A, C, L, M, N, F, E',
    onde: "C contains 'Oficina' or C = 'Pneus'",
    ordem: 'B, A desc',
    filtros: ['centroLancamento', 'categoriaLancamento', 'veiculoLancamento'],
    colunas: [
      ['Placa / ID', '@', 105], ['Data', 'dd/mm/yyyy', 100],
      ['Tipo de Despesa', '@', 170], ['Serviço / Natureza', '@', 190],
      ['Peça ou serviço realizado', '@', 320], ['Fornecedor', '@', 190],
      ['NF / OS', '@', 150], ['Valor', 'R$ #,##0.00', 120],
    ],
  },

  'Manutenção em oficina por veículo': {
    descricao: 'Só serviços de oficina, sem pneus: mão de obra e peça, agrupado por ' +
      'veículo. Usa toda a base. O pneu domina o valor e distorce a leitura de oficina.',
    fonte: 'lancamentos',
    selecao: 'B, A, C, L, M, N, F, E',
    onde: "C contains 'Oficina'",
    ordem: 'B, A desc',
    filtros: ['centroLancamento', 'categoriaLancamento', 'veiculoLancamento'],
    colunas: [
      ['Placa / ID', '@', 105], ['Data', 'dd/mm/yyyy', 100],
      ['Tipo de Despesa', '@', 170], ['Serviço / Natureza', '@', 190],
      ['Peça ou serviço realizado', '@', 320], ['Fornecedor', '@', 190],
      ['NF / OS', '@', 150], ['Valor', 'R$ #,##0.00', 120],
    ],
  },

  'Histórico de KM por veículo': {
    descricao: 'Todas as leituras de odômetro, com o que rodou desde a anterior, ' +
      'em quantos dias e a média diária. Marca leitura menor que a anterior. ' +
      'Usa toda a base. Só no app: os cálculos entre linhas não cabem numa QUERY.',
    somenteApp: true,
    fonte: 'lancamentos',
    filtros: ['centroLancamento', 'categoriaLancamento', 'veiculoLancamento'],
    colunas: [],
  },

  'Buscar peça ou serviço (garantia)': {
    descricao: 'Procura uma peça ou serviço em toda a base e devolve a NF, a data e ' +
      'há quantos dias foi feito — para acionar garantia. Só no app; a versão da ' +
      'planilha não tem campo de busca.',
    somenteApp: true,
    fonte: 'lancamentos',
    filtros: ['centroLancamento', 'categoriaLancamento', 'veiculoLancamento', 'termo'],
    colunas: [],
  },

  'Evolução mensal por natureza': {
    descricao: 'Um mês por linha, um tipo de despesa por coluna. Usa toda a base ' +
      '(só custo operacional: não entram imobilizado nem os fixos de cadastro).',
    fonte: 'lancamentos',
    selecao: 'J, sum(E)',
    onde: "J is not null and C <> 'Oficina Ativo' and C <> 'Plotagem'",
    agrupamento: 'group by J pivot C',
    ordem: 'J',
    filtros: ['veiculoLancamento'],
    colunas: [['Período', '@', 110]],
    colunaPadrao: ['R$ #,##0.00', 135],
  },

  'Evolução mensal por centro de custo': {
    descricao: 'Um mês por linha, um centro de custo por coluna. Usa toda a base ' +
      '(só custo operacional: não entram imobilizado nem os fixos de cadastro).',
    fonte: 'lancamentos',
    selecao: 'J, sum(E)',
    onde: "J is not null and C <> 'Oficina Ativo' and C <> 'Plotagem'",
    agrupamento: 'group by J pivot H',
    ordem: 'J',
    filtros: ['veiculoLancamento'],
    colunas: [['Período', '@', 110]],
    colunaPadrao: ['R$ #,##0.00', 135],
  },

  'Detalhamento de oficina por veículo': {
    descricao: 'Peças e serviços de oficina linha a linha, com NF/OS, data, valor e classificação da manutenção.',
    fonte: 'lancamentos',
    selecao: 'A, B, C, L, M, N, F, E, H, I, K',
    onde: "A >= date \"INICIO\" and A <= date \"FIM\" and C contains 'Oficina'",
    ordem: 'A desc',
    filtros: ['centroLancamento', 'categoriaLancamento', 'veiculoLancamento'],
    colunas: [
      ['Data', 'dd/mm/yyyy', 100], ['Placa / ID', '@', 105], ['Tipo de Despesa', '@', 170],
      ['Natureza da Oficina', '@', 190], ['Detalhe da Peça / Serviço', '@', 300],
      ['Fornecedor', '@', 190],
      ['NF / Documento / OS', '@', 150], ['Valor', 'R$ #,##0.00', 120],
      ['Centro de Custo', '@', 150], ['Categoria', '@', 140], ['ID Lançamento', '@', 160],
    ],
  },

  'Ativos do período (Oficina Ativo e Plotagem)': {
    descricao: 'Gastos classificados como ativo/imobilizado no período aberto: Oficina Ativo e Plotagem. ' +
      'Aparecem no Resumo, mas não somam no custo operacional.',
    fonte: 'lancamentos',
    selecao: 'A, B, C, M, N, F, E, H, I, K',
    onde: "A >= date \"INICIO\" and A <= date \"FIM\" and (C = 'Oficina Ativo' or C = 'Plotagem')",
    ordem: 'A desc',
    filtros: ['centroLancamento', 'categoriaLancamento', 'veiculoLancamento'],
    colunas: [
      ['Data', 'dd/mm/yyyy', 100], ['Placa / ID', '@', 105], ['Tipo de Despesa', '@', 150],
      ['Detalhe', '@', 280], ['Fornecedor', '@', 180], ['NF / Documento', '@', 140],
      ['Valor', 'R$ #,##0.00', 120], ['Centro de Custo', '@', 150], ['Categoria', '@', 140],
      ['ID Lançamento', '@', 160],
    ],
  },

  'Extrato de lançamentos do período': {
    descricao: 'Linha a linha, tudo que foi lançado no período aberto, incluindo NF e detalhamento de oficina.',
    fonte: 'lancamentos',
    selecao: 'A, B, I, C, L, M, N, D, E, H, F, K',
    onde: 'A >= date "INICIO" and A <= date "FIM"',
    ordem: 'A desc',
    filtros: ['centroLancamento', 'categoriaLancamento', 'veiculoLancamento'],
    colunas: [
      ['Data', 'dd/mm/yyyy', 100], ['Placa / ID', '@', 105], ['Categoria', '@', 150],
      ['Tipo de Despesa', '@', 180], ['Natureza da Oficina', '@', 190],
      ['Detalhe da Peça / Serviço', '@', 300], ['Fornecedor', '@', 190],
      ['Litros', '#,##0.000', 100],
      ['Valor', 'R$ #,##0.00', 120], ['Centro de Custo', '@', 150],
      ['NF / Documento / OS', '@', 150], ['ID Lançamento', '@', 160],
    ],
  },
};

const TIPOS_RELATORIO = Object.keys(CATALOGO_RELATORIOS);

/**
 * Relatorios que a ABA "Relatorios" consegue montar.
 *
 * A busca por peca depende de um campo de texto livre, e a aba monta UMA formula
 * QUERY a partir de um seletor — nao ha onde digitar o termo. Oferecer o item la
 * so entregaria um relatorio vazio sem explicacao.
 */
const TIPOS_RELATORIO_PLANILHA = TIPOS_RELATORIO.filter(function (tipo) {
  return CATALOGO_RELATORIOS[tipo].somenteApp !== true;
});

/** Monta a aba Relatórios (painel + primeiro relatório). */
function montarCentralRelatorios_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.RELATORIOS, true);
  const tipoAtual = sheet.getRange(CEL_TIPO).getValue();
  const centroAtual = sheet.getRange(CEL_CENTRO).getValue();
  const categoriaAtual = sheet.getRange(CEL_CATEGORIA).getValue();
  const veiculoAtual = sheet.getRange(CEL_VEICULO).getDisplayValue();

  removerFiltro_(sheet);
  sheet.getRange(1, 1, 5, 20).breakApart();
  sheet.clear();
  sheet.clearConditionalFormatRules();
  sheet.setHiddenGridlines(true);
  garantirLinhas_(sheet, 3000);
  garantirColunas_(sheet, 60);

  sheet.getRange('A1:K1').merge()
    .setFormula(fx_('="CENTRAL DE RELATÓRIOS   |   "&PARAM_EMPRESA&"   |   período "&' +
      dataBR_('PERIODO_INI') + '&" a "&' + dataBR_('PERIODO_FIM')))
    .setBackground(CORES.LARANJA).setFontColor(CORES.TEXTO_CLARO)
    .setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);

  // ----- barra de seleção
  sheet.getRange('A3').setValue('Relatório:').setFontWeight('bold')
    .setHorizontalAlignment('right');
  sheet.getRange('C3').setValue('Centro:').setFontWeight('bold')
    .setHorizontalAlignment('right');
  sheet.getRange('E3').setValue('Categoria:').setFontWeight('bold')
    .setHorizontalAlignment('right');
  sheet.getRange('G3').setValue('Veículo:').setFontWeight('bold')
    .setHorizontalAlignment('right');

  const celulaTipo = sheet.getRange(CEL_TIPO);
  celulaTipo.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(TIPOS_RELATORIO_PLANILHA, true)
      .setAllowInvalid(false).build());
  celulaTipo.setValue(
    TIPOS_RELATORIO_PLANILHA.indexOf(tipoAtual) !== -1 ? tipoAtual : TIPOS_RELATORIO_PLANILHA[0]);

  const centros = ['TODOS'].concat(listaCentros_());
  const categorias = ['TODAS'].concat(listaCategorias_());
  sheet.getRange(CEL_CENTRO).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(centros, true).setAllowInvalid(false).build());
  sheet.getRange(CEL_CENTRO).setValue(
    centros.indexOf(centroAtual) !== -1 ? centroAtual : 'TODOS');
  sheet.getRange(CEL_CATEGORIA).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(categorias, true).setAllowInvalid(false).build());
  sheet.getRange(CEL_CATEGORIA).setValue(
    categorias.indexOf(categoriaAtual) !== -1 ? categoriaAtual : 'TODAS');

  const veiculosFiltro = ['TODOS'];
  opcoesVeiculos_(false).forEach(function(v) {
    veiculosFiltro.push(v.placa);
    if (v.patrimonio) veiculosFiltro.push(v.patrimonio);
  });
  sheet.getRange(CEL_VEICULO).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(veiculosFiltro, true)
      .setAllowInvalid(true).setHelpText('Selecione/digite a placa ou o Código Patrimônio.').build());
  sheet.getRange(CEL_VEICULO).setValue(veiculoAtual && veiculoAtual !== '' ? veiculoAtual : 'TODOS');

  [CEL_TIPO, CEL_CENTRO, CEL_CATEGORIA, CEL_VEICULO].forEach(function (cel) {
    sheet.getRange(cel).setBackground(CORES.AMARELO).setFontWeight('bold')
      .setBorder(true, true, true, true, false, false, CORES.LARANJA,
        SpreadsheetApp.BorderStyle.SOLID);
  });
  sheet.setRowHeight(3, 28);

  sheet.getRange('A5:K5').merge().setFontStyle('italic').setFontColor('#555555');

  [110, 200, 80, 170, 90, 160, 130, 130, 130, 130, 130]
    .forEach(function (largura, i) { sheet.setColumnWidth(i + 1, largura); });

  aplicarRelatorio_();
  sheet.setFrozenRows(LINHA_RELATORIO);
  return sheet;
}

/** Escreve a fórmula do relatório selecionado e ajusta cabeçalho e formatos. */
function aplicarRelatorio_() {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.RELATORIOS);
  const tipo = String(sheet.getRange(CEL_TIPO).getValue());
  const config = CATALOGO_RELATORIOS[tipo];
  if (!config) return;

  const centro = String(sheet.getRange(CEL_CENTRO).getValue() || 'TODOS');
  const categoria = String(sheet.getRange(CEL_CATEGORIA).getValue() || 'TODAS');
  const entradaVeiculo = String(sheet.getRange(CEL_VEICULO).getDisplayValue() || 'TODOS').trim();
  let placaFiltro = null;
  if (entradaVeiculo && entradaVeiculo !== 'TODOS') {
    const rv = resolverVeiculo_(entradaVeiculo, false);
    if (!rv.ok) {
      sheet.getRange('A5').setValue(rv.mensagem || 'Veículo não encontrado.');
      sheet.getRange(LINHA_RELATORIO, 1).setValue('Nenhum resultado: veículo não identificado.');
      return sheet;
    }
    placaFiltro = normalizaPlaca_(rv.veiculo.placa);
  }

  // limpa o resultado anterior (a QUERY vive na primeira célula e expande sozinha)
  sheet.getRange(LINHA_RELATORIO, 1, sheet.getMaxRows() - LINHA_RELATORIO + 1,
    sheet.getMaxColumns()).clearContent();

  sheet.getRange('A5').setValue(config.descricao +
    (config.fonte === 'lancamentos' ? '  •  fonte: base completa de lançamentos'
      : '  •  fonte: Resumo do período aberto'));

  const filtros = [];
  (config.filtros || []).forEach(function (nome) {
    if (nome === 'centro' && centro !== 'TODOS') filtros.push("D = '" + centro.replace(/'/g, '') + "'");
    if (nome === 'categoria' && categoria !== 'TODAS') filtros.push("C = '" + categoria.replace(/'/g, '') + "'");
    // V4.8: em Lançamentos o Centro é H e a Categoria é I (J é o Período). As letras
    // antigas vinham do layout com a coluna Setor e filtravam a coluna errada.
    if (nome === 'centroLancamento' && centro !== 'TODOS') {
      filtros.push(letraColuna_(COL_LANC.CENTRO) + " = '" + centro.replace(/'/g, '') + "'");
    }
    if (nome === 'categoriaLancamento' && categoria !== 'TODAS') {
      filtros.push(letraColuna_(COL_LANC.CATEGORIA) + " = '" + categoria.replace(/'/g, '') + "'");
    }
    if (nome === 'veiculoResumo' && placaFiltro) filtros.push("A = '" + placaFiltro + "'");
    if (nome === 'veiculoLancamento' && placaFiltro) filtros.push("B = '" + placaFiltro + "'");
  });

  let onde = config.onde || '';
  if (onde.indexOf('date "INICIO"') !== -1) {
    onde = onde
      .replace('date "INICIO"', 'date \'"&' + dataIso_('PERIODO_INI') + '&"\'')
      // V4.8: "< dia seguinte" em vez de "<= último dia". A data do lançamento tem hora
      // (08:00/12:00), e "<= date 25/09" excluía tudo que foi lançado no dia 25 —
      // inclusive a depreciação, que é sempre gravada no último dia.
      .replace('<= date "FIM"', '< date \'"&' + dataIso_('(PERIODO_FIM+1)') + '&"\'');
  }
  if (filtros.length) {
    onde = onde ? onde + ' and ' + filtros.join(' and ') : filtros.join(' and ');
  }

  // Faixas derivadas do schema: literais aqui foram a origem do desalinhamento
  // toda vez que uma coluna nova entrou.
  const intervalo = config.fonte === 'resumo'
    ? ref_(ABAS.RESUMO) + '!$A$4:$' + letraColuna_(TOTAL_COL_RESUMO)
    : ref_(ABAS.LANCAMENTOS) + '!$A$2:$' + letraColuna_(TOTAL_COL_LANC);

  const partes = ['select ' + config.selecao];
  if (onde) partes.push('where ' + onde);
  if (config.agrupamento) partes.push(config.agrupamento);
  if (config.ordem) partes.push('order by ' + config.ordem);

  // Os títulos entram como "label" da própria QUERY: assim o cabeçalho é gerado
  // pela fórmula e nenhuma célula precisa ser sobrescrita por cima dela.
  const rotulos = config.colunas.map(function (coluna, i) {
    const campo = campoDaSelecao_(config.selecao, i);
    return campo ? campo + " '" + coluna[0].replace(/'/g, '') + "'" : null;
  }).filter(function (rotulo) { return rotulo !== null; });
  if (rotulos.length) partes.push('label ' + rotulos.join(', '));

  const formula = '=IFERROR(QUERY(' + intervalo + ',"' + partes.join(' ') + '",0),' +
    '"Nenhum resultado para os filtros selecionados.")';
  sheet.getRange(LINHA_RELATORIO, 1).setFormula(fx_(formula));
  SpreadsheetApp.flush();

  escreverCabecalhoRelatorio_(sheet, config);
  return sheet;
}

/**
 * A QUERY já devolve uma linha de cabeçalho; ela é sobrescrita com os rótulos
 * do catálogo (mais legíveis) e recebe os formatos de cada coluna.
 */
function escreverCabecalhoRelatorio_(sheet, config) {
  exigirExecucaoMutacao_();
  const largura = sheet.getLastColumn();
  const linhas = Math.max(sheet.getLastRow() - LINHA_RELATORIO, 1);

  // formato padrão para relatórios com número de colunas variável (pivot)
  for (let c = 1; c <= largura; c++) {
    const coluna = config.colunas[c - 1];
    const formato = coluna ? coluna[1] : (config.colunaPadrao || ['@', 130])[0];
    const largCol = coluna ? coluna[2] : (config.colunaPadrao || ['@', 130])[1];
    sheet.getRange(LINHA_RELATORIO + 1, c, linhas, 1).setNumberFormat(formato);
    sheet.setColumnWidth(c, largCol);
  }
  const cabecalho = sheet.getRange(LINHA_RELATORIO, 1, 1, largura);
  estilizarCabecalho_(cabecalho);
  sheet.setRowHeight(LINHA_RELATORIO, 30);

  // zebrado leve, para leitura em tela cheia
  sheet.clearConditionalFormatRules();
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(fx_('=ISEVEN(ROW())'))
      .setBackground('#FAF9F8')
      .setRanges([sheet.getRange(LINHA_RELATORIO + 1, 1, linhas, largura)])
      .build(),
  ]);
}

/** Devolve a N-ésima expressão da cláusula select (para montar os labels). */
function campoDaSelecao_(selecao, indice) {
  const campos = selecao.split(',').map(function (campo) { return campo.trim(); });
  return campos[indice] || null;
}

function dadosCentrosExecucao_() {
  if (CENTROS_EXEC_CACHE_) return CENTROS_EXEC_CACHE_;
  const sheet = aba_(ABAS.CENTROS);
  if (sheet.getLastRow() < 2) {
    CENTROS_EXEC_CACHE_ = [];
    return CENTROS_EXEC_CACHE_;
  }
  CENTROS_EXEC_CACHE_ = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  return CENTROS_EXEC_CACHE_;
}

function listaCentros_() {
  exigirExecucaoLeitura_();
  const vistos = {};
  return dadosCentrosExecucao_()
    .map(function (l) { return normalizarCentroCusto_(l[0]); })
    .filter(function (v) {
      if (!v || vistos[v]) return false;
      vistos[v] = true;
      return true;
    });
}

function listaCategorias_() {
  exigirExecucaoLeitura_();
  // V4.8: a lista padrão (com "Carro Novo") entra sempre; antes só apareciam as
  // categorias que algum veículo já usava, então uma categoria nova nunca surgia no
  // formulário de cadastro.
  const vistas = {};
  CATEGORIAS_VEICULO_PADRAO.forEach(function (c) { vistas[c] = true; });
  dadosVeiculosExecucao_().forEach(function (l) {
    const v = String(l[COL_VEIC.CATEGORIA - 1] || '').trim();
    if (v) vistas[v] = true;
  });
  return Object.keys(vistas).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
}

// ==========================================================================
// 10B_CentralOperacional.gs — contingência sem Web App
// ==========================================================================

const CENTRAL_CEL_ = {
  DATA: 'B8', PLACA: 'E8', TIPO: 'H8', LITROS: 'B10', VALOR: 'E10', KM: 'H10',
  FORNECEDOR: 'B12', DOCUMENTO: 'E12', FORCAR_KM: 'H12',
  TIPO_ABASTECIMENTO: 'H14',
  NATUREZA_OFICINA: 'B14', DETALHE_OFICINA: 'F14', OBSERVACAO: 'B16',
  SALVAR: 'B19', LIMPAR: 'E19', ATUALIZAR: 'B25', VALIDAR: 'E25', DEPRECIACAO: 'H25',
  NAV_DASH: 'B29', NAV_RESUMO: 'E29', NAV_PEND: 'H29', NAV_LANC: 'J29',
  MENSAGEM: 'A21:J22'
};

function dataSugeridaCentral_() {
  const periodo = periodoAtual_();
  const hoje = hojeNoFuso_();
  if (hoje >= periodo.inicio && hoje <= periodo.fim) return hoje;
  return new Date(periodo.fim.getFullYear(), periodo.fim.getMonth(), periodo.fim.getDate(), 12, 0, 0);
}

function centralStatus_(texto, erro) {
  const sheet = ss_().getSheetByName(ABAS.CENTRAL_OPERACIONAL);
  if (!sheet) return;
  const r = sheet.getRange(CENTRAL_CEL_.MENSAGEM);
  r.breakApart();
  r.merge();
  r.setValue(String(texto || ''))
    .setBackground(erro ? '#fde8e8' : '#FFF4EC')
    .setFontColor(erro ? '#9c1c1c' : '#1e7145')
    .setFontWeight('bold')
    .setVerticalAlignment('middle');
}

function montarCentralOperacional_() {
  const sheet = aba_(ABAS.CENTRAL_OPERACIONAL, true);
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
  sheet.clearConditionalFormatRules();
  sheet.getRange('A1:J1').merge().setValue('CENTRAL OPERACIONAL — MODO CONTINGÊNCIA')
    .setBackground(CORES.LARANJA).setFontColor(CORES.BRANCO).setFontWeight('bold')
    .setFontSize(16).setVerticalAlignment('middle');
  sheet.setRowHeight(1, 42);

  sheet.getRange('A2:J2').merge().setValue(
    'Funciona dentro da própria planilha e não depende da publicação do Web App. Preencha o formulário e marque SALVAR.')
    .setBackground('#FFF4EC').setFontColor('#5A3A26').setFontStyle('italic');

  sheet.getRange('A4:J4').merge().setValue('STATUS DO SISTEMA')
    .setBackground(CORES.LARANJA_CLARO).setFontColor(CORES.PRETO).setFontWeight('bold');
  sheet.getRange('A5').setValue('Competência').setFontWeight('bold');
  sheet.getRange('B5:C5').merge().setFormula(fx_('=PARAM_MES'));
  sheet.getRange('D5').setValue('Período').setFontWeight('bold');
  // Era TEXT(...,"dd/mm/yyyy"): fx_() conserta a vírgula, mas NÃO traduz o código
  // de formato — e em pt-BR o ano é "aaaa", não "yyyy". Resultado: ano errado, sem
  // erro nenhum na tela. dataBR_ monta a data com DAY/MONTH/YEAR, que não dependem
  // de idioma. Era a última ocorrência de TEXT() com código de data no projeto.
  sheet.getRange('E5:F5').merge()
    .setFormula(fx_('=' + dataBR_('PERIODO_INI') + '&" a "&' + dataBR_('PERIODO_FIM')));
  sheet.getRange('G5').setValue('Pendências').setFontWeight('bold');
  sheet.getRange('H5').setFormula(fx_('=IF(TODAY()<PERIODO_FIM,' +
    'COUNTIFS(' + ref_(ABAS.CONFERENCIA) + '!E3:E,"PENDENTE",' + ref_(ABAS.CONFERENCIA) + '!C3:C,"<>Depreciação*")+' +
    'COUNTIFS(' + ref_(ABAS.CONFERENCIA) + '!E3:E,"EM ANÁLISE",' + ref_(ABAS.CONFERENCIA) + '!C3:C,"<>Depreciação*"),' +
    'COUNTIF(' + ref_(ABAS.CONFERENCIA) + '!E3:E,"PENDENTE")+COUNTIF(' + ref_(ABAS.CONFERENCIA) + '!E3:E,"EM ANÁLISE"))'));
  sheet.getRange('I5').setValue('Veículos ativos').setFontWeight('bold');
  sheet.getRange('J5').setFormula(fx_('=COUNTIFS(' + ref_(ABAS.VEICULOS) + '!A2:A,"<>",' + ref_(ABAS.VEICULOS) + '!K2:K,"<>NAO")'));
  sheet.getRange('A5:J5').setBackground('#FAF9F8');

  sheet.getRange('A7:J7').merge().setValue('NOVO LANÇAMENTO')
    .setBackground(CORES.LARANJA).setFontColor(CORES.BRANCO).setFontWeight('bold');

  const labels = [['A8','Data'],['D8','Veículo / patrimônio'],['G8','Tipo de despesa'],
    ['A10','Litros'],['D10','Valor R$'],['G10','KM / Horímetro'],
    ['A12','Fornecedor'],['D12','NF / OS / Documento'],['G12','Forçar KM menor']];
  labels.forEach(function(x){ sheet.getRange(x[0]).setValue(x[1]).setFontWeight('bold'); });

  sheet.getRange(CENTRAL_CEL_.DATA).setValue(dataSugeridaCentral_()).setNumberFormat('dd/mm/yyyy');
  const placasCentral = listaPlacas_(true);
  if (placasCentral.length) {
    sheet.getRange(CENTRAL_CEL_.PLACA).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(placasCentral, true).setAllowInvalid(true)
        .setHelpText('Selecione uma placa/ID ou digite o Código Patrimônio. O sistema converterá para a placa oficial ao salvar.').build());
  } else {
    sheet.getRange(CENTRAL_CEL_.PLACA).clearDataValidations();
  }
  sheet.getRange(CENTRAL_CEL_.TIPO).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(TIPOS_DESPESA, true).setAllowInvalid(false).build());
  sheet.getRange(CENTRAL_CEL_.LITROS).setNumberFormat('#,##0.000');
  sheet.getRange(CENTRAL_CEL_.VALOR).setNumberFormat('R$ #,##0.00');
  sheet.getRange(CENTRAL_CEL_.KM).setNumberFormat('#,##0');
  sheet.getRange(CENTRAL_CEL_.FORCAR_KM).insertCheckboxes().setValue(false);

  sheet.getRange('A14').setValue('Natureza oficina').setFontWeight('bold');
  sheet.getRange('B14:D14').merge();
  sheet.getRange(CENTRAL_CEL_.NATUREZA_OFICINA).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(NATUREZAS_OFICINA, true).setAllowInvalid(false)
      .setHelpText('Obrigatório para despesas de Oficina.').build());
  sheet.getRange('E14').setValue('Peça / serviço').setFontWeight('bold');
  sheet.getRange('F14:G14').merge();
  sheet.getRange('H13').setValue('Abastecimento').setFontWeight('bold');
  sheet.getRange(CENTRAL_CEL_.TIPO_ABASTECIMENTO + ':J14').merge();
  sheet.getRange(CENTRAL_CEL_.TIPO_ABASTECIMENTO).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(TIPOS_ABASTECIMENTO, true)
      .setAllowInvalid(true)
      .setHelpText('Só para combustível. Interno = tanque próprio (o valor vem do custo ' +
        'médio da bomba, não precisa digitar). Externo = posto, com NF e valor.').build());

  // Fornecedor: lista viva do cadastro, nao texto livre — senao o relatorio por
  // fornecedor vira uma lista de grafias diferentes da mesma empresa.
  const abaFornecedores = ss_().getSheetByName(ABAS.FORNECEDORES);
  if (abaFornecedores) {
    sheet.getRange(CENTRAL_CEL_.FORNECEDOR).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(abaFornecedores.getRange('A2:A'), true)
        .setAllowInvalid(true)
        .setHelpText('Opcional: preencha quando houver terceiro. Cadastre em "' +
          ABAS.FORNECEDORES + '".').build());
  }
  sheet.getRange(CENTRAL_CEL_.KM).setNote(
    'Só em lançamento de combustível. Manutenção, multa e pedágio não movimentam odômetro.');
  sheet.getRange('A16').setValue('Observação').setFontWeight('bold');
  sheet.getRange('B16:J16').merge();
  ['B8','E8','H8','B10','E10','H10','B12','E12','H12','B14:D14','F14:G14','H14:J14','B16:J16']
    .forEach(function(a1){ sheet.getRange(a1).setBackground('#FFF9F4').setBorder(true,true,true,true,false,false); });

  sheet.getRange('A18:J18').merge().setValue('AÇÕES DO FORMULÁRIO')
    .setBackground('#F3F1F0').setFontWeight('bold');
  sheet.getRange('A19').setValue('SALVAR').setFontWeight('bold').setFontColor('#1e7145');
  sheet.getRange(CENTRAL_CEL_.SALVAR).insertCheckboxes().setValue(false).setNote(
    'Marque para salvar. Se sua conta não puder ser identificada pelo gatilho, use o menu 🚚 Sistema de Frota → Contingência → Salvar lançamento preenchido.');
  sheet.getRange('D19').setValue('LIMPAR').setFontWeight('bold');
  sheet.getRange(CENTRAL_CEL_.LIMPAR).insertCheckboxes().setValue(false);
  sheet.getRange('G19:J19').merge().setValue('Alternativa: 🚚 Sistema de Frota → Contingência → Salvar lançamento preenchido')
    .setFontSize(9).setFontColor('#666666');
  centralStatus_('Pronto para lançar. Oficina: natureza, peça/serviço e NF/OS ' +
    '(fornecedor é opcional). Combustível: KM e origem (Interno usa o custo da bomba).', false);

  sheet.getRange('A24:J24').merge().setValue('AÇÕES RÁPIDAS — ADMIN')
    .setBackground(CORES.PRETO).setFontColor(CORES.BRANCO).setFontWeight('bold');
  sheet.getRange('A25').setValue('Atualizar relatórios'); sheet.getRange(CENTRAL_CEL_.ATUALIZAR).insertCheckboxes().setValue(false);
  sheet.getRange('D25').setValue('Validar dados'); sheet.getRange(CENTRAL_CEL_.VALIDAR).insertCheckboxes().setValue(false);
  sheet.getRange('G25').setValue('Depreciação mensal'); sheet.getRange(CENTRAL_CEL_.DEPRECIACAO).insertCheckboxes().setValue(false);
  sheet.getRange('I25:J25').merge().setValue('Fechamento/backup/reparo: use o menu Contingência (exige confirmação).')
    .setFontSize(9).setFontColor('#666666');

  sheet.getRange('A28:J28').merge().setValue('NAVEGAÇÃO')
    .setBackground(CORES.LARANJA_CLARO).setFontColor(CORES.PRETO).setFontWeight('bold');
  sheet.getRange('A29').setValue('Dashboard'); sheet.getRange(CENTRAL_CEL_.NAV_DASH).insertCheckboxes().setValue(false);
  sheet.getRange('D29').setValue('Resumo'); sheet.getRange(CENTRAL_CEL_.NAV_RESUMO).insertCheckboxes().setValue(false);
  sheet.getRange('G29').setValue('Pendências'); sheet.getRange(CENTRAL_CEL_.NAV_PEND).insertCheckboxes().setValue(false);
  sheet.getRange('I29').setValue('Lançamentos'); sheet.getRange(CENTRAL_CEL_.NAV_LANC).insertCheckboxes().setValue(false);

  sheet.getRange('A32:J34').merge().setValue(
    'CONTINGÊNCIA: se o Web App ficar indisponível, use esta aba e o menu 🚚 Sistema de Frota. ' +
    'Lançamentos, relatórios, validação, depreciação, fechamento, diagnóstico, backup e reparo continuam disponíveis pela planilha. ' +
    'O Web App é uma interface adicional; a base operacional continua sendo esta planilha.')
    .setWrap(true).setBackground('#F3F1F0').setFontColor('#555555').setVerticalAlignment('middle');

  [130,110,30,130,150,30,145,190,130,100].forEach(function(w,i){ sheet.setColumnWidth(i+1,w); });
  [8,10,12,14,16,19,25,29].forEach(function(r){ sheet.setRowHeight(r,30); });
  sheet.setFrozenRows(7);
  sheet.setHiddenGridlines(true);
  return sheet;
}

function limparFormularioCentralOperacional_() {
  const sheet = aba_(ABAS.CENTRAL_OPERACIONAL);
  [CENTRAL_CEL_.PLACA, CENTRAL_CEL_.TIPO, CENTRAL_CEL_.LITROS, CENTRAL_CEL_.VALOR,
    CENTRAL_CEL_.KM, CENTRAL_CEL_.FORNECEDOR, CENTRAL_CEL_.TIPO_ABASTECIMENTO,
    CENTRAL_CEL_.DOCUMENTO, CENTRAL_CEL_.NATUREZA_OFICINA,
    CENTRAL_CEL_.DETALHE_OFICINA, CENTRAL_CEL_.OBSERVACAO]
    .forEach(function(a1){ sheet.getRange(a1).clearContent(); });
  sheet.getRange(CENTRAL_CEL_.FORCAR_KM).setValue(false);
  sheet.getRange(CENTRAL_CEL_.DATA).setValue(dataSugeridaCentral_()).setNumberFormat('dd/mm/yyyy');
}

function dadosLancamentoCentral_() {
  const sheet = aba_(ABAS.CENTRAL_OPERACIONAL);
  const data = sheet.getRange(CENTRAL_CEL_.DATA).getValue();
  const dataIso = data instanceof Date && !isNaN(data.getTime())
    ? Utilities.formatDate(data, timezone_(), 'yyyy-MM-dd')
    : String(data || '');
  return {
    data: dataIso,
    placa: sheet.getRange(CENTRAL_CEL_.PLACA).getDisplayValue(),
    tipo: sheet.getRange(CENTRAL_CEL_.TIPO).getDisplayValue(),
    litros: sheet.getRange(CENTRAL_CEL_.LITROS).getValue(),
    valor: sheet.getRange(CENTRAL_CEL_.VALOR).getValue(),
    km: sheet.getRange(CENTRAL_CEL_.KM).getValue(),
    fornecedor: sheet.getRange(CENTRAL_CEL_.FORNECEDOR).getDisplayValue(),
    tipoAbastecimento: sheet.getRange(CENTRAL_CEL_.TIPO_ABASTECIMENTO).getDisplayValue(),
    documento: sheet.getRange(CENTRAL_CEL_.DOCUMENTO).getDisplayValue(),
    naturezaOficina: sheet.getRange(CENTRAL_CEL_.NATUREZA_OFICINA).getDisplayValue(),
    detalheOficina: sheet.getRange(CENTRAL_CEL_.DETALHE_OFICINA).getDisplayValue(),
    observacao: sheet.getRange(CENTRAL_CEL_.OBSERVACAO).getDisplayValue(),
    forcarKm: sheet.getRange(CENTRAL_CEL_.FORCAR_KM).getValue() === true
  };
}

/** Callback do menu; não depende de Web App nem de onEdit. */
function salvarLancamentoCentralOperacional() {
  exigirExecucaoOperacional_();
  const dados = dadosLancamentoCentral_();
  let r = salvarLancamento_(dados);
  if (r && !r.ok && r.duplicidade) {
    const ui = SpreadsheetApp.getUi();
    const confirma = ui.alert('Possível duplicidade', r.mensagem + '\n\nSe você conferiu e é realmente outro lançamento legítimo, deseja gravar mesmo assim?', ui.ButtonSet.YES_NO);
    if (confirma === ui.Button.YES) {
      dados.permitirDuplicado = true;
      r = salvarLancamento_(dados);
    }
  }
  if (r && r.ok) {
    limparFormularioCentralOperacional_();
    centralStatus_(r.mensagem || 'Lançamento salvo com sucesso.', false);
  } else {
    centralStatus_((r && r.mensagem) || 'Não foi possível salvar o lançamento.', true);
  }
  return r;
}

function executarAcaoCentral_(e) {
  const sheet = e.range.getSheet();
  const a1 = e.range.getA1Notation();
  const marcado = e.value === 'TRUE' || e.range.getValue() === true;
  if (!marcado) return;

  try {
    if (a1 === CENTRAL_CEL_.SALVAR) {
      autorizarContextoPlanilha_(e, ['OPERADOR','ADMIN']);
      const r = salvarLancamento_(dadosLancamentoCentral_());
      if (r && r.ok) {
        limparFormularioCentralOperacional_();
        centralStatus_(r.mensagem || 'Lançamento salvo com sucesso.', false);
      } else {
        const msgBase = (r && r.mensagem) || 'Não foi possível salvar.';
        const msgExtra = r && r.duplicidade ? ' Use o menu Contingência → Salvar lançamento preenchido para confirmar uma duplicidade legítima.' : '';
        centralStatus_(msgBase + msgExtra, true);
      }
    } else if (a1 === CENTRAL_CEL_.LIMPAR) {
      limparFormularioCentralOperacional_();
      centralStatus_('Formulário limpo.', false);
    } else if (a1 === CENTRAL_CEL_.ATUALIZAR) {
      autorizarContextoPlanilha_(e, 'ADMIN');
      atualizarRelatorios();
      centralStatus_('Relatórios atualizados.', false);
    } else if (a1 === CENTRAL_CEL_.VALIDAR) {
      autorizarContextoPlanilha_(e, 'ADMIN');
      const problemas = coletarProblemas_();
      escreverConferencia_(problemas);
      invalidarCacheInicio_();
      registrarLog_('Validar dados (Central Operacional)', problemas.length + ' ponto(s)');
      centralStatus_(problemas.length ? problemas.length + ' pendência(s) para conferir.' : 'Nenhuma pendência encontrada.', problemas.length > 0);
    } else if (a1 === CENTRAL_CEL_.DEPRECIACAO) {
      autorizarContextoPlanilha_(e, 'ADMIN');
      const r = gerarDepreciacaoMensal_();
      escreverConferencia_(coletarProblemas_());
      centralStatus_(r.mensagem, false);
    } else if (a1 === CENTRAL_CEL_.NAV_DASH) {
      ss_().setActiveSheet(aba_(ABAS.DASHBOARD));
    } else if (a1 === CENTRAL_CEL_.NAV_RESUMO) {
      ss_().setActiveSheet(aba_(ABAS.RESUMO));
    } else if (a1 === CENTRAL_CEL_.NAV_PEND) {
      ss_().setActiveSheet(aba_(ABAS.CONFERENCIA));
    } else if (a1 === CENTRAL_CEL_.NAV_LANC) {
      ss_().setActiveSheet(aba_(ABAS.LANCAMENTOS));
    }
  } catch (erro) {
    centralStatus_('Ação não executada: ' + erro.message, true);
  } finally {
    CONTEXTO_PLANILHA_AUTORIZADO_ = null;
    try { sheet.getRange(a1).setValue(false); } catch (erro) {}
  }
}

function diagnosticarSistemaPlanilha() {
  exigirExecucaoMutacao_();
  const d = diagnosticoSaudeSistema_();
  const linhas = d.checks.map(function(c){ return c.status + ' — ' + c.nome + ': ' + c.detalhe; });
  SpreadsheetApp.getUi().alert('Saúde do sistema — V' + VERSAO_SISTEMA,
    'Estado: ' + d.estado + '\nADMINs ativos: ' + d.adminCount + '\nPendências: ' + d.pendencias + '\n\n' + linhas.join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}


function auditoriaProfundaPlanilha() {
  exigirExecucaoMutacao_();
  toast_('Executando auditoria profunda…', 'Auditoria');
  const d = diagnosticoAuditoriaProfunda_();
  const linhas = d.checks.map(function(c){ return c.status + ' — ' + c.nome + ': ' + c.detalhe; });
  const extras = [];
  if (d.gruposFormula && d.gruposFormula.length) {
    extras.push('\nPrincipais grupos de fórmula:');
    d.gruposFormula.slice(0, 8).forEach(function(g){
      extras.push('• ' + g.aba + '!' + g.coluna + ' — ' + g.erro + ' — ' + g.quantidade + ' célula(s)');
    });
  }
  if (d.protecaoFalhas && d.protecaoFalhas.length) {
    extras.push('\nFalhas de proteção:');
    d.protecaoFalhas.slice(0, 8).forEach(function(f){ extras.push('• ' + f); });
  }
  SpreadsheetApp.getUi().alert('Auditoria profunda — V' + VERSAO_SISTEMA,
    'Estado: ' + d.estado + '\nTempo: ' + d.tempoMs + ' ms\n\n' + linhas.join('\n') + extras.join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function criarBackupSistemaComAviso() {
  exigirExecucaoMutacao_();
  const b = criarBackupSistema_('manual pela planilha / contingência');
  SpreadsheetApp.getUi().alert('Backup criado', b.nome + '\n\nA cópia foi salva na pasta de backups do sistema.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function repararSistemaComAviso() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();
  const confirma = ui.alert('Reparar sistema',
    'O sistema criará um backup e reconstruirá fórmulas, relatórios, validações, proteções e a Central Operacional. Dados operacionais não serão apagados. Continuar?',
    ui.ButtonSet.YES_NO);
  if (confirma !== ui.Button.YES) return;
  const r = repararSistemaSeguro_();
  ui.alert(r.ok ? 'Reparo concluído' : 'Reparo não concluído', r.mensagem, ui.ButtonSet.OK);
}

/**
 * Gatilho simples: trocar o relatório ou um filtro já redesenha a aba.
 * É o que dá a sensação de sistema em vez de planilha.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    const nomeAba = sheet.getName();
    if ([ABAS.PARAMETROS, ABAS.VEICULOS, ABAS.CENTROS, ABAS.LANCAMENTOS, ABAS.ODOMETRO, ABAS.USUARIOS,
         ABAS.RATEIO_MENSAL, ABAS.ORCAMENTO, ABAS.COMPROVANTES].indexOf(nomeAba) !== -1) {
      invalidarCacheInicio_();
      invalidarCacheSaude_();
    }
    // V4.8: edição manual nas bases deixa o Resumo (agora calculado por script)
    // desatualizado. O gatilho instalável recalcula em segundo plano; se ele não
    // existir, o próximo acesso ao Resumo/Web App recalcula.
    if ([ABAS.VEICULOS, ABAS.LANCAMENTOS, ABAS.ODOMETRO, ABAS.PARAMETROS].indexOf(nomeAba) !== -1) {
      marcarResumoDesatualizado_();
    }
    // V4.8: a coluna Período (J) é UMA fórmula matricial em J1. Qualquer valor digitado
    // ou colado abaixo dela faz a coluna inteira virar #REF! — e todos os relatórios
    // por competência ficam vazios. Foi exatamente o que aconteceu com uma colagem de
    // linhas no layout antigo. Aqui o valor colado é removido na hora.
    if (nomeAba === ABAS.LANCAMENTOS && e.range.getRow() >= 2) {
      const cIni = e.range.getColumn();
      const cFim = cIni + e.range.getNumColumns() - 1;
      if (cIni <= COL_LANC.PERIODO && cFim >= COL_LANC.PERIODO) {
        const faixaPeriodo = sheet.getRange(e.range.getRow(), COL_LANC.PERIODO, e.range.getNumRows(), 1);
        // Células "espalhadas" pela fórmula de J1 também não têm fórmula própria, então o
        // sinal confiável de valor digitado é a própria J1 virar erro.
        SpreadsheetApp.flush();
        const cabecalhoJ = String(sheet.getRange(1, COL_LANC.PERIODO).getDisplayValue() || '');
        if (cabecalhoJ.indexOf('#') === 0) {
          faixaPeriodo.clearContent();
          try {
            ss_().toast('A coluna J (Período) é calculada. O que foi colado nela foi removido — ' +
              'confira se as colunas coladas estão alinhadas com o cabeçalho.', 'Lançamentos', 10);
          } catch (err) {}
        }
      }
    }
    // Se alguém lançar diretamente na base (situação de contingência extrema),
    // aceita placa OU patrimônio e normaliza para a placa oficial antes de gerar ID/snapshot.
    if (nomeAba === ABAS.LANCAMENTOS && e.range.getRow() >= 2) {
      const primeiraLinha = e.range.getRow();
      const qtdLinhas = e.range.getNumRows();
      const faixaPlacasManual = sheet.getRange(primeiraLinha, COL_LANC.PLACA, qtdLinhas, 1);
      const placasEditadas = faixaPlacasManual.getDisplayValues();
      let normalizouPlaca = false;
      for (let i = 0; i < placasEditadas.length; i++) {
        const bruto = String(placasEditadas[i][0] || '').trim();
        if (!bruto) continue;
        const rv = resolverVeiculo_(bruto, false);
        if (rv.ok && normalizaPlaca_(bruto) !== normalizaPlaca_(rv.veiculo.placa)) {
          placasEditadas[i][0] = rv.veiculo.placa; normalizouPlaca = true;
        }
      }
      if (normalizouPlaca) faixaPlacasManual.setValues(placasEditadas);
      const faixaIds = sheet.getRange(primeiraLinha, COL_LANC.ID, qtdLinhas, 1);
      const idsEditados = faixaIds.getDisplayValues();
      let criarIds = false;
      for (let i = 0; i < qtdLinhas; i++) {
        if (String(placasEditadas[i][0] || '').trim() && !String(idsEditados[i][0] || '').trim()) {
          idsEditados[i][0] = novoIdLancamento_();
          criarIds = true;
        }
      }
      if (criarIds) faixaIds.setValues(idsEditados).setNumberFormat('@');
      // Manual contingency input also receives immutable classification snapshots.
      const faixaClass = sheet.getRange(primeiraLinha, COL_LANC.CENTRO, qtdLinhas, 2);
      const classAtual = faixaClass.getDisplayValues();
      let mudouClass = false;
      for (let i = 0; i < qtdLinhas; i++) {
        if (!String(placasEditadas[i][0] || '').trim()) continue;
        if (!String(classAtual[i][0] || '').trim() || !String(classAtual[i][1] || '').trim()) {
          const c = classificacaoVeiculoAtual_(placasEditadas[i][0]);
          if (!String(classAtual[i][0] || '').trim()) classAtual[i][0] = c.centro;
          if (!String(classAtual[i][1] || '').trim()) classAtual[i][1] = c.categoria;
          mudouClass = true;
        }
      }
      if (mudouClass) faixaClass.setValues(classAtual);
    }
    if (nomeAba === ABAS.ODOMETRO && e.range.getRow() >= 2) {
      const primeira=e.range.getRow(), qtd=e.range.getNumRows();
      const faixa=sheet.getRange(primeira,2,qtd,1);
      const vals=faixa.getDisplayValues(); let mudou=false;
      vals.forEach(function(l){const bruto=String(l[0]||'').trim();if(!bruto)return;const rv=resolverVeiculo_(bruto,false);if(rv.ok&&normalizaPlaca_(bruto)!==normalizaPlaca_(rv.veiculo.placa)){l[0]=rv.veiculo.placa;mudou=true;}});
      if(mudou){faixa.setValues(vals);invalidarCacheOdometro_();}
    }
    // Alteração direta por ADMIN na aba Usuários revoga as sessões das linhas afetadas.
    if (nomeAba === ABAS.PARAMETROS && e.range.getColumn() === 2 && e.range.getNumRows() === 1) {
      const r = e.range.getRow();
      function restaurarParametro_(padrao, mensagem) {
        e.range.setValue(e.oldValue !== undefined ? e.oldValue : padrao);
        try { ss_().toast(mensagem, 'Proteção de parâmetros', 8); } catch(err) {}
      }
      // V4.8: o corte é configurável (DIA_FIM_PERIODO). Antes o onEdit regravava 26/25
      // em qualquer edição, desfazendo em silêncio o que o ADMIN configurou.
      if (r === LINHA_PARAM_INICIAL + 4) {
        const corte = Math.floor(Number(String(e.range.getDisplayValue() || '').replace(',', '.')));
        if (!isFinite(corte) || corte < 1 || corte > 31) {
          restaurarParametro_(DIA_CORTE_PADRAO_, 'DIA_FIM_PERIODO precisa ser de 1 a 31.');
        } else {
          sheet.getRange(LINHA_PARAM_INICIAL + 3, 2).setValue(corte >= DIA_CORTE_MES_CIVIL_ ? 1 : corte + 1);
          // Mudar o dia de corte = voltar à regra do corte (sai das datas livres).
          limparPeriodoLivre_();
          PARAM_EXEC_CACHE_ = null;
          aplicarPeriodoNaPlanilha_();
          marcarResumoDesatualizado_();
          try { ss_().toast('Período agora segue o dia de corte ' + corte + '. Relatórios serão recalculados.', 'Parâmetros', 8); } catch (err) {}
        }
      }
      // V4.8: digitar a data direto em "Início do período" / "Fim do período" define o
      // período com datas livres (a competência passa a ser o mês da data final).
      const linhaPerIni = Number(PropertiesService.getDocumentProperties().getProperty('LINHA_PERIODO_INI'));
      if (linhaPerIni && (r === linhaPerIni || r === linhaPerIni + 1)) {
        function dataDaCelula(celula) {
          const v = celula.getValue();
          if (v instanceof Date && !isNaN(v.getTime())) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
          const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(celula.getDisplayValue() || '').trim());
          if (!m) return null;
          const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
          return d.getDate() === Number(m[1]) ? d : null;
        }
        const ini = dataDaCelula(sheet.getRange(linhaPerIni, 2));
        const fim = dataDaCelula(sheet.getRange(linhaPerIni + 1, 2));
        const dias = ini && fim ? Math.round((fim - ini) / 86400000) + 1 : 0;
        if (!ini || !fim || dias < 1 || dias > 92) {
          PARAM_EXEC_CACHE_ = null;
          aplicarPeriodoNaPlanilha_();
          try {
            ss_().toast(!ini || !fim ? 'Data inválida. Use dd/mm/aaaa.'
              : (dias < 1 ? 'A data inicial precisa ser anterior à final.' : 'O período pode ter no máximo 92 dias.'),
              'Período não alterado', 8);
          } catch (err) {}
        } else {
          const mesNovo = Utilities.formatDate(fim, timezone_(), 'yyyy-MM');
          gravarPeriodoLivre_(mesNovo, ini, fim);
          sheet.getRange(LINHA_PARAM_INICIAL, 2).setNumberFormat('@').setValue(mesNovo);
          PARAM_EXEC_CACHE_ = null;
          aplicarPeriodoNaPlanilha_();
          marcarResumoDesatualizado_();
          invalidarCacheInicio_();
          try {
            ss_().toast('Período aberto: ' + formatarData_(ini) + ' a ' + formatarData_(fim) + ' (competência ' + mesNovo +
              '). Os relatórios serão recalculados.', 'Período alterado', 8);
          } catch (err) {}
        }
      }
      if (r === LINHA_PARAM_INICIAL + 3) {
        const corteAtual = Math.floor(Number(sheet.getRange(LINHA_PARAM_INICIAL + 4, 2).getValue())) || DIA_CORTE_PADRAO_;
        e.range.setValue(corteAtual >= DIA_CORTE_MES_CIVIL_ ? 1 : corteAtual + 1);
      }
      if (r === LINHA_PARAM_INICIAL) {
        // V4.8: o ADMIN pode trocar o período aberto direto na célula (a aba Parâmetros
        // só é editável por ADMIN). Valor inválido volta ao anterior.
        let novoMes = '';
        try { novoMes = normalizarMesReferencia_(e.range.getValue()); } catch (err) { novoMes = ''; }
        if (!novoMes) {
          restaurarParametro_(mesReferenciaSugeridoHoje_(), 'Período inválido. Use AAAA-MM, por exemplo 2026-09.');
        } else {
          e.range.setNumberFormat('@').setValue(novoMes);
          PARAM_EXEC_CACHE_ = null;
          aplicarPeriodoNaPlanilha_();
          marcarResumoDesatualizado_();
          try { ss_().toast('Período aberto alterado para ' + novoMes + '. Os relatórios serão recalculados.', 'Parâmetros', 8); } catch (err) {}
        }
      }
      if (r === LINHA_PARAM_INICIAL + 1 && !String(e.range.getDisplayValue() || '').trim()) {
        restaurarParametro_('GIASSI & CIA. LTDA.', 'O nome da empresa não pode ficar vazio.');
      }
      if (r === LINHA_PARAM_INICIAL + 2) {
        const n = Number(String(e.range.getDisplayValue() || '').replace(',', '.'));
        if (!isFinite(n) || n < 0 || n > 1000000) restaurarParametro_(12.65, 'CUSTO_HORA_MOTORISTA inválido; alteração revertida.');
      }
      if (r === LINHA_PARAM_INICIAL + 5 && !String(e.range.getDisplayValue() || '').trim()) {
        restaurarParametro_('DEPÓSITO,EMPILHADEIRAS', 'BASE_RATEIO não pode ficar vazia.');
      }
      if (r === LINHA_PARAM_INICIAL + 6) {
        const normalizado = normalizarDominiosLogin_(e.range.getDisplayValue());
        if (!normalizado.dominios.length || normalizado.invalidos.length) restaurarParametro_('giassi.com.br', 'DOMINIOS_LOGIN inválido; alteração revertida para preservar o acesso.');
        else e.range.setValue(normalizado.valor);
      }
      PARAM_EXEC_CACHE_ = null;
    }
    if (nomeAba === ABAS.USUARIOS && e.range.getRow() >= 2) {
      const primeira = e.range.getRow();
      const qtd = e.range.getNumRows();
      const emails = sheet.getRange(primeira, 1, qtd, 1).getDisplayValues();
      emails.forEach(function(l){ const email=String(l[0]||'').trim().toLowerCase(); if(email) incrementarVersaoSessaoUsuario_(email); });
      // Se o próprio e-mail foi substituído numa edição simples, revoga também a identidade antiga.
      if (e.range.getColumn() === 1 && e.range.getNumRows() === 1 && e.oldValue) {
        const antigo = String(e.oldValue || '').trim().toLowerCase();
        if (antigo) incrementarVersaoSessaoUsuario_(antigo);
      }
      // Proteção adicional para edição direta: uma alteração simples de Perfil/Ativo
      // não pode reduzir o sistema para menos de 2 ADMINs ativos.
      if (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 &&
          [3,6].indexOf(e.range.getColumn()) !== -1 && listarAdminsAtivos_().length < 2 &&
          e.oldValue !== undefined) {
        e.range.setValue(e.oldValue);
        try { ss_().toast('Alteração revertida: o sistema exige pelo menos 2 ADMINs ativos.', 'Proteção de continuidade', 8); } catch(err) {}
      }
      invalidarCacheSaude_();
    }
    if (nomeAba === ABAS.CENTRAL_OPERACIONAL) {
      if (e.range.getA1Notation() === CENTRAL_CEL_.PLACA && String(e.range.getDisplayValue() || '').trim()) {
        const rv=resolverVeiculo_(e.range.getDisplayValue(),true);
        if(rv.ok){e.range.setValue(rv.veiculo.placa);centralStatus_('Veículo identificado: '+rv.veiculo.placa+(rv.veiculo.patrimonio?' • patrimônio '+rv.veiculo.patrimonio:''),false);return;}
        centralStatus_(rv.mensagem,true); return;
      }
      if (e.range.getA1Notation() === CENTRAL_CEL_.TIPO) {
        const tipoCentral=String(e.range.getDisplayValue()||'');
        if (TIPOS_OFICINA.indexOf(tipoCentral)!==-1) centralStatus_('Despesa de oficina: informe Natureza, Peça/serviço realizado e NF/OS/documento.',false);
        else {
          try { sheet.getRange(CENTRAL_CEL_.NATUREZA_OFICINA).clearContent(); sheet.getRange(CENTRAL_CEL_.DETALHE_OFICINA).clearContent(); } catch(err) {}
        }
      }
      executarAcaoCentral_(e);
      return;
    }
    if (nomeAba !== ABAS.RELATORIOS) return;
    const celula = e.range.getA1Notation();
    if ([CEL_TIPO, CEL_CENTRO, CEL_CATEGORIA, CEL_VEICULO].indexOf(celula) === -1) return;
    aplicarRelatorio_();
  } catch (erro) {
    // um gatilho simples não pode quebrar a edição do usuário
    console.error('onEdit: ' + erro.message);
  }
}

function irParaRelatorios() {
  const planilha = ss_();
  planilha.setActiveSheet(aba_(ABAS.RELATORIOS, true));
}

/** Abre a central de relatórios já num relatório específico. */
function abrirRelatorio_(tipo) {
  exigirExecucaoLeitura_();
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Relatório interativo disponível somente pela planilha vinculada.');
  const sheet = aba_(ABAS.RELATORIOS, true);
  if (tipo && CATALOGO_RELATORIOS[tipo]) {
    sheet.getRange(CEL_TIPO).setValue(tipo);
    aplicarRelatorio_();
  }
  ss_().setActiveSheet(sheet);
  return true;
}

// ==========================================================================
// 11_Central.gs
// ==========================================================================

/**
 * Central de Controle: a janela que abre no menu e concentra indicadores,
 * atalhos e o estado do sistema. E o "menu interativo" do sistema.
 */

function abrirCentral() {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Esta ação só funciona com a planilha aberta: use o menu 🚚 Sistema de Frota dentro da planilha (o botão Executar do editor não abre telas).');
  const html = HtmlService.createTemplateFromFile('Central')
    .evaluate()
    .setWidth(920)
    .setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Central de Controle');
}

/** Tudo que a Central mostra ao abrir. */
function dadosCentral() {
  exigirExecucaoLeitura_();
  garantirResumoAtualizado_();
  const periodo = periodoAtual_();
  const resumo = ss_().getSheetByName(ABAS.RESUMO);
  const indicadores = { total: 0, custoKm: 0, km: 0, litros: 0, veiculos: 0, variacao: null };

  if (resumo && resumo.getLastRow() >= 3) {
    const totais = resumo.getRange(3, 1, 1, TOTAL_COL_RESUMO).getValues()[0];
    indicadores.total = Number(totais[R_.TOTAL]) || 0;
    indicadores.custoKm = Number(totais[R_.RS_KM]) || 0;
    indicadores.km = Number(totais[R_.KM]) || 0;
    indicadores.litros = Number(totais[R_.LITROS]) || 0;
  }
  indicadores.veiculos = listaPlacas_(true).length;

  const historico = aba_(ABAS.HISTORICO);
  if (historico.getLastRow() >= 2 && indicadores.total > 0) {
    const ultimo = Number(historico.getRange(historico.getLastRow(), 2).getValue()) || 0;
    if (ultimo > 0) indicadores.variacao = indicadores.total / ultimo - 1;
  }

  const conferencia = ss_().getSheetByName(ABAS.CONFERENCIA);
  const pendencias = contarPendenciasConferencia_();

  return {
    empresa: String(param_('EMPRESA')),
    mes: normalizarMesReferencia_(param_('MES_REFERENCIA')),
    mesExtenso: nomeDoMes_(param_('MES_REFERENCIA')),
    periodo: formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim),
    indicadores: indicadores,
    lancamentos: quantidadeLancamentosReais_(),
    lancamentosPeriodo: contarLancamentosNoPeriodo_(periodo),
    pendencias: pendencias,
    relatorios: TIPOS_RELATORIO_PLANILHA.map(function (tipo) {
      return { nome: tipo, descricao: CATALOGO_RELATORIOS[tipo].descricao };
    }),
    ultimos: ultimosLancamentos_(6),
    usuario: Session.getActiveUser().getEmail() || '',
  };
}

// ----------------------------------------------------------------- ações

/** Gateways públicos usados somente pela Central HTML vinculada à planilha. */
function acaoAtualizar() {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Esta ação só funciona com a planilha aberta: use o menu 🚚 Sistema de Frota dentro da planilha (o botão Executar do editor não abre telas).');
  return acaoAtualizar_();
}

function acaoValidar() {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Esta ação só funciona com a planilha aberta: use o menu 🚚 Sistema de Frota dentro da planilha (o botão Executar do editor não abre telas).');
  return acaoValidar_();
}

function acaoAtualizar_() {
  exigirExecucaoMutacao_();
  reconstruirRelatorios_();
  registrarLog_('Atualizar relatórios', 'reconstrução completa');
  return 'Relatórios reconstruídos.';
}

function acaoValidar_() {
  exigirExecucaoMutacao_();
  const problemas = coletarProblemas_();
  escreverConferencia_(problemas);
  registrarLog_('Validar dados', problemas.length + ' ponto(s)');
  ss_().setActiveSheet(aba_(ABAS.CONFERENCIA));
  return problemas.length
    ? problemas.length + ' ponto(s) para conferir — veja a aba de conferência.'
    : 'Nenhum problema encontrado.';
}

function acaoAbrirRelatorio(tipo) {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Esta ação só funciona com a planilha aberta: use o menu 🚚 Sistema de Frota dentro da planilha (o botão Executar do editor não abre telas).');
  abrirRelatorio_(tipo);
  return 'Relatório aberto: ' + tipo;
}

function acaoIrPara(nomeAba) {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Esta ação só funciona com a planilha aberta: use o menu 🚚 Sistema de Frota dentro da planilha (o botão Executar do editor não abre telas).');
  const sheet = ss_().getSheetByName(nomeAba);
  if (!sheet) return 'Aba não encontrada: ' + nomeAba;
  ss_().setActiveSheet(sheet);
  return 'Abrindo ' + nomeAba;
}

function acaoExportarPdf(nomeAba) {
  exigirExecucaoMutacao_();
  const arquivo = exportarAbaComoPdf_(nomeAba || ABAS.RESUMO);
  registrarLog_('Exportar PDF', nomeAba + ' → ' + arquivo.getName());
  return { mensagem: 'PDF gerado: ' + arquivo.getName(), url: arquivo.getUrl() };
}

function acaoEnviarEmail(destinatarios, nomeAba) {
  exigirExecucaoMutacao_();
  const retorno = enviarRelatorioPorEmail_(destinatarios, nomeAba || ABAS.RESUMO);
  registrarLog_('Enviar por e-mail', destinatarios);
  return retorno;
}

// ==========================================================================
// 12_Exportacao.gs
// ==========================================================================

/**
 * Exportacao em PDF e envio por e-mail.
 * Usa a URL de export da propria planilha, autenticada com o token do script.
 */


// ========================================================================
// 12B_ExportacaoPeriodo.gs — fotografia independente da competência
// ========================================================================

const PASTA_EXPORTACOES_PERIODO_ = 'Exportações de Períodos - Frota';
const PREFIXO_EXPORTACAO_PERIODO_ = 'Frota_Periodo_';

function pastaExportacoesPeriodo_() {
  exigirExecucaoMutacao_();
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PASTA_EXPORTACOES_PERIODO_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch(e) {} }
  const arquivo = DriveApp.getFileById(ss_().getId());
  let pai = null;
  try { const pais = arquivo.getParents(); if (pais.hasNext()) pai = pais.next(); } catch(e) {}
  let pasta = null;
  try {
    const existentes = pai ? pai.getFoldersByName(PASTA_EXPORTACOES_PERIODO_) : DriveApp.getFoldersByName(PASTA_EXPORTACOES_PERIODO_);
    if (existentes.hasNext()) pasta = existentes.next();
  } catch(e) {}
  if (!pasta) pasta = pai ? pai.createFolder(PASTA_EXPORTACOES_PERIODO_) : DriveApp.createFolder(PASTA_EXPORTACOES_PERIODO_);
  props.setProperty('PASTA_EXPORTACOES_PERIODO_ID', pasta.getId());
  return pasta;
}

function valoresAbaSnapshot_(sheet) {
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return [['Sem dados.']];
  return sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn()).getValues();
}

function prepararAbaExportacao_(sheet, valores, cabecalhoLinha) {
  valores = valores && valores.length ? valores : [['Sem dados.']];
  const colunas = Math.max.apply(null, valores.map(function(l){return Math.max(1,l.length);}).concat([1]));
  const norm = valores.map(function(l){ const x=l.slice(); while(x.length<colunas)x.push(''); return x; });
  if (sheet.getMaxRows() < norm.length) sheet.insertRowsAfter(sheet.getMaxRows(), norm.length-sheet.getMaxRows());
  if (sheet.getMaxColumns() < colunas) sheet.insertColumnsAfter(sheet.getMaxColumns(), colunas-sheet.getMaxColumns());
  sheet.clear();
  sheet.getRange(1,1,norm.length,colunas).setValues(norm);
  sheet.setHiddenGridlines(true);
  if (cabecalhoLinha && norm.length >= cabecalhoLinha) {
    sheet.getRange(cabecalhoLinha,1,1,colunas).setBackground(CORES.LARANJA).setFontColor(CORES.PRETO).setFontWeight('bold').setWrap(true);
    sheet.setFrozenRows(cabecalhoLinha);
  }
  try { sheet.getDataRange().setVerticalAlignment('middle'); } catch(e) {}
  try { sheet.autoResizeColumns(1, Math.min(colunas, 20)); } catch(e) {}
  for (let c=1;c<=Math.min(colunas,20);c++) {
    try { if (sheet.getColumnWidth(c) > 360) sheet.setColumnWidth(c,360); } catch(e) {}
  }
}

function linhasLancamentosPeriodo_(periodo) {
  const sheet = aba_(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (!n) return [];
  return sheet.getRange(2,1,n,TOTAL_COL_LANC).getValues().filter(function(l) {
    const d=l[COL_LANC.DATA-1];
    return d instanceof Date && !isNaN(d.getTime()) && d>=periodo.inicio && d<=periodo.fim;
  });
}

function linhasOdometroPeriodo_(periodo) {
  return lerOdometro_().filter(function(l) {
    const d=l[0]; return d instanceof Date && !isNaN(d.getTime()) && d>=periodo.inicio && d<=periodo.fim;
  });
}

function historicoAtePeriodo_(mesRef) {
  const sheet=aba_(ABAS.HISTORICO);
  if(sheet.getLastRow()<2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues().filter(function(l){
    const m=String(l[0]||'').trim(); return m && m<=mesRef;
  });
}

function resumoExportacaoPeriodo_(mesRef) {
  const atual=normalizarMesReferencia_(param_('MES_REFERENCIA'));
  if (mesRef===atual) return { valores:valoresAbaSnapshot_(aba_(ABAS.RESUMO)), origem:'Resumo calculado da competência aberta' };
  const fechado=ss_().getSheetByName('Fechado '+mesRef);
  if (fechado) return { valores:valoresAbaSnapshot_(fechado), origem:'Fotografia congelada Fechado '+mesRef };
  return { valores:[['Resumo indisponível'],['Não existe aba "Fechado '+mesRef+'". Os lançamentos brutos do período permanecem incluídos nesta exportação.']], origem:'Sem fotografia de Resumo' };
}

function rateioExportacaoPeriodo_(mesRef, lancamentos) {
  const atual=normalizarMesReferencia_(param_('MES_REFERENCIA'));
  if (mesRef===atual) return valoresAbaSnapshot_(aba_(ABAS.RATEIO));
  const totais={};
  lancamentos.forEach(function(l){
    const centro=String(l[COL_LANC.CENTRO-1]||'(sem centro)').trim()||'(sem centro)';
    const tipo=String(l[COL_LANC.TIPO-1]||'');
    // Oficina Ativo é controlado separadamente no Resumo e não compõe TOTAL operacional.
    if (tipo==='Oficina Ativo') return;
    totais[centro]=(totais[centro]||0)+(Number(l[COL_LANC.VALOR-1])||0);
  });
  const linhas=[['Centro de Custo','Soma de lançamentos R$','Observação']];
  Object.keys(totais).sort().forEach(function(c){linhas.push([c,totais[c],'Reconstruído dos snapshots gravados nos lançamentos; não inclui valores cadastrais fixos que não geraram lançamento']);});
  linhas.push(['','','Rateio percentual histórico exato só existe quando a exportação é criada durante a competência/fechamento.']);
  return linhas;
}

/**
 * Cria uma NOVA Planilha Google independente com uma fotografia em valores do período.
 * O arquivo não contém fórmulas ligadas à base principal e pode ser guardado como arquivo mensal.
 */
function exportarPeriodoPlanilha_(mesRef, motivo) {
  exigirExecucaoMutacao_();
  mesRef=normalizarMesReferencia_(mesRef || param_('MES_REFERENCIA'));
  const periodo=periodoDoMes_(mesRef);
  const lancamentos=linhasLancamentosPeriodo_(periodo);
  const odometros=linhasOdometroPeriodo_(periodo);
  const resumo=resumoExportacaoPeriodo_(mesRef);
  const snap=snapshotIntegridadeBase_()[mesRef] || {hash:hashIntegridade_(''),qtdLancamentos:lancamentos.length};
  const agora=new Date();
  const carimbo=Utilities.formatDate(agora,timezone_(),'yyyy-MM-dd_HH-mm-ss');
  const nome=PREFIXO_EXPORTACAO_PERIODO_+mesRef+'_'+carimbo;
  const destino=SpreadsheetApp.create(nome);
  const arquivo=DriveApp.getFileById(destino.getId());
  arquivo.moveTo(pastaExportacoesPeriodo_());

  const info=destino.getSheets()[0];
  info.setName('00_Informacoes');
  const totalLanc=lancamentos.reduce(function(s,l){return s+(String(l[COL_LANC.TIPO-1])==='Oficina Ativo'?0:(Number(l[COL_LANC.VALOR-1])||0));},0);
  const totalResumo = resumo.valores && resumo.valores.length >= 3 && resumo.valores[2].length >= 20 && isFinite(Number(resumo.valores[2][19]))
    ? Number(resumo.valores[2][19]) : totalLanc;
  const infoValores=[
    ['EXPORTAÇÃO INDEPENDENTE DO PERÍODO',''],
    ['Empresa',String(param_('EMPRESA'))],
    ['Competência',mesRef],
    ['Período',formatarData_(periodo.inicio)+' a '+formatarData_(periodo.fim)],
    ['Exportado em',Utilities.formatDate(agora,timezone_(),'dd/MM/yyyy HH:mm:ss')],
    ['Exportado por',emailContextoAtual_()],
    ['Versão do sistema',VERSAO_SISTEMA],
    ['Regra de competência','Dia 26 do mês anterior até dia 25 do mês de referência'],
    ['Base de rateio',String(param_('BASE_RATEIO'))],
    ['Custo hora motorista R$',Number(param_('CUSTO_HORA_MOTORISTA'))||0],
    ['Motivo',String(motivo||'manual')],
    ['Qtd. lançamentos',lancamentos.length],
    ['Qtd. leituras odômetro',odometros.length],
    ['Total apurado do Resumo R$',totalResumo],
    ['Soma bruta operacional dos lançamentos R$',totalLanc],
    ['Hash de integridade da competência',snap.hash||''],
    ['Origem do Resumo',resumo.origem],
    ['Arquivo de origem',ss_().getName()],
    ['ID da planilha de origem',ss_().getId()],
    ['Aviso','Arquivo-snapshot em valores. Não depende de fórmulas ou vínculos com a planilha original.']
  ];
  prepararAbaExportacao_(info,infoValores,1);
  info.getRange('A1:B1').setBackground(CORES.PRETO).setFontColor(CORES.BRANCO).setFontWeight('bold');
  info.getRange('A2:A20').setFontWeight('bold');
  info.setColumnWidth(1,270); info.setColumnWidth(2,560);
  info.getRange('B10').setNumberFormat('R$ #,##0.00');
  info.getRange('B14:B15').setNumberFormat('R$ #,##0.00');

  function nova(nomeAba,valores,cab){const s=destino.insertSheet(nomeAba);prepararAbaExportacao_(s,valores,cab);return s;}
  const sResumo=nova('01_Resumo',resumo.valores,2);
  const cabLanc=CABECALHOS[ABAS.LANCAMENTOS].slice();   // fonte unica: nao duplica o schema
  const sLanc=nova('02_Lancamentos',[cabLanc].concat(lancamentos),1);
  if(lancamentos.length){sLanc.getRange(2,1,lancamentos.length,1).setNumberFormat('dd/mm/yyyy');sLanc.getRange(2,4,lancamentos.length,1).setNumberFormat('#,##0.000');sLanc.getRange(2,5,lancamentos.length,1).setNumberFormat('R$ #,##0.00');}
  const sOdo=nova('03_Odometro',[['Data','Placa / ID','KM / Horímetro']].concat(odometros),1);
  if(odometros.length){sOdo.getRange(2,1,odometros.length,1).setNumberFormat('dd/mm/yyyy');sOdo.getRange(2,3,odometros.length,1).setNumberFormat('#,##0');}
  nova('04_RateioCentro',rateioExportacaoPeriodo_(mesRef,lancamentos), mesRef===normalizarMesReferencia_(param_('MES_REFERENCIA'))?2:1);

  const placas={}; lancamentos.forEach(function(l){if(l[1])placas[normalizaPlaca_(l[1])]=true;}); odometros.forEach(function(l){if(l[1])placas[normalizaPlaca_(l[1])]=true;});
  const veiculos=dadosVeiculosExecucao_().filter(function(l){return placas[normalizaPlaca_(l[0])]===true;});
  nova('05_Veiculos',[['Placa / ID','Descrição','Categoria','Centro de Custo','Código Patrimônio','Depreciação Mensal','Emplacamento/IPVA','Seguro','Bônus','Preço Comb. Próprio','Ativo','Aba de Origem']].concat(veiculos),1);
  const centros=aba_(ABAS.CENTROS); const centrosVal=centros.getLastRow()>=1?centros.getRange(1,1,centros.getLastRow(),3).getValues():[['Centro de Custo','% Rateio Depósito','Recebe Rateio']];
  nova('06_Centros',centrosVal,1);

  const atual=normalizarMesReferencia_(param_('MES_REFERENCIA'));
  let pend=[['Origem','Placa / ID','Problema','Detalhe','Status','Observação','Validado em']];
  if(mesRef===atual){const conf=ss_().getSheetByName(ABAS.CONFERENCIA);if(conf&&conf.getLastRow()>=3)pend=pend.concat(conf.getRange(3,1,conf.getLastRow()-2,7).getValues());}
  else pend.push(['','','Snapshot de pendências não disponível retroativamente','','','','']);
  nova('07_Pendencias',pend,1);

  const hist=historicoAtePeriodo_(mesRef);
  const existeMesHist=hist.some(function(l){return String(l[0]||'').trim()===mesRef;});
  if(!existeMesHist) hist.push([mesRef,totalResumo,lancamentos.length,snap.hash||'',agora,'SNAPSHOT V'+VERSAO_SISTEMA+' — exportação do período']);
  hist.sort(function(a,b){return String(a[0]||'').localeCompare(String(b[0]||''));});
  const sHist=nova('08_Historico',[['Período','Total Geral R$','Qtd. Lançamentos','Hash Integridade','Fechado / Baseline em','Responsável / Origem']].concat(hist),1);
  if(hist.length){sHist.getRange(2,2,hist.length,1).setNumberFormat('R$ #,##0.00');sHist.getRange(2,5,hist.length,1).setNumberFormat('dd/mm/yyyy hh:mm:ss');}

  destino.setActiveSheet(info);
  SpreadsheetApp.flush();
  const props=PropertiesService.getScriptProperties();
  props.setProperties({ULTIMA_EXPORTACAO_PERIODO_ID:destino.getId(),ULTIMA_EXPORTACAO_PERIODO_MES:mesRef,ULTIMA_EXPORTACAO_PERIODO_EM:String(agora.getTime())},false);
  registrarLog_('Exportar período',mesRef+' • '+nome+' • '+String(motivo||'manual'));
  return {ok:true,id:destino.getId(),nome:nome,url:arquivo.getUrl(),mes:mesRef,periodo:formatarData_(periodo.inicio)+' a '+formatarData_(periodo.fim),lancamentos:lancamentos.length,hash:snap.hash||''};
}

function exportarPeriodoComAviso() {
  exigirExecucaoMutacao_();
  const ui=SpreadsheetApp.getUi();
  const atual=normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const r=ui.prompt('Exportar período em planilha','Informe a competência no formato AAAA-MM.\n\nCompetência aberta: '+atual+'\nO arquivo será uma fotografia independente, somente com valores.',ui.ButtonSet.OK_CANCEL);
  if(r.getSelectedButton()!==ui.Button.OK)return;
  let exp;
  try { exp=exportarPeriodoPlanilha_(r.getResponseText().trim()||atual,'manual pela planilha'); }
  catch(e){alerta_('Exportação não realizada',e.message);return;}
  alerta_('Período exportado','Arquivo: '+exp.nome+'\nPeríodo: '+exp.periodo+'\nLançamentos: '+exp.lancamentos+'\n\n'+exp.url);
}

const PASTA_RELATORIOS = 'Relatórios Frota';
const ABAS_EXPORTAVEIS_ = [ABAS.RESUMO, ABAS.DASHBOARD, ABAS.RATEIO, ABAS.RELATORIOS, ABAS.CONSULTA];

/** Gera o PDF de uma aba e devolve o arquivo criado no Drive. */
function exportarAbaComoPdf_(nomeAba) {
  exigirExecucaoMutacao_();
  nomeAba = String(nomeAba || '').trim();
  if (ABAS_EXPORTAVEIS_.indexOf(nomeAba) === -1) {
    throw new Error('Exportação bloqueada para a aba "' + nomeAba + '". Use somente relatórios autorizados do sistema.');
  }
  const sheet = aba_(nomeAba);
  const planilha = ss_();

  const parametros = [
    'format=pdf',
    'gid=' + sheet.getSheetId(),
    'portrait=false',          // paisagem: os relatórios são largos
    'size=A4',
    'fitw=true',               // encaixa a largura na página
    'scale=4',                 // "ajustar à largura"
    'gridlines=false',
    'printtitle=false',
    'sheetnames=false',
    'pagenumbers=true',
    'attachment=true',
    'top_margin=0.40', 'bottom_margin=0.40',
    'left_margin=0.30', 'right_margin=0.30',
    'horizontal_alignment=CENTER',
  ].join('&');

  const url = 'https://docs.google.com/spreadsheets/d/' + planilha.getId() +
    '/export?' + parametros;

  const resposta = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (resposta.getResponseCode() !== 200) {
    throw new Error('Não consegui gerar o PDF (HTTP ' + resposta.getResponseCode() + ').');
  }

  const nomeArquivo = nomeDoArquivo_(nomeAba);
  const blob = resposta.getBlob().setName(nomeArquivo);
  return pastaDeRelatorios_().createFile(blob);
}

function nomeDoArquivo_(nomeAba) {
  const mes = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const semAcento = nomeAba.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return 'Frota_' + semAcento.replace(/\s+/g, '_') + '_' + mes + '.pdf';
}

/** Pasta no Drive onde os PDFs ficam guardados (criada na primeira vez). */
function pastaDeRelatorios_() {
  exigirExecucaoMutacao_();
  const props=PropertiesService.getScriptProperties();
  const id=props.getProperty('PASTA_RELATORIOS_FROTA_ID');
  if(id){ try{return DriveApp.getFolderById(id);}catch(e){} }
  const arquivo=DriveApp.getFileById(ss_().getId());
  let pai=null;
  try{const pais=arquivo.getParents(); if(pais.hasNext()) pai=pais.next();}catch(e){}
  let pasta=null;
  try{const existentes=pai?pai.getFoldersByName(PASTA_RELATORIOS):DriveApp.getFoldersByName(PASTA_RELATORIOS); if(existentes.hasNext())pasta=existentes.next();}catch(e){}
  if(!pasta)pasta=pai?pai.createFolder(PASTA_RELATORIOS):DriveApp.createFolder(PASTA_RELATORIOS);
  props.setProperty('PASTA_RELATORIOS_FROTA_ID',pasta.getId());
  return pasta;
}

/** Gera o PDF e manda por e-mail. Devolve a mensagem de confirmação. */
function enviarRelatorioPorEmail_(destinatarios, nomeAba) {
  exigirExecucaoMutacao_();
  const lista = String(destinatarios || '')
    .split(/[,;]/)
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(function (e, i, a) { return e && a.indexOf(e) === i; });
  if (!lista.length) throw new Error('Informe pelo menos um e-mail.');
  if (lista.length > 20) throw new Error('Por segurança, envie para no máximo 20 destinatários por operação.');

  const invalidos = lista.filter(function (e) { return e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
  if (invalidos.length) throw new Error('E-mail inválido: ' + invalidos.join(', '));

  const restante = MailApp.getRemainingDailyQuota();
  if (restante < lista.length) {
    throw new Error('Cota diária de e-mail insuficiente (restam ' + restante + ').');
  }

  const arquivo = exportarAbaComoPdf_(nomeAba);
  const periodo = periodoAtual_();
  const mes = nomeDoMes_(param_('MES_REFERENCIA'));
  const total = totalGeralResumo_();

  MailApp.sendEmail({
    to: lista.join(','),
    subject: '[Frota] ' + nomeAba + ' — ' + mes,
    htmlBody:
      '<p>Segue o relatório <b>' + nomeAba + '</b> referente a <b>' + mes + '</b>.</p>' +
      '<p>Período: ' + formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim) + '<br>' +
      'Custo total apurado: <b>R$ ' +
      Number(total).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</b></p>' +
      '<p style="color:#666;font-size:12px">Enviado pelo Sistema de Controle de Custos de Frota.</p>',
    attachments: [arquivo.getAs(MimeType.PDF)],
    name: String(param_('EMPRESA')),
  });

  return 'Enviado para ' + lista.join(', ') + '.';
}

// ------------------------------------------------------------- pelo menu

function exportarAbaAtualPdf() {
  exigirExecucaoMutacao_();
  const nome = ss_().getActiveSheet().getName();
  const arquivo = exportarAbaComoPdf_(nome);
  registrarLog_('Exportar PDF', nome);
  alerta_('PDF gerado',
    arquivo.getName() + '\n\nSalvo na pasta "' + PASTA_RELATORIOS + '" do seu Drive:\n' +
    arquivo.getUrl());
}

function enviarResumoPorEmail() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();
  const nome = ss_().getActiveSheet().getName();
  const resposta = ui.prompt(
    'Enviar por e-mail',
    'A aba "' + nome + '" será enviada em PDF.\n\n' +
    'Para quais e-mails? (separe por vírgula)',
    ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return;

  const mensagem = enviarRelatorioPorEmail_(resposta.getResponseText(), nome);
  registrarLog_('Enviar por e-mail', nome + ' → ' + resposta.getResponseText());
  alerta_('Relatório enviado', mensagem);
}

// ==========================================================================
// 13_Auditoria.gs
// ==========================================================================

/**
 * Rastro de quem fez o que, e protecao das abas que ninguem deve digitar.
 */

const LIMITE_LOG = 5000;

function prepararLogArquivo_(ano) {
  const nome = 'Log Arquivo ' + ano;
  const sheet = aba_(nome, true);
  if (sheet.getLastRow() < 1 || !sheet.getRange(1, 1).getValue()) {
    sheet.getRange(1, 1, 1, 4).setValues([['Quando', 'Quem', 'Ação', 'Detalhe']]);
    estilizarCabecalho_(sheet.getRange(1, 1, 1, 4));
    sheet.setFrozenRows(1);
    sheet.getRange('A2:A').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  }
  try {
    const ja = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).some(function(p){
      return String(p.getDescription()||'').indexOf('Sistema de Frota — perfil —')===0;
    });
    const admins = emailsUsuariosAtivosPorPerfil_(['ADMIN']);
    if (!ja && admins.length) protegerFolhaPerfil_(sheet, nome, admins, []);
  } catch(e) {}
  return sheet;
}

/** Move o excesso para arquivos anuais antes de remover do log operacional. */
function arquivarExcedenteLog_() {
  const sheet = ss_().getSheetByName(ABAS.LOG);
  if (!sheet) return 0;
  const excedente = sheet.getLastRow() - 1 - LIMITE_LOG;
  if (excedente <= 0) return 0;
  const dados = sheet.getRange(2, 1, excedente, 4).getValues();
  const grupos = {};
  dados.forEach(function(l) {
    const d = l[0] instanceof Date ? l[0] : new Date(l[0]);
    const ano = !isNaN(d.getTime()) ? Utilities.formatDate(d, timezone_(), 'yyyy') : 'SemData';
    if (!grupos[ano]) grupos[ano] = [];
    grupos[ano].push(l);
  });
  Object.keys(grupos).forEach(function(ano) {
    const destino = prepararLogArquivo_(ano);
    destino.getRange(destino.getLastRow() + 1, 1, grupos[ano].length, 4).setValues(grupos[ano]);
  });
  sheet.deleteRows(2, excedente);
  return excedente;
}

function registrarLogComUsuario_(quem, acao, detalhe) {
  try {
    const sheet = ss_().getSheetByName(ABAS.LOG);
    if (!sheet) return;
    const linha = sheet.getLastRow() + 1;
    sheet.getRange(linha, 1, 1, 4).setValues([[
      new Date(), String(quem || '(desconhecido)').slice(0, 220),
      String(acao || '').slice(0, 190), String(detalhe == null ? '' : detalhe).slice(0, 500)
    ]]);
    sheet.getRange(linha, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    arquivarExcedenteLog_();
  } catch (erro) { console.error('registrarLogComUsuario_: ' + erro.message); }
}

/** Grava uma linha no log. Nunca deixa o log quebrar a operação principal. */
function registrarLog_(acao, detalhe) {
  try {
    // Logins são bufferizados para não atrasar a autenticação; qualquer ação seguinte
    // descarrega os eventos pendentes antes de registrar a nova linha.
    descarregarLoginsPendentes_();
    registrarLogComUsuario_(emailContextoAtual_(), acao, detalhe);
  } catch (erro) {
    console.error('registrarLog: ' + erro.message);
  }
}

function montarLog_() {
  const sheet = aba_(ABAS.LOG, true);
  const cabecalho = ['Quando', 'Quem', 'Ação', 'Detalhe'];
  const atual = sheet.getRange(1, 1, 1, 4).getValues()[0];
  if (atual.every(function (c) { return c === '' || c === null; })) {
    sheet.getRange(1, 1, 1, 4).setValues([cabecalho]);
  }
  estilizarCabecalho_(sheet.getRange(1, 1, 1, 4));
  sheet.setFrozenRows(1);
  [155, 220, 190, 420].forEach(function (largura, i) {
    sheet.setColumnWidth(i + 1, largura);
  });
  sheet.getRange('A2:A').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  return sheet;
}

/**
 * Proteção real por perfil.
 *
 * Regra:
 * - ADMIN: pode administrar as folhas protegidas e reconstruir o sistema;
 * - OPERADOR: recebe somente os pontos operacionais necessários;
 * - CONSULTA: recebe somente filtros/navegação de consulta;
 * - editores do arquivo que não estão em "Usuários" não recebem exceções.
 *
 * Observação importante: Lançamentos e Odômetro precisam aceitar OPERADOR porque
 * a Central Operacional funciona como contingência sem depender do Web App e o
 * script executado pela planilha respeita a permissão do usuário que o acionou.
 */
function emailsUsuariosAtivosPorPerfil_(perfis) {
  const permitidos = Array.isArray(perfis) ? perfis : [perfis];
  const sheet = ss_().getSheetByName(ABAS.USUARIOS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const vistos = {};
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues()
    .filter(function(l) {
      const email = String(l[0] || '').trim().toLowerCase();
      const perfil = String(l[2] || '').trim().toUpperCase();
      const ativo = String(l[5] || '').trim().toUpperCase() === 'SIM';
      if (!email || !ativo || permitidos.indexOf(perfil) === -1 || vistos[email]) return false;
      vistos[email] = true;
      return true;
    })
    .map(function(l) { return String(l[0] || '').trim().toLowerCase(); });
}

function emailsTecnicosProtecao_() {
  const lista = [];
  function adicionar(email) {
    email = String(email || '').trim().toLowerCase();
    if (email && lista.indexOf(email) === -1) lista.push(email);
  }
  try { adicionar(Session.getEffectiveUser().getEmail()); } catch (e) {}
  try { adicionar(Session.getActiveUser().getEmail()); } catch (e) {}
  try {
    const dono = ss_().getOwner();
    if (dono) adicionar(dono.getEmail());
  } catch (e) {}
  return lista;
}

function normalizarEmailsProtecao_(emails) {
  const lista = [];
  (emails || []).concat(emailsTecnicosProtecao_()).forEach(function(email) {
    email = String(email || '').trim().toLowerCase();
    if (email && lista.indexOf(email) === -1) lista.push(email);
  });
  return lista;
}

/** Define a lista efetiva de quem pode ultrapassar uma proteção. */
function configurarEditoresProtecao_(protecao, emails) {
  const permitidos = normalizarEmailsProtecao_(emails);
  protecao.setWarningOnly(false);
  try { if (protecao.canDomainEdit()) protecao.setDomainEdit(false); } catch (e) {}

  // Adiciona antes de remover: evita deixar o executor sem acesso durante a troca.
  permitidos.forEach(function(email) {
    try { protecao.addEditor(email); } catch (e) {
      console.error('Não foi possível adicionar ' + email + ' à proteção: ' + e.message);
    }
  });

  try {
    protecao.getEditors().forEach(function(usuario) {
      const email = String(usuario.getEmail() || '').trim().toLowerCase();
      if (email && permitidos.indexOf(email) === -1) {
        try { protecao.removeEditor(email); } catch (e) {}
      }
    });
  } catch (e) {}
  return protecao;
}

function removerProtecoesSistema_() {
  const planilha = ss_();
  [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE]
    .forEach(function(tipo) {
      planilha.getProtections(tipo).forEach(function(p) {
        if (String(p.getDescription() || '').indexOf('Sistema de Frota') === 0) {
          try { p.remove(); } catch (e) {
            throw new Error('Não foi possível substituir uma proteção antiga. ' +
              'Confirme que sua conta é ADMIN e tem permissão de edição. Detalhe: ' + e.message);
          }
        }
      });
    });
}

function protegerFolhaPerfil_(sheet, descricao, editores, faixasLiberadas) {
  const p = sheet.protect().setDescription('Sistema de Frota — perfil — ' + descricao);
  configurarEditoresProtecao_(p, editores);
  if (faixasLiberadas && faixasLiberadas.length) p.setUnprotectedRanges(faixasLiberadas);
  return p;
}

/**
 * Uma faixa liberada pela proteção da folha pode receber outra proteção com uma
 * lista menor de perfis. Isso permite, por exemplo, deixar B3 da Consulta para
 * todos os usuários ativos e a Central Operacional somente para OPERADOR/ADMIN.
 */
function protegerFaixaPerfil_(sheet, a1, descricao, editores) {
  const p = sheet.getRange(a1).protect()
    .setDescription('Sistema de Frota — perfil — ' + descricao + ' — ' + a1);
  configurarEditoresProtecao_(p, editores);
  return p;
}

function protegerFaixaPerfilRange_(range, descricao, editores) {
  const p = range.protect()
    .setDescription('Sistema de Frota — perfil — ' + descricao + ' — ' + range.getA1Notation());
  configurarEditoresProtecao_(p, editores);
  return p;
}

function protegerAbasCalculadas_() {
  exigirExecucaoMutacao_();
  const planilha = ss_();
  const admins = emailsUsuariosAtivosPorPerfil_(['ADMIN']);
  const operacionais = emailsUsuariosAtivosPorPerfil_(['OPERADOR', 'ADMIN']);
  const todos = emailsUsuariosAtivosPorPerfil_(['CONSULTA', 'OPERADOR', 'ADMIN']);

  removerProtecoesSistema_();

  // -------------------- folhas integralmente administrativas / calculadas
  [ABAS.RATEIO, ABAS.DASHBOARD, ABAS.LOG,
   ABAS.PARAMETROS, ABAS.USUARIOS, ABAS.VEICULOS, ABAS.CENTROS, ABAS.HISTORICO, ABAS.EXCLUIDOS,
   ABAS.RATEIO_MENSAL, ABAS.ORCAMENTO]
    .forEach(function(nome) {
      const sheet = planilha.getSheetByName(nome);
      if (sheet) protegerFolhaPerfil_(sheet, nome, admins, []);
    });
  // V4.8: o Resumo é gravado pelo script a cada lançamento. Quando o OPERADOR lança
  // pela planilha (formulário lateral / Central Operacional) o script roda com a conta
  // dele, então ele precisa poder gravar no Resumo — senão o Resumo ficaria atrasado.
  const resumoProt = planilha.getSheetByName(ABAS.RESUMO);
  if (resumoProt) protegerFolhaPerfil_(resumoProt, ABAS.RESUMO, operacionais, []);

  // Fechamentos congelados e arquivos de auditoria ficam sob controle administrativo.
  planilha.getSheets().forEach(function(sheet) {
    if (/^Fechado\s+\d{4}-\d{2}$/i.test(sheet.getName()) || /^Log Arquivo\s+/i.test(sheet.getName())) {
      protegerFolhaPerfil_(sheet, sheet.getName(), admins, []);
    }
  });

  // -------------------- Consulta Veículo: somente B3 para usuários ativos
  const consulta = planilha.getSheetByName(ABAS.CONSULTA);
  if (consulta) {
    protegerFolhaPerfil_(consulta, ABAS.CONSULTA, admins, [consulta.getRange('B3')]);
    protegerFaixaPerfil_(consulta, 'B3', 'Consulta Veículo — filtro', todos);
  }

  // -------------------- Relatórios: somente as três células de filtro
  const relatorios = planilha.getSheetByName(ABAS.RELATORIOS);
  if (relatorios) {
    const filtros = [relatorios.getRange(CEL_TIPO), relatorios.getRange(CEL_CENTRO),
      relatorios.getRange(CEL_CATEGORIA), relatorios.getRange(CEL_VEICULO)];
    protegerFolhaPerfil_(relatorios, ABAS.RELATORIOS, admins, filtros);
    protegerFaixaPerfil_(relatorios, CEL_TIPO, 'Relatórios — tipo', todos);
    protegerFaixaPerfil_(relatorios, CEL_CENTRO, 'Relatórios — centro', todos);
    protegerFaixaPerfil_(relatorios, CEL_CATEGORIA, 'Relatórios — categoria', todos);
    protegerFaixaPerfil_(relatorios, CEL_VEICULO, 'Relatórios — veículo/patrimônio', todos);
  }

  // -------------------- Pendências: OPERADOR/ADMIN pode alterar Status e Observação
  const conferencia = planilha.getSheetByName(ABAS.CONFERENCIA);
  if (conferencia) {
    const qtd = Math.max(conferencia.getMaxRows() - 2, 1);
    const faixaPend = conferencia.getRange(3, 5, qtd, 2); // E:F
    protegerFolhaPerfil_(conferencia, ABAS.CONFERENCIA, admins, [faixaPend]);
    protegerFaixaPerfilRange_(faixaPend, 'Pendências — status/observação', operacionais);
  }

  // -------------------- Central Operacional
  const central = planilha.getSheetByName(ABAS.CENTRAL_OPERACIONAL);
  if (central) {
    const a1Operacao = ['B8','E8','H8','B10','E10','H10','B12','E12','H12','B14:D14','F14:J14','B16:J16','B19','E19'];
    const a1Admin = ['B25','E25','H25'];
    const a1Nav = ['B29','E29','H29','J29'];
    const liberadas = a1Operacao.concat(a1Admin, a1Nav).map(function(a1) { return central.getRange(a1); });
    protegerFolhaPerfil_(central, ABAS.CENTRAL_OPERACIONAL, admins, liberadas);
    a1Operacao.forEach(function(a1) { protegerFaixaPerfil_(central, a1, 'Central — operação', operacionais); });
    a1Admin.forEach(function(a1) { protegerFaixaPerfil_(central, a1, 'Central — administração', admins); });
    a1Nav.forEach(function(a1) { protegerFaixaPerfil_(central, a1, 'Central — navegação', todos); });
  }

  // -------------------- Bases operacionais
  // OPERADOR precisa desta permissão para a contingência gravar sem Web App.
  const lanc = planilha.getSheetByName(ABAS.LANCAMENTOS);
  if (lanc) {
    protegerFolhaPerfil_(lanc, ABAS.LANCAMENTOS, operacionais, []);
    // V4.8: o Período é a coluna J (K é o ID, que o próprio formulário grava). A
    // proteção estava em K, deixando J aberta a colagens que derrubavam a fórmula.
    protegerFaixaPerfil_(lanc, 'A1:' + letraColuna_(TOTAL_COL_LANC) + '1', 'Lançamentos — cabeçalho', admins);
    protegerFaixaPerfil_(lanc, letraColuna_(COL_LANC.PERIODO) + ':' + letraColuna_(COL_LANC.PERIODO),
      'Lançamentos — período calculado', admins);
  }

  const odo = planilha.getSheetByName(ABAS.ODOMETRO);
  if (odo) {
    protegerFolhaPerfil_(odo, ABAS.ODOMETRO, operacionais, []);
    protegerFaixaPerfil_(odo, 'A1:C1', 'Odômetro — cabeçalho', admins);
  }

  registrarLog_('Proteção por perfil',
    todos.length + ' usuário(s) ativo(s) • ' + operacionais.length + ' operacional(is) • ' + admins.length + ' ADMIN(s)');
  return { todos: todos.length, operacionais: operacionais.length, admins: admins.length };
}

function irParaLog() { irPara_(ABAS.LOG); }

// ==========================================================================
// 14_WebApi.gs
// ==========================================================================

/**
 * API do app da web.
 *
 * Regra desta camada: NADA aqui escreve numa aba calculada. Os relatorios sao
 * calculados em memoria a partir do Resumo e dos Lancamentos e devolvidos como
 * JSON. Sem isso, dois usuarios no celular ao mesmo tempo brigariam pela aba
 * "Relatorios" - um trocaria o filtro do outro no meio da consulta.
 *
 * Formato de tabela devolvido para a tela:
 *   { colunas: [{titulo, tipo}], linhas: [[...]], totais: [...], mensagem }
 *   tipo: 'texto' | 'moeda' | 'moeda3' | 'numero' | 'decimal' | 'data'
 */

// índices (base 0) das colunas do Resumo, lidas a partir da linha 4
const R_ = {
  PLACA: 0, DESCRICAO: 1, CATEGORIA: 2, CENTRO: 3, LITROS: 4, COMBUSTIVEL: 5,
  LUBRIFICANTE: 6, ARLA: 7, LAVACAO: 8, OFICINA: 9, OFICINA_ATIVO: 10, PNEUS: 11,
  MULTA: 12, EMPLACAMENTO: 13, IPVA: 14, SEGURO: 15, PEDAGIO: 16, DEPRECIACAO: 17,
  KM: 18, KM_LITRO: 19, RS_KM: 20, TOTAL: 21, GAS_KG: 22, GAS: 23,
};

/** Largura do Resumo, derivada do cabecalho — nao mais o literal 20 espalhado. */
const TOTAL_COL_RESUMO = RESUMO_COLUNAS.length;

// índices (base 0) das colunas de Lançamentos
/**
 * Espelho 0-based de COL_LANC, para indexar as linhas lidas com getValues().
 *
 * V4.7.2: passou a ser DERIVADO. Manter as duas listas à mão foi a origem provável
 * de qualquer divergência futura — bastava alguém acrescentar uma coluna num lugar
 * e esquecer do outro para os relatórios lerem o campo errado, sem erro nenhum.
 */
const L_ = (function () {
  const mapa = {};
  Object.keys(COL_LANC).forEach(function (chave) { mapa[chave] = COL_LANC[chave] - 1; });
  return mapa;
})();

function col_(titulo, tipo) {
  return { titulo: titulo, tipo: tipo || 'texto' };
}

/**
 * Confere se a aba Resumo tem o schema que este codigo espera.
 *
 * Existe por causa de uma falha silenciosa real: colar o .gs novo sem rodar
 * "Instalar / atualizar sistema" deixa o codigo esperando 21 colunas e a aba
 * ainda com 20. Ai R_.TOTAL cai FORA da faixa lida, e o Resumo aparece com
 * placa e descricao normais e todos os valores vazios — sem erro nenhum.
 *
 * Zero silencioso e o pior defeito possivel num sistema de custo: parece que a
 * frota nao gastou nada. Melhor parar e dizer o que fazer.
 */
let SCHEMA_RESUMO_OK_ = false;

function conferirSchemaResumo_(sheet) {
  if (SCHEMA_RESUMO_OK_) return;
  const largura = Math.max(sheet.getLastColumn(), 1);

  function recusar(motivo) {
    throw new Error(
      'A aba "' + ABAS.RESUMO + '" está no layout de uma versão anterior (' + motivo +
      '). Os valores apareceriam zerados. Rode "🚚 Sistema de Frota → ' +
      'Instalar / atualizar sistema" uma vez para reconstruir os relatórios no schema novo.');
  }

  // Sinal principal: a aba estreita demais. E o que acontece ao colar o .gs novo
  // sem reinstalar — R_.TOTAL cai fora da faixa lida e tudo vem vazio.
  if (largura < TOTAL_COL_RESUMO) {
    // V4.8: o Resumo é calculado pelo script, então basta recalcular no layout novo.
    atualizarResumoSeguro_();
    if (Math.max(sheet.getLastColumn(), 1) < TOTAL_COL_RESUMO) {
      recusar(largura + ' colunas; esperado ' + TOTAL_COL_RESUMO);
    }
  }

  // Confirmacao: mesma largura, ordem diferente. Cabecalho em branco NAO bloqueia —
  // nao da para afirmar que o layout esta errado sem conseguir ler o rotulo, e
  // travar por falta de prova deixaria o sistema inutilizavel por um detalhe visual.
  const rotuloTotal = String(
    sheet.getRange(2, 1, 1, largura).getDisplayValues()[0][R_.TOTAL] || '').trim();
  if (rotuloTotal && rotuloTotal !== RESUMO_COLUNAS[R_.TOTAL]) {
    recusar('a coluna ' + letraColuna_(R_.TOTAL + 1) + ' diz "' + rotuloTotal +
      '" onde deveria dizer "' + RESUMO_COLUNAS[R_.TOTAL] + '"');
  }
  SCHEMA_RESUMO_OK_ = true;
}

function lerResumo_() {
  exigirExecucaoLeitura_();
  garantirResumoAtualizado_();
  const sheet = ss_().getSheetByName(ABAS.RESUMO);
  if (!sheet) return [];
  if (sheet.getLastRow() < 4) {
    // Ocupado = outro processo esta gravando agora. Esperar a vez dele e reler
    // e diferente de "falhou": tratar os dois igual acusaria erro grave numa
    // condicao que se resolve sozinha em segundos.
    if (atualizarResumoSeguro_() === RESUMO_OCUPADO_) aguardarResumoLivre_();
    if (sheet.getLastRow() < 4) {
      const temVeiculo = dadosVeiculosExecucao_().some(function (v) { return String(v[COL_VEIC.PLACA - 1] || '').trim(); });
      if (temVeiculo) {
        throw new Error('Não foi possível calcular o Resumo' + (ULTIMO_ERRO_RESUMO_ ? ': ' + ULTIMO_ERRO_RESUMO_ : '.') +
          ' Rode "Instalar / atualizar sistema" na planilha.');
      }
      return [];
    }
  }
  conferirSchemaResumo_(sheet);
  let linhas = sheet.getRange(4, 1, sheet.getLastRow() - 3, TOTAL_COL_RESUMO).getValues()
    .filter(function (linha) { return linha[R_.PLACA]; });
  // V4.8: Resumo vazio com veículos no cadastro = cálculo pendente ou interrompido.
  // Recalcula na hora em vez de devolver relatório vazio.
  if (!linhas.length && dadosVeiculosExecucao_().some(function (v) { return String(v[COL_VEIC.PLACA - 1] || '').trim(); })) {
    const resultado = atualizarResumoSeguro_();
    if (resultado === RESUMO_OCUPADO_) aguardarResumoLivre_();
    if (resultado > 0 || resultado === RESUMO_OCUPADO_) {
      linhas = sheet.getRange(4, 1, Math.max(sheet.getLastRow() - 3, 1), TOTAL_COL_RESUMO).getValues()
        .filter(function (linha) { return linha[R_.PLACA]; });
    }
    // Ainda vazio com veículos cadastrados: mostra o erro real em vez de uma tela vazia.
    if (!linhas.length) {
      throw new Error('Não foi possível calcular o Resumo' +
        (ULTIMO_ERRO_RESUMO_ ? ': ' + ULTIMO_ERRO_RESUMO_ : '.') +
        ' Rode "🚚 Sistema de Frota → Administração → Instalar / atualizar sistema" na planilha.');
    }
  }
  return linhas;
}

/**
 * Base de lançamentos do período, com cache de EXECUÇÃO (V4.7.2).
 *
 * Cinco pontos do sistema chamavam esta função e cada um relia a base inteira.
 * Numa mesma execução — um relatório que também monta o cabeçalho, a consulta de
 * veículo, a tela inicial — isso era a maior leitura do sistema, repetida.
 *
 * O cache é só de execução (uma variável, como VEICULOS_EXEC_CACHE_), NÃO
 * CacheService: a base passa de 100 KB serializada e, pior, um cache entre
 * execuções serviria lançamento velho logo após a gravação. Aqui o cache nasce
 * e morre dentro da mesma chamada, então não existe leitura desatualizada.
 *
 * Quem grava zera o cache por garantia (ver invalidarCacheLancamentos_).
 */
/**
 * Leituras de odometro, com cache de EXECUCAO (mesmo padrao de veiculos e
 * lancamentos).
 *
 * Existia um cache aqui, mas privado do kmDoDia_: os outros seis pontos que
 * precisavam das leituras varriam a aba inteira cada um. Numa requisicao que
 * toque mais de um deles, a mesma aba era lida varias vezes.
 *
 * Devolve as linhas CRUAS [data, placa, km], sem filtrar: cada chamador tem um
 * criterio diferente, e filtrar aqui obrigaria a reler para o proximo.
 */
let ODOMETRO_EXEC_CACHE_ = null;

function lerOdometro_() {
  if (ODOMETRO_EXEC_CACHE_) return ODOMETRO_EXEC_CACHE_;
  const odo = ss_().getSheetByName(ABAS.ODOMETRO);
  ODOMETRO_EXEC_CACHE_ = (odo && odo.getLastRow() >= 2)
    ? odo.getRange(2, 1, odo.getLastRow() - 1, 3).getValues()
    : [];
  return ODOMETRO_EXEC_CACHE_;
}

function invalidarCacheOdometro_() {
  ODOMETRO_EXEC_CACHE_ = null;
}

let LANCAMENTOS_EXEC_CACHE_ = null;

function invalidarCacheLancamentos_() {
  LANCAMENTOS_EXEC_CACHE_ = null;
}

function lerLancamentos_() {
  exigirExecucaoLeitura_();
  if (LANCAMENTOS_EXEC_CACHE_) return LANCAMENTOS_EXEC_CACHE_;
  const sheet = aba_(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (n < 1) {
    LANCAMENTOS_EXEC_CACHE_ = [];
    return LANCAMENTOS_EXEC_CACHE_;
  }
  LANCAMENTOS_EXEC_CACHE_ = sheet.getRange(2, 1, n, TOTAL_COL_LANC).getValues()
    .map(function (linha, i) { linha.linhaPlanilha = i + 2; return linha; })
    .filter(function (linha) { return linha[L_.PLACA]; });
  // V4.8: a competência é calculada aqui, não lida da coluna J. Se a fórmula de J
  // quebrar (#REF! por um valor colado), os relatórios em memória continuam certos.
  LANCAMENTOS_EXEC_CACHE_.forEach(function (linha) {
    linha[L_.PERIODO] = mesCompetenciaDaData_(linha[L_.DATA]);
  });
  return LANCAMENTOS_EXEC_CACHE_;
}

// ------------------------------------------------------------------ início

/** Estado geral do sistema, para a tela inicial do app. */
const CACHE_INICIO_SEGUNDOS_ = 600;   // 10 min (gatilho reaquece a cada 5)
const CACHE_INICIO_PREFIXO_ = 'DASH_INICIO_V46_';
const CACHE_INICIO_ATUAL_ = 'DASH_INICIO_ATUAL_V46';

function invalidarCacheSaude_() {
  try { CacheService.getScriptCache().remove(CACHE_SAUDE_RAPIDA_); } catch (e) {}
}

function invalidarCacheInicio_() {
  try { CacheService.getScriptCache().remove(CACHE_INICIO_ATUAL_); } catch (e) {}
  invalidarCacheBootstrap_();
  invalidarCacheSaude_();
  // Ponto único já chamado por todos os 25 caminhos que alteram dados: é aqui que
  // o cache de execução da base de lançamentos também precisa cair.
  // E é aqui que a geração avança, invalidando de uma vez toda apuração de
  // competência guardada — inclusive a de edições manuais, que passam por
  // onEdit e chegam até aqui.
  avancarGeracaoBase_();
  invalidarCacheLancamentos_();
  invalidarCacheFornecedores_();
  invalidarCacheOdometro_();
}

function construirDadosInicio_(mesRef) {
  const periodo = periodoDoMes_(mesRef);
  const resumo = lerResumo_();
  const totais = {
    total: 0, km: 0, litros: 0, combustivel: 0, lubrificante: 0, lavacao: 0,
    oficina: 0, oficinaAtivo: 0, pneus: 0, multa: 0, emplacamento: 0,
    ipva: 0, seguro: 0, pedagio: 0, depreciacao: 0, gas: 0
  };
  const centros = {};
  let veiculosComCusto = 0;

  // Os grupos saem da MESMA varredura do total: calcular depois custaria outra
  // passada e, pior, abriria espaco para os dois divergirem.
  const mapaGrupos = gruposFrota_();
  const porGrupo = {};
  function acumularGrupo(nome, linha, totalLinha) {
    const g = porGrupo[nome] || (porGrupo[nome] = {
      nome: nome, total: 0, km: 0, litros: 0, combustivel: 0, oficina: 0,
      depreciacao: 0, veiculos: 0, veiculosComCusto: 0 });
    g.total += totalLinha;
    g.km += Number(linha[R_.KM]) || 0;
    g.litros += Number(linha[R_.LITROS]) || 0;
    g.combustivel += Number(linha[R_.COMBUSTIVEL]) || 0;
    g.oficina += (Number(linha[R_.OFICINA]) || 0) + (Number(linha[R_.OFICINA_ATIVO]) || 0);
    g.depreciacao += Number(linha[R_.DEPRECIACAO]) || 0;
    g.veiculos++;
    if (totalLinha > 0) g.veiculosComCusto++;
  }

  resumo.forEach(function (linha) {
    const totalLinha = Number(linha[R_.TOTAL]) || 0;
    acumularGrupo(grupoDaCategoria_(linha[R_.CATEGORIA], mapaGrupos), linha, totalLinha);
    totais.total += totalLinha;
    totais.km += Number(linha[R_.KM]) || 0;
    totais.litros += Number(linha[R_.LITROS]) || 0;
    totais.combustivel += Number(linha[R_.COMBUSTIVEL]) || 0;
    totais.lubrificante += Number(linha[R_.LUBRIFICANTE]) || 0;
    totais.lavacao += Number(linha[R_.LAVACAO]) || 0;
    totais.oficina += Number(linha[R_.OFICINA]) || 0;
    totais.oficinaAtivo += Number(linha[R_.OFICINA_ATIVO]) || 0;
    totais.pneus += Number(linha[R_.PNEUS]) || 0;
    totais.multa += Number(linha[R_.MULTA]) || 0;
    totais.emplacamento += Number(linha[R_.EMPLACAMENTO]) || 0;
    totais.ipva += Number(linha[R_.IPVA]) || 0;
    totais.seguro += Number(linha[R_.SEGURO]) || 0;
    totais.pedagio += Number(linha[R_.PEDAGIO]) || 0;
    totais.depreciacao += Number(linha[R_.DEPRECIACAO]) || 0;
    totais.gas += Number(linha[R_.GAS]) || 0;
    if (totalLinha > 0) veiculosComCusto++;
    const centro = String(linha[R_.CENTRO] || 'Sem centro').trim() || 'Sem centro';
    centros[centro] = (centros[centro] || 0) + totalLinha;
  });

  const historicoCompleto = lerHistoricoWeb_();
  let variacao = null;
  if (historicoCompleto.length && totais.total > 0) {
    const anterior = Number(historicoCompleto[historicoCompleto.length - 1].total) || 0;
    if (anterior > 0) variacao = totais.total / anterior - 1;
  }

  const top = resumo
    .filter(function (l) { return Number(l[R_.TOTAL]) > 0; })
    .sort(function (a, b) { return Number(b[R_.TOTAL]) - Number(a[R_.TOTAL]); })
    .slice(0, 8)
    .map(function (l) {
      return {
        placa: String(l[R_.PLACA]), descricao: String(l[R_.DESCRICAO] || ''),
        centro: String(l[R_.CENTRO] || ''), total: Number(l[R_.TOTAL]) || 0,
      };
    });

  const manutencao = totais.oficina + totais.oficinaAtivo;
  // IPVA entra aqui: e encargo de licenciamento, so que diluido em 12.
  const licencasSeguros = totais.seguro + totais.emplacamento + totais.ipva;
  const principais = totais.combustivel + manutencao + totais.depreciacao +
    totais.pneus + totais.pedagio + licencasSeguros + totais.gas;
  const outros = Math.max(0, totais.total - principais);
  const composicao = [
    { nome: 'Combustível', valor: totais.combustivel },
    { nome: 'Gás', valor: totais.gas },
    { nome: 'Oficina / manutenção', valor: manutencao },
    { nome: 'Depreciação', valor: totais.depreciacao },
    { nome: 'Pneus', valor: totais.pneus },
    { nome: 'Pedágio', valor: totais.pedagio },
    { nome: 'Seguro / licenciamento / IPVA', valor: licencasSeguros },
    { nome: 'Outros', valor: outros },
  ].filter(function (x) { return x.valor > 0; })
   .sort(function (a, b) { return b.valor - a.valor; });

  const centrosRanking = Object.keys(centros).map(function (nome) {
    return { nome: nome, valor: centros[nome] };
  }).filter(function (x) { return x.valor > 0; })
    .sort(function (a, b) { return b.valor - a.valor; })
    .slice(0, 8);

  // Ordem do parametro primeiro; o que sobrou (categoria nao mapeada) vai para o
  // fim, visivel — some-lo em silencio faria os grupos nao fecharem com o total
  // e ninguem saberia onde foi parar a diferenca.
  const nomesGrupo = mapaGrupos.ordem.filter(function (n) { return porGrupo[n]; })
    .concat(Object.keys(porGrupo).filter(function (n) {
      return mapaGrupos.ordem.indexOf(n) === -1;
    }).sort());
  const grupos = nomesGrupo.map(function (nome) {
    const g = porGrupo[nome];
    return {
      nome: nome, total: g.total, km: g.km, litros: g.litros,
      combustivel: g.combustivel, oficina: g.oficina, depreciacao: g.depreciacao,
      veiculos: g.veiculos, veiculosComCusto: g.veiculosComCusto,
      custoKm: g.km > 0 ? g.total / g.km : 0,
      kmLitro: g.litros > 0 ? g.km / g.litros : 0,
      precoLitro: g.litros > 0 ? g.combustivel / g.litros : 0,
      custoMedioVeiculo: g.veiculosComCusto > 0 ? g.total / g.veiculosComCusto : 0,
    };
  });

  const ativos = listaPlacas_(true).length;
  const lancamentosPeriodo = contarLancamentosCompetencia_(mesRef);
  const lancamentosTotal = quantidadeLancamentosReais_();

  return {
    empresa: String(param_('EMPRESA')),
    mes: mesRef,
    mesExtenso: nomeDoMes_(mesRef),
    periodo: formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim),
    total: totais.total,
    custoKm: totais.km > 0 ? totais.total / totais.km : 0,
    km: totais.km,
    litros: totais.litros,
    kmLitro: totais.litros > 0 ? totais.km / totais.litros : 0,
    precoLitro: totais.litros > 0 ? totais.combustivel / totais.litros : 0,
    oficina: manutencao,
    combustivel: totais.combustivel,
    depreciacao: totais.depreciacao,
    variacao: variacao,
    veiculos: ativos,
    veiculosComCusto: veiculosComCusto,
    custoMedioVeiculo: veiculosComCusto > 0 ? totais.total / veiculosComCusto : 0,
    lancamentos: lancamentosTotal,
    lancamentosPeriodo: lancamentosPeriodo,
    pendencias: contarPendenciasConferencia_(),
    top: top,
    grupos: grupos,
    centros: centrosRanking,
    composicao: composicao,
    evolucao: historicoCompleto.slice(-12),
    geradoEm: Utilities.formatDate(new Date(), timezone_(), 'dd/MM/yyyy HH:mm:ss'),
  };
}

function dadosInicioComCache_(forcarAtualizacao) {
  const cache = CacheService.getScriptCache();
  // Caminho quente: retorna o dashboard antes de abrir a planilha. Mudanças
  // estruturais invalidam este cache; o TTL é curto como proteção adicional.
  if (!forcarAtualizacao) {
    const bruto = cache.get(CACHE_INICIO_ATUAL_);
    if (bruto) {
      try {
        const salvo = JSON.parse(bruto);
        if (salvo && salvo.mes) { salvo.cacheHit = true; return salvo; }
      } catch (e) {}
    }
  }
  const mesRef = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const dados = construirDadosInicio_(mesRef);
  dados.cacheHit = false;
  guardarNoCache_(CACHE_INICIO_ATUAL_, dados, CACHE_INICIO_SEGUNDOS_, 'painel inicial');
  return dados;
}

function webInicio(token, forcarAtualizacao) {
  const t0 = Date.now();
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const dados = dadosInicioComCache_(forcarAtualizacao === true);
  dados.tempoServidorMs = Date.now() - t0;
  return dados;
}

function somaCombustivel_(resumo) {
  return resumo.reduce(function (soma, l) {
    return soma + (Number(l[R_.COMBUSTIVEL]) || 0);
  }, 0);
}

function lerHistoricoWeb_() {
  exigirExecucaoLeitura_();
  const sheet = aba_(ABAS.HISTORICO);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues()
    .filter(function (l) { return l[0]; })
    .map(function (l) {
      let periodo = '';
      if (l[0] instanceof Date && !isNaN(l[0].getTime())) {
        periodo = Utilities.formatDate(l[0], timezone_(), 'yyyy-MM');
      } else {
        const texto = String(l[0]).trim();
        try { periodo = normalizarMesReferencia_(texto); } catch (e) { periodo = texto; }
      }
      return { periodo: periodo, total: Number(l[1]) || 0 };
    });
}

// -------------------------------------------------------------- relatórios

function webListaRelatorios(token) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  // filtros vai junto para o app so mostrar o campo de busca em quem usa.
  return TIPOS_RELATORIO.map(function (tipo) {
    return {
      nome: tipo,
      descricao: CATALOGO_RELATORIOS[tipo].descricao,
      filtros: CATALOGO_RELATORIOS[tipo].filtros || [],
    };
  });
}

function webFiltros(token) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  return { centros: listaCentros_(), categorias: listaCategorias_() };
}

/** Calcula um relatório em memória e devolve a tabela pronta. */
function webRelatorio(token, tipo, filtros) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  filtros = filtros || {};
  const centro = filtros.centro && filtros.centro !== 'TODOS' ? filtros.centro : null;
  const categoria = filtros.categoria && filtros.categoria !== 'TODAS' ? filtros.categoria : null;
  const termo = String(filtros.termo || '').trim().slice(0, 120);
  let placa = null;
  if (filtros.veiculo && String(filtros.veiculo).trim() && String(filtros.veiculo).trim() !== 'TODOS') {
    const rv = resolverVeiculo_(filtros.veiculo, false);
    if (!rv.ok) return { colunas: [], linhas: [], mensagem: rv.mensagem || 'Veículo não encontrado.' };
    placa = normalizaPlaca_(rv.veiculo.placa);
  }

  const r = relatorioPorTipo_(tipo, centro, categoria, placa, termo);
  if (r && r.linhas && !r.linhas.length && !r.mensagem) {
    const veiculos = dadosVeiculosExecucao_().filter(function (v) { return String(v[COL_VEIC.PLACA - 1] || '').trim(); }).length;
    const p = periodoAtual_();
    r.mensagem = !veiculos ? 'Nenhum veículo cadastrado.'
      : 'Nenhum dado no período ' + formatarData_(p.inicio) + ' a ' + formatarData_(p.fim) +
        (placa ? ' para ' + placa : '') + (centro ? ' no centro ' + centro : '') + (categoria ? ' na categoria ' + categoria : '') + '.';
  }
  return r;
}

function relatorioPorTipo_(tipo, centro, categoria, placa, termo) {
  switch (tipo) {
    case 'Gerencial por Centro de Custo': return relatorioGerencial_(centro, categoria, placa);
    case 'Manutenção — oficina e pneus': return relatorioManutencao_(centro, categoria, placa);
    case 'Detalhamento de oficina por veículo': return relatorioDetalhamentoOficina_(centro, categoria, placa);
    case 'Abastecimento e consumo': return relatorioAbastecimento_(centro, categoria, placa);
    case 'Ranking de custo por KM': return relatorioRanking_(centro, categoria, placa);
    case 'IPVA por veículo': return relatorioIpva_(centro, categoria, placa);
    case 'Histórico de KM por veículo': return relatorioHistoricoKm_(centro, categoria, placa);
    case 'Manutenção realizada por veículo': return relatorioManutencaoVeiculo_(centro, categoria, placa, true);
    case 'Manutenção em oficina por veículo': return relatorioManutencaoVeiculo_(centro, categoria, placa, false);
    case 'Buscar peça ou serviço (garantia)': return relatorioGarantia_(centro, categoria, placa, termo);
    case 'Evolução mensal por natureza': return relatorioEvolucao_(L_.TIPO, placa);
    case 'Evolução mensal por centro de custo': return relatorioEvolucao_(L_.CENTRO, placa);
    case 'Extrato de lançamentos do período': return relatorioExtrato_(centro, categoria, placa);
    case 'Ativos do período (Oficina Ativo e Plotagem)': return relatorioAtivos_(centro, categoria, placa);
    default: return { colunas: [], linhas: [], mensagem: 'Relatório desconhecido.' };
  }
}

function filtrarResumo_(centro, categoria, placa) {
  return lerResumo_().filter(function (l) {
    if (centro && String(l[R_.CENTRO]) !== centro) return false;
    if (categoria && String(l[R_.CATEGORIA]) !== categoria) return false;
    if (placa && normalizaPlaca_(l[R_.PLACA]) !== placa) return false;
    return true;
  });
}

function somarColunas_(linhas, indices) {
  const totais = [];
  indices.forEach(function (indice) {
    totais.push(indice === null ? null : linhas.reduce(function (soma, l) {
      return soma + (Number(l[indice]) || 0);
    }, 0));
  });
  return totais;
}

function relatorioGerencial_(centro, categoria, placa) {
  const dados = filtrarResumo_(centro, categoria, placa).sort(function (a, b) {
    const ca = String(a[R_.CENTRO]), cb = String(b[R_.CENTRO]);
    if (ca !== cb) return ca < cb ? -1 : 1;
    return Number(b[R_.TOTAL]) - Number(a[R_.TOTAL]);
  });
  return {
    colunas: [col_('Centro de Custo'), col_('Placa'), col_('Veículo'), col_('Categoria'),
      col_('Combustível', 'moeda'), col_('Oficina', 'moeda'), col_('Pneus', 'moeda'),
      col_('Arla', 'moeda'), col_('Gás', 'moeda'), col_('Diária/Pedágio', 'moeda'), col_('IPVA (1/12)', 'moeda'),
      col_('Depreciação', 'moeda'),
      col_('KM', 'numero'), col_('TOTAL', 'moeda')],
    linhas: dados.map(function (l) {
      return [l[R_.CENTRO], l[R_.PLACA], l[R_.DESCRICAO], l[R_.CATEGORIA],
        l[R_.COMBUSTIVEL], l[R_.OFICINA], l[R_.PNEUS], l[R_.ARLA], l[R_.GAS] || 0, l[R_.PEDAGIO],
        l[R_.IPVA], l[R_.DEPRECIACAO], l[R_.KM], l[R_.TOTAL]];
    }),
    totais: [null, null, null, null].concat(
      somarColunas_(dados, [R_.COMBUSTIVEL, R_.OFICINA, R_.PNEUS, R_.ARLA, R_.GAS, R_.PEDAGIO,
        R_.IPVA, R_.DEPRECIACAO, R_.KM, R_.TOTAL])),
  };
}

function relatorioManutencao_(centro, categoria, placa) {
  const dados = filtrarResumo_(centro, categoria, placa)
    .map(function (l) {
      const manutencao = (Number(l[R_.OFICINA]) || 0) + (Number(l[R_.PNEUS]) || 0);
      return { linha: l, manutencao: manutencao };
    })
    .filter(function (item) { return item.manutencao > 0; })
    .sort(function (a, b) { return b.manutencao - a.manutencao; });

  const total = dados.reduce(function (soma, item) { return soma + item.manutencao; }, 0);
  return {
    colunas: [col_('Placa'), col_('Veículo'), col_('Categoria'), col_('Centro de Custo'),
      col_('Oficina', 'moeda'), col_('Pneus', 'moeda'), col_('Manutenção', 'moeda'),
      col_('IPVA (1/12)', 'moeda'), col_('KM', 'numero'), col_('% do custo', 'decimal')],
    linhas: dados.map(function (item) {
      const l = item.linha;
      const custo = Number(l[R_.TOTAL]) || 0;
      return [l[R_.PLACA], l[R_.DESCRICAO], l[R_.CATEGORIA], l[R_.CENTRO],
        l[R_.OFICINA], l[R_.PNEUS], item.manutencao, l[R_.IPVA], l[R_.KM],
        custo > 0 ? (item.manutencao / custo) * 100 : 0];
    }),
    totais: [null, null, null, null,
      somarColunas_(dados.map(function (i) { return i.linha; }), [R_.OFICINA])[0],
      somarColunas_(dados.map(function (i) { return i.linha; }), [R_.PNEUS])[0],
      total,
      somarColunas_(dados.map(function (i) { return i.linha; }), [R_.IPVA])[0],
      somarColunas_(dados.map(function (i) { return i.linha; }), [R_.KM])[0],
      null],
  };
}

function relatorioAbastecimento_(centro, categoria, placa) {
  const dados = filtrarResumo_(centro, categoria, placa)
    .filter(function (l) { return Number(l[R_.LITROS]) > 0; })
    .sort(function (a, b) { return Number(b[R_.COMBUSTIVEL]) - Number(a[R_.COMBUSTIVEL]); });
  return {
    colunas: [col_('Placa'), col_('Veículo'), col_('Categoria'), col_('Litros', 'decimal'),
      col_('Valor', 'moeda'), col_('Preço/litro', 'moeda3'), col_('KM', 'numero'),
      col_('KM/litro', 'decimal'), col_('R$/KM', 'moeda3'), col_('IPVA (1/12)', 'moeda')],
    linhas: dados.map(function (l) {
      const litros = Number(l[R_.LITROS]) || 0;
      const valor = Number(l[R_.COMBUSTIVEL]) || 0;
      return [l[R_.PLACA], l[R_.DESCRICAO], l[R_.CATEGORIA], litros, valor,
        litros > 0 ? valor / litros : 0, l[R_.KM], l[R_.KM_LITRO], l[R_.RS_KM],
        l[R_.IPVA]];
    }),
    // Item 6 do escopo: a media GERAL da frota. Tem de ser KM total / litros totais.
    // Media das medias daria outro numero: um carro de passeio que rodou 200 km
    // pesaria igual a um caminhao que rodou 20.000. Antes as tres celulas de media
    // vinham nulas no rodape.
    totais: (function () {
      const litros = somarColunas_(dados, [R_.LITROS])[0];
      const valor = somarColunas_(dados, [R_.COMBUSTIVEL])[0];
      const km = somarColunas_(dados, [R_.KM])[0];
      return [null, null, null, litros, valor,
        litros > 0 ? valor / litros : 0, km,
        litros > 0 ? km / litros : 0, km > 0 ? valor / km : 0,
        somarColunas_(dados, [R_.IPVA])[0]];
    })(),
  };
}

/**
 * Item 8 do escopo: relatorio de IPVA.
 *
 * Mostra o valor ANUAL do cadastro ao lado do 1/12 que entrou no periodo, para a
 * conferencia ser direta: o mapa cobra um doze avos, e aqui se ve de onde ele saiu.
 */
/**
 * Manutencao realizada por veiculo: o que foi feito, de que natureza e em que peca.
 *
 * Difere do "Detalhamento de oficina" em duas coisas que importam:
 *   - cobre a BASE INTEIRA, nao so o periodo aberto. "O que ja foi feito neste
 *     carro" e pergunta da vida do ativo, nao do mes;
 *   - agrupa por veiculo (do que mais consumiu para o que menos) e traz o
 *     subtotal por natureza dentro de cada um, que e onde aparece o padrao:
 *     tres embreagens no mesmo veiculo em seis meses.
 *
 * Pneus entra junto com oficina porque e manutencao; como o tipo nao tem campo de
 * natureza, ele recebe a natureza 'Pneus' em vez de aparecer como nao informado.
 */
function relatorioManutencaoVeiculo_(centro, categoria, placa, incluirPneus) {
  const veiculos = mapaVeiculosPorPlaca_();
  const alvo = placa ? normalizaPlaca_(placa) : '';
  // Pneu e manutencao, mas nao e servico de oficina: quem esta analisando a
  // oficina quer ver mao de obra e peca, e o pneu domina o valor e distorce a
  // leitura. Por isso os dois recortes existem separados.
  const tiposManutencao = incluirPneus === false
    ? TIPOS_OFICINA.slice() : TIPOS_OFICINA.concat(['Pneus']);

  const dados = lerLancamentos_().filter(function (l) {
    if (tiposManutencao.indexOf(String(l[L_.TIPO])) === -1) return false;
    if (centro && String(l[L_.CENTRO]) !== centro) return false;
    if (categoria && String(l[L_.CATEGORIA]) !== categoria) return false;
    if (alvo && normalizaPlaca_(l[L_.PLACA]) !== alvo) return false;
    return true;
  });

  // Agrupa por veiculo para poder ordenar os blocos por gasto.
  const porPlaca = {};
  dados.forEach(function (l) {
    const p = normalizaPlaca_(l[L_.PLACA]);
    if (!porPlaca[p]) {
      const v = veiculos[p] || {};
      porPlaca[p] = { placa: l[L_.PLACA], descricao: v.descricao || '',
        itens: [], total: 0, naturezas: {} };
    }
    const valor = Number(l[L_.VALOR]) || 0;
    const natureza = String(l[L_.TIPO]) === 'Pneus'
      ? 'Pneus'
      : (String(l[L_.NATUREZA_OFICINA] || '').trim() || '(não informado)');
    porPlaca[p].itens.push({ linha: l, natureza: natureza, valor: valor });
    porPlaca[p].total += valor;
    porPlaca[p].naturezas[natureza] = (porPlaca[p].naturezas[natureza] || 0) + valor;
  });

  const ordenados = Object.keys(porPlaca)
    .map(function (p) { return porPlaca[p]; })
    .sort(function (a, b) { return b.total - a.total; });

  const linhas = [];
  ordenados.forEach(function (v) {
    // Cabecalho do bloco: identifica o veiculo e ja entrega o consolidado.
    linhas.push([
      (v.placa + (v.descricao ? ' — ' + v.descricao : '')).toUpperCase(),
      '', v.itens.length + ' serviço(s)', '',
      Object.keys(v.naturezas).sort(function (a, b) {
        return v.naturezas[b] - v.naturezas[a];
      })[0] || '',
      '', '', v.total,
    ]);
    v.itens
      .sort(function (a, b) { return b.linha[L_.DATA] - a.linha[L_.DATA]; })
      .forEach(function (i) {
        const l = i.linha;
        linhas.push([
          '', formatarData_(l[L_.DATA]), String(l[L_.TIPO]), i.natureza,
          String(l[L_.DETALHE_OFICINA] || '') || '(sem descrição)',
          String(l[L_.FORNECEDOR] || ''), String(l[L_.DOCUMENTO] || ''), i.valor,
        ]);
      });
  });

  return {
    colunas: [col_('Veículo'), col_('Data', 'data'), col_('Tipo de Despesa'),
      col_('Serviço / Natureza'), col_('Peça ou serviço realizado'),
      col_('Fornecedor'), col_('NF / OS'), col_('Valor', 'moeda')],
    linhas: linhas,
    totais: [null, null, null, null, null, null, null,
      dados.reduce(function (t, l) { return t + (Number(l[L_.VALOR]) || 0); }, 0)],
    porVeiculo: ordenados.map(function (v) {
      return { placa: v.placa, descricao: v.descricao, itens: v.itens.length,
        valor: v.total,
        naturezaPrincipal: Object.keys(v.naturezas).sort(function (a, b) {
          return v.naturezas[b] - v.naturezas[a];
        })[0] || '' };
    }),
    mensagem: ordenados.length + ' veículo(s) • ' + dados.length + ' serviço(s) ' +
      (incluirPneus === false ? 'de oficina ' : 'de oficina e pneus ') +
      'em toda a base (não apenas o período aberto).',
  };
}

/** Cadastro indexado por placa normalizada — usado pelos relatorios de manutencao. */
function mapaVeiculosPorPlaca_() {
  const mapa = {};
  dadosVeiculosExecucao_().forEach(function (v) {
    mapa[normalizaPlaca_(v[COL_VEIC.PLACA - 1])] = {
      descricao: String(v[COL_VEIC.DESCRICAO - 1] || ''),
      patrimonio: String(v[COL_VEIC.CODIGO - 1] || ''),
      categoria: String(v[COL_VEIC.CATEGORIA - 1] || ''),
      // centro entrou na V4.8.7: o historico de KM filtra por centro, e sem este
      // campo o filtro passaria batido — nao daria erro, simplesmente nao filtraria.
      centro: normalizarCentroCusto_(v[COL_VEIC.CENTRO - 1]),
    };
  });
  return mapa;
}

/**
 * Busca de peca ou servico — para achar a NF e acionar garantia.
 *
 * A pergunta que este relatorio responde: "trocaram o alternador desse caminhao
 * ha quatro meses, qual foi a nota?". Nenhum relatorio anterior servia: o
 * detalhamento de oficina cobre so o periodo aberto, e os demais nao procuram
 * dentro do texto da peca.
 *
 * Procura em natureza, detalhe da peca, fornecedor e numero do documento, na base
 * INTEIRA. Ordena do mais recente para o mais antigo, que e a ordem de quem esta
 * conferindo prazo de garantia.
 *
 * A coluna "Há quanto tempo" existe porque garantia se conta em dias, e obrigar
 * alguem a subtrair datas de cabeca e como se perde prazo.
 */
function relatorioGarantia_(centro, categoria, placa, termo) {
  const busca = String(termo || '').trim().toUpperCase();
  if (!busca) {
    return {
      colunas: [], linhas: [],
      mensagem: 'Digite a peça ou o serviço que você procura — por exemplo "alternador", ' +
        '"embreagem" ou "pastilha". A busca varre toda a base, não só o período aberto.',
    };
  }

  const veiculos = mapaVeiculosPorPlaca_();
  const alvo = placa ? normalizaPlaca_(placa) : '';
  const hoje = new Date();
  const tiposManutencao = TIPOS_OFICINA.concat(['Pneus']);

  const dados = lerLancamentos_().filter(function (l) {
    if (tiposManutencao.indexOf(String(l[L_.TIPO])) === -1) return false;
    if (centro && String(l[L_.CENTRO]) !== centro) return false;
    if (categoria && String(l[L_.CATEGORIA]) !== categoria) return false;
    if (alvo && normalizaPlaca_(l[L_.PLACA]) !== alvo) return false;
    // Um so campo concatenado: quem procura "alternador" nao quer decidir se a
    // palavra estava na natureza, no detalhe ou na descricao do fornecedor.
    const texto = [
      l[L_.NATUREZA_OFICINA], l[L_.DETALHE_OFICINA],
      l[L_.FORNECEDOR], l[L_.DOCUMENTO], l[L_.OBSERVACAO],
    ].join(' ').toUpperCase();
    return texto.indexOf(busca) !== -1;
  }).sort(function (a, b) { return b[L_.DATA] - a[L_.DATA]; });

  return {
    colunas: [col_('Data', 'data'), col_('Há quanto tempo'), col_('Placa'), col_('Veículo'),
      col_('Serviço / Natureza'), col_('Peça ou serviço realizado'), col_('Fornecedor'),
      col_('NF / OS'), col_('Valor', 'moeda'), col_('ID Lançamento')],
    linhas: dados.map(function (l) {
      const data = l[L_.DATA];
      const dias = data instanceof Date
        ? Math.floor((hoje - data) / 86400000) : null;
      const p = normalizaPlaca_(l[L_.PLACA]);
      return [
        formatarData_(data),
        dias === null ? '' : (dias < 1 ? 'hoje' : dias + ' dia(s)'),
        l[L_.PLACA], (veiculos[p] || {}).descricao || '',
        String(l[L_.NATUREZA_OFICINA] || '') || (String(l[L_.TIPO]) === 'Pneus' ? 'Pneus' : ''),
        String(l[L_.DETALHE_OFICINA] || '') || '(sem descrição)',
        String(l[L_.FORNECEDOR] || ''),
        String(l[L_.DOCUMENTO] || '') || '(sem NF)',
        Number(l[L_.VALOR]) || 0,
        String(l[L_.ID] || ''),
      ];
    }),
    totais: [null, null, null, null, null, null, null, null,
      dados.reduce(function (t, l) { return t + (Number(l[L_.VALOR]) || 0); }, 0), null],
    mensagem: dados.length
      ? dados.length + ' ocorrência(s) de "' + termo + '" em toda a base. ' +
        'A coluna NF / OS é o documento para acionar a garantia.'
      : 'Nada encontrado para "' + termo + '". A busca cobre natureza, peça/serviço, ' +
        'fornecedor, NF e observação de todos os lançamentos de oficina e pneus.',
  };
}

/**
 * IPVA do periodo e o total ja lancado em parcelas.
 *
 * Antes isto lia o valor anual do CADASTRO. Desde a V4.8.7 o IPVA e despesa
 * lancada, entao o anual mostrado aqui e a soma das parcelas de verdade — o que
 * permite ver quem tem IPVA pela metade (lancado so parte do ano).
 */
function relatorioIpva_(centro, categoria, placa) {
  const dados = filtrarResumo_(centro, categoria, placa)
    .filter(function (l) { return Number(l[R_.IPVA]) > 0; })
    .sort(function (a, b) { return Number(b[R_.IPVA]) - Number(a[R_.IPVA]); });

  const lancadoPorPlaca = {};
  const parcelasPorPlaca = {};
  lerLancamentos_().forEach(function (l) {
    if (String(l[L_.TIPO] || '').trim() !== 'IPVA') return;
    const p = normalizaPlaca_(l[L_.PLACA]);
    lancadoPorPlaca[p] = (lancadoPorPlaca[p] || 0) + (Number(l[L_.VALOR]) || 0);
    parcelasPorPlaca[p] = (parcelasPorPlaca[p] || 0) + 1;
  });

  return {
    colunas: [col_('Placa'), col_('Veículo'), col_('Categoria'), col_('Centro de Custo'),
      col_('Total lançado', 'moeda'), col_('Parcelas', 'numero'),
      col_('IPVA no período', 'moeda'), col_('% do custo do veículo', 'decimal')],
    linhas: dados.map(function (l) {
      const p = normalizaPlaca_(l[R_.PLACA]);
      const mensal = Number(l[R_.IPVA]) || 0;
      const total = Number(l[R_.TOTAL]) || 0;
      return [l[R_.PLACA], l[R_.DESCRICAO], l[R_.CATEGORIA], l[R_.CENTRO],
        lancadoPorPlaca[p] || 0, parcelasPorPlaca[p] || 0, mensal,
        total > 0 ? (mensal / total) * 100 : 0];
    }),
    totais: [null, null, null, null,
      dados.reduce(function (t, l) {
        return t + (lancadoPorPlaca[normalizaPlaca_(l[R_.PLACA])] || 0);
      }, 0),
      dados.reduce(function (t, l) {
        return t + (parcelasPorPlaca[normalizaPlaca_(l[R_.PLACA])] || 0);
      }, 0),
      somarColunas_(dados, [R_.IPVA])[0], null],
    mensagem: dados.length + ' veículo(s) com IPVA no período. ' +
      'O IPVA entra como despesa lançada em 12 parcelas — use "Lançar IPVA anual".',
  };
}
/**
 * Historico de KM por veiculo (V4.8.7).
 *
 * A aba Odometro sempre teve os dados e nunca teve relatorio: so dava para ver
 * a ultima leitura, nunca a serie. Aqui cada leitura aparece com o que rodou
 * desde a anterior, em quantos dias e a media diaria.
 *
 * Cobre a base INTEIRA, nao o periodo aberto: a pergunta "quanto esse caminhao
 * rodou" e sobre a vida do veiculo.
 *
 * Leitura que RETROCEDE e marcada. Hoje isso so aparece como pendencia no
 * fechamento, e ali nao se ve ONDE a serie quebrou — que e o que permite
 * corrigir a leitura certa em vez de forcar a proxima.
 */
function relatorioHistoricoKm_(centro, categoria, placa) {
  const veiculos = mapaVeiculosPorPlaca_();
  const alvo = placa ? normalizaPlaca_(placa) : '';
  const sheet = ss_().getSheetByName(ABAS.ODOMETRO);
  if (!sheet || sheet.getLastRow() < 2) {
    return { colunas: [], linhas: [], mensagem: 'Nenhuma leitura de odômetro registrada.' };
  }

  const porPlaca = {};
  lerOdometro_().forEach(function (l) {
    const data = l[0];
    const km = Number(l[2]);
    if (!(data instanceof Date) || isNaN(data.getTime())) return;
    if (!isFinite(km) || km <= 0) return;
    const p = normalizaPlaca_(l[1]);
    if (!p) return;
    if (alvo && p !== alvo) return;
    const v = veiculos[p] || {};
    if (centro && String(v.centro || '') !== centro) return;
    if (categoria && String(v.categoria || '') !== categoria) return;
    if (!porPlaca[p]) {
      porPlaca[p] = { placa: String(l[1]), descricao: v.descricao || '', leituras: [] };
    }
    porPlaca[p].leituras.push({ data: data, km: km });
  });

  const ordenados = Object.keys(porPlaca).map(function (p) {
    const v = porPlaca[p];
    // Ordem CRESCENTE para calcular os deltas; a exibicao inverte depois.
    v.leituras.sort(function (a, b) { return a.data - b.data; });
    let anterior = null;
    v.leituras.forEach(function (r) {
      r.rodou = anterior === null ? null : r.km - anterior.km;
      r.dias = anterior === null
        ? null : Math.round((r.data - anterior.data) / 86400000);
      r.retrocedeu = r.rodou !== null && r.rodou < 0;
      anterior = r;
    });
    const primeira = v.leituras[0];
    const ultima = v.leituras[v.leituras.length - 1];
    v.total = v.leituras.length > 1 ? ultima.km - primeira.km : 0;
    v.quebras = v.leituras.filter(function (r) { return r.retrocedeu; }).length;
    return v;
  }).sort(function (a, b) { return b.total - a.total; });

  const linhas = [];
  let quebrasTotais = 0;
  ordenados.forEach(function (v) {
    quebrasTotais += v.quebras;
    linhas.push([
      (v.placa + (v.descricao ? ' — ' + v.descricao : '')).toUpperCase(),
      '', v.leituras.length + ' leitura(s)', '', '',
      v.quebras ? '⚠ ' + v.quebras + ' leitura(s) menor(es) que a anterior' : '',
      v.total,
    ]);
    v.leituras.slice().reverse().forEach(function (r) {
      linhas.push([
        '', formatarData_(r.data), r.km,
        r.rodou === null ? '' : r.rodou,
        r.dias === null ? '' : r.dias,
        r.dias && r.rodou !== null && r.dias > 0 ? r.rodou / r.dias : '',
        r.retrocedeu ? '⚠ retrocedeu' : '',
      ]);
    });
  });

  return {
    colunas: [col_('Veículo'), col_('Data', 'data'), col_('Leitura (KM)', 'numero'),
      col_('Rodou desde a anterior', 'numero'), col_('Dias', 'numero'),
      col_('KM/dia', 'decimal'), col_('Observação')],
    linhas: linhas,
    mensagem: ordenados.length + ' veículo(s) • ' +
      ordenados.reduce(function (t, v) { return t + v.leituras.length; }, 0) +
      ' leitura(s) em toda a base' +
      (quebrasTotais ? ' • ' + quebrasTotais + ' leitura(s) menor(es) que a anterior, ' +
        'marcadas na última coluna' : '') + '.',
  };
}


function relatorioRanking_(centro, categoria, placa) {
  const dados = filtrarResumo_(centro, categoria, placa)
    .filter(function (l) { return Number(l[R_.KM]) > 0; })
    .sort(function (a, b) { return Number(b[R_.RS_KM]) - Number(a[R_.RS_KM]); });
  return {
    colunas: [col_('Placa'), col_('Veículo'), col_('Categoria'), col_('Centro de Custo'),
      col_('KM', 'numero'), col_('IPVA (1/12)', 'moeda'),
      col_('Custo total', 'moeda'), col_('R$/KM', 'moeda3')],
    linhas: dados.map(function (l) {
      return [l[R_.PLACA], l[R_.DESCRICAO], l[R_.CATEGORIA], l[R_.CENTRO],
        l[R_.KM], l[R_.IPVA], l[R_.TOTAL], l[R_.RS_KM]];
    }),
    totais: [null, null, null, null].concat(
      somarColunas_(dados, [R_.KM, R_.IPVA, R_.TOTAL, null])),
  };
}

/** Pivot: um período por linha, uma categoria (tipo ou centro) por coluna. */
function relatorioEvolucao_(indiceColuna, placa) {
  const lancamentos = lerLancamentos_();
  const periodos = {};
  const categorias = {};

  lancamentos.forEach(function (l) {
    if (placa && normalizaPlaca_(l[L_.PLACA]) !== placa) return;
    const periodo = String(l[L_.PERIODO] || '');
    const chave = String(l[indiceColuna] || '(sem classificação)');
    if (!periodo) return;
    // mesmo critério do Resumo: imobilizado não é custo da frota
    if (TIPOS_FORA_DO_CUSTO.indexOf(String(l[L_.TIPO])) !== -1) return;
    if (!periodos[periodo]) periodos[periodo] = {};
    periodos[periodo][chave] = (periodos[periodo][chave] || 0) + (Number(l[L_.VALOR]) || 0);
    categorias[chave] = (categorias[chave] || 0) + (Number(l[L_.VALOR]) || 0);
  });

  const nomes = Object.keys(categorias).sort(function (a, b) {
    return categorias[b] - categorias[a];
  });
  const meses = Object.keys(periodos).sort();

  return {
    colunas: [col_('Período')].concat(nomes.map(function (n) { return col_(n, 'moeda'); }))
      .concat([col_('TOTAL', 'moeda')]),
    linhas: meses.map(function (mes) {
      const linha = [mes];
      let total = 0;
      nomes.forEach(function (nome) {
        const valor = periodos[mes][nome] || 0;
        linha.push(valor);
        total += valor;
      });
      linha.push(total);
      return linha;
    }),
    totais: [null].concat(nomes.map(function (n) { return categorias[n]; }))
      .concat([nomes.reduce(function (s, n) { return s + categorias[n]; }, 0)]),
  };
}

function relatorioDetalhamentoOficina_(centro, categoria, placa) {
  const periodo = periodoAtual_();
  const veiculos = {};
  dadosVeiculosExecucao_().forEach(function(v) {
    const p = normalizaPlaca_(v[COL_VEIC.PLACA - 1]);
    if (p) veiculos[p] = { patrimonio: String(v[COL_VEIC.CODIGO - 1] || ''), descricao: String(v[COL_VEIC.DESCRICAO - 1] || '') };
  });
  const dados = lerLancamentos_().filter(function(l) {
    const data = l[L_.DATA];
    if (!(data instanceof Date) || data < periodo.inicio || data > periodo.fim) return false;
    if (TIPOS_OFICINA.indexOf(String(l[L_.TIPO])) === -1) return false;
    if (centro && String(l[L_.CENTRO]) !== centro) return false;
    if (categoria && String(l[L_.CATEGORIA]) !== categoria) return false;
    if (placa && normalizaPlaca_(l[L_.PLACA]) !== placa) return false;
    return true;
  }).sort(function(a,b){ return b[L_.DATA] - a[L_.DATA]; });
  return {
    colunas: [col_('Data','data'), col_('Placa'), col_('Patrimônio'), col_('Veículo'), col_('Tipo de Despesa'),
      col_('Natureza da Oficina'), col_('Detalhe da Peça / Serviço'), col_('NF / Documento / OS'),
      col_('Valor','moeda'), col_('Centro de Custo'), col_('ID Lançamento')],
    linhas: dados.map(function(l) {
      const v = veiculos[normalizaPlaca_(l[L_.PLACA])] || {};
      return [formatarData_(l[L_.DATA]), l[L_.PLACA], v.patrimonio || '', v.descricao || '', l[L_.TIPO],
        l[L_.NATUREZA_OFICINA] || '(não informado)', l[L_.DETALHE_OFICINA] || '(não informado)',
        l[L_.DOCUMENTO] || '', l[L_.VALOR], l[L_.CENTRO], l[L_.ID]];
    }),
    // O rótulo "TOTAL" é posto pelo renderizador na coluna 0 quando ela vem nula.
    // Repeti-lo aqui produzia dois "TOTAL" no rodapé — os outros 7 relatórios
    // deixam a coluna 0 nula e só trazem os números.
    totais: [null,null,null,null,null,null,null,null,
      dados.reduce(function(s,l){return s+(Number(l[L_.VALOR])||0);},0),null,null],
    // Item 10: alem das linhas, o gasto consolidado por veiculo. Sem isto a
    // pergunta "qual veiculo esta consumindo oficina" so se responde somando a mao.
    porVeiculo: (function () {
      const acumulado = {};
      dados.forEach(function (l) {
        const p = normalizaPlaca_(l[L_.PLACA]);
        if (!acumulado[p]) {
          const v = veiculos[p] || {};
          acumulado[p] = { placa: l[L_.PLACA], descricao: v.descricao || '',
            itens: 0, valor: 0, naturezas: {} };
        }
        acumulado[p].itens++;
        acumulado[p].valor += Number(l[L_.VALOR]) || 0;
        const nat = String(l[L_.NATUREZA_OFICINA] || '(não informado)');
        acumulado[p].naturezas[nat] = (acumulado[p].naturezas[nat] || 0) + (Number(l[L_.VALOR]) || 0);
      });
      return Object.keys(acumulado)
        .map(function (p) {
          const a = acumulado[p];
          // natureza que mais pesou no veiculo: e o que orienta a proxima acao
          const principal = Object.keys(a.naturezas).sort(function (x, y) {
            return a.naturezas[y] - a.naturezas[x];
          })[0] || '';
          return { placa: a.placa, descricao: a.descricao, itens: a.itens,
            valor: a.valor, naturezaPrincipal: principal };
        })
        .sort(function (x, y) { return y.valor - x.valor; });
    })(),
    mensagem: dados.length + ' despesa(s) de oficina encontrada(s).'
  };
}

function relatorioExtrato_(centro, categoria, placa) {
  const periodo = periodoAtual_();
  const dados = lerLancamentos_()
    .filter(function (l) {
      const data = l[L_.DATA];
      if (!(data instanceof Date) || data < periodo.inicio || data > periodo.fim) return false;
      if (centro && String(l[L_.CENTRO]) !== centro) return false;
      if (categoria && String(l[L_.CATEGORIA]) !== categoria) return false;
      if (placa && normalizaPlaca_(l[L_.PLACA]) !== placa) return false;
      return true;
    })
    .sort(function (a, b) { return b[L_.DATA] - a[L_.DATA]; });

  return {
    colunas: [col_('Data', 'data'), col_('Placa'), col_('Categoria'), col_('Tipo de Despesa'),
      col_('Natureza da Oficina'), col_('Detalhe da Peça / Serviço'), col_('Litros', 'decimal'),
      col_('Valor', 'moeda'), col_('Centro de Custo'), col_('Fornecedor'), col_('NF / Documento / OS'), col_('ID Lançamento')],
    linhas: dados.map(function (l) {
      return [formatarData_(l[L_.DATA]), l[L_.PLACA], l[L_.CATEGORIA], l[L_.TIPO],
        l[L_.NATUREZA_OFICINA], l[L_.DETALHE_OFICINA], l[L_.LITROS], l[L_.VALOR],
        l[L_.CENTRO], l[L_.FORNECEDOR] || '', l[L_.DOCUMENTO], l[L_.ID]];
    }),
    totais: [null, null, null, null, null, null,
      dados.reduce(function (s, l) { return s + (Number(l[L_.LITROS]) || 0); }, 0),
      dados.reduce(function (s, l) { return s + (Number(l[L_.VALOR]) || 0); }, 0),
      null, null, null, null],
  };
}

/** V4.8: ativos (imobilizado) lançados no período aberto — Oficina Ativo e Plotagem. */
function relatorioAtivos_(centro, categoria, placa) {
  const periodo = periodoAtual_();
  const dados = lerLancamentos_()
    .filter(function (l) {
      const data = l[L_.DATA];
      if (!(data instanceof Date) || data < periodo.inicio || data > periodo.fim) return false;
      if (TIPOS_ATIVO.indexOf(String(l[L_.TIPO])) === -1) return false;
      if (centro && String(l[L_.CENTRO]) !== centro) return false;
      if (categoria && String(l[L_.CATEGORIA]) !== categoria) return false;
      if (placa && normalizaPlaca_(l[L_.PLACA]) !== placa) return false;
      return true;
    })
    .sort(function (a, b) { return b[L_.DATA] - a[L_.DATA]; });
  const porTipo = {};
  dados.forEach(function (l) {
    const t = String(l[L_.TIPO]);
    porTipo[t] = (porTipo[t] || 0) + (Number(l[L_.VALOR]) || 0);
  });
  return {
    colunas: [col_('Data', 'data'), col_('Placa'), col_('Tipo de Despesa'), col_('Detalhe'),
      col_('Fornecedor'), col_('NF / Documento'), col_('Valor', 'moeda'), col_('Centro de Custo'),
      col_('Categoria'), col_('ID Lançamento')],
    linhas: dados.map(function (l) {
      return [formatarData_(l[L_.DATA]), l[L_.PLACA], l[L_.TIPO],
        String(l[L_.DETALHE_OFICINA] || l[L_.OBSERVACAO] || ''), l[L_.FORNECEDOR] || '',
        l[L_.DOCUMENTO], l[L_.VALOR], l[L_.CENTRO], l[L_.CATEGORIA], l[L_.ID]];
    }),
    totais: [null, null, null, null, null, null,
      dados.reduce(function (s, l) { return s + (Number(l[L_.VALOR]) || 0); }, 0), null, null, null],
    mensagem: Object.keys(porTipo).map(function (t) {
      return t + ': R$ ' + porTipo[t].toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    }).join(' • ') || 'Nenhum ativo lançado no período.',
  };
}

// ------------------------------------------------------- resumo e rateio

function webResumo(token, filtros) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  filtros = filtros || {};
  const centro = filtros.centro && filtros.centro !== 'TODOS' ? filtros.centro : null;
  const categoria = filtros.categoria && filtros.categoria !== 'TODAS' ? filtros.categoria : null;
  const dados = filtrarResumo_(centro, categoria)
    .sort(function (a, b) { return Number(b[R_.TOTAL]) - Number(a[R_.TOTAL]); });
  const qtdVeiculos = dadosVeiculosExecucao_().filter(function (v) { return String(v[COL_VEIC.PLACA - 1] || '').trim(); }).length;
  const mensagemVazio = !qtdVeiculos
    ? 'A aba Veículos está vazia — nenhum veículo cadastrado. Se eles foram apagados pelo "Zerar sistema" na opção TUDO, ' +
      'restaure o backup "antes de zerar o sistema" em Saúde do sistema.'
    : 'Nenhum veículo para o centro/categoria escolhidos.';

  return {
    colunas: [col_('Placa'), col_('Veículo'), col_('Centro de Custo'),
      col_('Combustível', 'moeda'), col_('Oficina', 'moeda'), col_('Pneus', 'moeda'),
      col_('Arla', 'moeda'), col_('Gás', 'moeda'), col_('Pedágio', 'moeda'), col_('IPVA (1/12)', 'moeda'),
      col_('Depreciação', 'moeda'), col_('KM', 'numero'),
      col_('R$/KM', 'moeda3'), col_('TOTAL', 'moeda')],
    linhas: dados.map(function (l) {
      return [l[R_.PLACA], l[R_.DESCRICAO], l[R_.CENTRO], l[R_.COMBUSTIVEL],
        l[R_.OFICINA], l[R_.PNEUS], l[R_.ARLA], l[R_.GAS] || 0, l[R_.PEDAGIO], l[R_.IPVA],
        l[R_.DEPRECIACAO], l[R_.KM], l[R_.RS_KM], l[R_.TOTAL]];
    }),
    totais: [null, null, null].concat(
      somarColunas_(dados, [R_.COMBUSTIVEL, R_.OFICINA, R_.PNEUS, R_.ARLA, R_.GAS, R_.PEDAGIO,
        R_.IPVA, R_.DEPRECIACAO, R_.KM, null, R_.TOTAL])),
    mensagem: dados.length ? '' : mensagemVazio,
  };
}

// ============================================================ V4.9: rateio por competência
/**
 * Por que esta aba existe.
 *
 * Ate a V4.8 o percentual de rateio vivia em UMA coluna da aba Centros de Custo:
 * o valor corrente, sobrescrito a cada alteracao. Como o operador ajusta os
 * percentuais todo mes antes de fechar, no instante em que ele mexia no % de
 * novembro o rateio de OUTUBRO passava a ser recalculado com os numeros de
 * novembro — e ninguem percebia, porque o TOTAL continua fechando. So a divisao
 * entre as lojas mudava. O proprio codigo ja admitia o vao, em
 * rateioExportacaoPeriodo_: "rateio percentual historico exato so existe quando
 * a exportacao e criada durante a competencia".
 *
 * Agora cada competencia guarda seu proprio bloco de percentuais. A aba Centros
 * continua existindo e continua sendo a fonte das FORMULAS da planilha (aba
 * Rateio por Centro, Dashboard): gravar a competencia corrente espelha nela, de
 * modo que nada na planilha precisou ser reescrito.
 */

/**
 * Escreve o cabecalho se a aba ainda nao tiver.
 *
 * A aba e criada pelo instalador, mas nada impede uma gravacao acontecer antes
 * de o usuario rodar "Instalar / atualizar". Sem isto a aba ficaria com dados a
 * partir da linha 2 e a linha 1 em branco — funciona, mas parece defeito.
 */
function garantirCabecalhoAba_(sheet, nome) {
  const cabecalho = CABECALHOS[nome];
  if (!cabecalho) return;
  const atual = sheet.getRange(1, 1, 1, cabecalho.length).getValues()[0];
  if (String(atual[0] || '').trim()) return;
  sheet.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
}

const COL_RM = { COMPETENCIA: 1, CENTRO: 2, PERCENTUAL: 3, RECEBE: 4, ATUALIZADO: 5, RESPONSAVEL: 6 };
const TOTAL_COL_RM = totalColunas_(COL_RM);

let RATEIO_MENSAL_EXEC_CACHE_ = null;

function lerRateioMensal_() {
  if (RATEIO_MENSAL_EXEC_CACHE_) return RATEIO_MENSAL_EXEC_CACHE_;
  const sheet = ss_().getSheetByName(ABAS.RATEIO_MENSAL);
  RATEIO_MENSAL_EXEC_CACHE_ = (sheet && sheet.getLastRow() >= 2)
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, TOTAL_COL_RM).getValues()
      .filter(function (l) { return l[COL_RM.COMPETENCIA - 1] && l[COL_RM.CENTRO - 1]; })
    : [];
  return RATEIO_MENSAL_EXEC_CACHE_;
}

function invalidarCacheRateioMensal_() { RATEIO_MENSAL_EXEC_CACHE_ = null; }

/** Percentuais gravados na aba Centros — a fonte corrente e o lastro de origem. */
function percentuaisDosCentros_() {
  const mapa = {};
  dadosCentrosExecucao_().forEach(function (c) {
    const nome = normalizarCentroCusto_(String(c[0] || '').trim());
    if (!nome) return;
    mapa[nome] = {
      percentual: Number(c[1]) || 0,
      recebe: String(c[2] || '').trim().toUpperCase() !== 'NAO',
    };
  });
  return mapa;
}

/**
 * Percentuais vigentes numa competencia.
 *
 * Nao grava nada ao ler. Se a competencia ainda nao tem bloco proprio, herda do
 * mes gravado mais recente ANTERIOR a ela — e, na falta de qualquer historico,
 * da aba Centros. A origem volta junto para a tela poder dizer de onde veio:
 * "herdado de 2026-09" e um aviso util, "3,83%" sozinho nao e.
 */
function percentuaisDaCompetencia_(mesRef) {
  const alvo = normalizarMesReferencia_(mesRef);
  const porMes = {};
  lerRateioMensal_().forEach(function (l) {
    const mes = normalizarMesReferencia_(l[COL_RM.COMPETENCIA - 1]);
    const nome = normalizarCentroCusto_(String(l[COL_RM.CENTRO - 1] || '').trim());
    if (!nome) return;
    (porMes[mes] || (porMes[mes] = {}))[nome] = {
      percentual: Number(l[COL_RM.PERCENTUAL - 1]) || 0,
      recebe: String(l[COL_RM.RECEBE - 1] || '').trim().toUpperCase() !== 'NAO',
    };
  });

  if (porMes[alvo]) return { percentuais: porMes[alvo], origem: alvo, proprio: true };

  const anteriores = Object.keys(porMes).filter(function (m) { return m < alvo; }).sort();
  if (anteriores.length) {
    const herdado = anteriores[anteriores.length - 1];
    return { percentuais: porMes[herdado], origem: herdado, proprio: false };
  }
  return { percentuais: percentuaisDosCentros_(), origem: 'cadastro', proprio: false };
}

/** Competencias que ja tem bloco gravado, mais recente primeiro. */
function competenciasComRateio_() {
  const vistos = {};
  lerRateioMensal_().forEach(function (l) {
    vistos[normalizarMesReferencia_(l[COL_RM.COMPETENCIA - 1])] = true;
  });
  return Object.keys(vistos).sort().reverse();
}

/**
 * Grava (substituindo) o bloco de percentuais de uma competencia.
 *
 * Reescreve a aba inteira sem as linhas daquele mes e acrescenta as novas no fim.
 * Com 200 centros x 60 meses isso e uma escrita so — bem mais barato que procurar
 * e atualizar linha a linha, e sem o risco de deixar metade do bloco antigo.
 */
function gravarPercentuaisCompetencia_(mesRef, itens, responsavel) {
  exigirExecucaoMutacao_();
  const alvo = normalizarMesReferencia_(mesRef);
  const sheet = aba_(ABAS.RATEIO_MENSAL, true);
  garantirColunas_(sheet, TOTAL_COL_RM);
  garantirCabecalhoAba_(sheet, ABAS.RATEIO_MENSAL);

  const mantidas = lerRateioMensal_().filter(function (l) {
    return normalizarMesReferencia_(l[COL_RM.COMPETENCIA - 1]) !== alvo;
  });
  const agora = new Date();
  const quem = String(responsavel || emailContextoAtual_() || 'sistema');
  const novas = itens.map(function (i) {
    const linha = new Array(TOTAL_COL_RM).fill('');
    linha[COL_RM.COMPETENCIA - 1] = alvo;
    linha[COL_RM.CENTRO - 1] = i.centro;
    linha[COL_RM.PERCENTUAL - 1] = i.percentual; // fracao (0,0383), como a aba Centros
    linha[COL_RM.RECEBE - 1] = i.recebe ? 'SIM' : 'NAO';
    linha[COL_RM.ATUALIZADO - 1] = agora;
    linha[COL_RM.RESPONSAVEL - 1] = quem;
    return linha;
  });

  const todas = mantidas.concat(novas);
  garantirLinhas_(sheet, Math.max(LINHAS_MINIMAS[ABAS.RATEIO_MENSAL], todas.length + 50));
  const ultima = sheet.getLastRow();
  if (ultima >= 2) sheet.getRange(2, 1, ultima - 1, TOTAL_COL_RM).clearContent();
  if (todas.length) {
    sheet.getRange(2, 1, todas.length, TOTAL_COL_RM).setValues(todas);
    sheet.getRange(2, COL_RM.PERCENTUAL, todas.length, 1).setNumberFormat('0.000%');
    sheet.getRange(2, COL_RM.ATUALIZADO, todas.length, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  }
  invalidarCacheRateioMensal_();
  return todas.length;
}

/**
 * Espelha os percentuais de uma competencia na aba Centros de Custo.
 *
 * So faz sentido para a competencia CORRENTE: as formulas da planilha (aba Rateio
 * por Centro, Dashboard, validarSistema_) leem Centros!B e nao sabem de competencia
 * nenhuma. Sem o espelho, a planilha mostraria um rateio e o app mostraria outro.
 */
function espelharPercentuaisNosCentros_(percentuais) {
  exigirExecucaoMutacao_();
  const sheet = aba_(ABAS.CENTROS);
  if (sheet.getLastRow() < 2) return 0;
  const n = sheet.getLastRow() - 1;
  const intervalo = sheet.getRange(2, 1, n, 3);
  const valores = intervalo.getValues();
  let alterados = 0;
  valores.forEach(function (linha) {
    const nome = normalizarCentroCusto_(String(linha[0] || '').trim());
    const novo = nome && percentuais[nome];
    if (!novo) return;
    const recebe = novo.recebe ? 'SIM' : 'NAO';
    if (Number(linha[1]) === novo.percentual && String(linha[2]).toUpperCase() === recebe) return;
    linha[1] = novo.percentual;
    linha[2] = recebe;
    alterados++;
  });
  if (alterados) {
    intervalo.setValues(valores);
    sheet.getRange(2, 2, n, 1).setNumberFormat('0.000%');
    CENTROS_EXEC_CACHE_ = null;
  }
  return alterados;
}

// ---------------------------------------------- geração da base e cache de apuração

const PROP_GERACAO_BASE_ = 'GERACAO_BASE_V4116';
const CACHE_APURACAO_PREFIXO_ = 'APUR_';
const CACHE_APURACAO_SEGUNDOS_ = 21600;   // 6 h; a geração é quem garante a validade
/** O CacheService recusa acima de 100 KB. Abaixo disso para sobrar folga. */
const LIMITE_CACHE_BYTES_ = 90000;

let GERACAO_BASE_EXEC_ = null;
let GERACAO_JA_AVANCADA_ = false;

/**
 * Numero que muda sempre que a base de lancamentos pode ter mudado.
 *
 * Serve de sufixo nas chaves de cache: em vez de sair apagando chave por chave
 * — que o CacheService nem permite, porque nao da para enumerar —, basta a
 * geracao avancar e TODAS as chaves antigas viram inalcancaveis de uma vez.
 */
function geracaoBase_() {
  if (GERACAO_BASE_EXEC_ !== null) return GERACAO_BASE_EXEC_;
  try {
    GERACAO_BASE_EXEC_ = String(
      PropertiesService.getDocumentProperties().getProperty(PROP_GERACAO_BASE_) || '0');
  } catch (e) {
    // Sem a propriedade nao da para saber se a base mudou, entao NAO SE CACHEIA.
    // A primeira versao devolvia 'sem-propriedade-' + Date.now() achando que uma
    // chave unica resolveria; duas chamadas no mesmo milissegundo geram a MESMA
    // chave, e aí o cache volta a valer sem ninguem garantir que a base nao mudou.
    // Alem disso aquilo enchia o cache de chaves inalcancaveis. Devolver nulo e
    // o fracasso seguro: lento, nunca errado.
    console.error('geração da base ilegível; apuração não será cacheada: ' + e.message);
    return null;
  }
  return GERACAO_BASE_EXEC_;
}

/** Avanca a geracao. Idempotente na execucao: 25 invalidacoes, uma escrita so. */
function avancarGeracaoBase_() {
  if (GERACAO_JA_AVANCADA_) return;
  try {
    const props = PropertiesService.getDocumentProperties();
    const nova = String((Number(props.getProperty(PROP_GERACAO_BASE_)) || 0) + 1);
    props.setProperty(PROP_GERACAO_BASE_, nova);
    GERACAO_BASE_EXEC_ = nova;
    GERACAO_JA_AVANCADA_ = true;
  } catch (e) {
    // Nao conseguiu avancar: zera o cache de execucao para a proxima leitura
    // reler a propriedade, em vez de seguir com um numero que pode estar velho.
    GERACAO_BASE_EXEC_ = null;
    console.error('avançar geração da base: ' + e.message);
  }
}

/**
 * Grava no cache dizendo ALTO quando nao consegue.
 *
 * Todos os `cache.put` do sistema estavam em `try {} catch (e) {}` mudo. Se o
 * payload passasse de 100 KB, o cache simplesmente parava de existir: o
 * aquecimento por gatilho viraria inutil e a lentidao voltaria sem nenhum
 * sinal de por que. Um log transforma regressao invisivel em linha de log.
 */
function guardarNoCache_(chave, objeto, segundos, rotulo) {
  let json;
  try { json = JSON.stringify(objeto); }
  catch (e) { console.error('cache ' + rotulo + ': não serializou — ' + e.message); return false; }
  if (json.length > LIMITE_CACHE_BYTES_) {
    console.error('cache ' + rotulo + ': ' + Math.round(json.length / 1024) +
      ' KB passa do limite de ' + Math.round(LIMITE_CACHE_BYTES_ / 1024) +
      ' KB; esta chave deixou de ser cacheada e a tela vai recalcular sempre.');
    return false;
  }
  try { CacheService.getScriptCache().put(chave, json, segundos); return true; }
  catch (e) { console.error('cache ' + rotulo + ': ' + e.message); return false; }
}

/**
 * Custo direto por centro numa competencia qualquer.
 *
 * Para a competencia corrente usa o Resumo ja calculado (barato, vem do cache).
 * Para meses passados RECALCULA com calcularLinhasResumo_, que e funcao pura
 * sobre o periodo — e o que torna o historico util em vez de apenas arquivado.
 *
 * Ressalva honesta, devolvida junto em `aproximado`: emplacamento e seguro saem
 * do cadastro ATUAL do veiculo, e veiculos excluidos do cadastro nao aparecem.
 * Despesa lancada (combustivel, oficina, IPVA, depreciacao) e exata.
 */
function custoDiretoPorCentro_(mesRef) {
  const alvo = normalizarMesReferencia_(mesRef);
  const corrente = normalizarMesReferencia_(param_('MES_REFERENCIA'));

  function somar(linhas) {
    const direto = {};
    linhas.forEach(function (l) {
      const centro = normalizarCentroCusto_(String(l[R_.CENTRO] || '').trim()) || '(sem centro)';
      direto[centro] = (direto[centro] || 0) + (Number(l[R_.TOTAL]) || 0);
    });
    return direto;
  }

  // Competência aberta: vem do Resumo, que já está calculado e cacheado.
  if (alvo === corrente) {
    return { direto: somar(lerResumo_()), aproximado: false, corrente: corrente, cacheHit: false };
  }

  // Competência passada: recalcular custa uma varredura da base inteira, e o
  // seletor de mês do Rateio e do Orçamento dispara isso a cada troca. O
  // resultado é um mapa de ~30 centros — cabe folgado no cache. A geração no
  // nome da chave garante que uma escrita em qualquer lugar invalida tudo.
  const geracao = geracaoBase_();
  const chave = geracao === null ? null : CACHE_APURACAO_PREFIXO_ + alvo + '_' + geracao;
  if (chave) {
    try {
      const bruto = CacheService.getScriptCache().get(chave);
      if (bruto) {
        return { direto: JSON.parse(bruto), aproximado: true, corrente: corrente, cacheHit: true };
      }
    } catch (e) { console.error('ler apuração do cache: ' + e.message); }
  }

  const direto = somar(calcularLinhasResumo_(periodoDoMes_(alvo)));
  if (chave) guardarNoCache_(chave, direto, CACHE_APURACAO_SEGUNDOS_, 'apuração ' + alvo);
  return { direto: direto, aproximado: true, corrente: corrente, cacheHit: false };
}

/**
 * Nucleo da apuracao do rateio de uma competencia.
 *
 * Extraido de webRateio porque o orcamento precisa EXATAMENTE do mesmo numero:
 * se cada tela somasse o seu, "realizado" e "total do centro" divergiriam e
 * ninguem saberia qual acreditar.
 */
function apurarRateio_(mesRef) {
  const alvo = normalizarMesReferencia_(mesRef || param_('MES_REFERENCIA'));
  const apuracao = custoDiretoPorCentro_(alvo);
  const direto = apuracao.direto;
  const vigente = percentuaisDaCompetencia_(alvo);
  const percentuais = vigente.percentuais;

  const base = String(param_('BASE_RATEIO')).split(',')
    .map(function (n) { return normalizarCentroCusto_(n.trim()); })
    .filter(function (n) { return n; });
  const valorBase = base.reduce(function (soma, nome) { return soma + (direto[nome] || 0); }, 0);

  // Os percentuais herdados da planilha antiga somam 100,001%. Sem normalizar,
  // o rateio distribuiria mais do que existe e nao fecharia com o Resumo.
  const nomes = Object.keys(percentuais).sort();
  const somaPercentual = nomes.reduce(function (s, n) { return s + percentuais[n].percentual; }, 0);
  const fator = somaPercentual > 0 ? 1 / somaPercentual : 0;

  const linhas = nomes.map(function (nome) {
    const percentual = percentuais[nome].percentual;
    const recebe = percentuais[nome].recebe;
    const custoDireto = direto[nome] || 0;
    const rateio = recebe ? valorBase * percentual * fator : 0;
    const distribuido = base.indexOf(nome) !== -1 ? -custoDireto : 0;
    return { centro: nome, direto: custoDireto, percentual: percentual, recebe: recebe,
      rateio: rateio, distribuido: distribuido, total: custoDireto + rateio + distribuido,
      orfao: false };
  });

  // Um veiculo cujo centro nao esta cadastrado sairia da tabela em silencio e o
  // rateio deixaria de fechar com o Resumo. Melhor mostrar a sobra do que esconde-la.
  const orfaos = Object.keys(direto).filter(function (nome) {
    return !percentuais[nome] && direto[nome];
  });
  orfaos.forEach(function (nome) {
    linhas.push({ centro: nome, direto: direto[nome], percentual: 0, recebe: false,
      rateio: 0, distribuido: 0, total: direto[nome], orfao: true });
  });

  linhas.sort(function (a, b) { return b.total - a.total; });

  return { competencia: alvo, linhas: linhas, orfaos: orfaos, valorBase: valorBase,
    somaPercentual: somaPercentual, origemPercentuais: vigente.origem,
    proprio: vigente.proprio, aproximado: apuracao.aproximado,
    cacheHit: apuracao.cacheHit === true };
}

function webRateio(token, mesRef) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const a = apurarRateio_(mesRef);

  const avisos = [avisoPercentual_(a.somaPercentual)];
  if (!a.proprio) {
    avisos.push(a.origemPercentuais === 'cadastro'
      ? '⚠ Esta competência ainda não tem percentuais próprios; está usando os da aba ' +
        ABAS.CENTROS + '. Salve na tela de centros para congelá-los aqui.'
      : '⚠ Percentuais herdados de ' + a.origemPercentuais + ' — esta competência ainda não ' +
        'tem os seus. Salve na tela de centros para congelá-los.');
  }
  if (a.aproximado) {
    avisos.push('Competência encerrada, ' +
      (a.cacheHit ? 'lida do cache' : 'recalculada a partir dos lançamentos') +
      '. Emplacamento e seguro usam o cadastro atual do veículo.');
  }
  if (a.orfaos.length) {
    avisos.push('⚠ ' + a.orfaos.length + ' centro(s) de custo aparecem nos veículos mas ' +
      'não estão cadastrados: ' + a.orfaos.join(', ') + '.');
  }

  const linhas = a.linhas.map(function (l) {
    return [l.centro + (l.orfao ? '  ⚠ não cadastrado' : ''), l.direto,
      l.percentual * 100, l.rateio, l.distribuido, l.total];
  });

  return {
    competencia: a.competencia,
    competencias: competenciasDisponiveis_(),
    origemPercentuais: a.origemPercentuais,
    colunas: [col_('Centro de Custo'), col_('Custo Direto', 'moeda'), col_('% Rateio', 'decimal'),
      col_('Rateio Recebido', 'moeda'), col_('Distribuído', 'moeda'), col_('TOTAL', 'moeda')],
    linhas: linhas,
    totais: [null,
      linhas.reduce(function (s, l) { return s + l[1]; }, 0), null,
      linhas.reduce(function (s, l) { return s + l[3]; }, 0),
      linhas.reduce(function (s, l) { return s + l[4]; }, 0),
      linhas.reduce(function (s, l) { return s + l[5]; }, 0)],
    mensagem: avisos.filter(function (x) { return x; }).join(' '),
  };
}

/** Competencias que o usuario pode escolher: as fechadas, as com rateio e a corrente. */
function competenciasDisponiveis_() {
  const vistos = {};
  const corrente = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  vistos[corrente] = true;
  competenciasComRateio_().forEach(function (m) { vistos[m] = true; });
  const hist = ss_().getSheetByName(ABAS.HISTORICO);
  if (hist && hist.getLastRow() >= 2) {
    hist.getRange(2, 1, hist.getLastRow() - 1, 1).getValues().forEach(function (l) {
      const m = String(l[0] || '').trim();
      if (/^\d{4}-\d{2}$/.test(m)) vistos[m] = true;
    });
  }
  return Object.keys(vistos).sort().reverse();
}

/**
 * Lista de centros para edicao, com o percentual VIGENTE na competencia pedida.
 *
 * A tela era so leitura e mandava "edite na planilha". Como o ajuste e mensal e
 * rotineiro, ele passou a caber aqui — ver webSalvarRateioLote.
 */
function webCentros(token, mesRef) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const corrente = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const alvo = normalizarMesReferencia_(mesRef || corrente);
  const vigente = percentuaisDaCompetencia_(alvo);
  const percentuais = vigente.percentuais;
  // A aba Centros define QUEM existe; a competencia define QUANTO. Um centro
  // cadastrado depois do mes herdado apareceria zerado e passaria despercebido.
  const cadastrados = percentuaisDosCentros_();
  const nomes = Object.keys(cadastrados).concat(Object.keys(percentuais))
    .filter(function (n, i, a) { return a.indexOf(n) === i; })
    .sort();

  const itens = nomes.map(function (nome) {
    const p = percentuais[nome] || cadastrados[nome] || { percentual: 0, recebe: true };
    return { centro: nome, percentual: p.percentual * 100, recebe: p.recebe,
      novo: !percentuais[nome] };
  });
  const soma = itens.reduce(function (s, i) { return s + i.percentual; }, 0);

  return {
    competencia: alvo,
    competencias: competenciasDisponiveis_(),
    corrente: corrente,
    editavel: alvo >= corrente,
    origem: vigente.origem,
    proprio: vigente.proprio,
    itens: itens,
    soma: soma,
    colunas: [col_('Centro de Custo'), col_('% Rateio', 'decimal'), col_('Recebe Rateio')],
    linhas: itens.map(function (i) { return [i.centro, i.percentual, i.recebe ? 'SIM' : 'NAO']; }),
    totais: [null, soma, null],
  };
}

/**
 * Grava de uma vez todos os percentuais editados na tela.
 *
 * Em lote de proposito: o ajuste mensal mexe em varias lojas ao mesmo tempo, e
 * salvar uma a uma deixaria a base num estado intermediario em que a soma nao
 * fecha — exatamente o estado que o aviso de 100% existe para denunciar.
 *
 * O percentual chega em % (3,83) e e gravado como fracao (0,0383), que e o que a
 * coluna guarda e o que o rateio soma. Gravar 3,83 ali faria o centro receber
 * trezentas e oitenta e tres vezes a base.
 */
function webSalvarRateioLote(token, dados) {
  autorizarContextoWeb_(token, 'ADMIN');
  const corrente = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const alvo = normalizarMesReferencia_((dados && dados.competencia) || corrente);
  if (alvo < corrente) {
    return { ok: false, mensagem: 'A competência ' + alvo + ' já foi encerrada. ' +
      'Os percentuais dela ficam como estão, que é o motivo de existirem por competência.' };
  }
  const itens = (dados && dados.itens) || [];
  if (!itens.length) return { ok: false, mensagem: 'Nenhum centro foi enviado.' };

  const cadastrados = percentuaisDosCentros_();
  const limpos = [];
  for (let i = 0; i < itens.length; i++) {
    const nome = normalizarCentroCusto_(String(itens[i].centro || '').trim());
    if (!nome) return { ok: false, mensagem: 'Linha ' + (i + 1) + ': centro de custo em branco.' };
    if (!cadastrados[nome]) {
      return { ok: false, mensagem: 'Centro não encontrado: ' + nome +
        '. Centros novos são criados na aba "' + ABAS.CENTROS + '".' };
    }
    const bruto = String(itens[i].percentual === undefined ? '' : itens[i].percentual)
      .trim().replace(',', '.');
    const percentual = Number(bruto);
    if (bruto === '' || !isFinite(percentual) || percentual < 0 || percentual > 100) {
      return { ok: false, mensagem: nome + ': o percentual precisa ser um número entre 0 e 100.' };
    }
    limpos.push({ centro: nome, percentual: percentual / 100, recebe: itens[i].recebe !== false });
  }

  const anterior = percentuaisDaCompetencia_(alvo);
  gravarPercentuaisCompetencia_(alvo, limpos, emailContextoAtual_());

  // Espelha na aba Centros so quando e a competencia corrente: as formulas da
  // planilha leem Centros!B e nao conhecem competencia.
  const mapa = {};
  limpos.forEach(function (i) { mapa[i.centro] = { percentual: i.percentual, recebe: i.recebe }; });
  if (alvo === corrente) espelharPercentuaisNosCentros_(mapa);

  invalidarCacheInicio_();
  const mudancas = limpos.filter(function (i) {
    const a = anterior.percentuais[i.centro];
    return !a || Math.abs(a.percentual - i.percentual) > 1e-9 || a.recebe !== i.recebe;
  });
  registrarLog_('Rateio da competência ' + alvo,
    mudancas.length + ' centro(s) alterado(s): ' + (mudancas.map(function (i) {
      const a = anterior.percentuais[i.centro];
      return i.centro + ' ' + ((a ? a.percentual : 0) * 100).toFixed(3) + '% -> ' +
        (i.percentual * 100).toFixed(3) + '%';
    }).join(' • ') || 'nenhum valor mudou'));

  const soma = limpos.reduce(function (s, i) { return s + i.percentual; }, 0) * 100;
  // A soma nao BLOQUEIA: o rateio e normalizado por Sigma% e fecha com o Resumo de
  // qualquer jeito. Mas somar diferente de 100 quase sempre e digitacao pela metade,
  // e o operador precisa saber disso agora, nao no fechamento.
  const aviso = Math.abs(soma - 100) > 0.01
    ? ' Atenção: os percentuais somam ' + soma.toFixed(3) + '%, não 100%. ' +
      'O rateio é normalizado e continua fechando com o Resumo, mas confira se ficou faltando alguém.'
    : '';
  return {
    ok: true,
    soma: soma,
    competencia: alvo,
    alterados: mudancas.length,
    mensagem: 'Rateio de ' + alvo + ' gravado — ' + mudancas.length +
      ' centro(s) alterado(s).' + aviso,
  };
}

// ============================================================ V4.9: orçamento por centro
/**
 * O sistema media o custo com precisao de centavo e nao tinha NADA com que
 * compara-lo. "A Loja 08 gastou R$ 41.230" nao diz se foi bom ou ruim.
 *
 * O orcamento e gravado por competencia, igual ao rateio e pelo mesmo motivo: o
 * previsto de outubro tem de continuar sendo o previsto de outubro depois que
 * novembro for ajustado.
 *
 * O realizado NAO e o custo direto: e o TOTAL do centro depois do rateio — o
 * mesmo numero da tela de rateio. Comparar previsto com custo direto deixaria de
 * fora justamente a parcela do deposito que a loja recebe.
 */
const COL_ORC = { COMPETENCIA: 1, CENTRO: 2, VALOR: 3, ATUALIZADO: 4, RESPONSAVEL: 5 };
const TOTAL_COL_ORC = totalColunas_(COL_ORC);

let ORCAMENTO_EXEC_CACHE_ = null;

function lerOrcamento_() {
  if (ORCAMENTO_EXEC_CACHE_) return ORCAMENTO_EXEC_CACHE_;
  const sheet = ss_().getSheetByName(ABAS.ORCAMENTO);
  ORCAMENTO_EXEC_CACHE_ = (sheet && sheet.getLastRow() >= 2)
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, TOTAL_COL_ORC).getValues()
      .filter(function (l) { return l[COL_ORC.COMPETENCIA - 1] && l[COL_ORC.CENTRO - 1]; })
    : [];
  return ORCAMENTO_EXEC_CACHE_;
}

function invalidarCacheOrcamento_() { ORCAMENTO_EXEC_CACHE_ = null; }

/** Previsto por centro na competencia; herda do mes gravado anterior, como o rateio. */
function orcamentoDaCompetencia_(mesRef) {
  const alvo = normalizarMesReferencia_(mesRef);
  const porMes = {};
  lerOrcamento_().forEach(function (l) {
    const mes = normalizarMesReferencia_(l[COL_ORC.COMPETENCIA - 1]);
    const nome = normalizarCentroCusto_(String(l[COL_ORC.CENTRO - 1] || '').trim());
    if (!nome) return;
    (porMes[mes] || (porMes[mes] = {}))[nome] = Number(l[COL_ORC.VALOR - 1]) || 0;
  });
  if (porMes[alvo]) return { valores: porMes[alvo], origem: alvo, proprio: true };
  const anteriores = Object.keys(porMes).filter(function (m) { return m < alvo; }).sort();
  if (anteriores.length) {
    const herdado = anteriores[anteriores.length - 1];
    return { valores: porMes[herdado], origem: herdado, proprio: false };
  }
  return { valores: {}, origem: '', proprio: false };
}

function gravarOrcamentoCompetencia_(mesRef, itens, responsavel) {
  exigirExecucaoMutacao_();
  const alvo = normalizarMesReferencia_(mesRef);
  const sheet = aba_(ABAS.ORCAMENTO, true);
  garantirColunas_(sheet, TOTAL_COL_ORC);
  garantirCabecalhoAba_(sheet, ABAS.ORCAMENTO);

  const mantidas = lerOrcamento_().filter(function (l) {
    return normalizarMesReferencia_(l[COL_ORC.COMPETENCIA - 1]) !== alvo;
  });
  const agora = new Date();
  const quem = String(responsavel || emailContextoAtual_() || 'sistema');
  const novas = itens.map(function (i) {
    const linha = new Array(TOTAL_COL_ORC).fill('');
    linha[COL_ORC.COMPETENCIA - 1] = alvo;
    linha[COL_ORC.CENTRO - 1] = i.centro;
    linha[COL_ORC.VALOR - 1] = i.valor;
    linha[COL_ORC.ATUALIZADO - 1] = agora;
    linha[COL_ORC.RESPONSAVEL - 1] = quem;
    return linha;
  });

  const todas = mantidas.concat(novas);
  garantirLinhas_(sheet, Math.max(LINHAS_MINIMAS[ABAS.ORCAMENTO], todas.length + 50));
  const ultima = sheet.getLastRow();
  if (ultima >= 2) sheet.getRange(2, 1, ultima - 1, TOTAL_COL_ORC).clearContent();
  if (todas.length) {
    sheet.getRange(2, 1, todas.length, TOTAL_COL_ORC).setValues(todas);
    sheet.getRange(2, COL_ORC.VALOR, todas.length, 1).setNumberFormat('R$ #,##0.00');
    sheet.getRange(2, COL_ORC.ATUALIZADO, todas.length, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  }
  invalidarCacheOrcamento_();
  return todas.length;
}

/**
 * Fracao do periodo ja decorrida, usada na projecao.
 *
 * Devolve 1 para competencia encerrada (nada a projetar) e nunca menos que um
 * dia: no primeiro dia do periodo, dividir por zero mandaria a projecao ao
 * infinito e a tela mostraria "estouro" em toda loja que gastasse um real.
 */
function fracaoPeriodoDecorrida_(periodo, agora) {
  const hoje = agora || new Date();
  const dia = 24 * 60 * 60 * 1000;
  const total = Math.max(1, Math.round((periodo.fim - periodo.inicio) / dia) + 1);
  if (hoje >= periodo.fim) return { fracao: 1, decorridos: total, total: total };
  if (hoje <= periodo.inicio) return { fracao: 1 / total, decorridos: 1, total: total };
  const decorridos = Math.max(1, Math.round((hoje - periodo.inicio) / dia) + 1);
  return { fracao: Math.min(1, decorridos / total), decorridos: decorridos, total: total };
}

function webOrcamento(token, mesRef) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const corrente = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const alvo = normalizarMesReferencia_(mesRef || corrente);
  const apuracao = apurarRateio_(alvo);
  const previsto = orcamentoDaCompetencia_(alvo);
  const periodo = periodoDoMes_(alvo);
  const andamento = alvo === corrente
    ? fracaoPeriodoDecorrida_(periodo)
    : { fracao: 1, decorridos: 0, total: 0 };

  // Realizado = TOTAL do centro depois do rateio, igual a tela de rateio.
  const realizado = {};
  apuracao.linhas.forEach(function (l) { realizado[l.centro] = l.total; });

  const nomes = Object.keys(previsto.valores).concat(Object.keys(realizado))
    .filter(function (n, i, a) { return a.indexOf(n) === i; })
    .filter(function (n) { return (previsto.valores[n] || 0) > 0 || (realizado[n] || 0) !== 0; })
    .sort();

  const linhas = nomes.map(function (nome) {
    const prev = Number(previsto.valores[nome]) || 0;
    const real = Number(realizado[nome]) || 0;
    const projetado = andamento.fracao > 0 ? real / andamento.fracao : real;
    const desvio = real - prev;
    const desvioPct = prev > 0 ? (desvio / prev) * 100 : 0;
    let situacao;
    if (prev <= 0) situacao = 'SEM ORÇAMENTO';
    else if (real > prev) situacao = 'ESTOUROU';
    else if (projetado > prev) situacao = 'VAI ESTOURAR';
    else situacao = 'DENTRO';
    return [nome, prev, real, desvio, desvioPct, projetado, situacao];
  });

  linhas.sort(function (a, b) { return b[4] - a[4]; });

  const avisos = [];
  if (!nomes.length) {
    avisos.push('Nenhum orçamento lançado ainda. Informe o previsto de cada centro ' +
      'para a tela passar a comparar.');
  } else if (!previsto.proprio && previsto.origem) {
    avisos.push('⚠ Orçamento herdado de ' + previsto.origem + ' — esta competência ainda ' +
      'não tem o seu. Salve para congelá-lo aqui.');
  }
  if (alvo === corrente && andamento.total) {
    avisos.push('Período ' + andamento.decorridos + '/' + andamento.total + ' dias. ' +
      'A projeção repete até o fim o ritmo de gasto até aqui.');
  }
  if (apuracao.aproximado) {
    avisos.push('Competência encerrada, ' +
      (apuracao.cacheHit ? 'lida do cache' : 'recalculada a partir dos lançamentos') + '.');
  }

  return {
    competencia: alvo,
    competencias: competenciasDisponiveis_(),
    corrente: corrente,
    editavel: alvo >= corrente,
    origem: previsto.origem,
    proprio: previsto.proprio,
    // Para EDITAR vem a lista completa de centros cadastrados, nao a filtrada da
    // tabela: um centro novo, ainda sem gasto nem previsto, nao apareceria em
    // `nomes` e ficaria impossivel de orcar pela tela.
    itens: Object.keys(percentuaisDosCentros_()).sort().map(function (n) {
      return { centro: n, valor: Number(previsto.valores[n]) || 0 };
    }),
    colunas: [col_('Centro de Custo'), col_('Previsto', 'moeda'), col_('Realizado', 'moeda'),
      col_('Desvio R$', 'moeda'), col_('Desvio %', 'decimal'),
      col_('Projeção fim do período', 'moeda'), col_('Situação')],
    linhas: linhas,
    totais: [null,
      linhas.reduce(function (s, l) { return s + l[1]; }, 0),
      linhas.reduce(function (s, l) { return s + l[2]; }, 0),
      linhas.reduce(function (s, l) { return s + l[3]; }, 0),
      null,
      linhas.reduce(function (s, l) { return s + l[5]; }, 0),
      null],
    mensagem: avisos.join(' '),
  };
}

function webSalvarOrcamento(token, dados) {
  autorizarContextoWeb_(token, 'ADMIN');
  const corrente = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const alvo = normalizarMesReferencia_((dados && dados.competencia) || corrente);
  if (alvo < corrente) {
    return { ok: false, mensagem: 'A competência ' + alvo + ' já foi encerrada; ' +
      'o orçamento dela fica como está.' };
  }
  const itens = (dados && dados.itens) || [];
  if (!itens.length) return { ok: false, mensagem: 'Nenhum centro foi enviado.' };

  const cadastrados = percentuaisDosCentros_();
  const limpos = [];
  for (let i = 0; i < itens.length; i++) {
    const nome = normalizarCentroCusto_(String(itens[i].centro || '').trim());
    if (!nome) return { ok: false, mensagem: 'Linha ' + (i + 1) + ': centro de custo em branco.' };
    if (!cadastrados[nome]) {
      return { ok: false, mensagem: 'Centro não encontrado: ' + nome +
        '. Centros novos são criados na aba "' + ABAS.CENTROS + '".' };
    }
    const bruto = String(itens[i].valor === undefined ? '' : itens[i].valor).trim()
      .replace(/\./g, '').replace(',', '.');
    const valor = bruto === '' ? 0 : Number(bruto);
    if (!isFinite(valor) || valor < 0) {
      return { ok: false, mensagem: nome + ': o valor previsto precisa ser um número maior ou igual a zero.' };
    }
    limpos.push({ centro: nome, valor: valor });
  }

  const anterior = orcamentoDaCompetencia_(alvo);
  gravarOrcamentoCompetencia_(alvo, limpos, emailContextoAtual_());
  const mudancas = limpos.filter(function (i) {
    return Math.abs((Number(anterior.valores[i.centro]) || 0) - i.valor) > 0.005;
  });
  registrarLog_('Orçamento da competência ' + alvo,
    mudancas.length + ' centro(s): ' + (mudancas.map(function (i) {
      return i.centro + ' ' + (Number(anterior.valores[i.centro]) || 0).toFixed(2) +
        ' -> ' + i.valor.toFixed(2);
    }).join(' • ') || 'nenhum valor mudou'));

  const total = limpos.reduce(function (s, i) { return s + i.valor; }, 0);
  return {
    ok: true,
    competencia: alvo,
    alterados: mudancas.length,
    total: total,
    mensagem: 'Orçamento de ' + alvo + ' gravado — ' + mudancas.length +
      ' centro(s) alterado(s). Previsto total: R$ ' +
      total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '.',
  };
}

/**
 * Mensagem sobre a soma dos percentuais. Desvio pequeno é normalizado em
 * silêncio no cálculo, mas o usuário precisa saber que existe.
 */
function avisoPercentual_(soma) {
  const desvio = soma - 1;
  if (Math.abs(desvio) < 1e-9) return '';
  if (Math.abs(desvio) > 0.005) {
    return '⚠ Os percentuais de rateio somam ' + (soma * 100).toFixed(3) +
      '%, não 100%. Corrija na aba Centros de Custo — o desvio é grande.';
  }
  return 'Os percentuais somam ' + (soma * 100).toFixed(3) +
    '%; o rateio foi normalizado para fechar com o total.';
}

// ------------------------------------------------------ consulta veículo

function webConsultaVeiculo(token, placaOuPatrimonio) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const resolvido = resolverVeiculo_(placaOuPatrimonio, false);
  if (!resolvido.ok) return { ok:false, mensagem:resolvido.mensagem };
  const alvo = normalizaPlaca_(resolvido.veiculo.placa);
  const linha = lerResumo_().filter(function (l) {
    return normalizaPlaca_(l[R_.PLACA]) === alvo;
  })[0];
  if (!linha) return { ok: false, mensagem: 'Veículo encontrado, mas ainda não aparece no Resumo. Atualize os relatórios.' };

  const periodo = periodoAtual_();
  const lancamentos = lerLancamentos_()
    .filter(function (l) {
      const data = l[L_.DATA];
      return normalizaPlaca_(l[L_.PLACA]) === alvo &&
        data instanceof Date && data >= periodo.inicio && data <= periodo.fim;
    })
    .sort(function (a, b) { return b[L_.DATA] - a[L_.DATA]; })
    .map(function (l) {
      return {
        data: formatarData_(l[L_.DATA]), tipo: String(l[L_.TIPO]),
        naturezaOficina: String(l[L_.NATUREZA_OFICINA] || ''),
        detalheOficina: String(l[L_.DETALHE_OFICINA] || ''),
        litros: Number(l[L_.LITROS]) || 0, valor: Number(l[L_.VALOR]) || 0,
        documento: String(l[L_.DOCUMENTO] || ''), id: String(l[L_.ID] || ''),
      };
    });

  return {
    ok: true,
    placa: String(linha[R_.PLACA]),
    patrimonio: String(resolvido.veiculo.patrimonio || ''),
    descricao: String(linha[R_.DESCRICAO] || ''),
    categoria: String(linha[R_.CATEGORIA] || ''),
    centro: String(linha[R_.CENTRO] || ''),
    indicadores: {
      total: Number(linha[R_.TOTAL]) || 0,
      km: Number(linha[R_.KM]) || 0,
      rsKm: Number(linha[R_.RS_KM]) || 0,
      kmLitro: Number(linha[R_.KM_LITRO]) || 0,
      litros: Number(linha[R_.LITROS]) || 0,
      oficina: Number(linha[R_.OFICINA]) || 0,
      combustivel: Number(linha[R_.COMBUSTIVEL]) || 0,
      depreciacao: Number(linha[R_.DEPRECIACAO]) || 0,
      ipva: Number(linha[R_.IPVA]) || 0,
    },
    lancamentos: lancamentos,
    ultimoOdometro: ultimoOdometro(alvo),
  };
}

// ------------------------------------------------------------- cadastros

function webVeiculos(token, busca) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const termo = String(busca || '').toUpperCase().trim();
  const sheet = aba_(ABAS.VEICULOS);
  if (sheet.getLastRow() < 2) return { colunas: [], linhas: [] };
  const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, TOTAL_COL_VEIC).getValues()
    .filter(function (l) {
      if (!l[0]) return false;
      if (!termo) return true;
      return (String(l[0]) + ' ' + String(l[1]) + ' ' + String(l[3]) + ' ' + String(l[4])).toUpperCase()
        .indexOf(termo) !== -1;
    });
  return {
    colunas: [col_('Placa'), col_('Patrimônio'), col_('Descrição'), col_('Categoria'), col_('Centro de Custo'),
      col_('Depreciação', 'moeda'), col_('Emplacamento', 'moeda'), col_('Seguro', 'moeda'),
      col_('IPVA anual', 'moeda'), col_('Ativo')],
    linhas: dados.map(function (l) {
      return [l[0], l[4], l[1], l[2], l[3], l[5], l[6], l[7], Number(l[12]) || 0, l[10]];
    }),
  };
}

/**
 * Cria ou atualiza um veiculo.
 *
 * Na edicao os campos que o formulario NAO envia (bonus, aba de origem) sao
 * preservados da linha atual — sobrescrever a linha inteira apagaria dados que
 * vieram da migracao e que ninguem digitaria de novo.
 */
function webSalvarVeiculo(token, dados) {
  autorizarContextoWeb_(token, 'ADMIN');
  const placa = normalizaPlaca_(dados.placa);
  if (!placa) return { ok: false, mensagem: 'Informe a placa ou o identificador.' };
  const centroNormalizado = normalizarCentroCusto_(dados.centro);
  if (!centroNormalizado) return { ok: false, mensagem: 'Escolha o centro de custo.' };
  if (listaCentros_().indexOf(centroNormalizado) === -1) {
    return { ok: false, mensagem: 'Centro de custo não cadastrado: ' + centroNormalizado + '.' };
  }

  const sheet = aba_(ABAS.VEICULOS);
  const indice = listaPlacas_(false).indexOf(placa);
  const atual = indice === -1 ? [] : sheet.getRange(indice + 2, 1, 1, TOTAL_COL_VEIC).getValues()[0];

  /** Usa o valor enviado; se não veio, mantém o que já estava. */
  function manter(enviado, posicao, padrao) {
    if (enviado !== undefined && enviado !== null && enviado !== '') return enviado;
    if (indice !== -1 && atual[posicao] !== '') return atual[posicao];
    return padrao;
  }

  const descricao = String(manter(dados.descricao, 1, '') || '').trim().slice(0, 180);
  const categoria = String(manter(dados.categoria, 2, 'Leve') || '').trim().slice(0, 120) || 'Leve';
  const codigo = String(manter(dados.codigo, 4, '') || '').trim().slice(0, 120);
  if (codigo) {
    const chaveCodigo = chavePatrimonio_(codigo);
    const conflito = dadosVeiculosExecucao_().filter(function(l) {
      return normalizaPlaca_(l[COL_VEIC.PLACA - 1]) !== placa &&
        chavePatrimonio_(l[COL_VEIC.CODIGO - 1]) === chaveCodigo;
    })[0];
    if (conflito) return { ok:false, mensagem:'Código Patrimônio "' + codigo + '" já está vinculado ao veículo ' + conflito[COL_VEIC.PLACA - 1] + '.' };
  }
  const abaOrigem = String(manter(dados.aba, 11, '') || '').trim().slice(0, 120);
  const numerosVeiculo = {
    depreciacao: Number(dados.depreciacao || 0),
    emplacamento: Number(dados.emplacamento || 0),
    seguro: Number(dados.seguro || 0),
    bonus: Number(manter(dados.bonus, 8, 0)),
    precoCombustivel: Number(dados.precoCombustivel || 0),
    ipva: Number(manter(dados.ipva, 12, 0))
  };
  const numeroInvalido = Object.keys(numerosVeiculo).filter(function(k) {
    return !isFinite(numerosVeiculo[k]) || numerosVeiculo[k] < 0 || numerosVeiculo[k] > 1000000000;
  });
  if (numeroInvalido.length) return { ok: false, mensagem: 'Valor numérico inválido no cadastro: ' + numeroInvalido.join(', ') + '.' };

  const linha = [
    placa, descricao, categoria, centroNormalizado, codigo,
    numerosVeiculo.depreciacao, numerosVeiculo.emplacamento, numerosVeiculo.seguro,
    numerosVeiculo.bonus, numerosVeiculo.precoCombustivel,
    dados.ativo === false ? 'NAO' : 'SIM', abaOrigem, numerosVeiculo.ipva,
  ];

  if (indice === -1) {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, TOTAL_COL_VEIC).setValues([linha]);
    registrarLog_('Cadastro de veículo', 'novo: ' + placa);
    VEICULOS_EXEC_CACHE_ = null;
    invalidarCacheInicio_();
    atualizarResumoSeguro_();
    return { ok: true, mensagem: 'Veículo ' + placa + ' cadastrado e incluído no Resumo.' };
  }
  sheet.getRange(indice + 2, 1, 1, TOTAL_COL_VEIC).setValues([linha]);
  registrarLog_('Cadastro de veículo', 'alterado: ' + placa);
  VEICULOS_EXEC_CACHE_ = null;
  invalidarCacheInicio_();
  atualizarResumoSeguro_();
  return { ok: true, mensagem: 'Veículo ' + placa + ' atualizado.' };
}

function webVeiculo(token, placaOuPatrimonio) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const resolvido = resolverVeiculo_(placaOuPatrimonio, false);
  if (!resolvido.ok) return null;
  const alvo = normalizaPlaca_(resolvido.veiculo.placa);
  const sheet = aba_(ABAS.VEICULOS);
  const placas = listaPlacas_(false);
  const indice = placas.map(normalizaPlaca_).indexOf(alvo);
  if (indice === -1) return null;
  const l = sheet.getRange(indice + 2, 1, 1, TOTAL_COL_VEIC).getValues()[0];
  return {
    placa: l[0], descricao: l[1], categoria: l[2], centro: l[3], codigo: l[4],
    depreciacao: l[5], emplacamento: l[6], seguro: l[7], bonus: l[8],
    precoCombustivel: l[9], ativo: String(l[10]).toUpperCase() !== 'NAO',
    aba: l[11], ipva: Number(l[12]) || 0,
  };
}

// ------------------------------------------------ depreciação mensal

/** Data civil de hoje no fuso horário da planilha. */
function hojeNoFuso_() {
  const p = Utilities.formatDate(new Date(), timezone_(), 'yyyy-MM-dd').split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0, 0);
}

/** Último dia contábil do período (sempre dia 25 na regra atual). */
function dataUltimoDiaPeriodo_(periodo) {
  return new Date(periodo.fim.getFullYear(), periodo.fim.getMonth(), periodo.fim.getDate(), 0, 0, 0, 0);
}

function mesmaData_(a, b) {
  return a instanceof Date && b instanceof Date &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/** Depreciação só pode ser gerada/lançada a partir do último dia do período. */
function depreciacaoLiberada_(periodo) {
  return hojeNoFuso_().getTime() >= dataUltimoDiaPeriodo_(periodo).getTime();
}

function totalDepreciacaoLancadaPlacaPeriodo_(placa, periodo) {
  const sheet = aba_(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (n < 1) return 0;
  const dados = sheet.getRange(2, 1, n, 5).getValues();
  const alvo = normalizaPlaca_(placa);
  return dados.reduce(function (soma, l) {
    const data = l[0];
    if (!(data instanceof Date) || data < periodo.inicio || data > periodo.fim) return soma;
    if (normalizaPlaca_(l[1]) !== alvo || ['Depreciação', 'Depreciacao'].indexOf(String(l[2] || '').trim()) === -1) return soma;
    return soma + (Number(l[4]) || 0);
  }, 0);
}

/** Situação da depreciação de cada veículo ativo na competência aberta. */
// ==========================================================================
// IPVA anual em 12 parcelas (V4.8.7)
// ==========================================================================

const PREFIXO_GRUPO_IPVA_ = 'IPVA-';
const PARCELAS_IPVA_ = 12;

/**
 * Divide um valor em N parcelas de centavos exatos.
 *
 * R$ 1.000 em 12 nao da numero redondo: 83,333... Arredondar as 12 para 83,33
 * somaria R$ 999,96 e o IPVA do ano ficaria R$ 0,04 menor do que a nota — uma
 * diferenca pequena que destroi a conciliacao justamente de quem confere.
 * A sobra vai toda na ULTIMA parcela.
 */
function dividirEmParcelas_(valorTotal, quantidade) {
  const centavosTotal = Math.round(Number(valorTotal) * 100);
  const base = Math.floor(centavosTotal / quantidade);
  const parcelas = [];
  let acumulado = 0;
  for (let i = 0; i < quantidade - 1; i++) {
    parcelas.push(base / 100);
    acumulado += base;
  }
  parcelas.push((centavosTotal - acumulado) / 100);
  return parcelas;
}

/** "2026-07" + 3 -> "2026-10". Aritmetica de competencia, sem Date. */
function somarMesesCompetencia_(mesRef, meses) {
  const partes = normalizarMesReferencia_(mesRef).split('-');
  const indice = Number(partes[0]) * 12 + (Number(partes[1]) - 1) + Number(meses);
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return ano + '-' + (mes < 10 ? '0' : '') + mes;
}

/** Parcelas de IPVA ja lancadas para a placa, agrupadas pelo grupo de origem. */
/**
 * Lancamento com data futura POR DESENHO, nao por engano.
 *
 * Desde a V4.8.7 o IPVA e lancado como 12 parcelas, cada uma datada no fim da
 * SUA competencia — inclusive as que ainda nao chegaram. Isso e o ponto delas:
 * o encargo anual aparece diluido mes a mes no mapa, em vez de pesar tudo num
 * mes so.
 *
 * O validador de "lancamento em periodo futuro" nasceu para pegar quem digitou
 * 2027 no lugar de 2026, e nao sabia dessas. Resultado: toda parcela agendada
 * virava pendencia, e a lista enchia de itens que ninguem consegue resolver
 * porque nao sao problema — exatamente o tipo de ruido que faz o operador parar
 * de olhar a tela de conferencia.
 *
 * O reconhecimento e pelo marcador de grupo que lancarIpvaAnual_ grava na
 * observacao, nao so pelo tipo: um IPVA avulso digitado com data errada CONTINUA
 * sendo acusado, que e o comportamento certo.
 */
function lancamentoAgendado_(linha) {
  if (String(linha[L_.TIPO] || '').trim() !== 'IPVA') return false;
  return new RegExp(PREFIXO_GRUPO_IPVA_ + '[A-Za-z0-9]+')
    .test(String(linha[L_.OBSERVACAO] || ''));
}

function gruposIpvaDaPlaca_(placa) {
  const alvo = normalizaPlaca_(placa);
  const grupos = {};
  lerLancamentos_().forEach(function (l) {
    if (String(l[L_.TIPO] || '').trim() !== 'IPVA') return;
    if (normalizaPlaca_(l[L_.PLACA]) !== alvo) return;
    const obs = String(l[L_.OBSERVACAO] || '');
    const achado = obs.match(/IPVA-[A-Za-z0-9]+/);
    const grupo = achado ? achado[0] : '(sem grupo)';
    if (!grupos[grupo]) grupos[grupo] = { parcelas: 0, total: 0, competencias: [] };
    grupos[grupo].parcelas++;
    grupos[grupo].total += Number(l[L_.VALOR]) || 0;
    grupos[grupo].competencias.push(String(l[L_.PERIODO] || ''));
  });
  return grupos;
}

/**
 * Lanca o IPVA anual de um veiculo como 12 parcelas mensais.
 *
 * Gera 12 LINHAS em vez de guardar uma linha anual e dividir na hora de somar.
 * O motivo e consistencia: com uma linha so, o Resumo mostraria R$ 200 e o
 * Extrato do mesmo mes mostraria R$ 2.400. Discordancia silenciosa entre duas
 * telas do mesmo sistema e o que faz o usuario parar de confiar nos numeros.
 *
 * Cada parcela cai no ULTIMO dia da sua competencia — inclusive em competencias
 * futuras, que o fluxo normal de lancamento recusa. Por isso escreve direto,
 * pelo mesmo caminho que gerarDepreciacaoMensal_ usa.
 */
function lancarIpvaAnual_(dados) {
  exigirExecucaoMutacao_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { ok: false, mensagem: 'Outro lançamento está em andamento. Tente de novo em instantes.' };
  }
  try {
    const erros = [];
    const resolvido = resolverVeiculo_((dados && dados.placa) || '', false);
    if (!resolvido.ok) {
      return { ok: false, mensagem: resolvido.mensagem || 'Informe a placa ou o patrimônio.' };
    }
    const placa = normalizaPlaca_(resolvido.veiculo.placa);

    const valorAnual = Number(String((dados && dados.valorAnual) || '').toString().replace(',', '.'));
    if (!isFinite(valorAnual) || valorAnual <= 0) erros.push('Informe o valor ANUAL do IPVA.');
    if (valorAnual > 1000000) erros.push('Valor acima do limite de segurança. Confira a nota.');

    const documento = String((dados && dados.documento) || '').trim().slice(0, 160);
    if (!documento) erros.push('Informe o número do documento (DUA, guia ou NF do IPVA).');

    let mesInicial;
    try {
      mesInicial = normalizarMesReferencia_((dados && dados.mesInicial) || param_('MES_REFERENCIA'));
    } catch (e) {
      erros.push('Competência inicial inválida. Use o formato AAAA-MM.');
    }
    if (erros.length) return { ok: false, mensagem: erros.join('\n') };

    // Mesmo documento ja lancado para a placa: quase sempre e duplo clique ou
    // relancamento sem querer. 12 parcelas duplicadas dobram o IPVA do ano
    // inteiro, entao aqui a recusa e deliberada.
    const jaLancado = lerLancamentos_().filter(function (l) {
      return String(l[L_.TIPO] || '').trim() === 'IPVA' &&
        normalizaPlaca_(l[L_.PLACA]) === placa &&
        String(l[L_.DOCUMENTO] || '').trim().toUpperCase() === documento.toUpperCase();
    });
    if (jaLancado.length && !(dados && dados.confirmarDuplicidade === true)) {
      return {
        ok: false, duplicidade: true,
        mensagem: 'O documento ' + documento + ' já tem ' + jaLancado.length +
          ' parcela(s) de IPVA lançada(s) para ' + placa +
          '. Confirme se realmente quer lançar outro ano com o mesmo documento.',
      };
    }

    const grupo = PREFIXO_GRUPO_IPVA_ + Utilities.getUuid().slice(0, 8).toUpperCase();
    const valores = dividirEmParcelas_(valorAnual, PARCELAS_IPVA_);
    const classificacao = classificacaoVeiculoAtual_(placa);

    const linhas = valores.map(function (valor, i) {
      const competencia = somarMesesCompetencia_(mesInicial, i);
      const periodoParcela = periodoDoMes_(competencia);
      const fim = periodoParcela.fim;
      const data = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 12, 0, 0);
      return [data, resolvido.veiculo.placa, 'IPVA', '', valor, documento,
        'IPVA ' + grupo + ' • parcela ' + (i + 1) + '/' + PARCELAS_IPVA_ +
        ' • competência ' + competencia +
        ' • anual R$ ' + valorAnual.toFixed(2)];
    });

    const sheet = aba_(ABAS.LANCAMENTOS);
    garantirCapacidadeLancamentos_(quantidadeLancamentosReais_() + linhas.length);
    const primeira = proximaLinhaLancamento_();
    sheet.getRange(primeira, 1, linhas.length, BLOCO_ENTRADA_LANC).setValues(linhas);
    sheet.getRange(primeira, COL_LANC.CENTRO, linhas.length, 2).setValues(
      linhas.map(function () { return [classificacao.centro, classificacao.categoria]; }));
    sheet.getRange(primeira, COL_LANC.ID, linhas.length, 1)
      .setValues(linhas.map(function () { return [novoIdLancamento_()]; }))
      .setNumberFormat('@');
    sheet.getRange(primeira, COL_LANC.DATA, linhas.length, 1).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(primeira, COL_LANC.VALOR, linhas.length, 1).setNumberFormat('R$ #,##0.00');

    SpreadsheetApp.flush();
    invalidarCacheInicio_();
    atualizarResumoSeguro_();
    registrarLog_('IPVA anual', placa + ' • ' + grupo + ' • R$ ' + valorAnual.toFixed(2) +
      ' em ' + PARCELAS_IPVA_ + ' parcelas a partir de ' + mesInicial);

    return {
      ok: true,
      grupo: grupo,
      parcelas: linhas.length,
      valorParcela: valores[0],
      mensagem: 'IPVA de ' + placa + ' lançado: R$ ' + valorAnual.toFixed(2).replace('.', ',') +
        ' em ' + PARCELAS_IPVA_ + ' parcelas de R$ ' + valores[0].toFixed(2).replace('.', ',') +
        (valores[PARCELAS_IPVA_ - 1] !== valores[0]
          ? ' (a última de R$ ' + valores[PARCELAS_IPVA_ - 1].toFixed(2).replace('.', ',') +
            ', para fechar o centavo)' : '') +
        ', de ' + mesInicial + ' a ' + somarMesesCompetencia_(mesInicial, PARCELAS_IPVA_ - 1) +
        '. Grupo ' + grupo + '.',
    };
  } finally {
    lock.releaseLock();
  }
}

function webLancarIpva(token, dados) {
  autorizarContextoWeb_(token, 'ADMIN');
  return lancarIpvaAnual_(dados);
}

/** Situacao do IPVA por veiculo: o que foi lancado e o que falta. */
function webSituacaoIpva(token) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const linhas = [];
  dadosVeiculosExecucao_().forEach(function (v) {
    const placa = String(v[COL_VEIC.PLACA - 1] || '').trim();
    if (!placa) return;
    const sugerido = Number(v[COL_VEIC.IPVA - 1]) || 0;
    const grupos = gruposIpvaDaPlaca_(placa);
    const nomes = Object.keys(grupos);
    const lancado = nomes.reduce(function (t, g) { return t + grupos[g].total; }, 0);
    const parcelas = nomes.reduce(function (t, g) { return t + grupos[g].parcelas; }, 0);
    if (!sugerido && !parcelas) return;   // veiculo sem IPVA nenhum nao polui a lista
    linhas.push([placa, String(v[COL_VEIC.DESCRICAO - 1] || ''), sugerido, lancado,
      parcelas, nomes.join(', ')]);
  });
  linhas.sort(function (a, b) { return b[3] - a[3]; });
  return {
    colunas: [col_('Placa'), col_('Veículo'), col_('Valor sugerido (cadastro)', 'moeda'),
      col_('Lançado em parcelas', 'moeda'), col_('Parcelas', 'numero'), col_('Grupos')],
    linhas: linhas,
    totais: [null, null,
      linhas.reduce(function (t, l) { return t + l[2]; }, 0),
      linhas.reduce(function (t, l) { return t + l[3]; }, 0),
      linhas.reduce(function (t, l) { return t + l[4]; }, 0), null],
    mensagem: 'O valor do cadastro é apenas sugestão ao lançar. O que entra no mapa ' +
      'são as parcelas lançadas.',
  };
}

function statusDepreciacaoMensal_() {
  const mesRef = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const periodo = periodoDoMes_(mesRef);
  const dataLancamento = dataUltimoDiaPeriodo_(periodo);
  const liberada = depreciacaoLiberada_(periodo);
  const veiculos = dadosVeiculosExecucao_();
  const lancados = {};
  const lancadosForaData = {};
  const sheet = aba_(ABAS.LANCAMENTOS);

  const qtdLancDep = quantidadeLancamentosReais_();
  if (qtdLancDep >= 1) {
    sheet.getRange(2, 1, qtdLancDep, 5).getValues().forEach(function (l) {
      const data = l[0];
      if (!(data instanceof Date) || data < periodo.inicio || data > periodo.fim) return;
      if (['Depreciação', 'Depreciacao'].indexOf(String(l[2] || '').trim()) === -1) return;
      const placa = normalizaPlaca_(l[1]);
      if (!placa) return;
      const valor = Number(l[4]) || 0;
      if (mesmaData_(data, dataLancamento)) {
        lancados[placa] = (lancados[placa] || 0) + valor;
      } else {
        lancadosForaData[placa] = (lancadosForaData[placa] || 0) + valor;
      }
    });
  }

  const itens = [];
  let previstos = 0, concluidos = 0, pendentes = 0, divergentes = 0, semValor = 0, aguardando = 0;
  let valorPrevisto = 0, valorLancado = 0;

  veiculos.forEach(function (v) {
    const placa = normalizaPlaca_(v[COL_VEIC.PLACA - 1]);
    if (!placa) return;
    const ativo = String(v[COL_VEIC.ATIVO - 1] || '').trim().toUpperCase() !== 'NAO';
    if (!ativo) return;
    const valorMensal = Number(v[COL_VEIC.DEPRECIACAO - 1]) || 0;
    const lancado = Number(lancados[placa] || 0);
    const lancadoForaData = Number(lancadosForaData[placa] || 0);
    let situacao = 'SEM VALOR';

    if (valorMensal > 0) {
      previstos++;
      valorPrevisto += valorMensal;
      valorLancado += lancado + lancadoForaData;

      if (lancadoForaData > 0) {
        situacao = 'DATA INCORRETA';
        divergentes++;
      } else if (lancado === 0) {
        if (liberada) {
          situacao = 'PENDENTE';
          pendentes++;
        } else {
          situacao = 'AGUARDANDO';
          aguardando++;
        }
      } else if (Math.abs(lancado - valorMensal) > 0.01) {
        situacao = 'DIVERGENTE';
        divergentes++;
      } else {
        situacao = 'OK';
        concluidos++;
      }
    } else {
      semValor++;
    }

    itens.push({
      placa: placa,
      descricao: String(v[COL_VEIC.DESCRICAO - 1] || ''),
      centro: String(v[COL_VEIC.CENTRO - 1] || ''),
      valorMensal: valorMensal,
      lancado: lancado,
      lancadoForaData: lancadoForaData,
      situacao: situacao,
    });
  });

  return {
    mes: mesRef,
    mesExtenso: nomeDoMes_(mesRef),
    periodo: formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim),
    dataLancamento: formatarData_(dataLancamento),
    liberada: liberada,
    previstos: previstos, concluidos: concluidos, pendentes: pendentes,
    divergentes: divergentes, aguardando: aguardando, semValor: semValor,
    valorPrevisto: valorPrevisto, valorLancado: valorLancado,
    itens: itens
  };
}

function gerarDepreciacaoMensal_() {
  exigirExecucaoMutacao_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const status = statusDepreciacaoMensal_();
    const periodo = periodoDoMes_(status.mes);
    if (!status.liberada) {
      return {
        gerados: 0,
        status: status,
        mensagem: 'A depreciação de ' + status.mesExtenso + ' só pode ser inserida no último dia do período (' +
          status.dataLancamento + '). Até lá ela fica como AGUARDANDO e não conta como pendência.'
      };
    }
    const dataLancamento = new Date(periodo.fim.getFullYear(), periodo.fim.getMonth(), periodo.fim.getDate(), 12, 0, 0);
    const faltantes = status.itens.filter(function (i) { return i.situacao === 'PENDENTE'; });
    if (!faltantes.length) return { gerados: 0, status: status, mensagem: 'Nenhuma depreciação pendente para gerar.' };

    const linhas = faltantes.map(function (i) {
      return [dataLancamento, i.placa, 'Depreciação', '', i.valorMensal,
        'DEP-' + status.mes,
        'Depreciação mensal gerada automaticamente para ' + status.mes];
    });
    const sheet = aba_(ABAS.LANCAMENTOS);
    const primeira = proximaLinhaLancamento_();
    sheet.getRange(primeira, 1, linhas.length, BLOCO_ENTRADA_LANC).setValues(linhas);
    const classDep = faltantes.map(function(i){ const c=classificacaoVeiculoAtual_(i.placa); return [c.centro,c.categoria]; });
    sheet.getRange(primeira, COL_LANC.CENTRO, classDep.length, 2).setValues(classDep);
    const idsDep = linhas.map(function(){ return [novoIdLancamento_()]; });
    sheet.getRange(primeira, COL_LANC.ID, idsDep.length, 1).setValues(idsDep).setNumberFormat('@');
    sheet.getRange(primeira, COL_LANC.DATA, linhas.length, 1).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(primeira, COL_LANC.VALOR, linhas.length, 1).setNumberFormat('R$ #,##0.00');
    SpreadsheetApp.flush();
    invalidarCacheInicio_();
    atualizarResumoSeguro_();
    registrarLog_('Depreciação mensal', status.mes + ' • ' + linhas.length + ' veículo(s) • R$ ' +
      faltantes.reduce(function (s, i) { return s + i.valorMensal; }, 0).toFixed(2));
    return {
      gerados: linhas.length,
      status: statusDepreciacaoMensal_(),
      mensagem: linhas.length + ' lançamento(s) de depreciação gerado(s) para ' + status.mesExtenso + '.'
    };
  } finally {
    lock.releaseLock();
  }
}

function webDepreciacao(token) {
  exigirPerfilToken_(token, 'ADMIN');
  return statusDepreciacaoMensal_();
}

function webGerarDepreciacao(token) {
  autorizarContextoWeb_(token, 'ADMIN');
  const r = gerarDepreciacaoMensal_();
  // Revalida para retirar automaticamente as pendências de depreciação recém-resolvidas.
  escreverConferencia_(coletarProblemas_());
  invalidarCacheInicio_();
  return r;
}

// ------------------------------------------------ pendências no Web App

function webPendencias(token) {
  exigirPerfilToken_(token, ['OPERADOR', 'ADMIN']);
  const sheet = garantirAbaPendencias_(false);
  if (!sheet || sheet.getLastRow() < 3) {
    return { total: 0, pendentes: 0, analise: 0, linhas: [] };
  }
  const dados = sheet.getRange(3, 1, sheet.getLastRow() - 2, 7).getValues();
  const linhas = [];
  let pendentes = 0, analise = 0;
  const contarDepreciacao = depreciacaoPodeContarComoPendencia_();
  dados.forEach(function (l, i) {
    if (!l[0] || String(l[0]).trim() === 'Nenhum problema encontrado.') return;
    // Compatibilidade com versões anteriores: se ficaram linhas antigas de depreciação
    // gravadas na guia, elas não aparecem nem contam antes do último dia do período.
    if (!contarDepreciacao && ehPendenciaDepreciacao_(l[2])) return;
    const status = String(l[4] || 'PENDENTE').trim().toUpperCase();
    if (status === 'PENDENTE') pendentes++;
    if (status === 'EM ANÁLISE') analise++;
    linhas.push({
      linha: i + 3, origem: String(l[0] || ''), placa: String(l[1] || ''),
      problema: String(l[2] || ''), detalhe: String(l[3] || ''),
      status: status, observacao: String(l[5] || ''),
      // V4.9.1: quando o problema e um campo faltando numa linha conhecida, a
      // tela mostra o campo e grava a correcao — em vez de so deixar marcar
      // RESOLVIDO com o dado ainda errado.
      correcao: correcaoDaPendencia_(String(l[0] || ''), String(l[2] || ''),
        String(l[3] || ''), String(l[1] || '')),
      // Quando nao da para corrigir por um campo, a tela mostra o caminho certo
      // em vez de deixar so Status/Observacao, que resolve nada.
      acao: acaoDaPendencia_(String(l[2] || '')),
      validadoEm: l[6] instanceof Date ? Utilities.formatDate(l[6], timezone_(), 'dd/MM/yyyy HH:mm') : String(l[6] || '')
    });
  });
  return { total: pendentes + analise, pendentes: pendentes, analise: analise,
    linhas: linhas, listas: listasDeCorrecao_() };
}

// ====================================================== V4.9.1: corrigir pendência na hora
/**
 * A tela de pendencias listava o problema e oferecia Status + Observacao. Dava
 * para marcar RESOLVIDO escrevendo "serviço" na observacao — e o lancamento
 * continuava sem detalhe nenhum. A pendencia sumia da contagem, o dado ficava
 * errado, e a conferencia passava a mentir.
 *
 * Agora, quando o problema e um campo faltando numa linha conhecida, a tela traz
 * o campo e grava a correcao na base. A pendencia some porque foi RESOLVIDA, nao
 * porque alguem disse que estava.
 *
 * Nem todo problema entra aqui, de proposito. Ficam de fora:
 *  - os que nao sao de uma linha so (soma de rateio, placa duplicada);
 *  - os que exigem cadastro novo, nao edicao (placa nao cadastrada);
 *  - datas. Mudar a data de um lancamento muda a COMPETENCIA dele, podendo
 *    joga-lo para dentro ou para fora de um periodo fechado e alterando o hash
 *    de integridade. Isso nao pode acontecer num campo de preenchimento rapido.
 */
const CORRECOES_PENDENCIA_ = {};
/**
 * Alguns problemas trazem um valor variavel no proprio nome — por exemplo
 * "Descrição do veículo com erro (#REF!)". Busca exata nunca casaria, entao
 * essas ficam num registro por PREFIXO.
 */
const CORRECOES_PENDENCIA_PREFIXO_ = [];

function registrarCorrecaoPendencia_(problema, spec) { CORRECOES_PENDENCIA_[problema] = spec; }

function registrarCorrecaoPendenciaPorPrefixo_(prefixo, spec) {
  CORRECOES_PENDENCIA_PREFIXO_.push({ prefixo: prefixo, spec: spec });
}

/**
 * Listas de opcoes dos campos de correcao, resolvidas POR NOME.
 *
 * Antes cada spec carregava a propria funcao e correcaoDaPendencia_ a chamava
 * uma vez POR PENDENCIA. Com 110 pendencias e 170 veiculos isso era 110
 * reconstrucoes da lista de placas por requisicao — e, pior, as 110 copias
 * identicas viajavam para o navegador: 117 KB onde bastavam 43.
 *
 * Agora a spec diz so o NOME da lista, webPendencias manda cada uma uma vez, e
 * a tela resolve. Nome em vez de funcao tambem deixa a spec serializavel, o que
 * e o que permite manda-la para o cliente sem avaliar nada.
 */
function opcoesDaLista_(nome) {
  if (nome === 'naturezas') return NATUREZAS_OFICINA.slice();
  if (nome === 'tipos') return TIPOS_DESPESA.slice();
  if (nome === 'centros') return listaCentros_();
  if (nome === 'categorias') return listaCategorias_();
  if (nome === 'placas') return listaPlacas_(false);
  if (nome === 'situacao') return ['SIM', 'NAO'];
  return [];
}

/** Todas as listas usadas pelos campos de correcao, montadas UMA vez. */
function listasDeCorrecao_() {
  const nomes = {};
  Object.keys(CORRECOES_PENDENCIA_).forEach(function (k) {
    if (CORRECOES_PENDENCIA_[k].lista) nomes[CORRECOES_PENDENCIA_[k].lista] = true;
  });
  CORRECOES_PENDENCIA_PREFIXO_.forEach(function (x) {
    if (x.spec.lista) nomes[x.spec.lista] = true;
  });
  const saida = {};
  Object.keys(nomes).forEach(function (n) { saida[n] = opcoesDaLista_(n); });
  return saida;
}

/**
 * Campos de uma spec, sempre como lista.
 *
 * A maioria das pendencias se resolve num campo so, e por isso a spec nasceu
 * com coluna/tipo/rotulo soltos. Mas "preco fora da curva" nao tem UM culpado:
 * a razao pode estar errada pelo valor ou pela quantidade, e so quem olha o
 * lancamento sabe qual. Mandar o operador para outra tela para metade dos casos
 * e empurrar o trabalho para longe de onde ele ja esta.
 *
 * Specs de um campo continuam escritas do jeito curto; esta funcao as embrulha.
 */
function camposDaSpec_(spec) {
  if (spec.campos) return spec.campos;
  return [{ chave: 'valor', coluna: spec.coluna, tipo: spec.tipo, rotulo: spec.rotulo,
    ajuda: spec.ajuda || '', lista: spec.lista || null,
    minimo: spec.minimo, minimoNumero: spec.minimoNumero,
    travaCompetencia: spec.travaCompetencia === true }];
}

/** Spec de correcao de um problema: exata primeiro, depois por prefixo. */
function specDaPendencia_(problema) {
  const nome = String(problema || '').trim();
  if (CORRECOES_PENDENCIA_[nome]) return CORRECOES_PENDENCIA_[nome];
  for (let i = 0; i < CORRECOES_PENDENCIA_PREFIXO_.length; i++) {
    if (nome.indexOf(CORRECOES_PENDENCIA_PREFIXO_[i].prefixo) === 0) {
      return CORRECOES_PENDENCIA_PREFIXO_[i].spec;
    }
  }
  return null;
}

(function () {
  const L = ABAS.LANCAMENTOS, O = ABAS.ODOMETRO, V = ABAS.VEICULOS;

  registrarCorrecaoPendencia_('Oficina sem natureza da despesa', {
    aba: L, coluna: COL_LANC.NATUREZA_OFICINA, tipo: 'lista', rotulo: 'Natureza da despesa',
    ajuda: 'classifique como peça, serviço ou outra natureza',
    lista: 'naturezas' });

  registrarCorrecaoPendencia_('Oficina sem detalhe da peça/serviço', {
    aba: L, coluna: COL_LANC.DETALHE_OFICINA, tipo: 'texto', rotulo: 'Detalhe da peça / serviço',
    ajuda: 'descreva o que foi comprado ou executado', minimo: 3 });

  registrarCorrecaoPendencia_('Oficina sem NF/OS/documento', {
    aba: L, coluna: COL_LANC.DOCUMENTO, tipo: 'texto', rotulo: 'NF / OS / documento',
    ajuda: 'informe o documento que comprova a despesa' });

  registrarCorrecaoPendencia_('Lançamento incompleto (sem tipo de despesa)', {
    aba: L, coluna: COL_LANC.TIPO, tipo: 'lista', rotulo: 'Tipo de despesa',
    lista: 'tipos' });

  registrarCorrecaoPendencia_('Tipo de despesa desconhecido', {
    aba: L, coluna: COL_LANC.TIPO, tipo: 'lista', rotulo: 'Tipo de despesa',
    lista: 'tipos' });

  registrarCorrecaoPendencia_('Lançamento sem centro de custo congelado', {
    aba: L, coluna: COL_LANC.CENTRO, tipo: 'lista', rotulo: 'Centro de custo',
    lista: 'centros' });

  registrarCorrecaoPendencia_('Lançamento sem categoria congelada', {
    aba: L, coluna: COL_LANC.CATEGORIA, tipo: 'lista', rotulo: 'Categoria',
    lista: 'categorias' });

  registrarCorrecaoPendencia_('Valor negativo', {
    aba: L, coluna: COL_LANC.VALOR, tipo: 'numero', rotulo: 'Valor R$', minimoNumero: 0,
    ajuda: 'despesa é valor positivo; estorno se faz excluindo o lançamento' });

  registrarCorrecaoPendencia_('Litros informados num tipo que não é abastecimento', {
    aba: L, coluna: COL_LANC.LITROS, tipo: 'numero', rotulo: 'Litros', minimoNumero: 0,
    ajuda: 'zere os litros, ou corrija o tipo de despesa no lançamento' });

  // ---- datas. Ficaram de fora ate a V4.9.2 por um motivo que continua valendo:
  // mudar a data de um lancamento muda a COMPETENCIA dele. Agora entram, mas com
  // trava — ver travaCompetenciaFechada_: a gravacao e recusada se a data velha
  // OU a nova cair num mes ja fechado, porque isso mexeria no hash de integridade
  // de um periodo que ja foi assinado.
  registrarCorrecaoPendencia_('Data inválida', {
    aba: L, coluna: COL_LANC.DATA, tipo: 'data', rotulo: 'Data do lançamento',
    travaCompetencia: true,
    ajuda: 'a data define a competência; mês já fechado é recusado' });

  registrarCorrecaoPendencia_('Lançamento em período futuro', {
    aba: L, coluna: COL_LANC.DATA, tipo: 'data', rotulo: 'Data do lançamento',
    travaCompetencia: true,
    ajuda: 'a data define a competência; mês já fechado é recusado' });

  registrarCorrecaoPendencia_('Data de odômetro inválida', {
    aba: O, coluna: 1, tipo: 'data', rotulo: 'Data da leitura',
    travaCompetencia: true });

  registrarCorrecaoPendencia_('Leitura de KM em período futuro', {
    aba: O, coluna: 1, tipo: 'data', rotulo: 'Data da leitura',
    travaCompetencia: true });

  // ---- placa do lancamento. Corrigir aqui e melhor que cadastrar um veiculo
  // fantasma so para a pendencia sumir.
  registrarCorrecaoPendencia_('Placa não cadastrada em Veículos', {
    aba: L, coluna: COL_LANC.PLACA, tipo: 'lista', rotulo: 'Placa / ID',
    ajuda: 'escolha o veículo certo; se a placa existe mesmo, cadastre-a em Veículos',
    lista: 'placas' });

  // ---- cadastro do veiculo (ADMIN, localizado pela placa)
  registrarCorrecaoPendencia_('Lançamento do período em veículo inativo', {
    aba: V, coluna: COL_VEIC.ATIVO, tipo: 'lista', rotulo: 'Situação do veículo',
    localizar: 'placa', perfil: 'ADMIN',
    ajuda: 'reative se ele voltou a rodar; se o lançamento é que está errado, corrija a placa dele',
    lista: 'situacao' });

  registrarCorrecaoPendencia_('Centro de custo do veículo ativo não existe na aba Centros de Custo', {
    aba: V, coluna: COL_VEIC.CENTRO, tipo: 'lista', rotulo: 'Centro de custo',
    localizar: 'placa', perfil: 'ADMIN',
    lista: 'centros' });

  registrarCorrecaoPendencia_('Código Patrimônio duplicado', {
    aba: V, coluna: COL_VEIC.CODIGO, tipo: 'texto', rotulo: 'Código Patrimônio',
    localizar: 'placa', perfil: 'ADMIN',
    ajuda: 'informe o código correto deste veículo; o outro continua como está' });

  // ---- celulas do cadastro com erro de formula (#REF!, #N/A...). O nome do campo
  // vem no proprio texto do problema, entao a busca e por PREFIXO.
  registrarCorrecaoPendenciaPorPrefixo_('Descrição do veículo com erro', {
    aba: V, coluna: COL_VEIC.DESCRICAO, tipo: 'texto', rotulo: 'Descrição',
    localizar: 'placa', perfil: 'ADMIN' });

  registrarCorrecaoPendenciaPorPrefixo_('Categoria do veículo com erro', {
    aba: V, coluna: COL_VEIC.CATEGORIA, tipo: 'lista', rotulo: 'Categoria',
    localizar: 'placa', perfil: 'ADMIN',
    lista: 'categorias' });

  registrarCorrecaoPendenciaPorPrefixo_('Centro de Custo do veículo com erro', {
    aba: V, coluna: COL_VEIC.CENTRO, tipo: 'lista', rotulo: 'Centro de custo',
    localizar: 'placa', perfil: 'ADMIN',
    lista: 'centros' });

  // Preço fora da curva não tem UM culpado: a razão pode estar errada pelo
  // valor ou pela quantidade, e só quem olha o lançamento sabe qual. Oferece os
  // dois e grava o que for preenchido — exigir ambos obrigaria a redigitar um
  // número que já está certo, que é como se erra um número certo.
  registrarCorrecaoPendencia_('Preço por quilo fora da curva', {
    aba: L, campos: [
      { chave: 'valor', coluna: COL_LANC.VALOR, tipo: 'numero', rotulo: 'Valor R$',
        minimoNumero: 0, ajuda: 'o que a nota realmente cobrou' },
      { chave: 'quantidade', coluna: COL_LANC.LITROS, tipo: 'numero',
        rotulo: 'Quantidade (kg)', minimoNumero: 0,
        ajuda: 'quilos do botijão: P13 = 13, P20 = 20, P45 = 45' },
    ] });

  registrarCorrecaoPendencia_('Preço por litro fora da curva', {
    aba: L, campos: [
      { chave: 'valor', coluna: COL_LANC.VALOR, tipo: 'numero', rotulo: 'Valor R$',
        minimoNumero: 0, ajuda: 'o que a nota realmente cobrou' },
      { chave: 'quantidade', coluna: COL_LANC.LITROS, tipo: 'numero',
        rotulo: 'Litros', minimoNumero: 0, ajuda: 'litros abastecidos' },
    ] });

  registrarCorrecaoPendencia_('KM/horímetro inválido', {
    aba: O, coluna: 3, tipo: 'numero', rotulo: 'KM / horímetro', minimoNumero: 0 });

  registrarCorrecaoPendencia_('Leitura de KM menor que a anterior', {
    aba: O, coluna: 3, tipo: 'numero', rotulo: 'KM / horímetro', minimoNumero: 0,
    ajuda: 'confira o odômetro do veículo; leitura que retrocede quebra o KM rodado' });

  // Veiculos nao tem numero de linha na pendencia: a linha e achada pela placa.
  // Cadastro de veiculo e ADMIN em todo o resto do sistema (webSalvarVeiculo);
  // seria incoerente o operador alterar o mesmo campo por esta porta.
  registrarCorrecaoPendencia_('Veículo ativo sem centro de custo', {
    aba: V, coluna: COL_VEIC.CENTRO, tipo: 'lista', rotulo: 'Centro de custo',
    localizar: 'placa', perfil: 'ADMIN',
    lista: 'centros' });

  registrarCorrecaoPendencia_('Veículo ativo sem categoria', {
    aba: V, coluna: COL_VEIC.CATEGORIA, tipo: 'lista', rotulo: 'Categoria',
    localizar: 'placa', perfil: 'ADMIN',
    lista: 'categorias' });
})();

/**
 * Pendencias que NAO se resolvem por um campo, mas tem um caminho certo.
 *
 * Antes a tela nao dizia nada e o operador ficava com Status/Observacao, que e
 * o mesmo que nada. Aqui ela aponta o que fazer: ou um botao que executa a
 * rotina que ja existe, ou um atalho para a tela onde aquilo se resolve.
 *
 *   tipo 'rotina' -> botao que chama a funcao nomeada em `executar`
 *   tipo 'atalho' -> botao que abre a tela `tela`
 */
const ACOES_PENDENCIA_ = {
  'Lançamento sem ID de auditoria': {
    tipo: 'rotina', executar: 'ids', rotulo: 'Gerar os IDs que faltam',
    explicacao: 'O ID é gerado pelo sistema, não digitado. A rotina preenche ' +
      'todos os lançamentos que estão sem ele.' },
  'ID de lançamento duplicado': {
    tipo: 'rotina', executar: 'ids', rotulo: 'Gerar os IDs que faltam',
    explicacao: 'Se um dos lançamentos ficou sem ID, a rotina resolve. Dois ' +
      'lançamentos com o MESMO ID preenchido precisam de olho humano: um deles ' +
      'costuma ser cópia indevida do outro.' },
  'Soma dos percentuais de rateio não fecha 100%': {
    tipo: 'atalho', tela: 'centros', rotulo: 'Abrir centros de custo',
    explicacao: 'Não é um campo só: os percentuais se ajustam em conjunto, na ' +
      'tela de centros, e valem para a competência aberta.' },
  'Depreciação mensal não lançada': {
    tipo: 'atalho', tela: 'depreciacao', rotulo: 'Abrir depreciação mensal',
    explicacao: 'A depreciação é lançada em lote pelo botão “Gerar pendentes”, ' +
      'no último dia do período.' },
  'Depreciação mensal divergente': {
    tipo: 'atalho', tela: 'depreciacao', rotulo: 'Abrir depreciação mensal',
    explicacao: 'O valor lançado não bate com o cadastro. Confira os dois antes ' +
      'de relançar — mexer num campo só esconderia a diferença em vez de explicá-la.' },
  'Depreciação lançada fora do último dia do período': {
    tipo: 'atalho', tela: 'depreciacao', rotulo: 'Abrir depreciação mensal',
    explicacao: 'A data do lançamento é que está errada, e mudá-la pode trocar a ' +
      'competência. Trate pela tela de depreciação.' },
  'Abasteceu mas não tem KM rodado no período': {
    tipo: 'atalho', tela: 'lancar', rotulo: 'Lançar leitura de odômetro',
    explicacao: 'Falta uma LEITURA nova, não um campo errado: o KM rodado precisa ' +
      'de pelo menos duas leituras no período.' },
  'Sem nenhum custo no período': {
    tipo: 'informativo',
    explicacao: 'Não é defeito: o veículo simplesmente não teve despesa no período. ' +
      'Se ele parou de rodar de vez, o certo é inativá-lo no cadastro.' },
};

function acaoDaPendencia_(problema) {
  return ACOES_PENDENCIA_[String(problema || '').trim()] || null;
}

/** Executa a rotina de reparo associada a uma pendencia. */
function webAcaoPendencia(token, linhaPendencia) {
  autorizarContextoWeb_(token, 'ADMIN');
  const sheetPend = garantirAbaPendencias_(false);
  const alvo = Math.floor(Number(linhaPendencia) || 0);
  if (!sheetPend || alvo < 3 || alvo > sheetPend.getLastRow()) {
    return { ok: false, mensagem: 'Pendência não encontrada. Clique em “Revalidar”.' };
  }
  const problema = String(sheetPend.getRange(alvo, 3).getValue() || '').trim();
  const acao = acaoDaPendencia_(problema);
  if (!acao || acao.tipo !== 'rotina') {
    return { ok: false, mensagem: 'Esta pendência não tem rotina automática.' };
  }

  let feito;
  if (acao.executar === 'ids') feito = garantirIdsLancamentos_();
  else return { ok: false, mensagem: 'Rotina desconhecida: ' + acao.executar + '.' };

  invalidarCachesDaAba_(ABAS.LANCAMENTOS);
  registrarLog_('Rotina de pendência', problema + ' • ' + acao.executar + ' • ' + feito + ' item(ns)');
  const revalidacao = revalidarPendenciasSeguro_();
  if (!revalidacao.ok) {
    return { ok: true, revalidou: false, pendentes: null,
      mensagem: feito + ' lançamento(s) receberam ID. MAS a lista não pôde ser ' +
        'refeita: ' + revalidacao.erro + ' — rode "Instalar / atualizar sistema".' };
  }
  return {
    ok: true, revalidou: true,
    mensagem: feito + ' lançamento(s) receberam ID. ' +
      revalidacao.pendentes + ' pendência(s) em aberto.',
    pendentes: revalidacao.pendentes,
  };
}

/** Coluna da placa em cada aba, para a reverificacao do alvo. */
function colunaPlacaDaAba_(aba) {
  if (aba === ABAS.LANCAMENTOS) return COL_LANC.PLACA;
  if (aba === ABAS.ODOMETRO) return 2;
  if (aba === ABAS.VEICULOS) return COL_VEIC.PLACA;
  return 0;
}

/**
 * Numero da linha alvo, extraido do detalhe da pendencia ("linha 35 • ...").
 *
 * O formato e gerado pelo proprio coletor, sempre com esse prefixo. Quando nao
 * casa, a pendencia simplesmente nao e corrigivel pela tela — que e o padrao
 * seguro: melhor nao oferecer o campo do que gravar na linha errada.
 */
function linhaAlvoPendencia_(detalhe) {
  const texto = String(detalhe || '').trim();
  const padrao = /^linha\s+(\d+)\b/.exec(texto);
  if (padrao) return Number(padrao[1]);
  // Rede de seguranca para detalhes que escrevem "(linha 96)" no fim. O formato
  // oficial e o prefixo — ha regra estatica na suite cobrando isso —, mas um
  // parser rigido demais transforma divergencia de texto em campo que some da
  // tela sem erro nenhum, que foi exatamente o que aconteceu com a leitura de
  // KM retrocedida.
  const solto = /\blinha\s+(\d+)\b/.exec(texto);
  return solto ? Number(solto[1]) : 0;
}

/** Descricao da correcao possivel para uma pendencia, ou null. */
function correcaoDaPendencia_(origem, problema, detalhe, placa) {
  const spec = specDaPendencia_(problema);
  if (!spec) return null;
  if (spec.aba !== origem) return null;
  const porPlaca = spec.localizar === 'placa';
  const linha = porPlaca ? 0 : linhaAlvoPendencia_(detalhe);
  if (!porPlaca && linha < 2) return null;
  if (porPlaca && !String(placa || '').trim()) return null;
  return {
    aba: spec.aba, linha: linha, somenteAdmin: spec.perfil === 'ADMIN',
    campos: camposDaSpec_(spec).map(function (c) {
      return { chave: c.chave, tipo: c.tipo, rotulo: c.rotulo,
        ajuda: c.ajuda || '', lista: c.lista || null };
    }),
  };
}

/**
 * Localiza e CONFERE a linha que a correcao vai tocar.
 *
 * A reverificacao nao e zelo excessivo. O numero da linha foi gravado quando a
 * conferencia rodou; se alguem apagou uma linha de Lançamentos desde entao, a
 * "linha 35" aponta hoje para outro lancamento — e gravar ali corromperia um
 * registro que estava certo, em silencio. Conferir a placa antes de escrever e
 * o que impede isso.
 */
function alvoCorrecaoPendencia_(spec, linhaAlvo, placaEsperada) {
  const sheet = aba_(spec.aba);
  const colPlaca = colunaPlacaDaAba_(spec.aba);
  const esperada = normalizaPlaca_(placaEsperada);

  if (spec.localizar === 'placa') {
    if (!esperada) return { ok: false, mensagem: 'A pendência não tem placa para localizar o cadastro.' };
    const ultima = sheet.getLastRow();
    if (ultima < 2) return { ok: false, mensagem: 'A aba ' + spec.aba + ' está vazia.' };
    const placas = sheet.getRange(2, colPlaca, ultima - 1, 1).getValues();
    for (let i = 0; i < placas.length; i++) {
      if (normalizaPlaca_(placas[i][0]) === esperada) return { ok: true, sheet: sheet, linha: i + 2 };
    }
    return { ok: false, mensagem: 'Placa ' + placaEsperada + ' não encontrada em ' + spec.aba + '.' };
  }

  if (linhaAlvo < 2 || linhaAlvo > sheet.getLastRow()) {
    return { ok: false, mensagem: 'A linha ' + linhaAlvo + ' não existe mais em ' + spec.aba +
      '. Clique em “Revalidar” para a lista ser refeita.' };
  }
  const atual = normalizaPlaca_(sheet.getRange(linhaAlvo, colPlaca).getValue());
  if (esperada && atual !== esperada) {
    return { ok: false, mensagem: 'A linha ' + linhaAlvo + ' de ' + spec.aba + ' não é mais do ' +
      'veículo ' + placaEsperada + ' (está como ' + (atual || 'vazia') + '). A base mudou desde a ' +
      'última conferência — clique em “Revalidar” antes de corrigir.' };
  }
  return { ok: true, sheet: sheet, linha: linhaAlvo };
}

/** Competencias ja fechadas, lidas do Historico. */
function competenciasFechadas_() {
  const fechadas = {};
  const hist = ss_().getSheetByName(ABAS.HISTORICO);
  if (hist && hist.getLastRow() >= 2) {
    hist.getRange(2, 1, hist.getLastRow() - 1, 1).getDisplayValues().forEach(function (l) {
      const m = String(l[0] || '').trim();
      if (/^\d{4}-\d{2}$/.test(m)) fechadas[m] = true;
    });
  }
  return fechadas;
}

/**
 * Impede que uma correcao de data toque um periodo ja fechado.
 *
 * Confere os DOIS lados. A data nova obviamente — ninguem pode empurrar despesa
 * para dentro de um mes assinado. Mas a velha tambem: tirar um lancamento de um
 * mes fechado muda o total e o hash dele por tras, e o fechamento deixa de
 * valer sem ninguem saber. Nos dois casos a correcao e recusada e a saida e
 * reabrir a competencia, de proposito e por escrito.
 */
function travaCompetenciaFechada_(dataAntiga, dataNova) {
  const fechadas = competenciasFechadas_();
  const lados = [
    { rotulo: 'A data atual', data: dataAntiga },
    { rotulo: 'A data nova', data: dataNova },
  ];
  for (let i = 0; i < lados.length; i++) {
    const d = lados[i].data;
    if (!(d instanceof Date) || isNaN(d.getTime())) continue;
    const mes = mesCompetenciaDaData_(d);
    if (fechadas[mes]) {
      return { ok: false, mensagem: lados[i].rotulo + ' cai na competência ' + mes +
        ', que já foi fechada. Corrigir aqui mudaria o total e o hash de um período ' +
        'assinado. Reabra a competência antes, se for mesmo o caso.' };
    }
  }
  return { ok: true };
}

/** Converte e valida o valor digitado conforme o tipo do campo. */
function valorCorrecaoPendencia_(spec, bruto) {
  if (spec.tipo === 'data') {
    // O <input type="date"> manda AAAA-MM-DD. Montar com new Date(texto) leria
    // como UTC e poderia voltar um dia em fuso negativo — o que, num sistema com
    // corte no dia 25, joga o lancamento para a competencia anterior.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(bruto || '').trim());
    if (!m) return { ok: false, mensagem: spec.rotulo + ': informe uma data válida.' };
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
    if (isNaN(d.getTime()) || d.getDate() !== Number(m[3])) {
      return { ok: false, mensagem: spec.rotulo + ': essa data não existe.' };
    }
    const limite = new Date();
    limite.setFullYear(limite.getFullYear() + 1);
    if (d > limite) {
      return { ok: false, mensagem: spec.rotulo + ': data mais de um ano no futuro.' };
    }
    return { ok: true, valor: d };
  }
  if (spec.tipo === 'numero') {
    const texto = String(bruto === undefined || bruto === null ? '' : bruto).trim()
      .replace(/\./g, '').replace(',', '.');
    const n = texto === '' ? NaN : Number(texto);
    if (!isFinite(n)) return { ok: false, mensagem: spec.rotulo + ': informe um número.' };
    if (spec.minimoNumero !== undefined && n < spec.minimoNumero) {
      return { ok: false, mensagem: spec.rotulo + ': não pode ser menor que ' + spec.minimoNumero + '.' };
    }
    return { ok: true, valor: n };
  }
  const texto = String(bruto === undefined || bruto === null ? '' : bruto).trim();
  if (spec.tipo === 'lista') {
    const opcoes = opcoesDaLista_(spec.lista);
    if (opcoes.indexOf(texto) === -1) {
      return { ok: false, mensagem: spec.rotulo + ': escolha uma das opções da lista.' };
    }
    return { ok: true, valor: texto };
  }
  if (!texto) return { ok: false, mensagem: spec.rotulo + ' não pode ficar em branco.' };
  if (spec.minimo && texto.length < spec.minimo) {
    return { ok: false, mensagem: spec.rotulo + ': escreva pelo menos ' + spec.minimo + ' caracteres. ' +
      'Um texto genérico não ajuda ninguém na hora de cobrar garantia.' };
  }
  return { ok: true, valor: texto.slice(0, 300) };
}

/**
 * Grava a correcao na base e refaz a conferencia.
 *
 * Revalida no fim de proposito: a pendencia tem de sumir porque o problema
 * acabou, nao porque alguem a marcou como resolvida.
 */
function webCorrigirPendencia(token, linhaPendencia, valorNovo) {
  const sessao = autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  const sheetPend = garantirAbaPendencias_(false);
  const alvoLinha = Math.floor(Number(linhaPendencia) || 0);
  if (!sheetPend || alvoLinha < 3 || alvoLinha > sheetPend.getLastRow()) {
    return { ok: false, mensagem: 'Pendência não encontrada. Clique em “Revalidar”.' };
  }
  const p = sheetPend.getRange(alvoLinha, 1, 1, 4).getValues()[0];
  const origem = String(p[0] || '').trim();
  const placa = String(p[1] || '').trim();
  const problema = String(p[2] || '').trim();
  const detalhe = String(p[3] || '').trim();

  const spec = specDaPendencia_(problema);
  if (!spec || spec.aba !== origem) {
    return { ok: false, mensagem: 'Esta pendência não se resolve por um campo só; ' +
      'é preciso tratá-la na planilha.' };
  }
  if (spec.perfil === 'ADMIN' && sessao.perfil !== 'ADMIN') {
    return { ok: false, mensagem: 'Esta correção mexe no cadastro do veículo — só ADMIN.' };
  }

  // O valor chega como escalar (campo unico, formato antigo) ou como objeto
  // {chave: valor} quando a pendencia oferece mais de um campo.
  const campos = camposDaSpec_(spec);
  const escalar = valorNovo === null || typeof valorNovo !== 'object';
  // Escalar so vale quando a pendencia tem UM campo. Numa de dois, um escalar
  // vindo de aba antiga iria para o primeiro campo — gravando VALOR onde o
  // operador quis dizer QUANTIDADE, e estragando um numero que estava certo.
  if (escalar && campos.length > 1) {
    return { ok: false, recarregar: true,
      mensagem: 'Esta pendência agora tem mais de um campo. Atualize a página ' +
        'para a tela carregar os campos novos.' };
  }
  const entrada = escalar ? { valor: valorNovo } : valorNovo;

  // So o que foi preenchido e gravado: na pendencia de preco, o operador corrige
  // o valor OU a quantidade, nao os dois. Exigir ambos o obrigaria a redigitar
  // um numero certo, que e como se erra um numero certo.
  const aplicar = [];
  for (let i = 0; i < campos.length; i++) {
    const c = campos[i];
    const bruto = entrada[c.chave];
    if (bruto === undefined || bruto === null || String(bruto).trim() === '') continue;
    const convertido = valorCorrecaoPendencia_(c, bruto);
    if (!convertido.ok) return { ok: false, mensagem: convertido.mensagem };
    aplicar.push({ campo: c, valor: convertido.valor });
  }
  if (!aplicar.length) {
    return { ok: false, mensagem: campos.length > 1
      ? 'Preencha o campo que está errado — pode ser só um dos dois.'
      : campos[0].rotulo + ': informe o valor correto.' };
  }

  const alvo = alvoCorrecaoPendencia_(spec, linhaAlvoPendencia_(detalhe), placa);
  if (!alvo.ok) return { ok: false, mensagem: alvo.mensagem };

  // Confere a trava de competencia ANTES de gravar qualquer campo: metade
  // gravada e pior que nada gravado.
  for (let i = 0; i < aplicar.length; i++) {
    if (!aplicar[i].campo.travaCompetencia) continue;
    const anteriorData = alvo.sheet.getRange(alvo.linha, aplicar[i].campo.coluna).getValue();
    const trava = travaCompetenciaFechada_(anteriorData, aplicar[i].valor);
    if (!trava.ok) return { ok: false, mensagem: trava.mensagem };
  }

  const mudancas = [];
  aplicar.forEach(function (a) {
    const celula = alvo.sheet.getRange(alvo.linha, a.campo.coluna);
    const anterior = celula.getValue();
    celula.setValue(a.valor);
    if (a.campo.tipo === 'data') celula.setNumberFormat('dd/mm/yyyy');
    mudancas.push(a.campo.rotulo + ': "' +
      String(anterior === '' ? '(vazio)' : anterior) + '" -> "' + a.valor + '"');
  });

  invalidarCachesDaAba_(spec.aba);
  registrarLog_('Corrigir pendência',
    problema + ' • ' + spec.aba + ' linha ' + alvo.linha + ' • ' + mudancas.join(' • '));

  // Refaz a conferencia inteira: corrigir um campo pode resolver mais de uma
  // pendencia da mesma linha, e deixar as outras na tela seria mentira.
  const revalidacao = revalidarPendenciasSeguro_();
  const gravou = aplicar.map(function (a) { return a.campo.rotulo; }).join(' e ') +
    ' gravado em ' + spec.aba + ', linha ' + alvo.linha + '.';
  if (!revalidacao.ok) {
    // O campo FOI gravado; o que falhou foi refazer a lista. Dizer isso com todas
    // as letras, senao o operador acha que a correção não pegou e corrige de novo.
    return {
      ok: true, revalidou: false, pendentes: null,
      mensagem: gravou + ' MAS a lista de pendências não pôde ser refeita, então ' +
        'este item continua aparecendo na tela. Motivo: ' + revalidacao.erro +
        ' — normalmente é a planilha estar numa versão anterior: rode ' +
        '"🚚 Sistema de Frota → Instalar / atualizar sistema" e clique em Revalidar.',
    };
  }
  // O campo foi gravado e a lista foi refeita — mas a condicao pode continuar
  // valendo. Dizer isso agora evita o operador corrigir a mesma coisa de novo
  // achando que o sistema nao gravou.
  const aindaLa = pendenciaAindaPresente_(revalidacao.problemas, origem, placa, problema);
  if (aindaLa) {
    return {
      ok: true, revalidou: true, resolvida: false, pendentes: revalidacao.pendentes,
      mensagem: gravou + ' Mas o problema CONTINUA, agora assim: "' + aindaLa + '". ' +
        'O campo que você corrigiu não é o que está errado neste caso — ' +
        'ajuste o lançamento em "Corrigir / excluir lançamento".',
    };
  }
  return {
    ok: true, revalidou: true, resolvida: true,
    mensagem: gravou + ' Pendência resolvida. ' + revalidacao.pendentes +
      ' em aberto no total.',
    pendentes: revalidacao.pendentes,
  };
}

/** Invalida os caches de execucao afetados por uma escrita na aba. */
function invalidarCachesDaAba_(aba) {
  if (aba === ABAS.LANCAMENTOS) invalidarCacheLancamentos_();
  if (aba === ABAS.ODOMETRO) invalidarCacheOdometro_();
  if (aba === ABAS.VEICULOS) VEICULOS_EXEC_CACHE_ = null;
  if (aba === ABAS.CENTROS) CENTROS_EXEC_CACHE_ = null;
  invalidarCacheInicio_();
  invalidarCacheSaude_();
  marcarResumoDesatualizado_();
}

/** Refaz a conferencia sem deixar um erro dela derrubar a correcao ja gravada. */
/**
 * Refaz a conferencia. Devolve { ok, pendentes, erro }.
 *
 * ATENCAO ao motivo deste formato. Antes devolvia um numero ou `null`, e quem
 * chamava transformava o null numa frase mansa no FIM de uma mensagem de
 * SUCESSO: "...gravado. Conferência não pôde ser refeita agora." O operador lia
 * o verde, corrigia o campo de verdade, e a pendencia continuava na tela — sem
 * nenhuma pista do porque.
 *
 * E a falha nao e hipotetica: coletarProblemas_ chama garantirResumoAtualizado_,
 * que LANCA quando a aba Resumo esta com a largura de uma versao anterior. Quem
 * colou o codigo novo sem rodar "Instalar / atualizar" cai exatamente nisso.
 *
 * Agora o motivo sobe junto e a tela mostra em vermelho.
 */
function revalidarPendenciasSeguro_() {
  // Sem forcar CONTEXTO_SISTEMA_INTERNO_: quem chama ja passou por
  // autorizarContextoWeb_, e manter o contexto do usuario preserva a autoria.
  try {
    const problemas = coletarProblemas_();
    escreverConferencia_(problemas);
    return { ok: true, pendentes: contarPendenciasConferencia_(), problemas: problemas };
  } catch (e) {
    console.error('revalidar pendências: ' + e.message);
    return { ok: false, pendentes: null, erro: e.message };
  }
}

/**
 * A pendencia que acabou de ser corrigida continua sendo coletada?
 *
 * Existe porque "corrigi e continua ali" tem mais de uma causa, e o operador
 * nao tem como distinguir: o campo pode ter sido gravado e a condicao continuar
 * valendo. No caso que motivou isto — "Preço por quilo fora da curva" num
 * botijao de gas — a correcao oferecida e a QUANTIDADE, mas se o errado for o
 * VALOR nenhuma quantidade plausivel resolve, e o item voltava sem explicacao
 * nenhuma.
 *
 * Devolve o detalhe NOVO, que ja traz o numero recalculado.
 */
function pendenciaAindaPresente_(problemas, origem, placa, problema) {
  const alvoPlaca = normalizaPlaca_(placa);
  const achada = (problemas || []).filter(function (p) {
    return String(p[0]) === origem && String(p[2]) === problema &&
      normalizaPlaca_(p[1]) === alvoPlaca;
  })[0];
  return achada ? String(achada[3] || '') : null;
}

/**
 * `esperado` e o texto do problema que a tela estava mostrando naquela linha.
 *
 * Sem ele, bastava alguem revalidar entre o carregamento da tela e o clique em
 * Salvar para a linha 12 passar a ser outra pendencia — e o status ia para o
 * problema errado, em silencio. webCorrigirPendencia ja reverificava o alvo
 * desde a V4.9.1; este endpoint, mais antigo, tinha ficado de fora.
 */
function webAtualizarPendencia(token, linha, status, observacao, esperado) {
  autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  status = String(status || '').trim().toUpperCase();
  if (['PENDENTE', 'EM ANÁLISE', 'RESOLVIDO'].indexOf(status) === -1) {
    return { ok: false, mensagem: 'Status inválido.' };
  }
  const sheet = garantirAbaPendencias_(true);
  linha = Number(linha);
  if (!Number.isInteger(linha) || !(linha >= 3 && linha <= sheet.getLastRow())) return { ok: false, mensagem: 'Pendência não encontrada.' };

  const atual = String(sheet.getRange(linha, 3).getValue() || '').trim();
  const visto = String(esperado || '').trim();
  if (visto && atual !== visto) {
    return { ok: false, recarregar: true,
      mensagem: 'A lista mudou desde que você abriu a tela: a linha ' + linha +
        ' agora é "' + atual + '", não "' + visto + '". Nada foi gravado. ' +
        'A tela vai recarregar.' };
  }

  // RESOLVIDO em problema que tem conserto por campo e um beco sem saida: a
  // V4.11.2 passou a reverter isso na revalidacao seguinte, porque o coletor
  // ainda encontra o problema. O operador marcava, o item sumia pelo filtro, e
  // voltava depois como PENDENTE — "eu resolvo e ela permanece ali". Em vez de
  // aceitar e desfazer pelas costas, recusa na hora e diz o que fazer.
  if (status === 'RESOLVIDO' && !resolvidoSobrevive_(atual)) {
    return { ok: false, mensagem: 'Esta pendência tem conserto: use o botão ' +
      '"Corrigir" acima, que grava o campo na base. Marcar como resolvida não ' +
      'muda o dado — o sistema encontra o problema de novo na próxima ' +
      'verificação e traz o item de volta. Se não for para corrigir agora, ' +
      'deixe em "EM ANÁLISE".' };
  }

  sheet.getRange(linha, 5).setValue(status);
  sheet.getRange(linha, 6).setValue(String(observacao || ''));
  registrarLog_('Atualizar pendência', 'linha ' + linha + ' • ' + atual + ' • ' + status);

  invalidarCacheInicio_();
  return { ok: true, mensagem: status === 'RESOLVIDO' ? 'Pendência marcada como resolvida.' : 'Pendência atualizada.' };
}

function webRevalidarPendencias(token) {
  autorizarContextoWeb_(token, 'ADMIN');
  const problemas = coletarProblemas_();
  escreverConferencia_(problemas);
  invalidarCacheInicio_();
  registrarLog_('Revalidar pendências', problemas.length + ' ponto(s)');
  return webPendencias(token);
}

// ------------------------------------------------------ operações do mês

function webValidar(token) {
  autorizarContextoWeb_(token, 'ADMIN');
  const problemas = coletarProblemas_();
  escreverConferencia_(problemas);
  invalidarCacheInicio_();
  registrarLog_('Validar dados (web)', problemas.length + ' ponto(s)');
  return {
    total: problemas.length,
    colunas: [col_('Origem'), col_('Placa'), col_('Problema'), col_('Detalhe')],
    linhas: problemas,
  };
}

function webAtualizarRelatorios(token) {
  autorizarContextoWeb_(token, 'ADMIN');
  reconstruirRelatorios_();
  invalidarCacheInicio_();
  registrarLog_('Atualizar relatórios (web)', '');
  return 'Relatórios reconstruídos a partir dos lançamentos.';
}

/** Prévia do fechamento: o que vai acontecer, sem executar nada. */
function webPreviaFechamento(token) {
  autorizarContextoWeb_(token, 'ADMIN');
  const mesRef = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const periodo = periodoAtual_();
  const problemas = coletarProblemas_();
  escreverConferencia_(problemas);
  const resumo = lerResumo_();
  const total = resumo.reduce(function (s, l) { return s + (Number(l[R_.TOTAL]) || 0); }, 0);
  return {
    mes: mesRef,
    mesExtenso: nomeDoMes_(mesRef),
    periodo: formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim),
    total: total,
    proximo: nomeDoMes_(proximoMes_(mesRef)),
    pendencias: contarPendenciasConferencia_(),
    depreciacao: statusDepreciacaoMensal_(),
  };
}

/** Executa o fechamento. Exige a confirmação explícita do mês. */
function webFecharPeriodo(token, confirmacao) {
  autorizarContextoWeb_(token, 'ADMIN');
  const mesRef = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  if (String(confirmacao).trim() !== mesRef) {
    return { ok: false, mensagem: 'Confirmação não confere. Digite exatamente ' + mesRef + '.' };
  }
  const r = executarFechamentoCritico_(mesRef);
  if (!r.ok) return r;
  return {
    ok: true,
    mensagem: nomeDoMes_(mesRef) + ' fechado em R$ ' +
      Number(r.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) +
      '. Agora aberto em ' + nomeDoMes_(proximoMes_(mesRef)) + '.',
    backup: r.backup,
    exportacao: r.exportacao
  };
}

// ------------------------------------------------- parâmetros e atividade

function webParametros(token) {
  exigirPerfilToken_(token, 'ADMIN');
  const sheet = aba_(ABAS.PARAMETROS);
  const total = PARAMETROS_PADRAO.length;
  const dados = sheet.getRange(LINHA_PARAM_INICIAL, 1, total, 3).getValues();
  return dados.filter(function (l) { return l[0]; }).map(function (l) {
    const nome = String(l[0]);
    // DIA_FIM_PERIODO virou editável em V4.7.2. DIA_INICIO_PERIODO continua travado
    // porque é derivado do corte, não um valor independente.
    let valor = String(l[1]);
    if (nome === 'MES_REFERENCIA') { try { valor = normalizarMesReferencia_(l[1]); } catch (e) {} }
    // V4.8: a competência (período aberto) passou a ser editável pelo ADMIN.
    return { nome: nome, valor: valor, descricao: String(l[2]),
      editavel: nome !== 'DIA_INICIO_PERIODO' };
  });
}

function webSalvarParametro(token, nome, valor) {
  autorizarContextoWeb_(token, 'ADMIN');
  let recalcularCompetencia = false;
  const permitidos = PARAMETROS_PADRAO.map(function (p) { return p[0]; });
  if (permitidos.indexOf(nome) === -1) return { ok: false, mensagem: 'Parâmetro desconhecido.' };
  let avisoPeriodo = '';
  if (nome === 'MES_REFERENCIA') {
    // V4.8: liberado para o ADMIN. Muda o período aberto (datas aceitas nos lançamentos
    // e o período de todos os relatórios). Não mexe em nenhum lançamento.
    try { valor = normalizarMesReferencia_(valor); }
    catch (e) { return { ok: false, mensagem: 'Período inválido. Use o formato AAAA-MM, por exemplo 2026-09.' }; }
    const anterior = normalizarMesReferencia_(param_('MES_REFERENCIA'));
    if (valor === anterior) return { ok: true, mensagem: 'O período aberto já é ' + nomeDoMes_(valor) + '.' };
    if (ss_().getSheetByName('Fechado ' + valor)) {
      avisoPeriodo = ' Atenção: ' + nomeDoMes_(valor) + ' já tinha sido fechado; lançamentos novos nele vão ' +
        'divergir do fechamento guardado (a Auditoria vai apontar).';
    }
    CORTE_COMPETENCIA_EXEC_ = null;
  }
  if (nome === 'DIA_INICIO_PERIODO') {
    return { ok: false, mensagem: 'O dia de abertura é derivado do dia de corte. Altere DIA_FIM_PERIODO.' };
  }
  if (nome === 'DIA_FIM_PERIODO') {
    const corte = Math.floor(Number(String(valor).replace(',', '.')));
    if (!isFinite(corte) || corte < 1 || corte > 31) {
      return { ok: false, mensagem: 'O dia de corte precisa ser um número de 1 a 31. Use 28 ou mais para fechar por mês civil (dia 1 ao último dia).' };
    }
    valor = corte;
    limparPeriodoLivre_();   // mudar o corte = voltar à regra do corte (sai das datas livres)
    // Mudar o corte reescreve a competência de TODA a base: lançamentos mudam de mês.
    // reconstruirRelatorios_() no fim não basta — quem redesenha a fórmula da coluna
    // Período é formatarLancamentos_, e ela tem de rodar ANTES dos relatórios.
    recalcularCompetencia = true;
  }
  if (nome === 'CUSTO_HORA_MOTORISTA') {
    valor = Number(String(valor).replace(',', '.'));
    if (!isFinite(valor) || valor < 0 || valor > 1000000) return { ok: false, mensagem: 'CUSTO_HORA_MOTORISTA precisa ser um número não negativo e dentro de uma faixa plausível.' };
  }
  if (nome === 'EMPRESA') {
    valor = String(valor || '').trim().slice(0, 150);
    if (!valor) return { ok: false, mensagem: 'EMPRESA não pode ficar vazia.' };
  }
  if (nome === 'DOMINIOS_LOGIN') {
    const normalizado = normalizarDominiosLogin_(valor);
    if (!normalizado.dominios.length) return { ok: false, mensagem: 'Informe pelo menos um domínio corporativo em DOMINIOS_LOGIN.' };
    if (normalizado.invalidos.length) return { ok: false, mensagem: 'Domínio inválido: ' + normalizado.invalidos.join(', ') + '.' };
    valor = normalizado.valor;
  }
  if (nome === 'BASE_RATEIO') {
    valor = String(valor || '').trim().slice(0, 500);
    if (!valor) return { ok: false, mensagem: 'BASE_RATEIO não pode ficar vazia.' };
  }
  if (nome === 'EMAIL_ALERTAS') {
    // Vazio e valido: e como se desliga o alerta diario.
    valor = String(valor || '').trim().slice(0, 500);
    if (valor) {
      const invalidos = valor.split(/[,;]/).map(function (e) { return e.trim(); })
        .filter(function (e) { return e && (e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)); });
      if (invalidos.length) {
        return { ok: false, mensagem: 'E-mail inválido em EMAIL_ALERTAS: ' + invalidos.join(', ') + '.' };
      }
    }
  }
  if (nome === 'HORA_ALERTA') {
    const hora = Math.floor(Number(valor));
    if (!isFinite(hora) || hora < 0 || hora > 23) {
      return { ok: false, mensagem: 'HORA_ALERTA precisa ser um número de 0 a 23.' };
    }
    valor = hora;
  }
  if (nome === 'ESTOQUE_MINIMO_L') {
    const litros = Number(String(valor).replace(',', '.'));
    if (!isFinite(litros) || litros < 0) {
      return { ok: false, mensagem: 'ESTOQUE_MINIMO_L precisa ser um número maior ou igual a zero.' };
    }
    valor = litros;
  }
  gravarParam_(nome, valor);
  // O gatilho guarda a hora dentro dele; mudar o parametro sem recria-lo deixaria
  // o alerta saindo no horario antigo para sempre.
  if (nome === 'HORA_ALERTA') {
    try { garantirTriggerAlertaDiario_(); }
    catch (e) { console.error('recriar gatilho do alerta: ' + e.message); }
  }
  if (recalcularCompetencia) {
    // gravarParam_ já zerou PARAM_EXEC_CACHE_, então aqui a fórmula nova
    // sai com o corte novo.
    const contextoAnterior = CONTEXTO_SISTEMA_INTERNO_;
    CONTEXTO_SISTEMA_INTERNO_ = true;
    try {
      gravarParam_('DIA_INICIO_PERIODO', diaInicioPeriodo_());   // derivado, acompanha
      formatarLancamentos_();
    } finally {
      CONTEXTO_SISTEMA_INTERNO_ = contextoAnterior;
    }
  }
  reconstruirRelatorios_();
  montarCentralOperacional_();
  invalidarCacheInicio_();
  invalidarCacheSaude_();
  registrarLog_('Alterar parâmetro (web)', nome + ' = ' + valor);
  if (nome === 'MES_REFERENCIA') {
    const p = periodoAtual_();
    return { ok: true, recarregar: true, mensagem: 'Período aberto alterado para ' + nomeDoMes_(valor) + ' (' +
      formatarData_(p.inicio) + ' a ' + formatarData_(p.fim) + '). Relatórios recalculados.' + avisoPeriodo };
  }
  return {
    ok: true,
    mensagem: recalcularCompetencia
      ? 'Dia de corte alterado para ' + valor + '. Período: ' +
        (ehMesCivil_() ? 'mês civil (dia 1 ao último dia)'
          : 'dia ' + diaInicioPeriodo_() + ' do mês anterior ao dia ' + valor) +
        '. Competência e relatórios recalculados.'
      : nome + ' atualizado e relatórios sincronizados automaticamente.'
  };
}

// ------------------------------------------- fornecedores e carga na bomba (web)

function webFornecedores(token, busca) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const termo = String(busca || '').toUpperCase().trim();
  const dados = dadosFornecedoresExecucao_().filter(function (l) {
    if (!termo) return true;
    return (String(l[COL_FORN.NOME - 1]) + ' ' + String(l[COL_FORN.CNPJ - 1]) + ' ' +
      String(l[COL_FORN.TIPO - 1])).toUpperCase().indexOf(termo) !== -1;
  });
  return {
    colunas: [col_('Fornecedor'), col_('CNPJ'), col_('Ramo'), col_('Ativo'), col_('Observação')],
    linhas: dados.map(function (l) {
      return [l[COL_FORN.NOME - 1], l[COL_FORN.CNPJ - 1], l[COL_FORN.TIPO - 1],
        String(l[COL_FORN.ATIVO - 1] || 'SIM').toUpperCase() === 'NAO' ? 'NAO' : 'SIM',
        l[COL_FORN.OBSERVACAO - 1]];
    }),
    mensagem: dados.length + ' fornecedor(es).',
  };
}

function webSalvarFornecedor(token, dados) {
  autorizarContextoWeb_(token, 'ADMIN');
  const nome = String((dados && dados.nome) || '').trim().slice(0, 180);
  if (!nome) return { ok: false, mensagem: 'Informe o nome do fornecedor.' };
  const tipo = String((dados && dados.tipo) || '').trim().slice(0, 120);
  if (tipo && TIPOS_FORNECEDOR.indexOf(tipo) === -1) {
    return { ok: false, mensagem: 'Ramo inválido: ' + tipo + '.' };
  }
  // So os digitos: e o que faz "12.345.678/0001-90" e "12345678000190" serem o
  // mesmo CNPJ na hora de detectar duplicata.
  const cnpj = String((dados && dados.cnpj) || '').replace(/\D/g, '').slice(0, 14);
  const observacao = String((dados && dados.observacao) || '').trim().slice(0, 500);
  const ativo = dados && dados.ativo === false ? 'NAO' : 'SIM';

  const sheet = aba_(ABAS.FORNECEDORES);
  const existentes = dadosFornecedoresExecucao_();
  const alvo = nome.toUpperCase();
  let indice = -1;
  for (let i = 0; i < existentes.length; i++) {
    if (String(existentes[i][COL_FORN.NOME - 1]).trim().toUpperCase() === alvo) { indice = i; break; }
  }
  if (cnpj) {
    const conflito = existentes.filter(function (l, i) {
      return i !== indice &&
        String(l[COL_FORN.CNPJ - 1] || '').replace(/\D/g, '') === cnpj;
    })[0];
    if (conflito) {
      return { ok: false, mensagem: 'Este CNPJ já está cadastrado para "' +
        conflito[COL_FORN.NOME - 1] + '".' };
    }
  }

  const linha = [nome, cnpj, tipo, ativo, observacao];
  const destino = indice === -1 ? Math.max(sheet.getLastRow() + 1, 2) : indice + 2;
  garantirLinhas_(sheet, destino);
  sheet.getRange(destino, 1, 1, linha.length).setValues([linha]);
  sheet.getRange(destino, COL_FORN.CNPJ).setNumberFormat('@');
  invalidarCacheFornecedores_();
  registrarLog_('Cadastro de fornecedor', (indice === -1 ? 'novo: ' : 'alterado: ') + nome);
  return { ok: true, mensagem: 'Fornecedor ' + nome + (indice === -1 ? ' cadastrado.' : ' atualizado.') };
}

/** Situacao dos tanques: o que o operador precisa ver antes de abastecer. */
function webTanques(token) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const linhas = PRODUTOS_BOMBA.map(function (produto) {
    const e = estadoTanque_(produto, null);
    return [produto, e.litros, e.valor, e.custoMedio, e.litrosSemLastro];
  });
  return {
    colunas: [col_('Produto'), col_('Saldo (L)', 'decimal'), col_('Valor em estoque', 'moeda'),
      col_('Custo médio R$/L', 'moeda3'), col_('Saída sem carga (L)', 'decimal')],
    linhas: linhas,
    mensagem: 'Custo médio ponderado móvel: cada carga recalcula o saldo inteiro.',
  };
}

function webCargasBomba(token, limite) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const quantas = Math.max(1, Math.min(500, Math.floor(Number(limite || 100)) || 100));
  const dados = lerCargasBomba_().slice(-quantas).reverse();
  return {
    itens: dados.map(function (c) {
      return { linha: c.linha, data: Utilities.formatDate(c[COL_CARGA.DATA - 1], timezone_(), 'yyyy-MM-dd'),
        documento: String(c[COL_CARGA.DOCUMENTO - 1] || ''), produto: String(c[COL_CARGA.PRODUTO - 1] || ''),
        quantidade: Number(c[COL_CARGA.QUANTIDADE - 1]) || 0, valor: Number(c[COL_CARGA.VALOR - 1]) || 0,
        observacao: String(c[COL_CARGA.OBSERVACAO - 1] || ''),
        ajuste: ehAjusteEstoque_(c[COL_CARGA.DOCUMENTO - 1]) };
    }),
    colunas: [col_('Data', 'data'), col_('NF / Documento'), col_('Produto'),
      col_('Quantidade (L)', 'decimal'), col_('Valor', 'moeda'), col_('R$ / Litro', 'moeda3'),
      col_('Observação')],
    linhas: dados.map(function (c) {
      const litros = Number(c[COL_CARGA.QUANTIDADE - 1]) || 0;
      const valor = Number(c[COL_CARGA.VALOR - 1]) || 0;
      return [formatarData_(c[COL_CARGA.DATA - 1]), c[COL_CARGA.DOCUMENTO - 1],
        c[COL_CARGA.PRODUTO - 1], litros, valor, litros > 0 ? valor / litros : 0,
        c[COL_CARGA.OBSERVACAO - 1]];
    }),
    totais: [null, null, null,
      dados.reduce(function (t, c) { return t + (Number(c[COL_CARGA.QUANTIDADE - 1]) || 0); }, 0),
      dados.reduce(function (t, c) { return t + (Number(c[COL_CARGA.VALOR - 1]) || 0); }, 0),
      null, null],
    mensagem: dados.length + ' carga(s) registrada(s).',
  };
}

function webSalvarCargaBomba(token, dados) {
  autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, mensagem: 'Outra carga está sendo processada. Tente novamente em instantes.' };
  }
  try {
    const erros = [];
    const data = parseDataIsoEstrita_((dados && dados.data) || '');
    if (!data) erros.push('Informe uma data válida.');
    const produto = String((dados && dados.produto) || '').trim().toUpperCase();
    if (PRODUTOS_BOMBA.indexOf(produto) === -1) {
      erros.push('Produto inválido. Use ' + PRODUTOS_BOMBA.join(' ou ') + '.');
    }
    const quantidade = Number((dados && dados.quantidade) || 0);
    const valor = Number((dados && dados.valor) || 0);
    if (!isFinite(quantidade) || quantidade <= 0) erros.push('Quantidade precisa ser maior que zero.');
    if (!isFinite(valor) || valor <= 0) erros.push('Valor da NF precisa ser maior que zero.');
    if (quantidade > 1000000) erros.push('Quantidade acima do limite de segurança.');
    if (valor > 1000000000) erros.push('Valor acima do limite de segurança.');
    const documento = String((dados && dados.documento) || '').trim().slice(0, 160);
    if (!documento) erros.push('Informe o número da NF da carga.');
    const observacao = String((dados && dados.observacao) || '').trim().slice(0, 500);
    if (erros.length) return { ok: false, mensagem: erros.join('\n') };

    // Mesma NF, mesmo produto e mesma data ja lancada: quase sempre e duplo clique.
    const repetida = lerCargasBomba_().filter(function (c) {
      return String(c[COL_CARGA.DOCUMENTO - 1] || '').trim().toUpperCase() === documento.toUpperCase() &&
        String(c[COL_CARGA.PRODUTO - 1] || '').trim().toUpperCase() === produto &&
        mesmaData_(c[COL_CARGA.DATA - 1], data);
    })[0];
    if (repetida && !(dados && dados.confirmarDuplicidade === true)) {
      return { ok: false, duplicidade: true,
        mensagem: 'A NF ' + documento + ' de ' + produto + ' já foi lançada em ' +
          formatarData_(data) + '. Confirme se quiser lançar mesmo assim.' };
    }

    const sheet = aba_(ABAS.CARGA_BOMBA);
    const linha = Math.max(sheet.getLastRow() + 1, 2);
    garantirLinhas_(sheet, linha);
    // PRECO_LITRO fica de fora: e formula matricial no cabecalho da coluna.
    sheet.getRange(linha, COL_CARGA.DATA, 1, COL_CARGA.VALOR)
      .setValues([[data, documento, produto, quantidade, valor]]);
    sheet.getRange(linha, COL_CARGA.OBSERVACAO).setValue(observacao);
    sheet.getRange(linha, COL_CARGA.DATA).setNumberFormat('dd/mm/yyyy');
    sheet.getRange(linha, COL_CARGA.QUANTIDADE).setNumberFormat('#,##0.000');
    sheet.getRange(linha, COL_CARGA.VALOR).setNumberFormat('R$ #,##0.00');

    invalidarCacheInicio_();
    const tanque = estadoTanque_(produto, null);
    registrarLog_('Carga na bomba', produto + ' • ' + quantidade.toFixed(3) + ' L • R$ ' +
      valor.toFixed(2) + ' • NF ' + documento);
    return {
      ok: true,
      mensagem: 'Carga registrada: ' + quantidade.toFixed(3).replace('.', ',') + ' L de ' +
        produto + ' a R$ ' + (valor / quantidade).toFixed(4).replace('.', ',') + '/L. ' +
        'Saldo do tanque: ' + tanque.litros.toFixed(3).replace('.', ',') + ' L, custo médio R$ ' +
        tanque.custoMedio.toFixed(4).replace('.', ',') + '/L.',
      saldo: tanque.litros,
      custoMedio: tanque.custoMedio,
    };
  } finally {
    lock.releaseLock();
  }
}

/** Custo que um abastecimento interno receberia agora — para o formulario mostrar. */
function webCustoBomba(token, dataIso) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const data = parseDataIsoEstrita_(dataIso || '');
  const tanque = estadoTanque_(PRODUTO_DIESEL, data);
  return {
    produto: PRODUTO_DIESEL,
    custoMedio: tanque.custoMedio,
    saldo: tanque.litros,
    disponivel: tanque.custoMedio > 0,
  };
}

function webLog(token, limite) {
  exigirPerfilToken_(token, 'ADMIN');
  const sheet = ss_().getSheetByName(ABAS.LOG);
  if (!sheet || sheet.getLastRow() < 2) return { colunas: [], linhas: [] };
  const solicitado = Math.max(1, Math.min(500, Math.floor(Number(limite || 50)) || 50));
  const quantas = Math.min(solicitado, sheet.getLastRow() - 1);
  const dados = sheet.getRange(sheet.getLastRow() - quantas + 1, 1, quantas, 4).getValues()
    .reverse();
  return {
    colunas: [col_('Quando'), col_('Quem'), col_('Ação'), col_('Detalhe')],
    linhas: dados.map(function (l) {
      return [
        l[0] instanceof Date
          ? Utilities.formatDate(l[0], ss_().getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm')
          : String(l[0]),
        l[1], l[2], l[3],
      ];
    }),
  };
}

/** Exporta uma competência inteira para uma Planilha Google independente. */
function webExportarPeriodo(token, mesRef) {
  autorizarContextoWeb_(token, 'ADMIN');
  return exportarPeriodoPlanilha_(mesRef || param_('MES_REFERENCIA'), 'manual via Web App');
}

/** Gera o PDF e devolve o link (o app não consegue baixar direto do iframe). */
function webExportarPdf(token, nomeAba) {
  autorizarContextoWeb_(token, 'ADMIN');
  const arquivo = exportarAbaComoPdf_(nomeAba || ABAS.RESUMO);
  registrarLog_('Exportar PDF (web)', nomeAba);
  return { ok: true, mensagem: arquivo.getName(), url: arquivo.getUrl() };
}

function webEnviarEmail(token, destinatarios, nomeAba) {
  autorizarContextoWeb_(token, 'ADMIN');
  const mensagem = enviarRelatorioPorEmail_(destinatarios, nomeAba || ABAS.RESUMO);
  registrarLog_('Enviar e-mail (web)', nomeAba + ' → ' + destinatarios);
  return { ok: true, mensagem: mensagem };
}

// ==========================================================================
// 15_Blindagem_V4.gs
// ==========================================================================

/**
 * BLINDAGEM OPERACIONAL V4
 * ------------------------
 * O objetivo deste módulo é manter a operação administrável pelo próprio Web App:
 * - diagnóstico de saúde;
 * - autorreparo seguro de estrutura/fórmulas (sem apagar base operacional);
 * - backup integral manual e automático;
 * - restauração assistida das bases a partir de um backup;
 * - redundância mínima de administradores.
 */

function listarAdminsAtivos_() {
  const sheet = ss_().getSheetByName(ABAS.USUARIOS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues()
    .filter(function (l) {
      return l[0] &&
        String(l[2] || '').trim().toUpperCase() === 'ADMIN' &&
        String(l[5] || '').trim().toUpperCase() === 'SIM';
    })
    .map(function (l) { return String(l[0] || '').trim().toLowerCase(); });
}

function pastaBackupsSistema_() {
  const props = PropertiesService.getScriptProperties();
  const idSalvo = props.getProperty('PASTA_BACKUPS_FROTA_ID');
  if (idSalvo) {
    try { return DriveApp.getFolderById(idSalvo); } catch (e) {}
  }

  const arquivoOrigem = DriveApp.getFileById(ss_().getId());
  let pai = null;
  try {
    const pais = arquivoOrigem.getParents();
    if (pais.hasNext()) pai = pais.next();
  } catch (e) {}

  let pasta = null;
  try {
    const existentes = pai ? pai.getFoldersByName(PASTA_BACKUPS_SISTEMA_)
      : DriveApp.getFoldersByName(PASTA_BACKUPS_SISTEMA_);
    if (existentes.hasNext()) pasta = existentes.next();
  } catch (e) {}

  if (!pasta) {
    pasta = pai ? pai.createFolder(PASTA_BACKUPS_SISTEMA_)
      : DriveApp.createFolder(PASTA_BACKUPS_SISTEMA_);
  }
  props.setProperty('PASTA_BACKUPS_FROTA_ID', pasta.getId());
  return pasta;
}

function listarBackupsSistema_(limite) {
  const pasta = pastaBackupsSistema_();
  const arquivos = pasta.getFiles();
  const itens = [];
  while (arquivos.hasNext()) {
    const f = arquivos.next();
    if (String(f.getName()).indexOf(PREFIXO_BACKUP_SISTEMA_) !== 0) continue;
    const criado = f.getDateCreated();
    itens.push({
      id: f.getId(),
      nome: f.getName(),
      url: f.getUrl(),
      criadoMs: criado.getTime(),
      criadoEm: Utilities.formatDate(criado, timezone_(), 'dd/MM/yyyy HH:mm')
    });
  }
  itens.sort(function (a, b) { return b.criadoMs - a.criadoMs; });
  return itens.slice(0, Math.max(1, Number(limite || 10)));
}

function limparBackupsAntigos_() {
  const pasta = pastaBackupsSistema_();
  const arquivos = pasta.getFiles();
  const itens = [];
  while (arquivos.hasNext()) {
    const f = arquivos.next();
    if (String(f.getName()).indexOf(PREFIXO_BACKUP_SISTEMA_) !== 0) continue;
    itens.push({ arquivo: f, criado: f.getDateCreated(), criadoMs: f.getDateCreated().getTime() });
  }
  itens.sort(function (a, b) { return b.criadoMs - a.criadoMs; });

  // Retenção V4.5: mantém 30 cópias recentes + 1 âncora por mês para até 12 meses anteriores.
  // Assim a operação diária continua bem coberta e a empresa ganha histórico de longo prazo.
  const manter = {};
  itens.slice(0, MAX_BACKUPS_SISTEMA_).forEach(function(item){ manter[item.arquivo.getId()] = true; });
  const meses = {};
  let mesesMantidos = 0;
  itens.slice(MAX_BACKUPS_SISTEMA_).forEach(function(item) {
    const chave = Utilities.formatDate(item.criado, timezone_(), 'yyyy-MM');
    if (!meses[chave] && mesesMantidos < 12) {
      meses[chave] = true;
      mesesMantidos++;
      manter[item.arquivo.getId()] = true;
    }
  });
  itens.forEach(function (item) {
    if (manter[item.arquivo.getId()]) return;
    try { item.arquivo.setTrashed(true); } catch (e) {}
  });
}

function ultimaLinhaRealPorColuna_(sheet, coluna) {
  if (!sheet || sheet.getMaxRows() < 2) return 1;
  try {
    const linha = sheet.getRange(sheet.getMaxRows(), coluna)
      .getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
    return Math.max(1, linha);
  } catch (e) { return sheet.getLastRow(); }
}

function criarBackupPreMigracao_(motivo) {
  SpreadsheetApp.flush();
  const pasta = pastaBackupsSistema_();
  const agora = new Date();
  const carimbo = Utilities.formatDate(agora, timezone_(), 'yyyy-MM-dd_HH-mm-ss');
  const nome = PREFIXO_BACKUP_SISTEMA_ + carimbo + '_PRE_MIGRACAO';
  const copia = DriveApp.getFileById(ss_().getId()).makeCopy(nome, pasta);
  return {
    ok: true, id: copia.getId(), nome: copia.getName(), url: copia.getUrl(),
    criadoEm: Utilities.formatDate(agora, timezone_(), 'dd/MM/yyyy HH:mm'),
    motivo: String(motivo || 'pré-migração'), validado: false
  };
}

function validarBackupSistema_(backupId) {
  const origem = ss_();
  const copia = SpreadsheetApp.openById(String(backupId));
  const obrigatorias = [ABAS.PARAMETROS, ABAS.CENTROS, ABAS.VEICULOS, ABAS.LANCAMENTOS,
    ABAS.ODOMETRO, ABAS.HISTORICO, ABAS.USUARIOS];
  const faltam = obrigatorias.filter(function(n){ return !copia.getSheetByName(n); });
  if (faltam.length) return { ok: false, mensagem: 'Backup incompleto: faltam ' + faltam.join(', ') };
  const conferir = [ABAS.CENTROS, ABAS.VEICULOS, ABAS.LANCAMENTOS, ABAS.ODOMETRO, ABAS.HISTORICO];
  const divergencias = [];
  conferir.forEach(function(n) {
    const a = origem.getSheetByName(n), b = copia.getSheetByName(n);
    const la = n === ABAS.LANCAMENTOS ? ultimaLinhaRealPorColuna_(a, COL_LANC.PLACA) : (a ? a.getLastRow() : 0);
    const lb = n === ABAS.LANCAMENTOS ? ultimaLinhaRealPorColuna_(b, COL_LANC.PLACA) : (b ? b.getLastRow() : 0);
    if (la !== lb) divergencias.push(n + ': ' + la + ' != ' + lb);
  });
  // Confere também o último ID real de lançamento, evitando validar somente quantidade.
  const aLanc = origem.getSheetByName(ABAS.LANCAMENTOS), bLanc = copia.getSheetByName(ABAS.LANCAMENTOS);
  const laLanc = ultimaLinhaRealPorColuna_(aLanc, COL_LANC.PLACA), lbLanc = ultimaLinhaRealPorColuna_(bLanc, COL_LANC.PLACA);
  if (laLanc >= 2 && lbLanc >= 2) {
    const idA = String(aLanc.getRange(laLanc, COL_LANC.ID).getDisplayValue() || '').trim();
    const idB = String(bLanc.getRange(lbLanc, COL_LANC.ID).getDisplayValue() || '').trim();
    if (idA !== idB) divergencias.push('Último ID de lançamento divergente');
  }
  if (divergencias.length) return { ok: false, mensagem: 'Validação divergente: ' + divergencias.join(' • ') };
  return { ok: true, mensagem: 'Estrutura, contagem operacional e último ID conferidos.' };
}

function criarBackupSistema_(motivo) {
  SpreadsheetApp.flush();
  const pasta = pastaBackupsSistema_();
  const agora = new Date();
  const carimbo = Utilities.formatDate(agora, timezone_(), 'yyyy-MM-dd_HH-mm-ss');
  const nome = PREFIXO_BACKUP_SISTEMA_ + carimbo;
  const origem = DriveApp.getFileById(ss_().getId());
  const copia = origem.makeCopy(nome, pasta);
  let validacao = { ok: false, mensagem: 'validação não executada' };
  // A cópia do Drive pode levar alguns instantes até ficar totalmente disponível ao Sheets.
  // Repetimos a conferência poucas vezes para não transformar uma latência transitória em falso erro.
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try { validacao = validarBackupSistema_(copia.getId()); }
    catch (e) { validacao = { ok: false, mensagem: e.message }; }
    if (validacao.ok) break;
    if (tentativa < 3) Utilities.sleep(700 * tentativa);
  }
  if (!validacao.ok) {
    throw new Error('Backup criado, porém não passou na validação automática: ' + validacao.mensagem + '. Cópia preservada: ' + copia.getName());
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    ULTIMO_BACKUP_FROTA_ID: copia.getId(),
    ULTIMO_BACKUP_FROTA_EM: String(agora.getTime()),
    ULTIMO_BACKUP_FROTA_MOTIVO: String(motivo || 'manual'),
    ULTIMO_BACKUP_FROTA_VALIDADO: 'SIM',
    ULTIMO_BACKUP_FROTA_VALIDACAO: validacao.mensagem,
    ULTIMO_BACKUP_FROTA_VERSAO: VERSAO_SISTEMA
  }, false);

  limparBackupsAntigos_();
  registrarLog_('Backup do sistema', String(motivo || 'manual') + ' • ' + copia.getName());
  return {
    ok: true,
    id: copia.getId(),
    nome: copia.getName(),
    url: copia.getUrl(),
    criadoEm: Utilities.formatDate(agora, timezone_(), 'dd/MM/yyyy HH:mm'),
    motivo: String(motivo || 'manual'),
    validado: true,
    validacao: validacao.mensagem
  };
}

function garantirBackupInicial_() {
  const props = PropertiesService.getScriptProperties();
  const versaoBackup = String(props.getProperty('ULTIMO_BACKUP_FROTA_VERSAO') || '');
  const lista = listarBackupsSistema_(1);
  if (lista.length && versaoBackup === VERSAO_SISTEMA) return lista[0];
  return criarBackupSistema_(lista.length ? 'backup de atualização V' + VERSAO_SISTEMA : 'backup inicial V' + VERSAO_SISTEMA);
}

function triggerBackupAtivo_() {
  return ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === FUNCAO_BACKUP_AUTOMATICO_;
  });
}

function garantirTriggerBackupDiario_() {
  if (triggerBackupAtivo_()) return false;
  ScriptApp.newTrigger(FUNCAO_BACKUP_AUTOMATICO_)
    .timeBased()
    .atHour(HORA_BACKUP_AUTOMATICO_)
    .everyDays(1)
    .inTimezone(timezone_())
    .create();
  registrarLog_('Backup automático', 'gatilho diário criado para a janela das ' +
    ('0' + HORA_BACKUP_AUTOMATICO_).slice(-2) + 'h');
  return true;
}


function triggerAuditoriaEdicaoAtivo_() {
  return ScriptApp.getProjectTriggers().some(function(t){
    return t.getHandlerFunction() === FUNCAO_AUDITORIA_EDICAO_;
  });
}

function garantirTriggerAuditoriaEdicao_() {
  if (triggerAuditoriaEdicaoAtivo_()) return false;
  ScriptApp.newTrigger(FUNCAO_AUDITORIA_EDICAO_).forSpreadsheet(ss_()).onEdit().create();
  registrarLog_('Auditoria de edição', 'gatilho instalável criado para registrar alterações diretas nas bases sensíveis');
  return true;
}

function triggerFlushLoginsAtivo_() {
  return ScriptApp.getProjectTriggers().some(function(t){
    return t.getHandlerFunction() === FUNCAO_FLUSH_LOGINS_;
  });
}

function garantirTriggerFlushLogins_() {
  if (triggerFlushLoginsAtivo_()) return false;
  ScriptApp.newTrigger(FUNCAO_FLUSH_LOGINS_).timeBased().everyHours(1).create();
  registrarLog_('Auditoria de login', 'gatilho horário criado para descarregar logins pendentes sem atrasar a autenticação');
  return true;
}

/**
 * Mantem quentes os caches que o primeiro acesso do dia pagaria (V4.8.7).
 *
 * Medicao que originou isto, num login real: servidor 3.259 ms = login 956 +
 * estrutura 896 + painel 1.187. Os tres foram ERRO DE CACHE. Os dois ultimos,
 * 2.083 ms, sao recalculo que ninguem precisava ter esperado — bastava alguem
 * ter aberto o sistema nos minutos anteriores.
 *
 * Quem paga esse custo e sempre o primeiro usuario da manha, que e justamente
 * quem forma a impressao de que o sistema e lento.
 *
 * NAO aquece o login: a autenticacao depende do usuario e, de todo jeito, o
 * maior pedaco daqueles 956 ms e abrir a planilha — custo que toda execucao
 * paga por conta propria e nenhum gatilho adianta.
 *
 * Falha aqui nunca derruba nada: e so uma visita antecipada.
 */
function aquecerCachesAgendado_() {
  const lock = LockService.getScriptLock();
  // Sem fila: se outra passagem ainda roda, esta nao tem o que fazer.
  if (!lock.tryLock(1000)) return;
  try {
    CONTEXTO_SISTEMA_INTERNO_ = true;
    let ok = 0;
    try { bootstrapMetaComCache_(true); ok++; } catch (e) { console.error('aquecer meta: ' + e.message); }
    try { dadosInicioComCache_(true); ok++; } catch (e) { console.error('aquecer início: ' + e.message); }
    return ok;
  } finally {
    CONTEXTO_SISTEMA_INTERNO_ = false;
    lock.releaseLock();
  }
}

function triggerAquecerCachesAtivo_() {
  return ScriptApp.getProjectTriggers().some(function(t){
    return t.getHandlerFunction() === FUNCAO_AQUECER_CACHES_;
  });
}

function garantirTriggerAquecerCaches_() {
  if (triggerAquecerCachesAtivo_()) return false;
  ScriptApp.newTrigger(FUNCAO_AQUECER_CACHES_).timeBased().everyMinutes(5).create();
  registrarLog_('Desempenho', 'gatilho de 5 min criado para manter os caches do app quentes');
  return true;
}

function removerTriggersLegados_() {
  const legados = ['backupAutomaticoDiario', 'auditoriaEdicaoInstalavel', 'processarLoginsPendentesAgendado'];
  let removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (legados.indexOf(t.getHandlerFunction()) === -1) return;
    try { ScriptApp.deleteTrigger(t); removidos++; } catch (e) {}
  });
  return removidos;
}

// ============================================================ V4.9: alerta diário
/**
 * Tudo o que este alerta conta JA EXISTIA no sistema — e so aparecia para quem
 * abrisse a tela e procurasse. Um tanque no fim, uma leitura de odometro que
 * retrocedeu e um IPVA esquecido nao melhoram sozinhos: eles pioram em silencio
 * ate o fechamento. O gatilho diario inverte isso.
 *
 * Duas regras de desenho:
 *  - Nao manda nada quando nao ha nada. Um e-mail diario dizendo "tudo certo"
 *    vira filtro no Outlook em duas semanas, e junto com ele some o dia em que
 *    havia algo.
 *  - Reusa os MESMOS criterios das telas. O alerta de custo por km, por exemplo,
 *    e a regra identica a da formatacao condicional do Resumo (acima de 2x a
 *    media da frota). Dois criterios parecidos mas diferentes seriam pior que
 *    nenhum: a tela diria uma coisa e o e-mail outra.
 */
const FUNCAO_ALERTA_DIARIO_ = 'enviarAlertasDiariosAgendado_';
const ESTOQUE_MINIMO_PADRAO_ = 500;

/** Veiculos com custo por km ou consumo fora da curva na competencia aberta. */
/**
 * Colunas de custo que VARIAM com o uso do veiculo.
 *
 * Depreciacao, IPVA, seguro e emplacamento correm igual com o veiculo parado na
 * garagem; multa e comportamento, nao consumo. Deixa-los no R$/km fazia um
 * veiculo que rodou pouco aparecer caríssimo por km sem ter nada de errado no
 * consumo — o divisor e que era pequeno.
 */
const R_CUSTO_VARIAVEL_ = ['COMBUSTIVEL', 'LUBRIFICANTE', 'ARLA', 'LAVACAO',
  'OFICINA', 'PNEUS', 'PEDAGIO', 'GAS'];

/** Minimo de veiculos com rodagem na categoria para ela servir de referencia. */
const MINIMO_VEICULOS_REFERENCIA_ = 4;
/** Fracao da rodagem mediana da categoria abaixo da qual o veiculo nao e avaliado. */
const FRACAO_RODAGEM_MINIMA_ = 0.2;

function custoVariavelResumo_(linha) {
  let total = 0;
  R_CUSTO_VARIAVEL_.forEach(function (nome) { total += Number(linha[R_[nome]]) || 0; });
  return total;
}

/**
 * Mediana de uma lista de numeros.
 *
 * E a referencia certa para DETECTAR outlier, e a media nao e — pelo motivo
 * simples de que o proprio outlier entra na media e levanta a barra que deveria
 * julga-lo. Num grupo de cinco carretas em que uma bebe o dobro, a media sobe o
 * bastante para a culpada passar despercebida. A mediana nao se move.
 *
 * Para RELATAR consumo a conta continua sendo total/total (ver o rodape do
 * relatorio de consumo): ali o que importa e o peso de cada veiculo, nao a
 * robustez a extremo. Sao perguntas diferentes.
 */
function mediana_(valores) {
  const ordenados = valores.slice().sort(function (a, b) { return a - b; });
  if (!ordenados.length) return 0;
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * Veiculos fora da curva DA PROPRIA CATEGORIA na competencia aberta.
 *
 * A primeira versao comparava todo mundo com a media da frota inteira e gerava
 * 74 avisos de uma vez. Nao era sensibilidade: era erro de metodo, em cinco
 * frentes.
 *
 *  1. CATEGORIAS MISTURADAS. Numa frota com carro e carreta, a media geral fica
 *     em ~10 km/l — numero de carro. Carreta faz 2,5 km/l, que e o normal dela,
 *     e caía abaixo da metade da media POR CONSTRUCAO. Todo caminhao era eterno
 *     "fora da curva", e aviso que aponta sempre os mesmos nao aponta nada.
 *  2. MEDIA COMO REFERENCIA. Ver mediana_.
 *  3. O MESMO VEICULO CONTADO DUAS VEZES. Quem roda pouco por litro gasta mais
 *     por km — e o mesmo fato fisico. Saiam duas linhas por veiculo.
 *  4. CUSTO FIXO NO R$/KM. Ver R_CUSTO_VARIAVEL_.
 *  5. SEM PISO DE RODAGEM. Poucos km no periodo = divisor minusculo = qualquer
 *     valor vira outlier.
 *
 * O piso e relativo a categoria, nao um numero fixo: empilhadeira marca HORA no
 * mesmo campo em que o caminhao marca KM, e um piso absoluto excluiria todas as
 * empilhadeiras ou nenhuma carreta.
 */
function alertasConsumo_() {
  const linhas = lerResumo_().filter(function (l) { return Number(l[R_.KM]) > 0; });
  if (!linhas.length) return [];

  const grupos = {};
  linhas.forEach(function (l) {
    const cat = String(l[R_.CATEGORIA] || '').trim() || '(sem categoria)';
    (grupos[cat] || (grupos[cat] = [])).push(l);
  });

  const achados = [];
  let semReferencia = 0, poucaRodagem = 0;

  Object.keys(grupos).sort().forEach(function (cat) {
    const grupo = grupos[cat];
    if (grupo.length < MINIMO_VEICULOS_REFERENCIA_) {
      // Com dois ou tres veiculos nao da para separar sinal de ruido: qualquer um
      // deles move a propria referencia. Melhor nao afirmar nada do que errar.
      semReferencia += grupo.length;
      return;
    }
    const rodagemMinima = mediana_(grupo.map(function (l) { return Number(l[R_.KM]) || 0; })) *
      FRACAO_RODAGEM_MINIMA_;

    const avaliados = grupo.filter(function (l) {
      if ((Number(l[R_.KM]) || 0) >= rodagemMinima) return true;
      poucaRodagem++;
      return false;
    });
    if (avaliados.length < MINIMO_VEICULOS_REFERENCIA_) {
      semReferencia += avaliados.length;
      return;
    }

    const medida = avaliados.map(function (l) {
      const km = Number(l[R_.KM]) || 0;
      const litros = Number(l[R_.LITROS]) || 0;
      return { placa: String(l[R_.PLACA] || ''), km: km,
        custoKm: km > 0 ? custoVariavelResumo_(l) / km : 0,
        kmLitro: litros > 0 ? km / litros : 0 };
    });
    const refCustoKm = mediana_(medida.map(function (m) { return m.custoKm; }));
    const comLitros = medida.filter(function (m) { return m.kmLitro > 0; });
    const refKmLitro = mediana_(comLitros.map(function (m) { return m.kmLitro; }));

    medida.forEach(function (m) {
      const desvios = [];
      if (refCustoKm > 0 && m.custoKm > 2 * refCustoKm) {
        desvios.push('custo variável R$ ' + m.custoKm.toFixed(3) + '/km, mais que o dobro ' +
          'da mediana da categoria (R$ ' + refCustoKm.toFixed(3) + ')');
      }
      if (refKmLitro > 0 && m.kmLitro > 0 && m.kmLitro < refKmLitro / 2) {
        desvios.push('rendimento ' + m.kmLitro.toFixed(2) + ' km/l, menos da metade ' +
          'da mediana da categoria (' + refKmLitro.toFixed(2) + ')');
      }
      // Um achado por veiculo: os dois desvios sao o mesmo fato visto de dois
      // angulos, e duas linhas so inflam a contagem.
      if (desvios.length) achados.push(m.placa + ' (' + cat + ') — ' + desvios.join('; '));
    });
  });

  if (semReferencia) {
    achados.push('— ' + semReferencia + ' veículo(s) não avaliados: a categoria deles tem ' +
      'menos de ' + MINIMO_VEICULOS_REFERENCIA_ + ' veículos rodando, e não dá para ' +
      'dizer o que é fora da curva com tão pouca referência.');
  }
  if (poucaRodagem) {
    achados.push('— ' + poucaRodagem + ' veículo(s) não avaliados por rodagem baixa no ' +
      'período: com poucos quilômetros, o custo por km não significa nada.');
  }
  return achados;
}

/** Saldo baixo, saida sem lastro e pendencias de conferencia em aberto. */
function alertasTanqueEPendencias_() {
  const achados = [];
  const minimo = Number(param_('ESTOQUE_MINIMO_L')) || ESTOQUE_MINIMO_PADRAO_;
  PRODUTOS_BOMBA.forEach(function (produto) {
    const e = estadoTanque_(produto, null);
    if (e.litros < minimo) {
      achados.push(produto + ' — saldo de ' + e.litros.toFixed(1) + ' L, abaixo do ' +
        'mínimo de ' + minimo + ' L');
    }
    if (e.litrosSemLastro > 0.001) {
      achados.push(produto + ' — ' + e.litrosSemLastro.toFixed(1) + ' L saíram sem carga ' +
        'registrada; o custo desses litros não tem lastro');
    }
  });
  const pendentes = contarPendenciasConferencia_();
  if (pendentes > 0) {
    achados.push(pendentes + ' pendência(s) de conferência em aberto');
  }
  // Comprovante atrasado parado e despesa real fora do mapa. Quanto mais tempo
  // fica, mais o custo por km da loja parece melhor do que foi.
  try {
    const comp = lerComprovantes_().filter(function (c) {
      return String(c[COL_COMP.SITUACAO - 1] || '').trim().toUpperCase() === COMP_PENDENTE_;
    });
    if (comp.length) {
      const valor = comp.reduce(function (t, c) { return t + (Number(c[COL_COMP.VALOR - 1]) || 0); }, 0);
      achados.push(comp.length + ' comprovante(s) atrasado(s) aguardando decisão, R$ ' +
        valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
        ' ainda fora do mapa');
    }
  } catch (e) { console.error('alerta de comprovantes: ' + e.message); }
  return achados;
}

/** Leituras que retrocederam no periodo aberto e IPVA cadastrado sem parcela lancada. */
function alertasOdometroEIpva_() {
  const achados = [];
  const periodo = periodoAtual_();
  const leituras = lerOdometro_()
    .map(function (o, i) { return { data: o[0], placa: normalizaPlaca_(o[1]), km: Number(o[2]), linha: i + 2 }; })
    .filter(function (o) {
      return o.data instanceof Date && !isNaN(o.data.getTime()) && o.placa && isFinite(o.km);
    })
    .sort(function (a, b) {
      if (a.placa !== b.placa) return a.placa < b.placa ? -1 : 1;
      return a.data - b.data;
    });
  for (let i = 1; i < leituras.length; i++) {
    const atual = leituras[i];
    const anterior = leituras[i - 1];
    if (atual.placa !== anterior.placa) continue;
    if (atual.data < periodo.inicio || atual.data > periodo.fim) continue;
    if (atual.km < anterior.km) {
      achados.push(atual.placa + ' — leitura de ' + formatarData_(atual.data) + ' é ' +
        atual.km + ' km, menor que a anterior (' + anterior.km + ' km), linha ' + atual.linha);
    }
  }

  dadosVeiculosExecucao_().forEach(function (v) {
    const placa = String(v[COL_VEIC.PLACA - 1] || '').trim();
    if (!placa) return;
    if (String(v[COL_VEIC.ATIVO - 1] || '').trim().toUpperCase() === 'NAO') return;
    const sugerido = Number(v[COL_VEIC.IPVA - 1]) || 0;
    if (sugerido <= 0) return;
    const grupos = gruposIpvaDaPlaca_(placa);
    const parcelas = Object.keys(grupos).reduce(function (t, g) { return t + grupos[g].parcelas; }, 0);
    if (!parcelas) {
      achados.push(placa + ' — IPVA de R$ ' + sugerido.toFixed(2) + ' no cadastro e ' +
        'nenhuma parcela lançada');
    }
  });
  return achados;
}

/**
 * Monta o alerta do dia. Devolve { blocos, total } — nunca envia nada.
 * Separado do envio de proposito: assim da para conferir o conteudo pelo menu
 * sem disparar e-mail para ninguem.
 */
function montarAlertasDiarios_() {
  const blocos = [];
  function bloco(titulo, itens) {
    if (itens && itens.length) blocos.push({ titulo: titulo, itens: itens });
  }
  // Cada bloco e isolado: um erro em "tanque" nao pode impedir o aviso de odometro.
  try { bloco('Consumo fora da curva', alertasConsumo_()); }
  catch (e) { blocos.push({ titulo: 'Consumo fora da curva', itens: ['Não foi possível apurar: ' + e.message] }); }
  try { bloco('Tanque e pendências', alertasTanqueEPendencias_()); }
  catch (e) { blocos.push({ titulo: 'Tanque e pendências', itens: ['Não foi possível apurar: ' + e.message] }); }
  try { bloco('Odômetro e IPVA', alertasOdometroEIpva_()); }
  catch (e) { blocos.push({ titulo: 'Odômetro e IPVA', itens: ['Não foi possível apurar: ' + e.message] }); }

  return {
    blocos: blocos,
    total: blocos.reduce(function (s, b) { return s + b.itens.length; }, 0),
  };
}

/** Destinatarios do alerta, do parametro EMAIL_ALERTAS. Lista vazia desliga o envio. */
function destinatariosAlerta_() {
  return String(param_('EMAIL_ALERTAS') || '')
    .split(/[,;]/)
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(function (e, i, a) {
      return e && a.indexOf(e) === i && e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
    })
    .slice(0, 20);
}

/**
 * Quantos itens de um bloco cabem no e-mail antes de virar rolagem inutil.
 * Um bloco com 74 linhas empurra os outros tres para fora da primeira tela, e
 * quem abre so ve um deles.
 */
const MAXIMO_ITENS_POR_BLOCO_ = 12;

function corpoAlertaHtml_(alertas, mesRef) {
  const periodo = periodoDoMes_(mesRef);
  const linhas = alertas.blocos.map(function (b) {
    const mostrados = b.itens.slice(0, MAXIMO_ITENS_POR_BLOCO_);
    const resto = b.itens.length - mostrados.length;
    return '<h3 style="margin:18px 0 6px;font-size:15px;color:#222">' + b.titulo +
      ' <span style="color:#888;font-weight:normal">(' + b.itens.length + ')</span></h3>' +
      '<ul style="margin:0;padding-left:20px;color:#333;font-size:14px;line-height:1.6">' +
      mostrados.map(function (i) { return '<li>' + i + '</li>'; }).join('') +
      (resto > 0 ? '<li style="color:#888">e mais ' + resto + ' — veja a lista inteira ' +
        'no sistema, em Configurações → Ver o alerta de hoje.</li>' : '') + '</ul>';
  }).join('');
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px">' +
    '<p style="font-size:14px;color:#333">Competência <b>' + mesRef + '</b> — período de ' +
    formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim) + '.<br>' +
    '<b>' + alertas.total + '</b> ponto(s) pedindo atenção hoje.</p>' +
    linhas +
    '<p style="color:#666;font-size:12px;margin-top:22px">Enviado pelo Sistema de Controle ' +
    'de Custos de Frota. Para parar, esvazie o parâmetro EMAIL_ALERTAS na aba ' +
    ABAS.PARAMETROS + '.</p></div>';
}

/**
 * Funcao do gatilho diario. Nao lanca: um erro aqui mataria o gatilho em silencio.
 * Devolve o que fez, para o teste e para o menu conseguirem conferir.
 */
function enviarAlertasDiariosAgendado_() {
  try {
    CONTEXTO_SISTEMA_INTERNO_ = true;
    const destinos = destinatariosAlerta_();
    if (!destinos.length) return { enviado: false, motivo: 'EMAIL_ALERTAS vazio' };

    const alertas = montarAlertasDiarios_();
    // Silencio quando esta tudo certo: e o que mantem o e-mail digno de ser aberto.
    if (!alertas.total) return { enviado: false, motivo: 'nada a relatar', total: 0 };

    const restante = MailApp.getRemainingDailyQuota();
    if (restante < 1) {
      console.error('alerta diário: cota de e-mail esgotada');
      return { enviado: false, motivo: 'cota esgotada' };
    }
    const mesRef = normalizarMesReferencia_(param_('MES_REFERENCIA'));
    MailApp.sendEmail({
      to: destinos.join(','),
      subject: '[Frota] ' + alertas.total + ' ponto(s) de atenção — ' + mesRef,
      htmlBody: corpoAlertaHtml_(alertas, mesRef),
      name: String(param_('EMPRESA')),
    });
    registrarLog_('Alerta diário enviado', alertas.total + ' ponto(s) para ' + destinos.join(', '));
    return { enviado: true, total: alertas.total, destinos: destinos.length };
  } catch (e) {
    console.error('alerta diário: ' + e.message);
    return { enviado: false, motivo: e.message };
  } finally {
    CONTEXTO_SISTEMA_INTERNO_ = false;
  }
}

/** Cria (ou recria, se a hora mudou) o gatilho diario do alerta. */
function garantirTriggerAlertaDiario_() {
  const hora = Math.max(0, Math.min(23, Math.floor(Number(param_('HORA_ALERTA'))) || 7));
  const existentes = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === FUNCAO_ALERTA_DIARIO_;
  });
  // O gatilho nao expoe a hora configurada, entao nao da para comparar: na duvida
  // recria. Sao duas chamadas por instalacao, nao por execucao.
  existentes.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(FUNCAO_ALERTA_DIARIO_).timeBased().atHour(hora).everyDays(1).create();
  return hora;
}

/** Previa do alerta na tela, sem enviar nada. */
function webPreviaAlertas(token) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const alertas = montarAlertasDiarios_();
  const destinos = destinatariosAlerta_();
  const linhas = [];
  alertas.blocos.forEach(function (b) {
    b.itens.forEach(function (i) { linhas.push([b.titulo, i]); });
  });
  return {
    colunas: [col_('Bloco'), col_('Ponto de atenção')],
    linhas: linhas,
    total: alertas.total,
    destinos: destinos,
    mensagem: !destinos.length
      ? '⚠ Nenhum destinatário configurado. Preencha EMAIL_ALERTAS na aba ' +
        ABAS.PARAMETROS + ' para o alerta diário passar a ser enviado.'
      : (alertas.total
        ? 'Hoje o alerta seria enviado para ' + destinos.join(', ') + '.'
        : 'Nada a relatar hoje — nesse caso o sistema não envia e-mail nenhum.'),
  };
}

function triggerAlertaDiarioAtivo_() {
  return ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === FUNCAO_ALERTA_DIARIO_;
  });
}

/**
 * Garante que a competencia ABERTA ja tenha bloco proprio de percentuais.
 *
 * Fecha o unico vao da transicao para a V4.9. Sem isto: instala em julho, nao
 * mexe na tela, fecha julho. Em agosto o operador ajusta o rateio — agora agosto
 * tem bloco e julho nao tem nenhum. Julho cairia no ultimo recurso, que e a aba
 * Centros, que ja foi espelhada com os valores de AGOSTO. O mes de transicao
 * herdaria do futuro, que e exatamente o defeito que esta versao veio consertar.
 *
 * Idempotente: so escreve quando a competencia ainda nao tem bloco.
 */
function semearRateioCompetenciaAtual_() {
  exigirExecucaoMutacao_();
  const mes = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  invalidarCacheRateioMensal_();
  const vigente = percentuaisDaCompetencia_(mes);
  if (vigente.proprio) return 0;

  const percentuais = vigente.percentuais;
  const itens = Object.keys(percentuais).sort().map(function (nome) {
    return { centro: nome, percentual: percentuais[nome].percentual,
      recebe: percentuais[nome].recebe };
  });
  if (!itens.length) return 0;
  gravarPercentuaisCompetencia_(mes, itens, 'instalação');
  registrarLog_('Rateio da competência ' + mes,
    'bloco inicial gravado na instalação a partir de ' + vigente.origem +
    ' (' + itens.length + ' centro(s))');
  return itens.length;
}

// ====================================================== V4.11: comprovantes atrasados
/**
 * Comprovante de abastecimento que chega depois da competencia fechar.
 *
 * O problema real: veiculo que fica em loja abastece fora, e o comprovante
 * aparece um mes ou mais depois. Hoje o formulario recusa data fora do periodo
 * aberto — e com razao, porque aceitar mudaria o total e o hash de um mes ja
 * assinado. So que recusar tambem significa que o papel some: a despesa nunca
 * entra, e o custo por km fica subestimado para sempre.
 *
 * A saida e um registro APARTADO. O comprovante entra aqui com a data real do
 * abastecimento, aparece no relatorio de fora de periodo, e NAO toca em
 * contabilidade nenhuma. Quando alguem decidir, um botao o lanca no periodo
 * ABERTO, guardando a data original na observacao.
 *
 * Duas coisas que ele NAO faz, de proposito:
 *  - nao mexe em competencia fechada. Nunca, por nenhum caminho.
 *  - nao alimenta a serie do odometro. O KM fica guardado aqui e aparece no
 *    relatorio, mas inserir uma leitura antiga mudaria o KM rodado e o km/l de
 *    um mes ja apurado.
 */
const COL_COMP = {
  DATA: 1, PLACA: 2, TIPO: 3, LITROS: 4, VALOR: 5, KM: 6, DOCUMENTO: 7,
  CENTRO: 8, COMPETENCIA: 9, SITUACAO: 10, OBSERVACAO: 11,
  REGISTRADO_EM: 12, REGISTRADO_POR: 13, INCORPORADO_EM: 14, ID_LANCAMENTO: 15,
};
const TOTAL_COL_COMP = totalColunas_(COL_COMP);

const COMP_PENDENTE_ = 'PENDENTE';
const COMP_INCORPORADO_ = 'INCORPORADO';
const COMP_DESCARTADO_ = 'DESCARTADO';
const SITUACOES_COMPROVANTE_ = [COMP_PENDENTE_, COMP_INCORPORADO_, COMP_DESCARTADO_];

let COMPROVANTES_EXEC_CACHE_ = null;

function lerComprovantes_() {
  if (COMPROVANTES_EXEC_CACHE_) return COMPROVANTES_EXEC_CACHE_;
  const sheet = ss_().getSheetByName(ABAS.COMPROVANTES);
  COMPROVANTES_EXEC_CACHE_ = (sheet && sheet.getLastRow() >= 2)
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, TOTAL_COL_COMP).getValues()
      .map(function (l, i) { l.linha = i + 2; return l; })
      .filter(function (l) { return l[COL_COMP.PLACA - 1]; })
    : [];
  return COMPROVANTES_EXEC_CACHE_;
}

function invalidarCacheComprovantes_() { COMPROVANTES_EXEC_CACHE_ = null; }

/**
 * Registra um comprovante atrasado.
 *
 * Recusa data DENTRO do periodo aberto de proposito: ali nao ha atraso nenhum,
 * e o caminho certo e o lancamento normal. Aceitar os dois faria a mesma despesa
 * ter duas portas de entrada, e cedo ou tarde entraria pelas duas.
 */
function webRegistrarComprovante(token, dados) {
  const sessao = autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  const erros = [];

  const resolvido = resolverVeiculo_((dados && dados.veiculo) || '', false);
  if (!resolvido.ok) return { ok: false, mensagem: resolvido.mensagem };
  const veic = resolvido.veiculo;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String((dados && dados.data) || '').trim());
  if (!m) return { ok: false, mensagem: 'Informe a data do abastecimento.' };
  const data = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  if (isNaN(data.getTime()) || data.getDate() !== Number(m[3])) {
    return { ok: false, mensagem: 'Essa data não existe.' };
  }
  const periodo = periodoAtual_();
  if (data > periodo.fim) {
    erros.push('A data é posterior ao período aberto. Comprovante atrasado é do passado.');
  } else if (data >= periodo.inicio) {
    erros.push('Essa data está DENTRO do período aberto (' +
      formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim) + '). ' +
      'Não há atraso: use "Novo lançamento".');
  }

  const tipo = String((dados && dados.tipo) || '').trim();
  if (TIPOS_DESPESA.indexOf(tipo) === -1) erros.push('Escolha um tipo de despesa válido.');

  const valor = Number(String((dados && dados.valor) || '').replace(/\./g, '').replace(',', '.'));
  if (!isFinite(valor) || !(valor > 0)) erros.push('Informe o valor do comprovante.');

  const temLitros = TIPOS_COM_LITROS.indexOf(tipo) !== -1;
  let litros = 0;
  if (dados && dados.litros !== '' && dados.litros != null) {
    litros = Number(String(dados.litros).replace(',', '.'));
    if (!isFinite(litros) || litros < 0) erros.push('Quantidade inválida.');
    if (litros > 0 && !temLitros) {
      erros.push('Quantidade só é aceita em abastecimento, lubrificante, ARLA ou gás.');
    }
  }

  let km = null;
  if (dados && dados.km !== '' && dados.km != null) {
    km = Number(String(dados.km).replace(/\./g, '').replace(',', '.'));
    if (!isFinite(km) || !(km > 0)) erros.push('KM inválido.');
    // O KM NAO entra na serie do odometro — ver o cabecalho deste modulo. Fica
    // aqui como informacao do papel, e o relatorio mostra.
  }

  if (erros.length) return { ok: false, mensagem: erros.join('\n') };

  // Mesma placa, mesma data e mesmo documento quase sempre e o mesmo papel
  // digitado duas vezes — o atraso faz justamente perder a nocao do que ja entrou.
  const documento = String((dados && dados.documento) || '').trim().slice(0, 60);
  const alvoPlaca = normalizaPlaca_(veic.placa);
  const iso = Utilities.formatDate(data, timezone_(), 'yyyy-MM-dd');
  const repetido = lerComprovantes_().filter(function (c) {
    if (String(c[COL_COMP.SITUACAO - 1]).toUpperCase() === COMP_DESCARTADO_) return false;
    if (normalizaPlaca_(c[COL_COMP.PLACA - 1]) !== alvoPlaca) return false;
    const d = c[COL_COMP.DATA - 1];
    if (!(d instanceof Date)) return false;
    if (Utilities.formatDate(d, timezone_(), 'yyyy-MM-dd') !== iso) return false;
    if (documento) return String(c[COL_COMP.DOCUMENTO - 1] || '').trim() === documento;
    return Math.abs((Number(c[COL_COMP.VALOR - 1]) || 0) - valor) < 0.005;
  })[0];
  if (repetido && !(dados && dados.confirmarDuplicado)) {
    return { ok: false, duplicidade: true,
      mensagem: 'Já existe um comprovante de ' + veic.placa + ' em ' + formatarData_(data) +
        (documento ? ' com o documento ' + documento : ' com o mesmo valor') +
        ' (linha ' + repetido.linha + ', ' + String(repetido[COL_COMP.SITUACAO - 1]) + '). ' +
        'Confirme se quiser registrar mesmo assim.' };
  }

  const sheet = aba_(ABAS.COMPROVANTES, true);
  garantirColunas_(sheet, TOTAL_COL_COMP);
  garantirCabecalhoAba_(sheet, ABAS.COMPROVANTES);
  const linha = Math.max(2, sheet.getLastRow() + 1);
  garantirLinhas_(sheet, linha);
  sheet.getRange(linha, 1, 1, TOTAL_COL_COMP).setValues([[
    data, veic.placa, tipo, litros || '', valor, km === null ? '' : km, documento,
    normalizarCentroCusto_(veic.centro) || '⚠ sem cadastro',
    mesCompetenciaDaData_(data), COMP_PENDENTE_,
    String((dados && dados.observacao) || '').trim().slice(0, 300),
    new Date(), String(sessao.email || emailContextoAtual_() || ''), '', '',
  ]]);
  sheet.getRange(linha, COL_COMP.DATA).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(linha, COL_COMP.VALOR).setNumberFormat('R$ #,##0.00');
  sheet.getRange(linha, COL_COMP.REGISTRADO_EM).setNumberFormat('dd/mm/yyyy HH:mm');
  invalidarCacheComprovantes_();

  registrarLog_('Comprovante atrasado', veic.placa + ' • ' + formatarData_(data) + ' • ' +
    tipo + ' • R$ ' + valor.toFixed(2) + ' • competência ' + mesCompetenciaDaData_(data));

  return {
    ok: true,
    linha: linha,
    mensagem: 'Comprovante registrado: ' + veic.placa + ' • ' + formatarData_(data) +
      ' • R$ ' + valor.toFixed(2).replace('.', ',') + ' • competência ' +
      mesCompetenciaDaData_(data) + '. Ele NÃO entra em nenhum fechamento até ser incorporado.',
  };
}

/**
 * Incorpora o comprovante como lancamento do periodo ABERTO.
 *
 * A data do lancamento e de HOJE (ou o ultimo dia do periodo, se hoje ja passou
 * dele), nunca a do abastecimento: usar a data original jogaria a despesa num
 * mes fechado, que e exatamente o que este modulo existe para evitar. A data
 * verdadeira vai para a observacao, onde fica rastreavel.
 */
function webIncorporarComprovante(token, linhaComprovante) {
  autorizarContextoWeb_(token, 'ADMIN');
  const sheet = aba_(ABAS.COMPROVANTES);
  const alvo = Math.floor(Number(linhaComprovante) || 0);
  if (alvo < 2 || alvo > sheet.getLastRow()) {
    return { ok: false, mensagem: 'Comprovante não encontrado.' };
  }
  const c = sheet.getRange(alvo, 1, 1, TOTAL_COL_COMP).getValues()[0];
  const situacao = String(c[COL_COMP.SITUACAO - 1] || '').trim().toUpperCase();
  if (situacao !== COMP_PENDENTE_) {
    return { ok: false, mensagem: 'Este comprovante já está como ' + situacao + '.' };
  }

  const placa = String(c[COL_COMP.PLACA - 1] || '').trim();
  const dataOriginal = c[COL_COMP.DATA - 1];
  const tipo = String(c[COL_COMP.TIPO - 1] || '').trim();
  const litros = Number(c[COL_COMP.LITROS - 1]) || 0;
  const valor = Number(c[COL_COMP.VALOR - 1]) || 0;
  if (!(valor > 0)) return { ok: false, mensagem: 'Comprovante sem valor.' };

  const resolvido = resolverVeiculo_(placa, false);
  if (!resolvido.ok) {
    return { ok: false, mensagem: 'O veículo ' + placa + ' não está mais no cadastro.' };
  }
  const veic = resolvido.veiculo;

  const periodo = periodoAtual_();
  const hoje = new Date();
  const dataLanc = (hoje >= periodo.inicio && hoje <= periodo.fim)
    ? new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0, 0)
    : new Date(periodo.fim.getFullYear(), periodo.fim.getMonth(), periodo.fim.getDate(), 12, 0, 0, 0);

  const marcaOriginal = 'Comprovante atrasado de ' + formatarData_(dataOriginal) +
    ' (competência ' + String(c[COL_COMP.COMPETENCIA - 1] || '') + ')';
  const observacao = (marcaOriginal + ' • ' +
    String(c[COL_COMP.OBSERVACAO - 1] || '')).trim().replace(/ • $/, '').slice(0, 300);

  const lancamentos = aba_(ABAS.LANCAMENTOS);
  const idLancamento = novoIdLancamento_();
  const linha = proximaLinhaLancamento_();
  garantirValidacaoTiposLancamento_(lancamentos, tipo, '');
  try {
    lancamentos.getRange(linha, 1, 1, COL_LANC.PERIODO - 1).setValues([[
      dataLanc, veic.placa, tipo, litros || '', valor,
      String(c[COL_COMP.DOCUMENTO - 1] || ''), observacao,
      normalizarCentroCusto_(veic.centro) || '⚠ sem cadastro',
      String(veic.categoria || '').trim() || '⚠ sem cadastro',
    ]]);
    lancamentos.getRange(linha, COL_LANC.ID, 1, TOTAL_COL_LANC - COL_LANC.ID + 1)
      .setValues([[idLancamento, '', '', '', '']]);
  } catch (e) {
    try {
      lancamentos.getRange(linha, 1, 1, COL_LANC.PERIODO - 1).clearContent();
      lancamentos.getRange(linha, COL_LANC.ID, 1, TOTAL_COL_LANC - COL_LANC.ID + 1).clearContent();
    } catch (e2) {}
    return { ok: false, mensagem: 'Não foi possível gravar o lançamento: ' + e.message };
  }

  sheet.getRange(alvo, COL_COMP.SITUACAO, 1, 1).setValue(COMP_INCORPORADO_);
  sheet.getRange(alvo, COL_COMP.INCORPORADO_EM, 1, 2).setValues([[new Date(), idLancamento]]);
  sheet.getRange(alvo, COL_COMP.INCORPORADO_EM).setNumberFormat('dd/mm/yyyy HH:mm');

  invalidarCacheComprovantes_();
  invalidarCacheLancamentos_();
  invalidarCacheInicio_();
  marcarResumoDesatualizado_();
  registrarLog_('Incorporar comprovante', placa + ' • original ' + formatarData_(dataOriginal) +
    ' • lançado em ' + formatarData_(dataLanc) + ' • R$ ' + valor.toFixed(2) + ' • ' + idLancamento);

  // O aviso dos litros nao e enfeite: trazer o combustivel de um mes para outro
  // sem o KM correspondente piora o km/l do mes que recebe, e quem fechar o mes
  // precisa saber explicar a variacao.
  const aviso = litros > 0
    ? ' Atenção: ' + litros.toLocaleString('pt-BR') + ' L entraram no mês aberto sem o KM ' +
      'correspondente (que é de ' + formatarData_(dataOriginal) + '), então o km/l deste mês piora.'
    : '';
  return {
    ok: true,
    mensagem: 'Incorporado como lançamento de ' + formatarData_(dataLanc) + ' — ' +
      veic.placa + ' • R$ ' + valor.toFixed(2).replace('.', ',') + ' • ' + idLancamento +
      '. A data original ficou na observação.' + aviso,
  };
}

/** Marca o comprovante como descartado, com motivo. Nao apaga: a trilha fica. */
function webDescartarComprovante(token, linhaComprovante, motivo) {
  autorizarContextoWeb_(token, 'ADMIN');
  const texto = String(motivo || '').trim();
  if (texto.length < 5) {
    return { ok: false, mensagem: 'Diga por que está descartando (mínimo 5 caracteres). ' +
      'Sem motivo, ninguém saberá depois se foi duplicata ou se o papel era inválido.' };
  }
  const sheet = aba_(ABAS.COMPROVANTES);
  const alvo = Math.floor(Number(linhaComprovante) || 0);
  if (alvo < 2 || alvo > sheet.getLastRow()) {
    return { ok: false, mensagem: 'Comprovante não encontrado.' };
  }
  const situacao = String(sheet.getRange(alvo, COL_COMP.SITUACAO).getValue() || '').toUpperCase();
  if (situacao === COMP_INCORPORADO_) {
    return { ok: false, mensagem: 'Já foi incorporado: o lançamento existe na base. ' +
      'Para desfazer, exclua o lançamento em "Corrigir / excluir lançamento".' };
  }
  const placa = String(sheet.getRange(alvo, COL_COMP.PLACA).getValue() || '');
  sheet.getRange(alvo, COL_COMP.SITUACAO).setValue(COMP_DESCARTADO_);
  const obs = String(sheet.getRange(alvo, COL_COMP.OBSERVACAO).getValue() || '');
  sheet.getRange(alvo, COL_COMP.OBSERVACAO)
    .setValue(('Descartado: ' + texto + (obs ? ' • ' + obs : '')).slice(0, 300));
  invalidarCacheComprovantes_();
  registrarLog_('Descartar comprovante', placa + ' • linha ' + alvo + ' • ' + texto);
  return { ok: true, mensagem: 'Comprovante descartado. O registro continua na aba, com o motivo.' };
}

/**
 * Relatorio de lancamentos fora de periodo.
 *
 * O numero que importa aqui e o PENDENTE por competencia: e quanto de despesa
 * real ainda esta fora do mapa daquele mes. Sem ele, o custo por km de uma loja
 * parece melhor do que foi, e ninguem sabe de quanto.
 */
function webComprovantes(token, situacaoFiltro) {
  exigirPerfilToken_(token, PERFIS_ACESSO);
  const filtro = String(situacaoFiltro || COMP_PENDENTE_).toUpperCase();
  const todos = lerComprovantes_();

  const porCompetencia = {};
  let pendentes = 0, valorPendente = 0, litrosPendentes = 0;
  todos.forEach(function (c) {
    const sit = String(c[COL_COMP.SITUACAO - 1] || '').trim().toUpperCase();
    const comp = String(c[COL_COMP.COMPETENCIA - 1] || '').trim();
    if (sit !== COMP_PENDENTE_) return;
    pendentes++;
    valorPendente += Number(c[COL_COMP.VALOR - 1]) || 0;
    litrosPendentes += Number(c[COL_COMP.LITROS - 1]) || 0;
    const g = porCompetencia[comp] || (porCompetencia[comp] = { qtd: 0, valor: 0 });
    g.qtd++;
    g.valor += Number(c[COL_COMP.VALOR - 1]) || 0;
  });

  const visiveis = todos.filter(function (c) {
    if (filtro === 'TODOS') return true;
    return String(c[COL_COMP.SITUACAO - 1] || '').trim().toUpperCase() === filtro;
  }).sort(function (a, b) {
    const da = a[COL_COMP.DATA - 1], db = b[COL_COMP.DATA - 1];
    return (db instanceof Date ? db.getTime() : 0) - (da instanceof Date ? da.getTime() : 0);
  });

  return {
    situacao: filtro,
    situacoes: ['TODOS'].concat(SITUACOES_COMPROVANTE_),
    pendentes: pendentes,
    valorPendente: valorPendente,
    litrosPendentes: litrosPendentes,
    porCompetencia: Object.keys(porCompetencia).sort().reverse().map(function (k) {
      return { competencia: k, qtd: porCompetencia[k].qtd, valor: porCompetencia[k].valor };
    }),
    itens: visiveis.map(function (c) {
      return {
        linha: c.linha,
        data: formatarData_(c[COL_COMP.DATA - 1]),
        placa: String(c[COL_COMP.PLACA - 1] || ''),
        tipo: String(c[COL_COMP.TIPO - 1] || ''),
        litros: Number(c[COL_COMP.LITROS - 1]) || 0,
        valor: Number(c[COL_COMP.VALOR - 1]) || 0,
        km: Number(c[COL_COMP.KM - 1]) || 0,
        documento: String(c[COL_COMP.DOCUMENTO - 1] || ''),
        centro: String(c[COL_COMP.CENTRO - 1] || ''),
        competencia: String(c[COL_COMP.COMPETENCIA - 1] || ''),
        situacao: String(c[COL_COMP.SITUACAO - 1] || ''),
        observacao: String(c[COL_COMP.OBSERVACAO - 1] || ''),
      };
    }),
    colunas: [col_('Data do abastecimento'), col_('Placa'), col_('Competência'),
      col_('Tipo'), col_('Litros', 'decimal'), col_('Valor', 'moeda'),
      col_('KM do comprovante', 'numero'), col_('NF / Documento'), col_('Centro'),
      col_('Situação')],
    linhas: visiveis.map(function (c) {
      return [formatarData_(c[COL_COMP.DATA - 1]), String(c[COL_COMP.PLACA - 1] || ''),
        String(c[COL_COMP.COMPETENCIA - 1] || ''), String(c[COL_COMP.TIPO - 1] || ''),
        Number(c[COL_COMP.LITROS - 1]) || 0, Number(c[COL_COMP.VALOR - 1]) || 0,
        Number(c[COL_COMP.KM - 1]) || 0, String(c[COL_COMP.DOCUMENTO - 1] || ''),
        String(c[COL_COMP.CENTRO - 1] || ''), String(c[COL_COMP.SITUACAO - 1] || '')];
    }),
    totais: [null, null, null, null,
      visiveis.reduce(function (t, c) { return t + (Number(c[COL_COMP.LITROS - 1]) || 0); }, 0),
      visiveis.reduce(function (t, c) { return t + (Number(c[COL_COMP.VALOR - 1]) || 0); }, 0),
      null, null, null, null],
    mensagem: pendentes
      ? pendentes + ' comprovante(s) pendente(s), R$ ' +
        valorPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
        ' fora do mapa. Nenhum deles afeta fechamento até ser incorporado.'
      : 'Nenhum comprovante pendente.',
  };
}

function garantirAutomacoesSistema_() {
  const legadosRemovidos = removerTriggersLegados_();
  return {
    legadosRemovidos: legadosRemovidos,
    backupCriado: garantirTriggerBackupDiario_(),
    auditoriaCriada: garantirTriggerAuditoriaEdicao_(),
    loginsCriado: garantirTriggerFlushLogins_(),
    aquecimentoCriado: garantirTriggerAquecerCaches_(),
    alertaHora: garantirTriggerAlertaDiario_(),
    backupAtivo: triggerBackupAtivo_(),
    auditoriaAtiva: triggerAuditoriaEdicaoAtivo_(),
    loginsAtivo: triggerFlushLoginsAtivo_(),
    aquecimentoAtivo: triggerAquecerCachesAtivo_(),
    alertaAtivo: triggerAlertaDiarioAtivo_()
  };
}

const PROP_ALERTA_INTEGRIDADE_HISTORICO_ = 'ALERTA_INTEGRIDADE_HISTORICO_V46';

/** Marca imediatamente uma edição manual que tocou uma competência já fechada. */
function registrarAlertaIntegridadeHistorica_(e, quem) {
  try {
    if (!e || !e.range) return false;
    const sheet = e.range.getSheet();
    const nome = sheet.getName();
    if ([ABAS.LANCAMENTOS, ABAS.ODOMETRO].indexOf(nome) === -1) return false;
    const primeira = Math.max(2, e.range.getRow());
    const ultima = e.range.getRow() + e.range.getNumRows() - 1;
    if (ultima < 2) return false;
    const qtd = ultima - primeira + 1;
    const datas = sheet.getRange(primeira, 1, qtd, 1).getValues();
    const atual = normalizarMesReferencia_(param_('MES_REFERENCIA'));
    const hist = ss_().getSheetByName(ABAS.HISTORICO);
    const fechados = {};
    if (hist && hist.getLastRow() >= 2) {
      hist.getRange(2, 1, hist.getLastRow() - 1, 1).getDisplayValues().forEach(function(l) {
        const m = String(l[0] || '').trim(); if (m) fechados[m] = true;
      });
    }
    const meses = {};
    datas.forEach(function(l) {
      const d = l[0];
      if (!(d instanceof Date) || isNaN(d.getTime())) return;
      const mes = mesCompetenciaDaData_(d);
      if (mes && mes < atual && fechados[mes]) meses[mes] = true;
    });
    const afetados = Object.keys(meses);
    if (!afetados.length) return false;
    const payload = {
      quandoMs: Date.now(), quem: String(quem || '(desconhecido)'),
      aba: nome, faixa: e.range.getA1Notation(), periodos: afetados
    };
    PropertiesService.getScriptProperties().setProperty(PROP_ALERTA_INTEGRIDADE_HISTORICO_, JSON.stringify(payload));
    invalidarCacheSaude_();
    return true;
  } catch (err) {
    console.error('registrarAlertaIntegridadeHistorica_: ' + err.message);
    return false;
  }
}

/** Auditoria passiva: registra alterações manuais e sinaliza imediatamente histórico fechado tocado. */
function auditoriaEdicaoInstalavel_(e) {
  try {
    if (!e || !e.range) return;
    const nome = e.range.getSheet().getName();
    const sensiveis = [ABAS.LANCAMENTOS,ABAS.ODOMETRO,ABAS.VEICULOS,ABAS.CENTROS,ABAS.PARAMETROS,ABAS.USUARIOS];
    if (sensiveis.indexOf(nome) === -1) return;
    let quem='';
    try { if(e.user && typeof e.user.getEmail==='function') quem=e.user.getEmail()||''; } catch(err) {}
    quem=String(quem||'').trim().toLowerCase() || '(identidade não fornecida pelo Google)';
    let detalhe=nome+'!'+e.range.getA1Notation()+' • '+e.range.getNumRows()+'x'+e.range.getNumColumns();
    if (e.oldValue !== undefined || e.value !== undefined) {
      detalhe += ' • anterior: ' + String(e.oldValue===undefined?'(vazio)':e.oldValue).slice(0,120) +
        ' • novo: ' + String(e.value===undefined?'(vazio)':e.value).slice(0,120);
    }
    // Dois ADMINs podem ter gatilhos próprios durante uma sucessão. O cache compartilhado
    // deduplica o mesmo evento sem depender de quem criou o gatilho.
    const bucket=Math.floor(Date.now()/5000);
    const chave='AUD_EDIT_'+hashIntegridade_(nome+'|'+e.range.getA1Notation()+'|'+String(e.oldValue)+'|'+String(e.value)+'|'+bucket).slice(0,32);
    const cache=CacheService.getScriptCache();
    const lock=LockService.getScriptLock();
    if (!lock.tryLock(1500)) return;
    try {
      if (cache.get(chave)) return;
      cache.put(chave,'1',15);
    } finally { lock.releaseLock(); }
    const historicoTocado = registrarAlertaIntegridadeHistorica_(e, quem);
    registrarLogComUsuario_(quem,historicoTocado?'⚠ Edição em período fechado':'Edição direta na planilha',detalhe);

    // V4.8: este gatilho roda com a conta de quem o instalou (ADMIN), que pode gravar
    // no Resumo protegido. Recalcula em segundo plano após edição direta nas bases.
    if ([ABAS.LANCAMENTOS, ABAS.ODOMETRO, ABAS.VEICULOS, ABAS.PARAMETROS].indexOf(nome) !== -1) {
      const contextoResumo = CONTEXTO_SISTEMA_INTERNO_;
      CONTEXTO_SISTEMA_INTERNO_ = true;
      try {
        VEICULOS_EXEC_CACHE_ = null; PARAM_EXEC_CACHE_ = null; invalidarCacheLancamentos_();
        atualizarResumoSeguro_();
      } finally { CONTEXTO_SISTEMA_INTERNO_ = contextoResumo; }
    }

    // Se um ADMIN alterar diretamente identidade/perfil/ativo na aba Usuários,
    // o gatilho instalável (executado pelo criador autorizado) ressincroniza as proteções.
    if (nome === ABAS.USUARIOS) {
      const cIni=e.range.getColumn(), cFim=cIni+e.range.getNumColumns()-1;
      if (cIni <= 6 && cFim >= 1) {
        const contextoInternoAnterior=CONTEXTO_SISTEMA_INTERNO_;
        CONTEXTO_SISTEMA_INTERNO_=true;
        try { protegerAbasCalculadas_(); invalidarCacheSaude_(); }
        catch(syncErr) { registrarLogComUsuario_(quem,'Aviso proteção por perfil',syncErr.message); }
        finally { CONTEXTO_SISTEMA_INTERNO_=contextoInternoAnterior; }
      }
    }
  } catch(err) { console.error('auditoriaEdicaoInstalavel_: '+err.message); }
}

/** Descarrega logins pendentes em lote; não participa do caminho crítico do login. */
function processarLoginsPendentesAgendado_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    descarregarLoginsPendentes_();
    // Aproveita a mesma passagem horaria para recolher os lastros de sessao
    // vencidos. Sem isso eles so acumulam: as Properties tem teto de tamanho, e
    // estourar o teto quebraria TODO setProperty do sistema, nao so o de sessao.
    limparLastrosVencidos_();
  } finally { lock.releaseLock(); }
}

/** Função executada pelo gatilho instalável. Não depende de sessão do Web App. */
function backupAutomaticoDiario_() {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const props=PropertiesService.getScriptProperties();
    const ultimo=Number(props.getProperty('ULTIMO_BACKUP_AUTOMATICO_EM')||0);
    // Sucessão pode deixar dois gatilhos ativos por algumas horas; no máximo 1 backup automático/20h.
    if (ultimo && Date.now()-ultimo < 20*60*60*1000) return;
    criarBackupSistema_('automático diário');
    props.setProperty('ULTIMO_BACKUP_AUTOMATICO_EM',String(Date.now()));
  } catch (e) {
    registrarLog_('Erro backup automático', e.message);
    throw e;
  } finally { lock.releaseLock(); }
}

function diasDesde_(ms) {
  if (!ms) return null;
  return Math.floor((Date.now() - Number(ms)) / 86400000);
}

function diagnosticoSaudeRapida_(forcar) {
  const inicio = Date.now();
  const cache = CacheService.getScriptCache();
  if (!forcar) {
    const bruto = cache.get(CACHE_SAUDE_RAPIDA_);
    if (bruto) {
      try { const c = JSON.parse(bruto); c.cacheHit = true; c.tempoMs = Date.now() - inicio; return c; } catch(e) {}
    }
  }
  const planilha = ss_();
  const checks = [];
  let criticos = 0, avisos = 0;
  function adicionar(nome,status,detalhe){ status=String(status||'OK').toUpperCase(); if(status==='CRITICO')criticos++; if(status==='AVISO')avisos++; checks.push({nome:nome,status:status,detalhe:String(detalhe||'')}); }

  const abasDados=[ABAS.PARAMETROS,ABAS.CENTROS,ABAS.VEICULOS,ABAS.LANCAMENTOS,ABAS.ODOMETRO,ABAS.HISTORICO,ABAS.USUARIOS];
  const abasCalc=[ABAS.CENTRAL_OPERACIONAL,ABAS.RESUMO,ABAS.RATEIO,ABAS.DASHBOARD,ABAS.RELATORIOS,ABAS.CONSULTA,ABAS.CONFERENCIA,ABAS.LOG];
  const faltamDados=abasDados.filter(function(n){return !planilha.getSheetByName(n);});
  const faltamCalc=abasCalc.filter(function(n){return !planilha.getSheetByName(n);});
  adicionar('Base de dados',faltamDados.length?'CRITICO':'OK',faltamDados.length?'Faltando: '+faltamDados.join(', '):'Todas as abas essenciais estão presentes.');
  adicionar('Estrutura calculada',faltamCalc.length?'AVISO':'OK',faltamCalc.length?'Pode ser reconstruída: '+faltamCalc.join(', '):'Interfaces e relatórios principais presentes.');

  const admins=listarAdminsAtivos_();
  adicionar('Administradores',admins.length<2?'CRITICO':'OK',admins.length+' ADMIN(s) ativo(s)'+(admins.length>=2?': '+admins.join(', '):'. Cadastre pelo menos 2.'));
  const dominios=dominiosLoginPermitidos_();
  adicionar('Domínio de login',dominios.length?'OK':'AVISO',dominios.length?'Permitido(s): '+dominios.join(', ')+'.':'Sem restrição adicional de domínio; somente o cadastro interno protege o login.');
  const usuariosSheet=planilha.getSheetByName(ABAS.USUARIOS); const foraDominio=[];
  const usuariosDuplicados=[], usuariosPerfilInvalido=[], usuariosSemCredencial=[], usuariosStatusInvalido=[];
  const vistosUsuarios={};
  if(usuariosSheet&&usuariosSheet.getLastRow()>=2){
    usuariosSheet.getRange(2,1,usuariosSheet.getLastRow()-1,8).getValues().forEach(function(l){
      const email=String(l[0]||'').trim().toLowerCase(); if(!email)return;
      const perfil=String(l[2]||'').trim().toUpperCase();
      const ativo=String(l[5]||'').trim().toUpperCase();
      const troca=String(l[7]||'').trim().toUpperCase();
      if(vistosUsuarios[email]) usuariosDuplicados.push(email); else vistosUsuarios[email]=true;
      if(PERFIS_ACESSO.indexOf(perfil)===-1) usuariosPerfilInvalido.push(email);
      if(['SIM','NAO'].indexOf(ativo)===-1 || ['SIM','NAO'].indexOf(troca)===-1) usuariosStatusInvalido.push(email);
      if(ativo==='SIM' && (!String(l[3]||'').trim() || !String(l[4]||'').trim())) usuariosSemCredencial.push(email);
      if(ativo==='SIM' && !emailDominioPermitido_(email)) foraDominio.push(email);
    });
  }
  const integridadeUsuariosOk=!usuariosDuplicados.length&&!usuariosPerfilInvalido.length&&!usuariosSemCredencial.length&&!usuariosStatusInvalido.length;
  adicionar('Integridade dos usuários',integridadeUsuariosOk?'OK':'CRITICO',integridadeUsuariosOk?'Cadastros únicos, perfis/status válidos e credenciais presentes.':
    'Duplicados: '+usuariosDuplicados.length+' • perfil inválido: '+usuariosPerfilInvalido.length+' • credencial ausente: '+usuariosSemCredencial.length+' • status inválido: '+usuariosStatusInvalido.length+'.');
  adicionar('Usuários x domínio',foraDominio.length?'CRITICO':'OK',foraDominio.length?'Usuário(s) ativo(s) fora do domínio permitido: '+foraDominio.join(', '):'Todos os usuários ativos atendem à política de domínio.');

  const protecoes=planilha.getProtections(SpreadsheetApp.ProtectionType.SHEET).filter(function(p){return String(p.getDescription()||'').indexOf('Sistema de Frota — perfil — ')===0;});
  const esperadas=[ABAS.CENTRAL_OPERACIONAL,ABAS.DASHBOARD,ABAS.RESUMO,ABAS.RELATORIOS,ABAS.RATEIO,ABAS.CONSULTA,ABAS.LANCAMENTOS,ABAS.ODOMETRO,ABAS.VEICULOS,ABAS.CENTROS,ABAS.HISTORICO,ABAS.PARAMETROS,ABAS.CONFERENCIA,ABAS.USUARIOS,ABAS.LOG].filter(function(n){return !!planilha.getSheetByName(n);}).length;
  const avisoProt=protecoes.some(function(p){return p.isWarningOnly();});
  adicionar('Proteção por perfil',protecoes.length<esperadas||avisoProt?'AVISO':'OK',protecoes.length+' de '+esperadas+' folhas com proteção real. Auditoria detalhada disponível sob demanda.');

  let soma=0; const cs=planilha.getSheetByName(ABAS.CENTROS);
  if(cs&&cs.getLastRow()>=2)cs.getRange(2,2,cs.getLastRow()-1,1).getValues().forEach(function(l){soma+=Number(l[0]||0);});
  adicionar('Rateio dos centros',Math.abs(soma-1)>0.0001?'AVISO':'OK','Soma atual: '+(soma*100).toFixed(3)+'%.');

  const ls=planilha.getSheetByName(ABAS.LANCAMENTOS); const usados=ls?quantidadeLancamentosReais_():0; const capacidade=limiteLancamentosAtual_(); const uso=capacidade?usados/capacidade:0;
  adicionar('Capacidade de lançamentos',uso>=0.95?'CRITICO':(uso>=0.75?'AVISO':'OK'),usados+' de '+capacidade+' linhas ('+(uso*100).toFixed(1)+'%). Expansão automática ativa a partir de 80%.');

  // Antes do dia 25 não há depreciação exigível. Evitamos varrer toda a base de
  // lançamentos no diagnóstico rápido apenas para concluir que ela ainda está AGUARDANDO.
  let dep=null;
  try {
    const pDep=periodoAtual_();
    if (!depreciacaoLiberada_(pDep)) {
      adicionar('Depreciação mensal','OK','Aguardando '+formatarData_(dataUltimoDiaPeriodo_(pDep))+'. Antes desta data não é pendência.');
    } else {
      dep=statusDepreciacaoMensal_();
      adicionar('Depreciação mensal',(dep.pendentes||dep.divergentes)?'AVISO':'OK',(dep.pendentes||dep.divergentes)?dep.pendentes+' pendente(s), '+dep.divergentes+' divergente(s).':'Competência regularizada.');
    }
  } catch(e) { adicionar('Depreciação mensal','AVISO','Não foi possível verificar: '+e.message); }
  const pend=contarPendenciasConferencia_(); adicionar('Pendências de conferência',pend>0?'AVISO':'OK',pend?pend+' item(ns) em aberto.':'Nenhuma pendência ativa.');
  let alertaHist=null; try{const bruto=PropertiesService.getScriptProperties().getProperty(PROP_ALERTA_INTEGRIDADE_HISTORICO_);if(bruto)alertaHist=JSON.parse(bruto);}catch(e){}
  adicionar('Integridade histórica',alertaHist?'CRITICO':'OK',alertaHist?('Edição direta detectada em período fechado ('+(alertaHist.periodos||[]).join(', ')+') • '+alertaHist.aba+'!'+alertaHist.faixa+' • '+alertaHist.quem+'. Execute a Auditoria profunda.'):'Nenhuma edição manual recente sinalizada em períodos fechados.');
  const trig=triggerBackupAtivo_(); adicionar('Backup automático',trig?'OK':'AVISO',trig?'Gatilho diário ativo na janela das '+('0'+HORA_BACKUP_AUTOMATICO_).slice(-2)+'h.':'Gatilho não encontrado.');
  const trigAudit=triggerAuditoriaEdicaoAtivo_(); adicionar('Auditoria de edição',trigAudit?'OK':'AVISO',trigAudit?'Alterações manuais em bases sensíveis são registradas no Log.':'Gatilho de auditoria não encontrado; pode ser recriado pela Saúde do Sistema.');
  const trigLogins=triggerFlushLoginsAtivo_(); adicionar('Auditoria de login',trigLogins?'OK':'AVISO',trigLogins?'Logins pendentes são consolidados automaticamente a cada hora sem atrasar a entrada.':'Gatilho horário de consolidação dos logins não encontrado.');

  const props=PropertiesService.getScriptProperties(); const ultimoMs=Number(props.getProperty('ULTIMO_BACKUP_FROTA_EM')||0); const idade=ultimoMs?diasDesde_(ultimoMs):null; const validado=props.getProperty('ULTIMO_BACKUP_FROTA_VALIDADO')==='SIM'; const versaoBkp=String(props.getProperty('ULTIMO_BACKUP_FROTA_VERSAO')||'');
  adicionar('Último backup',!ultimoMs||idade>2||!validado||versaoBkp!==VERSAO_SISTEMA?'AVISO':'OK',ultimoMs?Utilities.formatDate(new Date(ultimoMs),timezone_(),'dd/MM/yyyy HH:mm')+' • '+(validado?'validado':'sem validação registrada')+' • versão '+(versaoBkp||'não registrada'):'Nenhum backup registrado.');
  const url=ScriptApp.getService().getUrl(); adicionar('Web App',url?'OK':'AVISO',url?'Implantação acessível pelo serviço atual.':'URL do Web App não localizada; a Central Operacional continua como contingência.');
  const continuidade=admins.length>=2&&integridadeUsuariosOk&&!foraDominio.length&&trig&&trigAudit&&trigLogins&&ultimoMs&&idade<=2&&validado&&versaoBkp===VERSAO_SISTEMA&&!faltamDados.length;
  adicionar('Continuidade operacional',continuidade?'OK':'AVISO',continuidade?'Redundância mínima pronta: 2+ ADMINs, backup recente, automações e base presentes.':'Revise ADMINs, backup, gatilho ou estrutura antes de uma troca de responsável.');

  const mes=normalizarMesReferencia_(param_('MES_REFERENCIA')); const p=periodoDoMes_(mes);
  const out={versao:VERSAO_SISTEMA,estado:criticos?'CRITICO':(avisos?'ATENCAO':'OK'),criticos:criticos,avisos:avisos,checks:checks,backups:[],adminCount:admins.length,pendencias:pend,periodo:nomeDoMes_(mes)+' • '+formatarData_(p.inicio)+' a '+formatarData_(p.fim),tempoMs:Date.now()-inicio,cacheHit:false,modo:'RAPIDO'};
  try{cache.put(CACHE_SAUDE_RAPIDA_,JSON.stringify(out),CACHE_SAUDE_RAPIDA_SEGUNDOS_);}catch(e){}
  return out;
}

function diagnosticoAuditoriaProfunda_() {
  const inicio=Date.now();
  const rapido=diagnosticoSaudeRapida_(true);
  const checks=rapido.checks.slice(); let criticos=rapido.criticos, avisos=rapido.avisos;
  function adicionar(nome,status,detalhe){status=String(status||'OK').toUpperCase();if(status==='CRITICO')criticos++;if(status==='AVISO')avisos++;checks.push({nome:nome,status:status,detalhe:String(detalhe||'')});}

  let formulas={problemas:[],celulasLidas:0}; try{formulas=verificarFormulas_();}catch(e){formulas={problemas:[['Sistema','','ERRO',e.message]],celulasLidas:0};}
  const grupos=agruparErrosFormula_(formulas.problemas);
  adicionar('Auditoria de fórmulas',formulas.problemas.length?'AVISO':'OK',formulas.problemas.length?formulas.problemas.length+' célula(s) afetada(s) em '+grupos.length+' grupo(s) de causa.':'Nenhum erro em '+formulas.celulasLidas+' célula(s) verificadas.');
  const prot=auditarProtecoesPerfil_(); adicionar('Matriz de permissões',prot.ok?'OK':'CRITICO',prot.ok?'Faixas e perfis essenciais conferidos.':prot.falhas.slice(0,12).join(' • '));

  // Integridade dos IDs e duplicidades exatas por documento.
  const sheet=ss_().getSheetByName(ABAS.LANCAMENTOS); let semId=0, idsDup=0, dupDocs=0;
  const qtdAudit=quantidadeLancamentosReais_();
  if(sheet&&qtdAudit>=1){const dados=sheet.getRange(2,1,qtdAudit,12).getValues();const ids={},ass={};dados.forEach(function(l){if(!l[1])return;const id=String(l[11]||'').trim();if(!id)semId++;else{idsDup+=ids[id]?1:0;ids[id]=true;}const a=assinaturaLancamento_(l[0],l[1],l[2],l[4],l[6]);if(a){dupDocs+=ass[a]?1:0;ass[a]=true;}});}
  adicionar('Integridade dos lançamentos',(semId||idsDup)?'CRITICO':(dupDocs?'AVISO':'OK'),'Sem ID: '+semId+' • IDs repetidos: '+idsDup+' • possíveis duplicidades por documento: '+dupDocs+'.');

  const hist = auditarIntegridadeHistorico_();
  adicionar('Integridade dos períodos fechados', hist.divergencias.length ? 'CRITICO' : ((hist.semHash || hist.semFechado.length) ? 'AVISO' : 'OK'),
    hist.divergencias.length ? 'Base histórica alterada após fechamento: ' + hist.divergencias.join(', ') + '.' :
      (hist.semHash ? hist.semHash + ' período(s) sem lacre de integridade. Rode Instalar / atualizar sistema para criar baseline.' :
        (hist.semFechado.length ? 'Lacre OK, porém faltam abas congeladas para: ' + hist.semFechado.join(', ') + '.' :
          hist.verificados + ' período(s) fechado(s) conferido(s) pelo hash de lançamentos + odômetro.')));

  let backupCheck='Nenhum backup disponível para teste.'; let backupStatus='AVISO';
  try{const lista=listarBackupsSistema_(1);if(lista.length){const v=validarBackupSistema_(lista[0].id);backupStatus=v.ok?'OK':'CRITICO';backupCheck=lista[0].nome+' • '+v.mensagem;}}catch(e){backupStatus='CRITICO';backupCheck=e.message;}
  adicionar('Validação do backup mais recente',backupStatus,backupCheck);

  return {versao:VERSAO_SISTEMA,estado:criticos?'CRITICO':(avisos?'ATENCAO':'OK'),criticos:criticos,avisos:avisos,checks:checks,backups:[],adminCount:rapido.adminCount,pendencias:rapido.pendencias,periodo:rapido.periodo,tempoMs:Date.now()-inicio,cacheHit:false,modo:'PROFUNDO',gruposFormula:grupos,protecaoFalhas:prot.falhas};
}

// Compatibilidade interna: chamadas antigas recebem a versão rápida.
function diagnosticoSaudeSistema_() { return diagnosticoSaudeRapida_(false); }

function abasDadosAusentes_() {
  const planilha = ss_();
  return [ABAS.PARAMETROS, ABAS.CENTROS, ABAS.VEICULOS, ABAS.LANCAMENTOS,
    ABAS.ODOMETRO, ABAS.HISTORICO, ABAS.USUARIOS]
    .filter(function (n) { return !planilha.getSheetByName(n); });
}

/**
 * Autorreparo conservador. Se uma ABA DE DADOS desapareceu, não cria uma vazia
 * por cima do problema: interrompe e orienta a restauração de backup.
 */
function repararSistemaSeguro_() {
  const faltamDados = abasDadosAusentes_();
  if (faltamDados.length) {
    return {
      ok: false,
      mensagem: 'Reparo automático interrompido porque há aba(s) de dados ausente(s): ' +
        faltamDados.join(', ') + '. Use um backup para recuperar a base antes de reparar fórmulas.'
    };
  }

  const backup = criarBackupSistema_('antes do autorreparo');
  try {
    montarAbasDeDados_();
    montarLog_();
    montarUsuarios_();
    reconstruirRelatorios_();
    escreverConferencia_(coletarProblemas_());
    montarCentralOperacional_();
    protegerAbasCalculadas_();
    organizarAbas_();
    garantirAutomacoesSistema_();
    SpreadsheetApp.flush();
    invalidarCacheInicio_();
    registrarLog_('Autorreparo do sistema', 'V' + VERSAO_SISTEMA + ' • backup ' + backup.nome);
    return {
      ok: true,
      mensagem: 'Reparo concluído. Fórmulas, relatórios, validações e proteções foram reconstruídos sem apagar os lançamentos.',
      backup: backup,
      saude: diagnosticoSaudeSistema_()
    };
  } catch (e) {
    registrarLog_('Falha no autorreparo', e.message);
    return {
      ok: false,
      mensagem: 'O reparo encontrou um erro. Nenhum backup foi apagado. Backup de segurança criado: ' +
        backup.nome + '. Detalhe: ' + e.message,
      backup: backup
    };
  }
}

function limparEGravarValoresRestauracao_(destino, valores, colunas) {
  const linhasNecessarias = Math.max(valores.length, 2);
  garantirLinhas_(destino, linhasNecessarias + 5);
  garantirColunas_(destino, colunas);
  const limparAte = Math.max(destino.getLastRow(), linhasNecessarias);
  destino.getRange(1, 1, limparAte, colunas).clearContent();
  if (valores.length) destino.getRange(1, 1, valores.length, colunas).setValues(valores);
}

/**
 * Restaura somente a BASE OPERACIONAL no arquivo atual, preservando o URL do Web App.
 * Antes da restauração é criado automaticamente um backup de emergência do estado atual.
 */
function restaurarDadosDeBackupSemLock_(backupId) {
  const pasta = pastaBackupsSistema_();
  let encontrado = null;
  const it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getId() === String(backupId) &&
        String(f.getName()).indexOf(PREFIXO_BACKUP_SISTEMA_) === 0) {
      encontrado = f;
      break;
    }
  }
  if (!encontrado) throw new Error('Backup não encontrado na pasta oficial do sistema.');

  const origem = SpreadsheetApp.openById(encontrado.getId());
  const atual = ss_();

  // V4.8: larguras derivadas do schema. Antes eram 12 colunas em Veículos (perdia o
  // IPVA) e Lançamentos até o Detalhe da Oficina (perdia Fornecedor e Tipo de
  // Abastecimento — e com ele o custo do tanque interno).
  const especificacoes = [
    [ABAS.CENTROS, 3],
    [ABAS.VEICULOS, TOTAL_COL_VEIC],
    [ABAS.LANCAMENTOS, TOTAL_COL_LANC],
    [ABAS.ODOMETRO, 3],
    [ABAS.HISTORICO, 6],
  ];
  // Abas que só existem a partir da V4.7.2: restauradas quando o backup as tiver.
  const opcionais = [
    [ABAS.FORNECEDORES, totalColunas_(COL_FORN)],
    [ABAS.CARGA_BOMBA, totalColunas_(COL_CARGA)],
    // V4.9: backup anterior a esta versão simplesmente não as tem.
    [ABAS.RATEIO_MENSAL, TOTAL_COL_RM],
    [ABAS.ORCAMENTO, TOTAL_COL_ORC],
    [ABAS.COMPROVANTES, TOTAL_COL_COMP],
  ].filter(function (esp) { return !!origem.getSheetByName(esp[0]); });

  // Primeiro valida o backup inteiro; só depois começa a escrever na base atual.
  especificacoes.forEach(function (esp) {
    if (!origem.getSheetByName(esp[0])) {
      throw new Error('O backup não possui a aba obrigatória "' + esp[0] + '".');
    }
  });
  const paramFonte = origem.getSheetByName(ABAS.PARAMETROS);
  if (!paramFonte) throw new Error('O backup não possui a aba Parâmetros.');

  const emergencia = criarBackupSistema_('emergência antes de restauração');

  especificacoes.concat(opcionais).forEach(function (esp) {
    const nome = esp[0];
    const fonte = origem.getSheetByName(nome);
    // Backup de versão antiga pode ser mais estreito que o schema atual.
    const colunas = Math.min(esp[1], fonte.getMaxColumns());
    const linhas = Math.max(fonte.getLastRow(), 1);
    const valores = fonte.getRange(1, 1, linhas, colunas).getValues();
    const destino = atual.getSheetByName(nome) || atual.insertSheet(nome);
    limparEGravarValoresRestauracao_(destino, valores, colunas);
    if (nome === ABAS.LANCAMENTOS) {
      // K é fórmula reconstruída e L é ID persistente. Limpamos ambos para não deixar
      // resíduos de linhas que existiam no estado atual, mas não existem no backup.
      garantirColunas_(destino, TOTAL_COL_LANC);
      const limparTecnicas = Math.max(destino.getLastRow(), linhas, 2);
      destino.getRange(1, COL_LANC.PERIODO, limparTecnicas, 2).clearContent();
      // IDs ficam em L e são dados de auditoria, não fórmula. Preserva quando o backup já os possui.
      if (fonte.getMaxColumns() >= COL_LANC.ID && linhas >= 1) {
        const ids = fonte.getRange(1, COL_LANC.ID, linhas, 1).getValues();
        destino.getRange(1, COL_LANC.ID, linhas, 1).setValues(ids).setNumberFormat('@');
      }
    }
    if (nome === ABAS.CARGA_BOMBA) {
      // R$/Litro é fórmula matricial em F1: valor copiado em F2:F a derrubaria (#REF!).
      destino.getRange(1, COL_CARGA.PRECO_LITRO, Math.max(destino.getLastRow(), 2), 1).clearContent();
    }
  });

  // Parâmetros: restaura somente a tabela de parâmetros, pois as linhas calculadas
  // são recriadas pelo instalador interno logo abaixo. Usuários NÃO são restaurados
  // pelo botão para evitar perda de acesso; a cópia integral continua guardada no Drive.
  const quantidadeParametros = PARAMETROS_PADRAO.length;
  const valoresParametros = paramFonte.getRange(LINHA_PARAM_INICIAL, 1, quantidadeParametros, 3).getValues();
  const paramDestino = atual.getSheetByName(ABAS.PARAMETROS) || atual.insertSheet(ABAS.PARAMETROS);
  paramDestino.getRange(LINHA_PARAM_INICIAL, 1, quantidadeParametros, 3).setValues(valoresParametros);

  // Reconstrói tudo que é derivado, sem depender das fórmulas salvas no backup.
  PARAM_EXEC_CACHE_ = null;
  VEICULOS_EXEC_CACHE_ = null;
  CENTROS_EXEC_CACHE_ = null;
  invalidarCacheRateioMensal_();
  invalidarCacheOrcamento_();
  garantirCapacidadeLancamentos_(quantidadeLancamentosReais_() + 1);
  montarAbasDeDados_();
  montarLog_();
  montarUsuarios_();
  reconstruirRelatorios_();
  escreverConferencia_(coletarProblemas_());
  montarCentralOperacional_();
  protegerAbasCalculadas_();
  organizarAbas_();
  SpreadsheetApp.flush();
  invalidarCacheInicio_();

  registrarLog_('Restaurar backup', encontrado.getName() + ' • emergência: ' + emergencia.nome);
  return {
    ok: true,
    mensagem: 'Base operacional restaurada a partir de ' + encontrado.getName() +
      '. Um backup de emergência do estado anterior foi criado automaticamente.',
    emergencia: emergencia,
    saude: diagnosticoSaudeSistema_()
  };
}


/** Restauração explícita é transacional; importação usa a variante semLock porque já possui lock. */
function restaurarDadosDeBackup_(backupId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, mensagem: 'Outra operação crítica está em andamento. Aguarde alguns segundos e tente novamente.' };
  }
  try {
    return restaurarDadosDeBackupSemLock_(backupId);
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------ APIs Web V4

function webSaudeSistema(token, forcar) {
  exigirPerfilToken_(token, 'ADMIN');
  return diagnosticoSaudeRapida_(forcar === true);
}

function webAuditoriaProfunda(token) {
  exigirPerfilToken_(token, 'ADMIN');
  return diagnosticoAuditoriaProfunda_();
}

function webListarBackupsSistema(token, limite) {
  exigirPerfilToken_(token, 'ADMIN');
  return listarBackupsSistema_(Math.min(Number(limite || 8), 20));
}

function webCriarBackupSistema(token) {
  autorizarContextoWeb_(token, 'ADMIN');
  const backup = criarBackupSistema_('manual via Web App');
  return { ok: true, backup: backup, backups: listarBackupsSistema_(8) };
}

function webAtivarBackupAutomatico(token) {
  autorizarContextoWeb_(token, 'ADMIN');
  const a = garantirAutomacoesSistema_();
  return {
    ok: true,
    mensagem: 'Automações verificadas: backup diário ' + (a.backupAtivo ? 'ATIVO' : 'INATIVO') +
      ' • auditoria de edição ' + (a.auditoriaAtiva ? 'ATIVA' : 'INATIVA') +
      ' • consolidação de logins ' + (a.loginsAtivo ? 'ATIVA' : 'INATIVA') +
      ' • aquecimento de cache ' + (a.aquecimentoAtivo ? 'ATIVO' : 'INATIVO') +
      ' • alerta diário ' + (a.alertaAtivo ? 'ATIVO às ' + a.alertaHora + 'h' : 'INATIVO') +
      (a.alertaAtivo && !destinatariosAlerta_().length
        ? ' (sem destinatário: preencha EMAIL_ALERTAS)' : '') + '.'
  };
}

function webRepararSistema(token) {
  autorizarContextoWeb_(token, 'ADMIN');
  return repararSistemaSeguro_();
}

function webRestaurarBackup(token, backupId, confirmacao) {
  autorizarContextoWeb_(token, 'ADMIN');
  if (String(confirmacao || '').trim().toUpperCase() !== 'RESTAURAR') {
    return { ok: false, mensagem: 'Confirmação inválida. Digite RESTAURAR para prosseguir.' };
  }
  return restaurarDadosDeBackup_(backupId);
}


// ==========================================================================
// 16_Exclusoes.gs — V4.8: excluir despesa, excluir veículo e zerar o sistema
// ==========================================================================

/**
 * Regras comuns às três operações:
 *   - nada some sem rastro: despesa excluída vai inteira para a aba
 *     "Lançamentos Excluídos" com data, autor e justificativa, e tudo entra no Log;
 *   - período fechado é intocável (tem lacre SHA-256 no Histórico): para corrigir uma
 *     despesa de mês fechado é preciso reabrir o mês antes;
 *   - "zerar" sempre cria um backup validado ANTES de apagar. Sem backup, não apaga.
 */

const MIN_JUSTIFICATIVA_ = 10;
const CONFIRMACAO_ZERAR_ = 'APAGAR TUDO';

function cabecalhoExcluidos_() {
  return ['Excluído em', 'Excluído por', 'Justificativa'].concat(CABECALHOS[ABAS.LANCAMENTOS]);
}

function garantirAbaExcluidos_() {
  const planilha = ss_();
  let sheet = planilha.getSheetByName(ABAS.EXCLUIDOS);
  const cabecalho = cabecalhoExcluidos_();
  if (!sheet) {
    sheet = planilha.insertSheet(ABAS.EXCLUIDOS);
    sheet.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    estilizarCabecalho_(sheet.getRange(1, 1, 1, cabecalho.length));
    sheet.setFrozenRows(1);
    sheet.setTabColor('#9B9694');
    [150, 190, 320].forEach(function (l, i) { sheet.setColumnWidth(i + 1, l); });
    try { protegerFolhaPerfil_(sheet, ABAS.EXCLUIDOS, emailsUsuariosAtivosPorPerfil_(['ADMIN']), []); }
    catch (e) { console.error('proteção Excluídos: ' + e.message); }
  }
  garantirColunas_(sheet, cabecalho.length);
  return sheet;
}

/** Localiza um lançamento pelo ID. Devolve { linha, valores } ou null. */
function localizarLancamentoPorId_(id) {
  const alvo = String(id || '').trim().toUpperCase();
  if (!alvo) return null;
  const sheet = aba_(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  if (n < 1) return null;
  const ids = sheet.getRange(2, COL_LANC.ID, n, 1).getDisplayValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0] || '').trim().toUpperCase() === alvo) {
      const linha = i + 2;
      return { linha: linha, valores: sheet.getRange(linha, 1, 1, TOTAL_COL_LANC).getValues()[0] };
    }
  }
  return null;
}

/**
 * Remove uma linha de Lançamentos SEM deleteRow: sobe as linhas de baixo uma casa e
 * limpa a última. deleteRow encolheria as faixas das fórmulas (A2:A20000 viraria
 * A2:A19999) e, a cada exclusão, a capacidade ficaria uma linha menor. A coluna J
 * (Período) não é tocada porque é fórmula matricial.
 */
function removerLinhaLancamento_(sheet, linha) {
  const ultima = ultimaLinhaLancamentoReal_();
  const blocos = [[1, COL_LANC.PERIODO - 1], [COL_LANC.PERIODO + 1, TOTAL_COL_LANC - COL_LANC.PERIODO]];
  blocos.forEach(function (b) {
    const colIni = b[0], largura = b[1];
    if (largura < 1) return;
    if (linha < ultima) {
      const abaixo = sheet.getRange(linha + 1, colIni, ultima - linha, largura);
      sheet.getRange(linha, colIni, ultima - linha, largura).setValues(abaixo.getValues());
    }
    sheet.getRange(ultima, colIni, 1, largura).clearContent();
  });
}

/** Datas iguais no calendário (ignora hora). */
function mesmoDia_(a, b) {
  return a instanceof Date && b instanceof Date &&
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Exclui UMA despesa, com justificativa obrigatória. Uso interno: quem chama já
 * validou o perfil (OPERADOR ou ADMIN).
 */
function excluirLancamento_(id, justificativa, opcoes) {
  const motivo = String(justificativa || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  if (motivo.length < MIN_JUSTIFICATIVA_) {
    return { ok: false, mensagem: 'Escreva uma justificativa com pelo menos ' + MIN_JUSTIFICATIVA_ +
      ' caracteres (ex.: "valor digitado errado, NF 123 é de R$ 150,00").' };
  }
  const semLock = opcoes && opcoes.semLock === true;
  const lock = LockService.getScriptLock();
  if (!semLock && !lock.tryLock(15000)) {
    return { ok: false, mensagem: 'Outra operação está em andamento. Tente novamente em alguns segundos.' };
  }
  try {
    let achado = String(id || '').trim() ? localizarLancamentoPorId_(id) : null;
    // V4.8: linha sem ID (gravação interrompida) é localizada pela linha + placa + data.
    if (!achado && opcoes && opcoes.ref && opcoes.ref.linha) {
      const r = opcoes.ref;
      const sh = aba_(ABAS.LANCAMENTOS);
      const nl = Number(r.linha);
      if (Number.isInteger(nl) && nl >= 2 && nl <= ultimaLinhaLancamentoReal_()) {
        const v0 = sh.getRange(nl, 1, 1, TOTAL_COL_LANC).getValues()[0];
        if (normalizaPlaca_(v0[L_.PLACA]) === normalizaPlaca_(r.placa) &&
            formatarData_(v0[L_.DATA]) === String(r.data || '') && !String(v0[L_.ID] || '').trim()) {
          achado = { linha: nl, valores: v0 };
        }
      }
    }
    if (!achado) return { ok: false, mensagem: 'Lançamento não encontrado' + (id ? ': ' + id : '') + '. Atualize a tela e tente de novo.' };
    const v = achado.valores;
    const data = v[L_.DATA];
    const periodo = periodoAtual_();
    if (data instanceof Date && data < periodo.inicio) {
      return { ok: false, mensagem: 'Este lançamento é de ' + formatarData_(data) +
        ', de um período já fechado (' + mesCompetenciaDaData_(data) + '). Períodos fechados têm lacre de ' +
        'integridade: reabra o mês (Fechamento → Reabrir mês anterior) antes de corrigir.' };
    }

    const sheet = aba_(ABAS.LANCAMENTOS);
    const excluidos = garantirAbaExcluidos_();
    const quem = emailContextoAtual_();
    const registro = v.slice();
    registro[L_.PERIODO] = mesCompetenciaDaData_(data);
    excluidos.getRange(excluidos.getLastRow() + 1, 1, 1, 3 + registro.length)
      .setValues([[new Date(), quem, motivo].concat(registro)]);
    excluidos.getRange(excluidos.getLastRow(), 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    excluidos.getRange(excluidos.getLastRow(), 4).setNumberFormat('dd/mm/yyyy');

    // Leitura de KM que acompanhou o abastecimento: só é removida quando não há
    // dúvida de qual é (um único abastecimento e uma única leitura nesse dia/placa).
    let avisoKm = '';
    let odometroRemovido = null;
    const tipo = String(v[L_.TIPO] || '');
    const placaAlvo = normalizaPlaca_(v[L_.PLACA]);
    if (TIPOS_COMBUSTIVEL.indexOf(tipo) !== -1 && data instanceof Date) {
      const outrosAbast = lerLancamentos_().filter(function (l) {
        return String(l[L_.ID]) !== String(v[L_.ID]) && normalizaPlaca_(l[L_.PLACA]) === placaAlvo &&
          TIPOS_COMBUSTIVEL.indexOf(String(l[L_.TIPO])) !== -1 && mesmoDia_(l[L_.DATA], data);
      }).length;
      const odo = aba_(ABAS.ODOMETRO);
      const leituras = [];
      if (odo.getLastRow() >= 2) {
        lerOdometro_().forEach(function (o, i) {
          if (normalizaPlaca_(o[1]) === placaAlvo && mesmoDia_(o[0], data)) leituras.push({ linha: i + 2, km: o[2] });
        });
      }
      if (outrosAbast === 0 && leituras.length === 1) {
        odometroRemovido = { data: data, placa: v[L_.PLACA], km: leituras[0].km };
        odo.deleteRow(leituras[0].linha);
        // Critico aqui: logo abaixo o tanque e revalorizado e o Resumo recalculado,
        // e os dois leem o odometro. Com o cache de antes da exclusao, o KM
        // removido continuaria contando.
        invalidarCacheOdometro_();
        avisoKm = ' A leitura de KM ' + leituras[0].km + ' desse dia também foi removida.';
      } else if (leituras.length) {
        avisoKm = ' Há ' + leituras.length + ' leitura(s) de KM nesse dia para a placa; confira a aba ' +
          ABAS.ODOMETRO + ' se alguma era deste abastecimento.';
      }
    }

    removerLinhaLancamento_(sheet, achado.linha);
    SpreadsheetApp.flush();

    // V4.8: abastecimento do tanque interno excluído = os litros VOLTAM ao estoque (o
    // saldo é calculado das cargas menos as saídas). Os abastecimentos internos feitos
    // depois dele são revalorizados, porque o custo médio do tanque muda.
    let avisoEstoque = '';
    const produtoTanque = produtoDoTipo_(tipo);
    const litrosExcluidos = Number(v[L_.LITROS]) || 0;
    if (produtoTanque && litrosExcluidos > 0 &&
        tipoAbastecimentoDe_(tipo, v[L_.TIPO_ABASTECIMENTO]) === ABASTECIMENTO_INTERNO) {
      invalidarCacheLancamentos_();
      const rec = (opcoes && opcoes.semRecalculoTanque === true) ? { alterados: 0 }
        : recalcularAbastecimentosInternos_(produtoTanque, data instanceof Date ? data : null);
      invalidarCacheLancamentos_();
      const tanque = estadoTanque_(produtoTanque, null);
      avisoEstoque = ' ' + litrosExcluidos.toFixed(3).replace('.', ',') + ' L voltaram ao estoque de ' + produtoTanque +
        ' (saldo agora ' + tanque.litros.toFixed(3).replace('.', ',') + ' L).' +
        (rec.alterados ? ' ' + rec.alterados + ' abastecimento(s) interno(s) posteriores revalorizado(s).' : '');
    }
    registrarLog_('Excluir lançamento', (String(v[L_.ID] || '') || 'linha ' + achado.linha + ' sem ID') + ' • ' + v[L_.PLACA] + ' • ' + tipo + ' • R$ ' +
      (Number(v[L_.VALOR]) || 0).toFixed(2) + ' • motivo: ' + motivo);
    invalidarCacheInicio_();
    if (!(opcoes && opcoes.semResumo === true)) atualizarResumoSeguro_();
    return {
      ok: true,
      mensagem: 'Lançamento ' + (v[L_.ID] || 'sem ID') + ' (' + v[L_.PLACA] + ' • ' + (tipo || 'sem tipo') + ' • R$ ' +
        (Number(v[L_.VALOR]) || 0).toFixed(2).replace('.', ',') + ') excluído. ' +
        'Uma cópia ficou na aba "' + ABAS.EXCLUIDOS + '".' + avisoKm + avisoEstoque,
      valores: v, odometroRemovido: odometroRemovido,
    };
  } finally {
    if (!semLock) lock.releaseLock();
  }
}

/**
 * V4.8: CORRIGIR um lançamento. Feito como "exclui o original (com a justificativa, na
 * trilha de auditoria) + grava o corrigido", reaproveitando TODAS as validações da
 * gravação normal (período, KM, NF, tanque, natureza de oficina...). Se o corrigido for
 * recusado, o original é restaurado exatamente como estava.
 */
function corrigirLancamento_(id, ref, dados, justificativa) {
  const motivo = String(justificativa || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  if (motivo.length < MIN_JUSTIFICATIVA_) {
    return { ok: false, mensagem: 'Escreva o motivo da correção com pelo menos ' + MIN_JUSTIFICATIVA_ + ' caracteres.' };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, mensagem: 'Outra operação está em andamento. Tente novamente.' };
  try {
    const r1 = excluirLancamento_(id, 'Correção: ' + motivo,
      { semLock: true, semResumo: true, semRecalculoTanque: true, ref: ref });
    if (!r1.ok) return r1;
    const original = r1.valores;
    const novo = {};
    Object.keys(dados || {}).forEach(function (k) { novo[k] = dados[k]; });
    // O original já saiu; o mesmo documento não é duplicidade.
    novo.permitirDuplicado = true;
    if (!String(novo.observacao || '').trim()) novo.observacao = String(original[L_.OBSERVACAO] || '');
    invalidarCacheLancamentos_();
    const r2 = salvarLancamento_(novo, { semLock: true });
    if (!r2.ok) {
      // Desfaz: o original volta exatamente como estava (mesmo ID).
      const sheet = aba_(ABAS.LANCAMENTOS);
      const linha = proximaLinhaLancamento_();
      sheet.getRange(linha, 1, 1, COL_LANC.PERIODO - 1).setValues([original.slice(0, COL_LANC.PERIODO - 1)]);
      sheet.getRange(linha, COL_LANC.ID, 1, TOTAL_COL_LANC - COL_LANC.ID + 1)
        .setValues([original.slice(COL_LANC.ID - 1, TOTAL_COL_LANC)]);
      if (r1.odometroRemovido) {
        const odo = aba_(ABAS.ODOMETRO);
        const lo = odo.getLastRow() + 1;
        odo.getRange(lo, 1, 1, 3).setValues([[r1.odometroRemovido.data, r1.odometroRemovido.placa, r1.odometroRemovido.km]]);
        invalidarCacheOdometro_();
      }
      const exc = ss_().getSheetByName(ABAS.EXCLUIDOS);
      if (exc && exc.getLastRow() >= 2) exc.deleteRow(exc.getLastRow());
      invalidarCacheLancamentos_();
      return { ok: false, mensagem: 'Correção não aplicada (o lançamento original foi mantido): ' + r2.mensagem };
    }
    // Estoque/custo do tanque: revaloriza a partir da data mais antiga envolvida.
    const dOrig = original[L_.DATA];
    const dNova = parseDataIsoEstrita_(novo.data);
    const desde = dOrig instanceof Date && (!dNova || dOrig < dNova) ? dOrig : dNova;
    let extraTanque = '';
    [produtoDoTipo_(original[L_.TIPO]), produtoDoTipo_(novo.tipo)]
      .filter(function (p, i, arr) { return p && arr.indexOf(p) === i; })
      .forEach(function (p) {
        invalidarCacheLancamentos_();
        const rec = recalcularAbastecimentosInternos_(p, desde);
        invalidarCacheLancamentos_();
        const t = estadoTanque_(p, null);
        extraTanque += ' Estoque de ' + p + ': ' + t.litros.toFixed(3).replace('.', ',') + ' L' +
          (rec.alterados ? ' (' + rec.alterados + ' abastecimento(s) revalorizado(s))' : '') + '.';
      });
    invalidarCacheInicio_();
    atualizarResumoSeguro_();
    registrarLog_('Corrigir lançamento', (original[L_.ID] || 'sem ID') + ' -> ' + r2.id + ' • motivo: ' + motivo);
    return { ok: true, id: r2.id,
      mensagem: 'Lançamento corrigido. Novo registro: ' + r2.id + ' (o original ' + (original[L_.ID] || 'sem ID') +
        ' ficou em "' + ABAS.EXCLUIDOS + '" com o motivo).' + extraTanque };
  } finally {
    lock.releaseLock();
  }
}

function webCorrigirLancamento(token, id, ref, dados, justificativa) {
  autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  return corrigirLancamento_(id, ref, dados, justificativa);
}

/** Leitura de KM do veículo naquele dia, quando houver exatamente uma (para pré-preencher a correção). */
function kmDoDia_(placa, data) {
  if (!(data instanceof Date)) return '';
  const alvo = normalizaPlaca_(placa);
  const doDia = lerOdometro_().filter(function (o) { return normalizaPlaca_(o[1]) === alvo && mesmoDia_(o[0], data); });
  return doDia.length === 1 ? Number(doDia[0][2]) || '' : '';
}

/** Lançamentos do período aberto (e futuros), para a tela de correção/exclusão. */
function lancamentosParaCorrecao_(filtros) {
  const f = filtros || {};
  const periodo = periodoAtual_();
  let placa = '';
  if (f.veiculo && String(f.veiculo).trim() && String(f.veiculo).trim() !== 'TODOS') {
    const rv = resolverVeiculo_(f.veiculo, false);
    if (!rv.ok) return { colunas: [], linhas: [], mensagem: rv.mensagem };
    placa = normalizaPlaca_(rv.veiculo.placa);
  }
  const termo = String(f.termo || '').trim().toUpperCase();
  const dados = lerLancamentos_().filter(function (l) {
    const d = l[L_.DATA];
    if (!(d instanceof Date) || d < periodo.inicio) return false;
    if (placa && normalizaPlaca_(l[L_.PLACA]) !== placa) return false;
    if (termo) {
      const texto = [l[L_.ID], l[L_.TIPO], l[L_.DOCUMENTO], l[L_.OBSERVACAO], l[L_.DETALHE_OFICINA],
        l[L_.FORNECEDOR]].join(' ').toUpperCase();
      if (texto.indexOf(termo) === -1) return false;
    }
    return true;
  }).sort(function (a, b) { return b[L_.DATA] - a[L_.DATA]; }).slice(0, 300);
  return {
    periodo: formatarData_(periodo.inicio) + ' a ' + formatarData_(periodo.fim),
    itens: dados.map(function (l) {
      return {
        id: String(l[L_.ID] || ''), linha: l.linhaPlanilha, data: formatarData_(l[L_.DATA]), placa: String(l[L_.PLACA] || ''),
        tipo: String(l[L_.TIPO] || '') || '⚠ incompleto (sem tipo)', litros: Number(l[L_.LITROS]) || 0, valor: Number(l[L_.VALOR]) || 0,
        documento: String(l[L_.DOCUMENTO] || ''),
        detalhe: String(l[L_.DETALHE_OFICINA] || l[L_.OBSERVACAO] || ''),
        dataIso: l[L_.DATA] instanceof Date ? Utilities.formatDate(l[L_.DATA], timezone_(), 'yyyy-MM-dd') : '',
        tipoOriginal: String(l[L_.TIPO] || ''),
        observacao: String(l[L_.OBSERVACAO] || ''),
        naturezaOficina: String(l[L_.NATUREZA_OFICINA] || ''),
        detalheOficina: String(l[L_.DETALHE_OFICINA] || ''),
        fornecedor: String(l[L_.FORNECEDOR] || ''),
        tipoAbastecimento: tipoAbastecimentoDe_(l[L_.TIPO], l[L_.TIPO_ABASTECIMENTO]),
        km: kmDoDia_(l[L_.PLACA], l[L_.DATA]),
      };
    }),
  };
}

function webLancamentosCorrecao(token, filtros) {
  exigirPerfilToken_(token, ['OPERADOR', 'ADMIN']);
  return lancamentosParaCorrecao_(filtros);
}

function webExcluirLancamento(token, id, justificativa, ref) {
  autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  return excluirLancamento_(id, justificativa, ref ? { ref: ref } : null);
}

/** Últimas exclusões (auditoria), para a tela do Web App. */
function webLancamentosExcluidos(token, limite) {
  exigirPerfilToken_(token, ['OPERADOR', 'ADMIN']);
  const sheet = ss_().getSheetByName(ABAS.EXCLUIDOS);
  if (!sheet || sheet.getLastRow() < 2) return { colunas: [], linhas: [] };
  const qtd = Math.min(Math.max(Number(limite) || 30, 1), 200);
  const ultima = sheet.getLastRow();
  const ini = Math.max(2, ultima - qtd + 1);
  const dados = sheet.getRange(ini, 1, ultima - ini + 1, 3 + TOTAL_COL_LANC).getValues().reverse();
  return {
    colunas: [col_('Excluído em'), col_('Por'), col_('Justificativa'), col_('Data'), col_('Placa'),
      col_('Tipo'), col_('Valor', 'moeda'), col_('ID')],
    linhas: dados.map(function (l) {
      const b = 3;
      return [l[0] instanceof Date ? Utilities.formatDate(l[0], timezone_(), 'dd/MM/yyyy HH:mm') : String(l[0]),
        l[1], l[2], formatarData_(l[b + L_.DATA]), l[b + L_.PLACA], l[b + L_.TIPO],
        Number(l[b + L_.VALOR]) || 0, l[b + L_.ID]];
    }),
  };
}

/** Menu da planilha: pede ID e justificativa. */
function excluirLancamentoPlanilha() {
  exigirExecucaoOperacional_();
  const ui = SpreadsheetApp.getUi();
  const rId = ui.prompt('Excluir lançamento',
    'Informe o ID do lançamento (coluna "ID Lançamento", ex.: LAN-20260924-ABC123DEF0).\n' +
    'Use "Lançamentos → Mostrar/ocultar colunas técnicas" para ver os IDs.', ui.ButtonSet.OK_CANCEL);
  if (rId.getSelectedButton() !== ui.Button.OK) return;
  const id = rId.getResponseText().trim();
  const achado = localizarLancamentoPorId_(id);
  if (!achado) { alerta_('Excluir lançamento', 'Lançamento não encontrado: ' + id); return; }
  const v = achado.valores;
  const rMotivo = ui.prompt('Justificativa obrigatória',
    'Lançamento: ' + formatarData_(v[L_.DATA]) + ' • ' + v[L_.PLACA] + ' • ' + v[L_.TIPO] + ' • R$ ' +
    (Number(v[L_.VALOR]) || 0).toFixed(2) + '\n\nPor que esta despesa está sendo excluída?', ui.ButtonSet.OK_CANCEL);
  if (rMotivo.getSelectedButton() !== ui.Button.OK) return;
  const r = excluirLancamento_(id, rMotivo.getResponseText());
  alerta_(r.ok ? 'Lançamento excluído' : 'Exclusão não realizada', r.mensagem);
}

// ------------------------------------------------------------ excluir veículo

/**
 * Exclui um veículo do cadastro.
 *   - sem lançamentos/leituras: sai direto;
 *   - com lançamentos SÓ no período aberto: exige apagarLancamentos=true, e cada um
 *     vai para "Lançamentos Excluídos" com a mesma justificativa;
 *   - com lançamentos em período fechado: recusa (o histórico lacrado depende dele).
 *     Nesse caso o caminho é INATIVAR, que tira o veículo da operação sem apagar nada.
 */
function excluirVeiculo_(placaOuPatrimonio, justificativa, apagarLancamentos) {
  const motivo = String(justificativa || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  if (motivo.length < MIN_JUSTIFICATIVA_) {
    return { ok: false, mensagem: 'Escreva uma justificativa com pelo menos ' + MIN_JUSTIFICATIVA_ + ' caracteres.' };
  }
  const rv = resolverVeiculo_(placaOuPatrimonio, false);
  if (!rv.ok) return { ok: false, mensagem: rv.mensagem };
  const placa = rv.veiculo.placa;
  const alvo = normalizaPlaca_(placa);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, mensagem: 'Outra operação está em andamento. Tente novamente.' };
  try {
    const periodo = periodoAtual_();
    const doVeiculo = lerLancamentos_().filter(function (l) { return normalizaPlaca_(l[L_.PLACA]) === alvo; });
    const fechados = doVeiculo.filter(function (l) {
      return !(l[L_.DATA] instanceof Date) || l[L_.DATA] < periodo.inicio;
    });
    if (fechados.length) {
      return { ok: false, temHistorico: true, mensagem: 'O veículo ' + placa + ' tem ' + fechados.length +
        ' lançamento(s) em períodos já fechados, que fazem parte do histórico lacrado. Ele não pode ser ' +
        'excluído — use "Situação: INATIVO" no cadastro: ele sai da operação e dos formulários, mas o ' +
        'histórico continua correto.' };
    }
    // Leitura de KM de período fechado também entra no lacre do Histórico.
    const odoCheck = aba_(ABAS.ODOMETRO);
    const leiturasFechadas = odoCheck.getLastRow() < 2 ? 0 : odoCheck.getRange(2, 1, odoCheck.getLastRow() - 1, 2)
      .getValues().filter(function (o) {
        return normalizaPlaca_(o[1]) === alvo && o[0] instanceof Date && o[0] < periodo.inicio;
      }).length;
    if (leiturasFechadas) {
      return { ok: false, temHistorico: true, mensagem: 'O veículo ' + placa + ' tem ' + leiturasFechadas +
        ' leitura(s) de KM em períodos fechados. Para preservar o histórico, use "Situação: INATIVO" em vez de excluir.' };
    }
    if (doVeiculo.length && apagarLancamentos !== true) {
      return { ok: false, precisaConfirmarLancamentos: true, quantidade: doVeiculo.length,
        mensagem: 'O veículo ' + placa + ' tem ' + doVeiculo.length + ' lançamento(s) no período aberto. ' +
          'Para excluí-lo, confirme que esses lançamentos também devem ser excluídos (ficam registrados em "' +
          ABAS.EXCLUIDOS + '").' };
    }
    doVeiculo.forEach(function (l) {
      const r = excluirLancamento_(l[L_.ID], 'Exclusão do veículo ' + placa + ': ' + motivo,
        { semLock: true, semResumo: true });
      if (!r.ok) throw new Error('Falha ao excluir o lançamento ' + l[L_.ID] + ': ' + r.mensagem);
      invalidarCacheLancamentos_();
    });

    // Leituras de odômetro do veículo (sem lançamento fechado, não há histórico a preservar).
    const odo = aba_(ABAS.ODOMETRO);
    let leituras = 0;
    if (odo.getLastRow() >= 2) {
      const vals = odo.getRange(2, 2, odo.getLastRow() - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) {
        if (normalizaPlaca_(vals[i][0]) === alvo) { odo.deleteRow(i + 2); leituras++; }
      }
      if (leituras) invalidarCacheOdometro_();
    }

    const sheet = aba_(ABAS.VEICULOS);
    const placas = sheet.getRange(2, COL_VEIC.PLACA, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
    let removidos = 0;
    for (let i = placas.length - 1; i >= 0; i--) {
      if (normalizaPlaca_(placas[i][0]) === alvo) { sheet.deleteRow(i + 2); removidos++; }
    }
    if (!removidos) return { ok: false, mensagem: 'Veículo não encontrado na aba ' + ABAS.VEICULOS + '.' };
    garantirLinhas_(sheet, LIMITE_VEICULOS);

    VEICULOS_EXEC_CACHE_ = null;
    invalidarCacheInicio_();
    registrarLog_('Excluir veículo', placa + ' • ' + doVeiculo.length + ' lançamento(s) e ' + leituras +
      ' leitura(s) removidos • motivo: ' + motivo);
    atualizarResumoSeguro_();
    return { ok: true, mensagem: 'Veículo ' + placa + ' excluído.' +
      (doVeiculo.length ? ' ' + doVeiculo.length + ' lançamento(s) movido(s) para "' + ABAS.EXCLUIDOS + '".' : '') +
      (leituras ? ' ' + leituras + ' leitura(s) de KM removida(s).' : '') };
  } finally {
    lock.releaseLock();
  }
}

function webExcluirVeiculo(token, placa, justificativa, apagarLancamentos) {
  autorizarContextoWeb_(token, 'ADMIN');
  return excluirVeiculo_(placa, justificativa, apagarLancamentos === true);
}

function excluirVeiculoPlanilha() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();
  const rPlaca = ui.prompt('Excluir veículo', 'Placa/ID ou Código Patrimônio do veículo:', ui.ButtonSet.OK_CANCEL);
  if (rPlaca.getSelectedButton() !== ui.Button.OK) return;
  const rMotivo = ui.prompt('Justificativa obrigatória', 'Por que o veículo está sendo excluído?', ui.ButtonSet.OK_CANCEL);
  if (rMotivo.getSelectedButton() !== ui.Button.OK) return;
  let r = excluirVeiculo_(rPlaca.getResponseText(), rMotivo.getResponseText(), false);
  if (!r.ok && r.precisaConfirmarLancamentos) {
    const c = ui.alert('Excluir também os lançamentos?', r.mensagem + '\n\nSIM = excluir o veículo e esses lançamentos.',
      ui.ButtonSet.YES_NO);
    if (c !== ui.Button.YES) return;
    r = excluirVeiculo_(rPlaca.getResponseText(), rMotivo.getResponseText(), true);
  }
  alerta_(r.ok ? 'Veículo excluído' : 'Exclusão não realizada', r.mensagem);
}

// ------------------------------------------------------------ zerar o sistema

/**
 * Apaga as informações da planilha para recomeçar do zero.
 *   escopo 'movimento': lançamentos, odômetro, cargas da bomba, histórico, abas
 *                       "Fechado ...", pendências e lançamentos excluídos.
 *   escopo 'tudo'     : o anterior + veículos, centros de custo e fornecedores.
 * Nunca apaga: Usuários (senão ninguém entra), Parâmetros e o Log de Atividade (que
 * registra quem zerou). Um backup validado é criado antes; se falhar, nada é apagado.
 */
function zerarSistema_(escopo, confirmacao, opcoes) {
  if (String(confirmacao || '').trim().toUpperCase() !== CONFIRMACAO_ZERAR_) {
    return { ok: false, mensagem: 'Confirmação não confere. Digite exatamente: ' + CONFIRMACAO_ZERAR_ };
  }
  const tudo = escopo === 'tudo';
  // 'valores': apaga o movimento e zera os valores do cadastro dos veículos, mantendo
  // os veículos (placa, descrição, categoria, centro, patrimônio e situação).
  const zerarValores = escopo === 'valores';
  const limparLog = !!(opcoes && opcoes.limparLog === true);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, mensagem: 'Outra operação crítica está em andamento. Tente novamente.' };
  let backup;
  try {
    try { backup = criarBackupSistema_('antes de zerar o sistema (' + (tudo ? 'tudo' : 'movimento') + ')'); }
    catch (e) {
      // A cópia é criada ANTES da conferência. Se só a conferência falhou (atraso do
      // Drive em disponibilizar a cópia), o backup existe e pode seguir.
      const preservada = /Cópia preservada: (.+?)\.?$/.exec(String(e.message || ''));
      if (!preservada) return { ok: false, mensagem: 'Nada foi apagado: não foi possível criar o backup obrigatório. ' + e.message };
      backup = { nome: preservada[1] + ' (conferência automática pendente)' };
    }

    const planilha = ss_();
    function limparLinhas(nome, colunas) {
      const sheet = planilha.getSheetByName(nome);
      if (!sheet || sheet.getMaxRows() < 2) return;
      colunas.forEach(function (c) {
        sheet.getRange(2, c[0], sheet.getMaxRows() - 1, c[1]).clearContent();
      });
    }
    // Lançamentos: tudo menos a coluna J (fórmula matricial do Período).
    limparLinhas(ABAS.LANCAMENTOS, [[1, COL_LANC.PERIODO - 1],
      [COL_LANC.PERIODO + 1, TOTAL_COL_LANC - COL_LANC.PERIODO]]);
    limparLinhas(ABAS.ODOMETRO, [[1, 3]]);
    // Carga na bomba: tudo menos a coluna F (R$/Litro, fórmula).
    limparLinhas(ABAS.CARGA_BOMBA, [[1, COL_CARGA.PRECO_LITRO - 1],
      [COL_CARGA.PRECO_LITRO + 1, Math.max(totalColunas_(COL_CARGA) - COL_CARGA.PRECO_LITRO, 1)]]);
    limparLinhas(ABAS.HISTORICO, [[1, 6]]);
    // Comprovante atrasado é MOVIMENTO, não cadastro: sai junto com os lançamentos
    // em qualquer escopo. Mantê-lo faria o relatório apontar para linhas apagadas.
    limparLinhas(ABAS.COMPROVANTES, [[1, TOTAL_COL_COMP]]);
    limparLinhas(ABAS.EXCLUIDOS, [[1, 3 + TOTAL_COL_LANC]]);
    if (zerarValores) {
      const veic = planilha.getSheetByName(ABAS.VEICULOS);
      const qtdVeic = veic ? veic.getLastRow() - 1 : 0;
      if (qtdVeic > 0) {
        const colunasValor = [COL_VEIC.DEPRECIACAO, COL_VEIC.EMPLACAMENTO, COL_VEIC.SEGURO, COL_VEIC.BONUS,
          COL_VEIC.PRECO_COMBUSTIVEL, COL_VEIC.IPVA];
        const placasVeic = veic.getRange(2, COL_VEIC.PLACA, qtdVeic, 1).getValues();
        colunasValor.forEach(function (c) {
          veic.getRange(2, c, qtdVeic, 1).setValues(placasVeic.map(function (l) {
            return [String(l[0] || '').trim() ? 0 : ''];
          }));
        });
      }
    }
    if (tudo) {
      limparLinhas(ABAS.VEICULOS, [[1, TOTAL_COL_VEIC]]);
      limparLinhas(ABAS.CENTROS, [[1, 3]]);
      limparLinhas(ABAS.FORNECEDORES, [[1, totalColunas_(COL_FORN)]]);
      // Rateio e orçamento acompanham os centros: são configuração, não movimento.
      // No escopo "só movimento" eles ficam, como fica o próprio cadastro de centros.
      limparLinhas(ABAS.RATEIO_MENSAL, [[1, TOTAL_COL_RM]]);
      limparLinhas(ABAS.ORCAMENTO, [[1, TOTAL_COL_ORC]]);
    }
    let fechadas = 0;
    planilha.getSheets().forEach(function (sheet) {
      const nome = sheet.getName();
      if (/^Fechado\s+/i.test(nome) || (limparLog && /^Log Arquivo\s+/i.test(nome)) ||
          /^Fórmulas com Erro$/i.test(nome)) {
        planilha.deleteSheet(sheet); fechadas++;
      }
    });
    if (limparLog) limparLinhas(ABAS.LOG, [[1, 4]]);
    SpreadsheetApp.flush();

    // Recomeça no período que contém hoje.
    const contexto = CONTEXTO_SISTEMA_INTERNO_;
    CONTEXTO_SISTEMA_INTERNO_ = true;
    try {
      limparPeriodoLivre_();
      gravarParam_('MES_REFERENCIA', mesReferenciaSugeridoHoje_());
      VEICULOS_EXEC_CACHE_ = null; CENTROS_EXEC_CACHE_ = null; PARAM_EXEC_CACHE_ = null;
      invalidarCacheFornecedores_(); invalidarCacheLancamentos_();
      invalidarCacheRateioMensal_(); invalidarCacheOrcamento_();
      try { PropertiesService.getScriptProperties().deleteProperty(PROP_ALERTA_INTEGRIDADE_HISTORICO_); } catch (e) {}
      if (tudo) migrarCentroAcParaAdmCentral_(); // recria o centro ADM Central
      reconstruirRelatorios_();
      escreverConferencia_(coletarProblemas_());
      montarCentralOperacional_();
    } finally {
      CONTEXTO_SISTEMA_INTERNO_ = contexto;
    }
    invalidarCacheInicio_();
    const rotuloEscopo = tudo ? 'tudo (inclui cadastros)'
      : (zerarValores ? 'movimento + valores do cadastro (veículos mantidos)' : 'somente movimento');
    registrarLog_('ZERAR SISTEMA', rotuloEscopo +
      (limparLog ? ' + log' : '') + ' • ' + fechadas + ' aba(s) removida(s) • backup ' + backup.nome);

    // Conferência do resultado: diz exatamente o que ficou, em vez de só "zerado".
    const restam = {
      lancamentos: quantidadeLancamentosReais_(),
      odometro: Math.max((planilha.getSheetByName(ABAS.ODOMETRO) || { getLastRow: function () { return 1; } }).getLastRow() - 1, 0),
      veiculos: Math.max(aba_(ABAS.VEICULOS).getLastRow() - 1, 0),
    };
    const avisoCadastro = escopo === 'movimento' && restam.veiculos > 0
      ? ' Os ' + restam.veiculos + ' veículos foram mantidos; por isso o Resumo ainda mostra seguro, emplacamento e ' +
        'IPVA mensais do cadastro. Para zerar isso também, use a opção TUDO.'
      : '';
    return {
      ok: restam.lancamentos === 0, backup: backup, restam: restam,
      mensagem: (restam.lancamentos === 0 ? 'Sistema zerado (' : 'ATENÇÃO: ainda restaram ' + restam.lancamentos +
        ' lançamento(s) (') + rotuloEscopo + '). ' +
        'Lançamentos: ' + restam.lancamentos + ' • leituras de KM: ' + restam.odometro + ' • veículos: ' + restam.veiculos + '. ' +
        'Competência aberta: ' + nomeDoMes_(mesReferenciaSugeridoHoje_()) + '.' + avisoCadastro +
        ' Backup criado antes: ' + backup.nome + ' (restaurável em Saúde do sistema).',
    };
  } finally {
    lock.releaseLock();
  }
}

function webZerarSistema(token, escopo, confirmacao, limparLog) {
  autorizarContextoWeb_(token, 'ADMIN');
  return zerarSistema_(escopoZerar_(escopo), confirmacao, { limparLog: limparLog === true });
}

function escopoZerar_(escopo) {
  return ['tudo', 'movimento', 'valores'].indexOf(escopo) !== -1 ? escopo : 'valores';
}

/** Menu da planilha. */
function zerarSistemaPlanilha() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();
  const escolha = ui.prompt('Zerar o sistema',
    'Esta ação APAGA as informações da planilha para recomeçar. Um backup é criado antes.\n\n' +
    '1 = ZERAR VALORES e manter os veículos (apaga lançamentos, KM, bomba, histórico e fechamentos; ' +
    'zera depreciação, emplacamento, seguro, IPVA, bônus e preço do cadastro)\n' +
    '2 = apagar só o movimento (mantém os valores do cadastro)\n' +
    '3 = apagar TUDO, inclusive veículos, centros e fornecedores\n\nDigite 1, 2 ou 3:',
    ui.ButtonSet.OK_CANCEL);
  if (escolha.getSelectedButton() !== ui.Button.OK) return;
  const opcao = escolha.getResponseText().trim();
  const escopo = { '1': 'valores', '2': 'movimento', '3': 'tudo' }[opcao];
  if (!escopo) { alerta_('Zerar o sistema', 'Opção inválida. Nada foi apagado.'); return; }
  const r = ui.prompt('Confirmação', 'Para confirmar, digite exatamente: ' + CONFIRMACAO_ZERAR_, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const res = zerarSistema_(escopo, r.getResponseText());
  alerta_(res.ok ? 'Sistema zerado' : 'Nada foi apagado', res.mensagem);
}

/** Gateway da Central de Controle (HTML vinculado à planilha). */
function acaoZerarSistema(escopo, confirmacao, limparLog) {
  if (!execucaoTemPlanilhaAtiva_()) throw new Error('Esta ação só funciona com a planilha aberta: use o menu 🚚 Sistema de Frota dentro da planilha (o botão Executar do editor não abre telas).');
  exigirExecucaoMutacao_();
  const r = zerarSistema_(escopoZerar_(escopo), confirmacao, { limparLog: limparLog === true });
  return r.mensagem;
}


// ------------------------------------------------------------ alterar período (V4.8)

/** Menu da planilha: troca o período aberto (MES_REFERENCIA) para qualquer AAAA-MM. */
function alterarPeriodoPlanilha() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();
  const atual = normalizarMesReferencia_(param_('MES_REFERENCIA'));
  const r = ui.prompt('Alterar período aberto',
    'Período atual: ' + atual + ' (' + nomeDoMes_(atual) + ').\n\nNovo período no formato AAAA-MM (ex.: 2026-09):',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  let novo;
  try { novo = normalizarMesReferencia_(r.getResponseText().trim()); }
  catch (e) { alerta_('Alterar período', 'Período inválido. Use o formato AAAA-MM.'); return; }
  gravarParam_('MES_REFERENCIA', novo);
  reconstruirRelatorios_();
  montarCentralOperacional_();
  invalidarCacheInicio_();
  registrarLog_('Alterar período aberto', atual + ' -> ' + novo);
  const p = periodoAtual_();
  alerta_('Período alterado', 'Período aberto: ' + nomeDoMes_(novo) + ' (' + formatarData_(p.inicio) + ' a ' +
    formatarData_(p.fim) + ').' + (ss_().getSheetByName('Fechado ' + novo)
      ? '\n\nAtenção: este mês já tinha sido fechado.' : ''));
}


/** Menu da planilha: período com data inicial e final livres. */
function definirPeriodoLivrePlanilha() {
  exigirExecucaoMutacao_();
  const ui = SpreadsheetApp.getUi();
  const p = periodoAtual_();
  function lerData(titulo, atual) {
    const r = ui.prompt(titulo, 'Digite a data no formato dd/mm/aaaa (atual: ' + formatarData_(atual) + ').\n' +
      'Deixe em branco e clique OK para voltar ao período padrão (dia de corte).', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return null;
    const t = r.getResponseText().trim();
    if (!t) return '';
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (!m) return 'invalida';
    return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  const ini = lerData('Data inicial do período', p.inicio);
  if (ini === null) return;
  if (ini === '') { const v = voltarPeriodoPadrao_(); alerta_('Período', v.mensagem); return; }
  const fim = lerData('Data final do período', p.fim);
  if (fim === null) return;
  if (ini === 'invalida' || fim === 'invalida' || fim === '') { alerta_('Período', 'Data inválida. Use dd/mm/aaaa.'); return; }
  const r = definirPeriodoLivre_(ini, fim);
  alerta_(r.ok ? 'Período alterado' : 'Período não alterado', r.mensagem);
}


// ==========================================================================
// 17_CorrecaoBomba.gs — V4.8: corrigir/excluir carga e ajustar estoque do tanque
// ==========================================================================

/**
 * Carga lançada errada (quantidade, valor, produto, data ou NF) muda o custo médio do
 * tanque, e com ele o valor de TODO abastecimento interno feito depois dela. Por isso
 * toda correção termina com recalcularAbastecimentosInternos_(): os abastecimentos
 * internos do período ABERTO são revalorizados pelo custo médio correto. Meses
 * fechados não são tocados (têm lacre de integridade).
 */
const PREFIXO_AJUSTE_ESTOQUE_ = 'AJUSTE-ESTOQUE';

function ehAjusteEstoque_(documento) {
  return String(documento || '').trim().toUpperCase().indexOf(PREFIXO_AJUSTE_ESTOQUE_) === 0;
}

/** Relê uma carga pela linha e confere se é a mesma que a tela mostrou. */
function cargaPorLinha_(linha, original) {
  const sheet = aba_(ABAS.CARGA_BOMBA);
  const n = Number(linha);
  if (!Number.isInteger(n) || n < 2 || n > sheet.getLastRow()) return null;
  const v = sheet.getRange(n, 1, 1, totalColunas_(COL_CARGA)).getValues()[0];
  if (original) {
    const mesmoDoc = String(v[COL_CARGA.DOCUMENTO - 1] || '').trim() === String(original.documento || '').trim();
    const mesmoProd = String(v[COL_CARGA.PRODUTO - 1] || '').trim().toUpperCase() === String(original.produto || '').trim().toUpperCase();
    const d = v[COL_CARGA.DATA - 1];
    const mesmaDataCarga = d instanceof Date && Utilities.formatDate(d, timezone_(), 'yyyy-MM-dd') === String(original.data || '');
    if (!mesmoDoc || !mesmoProd || !mesmaDataCarga) return null;
  }
  return { sheet: sheet, linha: n, valores: v };
}

/**
 * Revaloriza os abastecimentos INTERNOS do período aberto de um produto, refazendo a
 * média móvel do tanque do início ao fim (mesma regra de estadoTanque_).
 */
function recalcularAbastecimentosInternos_(produto, desde) {
  const limiteData = desde instanceof Date && !isNaN(desde.getTime())
    ? new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()) : null;
  const alvo = String(produto || '').trim().toUpperCase();
  const periodo = periodoAtual_();
  const sheet = aba_(ABAS.LANCAMENTOS);
  const n = quantidadeLancamentosReais_();
  const movimentos = [];
  lerCargasBomba_().forEach(function (c) {
    if (String(c[COL_CARGA.PRODUTO - 1] || '').trim().toUpperCase() !== alvo) return;
    movimentos.push({ data: c[COL_CARGA.DATA - 1], entrada: true, ordem: 0,
      litros: Number(c[COL_CARGA.QUANTIDADE - 1]) || 0, valor: Number(c[COL_CARGA.VALOR - 1]) || 0 });
  });
  const valores = n > 0 ? sheet.getRange(2, 1, n, TOTAL_COL_LANC).getValues() : [];
  valores.forEach(function (l, i) {
    if (!String(l[L_.PLACA] || '').trim()) return;
    if (produtoDoTipo_(l[L_.TIPO]) !== alvo) return;
    if (tipoAbastecimentoDe_(l[L_.TIPO], l[L_.TIPO_ABASTECIMENTO]) !== ABASTECIMENTO_INTERNO) return;
    const data = l[L_.DATA];
    const litros = Number(l[L_.LITROS]) || 0;
    if (!(data instanceof Date) || isNaN(data.getTime()) || litros <= 0) return;
    movimentos.push({ data: data, entrada: false, ordem: i + 1, litros: litros, indice: i });
  });
  movimentos.sort(function (a, b) {
    if (a.data - b.data !== 0) return a.data - b.data;
    if (a.entrada !== b.entrada) return a.entrada ? -1 : 1;
    return a.ordem - b.ordem;
  });

  let litros = 0, valor = 0, custoMedio = 0;
  const colValor = valores.map(function (l) { return [l[L_.VALOR]]; });
  let alterados = 0, diferenca = 0;
  movimentos.forEach(function (m) {
    if (m.entrada) {
      litros += m.litros; valor += m.valor;
      if (litros > 0.0001) custoMedio = valor / litros; else { litros = 0; valor = 0; }
      return;
    }
    const d = m.data;
    // Só o que foi gravado pela bomba (origem "Interno" explícita), no período aberto e a
    // partir da data da carga corrigida. Lançamentos antigos sem origem marcada (valor
    // digitado antes do controle da bomba) nunca são alterados.
    const explicito = String(valores[m.indice][L_.TIPO_ABASTECIMENTO] || '').trim().toUpperCase() ===
      ABASTECIMENTO_INTERNO.toUpperCase();
    if (explicito && (!limiteData || d >= limiteData) && d >= periodo.inicio && d <= periodo.fim && custoMedio > 0) {
      const novo = Math.round(m.litros * custoMedio * 100) / 100;
      const antigo = Number(colValor[m.indice][0]) || 0;
      if (Math.abs(novo - antigo) >= 0.005) {
        colValor[m.indice][0] = novo;
        alterados++; diferenca += novo - antigo;
      }
    }
    if (litros <= 0) return;
    const consumidos = Math.min(m.litros, litros);
    valor -= consumidos * custoMedio;
    litros -= consumidos;
    if (litros <= 0.0001) { litros = 0; valor = 0; }
  });
  if (alterados) sheet.getRange(2, COL_LANC.VALOR, n, 1).setValues(colValor);
  return { alterados: alterados, diferenca: Math.round(diferenca * 100) / 100 };
}

function finalizarCorrecaoBomba_(produtos, acao, detalhe, desde) {
  invalidarCacheLancamentos_();
  let alterados = 0, diferenca = 0;
  produtos.filter(function (p, i) { return p && produtos.indexOf(p) === i; }).forEach(function (p) {
    const r = recalcularAbastecimentosInternos_(p, desde);
    alterados += r.alterados; diferenca += r.diferenca;
  });
  invalidarCacheInicio_();
  atualizarResumoSeguro_();
  registrarLog_(acao, detalhe + (alterados ? ' • ' + alterados + ' abastecimento(s) interno(s) revalorizado(s), dif. R$ ' +
    diferenca.toFixed(2) : ''));
  const tanques = produtos.filter(function (p, i) { return p && produtos.indexOf(p) === i; }).map(function (p) {
    const e = estadoTanque_(p, null);
    return p + ': saldo ' + e.litros.toFixed(3).replace('.', ',') + ' L a R$ ' + e.custoMedio.toFixed(4).replace('.', ',') + '/L';
  }).join(' • ');
  return (alterados
    ? ' ' + alterados + ' abastecimento(s) interno(s) do período aberto foram revalorizados (diferença total R$ ' +
      diferenca.toFixed(2).replace('.', ',') + ').'
    : ' Nenhum abastecimento interno do período aberto precisou ser revalorizado.') + ' ' + tanques + '.';
}

function validarJustificativa_(justificativa) {
  const motivo = String(justificativa || '').trim().replace(/\s+/g, ' ').slice(0, 300);
  return motivo.length >= MIN_JUSTIFICATIVA_ ? motivo : null;
}

/** Corrige uma carga já registrada. */
function webEditarCargaBomba(token, linha, original, dados, justificativa) {
  autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  const motivo = validarJustificativa_(justificativa);
  if (!motivo) return { ok: false, mensagem: 'Escreva a justificativa da correção (mínimo ' + MIN_JUSTIFICATIVA_ + ' caracteres).' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, mensagem: 'Outra operação está em andamento. Tente novamente.' };
  try {
    const c = cargaPorLinha_(linha, original);
    if (!c) return { ok: false, mensagem: 'A carga mudou ou não foi encontrada. Atualize a tela e tente de novo.' };
    const ajuste = ehAjusteEstoque_(c.valores[COL_CARGA.DOCUMENTO - 1]);
    const data = parseDataIsoEstrita_((dados && dados.data) || '');
    const produto = String((dados && dados.produto) || '').trim().toUpperCase();
    const quantidade = Number((dados && dados.quantidade) || 0);
    const valor = Number((dados && dados.valor) || 0);
    const documento = ajuste ? String(c.valores[COL_CARGA.DOCUMENTO - 1]) : String((dados && dados.documento) || '').trim().slice(0, 160);
    const erros = [];
    if (!data) erros.push('Data inválida.');
    if (PRODUTOS_BOMBA.indexOf(produto) === -1) erros.push('Produto inválido.');
    if (!isFinite(quantidade) || (ajuste ? quantidade === 0 : quantidade <= 0)) erros.push('Quantidade inválida.');
    if (!isFinite(valor) || (!ajuste && valor <= 0)) erros.push('Valor inválido.');
    if (!documento) erros.push('Informe a NF.');
    if (erros.length) return { ok: false, mensagem: erros.join(' ') };

    const antes = c.valores.slice();
    const produtoAntes = String(antes[COL_CARGA.PRODUTO - 1] || '').trim().toUpperCase();
    const obsAnterior = String(antes[COL_CARGA.OBSERVACAO - 1] || '').trim();
    const nota = 'Corrigido em ' + Utilities.formatDate(new Date(), timezone_(), 'dd/MM/yyyy') + ' por ' +
      emailContextoAtual_() + ': ' + motivo;
    c.sheet.getRange(c.linha, COL_CARGA.DATA, 1, COL_CARGA.VALOR).setValues([[data, documento, produto, quantidade, valor]]);
    c.sheet.getRange(c.linha, COL_CARGA.OBSERVACAO).setValue((obsAnterior ? obsAnterior + ' | ' : '') + nota);
    const detalhe = 'linha ' + c.linha + ' • antes: ' + formatarData_(antes[COL_CARGA.DATA - 1]) + ' ' + produtoAntes + ' ' +
      antes[COL_CARGA.QUANTIDADE - 1] + ' L R$ ' + antes[COL_CARGA.VALOR - 1] + ' NF ' + antes[COL_CARGA.DOCUMENTO - 1] +
      ' • depois: ' + formatarData_(data) + ' ' + produto + ' ' + quantidade + ' L R$ ' + valor + ' NF ' + documento +
      ' • motivo: ' + motivo;
    const dataAntes = antes[COL_CARGA.DATA - 1];
    const desde = dataAntes instanceof Date && dataAntes < data ? dataAntes : data;
    const extra = finalizarCorrecaoBomba_([produtoAntes, produto], 'Corrigir carga da bomba', detalhe, desde);
    return { ok: true, mensagem: 'Carga corrigida.' + extra };
  } finally { lock.releaseLock(); }
}

/** Exclui uma carga (a linha some; o Log guarda os dados e o motivo). */
function webExcluirCargaBomba(token, linha, original, justificativa) {
  autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  const motivo = validarJustificativa_(justificativa);
  if (!motivo) return { ok: false, mensagem: 'Escreva a justificativa da exclusão (mínimo ' + MIN_JUSTIFICATIVA_ + ' caracteres).' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, mensagem: 'Outra operação está em andamento. Tente novamente.' };
  try {
    const c = cargaPorLinha_(linha, original);
    if (!c) return { ok: false, mensagem: 'A carga mudou ou não foi encontrada. Atualize a tela e tente de novo.' };
    const v = c.valores;
    const produto = String(v[COL_CARGA.PRODUTO - 1] || '').trim().toUpperCase();
    // Sobe as linhas de baixo sem tocar na coluna F (R$/Litro é fórmula matricial).
    const ultima = c.sheet.getLastRow();
    [[1, COL_CARGA.PRECO_LITRO - 1], [COL_CARGA.PRECO_LITRO + 1, totalColunas_(COL_CARGA) - COL_CARGA.PRECO_LITRO]]
      .forEach(function (b) {
        if (b[1] < 1) return;
        if (c.linha < ultima) {
          c.sheet.getRange(c.linha, b[0], ultima - c.linha, b[1])
            .setValues(c.sheet.getRange(c.linha + 1, b[0], ultima - c.linha, b[1]).getValues());
        }
        c.sheet.getRange(ultima, b[0], 1, b[1]).clearContent();
      });
    const detalhe = formatarData_(v[COL_CARGA.DATA - 1]) + ' • ' + produto + ' • ' + v[COL_CARGA.QUANTIDADE - 1] +
      ' L • R$ ' + v[COL_CARGA.VALOR - 1] + ' • NF ' + v[COL_CARGA.DOCUMENTO - 1] + ' • motivo: ' + motivo;
    const extra = finalizarCorrecaoBomba_([produto], 'Excluir carga da bomba', detalhe, v[COL_CARGA.DATA - 1]);
    return { ok: true, mensagem: 'Carga excluída (' + detalhe + ').' + extra };
  } finally { lock.releaseLock(); }
}

/**
 * Ajuste de estoque: o operador mede o tanque e informa o saldo REAL. A diferença entra
 * como uma movimentação "AJUSTE-ESTOQUE" ao custo médio vigente, então corrige os
 * litros sem mudar o preço médio do tanque.
 */
function webAjustarEstoqueBomba(token, produto, saldoReal, dataIso, justificativa) {
  autorizarContextoWeb_(token, ['OPERADOR', 'ADMIN']);
  const motivo = validarJustificativa_(justificativa);
  if (!motivo) return { ok: false, mensagem: 'Escreva a justificativa do ajuste (mínimo ' + MIN_JUSTIFICATIVA_ + ' caracteres).' };
  const prod = String(produto || '').trim().toUpperCase();
  if (PRODUTOS_BOMBA.indexOf(prod) === -1) return { ok: false, mensagem: 'Produto inválido.' };
  const real = Number(String(saldoReal).replace(',', '.'));
  if (!isFinite(real) || real < 0) return { ok: false, mensagem: 'Informe o saldo real medido (litros, zero ou mais).' };
  const data = parseDataIsoEstrita_(dataIso || '') || parseDataIsoEstrita_(Utilities.formatDate(new Date(), timezone_(), 'yyyy-MM-dd'));
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, mensagem: 'Outra operação está em andamento. Tente novamente.' };
  try {
    invalidarCacheLancamentos_();
    const e = estadoTanque_(prod, data);
    const diferenca = Math.round((real - e.litros) * 1000) / 1000;
    if (Math.abs(diferenca) < 0.001) return { ok: true, mensagem: 'O saldo do sistema já é ' + real.toFixed(3).replace('.', ',') + ' L. Nada a ajustar.' };
    if (!(e.custoMedio > 0) && diferenca > 0) {
      return { ok: false, mensagem: 'O tanque de ' + prod + ' ainda não tem custo médio (nenhuma carga com valor). ' +
        'Para entrada de produto, registre a carga com a NF.' };
    }
    const valorAjuste = Math.round(diferenca * e.custoMedio * 100) / 100;
    const sheet = aba_(ABAS.CARGA_BOMBA);
    const linha = Math.max(sheet.getLastRow() + 1, 2);
    garantirLinhas_(sheet, linha);
    sheet.getRange(linha, COL_CARGA.DATA, 1, COL_CARGA.VALOR)
      .setValues([[data, PREFIXO_AJUSTE_ESTOQUE_, prod, diferenca, valorAjuste]]);
    sheet.getRange(linha, COL_CARGA.OBSERVACAO).setValue('Ajuste de estoque por ' + emailContextoAtual_() +
      ': saldo do sistema ' + e.litros.toFixed(3) + ' L, medido ' + real.toFixed(3) + ' L • ' + motivo);
    sheet.getRange(linha, COL_CARGA.DATA).setNumberFormat('dd/mm/yyyy');
    const extra = finalizarCorrecaoBomba_([prod], 'Ajuste de estoque da bomba',
      prod + ' • ' + e.litros.toFixed(3) + ' L -> ' + real.toFixed(3) + ' L (' + (diferenca > 0 ? '+' : '') +
      diferenca.toFixed(3) + ' L, R$ ' + valorAjuste.toFixed(2) + ') • motivo: ' + motivo, data);
    return { ok: true, mensagem: 'Estoque de ' + prod + ' ajustado de ' + e.litros.toFixed(3).replace('.', ',') + ' L para ' +
      real.toFixed(3).replace('.', ',') + ' L (' + (diferenca > 0 ? '+' : '') + diferenca.toFixed(3).replace('.', ',') + ' L).' + extra };
  } finally { lock.releaseLock(); }
}
