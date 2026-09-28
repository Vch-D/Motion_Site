#!/usr/bin/env python3
"""The manager's REMOTE (Supabase) code paths against an in-page fake of supabase-js (fake-supabase.js): what exactly
would be written to the database and the storage, in a database with and without reviews.sql. Nothing leaves the page."""
import base64, json, os, shutil, subprocess, sys, time, urllib.request
sys.path.insert(0, '/Users/mp/Desktop/Motion Site/tools/perf')
from bench import WS, CDP, CHROME, PORT

HERE = os.path.dirname(os.path.abspath(__file__))
FAKE = open(os.path.join(HERE, 'fake-supabase.js')).read()
VIDEO = os.environ.get('TEST_VIDEO', '/Users/mp/Desktop/SPARTA/Render_New/Spartak/Claps_Spartak_V1.mp4')   # any short H.264 mp4
BASE = 'http://127.0.0.1:5173/'
FAILS = []
PID = '11111111-1111-4111-8111-111111111111'

def check(cond, label, extra=''):
    print(('  ok   ' if cond else '  FAIL ') + label + (('  | ' + (json.dumps(extra, ensure_ascii=False) if not isinstance(extra, str) else extra)) if extra != '' else ''), flush=True)
    if not cond: FAILS.append(label)

def session(scenario_js, fn):
    prof = os.path.join(HERE, 'profile-remote'); shutil.rmtree(prof, ignore_errors=True)
    proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={prof}', '--window-size=1500,950', '--no-first-run', '--no-default-browser-check', 'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json')); page = [t for t in tabs if t.get('type') == 'page']
                if page: break
            except Exception: pass
            time.sleep(0.25)
        cdp = CDP(WS(page[0]['webSocketDebuggerUrl']))
        for d in ('Page', 'Runtime', 'Log', 'DOM'): cdp.call(d + '.enable')
        cdp.call('Emulation.setFocusEmulationEnabled', {'enabled': True})
        cdp.call('Page.addScriptToEvaluateOnNewDocument', {'source': scenario_js + '''
            try { localStorage.removeItem("pm.demo"); } catch (e) {}
            window.confirm = () => true;
            window.__apiCalls = [];
            const f0 = window.fetch; window.fetch = function (u, o) { if (String(u).startsWith('/api/')) { window.__apiCalls.push({ url: String(u), auth: (o && o.headers && (o.headers.Authorization || o.headers.authorization)) || null, body: o && o.body }); return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })); } return f0.apply(this, arguments); };'''})
        cdp.call('Page.navigate', {'url': 'about:blank'}); time.sleep(0.3)
        cdp.call('Fetch.enable', {'patterns': [{'urlPattern': '*supabase-js@2/+esm*', 'requestStage': 'Request'}]})
        def pump():
            for m in list(cdp.events):
                if m.get('method') == 'Fetch.requestPaused' and not m.get('_done'):
                    m['_done'] = True
                    cdp.call('Fetch.fulfillRequest', {'requestId': m['params']['requestId'], 'responseCode': 200, 'body': base64.b64encode(FAKE.encode()).decode(),
                             'responseHeaders': [{'name': 'Content-Type', 'value': 'application/javascript'}, {'name': 'Access-Control-Allow-Origin', 'value': '*'}]})
        def js(expr):
            v = cdp.ev(expr, False); pump(); return v
        def wait_for(expr, timeout=12):
            t0 = time.time()
            while time.time() - t0 < timeout:
                try:
                    v = js(expr)
                    if v: return v
                except Exception: pass
                time.sleep(0.2)
            return None
        cdp.call('Page.navigate', {'url': BASE + '#manager/projects'})
        for _ in range(40):                                  # keep reading events: the fake module is served on request
            time.sleep(0.2)
            try: js('1')
            except Exception: pass
        fn(cdp, js, wait_for, pump)
        errs = [m for m in cdp.events if m.get('method') == 'Runtime.exceptionThrown' or (m.get('method') == 'Log.entryAdded' and m['params']['entry']['level'] == 'error')]
        for m in errs[:8]: print('   ERROR', json.dumps(m['params'])[:300])
        check(not errs, 'no script errors')
    finally:
        proc.terminate()
        try: proc.wait(5)
        except Exception: proc.kill()
        shutil.rmtree(prof, ignore_errors=True)

