/* ===========================================
   TORY READER · app.js
   MangaDex API Integration — PT-BR
   =========================================== */

// ── 1. CONFIG ────────────────────────────────
const CFG = {
  API:     '/api/mangadex',
  COVERS:  '/api/cover',
  LANG:    'pt-br',
  SAFE:    ['safe','suggestive'],
  ALL:     ['safe','suggestive','erotica','pornographic'],
  CHAPTER_LANGS: ['pt-br','pt','en','es-la','es'],
  LIMIT:   18,
  // Full Color tag UUID (MangaDex)
  TAG_COLOR: 'f4122d1c-3b44-44d0-9936-ff7502c39ad1',
};

// ── 2. STATE ──────────────────────────────────
const S = {
  route:       'home',
  mangaId:     null,
  chapterId:   null,
  query:       '',
  show18:      false,
  readerMode:  'v',        // 'v' = vertical, 'h' = horizontal
  readerPage:  0,
  readerTotal: 0,
  currentManga: null,      // manga object being read
  currentChInfo: null,     // { num, title }
  uiHidden:    false,
};

// ── 3. API MODULE ─────────────────────────────
const API = (() => {
  const cache = new Map();

  async function req(path, params = {}, ttl = 180_000) {
    const proxied = CFG.API.startsWith('/');
    const url = new URL(proxied ? CFG.API : CFG.API + path, location.origin);
    if (proxied) url.searchParams.set('endpoint', path);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
      else url.searchParams.append(k, v);
    }
    const key = url.toString();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.t < ttl) return cached.d;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    cache.set(key, { d, t: Date.now() });
    return d;
  }

  const rating = () => S.show18 ? CFG.ALL : CFG.SAFE;
  const BASE_MANGA = ['cover_art'];

  return {
    // Popular sorted by follows
    popular: (offset = 0) => req('/manga', {
      'order[followedCount]': 'desc',
      'availableTranslatedLanguage[]': CFG.LANG,
      'contentRating[]': rating(),
      'includes[]': BASE_MANGA,
      limit: CFG.LIMIT, offset,
    }),

    // Latest updated manga with PT-BR chapters
    latest: (offset = 0) => req('/manga', {
      'order[latestUploadedChapter]': 'desc',
      'availableTranslatedLanguage[]': CFG.LANG,
      'contentRating[]': rating(),
      'includes[]': BASE_MANGA,
      limit: 20, offset,
    }, 60_000),  // 1 min cache for lançamentos

    // By original language: ja=manga, ko=manhwa
    byType: (lang, offset = 0) => req('/manga', {
      'order[followedCount]': 'desc',
      'availableTranslatedLanguage[]': CFG.LANG,
      'originalLanguage[]': lang,
      'contentRating[]': rating(),
      'includes[]': BASE_MANGA,
      limit: CFG.LIMIT, offset,
    }),

    // Full color tag
    coloridos: (offset = 0) => req('/manga', {
      'order[followedCount]': 'desc',
      'availableTranslatedLanguage[]': CFG.LANG,
      'includedTags[]': CFG.TAG_COLOR,
      'contentRating[]': CFG.SAFE,
      'includes[]': BASE_MANGA,
      limit: CFG.LIMIT, offset,
    }),

    // +18 only
    adult: (offset = 0) => req('/manga', {
      'order[followedCount]': 'desc',
      'availableTranslatedLanguage[]': CFG.LANG,
      'contentRating[]': ['erotica','pornographic'],
      'includes[]': BASE_MANGA,
      limit: CFG.LIMIT, offset,
    }),

    async search(title) {
      const base = {
        title,
        'contentRating[]': rating(),
        'includes[]': BASE_MANGA,
        'order[relevance]': 'desc',
        limit: 24,
      };
      const primary = await req('/manga', { ...base, 'availableTranslatedLanguage[]': CFG.LANG }, 30_000);
      return primary.data.length ? primary : req('/manga', base, 30_000);
    },

    // Single manga (for detail page)
    manga: (id) => req(`/manga/${id}`, {
      'includes[]': ['cover_art','author','artist'],
    }),

    async chapters(mangaId) {
      const limit = 500;
      const params = {
        'translatedLanguage[]': CFG.CHAPTER_LANGS,
        'order[volume]': 'desc',
        'order[chapter]': 'desc',
        'includes[]': ['scanlation_group'],
        'contentRating[]': CFG.ALL,
        limit,
      };
      const first = await req(`/manga/${mangaId}/feed`, { ...params, offset: 0 });
      const data = [...first.data];
      for (let offset = data.length; offset < first.total; offset += limit) {
        const next = await req(`/manga/${mangaId}/feed`, { ...params, offset });
        data.push(...next.data);
        if (next.data.length < limit) break;
      }
      return { ...first, data: uniqueChapters(data) };
    },

    // Chapter page data
    pages: (chapterId) => req(`/at-home/server/${chapterId}`, {}, 0),  // no cache
  };
})();

