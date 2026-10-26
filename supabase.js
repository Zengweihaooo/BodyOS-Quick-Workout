import { snapshotFromWorkoutUploads, augmentTrainingSnapshot } from "./core.js?v=27";

const PROJECT_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
const UPLOADS_SETUP_HINT = "读不到已上传的训练表 public.body_os_workout_uploads。请确认登录账号在 allowlist 中，并已在 Supabase 执行过上传表那一段 SQL。";

export function isMissingSupabaseRelation(error, tableName = "") {
  const text = `${error?.message || error || ""}`;
  if (!/PGRST205|schema cache|Could not find the table/i.test(text)) return false;
  return !tableName || text.includes(tableName);
}

export function normalizeSupabaseConfig(input = {}) {
  const url = String(input.url || "").trim().replace(/\/+$/, "");
  const anonKey = String(input.anonKey || "").trim();
  if (!PROJECT_URL_PATTERN.test(url)) throw new Error("项目地址必须是 https://<project-ref>.supabase.co");
  if (anonKey.length < 20 || /\s/.test(anonKey)) throw new Error("Supabase anon key 无效");
  return { url, anonKey };
}

export function migrateSupabaseConfig(saved, defaults, retiredUrls = []) {
  const projectChanged = Boolean(saved && retiredUrls.includes(String(saved.url || "").replace(/\/+$/, "")));
  return { config: !saved || projectChanged ? defaults : saved, projectChanged };
}

async function request(configInput, path, options = {}) {
  const config = normalizeSupabaseConfig(configInput);
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: { apikey: config.anonKey, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || `Supabase 请求失败 ${response.status}`);
  return data;
}

export async function signInWithPassword(config, email, password) {
  if (!String(email || "").trim() || !String(password || "")) throw new Error("请输入登录邮箱和密码");
  return request(config, "/auth/v1/token?grant_type=password", {
    method: "POST", body: JSON.stringify({ email: String(email).trim(), password: String(password) }),
  });
}

export async function refreshSession(config, refreshToken) {
  if (!refreshToken) throw new Error("登录已过期，请重新输入密码");
  return request(config, "/auth/v1/token?grant_type=refresh_token", {
    method: "POST", body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function sessionIsFresh(session, nowSeconds = Date.now() / 1000) {
  return Boolean(session?.access_token && Number(session?.expires_at || 0) > nowSeconds + 60);
}

export async function uploadWorkout(config, session, workoutExport) {
  if (!session?.access_token || !session?.user?.id) throw new Error("请先登录 Supabase");
  const clientSessionId = String(workoutExport?.session?.id || "");
  if (!clientSessionId) throw new Error("训练缺少本地会话 ID，无法安全去重");
  const row = {
    owner_id: session.user.id,
    client_session_id: clientSessionId,
    schema_version: String(workoutExport.schemaVersion || ""),
    session_started_at: workoutExport.session.startedAt,
    payload: workoutExport,
    imported_at: null,
    imported_workout_id: null,
    updated_at: new Date().toISOString(),
  };
  return request(config, "/rest/v1/body_os_workout_uploads?on_conflict=owner_id,client_session_id", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
}

export async function saveAIChoice(config, session, choice) {
  if (!session?.access_token || !session?.user?.id) throw new Error("请先登录云端");
  if (!/^(follow_hub|chatgpt_subscription|api:[a-zA-Z0-9_.:-]+)$/.test(choice)) throw new Error("模型选择格式无效");
  const now = new Date().toISOString(), requestId = crypto.randomUUID();
  const row = { owner_id: session.user.id, client_session_id: "bodyos:ai-preference", schema_version: "body.os.quick-workout.v1",
    session_started_at: now, payload: {kind:"body.os.workout-ai-choice.v1", choice, requestId}, updated_at: now, imported_at:null, imported_workout_id:null };
  await request(config, "/rest/v1/body_os_workout_uploads?on_conflict=owner_id,client_session_id", {
    method:"POST", headers:{Authorization:`Bearer ${session.access_token}`, Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify(row) });
  return row.payload;
}

export async function fetchTrainingSnapshot(config, session) {
  if (!session?.access_token || !session?.user?.id) throw new Error("请先登录 Supabase");
  const owner = encodeURIComponent(session.user.id);
  try {
    const uploads = await request(
      config,
      `/rest/v1/body_os_workout_uploads?select=payload,session_started_at,id,imported_workout_id,imported_at,updated_at&owner_id=eq.${owner}&client_session_id=neq.bodyos%3Aai-preference&order=session_started_at.desc&limit=120`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    const history = snapshotFromWorkoutUploads(Array.isArray(uploads) ? uploads : []);
    // Recommendations are optional; an unavailable projection must not hide history.
    try {
      const rows = await request(config,
        `/rest/v1/body_os_training_snapshots?select=payload,generated_at&owner_id=eq.${owner}&limit=1`,
        { headers: { Authorization: `Bearer ${session.access_token}` } });
      const snapshot = augmentTrainingSnapshot(history, Array.isArray(rows) ? rows[0] : null);
      try {
        const choices = await request(config, `/rest/v1/body_os_workout_uploads?select=payload,imported_at&owner_id=eq.${owner}&client_session_id=eq.bodyos%3Aai-preference&limit=1`, {headers:{Authorization:`Bearer ${session.access_token}`}});
        const choice = Array.isArray(choices) ? choices[0] : null;
        if (choice?.payload?.kind === "body.os.workout-ai-choice.v1") snapshot.aiChoiceRequest = {...choice.payload, pending:!choice.imported_at};
      } catch { /* Optional choice status never hides workout history. */ }
      return snapshot;
    } catch {
      return { ...history, recommendationNotice: "动态推荐暂时无法更新，历史训练仍可查看。" };
    }
  } catch (error) {
    if (isMissingSupabaseRelation(error, "body_os_workout_uploads")) throw new Error(UPLOADS_SETUP_HINT);
    throw error;
  }
}
