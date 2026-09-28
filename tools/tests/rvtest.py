#!/usr/bin/env python3
"""Reviews end to end in the manager's LOCAL demo mode (everything stays inside a throw-away headless Chrome profile):
creator sends a preview -> notes on frames -> owner requests changes -> creator sends v2 (image) -> owner approves
-> creator sends the final as a link -> owner approves the final -> project completed -> owner deletes v1."""
import base64, json, os, shutil, subprocess, sys, time, urllib.request
sys.path.insert(0, '/Users/mp/Desktop/Motion Site/tools/perf')
from bench import WS, CDP, CHROME, PORT

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots'); shutil.rmtree(SHOTS, ignore_errors=True); os.makedirs(SHOTS)
VIDEO = os.environ.get('TEST_VIDEO', '/Users/mp/Desktop/SPARTA/Render_New/Spartak/Claps_Spartak_V1.mp4')   # any short H.264 mp4
IMAGE = '/Users/mp/Desktop/Motion Site/assets/og-image.png'
BASE = 'http://127.0.0.1:5173/'
W, H = 1600, 1000
FAILS = []

def check(cond, label, extra=''):
    print(('  ok   ' if cond else '  FAIL ') + label + (('  | ' + str(extra)) if extra != '' else ''), flush=True)
    if not cond: FAILS.append(label)

