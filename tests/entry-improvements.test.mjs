import test from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_EXERCISES, canonicalExerciseId, gripVariantFor, gripVariantFamily, snapshotWithCoreFinishers, withCoreFinisher, SPLIT_CORE_FINISHERS } from "../core.js";
import { dayPlanIndex } from "../guidance.js";

const ids = new Set(FALLBACK_EXERCISES.map((row) => canonicalExerciseId(Array.isArray(row) ? row[0] : row.id)));

test("lat pulldown grip picks the matching variant", () => {
  assert.equal(gripVariantFor("wide_grip_lat_pulldown", { gripWidth: "close", gripOrientation: "pronated" }), "close_grip_lat_pulldown");
  assert.equal(gripVariantFor("wide_grip_lat_pulldown", { gripWidth: "medium", gripOrientation: "supinated" }), "underhand_lat_pulldown");
  assert.equal(gripVariantFor("close_grip_lat_pulldown", { gripWidth: "close", gripOrientation: "neutral" }), "neutral_grip_lat_pulldown");
  assert.equal(gripVariantFor("underhand_lat_pulldown", { gripWidth: "wide", gripOrientation: "pronated" }), "wide_grip_lat_pulldown");
  assert.equal(gripVariantFor("wide_grip_lat_pulldown", { gripWidth: "medium", gripOrientation: "pronated" }), "", "no medium pronated variant: keep current");
  assert.equal(gripVariantFor("wide_grip_lat_pulldown", { gripWidth: "wide", gripOrientation: "pronated" }), "", "already matching");
});

test("rows follow grip width and orientation", () => {
  assert.equal(gripVariantFor("seated_cable_row", { gripWidth: "wide", gripOrientation: "pronated" }), "wide_grip_seated_row");
  assert.equal(gripVariantFor("seated_cable_row", { gripWidth: "medium", gripOrientation: "neutral" }), "close_grip_seated_row");
  assert.equal(gripVariantFor("close_grip_seated_row", { gripWidth: "medium", gripOrientation: "pronated" }), "seated_cable_row");
  assert.equal(gripVariantFor("barbell_row", { gripWidth: "medium", gripOrientation: "supinated" }), "underhand_barbell_row");
  assert.equal(gripVariantFor("machine_row", { gripWidth: "wide" }), "", "unrelated exercises are untouched");
});

test("every grip family member exists in the catalog", () => {
  for (const id of ["wide_grip_lat_pulldown", "seated_cable_row", "barbell_row", "pull_up"]) for (const member of gripVariantFamily(id).members) assert.ok(ids.has(member), member);
});

test("split days get one core finisher that recovery planning ignores", () => {
  const snapshot = snapshotWithCoreFinishers({ today: { rotationKey: "back", exercises: [{ exerciseId: "machine_row", sets: 3 }] }, dayPlans: [
    { rotationKey: "chest", exercises: [{ exerciseId: "dumbbell_flat_chest_press", sets: 3 }] },
    { rotationKey: "legs", exercises: [{ exerciseId: "dead_bug", name: "死虫", sets: 2 }] },
  ] });
  assert.equal(snapshot.dayPlans[0].exercises.at(-1).exerciseId, SPLIT_CORE_FINISHERS.chest.exerciseId);
  assert.equal(snapshot.dayPlans[1].exercises.length, 1, "existing core work is not duplicated");
  assert.equal(snapshot.today.exercises.at(-1).exerciseId, "pallof_press");
  assert.equal(dayPlanIndex(snapshot).has("cable_kneeling_crunch"), false);
  assert.equal(withCoreFinisher({ rotationKey: "full", exercises: [] }).exercises.length, 0);
  assert.ok(ids.has("cable_kneeling_crunch") && ids.has("pallof_press") && ids.has("dead_bug"));
});

test("forgotten workouts auto-finish one hour after the last set, minus the idle hour", async () => {
  const { autoFinishPlan, AUTO_FINISH_IDLE_MS: H } = await import("../core.js");
  const start = Date.parse("2026-11-17T18:00:00Z"), last = start + 50 * 60000;
  const session = { endedAt: "", sets: [{ completedAt: new Date(start + 10 * 60000).toISOString() }, { completedAt: new Date(last).toISOString() }], timer: { running: true, elapsedMs: 0, startedAtMs: start } };
  assert.equal(autoFinishPlan(session, last + H - 1), null, "not yet");
  const plan = autoFinishPlan(session, last + H);
  assert.equal(plan.endedAtMs, last, "end time is one hour before the trigger");
  assert.equal(plan.elapsedMs, 50 * 60000, "the idle hour is removed from the clock");
  assert.equal(autoFinishPlan(session, last + 5 * H).endedAtMs, last, "reopening later still ends at the last set");
  assert.equal(autoFinishPlan({ ...session, timer: { running: false, elapsedMs: 40 * 60000 } }, last + H).elapsedMs, 40 * 60000);
  assert.equal(autoFinishPlan({ ...session, endedAt: "x" }, last + H), null);
  assert.equal(autoFinishPlan({ ...session, sets: [] }, last + H), null);
});

