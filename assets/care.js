(() => {
"use strict";
const $ = id => document.getElementById(id);
const state = {
  token:null, member:null, members:[], slots:[], rows:[], route:"today",
  load:"idle", day:"", version:0, read:0, collapsed:false, uncertain:new Set()
};
const tz = "Asia/Bangkok";
const dateFmt = new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"});
const timeFmt = new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const niceDay = new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short",year:"numeric"});
const showDate = x => /^\d{4}-\d{2}-\d{2}$/.test(x||"") ? niceDay.format(new Date(x+"T12:00:00Z")) : "Unknown date";
const now = () => { const p = Object.fromEntries(dateFmt.formatToParts(new Date()).map(x=>[x.type,x.value]));return {day:p.year+"-"+p.month+"-"+p.day,time:timeFmt.format(new Date())}; };
const hm = x => typeof x==="string" && /^\d{2}:\d{2}(:\d{2})?$/.test(x) ? x.slice(0,5) : "";
const val = (x,fallback="") => typeof x==="string" ? x : fallback;
const emptyMessage = "Nothing was assumed about any dose. Use your usual care process if you are unsure.";
const icon = id => {
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("class","icon");svg.setAttribute("aria-hidden","true");
  const use=document.createElementNS("http://www.w3.org/2000/svg","use");
  use.setAttribute("href","#"+id);svg.append(use);return svg;
};
const el = (tag,cls,...children) => {
 const n=document.createElement(tag);if(cls)n.className=cls;
 for(const x of children)if(x!==null&&x!==undefined)n.append(typeof x==="string"?document.createTextNode(x):x);
 return n;
};
const button = (label,ic,cls,fn) => {
 const b=el("button",cls,ic?icon(ic):null,label);b.type="button";if(fn)b.addEventListener("click",fn);return b;
};
const tile=(ic,theme="purple")=>el("span","tile "+theme,icon(ic));
const label=(name,ic,input)=>{const l=el("label","",icon(ic),name);l.htmlFor=input.id;return el("div","field",l,input);};
const input=(type,id,value="")=>{const e=el("input");e.id=id;e.type=type;e.value=value;return e;};
const requestKey=(slotId,day)=>String(slotId)+"/"+day;
const recorded=(slotId,day)=>state.rows.find(e=>String(e.slotId)===String(slotId)&&e.scheduledDate===day);
function say(message="",problem=false) {
 const n=$("notice");n.className="notice"+(problem?" problem":"");n.textContent=message;n.hidden=!message;
}
class ApiError extends Error {
 constructor(status,code=""){super("Request failed");this.status=status;this.code=code;}
}
async function api(action,{method="GET",data,token=state.token,date}={}) {
 const q = new URLSearchParams({action}); if(date)q.set("date",date);
 const headers={"Accept":"application/json"}; if(data)headers["Content-Type"]="application/json";
 if(token)headers.Authorization="Bearer "+token;
 let r;
 try {r=await fetch("/.netlify/functions/care-api?"+q,{method,headers,body:data?JSON.stringify(data):undefined,cache:"no-store",credentials:"same-origin"});}
 catch{throw new ApiError(0,"network");}
 const json=await r.json().catch(()=>null);
 if(!r.ok||!json)throw new ApiError(r.ok?502:r.status,val(json?.code));
 return json;
}
function signout(message="") {
 state.version++;state.read++;state.token=null;state.member=null;state.members=[];state.slots=[];state.rows=[];state.route="today";state.load="idle";state.day="";state.uncertain=new Set();
 if($("record-dialog").open)$("record-dialog").close();
 $("record-dialog").replaceChildren();$("workspace").replaceChildren();$("password").value="";
 $("login-error").textContent="";$("login-error").hidden=true;
 shell();say(message,!!message);
}
function shell(){
 const ready=!!state.member;
 $("app-shell").classList.toggle("signed",ready);$("app-shell").classList.toggle("collapsed",state.collapsed);
 for(const id of ["sidebar","toggle-nav","session-nav","mobile-nav","workspace"])$(id).hidden=!ready;
 $("signin").hidden=ready;
 const header=$("session-nav");header.replaceChildren();
 if(ready){
  const b=button("", "logout","icon-button",()=>signout());
  b.title="Sign out";b.setAttribute("aria-label","Sign out");
  header.append(el("div","session-name",el("strong","",state.member.name),el("small","",state.member.role==="papa"?"Parent":"Nurse")),b);
 }
 const toggle=$("toggle-nav");
 toggle.setAttribute("aria-expanded",String(!state.collapsed));toggle.setAttribute("aria-label",state.collapsed?"Show menu":"Hide menu");toggle.title=state.collapsed?"Show menu":"Hide menu";
}
function route(to){if(!state.member||!["today","records"].includes(to))return;state.route=to;render();window.scrollTo(0,0);}
function dataShape(data,key){if(!Array.isArray(data?.[key]))throw new ApiError(502,"invalid_response");return data[key];}
async function loadCare({silent=false}={}){
 if(!state.member)return false;
 const v=state.version,read=++state.read,day=now().day;
 if(!silent){
  state.load="loading";render();
 }
 try{
  const [s,h,m]=await Promise.all([api("schedule",{date:day}),api("history"),state.member.role==="papa"?api("members").catch(e=>{if(e.status===401)throw e;return {members:[]};}):{members:[]}]);
  if(v!==state.version||read!==state.read)return false;
  state.slots=dataShape(s,"slots");state.rows=dataShape(h,"entries");state.members=dataShape(m,"members");state.day=day;state.load="ready";
  for(const row of state.rows)state.uncertain.delete(requestKey(row.slotId,row.scheduledDate));
  render();return true;
 }catch(e){
  if(v!==state.version||read!==state.read)return false;
  if(e.status===401){signout("Your session expired. Sign in again.");return false;}
  state.load="error";render();return false;
 }
}
function medList(items){
 const list=el("ul","meds");
 for(const m of Array.isArray(items)?items:[])list.append(el("li","",el("strong","",val(m?.name,"Unnamed item")),el("span","",val(m?.amount,"Amount not available"))));
 if(!list.childElementCount)list.append(el("li","muted","No medications listed."));
 return list;
}
function empty(title,detail,ic="pill"){return el("div","card empty",tile(ic,"coral"),el("div","",el("strong","",title),el("p","muted",detail)));}
function status(given,text=""){
 return el("span","status "+(given?"given":"unrecorded"),given?icon("check"):null,text||(given?"Recorded":"Not recorded"));
}
function hero(title,description){
 const t=el("strong","","");
 t.dataset.liveClock="true";
 return el("div","hero",el("div","",el("span","eyebrow","CARE TOGETHER · V9"),el("h1","",title),el("p","",description)),
   el("div","clock",icon("clock"),el("div","",el("small","","Bangkok time"),t)));
}
function syncClock(){
 const e=document.querySelector("[data-live-clock]");if(e)e.textContent=now().time;
}
function refreshButton(){
 return button("Refresh","refresh","button",()=>{say();void loadCare();});
}
function render(){
 if(!state.member)return;
 for(const n of document.querySelectorAll("[data-route]")){
  if(n.dataset.route===state.route)n.setAttribute("aria-current","page");else n.removeAttribute("aria-current");
 }
 const root=$("workspace");
 const today=state.route==="today";
 const head=hero(today?"Today":"Records",today?showDate(state.day||now().day):"Medication administration history");
 const caption=el("div","",el("h2","",today?"Medication schedule":"Administration log"),
  today?el("small","","Not recorded does not mean not given."):null);
 const actions=el("div","hero-inline",refreshButton());
 if(!today&&state.load==="ready")actions.prepend(button("Log past dose","plus","button primary",()=>openRecord()));
 const section=el("div","section-head",caption,actions);
 root.replaceChildren(head,section);
 if(state.load==="loading"){root.append(empty("Loading care workspace","Retrieving the schedule and records.","clock"));syncClock();return;}
 if(state.load!=="ready"){root.append(empty("Care information couldn’t load","No new record can be made until the schedule and history load. "+emptyMessage,"shield"));syncClock();return;}
 if(today){
  if(!state.slots.length){root.append(empty("No medications scheduled","There are no schedule entries for this date."));syncClock();return;}
  const collection=el("div","doses");
  for(const s of [...state.slots].sort((a,b)=>hm(a.time).localeCompare(hm(b.time)))){
   const entry=recorded(s.id,state.day),unknown=state.uncertain.has(requestKey(s.id,state.day));
   const details=el("div","",el("time","",hm(s.time)||"Time unavailable"),el("h3","",val(s.label,"Scheduled dose")),medList(entry?.items||s.items));
   if(entry)details.append(el("p","meta",[`Given by ${val(entry.givenBy,"caregiver")}`,`at ${hm(entry.actualTime)||"unknown time"}`,entry.actualDate&&entry.actualDate!==state.day?showDate(entry.actualDate):""].filter(Boolean).join(" ")));
   if(unknown&&!entry)details.append(el("p","meta","Save status is uncertain. Check with your team before logging again."));
   const hasItems=Array.isArray(s.items)&&s.items.length>0;
   const a=el("div","actions",status(!!entry,unknown&&!entry?"Check status":""));
   if(!entry&&!unknown&&hasItems) a.append(button("Confirm given","check","button primary",()=>openRecord(s)));
   collection.append(el("article","card dose",tile(entry?"check":"pill",entry?"green":"coral"),details,a));
  }
  root.append(collection);
 } else {
  if(!state.rows.length){root.append(empty("No medication records yet","Confirmed entries will appear here.","history"));syncClock();return;}
  const list=el("div","entries");
  for(const e of state.rows){
   const actualDate=val(e.actualDate,e.scheduledDate);
   const body=el("div","",el("h3","",val(e.slotLabel,"Scheduled dose")),el("time","",showDate(actualDate)+" · "+(hm(e.actualTime)||"Time unavailable")),
     el("p","meta","Scheduled: "+showDate(e.scheduledDate)+(hm(e.scheduledTime)?" · "+hm(e.scheduledTime):"")),medList(e.items),
     el("p","meta","Given by "+val(e.givenBy,"Unknown")+" · Logged by "+val(e.loggedBy,"Unknown")),e.note?el("p","entry-note",val(e.note)):null);
   list.append(el("article","card entry",tile("history"),body,status(true,"Given")));
  }root.append(list);
 }
 syncClock();
}

function openRecord(initialSlot){
 const dialog=$("record-dialog");
 if(dialog.open||!state.member||state.load!=="ready")return;
 const v=state.version,member=state.member,openedDate=now().day;
 const current=now(),asPast=!initialSlot;
 let choices=initialSlot?[initialSlot]:[], schedRead=0, busy=false, noRetry=false;
 const form=el("form"),title=el("h2","",asPast?"Log a past dose":"Confirm medication given");
 title.id="record-title";form.noValidate=true;
 const schedDate=input("date","scheduled-date",current.day);schedDate.max=current.day;schedDate.required=true;
 const slot=el("select");slot.id="scheduled-slot";slot.required=true;
 const notice=el("p","muted","");
 notice.setAttribute("aria-live","polite");
 const sample=el("div","");
 const actualDate=input("date","actual-date",current.day);actualDate.max=current.day;actualDate.required=true;
 const actualTime=input("time","actual-time");actualTime.required=true;
 const note=el("textarea");note.id="dose-note";note.maxLength=500;note.rows=2;
 const checked=input("checkbox","given-confirmed");
 const checkedLabel=el("label","check-label",checked,"I verified these medications were already given.");checkedLabel.htmlFor=checked.id;
 const error=el("p","error");error.setAttribute("role","alert");error.hidden=true;
 const cancel=button("Cancel",null,"button",()=>dialog.close());
 const submit=el("button","button primary",icon("check"),"Save given record");submit.type="submit";
 const person=el("select");person.id="given-by";person.required=true;
 const selfOpt=el("option","",member.name+" (me)");selfOpt.value=String(member.id);person.append(selfOpt);
 if(member.role==="papa")for(const m of state.members)if(m?.id&&String(m.id)!==String(member.id)){const o=el("option","",val(m.name,"Caregiver"));o.value=String(m.id);person.append(o);}
 if(initialSlot){schedDate.disabled=true;slot.disabled=true;}
 const fieldGroup=el("div","fields",label("Scheduled date","calendar",schedDate),label("Scheduled dose","pill",slot));
 form.append(title,el("p","muted","Record only a dose that has already been given."),fieldGroup,notice,sample,el("div","fields",label("Actual date given","calendar",actualDate),label("Actual time given","clock",actualTime)),
  label("Given by","person",person),el("p","meta","Logged by "+member.name),label("Note (optional)","note",note),
  checkedLabel,error,el("div","actions",cancel,submit));
 dialog.replaceChildren(form);
 const err=(message="")=>{error.textContent=message;error.hidden=!message;};
 function setChoices(preselect=""){
  const blank=el("option","","Choose a scheduled dose");blank.value="";slot.replaceChildren(blank);
  for(const s of [...choices].sort((a,b)=>hm(a.time).localeCompare(hm(b.time)))){
    const o=el("option","",hm(s.time)+" · "+val(s.label,"Scheduled dose"));o.value=String(s.id);slot.append(o);
  }
  slot.value=preselect; updatePreview();
 }
 function updatePreview(){
  const match=choices.find(s=>String(s.id)===slot.value);
  sample.replaceChildren();if(match)sample.append(medList(match.items));
  submit.disabled=busy||noRetry||!match||!Array.isArray(match.items)||!match.items.length||
   !!recorded(match.id,schedDate.value)||state.uncertain.has(requestKey(match.id,schedDate.value));
  if(match&&recorded(match.id,schedDate.value))err("This scheduled dose already has a record. Open Records to review it.");
  else if(match&&state.uncertain.has(requestKey(match.id,schedDate.value)))err("The save result is uncertain. Check with your team before recording this dose again.");
 }
 async function loadSlots(){
  const day=schedDate.value,seq=++schedRead;
  choices=[];setChoices();slot.disabled=true;
  if(!day||day>now().day){notice.textContent="Choose today or an earlier scheduled date.";return;}
  notice.textContent="Checking the schedule for this date…";
  try{
   const list=await api("schedule",{date:day});
   if(v!==state.version||seq!==schedRead||!dialog.open)return;
   choices=dataShape(list,"slots");slot.disabled=!choices.length;setChoices();
   notice.textContent=choices.length?"":"No scheduled medications were returned for this date.";
  }catch(e){
   if(v!==state.version||seq!==schedRead||!dialog.open)return;
   if(e.status===401){signout("Your session expired. Sign in again.");return;}
   notice.textContent="Couldn’t load this date’s schedule. Close this form and try again.";
  }
 }
 schedDate.addEventListener("change",()=>{err();actualDate.value=schedDate.value;void loadSlots();});
 slot.addEventListener("change",()=>{err();updatePreview();});
 dialog.oncancel=e=>{if(busy)e.preventDefault();};
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(busy||noRetry||v!==state.version)return;
  const selected=choices.find(s=>String(s.id)===slot.value);
  const day=schedDate.value,atDay=actualDate.value,atTime=hm(actualTime.value),n=now();
  if(!selected||!day||!atDay||!atTime){err("Choose the dose and enter the actual date and time it was given.");return;}
  if(day>n.day||atDay>n.day||(atDay===n.day&&atTime>n.time)){err("Enter a date and time that have already passed.");return;}
  if(!checked.checked){err("Confirm that the medication was already given before saving.");return;}
  const key=requestKey(selected.id,day);
  if(recorded(selected.id,day)||state.uncertain.has(key)){updatePreview();return;}
  const req={slotId:selected.id,scheduledDate:day,actualDate:atDay,actualTime:atTime,note:note.value.trim()};
  if(member.role==="papa"&&person.value&&person.value!==String(member.id))req.givenById=person.value;
  err();busy=true;cancel.disabled=true;updatePreview();
  try{
   const result=await api("record",{method:"POST",data:req});
   if(v!==state.version)return;
   if(!result?.entry)throw new ApiError(502,"invalid_response");
   state.rows=[result.entry,...state.rows.filter(x=>x.id!==result.entry.id)];
   state.uncertain.delete(key);dialog.close();dialog.replaceChildren();
   say("Given record saved.");render();void loadCare({silent:true});
  }catch(ex){
   if(v!==state.version)return;
   if(ex.status===401){signout("Your session expired. Sign in again.");return;}
   if(ex.status===409){
    noRetry=true;state.uncertain.add(key);err("A record for this dose already exists. Close this form and review Records. Nothing new was added.");
    void loadCare({silent:true});
   }else if(ex.status===0||ex.status>=500){
    noRetry=true;state.uncertain.add(key);
    err("The server did not confirm whether this record was saved. Close this form, refresh Records, and check with your team before trying again.");
    void loadCare({silent:true});
   }else{
    err(ex.status===403?"You don’t have permission to make this record.":"This record was not accepted. Check the date, time and selected dose.");
   }
  }finally{
   if(v===state.version&&dialog.open){busy=false;cancel.disabled=false;if(noRetry)submit.disabled=true;else updatePreview();}
  }
 });
 dialog.showModal();
 if(initialSlot){
  schedDate.value=state.day||openedDate;actualDate.value=current.day;setChoices(String(initialSlot.id));actualTime.focus();
 }else{setChoices();void loadSlots();schedDate.focus();}
}
$("login-form").addEventListener("submit",async e=>{
 e.preventDefault();
 const err=$("login-error"),submit=$("login-submit"),pwd=$("password");
 if(submit.disabled)return;
 const v=++state.version;
 err.hidden=true;submit.disabled=true;submit.textContent="Signing in…";
 const request={email:$("email").value.trim(),password:pwd.value};pwd.value="";
 try{
  const auth=await api("login",{method:"POST",data:request,token:null});
  request.password="";
  if(v!==state.version)return;
  if(typeof auth?.accessToken!=="string"||!auth.accessToken)throw new ApiError(502);
  const session=await api("session",{token:auth.accessToken});
  if(v!==state.version)return;
  if(!session.member?.id||!session.member?.name||!["papa","nurse"].includes(session.member.role))throw new ApiError(403);
  state.token=auth.accessToken;state.member=session.member;state.route="today";
  $("email").value="";say();shell();void loadCare();
 }catch(ex){
  if(v!==state.version)return;
  err.textContent=ex.status===401?"Email or password wasn’t accepted.":ex.status===403?"This account does not have care-team access.":"Sign-in is unavailable. Try again or contact your care-team administrator.";
  err.hidden=false;
 }finally{
  request.password="";submit.disabled=false;submit.textContent="Sign in";
 }
});
for(const b of document.querySelectorAll("[data-route]"))b.addEventListener("click",()=>route(b.dataset.route));
$("toggle-nav").addEventListener("click",()=>{state.collapsed=!state.collapsed;shell();});
setInterval(()=>{
 syncClock();
 if(state.member&&state.load==="ready"&&state.day!==now().day&&!$("record-dialog").open)void loadCare();
},15000);
window.addEventListener("pagehide",()=>{if(state.member)signout();});
window.addEventListener("pageshow",event=>{if(event.persisted&&state.member)signout();});
shell();
})();
