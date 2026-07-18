export const SCHEMA_VERSION = "body.os.quick-workout.v1";

export const EXERCISE_CATALOG_VERSION = 2;
export const LEGACY_EXERCISE_ID_MAP = Object.freeze({
  assisted_pull_up: "assisted_close_grip_pull_up",
  barbell_flat_chest_press: "barbell_bench_press",
  barbell_incline_chest_press: "barbell_incline_bench_press",
  incline_chest_press_machine: "incline_chest_press",
  pull_up: "exercise_298c060030f546e396d029c2a7c85a8b",
  lat_pulldown: "exercise_df333f4be7bd42bcbd5ef67b9b94847d",
  face_pull: "exercise_4f579027f9d8415a92ced94cb23d7783",
  barbell_back_squat: "exercise_53c4ce823a084c1ab67365256425f567",
  romanian_deadlift: "exercise_dd433adf74c9471787f855dded3ae8eb",
  cable_chest_fly: "exercise_73cb585f6e2f4941910f4cfb7ed45058",
  leg_press: "exercise_2c05680b485547c8a9782be6aa732107",
  leg_curl: "exercise_912f4b3f4217460b954799c2d9715013",
  dumbbell_biceps_curl: "exercise_e82365030efe4a2184e0d6f9ea11d8f6",
  triceps_pushdown: "exercise_73736180be204738855209eb753687c1",
});

export const canonicalExerciseId = (id) => LEGACY_EXERCISE_ID_MAP[id] || id;

export function mergeExerciseCatalog(base, cached = []) {
  const builtIn = (base || []).map((item) => ({ ...item, id: canonicalExerciseId(item.id) }));
  const seen = new Set(builtIn.map((item) => item.id));
  const custom = (cached || []).filter((item) => item?.isCustom).map((item) => ({ ...item, id: canonicalExerciseId(item.id) })).filter((item) => item.id && !seen.has(item.id));
  return [...builtIn, ...custom];
}