def log_of(js, pred):
    return js('window.__fakeLog.filter(e => ' + pred + ')')

# ------------------------------------------------------------------ A. database without reviews.sql
print('A. database without reviews.sql: nothing breaks')
def scenario_a(cdp, js, wait_for, pump):
    check(bool(wait_for('!!document.querySelector(".pm-main")', 15)), 'manager opens (signed in as the owner)')
    check(js('window.PM.remote === true && window.PM.store.reviewsReady === false'), 'remote mode, reviews recognised as not set up yet')
    chans = log_of(js, 'e.channel')
    check(len(chans) == 1 and chans[0]['channel'] == 'pm-live', 'only the existing live channel is opened', chans)
    js('location.hash = "#manager/reviews"'); time.sleep(0.6)
    check('reviews.sql' in (js('(document.querySelector(".rv-setup") || {}).textContent') or ''), 'Reviews tab explains the one-time SQL step')
    js(f'location.hash = "#manager/p/{PID}"'); time.sleep(0.8)
    check(bool(js('!!document.querySelector("#rv-card .rv-setup")')), 'project page card shows the same note')
    js('document.querySelector("#pm-composer input").focus()')
    cdp.call('Input.insertText', {'text': 'plain chat still works'})
    js('document.querySelector("#pm-composer").requestSubmit()'); time.sleep(0.6)
    ins = log_of(js, 'e.table === "messages" && e.op === "insert"')
    check(len(ins) == 1 and not any(k in ins[0]['payload'] for k in ('delivery_id', 'at_time', 'event')), 'a chat message is saved without the new columns', ins)
    toast = js('document.querySelector("#pm-toast").textContent')
    check(not toast or 'not sent' not in toast.lower(), 'no "Message not sent" error', toast)
session('window.__fake = { user: "owner", missing: ["deliveries"] };', scenario_a)

