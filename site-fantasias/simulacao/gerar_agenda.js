/* Gera simulacao/agenda_exemplo.js: reservas fictícias para a vitrine de
 * simulação. Determinístico (semente fixa) — rodar de novo dá o mesmo
 * resultado, a não ser que dados.js ou config.js mudem.
 *
 * Cenário: festas de fim de ano 2026 e Carnaval 2027 (sábado 06/02). Peças de
 * Carnaval são muito procuradas no Carnaval, e várias esgotam — é o que a
 * simulação precisa mostrar.
 *
 * Uso: node simulacao/gerar_agenda.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const L = require('../logica.js');

const raiz = path.join(__dirname, '..');
const janela = {};
const ctx = vm.createContext({ window: janela });
for (const f of ['config.js', 'dados.js']) vm.runInContext(fs.readFileSync(path.join(raiz, f), 'utf8'), ctx);
const C = janela.CONFIG, FANTASIAS = janela.FANTASIAS;

// Gerador pseudoaleatório com semente (mulberry32).
let semente = 20270206;
function aleatorio() {
  semente |= 0; semente = semente + 0x6D2B79F5 | 0;
  let t = Math.imul(semente ^ semente >>> 15, 1 | semente);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

const HOJE = '2026-11-16';
const FESTAS = [
  { data: '2026-11-28', tipo: 'comum' },
  { data: '2026-12-05', tipo: 'fim-de-ano' },
  { data: '2026-12-12', tipo: 'fim-de-ano' },
  { data: '2026-12-19', tipo: 'fim-de-ano' },
  { data: '2026-12-31', tipo: 'fim-de-ano' },
  { data: '2027-01-16', tipo: 'comum' },
  { data: '2027-01-30', tipo: 'pre-carnaval' },
  { data: '2027-02-05', tipo: 'carnaval' },
  { data: '2027-02-06', tipo: 'carnaval' },
  { data: '2027-02-08', tipo: 'carnaval' },
  { data: '2027-02-09', tipo: 'carnaval' }
];

function chance(f, tipo) {
  const tem = t => f.temas.includes(t);
  if (tipo === 'carnaval') return tem('carnaval') ? 0.42 : 0.1;
  if (tipo === 'pre-carnaval') return tem('carnaval') ? 0.25 : 0.08;
  if (tipo === 'fim-de-ano') return tem('decadas') || tem('herois') ? 0.3 : 0.12;
  return 0.1;
}

const agenda = [];
for (const festa of FESTAS) {
  for (const f of FANTASIAS) {
    const loja = C.lojas[f.loja];
    for (const t of Object.keys(f.tamanhos)) {
      for (const u of L.unidades(f, t)) {
        if (aleatorio() >= chance(f, festa.tipo)) continue;
        const extras = aleatorio() < 0.2 ? 1 : 0;
        const per = L.periodoAluguel(festa.data, HOJE, extras, loja);
        const livres = L.disponibilidade(f, agenda, per, loja.margemHigienizacao)[t].livres;
        if (livres.includes(u)) {
          agenda.push({ fantasia: f.id, tamanho: t, unidade: u, retirada: per.retirada, devolucao: per.devolucao });
        }
      }
    }
  }
}

const erros = L.validarAgenda(FANTASIAS, agenda, C.lojas);
if (erros.length) { console.error(erros.join('\n')); process.exit(1); }

const linhas = agenda.map(r => '  ' + JSON.stringify(r).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\w)/g, ', ') + ',');
const saida = `/* GERADO por simulacao/gerar_agenda.js — reservas FICTÍCIAS para a simulação.
 * Não vai para o site publicado (lá vale o agenda.js da raiz). */
window.AGENDA = [
${linhas.join('\n')}
];
`;
fs.writeFileSync(path.join(__dirname, 'agenda_exemplo.js'), saida);
console.log('agenda_exemplo.js: ' + agenda.length + ' reservas');
