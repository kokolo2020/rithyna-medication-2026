import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHandler, createPilotHandler, createLiveHandler} from "../netlify/functions/care-api.mjs";

const api = "https://ui.invalid/.netlify/functions/care-api?action=";
const cfg = {SUPABASE_URL:"https://db.invalid", SUPABASE_ANON_KEY:"sb_publishable_fixture"};
const a = "10000000-0000-4000-8000-000000000001";
const b = "20000000-0000-4000-8000-000000000002";
const s = "30000000-0000-4000-8000-000000000003";
const e = "40000000-0000-4000-8000-000000000004";
const member = role => ({user_id:a, display_name:"Synthetic caregiver", role});
const item = [{name:"Only an example",amount:"Example amount"}];
const record = {
  slotId:s, scheduledDate:"2020-02-29", actualDate:"2020-03-01", actualTime:"00:05", note:"Checked verbally"
};
const saved = {
  id:e, slot_id:s, slot_label:"Synthetic slot", scheduled_time:"23:55:00", scheduled_date:record.scheduledDate,
  actual_date:record.actualDate, actual_time:"00:05:00", given_by_id:b, given_by_name:"Synthetic giver",
  logged_by_id:a, logged_by_name:"Synthetic caregiver", items:item, note:record.note, recorded_at:"2020-03-01T01:00:00Z"
};
const req = (action, options = {}) => {
  const headers = new Headers(options.headers);
  if (options.token !== false) headers.set("authorization", "Bearer test-token");
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(api + action, {
    method:options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body:options.body === undefined ? undefined : JSON.stringify(options.body)
  });
};
const json = (data, status = 200) => Response.json(data, {status});
function fixture({role="papa", missing=false, expired=false, recordFailure=null, records=[saved], clock=Date.now}={}) {
  const calls = [];
  const handler = createHandler({env:cfg, clock, transport:async (input, opts) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://db.invalid");
    assert.equal(opts.headers.apikey, cfg.SUPABASE_ANON_KEY);
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({url,opts,body});
    switch (url.pathname) {
      case "/auth/v1/token": return json({access_token:"sign-in-fixture",refresh_token:"never expose"});
      case "/auth/v1/user": return expired ? json({},401) : json({id:a});
      case "/rest/v1/care_members":
        return json(url.searchParams.has("user_id") ? (missing ? [] : [member(role)]) :
          [member(role), {user_id:b, role:"nurse", display_name:"Synthetic giver"}]);
      case "/rest/v1/care_slots": return json([{id:s,scheduled_time:"23:55:00",label:"Synthetic slot",items:item}]);
      case "/rest/v1/care_entries": return json(records);
      case "/rest/v1/rpc/care_log_entry":
        return recordFailure ? json(recordFailure,409) : json(saved);
      default: assert.fail("Unexpected upstream request " + url.pathname);
    }
  }});
  return {handler,calls};
}

test("login checks active membership and returns only access token", async () => {
  const {handler,calls} = fixture();
  const r = await handler(req("login", {token:false,body:{email:" fake@example.invalid ",password:"test0 pass  "}}));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {accessToken:"sign-in-fixture"});
  assert.equal(r.headers.get("cache-control"), "no-store, private");
  assert.deepEqual(calls[0].body,{email:"fake@example.invalid",password:"test0 pass  "});
  assert.equal(calls[1].opts.headers.authorization, "Bearer sign-in-fixture");
  assert.equal(calls[2].url.searchParams.get("user_id"),"eq."+a);
  const missing = fixture({missing:true});
  assert.equal((await missing.handler(req("login",{token:false,body:{email:"x@example.invalid",password:"dummy"}}))).status,403);
});

test("anonymous, expired, cross-origin, and wrong-method requests are stopped", async () => {
  const {handler,calls} = fixture({expired:true});
  assert.equal((await handler(req("schedule",{token:false}))).status,401);
  assert.equal((await handler(req("session",{headers:{origin:"https://other.invalid"}}))).status,403);
  const wrong = await handler(req("record"));
  assert.equal(wrong.status,405);
  assert.equal(wrong.headers.get("allow"),"POST");
  assert.equal(calls.length,0);
  assert.equal((await handler(req("history"))).status,401);
  assert.equal(calls.length,1);
});

test("session derives role from active DB member; nurses cannot enumerate or delegate", async () => {
  const {handler,calls} = fixture({role:"nurse"});
  const ss = await handler(req("session"));
  assert.deepEqual(await ss.json(),{member:{id:a,name:"Synthetic caregiver",role:"nurse"}});
  assert.equal((await handler(req("members"))).status,403);
  assert.equal((await handler(req("record",{body:{...record,givenById:b}}))).status,403);
  assert.ok(!calls.some(x=>x.url.pathname.includes("/rpc/")));
});

