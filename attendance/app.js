// 출퇴근 기록 앱
// - 사람(프로필)마다 이름·사번·시트 탭·Apps Script 주소를 따로 저장 (이 기기의 localStorage)
// - 출근/퇴근 아이콘을 누르면 Apps Script 웹 앱으로 전송 → 구글 시트에 기록
// - 인터넷이 끊겨 실패하면 기기에 보관했다가 다시 보내요
(function () {
  'use strict';

  var KEY = 'attendance.v1';
  var $ = function (id) { return document.getElementById(id); };
  var state = load();

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.people)) {
        s.queue = s.queue || [];
        s.history = s.history || {};
        return s;
      }
    } catch (e) { /* 저장소를 못 쓰면 새로 시작 */ }
    return { people: [], current: null, queue: [], history: {} };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 개인정보 보호 모드 등 */ }
  }
  function me() {
    for (var i = 0; i < state.people.length; i++) if (state.people[i].id === state.current) return state.people[i];
    return state.people[0] || null;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hms(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- 시계 ----------
  var DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  var lastDay = '';
  function tick() {
    var d = new Date();
    $('now').textContent = hms(d);
    $('today').textContent = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[d.getDay()] + '요일';
    if (lastDay && lastDay !== ymd(d)) render(); // 자정 지나면 오늘 요약 초기화
    lastDay = ymd(d);
  }
  setInterval(tick, 1000);
  tick();

  // ---------- 화면 ----------
  function hist(p) { return (p && state.history[p.id]) || []; }

  function render() {
    var p = me();
    $('setupBanner').classList.toggle('show', !p || !p.url);
    $('whoName').textContent = p ? p.name : '사람을 등록해 주세요';
    $('whoSub').textContent = p ? ([p.empId, (p.sheet || p.name) + ' 탭'].filter(Boolean).join(' · ')) : '탭해서 이름·시트 설정';
    $('avatar').textContent = p ? p.name.trim().slice(0, 1) : '?';
    $('openSheet').hidden = !(p && p.sheetLink);

    var today = ymd(new Date());
    var list = hist(p);
    var todays = list.filter(function (h) { return h.date === today; });
    var firstIn = null, lastOut = null;
    todays.forEach(function (h) {
      if (h.type === 'in' && (!firstIn || h.ts < firstIn.ts)) firstIn = h;
      if (h.type === 'out' && (!lastOut || h.ts > lastOut.ts)) lastOut = h;
    });
    $('inBtn').classList.toggle('is-done', !!firstIn);
    $('outBtn').classList.toggle('is-done', !!lastOut);
    $('inStamp').textContent = firstIn ? hm(new Date(firstIn.ts)) + ' 기록됨' : ' ';
    $('outStamp').textContent = lastOut ? hm(new Date(lastOut.ts)) + ' 기록됨' : ' ';
    $('sumIn').textContent = firstIn ? hm(new Date(firstIn.ts)) : '-';
    $('sumOut').textContent = lastOut ? hm(new Date(lastOut.ts)) : '-';
    if (firstIn && lastOut && lastOut.ts > firstIn.ts) {
      var m = Math.floor((lastOut.ts - firstIn.ts) / 60000);
      $('sumWork').textContent = Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
    } else {
      $('sumWork').textContent = '-';
    }

    var ul = $('hist');
    if (!list.length) {
      ul.innerHTML = '<li class="empty" style="justify-content:center">아직 기록이 없어요</li>';
    } else {
      ul.innerHTML = list.slice(0, 15).map(function (h) {
        var d = new Date(h.ts);
        var st = h.status === 'ok' ? '<span class="st ok">시트 저장됨</span>'
          : h.status === 'queued' ? '<span class="st wait">보내기 대기</span>'
          : h.status === 'sending' ? '<span class="st">보내는 중…</span>'
          : '<span class="st err">' + esc(h.error || '실패') + '</span>';
        return '<li><span class="tag ' + h.type + '">' + (h.type === 'in' ? '출근' : '퇴근') + '</span>' +
          '<span class="t">' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hms(d) +
          (h.memo ? ' · ' + esc(h.memo) : '') + '</span>' + st + '</li>';
      }).join('');
    }

    var q = state.queue.length;
    $('queueBanner').classList.toggle('show', q > 0);
    $('queueText').textContent = '보내지 못한 기록이 ' + q + '건 있어요. 인터넷이 연결되면 자동으로 다시 보내요.';
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- 시트(모달) ----------
  var openSheetEl = null;
  function openSheet(el) {
    if (openSheetEl) openSheetEl.classList.remove('show');
    openSheetEl = el;
    $('bg').classList.add('show');
    el.classList.add('show');
  }
  function closeSheet() {
    if (openSheetEl) openSheetEl.classList.remove('show');
    openSheetEl = null;
    $('bg').classList.remove('show');
  }
  $('bg').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  // 사람 목록
  function showPeople() {
    var cur = me();
    $('peopleList').innerHTML = state.people.length ? state.people.map(function (p) {
      return '<li class="' + (cur && cur.id === p.id ? 'active' : '') + '">' +
        '<button class="pick" data-pick="' + p.id + '"><span class="avatar">' + esc(p.name.slice(0, 1)) + '</span>' +
        '<span style="min-width:0"><b>' + esc(p.name) + '</b><small>' + esc([p.empId, (p.sheet || p.name) + ' 탭'].filter(Boolean).join(' · ')) + '</small></span></button>' +
        '<button class="btn small" data-edit="' + p.id + '">설정</button></li>';
    }).join('') : '<li class="empty" style="border:0;justify-content:center">등록된 사람이 없어요</li>';
    openSheet($('peopleSheet'));
  }
  $('peopleList').addEventListener('click', function (e) {
    var pick = e.target.closest('[data-pick]');
    var edit = e.target.closest('[data-edit]');
    if (pick) {
      state.current = pick.getAttribute('data-pick');
      save(); render(); closeSheet();
      toast(me().name + '님으로 바꿨어요');
    } else if (edit) {
      showEdit(edit.getAttribute('data-edit'));
    }
  });
  $('whoBtn').addEventListener('click', showPeople);
  $('peopleClose').addEventListener('click', closeSheet);
  $('addPerson').addEventListener('click', function () { showEdit(null); });
  $('settingsBtn').addEventListener('click', function () { var p = me(); showEdit(p ? p.id : null); });
  $('setupGo').addEventListener('click', function () { var p = me(); showEdit(p ? p.id : null); });
  $('openSheet').addEventListener('click', function () { var p = me(); if (p && p.sheetLink) window.open(p.sheetLink, '_blank', 'noopener'); });

  // 사람별 설정
  var editingId = null;
  function showEdit(id) {
    editingId = id;
    var p = state.people.filter(function (x) { return x.id === id; })[0];
    var base = me(); // 새 사람 추가 시 같은 시트 주소를 미리 채워 줌
    $('editTitle').textContent = p ? p.name + ' 설정' : '사람 추가';
    $('fName').value = p ? p.name : '';
    $('fEmp').value = p ? p.empId || '' : '';
    $('fTab').value = p ? p.sheet || '' : '';
    $('fUrl').value = p ? p.url || '' : (base ? base.url || '' : '');
    $('fSecret').value = p ? p.secret || '' : (base ? base.secret || '' : '');
    $('fSheetLink').value = p ? p.sheetLink || '' : (base ? base.sheetLink || '' : '');
    $('fConfirm').checked = p ? p.confirm !== false : true;
    $('fMemo').checked = p ? !!p.askMemo : false;
    $('delPerson').hidden = !p;
    $('testResult').textContent = '';
    openSheet($('editSheet'));
    setTimeout(function () { if (!p) $('fName').focus(); }, 250);
  }
  $('editCancel').addEventListener('click', closeSheet);
  $('editForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var url = $('fUrl').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      $('testResult').innerHTML = '<span class="st err">Apps Script 웹 앱 주소(https://script.google.com/…/exec)를 넣어 주세요.</span>';
      return;
    }
    var data = {
      name: $('fName').value.trim(),
      empId: $('fEmp').value.trim(),
      sheet: $('fTab').value.trim(),
      url: url,
      secret: $('fSecret').value,
      sheetLink: $('fSheetLink').value.trim(),
      confirm: $('fConfirm').checked,
      askMemo: $('fMemo').checked,
    };
    if (!data.name) return;
    var p = state.people.filter(function (x) { return x.id === editingId; })[0];
    if (p) Object.assign(p, data);
    else { p = Object.assign({ id: uid() }, data); state.people.push(p); }
    state.current = p.id;
    save(); render(); closeSheet();
    toast('저장했어요');
  });
  $('delPerson').addEventListener('click', function () {
    var p = state.people.filter(function (x) { return x.id === editingId; })[0];
    if (!p || !confirm(p.name + '님 설정과 이 기기의 기록 내역을 지울까요?\n(구글 시트의 기록은 그대로 남아요)')) return;
    state.people = state.people.filter(function (x) { return x.id !== p.id; });
    state.queue = state.queue.filter(function (q) { return q.pid !== p.id; });
    delete state.history[p.id];
    if (state.current === p.id) state.current = state.people[0] ? state.people[0].id : null;
    save(); render(); closeSheet();
  });
  $('testBtn').addEventListener('click', function () {
    var url = $('fUrl').value.trim();
    var out = $('testResult');
    if (!url) { out.innerHTML = '<span class="st err">주소를 먼저 넣어 주세요.</span>'; return; }
    out.innerHTML = '<span class="st">확인하는 중…</span>';
    post(url, { action: 'ping', secret: $('fSecret').value }).then(function (r) {
      out.innerHTML = r.ok ? '<span class="st ok">연결됐어요! 시트 서버 시각 ' + esc(r.time || '') + '</span>'
        : '<span class="st err">' + esc(r.error || '연결 실패') + '</span>';
    }, function (err) {
      out.innerHTML = '<span class="st err">연결 실패: ' + esc(err.message) + ' (배포 권한이 "모든 사용자"인지 확인)</span>';
    });
  });

  // ---------- 출근 / 퇴근 ----------
  var ICON = {
    in: $('inBtn').querySelector('.ico').innerHTML,
    out: $('outBtn').querySelector('.ico').innerHTML,
  };
  var pendingType = null;

  function press(type) {
    var p = me();
    if (!p || !p.url) { showEdit(p ? p.id : null); toast('먼저 설정을 해 주세요'); return; }
    var label = type === 'in' ? '출근' : '퇴근';
    var today = ymd(new Date());
    var already = hist(p).some(function (h) { return h.date === today && h.type === type; });
    var noIn = type === 'out' && !hist(p).some(function (h) { return h.date === today && h.type === 'in'; });
    if (!p.confirm && !p.askMemo && !already && !noIn) { record(type, ''); return; }

    pendingType = type;
    var ico = $('confirmIco');
    ico.innerHTML = ICON[type];
    ico.style.background = type === 'in' ? 'var(--in-soft)' : 'var(--out-soft)';
    ico.style.color = type === 'in' ? 'var(--in)' : 'var(--out)';
    ico.querySelector('svg').setAttribute('width', '44');
    ico.querySelector('svg').setAttribute('height', '44');
    $('confirmTitle').textContent = p.name + '님 ' + label + '할까요?';
    var desc = hm(new Date()) + ' 으로 "' + (p.sheet || p.name) + '" 탭에 기록돼요.';
    if (already) desc = '오늘 이미 ' + label + ' 기록이 있어요. ' + (type === 'in' ? '시트에는 첫 출근 시각이 유지돼요.' : '시트의 퇴근 시각이 지금으로 바뀌어요.');
    else if (noIn) desc = '오늘 출근 기록이 없어요. 그래도 퇴근을 기록할까요?';
    $('confirmDesc').textContent = desc;
    $('memoField').hidden = !p.askMemo;
    $('fMemoText').value = '';
    $('confirmYes').className = 'btn ' + (type === 'in' ? 'in' : 'primary');
    $('confirmYes').textContent = label + ' 기록';
    openSheet($('confirmSheet'));
  }
  $('inBtn').addEventListener('click', function () { press('in'); });
  $('outBtn').addEventListener('click', function () { press('out'); });
  $('confirmNo').addEventListener('click', closeSheet);
  $('confirmYes').addEventListener('click', function () {
    var t = pendingType, memo = $('fMemoText').value.trim();
    closeSheet();
    if (t) record(t, memo);
  });

  function record(type, memo) {
    var p = me();
    var now = new Date();
    var entry = { id: uid(), type: type, ts: now.getTime(), date: ymd(now), memo: memo, status: 'sending' };
    state.history[p.id] = [entry].concat(hist(p)).slice(0, 60);
    save(); render();
    if (navigator.vibrate) navigator.vibrate(30);

    var payload = {
      type: type, name: p.name, empId: p.empId, sheet: p.sheet, memo: memo,
      secret: p.secret, clientTime: now.toISOString(),
    };
    send(p, entry, payload, false);
  }

  function send(p, entry, payload, fromQueue) {
    if (fromQueue) payload.queued = true;
    return post(p.url, payload).then(function (r) {
      if (!r.ok) throw Object.assign(new Error(r.error || '시트 오류'), { fatal: true });
      entry.status = 'ok';
      delete entry.error;
      if (!fromQueue) toast((payload.type === 'in' ? '출근' : '퇴근') + ' ' + (r.time || '').slice(0, 5) + ' 기록 완료' + (r.hours ? ' · 근무 ' + r.hours : ''));
      save(); render();
      return true;
    }).catch(function (err) {
      if (err.fatal) {
        // 비밀키 틀림 등: 다시 보내도 같은 결과라 대기열에 넣지 않음
        entry.status = 'error';
        entry.error = err.message;
        toast('기록 실패: ' + err.message);
      } else {
        entry.status = 'queued';
        if (!state.queue.some(function (q) { return q.entryId === entry.id; })) {
          state.queue.push({ pid: p.id, entryId: entry.id, payload: payload });
        }
        if (!fromQueue) toast('인터넷 문제로 보관했어요. 연결되면 다시 보내요');
      }
      save(); render();
      return false;
    });
  }

  // 대기열 다시 보내기 (순서대로)
  var flushing = false;
  function flush() {
    if (flushing || !state.queue.length) return;
    flushing = true;
    var items = state.queue.slice();
    state.queue = [];
    var sent = 0;
    items.reduce(function (chain, q) {
      return chain.then(function () {
        var p = state.people.filter(function (x) { return x.id === q.pid; })[0];
        if (!p) return;
        var entry = hist(p).filter(function (h) { return h.id === q.entryId; })[0] || { id: q.entryId };
        return send(p, entry, q.payload, true).then(function (ok) { if (ok) sent++; });
      });
    }, Promise.resolve()).then(function () {
      flushing = false;
      if (sent) toast('보관된 기록 ' + sent + '건을 시트에 보냈어요');
      render();
    });
  }
  $('queueRetry').addEventListener('click', flush);
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });

  // Apps Script 웹 앱 호출. text/plain 으로 보내야 CORS 사전요청 없이 동작해요.
  function post(url, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (txt) {
      try { return JSON.parse(txt); } catch (e) {
        throw Object.assign(new Error('시트 응답을 읽지 못했어요 (웹 앱 배포 설정 확인)'), { fatal: true });
      }
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  // 첫 실행이면 바로 설정 열기
  render();
  if (!state.people.length) setTimeout(function () { showEdit(null); }, 400);
  else flush();
})();
