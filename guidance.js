// Pure guidance helpers: exercise alternatives, starting-weight suggestions, recovery planning.
// Every constant below is tied to a published source (see GUIDANCE_SOURCES) or flagged as a heuristic.
import { canonicalExerciseId, estimated1rmKg, exerciseCategory, historyExerciseMatches, normalizeTrainingTimestamp, workingSetWeightKg } from "./core.js";

export const GUIDANCE_SOURCES = Object.freeze([
  { id: "acsm2026", label: "ACSM 2026 抗阻训练指南更新", url: "https://acsm.org/resistance-training-guidelines-update-2026/", use: "每个主要肌群每周至少训练 2 次；增肌约每肌群每周 10 组" },
  { id: "acsm2009", label: "ACSM 2009 Progression Models in Resistance Training", url: "https://pubmed.ncbi.nlm.nih.gov/19204579/", use: "新手负荷 8–12RM；每周 2–3 天（新手）、3–4 天（中级）" },
  { id: "schoenfeld2019", label: "Schoenfeld 2019 训练频率 meta 分析（25 项研究，J Sports Sci）", url: "https://pubmed.ncbi.nlm.nih.gov/30558493/", use: "周组数相同时，每周训练 1 次与多次的增肌没有显著差别；组数不相同的比较里，更高频率略占优" },
  { id: "schoenfeld2017", label: "Schoenfeld 2017 每周组数剂量反应 meta 分析（全文）", url: "https://pubmed.ncbi.nlm.nih.gov/27433992/", use: "周组数越多增肌越多（每多 1 组效应量 +0.023）；<5 / 5–9 / 10+ 三档的差异只是趋势（P=0.074）" },
  { id: "heinecke2021", label: "Heinecke 2021 杠铃与哑铃卧推（同总重量）对比", url: "https://pubmed.ncbi.nlm.nih.gov/33666593/", use: "同样总重量下杠铃与双手哑铃的力竭次数高度相关（r=0.96），杠铃略多（13.8 vs 12.5）；互相预测 1RM 的总误差约 7–8%" },
  { id: "izquierdo2007", label: "Izquierdo 2007 停训与减量", url: "https://pubmed.ncbi.nlm.nih.gov/17685721/", use: "完全停训 4 周：最大力量下降 6–9%（受试者为受训男性）" },
  { id: "mujika2000", label: "Mujika & Padilla 2000 Detraining Part I（全文）", url: "https://pubmed.ncbi.nlm.nih.gov/10966148/", use: "力量表现在不训练 4 周内大体保留；偏心力量和专项爆发力可能明显下降" },
  { id: "bodyos-plan", label: "Body OS 胸/背/腿三分化计划（本人 2026-10-25 确认）", url: "", use: "每周 3–4 次、至少约 48 小时间隔、胸→背→腿连续轮换；复训期余力 3–4、增肌期 2–3" },
]);

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

// ── Equipment grouping used to make sure alternatives span different gear ──────────────────
const EQUIPMENT_GROUPS = [
  ["cable", /绳索|拉力器|滑轮|cable/i], ["dumbbell", /哑铃|dumbbell/i], ["barbell", /杠铃|barbell/i],
  ["machine", /器械|器材|挂片|machine|leverage|smith|史密斯/i], ["kettlebell", /壶铃|kettlebell/i],
  ["bodyweight", /自重|徒手|bodyweight|body weight|无器械/i], ["band", /弹力带|band/i],
];
export function equipmentGroup(exercise) {
  const text = `${exercise?.equipment || ""} ${exercise?.canonicalNameEn || ""} ${exercise?.name || ""}`;
  for (const [key, pattern] of EQUIPMENT_GROUPS) if (pattern.test(text)) return key;
  return "other";
}

