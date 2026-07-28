// ============================================================
//  예약 문구
// ============================================================

// ------------------------------- 예약 문구 -------------------------------
let draggedScheduledLi = null;
let scheduledEditMode = false;
let scheduledDraft = [];       // 수정모드에서만 쓰는 작업용 복사본 (순서/내용 변경을 임시로 담아둠)
let scheduledEditingId = null; // 지금 인라인으로 내용수정 중인 카드의 id (한 번에 하나만)

function enterScheduledEditMode() {
  scheduledEditMode = true;
  scheduledDraft = scheduledMessages.map((m) => ({ ...m }));
  scheduledEditingId = null;
  document.getElementById('scheduledEditModeBtn').style.display = 'none';
  document.getElementById('scheduledCancelEditBtn').style.display = 'inline-block';
  document.getElementById('scheduledSaveEditBtn').style.display = 'inline-block';
  document.getElementById('scheduledEditHint').textContent =
    '⠿ 드래그로 순서 변경, [내용수정]으로 문구 편집 후 — 모든 변경이 끝나면 반드시 [저장하기]를 눌러야 서버에 반영됩니다.';
  renderScheduledList();
}

function exitScheduledEditMode() {
  scheduledEditMode = false;
  scheduledDraft = [];
  scheduledEditingId = null;
  document.getElementById('scheduledEditModeBtn').style.display = 'inline-block';
  document.getElementById('scheduledCancelEditBtn').style.display = 'none';
  document.getElementById('scheduledSaveEditBtn').style.display = 'none';
  document.getElementById('scheduledEditHint').textContent =
    '⠿ 아이콘을 드래그해서 순서를 바꾸거나 문구를 수정하려면 "수정모드"를 눌러주세요.';
  renderScheduledList();
}

async function saveScheduledEdits() {
  if (scheduledDraft.length > 0) {
    const updates = scheduledDraft.map((item, index) => ({ id: item.id, text: item.text, sort_order: index }));
    const { error } = await supabaseClient.from('scheduled_messages').upsert(updates);
    if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  }
  showSaveStatus('저장됨 ✓', 'ok');
  await loadScheduled(); // 서버 기준 최신 데이터로 다시 불러옵니다.
  exitScheduledEditMode();
}

function renderScheduledList() {
  const ul = document.getElementById('scheduledList');
  ul.innerHTML = '';
  const items = scheduledEditMode ? scheduledDraft : scheduledMessages;

  if (items.length === 0) {
    ul.innerHTML = '<li class="empty-hint">등록된 예약 문구가 없습니다.</li>';
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    li.dataset.id = item.id;

    if (scheduledEditMode && scheduledEditingId === item.id) {
      // ---------- 인라인 내용수정 폼 ----------
      li.className = 'draggable-item editing';
      li.innerHTML = `
        <div style="flex:1;">
          <textarea class="inline-edit-textarea"></textarea>
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button class="btn btn-primary btn-sm inline-save-btn">저장</button>
            <button class="btn btn-outline btn-sm inline-cancel-btn">취소</button>
          </div>
        </div>`;
      const textarea = li.querySelector('.inline-edit-textarea');
      textarea.value = item.text;
      textarea.focus();
      li.querySelector('.inline-save-btn').addEventListener('click', () => {
        const newText = textarea.value.trim();
        if (!newText) { alert('내용을 입력해주세요.'); return; }
        item.text = newText; // scheduledDraft 안의 항목을 직접 수정 (아직 서버에는 반영 안 됨)
        scheduledEditingId = null;
        renderScheduledList();
      });
      li.querySelector('.inline-cancel-btn').addEventListener('click', () => {
        scheduledEditingId = null;
        renderScheduledList();
      });
    } else if (scheduledEditMode) {
      // ---------- 수정모드: 드래그 핸들 + 내용수정 + 삭제 ----------
      li.draggable = true;
      li.className = 'draggable-item';
      li.innerHTML = `<span class="drag-handle" title="드래그해서 순서 변경">⠿</span><span class="content"></span><div class="li-actions"><button class="btn btn-outline btn-sm edit-content-btn">내용수정</button><button class="btn-danger-outline delete-btn">삭제</button></div>`;
      li.querySelector('.content').textContent = item.text;

      li.querySelector('.edit-content-btn').addEventListener('click', () => {
        scheduledEditingId = item.id;
        renderScheduledList();
      });

      li.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('이 예약 문구를 삭제할까요? (삭제는 바로 반영됩니다)')) return;
        const { error } = await supabaseClient.from('scheduled_messages').delete().eq('id', item.id);
        if (error) { showSaveStatus('삭제 실패: ' + error.message, 'err'); return; }
        showSaveStatus('삭제됨 ✓', 'ok');
        scheduledMessages = scheduledMessages.filter((m) => m.id !== item.id);
        scheduledDraft = scheduledDraft.filter((m) => m.id !== item.id);
        renderScheduledList();
      });

      li.addEventListener('dragstart', (e) => {
        draggedScheduledLi = li;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(item.id)); // 일부 브라우저는 setData가 없으면 드래그가 씹힙니다.
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        draggedScheduledLi = null;
        // 지금 화면(DOM)에 보이는 순서를 그대로 scheduledDraft 배열 순서에 반영합니다.
        const orderedIds = Array.from(ul.querySelectorAll('li[data-id]')).map((el) => el.dataset.id);
        const byId = new Map(scheduledDraft.map((d) => [String(d.id), d]));
        scheduledDraft = orderedIds.map((id) => byId.get(String(id))).filter(Boolean);
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedScheduledLi || draggedScheduledLi === li) return;
        const rect = li.getBoundingClientRect();
        const isAfter = e.clientY - rect.top > rect.height / 2;
        ul.insertBefore(draggedScheduledLi, isAfter ? li.nextSibling : li);
      });
    } else {
      // ---------- 읽기 전용(수정모드 아닐 때) ----------
      li.innerHTML = `<span class="content"></span>`;
      li.querySelector('.content').textContent = item.text;
    }

    ul.appendChild(li);
  });
}

async function addScheduledMessage() {
  const textarea = document.getElementById('newScheduledText');
  const text = textarea.value.trim();
  if (!text) return;
  const { error } = await supabaseClient.from('scheduled_messages').insert({
    text, sort_order: scheduledMessages.length,
  });
  if (error) { showSaveStatus('저장 실패: ' + error.message, 'err'); return; }
  textarea.value = '';
  showSaveStatus('저장됨 ✓', 'ok');
  await loadScheduled();
}

