import test from "node:test";
import assert from "node:assert/strict";
import { buildBodyCandidate, calculateSetVolume, createSession, restRemainingSeconds, sessionSummary, timerElapsedMs, toMarkdown } from "../core.js";

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

test("candidate preserves timestamp, RIR and load mode", () => {
  const session = createSession(new Date("2026-07-15T12:00:00Z"));
  session.endedAt = "2026-07-15T13:00:00Z";
  session.sets.push({ ...base, loadMode: "per_limb", sideCount: 2, executionMode: "bilateral_simultaneous", rir: 2, notes: "稳定" });
  const candidate = buildBodyCandidate(session); const set = candidate.exercises[0].sets[0];
  assert.equal(set.loadMode, "per_limb"); assert.equal(set.rir, 2); assert.equal(set.completedAt, base.completedAt); assert.deepEqual(set.left, { weight: 10, reps: 12 });
  assert.match(toMarkdown(session), /哑铃推胸/); assert.equal(sessionSummary(session).volume, 240);
});
