import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { FALLBACK_EXERCISES } from "../core.js";

// Exercise the exact picker classifier, without starting a recording or DB.
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const declaration = app.match(/function exerciseCategory\(exercise\) \{[\s\S]*?\n\}/);
assert.ok(declaration, "picker classifier must remain covered");
const category = runInNewContext(`(${declaration[0]})`);

test("flat and incline presses remain visible under chest in either language", () => {
  for (const name of ["哑铃平板推胸", "杠铃平板卧推", "哑铃上斜推胸", "Dumbbell Flat Bench Press", "Flat Bench Press", "Incline Dumbbell Press"]) {
    assert.equal(category({ name, movementPattern: "horizontal_push" }), "chest", name);
  }
  for (const id of ["dumbbell_flat_chest_press", "barbell_flat_chest_press", "dumbbell_incline_chest_press"]) {
    const exercise = FALLBACK_EXERCISES.find(item => item.id === id);
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
