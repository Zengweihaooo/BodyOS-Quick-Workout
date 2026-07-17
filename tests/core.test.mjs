import test from "node:test";
import assert from "node:assert/strict";
import { buildBodyCandidate, calculateSetVolume, createSession, restRemainingSeconds, sessionSummary, timerElapsedMs, toMarkdown, withoutExercise } from "../core.js";

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
  assert.equal(set.bodyWeight, 72.4); assert.equal(set.assistanceWeight, 25); assert.equal(set.effectiveLoad, 47.4);
  assert.equal(set.gripWidth, "wide"); assert.equal(set.gripOrientation, "pronated");
  assert.equal(sessionSummary(session).volume, 379.2); assert.match(toMarkdown(session), /宽距 · 正握/);
});
