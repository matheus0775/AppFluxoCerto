'use strict';

/* ═══════════════════════════════════════
   CATEGORIAS PADRÃO
═══════════════════════════════════════ */
let CATS_RECEITA = [
  { v:'💼 Salário', builtin:true },
  { v:'📈 Investimentos', builtin:true },
  { v:'🚜 Venda Colheita', builtin:true },
  { v:'🐄 Gado', builtin:true },
  { v:'🎁 Outros', builtin:true },
];
let CATS_DESPESA = [
  { v:'🏠 Moradia', builtin:true },
  { v:'🛒 Alimentação', builtin:true },
  { v:'🚗 Combustível', builtin:true },
  { v:'⚡ Contas', builtin:true },
  { v:'👷 Funcionários', builtin:true },
  { v:'🔧 Manutenção', builtin:true },
  { v:'🌾 Insumos', builtin:true },
  { v:'🚜 Máquinas', builtin:true },
  { v:'🏥 Saúde', builtin:true },
  { v:'📚 Educação', builtin:true },
  { v:'🎮 Lazer', builtin:true },
  { v:'➖ Outros', builtin:true },
];

/* ═══════════════════════════════════════
   INDEXEDDB
═══════════════════════════════════════ */
const DB_N = 'fluxocerto-pro';
const DB_V = 2;
let db = null;

function abrirDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_N, DB_V);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('movs')) {
        const s = d.createObjectStore('movs', { keyPath: 'id' });
        s.createIndex('data', 'data', { unique: false });
      }
      if (!d.objectStoreNames.contains('metas'))
        d.createObjectStore('metas', { keyPath: 'categoria' });
      if (!d.objectStoreNames.contains('recorrentes'))
        d.createObjectStore('recorrentes', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('config'))
        d.createObjectStore('config', { keyPath: 'chave' });
      if (!d.objectStoreNames.contains('categorias'))
        d.createObjectStore('categorias', { keyPath: 'id' });
    };
    r.onsuccess = e => { db = e.target.result; res(db); };
    r.onerror = e => rej(e.target.error);
  });
}

function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    if (r) { r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e.target.error); }
    else { t.oncomplete = () => res(); t.onerror = e => rej(e.target.error); }
  });
}

const DB = {
  getMOVS: () => tx('movs','readonly',s=>s.getAll()),
  putMOV: m => tx('movs','readwrite',s=>s.put(m)),
  delMOV: id => tx('movs','readwrite',s=>s.delete(id)),
  getMETAS: () => tx('metas','readonly',s=>s.getAll()),
  putMETA: m => tx('metas','readwrite',s=>s.put(m)),
  delMETA: c => tx('metas','readwrite',s=>s.delete(c)),
  getRECS: () => tx('recorrentes','readonly',s=>s.getAll()),
  putREC: r => tx('recorrentes','readwrite',s=>s.put(r)),
  delREC: id => tx('recorrentes','readwrite',s=>s.delete(id)),
  getCATS: () => tx('categorias','readonly',s=>s.getAll()),
  putCAT: c => tx('categorias','readwrite',s=>s.put(c)),
  delCAT: id => tx('categorias','readwrite',s=>s.delete(id)),
};

/* ═══════════════════════════════════════
   ESTADO
═══════════════════════════════════════ */
let movs=[], metas=[], recs=[], customCats=[];
let filtroTipo='todos';
let modoEd=null, modoEdMeta=null;
let tipoMov='receita', subtipoMov='variavel';
let tipoRec='receita', tipoCatNova='receita';
let chartPrincipal=null, chartFixas=null, tipoChart='rosca';
let notifAberta=false;

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
const brl = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
const fData = s => { if(!s) return ''; const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; };
const soma = (arr,tipo) => arr.filter(m=>m.tipo===tipo).reduce((s,m)=>s+m.valor,0);
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const getMes = () => document.getElementById('filtro-mes').value;

function toast(msg) {
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = t.style.transform.replace('translateY(16px)','translateY(0)').replace('translateY(4px)','translateY(0)');
  t.classList.remove('translate-y-4','opacity-0');
  t.classList.add('translate-y-0','opacity-100');
  setTimeout(()=>{ t.classList.remove('translate-y-0','opacity-100'); t.classList.add('translate-y-4','opacity-0'); },2800);
}

