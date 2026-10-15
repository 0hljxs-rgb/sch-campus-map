import { SPECS, CODES, FLAT_PLACES, buildTreePoints, AMENITIES, AEDS, POIS, FLOORS, OUTDOOR } from './campus-data.js';

// ---------- geometry (same projection as the design canvas) ----------
const C = Math.cos(50 * Math.PI / 180), S = Math.sin(50 * Math.PI / 180);
const X = (v) => v - 357;
const Y = (v) => (v - 270) / C;
const PCX = 643, PCY = 797;                       // plane centre (transform origin)

const NAVY = '#1B2F5E', ACCENT = '#D9B14A', INK = '#141B2B';
const CATS = { a: NAVY, s: '#3D6FA8', d: '#B4673A', p: '#3F8060' };
const CAT_LABEL = { a: '강의·연구동', s: '행정·지원', d: '생활관', p: '체육시설' };
const WALL_A = '#FAFAF7', WALL_B = '#E2E6EC', WIN = 'rgba(118,148,188,0.55)';
const ICON = {
  store: '<path d="M6 8h12l-1.2 12H7.2L6 8z"></path><path d="M9 8a3 3 0 0 1 6 0"></path>',
  cafe: '<path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9z"></path><path d="M16 11h1.5a2 2 0 0 1 0 4H16"></path><path d="M8 3.5v2M11 3.5v2"></path>',
  bus: '<rect x="5" y="3" width="14" height="15" rx="2"></rect><path d="M5 11h14M8 21v-3M16 21v-3"></path>',
  gate: '<path d="M4 21V8l8-5 8 5v13"></path><path d="M9 21v-7h6v7"></path>',
  building: '<path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 21v-6h6v6"></path>',
  close: '<path d="M6 6l12 12M18 6L6 18"></path>',
};
const AED_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:13px;height:13px"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="#fff" stroke="none"></path><path d="M12.6 8.5l-2 3.2h2.2l-1.4 3" fill="none" stroke="#D93A3A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 1) { const k = f - 1; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= f; g *= f; b *= f; }
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

// WebKit (iOS) needs full-size 3D layers; Chromium (Android) prefers zero-size ones to save tile memory
if (/AppleWebKit/.test(navigator.userAgent) && !/Chrome|Android/.test(navigator.userAgent)) document.documentElement.classList.add('webkit');

// ---------- state ----------
const small = window.matchMedia('(max-width: 899px)').matches;
const HOME = { rot: -12, tilt: 52, zoom: small ? 0.42 : 0.9, panX: small ? 46 : 0, panY: small ? -30 : 0 };
const state = { ...HOME, names: !small, amen: true, sel: null, sheet: 'peek' };

// ---------- build data ----------
const buildings = [];   // {n, name, c, base, code, cx, cy, top, floors}
const masses = [];
SPECS.forEach(([n, name, c, parts]) => {
  const base = CATS[c];
  let top = 0;
  const add = (x1, x2, yt, yb, hs, zs, ground, unit) => {
    if (ground) { const ix = Math.min(3, (x2 - x1) / 5), iy = Math.min(3, (yb - yt) / 5); x1 += ix; x2 -= ix; yt += iy; yb -= iy; }
    masses.push({ n, base, unit, ground, x: X(x1), y: Y(yt), w: x2 - x1, d: (yb - yt) / C, h: hs / S, z: zs / S, tall: hs >= 12, sh: 3 + Math.min(10, hs * 0.12) });
  };
  parts.forEach(([x1, x2, yt, yb, hs, zs]) => { add(x1, x2, yt, yb, hs, zs || 0, !zs, false); top = Math.max(top, (zs || 0) + hs); });
  const [x1, x2, yt, yb, hs] = parts[0];
  if (parts.length === 1 && hs >= 18) {
    const cx = (x1 + x2) / 2, cy = (yt + yb) / 2, uw = (x2 - x1) * 0.28, ud = (yb - yt) * 0.4;
    add(cx - uw / 2, cx + uw / 2, cy - ud / 2, cy + ud / 2, 5, hs, false, true);
    top = hs + 5;
  }
  const bx1 = Math.min(...parts.map((q) => q[0])), bx2 = Math.max(...parts.map((q) => q[1]));
  const by1 = Math.min(...parts.map((q) => q[2])), by2 = Math.max(...parts.map((q) => q[3]));
  buildings.push({ n, name, c, base, code: CODES[n] || '', cx: X((bx1 + bx2) / 2), cy: Y((by1 + by2) / 2), z: top / S + 4 });
});
FLAT_PLACES.forEach(([n, name, px, py]) => buildings.push({ n, name, c: 'p', base: CATS.p, code: CODES[n] || '', cx: X(px), cy: Y(py), z: 2 }));
buildings.forEach((b) => {
  const f = FLOORS[b.n];
  b.floors = f || null;
  b.short = f ? (f[0] ? 'B' + f[0] + ' · ' : '') + f[1] + 'F' : '야외';
  b.amen = AMENITIES.filter((a) => a[2].startsWith(b.name.replace('관', '').slice(0, 3)) || a[2].includes(b.name));
});

