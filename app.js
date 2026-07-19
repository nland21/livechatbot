// ============================================================
//  노트북랜드21 라이브 채팅 관리자 웹페이지 - app.js
// ============================================================

const supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

let currentSession = null;
let editingSkillId = null;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function showSaveStatus(text, kind) {
  const el = document.getElementById('saveStatus');
  el.textContent = text;
  el.className = 'save-status' + (kind ? ' ' + kind : '');
  if (kind === 'ok') {
    setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 2500);
  }
}

// ------------------------------- 로그인 -------------------------------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorBox = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmitBtn');

  errorBox.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = '로그인 중...';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  submitBtn.disabled = false;
  submitBtn.textContent = '로그인';

  if (error) {
    errorBox.textContent = '로그인에 실패했습니다: ' + error.message;
    errorBox.style.display = 'block';
    return;
  }
  await afterLogin(data.session);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

const ROLE_LABELS = {
  master_admin: '마스터관리자',
  admin: '관리자',
  web_admin: '웹관리자',
  local_manager: '로컬매니저',
};
const WEB_LOGIN_ALLOWED_ROLES = ['master_admin', 'admin', 'web_admin']; // 이 웹페이지에 로그인 가능한 역할

let currentUserRole = null;

async function afterLogin(session) {
  currentSession = session;

  const { data: roleRow, error } = await supabaseClient
    .from('user_roles')
    .select('role, display_name')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !roleRow || !WEB_LOGIN_ALLOWED_ROLES.includes(roleRow.role)) {
    alert(
      !roleRow
        ? '권한이 등록되지 않은 계정입니다. 마스터관리자에게 문의해주세요.'
        : '로컬매니저 계정은 이 웹페이지에 로그인할 수 없습니다. (로컬 PC 확장 프로그램 전용 계정입니다)'
    );
    await supabaseClient.auth.signOut();
    location.reload();
    return;
  }

  currentUserRole = roleRow.role;

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('whoAmI').textContent = `👤 ${roleRow.display_name || session.user.email} (${ROLE_LABELS[roleRow.role] || roleRow.role})`;
  document.getElementById('projectUrlLabel').textContent = new URL(SUPABASE_CONFIG.url).hostname;

  const isMaster = currentUserRole === 'master_admin';
  document.getElementById('accountsTabBtn').style.display = isMaster ? 'flex' : 'none';
  document.getElementById('masterGroupTitle').style.display = isMaster ? 'block' : 'none';

  populateTimeSelects();
  bindEvents();
  await loadAll();
  if (currentUserRole === 'master_admin') {
    await loadAccounts();
  }

  await refreshDeviceStatus();
  setInterval(refreshDeviceStatus, 30000); // 30초마다 PC 상태를 다시 확인합니다.
}

// 이미 로그인된 세션이 있으면(새로고침 시) 자동으로 이어서 로그인 처리합니다.
(async function initSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    await afterLogin(data.session);
  }
})();

// ------------------------------- 데이터 로드 -------------------------------
let scheduledMessages = [];
let keywordRules = [];
let aiSkills = [];
let liveSchedule = [];

async function loadAll() {
  await Promise.all([loadScheduled(), loadKeywords(), loadSkills(), loadLiveSchedule()]);
}

async function loadScheduled() {
  const { data, error } = await supabaseClient
    .from('scheduled_messages').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) { showSaveStatus('불러오기 실패: ' + error.message, 'err'); return; }
  scheduledMessages = data || [];
  renderScheduledList();
}

async function loadKeywords() {
  const { data, error } = await supabaseClient
    .from('keyword_rules').select('*').order('created_at', { ascending: true });
  if (error) { showSaveStatus('불러오기 실패: ' + error.message, 'err'); return; }
  keywordRules = data || [];
  renderKeywordList();
}

async function loadSkills() {
  const { data, error } = await supabaseClient
    .from('ai_skills').select('*').order('created_at', { ascending: true });
  if (error) { showSaveStatus('불러오기 실패: ' + error.message, 'err'); return; }
  aiSkills = data || [];
  renderSkills();
}

async function loadLiveSchedule() {
  const { data, error } = await supabaseClient
    .from('live_schedule').select('*').order('datetime', { ascending: true });
  if (error) { showSaveStatus('불러오기 실패: ' + error.message, 'err'); return; }
  liveSchedule = data || [];
  renderLiveScheduleList();
}