function getAllCats(tipo) {
  const base = tipo === 'receita' ? CATS_RECEITA : CATS_DESPESA;
  const custom = customCats.filter(c => c.tipo === tipo);
  return [...base, ...custom.map(c => ({ v: `${c.emoji} ${c.nome}`, builtin: false, id: c.id }))];
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
async function init() {
  try {
    await abrirDB();
    movs = await DB.getMOVS();
    metas = await DB.getMETAS();
    recs = await DB.getRECS();
    try { customCats = await DB.getCATS(); } catch(e) { console.warn('Store categorias não existe ainda, será criada no próximo upgrade.', e); customCats = []; }
    preencherMes();
    preencherCatSelects();
    document.getElementById('f-data').valueAsDate = new Date();
    inicializarCharts();
    renderTudo();
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('./sw.js').then(r=>console.log('[SW] ok',r.scope)).catch(e=>console.warn('[SW] erro',e));
  } catch(err) {
    console.error('[FluxoCerto] Erro no init:', err);
  }
}
document.addEventListener('DOMContentLoaded', init);

/* ═══════════════════════════════════════
   FILTROS
═══════════════════════════════════════ */
function preencherMes() {
  const s = document.getElementById('filtro-mes');
  const h = new Date();
  for (let i=0; i<13; i++) {
    const d = new Date(h.getFullYear(), h.getMonth()-i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const l = d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    s.appendChild(new Option(l[0].toUpperCase()+l.slice(1), v));
  }
  s.addEventListener('change', renderTudo);
}

function setFiltroTipo(t) {
  filtroTipo = t;
  document.getElementById('btn-ft-todos').className = `px-4 py-1.5 rounded-full font-bold text-xs transition-colors whitespace-nowrap ${t==='todos'?'bg-primary text-on-primary':'text-on-surface-variant'}`;
  document.getElementById('btn-ft-rec').className = `px-4 py-1.5 rounded-full font-bold text-xs transition-colors whitespace-nowrap ${t==='receita'?'bg-primary text-on-primary':'text-on-surface-variant'}`;
  document.getElementById('btn-ft-desp').className = `px-4 py-1.5 rounded-full font-bold text-xs transition-colors whitespace-nowrap ${t==='despesa'?'bg-error text-white':'text-on-surface-variant'}`;
  renderLista(filtrarDoMes());
}

function filtrarDoMes() {
  const mes = getMes();
  return movs.filter(m => m.data && m.data.startsWith(mes));
}

/* ═══════════════════════════════════════
   RENDER TUDO
═══════════════════════════════════════ */
function renderTudo() {
  const doMes = filtrarDoMes();
  const totR = soma(doMes,'receita');
  const totD = soma(doMes,'despesa');
  const saldo = totR - totD;

  document.getElementById('c-rec').textContent = brl(totR);
  document.getElementById('c-desp').textContent = brl(totD);
  document.getElementById('c-saldo').textContent = brl(Math.abs(saldo));

  // Saldo card style
  const sc = document.getElementById('c-saldo-container');
  const sv = document.getElementById('c-saldo');
  if (saldo > 0) { sc.className="bg-primary/5 p-6 rounded-[2rem] border border-primary/20 relative overflow-hidden group"; sv.className="text-3xl md:text-4xl font-headline font-black text-primary-fixed tracking-tighter truncate"; }
  else if (saldo < 0) { sc.className="bg-error/5 p-6 rounded-[2rem] border border-error/20 relative overflow-hidden group"; sv.className="text-3xl md:text-4xl font-headline font-black text-error tracking-tighter truncate"; }
  else { sc.className="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/10 relative overflow-hidden group"; sv.className="text-3xl md:text-4xl font-headline font-black text-on-surface tracking-tighter truncate"; }

  // Mensagem saldo
  const msgEl = document.getElementById('c-msg');
  if (!doMes.length) { msgEl.textContent='—'; msgEl.className='text-xs font-bold px-2 py-0.5 rounded-full mt-2 inline-block text-on-surface-variant'; }
  else if (saldo > 0) { msgEl.textContent=`✨ Sobra ${brl(saldo)}`; msgEl.className='text-xs font-bold px-2 py-0.5 rounded-full mt-2 inline-block bg-primary/10 text-primary'; }
  else if (saldo < 0) { msgEl.textContent=`⚠️ Falta ${brl(Math.abs(saldo))}`; msgEl.className='text-xs font-bold px-2 py-0.5 rounded-full mt-2 inline-block bg-error/10 text-error'; }
  else { msgEl.textContent='⚖️ Zerado'; msgEl.className='text-xs font-bold px-2 py-0.5 rounded-full mt-2 inline-block text-on-surface-variant'; }

  renderPrevisao(doMes, totR, totD, saldo);
  renderAlertas(doMes, totR, totD, saldo);
  renderLista(doMes);
  renderCategorias(doMes);
  renderCustomCats();
  renderMetas(doMes);
  renderRecorrentes();
  atualizarCharts(doMes);
}

/* ═══════════════════════════════════════
   PREVISÃO
═══════════════════════════════════════ */
function renderPrevisao(doMes, totR, totD, saldo) {
  const mes = getMes();
  const [ano,m] = mes.split('-').map(Number);
  const hoje = new Date();
  const diaHoje = (hoje.getFullYear()===ano && hoje.getMonth()+1===m) ? hoje.getDate() : 31;
  let fixasPendentes = 0;
  recs.filter(r=>r.tipo==='despesa').forEach(r => {
    const ja = doMes.some(m2=>m2.tipo==='despesa' && m2.descricao.toLowerCase()===r.descricao.toLowerCase());
    if (!ja && r.dia > diaHoje) fixasPendentes += r.valor;
  });
  const saldoPrevisto = saldo - fixasPendentes;
  document.getElementById('prev-fixas').textContent = brl(fixasPendentes);
  document.getElementById('prev-saldo').textContent = brl(saldoPrevisto);
  document.getElementById('prev-saldo').className = `text-base font-bold ${saldoPrevisto>=0?'text-primary':'text-error'}`;
  const comprometido = totR > 0 ? Math.min(((totD+fixasPendentes)/totR)*100,100) : 0;
  const barra = document.getElementById('prev-barra');
  barra.style.width = comprometido+'%';
  barra.className = `h-full rounded-full transition-all duration-700 ${comprometido>=100?'bg-error':(comprometido>=80?'bg-warning':'bg-gradient-to-r from-tertiary to-primary')}`;
  const livre = totR - totD - fixasPendentes;
  document.getElementById('prev-legenda').innerHTML = fixasPendentes > 0
    ? `${comprometido.toFixed(0)}% da renda comprometida — <strong class="text-primary">${brl(Math.max(livre,0))}</strong> livre`
    : saldo > 0 ? `Nenhuma recorrente pendente — saldo positivo de ${brl(saldo)}` : 'Adicione recorrentes para calcular';
}

/* ═══════════════════════════════════════
   ALERTAS INTELIGENTES
═══════════════════════════════════════ */
function renderAlertas(doMes, totR, totD, saldo) {
  const gastos = {};
  doMes.filter(m=>m.tipo==='despesa').forEach(m=>{ const c=m.categoria||'➖ Outros'; gastos[c]=(gastos[c]||0)+m.valor; });

  const mes = getMes();
  const [ano,mm] = mes.split('-').map(Number);
  const mesAnt = `${mm===1?ano-1:ano}-${String(mm===1?12:mm-1).padStart(2,'0')}`;
  const doMesAnt = movs.filter(m=>m.data&&m.data.startsWith(mesAnt));
  const gastosAntCat = {};
  doMesAnt.filter(m=>m.tipo==='despesa').forEach(m=>{ const c=m.categoria||'➖ Outros'; gastosAntCat[c]=(gastosAntCat[c]||0)+m.valor; });

  const alertas=[], notifs=[];

  metas.forEach(meta => {
    const g = gastos[meta.categoria]||0;
    const pct = (g/meta.limite)*100;
    if (pct >= 100) {
      alertas.push({t:'error',e:'🚨',a:`Meta ultrapassada: ${meta.categoria}`,s:`Excedeu ${brl(g-meta.limite)} acima do limite`});
      notifs.push({t:'error',e:'🚨',a:'Meta ultrapassada',s:meta.categoria});
    } else if (pct >= 80) {
      alertas.push({t:'warning',e:'⚠️',a:`Atenção: ${meta.categoria}`,s:`${pct.toFixed(0)}% do limite usado`});
      notifs.push({t:'warning',e:'⚠️',a:`${pct.toFixed(0)}% da meta`,s:meta.categoria});
    }
  });

  Object.entries(gastos).forEach(([cat,val]) => {
    const ant = gastosAntCat[cat]||0;
    if (ant > 0 && val > ant*1.3) {
      alertas.push({t:'warning',e:'📈',a:`${cat} aumentou ${((val-ant)/ant*100).toFixed(0)}%`,s:`${brl(ant)} → ${brl(val)} vs mês anterior`});
    }
  });

  if (saldo < 0 && doMes.length > 0) {
    alertas.push({t:'error',e:'💔',a:'Saldo negativo!',s:`Despesas superaram receitas em ${brl(Math.abs(saldo))}`});
    notifs.push({t:'error',e:'💔',a:'Saldo negativo',s:brl(Math.abs(saldo))});
  }

  if (totR > 0 && saldo > 0 && (saldo/totR) > 0.25) {
    alertas.push({t:'success',e:'🎉',a:'Ótimo controle!',s:`Economizando ${((saldo/totR)*100).toFixed(0)}% da renda este mês`});
  }

  const wrap = document.getElementById('alertas-wrap');
  const colors = {error:'bg-error/10 border-l-4 border-error',warning:'bg-warning/10 border-l-4 border-warning',success:'bg-primary/10 border-l-4 border-primary'};
  wrap.innerHTML = alertas.map(a => `
    <div class="flex items-start gap-3 p-4 rounded-xl ${colors[a.t]} animate-[fadeIn_.3s_ease]">
      <span class="text-xl mt-0.5">${a.e}</span>
      <div><p class="font-bold text-sm text-on-surface">${a.a}</p><p class="text-xs text-on-surface-variant">${a.s}</p></div>
    </div>`).join('');

  // Badges
  const bd = document.getElementById('badge-notif-d');
  const bm = document.getElementById('badge-notif-m');
  const criticos = notifs.filter(n=>n.t==='error').length;
  bd.style.display = notifs.length?'flex':'none'; bd.textContent = notifs.length;
  bm.style.display = notifs.length?'flex':'none'; bm.textContent = notifs.length;

  // Notif body
  document.getElementById('notif-body').innerHTML = notifs.length
    ? notifs.map(n => `<div class="flex items-start gap-3 p-3 rounded-xl ${colors[n.t]} mb-2"><span class="text-lg">${n.e}</span><div><p class="font-bold text-xs">${n.a}</p><p class="text-[11px] text-on-surface-variant">${n.s}</p></div></div>`).join('')
    : '<div class="text-center py-8 text-on-surface-variant text-sm">✅ Nenhum alerta</div>';
}

/* ═══════════════════════════════════════
   LISTA DE MOVIMENTAÇÕES
═══════════════════════════════════════ */
function renderLista(doMes) {
  const filtrados = doMes.filter(m => filtroTipo==='todos'||m.tipo===filtroTipo).sort((a,b) => new Date(b.data)-new Date(a.data));
  const el = document.getElementById('lista-movs');
  if (!filtrados.length) {
    el.innerHTML = `<div class="text-center py-10 text-on-surface-variant"><span class="text-3xl block mb-2">📭</span><p class="text-sm">Nenhuma movimentação.<br>Toque no <strong>+</strong> para adicionar.</p></div>`;
    return;
  }
  el.innerHTML = filtrados.map(m => {
    const isRec = m.tipo === 'receita';
    const ico = m.categoria ? m.categoria.split(' ')[0] : (isRec?'💵':'💳');
    const tagTipo = isRec ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">Receita</span>`
      : m.subtipo==='fixa' ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-tertiary/10 text-tertiary">Fixa</span>`
      : `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-error/10 text-error">Variável</span>`;
    const color = isRec ? 'text-primary' : 'text-error';
    const sign = isRec ? '+' : '-';
    const bg = isRec ? 'bg-primary/10' : (m.subtipo==='fixa'?'bg-tertiary/10':'bg-error/10');
    return `
    <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-low hover:bg-surface-container-high transition-all group border-l-3 ${isRec?'border-l-primary':(m.subtipo==='fixa'?'border-l-tertiary':'border-l-error')} mb-2">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl ${bg} flex items-center justify-center text-lg">${ico}</div>
        <div>
          <h5 class="font-bold text-sm text-on-surface truncate max-w-[140px] md:max-w-none">${m.descricao}</h5>
          <div class="flex items-center gap-1.5 flex-wrap mt-1">${tagTipo} <span class="text-[10px] text-on-surface-variant">${fData(m.data)}</span></div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm font-black ${color} whitespace-nowrap">${sign} ${brl(m.valor)}</span>
        <div class="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button class="p-1.5 rounded-lg text-on-surface-variant hover:bg-tertiary/20 hover:text-tertiary active:scale-90" onclick="editarMov('${m.id}')"><i class="bi bi-pencil-fill text-xs"></i></button>
          <button class="p-1.5 rounded-lg text-on-surface-variant hover:bg-error/20 hover:text-error active:scale-90" onclick="excluirMov('${m.id}')"><i class="bi bi-trash3-fill text-xs"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════
   CATEGORIAS
═══════════════════════════════════════ */
function renderCategorias(doMes) {
  const gD={},gR={},qD={},qR={};
  doMes.filter(m=>m.tipo==='despesa').forEach(m=>{ const c=m.categoria||'➖ Outros'; gD[c]=(gD[c]||0)+m.valor; qD[c]=(qD[c]||0)+1; });
  doMes.filter(m=>m.tipo==='receita').forEach(m=>{ const c=m.categoria||'🎁 Outros'; gR[c]=(gR[c]||0)+m.valor; qR[c]=(qR[c]||0)+1; });
  const maxD=Math.max(...Object.values(gD),1), maxR=Math.max(...Object.values(gR),1);

  const mk = (obj,qtd,max,cor,elId) => {
    const ents = Object.entries(obj).sort((a,b)=>b[1]-a[1]);
    const el = document.getElementById(elId);
    if (!el) return;
    if (!ents.length) { el.innerHTML=`<p class="text-on-surface-variant text-sm p-4 col-span-full">Sem registros.</p>`; return; }
    el.innerHTML = ents.map(([cat,val]) => {
      const pct = (val/max)*100;
      const ico = cat.split(' ')[0];
      const nome = cat.split(' ').slice(1).join(' ')||cat;
      return `
      <div class="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 hover:bg-surface-container transition-colors">
        <div class="text-2xl mb-2">${ico}</div>
        <p class="text-xs font-bold text-on-surface-variant truncate">${nome}</p>
        <p class="text-base font-black text-on-surface mt-1 ${cor}">${brl(val)}</p>
        <p class="text-[10px] text-on-surface-variant">${qtd[cat]} lançamento${qtd[cat]>1?'s':''}</p>
        <div class="w-full h-1.5 bg-surface-container-highest rounded-full mt-2 overflow-hidden">
          <div class="h-full rounded-full ${cor==='text-error'?'bg-error':'bg-primary'}" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');
  };
  mk(gD, qD, maxD, 'text-error', 'cat-grid-desp');
  mk(gR, qR, maxR, 'text-primary', 'cat-grid-rec');
}

function renderCustomCats() {
  const el = document.getElementById('custom-cats-list');
  if (!el) return;
  if (!customCats.length) {
    el.innerHTML = '<p class="text-on-surface-variant text-sm">Nenhuma categoria customizada. Use o botão acima para criar.</p>';
    return;
  }
  el.innerHTML = customCats.map(c => `
    <div class="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
      <div class="flex items-center gap-3">
        <span class="text-xl">${c.emoji}</span>
        <div><p class="font-bold text-sm">${c.nome}</p><span class="text-[10px] text-on-surface-variant uppercase">${c.tipo}</span></div>
      </div>
      <button class="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg" onclick="excluirCategoria('${c.id}')"><i class="bi bi-trash3-fill text-sm"></i></button>
    </div>`).join('');
}

/* ═══════════════════════════════════════
   METAS
═══════════════════════════════════════ */
function renderMetas(doMes) {
  const gastos = {};
  doMes.filter(m=>m.tipo==='despesa').forEach(m=>{ const c=m.categoria||'➖ Outros'; gastos[c]=(gastos[c]||0)+m.valor; });
  const el = document.getElementById('metas-lista');
  if (!el) return;
  if (!metas.length) {
    el.innerHTML = `<div class="text-center py-10 col-span-full bg-surface-container-low rounded-3xl"><span class="text-3xl block mb-2">🎯</span><p class="text-on-surface-variant text-sm">Nenhuma meta. Clique em "Nova Meta".</p></div>`;
    return;
  }
  el.innerHTML = metas.map(mt => {
    const g=gastos[mt.categoria]||0, pct=Math.min((g/mt.limite)*100,100);
    const cl = pct>=100?'bg-error text-error':pct>=80?'bg-warning text-warning':'bg-primary text-primary';
    const [barCl,txtCl] = cl.split(' ');
    const ico = mt.categoria.split(' ')[0]||'🎯';
    return `
    <div class="bg-surface-container-low p-5 rounded-2xl hover:bg-surface-container transition-all group border border-outline-variant/10">
      <div class="flex justify-between items-start mb-4">
        <div class="w-11 h-11 rounded-xl bg-surface-container-highest flex items-center justify-center text-xl">${ico}</div>
        <div class="flex gap-1.5">
          <button class="p-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container text-on-surface-variant" onclick="editarMeta('${mt.categoria}')"><i class="bi bi-pencil-fill text-xs"></i></button>
          <button class="p-1.5 rounded-lg bg-surface-container-highest hover:bg-error/20 text-on-surface-variant hover:text-error" onclick="excluirMeta('${mt.categoria}')"><i class="bi bi-trash3-fill text-xs"></i></button>
        </div>
      </div>
      <h4 class="text-sm font-bold mb-1">${mt.categoria}</h4>
      <div class="flex justify-between items-end mb-3">
        <span class="text-xl font-black text-on-surface">${brl(g)}</span>
        <span class="text-[10px] text-on-surface-variant">de ${brl(mt.limite)}</span>
      </div>
      <div class="w-full h-2.5 bg-surface-container-highest rounded-full overflow-hidden mb-1.5">
        <div class="h-full ${barCl} rounded-full transition-all" style="width:${pct}%"></div>
      </div>
      <p class="text-[10px] uppercase tracking-widest ${txtCl} font-bold">${pct.toFixed(0)}% utilizado</p>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════
   RECORRENTES
═══════════════════════════════════════ */
function renderRecorrentes() {
  const el = document.getElementById('rec-lista');
  if (!el) return;
  if (!recs.length) {
    el.innerHTML = `<div class="text-center py-10 bg-surface-container-low rounded-3xl"><span class="text-3xl block mb-2">🔁</span><p class="text-on-surface-variant text-sm">Sem recorrentes. Adicione seus lançamentos fixos.</p></div>`;
    return;
  }
  el.innerHTML = recs.map(r => {
    const isRec = r.tipo==='receita';
    const ico = r.categoria ? r.categoria.split(' ')[0] : (isRec?'💵':'💳');
    const border = isRec?'border-primary':'border-error';
    const tcol = isRec?'text-primary':'text-error';
    return `
    <div class="flex items-center justify-between p-4 bg-surface-container-low rounded-2xl hover:translate-x-1 transition-transform border-l-4 ${border} group">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-lg">${ico}</div>
        <div>
          <p class="font-bold text-sm text-on-surface">${r.descricao}</p>
          <span class="text-[10px] text-on-surface-variant px-2 py-0.5 bg-surface-container-highest rounded">Dia ${r.dia||'?'} • ${r.categoria||'Sem cat'}</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <p class="font-bold ${tcol}">${isRec?'+':'-'} ${brl(r.valor)}</p>
        <button class="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg md:opacity-0 md:group-hover:opacity-100" onclick="excluirRec('${r.id}')"><i class="bi bi-trash3-fill text-sm"></i></button>
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════
   GRÁFICOS
═══════════════════════════════════════ */
function inicializarCharts() {
  const ctx1 = document.getElementById('chart-principal');
  if (ctx1) {
    chartPrincipal = new Chart(ctx1.getContext('2d'), {
      type:'doughnut',
      data:{labels:['Receitas','Despesas'],datasets:[{data:[0,0],backgroundColor:['#3fe56c','#ffb4ab'],borderColor:['#10141a','#10141a'],borderWidth:3,hoverOffset:6}]},
      options:{cutout:'65%',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#bbcbb8',font:{family:'Inter',size:11,weight:'700'},padding:14,usePointStyle:true}},tooltip:{callbacks:{label:c=>` ${brl(c.parsed)}`}}}}
    });
  }
  const ctx2 = document.getElementById('chart-fixas');
  if (ctx2) {
    chartFixas = new Chart(ctx2.getContext('2d'), {
      type:'doughnut',
      data:{labels:['Fixas','Variáveis','Receitas'],datasets:[{data:[0,0,0],backgroundColor:['#57d9ef','#ffb4ab','#3fe56c'],borderColor:['#10141a','#10141a','#10141a'],borderWidth:3}]},
      options:{cutout:'60%',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#bbcbb8',font:{family:'Inter',size:11,weight:'700'},padding:12,usePointStyle:true}},tooltip:{callbacks:{label:c=>` ${brl(c.parsed)}`}}}}
    });
  }
}

function atualizarCharts(doMes) {
  if (!chartPrincipal) return;
  const r=soma(doMes,'receita'), d=soma(doMes,'despesa');

  if (tipoChart==='rosca') {
    chartPrincipal.config.type='doughnut';
    chartPrincipal.data.labels=['Receitas','Despesas'];
    chartPrincipal.data.datasets=[{data:[r,d],backgroundColor:['#3fe56c','#ffb4ab'],borderColor:['#10141a','#10141a'],borderWidth:3,hoverOffset:6}];
    chartPrincipal.options.cutout='65%'; chartPrincipal.options.scales={};
  } else if (tipoChart==='barras') {
    const gastos={};
    doMes.filter(m=>m.tipo==='despesa').forEach(m=>{ const c=(m.categoria||'Outros').split(' ').slice(1).join(' ')||(m.categoria||'Outros'); gastos[c]=(gastos[c]||0)+m.valor; });
    const ents=Object.entries(gastos).sort((a,b)=>b[1]-a[1]).slice(0,7);
    chartPrincipal.config.type='bar';
    chartPrincipal.data.labels=ents.map(e=>e[0]);
    chartPrincipal.data.datasets=[{label:'Despesas',data:ents.map(e=>e[1]),backgroundColor:'rgba(255,180,171,.7)',borderColor:'#ffb4ab',borderWidth:1.5,borderRadius:6}];
    chartPrincipal.options.cutout=undefined;
    chartPrincipal.options.scales={y:{ticks:{color:'#bbcbb8',font:{size:10}},grid:{color:'rgba(255,255,255,.05)'}},x:{ticks:{color:'#bbcbb8',font:{size:10}},grid:{display:false}}};
  } else {
    const mes=getMes(); const [ano,mm]=mes.split('-').map(Number);
    const diasNoMes=new Date(ano,mm,0).getDate();
    const dias=Array.from({length:diasNoMes},(_,i)=>i+1);
    const recDia=new Array(diasNoMes).fill(0), despDia=new Array(diasNoMes).fill(0);
    doMes.forEach(m=>{ const d2=parseInt(m.data.split('-')[2]); if(m.tipo==='receita') recDia[d2-1]+=m.valor; else despDia[d2-1]+=m.valor; });
    chartPrincipal.config.type='line';
    chartPrincipal.data.labels=dias;
    chartPrincipal.data.datasets=[
      {label:'Receitas',data:recDia,borderColor:'#3fe56c',backgroundColor:'rgba(63,229,108,.08)',fill:true,tension:.4,pointRadius:2},
      {label:'Despesas',data:despDia,borderColor:'#ffb4ab',backgroundColor:'rgba(255,180,171,.08)',fill:true,tension:.4,pointRadius:2}
    ];
    chartPrincipal.options.cutout=undefined;
    chartPrincipal.options.scales={y:{ticks:{color:'#bbcbb8',font:{size:10}},grid:{color:'rgba(255,255,255,.05)'}},x:{ticks:{color:'#bbcbb8',font:{size:10}},grid:{display:false}}};
  }
  chartPrincipal.update();

  if (chartFixas) {
    const fixas=soma(doMes.filter(m=>m.tipo==='despesa'&&m.subtipo==='fixa'),'despesa');
    const vars=soma(doMes.filter(m=>m.tipo==='despesa'&&m.subtipo!=='fixa'),'despesa');
    chartFixas.data.datasets[0].data=[fixas,vars,r];
    chartFixas.update();
  }
}

function setChartTipo(t, btn) {
  tipoChart = t;
  document.querySelectorAll('.ctab').forEach(b => { b.className='ctab px-4 py-1.5 rounded-full font-bold text-xs transition-colors text-on-surface-variant whitespace-nowrap'; });
  btn.className='ctab px-4 py-1.5 rounded-full font-bold text-xs transition-colors bg-primary text-on-primary whitespace-nowrap';
  atualizarCharts(filtrarDoMes());
}

/* ═══════════════════════════════════════
   MODAL MOVIMENTAÇÃO
═══════════════════════════════════════ */
function preencherCatSelects() {
  const fill = (id, tipo) => {
    const s = document.getElementById(id);
    if (!s) return;
    const lista = getAllCats(tipo);
    s.innerHTML = '<option value="">— Categoria —</option>';
    lista.forEach(c => s.appendChild(new Option(c.v, c.v)));
  };
  fill('f-cat', 'receita');
  fill('r-cat', 'receita');
  // Meta select
  const ms = document.getElementById('m-cat');
  if (ms) {
    const allDesp = getAllCats('despesa');
    ms.innerHTML = '';
    allDesp.forEach(c => ms.appendChild(new Option(c.v, c.v)));
  }
}

function abrirModal(ed=null) {
  modoEd = ed;
  if (ed) {
    const m = movs.find(x=>x.id===ed);
    document.getElementById('mov-titulo').textContent = 'Editar Movimentação';
    document.getElementById('f-desc').value = m.descricao;
    document.getElementById('f-val').value = m.valor;
    document.getElementById('f-data').value = m.data;
    setTipo(m.tipo);
    setTimeout(()=>{ document.getElementById('f-cat').value = m.categoria||''; },50);
    if (m.tipo==='despesa') setSubtipo(m.subtipo||'variavel');
  } else {
    document.getElementById('mov-titulo').textContent = 'Nova Movimentação';
    limparMov(); setTipo('receita');
  }
  abrirOv('ov-mov');
}
function editarMov(id) { abrirModal(id); }
function abrirRapido(tipo) { modoEd=null; limparMov(); setTipo(tipo); abrirOv('ov-mov'); }

function setTipo(t) {
  tipoMov = t;
  document.getElementById('btn-r-type').className = `flex-1 py-3 font-semibold rounded-xl border active:scale-95 ${t==='receita'?'bg-primary/20 border-primary text-primary':'border-outline-variant/30 text-on-surface-variant'}`;
  document.getElementById('btn-d-type').className = `flex-1 py-3 font-semibold rounded-xl border active:scale-95 ${t==='despesa'?'bg-error/20 border-error text-error':'border-outline-variant/30 text-on-surface-variant'}`;
  const sw = document.getElementById('subtipo-wrap');
  if (sw) sw.classList.toggle('hidden', t!=='despesa');
  const s = document.getElementById('f-cat');
  if (s) { const lista=getAllCats(t); s.innerHTML='<option value="">— Categoria —</option>'; lista.forEach(c=>s.appendChild(new Option(c.v,c.v))); }
  if (t==='despesa') setSubtipo('variavel');
}

function setSubtipo(st) {
  subtipoMov = st;
  const bf=document.getElementById('btn-sf'), bv=document.getElementById('btn-sv');
  if(bf&&bv){
    bf.className=`flex-1 py-2 text-sm font-semibold rounded-lg border active:scale-95 ${st==='fixa'?'bg-tertiary/20 border-tertiary text-tertiary':'border-outline-variant/30 text-on-surface-variant'}`;
    bv.className=`flex-1 py-2 text-sm font-semibold rounded-lg border active:scale-95 ${st==='variavel'?'bg-error/20 border-error text-error':'border-outline-variant/30 text-on-surface-variant'}`;
  }
}

async function salvarMov() {
  const desc=document.getElementById('f-desc').value.trim();
  const val=parseFloat(document.getElementById('f-val').value);
  const data=document.getElementById('f-data').value;
  const cat=document.getElementById('f-cat').value;
  if (!desc){toast('⚠️ Informe a descrição!');return;}
  if (!val||val<=0){toast('⚠️ Valor inválido!');return;}
  if (!data){toast('⚠️ Informe a data!');return;}
  const mov = { id:modoEd||uid(), tipo:tipoMov, subtipo:tipoMov==='despesa'?subtipoMov:'', descricao:desc, valor:val, data, categoria:cat, criadoEm:modoEd?movs.find(x=>x.id===modoEd)?.criadoEm:new Date().toISOString() };
  await DB.putMOV(mov);
  const i=movs.findIndex(m=>m.id===mov.id); i>=0?movs[i]=mov:movs.push(mov);
  toast(modoEd?'✅ Atualizado!':(tipoMov==='receita'?'💰 Receita adicionada!':'💸 Despesa registrada!'));
  fecharOv('ov-mov'); renderTudo();
}
async function excluirMov(id) { if(!confirm('Excluir?'))return; await DB.delMOV(id); movs=movs.filter(m=>m.id!==id); renderTudo(); toast('🗑️ Removida.'); }

function limparMov() {
  document.getElementById('f-desc').value='';
  document.getElementById('f-val').value='';
  if(document.getElementById('f-data')) document.getElementById('f-data').valueAsDate=new Date();
  if(document.getElementById('f-cat')) document.getElementById('f-cat').value='';
}

/* ═══════════════════════════════════════
   MODAL META
═══════════════════════════════════════ */
function abrirModalMeta(cat=null) {
  modoEdMeta = cat;
  document.getElementById('meta-titulo').textContent = cat?'Editar Meta':'Nova Meta';
  if(cat){const m=metas.find(x=>x.categoria===cat); document.getElementById('m-cat').value=m.categoria; document.getElementById('m-lim').value=m.limite;}
  else document.getElementById('m-lim').value='';
  abrirOv('ov-meta');
}
function editarMeta(cat){abrirModalMeta(cat);}
async function salvarMeta() {
  const cat=document.getElementById('m-cat').value, lim=parseFloat(document.getElementById('m-lim').value);
  if(!lim||lim<=0){toast('⚠️ Informe um limite!');return;}
  const m={categoria:cat,limite:lim}; await DB.putMETA(m);
  const i=metas.findIndex(x=>x.categoria===cat); i>=0?metas[i]=m:metas.push(m);
  toast('🎯 Meta salva!'); fecharOv('ov-meta'); renderTudo();
}
async function excluirMeta(cat){if(!confirm('Excluir meta?'))return; await DB.delMETA(cat); metas=metas.filter(m=>m.categoria!==cat); renderTudo(); toast('🗑️ Meta removida.');}

/* ═══════════════════════════════════════
   MODAL RECORRENTE
═══════════════════════════════════════ */
function abrirModalRec() {
  document.getElementById('r-desc').value=''; document.getElementById('r-val').value=''; document.getElementById('r-dia').value='';
  setTipoRec('receita'); abrirOv('ov-rec');
}
function setTipoRec(t) {
  tipoRec = t;
  document.getElementById('btn-r-rec').className=`flex-1 py-3 font-semibold rounded-xl border ${t==='receita'?'bg-primary/20 border-primary text-primary':'border-outline-variant/30 text-on-surface-variant'}`;
  document.getElementById('btn-d-rec').className=`flex-1 py-3 font-semibold rounded-xl border ${t==='despesa'?'bg-error/20 border-error text-error':'border-outline-variant/30 text-on-surface-variant'}`;
  const s=document.getElementById('r-cat'); const lista=getAllCats(t);
  s.innerHTML='<option value="">— Categoria —</option>'; lista.forEach(c=>s.appendChild(new Option(c.v,c.v)));
}
async function salvarRecorrente() {
  const desc=document.getElementById('r-desc').value.trim(), val=parseFloat(document.getElementById('r-val').value), dia=parseInt(document.getElementById('r-dia').value)||1, cat=document.getElementById('r-cat').value;
  if(!desc){toast('⚠️ Descrição!');return;} if(!val||val<=0){toast('⚠️ Valor!');return;}
  const r={id:uid(),tipo:tipoRec,descricao:desc,valor:val,dia,categoria:cat};
  await DB.putREC(r); recs.push(r); toast('🔁 Recorrente salvo!'); fecharOv('ov-rec'); renderTudo();
}
async function excluirRec(id){if(!confirm('Excluir?'))return; await DB.delREC(id); recs=recs.filter(r=>r.id!==id); renderTudo(); toast('🗑️ Removido.');}

/* ═══════════════════════════════════════
   MODAL CATEGORIA
═══════════════════════════════════════ */
function abrirModalCategoria() { setCatTipo('receita'); document.getElementById('cat-emoji').value=''; document.getElementById('cat-nome').value=''; abrirOv('ov-cat'); }
function setCatTipo(t) {
  tipoCatNova = t;
  document.getElementById('btn-cat-rec').className=`flex-1 py-2.5 font-semibold rounded-xl text-sm border ${t==='receita'?'bg-primary/20 border-primary text-primary':'border-outline-variant/30 text-on-surface-variant'}`;
  document.getElementById('btn-cat-desp').className=`flex-1 py-2.5 font-semibold rounded-xl text-sm border ${t==='despesa'?'bg-error/20 border-error text-error':'border-outline-variant/30 text-on-surface-variant'}`;
}
async function salvarCategoria() {
  const emoji=document.getElementById('cat-emoji').value.trim()||'🏷️';
  const nome=document.getElementById('cat-nome').value.trim();
  if(!nome){toast('⚠️ Informe o nome!');return;}
  const c={id:uid(),tipo:tipoCatNova,emoji,nome};
  await DB.putCAT(c); customCats.push(c);
  preencherCatSelects(); toast('✅ Categoria criada!'); fecharOv('ov-cat'); renderTudo();
}
async function excluirCategoria(id) {
  if(!confirm('Excluir categoria?'))return;
  await DB.delCAT(id); customCats=customCats.filter(c=>c.id!==id);
  preencherCatSelects(); renderTudo(); toast('🗑️ Categoria removida.');
}

/* ═══════════════════════════════════════
   NAVEGAÇÃO
═══════════════════════════════════════ */
function irAba(tabId) {
  document.querySelectorAll('.painel').forEach(p=>{ p.classList.add('hidden'); p.classList.remove('painel-active'); });
  document.querySelectorAll('.nav-link').forEach(n=>{ n.classList.remove('text-primary'); n.classList.add('text-on-surface-variant'); });
  const painel = document.getElementById(`painel-${tabId}`);
  if (painel) { painel.classList.remove('hidden'); painel.classList.add('painel-active'); }
  // Highlight all matching nav buttons (desktop + mobile)
  [`dnav-${tabId}`,`mnav-${tabId}`].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.classList.add('text-primary'); el.classList.remove('text-on-surface-variant'); }
  });
  const titles = {'inicio':'Visão Geral','graficos':'Análises','categorias':'Categorias','metas':'Metas de Gastos','recorrentes':'Lançamentos Fixos'};
  const nt = document.getElementById('nav-title');
  if(nt) nt.textContent = titles[tabId]||'';
  window.scrollTo(0,0);
  if(tabId==='graficos') setTimeout(()=>atualizarCharts(filtrarDoMes()),100);
}

/* ═══════════════════════════════════════
   BACKUP
═══════════════════════════════════════ */
function exportarJSON() {
  const dados = { versao:3, exportadoEm:new Date().toISOString(), movs, metas, recorrentes:recs, categorias:customCats };
  const blob = new Blob([JSON.stringify(dados,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `fluxocerto-backup-${getMes()}.json`; a.click();
  URL.revokeObjectURL(a.href); toast('💾 Backup exportado!');
}

async function importarJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const dados = JSON.parse(text);
    if (!dados.movs && !dados.movimentacoes) { toast('⚠️ Arquivo inválido!'); return; }
    if (!confirm(`Importar ${(dados.movs||dados.movimentacoes).length} movimentações? Dados existentes serão mesclados.`)) return;

    const importMovs = dados.movs || dados.movimentacoes || [];
    for (const m of importMovs) await DB.putMOV(m);
    const importMetas = dados.metas || [];
    for (const m of importMetas) await DB.putMETA(m);
    const importRecs = dados.recorrentes || [];
    for (const r of importRecs) await DB.putREC(r);
    const importCats = dados.categorias || [];
    for (const c of importCats) await DB.putCAT(c);

    [movs, metas, recs, customCats] = await Promise.all([DB.getMOVS(), DB.getMETAS(), DB.getRECS(), DB.getCATS()]);
    preencherCatSelects();
    renderTudo();
    toast(`✅ Importado! ${importMovs.length} movimentações.`);
  } catch(e) {
    console.error(e);
    toast('❌ Erro ao importar arquivo.');
  }
  event.target.value = '';
}

/* ═══════════════════════════════════════
   NOTIFICAÇÕES
═══════════════════════════════════════ */
function toggleNotif() {
  notifAberta = !notifAberta;
  document.getElementById('notif-panel').classList.toggle('open', notifAberta);
}
document.addEventListener('click', e => {
  if (notifAberta && !e.target.closest('#notif-panel') && !e.target.closest('[onclick*="toggleNotif"]')) {
    notifAberta = false;
    document.getElementById('notif-panel').classList.remove('open');
  }
});

/* ═══════════════════════════════════════
   OVERLAYS
═══════════════════════════════════════ */
function abrirOv(id) {
  const el = document.getElementById(id);
  el.style.display = 'flex';
  el.classList.remove('hidden');
  setTimeout(() => {
    const bg = el.querySelector('.overlay-bg');
    const mp = el.querySelector('.modal-panel');
    if (bg) bg.classList.remove('opacity-0');
    if (mp) { mp.style.transform = 'none'; }
  }, 20);
}
function fecharOv(id) {
  const el = document.getElementById(id);
  const bg = el.querySelector('.overlay-bg');
  const mp = el.querySelector('.modal-panel');
  if (bg) bg.classList.add('opacity-0');
  if (mp) mp.style.transform = '';
  setTimeout(() => { el.style.display = 'none'; el.classList.add('hidden'); }, 300);
  if(id==='ov-mov') modoEd=null;
  if(id==='ov-meta') modoEdMeta=null;
}