// ── 4. HELPERS ────────────────────────────────
function title(m) {
  const t = m.attributes.title;
  return t[CFG.LANG] || t.en || t['ja-ro'] || Object.values(t)[0] || '—';
}
function desc(m) {
  const d = m.attributes.description || {};
  return d[CFG.LANG] || d.en || Object.values(d)[0] || '';
}
function cover(m, size = 256) {
  const rel = m.relationships?.find(r => r.type === 'cover_art');
  if (!rel?.attributes?.fileName) return null;
  if (CFG.COVERS.startsWith('/')) {
    const file = `${rel.attributes.fileName}.${size}.jpg`;
    return `${CFG.COVERS}?id=${encodeURIComponent(m.id)}&file=${encodeURIComponent(file)}`;
  }
  return `${CFG.COVERS}/${m.id}/${rel.attributes.fileName}.${size}.jpg`;
}
function pageURL(baseUrl, mode, hash, file) {
  const src = `${baseUrl}/${mode}/${hash}/${file}`;
  return `/api/page?url=${encodeURIComponent(src)}`;
}
function chapterLang(ch) {
  return ch.attributes.translatedLanguage || '';
}
function langLabel(lang) {
  return ({ 'pt-br':'PT-BR', pt:'PT', en:'EN', 'es-la':'ES-LA', es:'ES' })[lang] || lang.toUpperCase();
}
function chapterKey(ch) {
  const a = ch.attributes;
  if (!a.chapter) return `oneshot:${a.volume || ''}:${(a.title || '').trim().toLowerCase()}:${chapterLang(ch)}`;
  return `${a.volume || ''}:${String(a.chapter).replace(/\.0$/, '')}`;
}
function chapterNum(ch) {
  const n = parseFloat(ch.attributes.chapter);
  return Number.isFinite(n) ? n : -1;
}
function chapterScore(ch) {
  const lang = CFG.CHAPTER_LANGS.indexOf(chapterLang(ch));
  return [
    lang < 0 ? 0 : 1000 - lang * 100,
    ch.attributes.externalUrl ? 0 : 1,
    ch.attributes.pages || 0,
    Date.parse(ch.attributes.publishAt || '') || 0,
  ];
}
function betterChapter(a, b) {
  const as = chapterScore(a);
  const bs = chapterScore(b);
  for (let i = 0; i < as.length; i++) {
    if (as[i] !== bs[i]) return as[i] > bs[i] ? a : b;
  }
  return a;
}
function uniqueChapters(chapters) {
  const map = new Map();
  for (const ch of chapters) {
    const key = chapterKey(ch);
    const current = map.get(key);
    if (!current || betterChapter(ch, current) === ch) map.set(key, ch);
  }
  return [...map.values()].sort((a, b) =>
    (parseFloat(b.attributes.volume) || 0) - (parseFloat(a.attributes.volume) || 0) ||
    chapterNum(b) - chapterNum(a) ||
    Date.parse(b.attributes.publishAt || '') - Date.parse(a.attributes.publishAt || '')
  );
}
function authorName(m) {
  const a = m.relationships?.find(r => r.type === 'author');
  return a?.attributes?.name || '';
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function ago(dateStr) {
  const d = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(d/60000), h = Math.floor(d/3600000), day = Math.floor(d/86400000);
  if (m < 1)   return 'agora';
  if (m < 60)  return `${m}m`;
  if (h < 24)  return `${h}h`;
  if (day < 30) return `${day}d`;
  return `${Math.floor(day/30)}m`;
}
function chLabel(ch) {
  const vol = ch.attributes.volume ? `Vol.${ch.attributes.volume} ` : '';
  const num = ch.attributes.chapter ? `Cap.${ch.attributes.chapter}` : 'Oneshot';
  return vol + num;
}
function isReadableChapter(ch) {
  return !ch.attributes.externalUrl && (ch.attributes.pages || 0) > 0;
}

// ── 5. STORAGE ────────────────────────────────
const DB = {
  _get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  _set: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },

  favs() { return this._get('tory_favs') || []; },
  toggleFav(m) {
    const list = this.favs();
    const i = list.findIndex(x => x.id === m.id);
    if (i >= 0) list.splice(i,1);
    else list.unshift({ id:m.id, title:title(m), cover:cover(m,256), at:Date.now() });
    this._set('tory_favs', list);
    return i < 0;
  },
  isFav: (id) => (DB._get('tory_favs')||[]).some(x => x.id === id),

  list() { return this._get('tory_list') || []; },
  toggleList(m) {
    const list = this.list();
    const i = list.findIndex(x => x.id === m.id);
    if (i >= 0) list.splice(i,1);
    else list.unshift({ id:m.id, title:title(m), cover:cover(m,256), at:Date.now() });
    this._set('tory_list', list);
    return i < 0;
  },
  inList: (id) => (DB._get('tory_list')||[]).some(x => x.id === id),

  progress(id) { return (this._get('tory_prog')||{})[id] || null; },
  saveProgress(mangaId, chId, page, total, chTitle) {
    const p = this._get('tory_prog') || {};
    p[mangaId] = { chId, page, total, chTitle, at:Date.now() };
    this._set('tory_prog', p);
  },

  history() { return this._get('tory_hist') || []; },
  addHistory(m) {
    const h = this.history().filter(x => x.id !== m.id);
    h.unshift({ id:m.id, title:title(m), cover:cover(m,256), at:Date.now() });
    this._set('tory_hist', h.slice(0, 80));
  },

  settings() { return this._get('tory_cfg') || { readerMode:'v' }; },
  saveCfg(obj) { this._set('tory_cfg', { ...this.settings(), ...obj }); },

  continueReading() {
    const prog = this._get('tory_prog') || {};
    return Object.entries(prog)
      .sort((a,b) => b[1].at - a[1].at)
      .slice(0, 8)
      .map(([id, p]) => ({ id, ...p }));
  },
};