export const FALLBACK_EXERCISES = [
  ["dumbbell_flat_chest_press", "哑铃平板推胸", "Dumbbell Bench Press", "哑铃", "horizontal_push", "per_limb", "bilateral_simultaneous", 2],
  ["dumbbell_incline_chest_press", "哑铃上斜推胸", "Incline Dumbbell Press", "哑铃", "horizontal_push", "per_limb", "bilateral_simultaneous", 2],
  ["barbell_flat_chest_press", "杠铃平板卧推", "Barbell Bench Press", "杠铃", "horizontal_push", "total", "bilateral", 1],
  ["barbell_incline_chest_press", "杠铃上斜卧推", "Incline Barbell Press", "杠铃", "horizontal_push", "total", "bilateral", 1],
  ["incline_chest_press_machine", "上斜推胸器械", "Incline Chest Press Machine", "器械", "horizontal_push", "per_side", "bilateral_simultaneous", 2],
  ["seated_dumbbell_shoulder_press", "坐姿哑铃推肩", "Seated Dumbbell Shoulder Press", "哑铃", "vertical_push", "per_limb", "bilateral_simultaneous", 2],
  ["standing_dumbbell_lateral_raise", "站姿哑铃侧平举", "Standing Dumbbell Lateral Raise", "哑铃", "shoulder_abduction", "per_limb", "bilateral_simultaneous", 2],
  ["dumbbell_front_raise", "哑铃前平举", "Dumbbell Front Raise", "哑铃", "shoulder_flexion", "per_limb", "bilateral_simultaneous", 2],
  ["seated_bent_over_reverse_fly", "坐姿俯身飞鸟", "Seated Bent-over Reverse Fly", "哑铃", "horizontal_pull", "per_limb", "bilateral_simultaneous", 2],
  ["wide_grip_lat_pulldown", "宽握高位下拉", "Wide-grip Lat Pulldown", "器械", "vertical_pull", "total", "bilateral", 1],
  ["wide_grip_lat_pulldown_machine", "宽握高位下拉器械", "Wide Grip Pull Down Machine", "器械", "vertical_pull", "total", "bilateral", 1],
  ["arm_down_back_machine", "直臂下拉器械", "Lever Pullover", "器械", "shoulder_extension", "total", "bilateral", 1],
  ["close_grip_seated_row", "窄握坐姿划船", "Close-grip Seated Row", "器械", "horizontal_pull", "total", "bilateral", 1],
  ["assisted_pull_up", "辅助引体向上", "Assisted Pull-up", "辅助器械", "vertical_pull", "assistance", "bilateral", 1],
  ["pull_up", "引体向上", "Pull-Up", "单杠", "vertical_pull", "total", "bilateral", 1],
  ["chin_up", "反握引体向上", "Chin-Up", "单杠", "vertical_pull", "total", "bilateral", 1],
  ["wide_grip_pull_up", "宽握引体向上", "Wide-Grip Pull-Up", "单杠", "vertical_pull", "total", "bilateral", 1],
  ["neutral_grip_pull_up", "对握引体向上", "Neutral-Grip Pull-Up", "单杠", "vertical_pull", "total", "bilateral", 1],
  ["archer_pull_up", "弓箭手引体向上", "Archer Pull-Up", "单杠", "vertical_pull", "total", "unilateral", 1],
  ["lat_pulldown", "高位下拉", "Lat Pulldown", "绳索", "vertical_pull", "total", "bilateral", 1],
  ["close_grip_lat_pulldown", "窄握高位下拉", "Close-Grip Lat Pulldown", "绳索", "vertical_pull", "total", "bilateral", 1],
  ["neutral_grip_lat_pulldown", "对握高位下拉", "Neutral-Grip Lat Pulldown", "绳索", "vertical_pull", "total", "bilateral", 1],
  ["underhand_lat_pulldown", "反握高位下拉", "Underhand Lat Pulldown", "绳索", "vertical_pull", "total", "bilateral", 1],
  ["single_arm_lat_pulldown", "单臂高位下拉", "Single-Arm Lat Pulldown", "绳索", "vertical_pull", "per_limb", "unilateral", 1],
  ["straight_arm_pulldown", "直臂下拉", "Straight-Arm Pulldown", "绳索", "shoulder_extension", "total", "bilateral", 1],
  ["seated_cable_row", "坐姿绳索划船", "Seated Cable Row", "绳索", "horizontal_pull", "total", "bilateral", 1],
  ["wide_grip_seated_row", "宽握坐姿划船", "Wide-Grip Seated Row", "绳索", "horizontal_pull", "total", "bilateral", 1],
  ["single_arm_cable_row", "单臂绳索划船", "Single-Arm Cable Row", "绳索", "horizontal_pull", "per_limb", "unilateral", 1],
  ["barbell_row", "杠铃俯身划船", "Barbell Bent-Over Row", "杠铃", "horizontal_pull", "total", "bilateral", 1],
  ["underhand_barbell_row", "反握杠铃划船", "Underhand Barbell Row", "杠铃", "horizontal_pull", "total", "bilateral", 1],
  ["pendlay_row", "彭德雷划船", "Pendlay Row", "杠铃", "horizontal_pull", "total", "bilateral", 1],
  ["t_bar_row", "T 杠划船", "T-Bar Row", "器械", "horizontal_pull", "total", "bilateral", 1],
  ["meadows_row", "梅多斯划船", "Meadows Row", "杠铃", "horizontal_pull", "total", "unilateral", 1],
  ["one_arm_dumbbell_row", "单臂哑铃划船", "One-Arm Dumbbell Row", "哑铃", "horizontal_pull", "per_limb", "unilateral", 1],
  ["chest_supported_dumbbell_row", "胸托哑铃划船", "Chest-Supported Dumbbell Row", "哑铃与训练凳", "horizontal_pull", "per_limb", "bilateral_simultaneous", 2],
  ["incline_dumbbell_row", "上斜凳哑铃划船", "Incline Dumbbell Row", "哑铃与上斜凳", "horizontal_pull", "per_limb", "bilateral_simultaneous", 2],
  ["machine_row", "坐姿器械划船", "Seated Row Machine", "器械", "horizontal_pull", "total", "bilateral", 1],
  ["high_row_machine", "高位划船器械", "High Row Machine", "器械", "horizontal_pull", "per_side", "bilateral_simultaneous", 2],
  ["inverted_row", "反向划船", "Inverted Row", "自重", "horizontal_pull", "total", "bilateral", 1],
  ["face_pull", "面拉", "Face Pull", "绳索", "horizontal_pull", "total", "bilateral", 1],
  ["cable_pullover", "绳索直臂上拉", "Cable Pullover", "绳索", "shoulder_extension", "total", "bilateral", 1],
  ["dumbbell_pullover", "哑铃上拉", "Dumbbell Pullover", "哑铃与训练凳", "shoulder_extension", "total", "bilateral", 1],
  ["back_extension", "罗马椅背伸", "Back Extension", "罗马椅", "hinge", "total", "bilateral", 1],
  ["barbell_back_squat", "杠铃深蹲", "Barbell Back Squat", "杠铃", "squat", "total", "bilateral", 1],
  ["romanian_deadlift", "罗马尼亚硬拉", "Romanian Deadlift", "杠铃", "hinge", "total", "bilateral", 1],
  // Common movements curated from the wger public exercise catalogue.  Names
  // are stored locally for offline use; no wger media or descriptions are copied.
  ["push_up", "俯卧撑", "Push-Up", "自重", "horizontal_push", "total", "bilateral", 1],
  ["dip", "双杠臂屈伸", "Dip", "双杠", "horizontal_push", "total", "bilateral", 1],
  ["cable_chest_fly", "绳索夹胸", "Cable Chest Fly", "绳索", "horizontal_push", "per_side", "bilateral_simultaneous", 2],
  ["pec_deck", "蝴蝶机夹胸", "Pec Deck Fly", "器械", "horizontal_push", "total", "bilateral", 1],
  ["landmine_press", "地雷管推举", "Landmine Press", "杠铃", "vertical_push", "per_limb", "unilateral", 1],
  ["arnold_press", "阿诺德推举", "Arnold Press", "哑铃", "vertical_push", "per_limb", "bilateral_simultaneous", 2],
  ["cable_lateral_raise", "绳索侧平举", "Cable Lateral Raise", "绳索", "shoulder_abduction", "per_limb", "unilateral", 1],
  ["rear_delt_fly_machine", "反向蝴蝶机", "Reverse Pec Deck", "器械", "horizontal_pull", "total", "bilateral", 1],
  ["shrug", "杠铃耸肩", "Barbell Shrug", "杠铃", "shoulder_elevation", "total", "bilateral", 1],
  ["dumbbell_shrug", "哑铃耸肩", "Dumbbell Shrug", "哑铃", "shoulder_elevation", "per_limb", "bilateral_simultaneous", 2],
  ["deadlift", "传统硬拉", "Conventional Deadlift", "杠铃", "hinge", "total", "bilateral", 1],
  ["sumo_deadlift", "相扑硬拉", "Sumo Deadlift", "杠铃", "hinge", "total", "bilateral", 1],
  ["hip_thrust", "杠铃臀推", "Barbell Hip Thrust", "杠铃", "hinge", "total", "bilateral", 1],
  ["leg_press", "腿举", "Leg Press", "器械", "squat", "total", "bilateral", 1],
  ["hack_squat", "哈克深蹲", "Hack Squat", "器械", "squat", "total", "bilateral", 1],
  ["goblet_squat", "高脚杯深蹲", "Goblet Squat", "哑铃", "squat", "total", "bilateral", 1],
  ["bulgarian_split_squat", "保加利亚分腿蹲", "Bulgarian Split Squat", "哑铃", "squat", "per_limb", "unilateral", 1],
  ["walking_lunge", "行走弓步", "Walking Lunge", "哑铃", "squat", "per_limb", "alternating", 1],
  ["leg_extension", "腿屈伸", "Leg Extension", "器械", "knee_extension", "total", "bilateral", 1],
  ["leg_curl", "腿弯举", "Leg Curl", "器械", "knee_flexion", "total", "bilateral", 1],
  ["seated_calf_raise", "坐姿提踵", "Seated Calf Raise", "器械", "calf_raise", "total", "bilateral", 1],
  ["standing_calf_raise", "站姿提踵", "Standing Calf Raise", "器械", "calf_raise", "total", "bilateral", 1],
  ["barbell_biceps_curl", "杠铃弯举", "Barbell Curl", "杠铃", "elbow_flexion", "total", "bilateral", 1],
  ["dumbbell_biceps_curl", "哑铃弯举", "Dumbbell Curl", "哑铃", "elbow_flexion", "per_limb", "bilateral_simultaneous", 2],
  ["hammer_curl", "锤式弯举", "Hammer Curl", "哑铃", "elbow_flexion", "per_limb", "bilateral_simultaneous", 2],
  ["preacher_curl", "牧师凳弯举", "Preacher Curl", "器械", "elbow_flexion", "total", "bilateral", 1],
  ["triceps_pushdown", "绳索下压", "Triceps Pushdown", "绳索", "elbow_extension", "total", "bilateral", 1],
  ["overhead_triceps_extension", "过顶臂屈伸", "Overhead Triceps Extension", "哑铃", "elbow_extension", "total", "bilateral", 1],
  ["skull_crusher", "仰卧臂屈伸", "Lying Triceps Extension", "杠铃", "elbow_extension", "total", "bilateral", 1],
].map(([id, name, canonicalNameEn, equipment, movementPattern, loadMode, executionMode, sideCount]) => ({
  id: canonicalExerciseId(id), name, canonicalNameEn, equipment, movementPattern, loadMode, executionMode, sideCount,
}));

