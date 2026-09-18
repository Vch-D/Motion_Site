import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* =========================================================================
   CONFIG: everything you are likely to tweak lives here
   ========================================================================= */
const CONFIG = {
  // Logo source. A GLB model wins if set; otherwise the raster logo (black on transparent)
  // is turned into an inflated 3D relief, so holes and slits in the artwork survive.
  logoModel: 'assets/logo.glb',    // set to null to use the relief built from logoImage
  logoImage: 'assets/logo.png',
  relief: {
    resolution: 480,               // grid cells on the longer side (desktop)
    resolutionMobile: 340,
    radius: 0.085,                 // edge rounding radius, fraction of the grid size
    dome: 0.1,                     // extra gentle bulge of the flat middle (0 = flat)
  },

  logoHeight: 3.0,        // world units; the camera sees ~4.8 units of height
  logoOffsetY: 0.1,       // nudge up/down relative to the text line
  baseRotation: { x: -0.05, y: -0.28, z: -0.03 },
  tumble: { x: 1.4, y: 2.4, z: 0.6 },   // how much the logo turns around each axis while scrolling
  tilt: 0.25,                            // extra X tilt from scroll speed (max radians)

  // Dark chrome with a glassy clearcoat and a thin-film (oil-slick) sheen
  material: {
    color: 0x17171b, metalness: 1, roughness: 0.16,
    clearcoat: 1, clearcoatRoughness: 0.08,
    envMapIntensity: 2.0,
    iridescence: 0.5, iridescenceIOR: 1.5, iridescenceThicknessRange: [100, 400],
  },

  // Horizontal RGB split on the logo: at rest / added at full scroll speed / motion smear length
  aberration: { base: 0.0015, scroll: 0.008, smear: 0.02 },
  scrollEase: 10,   // how fast the page catches up with the scroll (higher = snappier)

  text: {
    width: 0.88,        // a word may take this fraction of the viewport width...
    widthMobile: 0.93,
    maxHeight: 0.6,     // ...but its font size is capped at this fraction of the viewport height
    shift: 0.3,         // how far (fraction of vw) a word slides during a change
    dwell: 0.2,         // last 20% of each scrolled screen: the word stays still
    blur: 6,            // px of blur on a letter as it leaves / arrives
  },
  dust: {
    stride: 58,         // font-size px per particle (smaller = denser)
    size: 2.6,          // particle size, px
    spread: 0.45,       // how far particles travel (fraction of vw)
    assemble: true,     // the arriving word assembles from particles too
  },

  // 5th screen: the main menu. Scroll progress 3 -> 4 melts the logo into a liquid-chrome stream.
  menu: {
    start: 3.05, end: 3.95,                       // progress range of the transformation
    leave: [4.05, 4.55],                          // menu UI fades out here (on the way to works)
    pour: [4.1, 4.95],                            // the stream pours away, works rises
    worksOut: [5.05, 5.7],                        // works slides up and out
    clients: [5.1, 5.95],                         // clients screen rises here
    clientsOut: [6.05, 6.7],                      // clients slides up and out
    contact: [6.1, 6.95],                         // contact screen rises here
    head: { pos: [0.05, 1.28, 0], rot: [0.06, -0.3, -0.04], scale: 0.62 },   // where the logo settles (world units)
    text: { lines: ['FROM', 'VISION', 'TO', 'MOTION'], font: '300 380px Inter, "Helvetica Neue", Arial, sans-serif', lineHeight: 0.92, size: 4.3, y: -0.05, z: 0.6, opacity: 0.86 },
    ribbons: [                                    // the liquid stream: three intertwined chrome ribbons
      { width: 0.90, radius: 0.36, x: -0.16, z:  0.05, phase: 0.0 },   // in front of the headline
      { width: 0.56, radius: 0.26, x:  0.30, z:  0.30, phase: 2.1 },   // in front
      { width: 0.46, radius: 0.20, x: -0.04, z: -1.05, phase: 4.2 },   // behind the headline: letters weave over it
    ],
    streamTop: 1.2, streamHeight: 4.8,
    liquid: {                                     // bright liquid chrome, half transparent so the headline reads through it
      color: 0xd2d2d8, metalness: 1, roughness: 0.07,
      clearcoat: 1, clearcoatRoughness: 0.05,
      envMapIntensity: 1.8, iridescence: 0.5, iridescenceIOR: 1.4, iridescenceThicknessRange: [120, 500],
      transparent: true, opacity: 0.72, depthWrite: false,
    },
  },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const easeOut = t => 1 - Math.pow(1 - t, 3);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const menuGrow = p => smooth(CONFIG.menu.start, CONFIG.menu.end, p);                       // liquid formed (stays 1 afterwards)
const menuAmount = p => menuGrow(p) * (1 - smooth(CONFIG.menu.leave[0], CONFIG.menu.leave[1], p));   // menu UI visible
const pourAmount = p => smooth(CONFIG.menu.pour[0], CONFIG.menu.pour[1], p);          // stream leaves, works enters
const worksOutAmount = p => smooth(CONFIG.menu.worksOut[0], CONFIG.menu.worksOut[1], p);
const clientsInAmount = p => smooth(CONFIG.menu.clients[0], CONFIG.menu.clients[1], p);
const clientsOutAmount = p => smooth(CONFIG.menu.clientsOut[0], CONFIG.menu.clientsOut[1], p);
const contactAmount = p => smooth(CONFIG.menu.contact[0], CONFIG.menu.contact[1], p);

/* =========================================================================
   Scroll state (no snapping: whatever you scroll, the page follows)
   ========================================================================= */
const root = document.documentElement;
const sections = document.querySelectorAll('.section');
const LAST = sections.length - 1;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// always start from the first word: don't let the browser restore an old scroll position on reload
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

let sectionH = window.innerHeight;
const scroll = { target: 0, current: 0, vel: 0, ab: 0 };
const readScroll = () => {
  if (window.__site && window.__site.lock) return;      // debug: hold a jumped state
  const t = window.scrollY / sectionH;
  scroll.target = Number.isFinite(t) ? clamp(t, 0, LAST) : 0;
};
addEventListener('scroll', readScroll, { passive: true });

const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', e => {
  mouse.tx = (e.clientX / innerWidth) * 2 - 1;
  mouse.ty = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });

