import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FALLBACK_EXERCISES, historySourceLabel } from "../core.js";
import { GUIDANCE_SOURCES, OLYMPIC_BAR_KG, RECOVERY, crossExerciseEstimate, fromTotalLoad, personalStackToFreeRatio, totalLoadKg, equipmentGroup, exerciseAlternatives, loadForReps, recoveryPlan, splitGroupOf, suggestWeight } from "../guidance.js";

const catalog = FALLBACK_EXERCISES.map((row) => ({ ...row }));
const targets = JSON.parse(readFileSync(new URL("../catalog/muscle-targets.json", import.meta.url))).items;
const byId = (id) => catalog.find((item) => item.id === id);
const NOW = Date.UTC(2026, 9, 29, 12);
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const workout = (daysAgo, exercises) => ({ id: `w${daysAgo}`, startedAt: day(daysAgo), exercises: exercises.map(([exerciseId, name, sets]) => ({ exerciseId, name, sets: sets.map(([w, r]) => ({ set_type: "working", weight_value: w, weight_unit: "kg", reps: r, completed: 1 })) })) });
const sets = (n, w = 20, r = 10) => Array.from({ length: n }, () => [w, r]);

test("dataset target muscles cover the catalog except the 3 model-specific machines pending review", () => {
  const missing = catalog.filter((item) => !targets[item.id]).map((item) => item.id).sort();
  assert.deepEqual(missing, ["converging_shoulder_press", "dumbbell_triceps_kickback", "supine_press_machine"]);
});

test("exercises without a dataset target still get fallback alternatives from category + pattern", () => {
  for (const id of ["converging_shoulder_press", "supine_press_machine", "dumbbell_triceps_kickback"]) {
    const alt = exerciseAlternatives(byId(id), catalog, { targets });
    assert.ok(alt.length >= 1 && alt.length <= 3, id);
    assert.ok(!alt.some((a) => a.id === id));
  }
});

test("alternatives share the dataset target muscle, differ in gear, and never repeat", () => {
  for (const id of ["neutral_grip_lat_pulldown", "seated_dumbbell_lateral_raise", "barbell_bench_press", "barbell_biceps_curl"]) {
    const alt = exerciseAlternatives(byId(id), catalog, { targets });
    assert.ok(alt.length >= 1 && alt.length <= 3, id);
    assert.equal(new Set(alt.map((a) => a.id)).size, alt.length);
    for (const a of alt) { assert.notEqual(a.id, id); assert.equal(targets[a.id].target, targets[id].target, `${id} -> ${a.id}`); }
  }
  const pulldown = exerciseAlternatives(byId("neutral_grip_lat_pulldown"), catalog, { targets });
  assert.ok(pulldown.some((a) => a.equipmentGroup !== equipmentGroup(byId("neutral_grip_lat_pulldown"))));
  assert.deepEqual(exerciseAlternatives(null, catalog), []);
});

test("no percentage layoff discount: only the 28-day boundary and the plan's reserve change", () => {
  assert.ok(Math.abs(loadForReps(100, 10, 0) - 75) < 1e-9);
  const ex = byId("barbell_bench_press");
  const at = (d) => suggestWeight({ exercise: ex, catalog, now: NOW, snapshot: { workoutHistory: [workout(d, [["barbell_bench_press", "x", [[60, 10]]]])] } });
  assert.equal(at(28).kind, "history"); assert.equal(at(28).rir, "2");
  assert.equal(at(29).kind, "stale"); assert.equal(at(29).rir, "3");
  assert.equal(at(29).discount, undefined);
});

test("suggest weight: ≤4-week history is reused, stale history is discounted with more reserve, none gives no number", () => {
  const ex = byId("barbell_bench_press");
  const fresh = suggestWeight({ exercise: ex, catalog, now: NOW, snapshot: { workoutHistory: [workout(3, [["barbell_bench_press", "x", [[60, 10], [60, 9]]]])] } });
  assert.equal(fresh.kind, "history"); assert.ok(fresh.kg <= 60 && fresh.kg >= 50);
  const stale = suggestWeight({ exercise: ex, catalog, now: NOW, snapshot: { workoutHistory: [workout(49, [["barbell_bench_press", "x", [[60, 10]]]])] } });
  assert.equal(stale.kind, "stale"); assert.equal(stale.rir, "3"); assert.ok(stale.kg < 60 && stale.kg >= 40, String(stale.kg));
  const none = suggestWeight({ exercise: ex, catalog, now: NOW, snapshot: { workoutHistory: [] } });
  assert.equal(none.kind, "none"); assert.equal(none.kg, null);
});

