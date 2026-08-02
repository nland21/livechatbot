// ============================================================
//  로컬PC 상태 — "로컬PC 상태" 사이드바 탭에 PC별 카드 목록으로 표시합니다.
//  (기능 켜짐/꺼짐, LIVE 뱃지, 원격 로그아웃/시작·정지)
// ============================================================

let accounts = []; // accounts.js에서도 씀 (계정 관리와 로컬PC 상태 표시가 이 화면에서 함께 쓰입니다)

let liveBroadcastIds = new Set(); // 현재 어떤 PC든 열어두고 있는 라이브 아이디 (LIVE 뱃지 판단용)
const LIVE_BROADCAST_FRESHNESS_MS = 2 * 60 * 1000; // 2분 넘게 갱신 안 된 보고는 오래된 것으로 보고 무시합니다.

async function refreshDeviceStatus() {
  const { data, error } = await supabaseClient
    .from('device_status')
    .select('*')
    .order('last_seen_at', { ascending: false });

  if (error) {
    // 조용히 무시하지 않고 콘솔에 남깁니다. (예: 컬럼이 없거나 권한 문제일 때 여기서 확인 가능)
    console.error('[관리자 웹페이지] device_status 조회 실패:', error.message || error);
  }
  const devices = !error && data ? data : [];

  // "지금 라이브 중"으로 볼 수 있는 아이디 집합을 갱신합니다. (신선도 2분 이내인 것만 인정)
  const now = Date.now();
  const nextLiveBroadcastIds = new Set();
  devices.forEach((d) => {
    if (!d.current_broadcast_id) return;
    if (now - new Date(d.last_seen_at).getTime() > LIVE_BROADCAST_FRESHNESS_MS) return;
    nextLiveBroadcastIds.add(String(d.current_broadcast_id));
  });
  const changed = nextLiveBroadcastIds.size !== liveBroadcastIds.size ||
    [...nextLiveBroadcastIds].some((id) => !liveBroadcastIds.has(id));
  liveBroadcastIds = nextLiveBroadcastIds;
  if (changed) renderLiveScheduleList();

  renderDevicesSummaryPill(devices, error);
  renderDeviceCards(devices);
}

// ------------------------------- 시간 표시 -------------------------------
function formatRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

