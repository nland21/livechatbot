// ============================================================
//  상품 혜택 관리 (직접 입력 / 엑셀·JSON 일괄 입력)
//  실제결제가 = 쿠폰·카드할인(discounts)으로 깎여서 나온 값
//  라이브최대혜택가 = 각종 적립(rewards)이 더해진 실질 가치 (합계는 자동 계산)
//  사은품(gifts) = 여러 개 자유롭게 추가
// ============================================================

let editingBenefitId = null;
let selectedBenefitIds = new Set();
let expandedBenefitIds = new Set();
let parsedBenefitImportRows = [];

async function loadProductBenefits() {
  const { data, error } = await supabaseClient
    .from('product_benefits').select('*').order('model_name', { ascending: true });
  if (error) { showSaveStatus('상품 혜택 불러오기 실패: ' + error.message, 'err'); return; }
  productBenefits = data || [];
  renderBenefitList();
}

// rewards(적립 항목)의 값들을 전부 더합니다. content.js/options.js와 동일한 규칙입니다.
function sumRewardValues(rewards) {
  if (!rewards || typeof rewards !== 'object') return 0;
  return Object.values(rewards).reduce((sum, v) => {
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function formatWon(n) {
  if (n === null || n === undefined || n === '') return '(미입력)';
  const num = Number(n);
  return Number.isFinite(num) ? `${num.toLocaleString('ko-KR')}원` : String(n);
}

function renderBenefitList() {
  const container = document.getElementById('benefitList');
  if (!container) return;
  if (productBenefits.length === 0) {
    container.innerHTML = '<p class="hint">등록된 상품 혜택이 없습니다.</p>';
    updateBenefitSelectionCount();
    return;
  }
  container.innerHTML = '';
  productBenefits.forEach((b) => {
    const enabled = b.enabled !== false;
    const isExpanded = expandedBenefitIds.has(b.id);
    const discountKeys = b.discounts && typeof b.discounts === 'object' ? Object.keys(b.discounts) : [];
    const rewardKeys = b.rewards && typeof b.rewards === 'object' ? Object.keys(b.rewards) : [];
    const gifts = Array.isArray(b.gifts) ? b.gifts : [];
    const rewardSum = sumRewardValues(b.rewards);

    const card = document.createElement('div');
    card.style.cssText = `border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:8px; opacity:${enabled ? '1' : '0.5'};`;

    const headerHtml = `
      <div class="benefit-card-header" style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
        <input type="checkbox" class="benefit-select-checkbox" data-id="${b.id}" style="margin-top:3px;" />
        <span style="display:inline-block;width:12px;color:var(--sub);">${isExpanded ? '▾' : '▸'}</span>
        <div style="flex:1; min-width:0;">
          <b>${escapeHtml(b.model_name)}</b>
          <span class="chip" style="background:var(--brand-soft);color:var(--brand-dark);margin-left:6px;">상품코드 ${escapeHtml(b.product_code || '미입력')}</span>
          ${!enabled ? '<span class="chip" style="background:#f1f2f4;color:var(--sub);margin-left:6px;">사용 안 함</span>' : ''}
          ${!isExpanded ? `<div class="hint" style="margin-top:4px;">결제가 ${formatWon(b.actual_price)} · 최대혜택가 ${formatWon(b.max_benefit_price)} · 사은품 ${gifts.length}종 (클릭하여 펼치기)</div>` : ''}
        </div>
        <div class="li-actions" style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          <label class="switch" title="AI 답변에 이 모델 혜택 사용"><input type="checkbox" class="benefit-enable-toggle" ${enabled ? 'checked' : ''}/><span class="slider"></span></label>
          <button class="btn btn-outline btn-sm benefit-edit-btn">수정</button>
          <button class="btn-danger-outline benefit-delete-btn">삭제</button>
        </div>
      </div>
    `;

    const bodyHtml = isExpanded ? `
      <div style="margin-top:12px; margin-left:22px;">
        <div style="background:#fdf1ea; border-radius:8px; padding:10px 12px;">
          <div style="display:flex; align-items:baseline; justify-content:space-between;">
            <span style="font-size:11.5px; font-weight:700; color:#b5651d;">💳 실제 결제가</span>
            <span style="font-size:15px; font-weight:800;">${formatWon(b.actual_price)}</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
            ${discountKeys.length ? discountKeys.map((k) => `<span class="chip" style="background:#fff;border:1px solid #f0d9c4;color:#8a5a24;">${escapeHtml(k)} ${escapeHtml(String(b.discounts[k]))}</span>`).join('') : '<span class="hint" style="margin:0;">등록된 쿠폰·할인 없음</span>'}
          </div>
        </div>
        <div style="margin-top:8px; background:var(--brand-soft); border-radius:8px; padding:10px 12px;">
          <div style="display:flex; align-items:baseline; justify-content:space-between;">
            <span style="font-size:11.5px; font-weight:700; color:var(--brand-dark);">🏷️ 라이브 최대혜택가</span>
            <span style="font-size:15px; font-weight:800; color:var(--brand-dark);">${formatWon(b.max_benefit_price)}</span>
          </div>
          ${rewardSum > 0 ? `<div style="display:flex; align-items:baseline; justify-content:space-between; margin-top:2px;"><span style="font-size:10.5px; color:#3f9d6f;">↳ 적립금 합계 (아래 항목 자동 합산)</span><span style="font-size:12px; font-weight:700; color:#3f9d6f;">${formatWon(rewardSum)}</span></div>` : ''}
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
            ${rewardKeys.length ? rewardKeys.map((k) => `<span class="chip" style="background:#fff;border:1px solid #bfe8cf;color:#02824a;">${escapeHtml(k)} ${escapeHtml(String(b.rewards[k]))}</span>`).join('') : '<span class="hint" style="margin:0;">등록된 적립 없음</span>'}
          </div>
        </div>
        <div style="margin-top:8px; background:#f7f8fa; border-radius:8px; padding:10px 12px;">
          <div style="font-size:11.5px; font-weight:700; color:#5b6472;">🎁 사은품</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
            ${gifts.length ? gifts.map((g) => `<span class="chip" style="background:#fff;border:1px solid #dfe2e6;color:var(--text);">${escapeHtml(g)}</span>`).join('') : '<span class="hint" style="margin:0;">등록된 사은품 없음</span>'}
          </div>
        </div>
      </div>
    ` : '';

    card.innerHTML = headerHtml + bodyHtml;

    card.querySelector('.benefit-card-header').addEventListener('click', (e) => {
      if (e.target.closest('.li-actions') || e.target.closest('.benefit-select-checkbox')) return;
      if (expandedBenefitIds.has(b.id)) expandedBenefitIds.delete(b.id);
      else expandedBenefitIds.add(b.id);
      renderBenefitList();
    });
    card.querySelector('.benefit-select-checkbox').addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.benefit-select-checkbox').addEventListener('change', (e) => {
      if (e.target.checked) selectedBenefitIds.add(b.id);
      else selectedBenefitIds.delete(b.id);
      updateBenefitSelectionCount();
    });
    card.querySelector('.benefit-select-checkbox').checked = selectedBenefitIds.has(b.id);
    card.querySelector('.benefit-edit-btn').addEventListener('click', (e) => { e.stopPropagation(); startEditBenefit(b); });
    card.querySelector('.benefit-delete-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteBenefit(b); });
    card.querySelector('.benefit-enable-toggle').addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.benefit-enable-toggle').addEventListener('change', async (e) => {
      const { error } = await supabaseClient.from('product_benefits').update({ enabled: e.target.checked }).eq('id', b.id);
      if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
      showSaveStatus(e.target.checked ? '사용으로 켰습니다 ✓' : '사용 안 함으로 껐습니다 ✓', 'ok');
      await loadProductBenefits();
    });

    container.appendChild(card);
  });
  updateBenefitSelectionCount();
}

