// src/ui/orrery/codexLayouts.js — the Codex screen's own layout corrections, layered after
// archiveLayouts.js (which styles the whole archive family). Injected by screens/codex.js right
// after injectArchiveLayouts(), so equal-specificity rules here win by document order.
//
// WHY each rule exists (bench evidence, .devshots/ui-bench/, shot ids codex + codex-record):
// 1. READING WIDTH. With the plate on, the stage reserved plate(637px at 1080p) + 3vw, so the
//    reading column measured ~350px — under the k-measure's authored 60ch — and long display words
//    clipped mid-word at the article's overflow edge ("GALAXY CARTOGRAI…", "…TAKE IT PERSONALL";
//    Discoveries and Graffiti arrivals, 1920×1080). The plate hands back ~100px at big viewports
//    (it stays the screen's hero at 540px) and the display cap trims 40→38px there, so the longest
//    authored words fit with margin. Scales and gauges are untouched.
// 2. NO-CLIP NET. A display word wider than its column breaks instead of painting past the edge.
// 3. EXTENT GUTTER. The reading's scroll-extent thumb rode at the article's text edge, crossing
//    the hero numeral ("12") and brushing caps labels; it rides the stage gutter at every width,
//    as archiveLayouts already did for the ≤1100px short windows.
// 4. POINTER FOCUS. The search field's lit underline answered :focus-visible only, so a click gave
//    the field no visible response (ui-bench walk: "Search Codex — no visible change"). Pointer
//    focus now lights the same rule and the lens glyph, keyboard and mouse alike.

const STYLE_ID = 'sf-orrery-codex-layouts';
const BONE = '236 230 216';
const INK = 'rgb(248 244 234)';
const CX = 'html body #screens > .k-screen.of-codex.orr-archive.orr-archive';

const CSS = `
/* 1 — the reading gets its measure back where the viewport is a real desktop (1080p and up):
       the plate keeps the hero (540px), the stage reserves a tighter gap beside it. */
@media (min-width:1500px) and (min-height:900px) {
  ${CX} { --cx-plate:min(540px, 52vh, 30vw); }
  ${CX}[data-plate="on"] > .k-stage { padding-right:calc(var(--cx-plate) + clamp(22px, 2.4vw, 46px)) !important; }
  /* the display title trims 40→38px so the longest single word ("CARTOGRAPHY", "PERSONALLY.")
     fits the wider column with margin; still display-scale, still Archivo 125 */
  ${CX} .sf-codex-entry > h2, ${CX} .sf-codex-entry > h2 .k-signal, ${CX} .sf-codex-entry > h2 .k-38 {
    font-size:clamp(24px, min(2vw, 3.8vh), 38px) !important; }
}
/* 2 — no display word ever paints past the reading's edge again */
${CX} .sf-codex-entry > h2 { overflow-wrap:break-word; }
/* 3 — the extent thumb rides the stage gutter at every width, clear of the numeral and labels
     (matches the ≤1100px short-window rule already in archiveLayouts) */
${CX} > .k-stage > .sf-codex-entry > .orr-extent::before { left:-10px !important; }
/* 4 — the search answers a pointer focus the way it answers a keyboard focus */
${CX} .cx-search .sf-codex-search:focus { outline:none !important;
  background:linear-gradient(0deg, ${INK} 1.5px, transparent 1.5px) 0 100% / 100% 100% no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .4) 0 1px, transparent 1px 12px) 0 100% / 100% 5px no-repeat !important; }
${CX} .cx-search:focus-within::before { box-shadow:inset 0 0 0 2px rgb(252 250 244 / .95); }
${CX} .cx-search:focus-within::after { background:rgb(252 250 244 / .95); }
`;

/** Inject the Codex's own composition layer once (after the archive sheet). */
export function injectCodexLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return;
  if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
