const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROLE = new Set(["papa", "nurse"]);
const METHODS = new Map([
  ["login", "POST"], ["session", "GET"], ["schedule", "GET"],
  ["history", "GET"], ["record", "POST"], ["members", "GET"]
]);
const BANGKOK_DAY = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"});
const bangkokDay = () => {
  const values = Object.fromEntries(BANGKOK_DAY.formatToParts().map(({type,value}) => [type,value]));
  return values.year + "-" + values.month + "-" + values.day;
};
const MIME = "application/json; charset=utf-8";
const MAX_BODY = 8192;

const respond = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": MIME,
    "cache-control": "no-store, private",
    "x-content-type-options": "nosniff",
    ...headers
  }
});
const fail = (status, error, code, headers) => respond(status, {error, code}, headers);
const unavailable = () => fail(503, "The care service is temporarily unavailable.", "unavailable");
const unauthenticated = () => fail(401, "Please sign in again.", "not_signed_in");
const forbidden = () => fail(403, "This account is not allowed to do that.", "forbidden");

function realDate(value) {
  if (typeof value !== "string" || !DATE.test(value) || value < "2000-01-01") return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function credentials(env) {
  try {
    const rawUrl = env.SUPABASE_URL;
    const key = env.SUPABASE_ANON_KEY;
    if (typeof key !== "string" || !key || key.length > 4096 || /\s/.test(key)) return null;
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    // Refuse obvious service/secret keys rather than risk bypassing RLS after a misconfiguration.
    if (/^sb_secret_/i.test(key)) return null;
    if (key.split(".").length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
        if (payload.role !== "anon") return null;
      } catch { return null; }
    }
    return {origin:url.origin, key};
  } catch { return null; }
}

function member(row) {
  if (!row || !UUID.test(row.user_id || "") || !ROLE.has(row.role) || typeof row.display_name !== "string") return null;
  return {id:row.user_id, name:row.display_name, role:row.role};
}

function entry(row) {
  return {
    id:row.id,
    slotId:row.slot_id,
    scheduledDate:row.scheduled_date,
    actualDate:row.actual_date,
    actualTime:String(row.actual_time).slice(0,5),
    givenById:row.given_by_id,
    givenBy:row.given_by_name,
    loggedById:row.logged_by_id,
    loggedBy:row.logged_by_name,
    items:row.items,
    note:row.note,
    recordedAt:row.recorded_at,
    slotLabel:row.slot_label,
    scheduledTime:String(row.scheduled_time).slice(0,5)
  };
}

async function readBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return null;
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return null;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BODY) return null;
    const body = JSON.parse(raw);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

