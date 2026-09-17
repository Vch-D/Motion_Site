/* =========================================================================
   Project Manager: a private workspace for the owner and the creators who work with them.

   Two data modes, same interface (`store`):
   - REMOTE (default when pm-config.js has a Supabase URL + key): accounts, projects, files and
     chat live in Supabase; row-level security (supabase/schema.sql) decides who sees what;
     the chat and project changes update live.
   - LOCAL demo (no config, or localStorage 'pm.demo' = 1): everything stays in this browser
     (localStorage + IndexedDB) with demo accounts.
   ========================================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const shortDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' hours ago'; return Math.floor(s / 86400) + ' days ago'; };
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const DAY = 86400000;

const CFG = (window.PM_CONFIG && window.PM_CONFIG.supabaseUrl && window.PM_CONFIG.supabaseKey && !localStorage.getItem('pm.demo')) ? window.PM_CONFIG : null;
const REMOTE = !!CFG;
const BUCKET = 'project-files';

const STATUSES = [['brief', 'Brief received'], ['assets', 'Assets downloaded'], ['progress', 'In progress'], ['review', 'Review'], ['done', 'Completed']];
const statusIndex = s => Math.max(0, STATUSES.findIndex(x => x[0] === s));
const statusLabel = s => (STATUSES.find(x => x[0] === s) || STATUSES[0])[1];
const TYPES = ['Video', 'Motion graphics', '3D', 'Brand film', 'Logo animation', 'UI motion'];
const PRIORITIES = ['Low', 'Normal', 'High'];

const I = {   // inline icons
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
  tick: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  team: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M21.5 19a5 5 0 0 0-6-4.5"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V5M7 10l5-5 5 5M5 19h14"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1.5A4 4 0 0 1 17 18z"/><path d="M12 15v-5M9.5 12.5L12 10l2.5 2.5"/></svg>',
  message: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><path d="M20 12l-8.5 8.5a5 5 0 0 1-7-7L13 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M4 12l16-7-5 16-3-6z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  bold: '<svg viewBox="0 0 24 24"><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/></svg>',
  italic: '<svg viewBox="0 0 24 24"><path d="M10 5h8M6 19h8M14 5l-4 14"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/></svg>',
  logout: '<svg viewBox="0 0 24 24"><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/></svg>',
  audio: '<svg viewBox="0 0 24 24"><path d="M4 12v2M8 8v8M12 5v14M16 9v6M20 11v2"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>',
  arrowL: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  arrowR: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
};

/* ---------- IndexedDB: file bytes (local mode) ---------- */
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('pm-files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async put(id, blob) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); },
  async get(id) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction('files').objectStore('files').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); },
  async del(id) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); },
};
const urlCache = new Map();   // file id (+ ':dl') -> { url, exp }
async function fileUrl(f, download) {
  if (!f) return null;
  if (f.url) return f.url;
  const key = f.id + (download ? ':dl' : '');
  const hit = urlCache.get(key); if (hit && hit.exp > Date.now()) return hit.url;
  let url = null;
  if (REMOTE) {
    if (!f.path) return null;
    const { data } = await store.sb.storage.from(BUCKET).createSignedUrl(f.path, 3600, download ? { download: f.name } : undefined);
    url = data && data.signedUrl;
  } else {
    const blob = await idb.get(f.id); if (blob) url = URL.createObjectURL(blob);
  }
  if (url) urlCache.set(key, { url, exp: Date.now() + (REMOTE ? 50 * 60e3 : 1e12) });
  return url;
}
const safeName = n => String(n).replace(/[^\w.\-]+/g, '_').slice(0, 120);

