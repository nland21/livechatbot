// ============================================================
//  방송 설정: 예약문구 게시설정 / 키워드 답변간격 / AI 기본설정(역할·톤·API키·모델 등)
// ============================================================

// ------------------------------- 데이터 로드 -------------------------------
let scheduledMessages = [];
let keywordRules = [];
let aiSkills = [];
let liveSchedule = [];
let productSpecs = [];
let broadcastSettings = {
  scheduled_interval_sec: 300, scheduled_mode: 'sequential', keyword_reply_interval_sec: 15,
  ai_role_instructions: '', ai_tone_guide: '',
  ai_model: 'claude-haiku-4-5-20251001', ai_min_interval_sec: 15, ai_max_calls_per_broadcast: 100, ai_per_nickname_cooldown_sec: 60,
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

  const modelSelect = document.getElementById('aiModelSelect');
  const minIntervalInput = document.getElementById('aiMinIntervalSecInput');
  const maxCallsInput = document.getElementById('aiMaxCallsInput');
  const cooldownInput = document.getElementById('aiCooldownInput');
  if (modelSelect) modelSelect.value = broadcastSettings.ai_model || 'claude-haiku-4-5-20251001';
  if (minIntervalInput) minIntervalInput.value = broadcastSettings.ai_min_interval_sec ?? 15;
  if (maxCallsInput) maxCallsInput.value = broadcastSettings.ai_max_calls_per_broadcast ?? 100;
  if (cooldownInput) cooldownInput.value = broadcastSettings.ai_per_nickname_cooldown_sec ?? 60;
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
    .upsert({ id: 'default', ai_model, ai_min_interval_sec, ai_max_calls_per_broadcast, ai_per_nickname_cooldown_sec });

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

