# Cantinho da Day — site de aluguel de trajes juninos e fantasias

Ateliê Néia Gonçalves. Landing de validação, com uma loja só (o ateliê).

Primeira etapa do site de aluguel de fantasias (ver a especificação
"Site de Aluguel de Fantasias — Pesquisa e Especificação"). O objetivo
**não** é o sistema completo: é medir, em 3 a 4 semanas, se clientes clicam
em reservar e pagam sinal, antes de investir no MVP com Next.js + Supabase.

**Sinal verde para o MVP:** pelo menos 3 lojas comprometidas e 10 reservas
com sinal pago vindas desta página.

## O que a página faz

- Vitrine com 24 fantasias, busca por texto (sem se importar com acento) e
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

## Provas

```bash
node conferir_landing.js
```

585 provas: formatação pt-BR (nunca `toFixed`), sugestão de tamanho (nunca
sugere menor que o ideal), filtros, orçamento em centavos, mensagem e link do
WhatsApp, coerência de `dados.js` com `config.js` (loja existe, temas
existem, medidas completas, sinal entre 30 e 50, nenhum nome de marca
registrada), o contrato entre `index.html` e `app.js` (todo id pedido existe)
a montagem da simulação (cada script inline compila, ordem dos scripts), as
regras de período e estoque por peça (margem de higienização dos dois lados,
duas reservas em sequência na mesma peça, dia fechado), as duas agendas sem
conflito e a marca (nome, fontes, logo).

A suíte foi validada por mutação: 13 defeitos reintroduzidos, todos
derrubam a suíte com código de saída 1. Dois sobreviveram na primeira rodada e
as provas foram corrigidas — "Pierrô" decomposto ainda contém "pierro" (a
prova passou a usar "Múmia"), e `0,1 × 100` dá exato em JavaScript (a prova
passou a usar 0,14 + 0,01, que sem centavos dá 0,15000000000000002).

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