// 카드 안 "접속시간" 항목은 상대시간이 아니라 "년-월-일 시:분:초" 절대시간으로 보여줍니다.
function formatFullDatetime(isoString) {
  const d = new Date(isoString);
  if (!isoString || Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ------------------------------- 상단 요약 배지 -------------------------------
// "OO대 정상 (마지막 확인: 00분 전)" — 탭 상단에 항상 보이는 한 줄 요약입니다.
function renderDevicesSummaryPill(devices, error) {
  const pill = document.getElementById('devicesSummaryPill');
  if (!pill) return;

  if (error || devices.length === 0) {
    pill.className = 'device-status-pill none';
    pill.textContent = '⚪ 보고된 PC 없음';
    return;
  }

  const trouble = devices.find((d) => d.session_ok === false);
  if (trouble) {
    pill.className = 'device-status-pill warn';
    pill.textContent = `🔴 ${trouble.device_name} 로그인 끊김 (${formatRelativeTime(trouble.last_seen_at)})`;
    pill.title = trouble.last_error || '';
    return;
  }

  const newest = devices[0];
  pill.className = 'device-status-pill ok';
  pill.textContent = `🟢 ${devices.length}대 정상 (마지막 확인: ${formatRelativeTime(newest.last_seen_at)})`;
  pill.title = '';
}

// ------------------------------- 상태 판정 헬퍼 -------------------------------
// 로컬PC(확장 프로그램)가 보고를 멈춘 지 오래됐으면(2분 초과) "정보가 오래됨"으로 보고,
// 접속 상태를 더 이상 신뢰할 수 없는 것으로 취급합니다.
function isDeviceStale(d) {
  return Date.now() - new Date(d.last_seen_at).getTime() > LIVE_BROADCAST_FRESHNESS_MS;
}

function connectionStatusOf(d, stale) {
  if (d.session_ok === false) return { emoji: '🔴', text: '오류', cls: 'err' };
  if (stale) return { emoji: '⚪', text: '연결 끊김', cls: 'off' };
  return { emoji: '🟢', text: '연결 중', cls: 'ok' };
}

function dashboardStatusOf(d, stale) {
  if (!d.current_broadcast_id) return { emoji: '⚪', text: '선택되어 있지 않음', cls: 'off' };
  if (d.session_ok === false || stale) return { emoji: '🔴', text: '오류', cls: 'err' };
  return { emoji: '🟢', text: `선택되어 활성화 중 (라이브 ${d.current_broadcast_id})`, cls: 'ok' };
}

// PC 자체가 세션 오류 상태(접속 상태=🔴)라면, 예약문구/키워드/AI 토글값이 켜져 있어도
// 실제로는 동작하지 않는 상태이므로 개별 값과 무관하게 "오류"로 함께 표시합니다.
function featureStatusOf(value, deviceHasError) {
  if (deviceHasError) return { emoji: '🔴', text: '오류', cls: 'err' };
  if (value === true) return { emoji: '🟢', text: '사용중', cls: 'ok' };
  if (value === false) return { emoji: '⚪', text: '정지중', cls: 'off' };
  return { emoji: '⚪', text: '정보 없음', cls: 'off' }; // 구버전 확장 프로그램이라 아직 이 정보를 안 보내는 경우
}

function botStatusOf(d) {
  if (d.bot_running === true) return { emoji: '🟢', text: '시작상태', cls: 'ok' };
  if (d.bot_running === false) return { emoji: '⚪', text: '정지상태', cls: 'off' };
  return { emoji: '⚪', text: '정보 없음', cls: 'off' };
}

function statusValueHtml(status) {
  return `<span class="status-value ${status.cls}">${status.emoji} ${escapeHtml(status.text)}</span>`;
}

// ------------------------------- 카드 목록 렌더 -------------------------------
function renderDeviceCards(devices) {
  const wrap = document.getElementById('deviceCardList');
  if (!wrap) return;

  if (devices.length === 0) {
    wrap.innerHTML = '<p class="empty-hint">아직 이 서버에 연동된 로컬 PC가 없습니다. 확장 프로그램 옵션 페이지 &gt; 서버 연동에서 로그인하면 여기에 나타납니다.</p>';
    return;
  }

  wrap.innerHTML = '';

  devices.forEach((d) => {
    const stale = isDeviceStale(d);
    const conn = connectionStatusOf(d, stale);
    const dash = dashboardStatusOf(d, stale);
    const deviceHasError = conn.cls === 'err';
    const bot = botStatusOf(d);
    const scheduled = featureStatusOf(d.scheduled_enabled, deviceHasError);
    const keyword = featureStatusOf(d.keyword_enabled, deviceHasError);
    const ai = featureStatusOf(d.ai_enabled, deviceHasError);
    const hasRunningInfo = d.bot_running !== null && d.bot_running !== undefined;
    const skillsNote = d.ai_enabled && d.enabled_skills_count !== null && d.enabled_skills_count !== undefined
      ? ` (스킬 ${d.enabled_skills_count}개 활성)` : '';
    const reloginConfigured = !!d.relogin_configured;

    const card = document.createElement('div');
    card.className = 'card device-card';
    card.innerHTML = `
      <div class="device-card-header">
        <span class="device-card-name">🖥️ ${escapeHtml(d.device_name)}</span>
        ${stale ? `<span class="feature-stale">정보 오래됨 · ${escapeHtml(formatRelativeTime(d.last_seen_at))}</span>` : ''}
      </div>

      <div class="device-row"><span class="device-row-label">접속 상태</span>${statusValueHtml(conn)}</div>
      <div class="device-row"><span class="device-row-label">로컬 PC 이름</span><span class="device-row-value">${escapeHtml(d.device_name)}</span></div>
      <div class="device-row"><span class="device-row-label">로컬 PC 계정</span><span class="device-row-value">${escapeHtml(d.account_email || '확인 불가')}</span></div>
      <div class="device-row"><span class="device-row-label">라이브 상황판</span>${statusValueHtml(dash)}</div>
      <div class="device-row"><span class="device-row-label">재로그인 설정</span><span class="status-value ${reloginConfigured ? 'ok' : 'off'}">${reloginConfigured ? '🔑 설정됨' : '⚪ 설정 안 됨'}</span></div>

      <hr class="device-row-divider" />

      <div class="device-row">
        <span class="device-row-label">자동채팅 상태</span>
        <span class="device-row-value">
          ${statusValueHtml(bot)}
          ${hasRunningInfo ? `<button class="btn btn-outline btn-sm device-run-toggle-btn" data-device="${escapeHtml(d.device_name)}" data-command="${d.bot_running ? 'stop' : 'start'}">${d.bot_running ? '⏹️ 정지' : '▶️ 시작'}</button>` : ''}
        </span>
      </div>
      <div class="device-row"><span class="device-row-label">예약 문구</span>${statusValueHtml(scheduled)}</div>
      <div class="device-row"><span class="device-row-label">키워드 채팅</span>${statusValueHtml(keyword)}</div>
      <div class="device-row"><span class="device-row-label">AI스킬 채팅</span><span class="device-row-value">${statusValueHtml(ai)}${skillsNote ? `<span style="color:var(--sub);font-weight:400;">${escapeHtml(skillsNote)}</span>` : ''}</span></div>

      <hr class="device-row-divider" />

      <div class="device-row"><span class="device-row-label">접속시간</span><span class="device-row-value">${escapeHtml(formatFullDatetime(d.last_seen_at))}</span></div>

      <div class="device-card-footer">
        <button class="btn btn-outline btn-sm device-reload-btn" data-device="${escapeHtml(d.device_name)}" title="이 PC의 브라우저 탭을 새로고침합니다 (라이브 상황판 연결이 끊겼을 때)">🔄 새로고침</button>
        <button class="btn btn-outline btn-sm device-login-btn" data-device="${escapeHtml(d.device_name)}" title="${reloginConfigured ? '재로그인 단계를 순서대로 실행합니다' : '로컬PC 옵션 페이지에서 재로그인 단계를 먼저 지정해주세요'}" ${reloginConfigured ? '' : 'disabled'}>🔑 로그인</button>
      </div>
      <div class="device-card-footer">
        <button class="btn btn-outline btn-sm device-logout-btn" data-device="${escapeHtml(d.device_name)}">🔌 로그아웃</button>
        <button class="btn-danger-outline device-delete-btn" data-device="${escapeHtml(d.device_name)}">DB삭제</button>
      </div>
    `;
    wrap.appendChild(card);
  });

  wrap.querySelectorAll('.device-run-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => sendRemoteRunCommand(btn.dataset.device, btn.dataset.command));
  });
  wrap.querySelectorAll('.device-reload-btn').forEach((btn) => {
    btn.addEventListener('click', () => sendRemoteRunCommand(btn.dataset.device, 'reload'));
  });
  wrap.querySelectorAll('.device-login-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm(`"${btn.dataset.device}" PC에서 등록해둔 순서대로 재로그인을 실행할까요?`)) return;
      sendRemoteRunCommand(btn.dataset.device, 'login');
    });
  });
  wrap.querySelectorAll('.device-logout-btn').forEach((btn) => {
    btn.addEventListener('click', () => requestDeviceLogout(btn.dataset.device));
  });
  wrap.querySelectorAll('.device-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteDeviceStatus(btn.dataset.device));
  });
}