/* ---------- store: same interface for both modes ---------- */
const KEY = 'pm.v1', SESSION = 'pm.session';
const store = {
  data: { users: [], projects: [], seededFiles: true },
  meUser: null, sb: null, channel: null, ready: false, error: null,

  async init() {
    if (!REMOTE) {
      this.loadLocal(); await seedFiles().catch(() => {});
      this.meUser = this.user(localStorage.getItem(SESSION)); this.ready = true; return;
    }
    try {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      this.sb = createClient(CFG.supabaseUrl, CFG.supabaseKey);
      const { data: { session } } = await this.sb.auth.getSession();
      if (session) await this.afterSignIn();
    } catch (e) { this.error = 'The backend is not reachable: ' + (e.message || e); }
    this.ready = true;
  },
  async afterSignIn() {
    const { data: { user } } = await this.sb.auth.getUser();
    if (!user) return;
    await this.sb.rpc('ensure_profile').catch(() => {});
    try { await this.fetchAll(); } catch (e) {
      this.error = 'The database is not set up yet: run supabase/schema.sql in the Supabase SQL editor. (' + (e.message || e) + ')';
      await this.sb.auth.signOut(); this.meUser = null; return;
    }
    this.meUser = this.user(user.id);
    if (!this.meUser) { this.error = 'No profile for this account. Run supabase/schema.sql and sign in again.'; await this.sb.auth.signOut(); return; }
    this.subscribe();
  },
  loadLocal() { try { this.data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { this.data = null; } if (!this.data) { this.data = seed(); this.saveLocal(); } },
  saveLocal() { if (!REMOTE) localStorage.setItem(KEY, JSON.stringify(this.data)); },

  async fetchAll() {
    const sb = this.sb;
    const [pr, pj, fl, ms, rd] = await Promise.all([
      sb.from('profiles').select('*'), sb.from('projects').select('*'),
      sb.from('project_files').select('*').order('created_at'), sb.from('messages').select('*').order('created_at'),
      sb.from('project_reads').select('*'),
    ]);
    const err = pr.error || pj.error || fl.error || ms.error || rd.error; if (err) throw err;
    const users = pr.data.map(u => ({ id: u.id, role: u.role, name: u.name || (u.email || '').split('@')[0], title: u.title || '', login: u.email || '' }));
    const projects = pj.data.map(p => ({ id: p.id, title: p.title, client: p.client || '', type: p.type || '', priority: p.priority || 'Normal', due: p.due, assignee: p.assignee, status: p.status || 'brief', progress: p.progress || 0, brief: p.brief || '', stepDates: p.step_dates || {}, createdAt: +new Date(p.created_at), updatedAt: +new Date(p.updated_at), files: [], messages: [], read: {} }));
    const byId = Object.fromEntries(projects.map(p => [p.id, p]));
    fl.data.forEach(f => { const p = byId[f.project_id]; if (p) p.files.push({ id: f.id, name: f.name, size: f.size || 0, type: f.type || '', path: f.path, url: f.url, received: !!f.received, at: +new Date(f.created_at) }); });
    ms.data.forEach(m => { const p = byId[m.project_id]; if (p) p.messages.push({ id: m.id, from: m.from_id, text: m.text || '', file: m.file || null, at: +new Date(m.created_at) }); });
    rd.data.forEach(r => { const p = byId[r.project_id]; if (p) p.read[r.user_id] = +new Date(r.read_at); });
    this.data = { users, projects, seededFiles: true };
  },
  subscribe() {
    if (this.channel) return;
    let t;
    const bump = () => { clearTimeout(t); t = setTimeout(async () => { try { await this.fetchAll(); softRender(); } catch (e) { /* offline: keep the cache */ } }, 350); };
    this.channel = this.sb.channel('pm-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_files' }, bump)
      .subscribe();
  },
  remoteWrite(q, what) { return q.then(({ error }) => { if (error) toast((what || 'Not saved') + ': ' + error.message); }); },
  async api(action, body) {
    const { data: { session } } = await this.sb.auth.getSession();
    const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : '') }, body: JSON.stringify({ action, ...body }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j;
  },

  // ---- auth ----
  me() { return this.meUser; },
  async login(login, pass) {
    if (REMOTE) {
      this.error = null;
      const { error } = await this.sb.auth.signInWithPassword({ email: String(login).trim(), password: pass });
      if (error) return { error: error.message };
      await this.afterSignIn();
      return this.meUser ? { ok: true } : { error: this.error || 'Could not load your workspace' };
    }
    const u = this.data.users.find(u => u.login.toLowerCase() === String(login).trim().toLowerCase() && u.pass === pass);
    if (!u) return { error: 'Wrong login or password.' };
    localStorage.setItem(SESSION, u.id); this.meUser = u; return { ok: true };
  },
  async logout() {
    if (REMOTE) { if (this.channel) { await this.sb.removeChannel(this.channel); this.channel = null; } await this.sb.auth.signOut(); this.data = { users: [], projects: [], seededFiles: true }; }
    else localStorage.removeItem(SESSION);
    this.meUser = null;
  },

  // ---- users ----
  users() { return this.data.users; },
  user(id) { return this.data.users.find(u => u.id === id) || null; },
  async addUser(u) {
    if (REMOTE) { await this.api('create', { email: u.login, password: u.pass, name: u.name, title: u.title }); await this.fetchAll(); return; }
    this.data.users.push({ id: 'u_' + uid(), role: 'creator', ...u }); this.saveLocal();
  },
  async updateUser(id, patch) {
    Object.assign(this.user(id), { name: patch.name, title: patch.title });
    if (REMOTE) {
      await this.remoteWrite(this.sb.from('profiles').update({ name: patch.name, title: patch.title }).eq('id', id));
      if (patch.pass) { const { error } = await this.sb.auth.updateUser({ password: patch.pass }); if (error) throw error; }
    } else { if (patch.pass) this.user(id).pass = patch.pass; this.saveLocal(); }
  },
  async removeUser(id) {
    if (REMOTE) { await this.api('delete', { id }); await this.fetchAll(); return; }
    this.data.users = this.data.users.filter(u => u.id !== id); this.data.projects.forEach(p => { if (p.assignee === id) p.assignee = null; }); this.saveLocal();
  },

  // ---- projects ----
  projects(me) { const list = me.role === 'owner' ? this.data.projects : this.data.projects.filter(p => p.assignee === me.id); return list.slice().sort((a, b) => new Date(a.due || 0) - new Date(b.due || 0)); },
  project(id) { return this.data.projects.find(p => p.id === id) || null; },
  async createProject(p) {
    const now = Date.now();
    if (REMOTE) {
      const { data, error } = await this.sb.from('projects').insert({ title: p.title, client: p.client || '', type: p.type, priority: p.priority, due: p.due || null, assignee: p.assignee || null, brief: p.brief || '', status: 'brief', progress: 0, step_dates: { brief: now }, created_by: this.meUser.id }).select().single();
      if (error) throw error;
      await this.fetchAll(); return this.project(data.id);
    }
    const proj = { id: 'p_' + uid(), files: [], messages: [], read: {}, status: 'brief', progress: 0, stepDates: { brief: now }, createdAt: now, updatedAt: now, ...p };
    this.data.projects.push(proj); this.saveLocal(); return proj;
  },
  updateProject(id, patch) {
    const p = this.project(id); if (!p) return;
    if (patch.status && patch.status !== p.status) p.stepDates = { ...(p.stepDates || {}), [patch.status]: Date.now() };
    Object.assign(p, patch, { updatedAt: Date.now() });
    if (REMOTE) {
      const row = {}; const cols = { stepDates: 'step_dates' };
      Object.keys(patch).forEach(k => { row[cols[k] || k] = patch[k]; });
      if (patch.status) row.step_dates = p.stepDates;
      this.remoteWrite(this.sb.from('projects').update(row).eq('id', id));
    } else this.saveLocal();
    return p;
  },
  async removeProject(id) {
    const p = this.project(id); if (!p) return;
    if (REMOTE) {
      const paths = p.files.filter(f => f.path).map(f => f.path);
      if (paths.length) await this.sb.storage.from(BUCKET).remove(paths);
      const { error } = await this.sb.from('projects').delete().eq('id', id); if (error) throw error;
      await this.fetchAll(); return;
    }
    p.files.forEach(f => { if (!f.url) idb.del(f.id); });
    this.data.projects = this.data.projects.filter(p => p.id !== id); this.saveLocal();
  },

  // ---- files ----
  async addFile(projectId, file) {
    const p = this.project(projectId); const id = uid();
    if (REMOTE) {
      const path = `${projectId}/${id}-${safeName(file.name)}`;
      const up = await this.sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (up.error) throw up.error;
      const { error } = await this.sb.from('project_files').insert({ id, project_id: projectId, name: file.name, size: file.size, type: file.type || '', path });
      if (error) throw error;
      p.files.push({ id, name: file.name, size: file.size, type: file.type || '', path, received: false, at: Date.now() }); return;
    }
    await idb.put(id, file);
    p.files.push({ id, name: file.name, size: file.size, type: file.type || '', received: false, at: Date.now() }); p.updatedAt = Date.now(); this.saveLocal();
  },
  async uploadAttachment(projectId, file) {
    const id = uid();
    if (REMOTE) {
      const path = `${projectId}/chat-${id}-${safeName(file.name)}`;
      const up = await this.sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (up.error) throw up.error;
      return { id, name: file.name, size: file.size, type: file.type || '', path };
    }
    await idb.put(id, file); return { id, name: file.name, size: file.size, type: file.type || '' };
  },
  async removeFile(projectId, fileId) {
    const p = this.project(projectId); const f = p.files.find(f => f.id === fileId); if (!f) return;
    if (REMOTE) { if (f.path) await this.sb.storage.from(BUCKET).remove([f.path]); const { error } = await this.sb.from('project_files').delete().eq('id', fileId); if (error) throw error; }
    else if (!f.url) await idb.del(fileId);
    p.files = p.files.filter(f => f.id !== fileId); this.saveLocal();
  },
  setReceived(projectId, fileId, v) {
    const p = this.project(projectId); const f = p.files.find(f => f.id === fileId); if (!f) return;
    f.received = v;
    if (REMOTE) this.remoteWrite(this.sb.from('project_files').update({ received: v }).eq('id', fileId));
    if (p.files.length && p.files.every(f => f.received) && statusIndex(p.status) < 1) this.updateProject(projectId, { status: 'assets' });
    else this.saveLocal();
  },

  // ---- chat ----
  sendMessage(projectId, from, text, file) {
    const p = this.project(projectId);
    const m = { id: uid(), from, text, at: Date.now() }; if (file) m.file = file;
    p.messages.push(m); p.read[from] = m.at; p.updatedAt = m.at;
    if (REMOTE) this.remoteWrite(this.sb.from('messages').insert({ id: m.id, project_id: projectId, from_id: from, text, file: file || null }), 'Message not sent');
    else this.saveLocal();
    return m;
  },
  markRead(projectId, userId) {
    const p = this.project(projectId); if (!p) return;
    const had = this.unread(p, this.meUser); p.read = p.read || {}; p.read[userId] = Date.now();
    if (REMOTE) { if (had) this.remoteWrite(this.sb.from('project_reads').upsert({ project_id: projectId, user_id: userId, read_at: new Date().toISOString() })); }
    else this.saveLocal();
  },
  unread(p, me) { const since = (p.read && p.read[me.id]) || 0; return p.messages.filter(m => m.from !== me.id && m.at > since).length; },
  totalUnread(me) { return this.projects(me).reduce((n, p) => n + this.unread(p, me), 0); },
};