// restore settings on load
(function() {
  const cfg = DB.settings();
  S.readerMode = cfg.readerMode || 'v';
})();

// ── 6. UI TEMPLATES ───────────────────────────

// Manga card (for grids)
function cardHTML(m, opts = {}) {
  const cv = cover(m, 256);
  const t  = esc(title(m));
  const prog = DB.progress(m.id);
  const pct  = prog ? Math.round((prog.page / prog.total) * 100) : 0;
  const { badge } = opts;

  const badgeHTML = badge ? `<span class="badge ${badge.cls}">${badge.label}</span>` : '';
  const imgHTML   = cv
    ? `<img src="${cv}" alt="${t}" loading="lazy" onerror="imgErr(this)">`
    : `<div class="no-img">${svgBook()}</div>`;
  const progHTML  = prog
    ? `<div class="card-prog"><div class="card-prog-fill" style="width:${pct}%"></div></div>`
    : '';

  return `
    <a class="card" href="#" onclick="go('manga/${m.id}');return false">
      ${imgHTML}
      ${badgeHTML}
      <div class="card-foot">
        <div class="card-t">${t}</div>
      </div>
      ${progHTML}
    </a>`;
}

// Skeleton cards
function skels(n, cls = '') {
  return Array(n).fill(`<div class="card sk ${cls}"></div>`).join('');
}

// Error view
function errHTML(msg, retryFn) {
  return `<div class="empty-view">
    <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div class="empty-title">Erro ao carregar</div>
    <div class="empty-sub">${msg}</div>
    ${retryFn ? `<button class="retry-btn" onclick="${retryFn}()">Tentar novamente</button>` : ''}
  </div>`;
}

// Empty view
function emptyHTML(msg) {
  return `<div class="empty-view">
    <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
    <div class="empty-title">Nada por aqui</div>
    <div class="empty-sub">${msg}</div>
  </div>`;
}

function svgBook() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
}

function imgErr(el) {
  el.parentElement.innerHTML = `<div class="no-img">${svgBook()}</div>`;
}

// ── 7. VIEWS ─────────────────────────────────

/* ──── HOME ──── */
async function viewHome() {
  const app = document.getElementById('app');

  // Immediate skeleton render
  app.innerHTML = `
    <div class="hero">
      <p class="hero-hi">Bem-vinda de volta ✦</p>
      <h1 class="hero-h1">Sua biblioteca<br><em>privada</em> em PT-BR</h1>
    </div>
    <div class="tabs">
      <button class="tab active" onclick="homeTab(this,'popular')">🔥 Popular</button>
      <button class="tab" onclick="homeTab(this,'lancamentos')">⚡ Lançamentos</button>
      <button class="tab" onclick="homeTab(this,'manga')">📖 Manga</button>
      <button class="tab" onclick="homeTab(this,'manhwa')">📚 Manhwa</button>
      <button class="tab" onclick="homeTab(this,'coloridos')">🎨 Coloridos</button>
    </div>
    <div id="home-content">
      ${homeSkelHTML()}
    </div>`;

  loadHomeTab('popular');
}

