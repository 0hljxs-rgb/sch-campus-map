/**
 * 출퇴근 기록 – Google Apps Script (구글 시트에 붙여 넣어 쓰는 서버 코드)
 *
 * 설치 방법은 attendance/README.md 를 보세요. 요약:
 *   1) 구글 시트 열기 → 확장 프로그램 → Apps Script
 *   2) 이 파일 내용을 통째로 붙여 넣고 저장
 *   3) 아래 SECRET 을 원하는 값으로 바꾸기 (비워 두면 검사 안 함)
 *   4) 배포 → 새 배포 → 유형: 웹 앱
 *        실행 사용자: 나 / 액세스 권한: 모든 사용자
 *   5) 나온 "웹 앱 URL" 을 출퇴근 앱의 설정에 붙여 넣기
 *
 * 시트 구성 (자동으로 만들어져요)
 *   - "전체기록" 탭 : 버튼이 눌릴 때마다 한 줄씩 쌓이는 원본 로그
 *   - 사람별 탭     : 하루 한 줄 (날짜 | 출근 | 퇴근 | 근무시간 | 메모)
 *                    탭 이름은 앱 설정의 "시트 탭 이름" (비우면 이름)
 */

// 앱 설정의 "비밀키" 와 똑같이 맞춰 주세요. 비워 두면('') 검사하지 않아요.
var SECRET = '';

var TZ = 'Asia/Seoul';
var LOG_SHEET = '전체기록';
var LOG_HEADER = ['기록시각', '날짜', '시각', '구분', '이름', '사번/소속', '탭', '기기시각', '메모'];
var PERSON_HEADER = ['날짜', '출근', '퇴근', '근무시간', '메모'];

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_(handle_(body));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// 브라우저에서 URL 을 직접 열었을 때 연결 확인용
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'ping') return json_({ ok: true, pong: true, time: now_().stamp });
  return json_({ ok: true, message: '출퇴근 기록 서버가 동작 중이에요.' });
}

function handle_(b) {
  if (b.action === 'ping') {
    if (SECRET && b.secret !== SECRET) return { ok: false, error: '비밀키가 맞지 않아요.' };
    return { ok: true, pong: true, time: now_().stamp };
  }
  if (SECRET && b.secret !== SECRET) return { ok: false, error: '비밀키가 맞지 않아요.' };

  var type = b.type === 'in' ? '출근' : b.type === 'out' ? '퇴근' : '';
  if (!type) return { ok: false, error: '구분(type)이 잘못됐어요.' };
  var name = clean_(b.name);
  if (!name) return { ok: false, error: '이름이 비어 있어요.' };
  var tab = tabName_(b.sheet) || tabName_(name);
  var memo = clean_(b.memo);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = now_();
    // 오프라인으로 쌓였다가 나중에 보낸 기록이면 기기에서 누른 시각을 사용
    if (b.queued && b.clientTime) {
      var ct = new Date(b.clientTime);
      if (!isNaN(ct.getTime())) t = fmt_(ct);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var log = sheet_(ss, LOG_SHEET, LOG_HEADER);
    log.appendRow([t.stamp, t.date, t.time, type, name, clean_(b.empId), tab, clean_(b.clientTime), memo]);

    var ps = sheet_(ss, tab, PERSON_HEADER);
    var hours = upsertDay_(ps, t, type, memo);

    return { ok: true, type: type, name: name, date: t.date, time: t.time, hours: hours, sheet: tab };
  } finally {
    lock.releaseLock();
  }
}

// 사람별 탭: 날짜당 한 줄. 출근은 그날 처음 누른 시각, 퇴근은 마지막으로 누른 시각.
function upsertDay_(sh, t, type, memo) {
  var last = sh.getLastRow();
  var row = 0;
  if (last >= 2) {
    var dates = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (var i = dates.length - 1; i >= 0; i--) {
      if (dates[i][0] === t.date) { row = i + 2; break; }
    }
  }
  if (!row) {
    row = last + 1;
    sh.getRange(row, 1).setNumberFormat('@').setValue(t.date);
  }
  var cells = sh.getRange(row, 2, 1, 4);
  cells.setNumberFormat('@');
  var v = cells.getDisplayValues()[0]; // [출근, 퇴근, 근무시간, 메모]
  if (type === '출근') {
    if (!v[0]) v[0] = t.time;
  } else {
    v[1] = t.time;
  }
  if (memo) v[3] = v[3] ? v[3] + ' / ' + memo : memo;
  v[2] = v[0] && v[1] ? diff_(v[0], v[1]) : '';
  cells.setValues([v]);
  return v[2];
}

function diff_(a, b) {
  var m = toMin_(b) - toMin_(a);
  if (m < 0) m += 24 * 60; // 자정 넘겨 퇴근
  return Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
}

function toMin_(s) {
  var p = String(s).split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

function sheet_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#eef2f7');
    sh.setFrozenRows(1);
  }
  return sh;
}

function now_() { return fmt_(new Date()); }

function fmt_(d) {
  return {
    stamp: Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm:ss'),
    date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'),
    time: Utilities.formatDate(d, TZ, 'HH:mm:ss'),
  };
}

// 셀에 들어갈 글자: 길이 제한 + 수식 주입 방지
function clean_(s) {
  s = String(s == null ? '' : s).trim().slice(0, 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

// 시트 탭 이름에 못 쓰는 글자 제거
function tabName_(s) {
  return String(s == null ? '' : s).replace(/[\[\]\*\?\/\\:']/g, ' ').trim().slice(0, 80);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