// ── Alternatives ───────────────────────────────────────────────────────────────────────
// Learned from hasaneyldrm/exercises-dataset (see scripts/build_muscle_targets.py): every catalog
// exercise carries a fine-grained `target` muscle. An alternative shares that target (so the
// stimulus is the same) but, preferably, uses different gear so it works when the gym lacks the
// original machine. Without a dataset target we fall back to the coarse category + movement pattern.
export function exerciseAlternatives(exercise, catalog = [], { limit = 3, historyCounts = {}, targets = {} } = {}) {
  if (!exercise) return [];
  const selfId = canonicalExerciseId(exercise.id || exercise.exerciseId || "");
  const category = exerciseCategory(exercise);
  if (["other", "cardio"].includes(category)) return [];
  const ownTarget = targets[selfId]?.target || "";
  const ownGroup = equipmentGroup(exercise);
  const pool = catalog
    .filter((item) => item && canonicalExerciseId(item.id) !== selfId && exerciseCategory(item) === category)
    .map((item) => {
      const group = equipmentGroup(item);
      const sameTarget = Boolean(ownTarget) && targets[canonicalExerciseId(item.id)]?.target === ownTarget;
      const samePattern = Boolean(exercise.movementPattern) && item.movementPattern === exercise.movementPattern;
      let score = (sameTarget ? 5 : 0) + (samePattern ? 3 : 0) + (group !== ownGroup ? 3 : 0);
      if (item.loadMode && item.loadMode === exercise.loadMode) score += 1;
      if (historyCounts[canonicalExerciseId(item.id)]) score += 1;
      if (item.isWger || /^wger_/.test(item.id)) score -= 1;
      return { item, group, sameTarget, samePattern, score };
    })
    .filter((entry) => (ownTarget ? entry.sameTarget : entry.samePattern || entry.score >= 3))
    .sort((a, b) => b.score - a.score || String(a.item.name).localeCompare(String(b.item.name), "zh"));
  const picked = [], usedGroups = new Set([ownGroup]);
  for (const entry of pool) {
    if (picked.length >= limit) break;
    if (!usedGroups.has(entry.group) || entry.group === "other") { picked.push(entry); usedGroups.add(entry.group); }
  }
  for (const entry of pool) { if (picked.length >= limit) break; if (!picked.includes(entry)) picked.push(entry); }
  return picked.map(({ item, group, sameTarget, samePattern }) => ({
    id: item.id, name: item.name, canonicalNameEn: item.canonicalNameEn || "", equipment: item.equipment || "",
    equipmentGroup: group, sameTarget, samePattern,
    reason: `${sameTarget ? `同目标肌 ${ownTarget}` : samePattern ? "同动作模式" : "同肌群"}${group !== ownGroup ? " · 换器材" : ""}`,
  }));
}

// ── Starting-weight suggestion ────────────────────────────────────────────────────────
// Advisory only. The Body.OS rule plan deliberately never estimates 1RM or invents loads; this is a
// separate, clearly labelled starting point the user can accept or ignore.
//  • 1RM: Epley (the repo's estimated1rmKg), reps capped at 12.
//  • Target load for `reps` with `rir` reps in reserve: e1RM / (1 + (reps + rir) / 30) — pure Epley
//    algebra, no extra fudge factor. reps default 10 (inside ACSM 2009's 8–12RM novice range).
//  • Layoff: Mujika & Padilla (full text) report strength performance is largely retained for up to 4 weeks without training,
//    so up to 28 d we keep the last load. Past 28 d no number is invented: we do not scale the weight by a percentage,
//    we only start with the reserve of the user's own return stage (RIR 3). Izquierdo 2007 (abstract only) is cited as the
//    reason for the caution (−6…−9% max strength after 4 weeks of complete cessation), not as a multiplier.
// Reserve targets are the lower bounds of the user'"'"'s own plan (workout_recommendations: return stage RIR 3–4, building stage 2–3).
export const RIR_RETURN = 3, RIR_BUILDING = 2;
export const STALE_AFTER_DAYS = 28; // Mujika & Padilla: <4 weeks = short-term detraining
export function loadForReps(e1rmKg, reps, rir) { return e1rmKg / (1 + (reps + rir) / 30); }

