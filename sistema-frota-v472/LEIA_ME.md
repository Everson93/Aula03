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

# Pendente

- **`ABA_ORIGEM` sem uso** — a coluna 12 de Veículos guarda o nome da aba de
  origem na migração das 170 abas, e **nada no código atual lê ou escreve nela**.
  Pode já conter um agrupamento útil da planilha antiga; vale olhar antes de
  descartar.
- **Suíte do fechamento** — `webFecharPeriodo`, `webExcluirLancamento`,
  `webCorrigirLancamento`, `webGerarDepreciacao`, `webExcluirVeiculo` e
  `webAjustarEstoqueBomba` continuam sem teste. São os seis caminhos
  irreversíveis do sistema. Ver a auditoria.
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
