// The centre word for a first success (20_THE_FIRST_HOUR rule 4, "one feel in both doors").
// Swarm speaks these through its announcer column; Adventure has no such column, so this is the
// same word, same size and ink, in the same upper-centre seat, for about 1.3 s, then it hands
// back. It shares the one callout voice (calloutVoice.js): a first beat is priority 4 and outranks
// kill words, danger-grade lines still win. Reduced motion draws it still.
import { claimCalloutVoice } from './calloutVoice.js';

export const FIRST_BEAT_CENTRE_TTL_MS = 1300;
export const FIRST_BEAT_EVENT = 'callout:firstBeat';
const STYLE_ID = 'sf-firstbeat-css';
const CSS = `
.sf-firstbeat { position:fixed; left:50%; top:13vh; transform:translateX(-50%); z-index:14;
  pointer-events:none; font-family:var(--dp-face-etch, var(--sf-subhead-face, system-ui, sans-serif));
  font-weight:800; font-size:30px; letter-spacing:.22em; text-transform:uppercase; white-space:nowrap;
  color:var(--dp-lamp, #f2b950); text-shadow:var(--dp-emit, 0 0 18px rgb(232 226 212 / .3));
  animation:sf-firstbeat-in .22s ease-out; }
.sf-firstbeat[hidden] { display:none; }
html.sf-reduce-motion .sf-firstbeat { animation:none; }
@keyframes sf-firstbeat-in { from { opacity:0; transform:translateX(-50%) scale(1.12); } to { opacity:1; transform:translateX(-50%) scale(1); } }
`;

let live = null;

export function ensureFirstBeatCentre({ bus = null, doc = globalThis.document } = {}) {
  if (live) return live;
  if (!bus || typeof bus.on !== 'function' || !doc || !doc.createElement || !doc.body) return null;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  const node = doc.createElement('div');
  node.className = 'sf-firstbeat';
  node.hidden = true;
  node.setAttribute('role', 'status');
  doc.body.appendChild(node);
  let timer = null;
  const off = bus.on(FIRST_BEAT_EVENT, (p) => {
    const text = p && typeof p.text === 'string' ? p.text : '';
    if (!text) return;
    if (!claimCalloutVoice(`fb:${text}`, 4, FIRST_BEAT_CENTRE_TTL_MS)) return;
    node.textContent = text;
    node.hidden = false;
    // Restart the entrance each time.
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = '';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { node.hidden = true; timer = null; }, FIRST_BEAT_CENTRE_TTL_MS);
  });
  live = {
    node,
    destroy() {
      if (timer) clearTimeout(timer);
      if (typeof off === 'function') off();
      if (node.parentNode) node.parentNode.removeChild(node);
      live = null;
    },
  };
  return live;
}

export function releaseFirstBeatCentre() {
  if (live) live.destroy();
}
