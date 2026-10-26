import test from "node:test";
import assert from "node:assert/strict";
import { augmentTrainingSnapshot, canRefreshTrainingScreen, recommendationFreshness, shouldUploadFinishedSession, createExport, createSerialTaskQueue, draftFromExerciseDefault, snapshotFromWorkoutUploads, progressSeriesForExercise } from "../core.js";

test("projection augments prescriptions without replacing uploads history", () => {
  const history = { workoutHistory: [{ id: "uploaded" }], exerciseDefaults: { leg_press: { weightValue: 20 } }, today: {} };
  const projection = { generated_at: "2026-10-11 12:00:00+0000", payload: { today: { title: "全身 A" }, recommendation: { stage: "building" }, exerciseDefaults: { row: { weightValue: 15 } }, workoutHistory: [{ id: "untrusted-history" }] } };
  const merged = augmentTrainingSnapshot(history, projection);
  assert.deepEqual(merged.workoutHistory, history.workoutHistory);
  assert.equal(merged.today.title, "全身 A");
  assert.equal(merged.exerciseDefaults.leg_press.weightValue, 20);
  assert.equal(merged.exerciseDefaults.row.weightValue, 15);
  assert.deepEqual(history.today, {});
});

test("background refresh never redraws training drafts or focused inputs", () => {
  for (const screen of ["entry", "picker", "custom", "summary", "watch"]) assert.equal(canRefreshTrainingScreen(screen), false);
  for (const screen of ["home", "history", "recommendation", "cloud"]) assert.equal(canRefreshTrainingScreen(screen), true);
  assert.equal(canRefreshTrainingScreen("cloud", true), false);
});

test("offline and stale advice is clearly labelled, SQL timestamp remains parseable", () => {
  const snapshot = { recommendationGeneratedAt: "2026-10-11 12:00:00+0000" };
  assert.equal(recommendationFreshness(snapshot, true, Date.parse("2026-10-11T13:00:00Z")), "");
  assert.match(recommendationFreshness(snapshot, false), /离线/);
  assert.match(recommendationFreshness(snapshot, true, Date.parse("2026-10-13T13:00:00Z")), /24 小时/);
});

test("finished-session retry eligibility protects active drafts and clean uploads", () => {
  const workout = { endedAt: "2026-10-11T12:00:00Z", sets: [{}], sync: {} };
  assert.equal(shouldUploadFinishedSession(workout, true, true), true);
  assert.equal(shouldUploadFinishedSession(workout, false, true), false);
  assert.equal(shouldUploadFinishedSession(workout, true, false), false);
  assert.equal(shouldUploadFinishedSession({ ...workout, endedAt: null }, true, true), false);
  assert.equal(shouldUploadFinishedSession({ ...workout, sync: { supabaseId: "uploaded" } }, true, true), false);
  assert.equal(shouldUploadFinishedSession({ ...workout, sync: { supabaseId: "uploaded", supabaseDirty: true } }, true, true), true);
});

test("export preserves selected recommendation key for reliable A/B rotation", () => {
  const session = { id: "test-session", recommendationKey: "A", sets: [], startedAt: "2026-10-11T12:00:00Z" };
  assert.equal(createExport(session).session.recommendationKey, "A");
});

test("unrecorded RIR is never manufactured from a prescription or generic default", () => {
  const exercise = { id: "leg_press", name: "腿举" };
  assert.equal(draftFromExerciseDefault(exercise).rir, null);
  assert.equal(draftFromExerciseDefault(exercise, { weightValue: 20, reps: 10, targetRir: [2, 3] }).rir, null);
  assert.equal(draftFromExerciseDefault(exercise, { weightValue: 20, reps: 10, rir: 3 }).rir, 3);
  assert.equal(draftFromExerciseDefault(exercise, { weightValue: 20, reps: 10, rir: 0 }).rir, 0);
});

test("pending queue mutations serialize removal and insertion without dropping new workout", async () => {
  const run = createSerialTaskQueue();
  let pending = { old: {} };
  const remove = run(async () => {
    const read = { ...pending };
    await new Promise((resolve) => setTimeout(resolve, 5));
    delete read.old;
    pending = read;
  });
  const insert = run(async () => {
    const read = { ...pending };
    read.new = { id: "new" };
    pending = read;
  });
  await Promise.all([remove, insert]);
  assert.deepEqual(pending, { new: { id: "new" } });
  await assert.rejects(run(async () => { throw new Error("failed-write"); }));
  await run(async () => { pending.next = {}; });
  assert.ok(pending.next);
});

test("AI review projection remains optional and never supplies replacement history", () => {
  const history = {workoutHistory:[{id:"real"}],exerciseDefaults:{}};
  const merged = augmentTrainingSnapshot(history, {payload:{aiReview:{text:"Review",model:"chosen",needsConfirmation:true},workoutHistory:[{id:"fake"}]}});
  assert.equal(merged.aiReview.model,"chosen");
  assert.equal(merged.aiReview.needsConfirmation,true);
  assert.deepEqual(merged.workoutHistory,history.workoutHistory);
});

test("confirmed imported workouts use owner corrections without adding projection-only records", () => {
  const original = { id: "upload", importedWorkoutId: "owner-workout", importedAt: "2026-01-01T12:00:00Z", uploadUpdatedAt: "2026-01-01T12:00:00Z", exercises: [{exerciseId:"press", sets:[{weight_value:20,weight_unit:"lb"}]}] };
  const corrected = { id: "owner-workout", exercises: [{exerciseId:"press",sets:[{weight_value:20,weight_unit:"kg"}]}] };
  const row = {generated_at:"2026-01-02T12:00:00Z",payload:{workoutHistory:[corrected,{id:"extra",exercises:[{}]}]}};
  const merged = augmentTrainingSnapshot({workoutHistory:[original]}, row);
  assert.equal(merged.workoutHistory.length,1);
  assert.equal(merged.workoutHistory[0].id,"upload");
  assert.equal(merged.workoutHistory[0].exercises[0].sets[0].weight_unit,"kg");
  assert.equal(original.exercises[0].sets[0].weight_unit,"lb");
  for (const changes of [{importedAt:""},{importedWorkoutId:""},{uploadUpdatedAt:"2026-01-03T12:00:00Z"}]) {
    const pending = {...original,...changes};
    assert.equal(augmentTrainingSnapshot({workoutHistory:[pending]},row).workoutHistory[0],pending);
  }
});


test("cloud import metadata reaches corrected progress without rewriting the original upload", () => {
  const upload = {id:"remote", imported_workout_id:"canonical", imported_at:"2026-01-01T12:00:00Z", updated_at:"2026-01-01T11:00:00Z",payload:{session:{id:"session",startedAt:"2026-01-01T11:00:00Z",sets:[{exerciseId:"machine_chest_press",weightValue:20,weightUnit:"lb",reps:10}]}}};
  const history = snapshotFromWorkoutUploads([upload]);
  const row = {generated_at:"2026-01-02T12:00:00Z",payload:{workoutHistory:[{id:"canonical",startedAt:"2026-01-01T11:00:00Z",exercises:[{exerciseId:"machine_chest_press",sets:[{weight_value:20,weight_unit:"kg",weight_kg:20,reps:10}]}]}]}};
  const merged = augmentTrainingSnapshot(history,row);
  assert.equal(progressSeriesForExercise(merged,"machine_chest_press").points[0].weightKg,20);
  assert.equal(upload.payload.session.sets[0].weightUnit,"lb");
});
