// A stand-in for @supabase/supabase-js, loaded in place of the CDN module in a test browser. It keeps the tables in memory,
// records every call in window.__fakeLog, and answers the storage upload XHR itself. Nothing leaves the page.
const F = window.__fake || (window.__fake = {});
const log = window.__fakeLog = window.__fakeLog || [];
const now = () => new Date().toISOString();
const PROJECT = '11111111-1111-4111-8111-111111111111', OWNER = '22222222-2222-4222-8222-222222222222', CREATOR = '33333333-3333-4333-8333-333333333333';
const DB = window.__fakeDB = window.__fakeDB || {
  profiles: [
    { id: OWNER, email: 'owner@example.test', name: 'Owner', title: 'Owner', role: 'owner', created_at: now() },
    { id: CREATOR, email: 'jordan@example.test', name: 'Jordan', title: 'Motion designer', role: 'creator', created_at: now() },
  ],
  projects: [{ id: PROJECT, title: 'Arena Tease', client: 'Arena', type: 'Video', priority: 'Normal', due: '2026-10-10', assignee: CREATOR, status: 'progress', progress: 50, brief: '<p>Brief</p>', step_dates: {}, created_by: OWNER, created_at: now(), updated_at: now() }],
  project_files: [], messages: [], project_reads: [], deliveries: [],
};
const missing = new Set(F.missing || []);          // e.g. ['deliveries']: a database where reviews.sql has not run
const storage = window.__fakeStorage = window.__fakeStorage || {};
let current = F.user === 'owner' ? OWNER : F.user === 'creator' ? CREATOR : null;