export const LOAD_LABELS = {
  total: "总重量", per_side: "每边配重", per_limb: "单边 / 每手", assistance: "辅助重量",
};

const number = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function createSession(now = new Date()) {
  const startedAt = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `qws_${now.getTime().toString(36)}_${cryptoRandom()}`,
    title: `${new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(now)} 力量训练`,
    startedAt, endedAt: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei",
    sets: [], currentExerciseId: "", rest: null,
    timer: { running: false, elapsedMs: 0, startedAtMs: null },
    sync: { status: "local", draftId: "", workoutId: "" }, updatedAt: startedAt,
  };
}

function cryptoRandom() {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return (values[0] || Math.floor(Math.random() * 2 ** 32)).toString(36);
}

export function normalizeSet(input) {
  const loadMode = ["total", "per_side", "per_limb", "assistance"].includes(input.loadMode) ? input.loadMode : "total";
  return {
    ...input,
    weightValue: Math.max(0, number(input.weightValue, 0)), weightUnit: input.weightUnit === "lb" ? "lb" : "kg",
    reps: Math.max(0, Math.round(number(input.reps, 0))),
    rir: input.rir === "" || input.rir == null ? null : Math.min(10, Math.max(0, number(input.rir, null))),
    rpe: input.rpe === "" || input.rpe == null ? null : Math.min(10, Math.max(1, number(input.rpe, null))),
    rer: input.rer === "" || input.rer == null ? null : Math.min(2, Math.max(.5, number(input.rer, null))),
    restSeconds: Math.min(7200, Math.max(0, Math.round(number(input.restSeconds, 0)))), loadMode,
    executionMode: ["left", "right", "alternating"].includes(input.side) ? "unilateral" : (input.executionMode || (loadMode === "per_limb" ? "bilateral_simultaneous" : "bilateral")),
    sideCount: loadMode === "per_side" || loadMode === "per_limb" ? (["left", "right"].includes(input.side) ? 1 : 2) : 1,
    notes: String(input.notes || "").slice(0, 1000), completedAt: input.completedAt || new Date().toISOString(),
  };
}

