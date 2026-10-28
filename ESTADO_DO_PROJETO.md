# Sistema de Frota — estado do projeto

Retrato completo em **28/10/2026**, versão **4.20.1**.
Para retomar o trabalho aqui ou levar o aprendizado para outro projeto.

---

## 1. O que é

Uma planilha de custo de frota com **170 abas** (uma por veículo, preenchidas à
mão) virou um sistema em Google Sheets + Apps Script, publicado como **app da
web**. O usuário é o Grupo Giassi; a frota tem ~167 veículos entre carretas,
trucks, carros, motos, empilhadeiras e máquinas.

O sistema apura custo por veículo, por centro de custo e por competência,
rateia custo indireto, controla tanque interno de combustível, IPVA
parcelado, depreciação, e emite um alerta diário por e-mail.

---

## 2. Arquivos

### Código (`sistema-frota-v486/`)

| Arquivo | Linhas | O que é |
|---|---|---|
| `Codigo.gs` | 15.780 | Todo o servidor: 553 funções, 85 delas `web*` chamadas pelo cliente |
| `App.html` | 3.947 | O app da web inteiro — todas as telas, CSS e JS num arquivo |
| `Lancamento.html` | 370 | Formulário de lançamento dentro da planilha |
| `Central.html` | 363 | Central operacional dentro da planilha |
| `medir_resumo.js` | 96 | Medidor de desempenho do cálculo do Resumo |

### Suítes de prova (25 arquivos, **652 provas**, todas verdes)

| Suíte | Provas |
|---|---|
| `conferir_depreciacao_import.js` | 170 |
| `conferir_alerta_diario.js` | 72 |
| `conferir_corrigir_pendencia.js` | 61 |
| `conferir_comprovantes.js` | 45 |
| `conferir_unidade_quantidade.js` | 41 |
| `conferir_correcao_ponta.js` | 40 |
| `conferir_indices_execucao.js` | 30 |
| `conferir_pendencias_estado.js` | 28 |
| `conferir_cache_apuracao.js` | 26 |
| `conferir_rateio_competencia.js` | 25 |
| `conferir_classificacao_memo.js` | 24 |
| `conferir_grupos_frota.js` | 21 |
| `conferir_agendado.js` | 16 |
| `conferir_telas.js` | 13 |
| `conferir_alvo_pendencia.js` | 12 |
| `conferir_funcoes_html.js` | 9 |
| `conferir_nomes_unicos.js` | 7 |
| `conferir_desempenho.js` | 6 |
| `conferir_sintaxe_html.js` | 6 |
| `conferir_aquecimento.js` | — |
| `conferir_cache_odometro.js` | — |
| `conferir_callbacks.js` | — |
| `conferir_ipva_parcelas.js` | — |
| `conferir_ipva_resumo.js` | — |
| `conferir_sessao.js` | — |

Três recebem os arquivos como argumento: `conferir_callbacks.js`,
`conferir_nomes_unicos.js` e `conferir_sintaxe_html.js`. O comando para rodar
todas está no `CLAUDE.md`.

Fora da suíte, dois medidores que se roda à mão:
`medir_modulos.js` (desempenho dos módulos com frota sintética) e
`medir_resumo.js` (onde o tempo vai no cálculo do Resumo).

### Documentação (`sistema-frota-v472/`)

`LEIA_ME.md`, **1.908 linhas** — uma seção por versão, com o raciocínio de cada
decisão e uma lista `# Pendente` ao final. É o registro de verdade do projeto;
este arquivo aqui é só o retrato.

---

## 3. Abas da planilha (22)

Parâmetros · Centros de Custo · Veículos · Lançamentos · Odômetro · Histórico ·
Resumo · Rateio por Centro · Dashboard · Consulta Veículo · Pendências de
Conferência · Relatórios · Log de Atividade · Usuários · Central Operacional ·
Fornecedores · Carga na Bomba · Lançamentos Excluídos · Rateio Mensal ·
Orçamento · Comprovantes Atrasados · Depreciação Mensal

## 4. Perfis de acesso

- **CONSULTA** — leitura: início, consulta, relatórios, resumo, rateio,
  orçamento, veículos, centros, fornecedores
- **OPERADOR** — o acima + lançar, lançamentos, bomba, comprovantes, pendências
- **ADMIN** — tudo + depreciação, IPVA, fechamento, saúde, config, usuários, log

Gravação sensível é barrada **no servidor**, não só escondida no menu.

---

## 5. Histórico (42 commits, do mais recente)

