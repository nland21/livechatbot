// ============================================================
//  공통: Supabase 클라이언트, 로그인/세션, 공용 유틸
// ============================================================

// ============================================================
//  노트북랜드21 라이브 채팅 관리자 웹페이지 - app.js
// ============================================================

const supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

let currentSession = null;

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
    .select('role, display_name, force_logout_requested')
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

  if (roleRow.force_logout_requested) {
    alert('마스터관리자에 의해 이 계정의 접속이 차단되었습니다. 다시 이용하시려면 마스터관리자에게 문의해주세요.');
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
  document.getElementById('downloadsTabBtn').style.display = isMaster ? 'flex' : 'none';
  document.getElementById('masterGroupTitle').style.display = isMaster ? 'block' : 'none';

  populateTimeSelects();
  bindEvents();
  switchSpecMode('manual');
  await loadAll();
  await loadAiKeyStatus();
  if (currentUserRole === 'master_admin') {
    await loadAccounts();
    await loadReleaseFiles();
  }

  await refreshDeviceStatus();
  setInterval(refreshDeviceStatus, 30000); // 30초마다 PC 상태를 다시 확인합니다.
  // 데이터가 안 바뀌어도 시간은 계속 흐르므로("종료" 판정이 시간 기반), 1분마다 목록을 다시 그립니다.
  setInterval(renderLiveScheduleList, 60000);
  // 지금 로그인해서 쓰는 중에 마스터관리자가 "강제 로그아웃"을 누르면, 최대 1분 안에 감지해서 즉시 로그아웃합니다.
  setInterval(checkForceLogout, 60000);
}

// Supabase 익명 키만으로는 "다른 사람의 로그인 세션을 서버에서 즉시 끊는" 기능이 없어서,
// 본인이 주기적으로 자기 계정의 차단 여부를 확인하고 스스로 로그아웃하는 방식으로 구현했습니다.
async function checkForceLogout() {
  if (!currentSession) return;
  const { data, error } = await supabaseClient
    .from('user_roles').select('force_logout_requested').eq('user_id', currentSession.user.id).maybeSingle();
  if (error || !data) return;
  if (data.force_logout_requested) {
    alert('마스터관리자에 의해 접속이 차단되었습니다. 다시 이용하시려면 마스터관리자에게 문의해주세요.');
    await supabaseClient.auth.signOut();
    location.reload();
  }
}

// 이미 로그인된 세션이 있으면(새로고침 시, 또는 이메일 인증 링크로 막 돌아온 경우)
// 자동으로 이어서 로그인 처리합니다.
// 주의: 이 함수는 여기서 바로 실행하지 않고, main.js 맨 마지막에서 호출합니다.
// (다른 모든 js 파일이 먼저 로드되어 loadAll() 등이 이미 정의된 뒤에 실행되어야 하기 때문입니다)
async function initSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    await afterLogin(data.session);
    // 이메일 인증 링크를 눌러 들어온 경우 주소창에 토큰 조각이 남는데, 보기 안 좋으니 정리합니다.
    if (window.location.hash.includes('access_token')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }
}
