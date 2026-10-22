/**
 * Confere o IPVA lancado em 12 parcelas (V4.8.7).
 *
 * O ponto que quebra em silencio: R$ 1.000 / 12 = 83,333... Arredondar as doze
 * para 83,33 soma R$ 999,96 — quatro centavos a menos que a guia. Diferenca
 * pequena o bastante para ninguem ver e grande o bastante para destruir a
 * conciliacao de quem confere contra o documento.
 */
const fs = require('fs');
const vm = require('vm');

const ctx = {
  console,
  PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
                       getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null },
  Utilities: { getUuid: () => 'abcd1234-ef56' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
  Object.assign(globalThis, {
    dividirEmParcelas_, somarMesesCompetencia_, PARCELAS_IPVA_,
    TIPOS_DESPESA, mapaTipoColunaResumo_, R_, normalizarMesReferencia_,
  });
`, ctx);

let falhas = 0;
const ck = (n, ok, d) => {
  console.log((ok ? '  OK   ' : '  FALHA') + ' ' + n + (d ? ' — ' + d : ''));
  if (!ok) falhas++;
};
const soma = a => a.reduce((t, v) => t + v, 0);
const cents = v => Math.round(v * 100);

console.log('--- as 12 parcelas somam EXATAMENTE o valor anual ---');
[2400, 1000, 1234.56, 0.07, 999.99, 83.33, 1, 100000].forEach(valor => {
  const p = ctx.dividirEmParcelas_(valor, 12);
  ck('R$ ' + valor, p.length === 12 && cents(soma(p)) === cents(valor),
    p.length + ' parcelas somando R$ ' + soma(p).toFixed(2));
});

console.log('');
console.log('--- a sobra vai na ultima, nao espalhada ---');
let p = ctx.dividirEmParcelas_(1000, 12);
ck('11 primeiras iguais', new Set(p.slice(0, 11)).size === 1, 'R$ ' + p[0].toFixed(2));
ck('ultima absorve a diferenca', p[11] !== p[0], 'R$ ' + p[11].toFixed(2));
ck('media simples daria menos',
  cents(p[0] * 12) < cents(1000), 'R$ ' + (p[0] * 12).toFixed(2) + ' vs R$ 1000,00');

console.log('');
console.log('--- competencia avanca certo, inclusive virando o ano ---');
[['2026-07', 0, '2026-07'], ['2026-07', 5, '2026-12'], ['2026-07', 6, '2027-01'],
 ['2026-07', 11, '2027-06'], ['2026-01', 11, '2026-12'], ['2026-12', 1, '2027-01'],
 ['2026-12', 12, '2027-12']].forEach(([base, n, esperado]) => {
  const r = ctx.somarMesesCompetencia_(base, n);
  ck(base + ' + ' + n + ' = ' + esperado, r === esperado, r);
});

console.log('');
console.log('--- as 12 competencias de um lancamento sao distintas e seguidas ---');
const comps = [];
for (let i = 0; i < 12; i++) comps.push(ctx.somarMesesCompetencia_('2026-07', i));
ck('12 competencias distintas', new Set(comps).size === 12, comps[0] + ' … ' + comps[11]);
ck('nenhuma repete, nenhuma pula',
  comps.every((c, i) => i === 0 || ctx.somarMesesCompetencia_(comps[i - 1], 1) === c));

console.log('');
console.log('--- IPVA virou tipo de despesa e alimenta a coluna certa ---');
ck('IPVA em TIPOS_DESPESA', ctx.TIPOS_DESPESA.includes('IPVA'));
ck('tipo IPVA -> coluna R_.IPVA', ctx.mapaTipoColunaResumo_()['IPVA'] === ctx.R_.IPVA,
  'indice ' + ctx.mapaTipoColunaResumo_()['IPVA']);
ck('Emplacamento continua em coluna propria',
  ctx.mapaTipoColunaResumo_()['Emplacamento/IPVA/Seguro'] === ctx.R_.EMPLACAMENTO);

console.log('');
console.log('--- o cadastro NAO alimenta mais o mapa ---');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
ck('calcularLinhasResumo_ nao divide o cadastro por 12',
  !/l\[R_\.IPVA\]\s*=\s*\(Number\(v\[COL_VEIC\.IPVA/.test(fonte));

console.log('');
console.log(falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)');
process.exit(falhas === 0 ? 0 : 1);
