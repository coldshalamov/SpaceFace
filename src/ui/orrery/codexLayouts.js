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
// 5. UNLOCK STATUS CARDS. The seven unlock counts were loose type over a bare bar, and at
//    961–1400px the fixed 64–69px cells let GRAFFITI run into ENDGAME (1280×720, 960×540). Each
//    count now sits in its own hairline card sized to its label, the bar drawn along the card's
//    foot, so the readings never touch and the header reads as one set. Phones and the
//    640–760px wrap keep their own compact layout.
// 6. SHORT DENSIFY LEDGER∩CLOSE. archiveCssSource's very-short densify bands stop at
//    max-height:460px, so the standard short-desktop height 461 (651/700/801×461) keeps the
//    22px section rungs + foot-gap margin and LEDGER paints through ‹ CLOSE (mash area ~1092 at
//    700×461, ~2376 at 801×461). Lift those compressions through max-height:519 so all ten
//    section words clear the foot on first paint.
// 7. CARD FOOT SURVIVES THE FADE. archiveCssSource masks an overflowing reading's last 44px (28px on
//    short phones) to show there is more, but the mask covered the whole border box, so the card's
//    hairline sides dissolved and its foot edge vanished — the card read as unfinished, open at the
//    bottom (1280×720, 960×540). The fade now runs on the inside only; a second mask layer keeps
//    the 1px border ring opaque, so the card stays closed while the lore still fades under its foot.

const STYLE_ID = 'sf-orrery-codex-layouts';
const BONE = '236 230 216';
const INK = 'rgb(248 244 234)';
const CX = 'html body #screens > .k-screen.of-codex.orr-archive.orr-archive';
const CX_PHONE = 'html:root[data-sf-mobile="1"] body #screens > .k-screen.of-codex.orr-archive.orr-archive';
const FADE_MASK = `linear-gradient(180deg, #000 calc(100% - var(--cx-fade, 44px)), transparent) border-box,
    linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0) border-box`;

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
/* Keep the archive action above the reading fade in short windows. */
@media (max-height:600px) {
  ${CX} .sf-codex-entry > .cx-play { margin-top:6px !important; }
}
/* 5 — each unlock count is a hairline card sized to its label; the bar runs along its foot */
@media (min-width:761px) {
  ${CX} .cx-index__list { gap:0 clamp(6px, .6vw, 10px) !important; }
  ${CX} .cx-index__item { box-sizing:border-box; width:auto; min-width:clamp(60px, 4.6vw, 84px);
    padding:7px clamp(8px, .7vw, 12px) 0; overflow:hidden; border:1px solid rgb(${BONE} / .16);
    border-radius:6px; background:rgb(12 12 14 / .55); }
  ${CX} .cx-index__w { white-space:nowrap; margin-bottom:6px !important; }
  ${CX} .cx-index__bar { box-sizing:content-box; width:calc(100% + 2 * clamp(8px, .7vw, 12px)); margin:0;
    border-radius:0; }
}
/* 7 — the reading fade stays inside the card; the hairline ring (outer box minus padding box) stays whole */
${CX} > .k-stage > .sf-codex-entry[data-overflow="1"]:not(.is-at-end),
${CX_PHONE} > .k-stage > .sf-codex-entry[data-overflow="1"]:not(.is-at-end) {
  -webkit-mask:${FADE_MASK}; -webkit-mask-composite:source-over, xor;
  mask:${FADE_MASK}; mask-composite:add, exclude; }
@media (max-height:560px) { ${CX_PHONE} > .k-stage > .sf-codex-entry { --cx-fade:28px; } }
@media (min-width:761px) and (max-width:1100px) {
  ${CX} .cx-index__item { min-width:52px; padding:3px 6px 0; }
  ${CX} .cx-index__w { margin-bottom:3px !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 650 !important; }
  ${CX} .cx-index__bar { width:calc(100% + 12px); }
}
/* 6 — Short densify 640–800 × ≤519: archiveCssSource's twin band stops at max-height:460, so
   651/700×461 keep 22px rungs + foot-gap and LEDGER∩CLOSE (area 672 / 1092). Zero the foot-gap,
   drop rungs to 18px, and thin the title/index so all ten section words clear the foot. */