const contactEl = document.querySelector('.contact');
const contactTitle = document.querySelector('.contact-title');
const worksEl = document.querySelector('.works');
const clientsEl = document.querySelector('.clients');
const clientsTitle = document.querySelector('.clients-title');
const navWork = document.querySelector('.menu a[href="#work"]'), navContact = document.querySelector('.menu a[href="#contact"]');
const worksTitle = document.querySelector('.works-title');
const wordsEl = document.getElementById('words');
const glowEl = document.querySelector('.logo-glow');
const introEls = [...document.querySelectorAll('.scroll-hint, .tagline')];
const menuEls = [...document.querySelectorAll('.side-menu, .note, .scroll-down')];
// Each variable is written on the element that uses it (not on :root, which would restyle the whole document
// every frame), and only when its value really changed.
function setVar(el, name, value) {
  const seen = el._vars || (el._vars = {});
  if (seen[name] === value) return;
  seen[name] = value;
  el.style.setProperty(name, value);
}
function updateCSS() {
  const p = scroll.current;
  // consumers saturate outside these ranges, so the clamped value draws the same picture and stops changing sooner
  const pIntro = clamp(p, 0, 0.4).toFixed(4);
  for (const el of introEls) setVar(el, '--p', pIntro);
  setVar(glowEl, '--p', clamp(p, 3, 3.5).toFixed(4));
  if (p < WORDS.length) setVar(wordsEl, '--ab', scroll.ab.toFixed(3));        // the letters' colour fringes; no letters beyond the last word
  const m = menuAmount(p), wIn = pourAmount(p), wOut = worksOutAmount(p), w = wIn * (1 - wOut);
  const clIn = clientsInAmount(p), clOut = clientsOutAmount(p), cl = clIn * (1 - clOut), c = contactAmount(p);
  const mStr = m.toFixed(3);
  for (const el of menuEls) setVar(el, '--menu', mStr);
  setVar(worksEl, '--works-in', wIn.toFixed(3));
  setVar(worksEl, '--works-out', wOut.toFixed(3));
  setVar(worksEl, '--works', w.toFixed(3));
  setVar(clientsEl, '--clients-in', clIn.toFixed(3));
  setVar(clientsEl, '--clients-out', clOut.toFixed(3));
  setVar(clientsEl, '--clients', cl.toFixed(3));
  setVar(contactEl, '--contact', c.toFixed(3));
  document.body.classList.toggle('is-menu', m > 0.5);
  document.body.classList.toggle('menu-live', m > 0.001);     // the menu UI has some opacity: its arrow animation runs
  document.body.classList.toggle('nav-hidden', m > 0.85);     // top-right links go only once the menu is established
  document.body.classList.toggle('is-works', w > 0.5);
  document.body.classList.toggle('is-clients', cl > 0.5);
  document.body.classList.toggle('is-contact', c > 0.5);
  clientsEl.classList.toggle('is-on', cl > 0.001);
  const wasOn = worksEl.classList.contains('is-on');
  worksEl.classList.toggle('is-on', w > 0.001);
  if (!wasOn && w > 0.001) layoutCarousel();
  contactEl.classList.toggle('is-on', c > 0.001);
  if (navWork) { navWork.classList.toggle('is-current', w > 0.5); navContact.classList.toggle('is-current', c > 0.5); }
}
function fitTitle(el, widthFrac, heightFrac) {
  sctx.font = fontString(100);
  const em = sctx.measureText(el.dataset.text).width / 100 + 0.16;
  el.style.fontSize = clamp(layout.vw * widthFrac / em, 40, layout.vh * heightFrac).toFixed(1) + 'px';
}
// Contact links: drop the page down to the contact screen quickly
function scrollToProgress(p, ms = 650) {
  const from = window.scrollY, to = p * sectionH, t0 = performance.now();
  const step = now => {
    const k = clamp((now - t0) / ms, 0, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    window.scrollTo(0, from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
document.querySelectorAll('a[href="#contact"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); scrollToProgress(LAST); }));
document.querySelectorAll('a[href="#work"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); scrollToProgress(LAST - 2); }));
document.querySelectorAll('a[href="#clients"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); scrollToProgress(LAST - 1); }));
document.querySelectorAll('a[href="#top"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); scrollToProgress(0); }));
document.querySelectorAll('a[href="#manager"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); location.hash = '#manager'; }));   // opens the Project Manager (pm.js)

/* =========================================================================
   Clients ribbon: drifts left-to-right on its own, pauses on hover, drag / arrows / dots / keys
   ========================================================================= */
// Floor reflections: each card's content moves into a .refl-face, and a flipped, faded copy (.refl-mirror) goes under it.
// (Replaces -webkit-box-reflect, which re-runs a GPU filter per card on every frame.)
function addMirror(card) {
  const face = document.createElement('div'); face.className = 'refl-face';
  while (card.firstChild) face.appendChild(card.firstChild);
  const mirror = face.cloneNode(true); mirror.className = 'refl-mirror';
  mirror.setAttribute('aria-hidden', 'true'); mirror.inert = true;
  mirror.querySelectorAll('button, a, input, video').forEach(el => { el.tabIndex = -1; });   // browsers without `inert`
  card.append(mirror, face);                                        // mirror first: the card's shadow falls over it
}
document.querySelectorAll('.work, .client').forEach(addMirror);

const ribbon = document.getElementById('ribbon');
const clientCards = [...document.querySelectorAll('.client')];
const clientDots = document.getElementById('clientDots');
const RIB = { spacing: 1.12, speed: 0.12, tilt: 9, yaw: 16, sag: 0.08, bump: 0.16 };   // speed: cards per second
const rib = { offset: 0, target: 0, drag: null, moved: false, paused: false, resumeAt: 0, lastIdx: -1 };
clientCards.forEach((_, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Client ' + (i + 1));
  b.addEventListener('click', () => ribbonGo(i)); clientDots.appendChild(b);
});
let clientW = 0;                       // measured once per layout (relayout), not per frame: reading a computed style forces a style + layout pass
function measureClientWidth() {
  const w = parseFloat(getComputedStyle(clientCards[0]).width);
  if (Number.isFinite(w) && w > 0) { clientW = w; return; }
  const vw = layout.vw || innerWidth;
  clientW = vw <= 640 ? vw * 0.44 : clamp(vw * (vw <= 900 ? 0.26 : 0.14), 120, 200);
}
function clientWidth() { if (!clientW) measureClientWidth(); return clientW; }
function ribbonGo(i) {                 // bring card i to the centre by the shortest way round
  const n = clientCards.length;
  const cur = Math.round(rib.target), k = Math.round((cur - i) / n);
  rib.target = i + k * n; rib.resumeAt = performance.now() / 1000 + 3;
}
function layoutRibbon(dt, t) {
  const n = clientCards.length, cw = clientWidth(), S = cw * RIB.spacing, L = n * S;
  if (rib.drag === null) {
    if (!rib.paused && t > rib.resumeAt) rib.target -= RIB.speed * dt;      // cards drift to the right
    rib.offset = damp(rib.offset, rib.target, 8, dt);
  }
  const halfW = (layout.vw || innerWidth) / 2, cull = halfW + cw;
  for (let i = 0; i < n; i++) {
    const card = clientCards[i];
    const x = (((i - rib.offset) * S) % L + L) % L - L / 2;                // wrap around the ring
    const hidden = Math.abs(x) > cull;
    if (card._hidden !== hidden) { card._hidden = hidden; card.style.visibility = hidden ? 'hidden' : ''; }
    if (hidden) continue;
    const nx = x / halfW, near = Math.max(0, 1 - Math.abs(x) / S);
    card.style.transform = `translateX(${x.toFixed(1)}px) translateY(${(nx * nx * RIB.sag * cw).toFixed(1)}px) rotateY(${(-nx * RIB.yaw).toFixed(2)}deg) rotateZ(${(nx * RIB.tilt).toFixed(2)}deg) scale(${(1 + RIB.bump * near * near).toFixed(3)})`;
    // nearer the centre = on top. Ranked in half-card steps: the order between neighbours is the same as with a
    // pixel-based z-index, but the value changes every few seconds instead of ~15 times a second (each change re-sorts the layers)
    const z = 100 - Math.floor(Math.abs(x) / (S / 2));
    if (card._z !== z) { card._z = z; card.style.zIndex = String(z); }
  }
  const idx = ((Math.round(rib.offset) % n) + n) % n;
  if (idx !== rib.lastIdx) { rib.lastIdx = idx; for (let i = 0; i < n; i++) clientDots.children[i].classList.toggle('is-active', i === idx); }
}
clientsEl.querySelector('.cbtn.prev').addEventListener('click', () => { rib.target = Math.round(rib.target) - 1; rib.resumeAt = performance.now() / 1000 + 3; });
clientsEl.querySelector('.cbtn.next').addEventListener('click', () => { rib.target = Math.round(rib.target) + 1; rib.resumeAt = performance.now() / 1000 + 3; });
ribbon.addEventListener('pointerenter', () => { rib.paused = true; });
ribbon.addEventListener('pointerleave', () => { rib.paused = false; rib.resumeAt = performance.now() / 1000 + 1; });
ribbon.addEventListener('pointerdown', e => { e.preventDefault(); rib.drag = { x: e.clientX, off: rib.offset }; rib.moved = false; ribbon.classList.add('is-dragging'); });
addEventListener('pointermove', e => {
  if (!rib.drag) return;
  const dx = e.clientX - rib.drag.x;
  if (Math.abs(dx) > 4) rib.moved = true;
  rib.offset = rib.target = rib.drag.off - dx / (clientWidth() * RIB.spacing);
});
addEventListener('pointerup', () => {
  if (!rib.drag) return;
  rib.drag = null; ribbon.classList.remove('is-dragging');
  rib.target = Math.round(rib.offset); rib.resumeAt = performance.now() / 1000 + 3;
});
clientCards.forEach(card => card.addEventListener('click', e => {
  if (rib.moved) { e.preventDefault(); return; }
  const open = !card.classList.contains('is-open');                       // tap on touch screens: toggle the details
  clientCards.forEach(c => c.classList.remove('is-open'));
  card.classList.toggle('is-open', open);
}));
addEventListener('keydown', e => {
  if (document.body.classList.contains('pm-open') || !document.body.classList.contains('is-clients')) return;
  if (e.key === 'ArrowRight') rib.target = Math.round(rib.target) + 1; else if (e.key === 'ArrowLeft') rib.target = Math.round(rib.target) - 1; else return;
  rib.resumeAt = performance.now() / 1000 + 3;
});

/* =========================================================================
   Section picker overlay (MENU button, top right), usable from any screen
   ========================================================================= */
const overlay = document.getElementById('overlay');
const setMenuOpen = open => {
  document.body.classList.toggle('menu-open', open);
  overlay.setAttribute('aria-hidden', String(!open));
};
document.querySelector('.menu-btn').addEventListener('click', () => setMenuOpen(true));
document.querySelector('.overlay-close').addEventListener('click', () => setMenuOpen(false));
overlay.querySelectorAll('.overlay-nav a').forEach((a, i) => {
  a.style.setProperty('--i', i);
  a.addEventListener('click', () => { if (!a.classList.contains('is-soon')) setMenuOpen(false); });
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !document.body.classList.contains('pm-open')) setMenuOpen(false); });

/* =========================================================================
   Works carousel: cards on a 3D arc, arrows / dots / drag / horizontal wheel / keys
   ========================================================================= */
const carousel = document.getElementById('carousel');
const cards = [...document.querySelectorAll('.work')];
const dotsEl = document.getElementById('dots');
let active = Math.floor(cards.length / 2);
cards.forEach((_, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Project ' + (i + 1));
  b.addEventListener('click', () => goTo(i)); dotsEl.appendChild(b);
});
// Cards sit on one cylinder and the whole ring turns, so they can never cut through each other, even mid-turn.
const ARC = { theta: 14, chord: 0.98, scales: [1, 0.82, 0.62, 0.5, 0.42], dim: 0.12 };
const track = document.getElementById('carouselTrack');
let cardW = 0;                               // measured once per layout (relayout), see measureClientWidth
function measureCardWidth() {                // mirrors --cw in style.css (also resolves while the screen is hidden)
  const w = parseFloat(getComputedStyle(cards[0]).width);
  if (Number.isFinite(w) && w > 0) { cardW = w; return; }
  const vw = layout.vw || innerWidth;
  cardW = vw <= 640 ? vw * 0.76 : clamp(vw * (vw <= 900 ? 0.6 : 0.31), 200, 460);
}
function cardWidth() { if (!cardW) measureCardWidth(); return cardW; }
function layoutCarousel() {
  const cw = cardWidth();
  const R = cw * ARC.chord / (2 * Math.sin(ARC.theta * Math.PI / 360));          // ring radius from the wanted spacing
  track.style.transform = `translateZ(${(-R).toFixed(1)}px) rotateY(${(-active * ARC.theta).toFixed(2)}deg)`;
  cards.forEach((card, i) => {
    const k = Math.abs(i - active);
    const sc = ARC.scales[Math.min(k, ARC.scales.length - 1)];
    card.style.transform = `rotateY(${(i * ARC.theta).toFixed(2)}deg) translateZ(${R.toFixed(1)}px) scale(${sc})`;
    card.style.opacity = (1 - k * ARC.dim).toFixed(2);
    card.classList.toggle('is-active', k === 0);
  });
  [...dotsEl.children].forEach((b, i) => b.classList.toggle('is-active', i === active));
}
function goTo(i) { active = clamp(i, 0, cards.length - 1); layoutCarousel(); }
document.querySelector('.cbtn.prev').addEventListener('click', () => goTo(active - 1));
document.querySelector('.cbtn.next').addEventListener('click', () => goTo(active + 1));
cards.forEach((card, i) => card.addEventListener('click', e => { if (i !== active) { e.preventDefault(); goTo(i); } }));
// drag / swipe
let dragX = null, dragMoved = false;
carousel.addEventListener('pointerdown', e => { e.preventDefault(); dragX = e.clientX; dragMoved = false; carousel.classList.add('is-dragging'); });
addEventListener('pointermove', e => {
  if (dragX === null) return;
  const dx = e.clientX - dragX;
  if (Math.abs(dx) > 40) { goTo(active - Math.sign(dx)); dragX = e.clientX; dragMoved = true; }
});
addEventListener('pointerup', () => { dragX = null; carousel.classList.remove('is-dragging'); });
carousel.addEventListener('click', e => { if (dragMoved) { e.stopPropagation(); e.preventDefault(); dragMoved = false; } }, true);
// horizontal wheel (trackpad) and keyboard, only while the works screen is up
let wheelCool = 0;
carousel.addEventListener('wheel', e => {
  if (Math.abs(e.deltaX) < 25 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
  e.preventDefault();
  const now = performance.now(); if (now < wheelCool) return; wheelCool = now + 550;
  goTo(active + Math.sign(e.deltaX));
}, { passive: false });
addEventListener('keydown', e => {
  if (document.body.classList.contains('pm-open') || !document.body.classList.contains('is-works')) return;
  if (e.key === 'ArrowRight') goTo(active + 1); else if (e.key === 'ArrowLeft') goTo(active - 1);
});

/* =========================================================================
   Words: sized to the screen, slide right-to-left, dissolve into dust
   ========================================================================= */
const WORDS = [...document.querySelectorAll('.words .word')];
const SLOTS = [...document.querySelectorAll('.slot')];
const dust = document.getElementById('dust');
const dctx = dust.getContext('2d');
const samp = document.createElement('canvas');
const sctx = samp.getContext('2d', { willReadFrequently: true });
const wordStyle = getComputedStyle(WORDS[0]);
const fontString = px => `${wordStyle.fontWeight} ${px}px ${wordStyle.fontFamily}`;
if ('fontKerning' in sctx) sctx.fontKerning = 'none';
const COLORS = ['#0c0c0e', '#ff5a1f', '#2fb4ff'];

const layout = { vw: 0, vh: 0, dpr: 1, ready: false, words: [] };
let dustActive = false;

// progress -> which word is leaving (k) and how far the change to k+1 has gone (f, 0..1)
function wordState(p) {
  const k = Math.min(LAST, Math.floor(p + 1e-6));
  const f = k >= LAST ? 0 : clamp((p - k) / (1 - CONFIG.text.dwell), 0, 1);
  return { k, f };
}

function splitLetters(el) {
  if (el.dataset.split) return;
  el.innerHTML = [...el.dataset.text].map(c => c === ' ' ? '<span class="ch sp">&nbsp;</span>' : `<span class="ch" data-ch="${c}">${c}</span>`).join('');
  el.dataset.split = '1';
}
function fitWords() {
  const { vw, vh } = layout;
  WORDS.forEach(splitLetters);
  const maxW = vw * (vw < 640 ? CONFIG.text.widthMobile : CONFIG.text.width);
  const maxFs = vh * CONFIG.text.maxHeight;
  sctx.font = fontString(100);
  WORDS.forEach(el => {
    const emWidth = sctx.measureText(el.dataset.text).width / 100 + 0.16;  // + horizontal padding
    el.style.fontSize = clamp(maxW / emWidth, 40, maxFs).toFixed(1) + 'px';
  });
}

// Sample each word's glyph pixels once: these are the particles' home positions
function buildParticles() {
  const { vw, vh } = layout;
  samp.width = vw; samp.height = vh;
  if ('fontKerning' in sctx) sctx.fontKerning = 'none';   // resizing a canvas resets its whole 2D state; keep measuring like the CSS (font-kerning: none)
  const dist = vw * CONFIG.dust.spread;
  layout.words = WORDS.map((el, i) => {
    const rect = SLOTS[i].getBoundingClientRect();
    el._letters = [...el.querySelectorAll('.ch')].map(ch => ({ el: ch, nx: (ch.offsetLeft + ch.offsetWidth / 2 - 0.08 * parseFloat(el.style.fontSize)) / Math.max(1, rect.width - 0.16 * parseFloat(el.style.fontSize)) }));
    const fs = parseFloat(el.style.fontSize);
    const padX = 0.08 * fs, padY = 0.12 * fs;
    sctx.clearRect(0, 0, vw, vh);
    sctx.font = fontString(fs);
    sctx.textAlign = 'left'; sctx.textBaseline = 'alphabetic'; sctx.fillStyle = '#000';
    const m = sctx.measureText(el.dataset.text);
    const asc = m.fontBoundingBoxAscent ?? fs * 0.8, desc = m.fontBoundingBoxDescent ?? fs * 0.2;
    const baseline = rect.top + padY + (fs - (asc + desc)) / 2 + asc;   // where CSS puts the baseline (line-height: 1)
    sctx.fillText(el.dataset.text, rect.left + padX, baseline);

    const x0 = Math.max(0, Math.floor(rect.left)), y0 = Math.max(0, Math.floor(rect.top));
    const w = Math.max(1, Math.min(vw - x0, Math.ceil(rect.width))), h = Math.max(1, Math.min(vh - y0, Math.ceil(rect.height)));
    const img = sctx.getImageData(x0, y0, w, h).data;
    const stride = Math.max(3, Math.round(fs / CONFIG.dust.stride));
    const pts = [];
    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        const jx = x + (Math.random() - 0.5) * stride, jy = y + (Math.random() - 0.5) * stride;
        const xi = clamp(Math.round(jx), 0, w - 1), yi = clamp(Math.round(jy), 0, h - 1);
        if (img[(yi * w + xi) * 4 + 3] > 90) pts.push(x0 + jx, y0 + jy);
      }
    }
    const n = pts.length / 2;
    const P = new Float32Array(n * 10);
    for (let j = 0; j < n; j++) {
      const o = j * 10, hx = pts[j * 2], hy = pts[j * 2 + 1];
      const aOut = Math.PI + (Math.random() - 0.5) * 1.0;   // leaving: fly left with some spread
      const aIn = (Math.random() - 0.5) * 1.0;              // arriving: come from the right
      P[o] = hx; P[o + 1] = hy; P[o + 2] = (hx - rect.left) / rect.width;
      P[o + 3] = Math.cos(aOut); P[o + 4] = Math.sin(aOut);
      P[o + 5] = Math.cos(aIn);  P[o + 6] = Math.sin(aIn);
      P[o + 7] = (0.2 + 0.8 * Math.random() ** 2) * dist;
      P[o + 8] = Math.random();
      P[o + 9] = Math.random() * Math.PI * 2;
    }
    const groups = [[], [], []];
    for (let j = 0; j < n; j++) groups[j % 9 === 0 ? 1 : j % 9 === 4 ? 2 : 0].push(j);
    return { p: P, n, groups: groups.map(g => Uint32Array.from(g)), cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  });
}

// Letters leave / arrive one by one as the dissolve front (same timing as the dust) passes them
function setLetters(el, mode, f) {
  const letters = el._letters || [], fs = parseFloat(el.style.fontSize) || 100, B = CONFIG.text.blur;
  const front = mode === 'out' ? f / 0.85 : (f - 0.12) / 0.85;          // 0..1 across the word
  for (const { el: ch, nx } of letters) {
    let g = 0;                                                            // 0 = intact, 1 = gone / not yet here
    if (mode === 'out') g = clamp((front - nx + 0.07) / 0.14, 0, 1);
    else if (mode === 'in') g = clamp((nx - front + 0.07) / 0.14, 0, 1);
    const st = ch.style;
    if (g <= 0) { st.opacity = ''; st.transform = ''; st.filter = ''; continue; }
    const dir = mode === 'out' ? -1 : 1;
    st.opacity = (1 - g).toFixed(3);
    st.transform = `translate3d(${(dir * g * 0.22 * fs).toFixed(1)}px, ${(-g * g * 0.06 * fs).toFixed(1)}px, 0) scale(${(1 - 0.3 * g).toFixed(3)})`;
    st.filter = g > 0.02 ? `blur(${(g * B).toFixed(2)}px)` : '';
  }
}
function setWord(i, mode, f) {
  const el = WORDS[i], st = el.style;
  el.classList.toggle('is-rest', mode === 'rest');
  el.classList.toggle('is-out', mode === 'out');
  el.classList.toggle('is-in', mode === 'in');
  if (mode === 'hidden' || mode === 'rest') {
    st.transform = ''; st.opacity = ''; st.setProperty('--split', '1');
    setLetters(el, 'rest', 0);
    return;
  }
  const S = layout.vw * CONFIG.text.shift;
  if (mode === 'out') {
    st.transform = `translate3d(${(-S * f).toFixed(1)}px,0,0) scale(${(1 - 0.15 * f).toFixed(4)})`;
    st.setProperty('--split', (1 + 1.5 * f).toFixed(3));
  } else {
    st.transform = `translate3d(${(S * (1 - f)).toFixed(1)}px,0,0) scale(${(0.85 + 0.15 * f).toFixed(4)})`;
    st.setProperty('--split', (1 + 1.5 * (1 - f)).toFixed(3));
  }
  st.opacity = '';
  setLetters(el, mode, f);
}

let wordsAllHidden = false;
function applyWords(k, f) {
  const allHidden = k >= WORDS.length || (k === WORDS.length - 1 && f >= 1);   // past the last word: every word is already hidden
  if (allHidden && wordsAllHidden) return;
  wordsAllHidden = allHidden;
  const mid = f > 0 && f < 1;
  for (let i = 0; i < WORDS.length; i++) {
    if (i === k) setWord(i, mid ? 'out' : f >= 1 ? 'hidden' : 'rest', f);
    else if (i === k + 1) setWord(i, mid ? 'in' : f >= 1 ? 'rest' : 'hidden', f);
    else setWord(i, 'hidden', 0);
  }
}

function drawWordDust(W, mode, f, t) {
  if (!W || !W.n) return;
  const fadeAll = mode === 'out' ? 1 - smooth(0.85, 1, f) : smooth(0, 0.12, f);
  if (fadeAll <= 0) return;
  const P = W.p, cx = W.cx, cy = W.cy, S = layout.vw * CONFIG.text.shift, size = CONFIG.dust.size;
  for (let c = 0; c < 3; c++) {
    const G = W.groups[c];
    dctx.fillStyle = COLORS[c];
    for (let q = 0; q < G.length; q++) {
      const o = G[q] * 10, nx = P[o + 2], r = P[o + 8];
      if (mode === 'out') {
        const d = clamp(0.85 * nx + 0.06 * r, 0, 0.97);          // when this pixel leaves the word
        let g = (f - d) / 0.55; if (g <= 0) continue; if (g > 1) g = 1;
        const e = easeOut(g), sc = 1 - 0.15 * d, sx = -S * d;
        const x = cx + (P[o] - cx) * sc + sx + P[o + 3] * P[o + 7] * e + Math.sin(t * 2.1 + P[o + 9]) * 3 * g;
        const y = cy + (P[o + 1] - cy) * sc + P[o + 4] * P[o + 7] * e + Math.cos(t * 1.7 + P[o + 9]) * 3 * g;
        const s = size * (1 - 0.5 * g);
        dctx.globalAlpha = Math.min(1, g * 8) * Math.pow(1 - g, 1.3) * fadeAll;
        dctx.fillRect(x - s / 2, y - s / 2, s, s);
      } else {
        const sT = clamp(0.12 + 0.85 * nx - 0.06 * r, 0.02, 0.98);  // when this pixel lands on the word
        let g = (f - (sT - 0.55)) / 0.55; if (g <= 0 || g >= 1) continue;
        const e = easeOut(g), sc = 0.85 + 0.15 * sT, sx = S * (1 - sT);
        const x = cx + (P[o] - cx) * sc + sx + P[o + 5] * P[o + 7] * (1 - e) + Math.sin(t * 2.1 + P[o + 9]) * 3 * (1 - g);
        const y = cy + (P[o + 1] - cy) * sc + P[o + 6] * P[o + 7] * (1 - e) + Math.cos(t * 1.7 + P[o + 9]) * 3 * (1 - g);
        const s = size * (0.5 + 0.5 * g);
        dctx.globalAlpha = Math.min(1, g * 6) * fadeAll;
        dctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  }
  dctx.globalAlpha = 1;
}

let dustShown = true;
function drawDust(k, f, t) {
  const { vw, vh, dpr } = layout;
  const active = f > 0 && f < 1 && k < WORDS.length;      // dust exists only while a word leaves / arrives, not between the later screens
  if (!active && !dustActive && !dustShown) return;       // already clean and hidden
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dctx.clearRect(0, 0, vw, vh);
  dustActive = active;
  if (dustShown !== active) { dustShown = active; dust.style.visibility = active ? '' : 'hidden'; }   // an empty full-screen layer still costs blending
  if (!dustActive) return;
  drawWordDust(layout.words[k], 'out', f, t);
  if (CONFIG.dust.assemble && k + 1 < WORDS.length) drawWordDust(layout.words[k + 1], 'in', f, t);
}

let relayoutTimer = 0;
function relayout() {
  clearTimeout(relayoutTimer);
  if (!innerWidth || !innerHeight) {          // hidden / collapsed viewport: measure later
    layout.ready = false;
    relayoutTimer = setTimeout(relayout, 250);
    return;
  }
  layout.vw = innerWidth; layout.vh = innerHeight;
  layout.dpr = Math.min(devicePixelRatio || 1, 1.5);
  heroBox = heroBoxNow();
  sectionH = sections[0].getBoundingClientRect().height || innerHeight || 1;
  dust.width = Math.round(layout.vw * layout.dpr);
  dust.height = Math.round(layout.vh * layout.dpr);
  dustActive = true;                                      // resizing wiped the canvas: let the next frame redraw / hide it
  fitWords();
  fitTitle(contactTitle, 0.82, 0.47);
  fitTitle(worksTitle, 0.64, 0.46);
  fitTitle(clientsTitle, 0.66, 0.46);
  buildParticles();
  heroSig = heroMetrics();
  measureCardWidth(); measureClientWidth();
  layoutCarousel();
  layout.ready = true;
  readScroll();
  const { k, f } = wordState(scroll.current);
  applyWords(k, f); updateCSS();
  forceApply = true;
}
let forceApply = false;
let resizeTimer = 0;
// A phone's URL bar sliding away also fires 'resize', but the hero (100svh) keeps its box: measuring again there would
// re-scatter every particle in the middle of a word change. Desktop window resizes always change the box.
const heroEl = document.getElementById('hero');
let heroBox = '';
function heroBoxNow() { return `${heroEl.clientWidth}x${heroEl.clientHeight}@${Math.min(devicePixelRatio || 1, 1.5)}`; }
addEventListener('resize', () => {
  cardW = clientW = 0;                                   // card widths follow the viewport at once
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!layout.ready || heroBoxNow() !== heroBox) relayout(); }, 150);
});
// back on the tab: measure again only if something changed meanwhile (a relayout rebuilds every particle)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!layout.ready || innerWidth !== layout.vw || innerHeight !== layout.vh || Math.min(devicePixelRatio || 1, 1.5) !== layout.dpr || heroMetrics() !== heroSig) relayout();
});
// fonts that arrive late (slow network) change the word widths: fit again. Only then: 'loadingdone' also fires for every
// unrelated face or subset (a Greek glyph on a client card, Cyrillic in the manager), and a relayout rebuilds all the particles.
let heroSig = '';
function heroMetrics() {
  sctx.font = fontString(100);
  return [...WORDS, worksTitle, clientsTitle, contactTitle].map(el => sctx.measureText(el.dataset.text).width.toFixed(1)).join();
}
if (document.fonts) document.fonts.addEventListener('loadingdone', () => { if (layout.ready && heroMetrics() !== heroSig) relayout(); });

/* =========================================================================
   Three.js: dark chrome logo + horizontal chromatic aberration / smear
   ========================================================================= */
const canvas = document.getElementById('logo3d');
// The canvas itself only ever receives the full-screen output pass: anti-aliasing happens in the composer's 4x MSAA scene buffer.
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, depth: false, powerPreference: 'high-performance' });
// Quality tiers: start at 1.5x pixels (2x is not worth the GPU cost here); step down automatically if frames get slow
const QUALITY = { tiers: [{ dpr: 1.5, taps: 4 }, { dpr: 1.25, taps: 4 }, { dpr: 1.0, taps: 3 }], tier: 0, ema: 16, slowFrames: 0, probe: null, locked: false };
// The old key ('site.quality') could be ratcheted down for good by lag that had nothing to do with the 3D scene: drop it.
// The new one is only written after a step down has proved useful, and expires after a week.
const QKEY = 'site.quality.v2';
const qStore = {
  get() { try { const v = JSON.parse(localStorage.getItem(QKEY)); return v && Date.now() - v.t < 7 * 864e5 ? clamp(v.tier | 0, 0, 2) : null; } catch (e) { return null; } },
  set(tier) { try { localStorage.setItem(QKEY, JSON.stringify({ tier, t: Date.now() })); } catch (e) { /* storage blocked */ } },
};
try { localStorage.removeItem('site.quality'); } catch (e) { /* storage blocked */ }
QUALITY.tier = qStore.get() ?? (innerWidth < 640 ? 1 : 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.tiers[QUALITY.tier].dpr));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, 9);

// A black "studio" with a few bright HDR light strips: what the chrome reflects.
function makeStudioEnvironment() {
  const env = new THREE.Scene();
  const strip = (w, h, rgb, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  strip(18, 7, [4.0, 3.9, 3.8], [0, 8, 3]);       // big soft top light
  strip(22, 22, [0.85, 0.82, 0.8], [-7, 7, 15]);  // soft panel behind the camera, upper-left
  strip(22, 22, [0.22, 0.22, 0.28], [7, -7, 17]); // dimmer panel lower-right: the reflection sweeps as the logo turns
  strip(3, 16, [6.0, 2.4, 0.8], [-8, 1, 3]);      // warm (orange) left
  strip(3, 16, [0.7, 2.4, 6.0], [8, -1, 3]);      // cool (blue) right
  strip(16, 3, [0.9, 0.7, 1.3], [0, -8, -1]);     // faint violet from below
  strip(5, 5, [1.6, 1.6, 1.7], [0, 2, -9]);       // back fill
  return env;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(makeStudioEnvironment(), 0.03).texture;
pmrem.dispose();

const keyLight = new THREE.DirectionalLight(0xffc9a0, 1.6);
keyLight.position.set(-5, 4, 6);
const rimLight = new THREE.DirectionalLight(0x9ac8ff, 1.4);
rimLight.position.set(5, -3, 4);
scene.add(keyLight, rimLight);

let introStart = -1;
let logoReady = false;
const material = new THREE.MeshPhysicalMaterial(CONFIG.material);
// Melt: a line rises through the model; everything below it sags into drips that thin out and fall into the stream
material.userData.melt = { uMelt: { value: 0 }, uTime: { value: 0 }, uYMin: { value: -0.5 }, uYMax: { value: 0.5 }, uCx: { value: 0 }, uCz: { value: 0 } };
material.onBeforeCompile = shader => {
  Object.assign(shader.uniforms, material.userData.melt);
  shader.vertexShader = 'uniform float uMelt, uTime, uYMin, uYMax, uCx, uCz;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    if (uMelt > 0.0) {
      float H = uYMax - uYMin;
      float t = (transformed.y - uYMin) / H;                 // 0 bottom .. 1 top
      float d = max(0.0, uMelt * 2.3 - t);                   // how far below the melt line (reaches the top at ~45%)
      float pinch = clamp(1.0 - d * 0.8, 0.0, 1.0);
      transformed.x = uCx + (transformed.x - uCx) * pinch;
      transformed.z = uCz + (transformed.z - uCz) * pinch;
      transformed.x += 0.035 * H * sin(t * 40.0 + uTime * 3.0) * min(1.0, d * 2.0);
      transformed.y -= d * d * H * (1.6 + 0.6 * sin((transformed.x - uCx) * 30.0 / H + uTime * 2.0));
    }`);
};
const logo = new THREE.Group();
scene.add(logo);
let fitScale = 1;

let portrait = 1;                                       // < 1 on portrait screens (the canvas is the full viewport there)
function fitAndAdd(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  fitScale = CONFIG.logoHeight * portrait / size.y;
  logo.scale.setScalar(fitScale);
  logo.add(object);
  logoReady = true;
}

// 1D squared distance transform (Felzenszwalb & Huttenlocher)
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let sIdx = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (sIdx <= z[k]) { k--; sIdx = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = sIdx; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
// squared distance from every ink cell to the nearest empty cell
function edt(inside, w, h) {
  const m = Math.max(w, h);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = inside[i] ? 1e20 : 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
  return g;
}

// 3x3 box blur over ink cells only (empty cells are ignored, not averaged in)
function blurInside(src, inside, w, h, passes) {
  let a = src, b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!inside[i]) continue;
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (inside[j]) { sum += a[j]; cnt++; }
          }
        }
        b[i] = sum / cnt;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

// Raster logo -> inflated 3D relief: distance to the edge drives a rounded height profile,
// mirrored front/back and joined along the silhouette. Holes and slits in the artwork survive.
// The distance field is computed at 2x the mesh resolution and smoothed, so the pixel
// staircase of the silhouette does not ripple through the surface.
function buildFromImage(url) {
  const img = new Image();
  img.onload = () => {
    const t0 = performance.now();
    const RC = CONFIG.relief;
    const res = innerWidth < 640 ? RC.resolutionMobile : RC.resolution;
    const SS = 2, pad = 2;
    const sc = res / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.round(img.naturalWidth * sc) + pad * 2, h = Math.round(img.naturalHeight * sc) + pad * 2;
    const fw = w * SS, fh = h * SS;

    // ink mask at the fine resolution
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, pad * SS, pad * SS, (w - pad * 2) * SS, (h - pad * 2) * SS);
    const px = ctx.getImageData(0, 0, fw, fh).data;
    const fn = fw * fh;
    const fInside = new Uint8Array(fn);
    for (let i = 0; i < fn; i++) {
      const a = px[i * 4 + 3], l = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
      fInside[i] = (a > 127 && l < 160) ? 1 : 0;   // ink = opaque and dark: works for black-on-transparent and black-on-white
    }

    // height from the distance to the edge: quarter-circle rounding + a gentle dome in the middle
    const dist2 = edt(fInside, fw, fh);
    const R = RC.radius * res * SS;
    let Hf = new Float32Array(fn);
    for (let i = 0; i < fn; i++) {
      if (!fInside[i]) continue;
      const d = Math.sqrt(dist2[i]);
      const t = Math.min(d, R) / R;
      let z = R * Math.sqrt(1 - (1 - t) * (1 - t));
      if (d > R) z += RC.dome * R * (1 - Math.exp(-(d - R) / R));
      Hf[i] = z;
    }
    Hf = blurInside(Hf, fInside, fw, fh, 2);

    // down to the mesh grid: a cell is ink if at least half of its fine cells are
    const n = w * h;
    const inside = new Uint8Array(n), H = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let cnt = 0, sum = 0;
        for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
          const j = (y * SS + dy) * fw + (x * SS + dx);
          if (fInside[j]) { cnt++; sum += Hf[j]; }
        }
        if (cnt * 2 >= SS * SS) { inside[i] = 1; H[i] = sum / (SS * SS) / SS; }
      }
    }

    // vertices: every ink cell, plus the ring of empty cells touching ink (height 0, shared by front and back)
    const front = new Int32Array(n).fill(-1), back = new Int32Array(n).fill(-1);
    const pos = [];
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i - x) / w;
      let use = inside[i] === 1;
      if (!use) {
        for (let dy = -1; dy <= 1 && !use; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && inside[yy * w + xx]) { use = true; break; }
        }
      }
      if (!use) continue;
      front[i] = pos.length / 3; pos.push(x - cx, cy - y, H[i]);
      if (inside[i]) { back[i] = pos.length / 3; pos.push(x - cx, cy - y, -H[i]); } else back[i] = front[i];
    }
    const idx = [];
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const a = y * w + x, b = a + 1, c = a + w, d = c + 1;
        if (!(inside[a] || inside[b] || inside[c] || inside[d])) continue;
        if (front[a] < 0 || front[b] < 0 || front[c] < 0 || front[d] < 0) continue;
        if (Math.abs(H[a] - H[d]) <= Math.abs(H[b] - H[c])) {   // split along the flatter diagonal
          idx.push(front[a], front[c], front[d], front[a], front[d], front[b]);
          idx.push(back[a], back[d], back[c], back[a], back[b], back[d]);
        } else {
          idx.push(front[a], front[c], front[b], front[b], front[c], front[d]);
          idx.push(back[a], back[b], back[c], back[b], back[d], back[c]);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    fitAndAdd(new THREE.Mesh(geo, material));
    console.info(`logo relief: ${pos.length / 3} vertices, ${idx.length / 3} triangles, ${(performance.now() - t0).toFixed(0)} ms`);
  };
  img.onerror = () => console.error('Logo image failed to load: ' + url);
  img.src = url;
}

if (CONFIG.logoModel) {
  const gltfLoader = new GLTFLoader();
  const draco = new DRACOLoader();                       // the GLB is Draco-compressed (about 10x smaller)
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
  gltfLoader.setDRACOLoader(draco);
  gltfLoader.load(CONFIG.logoModel, gltf => {
    gltf.scene.traverse(o => { if (o.isMesh) o.material = material; });
    fitAndAdd(gltf.scene);
  }, undefined, err => { console.warn('Logo model failed to load, using the raster relief.', err); buildFromImage(CONFIG.logoImage); });
} else {
  buildFromImage(CONFIG.logoImage);
}

/* =========================================================================
   Menu screen: liquid-chrome stream + headline plane woven between its strands
   ========================================================================= */
const MENU = CONFIG.menu;
const liquid = new THREE.MeshPhysicalMaterial(MENU.liquid);
const stream = new THREE.Group();
stream.visible = false;
scene.add(stream);
const ribbons = MENU.ribbons.map(r => {
  const geo = new THREE.PlaneGeometry(r.width, MENU.streamHeight, 18, 150);
  geo.translate(0, -MENU.streamHeight / 2, 0);          // top edge at y = 0
  geo.attributes.position.setUsage(THREE.DynamicDrawUsage);   // rewritten every frame
  geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  const base = geo.attributes.position.array.slice();
  // per-column constants (x never changes along a column): c = x0 / (width / 2) and radius * sqrt(1 - c * c)
  const cols = geo.parameters.widthSegments + 1, colC = new Float64Array(cols), colR = new Float64Array(cols);
  for (let ix = 0; ix < cols; ix++) { const c = base[ix * 3] / (r.width / 2); colC[ix] = c; colR[ix] = r.radius * Math.sqrt(Math.max(0, 1 - c * c)); }
  const mesh = new THREE.Mesh(geo, liquid);
  mesh.userData = { ...r, base, colC, colR };
  stream.add(mesh);
  return mesh;
});
// The same area-weighted vertex normals as BufferGeometry.computeVertexNormals() (same face order, same accumulation,
// same normalisation), but on the raw typed arrays: about ten times cheaper than the generic accessor-based version.
function ribbonNormals(geo) {
  const p = geo.attributes.position.array, attr = geo.attributes.normal, n = attr.array, idx = geo.index.array;
  n.fill(0);
  for (let f = 0; f < idx.length; f += 3) {
    const ia = idx[f] * 3, ib = idx[f + 1] * 3, ic = idx[f + 2] * 3;
    const cbx = p[ic] - p[ib], cby = p[ic + 1] - p[ib + 1], cbz = p[ic + 2] - p[ib + 2];
    const abx = p[ia] - p[ib], aby = p[ia + 1] - p[ib + 1], abz = p[ia + 2] - p[ib + 2];
    const x = cby * abz - cbz * aby, y = cbz * abx - cbx * abz, z = cbx * aby - cby * abx;
    n[ia] += x; n[ia + 1] += y; n[ia + 2] += z;
    n[ib] += x; n[ib + 1] += y; n[ib + 2] += z;
    n[ic] += x; n[ic + 1] += y; n[ic + 2] += z;
  }
  for (let i = 0; i < n.length; i += 3) {
    const x = n[i], y = n[i + 1], z = n[i + 2], s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    n[i] = x * s; n[i + 1] = y * s; n[i + 2] = z * s;
  }
  attr.needsUpdate = true;
}
// wavy, tapering half-tube, recomputed on the CPU each frame. Row by row: everything except x is constant along a grid row.
function updateRibbon(mesh, t, m) {
  const { base, phase, colC, colR } = mesh.userData;
  const H = MENU.streamHeight, geo = mesh.geometry, pos = geo.attributes.position, a = pos.array, cols = colC.length;
  for (let i = 0; i < a.length; ) {
    const y0 = base[i + 1], d = -y0 / H;
    const grow = smooth(0, 0.14, d);                     // the ribbon starts as a point inside the body, no flat top edge
    const wave = 0.40 * Math.sin(y0 * 1.5 + t * 0.55 + phase) + 0.16 * Math.sin(y0 * 3.3 - t * 0.35 + phase * 1.7);
    const kx = 1 - 0.35 * d, wm = wave * m;
    const bulgeK = 0.7 + 0.3 * Math.sin(y0 * 2.2 + t * 0.4 + phase);
    const twist = 0.12 * Math.sin(y0 * 2.7 + t * 0.3 + phase);
    for (let ix = 0; ix < cols; ix++, i += 3) {
      a[i] = (base[i] * kx + wm) * grow;
      a[i + 1] = y0;
      a[i + 2] = (colR[ix] * bulgeK + twist * colC[ix] * m) * grow;
    }
  }
  pos.needsUpdate = true;
  ribbonNormals(geo);
}

let textPlane = null;
const headlineFont = CONFIG.menu.text.font.replace(/\d+px/, '100px');
let headlineFontOk = false;                              // false: drawn with a fallback face (the web font was late)
function paintHeadline(cv) {
  const T = MENU.text, size = cv.width;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = T.font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.02em';
  const fontPx = parseFloat(T.font.match(/(\d+)px/)[1]);
  const lh = fontPx * T.lineHeight, total = lh * T.lines.length;
  T.lines.forEach((ln, i) => ctx.fillText(ln, size / 2, size / 2 - total / 2 + lh * (i + 0.5)));
  headlineFontOk = document.fonts.check(headlineFont);
}
function buildHeadline() {
  const T = MENU.text, size = 2048;
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  paintHeadline(cv);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaToCoverage: true, color: 0x000000 });
  textPlane = new THREE.Mesh(new THREE.PlaneGeometry(T.size, T.size), mat);
  textPlane.position.set(0, T.y, T.z);
  textPlane.scale.setScalar(Math.min(1, camera.aspect));
  textPlane.visible = false;
  scene.add(textPlane);
  renderer.initTexture(tex);             // upload the 2048px texture + mipmaps now (intro), not on the first frame the headline shows
  // on a slow connection the headline is first baked with a fallback face: bake it again as soon as the real one is there
  if (!headlineFontOk && document.fonts) {
    const again = () => {
      if (headlineFontOk || !document.fonts.check(headlineFont)) return;
      paintHeadline(cv); tex.needsUpdate = true;
      renderer.initTexture(tex);         // upload now, not on the first frame the headline shows (mid-melt)
      document.fonts.removeEventListener('loadingdone', again);
    };
    document.fonts.addEventListener('loadingdone', again);
    headlineLoad.then(again, () => {});    // 'loadingdone' is not dependable in every engine; the load promise is
  }
}
const headlineLoad = document.fonts.load(headlineFont);
Promise.race([headlineLoad, new Promise(r => setTimeout(r, 3000))]).catch(() => {}).then(buildHeadline);

const tmpColor = new THREE.Color();
let streamLive = false;                                  // the melt / stream is in motion: render every frame
function updateMenuScene(t, g, c) {
  // g: liquid formed (0..1), c: pour amount (0..1): the stream pours down and fades while the next screen rises
  streamLive = g > 0.03 && c < 0.98;
  stream.visible = g > 0.18 && c < 0.95;                 // outside this range the liquid's opacity (below) is exactly 0
  if (stream.visible) {
    liquid.opacity = MENU.liquid.opacity * smooth(0.18, 0.7, g) * (1 - smooth(0.5, 0.95, c));   // the drips arrive, then the stream builds
    const flow = t + 3.0 * c;                              // runs faster while leaving
    const grow = smooth(0.1, 0.9, g), width = 0.25 + 0.75 * smooth(0.2, 0.88, g);
    for (const r of ribbons) {
      updateRibbon(r, flow, g);
      r.position.set(r.userData.x * g, MENU.streamTop - 2.8 * c, r.userData.z * g);
      r.scale.set(width, 0.02 + 0.98 * (1 - (1 - grow) * (1 - grow)), 1);
    }
  }
  if (textPlane) {
    const k = smooth(0.3, 0.8, g) * (1 - smooth(0.1, 0.55, c));   // fades in over the stream, and back out
    textPlane.visible = k > 0.01;
    textPlane.material.opacity = MENU.text.opacity * k;
  }
}

// ---- post-processing: horizontal RGB split (left/right fringes only) + motion smear while scrolling ----
const ChromaticAberrationShader = {
  uniforms: { tDiffuse: { value: null }, uSplit: { value: CONFIG.aberration.base }, uSmear: { value: 0 }, uTaps: { value: 4 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSplit; uniform float uSmear; uniform int uTaps; varying vec2 vUv;
    void main() {
      vec2 s = vec2(uSplit, 0.0);
      if (uSmear < 0.0004) {                                   // at rest: one sample per channel
        vec4 r = texture2D(tDiffuse, vUv + s), g = texture2D(tDiffuse, vUv), b = texture2D(tDiffuse, vUv - s);
        gl_FragColor = vec4(r.r, g.g, b.b, (r.a + g.a + b.a) / 3.0);
        return;
      }
      vec3 c = vec3(0.0); float a = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= uTaps) break;
        vec2 o = vec2((float(i) / float(uTaps - 1) - 0.5) * uSmear, 0.0);
        vec4 r = texture2D(tDiffuse, vUv + s + o);
        vec4 g = texture2D(tDiffuse, vUv + o);
        vec4 b = texture2D(tDiffuse, vUv - s + o);
        c += vec3(r.r, g.g, b.b);
        a += (r.a + g.a + b.a) / 3.0;
      }
      gl_FragColor = vec4(c, a) / float(uTaps);
    }`,
};
// Scene buffer: 4x MSAA + half float (the chrome highlights are far above 1.0 before tone mapping). Its depth is never read back.
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, resolveDepthBuffer: false });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const caPass = new ShaderPass(ChromaticAberrationShader);
composer.addPass(caPass);
composer.addPass(new OutputPass());
// EffectComposer cloned `target`: the scene is always drawn into composer.readBuffer (the clone, still 4x MSAA), while
// composer.writeBuffer (= `target`) only receives the full-screen aberration pass, where MSAA / depth cannot change a pixel.
// True only while the buffers keep their roles, i.e. an even number of swapping passes per frame (today: aberration + output).
if (composer.passes.filter(pass => pass.needsSwap).length % 2 === 0) {
  composer.writeBuffer.samples = 0;
  composer.writeBuffer.depthBuffer = false;
}

