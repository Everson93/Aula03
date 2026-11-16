# Cantinho da Day — site de aluguel de trajes juninos e fantasias

Ateliê Néia Gonçalves. Landing de validação, com uma loja só (o ateliê).

Primeira etapa do site de aluguel de fantasias (ver a especificação
"Site de Aluguel de Fantasias — Pesquisa e Especificação"). O objetivo
**não** é o sistema completo: é medir, em 3 a 4 semanas, se clientes clicam
em reservar e pagam sinal, antes de investir no MVP com Next.js + Supabase.

**Sinal verde para o MVP:** pelo menos 3 lojas comprometidas e 10 reservas
com sinal pago vindas desta página.

## O que a página faz

- Vitrine com 34 fantasias, 6 delas infantis (tamanhos 2 a 14), busca por texto (sem se importar com acento) e
  temas de festa: Carnaval, Halloween, festa junina, anos 20 a 90, medieval,
  heróis, personagens históricos.
- Filtros por tema, gênero, tamanho e faixa de preço.
- Ficha de cada fantasia: medidas reais por tamanho (busto, cintura, quadril,
  altura), **sugestão de tamanho por altura e peso**, itens inclusos, kit
  para completar o look, preço do período de 3 dias, dia extra, caução,
  política de cancelamento da loja.
- Orçamento na hora: total, sinal (30% a 50%, definido por loja), saldo na
  retirada e caução à parte.
- Botão **Reservar pelo WhatsApp** que abre a conversa com a loja já com a
  mensagem pronta: código da peça, tamanho, data da festa (dd/mm/aaaa), kit,
  total e sinal.
- Link direto para cada fantasia (`index.html#f-HW01`; o formato antigo `#f/HW01` continua abrindo) — bom para anúncio e
  para mandar no Instagram.
- Botões para orçamento de quadrilha/grupo e para falar com o ateliê
  ("não achei o que procuro").
- Responsivo, com tema claro e escuro (segue o celular); sem dependências nem etapa de build.

## Estoque, retirada e devolução

- **Estoque**: em `dados.js`, `estoque: { P: 2, M: 3 }` diz quantas peças
  físicas existem de cada tamanho. Cada peça tem um código (`JN03-M-2` é a
  2ª Noiva da Quadrilha M).
- **Período**: o padrão é retirar na véspera e devolver no dia seguinte à
  festa (3 dias). A ficha mostra as duas datas assim que a data da festa é
  escolhida, e aceita até 4 dias extras (cobrados pelo `diaExtra` da peça).
  Dia em que o ateliê não abre (`diasFechados` em `config.js`, domingo por
  padrão) nunca é retirada nem devolução: a devolução passa para o próximo
  dia útil, sem custo.
- **Disponibilidade**: uma reserva ocupa a peça da retirada até a devolução,
  mais `margemHigienizacao` dias (padrão 1). A vitrine mostra, por fantasia e
  por tamanho, quantas peças estão livres na data; esgotada mostra a próxima
  data livre e troca o botão por "Perguntar outra data ou tamanho".
- **Agenda**: `agenda.js` guarda as reservas confirmadas. Ao receber um sinal
  pelo WhatsApp, acrescente uma linha (o formato está no próprio arquivo). A
  suíte reprova a agenda se duas reservas cruzarem na mesma peça — a mesma
  regra que o banco do MVP vai ter.

## Antes de publicar — 4 coisas

0. **Logo**: salve a imagem do logo nesta pasta (ex.: `logo.png`) e ponha
   `logo: 'logo.png'` em `config.js`. Ele entra no topo e na abertura. Vazio,
   o site escreve "Cantinho da Day" com a letra cursiva da marca.

1. **`config.js`**: preencha o `whatsapp` do ateliê e o `whatsappCentral`
   (pode ser o mesmo número; formato `5591988887777`: 55 + DDD + número, só
   dígitos). Confira endereço, percentual de sinal, dias fechados e a política
   de cancelamento — os valores atuais são sugestões.
   Enquanto faltar algum número, aparece uma faixa amarela no topo e os
   botões daquele contato ficam desativados — de propósito, para nenhum
   clique se perder.
