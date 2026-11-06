// Console Standard (design/frontend/STATION_STANDARD.md applied past the station).
//
// The owner's 2026-10-30 amendment retired ORRERY's tiny-tracked-caps / text-link-verb absolutes
// for the station (src/ui/orrery/stationStandard.js). This sheet carries the same standard to every
// OTHER screen, as one low-specificity layer: screens keep their own sheets and can still
// out-specify anything here. It is injected by injectOrrery() BEFORE a screen's own layout sheet,
// so it sets the floor, never the ceiling.
//
// What lives here — the things every screen shares:
//   §1 focus        one keyboard/gamepad focus look (2px amber, 2px offset) instead of white
//                   underlines that read as web links.
//   §2 keycaps      .dp-kbd and the foot-strip keycaps read as machined code chips: mono face,
//                   hairline box, dark fill — never an underlined word.
//   §3 figures      .sf-fig — money, counts, percentages: --dp-face-num, tabular, unit-marked.
//   §4 panels       .sf-panel — glass-deep face, 1px hairline, 2px radius, header strip with a
//                   13px label left and a figure right; optional corner ticks (.sf-panel--ticks).
//   §5 buttons      .sf-key (primary: amber fill, dark ink, the 45° cut), .sf-key--ghost
//                   (secondary: 1px hairline), .sf-key--text (tertiary) — with hover/focus/
//                   disabled states, so a screen never ships a bare text verb again.
//   §6 tables       .sf-table — one shared grid: 13px header, hairline under, 30px rows, hover,
//                   amber selected edge, right-aligned tabular figures.
//   §7 chrome       thin bone scrollbars, amber text selection: the small mercies.
//
// Tokens only: --dp-* from deckplate/tokens.js and orrery/tokens.js. No new token root.

const STYLE_ID = 'sf-console-standard';

