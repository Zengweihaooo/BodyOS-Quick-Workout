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
