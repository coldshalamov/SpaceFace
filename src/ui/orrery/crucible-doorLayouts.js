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

// THE SWARM FRONT (04_SWARM.md §7, cruciblePreparation.createSwarmPlayFront): the key art full
// bleed, one gold PLAY, three remembered picks. While the front shows, every other child of the
// door stands down; More hands the whole screen back to the setup composition above.
// Type: Archivo (display) for the title only; Instrument Sans for every label, value and button;
// Spline Sans Mono only inside the key caps. Spacing on a 4 px grid; picks pad 12/16.
const PV = 'html body #screens > .k-screen.sf-crucible-door.sf-crucible-door';
const PF = `${PV}[data-door-view="play"] > .sf-play`;
const SWARM_FRONT_CSS = `
${PV}.sf-crucible-door.sf-crucible-door.sf-crucible-door[data-door-view="play"][data-door-view] > :not(.sf-play):not(.sf-play) { display:none !important; }
${PV}:not([data-door-view="play"]) > .sf-play { display:none !important; }
${PF} { position:absolute; inset:0; z-index:3; display:block; overflow:hidden; margin:0;
  background:var(--dp-metal-0, #0b0d10); color:var(--dp-ink, #e8e2d4);
  font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif); text-transform:none; letter-spacing:0; }
${PF} .sf-play__art { position:absolute; inset:0; overflow:hidden; }
${PF} .sf-play__img { position:absolute; inset:-2%; width:104%; height:104%; object-fit:cover; object-position:64% 50%;
  opacity:0; transition:opacity 280ms ease-out; }
${PF} .sf-play__img.is-on { opacity:1; animation:sf-play-drift 30s ease-in-out infinite alternate; }
@keyframes sf-play-drift { from { transform:scale(1) translate3d(0, 0, 0); } to { transform:scale(1.06) translate3d(-1.2%, -.8%, 0); } }
${PF} .sf-play__shade { position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(90deg, rgb(8 9 12 / .95) 0%, rgb(8 9 12 / .88) 36%, rgb(8 9 12 / .42) 60%, rgb(8 9 12 / .04) 100%),
    linear-gradient(0deg, rgb(8 9 12 / .72) 0%, rgb(8 9 12 / 0) 28%); }
${PF} .sf-play__room { position:absolute; right:40px; bottom:28px; margin:0; max-width:40%; text-align:right;
  font:700 13px/1.2 var(--dp-face-etch, "Archivo", sans-serif); letter-spacing:.24em; text-transform:uppercase;
  color:rgb(232 226 212 / .7); text-shadow:0 1px 8px rgb(0 0 0 / .8); }
${PF} .sf-play__panel { position:absolute; left:clamp(24px, 5vw, 72px); top:50%; transform:translateY(-50%);
  width:min(560px, calc(100% - 48px)); max-height:calc(100% - 32px); overflow:auto; overscroll-behavior:contain;
  display:flex; flex-direction:column; scrollbar-width:thin; }
${PF} .sf-play__kicker { margin:0 0 4px; font:600 12px/1.25 var(--dp-face-read, "Instrument Sans", sans-serif);
  letter-spacing:.2em; text-transform:uppercase; color:var(--dp-lamp, #f2b950); }
${PF} .sf-play__title { margin:0; font:800 64px/.95 var(--dp-face-display, "Archivo", sans-serif); letter-spacing:0;
  text-transform:uppercase; color:#f6f1e6; text-shadow:0 2px 24px rgb(0 0 0 / .5); }
${PF} .sf-play__pitch { margin:12px 0 20px; max-width:48ch; font:400 15px/1.45 var(--dp-face-read, "Instrument Sans", sans-serif);
  color:var(--dp-ink-dim, #b7b4a6); }
${PF} .sf-play__picks { display:flex; flex-direction:column; gap:8px; }
${PF} .sf-play-pick { display:grid; grid-template-columns:112px minmax(0, 1fr) 32px 32px;
  grid-template-areas:"label face prev next" "label line line line"; align-items:center; column-gap:4px; row-gap:0;
  padding:8px 12px 8px 16px; background:rgb(14 17 22 / .84); border:1px solid rgb(232 226 212 / .1); border-radius:4px;
  transition:border-color 140ms ease-out, background-color 140ms ease-out, box-shadow 140ms ease-out; }
${PF} .sf-play-pick:hover { border-color:rgb(232 226 212 / .22); }
${PF} .sf-play-pick:focus-within { border-color:rgb(242 185 80 / .72); background:rgb(22 23 27 / .92);
  box-shadow:inset 3px 0 0 var(--dp-lamp, #f2b950); }
${PF} .sf-play-pick__label { grid-area:label; font:600 12px/1.25 var(--dp-face-read, "Instrument Sans", sans-serif);
  letter-spacing:.12em; text-transform:uppercase; color:var(--dp-ink-mute, #b0aea6); }
${PF} .sf-play-pick__step { width:32px; height:32px; margin:0; padding:0; display:grid; place-items:center; cursor:pointer;
  background:transparent; border:1px solid transparent; border-radius:4px; color:var(--dp-ink-dim, #b7b4a6); box-shadow:none;
  transition:color 140ms ease-out, background-color 140ms ease-out, border-color 140ms ease-out, transform 120ms ease-out; }
${PF} .sf-play-pick__step:first-of-type { grid-area:prev; }
${PF} .sf-play-pick__step:last-of-type { grid-area:next; }
${PF} .sf-play-pick__step:hover { color:#f6f1e6; background:rgb(232 226 212 / .08); border-color:rgb(232 226 212 / .18); }
${PF} .sf-play-pick__step:active { transform:translateY(1px); background:rgb(232 226 212 / .14); }
${PF} .sf-play-pick__step[hidden] { display:grid !important; visibility:hidden; }
${PF} .sf-play-pick__step svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2;
  stroke-linecap:round; stroke-linejoin:round; }
${PF} .sf-play-pick__face { grid-area:face; display:flex; align-items:center; gap:8px; min-width:0; }
${PF} .sf-play-pick__thumb { width:36px; height:36px; flex:none; object-fit:contain; filter:drop-shadow(0 2px 6px rgb(0 0 0 / .6)); }
${PF} .sf-play-pick__thumb[hidden] { display:none !important; }
${PF} .sf-play-pick__opts { min-width:0; flex:1; }
${PF} .sf-play-pick__opt { display:block; width:100%; min-height:32px; margin:0; padding:4px; text-align:left; cursor:pointer;
  background:none; border:0; border-radius:2px; box-shadow:none; outline:none;
  font:600 18px/1.3 var(--dp-face-read, "Instrument Sans", sans-serif); letter-spacing:0; text-transform:none;
  color:#f6f1e6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:color 140ms ease-out; }
${PF} .sf-play-pick__opt[hidden] { display:none !important; }
${PF} .sf-play-pick__opt:hover { color:var(--dp-lamp-hot, #ffd98c); }
${PF} .sf-play-pick__opt:focus-visible { color:var(--dp-lamp-hot, #ffd98c); }
${PF} .sf-play-pick__line { grid-area:line; margin:0; padding:0 4px 2px; font:400 13px/1.35 var(--dp-face-read, "Instrument Sans", sans-serif);
  color:var(--dp-ink-dim, #b7b4a6); }
${PF} .sf-play-pick--sub { margin-top:-4px; padding:4px 12px 6px 16px; border-top-color:rgb(232 226 212 / .04);
  border-top-left-radius:0; border-top-right-radius:0; background:rgb(14 17 22 / .74); }
${PF} .sf-play-pick--sub .sf-play-pick__opt { font-size:15px; min-height:28px; }
${PF} .sf-play-pick--sub .sf-play-pick__label { letter-spacing:.1em; }
${PF} .sf-play__go { margin:20px 0 0; height:56px; width:100%; display:flex; align-items:center; justify-content:center; gap:16px;
  cursor:pointer; border:0; border-radius:4px; color:#17120a;
  background:linear-gradient(180deg, #f8c962 0%, #e3a73f 100%);
  font:700 20px/1 var(--dp-face-read, "Instrument Sans", sans-serif); letter-spacing:.18em; text-transform:uppercase;
  box-shadow:0 8px 24px rgb(242 185 80 / .24), inset 0 1px 0 rgb(255 240 200 / .6);
  transition:transform 140ms ease-out, box-shadow 160ms ease-out, filter 140ms ease-out; }
${PF} .sf-play__go:hover { filter:brightness(1.08); box-shadow:0 10px 32px rgb(242 185 80 / .38), inset 0 1px 0 rgb(255 240 200 / .7); }
${PF} .sf-play__go:focus-visible { outline:2px solid #ffe7b0; outline-offset:3px; }
${PF} .sf-play__go:active { transform:translateY(1px) scale(.995); filter:brightness(.96); box-shadow:0 4px 12px rgb(242 185 80 / .2); }
${PF} .sf-play__key { display:inline-flex; align-items:center; height:24px; padding:0 8px; border-radius:3px;
  border:1px solid rgb(23 18 10 / .4); font:600 12px/1 var(--dp-face-code, "Spline Sans Mono", ui-monospace, monospace);
  letter-spacing:.06em; text-transform:uppercase; }
${PF} .sf-play__alt { margin-top:12px; display:flex; flex-wrap:wrap; gap:8px; }
${PF} .sf-play__quiet { height:40px; margin:0; padding:0 16px; display:inline-flex; align-items:center; gap:12px; cursor:pointer;
  background:rgb(14 17 22 / .78); border:1px solid rgb(232 226 212 / .16); border-radius:4px; box-shadow:none;
  color:var(--dp-ink, #e8e2d4); font:600 14px/1 var(--dp-face-read, "Instrument Sans", sans-serif); letter-spacing:.04em;
  text-transform:none; transition:border-color 140ms ease-out, background-color 140ms ease-out, transform 120ms ease-out; }
${PF} .sf-play__quiet:hover { border-color:rgb(232 226 212 / .36); background:rgb(28 30 36 / .92); }
${PF} .sf-play__quiet:focus-visible { outline:2px solid var(--dp-lamp, #f2b950); outline-offset:2px; }
${PF} .sf-play__quiet:active { transform:translateY(1px); }
${PF} .sf-play__quiet-sub { font-weight:400; font-size:13px; letter-spacing:0; color:var(--dp-ink-mute, #b0aea6); }
${PF} .sf-play__back { margin-left:auto; }
${PF} .sf-play__key--quiet { border-color:rgb(232 226 212 / .26); color:var(--dp-ink-mute, #b0aea6); }
/* short windows (1366x650): the same stack, a little tighter */
@media (max-height:700px) {
  ${PF} .sf-play__title { font-size:52px; }
  ${PF} .sf-play__pitch { margin:8px 0 16px; font-size:14px; }
  ${PF} .sf-play-pick { padding:6px 12px 6px 16px; }
  ${PF} .sf-play__go { margin-top:16px; height:52px; }
}
/* phones: the art is a band across the top, the panel fills the rest and scrolls */
@media (max-width:640px) {
  ${PF} .sf-play__art { bottom:auto; height:34%; }
  ${PF} .sf-play__img { object-position:50% 50%; }
  ${PF} .sf-play__shade { background:linear-gradient(180deg, rgb(8 9 12 / .1) 0%, rgb(8 9 12 / .6) 22%, rgb(8 9 12 / .96) 36%, rgb(8 9 12 / 1) 100%); }
  ${PF} .sf-play__room { display:none; }
  ${PF} .sf-play__panel { left:16px; right:16px; width:auto; top:auto; bottom:16px; transform:none; max-height:calc(100% - 96px); }
  ${PF} .sf-play__title { font-size:44px; }
  ${PF} .sf-play__pitch { font-size:14px; margin:8px 0 16px; }
  ${PF} .sf-play-pick { grid-template-columns:minmax(0, 1fr) 32px 32px; grid-template-areas:"label label label" "face prev next" "line line line";
    padding:8px 8px 8px 12px; }
  ${PF} .sf-play-pick__line { padding:0 4px 2px; }
  ${PF} .sf-play__back { margin-left:auto; }
  ${PF} :is(.sf-play__quiet-sub, .sf-play__key) { display:none; }
}
@media (prefers-reduced-motion:reduce) {
  ${PF} .sf-play__img.is-on { animation:none; }
  ${PF} :is(.sf-play__img, .sf-play-pick, .sf-play-pick__step, .sf-play-pick__opt, .sf-play__go, .sf-play__quiet) { transition:none; }
}
html.sf-reduce-motion ${PF} .sf-play__img.is-on { animation:none; }
html.sf-reduce-motion ${PF} :is(.sf-play__img, .sf-play-pick, .sf-play-pick__step, .sf-play-pick__opt, .sf-play__go, .sf-play__quiet) { transition:none; }
`;