export const CONSOLE_STANDARD_CSS = `
/* ═══ §1 focus — one focus voice. Amber is the lamp of "you are here"; a white underline is a
   web page. Applies inside the screens layer so overlays and the world are untouched. */
#screens :is(button, a, input, select, textarea, [tabindex]):focus-visible {
  outline:2px solid var(--dp-lamp, #f2b950) !important;
  outline-offset:2px !important;
  border-radius:2px;
}
#screens :is(button, a, input, select, textarea, [tabindex]):focus:not(:focus-visible) {
  outline:none;
}

/* ═══ §2 keycaps — a key name is machine code: the mono face, a hairline chip, dark fill. */
.dp-kbd {
  font-family:var(--dp-face-num, "Spline Sans Mono", ui-monospace, Consolas, monospace) !important;
  font-size:12px !important; font-weight:500; letter-spacing:.02em; text-transform:none;
  color:rgb(236 230 216 / .92);
  background:linear-gradient(180deg, rgb(236 230 216 / .09), rgb(236 230 216 / .045)), rgb(6 8 11 / .72);
  border:1px solid rgb(236 230 216 / .42); border-radius:2px;
  box-shadow:inset 0 -1px 0 rgb(0 0 0 / .4);
}
.dp-kbd.is-down { background:var(--dp-lamp, #f2b950); border-color:var(--dp-lamp, #f2b950);
  color:var(--dp-metal-0, #0b0d10); }

/* ═══ §3 figures — the ledger face. A quantity never changes width while it ticks, and it
   right-aligns by the container that lays it out. */
.sf-fig {
  font-family:var(--dp-face-num, "Spline Sans Mono", ui-monospace, Consolas, monospace);
  font-variant-numeric:tabular-nums; font-weight:500; letter-spacing:0;
}
.sf-fig--hero { font-size:clamp(24px, 2.4vw, 34px); line-height:1; }
.sf-fig .sf-unit { font-size:.58em; letter-spacing:.06em; color:rgb(236 230 216 / .6); margin-left:.4em; }

/* ═══ §4 panels — the hairline instrument face, with a header strip that names it. */
.sf-panel {
  position:relative; display:flex; flex-direction:column; min-width:0;
  background:rgb(8 11 16 / .78);
  border:1px solid rgb(236 230 216 / .20); border-radius:2px;
}
.sf-panel--ticks::before, .sf-panel--ticks::after { content:""; position:absolute; width:7px; height:7px;
  border:1px solid rgb(236 230 216 / .5); pointer-events:none; }
.sf-panel--ticks::before { top:-1px; left:-1px; border-right:0; border-bottom:0; }
.sf-panel--ticks::after { bottom:-1px; right:-1px; border-left:0; border-top:0; }
.sf-panel__head {
  display:flex; align-items:baseline; justify-content:space-between; gap:16px;
  padding:9px 14px; border-bottom:1px solid rgb(236 230 216 / .18);
  font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-size:13px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
  color:rgb(236 230 216 / .85);
}
.sf-panel__head .sf-fig { text-transform:none; font-size:13px; }
.sf-panel__body { padding:12px 14px; min-height:0; }

/* ═══ §5 buttons — five states, one primary. A verb a player can act on looks pressable. */
.sf-key {
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  box-sizing:border-box; min-height:36px; padding:0 18px;
  font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-size:13px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; line-height:1;
  color:var(--dp-metal-0, #0b0d10);
  background:var(--dp-lamp, #f2b950);
  border:1px solid rgb(242 185 80 / .9); border-radius:2px;
  clip-path:polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%);
  cursor:pointer; user-select:none;
  transition:background var(--dp-d-cut, 80ms) linear, color var(--dp-d-cut, 80ms) linear,
    border-color var(--dp-d-cut, 80ms) linear, box-shadow var(--dp-d-cut, 80ms) linear;
}
.sf-key:is(:hover, :focus-visible) { background:var(--dp-lamp-hot, #ffd98c); border-color:var(--dp-lamp-hot, #ffd98c);
  box-shadow:0 0 14px rgb(242 185 80 / .24); }
.sf-key:active { background:rgb(255 217 140 / .92); }
.sf-key[disabled], .sf-key[aria-disabled="true"] { opacity:.45; cursor:not-allowed; box-shadow:none; }
.sf-key[disabled]:is(:hover, :focus-visible), .sf-key[aria-disabled="true"]:is(:hover, :focus-visible) {
  background:var(--dp-lamp, #f2b950); border-color:rgb(242 185 80 / .9); }

.sf-key--ghost {
  color:rgb(236 230 216 / .92); background:rgb(236 230 216 / .05);
  border:1px solid rgb(236 230 216 / .38); clip-path:none;
}
.sf-key--ghost:is(:hover, :focus-visible) { color:#fff; background:rgb(236 230 216 / .12);
  border-color:rgb(236 230 216 / .75); box-shadow:none; }
.sf-key--ghost[disabled], .sf-key--ghost[aria-disabled="true"] { background:rgb(236 230 216 / .05); }
.sf-key--ghost[disabled]:is(:hover, :focus-visible), .sf-key--ghost[aria-disabled="true"]:is(:hover, :focus-visible) {
  background:rgb(236 230 216 / .05); border-color:rgb(236 230 216 / .38); color:rgb(236 230 216 / .92); }

.sf-key--text {
  min-height:28px; padding:0 6px; color:rgb(236 230 216 / .82);
  background:none; border:0; clip-path:none;
}
.sf-key--text:is(:hover, :focus-visible) { color:var(--dp-lamp-hot, #ffd98c); background:none;
  box-shadow:none; text-decoration:underline; text-underline-offset:5px;
  text-decoration-color:rgb(242 185 80 / .5); }

.sf-key--danger { color:rgb(255 231 224 / .96); background:rgb(255 80 56 / .16);
  border:1px solid rgb(255 80 56 / .55); clip-path:none; }
.sf-key--danger:is(:hover, :focus-visible) { background:rgb(255 80 56 / .3); border-color:rgb(255 120 96 / .9);
  box-shadow:0 0 12px rgb(255 80 56 / .2); }

/* ═══ §6 tables — one grid, one alignment law. Header names the columns; figures live right. */
.sf-table { display:grid; min-width:0; }
.sf-table__head, .sf-table__row {
  display:grid; grid-template-columns:var(--sf-table-cols, minmax(0, 1fr) repeat(3, minmax(72px, max-content)));
  align-items:center; column-gap:14px; box-sizing:border-box;
}
.sf-table__head {
  min-height:30px; padding:0 10px; border-bottom:1px solid rgb(236 230 216 / .26);
  font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif);
  font-size:13px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
  color:rgb(236 230 216 / .78);
}
.sf-table__row {
  min-height:30px; padding:0 10px; border-bottom:1px solid rgb(236 230 216 / .09);
  color:rgb(236 230 216 / .9);
}
.sf-table__row:is(:hover, :focus-within) { background:rgb(236 230 216 / .06); }
.sf-table__row.is-selected, .sf-table__row[aria-selected="true"] {
  background:rgb(242 185 80 / .12); border-left:2px solid var(--dp-lamp, #f2b950); padding-left:8px; }
.sf-table__num { text-align:right; font-family:var(--dp-face-num, "Spline Sans Mono", ui-monospace, Consolas, monospace);
  font-variant-numeric:tabular-nums; font-weight:500; font-size:14px; color:rgb(236 230 216 / .92); }
.sf-table__head .sf-table__num { font-family:inherit; font-size:inherit; letter-spacing:inherit; }
.sf-table__delta--good { color:rgb(150 220 150 / .95); }
.sf-table__delta--bad { color:rgb(255 128 108 / .95); }

/* ═══ §7 chrome — the small mercies. */
#screens { scrollbar-width:thin; scrollbar-color:rgb(236 230 216 / .28) transparent; }
#screens ::-webkit-scrollbar { width:8px; height:8px; }
#screens ::-webkit-scrollbar-thumb { background:rgb(236 230 216 / .22); border-radius:4px; border:2px solid transparent; background-clip:content-box; }
#screens ::-webkit-scrollbar-thumb:hover { background-color:rgb(236 230 216 / .4); background-clip:content-box; }
#screens ::-webkit-scrollbar-corner { background:transparent; }
#screens ::selection { background:rgb(242 185 80 / .85); color:rgb(8 11 16); }

/* A status dot: live readings carry one lamp bead, 6px, with a soft cast — the "what is live"
   tell shared by rosters and headers. */
.sf-dot { display:inline-block; width:6px; height:6px; border-radius:50%; flex:0 0 auto;
  background:var(--dp-lamp, #f2b950); box-shadow:0 0 6px rgb(242 185 80 / .5); }
.sf-dot--cool { background:var(--dp-phos, #dfeeff); box-shadow:0 0 6px rgb(150 210 255 / .45); }
.sf-dot--off { background:rgb(236 230 216 / .3); box-shadow:none; }

/* ═══ §9 surfaces — the depth system. The diagnosis behind this section: every face in the game
   was ONE flat alpha (var(--dp-field) = rgb(10 12 16 / .84)) over whatever is beneath it, so a
   screen could stack five panels and read as one plane of grey glass. Real console UIs are built
   from LIT PLANES: the face brightens toward its key light, falls darker at the foot, catches a
   1px highlight along its top edge, occludes along its bottom, dithers so large faces do not
   band, and throws one soft shadow onto whatever it floats over. Three elevations so panels read
   as stacked planes instead of siblings:

     E0  the instrument face        — panels resting on the screen
     E1  a raised face              — the selected card, an open drawer
     E2  a floating plane           — dialogs, the comms fan, anything over the world

   These are rules of LIGHT, not materials: no bevels, no metal ramps, no texture tiles — the
   geometry-and-light craft the material ban always allowed but nothing used. */

:root {
  /* the lit face: key-light pool from the panel's own top corner, a vertical light ramp, and a
     1-in-3px dither so the ramp is continuous on any panel size */
  --sf-face:
    repeating-linear-gradient(0deg, rgb(255 255 255 / .013) 0 1px, transparent 1px 3px),
    radial-gradient(130% 80% at 20% 0%, rgb(33 40 52 / .30), rgb(33 40 52 / 0) 58%),
    linear-gradient(180deg, rgb(16 19 25 / .95), rgb(10 12 16 / .92) 56%, rgb(7 9 12 / .95));
  --sf-face-raised:
    repeating-linear-gradient(0deg, rgb(255 255 255 / .016) 0 1px, transparent 1px 3px),
    radial-gradient(130% 80% at 20% 0%, rgb(40 48 62 / .34), rgb(40 48 62 / 0) 58%),
    linear-gradient(180deg, rgb(20 24 31 / .96), rgb(13 16 21 / .93) 56%, rgb(9 11 15 / .96));
  --sf-face-float:
    repeating-linear-gradient(0deg, rgb(255 255 255 / .018) 0 1px, transparent 1px 3px),
    radial-gradient(130% 80% at 20% 0%, rgb(46 55 70 / .36), rgb(46 55 70 / 0) 58%),
    linear-gradient(180deg, rgb(23 27 35 / .97), rgb(15 18 24 / .94) 56%, rgb(10 13 17 / .97));
  /* the machined edge: a lit top rim, an occluded bottom rim, and a hairline the full way round */
  --sf-edge: inset 0 1px 0 rgb(236 230 216 / .085), inset 0 -1px 0 rgb(0 0 0 / .55),
    inset 0 0 0 1px rgb(236 230 216 / .04);
  --sf-edge-raised: inset 0 1px 0 rgb(236 230 216 / .12), inset 0 -1px 0 rgb(0 0 0 / .55),
    inset 0 0 0 1px rgb(236 230 216 / .055);
  --sf-edge-float: inset 0 1px 0 rgb(236 230 216 / .14), inset 0 -1px 0 rgb(0 0 0 / .6),
    inset 0 0 0 1px rgb(236 230 216 / .07);
  /* the plane over the plane: one large soft shadow onto the world, one tight contact shadow */
  --sf-drop: 0 18px 44px rgb(0 0 0 / .5), 0 4px 12px rgb(0 0 0 / .38);
  --sf-drop-raised: 0 10px 26px rgb(0 0 0 / .45), 0 2px 8px rgb(0 0 0 / .32);
  --sf-drop-float: 0 24px 56px rgb(0 0 0 / .55), 0 6px 16px rgb(0 0 0 / .4);
}

/* E0 — every instrument face the deckplate system defines. Their old single-alpha field is the
   flatness; the lit face replaces it without moving a single pixel of anyone's layout. */
.dp-mfd, .dp-glass, .dp-plate-hw, .sf-panel, .dp-tip {
  background:var(--sf-face) !important;
  box-shadow:var(--sf-edge), var(--sf-drop-raised);
}
.dp-tip { padding:10px 12px !important; border:1px solid rgb(236 230 216 / .16) !important;
  border-radius:2px !important; }

/* the panel head: a named strip — amber tick, label, then the hairline that seats the body */
.sf-panel__head { position:relative; }
.sf-panel__head::before { content:""; position:absolute; left:0; top:6px; bottom:6px; width:3px;
  background:var(--dp-lamp, #f2b950); box-shadow:0 0 8px rgb(242 185 80 / .3); }

/* E2 — the floating planes: dialogs and the comms fan, which open OVER the world */
.dp-dialog {
  background:var(--sf-face-float) !important;
  box-shadow:var(--sf-edge-float), var(--sf-drop-float) !important;
  border:1px solid rgb(236 230 216 / .14) !important; border-radius:2px;
}
.dp-dialog::after { content:""; position:absolute; left:-1px; top:14px; bottom:14px; width:3px;
  background:var(--dp-lamp, #f2b950); box-shadow:0 0 10px rgb(242 185 80 / .35); }
.dp-dialog--danger::after { background:var(--dp-danger, #ff5038); box-shadow:0 0 10px rgb(255 80 56 / .4); }
#sf-commsfan { background:var(--sf-face-float) !important;
  box-shadow:var(--sf-edge-float), var(--sf-drop-float) !important;
  border:1px solid rgb(236 230 216 / .14); border-radius:2px; }
#sf-commsfan::before { background:radial-gradient(ellipse closest-side at 44% 50%,
  rgb(3 4 7 / .72), rgb(3 4 7 / .5) 58%, rgb(3 4 7 / 0)) !important; }

/* E0 over the world — the pause brief and the save ledger stop being free text and become the
   instruments they read as: the same face, the same edge, seated with real padding. */
#screens > .of-pause .sf-pause-brief.orr-brief {
  background:var(--sf-face) !important; box-shadow:var(--sf-edge), var(--sf-drop) !important;
  border:1px solid rgb(236 230 216 / .12) !important; border-radius:2px;
  padding:16px 20px 18px !important;
}
#screens > .of-pause .sf-pause-brief.orr-brief::before { content:none !important; }
/* The ledger's element background is swallowed by an unresolved cascade anomaly (a matching
   !important rule in this very sheet computes to none — probed 2026-10-31, see the tracker), so
   the face is painted by its own ::after plane inside the element's stacking context. */
html body #screens > .k-screen.of-saveload.orr-saveload .sf-save-ledger.sf-save-ledger {
  padding:18px 22px 16px !important;
  border:1px solid rgb(236 230 216 / .12) !important; border-radius:2px;
}
html body #screens > .k-screen.of-saveload.orr-saveload .sf-save-ledger.sf-save-ledger::before {
  content:none !important; }
html body #screens > .k-screen.of-saveload.orr-saveload .sf-save-ledger.sf-save-ledger::after {
  content:""; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background:var(--sf-face); border-radius:2px;
  box-shadow:var(--sf-edge), var(--sf-drop); }

/* E1 — the crucible cards: the armory, refit and results lists are the game's densest data and
   they were zeroed to bare hairlines; as lit cards they finally sit in front of the world. */
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card.sf-cru-card {
  background:var(--sf-face) !important;
  box-shadow:var(--sf-edge), var(--sf-drop-raised) !important;
  border:1px solid rgb(236 230 216 / .1) !important; border-radius:2px;
}
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card.sf-cru-card::before { content:none !important; }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card.sf-cru-card::after { content:""; position:absolute; left:0; top:10px; bottom:10px; width:2px;
  background:rgb(236 230 216 / .28); }
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card.is-active::after,
html body #screens > .k-screen.orr-crucible:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results) .sf-cru-card.is-selected::after {
  background:var(--dp-lamp, #f2b950); box-shadow:0 0 8px rgb(242 185 80 / .35); }

/* data rows: a floor, so any list without its own hover still answers the pointer */
#screens .k-rows .k-row { transition:background var(--dp-d-cut, 80ms) linear, box-shadow var(--dp-d-cut, 80ms) linear; }
#screens .k-rows .k-row:is(:hover, :focus-within) { background:rgb(236 230 216 / .045);
  box-shadow:inset 2px 0 0 rgb(242 185 80 / .8); }
#screens .k-rows .k-row[aria-selected="true"], #screens .k-rows .k-row.is-active {
  background:rgb(242 185 80 / .1); box-shadow:inset 2px 0 0 var(--dp-lamp, #f2b950); }

@media (forced-colors:active) {
  .dp-mfd, .dp-glass, .dp-plate-hw, .sf-panel, .dp-dialog, #sf-commsfan {
    background:Canvas; box-shadow:none; forced-color-adjust:none; }
}

/* ═══ §8 station tabs — the bench's shipworks/industry verbs read as bare chevron words. Deckplate's
   printedKey and the shipworks sheet out-specific a bare class rule, so this selector is
   deliberately maximal (id + five class/attr hooks): a hairline key a player can press, 13px
   labels, no chevron caps (STATION_STANDARD §5). Scoped to the tab workspaces so the vitals' own
   acts (stationStandard.js) are untouched. */
html body #screens .orr-station .sx-sw-verbs .k-word.sx-sw-verb[data-verb],
html body #screens > :not(.sx-observatory):not(.of-title):not([data-screen="drill"]) .fh-key[data-rack-upgrade],
html body #screens > :not(.sx-observatory):not(.of-title):not([data-screen="drill"]) .fh-key[data-rack-restock],
html body #screens .orr-station .fh-key[data-rack-upgrade],
html body #screens .orr-station .fh-key[data-rack-restock],
html body #screens .orr-station .k-word[data-rack-upgrade],
html body #screens .orr-station .k-word[data-rack-restock],
.orr-station .orr-chain__source,
.orr-station .orr-chain__wayout {
  --dpk-fill:rgb(236 230 216 / .06);
  --dpk-cut:none; --dpk-bracket:none; --dpk-rule:none;
  min-height:30px !important; height:auto !important; padding:0 12px !important;
  font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif) !important;
  font-size:13px !important; font-weight:600 !important; letter-spacing:.04em !important;
  text-transform:uppercase; line-height:1 !important;
  color:rgb(236 230 216 / .9) !important;
  background-color:rgb(236 230 216 / .06) !important;
  background-image:none !important;
  border:1px solid rgb(236 230 216 / .38) !important; border-radius:2px !important;
  cursor:pointer;
}
html body #screens .orr-station .sx-sw-verbs .sx-sw-verb[data-verb]::before,
html body #screens .orr-station :is(.fh-key, .k-word)[data-rack-upgrade]::before,
html body #screens .orr-station :is(.fh-key, .k-word)[data-rack-restock]::before { content:none !important; }
html body #screens .orr-station .sx-sw-verbs .k-word.sx-sw-verb[data-verb]:is(:hover, :focus-visible),
html body #screens > :not(.sx-observatory):not(.of-title):not([data-screen="drill"]) .fh-key[data-rack-upgrade]:not(:disabled):is(:hover, :focus-visible),
html body #screens > :not(.sx-observatory):not(.of-title):not([data-screen="drill"]) .fh-key[data-rack-restock]:not(:disabled):is(:hover, :focus-visible),
html body #screens .orr-station :is(.fh-key, .k-word)[data-rack-upgrade]:not(:disabled):is(:hover, :focus-visible),
html body #screens .orr-station :is(.fh-key, .k-word)[data-rack-restock]:not(:disabled):is(:hover, :focus-visible),
.orr-station .orr-chain__source:is(:hover, :focus-visible),
.orr-station .orr-chain__wayout:is(:hover, :focus-visible) {
  --dpk-fill:rgb(236 230 216 / .12);
  color:#fff !important; background-color:rgb(236 230 216 / .12) !important;
  border-color:rgb(236 230 216 / .75) !important;
}
html body #screens :is(.fh-key, .k-word)[data-rack-upgrade]:disabled,
html body #screens :is(.fh-key, .k-word)[data-rack-restock]:disabled {
  opacity:.45 !important; cursor:not-allowed !important;
}
html body #screens .orr-station .sx-sw-verbs .sx-sw-verb[data-verb]:disabled,
html body #screens .orr-station .sx-sw-verbs .sx-sw-verb[data-verb][aria-disabled="true"] {
  opacity:.45; cursor:not-allowed; }
/* the ledger's empty board and archive status read as sentences, not faint engraved caps */
.orr-station .sx-ledger .st-ledger-board-empty {
  font-family:var(--dp-face-read, "Instrument Sans", system-ui, sans-serif) !important;
  font-size:14px !important; letter-spacing:0 !important; text-transform:none !important; font-weight:500;
  color:rgb(236 230 216 / .8) !important; }
.orr-station .sx-ledger .st-ledger-status {
  font-size:13px !important; letter-spacing:.04em !important; color:rgb(236 230 216 / .72) !important; }

@media (forced-colors:active) {
  .sf-panel, .sf-panel__head, .sf-table__head, .sf-table__row { border-color:CanvasText; }
  .sf-key { forced-color-adjust:none; background:ButtonFace; color:ButtonText; border:1px solid ButtonText; clip-path:none; }
  .dp-kbd { forced-color-adjust:none; background:ButtonFace; color:ButtonText; border:1px solid ButtonText; }
}
`;

export function injectConsoleStandard(doc = globalThis.document) {
  if (!doc?.head || typeof doc.getElementById !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CONSOLE_STANDARD_CSS;
  doc.head.appendChild(style);
}