class Q {
  constructor(t) { this.t = t; this.op = 'select'; this.filters = []; this.payload = null; this.one = false; this.maybe = false; this.ret = false; }
  select() { if (this.op !== 'select') this.ret = true; return this; }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  upsert(p) { this.op = 'upsert'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push([c, v, 'eq']); return this; }
  is(c, v) { this.filters.push([c, v, 'is']); return this; }
  order() { return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.maybe = true; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
  match(r) { return this.filters.every(([c, v, k]) => (k === 'is' ? (r[c] ?? null) === v : r[c] === v)); }
  exec() {
    log.push({ table: this.t, op: this.op, payload: this.payload == null ? null : JSON.parse(JSON.stringify(this.payload)), filters: this.filters.map(f => f[0] + '=' + f[1]) });
    if (missing.has(this.t)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${this.t}' in the schema cache` } };
    const rows = DB[this.t] || (DB[this.t] = []);
    if (this.op === 'select') { const out = rows.filter(r => this.match(r)); return { data: this.one || this.maybe ? out[0] || null : out, error: null }; }
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const r of list) {
        if (this.t === 'messages' && missing.has('deliveries') && ('delivery_id' in r || 'at_time' in r || 'event' in r)) return { data: null, error: { code: 'PGRST204', message: "Could not find the 'delivery_id' column of 'messages' in the schema cache" } };
        if (this.t === 'deliveries') {
          if (F.raceOnce) { F.raceOnce = false; rows.push({ ...r, id: 'phantom-' + Math.random(), note: 'sent at the same moment elsewhere', created_by: r.created_by, created_at: now(), status: 'pending' }); }
          if (rows.some(x => x.project_id === r.project_id && x.version === r.version)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "deliveries_project_id_version_key"' } };
        }
        rows.push({ created_at: now(), ...r, id: r.id || crypto.randomUUID(), ...(this.t === 'deliveries' ? { status: r.status || 'pending', feedback: r.feedback || '' } : {}) });
      }
      return { data: this.one ? rows[rows.length - 1] : list, error: null };
    }
    if (this.op === 'update') { const hit = rows.filter(r => this.match(r)); hit.forEach(r => Object.assign(r, this.payload)); return { data: this.ret ? hit : null, error: null }; }
    if (this.op === 'upsert') { const r = this.payload; const i = rows.findIndex(x => x.project_id === r.project_id && x.user_id === r.user_id); if (i >= 0) rows[i] = r; else rows.push(r); return { data: null, error: null }; }
    if (this.op === 'delete') {
      const keep = rows.filter(r => !this.match(r)), gone = rows.length - keep.length; DB[this.t] = keep;
      if (this.t === 'deliveries') DB.messages = DB.messages.filter(m => !m.delivery_id || keep.some(d => d.id === m.delivery_id));   // on delete cascade
      return { data: null, error: null, count: gone };
    }
    return { data: null, error: null };
  }
}

// the upload request pm.js sends itself (XMLHttpRequest with progress)
class FakeXHR {
  constructor() { this.upload = {}; this.headers = {}; this.status = 0; this.responseText = ''; }
  open(m, u) { this.method = m; this.url = u; }
  setRequestHeader(k, v) { this.headers[k] = v; }
  abort() { this.aborted = true; clearTimeout(this.t1); clearTimeout(this.t2); this.onabort && this.onabort(); }
  send(body) {
    const file = body && body.get ? body.get('') : null, path = decodeURIComponent(this.url.split('/storage/v1/object/project-files/')[1] || '');
    log.push({ xhr: true, url: this.url, path, headers: { ...this.headers }, cacheControl: body && body.get ? body.get('cacheControl') : null, file: file && { name: file.name, size: file.size, type: file.type } });
    const total = file ? file.size : 0;
    this.t1 = setTimeout(() => { this.upload.onprogress && this.upload.onprogress({ lengthComputable: true, loaded: total / 2, total }); }, 60);
    this.t2 = setTimeout(() => {
      if (F.uploadStatus) { this.status = F.uploadStatus; this.responseText = JSON.stringify({ statusCode: String(F.uploadStatus), error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }); }
      else { this.upload.onprogress && this.upload.onprogress({ lengthComputable: true, loaded: total, total }); this.status = 200; this.responseText = JSON.stringify({ Key: 'project-files/' + path }); if (file) storage[path] = URL.createObjectURL(file); }
      this.onload && this.onload();
    }, 160);
  }
}
window.XMLHttpRequest = FakeXHR;

export function createClient(url, key) {
  log.push({ createClient: url, key: key ? 'set' : 'missing' });
  const bucket = b => ({
    upload: async (path, blob, opts) => { log.push({ storage: 'upload', bucket: b, path, type: opts && opts.contentType, size: blob && blob.size }); storage[path] = URL.createObjectURL(blob); return { data: { path }, error: null }; },
    createSignedUrl: async (path, exp, opts) => { log.push({ storage: 'sign', path, download: !!(opts && opts.download) }); return { data: { signedUrl: storage[path] || null }, error: null }; },
    createSignedUrls: async (paths) => { log.push({ storage: 'signMany', paths }); return { data: paths.map(p => ({ path: p, signedUrl: storage[p] || null, error: null })), error: null }; },
    remove: async (paths) => { log.push({ storage: 'remove', paths }); paths.forEach(p => delete storage[p]); return { data: paths, error: null }; },
  });
  const user = () => { const p = DB.profiles.find(x => x.id === current); return p ? { id: p.id, email: p.email } : null; };
  return {
    from: t => new Q(t),
    rpc: name => { log.push({ rpc: name }); return Promise.resolve({ data: null, error: null }); },
    storage: { from: bucket },
    auth: {
      getSession: async () => ({ data: { session: current ? { access_token: 'token-for-' + current, user: user() } : null } }),
      getUser: async () => ({ data: { user: user() } }),
      signInWithPassword: async ({ email }) => { const p = DB.profiles.find(x => x.email === email); if (!p) return { error: { message: 'Invalid login credentials' } }; current = p.id; return { data: {}, error: null }; },
      signOut: async () => { current = null; return { error: null }; },
      updateUser: async () => ({ error: null }),
    },
    channel: name => { const ch = { name, binds: [], on(_, cfg) { this.binds.push(cfg.table); return this; }, subscribe() { log.push({ channel: name, tables: this.binds }); return this; } }; return ch; },
    removeChannel: async ch => { log.push({ removeChannel: ch.name }); },
  };
}