function resize3d() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const prev = portrait;
  portrait = Math.min(1, camera.aspect * 1.2);
  if (prev !== portrait && logo.children.length) fitScale *= portrait / prev;
  const k = Math.min(1, camera.aspect);
  stream.scale.set(k, 1, k);                             // portrait: narrower stream, still full height
  if (textPlane) textPlane.scale.setScalar(k);
}
new ResizeObserver(resize3d).observe(canvas);
function applyQuality() {
  const q = QUALITY.tiers[QUALITY.tier];
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.dpr));
  composer.setPixelRatio(renderer.getPixelRatio());
  caPass.uniforms.uTaps.value = q.taps;
  resize3d();
}
applyQuality();
try {                                   // same render-target state as the real frames, so the same shader variants
  const rt = renderer.getRenderTarget();
  renderer.setRenderTarget(composer.readBuffer);
  renderer.compileAsync(scene, camera).catch(() => {});
  renderer.setRenderTarget(rt);
} catch (e) { /* older three / no parallel compile: warmUp3d() does it all */ }

/* =========================================================================
   Ready / intro
   ========================================================================= */
(async () => {
  try {
    const heroLoad = document.fonts.load(fontString(100));
    heroLoad.then(() => { if (layout.ready && heroMetrics() !== heroSig) relayout(); }, () => {});   // arrived after the timeout below: fit again
    await Promise.race([heroLoad, new Promise(r => setTimeout(r, 3000))]);
  } catch (e) { /* fall back to whatever font is available */ }
  relayout();
  const start = () => { warmUp3d(); document.body.classList.add('is-ready'); introStart = -2; };   // -2: start on the next frame
  const wait = () => (logoReady ? start() : setTimeout(wait, 30));
  wait();
})();

