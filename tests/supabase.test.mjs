import test from "node:test";
import assert from "node:assert/strict";
import { fetchTrainingSnapshot, normalizeSupabaseConfig, sessionIsFresh, uploadWorkout } from "../supabase.js";

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

test("training snapshot is read with the signed-in owner token", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl, authorization;
  globalThis.fetch = async (url, options) => {
    requestUrl = url; authorization = options.headers.Authorization;
    return { ok: true, json: async () => [{ generated_at: "2026-07-28T00:00:00Z", payload: { schemaVersion: "body.os.training-snapshot.v1", workoutHistory: [] } }] };
  };
  try {
    const snapshot = await fetchTrainingSnapshot(
      { url: "https://abc.supabase.co", anonKey: "a".repeat(24) },
      { access_token: "signed-token", user: { id: "owner-id" } },
    );
    assert.match(requestUrl, /owner_id=eq.owner-id/);
    assert.match(requestUrl, /order=generated_at\.desc/);
    assert.equal(authorization, "Bearer signed-token");
    assert.equal(snapshot.schemaVersion, "body.os.training-snapshot.v1");
    assert.equal(snapshot.generatedAt, "2026-07-28T00:00:00Z");
  } finally { globalThis.fetch = originalFetch; }
});

test("missing snapshot table falls back to owner workout uploads", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("body_os_training_snapshots")) {
      return { ok: false, json: async () => ({ code: "PGRST205", message: "Could not find the table 'public.body_os_training_snapshots' in the schema cache" }) };
    }
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
    assert.match(urls[0], /body_os_training_snapshots/);
    assert.match(urls[1], /body_os_workout_uploads/);
    assert.equal(snapshot.workoutHistory[0].exercises[0].exerciseId, "dumbbell_flat_chest_press");
  } finally { globalThis.fetch = originalFetch; }
});
