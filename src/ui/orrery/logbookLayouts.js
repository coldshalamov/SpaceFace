import { injectOrrery } from './tokens.js';

export function injectLogbookLayouts(doc = globalThis.document) {
  injectOrrery(doc);
  if (!doc?.head || doc.getElementById('sf-logbook-layout')) return;
  const style = doc.createElement('style'); style.id = 'sf-logbook-layout';
  style.textContent = `
  .orr-logbook-recap { position:absolute; z-index:21; left:50%; top:12%; transform:translateX(-50%);
    width:min(680px,calc(100vw - 48px)); max-height:72vh; overflow:auto; padding:24px;
    color:var(--dp-ink); background:var(--dp-glass-deep); pointer-events:auto; }
  .orr-logbook-recap[hidden] { display:none; }
  .orr-logbook-recap .k-eyebrow { color:var(--dp-hand); font:600 12px var(--dp-face-label); letter-spacing:.12em; }
  .orr-logbook-recap h2 { margin:12px 0; font:650 clamp(20px,3vw,34px)/1.1 var(--dp-face-display); }
  .orr-logbook-recap p { font:400 16px/1.5 var(--dp-face-body); max-width:56ch; }
  .orr-logbook-recap img { float:right; width:38%; aspect-ratio:16/9; object-fit:cover; margin:0 0 12px 20px; }
  .orr-logbook-recap .k-words { clear:both; margin-top:16px; }
  @media(max-width:600px) { .orr-logbook-recap { top:8%; padding:18px; } .orr-logbook-recap img { float:none; width:100%; max-height:160px; margin:0 0 12px; } }
  `;
  doc.head.appendChild(style);
}
