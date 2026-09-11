import { EXERCISE_CATALOG_VERSION, EXERCISE_REFERENCES, FALLBACK_EXERCISES, LOAD_LABELS, adjustRest, applyRecordingMode, buildBodyCandidate, canonicalExerciseId, changeWeightUnit, compareWorkoutHistory, createExport, createRunningRest, createSession, decisiveWatchCandidate, draftFromExerciseDefault, lookupExerciseDefault, mergeExerciseCatalog, nextSetDraft, normalizeSet, recordingModeForSet, resolveCatalogExerciseId, restRemainingSeconds, sessionSummary, timerElapsedMs, toMarkdown, withoutExercise, aggregateLiftPoints, displayLiftKg, liftChartMarkup, liftPointDetailMarkup, lookbackLiftDeltas, progressSeriesForExercise } from "./core.js?v=18";
import { fetchTrainingSnapshot, normalizeSupabaseConfig, refreshSession, sessionIsFresh, signInWithPassword, uploadWorkout } from "./supabase.js?v=4";

const $ = (selector, root = document) => root.querySelector(selector);
const app = $("#app"), bottomBar = $("#bottomBar"), backButton = $("#backButton"), title = $("#screenTitle"), status = $("#networkStatus"), quickFinish = $("#quickFinish");
const DEFAULT_SUPABASE_CONFIG = Object.freeze(normalizeSupabaseConfig({
  url: "https://zvmesprbvoakonvxzpaj.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2bWVzcHJidm9ha29udnh6cGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NTM1MjUsImV4cCI6MjEwMDEyOTUyNX0.kyXsxN72XkE7t9F8lbu4IaYiuJD7v8Xw1kkn3AlBmaM",
}));
const RECORDING_MODE_LABELS = Object.freeze({
  total: "总重量（双侧）", per_side: "每边配重（双侧同时）", per_limb_both: "每手重量（双侧同时）",
  per_limb_right: "右侧单组", per_limb_left: "左侧单组", per_limb_alternating: "左右交替（合并一组）", assistance: "辅助重量",
});
const DEFAULT_REST_SECONDS = 120;
const safeExternalUrl = (value, kind) => { try { const url = new URL(String(value || "")); if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password) return ""; if (kind === "dataset") return url.hostname === "raw.githubusercontent.com" && url.pathname.startsWith("/hasaneyldrm/exercises-dataset/") ? url.href : ""; if (kind === "wger") return url.hostname === "wger.de" && (/^\/en\/exercise\/\d+\/?$/.test(url.pathname) || url.pathname.startsWith("/media/exercise-video/")) ? url.href : ""; } catch {} return ""; };
const enrichExercise = (item) => ({ ...item, reference: EXERCISE_REFERENCES[canonicalExerciseId(item.id)] || null, catalogVersion: EXERCISE_CATALOG_VERSION });
const BASE_EXERCISES = FALLBACK_EXERCISES.map(enrichExercise).filter((item, index, items) => items.findIndex((other) => other.id === item.id) === index);
const TRAINING_PRESETS = [
  { key: "shoulder_complete", group: "shoulders", title: "今日起肩部计划", titleEn: "Shoulder plan from today", note: "4 + 3 + 4 + 3，共 14 组", noteEn: "4 + 3 + 4 + 3, 14 sets total", ids: ["single_arm_cable_lateral_raise","seated_dumbbell_lateral_raise","machine_reverse_fly","face_pull"], sets: { single_arm_cable_lateral_raise: 4, seated_dumbbell_lateral_raise: 3, machine_reverse_fly: 4, face_pull: 3 } },
  { key: "shoulder_low_trap", group: "shoulders", title: "低斜方参与", note: "中束 · 后束 · 前束 · 肩袖", ids: ["single_arm_cable_lateral_raise","seated_bent_over_reverse_fly","cable_front_raise","cable_external_rotation"] },
  { key: "shoulder_after_chest", group: "shoulders", title: "胸后肩部", note: "避开重复推举", ids: ["single_arm_cable_lateral_raise","seated_bent_over_reverse_fly","cable_external_rotation"] },
  { key: "core_stability", group: "core", title: "核心稳定", note: "抗伸展 · 抗旋转 · 抗侧屈", ids: ["dead_bug","pallof_press","incline_side_plank"] },
  { key: "core_hypertrophy", group: "core", title: "核心增肌", note: "负重屈曲 · 下腹 · 抗旋转", ids: ["cable_kneeling_crunch","reverse_crunch","pallof_press"] },
  { key: "cardio_zone2", group: "cardio", title: "Zone 2", note: "自行车或椭圆机 25–30 分钟", ids: ["stationary_bike_low_intensity","elliptical_low_intensity"] },
  { key: "cardio_intervals", group: "cardio", title: "短间歇", note: "每周最多一次", ids: ["incline_treadmill_walk","mountain_climber"] },
  { key: "chest_balanced", group: "chest", title: "胸部平衡", note: "平板推 · 上斜推 · 夹胸", ids: ["dumbbell_flat_chest_press","dumbbell_incline_chest_press","cable_chest_fly"] },
  { key: "back_complete", group: "back", title: "背部完整", note: "垂直拉 · 水平拉 · 肩伸展", ids: ["assisted_close_grip_pull_up","neutral_grip_lat_pulldown","machine_row","straight_arm_pulldown"] },
];
let state = { session: null, exercises: BASE_EXERCISES, screen: "home", draft: null, editingSetIndex: -1, selectedWatch: "", watchCandidates: [], importing: false, resetArmed: false, locale: "zh", pickerPresetKey: "", historyWorkoutId: "", historyMode: "workouts", historyExerciseId: "", liftUnit: "kg", liftGrain: "session", liftScrubIndex: -1, liftSheetOpen: false, training: { snapshot: null, busy: false, error: "" }, cloud: { config: null, session: null, busy: false } };
let tickTimer = null, toastTimer = null, resetArmTimer = null, trainingSnapshotTask = null;
const SNAPSHOT_SCREENS = ["home", "cloud", "history", "entry", "picker", "summary"];
const canDirectBodyOs = location.pathname.startsWith("/quick-workout/") && !location.hostname.endsWith("github.io") && location.protocol !== "file:";

