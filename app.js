import { FALLBACK_EXERCISES, LOAD_LABELS, buildBodyCandidate, createExport, createSession, normalizeSet, sessionSummary, toMarkdown } from "./core.js";

const $ = (selector, root = document) => root.querySelector(selector);
const app = $("#app"), bottomBar = $("#bottomBar"), backButton = $("#backButton"), title = $("#screenTitle"), status = $("#networkStatus");
let state = { session: null, exercises: FALLBACK_EXERCISES, screen: "home", draft: null, selectedWatch: "", watchCandidates: [], importing: false };
let tickTimer = null, toastTimer = null;
const canDirectBodyOs = location.pathname.startsWith("/quick-workout/") && !location.hostname.endsWith("github.io") && location.protocol !== "file:";

const DB = {
  open: () => new Promise((resolve, reject) => { const request = indexedDB.open("body-os-quick-workout", 1); request.onupgradeneeded = () => request.result.createObjectStore("state"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }),
  async get(key) { try { const db = await this.open(); return await new Promise((resolve, reject) => { const req = db.transaction("state").objectStore("state").get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); } catch { return JSON.parse(localStorage.getItem(key) || "null"); } },
  async set(key, value) { try { const db = await this.open(); await new Promise((resolve, reject) => { const tx = db.transaction("state", "readwrite"); tx.objectStore("state").put(value, key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); } catch { localStorage.setItem(key, JSON.stringify(value)); } },
};

function escapeHTML(value = "") { const node = document.createElement("span"); node.textContent = String(value); return node.innerHTML; }
function formatClock(seconds) { const safe = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`; }
function elapsed() { return Math.max(0, (Date.now() - new Date(state.session.startedAt).getTime()) / 1000); }
function showToast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2600); }
async function persist() { state.session.updatedAt = new Date().toISOString(); await DB.set("active-session", state.session); status.textContent = navigator.onLine ? "本机已保存" : "离线记录中"; status.style.color = navigator.onLine ? "var(--mint)" : "var(--orange)"; }
function navigate(screen, data = {}, push = true) { state.screen = screen; Object.assign(state, data); if (push) history.pushState({ screen }, "", `#${screen}`); render(); }
function setScreenHeading(text, canBack = true) { title.textContent = text; backButton.classList.toggle("hidden", !canBack); requestAnimationFrame(() => title.focus({ preventScroll: true })); }
function exerciseIcon(exercise) { const map = { horizontal_push: "↗", vertical_push: "↑", horizontal_pull: "↙", vertical_pull: "↓", squat: "◇", hinge: "⌁", shoulder_abduction: "↔", shoulder_flexion: "⌃" }; return map[exercise.movementPattern] || "✦"; }

function render() {
  clearInterval(tickTimer); app.innerHTML = ""; bottomBar.innerHTML = "";
  if (state.screen === "picker") renderPicker(); else if (state.screen === "entry") renderEntry(); else if (state.screen === "summary") renderSummary(); else if (state.screen === "watch") renderWatch(); else renderHome();
  tickTimer = setInterval(updateClocks, 1000); updateClocks();
}

function renderHome() {
  setScreenHeading("训练中", false); const summary = sessionSummary(state.session); const recentIds = [...new Set(state.session.sets.map((s) => s.exerciseId))].reverse();
  app.innerHTML = `<section class="hero"><div class="hero-row"><div><div class="label">当前训练</div><div class="timer" data-elapsed>${formatClock(elapsed())}</div></div><div class="exercise-icon">⚡</div></div><div class="metrics"><div class="metric"><span class="label">动作</span><strong>${summary.exerciseCount}</strong></div><div class="metric"><span class="label">组数</span><strong>${summary.setCount}</strong></div><div class="metric"><span class="label">训练量</span><strong>${summary.volume}</strong><small>kg</small></div></div></section>
  <section class="section"><div class="section-head"><h2>${recentIds.length ? "继续记录" : "准备开始"}</h2><button id="browseAll">动作库</button></div><div class="card-list">${recentIds.length ? recentIds.slice(0, 4).map((id) => exerciseCard(state.exercises.find((x) => x.id === id) || fromSet(id))).join("") : `<div class="empty">选择第一个标准动作。之后每组可一键复用上一组数据。</div>`}</div></section>`;
  bottomBar.innerHTML = `<button class="secondary" id="finish" ${summary.setCount ? "" : "disabled"}>结束训练</button><button class="primary" id="choose">＋ 选择动作</button>`;
  $("#choose").onclick = $("#browseAll").onclick = () => navigate("picker"); $("#finish").onclick = finishSession; bindExerciseCards();
}

function fromSet(id) { const set = state.session.sets.find((x) => x.exerciseId === id); return { id, name: set.exerciseName, ...set }; }
function exerciseCard(exercise) { if (!exercise) return ""; const count = state.session.sets.filter((s) => s.exerciseId === exercise.id).length; return `<button class="exercise-card" data-exercise="${escapeHTML(exercise.id)}"><span class="exercise-icon">${exerciseIcon(exercise)}</span><span><strong>${escapeHTML(exercise.name)}</strong><small>${escapeHTML(exercise.equipment || "标准动作")} · ${LOAD_LABELS[exercise.loadMode] || "重量"}${count ? ` · 已记录 ${count} 组` : ""}</small></span><span class="chevron">›</span></button>`; }
function bindExerciseCards() { document.querySelectorAll("[data-exercise]").forEach((button) => button.onclick = () => openExercise(button.dataset.exercise)); }

function renderPicker() {
  setScreenHeading("选择标准动作"); app.innerHTML = `<input class="search" id="search" type="search" placeholder="搜索动作、器械或英文名" autocomplete="off" aria-label="搜索动作"><div class="chip-row section"><button class="chip active" data-filter="">全部</button><button class="chip" data-filter="推">推</button><button class="chip" data-filter="拉">拉</button><button class="chip" data-filter="腿">腿</button><button class="chip" data-filter="哑铃">哑铃</button><button class="chip" data-filter="器械">器械</button></div><div class="card-list" id="exerciseList"></div>`;
  const list = $("#exerciseList"), search = $("#search"); let filter = "";
  const update = () => { const term = `${search.value} ${filter}`.trim().toLowerCase(); const words = term.split(/\s+/).filter(Boolean); const matches = state.exercises.filter((x) => words.every((word) => `${x.name} ${x.canonicalNameEn || ""} ${x.equipment || ""} ${x.movementPattern || ""}`.toLowerCase().includes(word) || (word === "推" && x.movementPattern?.includes("push")) || (word === "拉" && x.movementPattern?.includes("pull")) || (word === "腿" && /squat|hinge|lunge/.test(x.movementPattern)))); list.innerHTML = matches.map(exerciseCard).join("") || `<div class="empty">没有找到这个标准动作</div>`; bindExerciseCards(); };
  search.oninput = update; document.querySelectorAll("[data-filter]").forEach((chip) => chip.onclick = () => { document.querySelectorAll("[data-filter]").forEach((x) => x.classList.remove("active")); chip.classList.add("active"); filter = chip.dataset.filter; update(); }); update(); setTimeout(() => search.focus(), 50);
}

function openExercise(id) {
  const exercise = state.exercises.find((x) => x.id === id) || fromSet(id); const previous = [...state.session.sets].reverse().find((x) => x.exerciseId === id);
  state.session.currentExerciseId = id; state.draft = normalizeSet(previous ? { ...previous, id: "", completedAt: "", restSeconds: defaultRest(previous) } : { exerciseId: id, exerciseName: exercise.name, canonicalNameEn: exercise.canonicalNameEn, equipment: exercise.equipment, movementPattern: exercise.movementPattern, loadMode: exercise.loadMode, executionMode: exercise.executionMode, sideCount: exercise.sideCount, weightValue: 10, weightUnit: "kg", reps: 10, rir: 2, restSeconds: 90, side: "both", notes: "" });
  navigate("entry");
}
function defaultRest(previous) { const prior = state.session.sets.filter((x) => x.exerciseId === previous.exerciseId); if (prior.length < 2) return previous.restSeconds || 90; const a = new Date(prior.at(-1).completedAt), b = new Date(prior.at(-2).completedAt); return Math.min(7200, Math.max(0, Math.round((a - b) / 1000))); }

function renderEntry() {
  const d = state.draft, count = state.session.sets.filter((s) => s.exerciseId === d.exerciseId).length, last = [...state.session.sets].reverse().find((s) => s.exerciseId === d.exerciseId);
  setScreenHeading(d.exerciseName); app.innerHTML = `<section class="hero"><div class="entry-title"><span class="exercise-icon">${exerciseIcon(d)}</span><div><div class="label">第 ${count + 1} 组</div><strong>${escapeHTML(d.exerciseName)}</strong><div class="muted">${escapeHTML(d.equipment || "标准动作")}</div></div></div><div class="semantic"><span>重量计算方式</span><select id="loadMode" aria-label="重量计算方式">${Object.entries(LOAD_LABELS).map(([value,label]) => `<option value="${value}" ${d.loadMode === value ? "selected" : ""}>${label}</option>`).join("")}</select></div></section>
  ${restMarkup()}
  ${last ? `<div class="last-set">上一组：${last.weightValue}${last.weightUnit} × ${last.reps} 次${last.rir != null ? ` · RIR ${last.rir}` : ""}</div>` : ""}
  <div class="step-grid"><div class="stepper"><div class="label">${LOAD_LABELS[d.loadMode]}</div><div class="stepper-controls"><button data-step="weight" data-delta="-2.5" aria-label="减少重量">−</button><input id="weight" class="number-input" inputmode="decimal" value="${d.weightValue}" aria-label="重量"><button data-step="weight" data-delta="2.5" aria-label="增加重量">＋</button></div><div class="label" style="text-align:center">kg${["per_limb","per_side"].includes(d.loadMode) ? ` · 总负荷 ${d.weightValue * 2} kg` : ""}</div></div><div class="stepper"><div class="label">次数</div><div class="stepper-controls"><button data-step="reps" data-delta="-1" aria-label="减少次数">−</button><input id="reps" class="number-input" inputmode="numeric" value="${d.reps}" aria-label="次数"><button data-step="reps" data-delta="1" aria-label="增加次数">＋</button></div><div class="label" style="text-align:center">次</div></div></div>
  <section class="section"><div class="section-head"><h2>RIR</h2><span class="label">还能完成几次</span></div><div class="rir-grid">${[null,0,1,2,3,4,5].map((v) => `<button class="chip ${d.rir === v ? "active" : ""}" data-rir="${v == null ? "" : v}">${v == null ? "未记" : v}</button>`).join("")}</div></section>
  <section class="section"><div class="section-head"><h2>左右侧</h2></div><div class="chip-row">${[["both","双侧"],["left","左侧"],["right","右侧"],["alternating","左右交替"]].map(([v,l]) => `<button class="chip ${d.side === v ? "active" : ""}" data-side="${v}">${l}</button>`).join("")}</div></section>
  <details class="detail-panel"><summary>扩展数据与备注</summary><div class="detail-body"><div class="field"><label for="rest">目标休息（秒）</label><input id="rest" type="number" inputmode="numeric" min="0" max="7200" value="${d.restSeconds || 90}"></div><div class="field"><label for="rpe">RPE（1–10）</label><input id="rpe" type="number" inputmode="decimal" min="1" max="10" step="0.5" value="${d.rpe ?? ""}"></div><div class="field"><label for="rer">RER（0.5–2）</label><input id="rer" type="number" inputmode="decimal" min="0.5" max="2" step="0.1" value="${d.rer ?? ""}"></div><div class="field"><label for="notes">备注 / 疼痛反馈</label><textarea id="notes" maxlength="1000" placeholder="例如：左肩刺痛，动作控制良好">${escapeHTML(d.notes)}</textarea></div></div></details>`;
  bottomBar.innerHTML = `<button class="secondary" id="switchExercise">切换动作</button><button class="primary" id="save">${last ? `复用并保存第 ${count + 1} 组` : "保存第 1 组"}</button>`;
  bindEntry();
}

function restMarkup() { if (!state.session.rest?.endsAt) return ""; return `<section class="rest-card"><div class="row"><div><div class="label">自动休息计时</div><div class="rest-time" data-rest>00:00</div></div><span>下一组已准备</span></div><div class="rest-actions"><button id="restSkip">跳过</button><button id="restAdd">+30 秒</button><button id="restPause">暂停</button></div></section>`; }
function bindEntry() {
  $("#loadMode").onchange = (e) => { state.draft.loadMode = e.target.value; state.draft.sideCount = ["per_limb","per_side"].includes(e.target.value) ? 2 : 1; renderEntry(); };
  document.querySelectorAll("[data-step]").forEach((button) => button.onclick = () => { const input = button.dataset.step === "weight" ? $("#weight") : $("#reps"); input.value = Math.max(0, Number(input.value || 0) + Number(button.dataset.delta)); input.dispatchEvent(new Event("change")); });
  $("#weight").onchange = (e) => state.draft.weightValue = Math.max(0, Number(e.target.value || 0)); $("#reps").onchange = (e) => state.draft.reps = Math.max(0, Math.round(Number(e.target.value || 0)));
  document.querySelectorAll("[data-rir]").forEach((button) => button.onclick = () => { state.draft.rir = button.dataset.rir === "" ? null : Number(button.dataset.rir); renderEntry(); });
  document.querySelectorAll("[data-side]").forEach((button) => button.onclick = () => {
    state.draft.side = button.dataset.side;
    if (["left", "right", "alternating"].includes(state.draft.side) && state.draft.loadMode === "per_side") state.draft.loadMode = "per_limb";
    state.draft.executionMode = ["left", "right", "alternating"].includes(state.draft.side) ? "unilateral" : (state.draft.loadMode === "per_limb" ? "bilateral_simultaneous" : "bilateral");
    state.draft.sideCount = ["left", "right"].includes(state.draft.side) ? 1 : (["per_limb", "per_side"].includes(state.draft.loadMode) ? 2 : 1);
    renderEntry();
  });
  $("#save")?.addEventListener("click", saveSet);
  $("#switchExercise")?.addEventListener("click", async () => { await persist(); navigate("picker"); });
  $("#restSkip")?.addEventListener("click", () => { state.session.rest = null; persist(); renderEntry(); }); $("#restAdd")?.addEventListener("click", () => { state.session.rest.endsAt += 30000; persist(); updateClocks(); }); $("#restPause")?.addEventListener("click", () => { state.session.rest.pausedSeconds = Math.max(0, Math.round((state.session.rest.endsAt - Date.now()) / 1000)); state.session.rest.endsAt = null; persist(); renderEntry(); });
}

async function saveSet() {
  const extras = { restSeconds: Number($("#rest")?.value || state.draft.restSeconds || 90), rpe: $("#rpe")?.value ?? state.draft.rpe, rer: $("#rer")?.value ?? state.draft.rer, notes: $("#notes")?.value ?? state.draft.notes };
  const set = normalizeSet({ ...state.draft, ...extras, id: `qset_${Date.now().toString(36)}`, completedAt: new Date().toISOString() });
  if (set.reps < 1) return showToast("次数至少为 1"); state.session.sets.push(set); state.session.rest = { startedAt: Date.now(), endsAt: Date.now() + set.restSeconds * 1000, pausedSeconds: 0 }; state.draft = { ...set, id: "", completedAt: "" };
  await persist(); navigator.vibrate?.(35); showToast(`第 ${state.session.sets.filter((s) => s.exerciseId === set.exerciseId).length} 组已保存`); renderEntry();
}

function updateClocks() {
  document.querySelectorAll("[data-elapsed]").forEach((node) => node.textContent = formatClock(elapsed()));
  document.querySelectorAll("[data-rest]").forEach((node) => { const seconds = Math.max(0, Math.ceil((state.session.rest?.endsAt - Date.now()) / 1000)); node.textContent = formatClock(seconds); if (!seconds && state.session.rest?.endsAt) { state.session.rest = null; navigator.vibrate?.([120,80,120]); persist(); showToast("休息结束，可以开始下一组"); render(); } });
}

async function finishSession() { state.session.endedAt = new Date().toISOString(); state.session.rest = null; await persist(); await loadWatchCandidates(); navigate("summary"); }
async function loadWatchCandidates() { try { const params = new URLSearchParams({ started_at: state.session.startedAt, ended_at: state.session.endedAt || new Date().toISOString() }); const response = await fetch(`/api/workout-capture/match-candidates?${params}`); if (!response.ok) throw new Error(); const data = await response.json(); state.watchCandidates = data.candidates || []; state.selectedWatch = state.watchCandidates.length === 1 && state.watchCandidates[0].matchConfidence >= .9 ? state.watchCandidates[0].workoutId : ""; } catch { state.watchCandidates = []; } }

function renderSummary() {
  setScreenHeading("训练总结"); const summary = sessionSummary(state.session); const groups = groupSets();
  app.innerHTML = `<section class="hero"><div class="label">训练完成</div><div class="timer">${summary.durationMinutes}<small style="font-size:16px"> 分钟</small></div><div class="metrics"><div class="metric"><span class="label">动作</span><strong>${summary.exerciseCount}</strong></div><div class="metric"><span class="label">组数</span><strong>${summary.setCount}</strong></div><div class="metric"><span class="label">训练量</span><strong>${summary.volume}</strong></div></div></section>
  ${state.session.sync.workoutId ? `<div class="import-state">✓ 已导入 Body.OS · <a class="link" href="/?view=fitness">查看训练</a></div>` : ""}
  <section class="section"><div class="section-head"><h2>动作记录</h2><span class="label">${summary.reps} 次</span></div>${[...groups.values()].map((sets) => `<article class="summary-card"><h3>${escapeHTML(sets[0].exerciseName)}</h3>${sets.map((set,index) => `<div class="set-row"><span class="set-index">${index + 1}</span><span class="set-main"><strong>${set.weightValue}${set.weightUnit} × ${set.reps}</strong><small>${LOAD_LABELS[set.loadMode]}${set.rir != null ? ` · RIR ${set.rir}` : ""}</small></span><time>${new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(set.completedAt))}</time></div>`).join("")}</article>`).join("")}</section>
  <section class="section"><div class="section-head"><h2>导出与联动</h2></div><div class="card-list"><button class="exercise-card" id="copyJson"><span class="exercise-icon">⧉</span><span><strong>复制 Body.OS JSON</strong><small>粘贴到 Body.OS「智能训练捕获」即可快速读取</small></span><span class="chevron">›</span></button>${canDirectBodyOs ? `<button class="exercise-card" id="watchLink"><span class="exercise-icon">⌚</span><span><strong>Apple Watch 训练</strong><small>${state.selectedWatch ? "已选择匹配场次" : state.watchCandidates.length ? `${state.watchCandidates.length} 个候选可选` : "暂不匹配"}</small></span><span class="chevron">›</span></button>` : ""}<button class="exercise-card" id="json"><span class="exercise-icon">{ }</span><span><strong>下载结构化 JSON</strong><small>Body.OS Quick Workout v1</small></span><span class="chevron">↓</span></button><button class="exercise-card" id="markdown"><span class="exercise-icon">M↓</span><span><strong>导出 Markdown</strong><small>可读训练备份</small></span><span class="chevron">↓</span></button></div></section>`;
  bottomBar.innerHTML = `<button class="secondary" id="continue">继续训练</button><button class="primary" id="primaryExport">${canDirectBodyOs ? "一键导入 Body.OS" : "复制 Body.OS JSON"}</button>`;
  $("#continue").onclick = () => { state.session.endedAt = ""; navigate("home"); };
  $("#copyJson").onclick = copyBodyJson; $("#primaryExport").onclick = canDirectBodyOs ? importBodyOS : copyBodyJson;
  $("#watchLink")?.addEventListener("click", () => navigate("watch")); $("#json").onclick = () => download("json"); $("#markdown").onclick = () => download("md");
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
  try { const response = await fetch("/api/training/snapshot"); if (!response.ok) return; const data = await response.json(); const items = data.exercise_library || data.exerciseLibrary || []; if (Array.isArray(items) && items.length) { state.exercises = items.map((item) => ({ id: item.id || item.exercise_canonical_id || item.canonical_id, name: item.canonical_name_zh || item.name || item.display_name, canonicalNameEn: item.canonical_name_en || "", equipment: item.equipment || "", movementPattern: item.movement_pattern || "", loadMode: item.default_load_mode || "total", executionMode: item.supports_unilateral_execution ? "unilateral" : item.supports_per_side_load ? "bilateral_simultaneous" : "bilateral", sideCount: item.supports_per_side_load ? 2 : 1 })).filter((x) => x.id && x.name); await DB.set("exercise-library", state.exercises); } } catch { const cached = await DB.get("exercise-library"); if (cached?.length) state.exercises = cached; }
}

async function boot() {
  const saved = await DB.get("active-session"); state.session = saved?.sets && !saved.sync?.workoutId ? saved : createSession();
  if (state.session.rest?.endsAt && state.session.rest.endsAt < Date.now()) state.session.rest = null;
  await loadExerciseLibrary(); await persist(); const requested = location.hash.slice(1); state.screen = ["home","picker","entry","summary","watch"].includes(requested) ? requested : "home"; if (state.screen === "entry" && !state.draft) state.screen = "home"; render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(new URL("./sw.js", location.href), { scope: "./" }).catch(() => {});
}
boot();