// ------------------------------- 예약 문구 -------------------------------
function renderScheduledList() {
  const ul = document.getElementById('scheduledList');
  ul.innerHTML = '';
  if (scheduledMessages.length === 0) {
    ul.innerHTML = '<li class="empty-hint">등록된 예약 문구가 없습니다.</li>';
    return;
  }
  scheduledMessages.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="content"></span><div class="li-actions"><button class="btn-danger-outline">삭제</button></div>`;
    li.querySelector('.content').textContent = item.text;
    li.querySelector('button').addEventListener('click', async () => {
      if (!confirm('이 예약 문구를 삭제할까요?')) return;
      const { error } = await supabaseClient.from('scheduled_messages').delete().eq('id', item.id);
      if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
      showSaveStatus('삭제됨 ✓', 'ok');
      await loadScheduled();
    });
    ul.appendChild(li);
  });
}

async function addScheduledMessage() {
  const textarea = document.getElementById('newScheduledText');
  const text = textarea.value.trim();
  if (!text) return;
  const { error } = await supabaseClient.from('scheduled_messages').insert({
    text, sort_order: scheduledMessages.length,
  });
  if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  textarea.value = '';
  showSaveStatus('저장됨 ✓', 'ok');
  await loadScheduled();
}

// ------------------------------- 키워드 자동답변 -------------------------------
function getSortedKeywordRules() {
  return [...keywordRules].sort((a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0));
}

function renderKeywordList() {
  const ul = document.getElementById('keywordList');
  ul.innerHTML = '';
  if (keywordRules.length === 0) {
    ul.innerHTML = '<li class="empty-hint">등록된 키워드 규칙이 없습니다.</li>';
    return;
  }
  getSortedKeywordRules().forEach((rule, i) => {
    const li = document.createElement('li');
    const joiner = rule.match_type === 'all' ? ' + ' : ' / ';
    const matchLabel = rule.match_type === 'all' ? '모두 포함' : '하나라도 포함';
    li.innerHTML = `
      <span class="content">
        <span class="priority-badge">우선순위 ${i + 1}</span>
        <span style="font-weight:700;color:var(--brand-dark);">[${(rule.keywords || []).join(joiner)}]</span>
        <span style="color:var(--sub);font-size:10.5px;">(${matchLabel}) →</span><br/>
        ${escapeHtml(rule.reply)}
      </span>
      <div class="li-actions"><button class="btn-danger-outline">삭제</button></div>`;
    li.querySelector('button').addEventListener('click', async () => {
      if (!confirm('이 키워드 규칙을 삭제할까요?')) return;
      const { error } = await supabaseClient.from('keyword_rules').delete().eq('id', rule.id);
      if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
      showSaveStatus('삭제됨 ✓', 'ok');
      await loadKeywords();
    });
    ul.appendChild(li);
  });
}

async function addKeywordRule() {
  const kwInput = document.getElementById('newKeyword');
  const replyInput = document.getElementById('newKeywordReply');
  const matchTypeSelect = document.getElementById('newKeywordMatchType');
  const keywords = kwInput.value.split(',').map((k) => k.trim()).filter(Boolean);
  const reply = replyInput.value.trim();
  if (keywords.length === 0 || !reply) {
    alert('키워드와 답변 내용을 모두 입력해주세요.');
    return;
  }
  const { error } = await supabaseClient.from('keyword_rules').insert({
    keywords, match_type: matchTypeSelect.value, reply,
  });
  if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  kwInput.value = ''; replyInput.value = ''; matchTypeSelect.value = 'all';
  showSaveStatus('저장됨 ✓', 'ok');
  await loadKeywords();
}

// ------------------------------- 스킬 관리 -------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function getSortedSkills(skills) {
  return [...skills].sort((a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0));
}

function buildSkillCard(skill, displayIndex) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.opacity = skill.enabled ? '1' : '0.5';

  const scopeBadge = skill.scope === 'broadcast'
    ? `<span class="skill-scope-badge broadcast">라이브 ${escapeHtml(skill.broadcast_id || '?')} 전용</span>`
    : '<span class="skill-scope-badge common">공통</span>';

  const chips = (skill.keywords && skill.keywords.length > 0)
    ? skill.keywords.map((k) => `<span class="chip">${escapeHtml(k)}</span>`).join('')
    : '<span class="chip" style="background:var(--brand-soft);color:var(--brand-dark);font-weight:700;">항상 포함</span>';

  card.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="priority-badge">우선순위 ${displayIndex + 1}</span>
        <b></b>
        ${scopeBadge}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <label class="switch"><input type="checkbox" class="skill-enable" ${skill.enabled ? 'checked' : ''}/><span class="slider"></span></label>
        <button class="btn btn-outline skill-edit" style="padding:5px 9px;font-size:11px;">수정</button>
        <button class="btn-danger-outline skill-delete">삭제</button>
      </div>
    </div>
    <div style="margin:10px 0;">${chips}</div>
    <div class="hint" style="background:#f7f8fa;border-radius:8px;padding:10px 12px;white-space:pre-wrap;"></div>`;

  card.querySelector('b').textContent = skill.title;
  const preview = (skill.content || '').slice(0, 160) + ((skill.content || '').length > 160 ? '…' : '');
  card.querySelector('.hint').textContent = preview || '(내용 없음)';

  card.querySelector('.skill-enable').addEventListener('change', async (e) => {
    const { error } = await supabaseClient.from('ai_skills').update({ enabled: e.target.checked }).eq('id', skill.id);
    if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
    showSaveStatus('저장됨 ✓', 'ok');
    await loadSkills();
  });
  card.querySelector('.skill-edit').addEventListener('click', () => startEditSkill(skill));
  card.querySelector('.skill-delete').addEventListener('click', async () => {
    if (!confirm(`스킬 "${skill.title}"을(를) 삭제할까요?`)) return;
    const { error } = await supabaseClient.from('ai_skills').delete().eq('id', skill.id);
    if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
    if (editingSkillId === skill.id) resetSkillForm();
    showSaveStatus('삭제됨 ✓', 'ok');
    await loadSkills();
  });
  return card;
}

