// ============================================================
//  제품 스펙 관리 (직접 입력 / JSON 일괄 입력)
// ============================================================

// ------------------------------- 제품 스펙 관리 -------------------------------
let parsedSpecImportRows = [];
let inlineEditingSpecId = null; // 지금 카드 안에서 바로 수정 중인 모델 (상단 폼은 "새로 추가" 전용)

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
    updateSpecSelectionCount();
    return;
  }
  container.innerHTML = '';
  productSpecs.forEach((spec) => {
    const div = document.createElement('div');
    const enabled = spec.enabled !== false;
    div.style.cssText = `border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:8px; display:flex; gap:10px; opacity:${enabled ? '1' : '0.5'};`;

    if (inlineEditingSpecId === spec.id) {
      div.style.opacity = '1';
      renderInlineSpecEditForm(div, spec);
      container.appendChild(div);
      return;
    }

    const specLine = [spec.os, spec.cpu, spec.resolution, spec.memory, spec.storage, spec.color].filter(Boolean).join(' · ');
    const extraKeys = spec.extra && typeof spec.extra === 'object' ? Object.keys(spec.extra) : [];
    const extraLine = extraKeys.map((k) => `${k}=${spec.extra[k]}`).join(', ');
    div.innerHTML = `
      <input type="checkbox" class="spec-select-checkbox" data-id="${spec.id}" style="margin-top:3px;" />
      <div style="flex:1; display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div>
          <b>${escapeHtml(spec.model_name)}</b>
          ${!enabled ? '<span class="chip" style="background:#f1f2f4;color:var(--sub);margin-left:6px;">사용 안 함</span>' : ''}
          <div class="hint" style="margin-top:4px;">${escapeHtml(specLine || '(스펙 미입력)')}</div>
          ${extraKeys.length ? `<div class="hint" style="margin-top:4px;">기타: ${escapeHtml(extraLine)}</div>` : ''}
        </div>
        <div class="li-actions" style="display:flex; align-items:center; gap:8px;">
          <label class="switch" title="AI 답변에 이 모델 스펙 사용"><input type="checkbox" class="spec-enable-toggle" ${enabled ? 'checked' : ''}/><span class="slider"></span></label>
          <button class="btn btn-outline btn-sm spec-edit-btn">수정</button>
          <button class="btn-danger-outline spec-delete-btn">삭제</button>
        </div>
      </div>
    `;
    div.querySelector('.spec-edit-btn').addEventListener('click', () => startEditSpec(spec));
    div.querySelector('.spec-delete-btn').addEventListener('click', () => deleteSpec(spec));
    div.querySelector('.spec-select-checkbox').addEventListener('change', updateSpecSelectionCount);
    div.querySelector('.spec-enable-toggle').addEventListener('change', async (e) => {
      const { error } = await supabaseClient.from('product_specs').update({ enabled: e.target.checked }).eq('id', spec.id);
      if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
      showSaveStatus(e.target.checked ? '사용으로 켰습니다 ✓' : '사용 안 함으로 껐습니다 ✓', 'ok');
      await loadProductSpecs();
    });
    container.appendChild(div);
  });
  updateSpecSelectionCount();
}

function getSelectedSpecIds() {
  return Array.from(document.querySelectorAll('.spec-select-checkbox:checked')).map((el) => el.dataset.id);
}

function updateSpecSelectionCount() {
  const countEl = document.getElementById('specSelectionCount');
  const selectAllBox = document.getElementById('specSelectAllCheckbox');
  if (!countEl) return;
  const total = productSpecs.length;
  const selected = getSelectedSpecIds().length;
  countEl.textContent = `${selected}개 선택 (전체 ${total}개)`;
  if (selectAllBox) selectAllBox.checked = total > 0 && selected === total;
}

// 체크된 항목이 있으면 그것만, 하나도 없으면 전체를 내보냅니다.
function getSpecsForExport() {
  const selectedIds = new Set(getSelectedSpecIds());
  return selectedIds.size > 0 ? productSpecs.filter((s) => selectedIds.has(String(s.id))) : productSpecs;
}

function specToExportRow(spec) {
  return {
    modelName: spec.model_name,
    os: spec.os || '',
    cpu: spec.cpu || '',
    resolution: spec.resolution || '',
    memory: spec.memory || '',
    storage: spec.storage || '',
    color: spec.color || '',
    extra: spec.extra && typeof spec.extra === 'object' ? spec.extra : {},
    enabled: spec.enabled !== false,
  };
}