function homeSkelHTML() {
  return `
    <div class="sec">
      <div class="sec-head"><span class="sec-title">Popular agora</span></div>
      <div class="grid3">${skels(6)}</div>
    </div>
    <div class="sec">
      <div class="sec-head"><span class="sec-title">Lançamentos</span></div>
      <div class="grid3">${skels(6)}</div>
    </div>`;
}

window.homeTab = function(btn, tab) {
  document.querySelectorAll('.tabs .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const hc = document.getElementById('home-content');
  hc.innerHTML = homeSkelHTML();
  loadHomeTab(tab);
};

async function loadHomeTab(tab) {
  const hc = document.getElementById('home-content');
  try {
    if (tab === 'popular') {
      const [pop, lat] = await Promise.all([API.popular(), API.latest()]);
      const cr = DB.continueReading();
      hc.innerHTML = homeFullHTML(pop.data, lat.data, cr);
    } else if (tab === 'lancamentos') {
      const lat = await API.latest();
      hc.innerHTML = `
        <div class="sec">
          <div class="sec-head"><span class="sec-title">Lançamentos recentes</span></div>
          <div class="grid3">${lat.data.map(m => cardHTML(m, {badge:{cls:'b-new',label:'Novo'}})).join('')}</div>
        </div>`;
    } else if (tab === 'manga') {
      const d = await API.byType('ja');
      hc.innerHTML = `
        <div class="sec">
          <div class="sec-head"><span class="sec-title">Manga</span></div>
          <div class="grid3">${d.data.map(m => cardHTML(m)).join('')}</div>
        </div>`;
    } else if (tab === 'manhwa') {
      const d = await API.byType('ko');
      hc.innerHTML = `
        <div class="sec">
          <div class="sec-head"><span class="sec-title">Manhwa</span></div>
          <div class="grid3">${d.data.map(m => cardHTML(m)).join('')}</div>
        </div>`;
    } else if (tab === 'coloridos') {
      const d = await API.coloridos();
      hc.innerHTML = `
        <div class="sec">
          <div class="sec-head"><span class="sec-title">Coloridos</span></div>
          <div class="grid3">${d.data.map(m => cardHTML(m, {badge:{cls:'b-color',label:'Color'}})).join('')}</div>
        </div>`;
    }
  } catch(e) {
    hc.innerHTML = errHTML('Verifique sua conexão.', 'viewHome');
  }
}

function homeFullHTML(popular, latest, cr) {
  const crHTML = cr.length ? `
    <div class="sec">
      <div class="sec-head"><span class="sec-title">Continuar lendo</span></div>
      <div class="hrow">${cr.map(crCardHTML).join('')}</div>
    </div>` : '';

  return `
    ${crHTML}
    <div class="sec">
      <div class="sec-head">
        <span class="sec-title">Popular agora</span>
        <a class="see-all" href="#" onclick="go('manga-cat');return false">Ver todos</a>
      </div>
      <div class="grid3">${popular.map(m => cardHTML(m)).join('')}</div>
    </div>
    <div class="sec" style="padding-bottom:16px">
      <div class="sec-head">
        <span class="sec-title">Lançamentos</span>
        <a class="see-all" href="#" onclick="go('lancamentos');return false">Ver todos</a>
      </div>
      <div class="hrow">${latest.slice(0,10).map(m => cardHTML(m,{badge:{cls:'b-new',label:'Novo'}})).join('')}</div>
    </div>`;
}

function crCardHTML(item) {
  const pct = item.total ? Math.round((item.page/item.total)*100) : 0;
  const cv  = item.cover ? `<img src="${esc(item.cover)}" alt="" loading="lazy" onerror="imgErr(this)">` : `<div class="no-img">${svgBook()}</div>`;
  return `
    <div class="cr-card" onclick="go('manga/${esc(item.id)}')">
      <div class="cr-cover">${cv}</div>
      <div class="cr-info">
        <div>
          <div class="cr-title">${esc(item.title)}</div>
          <div class="cr-ch">${esc(item.chTitle||'')}</div>
        </div>
        <div>
          <div class="cr-prog-label"><span>Progresso</span><span>${pct}%</span></div>
          <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
        </div>
      </div>
    </div>`;
}

/* ──── LANÇAMENTOS ──── */
async function viewLancamentos() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page-title">⚡ Lançamentos</div>
    <div id="lc-list">${lcSkels(12)}</div>`;

  try {
    const d = await API.latest();
    document.getElementById('lc-list').innerHTML =
      d.data.map(m => lcItemHTML(m)).join('');
  } catch {
    document.getElementById('lc-list').innerHTML = errHTML('Verifique sua conexão.', 'viewLancamentos');
  }
}

function lcSkels(n) {
  return Array(n).fill(0).map(() => `
    <div class="lc-item">
      <div class="lc-cover"><div class="sk" style="width:46px;aspect-ratio:2/3;border-radius:6px"></div></div>
      <div class="lc-info">
        <div class="sk" style="height:12px;width:70%;border-radius:4px;margin-bottom:6px"></div>
        <div class="sk" style="height:10px;width:40%;border-radius:4px"></div>
      </div>
    </div>`).join('');
}

function lcItemHTML(m) {
  const cv = cover(m, 256);
  const t  = esc(title(m));
  const updatedAt = m.attributes.updatedAt;
  return `
    <div class="lc-item" onclick="go('manga/${m.id}')">
      <div class="lc-cover">
        ${cv ? `<img src="${cv}" alt="${t}" loading="lazy" onerror="imgErr(this)">` : `<div class="no-img">${svgBook()}</div>`}
      </div>
      <div class="lc-info">
        <div class="lc-title">${t}</div>
        <div class="lc-ch">Atualizado</div>
      </div>
      <div class="lc-date">${ago(updatedAt)}</div>
    </div>`;
}

/* ──── GENERIC CATEGORY ──── */
async function viewCategory(type) {
  const labels = {
    manga:     { title:'📖 Manga',    fn: () => API.byType('ja') },
    manhwa:    { title:'📚 Manhwa',   fn: () => API.byType('ko') },
    coloridos: { title:'🎨 Coloridos',fn: () => API.coloridos() },
  };
  const cfg = labels[type];
  if (!cfg) return;

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page-title">${cfg.title}</div>
    <div class="sec"><div class="grid3">${skels(12)}</div></div>`;

  try {
    const d = await cfg.fn();
    const badge = type === 'coloridos' ? {cls:'b-color',label:'Color'} : null;
    app.querySelector('.grid3').innerHTML = d.data.map(m => cardHTML(m, badge ? {badge} : {})).join('');
  } catch {
    app.innerHTML = errHTML('Verifique sua conexão.', `function(){viewCategory('${type}')}`);
  }
}

