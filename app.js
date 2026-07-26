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
  switchSpecMode('manual');
  await loadAll();
  if (currentUserRole === 'master_admin') {
    await loadAccounts();
  }

  await refreshDeviceStatus();
  setInterval(refreshDeviceStatus, 30000); // 30초마다 PC 상태를 다시 확인합니다.
  // 데이터가 안 바뀌어도 시간은 계속 흐르므로("종료" 판정이 시간 기반), 1분마다 목록을 다시 그립니다.
  setInterval(renderLiveScheduleList, 60000);
}

// 이미 로그인된 세션이 있으면(새로고침 시, 또는 이메일 인증 링크로 막 돌아온 경우)
// 자동으로 이어서 로그인 처리합니다.
(async function initSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    await afterLogin(data.session);
    // 이메일 인증 링크를 눌러 들어온 경우 주소창에 토큰 조각이 남는데, 보기 안 좋으니 정리합니다.
    if (window.location.hash.includes('access_token')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }
})();

// ------------------------------- 데이터 로드 -------------------------------
let scheduledMessages = [];
let keywordRules = [];
let aiSkills = [];
let liveSchedule = [];
let productSpecs = [];
let broadcastSettings = {
  scheduled_interval_sec: 300, scheduled_mode: 'sequential', keyword_reply_interval_sec: 15,
  ai_role_instructions: '', ai_tone_guide: '',
};

async function loadAll() {
  await Promise.all([loadBroadcastSettings(), loadScheduled(), loadKeywords(), loadSkills(), loadLiveSchedule(), loadProductSpecs()]);
}

async function loadBroadcastSettings() {
  const { data, error } = await supabaseClient
    .from('broadcast_settings').select('*').eq('id', 'default').maybeSingle();
  if (error) { showSaveStatus('게시 설정 불러오기 실패: ' + error.message, 'err'); return; }
  if (data) broadcastSettings = data;
  renderBroadcastSettings();
}

function renderBroadcastSettings() {
  const intervalInput = document.getElementById('scheduledIntervalSec');
  const modeSelect = document.getElementById('scheduledMode');
  if (intervalInput && modeSelect) {
    intervalInput.value = broadcastSettings.scheduled_interval_sec;
    modeSelect.value = broadcastSettings.scheduled_mode;
  }
  const keywordIntervalInput = document.getElementById('keywordReplyIntervalSec');
  if (keywordIntervalInput) {
    keywordIntervalInput.value = broadcastSettings.keyword_reply_interval_sec;
  }
  const roleInput = document.getElementById('aiRoleInstructions');
  const toneInput = document.getElementById('aiToneGuide');
  if (roleInput) roleInput.value = broadcastSettings.ai_role_instructions || '';
  if (toneInput) toneInput.value = broadcastSettings.ai_tone_guide || '';
}

async function saveBroadcastSettings() {
  const intervalRaw = Number(document.getElementById('scheduledIntervalSec').value);
  const scheduled_interval_sec = Math.max(5, Number.isFinite(intervalRaw) ? intervalRaw : 300);
  const scheduled_mode = document.getElementById('scheduledMode').value;

  const { error } = await supabaseClient
    .from('broadcast_settings')
    .upsert({ id: 'default', scheduled_interval_sec, scheduled_mode });

  if (error) { showSaveStatus('게시 설정 저장 실패: ' + error.message, 'err'); return; }
  showSaveStatus('게시 설정 저장됨 ✓', 'ok');
  await loadBroadcastSettings();
}

async function saveKeywordSettings() {
  const intervalRaw = Number(document.getElementById('keywordReplyIntervalSec').value);
  const keyword_reply_interval_sec = Math.max(0, Number.isFinite(intervalRaw) ? intervalRaw : 15);

  const { error } = await supabaseClient
    .from('broadcast_settings')
    .upsert({ id: 'default', keyword_reply_interval_sec });

  if (error) { showSaveStatus('답변 설정 저장 실패: ' + error.message, 'err'); return; }
  showSaveStatus('답변 설정 저장됨 ✓', 'ok');
  await loadBroadcastSettings();
}