/* ---------- demo data (local mode) ---------- */
function seed() {
  const now = Date.now();
  const users = [
    { id: 'u_alex', role: 'owner', name: 'Alex', login: 'alex', pass: 'motion2026', title: 'Owner' },
    { id: 'u_jordan', role: 'creator', name: 'Jordan', login: 'jordan', pass: 'creator2026', title: 'Motion designer' },
    { id: 'u_mia', role: 'creator', name: 'Mia', login: 'mia', pass: 'creator2026', title: '3D artist' },
  ];
  const projects = [
    { id: 'p_arena', title: 'Social Reel — Arena Tease', client: 'Arena VR', type: 'Video', priority: 'High', due: '2026-09-25', assignee: 'u_jordan', status: 'progress', progress: 65,
      brief: '<p>Short TikTok reel showing the arena feature. Focus on fast action, spells and parkour.</p><p>Keep it under 20s, same style as our previous reels.</p><p>Target: Gen Z / VR community.<br>Mood: energetic, hype, clean edits.</p>',
      files: [], read: {}, stepDates: { brief: now - 6 * DAY, assets: now - 5 * DAY, progress: now - 4 * DAY }, createdAt: now - 6 * DAY, updatedAt: now - 2 * 3600e3,
      messages: [
        { id: 'm1', from: 'u_alex', text: 'Brief and assets are up. The logo must stay in the last 2 seconds. Ping me if anything is missing.', at: now - 6 * DAY + 3600e3 },
        { id: 'm2', from: 'u_jordan', text: 'Got everything, starting today.', at: now - 5 * DAY },
        { id: 'm3', from: 'u_jordan', text: 'Working on the first cut. Should be around 80% by tomorrow. Let me know if you want any specific text on screen.', at: now - 2 * 3600e3 },
      ] },
    { id: 'p_polaris', title: 'Brand Film — Polaris', client: 'Polaris', type: 'Brand film', priority: 'Normal', due: '2026-10-08', assignee: 'u_mia', status: 'review', progress: 90,
      brief: '<p>60-second brand film for the fintech launch. Clean, confident, lots of negative space.</p><p>Deliver 16:9 master plus 9:16 and 1:1 cutdowns.</p>',
      files: [], read: {}, stepDates: { brief: now - 14 * DAY, assets: now - 13 * DAY, progress: now - 12 * DAY, review: now - DAY }, createdAt: now - 14 * DAY, updatedAt: now - DAY,
      messages: [{ id: 'm4', from: 'u_mia', text: 'v03 is in the folder, colour pass done. Waiting for your notes.', at: now - DAY }] },
    { id: 'p_orbit', title: 'Logo Animation — Orbit', client: 'Orbit Studio', type: 'Logo animation', priority: 'Low', due: '2026-10-20', assignee: 'u_jordan', status: 'brief', progress: 0,
      brief: '<p>Animate the Orbit logo: the ring should form from a single particle, 3 seconds, loopable end state.</p>',
      files: [], read: {}, stepDates: { brief: now - DAY }, createdAt: now - DAY, updatedAt: now - DAY, messages: [] },
  ];
  return { users, projects, seededFiles: false };
}
async function seedFiles() {
  if (REMOTE || store.data.seededFiles) return;
  const p = store.project('p_arena'); if (!p) { store.data.seededFiles = true; store.saveLocal(); return; }
  const make = (w, h, draw) => new Promise(res => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); c.toBlob(b => res(b), 'image/jpeg', 0.85); });
  const grad = (ctx, w, h, stops) => { const g = ctx.createLinearGradient(0, 0, w, h); stops.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
  const label = (ctx, w, h, t) => { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '900 ' + Math.round(h / 4) + 'px "Sofia Sans Extra Condensed", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, w / 2, h / 2); };
  const specs = [
    ['style_ref.jpg', await make(1280, 720, (c, w, h) => { grad(c, w, h, [[0, '#2b1a4d'], [.5, '#0b1020'], [1, '#3a0f2a']]); label(c, w, h, 'STYLE REF'); })],
    ['storyboard.jpg', await make(1280, 720, (c, w, h) => { grad(c, w, h, [[0, '#f2f2f5'], [1, '#b8bac4']]); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3; for (let i = 0; i < 6; i++) c.strokeRect(60 + (i % 3) * 400, 80 + Math.floor(i / 3) * 300, 360, 240); c.fillStyle = '#111'; c.font = '600 36px Inter, sans-serif'; c.fillText('STORYBOARD v1', 60, 50); })],
    ['arena_ref.jpg', await make(1280, 720, (c, w, h) => { grad(c, w, h, [[0, '#0b0d12'], [.6, '#1f2a44'], [1, '#6a8bd6']]); label(c, w, h, 'ARENA'); })],
    ['notes.txt', new Blob(['Arena tease — notes\n\n- 18-20 s, vertical 9:16\n- Logo in the last 2 s\n- Music: reference in the shared folder\n- Text on screen: "Enter the arena"\n'], { type: 'text/plain' })],
  ];
  for (const [name, blob] of specs) { const id = uid(); await idb.put(id, blob); p.files.push({ id, name, size: blob.size, type: blob.type, received: name !== 'notes.txt', at: Date.now() - 5 * DAY }); }
  p.files.unshift({ id: 'f_logo', name: 'logo.png', size: 50220, type: 'image/png', url: 'assets/logo.png', received: true, at: Date.now() - 5 * DAY });
  store.data.seededFiles = true; store.saveLocal();
}

/* ---------- app shell / routing ---------- */
const root = document.getElementById('pm');
let currentRoute = { section: 'projects', arg: null };
let calMonth = null;
let pendingFile = null;
let filter = 'all';

function open() { if (!document.body.classList.contains('pm-open')) { document.body.classList.add('pm-open'); root.setAttribute('aria-hidden', 'false'); } }
function close() { document.body.classList.remove('pm-open'); root.setAttribute('aria-hidden', 'true'); }
function go(hash) { location.hash = hash; }
function exitToSite() { close(); history.replaceState(null, '', location.pathname); }

function route() {
  const h = location.hash;
  if (!h.startsWith('#manager')) { close(); return; }
  open();
  if (!store.ready) { root.innerHTML = '<div class="pm-login"><div class="pm-card"><p class="hint">Loading…</p></div></div>'; return; }
  const me = store.me();
  if (!me) { root.innerHTML = viewLogin(); const f = $('#pm-login-user'); f && f.focus(); return; }
  const parts = h.slice(1).split('/');
  currentRoute = { section: parts[1] || 'projects', arg: parts[2] || null };
  render();
}
function render() {
  const me = store.me(); if (!me) return route();
  const { section, arg } = currentRoute;
  let body = '', tab = section;
  if (section === 'p' && arg) { const p = store.project(arg); body = p ? viewProject(me, p) : viewEmpty('Project not found'); tab = 'projects'; }
  else if (section === 'tasks') body = viewTasks(me);
  else if (section === 'calendar') body = viewCalendar(me);
  else if (section === 'team' || section === 'people') { body = viewTeam(me); tab = 'team'; }
  else if (section === 'messages') body = viewMessages(me);
  else if (section === 'settings') body = viewSettings(me);
  else if (section === 'new') body = viewNewProject(me);
  else { body = viewProjects(me); tab = 'projects'; }
  root.innerHTML = viewShell(me, tab, body);
  afterRender(me);
}
// live update without stealing the caret from the brief or the chat composer
function softRender() {
  const a = document.activeElement;
  const typing = a && (a.id === 'pm-brief' || (a.closest && a.closest('#pm-composer')));
  if (typing && currentRoute.section === 'p') {
    const p = store.project(currentRoute.arg), me = store.me(), msgs = $('#pm-messages');
    if (p && msgs && me) { msgs.innerHTML = p.messages.map(m => messageHtml(me, m)).join(''); msgs.scrollTop = msgs.scrollHeight; resolveThumbs(); }
    return;
  }
  if (document.body.classList.contains('pm-open')) render();
}

function viewShell(me, tab, body) {
  const unread = store.totalUnread(me);
  const nav = [
    ['projects', 'Projects', I.folder], ['tasks', 'My tasks', I.check], ['calendar', 'Calendar', I.calendar],
    ...(me.role === 'owner' ? [['team', 'Team', I.team]] : []), ['messages', 'Messages', I.message], ['settings', 'Settings', I.settings],
  ];
  return `
  <aside class="pm-side">
    <a class="pm-logo" href="#manager/projects"><img src="assets/logo.png" alt=""></a>
    <nav class="pm-nav">${nav.map(([k, l, ic]) => `<a href="#manager/${k}" class="${tab === k ? 'is-active' : ''}">${ic}<span>${l}</span>${k === 'messages' && unread ? `<i class="badge">${unread}</i>` : ''}</a>`).join('')}</nav>
    <div class="pm-side-foot">Create<br>Explore<br>Collaborate<i></i></div>
    <button class="pm-exit" data-action="exit">${I.back} Site</button>
  </aside>
  <div class="pm-main">
    <div class="pm-deco cond">${tab === 'projects' && currentRoute.section === 'p' ? 'PROJECT' : tab.toUpperCase()}</div>
    <div class="pm-deco-tag">Ideas<br>in motion</div>
    <header class="pm-top">
      <nav class="pm-tabs">
        <a href="#manager/projects" class="${tab === 'projects' ? 'is-active' : ''}">Projects</a>
        <a href="#manager/people" class="${tab === 'team' ? 'is-active' : ''}">People</a>
        <a href="#manager/messages" class="${tab === 'messages' ? 'is-active' : ''}">Messages</a>
      </nav>
      <label class="pm-search">${I.search}<input type="search" id="pm-search" placeholder="Search projects..."></label>
      <a class="pm-bell" href="#manager/messages" aria-label="Notifications">${I.bell}${unread ? '<i class="dot"></i>' : ''}</a>
      <div class="pm-user"><span class="avatar">${initials(me.name)}</span>${esc(me.name)}<button data-action="logout" title="Sign out">${I.logout}</button></div>
    </header>
    ${body}
  </div>
  <div class="pm-toast" id="pm-toast"></div>`;
}

function viewLogin() {
  return `
  <div class="pm-login">
    <a class="back" href="#" data-action="exit">${I.back} Back to site</a>
    <div class="pm-deco cond">MANAGER</div>
    <form class="pm-card" id="pm-login-form">
      <div class="brand"><img src="assets/logo.png" alt=""><div><h1 class="cond">Project manager</h1><small>Private workspace</small></div></div>
      <div class="form">
        <label>${REMOTE ? 'Email' : 'Login'}<input id="pm-login-user" name="login" type="${REMOTE ? 'email' : 'text'}" autocomplete="username" required></label>
        <label>Password<input type="password" name="pass" autocomplete="current-password" required></label>
        <div class="error" id="pm-login-error">${esc(store.error || '')}</div>
        <button class="btn dark" type="submit" style="justify-content:center">Sign in</button>
      </div>
      ${REMOTE ? '<div class="demo">Accounts are created by the owner in Team. Use the email and password you were given.</div>'
               : '<div class="demo">Demo accounts (this browser only):<br>owner <code>alex / motion2026</code> &middot; creator <code>jordan / creator2026</code></div>'}
    </form>
  </div>`;
}

const ring = (pct, size, sw) => { const r = (size - sw) / 2, c = 2 * Math.PI * r; return `<svg viewBox="0 0 ${size} ${size}"><circle class="bg" cx="${size / 2}" cy="${size / 2}" r="${r}"/><circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}"/></svg>`; };
const chipsFor = p => `<span class="chip">${I.calendar} Due ${fmtDate(p.due)}</span><span class="chip">${esc(p.type)}</span><span class="chip prio ${p.priority}">${esc(p.priority)} priority</span>${p.client ? `<span class="chip">${esc(p.client)}</span>` : ''}`;

function projectCard(me, p) {
  const a = store.user(p.assignee), un = store.unread(p, me);
  return `<a class="pm-card pcard" href="#manager/p/${p.id}">
    <div class="top"><div><h3 class="cond">${esc(p.title)}</h3><div class="sub">${esc(p.client || '')} &middot; ${statusLabel(p.status)}</div></div>
      <div class="mini-ring">${ring(p.progress, 44, 5)}<b>${p.progress}%</b></div></div>
    <div class="chips">${chipsFor(p)}</div>
    <div class="foot">${a ? `<span class="avatar">${initials(a.name)}</span>${esc(a.name)}` : '<span class="muted">Unassigned</span>'}<span>&middot; ${p.files.length} files</span>${un ? `<span class="unread">${un} new</span>` : ''}</div>
  </a>`;
}
function viewProjects(me) {
  let list = store.projects(me);
  if (filter === 'active') list = list.filter(p => p.status !== 'done');
  if (filter === 'review') list = list.filter(p => p.status === 'review');
  if (filter === 'done') list = list.filter(p => p.status === 'done');
  return `<div class="pm-list-head"><h1 class="cond">${me.role === 'owner' ? 'All projects' : 'My projects'}</h1>
    <div class="pm-filters">${[['all', 'All'], ['active', 'Active'], ['review', 'Review'], ['done', 'Done']].map(([k, l]) => `<button data-action="filter" data-v="${k}" class="${filter === k ? 'is-active' : ''}">${l}</button>`).join('')}</div>
    ${me.role === 'owner' ? `<a class="btn dark" href="#manager/new">${I.plus} New project</a>` : ''}</div>
    <div class="pgrid" id="pm-pgrid">${list.length ? list.map(p => projectCard(me, p)).join('') : `<div class="empty">${me.role === 'owner' ? 'No projects yet. Create the first one.' : 'Nothing assigned to you yet.'}</div>`}</div>`;
}
function viewTasks(me) {
  const list = store.projects(me).filter(p => p.status !== 'done');
  const groups = STATUSES.slice(0, 4).map(([k, l]) => [l, list.filter(p => p.status === k)]).filter(g => g[1].length);
  return `<div class="pm-list-head"><h1 class="cond">My tasks</h1></div>
    ${groups.length ? groups.map(([l, ps]) => `<h3 class="cond" style="position:relative;z-index:2;font-size:20px;margin:6px 0 10px;color:var(--pm-muted)">${l}</h3><div class="pgrid" style="margin-bottom:22px">${ps.map(p => projectCard(me, p)).join('')}</div>`).join('') : '<div class="empty">No open tasks.</div>'}`;
}
function viewEmpty(t) { return `<div class="empty">${esc(t)}</div>`; }

function fileTile(me, p, f) {
  const img = /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
  const video = /^video\//.test(f.type) || /\.(mp4|mov|webm)$/i.test(f.name);
  const audio = /^audio\//.test(f.type) || /\.(mp3|wav|aac)$/i.test(f.name);
  const icon = video ? '<span class="pm-play"></span>' : audio ? I.audio : img ? I.image : I.doc;
  return `<div class="tile ${f.received ? 'is-received' : ''}" data-file="${f.id}">
    <div class="thumb">${img ? `<img data-src="${f.id}" alt="">` : ''}${icon}<span class="recv" data-action="toggle-received" title="Mark as received">${I.tick}</span></div>
    <span class="name" title="${esc(f.name)}">${esc(f.name)}</span><span class="size">${fmtSize(f.size)}</span>
    <div class="acts"><a href="#" data-action="download" title="Download">${I.download}</a>${me.role === 'owner' ? `<button data-action="remove-file" title="Remove">${I.trash}</button>` : ''}</div>
  </div>`;
}
function viewProject(me, p) {
  const a = store.user(p.assignee);
  const idx = statusIndex(p.status);
  const received = p.files.filter(f => f.received).length;
  const canEdit = me.role === 'owner';
  const briefLen = p.brief ? p.brief.replace(/<[^>]+>/g, '').length : 0;
  store.markRead(p.id, me.id);
  return `
  <div class="pm-head">
    <a class="pm-back" href="#manager/projects">${I.back} All projects</a>
    <h1 class="pm-title cond">${esc(p.title)}</h1>
    <div class="chips">${chipsFor(p)}</div>
  </div>
  <div class="pm-grid" data-project="${p.id}">
    <div class="pm-col">
      <section class="pm-card">
        <header class="card-head"><i class="ico">${I.doc}</i><div><h3 class="cond">1. Brief</h3><p>${canEdit ? 'Tell your creator what you need' : 'What the owner needs from you'}</p></div>${canEdit ? '<span class="aside">Saved automatically</span>' : ''}</header>
        <div class="editor">
          ${canEdit ? `<div class="toolbar"><button data-cmd="bold" title="Bold">${I.bold}</button><button data-cmd="italic" title="Italic">${I.italic}</button><button data-cmd="insertUnorderedList" title="List">${I.list}</button><button data-cmd="createLink" title="Link">${I.link}</button></div>` : ''}
          <div class="brief" id="pm-brief" contenteditable="${canEdit}">${p.brief || '<p></p>'}</div>
          <div class="editor-foot"><span id="pm-brief-count">${briefLen}</span></div>
        </div>
      </section>
      <section class="pm-card">
        <header class="card-head"><i class="ico">${I.upload}</i><div><h3 class="cond">2. Files &amp; references</h3><p>${canEdit ? 'Upload all the assets your collaborator needs' : 'Download the assets and tick what you have received'}</p></div><span class="aside">${received}/${p.files.length} received</span></header>
        <div class="files">
          <label class="dropzone" id="pm-drop">${I.cloud}<span>Drag and drop files here<br>or <u>browse files</u></span><input type="file" multiple hidden id="pm-file-input"></label>
          <div class="file-grid">${p.files.map(f => fileTile(me, p, f)).join('')}<button class="tile add" data-action="browse"><span>${I.plus}<br>Add more</span></button></div>
        </div>
      </section>
    </div>
    <div class="pm-col">
      <section class="pm-card">
        <header class="card-head"><i class="ico">${I.team}</i><div><h3 class="cond">3. Assigned creator</h3><p>Working on this project</p></div></header>
        <div class="person">${a ? `<span class="avatar lg">${initials(a.name)}</span><div><b>${esc(a.name)}</b><small>${esc(a.title || 'Creator')}</small></div>` : `<div class="muted">Nobody assigned yet</div>`}
          ${canEdit ? `<select class="btn" data-action="assign" style="margin-left:auto">${['<option value="">Unassigned</option>', ...store.users().filter(u => u.role === 'creator').map(u => `<option value="${u.id}" ${u.id === p.assignee ? 'selected' : ''}>${esc(u.name)}</option>`)].join('')}</select>` : `<button class="btn" data-action="focus-chat">${I.message} Message</button>`}
        </div>
      </section>
      <section class="pm-card">
        <header class="card-head"><div><h3 class="cond">Progress</h3></div>${canEdit ? `<button class="btn icon small aside" data-action="delete-project" title="Delete project">${I.trash}</button>` : ''}</header>
        <div class="prog">
          <div class="ring">${ring(p.progress, 96, 8)}<b class="cond">${p.progress}%</b></div>
          <div class="prog-side">
            <span class="status ${p.status === 'done' ? 'done' : ''}"><select data-action="status">${STATUSES.map(([k, l]) => `<option value="${k}" ${k === p.status ? 'selected' : ''}>${l}</option>`).join('')}</select>${I.chevron}</span>
            <small>Last update: ${ago(p.updatedAt)}</small>
            <div class="slider"><span>0</span><input type="range" min="0" max="100" step="5" value="${p.progress}" data-action="progress"><span>100</span></div>
          </div>
        </div>
        <ol class="timeline">${STATUSES.map(([k, l], i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${l}${p.stepDates && p.stepDates[k] && i <= idx ? `<small>${shortDate(p.stepDates[k])}</small>` : ''}</li>`).join('')}</ol>
      </section>
      <section class="pm-card">
        <header class="card-head"><div><h3 class="cond">Latest update</h3><p>Project chat with ${a ? esc(a.name) : 'the creator'}</p></div></header>
        <div class="messages" id="pm-messages">${p.messages.length ? p.messages.map(m => messageHtml(me, m)).join('') : '<div class="empty">No messages yet. Say hi.</div>'}</div>
        <form class="composer" id="pm-composer"><span class="avatar">${initials(me.name)}</span><input type="text" placeholder="Write a message..." autocomplete="off"><span class="pending" id="pm-pending"></span><label title="Attach a file">${I.clip}<input type="file" hidden id="pm-chat-file"></label><button class="send" type="submit" aria-label="Send">${I.send}</button></form>
      </section>
    </div>
  </div>`;
}
function messageHtml(me, m) {
  const u = store.user(m.from);
  const isImg = m.file && (/^image\//.test(m.file.type) || /\.(png|jpe?g|webp|gif)$/i.test(m.file.name));
  return `<div class="msg ${m.from === me.id ? 'me' : ''}"><span class="avatar">${u ? initials(u.name) : '?'}</span><div>
    <div class="who">${u ? esc(u.name) : 'Unknown'}<span>${ago(m.at)}</span></div>
    <div class="text">${esc(m.text)}</div>
    ${m.file ? `<a class="att" href="#" data-action="download" data-file="${m.file.id}">${isImg ? `<img data-src="${m.file.id}" alt="">` : I.doc}<span>${esc(m.file.name)}<small>${fmtSize(m.file.size)}</small></span></a>` : ''}
  </div></div>`;
}

function viewNewProject(me) {
  const creators = store.users().filter(u => u.role === 'creator');
  return `<div class="pm-head"><a class="pm-back" href="#manager/projects">${I.back} All projects</a><h1 class="pm-title cond">New project</h1></div>
  <form class="pm-card form" id="pm-new" style="position:relative;z-index:2;max-width:640px">
    <label>Title<input name="title" required placeholder="Social Reel — Arena Tease"></label>
    <div class="row"><label>Client<input name="client" placeholder="Company"></label><label>Due date<input type="date" name="due" required></label></div>
    <div class="row"><label>Type<select name="type">${TYPES.map(t => `<option>${t}</option>`).join('')}</select></label><label>Priority<select name="priority">${PRIORITIES.map(t => `<option ${t === 'Normal' ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <label>Assign to<select name="assignee"><option value="">Choose later</option>${creators.map(u => `<option value="${u.id}">${esc(u.name)} · ${esc(u.title || '')}</option>`).join('')}</select></label>
    <label>Brief<textarea name="brief" placeholder="What needs to be made, format, duration, mood, deadline details..."></textarea></label>
    <p class="hint">You can upload the files and refine the brief on the project page right after creating it.</p>
    <div class="actions"><a class="btn" href="#manager/projects">Cancel</a><button class="btn dark" type="submit">Create project</button></div>
  </form>`;
}
function viewTeam(me) {
  const users = store.users();
  return `<div class="pm-list-head"><h1 class="cond">Team</h1></div>
  <div class="people">
    <section class="pm-card">${users.map(u => `<div class="person-row"><span class="avatar lg">${initials(u.name)}</span><div><b>${esc(u.name)}</b><small>${esc(u.title || '')} &middot; ${REMOTE ? '' : 'login '}<code>${esc(u.login)}</code>${u.role === 'creator' ? ` &middot; ${store.data.projects.filter(p => p.assignee === u.id && p.status !== 'done').length} active` : ''}</small></div><span class="role">${u.role}</span>${me.role === 'owner' && u.role === 'creator' ? `<button class="btn small" data-action="remove-user" data-id="${u.id}">${I.trash}</button>` : ''}</div>`).join('')}</section>
    ${me.role === 'owner' ? `<form class="pm-card form" id="pm-add-user"><h3 class="cond" style="font-size:20px">Add a creator</h3>
      <label>Name<input name="name" required placeholder="Jordan"></label>
      <label>Role / title<input name="title" placeholder="Motion designer"></label>
      <div class="row"><label>${REMOTE ? 'Email' : 'Login'}<input name="login" type="${REMOTE ? 'email' : 'text'}" required placeholder="${REMOTE ? 'jordan@studio.com' : 'jordan'}"></label><label>Password<input name="pass" required minlength="6" placeholder="Give this to them"></label></div>
      <p class="hint">Share the ${REMOTE ? 'email' : 'login'} and password with your collaborator together with the link <code>${esc(location.origin + location.pathname)}#manager</code>. They will only see the projects assigned to them.</p>
      <div class="actions"><button class="btn dark" type="submit">${I.plus} Add creator</button></div></form>` : ''}
  </div>`;
}
function viewMessages(me) {
  const list = store.projects(me).filter(p => p.messages.length).sort((a, b) => b.messages[b.messages.length - 1].at - a.messages[a.messages.length - 1].at);
  return `<div class="pm-list-head"><h1 class="cond">Messages</h1></div>
  <div class="threads">${list.length ? list.map(p => { const m = p.messages[p.messages.length - 1], u = store.user(m.from), un = store.unread(p, me); return `<a class="pm-card thread" href="#manager/p/${p.id}"><span class="avatar lg">${u ? initials(u.name) : '?'}</span><div><h3 class="cond">${esc(p.title)}</h3><div class="last"><b>${u ? esc(u.name) : ''}:</b> ${esc(m.text)}</div></div><div class="when">${ago(m.at)}${un ? `<br><span class="unread">${un} new</span>` : ''}</div></a>`; }).join('') : '<div class="empty">No conversations yet.</div>'}</div>`;
}
function viewCalendar(me) {
  const now = new Date(); calMonth = calMonth || new Date(now.getFullYear(), now.getMonth(), 1);
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = new Date(y, m, 1), pad = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const list = store.projects(me);
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push('<div class="day pad"></div>');
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evs = list.filter(p => p.due === iso);
    const today = iso === new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    cells.push(`<div class="day ${today ? 'today' : ''}">${d}${evs.map(p => `<a class="ev ${p.priority}" href="#manager/p/${p.id}" title="${esc(p.title)}">${esc(p.title)}</a>`).join('')}</div>`);
  }
  const upcoming = list.filter(p => p.status !== 'done' && p.due && new Date(p.due) >= new Date(now.toDateString())).slice(0, 6);
  return `<div class="pm-list-head"><h1 class="cond">Calendar</h1></div>
  <div class="cal">
    <section class="pm-card"><div class="cal-head"><h3 class="cond">${calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3><button class="btn icon" data-action="cal-prev">${I.arrowL}</button><button class="btn icon" data-action="cal-next">${I.arrowR}</button></div>
      <div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('')}${cells.join('')}</div></section>
    <section class="pm-card"><h3 class="cond" style="font-size:20px;margin-bottom:12px">Upcoming deadlines</h3><div class="upcoming">${upcoming.length ? upcoming.map(p => `<a href="#manager/p/${p.id}"><span class="avatar" style="width:26px;height:26px;font-size:10px">${p.progress}</span>${esc(p.title)}<small>${fmtDate(p.due)}</small></a>`).join('') : '<div class="empty">Nothing due.</div>'}</div></section>
  </div>`;
}
function viewSettings(me) {
  return `<div class="pm-list-head"><h1 class="cond">Settings</h1></div>
  <form class="pm-card form" id="pm-settings" style="position:relative;z-index:2;max-width:520px">
    <label>Name<input name="name" value="${esc(me.name)}" required></label>
    <label>Title<input name="title" value="${esc(me.title || '')}"></label>
    <label>New password<input type="password" name="pass" minlength="6" placeholder="Leave empty to keep the current one" autocomplete="new-password"></label>
    <p class="hint">${REMOTE ? 'Signed in as <code>' + esc(me.login) + '</code>. Data lives in Supabase and is shared with your team in real time.' : 'Demo mode: data of this workspace is stored in this browser only.'}</p>
    <div class="actions">${REMOTE ? '' : '<button class="btn" type="button" data-action="reset-demo">Reset demo data</button>'}<button class="btn dark" type="submit">Save</button></div>
  </form>`;
}

