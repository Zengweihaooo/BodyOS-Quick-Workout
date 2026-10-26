import test from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_EXERCISES, EXERCISE_REFERENCES, exerciseCategory, exerciseSearchMatches, createCustomExercise, validExercisePhoto, mergeExerciseCatalog, buildBodyCandidate, createSession } from "../core.js";
test("equipment labels and alternative Chinese names find distinct safe identities", () => {
  for (const [query, id, group] of [
    ["Supine Press","supine_press_machine","chest"], ["仰卧推胸","supine_press_machine","chest"],
    ["Converging Shoulder Press","converging_shoulder_press","shoulders"],
    ["附身哑铃臂屈伸","dumbbell_triceps_kickback","arms"], ["Tricep Dumbbell Kickback","dumbbell_triceps_kickback","arms"],
  ]) {
    const found = FALLBACK_EXERCISES.filter(item => exerciseSearchMatches(item, query));
    assert.ok(found.some(item => item.id === id), query);
    assert.equal(exerciseCategory(found.find(item => item.id === id)), group);
  }
  assert.equal(EXERCISE_REFERENCES.supine_press_machine.mediaStatus, "pending");
  assert.equal(EXERCISE_REFERENCES.converging_shoulder_press.detailsStatus, "pending");
  assert.equal(EXERCISE_REFERENCES.dumbbell_triceps_kickback.wger.id, 655);
});
test("blank name and optional pictures survive a persisted library reload", () => {
  const photo = "data:image/jpeg;base64,/9j/2Q==";
  const item = createCustomExercise({photos:[photo],loadMode:"per_limb"}, {id:"custom_camera_test", now:new Date("2020-01-01T12:00:00Z")});
  assert.ok(item.name); assert.equal(item.unnamed,true); assert.deepEqual(item.photos,[photo]);
  const restored = mergeExerciseCatalog(FALLBACK_EXERCISES, JSON.parse(JSON.stringify([item])));
  assert.deepEqual(restored.find(x=>x.id===item.id).photos,[photo]);
  const renamed = createCustomExercise({...item,name:"窗边器材"}, {id:item.id});
  assert.equal(renamed.id,item.id); assert.equal(renamed.name,"窗边器材"); assert.equal(renamed.unnamed,false);
  assert.equal(renamed.createdAt,item.createdAt);
  assert.equal(renamed.loadMode,"per_limb");
});
test("no name and no image is valid, IDs are distinct, unsafe attachments are rejected", () => {
  const a=createCustomExercise(), b=createCustomExercise();
  assert.notEqual(a.id,b.id); assert.match(a.id,/^custom_[a-z0-9]{1,32}$/); assert.deepEqual(a.photos,[]);
  for (const bad of ["https://tracker.test/x.jpg","data:image/svg+xml;base64,PHN2Zz4=","javascript:alert(1)","data:image/jpeg;base64,@@"]) assert.equal(validExercisePhoto(bad),false);
  assert.deepEqual(createCustomExercise({photos:["https://tracker.test/x.jpg"]}).photos,[]);
});
test("user photos stay out of the workout candidate transmitted to the owner", () => {
  const session=createSession();
  session.sets=[{exerciseId:"custom_private_photo",exerciseName:"未命名动作",photos:["data:image/jpeg;base64,/9j/2Q=="],weightValue:5,weightUnit:"kg",loadMode:"total",sideCount:1,reps:8,completedAt:"2020-01-01T12:00:00Z"}];
  const candidate=buildBodyCandidate(session);
  assert.equal(candidate.exercises[0].exerciseCanonicalId,"custom_private_photo");
  assert.ok(!JSON.stringify(candidate).includes("data:image/"));
});