function renderSkills() {
  const container = document.getElementById('skillGroups');
  container.innerHTML = '';

  const common = aiSkills.filter((s) => s.scope !== 'broadcast');
  const byBroadcast = new Map();
  aiSkills.filter((s) => s.scope === 'broadcast').forEach((s) => {
    const key = s.broadcast_id || '미지정';
    if (!byBroadcast.has(key)) byBroadcast.set(key, []);
    byBroadcast.get(key).push(s);
  });

  const commonTitle = document.createElement('h3');
  commonTitle.textContent = `🌐 공통 스킬 (${common.length}개)`;
  container.appendChild(commonTitle);
  if (common.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint'; p.textContent = '등록된 공통 스킬이 없습니다.';
    container.appendChild(p);
  } else {
    getSortedSkills(common).forEach((skill, i) => container.appendChild(buildSkillCard(skill, i)));
  }

  for (const [broadcastId, group] of byBroadcast.entries()) {
    const title = document.createElement('h3');
    title.style.marginTop = '20px';
    title.textContent = `🎥 라이브 ${broadcastId} 전용 스킬 (${group.length}개)`;
    container.appendChild(title);
    getSortedSkills(group).forEach((skill, i) => container.appendChild(buildSkillCard(skill, i)));
  }
}

function startEditSkill(skill) {
  editingSkillId = skill.id;
  document.getElementById('skillFormTitle').textContent = `✏️ 스킬 수정: ${skill.title}`;
  document.getElementById('skillTitle').value = skill.title;
  document.getElementById('skillScope').value = skill.scope === 'broadcast' ? 'broadcast' : 'common';
  document.getElementById('skillBroadcastId').value = skill.broadcast_id || '';
  document.getElementById('skillBroadcastIdField').style.display = skill.scope === 'broadcast' ? 'block' : 'none';
  document.getElementById('skillKeywords').value = (skill.keywords || []).join(', ');
  document.getElementById('skillMatchType').value = skill.match_type === 'all' ? 'all' : 'any';
  document.getElementById('skillContent').value = skill.content || '';
  document.getElementById('saveSkillBtn').textContent = '수정 내용 저장';
  document.getElementById('cancelSkillEditBtn').style.display = 'inline-block';
  document.getElementById('skillTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetSkillForm() {
  editingSkillId = null;
  document.getElementById('skillFormTitle').textContent = '+ 새 스킬 추가';
  document.getElementById('skillTitle').value = '';
  document.getElementById('skillScope').value = 'common';
  document.getElementById('skillBroadcastId').value = '';
  document.getElementById('skillBroadcastIdField').style.display = 'none';
  document.getElementById('skillKeywords').value = '';
  document.getElementById('skillMatchType').value = 'any';
  document.getElementById('skillContent').value = '';
  document.getElementById('saveSkillBtn').textContent = '스킬 추가';
  document.getElementById('cancelSkillEditBtn').style.display = 'none';
}

async function saveSkill() {
  const title = document.getElementById('skillTitle').value.trim();
  const scope = document.getElementById('skillScope').value;
  const broadcastId = document.getElementById('skillBroadcastId').value.trim();
  const keywords = document.getElementById('skillKeywords').value.split(',').map((k) => k.trim()).filter(Boolean);
  const matchType = document.getElementById('skillMatchType').value;
  const content = document.getElementById('skillContent').value.trim();

  if (!title || !content) { alert('스킬 제목과 내용을 모두 입력해주세요.'); return; }
  if (scope === 'broadcast' && !/^\d+$/.test(broadcastId)) {
    alert('방송 전용 스킬은 라이브 아이디(숫자)를 입력해야 합니다.');
    return;
  }

  const payload = {
    title, scope,
    broadcast_id: scope === 'broadcast' ? broadcastId : null,
    keywords, match_type: matchType, content,
  };

  let error;
  if (editingSkillId) {
    ({ error } = await supabaseClient.from('ai_skills').update(payload).eq('id', editingSkillId));
  } else {
    ({ error } = await supabaseClient.from('ai_skills').insert({ ...payload, enabled: true }));
  }
  if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  resetSkillForm();
  showSaveStatus('저장됨 ✓', 'ok');
  await loadSkills();
}

// ------------------------------- 다음 라이브 예약 시간표 -------------------------------
function formatDatetime24h(dateObj) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

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
    li.innerHTML = `<span class="content"><b style="color:var(--brand-dark);"></b><br/><span class="bid"></span></span><div class="li-actions"><button class="btn-danger-outline">삭제</button></div>`;
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

// ------------------------------- 계정 관리 (마스터관리자 전용) -------------------------------
let accounts = [];

// ------------------------------- 로컬 PC 상태 표시 -------------------------------
async function refreshDeviceStatus() {
  const pill = document.getElementById('deviceStatusPill');
  if (!pill) return;

  const { data, error } = await supabaseClient
    .from('device_status')
    .select('*')
    .order('last_seen_at', { ascending: false });

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

async function loadAccounts() {
  const { data, error } = await supabaseClient
    .from('user_roles').select('*').order('created_at', { ascending: true });
  if (error) { showSaveStatus('계정 목록 불러오기 실패: ' + error.message, 'err'); return; }
  accounts = data || [];
  renderAccountList();
}

function renderAccountList() {
  const ul = document.getElementById('accountList');
  if (!ul) return;
  ul.innerHTML = '';
  if (accounts.length === 0) {
    ul.innerHTML = '<li class="empty-hint">등록된 계정이 없습니다.</li>';
    return;
  }
  accounts.forEach((acc) => {
    const isSelf = currentSession && acc.user_id === currentSession.user.id;
    const isMaster = acc.role === 'master_admin';
    const li = document.createElement('li');

    if (isMaster) {
      // 마스터관리자 본인 계정은 이 화면에서 역할 변경/비활성화를 할 수 없도록 표시만 합니다.
      li.innerHTML = `
        <span class="content">
          <b></b> <span class="chip" style="background:#fdeee0;color:#b5540b;">마스터관리자</span>
          ${isSelf ? ' <span class="chip" style="background:var(--brand-soft);color:var(--brand-dark);">나</span>' : ''}<br/>
          <span style="color:var(--sub);" class="acc-email"></span>
        </span>`;
      li.querySelector('b').textContent = acc.display_name || '(닉네임 없음)';
      li.querySelector('.acc-email').textContent = acc.email;
      ul.appendChild(li);
      return;
    }

    li.innerHTML = `
      <span class="content">
        <b></b> <span class="chip role-badge"></span>
        ${isSelf ? ' <span class="chip" style="background:var(--brand-soft);color:var(--brand-dark);">나</span>' : ''}<br/>
        <span style="color:var(--sub);" class="acc-email"></span>
      </span>
      <div class="li-actions">
        <select class="role-select">
          <option value="admin">관리자</option>
          <option value="web_admin">웹관리자</option>
          <option value="local_manager">로컬매니저</option>
        </select>
        <button class="btn-danger-outline deactivate-btn">비활성화</button>
      </div>`;

    li.querySelector('b').textContent = acc.display_name || '(닉네임 없음)';
    li.querySelector('.role-badge').textContent = ROLE_LABELS[acc.role] || acc.role;
    li.querySelector('.acc-email').textContent = acc.email;

    const roleSelect = li.querySelector('.role-select');
    roleSelect.value = acc.role;
    roleSelect.addEventListener('change', async (e) => {
      await updateAccountRole(acc.user_id, e.target.value);
    });

    li.querySelector('.deactivate-btn').addEventListener('click', async () => {
      await deactivateAccount(acc.user_id, acc.email);
    });

    ul.appendChild(li);
  });
}

async function updateAccountRole(userId, newRole) {
  const { error } = await supabaseClient.from('user_roles').update({ role: newRole }).eq('user_id', userId);
  if (error) { alert('역할 변경 실패: ' + error.message); await loadAccounts(); return; }
  showSaveStatus('역할이 변경되었습니다 ✓', 'ok');
  await loadAccounts();
}

async function deactivateAccount(userId, email) {
  if (!confirm(
    `"${email}" 계정을 비활성화할까요?\n\n` +
    '이 작업은 권한(user_roles)만 제거합니다. 로그인 계정 자체를 완전히 삭제하려면 ' +
    'Supabase 대시보드 > Authentication > Users 에서 별도로 삭제해주세요.'
  )) return;
  const { error } = await supabaseClient.from('user_roles').delete().eq('user_id', userId);
  if (error) { alert('비활성화 실패: ' + error.message); return; }
  showSaveStatus('비활성화되었습니다 ✓', 'ok');
  await loadAccounts();
}

async function createAccount() {
  const email = document.getElementById('newAccountEmail').value.trim();
  const nickname = document.getElementById('newAccountNickname').value.trim();
  const password = document.getElementById('newAccountPassword').value;
  const role = document.getElementById('newAccountRole').value;
  const resultBox = document.getElementById('accountCreateResult');
  const btn = document.getElementById('addAccountBtn');

  resultBox.style.display = 'none';

  if (!email || !nickname || !password) {
    alert('이메일, 닉네임, 비밀번호를 모두 입력해주세요.');
    return;
  }
  if (password.length < 8) {
    alert('비밀번호는 8자 이상으로 입력해주세요.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '만드는 중...';

  // 지금 로그인된 마스터관리자 세션에 영향을 주지 않도록, 세션을 저장하지 않는
  // 별도의 임시 Supabase 클라이언트로 회원가입(signUp)을 실행합니다.
  // (계정 생성에 service_role 같은 비밀 키를 쓰지 않기 위한 방식입니다)
  const tempClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await tempClient.auth.signUp({ email, password });

  btn.disabled = false;
  btn.textContent = '계정 만들기';

  if (error || !data || !data.user) {
    resultBox.style.display = 'block';
    resultBox.style.color = 'var(--danger)';
    resultBox.textContent = '계정 생성 실패: ' + (error ? error.message : '이미 등록된 이메일이거나 알 수 없는 오류입니다.');
    return;
  }

  const { error: roleError } = await supabaseClient.from('user_roles').insert({
    user_id: data.user.id, email, role, display_name: nickname,
  });

  if (roleError) {
    resultBox.style.display = 'block';
    resultBox.style.color = 'var(--danger)';
    resultBox.textContent = '계정은 만들어졌지만 권한 등록에 실패했습니다: ' + roleError.message
      + ' (Supabase 대시보드에서 수동으로 user_roles에 등록해주세요)';
    return;
  }

  resultBox.style.display = 'block';
  resultBox.style.color = 'var(--brand-dark)';
  resultBox.textContent = `✅ 계정이 생성되었습니다. (${email} / ${ROLE_LABELS[role]}) `
    + '이메일 확인이 켜져 있다면 해당 계정으로 인증 후 로그인할 수 있습니다.';

  document.getElementById('newAccountEmail').value = '';
  document.getElementById('newAccountNickname').value = '';
  document.getElementById('newAccountPassword').value = '';
  document.getElementById('newAccountRole').value = 'admin';

  await loadAccounts();
}

// ------------------------------- 이벤트 바인딩 -------------------------------
function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
    });
  });

  document.getElementById('addScheduledBtn').addEventListener('click', addScheduledMessage);
  document.getElementById('addKeywordBtn').addEventListener('click', addKeywordRule);
  document.getElementById('addLiveScheduleBtn').addEventListener('click', addLiveSchedule);

  document.getElementById('skillScope').addEventListener('change', (e) => {
    document.getElementById('skillBroadcastIdField').style.display = e.target.value === 'broadcast' ? 'block' : 'none';
  });
  document.getElementById('saveSkillBtn').addEventListener('click', saveSkill);
  document.getElementById('cancelSkillEditBtn').addEventListener('click', resetSkillForm);

  const addAccountBtn = document.getElementById('addAccountBtn');
  if (addAccountBtn) addAccountBtn.addEventListener('click', createAccount);
}
