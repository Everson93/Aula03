/**
 * A frota de transporte: conjunto cavalo + carreta, fixo x variavel.
 *
 * Pedido do usuario: ver "so o que a frota de abastecimento gasta", com a
 * carreta vinculada ao seu cavalinho. O que se prova aqui e o que torna esse
 * numero confiavel ou mentiroso:
 *
 *  - o KM do conjunto e o do CAVALO. Carreta nao tem odometro; somar a carreta
 *    contaria o mesmo percurso duas vezes e derrubaria o R$/km pela metade;
 *  - fixo + variavel = total, e o IMOBILIZADO (Oficina Ativo, Plotagem, Carro
 *    Novo) fica FORA do custo, igual ao TOTAL do Resumo. Duas regras que, se
 *    divergirem, dao dois custos diferentes para o mesmo mes;
 *  - vinculo torto nao e corrigido nem escondido: sai na lista de pendencia.
 */
const fs = require('fs');
const vm = require('vm');
const arquivo = 'Codigo.gs';

const abas = {};
function novaAba(nome, cabecalho, linhas) {
  const dados = [cabecalho.slice()].concat((linhas || []).map(l => l.slice()));
  const aba = {
    nome: nome,
    dados: dados,
    maxCols: Math.max(cabecalho.length, 30),
    getName: () => nome,
    getLastRow: function () {
      let ultima = 0;
      aba.dados.forEach(function (l, i) {
        if (l.some(function (v) { return v !== '' && v !== null && v !== undefined; })) ultima = i + 1;
      });
      return ultima;
    },
    getMaxRows: function () { return Math.max(aba.dados.length, 100); },
    getMaxColumns: function () { return aba.maxCols; },
    getLastColumn: function () { return aba.maxCols; },
    insertRowsAfter: function (depois, quantas) {
      for (let i = 0; i < quantas; i++) aba.dados.push(new Array(aba.maxCols).fill(''));
    },
    insertColumnsAfter: function () {},
    setFrozenRows: function () {}, setFrozenColumns: function () {},
    setRowHeight: function () {}, setColumnWidth: function () {},
    getDataRange: function () { return aba.getRange(1, 1, aba.getMaxRows(), aba.maxCols); },
    getRange: function (linha, coluna, nL, nC) {
      nL = nL || 1; nC = nC || 1;
      if (linha + nL - 1 > aba.getMaxRows()) {
        throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      }
      if (coluna + nC - 1 > aba.maxCols) {
        throw new Error('The number of columns in the range must be at least 1');
      }
      const r = {
        getValues: function () {
          const saida = [];
          for (let i = 0; i < nL; i++) {
            const l = aba.dados[linha - 1 + i] || new Array(aba.maxCols).fill('');
            saida.push(l.slice(coluna - 1, coluna - 1 + nC));
          }
          return saida;
        },
        getValue: function () { return r.getValues()[0][0]; },
        getDisplayValues: function () {
          return r.getValues().map(function (l) {
            return l.map(function (v) {
              if (v instanceof Date) {
                const z = n => ('0' + n).slice(-2);
                return z(v.getDate()) + '/' + z(v.getMonth() + 1) + '/' + v.getFullYear();
              }
              return v === null || v === undefined ? '' : String(v);
            });
          });
        },
        setValues: function (vals) {
          vals.forEach(function (l, i) {
            const alvo = linha - 1 + i;
            while (aba.dados.length <= alvo) aba.dados.push(new Array(aba.maxCols).fill(''));
            l.forEach(function (v, j) { aba.dados[alvo][coluna - 1 + j] = v; });
          });
          return r;
        },
        setValue: function (v) { return r.setValues([[v]]); },
        clearContent: function () {
          for (let i = 0; i < nL; i++) {
            const alvo = linha - 1 + i;
            if (!aba.dados[alvo]) continue;
            for (let j = 0; j < nC; j++) aba.dados[alvo][coluna - 1 + j] = '';
          }
          return r;
        },
        setNumberFormat: () => r, setNumberFormats: () => r,
        setHorizontalAlignment: () => r, setHorizontalAlignments: () => r,
        setFontWeight: () => r, setFontSize: () => r, setFontColor: () => r,
        setBackground: () => r, setWrap: () => r, setFontStyle: () => r,
        merge: () => r, insertCheckboxes: () => r, setDataValidation: () => r,
        getDataValidation: function () { return null; },
        /**
         * Ctrl+Seta de verdade, que é o que o Sheets faz:
         *  - partindo de célula VAZIA, pula para a primeira com conteúdo;
         *  - partindo de célula CHEIA, vai para a ÚLTIMA do bloco contíguo —
         *    ou seja, subindo, para o TOPO do bloco.
         * O dublê antigo devolvia sempre a última linha com dado, e com isso
         * escondia exatamente o defeito que se procura aqui.
         */
        getNextDataCell: function (direcao) {
          const cheia = function (l) {
            const v = (aba.dados[l - 1] || [])[coluna - 1];
            return v !== '' && v !== null && v !== undefined;
          };
          const passo = direcao === 'UP' ? -1 : 1;
          const limite = direcao === 'UP' ? 1 : aba.getMaxRows();
          let l = linha;
          if (!cheia(l)) {
            while (l !== limite && !cheia(l + passo)) l += passo;
            if (cheia(l + passo)) l += passo;
          } else {
            while (l !== limite && cheia(l + passo)) l += passo;
          }
          return aba.getRange(l, coluna, 1, 1);
        },
        getRow: function () { return linha; },
        offset: function (dl, dc, nl, nc) { return aba.getRange(linha + dl, coluna + dc, nl || nL, nc || nC); },
      };
      return r;
    },
    deleteRow: function (n) { aba.dados.splice(n - 1, 1); },
  };
  abas[nome] = aba;
  return aba;
}