export const CRUCIBLE_DOOR_LAYOUT_CSS = `
/* --- the Encounter panel fits its viewport ----------------------------------------------- */
/* One row of mode faces, whatever the profile has unlocked (four today, five with the Circuit).
   128px keeps four faces in the ~610px column of a 1366-wide window where 150px fell back to
   three plus an orphaned Daily; long words wrap inside the tile like the arena names do. */
${D} .sf-crd-modes { grid-template-columns:repeat(auto-fit, minmax(128px, 1fr)) !important; }
@media (min-width:901px) and (max-width:1100px) {
  ${D} .sf-crd-modes { grid-template-columns:repeat(auto-fit, minmax(88px, 1fr)) !important; }
}
${D} .sf-crd-mode-sub { display:block !important; white-space:normal !important; overflow:visible !important;
  text-overflow:clip !important; -webkit-line-clamp:unset !important; }
/* All nine arenas form a balanced 3x3 tactical matrix at desktop widths (no 8+1 orphan). */
${D} .sf-crd-arenas,
${D} [data-group="arena"] .orr-door-group__grid { grid-template-columns:repeat(3, minmax(0, 1fr)) !important; gap:6px !important; }
/* the head stops repeating the tab's step word; the lead line carries the row */
${D} .orr-prep-panelhead { margin:0 0 4px !important; }
${D} .orr-prep-panelhead-step { display:none !important; }
${D} .orr-prep-panelhead-line { margin:0 !important; }
${D} .orr-prep-daily { margin:2px 0 6px !important; }
/* the Encounter rows breathe cleanly so the Zone row and disclosure panels fit 100% on screen */
${D} .orr-prep-settings.orr-prep-settings { gap:8px !important; }
@media (min-height:821px) {
  ${D} .sf-crd-modes .orr-tile { min-height:62px !important; padding:6px 8px !important; }
  ${D} .sf-crd-modes .fh-tile-art { height:28px !important; }
  ${D} .sf-crd-modes .fh-tile-art svg { width:28px !important; height:28px !important; }
}
/* --- the zone pick is a compact machined hardware selector card --------------------------- */
${D} .sf-crd-zones .sf-crd-zone-pick {
  min-height:32px !important; padding:4px 10px !important;
  justify-content:center !important;
  border:1px solid rgb(154 198 218 / .26) !important; border-radius:2px !important;
  background:linear-gradient(165deg, rgb(16 32 45 / .92), rgb(10 20 30 / .96)) !important;
  box-shadow:inset 0 1px 0 rgb(210 238 250 / .10) !important;
}
${D} .sf-crd-zones .sf-crd-zone-pick:is(:hover, :focus-visible):not([aria-pressed="true"]) {
  border-color:rgb(158 220 233 / .62) !important;
  background:linear-gradient(165deg, rgb(22 44 60 / .95), rgb(13 27 39 / .98)) !important;
}
${D} .sf-crd-zones .sf-crd-zone-pick[aria-pressed="true"] {
  border:1px solid rgb(230 202 143 / .82) !important;
  background:linear-gradient(165deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 60%, rgb(13 28 40 / .95) 100%) !important;
  box-shadow:inset 0 2px 0 #e6ca8f, inset 0 0 16px rgb(224 181 94 / .12), 0 4px 14px rgb(0 0 0 / .45) !important;
  color:#fff1cf !important;
}
${D} .sf-crd-zones .sf-crd-zone-pick:disabled { opacity:.4 !important; }
/* the zone caption speaks in the same reading voice as the mode and stake subs */
${D} .sf-crd-zone { font:400 12.5px/1.35 var(--dp-face-body, 'Instrument Sans'), sans-serif !important;
  letter-spacing:0 !important; color:rgb(198 224 236 / .84) !important; margin:4px 0 0 !important; }
/* the arena matrix cards wrap cleanly */
${D} .sf-crd-arenas .fh-tile-legend { white-space:normal !important; overflow:visible !important;
  text-overflow:clip !important; line-height:1.22 !important; letter-spacing:.08em !important;
  text-align:left !important; font-variation-settings:'wdth' 94 !important; }
/* --- short benches (the 768-high verdict) -------------------------------------------------- */
@media (max-height:820px) {
  ${D} .sf-crd-modes.sf-crd-modes .orr-tile { min-height:58px !important; padding:6px 6px !important; }
  ${D} .sf-crd-modes .fh-tile-art { height:26px !important; }
  ${D} .sf-crd-modes .fh-tile-art svg { width:26px !important; height:26px !important; }
  ${D} .sf-crd-arenas .fh-tile-art { height:24px !important; }
  ${D} .sf-crd-arenas .fh-tile-art img { height:24px !important; }
  ${D} .orr-prep-stake-number { font-size:20px !important; }
  ${D} .orr-prep-settings.orr-prep-settings { gap:8px !important; }
  ${D} .orr-prep-settings > .k-row { padding:8px 10px !important; }
  ${D} .orr-prep-panelhead-line { display:none !important; }
  ${D} .orr-prep-daily { margin:0 0 6px !important; }
  ${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub) { margin-top:4px !important; }
  ${D} .sf-crd-zones .sf-crd-zone-pick { min-height:30px !important; padding:4px 8px !important; }
  ${D} .sf-crd-zone { margin:4px 0 0 !important; }
}
/* Short densify (960×540 / 801×461) */
@media (max-height:560px) {
  ${D} .orr-prep-settings.orr-prep-settings { gap:6px !important; }
  ${D} .orr-prep-settings > .k-row { padding:6px 8px !important; }
  ${D} .sf-crd-modes { grid-template-columns:repeat(auto-fit, minmax(72px, 1fr)) !important; }
  ${D} .sf-crd-modes.sf-crd-modes .orr-tile { min-height:46px !important; padding:4px 4px !important; }
  ${D} .sf-crd-modes .fh-tile-art { height:20px !important; }
  ${D} .sf-crd-modes .fh-tile-art svg { width:20px !important; height:20px !important; }
  ${D} .sf-crd-modes .fh-tile-legend { font-size:12px !important; letter-spacing:.08em !important; }
  ${D} > .k-stage { scroll-padding-block:12px; scrollbar-width:thin; }
  ${D} .orr-tile { scroll-margin-block:12px; }
  ${D} :is(.sf-crd-mode-sub, .sf-crd-stake-sub) {
    display:block !important; overflow:visible !important; -webkit-line-clamp:unset !important;
    white-space:normal !important; overflow-wrap:anywhere; margin-top:4px !important;
  }
  ${D} .sf-crd-stakes .orr-tile { min-height:42px !important; height:auto !important;
    padding:5px 4px !important; gap:3px !important; }
  ${D} .orr-prep-stake-number { font-size:17px !important; line-height:1.05 !important; }
  ${D} :is(.orr-prep-stake-pressure, .orr-prep-stake-yield) {
    display:block !important; white-space:normal; overflow-wrap:anywhere; max-width:100%;
    margin:0; font-size:12px !important; line-height:1.25 !important;
  }
  ${D} .k-row > .k-row__name { margin-bottom:4px !important; font-size:12px !important; }
  ${D} .sf-crd-zones .sf-crd-zone-pick { min-height:28px !important; padding:4px 6px !important; }
  ${D} .sf-crd-zone { margin:2px 0 0 !important; font-size:12px !important; }
  ${D} .sf-crd-stakes .fh-tile-legend { white-space:normal !important; overflow:visible !important;
    text-overflow:clip !important; font-size:12px !important; letter-spacing:.06em !important;
    font-variation-settings:'wdth' 92 !important; line-height:1.15 !important; }
}
@media (max-height:500px) {
  ${D} .orr-prep-daily { display:none !important; }
  ${D} .sf-crd-modes.sf-crd-modes .orr-tile { min-height:38px !important; height:auto !important; padding:2px 2px !important; }
  ${D} .sf-crd-modes .fh-tile-art { height:16px !important; }
  ${D} .sf-crd-modes .fh-tile-art svg { width:16px !important; height:16px !important; }
  ${D} .sf-crd-mode-sub { margin-top:2px !important; font-size:12px !important; line-height:1.25 !important; }
  ${D} .sf-crd-stakes .orr-tile { min-height:38px !important; height:auto !important; padding:3px 2px !important; gap:2px !important; }
  ${D} .orr-prep-stake-number { font-size:16px !important; }
  ${D} .orr-prep-settings.orr-prep-settings { gap:4px !important; }
  ${D} .k-row > .k-row__name { margin-bottom:2px !important; }
}
/* --- the arena matrix cards carry both thumb and crisp tactical name ----------------------- */
${D} .sf-crd-arenas .fh-tile-art img { width:100% !important; height:100% !important; object-fit:cover !important;
  opacity:.82 !important; filter:saturate(.88) !important; transition:opacity .18s linear, filter .18s linear; }
${D} .sf-crd-arenas .orr-tile:is(:hover, :focus-visible) .fh-tile-art img { opacity:.95 !important; filter:saturate(1) !important; }
${D} .sf-crd-arenas .orr-tile[aria-pressed="true"] .fh-tile-art img { opacity:1 !important; filter:saturate(1.08) !important; }
${D} .sf-crd-arenas .fh-tile-legend { font-size:12px !important; letter-spacing:.08em !important;
  color:#d8eaf2 !important; }
${D} .sf-crd-arenas .orr-tile:is(:hover, :focus-visible) .fh-tile-legend { color:#f0f9fc !important; }
${D} .sf-crd-arenas .orr-tile[aria-pressed="true"] .fh-tile-legend { color:#fff1cf !important;
  text-shadow:0 0 1px rgb(255 226 178 / .4); }
/* --- the plain rearm: one balanced sheet --------------------------------------------------- */
${RA} > .k-stage { display:flex; flex-direction:column; }
${RA} .sf-cru-stage > .sf-cru-cards { margin-top:auto; margin-bottom:auto; width:min(1480px, 100%); align-self:center;
  align-items:stretch; }
${RA} .sf-cru-stage > .sf-cru-note { width:min(1480px, 100%); align-self:center; }
${RA} .sf-cru-wallet { font-family:var(--dp-face-numeral, "Archivo") !important; font-variation-settings:normal;
  font-weight:600 !important; font-size:13px !important; font-variant-numeric:tabular-nums; letter-spacing:.08em;
  color:#f2b950 !important; }
/* --- the foot keycaps ---------------------------------------------------------------------- */
${FOOT} :is(.k-kbd, .dp-kbd, .sf-cru-kbd) { background:rgb(9 20 30 / .85) !important; border:1px solid rgb(158 220 233 / .38) !important; box-shadow:none !important;
  border-radius:2px !important; padding:2px 6px !important; margin-left:8px !important; color:#9edce9 !important;
  font-size:12px !important; letter-spacing:.1em !important; }
${FOOT} :is(.k-kbd, .dp-kbd, .sf-cru-kbd) .k-kbd__paren { color:rgb(158 220 233 / .45) !important; }
/* TRAINING / QUICK PLAY are machined hardware keys */
${D} .sf-crd-foot .k-words > li > button.k-word.orr-key:not(.k-word--primary) {
  display:inline-flex !important; align-items:center; box-sizing:border-box; min-height:38px !important; height:auto !important; padding:0 14px !important;
  font:600 13px/1 var(--dp-face-read, "Instrument Sans", system-ui, sans-serif) !important; letter-spacing:.08em !important; text-transform:uppercase;
  color:#d8eaf2 !important; background:linear-gradient(180deg, rgb(20 35 48 / .92), rgb(12 22 32 / .96)) !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  box-shadow:inset 0 1px 0 rgb(210 238 250 / .14) !important; }
${D} .sf-crd-foot .k-words > li > button.k-word.orr-key:not(.k-word--primary):is(:hover, :focus-visible) {
  color:#fff1cf !important; background:linear-gradient(180deg, rgb(28 48 66 / .95), rgb(16 30 43 / .98)) !important; border-color:#e6ca8f !important; }
/* a toggle that is ON reads lit in gold-amber */
${D} .sf-crd-foot .k-words > li > button.k-word.orr-key[aria-pressed="true"]:not(.k-word--primary) {
  color:#fff1cf !important; background:linear-gradient(165deg, rgb(224 181 94 / .24), rgb(13 28 40 / .95)) !important; border-color:rgb(230 202 143 / .85) !important; box-shadow:inset 0 2px 0 #e6ca8f !important; }
/* a short hero: keep words clear of the purse module below */
@media (max-height:820px) {
  ${D} .orr-prep-brief { padding-top:8px !important; }
  ${D} .orr-door-hero__words { bottom:150px !important; }
}
@media (max-height:560px) {
  ${D} .orr-door-hero__words { bottom:124px !important; }
}
@media (max-height:500px) {
  ${D} .orr-door-hero__words { bottom:110px !important; }
}
/* Laptop height (first-hour pass, up to 760 tall): the whole Encounter fits with no inner scroll. */
@media (min-width:1151px) and (max-height:760px) {
  ${D} .orr-cabinet-preview { width:62%; max-width:250px; }
  ${D} { grid-template-columns:minmax(0,1.7fr) minmax(0,1fr) !important; gap:8px 28px !important; padding:12px 36px 8px !important; }
  ${D} > .k-title { padding:8px 14px !important; }
  ${D} > .k-title h1 { font-size:32px !important; }
  ${D} .sf-crd-sub { display:none !important; }
  ${D} .orr-prep-nav { gap:14px; padding:4px 10px; }
  ${D} .orr-prep-tab, ${D} .orr-prep-nextstep { min-height:32px !important; padding:4px 12px !important; }
  ${D} .orr-prep-daily { display:none !important; }
  ${D} .orr-prep-settings { gap:6px !important; }
  ${D} .orr-prep-settings > .k-row { padding:6px 10px !important; }
  ${D} .orr-prep-panel { padding:0 0 2px; }
  ${D} .sf-crd-stake-sub { display:none !important; }
  ${D} .k-row > .k-row__name { margin-bottom:4px !important; }
  ${D} .sf-crd-modes .orr-tile { min-height:42px !important; padding:4px 6px !important; }
  ${D} .sf-crd-modes .fh-tile-art { display:none !important; }
  ${D} .sf-crd-stakes .orr-tile { min-height:0 !important; padding:5px 4px !important; gap:2px !important; }
  ${D} .orr-prep-stake-number { font-size:19px !important; }
  ${D} .orr-prep-stake-pressure { margin-top:0 !important; }
  ${D} .sf-crd-arenas, ${D} [data-group="arena"] .orr-door-group__grid { grid-template-columns:repeat(3,minmax(0,1fr)) !important; gap:6px !important; }
  ${D} .sf-crd-arenas .orr-tile { min-height:30px !important; padding:4px 8px !important; }
  ${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub,.sf-crd-arena-sub) { margin-top:2px !important; font-size:12px !important; line-height:1.3 !important; }
  ${D} .orr-prep-disclosure { padding:4px 10px; min-height:0; margin-top:4px; }
  ${D} .orr-prep-disclosure > summary { min-height:26px !important; line-height:26px !important; padding:2px 0 !important; }
  ${D} > .k-foot { padding:6px 14px !important; }
  ${D} .k-foot .k-words { gap:10px 14px !important; }
  ${D} .k-foot .orr-prep-continue, ${D} .k-foot .orr-key--hazard { min-height:40px !important; font-size:15px !important; min-width:190px !important; padding:6px 18px !important; }
  ${D} .k-foot .orr-door-hint { display:none !important; }
}
/* reduced motion: the one transition this sheet adds follows the game's own setting */
html.sf-reduce-motion ${D} .sf-crd-arenas .fh-tile-art img { transition:none !important; }
${SWARM_FRONT_CSS}`;

export function injectCrucibleDoorLayouts(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  injectOrrery(doc);
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CRUCIBLE_DOOR_LAYOUT_CSS;
  doc.head.appendChild(style);
}
