// ============================================================
//  다음 라이브 예약 시간표
// ============================================================

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

function populateTimeSelects() {
  const pad = (n) => String(n).padStart(2, '0');
  const hourSelect = document.getElementById('newLiveScheduleHour');
  const minuteSelect = document.getElementById('newLiveScheduleMinute');
  hourSelect.innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${pad(h)}">${pad(h)}</option>`).join('');
  minuteSelect.innerHTML = Array.from({ length: 60 }, (_, m) => `<option value="${pad(m)}">${pad(m)}</option>`).join('');
}

async function addLiveSchedule() {
  const dateInput = document.getElementById('newLiveScheduleDate');
  const hourSelect = document.getElementById('newLiveScheduleHour');
  const minuteSelect = document.getElementById('newLiveScheduleMinute');
  const idInput = document.getElementById('newLiveScheduleBroadcastId');
  const date = dateInput.value;
  const broadcastId = idInput.value.trim();

  if (!date || !broadcastId) { alert('시작 날짜와 라이브 아이디를 모두 입력해주세요.'); return; }
  if (!/^\d+$/.test(broadcastId)) { alert('라이브 아이디는 숫자만 입력해주세요.'); return; }

  const datetime = `${date}T${hourSelect.value}:${minuteSelect.value}:00+09:00`; // 한국 표준시(KST, UTC+9) 고정 오프셋을 명시해 타임존 오차를 방지합니다.
  const { error } = await supabaseClient.from('live_schedule').insert({ datetime, broadcast_id: broadcastId });
  if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  dateInput.value = ''; hourSelect.value = '00'; minuteSelect.value = '00'; idInput.value = '';
  showSaveStatus('저장됨 ✓', 'ok');
  await loadLiveSchedule();
}