function roundToStep(kg, step) { return Math.max(step, Math.round(kg / step) * step); }
function stepFor(exercise) { return exercise?.loadMode === "per_limb" || equipmentGroup(exercise) === "dumbbell" ? 1 : 2.5; }

function exerciseSessions(snapshot, exerciseId) {
  const sessions = [];
  for (const workout of snapshot?.workoutHistory || []) {
    const startedMs = Date.parse(normalizeTrainingTimestamp(workout.startedAt));
    if (!Number.isFinite(startedMs)) continue;
    const entry = (workout.exercises || []).find((item) => historyExerciseMatches(item, exerciseId));
    if (!entry) continue;
    let bestE1rm = 0, topKg = 0, reps = 0;
    for (const set of entry.sets || []) {
      const kg = workingSetWeightKg(set), count = Number(set.reps);
      if (!kg || !Number.isFinite(count) || count <= 0) continue;
      const e1rm = estimated1rmKg(kg, Math.min(count, 12));
      if (e1rm > bestE1rm) { bestE1rm = e1rm; reps = Math.min(count, 12); }
      topKg = Math.max(topKg, kg);
    }
    if (bestE1rm) sessions.push({ startedMs, e1rm: bestE1rm, topKg, reps });
  }
  return sessions.sort((a, b) => b.startedMs - a.startedMs);
}

// ── Unified load standard & cross-exercise estimate ────────────────────────────────────
// Every comparison happens on TOTAL EXTERNAL LOAD in kg: a dumbbell logged "per hand" counts twice, plates
// logged "per side" count twice (+ a 20 kg Olympic bar when the lift is a barbell), "total" is as logged,
// assisted lifts are excluded (their effective load needs body weight). Machine stacks are on a different
// scale from free weights, so free↔stack conversion is only done from the user's own paired history.
export const LOAD_STANDARD = "total_external_kg";
export const OLYMPIC_BAR_KG = 20;
export const POPULATION_ERROR = 0.08; // Heinecke 2021: total error 7.3–8.2% when predicting barbell 1RM from dumbbell reps
export function equipmentClass(exercise) {
  const group = equipmentGroup(exercise);
  return group === "barbell" || group === "dumbbell" ? "free" : group === "machine" || group === "cable" ? "stack" : null;
}
export function totalLoadKg(set, exercise) {
  const kg = workingSetWeightKg(set);
  if (!kg) return null;
  const mode = set.load_mode || set.loadMode || "total";
  if (mode === "assistance") return null;
  if (mode === "per_limb") return kg * 2;
  if (mode === "per_side") return kg * 2 + (equipmentGroup(exercise) === "barbell" ? OLYMPIC_BAR_KG : 0);
  return kg;
}
export function fromTotalLoad(totalKg, exercise) {
  const mode = exercise?.loadMode || "total";
  if (mode === "per_limb") return totalKg / 2;
  if (mode === "per_side") return Math.max(0, (totalKg - (equipmentGroup(exercise) === "barbell" ? OLYMPIC_BAR_KG : 0)) / 2);
  return totalKg;
}

