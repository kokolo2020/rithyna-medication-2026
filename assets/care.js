(() => {
"use strict";
const $ = id => document.getElementById(id);
const state = {
  token:null, member:null, scheduleAdmin:false, members:[], slots:[], rows:[], route:"today",
  load:"idle", notes:[], noteStatus:"idle", noteDraft:"", noteWhen:null, noteRetry:null, noteBusy:false, noteRead:0, day:"", version:0, read:0, collapsed:false, uncertain:new Set(), confirming:new Set()
};
const tz = "Asia/Bangkok";
const dateFmt = new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"});
const timeFmt = new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const niceDay = new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short",year:"numeric"});
const showDate = x => /^\d{4}-\d{2}-\d{2}$/.test(x||"") ? niceDay.format(new Date(x+"T12:00:00Z")) : "Unknown date";
let clockAnchor=null;state.notes=[];state.noteStatus="idle";state.noteDraft="";state.noteWhen=null;state.noteRetry=null;state.noteBusy=false;state.noteRead++;
const now = () => {
 const instant=clockAnchor?new Date(clockAnchor.server+Math.max(0,performance.now()-clockAnchor.received)):new Date();
 const p=Object.fromEntries(dateFmt.formatToParts(instant).map(x=>[x.type,x.value]));
 return {day:p.year+"-"+p.month+"-"+p.day,time:timeFmt.format(instant)};
};
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
 clockAnchor=null;
 state.version++;state.read++;state.token=null;state.member=null;state.scheduleAdmin=false;state.members=[];state.slots=[];state.rows=[];state.route="today";state.load="idle";state.day="";state.uncertain=new Set();state.confirming=new Set();
 if($("record-dialog").open)$("record-dialog").close();
 $("record-dialog").replaceChildren();$("workspace").replaceChildren();$("password").value="";
 $("login-error").textContent="";$("login-error").hidden=true;
 shell();say(message,!!message);
}
function shell(){
 const ready=!!state.member;
 for(const n of document.querySelectorAll('[data-route="notes"]'))n.hidden=!state.scheduleAdmin;
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
function route(to){if(!state.member||(!["today","records"].includes(to)&&!(state.scheduleAdmin&&to==="notes")))return;state.route=to;render();if(to==="notes")void loadNotes();window.scrollTo(0,0);}
function dataShape(data,key){if(!Array.isArray(data?.[key]))throw new ApiError(502,"invalid_response");return data[key];}
async function loadCare({silent=false}={}){
 if(!state.member)return false;
 const v=state.version,read=++state.read;
 if(!silent){
  state.load="loading";render();
 }
 try{
  const [s,h,m]=await Promise.all([api("schedule").then(data=>({data,received:performance.now()})),api("history"),state.member.role==="papa"?api("members").catch(e=>{if(e.status===401)throw e;return {members:[]};}):{members:[]}]);
  if(v!==state.version||read!==state.read)return false;
  const {date,serverNowMs}=s.data;
  if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(serverNowMs))
   throw new ApiError(502,"invalid_response");
  clockAnchor={server:serverNowMs,received:s.received};
  state.slots=dataShape(s.data,"slots");state.rows=dataShape(h,"entries");state.members=dataShape(m,"members");state.day=date;state.load="ready";
  if($("record-dialog").open)for(const id of ["scheduled-date","actual-date"]){
   const field=$(id);if(field)field.max=date;
  }
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
 return el("div","hero",el("div","",el("span","eyebrow",state.scheduleAdmin?"ICARE · PRIVATE WORKSPACE":"ICARE · TEST WORKSPACE"),el("h1","",title),el("p","",description)),
   el("div","clock",icon("clock"),el("div","",el("small","","Bangkok time"),t)));
}
function syncClock(){
 const stamp=now(),e=document.querySelector("[data-live-clock]");if(e)e.textContent=stamp.time;
 for(const b of document.querySelectorAll("button[data-confirm-time]")){
  if(b.dataset.confirmTime)b.disabled=stamp.day!==state.day||stamp.time<b.dataset.confirmTime;
 }
}
function refreshButton(){
 return button("Refresh","refresh","button",()=>{say();void loadCare();});
}
function dayProgress(){
 const total=state.slots.length;
 if(!total)return null;
 const done=state.slots.filter(s=>recorded(s.id,state.day)).length;
 const complete=done===total;
 return el("section","card day-progress",tile(complete?"check":"history",complete?"green":"purple"),
   el("div","day-progress-copy",el("h2","",complete?"All scheduled slots recorded":"Today’s progress"),
      el("p","muted",done+" of "+total+" scheduled slots recorded")),
   button("View records","history","button",()=>route("records")));
}
function render(){
 if(!state.member)return;
 for(const n of document.querySelectorAll("[data-route]")){
  if(n.dataset.route===state.route)n.setAttribute("aria-current","page");else n.removeAttribute("aria-current");
 }
 const root=$("workspace");
 if(state.route==="notes"&&state.scheduleAdmin){renderNotes(root);return;}
 const today=state.route==="today";
 const head=hero(today?"Today":"Records",today?showDate(state.day||now().day):"Medication administration history");
 const caption=el("div","",el("h2","",today?"Medication schedule":"Administration log"),
  today?el("small","","Confirm only after all items shown were given. Not recorded does not mean not given."):null);
 const actions=el("div","hero-inline",refreshButton());
 if(today&&state.load==="ready"&&state.scheduleAdmin)actions.prepend(button("Add time","plus","button primary",()=>manageSlot()));
 if(today&&state.load==="ready"&&state.scheduleAdmin&&state.slots.some(s=>recorded(s.id,state.day)))
  actions.append(button("Manage schedule","calendar","button",showScheduleSettings));
 if(!today&&state.load==="ready")actions.prepend(button("Log past dose","plus","button primary",()=>openRecord()));
 const section=el("div","section-head",caption,actions);
 root.replaceChildren(head,section);
 if(state.load==="loading"){root.append(empty("Loading care workspace","Retrieving the schedule and records.","clock"));syncClock();return;}
 if(state.load!=="ready"){root.append(empty("Care information couldn’t load","No new record can be made until the schedule and history load. "+emptyMessage,"shield"));syncClock();return;}
 if(today){
  const progress=dayProgress();
  if(progress)root.replaceChildren(head,progress,section);
  if(!state.slots.length){root.append(empty("No medications scheduled","There are no schedule entries for this date."));syncClock();return;}
  const pending=state.slots.filter(s=>!recorded(s.id,state.day));
  if(!pending.length){root.append(empty("No doses left to record today","Confirmed doses are in Records.","check"));syncClock();return;}
  const collection=el("div","doses");
  for(const s of pending.sort((a,b)=>hm(a.time).localeCompare(hm(b.time)))){
   const day=state.day,key=requestKey(s.id,day);
   const unknown=state.uncertain.has(key),saving=state.confirming.has(key);
   const details=el("div","",el("time","",hm(s.time)||"Time unavailable"),el("h3","",val(s.label,"Scheduled dose")),medList(s.items));
   if(unknown)details.append(el("p","meta","Save status is uncertain. Check with your team before logging again."));
   const hasItems=Array.isArray(s.items)&&s.items.length>0;
   const a=el("div","actions",status(false,unknown?"Check status":saving?"Saving…":""));
   if(!unknown&&!saving&&hasItems){
    if(hm(s.time)){
     const confirm=button("Confirm given now","check","button primary",()=>void confirmNow(s,day));
     confirm.dataset.confirmTime=hm(s.time);a.append(confirm);
    }
    a.append(button("Log details","clock","button",()=>{if(state.day===day)openRecord(s);}));
   }
   if(state.scheduleAdmin) a.append(button("Edit","note","button",()=>manageSlot(s)),button("Remove","", "button",()=>manageSlot(s,true)));
   collection.append(el("article","card dose",tile("pill","coral"),details,a));
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

const noteDateFmt=new Intl.DateTimeFormat("en-GB",{timeZone:tz,dateStyle:"medium",timeStyle:"short"});
function noteStamp(value){
 const d=new Date(value);return Number.isFinite(d.valueOf()) ? noteDateFmt.format(d)+" · Bangkok time" : "Time unavailable";
}
async function loadNotes(){
 if(!state.scheduleAdmin)return;
 const v=state.version,r=++state.noteRead;
 state.noteStatus="loading";if(state.route==="notes")render();
 try{
  const res=await api("notes");if(v!==state.version||r!==state.noteRead)return;
  state.notes=dataShape(res,"notes");state.noteStatus="ready";
 }catch(ex){
  if(v!==state.version||r!==state.noteRead)return;
  if(ex.status===401){signout("Your session expired. Sign in again.");return;}
  state.noteStatus="error";
 }
 if(state.route==="notes")render();
}
function renderNotes(root){
 const form=el("form","card note-form");
 const current=now(), when=state.noteWhen||{date:current.day,time:current.time};
 const date=input("date","note-date",when.date),time=input("time","note-time",when.time);
 date.required=time.required=true;date.max=current.day;
 date.disabled=time.disabled=state.noteBusy||Boolean(state.noteRetry);
 const keepWhen=()=>{state.noteWhen={date:date.value,time:time.value};};
 date.addEventListener("input",keepWhen);time.addEventListener("input",keepWhen);
 date.addEventListener("change",keepWhen);time.addEventListener("change",keepWhen);
 const useNow=button("Use current time","clock","button",()=>{
  const current=now();date.value=current.day;time.value=current.time;keepWhen();
 });useNow.disabled=date.disabled;
 const field=el("textarea");field.id="care-note";field.maxLength=1000;field.rows=3;field.required=true;
 field.value=state.noteDraft;field.placeholder="What would you like to note?";
 field.readOnly=state.noteBusy||Boolean(state.noteRetry);
 field.addEventListener("input",()=>{state.noteDraft=field.value;});
 const save=el("button","button primary",icon("check"),state.noteBusy?"Saving…":state.noteRetry?"Retry same note":"Save note");
 save.type="submit";save.disabled=state.noteBusy;
 const tip=state.noteRetry?"Save wasn’t confirmed. Retry this same note to avoid a duplicate.":"Notes are saved separately from medication records.";
 form.append(el("h2","","Add a note"),label("Care note","note",field),
   el("div","fields",label("Date (Bangkok)","calendar",date),label("Time (Bangkok)","clock",time)),
   useNow,el("p","muted",tip),save);
 form.addEventListener("submit",async event=>{
  event.preventDefault();if(state.noteBusy||!state.scheduleAdmin||!field.value.trim())return;
  const v=state.version, payload=state.noteRetry||{id:crypto.randomUUID(),text:field.value.trim(),date:date.value,time:time.value};
  state.noteWhen={date:payload.date,time:payload.time};
  state.noteDraft=payload.text;state.noteBusy=true;state.noteRead++;render();
  try{
   const res=await api("add-note",{method:"POST",data:payload});
   if(v!==state.version)return;
   if(res?.note?.id!==payload.id)throw new ApiError(502);
   state.noteRetry=null;state.noteDraft="";state.noteWhen=null;state.noteBusy=false;say("Care note saved.");
   void loadNotes();
  }catch(ex){
   if(v!==state.version)return;
   if(ex.status===401){signout("Your session expired. Sign in again.");return;}
   state.noteBusy=false;state.noteRetry=ex.status===0||ex.status>=500?payload:null;
   say(state.noteRetry?"The save could not be confirmed.":"Note not saved. Check the text, date and Bangkok time.",true);
   if(state.route==="notes")render();
  }
 });
 const list=el("div","entries");
 if(state.noteStatus==="loading")list.append(empty("Loading notes","Checking your saved care notes.","note"));
 else if(state.noteStatus==="error")list.append(empty("Notes could not load","Use Refresh notes to try again.","note"));
 else if(!state.notes.length)list.append(empty("No care notes yet","Your notes will appear here.","note"));
 else for(const item of state.notes)list.append(el("article","card entry",tile("note"),el("div","",
   el("p","meta",(item.occurredAt?"Happened ":"Saved ")+noteStamp(item.occurredAt||item.createdAt)),el("p","entry-note",item.text),
   item.occurredAt?el("small","muted","Saved "+noteStamp(item.createdAt)):null)));
 root.replaceChildren(hero("Care Notes","Daily updates and observations"),form,
   el("div","section-head",el("h2","","Saved notes"),button("Refresh notes","refresh","button",()=>void loadNotes())),list);
 syncClock();
}

function showScheduleSettings(){
 const dialog=$("record-dialog");
 if(!state.scheduleAdmin||state.load!=="ready"||dialog.open)return;
 const title=el("h2","","Manage schedule");title.id="record-title";
 const wrapper=el("div","",title,el("p","muted","Changes here affect the schedule, not confirmed records."));
 for(const s of [...state.slots].sort((a,b)=>hm(a.time).localeCompare(hm(b.time)))){
  const row=label=>{dialog.close();manageSlot(s,label==="Remove");};
  wrapper.append(el("div","card schedule-item",el("strong","",hm(s.time)+" · "+s.label),
   button("Edit","note","button",()=>row("Edit")),button("Remove",null,"button",()=>row("Remove"))));
 }
 wrapper.append(button("Close",null,"button",()=>dialog.close()));dialog.oncancel=null;dialog.replaceChildren(wrapper);dialog.showModal();
}

function manageSlot(existing,remove=false){
 if(!state.scheduleAdmin||state.load!=="ready"||$("record-dialog").open)return;
 const dialog=$("record-dialog"),version=state.version;
 const title=el("h2","",remove?"Remove schedule time":existing?"Edit schedule time":"Add schedule time");title.id="record-title";
 const form=el("form"),list=el("div","schedule-items"),feedback=el("p","error");
 feedback.setAttribute("role","alert");
 const time=input("time","setup-time",hm(existing?.time)), name=input("text","setup-label",existing?.label||"");
 time.required=true;name.required=true;name.maxLength=120;
 const pairs=[];
 function addItem(item={}){
  if(pairs.length>=24)return;
  const row=el("div","card schedule-item"),n=input("text",""),a=input("text","");
  n.value=item.name||"";a.value=item.amount||"";n.required=true;a.required=true;n.maxLength=a.maxLength=120;
  n.setAttribute("aria-label","Medication name");a.setAttribute("aria-label","Amount exactly as prescribed");
  n.placeholder="Medication name";a.placeholder="Amount exactly as prescribed";
  const pair={n,a};pairs.push(pair);
  row.append(n,a,button("Remove item",null,"button",()=>{pairs.splice(pairs.indexOf(pair),1);row.remove();}));
  list.append(row);
 }
 form.append(title,el("p","muted",remove?"Stop this schedule time from tomorrow (Bangkok time). Past records stay unchanged.":existing?"Changes take effect tomorrow (Bangkok time). Past records stay unchanged.":"For medications only. Check the name and amount against the care instructions. To log a care observation, use the Notes tab instead."));
 if(!remove){
  form.append(el("div","fields",label("Bangkok time","clock",time),label("Schedule label","note",name)),list,button("Add medication", "plus","button",()=>addItem()));
  for(const item of existing?.items||[{}])addItem(item);
 }else form.append(el("p","",hm(existing.time)+" · "+existing.label));
 const save=el("button","button primary",remove?"Remove from schedule":"Save schedule time");save.type="submit";
 const cancel=button("Cancel",null,"button",()=>dialog.close());
 form.append(feedback,el("div","actions",cancel,save));dialog.replaceChildren(form);dialog.showModal();
 let busy=false;
 dialog.oncancel=e=>{if(busy)e.preventDefault();};
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(busy||state.load!=="ready"||!state.scheduleAdmin||version!==state.version)return;
  if(!remove&&!pairs.length){feedback.textContent="Add at least one medication.";return;}
  busy=true;save.disabled=true;cancel.disabled=true;
  try{
   const result=await api("manage",{method:"POST",data:{id:existing?.id,change:remove?"remove":existing?"edit":"add",time:time.value,label:name.value,items:pairs.map(({n,a})=>({name:n.value,amount:a.value}))}});
   if(version!==state.version)return;
   dialog.close();dialog.replaceChildren();say("Schedule change saved. Effective "+showDate(result.effectiveDate)+" (Bangkok).");void loadCare();
  }catch(ex){
   if(version!==state.version)return;
   if(ex.status===401){signout("Your session expired. Sign in again.");return;}
   feedback.textContent=ex.status===409?"That time already exists or was changed. Close this form, refresh, and review.":"The change was not confirmed. Close this form and refresh before trying again.";
  }finally{busy=false;if(dialog.open){cancel.disabled=false;}}
 });
}

async function confirmNow(slot,day){
 const stamp=now(), v=state.version, key=requestKey(slot.id,day);
 if(!state.member||state.load!=="ready"||!clockAnchor||$("record-dialog").open||
    day!==state.day||day!==stamp.day||!hm(slot.time)||stamp.time<hm(slot.time)||
    !state.slots.includes(slot)||!Array.isArray(slot.items)||!slot.items.length||
    recorded(slot.id,day)||state.uncertain.has(key)||state.confirming.has(key))return;
 state.confirming.add(key);say();render();
 try{
  const {entry}=await api("record",{method:"POST",data:{slotId:slot.id,scheduledDate:day,actualDate:stamp.day,actualTime:stamp.time}});
  if(v!==state.version)return;
  if(!entry?.id||String(entry.slotId)!==String(slot.id)||entry.scheduledDate!==day)throw new ApiError(502);
  state.rows=[entry,...state.rows.filter(x=>x.id!==entry.id)];
  say("Given record saved.");
  void loadCare({silent:true});
 }catch(e){
  if(v!==state.version)return;
  if(e.status===401){signout("Your session expired. Sign in again.");return;}
  if(e.status===409||e.status===0||e.status>=500){
   state.uncertain.add(key);
   say(e.status===409?"This dose already has a record. Check Records.":"Could not confirm the save. Check Records before trying again.",true);
   void loadCare({silent:true});
  }else say(e.status===403?"You don’t have permission to make this record.":"This record was not saved. Refresh and review the scheduled dose.",true);
 }finally{
  if(v===state.version){state.confirming.delete(key);render();}
 }
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
 const actualDate=input("date","actual-date",asPast?"":current.day);actualDate.max=current.day;actualDate.required=true;
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
   !!recorded(match.id,schedDate.value)||state.uncertain.has(requestKey(match.id,schedDate.value))||
   state.confirming.has(requestKey(match.id,schedDate.value));
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
 schedDate.addEventListener("change",()=>{checked.checked=false;err();void loadSlots();});
 slot.addEventListener("change",()=>{checked.checked=false;err();updatePreview();});
 dialog.oncancel=e=>{if(busy)e.preventDefault();};
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(busy||noRetry||v!==state.version)return;
  if(state.load!=="ready"){err("Wait for the Bangkok schedule to refresh before saving.");return;}
  const selected=choices.find(s=>String(s.id)===slot.value);
  const day=schedDate.value,atDay=actualDate.value,atTime=hm(actualTime.value),n=now();
  if(!selected||!day||!atDay||!atTime){err("Choose the dose and enter the actual date and time it was given.");return;}
  if(day>n.day||atDay>n.day||(atDay===n.day&&atTime>n.time)){err("Enter a date and time that have already passed.");return;}
  if(!checked.checked){err("Confirm that the medication was already given before saving.");return;}
  const key=requestKey(selected.id,day);
  if(recorded(selected.id,day)||state.uncertain.has(key)||state.confirming.has(key)){updatePreview();return;}
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
 const request={name:$("email").value.trim(),password:pwd.value};pwd.value="";
 try{
  const auth=await api("login",{method:"POST",data:request,token:null});
  request.password="";
  if(v!==state.version)return;
  if(typeof auth?.accessToken!=="string"||!auth.accessToken)throw new ApiError(502);
  const session=await api("session",{token:auth.accessToken});
  if(v!==state.version)return;
  if(!session.member?.id||!session.member?.name||!["papa","nurse"].includes(session.member.role))throw new ApiError(403);
  state.token=auth.accessToken;state.member=session.member;state.scheduleAdmin=session.scheduleAdmin===true&&session.member.role==="papa";state.route="today";
  $("email").value="";say();shell();void loadCare();
 }catch(ex){
  if(v!==state.version)return;
  err.textContent=ex.status===401?"Name or PIN wasn’t accepted.":ex.status===403?"This account does not have care-team access.":"Sign-in is unavailable. Try again or contact your care-team administrator.";
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
document.addEventListener("visibilitychange",()=>{
 if(state.member&&document.visibilityState==="visible")void loadCare();
});
window.addEventListener("pagehide",()=>{if(state.member)signout();});
window.addEventListener("pageshow",event=>{if(event.persisted&&state.member)signout();});
shell();
})();
