#!/usr/bin/env python3
"""Capture the same states from two builds for a visual diff. usage: shots.py <url> <label>"""
import base64, json, os, shutil, subprocess, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bench import WS, CDP, CHROME, HERE, PORT, W, H, DSF

STATES = [
    ('clients', 6.0, None),
    ('clients-hover', 6.0, 'HOVER'),
    ('works', 5.0, None),
    ('works-next', 5.0, 'document.querySelector(".works .cbtn.next").click()'),
    ('works-half', 4.6, None),
    ('works-clients', 5.55, None),
    ('contact', 7.0, None),
    ('menu', 4.0, None),
    ('hero', 0.0, None),
    ('word-mid', 0.45, None),
    ('word-mid2', 2.35, None),
    ('melt', 3.5, None),
]

def main():
    url, label = sys.argv[1], sys.argv[2]
    out = os.path.join(HERE, 'shots-' + label); shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    prof = os.path.join(HERE, 'profile-shots-' + label); shutil.rmtree(prof, ignore_errors=True)
    proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={prof}', f'--window-size={W},{H}',
                             f'--force-device-scale-factor={DSF}', '--no-first-run', '--no-default-browser-check', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
                page = [t for t in tabs if t.get('type') == 'page']
                if page: break
            except Exception: pass
            time.sleep(0.25)
        cdp = CDP(WS(page[0]['webSocketDebuggerUrl']))
        cdp.call('Page.enable'); cdp.call('Runtime.enable')
        # same pseudo-random numbers in every run (the dust particles are scattered with Math.random)
        cdp.call('Page.addScriptToEvaluateOnNewDocument', {'source': '(() => { let a = 0x9e3779b9; window.__reseed = () => { a = 0x9e3779b9; }; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()'})
        cdp.call('Page.navigate', {'url': url})
        for _ in range(120):
            time.sleep(0.25)
            if cdp.ev('document.body && document.body.classList.contains("is-ready")', False): break
        time.sleep(3.0)
        # freeze everything time-based so both builds draw the same frame: fixed clock for the idle wobble, no ribbon drift
        cdp.ev('''(() => { const s = document.createElement("style"); s.textContent = "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }"; document.head.appendChild(s); })()''', False)
        # stop the frame loop and freeze the clock: every state is then drawn exactly once, at the same time stamp, in both builds
        cdp.ev('window.requestAnimationFrame = () => 0; performance.now = () => 600000; __reseed(); __site.relayout();', False)
        time.sleep(0.3)
        for name, p, js in STATES:
            cdp.ev(f'__reseed(); __site.relayout(); __site.lock = true; __site.jump({p});', False)
            time.sleep(0.5)
            if js == 'HOVER':
                pos = cdp.ev('''(() => { let best = null, bd = 1e9; document.querySelectorAll('.client').forEach(c => { const r = c.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - innerWidth / 2); if (getComputedStyle(c).visibility !== 'hidden' && d < bd) { bd = d; best = r; } }); return [best.left + best.width / 2, best.top + best.height * 0.4]; })()''', False)
                cdp.call('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': pos[0], 'y': pos[1]}); time.sleep(0.5)
            elif js: cdp.ev(js, False); time.sleep(0.5)
            cdp.ev(f'__site.jump({p})', False)
            time.sleep(0.5)
            r = cdp.call('Page.captureScreenshot', {'format': 'png'})
            open(os.path.join(out, name + '.png'), 'wb').write(base64.b64decode(r['data']))
            if js == 'HOVER': cdp.call('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': 3, 'y': 3})
            print('shot', name, flush=True)
    finally:
        proc.terminate()
        try: proc.wait(5)
        except Exception: proc.kill()
        shutil.rmtree(prof, ignore_errors=True)

if __name__ == '__main__':
    main()
