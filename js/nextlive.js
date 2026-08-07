// ============================================================
//  다음 라이브 예약 시간표
// ============================================================

// ------------------------------- 자유 입력 날짜 파싱 -------------------------------
// "0609" / "06.09" / "6월9일" / "20260609" / "260609" / "2026-06-09" / "2026년 6월 9일"
// 형태를 모두 인식합니다. 연도를 안 쓰면 올해 기준으로 채웁니다.
function parseFlexibleDate(raw, refDate = new Date()) {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  const buildDate = (year, month, day) => {
    if (!year || !month || !day) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    // new Date()는 "2월 30일" 같은 잘못된 날짜를 다음 달로 슬쩍 넘겨버리므로, 그대로
    // 되돌아오는지 확인해서 진짜 존재하는 날짜인지 검증합니다.
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return { year, month, day };
  };

  // "2026년 6월 9일" 또는 "6월 9일" (공백 유무 무관)
  let m = s.match(/^(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/);
  if (m) return buildDate(m[1] ? Number(m[1]) : refDate.getFullYear(), Number(m[2]), Number(m[3]));

  // 구분자가 있는 형식: 2026-06-09 / 2026.06.09 / 2026/06/09
  m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return buildDate(Number(m[1]), Number(m[2]), Number(m[3]));

  // 연도 없이 구분자만: 06.09 / 06-09 / 06/09
  m = s.match(/^(\d{1,2})[-./](\d{1,2})$/);
  if (m) return buildDate(refDate.getFullYear(), Number(m[1]), Number(m[2]));

  // 숫자만 입력: 4자리(MMDD) / 6자리(YYMMDD) / 8자리(YYYYMMDD)
  m = s.match(/^(\d{4}|\d{6}|\d{8})$/);
  if (m) {
    const digits = m[1];
    if (digits.length === 8) return buildDate(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
    if (digits.length === 6) return buildDate(2000 + Number(digits.slice(0, 2)), Number(digits.slice(2, 4)), Number(digits.slice(4, 6)));
    return buildDate(refDate.getFullYear(), Number(digits.slice(0, 2)), Number(digits.slice(2, 4)));
  }

  return null;
}

function formatDateForStorage(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

// ------------------------------- 자유 입력 시각 파싱 -------------------------------
// "6:30" / "18:30" / "0630" / "오전 6시 30분" / "오후 6시 30분" / "오후 6:30" /
// "저녁 6시" / "아침 9시" 형태를 모두 인식해서 항상 24시간제로 돌려줍니다.
// 오전/오후(아침/저녁) 없이 입력하면 그 숫자를 그대로 24시간제로 인식합니다.
function parseFlexibleTime(raw) {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  let period = null; // 'am' | 'pm' | null
  if (/오전|아침/.test(s)) period = 'am';
  else if (/오후|저녁/.test(s)) period = 'pm';
  s = s.replace(/오전|오후|아침|저녁/g, '').trim();

  let hour;
  let minute;
  let m = s.match(/^(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분?)?$/); // "6시", "6시 30분"
  if (m) {
    hour = Number(m[1]);
    minute = m[2] ? Number(m[2]) : 0;
  } else {
    m = s.match(/^(\d{1,2}):(\d{1,2})$/); // "6:30", "18:30"
    if (m) {
      hour = Number(m[1]);
      minute = Number(m[2]);
    } else {
      m = s.match(/^(\d{3,4})$/); // "630", "0630"
      if (m) {
        const digits = m[1].padStart(4, '0');
        hour = Number(digits.slice(0, 2));
        minute = Number(digits.slice(2, 4));
      }
    }
  }
  if (hour === undefined || minute === undefined || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (minute < 0 || minute > 59) return null;
  if (hour < 0 || hour > 23) return null;

  if (period === 'pm' && hour < 12) hour += 12; // 오후/저녁 1~11시 → 13~23시
  if (period === 'am' && hour === 12) hour = 0; // 오전/아침 12시 → 자정(0시)
  if (hour > 23) return null;

  return { hour, minute };
}

function formatTimeForStorage(t) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(t.hour)}:${pad(t.minute)}`;
}

// ------------------------------- 다음 라이브 예약 시간표 -------------------------------
function formatDatetime24h(dateObj) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

const BROADCAST_DURATION_MS = 2 * 60 * 60 * 1000; // 라이브 방송 시간(고정 2시간) — 이 시간이 지나면 "종료"로 표시합니다.

function renderLiveScheduleList() {
  const ul = document.getElementById('liveScheduleList');
  ul.innerHTML = '';
  if (liveSchedule.length === 0) {
    ul.innerHTML = '<li class="empty-hint">등록된 예약이 없습니다.</li>';
    return;
  }
  liveSchedule.forEach((entry) => {
    const li = document.createElement('li');
    const dt = new Date(entry.datetime);
    const dtLabel = Number.isNaN(dt.getTime()) ? entry.datetime : formatDatetime24h(dt);
    const isLive = liveBroadcastIds.has(String(entry.broadcast_id));
    const isEnded = !Number.isNaN(dt.getTime()) && Date.now() >= dt.getTime() + BROADCAST_DURATION_MS;
    if (isEnded) li.style.opacity = '0.55';
    li.innerHTML = `<span class="content"><b class="${isEnded ? 'ended-text' : ''}" style="color:var(--brand-dark);"></b> <span class="live-badge" style="display:${isLive ? 'inline-block' : 'none'};">LIVE</span><span class="ended-badge" style="display:${isEnded ? 'inline-block' : 'none'};">종료</span><br/><span class="bid ${isEnded ? 'ended-text' : ''}"></span></span><div class="li-actions"><button class="btn-danger-outline">삭제</button></div>`;
    li.querySelector('b').textContent = dtLabel;
    li.querySelector('.bid').textContent = `라이브 아이디: ${entry.broadcast_id}`;
    li.querySelector('button').addEventListener('click', async () => {
      if (!confirm('이 예약을 삭제할까요?')) return;
      const { error } = await supabaseClient.from('live_schedule').delete().eq('id', entry.id);
      if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
      showSaveStatus('삭제됨 ✓', 'ok');
      await loadLiveSchedule();
    });
    ul.appendChild(li);
  });
}

// 자유 입력 필드 + 달력/시계 버튼(네이티브 피커) 연동. 입력할 때마다 아래에 해석 결과를
// 미리 보여줘서, "이대로 저장하면 며칠/몇 시로 들어가는지" 헷갈리지 않게 합니다.
function setupFlexibleDateTimeInputs() {
  const dateText = document.getElementById('newLiveScheduleDateText');
  const datePreview = document.getElementById('newLiveScheduleDatePreview');
  const dateNative = document.getElementById('newLiveScheduleDateNative');
  const datePickerBtn = document.getElementById('newLiveScheduleDatePickerBtn');

  dateText.addEventListener('input', () => {
    const parsed = parseFlexibleDate(dateText.value);
    if (!dateText.value.trim()) { datePreview.textContent = ''; return; }
    datePreview.textContent = parsed ? `→ ${formatDateForStorage(parsed)}` : '⚠️ 인식할 수 없는 날짜 형식입니다';
    datePreview.style.color = parsed ? 'var(--brand-dark)' : '#c0392b';
  });
  datePickerBtn.addEventListener('click', () => {
    if (typeof dateNative.showPicker === 'function') dateNative.showPicker();
    else dateNative.click();
  });
  dateNative.addEventListener('change', () => {
    if (!dateNative.value) return;
    dateText.value = dateNative.value; // 네이티브 달력 값은 이미 YYYY-MM-DD라 그대로 사용
    dateText.dispatchEvent(new Event('input'));
  });

  const timeText = document.getElementById('newLiveScheduleTimeText');
  const timePreview = document.getElementById('newLiveScheduleTimePreview');
  const timeNative = document.getElementById('newLiveScheduleTimeNative');
  const timePickerBtn = document.getElementById('newLiveScheduleTimePickerBtn');

  timeText.addEventListener('input', () => {
    const parsed = parseFlexibleTime(timeText.value);
    if (!timeText.value.trim()) { timePreview.textContent = ''; return; }
    timePreview.textContent = parsed ? `→ ${formatTimeForStorage(parsed)} (24시간제)` : '⚠️ 인식할 수 없는 시각 형식입니다';
    timePreview.style.color = parsed ? 'var(--brand-dark)' : '#c0392b';
  });
  timePickerBtn.addEventListener('click', () => {
    if (typeof timeNative.showPicker === 'function') timeNative.showPicker();
    else timeNative.click();
  });
  timeNative.addEventListener('change', () => {
    if (!timeNative.value) return;
    timeText.value = timeNative.value.slice(0, 5); // 네이티브 시계 값도 이미 HH:MM
    timeText.dispatchEvent(new Event('input'));
  });
}

async function addLiveSchedule() {
  const dateText = document.getElementById('newLiveScheduleDateText');
  const timeText = document.getElementById('newLiveScheduleTimeText');
  const datePreview = document.getElementById('newLiveScheduleDatePreview');
  const timePreview = document.getElementById('newLiveScheduleTimePreview');
  const idInput = document.getElementById('newLiveScheduleBroadcastId');

  const parsedDate = parseFlexibleDate(dateText.value);
  const parsedTime = parseFlexibleTime(timeText.value);
  const broadcastId = idInput.value.trim();

  if (!dateText.value.trim() || !parsedDate) { alert('시작 날짜를 알아볼 수 있는 형식으로 입력해주세요. (예: 0609, 06.09, 6월9일, 2026-06-09)'); return; }
  if (!timeText.value.trim() || !parsedTime) { alert('시작 시각을 알아볼 수 있는 형식으로 입력해주세요. (예: 18:30, 오후 6시 30분, 0630)'); return; }
  if (!broadcastId) { alert('라이브 아이디를 입력해주세요.'); return; }
  if (!/^\d+$/.test(broadcastId)) { alert('라이브 아이디는 숫자만 입력해주세요.'); return; }

  const date = formatDateForStorage(parsedDate);
  const time = formatTimeForStorage(parsedTime);
  const datetime = `${date}T${time}:00+09:00`; // 한국 표준시(KST, UTC+9) 고정 오프셋을 명시해 타임존 오차를 방지합니다.
  const { error } = await supabaseClient.from('live_schedule').insert({ datetime, broadcast_id: broadcastId });
  if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  dateText.value = ''; timeText.value = ''; idInput.value = '';
  datePreview.textContent = ''; timePreview.textContent = '';
  showSaveStatus('저장됨 ✓', 'ok');
  await loadLiveSchedule();
}