/* =========================================================================
   Frame loop
   ========================================================================= */
// Compile the menu-screen shaders and upload its buffers while the page is still fading in (canvas at opacity 0),
// instead of stalling the first scroll into the melt.
function warmUp3d() {
  const now = performance.now();
  try {
    poseLogo(now);
    stream.visible = true; if (textPlane) textPlane.visible = true;
    composer.render();                   // throw-away frame through the same render targets, so the same shader variants
    poseLogo(now); composer.render();    // put the correct frame back (poseLogo resets the visibility flags)
  } catch (e) { console.warn('3D warm-up skipped', e); }
}
let last = performance.now();
const B = CONFIG.baseRotation, T = CONFIG.tumble;
const wave = (f, ph, p) => Math.sin(f * p + ph) - Math.sin(ph);   // smooth pseudo-random, zero at p = 0

let frames = 0;

// Logo pose: tumbles through all three axes as you scroll, tilts with speed, floats when idle, follows the mouse
function poseLogo(now) {
  const t = now / 1000, p = scroll.current;
  const idle = reduceMotion ? 0 : 1;
  const intro = introStart < 0 ? 0 : easeOut(clamp((now - introStart) / 1400, 0, 1));
  const g = menuGrow(p), c = pourAmount(p);
  const pt = Math.min(p, MENU.start);                 // the tumble freezes while the menu forms
  let rx = B.x + T.x * (0.7 * wave(1.7, 0.3, pt) + 0.35 * wave(3.9, 2.1, pt))
    - Math.tanh(scroll.vel * 0.5) * CONFIG.tilt - mouse.y * 0.1 + idle * Math.sin(t * 0.9) * 0.035;
  let ry = B.y + T.y * pt + 0.9 * wave(1.3, 1.2, pt) + 0.4 * wave(4.3, 0.5, pt)
    + mouse.x * 0.16 + idle * Math.sin(t * 0.7) * 0.06 + (1 - intro) * 0.9;
  let rz = B.z + T.z * (0.7 * wave(2.2, 0.8, pt) + 0.35 * wave(5.1, 3.0, pt));
  let px = 0, py = CONFIG.logoOffsetY + idle * Math.sin(t * 1.1) * 0.05;
  let sc = fitScale * (0.82 + 0.18 * intro) * (1 + scroll.ab * 0.05);
  if (g > 0) {                                        // dissolve into the liquid: drift up, stretch down, thin out, fade
    const Hd = MENU.head;
    rx = lerp(wrapAngle(rx), Hd.rot[0], g);
    ry = lerp(wrapAngle(ry), Hd.rot[1], g);
    rz = lerp(wrapAngle(rz), Hd.rot[2], g);
    px = lerp(px, Hd.pos[0], g);
    py = lerp(py, Hd.pos[1], g);
    sc = lerp(sc, fitScale * Hd.scale, g);
    // the model melts away geometrically (threads thin to nothing); a long, late fade only cleans up the last threads
    material.opacity = 1 - smooth(0.86, 0.985, g); material.transparent = true;
    logo.visible = g < 0.985;
    logo.scale.setScalar(sc);
    material.userData.melt.uMelt.value = smooth(0.04, 0.9, g);
    material.userData.melt.uTime.value = t;
  } else {
    material.opacity = 1; material.transparent = false; logo.visible = true;
    logo.scale.setScalar(sc);
    material.userData.melt.uMelt.value = 0;
  }
  logo.rotation.set(rx, ry, rz);
  logo.position.set(px, py, 0);
  updateMenuScene(t, g, c);
  caPass.uniforms.uSplit.value = CONFIG.aberration.base + scroll.ab * CONFIG.aberration.scroll + (1 - intro) * 0.01;
  caPass.uniforms.uSmear.value = scroll.ab * CONFIG.aberration.smear;
}

