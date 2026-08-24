(() => {
  const presets=[
    'Please check Thyna Temperature',
    'Thyna medication',
    'Alert test!'
  ];
  const style=document.createElement('style');
  style.textContent=`.quick-msg-wrap{display:none;margin-top:11px}.messageComposer.papa .quick-msg-wrap{display:block}.quick-msg-label{font-size:11px;font-weight:900;text-transform:uppercase;color:#627d79;margin-bottom:7px}.quick-msg-list{display:flex;flex-wrap:wrap;gap:7px}.quick-msg-btn{border:1px solid #b8ddd6;border-radius:999px;background:#effaf7;color:#08745f;padding:9px 13px;font-weight:850;font-size:13px}.quick-msg-btn:active{transform:scale(.98);background:#dff4ef}@media(max-width:600px){.quick-msg-list{display:grid;grid-template-columns:1fr}.quick-msg-btn{text-align:left;border-radius:12px}}`;
  document.head.appendChild(style);
  function install(){
    const composer=document.getElementById('messageComposer'), form=composer?.querySelector('.messageForm');
    if(!composer||!form||document.getElementById('quickMessages'))return;
    const wrap=document.createElement('div');wrap.id='quickMessages';wrap.className='quick-msg-wrap';
    wrap.innerHTML='<div class="quick-msg-label">Quick messages · tap to send</div><div class="quick-msg-list"></div>';
    const list=wrap.querySelector('.quick-msg-list');
    presets.forEach(text=>{const b=document.createElement('button');b.type='button';b.className='quick-msg-btn';b.textContent=text;b.onclick=()=>sendPreset(text,b);list.appendChild(b)});
    form.insertAdjacentElement('beforebegin',wrap);
  }
  async function sendPreset(text,button){
    const input=document.getElementById('messageText'),send=document.getElementById('sendMessage');
    if(!input||!send)return;
    input.value=text;
    button.disabled=true;
    const old=button.textContent;button.textContent='Sending…';
    try{send.click();setTimeout(()=>{button.disabled=false;button.textContent=old},1200)}catch{button.disabled=false;button.textContent=old}
  }
  install();
  setTimeout(install,500);
})();