// ============================================================
//  이벤트 바인딩 + 부트스트랩 (모든 다른 js 파일 로드가 끝난 뒤 마지막에 실행)
// ============================================================

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
    });
  });

  document.getElementById('saveBroadcastSettingsBtn').addEventListener('click', saveBroadcastSettings);
  document.getElementById('saveKeywordSettingsBtn').addEventListener('click', saveKeywordSettings);
  document.getElementById('refreshDeviceStatusBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      await refreshDeviceStatus();
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄';
    }
  });
  document.getElementById('saveAiGuideBtn').addEventListener('click', saveAiGuideSettings);
  document.getElementById('saveApiKeyBtn').addEventListener('click', saveApiKey);
  document.getElementById('saveAiSettingsBtn').addEventListener('click', saveAiNumericSettings);
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

// 모든 기능별 js 파일이 위에서 이미 로드/정의된 뒤이므로, 이제 안전하게 세션 확인을 시작합니다.
initSession();
