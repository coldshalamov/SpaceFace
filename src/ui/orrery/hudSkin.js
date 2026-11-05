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
${S} #hud .sf-discovery-plate__kicker { font-family:var(--dp-face-label); font-stretch:112%; font-weight:600; font-size: 12px; line-height:14px;
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
${S} #hud .sf-toast--discovery::after {
  height:1.5px; background:linear-gradient(90deg, transparent, var(--dp-phos, #dfeeff)); box-shadow:0 0 6px var(--dp-phos-halo, rgb(150 210 255 / .35)); }
${S} #hud .sf-toast__count { font-family:var(--dp-face-numeral); font-weight:700; font-size: 12px; color:var(--dp-phos, #dfeeff);
  background:none; border:0; box-shadow:none; margin-left:8px; }

/* ---- the floor caption and the dock prompt: one line of light on the glass ---------------------- */
${S} .sf-alert.sf-alert--floor, ${S} .sf-alert.sf-alert--dock { position:relative; background:none !important; box-shadow:none !important;
  border:0 !important; ${HALO} }
${S} .sf-alert.sf-alert--floor::before, ${S} .sf-alert.sf-alert--dock::before { ${pool('-12px -36px')} }
${S} .sf-alert.sf-alert--floor { color:var(--dp-ink, #e8e2d4); }

/* ---- the band key: a compact instrument pill, lit while a channel is tuned ---------------------- */
${S} #hud .sf-band-hud__button { position:relative; background:linear-gradient(180deg, rgb(18 22 30 / .90), rgb(11 14 20 / .90)) !important;
  box-shadow:inset 0 1px 0 rgb(255 255 255 / .06), 0 8px 20px -6px rgb(0 0 0 / .65) !important;
  border:1px solid rgb(236 230 216 / .14) !important; border-radius:4px !important;
  padding:5px 10px 5px 22px; font-family:var(--dp-face-read, "Instrument Sans", sans-serif); font-stretch:100%; font-weight:500; font-size:12px;
  letter-spacing:.05em; text-transform:uppercase; color:var(--dp-ink-dim, #b7b4a6); transition:border-color 120ms ease, color 120ms ease; }
${S} #hud .sf-band-hud__button::before { content:""; position:absolute; left:9px; top:50%; width:5px; height:5px; margin-top:-2.5px; border-radius:50%;
  background:rgb(232 226 212 / .36); }
${S} #hud .sf-band-hud__button:not([data-off="true"]) { color:var(--dp-ink, #e8e2d4); border-color:rgb(223 238 255 / .28) !important; }
${S} #hud .sf-band-hud__button:not([data-off="true"])::before { background:var(--dp-phos, #dfeeff); box-shadow:0 0 8px rgb(223 238 255 / .6); }
${S} #hud .sf-band-hud__button:hover, ${S} #hud .sf-band-hud__button:focus-visible { color:var(--dp-ink-hi, #f4f1ea); border-color:rgb(236 230 216 / .28) !important; }

/* ---- the objective column: structured dark instrument card with crisp 1px hairline dividers ----- */
${S} #hud > .sf-leftcontext {
  background:linear-gradient(180deg, rgb(16 20 28 / .90), rgb(11 14 20 / .90)) !important;
  border:1px solid rgb(236 230 216 / .13) !important;
  border-radius:4px !important;
  box-shadow:inset 0 1px 0 rgb(255 255 255 / .06), 0 12px 28px -8px rgb(0 0 0 / .72) !important;
  padding:2px 0 !important;
  font-family:var(--dp-face-read, "Instrument Sans", sans-serif);
}
${S} #hud > .sf-leftcontext::before { display:none !important; }
${S} #hud > .sf-leftcontext > * { padding:8px 12px !important; }
${S} #hud > .sf-leftcontext > * + * { border-top:1px solid rgb(236 230 216 / .08) !important; }
${S} #hud > .sf-leftcontext > .sf-mission-tracker::before { top:13px; bottom:auto; left:8px; width:6px; height:6px; border-radius:0;
  transform:rotate(45deg); background:var(--dp-hand, #f2b950); box-shadow:0 0 9px rgb(242 185 80 / .55); }
/* the objective's bearing dial takes the pin's place when there is a bearing to show */
${S} #hud .sf-mission-tracker { position:relative; }
${S} #hud .sf-mission-tracker:not(.sf-mt--nobearing) { padding-left:52px !important; }
${S} #hud .sf-mission-tracker:not(.sf-mt--nobearing)::before { display:none; }
${S} #hud .sf-mission-tracker .sf-mt-dial { display:block !important; position:absolute; left:8px; top:50%; width:36px; height:36px; margin-top:-18px; overflow:visible; }
${S} #hud .sf-mission-tracker.sf-mt--nobearing .sf-mt-dial { display:none !important; }
${S} #hud .sf-mt-dial__ring { fill:rgb(4 6 9 / .65); stroke:rgb(232 226 212 / .42); stroke-width:1; }
${S} #hud .sf-mt-dial__ticks { stroke:rgb(232 226 212 / .48); stroke-width:1; fill:none; }
${S} #hud .sf-mt-dial__needle { transform-box:view-box; transform-origin:17px 17px; transition:transform .45s cubic-bezier(.3, 1.3, .5, 1); }
${S} #hud .sf-mt-dial__needle path { fill:var(--dp-hand, #f2b950); }
${S} #hud .sf-mt-dial__needle circle { fill:rgb(4 6 9); stroke:var(--dp-hand-hot, #ffd98c); stroke-width:1.2; }
html.sf-reduce-motion ${S} #hud .sf-mt-dial__needle { transition:none; }
${S} #hud .sf-mt-obj { font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important; font-size:13px !important; font-weight:500 !important;
  line-height:1.4 !important; letter-spacing:.015em; word-spacing:.08em; color:var(--dp-ink-hi, #f4f1ea) !important; }
${S} #hud .sf-mt-time { font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important; font-size:12px !important;
  letter-spacing:.02em; word-spacing:.08em; color:var(--dp-ink-dim, #9ba3b0) !important; }
${S} #hud .sf-commtape, html ${S} #hud .sf-commtape { background:none !important; background-color:transparent !important; box-shadow:none !important; border:0 !important; }

/* ---- the BAND tape: clean pill buttons for COMMS/HAIL and full-width news headline -------------- */
${S} #hud .sf-commtape { flex-wrap:wrap; row-gap:6px; align-items:center; justify-content:space-between; }
${S} #hud .sf-commtape__band { font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important; font-variation-settings:normal !important;
  font-size:12px; font-weight:600; letter-spacing:.05em; color:var(--dp-ink-dim, #9ba3b0) !important; text-shadow:none !important; }
${S} #hud .sf-commtape .sf-comm-backlog-btn, ${S} #hud .sf-commtape .sf-contact-hail__button {
  padding:2px 8px !important; border-radius:3px !important; border:1px solid rgb(236 230 216 / .12) !important;
  background:rgb(255 255 255 / .035) !important; font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important;
  font-variation-settings:normal !important; font-size:12px !important; font-weight:500 !important;
  letter-spacing:.03em !important; color:var(--dp-ink, #e8e2d4) !important; text-shadow:none !important;
  transition:background 120ms ease, border-color 120ms ease, color 120ms ease;
}
${S} #hud .sf-commtape .sf-comm-backlog-btn:hover, ${S} #hud .sf-commtape .sf-contact-hail__button:hover:not([disabled]) {
  background:rgb(255 255 255 / .08) !important; border-color:rgb(236 230 216 / .24) !important; color:var(--dp-ink-hi, #f4f1ea) !important;
}
${S} #hud .sf-commtape .sf-contact-hail__button[disabled] { opacity:.45; border-color:rgb(236 230 216 / .06) !important; background:transparent !important; }
${S} #hud .sf-commtape .sf-fx-comms-trace { min-width:36px; opacity:.55; }
${S} #hud .sf-commtape__news { flex:1 0 100%; order:5; padding-top:4px; border-top:1px solid rgb(236 230 216 / .06); }
${S} #hud .sf-news-ticker { font-family:var(--dp-face-read, "Instrument Sans", sans-serif); font-size:12px; line-height:1.35; color:var(--dp-ink-dim, #b7b4a6); }

/* ---- the radar: its frame is ORRERY light drawn outside the canvas, so the wrap must not clip ---- */
${S} #hud .sf-target:not([hidden]):not(:empty),
${S} #hud #sf-sector-law:not([hidden]):not(:empty),
${S} #hud .sf-cargo-panel:not([hidden]):not(:empty) {
  background:linear-gradient(180deg, rgb(16 20 28 / .90), rgb(11 14 20 / .90)) !important;
  border:1px solid rgb(236 230 216 / .13) !important;
  border-radius:4px !important;
  box-shadow:inset 0 1px 0 rgb(255 255 255 / .06), 0 12px 28px -8px rgb(0 0 0 / .72) !important;
  padding:10px 12px !important;
  font-family:var(--dp-face-read, "Instrument Sans", sans-serif);
  letter-spacing:.015em;
  word-spacing:.08em;
}
${S} #hud .sf-target { text-align:left !important; gap:6px !important; }
${S} #hud .sf-target__head { align-items:flex-start !important; justify-content:space-between !important; gap:8px !important; }
${S} #hud .sf-target__name {
  font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important;
  font-size:13px !important; font-weight:600 !important; line-height:1.3 !important;
  letter-spacing:.01em !important; word-spacing:.08em !important;
  color:var(--dp-ink-hi, #f4f1ea) !important; text-shadow:none !important;
}
${S} #hud .sf-target__faction {
  font-family:var(--dp-face-num, "Spline Sans Mono", monospace) !important;
  font-size:12px !important; font-weight:500 !important; letter-spacing:.04em !important;
}
${S} #hud .sf-target__threat {
  padding:0 !important; border:0 !important; background:none !important;
  gap:6px !important; font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important;
  font-size:12px !important; font-weight:600 !important; letter-spacing:.05em !important;
}
${S} #hud .sf-target__rangerow { gap:8px !important; align-items:center !important; margin-top:1px !important; }
${S} #hud .sf-target__rangebar { height:3px !important; border-radius:1.5px !important; background:rgb(236 230 216 / .16) !important; }
${S} #hud .sf-target__dist {
  font-family:var(--dp-face-num, "Spline Sans Mono", monospace) !important;
  font-size:12px !important; font-weight:600 !important; font-variant-numeric:tabular-nums !important;
  color:var(--dp-phos, #dfeeff) !important;
}
${S} #hud .sf-target__closing {
  display:inline-flex !important; align-items:center !important; gap:4px !important;
  font-family:var(--dp-face-num, "Spline Sans Mono", monospace) !important;
  font-size:12px !important; font-variant-numeric:tabular-nums !important;
}
${S} #hud .sf-target__engaged {
  padding:2px 0 2px 8px !important; border:0 !important; border-left:2px solid var(--dp-lamp, #f2b950) !important;
  border-radius:0 !important; background:none !important;
  font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important;
  font-size:12px !important; font-weight:600 !important; line-height:1.3 !important;
  letter-spacing:.02em !important; word-spacing:.08em !important;
}
${S} #hud .sf-target__engaged [data-glyph],
${S} #hud .sf-target__weak [data-glyph],
${S} #hud .sf-target__component [data-glyph] {
  display:inline-flex !important; vertical-align:-2px !important; margin-right:5px !important;
}
${S} #hud .sf-target__intent {
  font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important;
  font-size:12px !important; font-weight:500 !important;
  letter-spacing:.02em !important; word-spacing:.08em !important;
  color:var(--dp-ink, #e8e2d4) !important;
}
${S} #hud .sf-target__meta {
  font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important;
  font-size:12px !important; letter-spacing:.03em !important; word-spacing:.08em !important;
  color:var(--dp-ink-dim, #9ba3b0) !important;
}
${S} #hud .sf-target__more {
  margin-top:2px !important; padding-top:5px !important;
  border-top:1px solid rgb(236 230 216 / .08) !important;
  justify-content:space-between !important;
  font-family:var(--dp-face-read, "Instrument Sans", sans-serif) !important;
  font-size:12px !important; font-weight:600 !important; letter-spacing:.06em !important;
  color:var(--dp-ink-dim, #9ba3b0) !important;
}
${S} #hud #sf-ml2 .ml2-pill {
  padding:4px 10px !important;
  border-radius:4px !important;
  border:1px solid rgb(236 230 216 / .13) !important;
  background:linear-gradient(180deg, rgb(16 20 28 / .90), rgb(11 14 20 / .90)) !important;
  box-shadow:inset 0 1px 0 rgb(255 255 255 / .05), 0 6px 16px -4px rgb(0 0 0 / .65) !important;
  font:500 12px/1.3 var(--dp-face-read, "Instrument Sans", sans-serif) !important;
  letter-spacing:.04em !important;
  color:var(--dp-ink, #e8e2d4) !important;
}
${S} #hud #sf-ml2 .ml2-pill .ml2-fill {
  width:64px !important;
  height:3px !important;
  border-radius:1.5px !important;
  background:rgb(236 230 216 / .18) !important;
}
${S} #hud .sf-radar-wrap--orrery { position:relative; contain:layout style; overflow:visible; }
/* the dial stops clipping (its frame lives outside the rim); the canvas keeps its own circle mask */
${S} #hud .sf-radar-wrap--orrery .sf-radar { overflow:visible; contain:layout style; }
${S} #hud .sf-radar-wrap--orrery .sf-radar canvas { clip-path:circle(50%); }
/* a pool of shade under the whole instrument, so its rim and glows stand off a bright world behind it */
${S} #hud .sf-radar-wrap--orrery .sf-radar::before { content:""; position:absolute; left:50%; top:50%; width:158%; height:158%; transform:translate(-50%, -50%); border-radius:50%;
  pointer-events:none; z-index:-1; background:radial-gradient(closest-side, rgb(4 6 9 / .8), rgb(4 6 9 / .62) 58%, rgb(4 6 9 / 0)); }
