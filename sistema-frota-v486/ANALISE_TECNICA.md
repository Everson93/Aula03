# Análise técnica — Sistema de Frota v4.42.1

Auditoria feita em 24/11/2026 sobre `Codigo.gs` (20.163 linhas, 684 funções),
`App.html` (4.748), `Lancamento.html`, `Central.html` e as 44 suítes (1.772
provas). Varredura por famílias de defeito + leitura dirigida dos pontos
suspeitos. Cada item tem o arquivo e a linha.

---

## Veredito

O sistema está acima da média do que se vê em Apps Script: dono único para
regras que se repetem, snapshot de centro/categoria no lançamento, lock nas
gravações, cache por execução, suítes com validação por mutação e um LEIA-ME
que registra o **porquê** de cada versão. Isso não é comum.

O risco não está onde o projeto já olhou. Está **onde não há prova**: 54 das
100 funções que escrevem na planilha não são citadas por nenhuma suíte — e é
justamente ali que moram as operações destrutivas e as que mexem em dinheiro
já lançado.

E a família de defeito que o próprio CLAUDE.md descreve ("uma checagem que
olhava um lado de algo que tem dois ou três") **está viva**: a correção da
V4.40.3 cobriu um dos quatro caminhos que gravam lançamento.

---

## ALTA — corrigir antes de qualquer novidade

> **Item 1 RESOLVIDO na V4.43.0** — e, ao fechá-lo, apareceu o defeito maior
> que estava por trás do "diz gravado e não aparece": o cache de lançamentos da
> execução deixava o Resumo ser recalculado **sem** o lançamento recém-gravado.
> Está descrito no LEIA-ME da V4.43.0.

### 1. Três outros caminhos gravam lançamento sem a guarda de linha livre

`linhaLivreParaLancamento_` (V4.40.3) é usada **só** por `salvarLancamento_`.
Os outros quatro escritores continuam usando `proximaLinhaLancamento_()` cru:

| Onde | Linha | O que acontece se a linha calculada estiver ocupada |
|---|---|---|
| `gerarDepreciacaoMensal_` | `Codigo.gs:16136` | sobrescreve **N** lançamentos de uma vez (bloco) |
| IPVA em 12 parcelas | `Codigo.gs:15312` | sobrescreve até 12 lançamentos |
| `importarMapaAntigo` | `Codigo.gs:4646` | sobrescreve o bloco importado inteiro |
| rollback de `webCorrigirLancamento` | `Codigo.gs:19401` | **pior de todos**: ao "restaurar" o original, destrói outro lançamento — e a mensagem diz que o original foi mantido |

`gerarDepreciacaoMensal_` ainda escreve o bloco **sem** chamar
`garantirCapacidadeLancamentos_` — os outros dois chamam. Se o bloco passar da
última linha da grade, `setValues` lança e a geração morre pela metade.

**Correção**: um dono único `gravarBlocoLancamentos_(sheet, linhas, …)` que
exige N linhas livres contíguas, cresce a grade quando falta e registra no Log
quando precisou pular; os cinco caminhos passam por ele. Mais uma regra
estática que proíbe `proximaLinhaLancamento_(` fora desse dono — é o que
impede o quinto caminho de nascer errado.

### 2. Abastecimento interno não tem proteção contra duplicidade

`assinaturaLancamento_` (`Codigo.gs:2518`) devolve string vazia quando não há
documento, e `localizarDuplicidadeLancamento_` (`:2527`) desiste quando a
assinatura é vazia. Abastecimento **interno** não tem NF por decisão de projeto
(`documentoFinal = ''`, `Codigo.gs:4253`).

Resultado: o fluxo mais usado da sua operação — bomba interna — é o único
**sem** detecção de duplicidade. Dois envios do mesmo abastecimento entram como
dois lançamentos, **baixam o tanque duas vezes** e estragam o km/L do veículo.
O botão da tela se desabilita durante o envio, o que cobre o duplo clique, mas
não cobre: resposta lenta + nova tentativa, dois aparelhos, ou o formulário da
planilha.

**Correção**: quando não há documento, assinar por
`data + placa + tipo + valor + litros + km` e cair no fluxo de confirmação que
já existe (`permitirDuplicado`).

### 3. Metade das funções que escrevem não tem nenhuma prova

54 de 100. As que mais preocupam, por ordem de estrago:

- `apagarPeriodo_` (`:4874`) — apaga linhas de Lançamentos **e** Odômetro por
  intervalo de data. Ignora linha com data inválida (fica órfã).
- `webEditarCargaBomba` (`:20049`) — muda o preço do litro e **revaloriza**
  todos os abastecimentos internos desde a data. É o cálculo mais sensível do
  sistema e não tem uma linha de teste.
- `webSalvarParametro` (`:17402`) — muda a competência aberta e o dia de corte,
  o que reescreve a competência de toda a base.
- `atualizarResumoPlacaSeguro_` (`:3393`) — roda depois de **todo** lançamento.
- `webSalvarUsuario` / `webExcluirUsuario` (`:7079`, `:7166`) — acesso.
- `gravarDepreciacaoCompetencia_`, `reabrirMesAnterior`, `importarMapaAntigo`.

**Correção**: uma suíte de caminhos destrutivos, no mesmo molde da
`conferir_gravacao_lancamento.js` (planilha falsa completa). Prioridade:
carga/edição da bomba → parâmetro/competência → apagar período.

---

## MÉDIA

### 4. Troca de senha em três escritas, sem lock

`webTrocarMinhaSenha` (`Codigo.gs:7052-7054`) grava salt, hash e flag em três
`setValue` separados. Se a execução morrer entre a primeira e a segunda, a
linha fica com **salt novo e hash velho**: a senha do usuário deixa de validar
e só um ADMIN resolve. Salt e hash são colunas vizinhas (4 e 5) — cabem numa
escrita só, e o conjunto pede o lock que as outras mutações usam.

### 5. Lock aninhado pode estar empurrando todo lançamento para o recálculo completo

`salvarLancamento_` segura o script lock e, lá dentro,
`atualizarResumoPlacaSeguro_` pede **outro** `getScriptLock().tryLock(15000)`
(`:3408`). Se esse segundo pedido não for concedido, o código cai em
`atualizarResumoSeguro_()` — recálculo do Resumo **inteiro**, 167 veículos,
depois de cada lançamento.

Não dá para decidir isso lendo o código: depende de como o Apps Script trata um
segundo lock na mesma execução. **Como medir**: um `registrarLog_` no ramo do
fallback. Se aparecer em todo lançamento, está achada a lentidão intermitente —
e a correção é passar `{ semLock: true }` para quem já está dentro do lock,
exatamente como `salvarLancamento_` já faz.

### 6. `onEdit` faz trabalho demais

`onEdit` (`:8957`, 229 linhas) resolve veículo linha a linha, dá `flush()`,
escreve propriedades e normaliza placas a cada edição. Colar 500 linhas na aba
Lançamentos pode estourar os 30 s do gatilho simples — e aí ele morre no meio,
deixando o Resumo marcado como desatualizado sem recalcular, sem erro visível.
**Correção**: sair cedo quando a edição tem mais de N linhas, registrando no
Log que a normalização automática não rodou naquele bloco.

### 7. Os três formatadores divergem no vazio

Valor `null` numérico sai como **"—"** no PDF (`:9898`) e como **""** na tela
(`App.html:356`). É a família de defeito que mais voltou neste projeto, em
versão cosmética. Vale um dono único do "como se escreve um valor que não
existe", com a regra estática correspondente.

### 8. Quinze funções passam de 120 linhas

`salvarLancamento_` 301, `coletarProblemas_` 292, `onEdit` 229,
`relatorioFrotaTransporte_` 210. `salvarLancamento_` mistura quatro coisas:
validação, cálculo do custo do tanque, gravação e efeitos colaterais (odômetro,
log, resumo, cache). Não é urgente, mas cada defeito novo nessa função custa
caro para encontrar. Extrair `validarLancamento_` (pura) é a separação que mais
rende — validação pura é a parte mais fácil de testar e a que mais muda.

### 9. Uma porta aberta no `tabela()`

`App.html:426` injeta a última coluna **crua** quando o texto começa com
`<button` e a tabela pede `permitirHtml`. Hoje quem monta é o servidor, então
não há exploração — mas uma observação de lançamento que comece com `<button`
caindo numa tabela dessas executa. **Correção**: marcar o botão com um campo do
objeto (`{acao: …}`), nunca pelo conteúdo do texto.

### 10. `instanceof Date` em 60 lugares

Funciona em produção (um realm só) e o CLAUDE.md já proíbe. O custo real é nas
**suítes**: um `Date` criado fora do `vm` não passa, então um teste pode passar
por um motivo errado — ou um filtro pode descartar tudo e a prova não perceber.

---

## BAIXA

11. `toFixed` em mensagem de usuário ainda existe fora do caminho de gravação
    (carga da bomba `:17127`, aferição `:19610`, IPVA `:14788`, exclusão
    `:18808`). Em pt-BR o ponto se lê como milhar — não dá erro, mente. A regra
    estática criada na V4.41 cobre só `salvarLancamento_`.
12. `parametrosParaTela_` (`:17388`) lê `PARAMETROS_PADRAO.length` linhas fixas
    da aba; instalação antiga com menos linhas lança.
13. `apagarPeriodo_` olha só a coluna A: linha com data vazia ou texto fica para
    trás na reimportação.
14. 45 `catch (e) {}` mudos. A maioria é legítima (cache, hideColumns), mas vale
    separar os que escondem escrita (`:4435` limpa a linha pela metade) com um
    `console.error` — custo zero, e é a diferença entre investigar e adivinhar.

---

## Melhorias que eu faria, em ordem

1. **Dono único de gravação de lançamento** + regra estática. Fecha o item 1 e
   impede a recaída.
2. **Duplicidade sem documento** (item 2). É um dia de trabalho e protege o
   fluxo que você mais usa.
3. **Suíte dos caminhos destrutivos** (item 3), começando pela carga da bomba.
4. **Medir o fallback do Resumo** (item 5) — pode explicar lentidão que hoje
   ninguém sabe de onde vem.
5. **Painel de saúde operacional**: últimas gravações, quantas caíram em
   fallback, quantas correções de linha, estoque x aferição. O diagnóstico da
   V4.41 já tem metade disso.

## O que não mexeria

- `hashSenha_` — decisão registrada do usuário.
- Separar o `Codigo.gs` em arquivos: no Apps Script eles são concatenados num
  escopo só; ganho nenhum e risco de nome duplicado, que o projeto já sofreu.
- A arquitetura de relatórios (payload único lido por três formatadores). Está
  certa: o problema é garantir que os três conheçam todos os tipos — e para
  isso já existe regra estática.