function getSelectedBenefitIds() {
  const validIds = new Set(productBenefits.map((b) => b.id));
  selectedBenefitIds.forEach((id) => { if (!validIds.has(id)) selectedBenefitIds.delete(id); });
  return Array.from(selectedBenefitIds);
}

function updateBenefitSelectionCount() {
  const countEl = document.getElementById('benefitSelectionCount');
  const selectAllBox = document.getElementById('benefitSelectAllCheckbox');
  if (!countEl) return;
  const total = productBenefits.length;
  const selected = getSelectedBenefitIds().length;
  countEl.textContent = `${selected}개 선택 (전체 ${total}개)`;
  if (selectAllBox) selectAllBox.checked = total > 0 && selected === total;
}

// 체크된 항목이 있으면 그것만, 없으면 전체를 대상으로 합니다. (제품 스펙과 동일한 규칙)
function getBenefitsForExport() {
  const selectedIds = new Set(getSelectedBenefitIds());
  return selectedIds.size > 0 ? productBenefits.filter((b) => selectedIds.has(b.id)) : productBenefits;
}

function benefitToExportRow(b) {
  return {
    modelName: b.model_name,
    productCode: b.product_code || '',
    actualPrice: b.actual_price ?? '',
    maxBenefitPrice: b.max_benefit_price ?? '',
    discounts: b.discounts && typeof b.discounts === 'object' ? b.discounts : {},
    rewards: b.rewards && typeof b.rewards === 'object' ? b.rewards : {},
    gifts: Array.isArray(b.gifts) ? b.gifts : [],
    enabled: b.enabled !== false,
  };
}