const DB = {
  open: () => new Promise((resolve, reject) => { const request = indexedDB.open("body-os-quick-workout", 1); request.onupgradeneeded = () => request.result.createObjectStore("state"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }),
  async get(key) { try { const db = await this.open(); return await new Promise((resolve, reject) => { const req = db.transaction("state").objectStore("state").get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); } catch { return JSON.parse(localStorage.getItem(key) || "null"); } },
  async set(key, value) { try { const db = await this.open(); await new Promise((resolve, reject) => { const tx = db.transaction("state", "readwrite"); tx.objectStore("state").put(value, key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); } catch { localStorage.setItem(key, JSON.stringify(value)); } },
};

function escapeHTML(value = "") { const node = document.createElement("span"); node.textContent = String(value); return node.innerHTML; }
function localeText(zh, en) { return state.locale === "en" ? en : zh; }
function exerciseLabel(exercise, compact = false) {
  const zh = exercise.name || exercise.exerciseName || "自定义动作", en = exercise.canonicalNameEn || exercise.exerciseName || zh;
  const primary = state.locale === "en" ? en : zh, secondary = state.locale === "en" ? zh : en;
  return compact ? `${escapeHTML(primary)}<small class="translation">${escapeHTML(secondary)}</small>` : `<span class="exercise-name"><strong>${escapeHTML(primary)}</strong><small class="translation">${escapeHTML(secondary)}</small></span>`;
}
function setPreviewMarkup(count, last) {
  if (!count) return "";
  const visible = Math.min(count, 8);
  return `<div class="set-preview" aria-label="本动作共 ${count} 组"><span>${localeText("已完成", "Done")}</span><div class="set-thumbnails">${Array.from({ length: visible }, (_, index) => `<i class="${index === visible - 1 ? "latest" : ""}">${index + 1}</i>`).join("")}${count > visible ? `<b>+${count - visible}</b>` : ""}</div><strong>${count} ${localeText("组", "sets")}</strong>${last ? `<small>${last.weightValue}${last.weightUnit} × ${last.reps}</small>` : ""}</div>`;
}
function formatClock(seconds) { const safe = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`; }
function elapsed() { return timerElapsedMs(state.session) / 1000; }
function showToast(message, actionLabel = "", onAction = null) { const node = $("#toast"); node.replaceChildren(); const text = document.createElement("span"); text.textContent = message; node.append(text); if (actionLabel && onAction) { const button = document.createElement("button"); button.type = "button"; button.textContent = actionLabel; button.onclick = async () => { clearTimeout(toastTimer); node.classList.remove("show"); await onAction(); }; node.append(button); } node.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), actionLabel ? 30000 : 2600); }
async function persist() { state.session.updatedAt = new Date().toISOString(); await DB.set("active-session", state.session); status.textContent = navigator.onLine ? "本机已保存" : "离线记录中"; status.style.color = navigator.onLine ? "var(--mint)" : "var(--orange)"; }
function navigate(screen, data = {}, push = true) { state.screen = screen; Object.assign(state, data); if (push) history.pushState({ screen }, "", `#${screen}`); render(); }
function setScreenHeading(text, canBack = true) { title.textContent = text; backButton.classList.toggle("hidden", !canBack); requestAnimationFrame(() => title.focus({ preventScroll: true })); }
async function toggleLocale() { state.locale = state.locale === "zh" ? "en" : "zh"; await DB.set("display-locale", state.locale); render(); }
function exerciseIcon(exercise) { const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches; const gif = safeExternalUrl(reduced ? exercise.reference?.thumbnailUrl : exercise.reference?.gifUrl, "dataset"); if (gif) return `<img class="exercise-gif" src="${escapeHTML(gif)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`; const map = { horizontal_push: "↗", vertical_push: "↑", horizontal_pull: "↙", vertical_pull: "↓", squat: "◇", hinge: "⌁", shoulder_abduction: "↔", shoulder_flexion: "⌃", anti_extension: "□", anti_rotation: "↻", anti_lateral_flexion: "◩", trunk_flexion: "⌒", rotation: "⟳", locomotion: "♥" }; return map[exercise.movementPattern] || "✦"; }

function exerciseCategory(exercise) {
  const text = `${exercise.name || ""} ${exercise.movementPattern || ""}`.toLowerCase();
  if (/dead bug|plank|pallof|crunch|woodchop|anti_|trunk_flexion|rotation|死虫|平板|帕洛夫|卷腹|伐木|核心/.test(text)) return "core";
  if (/locomotion|cycling|elliptical|treadmill|jump rope|mountain climber|自行车|椭圆机|坡度走|跳绳|登山跑|有氧/.test(text)) return "cardio";
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
  return `<section class="section session-overview"><div class="section-head"><h2>${localeText("本次训练", "This workout")}</h2><span class="label">${groups.size} ${localeText("个动作", "exercises")} · ${state.session.sets.length} ${localeText("组", "sets")}</span></div><div class="session-exercise-list">${[...groups.entries()].map(([id, sets]) => { const last = sets.at(-1); return `<article class="session-exercise ${id === activeId ? "active" : ""}"><button class="session-exercise-open" data-session-exercise="${escapeHTML(id)}"><span>${exerciseIcon(last)}</span><span>${exerciseLabel(last, true)}<small>${sets.length} ${localeText("组", "sets")} · ${last.weightValue}${last.weightUnit} × ${last.reps}</small></span></button><button class="session-exercise-delete" data-delete-exercise="${escapeHTML(id)}" aria-label="删除 ${escapeHTML(last.exerciseName)}">×</button></article>`; }).join("")}</div></section>`;
}

function render() {
  clearInterval(tickTimer); app.innerHTML = ""; bottomBar.innerHTML = "";
  if (state.screen === "picker") renderPicker(); else if (state.screen === "custom") renderCustomExercise(); else if (state.screen === "entry") renderEntry(); else if (state.screen === "summary") renderSummary(); else if (state.screen === "watch") renderWatch(); else if (state.screen === "cloud") renderCloud(); else if (state.screen === "history") renderHistory(); else renderHome();
  const activeTrainingScreen = ["home", "picker", "custom", "entry"].includes(state.screen);
  quickFinish.classList.toggle("hidden", !activeTrainingScreen || !state.session.sets.length);
  tickTimer = setInterval(updateClocks, 1000); updateClocks();
}

function renderHome() {
  setScreenHeading("训练中", false); const summary = sessionSummary(state.session); const recentIds = [...new Set(state.session.sets.map((s) => s.exerciseId))].reverse(); const hasSessionData = summary.setCount > 0 || timerElapsedMs(state.session) > 0; const today = state.training.snapshot?.today; const historyCount = state.training.snapshot?.workoutHistory?.length || 0;
  app.innerHTML = `<section class="hero"><div class="hero-row"><div><div class="label">训练计时 · ${state.session.timer.running ? "进行中" : "已暂停"}</div><div class="timer" data-elapsed>${formatClock(elapsed())}</div></div><button class="timer-toggle ${state.session.timer.running ? "running" : ""}" id="sessionTimerToggle">${state.session.timer.running ? "Ⅱ 暂停" : "▶ 开始"}</button></div><div class="metrics"><div class="metric"><span class="label">动作</span><strong>${summary.exerciseCount}</strong></div><div class="metric"><span class="label">组数</span><strong>${summary.setCount}</strong></div><div class="metric"><span class="label">训练量</span><strong>${summary.volume}</strong><small>kg</small></div></div></section>
  ${today?.exercises?.length ? `<section class="today-plan"><div class="section-head"><div><span class="label">BODY.OS 今日推荐 · ${escapeHTML(today.readinessLabel || "已同步")}</span><h2>${escapeHTML(today.title || "今日训练计划")}</h2></div><button id="openTodayPlan">查看计划</button></div><div class="today-plan-list">${today.exercises.slice(0, 5).map((item) => `<span><strong>${escapeHTML(item.name || item.exerciseId)}</strong><small>${item.sets || "—"} 组${item.minReps || item.maxReps ? ` · ${item.minReps || "?"}–${item.maxReps || "?"} 次` : ""}</small></span>`).join("")}</div>${today.reasoning?.[0] ? `<p>${escapeHTML(today.reasoning[0])}</p>` : ""}</section>` : `<section class="sync-nudge"><strong>${state.training.busy ? "正在读取 Body.OS 推荐…" : "连接 Body.OS 训练数据"}</strong><span>${state.training.error ? escapeHTML(state.training.error) : "登录 Supabase 后可读取今日计划、最近参数和训练历史。"}</span><button id="openCloud">连接</button></section>`}
  <section class="section"><div class="section-head"><h2>${recentIds.length ? "继续记录" : "准备开始"}</h2><div class="section-actions"><button id="browseAll">动作库</button>${hasSessionData ? `<button class="danger-link ${state.resetArmed ? "armed" : ""}" id="resetSession">${state.resetArmed ? "确认重置" : "重置"}</button>` : ""}</div></div><div class="card-list">${recentIds.length ? recentIds.slice(0, 4).map((id) => exerciseCard(state.exercises.find((x) => x.id === id) || fromSet(id))).join("") : `<div class="empty">选择第一个标准动作。之后每组可一键复用上一组数据。</div>`}</div></section>`;
  bottomBar.innerHTML = `<button class="secondary" id="history">${historyCount ? `历史 ${historyCount}` : "训练历史"}</button><button class="secondary" id="finish" ${summary.setCount ? "" : "disabled"}>结束训练</button><button class="primary" id="choose">＋ 选择动作</button>`;
  $("#sessionTimerToggle").onclick = toggleSessionTimer; $("#choose").onclick = $("#browseAll").onclick = () => navigate("picker", { pickerPresetKey: "" }); $("#finish").onclick = finishSession; $("#history").onclick = () => state.training.snapshot ? navigate("history") : navigate("cloud"); $("#openTodayPlan")?.addEventListener("click", () => navigate("picker", { pickerPresetKey: "bodyos_today" })); $("#openCloud")?.addEventListener("click", () => navigate("cloud")); bindExerciseCards(); bindSessionManagement();
}

function fromSet(id) { const set = state.session.sets.find((x) => x.exerciseId === id); return { ...set, id, name: set.exerciseName }; }
function exerciseCard(exercise, prescribedSets = 0) { if (!exercise) return ""; const count = state.session.sets.filter((s) => canonicalExerciseId(s.exerciseId) === exercise.id).length; const reference = exercise.reference || {}; const wgerUrl = safeExternalUrl(reference.wger?.videoUrl || reference.wger?.pageUrl, "wger"); const prescription = prescribedSets ? ` · ${localeText(`计划 ${prescribedSets} 组`, `${prescribedSets} planned sets`)}` : ""; const card = `<button class="exercise-card ${reference.gifUrl ? "has-media" : ""}" data-exercise="${escapeHTML(exercise.id)}"><span class="exercise-icon">${exerciseIcon(exercise)}</span><span>${exerciseLabel(exercise)}<small>${escapeHTML(exercise.equipment || localeText("标准动作", "Standard"))} · ${LOAD_LABELS[exercise.loadMode] || localeText("重量", "Load")}${prescription}${count ? ` · ${count} ${localeText("已完成组", "completed sets")}` : ""}</small>${reference.datasetId ? `<em class="reference-match">dataset ${escapeHTML(reference.datasetId)}${reference.wger ? ` · wger ${reference.wger.matchType === "exact" ? localeText("已匹配", "matched") : localeText("通用参考", "reference")}` : ""}</em>` : ""}</span><span class="chevron">›</span></button>`; const external = wgerUrl ? `<a class="exercise-reference-link" href="${escapeHTML(wgerUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${escapeHTML(localeText(`在 wger 查看 ${exercise.name}`, `View ${exercise.canonicalNameEn || exercise.name} on wger`))}">↗</a>` : ""; return `<div class="exercise-card-wrap">${card}${external}${count ? `<button class="exercise-delete" data-delete-exercise="${escapeHTML(exercise.id)}" aria-label="删除 ${escapeHTML(exercise.name)}">×</button>` : ""}</div>`; }
function bindExerciseCards() { document.querySelectorAll("[data-exercise]").forEach((button) => button.onclick = () => openExercise(button.dataset.exercise)); }

function renderPicker() {
  setScreenHeading(localeText("选择动作", "Choose exercise"));
  app.innerHTML = `<div class="picker-actions"><input class="search" id="search" type="search" placeholder="${localeText("搜索动作、器械或英文名", "Search exercise, equipment or Chinese name")}" autocomplete="off" aria-label="搜索动作"><button class="custom-action" id="addCustom">＋ ${localeText("自定义", "Custom")}</button></div><section class="category-guide"><div class="section-head"><h2>${localeText("按部位或完整组合选择", "Browse by body part or preset")}</h2><span class="label">${localeText("休息日自由安排", "Flexible rest days")}</span></div><div class="chip-row"><button class="chip active" data-filter="">${localeText("全部", "All")}</button><button class="chip" data-filter="chest">${localeText("胸", "Chest")}</button><button class="chip" data-filter="back">${localeText("背", "Back")}</button><button class="chip" data-filter="shoulders">${localeText("肩", "Shoulders")}</button><button class="chip" data-filter="core">${localeText("核心", "Core")}</button><button class="chip" data-filter="cardio">${localeText("有氧", "Cardio")}</button><button class="chip" data-filter="arms">${localeText("手臂", "Arms")}</button><button class="chip" data-filter="legs">${localeText("腿（暂停）", "Legs (paused)")}</button></div></section><section class="preset-guide" id="presetGuide"></section><div class="card-list" id="exerciseList"></div><aside class="source-policy"><strong>${localeText("来源与隐私", "Sources & privacy")}</strong><span>${localeText("动图仅远程引用 exercise dataset；动作详情仅显示 wger 内容。训练数据保存在此浏览器的 IndexedDB，不会自动上传。", "Animations are remote exercise-dataset references; guides come only from wger. Workout data stays in this browser's IndexedDB unless you export it.")}</span></aside>`;
  const list = $("#exerciseList"), search = $("#search"), guide = $("#presetGuide");
  const today = state.training.snapshot?.today;
  const remotePreset = today?.exercises?.length ? { key: "bodyos_today", group: "", title: today.title || "Body.OS 今日推荐", titleEn: "Body.OS plan for today", note: `${today.exercises.reduce((sum, item) => sum + Number(item.sets || 0), 0)} 组 · ${today.readinessLabel || "已同步"}`, ids: today.exercises.map((item) => canonicalExerciseId(item.exerciseId)), sets: Object.fromEntries(today.exercises.map((item) => [canonicalExerciseId(item.exerciseId), Number(item.sets || 0)])) } : null;
  const presets = remotePreset ? [remotePreset, ...TRAINING_PRESETS] : TRAINING_PRESETS;
  let filter = "", activePresetKey = state.pickerPresetKey || "";
  const update = () => {
    const relevant = presets.filter((preset) => preset.key === "bodyos_today" || !filter || preset.group === filter);
    guide.innerHTML = relevant.length ? `<div class="section-head"><h2>${localeText("推荐完整组合", "Recommended presets")}</h2><span class="label">${localeText("点击后只看该组合动作", "Tap to filter the preset")}</span></div><div class="preset-row">${relevant.map((preset) => `<button class="preset-card ${activePresetKey === preset.key ? "active" : ""}" data-preset="${preset.key}"><strong>${localeText(preset.title, preset.titleEn || preset.title)}</strong><small>${localeText(preset.note, preset.noteEn || preset.note)}</small><em>${preset.ids.length} ${localeText("个动作", "exercises")}</em></button>`).join("")}</div>` : "";
    guide.querySelectorAll("[data-preset]").forEach((button) => button.onclick = () => { const preset = presets.find((item) => item.key === button.dataset.preset); activePresetKey = activePresetKey === preset?.key ? "" : (preset?.key || ""); state.pickerPresetKey = activePresetKey; if (preset?.group) { filter = preset.group; document.querySelectorAll("[data-filter]").forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === filter)); } update(); });
    const preset = presets.find((item) => item.key === activePresetKey), allowedIds = preset ? new Set(preset.ids) : null;
    const term = search.value.trim().toLowerCase(), words = term.split(/\s+/).filter(Boolean);
    const matches = state.exercises.filter((x) => (allowedIds ? allowedIds.has(x.id) : (!filter || exerciseCategory(x) === filter)) && words.every((word) => `${x.name} ${x.canonicalNameEn || ""} ${x.equipment || ""} ${x.movementPattern || ""}`.toLowerCase().includes(word)));
    if (preset) matches.sort((left, right) => preset.ids.indexOf(left.id) - preset.ids.indexOf(right.id));
    list.innerHTML = matches.map((exercise) => exerciseCard(exercise, preset?.sets?.[exercise.id] || 0)).join("") || `<div class="empty">这个分类下没有找到动作，试试搜索或“全部”。</div>`; bindExerciseCards(); bindSessionManagement();
  };
  search.oninput = update; document.querySelectorAll("[data-filter]").forEach((chip) => chip.onclick = () => { document.querySelectorAll("[data-filter]").forEach((x) => x.classList.remove("active")); chip.classList.add("active"); filter = chip.dataset.filter; activePresetKey = ""; state.pickerPresetKey = ""; update(); }); $("#addCustom").onclick = () => navigate("custom"); update(); if (!activePresetKey) setTimeout(() => search.focus(), 50);
}

function renderCustomExercise() {
  setScreenHeading(localeText("自定义动作", "Custom exercise"));
  app.innerHTML = `<section class="hero"><div class="label">${localeText("加入你的离线动作库", "Add to your offline library")}</div><p class="muted">${localeText("自定义动作仅保存在这台设备；中英文名称都会写入导出数据。", "Custom exercises stay on this device; both names are exported.")}</p></section><form id="customExerciseForm" class="section custom-form"><div class="field"><label for="customZh">${localeText("中文名称", "Chinese name")}</label><input id="customZh" required maxlength="80" placeholder="例如：单臂地雷管划船"></div><div class="field"><label for="customEn">${localeText("英文名称（可选）", "English name (optional)")}</label><input id="customEn" maxlength="120" placeholder="e.g. One-Arm Landmine Row"></div><div class="field"><label for="customEquipment">${localeText("器械（可选）", "Equipment (optional)")}</label><input id="customEquipment" maxlength="80" placeholder="${localeText("例如：杠铃", "e.g. Barbell")}"></div><div class="field"><label for="customPattern">${localeText("动作模式", "Movement pattern")}</label><select id="customPattern"><option value="other">${localeText("其他", "Other")}</option><option value="horizontal_push">${localeText("水平推", "Horizontal push")}</option><option value="horizontal_pull">${localeText("水平拉", "Horizontal pull")}</option><option value="vertical_push">${localeText("垂直推", "Vertical push")}</option><option value="vertical_pull">${localeText("垂直拉", "Vertical pull")}</option><option value="squat">${localeText("深蹲", "Squat")}</option><option value="hinge">${localeText("髋铰链", "Hinge")}</option></select></div></form>`;
  bottomBar.innerHTML = `<button class="secondary" id="cancelCustom">${localeText("取消", "Cancel")}</button><button class="primary" id="saveCustom">${localeText("保存并开始", "Save & start")}</button>`;
  $("#cancelCustom").onclick = () => navigate("picker"); $("#saveCustom").onclick = async () => {
    const name = $("#customZh").value.trim(), canonicalNameEn = $("#customEn").value.trim() || name;
    if (!name) return $("#customZh").focus();
    const exercise = { id: `custom_${Date.now().toString(36)}`, name, canonicalNameEn, equipment: $("#customEquipment").value.trim(), movementPattern: $("#customPattern").value, loadMode: "total", executionMode: "bilateral", sideCount: 1, isCustom: true };
    state.exercises.push(exercise); await DB.set("exercise-library", state.exercises); showToast(localeText("已加入自定义动作", "Custom exercise added")); openExercise(exercise.id);
  };
}

function openExercise(id) {
  const exercise = state.exercises.find((x) => x.id === id) || fromSet(id); const previous = [...state.session.sets].reverse().find((x) => x.exerciseId === id);
  const grip = inferredGrip(exercise);
  const cached = lookupExerciseDefault(state.training.snapshot?.exerciseDefaults, id);
  state.editingSetIndex = -1; state.session.currentExerciseId = id; state.draft = previous
    ? nextSetDraft({ ...previous, reference: exercise.reference, restSeconds: defaultRest(previous) })
    : normalizeSet({ ...draftFromExerciseDefault(exercise, cached), reference: exercise.reference, ...(!cached ? grip : {}) });
  navigate("entry");
  refreshTrainingSnapshotForExercise();
}
function defaultRest() { return DEFAULT_REST_SECONDS; }

function editSessionSet(index) {
  const set = state.session.sets[index];
  if (!set) return;
  const exercise = state.exercises.find((item) => item.id === set.exerciseId) || fromSet(set.exerciseId);
  state.editingSetIndex = index;
  state.draft = normalizeSet({ ...set, reference: exercise.reference });
  navigate("entry");
}

function renderEntry() {
  const d = state.draft, count = state.session.sets.filter((s) => s.exerciseId === d.exerciseId).length, last = [...state.session.sets].reverse().find((s) => s.exerciseId === d.exerciseId);
  const cached = !last ? lookupExerciseDefault(state.training.snapshot?.exerciseDefaults, d.exerciseId) : null;
  const prescription = state.training.snapshot?.today?.exercises?.find((item) => canonicalExerciseId(item.exerciseId) === canonicalExerciseId(d.exerciseId));
  const editing = Number.isInteger(state.editingSetIndex) && state.editingSetIndex >= 0;
  const unit = d.weightUnit === "lb" ? "lb" : "kg", step = unit === "lb" ? 5 : 2.5;
  const reference = d.reference || {}, description = state.locale === "en" ? reference.wger?.descriptionEn : (reference.wger?.descriptionZh || reference.wger?.descriptionEn), wgerUrl = safeExternalUrl(reference.wger?.videoUrl || reference.wger?.pageUrl, "wger"), license = reference.wger?.translationLicenseZh?.short_name || reference.wger?.translationLicenseEn?.short_name || reference.wger?.license?.short_name || "";
  const referencePanel = reference.datasetId ? `<details class="exercise-reference-panel"><summary>${localeText("动作资料与来源", "Exercise guide & sources")}</summary><div>${description ? `<p>${escapeHTML(description)}</p>` : `<p class="muted">${localeText("wger 详情尚未同步；这里不会用 dataset 文案代替。", "wger details are pending; dataset text is not used as a substitute.")}</p>`}<small>${localeText("动图", "Animation")}：exercise dataset ${escapeHTML(reference.datasetId)} · ${localeText("详情", "Guide")}：${reference.wger ? `wger ${reference.wger.matchType === "exact" ? localeText("已匹配", "matched") : localeText("通用参考", "reference")}` : localeText("待同步", "pending")}${license ? ` · ${escapeHTML(license)}` : ""}${reference.wger?.author ? ` · ${escapeHTML(reference.wger.author)}` : ""}</small>${wgerUrl ? `<a href="${escapeHTML(wgerUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${localeText("在 wger 查看", "View on wger")} ↗</a>` : ""}</div></details>` : "";
  const recordingMode = recordingModeForSet(d);
  setScreenHeading(editing ? localeText("编辑历史组", "Edit saved set") : (state.locale === "en" ? (d.canonicalNameEn || d.exerciseName) : d.exerciseName)); app.innerHTML = `${editing ? `<section class="section edit-exercise-field"><div class="field"><label for="editExercise">${localeText("修改动作", "Change exercise")}</label><select id="editExercise">${state.exercises.map((exercise) => `<option value="${escapeHTML(exercise.id)}" ${exercise.id === d.exerciseId ? "selected" : ""}>${escapeHTML(state.locale === "en" ? (exercise.canonicalNameEn || exercise.name) : exercise.name)}</option>`).join("")}</select></div></section>` : ""}<section class="hero"><div class="entry-title"><span class="exercise-icon">${exerciseIcon(d)}</span><div><div class="label">${editing ? localeText("正在修改已保存记录", "Editing saved record") : localeText(`第 ${count + 1} 组`, `Set ${count + 1}`)}</div>${exerciseLabel(d)}<div class="muted">${escapeHTML(d.equipment || localeText("标准动作", "Standard"))}</div></div></div><div class="semantic"><span>${localeText("本组记录方式", "Set recording mode")}</span><select id="recordingMode" aria-label="本组记录方式">${Object.entries(RECORDING_MODE_LABELS).map(([value,label]) => `<option value="${value}" ${recordingMode === value ? "selected" : ""}>${label}</option>`).join("")}</select></div></section>${referencePanel}
  <div class="session-timer-strip"><span><small>训练计时</small><strong data-elapsed>${formatClock(elapsed())}</strong></span><button id="entryTimerToggle">${state.session.timer.running ? "暂停" : "开始"}</button></div>
  ${restMarkup()}
  ${last ? `<div class="last-set">${localeText("上一组", "Previous set")}：${last.weightValue}${last.weightUnit} × ${last.reps} ${localeText("次", "reps")}${last.rir != null ? ` · RIR ${last.rir}` : ""}</div>` : cached ? `<div class="last-set cached-default"><strong>已带入最近训练参数</strong><span>${new Intl.DateTimeFormat("zh-CN",{month:"numeric",day:"numeric"}).format(new Date(cached.usedAt))} · ${cached.setCount} 组 · 最近最大 ${cached.weightValue}${cached.weightUnit} × ${cached.reps}</span></div>` : ""}${prescription ? `<div class="prescription-note">今日计划：${prescription.sets || "—"} 组${prescription.minReps || prescription.maxReps ? ` · ${prescription.minReps || "?"}–${prescription.maxReps || "?"} 次` : ""}${prescription.targetRpe ? ` · RPE ${prescription.targetRpe}` : ""}</div>` : ""}${liftProgressPanel(d.exerciseId)}${setPreviewMarkup(count, last)}
  <div class="step-grid"><div class="stepper"><div class="row"><div class="label">${RECORDING_MODE_LABELS[recordingMode]}</div><div class="unit-switch" aria-label="重量单位"><button class="${unit === "kg" ? "active" : ""}" data-unit="kg">kg</button><button class="${unit === "lb" ? "active" : ""}" data-unit="lb">lb <small>磅</small></button></div></div><div class="stepper-controls"><button data-step="weight" data-delta="-${step}" aria-label="减少重量">−</button><input id="weight" class="number-input" type="number" inputmode="decimal" min="0" step="${step}" value="${d.weightValue}" aria-label="重量，点击数字可直接输入"><button data-step="weight" data-delta="${step}" aria-label="增加重量">＋</button></div><div class="direct-input-hint">点击数字可直接输入 · ${unit === "lb" ? "当前单位：磅" : "可切换 lb（磅）"}${d.sideCount === 2 && ["per_limb","per_side"].includes(d.loadMode) ? ` · 总负荷 ${d.weightValue * 2} ${unit}` : ""}</div></div><div class="stepper"><div class="label">次数</div><div class="stepper-controls"><button data-step="reps" data-delta="-1" aria-label="减少次数">−</button><input id="reps" class="number-input" type="number" inputmode="numeric" min="0" step="1" value="${d.reps}" aria-label="次数，点击数字可直接输入"><button data-step="reps" data-delta="1" aria-label="增加次数">＋</button></div><div class="direct-input-hint">点击数字可直接输入</div></div></div>
  <section class="section"><div class="section-head"><h2>RIR</h2><span class="label">还能完成几次</span></div><div class="rir-grid">${[null,0,1,2,3,4,5].map((v) => `<button class="chip ${d.rir === v ? "active" : ""}" data-rir="${v == null ? "" : v}">${v == null ? "未记" : v}</button>`).join("")}</div></section>
  ${gripMarkup(d)}
  <details class="exercise-history"><summary>${localeText(`本动作已完成 ${count} 组`, `${count} completed sets for this exercise`)}</summary><div class="exercise-history-body">${count ? state.session.sets.filter((set) => set.exerciseId === d.exerciseId).map((set, index) => `<div><span>${index + 1}</span><strong>${set.weightValue}${set.weightUnit} × ${set.reps}</strong><small>${set.rir != null ? `RIR ${set.rir}` : ""}</small></div>`).join("") : `<small>${localeText("保存第一组后会显示在这里。", "Save the first set to see it here.")}</small>`}</div></details>
  <details class="detail-panel"><summary>扩展数据与备注</summary><div class="detail-body"><div class="field"><label for="rest">目标休息（秒，保存后自动开始）</label><input id="rest" type="number" inputmode="numeric" min="0" max="7200" value="${d.restSeconds ?? DEFAULT_REST_SECONDS}"></div><div class="field"><label for="rpe">RPE（1–10）</label><input id="rpe" type="number" inputmode="decimal" min="1" max="10" step="0.5" value="${d.rpe ?? ""}"></div><div class="field"><label for="rer">RER（0.5–2）</label><input id="rer" type="number" inputmode="decimal" min="0.5" max="2" step="0.1" value="${d.rer ?? ""}"></div><div class="field"><label for="notes">备注 / 疼痛反馈</label><textarea id="notes" maxlength="1000" placeholder="例如：左肩刺痛，动作控制良好">${escapeHTML(d.notes)}</textarea></div></div></details>`;
  bottomBar.innerHTML = `<button class="secondary" id="switchExercise">${editing ? localeText("取消", "Cancel") : localeText("切换动作", "Switch exercise")}</button><button class="primary" id="save">${editing ? localeText("保存修改", "Save changes") : last ? `复用并保存第 ${count + 1} 组` : "保存第 1 组"}</button>`;
  bindEntry();
  const panel = document.querySelector(".lift-progress");
  if (panel) bindLiftProgressControls(panel, d.exerciseId);
  syncLiftSheet(d.exerciseId);
}

function restMarkup() { const rest = state.session.rest; if (!rest) return ""; return `<section class="rest-card"><div class="row"><div><div class="label">休息计时 · ${rest.running ? "进行中" : "已暂停"}</div><div class="rest-time" data-rest>${formatClock(restRemainingSeconds(rest))}</div></div><span>${rest.running ? "自动倒计时" : "已暂停"}</span></div><div class="rest-actions"><button id="restSkip">跳过</button><button id="restSubtract">−30 秒</button><button id="restAdd">+30 秒</button><button id="restToggle">${rest.running ? "暂停" : "▶ 开始"}</button></div></section>`; }
function bindEntry() {
  $("#entryTimerToggle")?.addEventListener("click", toggleSessionTimer);
  $("#recordingMode").onchange = (e) => { state.draft = applyRecordingMode(state.draft, e.target.value); renderEntry(); };
  $("#editExercise")?.addEventListener("change", (event) => { const exercise = state.exercises.find((item) => item.id === event.target.value); if (!exercise) return; const unilateral = exercise.loadMode === "per_limb" && exercise.executionMode === "unilateral"; state.draft = normalizeSet({ ...state.draft, exerciseId: exercise.id, exerciseName: exercise.name, canonicalNameEn: exercise.canonicalNameEn, equipment: exercise.equipment, movementPattern: exercise.movementPattern, loadMode: exercise.loadMode, executionMode: exercise.executionMode, sideCount: exercise.sideCount, side: unilateral ? "right" : "both", reference: exercise.reference, ...inferredGrip(exercise) }); renderEntry(); });
  document.querySelectorAll("[data-step]").forEach((button) => button.onclick = () => { const input = button.dataset.step === "weight" ? $("#weight") : $("#reps"); input.value = Math.max(0, Number(input.value || 0) + Number(button.dataset.delta)); input.dispatchEvent(new Event("input")); });
  $("#weight").onfocus = $("#reps").onfocus = (event) => event.target.select();
  $("#weight").oninput = (e) => state.draft.weightValue = Math.max(0, Number(e.target.value || 0)); $("#reps").oninput = (e) => state.draft.reps = Math.max(0, Math.round(Number(e.target.value || 0)));
  document.querySelectorAll("[data-unit]").forEach((button) => button.onclick = () => {
    state.draft = changeWeightUnit(state.draft, button.dataset.unit);
    renderEntry();
  });
  document.querySelectorAll("[data-rir]").forEach((button) => button.onclick = () => { state.draft.rir = button.dataset.rir === "" ? null : Number(button.dataset.rir); renderEntry(); });
  document.querySelectorAll("[data-grip-width]").forEach((button) => button.onclick = () => { state.draft.gripWidth = button.dataset.gripWidth; renderEntry(); });
  document.querySelectorAll("[data-grip-orientation]").forEach((button) => button.onclick = () => { state.draft.gripOrientation = button.dataset.gripOrientation; renderEntry(); });
  $("#save")?.addEventListener("click", saveSet);
  $("#switchExercise")?.addEventListener("click", async () => { if (state.editingSetIndex >= 0) { state.editingSetIndex = -1; state.draft = null; navigate("summary"); return; } await persist(); navigate("picker"); });
  document.querySelectorAll("[data-session-exercise]").forEach((button) => button.onclick = () => openExercise(button.dataset.sessionExercise));
  $("#restSkip")?.addEventListener("click", () => { state.session.rest = null; persist(); renderEntry(); });
  $("#restSubtract")?.addEventListener("click", async () => { state.session.rest = adjustRest(state.session.rest, -30); await persist(); renderEntry(); });
  $("#restAdd")?.addEventListener("click", async () => { state.session.rest = adjustRest(state.session.rest, 30); await persist(); renderEntry(); });
  $("#restToggle")?.addEventListener("click", async () => { const rest = state.session.rest, remaining = restRemainingSeconds(rest); if (rest.running) { rest.remainingSeconds = remaining; rest.running = false; rest.endsAt = null; } else if (remaining > 0) { rest.running = true; rest.endsAt = Date.now() + remaining * 1000; } await persist(); renderEntry(); });
  bindSessionManagement();
}

async function saveSet() {
  const extras = { restSeconds: Number($("#rest")?.value ?? state.draft.restSeconds ?? DEFAULT_REST_SECONDS), rpe: $("#rpe")?.value ?? state.draft.rpe, rer: $("#rer")?.value ?? state.draft.rer, notes: $("#notes")?.value ?? state.draft.notes };
  const original = state.session.sets[state.editingSetIndex];
  const set = normalizeSet({ ...state.draft, ...extras, id: original?.id || `qset_${Date.now().toString(36)}`, completedAt: original?.completedAt || new Date().toISOString() });
  if (set.reps < 1) return showToast("次数至少为 1");
  if (original) {
    state.session.sets[state.editingSetIndex] = set;
    state.session.sync = { ...state.session.sync, supabaseDirty: Boolean(state.session.sync?.supabaseId) };
    state.editingSetIndex = -1; state.draft = null;
    await persist(); navigator.vibrate?.(35); navigate("summary"); showToast("历史记录已修改；可重新上传以更新 Supabase"); return;
  }
  state.session.sets.push(set); state.session.rest = createRunningRest(set.restSeconds || DEFAULT_REST_SECONDS); state.draft = nextSetDraft(set);
  await persist(); navigator.vibrate?.(35); showToast(`第 ${state.session.sets.filter((s) => s.exerciseId === set.exerciseId).length} 组已保存 · 已自动开始 ${formatClock(set.restSeconds || DEFAULT_REST_SECONDS)} 休息`); renderEntry();
}

function updateClocks() {
  document.querySelectorAll("[data-elapsed]").forEach((node) => node.textContent = formatClock(elapsed()));
  document.querySelectorAll("[data-rest]").forEach((node) => { const seconds = restRemainingSeconds(state.session.rest); node.textContent = formatClock(seconds); if (!seconds && state.session.rest?.running) { state.session.rest = null; navigator.vibrate?.([120,80,120]); persist(); showToast("休息结束，可以开始下一组"); render(); } });
}

async function finishSession() { if (state.session.timer.running) { state.session.timer.elapsedMs = timerElapsedMs(state.session); state.session.timer.running = false; state.session.timer.startedAtMs = null; } state.session.endedAt = new Date().toISOString(); state.session.rest = null; await persist(); await loadWatchCandidates(); navigate("summary"); }
async function loadWatchCandidates() { try { const params = new URLSearchParams({ started_at: state.session.startedAt, ended_at: state.session.endedAt || new Date().toISOString() }); const response = await fetch(`/api/workout-capture/match-candidates?${params}`); if (!response.ok) throw new Error(); const data = await response.json(); state.watchCandidates = data.candidates || []; const selected = decisiveWatchCandidate(state.watchCandidates); state.selectedWatch = selected?.workoutId || ""; } catch { state.watchCandidates = []; state.selectedWatch = ""; } }

function cloudAccountLabel() {
  return state.cloud.session?.user?.email || state.cloud.session?.user?.id || "尚未登录";
}

async function ensureCloudSession() {
  if (!state.cloud.config) throw new Error("请先配置 Supabase");
  if (sessionIsFresh(state.cloud.session)) return state.cloud.session;
  state.cloud.session = await refreshSession(state.cloud.config, state.cloud.session?.refresh_token);
  await DB.set("supabase-session", state.cloud.session);
  return state.cloud.session;
}

async function loadTrainingSnapshot({ quiet = false } = {}) {
  if (!navigator.onLine) return state.training.snapshot;
  if (trainingSnapshotTask) return trainingSnapshotTask;
  trainingSnapshotTask = (async () => {
    state.training.busy = true; state.training.error = "";
    if (!quiet && SNAPSHOT_SCREENS.includes(state.screen)) render();
    try {
      let snapshot = null;
      if (canDirectBodyOs) {
        const response = await fetch("/api/training/pages-snapshot");
        if (!response.ok) throw new Error("Body.OS 训练快照读取失败");
        snapshot = await response.json();
      } else {
        if (!state.cloud.config || !state.cloud.session) throw new Error("登录 Supabase 后即可同步训练数据");
        const session = await ensureCloudSession();
        snapshot = await fetchTrainingSnapshot(state.cloud.config, session);
        if (!snapshot) throw new Error("云端还没有训练快照；请先启动一次本地 Body.OS");
      }
      state.training.snapshot = snapshot;
      await DB.set("training-snapshot", snapshot);
      state.training.error = "";
    } catch (error) {
      state.training.error = error.message || "训练数据同步失败";
    }
    state.training.busy = false;
    if (!quiet && SNAPSHOT_SCREENS.includes(state.screen)) render();
    return state.training.snapshot;
  })();
  try { return await trainingSnapshotTask; }
  finally { trainingSnapshotTask = null; }
}

function refreshTrainingSnapshotForExercise() {
  if (!navigator.onLine) return;
  if (!(canDirectBodyOs || (state.cloud.config && state.cloud.session))) return;
  loadTrainingSnapshot();
}

async function syncCurrentWorkoutToCloud() {
  if (!navigator.onLine) return showToast("当前离线，训练仍安全保存在本机");
  if (!state.cloud.config || !state.cloud.session) return navigate("cloud");
  state.cloud.busy = true; renderSummary();
  try {
    const session = await ensureCloudSession();
    const rows = await uploadWorkout(state.cloud.config, session, createExport(state.session));
    const remote = Array.isArray(rows) ? rows[0] : rows;
    state.session.sync = { ...state.session.sync, supabaseId: remote?.id || state.session.sync.supabaseId || "uploaded", supabaseUploadedAt: new Date().toISOString(), supabaseDirty: false };
    await persist(); showToast("已安全上传到 Supabase，Body.OS 将自动读取");
  } catch (error) { showToast(error.message || "Supabase 上传失败"); }
  state.cloud.busy = false; renderSummary();
}

function renderCloud() {
  setScreenHeading("Supabase 云端同步");
  const configured = Boolean(state.cloud.config), signedIn = Boolean(state.cloud.session?.refresh_token);
  app.innerHTML = `<section class="hero cloud-hero"><div class="label">受保护的云端通道</div><h2>${signedIn ? "已连接" : configured ? "项目已配置" : "连接 Supabase"}</h2><p class="muted">公开网页只保存公开的 anon key。写入必须通过你的 Supabase Auth 登录，并同时通过数据库用户 allowlist 与 owner_id = auth.uid() 两层 RLS 检查。</p></section>
  <section class="section"><div class="section-head"><h2>项目配置</h2><span class="label">保存在此浏览器</span></div><form id="cloudConfigForm" class="cloud-form"><label>Project URL<input id="cloudUrl" type="url" required autocomplete="url" placeholder="https://xxxx.supabase.co" value="${escapeHTML(state.cloud.config?.url || "")}"></label><label>Publishable / anon key<input id="cloudAnonKey" type="password" required autocomplete="off" placeholder="sb_publishable_… 或 anon JWT" value="${escapeHTML(state.cloud.config?.anonKey || "")}"></label><button class="secondary" type="submit">保存项目配置</button></form></section>
  <section class="section"><div class="section-head"><h2>身份验证</h2><span class="label">${escapeHTML(cloudAccountLabel())}</span></div>${signedIn ? `<div class="cloud-signed-in"><p>登录会话保存在此浏览器；原始密码从不保存。</p><div class="cloud-snapshot-state"><strong>${state.training.snapshot ? `已读取 ${state.training.snapshot.workoutHistory?.length || 0} 次历史训练` : "尚未读取 Body.OS 训练快照"}</strong><small>${state.training.error ? escapeHTML(state.training.error) : state.training.snapshot?.generatedAt ? `更新于 ${new Intl.DateTimeFormat("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(state.training.snapshot.generatedAt))}` : "本地 Body.OS 启动后会自动发布"}</small><button class="secondary" id="cloudRefresh" type="button">${state.training.busy ? "同步中…" : "立即同步"}</button></div><button class="danger-link" id="cloudSignOut" type="button">退出登录并清除会话</button></div>` : `<form id="cloudLoginForm" class="cloud-form"><label>邮箱<input id="cloudEmail" type="email" required autocomplete="username"></label><label>密码<input id="cloudPassword" type="password" required autocomplete="current-password"></label><button class="primary" type="submit" ${configured ? "" : "disabled"}>登录 Supabase</button></form>`}</section>
  <section class="source-policy"><strong>数据库仍需启用 RLS</strong><span>请先执行仓库 supabase/schema.sql。建议在 Supabase 关闭公开注册，仅在 Dashboard 创建你自己的账号。</span></section>`;
  bottomBar.innerHTML = `<button class="secondary" id="cloudBack">返回训练总结</button>${signedIn ? `<button class="primary" id="cloudUpload" ${state.cloud.busy ? "disabled" : ""}>${state.cloud.busy ? "上传中…" : "上传本次训练"}</button>` : ""}`;
  $("#cloudBack").onclick = () => history.back();
  $("#cloudConfigForm").onsubmit = async (event) => { event.preventDefault(); try { state.cloud.config = normalizeSupabaseConfig({ url: $("#cloudUrl").value, anonKey: $("#cloudAnonKey").value }); state.cloud.session = null; await DB.set("supabase-config", state.cloud.config); await DB.set("supabase-session", null); showToast("Supabase 项目配置已保存"); renderCloud(); } catch (error) { showToast(error.message); } };
  if ($("#cloudLoginForm")) $("#cloudLoginForm").onsubmit = async (event) => { event.preventDefault(); state.cloud.busy = true; try { state.cloud.session = await signInWithPassword(state.cloud.config, $("#cloudEmail").value, $("#cloudPassword").value); await DB.set("supabase-session", state.cloud.session); state.cloud.busy = false; showToast("Supabase 登录成功"); await loadTrainingSnapshot(); } catch (error) { state.cloud.busy = false; showToast(error.message || "登录失败"); } };
  $("#cloudRefresh")?.addEventListener("click", () => loadTrainingSnapshot());
  $("#cloudSignOut")?.addEventListener("click", async () => { state.cloud.session = null; state.training.snapshot = null; await DB.set("supabase-session", null); await DB.set("training-snapshot", null); showToast("本机登录会话与训练快照已清除"); renderCloud(); });
  $("#cloudUpload")?.addEventListener("click", syncCurrentWorkoutToCloud);
}

function signedDelta(value, suffix = "") {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${Math.round(number * 10) / 10}${suffix}`;
}

function previousComparableWorkout(history, index) {
  const currentIds = new Set((history[index]?.exercises || []).map((item) => item.exerciseId));
  return history.slice(index + 1).find((item) => (item.exercises || []).some((exercise) => currentIds.has(exercise.exerciseId))) || history[index + 1] || null;
}

function exerciseHistoryGroups(history) {
  const groups = new Map();
  history.forEach((workout) => (workout.exercises || []).forEach((exercise) => {
    const id = resolveCatalogExerciseId(exercise);
    if (!id || !(exercise.sets || []).length) return;
    const group = groups.get(id) || { id, name: exercise.name || id, records: [], sets: 0, reps: 0, volume: 0 };
    const sets = exercise.sets || [];
    const record = {
      workoutId: workout.id, startedAt: workout.startedAt, activityType: workout.activityType,
      sets, setCount: sets.length,
      reps: sets.reduce((sum, set) => sum + Number(set.reps || 0), 0),
      volume: sets.reduce((sum, set) => sum + Number(set.calculated_volume || 0), 0),
    };
    group.records.push(record); group.sets += record.setCount; group.reps += record.reps; group.volume += record.volume;
    groups.set(id, group);
  }));
  return [...groups.values()].sort((a, b) => new Date(b.records[0].startedAt) - new Date(a.records[0].startedAt));
}


function liftDisplayedPoints(exerciseId) {
  const series = progressSeriesForExercise(state.training.snapshot, canonicalExerciseId(exerciseId));
  return { series, points: aggregateLiftPoints(series.points, state.liftGrain || "session") };
}

function positionLiftTooltip(root, svg, xViewBox) {
  const tooltip = root.querySelector(".lift-tooltip");
  const plot = root.querySelector(".lift-plot") || root;
  if (!tooltip || !svg) return;
  tooltip.hidden = false;
  const box = svg.getBoundingClientRect();
  const plotBox = plot.getBoundingClientRect();
  const width = Number(svg.viewBox.baseVal.width || 640);
  const x = (xViewBox / width) * box.width + (box.left - plotBox.left);
  const tipW = Math.min(tooltip.offsetWidth || 240, plotBox.width - 16);
  const placeRight = x + 16 + tipW <= plotBox.width - 8;
  tooltip.style.left = `${placeRight ? Math.min(x + 14, plotBox.width - tipW - 8) : Math.max(8, x - tipW - 14)}px`;
  tooltip.style.top = "10px";
}

function bindLiftChart(root, points) {
  const svg = root.querySelector("[data-lift-svg]");
  if (!svg || !points.length) return;
  const grain = state.liftGrain || "session";
  const unit = state.liftUnit || "kg";
  const apply = (index) => {
    state.liftScrubIndex = Math.max(0, Math.min(points.length - 1, index));
    const point = points[state.liftScrubIndex];
    const tooltip = root.querySelector(".lift-tooltip");
    if (tooltip) tooltip.innerHTML = liftPointDetailMarkup(point, { unit, grain, escapeHTML });
    const width = Number(svg.viewBox.baseVal.width || 640);
    const padL = Number(svg.dataset.padL || 46);
    const padR = Number(svg.dataset.padR || 40);
    const x = padL + (points.length === 1 ? (width - padL - padR) / 2 : state.liftScrubIndex * (width - padL - padR) / (points.length - 1));
    const line = svg.querySelector(".lift-scrub");
    if (line) { line.setAttribute("x1", x.toFixed(1)); line.setAttribute("x2", x.toFixed(1)); }
    svg.querySelectorAll(".lift-dot").forEach((circle) => {
      const active = Number(circle.dataset.liftIndex) === state.liftScrubIndex;
      circle.classList.toggle("is-active", active);
      circle.setAttribute("r", active ? "6.5" : "4.5");
    });
    positionLiftTooltip(root, svg, x);
  };
  const pick = (event) => {
    const box = svg.getBoundingClientRect();
    const padL = Number(svg.dataset.padL || 46);
    const padR = Number(svg.dataset.padR || 40);
    const width = Number(svg.viewBox.baseVal.width || 640);
    const scale = box.width / width;
    const left = box.left + padL * scale;
    const inner = Math.max(box.width - (padL + padR) * scale, 1);
    const ratio = (event.clientX - left) / inner;
    apply(Math.round(Math.max(0, Math.min(1, ratio)) * (points.length - 1)));
  };
  let dragging = false;
  svg.addEventListener("pointerdown", (event) => {
    dragging = event.pointerType !== "mouse";
    svg.setPointerCapture(event.pointerId);
    pick(event);
    if (event.pointerType !== "mouse") event.preventDefault();
  });
  svg.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" || dragging) pick(event);
  });
  svg.addEventListener("pointerup", () => { dragging = false; });
  svg.addEventListener("pointercancel", () => { dragging = false; });
  svg.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return;
    dragging = false;
    const tooltip = root.querySelector(".lift-tooltip");
    if (tooltip) tooltip.hidden = true;
  });
}

function liftProgressPanel(exerciseId, large = false) {
  const { series, points } = liftDisplayedPoints(exerciseId);
  const unit = state.liftUnit || "kg";
  const grain = state.liftGrain || "session";
  const deltas = lookbackLiftDeltas(series.points);
  const label = (key, title) => {
    const item = deltas[key];
    if (!item) return "";
    const shown = displayLiftKg(item.deltaWeightKg, unit);
    const sign = shown > 0 ? "+" : "";
    return `<article><small>${title}</small><strong>${sign}${shown} ${unit}</strong></article>`;
  };
  const previous = (series.points || []).length > 1 ? (() => {
    const latest = series.points.at(-1), before = series.points.at(-2);
    const shown = displayLiftKg(Math.round((Number(latest.weightKg) - Number(before.weightKg)) * 10000) / 10000, unit);
    const sign = shown > 0 ? "+" : "";
    return `<article><small>较上次</small><strong>${sign}${shown} ${unit}</strong></article>`;
  })() : "";
  const deltaRow = `${previous}${label("week","周进步")}${label("month","月进步")}${label("quarter","季度进步")}${label("year","年进步")}`;
  const status = state.training.busy
    ? "正在从云端拉取该动作的历史重量…"
    : state.training.error && !points.length
      ? state.training.error
      : !points.length && (canDirectBodyOs || state.cloud.session)
        ? "云端这份动作还没有可用的重量历史。"
        : !points.length ? "登录 Supabase 后打开动作会自动拉取历史。" : "";
  const grainHint = grain === "session" ? "每个点是一次训练当天工作组的平均重量；悬停或按住拖动可看全部组。" : "每个点是该时段内各次训练日均重的再平均。";
  return `<section class="lift-progress"><div class="lift-progress-head"><div><span class="label">进步栏</span><h2>${escapeHTML(series.name || "动作曲线")}</h2><p>${grainHint}</p></div><div class="lift-switch"><button type="button" class="${unit === "kg" ? "active" : ""}" data-lift-unit="kg">kg</button><button type="button" class="${unit === "lb" ? "active" : ""}" data-lift-unit="lb">lb</button></div></div><div class="lift-ranges">${[["session","按次"],["week","按周"],["month","按月"],["year","按年"]].map(([key,labelText]) => `<button type="button" class="${grain === key ? "active" : ""}" data-lift-grain="${key}">${labelText}</button>`).join("")}</div>${deltaRow ? `<div class="lift-deltas">${deltaRow}</div>` : ""}${status ? `<p class="lift-status">${escapeHTML(status)}</p>` : ""}${liftChartMarkup(points, { unit, grain, large, activeIndex: state.liftScrubIndex, escapeHTML })}${large ? "" : `<button class="secondary" id="openLiftSheet" type="button">放大曲线</button>`}</section>`;
}

function bindLiftProgressControls(root, exerciseId) {
  root.querySelectorAll("[data-lift-unit]").forEach((button) => button.onclick = () => { state.liftUnit = button.dataset.liftUnit; render(); });
  root.querySelectorAll("[data-lift-grain]").forEach((button) => button.onclick = () => { state.liftGrain = button.dataset.liftGrain; state.liftScrubIndex = -1; render(); });
  bindLiftChart(root, liftDisplayedPoints(exerciseId).points);
  const open = root.querySelector("#openLiftSheet");
  if (open) open.onclick = () => { state.liftSheetOpen = true; render(); };
}

function syncLiftSheet(exerciseId) {
  const sheet = document.getElementById("liftSheet");
  const body = document.getElementById("liftSheetBody");
  if (!sheet || !body) return;
  if (!state.liftSheetOpen) { sheet.classList.add("hidden"); return; }
  sheet.classList.remove("hidden");
  body.innerHTML = liftProgressPanel(exerciseId, true);
  bindLiftProgressControls(body, exerciseId);
  document.getElementById("liftSheetClose").onclick = () => { state.liftSheetOpen = false; render(); };
  sheet.onclick = (event) => { if (event.target === sheet) { state.liftSheetOpen = false; render(); } };
}

function renderExerciseHistory(history) {
  const groups = exerciseHistoryGroups(history);
  const active = groups.find((item) => item.id === state.historyExerciseId);
  if (active) {
    app.innerHTML = `<section class="history-detail-hero"><span class="label">历史动作库</span><h2>${escapeHTML(active.name)}</h2><div class="metrics"><div class="metric"><span class="label">训练次数</span><strong>${active.records.length}</strong></div><div class="metric"><span class="label">总组数</span><strong>${active.sets}</strong></div><div class="metric"><span class="label">总容量</span><strong>${Math.round(active.volume * 10) / 10}</strong><small>kg·次</small></div></div><p>按时间倒序展示全部 ${active.reps} 次重复。</p></section>
    ${liftProgressPanel(active.id)}<section class="section"><div class="section-head"><h2>历史训练记录</h2><span class="label">最新优先</span></div><div class="exercise-history-records">${active.records.map((record) => `<article><header><div><strong>${new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"short",day:"numeric"}).format(new Date(record.startedAt))}</strong><small>${escapeHTML(record.activityType || "力量训练")}</small></div><span>${record.setCount} 组 · ${record.reps} 次 · ${Math.round(record.volume * 10) / 10} kg·次</span></header>${record.sets.map((set,index) => `<div class="set-row"><span class="set-index">${index + 1}</span><span class="set-main"><strong>${set.weight_value ?? set.weight_kg ?? 0}${set.weight_unit || "kg"} × ${set.reps || 0}</strong><small>${LOAD_LABELS[set.load_mode] || "重量"}${set.rir != null ? ` · RIR ${set.rir}` : ""}${set.rpe != null ? ` · RPE ${set.rpe}` : ""}</small></span><em>${set.calculated_volume == null ? "—" : `${Math.round(Number(set.calculated_volume) * 10) / 10} kg·次`}</em></div>`).join("")}</article>`).join("")}</div></section>`;
    bottomBar.innerHTML = `<button class="secondary" id="exerciseHistoryList">返回动作列表</button><button class="primary" id="historyBack">返回训练</button>`;
    $("#exerciseHistoryList").onclick = () => { state.historyExerciseId = ""; state.liftSheetOpen = false; renderHistory(); };
    const panel = document.querySelector(".lift-progress"); if (panel) bindLiftProgressControls(panel, active.id);
    syncLiftSheet(active.id);
    $("#historyBack").onclick = () => navigate("home");
    return;
  }
  app.innerHTML = `<section class="history-summary"><div><span class="label">按动作汇总</span><h2>${groups.length} 个历史动作</h2><p>点开动作查看上次重量、容量、组数和全部逐组记录。</p></div><button id="historyRefresh">${state.training.busy ? "…" : "↻"}</button></section><div class="exercise-history-library">${groups.map((item) => { const latest = item.records[0], lastSet = latest.sets.at(-1) || {}; return `<button data-history-exercise="${escapeHTML(item.id)}"><span class="exercise-icon">${exerciseIcon(state.exercises.find((exercise) => exercise.id === item.id) || {movementPattern:""})}</span><span><strong>${escapeHTML(item.name)}</strong><small>最近 ${new Intl.DateTimeFormat("zh-CN",{month:"short",day:"numeric"}).format(new Date(latest.startedAt))} · ${lastSet.weight_value ?? lastSet.weight_kg ?? 0}${lastSet.weight_unit || "kg"} × ${lastSet.reps || 0}</small></span><em>${item.records.length} 次<br>${item.sets} 组</em></button>`; }).join("")}</div>`;
  bottomBar.innerHTML = `<button class="secondary" id="historyWorkoutMode">按训练查看</button><button class="primary" id="historyBack">返回训练</button>`;
  $("#historyWorkoutMode").onclick = () => { state.historyMode = "workouts"; renderHistory(); };
  $("#historyBack").onclick = () => navigate("home");
  $("#historyRefresh").onclick = () => loadTrainingSnapshot();
  document.querySelectorAll("[data-history-exercise]").forEach((button) => button.onclick = () => { state.historyExerciseId = button.dataset.historyExercise; renderHistory(); refreshTrainingSnapshotForExercise(); });
}

function renderHistory() {
  setScreenHeading("训练历史");
  const history = state.training.snapshot?.workoutHistory || [];
  if (!history.length) {
    app.innerHTML = `<div class="empty">${state.training.busy ? "正在同步训练历史…" : escapeHTML(state.training.error || "暂无已同步的结构化训练记录。")}</div>`;
    bottomBar.innerHTML = `<button class="primary" id="historyRefresh">重新同步</button>`;
    $("#historyRefresh").onclick = () => loadTrainingSnapshot();
    return;
  }
  if (state.historyMode === "exercises") return renderExerciseHistory(history);
  const activeIndex = Math.max(0, history.findIndex((item) => item.id === state.historyWorkoutId));
  const active = state.historyWorkoutId ? history[activeIndex] : null;
  if (active) {
    const previous = previousComparableWorkout(history, activeIndex);
    const comparison = compareWorkoutHistory(active, previous);
    app.innerHTML = `<section class="history-detail-hero"><span class="label">${new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",day:"numeric",weekday:"short"}).format(new Date(active.startedAt))}</span><h2>${escapeHTML(active.activityType || "力量训练")}</h2><div class="metrics"><div class="metric"><span class="label">训练量变化</span><strong class="${comparison.volumeDelta >= 0 ? "positive" : "negative"}">${signedDelta(comparison.volumeDelta)}</strong><small>kg</small></div><div class="metric"><span class="label">组数变化</span><strong>${signedDelta(comparison.setDelta)}</strong></div><div class="metric"><span class="label">次数变化</span><strong>${signedDelta(comparison.repsDelta)}</strong></div></div><p>${previous ? `对比 ${new Intl.DateTimeFormat("zh-CN",{month:"numeric",day:"numeric"}).format(new Date(previous.startedAt))} 的最近同类训练` : "这是目前最早的可比训练"}</p></section>
    <section class="section"><div class="section-head"><h2>动作进步</h2><span class="label">${active.summary?.setCount || 0} 组</span></div><div class="history-exercises">${comparison.exercises.map((item) => `<article><div><strong>${escapeHTML(item.name || item.exerciseId)}</strong><small>${item.setCount} 组 · ${item.reps} 次 · 最大 ${item.maxWeight}${item.weightUnit}</small></div><span class="${item.volumeDelta >= 0 ? "positive" : "negative"}">${item.previous ? `${signedDelta(item.volumeDelta)} kg` : "首次"}</span></article>`).join("")}</div></section>
    <section class="section"><div class="section-head"><h2>全部组明细</h2></div>${active.exercises.map((exercise) => `<details class="history-exercise-detail"><summary>${escapeHTML(exercise.name)} · ${exercise.sets.length} 组</summary>${exercise.sets.map((set,index) => `<div class="set-row"><span class="set-index">${index + 1}</span><span class="set-main"><strong>${set.weight_value ?? set.weight_kg ?? 0}${set.weight_unit || "kg"} × ${set.reps || 0}</strong><small>${LOAD_LABELS[set.load_mode] || "重量"}${set.rir != null ? ` · RIR ${set.rir}` : ""}</small></span></div>`).join("")}</details>`).join("")}</section>`;
    bottomBar.innerHTML = `<button class="secondary" id="historyList">返回历史列表</button><button class="primary" id="repeatWorkout">按此训练选动作</button>`;
    $("#historyList").onclick = () => { state.historyWorkoutId = ""; renderHistory(); };
    $("#repeatWorkout").onclick = () => {
      const ids = active.exercises.map((item) => canonicalExerciseId(item.exerciseId));
      const today = { date: active.startedAt?.slice(0, 10), title: "复用历史训练", readinessLabel: "历史模板", exercises: active.exercises.map((item) => ({ exerciseId: canonicalExerciseId(item.exerciseId), name: item.name, sets: item.sets.length })) };
      state.training.snapshot = { ...state.training.snapshot, today: { ...today, ids } };
      navigate("picker", { pickerPresetKey: "bodyos_today" });
    };
    return;
  }
  app.innerHTML = `<section class="history-summary"><div><span class="label">BODY.OS 已同步</span><h2>${history.length} 次训练</h2><p>点开任意一次，自动与上一场包含相同动作的训练比较。</p></div><button id="historyRefresh">${state.training.busy ? "…" : "↻"}</button></section><div class="history-list">${history.map((item,index) => { const previous = previousComparableWorkout(history,index); const comparison = compareWorkoutHistory(item, previous); return `<button data-history-id="${escapeHTML(item.id)}"><time>${new Intl.DateTimeFormat("zh-CN",{month:"short",day:"numeric"}).format(new Date(item.startedAt))}</time><span><strong>${escapeHTML(item.activityType || "力量训练")}</strong><small>${(item.exercises || []).map((exercise) => exercise.name).slice(0,3).join(" · ") || "无动作明细"}</small></span><em class="${comparison.volumeDelta >= 0 ? "positive" : "negative"}">${previous ? signedDelta(comparison.volumeDelta, " kg") : "首次"}</em></button>`; }).join("")}</div>`;
  bottomBar.innerHTML = `<button class="secondary" id="historyExerciseMode">历史动作库</button><button class="primary" id="historyBack">返回训练</button>`;
  $("#historyExerciseMode").onclick = () => { state.historyMode = "exercises"; state.historyWorkoutId = ""; renderHistory(); };
  $("#historyBack").onclick = () => navigate("home");
  $("#historyRefresh").onclick = () => loadTrainingSnapshot();
  document.querySelectorAll("[data-history-id]").forEach((button) => button.onclick = () => { state.historyWorkoutId = button.dataset.historyId; renderHistory(); });
}

function renderSummary() {
  setScreenHeading("训练总结"); const summary = sessionSummary(state.session); const groups = groupSets();
  app.innerHTML = `<section class="hero"><div class="label">训练完成</div><div class="timer">${summary.durationMinutes}<small style="font-size:16px"> 分钟</small></div><div class="metrics"><div class="metric"><span class="label">动作</span><strong>${summary.exerciseCount}</strong></div><div class="metric"><span class="label">组数</span><strong>${summary.setCount}</strong></div><div class="metric"><span class="label">训练量</span><strong>${summary.volume}</strong></div></div></section>
  ${state.session.sync.workoutId ? `<div class="import-state">✓ 已导入 Body.OS · <a class="link" href="/?view=fitness">查看训练</a></div>` : ""}
    <section class="section"><div class="section-head"><h2>${localeText("动作记录", "Exercise log")}</h2><span class="label">${summary.reps} ${localeText("次", "reps")}</span></div>${[...groups.entries()].map(([exerciseId, sets]) => `<article class="summary-card"><header class="summary-card-head"><div>${exerciseLabel(sets[0])}${setPreviewMarkup(sets.length, sets.at(-1))}</div><button class="summary-delete" data-delete-exercise="${escapeHTML(exerciseId)}" aria-label="删除 ${escapeHTML(sets[0].exerciseName)}">${localeText("删除", "Delete")}</button></header><details class="exercise-set-details"><summary>${localeText(`查看 / 编辑 ${sets.length} 组明细`, `View / edit ${sets.length} set details`)}</summary><div>${sets.map((set,index) => `<div class="set-row"><span class="set-index">${index + 1}</span><span class="set-main"><strong>${set.weightValue}${set.weightUnit} × ${set.reps}</strong><small>${RECORDING_MODE_LABELS[recordingModeForSet(set)]}${set.rir != null ? ` · RIR ${set.rir}` : ""}</small></span><time>${new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(set.completedAt))}</time><button class="set-edit" data-edit-set="${state.session.sets.indexOf(set)}">${localeText("编辑", "Edit")}</button></div>`).join("")}</div></details></article>`).join("")}</section>
  <section class="section"><div class="section-head"><h2>导出与联动</h2></div><div class="card-list"><button class="exercise-card cloud-action" id="supabaseUpload"><span class="exercise-icon">☁</span><span><strong>${state.session.sync.supabaseDirty ? "有修改，重新上传 Supabase" : state.session.sync.supabaseId ? "已同步 Supabase" : "上传到 Supabase"}</strong><small>${state.session.sync.supabaseId ? "再次上传会安全更新同一条记录" : state.cloud.session ? `已登录 ${escapeHTML(cloudAccountLabel())}` : "使用 Supabase Auth + RLS 保护写入"}</small></span><span class="chevron">${state.cloud.busy ? "…" : "↑"}</span></button><button class="exercise-card" id="copyJson"><span class="exercise-icon">⧉</span><span><strong>复制 Body.OS JSON</strong><small>粘贴到 Body.OS「智能训练捕获」即可快速读取</small></span><span class="chevron">›</span></button>${canDirectBodyOs ? `<button class="exercise-card" id="watchLink"><span class="exercise-icon">⌚</span><span><strong>Apple Watch 训练</strong><small>${state.selectedWatch ? "已选择匹配场次" : state.watchCandidates.length ? `${state.watchCandidates.length} 个候选可选` : "暂不匹配"}</small></span><span class="chevron">›</span></button>` : ""}<button class="exercise-card" id="json"><span class="exercise-icon">{ }</span><span><strong>下载结构化 JSON</strong><small>Body.OS Quick Workout v1</small></span><span class="chevron">↓</span></button><button class="exercise-card" id="markdown"><span class="exercise-icon">M↓</span><span><strong>导出 Markdown</strong><small>可读训练备份</small></span><span class="chevron">↓</span></button></div></section>
  <section class="danger-zone"><div><strong>管理本次训练</strong><small>清空全部组、计时和待同步状态；动作库与离线缓存会保留。</small></div><button class="${state.resetArmed ? "armed" : ""}" id="resetSession">${state.resetArmed ? "确认重置" : "重置本次训练"}</button></section>`;
  bottomBar.innerHTML = `<button class="secondary" id="continue">继续训练</button><button class="primary" id="primaryExport">${canDirectBodyOs ? "一键导入 Body.OS" : "复制 Body.OS JSON"}</button>`;
  $("#continue").onclick = () => { state.session.endedAt = ""; navigate("home"); };
  $("#copyJson").onclick = copyBodyJson; $("#primaryExport").onclick = canDirectBodyOs ? importBodyOS : copyBodyJson;
  $("#supabaseUpload").onclick = state.cloud.config && state.cloud.session ? syncCurrentWorkoutToCloud : () => navigate("cloud");
  document.querySelectorAll("[data-edit-set]").forEach((button) => button.onclick = () => editSessionSet(Number(button.dataset.editSet)));
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

function legacyCopy(value) {
  const input = document.createElement("textarea");
  input.value = value; input.setAttribute("readonly", ""); input.setAttribute("aria-hidden", "true");
  input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:.01";
  document.body.append(input); input.focus({ preventScroll: true }); input.select(); input.setSelectionRange(0, input.value.length);
  const copied = document.execCommand("copy"); input.remove(); return copied;
}

function showCopyFallback(value) {
  const panel = $("#copyFallback"), input = $("#copyFallbackText");
  input.value = value; panel.classList.remove("hidden"); input.focus({ preventScroll: true }); input.select(); input.setSelectionRange(0, input.value.length);
  $("#copyFallbackRetry").onclick = () => {
    if (legacyCopy(value)) { panel.classList.add("hidden"); showToast("已复制；到 Body.OS 智能训练捕获中粘贴即可"); }
    else { input.focus({ preventScroll: true }); input.select(); input.setSelectionRange(0, input.value.length); showToast("请长按上方内容并选择“复制”"); }
  };
  $("#copyFallbackClose").onclick = () => panel.classList.add("hidden");
}

async function copyBodyJson() {
  const value = JSON.stringify(createExport(state.session), null, 2);
  let copied = false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) { await navigator.clipboard.writeText(value); copied = true; }
  } catch { /* Fall through to the iOS/Safari-compatible selection path. */ }
  if (!copied) copied = legacyCopy(value);
  if (copied) showToast("已复制；到 Body.OS 智能训练捕获中粘贴即可");
  else { showCopyFallback(value); showToast("浏览器未授予剪贴板权限；已显示可手动复制的 JSON"); }
}

function download(type) { const value = type === "json" ? JSON.stringify(createExport(state.session), null, 2) : toMarkdown(state.session); const blob = new Blob([value], { type: type === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `body-os-${state.session.startedAt.slice(0,10)}.${type}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }

backButton.onclick = () => history.back(); quickFinish.onclick = finishSession; window.addEventListener("popstate", () => { const target = location.hash.slice(1) || "home"; state.screen = target; render(); });
$("#languageToggle").onclick = toggleLocale;
window.addEventListener("online", () => { status.textContent = "本机已保存"; if (state.session?.sync.status === "pending") showToast("网络已恢复，可导入 Body.OS"); }); window.addEventListener("offline", () => { status.textContent = "离线记录中"; status.style.color = "var(--orange)"; });
document.addEventListener("visibilitychange", () => { if (!document.hidden) updateClocks(); });
document.addEventListener("error", (event) => { if (event.target?.classList?.contains("exercise-gif")) { event.target.hidden = true; event.target.parentElement?.classList.add("is-media-error"); } }, true);

async function loadExerciseLibrary() {
  const cached = await DB.get("exercise-library"), custom = (cached || []).filter((item) => item.isCustom);
  state.exercises = mergeExerciseCatalog(BASE_EXERCISES, custom.map(enrichExercise));
  if (!canDirectBodyOs) { await DB.set("exercise-library", state.exercises); await DB.set("exercise-catalog-version", EXERCISE_CATALOG_VERSION); return; }
  try { const response = await fetch("/api/training/snapshot"); if (!response.ok) return; const data = await response.json(); const items = data.exercise_library || data.exerciseLibrary || []; if (data.body_weight_kg != null) state.session.bodyWeightKg = Number(data.body_weight_kg); if (Array.isArray(items) && items.length) { const remote = items.map((item) => enrichExercise({ id: canonicalExerciseId(item.id || item.exercise_canonical_id || item.canonical_id), name: item.canonical_name_zh || item.name || item.display_name, canonicalNameEn: item.canonical_name_en || "", equipment: Array.isArray(item.equipment) ? item.equipment.join(" · ") : (item.equipment || ""), movementPattern: item.movement_pattern || "", loadMode: item.default_load_mode || "total", executionMode: item.supports_unilateral_execution ? "unilateral" : item.supports_per_side_load ? "bilateral_simultaneous" : "bilateral", sideCount: item.supports_per_side_load ? 2 : 1 })).filter((x) => x.id && x.name); const seenIds = new Set(remote.map((item) => item.id)), seenNames = new Set(remote.map((item) => `${item.name}|${item.canonicalNameEn}`.toLowerCase())); state.exercises = [...remote, ...BASE_EXERCISES.filter((item) => !seenIds.has(item.id) && !seenNames.has(`${item.name}|${item.canonicalNameEn}`.toLowerCase())), ...custom.filter((item) => !seenIds.has(item.id))]; await DB.set("exercise-library", state.exercises); } } catch {}
}

async function boot() {
  state.locale = (await DB.get("display-locale")) === "en" ? "en" : "zh";
  state.cloud.config = (await DB.get("supabase-config")) || DEFAULT_SUPABASE_CONFIG; state.cloud.session = await DB.get("supabase-session");
  state.training.snapshot = await DB.get("training-snapshot");
  const saved = await DB.get("active-session"); state.session = saved?.sets && !saved.sync?.workoutId ? saved : createSession();
  state.session.sync = state.session.sync || { status: "local", draftId: "", workoutId: "" };
  state.session.sets = (state.session.sets || []).map((set) => ({ ...set, exerciseId: canonicalExerciseId(set.exerciseId) }));
  state.session.currentExerciseId = canonicalExerciseId(state.session.currentExerciseId || "");
  if (!state.session.timer) {
    const completedDuration = state.session.endedAt ? Math.max(0, new Date(state.session.endedAt) - new Date(state.session.startedAt)) : 0;
    state.session.timer = { running: false, elapsedMs: completedDuration, startedAtMs: null };
  }
  if (state.session.rest && state.session.rest.remainingSeconds == null) {
    state.session.rest = { durationSeconds: state.session.rest.pausedSeconds || 90, remainingSeconds: state.session.rest.endsAt ? Math.max(0, Math.ceil((state.session.rest.endsAt - Date.now()) / 1000)) : (state.session.rest.pausedSeconds || 90), running: false, endsAt: null };
  }
  await loadExerciseLibrary(); await persist(); const requested = location.hash.slice(1); state.screen = ["home","picker","custom","entry","summary","watch","cloud","history"].includes(requested) ? requested : "home"; if (state.screen === "entry" && !state.draft) state.screen = "home"; render();
  if (canDirectBodyOs || (state.cloud.config && state.cloud.session)) loadTrainingSnapshot();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(new URL("./sw.js", location.href), { scope: "./" }).catch(() => {});
}
boot();