export function createHandler({env = process.env, transport = fetch, demoNames = false} = {}) {
  return async function careApi(request) {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";
    const method = METHODS.get(action);
    if (!method) return fail(404, "This care action does not exist.", "not_found");
    if (request.method !== method) return fail(405, "This request method is not supported.", "method", {allow:method});
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin && requestOrigin !== url.origin) return forbidden();
    const cfg = credentials(env);
    if (!cfg) return fail(503, "The new private workspace is not configured.", "not_configured");

    const upstream = async (path, {token, body} = {}) => {
      const headers = {"apikey":cfg.key, "accept":"application/json"};
      if (token) headers.authorization = "Bearer " + token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const result = await transport(cfg.origin + path, {
        method:body === undefined ? "GET" : "POST",
        headers, body:body === undefined ? undefined : JSON.stringify(body),
        redirect:"error", signal:AbortSignal.timeout(8500)
      });
      return {status:result.status, ok:result.ok, data:await result.json().catch(() => null)};
    };
    const getActor = async token => {
      const validated = await upstream("/auth/v1/user", {token});
      if ([401,403].includes(validated.status)) return {error:unauthenticated()};
      if (!validated.ok || !UUID.test(validated.data?.id || "")) return {error:unavailable()};
      const memberships = await upstream("/rest/v1/care_members?select=user_id,display_name,role&active=eq.true&user_id=eq." + validated.data.id, {token});
      if (!memberships.ok || !Array.isArray(memberships.data)) return {error:unavailable()};
      const actor = member(memberships.data[0]);
      if (!actor || actor.id.toLowerCase() !== validated.data.id.toLowerCase()) return {error:forbidden()};
      return {actor};
    };
    const bodyInvalid = error => fail(400, error, "invalid_request");

    try {
      if (action === "login") {
        const body = await readBody(request);
        const byName = typeof body?.name === "string";
        const password = body?.password;
        if (byName && (!demoNames || body.name.trim().toLowerCase()!=="papa" || typeof password!=="string" || !/^[0-9]{15}$/.test(password))) return unauthenticated();
        const email = byName ? "icare-papa-pilot@example.com" : typeof body?.email === "string" ? body.email.trim() : "";
        if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254 || typeof password !== "string" || !password.length || password.length > 1024) {
          return bodyInvalid("Enter a valid email and password.");
        }
        const authn = await upstream("/auth/v1/token?grant_type=password", {body:{email,password}});
        if (authn.status === 429) return fail(429, "Too many sign-in attempts. Try again later.", "rate_limited");
        if ([400,401,403].includes(authn.status)) return fail(401, "Sign-in did not succeed.", "not_signed_in");
        if (!authn.ok || typeof authn.data?.access_token !== "string") return unavailable();
        const accessToken = authn.data.access_token;
        const lookup = await getActor(accessToken);
        if (lookup.error) return lookup.error;
        if (byName && lookup.actor.role!=="papa") return unauthenticated();
        return respond(200, {accessToken});
      }

      const supplied = request.headers.get("authorization") || "";
      const token = /^Bearer ([A-Za-z0-9._~-]{1,8192})$/i.exec(supplied)?.[1];
      if (!token) return unauthenticated();
      const lookup = await getActor(token);
      if (lookup.error) return lookup.error;
      const actor = lookup.actor;

      if (action === "session") return respond(200, {member:actor});
      if (action === "members") {
        if (actor.role !== "papa") return forbidden();
        const result = await upstream("/rest/v1/care_members?active=eq.true&select=user_id,display_name,role&order=display_name.asc", {token});
        if (!result.ok || !Array.isArray(result.data)) return unavailable();
        return respond(200, {members:result.data.map(member).filter(Boolean)});
      }
      if (action === "schedule") {
        const date = url.searchParams.get("date") ?? bangkokDay();
        if (!realDate(date)) return bodyInvalid("Choose a valid schedule date.");
        const query = new URLSearchParams({
          select:"id,scheduled_time,label,items",
          starts_on:"lte." + date,
          or:"(ends_before.is.null,ends_before.gt." + date + ")",
          order:"scheduled_time.asc"
        });
        const result = await upstream("/rest/v1/care_slots?" + query, {token});
        if (!result.ok || !Array.isArray(result.data)) return unavailable();
        const slots = result.data.map(row => ({
          id:row.id, time:String(row.scheduled_time).slice(0,5), label:row.label, items:row.items
        }));
        return respond(200, {slots});
      }
      if (action === "history") {
        const historyFields = "id,slot_id,slot_label,scheduled_time,scheduled_date,actual_date,actual_time,given_by_id,given_by_name,logged_by_id,logged_by_name,items,note,recorded_at";
        const result = await upstream("/rest/v1/care_entries?select=" + historyFields + "&order=actual_date.desc,actual_time.desc,id.desc&limit=500", {token});
        if (!result.ok || !Array.isArray(result.data)) return unavailable();
        return respond(200, {entries:result.data.map(entry)});
      }

      const body = await readBody(request);
      const slotId = body?.slotId, scheduledDate = body?.scheduledDate, actualTime = body?.actualTime;
      const actualDate = body?.actualDate ?? scheduledDate;
      const note = body?.note ?? "";
      const givenById = body?.givenById ?? null;
      if (typeof slotId !== "string" || !UUID.test(slotId) || !realDate(scheduledDate) ||
        !realDate(actualDate) || typeof actualTime !== "string" || !TIME.test(actualTime) ||
        typeof note !== "string" || Array.from(note).length > 1000 ||
        (givenById !== null && (typeof givenById !== "string" || !UUID.test(givenById)))) {
        return bodyInvalid("Check the scheduled slot, dates, actual time, and note.");
      }
      if (givenById !== null && actor.role !== "papa") return forbidden();
      // Do not accept actor names, dose amounts, or medication items from the client.
      const result = await upstream("/rest/v1/rpc/care_log_entry", {token, body:{
        p_slot_id:slotId, p_scheduled_date:scheduledDate, p_actual_date:actualDate,
        p_actual_time:actualTime, p_note:note.trim(), p_given_by_id:givenById
      }});
      if (!result.ok) {
        if (result.data?.code === "23505") return fail(409, "That scheduled dose is already recorded. Check History.", "duplicate");
        if (result.data?.code === "42501" || result.status === 403) return forbidden();
        if (["22007","22008","22023","23514"].includes(result.data?.code)) return bodyInvalid("Check the scheduled slot and actual date or time.");
        if (result.status === 401) return unauthenticated();
        return unavailable();
      }
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row?.id) return unavailable();
      return respond(201, {entry:entry(row)});
    } catch {
      return unavailable();
    }
  };
}

// The hosted pilot uses explicit, separate variables and refuses every other
// origin. Nothing from the existing site's production settings is reused.
export function createPilotHandler({env = process.env, transport = fetch} = {}) {
  return async function pilotApi(request) {
    let allowed;
    try { allowed = new URL(env.ICARE_PILOT_ORIGIN); } catch { return unavailable(); }
    if (allowed.protocol !== "https:" || allowed.origin !== env.ICARE_PILOT_ORIGIN ||
        allowed.origin !== new URL(request.url).origin) return unavailable();
    return createHandler({transport, demoNames:allowed.origin==="https://icare-isolated-lab.netlify.app", env:{
      SUPABASE_URL:env.ICARE_PILOT_SUPABASE_URL,
      SUPABASE_ANON_KEY:env.ICARE_PILOT_SUPABASE_PUBLISHABLE_KEY
    }})(request);
  };
}

export default createPilotHandler();
