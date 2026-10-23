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

# Pendente

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
