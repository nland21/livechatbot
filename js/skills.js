// ============================================================
//  스킬 관리 (AI 자동답변용 지식) + 파일(JSON/CSV/엑셀) 일괄 등록
// ============================================================

// ------------------------------- 스킬 관리 -------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function getSortedSkills(skills) {
  return [...skills].sort((a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0));
}

let expandedSkillIds = new Set();   // 지금 펼쳐진 스킬 카드들
let inlineEditingSkillId = null;    // 지금 카드 안에서 바로 수정 중인 스킬

function buildSkillCard(skill, displayIndex) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.opacity = skill.enabled ? '1' : '0.5';

  if (inlineEditingSkillId === skill.id) {
    renderInlineSkillEditForm(card, skill);
    return card;
  }

  const isExpanded = expandedSkillIds.has(skill.id);
  const scopeBadge = skill.scope === 'broadcast'
    ? `<span class="skill-scope-badge broadcast">라이브 ${escapeHtml(skill.broadcast_id || '?')} 전용</span>`
    : '<span class="skill-scope-badge common">공통</span>';

  const chips = (skill.keywords && skill.keywords.length > 0)
    ? skill.keywords.map((k) => `<span class="chip">${escapeHtml(k)}</span>`).join('')
    : '<span class="chip" style="background:var(--brand-soft);color:var(--brand-dark);font-weight:700;">항상 포함</span>';

  card.innerHTML = `
    <div class="skill-card-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;cursor:pointer;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="display:inline-block;width:12px;color:var(--sub);">${isExpanded ? '▾' : '▸'}</span>
        <span class="priority-badge">우선순위 ${displayIndex + 1}</span>
        <b></b>
        ${scopeBadge}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;" class="skill-card-actions">
        <label class="switch"><input type="checkbox" class="skill-enable" ${skill.enabled ? 'checked' : ''}/><span class="slider"></span></label>
        <button class="btn btn-outline skill-edit" style="padding:5px 9px;font-size:11px;">수정</button>
        <button class="btn-danger-outline skill-delete">삭제</button>
      </div>
    </div>
    <div class="skill-card-body" style="display:${isExpanded ? 'block' : 'none'};margin-top:10px;">
      <div style="margin-bottom:10px;">${chips}</div>
      <div class="hint" style="background:#f7f8fa;border-radius:8px;padding:10px 12px;white-space:pre-wrap;"></div>
    </div>`;

  card.querySelector('b').textContent = skill.title;
  card.querySelector('.skill-card-body .hint').textContent = skill.content || '(내용 없음)';

  // 헤더(버튼 영역 제외)를 클릭하면 펼치기/접기가 토글됩니다. 내용이 아무리 길어도 잘리지 않고 전부 보여줍니다.
  card.querySelector('.skill-card-header').addEventListener('click', (e) => {
    if (e.target.closest('.skill-card-actions')) return;
    if (expandedSkillIds.has(skill.id)) expandedSkillIds.delete(skill.id);
    else expandedSkillIds.add(skill.id);
    renderSkills();
  });

  card.querySelector('.skill-enable').addEventListener('click', (e) => e.stopPropagation());
  card.querySelector('.skill-enable').addEventListener('change', async (e) => {
    const { error } = await supabaseClient.from('ai_skills').update({ enabled: e.target.checked }).eq('id', skill.id);
    if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
    showSaveStatus('저장됨 ✓', 'ok');
    await loadSkills();
  });
  card.querySelector('.skill-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    inlineEditingSkillId = skill.id;
    renderSkills();
  });
  card.querySelector('.skill-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`스킬 "${skill.title}"을(를) 삭제할까요?`)) return;
    const { error } = await supabaseClient.from('ai_skills').delete().eq('id', skill.id);
    if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
    expandedSkillIds.delete(skill.id);
    if (inlineEditingSkillId === skill.id) inlineEditingSkillId = null;
    showSaveStatus('삭제됨 ✓', 'ok');
    await loadSkills();
  });
  return card;
}

