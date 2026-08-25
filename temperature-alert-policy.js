(()=>{
  const THRESHOLD=37.4;
  const CLEAR_AFTER=12*60*60*1000;

  function entries(){
    try{
      const a=JSON.parse(localStorage.getItem('rithyna-medication-2026-v1')||'[]');
      return Array.isArray(a)?a:[];
    }catch{return[]}
  }

  function entryTime(e){
    if(Number.isFinite(Number(e?.ts))) return Number(e.ts);
    if(e?.date&&e?.time){
      const t=new Date(`${e.date}T${e.time}:00`).getTime();
      return Number.isFinite(t)?t:0;
    }
    return 0;
  }

  function shouldClearAlert(){
    const readings=entries()
      .map(e=>({temp:parseFloat(e.temp),ts:entryTime(e)}))
      .filter(x=>Number.isFinite(x.temp)&&x.ts>0)
      .sort((a,b)=>a.ts-b.ts);

    if(!readings.length) return false;
    const latest=readings[readings.length-1];
    if(latest.temp>=THRESHOLD) return false;

    let lastElevated=0;
    for(const r of readings){
      if(r.ts<=latest.ts&&r.temp>=THRESHOLD) lastElevated=Math.max(lastElevated,r.ts);
    }

    // If there has never been a 37.4+ reading, there is no fever-based reason
    // to keep the medicine interval alert visible.
    if(!lastElevated) return true;

    // Clear only after a full 12 hours have passed since the last 37.4+ reading,
    // provided the most recent temperature remains below 37.4.
    return Date.now()-lastElevated>=CLEAR_AFTER;
  }

  function applyPolicy(){
    const box=document.getElementById('painAlert');
    if(!box) return;
    if(shouldClearAlert()){
      box.className='alert';
      box.textContent='';
      box.style.display='none';
    }else{
      box.style.removeProperty('display');
    }
  }

  function setVersion(){
    const v=document.querySelector('.version');
    if(v) v.textContent='v4.1';
  }

  setVersion();
  setTimeout(applyPolicy,500);
  setInterval(applyPolicy,10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)applyPolicy()});
  window.addEventListener('storage',applyPolicy);
})();