// ============================================================
//  방송 설정: 예약문구 게시설정 / 키워드 답변간격 / AI 기본설정(역할·톤·API키·모델 등)
// ============================================================

// ------------------------------- 데이터 로드 -------------------------------
let scheduledMessages = [];
let keywordRules = [];
let aiSkills = [];
let liveSchedule = [];
let productSpecs = [];
let productBenefits = [];
let broadcastSettings = {
  scheduled_interval_sec: 300, scheduled_mode: 'sequential', keyword_reply_interval_sec: 15,
  ai_role_instructions: '', ai_tone_guide: '',
  ai_model: 'claude-haiku-4-5-20251001', ai_min_interval_sec: 15, ai_max_calls_per_broadcast: 100, ai_per_nickname_cooldown_sec: 60,
  ai_benefit_skill_enabled: true, ai_mixed_intent_notice_enabled: true,
  feature_ai_enabled: true, feature_scheduled_enabled: true, feature_keyword_enabled: true,
  feature_next_live_enabled: false, ai_skills_enabled: true, ai_spec_enabled: true,
};

// ============================================================
//  기능 ON/OFF 스위치 (모든 PC 공통)
//  화면 곳곳의 data-global-switch="컬럼명" 체크박스가 모두 같은 값을 보여주고,
//  누르는 즉시 서버에 저장됩니다. 로컬 PC는 약 20초~1분 안에 이 값을 따릅니다.
// ============================================================
const GLOBAL_SWITCH_LABELS = {
  feature_ai_enabled: '🤖 AI 자동답변',
  feature_scheduled_enabled: '📝 예약 문구',
  feature_keyword_enabled: '💬 키워드 자동답변',
  ai_skills_enabled: '🧩 스킬 적용',
  feature_next_live_enabled: '🔁 다음 라이브 이동',
  ai_spec_enabled: '💻 제품 스펙',
  ai_benefit_skill_enabled: '🎁 상품 혜택',
};
const GLOBAL_SWITCH_DEFAULTS = { feature_next_live_enabled: false };

function isGlobalSwitchOn(column) {
  const v = broadcastSettings[column];
  if (v === undefined || v === null) return GLOBAL_SWITCH_DEFAULTS[column] ?? true;
  return !!v;
}

function renderGlobalSwitches() {
  document.querySelectorAll('[data-global-switch]').forEach((cb) => {
    const on = isGlobalSwitchOn(cb.dataset.globalSwitch);
    cb.checked = on;
    const wrap = cb.closest('.gsw');
    if (wrap) {
      wrap.classList.toggle('on', on);
      const stateEl = wrap.querySelector('.gsw-state');
      if (stateEl) stateEl.textContent = on ? '켜짐' : '꺼짐';
    }
  });
}

async function setGlobalSwitch(column, value) {
  const label = GLOBAL_SWITCH_LABELS[column] || column;
  const { error } = await supabaseClient
    .from('broadcast_settings')
    .upsert({ id: 'default', [column]: value });
  if (error) {
    const hint = /column/i.test(error.message) ? ' (Supabase SQL Editor에서 새 스위치 SQL을 먼저 실행해주세요)' : '';
    showSaveStatus(`${label} ${value ? '켜기' : '끄기'} 실패: ${error.message}${hint}`, 'err');
    renderGlobalSwitches(); // 실패하면 원래 상태로 되돌려 보여줍니다
    return;
  }
  broadcastSettings[column] = value;
  renderGlobalSwitches();
  showSaveStatus(`${label} ${value ? '🟢 켜짐' : '⚪ 꺼짐'} 저장됨 ✓ (모든 PC에 약 20초~1분 안에 반영)`, 'ok');
}

function bindGlobalSwitches() {
  document.querySelectorAll('[data-global-switch]').forEach((cb) => {
    cb.addEventListener('change', () => setGlobalSwitch(cb.dataset.globalSwitch, cb.checked));
  });
}