/* ---------- behaviour ---------- */
function toast(t) { const el = $('#pm-toast'); if (!el) return; el.textContent = t; el.classList.add('is-on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('is-on'), 2200); }
function findFile(p, id) { return p && (p.files.find(f => f.id === id) || (p.messages.find(m => m.file && m.file.id === id) || {}).file); }
async function resolveThumbs() {
  const p = store.project(currentRoute.arg);
  for (const img of root.querySelectorAll('img[data-src]')) { const f = findFile(p, img.dataset.src); if (f) { const u = await fileUrl(f); if (u) img.src = u; } }
}
async function afterRender(me) {
  resolveThumbs();
  const msgs = $('#pm-messages'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
  const brief = $('#pm-brief');
  if (brief && brief.isContentEditable) {
    let t; brief.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { store.updateProject(currentRoute.arg, { brief: brief.innerHTML }); $('#pm-brief-count').textContent = brief.textContent.length; }, 400); });
  }
  const drop = $('#pm-drop');
  if (drop) {
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
    $('#pm-file-input').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  }
  const chatFile = $('#pm-chat-file');
  if (chatFile) { chatFile.addEventListener('change', () => { pendingFile = chatFile.files[0] || null; $('#pm-pending').textContent = pendingFile ? pendingFile.name : ''; }); if (pendingFile) $('#pm-pending').textContent = pendingFile.name; }
  const search = $('#pm-search');
  if (search) search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase(); const grid = $('#pm-pgrid'); if (!grid) return;
    grid.querySelectorAll('.pcard').forEach(c => { c.style.display = !q || c.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });
}
async function addFiles(list) {
  const p = store.project(currentRoute.arg); if (!p || !list.length) return;
  let n = 0;
  for (const f of list) {
    if (f.size > 200 * 1048576) { toast(f.name + ' is over 200 MB'); continue; }
    try { toast('Uploading ' + f.name + '…'); await store.addFile(p.id, f); n++; } catch (e) { toast('Upload failed: ' + (e.message || e)); }
  }
  if (n) toast(n + ' file' + (n > 1 ? 's' : '') + ' added');
  render();
}