// ---------- render map (once) ----------
const $ = (id) => document.getElementById(id);
const plane = $('plane'), map = $('map');

function massHTML(m) {
  const on = !m.unit && state.sel === m.n;
  const top = m.unit ? null : (on ? ACCENT : m.base);
  const ns = (m.tall ? `repeating-linear-gradient(90deg, ${WALL_A} 0 3px, transparent 3px 8px), repeating-linear-gradient(180deg, ${WALL_A} 0 5px, ${WIN} 5px 8px), ` : '');
  const ew = (m.tall ? `repeating-linear-gradient(180deg, ${WALL_B} 0 3px, transparent 3px 8px), repeating-linear-gradient(90deg, ${WALL_B} 0 5px, ${WIN} 5px 8px), ` : '');
  const bgNS = `linear-gradient(180deg, rgba(255,255,255,0) 55%, rgba(16,26,48,0.14) 100%), ${ns}linear-gradient(${WALL_A}, ${WALL_A})`;
  const bgEW = `linear-gradient(90deg, rgba(255,255,255,0) 55%, rgba(16,26,48,0.18) 100%), ${ew}linear-gradient(${WALL_B}, ${WALL_B})`;
  const roof = m.unit ? 'linear-gradient(135deg, #9AA3B0, #7C8696)' : `linear-gradient(135deg, ${shade(top, 1.22)} 0%, ${top} 70%)`;
  const rim = m.unit ? '#B4BBC6' : shade(top, 1.4);
  const { w, d, h } = m;
  return `<div class="mass" data-n="${m.unit ? '' : m.n}" style="left:${m.x}px;top:${m.y}px;width:${w}px;height:${d}px;transform:translateZ(${m.z}px)">` +
    (m.ground ? `<div class="sh" style="left:${m.sh}px;top:${m.sh}px;width:${w}px;height:${d}px;background:rgba(20,30,50,0.22)"></div>` : '') +
    `<div class="ns" style="left:0;top:${-h}px;width:${w}px;height:${h}px;background:${bgNS}"></div>` +
    `<div class="ew" style="left:${-h}px;top:0;width:${h}px;height:${d}px;background:${bgEW}"></div>` +
    `<div class="ew" style="left:${w - h}px;top:0;width:${h}px;height:${d}px;background:${bgEW}"></div>` +
    `<div class="ns" style="left:0;top:${d - h}px;width:${w}px;height:${h}px;background:${bgNS}"></div>` +
    `<div class="roof" data-roof="${m.unit ? '' : m.n}" style="width:${w}px;height:${d}px;border:1.5px solid ${rim};background:${roof};transform:translateZ(${h}px)"></div></div>`;
}

