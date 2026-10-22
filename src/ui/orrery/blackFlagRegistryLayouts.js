// Shipworks' registry is a reading lens over the existing hull, not another screen.
// Opening it replaces the fleet rail's handling text; the actual hull stays in view.
export function injectBlackFlagRegistryLayout(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('orr-blackflag-registry-layout')) return;
  const style = doc.createElement('style'); style.id = 'orr-blackflag-registry-layout';
  style.textContent = `
.orr-blackflag-registry { position:relative; min-width:0; pointer-events:auto; color:var(--dp-ink); }
.orr-blackflag-registry[hidden] { display:none!important; }
.orr-blackflag-registry > summary { cursor:pointer; min-height:44px; display:flex; align-items:center; gap:8px; font-family:var(--dp-face-body); font-size:14px; }
.orr-blackflag-registry > summary::before { content:'›'; font-size:20px; color:var(--dp-hand); }
.orr-blackflag-registry[open] > summary::before { content:'‹'; }
.sx-sw__rail:has(> .orr-blackflag-registry[open]) { z-index:30!important; overflow:visible!important; }
.sx-sw:has(.orr-blackflag-registry[open]) .sx-sw__stats { visibility:hidden!important; }
.orr-blackflag-registry[open] { position:absolute; left:0; top:0; bottom:0; width:min(390px,calc(100vw - 64px)); box-sizing:border-box; overflow:auto; overscroll-behavior:contain;
  padding:0 24px 24px 14px; background:linear-gradient(90deg,var(--dp-void,#05070a) 92%,transparent); }
.orr-blackflag-registry > div, .orr-blackflag-registry details { display:grid; gap:10px; min-width:0; }
.orr-blackflag-registry details:not([open]) > :not(summary) { display:none; }
.orr-blackflag-registry :is(p,h3,h4) { margin:0; max-width:100%; white-space:normal; overflow-wrap:anywhere; }
.orr-blackflag-registry p { font-family:var(--dp-face-body); font-size:14px; line-height:1.45; color:var(--dp-ink-dim); }
.orr-blackflag-registry h3 { font-family:var(--dp-face-display); font-size:22px; line-height:1.2; color:var(--dp-ink); }
.orr-blackflag-registry h4 { font-size:12px; }
.orr-blackflag-registry :is(button,details > summary) { min-height:44px; width:100%; box-sizing:border-box; padding:8px 0; font-family:var(--dp-face-body); font-size:14px; line-height:1.3;
  background:none; border:0; border-radius:0; box-shadow:none; text-align:left; white-space:normal; overflow-wrap:anywhere; color:var(--dp-ink); cursor:pointer; }
.orr-blackflag-registry button[aria-pressed=true] { color:var(--dp-hand); }
.orr-blackflag-registry button:disabled { color:var(--dp-ink-mute); cursor:default; }
.orr-blackflag-registry :is(button,summary):focus-visible { outline:1px solid var(--dp-phos); outline-offset:2px; }
.orr-blackflag-registry .orr-lampkey { width:auto; max-width:100%; }
@media (max-width:600px) {
  .orr-blackflag-registry[open] { position:fixed; left:14px; right:14px; top:clamp(100px,26dvh,220px); bottom:110px; width:auto; padding-right:20px; }
}
`;
  doc.head.appendChild(style);
}