// 삭제는 되돌릴 수 없어서, 켜기/끄기·내보내기와 달리 "선택 안 하면 전체"로 처리하지
// 않습니다 — 반드시 하나 이상 선택해야만 동작합니다.
async function bulkDeleteSelectedBenefits() {
  const ids = getSelectedBenefitIds();
  if (ids.length === 0) { alert('삭제할 항목을 먼저 선택해주세요.'); return; }
  if (!confirm(`선택한 상품 혜택 ${ids.length}개를 삭제할까요? (되돌릴 수 없습니다)`)) return;

  const { error } = await supabaseClient.from('product_benefits').delete().in('id', ids);
  if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
  showSaveStatus(`${ids.length}개 삭제됨 ✓`, 'ok');
  await loadProductBenefits();
}

async function bulkSetBenefitsEnabled(nextEnabled) {
  const benefits = getBenefitsForExport();
  if (benefits.length === 0) { alert('대상 상품 혜택이 없습니다.'); return; }
  const label = nextEnabled ? '사용으로 켤까요' : '사용 안 함으로 끌까요';
  if (!confirm(`${benefits.length}개 모델을 ${label}? (AI 답변 참고 여부에 즉시 반영됩니다)`)) return;

  const results = await Promise.all(
    benefits.map((b) => supabaseClient.from('product_benefits').update({ enabled: nextEnabled }).eq('id', b.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed) { showSaveStatus('일괄 변경 실패: ' + failed.error.message, 'err'); return; }
  showSaveStatus(`${benefits.length}개 모델을 ${nextEnabled ? '켬' : '끔'} ✓`, 'ok');
  await loadProductBenefits();
}

function exportBenefitsAsJson() {
  const benefits = getBenefitsForExport();
  if (benefits.length === 0) { alert('내보낼 상품 혜택이 없습니다.'); return; }
  const rows = benefits.map(benefitToExportRow);
  downloadBlob(`상품혜택_${rows.length}개.json`, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
  showSaveStatus(`${rows.length}개 모델을 JSON으로 내보냈습니다 ✓`, 'ok');
}

function exportBenefitsAsXlsx() {
  const benefits = getBenefitsForExport();
  if (benefits.length === 0) { alert('내보낼 상품 혜택이 없습니다.'); return; }
  // 쿠폰·적립 항목은 모델마다 이름이 달라서 고정된 열로 만들 수 없습니다 — 그래서 "이름=값"을
  // 쉼표로 나열하는 형태로 한 칸에 담습니다. 다시 올릴 때도 이 형식을 그대로 인식합니다.
  const flattenPairs = (obj) => Object.entries(obj || {}).map(([k, v]) => `${k}=${v}`).join(', ');
  const headers = ['모델명', '상품코드', '실제결제가', '쿠폰・카드할인', '라이브최대혜택가', '적립금', '사은품', '사용여부'];
  const rows = benefits.map((b) => {
    const row = benefitToExportRow(b);
    return [
      row.modelName, row.productCode, row.actualPrice,
      flattenPairs(row.discounts), row.maxBenefitPrice, flattenPairs(row.rewards),
      row.gifts.join(', '), row.enabled ? '사용' : '미사용',
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '상품혜택');
  XLSX.writeFile(wb, `상품혜택_${rows.length}개.xlsx`);
  showSaveStatus(`${rows.length}개 모델을 Excel로 내보냈습니다 ✓`, 'ok');
}

// ---------------- 직접 입력 폼 ----------------
function pairsTextToObject(text) {
  // "이름=값" 한 줄에 하나씩. 빈 줄은 무시합니다.
  const obj = {};
  (text || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const idx = line.indexOf('=');
    if (idx < 0) return;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) obj[k] = v;
  });
  return obj;
}

function objectToPairsText(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n');
}

function switchBenefitMode(mode) {
  const manualForm = document.getElementById('benefitManualForm');
  const importForm = document.getElementById('benefitImportForm');
  const manualBtn = document.getElementById('benefitModeManualBtn');
  const importBtn = document.getElementById('benefitModeImportBtn');
  if (mode === 'import') {
    manualForm.style.display = 'none';
    importForm.style.display = 'block';
    manualBtn.classList.remove('btn-primary');
    importBtn.classList.add('btn-primary');
  } else {
    manualForm.style.display = 'block';
    importForm.style.display = 'none';
    importBtn.classList.remove('btn-primary');
    manualBtn.classList.add('btn-primary');
  }
}

function startEditBenefit(b) {
  editingBenefitId = b.id;
  document.getElementById('benefitFormTitle').textContent = `"${b.model_name}" 수정`;
  document.getElementById('benefitModelName').value = b.model_name || '';
  document.getElementById('benefitProductCode').value = b.product_code || '';
  document.getElementById('benefitActualPrice').value = b.actual_price ?? '';
  document.getElementById('benefitMaxBenefitPrice').value = b.max_benefit_price ?? '';
  document.getElementById('benefitDiscounts').value = objectToPairsText(b.discounts);
  document.getElementById('benefitRewards').value = objectToPairsText(b.rewards);
  document.getElementById('benefitGifts').value = Array.isArray(b.gifts) ? b.gifts.join(', ') : '';
  document.getElementById('saveBenefitBtn').textContent = '수정 저장';
  document.getElementById('cancelBenefitEditBtn').style.display = 'inline-block';
  switchBenefitMode('manual');
}

function resetBenefitForm() {
  editingBenefitId = null;
  document.getElementById('benefitFormTitle').textContent = '+ 새 혜택 등록';
  ['benefitModelName', 'benefitProductCode', 'benefitActualPrice', 'benefitMaxBenefitPrice', 'benefitDiscounts', 'benefitRewards', 'benefitGifts'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  document.getElementById('saveBenefitBtn').textContent = '혜택 등록';
  document.getElementById('cancelBenefitEditBtn').style.display = 'none';
}

async function saveBenefit() {
  const modelName = document.getElementById('benefitModelName').value.trim();
  if (!modelName) { alert('모델명을 입력해주세요.'); return; }

  const payload = {
    model_name: modelName,
    product_code: document.getElementById('benefitProductCode').value.trim() || null,
    actual_price: document.getElementById('benefitActualPrice').value.trim() || null,
    max_benefit_price: document.getElementById('benefitMaxBenefitPrice').value.trim() || null,
    discounts: pairsTextToObject(document.getElementById('benefitDiscounts').value),
    rewards: pairsTextToObject(document.getElementById('benefitRewards').value),
    gifts: document.getElementById('benefitGifts').value.split(',').map((g) => g.trim()).filter(Boolean),
  };

  let error;
  if (editingBenefitId) {
    ({ error } = await supabaseClient.from('product_benefits').update(payload).eq('id', editingBenefitId));
  } else {
    // 같은 모델명이 이미 있으면 새로 추가하는 대신 덮어씁니다 — "혜택이 가장 좋은 상품코드 하나만
    // 남긴다"는 운영 방식이 자연스럽게 지켜지도록 하기 위함입니다.
    ({ error } = await supabaseClient.from('product_benefits').upsert(payload, { onConflict: 'model_name' }));
  }
  if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  resetBenefitForm();
  showSaveStatus('저장됨 ✓', 'ok');
  await loadProductBenefits();
}

async function deleteBenefit(b) {
  if (!confirm(`"${b.model_name}" 혜택을 삭제할까요?`)) return;
  const { error } = await supabaseClient.from('product_benefits').delete().eq('id', b.id);
  if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
  showSaveStatus('삭제됨 ✓', 'ok');
  if (editingBenefitId === b.id) resetBenefitForm();
  await loadProductBenefits();
}

// ---------------- 엑셀・JSON 일괄 등록 ----------------
const BENEFIT_FIELD_ALIASES = {
  modelName: ['모델명', 'model', 'modelname', 'model_name'],
  productCode: ['상품코드', 'productcode', 'product_code'],
  actualPrice: ['실제결제가', '실제 결제가', 'actualprice', 'actual_price'],
  maxBenefitPrice: ['라이브최대혜택가', '라이브 최대혜택가', '최대혜택가', 'maxbenefitprice', 'max_benefit_price'],
  gifts: ['사은품', 'gifts'],
  enabled: ['사용여부', '사용', 'enabled'],
};

function normalizeBenefitEnabledValue(v) {
  if (v === undefined || v === null || v === '') return true;
  const s = normalizeHeaderKey(v);
  return !['미사용', 'false', '0', 'n', 'no', 'off', '사용안함', '사용 안 함'].includes(s);
}

// 모델명·상품코드·실제결제가·라이브최대혜택가·사은품·사용여부를 제외한 나머지 칸은 전부
// 자유 항목입니다. 헤더 이름에 "적립"이 들어있으면 적립(rewards)으로, 그 외에는 쿠폰・
// 할인(discounts)으로 자동 분류합니다 — 관리자가 평소 쓰는 엑셀 헤더 이름을 그대로 써도
// 알아서 올바른 그룹으로 들어갑니다.
function parseBenefitRow(row) {
  const map = {};
  Object.keys(row || {}).forEach((k) => { map[normalizeHeaderKey(k)] = row[k]; });

  const findField = (key) => {
    for (const alias of BENEFIT_FIELD_ALIASES[key]) {
      const aliasKey = normalizeHeaderKey(alias);
      if (aliasKey in map) return map[aliasKey];
    }
    return undefined;
  };

  const modelName = String(findField('modelName') ?? '').trim();
  const productCode = String(findField('productCode') ?? '').trim();
  const actualPrice = String(findField('actualPrice') ?? '').trim();
  const maxBenefitPrice = String(findField('maxBenefitPrice') ?? '').trim();
  const giftsRaw = findField('gifts');
  const gifts = Array.isArray(giftsRaw)
    ? giftsRaw.map(String).map((g) => g.trim()).filter(Boolean)
    : String(giftsRaw ?? '').split(',').map((g) => g.trim()).filter(Boolean);
  const enabled = normalizeBenefitEnabledValue(findField('enabled'));

  // 이미 우리가 내보낸 JSON을 다시 올리는 경우: discounts/rewards가 이미 구조화돼 있으면 그대로 씁니다.
  let discounts = row.discounts && typeof row.discounts === 'object' ? { ...row.discounts } : {};
  let rewards = row.rewards && typeof row.rewards === 'object' ? { ...row.rewards } : {};

  // 그 외 칸(=고정 필드가 아닌 나머지 전부)은 헤더 이름으로 discounts/rewards 자동 분류합니다.
  const fixedKeys = new Set([
    ...BENEFIT_FIELD_ALIASES.modelName, ...BENEFIT_FIELD_ALIASES.productCode,
    ...BENEFIT_FIELD_ALIASES.actualPrice, ...BENEFIT_FIELD_ALIASES.maxBenefitPrice,
    ...BENEFIT_FIELD_ALIASES.gifts, ...BENEFIT_FIELD_ALIASES.enabled,
    'discounts', 'rewards',
  ].map(normalizeHeaderKey));
  Object.keys(row || {}).forEach((originalKey) => {
    const normKey = normalizeHeaderKey(originalKey);
    if (fixedKeys.has(normKey)) return;
    const value = row[originalKey];
    if (value === '' || value === null || value === undefined) return;
    if (originalKey.includes('적립')) rewards[originalKey] = value;
    else discounts[originalKey] = value;
  });

  const errors = [];
  if (!modelName) errors.push('모델명 없음');

  return {
    modelName, productCode, actualPrice, maxBenefitPrice, discounts, rewards, gifts, enabled,
    _errors: errors, _valid: errors.length === 0,
  };
}

function renderBenefitImportPreview() {
  const wrap = document.getElementById('benefitImportPreviewWrap');
  const summary = document.getElementById('benefitImportPreviewSummary');
  const list = document.getElementById('benefitImportPreviewList');
  const importBtn = document.getElementById('importBenefitsBtn');
  if (!wrap || !summary || !list || !importBtn) return;

  if (parsedBenefitImportRows.length === 0) {
    wrap.style.display = 'none';
    importBtn.style.display = 'none';
    return;
  }

  const validCount = parsedBenefitImportRows.filter((r) => r._valid).length;
  summary.textContent = `총 ${parsedBenefitImportRows.length}개 중 ${validCount}개 등록 가능합니다. (같은 모델명이 이미 있으면 내용을 덮어씁니다)`;

  list.innerHTML = '';
  parsedBenefitImportRows.forEach((row) => {
    const item = document.createElement('div');
    item.style.cssText = `display:flex; align-items:center; gap:10px; border:1px solid ${row._valid ? 'var(--border)' : 'var(--danger)'}; border-radius:8px; padding:10px 12px; margin-bottom:8px; font-size:12px;`;
    if (row._valid) {
      item.innerHTML = `
        <span>✅</span>
        <b>${escapeHtml(row.modelName)}</b>
        <span class="chip" style="background:var(--brand-soft);color:var(--brand-dark);">${escapeHtml(row.productCode || '상품코드 미입력')}</span>
        <span class="hint" style="margin:0; flex:1;">쿠폰・할인 ${Object.keys(row.discounts).length}개 · 적립 ${Object.keys(row.rewards).length}개 · 사은품 ${row.gifts.length}개</span>
      `;
    } else {
      item.innerHTML = `
        <span>⚠️</span>
        <span style="color:var(--danger);">${escapeHtml(row._errors.join(', '))}</span>
      `;
    }
    list.appendChild(item);
  });

  wrap.style.display = 'block';
  importBtn.style.display = validCount > 0 ? 'block' : 'none';
}

async function handleBenefitFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      parsedBenefitImportRows = rows.map(parseBenefitRow);
    } else if (name.endsWith('.csv')) {
      const text = await file.text();
      const rows = parseSimpleCsv(text);
      parsedBenefitImportRows = rows.map(parseBenefitRow);
    } else {
      const text = await file.text();
      const data = JSON.parse(text);
      const rows = Array.isArray(data) ? data : (Array.isArray(data.benefits) ? data.benefits : []);
      parsedBenefitImportRows = rows.map(parseBenefitRow);
    }
    renderBenefitImportPreview();
  } catch (err) {
    alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
  }
}

// 아주 단순한 CSV 파서(쉼표 구분, 첫 줄은 헤더) — 값 안에 쉼표가 든 복잡한 CSV는 지원하지 않습니다.
function parseSimpleCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

async function importBenefitsFromFile() {
  const validRows = parsedBenefitImportRows.filter((r) => r._valid);
  if (validRows.length === 0) { alert('등록 가능한 항목이 없습니다.'); return; }
  if (!confirm(`${validRows.length}개의 상품 혜택을 등록/갱신할까요?`)) return;

  const payload = validRows.map((r) => ({
    model_name: r.modelName,
    product_code: r.productCode || null,
    actual_price: r.actualPrice || null,
    max_benefit_price: r.maxBenefitPrice || null,
    discounts: r.discounts || {},
    rewards: r.rewards || {},
    gifts: r.gifts || [],
    enabled: r.enabled,
  }));

  const { error } = await supabaseClient.from('product_benefits').upsert(payload, { onConflict: 'model_name' });
  if (error) { showSaveStatus('일괄 등록 실패: ' + error.message, 'err'); return; }
  showSaveStatus(`${validRows.length}개 모델 등록/갱신됨 ✓`, 'ok');
  parsedBenefitImportRows = [];
  document.getElementById('benefitFileInput').value = '';
  document.getElementById('benefitImportPreviewWrap').style.display = 'none';
  document.getElementById('importBenefitsBtn').style.display = 'none';
  await loadProductBenefits();
}

const BENEFIT_SAMPLE_DATA = [
  {
    modelName: '16ZD90U-KX7BK', productCode: '12995638219',
    actualPrice: 3099000, maxBenefitPrice: 2968530,
    discounts: { '가을쇼핑위크 쿠폰': 80000, '그램추석 쿠폰': 100000, '카드할인 8%': 250000 },
    rewards: { '기본적립 1%': 33490, '멤버십 추가적립 1%': 20000, '라이브 추가적립 2%': 66980, '리뷰 적립금': 10000 },
    gifts: ['그램케어', '마우스', '마우스패드', '한컴오피스'],
  },
  {
    modelName: '15UD50U-GX5JK', productCode: '12872423540',
    actualPrice: 1039830, maxBenefitPrice: 988621,
    discounts: { '가을쇼핑위크 쿠폰': 64750, '카드할인 8%': 90420 },
    rewards: { '기본적립 1%': 11303, '멤버십 추가적립 1%': 11302, '라이브 추가적립 2%': 22605 },
    gifts: ['마우스', '마우스패드'],
  },
];

function downloadBenefitJsonSample() {
  downloadBlob('상품혜택_예시.json', JSON.stringify(BENEFIT_SAMPLE_DATA, null, 2), 'application/json;charset=utf-8');
}

function downloadBenefitXlsxSample() {
  const flattenPairs = (obj) => Object.entries(obj).map(([k, v]) => `${k}=${v}`).join(', ');
  const headers = ['모델명', '상품코드', '실제결제가', '쿠폰・카드할인', '라이브최대혜택가', '적립금', '사은품'];
  const rows = BENEFIT_SAMPLE_DATA.map((b) => [
    b.modelName, b.productCode, b.actualPrice,
    flattenPairs(b.discounts), b.maxBenefitPrice, flattenPairs(b.rewards),
    b.gifts.join(', '),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '상품혜택');
  XLSX.writeFile(wb, '상품혜택_예시.xlsx');
}

function downloadBenefitCsvSample() {
  const flattenPairs = (obj) => Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('; ');
  const headers = ['모델명', '상품코드', '실제결제가', '쿠폰・카드할인', '라이브최대혜택가', '적립금', '사은품'];
  const lines = [headers.join(',')];
  BENEFIT_SAMPLE_DATA.forEach((b) => {
    const cells = [
      b.modelName, b.productCode, b.actualPrice,
      `"${flattenPairs(b.discounts)}"`, b.maxBenefitPrice, `"${flattenPairs(b.rewards)}"`,
      `"${b.gifts.join(', ')}"`,
    ];
    lines.push(cells.join(','));
  });
  downloadBlob('상품혜택_예시.csv', lines.join('\n'), 'text/csv;charset=utf-8');
}