test("schedule is effective-dated and history uses snapshots and raw bearer", async () => {
  const {handler,calls} = fixture();
  const plan = await handler(req("schedule&date=2020-02-29"));
  const planData=await plan.json();
  assert.deepEqual(planData.slots,[{id:s,time:"23:55",label:"Synthetic slot",items:item}]);
  assert.equal(planData.date,"2020-02-29");
  assert.ok(Number.isFinite(planData.serverNowMs));
  const after = await handler(req("history"));
  const {entries} = await after.json();
  assert.deepEqual(entries[0].items,item);
  assert.equal(entries[0].actualTime,"00:05");
  assert.equal(entries[0].actualDate,"2020-03-01");
  assert.equal(entries[0].scheduledDate,"2020-02-29");
  assert.equal(entries[0].givenById,b);
  assert.equal(entries[0].loggedById,a);
  const getSlots = calls.find(x=>x.url.pathname.endsWith("care_slots"));
  assert.equal(getSlots.url.searchParams.get("starts_on"),"lte.2020-02-29");
  assert.equal(getSlots.url.searchParams.get("or"),"(ends_before.is.null,ends_before.gt.2020-02-29)");
  assert.ok(calls.every(c=>c.opts.headers.authorization==="Bearer test-token"));
  assert.equal((await handler(req("schedule&date=2021-02-29"))).status,400);
});

test("default schedule follows Bangkok midnight, independent of browser or host timezone", async () => {
  let now = Date.parse("2026-11-24T16:59:59Z");
  const {handler,calls} = fixture({clock:() => now});
  const before = await (await handler(req("schedule"))).json();
  assert.equal(before.serverNowMs, now);
  assert.equal(before.date,"2026-11-24");
  now+=1000;
  const current = await (await handler(req("schedule"))).json();
  assert.equal(current.date,"2026-11-25");
  assert.equal(current.serverNowMs,now);
  const queries=calls.filter(c=>c.url.pathname.endsWith("care_slots"));
  assert.deepEqual(queries.map(c=>c.url.searchParams.get("starts_on")),["lte.2026-11-24","lte.2026-11-25"]);
});

test("Papa may enumerate and log for another invited caregiver, but cannot inject attribution or medications", async () => {
  const {handler,calls} = fixture();
  const m = await handler(req("members"));
  assert.deepEqual(await m.json(),{members:[{id:a, name:"Synthetic caregiver", role:"papa"},{id:b,name:"Synthetic giver",role:"nurse"}]});
  const r = await handler(req("record",{body:{
    ...record, givenById:b, givenBy:"Forged", loggedById:b, items:[{name:"Not a snapshot",amount:"spoof"}]
  }}));
  assert.equal(r.status,201);
  const post = calls.find(c=>c.url.pathname.endsWith("/care_log_entry"));
  assert.deepEqual(post.body,{p_slot_id:s,p_scheduled_date:"2020-02-29",p_actual_date:"2020-03-01",p_actual_time:"00:05",p_note:"Checked verbally",p_given_by_id:b});
  const {entry} = await r.json();
  assert.deepEqual(entry.items,item);
  assert.equal(entry.givenBy,"Synthetic giver");
  assert.equal(entry.loggedBy,"Synthetic caregiver");
  assert.equal(entry.loggedById,a);
});

test("duplicate produces conflict, malformed dates and times never hit log RPC", async () => {
  const {handler,calls} = fixture({recordFailure:{code:"23505",details:"do not forward upstream data"}});
  const duplicate = await handler(req("record",{body:{...record,actualDate:undefined}}));
  assert.equal(duplicate.status,409);
  const reason = await duplicate.json();
  assert.equal(reason.code,"duplicate");
  assert.ok(!JSON.stringify(reason).includes("upstream"));
  const posts = calls.filter(c=>c.url.pathname.endsWith("/care_log_entry"));
  assert.equal(posts.length,1);
  assert.equal(posts[0].body.p_actual_date,"2020-02-29");
  assert.equal((await handler(req("record",{body:{...record,scheduledDate:"2021-02-29"}}))).status,400);
  assert.equal((await handler(req("record",{body:{...record,actualTime:"24:00"}}))).status,400);
  assert.equal(calls.filter(c=>c.url.pathname.endsWith("/care_log_entry")).length,1);
});

test("missing config or secret service keys fail closed before network",async () => {
  for (const env of [{},{...cfg,SUPABASE_ANON_KEY:"sb_secret_not-allowed"},{...cfg,SUPABASE_URL:"http://db.invalid"}]) {
    const h = createHandler({env,transport:()=>assert.fail("must be offline")});
    const r=await h(req("login",{body:{email:"x@example.invalid",password:"dummy"}}));
    assert.equal(r.status,503);
    assert.equal((await r.json()).code,"not_configured");
  }
});

