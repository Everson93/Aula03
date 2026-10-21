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

# Pendente

- **ARLA no tanque sem controle de validade** — o produto tem prazo; o módulo
  controla saldo e custo, não vencimento.
- **Manutenção preventiva** — o KM é capturado no abastecimento, mas o lançamento
  de oficina não guarda o odômetro do momento. Sem isso não dá para alertar
  "próxima troca em X km".
- **Key stretching na senha** — `hashSenha_` é SHA-256 de uma rodada com salt.
  O salt impede rainbow table; falta custo contra força bruta.
- **Sessão em `CacheService`** — pode ser despejada antes do TTL de 6 h, e o
  sintoma é o usuário deslogar sozinho sem padrão.
