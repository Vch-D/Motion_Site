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

// Reviews: what a creator can send for review, and where each version stands
const KINDS = [['test', 'Test', 'A quick check of an idea, a style or the timing'], ['preview', 'Preview', 'A cut to watch and comment on'], ['final', 'Final render', 'The finished master, ready to approve']];
const kindLabel = k => (KINDS.find(x => x[0] === k) || KINDS[1])[1];
const RV_STATUS = { pending: 'Waiting for review', changes: 'Changes requested', approved: 'Approved' };
const MAX_UPLOAD_MB = 50;      // Supabase Free allows 50 MB per file: raise this after upgrading the plan
const FRAME = 1 / 25;          // one arrow-key step in the player
const isVideo = f => !!f && (/^video\//.test(f.type || '') || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name || ''));
const isImage = f => !!f && (/^image\//.test(f.type || '') || /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name || ''));
const tc = s => { s = Math.max(0, +s || 0); return Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0'); };   // 0:07.4
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'link'; } };
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '#');

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
  film: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.5v5l4.3-2.5z"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  external: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
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

// A version sent for review ("delivery"): its file, and a poster frame for the lists (images are their own poster)
const mainFile = d => (d && d.name && (d.path || !REMOTE)) ? { id: d.id, path: d.path, name: d.name, type: d.type } : null;
const posterFile = d => (d && d.poster) ? { id: d.id + ':poster', path: d.poster === 'local' ? null : d.poster, name: 'poster.jpg' } : (isImage(d) ? mainFile(d) : null);
const mapDelivery = d => ({
  id: d.id, projectId: d.project_id, version: d.version, kind: d.kind, note: d.note || '', name: d.name || '', size: +d.size || 0, type: d.type || '',
  path: d.path || null, poster: d.poster || null, link: d.link || null, width: d.width || 0, height: d.height || 0, duration: +d.duration || 0,
  status: d.status || 'pending', feedback: d.feedback || '', by: d.created_by, at: +new Date(d.created_at),
  reviewedBy: d.reviewed_by || null, reviewedAt: d.reviewed_at ? +new Date(d.reviewed_at) : null,
});
// Size, length and a poster frame of a picked file, read locally before the upload (nothing leaves the browser here)
function probeMedia(file) {
  const out = { width: 0, height: 0, duration: 0, poster: null };
  if (isImage(file)) {
    if (!window.createImageBitmap) return Promise.resolve(out);
    return createImageBitmap(file).then(b => { out.width = b.width; out.height = b.height; b.close && b.close(); return out; }, () => out);
  }
  if (!isVideo(file)) return Promise.resolve(out);
  return new Promise(res => {
    const v = document.createElement('video'), url = URL.createObjectURL(file);
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); res(out); };
    const timer = setTimeout(finish, 8000);
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onloadedmetadata = () => {
      out.width = v.videoWidth; out.height = v.videoHeight; out.duration = Number.isFinite(v.duration) ? v.duration : 0;
      if (!v.videoWidth) return finish();                               // a codec this browser cannot decode: no poster
      v.currentTime = Math.min(1, out.duration * 0.25) || 0.05;
    };
    v.onseeked = () => {
      try {
        const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(b => { out.poster = b; finish(); }, 'image/jpeg', 0.82);
      } catch (e) { finish(); }
    };
    v.onerror = finish;
    v.src = url;
  });
}