@media (max-width:800px) and (min-width:640px) and (max-height:519px) {
  ${CX} { padding-top:14px !important; padding-bottom:8px !important; row-gap:8px !important; --cx-foot-gap:0px; }
  ${CX} > .k-title > :is(h1, .k-t-title, .k-display) { font-size:30px !important; line-height:1 !important; }
  ${CX} > .k-title > p { margin-top:4px !important; line-height:1.3 !important; }
  ${CX} .cx-index { row-gap:1px !important; }
  ${CX} .cx-index__item { grid-template-rows:34px auto; width:48px; min-width:48px; padding:3px 4px 0; }
  ${CX} .cx-index__dial { width:34px; height:34px; }
  ${CX} .cx-index__w { margin-top:1px !important; margin-bottom:2px !important; line-height:1.05 !important; }
  ${CX} > .k-hang { row-gap:6px; }
  ${CX} .cx-search .sf-codex-search { height:24px !important; }
  ${CX} .cx-search::before { top:3px; }
  ${CX} .cx-search::after { top:13px; }
  ${CX} > .k-hang > .sf-tabbar { margin-bottom:0 !important; padding:0 !important; }
  ${CX} .sf-tabbar .sf-tab { font-size:12px !important; letter-spacing:.06em !important; }
  ${CX} .cx-ladder .k-row { padding-top:2px !important; padding-bottom:1px !important; }
  ${CX} .cx-ladder .k-row::before { top:10px !important; }
  ${CX} > .k-hang > .cx-ladder { padding-bottom:6px !important; }
  ${CX} > .k-foot .sf-back.k-word { padding:4px 0 6px !important; min-height:32px !important; }
}
/* 6b — Short densify 801–1100 × ≤519: same miss at 801×461 (Catalog∩Close + Ledger∩Close area
   2376). Mirror the ≤460 very-short band so the section scale and foot both fit above the fold. */
@media (max-width:1100px) and (min-width:801px) and (max-height:519px) {
  ${CX} { padding-top:14px !important; padding-bottom:8px !important; row-gap:8px !important; --cx-plate:min(138px, 38vh, 17vw); --cx-foot-gap:0px; }
  ${CX} > .k-title > :is(h1, .k-t-title, .k-display) { font-size:30px !important; line-height:1 !important; }
  ${CX} > .k-title > p { margin-top:4px !important; font-size:12.5px !important; line-height:1.3 !important; }
  ${CX} .cx-index { row-gap:2px; }
  ${CX} .cx-index__cap { font-size:12px !important; }
  ${CX} .cx-index__item { grid-template-rows:38px auto; width:58px; min-width:52px; padding:3px 4px 0; }
  ${CX} .cx-index__dial { width:38px; height:38px; }
  ${CX} .cx-index__n { font-size:12px !important; }
  ${CX} .cx-index__of { font-size:12px; }
  ${CX} .cx-index__w { margin-top:1px !important; margin-bottom:2px !important; font-size:12px !important; line-height:1.1 !important; }
  ${CX} > .k-hang { row-gap:6px; }
  ${CX} .cx-search .sf-codex-search { height:24px !important; }
  ${CX} .cx-search::before { top:3px; }
  ${CX} .cx-search::after { top:13px; }
  ${CX} > .k-hang > .sf-tabbar { margin-bottom:0 !important; padding:0 !important; }
  ${CX} .sf-tabbar .sf-tab { font-size:12px !important; letter-spacing:.06em !important; }
  ${CX} .cx-ladder .k-row { padding-top:2px !important; padding-bottom:1px !important; }
  ${CX} .cx-ladder .k-row::before { top:10px !important; }
  ${CX} > .k-hang > .cx-ladder { padding-bottom:10px !important; }
  ${CX} > .cx-plate-host { top:calc(100% - 48px - var(--cx-plate)); }
  ${CX}[data-plate="on"] > .k-stage { padding-right:calc(var(--cx-plate) + 20px) !important; }
  ${CX}[data-plate="on"] > .k-hang > .cx-ladder { padding-bottom:calc(var(--cx-foot-gap, 0px) + 36px) !important; }
  ${CX} > .k-foot .sf-back.k-word { padding:4px 0 6px !important; min-height:32px !important; }
}
/* Compact sections remain real controls: reserve a 28px target. Keep names on one line
   (no mid-word wrap / no clip): reclaim pad-right + wdth 100 under the scrollable column's
   overflow:hidden. Column owns overflow instead of Ledger∩Close or 18px hit areas. */
@media (min-width:640px) and (max-width:1100px) and (max-height:519px) {
  ${CX} > .k-hang > .sf-tabbar {
    min-height:0; overflow:hidden auto; overscroll-behavior:contain;
    scrollbar-width:thin; scroll-padding-block:4px;
  }
  ${CX} .sf-tabbar > li { flex:0 0 auto; }
  ${CX} .sf-tabbar .sf-tab {
    height:auto !important; min-height:28px !important; padding-block:4px !important;
    padding-right:4px !important; /* reclaim tick gutter so DISCOVERIES fits under overflow:hidden */
    white-space:nowrap !important; overflow-wrap:normal; word-break:normal; line-height:1.2 !important;
    letter-spacing:0 !important; font-stretch:100% !important;
    font-variation-settings:"wdth" 100, "wght" 650 !important;
  }
  ${CX} .sf-tabbar .sf-tab:focus-visible {
    outline:2px solid var(--dp-hand, #f2b950) !important; outline-offset:-2px;
  }
}
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
