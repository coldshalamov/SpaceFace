// ORRERY skin for the flight HUD's remaining chrome (design/frontend/ORRERY.md §6 Flight, Phase 1).
//
// Some HUD pieces are owned by systems that already work and are pinned by tests (the discovery
// plate, the receipt lane, the floor caption, the dock prompt, the band key). Rebuilding them would
// buy nothing; what made them read as web UI was their CHROME — glass pills, a gradient card with a
// border and a 3 px bar, a metal plate. This sheet strips that chrome and re-sets the type in the
// ORRERY language: free type over the world, each block on its own edge-less pool of shadow, a thin
// ring of light where a card had a bar. Every rule is scoped to body[data-hud-skin="orrery"], which
// the Cluster mount sets, so the old look returns untouched if ORRERY is ever unmounted.
//
// No material imitation (the standing no-bevel law): no borders, no fills, no inner glows.

const STYLE_ID = 'sf-orrery-hud-skin';
const S = 'body[data-hud-skin="orrery"]';

// A pool of the void behind a block of free type; `inset` sizes it to the words.
const pool = (inset) => `content:""; position:absolute; inset:${inset}; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(3 4 7 / .72), rgb(3 4 7 / .4) 60%, transparent);`;
// The glyph halo every ORRERY label carries over a bright world.
const HALO = 'text-shadow:0 0 1px rgb(3 4 7 / .95), 0 0 3px rgb(3 4 7 / .85), 0 0 9px rgb(3 4 7 / .6);';

