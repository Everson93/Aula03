/**
 * Confere o lastro das sessoes (V4.8.7).
 *
 * O CacheService despeja entradas antes do TTL. Sem lastro, isso desloga o
 * usuario no meio do expediente, sem padrao — o tipo de defeito que chega como
 * "as vezes cai" e nunca se reproduz.
 *
 * O que este teste trava: que o despejo NAO desloga, que o logout encerra de
 * verdade, e que o lastro nao vira um caminho para burlar permissao.
 */
const fs = require('fs');
const vm = require('vm');

function montar(usuario) {
  const cache = {};
  const props = {};
  const ctx = {
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: k => { delete props[k]; },
        getProperties: () => Object.assign({}, props),
      }),
      getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    },
    CacheService: { getScriptCache: () => ({
      get: k => (k in cache ? cache[k] : null),
      put: (k, v) => { cache[k] = v; },
      remove: k => { delete cache[k]; },
    }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => null },
    Utilities: {
      getUuid: () => 'tok-' + Math.random().toString(36).slice(2),
      computeDigest: (a, t) => String(t).split('').map(c => c.charCodeAt(0) % 256),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('Codigo.gs', 'utf8') + `
    Object.assign(globalThis, {
      criarSessaoWeb_, sessaoPorToken_, webLogout, sessaoDoLastro_,
      limparLastrosVencidos_, chaveLastroSessao_, TEMPO_SESSAO_SEGUNDOS,
    });
    __usuario = ${JSON.stringify(usuario)};
    estadoUsuarioAcesso_ = function () { return __usuario; };
    versaoSessaoUsuario_ = function () { return __usuario.authVersion; };
    aquecerCacheAcessoUsuario_ = function () {};
    registrarLoginPendente_ = function () {};
  `, ctx);
  ctx.__cache = cache;
  ctx.__props = props;
  return ctx;
}

let falhas = 0;
const ck = (n, ok, d) => {
  console.log((ok ? '  OK   ' : '  FALHA') + ' ' + n + (d ? ' — ' + d : ''));
  if (!ok) falhas++;
};

const USUARIO = { email: 'a@b.com', nome: 'Fulano', perfil: 'OPERADOR', ativo: true,
                  trocarSenha: false, authVersion: 1 };

console.log('--- login grava cache E lastro ---');
let ctx = montar(USUARIO);
let criada = ctx.criarSessaoWeb_({ email: 'a@b.com', nome: 'Fulano', perfil: 'OPERADOR' });
ck('cache tem a sessão', !!ctx.__cache['SESSAO_' + criada.token]);
ck('lastro foi gravado',
  Object.keys(ctx.__props).some(k => k.indexOf('SESL_') === 0));
ck('o lastro NÃO guarda o token em claro',
  !Object.keys(ctx.__props).some(k => k.indexOf(criada.token) !== -1));

console.log('');
console.log('--- o despejo do cache NÃO desloga ---');
delete ctx.__cache['SESSAO_' + criada.token];          // simula o despejo
let s2 = null, erro = null;
try { s2 = ctx.sessaoPorToken_(criada.token); } catch (e) { erro = e.message; }
ck('sessão sobrevive ao despejo', !!s2, erro || (s2 && s2.email));
ck('perfil veio do cadastro', s2 && s2.perfil === 'OPERADOR');
ck('cache foi reidratado', !!ctx.__cache['SESSAO_' + criada.token]);

console.log('');
console.log('--- logout encerra de verdade ---');
ctx.webLogout(criada.token);
erro = null;
try { ctx.sessaoPorToken_(criada.token); } catch (e) { erro = e.message; }
ck('token não vale mais', !!erro, erro);
ck('lastro foi removido',
  !Object.keys(ctx.__props).some(k => k.indexOf('SESL_') === 0));

console.log('');
console.log('--- o lastro não burla permissão ---');
ctx = montar(USUARIO);
criada = ctx.criarSessaoWeb_({ email: 'a@b.com', nome: 'Fulano', perfil: 'ADMIN' });
delete ctx.__cache['SESSAO_' + criada.token];
ctx.__usuario.perfil = 'CONSULTA';                     // rebaixado no cadastro
const reconstruida = ctx.sessaoDoLastro_(criada.token);
ck('reconstrói com o perfil ATUAL, não o do login',
  reconstruida && reconstruida.perfil === 'CONSULTA',
  reconstruida ? reconstruida.perfil : 'nulo');

ctx.__usuario.ativo = false;                           // desativado
ck('usuário desativado não reconstrói', ctx.sessaoDoLastro_(criada.token) === null);

console.log('');
console.log('--- lastro vencido é recolhido ---');
ctx = montar(USUARIO);
criada = ctx.criarSessaoWeb_({ email: 'a@b.com', nome: 'F', perfil: 'OPERADOR' });
const chave = Object.keys(ctx.__props).filter(k => k.indexOf('SESL_') === 0)[0];
ctx.__props[chave] = JSON.stringify({ email: 'a@b.com', exp: Date.now() - 1000 });
ck('vencido não reconstrói', ctx.sessaoDoLastro_(criada.token) === null);
ctx.__props[chave] = JSON.stringify({ email: 'a@b.com', exp: Date.now() - 1000 });
ck('a limpeza horária remove', ctx.limparLastrosVencidos_() === 1);
ck('não sobrou lastro', !Object.keys(ctx.__props).some(k => k.indexOf('SESL_') === 0));

console.log('');
console.log(falhas === 0 ? 'TUDO PASSOU' : falhas + ' FALHA(S)');
process.exit(falhas === 0 ? 0 : 1);