```
Acerto de divergencias em lote: o botao nao trava mais
Acertar as divergencias pelo cabecalho, todas de uma vez
Conserta o script do App.html, que nao compilava
Corrige colisao de nome que quebrou os relatorios e o login
Botao validar divergencias da depreciacao
Bem importado aparecia como SEM VALOR na situacao
Confere o vinculo placa x bem, que falhava em silencio
Modulo de depreciacao: importar os bens por competencia
Mede os modulos e indexa as duas varreduras por placa
Depreciacao lenta: tira a busca de veiculo de dentro do laco
Registra o estado do projeto e as instrucoes para sessoes futuras
Separar custo de rodagem de custo de manutencao no alerta
Alerta de custo fora da curva informa a rubrica dominante
V4.15.2: números do alerta em formato brasileiro
V4.15.1: lançamento sem ID deixa de ser pulado em silêncio, e a versão no rodapé
V4.15: ID do lançamento na pendência, e como alvo da correção
V4.14.1: correção certa sendo acusada de errada
V4.14: calculadora de botijões — a NF de GLP vem em unidades
V4.13.1: a tela de pendências parou de carregar
V4.13: corrigir valor e quantidade na própria tela de pendências
V4.12.2: mostrar a conta inteira no preço fora da curva
V4.12.1: fecha o laço do RESOLVIDO em pendência que tem conserto
V4.12: cache da apuração de competência passada
V4.11.5: a tela de pendências mandava a lista de veículos 110 vezes
V4.11.4: dizer quando a correção não resolve a pendência
V4.11.3: por que a pendência continuava na tela depois de corrigida
V4.11.2: revisão do módulo de pendências — três defeitos de estado
V4.11.1: Orçamento e Comprovantes estavam invisíveis no menu
V4.11: módulo de comprovantes atrasados
V4.10.1: parcelas de IPVA não são "lançamento em período futuro"
V4.10: indicadores por grupo de frota
V4.9.5: "consumo fora da curva" acusava todo caminhão por ser caminhão
V4.9.4: a pendência registrada como corrigível que não mostrava campo
V4.9.3: cobertura das pendências vai de 14 para 25 campos, mais 8 com caminho
V4.9.2: conferência de preço unitário passa a respeitar a unidade
V4.9.1: corrigir a pendência na própria tela, em vez de só marcá-la
V4.9: orçamento por centro, alerta diário e rateio por competência
Aquece os caches por gatilho: tira 2 dos 3,2 segundos da abertura
Acrescenta o medidor de desempenho do calculo do Resumo
Trava o recalculo do Resumo, unifica a leitura do odometro e da lastro as sessoes
IPVA como despesa lancada em 12 parcelas e historico de KM
Registra o LEIA-ME do V4.7.2 apos a perda do container
```

Branch: `claude/planilha-sistema-funcional-s0wz5b`, sincronizada com o remoto.
## 6. O que falta

| Item | Situação |
|---|---|
| **Suíte do fechamento** | `webFecharPeriodo`, `webExcluirLancamento`, `webCorrigirLancamento`, `webGerarDepreciacao`, `webExcluirVeiculo`, `webAjustarEstoqueBomba` — os **seis caminhos irreversíveis**, todos sem teste. É o item de maior valor restante. |
| **Preventiva × corretiva** | `NATUREZAS_OFICINA` tem onze opções, todas sobre **o que** foi feito; nenhuma sobre **por quê**. O eixo não existe no cadastro. Exige coluna nova e decisão sobre o histórico. |
| **`excluirVeiculo_` lento** | Apaga um lançamento por vez, cada um com leitura e remoção de linha. Veículo com histórico longo demora. Está na lista de aceitas de `conferir_desempenho.js`. |
| **Trilha do ajuste de depreciação** | Desde a V4.20.1 o de-para fica na observação da linha e no Log, não mais como cópia em `Lançamentos Excluídos`. Troca consciente por causa do limite de 6 minutos; dá para voltar se for em lote. |
| **Alerta diário × resumo mensal** | O alerta repete o mesmo achado todo dia até virar a competência. |
| **Manutenção preventiva por KM** | Desenho acordado (campo KM no lançamento de oficina, pré-preenchido com o último odômetro, só em Lançamentos). Falta o usuário definir os intervalos por serviço. |
| **Formatação condicional do Resumo** | Ainda usa a regra antiga (2× a média da frota no R$/km) e pinta todo caminhão de vermelho. Divergência conhecida e deliberada. |
| **`ABA_ORIGEM`** | Coluna 12 de Veículos, da migração das 170 abas. Nada lê nem escreve. Pode conter agrupamento útil. |
| **ARLA sem validade** | O módulo controla saldo e custo, não vencimento. |
| **Sessão em `CacheService`** | Pode ser despejada antes do TTL de 6 h; o sintoma é deslogar sozinho sem padrão. |
| **Senha sem key stretching** | `hashSenha_` é SHA-256 de uma rodada com salt. **Decisão explícita do usuário de manter assim** — não alterar sem ele pedir. |
| **Alerta diário × resumo mensal** | O alerta repete o mesmo achado todo dia até virar a competência. Resolver exigiria o alerta lembrar o que já avisou. |

