// ============================================================
//  로컬PC 상태 표시 (기능 켜짐/꺼짐, LIVE 뱃지, 원격 로그아웃/시작/정지)
// ============================================================

let accounts = []; // accounts.js에서도 씀 (계정 관리와 로컬PC 상태 표시가 이 화면에서 함께 쓰입니다)

let liveBroadcastIds = new Set(); // 현재 어떤 PC든 열어두고 있는 라이브 아이디 (LIVE 뱃지 판단용)
const LIVE_BROADCAST_FRESHNESS_MS = 2 * 60 * 1000; // 2분 넘게 갱신 안 된 보고는 오래된 것으로 보고 무시합니다.

async function refreshDeviceStatus() {
  const pill = document.getElementById('deviceStatusPill');

  const { data, error } = await supabaseClient
    .from('device_status')
    .select('*')
    .order('last_seen_at', { ascending: false });

  if (error) {
    // 조용히 무시하지 않고 콘솔에 남깁니다. (예: 컬럼이 없거나 권한 문제일 때 여기서 확인 가능)
    console.error('[관리자 웹페이지] device_status 조회 실패:', error.message || error);
  }

  // "지금 라이브 중"으로 볼 수 있는 아이디 집합을 갱신합니다. (신선도 2분 이내인 것만 인정)
  const now = Date.now();
  const nextLiveBroadcastIds = new Set();
  if (!error && data) {
    data.forEach((d) => {
      if (!d.current_broadcast_id) return;
      if (now - new Date(d.last_seen_at).getTime() > LIVE_BROADCAST_FRESHNESS_MS) return;
      nextLiveBroadcastIds.add(String(d.current_broadcast_id));
    });
  }
  const changed = nextLiveBroadcastIds.size !== liveBroadcastIds.size ||
    [...nextLiveBroadcastIds].some((id) => !liveBroadcastIds.has(id));
  liveBroadcastIds = nextLiveBroadcastIds;
  if (changed) renderLiveScheduleList();

  renderFeatureStatusBar(!error && data ? data : []);

  if (!pill) return;

  if (error || !data || data.length === 0) {
    pill.className = 'device-status-pill none';
    pill.textContent = '⚪ 보고된 PC 없음';
    return;
  }

  const trouble = data.find((d) => d.session_ok === false);
  if (trouble) {
    pill.className = 'device-status-pill warn';
    pill.textContent = `🔴 ${trouble.device_name} 로그인 끊김 (${formatRelativeTime(trouble.last_seen_at)})`;
    pill.title = trouble.last_error || '';
    return;
  }

  const newest = data[0];
  pill.className = 'device-status-pill ok';
  pill.textContent = `🟢 ${data.length}대 정상 (마지막 확인: ${formatRelativeTime(newest.last_seen_at)})`;
  pill.title = '';
}

function formatRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

// 로컬PC(들)의 "예약문구 / 키워드 자동답변 / AI 자동답변(스킬)" 켜짐·꺼짐 상태를 상단바 아래에 표시합니다.
let expandedDeviceName = null; // 지금 이름을 클릭해서 [로그아웃][DB삭제] 버튼이 펼쳐진 기기