// 해당 PC에 "▶ 시작"/"■ 정지"/"🔄 새로고침"/"🔑 로그인" 신호를 보냅니다. 그 PC가 다음 상태
// 보고 주기(최대 20초 이내)에 이 신호를 확인해서 실제로 실행합니다.
async function sendRemoteRunCommand(deviceName, command) {
  const label = { start: '시작', stop: '정지', reload: '새로고침', login: '로그인' }[command] || command;
  const { error } = await supabaseClient
    .from('device_status')
    .update({ remote_command: command })
    .eq('device_name', deviceName);
  if (error) { showSaveStatus(`원격 ${label} 요청 실패: ` + error.message, 'err'); return; }
  showSaveStatus(`"${deviceName}" 원격 ${label} 요청됨 ✓ (최대 20초 후 반영)`, 'ok');
  await refreshDeviceStatus();
}

// 해당 PC에 "원격 로그아웃 신호"를 보냅니다. 그 PC의 확장 프로그램이 다음 상태 보고
// 주기(최대 20초)에 이 신호를 확인하고 스스로 로그아웃합니다. (서비스 키 없이 안전하게 동작)
async function requestDeviceLogout(deviceName) {
  if (!confirm(`"${deviceName}" PC를 원격으로 로그아웃할까요?\n\n그 PC가 서버와 통신하는 다음 주기(최대 20초 이내)에 자동으로 로그아웃됩니다.`)) return;
  const { error } = await supabaseClient
    .from('device_status')
    .update({ logout_requested: true })
    .eq('device_name', deviceName);
  if (error) { showSaveStatus('로그아웃 요청 실패: ' + error.message, 'err'); return; }
  showSaveStatus(`"${deviceName}" 로그아웃 요청됨 ✓ (최대 20초 후 반영)`, 'ok');
  await refreshDeviceStatus();
}

// 목록에서 이 PC 항목을 완전히 지웁니다. (그 PC가 지금도 접속 중이라면, 먼저 "로그아웃"을
// 눌러서 끊어주신 뒤 삭제하시는 걸 권장합니다 — 접속 중에 삭제해도 그 PC가 곧 다시 보고하면
// 목록에 재등록될 수 있습니다)
async function deleteDeviceStatus(deviceName) {
  if (!confirm(`"${deviceName}" 기록을 서버에서 완전히 삭제할까요?\n\n이 PC가 아직 접속 중이라면, 삭제해도 다음 보고 때 목록에 다시 나타날 수 있습니다.\n접속을 끊으시려면 먼저 "로그아웃"을 이용해주세요.`)) return;

  // 혹시 지금도 접속 중이라면 최소한 로그아웃 신호는 함께 남겨둡니다. (best-effort)
  await supabaseClient.from('device_status').update({ logout_requested: true }).eq('device_name', deviceName);

  const { error } = await supabaseClient.from('device_status').delete().eq('device_name', deviceName);
  if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
  showSaveStatus(`"${deviceName}" 삭제됨 ✓`, 'ok');
  await refreshDeviceStatus();
}
