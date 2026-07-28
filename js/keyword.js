// ============================================================
//  키워드 자동답변
// ============================================================

// ------------------------------- 키워드 자동답변 -------------------------------
function getSortedKeywordRules() {
  return [...keywordRules].sort(
    (a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0),
  );
}

function renderKeywordList() {
  const ul = document.getElementById("keywordList");
  ul.innerHTML = "";
  if (keywordRules.length === 0) {
    ul.innerHTML = '<li class="empty-hint">등록된 키워드 규칙이 없습니다.</li>';
    return;
  }
  getSortedKeywordRules().forEach((rule, i) => {
    const li = document.createElement("li");
    const joiner = rule.match_type === "all" ? " + " : " / ";
    const matchLabel =
      rule.match_type === "all" ? "모두 포함" : "하나라도 포함";
    li.innerHTML = `
      <span class="content">
        <span class="priority-badge">우선순위 ${i + 1}</span>
        <span style="font-weight:700;color:var(--brand-dark);">[${(rule.keywords || []).join(joiner)}]</span>
        <span style="color:var(--sub);font-size:10.5px;">(${matchLabel}) →</span><br/>
        ${escapeHtml(rule.reply)}
      </span>
      <div class="li-actions"><button class="btn-danger-outline">삭제</button></div>`;
    li.querySelector("button").addEventListener("click", async () => {
      if (!confirm("이 키워드 규칙을 삭제할까요?")) return;
      const { error } = await supabaseClient
        .from("keyword_rules")
        .delete()
        .eq("id", rule.id);
      if (error) {
        showSaveStatus("삭제 실패: " + error.message, "err");
        return;
      }
      showSaveStatus("삭제됨 ✓", "ok");
      await loadKeywords();
    });
    ul.appendChild(li);
  });
}

async function addKeywordRule() {
  const kwInput = document.getElementById("newKeyword");
  const replyInput = document.getElementById("newKeywordReply");
  const matchTypeSelect = document.getElementById("newKeywordMatchType");
  const keywords = kwInput.value
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const reply = replyInput.value.trim();
  if (keywords.length === 0 || !reply) {
    alert("키워드와 답변 내용을 모두 입력해주세요.");
    return;
  }
  const { error } = await supabaseClient.from("keyword_rules").insert({
    keywords,
    match_type: matchTypeSelect.value,
    reply,
  });
  if (error) {
    showSaveStatus("저장 실패: " + error.message, "err");
    return;
  }
  kwInput.value = "";
  replyInput.value = "";
  matchTypeSelect.value = "any";
  showSaveStatus("저장됨 ✓", "ok");
  await loadKeywords();
}
