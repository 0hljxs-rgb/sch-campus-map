// 관리자 페이지: 학생 제보 검토 → 긴급 공지 띄우기 / 내리기
import { getClient, KINDS, isEmail, niceError, timeAgo, escapeHTML as esc } from './supa.js';
import { SPECS, FLAT_PLACES } from './campus-data.js';

const $ = (id) => document.getElementById(id);
const main = $('main');
let sb, session, incidents = [], alerts = [];
let compose = null;   // 공지 작성 중인 제보 id (또는 'new')

// 장소 목록 (지도 일러스트 좌표 = 건물 중심)
const PLACES = [
  ...SPECS.map(([, name, , parts]) => {
    const xs = parts.flatMap((q) => [q[0], q[1]]), ys = parts.flatMap((q) => [q[2], q[3]]);
    return { label: name, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }),
  ...FLAT_PLACES.map(([, name, x, y]) => ({ label: name, x, y })),
  { label: '피닉스광장', x: 690, y: 1010 }, { label: '차 없는 거리', x: 1080, y: 915 },
  { label: '정문(서문)', x: 1533, y: 985 }, { label: '후문(향설동문)', x: 440, y: 1125 },
  { label: '공유캠퍼스 정문', x: 470, y: 300 }, { label: '통학버스 승강장', x: 795, y: 1170 },
].sort((a, b) => a.label.localeCompare(b.label, 'ko'));

// 확인 팝업(confirm) 대신: 버튼을 한 번 더 누르면 실행 (앱 안 브라우저·일부 웹앱에서는 팝업이 막혀서)
function armed(btn, msg) {
  if (btn.dataset.armed === '1') { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.label = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = msg;
  setTimeout(() => { if (btn.dataset.armed === '1') { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 5000);
  return false;
}

let toastT = 0;
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500); }

// ---------- 로그인 ----------
function renderLogin(step = 'email', email = '', err = '') {
  $('who').textContent = ''; $('logout').hidden = true;
  main.innerHTML = `<section class="login"><h2>관리자 로그인</h2><p class="sub">관리자로 등록된 이메일로 받은 숫자 코드로 로그인해요.</p>
    ${step === 'email'
      ? `<form data-f="email"><label>이메일<input id="em" type="email" value="${esc(email)}" placeholder="관리자 이메일" required></label><p class="err">${esc(err)}</p><button class="d">인증 코드 받기</button></form>`
      : `<form data-f="code" data-email="${esc(email)}"><label>${esc(email)} 으로 받은 코드<input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></label><p class="err">${esc(err)}</p><button class="d">로그인</button></form>`}
  </section>`;
}

// ---------- 메인 화면 ----------
const kindOptions = (sel) => Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v.emoji} ${v.label}</option>`).join('');
const placeOptions = (sel) => `<option value="">위치 없음</option>` + PLACES.map((p, i) => `<option value="${i}"${p.label === sel ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
function defaultTitle(kind, place) {
  return kind === 'fire' ? `${place} 근처 화재 제보` : kind === 'blocked' ? `${place} 근처 통행 불가` : `${place} 근처 위험 상황`;
}
function defaultBody(kind) {
  return kind === 'fire' ? '해당 건물 주변 접근을 피하고, 건물 안에 있다면 계단으로 대피하세요. 불이 보이면 119에 신고하세요.'
    : kind === 'blocked' ? '해당 구간은 지나갈 수 없어요. 다른 길로 돌아가 주세요.' : '해당 장소 주변에서 주의해 주세요.';
}
function composeForm(inc) {
  const kind = inc ? inc.kind : 'other', place = inc ? inc.place : '';
  return `<form class="compose" data-f="publish" data-inc="${inc ? inc.id : ''}">
    <div class="two"><label>종류<select name="kind">${kindOptions(kind)}</select></label><label>위치<select name="place">${placeOptions(place)}</select></label></div>
    <label>제목 (60자)<input name="title" maxlength="60" required value="${esc(inc ? defaultTitle(kind, place) : '')}"></label>
    <label>내용 (300자)<textarea name="body" maxlength="300">${esc(inc ? defaultBody(kind) : '')}</textarea></label>
    <p class="err"></p>
    <div class="acts"><button class="p">🚨 모든 사용자에게 긴급 공지 띄우기</button><button type="button" class="g" data-a="cancel">취소</button></div></form>`;
}

function render() {
  const pending = incidents.filter((q) => q.status === 'pending'), open = incidents.filter((q) => q.status === 'open');
  const incHTML = (q) => {
    const k = KINDS[q.kind] || KINDS.other;
    return `<div class="item ${q.status}"><div class="row"><b>${k.emoji} ${esc(q.place)} · ${k.label}</b>
      <span class="pill ${q.status === 'pending' ? 'amber' : ''}">${q.status === 'pending' ? '승인 대기' : '학생 확인 중'}</span></div>
      <div class="row">맞아요 <b>${q.agree}</b> · 아니에요 <b>${q.disagree}</b> · 제보 ${q.reports}건 · 처음 ${timeAgo(q.created_at)} · 최근 ${timeAgo(q.last_at)}</div>
      ${q.reporters?.length ? `<div class="row">제보자: ${q.reporters.slice(0, 6).map(esc).join(', ')}${q.reporters.length > 6 ? ` 외 ${q.reporters.length - 6}명` : ''}</div>` : ''}
      ${q.notes?.length ? `<ul class="notes">${q.notes.slice(0, 5).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${compose === q.id ? composeForm(q) : `<div class="acts"><button class="p" data-a="compose" data-id="${q.id}">긴급 공지 작성</button><button class="g" data-a="dismiss" data-id="${q.id}">무시 (오보)</button></div>`}</div>`;
  };
  main.innerHTML = `
    <section><h2>📣 진행 중인 긴급 공지 <small>${alerts.length}건</small></h2><p class="sub">지금 모든 사용자 화면 위쪽에 떠 있는 공지예요. 상황이 끝나면 꼭 내려 주세요.</p>
      ${alerts.length ? alerts.map((a) => { const k = KINDS[a.kind] || KINDS.other; return `<div class="item live"><div class="row"><b>${k.emoji} ${esc(a.title)}</b><span class="pill red">공지 중 · ${timeAgo(a.created_at)}</span></div>${a.body ? `<div class="row">${esc(a.body)}</div>` : ''}<div class="acts"><button class="d" data-a="end" data-id="${a.id}">공지 내리기</button></div></div>`; }).join('') : '<div class="empty">진행 중인 공지가 없어요</div>'}
      ${compose === 'new' ? composeForm(null) : '<div class="acts" style="margin-top:12px"><button class="g" data-a="compose" data-id="new">＋ 제보 없이 직접 공지 쓰기</button></div>'}
    </section>
    <section><h2>⏳ 승인 대기 <small>${pending.length}건</small></h2><p class="sub">학생 3명 이상이 확인했고 찬성이 과반수인 제보예요. 내용을 확인하고 공지를 띄울지 결정하세요.</p>
      ${pending.length ? pending.map(incHTML).join('') : '<div class="empty">승인 대기 중인 제보가 없어요</div>'}</section>
    <section><h2>👀 학생 확인 중 <small>${open.length}건</small></h2><p class="sub">아직 기준(3명·과반수)에 못 미친 제보예요. 급하면 바로 공지를 띄울 수도 있어요.</p>
      ${open.length ? open.map(incHTML).join('') : '<div class="empty">확인 중인 제보가 없어요</div>'}</section>`;
}

async function load() {
  const [{ data: inc, error: e1 }, { data: al }] = await Promise.all([
    sb.rpc('admin_incidents'),
    sb.from('alerts').select('*').eq('active', true).order('created_at', { ascending: false }),
  ]);
  if (e1) { main.innerHTML = `<section><h2>불러오지 못했어요</h2><p class="sub">${esc(niceError(e1))}</p></section>`; return; }
  incidents = inc || []; alerts = al || [];
  render();
}

async function enter() {
  const { data: ok, error } = await sb.rpc('am_i_admin');
  $('who').textContent = session.user.email; $('logout').hidden = false;
  if (error || !ok) {
    main.innerHTML = `<section><h2>관리자 권한이 없어요</h2><p class="sub">${esc(session.user.email)} 은 관리자로 등록돼 있지 않아요. ${error ? esc(niceError(error)) : ''}</p></section>`;
    return;
  }
  await load();
  sb.channel('admin-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => { if (compose == null) load(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => { if (compose == null) load(); })
    .subscribe();
  setInterval(() => { if (!document.hidden && compose == null) load(); }, 20000);
}

// ---------- 이벤트 ----------
main.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('button:not([type=button])'), errEl = f.querySelector('.err');
  const fail = (m) => { errEl.textContent = m; btn.disabled = false; };
  btn.disabled = true;
  if (f.dataset.f === 'email') {
    const email = $('em').value.trim().toLowerCase();
    if (!isEmail(email)) return fail('이메일 주소를 확인해 주세요');
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return fail(niceError(error));
    renderLogin('code', email);
  } else if (f.dataset.f === 'code') {
    const { data, error } = await sb.auth.verifyOtp({ email: f.dataset.email, token: $('cd').value.trim(), type: 'email' });
    if (error) return fail(niceError(error));
    session = data.session; enter();
  } else if (f.dataset.f === 'publish') {
    const fd = new FormData(f), pi = fd.get('place'), p = pi === '' ? null : PLACES[+pi];
    const title = String(fd.get('title')).trim();
    if (!title) return fail('제목을 입력해 주세요');
    if (!armed(btn, '⚠️ 한 번 더 누르면 모든 사용자에게 공지가 떠요')) { btn.disabled = false; return; }
    const { error } = await sb.rpc('publish_alert', {
      p_incident: f.dataset.inc ? +f.dataset.inc : null, p_title: title, p_body: String(fd.get('body') || ''),
      p_kind: fd.get('kind'), p_place: p ? p.label : null, p_x: p ? p.x : null, p_y: p ? p.y : null,
    });
    if (error) return fail(niceError(error));
    compose = null; toast('긴급 공지를 띄웠어요'); load();
  }
});
main.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-a]');
  if (!t) return;
  const id = t.dataset.id;
  if (t.dataset.a === 'compose') { compose = id === 'new' ? 'new' : +id; render(); }
  else if (t.dataset.a === 'cancel') { compose = null; render(); }
  else if (t.dataset.a === 'dismiss') {
    if (!armed(t, '한 번 더 누르면 오보 처리돼요')) return;
    const { error } = await sb.rpc('dismiss_incident', { p_id: +id }); if (error) toast(niceError(error)); else { toast('처리했어요'); load(); }
  } else if (t.dataset.a === 'end') {
    if (!armed(t, '한 번 더 누르면 공지가 내려가요')) return;
    const { error } = await sb.rpc('end_alert', { p_id: +id }); if (error) toast(niceError(error)); else { toast('공지를 내렸어요'); load(); }
  }
});
$('logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

(async () => {
  try { sb = await getClient(); } catch (e) { main.innerHTML = '<section><h2>인터넷 연결을 확인해 주세요</h2></section>'; return; }
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) enter(); else renderLogin();
})();