const lm = (daysAgo, id, mode, sets) => ({ id: `w${daysAgo}-${id}`, startedAt: day(daysAgo), exercises: [{ exerciseId: id, name: id, sets: sets.map(([w, r]) => ({ set_type: "working", weight_value: w, weight_unit: "kg", load_mode: mode, reps: r, completed: 1 })) }] });

test("unified standard: everything is compared as total external load", () => {
  const barbell = { equipment: "杠铃", name: "杠铃卧推" };
  assert.equal(totalLoadKg({ weight_value: 20, weight_unit: "kg", load_mode: "per_limb" }, { equipment: "哑铃" }), 40);
  assert.equal(totalLoadKg({ weight_value: 50, weight_unit: "kg", load_mode: "total" }, barbell), 50);
  assert.equal(totalLoadKg({ weight_value: 20, weight_unit: "kg", load_mode: "per_side" }, barbell), 40 + OLYMPIC_BAR_KG);
  assert.equal(totalLoadKg({ weight_value: 100, weight_unit: "lb", load_mode: "total" }, barbell).toFixed(2), "45.36");
  assert.equal(totalLoadKg({ weight_value: 30, weight_unit: "kg", load_mode: "assistance" }, barbell), null);
  assert.equal(fromTotalLoad(40, { loadMode: "per_limb" }), 20);
});

test("cross-exercise: progressing dumbbell press, never used barbell -> barbell suggestion from total load, labelled not measured", () => {
  const history = [lm(21, "dumbbell_flat_chest_press", "per_limb", [[20, 10], [20, 10]]), lm(14, "dumbbell_flat_chest_press", "per_limb", [[22, 10], [22, 9]]), lm(3, "dumbbell_flat_chest_press", "per_limb", [[24, 10], [24, 10]])];
  const snap = { workoutHistory: history };
  const s = suggestWeight({ exercise: byId("barbell_bench_press"), snapshot: snap, catalog, targets, now: NOW });
  assert.equal(s.kind, "cross");
  assert.equal(s.sources[0].id, "dumbbell_flat_chest_press"); assert.equal(s.sources[0].trend, "up"); assert.equal(s.sources[0].basis, "population");
  assert.equal(s.errorPct, 8);
  // e1RM total = 48 * (1 + 10/30) = 64; 10 reps + 3 RIR -> 64 / (1 + 13/30) = 44.65 -> 45 kg on the bar
  assert.equal(s.kg, 45); assert.ok(Math.abs(s.totalKg - 44.7) < 0.1);
  assert.ok(s.sourceIds.includes("heinecke2021"));
});

test("cross-exercise: barbell suggestion never goes below the empty bar", () => {
  const snap = { workoutHistory: [lm(2, "dumbbell_flat_chest_press", "per_limb", [[10, 10]])] };
  const s = suggestWeight({ exercise: byId("barbell_bench_press"), snapshot: snap, catalog, targets, now: NOW });
  assert.equal(s.kind, "cross"); assert.equal(s.kg, 20); assert.equal(s.belowBar, true);
});

test("cross-exercise: machine needs the user's own paired history; without it no number is invented", () => {
  const onlyDumbbell = { workoutHistory: [lm(2, "dumbbell_flat_chest_press", "per_limb", [[20, 10]])] };
  assert.equal(suggestWeight({ exercise: byId("machine_chest_press"), snapshot: onlyDumbbell, catalog, targets, now: NOW }).kind, "none");
  const paired = { workoutHistory: [lm(2, "dumbbell_flat_chest_press", "per_limb", [[20, 10]]), lm(4, "barbell_incline_bench_press", "total", [[30, 10]])] };
  const ratio = personalStackToFreeRatio({ workoutHistory: [lm(2, "dumbbell_flat_chest_press", "per_limb", [[20, 10]]), lm(4, "machine_chest_press", "total", [[50, 10]])] }, catalog, targets);
  assert.ok(Math.abs(ratio.ratio - 1.25) < 1e-3);   // machine 50 total vs dumbbells 40 total
  const snap = { workoutHistory: [lm(2, "dumbbell_flat_chest_press", "per_limb", [[20, 10]]), lm(4, "machine_chest_press", "total", [[50, 10]])] };
  const est = crossExerciseEstimate({ exercise: byId("barbell_bench_press"), snapshot: snap, catalog, targets, nowMs: NOW });
  assert.equal(est.basis, "personal");
  assert.ok(est.sources.some((x) => x.id === "machine_chest_press" && x.basis === "personal"));
  assert.ok(paired);
});

