# Sistema do ateliê — pesquisa e modelo

Pesquisa feita em 16/11/2026 para desenhar o painel do Cantinho da Day: o que
os sistemas de locação de trajes oferecem, como os PDVs de varejo tratam
pagamento e caixa, e o que a LGPD pede num cadastro de cliente. As fontes
estão no fim. Dois sites não abriram nesta sessão (bloqueio de rede): o texto
oficial da LGPD no Planalto e o site do WebLocação. Os pontos da lei abaixo
vêm de comentários e materiais de apoio, e precisam ser conferidos no texto
oficial antes de virar política do ateliê.

## O que a pesquisa mostrou

### Sistemas de locação de trajes

Os sistemas brasileiros do setor (WebLocação, Traje/Teitech, SisRoupas, Rental
Dress, LocaRoupas, MSLocações, SistemaNoivas) repetem o mesmo núcleo:

- agenda de prova, retirada e devolução, com lembrete por WhatsApp ou SMS;
- bloqueio por data e por peça, para não alugar a mesma peça duas vezes; o
  WebLocação bloqueia por padrão 4 dias antes da retirada e 4 depois da
  devolução;
- controle peça a peça (código de barras no Traje);
- devolução parcial e multa automática por atraso;
- contrato gerado pelo sistema, com código, evento, retirada, devolução e
  valor de cada peça;
- financeiro e caixa.

Contratos do setor cobram lavagem quando a peça volta suja e o valor da peça
quando ela volta danificada. A Justiça já considerou abusiva a retenção de 100%
do aluguel no cancelamento, e alegar má-fé do cliente exige prova. Vistoria
com foto e acerto item a item atendem as duas coisas.

### Pagamento no balcão

- Cliente paga em formas diferentes: na compra presencial, cerca de 57% usam
  Pix e 57% crédito, segundo a Cielo. O PDV precisa aceitar **mais de uma forma
  no mesmo pedido** e registrar cada uma separadamente, para a conferência.
- **Troco só sai do dinheiro.**
- Cartão só conta depois do **"aprovado" na maquininha**. No crédito, confira
  a modalidade e o número de parcelas no comprovante.
- Pix entra na hora; crédito pode ser parcelado ou antecipado. As taxas de
  maquininha variam por adquirente e plano: confirme as suas antes de decidir.
- Pix Parcelado não é produto oficial do Banco Central: cada instituição define
  as condições.

### Caixa

- **Abertura** com fundo de troco.
- **Sangria** (tirar dinheiro) e **suprimento** (pôr dinheiro), registrados
  na hora, com valor e motivo.
- **Fechamento** conferido por forma de pagamento: dinheiro, Pix, débito,
  crédito.
- **Conferência cega**: o operador informa o que contou antes de ver o valor
  esperado; o sistema mostra a diferença.

### LGPD no cadastro de cliente

- **Base legal por finalidade.** O cadastro e o contrato se apoiam na execução
  de contrato (art. 7º, V). A nota fiscal se apoia na obrigação legal (art. 7º,
  II). Pedir CPF "para cadastro", sem dizer para quê, é finalidade vaga.
- **Minimização.** Só o necessário para cumprir o contrato.
- **Marketing pede consentimento à parte** (art. 7º, I). Consentimento
  genérico não basta para mandar promoção no WhatsApp. É preciso registrar
  **qual** consentimento foi dado, e ele pode ser revogado a qualquer momento,
  de forma gratuita e fácil.
- **Direitos do titular** (art. 18): confirmação, acesso, correção,
  anonimização, bloqueio ou eliminação, portabilidade, informação sobre
  compartilhamento e revogação do consentimento.
- **Prazo de guarda.** Cadastro de cliente inativo não pode ficar para sempre:
  terminada a relação e os prazos legais, o dado sai.
- **Agente de pequeno porte** (Resolução CD/ANPD nº 2/2022): o ateliê pode
  fazer o registro das operações de forma simplificada, não precisa indicar
  encarregado e tem prazos diferenciados para algumas obrigações. Mas continua
  obrigado às bases legais, aos princípios e ao resto da lei.

