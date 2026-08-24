(() => {
  const style=document.createElement('style');
  style.textContent=`
    .rithyna-tabs{display:flex;gap:8px;align-items:center;margin:0 0 14px;overflow:auto;padding:2px 0}
    .rithyna-tabs a{white-space:nowrap;text-decoration:none;border:1px solid #ffffff66;background:#ffffff18;color:#fff;border-radius:999px;padding:9px 14px;font-weight:900;box-shadow:0 4px 14px #003e4218}
    .rithyna-tabs a.active{background:#fff;color:#087477;border-color:#fff}
    .rithyna-tabs a:not(.active):active{transform:scale(.98)}
    @media(max-width:600px){.rithyna-tabs{margin-bottom:10px}.rithyna-tabs a{padding:8px 12px;font-size:13px}}
  `;
  document.head.appendChild(style);

  const app=document.querySelector('.app');
  if(!app||document.getElementById('rithynaTabs')) return;
  const top=app.querySelector('.top');
  const nav=document.createElement('nav');
  nav.id='rithynaTabs';
  nav.className='rithyna-tabs';
  nav.innerHTML='<a class="active" href="./index.html">Medication</a><a href="./blood-tests.html">Blood Tests</a>';
  if(top) top.insertAdjacentElement('afterend',nav); else app.insertBefore(nav,app.firstChild);

  // The blood-test summary previously added inside the medication page is now replaced by the dedicated tab.
  const old=document.getElementById('bloodTestPanel');
  if(old) old.remove();
  const obs=new MutationObserver(()=>{const x=document.getElementById('bloodTestPanel');if(x)x.remove()});
  obs.observe(app,{childList:true,subtree:true});
})();