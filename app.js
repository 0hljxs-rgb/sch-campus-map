import { SPECS, CODES, FLAT_PLACES, buildTreePoints, AMENITIES, AEDS, SMOKING, POIS, FLOORS, OUTDOOR } from './campus-data.js';

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
const FIRE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:12px;height:12px;stroke:none"><path fill="#fff" d="M12.2 2.5c.6 3.3 4.8 5.2 4.8 10a5 5 0 0 1-10 0c0-2.3 1.1-3.8 2.3-4.9.1 1.7.9 2.8 2 3.2-.5-3.1-.1-5.9.9-8.3z"/></svg>';
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
const HOME = { rot: -12, tilt: 52, zoom: small ? 0.42 : 0.9, panX: 0, panY: 0 };   // fitHome()이 화면 크기에 맞춰 다시 계산
let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) { /* 저장소를 못 쓰는 환경 */ }
const state = { ...HOME, names: !small, amen: true, sel: null, sheet: 'peek',
  dark: savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches };
const STORE_BLUE = '#1C6ED8', CAFE_BROWN = '#9A5B34';

// ---------- build data ----------
const buildings = [];   // {n, name, c, base, code, cx, cy, top, floors}
const masses = [];
SPECS.forEach(([n, name, c, parts]) => {
  const base = CATS[c];
  let top = 0;
  const add = (x1, x2, yt, yb, hs, zs, ground, unit) => {
    if (ground) { const ix = Math.min(3, (x2 - x1) / 5), iy = Math.min(3, (yb - yt) / 5); x1 += ix; x2 -= ix; yt += iy; yb -= iy; }
    masses.push({ n, base, unit, ground, x: X(x1), y: Y(yt), w: x2 - x1, d: (yb - yt) / C, h: hs / S, z: zs / S, tall: hs >= 12, sh: 4 + Math.min(18, hs * 0.3) });
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
  const dk = state.dark, dim = state.sel != null;
  const on = !m.unit && state.sel === m.n;
  // 크림색 벽·지붕, 건물 종류는 지붕 테두리 색으로만 구분 (다크 모드: 어두운 벽 + 불 켜진 창문)
  const WA = dk ? '#3A404B' : '#FBF9F4', WB = dk ? '#2B3039' : '#E2DCD0', WN = dk ? 'rgba(255,206,120,0.55)' : 'rgba(128,138,152,0.26)';
  const AO = dk ? ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.35)'] : ['rgba(70,58,40,0.16)', 'rgba(70,58,40,0.22)'];
  const ns = (m.tall ? `repeating-linear-gradient(90deg, ${WA} 0 3px, transparent 3px 8px), repeating-linear-gradient(180deg, ${WA} 0 5px, ${WN} 5px 8px), ` : '');
  const ew = (m.tall ? `repeating-linear-gradient(180deg, ${WB} 0 3px, transparent 3px 8px), repeating-linear-gradient(90deg, ${WB} 0 5px, ${WN} 5px 8px), ` : '');
  const bgNS = `linear-gradient(180deg, rgba(255,255,255,0) 50%, ${AO[0]} 100%), ${ns}linear-gradient(${WA}, ${WA})`;
  const bgEW = `linear-gradient(90deg, rgba(255,255,255,0) 45%, ${AO[1]} 100%), ${ew}linear-gradient(${WB}, ${WB})`;
  const roof = m.unit ? (dk ? 'linear-gradient(135deg, #353B45, #2B3039)' : 'linear-gradient(135deg, #EEEAE2, #DCD6CB)')
    : on ? `linear-gradient(135deg, ${shade(ACCENT, 1.15)} 0%, ${ACCENT} 80%)`
    : dk ? (dim ? 'linear-gradient(135deg, #2E333C, #262A32)' : 'linear-gradient(135deg, #4A515D 0%, #3B414C 80%)')
    : (dim ? 'linear-gradient(135deg, #F7F5F0, #ECE8E0)' : 'linear-gradient(135deg, #FFFDF8 0%, #F1ECE2 80%)');
  const rim = m.unit ? (dk ? '#454C58' : '#D3CCBF') : on ? shade(ACCENT, 0.8) : (dim ? shade(m.base, dk ? 0.7 : 1.75) : shade(m.base, dk ? 1.35 : 1.15));
  const { w, d, h } = m;
  return `<div class="mass" data-n="${m.unit ? '' : m.n}" style="left:${m.x}px;top:${m.y}px;width:${w}px;height:${d}px;transform:translateZ(${m.z}px)">` +
    (m.ground ? `<div class="sh" style="left:${m.sh}px;top:${m.sh}px;width:${w}px;height:${d}px;background:${state.dark ? 'rgba(0,0,0,0.42)' : 'rgba(80,66,44,0.2)'}"></div>` : '') +
    `<div class="ns" style="left:0;top:${-h}px;width:${w}px;height:${h}px;background:${bgNS}"></div>` +
    `<div class="ew" style="left:${-h}px;top:0;width:${h}px;height:${d}px;background:${bgEW}"></div>` +
    `<div class="ew" style="left:${w - h}px;top:0;width:${h}px;height:${d}px;background:${bgEW}"></div>` +
    `<div class="ns" style="left:0;top:${d - h}px;width:${w}px;height:${h}px;background:${bgNS}"></div>` +
    `<div class="roof" data-roof="${m.unit ? '' : m.n}" style="width:${w}px;height:${d}px;border:2px solid ${rim};background:${roof};transform:translateZ(${h}px)"></div></div>`;
}

function renderStatic() {
  // trees
  const dk = state.dark;
  const greens = dk ? [['#4E6A4C', '#2C4030'], ['#486447', '#283B2B'], ['#557253', '#30462F'], ['#435E43', '#263826']] : [['#BDD0A4', '#7C9970'], ['#B1C798', '#718F64'], ['#C6D8AE', '#86A276'], ['#AABF8F', '#6A895D']];
  $('ground').src = dk ? 'assets/ground-dark.svg' : 'assets/ground.svg';
  $('layer-trees').innerHTML = buildTreePoints().filter((q, i) => q[2] || i % 3 !== 1).map(([ix, iy, cf], i) => {
    const sz = 13 + Math.round(Math.abs(Math.sin(i * 7.3)) * 6);
    const conifer = cf || (ix > 1380 && iy > 940);
    const x = X(ix), y = Y(iy);
    const g = conifer ? (dk ? ['#3F5A43', '#22362A'] : ['#97B189', '#56734F']) : greens[i % 4];
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
    `<div class="bb amen" style="left:${X(px)}px;top:${Y(py)}px;--z:3px"><div class="in"><div class="mk" role="img" aria-label="${esc(label + ' · ' + where)}"><span class="ic" style="background:${k === 'store' ? STORE_BLUE : CAFE_BROWN}">${svg(k)}</span><span class="t">${esc(label)}</span></div></div></div>`).join('');
  const smoke = SMOKING.map(([label, px, py]) =>
    `<div class="smz" style="left:${X(px) - 12}px;top:${Y(py) - 12}px"></div>` +
    `<div class="bb" style="left:${X(px)}px;top:${Y(py)}px;--z:3px"><div class="in"><div class="mk smk" role="img" aria-label="흡연구역 · 화재 위험 · ${esc(label)}"><span class="ic">${FIRE_SVG}</span><span class="t">흡연구역</span></div></div></div>`).join('');
  const chips = buildings.map((b) =>
    `<div class="bb" style="left:${b.cx}px;top:${b.cy}px;--z:${b.z}px"><div class="in"><button type="button" class="chip${b.code ? '' : ' nocode'}" data-n="${b.n}" aria-label="${esc(b.name)} 정보 보기">` +
    (b.code ? `<span class="code mono" style="background:${b.base}">${esc(b.code)}</span>` : '') +
    `<span class="name">${esc(b.name)}</span>` +
    (AEDS.some((a) => a[0] === b.name) ? `<span class="aedb" role="img" aria-label="자동심장충격기(AED) 있음">${AED_SVG}AED</span>` : '') +
    `</button><div class="tip"></div></div></div>`).join('');
  $('layer-markers').innerHTML = smoke + pois + amen + chips;
  scheduleDeclutter();
}
function renderBuildings() { $('layer-buildings').innerHTML = masses.map(massHTML).join(''); }

// ---------- view ----------
function applyView(animate) {
  plane.classList.toggle('anim', !!animate);
  const flat = !state.tilt;
  const sc = state.zoom * (flat ? 0.7 : 1);
  plane.style.transform = `translate(${state.panX}px, ${state.panY}px) rotateX(${state.tilt}deg) rotateZ(${state.rot}deg) scale3d(${sc}, ${sc}, ${sc})`;   // 높이(z)도 같이 줄여 건물·땅 비율 고정
  // 이름표 크기: 확대하면 일정한 크기, 휴대폰에서 많이 축소하면 지도와 함께 작아져 비율이 덜 깨지게
  const k = small ? clamp(0.62 / sc, 1, 1.75) : clamp(0.8 / sc, 1, 2.2);
  map.classList.toggle('far', sc < 0.7);
  map.classList.toggle('near', sc >= 1.1);   // 충분히 확대했을 때만 편의점·흡연구역 글자 표시
  plane.style.setProperty('--bill', `rotateZ(${-state.rot}deg) rotateX(${-state.tilt}deg) scale(${k})`);
  plane.style.setProperty('--bill-tree', `rotateZ(${-state.rot}deg) rotateX(${-state.tilt}deg)`);   // 나무는 지도와 함께 커지고 작아짐
  $('compass').style.transform = `rotate(${state.rot}deg)`;
  $('btn-tilt').textContent = flat ? '3D' : '2D';
  scheduleDeclutter(animate ? 650 : 0);
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
  scheduleDeclutter();
}

// ---------- label declutter: 화면에서 겹치는 이름표는 코드만 남기거나 숨김 ----------
let dcRaf = 0, dcTimer = 0;
function scheduleDeclutter(delay) {
  cancelAnimationFrame(dcRaf); clearTimeout(dcTimer);
  dcRaf = requestAnimationFrame(declutter);
  if (delay) dcTimer = setTimeout(declutter, delay);
}
function declutter() {
  const layer = $('layer-markers');
  if (!layer) return;
  const chips = [...layer.querySelectorAll('.chip')];
  const mks = [...layer.querySelectorAll('.mk')];
  chips.forEach((el) => { el.classList.remove('squeeze'); el.closest('.bb').classList.remove('hid'); });
  mks.forEach((el) => { el.classList.remove('dot'); el.parentElement.style.translate = ''; el.closest('.bb').classList.remove('hid'); });
  const placed = [];
  const PAD = 3;
  const hit = (r) => placed.some((q) => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t);
  const box = (rc) => ({ l: rc.left - PAD, r: rc.right + PAD, t: rc.top - PAD, b: rc.bottom + PAD });
  // 정문·후문 표지판은 항상 우선
  layer.querySelectorAll('.gate, .mk.aed').forEach((el) => { const rc = el.getBoundingClientRect(); if (rc.width) placed.push(box(rc)); });
  const dotBox = (rc, dx = 0, dy = 0) => { const cx = (rc.left + rc.right) / 2 + dx, hw = rc.height / 2; return { l: cx - hw - PAD, r: cx + hw + PAD, t: rc.top + dy - PAD, b: rc.bottom + dy - (-PAD) }; };
  const info = chips.map((el) => {
    const n = +el.dataset.n, b = buildings.find((q) => q.n === n);
    return { el, n, rc: el.getBoundingClientRect(), code: el.querySelector('.code'), pri: (state.sel === n ? 1e6 : 0) + (b.code ? 1e4 : 0) + b.z };
  }).filter((o) => o.rc.width).sort((a, b) => b.pri - a.pri);
  info.forEach(({ el, n, rc, code }) => {
    const r = box(rc);
    if (state.sel === n || !hit(r)) { placed.push(r); return; }
    if (code && !el.classList.contains('compact')) {
      const s = rc.width / el.offsetWidth, cw = (code.offsetWidth + 8) * s, cx = (rc.left + rc.right) / 2;
      const rr = { l: cx - cw / 2 - PAD, r: cx + cw / 2 + PAD, t: r.t, b: r.b };
      if (!hit(rr)) { el.classList.add('squeeze'); placed.push(rr); return; }
    }
    el.closest('.bb').classList.add('hid');
  });
  // 흡연구역(숨기지 않음): 글자 자리가 있으면 표시 → 없으면 아이콘만 → 그래도 겹치면 아이콘을 옆 빈자리로 살짝 이동
  mks.filter((el) => el.classList.contains('smk')).map((el) => ({ el, rc: el.getBoundingClientRect() })).filter((o) => o.rc.width).forEach(({ el, rc }) => {
    const r = box(rc);
    if (!hit(r)) { placed.push(r); return; }
    el.classList.add('dot');
    const h = rc.height, sc = rc.height / el.offsetHeight;
    const tries = [[0, 0], [-h - 4, 0], [h + 4, 0], [0, h + 4], [-h - 4, h + 4], [h + 4, h + 4], [0, -h - 4], [-2 * h - 8, 0], [2 * h + 8, 0]];
    const best = tries.find(([dx, dy]) => !hit(dotBox(rc, dx, dy)));
    if (!best) { el.closest('.bb').classList.add('hid'); return; }   // 자리가 없으면 바닥의 빗금 구역만 보임
    if (best[0] || best[1]) el.parentElement.style.translate = `${best[0] / sc}px ${best[1] / sc}px`;
    placed.push(dotBox(rc, best[0], best[1]));
  });
  // 편의점·카페: 겹치면 아이콘만, 그래도 겹치면 숨김
  mks.filter((el) => el.classList.contains('amen') || el.closest('.amen')).map((el) => ({ el, rc: el.getBoundingClientRect() })).filter((o) => o.rc.width)
    .forEach(({ el, rc }) => {
      const r = box(rc);
      if (!hit(r)) { placed.push(r); return; }
      const ic = dotBox(rc);
      if (!hit(ic)) { el.classList.add('dot'); placed.push(ic); return; }
      el.closest('.bb').classList.add('hid');
    });
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
      ${(here.length || aed.length) ? `<div class="here">${here.map((a) => `<span><i style="background:${a[0] === 'store' ? STORE_BLUE : CAFE_BROWN}"></i>${esc(a[1])} · ${esc(a[2].split(' ').slice(1).join(' ') || '')}</span>`).join('')}${aed.map(() => '<span><i style="background:#D93A3A"></i>AED</span>').join('')}</div>` : ''}
    </div></article>`;
  })() : `<div class="hint"><div class="ico">${svg('building')}</div><div><b>건물을 선택하세요</b><span>지도 이름표를 누르거나 목록을 펼쳐 보세요.</span></div></div>`;

  const groups = ['a', 's', 'd', 'p'].map((c) => {
    const items = buildings.filter((q) => q.c === c);
    return `<section class="group"><h3><i style="background:${CATS[c]}"></i>${CAT_LABEL[c]}</h3>` + items.map((q) =>
      `<button type="button" class="row${state.sel === q.n ? ' on' : ''}" data-n="${q.n}"><span class="badge mono" style="background:${q.code ? (state.sel === q.n ? ACCENT : q.base) : 'var(--soft)'};color:${q.code ? (state.sel === q.n ? INK : '#fff') : 'var(--faint)'}">${esc(q.code || '·')}</span><span class="nm">${esc(q.name)}</span><span class="sub mono">${q.short}</span></button>`).join('') + '</section>';
  }).join('');
  const amen = `<section class="group"><h3><i style="background:${STORE_BLUE}"></i>편의점(GS25) · 카페</h3>` + AMENITIES.map(([k, label, where]) =>
    `<div class="row" style="cursor:default"><span class="badge" style="background:${k === 'store' ? STORE_BLUE : CAFE_BROWN}">${svg(k)}</span><span class="nm">${esc(label)}</span><span class="sub">${esc(where)}</span></div>`).join('') + '</section>';
  const aed = `<section class="group"><h3><i style="background:#D93A3A"></i>자동심장충격기 (AED)</h3>` + AEDS.map(([label, where]) =>
    `<div class="row" style="cursor:default"><span class="badge" style="background:#D93A3A">${AED_SVG}</span><span class="nm" style="font-weight:600">${esc(label)}</span><span class="sub">${esc(where)}</span></div>`).join('') +
    '<p class="note">국가 AED 등록 정보 기준이라 미등록 기기는 표시되지 않아요.</p></section>';
  const smk = `<section class="group"><h3><i style="background:#E0531F"></i>흡연구역 · 화재 위험구역</h3>` + SMOKING.map(([label]) =>
    `<div class="row" style="cursor:default"><span class="badge" style="background:#E0531F">${FIRE_SVG}</span><span class="nm">흡연구역</span><span class="sub">${esc(label)}</span></div>`).join('') +
    '<p class="note">흡연구역 주변은 화재 위험구역이에요. 꽁초는 반드시 끄고 재떨이에 버려 주세요.</p></section>';
  $('directory').innerHTML = groups + amen + aed + smk;
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
    `<li><button type="button" data-n="${b.n}"><span class="badge mono" style="min-width:36px;height:26px;padding:0 6px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;background:${b.code ? b.base : 'var(--soft)'};color:${b.code ? '#fff' : 'var(--faint)'}">${esc(b.code || '·')}</span><span style="flex:1;font-size:15px">${esc(b.name)}</span><span class="mono" style="font-size:12.5px;color:var(--faint)">${b.short}</span></button></li>`).join('')
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
map.addEventListener('wheel', (e) => { e.preventDefault(); state.zoom = clamp(state.zoom * (e.deltaY < 0 ? 1.08 : 0.92), 0.25, 2.4); applyView(false); }, { passive: false });
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

// ---------- 화면 크기에 맞춰 캠퍼스 전체가 보이게 시작 시점 계산 ----------
function fitHome() {
  const vw = map.clientWidth, vh = map.clientHeight;
  const sh = $('sheet').getBoundingClientRect(), tb = $('topbar').getBoundingClientRect(), ct = $('controls').getBoundingClientRect();
  const side = sh.height < vh * 0.97 && sh.top < vh * 0.3;          // 시트가 옆에 붙는 배치(PC·가로 화면)
  const box = {
    l: side && sh.left < vw / 2 ? sh.right + 8 : 8,
    r: (side && sh.left >= vw / 2 ? sh.left - 8 : vw - 8) - (small ? 0 : ct.width + 10),
    t: tb.bottom + 6,
    b: side ? vh - 8 : Math.min(vh, sh.top) - 6,
  };
  if (box.r - box.l < 120 || box.b - box.t < 120) return;
  Object.assign(state, { rot: HOME.rot, tilt: HOME.tilt, zoom: 1, panX: 0, panY: 0 });
  let fb = $('fitbox');
  if (!fb) {   // 캠퍼스 영역(건물·정문 포함)만 화면에 맞추기 위한 보이지 않는 기준 상자
    fb = document.createElement('div'); fb.id = 'fitbox';
    fb.style.cssText = `position:absolute;left:${X(470)}px;top:${Y(400)}px;width:${1585 - 470}px;height:${Y(1160) - Y(400)}px;visibility:hidden;pointer-events:none`;
    $('layer-trees').appendChild(fb);
  }
  for (let i = 0; i < 3; i++) {
    applyView(false);
    const g = fb.getBoundingClientRect();
    const k = Math.min((box.r - box.l) / g.width, (box.b - box.t) / g.height);
    state.zoom = clamp(state.zoom * k * (small ? 1.06 : 0.98), 0.25, 1.4);
    applyView(false);
    const g2 = fb.getBoundingClientRect();
    state.panX += (box.l + box.r) / 2 - (g2.left + g2.right) / 2;
    state.panY += (box.t + box.b) / 2 - (g2.top + g2.bottom) / 2;
  }
  applyView(false);
  Object.assign(HOME, { zoom: state.zoom, panX: state.panX, panY: state.panY });
}
let fitTimer = 0;
window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitHome, 450); });

// ---------- wiring ----------
$('btn-reset').addEventListener('click', () => { Object.assign(state, HOME); applyView(true); });
function applyTheme() {
  document.documentElement.dataset.theme = state.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', state.dark ? '#14171D' : '#F2EFE8');
  $('btn-dark').classList.toggle('on', state.dark);
  $('btn-dark').setAttribute('aria-pressed', state.dark);
}
$('btn-dark').addEventListener('click', () => {
  state.dark = !state.dark;
  try { localStorage.setItem('theme', state.dark ? 'dark' : 'light'); } catch (e) { /* 저장 안 돼도 동작 */ }
  applyTheme(); renderStatic(); applyLabels(); applyView(false);
});
$('btn-zin').addEventListener('click', () => { state.zoom = clamp(state.zoom * 1.25, 0.4, 2.4); applyView(true); });
$('btn-zout').addEventListener('click', () => { state.zoom = clamp(state.zoom / 1.25, 0.25, 2.4); applyView(true); });
$('btn-rotl').addEventListener('click', () => { state.rot -= 45; applyView(true); });
$('btn-rotr').addEventListener('click', () => { state.rot += 45; applyView(true); });
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

applyTheme();
renderStatic();
applyView(false);
applyLabels();
renderSheet();
fitHome();
requestAnimationFrame(fitHome);

// 웹앱(홈 화면 추가)으로 열렸을 때 오프라인 동작을 위해 서비스 워커 등록 (네이티브 앱 안에서는 필요 없음)
if ('serviceWorker' in navigator && !window.Capacitor && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
