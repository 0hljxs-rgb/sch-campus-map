// 긴급 제보 → 학생 확인(투표) → 관리자 승인 → 긴급 공지 배너
// 서버가 없거나 인터넷이 끊겨도 지도는 그대로 동작하도록, 모든 기능은 실패해도 조용히 넘어가요.
import { getClient, KINDS, isEmail, niceError, timeAgo, escapeHTML as esc } from './supa.js';

const cm = window.campusMap;
const $ = (id) => document.getElementById(id);
const app = $('app');

let sb = null;
let session = null;
let profile = null;      // {dept, student_id} — 학과·학번 등록을 마쳐야 제보·확인 가능
let alerts = [];
let incidents = [];
const myVotes = new Map();
let draft = {};          // 작성 중인 제보 {kind, place, note}
let afterLogin = null;   // 로그인 끝나면 이어서 할 일

// ---------- 화면 요소 만들기 ----------
const layer = document.createElement('div');
layer.id = 'layer-alerts';
$('plane').appendChild(layer);

const banner = document.createElement('section');
banner.id = 'alert-banner';
banner.setAttribute('aria-live', 'assertive');
banner.hidden = true;
app.appendChild(banner);

const fab = document.createElement('button');
fab.type = 'button';
fab.id = 'btn-report';
fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9.5 17h-19z"></path><path d="M12 10v4M12 17.2v.1"></path></svg><span>제보</span>';
fab.setAttribute('aria-label', '화재·통행 막힘 제보하기');
app.appendChild(fab);

const modal = document.createElement('div');
modal.id = 'rp';
modal.hidden = true;
modal.innerHTML = '<div class="rp-back" data-act="close"></div><div class="rp-card" role="dialog" aria-modal="true" aria-labelledby="rp-title"><div id="rp-body"></div></div>';
app.appendChild(modal);
const body = () => $('rp-body');

const toast = document.createElement('div');
toast.id = 'rp-toast';
toast.hidden = true;
app.appendChild(toast);
let toastTimer = 0;
function showToast(msg) {
  toast.textContent = msg; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
}

// ---------- 모달 단계 ----------
const head = (title, sub) => `<div class="rp-head"><div><h2 id="rp-title">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button type="button" class="rp-x" data-act="close" aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>`;
const emailOf = () => session?.user?.email || '';
const isSchool = () => !!profile;

function open(step, data) { modal.hidden = false; render(step, data); }
function close() { modal.hidden = true; body().innerHTML = ''; }