# ------------------------------------------------------------------ B. full database: creator sends, owner decides, deletes
print('B. with reviews.sql: the exact writes')
def scenario_b(cdp, js, wait_for, pump):
    check(bool(wait_for('!!document.querySelector(".pm-main")', 15)), 'manager opens (signed in as the creator)')
    chans = sorted(c['channel'] for c in log_of(js, 'e.channel'))
    check(chans == ['pm-live', 'pm-live-reviews'], 'live channels: the old one plus one for reviews', chans)
    js(f'location.hash = "#manager/p/{PID}"'); wait_for('!!document.querySelector("#rv-card .rv-add")', 8)
    js('document.querySelector("#rv-card .rv-add").click()'); wait_for('!!document.querySelector("#rv-file")', 5)
    doc = cdp.call('DOM.getDocument', {'depth': -1}); node = cdp.call('DOM.querySelector', {'nodeId': doc['root']['nodeId'], 'selector': '#rv-file'})
    cdp.call('DOM.setFileInputFiles', {'files': [VIDEO], 'nodeId': node['nodeId']})
    wait_for('!!document.querySelector("#rv-drop.has-file")', 10)
    js('document.querySelector("#rv-send-form textarea[name=note]").value = "First cut"')
    js('document.querySelector("#rv-send-form input[name=link]").value = "https://drive.google.com/file/d/master/view"')
    js('window.__progress = []; new MutationObserver(() => window.__progress.push(document.querySelector("#rv-send-btn span") && document.querySelector("#rv-send-btn span").textContent)).observe(document.querySelector("#rv-send-btn"), { subtree: true, childList: true, characterData: true })')
    js('document.querySelector("#rv-send-form").requestSubmit()')
    rid = wait_for('location.hash.startsWith("#manager/review/") ? location.hash.split("/")[2] : null', 10)
    check(bool(rid), 'the review page opens after the upload', rid)
    prog = js('window.__progress')
    check(any('50%' in (p or '') for p in prog), 'the button counts the upload in percent', prog[:6])
    x = log_of(js, 'e.xhr')
    ok_xhr = len(x) == 1 and x[0]['url'].endswith(f'/storage/v1/object/project-files/{PID}/deliveries/{rid}-Claps_Spartak_V1.mp4') and x[0]['headers'].get('Authorization', '').startswith('Bearer token-for-') and x[0]['headers'].get('apikey', '').startswith('sb_publishable_') and x[0]['headers'].get('x-upsert') == 'false' and x[0]['file']['size'] == 4400247
    check(ok_xhr, "upload goes to the private bucket under the project's folder, signed in as the creator", x)
    up = [e for e in log_of(js, 'e.storage === "upload"')]
    check(len(up) == 1 and up[0]['path'] == f'{PID}/deliveries/{rid}-poster.jpg' and up[0]['type'] == 'image/jpeg', 'poster frame uploaded next to it', up)
    ins = log_of(js, 'e.table === "deliveries" && e.op === "insert"')[0]['payload']
    want = {'id': rid, 'project_id': PID, 'version': 1, 'kind': 'preview', 'note': 'First cut', 'name': 'Claps_Spartak_V1.mp4', 'size': 4400247, 'type': 'video/mp4',
            'path': f'{PID}/deliveries/{rid}-Claps_Spartak_V1.mp4', 'poster': f'{PID}/deliveries/{rid}-poster.jpg', 'link': 'https://drive.google.com/file/d/master/view', 'width': 960, 'height': 960}
    check(all(ins.get(k) == v for k, v in want.items()) and abs(ins['duration'] - 5.04) < 0.1 and ins['created_by'] == '33333333-3333-4333-8333-333333333333' and 'status' not in ins,
          'deliveries row: every column as in reviews.sql, status left to the database default', {k: ins.get(k) for k in ('version', 'kind', 'width', 'height', 'duration', 'created_by')})
    msg = log_of(js, 'e.table === "messages" && e.op === "insert"')
    check(len(msg) == 1 and msg[0]['payload'].get('delivery_id') == rid and msg[0]['payload'].get('event') == 'sent' and 'at_time' not in msg[0]['payload'], 'chat entry "sent" linked to the version', msg[0]['payload'] if msg else None)
    pj = log_of(js, 'e.table === "projects" && e.op === "update"')
    check(pj and pj[-1]['payload'].get('status') == 'review', 'project set to Review', pj[-1]['payload'] if pj else None)
    api = js('window.__apiCalls')
    check(len(api) == 1 and api[0]['url'] == '/api/notify' and api[0]['auth'].startswith('Bearer token-for-') and json.loads(api[0]['body']) == {'id': rid}, 'the owner email is requested with the creator token', api)
    ready = wait_for('(() => { const v = document.querySelector("#rv-video"); return v && v.readyState >= 1 ? v.duration : null; })()', 8)
    check(bool(ready), 'the player streams the signed link', ready)
    # a note at a moment of the video
    js('document.querySelector("#rv-video").currentTime = 1.5'); time.sleep(0.4)
    js('document.querySelector("#rv-composer textarea").value = "hold 6 frames"'); js('document.querySelector("#rv-composer").requestSubmit()'); time.sleep(0.4)
    note = log_of(js, 'e.table === "messages" && e.op === "insert"')[-1]['payload']
    check(note.get('delivery_id') == rid and abs(note.get('at_time', -1) - 1.5) < 0.05 and 'event' not in note, 'timed note saved with delivery_id + at_time', note)
    # owner decides
    js('window.PM.store.logout().then(() => { window.__fake.user = "owner"; return window.PM.store.login("owner@example.test", "fake"); }).then(r => { window.__relog = r; location.hash = "#manager/projects"; setTimeout(() => { location.hash = "#manager/review/' + rid + '"; }, 150); })')
    wait_for('!!(window.__relog && window.__relog.ok && document.querySelector("[data-action=rv-approve]"))', 10)
    check(bool(js('!!document.querySelector("[data-action=rv-changes]")')), 'owner sees the decision buttons after signing in')
    js('document.querySelector("[data-action=rv-changes]").click()'); js('document.querySelector("#rv-changes-form textarea").value = "brighter end"')
    js('document.querySelector("#rv-changes-form").requestSubmit()'); time.sleep(0.4)
    upd = log_of(js, 'e.table === "deliveries" && e.op === "update"')
    p = upd[-1]['payload'] if upd else {}
    check(p.get('status') == 'changes' and p.get('feedback') == 'brighter end' and p.get('reviewed_by') == '22222222-2222-4222-8222-222222222222' and p.get('reviewed_at') and upd[-1]['filters'] == ['id=' + rid], 'decision written: status, feedback, reviewer, time (only this row)', upd[-1] if upd else None)
    ev = log_of(js, 'e.table === "messages" && e.op === "insert"')[-1]['payload']
    check(ev.get('event') == 'changes' and ev.get('text') == 'brighter end', 'chat entry "changes requested"', ev)
    # owner deletes the version: row first, then both files
    js('document.querySelector("[data-action=rv-delete]").click()'); time.sleep(0.8)
    dele = log_of(js, 'e.table === "deliveries" && e.op === "delete"')
    rem = log_of(js, 'e.storage === "remove"')
    check(dele and dele[-1]['filters'] == ['id=' + rid] and rem and sorted(rem[-1]['paths']) == sorted([want['path'], want['poster']]), 'delete removes the row, then the video and its poster', {'delete': dele[-1] if dele else None, 'remove': rem[-1] if rem else None})
    check(js('location.hash') == f'#manager/p/{PID}', 'back on the project page')
