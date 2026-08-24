const CACHE="rithyna-meds-v3.0";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg","./message-enhancements.js?v=3.0","./medication-manager.js?v=3.0"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  const u=new URL(e.request.url);
  if(e.request.mode==="navigate"||u.pathname.endsWith("/index.html")||u.pathname==="/"){
    e.respondWith(fetch(e.request).then(async r=>{
      let html=await r.text();
      if(!html.includes("medication-manager.js")) html=html.replace("</body>",'<script src="./medication-manager.js?v=3.0"></script></body>');
      return new Response(html,{status:r.status,statusText:r.statusText,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"}});
    }).catch(async()=>{
      const r=await caches.match("./index.html");
      if(!r)return new Response("Offline",{status:503});
      let html=await r.text();
      if(!html.includes("medication-manager.js")) html=html.replace("</body>",'<script src="./medication-manager.js?v=3.0"></script></body>');
      return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8"}});
    }));return;
  }
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});