export function calculateSetVolume(set, bodyWeight = null) {
  const reps = number(set.reps, 0); const factor = set.weightUnit === "lb" ? 0.45359237 : 1; const weight = number(set.weightValue, 0) * factor;
  if (!reps) return 0;
  if (set.loadMode === "assistance") return bodyWeight == null ? null : Math.max(0, bodyWeight - weight) * reps;
  if (set.loadMode === "per_limb" && (set.left || set.right)) {
    return factor * (number(set.left?.weight, 0) * number(set.left?.reps, 0) + number(set.right?.weight, 0) * number(set.right?.reps, 0));
  }
  return weight * reps * (["per_side", "per_limb"].includes(set.loadMode) ? number(set.sideCount, 2) : 1);
}

export function timerElapsedMs(session, nowMs = Date.now()) {
  const timer = session?.timer || {};
  const stored = Math.max(0, number(timer.elapsedMs, 0));
  return timer.running && timer.startedAtMs ? stored + Math.max(0, nowMs - timer.startedAtMs) : stored;
}

export function restRemainingSeconds(rest, nowMs = Date.now()) {
  if (!rest) return 0;
  if (rest.running && rest.endsAt) return Math.max(0, Math.ceil((rest.endsAt - nowMs) / 1000));
  return Math.max(0, Math.ceil(number(rest.remainingSeconds, rest.durationSeconds || 0)));
}

export function withoutExercise(session, exerciseId) {
  return {
    ...session,
    sets: (session.sets || []).filter((set) => set.exerciseId !== exerciseId),
    currentExerciseId: session.currentExerciseId === exerciseId ? "" : session.currentExerciseId,
    rest: null,
  };
}

export function sessionSummary(session) {
  const exercises = new Set(session.sets.map((set) => set.exerciseId));
  const volumes = session.sets.map((set) => calculateSetVolume(set, session.bodyWeightKg)).filter((value) => value != null);
  return {
    exerciseCount: exercises.size, setCount: session.sets.length, reps: session.sets.reduce((sum, set) => sum + number(set.reps, 0), 0),
    volume: Math.round(volumes.reduce((sum, value) => sum + value, 0) * 10) / 10,
    durationMinutes: Math.max(0, Math.round(timerElapsedMs(session) / 60000)),
  };
}

