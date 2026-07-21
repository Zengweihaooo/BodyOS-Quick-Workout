import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISE_REFERENCES, FALLBACK_EXERCISES, LEGACY_EXERCISE_ID_MAP, applyRecordingMode, buildBodyCandidate, calculateSetVolume, canonicalExerciseId, createSession, mergeExerciseCatalog, nextSetDraft, recordingModeForSet, restRemainingSeconds, sessionSummary, timerElapsedMs, toMarkdown, withoutExercise } from "../core.js";

const base = { exerciseId: "press", exerciseName: "哑铃推胸", weightValue: 10, weightUnit: "kg", reps: 12, completedAt: "2026-07-15T21:00:00+08:00", restSeconds: 90 };

test("four load semantics calculate safely", () => {
  assert.equal(calculateSetVolume({ ...base, loadMode: "total" }), 120);
  assert.equal(calculateSetVolume({ ...base, loadMode: "per_side", sideCount: 2 }), 240);
  assert.equal(calculateSetVolume({ ...base, loadMode: "per_limb", sideCount: 2 }), 240);
  assert.equal(calculateSetVolume({ ...base, loadMode: "assistance" }), null);
  assert.equal(calculateSetVolume({ ...base, loadMode: "assistance" }, 75), 780);
});

test("asymmetric limbs use each side", () => assert.equal(calculateSetVolume({ ...base, loadMode: "per_limb", left: { weight: 10, reps: 12 }, right: { weight: 8, reps: 10 } }), 200));

test("one-sided work is not doubled", () => assert.equal(calculateSetVolume({ ...base, loadMode: "per_limb", side: "left", sideCount: 1 }), 120));

test("one recording-mode field owns load and side semantics", () => {
  const right = applyRecordingMode(base, "per_limb_right");
  assert.deepEqual({ mode: right.loadMode, side: right.side, execution: right.executionMode, count: right.sideCount }, { mode: "per_limb", side: "right", execution: "unilateral", count: 1 });
  assert.equal(recordingModeForSet(right), "per_limb_right");
  assert.equal(nextSetDraft(right).side, "left");
  assert.equal(nextSetDraft(nextSetDraft(right)).side, "right");
});

test("pounds are converted to kg for volume", () => assert.ok(Math.abs(calculateSetVolume({ ...base, weightValue: 20, weightUnit: "lb", loadMode: "total", reps: 10 }) - 90.718474) < 0.000001));

test("manual timers only advance while running", () => {
  const session = createSession(new Date("2026-07-15T12:00:00Z"));
  assert.equal(timerElapsedMs(session, 5000), 0);
  session.timer = { running: true, elapsedMs: 3000, startedAtMs: 5000 };
  assert.equal(timerElapsedMs(session, 9000), 7000);
  assert.equal(restRemainingSeconds({ running: false, remainingSeconds: 90 }, 9000), 90);
  assert.equal(restRemainingSeconds({ running: true, endsAt: 19000 }, 9000), 10);
});

test("deleting an exercise removes all of its sets and clears its rest", () => {
  const session = createSession(new Date("2026-07-15T12:00:00Z"));
  session.currentExerciseId = "press"; session.rest = { remainingSeconds: 90 };
  session.sets = [{ ...base, exerciseId: "press" }, { ...base, exerciseId: "row" }];
  const next = withoutExercise(session, "press");
  assert.deepEqual(next.sets.map((set) => set.exerciseId), ["row"]);
  assert.equal(next.currentExerciseId, ""); assert.equal(next.rest, null);
});

test("candidate preserves timestamp, RIR and load mode", () => {
  const session = createSession(new Date("2026-07-15T12:00:00Z"));
  session.endedAt = "2026-07-15T13:00:00Z";
  session.sets.push({ ...base, loadMode: "per_limb", sideCount: 2, executionMode: "bilateral_simultaneous", rir: 2, notes: "稳定" });
  const candidate = buildBodyCandidate(session); const set = candidate.exercises[0].sets[0];
  assert.equal(set.loadMode, "per_limb"); assert.equal(set.rir, 2); assert.equal(set.completedAt, base.completedAt); assert.deepEqual(set.left, { weight: 10, reps: 12 });
  assert.match(toMarkdown(session), /哑铃推胸/); assert.equal(sessionSummary(session).volume, 240);
});

test("assisted pull-up exports hidden effective load and grip semantics", () => {
  const session = createSession(new Date("2026-07-17T12:00:00Z"));
  session.bodyWeightKg = 72.4;
  session.sets.push({ ...base, exerciseId: "assisted_pull_up", exerciseName: "辅助引体向上", loadMode: "assistance", weightValue: 25, reps: 8, gripWidth: "wide", gripOrientation: "pronated" });
  const set = buildBodyCandidate(session).exercises[0].sets[0];
  assert.equal(buildBodyCandidate(session).exercises[0].exerciseCanonicalId, "assisted_close_grip_pull_up");
  assert.equal(set.bodyWeight, 72.4); assert.equal(set.assistanceWeight, 25); assert.equal(set.effectiveLoad, 47.4);
  assert.equal(set.gripWidth, "wide"); assert.equal(set.gripOrientation, "pronated");
  assert.equal(sessionSummary(session).volume, 379.2); assert.match(toMarkdown(session), /宽距 · 正握/);
});