// 삭제는 되돌릴 수 없어서, 켜기/끄기·내보내기와 달리 "선택 안 하면 전체"로 처리하지
// 않습니다 — 반드시 하나 이상 선택해야만 동작합니다.
async function bulkDeleteSelectedSpecs() {
  const ids = getSelectedSpecIds();
  if (ids.length === 0) { alert('삭제할 항목을 먼저 선택해주세요.'); return; }
  if (!confirm(`선택한 제품 스펙 ${ids.length}개를 삭제할까요? (되돌릴 수 없습니다)`)) return;

  const { error } = await supabaseClient.from('product_specs').delete().in('id', ids);
  if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
  showSaveStatus(`${ids.length}개 삭제됨 ✓`, 'ok');
  await loadProductSpecs();
}

// 체크된 항목이 있으면 그것만, 없으면 전체의 사용 여부를 한 번에 바꿉니다.
async function bulkSetSpecsEnabled(nextEnabled) {
  const specs = getSpecsForExport(); // "선택했으면 선택한 것만, 아니면 전체" 규칙을 export와 그대로 공유합니다.
  if (specs.length === 0) { alert('대상 제품 스펙이 없습니다.'); return; }
  const label = nextEnabled ? '사용으로 켤까요' : '사용 안 함으로 끌까요';
  if (!confirm(`${specs.length}개 모델을 ${label}? (AI 답변 참고 여부에 즉시 반영됩니다)`)) return;

  const results = await Promise.all(
    specs.map((s) => supabaseClient.from('product_specs').update({ enabled: nextEnabled }).eq('id', s.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed) { showSaveStatus('일괄 변경 실패: ' + failed.error.message, 'err'); return; }
  showSaveStatus(`${specs.length}개 모델을 ${nextEnabled ? '켬' : '끔'} ✓`, 'ok');
  await loadProductSpecs();
}

function exportSpecsAsJson() {
  const specs = getSpecsForExport();
  if (specs.length === 0) { alert('내보낼 제품 스펙이 없습니다.'); return; }
  const rows = specs.map(specToExportRow);
  downloadBlob(`제품스펙_${specs.length}개.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
  showSaveStatus(`${specs.length}개 모델을 JSON으로 내보냈습니다 ✓`, 'ok');
}

function exportSpecsAsXlsx() {
  const specs = getSpecsForExport();
  if (specs.length === 0) { alert('내보낼 제품 스펙이 없습니다.'); return; }
  const headers = ['모델명', '운영체제', 'CPU', '해상도', '메모리', '저장장치', '색상', '기타', '사용여부'];
  const rows = specs.map((spec) => {
    const row = specToExportRow(spec);
    const extraStr = Object.keys(row.extra).length ? JSON.stringify(row.extra) : '';
    return [row.modelName, row.os, row.cpu, row.resolution, row.memory, row.storage, row.color, extraStr, row.enabled ? '사용' : '미사용'];
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '제품스펙');
  XLSX.writeFile(wb, `제품스펙_${specs.length}개.xlsx`);
  showSaveStatus(`${specs.length}개 모델을 Excel로 내보냈습니다 ✓`, 'ok');
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

// "수정"을 누르면 상단 폼이 아니라, 그 카드 자체가 바로 입력 폼으로 바뀝니다
// (스킬 관리 탭과 동일한 방식). 상단 폼은 이제 "새 모델 추가" 전용입니다.
function startEditSpec(spec) {
  inlineEditingSpecId = spec.id;
  renderSpecList();
}

function renderInlineSpecEditForm(container, spec) {
  container.innerHTML = `
    <div style="flex:1; min-width:0;">
      <h3 style="margin:0 0 12px; font-size:14px;">✏️ "${escapeHtml(spec.model_name)}" 수정</h3>
      <div class="row-2">
        <div class="field"><label>모델명</label><input type="text" class="ie-spec-model" /></div>
        <div class="field"><label>색상</label><input type="text" class="ie-spec-color" /></div>
      </div>
      <div class="row-2">
        <div class="field"><label>운영체제</label><input type="text" class="ie-spec-os" /></div>
        <div class="field"><label>CPU</label><input type="text" class="ie-spec-cpu" /></div>
      </div>
      <div class="row-2">
        <div class="field"><label>해상도</label><input type="text" class="ie-spec-resolution" /></div>
        <div class="field"><label>메모리</label><input type="text" class="ie-spec-memory" /></div>
      </div>
      <div class="field"><label>저장장치</label><input type="text" class="ie-spec-storage" /></div>
      <div class="field"><label>기타 (JSON)</label><textarea class="ie-spec-extra" style="min-height:60px;font-family:monospace;font-size:11.5px;"></textarea></div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary ie-spec-save" style="flex:1;">수정 내용 저장</button>
        <button class="btn btn-outline ie-spec-cancel">취소</button>
      </div>
    </div>`;

  const els = {
    model: container.querySelector('.ie-spec-model'),
    color: container.querySelector('.ie-spec-color'),
    os: container.querySelector('.ie-spec-os'),
    cpu: container.querySelector('.ie-spec-cpu'),
    resolution: container.querySelector('.ie-spec-resolution'),
    memory: container.querySelector('.ie-spec-memory'),
    storage: container.querySelector('.ie-spec-storage'),
    extra: container.querySelector('.ie-spec-extra'),
  };
  els.model.value = spec.model_name || '';
  els.color.value = spec.color || '';
  els.os.value = spec.os || '';
  els.cpu.value = spec.cpu || '';
  els.resolution.value = spec.resolution || '';
  els.memory.value = spec.memory || '';
  els.storage.value = spec.storage || '';
  els.extra.value = spec.extra && Object.keys(spec.extra).length ? JSON.stringify(spec.extra, null, 2) : '';

  container.querySelector('.ie-spec-cancel').addEventListener('click', () => {
    inlineEditingSpecId = null;
    renderSpecList();
  });
  container.querySelector('.ie-spec-save').addEventListener('click', async () => {
    const modelName = els.model.value.trim();
    if (!modelName) { alert('모델명을 입력해주세요.'); return; }

    let extra = {};
    const extraRaw = els.extra.value.trim();
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
      os: els.os.value.trim() || null,
      cpu: els.cpu.value.trim() || null,
      resolution: els.resolution.value.trim() || null,
      memory: els.memory.value.trim() || null,
      storage: els.storage.value.trim() || null,
      color: els.color.value.trim() || null,
      extra,
    };
    const { error } = await supabaseClient.from('product_specs').update(payload).eq('id', spec.id);
    if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
    inlineEditingSpecId = null;
    showSaveStatus('저장됨 ✓', 'ok');
    await loadProductSpecs();
  });
}

// 상단 폼은 이제 "새 모델 추가" 전용입니다 (기존 모델 수정은 카드 안에서 바로 합니다).
function resetSpecForm() {
  ['specModelName', 'specOs', 'specCpu', 'specResolution', 'specMemory', 'specStorage', 'specColor', 'specExtra'].forEach((id) => {
    document.getElementById(id).value = '';
  });
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

  // 같은 모델명이 이미 있으면 새로 추가하는 대신 덮어씁니다(업서트) — 실수로 중복 등록되는 것을 방지합니다.
  const { error } = await supabaseClient.from('product_specs').upsert(payload, { onConflict: 'model_name' });
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
  if (inlineEditingSpecId === spec.id) inlineEditingSpecId = null;
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
  enabled: ['사용여부', '사용', 'enabled'],
};

function findSpecField(normalizedRowMap, fieldKey) {
  for (const alias of SPEC_FIELD_ALIASES[fieldKey]) {
    const aliasKey = normalizeHeaderKey(alias);
    if (aliasKey in normalizedRowMap) return normalizedRowMap[aliasKey];
  }
  return undefined;
}

function normalizeSpecEnabledValue(v) {
  if (v === undefined || v === null || v === '') return true; // 값이 없으면 기본은 사용함
  const s = normalizeHeaderKey(v);
  return !['미사용', 'false', '0', 'n', 'no', 'off', '사용안함', '사용 안 함'].includes(s);
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
  const enabled = normalizeSpecEnabledValue(findSpecField(map, 'enabled'));

  const errors = [];
  if (!modelName) errors.push('모델명 없음');

  return { modelName, os, cpu, resolution, memory, storage, color, extra, enabled, _errors: errors, _valid: errors.length === 0 };
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
    enabled: r.enabled,
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

