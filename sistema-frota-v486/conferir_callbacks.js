/** Confere que todo google.script.run do HTML resolve numa funcao do .gs. */
const fs = require('fs');
const CHAIN = new Set(['withSuccessHandler', 'withFailureHandler', 'withUserObject']);
function fechar(t, i) {
  let n = 1, q = null;
  while (i < t.length && n > 0) {
    const c = t[i];
    if (q) { if (c === '\\') { i += 2; continue; } if (c === q) q = null; }
    else if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '(') n++; else if (c === ')') n--;
    i++;
  }
  return i;
}
function callbacks(t) {
  const out = new Set();
  const re = /google\.script\.run/g; let m;
  while ((m = re.exec(t)) !== null) {
    let i = m.index + m[0].length;
    for (let v = 0; v < 12; v++) {
      const c = t.slice(i).match(/^\s*\.\s*([A-Za-z0-9_]+)\s*\(/);
      if (!c) break;
      i += c[0].length;
      if (CHAIN.has(c[1])) { i = fechar(t, i); continue; }
      out.add(c[1]); break;
    }
  }
  return out;
}
const gs = fs.readFileSync(process.argv[2], 'utf8');
const def = new Set([...gs.matchAll(/^\s*function\s+([A-Za-z0-9_]+)\s*\(/gm)].map(m => m[1]));
let falhas = 0;
process.argv.slice(3).forEach(f => {
  const c = [...callbacks(fs.readFileSync(f, 'utf8'))].sort();
  const ruins = c.filter(x => !def.has(x));
  falhas += ruins.length;
  console.log((ruins.length ? '  FALHA ' : '  OK    ') + f.padEnd(16) + c.length +
    ' callback(s)' + (ruins.length ? ' • sem função: ' + ruins.join(', ') : ''));
});
console.log(falhas === 0 ? 'TODOS OS CALLBACKS RESOLVEM' : falhas + ' SEM FUNÇÃO');
process.exit(falhas === 0 ? 0 : 1);
