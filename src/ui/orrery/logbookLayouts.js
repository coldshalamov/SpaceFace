import { injectOrrery } from './tokens.js';

// ui-polish-392: `.orr-logbook-recap` upgrades from an unbound Newgrounds plate
// (glass-deep fill, no border / no radius) to the promise-scale hairline card
// (1px bone ~18% / radius 10 / faint fill). Same family as #898–#903.
const BONE = '236 230 216';

export function injectLogbookLayouts(doc = globalThis.document) {
  injectOrrery(doc);
  if (!doc?.head || doc.getElementById('sf-logbook-layout')) return;
  const style = doc.createElement('style'); style.id = 'sf-logbook-layout';
  style.textContent = `
  .orr-logbook-recap { position:absolute; z-index:21; left:50%; top:12%; transform:translateX(-50%);
    width:min(680px,calc(100vw - 48px)); max-height:72vh; overflow:auto; padding:24px;
    box-sizing:border-box;
    color:var(--dp-ink);
    border:1px solid rgb(${BONE} / .18);
    border-radius:10px;
    background:rgb(${BONE} / .025);
    pointer-events:auto; }
  .orr-logbook-recap[hidden] { display:none; }
  .orr-logbook-recap .k-eyebrow { color:var(--dp-hand); font:600 12px var(--dp-face-label); letter-spacing:.12em; }
  .orr-logbook-recap h2 { margin:12px 0; font:650 clamp(20px,3vw,34px)/1.1 var(--dp-face-display); }
  .orr-logbook-recap p { font:400 16px/1.5 var(--dp-face-body); max-width:56ch; }
  .orr-logbook-recap img { float:right; width:38%; aspect-ratio:16/9; object-fit:cover; margin:0 0 12px 20px; }
  .orr-logbook-recap .k-words { clear:both; margin-top:16px; }
  /* short / narrow frames: compress card chrome with the shared densify bands */
  @media (max-height:820px) { .orr-logbook-recap { border-radius:8px; } }
  @media (max-height:460px) { .orr-logbook-recap { border-radius:8px; } }
  @media (max-height:400px) { .orr-logbook-recap { border-radius:6px; } }
  @media (max-width:760px) { .orr-logbook-recap { border-radius:8px; } }
  @media(max-width:600px) { .orr-logbook-recap { top:8%; padding:18px; } .orr-logbook-recap img { float:none; width:100%; max-height:160px; margin:0 0 12px; } }
  `;
  doc.head.appendChild(style);
}
