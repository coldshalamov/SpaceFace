// ORRERY tokens and base primitives (design/frontend/ORRERY.md §3).
//
// ORRERY extends the Deckplate token root (--dp-*); it never starts a fifth token system. The only
// new tokens are the ones Deckplate had no word for: the void, the glass, data-in-motion ice, the
// Hand, and the bloom/stroke/motion constants every instrument shares.
//
// Motion follows the GAME's setting (html.sf-reduce-motion), never the OS media query alone: the
// owner's Windows has animation effects off, and inheriting that silently stripped every effect in
// the game once already (2026-09-20). Reduce is a choice the player makes in Settings.

export const ORRERY_STYLE_ID = 'sf-orrery-style';

export const ORRERY_CSS = `
:root {
  --dp-void:#05070a;
  --dp-glass:rgb(8 11 16 / .62);
  --dp-glass-deep:rgb(6 8 12 / .82);
  --dp-ice:#8fcbff;
  --dp-hand:var(--dp-lamp, #f2b950);
  --dp-hand-hot:var(--dp-lamp-hot, #ffd98c);
  /* the rest-state light of every ring, scale and rule: warm bone, never blue (ORRERY §3.3) */
  --dp-line:rgb(232 226 212 / .30);
  --dp-line-faint:rgb(232 226 212 / .14);
  --dp-line-hi:rgb(232 226 212 / .62);
  --dp-bloom-a:.22;
  --dp-stroke:1px;
  --dp-stroke-live:1.5px;
  --dp-stroke-gauge:3px;
  /* type roles (Archivo is variable: width 62-125, weight 100-900) */
  --dp-face-numeral:"Archivo", "Instrument Sans", system-ui, sans-serif;
  --dp-face-label:"Archivo", "Instrument Sans", system-ui, sans-serif;
  --dp-face-code:"Spline Sans Mono", ui-monospace, monospace;
  --dp-ease-out:cubic-bezier(.16, 1, .3, 1);
  --dp-ease-over:cubic-bezier(.34, 1.36, .64, 1);
  --dp-d-in:520ms;
  --dp-d-out:180ms;
}

/* Typographic roles */
.orr-numeral {
  font-family:var(--dp-face-numeral); font-stretch:100%; font-weight:280;
  font-variant-numeric:tabular-nums lining-nums; letter-spacing:-.02em; line-height:.86;
  color:var(--dp-phos, #dfeeff);
}
.orr-label {
  font-style:normal; font-family:var(--dp-face-label); font-stretch:112%; font-weight:600; font-size:11px;
  letter-spacing:.12em; text-transform:uppercase; line-height:1; color:var(--dp-ink-dim, #b7b4a6);
}
.orr-value {
  font-family:var(--dp-face-numeral); font-stretch:100%; font-weight:520; font-size:15px;
  font-variant-numeric:tabular-nums; letter-spacing:0; line-height:1; color:var(--dp-ink, #e8e2d4);
}
.orr-display {
  font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-weight:800;
  letter-spacing:-.01em; line-height:.9; color:var(--dp-ink, #e8e2d4);
}

/* Vector light: the core line and its bloom are two strokes of one path, never a live filter. */
.orr-svg { overflow:visible; display:block; }
.orr-svg .orr-core { fill:none; stroke-linecap:round; vector-effect:non-scaling-stroke; }
/* A bloom that sets its own opacity attribute keeps it: a class rule beats a presentation attribute,
   and an unconditional opacity here once lit every socket's hidden armed glow (the bronze donuts). */
.orr-svg .orr-bloom { fill:none; stroke-linecap:round; vector-effect:non-scaling-stroke; }
.orr-svg .orr-bloom:not([opacity]) { opacity:var(--dp-bloom-a); }
.orr-svg .orr-rest { stroke:var(--dp-line); }
.orr-svg .orr-faint { stroke:var(--dp-line-faint); }
.orr-svg .orr-hi { stroke:var(--dp-line-hi); }
.orr-svg .orr-phos { stroke:var(--dp-phos, #dfeeff); }
.orr-svg .orr-hand { stroke:var(--dp-hand); }
.orr-svg .orr-threat { stroke:var(--dp-danger, #ff5038); }
.orr-svg .orr-ice { stroke:var(--dp-ice); }
.orr-svg text { font-family:var(--dp-face-label); font-stretch:112%; font-weight:600; letter-spacing:.14em; fill:var(--dp-ink-dim, #b7b4a6); }
/* engraved micro-lettering on rings: equipment labelling, not reading text */
.orr-svg .orr-micro text { font-weight:600; letter-spacing:.32em; fill:rgb(232 226 212 / .42); }

/* Drift: the outer tick rings turn slowly, on the compositor. */
.orr-drift { transform-box:view-box; animation:orr-drift var(--orr-drift-s, 900s) linear infinite; }
.orr-drift--rev { animation-direction:reverse; }
@keyframes orr-drift { to { transform:rotate(360deg); } }

/* Arrival: rings draw themselves (pathLength=1), then settle. */
.orr-draw { stroke-dasharray:1 1; stroke-dashoffset:1; animation:orr-draw 520ms var(--dp-ease-out) forwards; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-draw { to { stroke-dashoffset:0; } }
.orr-spin-in { transform-box:view-box; animation:orr-spin-in 700ms var(--dp-ease-out) both; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-spin-in { from { transform:rotate(-34deg); opacity:0; } to { transform:none; opacity:1; } }
.orr-rise { animation:orr-rise 420ms var(--dp-ease-out) both; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-rise { from { opacity:0; transform:translateY(6px); filter:blur(3px); } to { opacity:1; transform:none; filter:none; } }

/* Rolling counter: each digit is a column of 0-9 that rolls to its value. */
.orr-counter { display:inline-flex; overflow:hidden; line-height:1; height:1em; vertical-align:baseline; }
.orr-counter__digit { display:inline-block; position:relative; width:.62em; height:1em; overflow:hidden; }
.orr-counter__digit > span { position:absolute; left:0; top:0; display:flex; flex-direction:column; transition:transform 560ms var(--dp-ease-over); }
.orr-counter__digit > span > i { font-style:normal; height:1em; line-height:1; text-align:center; }
.orr-counter__sep { display:inline-block; white-space:pre; }

html.sf-reduce-motion .orr-drift, html.sf-reduce-motion .orr-spin-in, html.sf-reduce-motion .orr-rise { animation:none; }
html.sf-reduce-motion .orr-draw { animation:none; stroke-dashoffset:0; }
html.sf-reduce-motion .orr-counter__digit > span { transition:none; }
`;

export function injectOrrery(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(ORRERY_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = ORRERY_STYLE_ID;
  style.textContent = ORRERY_CSS;
  doc.head.appendChild(style);
}