function render(step, data = {}) {
  const b = body();
  if (step === 'login') {
    b.innerHTML = head('이메일로 로그인', '장난 제보를 막기 위해 이메일 인증과 학과·학번 등록을 한 사람만 제보와 확인을 할 수 있어요. 네이버·Gmail 등 아무 메일이나 쓸 수 있어요.') +
      `<form class="rp-form" data-form="email"><label>이메일<input id="rp-email" type="email" inputmode="email" autocomplete="email" placeholder="example@naver.com" value="${esc(data.email || '')}" required></label>
       <p class="rp-err" id="rp-err">${esc(data.err || '')}</p>
       <button class="rp-primary" type="submit">인증 코드 받기</button></form>
       <p class="rp-fine">메일로 받은 숫자 코드를 입력하면 로그인돼요. 비밀번호는 필요 없어요.</p>`;
    setTimeout(() => $('rp-email')?.focus(), 50);
  } else if (step === 'code') {
    b.innerHTML = head('인증 코드 입력', `${esc(data.email)} 으로 보낸 숫자 코드를 입력해 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.`) +
      `<form class="rp-form" data-form="code" data-email="${esc(data.email)}"><label>인증 코드<input id="rp-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" maxlength="8" placeholder="숫자 6자리" required></label>
       <p class="rp-err" id="rp-err">${esc(data.err || '')}</p>
       <button class="rp-primary" type="submit">확인</button>
       <button class="rp-link" type="button" data-act="login">다른 이메일로 / 코드 다시 받기</button></form>`;
    setTimeout(() => $('rp-code')?.focus(), 50);
  } else if (step === 'profile') {
    b.innerHTML = head('학과·학번 등록', '처음 한 번만 입력하면 돼요. 학번 하나로 한 계정만 쓸 수 있어요.') +
      `<form class="rp-form" data-form="profile"><label>학과<input id="rp-dept" maxlength="30" autocomplete="off" placeholder="예) 컴퓨터소프트웨어공학과" value="${esc(profile?.dept || '')}" required></label>
       <label>학번<input id="rp-sid" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="예) 20241234" value="${esc(profile?.student_id || '')}" required></label>
       <label class="rp-agree"><input id="rp-ok" type="checkbox" required><span>장난 제보 확인과 1인 1표 관리를 위해 학과·학번을 저장하는 데 동의해요. 관리자만 볼 수 있어요.</span></label>
       <p class="rp-err" id="rp-err">${esc(data.err || '')}</p>
       <button class="rp-primary" type="submit">등록하고 계속</button></form>`;
    setTimeout(() => $('rp-dept')?.focus(), 50);
  } else if (step === 'kind') {
    b.innerHTML = head('무엇을 제보할까요?', '여러 학생이 확인하면 관리자가 검토해서 긴급 공지를 띄워요.') +
      `<div class="rp-kinds">${Object.entries(KINDS).map(([k, v]) =>
        `<button type="button" class="rp-kind" data-kind="${k}" style="--k:${v.color}"><span>${v.emoji}</span><b>${v.label}</b><small>${k === 'fire' ? '불·연기·타는 냄새' : k === 'blocked' ? '공사·사고·침수로 길이 막힘' : '그 밖의 위험 상황'}</small></button>`).join('')}</div>
       <div class="rp-me">${esc(profile?.dept || '')} ${esc(profile?.student_id || '')} · ${esc(emailOf())} · <button type="button" class="rp-link" data-act="logout">로그아웃</button></div>`;
  } else if (step === 'fire119') {
    b.innerHTML = head('🔥 먼저 119에 신고하세요', '이 앱은 비공식 앱이라 소방서에 자동으로 신고되지 않아요.') +
      `<a class="rp-119" href="tel:119"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path></svg>119 전화하기</a>
       <p class="rp-fine">안전한 곳으로 대피한 다음에 제보해 주세요. 엘리베이터 대신 계단을 이용하세요.</p>
       <button class="rp-ghost" type="button" data-act="where">이미 신고했어요 · 제보 계속</button>`;
  } else if (step === 'where') {
    const k = KINDS[draft.kind];
    b.innerHTML = head(`${k.emoji} ${k.label} 제보`, '어느 건물·장소 근처인가요?') +
      `<form class="rp-form" data-form="report"><label>장소<select id="rp-place" required><option value="">장소를 골라 주세요</option>${cm.places.map((p, i) => `<option value="${i}"${draft.place === i ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
       <label>상황 설명 <em>(선택)</em><textarea id="rp-note" maxlength="200" rows="3" placeholder="예) 1층 출입구 쪽에서 연기가 나요">${esc(draft.note || '')}</textarea></label>
       <p class="rp-err" id="rp-err">${esc(data.err || '')}</p>
       <button class="rp-primary" type="submit" style="--k:${k.color}">제보 보내기</button></form>`;
  } else if (step === 'done') {
    b.innerHTML = head('제보가 접수됐어요', '') +
      `<div class="rp-done"><div class="rp-check">✓</div><p>근처 학생들이 <b>3명 이상</b> “맞아요”로 확인하고 찬성이 과반수면 관리자에게 전달돼요. 관리자가 승인하면 모든 사용자에게 긴급 공지가 떠요.</p></div>
       <button class="rp-primary" type="button" data-act="close">확인</button>`;
  } else if (step === 'vote') {
    const inc = incidents.find((q) => q.id === data.id);
    if (!inc) { close(); return; }
    const k = KINDS[inc.kind] || KINDS.other;
    const mine = myVotes.get(inc.id);
    b.innerHTML = head(`${k.emoji} ${esc(inc.place)} 근처 ${k.label} 제보`, `${timeAgo(inc.created_at)} · 제보 ${inc.reports}건`) +
      `<div class="rp-tally"><span><b>${inc.agree}</b>명 맞아요</span><span><b>${inc.disagree}</b>명 아니에요</span><span class="st">${inc.status === 'pending' ? '관리자 검토 중' : '학생 확인 중'}</span></div>
       <p class="rp-fine">직접 보거나 들은 경우에만 눌러 주세요. 한 사람당 한 표이고, 나중에 바꿀 수 있어요.</p>
       <div class="rp-votes"><button type="button" class="rp-yes${mine === true ? ' on' : ''}" data-vote="1" data-id="${inc.id}">맞아요</button><button type="button" class="rp-no${mine === false ? ' on' : ''}" data-vote="0" data-id="${inc.id}">아니에요</button></div>
       ${inc.kind === 'fire' ? '<a class="rp-119 sm" href="tel:119">🔥 불이 보이면 119에 먼저 신고하세요</a>' : ''}
       <p class="rp-err" id="rp-err">${esc(data.err || '')}</p>`;
  }
}

// 로그인이 필요하면 로그인부터
function needLogin(next) {
  if (session && isSchool()) { next(); return; }
  afterLogin = next;
  open(session ? 'profile' : 'login');
}

modal.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act],[data-kind],[data-vote]');
  if (!t) return;
  if (t.dataset.act === 'close') close();
  else if (t.dataset.act === 'login') render('login');
  else if (t.dataset.act === 'where') render('where');
  else if (t.dataset.act === 'logout') { await sb?.auth.signOut(); profile = null; close(); showToast('로그아웃했어요'); }
  else if (t.dataset.kind) { draft.kind = t.dataset.kind; render(draft.kind === 'fire' ? 'fire119' : 'where'); }
  else if (t.dataset.vote) {
    t.disabled = true;
    const id = +t.dataset.id, agree = t.dataset.vote === '1';
    const { error } = await sb.rpc('cast_vote', { p_id: id, p_agree: agree });
    if (error) { render('vote', { id, err: niceError(error) }); return; }
    myVotes.set(id, agree);
    await loadIncidents();
    close(); showToast(agree ? '확인해 줘서 고마워요' : '의견이 반영됐어요');
  }
});

modal.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('button[type=submit]');
  const err = (m) => { const el = $('rp-err'); if (el) el.textContent = m; btn.disabled = false; };
  btn.disabled = true;
  if (f.dataset.form === 'email') {
    const email = $('rp-email').value.trim().toLowerCase();
    if (!isEmail(email)) return err('이메일 주소를 확인해 주세요');
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return err(niceError(error));
    render('code', { email });
  } else if (f.dataset.form === 'code') {
    const email = f.dataset.email, token = $('rp-code').value.trim();
    const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) return err(niceError(error));
    session = data.session;
    await loadProfile();
    if (!profile) { render('profile'); return; }
    await loadIncidents();
    const next = afterLogin; afterLogin = null;
    if (next) next(); else close();
  } else if (f.dataset.form === 'profile') {
    if (!$('rp-ok').checked) return err('동의해야 등록할 수 있어요');
    const { error } = await sb.rpc('save_profile', { p_dept: $('rp-dept').value, p_student_id: $('rp-sid').value });
    if (error) return err(niceError(error));
    await loadProfile();
    await loadIncidents();
    const next = afterLogin; afterLogin = null;
    if (next) next(); else { close(); showToast('등록됐어요'); }
  } else if (f.dataset.form === 'report') {
    const i = $('rp-place').value;
    if (i === '') return err('장소를 골라 주세요');
    const p = cm.places[+i];
    draft.place = +i; draft.note = $('rp-note').value;
    const { error } = await sb.rpc('submit_report', { p_kind: draft.kind, p_place: p.label, p_x: p.ix, p_y: p.iy, p_note: draft.note || null });
    if (error) return err(niceError(error));
    draft = {};
    await loadIncidents();
    render('done');
  }
});

fab.addEventListener('click', () => {
  if (!sb) { showToast('인터넷에 연결되면 제보할 수 있어요'); return; }
  needLogin(() => open('kind'));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

// ---------- 지도 위 표시 ----------
function renderLayer() {
  const ring = (x, y, cls) => `<div class="alring ${cls}" style="left:${cm.X(x) - 22}px;top:${cm.Y(y) - 22}px"></div>`;
  const al = alerts.filter((a) => a.x != null).map((a) => {
    const k = KINDS[a.kind] || KINDS.other;
    return ring(a.x, a.y, 'red') + `<div class="bb" style="left:${cm.X(a.x)}px;top:${cm.Y(a.y)}px;--z:8px"><div class="in"><button type="button" class="alm red" data-alert="${a.id}" style="--k:${k.color}">${k.emoji} ${esc(a.title)}</button><div class="stem"></div></div></div>`;
  });
  const inc = incidents.filter((q) => q.status === 'open' || q.status === 'pending').map((q) => {
    const k = KINDS[q.kind] || KINDS.other;
    return ring(q.x, q.y, 'amber') + `<div class="bb" style="left:${cm.X(q.x)}px;top:${cm.Y(q.y)}px;--z:7px"><div class="in"><button type="button" class="alm inc" data-inc="${q.id}" style="--k:${k.color}">${k.emoji} ${q.status === 'pending' ? '검토 중' : '확인 중'} · ${q.agree}명</button><div class="stem"></div></div></div>`;
  });
  layer.innerHTML = al.join('') + inc.join('');
}
layer.addEventListener('click', (e) => {
  const a = e.target.closest('[data-alert]'), q = e.target.closest('[data-inc]');
  if (a) { const al = alerts.find((x) => x.id === +a.dataset.alert); if (al) { banner.classList.remove('min'); cm.focus(al.x, al.y); } }
  if (q) { const id = +q.dataset.inc; needLogin(() => open('vote', { id })); }
});
// 지도 끌기(드래그) 도중 눌림 방지
layer.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.stopPropagation(); });

// ---------- 긴급 공지 배너 ----------
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem('seenAlerts') || '[]')); } catch (e) { /* 무시 */ }
function renderBanner() {
  if (!alerts.length) { banner.hidden = true; app.classList.remove('has-alert'); syncOffset(); return; }
  const fresh = alerts.some((a) => !seen.has(a.id));
  if (fresh) {
    banner.classList.remove('min');
    alerts.forEach((a) => seen.add(a.id));
    try { localStorage.setItem('seenAlerts', JSON.stringify([...seen].slice(-50))); } catch (e) { /* 무시 */ }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  const a = alerts[0], k = KINDS[a.kind] || KINDS.other;
  banner.hidden = false;
  app.classList.add('has-alert');
  banner.style.setProperty('--k', k.color);
  banner.innerHTML = `<button type="button" class="ab-pill" data-ab="open" aria-label="긴급 공지 펼치기"><span class="ab-dot"></span>긴급 공지${alerts.length > 1 ? ` ${alerts.length}건` : ''} · ${esc(a.title)}</button>
    <div class="ab-full"><div class="ab-top"><span class="ab-tag"><span class="ab-dot"></span>긴급 공지${alerts.length > 1 ? ` 1/${alerts.length}` : ''}</span><span class="ab-time">${timeAgo(a.created_at)}</span>
    <button type="button" class="ab-x" data-ab="min" aria-label="공지 접기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"></path></svg></button></div>
    <h2>${k.emoji} ${esc(a.title)}</h2>${a.body ? `<p>${esc(a.body)}</p>` : ''}
    <div class="ab-acts">${a.x != null ? `<button type="button" data-ab="go">📍 ${esc(a.place || '위치')} 보기</button>` : ''}${a.kind === 'fire' ? '<a href="tel:119">119 전화</a>' : ''}</div>
    ${alerts.length > 1 ? `<div class="ab-more">${alerts.slice(1).map((x) => `<div>${(KINDS[x.kind] || KINDS.other).emoji} ${esc(x.title)} · ${timeAgo(x.created_at)}</div>`).join('')}</div>` : ''}</div>`;
  syncOffset();
}
banner.addEventListener('click', (e) => {
  const t = e.target.closest('[data-ab]');
  if (!t) return;
  if (t.dataset.ab === 'min') banner.classList.add('min');
  if (t.dataset.ab === 'open') banner.classList.remove('min');
  if (t.dataset.ab === 'go') { const a = alerts[0]; cm.focus(a.x, a.y); }
  syncOffset();
});
// 배너 높이만큼 제보 버튼·지도 버튼을 아래로
function syncOffset() {
  requestAnimationFrame(() => {
    const h = banner.hidden ? 0 : banner.getBoundingClientRect().height + 8;
    document.documentElement.style.setProperty('--alert-h', h + 'px');
  });
}
window.addEventListener('resize', syncOffset);

// ---------- 데이터 ----------
async function loadAlerts() {
  if (!sb) return;
  const { data, error } = await sb.from('alerts').select('*').eq('active', true).order('created_at', { ascending: false }).limit(5);
  if (error) return;
  alerts = data || [];
  renderBanner(); renderLayer();
}
async function loadProfile() {
  profile = null;
  if (!sb || !session) return;
  const { data } = await sb.from('profiles').select('dept,student_id').eq('user_id', session.user.id).maybeSingle();
  profile = data || null;
}
async function loadIncidents() {
  if (!sb || !session || !isSchool()) { incidents = []; renderLayer(); return; }
  const [{ data }, { data: votes }] = await Promise.all([
    sb.from('incidents').select('*').in('status', ['open', 'pending']).order('last_at', { ascending: false }).limit(30),
    sb.from('votes').select('incident_id,agree'),
  ]);
  incidents = data || [];
  myVotes.clear();
  (votes || []).forEach((v) => myVotes.set(v.incident_id, v.agree));
  renderLayer();
}

async function start() {
  try { sb = await getClient(); } catch (e) { return; }   // 오프라인: 지도만 사용
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((_ev, s) => { session = s; setTimeout(async () => { await loadProfile(); loadIncidents(); }, 0); });
  await loadProfile();
  await Promise.all([loadAlerts(), loadIncidents()]);
  sb.channel('campus-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, loadAlerts)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, loadIncidents)
    .subscribe();
  // 실시간 연결이 끊겨도 30초마다 새로고침, 앱으로 돌아오면 바로 새로고침
  setInterval(() => { if (!document.hidden) { loadAlerts(); loadIncidents(); } }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadAlerts(); loadIncidents(); } });
}
start();
