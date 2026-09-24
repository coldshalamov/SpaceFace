// src/ui/orrery/lampKey.js — the Lamp Key (design/frontend/ORRERY.md §3.6, §4 #10): the one primary
// verb on a screen. An amber field with dark ink and one 45-degree cut at the top right, a slow sheen
// that crosses it, a ripple on press; and for an irreversible verb the Hold Ring: an arc of light
// that fills round a ring at the key's left end while the key is held, and empties if it is let go
// early. The ring reads the hold from `--sf-hold-p` (0..1), which src/ui/kit/holdVerb.js clocks.
//
// A screen dresses its existing button; the word, the handlers and the attributes stay its own.
// The station's one Lamp Key is the tab's commit verb (Accept, Trade, Buy); Undock stays a word.

import { injectOrrery } from './tokens.js';

export const LAMPKEY_STYLE_ID = 'orr-lampkey-style';
const BONE = '236 230 216';

const CSS = `
.orr-lampkey { position:relative; display:inline-flex !important; align-items:center; gap:0; min-height:44px !important; height:auto !important;
  padding:0 26px 0 20px !important; margin:0; border:0 !important; border-radius:0 !important; background:none !important; box-shadow:none !important; clip-path:none !important;
  color:#1c1406 !important; cursor:pointer; overflow:visible !important; isolation:isolate; text-shadow:none !important;
  font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125% !important; font-variation-settings:"wdth" 125, "wght" 800 !important; font-weight:800 !important;
  font-size:15px !important; letter-spacing:.14em !important; text-transform:uppercase; line-height:1 !important; }
.orr-lampkey::before { content:"" !important; position:absolute !important; z-index:-1; inset:0 !important; display:block !important; width:auto !important; height:auto !important; margin:0 !important;
  background:var(--dp-hand, #f2b950) !important; clip-path:polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 0 100%) !important; box-shadow:none !important; border:0 !important;
  transition:background .16s linear; }
/* the sheen: a band of light crossing the field every six seconds */
.orr-lampkey::after { content:"" !important; position:absolute !important; z-index:-1; inset:0 !important; display:block !important; pointer-events:none;
  clip-path:polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 0 100%) !important; border:0 !important; box-shadow:none !important;
  background:linear-gradient(112deg, transparent 38%, rgb(255 250 236 / .42) 50%, transparent 62%) !important; background-size:60% 100% !important; background-repeat:no-repeat !important;
  background-position:-80% 0 !important; animation:orr-lampkey-sheen 6s linear infinite; }
@keyframes orr-lampkey-sheen { 0% { background-position:-80% 0; } 22% { background-position:180% 0; } 100% { background-position:180% 0; } }
.orr-lampkey > .orr-lampkey__word { position:relative; z-index:1; }
.orr-lampkey:not(:disabled):is(:hover, :focus-visible)::before { background:var(--dp-hand-hot, #ffd98c) !important; }
.orr-lampkey:focus-visible { outline:1px solid rgb(255 217 140 / .9) !important; outline-offset:4px !important; }
.orr-lampkey:not(:disabled):active { transform:translateY(1px); }
.orr-lampkey:disabled { cursor:default; color:rgb(${BONE} / .55) !important; }
.orr-lampkey:disabled::before { background:rgb(${BONE} / .3) !important; }
.orr-lampkey:disabled::after { display:block !important; inset:1px !important; animation:none !important; background:rgb(6 8 11 / .96) !important; background-size:auto !important;
  clip-path:polygon(0 0, calc(100% - 12.6px) 0, 100% 12.6px, 100% 100%, 0 100%) !important; }
/* the hold ring: a 1px track, the fill an arc of the Hand, a bright bead at its leading edge; it hangs at the
   key's right end so the key never moves and a scrolling reading never clips it */
.orr-lampkey[data-hold] { margin-left:0 !important; margin-right:76px !important; }
.orr-lampkey .dp-holdring { position:absolute !important; left:auto !important; right:-74px !important; top:50% !important; width:58px !important; height:58px !important; margin:-29px 0 0 !important;
  display:block !important; border-radius:50% !important; vertical-align:baseline !important; flex:none !important; background:none !important;
  -webkit-mask:none !important; mask:none !important; }
/* the ring itself is the span's own light, masked to a band; the bead is a child and stays unmasked */
.orr-lampkey .dp-holdring::before { content:""; position:absolute; inset:0; border-radius:50%;
  background:conic-gradient(var(--dp-hand, #f2b950) calc(var(--sf-hold-p, 0) * 360deg), rgb(${BONE} / .26) 0 332deg, rgb(255 80 56 / .8) 332deg 360deg);
  -webkit-mask:radial-gradient(circle, transparent 26.2px, #000 26.6px, #000 28px, transparent 28.4px);
  mask:radial-gradient(circle, transparent 26.2px, #000 26.6px, #000 28px, transparent 28.4px); }
.orr-lampkey .dp-holdring > .orr-lampkey__bead { position:absolute; left:0; top:0; width:100%; height:100%; margin:0; pointer-events:none;
  transform:rotate(calc(var(--sf-hold-p, 0) * 360deg)); opacity:0; transition:opacity .12s linear; }
.orr-lampkey .orr-lampkey__bead::before { content:""; position:absolute; left:50%; top:1.7px; width:6px; height:6px; margin:-3px 0 0 -3px; border-radius:50%;
  background:var(--dp-hand-hot, #ffd98c); box-shadow:0 0 8px 2px rgb(255 217 140 / .6); }
.orr-lampkey.orr-lampkey--small { min-height:38px !important; font-size:13.5px !important; }
.orr-lampkey.orr-lampkey--small[data-hold] { margin-left:0 !important; margin-right:62px !important; }
.orr-lampkey.orr-lampkey--small .dp-holdring { left:auto !important; right:-60px !important; width:46px !important; height:46px !important; margin-top:-23px !important; }
.orr-lampkey.orr-lampkey--small .dp-holdring::before { -webkit-mask:radial-gradient(circle, transparent 20.2px, #000 20.6px, #000 22px, transparent 22.4px);
  mask:radial-gradient(circle, transparent 20.2px, #000 20.6px, #000 22px, transparent 22.4px); }
.orr-lampkey.orr-lampkey--small .orr-lampkey__note { left:auto; right:-60px; width:46px; top:calc(50% + 27px); }
.orr-lampkey.is-holding .orr-lampkey__bead { opacity:1; }
.orr-lampkey .orr-lampkey__note { position:absolute; left:auto; right:-74px; top:calc(50% + 34px); width:58px; text-align:center; pointer-events:none;
  font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:8.5px; letter-spacing:.2em; text-transform:uppercase; color:rgb(${BONE} / .6); white-space:nowrap; }
html.sf-reduce-motion .orr-lampkey::after { animation:none; }
`;

