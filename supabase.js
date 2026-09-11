import { snapshotFromWorkoutUploads } from "./core.js?v=18";

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

export async function fetchTrainingSnapshot(config, session) {
  if (!session?.access_token || !session?.user?.id) throw new Error("请先登录 Supabase");
  const owner = encodeURIComponent(session.user.id);
  try {
    const uploads = await request(
      config,
      `/rest/v1/body_os_workout_uploads?select=payload,session_started_at,id&owner_id=eq.${owner}&order=session_started_at.desc&limit=120`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    return snapshotFromWorkoutUploads(Array.isArray(uploads) ? uploads : []);
  } catch (error) {
    if (isMissingSupabaseRelation(error, "body_os_workout_uploads")) throw new Error(UPLOADS_SETUP_HINT);
    throw error;
  }
}