## O modelo

### Telas

| Tela | O que faz |
| --- | --- |
| Início | O que sai, volta e está atrasado hoje; pedidos do site esperando sinal; alertas de caixa fechado e de pedidos do titular |
| Nova venda (PDV) | Cliente → datas → peças (várias, com etiqueta) → complementos → desconto com motivo → pagamento dividido → recibo → entrega |
| Pedidos | Todos, por situação, com busca; detalhe com valores, pagamentos, laudos e cancelamento |
| Clientes | Lista com CPF mascarado; ficha com consentimentos, crédito na loja, locações, histórico de acesso e direitos do titular |
| Acervo | Onde está cada peça física no dia |
| Caixa | Abertura, entradas e saídas por forma, sangria, suprimento, fechamento com conferência cega, histórico |
| Privacidade | Registro simplificado das operações, pedidos dos titulares com prazo, guardas vencidas, aviso de privacidade |

### Dados

- **Cliente.**
  - Necessário para o contrato: nome, CPF, WhatsApp e endereço (para cobrar se a peça não voltar).
  - Opcional: e-mail, RG e medidas.
  - Registros: o aviso de privacidade (data e versão) e o consentimento de marketing (sim ou não, data, versão, atendente, canal).
  - Também guarda o crédito na loja e o histórico de acesso e alterações.
- **Pedido.**
  - Cliente, datas e uma ou mais peças (cada uma é uma unidade física).
  - Complementos, desconto com motivo e valores (aluguel, extras, complementos, desconto, total, sinal, caução).
  - Pagamentos: tipo, forma, valor, parcelas e NSU.
  - Vistorias de entrega e de devolução, e o acerto da caução.
  - Situação: aguardando sinal, confirmado, com o cliente, concluído, cancelado ou expirado.
- **Caixa.** Abertura (dia, hora, atendente, fundo), movimentos (entrada, saída, sangria, suprimento, com forma, motivo e pedido) e fechamento com a conferência.
- **Pedido do titular.** Cliente, o que pediu, por onde, prazo e situação.

### Regras (em `logica.js`, com provas)

| Regra | Função |
| --- | --- |
| Pagamento dividido fecha só com soma exata; Pix, cartão e vale não passam do total; troco só no dinheiro; cartão e Pix só com confirmação | `validarPagamentos` |
| Parcelas em centavos inteiros, até 6x, parcela mínima de R$ 50 | `dividirParcelas`, `maxParcelas` |
| Líquido estimado por taxa da maquininha (taxas de exemplo em `config.js`) | `taxaEstimada` |
| Esperado do caixa por forma: fundo + entradas − troco − sangria + suprimento − saídas | `esperadoCaixa` |
| Conferência: esperado × contado × diferença | `conferirCaixa` |
| Cadastro mínimo válido, com aviso de privacidade mostrado | `validarCliente` |
| CPF mascarado em listas | `mascararCpf` |
| Só apaga sem locação ativa e depois de 5 anos da última devolução | `situacaoEliminacao` |
| Anonimizar tira o que identifica e mantém o histórico | `anonimizarCliente` |
| Cancelar até 7 dias antes devolve o sinal; depois, o sinal vira crédito na loja | `reembolsoCancelamento` + `estado.js` |

## Por resolver

- **Prazos e versão:** confirmar com contador ou advogado os prazos de guarda
  (5 anos para o cadastro, 6 meses para as fotos) e a versão do aviso de
  privacidade.
- **Taxas:** confirmar as taxas reais da maquininha e preencher a chave Pix em
  `config.js`.
- **Nota fiscal:** a NFC-e fica fora deste sistema. O recibo do PDV diz que
  não é documento fiscal.
- **Sistema de verdade:** login por atendente, banco de dados, backup e
  criptografia. A simulação guarda tudo no navegador.
- **Lembretes:** os lembretes automáticos por WhatsApp (como nos sistemas do
  setor) dependem da API oficial do WhatsApp, prevista na Fase 2.

