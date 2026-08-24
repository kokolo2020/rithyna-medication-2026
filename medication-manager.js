(() => {
  const style=document.createElement('style');
  style.textContent=`
  .med-manager-btn{display:none;width:100%;margin-top:8px;border:1px dashed #0aa5a3;border-radius:12px;background:#effaf8;color:#087477;padding:10px;font-weight:900}.med-manager-btn.show{display:block}
  .med-manager-backdrop{display:none;position:fixed;inset:0;z-index:9500;background:#0009;padding:18px;align-items:center;justify-content:center}.med-manager-backdrop.open{display:flex}
  .med-manager{width:min(620px,100%);max-height:84vh;background:#fff;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 90px #0008}.med-manager-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;background:#0b2b24;color:#fff}.med-manager-head button{border:0;border-radius:999px;background:#ffffff20;color:#fff;padding:8px 12px;font-weight:900}.med-manager-body{padding:16px;overflow:auto}.med-add-grid{display:grid;grid-template-columns:1.2fr 1fr auto;gap:8px}.med-add-grid input{margin:0}.med-add-grid button{border:0;border-radius:12px;background:#0aa5a3;color:#fff;padding:0 16px;font-weight:900}.med-custom-list{margin-top:16px}.med-custom-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid #e1ecea;border-radius:12px;margin-bottom:8px}.med-custom-name{font-weight:900}.med-custom-dose{font-size:12px;color:#71888c;margin-top:2px}.med-custom-delete{border:0;border-radius:999px;background:#ffe4e4;color:#9b2020;padding:7px 11px;font-weight:850}.med-empty{padding:25px;text-align:center;color:#71888c}
  @media(max-width:600px){.med-add-grid{grid-template-columns:1fr}.med-add-grid button{padding:12px}}
  `;document.head.appendChild(style);

  function currentName(){try{return JSON.parse(localStorage.getItem('rithyna-secure-session-v23')||'null')?.name||''}catch{return''}}
  function papa(){return currentName()==='Papa'}
  function signed(){return document.getElementById('gate')?.classList.contains('hide')}
  let customItems=[];

  function syncCatalogArray(){
    try{
      customItems.forEach(x=>{if(!catalog.some(m=>m[0].toLowerCase()===x.name.toLowerCase()))catalog.push([x.name,x.dose||''])});
      document.querySelectorAll('.medrow select').forEach(sel=>{
        const selected=sel.value;
        const known=[...sel.options].map(o=>o.textContent.toLowerCase());
        catalog.forEach((m,i)=>{if(!known.includes(m[0].toLowerCase()))sel.add(new Option(m[0],i))});
        if(selected!=='')sel.value=selected;
      });
    }catch{}
  }

  async function loadCatalog(){
    if(!signed())return;
    try{const j=await request('medication-catalog');customItems=j.items||[];syncCatalogArray();renderList()}catch{}
  }

  function ensureUI(){
    const addBtn=document.getElementById('add');
    if(addBtn&&!document.getElementById('manageMedicationBtn')){
      const b=document.createElement('button');b.type='button';b.id='manageMedicationBtn';b.className='med-manager-btn';b.textContent='⚙ Manage medication list';b.onclick=openManager;addBtn.insertAdjacentElement('afterend',b);
    }
    if(!document.getElementById('medManagerBackdrop')){
      const bd=document.createElement('div');bd.id='medManagerBackdrop';bd.className='med-manager-backdrop';bd.innerHTML=`<div class="med-manager"><div class="med-manager-head"><strong>Medication List</strong><button id="medManagerClose">Close</button></div><div class="med-manager-body"><div class="med-add-grid"><input id="newMedName" placeholder="Medication name"><input id="newMedDose" placeholder="Default dose"><button id="newMedAdd">Add</button></div><div id="medCustomList" class="med-custom-list"></div></div></div>`;bd.onclick=e=>{if(e.target===bd)closeManager()};document.body.appendChild(bd);document.getElementById('medManagerClose').onclick=closeManager;document.getElementById('newMedAdd').onclick=addMedication;
    }
    updateVisibility();
  }

  function updateVisibility(){const b=document.getElementById('manageMedicationBtn');if(b)b.classList.toggle('show',signed()&&papa())}
  function openManager(){if(!papa())return;document.getElementById('medManagerBackdrop')?.classList.add('open');loadCatalog()}
  function closeManager(){document.getElementById('medManagerBackdrop')?.classList.remove('open')}
  function renderList(){const box=document.getElementById('medCustomList');if(!box)return;if(!customItems.length){box.innerHTML='<div class="med-empty">No custom medications yet.</div>';return}box.innerHTML=customItems.map((x,i)=>`<div class="med-custom-row"><div><div class="med-custom-name"></div><div class="med-custom-dose"></div></div><button class="med-custom-delete" data-i="${i}">Delete</button></div>`).join('');box.querySelectorAll('.med-custom-name').forEach((e,i)=>e.textContent=customItems[i].name);box.querySelectorAll('.med-custom-dose').forEach((e,i)=>e.textContent=customItems[i].dose||'No default dose');box.querySelectorAll('.med-custom-delete').forEach(b=>b.onclick=()=>deleteMedication(customItems[+b.dataset.i]))}
  async function addMedication(){if(!papa())return;const n=document.getElementById('newMedName'),d=document.getElementById('newMedDose'),name=n.value.trim(),dose=d.value.trim();if(!name)return alert('Enter medication name.');const btn=document.getElementById('newMedAdd');btn.disabled=true;btn.textContent='Adding…';try{await request('medication-catalog',{method:'POST',body:JSON.stringify({name,dose})});n.value='';d.value='';await loadCatalog()}catch(e){alert(e.message)}finally{btn.disabled=false;btn.textContent='Add'}}
  async function deleteMedication(item){if(!papa()||!item?.id)return;if(!confirm(`Remove ${item.name} from the custom medication list?`))return;try{await request('medication-catalog',{method:'DELETE',body:JSON.stringify({id:item.id})});customItems=customItems.filter(x=>x.id!==item.id);renderList()}catch(e){alert(e.message)}}

  ensureUI();
  const gate=document.getElementById('gate');if(gate)new MutationObserver(()=>{updateVisibility();if(signed())loadCatalog()}).observe(gate,{attributes:true,attributeFilter:['class']});
  setInterval(updateVisibility,1000);
  if(signed())loadCatalog();
})();