const COL_VEIC_CAVALO = 15;
const ctx = {
  console: console,
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => planilha,
    flush: () => {},
    Direction: { UP: 'UP', DOWN: 'DOWN', NEXT: 'NEXT', PREVIOUS: 'PREVIOUS' },
    DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST' },
    newDataValidation: () => ({ requireValueInList: function () { return this; },
      setAllowInvalid: function () { return this; }, build: function () { return {}; } }),
  },
  Utilities: {
    getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    formatDate: function (d, _tz, padrao) {
      const z = n => ('0' + n).slice(-2);
      if (padrao === 'yyyy-MM-dd') return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
      if (padrao === 'yyyyMMdd') return '' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate());
      if (padrao === 'yyyy-MM') return d.getFullYear() + '-' + z(d.getMonth() + 1);
      return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear();
    },
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, removeAll: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'operador@giassi.com.br' }),
             getEffectiveUser: () => ({ getEmail: () => 'operador@giassi.com.br' }) },
};
const planilha = {
  getSheetByName: (n) => abas[n] || null,
  getSheets: () => Object.keys(abas).map(k => abas[k]),
  insertSheet: (n) => novaAba(n, []),
  getId: () => 'planilha-fake',
  getSpreadsheetTimeZone: () => 'America/Sao_Paulo',
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(arquivo, 'utf8') + `
  Object.assign(globalThis, { salvarLancamento_, ABAS, COL_LANC, L_, COL_VEIC, COL_CENTRO,
    conjuntosDaFrota_, classeDeCustoDoTipo_, relatorioFrotaTransporte_, webSalvarVeiculo,
    resolverCavaloDaCarreta_, TOTAL_COL_VEIC, ehCategoriaCarreta_, ehCategoriaCavalo_,
    ehCategoriaTransporte_, kmRodadoPorPlaca_, CATALOGO_RELATORIOS, TIPOS_NUMERICOS_RELATORIO_ });
  autorizarContextoWeb_ = function () {};
  exigirExecucaoOperacional_ = function () {};
  exigirExecucaoLeitura_ = function () {};
  exigirExecucaoMutacao_ = function () {};
  registrarLog_ = function (acao, detalhe) { __log.push(acao + ': ' + detalhe); };
  atualizarResumoSeguro_ = function () {};
  invalidarCacheInicio_ = function () {};
  emailContextoAtual_ = function () { return 'operador@giassi.com.br'; };
  execucaoTemPlanilhaAtiva_ = function () { return true; };
`, ctx);