session('window.__fake = { user: "creator" };', scenario_b)

# ------------------------------------------------------------------ C. storage refuses a big file; D. two versions at the same moment
print('C/D. storage limit message, version number race')
def scenario_cd(cdp, js, wait_for, pump):
    wait_for('!!document.querySelector(".pm-main")', 15)
    js(f'location.hash = "#manager/p/{PID}"'); wait_for('!!document.querySelector("#rv-card .rv-add")', 8)
    js('window.__fake.uploadStatus = 413')
    js('document.querySelector("#rv-card .rv-add").click()'); wait_for('!!document.querySelector("#rv-file")', 5)
    doc = cdp.call('DOM.getDocument', {'depth': -1}); node = cdp.call('DOM.querySelector', {'nodeId': doc['root']['nodeId'], 'selector': '#rv-file'})
    cdp.call('DOM.setFileInputFiles', {'files': [VIDEO], 'nodeId': node['nodeId']})
    wait_for('!!document.querySelector("#rv-drop.has-file")', 10)
    js('document.querySelector("#rv-send-form").requestSubmit()'); time.sleep(0.8)
    err = js('document.querySelector("#rv-send-error").textContent')
    check('50 MB' in (err or '') and 'link' in (err or ''), 'a refused upload explains the 50 MB limit and suggests a link', err)
    check(bool(js('!!document.querySelector("#pm-modal") && !document.querySelector("#rv-send-btn").disabled')), 'the dialog stays open and can retry')
    js('window.__fake.uploadStatus = 0; window.__fake.raceOnce = true')
    js('document.querySelector("#rv-send-form").requestSubmit()')
    wait_for('location.hash.startsWith("#manager/review/")', 10)
    ins = log_of(js, 'e.table === "deliveries" && e.op === "insert"')
    check(len(ins) == 2 and ins[0]['payload']['version'] == 1 and ins[1]['payload']['version'] == 2, 'a taken version number is retried with the next one', [i['payload']['version'] for i in ins])
    check(js('document.querySelector(".pm-title").textContent') == 'v2 · Preview', 'the page shows v2')
    # big file picked while remote: refused before any upload
    js(f'location.hash = "#manager/p/{PID}"'); wait_for('!!document.querySelector("#rv-card .rv-add")', 8)
    js('document.querySelector("#rv-card .rv-add").click()'); wait_for('!!document.querySelector("#rv-file")', 5)
    js('(() => { const f = new File([new Uint8Array(51 * 1048576)], "master_4k.mov", { type: "video/quicktime" }); const dt = new DataTransfer(); dt.items.add(f); const drop = document.querySelector("#rv-drop"); drop.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); })()')
    time.sleep(0.4)
    err = js('document.querySelector("#rv-send-error").textContent')
    xhrs = len(log_of(js, 'e.xhr'))
    check('51.0 MB' in (err or '') and 'master_4k.mov' in (err or ''), 'a 51 MB file is refused as soon as it is dropped', err)
    js('document.querySelector("#rv-send-form").requestSubmit()'); time.sleep(0.3)
    check(len(log_of(js, 'e.xhr')) == xhrs, 'and nothing is uploaded')
session('window.__fake = { user: "creator" };', scenario_cd)

print('\nRESULT:', 'ALL PASSED' if not FAILS else f'{len(FAILS)} FAILED: ' + '; '.join(FAILS))