/* ---------- store: same interface for both modes ---------- */
const KEY = 'pm.v1', SESSION = 'pm.session';
const store = {
  data: { users: [], projects: [], seededFiles: true },
  meUser: null, sb: null, channel: null, channelRv: null, ready: false, error: null,
  reviewsReady: !REMOTE,   // remote: true once the deliveries table exists (supabase/reviews.sql)

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
    try { await this.sb.rpc('ensure_profile'); } catch (e) { /* profile may already exist */ }
    try { await this.fetchAll(); } catch (e) {
      this.error = 'The database is not set up yet: run supabase/schema.sql in the Supabase SQL editor. (' + (e.message || e) + ')';
      await this.sb.auth.signOut(); this.meUser = null; return;
    }
    this.meUser = this.user(user.id);
    if (!this.meUser) { this.error = 'No profile for this account. Run supabase/schema.sql and sign in again.'; await this.sb.auth.signOut(); return; }
    this.subscribe();
  },
  loadLocal() {
    try { this.data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { this.data = null; }
    if (!this.data) { this.data = seed(); this.saveLocal(); }
    this.data.projects.forEach(p => { p.deliveries = p.deliveries || []; });   // demo data saved before reviews existed
  },
  saveLocal() { if (!REMOTE) localStorage.setItem(KEY, JSON.stringify(this.data)); },

  async fetchAll() {
    const sb = this.sb;
    const [pr, pj, fl, ms, rd, dv] = await Promise.all([
      sb.from('profiles').select('*'), sb.from('projects').select('*'),
      sb.from('project_files').select('*').order('created_at'), sb.from('messages').select('*').order('created_at'),
      sb.from('project_reads').select('*'), sb.from('deliveries').select('*').order('version'),
    ]);
    const err = pr.error || pj.error || fl.error || ms.error || rd.error; if (err) throw err;
    this.reviewsReady = !dv.error;   // no deliveries table yet (reviews.sql not run): everything else works as before
    const users = pr.data.map(u => ({ id: u.id, role: u.role, name: u.name || (u.email || '').split('@')[0], title: u.title || '', login: u.email || '' }));
    const projects = pj.data.map(p => ({ id: p.id, title: p.title, client: p.client || '', type: p.type || '', priority: p.priority || 'Normal', due: p.due, assignee: p.assignee, status: p.status || 'brief', progress: p.progress || 0, brief: p.brief || '', stepDates: p.step_dates || {}, createdAt: +new Date(p.created_at), updatedAt: +new Date(p.updated_at), files: [], messages: [], deliveries: [], read: {} }));
    const byId = Object.fromEntries(projects.map(p => [p.id, p]));
    fl.data.forEach(f => { const p = byId[f.project_id]; if (p) p.files.push({ id: f.id, name: f.name, size: f.size || 0, type: f.type || '', path: f.path, url: f.url, received: !!f.received, at: +new Date(f.created_at) }); });
    ms.data.forEach(m => { const p = byId[m.project_id]; if (p) p.messages.push({ id: m.id, from: m.from_id, text: m.text || '', file: m.file || null, at: +new Date(m.created_at), delivery: m.delivery_id || null, t: m.at_time == null ? null : +m.at_time, event: m.event || null }); });
    rd.data.forEach(r => { const p = byId[r.project_id]; if (p) p.read[r.user_id] = +new Date(r.read_at); });
    if (!dv.error) dv.data.forEach(d => { const p = byId[d.project_id]; if (p) p.deliveries.push(mapDelivery(d)); });
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
    // its own channel: if this table is missing from the realtime publication, the chat still updates live
    if (this.reviewsReady && !this.channelRv) this.channelRv = this.sb.channel('pm-live-reviews').on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, bump).subscribe();
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
      try {
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('The backend did not answer in 25 s. Check your connection and try again.')), 25000));
        const { error } = await Promise.race([this.sb.auth.signInWithPassword({ email: String(login).trim(), password: pass }), timeout]);
        if (error) return { error: error.message };
        await Promise.race([this.afterSignIn(), timeout]);
        return this.meUser ? { ok: true } : { error: this.error || 'Could not load your workspace' };
      } catch (e) { return { error: 'Sign-in failed: ' + (e.message || e) }; }
    }
    const u = this.data.users.find(u => u.login.toLowerCase() === String(login).trim().toLowerCase() && u.pass === pass);
    if (!u) return { error: 'Wrong login or password.' };
    localStorage.setItem(SESSION, u.id); this.meUser = u; return { ok: true };
  },
  async logout() {
    if (REMOTE) {
      for (const k of ['channel', 'channelRv']) if (this[k]) { await this.sb.removeChannel(this[k]); this[k] = null; }
      await this.sb.auth.signOut(); this.data = { users: [], projects: [], seededFiles: true };
    }
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
    const proj = { id: 'p_' + uid(), files: [], messages: [], deliveries: [], read: {}, status: 'brief', progress: 0, stepDates: { brief: now }, createdAt: now, updatedAt: now, ...p };
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
      const paths = [
        ...p.files.filter(f => f.path).map(f => f.path),
        ...p.messages.filter(m => m.file && m.file.path).map(m => m.file.path),
        ...this.deliveries(p).flatMap(d => [d.path, d.poster]).filter(Boolean),
      ];
      if (paths.length) await this.sb.storage.from(BUCKET).remove(paths);
      const { error } = await this.sb.from('projects').delete().eq('id', id); if (error) throw error;
      await this.fetchAll(); return;
    }
    p.files.forEach(f => { if (!f.url) idb.del(f.id); });
    this.deliveries(p).forEach(d => { idb.del(d.id); idb.del(d.id + ':poster'); });
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
  // extra (reviews): { delivery: id, t: seconds into the video, event: 'sent' | 'approved' | 'changes' }
  sendMessage(projectId, from, text, file, extra) {
    const p = this.project(projectId);
    const m = { id: uid(), from, text, at: Date.now() }; if (file) m.file = file;
    if (extra) { if (extra.delivery) m.delivery = extra.delivery; if (extra.t != null) m.t = extra.t; if (extra.event) m.event = extra.event; }
    p.messages.push(m); p.read[from] = m.at; p.updatedAt = m.at;
    if (REMOTE) {
      const row = { id: m.id, project_id: projectId, from_id: from, text, file: file || null };
      // the review columns only when used: plain chat keeps working in a database without reviews.sql
      if (m.delivery) row.delivery_id = m.delivery;
      if (m.t != null) row.at_time = m.t;
      if (m.event) row.event = m.event;
      this.remoteWrite(this.sb.from('messages').insert(row), 'Message not sent');
    } else this.saveLocal();
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

  // ---- reviews: tests, previews and final renders sent by the creator, approved or sent back by the owner ----
  deliveries(p) { return (p && p.deliveries) || []; },
  delivery(id) { for (const p of this.data.projects) { const d = this.deliveries(p).find(x => x.id === id); if (d) return { d, p }; } return null; },
  allDeliveries(me) { return this.projects(me).flatMap(p => this.deliveries(p).map(d => ({ d, p }))).sort((a, b) => b.d.at - a.d.at); },
  latest(p) { return this.deliveries(p).reduce((a, d) => (!a || d.version > a.version ? d : a), null); },
  nextVersion(p) { return this.deliveries(p).reduce((n, d) => Math.max(n, d.version), 0) + 1; },
  toReview(me) {   // the number on the Reviews tab: what needs this person now
    if (me.role === 'owner') return this.allDeliveries(me).filter(x => x.d.status === 'pending').length;
    return this.projects(me).filter(p => { const d = this.latest(p); return d && d.status === 'changes'; }).length;
  },
  storageUsed() {  // bytes of everything uploaded through the manager (posters are a few KB each and not counted)
    return this.data.projects.reduce((n, p) => n + p.files.reduce((s, f) => s + (f.path ? f.size || 0 : 0), 0)
      + p.messages.reduce((s, m) => s + (m.file && m.file.path ? m.file.size || 0 : 0), 0)
      + this.deliveries(p).reduce((s, d) => s + (d.path ? d.size || 0 : 0), 0), 0);
  },
  // upload with progress (supabase-js has no progress events): the same request its upload() makes
  async uploadWithProgress(path, file, onProgress, setCancel) {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) throw new Error('You are signed out. Sign in again and retry.');
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${CFG.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${path}`);
      xhr.setRequestHeader('Authorization', 'Bearer ' + session.access_token);
      xhr.setRequestHeader('apikey', CFG.supabaseKey);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let msg = 'Upload failed (HTTP ' + xhr.status + ')';
        try { const j = JSON.parse(xhr.responseText); msg = j.message || j.error || msg; } catch (e) { /* not JSON */ }
        if (xhr.status === 413 || /maximum allowed size|too large/i.test(msg)) msg = `The file is larger than the storage allows (${MAX_UPLOAD_MB} MB). Export a lighter preview, or paste a link instead.`;
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error('The connection dropped during the upload. Try again.'));
      xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { cancelled: true }));
      if (setCancel) setCancel(() => xhr.abort());
      const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', file, file.name);
      xhr.send(fd);
    });
  },
  async createDelivery(projectId, { kind, note, file, link, media }, onProgress, setCancel) {
    const me = this.meUser; if (!this.project(projectId)) throw new Error('Project not found');
    const id = uid();
    const d = { id, projectId, version: this.nextVersion(this.project(projectId)), kind, note: note || '', name: file ? file.name : '', size: file ? file.size : 0, type: file ? (file.type || '') : '',
                path: null, poster: null, link: link || null, width: (media && media.width) || 0, height: (media && media.height) || 0, duration: (media && media.duration) || 0,
                status: 'pending', feedback: '', by: me.id, at: Date.now(), reviewedBy: null, reviewedAt: null };
    if (REMOTE) {
      if (file) {
        const path = `${projectId}/deliveries/${id}-${safeName(file.name)}`;
        await this.uploadWithProgress(path, file, onProgress, setCancel);
        d.path = path;
        if (media && media.poster) {
          const pp = `${projectId}/deliveries/${id}-poster.jpg`;
          const up = await this.sb.storage.from(BUCKET).upload(pp, media.poster, { contentType: 'image/jpeg' });
          if (!up.error) d.poster = pp;
        }
      }
      const row = { id, project_id: projectId, version: d.version, kind, note: d.note, name: d.name, size: d.size, type: d.type, path: d.path, poster: d.poster, link: d.link,
                    width: d.width || null, height: d.height || null, duration: d.duration || null, created_by: me.id };
      let { error } = await this.sb.from('deliveries').insert(row);
      if (error && error.code === '23505') {   // this version number was just taken: use the next free one
        await this.fetchAll(); row.version = d.version = this.nextVersion(this.project(projectId));
        ({ error } = await this.sb.from('deliveries').insert(row));
      }
      if (error) throw error;
    } else {
      if (file) { await idb.put(id, file); if (onProgress) onProgress(1); }
      if (media && media.poster) { await idb.put(id + ':poster', media.poster); d.poster = 'local'; }
    }
    const p = this.project(projectId);
    p.deliveries = p.deliveries || []; p.deliveries.push(d);
    this.sendMessage(projectId, me.id, d.note, null, { delivery: id, event: 'sent' });
    if (p.status !== 'done') this.updateProject(projectId, { status: 'review' }); else this.saveLocal();
    if (REMOTE) this.notify(id);
    return d;
  },
  reviewDelivery(id, status, feedback) {
    const hit = this.delivery(id); if (!hit) return null;
    const { d, p } = hit, me = this.meUser;
    Object.assign(d, { status, feedback: status === 'changes' ? (feedback || '') : d.feedback, reviewedBy: me.id, reviewedAt: Date.now() });
    if (REMOTE) this.remoteWrite(this.sb.from('deliveries').update({ status, feedback: d.feedback, reviewed_by: me.id, reviewed_at: new Date(d.reviewedAt).toISOString() }).eq('id', id), 'Review not saved');
    this.sendMessage(p.id, me.id, status === 'changes' ? (feedback || '') : '', null, { delivery: id, event: status });
    // the project follows the decision: an approved final completes it, anything else goes back to work
    if (status === 'approved' && d.kind === 'final') this.updateProject(p.id, { status: 'done', progress: 100 });
    else if (p.status === 'review') this.updateProject(p.id, { status: 'progress' });
    else this.saveLocal();
    return hit;
  },
  async removeDelivery(id) {
    const hit = this.delivery(id); if (!hit) return;
    const { d, p } = hit;
    if (REMOTE) {
      const { error } = await this.sb.from('deliveries').delete().eq('id', id); if (error) throw error;   // its chat entries go with it (on delete cascade)
      const paths = [d.path, d.poster].filter(Boolean);
      if (paths.length) await this.sb.storage.from(BUCKET).remove(paths);
    } else { await idb.del(id); await idb.del(id + ':poster'); }
    p.deliveries = this.deliveries(p).filter(x => x.id !== id);
    p.messages = p.messages.filter(m => m.delivery !== id);
    this.saveLocal();
  },
  async notify(id) {   // email the owner about a new version (api/notify.js); the review itself is already saved
    try {
      const { data: { session } } = await this.sb.auth.getSession(); if (!session) return;
      await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ id }) });
    } catch (e) { /* no email then */ }
  },
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
      files: [], deliveries: [], read: {}, stepDates: { brief: now - 6 * DAY, assets: now - 5 * DAY, progress: now - 4 * DAY }, createdAt: now - 6 * DAY, updatedAt: now - 2 * 3600e3,
      messages: [
        { id: 'm1', from: 'u_alex', text: 'Brief and assets are up. The logo must stay in the last 2 seconds. Ping me if anything is missing.', at: now - 6 * DAY + 3600e3 },
        { id: 'm2', from: 'u_jordan', text: 'Got everything, starting today.', at: now - 5 * DAY },
        { id: 'm3', from: 'u_jordan', text: 'Working on the first cut. Should be around 80% by tomorrow. Let me know if you want any specific text on screen.', at: now - 2 * 3600e3 },
      ] },
    { id: 'p_polaris', title: 'Brand Film — Polaris', client: 'Polaris', type: 'Brand film', priority: 'Normal', due: '2026-10-08', assignee: 'u_mia', status: 'review', progress: 90,
      brief: '<p>60-second brand film for the fintech launch. Clean, confident, lots of negative space.</p><p>Deliver 16:9 master plus 9:16 and 1:1 cutdowns.</p>',
      files: [], deliveries: [], read: {}, stepDates: { brief: now - 14 * DAY, assets: now - 13 * DAY, progress: now - 12 * DAY, review: now - DAY }, createdAt: now - 14 * DAY, updatedAt: now - DAY,
      messages: [{ id: 'm4', from: 'u_mia', text: 'v03 is in the folder, colour pass done. Waiting for your notes.', at: now - DAY }] },
    { id: 'p_orbit', title: 'Logo Animation — Orbit', client: 'Orbit Studio', type: 'Logo animation', priority: 'Low', due: '2026-10-20', assignee: 'u_jordan', status: 'brief', progress: 0,
      brief: '<p>Animate the Orbit logo: the ring should form from a single particle, 3 seconds, loopable end state.</p>',
      files: [], deliveries: [], read: {}, stepDates: { brief: now - DAY }, createdAt: now - DAY, updatedAt: now - DAY, messages: [] },
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
  currentRoute = { section: parts[1] || 'projects', arg: parts[2] || null, sub: parts[3] || null };   // sub: a time in the video (#manager/review/<id>/7.4)
  render();
}
function render() {
  const me = store.me(); if (!me) return route();
  const { section, arg } = currentRoute;
  let body = '', tab = section;
  if (section === 'p' && arg) { const p = store.project(arg); body = p ? viewProject(me, p) : viewEmpty('Project not found'); tab = 'projects'; }
  else if (section === 'review' && arg) { const hit = store.delivery(arg); body = hit ? viewReview(me, hit.d, hit.p) : viewEmpty('This version is not available any more.'); tab = 'reviews'; }
  else if (section === 'reviews') body = viewReviews(me);
  else if (section === 'tasks') body = viewTasks(me);
  else if (section === 'calendar') body = viewCalendar(me);
  else if (section === 'team' || section === 'people') { body = viewTeam(me); tab = 'team'; }
  else if (section === 'messages') body = viewMessages(me);
  else if (section === 'settings') body = viewSettings(me);
  else if (section === 'new') body = viewNewProject(me);
  else { body = viewProjects(me); tab = 'projects'; }
  const modal = $('#pm-modal', root);            // an open dialog (and its upload) survives the re-render
  root.innerHTML = viewShell(me, tab, body);
  if (modal) root.appendChild(modal);
  afterRender(me);
}
// live update without stealing the caret from the brief or the chat composer
function softRender() {
  if (currentRoute.section === 'review' && document.body.classList.contains('pm-open')) { if (!liveReview()) render(); return; }   // the player keeps playing
  const a = document.activeElement;
  const typing = a && (a.id === 'pm-brief' || (a.closest && a.closest('#pm-composer')));
  if (typing && currentRoute.section === 'p') {
    const p = store.project(currentRoute.arg), me = store.me(), msgs = $('#pm-messages');
    if (p && msgs && me) { msgs.innerHTML = p.messages.map(m => messageHtml(me, m)).join(''); msgs.scrollTop = msgs.scrollHeight; resolveThumbs(); }
    return;
  }
  if (document.body.classList.contains('pm-open')) render();
}

function viewNav(me, tab) {
  const unread = store.totalUnread(me), toReview = store.reviewsReady ? store.toReview(me) : 0;
  const nav = [
    ['projects', 'Projects', I.folder], ['reviews', 'Reviews', I.film], ['tasks', 'Tasks', I.check], ['calendar', 'Calendar', I.calendar],
    ...(me.role === 'owner' ? [['team', 'Team', I.team]] : []), ['messages', 'Messages', I.message], ['settings', 'Settings', I.settings],
  ];
  const badge = k => (k === 'messages' && unread ? unread : k === 'reviews' && toReview ? toReview : 0);
  return `<nav class="pm-nav">${nav.map(([k, l, ic]) => `<a href="#manager/${k}" class="${tab === k ? 'is-active' : ''}">${ic}<span>${l}</span>${badge(k) ? `<i class="badge">${badge(k)}</i>` : ''}</a>`).join('')}</nav>`;
}
function viewShell(me, tab, body) {
  const unread = store.totalUnread(me);
  const deco = currentRoute.section === 'p' ? 'PROJECT' : currentRoute.section === 'review' ? 'REVIEW' : tab.toUpperCase();
  return `
  <aside class="pm-side">
    <a class="pm-logo" href="#manager/projects"><img src="assets/logo.png" alt=""></a>
    ${viewNav(me, tab)}
    <div class="pm-side-foot">Create<br>Explore<br>Collaborate<i></i></div>
    <button class="pm-exit" data-action="exit">${I.back} Site</button>
  </aside>
  <div class="pm-main">
    <div class="pm-deco cond">${deco}</div>
    <div class="pm-deco-tag">Ideas<br>in motion</div>
    <header class="pm-top">
      <nav class="pm-tabs">
        <a href="#manager/projects" class="${tab === 'projects' ? 'is-active' : ''}">Projects</a>
        <a href="#manager/reviews" class="${tab === 'reviews' ? 'is-active' : ''}">Reviews</a>
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
  const a = store.user(p.assignee), un = store.unread(p, me), lv = store.latest(p);
  return `<a class="pm-card pcard" href="#manager/p/${p.id}">
    <div class="top"><div><h3 class="cond">${esc(p.title)}</h3><div class="sub">${esc(p.client || '')} &middot; ${statusLabel(p.status)}</div></div>
      <div class="mini-ring">${ring(p.progress, 44, 5)}<b>${p.progress}%</b></div></div>
    <div class="chips">${chipsFor(p)}</div>
    <div class="foot">${a ? `<span class="avatar">${initials(a.name)}</span>${esc(a.name)}` : '<span class="muted">Unassigned</span>'}<span>&middot; ${p.files.length} files</span>${lv ? `<span class="rv-st sm ${lv.status}" title="${RV_STATUS[lv.status]}">v${lv.version}</span>` : ''}${un ? `<span class="unread">${un} new</span>` : ''}</div>
  </a>`;
}
function viewProjects(me) {
  let list = store.projects(me);
  if (filter === 'active') list = list.filter(p => p.status !== 'done');
  if (filter === 'review') list = list.filter(p => p.status === 'review');
  if (filter === 'done') list = list.filter(p => p.status === 'done');
  return `<div class="pm-list-head"><h1 class="cond">${me.role === 'owner' ? 'All projects' : 'Assigned projects'}</h1>
    <div class="pm-filters">${[['all', 'All'], ['active', 'Active'], ['review', 'Review'], ['done', 'Done']].map(([k, l]) => `<button data-action="filter" data-v="${k}" class="${filter === k ? 'is-active' : ''}">${l}</button>`).join('')}</div>
    ${me.role === 'owner' ? `<a class="btn dark" href="#manager/new">${I.plus} New project</a>` : ''}</div>
    <div class="pgrid" id="pm-pgrid">${list.length ? list.map(p => projectCard(me, p)).join('') : `<div class="empty">${me.role === 'owner' ? 'No projects yet. Create the first one.' : 'Nothing assigned to you yet.'}</div>`}</div>`;
}
function viewTasks(me) {
  const list = store.projects(me).filter(p => p.status !== 'done');
  const groups = STATUSES.slice(0, 4).map(([k, l]) => [l, list.filter(p => p.status === k)]).filter(g => g[1].length);
  return `<div class="pm-list-head"><h1 class="cond">Open tasks</h1></div>
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
      ${reviewsCard(me, p)}
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
    ${m.delivery ? reviewMessageHtml(m) : `<div class="text">${esc(m.text)}</div>`}
    ${m.file ? `<a class="att" href="#" data-action="download" data-file="${m.file.id}">${isImg ? `<img data-src="${m.file.id}" alt="">` : I.doc}<span>${esc(m.file.name)}<small>${fmtSize(m.file.size)}</small></span></a>` : ''}
  </div></div>`;
}
// chat entries that belong to a version: sent / approved / changes requested, or a note at a moment of the video
function reviewMessageHtml(m) {
  const hit = store.delivery(m.delivery), d = hit && hit.d;
  const v = d ? 'v' + d.version : 'a removed version';
  const href = d ? `#manager/review/${d.id}${m.t != null ? '/' + m.t : ''}` : '#manager/reviews';
  if (m.event === 'sent') {
    return `<a class="rv-msg" href="${href}">${d && posterFile(d) ? `<img data-poster="${d.id}" alt="">` : `<span class="rv-msg-ico">${I.film}</span>`}<span><b>Sent ${d ? `${v} &middot; ${esc(kindLabel(d.kind))}` : v} for review</b>${m.text ? `<small>${esc(m.text)}</small>` : ''}</span></a>`;
  }
  if (m.event === 'approved') return `<div class="text"><a class="rv-pill approved" href="${href}">${I.tick} Approved ${v}</a></div>`;
  if (m.event === 'changes') return `<div class="text"><a class="rv-pill changes" href="${href}">${I.undo} Changes requested on ${v}</a>${m.text ? '\n' + esc(m.text) : ''}</div>`;
  return `<div class="text"><a class="rv-pill" href="${href}">${d ? v : '—'}${m.t != null ? ' &middot; ' + tc(m.t) : ''}</a> ${esc(m.text)}</div>`;
}
function messageSummary(m) {   // one line, for the Messages tab
  if (!m.delivery) return m.text || (m.file ? m.file.name : '');
  const hit = store.delivery(m.delivery), v = hit ? 'v' + hit.d.version : 'a version';
  if (m.event === 'sent') return `sent ${v} for review`;
  if (m.event === 'approved') return `approved ${v}`;
  if (m.event === 'changes') return `requested changes on ${v}` + (m.text ? ': ' + m.text : '');
  return `${v}${m.t != null ? ' at ' + tc(m.t) : ''}: ${m.text}`;
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
  <div class="threads">${list.length ? list.map(p => { const m = p.messages[p.messages.length - 1], u = store.user(m.from), un = store.unread(p, me); return `<a class="pm-card thread" href="#manager/p/${p.id}"><span class="avatar lg">${u ? initials(u.name) : '?'}</span><div><h3 class="cond">${esc(p.title)}</h3><div class="last"><b>${u ? esc(u.name) : ''}:</b> ${esc(messageSummary(m))}</div></div><div class="when">${ago(m.at)}${un ? `<br><span class="unread">${un} new</span>` : ''}</div></a>`; }).join('') : '<div class="empty">No conversations yet.</div>'}</div>`;
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
  </form>
  ${me.role === 'owner' ? storageCard() : ''}`;
}
const STORAGE_LIMIT_GB = 1;   // Supabase Free plan (Pro: 100 GB)
function storageCard() {
  const used = store.storageUsed(), k = Math.min(1, used / (STORAGE_LIMIT_GB * 1073741824));
  return `<section class="pm-card rv-storage">
    <h3 class="cond">Storage</h3>
    <div class="rv-meter ${k > 0.85 ? 'is-full' : ''}"><i style="width:${(k * 100).toFixed(1)}%"></i></div>
    <p><b>${fmtSize(used)}</b> of ${STORAGE_LIMIT_GB} GB used by project files, chat attachments and versions for review.</p>
    <p class="hint">Supabase Free plan: ${STORAGE_LIMIT_GB} GB in total, ${MAX_UPLOAD_MB} MB per file. Old versions can be deleted in Reviews to free space; the exact figure is in Supabase &rarr; Organization &rarr; Usage.</p>
  </section>`;
}

/* ---------- reviews: tests, previews and final renders ---------- */
let rvFilter = 'all';
const rvPill = d => `<span class="rv-st ${d.status}">${RV_STATUS[d.status]}</span>`;
function rvSetupNote(me) {
  return `<section class="pm-card rv-setup"><h3 class="cond">One step left</h3>
    <p>${me.role === 'owner'
      ? 'Reviews need a one-time database update. In Supabase open SQL Editor &rarr; New query, paste the whole file <code>supabase/reviews.sql</code> from the site folder and press Run. Then reload this page.'
      : 'Reviews are being set up by the owner. Until then, files can be shared in the project chat.'}</p></section>`;
}
function rvThumbInner(d) {
  const pf = posterFile(d), play = isVideo(d) ? '<span class="pm-play"></span>' : '';
  if (pf) return `<img data-poster="${d.id}" alt="">${play}`;
  if (d.link && !d.name) return `<span class="rv-ico">${I.link}<small>${esc(hostOf(d.link))}</small></span>`;
  return `<span class="rv-ico">${play || I.doc}</span>`;
}
function rvCard(d, p) {
  const u = store.user(d.by);
  return `<a class="pm-card rv-card" href="#manager/review/${d.id}">
    <div class="rv-thumb">${rvThumbInner(d)}<span class="rv-kind">${esc(kindLabel(d.kind))}</span>${d.duration ? `<span class="rv-len">${tc(d.duration).replace(/\.\d$/, '')}</span>` : ''}</div>
    <div class="rv-body">
      <div class="rv-line"><b class="cond">v${d.version}</b><span class="rv-proj">${esc(p.title)}</span></div>
      ${rvPill(d)}
      <div class="rv-by"><span class="avatar">${u ? initials(u.name) : '?'}</span>${u ? esc(u.name) : 'Unknown'} &middot; ${ago(d.at)}</div>
      ${d.note ? `<p class="rv-note">${esc(d.note)}</p>` : ''}
    </div></a>`;
}
function viewReviews(me) {
  const head = `<div class="pm-list-head"><h1 class="cond">Reviews</h1>`;
  if (!store.reviewsReady) return head + `</div>${rvSetupNote(me)}`;
  const owner = me.role === 'owner';
  let list = store.allDeliveries(me);
  if (rvFilter !== 'all') list = list.filter(x => x.d.status === rvFilter);
  const canSend = !owner && store.projects(me).some(p => p.status !== 'done');
  const empty = rvFilter !== 'all' ? 'Nothing here.'
    : owner ? 'Nothing sent yet. Tests, previews and final renders from the creators appear here.'
            : 'Nothing sent yet. &ldquo;Send for review&rdquo; shares a test, a preview or a final render.';
  return `${head}
    <div class="pm-filters">${[['all', 'All'], ['pending', 'Waiting'], ['changes', 'Changes'], ['approved', 'Approved']].map(([k, l]) => `<button data-action="rv-filter" data-v="${k}" class="${rvFilter === k ? 'is-active' : ''}">${l}</button>`).join('')}</div>
    ${canSend ? `<button class="btn dark" data-action="send-review">${I.upload} Send for review</button>` : ''}</div>
    <div class="rv-grid">${list.length ? list.map(({ d, p }) => rvCard(d, p)).join('') : `<div class="empty">${empty}</div>`}</div>`;
}
// the card on the project page
function reviewsCard(me, p) {
  const creator = me.role !== 'owner', list = store.deliveries(p).slice().sort((a, b) => b.version - a.version);
  return `<section class="pm-card" id="rv-card">
    <header class="card-head"><i class="ico">${I.film}</i><div><h3 class="cond">4. Previews &amp; renders</h3><p>${creator ? 'Send tests, previews and final renders for review' : 'Watch each version, leave notes on frames, approve'}</p></div>${list.length ? `<span class="aside">${list.length} version${list.length > 1 ? 's' : ''}</span>` : ''}</header>
    ${!store.reviewsReady ? rvSetupNote(me) : `<div class="rv-strip">
      ${creator && p.status !== 'done' ? `<button class="rv-add" data-action="send-review" data-project="${p.id}">${I.upload}<span>Send for review</span></button>` : ''}
      ${list.map(d => `<a class="rv-mini" href="#manager/review/${d.id}"><div class="rv-thumb">${rvThumbInner(d)}</div><b>v${d.version} &middot; ${esc(kindLabel(d.kind))}</b>${rvPill(d)}<small>${ago(d.at)}</small></a>`).join('')}
    </div>${!list.length && !creator ? '<div class="empty">Nothing sent yet.</div>' : ''}`}
  </section>`;
}

// one version: player, notes on frames, the decision
function rvPlayerHtml(d) {
  const mf = mainFile(d);
  if (mf && isVideo(d)) return `<video id="rv-video" playsinline controls preload="metadata"></video><div class="rv-fail" id="rv-fail" hidden>This format does not play in the browser. <a href="#" data-action="rv-download" data-id="${d.id}">Download it</a> to watch.</div>`;
  if (mf && isImage(d)) return `<img id="rv-image" alt="">`;
  if (mf) return `<div class="rv-linkcard">${I.doc}<b>${esc(d.name)}</b><small>${fmtSize(d.size)}</small><button class="btn" data-action="rv-download" data-id="${d.id}">${I.download} Download</button></div>`;
  if (d.link) return `<div class="rv-linkcard">${I.link}<b>${esc(hostOf(d.link))}</b><small>${esc(d.link)}</small><a class="btn" href="${esc(safeUrl(d.link))}" target="_blank" rel="noopener">${I.external} Open the link</a></div>`;
  return `<div class="rv-linkcard">${I.doc}<b>File not available</b></div>`;
}
function rvVersionsHtml(d, p) {
  const list = store.deliveries(p).slice().sort((a, b) => a.version - b.version);
  if (list.length < 2) return '';
  return list.map(x => `<a href="#manager/review/${x.id}" class="${x.id === d.id ? 'is-active' : ''}" title="${esc(kindLabel(x.kind))} &middot; ${RV_STATUS[x.status]}"><i class="dot ${x.status}"></i>v${x.version}</a>`).join('');
}
const rvNotes = (d, p) => p.messages.filter(m => m.delivery === d.id && !m.event);
function rvCommentsHtml(me, d, p) {
  const list = rvNotes(d, p).sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9) || a.at - b.at);   // in video order, general notes last
  if (!list.length) return `<div class="empty">${isVideo(d) && mainFile(d) ? 'No notes yet. Pause on a frame and write what to change.' : 'No notes yet.'}</div>`;
  return list.map(m => { const u = store.user(m.from); return `<div class="rv-c ${m.from === me.id ? 'me' : ''}"><span class="avatar">${u ? initials(u.name) : '?'}</span><div>
    <div class="who">${u ? esc(u.name) : 'Unknown'}<span>${ago(m.at)}</span></div>
    <div class="text">${m.t != null ? `<button class="rv-tc" data-action="rv-seek" data-t="${m.t}">${tc(m.t)}</button>` : ''}${esc(m.text)}</div></div></div>`; }).join('');
}
function rvMarksHtml(d, p, dur) {
  if (!dur) return '';
  return rvNotes(d, p).filter(m => m.t != null).map(m => `<button class="mark" style="left:${Math.min(100, m.t / dur * 100).toFixed(2)}%" data-action="rv-seek" data-t="${m.t}" title="${tc(m.t)} ${esc(m.text.slice(0, 80))}"></button>`).join('');
}
function rvActionsHtml(me, d, p) {
  const latest = store.latest(p), dl = mainFile(d) ? `<button class="btn" data-action="rv-download" data-id="${d.id}">${I.download} Download</button>` : '';
  const full = d.link && mainFile(d) ? `<a class="btn" href="${esc(safeUrl(d.link))}" target="_blank" rel="noopener">${I.external} Full quality</a>` : '';
  const feedback = d.status === 'changes' && d.feedback ? `<div class="rv-feedback"><b>Requested changes</b><p>${esc(d.feedback)}</p></div>` : '';
  if (me.role === 'owner') {
    return `<div class="rv-decide">
        <button class="btn rv-ok ${d.status === 'approved' ? 'is-on' : ''}" data-action="rv-approve">${I.tick} ${d.status === 'approved' ? 'Approved' : 'Approve'}</button>
        <button class="btn rv-no ${d.status === 'changes' ? 'is-on' : ''}" data-action="rv-changes">${I.undo} ${d.status === 'changes' ? 'Changes requested' : 'Request changes'}</button>
      </div>
      <form class="rv-changes" id="rv-changes-form" hidden><textarea placeholder="What should change in this version?" required></textarea>
        <div class="actions"><button type="button" class="btn small" data-action="rv-changes-cancel">Cancel</button><button class="btn dark small" type="submit">Send the request</button></div></form>
      ${feedback}
      ${d.kind === 'final' && d.status !== 'approved' ? '<p class="hint">Approving the final render marks the project as completed.</p>' : ''}
      <div class="rv-decide">${dl}${full}<button class="btn icon" data-action="rv-delete" title="Delete this version and its file">${I.trash}</button></div>`;
  }
  const again = d.status === 'changes' && latest && latest.id === d.id && p.status !== 'done'
    ? `<button class="btn dark" data-action="send-review" data-project="${p.id}" data-kind="${d.kind}">${I.upload} Send a new version</button>` : '';
  return `<div class="rv-state">${rvPill(d)}<small>${d.status === 'pending' ? 'Sent ' + ago(d.at) : d.reviewedAt ? 'Reviewed ' + ago(d.reviewedAt) : ''}</small></div>
    ${feedback}<div class="rv-decide">${again}${dl}${full}</div>`;
}
function viewReview(me, d, p) {
  store.markRead(p.id, me.id);
  const u = store.user(d.by), playable = isVideo(d) && !!mainFile(d);
  const facts = [d.width && d.height ? `${d.width}&times;${d.height}` : '', d.duration ? tc(d.duration) : '', d.size ? fmtSize(d.size) : ''].filter(Boolean).join(' &middot; ');
  return `
  <div class="pm-head">
    <a class="pm-back" href="#manager/p/${p.id}">${I.back} ${esc(p.title)}</a>
    <h1 class="pm-title cond">v${d.version} &middot; ${esc(kindLabel(d.kind))}</h1>
    <div class="chips"><span id="rv-status">${rvPill(d)}</span><span class="chip">${u ? esc(u.name) : 'Unknown'} &middot; ${fmtDate(d.at)}</span>${facts ? `<span class="chip">${facts}</span>` : ''}</div>
    <div class="rv-versions" id="rv-versions">${rvVersionsHtml(d, p)}</div>
  </div>
  <div class="rv-view" id="rv-live" data-delivery="${d.id}">
    <section class="pm-card rv-stage">
      <div class="rv-player">${rvPlayerHtml(d)}</div>
      ${playable ? `<div class="rv-bar" id="rv-bar"><i class="fill"></i><i class="head"></i><div class="marks" id="rv-marks"></div></div>
      <div class="rv-tools"><span class="rv-time" id="rv-time">0:00.0</span><span class="hint">Space play / pause &middot; &larr; &rarr; one frame &middot; click the bar or a note to jump</span></div>` : ''}
      ${d.note ? `<div class="rv-sentnote"><b>Note from ${u ? esc(u.name) : 'the creator'}</b><p>${esc(d.note)}</p></div>` : ''}
    </section>
    <aside class="pm-card rv-side">
      <div id="rv-actions">${rvActionsHtml(me, d, p)}</div>
      <h3 class="cond rv-fb-title">Notes</h3>
      <div class="rv-comments" id="rv-comments">${rvCommentsHtml(me, d, p)}</div>
      <form class="rv-composer" id="rv-composer">
        ${playable ? `<button type="button" class="rv-at is-on" data-action="rv-at" id="rv-at" title="Pin the note to this moment of the video">${I.clock}<span>0:00.0</span></button>` : ''}
        <textarea rows="1" placeholder="${playable ? 'A note on this frame…' : 'A note…'}"></textarea>
        <button class="send" type="submit" aria-label="Send">${I.send}</button>
      </form>
    </aside>
  </div>`;
}
// live update of an open version without touching the player (or text being typed)
function liveReview() {
  const hit = store.delivery(currentRoute.arg), me = store.me(), box = $('#rv-live');
  if (!hit || !me || !box || box.dataset.delivery !== hit.d.id) return false;
  const { d, p } = hit, set = (id, html) => { const el = $('#' + id); if (el) el.innerHTML = html; };
  set('rv-status', rvPill(d));
  set('rv-versions', rvVersionsHtml(d, p));
  const acts = $('#rv-actions'), a = document.activeElement;
  if (acts && !(acts.contains(a) && /^(TEXTAREA|INPUT)$/.test(a.tagName))) acts.innerHTML = rvActionsHtml(me, d, p);   // never under a half-written request
  set('rv-comments', rvCommentsHtml(me, d, p));
  const v = $('#rv-video'); set('rv-marks', rvMarksHtml(d, p, (v && Number.isFinite(v.duration) && v.duration) || d.duration));
  const nav = $('.pm-nav', root); if (nav) nav.outerHTML = viewNav(me, 'reviews');
  store.markRead(p.id, me.id);
  return true;
}
function wireReview() {
  const hit = store.delivery(currentRoute.arg); if (!hit) return;
  const { d, p } = hit, mf = mainFile(d), img = $('#rv-image'), v = $('#rv-video');
  if (img && mf) fileUrl(mf).then(u => { if (u) img.src = u; });
  const ta = $('#rv-composer textarea');
  if (ta) {
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#rv-composer').requestSubmit(); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
  }
  if (!v || !mf) return;
  const pf = posterFile(d);
  if (pf) fileUrl(pf).then(u => { if (u) v.poster = u; });
  fileUrl(mf).then(u => { if (u) v.src = u; else $('#rv-fail').hidden = false; });
  const bar = $('#rv-bar'), fill = $('.fill', bar), head = $('.head', bar), time = $('#rv-time'), at = $('#rv-at');
  const dur = () => (Number.isFinite(v.duration) && v.duration) || d.duration || 0;
  const paint = () => {
    const k = dur() ? Math.min(1, v.currentTime / dur()) : 0;
    fill.style.width = head.style.left = (k * 100).toFixed(3) + '%';
    time.textContent = tc(v.currentTime) + ' / ' + tc(dur());
    if (at) at.querySelector('span').textContent = tc(v.currentTime);
  };
  ['timeupdate', 'seeked', 'loadedmetadata'].forEach(ev => v.addEventListener(ev, paint));
  v.addEventListener('loadedmetadata', () => {
    $('#rv-marks').innerHTML = rvMarksHtml(d, p, dur());
    const t = parseFloat(currentRoute.sub); if (Number.isFinite(t)) v.currentTime = Math.min(t, dur());   // opened from a note in the chat
  }, { once: true });
  v.addEventListener('error', () => { $('#rv-fail').hidden = false; });
  const seekAt = e => { const r = bar.getBoundingClientRect(); v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur(); };
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('.mark')) return;
    e.preventDefault(); v.pause(); bar.setPointerCapture(e.pointerId); seekAt(e);
    const move = ev => seekAt(ev), up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  });
  if (ta) ta.addEventListener('focus', () => { if (!v.paused) v.pause(); });   // writing a note stops on the frame it is about
}