function renderStatic() {
  // trees
  const greens = [['#9CCB8B', '#5E9A57'], ['#A8D295', '#6AA562'], ['#8FC17E', '#548E4E'], ['#B2D89F', '#73AC69']];
  $('layer-trees').innerHTML = buildTreePoints().map(([ix, iy, cf], i) => {
    const sz = 11 + Math.round(Math.abs(Math.sin(i * 7.3)) * 5);
    const conifer = cf || (ix > 1380 && iy > 940);
    const x = X(ix), y = Y(iy);
    const g = conifer ? ['#7FB07A', '#3F7444'] : greens[i % 4];
    const ch = Math.round(sz * (conifer ? 1.7 : 1.12));
    const shape = conifer ? '50% 50% 40% 40% / 70% 70% 30% 30%' : '50% 50% 46% 46%';
    return `<div class="tsh" style="left:${x - sz / 2 + 4}px;top:${y - sz / 4 + 3}px;width:${sz * 1.1}px;height:${sz / 2}px"></div>` +
      `<div class="bb tree" style="left:${x}px;top:${y}px"><div class="trunk"></div><div class="crown" style="left:${-sz / 2}px;width:${sz}px;height:${ch}px;border-radius:${shape};background:radial-gradient(circle at 35% 30%, ${g[0]} 0%, ${g[1]} 85%)"></div></div>`;
  }).join('');
  renderBuildings();
  // markers
  const pois = POIS.map(([px, py, k]) => k === 'bus'
    ? `<div class="bb" style="left:${X(px)}px;top:${Y(py)}px"><div class="in"><div class="bus" role="img" aria-label="버스 정류장"><span>${svg('bus')}</span></div><div class="stem"></div></div></div>`
    : `<div class="bb" style="left:${X(px)}px;top:${Y(py)}px"><div class="in"><div class="gate">${svg('gate')}${esc(k)}</div><div class="stem"></div></div></div>`).join('');
  const amen = AMENITIES.map(([k, label, where, px, py]) =>
    `<div class="bb amen" style="left:${X(px)}px;top:${Y(py)}px;--z:3px"><div class="in"><div class="mk" role="img" aria-label="${esc(label + ' · ' + where)}"><span class="ic" style="background:${k === 'store' ? '#1F8A5B' : '#9A5B34'}">${svg(k)}</span>${esc(label)}</div></div></div>`).join('');
  const aed = AEDS.map(([label, where, px, py]) =>
    `<div class="bb" style="left:${X(px)}px;top:${Y(py)}px;--z:4px"><div class="in"><div class="mk aed" role="img" aria-label="자동심장충격기 · ${esc(label)}"><span class="ic">${AED_SVG}</span>AED</div></div></div>`).join('');
  const chips = buildings.map((b) =>
    `<div class="bb" style="left:${b.cx}px;top:${b.cy}px;--z:${b.z}px"><div class="in"><button type="button" class="chip${b.code ? '' : ' nocode'}" data-n="${b.n}" aria-label="${esc(b.name)} 정보 보기">` +
    (b.code ? `<span class="code mono" style="background:${b.base}">${esc(b.code)}</span>` : '') +
    `<span class="name">${esc(b.name)}</span></button><div class="tip"></div></div></div>`).join('');
  $('layer-markers').innerHTML = pois + amen + aed + chips;
}
function renderBuildings() { $('layer-buildings').innerHTML = masses.map(massHTML).join(''); }

