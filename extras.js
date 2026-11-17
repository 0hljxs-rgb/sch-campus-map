// 내 위치(GPS) · 위치 공유 링크 · 후문 주차 혼잡도 제보
import { GEO } from './campus-data.js';
const cm = window.campusMap;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m) => (cm.toast ? cm.toast(m) : alert(m));
const IN = (ix, iy) => ix >= 357 && ix <= 1643 && iy >= 270 && iy <= 1295;

// ---------- 지도 위 고정 핀 (건물에 가려지지 않게 화면 위 레이어) ----------
const anchors = document.createElement('div'); anchors.id = 'layer-user'; $('plane').appendChild(anchors);
const over = document.createElement('div'); over.id = 'user-pins'; $('map').appendChild(over);
const pins = new Map();   // key → {anc, pin}
function setPin(key, ix, iy, html, cls = '') {
  let p = pins.get(key);
  if (!p) {
    const anc = document.createElement('div'); anc.className = 'alanc'; anchors.appendChild(anc);
    const pin = document.createElement('div'); over.appendChild(pin);
    p = { anc, pin }; pins.set(key, p);
  }
  p.anc.style.left = cm.X(ix) + 'px'; p.anc.style.top = cm.Y(iy) + 'px';
  p.pin.className = 'upin ' + cls; p.pin.innerHTML = html;
  track();
}
let tracking = false;
function track() {
  if (tracking) return; tracking = true;
  const tick = () => {
    const m = $('map').getBoundingClientRect();
    for (const { anc, pin } of pins.values()) { const r = anc.getBoundingClientRect(); pin.style.transform = `translate(${r.left - m.left}px, ${r.top - m.top}px)`; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- GPS → 지도 좌표 ----------
let geo = GEO;
try { const g = JSON.parse(localStorage.getItem('geoCalib') || 'null'); if (g && g.length === 6) geo = g; } catch (e) { /* 무시 */ }
const toMap = (lat, lng) => geo && [geo[0] * lng + geo[1] * lat + geo[2], geo[3] * lng + geo[4] * lat + geo[5]];

const ctl = $('controls');
const mkBtn = (id, label, svgBody) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'ctl'; b.setAttribute('aria-label', label); b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${svgBody}</svg>`; return b; };
const sep = document.createElement('i'); sep.className = 'sep'; sep.setAttribute('aria-hidden', 'true');
const btnLoc = mkBtn('btn-loc', '내 위치', '<circle cx="12" cy="12" r="3.2"></circle><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"></path><circle cx="12" cy="12" r="7"></circle>');
const btnShare = mkBtn('btn-share', '위치 공유', '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"></path><path d="M5 12v7.5h14V12"></path>');
ctl.prepend(sep); ctl.prepend(btnShare); ctl.prepend(btnLoc);

let me = null, watchId = null, first = true;
function locate(then) {
  if (!geo) { toast('GPS 위치 보정 전이라 아직 내 위치를 표시할 수 없어요'); return; }
  if (!navigator.geolocation) { toast('이 기기는 위치 기능을 지원하지 않아요'); return; }
  btnLoc.classList.add('on');
  if (watchId != null) { if (me) { cm.focus(me.ix, me.iy); then?.(); } return; }
  first = true;
  watchId = navigator.geolocation.watchPosition((p) => {
    const [ix, iy] = toMap(p.coords.latitude, p.coords.longitude);
    me = { ix, iy, acc: p.coords.accuracy, lat: p.coords.latitude, lng: p.coords.longitude };
    if (!IN(ix, iy)) { if (first) toast('지금 캠퍼스 밖에 있어요'); first = false; return; }
    setPin('me', ix, iy, '<div class="me-dot"></div>', 'me');
    if (first) { cm.focus(ix, iy); first = false; then?.(); }
  }, (err) => {
    btnLoc.classList.remove('on'); navigator.geolocation.clearWatch(watchId); watchId = null;
    toast(err.code === 1 ? '위치 권한을 허용해 주세요 (설정 → 브라우저 → 위치)' : '위치를 찾지 못했어요. 밖으로 나가서 다시 눌러 주세요');
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
btnLoc.addEventListener('click', () => locate());

// ---------- 위치 공유 (카카오톡 등) ----------
const modal = document.createElement('div'); modal.id = 'xp'; modal.hidden = true; $('app').appendChild(modal);
const head = (t, sub) => `<div class="rp-head"><div><h2>${t}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button type="button" class="rp-x" data-x="close" aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>`;
const openModal = (html) => { modal.innerHTML = `<div class="rp-back" data-x="close"></div><div class="rp-card" role="dialog" aria-modal="true">${html}</div>`; modal.hidden = false; };
modal.addEventListener('click', (e) => { if (e.target.closest('[data-x="close"]')) modal.hidden = true; });

function linkFor(ix, iy, label) {
  const u = new URL(location.href.split('?')[0].split('#')[0]);
  u.searchParams.set('at', `${Math.round(ix)},${Math.round(iy)}`);
  if (label) u.searchParams.set('l', label);
  return u.toString();
}
async function share(ix, iy, label) {
  const url = linkFor(ix, iy, label);
  const text = `[순천향대 캠퍼스맵] 제 위치: ${label}`;
  try {
    if (navigator.share) { await navigator.share({ title: '내 위치', text, url }); modal.hidden = true; return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('링크를 복사했어요. 카카오톡에 붙여넣으세요'); modal.hidden = true; }
  catch (e) { openModal(head('링크 복사', '아래 주소를 길게 눌러 복사하세요') + `<textarea class="xp-link" readonly>${esc(url)}</textarea>`); }
}
btnShare.addEventListener('click', () => {
  openModal(head('내 위치 보내기', '카카오톡 등으로 정확한 위치 링크를 보내요') +
    `<div class="xp-list"><button type="button" class="xp-gps" data-gps="1">📍 지금 GPS 위치 보내기</button>
     <p class="xp-or">또는 가까운 장소 고르기</p>
     ${cm.places.map((p, i) => `<button type="button" data-pl="${i}">${esc(p.label)}</button>`).join('')}</div>`);
});
modal.addEventListener('click', (e) => {
  const g = e.target.closest('[data-gps]'), pl = e.target.closest('[data-pl]');
  if (g) {
    if (me && IN(me.ix, me.iy)) share(me.ix, me.iy, nearest(me.ix, me.iy));
    else locate(() => share(me.ix, me.iy, nearest(me.ix, me.iy)));
  }
  if (pl) { const p = cm.places[+pl.dataset.pl]; share(p.ix, p.iy, p.label); }
});
function nearest(ix, iy) {
  let best = null, d0 = 1e9;
  for (const p of cm.places) { const d = Math.hypot(p.ix - ix, p.iy - iy); if (d < d0) { d0 = d; best = p; } }
  return best ? (d0 < 40 ? best.label : `${best.label} 근처`) : '캠퍼스';
}

// 공유 링크로 들어온 경우
const qs = new URLSearchParams(location.search);
if (qs.get('at')) {
  const [ix, iy] = qs.get('at').split(',').map(Number);
  if (IN(ix, iy)) {
    const label = (qs.get('l') || '공유된 위치').slice(0, 40);
    setPin('shared', ix, iy, `<div class="sh-pin">📍 ${esc(label)}</div><div class="sh-stem"></div>`, 'shared');
    setTimeout(() => cm.focus(ix, iy), 400);
  }
}

// ---------- 후문 주차 혼잡도 (학생 제보형) ----------
const GATE = [440, 1125];
const LV = { 1: ['여유', '#1F8A5B'], 2: ['보통', '#E08A1E'], 3: ['꽉 참', '#D93A3A'] };
let park = null;   // {level, n, ago}
function drawPark() {
  const t = park ? `${LV[park.level][0]} · ${park.ago}` : '정보 없음';
  const c = park ? LV[park.level][1] : '#8A93A2';
  setPin('park', GATE[0], GATE[1] - 28, `<button type="button" class="pk" data-park="1"><i style="background:${c}">P</i>후문 주차 <b style="color:${c}">${t}</b></button>`, 'park');
}
async function loadPark() {
  const sb = cm.client?.(); if (!sb) return;
  const { data, error } = await sb.rpc('parking_status');
  if (error || !data?.length) { park = null; drawPark(); return; }
  // 가장 많이 나온 답, 같으면 최근 것
  data.sort((a, b) => b.n - a.n || new Date(b.latest) - new Date(a.latest));
  const top = data[0], total = data.reduce((s, r) => s + Number(r.n), 0);
  const min = Math.max(0, Math.round((Date.now() - new Date(top.latest)) / 60000));
  park = { level: top.level, n: total, ago: min < 1 ? '방금' : `${min}분 전` };
  drawPark();
}
over.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.stopPropagation(); });
over.addEventListener('click', (e) => {
  if (!e.target.closest('[data-park]')) return;
  openModal(head('후문 주차 상황', park ? `최근 1시간 제보 ${park.n}건 · 지금은 <b>${LV[park.level][0]}</b>` : '최근 1시간 제보가 없어요') +
    `<p class="xp-or">지금 후문 주차장은 어떤가요?</p><div class="pk-btns">${[1, 2, 3].map((l) => `<button type="button" data-lv="${l}" style="--c:${LV[l][1]}">${LV[l][0]}</button>`).join('')}</div>`);
});
modal.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lv]'); if (!b) return;
  const lv = +b.dataset.lv;
  modal.hidden = true;
  const send = async () => {
    const { error } = await cm.client().rpc('report_parking', { p_level: lv });
    if (error) toast(error.message.includes('report_parking') ? '주차 제보 기능 준비 중이에요' : error.message);
    else { toast('알려 주셔서 고마워요!'); loadPark(); }
  };
  if (cm.needLogin) cm.needLogin(send); else toast('잠시 후 다시 시도해 주세요');
});
drawPark();
(function waitClient(n = 0) { if (cm.client?.()) { loadPark(); setInterval(() => { if (!document.hidden) loadPark(); }, 60000); } else if (n < 40) setTimeout(() => waitClient(n + 1), 500); })();

// ---------- GPS 보정 모드 (?calib=1) : 현장에서 3곳 이상 기록 ----------
if (qs.get('calib')) {
  let pairs = [];
  try { pairs = JSON.parse(localStorage.getItem('geoPairs') || '[]'); } catch (e) { /* 무시 */ }
  const fit = () => {
    if (pairs.length < 3) return null;
    const lng0 = pairs[0].lng, lat0 = pairs[0].lat;
    const A = pairs.map((p) => [p.lng - lng0, p.lat - lat0, 1]);
    const solve = (b) => {
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
      A.forEach((r, k) => { for (let i = 0; i < 3; i++) { v[i] += r[i] * b[k]; for (let j = 0; j < 3; j++) M[i][j] += r[i] * r[j]; } });
      for (let i = 0; i < 3; i++) { let m = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[m][i])) m = r; [M[i], M[m]] = [M[m], M[i]]; [v[i], v[m]] = [v[m], v[i]];
        for (let r = 0; r < 3; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c < 3; c++) M[r][c] -= f * M[i][c]; v[r] -= f * v[i]; } }
      return v.map((x, i) => x / M[i][i]);
    };
    const [a, b, c] = solve(pairs.map((p) => p.ix)), [d, e, f] = solve(pairs.map((p) => p.iy));
    return [a, b, c - a * lng0 - b * lat0, d, e, f - d * lng0 - e * lat0];
  };
  const draw = () => {
    const g = fit();
    if (g) { localStorage.setItem('geoCalib', JSON.stringify(g)); geo = g; }
    openModal(head('GPS 위치 보정', '장소에 실제로 서서 고른 뒤 “여기서 기록”을 누르세요. 멀리 떨어진 3곳 이상') +
      `<select id="cb-pl">${cm.places.map((p, i) => `<option value="${i}">${esc(p.label)}</option>`).join('')}</select>
       <div class="pk-btns"><button type="button" id="cb-rec" style="--c:#1B2F5E">여기서 기록</button><button type="button" id="cb-clr" style="--c:#8A93A2">전부 지우기</button></div>
       <p class="xp-or">기록 ${pairs.length}곳${pairs.map((p) => ` · ${esc(p.label)}(±${Math.round(p.acc)}m)`).join('')}</p>
       ${g ? `<p class="xp-or">보정 완료! 아래 값을 개발자에게 보내 주세요</p><textarea class="xp-link" readonly>${JSON.stringify(g)}</textarea>` : ''}`);
  };
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'cb-clr') { pairs = []; localStorage.removeItem('geoPairs'); localStorage.removeItem('geoCalib'); draw(); }
    if (e.target.id === 'cb-rec') {
      const p = cm.places[+$('cb-pl').value];
      toast('위치 측정 중… (최대 20초)');
      navigator.geolocation.getCurrentPosition((pos) => {
        pairs.push({ label: p.label, ix: p.ix, iy: p.iy, lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
        localStorage.setItem('geoPairs', JSON.stringify(pairs)); draw();
      }, () => toast('위치를 못 찾았어요'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }
  });
  draw();
}
