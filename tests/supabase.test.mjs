import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSupabaseConfig, sessionIsFresh } from "../supabase.js";

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