function renderFeatureStatusBar(devices) {
  const bar = document.getElementById('deviceFeatureStatusBar');
  if (!bar) return;

  // scheduled_enabled 등이 null/undefined인 경우는, 아직 이 정보를 안 보내는 구버전 확장 프로그램이라는 뜻입니다.
  const reportingDevices = (devices || []).filter((d) => d.scheduled_enabled !== null && d.scheduled_enabled !== undefined);

  if (reportingDevices.length === 0) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  const now = Date.now();
  const chip = (label, on) =>
    `<span class="feature-chip ${on ? 'on' : ''}"><span class="dot"></span>${label} ${on ? '켜짐' : '꺼짐'}</span>`;

  bar.innerHTML = reportingDevices.map((d) => {
    const stale = now - new Date(d.last_seen_at).getTime() > LIVE_BROADCAST_FRESHNESS_MS;
    const skillsPart = d.ai_enabled && d.enabled_skills_count !== null && d.enabled_skills_count !== undefined
      ? ` <span style="color:var(--sub);">(스킬 ${d.enabled_skills_count}개 활성)</span>`
      : '';
    const isExpanded = expandedDeviceName === d.device_name;
    const actionsRow = isExpanded ? `
      <span class="device-actions">
        <button class="btn btn-outline btn-sm device-logout-btn" data-device="${escapeHtml(d.device_name)}">🔌 로그아웃</button>
        <button class="btn-danger-outline device-delete-btn" data-device="${escapeHtml(d.device_name)}">DB삭제</button>
      </span>` : '';
    const isRunning = !!d.bot_running;
    const hasRunningInfo = d.bot_running !== null && d.bot_running !== undefined;
    const runChip = hasRunningInfo
      ? `<span class="feature-chip ${isRunning ? 'on' : ''}"><span class="dot"></span>자동채팅 ${isRunning ? '실행중' : '정지됨'}</span>`
      : '';
    const runBtn = hasRunningInfo
      ? `<button class="btn btn-outline btn-sm device-run-toggle-btn" data-device="${escapeHtml(d.device_name)}" data-command="${isRunning ? 'stop' : 'start'}">${isRunning ? '■ 정지' : '▶ 시작'}</button>`
      : '';
    return `
      <button type="button" class="device-label-btn ${isExpanded ? 'expanded' : ''}" data-device="${escapeHtml(d.device_name)}">
        🖥️ ${escapeHtml(d.device_name)}${stale ? ' <span class="feature-stale">(정보 오래됨)</span>' : ''}
      </button>
      ${runChip} ${runBtn}
      ${actionsRow}
      ${chip('📝 예약문구', d.scheduled_enabled)}
      ${chip('💬 키워드', d.keyword_enabled)}
      ${chip('🤖 AI(스킬)', d.ai_enabled)}${skillsPart}
    `;
  }).join('<span style="color:var(--border);">│</span>');

  bar.style.display = 'flex';

  bar.querySelectorAll('.device-run-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendRemoteRunCommand(btn.dataset.device, btn.dataset.command);
    });
  });

  // 이름 클릭 → 로그아웃/DB삭제 버튼 펼치기·접기
  bar.querySelectorAll('.device-label-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.device;
      expandedDeviceName = expandedDeviceName === name ? null : name;
      renderFeatureStatusBar(devices);
    });
  });

  bar.querySelectorAll('.device-logout-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await requestDeviceLogout(btn.dataset.device);
    });
  });

  bar.querySelectorAll('.device-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteDeviceStatus(btn.dataset.device);
    });
  });
}

// 해당 PC에 "원격 로그아웃 신호"를 보냅니다. 그 PC의 확장 프로그램이 다음 상태 보고
// 주기(최대 20초)에 이 신호를 확인하고 스스로 로그아웃합니다. (서비스 키 없이 안전하게 동작)
// 그 PC에 "▶ 시작"/"■ 정지" 신호를 보냅니다. 그 PC가 다음 상태 보고 주기(최대 20초 이내)에
// 이 신호를 확인해서 실제로 자동채팅을 시작/정지합니다.
async function sendRemoteRunCommand(deviceName, command) {
  const label = command === 'start' ? '시작' : '정지';
  const { error } = await supabaseClient
    .from('device_status')
    .update({ remote_command: command })
    .eq('device_name', deviceName);
  if (error) { showSaveStatus(`원격 ${label} 요청 실패: ` + error.message, 'err'); return; }
  showSaveStatus(`"${deviceName}" 원격 ${label} 요청됨 ✓ (최대 20초 후 반영)`, 'ok');
  await refreshDeviceStatus();
}

async function requestDeviceLogout(deviceName) {
  if (!confirm(`"${deviceName}" PC를 원격으로 로그아웃할까요?\n\n그 PC가 서버와 통신하는 다음 주기(최대 20초 이내)에 자동으로 로그아웃됩니다.`)) return;
  const { error } = await supabaseClient
    .from('device_status')
    .update({ logout_requested: true })
    .eq('device_name', deviceName);
  if (error) { showSaveStatus('로그아웃 요청 실패: ' + error.message, 'err'); return; }
  showSaveStatus(`"${deviceName}" 로그아웃 요청됨 ✓ (최대 20초 후 반영)`, 'ok');
  expandedDeviceName = null;
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
  expandedDeviceName = null;
  await refreshDeviceStatus();
}