async function saveAiGuideSettings() {
  const ai_role_instructions = document.getElementById('aiRoleInstructions').value.trim();
  const ai_tone_guide = document.getElementById('aiToneGuide').value.trim();

  const { error } = await supabaseClient
    .from('broadcast_settings')
    .upsert({ id: 'default', ai_role_instructions, ai_tone_guide });

  if (error) { showSaveStatus('AI 답변 기본 설정 저장 실패: ' + error.message, 'err'); return; }
  showSaveStatus('AI 답변 기본 설정 저장됨 ✓', 'ok');
  await loadBroadcastSettings();
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
let draggedScheduledLi = null;
let scheduledEditMode = false;
let scheduledDraft = [];       // 수정모드에서만 쓰는 작업용 복사본 (순서/내용 변경을 임시로 담아둠)
let scheduledEditingId = null; // 지금 인라인으로 내용수정 중인 카드의 id (한 번에 하나만)

function enterScheduledEditMode() {
  scheduledEditMode = true;
  scheduledDraft = scheduledMessages.map((m) => ({ ...m }));
  scheduledEditingId = null;
  document.getElementById('scheduledEditModeBtn').style.display = 'none';
  document.getElementById('scheduledCancelEditBtn').style.display = 'inline-block';
  document.getElementById('scheduledSaveEditBtn').style.display = 'inline-block';
  document.getElementById('scheduledEditHint').textContent =
    '⠿ 드래그로 순서 변경, [내용수정]으로 문구 편집 후 — 모든 변경이 끝나면 반드시 [저장하기]를 눌러야 서버에 반영됩니다.';
  renderScheduledList();
}

function exitScheduledEditMode() {
  scheduledEditMode = false;
  scheduledDraft = [];
  scheduledEditingId = null;
  document.getElementById('scheduledEditModeBtn').style.display = 'inline-block';
  document.getElementById('scheduledCancelEditBtn').style.display = 'none';
  document.getElementById('scheduledSaveEditBtn').style.display = 'none';
  document.getElementById('scheduledEditHint').textContent =
    '⠿ 아이콘을 드래그해서 순서를 바꾸거나 문구를 수정하려면 "수정모드"를 눌러주세요.';
  renderScheduledList();
}

async function saveScheduledEdits() {
  if (scheduledDraft.length > 0) {
    const updates = scheduledDraft.map((item, index) => ({ id: item.id, text: item.text, sort_order: index }));
    const { error } = await supabaseClient.from('scheduled_messages').upsert(updates);
    if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  }
  showSaveStatus('저장됨 ✓', 'ok');
  await loadScheduled(); // 서버 기준 최신 데이터로 다시 불러옵니다.
  exitScheduledEditMode();
}

function renderScheduledList() {
  const ul = document.getElementById('scheduledList');
  ul.innerHTML = '';
  const items = scheduledEditMode ? scheduledDraft : scheduledMessages;

  if (items.length === 0) {
    ul.innerHTML = '<li class="empty-hint">등록된 예약 문구가 없습니다.</li>';
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    li.dataset.id = item.id;

    if (scheduledEditMode && scheduledEditingId === item.id) {
      // ---------- 인라인 내용수정 폼 ----------
      li.className = 'draggable-item editing';
      li.innerHTML = `
        <div style="flex:1;">
          <textarea class="inline-edit-textarea"></textarea>
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button class="btn btn-primary btn-sm inline-save-btn">저장</button>
            <button class="btn btn-outline btn-sm inline-cancel-btn">취소</button>
          </div>
        </div>`;
      const textarea = li.querySelector('.inline-edit-textarea');
      textarea.value = item.text;
      textarea.focus();
      li.querySelector('.inline-save-btn').addEventListener('click', () => {
        const newText = textarea.value.trim();
        if (!newText) { alert('내용을 입력해주세요.'); return; }
        item.text = newText; // scheduledDraft 안의 항목을 직접 수정 (아직 서버에는 반영 안 됨)
        scheduledEditingId = null;
        renderScheduledList();
      });
      li.querySelector('.inline-cancel-btn').addEventListener('click', () => {
        scheduledEditingId = null;
        renderScheduledList();
      });
    } else if (scheduledEditMode) {
      // ---------- 수정모드: 드래그 핸들 + 내용수정 + 삭제 ----------
      li.draggable = true;
      li.className = 'draggable-item';
      li.innerHTML = `<span class="drag-handle" title="드래그해서 순서 변경">⠿</span><span class="content"></span><div class="li-actions"><button class="btn btn-outline btn-sm edit-content-btn">내용수정</button><button class="btn-danger-outline delete-btn">삭제</button></div>`;
      li.querySelector('.content').textContent = item.text;

      li.querySelector('.edit-content-btn').addEventListener('click', () => {
        scheduledEditingId = item.id;
        renderScheduledList();
      });

      li.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('이 예약 문구를 삭제할까요? (삭제는 바로 반영됩니다)')) return;
        const { error } = await supabaseClient.from('scheduled_messages').delete().eq('id', item.id);
        if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
        showSaveStatus('삭제됨 ✓', 'ok');
        scheduledMessages = scheduledMessages.filter((m) => m.id !== item.id);
        scheduledDraft = scheduledDraft.filter((m) => m.id !== item.id);
        renderScheduledList();
      });

      li.addEventListener('dragstart', (e) => {
        draggedScheduledLi = li;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(item.id)); // 일부 브라우저는 setData가 없으면 드래그가 씹힙니다.
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        draggedScheduledLi = null;
        // 지금 화면(DOM)에 보이는 순서를 그대로 scheduledDraft 배열 순서에 반영합니다.
        const orderedIds = Array.from(ul.querySelectorAll('li[data-id]')).map((el) => el.dataset.id);
        const byId = new Map(scheduledDraft.map((d) => [String(d.id), d]));
        scheduledDraft = orderedIds.map((id) => byId.get(String(id))).filter(Boolean);
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedScheduledLi || draggedScheduledLi === li) return;
        const rect = li.getBoundingClientRect();
        const isAfter = e.clientY - rect.top > rect.height / 2;
        ul.insertBefore(draggedScheduledLi, isAfter ? li.nextSibling : li);
      });
    } else {
      // ---------- 읽기 전용(수정모드 아닐 때) ----------
      li.innerHTML = `<span class="content"></span>`;
      li.querySelector('.content').textContent = item.text;
    }

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

