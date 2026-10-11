import test from "node:test";
import assert from "node:assert/strict";
import { fetchTrainingSnapshot, migrateSupabaseConfig, normalizeSupabaseConfig, sessionIsFresh, uploadWorkout, saveAIChoice } from "../supabase.js";

test("accepts only hosted Supabase HTTPS project URLs", () => {
  assert.deepEqual(normalizeSupabaseConfig({ url: "https://abc-123.supabase.co/", anonKey: "a".repeat(24) }), {
    url: "https://abc-123.supabase.co", anonKey: "a".repeat(24),
  });
  assert.throws(() => normalizeSupabaseConfig({ url: "http://localhost:54321", anonKey: "a".repeat(24) }));
  assert.throws(() => normalizeSupabaseConfig({ url: "https://evil.example", anonKey: "a".repeat(24) }));
});

test("requires a token with more than one minute remaining", () => {
  assert.equal(sessionIsFresh({ access_token: "token", expires_at: 200 }, 100), true);
  assert.equal(sessionIsFresh({ access_token: "token", expires_at: 150 }, 100), false);
});

test("re-upload clears import markers so Body OS can apply edits", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => [body] }; };
  try {
    await uploadWorkout({ url: "https://abc.supabase.co", anonKey: "a".repeat(24) }, { access_token: "token", user: { id: "owner" } }, { schemaVersion: "body.os.quick-workout.v1", session: { id: "session", startedAt: "2026-07-20T12:00:00Z" } });
    assert.equal(body.imported_at, null);
    assert.equal(body.imported_workout_id, null);
  } finally { globalThis.fetch = originalFetch; }
});

test("training history remains uploads-based while optional recommendations are read owner-scoped", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl, authorization; const urls = [];
  globalThis.fetch = async (url, options) => {
    requestUrl = url; urls.push(url); authorization = options.headers.Authorization;
    if (url.includes("body_os_training_snapshots")) return { ok: true, json: async () => [{ generated_at: "2026-10-11T12:00:00Z", payload: { today: { title: "A", exercises: [] }, workoutHistory: [{id:"must-not-overwrite"}] } }] };
    return {
      ok: true,
      json: async () => [{
        session_started_at: "2026-09-01T20:00:00+08:00",
        payload: {
          session: {
            id: "qws_1", startedAt: "2026-09-01T20:00:00+08:00",
            sets: [{ exerciseId: "dumbbell_flat_chest_press", exerciseName: "哑铃平板推胸", weightValue: 22.5, weightUnit: "kg", reps: 8 }],
          },
        },
      }],
    };
  };
  try {
    const snapshot = await fetchTrainingSnapshot(
      { url: "https://abc.supabase.co", anonKey: "a".repeat(24) },
      { access_token: "signed-token", user: { id: "owner-id" } },
    );
    assert.match(urls[0], /body_os_workout_uploads/);
    assert.ok(urls.some(url => /body_os_training_snapshots.*owner_id=eq.owner-id/.test(url)));
    assert.match(urls[0], /client_session_id=neq.bodyos%3Aai-preference/);
    assert.equal(snapshot.today.title, "A");
    assert.equal(authorization, "Bearer signed-token");
    assert.equal(snapshot.workoutHistory[0].exercises[0].exerciseId, "dumbbell_flat_chest_press");
  } finally { globalThis.fetch = originalFetch; }
});

test("retired project migrates while custom projects remain intact", () => {
  const defaults = { url: "https://new.supabase.co", anonKey: "new-key" };
  const old = { url: "https://old.supabase.co/", anonKey: "old-key" };
  assert.deepEqual(migrateSupabaseConfig(old, defaults, ["https://old.supabase.co"]), { config: defaults, projectChanged: true });
  const custom = { url: "https://custom.supabase.co", anonKey: "custom-key" };
  assert.deepEqual(migrateSupabaseConfig(custom, defaults, ["https://old.supabase.co"]), { config: custom, projectChanged: false });
  assert.deepEqual(migrateSupabaseConfig(null, defaults), { config: defaults, projectChanged: false });
});

for (const failure of ["missing", "empty", "network"]) {
  test(`optional recommendation ${failure} preserves available history`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes("body_os_training_snapshots")) {
        if (failure === "network") throw new TypeError("offline");
        return failure === "empty" ? { ok: true, json: async () => [] } : { ok: false, json: async () => ({ message: "PGRST205 body_os_training_snapshots schema cache" }) };
      }
      return { ok: true, json: async () => [{ payload: { session: { id: "test-session", startedAt: "2026-10-10T12:00:00Z", sets: [{ exerciseId: "leg_press", reps: 10, weightValue: 20 }] } } }] };
    };
    try {
      const snapshot = await fetchTrainingSnapshot({ url: "https://abc.supabase.co", anonKey: "a".repeat(24) }, { access_token: "token", user: { id: "owner" } });
      assert.equal(snapshot.workoutHistory.length, 1);
      assert.ok(snapshot.recommendationNotice);
    } finally { globalThis.fetch = original; }
  });
}

test("phone model choice is owner scoped, contains no credentials and stays out of workout history", async () => {
  const original=globalThis.fetch;let row;
  globalThis.fetch=async (_url,options)=>{row=JSON.parse(options.body);return {ok:true,status:204,json:async()=>null};};
  try {
    const selected=await saveAIChoice({url:"https://abc.supabase.co",anonKey:"a".repeat(24)}, {access_token:"private-token",user:{id:"owner"}}, "chatgpt_subscription");
    assert.equal(row.owner_id,"owner");assert.equal(row.client_session_id,"bodyos:ai-preference");
    assert.equal(selected.kind,"body.os.workout-ai-choice.v1");assert.equal(row.imported_at,null);
    assert.equal(selected.choice,"chatgpt_subscription");assert.ok(selected.requestId);
    assert.equal(JSON.stringify(row).includes("private-token"),false);
  } finally {globalThis.fetch=original;}
});
