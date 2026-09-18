#!/usr/bin/env python3
"""Unthrottled frame throughput per scenario, no tracing (traces get huge at 1000+ fps). usage: thru.py <url> <label>"""
import json, os, shutil, subprocess, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bench import WS, CDP, CHROME, HERE, PORT, W, H, DSF, HARNESS, SCENARIOS, stats
url, label = sys.argv[1], sys.argv[2]
wanted = sys.argv[3:] or ['hero-mouse', 'hero-sweep', 'melt-sweep', 'menu-mouse', 'to-works-sweep', 'works-mouse', 'works-flip', 'works-clients-sweep', 'clients-mouse', 'clients-flip', 'clients-contact-sweep', 'contact-mouse']
prof = os.path.join(HERE, 'profile-thru-' + label); shutil.rmtree(prof, ignore_errors=True)
proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={prof}', f'--window-size={W},{H}', f'--force-device-scale-factor={DSF}', '--no-first-run', '--no-default-browser-check', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
out = {}
try:
    for _ in range(60):
        try:
            tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json')); page = [t for t in tabs if t.get('type') == 'page']
            if page: break
        except Exception: pass
        time.sleep(0.25)
    cdp = CDP(WS(page[0]['webSocketDebuggerUrl'])); cdp.call('Page.enable'); cdp.call('Runtime.enable')
    cdp.call('Page.navigate', {'url': url})
    for _ in range(120):
        time.sleep(0.25)
        if cdp.ev('document.body && document.body.classList.contains("is-ready")', False): break
    time.sleep(3.0); cdp.ev(HARNESS, False)
    for name in wanted:
        p, ms, body = SCENARIOS[name]
        cdp.ev(f'try {{ localStorage.removeItem("site.quality"); localStorage.removeItem("site.quality.v2"); }} catch (e) {{}} __site.QUALITY.tier = 0; __site.QUALITY.slowFrames = 0; __site.QUALITY.locked = true; window.__fl = 0; __goto({p})', False)
        time.sleep(1.6)
        # only count frames the page actually had to produce: idle waits (nothing changed on screen) show up as ~16.7 ms gaps
        r = cdp.ev(f'__bench({ms}, (k, el) => {{ {body} }})')
        d = [x for x in r['deltas'] if x < 250]
        busy = [x for x in d if x < 15.5]
        st = stats(d); sb = stats(busy) if busy else {}
        out[name] = {'all': st, 'busy': sb, 'idle_share': round(1 - len(busy) / max(1, len(d)), 3), 'tier': r['tier']}
        print(f"{name:24s} frames {st['n']:6d}  median {st['med']:6.2f} ms  p95 {st['p95']:6.2f}  mean {st['avg']:6.2f}  idle {out[name]['idle_share'] * 100:5.1f}%  tier {r['tier']}", flush=True)
finally:
    proc.terminate()
    try: proc.wait(5)
    except Exception: proc.kill()
    shutil.rmtree(prof, ignore_errors=True)
json.dump(out, open(os.path.join(HERE, f'thru-{label}.json'), 'w'), indent=1)