export const ORRERY_HUD_SKIN_CSS = `
/* ---- discovery: a codex fix — a ring of light, a beam down to the name, no card ---------------- */
${S} #hud .sf-discovery-plate { right:28px; min-width:0; max-width:380px; }
${S} #hud .sf-discovery-plate--in { transform:none; }
${S} #hud .sf-discovery-plate__frame {
  position:relative; padding:3px 0 4px 32px; background:none; border:0; box-shadow:none; ${HALO}
  background-image:linear-gradient(rgb(232 226 212 / .34), rgb(232 226 212 / .34));
  background-repeat:no-repeat; background-size:1px calc(100% - 30px); background-position:11px 25px; }
${S} #hud .sf-discovery-plate__frame::before { ${pool('-22px -40px -22px -14px')} }
${S} #hud .sf-discovery-plate__frame::after { content:""; position:absolute; left:8px; top:7px; width:6px; height:6px; border-radius:50%;
  background:rgb(236 230 216 / .95); box-shadow:0 0 0 3px rgb(232 226 212 / .08), 0 0 10px rgb(223 238 255 / .4); }
${S} #hud .sf-discovery-plate__kicker { font-family:var(--dp-face-label); font-stretch:112%; font-weight:600; font-size:10px; line-height:14px;
  letter-spacing:.22em; text-transform:uppercase; color:var(--dp-ink-dim, #b7b4a6); }
${S} #hud .sf-discovery-plate__title { font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-weight:800; font-size:23px;
  line-height:1; letter-spacing:-.01em; color:var(--dp-ink, #e8e2d4); margin-top:9px; }
${S} #hud .sf-discovery-plate__meta { font-family:var(--dp-face-numeral); font-weight:520; font-size:12px; letter-spacing:.06em;
  color:var(--dp-ink-dim, #b7b4a6); margin-top:7px; }

/* ---- receipts: signals, not cards — a small ring, the line of text, a pool of shadow ------------- */
${S} #hud .sf-toast { position:relative; background:none !important; box-shadow:none !important; border:0 !important;
  padding:3px 0 3px 24px; font-family:var(--dp-face-read, "Instrument Sans"); font-size:14px; line-height:1.35;
  color:var(--dp-ink, #e8e2d4); ${HALO} }
${S} #hud .sf-toast::before { ${pool('-12px -30px -12px -10px')} }
${S} #hud .sf-toast::after { content:""; position:absolute; left:0; top:50%; width:15px; height:1px;
  background:linear-gradient(90deg, transparent, rgb(232 226 212 / .75)); }
${S} #hud .sf-toast--warn::after, ${S} #hud .sf-toast--error::after, ${S} #hud .sf-toast--danger::after {
  height:1.5px; background:linear-gradient(90deg, transparent, var(--dp-danger, #ff5038)); box-shadow:0 0 6px rgb(255 80 56 / .35); }
${S} #hud .sf-toast__count { font-family:var(--dp-face-numeral); font-weight:700; font-size:11px; color:var(--dp-phos, #dfeeff);
  background:none; border:0; box-shadow:none; margin-left:8px; }

/* ---- the floor caption and the dock prompt: one line of light on the glass ---------------------- */
${S} .sf-alert.sf-alert--floor, ${S} .sf-alert.sf-alert--dock { position:relative; background:none !important; box-shadow:none !important;
  border:0 !important; ${HALO} }
${S} .sf-alert.sf-alert--floor::before, ${S} .sf-alert.sf-alert--dock::before { ${pool('-12px -36px')} }
${S} .sf-alert.sf-alert--floor { color:var(--dp-ink, #e8e2d4); }

/* ---- the band key: an engraved word and a lamp ring, lit only while a channel is tuned ---------- */
${S} #hud .sf-band-hud__button { position:relative; background:none !important; background-image:none !important; box-shadow:none !important;
  border:0 !important; padding:4px 0 4px 20px; font-family:var(--dp-face-label); font-stretch:112%; font-weight:600; font-size:10px;
  letter-spacing:.22em; text-transform:uppercase; color:var(--dp-ink-dim, #b7b4a6); ${HALO} }
${S} #hud .sf-band-hud__button::before { content:""; position:absolute; left:5px; top:50%; width:2px; height:11px; margin-top:-5.5px;
  background:rgb(232 226 212 / .42); }
${S} #hud .sf-band-hud__button:not([data-off="true"]) { color:var(--dp-ink, #e8e2d4); }
${S} #hud .sf-band-hud__button:not([data-off="true"])::before { background:var(--dp-phos, #dfeeff); box-shadow:0 0 8px rgb(223 238 255 / .6); }
${S} #hud .sf-band-hud__button:hover, ${S} #hud .sf-band-hud__button:focus-visible { color:var(--dp-ink, #e8e2d4); background:none !important; }

/* ---- the objective column: the objective is marked by an amber pin (the objective is one of amber's
   three jobs), not a 3 px side bar; its sections part by space, not hairlines; the comms tape loses
   the flight glass that made it a tab strip; the column stands on one pool of shadow ------------- */
${S} #hud > .sf-leftcontext > *, ${S} #hud > .sf-leftcontext > * + * { border-top:0 !important; }
${S} #hud > .sf-leftcontext > .sf-mission-tracker::before { top:13px; bottom:auto; left:5px; width:7px; height:7px; border-radius:0;
  transform:rotate(45deg); background:var(--dp-hand, #f2b950); box-shadow:0 0 9px rgb(242 185 80 / .55); }
/* the objective's bearing dial takes the pin's place when there is a bearing to show */
${S} #hud .sf-mission-tracker { position:relative; }
${S} #hud .sf-mission-tracker:not(.sf-mt--nobearing) { padding-left:52px !important; }
${S} #hud .sf-mission-tracker:not(.sf-mt--nobearing)::before { display:none; }
${S} #hud .sf-mission-tracker .sf-mt-dial { display:block !important; position:absolute; left:2px; top:50%; width:40px; height:40px; margin-top:-20px; overflow:visible; }
${S} #hud .sf-mission-tracker.sf-mt--nobearing .sf-mt-dial { display:none !important; }
${S} #hud .sf-mt-dial__ring { fill:rgb(4 6 9 / .55); stroke:rgb(232 226 212 / .5); stroke-width:1; }
${S} #hud .sf-mt-dial__ticks { stroke:rgb(232 226 212 / .55); stroke-width:1; fill:none; }
${S} #hud .sf-mt-dial__needle { transform-box:view-box; transform-origin:17px 17px; transition:transform .45s cubic-bezier(.3, 1.3, .5, 1); }
${S} #hud .sf-mt-dial__needle path { fill:var(--dp-hand, #f2b950); }
${S} #hud .sf-mt-dial__needle circle { fill:rgb(4 6 9); stroke:var(--dp-hand-hot, #ffd98c); stroke-width:1.2; }
html.sf-reduce-motion ${S} #hud .sf-mt-dial__needle { transition:none; }
${S} #hud .sf-commtape, html ${S} #hud .sf-commtape { background:none !important; background-color:transparent !important; box-shadow:none !important; border:0 !important; }
${S} #hud > .sf-leftcontext::before { ${pool('-18px -60px -24px -24px')} }
${S} #hud > .sf-leftcontext { ${HALO} }

/* ---- the BAND tape: the headline gets its own line instead of the slack beside three words ------ */
${S} #hud .sf-commtape { flex-wrap:wrap; row-gap:7px; }
${S} #hud .sf-commtape__news { flex:1 0 100%; order:5; }

/* ---- the radar: its frame is ORRERY light drawn outside the canvas, so the wrap must not clip ---- */
${S} #hud .sf-radar-wrap--orrery { position:relative; contain:layout style; overflow:visible; }
/* the dial stops clipping (its frame lives outside the rim); the canvas keeps its own circle mask */
${S} #hud .sf-radar-wrap--orrery .sf-radar { overflow:visible; contain:layout style; }
${S} #hud .sf-radar-wrap--orrery .sf-radar canvas { clip-path:circle(50%); }
/* the kit bezel, face ring and north caret are the old instrument's chrome; the frame replaces them */
${S} #hud .sf-radar-wrap--orrery :is(.sf-kit-radar__bezel, .sf-kit-radar__face, .sf-kit-radar__n) { display:none; }
${S} #hud .sf-radar-wrap--orrery .sf-radar-objective-key { margin-top:26px; font-family:var(--dp-face-label); font-stretch:112%;
  font-weight:600; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--dp-hand, #f2b950); ${HALO} }

html.sf-reduce-motion ${S} #hud .sf-discovery-plate { transition:opacity .2s linear; }
@media (forced-colors: active) {
  ${S} #hud .sf-discovery-plate__frame::after, ${S} #hud .sf-toast::after, ${S} #hud .sf-band-hud__button::before { box-shadow:none; border:1px solid CanvasText; }
}
`;

/** Inject the skin once and switch it on for this document. Returns a function that switches it off. */
export function applyOrreryHudSkin(doc = globalThis.document) {
  if (!doc || !doc.head || !doc.body) return () => {};
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = ORRERY_HUD_SKIN_CSS;
    doc.head.appendChild(style);
  }
  doc.body.dataset.hudSkin = 'orrery';
  return () => { if (doc.body.dataset.hudSkin === 'orrery') delete doc.body.dataset.hudSkin; };
}
