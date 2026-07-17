export const SCHEMA_VERSION = "body.os.quick-workout.v1";

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
].map(([id, name, canonicalNameEn, equipment, movementPattern, loadMode, executionMode, sideCount]) => ({
  id, name, canonicalNameEn, equipment, movementPattern, loadMode, executionMode, sideCount,
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
    if (!grouped.has(set.exerciseId)) grouped.set(set.exerciseId, []);
    grouped.get(set.exerciseId).push(set);
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