prof = os.path.join(HERE, 'profile'); shutil.rmtree(prof, ignore_errors=True)
proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={prof}', f'--window-size={W},{H}',
                         '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'],
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
    cdp.call('Page.addScriptToEvaluateOnNewDocument', {'source': 'try { localStorage.setItem("pm.demo", "1"); if (!localStorage.getItem("pm.session")) localStorage.setItem("pm.session", "u_jordan"); } catch (e) {} window.confirm = () => true;'})

    def js(expr, wait=True): return cdp.ev(expr, wait)
    def wait_for(expr, timeout=12, step=0.2):
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                v = js(expr, False)
                if v: return v
            except Exception: pass
            time.sleep(step)
        return None
    def shot(name, clip=None):
        r = cdp.call('Page.captureScreenshot', {'format': 'png'})
        open(os.path.join(SHOTS, name + '.png'), 'wb').write(base64.b64decode(r['data']))
    def as_user(uid, hash_):
        js(f'localStorage.setItem("pm.session", "{uid}")', False)
        as_user.n = getattr(as_user, 'n', 0) + 1
        cdp.call('Page.navigate', {'url': f'{BASE}?as={uid}&n={as_user.n}{hash_}'})   # a new document, so the new session is read
        wait_for('document.body && document.body.classList.contains("pm-open") && !!document.querySelector(".pm-main")', 20)
        time.sleep(0.8)
        js('window.confirm = () => true', False)
    def set_file(sel, path):
        doc = cdp.call('DOM.getDocument', {'depth': -1, 'pierce': True})
        node = cdp.call('DOM.querySelector', {'nodeId': doc['root']['nodeId'], 'selector': sel})
        cdp.call('DOM.setFileInputFiles', {'files': [path], 'nodeId': node['nodeId']})
    def click_xy(x, y):
        for kind in ('mouseMoved', 'mousePressed', 'mouseReleased'):
            cdp.call('Input.dispatchMouseEvent', {'type': kind, 'x': x, 'y': y, 'button': 'none' if kind == 'mouseMoved' else 'left', 'clickCount': 1})
    def type_into(sel, text):
        js(f'document.querySelector({json.dumps(sel)}).focus()', False)
        cdp.call('Input.insertText', {'text': text})
    def key(k, code=None, shift=False):
        mods = 8 if shift else 0
        vk = {' ': 32, 'ArrowRight': 39, 'ArrowLeft': 37, 'Enter': 13, 'Escape': 27}[k]
        for t in ('rawKeyDown', 'keyUp'):
            cdp.call('Input.dispatchKeyEvent', {'type': t, 'key': k, 'code': code or ('Space' if k == ' ' else k), 'windowsVirtualKeyCode': vk, 'modifiers': mods, **({'text': ' '} if (k == ' ' and t == 'rawKeyDown') else {})})
        if k == 'Enter':
            pass

    # ---------------------------------------------------------------- 1. creator: project page, send a preview
    print('1. creator sends v1 (video preview)')
    cdp.call('Page.navigate', {'url': BASE + '#manager/p/p_arena'})
    wait_for('!!document.querySelector("#rv-card")', 20); time.sleep(1.0)
    js('window.confirm = () => true', False)
    check(js('!!document.querySelector("#rv-card .rv-add")', False), 'project page shows the "Send for review" tile for the creator')
    check(js('!!document.querySelector(".pm-nav a[href=\'#manager/reviews\']")', False), 'sidebar has the Reviews tab')
    js('document.querySelector("#rv-card").scrollIntoView({block: "center"})', False); time.sleep(0.4)
    shot('01-project-card-empty')
    js('document.querySelector("#rv-card .rv-add").click()', False)
    check(wait_for('!!document.querySelector("#pm-modal #rv-send-form")', 5), 'dialog opens')
    check(js('document.querySelector("#rv-send-sub").textContent', False) == 'Social Reel — Arena Tease · v1', 'dialog names the project and the version', js('document.querySelector("#rv-send-sub").textContent', False))
    js('document.querySelector("[data-action=rv-kind][data-v=test]").click()', False)
    check(js('document.querySelector("[data-action=rv-kind][data-v=test]").classList.contains("is-active")', False), 'kind switches to Test')
    js('document.querySelector("[data-action=rv-kind][data-v=preview]").click()', False)
    js('document.querySelector("#rv-send-form").requestSubmit()', False); time.sleep(0.3)
    check('Add a file' in (js('document.querySelector("#rv-send-error").textContent', False) or ''), 'sending without a file or link is refused with a hint')
    set_file('#rv-file', VIDEO)
    facts = wait_for('(() => { const s = document.querySelector("#rv-drop-text small"); return s && !/reading/.test(s.textContent) && document.querySelector("#rv-drop.has-file") ? s.textContent : null; })()', 12)
    check(bool(facts) and '960×960' in facts and '0:05' in facts, 'the picked video is read locally: size, length, poster', facts)
    check(js('!!document.querySelector("#rv-drop img") && document.querySelector("#rv-drop img").naturalWidth > 0', False) or bool(wait_for('document.querySelector("#rv-drop img") && document.querySelector("#rv-drop img").naturalWidth > 0', 4)), 'poster preview is shown in the dialog')
    type_into('#rv-send-form textarea[name=note]', 'First cut with the new music. Check the logo timing at the end.')
    time.sleep(0.2)
    shot('02-dialog-with-file')
    js('document.querySelector("#rv-send-form").requestSubmit()', False)
    rid = wait_for('location.hash.startsWith("#manager/review/") ? location.hash.split("/")[2] : null', 15)
    check(bool(rid), 'after sending, the review page of v1 opens', rid)
    check(wait_for('!document.querySelector("#pm-modal")', 3), 'dialog closed')
    ready = wait_for('(() => { const v = document.querySelector("#rv-video"); return v && v.readyState >= 1 && v.duration > 0 ? v.duration : null; })()', 10)
    check(bool(ready) and abs(ready - 5.04) < 0.2, 'the video loads in the player', ready)
    check(bool(wait_for('document.querySelector("#rv-video").poster', 4)), 'player has the poster frame')
    st = js('({ title: document.querySelector(".pm-title").textContent, status: document.querySelector("#rv-status").textContent, proj: window.PM.store.project("p_arena").status })', False)
    check(st['title'] == 'v1 · Preview' and st['status'] == 'Waiting for review' and st['proj'] == 'review', 'v1 is waiting for review, the project moved to Review', st)

    # ---------------------------------------------------------------- 2. notes on frames, keyboard
    print('2. notes on frames')
    bar = js('(() => { const r = document.querySelector("#rv-bar").getBoundingClientRect(); return [r.left, r.top + r.height / 2, r.width]; })()', False)
    click_xy(bar[0] + bar[2] * 0.4, bar[1]); time.sleep(0.4)
    t1 = js('document.querySelector("#rv-video").currentTime', False)
    check(abs(t1 - 5.04 * 0.4) < 0.3, 'clicking the bar jumps to that moment', round(t1, 2))
    check(js('document.querySelector("#rv-at span").textContent', False) == js('(() => { const s = document.querySelector("#rv-video").currentTime; return Math.floor(s / 60) + ":" + (s % 60).toFixed(1).padStart(4, "0"); })()', False), 'the note chip shows the current time')
    type_into('#rv-composer textarea', 'Logo pops in too early here: hold it 6 more frames.')
    key('Enter'); time.sleep(0.5)
    n = js('document.querySelectorAll("#rv-comments .rv-c").length', False)
    check(n == 1, 'Enter posts the note', n)
    check(bool(js('document.querySelector("#rv-comments .rv-tc") && document.querySelector("#rv-comments .rv-tc").textContent', False)), 'the note carries its timecode', js('document.querySelector("#rv-comments .rv-tc") && document.querySelector("#rv-comments .rv-tc").textContent', False))
    check(js('document.querySelectorAll("#rv-marks .mark").length', False) == 1, 'a marker appears on the bar')
    js('document.querySelector("#rv-video").currentTime = 4.2', False); time.sleep(0.4)
    js('document.querySelector("#rv-at").click()', False)   # general note, not pinned
    type_into('#rv-composer textarea', 'Overall: colours are great.')
    js('document.querySelector("#rv-composer").requestSubmit()', False); time.sleep(0.4)
    order = js('[...document.querySelectorAll("#rv-comments .rv-c .text")].map(t => t.textContent)', False)
    check(len(order) == 2 and order[-1].startswith('Overall'), 'general notes list after the timed ones', order)
    js('document.activeElement && document.activeElement.blur()', False)
    js('document.querySelector(".pm-main").click()', False)
    t_before = js('document.querySelector("#rv-video").currentTime', False)
    key('ArrowRight'); time.sleep(0.3)
    t_after = js('document.querySelector("#rv-video").currentTime', False)
    check(abs((t_after - t_before) - 0.04) < 0.02, 'Right arrow steps one frame', (round(t_before, 3), round(t_after, 3)))
    key(' '); time.sleep(0.6)
    playing = js('!document.querySelector("#rv-video").paused', False)
    key(' '); time.sleep(0.2)
    check(playing and js('document.querySelector("#rv-video").paused', False), 'Space plays and pauses')
    js('document.querySelector("#rv-video").currentTime = 1.6', False); time.sleep(0.5)
    shot('03-review-creator')
    chat = js('[...window.PM.store.project("p_arena").messages].slice(-3).map(m => [m.event || "note", m.delivery ? "linked" : "", m.t])', False)
    check(chat[0][0] == 'sent' and chat[1][0] == 'note' and chat[1][2] is not None and chat[2][2] is None, 'chat log: sent event, timed note, general note', chat)

    # ---------------------------------------------------------------- 3. owner: Reviews tab, request changes
    print('3. owner requests changes')
    as_user('u_alex', '#manager/reviews')
    badge = js('(document.querySelector(".pm-nav a[href=\'#manager/reviews\'] .badge") || {}).textContent', False)
    check(badge == '1', 'owner sees 1 waiting on the Reviews tab', badge)
    cards = js('document.querySelectorAll(".rv-grid .rv-card").length', False)
    check(cards == 1, 'Reviews page lists the version', cards)
    check(bool(wait_for('(() => { const i = document.querySelector(".rv-card img"); return i && i.naturalWidth > 0; })()', 5)), 'card shows the poster')
    shot('04-reviews-owner')
    js('document.querySelector(".rv-card").click()', False)
    wait_for('!!document.querySelector("#rv-video")', 8); time.sleep(0.8)
    check(js('!!document.querySelector("[data-action=rv-approve]") && !!document.querySelector("[data-action=rv-changes]")', False), 'owner gets Approve and Request changes')
    js('document.querySelector("[data-action=rv-changes]").click()', False); time.sleep(0.2)
    check(js('!document.querySelector("#rv-changes-form").hidden', False), 'Request changes opens a short form')
    type_into('#rv-changes-form textarea', 'Hold the logo longer and make the last shot 10% brighter.')
    js('document.querySelector("#rv-changes-form").requestSubmit()', False); time.sleep(0.5)
    st = js('({ status: document.querySelector("#rv-status").textContent, fb: (document.querySelector(".rv-feedback p") || {}).textContent, proj: window.PM.store.project("p_arena").status, badge: (document.querySelector(".pm-nav a[href=\'#manager/reviews\'] .badge") || {}).textContent || "" })', False)
    check(st['status'] == 'Changes requested' and st['fb'] and st['proj'] == 'progress' and st['badge'] == '', 'changes requested: status, feedback shown, project back In progress, badge cleared', st)
    shot('05-review-owner-changes')

    # ---------------------------------------------------------------- 4. creator: sees the request, sends v2 (image)
    print('4. creator sends v2')
    as_user('u_jordan', '#manager/reviews')
    badge = js('(document.querySelector(".pm-nav a[href=\'#manager/reviews\'] .badge") || {}).textContent', False)
    check(badge == '1', 'creator sees 1 on Reviews: changes to make', badge)
    js(f'location.hash = "#manager/review/{rid}"', False); wait_for('!!document.querySelector("#rv-actions")', 8); time.sleep(0.5)
    check(js('!!document.querySelector("[data-action=send-review][data-kind=preview]")', False), 'creator gets "Send a new version"')
    check(js('!document.querySelector("[data-action=rv-approve]")', False), 'creator cannot approve')
    js('document.querySelector("[data-action=send-review][data-kind=preview]").click()', False)
    wait_for('!!document.querySelector("#rv-send-form")', 5)
    check(js('document.querySelector("#rv-send-sub").textContent', False).endswith('v2'), 'the new version is v2')
    set_file('#rv-file', IMAGE)
    wait_for('document.querySelector("#rv-drop.has-file")', 8)
    type_into('#rv-send-form textarea[name=note]', 'Brighter end frame, logo held longer.')
    js('document.querySelector("#rv-send-form").requestSubmit()', False)
    rid2 = wait_for(f'location.hash.startsWith("#manager/review/") && location.hash.split("/")[2] !== "{rid}" ? location.hash.split("/")[2] : null', 15)
    check(bool(rid2), 'v2 review page opens', rid2)
    check(bool(wait_for('(() => { const i = document.querySelector("#rv-image"); return i && i.naturalWidth > 0; })()', 6)), 'the image shows in the viewer')
    vers = js('[...document.querySelectorAll("#rv-versions a")].map(a => a.textContent)', False)
    check(vers == ['v1', 'v2'], 'the version switcher lists v1 and v2', vers)

    # ---------------------------------------------------------------- 5. owner approves v2; creator sends the final as a link; owner approves it
    print('5. final render as a link, approved')
    as_user('u_alex', f'#manager/review/{rid2}')
    js('document.querySelector("[data-action=rv-approve]").click()', False); time.sleep(0.4)
    check(js('document.querySelector("#rv-status").textContent', False) == 'Approved', 'v2 approved')
    as_user('u_jordan', '#manager/p/p_arena')
    js('document.querySelector("#rv-card .rv-add").click()', False); wait_for('!!document.querySelector("#rv-send-form")', 5)
    js('document.querySelector("[data-action=rv-kind][data-v=final]").click()', False)
    type_into('#rv-send-form input[name=link]', 'not a link')
    js('document.querySelector("#rv-send-form").requestSubmit()', False); time.sleep(0.3)
    check('https://' in (js('document.querySelector("#rv-send-error").textContent', False) or ''), 'a bad link is refused')
    js('document.querySelector("#rv-send-form input[name=link]").value = ""', False)
    type_into('#rv-send-form input[name=link]', 'https://drive.google.com/file/d/abc123/view')
    js('document.querySelector("#rv-send-form").requestSubmit()', False)
    rid3 = wait_for(f'(() => {{ const id = location.hash.split("/")[2]; return location.hash.startsWith("#manager/review/") && id !== "{rid2}" && id !== "{rid}" ? id : null; }})()', 12)
    check(bool(rid3), 'v3 (final, link) created', rid3)
    check(js('(document.querySelector(".rv-linkcard a") || {}).href', False) == 'https://drive.google.com/file/d/abc123/view', 'the viewer offers the link')
    as_user('u_alex', f'#manager/review/{rid3}')
    check(js('document.querySelector(".rv-side .hint") && /completed/.test(document.querySelector(".rv-side .hint").textContent)', False), 'owner is told that approving the final completes the project')
    js('document.querySelector("[data-action=rv-approve]").click()', False); time.sleep(0.4)
    p = js('(() => { const p = window.PM.store.project("p_arena"); return { status: p.status, progress: p.progress }; })()', False)
    check(p == {'status': 'done', 'progress': 100}, 'approving the final completes the project (100%)', p)

    # ---------------------------------------------------------------- 6. chat, messages list, project card, delete, storage
    print('6. chat, lists, delete')
    js('location.hash = "#manager/p/p_arena"', False); wait_for('!!document.querySelector("#pm-messages")', 6); time.sleep(0.6)
    kinds = js('[...document.querySelectorAll("#pm-messages .rv-msg, #pm-messages .rv-pill")].map(e => e.textContent.trim().slice(0, 40))', False)
    check(len(kinds) >= 6, 'project chat shows the review events and notes', kinds)
    js('document.querySelector("#rv-card").scrollIntoView({block: "center"})', False); time.sleep(0.5)
    shot('06-project-card-versions')
    minis = js('document.querySelectorAll("#rv-card .rv-mini").length', False)
    check(minis == 3 and js('!document.querySelector("#rv-card .rv-add")', False), 'project card lists 3 versions; no send tile once the project is completed', minis)
    js('location.hash = "#manager/messages"', False); time.sleep(0.6)
    last = js('(document.querySelector(".thread .last") || {}).textContent', False)
    check(last and 'approved v3' in last, 'Messages tab summarises the last event', last)
    js(f'location.hash = "#manager/review/{rid}"', False); wait_for('!!document.querySelector("[data-action=rv-delete]")', 6)
    js('document.querySelector("[data-action=rv-delete]").click()', False)
    wait_for('location.hash === "#manager/p/p_arena"', 6); time.sleep(0.5)
    left = js('window.PM.store.deliveries(window.PM.store.project("p_arena")).map(d => d.version)', False)
    notes = js(f'window.PM.store.project("p_arena").messages.filter(m => m.delivery === "{rid}").length', False)
    check(left == [2, 3] and notes == 0, 'deleting v1 removes it and its notes', (left, notes))
    js('location.hash = "#manager/settings"', False); time.sleep(0.6)
    check(js('!!document.querySelector(".rv-storage .rv-meter")', False), 'owner settings show the storage meter')
    js('location.hash = "#manager/reviews"', False); time.sleep(0.8)
    shot('07-reviews-final')

    # ---------------------------------------------------------------- 7. phone width
    print('7. phone width')
    cdp.call('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 844, 'deviceScaleFactor': 2, 'mobile': True})
    js(f'location.hash = "#manager/review/{rid2}"', False); time.sleep(1.2)
    ov = js('document.documentElement.scrollWidth - innerWidth', False)
    check(ov <= 0, 'no sideways scrolling on a phone', ov)
    sizes = js('[...document.querySelectorAll("#rv-actions .btn")].map(b => getComputedStyle(b).fontSize)', False)
    check(sizes and all(x == '12px' for x in sizes), 'review buttons use their 12px size', sizes)
    shot('08-phone-review')
    js('location.hash = "#manager/p/p_orbit"', False); time.sleep(0.8)
    as_user('u_jordan', '#manager/p/p_orbit')
    js('document.querySelector("#rv-card .rv-add").click()', False); time.sleep(0.6)
    shot('09-phone-dialog')
    cdp.call('Emulation.clearDeviceMetricsOverride')

    # ---------------------------------------------------------------- 8. errors
    errs = [m for m in cdp.events if m.get('method') == 'Runtime.exceptionThrown' or (m.get('method') == 'Log.entryAdded' and m['params']['entry']['level'] == 'error' and '/api/contact' not in m['params']['entry'].get('url', ''))]
    for m in errs[:10]: print('   ERROR', json.dumps(m['params'])[:400])
    check(not errs, 'no script errors')
finally:
    proc.terminate()
    try: proc.wait(5)
    except Exception: proc.kill()
    shutil.rmtree(prof, ignore_errors=True)
print('\nRESULT:', 'ALL PASSED' if not FAILS else f'{len(FAILS)} FAILED: ' + '; '.join(FAILS))
