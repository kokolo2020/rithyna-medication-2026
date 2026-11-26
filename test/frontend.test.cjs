const vm=require("node:vm"),assert=require("node:assert/strict"),fs=require("node:fs");
const source=fs.readFileSync(require("node:path").join(__dirname,"../assets/care.js"),"utf8");
class Node {
 constructor(tag,t=""){this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.listeners={};this.value="";this._t=t;this.hidden=false;this.disabled=false;this.open=false;this.classList={toggle:()=>{}};}
 append(...a){this.children.push(...a);}
 prepend(...a){this.children.unshift(...a);}
 get textContent(){return this._t+this.children.map(x=>x.textContent).join("");}
 set textContent(t){this._t=t;this.children=[];}
 get childElementCount(){return this.children.length;}
 replaceChildren(...a){this._t="";this.children=[...a];}
 setAttribute(k,v){this.attrs[k]=v;}
 removeAttribute(k){delete this.attrs[k];}
 addEventListener(k,fn){this.listeners[k]=fn;}
 emit(k){return this.listeners[k]?.({preventDefault(){}});}
 showModal(){this.open=true;}
 close(){this.open=false;}
 focus(){}
}
const list=["app-shell","sidebar","toggle-nav","session-nav","mobile-nav","workspace","signin","notice","record-dialog","login-form","email","password","login-error","login-submit"];
const walk=(node,fn)=>fn(node)?node:node?.children.map(x=>walk(x,fn)).find(Boolean);
const findText=(node,t,tag="button")=>walk(node,n=>n?.tagName===tag&&n.textContent.includes(t));
const tick=()=>new Promise(r=>setImmediate(r));
async function run(role,quick=""){
 const root=Object.fromEntries(list.map(id=>[id,new Node("div")]));
 const routes=["today","records","notes"].map(route=>{const n=new Node("button");n.dataset.route=route;return n;});
 const listeners={};
 const doc={visibilityState:"visible",addEventListener:(name,fn)=>{listeners[name]=fn;},getElementById:id=>root[id],createElement:t=>new Node(t),createTextNode:t=>new Node("#text",t),createElementNS:(_,t)=>new Node(t),querySelector:()=>null,querySelectorAll:()=>routes};
 const member={id:"self",name:role==="papa"?"Demo Parent":"Demo Nurse",role};
 const slot={id:"slot-a",time:quick==="future"?"20:00:00":"06:00:00",label:"Morning care",items:[{name:"Fictional A",amount:"2 sample units"}]};
 let history=[],calls=[],recordRequests=[],simulateConflict=false, simulateNetwork=false;
 let notes=[];
 let server="2042-08-06T05:01:00Z",serverDay="2042-08-06";
 class TestDate extends Date { constructor(...a){super(...(a.length?a:["2042-08-05T15:01:00Z"]));} }
 doc.querySelectorAll=selector=>selector==="button[data-confirm-time]"?
  [findText(root.workspace,"Confirm given now")].filter(Boolean):routes;
 const ctx={document:doc,window:{scrollTo(){},addEventListener(){}},URLSearchParams,Intl,Date:TestDate,Set,crypto:{randomUUID:()=>"12345678-abcd-49ab-9abc-123456789012"},performance:{now:()=>0},setInterval(){},fetch:async(url,opts)=>{
  const q=new URL(url,"https://local.invalid").searchParams, a=q.get("action");calls.push({a,day:q.get("date"),headers:opts.headers});
  const res=(out,status=200)=>({ok:status>=200&&status<300,status,json:async()=>out});
  if(a==="login"){const body=JSON.parse(opts.body);assert.equal(body.password,"synthetic-password");assert.equal(opts.headers.Authorization,undefined);return res({accessToken:"synthetic-token"});}
  assert.equal(opts.headers.Authorization,"Bearer synthetic-token");
  if(a==="session")return res({member,scheduleAdmin:role==="papa"});
  if(a==="notes"){assert.equal(role,"papa");return res({notes});}
  if(a==="add-note"){assert.equal(role,"papa");const saved={...JSON.parse(opts.body),createdAt:"2042-08-06T18:02:00Z",occurredAt:JSON.parse(opts.body).date==="2042-08-06"&&JSON.parse(opts.body).time==="12:02"?"2042-08-06T05:02:00Z":undefined};notes=[saved];return res({note:saved},201);}
  if(a==="schedule")return res({date:q.get("date")||serverDay,serverNowMs:Date.parse(server),slots:q.get("date")==="2042-08-05"?[{...slot,id:"historic-a",label:"Historical scheduled item"}]:quick==="remaining"?[slot,{...slot,id:"slot-b",time:"14:00",label:"Later care",items:[{name:"Fictional B",amount:"1 sample unit"}]}]:[slot]});
  if(a==="history")return res({entries:history});
  if(a==="members"){assert.equal(role,"papa");return res({members:[member,{id:"nurse-other",name:"Another Nurse",role:"nurse"}]});}
  if(a==="record"){
   const b=JSON.parse(opts.body);recordRequests.push(b);
   if(simulateConflict)return res({error:"duplicate",code:"duplicate"},409);
   if(simulateNetwork)throw Error("interrupted");
   const entry={id:"given-"+b.slotId, ...b, items:slot.items, givenBy:b.givenById?"Another Nurse":member.name,loggedBy:member.name,slotLabel:"Morning care"};
   history=[entry,...history];return res({entry},201);
  }
  throw Error("unexpected action");
 }};
 vm.runInNewContext(source,ctx);
 assert.equal(root["workspace"].hidden,true);
 root.email.value="fictional@example.invalid";root.password.value="synthetic-password";
 await root["login-form"].emit("submit");await tick();
 assert.equal(root.password.value,"");
 assert.equal(root["workspace"].hidden,false);
 assert.match(root["workspace"].textContent,/Fictional A/);
 assert.equal(calls.find(x=>x.a==="schedule").day,null);
 assert.match(root["workspace"].textContent,/6 Aug 2042/);
 assert.match(root["workspace"].textContent,quick==="remaining"?/0 of 2 scheduled slots recorded/:/0 of 1 scheduled slots recorded/);
 const dialog=root["record-dialog"];
 function field(id){const e=walk(dialog,n=>n.id===id);assert(e,id);return e;}
 function form(){return walk(dialog,n=>n.tagName==="form");}
 if(quick){
  const confirm=findText(root.workspace,"Confirm given now");
  assert(confirm);
  simulateConflict=quick==="duplicate";simulateNetwork=quick==="network";
  assert.equal(confirm.disabled,quick==="future");
  confirm.emit("click");
  confirm.emit("click"); // Even a stale DOM event cannot issue a second write.
  await tick();
  assert.equal(dialog.open,false);
  assert.equal(recordRequests.length,quick==="future"?0:1);
  if(quick==="future"){
   findText(root.workspace,"Log details").emit("click");
   assert.equal(dialog.open,true);
   assert.equal(recordRequests.length,0);
  }else{
   assert.deepEqual(recordRequests[0],{slotId:"slot-a",scheduledDate:"2042-08-06",actualDate:"2042-08-06",actualTime:"12:01"});
   if(quick==="success"||quick==="remaining"){
    assert.doesNotMatch(root.workspace.textContent,/Fictional A/);
    if(quick==="remaining"){
     assert.match(root.workspace.textContent,/Fictional B/);
     assert.match(root.workspace.textContent,/1 of 2 scheduled slots recorded/);
    }else assert.match(root.workspace.textContent,/No doses left to record today/);
    assert.match(root.notice.textContent,/Given record saved/);
    if(role==="papa"){
     findText(root.workspace,"Manage schedule").emit("click");
     assert.match(dialog.textContent,/Morning care/);dialog.close();
    }else assert.equal(findText(root.workspace,"Manage schedule"),undefined);
    findText(root.workspace,"View records").emit("click");
    assert.match(root.workspace.textContent,/Fictional A/);
    assert(root.workspace.textContent.includes("Given by "+member.name+" · Logged by "+member.name));
   }else{
    assert.match(root.workspace.textContent,/Check status/);
    assert.equal(findText(root.workspace,"Confirm given now"),undefined);
    assert.equal(findText(root.workspace,"Log details"),undefined);
    assert.doesNotMatch(root.notice.textContent,/Given record saved/);
   }
  }
  return;
 }
 findText(root["workspace"],"Log details").emit("click");
 field("actual-time").value="08:02";
 await form().emit("submit");assert.equal(recordRequests.length,0);assert.match(dialog.textContent,/already given before saving/);
 field("given-confirmed").checked=true;
 if(role==="papa")field("given-by").value="nurse-other";
 await form().emit("submit");await tick();
 assert.equal(recordRequests.length,1);
 assert.equal(recordRequests[0].actualDate,"2042-08-06");
 assert.equal(recordRequests[0].givenById,role==="papa"?"nurse-other":undefined);
 assert.equal(findText(root["workspace"],"Confirm given"),undefined);
 assert.doesNotMatch(root["workspace"].textContent,/Fictional A/);
 assert.match(root["workspace"].textContent,/No doses left to record today/);
 assert.match(root["workspace"].textContent,/All scheduled slots recorded/);
 assert.match(root["workspace"].textContent,/1 of 1 scheduled slots recorded/);
 findText(root["workspace"],"View records").emit("click");
 assert.match(root["workspace"].textContent,role==="papa"?/Given by Another Nurse · Logged by Demo Parent/:/Given by Demo Nurse · Logged by Demo Nurse/);
 findText(root["workspace"],"Log past dose").emit("click");await tick();
 assert.equal(field("actual-date").value,"");
 field("actual-date").value="2042-08-06";
 field("scheduled-date").value="2042-08-05";field("scheduled-date").emit("change");await tick();
 assert.equal(field("actual-date").value,"2042-08-06");
 assert.equal(calls.filter(x=>x.a==="schedule").at(-1).day,"2042-08-05");
 field("scheduled-slot").value="historic-a";field("scheduled-slot").emit("change");
 field("actual-date").value="2042-08-06";field("actual-time").value="01:02";field("given-confirmed").checked=true;
 simulateConflict=true;await form().emit("submit");await tick();
 assert.equal(recordRequests.length,2);
 assert.equal(recordRequests[1].scheduledDate,"2042-08-05");assert.equal(recordRequests[1].actualDate,"2042-08-06");
 assert.match(dialog.textContent,/already exists/);await form().emit("submit");assert.equal(recordRequests.length,2);
 dialog.close();simulateConflict=false;
 findText(root["workspace"],"Log past dose").emit("click");await tick();
 field("scheduled-date").value="2042-08-05";field("scheduled-date").emit("change");await tick();
 field("scheduled-slot").value="historic-a";field("scheduled-slot").emit("change");
 assert.equal(findText(dialog,"Save given record").disabled,true);
 await form().emit("submit");assert.equal(recordRequests.length,2);
 const scheduledReads=()=>calls.filter(x=>x.a==="schedule"&&x.day===null).length;
 const before=scheduledReads();
 doc.visibilityState="hidden";listeners.visibilitychange();
 assert.equal(scheduledReads(),before);
 // Simulate sleep through Bangkok midnight: the browser monotonic clock remains at 0.
 server="2042-08-06T17:05:00Z";serverDay="2042-08-07";
 doc.visibilityState="visible";listeners.visibilitychange();await tick();
 assert.equal(scheduledReads(),before+1);
 routes[0].emit("click");
 assert.match(root["workspace"].textContent,/7 Aug 2042/);
 assert.equal(dialog.open,true);
 assert.equal(field("scheduled-date").value,"2042-08-05");
 dialog.close();
 if(role==="papa"){
   routes[2].emit("click");await tick();
   assert.match(root.workspace.textContent,/Care Notes/);
   const box=walk(root.workspace,n=>n.id==="care-note");box.value="Synthetic care note";box.emit("input");
   const eventDate=walk(root.workspace,n=>n.id==="note-date"),eventTime=walk(root.workspace,n=>n.id==="note-time");
   assert.equal(eventDate.value,"2042-08-07");
   eventDate.value="2042-08-06";eventTime.value="12:02";
   eventDate.emit("change");eventTime.emit("change");
   await walk(root.workspace,n=>n.tagName==="form").emit("submit");await tick();
   assert.match(root.workspace.textContent,/Synthetic care note/);
   assert.match(root.workspace.textContent,/Happened.*12:02/);
 } else {
   routes[2].emit("click");assert(!calls.some(x=>x.a==="notes"));
 }
 findText(root["session-nav"],"","button").emit("click");
 assert.equal(root["workspace"].hidden,true);
 assert.equal(root["workspace"].textContent,"");
 assert.equal(root["record-dialog"].open,false);
 assert.equal(root["record-dialog"].textContent,"");
 if(role==="nurse")assert(!calls.some(x=>x.a==="members"));
}
(async()=>{
 await run("papa");await run("nurse");
 for(const role of ["papa","nurse"])await run(role,"success");
 for(const quick of ["duplicate","network","future","remaining"])await run("papa",quick);
 console.log("Synthetic UI passed: one-tap Bangkok recording, double tap, duplicate, uncertain save, future slot, and existing manual logging and notes.");
})().catch(e=>{console.error(e);process.exitCode=1;});
