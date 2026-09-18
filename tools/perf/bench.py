#!/usr/bin/env python3
"""Frame-cost benchmark for the Motion Site.

Drives a headless Chrome (own throw-away profile, real GPU) through scripted scenarios
and reads a Chrome trace for each: main-thread style / layout / paint / JS time, raster
and GPU-process time, plus the page's own requestAnimationFrame intervals.

usage: bench.py <url> <label> [scenario ...]
"""
import base64, json, os, shutil, socket, struct, subprocess, sys, time, urllib.request

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 9333
W, H, DSF = 1728, 1000, 2


class WS:
    def __init__(self, url):
        hostport, path = url[5:].split('/', 1)
        host, port = hostport.split(':')
        self.s = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f'GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                        f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            buf += self.s.recv(4096)
        head, rest = buf.split(b'\r\n\r\n', 1)
        assert b'101' in head.split(b'\r\n')[0], head
        self.buf = bytearray(rest)

    def send(self, text):
        data = text.encode()
        hdr = bytearray([0x81])
        n = len(data)
        if n < 126: hdr.append(0x80 | n)
        elif n < 65536: hdr.append(0x80 | 126); hdr += struct.pack('>H', n)
        else: hdr.append(0x80 | 127); hdr += struct.pack('>Q', n)
        mask = os.urandom(4)
        hdr += mask
        self.s.sendall(bytes(hdr) + bytes(b ^ mask[i & 3] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(1 << 20)
            if not chunk: raise EOFError
            self.buf += chunk
        out = bytes(self.buf[:n]); del self.buf[:n]
        return out

    def recv(self):
        msg = b''
        while True:
            b0, b1 = self._read(2)
            fin, op, n = b0 & 0x80, b0 & 0x0f, b1 & 0x7f
            if n == 126: n = struct.unpack('>H', self._read(2))[0]
            elif n == 127: n = struct.unpack('>Q', self._read(8))[0]
            payload = self._read(n)
            if op == 0x8: raise EOFError
            if op in (0x9, 0xA): continue
            msg += payload
            if fin: return msg.decode('utf-8', 'replace')


class CDP:
    def __init__(self, ws):
        self.ws, self.id, self.events = ws, 0, []

    def call(self, method, params=None, timeout=120):
        self.id += 1
        mid = self.id
        self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
        t0 = time.time()
        while time.time() - t0 < timeout:
            m = json.loads(self.ws.recv())
            if m.get('id') == mid:
                if 'error' in m: raise RuntimeError(f'{method}: {m["error"]}')
                return m.get('result', {})
            self.events.append(m)
        raise TimeoutError(method)

    def ev(self, expr, await_promise=True):
        r = self.call('Runtime.evaluate', {'expression': expr, 'awaitPromise': await_promise, 'returnByValue': True})
        if 'exceptionDetails' in r: raise RuntimeError(json.dumps(r['exceptionDetails'])[:600])
        return r['result'].get('value')

    def trace(self, run):
        self.events = []
        self.call('Tracing.start', {'transferMode': 'ReportEvents', 'traceConfig': {
            'recordMode': 'recordAsMuchAsPossible',
            'includedCategories': ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'gpu', 'viz', 'cc']}})
        out = run()
        self.ws.send(json.dumps({'id': 999999, 'method': 'Tracing.end'}))
        evs = []
        while True:
            m = json.loads(self.ws.recv())
            if m.get('method') == 'Tracing.dataCollected': evs += m['params']['value']
            elif m.get('method') == 'Tracing.tracingComplete': break
        return out, evs


HARNESS = r'''
window.__bench = (ms, fn) => new Promise(res => {
  const deltas = [], work = []; let last = 0, t0 = 0, ts = 0;
  const ch = new MessageChannel();
  ch.port1.onmessage = () => work.push(performance.now() - ts);
  const frame = now => {
    if (!t0) t0 = now;
    if (last) deltas.push(now - last); last = now;
    const el = now - t0;
    try { fn(Math.min(1, el / ms), el); } catch (e) { console.error(e); }
    ts = now; ch.port2.postMessage(0);
    if (el < ms) requestAnimationFrame(frame);
    else setTimeout(() => res({ deltas, work, tier: window.__site && __site.QUALITY ? __site.QUALITY.tier : -1, t0: performance.timeOrigin + t0, t1: performance.timeOrigin + now }), 50);
  };
  requestAnimationFrame(frame);
});
window.__goto = p => { window.scrollTo(0, p * innerHeight); };
window.__sweep = (a, b) => (k) => { const e = 0.5 - 0.5 * Math.cos(k * Math.PI * 2); window.scrollTo(0, (a + (b - a) * e) * innerHeight); };
window.__mouse = (k, el) => { const x = innerWidth * (0.5 + 0.35 * Math.sin(el / 300)), y = innerHeight * (0.5 + 0.25 * Math.cos(el / 410));
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); };
'''

# name -> (settle progress, duration ms, js body run each frame with (k, el)), optional python-side hook
SCENARIOS = {
    'hero-rest':      (0.0, 3000, ''),
    'hero-mouse':     (0.0, 3000, '__mouse(k, el)'),
    'hero-sweep':     (0.0, 5000, '__sweep(0, 3)(k)'),
    'melt-sweep':     (3.0, 5000, '__sweep(3, 4)(k)'),
    'menu-rest':      (4.0, 3000, ''),
    'menu-mouse':     (4.0, 3000, '__mouse(k, el)'),
    'to-works-sweep': (4.0, 5000, '__sweep(4, 5)(k)'),
    'works-clients-sweep': (5.0, 5000, '__sweep(5, 6)(k)'),
    'works-rest':     (5.0, 3000, ''),
    'works-mouse':    (5.0, 3000, '__mouse(k, el)'),
    'works-flip':     (5.0, 5000, 'if (!window.__fl || el - window.__fl > 480 || el < window.__fl) { window.__fl = el; window.__dir = (window.__n = (window.__n || 0) + 1) % 4 < 2 ? ".works .cbtn.next" : ".works .cbtn.prev"; document.querySelector(window.__dir).click(); }'),
    'clients-rest':   (6.0, 4000, ''),
    'clients-mouse':  (6.0, 3000, '__mouse(k, el)'),
    'clients-flip':   (6.0, 5000, 'if (!window.__fl || el - window.__fl > 480 || el < window.__fl) { window.__fl = el; document.querySelector(".clients .cbtn.next").click(); }'),
    'clients-hover':  (6.0, 3000, ''),
    'clients-contact-sweep': (6.0, 5000, '__sweep(6, 7)(k)'),
    'contact-rest':   (7.0, 3000, ''),
    'contact-mouse':  (7.0, 3000, '__mouse(k, el)'),
}

NAMES_MAIN = ['FireAnimationFrame', 'FunctionCall', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'EventDispatch', 'HitTest', 'UpdateLayer', 'CompositeLayers']


def analyse(evs, t0_wall, t1_wall):
    # page renderer = the process with the most FireAnimationFrame events
    per_pid = {}
    for e in evs:
        if e.get('name') == 'FireAnimationFrame': per_pid[e['pid']] = per_pid.get(e['pid'], 0) + 1
    if not per_pid: return {'error': 'no frames in trace'}
    rpid = max(per_pid, key=per_pid.get)
    tids = {}
    for e in evs:
        if e.get('name') == 'thread_name' and e.get('pid') == rpid: tids[e['tid']] = e['args'].get('name', '')
    main = [t for t, n in tids.items() if n == 'CrRendererMain']
    main_tid = main[0] if main else None
    ts_all = sorted(e['ts'] for e in evs if e.get('pid') == rpid and e.get('name') == 'FireAnimationFrame')
    lo, hi = ts_all[0], ts_all[-1]
    ts = [t for i, t in enumerate(ts_all) if i == 0 or t - ts_all[i - 1] > 1500]
    span = (hi - lo) / 1000.0
    out = {'span_ms': round(span), 'frames': len(ts), 'fps': round(len(ts) / max(1e-6, span / 1000.0), 1)}
    sums, forced = {}, 0.0
    raf = sorted((e['ts'], e['ts'] + e.get('dur', 0)) for e in evs if e.get('pid') == rpid and e.get('name') == 'FireAnimationFrame' and e.get('ph') == 'X')
    import bisect
    starts = [r[0] for r in raf]
    raster = gpu = 0.0
    dropped = drawn = 0
    for e in evs:
        if e.get('ph') != 'X' or not (lo <= e.get('ts', 0) <= hi): continue
        n, d = e.get('name'), e.get('dur', 0) / 1000.0
        if e.get('pid') == rpid and e.get('tid') == main_tid and n in NAMES_MAIN:
            sums[n] = sums.get(n, 0.0) + d
            if n in ('UpdateLayoutTree', 'Layout'):
                i = bisect.bisect_right(starts, e['ts']) - 1
                if i >= 0 and raf[i][0] <= e['ts'] <= raf[i][1]: forced += d
        if n == 'RasterTask': raster += d
        if n == 'GPUTask': gpu += d
    for e in evs:
        if not (lo <= e.get('ts', 0) <= hi): continue
        if e.get('name') == 'DroppedFrame': dropped += 1
        if e.get('name') == 'DrawFrame' and e.get('pid') == rpid: drawn += 1
    if os.environ.get('BENCH_TOP'):
        names = {}
        for e in evs:
            if e.get('name') == 'thread_name': names[(e['pid'], e['tid'])] = e['args'].get('name', '')
        top = sorted((e for e in evs if e.get('ph') == 'X' and lo <= e.get('ts', 0) <= hi and e.get('name') not in ('RunTask', 'ThreadControllerImpl::RunTask', 'ThreadPool_RunTask', 'SimpleWatcher::OnHandleReady', 'Receive mojo message', 'Closure')),
                     key=lambda e: -e.get('dur', 0))[:int(os.environ['BENCH_TOP'])]
        for e in top:
            print(f"   {e.get('dur', 0) / 1000.0:9.2f} ms  @{(e['ts'] - lo) / 1000.0:8.1f}  {names.get((e['pid'], e['tid']), '?'):28s} {e.get('cat', '')[:40]:40s} {e['name']}", flush=True)
        agg = {}
        for e in evs:
            if e.get('ph') == 'X' and lo <= e.get('ts', 0) <= hi:
                k = (names.get((e['pid'], e['tid']), '?'), e['name']); agg[k] = agg.get(k, 0) + e.get('dur', 0) / 1000.0
        print('   --- totals ---')
        for k, v in sorted(agg.items(), key=lambda kv: -kv[1])[:int(os.environ['BENCH_TOP'])]:
            print(f"   {v:9.1f} ms  {k[0]:28s} {k[1]}", flush=True)
    f = max(1, len(ts))
    out['per_frame_ms'] = {k: round(v / f, 3) for k, v in sorted(sums.items(), key=lambda kv: -kv[1])}
    out['forced_style_layout_in_raf_ms'] = round(forced / f, 3)
    out['raster_ms'] = round(raster / f, 3)
    out['gpu_task_ms'] = round(gpu / f, 3)
    out['main_total_ms'] = round(sum(v for k, v in sums.items() if k not in ('FunctionCall',)) / f, 3)
    dr = sorted(e['ts'] for e in evs if e.get('name') == 'DrawFrame' and e.get('pid') == rpid and lo <= e.get('ts', 0) <= hi)
    gaps = [(b - a) / 1000.0 for a, b in zip(dr, dr[1:])]
    out['draw_gaps'] = {'n': len(dr), 'over25ms': sum(1 for g in gaps if g > 25), 'max': round(max(gaps), 1) if gaps else 0}
    gnames = {}
    for e in evs:
        if e.get('name') == 'thread_name': gnames[(e['pid'], e['tid'])] = e['args'].get('name', '')
    busy = {}
    for e in evs:
        if e.get('ph') == 'X' and lo <= e.get('ts', 0) <= hi and e.get('name') in ('RunTask', 'ThreadControllerImpl::RunTask'):
            th = gnames.get((e['pid'], e['tid']), '?')
            if th in ('CrGpuMain', 'VizCompositorThread', 'Compositor', 'CrRendererMain'): busy[th] = busy.get(th, 0.0) + e.get('dur', 0) / 1000.0
    out['busy_pct'] = {k: round(v / max(1.0, span) * 100, 1) for k, v in busy.items()}
    rr = sum(e.get('dur', 0) for e in evs if e.get('ph') == 'X' and lo <= e.get('ts', 0) <= hi and e.get('name') == 'RendererRasterWorker') / 1000.0
    sw = sum(e.get('dur', 0) for e in evs if e.get('ph') == 'X' and lo <= e.get('ts', 0) <= hi and e.get('name') == 'SkiaOutputSurfaceImplOnGpu::SwapBuffers') / 1000.0
    out['gpu_raster_pct'] = round(rr / max(1.0, span) * 100, 1)
    out['gpu_swapwait_pct'] = round(sw / max(1.0, span) * 100, 1)
    out['dropped'] = dropped
    out['drawn'] = drawn
    return out


def stats(a):
    if not a: return {}
    s = sorted(a); n = len(s)
    med = s[n // 2]
    return {'n': n, 'avg': round(sum(s) / n, 2), 'med': round(med, 2), 'p95': round(s[int(n * .95)], 2), 'p99': round(s[min(n - 1, int(n * .99))], 2),
            'max': round(s[-1], 2), 'long': sum(1 for x in s if x > med * 1.5)}


def main():
    url, label = sys.argv[1], sys.argv[2]
    wanted = sys.argv[3:] or list(SCENARIOS)
    prof = os.path.join(HERE, 'profile-' + label)
    shutil.rmtree(prof, ignore_errors=True)
    proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={prof}', f'--window-size={W},{H}',
                             f'--force-device-scale-factor={DSF}', '--no-first-run', '--no-default-browser-check', '--enable-gpu', '--ignore-gpu-blocklist',
                             *(['--disable-frame-rate-limit', '--disable-gpu-vsync'] if os.environ.get('BENCH_UNTHROTTLED') else []), '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    results = {'label': label, 'url': url, 'unthrottled': bool(os.environ.get('BENCH_UNTHROTTLED')), 'scenarios': {}}
    try:
        for _ in range(60):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
                page = [t for t in tabs if t.get('type') == 'page']
                if page: break
            except Exception:
                pass
            time.sleep(0.25)
        cdp = CDP(WS(page[0]['webSocketDebuggerUrl']))
        cdp.call('Page.enable'); cdp.call('Runtime.enable')
        page_errors = []
        _orig_append = cdp.events.append
        cdp.call('Page.navigate', {'url': url})
        for _ in range(120):
            time.sleep(0.25)
            if cdp.ev('document.body && document.body.classList.contains("is-ready")', False): break
        time.sleep(3.0)
        for m in cdp.events:
            if m.get('method') == 'Runtime.exceptionThrown': page_errors.append(json.dumps(m['params']['exceptionDetails'])[:400])
            if m.get('method') == 'Runtime.consoleAPICalled' and m['params'].get('type') in ('error', 'warning'): page_errors.append(m['params']['type'] + ': ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in m['params'].get('args', []))[:300])
        if page_errors: print('PAGE ERRORS:', *page_errors, sep='\n   ', flush=True)
        cdp.ev(HARNESS, False)
        if os.environ.get('BENCH_CSS'):
            cdp.ev('(() => { const s = document.createElement("style"); s.textContent = %s; document.head.appendChild(s); })()' % json.dumps(os.environ['BENCH_CSS']), False)
            time.sleep(1.0)
        results['env'] = cdp.ev('''(() => { const c = document.createElement('canvas').getContext('webgl'); const x = c && c.getExtension('WEBGL_debug_renderer_info');
            return { gpu: x ? c.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'n/a', vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, tier: __site.QUALITY.tier, hidden: document.hidden }; })()''', False)
        print('env', json.dumps(results['env']), flush=True)
        for name in wanted:
            p, ms, body = SCENARIOS[name]
            cdp.ev(f'localStorage.removeItem("site.quality"); __site.QUALITY.tier = 0; __site.QUALITY.slowFrames = 0; window.__fl = 0; __goto({p})', False)
            time.sleep(1.6)
            if name == 'clients-hover':
                pos = cdp.ev('''(() => { let best = null, bd = 1e9; document.querySelectorAll('.client').forEach(c => { const r = c.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - innerWidth / 2); if (getComputedStyle(c).visibility !== 'hidden' && d < bd) { bd = d; best = r; } }); return best ? [best.left + best.width / 2, best.top + best.height / 2] : null; })()''', False)
                if pos: cdp.call('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': pos[0], 'y': pos[1]})
            def run():
                return cdp.ev(f'__bench({ms}, (k, el) => {{ {body} }})')
            page_res, evs = cdp.trace(run)
            if name == 'clients-hover': cdp.call('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': 5, 'y': 5})
            if os.environ.get('BENCH_SAVE'):
                with open(os.path.join(HERE, f'trace-{label}-{name}.json'), 'w') as fh: json.dump(evs, fh)
            r = analyse(evs, page_res['t0'], page_res['t1'])
            r['raf_interval'] = stats(page_res['deltas'])
            r['frame_work'] = stats(page_res['work'])
            r['tier_after'] = page_res['tier']
            results['scenarios'][name] = r
            pf = r.get('per_frame_ms', {})
            print(f"{name:22s} frames {r.get('frames', 0):4d} fps {r.get('fps')}  raf avg {r['raf_interval'].get('avg')} p95 {r['raf_interval'].get('p95')} max {r['raf_interval'].get('max')} long {r['raf_interval'].get('long')}"
                  f" | main {r.get('main_total_ms')} (js {pf.get('FireAnimationFrame', 0)}, style {pf.get('UpdateLayoutTree', 0)}, layout {pf.get('Layout', 0)}, prepaint {pf.get('PrePaint', 0)}, paint {pf.get('Paint', 0)}, layerize {pf.get('Layerize', 0)}, commit {pf.get('Commit', 0)})"
                  f" forced {r.get('forced_style_layout_in_raf_ms')} | raster {r.get('raster_ms')} gpu {r.get('gpu_task_ms')} busy {r.get('busy_pct')} gpuRaster {r.get('gpu_raster_pct')}% swapWait {r.get('gpu_swapwait_pct')}% dropped {r.get('dropped')} draws {r.get('draw_gaps')} tier {r['tier_after']}", flush=True)
    finally:
        proc.terminate()
        try: proc.wait(5)
        except Exception: proc.kill()
        shutil.rmtree(prof, ignore_errors=True)
    with open(os.path.join(HERE, f'result-{label}{"-unthrottled" if os.environ.get("BENCH_UNTHROTTLED") else ""}.json'), 'w') as fh:
        json.dump(results, fh, indent=1)


if __name__ == '__main__':
    main()