/* ──── +18 ──── */
async function view18() {
  if (!S.show18) {
    document.getElementById('app').innerHTML = `
      <div class="gate">
        <div class="gate-icon">🔞</div>
        <div class="gate-title">Conteúdo +18</div>
        <div class="gate-sub">Esta seção contém conteúdo adulto. Confirme sua idade para continuar.</div>
        <button class="gate-btn" onclick="unlock18()">Tenho 18 anos — Entrar</button>
      </div>`;
    return;
  }
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page-title">🔞 Conteúdo +18</div>
    <div class="sec"><div class="grid3">${skels(12)}</div></div>`;
  try {
    const d = await API.adult();
    app.querySelector('.grid3').innerHTML = d.data.map(m => cardHTML(m, {badge:{cls:'b-18',label:'18+'}})).join('');
  } catch {
    app.innerHTML = errHTML('Verifique sua conexão.', 'view18');
  }
}

window.unlock18 = function() {
  S.show18 = true;
  view18();
};

/* ──── MANGA DETAIL ──── */
async function viewMangaDetail(id) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-screen"><div class="loading-logo">Tory</div><div class="loading-dots"><span></span><span></span><span></span></div></div>`;

  try {
    const [mRes, chRes] = await Promise.all([
      API.manga(id),
      API.chapters(id),
    ]);
    const m = mRes.data;
    S.currentManga = m;
    renderDetail(m, chRes.data);
  } catch(e) {
    app.innerHTML = errHTML('Não foi possível carregar este título.', `function(){viewMangaDetail('${id}')}`);
  }
}

