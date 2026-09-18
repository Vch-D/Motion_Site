#!/usr/bin/env python3
import base64, json, os, shutil, subprocess, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bench import WS, CDP, CHROME, HERE, PORT
A, B = sys.argv[1], sys.argv[2]
names = sys.argv[3:] or ['clients', 'clients-hover', 'works', 'works-next', 'works-half', 'works-clients', 'contact', 'menu', 'hero', 'word-mid', 'word-mid2', 'melt']
prof = os.path.join(HERE, 'profile-diff'); shutil.rmtree(prof, ignore_errors=True)
proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={prof}', '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json')); page = [t for t in tabs if t.get('type') == 'page']
            if page: break
        except Exception: pass
        time.sleep(0.25)
    cdp = CDP(WS(page[0]['webSocketDebuggerUrl'])); cdp.call('Page.enable'); cdp.call('Runtime.enable')
    cdp.call('Page.navigate', {'url': 'http://127.0.0.1:5176/diff.html'}); time.sleep(1.5)
    os.makedirs(os.path.join(HERE, 'shots-diff'), exist_ok=True)
    for n in names:
        r = cdp.ev(f'diff({json.dumps(n)}, {json.dumps(A)}, {json.dumps(B)})')
        open(os.path.join(HERE, 'shots-diff', f'{A}-{B}-{n}.png'), 'wb').write(base64.b64decode(r.pop('png')))
        print(json.dumps(r), flush=True)
finally:
    proc.terminate()
    try: proc.wait(5)
    except Exception: proc.kill()
    shutil.rmtree(prof, ignore_errors=True)