/* the kit bezel, face ring and north caret are the old instrument's chrome; the frame replaces them */
${S} #hud .sf-radar-wrap--orrery :is(.sf-kit-radar__bezel, .sf-kit-radar__face, .sf-kit-radar__n) { display:none; }
${S} #hud .sf-radar-wrap--orrery .sf-radar-objective-key { margin-top:18px; font-family:var(--dp-face-read, "Instrument Sans", sans-serif); font-stretch:100%;
  font-weight:600; font-size:12px; letter-spacing:.05em; font-variant-numeric:tabular-nums; text-transform:uppercase; color:var(--dp-hand, #f2b950); ${HALO} }

/* ---- the contact roster: a ladder of words on a lit spine, never a plate with row rules ------- */
${S} #hud .sf-overview { background:none !important; border:0 !important; box-shadow:none !important; overflow:visible !important; position:relative; isolation:isolate;
  padding:2px 12px 4px 24px !important; border-radius:0 !important; }
${S} #hud .sf-overview::before { content:"" !important; display:block !important; position:absolute; inset:-16px -26px -14px -30px; z-index:-1; pointer-events:none;
  background:radial-gradient(ellipse closest-side, rgb(3 4 7 / .9), rgb(3 4 7 / .66) 62%, rgb(3 4 7 / 0)) !important; }