// ---------- view ----------
function applyView(animate) {
  plane.classList.toggle('anim', !!animate);
  const flat = !state.tilt;
  const sc = state.zoom * (flat ? 0.7 : 1);
  plane.style.transform = `translate(${state.panX}px, ${state.panY}px) rotateX(${state.tilt}deg) rotateZ(${state.rot}deg) scale(${sc})`;
  const k = clamp(0.8 / sc, 1, 2.2);   // keep labels a constant, readable size
  map.classList.toggle('far', sc < 0.7);
  plane.style.setProperty('--bill', `rotateZ(${-state.rot}deg) rotateX(${-state.tilt}deg) scale(${k})`);
  $('compass').style.transform = `rotate(${state.rot}deg)`;
  $('btn-tilt').textContent = flat ? '3D' : '2D';
}
function applyLabels() {
  document.querySelectorAll('.chip').forEach((el) => {
    const n = +el.dataset.n;
    el.classList.toggle('on', state.sel === n);
    el.classList.toggle('compact', !state.names);
  });
  $('btn-names').classList.toggle('on', state.names);
  $('btn-names').setAttribute('aria-pressed', state.names);
  map.classList.toggle('no-amen', !state.amen);
  $('btn-amen').classList.toggle('on', state.amen);
  $('btn-amen').setAttribute('aria-pressed', state.amen);
}

// project a plane point to screen offset from stage centre (ignores perspective; good enough to centre)
function project(px, py) {
  const flat = !state.tilt;
  const sc = state.zoom * (flat ? 0.7 : 1);
  const r = state.rot * Math.PI / 180, t = state.tilt * Math.PI / 180;
  const dx = (px - PCX) * sc, dy = (py - PCY) * sc;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: (dx * Math.sin(r) + dy * Math.cos(r)) * Math.cos(t) };
}

// ---------- selection & sheet ----------
function select(n, { focus = true } = {}) {
  state.sel = state.sel === n && !focus ? null : n;
  renderBuildings();
  applyLabels();
  renderSheet();
  if (state.sel != null && focus) {
    const b = buildings.find((q) => q.n === state.sel);
    if (state.zoom < 0.8) state.zoom = 0.8;
    const p = project(b.cx, b.cy);
    state.panX = -p.x; state.panY = -p.y - (small ? 150 : 0);
    applyView(true);
    setSheet('peek');
  }
}

function setSheet(mode) {
  state.sheet = mode;
  const el = $('sheet');
  el.classList.toggle('half', mode === 'half');
  el.classList.toggle('full', mode === 'full');
  $('sheet-handle').setAttribute('aria-label', mode === 'peek' ? '목록 펼치기' : '목록 접기');
}

