/* ===== Agenda de reservas confirmadas =====
 * O site usa esta lista para mostrar quantas peças estão livres na data da
 * festa. Cada reserva ocupa UMA peça física (unidade) da retirada até a
 * devolução, mais a margem de higienização da loja.
 *
 * Unidade = código da fantasia + tamanho + número da peça. Ex.: a 2ª bruxa M
 * é "HW01-M-2" (o número vai de 1 até o estoque daquele tamanho em dados.js).
 *
 * Ao confirmar um sinal pelo WhatsApp, acrescente uma linha:
 *   { fantasia: 'HW01', tamanho: 'M', unidade: 'HW01-M-2', retirada: '2027-02-05', devolucao: '2027-02-08' },
 *
 * Lista vazia = todas as peças aparecem livres (a loja ainda confirma no WhatsApp).
 * A suíte conferir_landing.js reprova a agenda se duas reservas cruzarem na mesma peça. */
window.AGENDA = [
];

/* Acessórios alugados (vassoura, chapéu de palha, espada...): quantos saem em cada data.
 *   { fantasia: 'JN01', kitId: 'chapeu-palha', qtd: 1, retirada: '2027-06-18', devolucao: '2027-06-21' },
 * Lista vazia = todo o estoque do acessório aparece livre. */
window.AGENDA_KITS = [
];
