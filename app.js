import { FALLBACK_EXERCISES, LOAD_LABELS, buildBodyCandidate, createExport, createSession, normalizeSet, restRemainingSeconds, sessionSummary, timerElapsedMs, toMarkdown, withoutExercise } from "./core.js";

const $ = (selector, root = document) => root.querySelector(selector);
const app = $("#app"), bottomBar = $("#bottomBar"), backButton = $("#backButton"), title = $("#screenTitle"), status = $("#networkStatus");
let state = { session: null, exercises: FALLBACK_EXERCISES, screen: "home", draft: null, selectedWatch: "", watchCandidates: [], importing: false, resetArmed: false };
let tickTimer = null, toastTimer = null, resetArmTimer = null;
const canDirectBodyOs = location.pathname.startsWith("/quick-workout/") && !location.hostname.endsWith("github.io") && location.protocol !== "file:";

const DB = {
  open: () => new Promise((resolve, reject) => { const request = indexedDB.open("body-os-quick-workout", 1); request.onupgradeneeded = () => request.result.createObjectStore("state"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }),
  async get(key) { try { const db = await this.open(); return await new Promise((resolve, reject) => { const req = db.transaction("state").objectStore("state").get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); } catch { return JSON.parse(localStorage.getItem(key) || "null"); } },
  async set(key, value) { try { const db = await this.open(); await new Promise((resolve, reject) => { const tx = db.transaction("state", "readwrite"); tx.objectStore("state").put(value, key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); } catch { localStorage.setItem(key, JSON.stringify(value)); } },
};

function escapeHTML(value = "") { const node = document.createElement("span"); node.textContent = String(value); return node.innerHTML; }
function formatClock(seconds) { const safe = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`; }
function elapsed() { return timerElapsedMs(state.session) / 1000; }
function showToast(message, actionLabel = "", onAction = null) { const node = $("#toast"); node.replaceChildren(); const text = document.createElement("span"); text.textContent = message; node.append(text); if (actionLabel && onAction) { const button = document.createElement("button"); button.type = "button"; button.textContent = actionLabel; button.onclick = async () => { clearTimeout(toastTimer); node.classList.remove("show"); await onAction(); }; node.append(button); } node.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), actionLabel ? 30000 : 2600); }
async function persist() { state.session.updatedAt = new Date().toISOString(); await DB.set("active-session", state.session); status.textContent = navigator.onLine ? "本机已保存" : "离线记录中"; status.style.color = navigator.onLine ? "var(--mint)" : "var(--orange)"; }
function navigate(screen, data = {}, push = true) { state.screen = screen; Object.assign(state, data); if (push) history.pushState({ screen }, "", `#${screen}`); render(); }
function setScreenHeading(text, canBack = true) { title.textContent = text; backButton.classList.toggle("hidden", !canBack); requestAnimationFrame(() => title.focus({ preventScroll: true })); }
function exerciseIcon(exercise) { const map = { horizontal_push: "↗", vertical_push: "↑", horizontal_pull: "↙", vertical_pull: "↓", squat: "◇", hinge: "⌁", shoulder_abduction: "↔", shoulder_flexion: "⌃" }; return map[exercise.movementPattern] || "✦"; }

function exerciseCategory(exercise) {
  const text = `${exercise.name || ""} ${exercise.movementPattern || ""}`.toLowerCase();
  if (/curl|triceps|biceps|肱|弯举|下压|臂屈伸|手臂/.test(text)) return "arms";
  if (/shoulder|deltoid|vertical_push|abduction|flexion|推肩|肩|平举|站姿飞鸟|俯身飞鸟/.test(text)) return "shoulders";
  if (/squat|hinge|lunge|leg|calf|深蹲|硬拉|腿|臀|提踵/.test(text)) return "legs";
  if (/pull|row|back|lat|下拉|划船|引体|背/.test(text)) return "back";
  if (/push|press|chest|adduction|卧推|推胸|夹胸|胸/.test(text)) return "chest";
  return "other";
}

function supportsGrip(exercise) {
  return /引体|下拉|划船|pull.?up|pulldown|row/i.test(`${exercise.name || ""} ${exercise.canonicalNameEn || ""}`);
}

function inferredGrip(exercise) {
  const name = `${exercise.name || ""} ${exercise.canonicalNameEn || ""}`.toLowerCase();
  return {
    gripWidth: /宽|wide/.test(name) ? "wide" : /窄|close|narrow/.test(name) ? "close" : "medium",
    gripOrientation: /反握|underhand|supinated|chin.?up/.test(name) ? "supinated" : /对握|neutral/.test(name) ? "neutral" : "pronated",
  };
}

function gripMarkup(draft) {
  if (!supportsGrip(draft)) return "";
  return `<section class="section grip-panel"><div class="section-head"><h2>握法</h2><span class="label">按本组实际握法记录</span></div><div class="grip-row"><span>握距</span><div class="chip-row">${[["wide","宽距"],["medium","中距"],["close","窄距"]].map(([value,label]) => `<button class="chip ${draft.gripWidth === value ? "active" : ""}" data-grip-width="${value}">${label}</button>`).join("")}</div></div><div class="grip-row"><span>握向</span><div class="chip-row">${[["pronated","正握"],["supinated","反握"],["neutral","对握"]].map(([value,label]) => `<button class="chip ${draft.gripOrientation === value ? "active" : ""}" data-grip-orientation="${value}">${label}</button>`).join("")}</div></div></section>`;
}

async function toggleSessionTimer() {
  const now = Date.now(), timer = state.session.timer;
  if (timer.running) {
    timer.elapsedMs = timerElapsedMs(state.session, now); timer.running = false; timer.startedAtMs = null;
  } else {
    if (!timer.elapsedMs && !state.session.sets.length) state.session.startedAt = new Date(now).toISOString();
    timer.running = true; timer.startedAtMs = now;
  }
  await persist(); render();
}

async function deleteSessionExercise(exerciseId) {
  const removed = state.session.sets.filter((set) => set.exerciseId === exerciseId);
  if (!removed.length) return;
  const exerciseName = removed[0].exerciseName, previousSession = state.session, previousDraft = state.draft;
  state.session = withoutExercise(state.session, exerciseId);
  if (state.draft?.exerciseId === exerciseId) state.draft = null;
  await persist();
  if (!state.session.sets.length || (state.screen === "entry" && !state.draft)) { state.screen = "home"; history.replaceState({ screen: "home" }, "", "#home"); }
  render();
  showToast(`已删除 ${exerciseName} 的 ${removed.length} 组`, "撤销", async () => { state.session = previousSession; state.draft = previousDraft; await persist(); render(); showToast("已恢复动作"); });
}

async function requestSessionReset() {
  if (!state.resetArmed) {
    state.resetArmed = true; render(); showToast("将清空本次训练，再点一次确认");
    clearTimeout(resetArmTimer); resetArmTimer = setTimeout(() => { state.resetArmed = false; if (["home", "summary"].includes(state.screen)) render(); }, 15000);
    return;
  }
  clearTimeout(resetArmTimer); state.session = createSession(); state.draft = null; state.selectedWatch = ""; state.watchCandidates = []; state.importing = false; state.resetArmed = false; state.screen = "home";
  history.replaceState({ screen: "home" }, "", "#home"); await persist(); render(); showToast("本次训练已重置，动作库和离线能力已保留");
}

function bindSessionManagement() {
  document.querySelectorAll("[data-delete-exercise]").forEach((button) => button.onclick = () => deleteSessionExercise(button.dataset.deleteExercise));
  $("#resetSession")?.addEventListener("click", requestSessionReset);
}

function sessionOverviewMarkup(activeId) {
  const groups = groupSets();
  if (!groups.size) return "";
  return `<section class="section session-overview"><div class="section-head"><h2>本次训练</h2><span class="label">${groups.size} 个动作 · ${state.session.sets.length} 组</span></div><div class="session-exercise-list">${[...groups.entries()].map(([id, sets]) => { const last = sets.at(-1); return `<article class="session-exercise ${id === activeId ? "active" : ""}"><button class="session-exercise-open" data-session-exercise="${escapeHTML(id)}"><span>${exerciseIcon(last)}</span><strong>${escapeHTML(last.exerciseName)}</strong><small>${sets.length} 组 · ${last.weightValue}${last.weightUnit} × ${last.reps}</small></button><button class="session-exercise-delete" data-delete-exercise="${escapeHTML(id)}" aria-label="删除 ${escapeHTML(last.exerciseName)}">×</button></article>`; }).join("")}</div></section>`;
}

function render() {
  clearInterval(tickTimer); app.innerHTML = ""; bottomBar.innerHTML = "";
  if (state.screen === "picker") renderPicker(); else if (state.screen === "entry") renderEntry(); else if (state.screen === "summary") renderSummary(); else if (state.screen === "watch") renderWatch(); else renderHome();
  tickTimer = setInterval(updateClocks, 1000); updateClocks();
}

function renderHome() {
  setScreenHeading("训练中", false); const summary = sessionSummary(state.session); const recentIds = [...new Set(state.session.sets.map((s) => s.exerciseId))].reverse(); const hasSessionData = summary.setCount > 0 || timerElapsedMs(state.session) > 0;
  app.innerHTML = `<section class="hero"><div class="hero-row"><div><div class="label">训练计时 · ${state.session.timer.running ? "进行中" : "已暂停"}</div><div class="timer" data-elapsed>${formatClock(elapsed())}</div></div><button class="timer-toggle ${state.session.timer.running ? "running" : ""}" id="sessionTimerToggle">${state.session.timer.running ? "Ⅱ 暂停" : "▶ 开始"}</button></div><div class="metrics"><div class="metric"><span class="label">动作</span><strong>${summary.exerciseCount}</strong></div><div class="metric"><span class="label">组数</span><strong>${summary.setCount}</strong></div><div class="metric"><span class="label">训练量</span><strong>${summary.volume}</strong><small>kg</small></div></div></section>
  <section class="section"><div class="section-head"><h2>${recentIds.length ? "继续记录" : "准备开始"}</h2><div class="section-actions"><button id="browseAll">动作库</button>${hasSessionData ? `<button class="danger-link ${state.resetArmed ? "armed" : ""}" id="resetSession">${state.resetArmed ? "确认重置" : "重置"}</button>` : ""}</div></div><div class="card-list">${recentIds.length ? recentIds.slice(0, 4).map((id) => exerciseCard(state.exercises.find((x) => x.id === id) || fromSet(id))).join("") : `<div class="empty">选择第一个标准动作。之后每组可一键复用上一组数据。</div>`}</div></section>`;
  bottomBar.innerHTML = `<button class="secondary" id="finish" ${summary.setCount ? "" : "disabled"}>结束训练</button><button class="primary" id="choose">＋ 选择动作</button>`;
  $("#sessionTimerToggle").onclick = toggleSessionTimer; $("#choose").onclick = $("#browseAll").onclick = () => navigate("picker"); $("#finish").onclick = finishSession; bindExerciseCards(); bindSessionManagement();
}

function fromSet(id) { const set = state.session.sets.find((x) => x.exerciseId === id); return { ...set, id, name: set.exerciseName }; }
function exerciseCard(exercise) { if (!exercise) return ""; const count = state.session.sets.filter((s) => s.exerciseId === exercise.id).length; const card = `<button class="exercise-card" data-exercise="${escapeHTML(exercise.id)}"><span class="exercise-icon">${exerciseIcon(exercise)}</span><span><strong>${escapeHTML(exercise.name)}</strong><small>${escapeHTML(exercise.equipment || "标准动作")} · ${LOAD_LABELS[exercise.loadMode] || "重量"}${count ? ` · 已记录 ${count} 组` : ""}</small></span><span class="chevron">›</span></button>`; return count ? `<div class="exercise-manage-row">${card}<button class="exercise-delete" data-delete-exercise="${escapeHTML(exercise.id)}" aria-label="删除 ${escapeHTML(exercise.name)}">×</button></div>` : card; }
function bindExerciseCards() { document.querySelectorAll("[data-exercise]").forEach((button) => button.onclick = () => openExercise(button.dataset.exercise)); }

function renderPicker() {
  setScreenHeading("选择标准动作"); app.innerHTML = `<input class="search" id="search" type="search" placeholder="搜索动作、器械或英文名" autocomplete="off" aria-label="搜索动作"><section class="category-guide"><div class="section-head"><h2>按训练部位快速找</h2><span class="label">先选部位，再选动作</span></div><div class="chip-row"><button class="chip active" data-filter="">全部</button><button class="chip" data-filter="chest">胸</button><button class="chip" data-filter="back">背</button><button class="chip" data-filter="legs">腿</button><button class="chip" data-filter="shoulders">肩</button><button class="chip" data-filter="arms">手臂</button></div></section><div class="card-list" id="exerciseList"></div>`;
  const list = $("#exerciseList"), search = $("#search"); let filter = "";
  const update = () => { const term = search.value.trim().toLowerCase(); const words = term.split(/\s+/).filter(Boolean); const matches = state.exercises.filter((x) => (!filter || exerciseCategory(x) === filter) && words.every((word) => `${x.name} ${x.canonicalNameEn || ""} ${x.equipment || ""} ${x.movementPattern || ""}`.toLowerCase().includes(word))); list.innerHTML = matches.map(exerciseCard).join("") || `<div class="empty">这个分类下没有找到动作，试试搜索或“全部”。</div>`; bindExerciseCards(); bindSessionManagement(); };
  search.oninput = update; document.querySelectorAll("[data-filter]").forEach((chip) => chip.onclick = () => { document.querySelectorAll("[data-filter]").forEach((x) => x.classList.remove("active")); chip.classList.add("active"); filter = chip.dataset.filter; update(); }); update(); setTimeout(() => search.focus(), 50);
}

function openExercise(id) {
  const exercise = state.exercises.find((x) => x.id === id) || fromSet(id); const previous = [...state.session.sets].reverse().find((x) => x.exerciseId === id);
  const grip = inferredGrip(exercise);
  state.session.currentExerciseId = id; state.draft = normalizeSet(previous ? { ...previous, id: "", completedAt: "", restSeconds: defaultRest(previous) } : { exerciseId: id, exerciseName: exercise.name, canonicalNameEn: exercise.canonicalNameEn, equipment: exercise.equipment, movementPattern: exercise.movementPattern, loadMode: exercise.loadMode, executionMode: exercise.executionMode, sideCount: exercise.sideCount, weightValue: 10, weightUnit: "kg", reps: 10, rir: 2, restSeconds: 90, side: "both", notes: "", ...grip });
  navigate("entry");
}
function defaultRest(previous) { const prior = state.session.sets.filter((x) => x.exerciseId === previous.exerciseId); if (prior.length < 2) return previous.restSeconds || 90; const a = new Date(prior.at(-1).completedAt), b = new Date(prior.at(-2).completedAt); return Math.min(7200, Math.max(0, Math.round((a - b) / 1000))); }

function renderEntry() {
  const d = state.draft, count = state.session.sets.filter((s) => s.exerciseId === d.exerciseId).length, last = [...state.session.sets].reverse().find((s) => s.exerciseId === d.exerciseId);
  const unit = d.weightUnit === "lb" ? "lb" : "kg", step = unit === "lb" ? 5 : 2.5;
  setScreenHeading(d.exerciseName); app.innerHTML = `<section class="hero"><div class="entry-title"><span class="exercise-icon">${exerciseIcon(d)}</span><div><div class="label">第 ${count + 1} 组</div><strong>${escapeHTML(d.exerciseName)}</strong><div class="muted">${escapeHTML(d.equipment || "标准动作")}</div></div></div><div class="semantic"><span>重量计算方式</span><select id="loadMode" aria-label="重量计算方式">${Object.entries(LOAD_LABELS).map(([value,label]) => `<option value="${value}" ${d.loadMode === value ? "selected" : ""}>${label}</option>`).join("")}</select></div></section>
  <div class="session-timer-strip"><span><small>训练计时</small><strong data-elapsed>${formatClock(elapsed())}</strong></span><button id="entryTimerToggle">${state.session.timer.running ? "暂停" : "开始"}</button></div>
  ${restMarkup()}
  ${last ? `<div class="last-set">上一组：${last.weightValue}${last.weightUnit} × ${last.reps} 次${last.rir != null ? ` · RIR ${last.rir}` : ""}</div>` : ""}
  <div class="step-grid"><div class="stepper"><div class="row"><div class="label">${LOAD_LABELS[d.loadMode]}</div><div class="unit-switch" aria-label="重量单位"><button class="${unit === "kg" ? "active" : ""}" data-unit="kg">kg</button><button class="${unit === "lb" ? "active" : ""}" data-unit="lb">lb <small>磅</small></button></div></div><div class="stepper-controls"><button data-step="weight" data-delta="-${step}" aria-label="减少重量">−</button><input id="weight" class="number-input" type="number" inputmode="decimal" min="0" step="${step}" value="${d.weightValue}" aria-label="重量，点击数字可直接输入"><button data-step="weight" data-delta="${step}" aria-label="增加重量">＋</button></div><div class="direct-input-hint">点击数字可直接输入 · ${unit === "lb" ? "当前单位：磅" : "可切换 lb（磅）"}${["per_limb","per_side"].includes(d.loadMode) ? ` · 总负荷 ${d.weightValue * 2} ${unit}` : ""}</div></div><div class="stepper"><div class="label">次数</div><div class="stepper-controls"><button data-step="reps" data-delta="-1" aria-label="减少次数">−</button><input id="reps" class="number-input" type="number" inputmode="numeric" min="0" step="1" value="${d.reps}" aria-label="次数，点击数字可直接输入"><button data-step="reps" data-delta="1" aria-label="增加次数">＋</button></div><div class="direct-input-hint">点击数字可直接输入</div></div></div>
  <section class="section"><div class="section-head"><h2>RIR</h2><span class="label">还能完成几次</span></div><div class="rir-grid">${[null,0,1,2,3,4,5].map((v) => `<button class="chip ${d.rir === v ? "active" : ""}" data-rir="${v == null ? "" : v}">${v == null ? "未记" : v}</button>`).join("")}</div></section>
  <section class="section"><div class="section-head"><h2>左右侧</h2></div><div class="chip-row">${[["both","双侧"],["left","左侧"],["right","右侧"],["alternating","左右交替"]].map(([v,l]) => `<button class="chip ${d.side === v ? "active" : ""}" data-side="${v}">${l}</button>`).join("")}</div></section>
  ${gripMarkup(d)}
  ${sessionOverviewMarkup(d.exerciseId)}
  <details class="detail-panel"><summary>扩展数据与备注</summary><div class="detail-body"><div class="field"><label for="rest">目标休息（秒，保存后手动开始）</label><input id="rest" type="number" inputmode="numeric" min="0" max="7200" value="${d.restSeconds || 90}"></div><div class="field"><label for="rpe">RPE（1–10）</label><input id="rpe" type="number" inputmode="decimal" min="1" max="10" step="0.5" value="${d.rpe ?? ""}"></div><div class="field"><label for="rer">RER（0.5–2）</label><input id="rer" type="number" inputmode="decimal" min="0.5" max="2" step="0.1" value="${d.rer ?? ""}"></div><div class="field"><label for="notes">备注 / 疼痛反馈</label><textarea id="notes" maxlength="1000" placeholder="例如：左肩刺痛，动作控制良好">${escapeHTML(d.notes)}</textarea></div></div></details>`;
  bottomBar.innerHTML = `<button class="secondary" id="switchExercise">切换动作</button><button class="primary" id="save">${last ? `复用并保存第 ${count + 1} 组` : "保存第 1 组"}</button>`;
  bindEntry();
}

function restMarkup() { const rest = state.session.rest; if (!rest) return ""; return `<section class="rest-card"><div class="row"><div><div class="label">休息计时 · ${rest.running ? "进行中" : "已暂停"}</div><div class="rest-time" data-rest>${formatClock(restRemainingSeconds(rest))}</div></div><span>${rest.running ? "恢复中" : "由你手动开始"}</span></div><div class="rest-actions"><button id="restSkip">跳过</button><button id="restAdd">+30 秒</button><button id="restToggle">${rest.running ? "暂停" : "▶ 开始"}</button></div></section>`; }
function bindEntry() {
  $("#entryTimerToggle")?.addEventListener("click", toggleSessionTimer);
  $("#loadMode").onchange = (e) => { state.draft.loadMode = e.target.value; state.draft.sideCount = ["per_limb","per_side"].includes(e.target.value) ? 2 : 1; renderEntry(); };
  document.querySelectorAll("[data-step]").forEach((button) => button.onclick = () => { const input = button.dataset.step === "weight" ? $("#weight") : $("#reps"); input.value = Math.max(0, Number(input.value || 0) + Number(button.dataset.delta)); input.dispatchEvent(new Event("input")); });
  $("#weight").onfocus = $("#reps").onfocus = (event) => event.target.select();
  $("#weight").oninput = (e) => state.draft.weightValue = Math.max(0, Number(e.target.value || 0)); $("#reps").oninput = (e) => state.draft.reps = Math.max(0, Math.round(Number(e.target.value || 0)));
  document.querySelectorAll("[data-unit]").forEach((button) => button.onclick = () => { state.draft.weightUnit = button.dataset.unit; renderEntry(); });
  document.querySelectorAll("[data-rir]").forEach((button) => button.onclick = () => { state.draft.rir = button.dataset.rir === "" ? null : Number(button.dataset.rir); renderEntry(); });
  document.querySelectorAll("[data-side]").forEach((button) => button.onclick = () => {
    state.draft.side = button.dataset.side;
    if (["left", "right", "alternating"].includes(state.draft.side) && state.draft.loadMode === "per_side") state.draft.loadMode = "per_limb";
    state.draft.executionMode = ["left", "right", "alternating"].includes(state.draft.side) ? "unilateral" : (state.draft.loadMode === "per_limb" ? "bilateral_simultaneous" : "bilateral");
    state.draft.sideCount = ["left", "right"].includes(state.draft.side) ? 1 : (["per_limb", "per_side"].includes(state.draft.loadMode) ? 2 : 1);
    renderEntry();
  });
  document.querySelectorAll("[data-grip-width]").forEach((button) => button.onclick = () => { state.draft.gripWidth = button.dataset.gripWidth; renderEntry(); });
  document.querySelectorAll("[data-grip-orientation]").forEach((button) => button.onclick = () => { state.draft.gripOrientation = button.dataset.gripOrientation; renderEntry(); });
  $("#save")?.addEventListener("click", saveSet);
  $("#switchExercise")?.addEventListener("click", async () => { await persist(); navigate("picker"); });
  document.querySelectorAll("[data-session-exercise]").forEach((button) => button.onclick = () => openExercise(button.dataset.sessionExercise));
  $("#restSkip")?.addEventListener("click", () => { state.session.rest = null; persist(); renderEntry(); });
  $("#restAdd")?.addEventListener("click", () => { const rest = state.session.rest; if (rest.running) rest.endsAt += 30000; else rest.remainingSeconds = restRemainingSeconds(rest) + 30; rest.durationSeconds = Math.max(rest.durationSeconds || 0, restRemainingSeconds(rest)); persist(); updateClocks(); });
  $("#restToggle")?.addEventListener("click", async () => { const rest = state.session.rest, remaining = restRemainingSeconds(rest); if (rest.running) { rest.remainingSeconds = remaining; rest.running = false; rest.endsAt = null; } else if (remaining > 0) { rest.running = true; rest.endsAt = Date.now() + remaining * 1000; } await persist(); renderEntry(); });
  bindSessionManagement();
}

async function saveSet() {
  const extras = { restSeconds: Number($("#rest")?.value || state.draft.restSeconds || 90), rpe: $("#rpe")?.value ?? state.draft.rpe, rer: $("#rer")?.value ?? state.draft.rer, notes: $("#notes")?.value ?? state.draft.notes };
  const set = normalizeSet({ ...state.draft, ...extras, id: `qset_${Date.now().toString(36)}`, completedAt: new Date().toISOString() });
  if (set.reps < 1) return showToast("次数至少为 1"); state.session.sets.push(set); state.session.rest = { durationSeconds: set.restSeconds, remainingSeconds: set.restSeconds, running: false, endsAt: null }; state.draft = { ...set, id: "", completedAt: "" };
  await persist(); navigator.vibrate?.(35); showToast(`第 ${state.session.sets.filter((s) => s.exerciseId === set.exerciseId).length} 组已保存 · 休息计时等待开始`); renderEntry();
}

function updateClocks() {
  document.querySelectorAll("[data-elapsed]").forEach((node) => node.textContent = formatClock(elapsed()));
  document.querySelectorAll("[data-rest]").forEach((node) => { const seconds = restRemainingSeconds(state.session.rest); node.textContent = formatClock(seconds); if (!seconds && state.session.rest?.running) { state.session.rest = null; navigator.vibrate?.([120,80,120]); persist(); showToast("休息结束，可以开始下一组"); render(); } });
}

async function finishSession() { if (state.session.timer.running) { state.session.timer.elapsedMs = timerElapsedMs(state.session); state.session.timer.running = false; state.session.timer.startedAtMs = null; } state.session.endedAt = new Date().toISOString(); state.session.rest = null; await persist(); await loadWatchCandidates(); navigate("summary"); }
async function loadWatchCandidates() { try { const params = new URLSearchParams({ started_at: state.session.startedAt, ended_at: state.session.endedAt || new Date().toISOString() }); const response = await fetch(`/api/workout-capture/match-candidates?${params}`); if (!response.ok) throw new Error(); const data = await response.json(); state.watchCandidates = data.candidates || []; state.selectedWatch = state.watchCandidates.length === 1 && state.watchCandidates[0].matchConfidence >= .9 ? state.watchCandidates[0].workoutId : ""; } catch { state.watchCandidates = []; } }

function renderSummary() {
  setScreenHeading("训练总结"); const summary = sessionSummary(state.session); const groups = groupSets();
  app.innerHTML = `<section class="hero"><div class="label">训练完成</div><div class="timer">${summary.durationMinutes}<small style="font-size:16px"> 分钟</small></div><div class="metrics"><div class="metric"><span class="label">动作</span><strong>${summary.exerciseCount}</strong></div><div class="metric"><span class="label">组数</span><strong>${summary.setCount}</strong></div><div class="metric"><span class="label">训练量</span><strong>${summary.volume}</strong></div></div></section>
  ${state.session.sync.workoutId ? `<div class="import-state">✓ 已导入 Body.OS · <a class="link" href="/?view=fitness">查看训练</a></div>` : ""}
  <section class="section"><div class="section-head"><h2>动作记录</h2><span class="label">${summary.reps} 次</span></div>${[...groups.entries()].map(([exerciseId, sets]) => `<article class="summary-card"><header class="summary-card-head"><h3>${escapeHTML(sets[0].exerciseName)}</h3><button class="summary-delete" data-delete-exercise="${escapeHTML(exerciseId)}" aria-label="删除 ${escapeHTML(sets[0].exerciseName)}">删除动作</button></header>${sets.map((set,index) => `<div class="set-row"><span class="set-index">${index + 1}</span><span class="set-main"><strong>${set.weightValue}${set.weightUnit} × ${set.reps}</strong><small>${LOAD_LABELS[set.loadMode]}${set.rir != null ? ` · RIR ${set.rir}` : ""}</small></span><time>${new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(set.completedAt))}</time></div>`).join("")}</article>`).join("")}</section>
  <section class="section"><div class="section-head"><h2>导出与联动</h2></div><div class="card-list"><button class="exercise-card" id="copyJson"><span class="exercise-icon">⧉</span><span><strong>复制 Body.OS JSON</strong><small>粘贴到 Body.OS「智能训练捕获」即可快速读取</small></span><span class="chevron">›</span></button>${canDirectBodyOs ? `<button class="exercise-card" id="watchLink"><span class="exercise-icon">⌚</span><span><strong>Apple Watch 训练</strong><small>${state.selectedWatch ? "已选择匹配场次" : state.watchCandidates.length ? `${state.watchCandidates.length} 个候选可选` : "暂不匹配"}</small></span><span class="chevron">›</span></button>` : ""}<button class="exercise-card" id="json"><span class="exercise-icon">{ }</span><span><strong>下载结构化 JSON</strong><small>Body.OS Quick Workout v1</small></span><span class="chevron">↓</span></button><button class="exercise-card" id="markdown"><span class="exercise-icon">M↓</span><span><strong>导出 Markdown</strong><small>可读训练备份</small></span><span class="chevron">↓</span></button></div></section>
  <section class="danger-zone"><div><strong>管理本次训练</strong><small>清空全部组、计时和待同步状态；动作库与离线缓存会保留。</small></div><button class="${state.resetArmed ? "armed" : ""}" id="resetSession">${state.resetArmed ? "确认重置" : "重置本次训练"}</button></section>`;
  bottomBar.innerHTML = `<button class="secondary" id="continue">继续训练</button><button class="primary" id="primaryExport">${canDirectBodyOs ? "一键导入 Body.OS" : "复制 Body.OS JSON"}</button>`;
  $("#continue").onclick = () => { state.session.endedAt = ""; navigate("home"); };
  $("#copyJson").onclick = copyBodyJson; $("#primaryExport").onclick = canDirectBodyOs ? importBodyOS : copyBodyJson;
  $("#watchLink")?.addEventListener("click", () => navigate("watch")); $("#json").onclick = () => download("json"); $("#markdown").onclick = () => download("md");
  bindSessionManagement();
}
function groupSets() { const groups = new Map(); state.session.sets.forEach((set) => { if (!groups.has(set.exerciseId)) groups.set(set.exerciseId, []); groups.get(set.exerciseId).push(set); }); return groups; }

function renderWatch() {
  setScreenHeading("关联 Apple Watch"); app.innerHTML = `<p class="muted">选择与本次力量训练时间最接近的 Apple Watch 场次。不会自动覆盖已有结构化训练。</p><div class="card-list"><label class="watch-card ${!state.selectedWatch ? "active" : ""}"><input type="radio" name="watch" value="" ${!state.selectedWatch ? "checked" : ""}><span><strong>暂不匹配 Apple Watch</strong><small class="muted">保存为独立的 Body.OS 训练</small></span></label>${state.watchCandidates.map((item) => `<label class="watch-card ${state.selectedWatch === item.workoutId ? "active" : ""}"><input type="radio" name="watch" value="${escapeHTML(item.workoutId)}" ${state.selectedWatch === item.workoutId ? "checked" : ""}><span><strong>${new Intl.DateTimeFormat("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(item.startTime))} · ${Math.round(item.durationMinutes || 0)} 分钟</strong><small class="muted">${Math.round(item.energyKcal || 0)} kcal · 匹配度 ${Math.round((item.matchConfidence || 0)*100)}%</small></span></label>`).join("")}</div>`;
  bottomBar.innerHTML = `<button class="primary" id="watchSave">确认选择</button>`; document.querySelectorAll("input[name=watch]").forEach((input) => input.onchange = () => { state.selectedWatch = input.value; renderWatch(); }); $("#watchSave").onclick = () => navigate("summary");
}

async function importBodyOS() {
  if (!navigator.onLine) { state.session.sync.status = "pending"; await persist(); showToast("当前离线，记录已保存在本机"); return; }
  state.importing = true; renderSummary();
  try {
    const markdown = toMarkdown(state.session); let draftId = state.session.sync.draftId;
    if (!draftId) { const recognized = await api("/api/workout-capture/recognize", { source_type: "manual", text: markdown, original_text: markdown, source_started_at: state.session.startedAt, source_ended_at: state.session.endedAt }); draftId = recognized.draft_id; state.session.sync.draftId = draftId; await persist(); }
    const confirmed = await api("/api/workout-capture/confirm", { draft_id: draftId, matched_workout_id: state.selectedWatch, candidate: buildBodyCandidate(state.session) });
    state.session.sync = { status: "imported", draftId, workoutId: confirmed.workout_id, importedAt: new Date().toISOString() }; await persist(); showToast("已导入 Body.OS");
  } catch (error) { state.session.sync.status = "pending"; await persist(); showToast(error.message || "导入失败，已保留本机记录"); }
  state.importing = false; renderSummary();
}
async function api(url, body) { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || data.message || `请求失败 ${response.status}`); return data; }

async function copyBodyJson() {
  const value = JSON.stringify(createExport(state.session), null, 2);
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea"); input.value = value; input.setAttribute("readonly", ""); input.style.position = "fixed"; input.style.opacity = "0"; document.body.append(input); input.select(); document.execCommand("copy"); input.remove();
  }
  showToast("已复制；到 Body.OS 智能训练捕获中粘贴即可");
}

function download(type) { const value = type === "json" ? JSON.stringify(createExport(state.session), null, 2) : toMarkdown(state.session); const blob = new Blob([value], { type: type === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `body-os-${state.session.startedAt.slice(0,10)}.${type}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }

backButton.onclick = () => history.back(); window.addEventListener("popstate", () => { const target = location.hash.slice(1) || "home"; state.screen = target; render(); });
window.addEventListener("online", () => { status.textContent = "本机已保存"; if (state.session?.sync.status === "pending") showToast("网络已恢复，可导入 Body.OS"); }); window.addEventListener("offline", () => { status.textContent = "离线记录中"; status.style.color = "var(--orange)"; });
document.addEventListener("visibilitychange", () => { if (!document.hidden) updateClocks(); });

async function loadExerciseLibrary() {
  if (!canDirectBodyOs) { const cached = await DB.get("exercise-library"); if (cached?.length) state.exercises = cached; return; }
  try { const response = await fetch("/api/training/snapshot"); if (!response.ok) return; const data = await response.json(); const items = data.exercise_library || data.exerciseLibrary || []; if (data.body_weight_kg != null) state.session.bodyWeightKg = Number(data.body_weight_kg); if (Array.isArray(items) && items.length) { const remote = items.map((item) => ({ id: item.id || item.exercise_canonical_id || item.canonical_id, name: item.canonical_name_zh || item.name || item.display_name, canonicalNameEn: item.canonical_name_en || "", equipment: item.equipment || "", movementPattern: item.movement_pattern || "", loadMode: item.default_load_mode || "total", executionMode: item.supports_unilateral_execution ? "unilateral" : item.supports_per_side_load ? "bilateral_simultaneous" : "bilateral", sideCount: item.supports_per_side_load ? 2 : 1 })).filter((x) => x.id && x.name); const seenIds = new Set(remote.map((item) => item.id)), seenNames = new Set(remote.map((item) => `${item.name}|${item.canonicalNameEn}`.toLowerCase())); state.exercises = [...remote, ...FALLBACK_EXERCISES.filter((item) => !seenIds.has(item.id) && !seenNames.has(`${item.name}|${item.canonicalNameEn}`.toLowerCase()))]; await DB.set("exercise-library", state.exercises); } } catch { const cached = await DB.get("exercise-library"); if (cached?.length) state.exercises = cached; }
}

async function boot() {
  const saved = await DB.get("active-session"); state.session = saved?.sets && !saved.sync?.workoutId ? saved : createSession();
  if (!state.session.timer) {
    const completedDuration = state.session.endedAt ? Math.max(0, new Date(state.session.endedAt) - new Date(state.session.startedAt)) : 0;
    state.session.timer = { running: false, elapsedMs: completedDuration, startedAtMs: null };
  }
  if (state.session.rest && state.session.rest.remainingSeconds == null) {
    state.session.rest = { durationSeconds: state.session.rest.pausedSeconds || 90, remainingSeconds: state.session.rest.endsAt ? Math.max(0, Math.ceil((state.session.rest.endsAt - Date.now()) / 1000)) : (state.session.rest.pausedSeconds || 90), running: false, endsAt: null };
  }
  await loadExerciseLibrary(); await persist(); const requested = location.hash.slice(1); state.screen = ["home","picker","entry","summary","watch"].includes(requested) ? requested : "home"; if (state.screen === "entry" && !state.draft) state.screen = "home"; render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(new URL("./sw.js", location.href), { scope: "./" }).catch(() => {});
}
boot();