---

## 7. O que este projeto ensinou

Vale para qualquer sistema, não só para este.

### As três armadilhas de locale pt-BR

1. **Separador de argumento é `;`, não `,`** — fórmula montada com vírgula dá
   `#ERROR!`. Resolvido por `fx_()`.
2. **O código de ano no `TEXT` é `aaaa`, não `yyyy`** — resolvido por
   `dataBR_`/`dataIso_`.
3. **`toFixed` emite ponto decimal, e pt-BR lê ponto como milhar.**
   "R$ 4.604/km" se lê como quatro mil reais. **Esta não dá erro: ela mente.**
   Resolvido por `numBR_()` com `toLocaleString('pt-BR')`.

A terceira é a pior exatamente por não quebrar nada.

### Apps Script: separar arquivos não deixa mais leve

Todos os `.gs` são concatenados e compilados juntos a cada execução, e
`HtmlService.createHtmlOutputFromFile` **inlineia** o conteúdo. Modularizar
muda a legibilidade, **não muda nada em tempo de execução**. Ganho de
desempenho vem de cache e de reduzir payload, não de arrumar arquivos.

### Mediana, não média, para detectar outlier

A média é arrastada pelo próprio outlier que deveria julgar. Com 4 carretas
normais e 1 bebendo o dobro, a média sobe o bastante para a culpada passar.

### Evento não se julga com régua de rotina

O erro que mais rendeu: somar gasto **por evento** (oficina, pneus) com gasto
**por mês** (combustível, pedágio) e comparar o total contra a mediana mensal.
Garante que todo veículo vire anomalia no mês em que faz a preventiva.
Separar as duas naturezas foi o conserto.

### Número de linha é coordenada que envelhece

Excluir uma linha empurra as de baixo para cima. Toda referência guardada por
número de linha aponta para outra coisa depois. A solução foi um **ID estável**
(`LAN-...`) carimbado no lançamento.

### Invalidação de cache por geração

Não dá para enumerar chaves no `CacheService`. Um contador em
`DocumentProperties` embutido na chave torna **todas** as chaves antigas
inalcançáveis de uma vez. E quando o contador falha, `geracaoBase_()` devolve
`null` e o sistema **não cacheia** — falhar sem cache é seguro, falhar com
chave repetida não é.

### O defeito que voltou seis vezes

**Uma verificação que olha um lado de um contrato que tem dois ou três.**
Apareceu em: trava de competência que checava só a data nova; pendência casada
por aba+placa ignorando a linha; `TELAS_POR_PERFIL` sem duas telas que o
servidor já servia; correção escalar escrita no primeiro campo de uma spec de
vários; e mais duas.

O que funciona contra isso: **regras estáticas que leem o código-fonte** e
confrontam os lados um contra o outro — como `conferir_telas.js` e
`conferir_funcoes_html.js` fazem.

### Teste de mutação, e como ele mente

Toda suíte nova foi validada **reintroduzindo o defeito** e confirmando que as
provas quebram. Uma suíte que passa com o defeito de volta não estava provando
nada.

Mas o próprio método tem uma armadilha: **contar linhas `FALHA` dá zero tanto
quando a prova não pega quanto quando o arquivo nem compila.** Dois casos
opostos com a mesma aparência. A verificação tem de olhar o **código de saída**
e separar `SOBREVIVEU` de `CRASH`. Na primeira rodada honesta apareceram duas
provas fracas que passavam havia versões — uma rebentava com `TypeError` em vez
de reprovar, outra passava por um ramo que não era o que dizia testar.

### Armadilhas de teste que custaram caro aqui

- **Stub que esconde o que se quer provar** — stubar `coletarProblemas_` para
  devolver `[]` fez o teste "a correção resolve a pendência" nunca provar nada.
- **`instanceof Date` entre realms** — um `Date` criado fora do `vm` não passa
  no `instanceof` de dentro. Aconteceu duas vezes, nas duas direções. Use
  `Object.prototype.toString.call()`.
- **Stub que não é restaurado** vaza para blocos seguintes, e a falha aparece
  longe de onde foi plantada.
- **Limiar inventado** — um teste afirmava que 10% de desvio no R$/km era
  demais. Era falso: com transporte a 85% do custo, é correto a média da frota
  ficar em cima dele.

### Ferramentas de varredura de código: cuidado com strings

Duas tentativas falharam antes de acertar. Varredura crua deu 27 falsos
positivos de texto em português (`"1 pendência ("` virou `ncia()`). Remover as
strings primeiro foi **pior**: um literal de regex `/[&<>"]/g` contém aspas e
comeu o resto do arquivo — 194 definições viraram 2. O que funcionou foi
heurística de nomenclatura do próprio projeto.