export function buildBodyCandidate(session) {
  const grouped = new Map();
  session.sets.forEach((set) => {
    const exerciseId = canonicalExerciseId(set.exerciseId);
    if (!grouped.has(exerciseId)) grouped.set(exerciseId, []);
    grouped.get(exerciseId).push({ ...set, exerciseId });
  });
  const markdown = toMarkdown(session);
  const exercises = [...grouped.entries()].map(([exerciseId, sets], orderIndex) => ({
    exerciseCanonicalId: exerciseId, originalExerciseName: sets[0].exerciseName, displayName: sets[0].exerciseName,
    canonicalNameEn: sets[0].canonicalNameEn || "", movementPattern: sets[0].movementPattern || "", equipment: sets[0].equipment || "",
    orderIndex: orderIndex + 1, startTime: sets[0].completedAt, endTime: sets.at(-1).completedAt, timePrecision: "exact", notes: "",
    confidence: { exercise: 1 }, sets: sets.map((set, index) => {
      const item = normalizeSet({ ...set });
      const result = {
        setIndex: index + 1, setType: item.setType || "working", weightValue: item.weightValue, weightUnit: item.weightUnit || "kg",
        loadMode: item.loadMode, executionMode: item.executionMode || (item.loadMode === "per_limb" ? "bilateral_simultaneous" : "bilateral"),
        sideCount: item.sideCount, reps: item.reps, restSeconds: item.restSeconds || null, painScore: item.painScore ?? null,
        isFailure: Boolean(item.isFailure), completed: true, notes: item.notes, completedAt: item.completedAt,
        timestampPrecision: "exact", confidence: { overall: 1 },
      };
      ["rir", "rpe", "rer"].forEach((key) => { if (item[key] != null) result[key] = item[key]; });
      ["gripWidth", "gripOrientation"].forEach((key) => { if (item[key]) result[key] = item[key]; });
      if (item.loadMode === "per_limb") {
        result.left = item.left || { weight: item.weightValue, reps: item.side === "right" ? 0 : item.reps };
        result.right = item.right || { weight: item.weightValue, reps: item.side === "left" ? 0 : item.reps };
      }
      if (item.loadMode === "assistance") {
        result.assistanceWeight = item.weightValue;
        if (session.bodyWeightKg != null) {
          const factor = item.weightUnit === "lb" ? 0.45359237 : 1;
          result.bodyWeight = session.bodyWeightKg;
          result.effectiveLoad = Math.round(Math.max(0, session.bodyWeightKg - item.weightValue * factor) * 1000) / 1000;
        }
      }
      return result;
    }),
  }));
  return {
    sourceType: "manual", rawInput: markdown, normalizedInput: markdown, workoutType: "traditional_strength_training",
    sourceStartedAt: session.startedAt, sourceEndedAt: session.endedAt || new Date().toISOString(), messageTimes: [], exercises,
    confidence: { overall: 1 }, needsConfirmation: true, uncertainFields: [], warnings: [],
    summary: { ...sessionSummary(session) }, parserVersion: "quick-workout-pwa-v1",
  };
}

export function toMarkdown(session) {
  const lines = [`# ${session.title}`, "", `- 开始：${session.startedAt}`, `- 结束：${session.endedAt || "进行中"}`, ""];
  let last = "";
  session.sets.forEach((set) => {
    if (set.exerciseId !== last) { lines.push(`## ${set.exerciseName}`); last = set.exerciseId; }
    const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(set.completedAt));
    const gripWidth = { wide: "宽距", medium: "中距", close: "窄距" }[set.gripWidth] || "";
    const gripOrientation = { pronated: "正握", supinated: "反握", neutral: "对握" }[set.gripOrientation] || "";
    const extras = [gripWidth, gripOrientation, set.rir != null ? `RIR ${set.rir}` : "", set.rpe != null ? `RPE ${set.rpe}` : "", set.rer != null ? `RER ${set.rer}` : "", set.notes || ""].filter(Boolean).join(" · ");
    lines.push(`- ${time} ${LOAD_LABELS[set.loadMode] || "重量"} ${set.weightValue}${set.weightUnit || "kg"} × ${set.reps} 次${extras ? ` · ${extras}` : ""}`);
  });
  return lines.join("\n");
}

export function createExport(session) {
  return { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), session: { ...session }, bodyOsCandidate: buildBodyCandidate(session) };
}