2. **`dados.js`**: troque as 28 fantasias de exemplo (6 juninas) pelas peças
   reais do ateliê, com o estoque de cada tamanho.
   Ponha as fotos numa pasta `fotos/` e liste em `fotos: ['fotos/hw01-1.jpg']`.
   Sem foto, a página mostra um cartão com a cor da peça e o selo
   "foto ilustrativa".
3. **Medição**: cole no `<head>` do `index.html` o script do
   [Plausible](https://plausible.io) ou do Google Analytics 4. A página já
   envia estes eventos, sem configurar nada:

   | Evento | Quando |
   |---|---|
   | `busca` | enviou a busca do topo |
   | `filtro_tema`, `filtro_genero`, `filtro_tamanho`, `filtro_precoMax` | mudou um filtro |
   | `abrir_ficha` | abriu uma fantasia (`origem`: grade ou link) |
   | `sugestao_tamanho` | usou a sugestão por altura e peso |
   | `escolheu_data`, `filtro_disponivel` | escolheu a data da festa, filtrou só o que está livre |
| `clique_reservar` | **clicou em reservar** (peça, tamanho, retirada, devolução, peça livre) |
| `clique_pedir_outra_data` | clicou no botão de uma peça esgotada na data |
   | `clique_grupo`, `clique_falar_atelie`, `clique_nao_encontrei` | botões de contato |

   As **reservas pagas** não passam pelo site nesta fase: anote cada sinal
   recebido pelo WhatsApp (o código da peça vem na mensagem) para fechar a
   conta visitas → cliques em reservar → sinais pagos.

## Onde estamos, privacidade e Google

- **`config.js` → `local`**: endereço, cidade, UF, ponto de referência e
  horários. Viram a seção "Onde estamos" (com "Abrir no mapa"), o rodapé, os
  dados estruturados que o Google lê (endereço, horário, telefone) e o
  endereço do contrato. Os dias sem horário precisam bater com `diasFechados`
  da loja; a suíte confere.
- **`instagram`**: aparece no rodapé e no Google.
- **`medicao`**: `plausible` (sem cookies, recomendado: cole o script do
  Plausible no `<head>`) ou `ga4` (ponha o ID em `ga4Id` e **não** cole o
  script do Google: o site mostra o aviso de cookies e só carrega o Analytics
  depois do "Aceitar"; a escolha pode ser mudada na política de privacidade).
- **Política de privacidade**: no rodapé (link `#privacidade`), montada a
  partir do `config.js` (prazos de guarda e de resposta, versão).
- **Prévia do link**: `og-imagem.png` (1200×630) e `favicon.svg`. Depois de
  publicar, ponha o endereço do site em `og:url` no `index.html`. Quando o
  logo chegar, dá para refazer a imagem com ele.
- **Fora do site, de graça**: crie o Perfil da Empresa no Google (aparece no
  Maps; ponha o link `wa.me` no campo de agendamento) e o catálogo do
  WhatsApp Business com as peças.

## Publicar

É um site estático. Qualquer um destes serve, de graça:

- **Netlify Drop**: arraste a pasta `site-fantasias` em app.netlify.com/drop.
- **Vercel** ou **Cloudflare Pages**: aponte para a pasta, sem comando de build.
- **GitHub Pages**: publique a pasta numa branch ou repositório próprio.

Para testar no computador, basta abrir o `index.html` no navegador.

## Simular antes de subir

```bash
node simulacao/montar.js simulador.html
```

Gera um HTML único com o site inteiro mais uma camada de simulação:
- números de WhatsApp fictícios; o botão de reservar mostra a conversa que o
  ateliê receberia (com opção de mandar para o seu próprio WhatsApp);
- agenda de exemplo (`simulacao/agenda_exemplo.js`, gerada por
  `node simulacao/gerar_agenda.js` com semente fixa) com reservas no
  Réveillon, no Carnaval 2027 e no Arraiá de junho 2027 — há peças esgotadas,
  parciais e livres;
- botões de data rápida, painel "Estoque" (peças livres por data e a agenda
  de cada peça) e "Simular: loja confirmou e o sinal foi pago", que grava a
  reserva e baixa o estoque na hora;
- painel "Medição" com os eventos e o funil visitas → fichas → cliques em
  reservar → sinal pago.
O montador lê os arquivos reais, então a simulação não diverge do que vai ao
ar. A pasta `simulacao/` **não** vai para a hospedagem.

## Sistema do ateliê (simulado)

Na simulação, a faixa do topo troca entre **Site do cliente** e **Painel do
ateliê**. O painel é um sistema de gestão: menu lateral, dia de trabalho e
situação do caixa sempre à vista. O desenho saiu de uma pesquisa sobre
sistemas de locação de trajes, PDVs de varejo e LGPD; a pesquisa, o modelo de
dados e as fontes estão em [`PESQUISA_PAINEL.md`](PESQUISA_PAINEL.md).

| Tela | O que faz |
| --- | --- |
| Início | sai, volta, atrasados, pedidos do site, alertas |
| Nova venda | PDV: cliente, datas, várias peças, complementos, desconto com motivo, pagamento dividido (Pix, dinheiro com troco, débito, crédito em até 6x, vale), recibo, entrega |
| Orçamentos | para escola, quadrilha ou empresa: monte em Nova venda e "Salvar como orçamento" (não cobra nem segura peça; vale `orcamento.validadeDias`); mensagem pronta com as peças agrupadas por tamanho; "Virar pedido" leva de volta ao caixa |
| Provas | horários do dia a partir do horário de atendimento (`provas.duracaoMinutos`, `provas.provadores`); marcar com nome e WhatsApp; lembrete no WhatsApp; realizada, faltou, cancelada. No site, "Agende uma prova" na ficha |
| Retirada | cliente reservou (no site ou no balcão) e veio buscar: busca pelo código do pedido, nome, CPF ou WhatsApp; confere o documento ou cadastra quem veio do site; recebe saldo e caução; vistoria; contrato; entrega |
| Pedidos | todos, por situação; cancelamento (estorno até 7 dias antes, depois vira crédito na loja) |
| Contrato | sai preenchido do pedido (cliente, peças com etiqueta e valor de reposição, datas, valores, formas de pagamento, laudo da vistoria), com as mesmas 12 cláusulas do modelo; botão em Pedidos, Recibo e Retirada |
| Clientes | cadastro mínimo, CPF mascarado, consentimento de marketing à parte, crédito na loja, direitos do titular |
| Acervo | onde está cada peça física no dia; bloquear uma peça por um período (conserto, ajuste, higienização demorada) e liberar |
| Caixa | abertura, sangria, suprimento, fechamento com conferência cega |
| Privacidade | registro das operações, pedidos dos titulares com prazo, guardas vencidas |

`simulacao/estado.js` faz o papel do banco de dados; no sistema de verdade
cada atendente entra com login. Os parâmetros novos ficam em `config.js`:
`pagamentos` (chave Pix, parcelas, taxas de **exemplo**), `lgpd` (prazos de
guarda e de resposta, versão do aviso), `operadores` e `contrato` (CNPJ/CPF e
endereço do ateliê, horário de devolução, prazos das cláusulas 7, 8 e 9; vazio
sai como linha para preencher à mão). O contrato é gerado por `contrato.js`,
puro e testado, pronto para o sistema de verdade; cada fantasia em `dados.js`
ganhou `reposicao` (valor de reposição, de exemplo).

## Provas

```bash
node conferir_landing.js
```

971 provas: formatação pt-BR (nunca `toFixed`), sugestão de tamanho (nunca
sugere menor que o ideal), filtros, orçamento em centavos, mensagem e link do
WhatsApp, coerência de `dados.js` com `config.js` (loja existe, temas
existem, medidas completas, sinal entre 30 e 50, nenhum nome de marca
registrada), o contrato entre `index.html` e `app.js` (todo id pedido existe)
a montagem da simulação (cada script inline compila, ordem dos scripts), as
regras de período e estoque por peça (margem de higienização dos dois lados,
duas reservas em sequência na mesma peça, dia fechado), as duas agendas sem
conflito a marca (nome, fontes, logo), as regras do balcão (CPF, acerto da caução,
cancelamento, situação de cada peça) e o "banco" da simulação rodando no
Node: pedido do site, cadastro LGPD, pedido de balcão com várias peças e
pagamento dividido, caixa (troco, sangria, conferência), cancelamento que vira
crédito, anonimização, fotos vencidas, recomeçar.

A suíte foi validada por mutação: 13 defeitos reintroduzidos, todos
derrubam a suíte com código de saída 1. Dois sobreviveram na primeira rodada e
as provas foram corrigidas — "Pierrô" decomposto ainda contém "pierro" (a
prova passou a usar "Múmia"), e `0,1 × 100` dá exato em JavaScript (a prova
passou a usar 0,14 + 0,01, que sem centavos dá 0,15000000000000002).

## Testes de navegador e CI

```bash
node testes_navegador/navegador.js
```

Monta a simulação e percorre os fluxos no Chromium: site publicado (vitrine,
filtro infantil, sugestão de tamanho, botão desativado sem configuração),
reserva no site → retirada na loja com cadastro, contrato e entrega, venda no
balcão com Pix + dinheiro e troco, perfil de atendente, e o painel no celular
em tema escuro sem rolagem lateral. Erro de JavaScript em qualquer página
reprova. Precisa do pacote `playwright` (`npm install playwright`).

O GitHub Actions (`.github/workflows/site-fantasias.yml`, na raiz do
repositório) roda `conferir_landing.js` e depois os testes de navegador a
cada envio ou pull request que mexe em `site-fantasias/`.

## Separar em repositório próprio

O site mora dentro do repositório do sistema de frota. Para levá-lo a um
repositório só dele, com o histórico:

1. Crie um repositório vazio no GitHub (por exemplo `cantinho-da-day`).
2. Neste repositório, rode:

```bash
git subtree split --prefix=site-fantasias -b so-o-site
```

```bash
git push https://github.com/SEU-USUARIO/cantinho-da-day.git so-o-site:main
```

3. No repositório novo, mova o workflow para `.github/workflows/` e tire o
   `working-directory: site-fantasias` dele (lá o site fica na raiz).

## Personagens licenciados

Alugar peça licenciada comprada legalmente pode; usar nome, logo ou imagem
oficial na divulgação, não. Use nomes descritivos ("Super-herói de Capa
Vermelha", "Pirata Corsário") e fotos próprias. A suíte reprova `dados.js`
se aparecer um nome da lista de marcas conhecidas.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | estrutura da página |
| `estilo.css` | visual (desktop e celular) |
| `config.js` | nome, logo, ateliê, WhatsApp, sinal, higienização, dias fechados, cancelamento |
| `dados.js` | temas, fantasias e estoque por tamanho |
| `agenda.js` | reservas confirmadas (começa vazia) |
| `logica.js` | regras puras (preço, tamanho, filtro, orçamento, mensagem) — roda no navegador e no Node |
| `app.js` | interface |
| `conferir_landing.js` | provas |
| `simulacao/` | montador da versão de simulação (não publicar) |

## Próxima etapa (depois do sinal verde)

MVP conforme a especificação, na ordem: catálogo e calendário de
disponibilidade por unidade (com margem de higienização), reserva com sinal
Pix que expira em 30 minutos, painel da loja, vistoria fotográfica.
`logica.js` (tamanho, orçamento, filtros) e `dados.js` (formato do acervo)
foram pensados para serem reaproveitados lá.

Em aberto: qual gateway tem o melhor custo de split Pix (Asaas, Mercado Pago,
Pagar.me) e quantas lojas da cidade-alvo topam a parceria.