test("gym profile defaults to V8 GYM and pulley settings are shared per machine", async () => {
  const m = await import("../core.js");
  const profile = m.defaultGymProfile();
  assert.equal(m.activeGym(profile).name, "V8 GYM");
  assert.equal(m.activeGym(profile).since, "2026-10-07");
  const next = m.withMachineSetting(profile, "v8_gym", "wide_grip_lat_pulldown", { ratio: 0.5 });
  assert.equal(m.machineSetting(next, "v8_gym", "neutral_grip_lat_pulldown").ratio, 0.5, "all pulldown grips are one station");
  assert.equal(m.machineSetting(next, "v8_gym", "seated_cable_row"), null);
  assert.equal(m.effectiveLoad(40, 0.5), 20);
  assert.equal(m.effectiveLoad(40, null), null);
  assert.equal(m.pulleyLabel(0.5), "1:2 动滑轮");
  assert.equal(m.pulleyLabel(1), "1:1 定滑轮");
  assert.equal(m.pulleyLabel(0.25), "1:4");
  assert.equal(m.machineSetting(m.withMachineSetting(next, "v8_gym", "wide_grip_lat_pulldown", { ratio: "" }), "v8_gym", "wide_grip_lat_pulldown"), null);
  assert.ok(m.supportsPulley({ name: "宽握高位下拉", equipment: "器械" }));
  assert.ok(!m.supportsPulley({ name: "哑铃弯举", equipment: "哑铃" }));
});

test("nearest gym matches within the radius only", async () => {
  const m = await import("../core.js");
  const profile = { ...m.defaultGymProfile(), gyms: [{ id: "v8_gym", name: "V8 GYM", location: { lat: 38.7223, lng: -9.1393 } }] };
  assert.equal(m.nearestGym(profile, { lat: 38.7225, lng: -9.1395 })?.gym.id, "v8_gym");
  assert.equal(m.nearestGym(profile, { lat: 38.75, lng: -9.1393 }), null);
});

test("history keeps the stack reading and charts use the final weight from the pulley timeline", async () => {
  const m = await import("../core.js");
  const profile = m.defaultGymProfile();
  const pushdown = (date, lb) => ({ id: date, startedAt: `${date}T18:00:00Z`, summary: { volume: 1000 }, exercises: [{ exerciseId: "triceps_pushdown", name: "绳索下压", sets: [{ weight_value: lb, weight_unit: "lb", weight_kg: lb * 0.45359237, reps: 12, calculated_volume: lb * 0.45359237 * 12 }] }] });
  const snapshot = { workoutHistory: [pushdown("2026-11-17", 30), pushdown("2026-11-14", 40), pushdown("2026-11-01", 30), pushdown("2026-09-01", 30)], exerciseDefaults: { triceps_pushdown: { weightValue: 40, weightUnit: "lb", usedAt: "2026-11-14T18:55:02Z" } } };
  const out = m.applyFinalWeights(snapshot, profile);
  const set = (i) => out.workoutHistory[i].exercises[0].sets[0];
  assert.deepEqual([set(0).weight_value, set(0).pulley_ratio, set(0).stack_weight_value], [30, 1, 30], "today: fixed pulley, unchanged");
  assert.deepEqual([set(1).weight_value, set(1).pulley_ratio, set(1).stack_weight_value], [20, 0.5, 40], "11/14 movable pulley: 40 lb stack → 20 lb final");
  assert.equal(set(2).weight_value, 15);
  assert.equal(set(3).weight_value, 30, "before V8 GYM: untouched");
  assert.equal(set(3).pulley_ratio, undefined);
  assert.ok(Math.abs(set(1).weight_kg - 20 * 0.45359237) < 1e-3);
  assert.ok(out.workoutHistory[1].summary.volume < 1000);
  assert.equal(out.exerciseDefaults.triceps_pushdown.weightValue, 20);
  assert.equal(snapshot.workoutHistory[1].exercises[0].sets[0].weight_value, 40, "input not mutated");
  assert.deepEqual(m.applyFinalWeights(out, profile).workoutHistory[1].exercises[0].sets[0].weight_value, 20, "idempotent");
  assert.equal(m.progressSeriesForExercise(out, "triceps_pushdown").points.find((p) => p.date === "2026-11-14").weightKg.toFixed(2), (20 * 0.45359237).toFixed(2));
});

test("explicit set ratio wins and volume uses the final weight", async () => {
  const m = await import("../core.js");
  assert.equal(m.calculateSetVolume({ weightValue: 40, weightUnit: "kg", reps: 10, loadMode: "total", pulleyRatio: 0.5 }), 200);
  const candidate = m.buildBodyCandidate({ startedAt: "2026-11-18T10:00:00Z", sets: [{ exerciseId: "triceps_pushdown", exerciseName: "绳索下压", weightValue: 40, weightUnit: "lb", reps: 12, loadMode: "total", pulleyRatio: 0.5, completedAt: "2026-11-18T10:05:00Z" }] });
  const s = candidate.exercises[0].sets[0];
  assert.equal(s.weightValue, 40, "stack reading kept");
  assert.equal(s.finalWeightValue, 20);
  assert.match(s.notes, /配重 40lb · 1:2 动滑轮 · 最终 20lb/);
});