// 스킬 내용을 "[필수 포함 내용]"과 "[핵심 규칙]" 두 칸으로 나눠 입력받되, DB에는 지금처럼
// content 컬럼 하나에 합쳐서 저장합니다 (AI에게 전달될 때도 헤더가 있어 더 또렷하게 인식됩니다).
const SKILL_REQUIRED_HEADER = '[필수 포함 내용]';
const SKILL_RULES_HEADER = '[핵심 규칙]';

function combineSkillContent(requiredContent, coreRules) {
  const parts = [];
  if (requiredContent.trim()) parts.push(`${SKILL_REQUIRED_HEADER}\n${requiredContent.trim()}`);
  if (coreRules.trim()) parts.push(`${SKILL_RULES_HEADER}\n${coreRules.trim()}`);
  return parts.join('\n\n');
}

function splitSkillContent(content) {
  const text = content || '';
  const requiredMatch = text.match(/\[필수 포함 내용\]\s*\n([\s\S]*?)(?=\n\[핵심 규칙\]|$)/);
  const rulesMatch = text.match(/\[핵심 규칙\]\s*\n([\s\S]*)$/);
  if (requiredMatch || rulesMatch) {
    return {
      requiredContent: requiredMatch ? requiredMatch[1].trim() : '',
      coreRules: rulesMatch ? rulesMatch[1].trim() : '',
    };
  }
  // 예전 형식(구분 없이 자유서술)으로 저장된 스킬은, 기존 내용을 잃지 않도록 "핵심 규칙" 칸에 그대로 넣어줍니다.
  return { requiredContent: '', coreRules: text.trim() };
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
  const { requiredContent, coreRules } = splitSkillContent(skill.content);
  document.getElementById('skillRequiredContent').value = requiredContent;
  document.getElementById('skillCoreRules').value = coreRules;
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
  document.getElementById('skillRequiredContent').value = '';
  document.getElementById('skillCoreRules').value = '';
  document.getElementById('saveSkillBtn').textContent = '스킬 추가';
  document.getElementById('cancelSkillEditBtn').style.display = 'none';
}

