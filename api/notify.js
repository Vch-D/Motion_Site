// Vercel serverless function: emails the owner when a creator sends a test, a preview or a final render for review.
// Uses the variables that are already set: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and RESEND_API_KEY
// (optional: NOTIFY_TO or CONTACT_TO for the inbox, CONTACT_FROM for the sender, SITE_URL for the link in the email).
import { createClient } from '@supabase/supabase-js';

const TO = process.env.NOTIFY_TO || process.env.CONTACT_TO || 'd.silivanovych@gmail.com';
const FROM = process.env.CONTACT_FROM || 'Silivanovych Motion <onboarding@resend.dev>';
const SITE = (process.env.SITE_URL || 'https://silivanovych-motion.com').replace(/\/+$/, '');
const KIND = { test: 'Test', preview: 'Preview', final: 'Final render' };
const WHAT = { test: 'a test', preview: 'a preview', final: 'the final render' };
const size = b => (!b ? '' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const length = s => { s = Math.round(+s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const url = process.env.SUPABASE_URL, secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return res.status(500).json({ error: 'Server is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.' });

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: userData } = token ? await admin.auth.getUser(token) : { data: null };
  const caller = userData && userData.user;
  if (!caller) return res.status(401).json({ error: 'Not signed in' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  const id = body && typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Bad id' });

  const { data: d } = await admin.from('deliveries').select('*').eq('id', id).maybeSingle();
  if (!d || d.created_by !== caller.id) return res.status(404).json({ error: 'Not found' });   // only the sender can trigger it
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, emailed: false, reason: 'no-email-key' });
  if (d.notified_at || Date.now() - new Date(d.created_at).getTime() > 30 * 60e3) return res.status(200).json({ ok: true, emailed: false });

  // claim it first: even two calls at the same moment send one email
  const { data: claimed } = await admin.from('deliveries').update({ notified_at: new Date().toISOString() }).eq('id', id).is('notified_at', null).select('id');
  if (!claimed || !claimed.length) return res.status(200).json({ ok: true, emailed: false });

  const [{ data: project }, { data: sender }] = await Promise.all([
    admin.from('projects').select('title').eq('id', d.project_id).maybeSingle(),
    admin.from('profiles').select('name').eq('id', caller.id).maybeSingle(),
  ]);
  const who = (sender && sender.name) || caller.email || 'A creator';
  const title = (project && project.title) || 'a project';
  const kind = KIND[d.kind] || 'Version';
  const facts = [d.width && d.height ? `${d.width}x${d.height}` : '', d.duration ? length(d.duration) : '', size(d.size)].filter(Boolean).join(', ');
  const text = [
    `${who} sent ${WHAT[d.kind] || 'a new version'} for review.`, '',
    `Project: ${title}`,
    `Version: v${d.version} (${kind})`,
    ...(d.name ? [`File: ${d.name}${facts ? ` (${facts})` : ''}`] : []),
    ...(d.link ? [`Link: ${d.link}`] : []),
    ...(d.note ? ['', 'Note:', d.note] : []), '',
    `Watch and review: ${SITE}/#manager/review/${d.id}`,
    '', '--', `Reply to this email to write to ${who} directly.`,
  ].join('\n');
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], ...(caller.email ? { reply_to: caller.email } : {}), subject: `${kind} v${d.version}: ${title}`, text }),
    });
    if (!r.ok) { console.error('Resend refused the notification', r.status, await r.text()); return res.status(200).json({ ok: true, emailed: false }); }
    return res.status(200).json({ ok: true, emailed: true });
  } catch (e) {
    console.error('Resend unreachable', e);
    return res.status(200).json({ ok: true, emailed: false });
  }
}