export function injectLampKey(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(LAMPKEY_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = LAMPKEY_STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/**
 * Dress a screen's own button as the Lamp Key. With `hold`, the button carries `data-hold` and its
 * `.dp-holdring` (from attachHoldVerb) becomes the Hold Ring; `note` is the word under the ring.
 * The bead's var is read from the ring, so the caller's hold clock drives both.
 */
export function dressLampKey(button, { hold = false, note = '' } = {}) {
  if (!button || typeof button.classList !== 'object') return button;
  const doc = button.ownerDocument || globalThis.document;
  injectLampKey(doc);
  button.classList.add('orr-lampkey');
  if (!button.querySelector || !button.querySelector('.orr-lampkey__word')) {
    // wrap the loose word so it can stand above the field
    const word = doc.createElement('span');
    word.className = 'orr-lampkey__word';
    const first = [...button.childNodes].find((n) => n.nodeType === 3 ? n.textContent.trim() : (n.nodeType === 1 && !n.classList.contains('dp-holdring')));
    if (first) { button.insertBefore(word, first); word.appendChild(first); }
  }
  if (hold) {
    button.setAttribute('data-hold', '1');
    const ring = button.querySelector && button.querySelector('.dp-holdring');
    if (ring && !ring.querySelector('.orr-lampkey__bead')) {
      const bead = doc.createElement('span');
      bead.className = 'orr-lampkey__bead';
      bead.setAttribute('aria-hidden', 'true');
      ring.appendChild(bead);
    }
    if (note && button.querySelector && !button.querySelector('.orr-lampkey__note')) {
      const n = doc.createElement('span');
      n.className = 'orr-lampkey__note';
      n.setAttribute('aria-hidden', 'true');
      n.textContent = note;
      button.appendChild(n);
    }
  }
  return button;
}