function renderSheet() {
  const b = buildings.find((q) => q.n === state.sel);
  $('sheet').classList.toggle('has-sel', !!b);
  $('selected').innerHTML = b ? (() => {
    const f = b.floors;
    const here = AMENITIES.filter((a) => a[2].replace(/\s.*$/, '') === b.name || a[2].startsWith(b.name));
    const aed = AEDS.filter((a) => a[0] === b.name);
    return `<article class="card"><div class="band" style="background:${b.base}"></div><div class="body">
      <div class="head"><div><div class="meta">${b.code ? `<span class="code mono">${esc(b.code)}</span>` : ''}${CAT_LABEL[b.c]}</div><h2>${esc(b.name)}</h2></div>
      <button type="button" class="close" data-act="clear" aria-label="선택 해제">${svg('close')}</button></div>
      ${f ? `<div class="tiles"><div class="tile"><small>지상</small><b>${f[1]}<em>층</em></b></div><div class="tile"><small>지하</small><b>${f[0]}<em>층</em></b></div></div>`
          : `<div class="tile" style="font-size:15px;font-weight:600">${esc(OUTDOOR[b.n] || '정보 없음')}</div>`}
      ${(here.length || aed.length) ? `<div class="here">${here.map((a) => `<span><i style="background:${a[0] === 'store' ? '#1F8A5B' : '#9A5B34'}"></i>${esc(a[1])} · ${esc(a[2].split(' ').slice(1).join(' ') || '')}</span>`).join('')}${aed.map(() => '<span><i style="background:#D93A3A"></i>AED</span>').join('')}</div>` : ''}
    </div></article>`;
  })() : `<div class="hint"><div class="ico">${svg('building')}</div><div><b>건물을 선택하세요</b><span>지도 이름표를 누르거나 목록을 펼쳐 보세요.</span></div></div>`;

  const groups = ['a', 's', 'd', 'p'].map((c) => {
    const items = buildings.filter((q) => q.c === c);
    return `<section class="group"><h3><i style="background:${CATS[c]}"></i>${CAT_LABEL[c]}</h3>` + items.map((q) =>
      `<button type="button" class="row${state.sel === q.n ? ' on' : ''}" data-n="${q.n}"><span class="badge mono" style="background:${q.code ? (state.sel === q.n ? ACCENT : q.base) : '#EEF1F5'};color:${q.code ? (state.sel === q.n ? INK : '#fff') : '#8A93A2'}">${esc(q.code || '·')}</span><span class="nm">${esc(q.name)}</span><span class="sub mono">${q.short}</span></button>`).join('') + '</section>';
  }).join('');
  const amen = `<section class="group"><h3><i style="background:#1F8A5B"></i>편의점 · 카페</h3>` + AMENITIES.map(([k, label, where]) =>
    `<div class="row" style="cursor:default"><span class="badge" style="background:${k === 'store' ? '#1F8A5B' : '#9A5B34'}">${svg(k)}</span><span class="nm">${esc(label)}</span><span class="sub">${esc(where)}</span></div>`).join('') + '</section>';
  const aed = `<section class="group"><h3><i style="background:#D93A3A"></i>자동심장충격기 (AED)</h3>` + AEDS.map(([label, where]) =>
    `<div class="row" style="cursor:default"><span class="badge" style="background:#D93A3A">${AED_SVG}</span><span class="nm" style="font-weight:600">${esc(label)}</span><span class="sub">${esc(where)}</span></div>`).join('') +
    '<p class="note">국가 AED 등록 정보 기준이라 미등록 기기는 표시되지 않아요.</p></section>';
  $('directory').innerHTML = groups + amen + aed;
}

// ---------- search ----------
function runSearch() {
  const q = $('search').value.trim().toLowerCase();
  $('search-clear').hidden = !q;
  const box = $('results');
  if (!q) { box.hidden = true; box.innerHTML = ''; return; }
  const hits = buildings.filter((b) => b.name.toLowerCase().includes(q) || (b.code && b.code.toLowerCase() === q) || (b.code && q.startsWith(b.code.toLowerCase()) && /^[a-z]*\d/.test(q)));
  box.hidden = false;
  box.innerHTML = hits.length ? hits.slice(0, 12).map((b) =>
    `<li><button type="button" data-n="${b.n}"><span class="badge mono" style="min-width:36px;height:26px;padding:0 6px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;background:${b.code ? b.base : '#EEF1F5'};color:${b.code ? '#fff' : '#8A93A2'}">${esc(b.code || '·')}</span><span style="flex:1;font-size:15px">${esc(b.name)}</span><span class="mono" style="font-size:12.5px;color:#8A93A2">${b.short}</span></button></li>`).join('')
    : '<li class="empty">일치하는 건물이 없어요. 건물 이름이나 강의실 코드(예: U, 9, ML)로 찾아보세요.</li>';
}