async function loadAll() {
  await Promise.all([loadBroadcastSettings(), loadScheduled(), loadKeywords(), loadSkills(), loadLiveSchedule(), loadProductSpecs(), loadProductBenefits()]);
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

  const modelSelect = document.getElementById('aiModelSelect');
  const minIntervalInput = document.getElementById('aiMinIntervalSecInput');
  const maxCallsInput = document.getElementById('aiMaxCallsInput');
  const cooldownInput = document.getElementById('aiCooldownInput');
  if (modelSelect) modelSelect.value = broadcastSettings.ai_model || 'claude-haiku-4-5-20251001';
  if (minIntervalInput) minIntervalInput.value = broadcastSettings.ai_min_interval_sec ?? 15;
  if (maxCallsInput) maxCallsInput.value = broadcastSettings.ai_max_calls_per_broadcast ?? 100;
  if (cooldownInput) cooldownInput.value = broadcastSettings.ai_per_nickname_cooldown_sec ?? 60;
  renderGlobalSwitches();
  const mixedNoticeToggle = document.getElementById('aiMixedNoticeToggle');
  if (mixedNoticeToggle) mixedNoticeToggle.checked = broadcastSettings.ai_mixed_intent_notice_enabled !== false;
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

// ---------------- Claude API 키 (암호화 저장, 쓰기 전용) ----------------
async function loadAiKeyStatus() {
  const chip = document.getElementById('apiKeyStatusChip');
  if (!chip) return;
  const { data, error } = await supabaseClient.rpc('has_anthropic_api_key');
  if (error) {
    chip.textContent = '확인 실패';
    chip.style.background = '#fdecea'; chip.style.color = 'var(--danger)';
    return;
  }
  if (data) {
    chip.textContent = '✅ 설정됨';
    chip.style.background = 'var(--brand-soft)'; chip.style.color = 'var(--brand-dark)';
  } else {
    chip.textContent = '❌ 미설정';
    chip.style.background = '#fdecea'; chip.style.color = 'var(--danger)';
  }
}

async function saveApiKey() {
  const input = document.getElementById('anthropicApiKeyInput');
  const newKey = input.value.trim();
  if (!newKey) { alert('새로 저장할 API 키를 입력해주세요.'); return; }
  if (!confirm('API 키를 저장할까요? 저장 후에는 이 페이지에서도 값을 다시 확인할 수 없습니다 (암호화 저장).')) return;

  const { error } = await supabaseClient.rpc('set_anthropic_api_key', { new_key: newKey });
  if (error) { showSaveStatus('API 키 저장 실패: ' + error.message, 'err'); return; }
  input.value = '';
  showSaveStatus('API 키가 암호화되어 저장됨 ✓', 'ok');
  await loadAiKeyStatus();
}

async function saveAiNumericSettings() {
  const ai_model = document.getElementById('aiModelSelect').value;
  const minRaw = Number(document.getElementById('aiMinIntervalSecInput').value);
  const maxRaw = Number(document.getElementById('aiMaxCallsInput').value);
  const cooldownRaw = Number(document.getElementById('aiCooldownInput').value);

  const ai_min_interval_sec = Math.max(5, Number.isFinite(minRaw) ? minRaw : 15);
  const ai_max_calls_per_broadcast = Math.max(1, Number.isFinite(maxRaw) ? maxRaw : 100);
  const ai_per_nickname_cooldown_sec = Math.max(5, Number.isFinite(cooldownRaw) ? cooldownRaw : 60);

  const { error } = await supabaseClient
    .from('broadcast_settings')
    .upsert({
      id: 'default', ai_model, ai_min_interval_sec, ai_max_calls_per_broadcast, ai_per_nickname_cooldown_sec,
      ai_mixed_intent_notice_enabled: document.getElementById('aiMixedNoticeToggle').checked,
    });

  if (error) { showSaveStatus('AI 세부 설정 저장 실패: ' + error.message, 'err'); return; }
  showSaveStatus('AI 세부 설정 저장됨 ✓', 'ok');
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