function renderDetail(m, chapters) {
  const app = document.getElementById('app');
  const cv512 = cover(m, 512);
  const cv256 = cover(m, 256);
  const t = title(m);
  const d = desc(m);
  const au = authorName(m);
  const status = m.attributes.status;
  const year = m.attributes.year;
  const tags = (m.attributes.tags||[]).map(tg => esc(tg.attributes.name.en||'')).filter(Boolean);
  const isFav = DB.isFav(m.id);
  const inList = DB.inList(m.id);
  const prog = DB.progress(m.id);

  const statusMap = {
    ongoing:   ['Ongoing','status-ongoing'],
    completed: ['Completo','status-completed'],
    hiatus:    ['Hiatus','status-hiatus'],
    cancelled: ['Cancelado','status-hiatus'],
  };
  const [stLabel, stCls] = statusMap[status] || ['—','status-hiatus'];

  // First chapter to read
  const readableChapters = chapters.filter(isReadableChapter);
  const firstCh = [...(readableChapters.length ? readableChapters : chapters)].reverse()[0];
  const readCh  = prog ? chapters.find(c => c.id === prog.chId && isReadableChapter(c)) || firstCh : firstCh;
  const readLabel = prog ? `Continuar — ${esc(prog.chTitle||'')}` : 'Começar a ler';

  const chHTML = chapters.length === 0
    ? `<div class="empty-sub" style="padding:20px 16px;color:var(--sub)">Sem capítulos em PT-BR ainda.</div>`
    : chapters.map(ch => {
        const read = prog && (parseFloat(ch.attributes.chapter) <= parseFloat(prog?.chTitle?.replace(/\D/g,'') || '0'));
        const lang = chapterLang(ch);
        const langHTML = lang && lang !== CFG.LANG ? `<span class="ch-lang">${langLabel(lang)}</span>` : '';
        const external = ch.attributes.externalUrl;
        const externalHTML = external ? '<span class="ch-lang">WEB</span>' : '';
        const action = external
          ? `openExternal('${encodeURIComponent(external)}')`
          : `openChapter('${ch.id}','${esc(chLabel(ch))}')`;
        return `
          <div class="ch-row ${read ? 'ch-read' : ''} ${external ? 'ch-external' : ''}" onclick="${action}">
            <span class="ch-num">${esc(chLabel(ch))}</span>
            <span class="ch-title">${esc(ch.attributes.title || '')}</span>
            ${langHTML}
            ${externalHTML}
            <span class="ch-date">${ago(ch.attributes.publishAt)}</span>
          </div>`;
      }).join('');

  app.innerHTML = `
    <div class="detail-hero">
      ${cv512 ? `<img class="detail-bg" src="${cv512}" alt="" aria-hidden="true">` : '<div style="height:240px;background:var(--faint)"></div>'}
      <div class="detail-content">
        <div class="detail-cover">
          ${cv256 ? `<img src="${cv256}" alt="${esc(t)}" loading="lazy">` : `<div class="no-img" style="height:165px">${svgBook()}</div>`}
        </div>
        <div class="detail-meta">
          <div class="detail-title">${esc(t)}</div>
          <div class="detail-year">${au ? esc(au) + ' · ' : ''}${year || ''}</div>
          <span class="detail-status ${stCls}">${stLabel}</span>
        </div>
      </div>
    </div>

    <div class="detail-body">
      <div class="detail-actions">
        <button class="btn-primary" onclick="openChapter('${readCh?.id || ''}','${esc(readCh ? chLabel(readCh) : '')}')">
          ${readLabel}
        </button>
        <button class="btn-icon-lg ${isFav ? 'active' : ''}" id="btn-fav" onclick="toggleFav()" title="Favorito">
          <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <button class="btn-icon-lg ${inList ? 'active' : ''}" id="btn-list" onclick="toggleList()" title="Minha lista">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      ${d ? `<div class="detail-desc" id="detail-desc" onclick="expandDesc()">${esc(d)}</div>` : ''}

      ${tags.length ? `<div class="detail-tags">${tags.slice(0,10).map(tg => `<span class="tag">${tg}</span>`).join('')}</div>` : ''}
    </div>

    <div class="chapters-header">
      <span class="chapters-title">Capítulos (${chapters.length})</span>
    </div>
    ${chHTML}
    <div style="height:8px"></div>`;
}

window.expandDesc = function() {
  document.getElementById('detail-desc')?.classList.toggle('expanded');
};

window.toggleFav = function() {
  if (!S.currentManga) return;
  const added = DB.toggleFav(S.currentManga);
  const btn = document.getElementById('btn-fav');
  if (btn) {
    btn.classList.toggle('active', added);
    btn.querySelector('svg').setAttribute('fill', added ? 'currentColor' : 'none');
  }
};

window.toggleList = function() {
  if (!S.currentManga) return;
  const added = DB.toggleList(S.currentManga);
  const btn = document.getElementById('btn-list');
  if (btn) btn.classList.toggle('active', added);
};

window.openExternal = function(encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  window.open(url, '_blank', 'noopener,noreferrer');
};

