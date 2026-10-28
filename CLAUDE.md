# Sistema de Frota — instruções do projeto

Sistema de custo de frota em Google Sheets + Apps Script, publicado como app
da web. Estado completo em `ESTADO_DO_PROJETO.md`; histórico de decisões em
`sistema-frota-v472/LEIA_ME.md` (uma seção por versão, com o raciocínio).

## Onde está o quê

- `sistema-frota-v486/Codigo.gs` — todo o servidor (527 funções)
- `sistema-frota-v486/App.html` — o app da web inteiro, num arquivo
- `sistema-frota-v486/conferir_*.js` — 19 suítes, 409 provas

## Rodar as provas

```bash
cd sistema-frota-v486
for f in conferir_*.js; do
  if [ "$f" = conferir_callbacks.js ]; then
    node "$f" Codigo.gs App.html Lancamento.html Central.html
  else node "$f"; fi
done
```

`conferir_callbacks.js` é a única que recebe os arquivos como argumento.

## Regras

**Locale pt-BR, três armadilhas.** Separador de argumento em fórmula é `;`
(use `fx_()`). Código de ano no `TEXT` é `aaaa` (use `dataBR_`/`dataIso_`).
E **nunca `toFixed` em número que o usuário vai ler**: o ponto decimal se lê
como milhar em pt-BR, e isso não dá erro, mente. Use `numBR_()`.

**Separar arquivos não deixa o Apps Script mais leve.** Os `.gs` são
concatenados e compilados juntos; `createHtmlOutputFromFile` inlineia. Ganho
de desempenho vem de cache e de payload menor.

**Toda suíte nova é validada por mutação** — reintroduza o defeito e confirme
que as provas quebram. Ao verificar, **olhe o código de saída**, não a
contagem de linhas `FALHA`: um arquivo que não compila produz zero `FALHA` e
parece aprovação. Separe `SOBREVIVEU` de `CRASH`.

**Ao mexer em verificação, confira todos os lados do contrato.** O defeito que
mais voltou neste projeto foi uma checagem que olhava um lado de algo que tem
dois ou três. Quando der, escreva uma regra estática que leia o código-fonte e
confronte os lados — é o que `conferir_telas.js` e `conferir_funcoes_html.js`
fazem.

**`Date` entre realms**: um `Date` criado fora do `vm` não passa no
`instanceof Date` de dentro. Use `Object.prototype.toString.call()`.

**Registre no LEIA-ME** o raciocínio de cada versão, não só o que mudou — e o
que ficou por resolver.

## Não alterar sem o usuário pedir

`hashSenha_` (SHA-256 de uma rodada com salt) fica como está. É decisão
explícita dele, já registrada.

## Entrega

O usuário instala colando os arquivos no editor do Apps Script. Diga sempre
**quais arquivos mudaram** e **se precisa rodar "Instalar / atualizar
sistema"** — só precisa quando a mudança é estrutural (aba, coluna, gatilho,
parâmetro novo). Parâmetro novo deve ser lido por `paramOuPadrao_`, para não
derrubar nada em planilha que ainda não rodou o Instalar.