// ---- a planilha como ela é depois do Instalar
// Datas criadas DENTRO do vm: `lerCargasBomba_` e outros usam `instanceof
// Date`, que não atravessa realm. No Apps Script há um realm só, então isso é
// limitação do dublê — mas se o dublê não respeitar, a prova mente.
const d = vm.runInContext('(function (a, m, dd) { return new Date(a, m - 1, dd, 12, 0, 0, 0); })', ctx);
novaAba('Parâmetros', ['Parâmetro', 'Valor', 'Descrição'], [
  [], [], [],
  ['EMPRESA', 'Giassi', ''], ['MES_REFERENCIA', '2026-11', ''],
  ['DIA_FIM_PERIODO', 25, ''], ['DIA_INICIO_PERIODO', 26, ''],
]);
novaAba('Centros de Custo', ['Centro de Custo', '% Rateio Depósito', 'Recebe Rateio', 'Combustível'], [
  ['DEPOSITO', 0.5, 'SIM', 'SIM'],
  ['LOJA 05', 0.5, 'SIM', 'NAO'],
]);
const veic = (placa, centro, categoria, cavalo) => {
  const v = new Array(15).fill('');
  v[0] = placa; v[1] = 'Veiculo ' + placa; v[2] = categoria || 'Truck Normal'; v[3] = centro;
  v[4] = ''; v[5] = 1200; v[10] = 'SIM'; v[12] = 2400; v[13] = 'Diesel';
  v[COL_VEIC_CAVALO - 1] = cavalo || '';
  return v;
};
novaAba('Veículos', ['Placa / ID', 'Descrição', 'Categoria', 'Centro de Custo', 'Código Patrimônio',
  'Depreciação Mensal', 'Emplacamento (não usado)', 'Seguro', 'Bônus', 'Preço Comb. Próprio',
  'Ativo', 'Aba de Origem', 'IPVA Anual', 'Combustível', 'Cavalo do Conjunto'], [
  veic('CAV 0001', 'DEPOSITO', 'Cavalo Mecanico'),
  veic('CAR 0001', 'DEPOSITO', 'Carreta Normal', 'CAV 0001'),
  veic('CAR 0002', 'DEPOSITO', 'Carreta Frigorifica', 'CAV 0001'),
  veic('CAV 0002', 'DEPOSITO', 'Cavalo Mecanico'),
  veic('TRK 0003', 'DEPOSITO', 'Truck Normal'),
  veic('CARRO 1', 'LOJA 05', 'Carro'),
]);
novaAba('Lançamentos', ['Data', 'Placa / ID', 'Tipo / Natureza', 'Litros', 'Valor R$',
  'NF / Documento', 'Observação', 'Centro de Custo', 'Categoria', 'Período',
  'ID', 'Natureza Oficina', 'Detalhe', 'Fornecedor', 'Tipo Abastecimento'], []);
novaAba('Odômetro', ['Data', 'Placa / ID', 'KM / Horímetro'], [
  [d(2026, 11, 2), 'AAA 0001', 100000],
  [d(2026, 11, 6), 'AAA 0001', 101600],
  [d(2026, 11, 10), 'AAA 0001', 103200],
]);
novaAba('Carga na Bomba', ['Data', 'NF / Documento', 'Produto', 'Quantidade (L)',
  'Valor Total R$', 'R$ / Litro', 'Observação'], [
  [d(2026, 11, 1), 'NF 500', 'DIESEL S10', 5000, 30000, 6, ''],
]);
novaAba('Fornecedores', ['Nome', 'Ramo', 'Ativo'], [['POSTO X', 'Posto', 'SIM']]);
novaAba('Conferência', ['Data', 'Origem', 'Placa', 'Problema', 'Detalhe', 'Situação', 'Observação'], []);
novaAba('Log', ['Quando', 'Quem', 'Ação', 'Detalhe'], []);