${S} #hud .sf-overview::after { content:""; position:absolute; left:4px; top:6px; bottom:6px; width:6px; pointer-events:none;
  background:linear-gradient(90deg, transparent 2px, rgb(232 226 212 / .62) 2px 4px, transparent 4px), linear-gradient(90deg, rgb(232 226 212 / .24) 0 6px); }
${S} #hud .sf-overview-row { border:0 !important; background:none !important; box-shadow:none !important; padding:5px 10px 5px 8px !important; position:relative; ${HALO} }
${S} #hud .sf-overview-row::before { content:""; position:absolute; left:-22px; top:50%; width:13px; height:2px; margin-top:-1px; background:rgb(232 226 212 / .6); pointer-events:none; }
${S} #hud .sf-overview-row:hover { background:none !important; }
${S} #hud .sf-overview-row:hover::before { background:rgb(255 252 244); }
${S} #hud .sf-overview-row.selected { background:none !important; box-shadow:none !important; }
${S} #hud .sf-overview-row.selected::before { width:19px; left:-24px; height:3px; margin-top:-1.5px; background:var(--dp-hand, #f2b950); box-shadow:0 0 10px 2px rgb(242 185 80 / .55); }
${S} #hud .sf-overview-row.selected .sf-overview-row__name { color:var(--dp-hand-hot, #ffd98c); text-shadow:none; }
/* 720p rail discipline (craft critic 2026-10-26): a callsign may take a second line, but only
   at word boundaries — hud.js writes a WORD JOINER after every hyphen so "Choir-Tender" never
   splits; the state word rides in the right datum cluster beside the tier segments so the name
   lane is wholly the callsign's and a wrapped name can never kern into "NEUTRAL". The run sits
   one level inside __name (hud.js) so this clip box is also the run's own edge. */
${S} #hud .sf-overview-row__left { flex:1 1 auto; min-width:0; overflow:hidden; }
${S} #hud .sf-overview-row__name { flex:0 1 auto; min-width:0; overflow:hidden; overflow-wrap:break-word; }
${S} #hud .sf-overview-row__state { flex:0 0 auto; margin-left:2px; }
${S} #hud .sf-overview-row__right { color:rgb(223 238 255 / .92); font-variant-numeric:tabular-nums; }
${S} #hud .sf-overview-row__detail { color:rgb(232 226 212 / .7); }
${S} #hud .sf-overview-footer { color:rgb(232 226 212 / .7); background:none !important; }

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
