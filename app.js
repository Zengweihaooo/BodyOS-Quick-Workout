import { EXERCISE_CATALOG_VERSION, EXERCISE_REFERENCES, FALLBACK_EXERCISES, LOAD_LABELS, buildBodyCandidate, canonicalExerciseId, createExport, createSession, mergeExerciseCatalog, normalizeSet, restRemainingSeconds, sessionSummary, timerElapsedMs, toMarkdown, withoutExercise } from "./core.js?v=8";
import { normalizeSupabaseConfig, refreshSession, sessionIsFresh, signInWithPassword, uploadWorkout } from "./supabase.js";

const $ = (selector, root = document) => root.querySelector(selector);
const app = $("#app"), bottomBar = $("#bottomBar"), backButton = $("#backButton"), title = $("#screenTitle"), status = $("#networkStatus");
const DEFAULT_SUPABASE_CONFIG = Object.freeze(normalizeSupabaseConfig({
  url: "https://zvmesprbvoakonvxzpaj.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2bWVzcHJidm9ha29udnh6cGFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NTM1MjUsImV4cCI6MjEwMDEyOTUyNX0.kyXsxN72XkE7t9F8lbu4IaYiuJD7v8Xw1kkn3AlBmaM",
}));
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
let state = { session: null, exercises: BASE_EXERCISES, screen: "home", draft: null, selectedWatch: "", watchCandidates: [], importing: false, resetArmed: false, locale: "zh", cloud: { config: null, session: null, busy: false } };
let tickTimer = null, toastTimer = null, resetArmTimer = null;
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
  if (state.screen === "picker") renderPicker(); else if (state.screen === "custom") renderCustomExercise(); else if (state.screen === "entry") renderEntry(); else if (state.screen === "summary") renderSummary(); else if (state.screen === "watch") renderWatch(); else if (state.screen === "cloud") renderCloud(); else renderHome();
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
function exerciseCard(exercise, prescribedSets = 0) { if (!exercise) return ""; const count = state.session.sets.filter((s) => canonicalExerciseId(s.exerciseId) === exercise.id).length; const reference = exercise.reference || {}; const wgerUrl = safeExternalUrl(reference.wger?.videoUrl || reference.wger?.pageUrl, "wger"); const prescription = prescribedSets ? ` · ${localeText(`计划 ${prescribedSets} 组`, `${prescribedSets} planned sets`)}` : ""; const card = `<button class="exercise-card ${reference.gifUrl ? "has-media" : ""}" data-exercise="${escapeHTML(exercise.id)}"><span class="exercise-icon">${exerciseIcon(exercise)}</span><span>${exerciseLabel(exercise)}<small>${escapeHTML(exercise.equipment || localeText("标准动作", "Standard"))} · ${LOAD_LABELS[exercise.loadMode] || localeText("重量", "Load")}${prescription}${count ? ` · ${count} ${localeText("已完成组", "completed sets")}` : ""}</small>${reference.datasetId ? `<em class="reference-match">dataset ${escapeHTML(reference.datasetId)}${reference.wger ? ` · wger ${reference.wger.matchType === "exact" ? localeText("已匹配", "matched") : localeText("通用参考", "reference")}` : ""}</em>` : ""}</span><span class="chevron">›</span></button>`; const external = wgerUrl ? `<a class="exercise-reference-link" href="${escapeHTML(wgerUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${escapeHTML(localeText(`在 wger 查看 ${exercise.name}`, `View ${exercise.canonicalNameEn || exercise.name} on wger`))}">↗</a>` : ""; return `<div class="exercise-card-wrap">${card}${external}${count ? `<button class="exercise-delete" data-delete-exercise="${escapeHTML(exercise.id)}" aria-label="删除 ${escapeHTML(exercise.name)}">×</button>` : ""}</div>`; }
function bindExerciseCards() { document.querySelectorAll("[data-exercise]").forEach((button) => button.onclick = () => openExercise(button.dataset.exercise)); }