// "수정"을 누르면 이동하지 않고, 바로 그 카드 안에서 수정할 수 있도록 폼을 그 자리에 그립니다.
function renderInlineSkillEditForm(card, skill) {
  const { requiredContent, coreRules } = splitSkillContent(skill.content);
  card.innerHTML = `
    <h3 style="margin-top:0;">✏️ 스킬 수정</h3>
    <div class="row-2">
      <div class="field"><label>스킬 제목</label><input type="text" class="ie-title" /></div>
      <div class="field"><label>적용 범위</label>
        <select class="ie-scope">
          <option value="common">공통 (모든 방송)</option>
          <option value="broadcast">특정 방송 전용</option>
        </select>
      </div>
    </div>
    <div class="field ie-broadcast-field" style="display:none;">
      <label>적용할 라이브 아이디</label>
      <input type="text" class="ie-broadcastId" placeholder="예: 1947700" />
    </div>
    <div class="row-2">
      <div class="field"><label>트리거 키워드 (쉼표로 구분, 비우면 항상 포함)</label><input type="text" class="ie-keywords" /></div>
      <div class="field"><label>매칭 방식</label>
        <select class="ie-matchType">
          <option value="any">하나라도 포함 (OR)</option>
          <option value="all">모두 포함 (AND)</option>
        </select>
      </div>
    </div>
    <div class="field"><label>필수 포함 내용</label><textarea class="ie-required" style="min-height:70px;"></textarea></div>
    <div class="field"><label>핵심 규칙</label><textarea class="ie-rules" style="min-height:90px;"></textarea></div>
    <div style="display:flex; gap:8px;">
      <button class="btn btn-primary ie-save" style="flex:1;">수정 내용 저장</button>
      <button class="btn btn-outline ie-cancel">취소</button>
    </div>`;

  const els = {
    title: card.querySelector('.ie-title'),
    scope: card.querySelector('.ie-scope'),
    broadcastField: card.querySelector('.ie-broadcast-field'),
    broadcastId: card.querySelector('.ie-broadcastId'),
    keywords: card.querySelector('.ie-keywords'),
    matchType: card.querySelector('.ie-matchType'),
    required: card.querySelector('.ie-required'),
    rules: card.querySelector('.ie-rules'),
  };

  els.title.value = skill.title;
  els.scope.value = skill.scope === 'broadcast' ? 'broadcast' : 'common';
  els.broadcastId.value = skill.broadcast_id || '';
  els.broadcastField.style.display = skill.scope === 'broadcast' ? 'block' : 'none';
  els.keywords.value = (skill.keywords || []).join(', ');
  els.matchType.value = skill.match_type === 'all' ? 'all' : 'any';
  els.required.value = requiredContent;
  els.rules.value = coreRules;

  els.scope.addEventListener('change', () => {
    els.broadcastField.style.display = els.scope.value === 'broadcast' ? 'block' : 'none';
  });

  card.querySelector('.ie-cancel').addEventListener('click', () => {
    inlineEditingSkillId = null;
    renderSkills();
  });

  card.querySelector('.ie-save').addEventListener('click', async () => {
    const title = els.title.value.trim();
    const scope = els.scope.value;
    const broadcastId = els.broadcastId.value.trim();
    const keywords = els.keywords.value.split(',').map((k) => k.trim()).filter(Boolean);
    const matchType = els.matchType.value;
    const content = combineSkillContent(els.required.value, els.rules.value);

    if (!title || !content) { alert('스킬 제목과, 필수 포함 내용·핵심 규칙 중 최소 1개는 입력해주세요.'); return; }
    if (scope === 'broadcast' && !/^\d+$/.test(broadcastId)) {
      alert('방송 전용 스킬은 라이브 아이디(숫자)를 입력해야 합니다.');
      return;
    }

    const payload = { title, scope, broadcast_id: scope === 'broadcast' ? broadcastId : null, keywords, match_type: matchType, content };
    const { error } = await supabaseClient.from('ai_skills').update(payload).eq('id', skill.id);
    if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
    inlineEditingSkillId = null;
    showSaveStatus('저장됨 ✓', 'ok');
    await loadSkills();
  });
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

// 상단 "+ 새 스킬 추가" 폼은 이제 추가 전용입니다. 기존 스킬 수정은 각 카드 안에서 바로 이뤄집니다.
function resetSkillForm() {
  document.getElementById('skillTitle').value = '';
  document.getElementById('skillScope').value = 'common';
  document.getElementById('skillBroadcastId').value = '';
  document.getElementById('skillBroadcastIdField').style.display = 'none';
  document.getElementById('skillKeywords').value = '';
  document.getElementById('skillMatchType').value = 'any';
  document.getElementById('skillRequiredContent').value = '';
  document.getElementById('skillCoreRules').value = '';
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

  const { error } = await supabaseClient.from('ai_skills').insert({ ...payload, enabled: true });
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