async function saveSkill() {
  const title = document.getElementById('skillTitle').value.trim();
  const scope = document.getElementById('skillScope').value;
  const broadcastId = document.getElementById('skillBroadcastId').value.trim();
  const keywords = document.getElementById('skillKeywords').value.split(',').map((k) => k.trim()).filter(Boolean);
  const matchType = document.getElementById('skillMatchType').value;
  const requiredContent = document.getElementById('skillRequiredContent').value;
  const coreRules = document.getElementById('skillCoreRules').value;
  const content = combineSkillContent(requiredContent, coreRules);

  if (!title || !content) { alert('스킬 제목과, 필수 포함 내용·핵심 규칙 중 최소 1개는 입력해주세요.'); return; }
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

// ------------------------------- 스킬 파일(JSON/CSV/엑셀) 일괄 등록 -------------------------------
let parsedSkillImportRows = [];

// CSV/엑셀 열 이름(또는 JSON 키)이 이렇게 들어와도 알아서 인식하도록 별칭을 매핑합니다.
const SKILL_FIELD_ALIASES = {
  title: ['스킬제목', '제목', 'title'],
  scope: ['적용범위', '범위', 'scope'],
  broadcastId: ['라이브아이디', '방송아이디', '방송id', 'broadcastid', 'broadcast_id'],
  keywords: ['트리거키워드', '키워드', 'keywords'],
  matchType: ['매칭방식', 'matchtype', 'match_type'],
  content: ['스킬내용', '내용', 'content'],
  requiredContent: ['필수포함내용', 'requiredcontent', 'required_content'],
  coreRules: ['핵심규칙', 'corerules', 'core_rules'],
  enabled: ['사용여부', '사용', 'enabled'],
};

function normalizeHeaderKey(key) {
  return String(key ?? '').replace(/\s+/g, '').toLowerCase();
}

function findSkillField(normalizedRowMap, fieldKey) {
  for (const alias of SKILL_FIELD_ALIASES[fieldKey]) {
    const aliasKey = normalizeHeaderKey(alias);
    if (aliasKey in normalizedRowMap) return normalizedRowMap[aliasKey];
  }
  return undefined;
}

function normalizeScopeValue(v) {
  const s = normalizeHeaderKey(v);
  return ['broadcast', '방송전용', '방송', '특정방송'].includes(s) ? 'broadcast' : 'common';
}

function normalizeMatchTypeValue(v) {
  const s = normalizeHeaderKey(v);
  return ['all', '모두포함', 'and'].includes(s) ? 'all' : 'any';
}

function normalizeEnabledValue(v) {
  if (v === undefined || v === null || v === '') return true;
  const s = normalizeHeaderKey(v);
  return !['미사용', 'false', '0', 'n', 'no', 'off'].includes(s);
}

// 파일에서 읽은 원본 행(JSON 객체 또는 CSV/엑셀 한 줄) 하나를 등록 가능한 스킬 형태로 정리합니다.
function parseSkillRow(row) {
  const map = {};
  Object.keys(row || {}).forEach((k) => { map[normalizeHeaderKey(k)] = row[k]; });

  const title = String(findSkillField(map, 'title') ?? '').trim();
  const scope = normalizeScopeValue(findSkillField(map, 'scope'));
  const broadcastIdRaw = findSkillField(map, 'broadcastId');
  const broadcastId = broadcastIdRaw !== undefined && broadcastIdRaw !== null ? String(broadcastIdRaw).trim() : '';
  const keywordsRaw = findSkillField(map, 'keywords');
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.map((k) => String(k).trim()).filter(Boolean)
    : String(keywordsRaw ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  const matchType = normalizeMatchTypeValue(findSkillField(map, 'matchType'));
  const requiredContentRaw = findSkillField(map, 'requiredContent');
  const coreRulesRaw = findSkillField(map, 'coreRules');
  const plainContentRaw = findSkillField(map, 'content');
  // "필수포함내용"/"핵심규칙" 열이 있으면 그걸 합쳐서 쓰고, 없으면(예전 형식) "스킬내용" 열을 그대로 씁니다.
  const content = (requiredContentRaw || coreRulesRaw)
    ? combineSkillContent(String(requiredContentRaw ?? ''), String(coreRulesRaw ?? ''))
    : String(plainContentRaw ?? '').trim();
  const enabled = normalizeEnabledValue(findSkillField(map, 'enabled'));

  const errors = [];
  if (!title) errors.push('스킬 제목 없음');
  if (!content) errors.push('스킬 내용 없음');
  if (scope === 'broadcast' && !/^\d+$/.test(broadcastId)) errors.push('방송전용인데 라이브 아이디가 숫자가 아님');

  return {
    title, scope, broadcastId: scope === 'broadcast' ? broadcastId : '',
    keywords, matchType, content, enabled,
    _errors: errors, _valid: errors.length === 0,
  };
}

function renderSkillImportPreview() {
  const wrap = document.getElementById('skillFilePreviewWrap');
  const summary = document.getElementById('skillFilePreviewSummary');
  const list = document.getElementById('skillFilePreviewList');
  if (!wrap || !summary || !list) return;

  if (parsedSkillImportRows.length === 0) {
    wrap.style.display = 'none';
    return;
  }

  const validCount = parsedSkillImportRows.filter((r) => r._valid).length;
  summary.textContent = `총 ${parsedSkillImportRows.length}개 중 ${validCount}개 등록 가능합니다. (문제 있는 항목 ❌은 등록에서 자동 제외됩니다)`;

  list.innerHTML = '';
  parsedSkillImportRows.forEach((row) => {
    const item = document.createElement('div');
    item.style.cssText = `border:1px solid ${row._valid ? 'var(--border)' : 'var(--danger)'}; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; font-size: 12px;`;
    const scopeLabel = row.scope === 'broadcast' ? `방송전용(${escapeHtml(row.broadcastId)})` : '공통';
    const keywordLabel = row.keywords.length ? escapeHtml(row.keywords.join(', ')) : '항상 포함';
    const matchLabel = row.matchType === 'all' ? '모두포함' : '하나라도포함';
    const preview = (row.content || '').slice(0, 100) + ((row.content || '').length > 100 ? '…' : '');
    item.innerHTML = `
      <b>${row._valid ? '✅' : '❌'} ${escapeHtml(row.title || '(제목 없음)')}</b>
      <div class="hint" style="margin-top:4px;">${scopeLabel} · ${keywordLabel} · ${matchLabel} · ${row.enabled ? '사용' : '미사용'}</div>
      <div class="hint" style="margin-top:4px;">${escapeHtml(preview)}</div>
      ${row._errors.length ? `<div style="color:var(--danger); font-size:11px; margin-top:4px;">⚠️ ${escapeHtml(row._errors.join(', '))}</div>` : ''}
    `;
    list.appendChild(item);
  });

  wrap.style.display = 'block';
}

function cancelSkillImport() {
  parsedSkillImportRows = [];
  const fileInput = document.getElementById('skillFileInput');
  if (fileInput) fileInput.value = '';
  const wrap = document.getElementById('skillFilePreviewWrap');
  if (wrap) wrap.style.display = 'none';
}

async function handleSkillFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  try {
    let rawRows = [];
    if (ext === 'json') {
      const text = await file.text();
      const data = JSON.parse(text);
      rawRows = Array.isArray(data) ? data : (Array.isArray(data.skills) ? data.skills : []);
    } else if (ext === 'csv') {
      const text = await file.text();
      const wb = XLSX.read(text, { type: 'string' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      alert('JSON, CSV, 엑셀(.xlsx/.xls) 파일만 지원합니다.');
      return;
    }

    if (rawRows.length === 0) {
      alert('파일에서 읽을 수 있는 행이 없습니다.');
      return;
    }

    parsedSkillImportRows = rawRows.map(parseSkillRow);
    renderSkillImportPreview();
  } catch (err) {
    alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
  }
}

async function importSkillsFromFile() {
  const validRows = parsedSkillImportRows.filter((r) => r._valid);
  if (validRows.length === 0) { alert('등록 가능한 항목이 없습니다.'); return; }
  if (!confirm(`${validRows.length}개의 스킬을 등록할까요?`)) return;

  const payload = validRows.map((r) => ({
    title: r.title,
    scope: r.scope,
    broadcast_id: r.scope === 'broadcast' ? r.broadcastId : null,
    keywords: r.keywords,
    match_type: r.matchType,
    content: r.content,
    enabled: r.enabled,
  }));

  const { error } = await supabaseClient.from('ai_skills').insert(payload);
  if (error) { showSaveStatus('일괄 등록 실패: ' + error.message, 'err'); return; }
  showSaveStatus(`${validRows.length}개 스킬 등록됨 ✓`, 'ok');
  cancelSkillImport();
  await loadSkills();
}

// ------------------------------- 스킬 예시 파일 다운로드 -------------------------------
const SKILL_SAMPLE_DATA = [
  {
    title: '무이자 할부 안내', scope: 'common', broadcastId: '',
    keywords: ['할부', '무이자'], matchType: 'any',
    content: '저희 라이브에서는 5개 카드사 12개월 무이자 할부가 가능합니다. 카드사별 정확한 조건은 결제창에서 확인해주세요.',
    enabled: true,
  },
  {
    title: '그램케어 서비스 안내', scope: 'common', broadcastId: '',
    keywords: ['그램케어', 'AS', '보증'], matchType: 'any',
    content: '그램케어는 구매 후 1년간 파손도 무상으로 수리해드리는 LG전자 정품 보증 서비스입니다. 모델에 따라 제공 여부가 다를 수 있어요.',
    enabled: true,
  },
  {
    title: '이번 방송 한정 사은품', scope: 'broadcast', broadcastId: '1974367',
    keywords: [], matchType: 'any',
    content: '이번 방송에서 구매하시는 고객님께는 사은품으로 무선마우스를 함께 보내드립니다. 다른 방송에는 적용되지 않는 혜택이에요.',
    enabled: true,
  },
];

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadSkillJsonSample() {
  const data = SKILL_SAMPLE_DATA.map((s) => ({
    title: s.title, scope: s.scope, broadcastId: s.broadcastId,
    keywords: s.keywords, matchType: s.matchType, content: s.content, enabled: s.enabled,
  }));
  downloadBlob('스킬_예시.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
}

function buildSkillSampleCsvRows() {
  const headers = ['스킬제목', '적용범위', '라이브아이디', '트리거키워드', '매칭방식', '스킬내용', '사용여부'];
  const rows = SKILL_SAMPLE_DATA.map((s) => [
    s.title,
    s.scope === 'broadcast' ? '방송전용' : '공통',
    s.broadcastId || '',
    s.keywords.join(', '),
    s.matchType === 'all' ? '모두포함' : '하나라도포함',
    s.content,
    s.enabled ? '사용' : '미사용',
  ]);
  return [headers, ...rows];
}

function downloadSkillCsvSample() {
  const lines = buildSkillSampleCsvRows().map((cols) =>
    cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
  );
  const csv = '\uFEFF' + lines.join('\r\n'); // BOM: 엑셀에서 열어도 한글이 안 깨지도록
  downloadBlob('스킬_예시.csv', csv, 'text/csv;charset=utf-8');
}

function downloadSkillXlsxSample() {
  const [headers, ...rows] = buildSkillSampleCsvRows();
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '스킬');
  XLSX.writeFile(wb, '스킬_예시.xlsx');
}

// ------------------------------- 제품 스펙 관리 -------------------------------
let editingSpecId = null;
let parsedSpecImportRows = [];

async function loadProductSpecs() {
  const { data, error } = await supabaseClient
    .from('product_specs').select('*').order('model_name', { ascending: true });
  if (error) { showSaveStatus('제품 스펙 불러오기 실패: ' + error.message, 'err'); return; }
  productSpecs = data || [];
  renderSpecList();
}

function renderSpecList() {
  const container = document.getElementById('specList');
  if (!container) return;
  if (productSpecs.length === 0) {
    container.innerHTML = '<p class="hint">등록된 제품 스펙이 없습니다.</p>';
    return;
  }
  container.innerHTML = '';
  productSpecs.forEach((spec) => {
    const div = document.createElement('div');
    div.style.cssText = 'border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:8px;';
    const specLine = [spec.os, spec.cpu, spec.resolution, spec.memory, spec.storage, spec.color].filter(Boolean).join(' · ');
    const extraKeys = spec.extra && typeof spec.extra === 'object' ? Object.keys(spec.extra) : [];
    const extraLine = extraKeys.map((k) => `${k}=${spec.extra[k]}`).join(', ');
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div>
          <b>${escapeHtml(spec.model_name)}</b>
          <div class="hint" style="margin-top:4px;">${escapeHtml(specLine || '(스펙 미입력)')}</div>
          ${extraKeys.length ? `<div class="hint" style="margin-top:4px;">기타: ${escapeHtml(extraLine)}</div>` : ''}
        </div>
        <div class="li-actions">
          <button class="btn btn-outline btn-sm spec-edit-btn">수정</button>
          <button class="btn-danger-outline spec-delete-btn">삭제</button>
        </div>
      </div>
    `;
    div.querySelector('.spec-edit-btn').addEventListener('click', () => startEditSpec(spec));
    div.querySelector('.spec-delete-btn').addEventListener('click', () => deleteSpec(spec));
    container.appendChild(div);
  });
}

function switchSpecMode(mode) {
  const manualForm = document.getElementById('specManualForm');
  const jsonForm = document.getElementById('specJsonForm');
  const manualBtn = document.getElementById('specModeManualBtn');
  const jsonBtn = document.getElementById('specModeJsonBtn');
  if (mode === 'json') {
    manualForm.style.display = 'none';
    jsonForm.style.display = 'block';
    manualBtn.classList.remove('btn-primary');
    jsonBtn.classList.add('btn-primary');
  } else {
    manualForm.style.display = 'block';
    jsonForm.style.display = 'none';
    jsonBtn.classList.remove('btn-primary');
    manualBtn.classList.add('btn-primary');
  }
}

function startEditSpec(spec) {
  editingSpecId = spec.id;
  document.getElementById('specFormTitle').textContent = `"${spec.model_name}" 수정`;
  document.getElementById('specModelName').value = spec.model_name || '';
  document.getElementById('specOs').value = spec.os || '';
  document.getElementById('specCpu').value = spec.cpu || '';
  document.getElementById('specResolution').value = spec.resolution || '';
  document.getElementById('specMemory').value = spec.memory || '';
  document.getElementById('specStorage').value = spec.storage || '';
  document.getElementById('specColor').value = spec.color || '';
  document.getElementById('specExtra').value = spec.extra && Object.keys(spec.extra).length ? JSON.stringify(spec.extra, null, 2) : '';
  document.getElementById('saveSpecBtn').textContent = '수정 저장';
  document.getElementById('cancelSpecEditBtn').style.display = 'inline-block';
  switchSpecMode('manual');
}

function resetSpecForm() {
  editingSpecId = null;
  document.getElementById('specFormTitle').textContent = '+ 새 모델 추가';
  ['specModelName', 'specOs', 'specCpu', 'specResolution', 'specMemory', 'specStorage', 'specColor', 'specExtra'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  document.getElementById('saveSpecBtn').textContent = '모델 추가';
  document.getElementById('cancelSpecEditBtn').style.display = 'none';
}

async function saveSpec() {
  const modelName = document.getElementById('specModelName').value.trim();
  if (!modelName) { alert('모델명을 입력해주세요.'); return; }

  let extra = {};
  const extraRaw = document.getElementById('specExtra').value.trim();
  if (extraRaw) {
    try {
      extra = JSON.parse(extraRaw);
      if (typeof extra !== 'object' || Array.isArray(extra) || extra === null) throw new Error('{"이름":"값"} 형태의 객체여야 합니다');
    } catch (err) {
      alert('기타 스펙(JSON) 형식이 올바르지 않습니다: ' + err.message);
      return;
    }
  }

  const payload = {
    model_name: modelName,
    os: document.getElementById('specOs').value.trim() || null,
    cpu: document.getElementById('specCpu').value.trim() || null,
    resolution: document.getElementById('specResolution').value.trim() || null,
    memory: document.getElementById('specMemory').value.trim() || null,
    storage: document.getElementById('specStorage').value.trim() || null,
    color: document.getElementById('specColor').value.trim() || null,
    extra,
  };

  let error;
  if (editingSpecId) {
    ({ error } = await supabaseClient.from('product_specs').update(payload).eq('id', editingSpecId));
  } else {
    // 같은 모델명이 이미 있으면 새로 추가하는 대신 덮어씁니다(업서트) — 실수로 중복 등록되는 것을 방지합니다.
    ({ error } = await supabaseClient.from('product_specs').upsert(payload, { onConflict: 'model_name' }));
  }
  if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  resetSpecForm();
  showSaveStatus('저장됨 ✓', 'ok');
  await loadProductSpecs();
}

async function deleteSpec(spec) {
  if (!confirm(`"${spec.model_name}" 스펙을 삭제할까요?`)) return;
  const { error } = await supabaseClient.from('product_specs').delete().eq('id', spec.id);
  if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
  showSaveStatus('삭제됨 ✓', 'ok');
  if (editingSpecId === spec.id) resetSpecForm();
  await loadProductSpecs();
}

// ---------------- 제품 스펙: JSON 일괄 입력 ----------------
const SPEC_FIELD_ALIASES = {
  modelName: ['모델명', 'model', 'modelname', 'model_name'],
  os: ['운영체제', 'os'],
  cpu: ['cpu', '프로세서'],
  resolution: ['해상도', 'resolution'],
  memory: ['메모리', 'ram', 'memory'],
  storage: ['저장장치', 'storage', 'ssd'],
  color: ['색상', 'color'],
  extra: ['기타', '기타스펙', 'extra'],
};

function findSpecField(normalizedRowMap, fieldKey) {
  for (const alias of SPEC_FIELD_ALIASES[fieldKey]) {
    const aliasKey = normalizeHeaderKey(alias);
    if (aliasKey in normalizedRowMap) return normalizedRowMap[aliasKey];
  }
  return undefined;
}

function parseSpecRow(row) {
  const map = {};
  Object.keys(row || {}).forEach((k) => { map[normalizeHeaderKey(k)] = row[k]; });

  const modelName = String(findSpecField(map, 'modelName') ?? '').trim();
  const os = String(findSpecField(map, 'os') ?? '').trim();
  const cpu = String(findSpecField(map, 'cpu') ?? '').trim();
  const resolution = String(findSpecField(map, 'resolution') ?? '').trim();
  const memory = String(findSpecField(map, 'memory') ?? '').trim();
  const storage = String(findSpecField(map, 'storage') ?? '').trim();
  const color = String(findSpecField(map, 'color') ?? '').trim();
  let extra = findSpecField(map, 'extra');
  if (extra && typeof extra === 'string') {
    try { extra = JSON.parse(extra); } catch { extra = {}; }
  }
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) extra = {};

  const errors = [];
  if (!modelName) errors.push('모델명 없음');

  return { modelName, os, cpu, resolution, memory, storage, color, extra, _errors: errors, _valid: errors.length === 0 };
}

function renderSpecImportPreview() {
  const wrap = document.getElementById('specJsonPreviewWrap');
  const summary = document.getElementById('specJsonPreviewSummary');
  const list = document.getElementById('specJsonPreviewList');
  const importBtn = document.getElementById('importSpecsBtn');
  if (!wrap || !summary || !list || !importBtn) return;

  if (parsedSpecImportRows.length === 0) {
    wrap.style.display = 'none';
    importBtn.style.display = 'none';
    return;
  }

  const validCount = parsedSpecImportRows.filter((r) => r._valid).length;
  summary.textContent = `총 ${parsedSpecImportRows.length}개 중 ${validCount}개 등록 가능합니다. (같은 모델명이 이미 있으면 내용을 덮어씁니다)`;

  list.innerHTML = '';
  parsedSpecImportRows.forEach((row) => {
    const item = document.createElement('div');
    item.style.cssText = `border:1px solid ${row._valid ? 'var(--border)' : 'var(--danger)'}; border-radius:8px; padding:10px 12px; margin-bottom:8px; font-size:12px;`;
    const specLine = [row.os, row.cpu, row.resolution, row.memory, row.storage, row.color].filter(Boolean).join(' · ');
    item.innerHTML = `
      <b>${row._valid ? '✅' : '❌'} ${escapeHtml(row.modelName || '(모델명 없음)')}</b>
      <div class="hint" style="margin-top:4px;">${escapeHtml(specLine || '(스펙 없음)')}</div>
      ${row._errors.length ? `<div style="color:var(--danger); font-size:11px; margin-top:4px;">⚠️ ${escapeHtml(row._errors.join(', '))}</div>` : ''}
    `;
    list.appendChild(item);
  });

  wrap.style.display = 'block';
  importBtn.style.display = validCount > 0 ? 'block' : 'none';
}

async function handleSpecFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    document.getElementById('specJsonInput').value = text; // 파일 내용을 textarea에 채워서, 등록 전에 직접 눈으로 확인할 수 있게 합니다.
  } catch (err) {
    alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
  }
}

function parseSpecJsonInput() {
  const raw = document.getElementById('specJsonInput').value.trim();
  if (!raw) { alert('JSON 내용을 입력하거나 파일을 선택해주세요.'); return; }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    alert('JSON 형식이 올바르지 않습니다: ' + err.message);
    return;
  }
  const rows = Array.isArray(data) ? data : (Array.isArray(data.specs) ? data.specs : []);
  if (rows.length === 0) { alert('배열 형태의 데이터를 찾을 수 없습니다.'); return; }
  parsedSpecImportRows = rows.map(parseSpecRow);
  renderSpecImportPreview();
}

async function importSpecsFromJson() {
  const validRows = parsedSpecImportRows.filter((r) => r._valid);
  if (validRows.length === 0) { alert('등록 가능한 항목이 없습니다.'); return; }
  if (!confirm(`${validRows.length}개의 모델 스펙을 등록/갱신할까요?`)) return;

  const payload = validRows.map((r) => ({
    model_name: r.modelName,
    os: r.os || null,
    cpu: r.cpu || null,
    resolution: r.resolution || null,
    memory: r.memory || null,
    storage: r.storage || null,
    color: r.color || null,
    extra: r.extra || {},
  }));

  const { error } = await supabaseClient.from('product_specs').upsert(payload, { onConflict: 'model_name' });
  if (error) { showSaveStatus('일괄 등록 실패: ' + error.message, 'err'); return; }
  showSaveStatus(`${validRows.length}개 모델 등록/갱신됨 ✓`, 'ok');
  parsedSpecImportRows = [];
  document.getElementById('specJsonInput').value = '';
  document.getElementById('specFileInput').value = '';
  document.getElementById('specJsonPreviewWrap').style.display = 'none';
  document.getElementById('importSpecsBtn').style.display = 'none';
  await loadProductSpecs();
}

const SPEC_SAMPLE_DATA = [
  {
    modelName: '16Z90R-GA76K', os: 'Windows 11 Home', cpu: 'Intel Core Ultra 7 155H',
    resolution: '2880x1800 (WQXGA+)', memory: '16GB (최대 32GB)', storage: '512GB NVMe SSD', color: '옵시디안 블랙',
    extra: { 배터리: '80Wh', 무게: '1.19kg', 그래픽카드: 'Intel Arc Graphics' },
  },
  {
    modelName: '17Z90S-GA70K', os: 'Windows 11 Home', cpu: 'Intel Core Ultra 5 125H',
    resolution: '1920x1200 (WUXGA)', memory: '8GB (최대 32GB)', storage: '256GB NVMe SSD', color: '실버',
    extra: { 무게: '1.35kg' },
  },
];

function downloadSpecJsonSample() {
  downloadBlob('제품스펙_예시.json', JSON.stringify(SPEC_SAMPLE_DATA, null, 2), 'application/json;charset=utf-8');
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
    return `
      <button type="button" class="device-label-btn ${isExpanded ? 'expanded' : ''}" data-device="${escapeHtml(d.device_name)}">
        🖥️ ${escapeHtml(d.device_name)}${stale ? ' <span class="feature-stale">(정보 오래됨)</span>' : ''}
      </button>
      ${actionsRow}
      ${chip('📝 예약문구', d.scheduled_enabled)}
      ${chip('💬 키워드', d.keyword_enabled)}
      ${chip('🤖 AI(스킬)', d.ai_enabled)}${skillsPart}
    `;
  }).join('<span style="color:var(--border);">│</span>');

  bar.style.display = 'flex';

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

  const { data, error } = await tempClient.auth.signUp({
    email,
    password,
    options: {
      // 이메일 인증 링크를 눌렀을 때 돌아올 주소를 "지금 이 관리자 웹페이지"로 명시합니다.
      // (지정하지 않으면 Supabase 대시보드의 기본 Site URL로 가는데, 보통 실제 배포 주소와
      // 달라서 "페이지를 찾을 수 없음" 오류가 납니다. 이 값과 별개로, Supabase 대시보드
      // Authentication > URL Configuration에도 이 주소를 등록해두셔야 합니다.)
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });

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

  document.getElementById('saveBroadcastSettingsBtn').addEventListener('click', saveBroadcastSettings);
  document.getElementById('saveKeywordSettingsBtn').addEventListener('click', saveKeywordSettings);
  document.getElementById('saveAiGuideBtn').addEventListener('click', saveAiGuideSettings);
  document.getElementById('addScheduledBtn').addEventListener('click', addScheduledMessage);
  document.getElementById('scheduledEditModeBtn').addEventListener('click', enterScheduledEditMode);
  document.getElementById('scheduledCancelEditBtn').addEventListener('click', () => {
    if (confirm('수정 중인 내용을 취소할까요? 저장하지 않은 변경사항은 사라집니다.')) exitScheduledEditMode();
  });
  document.getElementById('scheduledSaveEditBtn').addEventListener('click', saveScheduledEdits);
  document.getElementById('addKeywordBtn').addEventListener('click', addKeywordRule);
  document.getElementById('addLiveScheduleBtn').addEventListener('click', addLiveSchedule);

  document.getElementById('skillScope').addEventListener('change', (e) => {
    document.getElementById('skillBroadcastIdField').style.display = e.target.value === 'broadcast' ? 'block' : 'none';
  });
  document.getElementById('saveSkillBtn').addEventListener('click', saveSkill);
  document.getElementById('cancelSkillEditBtn').addEventListener('click', resetSkillForm);

  document.getElementById('skillFileInput').addEventListener('change', handleSkillFileSelected);
  document.getElementById('importSkillsBtn').addEventListener('click', importSkillsFromFile);
  document.getElementById('cancelSkillImportBtn').addEventListener('click', cancelSkillImport);
  document.getElementById('downloadJsonSampleBtn').addEventListener('click', downloadSkillJsonSample);
  document.getElementById('downloadCsvSampleBtn').addEventListener('click', downloadSkillCsvSample);
  document.getElementById('downloadXlsxSampleBtn').addEventListener('click', downloadSkillXlsxSample);

  document.getElementById('specModeManualBtn').addEventListener('click', () => switchSpecMode('manual'));
  document.getElementById('specModeJsonBtn').addEventListener('click', () => switchSpecMode('json'));
  document.getElementById('saveSpecBtn').addEventListener('click', saveSpec);
  document.getElementById('cancelSpecEditBtn').addEventListener('click', resetSpecForm);
  document.getElementById('specFileInput').addEventListener('change', handleSpecFileSelected);
  document.getElementById('parseSpecJsonBtn').addEventListener('click', parseSpecJsonInput);
  document.getElementById('importSpecsBtn').addEventListener('click', importSpecsFromJson);
  document.getElementById('downloadSpecJsonSampleBtn').addEventListener('click', downloadSpecJsonSample);

  const addAccountBtn = document.getElementById('addAccountBtn');
  if (addAccountBtn) addAccountBtn.addEventListener('click', createAccount);
}