/* ──── CHAPTER READER ──── */
window.openChapter = async function(chId, chTitle) {
  if (!chId) return;
  const reader = document.getElementById('reader');
  const pages  = document.getElementById('reader-pages');
  reader.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Set header info
  document.getElementById('readerTitle').textContent = S.currentManga ? title(S.currentManga) : '';
  document.getElementById('readerCh').textContent = chTitle;
  document.getElementById('readerModeBtn').textContent = S.readerMode === 'v' ? 'Vertical' : 'Horizontal';
  applyReaderMode();

  // Loading state
  pages.innerHTML = `<div class="loading-screen"><div class="loading-logo">Tory</div><div class="loading-dots"><span></span><span></span><span></span></div></div>`;
  updateReaderUI(0, 0);

  try {
    const data = await API.pages(chId);
    const { baseUrl, chapter } = data;
    const files = chapter.dataSaver?.length ? chapter.dataSaver : chapter.data;
    const mode = chapter.dataSaver?.length ? 'data-saver' : 'data';
    const imgList = files.map((file) => pageURL(baseUrl, mode, chapter.hash, file));

    S.readerPage  = 0;
    S.readerTotal = imgList.length;
    S.chapterId   = chId;
    S.currentChInfo = chTitle;

    pages.innerHTML = imgList.map((src, i) =>
      `<img src="${src}" alt="Página ${i+1}" loading="${i < 3 ? 'eager' : 'lazy'}">`
    ).join('');

    updateReaderUI(1, imgList.length);

    // Track scroll progress (vertical mode)
    pages.addEventListener('scroll', onReaderScroll, { passive: true });

    // Save to history
    if (S.currentManga) DB.addHistory(S.currentManga);

  } catch {
    pages.innerHTML = errHTML('Não foi possível carregar o capítulo.');
  }
};

window.closeReader = function() {
  const reader = document.getElementById('reader');
  const pages  = document.getElementById('reader-pages');
  reader.style.display = 'none';
  document.body.style.overflow = '';
  pages.innerHTML = '';
  pages.removeEventListener('scroll', onReaderScroll);
};

function onReaderScroll() {
  const pages = document.getElementById('reader-pages');
  const total = pages.scrollHeight - pages.clientHeight;
  const pct   = total > 0 ? pages.scrollTop / total : 0;
  const pg    = Math.round(pct * S.readerTotal);
  S.readerPage = pg;
  updateReaderUI(pg + 1, S.readerTotal);

  // Save progress
  if (S.currentManga && S.chapterId) {
    DB.saveProgress(S.currentManga.id, S.chapterId, pg, S.readerTotal, S.currentChInfo);
  }
}

function updateReaderUI(cur, total) {
  const pg  = document.getElementById('readerPg');
  const trk = document.getElementById('readerTrack');
  if (pg)  pg.textContent = total > 0 ? `${cur} / ${total}` : '— / —';
  if (trk) trk.style.width = total > 0 ? `${Math.round((cur/total)*100)}%` : '0%';
}

function applyReaderMode() {
  const pages = document.getElementById('reader-pages');
  const btn   = document.getElementById('readerModeBtn');
  if (S.readerMode === 'h') {
    pages.classList.add('h-mode');
    if (btn) btn.textContent = 'Horizontal';
  } else {
    pages.classList.remove('h-mode');
    if (btn) btn.textContent = 'Vertical';
  }
}

window.toggleReaderMode = function() {
  S.readerMode = S.readerMode === 'v' ? 'h' : 'v';
  DB.saveCfg({ readerMode: S.readerMode });
  applyReaderMode();
};

// Tap center to toggle header/footer
document.getElementById('reader').addEventListener('click', function(e) {
  const h = document.getElementById('readerHeader');
  const f = document.getElementById('readerFooter');
  // Ignore if clicking a button
  if (e.target.closest('button')) return;
  S.uiHidden = !S.uiHidden;
  h.classList.toggle('hidden', S.uiHidden);
  f.classList.toggle('hidden', S.uiHidden);
});

/* ──── SEARCH ──── */
async function viewSearch(query) {
  const app = document.getElementById('app');
  if (!query.trim()) {
    app.innerHTML = emptyHTML('Digite algo para buscar.');
    return;
  }
  app.innerHTML = `
    <div class="page-title">🔍 "${esc(query)}"</div>
    <div class="sec"><div class="grid3">${skels(6)}</div></div>`;

  try {
    const d = await API.search(query);
    if (!d.data.length) {
      app.innerHTML = emptyHTML(`Sem resultados para "${esc(query)}".`);
      return;
    }
    app.querySelector('.grid3').innerHTML = d.data.map(m => cardHTML(m)).join('');
  } catch {
    app.innerHTML = errHTML('Erro na busca. Tente novamente.', `function(){viewSearch('${esc(query)}')}`);
  }
}

/* ──── FAVORITES ──── */
function viewFavoritos() {
  const favs = DB.favs();
  const app  = document.getElementById('app');
  app.innerHTML = `<div class="page-title">❤️ Favoritos</div>`;
  if (!favs.length) {
    app.innerHTML += emptyHTML('Você ainda não favoritou nada.');
    return;
  }
  app.innerHTML += `<div class="user-grid">${favs.map(savedCardHTML).join('')}</div>`;
}

/* ──── LISTA ──── */
function viewLista() {
  const list = DB.list();
  const app  = document.getElementById('app');
  app.innerHTML = `<div class="page-title">📋 Minha Lista</div>`;
  if (!list.length) {
    app.innerHTML += emptyHTML('Sua lista está vazia.');
    return;
  }
  app.innerHTML += `<div class="user-grid">${list.map(savedCardHTML).join('')}</div>`;
}

