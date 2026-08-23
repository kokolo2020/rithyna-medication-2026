const crypto = require('crypto');

function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}
function b64url(input) { return Buffer.from(input).toString('base64url'); }
function signSession(payload, secret) {
  const encoded = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const nursePin = process.env.NURSE_PIN;
  const papaPin = process.env.PAPA_PIN;
  const secret = process.env.SESSION_SECRET;
  if (!nursePin || !papaPin || !secret) return json(500, { error: 'Server authentication is not configured yet.' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request' }); }
  const name = String(body.name || '').trim();
  const pin = String(body.pin || '');
  const nurses = ['Noni', 'Pan', 'Fon', 'Fah', 'Liew'];
  const valid = name === 'Papa' ? pin === papaPin : nurses.includes(name) && pin === nursePin;
  if (!valid) return json(401, { error: 'Incorrect name or PIN.' });
  const payload = { name, role: name === 'Papa' ? 'admin' : 'nurse', exp: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  return json(200, { token: signSession(payload, secret), user: { name: payload.name, role: payload.role } });
};