function totalSessions(snapshot, exercise) {
  const id = canonicalExerciseId(exercise?.id || exercise?.exerciseId || "");
  const sessions = [];
  for (const workout of snapshot?.workoutHistory || []) {
    const startedMs = Date.parse(normalizeTrainingTimestamp(workout.startedAt));
    if (!Number.isFinite(startedMs)) continue;
    const entry = (workout.exercises || []).find((item) => historyExerciseMatches(item, id));
    if (!entry) continue;
    let best = 0;
    for (const set of entry.sets || []) {
      const total = totalLoadKg(set, exercise), reps = Number(set.reps);
      if (!total || !Number.isFinite(reps) || reps <= 0) continue;
      best = Math.max(best, estimated1rmKg(total, Math.min(reps, 12)));
    }
    if (best) sessions.push({ startedMs, e1rm: best });
  }
  return sessions.sort((a, b) => b.startedMs - a.startedMs);
}
const median = (values) => { const v = [...values].sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
export function trendOf(sessions) {
  const recent = sessions.slice(0, 3).map((s) => s.e1rm).reverse();
  if (recent.length < 2) return "unknown";
  return recent.at(-1) > recent[0] * 1.02 ? "up" : recent.at(-1) < recent[0] * 0.98 ? "down" : "flat";
}

// The user's own free↔stack ratio from exercises that train the same muscle (dataset target) and that they have
// both used: stackE1rm / freeE1rm, median over pairs. Needs no target-exercise history.
export function personalStackToFreeRatio(snapshot, catalog, targets) {
  const byTarget = new Map();
  for (const item of catalog) {
    const target = targets[canonicalExerciseId(item.id)]?.target, cls = equipmentClass(item);
    if (!target || !cls) continue;
    const sessions = totalSessions(snapshot, item);
    if (!sessions.length) continue;
    if (!byTarget.has(target)) byTarget.set(target, { free: [], stack: [] });
    byTarget.get(target)[cls].push({ item, e1rm: sessions[0].e1rm });
  }
  const ratios = [];
  for (const { free, stack } of byTarget.values()) for (const f of free) for (const s of stack) ratios.push(s.e1rm / f.e1rm);
  return ratios.length ? { ratio: median(ratios), pairs: ratios.length } : null;
}

export function crossExerciseEstimate({ exercise, snapshot, catalog = [], targets = {}, nowMs = Date.now() } = {}) {
  const selfId = canonicalExerciseId(exercise?.id || exercise?.exerciseId || "");
  const targetClass = equipmentClass(exercise), ownTarget = targets[selfId]?.target;
  if (!targetClass) return null;
  const personal = personalStackToFreeRatio(snapshot, catalog, targets);
  const sources = [];
  for (const item of catalog) {
    if (canonicalExerciseId(item.id) === selfId) continue;
    const sameMuscle = ownTarget ? targets[canonicalExerciseId(item.id)]?.target === ownTarget
      : exerciseCategory(item) === exerciseCategory(exercise) && item.movementPattern === exercise.movementPattern;
    const cls = equipmentClass(item);
    if (!sameMuscle || !cls) continue;
    const sessions = totalSessions(snapshot, item);
    if (!sessions.length) continue;
    const days = Math.max(0, Math.floor((nowMs - sessions[0].startedMs) / DAY_MS));
    let factor, basis;
    if (cls === targetClass && cls === "free") { factor = 1; basis = "population"; }
    else if (cls === targetClass) { factor = 1; basis = "same_class"; }
    else if (personal) { factor = targetClass === "stack" ? personal.ratio : 1 / personal.ratio; basis = "personal"; }
    else continue;
    sources.push({ id: item.id, name: item.name, canonicalNameEn: item.canonicalNameEn || "", basis, factor, days, trend: trendOf(sessions),
      sessions: sessions.length, e1rmTotalKg: sessions[0].e1rm * factor });
  }
  if (!sources.length) return null;
  const e1rm = median(sources.map((x) => x.e1rmTotalKg));
  const populationOnly = sources.every((x) => x.basis === "population");
  return {
    e1rmTotalKg: Math.round(e1rm * 10) / 10, sources: sources.sort((a, b) => a.days - b.days).slice(0, 3),
    basis: sources.some((x) => x.basis === "personal") ? "personal" : "population",
    errorPct: populationOnly ? Math.round(POPULATION_ERROR * 100) : null,
    personalPairs: personal?.pairs || 0,
    sourceIds: sources.some((x) => x.basis === "personal") ? ["acsm2009"] : ["heinecke2021", "acsm2009"],
  };
}

export function suggestWeight({ exercise, snapshot, catalog = [], now = Date.now(), targetReps, targets = {} } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const exerciseId = canonicalExerciseId(exercise?.id || exercise?.exerciseId || "");
  const step = stepFor(exercise);
  const own = exerciseSessions(snapshot, exerciseId);
  if (own.length) {
    const latest = own[0];
    const days = Math.max(0, Math.floor((nowMs - latest.startedMs) / DAY_MS));
    // Best e1RM within 21 days before the latest session so a single deload doesn't drag the estimate down.
    const e1rm = Math.max(...own.filter((s) => latest.startedMs - s.startedMs <= 21 * DAY_MS).map((s) => s.e1rm));
    const reps = Math.min(12, Math.max(8, Number(targetReps) || latest.reps || 10));
    const stale = days > STALE_AFTER_DAYS;
    const rir = stale ? RIR_RETURN : RIR_BUILDING;
    const kg = Math.min(roundToStep(loadForReps(e1rm, reps, rir), step), Math.max(step, latest.topKg));
    return { kind: stale ? "stale" : "history", kg, reps, days, e1rmKg: Math.round(e1rm * 10) / 10, sourceIds: ["acsm2009", "izquierdo2007", "mujika2000", "bodyos-plan"], rir: String(rir) };
  }
  const cross = crossExerciseEstimate({ exercise, snapshot, catalog, targets, nowMs });
  if (cross) {
    const total = loadForReps(cross.e1rmTotalKg, 10, RIR_RETURN);
    let kg = roundToStep(fromTotalLoad(total, exercise), step);
    const bar = equipmentGroup(exercise) === "barbell" && (exercise.loadMode || "total") === "total";
    const belowBar = bar && kg < OLYMPIC_BAR_KG;
    if (belowBar) kg = OLYMPIC_BAR_KG;
    return { kind: "cross", kg, belowBar, totalKg: Math.round(total * 10) / 10, reps: 10, rir: String(RIR_RETURN), ...cross };
  }
  return { kind: "none", kg: null, reps: 10, sourceIds: ["acsm2009", "bodyos-plan"], rir: String(RIR_RETURN) };
}

// ── Recovery planner for the user's chest / back / legs rotation ─────────────────────────
// Day membership comes from the formal plan the Mac publishes (`snapshot.dayPlans`), so lateral raise on
// chest day and rear-delt fly on back day are classified the way the user actually trains them.
// Without dayPlans we fall back to a name/category rule that mirrors that plan.
export const SPLIT_GROUPS = Object.freeze(["chest", "back", "legs"]);
export const SPLIT_LABELS = Object.freeze({ chest: { zh: "胸日（胸·侧平举·三头）", en: "Chest day" }, back: { zh: "背日（背·后束·二头）", en: "Back day" }, legs: { zh: "腿日", en: "Leg day" } });
const TRICEPS = /三头|triceps|臂屈伸|下压|pushdown|kickback|dip|撑/i;
const REAR_DELT = /后束|反向飞鸟|俯身飞鸟|面拉|rear\s*delt|reverse\s*fly|face\s*pull/i;

export function dayPlanIndex(snapshot) {
  const index = new Map();
  for (const plan of snapshot?.dayPlans || []) {
    const key = String(plan.rotationKey || "");
    if (!SPLIT_GROUPS.includes(key)) continue;
    for (const item of plan.exercises || []) if (item.exerciseId) index.set(canonicalExerciseId(item.exerciseId), key);
  }
  return index;
}

export function splitGroupOf(exercise, index = new Map()) {
  const id = canonicalExerciseId(exercise?.id || exercise?.exerciseId || "");
  if (index.has(id)) return index.get(id);
  const text = `${exercise?.name || ""} ${exercise?.canonicalNameEn || ""} ${exercise?.exerciseName || ""}`;
  const category = exerciseCategory(exercise);
  if (category === "legs") return "legs";
  if (category === "back") return "back";
  if (category === "chest") return "chest";
  if (category === "shoulders") return REAR_DELT.test(text) ? "back" : "chest";
  if (category === "arms") return TRICEPS.test(text) ? "chest" : "back";
  return null;
}

// Only sourced thresholds are used (no invented windows):
//  minHours 48            — Body OS plan: "至少约48小时的力量训练间隔" (also the backend's `next_due`).
//  detrainDays 28         — Mujika & Padilla 2000: under 4 weeks is short-term detraining; beyond it strength loss is measurable (Izquierdo 2007).
//  weeklySetsTarget 10    — ACSM 2026: ~10 sets per muscle group per week for hypertrophy.
//  weeklyFrequencyTarget 2 — ACSM 2026: train each major muscle group at least twice a week. Schoenfeld 2019 (25 studies) finds no
//  significant frequency effect when weekly volume is equal, so frequency is shown as an ACSM recommendation, not as a proven requirement.
// No source gives an individual "supercompensation peak", so none is shown: after 48 h a day is simply "ready",
// and the page reports how far weekly frequency and sets are from the ACSM targets.
export const RECOVERY = Object.freeze({ minHours: 48, detrainDays: 28, weeklySetsTarget: 10, weeklyFrequencyTarget: 2, minSetsToCount: 1, spacingDays: 2 });

export function hardSetsByGroup(workout, index = new Map()) {
  const counts = { chest: 0, back: 0, legs: 0 };
  for (const exercise of workout?.exercises || []) {
    const group = splitGroupOf({ id: exercise.exerciseId, exerciseId: exercise.exerciseId, name: exercise.name, canonicalNameEn: exercise.canonicalNameEn }, index);
    if (!group) continue;
    counts[group] += (exercise.sets || []).filter((set) => (set.set_type || "working") !== "warmup" && set.completed !== 0 && Number(set.reps) > 0).length;
  }
  return counts;
}

function statusFor(group, nowMs) {
  if (!group.lastMs) return { status: "never" };
  const hours = (nowMs - group.lastMs) / HOUR_MS;
  const startMs = group.lastMs + RECOVERY.minHours * HOUR_MS;
  const status = hours < RECOVERY.minHours ? "recovering" : hours <= RECOVERY.detrainDays * 24 ? "ready" : "detrain";
  return { status, hours, startMs };
}

export function recoveryPlan(snapshot, { now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const index = dayPlanIndex(snapshot);
  const workouts = (snapshot?.workoutHistory || [])
    .map((workout) => ({ workout, ms: Date.parse(normalizeTrainingTimestamp(workout.startedAt)) }))
    .filter((item) => Number.isFinite(item.ms) && item.ms <= nowMs).sort((a, b) => b.ms - a.ms);
  const groups = Object.fromEntries(SPLIT_GROUPS.map((key) => [key, { key, lastMs: 0, lastSets: 0, weekSets: 0, weekSessions: 0, monthSets: 0 }]));
  for (const { workout, ms } of workouts) {
    const counts = hardSetsByGroup(workout, index);
    for (const key of SPLIT_GROUPS) {
      const sets = counts[key];
      if (!sets) continue;
      if (nowMs - ms <= 7 * DAY_MS) { groups[key].weekSets += sets; groups[key].weekSessions += 1; }
      if (nowMs - ms <= 28 * DAY_MS) groups[key].monthSets += sets;
      if (!groups[key].lastMs && sets >= RECOVERY.minSetsToCount) { groups[key].lastMs = ms; groups[key].lastSets = sets; }
    }
  }
  const sessions28 = workouts.filter(({ ms }) => nowMs - ms <= 28 * DAY_MS).length;
  const rec = snapshot?.recommendation || {};
  const minPace = Number(rec.sessionsPerWeek) || 3, maxPace = Math.max(minPace, Number(rec.sessionsPerWeekMax) || 4);
  const pace = Math.min(maxPace, Math.max(minPace, Math.round(sessions28 / 4)));
  const list = SPLIT_GROUPS.map((key) => {
    const group = groups[key], state = statusFor(group, nowMs);
    return { ...group, ...state, avgWeekSets: Math.round((group.monthSets / 4) * 10) / 10, weekFrequencyGap: Math.max(0, RECOVERY.weeklyFrequencyTarget - group.weekSessions), weekSetsGap: Math.max(0, RECOVERY.weeklySetsTarget - group.weekSets), daysSince: group.lastMs ? Math.floor((nowMs - group.lastMs) / DAY_MS) : null };
  });
  // Body.OS publishes the same windows from the formal plan (recommendation.recovery); when present it is the authority.
  const backend = Array.isArray(rec.recovery?.groups) ? rec.recovery.groups : [];
  for (const item of list) {
    const remote = backend.find((entry) => entry.key === item.key);
    if (!remote) continue;
    const ms = (value) => (value ? Date.parse(value) : 0);
    Object.assign(item, { status: remote.status, lastMs: ms(remote.lastAt), lastSets: remote.lastSets || 0, startMs: ms(remote.startAt), weekSessions: remote.weekSessions ?? item.weekSessions, weekFrequencyGap: Math.max(0, RECOVERY.weeklyFrequencyTarget - (remote.weekSessions ?? item.weekSessions)),
      hours: remote.hoursSince, weekSets: remote.weekSets, monthSets: remote.monthSets, avgWeekSets: remote.avgWeekSets, weekSetsGap: remote.weekSetsGap,
      daysSince: remote.hoursSince == null ? null : Math.floor(remote.hoursSince / 24) });
  }
  // Rotation is strict (胸→背→腿 continues across weeks); the backend publishes whose turn it is and the earliest time.
  const order = SPLIT_GROUPS;
  const published = String(snapshot?.today?.rotationKey || "");
  const lastWorkoutMs = workouts[0]?.ms || 0;
  const lastGroup = lastWorkoutMs ? order.find((key) => hardSetsByGroup(workouts[0].workout, index)[key] > 0) : null;
  const nextKey = order.includes(published) ? published : lastGroup ? order[(order.indexOf(lastGroup) + 1) % order.length] : order[0];
  const dueMs = Date.parse(rec.due?.nextAt || "");
  const earliestMs = Number.isFinite(dueMs) ? dueMs : lastWorkoutMs ? lastWorkoutMs + RECOVERY.minHours * HOUR_MS : nowMs;
  const idleDays = lastWorkoutMs ? Math.floor((nowMs - lastWorkoutMs) / DAY_MS) : null;
  const next = { key: nextKey, earliestMs, readyNow: nowMs >= earliestMs, idleDays, group: list.find((item) => item.key === nextKey) };
  // 7-day forecast: strict rotation from `nextKey`, every other day (≥48 h), at most `pace` sessions.
  const forecast = [];
  const midnight = new Date(nowMs); midnight.setHours(0, 0, 0, 0);
  let used = 0, rotation = order.indexOf(nextKey), nextMs = Math.max(nowMs, earliestMs);
  for (let offset = 0; offset < 7; offset++) {
    const start = new Date(midnight); start.setDate(start.getDate() + offset);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    if (used < pace && nextMs < end.getTime()) {
      forecast.push({ offset, dayMs: start.getTime(), group: order[rotation % order.length] });
      rotation += 1; used += 1; nextMs = Math.max(nextMs, start.getTime()) + RECOVERY.spacingDays * DAY_MS;
    } else forecast.push({ offset, dayMs: start.getTime(), group: null });
  }
  // Each muscle repeats once per full rotation, so sessions/week ÷ 3 is its weekly frequency.
  return { pace, minPace, maxPace, perGroupFrequency: Math.round((pace / order.length) * 10) / 10, groups: list, next, forecast, sessions28, rules: RECOVERY, sources: GUIDANCE_SOURCES, usedDayPlans: index.size > 0, fromBodyOs: backend.length > 0 };
}
