# Sistema de Frota — V4.7.1 e V4.7.2

Evolução do projeto V4.7, feita sobre o `Codigo_completo_FINAL_OFICINA_RELATORIO_V4_7.gs`
original. Este documento é o registro do que mudou e **por quê** — principalmente
das decisões que não são óbvias olhando só o código.

## Arquivos da versão

| Arquivo | Substitui |
|---|---|
| `Codigo_completo_V4_7_2.gs` | o `.gs` completo do V4.7 |
| `App_V4_7_2.html` | `App_FINAL_OFICINA_RELATORIO_V4_7.html` |
| `Lancamento_V4_7_2.html` | `Lancamento_FINAL_OFICINA_RELATORIO_V4_7.html` |

`Central_FINAL_OFICINA_RELATORIO_V4_7.html` não mudou.

## Ordem de instalação

1. Cole o `.gs` e os dois HTML no editor do Apps Script.
2. Rode **🚚 Sistema de Frota → Instalar / atualizar sistema**. Ele faz backup,
   migra o schema e reconstrói os relatórios.
3. Preencha **IPVA anual** no cadastro dos veículos (sem valor, o IPVA não aparece
   no mapa nem no relatório).
4. Cadastre os **fornecedores** que você usa.
5. Lance a **primeira carga na bomba** antes do primeiro abastecimento interno —
   sem carga registrada o sistema recusa o lançamento, de propósito.

> **O passo 2 não é opcional.** O Resumo passou de 20 para 22 colunas. Colar o
> código sem reinstalar deixa o programa esperando 22 colunas numa aba de 20, e
> o TOTAL cai fora da faixa lida. Existe uma guarda que detecta isso e recusa a
> leitura com instrução na tela — mas o sistema fica parado até você reinstalar.

---

# V4.7.1 — performance

Três mudanças no volume de cálculo do Resumo. Ganho medido: **36,7×** no cenário
de 170 veículos e 3.000 lançamentos.

**Altura fechada do `ARRAYFORMULA`.** `$A4:$A` fazia o array calcular ~1.100
linhas para uma frota de ~170 veículos. E `IF()` dentro de `ARRAYFORMULA` **não
faz curto-circuito**: o Sheets calcula os dois ramos inteiros antes de escolher,
então os `SUMIFS` rodavam também nas ~900 linhas vazias.

**Varredura pelo uso, não pela capacidade.** Os `SUMIFS` percorriam as 20.000
linhas alocadas mesmo com 3.000 lançamentos. Agora acompanham o volume real em
degraus de mil, nunca acima da capacidade — apontar além da grade daria `#REF!`.

**`VLOOKUP` de coluna inteira fechado**, de `Veículos!$A:$L` para faixa limitada.

### Um vão que já existia

`garantirCapacidadeLancamentos_` ampliava a grade de 20 mil para 40 mil linhas
mas **não** reescrevia as fórmulas do Resumo, que seguiam apontando para 20 mil.
Lançamentos acima disso sumiriam do relatório sem erro nenhum. O wrapper novo
sincroniza, e `validarSistema_` acusa se o teto ficar curto.

---

# V4.7.2 — os 10 itens do escopo

### 1. Dia de corte configurável

Os parâmetros `DIA_INICIO_PERIODO` e `DIA_FIM_PERIODO` **já existiam** na aba
Parâmetros; ninguém os lia. Havia quatro travas: `periodoDoMes_` com 26/25 no
código, a fórmula de competência, o instalador reescrevendo os valores a cada
atualização, e o app recusando salvar. Todas removidas.

- `DIA_FIM_PERIODO` é a **única fonte da verdade**; o início é derivado (corte+1).
  Dois parâmetros independentes permitiriam gravar início 10 com fim 25, e o
  período ficaria com buraco sem ninguém ver.
- **Corte ≥ 28 significa mês civil** (dia 1 ao último dia). Sem isso, um corte de
  30 pediria um dia que fevereiro não tem.
- A competência deixou de usar o truque "soma 7 dias se `DAY >= 26`", que não
  generalizava: com corte 1, o dia 31 cairia **dois** meses à frente. Agora usa
  `DATE()` com o mês incrementado.

### 2, 3, 4, 5 — fornecedor, oficina, KM e abastecimento

**Duas abas novas.** `Fornecedores` (nome, CNPJ, ramo, ativo) e `Carga na Bomba`
(data, NF, produto, quantidade, valor). O R$/litro da carga é **fórmula**, não
digitação — três campos digitados um dia não fecham entre si e ninguém sabe qual
acreditar.

**Custo do abastecimento interno: média ponderada MÓVEL.** Cada carga recalcula
o custo do saldo inteiro; cada retirada sai pelo custo vigente *naquele momento*.
A diferença é concreta: no cenário de teste a móvel dá R$ 5,3750/L e a média
simples das cargas daria R$ 5,5000. Com média simples, um abastecimento de
janeiro seria valorizado por uma carga de março.

O cálculo roda **antes** de gravar, de propósito: `estadoTanque_` lê a base, e um
lançamento já gravado consumiria a si mesmo.

**Quando não sabe, recusa.** Sem carga registrada até a data, ou tanque sem
litros suficientes, o lançamento não passa e a mensagem diz o que fazer. Saída
sem lastro fica contabilizada à parte para a conferência acusar.

**KM só em combustível.** Manutenção, multa e pedágio não movem odômetro, e KM
digitado ali sujava a série que alimenta KM/litro e custo por KM.

**Combustível interno não tem NF.** A nota é a da carga do tanque. O campo some
do formulário e a gravação força documento vazio — exigir um número ali faria o
operador inventar um, e número inventado é pior que campo vazio na conferência.

### 6, 8, 10 — IPVA e relatórios

**IPVA** virou coluna do Resumo, saindo do cadastro **dividido por 12**. Aparece
no Resumo por veículo, Gerencial, Manutenção, Ranking, Abastecimento e Consulta
Veículo — nas versões do app e da planilha.

**Consumo** ganhou a média geral de KM/litro no rodapé, que vinha nula. Tem de
ser KM total ÷ litros totais: média das médias faria um carro que rodou 200 km
pesar igual a um caminhão que rodou 20.000.

**Manutenção** ganhou consolidação por veículo, com quantidade, valor e a
natureza que mais pesou.

### 7 — editar veículo

O formulário era só "Novo veículo": não carregava cadastro existente, não tinha
campo de situação nem IPVA. Trocar centro de custo ou desativar um veículo só
dava direto na aba. Agora a lista tem botão **editar** (só ADMIN), e o formulário
traz **Situação (ativo/inativo)** e **IPVA anual**.

### 9 — Carga na Bomba

Ver item 4. A aba **não pede fornecedor**.

---

# Acréscimos pedidos depois

**Rateio editável.** A tela de centros era só leitura e dizia "edite na planilha".
O ADMIN agora escolhe o centro, vê o percentual atual já preenchido e altera.
Criar centro continua sendo pela aba — um centro novo sem percentual desequilibra
a base no mesmo instante.

> O perigo aqui é a unidade: a tela fala em **por cento** (35) e a coluna guarda
> **fração** (0,35). Gravar 35 faria o centro receber trinta e cinco vezes a base
> — e como `webRateio` normaliza por Σ%, o TOTAL continuaria fechando com o
> Resumo. O erro só apareceria na distribuição entre as lojas.

Soma ≠ 100% **avisa mas não bloqueia**: o rateio é normalizado e fecha de qualquer
jeito, porém somar 70% quase sempre é digitação pela metade.

**Lista suspensa de veículos nos relatórios.** Era `<input list=datalist>`, que só
revela as opções depois de digitar — quem não sabia a placa de cor ficava sem
lista. Virou `<select>` com a frota ordenada.

**Buscar peça ou serviço (garantia).** Responde "trocaram o alternador há quatro
meses, qual foi a nota?". Procura em natureza, detalhe, fornecedor, NF e
observação ao mesmo tempo, na base inteira, ordenado do mais recente, com coluna
"Há quanto tempo" — garantia se conta em dias. **Só existe no app**: a aba
Relatórios monta uma única QUERY a partir de um seletor e não tem onde digitar o
termo.

**Fornecedor é opcional.** Eu tinha exigido em toda despesa de oficina, e estava
errado: serviço na própria oficina, retrabalho e débito de loja não têm terceiro.
Exigir empurraria o operador a escolher um fornecedor qualquer só para o
formulário passar, contaminando justamente o relatório por fornecedor. **Quando
informado, precisa existir no cadastro** — isso impede a mesma empresa com três
grafias.

**ARLA 32 como tipo de despesa.** Fecha o ciclo: ARLA entrava no tanque e nada o
consumia. Tem coluna própria no Resumo (H), ao lado do Lubrificante.

- `TIPOS_COMBUSTIVEL` (libera KM) deixou de ser a mesma lista de
  `TIPOS_DO_TANQUE` (escolhe Interno/Externo). ARLA entra na segunda e não na
  primeira: juntar as duas faria o ARLA pedir odômetro.
- **"Litros Comb." continua contando só combustível.** Somar ARLA ali estragaria
  o KM/litro de toda a frota.
- ARLA não tem par Próprio/Terceiros para herdar, então origem vazia cai em
  **Externo** — o lado que não mexe no estoque.

**Manutenção em oficina por veículo** (sem pneus). O pneu domina o valor e
distorce a leitura de quem analisa mão de obra e peça.

---

# Schema

| Aba | Antes | Agora |
|---|---|---|
| Lançamentos | 14 colunas | **15** — Setor saiu; Fornecedor e Tipo de Abastecimento entraram |
| Veículos | 12 colunas | **13** — IPVA Anual |
| Resumo | 20 colunas | **22** — IPVA (O) e Arla 32 (H) |
| Fornecedores | — | **5** (nova) |
| Carga na Bomba | — | **7** (nova) |

`L_` passou a ser **derivado** de `COL_LANC`, e `TOTAL_COL_RESUMO` do cabeçalho.
Manter duas listas à mão era convite a divergência silenciosa.

## Três pontos de atenção

**O hash de integridade mudou.** Ele incluía o Setor. Removida a coluna, não há
como recalcular o hash de um período já fechado — o dado de origem não existe
mais. O hash ganhou prefixo de versão (`L2`) para a diferença aparecer como
"schema diferente" e não como "base adulterada". **Períodos já fechados precisam
de re-baseline após a migração.**

**IPVA vem do cadastro ÷ 12, não de geração mensal.** Espelha Emplacamento e
Seguro e não depende de ninguém lembrar de rodar um processo. Se preferir
lançamento mensal rastreável como a depreciação, é uma troca deliberada.

**Tipo de abastecimento é derivado quando vazio.** O modelo já separava
"Combustivel Proprio" de "Combustivel Terceiros", que é Interno/Externo com outro
nome. Campo vazio cai nessa regra, então o histórico responde sem reedição.

---

# Verificação

Nove suítes, todas em Node, sem precisar publicar no Google:

| Suíte | O que trava |
|---|---|
| `conferir_periodo.js` | corte 25 reproduz o V4.7 **exatamente**; 12 meses encadeiam sem buraco em 5 cortes |
| `conferir_tanque.js` | 13 cenários de média móvel, saída sem lastro, produtos separados |
| `conferir_ipva.js` | posição da coluna, ÷12, e que todo índice de VLOOKUP **cabe na faixa** |
| `conferir_catalogo.js` | `selecao` × `colunas` batem, e cada rótulo aponta para a coluna certa |
| `conferir_centro.js` | a conversão %/fração do rateio |
| `conferir_schema_resumo.js` | aba em layout antigo é recusada, não devolve zeros |
| `conferir_formulas.js` | invariantes do Resumo e o custo estimado de recálculo |
| `conferir_callbacks.js` | todo `google.script.run` do HTML resolve numa função do `.gs` |
| `scripts/testar_projeto_externo.js` | o motor inteiro contra os CSVs reais |

A rede de segurança é o total **R$ 927.343,21** com o rateio fechando no mesmo
número: erro de indexação por posição aparece ali.

## Três vezes em que o teste pagou por si

**Os relatórios de evolução leram o campo errado** depois da mudança de schema —
e a suíte **passou**, porque só conferia largura de linha. Ganhou regras de
conteúdo; contra o V4.7 antigo agora falha alto.

**O VLOOKUP pedia a coluna 13 de uma faixa de 12.** Isso não dá número errado:
dá `#REF!` no Resumo inteiro. Apareceu porque `conferir_ipva.js` exercita o IPVA
com valor real — o relatório saía com zero linhas e passava sem testar nada.

**Contar campos não prova semântica.** Se as letras do catálogo deslizarem uma
casa, o relatório continua com o número certo de colunas e passa a mostrar
Lavação sob o rótulo "Oficina". A checagem de rótulo × coluna fecha isso.

---

# V4.9 — orçamento, alerta ativo e rateio com memória

Três mudanças. A terceira não estava no pedido: apareceu ao implementar a
primeira e precisava ser feita antes, não depois.

## O defeito que a V4.9 conserta

A aba Centros de Custo guardava **um único percentual de rateio: o corrente**,
sobrescrito a cada alteração. Como o percentual é ajustado todo mês antes de
fechar, no instante em que alguém mexia no % de novembro **o rateio de outubro
passava a ser recalculado com os números de novembro**.

Ninguém percebia, e é fácil entender por quê: o TOTAL continua fechando com o
Resumo. Só a divisão entre as lojas muda. O próprio código já admitia o vão, em
`rateioExportacaoPeriodo_`: *"rateio percentual histórico exato só existe quando
a exportação é criada durante a competência/fechamento."*

Agora cada competência guarda o seu bloco, na aba nova **Rateio Mensal**.

### A aba Centros não saiu de cena

Ela continua sendo a fonte das **fórmulas da planilha** — aba Rateio por Centro,
Dashboard, `validarSistema_` — que leem `Centros!B` e não sabem o que é
competência. Gravar a competência **corrente** espelha nela. Por isso nenhuma
fórmula precisou ser reescrita, e a planilha e o app nunca mostram rateios
diferentes.

### Herança, e por que ela só olha para trás

Competência sem bloco próprio herda do **mês gravado mais recente que seja
anterior a ela**; na falta de qualquer histórico, da aba Centros. A tela diz de
onde veio — *"herdado de 2026-09"* é informação útil, *"3,83%"* sozinho não é.

Herdar do mês **seguinte** seria reabrir o defeito por outra porta: o passado
voltaria a se mexer sozinho. Tem teste só para isso.

### O vão da transição

Instala em julho, ninguém abre a tela, fecha julho. Em agosto o operador ajusta
o rateio. Agosto ganha bloco, julho não tem nenhum — e julho cairia na aba
Centros, que já foi espelhada com os valores de agosto. **O mês de instalação
herdaria do futuro.**

Por isso a instalação chama `semearRateioCompetenciaAtual_()`, que congela os
percentuais da competência aberta. É idempotente: rodar de novo não duplica.

## Edição em lote, não um centro por vez

A tela de centros era só leitura, com um seletor que alterava **um** centro e
mandava "edite na planilha" para o resto. Virou tabela editável com gravação em
lote.

Em lote de propósito: o ajuste mensal mexe em várias lojas ao mesmo tempo, e
salvar uma a uma deixaria a base num estado intermediário em que a soma não
fecha — exatamente o estado que o aviso de 100% existe para denunciar.

> **A unidade continua sendo a armadilha.** A tela fala em **por cento** (3,83) e
> a coluna guarda **fração** (0,0383). Gravar 3,83 faria o centro receber
> trezentas e oitenta e três vezes a base — e como o rateio normaliza por Σ%, o
> TOTAL continuaria fechando. Tem teste de unidade só para isso.

Competência encerrada **recusa** gravação. É o sentido de existirem por
competência.

## Orçamento por centro de custo

O sistema media o custo com precisão de centavo e não tinha nada com que
compará-lo. "A Loja 08 gastou R$ 41.230" não diz se foi bom ou ruim.

Aba nova **Orçamento**, por competência, pelo mesmo motivo do rateio: o previsto
de outubro tem de continuar sendo o de outubro.

**O realizado é o TOTAL do centro DEPOIS do rateio**, não o custo direto —
comparar com o direto deixaria de fora justamente a parcela do depósito que a
loja recebe. E vem da **mesma função** que alimenta a tela de rateio
(`apurarRateio_`), extraída para isso: se cada tela somasse o seu, "realizado" e
"total do centro" divergiriam e ninguém saberia em qual acreditar.

A projeção repete até o fim do período o ritmo de gasto até aqui. Quatro
situações: `DENTRO`, `VAI ESTOURAR` (projeção passa do previsto), `ESTOUROU` e
`SEM ORÇAMENTO`. No primeiro dia do período a fração decorrida nunca é zero —
dividir por zero mandaria a projeção ao infinito e toda loja que gastasse um
real apareceria estourando.

A lista de edição traz **todos os centros cadastrados**, não só os que aparecem
na tabela: um centro novo, ainda sem gasto nem previsto, ficaria impossível de
orçar pela tela.

## Alerta diário por e-mail

Tudo o que ele conta **já existia** — e só aparecia para quem abrisse a tela e
procurasse. Um tanque no fim, um odômetro que retrocedeu e um IPVA esquecido não
melhoram sozinhos: pioram em silêncio até o fechamento.

Três blocos, escolhidos pelo usuário: **consumo fora da curva**, **tanque e
pendências**, **odômetro e IPVA**. Orçamento ficou fora do alerta de propósito —
é tela, não e-mail.

**Não manda nada quando não há nada.** Um e-mail diário de "tudo certo" vira
filtro no Outlook em duas semanas, e junto com ele some o dia em que havia algo.

**Reusa os critérios das telas.** O alerta de custo por km é a regra idêntica à
da formatação condicional do Resumo: acima de **2×** a média da frota. Dois
critérios parecidos mas diferentes seriam pior que nenhum — a tela diria uma
coisa e o e-mail outra. A média é total ÷ total, nunca média das médias.

Cada bloco é isolado: um erro ao apurar o tanque não pode impedir o aviso de
odômetro.

`EMAIL_ALERTAS` vazio desliga. Mudar `HORA_ALERTA` recria o gatilho — ele guarda
a hora dentro dele, e sem recriar o alerta sairia no horário antigo para sempre.
Há prévia na tela de Configurações, que mostra o que sairia sem enviar nada.

## Parâmetros e abas novas

| Parâmetro | Padrão | Para quê |
|---|---|---|
| `EMAIL_ALERTAS` | *(vazio)* | Quem recebe o alerta; vazio desliga |
| `HORA_ALERTA` | 7 | Hora do envio (0-23) |
| `ESTOQUE_MINIMO_L` | 500 | Litros abaixo dos quais o tanque entra no alerta |

| Aba | Colunas |
|---|---|
| `Rateio Mensal` | Competência, Centro, % Rateio, Recebe Rateio, Atualizado em, Responsável |
| `Orçamento` | Competência, Centro, Valor Previsto, Atualizado em, Responsável |

Ambas acompanham os **centros**, não o movimento: `zerarSistema_` só as limpa no
escopo "tudo", como já faz com o cadastro de centros.

> **Reinstalar é obrigatório.** As duas abas e os três parâmetros nascem na
> instalação, e é ela que semeia o bloco da competência aberta.

## O que NÃO mudou

**O Resumo.** Nenhuma coluna nova, nenhuma migração, nada a recalcular.

**O hash de integridade.** A composição lista os campos um a um e nenhum deles
foi tocado. Competências fechadas continuam validando — diferente do que
aconteceu quando o Setor saiu na V4.7.2.

**A senha.** `hashSenha_` continua SHA-256 de uma rodada com salt, por decisão
do usuário.

## Suítes

| Arquivo | Provas |
|---|---|
| `conferir_rateio_competencia.js` | 25 |
| `conferir_alerta_diario.js` | 23 |

A prova central da primeira compara a **divisão loja por loja** de um mês
fechado, antes e depois de mexer no mês seguinte. Um teste que só conferisse "a
soma bate" passaria com o defeito de volta — era exatamente assim que ele
sobrevivia.

As duas foram validadas por mutação: reintroduzindo o comportamento da V4.8,
9 das 25 provas falham, e a Loja 01 de junho pula de R$ 4.000 para R$ 9.000 só
porque julho foi editado.

### Duas armadilhas que apareceram escrevendo os testes

**`Date` entre realms do `vm`.** Um `Date` construído fora do sandbox não passa
no `instanceof Date` de dentro. Os testes de odômetro passavam com lista vazia —
aprovando o código sem exercitar nada. Resolvido com uma fábrica de datas criada
dentro do contexto.

**A contagem do assunto do e-mail** é de *pontos de atenção*, não de pendências:
"2 pendências em aberto" é uma linha só. O teste pedia "2 ponto" e estava errado,
não o código.


---

# V4.9.1 — resolver a pendência, não só marcá-la

A tela de pendências listava o problema e oferecia **Status** e **Observação**.
Dava para escrever "serviço" na observação, marcar RESOLVIDO, e o lançamento
continuava sem detalhe nenhum. A pendência saía da contagem, o dado ficava
errado, e a conferência passava a mentir — que é o oposto do que ela existe
para fazer.

Agora, quando o problema é **um campo faltando numa linha conhecida**, o cartão
traz o campo e grava a correção na base. A pendência some porque foi resolvida,
não porque alguém disse que estava.

O campo de correção vem **antes** do Status/Observação no cartão, de propósito:
o caminho óbvio tem de ser o que conserta.

## A proteção que mais importa

O número da linha foi gravado quando a conferência rodou. Se alguém apagou uma
linha de Lançamentos desde então, **"linha 35" aponta hoje para outro
lançamento** — e gravar ali corromperia um registro que estava certo, sem
nenhum sinal.

Por isso, antes de escrever, o sistema confere se a linha alvo ainda é do mesmo
veículo. Não sendo, recusa e manda revalidar. Há teste de mutação para isso:
desligando a reverificação, o texto vai parar no lançamento de outro veículo e
três provas falham.

Depois de gravar, a conferência inteira é refeita — corrigir um campo pode
resolver mais de uma pendência da mesma linha, e deixar as outras na tela seria
mentira.

## O que é corrigível

| Aba | Problema | Campo |
|---|---|---|
| Lançamentos | Oficina sem natureza da despesa | lista |
| Lançamentos | Oficina sem detalhe da peça/serviço | texto (mín. 3) |
| Lançamentos | Oficina sem NF/OS/documento | texto |
| Lançamentos | Lançamento incompleto (sem tipo) | lista |
| Lançamentos | Tipo de despesa desconhecido | lista |
| Lançamentos | Sem centro de custo congelado | lista |
| Lançamentos | Sem categoria congelada | lista |
| Lançamentos | Valor negativo | número ≥ 0 |
| Lançamentos | Litros em tipo que não é abastecimento | número ≥ 0 |
| Odômetro | KM/horímetro inválido | número |
| Odômetro | Leitura menor que a anterior | número |
| Veículos | Ativo sem centro de custo | lista, **ADMIN** |
| Veículos | Ativo sem categoria | lista, **ADMIN** |

As duas de Veículos são ADMIN porque `webSalvarVeiculo` é ADMIN no resto do
sistema — seria incoerente o operador alterar o mesmo campo por outra porta.
Nelas a linha é achada **pela placa**, não por número.

## O que ficou de fora, e por quê

- **Soma do rateio, placa duplicada, patrimônio duplicado** — não são de uma
  linha só.
- **Placa não cadastrada** — exige cadastro novo, não edição de campo.
- **Datas.** Mudar a data de um lançamento muda a **competência** dele, podendo
  jogá-lo para dentro ou para fora de um período fechado e alterando o hash de
  integridade. Isso não pode acontecer num campo de preenchimento rápido; merece
  tratamento próprio.
- **ID de auditoria** — é gerado, não digitado.

Quando o detalhe não traz `linha N`, o campo simplesmente não aparece. Na dúvida
sobre qual linha é, melhor não oferecer do que gravar no lugar errado.

## Suíte

`conferir_corrigir_pendencia.js` — 29 provas, incluindo as três que só passam
com a reverificação do alvo ligada.


---

# V4.9.2 — a conferência passou a respeitar a unidade de medida

Uma empilhadeira a GLP aparecia na conferência como
**"Preço por litro fora da curva — R$ 213,00/L"**. Empilhadeira não consome
litro: consome botijão de gás, medido em **quilos**.

O sistema já sabia disso. Existe `TIPOS_QUANTIDADE_KG = ['Gás']` desde a V4.8, e
o formulário de lançamento troca o rótulo do campo para "Quantidade (kg)". Só a
**conferência** tinha ficado de fora: ela dividia valor por quantidade e
anunciava o resultado como "/L", fosse qual fosse o tipo.

## Dois erros no mesmo lugar

Havia **um teto único de R$ 30** para tudo que tem quantidade:

**Gás** — a conta `valor ÷ quilos` estava certa, o rótulo é que mentia. E o teto
do diesel não serve para GLP.

**Lubrificante** — óleo sintético passa de R$ 30/L sem nada de errado. O teto do
diesel acusava compra normal como fora da curva, e alarme que toca sempre é
alarme que ninguém lê.

Agora o teto é por tipo, e são tetos de **absurdo**, não de mercado — servem
para pegar erro grosso de digitação, não para discutir preço:

