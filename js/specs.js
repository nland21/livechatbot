// ============================================================
//  제품 스펙 관리 (직접 입력 / JSON 일괄 입력)
// ============================================================

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
    updateSpecSelectionCount();
    return;
  }
  container.innerHTML = '';
  productSpecs.forEach((spec) => {
    const div = document.createElement('div');
    div.style.cssText = 'border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:8px; display:flex; gap:10px;';
    const specLine = [spec.os, spec.cpu, spec.resolution, spec.memory, spec.storage, spec.color].filter(Boolean).join(' · ');
    const extraKeys = spec.extra && typeof spec.extra === 'object' ? Object.keys(spec.extra) : [];
    const extraLine = extraKeys.map((k) => `${k}=${spec.extra[k]}`).join(', ');
    div.innerHTML = `
      <input type="checkbox" class="spec-select-checkbox" data-id="${spec.id}" style="margin-top:3px;" />
      <div style="flex:1; display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
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
    div.querySelector('.spec-select-checkbox').addEventListener('change', updateSpecSelectionCount);
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
  };
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
  const headers = ['모델명', '운영체제', 'CPU', '해상도', '메모리', '저장장치', '색상', '기타'];
  const rows = specs.map((spec) => {
    const row = specToExportRow(spec);
    const extraStr = Object.keys(row.extra).length ? JSON.stringify(row.extra) : '';
    return [row.modelName, row.os, row.cpu, row.resolution, row.memory, row.storage, row.color, extraStr];
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