## Fontes

- Sistemas do setor: [WebLocação](https://www.weblocacao.com.br/) ·
  [Traje (Teitech)](https://www.teitechsistemas.com.br/traje.html) ·
  [SisRoupas](https://sisroupas.com.br/) ·
  [Rental Dress](https://rentaldress.com.br/funcionalidades.html) ·
  [LocaRoupas](https://locaroupas.com.br/tag/aluguel-de-roupas/) ·
  [MSLocações](https://mslocacoes.com/) ·
  [SistemaNoivas](https://sistemanoivas.com.br/)
- Contratos e consumidor: [Correio Braziliense: aluguel de fantasia](https://blogs.correiobraziliense.com.br/consumidor/1781-2/) ·
  [EasyJur: aluguel de vestido](https://easyjur.com/blog/conheca-tudo-sobre-o-direito-do-consumidor-no-aluguel-de-vestido/) ·
  [OAB-RS: retenção de 100% é abusiva](https://www2.oabrs.org.br/jornalDaOrdem/clausula-que-preve-retencao-de-100-de-aluguel-cancelado-e-abusiva/39389)
- Pagamento: [Cielo: maquininha no varejo](https://blog.cielo.com.br/produtos-e-servicos/maquininha-loja-varejo/?amp=1) ·
  [Cielo: Pix parcelado](https://blog.cielo.com.br/pagamentos/pix-parcelado/?amp=1) ·
  [Omie: cupom com mais de uma forma](https://ajuda.omie.com.br/pt-BR/articles/8017599-omie-pdv-como-emitir-um-cupom-com-mais-de-uma-forma-de-pagamento) ·
  [Mercado & Consumo: pagamentos no varejo](https://mercadoeconsumo.com.br/02/06/2026/artigos-mercadotech/pagamentos-digitais-avancam-e-redefinem-a-experiencia-de-compra-no-varejo/) ·
  [Cursa: operador de caixa](https://cursa.app/pt/pagina/operador-de-caixa-formas-de-pagamento-e-conferencia-de-recebimentos)
- Caixa: [Alterdata: controle de caixa](https://ajuda.alterdata.com.br/shopbase/veja-como-realizar-o-controle-de-caixa-corretamente-77453518.html) ·
  [Omie: abertura e fechamento](https://ajuda.omie.com.br/pt-BR/articles/8421704-omie-pdv-varejo-abertura-e-fechamento-de-caixa) ·
  [Contmatic: sistema de caixa](https://simplifique.contmatic.com.br/blogs/sistema-de-caixa-para-loja) ·
  [Conta Azul: fechamento de caixa](https://contaazul.com/blog/como-fazer-fechamento-de-caixa/)
- LGPD: [Confidata: bases legais](https://confidata.com.br/blog/lgpd-comentada-05-bases-legais-parte1) ·
  [Confidata: direitos do titular](https://confidata.com.br/blog/lgpd-comentada-12-direitos-titular) ·
  [Migalhas: LGPD e marketing](https://www.migalhas.com.br/depeso/341746/a-lgpd-e-o-marketing) ·
  [TJCE: direitos do titular](https://www.tjce.jus.br/?p=177541) ·
  [Sebrae/OAB-PE: cartilha para pequeno porte](https://sebrae.com.br/Sebrae/Portal%20Sebrae/UFs/PE/Anexos/Comissao-de-Privacidade-e-Protecao-de-Dados-OABPE-Cartilha-LGPD-para-Agentes-de-Pequeno-Porte.pdf) ·
  [Felsberg: Resolução CD/ANPD nº 2/2022](https://www.felsberg.com.br/no-dia-internacional-da-protecao-de-dados-anpd-publica-nova-resolucao-que-regulamenta-a-aplicacao-da-lgpd-para-agentes-de-tratamento-de-pequeno-porte/) ·
  [Demarest: regulamento de pequeno porte](https://www.demarest.com.br/conselho-diretor-aprova-regulamento-de-aplicacao-da-lgpd-para-agentes-de-tratamento-de-pequeno-porte/)
