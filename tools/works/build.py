#!/usr/bin/env python3
"""Encode the works for the site: one decode per source -> 720p + 480p H.264, poster WebP, tiny blur WebP.
Usage: python3 build.py [slug ...]   (ffmpeg from `pip3 install --user imageio-ffmpeg`; writes assets/works and built.json)"""
import json, os, re, subprocess, sys, time
from manifest import WORKS, SRC
FF = '/Users/mp/Library/Python/3.9/lib/python/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1'
OUT = '/Users/mp/Desktop/Motion Site/assets/works'
POSTER = {w['slug']: w['poster'] for w in WORKS}
os.makedirs(OUT, exist_ok=True)
only = sys.argv[1:]  # optional slugs

def probe(path):
    r = subprocess.run([FF, '-hide_banner', '-i', path], capture_output=True, text=True).stderr
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r); dur = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3))
    vl = re.search(r'Video: (.*)', r).group(1); wh = re.search(r'(\d{2,5})x(\d{2,5})', vl); fps = float(re.search(r'([\d.]+) fps', vl).group(1))
    return dict(dur=dur, w=int(wh.group(1)), h=int(wh.group(2)), fps=fps, audio='Audio:' in r)

def even(x): return int(round(x / 2)) * 2
def target(w, h, big):
    """720p / 480p box without upscaling: wide -> limit width, tall -> limit height."""
    ar = w / h
    if ar >= 16 / 9 - 0.01:
        tw = min(w, 1280 if big else 854); th = even(tw / ar); tw = even(tw)
    else:
        th = min(h, 720 if big else 480); tw = even(th * ar); th = even(th)
    return tw, th

manifest_out = []
for w in WORKS:
    if only and w['slug'] not in only: continue
    src = w['src'] if w['src'].startswith('/') else os.path.join(SRC, w['src'])
    p = probe(src); t0 = time.time()
    fps_out = 30 if p['fps'] >= 59 else (25 if p['fps'] >= 49 else p['fps'])
    w1, h1 = target(p['w'], p['h'], True); w2, h2 = target(p['w'], p['h'], False)
    o1 = os.path.join(OUT, w['slug'] + '.mp4'); o2 = os.path.join(OUT, w['slug'] + '-sm.mp4')
    x264 = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-x264-params', 'aq-mode=3', '-g', str(int(fps_out * 2)), '-movflags', '+faststart']
    aud = ['-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '48000'] if p['audio'] else ['-an']
    fc = f"[0:v]fps={fps_out},split=2[a][b];[a]scale={w1}:{h1}:flags=lanczos[v1];[b]scale={w2}:{h2}:flags=lanczos[v2]"
    cmd = [FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-filter_complex', fc,
           '-map', '[v1]', *(['-map', '0:a:0'] if p['audio'] else []), *x264, '-crf', '23', '-maxrate', '2600k', '-bufsize', '5200k', *aud, o1,
           '-map', '[v2]', *(['-map', '0:a:0'] if p['audio'] else []), *x264, '-crf', '25', '-maxrate', '1000k', '-bufsize', '2000k', *aud, o2]
    subprocess.run(cmd, check=True)
    # poster: 16:9-ish -> cover crop; otherwise the frame on its own blurred, darkened copy
    ar = p['w'] / p['h']; t = min(POSTER[w['slug']], max(p['dur'] - 0.2, 0))
    if abs(ar - 16 / 9) < 0.08:
        vf = 'scale=960:540:force_original_aspect_ratio=increase,crop=960:540'
    else:
        vf = 'split[a][b];[a]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,gblur=sigma=28,eq=brightness=-0.06:saturation=1.1[bg];[b]scale=960:540:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2'
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(t), '-i', src, '-frames:v', '1', '-vf', vf, '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6', os.path.join(OUT, w['slug'] + '.webp')], check=True)
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(t), '-i', src, '-frames:v', '1', '-vf', 'scale=48:27:force_original_aspect_ratio=increase,crop=48:27,gblur=sigma=2', '-c:v', 'libwebp', '-quality', '60', os.path.join(OUT, w['slug'] + '-blur.webp')], check=True)
    sz = lambda f: os.path.getsize(f) / 1e6
    rec = dict(slug=w['slug'], title=w['title'], client=w['client'], kind=w['kind'], dur=round(p['dur'], 1), w=w1, h=h1, loop=bool(w.get('loop')), audio=p['audio'], mb=round(sz(o1), 2), mb_sm=round(sz(o2), 2), poster_kb=round(os.path.getsize(os.path.join(OUT, w['slug'] + '.webp')) / 1e3))
    manifest_out.append(rec)
    print(f"{w['slug']:22} {p['w']}x{p['h']}@{p['fps']:.0f} -> {w1}x{h1}@{fps_out} {rec['mb']:.1f}MB ({rec['mb']*8/max(p['dur'],0.1):.2f} Mb/s) | sm {w2}x{h2} {rec['mb_sm']:.1f}MB | poster {rec['poster_kb']}KB | {time.time()-t0:.0f}s", flush=True)
json.dump(manifest_out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'built.json' if not only else 'built-partial.json'), 'w'), indent=1)
