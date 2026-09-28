// Vercel serverless function: the contact form on the site posts here and the message goes on by email (via Resend).
// To switch it on: create a free account at resend.com with the inbox below, make an API key, add it in
// Vercel → Settings → Environment Variables as RESEND_API_KEY, then redeploy. Until then the site opens the
// visitor's mail app instead (main.js asks GET /api/contact whether direct sending is ready).
// Optional variables: CONTACT_TO (where messages go) and CONTACT_FROM (the sender; the default
// onboarding@resend.dev works without setting up a domain, as long as CONTACT_TO is the Resend account's email).
const TO = process.env.CONTACT_TO || 'd.silivanovych@gmail.com';
const FROM = process.env.CONTACT_FROM || 'Silivanovych Motion <onboarding@resend.dev>';
const ORIGINS = [/^https:\/\/(www\.)?silivanovych-motion\.com$/, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const LIMIT = { windowMs: 10 * 60 * 1000, max: 5 };   // per visitor IP and warm instance: a brake on floods, not a guarantee
const hits = new Map();

const clean = (v, max) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, max);
const oneLine = v => v.replace(/[\r\n]+/g, ' ');

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const ready = !!process.env.RESEND_API_KEY;
  if (req.method === 'GET') return res.status(200).json({ ready });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const origin = req.headers.origin;
  if (origin && !ORIGINS.some(r => r.test(origin))) return res.status(403).json({ error: 'forbidden' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid' });

  // Bots: a filled hidden field, or a form sent less than 3 s after the page opened. Answer "ok" so they move on.
  if (clean(body.website, 200) || !(Number(body.t) >= 3000)) return res.status(200).json({ ok: true });

  const name = oneLine(clean(body.name, 100)), email = oneLine(clean(body.email, 200));
  const project = oneLine(clean(body.project, 150)), message = clean(body.message, 5000);
  if (!name) return res.status(400).json({ error: 'invalid', field: 'name' });
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'invalid', field: 'email' });
  if (!message) return res.status(400).json({ error: 'invalid', field: 'message' });

  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < LIMIT.windowMs);
  if (recent.length >= LIMIT.max) return res.status(429).json({ error: 'too-many' });
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();

  if (!ready) return res.status(503).json({ error: 'not-configured' });

  const text = [
    `Name: ${name}`, `Email: ${email}`, ...(project ? [`Project: ${project}`] : []), '', message, '',
    '--', 'Sent from the contact form on silivanovych-motion.com. Reply to this email to answer directly.',
  ].join('\n');
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: email, subject: `New request: ${name}${project ? ' - ' + project : ''}`, text }),
    });
    if (!r.ok) {
      console.error('Resend refused the message', r.status, await r.text());
      return res.status(502).json({ error: 'send-failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Resend unreachable', e);
    return res.status(502).json({ error: 'send-failed' });
  }
}
