const crypto = require('crypto');

function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

function verifySession(token, secret) {
  if (!token || !secret) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

async function supabase(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server connection is not configured yet.');
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || '',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === 'string' ? data : (data?.message || data?.hint || `Supabase error ${res.status}`));
  return data;
}

exports.handler = async (event) => {
  const session = verifySession((event.headers.authorization || '').replace(/^Bearer\s+/i, ''), process.env.SESSION_SECRET);
  if (!session) return json(401, { error: 'Session expired. Please sign in again.' });

  try {
    if (event.httpMethod === 'GET') {
      const rows = await supabase('medication_entries?id=like.msg-%25&deleted=eq.false&order=entry_timestamp.desc&limit=1&select=id,note,entry_timestamp,nurse');
      const row = rows && rows[0];
      return json(200, { message: row ? { id: row.id, text: row.note || '', sent_at: row.entry_timestamp } : null });
    }

    if (event.httpMethod === 'POST') {
      if (session.name !== 'Papa' || session.role !== 'admin') return json(403, { error: 'Papa access required.' });
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request' }); }
      const text = String(body.message || '').trim();
      if (!text) return json(400, { error: 'Enter a message.' });
      if (text.length > 500) return json(400, { error: 'Message is too long.' });
      const now = new Date();
      const entryDate = now.toISOString().slice(0,10);
      const hh = String(now.getHours()).padStart(2,'0');
      const mm = String(now.getMinutes()).padStart(2,'0');
      const id = `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const row = {
        id,
        user_id: null,
        entry_timestamp: now.toISOString(),
        entry_date: entryDate,
        time: `${hh}:${mm}`,
        medications: [{ name: '__PAPA_MESSAGE__', dose: '' }],
        temp: null,
        temp_unit: '°C',
        note: text,
        nurse: 'Papa',
        updated_at: now.toISOString(),
        deleted: false
      };
      await supabase('medication_entries', { method: 'POST', body: JSON.stringify(row), prefer: 'return=minimal' });
      return json(200, { ok: true, message: { id, text, sent_at: row.entry_timestamp } });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message || 'Server error' });
  }
};