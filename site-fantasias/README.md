# Fantasia na Data — landing de validação

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
- Link direto para cada fantasia (`index.html#f/HW01`) — bom para anúncio e
  para mandar no Instagram.
- Botões para pedido de grupo, para lojas que querem ser parceiras e para
  "não encontrei o que procuro".
- Responsivo; sem dependências nem etapa de build.

## Antes de publicar — 3 coisas

1. **`config.js`**: preencha `whatsappCentral` e o `whatsapp` de cada loja
   (formato `5591988887777`: 55 + DDD + número, só dígitos). Ajuste nome,
   bairro, percentual de sinal e política de cancelamento de cada loja.
   Enquanto faltar algum número, aparece uma faixa amarela no topo e os
   botões daquele contato ficam desativados — de propósito, para nenhum
   clique se perder.
2. **`dados.js`**: troque as 24 fantasias de exemplo pelas peças reais.
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
   | `clique_reservar` | **clicou em reservar** (peça, loja, tamanho, se tinha data) |
   | `clique_grupo`, `clique_parceiro`, `clique_nao_encontrei` | botões de contato |

   As **reservas pagas** não passam pelo site nesta fase: anote cada sinal
   recebido pelo WhatsApp (o código da peça vem na mensagem) para fechar a
   conta visitas → cliques em reservar → sinais pagos.

## Publicar

É um site estático. Qualquer um destes serve, de graça:

- **Netlify Drop**: arraste a pasta `site-fantasias` em app.netlify.com/drop.
- **Vercel** ou **Cloudflare Pages**: aponte para a pasta, sem comando de build.
- **GitHub Pages**: publique a pasta numa branch ou repositório próprio.

Para testar no computador, basta abrir o `index.html` no navegador.

## Provas

```bash
node conferir_landing.js
```

406 provas: formatação pt-BR (nunca `toFixed`), sugestão de tamanho (nunca
sugere menor que o ideal), filtros, orçamento em centavos, mensagem e link do
WhatsApp, coerência de `dados.js` com `config.js` (loja existe, temas
existem, medidas completas, sinal entre 30 e 50, nenhum nome de marca
registrada) e o contrato entre `index.html` e `app.js` (todo id pedido existe).

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
| `config.js` | nome do site, lojas, WhatsApp, sinal, política de cancelamento |
| `dados.js` | temas e fantasias |
| `logica.js` | regras puras (preço, tamanho, filtro, orçamento, mensagem) — roda no navegador e no Node |
| `app.js` | interface |
| `conferir_landing.js` | provas |

## Próxima etapa (depois do sinal verde)

MVP conforme a especificação, na ordem: catálogo e calendário de
disponibilidade por unidade (com margem de higienização), reserva com sinal
Pix que expira em 30 minutos, painel da loja, vistoria fotográfica.
`logica.js` (tamanho, orçamento, filtros) e `dados.js` (formato do acervo)
foram pensados para serem reaproveitados lá.

Em aberto: qual gateway tem o melhor custo de split Pix (Asaas, Mercado Pago,
Pagar.me) e quantas lojas da cidade-alvo topam a parceria.