// Draws the 3D scene, unless there is nothing in it: from the works screen on, the logo has melted and the stream has
// poured away. Then one last, empty frame is drawn, the canvas is hidden and rendering stops (an invisible full post-processing
// pass per frame, plus a big transparent layer for the browser to blend, was the main cost of the works / clients screens).
let sceneOff = false;
function renderScene(now) {
  const p = scroll.current;
  const empty = logoReady && menuGrow(p) >= 0.985 && pourAmount(p) >= 0.95;      // same thresholds as logo.visible / stream.visible
  if (empty && sceneOff) return;
  poseLogo(now);
  composer.render();
  if (empty !== sceneOff) { sceneOff = empty; canvas.style.visibility = empty ? 'hidden' : ''; }
}
function tick(now) {
  requestAnimationFrame(tick);
  frames++;
  if (introStart === -2) introStart = now;
  const dt = clamp(((now - last) / 1000) || 0.016, 0.001, 0.1);   // never zero, negative or NaN
  last = now;

  // scroll easing + speed-derived boost for aberration / blur
  const prev = scroll.current;
  scroll.current = damp(scroll.current, scroll.target, CONFIG.scrollEase, dt);
  if (Math.abs(scroll.target - scroll.current) < 0.0004) scroll.current = scroll.target;
  if (!Number.isFinite(scroll.current)) {
    console.warn('scroll state was not a number, resetting', { prev, target: scroll.target, dt, now, last });
    scroll.current = Number.isFinite(scroll.target) ? scroll.target : 0; scroll.vel = 0; scroll.ab = 0;
  }
  const v = (scroll.current - prev) / dt;
  scroll.vel = damp(scroll.vel, v, 12, dt);
  scroll.ab = damp(scroll.ab, clamp(Math.abs(scroll.vel) * 0.45, 0, 1), 8, dt);
  const moving = prev !== scroll.current || scroll.ab > 0.001;

  mouse.x = damp(mouse.x, mouse.tx, 4, dt);
  mouse.y = damp(mouse.y, mouse.ty, 4, dt);

  // words + dust
  const pmOpen = document.body.classList.contains('pm-open');
  if (layout.ready) {
    const { k, f } = wordState(scroll.current);
    if (moving || forceApply) { applyWords(k, f); updateCSS(); forceApply = false; }
    if (!pmOpen) {                                             // nothing below is visible under the opaque manager
      if ((f > 0 && f < 1 && k < WORDS.length) || dustActive || dustShown) drawDust(k, f, now / 1000);
      if (clientsEl.classList.contains('is-on')) layoutRibbon(dt, now / 1000);
    }
  }

  if (pmOpen) return;   // the manager covers the site: skip rendering

  // Adaptive quality: sustained slow frames step the 3D resolution down. Judged only on scrolling frames where the 3D scene is
  // the main load (before the works screen starts to rise), and a step down is kept (and remembered for a week) only if it
  // measurably shortened those frames. Frame times are quantised to the display refresh, so one step may not show: every step
  // is tried before deciding that the bottleneck is something else (a 30 fps power-saving cap, another app...). Then the tier
  // is restored and adapting stops for this page load, so the logo never loses resolution for nothing.
  if (!QUALITY.locked && moving && scroll.current < MENU.pour[0] && !document.hidden && introStart > 0 && now - introStart > 4000) {   // not while the page is still loading
    const Q = QUALITY;
    Q.ema += (dt * 1000 - Q.ema) * 0.1;
    if (Q.probe) {
      if (++Q.probe.n >= 90) {
        if (Q.ema <= Q.probe.ema * 0.85) {                       // faster: but one window can simply be a lighter stretch of the page
          if (++Q.probe.ok >= 2) { qStore.set(Q.tier); Q.probe = null; Q.slowFrames = 0; } else Q.probe.n = 0;
        } else {
          Q.probe.ok = 0;
          if (Q.tier < Q.tiers.length - 1) { Q.tier++; Q.probe.n = 0; applyQuality(); }
          else { Q.tier = Q.probe.from; Q.locked = true; Q.probe = null; applyQuality(); }
        }
      }
    } else if (Q.ema > 26) {
      if (++Q.slowFrames > 45 && Q.tier < Q.tiers.length - 1) { Q.probe = { from: Q.tier, ema: Q.ema, n: 0, ok: 0 }; Q.tier++; Q.slowFrames = 0; applyQuality(); }
    } else Q.slowFrames = Math.max(0, Q.slowFrames - 1);
  }
  // at rest (no scroll, still mouse, no liquid stream) the idle wobble only needs 30 fps
  const still = !moving && Math.abs(mouse.tx - mouse.x) < 0.002 && Math.abs(mouse.ty - mouse.y) < 0.002 && !streamLive;
  if (still && frames % 2) return;
  renderScene(now);
}
requestAnimationFrame(tick);

