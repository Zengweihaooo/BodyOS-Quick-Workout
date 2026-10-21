import test from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_EXERCISES, EXERCISE_CATEGORIES, exerciseCategory as category, canonicalExerciseId } from "../core.js";

test("flat and incline presses remain visible under chest in either language", () => {
  for (const name of ["哑铃平板推胸", "杠铃平板卧推", "哑铃上斜推胸", "Dumbbell Flat Bench Press", "Flat Bench Press", "Incline Dumbbell Press"]) {
    assert.equal(category({ name, movementPattern: "horizontal_push" }), "chest", name);
  }
  for (const id of ["dumbbell_flat_chest_press", "barbell_flat_chest_press", "dumbbell_incline_chest_press"]) {
    const exercise = FALLBACK_EXERCISES.find(item => item.id === canonicalExerciseId(id));
    assert.ok(exercise, id);
    assert.equal(category(exercise), "chest", id);
  }
});

test("planks stay under core and chest-supported rows stay under back", () => {
  for (const name of ["平板支撑", "上斜侧平板支撑", "Front Plank"]) {
    assert.equal(category({ name }), "core", name);
  }
  assert.equal(category({ name: "胸托哑铃划船", movementPattern: "horizontal_pull" }), "back");
  assert.equal(category({ name: "Lat Pulldown", movementPattern: "vertical_pull" }), "back");
});

test("all built-ins keep one category across Chinese, English and renamed display text", () => {
  assert.equal(Object.keys(EXERCISE_CATEGORIES).length, FALLBACK_EXERCISES.length);
  for (const exercise of FALLBACK_EXERCISES) {
    const expected = EXERCISE_CATEGORIES[exercise.id];
    assert.ok(["chest", "back", "shoulders", "legs", "arms", "core", "cardio", "other"].includes(expected));
    assert.equal(category(exercise), expected);
    assert.equal(category({ ...exercise, name: exercise.canonicalNameEn }), expected);
    assert.equal(category({ id: exercise.id, name: "renamed custom display" }), expected);
  }
});

test("joint names and generic curl or rotation words cannot steal built-in categories", () => {
  const groups = {
    legs: ["leg_curl", "leg_extension"],
    back: ["arm_down_back_machine", "straight_arm_pulldown", "cable_pullover", "dumbbell_pullover"],
    shoulders: ["cable_external_rotation", "machine_reverse_fly", "rear_delt_fly_machine", "seated_bent_over_reverse_fly"],
    chest: ["dip"],
    arms: ["barbell_biceps_curl", "triceps_pushdown"],
  };
  for (const [expected, ids] of Object.entries(groups)) for (const id of ids) assert.equal(category(FALLBACK_EXERCISES.find(x => x.id === id)), expected, id);
  assert.equal(category({ name: "Leg Curl" }), "legs");
  assert.equal(category({ name: "Cable External Rotation", movementPattern: "external_rotation" }), "shoulders");
});
