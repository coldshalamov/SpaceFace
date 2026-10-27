// Crucible door + plain-rearm composition sheet (bench ids `crucible`, `crucible-door`,
// `crucible-rearm`). The base compositions live in screenLayouts.js and
// cruciblePreparationLayouts.js; this sheet carries the door unit's findings from the bench:
//
// - The Encounter panel must fit its scroll viewport at both bench widths. At 1920x1080 the
//   arena row's words sat below the fold (nothing above them said more was there); at
//   1366x768 they were cut mid-glyph behind the foot. The four mode faces (Swarm, Gauntlet,
//   Foundry Block, Daily) shared a three-column grid that orphaned Daily on a second row of
//   dead space; one `auto-fit` row gives that height back to the room.
// - The panel head repeated the tab's numbering ("01 ENCOUNTER" above "01 · The fight"); the
//   head keeps its lead line and drops the repeated step word.
// - The arena strip reads by its words: the thumbs stay quiet textures, the chosen room's
//   name stands bright, exactly as the base sheet's comment intends ("the words carry the
//   choice, the hero carries the art").
// - The plain rearm (the Gauntlet's three-offer sheet — the swarm armory keeps its rail
//   composition under `.orr-armory`) balanced its offers vertically instead of stacking them
//   over a void, and its readings (wallet) stopped out-shouting the foot verbs.
// - The foot keycaps lose their boxed chips: the ORRERY foot voice is bare glyphs (pause, and
//   the refit's `.sf-cru-kbd` strip, already set that grammar).
// - Round two (this sitting): the arena strip still wrapped 5+2 at 1366x768 (99px floors to
//   five stops in the ~625px column), which pushed the whole Zone row below the fold — only
//   the orphaned "ZONE" label survived. 80px floors seven stops into that column (the names
//   condense on the width axis and wrap, never clip); at 1920 `auto-fit` still stretches them
//   to the same width as before. And at 1920x1080 the Zone row sat inside the stage's bottom
//   fade band: the pick rendered as a dark slab with its label hugging the top (a 76px tile
//   voice on a one-line pick) and the caption dimmed into the fade. The settings column now
//   keeps the Zone row clear of the fade at 1080 (tighter row rhythm, one-row arena strip,
//   the zone pick as a bare word tile over its own pressed amber underline) and above the
//   fold at 768, where the panel's lead line stands down — the foot hint already speaks it.
//
// Scoped to the existing screen classes; no new DOM, no new token root. Injected from the door
// and draft mounts AFTER cruciblePreparationLayouts so the doubled-class selectors below win
// the ties that sheet's !important rules set (same bump that file documents).
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'orr-crucible-door-style';
const BONE = '236 230 216';
// The prep sheet's door selector, with its door class doubled for the specificity bump.
const D = 'html body #screens > .k-screen.orr-crucible.sf-crucible-door.sf-crucible-door.orr-preparation[data-prep-step]';
// The plain draft: scored/block/circuit rearm and the degraded (no-SVG) armory. The visual
// armory keeps its rail composition (`.orr-armory` + `.orr-visual-armory`).
const RA = 'html body #screens > .k-screen.orr-crucible.sf-crucible-draft.sf-crucible-draft:not(.orr-armory)';
const FOOT = 'html body #screens .k-screen.orr-crucible:is(.sf-crucible-door, .sf-crucible-draft)';