test("split membership follows the published dayPlans, else mirrors the plan by name", () => {
  const snap = { dayPlans: [{ rotationKey: "chest", exercises: [{ exerciseId: "standing_dumbbell_lateral_raise" }] }, { rotationKey: "back", exercises: [{ exerciseId: "machine_rear_delt_fly" }] }] };
  const w = workout(1, [["standing_dumbbell_lateral_raise", "侧平举", sets(3)], ["machine_rear_delt_fly", "反向飞鸟（器械）", sets(3)]]);
  const plan = recoveryPlan({ ...snap, workoutHistory: [w] }, { now: NOW });
  const g = Object.fromEntries(plan.groups.map((x) => [x.key, x]));
  assert.equal(g.chest.weekSets, 3); assert.equal(g.back.weekSets, 3); assert.equal(plan.usedDayPlans, true);
  assert.equal(splitGroupOf({ id: "x", name: "绳索三头下压" }), "chest");
  assert.equal(splitGroupOf({ id: "x", name: "哑铃弯举" }), "back");
  assert.equal(splitGroupOf({ id: "x", name: "反向飞鸟" }), "back");
});

test("recovery: strict chest→back→legs rotation, 48 h gate, sourced windows", () => {
  const snap = { recommendation: { sessionsPerWeek: 3, sessionsPerWeekMax: 4 }, workoutHistory: [
    workout(1, [["barbell_bench_press", "杠铃卧推", sets(4)]]),
    workout(3, [["wide_grip_lat_pulldown", "高位下拉", sets(4)]]),
    workout(5, [["barbell_back_squat", "杠铃深蹲", sets(4)]]),
    workout(40, [["barbell_back_squat", "杠铃深蹲", sets(4)]]),
  ] };
  const plan = recoveryPlan(snap, { now: NOW });
  const g = Object.fromEntries(plan.groups.map((x) => [x.key, x]));
  assert.equal(g.chest.status, "recovering");
  assert.equal(g.back.status, "ready");
  assert.equal(g.legs.status, "ready");
  assert.equal(g.chest.weekSessions, 1); assert.equal(g.chest.weekFrequencyGap, 1);
  assert.equal(plan.next.key, "back");               // after chest comes back
  assert.equal(plan.next.readyNow, false);            // chest was only 1 day ago (<48 h)
  assert.equal(plan.forecast.length, 7);
  const order = plan.forecast.filter((f) => f.group).map((f) => f.group);
  assert.ok(order.length >= 1 && order.length <= plan.pace);
  assert.deepEqual(order, ["back", "legs", "chest", "back"].slice(0, order.length));
  assert.deepEqual(Object.keys(RECOVERY).sort(), ["detrainDays", "minHours", "minSetsToCount", "spacingDays", "weekFrequencyTarget", "weeklyFrequencyTarget", "weeklySetsTarget"].filter((k) => k !== "weekFrequencyTarget").sort());
  assert.equal(g.legs.status === "detrain", false);
  assert.equal(recoveryPlan({ workoutHistory: [] }, { now: NOW }).groups.every((x) => x.status === "never"), true);
});

test("every cited source has a first-hand URL except the user's own plan; no unverified citations remain", () => {
  for (const s of GUIDANCE_SOURCES) assert.ok(s.url || s.id === "bodyos-plan", s.id);
  assert.ok(!GUIDANCE_SOURCES.some((s) => /mcmaster/i.test(s.id)));
});

test("Body.OS-published recovery windows take precedence over the local computation", () => {
  const snap = { today: { rotationKey: "legs" }, recommendation: { sessionsPerWeek: 3, sessionsPerWeekMax: 4, recovery: { groups: [
    { key: "chest", status: "ready", lastAt: day(3), lastSets: 4, hoursSince: 72, startAt: day(1), weekSessions: 1, weekSets: 8, monthSets: 20, avgWeekSets: 5, weekSetsGap: 2 },
  ] } }, workoutHistory: [] };
  const plan = recoveryPlan(snap, { now: NOW });
  const chest = plan.groups.find((g) => g.key === "chest");
  assert.equal(plan.fromBodyOs, true); assert.equal(chest.status, "ready"); assert.equal(chest.weekSets, 8); assert.equal(chest.weekFrequencyGap, 1); assert.equal(chest.daysSince, 3);
  assert.equal(plan.groups.find((g) => g.key === "back").status, "never");
});

test("history source labels separate merged Apple Watch sessions from Pages-only uploads", () => {
  assert.equal(historySourceLabel({ source: "health_auto_export" }).kind, "merged");
  assert.equal(historySourceLabel({ source: "quick_workout_upload" }).kind, "pages_only");
  assert.equal(historySourceLabel({}).kind, "other");
});