/* ──── HISTÓRICO ──── */
function viewHistorico() {
  const hist = DB.history();
  const app  = document.getElementById('app');
  app.innerHTML = `<div class="page-title">🕐 Histórico</div>`;
  if (!hist.length) {
    app.innerHTML += emptyHTML('Nenhuma leitura no histórico.');
    return;
  }
  app.innerHTML += `<div class="user-grid">${hist.map(savedCardHTML).join('')}</div>`;
}

function savedCardHTML(item) {
  const cv = item.cover;
  const t  = esc(item.title);
  const prog = DB.progress(item.id);
  const pct  = prog ? Math.round((prog.page/prog.total)*100) : 0;
  return `
    <a class="card" href="#" onclick="go('manga/${esc(item.id)}');return false">
      ${cv ? `<img src="${cv}" alt="${t}" loading="lazy" onerror="imgErr(this)">` : `<div class="no-img">${svgBook()}</div>`}
      <div class="card-foot"><div class="card-t">${t}</div></div>
      ${prog ? `<div class="card-prog"><div class="card-prog-fill" style="width:${pct}%"></div></div>` : ''}
    </a>`;
}

// ── 8. ROUTER ─────────────────────────────────
function go(route) {
  location.hash = '#/' + route;
}

function handleRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [route, ...rest] = hash.split('/');
  const id = rest.join('/');

  // Hide reader if navigating away
  if (route !== 'chapter') closeReader();

  // Update nav active states
  updateNav(route || 'home');

  switch (route) {
    case '':
    case 'home':
      viewHome();
      break;
    case 'lancamentos':
      viewLancamentos();
      break;
    case 'manga':
      if (id) viewMangaDetail(id);
      else viewCategory('manga');
      break;
    case 'manga-cat':
      viewCategory('manga');
      break;
    case 'manhwa':
      viewCategory('manhwa');
      break;
    case 'coloridos':
      viewCategory('coloridos');
      break;
    case '18':
      view18();
      break;
    case 'favoritos':
      viewFavoritos();
      break;
    case 'lista':
      viewLista();
      break;
    case 'historico':
      viewHistorico();
      break;
    case 'search':
      const q = decodeURIComponent(id || S.query);
      viewSearch(q);
      break;
    default:
      viewHome();
  }

  // Scroll main to top on route change
  window.scrollTo(0, 0);
}

// ── 9. NAV & SIDEBAR ─────────────────────────
function updateNav(route) {
  const base = route.replace(/^manga\/.*/, 'manga');

  document.querySelectorAll('.nav-link[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === base || (base === '' && el.dataset.route === 'home'));
  });
  document.querySelectorAll('.bnav-item[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === base || (base === '' && el.dataset.route === 'home'));
  });
}

window.sbOpen  = () => { document.body.classList.add('sb-open'); };
window.sbClose = () => { document.body.classList.remove('sb-open'); };

window.srchOpen = () => {
  document.body.classList.add('srch-open');
  setTimeout(() => document.getElementById('searchInput').focus(), 120);
};
window.srchClose = () => {
  document.body.classList.remove('srch-open');
  document.getElementById('searchInput').value = '';
};

// Swipe left to close sidebar
let _touchX = null;
document.getElementById('sidebar').addEventListener('touchstart', e => {
  _touchX = e.touches[0].clientX;
}, { passive: true });
document.getElementById('sidebar').addEventListener('touchend', e => {
  if (_touchX !== null && (_touchX - e.changedTouches[0].clientX) > 60) sbClose();
  _touchX = null;
}, { passive: true });

// Sidebar nav links
document.querySelectorAll('.nav-link[data-route]').forEach(btn => {
  btn.addEventListener('click', () => {
    sbClose();
    go(btn.dataset.route);
  });
});

// Bottom nav
document.querySelectorAll('.bnav-item[data-route]').forEach(btn => {
  btn.addEventListener('click', () => go(btn.dataset.route));
});

// Search submit
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const q = e.target.value.trim();
    if (q) {
      srchClose();
      S.query = q;
      go('search/' + encodeURIComponent(q));
    }
  }
});

// ESC closes overlays
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { sbClose(); srchClose(); }
});

// Lock body scroll when sidebar open
new MutationObserver(() => {
  document.body.style.overflow = document.body.classList.contains('sb-open') ? 'hidden' : '';
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// ── 10. INIT ──────────────────────────────────
window.addEventListener('hashchange', handleRoute);
window.addEventListener('load', handleRoute);

// Handle empty hash on first load
if (!location.hash) location.hash = '#/home';
