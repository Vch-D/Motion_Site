// Vercel serverless function: the owner creates / removes creator accounts.
// Needs two environment variables in Vercel: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (secret, server-only).
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const url = process.env.SUPABASE_URL, secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return res.status(500).json({ error: 'Server is not configured: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables.' });

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { data: userData } = await admin.auth.getUser(token);
  const caller = userData && userData.user;
  if (!caller) return res.status(401).json({ error: 'Not signed in' });
  const { data: prof } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (!prof || prof.role !== 'owner') return res.status(403).json({ error: 'Only the owner can manage accounts' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (body.action === 'create') {
    const { email, password, name, title } = body;
    if (!email || !password || String(password).length < 6) return res.status(400).json({ error: 'Email and a password of at least 6 characters are required' });
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: name || '', title: title || '', role: 'creator' } });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ id: data.user.id });
  }
  if (body.action === 'delete') {
    if (!body.id || body.id === caller.id) return res.status(400).json({ error: 'Bad id' });
    const { error } = await admin.auth.admin.deleteUser(body.id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: 'Unknown action' });
}