ctx.__log = [];
let provas = 0, falhas = 0;
function ok(nome, cond, detalhe) {
  provas++;
  if (cond) { console.log('  ok   ' + nome); return; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
}

function gravar(dados) {
  try { return ctx.salvarLancamento_(dados); }
  catch (e) { return { ok: false, excecao: true, mensagem: e.message + ' | ' + (e.stack || '').split('\n')[1] }; }
}
function linhasGravadas() {
  return abas['Lançamentos'].dados.slice(1).filter(function (l) { return l[1]; });
}
/**
 * Célula de uma linha gravada, sem estourar quando a linha não existe.
 *
 * Indexar direto (`linhasGravadas()[1][4]`) MATA a suíte quando o defeito é
 * justamente "gravou menos linhas" — e suíte morta não produz FALHA nenhuma,
 * o que lido de longe parece aprovação.
 */
function cel(i, k) {
  const l = linhasGravadas()[i];
  return l ? l[k] : undefined;
}


function lanc(placa, tipo, dia, valor, litros, km, extra) {
  const dados = {
    placa: placa, tipo: tipo, data: '2026-11-' + ('0' + dia).slice(-2),
    valor: valor, litros: litros || '', km: km || '', documento: 'NF ' + dia + tipo,
    confirmarKmAlto: true, forcarKm: true, permitirDuplicado: true,
  };
  Object.keys(extra || {}).forEach(function (k) { dados[k] = extra[k]; });
  const r = ctx.salvarLancamento_(dados);
  if (!r.ok) console.log('      (lançamento recusado: ' + r.mensagem + ')');
  return r;
}

console.log('\n1. Quem é carreta, quem é cavalo, quem é da frota');
ok('carreta é reconhecida pelo nome da categoria',
  ctx.ehCategoriaCarreta_('Carreta Frigorifica') && ctx.ehCategoriaCarreta_('CARRETA GRANELEIRA') &&
  !ctx.ehCategoriaCarreta_('Truck Normal'),
  'categoria é campo livre: lista fixa deixaria a categoria nova fora em silêncio');
ok('cavalo também', ctx.ehCategoriaCavalo_('Cavalo Mecanico') && !ctx.ehCategoriaCavalo_('Carro'));
ok('a frota de transporte é cavalo + carreta + truck',
  ctx.ehCategoriaTransporte_('Cavalo Mecanico') && ctx.ehCategoriaTransporte_('Carreta Normal') &&
  ctx.ehCategoriaTransporte_('Truck Frigorifico') && !ctx.ehCategoriaTransporte_('Carro') &&
  !ctx.ehCategoriaTransporte_('Moto'));

console.log('\n2. O conjunto sai do cadastro');
(function () {
  const c = ctx.conjuntosDaFrota_();
  const cav = c.cavalos.filter(function (v) { return v.placa === 'CAV 0001'; })[0];
  ok('o cavalo recebe as duas carretas que apontam para ele',
    cav && cav.carretas.map(function (x) { return x.placa; }).sort().join(',') === 'CAR 0001,CAR 0002',
    JSON.stringify(cav && cav.carretas.map(function (x) { return x.placa; })));
  ok('e a carreta sabe o seu cavalo',
    (function () {
      const chave = Object.keys(c.porPlaca).filter(function (k) { return /CAR.?0001/.test(k); })[0];
      const carreta = c.porPlaca[chave];
      return carreta && carreta.cavalo && carreta.cavalo.placa === 'CAV 0001';
    })(), JSON.stringify(Object.keys(c.porPlaca)));
  ok('cavalo sem carreta aparece como pendência',
    c.cavalosSemCarreta.map(function (v) { return v.placa; }).join(',') === 'CAV 0002',
    JSON.stringify(c.cavalosSemCarreta.map(function (v) { return v.placa; })));
  ok('e nenhum vínculo torto neste cadastro', c.avisos.length === 0, JSON.stringify(c.avisos));
})();

console.log('\n3. O cadastro recusa o vínculo que mentiria');
(function () {
  const r1 = ctx.resolverCavaloDaCarreta_('CAV 0001', 'TRK 0003', 'Truck Normal');
  ok('truck não tem cavalo vinculado', r1.ok === false && /Só carreta/.test(r1.mensagem), r1.mensagem);
  const r2 = ctx.resolverCavaloDaCarreta_('CAR 0001', 'CAR 0001', 'Carreta Normal');
  ok('carreta não é o próprio cavalo',
    r2.ok === false && /próprio cavalo/.test(r2.mensagem), r2.mensagem);
  const r3 = ctx.resolverCavaloDaCarreta_('CAR 0002', 'CAR 0001', 'Carreta Normal');
  ok('carreta não puxa carreta',
    r3.ok === false && /é uma carreta/.test(r3.mensagem), r3.mensagem);
  const r4 = ctx.resolverCavaloDaCarreta_('ZZZ 9999', 'CAR 0001', 'Carreta Normal');
  ok('cavalo que não existe é recusado com a placa',
    r4.ok === false && /ZZZ *9999/.test(r4.mensagem) && /não está cadastrado/.test(r4.mensagem),
    r4.mensagem);
  const r5 = ctx.resolverCavaloDaCarreta_('CAV 0001', 'CAR 0001', 'Carreta Normal');
  ok('o vínculo certo passa e devolve a placa do cadastro',
    r5.ok === true && r5.placa === 'CAV 0001' && !r5.aviso, JSON.stringify(r5));
  const r6 = ctx.resolverCavaloDaCarreta_('TRK 0003', 'CAR 0001', 'Carreta Normal');
  ok('truck como cavalo passa COM AVISO, não travado',
    r6.ok === true && /reclassifique/.test(String(r6.aviso)),
    JSON.stringify(r6) + ' — travar aqui impediria o cadastro de quem ainda não ' +
    'reclassificou os cavalinhos');
})();

console.log('\n4. Fixo, variável e imobilizado vêm do Resumo');
(function () {
  const esperado = {
    'Combustivel Proprio': 'variavel', 'Combustivel Terceiros': 'variavel',
    'Arla 32': 'variavel', 'Pneus': 'variavel', 'Oficina Despesa': 'variavel',
    'Diaria/Pedagio': 'variavel', 'Lavacao/Graxa': 'variavel', 'Lubrificante': 'variavel',
    'Depreciação': 'fixo', 'IPVA': 'fixo', 'Emplacamento/IPVA/Seguro': 'fixo', 'Multa': 'fixo',
    'Oficina Ativo': 'imobilizado', 'Plotagem': 'imobilizado', 'Carro Novo': 'imobilizado',
  };
  const erradas = Object.keys(esperado).filter(function (t) {
    return ctx.classeDeCustoDoTipo_(t) !== esperado[t];
  });
  ok('cada tipo cai na classe certa', erradas.length === 0,
    erradas.map(function (t) {
      return t + ': ' + ctx.classeDeCustoDoTipo_(t) + ' (esperado ' + esperado[t] + ')';
    }).join(' | '));
  ok('tipo fora das colunas de custo devolve null, não "fixo"',
    ctx.classeDeCustoDoTipo_('Coisa Que Nao Existe') === null,
    'chutar uma classe para tipo desconhecido somaria no custo algo que o Resumo ignora');
})();

console.log('\n5. O painel da frota');
(function () {
  // Odômetro do cavalo: 2 leituras no período -> 2.000 km.
  const odo = abas['Odômetro'];
  odo.dados.push([d(2026, 11, 5), 'CAV 0001', 500000]);
  odo.dados.push([d(2026, 11, 20), 'CAV 0001', 502000]);
  // Leitura de odômetro numa CARRETA: acontece (alguém digita a placa errada,
  // ou a carreta tem hubodômetro). O painel não pode somar isso ao km do
  // cavalo — seria o mesmo percurso contado duas vezes.
  odo.dados.push([d(2026, 11, 5), 'CAR 0001', 100]);
  odo.dados.push([d(2026, 11, 20), 'CAR 0001', 1100]);
  lanc('CAV 0001', 'Combustivel Terceiros', 6, 6000, 1000);
  // Um custo FIXO de verdade (depreciação só é liberada no último dia do
  // período, e o painel não pode depender da data em que a suíte roda).
  lanc('CAV 0001', 'Emplacamento/IPVA/Seguro', 12, 1200);
  lanc('CAR 0001', 'Pneus', 7, 4000);
  lanc('CAR 0001', 'Oficina Ativo', 8, 9000,
    '', '', { naturezaOficina: 'Peça de reposição', detalheOficina: 'Baú novo' });
  lanc('TRK 0003', 'Combustivel Terceiros', 9, 1000, 160);
  lanc('CARRO 1', 'Pneus', 10, 800);

  const rel = ctx.relatorioFrotaTransporte_(null, null, null, null);
  const porClasse = {};
  rel.linhas.forEach(function (l) { porClasse[String(l[0]).split(' ')[0]] = l[1]; });
  ok('variável soma combustível + pneus da frota', porClasse['Variável'] === 11000,
    JSON.stringify(rel.linhas));
  ok('o carro de loja NÃO entra na frota de transporte', porClasse['Variável'] !== 11800,
    'R$ 800 de pneu de carro no custo da frota de transporte é o erro que o painel existe para evitar');
  ok('fixo + variável = total',
    Math.abs(rel.totais[1] - (porClasse['Variável'] + porClasse['Fixo'])) < 0.005,
    JSON.stringify(rel.totais));
  ok('imobilizado (Oficina Ativo) fica FORA do total',
    rel.totais[1] === 11000 + porClasse['Fixo'] && porClasse['Fixo'] > 0,
    'R$ 9.000 de Oficina Ativo no custo faria o painel discordar do TOTAL do Resumo: ' +
    JSON.stringify(rel.totais));

  const bIndic = rel.blocos.filter(function (b) { return /Indicadores/.test(b.titulo); })[0];
  const indic = {};
  bIndic.linhas.forEach(function (l) { indic[l[0]] = l[1]; });
  ok('o indicador de KM usa as leituras do odômetro, sem o km da carreta',
    indic['KM rodado'] === '2.000 km', JSON.stringify(indic) +
    ' — a carreta tem 1.000 km lançados e não pode entrar no km da frota');
  ok('e a média de consumo sai em pt-BR, com vírgula',
    /,/.test(String(indic['Média de consumo'])), JSON.stringify(indic['Média de consumo']));
  ok('o imobilizado aparece à parte, para ninguém achar que faltou dinheiro',
    /9\.000,00/.test(String(indic['Imobilizado no período (fora do custo)'])),
    JSON.stringify(indic));

  const bConj = rel.blocos.filter(function (b) { return /Conjuntos/.test(b.titulo); })[0];
  const conj1 = bConj.linhas.filter(function (l) { return l[0] === 'CAV 0001'; })[0];
  ok('o conjunto lista as duas carretas', /CAR 0001/.test(conj1[1]) && /CAR 0002/.test(conj1[1]),
    JSON.stringify(conj1));
  ok('o custo do conjunto soma cavalo + carretas', conj1[8] === conj1[6] + conj1[7],
    JSON.stringify(conj1));
  ok('o KM do conjunto é o do cavalo, sem dobrar com a carreta', conj1[3] === 2000,
    JSON.stringify(conj1) + ' — a carreta tem 1.000 km de leitura na base; somá-los ' +
    'contaria o mesmo percurso duas vezes');
  ok('e o R$/km do conjunto usa esse KM',
    Math.abs(conj1[9] - conj1[8] / 2000) < 0.0001, JSON.stringify(conj1));

  const bVeic = rel.blocos.filter(function (b) { return /Por veículo/.test(b.titulo); })[0];
  const daCarreta = bVeic.linhas.filter(function (l) { return l[0] === 'CAR 0001'; })[0];
  ok('mas a leitura da carreta continua VISÍVEL por veículo', daCarreta[4] === 1000,
    JSON.stringify(daCarreta) + ' — tirar da soma é uma decisão; esconder o dado é outra');
  ok('a carreta aparece dizendo de quem ela é', /carreta de CAV 0001/.test(String(daCarreta[2])),
    JSON.stringify(daCarreta));
  ok('e o Oficina Ativo da carreta não entrou no total dela', daCarreta[9] === 4000,
    JSON.stringify(daCarreta));

  const bPend = rel.blocos.filter(function (b) { return /Cadastro do conjunto/.test(b.titulo); })[0];
  ok('cavalo sem carreta é cobrado na lista de pendência',
    bPend.linhas.some(function (l) { return l[0] === 'CAV 0002'; }), JSON.stringify(bPend.linhas));
})();

console.log('\n6. Vínculo torto aparece, não é escondido');
(function () {
  const v = abas['Veículos'];
  // Uma carreta apontando placa que nao existe: o caso de quem digitou errado.
  v.dados.push((function () {
    const l = new Array(15).fill('');
    l[0] = 'CAR 0009'; l[2] = 'Carreta Normal'; l[3] = 'DEPOSITO'; l[10] = 'SIM';
    l[COL_VEIC_CAVALO - 1] = 'ZZZ 9999';
    return l;
  })());
  vm.runInContext('VEICULOS_EXEC_CACHE_ = null;', ctx);
  const c = ctx.conjuntosDaFrota_();
  ok('o vínculo inválido vira aviso com placa e motivo',
    c.avisos.some(function (a) {
      return a.placa === 'CAR 0009' && /não está no cadastro/.test(a.problema);
    }),
    JSON.stringify(c.avisos));
  const rel = ctx.relatorioFrotaTransporte_(null, null, null, null);
  const bPend = rel.blocos.filter(function (b) { return /Cadastro do conjunto/.test(b.titulo); })[0];
  ok('e o relatório imprime o MOTIVO, não só a placa',
    bPend.linhas.some(function (l) {
      return l[0] === 'CAR 0009' && /ZZZ *9999/.test(String(l[2]));
    }),
    JSON.stringify(bPend.linhas) + ' — "sem cavalo" e "aponta uma placa que não existe" ' +
    'pedem providências diferentes');
  v.dados.pop();
  vm.runInContext('VEICULOS_EXEC_CACHE_ = null;', ctx);
})();

console.log('\n7. O cadastro grava, mantém e DESFAZ o vínculo');
(function () {
  function salvar(dados) { return ctx.webSalvarVeiculo('T', dados); }
  function cavaloNaAba(placa) {
    const l = abas['Veículos'].dados.filter(function (x) {
      return String(x[0]).trim() === placa;
    })[0];
    return l ? String(l[COL_VEIC_CAVALO - 1] || '') : '(placa não achada)';
  }
  const r = salvar({ placa: 'CAR 0002', categoria: 'Carreta Frigorifica', centro: 'DEPOSITO',
    cavalo: 'CAV 0002' });
  ok('troca o cavalo da carreta', r.ok === true && cavaloNaAba('CAR 0002') === 'CAV 0002',
    r.mensagem + ' | na aba: ' + cavaloNaAba('CAR 0002'));
  // Chamada SEM a chave (importador, cadastro em lote): o vinculo fica.
  const r2 = salvar({ placa: 'CAR 0002', categoria: 'Carreta Frigorifica', centro: 'DEPOSITO' });
  ok('quem não manda o campo não apaga o vínculo',
    r2.ok === true && cavaloNaAba('CAR 0002') === 'CAV 0002',
    r2.mensagem + ' | na aba: ' + cavaloNaAba('CAR 0002'));
  // A tela manda a chave VAZIA quando a pessoa apagou a placa: tem de desfazer.
  const r3 = salvar({ placa: 'CAR 0002', categoria: 'Carreta Frigorifica', centro: 'DEPOSITO',
    cavalo: '' });
  ok('e campo apagado na tela DESFAZ o vínculo',
    r3.ok === true && cavaloNaAba('CAR 0002') === '',
    r3.mensagem + ' | na aba: ' + cavaloNaAba('CAR 0002') +
    ' — sem isto, um vínculo errado seria para sempre');
  const r4 = salvar({ placa: 'CAR 0002', categoria: 'Carreta Frigorifica', centro: 'DEPOSITO',
    cavalo: 'CAV 0001' });
  ok('e volta a vincular', r4.ok === true && cavaloNaAba('CAR 0002') === 'CAV 0001', r4.mensagem);
})();

console.log('\n8. Regras estáticas');
const fonte = fs.readFileSync('Codigo.gs', 'utf8');
(function () {
  ok('o relatório está no catálogo e no switch',
    !!ctx.CATALOGO_RELATORIOS['Frota de transporte (fixo x variável)'] &&
    fonte.indexOf("case 'Frota de transporte (fixo x variável)':") !== -1);
  // Os TRES formatadores (tela, PDF, planilha) leem a mesma lista de tipos
  // numericos. Um tipo novo aqui sairia como numero cru no PDF — ponto decimal
  // em pt-BR, que se le como milhar.
  const trecho = fonte.slice(fonte.indexOf('function relatorioFrotaTransporte_'),
    fonte.indexOf('function relatorioDieselPeriodo_'));
  const tipos = {};
  (trecho.match(/col_\([^)]*\)/g) || []).forEach(function (m) {
    const t = /,\s*'([a-z0-9]+)'\s*\)/.exec(m);
    tipos[t ? t[1] : 'texto'] = true;
  });
  const desconhecidos = Object.keys(tipos).filter(function (t) {
    return t !== 'texto' && ctx.TIPOS_NUMERICOS_RELATORIO_.indexOf(t) === -1;
  });
  ok('todo tipo de coluna do painel é conhecido pelos três formatadores',
    desconhecidos.length === 0, desconhecidos.join(', '));
  ok('o KM por placa tem um dono só',
    (fonte.match(/function kmRodadoPorPlaca_/g) || []).length === 1 &&
    (fonte.match(/kmRodadoPorPlaca_\(/g) || []).length >= 3,
    'o Resumo e o painel precisam do MESMO km: duas contas dariam dois R$/km do mesmo mês');
  ok('a coluna nova é lida com Math.min(getMaxColumns), como manda o projeto',
    /Math\.min\(TOTAL_COL_VEIC, sheet\.getMaxColumns\(\)\)/.test(fonte),
    'pedir a coluna 15 numa planilha que não rodou o Instalar LANÇA, e o cadastro para de abrir');
  const tela = fs.readFileSync('App.html', 'utf8');
  ok('a tela tem o campo do cavalo e manda no cadastro',
    tela.indexOf('id="vCavalo"') !== -1 && /cavalo: el\('vCavalo'\)/.test(tela),
    'campo que a tela não manda é campo que não existe para o usuário');
  ok('e ele nasce escondido, só aparecendo em carreta',
    /id="linhaCavalo" style="display:none"/.test(tela) &&
    tela.indexOf('function ajustarCampoCavalo') !== -1);
  ok('o servidor devolve o vínculo ao abrir a edição',
    /cavalo: String\(l\[COL_VEIC\.CAVALO - 1\]/.test(fonte),
    'sem devolver, a tela abriria o campo vazio e a pessoa veria o vínculo como inexistente');
})();

if (falhas) {
  console.log('\n' + falhas + ' FALHA(S) de ' + provas);
  process.exit(1);
}
console.log('\nTUDO OK: ' + provas + ' provas');