| Tipo | Teto | Unidade |
|---|---|---|
| Combustível próprio / terceiros | 30 | R$/L |
| Arla 32 | 30 | R$/L |
| Lubrificante | 200 | R$/L |
| Gás | 30 | R$/**kg** |
| *(qualquer outro)* | 30 | R$/L |

## O que o operador vê agora

Lançar um botijão P20 por R$ 213 **em quilos** dá R$ 10,65/kg e não acusa nada.
Lançar o mesmo botijão como quantidade **1** continua acusando — e deve mesmo,
porque aí a coluna "Gás kg" do Resumo também fica errada. Só que a mensagem
passou a dizer o que fazer:

> Preço por quilo fora da curva
> linha 86 • R$ 213,00/kg em Gás • se lançou o botijão inteiro, informe os
> quilos (P13 = 13 kg, P20 = 20 kg, P45 = 45 kg)

E a pendência é **corrigível na própria tela** (V4.9.1), com o campo apontando
para a **quantidade** — que é o que costuma estar errado nesse caso. A versão em
litro não oferece correção: ali tanto o valor quanto a quantidade podem ser o
erro, e o sistema não dá palpite.

O nome antigo do problema ("Preço por litro fora da curva") foi preservado para
os casos em litro, para as pendências já tratadas não voltarem como novas.

## Uma lição de teste

A primeira versão da suíte **reescrevia a regra** em vez de chamá-la: o teste
calculava `valor / quantidade > teto` por conta própria. Isso passaria mesmo se
o coletor fizesse outra coisa — que é exatamente como os relatórios de evolução
leram o campo errado na V4.7.2 com a suíte verde.

A decisão foi extraída para `pendenciaPrecoUnitario_()`, função pura que o
coletor e o teste chamam. O coletor lê a planilha inteira e não dá para
exercitá-lo direto; separar a decisão resolve isso sem fixture.

`conferir_unidade_quantidade.js` — 29 provas. Por mutação: restaurando o teto
único e o "/L" fixo, 4 falham.


---

# V4.9.3 — cobertura das pendências: 14 → 25 campos, mais 8 com caminho

A V4.9.1 deixou 14 dos ~30 tipos de pendência corrigíveis na tela. O resto
continuava só com Status e Observação, que é o mesmo que nada.

Agora são **25 corrigíveis por campo** e **8 com caminho explícito** — botão de
rotina ou atalho para a tela certa. Sobram poucos casos, e eles estão listados
abaixo com o motivo.

## Datas entraram, com trava

Na V4.9.1 eu deixei datas de fora por um motivo que continua valendo: mudar a
data de um lançamento muda a **competência** dele. A decisão foi errada na
forma, não no fundo — o certo não era excluir, era **travar**:

`travaCompetenciaFechada_` confere os **dois lados**. A data nova, obviamente:
ninguém empurra despesa para dentro de um mês assinado. Mas a antiga também —
**tirar** um lançamento de um mês fechado muda o total e o hash dele por trás, e
o fechamento deixa de valer sem ninguém saber. Nos dois casos a correção é
recusada, e a saída é reabrir a competência, de propósito e por escrito.

> **Fuso.** O `<input type="date">` manda `AAAA-MM-DD`. Montar com
> `new Date(texto)` leria como UTC e poderia voltar um dia em fuso negativo — o
> que, num sistema com corte no dia 25, joga o lançamento para a competência
> anterior. A data é montada por ano/mês/dia ao meio-dia.

Tipos cobertos: Data inválida, Lançamento em período futuro, Data de odômetro
inválida, Leitura de KM em período futuro.

## Outros campos que entraram

| Problema | Campo | Perfil |
|---|---|---|
| Placa não cadastrada em Veículos | placa do lançamento (lista) | OPERADOR |
| Lançamento do período em veículo inativo | Situação do veículo | ADMIN |
| Centro de custo do veículo não existe | Centro (lista) | ADMIN |
| Código Patrimônio duplicado | Código Patrimônio | ADMIN |
| Descrição / Categoria / Centro **com erro de fórmula** | o campo correspondente | ADMIN |

Os três últimos trazem o valor no **próprio nome** do problema
("Descrição do veículo com erro (#REF!)"), então busca exata nunca casaria.
Eles ficam num registro por **prefixo**, consultado depois da busca exata.

## O que não vira campo — e ganhou botão

- **Sem ID de auditoria / ID duplicado** → botão que roda
  `garantirIdsLancamentos_()`. O ID é gerado, não digitado.
- **Soma do rateio ≠ 100%** → atalho para a tela de centros. Não é um campo só:
  os percentuais se ajustam em conjunto.
- **Depreciação não lançada / divergente / fora de data** → atalho para a tela
  de depreciação, que lança em lote.
- **Abasteceu mas não tem KM rodado** → atalho para lançamento. Falta uma
  leitura **nova**, não um campo errado.
- **Sem nenhum custo no período** → informativo. Não é defeito; se o veículo
  parou de vez, o certo é inativá-lo.

Cada ação carrega uma **explicação** do porquê — há teste conferindo que nenhuma
fica sem ela. Botão sem motivo vira clique no escuro.

## Suíte

`conferir_corrigir_pendencia.js` passou de 29 para **55 provas**. Por mutação,
desligando a trava de competência, 5 falham.

Uma prova foi **invertida**, não apagada: ela dizia "data fica de fora de
propósito". A decisão mudou de excluir para travar, e a prova mudou junto,
com o comentário do porquê — apagar teria deixado a trava sem guarda.


---

# V4.9.4 — a pendência que estava registrada mas não aparecia

"Leitura de KM menor que a anterior" **estava** na lista de corrigíveis desde a
V4.9.1, e mesmo assim o cartão dela na tela não mostrava campo nenhum. Só
Status e Observação, como antes.

A causa: o coletor escrevia o detalhe dela como

```
2026-10 • 06/10/2026: 677096 < 678573 (linha 96)
```

com o número **no fim, entre parênteses** — enquanto as outras 24 escrevem
`linha 96 • ...`. O parser (`linhaAlvoPendencia_`) exigia o prefixo, não
reconhecia, `correcaoDaPendencia_` devolvia `null`, e o campo simplesmente não
era renderizado. Sem erro, sem aviso. A pendência ficava impossível de resolver
pela tela.

Era um de 25. Um único formato fora do padrão.

## Corrigido em três níveis

**O formato.** O coletor passou a escrever `linha 96 • 2026-10 • ...`, como
todos os outros.

**O parser.** Continua preferindo o prefixo, mas agora tem rede de segurança
para `(linha N)` em qualquer posição. Parser rígido demais transforma
divergência de texto em campo que some da tela sem erro — que foi exatamente o
que aconteceu aqui.

**A regra que impede a volta.** É a parte que importa.

## `conferir_alvo_pendencia.js`

Um teste de unidade do parser **não pegaria** este defeito: o parser estava
certo para o formato que ele conhecia. O que faltava era confrontar os dois
lados — quem **registra** a correção e quem **escreve** o detalhe. Eles vivem a
3.000 linhas de distância e nada os obrigava a concordar.

A suíte lê o próprio `Codigo.gs`, extrai cada `problemas.push([...])` pelo
balanceamento de colchetes (regex não dá conta: os detalhes têm concatenação com
parênteses dentro), pega o nome do problema e a expressão do detalhe, e cobra:

> Todo problema registrado como corrigível por campo, e que não se localize pela
> placa, tem de produzir um detalhe que **comece** com `'linha '`.

Validada por mutação: restaurando o formato antigo, a regra falha e **nomeia o
problema e o detalhe**, dizendo o que corrigir.

Ela ainda confere um segundo invariante: **nenhum tipo de pendência fica sem
campo e sem caminho**. Hoje o resultado é `nenhum` — todos os ~30 tipos têm ou
um campo, ou um botão de rotina, ou um atalho, ou uma explicação de por que não
há o que corrigir.

## A lição

Esta é a terceira vez neste projeto que a suíte passa verde enquanto o sistema
faz outra coisa:

1. Os relatórios de evolução lendo o campo errado — o teste só conferia largura.
2. O preço unitário — o teste reimplementava a regra em vez de chamá-la.
3. Esta — o teste exercitava o parser, não o acordo entre parser e coletor.

O padrão é sempre o mesmo: o teste olha **um lado** de um contrato que tem dois.
As regras estáticas que leem o código-fonte são a resposta que tem funcionado.


---

# V4.9.5 — "consumo fora da curva": 74 avisos que não eram avisos

O primeiro alerta diário de verdade saiu com **83 pontos, 74 deles no mesmo
bloco**. Não era sensibilidade alta: era erro de método, em cinco frentes. A
evidência estava no próprio e-mail:

```
média da frota: 10,53 km/l        ← número de carro
marcados:  2,14 · 2,30 · 2,35 · 3,08 · 3,21 km/l   ← números de caminhão
```

Carreta a 2,5 km/l é o normal dela. Como a média era puxada pelos carros, **toda
carreta caía abaixo da metade por construção**. O alerta apontava sempre os
mesmos veículos, pelo motivo errado — e aviso que aponta sempre não aponta nada.

## As cinco frentes

**1. Categorias misturadas.** A frota vai de Moto a Carreta Frigorífica. Agora a
comparação é **dentro da categoria** do veículo.

**2. Média como referência.** Esta apareceu escrevendo o teste, e é a mais
sutil: num grupo de cinco carretas em que uma bebe o dobro, **o próprio outlier
entra na média e levanta a barra que deveria julgá-lo** — 5,4 contra um limite
de 2× a média (3,00) não dispara. A referência passou a ser a **mediana**, que
não se move: 2× 2,40 = 4,80, e a culpada é pega.

> Isso não contradiz o rodapé do relatório de consumo, que continua usando
> total ÷ total. São perguntas diferentes: para **relatar** consumo o que importa
> é o peso de cada veículo; para **detectar** outlier o que importa é robustez a
> extremo.

**3. O mesmo veículo contado duas vezes.** Quem roda pouco por litro gasta mais
por km — é o mesmo fato físico. Cinco das placas do print apareciam duas vezes.
Agora é **um achado por veículo**, citando os dois desvios na mesma linha.

**4. Custo fixo no R$/km.** O `TOTAL` do Resumo inclui depreciação, IPVA, seguro,
emplacamento e multa — nada disso varia com o uso, e tudo isso corre com o
veículo parado na garagem. A conta passou a usar só o **custo variável**:
combustível, lubrificante, ARLA, lavação, oficina, pneus, pedágio e gás.

**5. Sem piso de rodagem.** Poucos quilômetros no período = divisor minúsculo =
qualquer valor vira outlier. O piso é **20% da rodagem mediana da categoria** —
relativo, não absoluto, porque empilhadeira marca HORA no mesmo campo em que a
carreta marca KM, e um piso fixo excluiria todas as empilhadeiras ou nenhuma
carreta.

## O que o alerta diz quando não avalia

Em vez de omitir em silêncio, ele conta:

> — 6 veículo(s) não avaliados: a categoria deles tem menos de 4 veículos
> rodando, e não dá para dizer o que é fora da curva com tão pouca referência.

Grupo pequeno demais não vira julgamento: com dois ou três veículos, qualquer um
deles move a própria referência.

## O e-mail não deixa um bloco engolir os outros

Um bloco de 74 linhas empurra os outros três para fora da primeira tela, e quem
abre só vê um. Cada bloco mostra no máximo **12** itens, com "e mais N" e o
caminho para a lista inteira. A contagem no título continua sendo a real.

## Divergência conhecida, de propósito

A formatação condicional do **Resumo** continua pintando de vermelho o R$/km
acima de 2× a média da frota — a regra antiga, com o defeito antigo. Numa frota
mista ela segue pintando todo caminhão.

Não foi corrigida junto porque a correção em fórmula custaria um
`MEDIAN(FILTER(...))` por linha — 170 varreduras a cada recálculo, logo depois de
termos removido exatamente esse tipo de peso. **É um ponto em aberto**, não um
descuido: o e-mail e a planilha hoje respondem perguntas diferentes, e só o
e-mail responde a certa.

## Suíte

`conferir_alerta_diario.js` passou de 23 para **41 provas**, com frota mista de
verdade. Por mutação, voltando a comparar tudo junto, as quatro carretas normais
voltam a ser acusadas por serem carretas — o defeito exato que o usuário viu.


---

# V4.10 — indicadores por grupo de frota

`custoKm`, `kmLitro` e `precoLitro` do painel somavam a frota inteira. Numa
frota que vai de Moto a Carreta Frigorífica, esses três números não descrevem
veículo nenhum: ficam entre dois mundos.

Agora o painel tem um seletor **Frota inteira / Transporte / Apoio / Operação
interna**, e os KPIs recalculam para o recorte.

## De onde sai o agrupamento

Da **categoria**, que o cadastro já mantém — não de uma coluna nova. Categoria
certa implica grupo certo, sem nada a preencher por veículo; uma coluna a mais
seria mais um campo para ficar vazio.

O mapa fica no parâmetro `GRUPOS_FROTA`, editável em Configurações:

```
Transporte: Truck Normal, Truck Frigorifico, Carreta Normal, Carreta Frigorifica |
Apoio: Carro, Moto, Leve |
Operação interna: Empilhadeira/Paleteira, Maquina
```

A comparação ignora acento, caixa e espaço sobrando. Categoria que não aparece
em grupo nenhum cai em **Outros**, visível no seletor — somá-la em silêncio
faria os grupos não fecharem com o total e ninguém saberia onde foi parar a
diferença. Categoria listada em dois grupos fica **no primeiro**: nos dois, o
custo dela entraria duas vezes.

## Sem custo de desempenho

Os KPIs de **todos os grupos** vêm na mesma resposta, calculados na **mesma
varredura** que já produzia o total. Trocar o seletor não chama o servidor, e o
aquecimento de cache continua valendo igual — uma chave só, como antes.

Calcular depois custaria outra passada e, pior, abriria espaço para o total e os
grupos divergirem.

## O que o recorte NÃO muda

Evolução mensal, composição do custo, rankings e pendências seguem sendo da
frota inteira, e os títulos passaram a dizer isso. O histórico fechado é gravado
por competência, sem quebra por grupo — recortá-lo exigiria recalcular doze
meses a cada abertura do painel.

## Suíte

`conferir_grupos_frota.js` — 21 provas. A central é o invariante: **a soma dos
grupos tem de fechar com o total**. Por mutação, fazendo a última ocorrência
vencer em vez da primeira, a prova de duplicidade falha.

### Dois testes que eu escrevi errado

Vale registrar, porque é o mesmo vício de sempre em roupa nova: **limiar
arbitrário**.

A primeira versão afirmava "o km/l do transporte difere do da frota em mais de
0,5". O número 0,5 não vinha de lugar nenhum, e quase reprovou uma fixture
correta (a diferença deu 0,49). A afirmação que importa não é essa — é que o
número da frota **fica entre os grupos**, não sendo de ninguém.

A segunda era pior: afirmava que o R$/km do transporte difere do da frota. Isso
é **falso** quando o transporte responde por 85% do custo — é correto que a
média fique colada na dele. O teste passou a cobrar o risco real e oposto: o
grupo dominante sequestra a média, e o número da frota **mente sobre os grupos
pequenos** (no cenário, R$ 0,45/km do apoio contra R$ 2,08 da frota).


---

# V4.10.1 — 110 pendências que não eram pendências

A lista de conferência estava com **110 itens**, quase todos
"Lançamento em período futuro" com datas de dezembro.

Causa: eu mesmo, na V4.8.7. O IPVA passou a ser lançado como **12 parcelas,
cada uma datada no fim da SUA competência** — inclusive as que ainda não
chegaram. É o ponto delas: o encargo anual aparece diluído mês a mês no mapa,
em vez de pesar tudo num mês só.

O validador de "lançamento em período futuro" nasceu antes disso, para pegar
quem digita 2027 no lugar de 2026. Ele não sabia das parcelas e condenava cada
uma. Pior tipo de ruído: itens que **ninguém consegue resolver porque não são
problema** — e que ensinam o operador a ignorar a tela inteira.

Um veículo com IPVA lançado na competência aberta gera **11** parcelas futuras,
e esse número só cai de um em um a cada mês. Com algumas dezenas de veículos, as
110 aparecem sozinhas.

## Havia um agravante

```js
if (!noPeriodoAtual && !futuro) return;
```

Registro **passado** saía antes das demais checagens; registro **futuro, não**.
Então cada parcela agendada ainda era avaliada para centro congelado, categoria,
placa ativa — como se fosse do mês que está fechando.

Agora a parcela agendada segue a mesma regra do registro histórico: existe na
base, não é assunto do fechamento de agora. **Quando a competência dela abrir**,
todas as checagens voltam a valer normalmente.

## A linha que não podia ser cruzada

A isenção é pelo **marcador de grupo** que `lancarIpvaAnual_` grava na
observação (`IPVA-A1B2C3D4`), não pelo tipo. Um **IPVA avulso** digitado com
data errada **continua sendo acusado**.

Isentar todo tipo `IPVA` seria mais simples e calaria o validador justamente
onde o erro de digitação é mais caro. Há teste de mutação para essa linha: com a
isenção larga, três provas falham.

## Contagem no filtro de pendências

"110 pendências" não diz o que fazer: pode ser um problema em 110 veículos ou
110 vezes o mesmo problema, e a ação é bem diferente. O filtro por tipo agora
mostra a contagem de cada um, ordenado do mais frequente — que é por onde se
tira mais de uma vez.

## Suíte

`conferir_agendado.js` — 16 provas.

Uma delas eu escrevi errado, pela terceira vez com a mesma raiz: afirmava
"com 55 veículos isso passa de 100 pendências". Era um **palpite sobre dados
que o teste não enxerga**, disfarçado de prova — e reprovou, porque o total
depende de quando cada IPVA foi lançado. Foi trocada pela propriedade
verificável: lançar na competência aberta gera `PARCELAS_IPVA_ - 1` parcelas
futuras, e o número cai de um em um a cada mês.


---

# V4.11 — comprovantes atrasados

Veículo que fica em loja abastece fora, e o comprovante chega um mês ou mais
depois. Hoje o formulário recusa data fora do período aberto — **e com razão**,
porque aceitar mudaria o total e o hash de um mês já assinado.

Só que recusar também significa que o papel some: a despesa nunca entra, e o
custo por km daquela loja fica melhor do que foi, para sempre.

## A saída: registro apartado

Aba nova **Comprovantes Atrasados**. O comprovante entra com a **data real do
abastecimento**, aparece no relatório de fora de período, e **não toca em
contabilidade nenhuma**. Quando alguém decidir, um botão o lança no período
**aberto**, guardando a data original na observação.

O veículo é resolvido por **placa ou patrimônio** — `resolverVeiculo_` já fazia
os dois.

### Duas coisas que ele não faz, de propósito

**Não mexe em competência fechada.** Nunca, por nenhum caminho. Se o registro
alterasse o mês de origem, ele deixaria de resolver o problema e passaria a ser
mais um jeito de mexer num mês assinado — exatamente o que o sistema inteiro
vem evitando.

**Não alimenta a série do odômetro.** O KM do papel fica guardado no
comprovante e aparece no relatório, mas inserir uma leitura antiga mudaria o KM
rodado e o km/l de um mês já apurado.

## Incorporar: a data é a de hoje, não a do abastecimento

Ao incorporar, o lançamento recebe a data de **hoje** (ou o último dia do
período, se hoje já passou dele). Usar a data verdadeira seria o reflexo
natural — e jogaria a despesa dentro de um mês fechado. A data real vai para a
observação, onde fica rastreável:

> `Comprovante atrasado de 14/09/2026 (competência 2026-09)`

Há mutação cobrindo essa linha: trocando para a data original, a prova de que o
lançamento cai no período aberto falha.

### O aviso dos litros não é enfeite

Trazer o combustível de setembro para novembro **sem o KM correspondente** piora
o km/l de novembro. A mensagem de incorporação diz isso com o número, porque
quem fecha o mês precisa saber explicar a variação.

## Regras do registro

- **Data dentro do período aberto é recusada.** Ali não há atraso, e o caminho é
  o lançamento normal. Duas portas para a mesma despesa acabariam sendo usadas
  pelas duas.
- **Data futura é recusada.** Comprovante atrasado é do passado.
- **Duplicata** (mesma placa + data + documento, ou + valor quando não há
  documento) é barrada, com opção de confirmar. Barrar sem saída travaria o
  trabalho: o atraso faz justamente perder a noção do que já entrou.
- **Descarte exige motivo** de 5 caracteres, e não apaga a linha — a trilha
  fica. Comprovante já incorporado não pode ser descartado: o lançamento existe
  na base, e desfazer é pela tela de exclusão, com justificativa.
- O comprovante é **movimento**, não cadastro: `zerarSistema_` o limpa em
  qualquer escopo, junto com os lançamentos.

## Relatório e alerta

O relatório mostra os pendentes agrupados por **competência de origem**, com o
valor e os litros que ainda estão fora do mapa. É o número que diz de quanto o
custo daquele mês está subestimado.

O alerta diário ganhou uma linha: comprovante parado é despesa real fora do
mapa, e quanto mais tempo fica, pior.

## Suíte

`conferir_comprovantes.js` — 45 provas. A central é a do bloco 2: **depois de
registrar, nenhum lançamento foi criado**. É a promessa inteira do módulo em uma
asserção.


---

# V4.11.1 — duas telas entregues e invisíveis

O usuário perguntou onde ficava o módulo de comprovantes atrasados. Não ficava
em lugar nenhum: **o item não aparecia no menu, para nenhum perfil — nem para o
ADMIN**. E o Orçamento, da V4.9, estava igual, havia semanas.

## Três listas que precisam concordar

Uma tela existe de verdade quando está em **três** lugares:

| Onde | Se faltar |
|---|---|
| `MENU` no App.html | não há item nem função |
| `TELAS_WEB` no Codigo.gs | `doGet` recusa abrir por `?pagina=` |
| `TELAS_POR_PERFIL` | **o item simplesmente não aparece** |

Eu havia acertado as duas primeiras nas duas versões, e esquecido a terceira nas
duas. E faltar na terceira **não dá erro nenhum**: o servidor responde certo, as
funções existem, os callbacks resolvem. A funcionalidade fica pronta e
inalcançável.

## Por que nenhuma suíte pegou

`conferir_callbacks.js` confere que toda chamada `google.script.run` tem função
no servidor — e tinha. As suítes de cada módulo exercitam o servidor — e ele
respondia. Nenhuma olhava o **acordo entre as três listas**, que vivem em
arquivos diferentes.

É o mesmo padrão pela quarta vez: **o teste olha um lado de um contrato que tem
dois ou três**. Os outros três casos estão registrados nas V4.9.5, V4.9.4 e
V4.10.

## `conferir_telas.js`

Lê o `MENU` do App.html, o `TELAS_WEB` e o `TELAS_POR_PERFIL` do Codigo.gs, e
cobra:

- toda tela do menu está em `TELAS_WEB`;
- toda tela do menu é **visível para o ADMIN**;
- a função que desenha cada tela existe;
- nenhum perfil aponta para tela inexistente (id morto esconde erro de
  digitação);
- **hierarquia**: ADMIN enxerga tudo que OPERADOR enxerga, que enxerga tudo que
  CONSULTA enxerga. Perfil mais alto com menos acesso é sempre esquecimento, e
  foi exatamente a forma deste defeito.

Por mutação, removendo `comprovantes` do ADMIN, três provas falham e **nomeiam a
tela e o rótulo**.

## Quem vê o quê agora

| Tela | CONSULTA | OPERADOR | ADMIN |
|---|:--:|:--:|:--:|
| Orçamento por centro | ✓ leitura | ✓ leitura | ✓ edita |
| Comprovantes atrasados | — | ✓ registra | ✓ incorpora / descarta |

CONSULTA fica fora dos comprovantes de propósito: a tela é um formulário de
registro, e o servidor recusaria esse perfil. Mostrar o que não funciona é
promessa falsa.


---

# V4.11.2 — revisão do módulo de pendências

Três defeitos, todos da mesma família: **estado que o operador escreveu sendo
perdido ou aplicado no item errado, sempre em silêncio**.

## 1. RESOLVIDO escondia problema que continuava existindo

`escreverConferencia_` preservava o status entre revalidações, e
`contarPendenciasConferencia_` ignora RESOLVIDO. Resultado: marcar um lançamento
sem centro de custo como resolvido — **sem corrigir nada** — tirava-o da
contagem para sempre, e o dado seguia errado.

Isso não era descuido de quem operava. Até a V4.9.1, marcar RESOLVIDO era a
**única** forma de limpar a tela, e o hábito ficou.

A regra agora separa dois casos, em `resolvidoSobrevive_`:

| Tipo de pendência | RESOLVIDO sobrevive? |
|---|---|
| Tem conserto por campo (`CORRECOES_PENDENCIA_`) | **Não.** Se o coletor ainda o encontra, não está resolvido |
| Não tem (ex.: "sem nenhum custo no período") | **Sim.** É julgamento do operador |

Quando volta a PENDENTE, a observação é preservada e ganha um prefixo dizendo
por quê: `↩ marcado como resolvido, mas o problema continua na base.`

O segundo caso tinha de continuar valendo: repetir todo mês o aviso de um
veículo que você sabe que está encostado ensina a ignorar a tela.

## 2. A chave da pendência incluía o número da linha

`chavePendencia_` usava o detalhe inteiro — e o detalhe começa com `linha 645`.

Excluir um lançamento **não apaga a linha**: sobe as de baixo uma casa (ver
`removerLinhaLancamento_`). Então **uma exclusão mudava a chave de todas as
pendências abaixo**, e o operador perdia status e observação de todas elas. Sem
erro, sem aviso, e sem relação aparente com o que ele tinha acabado de fazer.

O número saiu da chave. Duas pendências iguais do mesmo veículo passam a
compartilhar chave — e isso **não** as mistura: `casarAnteriores_` mantém uma
**fila por chave** e casa a primeira com a primeira, a segunda com a segunda. Um
mapa simples daria o mesmo status às duas, e marcar uma como EM ANÁLISE marcaria
a outra junto.

## 3. `webAtualizarPendencia` gravava sem conferir o alvo

Bastava alguém revalidar entre o carregamento da tela e o clique em Salvar para
a linha 12 virar outra pendência — e o status ia para o problema errado.

`webCorrigirPendencia` já reverificava o alvo desde a V4.9.1. Este endpoint, mais
antigo, tinha ficado de fora — e foi justamente por isso que eu não olhei para
ele na época. A tela agora manda junto o problema que estava exibindo, e o
servidor recusa quando não confere, nomeando os dois.

O parâmetro é opcional: sem ele a gravação ainda funciona, para não quebrar uma
aba já aberta no navegador durante a atualização.

## Suíte

`conferir_pendencias_estado.js` — 19 provas sobre **o que acontece entre duas
revalidações**, que é onde os três defeitos viviam. Uma mutação por defeito:

| Mutação | Provas que falham |
|---|---|
| número da linha de volta na chave | 3 |
| RESOLVIDO sempre sobrevive | 4 |
| alvo não reverificado | 4 |

## Também revisado, sem alteração

- `coletarProblemas_` (272 linhas) — a maior função do sistema, mas é uma
  sequência linear de checagens independentes; quebrar em partes espalharia o
  contexto sem reduzir complexidade.
- Os 48 `catch (e) {}` do arquivo: os do módulo são rollback de escrita e
  fallback de cache corrompido, ambos legítimos.
- `chavePendencia_` continua sem o ID do lançamento. Seria a chave ideal, mas
  exigiria um quinto elemento em ~25 `problemas.push`; a fila por chave resolve
  o mesmo problema sem esse risco.


---

# V4.11.3 — "mesmo corrigindo, as pendências permanecem ali"

Relato do usuário. Fui testar o caminho de ponta a ponta e ele **funciona**:
corrigir grava o campo e o coletor real para de reportar o problema. Então o
sintoma vinha de outro lugar — e eram duas coisas, mais uma falha do teste.

## A falha do teste, primeiro

`conferir_corrigir_pendencia.js` stubba `coletarProblemas_ = function () { return []; }`.
Ela prova que o campo foi gravado e que a revalidação foi **chamada** — e nada
mais. Se a gravação não satisfizesse a condição que gerou a pendência, a suíte
passaria igual.

É o mesmo vício pela quinta vez: **o teste olha um lado do contrato**. Aqui os
lados são `webCorrigirPendencia` (quem grava) e `coletarProblemas_` (quem
julga). `conferir_correcao_ponta.js` exercita os dois juntos, com o coletor de
verdade.

> Escrevendo o fixture, a planilha falsa mapeava `dados[linha - 2]`, o que serve
> para abas cujos dados começam na linha 2 e **quebra** na de Pendências, cujo
> cabeçalho fica na 2 e os dados na 3 — o cabeçalho entrava na lista como se
> fosse pendência. Fixture errado reprova código certo e, pior, pode aprovar
> código errado.

## Causa 1: a revalidação falhava em silêncio

`revalidarPendenciasSeguro_` devolvia um número ou `null`, e quem chamava
transformava o `null` numa frase mansa no **fim de uma mensagem de sucesso**:

> *"Detalhe gravado em Lançamentos, linha 35. Conferência não pôde ser refeita
> agora."*

O operador lê o verde, vê o item continuar na tela, e corrige de novo achando
que não pegou.

E a falha não é hipotética: `coletarProblemas_` chama
`garantirResumoAtualizado_`, que **lança** quando a aba Resumo está na largura
de uma versão anterior. **Quem colou o código novo sem rodar "Instalar /
atualizar" cai exatamente nisso** — e as V4.9, V4.10 e V4.11 todas pediram
reinstalação.

Agora o motivo sobe junto e a tela mostra em vermelho, dizendo que o campo
**foi** gravado, que o item vai continuar aparecendo, qual foi o erro, e o que
fazer.

## Causa 2: RESOLVIDO saía da contagem, não da lista

A tela listava todas as pendências, inclusive as resolvidas — para sempre. Quem
usava **Salvar + RESOLVIDO** em vez do botão **Corrigir** via o item
literalmente permanecer ali.

Agora há filtro por **Situação**, começando em *"Em aberto (esconde
resolvidas)"*, com a contagem de cada estado ao lado.

## Suíte

`conferir_correcao_ponta.js` — 14 provas. A central é a do bloco 2: depois de
corrigir, **o coletor real** não reporta mais o problema. O bloco 4 cobre a
falha de revalidação: campo gravado, aviso vermelho, motivo real e conserto
apontado.


---

# V4.11.4 — "corrigi e continua ali": agora o sistema explica

O caso que fechou o diagnóstico: **"Preço por quilo fora da curva"**, EMP YALE
N 02, R$ 63,90/kg num botijão de gás. O operador preenchia a quantidade,
clicava em Corrigir, e o item voltava.

Não era defeito de gravação. **A correção oferecida é a QUANTIDADE, e no caso
dele o errado era o VALOR.**

```
teto do Gás: R$ 30/kg
valor R$    63,90 -> precisa de mais de  2,1 kg
valor R$   200    -> precisa de mais de  6,7 kg
valor R$ 1.278    -> precisa de mais de 42,6 kg
valor R$ 3.000    -> precisa de mais de  100 kg   <- nenhum botijão resolve
```

Quando o valor está grosseiramente errado, **nenhuma quantidade plausível** tira
o lançamento da curva. O campo era gravado, a lista era refeita corretamente, e
o item reaparecia — sem uma palavra sobre o porquê.

## O conserto: dizer se resolveu

`pendenciaAindaPresente_` confere, depois da revalidação, se o **mesmo problema**
(aba + placa + tipo) continua sendo coletado. Quando continua, a resposta traz o
detalhe **recalculado**:

> Quantidade (kg) gravado em Lançamentos, linha 41. Mas o problema CONTINUA,
> agora assim: "linha 41 • R$ 66,67/kg em Gás...". O campo que você corrigiu não
> é o que está errado neste caso — ajuste o lançamento em "Corrigir / excluir
> lançamento".

E aparece em **amarelo ao lado do campo**, não como um toast verde que some em
sete segundos.

Quando resolve, também diz: *"Pendência resolvida."* — antes a mensagem só
informava o total em aberto, e o operador tinha de inferir.

Isso vale para **qualquer** correção, não só a do gás: sempre que o campo
oferecido não for o culpado, o sistema passa a dizer em vez de deixar o item
voltar calado.

## Nota sobre a fixture

A primeira versão do teste usou R$ 1.278 e corrigiu para 45 kg, esperando que
não resolvesse. Resolveu: 1.278 ÷ 45 = R$ 28,40/kg, logo abaixo do teto de 30.
O teste estava errado, não o código — e serve de lembrete de que o teto é um
instrumento grosso, calibrado para pegar erro de digitação, não para discutir
preço.

## Suíte

`conferir_correcao_ponta.js` passou para **21 provas**. Por mutação, removendo a
checagem de "ainda presente", 3 falham.


---

# V4.11.5 — a tela de pendências mandava a frota inteira 110 vezes

Medindo a lentidão relatada, o maior peso estava num lugar recente e específico.

`correcaoDaPendencia_` chamava `spec.opcoes()` **uma vez por pendência**. Com
110 pendências e 170 veículos, isso era:

- **110 reconstruções** da lista de placas por requisição;
- **110 cópias idênticas** dela viajando para o navegador.

```
110 pendências, 170 veículos, 30 centros
  listas repetidas em cada item :  117 KB
  listas enviadas uma vez       :   43 KB
  redução                       :   63%
```

A spec agora diz só o **nome** da lista (`'placas'`, `'centros'`,
`'categorias'`, `'tipos'`, `'naturezas'`, `'situacao'`), `webPendencias` manda
cada uma **uma vez**, e a tela resolve. `opcoesDaLista_` é o único lugar que
sabe montar cada uma.

Nome em vez de função também deixa a spec serializável — que é justamente o que
permite mandá-la ao cliente sem avaliar nada.

Guarda de regressão em `conferir_corrigir_pendencia.js`: nenhuma spec pode ter
`opcoes`, e toda spec de tipo `lista` precisa nomear a lista.

## Sobre modularizar

A pergunta veio junto: separar em vários arquivos deixaria mais rápido?

**Não.** No Apps Script todos os `.gs` são concatenados num escopo global único
e compilados juntos a cada execução — dois arquivos de 7.000 linhas custam o
mesmo que um de 14.000. E `HtmlService.createHtmlOutputFromFile` **inlina** o
conteúdo, então separar o HTML também não muda um byte do que o navegador
recebe.

Separar vale por **organização** — o editor do Apps Script fica lento num
arquivo de 14 mil linhas. É ganho de conforto, não de desempenho.


---

# V4.12 — cache da apuração de competência passada

Trocar o mês no Rateio ou no Orçamento recalculava **varrendo a base inteira a
cada clique**: `custoDiretoPorCentro_` chamava `calcularLinhasResumo_`, que lê
toda a aba Lançamentos.

O resultado é um mapa de ~30 centros. Cabe folgado no cache.

## A geração da base

O `CacheService` **não permite enumerar chaves**, então não dá para sair
apagando uma a uma na hora de invalidar. A validade vem de um número —
a **geração** — que entra no nome da chave:

```
APUR_2026-09_47
```

Quando a base muda, a geração avança para 48 e **todas** as chaves antigas
viram inalcançáveis de uma vez, sem apagar nada.

O avanço fica em `invalidarCacheInicio_`, que o próprio código já documentava
como *"ponto único já chamado por todos os 25 caminhos que alteram dados"* — e
que o `onEdit` também chama, então **edição manual na planilha invalida
igual**.

`avancarGeracaoBase_` é idempotente na execução: os 25 caminhos podem chamar à
vontade, a propriedade é escrita **uma vez**.

## A competência aberta não entra nisso

Ela continua vindo do Resumo, que já está calculado e cacheado por outro
caminho. Só o passado é cacheado aqui.

## Falha segura

Se a propriedade da geração não puder ser lida, **não se cacheia nada** — lento,
nunca errado.

> A primeira versão devolvia `'sem-propriedade-' + Date.now()`, achando que uma
> chave única resolveria. Duas chamadas no mesmo milissegundo geram a **mesma**
> chave, e aí o cache volta a valer sem ninguém garantir que a base não mudou.
> Além disso enchia o cache de entradas inalcançáveis. O teste pegou.

## Cache que falhava em silêncio

Pendência da auditoria, resolvida junto. Todos os `cache.put` estavam em
`try {} catch (e) {}` mudo: se o payload passasse de 100 KB, o cache
simplesmente parava de existir, o aquecimento por gatilho virava inútil, e a
lentidão voltava **sem nenhum sinal de por quê**.

`guardarNoCache_` agora registra no log, com o tamanho:

> `cache painel inicial: 112 KB passa do limite de 88 KB; esta chave deixou de
> ser cacheada e a tela vai recalcular sempre.`

## Dá para ver funcionando

A mensagem do Rateio e do Orçamento passou a dizer *"Competência encerrada,
**lida do cache**"* em vez de *"recalculada a partir dos lançamentos"*.

## Suíte

`conferir_cache_apuracao.js` — 26 provas. A central não é "ficou rápido": é que
o número do cache é **idêntico** ao recalculado, centavo por centavo. Cache que
devolve número diferente é pior que cache nenhum, porque o erro aparece só na
divisão entre as lojas, que é onde ninguém confere.

Três mutações:

| Mutação | Provas que falham |
|---|---|
| sem avançar a geração ao gravar | 3 |
| chave sem a competência | 2 — *agosto recebe os números de setembro* |
| geração avança sem a trava por execução | 1 |


---

# V4.12.1 — o laço do RESOLVIDO

Terceiro relato de *"resolvo a pendência e ela permanece ali"*. Três relatos do
mesmo sintoma não são três defeitos: são um **desenho confuso**, e o culpado era
meu.

## O laço

A tela tem **duas** ações que parecem resolver:

| Ação | O que faz |
|---|---|
| **Corrigir** | grava o campo na base; a pendência some de verdade |
| **Status RESOLVIDO + Salvar** | só anota um julgamento; o dado não muda |

E o dropdown oferecia RESOLVIDO para **toda** pendência, inclusive as que têm
conserto por campo. Aí a V4.12 fechava o ciclo:

1. O operador marca RESOLVIDO em "Oficina sem detalhe".
2. O item some da lista — o filtro de situação esconde resolvidas.
3. Na revalidação seguinte, a V4.11.2 **reverte para PENDENTE**, porque o
   coletor ainda encontra o problema.
4. O item reaparece, agora com o `↩ marcado como resolvido, mas o problema
   continua na base`.

Da cadeira do operador: resolveu, sumiu, voltou. Três vezes.

A reversão da V4.11.2 está certa — o dado **continua** errado. O erro foi
**aceitar** a marcação para depois desfazer pelas costas.

## O conserto: recusar na hora, e dizer por quê

`webAtualizarPendencia` agora **recusa** RESOLVIDO quando o problema tem
conserto por campo:

> Esta pendência tem conserto: use o botão **"Corrigir"** acima, que grava o
> campo na base. Marcar como resolvida não muda o dado — o sistema encontra o
> problema de novo na próxima verificação e traz o item de volta. Se não for
> para corrigir agora, deixe em **"EM ANÁLISE"**.

E o dropdown **não oferece mais** RESOLVIDO nesses casos: só PENDENTE e EM
ANÁLISE. Oferecer o que vai ser desfeito era a origem do laço.

Onde RESOLVIDO é julgamento legítimo — "Sem nenhum custo no período" num
veículo encostado — **nada muda**.

A regra é a mesma dos dois lados, `resolvidoSobrevive_`. Se o servidor recusasse
por um critério e a revalidação revertesse por outro, um dos dois estaria
mentindo.

## Suíte

`conferir_pendencias_estado.js` passou para **28 provas**. Por mutação,
aceitando RESOLVIDO sempre, 5 falham.


---

# V4.12.2 — a conta inteira, não só o resultado

O aviso da V4.11.4 funcionou e trouxe a informação que faltava:

> *Quantidade (kg) gravado em Lançamentos, linha 41. Mas o problema CONTINUA,
> agora assim: "linha 41 • **R$ 63.90/kg** em Gás..."*

**R$ 63,90/kg antes e depois.** Se a quantidade tivesse mudado, a razão mudaria
— então a quantidade digitada era a que já estava lá, e o errado é o **valor**.

O sistema chegou ao diagnóstico certo, mas obrigou o operador a deduzi-lo. E
pior: ofereceu corrigir a quantidade, o que o levou a digitar o mesmo número e
concluir que nada funciona.

## O conserto

O detalhe passou a mostrar **os dois números**:

```
antes:  linha 41 • R$ 63.90/kg em Gás
agora:  linha 41 • R$ 1278,00 / 20 kg = R$ 63,90/kg em Gás
```

Os dois casos ficam distinguíveis de relance:

| Detalhe | O que está errado |
|---|---|
| `R$ 1.278,00 / 20 kg` | o **valor** — botijão de 20 kg não custa mil e duzentos |
| `R$ 63,90 / 1 kg` | a **quantidade** — lançaram o botijão como 1 unidade |

A ajuda do campo também parou de sugerir que a quantidade é sempre a culpada:
*"só preencha se a QUANTIDADE for a errada… se o errado for o valor, use
Corrigir / excluir lançamento"*.

## Efeito colateral conhecido

O texto do detalhe entra na chave da pendência, então as de preço fora da curva
voltam a **PENDENTE** na primeira revalidação, perdendo status e observação.
São poucas, e o texto novo é o que torna cada uma resolvível.


---

# V4.13 — corrigir onde o problema aparece

Com os dois números à vista, o caso ficou claro:

```
linha 41 • R$ 1278,00 / 20 kg = R$ 63,90/kg em Gás
```

20 kg está certo — é um P20. **R$ 1.278 é que está errado.** E o sistema
mandava o operador para outra tela, achar a mesma linha de novo.

> *"ao corrigir aqui ele já deve corrigir o lançamento"*

Tem razão. A pendência de preço fora da curva passou a oferecer **os dois
campos**: Valor e Quantidade.

## Correção com mais de um campo

O mecanismo era de um campo só, porque a maioria das pendências tem um culpado
óbvio: falta o detalhe, falta a NF, falta o centro. **Preço fora da curva não
tem** — a razão pode estar errada pelos dois lados, e só quem olha o lançamento
sabe qual.

As specs de um campo continuam escritas do jeito curto; `camposDaSpec_` as
embrulha numa lista de um. Um formato só, dois casos.

**Preenche-se só o campo errado.** Exigir os dois obrigaria a redigitar um
número que já está certo — que é como se erra um número certo.

A versão **em litro** também ganhou os dois campos. Antes ela não oferecia nada,
justamente porque não havia como escolher um culpado.

## Uma armadilha que o teste pegou

O endpoint aceitava o valor como escalar. Com dois campos, um escalar vindo de
uma **aba antiga do navegador** iria para o primeiro campo — gravando no
**Valor** o número que o operador digitou como **Quantidade**, e estragando um
dado que estava certo.

Agora escalar só vale quando a spec tem um campo. Nas de dois, é recusado com
pedido de recarregar a página. Por mutação, aceitando o escalar, a prova falha.

## Suítes

`conferir_unidade_quantidade.js` 33 provas, `conferir_correcao_ponta.js` 23,
`conferir_corrigir_pendencia.js` 61.


---

# V4.13.1 — a tela de pendências parou de carregar

Regressão minha, da V4.13.

Ao reescrever `blocoCorrecao` para aceitar vários campos, o recorte foi de
`function blocoCorrecao` até `function corrigirPendencia` — e entre as duas
moravam **`blocoAcao` e `rodarAcaoPendencia`**, que sumiram junto. A chamada
`blocoCorrecao(p) + blocoAcao(p)` continuou lá.

`ReferenceError: blocoAcao is not defined` derruba a renderização inteira: a
tela não carrega, e o erro só aparece no console do navegador.

## Por que nenhuma suíte pegou

| Suíte | O que confere |
|---|---|
| `conferir_callbacks.js` | só as cadeias `google.script.run` |
| checagem de handlers | só `onclick`/`onchange` inline |

**Chamada JavaScript comum, dentro do código de renderização, não era conferida
por ninguém** — e é a forma mais comum de chamar função que existe.

Sexta ocorrência do mesmo padrão: a verificação olha um lado do contrato.

## `conferir_funcoes_html.js`

Confere que toda função chamada no HTML existe no HTML. Por mutação, apagando
`blocoAcao`, ela falha nomeando a função.

### Duas tentativas antes de acertar

**Varrer `nome(` direto** acusou 27 funções inexistentes — todas palavras dentro
de frases em português: `"1 pendência ("` virava uma chamada a `ncia()`.

**Remover strings e comentários antes** foi pior: um literal de expressão
regular como `/[&<>"]/g` **tem aspas dentro**, o varredor achou que abria uma
string e engoliu o resto do arquivo. De 194 funções definidas passou a enxergar
2.

Escrever um tokenizador de JavaScript seria desproporcional. A regra final
considera só nomes com a cara das funções deste projeto — minúscula inicial,
maiúscula no meio, seis letras ou mais (`blocoAcao`, `rodarAcaoPendencia`).
Palavra solta em frase não passa nesse crivo.

O preço é não cobrir funções de nome curto ou todo minúsculo. Aceito: o defeito
real tinha a cara que a regra pega, e uma regra que dispara 27 falsos positivos
não é lida por ninguém.


---

# V4.14 — a nota de GLP vem em unidades, não em quilos

A nota que o usuário mandou fechou o caso:

```
GLP ENVASADO EM BOTIJAO DE 20 KG   UN   Qtde 6   unit. 213,00   total 1.278,00
```

**6 botijões × 20 kg = 120 kg.** R$ 1.278 ÷ 120 = **R$ 10,65/kg** — preço normal.

O lançamento tinha **20 kg**. Nem o valor nem o preço estavam errados: quem lê
*"BOTIJAO DE 20 KG"* na descrição digita 20 e **perde o "Qtde 6"**. O erro
multiplica o preço por quilo por exatamente 6.

Esse não é descuido de operador. É o sistema pedindo uma unidade que a nota não
traz, e deixando a multiplicação por conta de quem digita.

## A multiplicação passou a ser do sistema

Quando o tipo é medido em quilos, aparece uma calculadora embaixo do campo:

```
Quantidade (kg) [ 120 ]
  A nota vem em unidades? Converta:
  [ 6 ] × [ 20 kg (P20) ▾ ]  = 120 kg
```

Ela escreve **direto** no campo que vale. Mostrar o resultado para o operador
copiar seria recriar o mesmo erro um passo adiante.

Está nos três lugares onde se informa quantidade: o formulário do app, o
formulário lateral da planilha, e o campo de correção da pendência.

## A ajuda mudou de conselho

Antes: *"quilos do botijão: P13 = 13, P20 = 20, P45 = 45"* — que é
**exatamente** o que leva a digitar 20.

Agora: *"o TOTAL em quilos: 6 botijões de 20 kg = 120 kg"*. Os tamanhos foram
para o seletor da calculadora, onde não dá para errar.

## Para a linha 41

Com a calculadora: `6 × 20 kg` → 120. A pendência some, porque R$ 10,65/kg está
dentro da curva.

## Suíte

`conferir_unidade_quantidade.js` — 41 provas, agora com a nota real como
cenário. Uma delas prova a aritmética do engano: perder o "Qtde 6" multiplica o
R$/kg por exatamente 6.


---

# V4.14.1 — a correção certa sendo acusada de errada

A mensagem que entregou o defeito:

> KM / horímetro gravado em Odômetro, **linha 133**. Mas o problema CONTINUA,
> agora assim: "**linha 178** • 2026-10 • 13/10/2026: 681547 < 698573".

Duas linhas diferentes. O operador corrigiu a 133, a 133 foi resolvida, e o
sistema anunciou fracasso mostrando a **178** — outra ocorrência, do mesmo
veículo, que nunca foi tocada.

## A causa

`pendenciaAindaPresente_` casava por **aba + placa + problema**, ignorando a
linha. Um veículo com duas leituras retrocedidas tem **duas** pendências do
mesmo tipo; corrigir uma encontrava a outra e culpava a correção que tinha dado
certo — mandando consertar o que já estava consertado.

A checagem passou a comparar também **a linha alvo**. Dentro da mesma
requisição as linhas não se deslocam, porque correção nunca apaga linha — então
comparar o número é seguro aqui, diferente da chave da pendência, que atravessa
exclusões e por isso não pode usá-lo (ver V4.11.2).

## E quando sobram outras

Em vez de calar, a mensagem conta:

> Pendência resolvida. **Este veículo ainda tem 1 outra(s) pendência(s) do mesmo
> tipo, em linhas diferentes** — cada uma com o seu botão na lista.

São itens próprios, cada um com a sua correção. Não são culpa desta.

## Suíte

`conferir_correcao_ponta.js` — 28 provas, com o cenário de duas ocorrências do
mesmo tipo no mesmo veículo. Por mutação, voltando a ignorar a linha, 3 falham
com a mensagem na forma exata que o usuário viu.


---

# V4.15 — o ID do lançamento na pendência

Sugestão do usuário: mostrar o ID para poder identificar o registro e ir
corrigi-lo. O ID já existia — `LAN-20261013-A1B2C3D4` — e só não aparecia.

Implementando, ficou claro que ele resolve algo maior.

## O número da linha é uma coordenada que envelhece

Excluir um lançamento não apaga a linha: **sobe as de baixo uma casa**
(`removerLinhaLancamento_`). A partir daí, "linha 39" aponta para outra
despesa — e a correção gravaria no vizinho.

Até aqui a defesa era conferir se a linha ainda pertencia ao mesmo veículo
(V4.9.1). Funciona contra o pior caso, mas **recusa** quando dava para acertar,
e não protege quando o vizinho é do mesmo veículo.

O ID identifica o **registro**. `alvoCorrecaoPendencia_` agora procura por ele e
encontra o alvo certo mesmo depois do deslocamento. Quando o ID não está mais na
base, recusa dizendo que o lançamento pode ter sido excluído — em vez de gravar
em qualquer um.

## Carimbado num lugar só

`carimbarIds_` roda no fim de `coletarProblemas_` e acrescenta o ID ao detalhe
de toda pendência de Lançamentos:

```
antes:  linha 39 • classifique como peça, serviço ou outra natureza
agora:  linha 39 • LAN-20261013-A1B2C3D4 • classifique como peça, serviço...
```

Num lugar só, e não nos ~25 `problemas.push`: cada um teria de lembrar do ID, e
bastaria um esquecer para aquela pendência virar a única sem alvo estável —
sem erro nenhum.

A tela mostra embaixo do campo: *"ID do lançamento: LAN-… — é por ele que você
acha a despesa em Corrigir / excluir lançamento."*

## Reconhecimento tolerante, de propósito

O regex aceita `LAN-` seguido de qualquer coisa, não só o formato atual
`LAN-AAAAMMDD-XXXXXXXXXX`.

Um regex preso ao formato faria qualquer ID diferente — base antiga, migração,
ID digitado à mão — **cair em silêncio** de volta para o número da linha, que é
justamente o alvo frágil que o carimbo veio substituir. E falhar assim não dá
erro: só volta a gravar no vizinho depois de uma exclusão. O teste pegou isso
com um ID de fixture fora do padrão.

## Efeito colateral

O detalhe mudou, e ele entra na chave da pendência: **todas voltam a PENDENTE
na primeira revalidação**, perdendo status e observação. Acontece uma vez.

## Suíte

`conferir_correcao_ponta.js` — 37 provas. A central: exclui-se o lançamento de
cima, o de problema sobe uma linha, e a correção **ainda acerta o registro
certo**. Por mutação, voltando a mirar pelo número da linha, 5 falham — uma
delas gravando no vizinho.


---

## V4.15.3 — o alerta diz do que é feito o custo

A SXC 9I77 (Saveiro, patrimônio 10042709) apareceu no bloco *"Consumo fora da
curva"* com **R$ 6,103/km, mais que o dobro da mediana da categoria**. Fui
verificar na consulta do veículo:

| | |
|---|---|
| custo total | R$ 2.782,85 |
| oficina | R$ 2.130,00 — **77% do total** |
| combustível | R$ 542,71 |
| km rodados | 456 |
| km/l | 5,23 — normal para uma Saveiro |

Não era erro de dado: 87,140 L a 5,23 km/l dão exatamente os 456 km, então não
faltava leitura de odômetro. A aritmética do alerta também estava certa. O que
estava errado era **o que ele comunicava**: uma manutenção pontual de R$ 2.130
diluída em 456 km dá R$ 4,67/km só de oficina, e isso chega como se fosse
problema de consumo. Para descobrir que não era, foi preciso abrir a consulta
de um veículo por vez.

O alerta já tinha essa informação na mão e não contava. Agora conta:

> SXC 9I77 — custo variável R$ 5,861/km, mais que o dobro da mediana da
> categoria (R$ 2,150) — 80% é oficina (R$ 2.130,00 em 456 km)

`rubricaDominante_()` devolve a maior das oito colunas de custo variável com a
participação dela. Quem lê separa num relance "mês atípico" de "problema
estrutural", sem sair do e-mail.

Duas observações que ficam registradas, não viraram código:

1. **O piso de rodagem passou raspando.** O piso é 20% da mediana de km da
   categoria; a Saveiro rodou 456 km. Num mês de rodagem um pouco menor ela
   teria sido excluída da avaliação e o aviso nem existiria. O piso continua
   como está porque não tenho evidência de qual valor seria melhor — mas é um
   limiar que decide por pouco, e isso merece ser dito.
2. **A categoria é grossa demais.** É uma Saveiro classificada como *Leve* mas
   lotada em EMPILHADEIRAS: um veículo de apoio de pátio, comparado contra
   leves que rodam milhares de km. É o mesmo ponto de granularidade dos grupos
   de frota (V4.10), agora com um caso concreto.

Também vale saber, para não estranhar a diferença: a tela de consulta mostra
`R$ POR KM` como **total ÷ km**, enquanto o alerta usa **custo variável ÷ km**.
Nesta Saveiro os dois batem só porque ela não tem custo fixo no mês.

Provas: `conferir_alerta_diario.js` subiu de 46 para 57, com a fixture
reproduzindo a SXC 9I77. Duas mutações confirmaram a cobertura — tirar a
composição derruba 5 provas, ignorar linha de custo zero derruba 1.

## V4.16.0 — manutenção é evento, não rotina

Você olhou a SXC 9I77 e disse a frase que faltava: *"provavelmente esse valor
está fora porque foi feita manutenção preventiva no mês; como é algo que não é
feito sempre, por isso o valor ficou fora do padrão"*.

Isso não é uma observação sobre um veículo. É o **defeito do critério**.

O alerta somava oito colunas de custo variável e dividia pelo km do mês.
Combustível, lubrificante, ARLA, lavação, pedágio e gás acontecem *todo mês* e
crescem com o km — a mediana mensal sabe julgar isso. Oficina e pneus
acontecem *por evento*: uma preventiva de R$ 2.130 não é o custo daquele mês,
é o custo de vinte mil quilômetros que calhou de ser pago naquele mês. Jogar
os dois na mesma conta julga um evento com a régua de uma rotina, e o
resultado é garantido: **todo veículo que faz a preventiva vira anomalia no mês
em que a faz.**

### O que mudou

`R_CUSTO_VARIAVEL_` foi particionado em dois:

| | colunas | julgado como |
|---|---|---|
| `R_CUSTO_RODAGEM_` | combustível, lubrificante, ARLA, lavação, pedágio, gás | desvio contra a mediana da categoria |
| `R_CUSTO_MANUTENCAO_` | oficina, pneus | **corte por valor**, em bloco próprio |

O bloco "Consumo fora da curva" passa a medir só rodagem e a dizer *custo de
rodagem* em vez de *custo variável* — o nome agora corresponde ao que a conta
faz. A SXC 9I77 sai dele: a rodagem dela é R$ 1,43/km, dentro da faixa.

O bloco novo, "Manutenção do mês", mostra o mesmo gasto sem chamá-lo de
anomalia:

> SXC9I77 (Leve) — R$ 2.130,00 em oficina e pneus — R$ 4,67/km se diluído nos
> 456 km do mês
>
> — corte por valor (acima de R$ 1.500,00), não por desvio: manutenção é gasto
> por evento, e um mês caro pode ser simplesmente a preventiva que venceu.

Não há critério estatístico nele **de propósito**. Comparar gasto por evento
contra a mediana mensal dos outros veículos seria repetir o mesmo erro num
bloco novo. É um corte por valor, e o texto diz que é um corte por valor. O
piso vem do parâmetro `MANUTENCAO_RELEVANTE_RS` (padrão R$ 1.500); zero
desliga o bloco.

`paramOuPadrao_` lê parâmetro que pode não existir: `param_` lança quando o
nome falta, e está certo — mas um parâmetro *novo* falta em toda planilha que
ainda não rodou o Instalar, e derrubar o alerta por isso trocaria um aviso
útil por silêncio.

### O que NÃO foi resolvido

**O sistema ainda não sabe o que é preventiva.** `NATUREZAS_OFICINA` tem onze
opções — *Peça de reposição*, *Freios / suspensão*, *Motor / transmissão*… —
e todas respondem **o que foi feito**. Nenhuma responde **por que**. Preventiva
versus corretiva é um eixo que simplesmente não existe no cadastro, e é por
isso que o alerta não conseguia distinguir os dois casos sozinho: a informação
nunca foi pedida. Separar rodagem de manutenção tira o falso alarme, mas é
contorno — a classificação certa continua faltando.

**O alerta é diário e o resumo é mensal.** A SXC 9I77 vai aparecer no bloco de
manutenção todos os dias até virar a competência. Isso já valia para o bloco
de consumo, então o comportamento não piorou, mas agora há uma linha a mais
repetindo. Resolver exigiria o alerta lembrar o que já avisou.

### Provas

`conferir_alerta_diario.js`: 57 → 72. Sete mutações, sete pegas — devolver
oficina à rodagem derruba 11 provas.

Uma correção no método, não no código: a verificação de mutação contava linhas
`FALHA`, e isso dá zero tanto quando a prova não pega quanto quando o arquivo
nem compila. Dois casos opostos com a mesma aparência. Passou a olhar o código
de saída e a separar `SOBREVIVEU` de `CRASH`. Na primeira rodada honesta, duas
provas que pareciam boas eram fracas: uma rebentava com `TypeError` em vez de
reprovar, e a de `paramOuPadrao_` passava pelo ramo do `undefined` sem nunca
entrar no `catch` que dizia testar — `param_` não lança no ambiente de prova.
Agora o teste força o lançamento.

## V4.16.1 — por que só a depreciação estava lenta

A pergunta certa não era "por que o sistema está lento". Era **por que só este
botão**. Lançar uma despesa é instantâneo; gerar a depreciação do mês demorava.
A diferença entre os dois: lançar insere **uma** linha, a depreciação insere
**uma por veículo** — 167 de uma vez.

Então o custo tinha de ser algo que roda por linha inserida. Era:

```js
const classDep = faltantes.map(function (i) {
  const c = classificacaoVeiculoAtual_(i.placa);   // ← uma vez por veículo
  return [c.centro, c.categoria];
});
```

`classificacaoVeiculoAtual_` chama `resolverVeiculo_`, que **varre a lista
inteira de veículos** — várias passagens, com `normalizaPlaca_` e
`chavePatrimonio_` em cada linha. Com 167 veículos: 167 varreduras de 167
linhas, ~100 mil operações de string, só para descobrir o centro de custo de
veículos cuja linha **já estava em mãos** no laço anterior.

### Conserto 1: não procurar o que já se tem

`statusDepreciacaoMensal_` já percorre os veículos para montar os itens. Ele
passou a colher ali mesmo o centro e a categoria prontos para o lançamento
(`centroLancamento`, `categoriaLancamento`), e a geração só os copia. De
167 varreduras para zero.

De quebra, CENTRO e CATEGORIA são as colunas logo após OBSERVAÇÃO, então o
bloco inteiro vai numa escrita só em vez de duas.

### Conserto 2: memo amarrado à identidade do cache

O mesmo padrão existe em mais quatro laços — importação, reparo de colagem
deslocada, reclassificação e `onEdit` em bloco. Em todos, placas se repetem,
então um memo por execução resolve.

O risco é óbvio: **memo velho grava centro errado dentro do lançamento, em
silêncio.** E onze pontos do código zeram `VEICULOS_EXEC_CACHE_`. Um memo com
invalidação própria teria de ser limpo nos onze, e o décimo-segundo ponto
escrito no futuro quebraria sem avisar — a família de defeito que este projeto
já pegou seis vezes.

Por isso o memo é amarrado à **identidade do array** de veículos:

```js
if (!CLASSIF_MEMO_EXEC_ || CLASSIF_MEMO_EXEC_.fonte !== fonte) {
  CLASSIF_MEMO_EXEC_ = { fonte: fonte, mapa: {} };
}
```

Quando o cache cai, a releitura devolve um array **novo**, a identidade muda e
o memo se descarta sozinho. **Não existe segundo lugar para lembrar.**

A chave leva prefixo `#` para uma placa chamada `__proto__` não alcançar o
protótipo, e o retorno é sempre cópia — quem mexer no objeto devolvido não
envenena o memo.

### O que NÃO foi tocado

`atualizarResumoSeguro_()` e `escreverConferencia_(coletarProblemas_())`
continuam rodando depois da escrita, e são caros. Mas são **custo
compartilhado**: os mesmos dez caminhos de mutação os chamam, e lançar uma
despesa avulsa é rápido mesmo passando por eles. Não eram a causa de só a
depreciação estar lenta. Se ainda demorar depois desta versão, é aí que está o
próximo corte — e aí vale medir antes.

### Provas

`conferir_classificacao_memo.js`, **24 provas**. Oito mutações, oito pegas.
A que mais importa é a terceira seção: trocar o centro do veículo no cadastro,
zerar o cache, e exigir que a consulta devolva o **novo** centro. Fazer o memo
sobreviver à troca derruba 4 provas.

Duas correções no próprio método de teste, ambas na mesma direção — **um duplê
mais permissivo que a coisa real aprova código que quebra em produção**:

1. O `getRange` falso ignorava as dimensões pedidas. Gravar 9 colunas numa
   faixa de 7 lança no Apps Script, e passava aqui. Agora o duplê confere.
2. A prova de que o retorno é cópia mutava o resultado da **primeira**
   chamada — que é cópia nos dois casos, com memo ou sem. O envenenamento só
   é possível a partir da segunda. A prova passava sem provar nada.

## V4.17.0 — medir os módulos, e não achar

Depois da depreciação, a pergunta óbvia: **onde mais isso acontece?** Achar
por leitura não escala em 529 funções. Então duas ferramentas.

### `medir_modulos.js` — os números

Banco com frota sintética do tamanho da real (170 veículos, 20 mil
lançamentos, 8 mil odômetros). Não substitui medir na planilha — aqui não há
I/O de Sheets. Mede o **custo de CPU em JavaScript puro**, que é justamente
onde mora o custo quadrático, o único que piora sozinho conforme a base cresce.

Primeira rodada, antes de mexer:

| | antes | depois |
|---|---|---|
| IPVA de toda a frota (a tela) | **1.073 ms** | 7,8 ms |
| `kmDoDia_` × 300 (tela de correção) | **1.149 ms** | 14,6 ms |
| `alertasOdometroEIpva_` | **1.017 ms** | 259 ms |
| `alertasConsumo_` | 0,9 ms | — |

E o Apps Script é várias vezes mais lento que o Node, então um segundo aqui
são muitos lá.

As duas causas eram a mesma de sempre, em funções diferentes:

- **`gruposIpvaDaPlaca_`** varria TODOS os lançamentos uma vez POR PLACA. A
  tela de IPVA e o alerta diário percorrem a frota chamando isso: 167 × 20.000
  = 3,3 milhões de iterações, com regex de placa em cada uma.
- **`kmDoDia_`** varria os 8 mil registros de odômetro a cada consulta, e a
  tela de correção consulta até 300 vezes.

Ambas viraram **índice construído numa passagem**, amarrado à identidade do
array de origem — o mesmo truque do memo da V4.16.1: quando o cache de
execução cai, a releitura devolve um array novo e o índice se descarta
sozinho. Sem segundo lugar para lembrar.

No `kmDoDia_` a regra de negócio é sutil e foi preservada: o KM só vale
quando há **uma** leitura daquela placa naquele dia; duas são ambíguas e
devolvem vazio. O índice guarda a contagem, não só o valor.

### `conferir_desempenho.js` — a guarda

Lê o código-fonte e procura varredura de coleção dentro de laço, e escrita de
planilha dentro de laço. Nenhum dos dois aparece em teste de comportamento: o
resultado continua **certo**, só demora. Uma lista congela os oito casos
restantes com o motivo de cada um; o valor está em reprovar o que for novo.

### O que o medidor revelou sobre a V4.16.1

O memo da classificação tem um custo que eu não tinha medido:

| | com memo | sem memo |
|---|---|---|
| 170 placas **distintas** | 44,9 ms | 23,8 ms |
| mesma placa × 1000 | **0,6 ms** | 136,3 ms |

O memo **custa o dobro** quando nenhuma placa repete. Os quatro laços que
ainda o chamam (importação, reparo, reclassificação, `onEdit`) têm repetição
pesada, e o caso de placas distintas era a depreciação, que não chama mais.
Fica registrado em vez de escondido.

### Ainda não resolvido

`excluirVeiculo_` apaga os lançamentos **um por vez**, cada um com leitura e
remoção de linha. Veículo com histórico longo demora. Está na lista de
aceitas da guarda com essa anotação, e junto com a suíte do fechamento na
lista de pendências.

### Três erros meus, todos na mesma direção

1. **O primeiro varredor deu 89 achados**, quase todos falsos: ele não sabia
   que os leitores de base são cacheados por execução. Um relatório cheio de
   falso positivo é um relatório que ninguém lê.
2. **A propagação transitiva marcava `numBR_` como varredor.** Trocada por
   exigir que a função varra ela mesma.
3. **O banco mediu índice quente.** O `__zerarCaches` limpava dois caches e
   não os índices novos, então a medição saiu lisonjeando a própria mudança
   que deveria julgar: "0,0 ms". Com todos os caches zerados por volta, os
   números honestos são os da tabela acima — bons, mas não mágicos.

E um erro de teste: a prova da normalização de placa esperava `abc-1d23` →
`ABC1D23`. `normalizaPlaca_` troca traço por **espaço**: o certo é `ABC 1D23`.
O teste estava errado, não o código.

### Provas

`conferir_indices_execucao.js` (30) e `conferir_desempenho.js` (6). Oito
mutações nos índices, oito pegas — incluindo as duas que mais importam: fazer
o índice sobreviver à mudança dos dados, e ignorar a ambiguidade de duas
leituras no mesmo dia. Total do projeto: **469 provas**.

## V4.18.0 — módulo de depreciação

O arquivo que você mandou (`depreciação mes 08.xlsx`) tem duas abas, cabeçalho
na linha 3, duas colunas — **Bem** (patrimônio) e **Valor** — e uma linha
`Total Geral` no fim de cada aba. São 128 veículos e 1 máquina, R$ 290.076,89.

Três decisões suas, antes de construir:

1. **Continua virando lançamento.** O menu é a porta de entrada; daí o sistema
   gera os lançamentos como sempre. Resumo, rateio, fechamento e lacre de
   integridade não foram tocados.
2. **O campo do cadastro vira reserva.** O valor do arquivo manda; bem que não
   veio no arquivo do mês é depreciado pelo cadastro, **e a tela diz que usou
   a reserva**. Nada deixa de ser depreciado por esquecimento no arquivo.
3. **A competência é escolhida na importação**, com a aberta pré-selecionada.

### Como funciona

Aba nova `Depreciação Mensal`: competência, bem, placa, valor, origem
(IMPORTADO / MANUAL), atualizado em, responsável. Gravar uma competência
**substitui** o que havia dela — importar o mesmo arquivo duas vezes dá o
mesmo resultado.

A importação é em dois passos de propósito: **conferir** e só então **gravar**.
O primeiro passo lê e mostra `129 bens • R$ 290.076,89` para ser comparado com
o "Total Geral" do arquivo. O motivo está abaixo.

### O ponto perigoso: o ponto

Em pt-BR, `4.310` é quatro mil e trezentos; `470.04` é quatrocentos e setenta.
O mesmo caractere, dois significados. Ler errado **multiplica ou divide a
depreciação por mil, e não dá erro nenhum** — grava o número errado e segue.

A regra, nesta ordem: havendo vírgula e ponto, o último é o decimal; só
vírgula, é decimal; só ponto com exatamente 3 dígitos depois, é milhar; só
ponto, é decimal. Cobre as duas colagens (pt-BR `4.310,09` e en-US `470.04`).

Mas heurística boa ainda é heurística, e por isso existe o passo de
conferência. O arquivo convenientemente traz o `Total Geral` para comparar.

### As outras armadilhas do arquivo

- **`Total Geral` não é um bem.** Importá-la criaria um bem fantasma de
  R$ 286.810. Ela e os cabeçalhos saem calados; o resto que não entra é
  listado com o motivo, porque linha sumindo em silêncio é como se perde um
  bem inteiro sem ninguém notar.
- **Bem sem cadastro de veículo não entra.** Sem placa o custo não tem centro
  para onde ir, e um valor gravado que nunca vira lançamento faria o total da
  tela divergir do Resumo. Volta na lista, para ser cadastrado.
- **Patrimônio repetido em dois veículos** não escolhe um no escuro: avisa.
- **Bem repetido na colagem** tem os valores **somados**, e isso é contado e
  dito — para o total continuar batendo com o arquivo.
- **Ruído de ponto flutuante** (`470.0400000000001`) arredonda a centavo.
- **Competência fechada** é recusada: ela tem lacre, e mexer no valor depois
  faria o lacre deixar de bater sem ninguém ter editado um lançamento.

### "Depreciação" sai do formulário, sem invalidar o passado

`TIPOS_DESPESA` **continua inteiro**. Há milhares de lançamentos de
Depreciação na base, e tirá-la de lá invalidaria todos de uma vez. O que muda
é o que o formulário **oferece**: `TIPOS_DESPESA_MANUAL` é a lista sem os
tipos que o sistema gera.

São duas pontas do mesmo contrato, e confundi-las é o defeito que mais voltou
neste projeto. Por isso há prova estática lendo o fonte: a validação da aba e
o `validarLancamento` têm de usar a lista **cheia**; o payload do formulário e
as opções da correção de pendência, a **manual**. Trocar uma pela outra não
quebra nenhum teste de comportamento — ou passa a recusar lançamento antigo,
ou volta a oferecer Depreciação.

### A aba nova em sete listas

Criação, proteção, ordem, cor, invalidação no `onEdit`, validação de backup e
zeramento. Esquecer uma não quebra nada hoje; quebra meses depois. Foi assim
que Orçamento e Comprovantes ficaram invisíveis no menu por duas versões
(V4.11.1). Agora há prova estática conferindo que a aba nova aparece em todas,
e que toda função `webDepreciacao*` do servidor é chamada na tela e vice-versa.

### Provas

`conferir_depreciacao_import.js`, **78 provas**, 13 mutações cobertas.
O arquivo real foi passado pelo parser ponta a ponta: 129 bens,
R$ 290.076,89, batendo ao centavo com a soma das duas abas, zero linhas
ignoradas. Total do projeto: **547 provas**.

Uma prova minha era fraca e a mutação mostrou: eu testava `__proto__` achando
que o prefixo `#` das chaves protegia. Quem protege é `chavePatrimonio_`, que
**maiusculiza** — e `__PROTO__` não é propriedade de protótipo. O teste agora
prova a proteção que de fato existe, e o prefixo ficou documentado como
reforço para o dia em que alguém mexer na maiusculização.

### Pendente deste módulo

- A **máquina** (patrimônio 10041887) está na segunda aba do arquivo. O parser
  trata as duas abas igual, porque o formato é o mesmo — mas se um dia as abas
  precisarem de tratamento diferente, hoje não há como distingui-las na
  colagem.
- O campo de depreciação continua no cadastro de Veículos, agora como reserva.
  Se um dia o arquivo for sempre completo, ele pode sair.

## V4.18.1 — o vínculo placa ↔ bem

Você perguntou se a placa está ligada ao número do bem. A pergunta expôs uma
falha **silenciosa** que a V4.18.0 tinha acabado de criar.

A importação casa por **patrimônio**. Um veículo ativo **sem patrimônio no
cadastro** nunca casa com o arquivo, **nunca dá erro**, e segue sendo
depreciado pelo valor de reserva do cadastro para sempre. Isso só apareceria
quando alguém somasse o Resumo à mão e comparasse com o contábil — meses
depois, sem pista do porquê.

### Três formas de o vínculo estar quebrado, e só uma fazia barulho

| | antes | agora |
|---|---|---|
| patrimônio repetido em dois veículos | já era pendência | continua, e a importação recusa o bem |
| veículo ativo **sem** patrimônio | **nada** | pendência com campo para preencher |
| códigos que só diferem em zero à esquerda | nada | avisado na conferência e na importação |

`conferirVinculoBemPlaca_()` audita o cadastro **sem depender de arquivo
nenhum**, e o resultado abre a tela de Depreciação: *"142 de 145 veículos
ativos prontos"*, com a lista de quem falta e um botão para as pendências.

### Quase-acerto: avisa, não casa

`10000017` no arquivo e `0010000017` no cadastro são o mesmo bem para um
humano e bens diferentes para o sistema. A tentação é casar os dois
automaticamente — e seria **pior que não casar**: dois veículos distintos
podem legitimamente ter códigos que só diferem em zero à esquerda, e a
depreciação de um iria para o outro em silêncio, com o total batendo
certinho.

Então `patrimonioFrouxo_` existe só para **avisar**, nunca para decidir:

> arquivo **10000017** ↔ cadastro **0010000017** (ZZZ 9999 Caminhão)
> Acerte o cadastro ou o arquivo e importe de novo.

### Provas

`conferir_depreciacao_import.js` foi de 78 para **96**. Dez mutações, dez
pegas — incluindo as duas que importam: parar de achar veículo sem
patrimônio, e casar automaticamente por zero à esquerda.

Três mutações primeiro **crasharam em vez de reprovar**, pelo mesmo descuido
de sempre: a prova indexava `quaseAcertos[0]` num array que a mutação esvazia.
Crash não é reprovação, é ruído — e num relatório de mutação os dois se
parecem. Acesso defensivo nas asserções, e as três passaram a reprovar limpo.

## V4.18.2 — o bem importado aparecendo como SEM VALOR

Você importou os 129 bens, viu o `10030362 • QJT 0047 • R$ 415,44 • IMPORTADO`
na lista — e logo abaixo, na situação por veículo, **PREVISTO R$ 0,00 •
SEM VALOR**. O mesmo bem, na mesma tela, com duas respostas.

### A causa é a armadilha da V4.8, num lugar novo

`"2026-08"` numa célula **sem formato texto** vira **Date** no Google Sheets.
Está escrito neste LEIA-ME desde a V4.8, e eu caí de novo.

Seis lugares leem a competência da aba. Cinco usavam
`normalizarMesReferencia_`, que trata o Date. **Um usava `String()`:**

```js
const mes = String(l[COL_DM.COMPETENCIA - 1] || '').trim();
```

Para uma célula com Date isso dá `"Sat Aug 01 2026 00:00:00 GMT-0300 (…)"`,
que nunca casa com `"2026-08"`. O índice da competência saía vazio, o valor
importado não era encontrado, e o bem caía na **reserva do cadastro** — que
para esse veículo é zero. Daí o `SEM VALOR`.

E o sintoma era o pior possível: a lista de bens normalizava e mostrava certo;
a situação não normalizava e mostrava SEM VALOR. **Duas telas, uma certa e uma
errada, lado a lado.** Nada de erro, nada de log — só o número errado.

É outra vez a mesma família: um contrato com seis lados, cinco obedecendo e um
não.

### Conserto, nos dois lados

1. A leitura passa pelo `normalizarMesReferencia_`, com `try` — uma célula
   ilegível devolve essa linha e segue, em vez de zerar a depreciação da frota
   inteira.
2. A gravação formata a coluna Competência como **texto**, para a célula parar
   de virar Date na origem.

### A regra que teria evitado

Prova estática que lê o fonte: **nenhuma leitura de `COL_DM.COMPETENCIA` pode
estar fora do normalizador**. Enquanto a célula for texto, nenhum teste de
comportamento pega isso — foi exatamente o que aconteceu: as 96 provas da
V4.18.1 passavam todas.

E elas passavam por um motivo específico, que vale registrar: **meu duplê de
teste trocava `normalizarMesReferencia_` por `String(m)`**. O duplê tinha o
defeito embutido, então o código defeituoso concordava com ele. Agora o teste
guarda a função de verdade antes de trocá-la e usa a real no bloco que importa
— com o `Date` criado **dentro do vm**, senão ele nem entraria no ramo de data
(realms diferentes, construtores diferentes).

### Provas

`conferir_depreciacao_import.js`: 96 → **106**. Reintroduzir o `String()`
derruba 4 provas. Total do projeto: **575**.

Uma mutação crashou em vez de reprovar, de novo pelo mesmo descuido: a segunda
asserção chamava a função sem proteção depois de a primeira já ter lançado.
Protegida.

## V4.19.0 — validar divergências

Depois de importar, a situação por veículo ficou cheia de `DIVERGENTE`. Olhando
os números da sua tela, são **dois problemas diferentes com o mesmo rótulo**:

| veículo | lançado | competência | diferença | |
|---|---|---|---|---|
| MLY 3499 | 705,01 | 704,99 | **R$ 0,02** | arredondamento |
| MBP 3776 | 6.036,05 | 5.195,98 | **R$ 840,07** | valor mesmo |
| RYP 9G04 | 1.215,38 | 787,05 | R$ 428,33 | valor mesmo |
| MFT 4312 | 3.226,60 | 2.989,11 | R$ 237,49 | valor mesmo |

A causa é a transição: esses lançamentos foram gerados com o valor antigo do
**cadastro**, e a importação trouxe o valor do **contábil**.

Chamar os dois de `DIVERGENTE` é o problema. Dois centavos ao lado de
oitocentos reais, com o mesmo rótulo, ensina o operador a aprovar no
automático — e um dia ele aprova junto uma diferença que importava.

### O botão

**⚖️ Validar divergências** lista cada uma com o lançado, o da competência, a
diferença assinada, e marca em separado as que são **só de centavos** (até
R$ 0,05). Com uma caixa por linha, e o botão de acertar as marcadas.

### Duas situações que ele se recusa a resolver sozinho

1. **Mais de um lançamento de depreciação para a mesma placa no período.**
   Não dá para saber qual ajustar. Aparece como `manual`, com o motivo.
2. **Lançado sem valor na competência.** Ajustar ali significaria **apagar** o
   lançamento, e apagar é decisão sua, não do botão.

Nos dois casos a linha fica sem caixa de marcar: não é possível aprovar por
engano junto com as outras.

### O ajuste é auditável, não um UPDATE

Cada acerto passa por `corrigirLancamento_`, que **exclui e regrava** deixando
o original em `Lançamentos Excluídos` com o motivo:

> Ajuste pelo valor da competência 2026-08: de R$ 6.036,05 para R$ 5.195,98
> (bem 10026875).

Um `setValue` no valor seria uma linha de código mais curta e mudaria o total
do mês **sem rastro** — num sistema que fecha competência com lacre de
integridade, isso não é economia, é buraco.

Depois do ajuste o Resumo é recalculado e as pendências revalidadas, e
competência fechada é recusada.

### Provas

`conferir_depreciacao_import.js`: 106 → **129**. Oito mutações, oito pegas —
incluindo as duas que mais importam: tornar ajustável o que tem dois
lançamentos, e deixar o ajuste tocar nas bloqueadas.

Mais uma fixture minha que não exercitava nada: eu tinha posto dois lançamentos
de R$ 150 contra R$ 300 de competência — que **batem**, então não havia
divergência nenhuma para a prova examinar. O teste reprovou por causa da
fixture, não do código. Corrigido para 150 + 200.

Total do projeto: **598 provas**.


## V4.19.1 — o login parou, e a culpa era de um nome

Você disse que o login parou. Não era o login.

Na V4.16 eu criei uma função chamada `somarColunas_`. **Já existia uma.**

| | assinatura | devolve |
|---|---|---|
| a dos relatórios (linha 8975) | `(linhas, indices)` — várias linhas, índices numéricos | **array** de totais |
| a que eu criei (linha 13375) | `(linha, colunas)` — uma linha, nomes de coluna | **número** |

Em Apps Script todos os `.gs` viram **um escopo só**. Duas funções com o mesmo
nome não dão erro: a última sobrescreve a primeira. E por causa do *hoisting*,
a sobrescrita é total — vale até para o código que roda antes dela no arquivo.

Então os **onze** pontos dos relatórios que faziam
`somarColunas_(dados, [R_.IPVA])[0]` passaram a receber um número, e `[0]` de
um número é `undefined`. Os relatórios estavam quebrados desde a V4.16, três
versões atrás, e só apareceu agora como "não efetua login" porque é por ali
que a tela inicial passa.

### Por que nada pegou

- **`node --check` não pega**: redefinir função é JavaScript válido.
- **As 598 provas não pegaram**: cada suíte carrega o que precisa e nenhuma
  exercitava os dois usos no mesmo lugar. Comportamento não vê colisão de
  nome — o código roda, só roda a função errada.
- **Eu não pegaria lendo**: o arquivo tem 15 mil linhas e as duas definições
  estão a 4.400 linhas de distância.

Só olhar o fonte inteiro pega. É o mesmo remédio das outras vezes: **regra
estática que lê o código e confronta os lados**.

### Conserto

A minha virou `somarColunasDoResumo_`, com o porquê escrito em cima dela. A
dos relatórios não foi tocada.

`conferir_nomes_unicos.js` (7 provas) agora recusa qualquer nome definido duas
vezes — função, constante de topo, e os dois nomes iguais entre si. Rodar
primeiro, porque uma colisão invalida tudo o que vier depois.

E o CLAUDE.md ganhou a regra: antes de criar uma função,
`grep -n "^function nome_" Codigo.gs`.

Total do projeto: **605 provas**.


## V4.19.2 — `entrar is not defined`

O console mostrou `Uncaught ReferenceError: entrar is not defined` no botão
Entrar. Mas `entrar()` **existe**, na linha 1040 do `App.html`.

É esse o jeito de um erro de sintaxe se apresentar: o navegador descarta o
`<script>` **inteiro** e nenhuma função é definida. O primeiro clique denuncia
uma função qualquer, a milhares de linhas de distância da causa.

### A causa: duas barras invertidas perdidas

Eu editei o `App.html` com um script Python usando aspas triplas **não-cruas**.
Nesse tipo de string, Python resolve o escape antes de escrever o arquivo:

| eu escrevi | chegou no arquivo | efeito |
|---|---|---|
| `'…competência?\n\n' +` | quebra de linha de verdade | literal não fechado |
| `onclick="abrir(\'x\')"` | `onclick="abrir('x')"` | aspas fecham a string |

Duas edições, dois escapes, mesma origem. A primeira já bastava para matar o
arquivo.

### Por que nenhuma suíte pegou

`conferir_callbacks.js`, `conferir_funcoes_html.js` e as outras leem o HTML
como **texto**. Texto quebrado continua sendo texto: todas passaram. Só um
**parser** pega.

### `conferir_sintaxe_html.js`

Recorta cada `<script>` dos três HTML e compila com `new vm.Script`, que é o
parser do V8 — o mesmo do navegador — sem executar uma linha. Quando falha,
soma a linha do bloco ao offset do erro para apontar a linha do arquivo real.

Reintroduzi os três defeitos para conferir: `\n` virando quebra de linha,
aspas sem escape, e um recorte no meio de uma função (o acidente da V4.13.1).
Os três são pegos.

### A regra

No CLAUDE.md: ao editar HTML com script Python, usar `r'''...'''` ou montar a
barra com `chr(92)`.

Total do projeto: **611 provas**.

## V4.20.0 — acertar as divergências pelo cabeçalho

O botão estava no meio da página, e exigia dois passos: clicar em *Validar*
para descobrir se havia divergência, e depois marcar e acertar. Todo mês, a
mesma caçada.

Agora:

- **A divergência carrega junto com a tela.** Descobrir que existe não depende
  mais de achar um botão.
- **O cabeçalho mostra `⚖️ Acertar 12 divergência(s)`** — a contagem já no
  rótulo. Quando nenhuma é ajustável automaticamente, o botão aparece
  desabilitado dizendo quantas são manuais, em vez de sumir.
- **Um clique acerta todas as ajustáveis.**

### "De uma vez" não é "no escuro"

A confirmação traz os números antes de aplicar:

> Acertar 12 lançamento(s) pelo valor da competência 2026-08?
>
> Diferença somada: R$ 1.505,91
> 1 é só de centavos.
> 2 NÃO entram: precisam de decisão sua.

As bloqueadas continuam de fora — mais de um lançamento para a mesma placa, ou
lançado sem valor na competência. E a lista detalhada continua logo abaixo,
agora com *marcar todas* / *desmarcar*, para quem quiser escolher uma a uma.

### Sem custo a mais

`divergenciasDepreciacao_` passou a aceitar o status já apurado.
`webDepreciacao` precisa dos dois, e apurar duas vezes seria uma varredura
inteira do Resumo à toa. Competência passada não calcula divergência: só a
aberta gera lançamento.

### Uma prova minha que virou falso alarme

`conferir_depreciacao_import.js` tinha:

```js
ok('a tela lista antes de deixar acertar',
  appD.indexOf('webDepreciacaoDivergencias') < appD.indexOf('webDepreciacaoAjustarDivergencias'));
```

Conferia a **ordem das chamadas no arquivo**, como atalho para "lista antes de
acertar". Com o botão no cabeçalho a ordem inverteu, e a prova reprovou — mas
a propriedade real tinha **melhorado**, porque a lista passou a carregar
sozinha.

Atalho posicional não é a propriedade. Trocada por duas que afirmam o que
importa: a divergência carrega com a tela, e o acerto em massa confirma
mostrando quantas e quanto. Tirar o `confirm` derruba a segunda.

Total do projeto: **625 provas**.

## V4.20.1 — o botão que ficava preso em "Acertando…"

Travava e não saía do lugar. A causa é aritmética:

| | |
|---|---|
| lançamentos na base | ~20.000 |
| divergências a acertar | ~50 |
| cada acerto chamava | `corrigirLancamento_` → **exclui e regrava** |
| excluir desloca | todas as linhas de baixo (~10.000) |
| **linhas copiadas no total** | **~500.000** |
| limite do Apps Script | **6 minutos** |

Estourava o limite. Quando isso acontece, nem o sucesso nem a falha chegam ao
navegador: o botão fica em "Acertando…" **para sempre**, e o operador não sabe
se gravou, se gravou pela metade, ou se não gravou nada.

### Conserto: ajuste em lote, no lugar

`ajustarValoresDepreciacao_` lê as colunas uma vez, muda os alvos em memória e
grava **duas vezes no total** — valor e observação — independentemente de
quantas divergências sejam. De 500 mil operações de linha para 5 chamadas de
planilha.

De quebra, o lançamento **mantém o ID**. O excluir-e-regravar trocava o ID a
cada acerto, e é por ID que as pendências apontam para o lançamento.

### A rastreabilidade mudou de forma, não sumiu

Era: o original ia para `Lançamentos Excluídos` e outro era gravado.
Agora: a própria linha conta a história, na observação.

> Depreciação mensal de 2026-08 — valor da competência. Ajustado de
> R$ 6.036,05 para R$ 5.195,98 em 28/10/2026 14:32 por fulano@giassi.com.br.

Mais o registro no Log. É uma troca consciente: perdeu-se a cópia da linha
antiga numa aba separada, ganhou-se o de-para visível ao lado do valor, o ID
estável, e uma operação que **termina**.

### Nunca gravar na linha errada

Número de linha é coordenada que envelhece — se alguém excluiu um lançamento
com a tela aberta, a linha 3 já é de outro. Antes de escrever, cada alvo é
conferido contra **ID, placa e tipo** da linha. Qualquer divergência recusa
aquele alvo, diz "recarregue a tela", e os outros seguem.

### O botão não pode ficar preso

`comVigia` dá 3 minutos à chamada. Se o servidor não responder, devolve o
botão e diz o que fazer:

> A operação passou de 3 minutos e o servidor não respondeu. Recarregue a tela
> e confira o que já foi gravado **ANTES** de tentar de novo.

Repetir às cegas um acerto que talvez tenha gravado é pior que não repetir.

### Uma prova que afirmava o desenho antigo

`ok('o ajuste passa por corrigirLancamento_', …)` — escrita na V4.19.0, com
razão na época. Ao trocar o mecanismo ela reprovou, e estava certa em
reprovar: o desenho mudou. Foi reescrita para afirmar o que vale agora — que
o ajuste **não** exclui e regrava, e que o de-para fica na linha e no Log.

Uma prova que vira falso alarme ao mudar o desenho não é ruído: é a suíte
pedindo para alguém dizer, por escrito, que a mudança foi deliberada.

Total do projeto: **652 provas**.

## V4.21.0 — o Resumo parou de pintar toda carreta

A regra da formatação condicional era:

```
$U4 > 2 * $U$3
```

O R$/km de cada veículo contra **o dobro do número da frota inteira**. Com
transporte a 85% do custo, a frota inteira *é* a carreta — e toda carreta
ficava vermelha, todo dia. Vermelho que aparece sempre deixa de significar
alguma coisa.

O alerta diário já tinha abandonado esse critério na **V4.9.5**, quando ele
acusava 74 veículos. A planilha ficou para trás, e por doze versões a tela
disse uma coisa e o e-mail disse outra.

### Uma regra, dois consumidores

`referenciaPorCategoria_` passou a ser a única dona da regra, e tanto o alerta
quanto o Resumo a consomem. Duas regras parecidas e diferentes são piores que
uma só: quem lê não sabe em qual acreditar.

A regra é a do alerta, inteira — **mediana por categoria**, sobre o **custo de
rodagem** (manutenção é gasto por evento), com **mínimo de 4 veículos** e
**piso de rodagem de 20%** da mediana de km da categoria.

### Duas colunas novas, no fim

| | |
|---|---|
| **Y** — `R$/KM Rodagem` | o número que é julgado |
| **Z** — `Limite da Categoria (2× mediana)` | o limite, escrito pelo script |

Vão no fim pelo mesmo motivo do Gás: as letras A..V são referenciadas por
fórmula em Relatórios, Dashboard e Rateio.

O limite é **gravado**, não calculado em fórmula: mediana por categoria não se
escreve em formatação condicional sem array, e array ali não é confiável.
Calculado no script, é exatamente o mesmo número do e-mail.

Categoria sem referência recebe limite **vazio**, não zero — zero seria lido
como "limite zero" e pintaria tudo.

A coluna pintada é a **Y**, não a `R$ por KM` (U). U continua sendo total ÷ km,
o número gerencial. Pintar U com a régua de Y seria colorir um número com a
régua de outro.

### Quatro fixtures minhas que não exercitavam nada

A mutação achou todas:

1. **Limite 1× em vez de 2×** sobreviveu: minhas fixtures eram uniformes, e
   com uma carreta a 3× da mediana as duas réguas dão o mesmo resultado.
   Acrescentei alguém a **1,5×**, que só o 2× deixa passar.
2. **Coluna usando custo variável em vez de rodagem** sobreviveu: sem oficina
   nas fixtures, as duas contas são iguais. Acrescentei a Saveiro com R$ 20.000
   de oficina.
3. **Segunda guarda removida** sobreviveu: faltava o caso de categoria com 5
   veículos e só 3 acima do piso de rodagem.
4. **Primeira guarda removida** sobreviveu, e por um motivo interessante: a
   segunda pega todos os casos da primeira. Ela não é redundante, porém —
   muda o **motivo informado**. Numa categoria de dois veículos com um parado,
   a causa é a categoria ser pequena, não a rodagem da moto. Motivo errado
   manda o operador consertar a coisa errada.

### Instalar

**Precisa**, por causa das duas colunas novas. O cabeçalho é reescrito sozinho
na primeira atualização do Resumo, mas a formatação condicional só troca no
Instalar.

### Provas

`conferir_alerta_diario.js`: 72 → **105**. Total do projeto: **685**.

## V4.22.0 — o rateio em PDF, montado em vez de fotografado

O que existia era `exportarAbaComoPdf_`, que pede ao Google um PDF **da aba**.
O resultado tem a cara da planilha: grade, larguras de coluna, cabeçalho
congelado. Serve para arquivar; não serve para sair da mesa.

O novo monta o documento em HTML e converte com
`newBlob(html, HTML).getAs(PDF)`. As duas coisas continuam existindo — são
usos diferentes.

### O que o documento traz

**Cabeçalho institucional** com a empresa, a competência por extenso, o
período e a base do rateio.

**Quatro indicadores**: custo total da frota, valor rateado (com a fração que
ele representa), centros que recebem, e o maior centro com valor e
participação.

> A primeira versão tinha *custo total* e *custo direto* lado a lado. São
> **sempre o mesmo número**: o que sai dos centros-base volta inteiro para os
> que recebem. Um quarto do cabeçalho repetindo um número. Trocado pela fração
> rateada e pelo maior centro, que é o que alguém procura primeiro.

**Tabela** com `% do Total` por centro, os centros-base marcados como *quem
distribui* e os não cadastrados em vermelho, com a tarja. Totais com régua
grossa, no fim — onde se lê depois da lista, não antes.

**Observações da apuração**, por escrito. Esta parte é a que mais importa:
um PDF circula, e se a apuração tem condição e o papel não diz, quem lê decide
sem saber. Entram percentual que não soma 100%, percentual herdado de outra
competência, competência encerrada (e se veio do cache ou foi recalculada), e
centros órfãos.

**Rodapé** com quem gerou, quando, a versão do sistema e a nota de que o total
fecha com o Resumo.

### Ressalva por ruído é pior que nenhuma

O limiar para avisar sobre a soma dos percentuais é **0,01%**. Os percentuais
herdados da planilha antiga somam 100,001%, e isso **não** vira observação, de
propósito: avisar todo mês sobre um milésimo de ponto ensina a pular o bloco —
e aí some junto o aviso que importa. Há prova para os dois lados.

### Texto da planilha não vira HTML

Nome de centro é digitado por gente. `escHtml_` cobre os cinco caracteres, e
há prova com `<script>alert(1)</script>` como nome de centro.

### Quatro fraquezas das minhas próprias provas

1. Contei `tag-base` no documento inteiro e peguei a folha de estilo junto:
   dava 3 onde o certo era 2. Passou a contar a classe aplicada na linha.
2. A fixture do percentual fora de 100% usava 100,001%, que está **abaixo** do
   limiar — a prova reprovava o código por uma decisão correta dele. Trocada
   por 90%, e acrescentada a prova de que o ruído não vira ressalva.
3. Trocar "o maior centro" por "o primeiro da lista" sobrevivia, porque na
   minha fixture o maior **era** o primeiro. Reordenada.
4. Tirar a guarda de divisão por zero sobrevivia — e por um motivo que vale
   saber: quem segura o NaN é `numBR_`, com `Number(valor || 0)`, já que NaN é
   falsy. A guarda é reforço. Agora a prova é sobre `numBR_`, que é quem
   realmente impede o NaN de chegar ao papel.

### Instalar

Não precisa. O PDF sai na pasta **Relatórios Frota** do Drive e a tela devolve
o link.

### Provas

`conferir_pdf_rateio.js`, **45 provas**, 12 mutações cobertas. Total do
projeto: **730**.

## V4.22.1 — o número do relatório é o total

Você apontou o **R$ 894.859,11**: é esse o número do rateio, não o
R$ 418.819,48 que eu tinha posto como "Valor rateado".

Você tem razão sobre o que o relatório é. O R$ 418.819,48 é o custo do
depósito e das empilhadeiras que *se move*; o R$ 894.859,11 é o custo que
*acaba alocado* nos centros — e é esse que alguém repete na reunião.

### Só trocar o rótulo não resolvia

Se eu renomeasse "Valor rateado" para mostrar o total, os **dois primeiros
indicadores mostrariam o mesmo R$ 894.859,11** — exatamente a redundância que
a V4.22.0 tinha acabado de tirar. O que sai dos centros-base volta inteiro
para os que recebem, então total e "rateado entre as lojas" são o mesmo
número.

Então os dois viraram um, e sobraram dois lugares:

| | |
|---|---|
| **Custo total rateado** | R$ 894.859,11 · *sendo R$ 418.819,48 redistribuídos* |
| **Centros que recebem** | 15 · *todo o custo alocado* |
| **Média por centro** | entre os que recebem |
| **Maior centro** | nome, valor e participação |

O segundo indicador ganhou uma função nova: quando existe centro que **não
recebe** rateio e tem custo — um centro que aparece nos veículos mas não está
cadastrado —, ele diz *"R$ X fora das lojas"*. Esse dinheiro não chegou a loja
nenhuma, e antes isso só aparecia no rodapé. A média desconta esse valor.

### As provas não viram a troca

Trocar o indicador principal do total para o valor redistribuído **não quebrou
nenhuma prova**. Elas conferiam que o número aparecia em *algum lugar* do
documento, não em qual.

O indicador de cima é o que se lê primeiro e se repete fora da sala — ele
merece contrato próprio. Agora há um: um leitor de indicadores por rótulo, e
provas de que o principal traz o total, de que o redistribuído fica na linha
de baixo, e de que **não existe** um indicador separado repetindo o mesmo
número. Cinco mutações cobrem os cinco comportamentos.

`conferir_pdf_rateio.js`: 45 → **53**. Total do projeto: **738**.

## V4.22.2 — só as lojas no relatório

Três coisas, a partir do que você viu na amostra.

**Era só um exemplo.** Os dados eram inventados — por isso faltavam lojas e
aparecia um "ADM Central" de R$ 424.943 que eu criei para o total bater. Na
planilha ele lê os centros de verdade.

**Saiu a média por centro.** Num rateio por percentual ela não diz nada que o
percentual já não diga. Ficaram três indicadores.

**Saiu quem não recebe rateio.** DEPÓSITO e EMPILHADEIRAS ficam com total zero
depois de distribuir, e linha de zeros no meio da lista é ruído. A coluna
*Distribuído* saiu junto: para loja era sempre travessão.

### O dinheiro que sai da lista não pode sair da conta

Tirar quem não recebe tem uma consequência: se houver centro **com custo** que
não recebe rateio — um que aparece nos veículos mas não está cadastrado —, o
total da tabela deixaria de bater com o Resumo, e ninguém saberia por quê.

Por isso, logo abaixo da tabela, quando isso acontece:

> Além desta lista, **R$ 3.200,50** ficaram em centros que não recebem rateio
> (aparecem nos veículos mas não estão cadastrados). Custo total da frota na
> competência: **R$ 898.059,61**.

Quando não há sobra, a linha nem aparece — e o indicador diz *"todo o custo
alocado"*.

O indicador principal também passou a se chamar **Custo total da frota**, não
"rateado": com sobra, o total inclui dinheiro que justamente **não** foi
rateado, e o rótulo mentiria. Quanto se moveu de fato está na linha de baixo.

### Três provas minhas reprovando por vizinhança

1. `h.indexOf('DEPÓSITO') === -1` reprovava porque o **cabeçalho** cita a base
   do rateio, de propósito. Passou a olhar só o corpo da tabela.
2. A prova do total olhava 400 caracteres à frente e pegava junto o
   R$ 65.000,00 da linha de conferência, que vem logo depois. Escopada na
   própria linha de total.
3. Duas mutações sobreviveram porque na fixture sem sobra *total das lojas* e
   *total da frota* são o mesmo número. Só com dinheiro fora dá para provar
   qual dos dois a tabela usa.

`conferir_pdf_rateio.js`: 53 → **60**, 7 mutações. Total do projeto: **745**.

## V4.22.3 — um indicador só

Saiu o **maior centro de custo**. Ficou apenas o **custo total da frota**, com
a linha menor dizendo quanto foi redistribuído.

A caixa também deixou de ocupar a largura toda: um retângulo cinza de ponta a
ponta com um número só fica vazio. Agora é compacta, à esquerda.

Nada se perdeu com os indicadores que saíram:

- **maior centro** — a tabela está ordenada por total decrescente, então é a
  primeira linha;
- **centros que recebem** — é a contagem de linhas da tabela;
- **custo fora das lojas** — continua na linha de conferência abaixo da
  tabela, que agora é o único lugar onde isso aparece, e por isso vale ainda
  mais.

### A ordem virou contrato do documento

Como "o maior é a primeira linha" passou a ser a forma de achar o maior
centro, o PDF deixou de depender de o chamador ter ordenado:
`htmlRateioPdf_` ordena por conta própria. `apurarRateio_` já ordenava, mas
depender disso quebraria calado no dia em que alguém mudasse a apuração.

### A fixture sem sobra escondia uma troca

Trocar o indicador do **total da frota** pelo **total das lojas** sobrevivia:
na fixture principal os dois são o mesmo número. Só na fixture com centro
não cadastrado dá para distinguir — 65.000 contra 60.000. É o terceiro caso
nesta sessão em que uma fixture "normal" demais deixa passar uma troca.

`conferir_pdf_rateio.js`: 60 → **62**. Total do projeto: **747**.

## V4.22.4 — as lojas em ordem numérica

A tabela saía ordenada por valor, do maior para o menor. Num papel que se
percorre com o dedo procurando uma loja, isso não serve: a ordem certa é a
numérica.

### Alfabético não é numérico

O detalhe que justifica uma função própria: **"Loja 10" vem depois de
"Loja 2" para uma pessoa e ANTES para a comparação alfabética**, que olha
caractere a caractere e vê `'1' < '2'`.

Com os nomes zerados à esquerda — *Loja 01*, *Loja 02* — o alfabético até
acerta. Mas basta **um** centro cadastrado sem o zero para a lista sair fora
de ordem, e ninguém desconfia de uma lista: a pessoa procura, não acha, e
conclui que a loja não está no relatório.

`compararCentroNatural_` quebra o nome em pedaços de texto e de número e
compara número com número. *Loja 1, Loja 2, Loja 09, Loja 10* sai nessa
ordem mesmo com os formatos misturados.

### Provas

12 provas só da ordenação, incluindo os cantos: zero à esquerda, maiúscula
contra minúscula, nome sem número, nome vazio, nome mais curto que começa
igual, e dois trechos numéricos no mesmo nome (*CD 1 Loja 99* antes de
*CD 2 Loja 1*).

Cinco mutações: voltar a ordenar por valor, trocar por alfabético, comparar o
trecho numérico como texto, inverter o caso do nome curto, e tirar a
maiusculização.

`conferir_pdf_rateio.js`: 62 → **75**. Total do projeto: **760**.

## V4.23.0 — depreciação e manutenção por loja

Eu tinha dito que o sistema não sabe o setor que usou o veículo. Você
corrigiu: **o veículo já é vinculado à loja**, pelo centro de custo do
cadastro. Está certo — o que eu descrevi como limitação (não saber *quem
dirigiu num dia*) não é a pergunta que vocês fazem. A pergunta é *quanto cada
loja carrega*, e para isso o vínculo já existe.

Dois relatórios novos, os dois só no app.

### Depreciação por loja

Uma linha **por loja**, não por veículo: a depreciação de cada bem é um valor
fixo mensal, e o que se quer saber é quanto cada loja carrega.

| Centro de Custo | Veículos | Depreciação | % do total |

### Manutenção por loja

Uma linha **por veículo**, com a loja na primeira coluna — aqui o detalhe
importa, porque manutenção varia e a pergunta seguinte é sempre *qual veículo
puxou a conta desta loja*.

| Centro de Custo | Placa | Veículo | Categoria | Oficina | Pneus | Manutenção | % da loja |

A coluna **% da loja** é sobre o total **daquela loja**, não sobre o geral:
responde "qual veículo dominou a manutenção aqui" sem somar na mão. Dentro de
cada loja, o maior gasto vem primeiro.

Os dois saem em **ordem numérica de loja**, com a mesma
`compararCentroNatural_` do PDF do rateio.

### O que não pode sumir num agrupamento

Agrupar é onde linha some sem ninguém ver, e linha que some é dinheiro que
ninguém cobra. Veículo **sem centro de custo** não desaparece: vira
`(sem centro)` e entra no total. Há prova para isso.

Veículo com depreciação zero não conta como veículo da loja — a coluna
*Veículos* conta quem deprecia, não quem existe.

### Três pontas, uma prova estática

Um relatório precisa estar em três lugares: o **catálogo** (que gera a lista
da tela), o **despacho** (que chama a função) e a **função**. Faltar uma não
dá erro — dá item de menu que abre vazio, ou função morta.

A prova confere as três, e mais uma coisa: que as colunas declaradas no
catálogo são **as mesmas**, na mesma ordem, que as devolvidas pela função. É
o tipo de divergência que só aparece quando alguém exporta o relatório e as
colunas saem trocadas.

### Provas

`conferir_relatorios_loja.js`, **42 provas**, 7 mutações. Total do projeto:
**802**.

## V4.24.0 — o documento do fechamento, para a contabilidade

Um PDF só, com três seções, cada uma começando em página própria:

1. **Rateio por centro de custo**
2. **Depreciação por loja** — total por loja
3. **Manutenção por loja** — com os veículos e a coluna *% da loja*

Capa com os três totais do mês, as ressalvas da apuração por escrito e o
rodapé de rastreabilidade. O botão fica no **Fechamento**, passo 5.

### Só a competência aberta, e isso é recusa explícita

O rateio sabe apurar mês fechado. A depreciação e a manutenção saem do
**Resumo**, que tem apenas o período corrente.

Juntar os dois produziria um documento com o rateio de um mês e o detalhe de
outro — o tipo de erro que ninguém percebe e que vai **assinado para fora**.
O sistema recusa e diz por quê:

> O documento do fechamento só sai para a competência aberta (2026-10). A
> depreciação e a manutenção por loja vêm do Resumo, que tem apenas o período
> corrente — misturá-las com o rateio de 2026-09 geraria um documento com
> meses diferentes. Para o rateio de 2026-09 isolado, use o PDF do rateio.

### Uma conta, dois lugares, nunca duas contas

O PDF chama `relatorioDepreciacaoPorLoja_` e `relatorioManutencaoPorLoja_` —
**as mesmas funções que a tela usa**. Duplicar a conta no documento faria o
papel e o app divergirem, e o papel é o que a contabilidade guarda.

Para isso existe `tabelaRelatorioPdf_`, que desenha qualquer
`{colunas, linhas, totais}` formatando pelo **tipo declarado na coluna**.
Qualquer relatório futuro entra num PDF de graça.

### O refactor que a suíte protegeu

O PDF do rateio foi quebrado em peças — `estiloPdf_`, `cabecalhoPdf_`,
`rodapePdf_`, `notasRateio_`, `secaoRateioPdf_` — para o documento unificado
reusar em vez de copiar. As 75 provas existentes passaram sem alteração
nenhuma durante o refactor inteiro. É para isso que elas servem.

### A repetição que apareceu ao olhar

A primeira versão mostrava **"Custo total da frota" duas vezes**: na capa e
dentro da seção do rateio, porque a seção trazia o próprio indicador. Só
aparece olhando o documento montado.

A seção passou a devolver o indicador **separado** do html, e cada documento
decide onde pôr. Há prova de que o html da seção não contém indicador —
senão o unificado volta a mostrar dois.

### Provas

`conferir_pdf_rateio.js`: 75 → **108**, 9 mutações nas partes novas. Total do
projeto: **835**.

## V4.24.1 — o documento enxugado

Depois de ver a V4.24.0 montada, três cortes:

- **sai o rateio** do documento;
- **sai o % da loja**;
- **sai a coluna da loja** das duas seções.

O que sobra é o que a contabilidade confere:

**1. Depreciação** — um bem por linha: `Bem / Patrimônio • Placa • Veículo •
Depreciação`, em ordem de patrimônio. É a lista que casa com o arquivo que
eles mandaram.

**2. Manutenção** — um veículo por linha: `Placa • Veículo • Categoria •
Oficina • Pneus • Manutenção`, do maior para o menor.

A loja sair faz sentido: **o veículo já é vinculado à loja no cadastro**,
então a contabilidade aloca por lá. O que ela precisa conferir no papel são
os valores, linha a linha.

Os relatórios **por loja** continuam existindo na tela — são úteis
internamente, para saber qual veículo puxou a conta de cada loja. O que mudou
foi o documento que sai da empresa.

### O patrimônio vem do cadastro

O Resumo não tem patrimônio, só placa. `mapaPatrimonioPorPlaca_` faz o
vínculo numa passagem.

Bem sem patrimônio cadastrado aparece como **⚠ sem patrimônio**, não em
branco: célula vazia num PDF parece descuido de formatação, e quem recebe não
sabe que precisa avisar alguém. O valor continua no total.

Placa repetida no cadastro: o **primeiro** patrimônio vence, de propósito.
Escolher o último seria igualmente arbitrário, mas faria o documento mudar
conforme a ordem das linhas da planilha — pior que uma escolha fixa.

### Duas fraquezas de fixture, de novo

1. **"não ordenar" sobrevivia** porque a fixture já estava em ordem de
   patrimônio. Reordenada para que a ordem de entrada seja diferente da de
   saída. De quebra, entrou a prova de que o patrimônio acompanha a placa
   certa — trocar esse vínculo manda o bem errado para a contabilidade.
2. **"placa duplicada: o último vence" sobrevivia** porque não havia placa
   repetida na fixture.

É o quinto caso nesta sessão de fixture comportada demais. O padrão já é
claro: **uma fixture em que a entrada e a saída coincidem não distingue a
transformação da ausência dela.**

`conferir_pdf_rateio.js`: 108 → **118**. Total do projeto: **845**.

## V4.24.2 — a loja volta, no lugar do patrimônio

Um dia depois de tirar a loja do documento, o pedido se inverteu: *"BEM /
PATRIMÔNIO no lugar desse campo coloque a Loja, e na manutenção preciso do
campo da loja também"*.

Não é contradição. Na V4.24.1 a loja saiu junto com o rateio, porque o rateio
é que falava de loja. Com o documento já enxuto, a loja deixou de ser rateio e
virou **a chave de alocação**: é por ela que a contabilidade lança a despesa.
O patrimônio, que parecia o campo de ligação com o arquivo deles, acabou
sendo o que menos se usa na conferência.

**1. Depreciação** — `Loja • Placa / ID • Veículo • Depreciação`, agrupada
por loja e, dentro dela, por placa.

**2. Manutenção** — `Loja • Placa / ID • Veículo • Categoria • Oficina •
Pneus • Manutenção`, agrupada por loja e, dentro dela, do maior gasto para o
menor.

O relatório da depreciação passou a se chamar **"Depreciação por veículo"**:
sem a coluna do patrimônio, "por bem" prometia uma visão que não existe mais.

### O que saiu

`mapaPatrimonioPorPlaca_` foi removida — era a única consumidora do cadastro
nesses dois relatórios, e com ela some uma leitura de Veículos por relatório.

### Veículo sem loja

Entra como **⚠ sem loja**, pelo mesmo motivo do **⚠ sem patrimônio** da
versão anterior: célula vazia num PDF parece erro de formatação, e quem
recebe não sabe que falta cadastro. `lojaDaLinhaResumo_` é a dona dessa
regra, usada pelos dois relatórios — um lado só do contrato não resolveria.

### A ordenação é por loja, não por valor

A coluna de total da manutenção andou uma casa (`totais[5]` → `totais[6]`)
com a entrada da loja. Trocar índice de array em silêncio é exatamente o tipo
de defeito que não dá erro: o PDF sairia com o total dos pneus no rodapé.
Tem prova própria.

### A sexta fixture comportada demais

A mutação *"manutenção sem agrupar por loja"* **sobreviveu**: na fixture, as
lojas em ordem e os valores em ordem decrescente coincidiam
(Loja 02/5.000, Loja 02/1.000, Loja 10/700), então ordenar por loja e ordenar
só por valor davam a mesma sequência.

Entrou uma loja **de número menor com gasto menor** (Loja 01 / R$ 300). Agora
por loja ela vem primeira e por valor viria última — e a prova distingue as
duas. Junto, uma prova que falha se as duas ordens voltarem a coincidir, para
a fixture não se acomodar de novo.

Sexto caso da mesma família nesta sessão. **Uma fixture em que a entrada e a
saída coincidem não distingue a transformação da ausência dela.**

`conferir_pdf_rateio.js`: 118 → **124**. Total do projeto: **851**.
Mutação: 6 de 6 pegas.

## V4.25.0 — o fechamento em planilha (.xlsx)

*"mudança de planos, temos que gerar em Xls planilha o arquivo"*.

Faz sentido e eu devia ter perguntado antes de montar o PDF: o PDF é para
**ler**; a planilha é para **trabalhar**. A contabilidade vai somar, filtrar,
fazer tabela dinâmica e colar no sistema dela. Num PDF, isso vira digitação
manual — e digitação manual de 167 linhas de valor é onde o erro entra.

O PDF **continua existindo**, no botão ao lado. Custa uma função e serve para
anexar e arquivar; a planilha passou a ser o botão principal.

### O que a planilha tem

| Aba | Conteúdo |
|---|---|
| `0_Informacoes` | empresa, competência, período, quem gerou, os dois totais |
| `1_Depreciacao` | Loja • Placa / ID • Veículo • Depreciação |
| `2_Manutencao` | Loja • Placa / ID • Veículo • Categoria • Oficina • Pneus • Manutenção |

As mesmas duas seções do PDF, nas mesmas ordens.

### Número é número

A regra que mais importa aqui: **valor vai como número, com formato de
exibição** — nunca como texto já formatado. Texto que parece dinheiro passa
despercebido na tela e quebra toda soma e todo filtro em cima, sem dar erro.
Em pt-BR ainda corre o risco de o separador ser lido ao contrário na
abertura. É a mesma armadilha do `toFixed`, num destino novo.

Por isso `escreverRelatorioNaAba_` recebe o relatório cru e aplica
`formatoPlanilha_(tipo)` na célula. O **tipo é declarado uma vez**, na função
do relatório, e serve à tela, ao PDF e à planilha.

### Uma fonte, dois formatos

`dadosFechamento_` nasceu disto: o PDF e a planilha precisam recusar a mesma
competência, somar os mesmos valores e ler o mesmo Resumo. Uma regra em cada
um era a chance de o XLSX aceitar um mês que o PDF recusa — e o erro só
apareceria no que já saiu da empresa.

De quebra, o total deixou de ser índice fixo e passou a ser **a última
coluna**. Foi exatamente esse índice que andou uma casa quando a Loja entrou
na frente, na V4.24.2.

### A planilha temporária

O Apps Script não escreve xlsx. Monta-se uma Planilha Google temporária e
pede-se a ela a exportação (`/export?format=xlsx`), como já se fazia com o
PDF das abas. A temporária vai para a lixeira num `finally`: sem isso, cada
tentativa frustrada deixaria um arquivo largado no Drive, e ninguém limpa
isso à mão. Tem prova com HTTP 500.

### O aviso mudou de lugar

`⚠ sem loja` ia para a **frente** do documento, por ordem alfabética — o
documento da contabilidade abria com uma linha de problema. `compararLojaResumo_`
joga o balde do aviso para o fim, e é dono único da regra para as duas
seções.

### Suíte nova

`conferir_planilha_fechamento.js` — **41 provas**. A dublê de planilha valida
**dimensão**: escrever 9 colunas num intervalo de 7 reprova aqui como
reprovaria no Apps Script. Mutação: **11 de 11 pegas**, incluindo valor
virando texto, a temporária não indo para a lixeira, o formato não alcançando
a linha de total e o aviso voltando para a frente.

### E uma regra antiga fez o trabalho dela

`conferir_desempenho.js` reprovou o primeiro rascunho: `setNumberFormat`
chamado dentro de um laço, uma vez por coluna. Virou `setNumberFormats` do
bloco inteiro, em duas chamadas. A regra foi escrita na V4.17 para outro
defeito e pegou este sozinha.

Total do projeto: 851 → **894**.

## V4.26.0 — alterar e excluir a leitura de KM pelo relatório

A tela mostrava o problema e não deixava resolver. A leitura de 150.583 em
20/10 era um dedo a mais no teclado: fazia o veículo "rodar" −88.605 km,
marcava ⚠ retrocedeu e sujava o consumo do mês. Para acertar, era preciso
abrir a aba Odômetro e procurar a linha à mão.

Agora cada linha de leitura tem **alterar** e **excluir**, só para OPERADOR e
ADMIN. A coluna é montada na tela, não no servidor: o mesmo relatório vai
para o PDF e para a aba, e botão não faz sentido no papel.

### A aba Odômetro não tem ID

São três colunas desde a primeira versão: Data, Placa, KM. Então a identidade
da leitura é **placa + dia + valor**, e o servidor confere os três antes de
escrever.

Número de linha não serve, e isso não é teoria: é o mesmo defeito da V4.15,
quando a correção de pendência mirava pela linha e gravava no vizinho depois
de uma exclusão. Entre desenhar o relatório e clicar no botão, outra pessoa
pode excluir uma linha acima e o alvo desce sozinho. Tem prova disso.

Leitura que não está mais lá: **recusa e manda atualizar**, em vez de gravar
em qualquer linha. Duas leituras idênticas — mesma placa, mesmo dia, mesmo KM
— já são, elas próprias, uma duplicidade: age-se numa e a mensagem diz
quantas eram.

### O lacre do período

Leitura de mês fechado não se mexe por aqui, pelo mesmo motivo dos
lançamentos: o KM entra no consumo e no R$/km do mês, e alterá-lo depois faria
o Histórico divergir do que foi assinado. A mensagem manda reabrir o mês.

### O que o botão NÃO faz

Não recalcula o Resumo. Ele lê o odômetro e é remontado por "Atualizar
relatórios", que leva minutos numa frota inteira — fazer isso dentro do
clique arriscaria o limite de 6 minutos, que é o que travou o botão de
divergências na V4.20. A mensagem avisa o que falta fazer.

### De quebra: o NaN da linha do veículo

A linha de resumo de cada veículo punha `"6 leitura(s)"` na coluna
**Leitura (KM)** e o aviso de retrocesso na coluna **KM/dia** — as duas
numéricas. Na tela saía **NaN**, e o total rodado ia parar em Observação. Era
visível na imagem que o usuário mandou e passou doze versões sem ninguém
reparar. Agora o total rodado cai em "Rodou desde a anterior", que é
exatamente o que ele é, e o texto vai para Observação.

### A confirmação que sumia

Primeira versão escrevia o "pronto, alterado" direto no `saidaRel` e logo em
seguida mandava recalcular o relatório — que substitui o conteúdo inteiro. A
mensagem sumia antes de ser lida e a ação parecia não ter acontecido. Fica
guardada numa variável e quem desenha a tabela a põe por cima.

### Suíte

`conferir_odometro_edicao.js` — **59 provas**. Mutação: **18 de 18 pegas**.

Três armadilhas de fixture nesta:

1. `Date` criado **fora do vm** não passa no `instanceof Date` de dentro: o
   relatório descartava toda a fixture em silêncio e as provas passavam sem
   provar nada. A fábrica de datas passou a rodar dentro do vm.
2. **"não confere a placa" e "não confere o dia" sobreviveram** porque a
   fixture tinha um veículo só e nenhum KM repetido — conferir ou não
   conferir dava no mesmo. Entrou um sósia de cada: outro veículo com a mesma
   leitura no mesmo dia, e o mesmo veículo com o mesmo KM em outro dia.
3. A prova do lacre usava **29/09, que está aberto** — a competência 2026-10
   vai de 26/09 a 25/10. Passava sem o lacre existir.

É a sétima vez nesta sessão. **Uma fixture em que a entrada e a saída
coincidem não distingue a transformação da ausência dela.**

### E a regra estática de novo

`conferir_funcoes_html.js` pegou uma `avisoLeitura()` que sobrou de um
rascunho e teria dado `ReferenceError` no primeiro clique em "KM inválido" —
derrubando a tela inteira, sem mensagem útil.

Total do projeto: 894 → **953**.

## V4.26.1 — provas para os caminhos sem volta

Nenhuma linha de produção mudou aqui. O que entrou foi a suíte que a
auditoria pedia desde a V4.12: fechar o período, excluir um veículo e
ajustar o estoque da bomba são operações **sem desfazer pela tela**, e não
tinham teste nenhum.

### O que se prova não é o resultado, é a ordem

Um fechamento que grava a competência nova e falha na exportação é pior que
um fechamento que não acontece: ninguém percebe, e o mês seguinte abre sobre
uma base que nunca foi fotografada. Então quase toda prova aqui olha o
**rastro** — a sequência das operações — e não só o que a função devolveu:

- valida **antes** de qualquer escrita;
- backup **antes** da exportação;
- a fotografia do período **antes** de avançar a competência;
- o Resumo é congelado **antes** de avançar (depois congelaria o mês errado).

E o caso que mais interessa: **a exportação falha**. O erro sobe, a
competência não avança, o Resumo não é congelado e o Histórico não é
gravado. Mover `gravarParam_` para antes da exportação — uma linha — faz
cinco provas quebrarem.

### O lacre tem dois lados, de novo

`excluirVeiculo_` recusa o veículo com lançamento em período fechado **e** o
veículo com leitura de KM em período fechado. São duas guardas separadas, e
é o oitavo caso neste projeto de um contrato com mais de um lado. Cada uma
tem prova própria: desligar só a do odômetro deixa três provas vermelhas.

### A armadilha do realm, agora desligando uma guarda

De novo o `Date` criado fora do `vm`. Nas outras vezes ele esvaziava a
fixture e as provas passavam sem ter o que provar. Aqui foi pior: o
lançamento caía no ramo `!(data instanceof Date)` e era contado como
**período fechado** sem nunca ter sido comparado com data nenhuma. A prova
do lacre passava — pelo motivo errado. A fábrica de datas passou a rodar
dentro do `vm`.

### Duas fraquezas de fixture

1. **"apaga a linha errada do cadastro" sobreviveu** porque o veículo alvo
   era a primeira linha: apagar "a primeira" e apagar "a que casa" davam no
   mesmo. Agora ele é o do meio, entre dois que têm de sobrar.
2. **"a bomba aceita saldo negativo" só dava CRASH**, não FALHA: sem o
   caminho feliz dublado, tirar a guarda fazia o teste estourar. Um teste que
   estoura não distingue "pegou o defeito" de "o arquivo não compila" — é
   exatamente o erro de leitura que esta disciplina existe para evitar.
   Com `estadoTanque_` dublado, o mutante agora produz um ajuste de verdade
   e quatro provas o reprovam.

### Suíte

`conferir_irreversiveis.js` — **51 provas**, mutação **17 de 17**.

Fica faltando `webCorrigirLancamento` (o desfazer: quando o lançamento novo
não salva, o original volta com o mesmo ID e a leitura de KM é recolocada) e
`webGerarDepreciacao`. São os dois restantes da lista de seis.

Total do projeto: 953 → **1.004** provas, em 30 suítes.

## V4.27.0 — cadastro de loja

A tela de Centros de custo sempre soube editar o percentual e dizia, no
rodapé: *"Centros novos são criados na aba Centros de Custo da planilha."*
Ou seja: para abrir uma loja era preciso sair do app. Agora não.

No alto da tela, para ADMIN: **Cadastrar loja**. E em cada linha,
**renomear** e **excluir**.

### O nome da loja é chave em cinco lugares

Essa é a dificuldade real, e é por isso que o cadastro é mais que um
`appendRow`. O nome aparece em:

1. a aba **Centros de Custo** — quem existe;
2. o **cadastro do veículo** — a que loja ele pertence;
3. o **snapshot de centro de cada lançamento** — a loja no momento do gasto;
4. o **bloco de percentual da competência** — quanto ela recebe de rateio;
5. o parâmetro **BASE_RATEIO** — quem é base, e não recebe.

Renomear e esquecer um deles não dá erro: cria uma **segunda loja fantasma**,
com parte dos veículos ou parte do rateio, e a soma dos percentuais deixa de
fechar. É o mesmo padrão de defeito que mais voltou neste projeto. Cada um
dos cinco tem prova própria, e tirar qualquer um deixa provas vermelhas.

### Duplicidade é por chave, não por string

`chaveCentro_` compara sem acento, sem maiúscula e sem espaço duplicado. Sem
isso, "Loja 01", "loja 01" e "Loja  01" viram três lojas na tela e uma soma
de rateio que não fecha — sem erro nenhum. Vírgula e ponto e vírgula no nome
são recusados: `BASE_RATEIO` guarda os centros separados por vírgula, e um
nome com vírgula partiria o parâmetro em dois centros inexistentes.

### Renomear tem o mesmo lacre do histórico

Loja com lançamento em **período fechado** não é renomeada. Esses registros
são histórico lacrado e ficariam com o nome antigo — exatamente a loja
fantasma. A mensagem diz o caminho: cadastrar a nova, trocar o centro dos
veículos e deixar a antiga sem uso. É a mesma regra que impede excluir um
veículo com passado.

E o bloco de percentual de **competência encerrada** também não muda.

### Excluir não tem cascata, de propósito

Só sai a loja que ninguém usa: sem veículo, sem lançamento nenhum e fora da
base de rateio. A `ADM Central` é do sistema e não sai. Apagar a loja de um
veículo deixaria o custo sem dono, e o rateio passaria a distribuir sobre uma
base diferente da do mês anterior sem ninguém pedir.

### A regra de desempenho pegou — e com ela um defeito de verdade

O primeiro rascunho renomeava célula a célula dentro de um laço sobre a
frota, e `conferir_desempenho.js` reprovou. Virou `trocarNaColuna_`: uma
leitura e uma escrita por aba.

O conserto trouxe junto um acerto que eu não tinha visto. O rascunho
regravava a competência inteira pelo `gravarPercentuaisCompetencia_` — o que
**carimba data e responsável em todas as lojas**, inclusive as que ninguém
tocou. Agora só a célula do nome muda, e há prova de que a linha da outra
loja fica byte a byte igual.

### Mutação: 19 pegas, 1 equivalente

Honestamente: **"passar a lista de linhas do período aberto" é um mutante
equivalente** pelo caminho de cima. A guarda do lacre já garante que não
existe linha fechada quando se chega à troca, então filtrar ou não filtrar dá
o mesmo resultado. Mantive o filtro como segunda tranca — se a guarda um dia
afrouxar, o histórico continua intocado — e provei `trocarNaColuna_`
**direto**, onde o parâmetro é alcançável. Registrar isso como equivalente é
melhor que inventar uma prova que não prova nada.

Também entrou prova de que a troca **não escreve** quando nada casou:
reescrever a coluna com os mesmos valores não muda nada e custa a operação
mais cara do Apps Script.

`conferir_cadastro_loja.js` — **67 provas**.
Total do projeto: 1.004 → **1.071** provas, em 31 suítes.

## V4.28.0 — a seção 2 é toda a despesa, não só manutenção

*"a manutenção tem que buscar todos os gasto que teve com a frota exceto a
depreciação, o IPVA é embutido na depreciação"*.

A seção 2 do documento somava **oficina + pneus**. Combustível, Arla,
lavação, pedágio, multa, emplacamento, seguro e gás ficavam de fora — e o
papel que vai para a contabilidade mostrava uma fração do custo com cara de
total. Na frota de exemplo, R$ 56.506 onde o número é R$ 118.861.

Agora a seção 2 é **todo o gasto da competência menos a depreciação**, e
chama-se `2. Despesas da frota`.

### O IPVA fica de fora

Não por ser pequeno: porque o contábil **já embute o IPVA no valor da
depreciação** que manda todo mês. Somá-lo também na seção 2 cobraria o mesmo
imposto duas vezes no mesmo papel. O rodapé e a capa da planilha dizem isso
por escrito — um número ausente sem explicação vira pergunta na mesa da
contabilidade.

### A lista é derivada, não escrita à mão

```js
const R_FORA_DA_DESPESA_   = ['DEPRECIACAO', 'IPVA'];
const R_DESPESA_FECHAMENTO_ = R_COMPOEM_TOTAL_.filter(…);
const R_DESPESA_EM_OUTROS_  = R_DESPESA_FECHAMENTO_.filter(…);
```

`R_COMPOEM_TOTAL_` já era a dona de "o que é despesa no Resumo". Escrever uma
segunda lista à mão seria o caminho curto para uma rubrica nova entrar no
Resumo e **não** entrar no documento da contabilidade — sem erro nenhum, só
um total menor. Com a derivação, coluna de custo nova entra sozinha. Há prova
estática de que as duas listas são `.filter` da primeira, e prova de que a
soma das que têm coluna com as de "Outros" é exatamente o conjunto todo.

### Onze rubricas não cabem num A4

Combustível, oficina e pneus têm coluna própria — são o grosso. As outras
oito somam em **Outros**, e o rodapé lista o que há lá dentro, gerado da
própria lista. Um "Outros" sem legenda é um número que ninguém confere.

### O relatório antigo continua

`Manutenção por veículo` (oficina + pneus) não mudou: internamente é útil
saber quanto foi manutenção de fato. O que mudou foi o documento que sai da
empresa, que passou a ler um relatório novo,
`Despesas por veículo (exceto depreciação)`, também visível na tela.

### Fixture

A fixture antiga tinha só oficina e pneus — somar onze rubricas e somar duas
daria o mesmo número. Entraram combustível, IPVA e pedágio em cada veículo,
e com isso as oito mutações são pegas, incluindo "o IPVA volta para a
despesa" e "a depreciação entra na seção 2".

`conferir_pdf_rateio.js` 126 → **143**; `conferir_planilha_fechamento.js`
41 → **46**. Total do projeto: 1.071 → **1.093**.

## V4.29.0 — o relatório no formato que a contabilidade já conhece

O usuário mandou o `MOdelo_de_relatorio.xlsx`: o **Relatório Operacional dos
Veículos** da planilha antiga, que a contabilidade recebe há anos. Uma tabela
só, uma linha por veículo, vinte e uma colunas, o setor no fim.

As duas seções que eu vinha montando (depreciação e despesas) saíram. O
documento do fechamento virou essa tabela.

### O mapeamento

Quase tudo já existia no Resumo. O que o modelo tem e o sistema não tinha:

- **Tipo Com.** (G/D) — o sistema não guardava o combustível do veículo em
  lugar nenhum. Entrou a coluna **Combustível** no cadastro, com lista
  (Gasolina, Diesel, Flex, Etanol, GNV, Elétrico). **Esta é a única mudança
  estrutural: precisa rodar "Instalar / atualizar sistema".**
- **Lubrif. litros** — o Resumo soma o valor do lubrificante, não os litros.
  Sai de Lançamentos, numa passagem só. Fica vazio quando o operador não
  preencheu, que é a verdade: o sistema não sabe.

E duas diferenças deliberadas em relação ao modelo:

- **Arla 32 e Gás ganharam coluna.** O modelo é de antes de eles existirem.
  Deixá-los de fora seria perder dinheiro de vista num papel assinado.
- **A multa entra no TOTAL.** No modelo a coluna aparecia e a fórmula
  `=D+G+H+I+J+M+N+P+K` não a somava. Decisão do usuário, 30/10/2026.

### O TOTAL é somado das colunas que aparecem

Não é cópia de `R_.TOTAL`. A coluna do Resumo inclui o IPVA, e este relatório
não tem coluna de IPVA — ele já vem embutido na depreciação que a
contabilidade envia. Um TOTAL que não fecha com a soma das colunas visíveis é
a pior coisa que um relatório contábil pode ter: quem confere vai somar na
calculadora.

Isso abriu uma pergunta que ficou **pendente**: se a premissa está certa, a
coluna TOTAL do próprio Resumo está inflada em um IPVA por veículo. Não mexi
— esse número fecha o Histórico de todos os meses já encerrados.

### O tipo `decimal` queria dizer duas coisas

Achado no caminho. No PDF, `decimal` escrevia o valor **com %**; na tela,
sem. E ele era usado tanto para porcentagem quanto para litros e KM/litro —
ou seja, "248,06 litros" sairia no papel como **248,06%**. Ninguém tinha
comparado os dois formatadores.

Agora são três tipos: `decimal` é porcentagem (e a tela passou a pôr o % também),
`litros` tem três casas e `media` duas. Onze colunas migraram.

### 23 colunas numa folha A4

A folha já era deitada. Entrou um modo **compacto** na tabela do PDF (fonte
menor e `white-space: nowrap` nas células numéricas) — sem o nowrap o
navegador quebrava "R$ 1.234,00" em duas linhas e a tabela ficava ilegível,
sem dar erro nenhum.

Na planilha, a linha acima do cabeçalho virou a **faixa de grupo** do modelo:
"Combustível" por cima de litros e R$, "Lubrificante" idem.

### Mutação: 11 de 11

A última a cair foi **"Veículo novo entra no TOTAL"**: a fixture tinha zero
na coluna de imobilizado, então somá-la ou não dava o mesmo número. Com
R$ 90.000 de carro novo na fixture, o mutante fica evidente — é justamente o
tipo de valor que, somado por engano, faria o papel mentir feio.

Também caiu de novo a regra de desempenho: a faixa de grupo era escrita
célula a célula dentro de um laço. Virou uma escrita só, com as junções
depois.

`conferir_pdf_rateio.js` 143 → **152**; `conferir_planilha_fechamento.js`
46 → **47**. Total do projeto: 1.093 → **1.103**.

## V4.29.1 — exportar qualquer relatório em planilha, e a placa que ficava

Dois pedidos pequenos e uma confirmação.

### A confirmação

*"o ipva ta certo, ja vem na depreciação"*. A premissa da V4.29 está certa,
então a pergunta que ficou em **Pendente** passou a ser um fato: o TOTAL do
**Resumo** soma IPVA e depreciação, e o sistema ainda gera a parcela de 1/12
do IPVA anual do cadastro. Se vale para toda a frota, o Resumo está inflado.
Continua sem mexer, porque esse número fecha o Histórico dos meses
encerrados — é decisão de quem assina.

### Exportar em planilha qualquer relatório da tela

Botão na tela de Relatórios. Três cuidados:

- **O servidor refaz o relatório**, em vez de receber a tabela pronta do
  navegador. A tabela do cliente envelhece entre o desenho e o clique, e é
  adulterável; o que vai para a contabilidade tem de sair da base.
- **Os mesmos filtros** da tela vão junto, e o subtítulo da aba registra
  quais foram. Exportar sem filtro entregaria um arquivo diferente do que
  está na tela, e ninguém perceberia.
- **O mesmo `escreverRelatorioNaAba_` do fechamento.** Um exportador próprio
  aqui seria o caminho curto para um arquivo sair formatado e o outro sair
  como texto.

A temporária vai para a lixeira no `finally`, como a do fechamento.

### A placa que ficava preenchida

Depois de gravar, o formulário limpava valor, litros, KM, documento e
observação — e deixava a **placa**. O lançamento seguinte, que quase nunca é
do mesmo veículo, saía na placa anterior se o operador não reparasse. É um
erro que só aparece no fechamento, quando ninguém lembra mais.

Agora a placa entra na limpeza e o foco volta para ela, que é onde quem
lança em série vai digitar.

### Duas fraquezas de teste, não de código

1. A dublê de planilha gerava o id a partir de `diario.criadas.length`, e os
   blocos zeram essa lista — o id **se repetia**. A prova de "a temporária
   foi para a lixeira" passava encontrando o id de uma planilha anterior.
   Contador próprio, que só cresce.
2. A prova do foco procurava `el('placa').focus()` em qualquer lugar do
   arquivo, e isso também existe na tela de comprovantes. Passou a olhar o
   foco **logo depois da gravação**.

As duas apareceram por mutação; nenhuma teria aparecido lendo o código.

`conferir_telas.js` 13 → **24**; `conferir_planilha_fechamento.js` 47 → **56**.
Total do projeto: 1.103 → **1.123**. Mutação: 10 de 10.

## V4.29.2 — a planilha abria com uma coluna de meia tela

Duas correções do que o usuário viu ao abrir o arquivo.

### A coluna A gigante

O título ia **mesclado nas 23 colunas** e, logo depois, vinha
`autoResizeColumns`. O Sheets mede o conteúdo da célula mesclada e alarga a
**primeira** coluna até caber o título inteiro — a planilha abria com a
coluna da placa ocupando meia tela.

Duas mudanças:

- título e contexto **sem mesclar**. O texto transborda visualmente, que é o
  comportamento normal de uma célula de título numa planilha;
- **largura declarada** no lugar do autoResize. Além do problema do título, o
  autoResize mede o conteúdo: um mês com um veículo de descrição longa sairia
  com a planilha em outra largura que o mês anterior. As larguras vêm do
  catálogo do relatório — as mesmas que a aba Relatórios da planilha usa — e
  ficam presas entre 60 e 320 pixels.

### A aba de informações saiu

*"não precisa gerar uma guia Informações, somente a guia relatório"*. Ela
virou **uma linha de contexto** logo abaixo do título: empresa, competência,
período, quem gerou e quando, mais as duas ressalvas que o papel precisa
carregar — o IPVA e o que o TOTAL soma.

É melhor assim, e não só mais enxuto: a ressalva sobre o IPVA agora está na
mesma tela que o número, em vez de numa aba que ninguém abre.

O exportador genérico de relatórios ganhou a mesma linha de contexto, com a
empresa e os filtros aplicados.

`conferir_planilha_fechamento.js` 56 → **63**. Total: 1.123 → **1.130**.
Mutação: 6 de 6, incluindo "volta a mesclar o título" e "volta o autoResize".

## V4.30.0 — mandar a planilha por e-mail

Campo de e-mail em dois lugares: na tela de Relatórios, ao lado do botão de
exportar, e no cartão 5 do Fechamento. Vazio, nada muda — o arquivo só vai
para o Drive, como antes.

### Quatro decisões

**O arquivo continua no Drive.** O e-mail é uma cópia, não o único lugar
onde o documento existe. Quem for conferir daqui a seis meses procura na
pasta, não na caixa de entrada de alguém. O corpo do e-mail diz isso.

**O e-mail é validado ANTES de montar a planilha.** Errar o endereço e só
descobrir depois de dois minutos de geração obrigaria a refazer tudo. Tem
prova de que a planilha nem chega a ser criada quando o endereço está errado.

**Só a planilha vai por e-mail, não o PDF.** O PDF é para arquivar e
imprimir; mandar os dois anexos pelo mesmo campo seria surpresa. Há prova
estática disso — e a mutação que faz o PDF também receber o campo é pega.

**A cota do Gmail é conferida antes.** Sem isso o envio falharia calado
depois de o arquivo já estar gerado.

### Uma regra de validação que estava em três lugares

O regex de e-mail aparecia em três trechos: o envio de relatório por PDF, a
validação do parâmetro `EMAIL_ALERTAS` e os destinatários do alerta diário.
Três cópias da mesma regra são três chances de uma afrouxar sozinha.

Agora há um dono, `listaDeEmails_`, com duas portas:

- quem **digita na tela** recebe o erro na cara — é o certo ali;
- o **alerta diário** passa `ignorarInvalidos`, porque um endereço errado no
  parâmetro não pode derrubar o envio para os outros.

Tem prova estática de que o regex aparece **uma vez só** no arquivo.

`conferir_planilha_fechamento.js` 63 → **81**; `conferir_telas.js` 24 → **30**.
Total do projeto: 1.130 → **1.154**, em 31 suítes. Mutação: 10 de 10.

## V4.31.0 — combustível lançado, abastecimento a abastecimento

Já existia **"Abastecimento e consumo"**: o total do mês por veículo, tirado
do Resumo. O que faltava era a **origem** desse total — e é onde o problema
costuma estar.

`Combustível lançado por veículo` lista cada abastecimento: data, placa,
patrimônio, veículo, tipo, interno ou externo, nota, litros, valor, **o preço
do litro daquele abastecimento**, centro de custo e ID. Usa toda a base, não
só o período aberto, como os outros detalhamentos — conferir consumo exige
olhar para trás.

### O preço unitário é o motivo de o relatório existir

A média do mês esconde o abastecimento caro. Sete abastecimentos a R$ 6,10 e
um a R$ 9,40 fecham numa média de R$ 6,50, que parece normal. O relatório
mostra os oito.

Por isso a aritmética tem prova em três níveis, e o que se prova em cada um é
que ele **não** virou média de médias:

- **linha**: R$/litro é desta linha, não a média do veículo;
- **veículo**: valor do veículo / litros do veículo;
- **rodapé**: valor total / litros totais. A média dos preços das linhas daria
  outro número — um abastecimento de 10 L pesaria igual a um de 300.

### O consolidado deixou de ser de oficina

Os relatórios de oficina traziam um `porVeiculo` que a **tela** transformava
em tabela, com colunas fixas: *Placa, Veículo, Serviços, Natureza que mais
pesou, Total*. Isso amarrava o consolidado de qualquer relatório ao formato
da oficina — o de combustível sairia com uma coluna "Natureza que mais
pesou" vazia.

Agora cada relatório devolve um `consolidado` **pronto**, no mesmo formato
`{colunas, linhas, totais}` de todo o resto, e a tela só desenha. Os dois
relatórios de oficina passaram a usar `consolidadoOficina_`, que é o dono das
colunas deles.

### Suíte

`conferir_combustivel_lancado.js` — **40 provas**, mutação **10 de 10**.

Entre elas, uma regra que vale para qualquer relatório novo: **as colunas do
catálogo têm de bater com as do relatório, na mesma ordem**. Catálogo fora de
ordem não dá erro — produz uma planilha exportada com o cabeçalho trocado.

Total do projeto: 1.154 → **1.194**, em 32 suítes.

## V4.32.0 — unificação das duas linhagens

O código instalado na planilha tinha andado por fora: **4.30.0 mais cinco
funcionalidades** que nunca passaram por este repositório. O repositório
estava na 4.31.0. Nenhum dos dois continha o outro, e colar um por cima do
outro apagaria trabalho.

A unificação partiu do arquivo **instalado** e aplicou a 4.31 por cima — não
o contrário. O delta da 4.31 é pequeno e conhecido; o delta de fora não era,
e reconstruí-lo à mão era a chance de perder uma linha sem perceber.

> Um detalhe que custou meia hora: o arquivo veio do editor do Apps Script
> com **CRLF**, e o `diff` acusava o arquivo inteiro como diferente. Com as
> quebras normalizadas, eram 36 blocos.

### O que veio de fora, e o que já valia

Todas as seis regras estáticas passaram no código de lá sem um ajuste. Duas
das cinco funcionalidades são **conserto de defeito real**:

1. **`chaveTipoDespesa_` + mapa normalizado.** O Resumo casava o tipo do
   lançamento por igualdade de string. Um "Gás" com o acento **decomposto**
   (a + U+0301, que o Sheets grava ao colar de certos lugares) não casava,
   caía no `indice === undefined` e **o valor sumia do Resumo** — sem erro,
   sem aviso, só o total menor. Agora as chaves são normalizadas.
2. **`diagnosticarGasNoResumo`** — lista os tipos do período que o Resumo
   não soma. É a rede de segurança do item 1.
3. **Índice do total na exportação.** Lia `resumo.valores[2][19]`, que é
   **KM/litro**, não o TOTAL (coluna 21). Passou a `R_.TOTAL`.
4. **`casarAnteriores_` em duas etapas**, com `chaveEstavelPendencia_`: o
   status sobrevive quando o texto do detalhe muda por recálculo, mas nunca
   atravessa para outro veículo — só casa por grupo quando a cardinalidade
   bate.
5. **Confirmação da data da depreciação** (`DATA INCORRETA` → carimbo
   `[DATA CONFIRMADA … ]` na observação), com menu e botão.

E uma regressão: o `Lancamento.html` instalado era **anterior à V4.14** e
tinha perdido a calculadora de botijões. Voltou.

### A exceção ficou visível

`resolvidoSobrevive_` virou `return true` lá fora: RESOLVIDO passou a ser
exceção aprovada, não conserto, e não é mais desfeito pela revalidação.
Decisão do usuário, mantida.

O que ela trazia junto é que a pendência saía da contagem **e da vista**: o
mês fechava com o dado errado e ninguém via. Agora sai da conta que bloqueia
e **não** sai da vista:

- `estadoConferencia_` lê a aba uma vez e devolve `{pendentes, excecoes}` —
  as duas coisas do mesmo passe, porque dois passes são duas chances de o
  número e a lista discordarem;
- a tela de Fechamento ganha o indicador **"Aceitas como exceção"** e a
  lista nomeada, com placa, problema e a observação de quem aceitou, **antes**
  de o botão de fechar aparecer;
- a mensagem do fechamento diz quantas foram;
- e cada uma vai **nomeada para o Log**. Esse é o ponto: a aba de conferência
  é reescrita na validação seguinte, e com ela sumiria o rastro de quem
  aceitou o quê.

### Provas para o que não tinha nenhuma

- `conferir_tipo_despesa.js` — **30 provas**. A central prova o defeito do
  acento: três grafias de "Gás", inclusive a decomposta, entrando no Resumo.
- `conferir_data_depreciacao.js` — **33 provas**. Código que escreve na aba
  de Lançamentos: a fixture tem o alvo no meio, cercado de vizinhos que o
  laço precisa pular (outro tipo, outra placa, outro mês, data já correta).
- `conferir_pendencias_estado.js` reescrita para a política nova, e
  `conferir_irreversiveis.js` ganhou o bloco da exceção no fechamento.
- `conferir_ipva_parcelas.js` consultava o mapa pela chave literal e ficou
  verde por acidente quando o mapa mudou de formato. Corrigida.

Mutação: **26 de 26**.

> **Um dublê mais estrito que o original esconde guarda.** O meu
> `periodoDoMes_` terminava o período à meia-noite; o real termina às
> 23:59:59.999. Com isso o lançamento do próprio dia 25 caía fora do laço, e
> a guarda de "já está na data certa" podia ser removida do código sem
> nenhuma prova reclamar. É parente da armadilha do `Date` entre realms:
> o dublê mente e o teste passa por motivo errado.

Total do projeto: 1.194 → **1.267** provas, em 34 suítes.

## V4.33.0 — histórico de abastecimentos, com alterar e estornar

O usuário mandou as duas telas do sistema antigo: o registro de
abastecimento e, atrás dele, o **Histórico de Abastecimentos** — a sequência
do veículo com odômetro, KM percorrido, litros, média, valor, e o botão
**Estornar abastecimento**.

O pedido: quando o KM digitado for menor que o último, poder chegar a essa
tela **sem sair do lançamento**, para alterar ou estornar.

### Por que isto é mais que conveniência

A tela só oferecia a caixinha **"Forçar KM menor que a última leitura"**. E
forçar é a decisão errada na maioria das vezes: o normal é o KM **gravado**
estar errado — um dígito a menos num abastecimento de semanas atrás — não o
que a pessoa tem na mão agora. Quem forçava consertava o sintoma e deixava o
erro na base, onde ele continua estragando o KM rodado, o km/L e o R$/km.

Agora, ao sair do campo com um KM menor que o último, o painel **abre
sozinho** com a sequência na frente. Dá para ver em qual linha está o furo.

### O que o painel mostra e faz

Data, odômetro, KM do percurso, litros, média, valor e o tipo
(interno/externo); linha com percurso negativo sai em vermelho; rodapé com
total de litros, valor e a média do período. Por linha: **alterar KM** e
**estornar**.

Três decisões:

- **Dia com duas leituras não inventa odômetro.** `kmDoDia_` já era o dono
  dessa regra e devolve vazio quando há mais de uma no dia; o painel mostra
  `—` e não oferece "alterar KM". Reimplementar a consulta aqui seria a
  chance de este painel escolher uma leitura e calcular um percurso que
  nenhuma outra tela reconheceria.
- **O percurso negativo não entra no total.** Somar os −90.410 do erro daria
  um total negativo e uma média sem sentido. A média do período é percurso
  total / litros totais — média das medias faria um abastecimento de 40 L
  pesar igual a um de 500.
- **Estornar passa por `excluirLancamento_`**, não por um caminho próprio.
  Ele já guarda a cópia em "Lançamentos Excluídos", recusa período fechado,
  devolve os litros ao estoque quando o abastecimento era interno e remove a
  leitura de KM do dia. Um atalho aqui perderia um desses quatro. O
  histórico volta junto da resposta, já sem a linha estornada: recarregar
  por fora deixaria uma janela mostrando o que não existe mais.

E o painel abre no `change`, não no `input`: enquanto a pessoa digita o `3`
de 31.500, o número é menor que o último por um instante.

`conferir_historico_abastecimento.js` — **39 provas**, mutação **15 de 15**.
Total do projeto: 1.267 → **1.306**, em 35 suítes.

## V4.34.0 — o litro sai pelo preço da última carga

*"sempre pegar o último custo do diesel, não calcular média"*.

O abastecimento interno era valorizado pelo **custo médio** do tanque. Agora
é pelo preço da **última carga** até a data do abastecimento.

### A mudança estava em dois lugares, não um

A simulação do tanque existe em **dois laços**: `estadoTanque_`, que
valoriza na hora de gravar, e `recalcularAbastecimentosInternos_`, que
revaloriza quando uma carga é corrigida. Mexer num só faria o valor gravado
divergir do valor que o recálculo põe no lugar — e o número mudaria sozinho
na próxima correção de carga, sem erro nenhum.

`precoLitroCarga_` é o dono da divisão, e há regra estática conferindo que
os dois laços derivam o preço dele. Os outros consumidores foram junto: a
dica da tela, o ajuste de estoque e o alerta diário. Uma prova verifica que
**nenhum** consumidor ficou valorizando pela média.

### O que NÃO mudou, de propósito

O saldo em R$ do tanque continua sendo o que foi **pago** pelo que está lá
dentro. O critério muda o que se cobra do veículo, não o dinheiro que
entrou. A consequência — cobrar acima ou abaixo do que o estoque custou —
vira um número próprio, `diferencaValorizacao`, em vez de ficar diluída
dentro do custo de cada veículo:

> 1.000 L a R$ 6,00 e 1.000 L a R$ 8,00. Média 7,00, última carga 8,00. Um
> abastecimento de 500 L sai por R$ 4.000 em vez de R$ 3.500: R$ 500 de
> diferença, declarada.

A tela do lançamento mostra **"Litro a R$ 8,0000 (última carga)"** e, ao
lado, o custo médio do estoque quando os dois diferem.

### O ajuste de estoque não redefine o preço

Ele entra na mesma aba das cargas, com litros negativos. Se redefinisse o
preço, o litro passaria a sair por um número que nunca foi preço de nota
nenhuma. Quem barra isso é `precoLitroCarga_`, que devolve 0 para litro não
positivo — e por isso o laço pode somar sem um `if` próprio.

> Aqui a mutação ensinou algo: a primeira versão tinha **duas** guardas, um
> `if (m.litros > 0)` no laço e a do dono. O mutante que tirava a de fora
> sobrevivia — eram redundantes. Em vez de inventar uma prova, tirei a
> guarda duplicada e provei a que sobrou, onde ela mora.

### E o teste estava estourando sem eu ver

O bloco 8 da suíte nova tinha um regex com escape a mais e **derrubava o
arquivo**. Como eu filtrava a saída procurando `FALHA`, lia como verde — o
erro de leitura que o próprio `CLAUDE.md` manda evitar: *olhe o código de
saída, não a contagem de FALHA*. Quase passou.

`conferir_bomba_ultimo_preco.js` — **33 provas**, mutação **8 de 8**. O
tanque nunca tinha tido suíte própria, e é o cálculo que define quanto cada
veículo paga por litro.

Total do projeto: 1.306 → **1.339**, em 36 suítes.

### Pendente que isto cria

Os abastecimentos internos **já gravados** continuam com o valor da média.
Eles só são revalorizados quando a carga daquele período for corrigida. Se a
contabilidade quiser a competência inteira pelo critério novo, é rodar uma
revalorização do mês — que o sistema sabe fazer, mas hoje só é disparada por
correção de carga.

## V4.35.0 — o histórico abre lendo o fim da base, não a base inteira

*"a uma lentidão ao carregar o histórico"*.

O painel de abastecimentos (V4.33) abria em duas etapas, e cada uma lia a aba
`Lançamentos` **inteira**:

| | leituras | células lidas |
|---|---|---|
| `webUltimoOdometro` (a dica "última leitura") | 1 | 24 mil |
| `webHistoricoAbastecimentos` (o painel) | 2 | 144 mil |
| **abrir o painel, antes** | **2 idas** | **324 mil** |
| **abrir o painel, agora** | **1 ida** | **144 mil** |

Os números saem de `medir_modulos.js`, que ganhou um dublê de aba que **conta
as leituras e as células**. Medir tempo de JS aqui enganaria: no Apps Script o
que custa é o `getValues()`, não a conta.

### Duas economias, não uma

**1. A janela.** `lerLancamentosRecentes_(n)` lê só as últimas `n` linhas da
aba. O histórico mostra 30 abastecimentos de uma placa — a base de 2024 não
tem nada a dizer sobre isso. `JANELAS_HISTORICO_ = [8000, 30000]`: tenta
8.000, amplia só se não achou o suficiente **e** a janela ainda não chegou ao
começo. Sem a segunda condição, quem tem poucos abastecimentos ampliaria
sempre, de graça. O primeiro degrau que escrevi era 3.000 e saiu **pior**: com
170 veículos lançando, 3.000 linhas quase nunca têm 30 abastecimentos da
mesma placa, e quase toda abertura pagava as duas janelas.

A janela procura `quantos + 1`, não `quantos`: o abastecimento mais antigo que
**vai aparecer** precisa do anterior a ele para ter percurso. Com a conta
exata, a última linha da tela sairia sempre sem KM percorrido — e sem erro
nenhum, só um traço onde deveria haver número. A prova fixa um veículo com
exatamente 3 abastecimentos na janela e um quarto antes dela; o mutante
`>= quantos` é pego por ela.

**2. A ida.** O histórico passou a devolver `ultimaLeitura` junto, e a tela
aproveita em vez de chamar `webUltimoOdometro`. Cada `google.script.run` é uma
**execução nova**, que relê a planilha do zero: o custo fixo da ida pesa mais
que a conta que ela faz. O estorno também não volta ao servidor só pela dica —
o histórico que ele devolve já vem atualizado.

`ultimoOdometro` deixou de ter `getValues()` próprio e passou a usar
`ultimaLeituraOdometro_` sobre `lerOdometro_()`, que tem cache de execução. O
endpoint continua existindo (a tela usa ao trocar de placa), mas agora as duas
telas respondem a **mesma** última leitura por construção, não por coincidência
— e a prova confronta os dois lados.

### O que mudou de comportamento: o rodapé

Os totais do painel (litros, valor, percurso, média, retrocessos) passaram a
ser **dos abastecimentos que aparecem**, não da base inteira. Não é um efeito
colateral aceito de má vontade: totalizar a base inteira obriga a lê-la
inteira — que é justamente o que deixava o painel lento — e dava um número que
**não fecha com nenhuma coluna da tela**. A tela antiga que o usuário usava
rotulava isso "Média no período", e é o que ele conferia. Quando a lista é uma
janela, a mensagem diz: *"30 abastecimento(s) mostrado(s) • janela dos
lançamentos mais recentes"*.

### Suíte

`conferir_historico_abastecimento.js` — 48 → **53 provas**. As novas: a janela
lê uma vez quando a base cabe; para na primeira janela numa base de 20.000;
**amplia** quando o veículo só aparece no começo; procura a folga do percurso;
o rodapé fecha com as colunas da tela; e as duas pontas da economia da ida (o
servidor manda `ultimaLeitura`, a tela aproveita, o estorno não pede de novo).

Por mutação, 12 defeitos reintroduzidos, **12 pegos**. Os dois que
sobreviveram na primeira rodada foram justamente os dois acima — a folga do
`+1` e a tela voltar a fazer a segunda chamada —, e os dois são do tipo que
mais voltou neste projeto: **um lado de um contrato que tem dois**. A prova do
servidor mandando o dado passava sozinha com a tela ignorando ele.

### Instalação

`Codigo.gs` e `App.html`. **Não precisa** rodar *Instalar / atualizar
sistema*: nada de aba, coluna, gatilho ou parâmetro mudou.

## V4.35.1 — o "carregando o histórico…" que não saía

O usuário abriu o painel e ele ficou no *carregando* para sempre: **nenhuma
mensagem, nenhum erro**. Esse é o pior sintoma possível, porque não distingue
três causas diferentes — e no código havia um caminho silencioso para cada
uma:

| o que aconteceu | o que a tela mostrava |
|---|---|
| o servidor não respondeu (execução derrubada) | "carregando…" para sempre |
| a resposta voltou vazia | "carregando…" para sempre |
| a resposta voltou e **o desenho quebrou** | "carregando…", e o erro só no console do navegador |

O `withFailureHandler` cobria só o primeiro caso, e mesmo assim não cobre o
pior: quando a execução do Apps Script morre ou a **resposta não serializa**,
o `google.script.run` não chama nem o sucesso nem a falha. Ninguém avisa nada.

### A causa provável, e ela é a assimetria de sempre

O filtro do histórico aceitava a data assim:

```js
Object.prototype.toString.call(l[L_.DATA]) === '[object Date]'
```

**Uma `Date` inválida passa nesse teste.** Ela não dá erro ao ser montada, nem
ao ser ordenada: quebra na hora de serializar a resposta — e aí o
`google.script.run` some sem chamar handler nenhum. `ultimaLeituraOdometro_`
já checava `isNaN(d.getTime())`; este lado, não. É a quinta vez neste projeto
que o defeito é **um lado de um contrato que tem dois**.

Junto com isso, a `Date` crua saiu do payload: ela já tinha servido (ordenar e
calcular o percurso) e **ninguém na tela a lê** — a tela usa `dataBR` e
`dataIso`. Menos payload e uma porta a menos de serialização.

### E a tela nunca mais fica muda

- **Relógio de 60 s**: se nada voltou, o painel diz que o servidor não
  respondeu e oferece *tentar de novo*. Desarmado nos **dois** desfechos —
  desarmar só no sucesso faria o aviso aparecer por cima de um erro já
  mostrado.
- **Resposta vazia** e **erro ao desenhar** viram mensagem na caixa, não
  `return` calado. O `if (!h) return;` do `desenharHistoricoAbastecimento` era
  literalmente uma das portas de saída silenciosas.
- **A vez da resposta** (`HIST_ABAST_SEQ`): trocar de placa com uma resposta
  em voo desenhava o histórico do veículo anterior sob o nome do novo. Os três
  desfechos respeitam a vez.
- O rodapé passou a mostrar **`N ms no servidor`**. Quando voltar a demorar,
  dá para ver se o tempo é do servidor ou da tela, em vez de adivinhar.

### Suíte

`conferir_historico_abastecimento.js` — 53 → **64 provas**. Por mutação, 13
defeitos reintroduzidos, **13 pegos**. Dois sobreviveram na primeira rodada e
os dois eram prova minha mal escrita, não defeito do código: um regex que
casava com o `catch` mesmo depois de a mensagem sair dele, e outro que
aceitava **uma** verificação de vez onde o contrato tem três.

### Instalação

`Codigo.gs` e `App.html`. **Não precisa** rodar *Instalar / atualizar
sistema*.

## V4.36.0 — cinco frentes de uma vez

Um pedido só, seis itens. Cinco viraram código; o sexto virou pergunta, e está
no fim desta seção.

### 1. O Emplacamento do cadastro saiu

O usuário pediu para remover o campo e deixar só o IPVA anual, e pediu que eu
conferisse **qual dos dois é o válido**, porque os dois tinham a mesma
finalidade. Fui ver o que cada um faz hoje:

| | o que era |
|---|---|
| **Emplacamento** (coluna 7 do cadastro) | somado **todo mês** ao Resumo, direto do cadastro: sem data, sem documento, sem competência, sem log. Nunca passou pela máquina de lançamentos. |
| **IPVA anual** (coluna 13) | desde a V4.8.7, só o **valor sugerido** na hora de gerar. A despesa vira 12 parcelas lançadas, cada uma com ID, data, competência e log. |

O válido é o **IPVA anual**. O Emplacamento era o único valor do sistema que
virava custo **sem ser lançado** — e, pior, caía na **mesma coluna** do Resumo
que recebe os lançamentos do tipo `Emplacamento/IPVA/Seguro`, onde ninguém
conseguia separar os dois. Emplacamento que acontece de verdade continua tendo
onde ser lançado: é um tipo de despesa, como qualquer outro.

O que ficou: a coluna da planilha **não** foi removida (removê-la deslocaria
todas as outras, contra a regra do projeto), só rotulada *"Emplacamento (não
usado)"*; e a gravação do cadastro passou pelo `manter`, que conserva o valor
histórico. Sem isso, a primeira edição de cada veículo zeraria 167 células em
silêncio — zerar não dá erro, só apaga.

**Efeito que vale dizer:** um mês já encerrado, quando **recalculado**,
deixa de receber o Emplacamento. Os números já apurados e o Histórico não
mudam; o recálculo passa a bater com o que foi lançado, que é o que se queria.

### 2. O módulo Comprovantes atrasados saiu

Tela, endpoints, cache, alerta diário e as sete listas de instalação. A aba
**"Comprovantes Atrasados" da sua planilha não é apagada** — ela só deixa de
ser usada e mantida; o que estiver lá continua lá.

Isso rendeu uma regra nova em `conferir_telas.js`, que é o espelho exata da
que já existia. A antiga cobrava que uma tela NOVA apareça nas três listas
(menu, perfis, `TELAS_WEB`) — foi assim que Orçamento e Comprovantes ficaram
invisíveis por duas versões. A nova cobra que uma tela REMOVIDA saia das três:
sobrar numa delas deixa um item de menu chamando função que não existe mais —
a tela abre em branco, ou o `<script>` inteiro quebra.

### 3. Combustível desabilitado nas lojas 01–19 e CB01–CB10

A marca mora no **centro de custo**, não no veículo: veículo muda de loja e a
regra acompanha sozinha, sem ninguém lembrar de remarcar 167 cadastros. A aba
Centros ganhou a coluna **Combustível** (SIM/NÃO), e a tela de Centros ganhou
um botão por loja — *liberar* / *bloquear* — que grava na hora. Ele não espera
o botão "Salvar rateio" de propósito: o percentual é **por competência**,
abastecer ou não é **de hoje**.

O padrão é lido do **número** do nome, não por comparação de texto: "Loja 01",
"LOJA 1 — Tubarão" e "01" são a mesma loja escrita de três jeitos, e comparar
texto erraria nos três. O Instalar preenche só as células **vazias** — a loja
que você liberar à mão continua liberada na próxima versão.

São três lados, e os três estão provados:

1. **o servidor recusa** o lançamento (tela escondida continua alcançável por
   quem monta a chamada);
2. **a tela não oferece** o que o servidor recusa (senão a pessoa preenche
   tudo e só descobre no botão) — os tipos de combustível somem da lista e
   aparece o porquê, com o nome da loja;
3. **o km/l não conta o KM** de quem não abastece pelo sistema. Esse é o lado
   silencioso: o veículo roda e abastece por fora, e contar o KM com zero
   litro faz a média da frota subir sozinha e descrever uma frota que não
   existe. O KM continua inteiro no total e no R$/km, que são contas de outra
   coisa.

Só o **combustível** é bloqueado: oficina, pneu e pedágio da mesma loja
continuam normais. E o que já foi lançado não muda.

### 4. Filtro de período no Histórico / estornar

Dois campos de data **antes** do botão — escolher depois de gerar obrigaria a
gerar duas vezes, e a primeira é justamente a cara (lê a base). Sem datas,
segue mostrando os 30 mais recentes.

Dois detalhes que não são detalhe:

- **O dia escolhido entra inteiro.** O parser do sistema devolve meio-dia; usar
  isso como corte engoliria a manhã do dia inicial e a noite do dia final — e
  um lançamento sumido do filtro não parece defeito, parece que não existe.
- **A janela da V4.35 amplia quando o período é antigo.** A primeira janela é
  feita dos lançamentos mais recentes: março de 2024 simplesmente não está
  nela. Sem ampliar, a resposta seria "nenhum abastecimento" com os
  abastecimentos existindo.

A abertura **automática** do painel (quando o KM digitado é menor que o
último) **ignora** o filtro: ali a pergunta é outra — "qual é a sequência
recente deste veículo?" — e um filtro antigo deixado na tela faria o painel
abrir vazio exatamente no momento em que ele mais precisa aparecer. O estorno,
ao contrário, devolve o histórico no **mesmo** período.

### 5. Frota Entregas

As quatro famílias da planilha do usuário (Carga Seca e Frigorífico, Caminhão
e Carreta) **já eram categorias do cadastro**, e o parâmetro `GRUPOS_FROTA` já
as juntava num grupo. Faltava poder **filtrar** por ele. O grupo foi renomeado
de "Transporte" para **Frota Entregas** (com migração que só age sobre o
padrão antigo, palavra por palavra — quem já mexeu no parâmetro não é
atropelado), e o filtro "Categoria" dos relatórios virou **"Categoria ou
grupo"**: um campo só, com os grupos num `optgroup` em cima.

Um campo e não dois porque são a mesma pergunta — *que parte da frota?* — e
dois campos abririam a combinação impossível (categoria de um grupo + outro
grupo) só para alguém descobrir depois que ela volta vazia.

O risco da mudança tinha nome: a comparação de categoria estava repetida em
**oito lugares** (`String(linha) !== categoria`). Oito lugares seriam oito
chances de um relatório ignorar o grupo **em silêncio** e devolver a frota
inteira — sem erro nenhum, só um número maior do que devia. A comparação ganhou
um dono único (`categoriaCasa_`), e há regra estática cobrando que ninguém
volte a comparar por fora.

### 6. O estoque de óleo: o que NÃO foi feito, e por quê

O pedido anterior era "faz o controle de estoque do óleo também". Ao perguntar
se seria um produto ou vários, a resposta foi **"somente diesel"** — que eu li
como *o estoque continua sendo só o que já existe* (DIESEL S10 e ARLA 32), sem
tambor de lubrificante. É a leitura mais provável, porque em pt-BR "óleo" é
com frequência o óleo **diesel**, que já tem controle. **Não implementei**, e
disse isso na entrega. Se era o lubrificante mesmo, é uma versão própria: é
produto novo no tanque, e portanto estrutural.

### Suítes

Duas novas — `conferir_loja_sem_combustivel.js` (52) e
`conferir_frota_entregas.js` (34) — e `conferir_cadastro_veiculo.js` (10), que
guarda o contrato do `manter`. `conferir_historico_abastecimento.js` foi de 64
a 81. `conferir_comprovantes.js` foi apagada. **38 suítes, ~1.420 provas.**

Por mutação, 44 defeitos reintroduzidos, **44 pegos**. Três sobreviveram na
primeira rodada, e os três eram prova minha mal escrita, não defeito do
código: um dublê de aba que aceitava pedir a coluna 4 de uma planilha com 3
(e por isso não provava nada sobre a coluna ser opcional); uma prova que
contava linhas e passaria com zero; e um fixture em que todo lançamento era ao
meio-dia, que não distinguia o corte do dia do corte do meio-dia.

### Instalação

`Codigo.gs` e `App.html`, e **precisa** rodar *Instalar / atualizar sistema*:
a aba Centros ganhou coluna. O Instalar também renomeia o grupo e preenche o
padrão das lojas.

**Para a Frota Entregas funcionar**, os ~30 veículos da planilha precisam estar
no cadastro com uma das quatro categorias: `Carga Seca Carreta` → **Carreta
Normal**, `Frigorifico Caminhao` → **Truck Frigorifico**, `Frigorifico Carreta`
→ **Carreta Frigorifica**, `Carga Seca Caminhao` → **Truck Normal**. Fica
pendente conferir isso na planilha dele — e as placas vêm em **pares**
(cavalo-carreta, "MCZ2627-QHC8466"), enquanto o sistema cadastra **uma placa
por veículo**. A capacidade em toneladas da planilha também não tem campo hoje.

## V4.37.0 — classificar em lote, diesel por semana/mês, e um defeito que já estava em produção

### 1. Classificar veículos em lote

A V4.36 deixou o filtro "Frota Entregas" dependendo da **categoria** do
cadastro, e abrir 30 cadastros à mão para preenchê-la é onde a pessoa desiste.
Botão novo em **Veículos → 🏷️ Classificar em lote**: cola as placas (ou os
números de patrimônio), escolhe a categoria, pronto.

Três decisões que não são óbvias:

- **Só a coluna Categoria é escrita**, numa leitura e uma escrita. Gravar a
  linha inteira levaria junto valores lidos antes de outra edição; gravar
  linha a linha seriam 30 escritas, que é o que custa caro no Apps Script.
- **O hífen não separa itens.** A frota do usuário tem placa gravada em par
  (cavalo-carreta, `MCZ2627-QHC8466`) e `normalizaPlaca_` já trata hífen como
  espaço. Quebrar ali transformaria um veículo em dois que não existem.
- **Quem não foi encontrado é dito item por item.** "3 não encontrados" sem
  dizer quais obriga a conferir os 30 na mão — que é o trabalho que o botão
  existe para evitar.

A busca passa por `resolverVeiculo_`, o mesmo de sempre, e por isso aceita
patrimônio. Um índice próprio aqui seria uma segunda implementação das regras
de placa e patrimônio — o defeito que mais voltou neste projeto. Isso fez a
regra de desempenho acusar varredura em laço; está em ACEITAS com o motivo (a
lista tem teto de 500 e `resolverVeiculo_` trabalha sobre cache de execução,
sem leitura de planilha a mais por item).

### 2. Diesel por semana e por mês

Relatório novo, com **duas tabelas**: por semana (segunda a domingo, últimas
12) e, abaixo, por competência (últimos 12 meses). Litros, R$, R$/litro, e a
separação entre **litro do tanque** e **litro de fora**.

**O que conta como diesel.** O lançamento não diz o combustível — diz
"Combustível Próprio/Terceiros". Quem sabe são duas outras coisas:

- abastecimento **interno** sai do tanque, e o tanque é DIESEL S10: é diesel
  por construção, mesmo que o cadastro do veículo diga gasolina. Divergência
  assim é erro de cadastro, não combustível diferente — e tirar esses litros
  faria o relatório não fechar com o saldo do tanque;
- abastecimento **externo** depende do campo Combustível do veículo.

Campo **vazio conta como diesel**, e isso é escolha, não descuido: o campo
nasceu na V4.29 e a maior parte da frota ainda não o tem. Excluir o vazio
devolveria um relatório quase zerado, que parece defeito. Então o relatório
**conta quantos litros vieram de veículo sem combustível declarado e diz isso
na própria mensagem** — o número fica auditável em vez de só otimista.

O domingo pertence à semana que começou na **segunda anterior**: com
`getDay() === 0` recuando zero dias, o domingo abriria uma semana sozinho e
toda semana apareceria partida em duas. O R$/litro do rodapé é `valor /
litros`, não média das semanas — média de médias faria a semana de 50 L pesar
igual à de 5.000.

### 3. PDF para qualquer relatório

Até aqui só o fechamento e o rateio saíam em PDF. Agora todo relatório tem
**📄 Gerar PDF** ao lado de *Exportar em planilha*, com os mesmos filtros e o
mesmo campo de e-mail. Os dois botões montam os filtros no **mesmo** lugar
(`filtrosDoRelatorio`): dois montadores seriam a chance de o PDF sair de um
filtro e a planilha de outro, com os dois circulando como o mesmo relatório.

O PDF reusa `tabelaRelatorioPdf_`, o renderizador do fechamento. E o bloco
**consolidado** — que até aqui só ia para a tela — passou a sair **no PDF e na
planilha**. Sem isso, o relatório de diesel, pedido "semanal mensal",
perderia justamente a metade mensal no arquivo.

### 4. O defeito que já estava em produção

Ao escrever o PDF do diesel apareceu isto: `'litros'` e `'media'` **não
estavam** na lista de tipos numéricos dos relatórios. Três efeitos, todos
silenciosos:

1. no PDF a célula caía no ramo de texto e saía como **número cru** —
   `248.0655`, que em pt-BR se lê como **milhar**. É o defeito que o CLAUDE.md
   deste projeto chama pelo nome: não dá erro, **mente**;
2. a coluna saía alinhada à esquerda, como texto;
3. o rodapé **não somava os litros**, porque o somador pergunta a essa mesma
   lista quem é número.

O **PDF do fechamento que vai para a contabilidade já saía assim**, nas
colunas "Comb. litros", "Lubrif. litros" e "KM/litro". Corrigido no dono
único (a lista + o formatador), o que conserta PDF, alinhamento e os totais
de uma vez — a coluna de litros do relatório operacional passa a ter total.

### Suítes

`conferir_lote_e_diesel.js`, nova, com 51 provas. **39 suítes, ~1.495
provas.** Por mutação, 20 defeitos reintroduzidos, **20 pegos**. Dois
sobreviveram na primeira rodada e os dois eram prova minha fraca, não defeito
do código: a lista colada repetia o mesmo veículo de três formas e o total não
mudava de jeito nenhum; e o abastecimento interno do fixture era de um veículo
cujo cadastro já dizia Diesel, então "interno é diesel por construção" não
estava sendo exercitado. O segundo virou a prova mais útil do arquivo.

### Instalação

`Codigo.gs` e `App.html`. **Não precisa** rodar *Instalar / atualizar
sistema*: nenhuma aba, coluna, gatilho ou parâmetro mudou nesta versão.

## V4.38.0 — filtro de período nos relatórios, e o de diesel legível

*"vamos colocar um filtro por período e faça um relatório mais fácil de
compreender"*.

### O filtro de período, e onde ele NÃO aparece

Campos **de / até** na tela de Relatórios. A parte que exigiu decisão foi a
outra: **em quais relatórios ele age**.

Dos 22 relatórios, 10 leem a base de lançamentos e 12 leem o Resumo. O Resumo
é recalculado **para a competência aberta** — não há onde aplicar um
intervalo. Oferecer o campo neles seria um filtro que não age: o número sai
igual e a pessoa acha que filtrou, que é pior do que não ter filtro. Então o
campo **só aparece em quem o aceita**, e em quem não aceita a tela escreve o
motivo em vez de simplesmente esconder — campo que some sem explicação vira
"sumiu o filtro".

Isso deriva da **fonte** declarada no catálogo, não de uma lista à parte. Uma
lista seria mais um lugar para esquecer ao criar relatório novo, e o sintoma
seria exatamente o filtro que a tela oferece e o servidor ignora em silêncio.

Nos dois relatórios que já eram "do período" (Extrato e Ativos), o intervalo
escolhido **substitui** a competência aberta em vez de ser cruzado com ela:
pedir janeiro e receber a interseção com novembro devolveria vazio sem
explicar por quê.

**Dono único do recorte.** `intervaloDeDatas_` nasceu aqui e o filtro do
histórico de abastecimentos (V4.36) passou a usá-lo — ele tinha a própria
cópia. Duas implementações seriam a chance de o relatório cortar o dia ao
meio-dia e o histórico à meia-noite, com os dois mostrando números diferentes
do mesmo período. Por mutação, trocar o histórico de volta por uma cópia
derruba **10 provas**.

E o cabeçalho do PDF e da planilha passou a dizer **qual período gerou aquele
arquivo**. Dois PDFs do mesmo relatório, com números diferentes e nada escrito
que explique a diferença, é indefensável na mão da contabilidade.

### O relatório de diesel, relido

O que mudou, e por quê:

| antes | agora |
|---|---|
| semana em cima, mês embaixo | **mês em cima** (a visão), semana embaixo (o detalhe) |
| `2026-11` | **NOVEMBRO/2026** |
| "Litros", "Valor", "R$ / litro", "L. do tanque", "L. de fora" | "Litros", **"Gasto R$"**, **"Preço médio R$/L"**, **"Do tanque (L)"**, **"Comprado fora (L)"** |
| — | **"Variação de litros"** contra o período anterior |
| — | o mês/semana **em curso** marcado como tal |
| a mensagem era só a ressalva | abre com **um resumo que se lê sozinho** |

A variação **só sai entre períodos completos**. Comparar meio mês com um mês
inteiro é uma mentira que não dá erro — é só uma seta para baixo, e todo dia 2
alguém perguntaria o que aconteceu com o consumo. O mesmo vale para a semana
que ainda não terminou.

O resumo que abre a mensagem aparece na tela **e logo abaixo do cabeçalho do
PDF**: *"No período: 860,000 L de diesel, R$ 5.225,00, preço médio R$
6,076/L. 230,000 L saíram do tanque e 630,000 L foram comprados fora."*

### Suítes

`conferir_lote_e_diesel.js` foi de 51 para **72 provas**; `conferir_telas.js`,
de 42 para 51. **39 suítes, ~1.525 provas.** Por mutação, 22 defeitos
reintroduzidos, **22 pegos** — cinco sobreviveram na primeira rodada e os
cinco eram fixture fraco: o relatório tinha **um só mês**, então "a variação
só sai entre completos" não estava sendo exercitado de jeito nenhum. Com dois
meses e três semanas no fixture, os cinco caem.

### Instalação

`Codigo.gs` e `App.html`. **Não precisa** rodar *Instalar / atualizar
sistema*.

## V4.38.1 — "o que é isso, está meio confuso"

O usuário mandou um recorte do PDF do diesel: dois blocos com as mesmas
colunas, os mesmos números e um TOTAL em negrito repetindo a linha de cima.
Eram quatro problemas somados, e um deles era pior do que a imagem mostrava.

### 1. Duas tabelas sem nada que diga qual é qual

O relatório devolve a tabela do mês e, em `consolidado`, a da semana. O
renderizador genérico da tela **ignorava** `titulo`, e no PDF o título existia
mas não explicava a relação entre as duas. Resultado: dois blocos idênticos,
com o mesmo total — o que está **certo** (são o mesmo universo em dois
recortes), mas parece número repetido por engano.

Agora as duas têm título, e a de baixo tem subtítulo: *"O mesmo período da
tabela acima, aberto por semana: os totais das duas fecham no mesmo número."*

### 2. TOTAL que repete a única linha

Tabela com **uma** linha mostrava o mesmo número de novo, em negrito, logo
abaixo. Não é total de nada: é a própria linha. A regra entrou nos **três**
renderizadores — tela, PDF e planilha.

### 3. Litros demais

`14.902,100 L` num total de mês. As três casas são a precisão de **um
abastecimento**, e esse relatório não mostra abastecimento nenhum. Entrou o
tipo `volume` (1 casa): **14.902,1 L**.

### 4. O pior, e que a imagem não mostrava: na TELA, litros saíam crus

O `formatar` do App.html conhecia `moeda`, `moeda3`, `numero` e `decimal` — e
mais nada. As 12 colunas `litros`, as 3 `media` e a nova `volume` caíam no
`default`, que devolve o valor como veio: **`14902.1`**. Em pt-BR esse ponto
se lê como separador de milhar. Não dava erro: mentia. E mentia **só na
tela**, porque o PDF (corrigido na V4.37) saía certo — os dois documentos do
mesmo relatório mostrando coisas diferentes.

É o mesmo defeito da V4.37, do outro lado do contrato. Por isso a correção
veio com a regra que faltava:

### A regra que fecha o contrato

`conferir_lote_e_diesel.js` passou a **varrer os tipos de coluna declarados
pelos relatórios** e cobrar, para cada um, que os **três** formatadores o
conheçam: a tela sabe formatar, o PDF sabe formatar, a planilha tem formato
próprio (e não `@`, que gravaria número como texto e a contabilidade não
conseguiria somar), e ele está nas duas listas de "é numérico" — a do servidor
e a da tela.

São 7 tipos × 4 lados = 28 provas que antes não existiam. Tipo novo sem os
quatro lados agora reprova na hora, em vez de aparecer num recorte de tela
semanas depois.

### Suítes

`conferir_lote_e_diesel.js`: 72 → **111 provas**. **39 suítes, ~1.564
provas.** Por mutação, 18 defeitos reintroduzidos, **18 pegos**. Três
sobreviveram na primeira rodada, todos por regex frouxo: duas condições
idênticas no PDF e na planilha (a prova passava olhando a do PDF enquanto a da
planilha estava quebrada), e dois `return` que começavam igual.

### Instalação

`Codigo.gs` e `App.html`. **Não precisa** rodar *Instalar / atualizar
sistema*.

## V4.39.0 — extrato do tanque e aferições

*"Extrato do tanque por período, histórico de aferições, no relatório eu
preciso saber só quantos litros foram dados baixa do estoque."*

A última frase é a que manda no desenho. O relatório **abre** com esse número
— *"Baixa do estoque no período: 3.500,0 L"* — e ele é **coluna própria**, não
uma conta que alguém tenha de fazer somando linhas.

### O que é "baixa", escrito no próprio relatório

Baixa é o **abastecimento interno** do veículo: o que sai do tanque. Compra
feita fora não encosta no estoque. Isso vai na mensagem, porque é a confusão
mais fácil de cometer — e somar as duas dobraria o consumo.

Não existe "lançamento de saída" separado, de propósito: a saída **é** o
abastecimento, e é isso que garante que o estoque e o custo por veículo contam
a mesma coisa.

### O extrato

| bloco | o que responde |
|---|---|
| **Resumo do período** | por produto: saldo inicial, entrou, **baixa do estoque**, ajustes, saldo final, valor em estoque |
| **Dia a dia** | entradas, baixa, ajustes e o **saldo ao fim de cada dia** — a ficha que se põe na frente de quem vai conferir |
| **Cargas recebidas** | data, NF, litros, valor e R$/litro |
| **Aferições** | data, produto, diferença e **quem fez e por quê** |

A conta fecha por construção, e isso é prova: *saldo inicial + entradas +
ajustes − baixa = saldo final*. **Extrato que não fecha é pior que extrato
nenhum, porque parece conferido.**

Dois detalhes que custaram decisão:

- **Aferição não é carga.** Ela mora na mesma aba (`Carga na Bomba`) com o
  documento `AJUSTE-ESTOQUE`. Somá-la às notas faria uma correção para menos
  virar "compra negativa" no meio das NFs. Por mutação, confundir as duas
  derruba **7 provas**.
- **O saldo inicial é o do instante ANTERIOR ao início do período**, e o dia a
  dia parte dele. Começar do zero faria a ficha fechar num número que não
  existe, e o extrato não bateria com o do mês anterior.
- O rodapé do dia a dia **não totaliza o saldo**: somar saldos de dias
  diferentes não significa nada.

### As aferições, também como relatório próprio

Porque a pergunta é outra: o extrato responde *"quanto saiu"*; este responde
*"quem mexeu no saldo, quando e com que justificativa"* — que é a pergunta de
quem audita. As colunas são declaradas **uma vez** e usadas nos dois lugares;
duas definições seriam a chance de uma ganhar coluna e a outra não.

### O que isso exigiu por baixo: blocos

O payload de relatório tinha **um** `consolidado`. O extrato precisa de
vários. Entrou `blocos`, e com ele uma correção de algo que eu mesmo tinha
deixado quebrado na V4.38: **na tela o bloco saía ANTES da tabela e no PDF
DEPOIS** — com o mesmo subtítulo nos dois. O do diesel dizia *"o mesmo período
da tabela acima"* e, na tela, saía **acima** dela.

Agora cada bloco declara `posicao` (`antes` / `depois`, com `depois` como
padrão) e os **três** renderizadores obedecem. O consolidado "por veículo"
continua no topo, que é onde ele serve.

### Suítes

`conferir_extrato_tanque.js`, nova, com **38 provas**. **40 suítes, ~1.605
provas.** Por mutação, 15 defeitos reintroduzidos, **15 pegos**. Um sobreviveu
na primeira rodada: o saldo corrente partindo do zero passava despercebido
porque o fixture começava com o tanque vazio — com um recorte que começa no
meio do mês, cai.

### Instalação

`Codigo.gs` e `App.html`. **Não precisa** rodar *Instalar / atualizar
sistema*.

## V4.39.1 — o "+14.079,61%"

O usuário mandou um recorte do relatório de diesel perguntando o que eram as
colunas, e no meio delas estava **+14.079,61%**.

O número estava **certo**. A base de comparação é que não existia: o mês mais
antigo da janela tinha **4 abastecimentos e 110 L** porque era quando o
sistema começou a ser usado. O mês seguinte, com 15.600 L, dividido por
aqueles 110 L, dá 141 vezes — e vira uma porcentagem que não descreve nada.

A V4.38 já marcava como "em curso" o período que **ainda não terminou**. O
que faltava eram as outras duas formas de um período sair pela metade:

1. **o recorte de datas cortou uma ponta dele** — pedir "de 04/11" e comparar
   a meia semana de 02/11 com a semana inteira seguinte é a mesma mentira;
2. **a base começa no meio dele** — o caso acima.

As três passaram a sair de um lugar só, `periodoEstaInteiro_`. Quem não está
inteiro é marcado e **não serve de base de comparação**.

Um detalhe que só aparece em uso: a **competência aberta é "em curso" mesmo
quando o dia 25 já passou**. Competência parada em outubro, com hoje em
novembro, ainda recebe lançamento — comparar com ela é comparar com um mês que
ainda vai crescer.

### Dois defeitos meus no caminho, e o que os pegou

- **`instanceof Date`.** Escrevi a guarda nova com `instanceof`, que é
  exatamente o que o `CLAUDE.md` deste projeto proíbe: uma `Date` de outro
  realm não passa nele, a guarda é pulada **em silêncio** e o período aparece
  completo. Quem expôs foi a própria suíte, cujo fixture monta as datas fora
  do `vm`. Agora é `ehDataReal_`, com `Object.prototype.toString.call`.
- **Decidir dentro do laço.** Eu calculava `primeiraData` na mesma passada em
  que marcava os baldes, então os primeiros baldes viam um valor provisório —
  o da primeira linha **lida**, não a primeira da base. O resultado mudava
  conforme a ordem das linhas na planilha. A completude passou a ser decidida
  **depois** do laço, quando `primeiraData` já é a menor de todas.

O segundo é o tipo de defeito que teste nenhum pega por sorte: só apareceu
porque o fixture tem a linha mais antiga **no fim** da lista.

### Suítes

`conferir_lote_e_diesel.js`: 111 → **116 provas**, com uma prova para cada uma
das três formas de o período sair pela metade, mais a competência parada.
**40 suítes, ~1.610 provas.** Por mutação, 13 defeitos reintroduzidos, **13
pegos** — quatro sobreviveram na primeira rodada, todos por fixture que não
distinguia as regras entre si (um mês só, uma semana só, a base começando no
mesmo período que se queria provar completo).

### Instalação

`Codigo.gs`. **Não precisa** rodar *Instalar / atualizar sistema*.

---

# Pendente

- **IPVA contado duas vezes no Resumo.** O usuário confirmou em 30/10/2026
  que o IPVA **já vem embutido na depreciação** que a contabilidade envia. O
  relatório operacional (V4.29) tira o IPVA do TOTAL por isso. Mas a coluna
  `TOTAL R$` do **Resumo** continua somando os dois, e o sistema ainda gera a
  parcela de 1/12 a partir do IPVA anual do cadastro. Se a premissa vale para
  toda a frota, o Resumo está inflado em um IPVA por veículo por mês. Não
  mexi: esse número fecha o Histórico de todos os meses já encerrados, e
  corrigi-lo muda o passado. **Decisão pendente do usuário:** parar de gerar
  a parcela, zerar o IPVA anual do cadastro, ou manter como está.

- **Revalorizar a competência inteira pelo novo critério (V4.34)** — os
  abastecimentos internos já gravados continuam com o valor da média móvel; só
  são revalorizados quando a carga do período é corrigida. Ofereci um botão
  "revalorizar o mês"; sem resposta do usuário.
- **Frota Entregas: placas em par e capacidade** — o botão de classificar em
  lote (V4.37) resolve o preenchimento da categoria. Falta conferir se os ~30
  veículos da planilha do usuário foram mesmo classificados. E as placas
  dele vêm em par (cavalo-carreta); o sistema cadastra uma placa por veículo.
  A capacidade em toneladas não tem campo.
- **Estoque de lubrificante** — pedido e depois respondido com "somente
  diesel", lido como "sem tambor de óleo". Se for o lubrificante mesmo, é
  produto novo no tanque (estrutural).
- **Aba "Comprovantes Atrasados" órfã** — o módulo saiu na V4.36 e a aba não
  foi apagada, de propósito. Quando o usuário confirmar que não precisa mais
  do que está lá, pode ser removida à mão.
- **`ABA_ORIGEM` sem uso** — a coluna 12 de Veículos guarda o nome da aba de
  origem na migração das 170 abas, e **nada no código atual lê ou escreve nela**.
  Pode já conter um agrupamento útil da planilha antiga; vale olhar antes de
  descartar.
- **Suíte do fechamento** — coberta em parte pela V4.26.1
  (`conferir_irreversiveis.js`): `webFecharPeriodo`, `webExcluirVeiculo` e
  `webAjustarEstoqueBomba` têm provas. Faltam **`webCorrigirLancamento`** (o
  desfazer: o original tem de voltar com o mesmo ID quando o novo não salva)
  e **`webGerarDepreciacao`**.
- **Formatação condicional do Resumo** ainda usa a regra antiga (2× a média da
  frota no R$/km) e segue pintando todo caminhão. Ver V4.9.5.
- **ARLA no tanque sem controle de validade** — o produto tem prazo; o módulo
  controla saldo e custo, não vencimento.
- **Manutenção preventiva** — o KM é capturado no abastecimento, mas o lançamento
  de oficina não guarda o odômetro do momento. Sem isso não dá para alertar
  "próxima troca em X km". Desenho já acordado para a próxima versão: campo KM em
  todo lançamento de oficina, **pré-preenchido** com o último odômetro conhecido
  da placa (o operador confirma, não digita), opcional em geral e **obrigatório
  quando o serviço está no plano** — sem KM, a troca não ancora o próximo ciclo.
  O KM fica **só em Lançamentos**: mandá-lo para a aba Odômetro mexeria em KM,
  KM/litro e R$/km do Resumo sem ninguém ter mudado um lançamento. Falta definir
  o plano (a cada quantos km cada serviço, por categoria ou por veículo).
- **Key stretching na senha** — `hashSenha_` é SHA-256 de uma rodada com salt.
  O salt impede rainbow table; falta custo contra força bruta.
- **Sessão em `CacheService`** — pode ser despejada antes do TTL de 6 h, e o
  sintoma é o usuário deslogar sozinho sem padrão.
