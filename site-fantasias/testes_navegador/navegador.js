/* Testes de navegador: monta a simulação e percorre os fluxos principais num
 * Chromium de verdade (site do cliente e sistema do ateliê). Complementa
 * conferir_landing.js, que testa as regras sem navegador.
 *
 * Uso: node testes_navegador/navegador.js        (precisa do pacote playwright)
 * Sai com código 1 se algo falhar. Erro de JavaScript na página também reprova. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium, devices } = require('playwright');

const raiz = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasias-'));
const sim = path.join(tmp, 'sim.html');
execFileSync(process.execPath, [path.join(raiz, 'simulacao', 'montar.js'), path.join(tmp, 'parte.html')]);
// O artefato publicado recebe o esqueleto do HTML na publicação; aqui ele é posto à mão.
fs.writeFileSync(sim, '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' +
  fs.readFileSync(path.join(tmp, 'parte.html'), 'utf8') + '</body></html>');
const SIM = 'file://' + sim;
const SITE = 'file://' + path.join(raiz, 'index.html');

let ok = 0, falhas = 0;
function prova(nome, cond, detalhe) {
  if (cond) { ok++; return; }
  falhas++;
  console.log('FALHA: ' + nome + (detalhe !== undefined ? ' — ' + JSON.stringify(detalhe) : ''));
}

async function pagina(b, opcoes, erros) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR' }, opcoes || {}));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|googletagmanager\.com/, r => r.fulfill({ status: 200, body: '' }));
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000); // espera curta: elemento que não aparece vira FALHA rápida, não trava
  p.on('pageerror', e => erros.push(e.message));
  return p;
}
const texto = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch();
  const erros = [];

  async function cenario(nome, fn) {
    try { await fn(); } catch (e) { prova('cenário "' + nome + '" foi até o fim', false, String(e.message).split('\n')[0]); }
  }

  /* 1. Site publicado (index.html real): vitrine, filtro, ficha, sem config */
  await cenario('site', async () => {
    const p = await pagina(b, {}, erros);
    await p.goto(SITE);
    prova('site: vitrine carrega', (await p.locator('.cartao').count()) >= 20);
    prova('site: aviso de configuração pendente', await p.isVisible('#aviso-config'));
    await p.selectOption('#filtro-publico', 'infantil');
    prova('site: filtro infantil', (await texto(p, '#contagem')) === '6 fantasias');
    await p.locator('.cartao[data-id="IN01"]').click();
    await p.fill('#sug-altura', '118'); await p.fill('#sug-peso', '21'); await p.locator('#sug-peso').dispatchEvent('change');
    prova('site: sugestão de tamanho infantil', (await texto(p, '#sug-resultado')).includes('tamanho 8'));
    prova('site: sem WhatsApp configurado o botão de reservar fica desativado', (await p.getAttribute('#botao-reservar', 'aria-disabled')) === 'true');
    prova('site: sem rolagem lateral', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0);
  });

  /* 2. Simulação: reserva no site → retirada na loja com cadastro, contrato e entrega */
  await cenario('reserva no site → retirada', async () => {
    const p = await pagina(b, {}, erros);
    await p.goto(SIM);
    await p.fill('#busca-data', '2026-11-21'); await p.locator('#busca-data').dispatchEvent('change');
    await p.locator('.cartao[data-id="JN05"]').click();
    await p.locator('.tam:not(.tam--esgotado) input + span').first().click();
    await p.click('#botao-reservar');
    prova('sim: reserva do site vira pedido aguardando sinal', (await texto(p, '#sim-confirmar-texto')).includes('Pedido P0001'));
    const msg = await texto(p, '#sim-whats-texto');
    prova('sim: mensagem do WhatsApp com retirada e devolução', msg.includes('Retirada: sex, 20/11/2026') && msg.includes('Devolução: seg, 23/11/2026'), msg);
    await p.click('#sim-ir-painel');
    await p.evaluate(() => { window.SIM_LOJA.definirDia('2026-11-20'); window.SIM_LOJA.abrirCaixa(100); });
    await p.click('[data-pagina="retirada"].sis-nav__item');
    await p.fill('#sis-busca-ret', 'P0001');
    await p.locator('[data-acao="retirar"][data-id="P0001"]').click();
    await p.click('[data-acao="novo-cliente"][data-volta="retirada:P0001"]');
    await p.fill('#cd-nome', 'Joana Prado'); await p.fill('#cd-cpf', '123.456.789-09'); await p.fill('#cd-whats', '(91) 97777-6666');
    await p.fill('#cd-cep', '66020-000'); await p.fill('#cd-rua', 'Travessa São Pedro'); await p.fill('#cd-numero', '12');
    await p.fill('#cd-bairro', 'Umarizal'); await p.fill('#cd-cidade', 'Belém'); await p.fill('#cd-uf', 'PA');
    await p.click('#cd-ok');
    prova('sim: cadastro exige o aviso de privacidade', (await texto(p, '#cd-erros')).includes('aviso de privacidade'));
    await p.check('#cd-aviso'); await p.click('#cd-ok');
    await p.check('#rt-doc');
    await p.check('#rt-saldo [data-pg="confirmado"]');
    await p.selectOption('#rt-caucao [data-pg="forma"]', 'dinheiro');
    await p.fill('#rt-caucao [data-pg="entregue"]', '100,00');
    for (const s of ['frente', 'costas', 'barra', 'detalhes']) await p.click(`#sis-conteudo [data-simular="${s}"]`);
    await p.click('#rt-contrato');
    const ct = await texto(p, '.ct-papel');
    prova('sim: contrato preenchido com cliente, CPF e peça', ct.includes('Joana Prado') && ct.includes('123.456.789-09') && ct.includes('JN05-'));
    await p.click('#ct-fechar');
    await p.check('#rt-assinou');
    await p.click('#rt-ok');
    prova('sim: retirada entregue', (await texto(p, '#sis-conteudo')).includes('Pedido P0001 entregue'));
    const esp = await p.evaluate(() => window.Logica.esperadoCaixa(window.SIM_LOJA.caixaAberto()));
    prova('sim: caixa com fundo 100 + caução 100 entregue − 40 de troco = 160 em dinheiro', esp.dinheiro === 160, esp);
  });

  /* 3. Balcão: venda com pagamento dividido e troco; perfil de atendente */
  await cenario('balcão', async () => {
    const p = await pagina(b, {}, erros);
    await p.goto(SIM + '#painel');
    await p.evaluate(() => { window.SIM_LOJA.definirDia('2027-05-03'); window.SIM_LOJA.abrirCaixa(50); });
    await p.click('[data-pagina="venda"].sis-nav__item');
    await p.fill('#pdv-busca-cli', 'ana'); await p.locator('[data-pdv="cliente"]').first().click();
    await p.fill('#pdv-festa', '2027-05-22'); await p.locator('#pdv-festa').dispatchEvent('change');
    await p.fill('#pdv-busca', 'chita'); await p.locator('[data-pdv="fantasia"][data-v="JN05"]').click();
    await p.locator('.pn-tam:not([disabled])').first().click(); await p.click('[data-pdv="adicionar"]');
    await p.selectOption('#pdv-recebe', 'total');
    await p.click('#pdv-pagar');
    await p.fill('[data-pg="valor"][data-i="0"]', '50,00'); await p.check('[data-pg="confirmado"][data-i="0"]');
    await p.click('[data-pg="mais"]'); await p.fill('[data-pg="entregue"][data-i="1"]', '50,00');
    prova('balcão: troco calculado (95 = 50 Pix + 45 em dinheiro, entregou 50)', (await texto(p, '#pg-status')).includes('R$ 5,00'), await texto(p, '#pg-status'));
    await p.click('#pg-ok');
    prova('balcão: recibo emitido', (await texto(p, '.sis-recibo')).includes('Recibo do pedido P0001'));
    await p.keyboard.press('Escape');
    await p.selectOption('#sis-operador', 'Atendente');
    prova('perfil: atendente não vê Relatórios', !(await p.isVisible('[data-pagina="relatorios"].sis-nav__item')));
    await p.click('[data-pagina="caixa"].sis-nav__item');
    prova('perfil: atendente não faz sangria', !(await p.isVisible('#cx-san')));
  });

  /* 5. Cadastro de fantasia com foto → aparece no site */
  await cenario('cadastro do acervo', async () => {
    const p = await pagina(b, {}, erros);
    await p.goto(SIM + '#painel');
    await p.click('[data-pagina="acervo"].sis-nav__item');
    await p.click('[data-acao="nova-fantasia"]');
    await p.click('#cad-ok');
    prova('cadastro: vazio mostra o que falta', (await texto(p, '#cad-erros')).includes('Nome da fantasia'));
    await p.click('#cad-simular'); await p.click('#cad-simular');
    await p.fill('#cad-nome', 'Caipira de Chita Azul');
    await p.fill('#cad-desc', 'Vestido de chita azul com babado.');
    await p.fill('#cad-inclui', 'Vestido, Fita');
    await p.fill('#cad-preco', '95,00'); await p.fill('#cad-extra', '25,00'); await p.fill('#cad-caucao', '60,00'); await p.fill('#cad-repos', '320,00');
    await p.click('#cad-mais-tam'); await p.click('#cad-mais-tam');
    await p.click('#cad-mais-kit'); await p.fill('[data-kit="nome"][data-i="0"]', 'Chapéu de palha'); await p.selectOption('[data-kit="tipo"][data-i="0"]', 'aluguel');
    await p.fill('[data-kit="preco"][data-i="0"]', '10,00'); await p.fill('[data-kit="estoque"][data-i="0"]', '2');
    await p.click('#cad-ok');
    const nova = await p.evaluate(() => window.FANTASIAS.find(f => f.nome === 'Caipira de Chita Azul'));
    prova('cadastro: peça salva com código, 2 fotos, 2 tamanhos e complemento', nova && nova.id === 'JN07' && nova.fotos.length === 2 && Object.keys(nova.tamanhos).join() === 'PP,P' && nova.kit[0].estoque === 2, nova && { id: nova.id, f: nova.fotos.length, t: Object.keys(nova.tamanhos) });
    await p.click('#sim-vista-site');
    await p.fill('#busca-texto', 'chita azul'); await p.click('#form-busca button');
    prova('cadastro: aparece no site com a foto', (await p.locator('.cartao[data-id="JN07"] img').count()) === 1);
    await p.locator('.cartao[data-id="JN07"]').click();
    prova('cadastro: ficha com galeria de 2 fotos', (await p.locator('.ficha__mini').count()) === 2);
  });

  /* 4. Celular, tema escuro: painel sem rolagem lateral */
  await cenario('celular', async () => {
    const p = await pagina(b, Object.assign({}, devices['iPhone 13'], { colorScheme: 'dark' }), erros);
    await p.goto(SIM + '#painel');
    for (const pg of ['inicio', 'venda', 'retirada', 'caixa', 'relatorios']) {
      await p.click(`[data-pagina="${pg}"].sis-nav__item`);
      prova('celular: ' + pg + ' sem rolagem lateral', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0);
    }
  });

  await b.close();
  prova('nenhum erro de JavaScript nas páginas', !erros.length, erros);
  console.log((falhas ? 'REPROVADO' : 'OK') + ' — ' + ok + ' provas de navegador aprovadas, ' + falhas + ' falhas');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