test("schema defines append-only RLS, identity and date/slot uniqueness, and no seed",async () => {
  const sql = await readFile(new URL("../schema.sql",import.meta.url),"utf8");
  for (const table of ["care_members","care_slots","care_entries"]) {
    assert.match(sql,new RegExp("alter table public\\." + table + " enable row level security"));
  }
  assert.match(sql,/revoke all on public\.care_teams,public\.care_members,public\.care_slots,public\.care_entries from public,anon,authenticated/);
  assert.doesNotMatch(sql,/grant\s+(?:all|update|insert|delete)\s+on\s+public\.care_entries/i);
  assert.match(sql,/unique\(team_id, schedule_key, scheduled_date\)/);
  assert.match(sql,/v_actor\.user_id,v_actor\.display_name,\s*v_slot\.items/);
  assert.match(sql,/p_scheduled_date<s\.ends_before/);
  assert.match(sql,/grant execute on function public\.care_log_entry[\s\S]*to authenticated/);
  assert.doesNotMatch(sql,/insert into public\.(?:care_members|care_slots|care_teams)/i);
});

test("pilot only accepts its exact origin and ignores legacy environment variables", async () => {
  const offline = () => assert.fail("Must not reach database");
  const original = req("session",{token:false});
  const other = new Request(original.url.replace("ui.invalid","production.invalid"));
  const pilot = {ICARE_PILOT_ORIGIN:"https://ui.invalid", ICARE_PILOT_SUPABASE_URL:cfg.SUPABASE_URL, ICARE_PILOT_SUPABASE_PUBLISHABLE_KEY:cfg.SUPABASE_ANON_KEY};
  assert.equal((await createPilotHandler({env:cfg,transport:offline})(original)).status,503);
  assert.equal((await createPilotHandler({env:{...cfg,ICARE_PILOT_ORIGIN:pilot.ICARE_PILOT_ORIGIN},transport:offline})(original)).status,503);
  assert.equal((await createPilotHandler({env:pilot,transport:offline})(other)).status,503);
  assert.equal((await createPilotHandler({env:pilot,transport:offline})(original)).status,401);
});

test("fictional Papa name is accepted only in the explicit lab mode and only for a parent",async()=>{
 const body={name:" Papa ",password:"327109521647904"};
 let seen;
 const transport=async(url,opts)=>{
  if(url.includes("/auth/v1/token")){seen=JSON.parse(opts.body);return json({access_token:"fixture"});}
  if(url.includes("/auth/v1/user"))return json({id:a});
  return json([member("papa")]);
 };
 const r=await createHandler({env:cfg,transport,demoNames:true})(req("login",{body}));
 assert.equal(r.status,200);
 assert.equal(seen.email,"icare-papa-pilot@example.com");
 for(const [demoNames,attempt] of [[false,body],[true,{...body,password:"9999"}],[true,{...body,name:"Other"}]]){
   assert.equal((await createHandler({env:cfg,transport:()=>assert.fail("must not reach auth"),demoNames})(req("login",{body:attempt}))).status,401);
 }
});

test("live schedule setup is limited to the configured parent with an admin claim",async()=>{
 const owner={id:a,email:"owner@example.invalid"};
 const body={change:"add",time:"14:00",label:" Synthetic ",items:[{name:" Sample ",amount:" 1 unit ",ignored:true}]};
 let calls=[],actorId=a,role="papa",admin=true;
 const transport=async(url,opts)=>{
  calls.push({url,opts});
  if(url.includes("/auth/v1/user"))return json({id:actorId,app_metadata:{icare_schedule_admin:admin}});
  if(url.includes("care_members"))return json([{user_id:actorId,display_name:"Synthetic person",role}]);
  return json("2026-11-25");
 };
 const handler=createLiveHandler({transport,env:{
  ICARE_LIVE_ORIGIN:"https://ui.invalid",ICARE_LIVE_OWNER_ID:owner.id,ICARE_LIVE_OWNER_LOGIN:owner.email,
  ICARE_LIVE_SUPABASE_URL:cfg.SUPABASE_URL,ICARE_LIVE_SUPABASE_PUBLISHABLE_KEY:cfg.SUPABASE_ANON_KEY}});
 let r=await handler(req("manage",{body}));
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{effectiveDate:"2026-11-25"});
 assert.match(calls.at(-1).url,/\/rpc\/care_manage_slot$/);
 assert.deepEqual(JSON.parse(calls.at(-1).opts.body).p_items,[{name:"Sample",amount:"1 unit"}]);
 const baseline=calls.filter(c=>c.url.includes("/rpc/")).length;
 for(const change of [{actorId:b,role:"papa",admin:true},{actorId:a,role:"nurse",admin:true},{actorId:a,role:"papa",admin:false}]){
  ({actorId,role,admin}=change);r=await handler(req("manage",{body}));assert.equal(r.status,403);
 }
 assert.equal(calls.filter(c=>c.url.includes("/rpc/")).length,baseline);
 assert.equal((await handler(new Request(req("session").url.replace("ui.invalid","other.invalid")))).status,503);
});