// ---------- gestures ----------
const pointers = new Map();
let gesture = null, moved = false;
map.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  map.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = false;
  startGesture();
});
map.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const pts = [...pointers.values()];
  if (!gesture) return;
  if (pts.length === 1 && gesture.n === 1) {
    const dx = pts[0].x - gesture.x0, dy = pts[0].y - gesture.y0;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    state.panX = gesture.panX + dx; state.panY = gesture.panY + dy;
  } else if (pts.length >= 2 && gesture.n === 2) {
    const [a, b] = pts;
    const dist = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    state.zoom = clamp(gesture.zoom * dist / gesture.dist, 0.4, 2.4);
    state.rot = gesture.rot + (ang - gesture.ang) * 180 / Math.PI;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    state.panX = gesture.panX + (mx - gesture.mx); state.panY = gesture.panY + (my - gesture.my);
    moved = true;
  }
  applyView(false);
});
const endPointer = (e) => { pointers.delete(e.pointerId); startGesture(); };
map.addEventListener('pointerup', endPointer);
map.addEventListener('pointercancel', endPointer);
function startGesture() {
  const pts = [...pointers.values()];
  if (pts.length === 1) gesture = { n: 1, x0: pts[0].x, y0: pts[0].y, panX: state.panX, panY: state.panY };
  else if (pts.length >= 2) {
    const [a, b] = pts;
    gesture = { n: 2, dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x), zoom: state.zoom, rot: state.rot, panX: state.panX, panY: state.panY, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  } else gesture = null;
}
map.addEventListener('wheel', (e) => { e.preventDefault(); state.zoom = clamp(state.zoom * (e.deltaY < 0 ? 1.08 : 0.92), 0.4, 2.4); applyView(false); }, { passive: false });
let lastTap = 0;
map.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) { select(+chip.dataset.n); return; }
  if (moved) return;
  const roof = e.target.closest('[data-n]');
  if (roof && roof.dataset.n) { select(+roof.dataset.n); return; }
  const now = Date.now();
  if (now - lastTap < 300) { state.zoom = clamp(state.zoom * 1.4, 0.4, 2.4); applyView(true); }
  lastTap = now;
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- sheet drag ----------
(() => {
  const handle = $('sheet-handle'), sheet = $('sheet');
  let y0 = null, t0 = 0, base = 0;
  const offset = () => { const m = new DOMMatrix(getComputedStyle(sheet).transform); return m.m42; };
  handle.addEventListener('pointerdown', (e) => { y0 = e.clientY; t0 = Date.now(); base = offset(); sheet.classList.add('dragging'); handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', (e) => { if (y0 == null) return; sheet.style.transform = `translateY(${Math.max(0, base + e.clientY - y0)}px)`; });
  handle.addEventListener('pointerup', (e) => {
    if (y0 == null) return;
    const dy = e.clientY - y0, fast = Date.now() - t0 < 250;
    sheet.classList.remove('dragging'); sheet.style.transform = '';
    const order = ['peek', 'half', 'full'], i = order.indexOf(state.sheet);
    if (Math.abs(dy) < 6) setSheet(state.sheet === 'peek' ? 'half' : 'peek');
    else if (dy < 0) setSheet(order[Math.min(2, i + (fast || dy < -160 ? (dy < -320 ? 2 : 1) : 1))]);
    else setSheet(order[Math.max(0, i - (dy > 320 ? 2 : 1))]);
    y0 = null;
  });
})();

// ---------- wiring ----------
$('btn-reset').addEventListener('click', () => { Object.assign(state, HOME); applyView(true); });
$('btn-tilt').addEventListener('click', () => { state.tilt = state.tilt ? 0 : 52; applyView(true); });
$('btn-names').addEventListener('click', () => { state.names = !state.names; applyLabels(); });
$('btn-amen').addEventListener('click', () => { state.amen = !state.amen; applyLabels(); });
$('search').addEventListener('input', runSearch);
$('search-clear').addEventListener('click', () => { $('search').value = ''; runSearch(); $('search').focus(); });
$('results').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-n]');
  if (!btn) return;
  $('search').value = ''; runSearch(); $('search').blur();
  select(+btn.dataset.n);
});
$('sheet-body').addEventListener('click', (e) => {
  if (e.target.closest('[data-act="clear"]')) { select(state.sel, { focus: false }); return; }
  const row = e.target.closest('.row[data-n]');
  if (row) select(+row.dataset.n);
});

renderStatic();
applyView(false);
applyLabels();
renderSheet();

// 웹앱(홈 화면 추가)으로 열렸을 때 오프라인 동작을 위해 서비스 워커 등록 (네이티브 앱 안에서는 필요 없음)
if ('serviceWorker' in navigator && !window.Capacitor && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