function renderPicker() {
  setScreenHeading(localeText("选择动作", "Choose exercise"));
  app.innerHTML = `<div class="picker-actions"><input class="search" id="search" type="search" placeholder="${localeText("搜索动作、器械或英文名", "Search exercise, equipment or Chinese name")}" autocomplete="off" aria-label="搜索动作"><button class="custom-action" id="addCustom">＋ ${localeText("自定义", "Custom")}</button></div><section class="category-guide"><div class="section-head"><h2>${localeText("按部位或完整组合选择", "Browse by body part or preset")}</h2><span class="label">${localeText("休息日自由安排", "Flexible rest days")}</span></div><div class="chip-row"><button class="chip active" data-filter="">${localeText("全部", "All")}</button><button class="chip" data-filter="chest">${localeText("胸", "Chest")}</button><button class="chip" data-filter="back">${localeText("背", "Back")}</button><button class="chip" data-filter="shoulders">${localeText("肩", "Shoulders")}</button><button class="chip" data-filter="core">${localeText("核心", "Core")}</button><button class="chip" data-filter="cardio">${localeText("有氧", "Cardio")}</button><button class="chip" data-filter="arms">${localeText("手臂", "Arms")}</button><button class="chip" data-filter="legs">${localeText("腿（暂停）", "Legs (paused)")}</button></div></section><section class="preset-guide" id="presetGuide"></section><div class="card-list" id="exerciseList"></div><aside class="source-policy"><strong>${localeText("来源与隐私", "Sources & privacy")}</strong><span>${localeText("动图仅远程引用 exercise dataset；动作详情仅显示 wger 内容。训练数据保存在此浏览器的 IndexedDB，不会自动上传。", "Animations are remote exercise-dataset references; guides come only from wger. Workout data stays in this browser's IndexedDB unless you export it.")}</span></aside>`;
  const list = $("#exerciseList"), search = $("#search"), guide = $("#presetGuide"); let filter = "", activePresetKey = "";
  const update = () => {
    const relevant = TRAINING_PRESETS.filter((preset) => !filter || preset.group === filter);
    guide.innerHTML = relevant.length ? `<div class="section-head"><h2>${localeText("推荐完整组合", "Recommended presets")}</h2><span class="label">${localeText("点击后只看该组合动作", "Tap to filter the preset")}</span></div><div class="preset-row">${relevant.map((preset) => `<button class="preset-card ${activePresetKey === preset.key ? "active" : ""}" data-preset="${preset.key}"><strong>${localeText(preset.title, preset.titleEn || preset.title)}</strong><small>${localeText(preset.note, preset.noteEn || preset.note)}</small><em>${preset.ids.length} ${localeText("个动作", "exercises")}</em></button>`).join("")}</div>` : "";
    guide.querySelectorAll("[data-preset]").forEach((button) => button.onclick = () => { const preset = TRAINING_PRESETS.find((item) => item.key === button.dataset.preset); activePresetKey = activePresetKey === preset?.key ? "" : (preset?.key || ""); if (preset) { filter = preset.group; document.querySelectorAll("[data-filter]").forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === filter)); } update(); });
    const preset = TRAINING_PRESETS.find((item) => item.key === activePresetKey), allowedIds = preset ? new Set(preset.ids) : null;
    const term = search.value.trim().toLowerCase(), words = term.split(/\s+/).filter(Boolean);
    const matches = state.exercises.filter((x) => (allowedIds ? allowedIds.has(x.id) : (!filter || exerciseCategory(x) === filter)) && words.every((word) => `${x.name} ${x.canonicalNameEn || ""} ${x.equipment || ""} ${x.movementPattern || ""}`.toLowerCase().includes(word)));
    if (preset) matches.sort((left, right) => preset.ids.indexOf(left.id) - preset.ids.indexOf(right.id));
    list.innerHTML = matches.map((exercise) => exerciseCard(exercise, preset?.sets?.[exercise.id] || 0)).join("") || `<div class="empty">这个分类下没有找到动作，试试搜索或“全部”。</div>`; bindExerciseCards(); bindSessionManagement();
  };
  search.oninput = update; document.querySelectorAll("[data-filter]").forEach((chip) => chip.onclick = () => { document.querySelectorAll("[data-filter]").forEach((x) => x.classList.remove("active")); chip.classList.add("active"); filter = chip.dataset.filter; activePresetKey = ""; update(); }); $("#addCustom").onclick = () => navigate("custom"); update(); setTimeout(() => search.focus(), 50);
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
  state.session.currentExerciseId = id; state.draft = normalizeSet(previous ? { ...previous, reference: exercise.reference, id: "", completedAt: "", restSeconds: defaultRest(previous) } : { exerciseId: id, exerciseName: exercise.name, canonicalNameEn: exercise.canonicalNameEn, equipment: exercise.equipment, movementPattern: exercise.movementPattern, loadMode: exercise.loadMode, executionMode: exercise.executionMode, sideCount: exercise.sideCount, reference: exercise.reference, weightValue: 10, weightUnit: "kg", reps: 10, rir: 2, restSeconds: 90, side: "both", notes: "", ...grip });
  navigate("entry");
}
function defaultRest(previous) { const prior = state.session.sets.filter((x) => x.exerciseId === previous.exerciseId); if (prior.length < 2) return previous.restSeconds || 90; const a = new Date(prior.at(-1).completedAt), b = new Date(prior.at(-2).completedAt); return Math.min(7200, Math.max(0, Math.round((a - b) / 1000))); }

