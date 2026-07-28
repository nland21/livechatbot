// ============================================================
//  계정 관리 (마스터관리자 전용)
// ============================================================

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
    const isBlocked = !!acc.force_logout_requested;
    const li = document.createElement('li');
    li.style.display = 'block';

    const nameRow = `
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <b class="acc-name"></b>
        <button class="btn btn-outline btn-sm acc-edit-name-btn" title="닉네임 수정">✏️</button>
        ${isMaster ? '<span class="chip" style="background:#fdeee0;color:#b5540b;">마스터관리자</span>' : '<span class="chip role-badge"></span>'}
        ${isSelf ? ' <span class="chip" style="background:var(--brand-soft);color:var(--brand-dark);">나</span>' : ''}
        ${isBlocked ? ' <span class="chip" style="background:#fdecea;color:var(--danger);">🔒 접속 차단됨</span>' : ''}
      </div>
      <div style="color:var(--sub); font-size:11.5px; margin-top:2px;" class="acc-email"></div>
      <div class="acc-name-edit-row" style="display:none; gap:6px; margin-top:6px;">
        <input type="text" class="acc-name-input" style="flex:1;" />
        <button class="btn btn-primary btn-sm acc-save-name-btn">저장</button>
        <button class="btn btn-outline btn-sm acc-cancel-name-btn">취소</button>
      </div>`;

    if (isMaster) {
      // 마스터관리자 본인 계정은 역할 변경/차단/삭제를 할 수 없고, 닉네임만 수정 가능합니다.
      li.innerHTML = nameRow;
    } else {
      li.innerHTML = nameRow + `
        <div class="li-actions" style="margin-top:8px;">
          <select class="role-select">
            <option value="admin">관리자</option>
            <option value="web_admin">웹관리자</option>
            <option value="local_manager">로컬매니저</option>
          </select>
          <button class="btn btn-outline btn-sm acc-block-btn">${isBlocked ? '🔓 로그인 허용' : '🔒 강제 로그아웃'}</button>
          <button class="btn-danger-outline deactivate-btn">삭제</button>
        </div>`;
    }

    li.querySelector('.acc-name').textContent = acc.display_name || '(닉네임 없음)';
    li.querySelector('.acc-email').textContent = acc.email;

    // 닉네임 수정 (마스터관리자 본인 포함 전 계정 가능)
    const nameInput = li.querySelector('.acc-name-input');
    const nameEditRow = li.querySelector('.acc-name-edit-row');
    li.querySelector('.acc-edit-name-btn').addEventListener('click', () => {
      nameInput.value = acc.display_name || '';
      nameEditRow.style.display = 'flex';
      nameInput.focus();
    });
    li.querySelector('.acc-cancel-name-btn').addEventListener('click', () => {
      nameEditRow.style.display = 'none';
    });
    li.querySelector('.acc-save-name-btn').addEventListener('click', async () => {
      const newName = nameInput.value.trim();
      const { error } = await supabaseClient.from('user_roles').update({ display_name: newName || null }).eq('user_id', acc.user_id);
      if (error) { alert('닉네임 수정 실패: ' + error.message); return; }
      showSaveStatus('닉네임 수정됨 ✓', 'ok');
      await loadAccounts();
    });

    if (isMaster) { ul.appendChild(li); return; }

    li.querySelector('.role-badge').textContent = ROLE_LABELS[acc.role] || acc.role;

    const roleSelect = li.querySelector('.role-select');
    roleSelect.value = acc.role;
    roleSelect.addEventListener('change', async (e) => {
      await updateAccountRole(acc.user_id, e.target.value);
    });

    li.querySelector('.acc-block-btn').addEventListener('click', async () => {
      await toggleAccountForceLogout(acc.user_id, acc.email, !isBlocked);
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

// Supabase는 익명 키만으로는 "다른 사람의 세션을 서버에서 즉시 끊는" 기능을 지원하지 않아서,
// 그 계정 스스로 자기 상태를 주기적으로(또는 다음 로그인 때) 확인해서 로그아웃하는 방식입니다.
// (최대 1분 이내에 반영되고, 그 계정이 지금 접속 중이 아니면 다음 로그인 시도 때 바로 막힙니다)
async function toggleAccountForceLogout(userId, email, block) {
  if (block) {
    if (!confirm(`"${email}" 계정을 강제 로그아웃 + 접속 차단할까요?\n\n지금 접속 중이라면 최대 1분 이내에 로그아웃되고, 그 후로는 마스터관리자가 "로그인 허용"을 눌러줄 때까지 다시 로그인할 수 없습니다.`)) return;
  }
  const { error } = await supabaseClient.from('user_roles').update({ force_logout_requested: block }).eq('user_id', userId);
  if (error) { alert((block ? '강제 로그아웃' : '로그인 허용') + ' 처리 실패: ' + error.message); return; }
  showSaveStatus(block ? '강제 로그아웃 처리됨 ✓ (최대 1분 이내 반영)' : '로그인이 다시 허용되었습니다 ✓', 'ok');
  await loadAccounts();
}

async function deactivateAccount(userId, email) {
  if (!confirm(
    `"${email}" 계정을 삭제(권한 제거)할까요?\n\n` +
    '이 작업은 권한(user_roles)만 제거합니다. 로그인 계정 자체를 완전히 삭제하려면 ' +
    'Supabase 대시보드 > Authentication > Users 에서 별도로 삭제해주세요.'
  )) return;
  const { error } = await supabaseClient.from('user_roles').delete().eq('user_id', userId);
  if (error) { alert('삭제 실패: ' + error.message); return; }
  showSaveStatus('삭제되었습니다 ✓', 'ok');
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