root.addEventListener('click', async e => {
  const el = e.target.closest('[data-action], [data-cmd]'); if (!el) return;
  const me = store.me();
  if (el.dataset.cmd) { e.preventDefault(); const url = el.dataset.cmd === 'createLink' ? prompt('Link URL') : null; if (el.dataset.cmd === 'createLink' && !url) return; document.execCommand(el.dataset.cmd, false, url); $('#pm-brief').dispatchEvent(new Event('input')); return; }
  const act = el.dataset.action;
  if (act === 'exit') { e.preventDefault(); exitToSite(); return; }
  if (act === 'logout') { await store.logout(); go('#manager'); route(); return; }
  if (act === 'filter') { filter = el.dataset.v; render(); return; }
  if (act === 'cal-prev' || act === 'cal-next') { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + (act === 'cal-next' ? 1 : -1), 1); render(); return; }
  if (act === 'reset-demo') { if (confirm('Reset all demo data in this browser?')) { localStorage.removeItem(KEY); store.loadLocal(); await seedFiles(); render(); toast('Demo data reset'); } return; }
  if (act === 'remove-user') { if (confirm('Remove this creator? Their projects stay, unassigned.')) { try { await store.removeUser(el.dataset.id); render(); } catch (err) { toast(err.message || 'Could not remove'); } } return; }
  const p = store.project(currentRoute.arg);
  if (act === 'browse') { $('#pm-file-input').click(); return; }
  if (act === 'focus-chat') { const i = $('#pm-composer input[type="text"]'); i && i.focus(); return; }
  if (act === 'delete-project') { if (p && confirm('Delete this project and its files?')) { try { await store.removeProject(p.id); go('#manager/projects'); } catch (err) { toast(err.message || 'Could not delete'); } } return; }
  if (act === 'toggle-received' && p) { const id = el.closest('.tile').dataset.file; const f = p.files.find(f => f.id === id); store.setReceived(p.id, id, !f.received); render(); return; }
  if (act === 'remove-file' && p) { const id = el.closest('.tile').dataset.file; if (confirm('Remove this file?')) { try { await store.removeFile(p.id, id); render(); } catch (err) { toast(err.message || 'Could not remove'); } } return; }
  if (act === 'download' && p) {
    e.preventDefault();
    const id = el.dataset.file || el.closest('.tile').dataset.file;
    const f = findFile(p, id);
    const u = f && await fileUrl(f, true); if (!u) { toast('File is not available'); return; }
    const a = document.createElement('a'); a.href = u; a.download = f.name; if (REMOTE) a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove();
    if (me.role === 'creator' && p.files.find(x => x.id === id) && !f.received) { store.setReceived(p.id, id, true); render(); }
    return;
  }
});
root.addEventListener('change', e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const p = store.project(currentRoute.arg); if (!p) return;
  if (el.dataset.action === 'status') { const patch = { status: el.value }; if (el.value === 'done') patch.progress = 100; store.updateProject(p.id, patch); render(); }
  if (el.dataset.action === 'progress') { const v = +el.value; const patch = { progress: v }; if (v >= 100) patch.status = 'done'; else if (v > 0 && statusIndex(p.status) < 2) patch.status = 'progress'; store.updateProject(p.id, patch); render(); }
  if (el.dataset.action === 'assign') { store.updateProject(p.id, { assignee: el.value || null }); render(); }
});
root.addEventListener('input', e => {
  if (e.target.matches('[data-action="progress"]')) { const v = +e.target.value; const ring = e.target.closest('.pm-card').querySelector('.ring'); ring.querySelector('b').textContent = v + '%'; const fg = ring.querySelector('.fg'); const c = parseFloat(fg.getAttribute('stroke-dasharray')); fg.setAttribute('stroke-dashoffset', (c * (1 - v / 100)).toFixed(1)); }
});
root.addEventListener('submit', async e => {
  const f = e.target; const me = store.me();
  if (f.id === 'pm-login-form') {
    e.preventDefault(); const fd = new FormData(f); const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing in…';
    const r = await store.login(fd.get('login'), fd.get('pass'));
    if (r.ok) { go('#manager/projects'); route(); } else { btn.disabled = false; btn.textContent = 'Sign in'; $('#pm-login-error').textContent = r.error; }
    return;
  }
  if (!me) return;
  if (f.id === 'pm-composer') {
    e.preventDefault(); const input = f.querySelector('input[type="text"]'); const text = input.value.trim(); const p = store.project(currentRoute.arg);
    if (!p || (!text && !pendingFile)) return;
    let fileEntry = null;
    if (pendingFile) { try { toast('Uploading ' + pendingFile.name + '…'); fileEntry = await store.uploadAttachment(p.id, pendingFile); } catch (err) { toast('Upload failed: ' + (err.message || err)); return; } pendingFile = null; }
    store.sendMessage(p.id, me.id, text, fileEntry); render(); return;
  }
  if (f.id === 'pm-new') {
    e.preventDefault(); const fd = new FormData(f);
    const brief = String(fd.get('brief') || '').trim().split(/\n\s*\n/).filter(Boolean).map(s => `<p>${esc(s).replace(/\n/g, '<br>')}</p>`).join('');
    try { const p = await store.createProject({ title: fd.get('title'), client: fd.get('client'), due: fd.get('due'), type: fd.get('type'), priority: fd.get('priority'), assignee: fd.get('assignee') || null, brief }); go('#manager/p/' + p.id); toast('Project created'); }
    catch (err) { toast('Could not create: ' + (err.message || err)); }
    return;
  }
  if (f.id === 'pm-add-user') {
    e.preventDefault(); const fd = new FormData(f);
    if (store.users().some(u => u.login.toLowerCase() === String(fd.get('login')).trim().toLowerCase())) { toast('This ' + (REMOTE ? 'email' : 'login') + ' is already used'); return; }
    try { await store.addUser({ name: fd.get('name'), title: fd.get('title'), login: String(fd.get('login')).trim(), pass: fd.get('pass') }); render(); toast('Creator added'); }
    catch (err) { toast(err.message || 'Could not add'); }
    return;
  }
  if (f.id === 'pm-settings') {
    e.preventDefault(); const fd = new FormData(f);
    try { await store.updateUser(me.id, { name: fd.get('name'), title: fd.get('title'), pass: fd.get('pass') || '' }); render(); toast('Saved'); }
    catch (err) { toast(err.message || 'Could not save'); }
    return;
  }
});
root.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest('input, textarea, [contenteditable]')) exitToSite(); });

/* ---------- boot ---------- */
(async () => {
  addEventListener('hashchange', route);
  route();                 // shows "Loading…" if the manager is open at start
  await store.init();
  route();
})();
window.PM = { open: () => go('#manager'), close: exitToSite, store, remote: REMOTE };
