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
  const secret = process.env.SESSION_SECRET;
  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = verifySession(token, secret);
  if (!session) return json(401, { error: 'Session expired. Please sign in again.' });

  try {
    if (event.httpMethod === 'GET') {
      const rows = await supabase('medication_entries?deleted=eq.false&order=entry_timestamp.desc&select=*');
      return json(200, { rows: rows || [] });
    }

    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request' }); }
      const e = body.entry || {};
      if (!e.id || !e.entry_date || !e.time) return json(400, { error: 'Missing entry details.' });
      if (session.role !== 'admin') e.nurse = session.name;
      const row = {
        id: e.id,
        user_id: e.user_id || null,
        entry_timestamp: e.entry_timestamp,
        entry_date: e.entry_date,
        time: e.time,
        medications: Array.isArray(e.medications) ? e.medications : [],
        temp: e.temp === '' || e.temp == null ? null : Number(e.temp),
        temp_unit: '°C',
        note: e.note || '',
        nurse: e.nurse || session.name,
        updated_at: new Date().toISOString(),
        deleted: false
      };
      await supabase('medication_entries?on_conflict=id', { method: 'POST', body: JSON.stringify(row), prefer: 'resolution=merge-duplicates,return=minimal' });
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request' }); }
      const id = String(body.id || '');
      if (!id) return json(400, { error: 'Missing id.' });
      const found = await supabase(`medication_entries?id=eq.${encodeURIComponent(id)}&select=id,nurse`);
      const row = found && found[0];
      if (!row) return json(404, { error: 'Record not found.' });
      if (session.role !== 'admin' && row.nurse !== session.name) return json(403, { error: 'You can only delete your own records.' });
      await supabase(`medication_entries?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message || 'Server error' });
  }
};