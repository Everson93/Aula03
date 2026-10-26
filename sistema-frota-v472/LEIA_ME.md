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

# Pendente

- **`ABA_ORIGEM` sem uso** — a coluna 12 de Veículos guarda o nome da aba de
  origem na migração das 170 abas, e **nada no código atual lê ou escreve nela**.
  Pode já conter um agrupamento útil da planilha antiga; vale olhar antes de
  descartar.
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
