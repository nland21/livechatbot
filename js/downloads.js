// ============================================================
//  다운로드 센터 (마스터관리자 전용)
//  admin-webpage / live-chat-bot / server-sync 3개 패키지의 "최신 버전" 파일을
//  Supabase Storage(releases 버킷)에 보관하고, 다운로드/업로드(교체)를 제공합니다.
//  패키지당 저장 경로가 고정({package_key}/{package_key}.zip)이라, 새로 올리면
//  이전 파일을 덮어씁니다(버전 이력을 여러 개 쌓아두지 않고 "최신 1개"만 유지).
// ============================================================

const RELEASE_BUCKET = 'releases';
const RELEASE_PACKAGE_LABELS = {
  'admin-webpage': '관리자 웹페이지',
  'live-chat-bot': '로컬PC 확장 프로그램',
  'server-sync': '서버 설정(Supabase)',
};

let releaseFilesByKey = {};

async function loadReleaseFiles() {
  const { data, error } = await supabaseClient.from('release_files').select('*');
  if (error) {
    // 마스터관리자가 아니면 RLS에 의해 여기서 막힙니다 (탭 자체도 숨겨져 있으니 정상적인 상황).
    console.error('[관리자 웹페이지] release_files 조회 실패:', error.message || error);
    releaseFilesByKey = {};
  } else {
    releaseFilesByKey = {};
    (data || []).forEach((row) => { releaseFilesByKey[row.package_key] = row; });
  }
  renderReleaseCards();
}

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUpdatedAt(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderReleaseCards() {
  document.querySelectorAll('.dl-card').forEach((card) => {
    const key = card.dataset.package;
    const row = releaseFilesByKey[key];
    const versionEl = card.querySelector('.dl-version');
    const filenameEl = card.querySelector('.dl-filename');
    const filesizeEl = card.querySelector('.dl-filesize');
    const updatedEl = card.querySelector('.dl-updated');
    const notesRow = card.querySelector('.dl-notes-row');
    const notesEl = card.querySelector('.dl-notes');
    const downloadBtn = card.querySelector('.dl-download-btn');

    if (!row) {
      versionEl.textContent = '업로드된 파일 없음';
      filenameEl.textContent = '-';
      filesizeEl.textContent = '-';
      updatedEl.textContent = '-';
      notesRow.style.display = 'none';
      downloadBtn.disabled = true;
      return;
    }

    versionEl.textContent = row.version_label || '(버전 라벨 없음)';
    filenameEl.textContent = row.original_filename;
    filesizeEl.textContent = formatFileSize(row.file_size);
    updatedEl.textContent = formatUpdatedAt(row.updated_at);
    if (row.notes) {
      notesRow.style.display = 'flex';
      notesEl.textContent = row.notes;
    } else {
      notesRow.style.display = 'none';
    }
    downloadBtn.disabled = false;
  });
}

// 비공개 버킷이라 URL을 안다고 바로 못 받습니다 — 매번 60초짜리 서명된(signed) URL을
// 새로 발급받아서 그 링크로만 다운로드합니다.
async function downloadReleaseFile(key) {
  const row = releaseFilesByKey[key];
  if (!row) return;
  const { data, error } = await supabaseClient.storage.from(RELEASE_BUCKET).createSignedUrl(row.storage_path, 60);
  if (error || !data) {
    showSaveStatus('다운로드 링크 생성 실패: ' + (error ? error.message : '알 수 없는 오류'), 'err');
    return;
  }
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = row.original_filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function uploadReleaseFile(key, card) {
  const fileInput = card.querySelector('.dl-file-input');
  const versionInput = card.querySelector('.dl-version-input');
  const notesInput = card.querySelector('.dl-notes-input');
  const uploadBtn = card.querySelector('.dl-upload-btn');

  const file = fileInput.files && fileInput.files[0];
  if (!file) { alert('업로드할 zip 파일을 선택해주세요.'); return; }
  if (!file.name.toLowerCase().endsWith('.zip')) {
    if (!confirm('.zip 파일이 아닌 것 같습니다. 그래도 업로드할까요?')) return;
  }

  const label = RELEASE_PACKAGE_LABELS[key] || key;
  const hasExisting = !!releaseFilesByKey[key];
  if (hasExisting && !confirm(`"${label}"의 기존 파일을 새 파일로 교체할까요?\n\n기존 파일은 되돌릴 수 없이 덮어써집니다.`)) return;

  uploadBtn.disabled = true;
  uploadBtn.textContent = '업로드 중...';

  try {
    const storagePath = `${key}/${key}.zip`;
    const { error: uploadError } = await supabaseClient.storage
      .from(RELEASE_BUCKET)
      .upload(storagePath, file, { upsert: true, contentType: file.type || 'application/zip' });
    if (uploadError) throw uploadError;

    const { error: upsertError } = await supabaseClient.from('release_files').upsert({
      package_key: key,
      storage_path: storagePath,
      original_filename: file.name,
      version_label: versionInput.value.trim() || null,
      notes: notesInput.value.trim() || null,
      file_size: file.size,
    });
    if (upsertError) throw upsertError;

    fileInput.value = '';
    versionInput.value = '';
    notesInput.value = '';
    showSaveStatus(`"${label}" 파일이 업로드됐습니다 ✓`, 'ok');
    await loadReleaseFiles();
  } catch (err) {
    showSaveStatus('업로드 실패: ' + (err && err.message ? err.message : err), 'err');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = '📤 업로드 / 교체';
  }
}

function bindDownloadCenterEvents() {
  document.querySelectorAll('.dl-card').forEach((card) => {
    const key = card.dataset.package;
    card.querySelector('.dl-download-btn').addEventListener('click', () => downloadReleaseFile(key));
    card.querySelector('.dl-upload-btn').addEventListener('click', () => uploadReleaseFile(key, card));
  });
}