// "Send for review" dialog
let send = null;   // { projectId, kind, file, media, busy, cancel, urls }
function openSendDialog(projectId, kind) {
  const me = store.me(); if (!me || !store.reviewsReady) return;
  const projects = store.projects(me).filter(p => p.status !== 'done' || p.id === projectId);
  if (!projects.length) { toast('No open projects to send to'); return; }
  const pid = projectId && projects.some(p => p.id === projectId) ? projectId : projects[0].id;
  closeModal(true);
  send = { projectId: pid, kind: KINDS.some(k => k[0] === kind) ? kind : 'preview', file: null, media: null, busy: false, cancel: null, urls: [] };
  const box = document.createElement('div');
  box.className = 'pm-modal'; box.id = 'pm-modal';
  box.innerHTML = sendDialogHtml(projects);
  root.appendChild(box);
  const drop = $('#rv-drop'), input = $('#rv-file');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', e => pickDeliveryFile(e.dataTransfer.files[0]));
  input.addEventListener('change', () => { pickDeliveryFile(input.files[0]); input.value = ''; });
  const note = $('#rv-send-form textarea'); note && note.focus({ preventScroll: true });
}
function sendDialogHtml(projects) {
  const p = store.project(send.projectId);
  return `<form class="pm-card pm-dialog form" id="rv-send-form" novalidate role="dialog" aria-modal="true" aria-labelledby="rv-send-title">
    <header class="dlg-head"><div><h2 class="cond" id="rv-send-title">Send for review</h2><small id="rv-send-sub">${esc(p.title)} &middot; v${store.nextVersion(p)}</small></div>
      <button type="button" class="btn icon small" data-action="rv-close" aria-label="Close">${I.close}</button></header>
    ${projects.length > 1 ? `<label>Project<select data-action="rv-project">${projects.map(x => `<option value="${x.id}" ${x.id === send.projectId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label>` : ''}
    <div class="rv-kinds" role="radiogroup" aria-label="What is it?">${KINDS.map(([k, l, s]) => `<button type="button" role="radio" aria-checked="${k === send.kind}" class="${k === send.kind ? 'is-active' : ''}" data-action="rv-kind" data-v="${k}"><b>${l}</b><small>${s}</small></button>`).join('')}</div>
    <label class="dropzone rv-drop" id="rv-drop">${I.cloud}<span class="rv-drop-text" id="rv-drop-text">Drop the video or image here<br>or <u>browse files</u></span><input type="file" hidden id="rv-file"></label>
    <label>Link to the full-quality file <span class="opt">(optional: for files over ${MAX_UPLOAD_MB} MB, or instead of an upload)</span><input type="url" name="link" placeholder="Google Drive, Dropbox, WeTransfer, Vimeo…" autocomplete="off"></label>
    <label>Note<textarea name="note" placeholder="What is new in this version, and what should be checked?"></textarea></label>
    <div class="rv-progress" id="rv-progress" hidden><i></i></div>
    <p class="hint">Videos and images play right in the review; H.264 MP4 plays everywhere.${REMOTE ? ` Uploads up to ${MAX_UPLOAD_MB} MB.` : ''}</p>
    <div class="error" id="rv-send-error" role="alert"></div>
    <div class="actions"><button type="button" class="btn" data-action="rv-close">Cancel</button><button class="btn dark" type="submit" id="rv-send-btn">${I.send}<span>Send for review</span></button></div>
  </form>`;
}
function closeModal(force) {
  if (send && send.busy && !force) { if (!confirm('Stop the upload?')) return; if (send.cancel) send.cancel(); }
  if (send) send.urls.forEach(u => URL.revokeObjectURL(u));
  const m = $('#pm-modal', root); if (m) m.remove();
  send = null;
}
async function pickDeliveryFile(file) {
  if (!file || !send || send.busy) return;
  const s = send, err = $('#rv-send-error'), txt = $('#rv-drop-text');
  err.textContent = '';
  if (REMOTE && file.size > MAX_UPLOAD_MB * 1048576) {
    err.textContent = `${file.name} is ${fmtSize(file.size)}, uploads are limited to ${MAX_UPLOAD_MB} MB. Export a lighter preview (H.264 MP4), or put the file on Google Drive / Dropbox / WeTransfer and paste the link.`;
    return;
  }
  s.file = file; s.media = null;
  txt.innerHTML = `<b>${esc(file.name)}</b><small>${fmtSize(file.size)} &middot; reading…</small>`;
  const media = await probeMedia(file);
  if (send !== s || s.file !== file) return;           // closed, or another file picked meanwhile
  s.media = media;
  const facts = [media.width && media.height ? media.width + '&times;' + media.height : '', media.duration ? tc(media.duration) : '', fmtSize(file.size)].filter(Boolean).join(' &middot; ');
  const pic = media.poster || (isImage(file) ? file : null), url = pic ? URL.createObjectURL(pic) : null;
  if (url) s.urls.push(url);
  txt.innerHTML = `${url ? `<img src="${url}" alt="">` : ''}<b>${esc(file.name)}</b><small>${facts}</small><u>Choose another file</u>`;
  $('#rv-drop').classList.add('has-file');
}

/* ---------- behaviour ---------- */
function toast(t) { const el = $('#pm-toast'); if (!el) return; el.textContent = t; el.classList.add('is-on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('is-on'), 2200); }
function findFile(p, id) { return p && (p.files.find(f => f.id === id) || (p.messages.find(m => m.file && m.file.id === id) || {}).file); }
async function warmUrls(files) {   // remote: one request signs the links for a whole list of posters
  if (!REMOTE) return;
  const need = files.filter(f => f && f.path && !((urlCache.get(f.id) || {}).exp > Date.now()));
  if (!need.length) return;
  const { data } = await store.sb.storage.from(BUCKET).createSignedUrls(need.map(f => f.path), 3600);
  const byPath = Object.fromEntries((data || []).filter(r => r && r.signedUrl).map(r => [r.path, r.signedUrl]));
  need.forEach(f => { if (byPath[f.path]) urlCache.set(f.id, { url: byPath[f.path], exp: Date.now() + 50 * 60e3 }); });
}
async function resolveThumbs() {
  const p = store.project(currentRoute.arg);
  const posters = [...root.querySelectorAll('img[data-poster]')].map(img => { const hit = store.delivery(img.dataset.poster); return { img, f: hit && posterFile(hit.d) }; }).filter(x => x.f);
  const warm = warmUrls(posters.map(x => x.f)).catch(() => {});
  for (const img of root.querySelectorAll('img[data-src]')) { const f = findFile(p, img.dataset.src); if (f) { const u = await fileUrl(f); if (u) img.src = u; } }
  await warm;
  await Promise.all(posters.map(async ({ img, f }) => { const u = await fileUrl(f); if (u) img.src = u; }));
}
async function afterRender(me) {
  resolveThumbs();
  if (currentRoute.section === 'review') wireReview();
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

async function reviewAction(act, el, e, me) {
  const hit = store.delivery(el.dataset.id || currentRoute.arg); if (!hit) return;
  const { d, p } = hit;
  if (act === 'rv-download') {
    e.preventDefault();
    const f = mainFile(d), u = f && await fileUrl(f, true);
    if (!u) { toast('File is not available'); return; }
    const a = document.createElement('a'); a.href = u; a.download = d.name; if (REMOTE) a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  if (me.role !== 'owner') return;
  if (act === 'rv-approve') {
    if (d.status === 'approved') return;
    if (d.kind === 'final' && p.status !== 'done' && !confirm('Approve the final render? The project will be marked as completed.')) return;
    store.reviewDelivery(d.id, 'approved'); liveReview(); toast(`v${d.version} approved`);
    return;
  }
  if (act === 'rv-changes') { const f = $('#rv-changes-form'); if (f) { f.hidden = false; f.querySelector('textarea').focus(); } return; }
  if (act === 'rv-changes-cancel') { const f = $('#rv-changes-form'); if (f) f.hidden = true; return; }
  if (act === 'rv-delete') {
    if (!confirm(`Delete v${d.version} and its file? The notes on it go too. This cannot be undone.`)) return;
    try { await store.removeDelivery(d.id); go('#manager/p/' + p.id); setTimeout(() => toast(`v${d.version} deleted`), 80); }
    catch (err) { toast(err.message || 'Could not delete'); }
  }
}
async function submitDelivery(f) {
  const s = send; if (!s || s.busy) return;
  const fd = new FormData(f), err = $('#rv-send-error');
  const link = String(fd.get('link') || '').trim(), note = String(fd.get('note') || '').trim();
  err.textContent = '';
  if (!s.file && !link) { err.textContent = 'Add a file, or paste a link to it.'; return; }
  if (link && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(link)) { err.textContent = 'The link should be a full web address, starting with https://'; return; }
  if (s.file && !s.media) { err.textContent = 'One moment: the file is still being read.'; return; }
  s.busy = true;
  const btn = $('#rv-send-btn'), label = btn.querySelector('span'), bar = $('#rv-progress'), fill = bar.querySelector('i');
  btn.disabled = true; label.textContent = s.file ? 'Uploading… 0%' : 'Sending…';
  if (s.file) bar.hidden = false;
  try {
    const d = await store.createDelivery(s.projectId, { kind: s.kind, note, file: s.file, link, media: s.media },
      k => { fill.style.width = (k * 100).toFixed(1) + '%'; label.textContent = k >= 1 ? 'Saving…' : 'Uploading… ' + Math.round(k * 100) + '%'; },
      cancel => { s.cancel = cancel; });
    s.busy = false; closeModal(true);
    go('#manager/review/' + d.id);
    setTimeout(() => toast(`v${d.version} sent for review`), 80);
  } catch (ex) {
    s.busy = false;
    if (send !== s) return;                        // the dialog was closed: the upload was stopped on purpose
    btn.disabled = false; label.textContent = 'Send for review'; bar.hidden = true; fill.style.width = '0';
    if (!ex.cancelled) err.textContent = ex.message || String(ex);
  }
}
root.addEventListener('click', async e => {
  if (e.target.id === 'pm-modal') { closeModal(); return; }        // a click on the dimmed backdrop
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
  // reviews
  if (act === 'send-review') { e.preventDefault(); openSendDialog(el.dataset.project || (currentRoute.section === 'p' ? currentRoute.arg : null), el.dataset.kind); return; }
  if (act === 'rv-close') { closeModal(); return; }
  if (act === 'rv-kind' && send) {
    send.kind = el.dataset.v;
    root.querySelectorAll('#rv-send-form [data-action="rv-kind"]').forEach(b => { b.classList.toggle('is-active', b === el); b.setAttribute('aria-checked', String(b === el)); });
    return;
  }
  if (act === 'rv-filter') { rvFilter = el.dataset.v; render(); return; }
  if (act === 'rv-at') { el.classList.toggle('is-on'); return; }
  if (act === 'rv-seek') { const v = $('#rv-video'); if (v) { v.pause(); v.currentTime = +el.dataset.t; } return; }
  if (['rv-download', 'rv-approve', 'rv-changes', 'rv-changes-cancel', 'rv-delete'].includes(act)) { await reviewAction(act, el, e, me); return; }
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
  if (el.dataset.action === 'rv-project') {
    const pp = store.project(el.value); if (!send || !pp) return;
    send.projectId = pp.id; $('#rv-send-sub').innerHTML = `${esc(pp.title)} &middot; v${store.nextVersion(pp)}`;
    return;
  }
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
    let r;
    try { r = await store.login(fd.get('login'), fd.get('pass')); } catch (err) { r = { error: 'Sign-in failed: ' + (err.message || err) }; }
    if (r.ok) {
      const deep = /^#manager\/[a-z]/.test(location.hash) ? location.hash : '#manager/projects';   // a link from an email opens where it points
      if (location.hash !== deep) go(deep);
      route();
    } else { btn.disabled = false; btn.textContent = 'Sign in'; $('#pm-login-error').textContent = r.error; }
    return;
  }
  if (!me) return;
  if (f.id === 'rv-send-form') { e.preventDefault(); await submitDelivery(f); return; }
  if (f.id === 'rv-composer') {
    e.preventDefault(); const ta = f.querySelector('textarea'), text = ta.value.trim(); if (!text) return;
    const hit = store.delivery(currentRoute.arg); if (!hit) return;
    const v = $('#rv-video'), at = $('#rv-at');
    const t = v && at && at.classList.contains('is-on') ? Math.round(v.currentTime * 100) / 100 : null;
    store.sendMessage(hit.p.id, me.id, text, null, { delivery: hit.d.id, t });
    ta.value = ''; ta.style.height = ''; liveReview();
    return;
  }
  if (f.id === 'rv-changes-form') {
    e.preventDefault(); const ta = f.querySelector('textarea'), text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    const hit = store.delivery(currentRoute.arg); if (!hit || me.role !== 'owner') return;
    ta.blur(); store.reviewDelivery(hit.d.id, 'changes', text); liveReview(); toast('Changes requested');
    return;
  }
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
root.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#pm-modal', root) && !e.target.closest('input, textarea, [contenteditable]')) exitToSite(); });
// document level, because after a click on the bar or the page nothing inside the manager has focus
document.addEventListener('keydown', e => {
  if (!document.body.classList.contains('pm-open')) return;
  if (e.key === 'Escape' && $('#pm-modal', root)) { e.preventDefault(); closeModal(); return; }
  // the review player: Space plays / pauses, arrows step one frame (Shift: one second)
  if (currentRoute.section !== 'review' || $('#pm-modal', root) || (e.target.closest && e.target.closest('input, textarea, select, button, a, video, [contenteditable]'))) return;
  const v = $('#rv-video'); if (!v || !v.currentSrc) return;
  if (e.key === ' ') { e.preventDefault(); if (v.paused) v.play().catch(() => {}); else v.pause(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); v.pause();
    const step = (e.shiftKey ? 1 : FRAME) * (e.key === 'ArrowRight' ? 1 : -1), end = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.max(0, Math.min(end, v.currentTime + step));
  }
});

/* ---------- boot ---------- */
(async () => {
  addEventListener('hashchange', route);
  route();                 // shows "Loading…" if the manager is open at start
  await store.init();
  route();
})();
window.PM = { open: () => go('#manager'), close: exitToSite, store, remote: REMOTE };
