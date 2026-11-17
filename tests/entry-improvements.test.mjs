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