function renderEntry() {
  const d = state.draft, count = state.session.sets.filter((s) => s.exerciseId === d.exerciseId).length, last = [...state.session.sets].reverse().find((s) => s.exerciseId === d.exerciseId);
  const unit = d.weightUnit === "lb" ? "lb" : "kg", step = unit === "lb" ? 5 : 2.5;
  const reference = d.reference || {}, description = state.locale === "en" ? reference.wger?.descriptionEn : (reference.wger?.descriptionZh || reference.wger?.descriptionEn), wgerUrl = safeExternalUrl(reference.wger?.videoUrl || reference.wger?.pageUrl, "wger"), license = reference.wger?.translationLicenseZh?.short_name || reference.wger?.translationLicenseEn?.short_name || reference.wger?.license?.short_name || "";
  const referencePanel = reference.datasetId ? `<details class="exercise-reference-panel"><summary>${localeText("动作资料与来源", "Exercise guide & sources")}</summary><div>${description ? `<p>${escapeHTML(description)}</p>` : `<p class="muted">${localeText("wger 详情尚未同步；这里不会用 dataset 文案代替。", "wger details are pending; dataset text is not used as a substitute.")}</p>`}<small>${localeText("动图", "Animation")}：exercise dataset ${escapeHTML(reference.datasetId)} · ${localeText("详情", "Guide")}：${reference.wger ? `wger ${reference.wger.matchType === "exact" ? localeText("已匹配", "matched") : localeText("通用参考", "reference")}` : localeText("待同步", "pending")}${license ? ` · ${escapeHTML(license)}` : ""}${reference.wger?.author ? ` · ${escapeHTML(reference.wger.author)}` : ""}</small>${wgerUrl ? `<a href="${escapeHTML(wgerUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${localeText("在 wger 查看", "View on wger")} ↗</a>` : ""}</div></details>` : "";
  setScreenHeading(state.locale === "en" ? (d.canonicalNameEn || d.exerciseName) : d.exerciseName); app.innerHTML = `<section class="hero"><div class="entry-title"><span class="exercise-icon">${exerciseIcon(d)}</span><div><div class="label">${localeText(`第 ${count + 1} 组`, `Set ${count + 1}`)}</div>${exerciseLabel(d)}<div class="muted">${escapeHTML(d.equipment || localeText("标准动作", "Standard"))}</div></div></div><div class="semantic"><span>${localeText("重量计算方式", "Load mode")}</span><select id="loadMode" aria-label="重量计算方式">${Object.entries(LOAD_LABELS).map(([value,label]) => `<option value="${value}" ${d.loadMode === value ? "selected" : ""}>${label}</option>`).join("")}</select></div></section>${referencePanel}
  <div class="session-timer-strip"><span><small>训练计时</small><strong data-elapsed>${formatClock(elapsed())}</strong></span><button id="entryTimerToggle">${state.session.timer.running ? "暂停" : "开始"}</button></div>
  ${restMarkup()}
  ${last ? `<div class="last-set">${localeText("上一组", "Previous set")}：${last.weightValue}${last.weightUnit} × ${last.reps} ${localeText("次", "reps")}${last.rir != null ? ` · RIR ${last.rir}` : ""}</div>` : ""}${setPreviewMarkup(count, last)}
  <div class="step-grid"><div class="stepper"><div class="row"><div class="label">${LOAD_LABELS[d.loadMode]}</div><div class="unit-switch" aria-label="重量单位"><button class="${unit === "kg" ? "active" : ""}" data-unit="kg">kg</button><button class="${unit === "lb" ? "active" : ""}" data-unit="lb">lb <small>磅</small></button></div></div><div class="stepper-controls"><button data-step="weight" data-delta="-${step}" aria-label="减少重量">−</button><input id="weight" class="number-input" type="number" inputmode="decimal" min="0" step="${step}" value="${d.weightValue}" aria-label="重量，点击数字可直接输入"><button data-step="weight" data-delta="${step}" aria-label="增加重量">＋</button></div><div class="direct-input-hint">点击数字可直接输入 · ${unit === "lb" ? "当前单位：磅" : "可切换 lb（磅）"}${["per_limb","per_side"].includes(d.loadMode) ? ` · 总负荷 ${d.weightValue * 2} ${unit}` : ""}</div></div><div class="stepper"><div class="label">次数</div><div class="stepper-controls"><button data-step="reps" data-delta="-1" aria-label="减少次数">−</button><input id="reps" class="number-input" type="number" inputmode="numeric" min="0" step="1" value="${d.reps}" aria-label="次数，点击数字可直接输入"><button data-step="reps" data-delta="1" aria-label="增加次数">＋</button></div><div class="direct-input-hint">点击数字可直接输入</div></div></div>
  <section class="section"><div class="section-head"><h2>RIR</h2><span class="label">还能完成几次</span></div><div class="rir-grid">${[null,0,1,2,3,4,5].map((v) => `<button class="chip ${d.rir === v ? "active" : ""}" data-rir="${v == null ? "" : v}">${v == null ? "未记" : v}</button>`).join("")}</div></section>
  <section class="section"><div class="section-head"><h2>左右侧</h2></div><div class="chip-row">${[["both","双侧"],["left","左侧"],["right","右侧"],["alternating","左右交替"]].map(([v,l]) => `<button class="chip ${d.side === v ? "active" : ""}" data-side="${v}">${l}</button>`).join("")}</div></section>
  ${gripMarkup(d)}
  <details class="exercise-history"><summary>${localeText(`本动作已完成 ${count} 组`, `${count} completed sets for this exercise`)}</summary><div class="exercise-history-body">${count ? state.session.sets.filter((set) => set.exerciseId === d.exerciseId).map((set, index) => `<div><span>${index + 1}</span><strong>${set.weightValue}${set.weightUnit} × ${set.reps}</strong><small>${set.rir != null ? `RIR ${set.rir}` : ""}</small></div>`).join("") : `<small>${localeText("保存第一组后会显示在这里。", "Save the first set to see it here.")}</small>`}</div></details>
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

async function syncCurrentWorkoutToCloud() {
  if (!navigator.onLine) return showToast("当前离线，训练仍安全保存在本机");
  if (!state.cloud.config || !state.cloud.session) return navigate("cloud");
  state.cloud.busy = true; renderSummary();
  try {
    const session = await ensureCloudSession();
    const rows = await uploadWorkout(state.cloud.config, session, createExport(state.session));
    const remote = Array.isArray(rows) ? rows[0] : rows;
    state.session.sync = { ...state.session.sync, supabaseId: remote?.id || state.session.sync.supabaseId || "uploaded", supabaseUploadedAt: new Date().toISOString() };
    await persist(); showToast("已安全上传到 Supabase，Body.OS 将自动读取");
  } catch (error) { showToast(error.message || "Supabase 上传失败"); }
  state.cloud.busy = false; renderSummary();
}

function renderCloud() {
  setScreenHeading("Supabase 云端同步");
  const configured = Boolean(state.cloud.config), signedIn = Boolean(state.cloud.session?.refresh_token);
  app.innerHTML = `<section class="hero cloud-hero"><div class="label">受保护的云端通道</div><h2>${signedIn ? "已连接" : configured ? "项目已配置" : "连接 Supabase"}</h2><p class="muted">公开网页只保存公开的 anon key。写入必须通过你的 Supabase Auth 登录，并同时通过数据库用户 allowlist 与 owner_id = auth.uid() 两层 RLS 检查。</p></section>
  <section class="section"><div class="section-head"><h2>项目配置</h2><span class="label">保存在此浏览器</span></div><form id="cloudConfigForm" class="cloud-form"><label>Project URL<input id="cloudUrl" type="url" required autocomplete="url" placeholder="https://xxxx.supabase.co" value="${escapeHTML(state.cloud.config?.url || "")}"></label><label>Publishable / anon key<input id="cloudAnonKey" type="password" required autocomplete="off" placeholder="sb_publishable_… 或 anon JWT" value="${escapeHTML(state.cloud.config?.anonKey || "")}"></label><button class="secondary" type="submit">保存项目配置</button></form></section>
  <section class="section"><div class="section-head"><h2>身份验证</h2><span class="label">${escapeHTML(cloudAccountLabel())}</span></div>${signedIn ? `<div class="cloud-signed-in"><p>登录会话保存在此浏览器；原始密码从不保存。</p><button class="danger-link" id="cloudSignOut" type="button">退出登录并清除会话</button></div>` : `<form id="cloudLoginForm" class="cloud-form"><label>邮箱<input id="cloudEmail" type="email" required autocomplete="username"></label><label>密码<input id="cloudPassword" type="password" required autocomplete="current-password"></label><button class="primary" type="submit" ${configured ? "" : "disabled"}>登录 Supabase</button></form>`}</section>
  <section class="source-policy"><strong>数据库仍需启用 RLS</strong><span>请先执行仓库 supabase/schema.sql。建议在 Supabase 关闭公开注册，仅在 Dashboard 创建你自己的账号。</span></section>`;
  bottomBar.innerHTML = `<button class="secondary" id="cloudBack">返回训练总结</button>${signedIn ? `<button class="primary" id="cloudUpload" ${state.cloud.busy ? "disabled" : ""}>${state.cloud.busy ? "上传中…" : "上传本次训练"}</button>` : ""}`;
  $("#cloudBack").onclick = () => history.back();
  $("#cloudConfigForm").onsubmit = async (event) => { event.preventDefault(); try { state.cloud.config = normalizeSupabaseConfig({ url: $("#cloudUrl").value, anonKey: $("#cloudAnonKey").value }); state.cloud.session = null; await DB.set("supabase-config", state.cloud.config); await DB.set("supabase-session", null); showToast("Supabase 项目配置已保存"); renderCloud(); } catch (error) { showToast(error.message); } };
  if ($("#cloudLoginForm")) $("#cloudLoginForm").onsubmit = async (event) => { event.preventDefault(); state.cloud.busy = true; try { state.cloud.session = await signInWithPassword(state.cloud.config, $("#cloudEmail").value, $("#cloudPassword").value); await DB.set("supabase-session", state.cloud.session); showToast("Supabase 登录成功"); renderCloud(); } catch (error) { state.cloud.busy = false; showToast(error.message || "登录失败"); } };
  $("#cloudSignOut")?.addEventListener("click", async () => { state.cloud.session = null; await DB.set("supabase-session", null); showToast("本机登录会话已清除"); renderCloud(); });
  $("#cloudUpload")?.addEventListener("click", syncCurrentWorkoutToCloud);
}

function renderSummary() {
  setScreenHeading("训练总结"); const summary = sessionSummary(state.session); const groups = groupSets();
  app.innerHTML = `<section class="hero"><div class="label">训练完成</div><div class="timer">${summary.durationMinutes}<small style="font-size:16px"> 分钟</small></div><div class="metrics"><div class="metric"><span class="label">动作</span><strong>${summary.exerciseCount}</strong></div><div class="metric"><span class="label">组数</span><strong>${summary.setCount}</strong></div><div class="metric"><span class="label">训练量</span><strong>${summary.volume}</strong></div></div></section>
  ${state.session.sync.workoutId ? `<div class="import-state">✓ 已导入 Body.OS · <a class="link" href="/?view=fitness">查看训练</a></div>` : ""}
  <section class="section"><div class="section-head"><h2>${localeText("动作记录", "Exercise log")}</h2><span class="label">${summary.reps} ${localeText("次", "reps")}</span></div>${[...groups.entries()].map(([exerciseId, sets]) => `<article class="summary-card"><header class="summary-card-head"><div>${exerciseLabel(sets[0])}${setPreviewMarkup(sets.length, sets.at(-1))}</div><button class="summary-delete" data-delete-exercise="${escapeHTML(exerciseId)}" aria-label="删除 ${escapeHTML(sets[0].exerciseName)}">${localeText("删除", "Delete")}</button></header><details class="exercise-set-details"><summary>${localeText(`查看 ${sets.length} 组明细`, `View ${sets.length} set details`)}</summary><div>${sets.map((set,index) => `<div class="set-row"><span class="set-index">${index + 1}</span><span class="set-main"><strong>${set.weightValue}${set.weightUnit} × ${set.reps}</strong><small>${LOAD_LABELS[set.loadMode]}${set.rir != null ? ` · RIR ${set.rir}` : ""}</small></span><time>${new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(set.completedAt))}</time></div>`).join("")}</div></details></article>`).join("")}</section>
  <section class="section"><div class="section-head"><h2>导出与联动</h2></div><div class="card-list"><button class="exercise-card cloud-action" id="supabaseUpload"><span class="exercise-icon">☁</span><span><strong>${state.session.sync.supabaseId ? "已同步 Supabase" : "上传到 Supabase"}</strong><small>${state.session.sync.supabaseId ? "再次上传会安全更新同一条记录" : state.cloud.session ? `已登录 ${escapeHTML(cloudAccountLabel())}` : "使用 Supabase Auth + RLS 保护写入"}</small></span><span class="chevron">${state.cloud.busy ? "…" : "↑"}</span></button><button class="exercise-card" id="copyJson"><span class="exercise-icon">⧉</span><span><strong>复制 Body.OS JSON</strong><small>粘贴到 Body.OS「智能训练捕获」即可快速读取</small></span><span class="chevron">›</span></button>${canDirectBodyOs ? `<button class="exercise-card" id="watchLink"><span class="exercise-icon">⌚</span><span><strong>Apple Watch 训练</strong><small>${state.selectedWatch ? "已选择匹配场次" : state.watchCandidates.length ? `${state.watchCandidates.length} 个候选可选` : "暂不匹配"}</small></span><span class="chevron">›</span></button>` : ""}<button class="exercise-card" id="json"><span class="exercise-icon">{ }</span><span><strong>下载结构化 JSON</strong><small>Body.OS Quick Workout v1</small></span><span class="chevron">↓</span></button><button class="exercise-card" id="markdown"><span class="exercise-icon">M↓</span><span><strong>导出 Markdown</strong><small>可读训练备份</small></span><span class="chevron">↓</span></button></div></section>
  <section class="danger-zone"><div><strong>管理本次训练</strong><small>清空全部组、计时和待同步状态；动作库与离线缓存会保留。</small></div><button class="${state.resetArmed ? "armed" : ""}" id="resetSession">${state.resetArmed ? "确认重置" : "重置本次训练"}</button></section>`;
  bottomBar.innerHTML = `<button class="secondary" id="continue">继续训练</button><button class="primary" id="primaryExport">${canDirectBodyOs ? "一键导入 Body.OS" : "复制 Body.OS JSON"}</button>`;
  $("#continue").onclick = () => { state.session.endedAt = ""; navigate("home"); };
  $("#copyJson").onclick = copyBodyJson; $("#primaryExport").onclick = canDirectBodyOs ? importBodyOS : copyBodyJson;
  $("#supabaseUpload").onclick = state.cloud.config && state.cloud.session ? syncCurrentWorkoutToCloud : () => navigate("cloud");
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

backButton.onclick = () => history.back(); window.addEventListener("popstate", () => { const target = location.hash.slice(1) || "home"; state.screen = target; render(); });
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
  await loadExerciseLibrary(); await persist(); const requested = location.hash.slice(1); state.screen = ["home","picker","custom","entry","summary","watch","cloud"].includes(requested) ? requested : "home"; if (state.screen === "entry" && !state.draft) state.screen = "home"; render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(new URL("./sw.js", location.href), { scope: "./" }).catch(() => {});
}
boot();
