/* Leitor da planilha EMBARQUE EXPEDIÇÃO.
 * Transforma as abas CARGAS GERAL, CP2 CARGA-N, Nao mexer CARGA CP2 e CARGA FLV
 * numa lista única de "entregas" (uma por loja dentro de cada viagem).
 * Funciona no navegador (window.Expedicao) e no Node (module.exports). */
(function (root) {
  'use strict';

  // Tabela de apoio (aba APOIO): número curto da loja -> código da loja.
  const CODIGOS_PADRAO = {
    LJ1: 19, LJ2: 27, LJ3: 35, LJ4: 43, LJ5: 51, LJ6: 60, LJ7: 78, LJ8: 86, LJ9: 94, LJ10: 108,
    LJ11: 116, LJ12: 124, LJ13: 132, LJ14: 140, LJ15: 159, LJ16: 167, LJ17: 175, LJ18: 183, LJ19: 191,
    CB1: 3506, CB2: 3514, CB3: 3522, CB4: 3530, CB5: 3549, CB6: 3557, CB7: 3565, CB8: 3573, CB9: 3581,
    CP1: 2003, CP2: 2011, FLV: 1554
  };

  const RE_PLACA = /^[A-Z]{3}\s*-?\s*\d[A-Z0-9]\d{2}/i;

  function excelDate(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return d.toISOString().slice(0, 10);
    }
    if (v instanceof Date && !isNaN(v)) {
      const d = new Date(v.getTime() + 12 * 3600000);
      return d.toISOString().slice(0, 10);
    }
    if (typeof v === 'string') {
      const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m) {
        const y = m[3].length === 2 ? '20' + m[3] : m[3];
        return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
      }
    }
    return null;
  }

  function excelTime(v) {
    if (typeof v === 'number' && v >= 0 && v < 1) {
      const min = Math.round(v * 1440);
      return String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
    }
    if (typeof v === 'string') return v.trim();
    return '';
  }

  function txt(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    return String(v).trim();
  }

  // Normaliza um destino escrito à mão: "cb02" -> CB2, "7" -> LJ7, "cpi" -> CP1...
  function normDestino(tok) {
    const t = tok.toUpperCase().replace(/\s+/g, '').replace(/\.$/, '');
    if (!t) return null;
    let m;
    if ((m = t.match(/^(?:CB|BC|C\.B)0?(\d)$/))) return 'CB' + m[1];
    if (t === 'CBI') return 'CB1';
    if ((m = t.match(/^(?:LJ|L)?0?(\d{1,2})$/))) {
      const n = +m[1];
      return n >= 1 && n <= 40 ? 'LJ' + n : null;
    }
    if (/^(CP0?1|CPI|CO1)$/.test(t)) return 'CP1';
    if (/^CP0?2$/.test(t)) return 'CP2';
    if (t === 'FLV') return 'FLV';
    if (/^(DC|D|DCA|DOCA)0?1$/.test(t)) return 'DOCA1';
    return 'OUTRO:' + tok.trim().toUpperCase();
  }

  function tipoDestino(d) {
    if (/^(LJ|CB)\d+$/.test(d)) return 'loja';
    if (/^(CP1|CP2|FLV|DOCA1)$/.test(d)) return 'transferencia';
    return 'outros';
  }

  function nomeDestino(d) {
    if (d.startsWith('LJ')) return 'Loja ' + d.slice(2);
    if (d.startsWith('OUTRO:')) return d.slice(6);
    if (d === 'DOCA1') return 'Doca 1';
    return d;
  }

  // Lista de destinos: "7+CB2", "CB2 / 10", "4+ cb6" ...
  function splitDestinos(raw) {
    const s = txt(raw);
    if (!s) return { itens: [], valido: false };
    let partes = s.split(/\s*[+\/,]\s*/);
    // "CB2-10" (hífen entre duas lojas)
    if (partes.length === 1 && /^\s*\S+\s*-\s*\S+\s*$/.test(s)) {
      const p = s.split('-');
      if (p.every(x => { const d = normDestino(x); return d && tipoDestino(d) === 'loja'; })) partes = p;
    }
    partes = partes.filter(p => p.trim() !== '');
    const itens = partes.map(normDestino).filter(Boolean);
    return { itens, valido: itens.length > 0 && itens.length === partes.length };
  }

  // Quantidades: "21+7", "25+" (incompleto), "28PL", "?"...
  function splitQtd(raw) {
    if (raw === null || raw === undefined || raw === '') return { nums: [], incompleto: false, texto: '' };
    if (typeof raw === 'number') {
      return Number.isInteger(raw) && raw >= 0 && raw < 200
        ? { nums: [raw], incompleto: false, texto: '' }
        : { nums: [], incompleto: false, texto: String(raw) };
    }
    const s = String(raw).trim();
    if (!s) return { nums: [], incompleto: false, texto: '' };
    const partes = s.split(/\s*[+\/]\s*/);
    const nums = [];
    let texto = '';
    let incompleto = false;
    partes.forEach((p, i) => {
      const t = p.trim();
      if (t === '') { if (i === partes.length - 1 && i > 0) incompleto = true; return; }
      const m = t.match(/^(\d{1,3})\s*(pl|pls|paletes?)?$/i);
      if (m) nums.push(+m[1]);
      else { texto += (texto ? ' ' : '') + t; if (/^\?$/.test(t)) incompleto = true; }
    });
    return { nums, incompleto, texto };
  }

  function ehTerceiro(placa, mot) {
    const p = placa.toUpperCase();
    const m = mot.toUpperCase();
    return /TER(C|$)|TTERC/.test(m) || /TERC/.test(p) || /-\s*T\s*$/.test(p) || /^T\//.test(p);
  }

  /* Distribui uma lista de quantidades entre os destinos da viagem.
   * Regra: a ordem das quantidades segue a ordem das lojas (7+CB2 / 21+7 -> LJ7=21, CB2=7). */
  function distribuir(destinos, q) {
    const out = [];
    const alertas = [];
    const nd = destinos.length;
    const nq = q.nums.length;
    if (nq === 0) return { out, alertas };
    if (nd === nq) {
      destinos.forEach((d, i) => out.push({ destino: d, qtd: q.nums[i] }));
      if (q.incompleto && nd > 1) alertas.push('quantidade marcada como incompleta');
    } else if (nd === 1) {
      out.push({ destino: destinos[0], qtd: q.nums.reduce((a, b) => a + b, 0) });
      alertas.push(nq > 1 ? 'mais quantidades que lojas; somadas para a loja' : '');
    } else if (nq === 1 && q.incompleto) {
      out.push({ destino: destinos[0], qtd: q.nums[0] });
      alertas.push('só a 1ª loja tem quantidade ("' + q.nums[0] + '+")');
    } else {
      // Não dá para saber a divisão: mantém o grupo junto, sem inventar números.
      out.push({ destino: destinos.join('+'), qtd: q.nums.reduce((a, b) => a + b, 0), grupo: true });
      alertas.push(nd + ' lojas para ' + nq + ' quantidade(s); paletes ficaram no grupo');
    }
    if (q.incompleto && nd !== nq && !(nq === 1 && nd > 1)) alertas.push('quantidade incompleta');
    return { out, alertas: alertas.filter(Boolean) };
  }

  function acharAba(wb, testes) {
    const nomes = wb.SheetNames;
    const norm = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
    for (const t of testes) {
      const achou = nomes.find(n => t(norm(n)));
      if (achou) return achou;
    }
    return null;
  }

  function lerApoio(rows) {
    const mapa = Object.assign({}, CODIGOS_PADRAO);
    if (!rows) return mapa;
    for (const r of rows) {
      const cod = r[8], loj = r[9];
      if (typeof cod === 'number' && loj !== null && loj !== undefined) {
        const d = normDestino(String(loj));
        if (d && !d.startsWith('OUTRO:')) mapa[d] = cod;
      }
    }
    return mapa;
  }

  /* rowsPorAba: { nomeDaAba: [[...linha], ...] } (sheet_to_json com header:1, raw:true) */
  function processar(rowsPorAba, nomesAbas) {
    const wbLike = { SheetNames: nomesAbas || Object.keys(rowsPorAba) };
    const abaGeral = acharAba(wbLike, [n => n === 'CARGAS GERAL', n => n.includes('CARGAS GERAL')]);
    const abaCp2 = acharAba(wbLike, [n => n.startsWith('CP2 CARGA'), n => n.includes('CP2') && n.includes('CARGA') && !n.includes('MEXER')]);
    const abaCp2Ant = acharAba(wbLike, [n => n.includes('MEXER') && n.includes('CP2')]);
    const abaFlv = acharAba(wbLike, [n => n === 'CARGA FLV', n => n.includes('CARGA FLV')]);
    const abaApoio = acharAba(wbLike, [n => n === 'APOIO']);

    const codigos = lerApoio(abaApoio && rowsPorAba[abaApoio]);
    const entregas = [];
    const alertas = [];
    const resumoAbas = [];
    let viagemId = 0;

    function registrar(base, destinos, qtds, extras) {
      // qtds: { CD: splitQtd, CP2: ..., FLV: ... }; extras: entregas já com loja definida
      const id = ++viagemId;
      const alertasViagem = [];
      let algum = false;
      for (const origem of Object.keys(qtds)) {
        const q = qtds[origem];
        if (!q || q.nums.length === 0) continue;
        const { out, alertas: al } = distribuir(destinos, q);
        al.forEach(a => alertasViagem.push(origem + ': ' + a));
        lancar(out, origem);
      }
      lancar(extras || [], null);
      function lancar(lista, origemPadrao) {
        lista.forEach(o => {
          const origem = o.origem || origemPadrao;
          algum = true;
          entregas.push({
            viagem: id, data: base.data, aba: base.aba, linha: base.linha, origem,
            destino: o.destino, grupo: !!o.grupo,
            tipo: o.grupo ? 'loja' : tipoDestino(o.destino),
            qtd: o.qtd, frota: base.frota, placa: base.placa, motorista: base.motorista,
            lojasTexto: base.lojasTexto, qtdTexto: base.qtdTexto, obs: o.obs || base.obs || ''
          });
        });
      }
      if (alertasViagem.length) {
        alertas.push({ data: base.data, aba: base.aba, linha: base.linha, lojas: base.lojasTexto,
          qtd: base.qtdTexto, motivo: alertasViagem.join('; ') });
      }
      return algum;
    }

    function frotaDe(placa, mot) {
      if (!placa && !mot) return 'nao_inf';
      return ehTerceiro(placa, mot) ? 'terceiro' : 'propria';
    }

    // ---------- CARGAS GERAL (saídas do CD) ----------
    if (abaGeral) {
      const rows = rowsPorAba[abaGeral];
      let n = 0, semQtd = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const data = excelDate(r[0]);
        if (!data) continue;
        let lojasRaw = r[8], placa = txt(r[6]);
        const cdRaw = r[9];
        if (txt(lojasRaw) === '' && txt(cdRaw) === '') continue;
        // Linha com placa e loja trocadas de coluna
        if (RE_PLACA.test(txt(lojasRaw)) && splitDestinos(placa).valido) {
          const tmp = placa; placa = txt(lojasRaw); lojasRaw = tmp;
        }
        const mot = txt(r[17]);
        const base = {
          data, aba: abaGeral, linha: i + 1, placa, motorista: mot, frota: frotaDe(placa, mot),
          lojasTexto: txt(lojasRaw), qtdTexto: txt(cdRaw)
        };
        const dest = splitDestinos(lojasRaw);
        const qCD = splitQtd(cdRaw);
        const qCP2 = splitQtd(r[10]);
        const qFLV = splitQtd(r[11]);
        const obs = [qCD.texto, qCP2.texto, qFLV.texto].filter(Boolean).join(' · ');
        base.obs = obs;
        if (!dest.valido) {
          if (qCD.nums.length) {
            alertas.push({ data, aba: abaGeral, linha: i + 1, lojas: base.lojasTexto, qtd: base.qtdTexto,
              motivo: 'destino não reconhecido; linha ignorada' });
          }
          continue;
        }
        if (qCD.nums.length === 0) {
          semQtd++;
          continue;
        }
        // Daqui sai só o volume do CD. CP2 e FLV são lidos das abas próprias,
        // então números nas colunas CP2/FLV ficam só como observação.
        if (qCP2.nums.length) base.obs = (base.obs ? base.obs + ' · ' : '') + 'CP2 ' + txt(r[10]);
        if (qFLV.nums.length) base.obs = (base.obs ? base.obs + ' · ' : '') + 'FLV ' + txt(r[11]);
        // "complemento flv": a quantidade da coluna CD é de FLV, não entra como CD
        if (/comp.*flv|flv.*comp/i.test(qCP2.texto + ' ' + qFLV.texto)) {
          alertas.push({ data, aba: abaGeral, linha: i + 1, lojas: base.lojasTexto, qtd: base.qtdTexto,
            motivo: 'complemento FLV lançado na CARGAS GERAL; não somado (FLV vem da aba CARGA FLV)' });
          continue;
        }
        if (registrar(base, dest.itens, { CD: qCD })) n++;
        // Colunas S e PM: extras que não entram no total de paletes
        const qS = splitQtd(r[12]), qPM = splitQtd(r[13]);
        for (const [campo, q] of [['S', qS], ['PM', qPM]]) {
          if (!q.nums.length) continue;
          const { out } = distribuir(dest.itens, q);
          out.forEach(o => entregas.push({
            viagem: viagemId, data, aba: abaGeral, linha: i + 1, origem: campo, extra: true,
            destino: o.destino, grupo: !!o.grupo, tipo: o.grupo ? 'loja' : tipoDestino(o.destino),
            qtd: o.qtd, frota: base.frota, placa, motorista: mot, lojasTexto: base.lojasTexto, qtdTexto: txt(campo === 'S' ? r[12] : r[13]), obs: ''
          }));
        }
      }
      resumoAbas.push({ aba: abaGeral, viagens: n, ignoradas: semQtd, papel: 'Volume CD (só a coluna CD)' });
    }

    // ---------- CP2 ----------
    const datasCp2Novo = new Set();
    function lerCp2(aba, cLoja, cQtd, cPlaca, cMot) {
      const rows = rowsPorAba[aba];
      let n = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const data = excelDate(r[0]);
        if (!data) continue;
        if (aba === abaCp2Ant && datasCp2Novo.has(data)) continue;
        const lojasRaw = r[cLoja];
        if (txt(lojasRaw) === '') continue;
        const dest = splitDestinos(lojasRaw);
        const q = splitQtd(r[cQtd]);
        const placa = txt(r[cPlaca]), mot = txt(r[cMot]);
        if (!dest.valido) {
          if (q.nums.length) alertas.push({ data, aba, linha: i + 1, lojas: txt(lojasRaw), qtd: txt(r[cQtd]), motivo: 'destino não reconhecido; linha ignorada' });
          continue;
        }
        if (!q.nums.length) continue;
        if (aba === abaCp2) datasCp2Novo.add(data);
        const base = { data, aba, linha: i + 1, placa, motorista: mot, frota: frotaDe(placa, mot),
          lojasTexto: txt(lojasRaw), qtdTexto: txt(r[cQtd]), obs: q.texto };
        if (registrar(base, dest.itens, { CP2: q })) n++;
      }
      resumoAbas.push({ aba, viagens: n, ignoradas: 0, papel: aba === abaCp2 ? 'Expedição CP2 (atual)' : 'Expedição CP2 (histórico, só datas que não estão na aba atual)' });
    }
    if (abaCp2) lerCp2(abaCp2, 17, 18, 19, 24);
    if (abaCp2Ant) lerCp2(abaCp2Ant, 10, 11, 9, 14);

    // ---------- CARGA FLV ----------
    // Bloco de expedição: L=LOJA, M=FLV, N=CD, Q=PLACA, R=MOT.
    // "6+CD" com "14+4": loja 6 recebe 14 FLV e 4 CD.
    // "13-CD+17" com "8-5+5": loja 13 recebe 8 FLV e 5 CD; loja 17 recebe 5 FLV.
    if (abaFlv) {
      const rows = rowsPorAba[abaFlv];
      let n = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const data = excelDate(r[0]);
        if (!data) continue;
        const lojasTxt = txt(r[11]);
        if (!lojasTxt) continue;
        const flvTxt = txt(r[12]);
        const placa = txt(r[16]), mot = txt(r[17]);
        const tokens = lojasTxt.split(/\s*\+\s*/).filter(Boolean);
        const qtdTokens = flvTxt === '' ? [] : flvTxt.split(/\s*\+\s*/);
        const destinos = [], flv = [], cdExtra = [];
        let valido = true, cdPendente = 0;
        tokens.forEach((tk, k) => {
          const qt = (qtdTokens[k] || '').trim();
          if (/^CD$/i.test(tk.trim())) {
            const v = parseInt(qt, 10);
            if (isNaN(v)) return;
            if (destinos.length) cdExtra.push({ destino: destinos[destinos.length - 1], qtd: v });
            else cdPendente += v;
            return;
          }
          const [lj, marca] = tk.split(/\s*-\s*/);
          const d = normDestino(lj);
          if (!d || d.startsWith('OUTRO:')) { valido = false; return; }
          destinos.push(d);
          if (cdPendente) { cdExtra.push({ destino: d, qtd: cdPendente }); cdPendente = 0; }
          const [qF, qC] = qt.split(/\s*-\s*/);
          const vF = parseInt(qF, 10);
          flv.push(isNaN(vF) ? 0 : vF);
          const vC = parseInt(qC, 10);
          if (marca && /CD/i.test(marca) && !isNaN(vC)) cdExtra.push({ destino: d, qtd: vC });
        });
        if (!valido || !destinos.length) continue;
        const base = { data, aba: abaFlv, linha: i + 1, placa, motorista: mot, frota: frotaDe(placa, mot),
          lojasTexto: lojasTxt, qtdTexto: flvTxt + (txt(r[13]) ? ' | CD ' + txt(r[13]) : '') };
        // Mais números que lojas (ex.: "CB4" com "7+2"): deixa a regra geral decidir
        const qF = qtdTokens.length > tokens.length ? splitQtd(flvTxt)
          : { nums: flv.some(x => x > 0) ? flv : [], incompleto: false, texto: '' };
        // Só o volume FLV. Os paletes de CD que vão junto ("-CD", coluna CD) já estão na CARGAS GERAL.
        if (cdExtra.length || txt(r[13])) base.obs = 'CD junto na carga (contado pela CARGAS GERAL)';
        if (registrar(base, destinos, { FLV: qF })) n++;
      }
      resumoAbas.push({ aba: abaFlv, viagens: n, ignoradas: 0, papel: 'Volume FLV (só a coluna FLV)' });
    }

    entregas.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : a.viagem - b.viagem);
    alertas.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
    return { entregas, alertas, codigos, resumoAbas, abas: { abaGeral, abaCp2, abaCp2Ant, abaFlv, abaApoio } };
  }

  const api = { processar, splitDestinos, splitQtd, normDestino, nomeDestino, tipoDestino, ehTerceiro, distribuir, excelDate, excelTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Expedicao = api;
})(typeof window !== 'undefined' ? window : this);