test("legacy action ids migrate to Body OS canonical ids", () => {
  assert.equal(canonicalExerciseId("barbell_flat_chest_press"), "barbell_bench_press");
  assert.equal(canonicalExerciseId("lat_pulldown"), "wide_grip_lat_pulldown");
  assert.equal(canonicalExerciseId("flat_chest_press"), "dumbbell_flat_chest_press");
  assert.equal(canonicalExerciseId("exercise_298c060030f546e396d029c2a7c85a8b"), "pull_up");
  assert.equal(canonicalExerciseId("unknown_custom"), "unknown_custom");
  assert.ok(Object.values(LEGACY_EXERCISE_ID_MAP).every((id) => !id.startsWith("exercise_")));
  assert.equal(new Set(FALLBACK_EXERCISES.map((item) => item.id)).size, FALLBACK_EXERCISES.length);
});

test("reviewed Body OS references use allowlisted URLs and separated sources", () => {
  assert.equal(Object.keys(EXERCISE_REFERENCES).length, 53);
  assert.equal(new Set(Object.values(EXERCISE_REFERENCES).map((item) => item.datasetId)).size, 53);
  assert.ok(Object.keys(EXERCISE_REFERENCES).every((id) => FALLBACK_EXERCISES.some((item) => item.id === id)));
  for (const [id, reference] of Object.entries(EXERCISE_REFERENCES)) {
    const gif = new URL(reference.gifUrl);
    assert.equal(gif.protocol, "https:", id);
    assert.equal(gif.hostname, "raw.githubusercontent.com", id);
    assert.ok(gif.pathname.startsWith("/hasaneyldrm/exercises-dataset/"), id);
    assert.equal(reference.detailsProvider, "wger", id);
    assert.ok(Array.isArray(reference.instructionsEn), id);
    assert.ok(Array.isArray(reference.instructionsZh), id);
    if (reference.wger) {
      assert.equal(reference.detailsStatus, "ready", id);
      assert.ok(reference.instructionsEn.length, id);
      assert.equal(reference.instructionsEn[0], reference.wger.descriptionEn, id);
      assert.ok(reference.wger.license?.short_name, id);
      const page = new URL(reference.wger.pageUrl);
      assert.equal(page.hostname, "wger.de", id);
      assert.match(page.pathname, /^\/en\/exercise\/\d+$/, id);
    } else {
      assert.equal(reference.detailsStatus, "pending", id);
      assert.deepEqual(reference.instructionsEn, [], id);
      assert.deepEqual(reference.instructionsZh, [], id);
    }
  }
});

test("mobile catalog contains the history-critical machine actions", () => {
  const ids = new Set(FALLBACK_EXERCISES.map((item) => item.id));
  for (const id of ["arm_down_back_machine", "assisted_close_grip_pull_up", "incline_chest_press", "wide_grip_lat_pulldown_machine"]) assert.ok(ids.has(id), id);
  assert.equal(EXERCISE_REFERENCES.wide_grip_lat_pulldown_machine.datasetId, "0579");
  assert.equal(EXERCISE_REFERENCES.wide_grip_lat_pulldown_machine.wger.matchType, "reference");
  assert.equal(EXERCISE_REFERENCES.single_arm_cable_lateral_raise.datasetId, "0192");
  assert.equal(EXERCISE_REFERENCES.seated_dumbbell_lateral_raise.datasetId, "0396");
  assert.equal(EXERCISE_REFERENCES.seated_dumbbell_lateral_raise.wger.id, 918);
  assert.equal(EXERCISE_REFERENCES.machine_reverse_fly.datasetId, "0602");
  assert.equal(EXERCISE_REFERENCES.machine_reverse_fly.wger.id, 2464);
  assert.equal(EXERCISE_REFERENCES.face_pull.wger.id, 222);
  const names = Object.fromEntries(FALLBACK_EXERCISES.map((item) => [item.id, [item.name, item.canonicalNameEn]]));
  assert.deepEqual(names.single_arm_cable_lateral_raise, ["绳索侧平举", "Cable Lateral Raise"]);
  assert.deepEqual(names.seated_dumbbell_lateral_raise, ["坐姿哑铃侧平举", "Seated Dumbbell Lateral Raise"]);
  assert.deepEqual(names.machine_reverse_fly, ["反向飞鸟（器械）", "Rear Delt Fly Machine"]);
  assert.deepEqual(names.face_pull, ["面拉", "Face Pull"]);
  assert.equal(EXERCISE_REFERENCES.cable_front_raise.wger.id, 1731);
  assert.equal(EXERCISE_REFERENCES.dead_bug.wger.id, 178);
  assert.equal(EXERCISE_REFERENCES.elliptical_low_intensity.wger.id, 962);
});

test("stale IndexedDB rows cannot replace new built-ins and custom rows survive", () => {
  const merged = mergeExerciseCatalog(
    [{ id: "assisted_close_grip_pull_up", name: "新版动作", catalogVersion: 2 }],
    [{ id: "assisted_pull_up", name: "旧版动作" }, { id: "custom_keep", name: "我的动作", isCustom: true }],
  );
  assert.deepEqual(merged.map((item) => item.id), ["assisted_close_grip_pull_up", "custom_keep"]);
  assert.equal(merged[0].name, "新版动作");
});