export const CRUCIBLE_DOOR_LAYOUT_CSS = `
/* --- the Encounter panel fits its viewport ----------------------------------------------- */
/* One row of mode faces, whatever the profile has unlocked (four today, five with the Circuit).
   128px keeps four faces in the ~610px column of a 1366-wide window where 150px fell back to
   three plus an orphaned Daily; long words wrap inside the tile like the arena names do. */
${D} .sf-crd-modes { grid-template-columns:repeat(auto-fit, minmax(128px, 1fr)) !important; }
/* the arena strip is one calm row of named stops — all seven at either bench width (80px keeps
   seven inside the ~625px a 1366-wide window gives the row once the strip's gaps are paid;
   at 1920 auto-fit stretches them exactly as wide as the old 99px rule did) */
${D} .sf-crd-arenas { grid-template-columns:repeat(auto-fit, minmax(80px, 1fr)) !important; }
/* the head stops repeating the tab's step word; the lead line carries the row */
${D} .orr-prep-panelhead { margin:0 0 6px !important; }
${D} .orr-prep-panelhead-step { display:none !important; }
${D} .orr-prep-panelhead-line { margin:0 !important; }
${D} .orr-prep-daily { margin:2px 0 8px !important; }
/* the Encounter rows breathe one notch tighter (16px rhythm) so the Zone row — the ladder's
   entry point — clears the stage's bottom fade band at 1080 and the fold at 768 */
${D} .orr-prep-settings.orr-prep-settings { gap:16px !important; }
/* the mode faces keep the row's biggest art — trimmed just enough to hand the height to the
   rooms below (the short-viewport sheet's own trim stands untouched under 821px) */
@media (min-height:821px) {
  ${D} .sf-crd-modes .orr-tile { min-height:94px !important; padding:12px 8px 10px !important; }
  ${D} .sf-crd-modes .fh-tile-art { height:48px !important; }
  ${D} .sf-crd-modes .fh-tile-art svg { width:48px !important; height:48px !important; }
}
/* --- the zone pick is a word tile, not a slab --------------------------------------------- */
/* One checkpoint pick read as a dark 76px slab with its label at the top (a tile-height box on
   a one-line word). The zone row's voice is the tab's: a bare word sitting on the tile's own
   amber pressed underline (the prep sheet's .orr-tile::after already draws it) — never the
   gradient wash, which on the void stage reads as a muddy rectangle. */
${D} .sf-crd-zones .sf-crd-zone-pick { min-height:40px !important; padding:8px 0 10px !important;
  justify-content:flex-end !important; background:none !important; }
${D} .sf-crd-zones .sf-crd-zone-pick[aria-pressed="true"] { background:none !important; }
${D} .sf-crd-zones .sf-crd-zone-pick:is(:hover, :focus-visible) { background:none !important; }
${D} .sf-crd-zones .sf-crd-zone-pick:disabled { opacity:.4 !important; }
/* the zone caption speaks in the same reading voice as the mode and stake subs (it arrived at
   16px, a half-step louder than its neighbours) */
${D} .sf-crd-zone { font:400 14px/1.45 var(--dp-face-body, 'Instrument Sans'), sans-serif !important;
  letter-spacing:0 !important; color:rgb(${BONE} / .8) !important; margin:8px 0 0 !important; }
/* the arena strip's words wrap into two calm lines — the prep sheet's nowrap turns a narrow
   column into mid-word ellipses ("RICOC… FOUND…"), which is not a name anyone reads. Long
   rooms' names condense on the width axis (LAGRANGE is one 87px word in an 80px tile — it
   wraps, it does not clip); P10's condense-never-shrink. */
${D} .sf-crd-arenas .fh-tile-legend { white-space:normal !important; overflow:visible !important;
  text-overflow:clip !important; line-height:1.25 !important; letter-spacing:.1em !important;
  font-variation-settings:'wdth' 94 !important; }
/* --- short benches (the 768-high verdict) -------------------------------------------------- */
/* The Encounter panel must fit its scroll viewport here too: the same trim the mid sheet makes
   under 821px, carried one notch further so the Zone row — pick and caption — clears the fold
   instead of leaving an orphaned ZONE label at the edge. The panel's lead line stands down
   here as well: the foot hint ("01 — Choose the fight…") already speaks it. */
@media (max-height:820px) {
  ${D} .sf-crd-modes.sf-crd-modes .orr-tile { min-height:64px !important; padding:8px 6px !important; }
  ${D} .sf-crd-modes .fh-tile-art { height:30px !important; }
  ${D} .sf-crd-modes .fh-tile-art svg { width:30px !important; height:30px !important; }
  ${D} .sf-crd-arenas .fh-tile-art { height:28px !important; }
  ${D} .sf-crd-arenas .fh-tile-art img { height:28px !important; }
  ${D} .orr-prep-stake-number { font-size:22px !important; }
  ${D} .orr-prep-settings.orr-prep-settings { gap:12px !important; }
  ${D} .orr-prep-panelhead-line { display:none !important; }
  ${D} .orr-prep-daily { margin:0 0 6px !important; }
  ${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub) { margin-top:6px !important; }
  ${D} .sf-crd-zones .sf-crd-zone-pick { min-height:34px !important; padding:6px 0 8px !important; }
  ${D} .sf-crd-zone { margin:4px 0 0 !important; }
}
/* --- the arena strip reads by its words --------------------------------------------------- */
${D} .sf-crd-arenas .fh-tile-art img { width:100% !important; height:44px !important; object-fit:cover !important;
  opacity:.7 !important; filter:saturate(.8) !important; transition:opacity .18s linear, filter .18s linear; }
${D} .sf-crd-arenas .orr-tile:is(:hover, :focus-visible) .fh-tile-art img { opacity:.88 !important; filter:saturate(1) !important; }
${D} .sf-crd-arenas .orr-tile[aria-pressed="true"] .fh-tile-art img { opacity:1 !important; filter:saturate(1.05) !important; }
${D} .sf-crd-arenas .fh-tile-legend { font-size:12.5px !important; letter-spacing:.12em !important;
  color:rgb(${BONE} / .8) !important; }
${D} .sf-crd-arenas .orr-tile:is(:hover, :focus-visible) .fh-tile-legend { color:rgb(246 241 230) !important; }
${D} .sf-crd-arenas .orr-tile[aria-pressed="true"] .fh-tile-legend { color:rgb(246 241 230) !important;
  text-shadow:0 0 1px rgb(255 226 178 / .4); }
/* --- the plain rearm: one balanced sheet --------------------------------------------------- */
/* the stage is a column; the offers ride its middle (auto margins collapse to the top when a
   long shelf overflows, so nothing clips) */
${RA} > .k-stage { display:flex; flex-direction:column; }
${RA} .sf-cru-stage > .sf-cru-cards { margin-top:auto; margin-bottom:auto; width:min(1480px, 100%); align-self:center;
  align-items:stretch; }
${RA} .sf-cru-stage > .sf-cru-note { width:min(1480px, 100%); align-self:center; }
/* the wallet is a reading, not a shout: the foot verbs stay the loudest words down there */
${RA} .sf-cru-wallet { font-family:var(--dp-face-numeral, "Archivo") !important; font-variation-settings:normal;
  font-weight:500 !important; font-size:13px !important; font-variant-numeric:tabular-nums; letter-spacing:.08em;
  color:rgb(${BONE} / .85) !important; }
/* --- the foot keycaps are bare glyphs (pause and refit already set this voice) -------------- */
${FOOT} :is(.k-kbd, .dp-kbd, .sf-cru-kbd) { background:none !important; border:0 !important; box-shadow:none !important;
  border-radius:0 !important; padding:0 0 0 8px !important; color:rgb(${BONE} / .45) !important;
  font-size:12px !important; letter-spacing:.14em !important; }
${FOOT} :is(.k-kbd, .dp-kbd, .sf-cru-kbd) .k-kbd__paren { color:rgb(${BONE} / .3) !important; }
/* the deckplate back key's ESC chip is re-boxed by the prep sheet (all:unset + border at
   (1,9,1)); the crucible family's own voice is the bare glyph — ORRERY.md's pause grammar and
   screenLayouts' .sf-back strip both say so — so this out-specifies it */
${D} .k-foot .sf-back.k-word::after { all:unset !important; content:"ESC" / "" !important;
  display:inline-block !important; margin-left:14px !important; padding:0 !important;
  font:600 12px var(--dp-face-label, "Archivo") !important; letter-spacing:.2em !important;
  line-height:1 !important; text-transform:uppercase !important; color:rgb(${BONE} / .45) !important;
  background:none !important; border:0 !important; border-radius:0 !important;
  box-shadow:none !important; vertical-align:baseline !important; }
/* a short hero: the purse hairline collides with the arena line above it — the words climb and
   the rule retires (the 750 numeral still carries the purse) */
@media (max-height:820px) {
  ${D} .orr-prep-brief { border-top:0 !important; padding-top:8px !important; }
  ${D} .orr-door-hero__words { bottom:150px !important; }
}
/* reduced motion: the one transition this sheet adds follows the game's own setting */
html.sf-reduce-motion ${D} .sf-crd-arenas .fh-tile-art img { transition:none !important; }
`;

export function injectCrucibleDoorLayouts(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  injectOrrery(doc);
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CRUCIBLE_DOOR_LAYOUT_CSS;
  doc.head.appendChild(style);
}