// Debug handle (harmless in production): tweak CONFIG / material live from the console
window.__site = {
  scroll, CONFIG, logo, material, caPass, layout, relayout, QUALITY,
  get frames() { return frames; },
  // jump straight to scroll progress p (0..3) and draw that state now
  lock: false,
  jump(p) {
    if (introStart === -2 || performance.now() - introStart < 1400) introStart = performance.now() - 2000;  // intro finished
    scroll.target = scroll.current = clamp(p, 0, LAST); scroll.vel = 0; scroll.ab = 0;
    if (!layout.ready) relayout();
    const { k, f } = wordState(scroll.current);
    applyWords(k, f); updateCSS();
    if (layout.ready) { drawDust(k, f, performance.now() / 1000); if (clientsEl.classList.contains('is-on')) layoutRibbon(0.016, performance.now() / 1000); }
    renderScene(performance.now());
    return { k, f };
  },
  // draws word i's particle home positions in red over the resting word (alignment check)
  debugHomes(i) {
    const W = layout.words[i]; if (!W) return 0;
    dust.style.visibility = '';          // the canvas is hidden at rest; the next word change restores the normal state
    dctx.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
    dctx.clearRect(0, 0, layout.vw, layout.vh);
    dctx.fillStyle = '#ff0000'; dctx.globalAlpha = 1;
    for (let j = 0; j < W.n; j++) dctx.fillRect(W.p[j * 10] - 1, W.p[j * 10 + 1] - 1, 2, 2);
    return W.n;
  },
};
