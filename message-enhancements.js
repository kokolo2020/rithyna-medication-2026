(() => {
  const STYLE_ID = 'message-enhancements-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .broadcast{
        display:none!important;position:fixed!important;z-index:10000!important;
        left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;
        width:min(920px,calc(100% - 28px))!important;min-height:180px!important;
        align-items:center!important;justify-content:center!important;
        background:#07110e!important;color:#49ff92!important;border:3px solid #35d978!important;
        border-radius:28px!important;padding:38px 34px!important;
        box-shadow:0 30px 100px rgba(0,0,0,.72),0 0 55px rgba(73,255,146,.28)!important;
        font-weight:950!important;font-size:clamp(28px,6vw,54px)!important;line-height:1.18!important;
        text-align:center!important;letter-spacing:.01em!important;
      }
      .broadcast.show{display:flex!important}
      .broadcast.flash{animation:papaSlowFlash 1.666s ease-in-out 3!important}
      @keyframes papaSlowFlash{
        0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1);box-shadow:0 30px 100px rgba(0,0,0,.72),0 0 55px rgba(73,255,146,.32)}
        50%{opacity:.18;transform:translate(-50%,-50%) scale(.985);box-shadow:0 30px 100px rgba(0,0,0,.72),0 0 100px rgba(73,255,146,.72)}
      }
      .message-log-btn{display:none;position:fixed;right:16px;bottom:16px;z-index:7000;border:0;border-radius:999px;background:#0b6654;color:white;padding:12px 17px;font-weight:900;box-shadow:0 12px 30px rgba(0,0,0,.22)}
      .message-log-btn.visible{display:block}
      .message-log-backdrop{display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);padding:18px;align-items:center;justify-content:center}
      .message-log-backdrop.open{display:flex}
      .message-log-panel{width:min(760px,100%);max-height:82vh;overflow:hidden;background:#f8fffc;border-radius:24px;box-shadow:0 30px 90px rgba(0,0,0,.55);display:flex;flex-direction:column}
      .message-log-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:#0b2b24;color:#fff}
      .message-log-head strong{font-size:20px}.message-log-close{border:0;background:#ffffff1f;color:#fff;border-radius:999px;padding:8px 12px;font-weight:900}
      .message-log-list{padding:14px;overflow:auto}.message-log-item{background:#0c1714;color:#48f892;border-left:5px solid #2ddf77;border-radius:14px;padding:14px 16px;margin-bottom:10px}
      .message-log-text{font-size:17px;font-weight:800;white-space:pre-wrap}.message-log-time{font-size:12px;color:#a8c9bb;margin-top:7px}.message-log-empty{padding:36px;text-align:center;color:#6e8480}
      @media(max-width:600px){.broadcast{min-height:210px!important;padding:32px 20px!important;font-size:clamp(30px,9vw,48px)!important}.message-log-btn{right:10px;bottom:10px}}
    `;
    document.head.appendChild(style);
  }

  window.showBroadcast = function(m) {
    if (!m?.text) return;
    if (window.msgTimer) clearTimeout(window.msgTimer);
    const b = document.getElementById('broadcast');
    if (!b) return;
    b.textContent = 'Papa: ' + m.text;
    b.className = 'broadcast show flash';
    navigator.vibrate?.([250,120,250,120,350]);
    setTimeout(() => { b.className = 'broadcast show'; }, 5000);
    window.msgTimer = setTimeout(() => { b.className = 'broadcast'; }, 8000);
  };

  function isSignedIn() {
    const gate = document.getElementById('gate');
    return !!gate && gate.classList.contains('hide');
  }

  function ensureMessageLogUI() {
    if (document.getElementById('messageLogBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'messageLogBtn';
    btn.className = 'message-log-btn';
    btn.textContent = 'Messages';
    btn.onclick = openMessageLog;
    document.body.appendChild(btn);

    const backdrop = document.createElement('div');
    backdrop.id = 'messageLogBackdrop';
    backdrop.className = 'message-log-backdrop';
    backdrop.innerHTML = `<div class="message-log-panel"><div class="message-log-head"><strong>Papa Messages</strong><button class="message-log-close" id="messageLogClose">Close</button></div><div class="message-log-list" id="messageLogList"><div class="message-log-empty">Loading messages…</div></div></div>`;
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeMessageLog(); });
    document.body.appendChild(backdrop);
    document.getElementById('messageLogClose').onclick = closeMessageLog;
    updateMessageButton();
  }

  function updateMessageButton() {
    const btn = document.getElementById('messageLogBtn');
    if (!btn) return;
    btn.classList.toggle('visible', isSignedIn());
  }

  function closeMessageLog() {
    document.getElementById('messageLogBackdrop')?.classList.remove('open');
  }

  async function openMessageLog() {
    ensureMessageLogUI();
    if (!isSignedIn()) return;
    const bd = document.getElementById('messageLogBackdrop');
    const list = document.getElementById('messageLogList');
    bd.classList.add('open');
    list.innerHTML = '<div class="message-log-empty">Loading messages…</div>';
    try {
      if (typeof request !== 'function') throw new Error('Unable to load messages.');
      const j = await request('care-message?all=1');
      const messages = j.messages || [];
      if (!messages.length) {
        list.innerHTML = '<div class="message-log-empty">No messages yet.</div>';
        return;
      }
      list.innerHTML = messages.map(m => {
        const d = m.sent_at ? new Date(m.sent_at) : null;
        const when = d && !Number.isNaN(d.getTime()) ? d.toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
        return `<div class="message-log-item"><div class="message-log-text"></div><div class="message-log-time">${when}</div></div>`;
      }).join('');
      [...list.querySelectorAll('.message-log-text')].forEach((el, i) => { el.textContent = messages[i].text || ''; });
    } catch (e) {
      list.innerHTML = `<div class="message-log-empty">${String(e.message || 'Unable to load messages')}</div>`;
    }
  }

  ensureMessageLogUI();
  const gate = document.getElementById('gate');
  if (gate) new MutationObserver(updateMessageButton).observe(gate, {attributes:true, attributeFilter:['class']});
  setInterval(updateMessageButton, 1000);
})();