function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const token = '7d2b1f2c-73d0-4b85-bd48-9e23582413dd';
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  if ((event.queryStringParameters || {}).token !== token) return json(403, { error: 'Forbidden' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(500, { error: 'Supabase server connection is not configured.' });

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  // Repair only historical records from before nurse accounts began being used.
  // On 23 Aug 2026 and earlier, these records were originally entered under Papa.
  const filter = 'entry_date=lte.2026-08-23&nurse=in.(Noni,Pan,Fon,Fah,Liew)&select=id,entry_date,time,nurse';
  const res = await fetch(`${url}/rest/v1/medication_entries?${filter}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ nurse: 'Papa', updated_at: new Date().toISOString() })
  });
  const text = await res.text();
  let rows = [];
  try { rows = text ? JSON.parse(text) : []; } catch { return json(500, { error: text || 'Repair failed' }); }
  if (!res.ok) return json(res.status, { error: rows?.message || rows?.hint || 'Repair failed' });
  return json(200, { ok: true, repaired: Array.isArray(rows) ? rows.length : 0, records: rows });
};