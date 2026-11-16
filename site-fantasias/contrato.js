/* Contrato de locação preenchido a partir do pedido.
 * Mesmo texto e mesma numeração do modelo para imprimir (cláusulas 1 a 12),
 * com partes, peças, datas, valores, pagamentos e laudo de vistoria vindos do
 * sistema. Puro: recebe tudo por parâmetro e devolve HTML; roda no navegador e
 * no Node (provas em conferir_landing.js).
 *
 * Contrato.gerar({ pedido, cliente, fantasiaDe, config, hoje, operador }) -> { html, pendencias }
 * pendencias = dados do ateliê ou do cliente que faltam e saem como linha em branco. */
(function (raiz, fabrica) {
  var L = typeof module === 'object' && module.exports ? require('./logica.js') : raiz.Logica;
  var mod = fabrica(L);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else raiz.Contrato = mod;
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var FORMAS = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito', vale: 'Crédito na loja' };
  var TIPOS = { sinal: 'Sinal', saldo: 'Saldo', total: 'Pagamento integral', caucao: 'Caução', cobranca: 'Cobrança de dano/atraso',
    caucao_devolvida: 'Caução devolvida', estorno: 'Estorno' };
  var FOTOS = [['frente', 'frente'], ['costas', 'costas'], ['barra', 'barra'], ['detalhes', 'detalhes']];
  var BRANCO = '<span class="ct-branco"></span>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ou(v) { return v ? esc(v) : BRANCO; }
  function dataExtenso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] + ' de ' + m[1] : '';
  }
  function cpf(c) { return String(c || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
  function fone(w) { var d = String(w || '').replace(/\D/g, '').replace(/^55/, ''); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d; }
  function R(v) { return L.formatarPreco(v); }
  function soma(lista, f) { return Math.round(lista.reduce(function (s, x) { return s + Math.round(f(x) * 100); }, 0)) / 100; }

  function gerar(d) {
    var p = d.pedido, c = d.cliente || {}, cfg = d.config, ct = cfg.contrato || {};
    var loja = cfg.lojas[Object.keys(cfg.lojas)[0]];
    var pend = [];
    if (!ct.documento) pend.push('CNPJ/CPF do ateliê');
    if (!ct.endereco) pend.push('endereço do ateliê');
    if (!c.nome) pend.push('dados do cliente');
    var e = c.endereco || {};
    var itens = p.itens || [];
    var pags = p.pagamentos || [];
    var diaExtra = soma(itens, function (it) { return it.diaExtra; });
    var vr = p.vistorias && p.vistorias.retirada;
    var vd = p.vistorias && p.vistorias.devolucao;
    var pago = function (tipos) { return soma(pags.filter(function (x) { return tipos.indexOf(x.tipo) !== -1; }), function (x) { return x.valor; }); };
    var sinalPago = pago(['sinal']) || (p.origem === 'exemplo' ? p.valores.sinal : 0);
    var formaDe = function (tipos) {
      var fs = pags.filter(function (x) { return tipos.indexOf(x.tipo) !== -1; })
        .map(function (x) { return (FORMAS[x.forma] || x.forma) + (x.parcelas > 1 ? ' ' + x.parcelas + 'x' : ''); });
      return fs.filter(function (f, i) { return fs.indexOf(f) === i; }).join(' + ');
    };
    var prazoCaucao = Number(ct.prazoDevolucaoCaucao) > 0 ? 'em até ' + ct.prazoDevolucaoCaucao + ' dia(s) útil(eis)' : 'na hora da devolução';

    var h = [];
    h.push('<header class="ct-topo"><p class="ct-marca">' + esc(cfg.nomeSite) + ' · ' + esc(cfg.atelie) + '</p>' +
      '<h1>Contrato de Locação de Traje</h1>' +
      '<p>Contrato nº <strong>' + esc(p.id) + '</strong> · emitido em ' + esc(L.dataBR(d.hoje)) + (d.operador ? ' · atendente ' + esc(d.operador) : '') + '</p></header>');

    // 1. Partes
    h.push('<h2>1. Partes</h2>' +
      '<p><strong>LOCADORA:</strong> ' + esc(cfg.atelie) + ' (nome fantasia ' + esc(cfg.nomeSite) + '), CNPJ/CPF ' + ou(ct.documento) +
      ', com endereço em ' + ou(ct.endereco) + ', WhatsApp ' + (loja.whatsapp ? esc(fone(loja.whatsapp)) : BRANCO) + '.</p>' +
      '<p><strong>LOCATÁRIO(A):</strong></p><table class="ct-tab"><tbody>' +
      '<tr><th>Nome completo</th><td>' + ou(c.nome) + '</td></tr>' +
      '<tr><th>CPF</th><td>' + ou(cpf(c.cpf)) + '</td></tr>' +
      '<tr><th>RG</th><td>' + ou(c.rg) + '</td></tr>' +
      '<tr><th>Endereço</th><td>' + (e.rua ? esc([e.rua + ', ' + e.numero, e.complemento, e.bairro, e.cidade + (e.uf ? '/' + e.uf : '')].filter(Boolean).join(' · ') + ' · CEP ' + String(e.cep || '').replace(/(\d{5})(\d{3})/, '$1-$2')) : BRANCO) + '</td></tr>' +
      '<tr><th>WhatsApp</th><td>' + ou(fone(c.whatsapp)) + '</td></tr>' +
      (c.email ? '<tr><th>E-mail</th><td>' + esc(c.email) + '</td></tr>' : '') +
      '</tbody></table>' +
      '<p>As partes acima fazem este contrato de locação de bem móvel (arts. 565 a 578 do Código Civil), nas condições a seguir.</p>');

    // 2. Objeto
    h.push('<h2>2. O que está sendo alugado</h2>' +
      '<p>A LOCADORA aluga ao LOCATÁRIO as peças abaixo, em bom estado de uso e higienizadas. O código é o da etiqueta costurada na peça. ' +
      'O valor de reposição é o que o LOCATÁRIO paga se a peça não voltar ou voltar sem conserto possível (cláusula 8).</p>' +
      '<table class="ct-tab ct-tab--linhas"><thead><tr><th>Código da peça</th><th>Fantasia e tamanho</th><th>Itens que acompanham</th><th class="ct-num">Reposição</th></tr></thead><tbody>' +
      itens.map(function (it) {
        var f = d.fantasiaDe(it.fantasia);
        return '<tr><td class="ct-cod">' + esc(it.unidade) + '</td><td>' + esc(f.nome) + ' · ' + esc(it.tamanho) + '</td><td>' + esc((f.inclui || []).join(', ')) + '</td><td class="ct-num">' + R(f.reposicao || 0) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      ((p.complementos || []).length ? '<p><strong>Complementos:</strong> ' + p.complementos.map(function (k) {
        return esc(k.nome) + (k.qtd > 1 ? ' ×' + k.qtd : '') + ' (' + (k.tipo === 'venda' ? 'vendido, fica com o cliente' : 'alugado, volta com a peça') + ')';
      }).join('; ') + '.</p>' : ''));

    // 3. Prazo
    h.push('<h2>3. Prazo: retirada e devolução</h2><table class="ct-tab"><tbody>' +
      (p.dataFesta ? '<tr><th>Data da festa</th><td>' + esc(L.dataComDia(p.dataFesta)) + '</td></tr>' : '') +
      '<tr><th>Retirada</th><td>' + esc(L.dataComDia(p.retirada)) + '</td></tr>' +
      '<tr><th>Devolução até</th><td><strong>' + esc(L.dataComDia(p.devolucao)) + ', até ' + esc(ct.horarioDevolucao || '18h') + '</strong></td></tr>' +
      '<tr><th>Dias extras contratados</th><td>' + (p.diasExtras || 0) + '</td></tr></tbody></table>' +
      '<p>O aluguel padrão é de 3 dias: retirada na véspera da festa e devolução no dia seguinte. Quando a devolução cair em dia em que o ateliê não abre, ela passa para o próximo dia de funcionamento, sem custo.</p>');

    // 4. Valores
    var v = p.valores;
    var saldoPago = pago(['saldo', 'total']);
    var caucaoPaga = pago(['caucao']);
    h.push('<h2>4. Valores e pagamento</h2><table class="ct-tab ct-tab--linhas"><thead><tr><th>Item</th><th class="ct-num">Valor</th><th>Forma</th></tr></thead><tbody>' +
      '<tr><td>Aluguel (' + itens.length + (itens.length === 1 ? ' peça' : ' peças') + ', 3 dias)</td><td class="ct-num">' + R(v.aluguel) + '</td><td></td></tr>' +
      (v.extras ? '<tr><td>Dias extras (' + p.diasExtras + ')</td><td class="ct-num">' + R(v.extras) + '</td><td></td></tr>' : '') +
      (v.complementos ? '<tr><td>Complementos</td><td class="ct-num">' + R(v.complementos) + '</td><td></td></tr>' : '') +
      (v.desconto ? '<tr><td>Desconto' + (p.desconto && p.desconto.motivo ? ' (' + esc(p.desconto.motivo) + ')' : '') + '</td><td class="ct-num">− ' + R(v.desconto) + '</td><td></td></tr>' : '') +
      '<tr class="ct-forte"><td>Total do aluguel</td><td class="ct-num">' + R(v.total) + '</td><td></td></tr>' +
      '<tr><td>Sinal pago</td><td class="ct-num">' + R(sinalPago) + '</td><td>' + esc(formaDe(['sinal'])) + '</td></tr>' +
      '<tr><td>Saldo pago na retirada</td><td class="ct-num">' + R(saldoPago) + '</td><td>' + esc(formaDe(['saldo', 'total'])) + '</td></tr>' +
      '<tr class="ct-forte"><td>Caução (devolvida conforme a cláusula 7)</td><td class="ct-num">' + R(caucaoPaga || v.caucao) + '</td><td>' + esc(formaDe(['caucao'])) + '</td></tr>' +
      '</tbody></table>' +
      '<p>O sinal garante a peça na data e é descontado do total. A caução não é pagamento do aluguel: é uma garantia, devolvida na mesma forma em que foi paga (cartão de crédito: devolvida por Pix ou dinheiro).</p>');

    // 5 a 11. Cláusulas
    h.push('<h2>5. Vistoria com fotos</h2><p>Na retirada, a LOCADORA fotografa cada peça de frente, de costas, a barra e os detalhes, e anota no laudo da cláusula 12 os defeitos que ela já tem. ' +
      'O LOCATÁRIO confere as fotos e as anotações antes de assinar. Na devolução, a vistoria se repete com as mesmas fotos. Só é responsabilidade do LOCATÁRIO o dano que não aparece no laudo da retirada. ' +
      'As fotos são enviadas ao LOCATÁRIO pelo WhatsApp quando ele pedir.</p>');
    h.push('<h2>6. Uso e cuidados</h2><ol>' +
      '<li>A peça é para uso pessoal do LOCATÁRIO. Não pode ser emprestada, sublocada nem vendida.</li>' +
      '<li>Não lave, não passe e não tinja a peça: a higienização é feita pela LOCADORA e já está incluída no preço.</li>' +
      '<li>Não costure, corte, cole nem faça ajustes sem autorização por escrito.</li>' +
      '<li>Sujeira comum de uso (poeira, suor, maquiagem leve) não é dano. Manchas que não saem na limpeza normal (tinta, graxa, vinho, cola) são dano.</li>' +
      '<li>Qualquer problema durante o uso deve ser avisado logo pelo WhatsApp do ateliê.</li></ol>');
    h.push('<h2>7. Devolução, atraso e caução</h2><ol>' +
      '<li>A peça volta na data e no horário da cláusula 3, com todos os itens da cláusula 2.</li>' +
      '<li><strong>Atraso:</strong> cada dia de atraso é cobrado pelo valor do dia extra das peças, <strong>' + R(diaExtra) + ' por dia</strong>. A LOCADORA avisa pelo WhatsApp no dia da devolução e no dia seguinte.</li>' +
      '<li><strong>Dano novo:</strong> é cobrado pelo custo do conserto ou da limpeza especial, item por item e por escrito, no laudo da cláusula 12.</li>' +
      '<li><strong>Acerto da caução:</strong> caução − atraso − danos novos = valor devolvido ao LOCATÁRIO. Se atraso e danos passarem da caução, a diferença é paga na devolução.</li>' +
      '<li>Sem atraso e sem dano novo, a caução volta inteira ' + prazoCaucao + '.</li></ol>');
    h.push('<h2>8. Perda, roubo ou dano sem conserto</h2><p>Se a peça se perder, for roubada ou voltar sem conserto possível, o LOCATÁRIO paga o valor de reposição da cláusula 2, descontada a caução. ' +
      'Em caso de roubo ou furto, o LOCATÁRIO apresenta o boletim de ocorrência. A peça que não for devolvida em até ' + (ct.diasParaPerda || 7) + ' dias depois da data de devolução, sem justificativa, é tratada como perdida. ' +
      'A cobrança por atraso nunca passa do valor de reposição.</p>');
    h.push('<h2>9. Cancelamento, troca e arrependimento</h2><ol>' +
      '<li><strong>Até 7 dias antes da retirada:</strong> o LOCATÁRIO pode cancelar e recebe o sinal de volta inteiro.</li>' +
      '<li><strong>Menos de 7 dias antes da retirada:</strong> o sinal vira crédito para outra locação no ateliê, válido por ' + (ct.validadeCreditoMeses || 6) + ' meses.</li>' +
      '<li><strong>Reserva feita fora da loja</strong> (site, WhatsApp ou telefone): o LOCATÁRIO pode desistir em até 7 dias da contratação, com devolução integral do que pagou (art. 49 do Código de Defesa do Consumidor).</li>' +
      '<li>Se a peça não servir na retirada e houver outro tamanho livre na data, a troca é feita na hora, sem custo.</li>' +
      '<li>Se a LOCADORA não puder entregar a peça reservada e não houver outra que o LOCATÁRIO aceite, devolve tudo o que ele pagou.</li></ol>');
    h.push('<h2>10. Dados pessoais e fotos</h2><p>A LOCADORA usa nome, CPF, RG, endereço, WhatsApp e as fotos da vistoria só para cumprir este contrato e cobrar o que ele prevê (LGPD, art. 7º, V). ' +
      'Esses dados não são vendidos nem passados a terceiros, salvo obrigação legal. As fotos da vistoria ficam guardadas por ' + cfg.lgpd.retencaoFotosMeses + ' meses após a devolução; ' +
      'o contrato e os dados de identificação, por ' + cfg.lgpd.retencaoCadastroAnos + ' anos. O LOCATÁRIO pode pedir pelo WhatsApp para ver, corrigir ou apagar seus dados quando esses prazos terminarem.' +
      (c.marketing && c.marketing.consentido ? ' O LOCATÁRIO aceitou, à parte, receber novidades pelo WhatsApp, e pode desistir quando quiser.' : '') + '</p>');
    h.push('<h2>11. Disposições finais</h2><p>Este contrato é feito em duas vias iguais, uma para cada parte. Fica eleito o foro da comarca do domicílio do LOCATÁRIO para resolver qualquer questão sobre ele.</p>');

    // 12. Laudo
    var fotosTxt = function (vs) {
      return FOTOS.map(function (f) { return (vs && vs.fotos && vs.fotos[f[0]] ? '☑ ' : '☐ ') + f[1]; }).join('  ');
    };
    var defeitos = function (vs) { return vs ? (vs.defeitos || []).concat(vs.obs ? [vs.obs] : []) : []; };
    var dr = defeitos(vr);
    h.push('<h2>12. Laudo de vistoria</h2>' +
      '<p><strong>Na retirada</strong>' + (vr ? ' (' + esc(L.dataBR(vr.dia)) + ')' : '') + ' — fotos: ' + fotosTxt(vr) + '</p>' +
      '<table class="ct-tab ct-tab--linhas"><thead><tr><th>Peças</th><th>Defeitos que a peça já tem</th></tr></thead><tbody>' +
      '<tr><td class="ct-cod">' + esc(itens.map(function (it) { return it.unidade; }).join(', ')) + '</td><td>' + (vr ? (dr.length ? esc(dr.join('; ')) : 'Nenhum defeito anotado.') : BRANCO) + '</td></tr></tbody></table>' +
      '<p>Rubrica do LOCATÁRIO: ' + BRANCO + '</p>');
    if (vd && p.acerto) {
      var a = p.acerto;
      h.push('<p><strong>Na devolução</strong> (' + esc(L.dataBR(vd.dia)) + ') — fotos: ' + fotosTxt(vd) + '</p>' +
        '<table class="ct-tab ct-tab--linhas"><thead><tr><th>Dano novo</th><th class="ct-num">Valor</th></tr></thead><tbody>' +
        ((p.danos || []).length ? p.danos.map(function (x) { return '<tr><td>' + esc(x.descricao) + '</td><td class="ct-num">' + R(x.valor) + '</td></tr>'; }).join('') : '<tr><td>Nenhum dano novo.</td><td></td></tr>') +
        '</tbody></table><table class="ct-tab ct-tab--linhas"><tbody>' +
        '<tr><td>Caução paga</td><td class="ct-num">' + R(a.caucao) + '</td></tr>' +
        '<tr><td>− Atraso (' + a.diasAtraso + ' dia' + (a.diasAtraso === 1 ? '' : 's') + ')</td><td class="ct-num">' + R(a.multa) + '</td></tr>' +
        '<tr><td>− Danos novos</td><td class="ct-num">' + R(a.danos) + '</td></tr>' +
        '<tr class="ct-forte"><td>= Devolvido ao LOCATÁRIO</td><td class="ct-num">' + R(a.devolver) + '</td></tr>' +
        (a.cobrar ? '<tr><td>Diferença cobrada</td><td class="ct-num">' + R(a.cobrar) + '</td></tr>' : '') + '</tbody></table>' +
        '<p>Rubrica do LOCATÁRIO: ' + BRANCO + '</p>');
    } else {
      h.push('<p><strong>Na devolução</strong> — data ' + BRANCO + ' · fotos: ☐ frente  ☐ costas  ☐ barra  ☐ detalhes</p>' +
        '<table class="ct-tab ct-tab--linhas"><thead><tr><th>Dano novo (o que e onde)</th><th class="ct-num">Valor</th></tr></thead><tbody><tr><td>&nbsp;</td><td></td></tr><tr><td>&nbsp;</td><td></td></tr></tbody></table>' +
        '<p>Acerto: caução ' + R(caucaoPaga || v.caucao) + ' − atraso ' + BRANCO + ' − danos ' + BRANCO + ' = devolvido ' + BRANCO + ' · Rubrica: ' + BRANCO + '</p>');
    }

    // Assinaturas
    var cidade = (ct.endereco && ct.endereco.split(',').pop().trim()) || (cfg.cidade !== 'sua cidade' ? cfg.cidade : '') || e.cidade || '';
    h.push('<h2>Assinaturas</h2><p>O LOCATÁRIO declara que leu este contrato, conferiu as peças, as fotos e o laudo da retirada, e recebeu sua via.</p>' +
      '<p>' + ou(cidade) + ', ' + esc(dataExtenso(d.hoje)) + '.</p>' +
      '<div class="ct-assinaturas"><div><span class="ct-linha"></span><p>LOCADORA · ' + esc(cfg.atelie) + '</p></div>' +
      '<div><span class="ct-linha"></span><p>LOCATÁRIO(A) · ' + ou(c.nome) + '<br>CPF ' + ou(cpf(c.cpf)) + '</p></div></div>');

    return { html: '<article class="ct-papel">' + h.join('') + '</article>', pendencias: pend };
  }

  return { gerar: gerar, dataExtenso: dataExtenso };
});
