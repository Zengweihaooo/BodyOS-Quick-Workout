import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSupabaseConfig, sessionIsFresh, uploadWorkout } from "../supabase.js";

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
