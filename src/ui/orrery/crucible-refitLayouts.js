// src/ui/orrery/crucible-refitLayouts.js — the Crucible Refit's own composition additions
// (design/frontend/ORRERY.md §6 "Crucible door → draft/armory → refit → results").
// This is the composition file the refit surface owns: rules that answer the refit's own audit
// and belong to no shared sheet. It sits BESIDE the shared overlays the screen also loads —
// `cruciblePreparationLayouts.js` (door + armory + refit, shared with the draft unit) and the
// `.orr-refit` block in `screenLayouts.js` (the library sheet). Both are off-limits to this
// surface, so the refit's own answers live here. Scoped to `.sf-crucible-refit.orr-refit` only;
// nothing here styles the draft, the armory, the door or any other surface.
//
// What it answers (audit 2026-10-26, shots `crucible-refit` + `crucible-refit-swarm` @1920×1080,
// --walk on both, ui-contrast green on both):
//
// 1. THE RING'S ENGRAVING BURIED UNDER THE FOOT (swarm: "5 of 8 fitted" under LAUNCH ROUND 11 —
//    the bench's one printed defect). Cause chain, all in shared files: the refit's arrival
//    settle transforms the foot from +40px for ~delay+140ms (src/ui/kit/motion.js:30-55 — the
//    offset class lands synchronously, the resting position returns only at transition end),
//    while the jig sizes its dial from avoid()-obstacle rects measured at the first rAF
//    (src/ui/orrery/hullSchematic.js:299-328) and re-schedules on fonts.ready / art load / the
//    stage ResizeObserver (:202-207). Any relayout inside the arrival window measures the foot
//    40px low, bakes an oversized dial, and the engraving at R+38 (:552) spills under the foot
//    plate (z6, cruciblePreparationLayouts.js:559-565). Survival's shorter foot absorbs the same
//    ~20px error; swarm's two-line foot and its extra preview paragraph do not. Answer here, in
//    the file that may touch the screen object: one more jig layout AFTER the arrival window,
//    when every rect rests. (The deeper fix — measuring untransformed boxes in relayout() —
//    belongs to hullSchematic.js, shared with shipworks; recorded for that owner.)
//
// 2. THE SWARM CALLOUT'S SPARE LINE BREAKS MID-TOKEN. The hull-on row line has no wrap plan
//    (screenLayouts.js:310 — display:flex, no wrap; the spares div may shrink, :312), so when
//    the swarm ruleset adds the SELL verb beside FIT (src/ui/screens/crucibleDraft.js:2277-2283)
//    the 300px callout column squeezes its segments and the spare name and its stat wrap at
//    every space — "+ Autocannon / S", "31 dps· / impulse / 28" stacked orphaned lines. Answer:
//    the line wraps BETWEEN whole segments (verbs drop to their own row, exactly the lit row's
//    stacked shape, screenLayouts.js:359) and a spare never breaks inside its own name/stat.
//
// 3. TWO KEYCAP GRAMMARS ON ONE SCREEN. The library sheet's own key hint is a bare glyph — the
//    pause foot stripped its caps to bare glyphs (screenLayouts.js:39-40) and the lit act's
//    "Enter" is bare (screenLayouts.js:373-375) — but the shared prep sheet re-boxes both on the
//    refit (cruciblePreparationLayouts.js:588-598, :599-609): bordered, radius 3, inset shadow —
//    the PNG's only bordered rectangles (ORRERY_RUBRIC P8-32: scales and the 45° cut are the
//    only straight edges). Answer: the refit's caps go bare, matching the library's own voice.
//    (The armory keeps its boxed caps; that is the shared sheet owner's call, not this file's.)
//
// 4. THE SWARM FOOT'S PRIMARY VERB DOES NOT LEAD. With no lamp in the swarm foot (is-lamp is the
//    finish state only, crucibleDraft.js:2085-2087) the primary rides one alpha step and one
//    weight step above the walk-away verb — at 1080p they read as equals. Answer: one size step
//    for the primary word, so scale contrast sorts the row the way the survival lamp does.
//
// 5. THE SWARM PREVIEW PARAGRAPH READS WEB-BARE. The armory's own next-round line is 13px body
//    (cruciblePreparationLayouts.js:497); the refit's had no voice rule and fell to the kit
//    default. One rule, same voice.

import { injectOrrery } from './tokens.js';
// Cycle-safe: crucibleDraft.js imports THIS file, so the binding is only read at inject time
// (called from the screen's mount), never during module evaluation.
import { crucibleRefitScreen } from '../screens/crucibleDraft.js';

const STYLE_ID = 'sf-orrery-crucible-refit-screen';
// Same selector shape the shared overlays use (html body #screens, the screen's classes): the
// shared sheets pin their rules at !important, and a quieter shape would lose to them.
const RF = 'html body #screens > .k-screen.orr-crucible.sf-crucible-refit.orr-refit';

export const CRUCIBLE_REFIT_SCREEN_CSS = `
/* 0 — Tactical hangar deckplate backdrop & ruggedized metal-and-glass terminal framing */
${RF} {
  background:
    radial-gradient(95% 75% at 50% 0%, rgb(20 44 62 / .38) 0%, transparent 68%),
    radial-gradient(80% 60% at 85% 100%, rgb(38 28 14 / .24) 0%, transparent 65%),
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, #060d14 0%, #04080d 100%) !important;
}
${RF} > .k-title,
${RF} .sf-cru-strip--refit {
  padding:8px 16px !important;
  border:1px solid rgb(154 198 218 / .34) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 150px, rgb(158 220 233 / .14) 150px 100%) top left / 100% 2px no-repeat,
    linear-gradient(180deg, rgb(25 36 47 / .95) 0%, rgb(14 21 29 / .98) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .18), inset 0 -2px 0 rgb(2 5 8 / .85), 0 10px 24px rgb(0 0 0 / .55) !important;
}
${RF} > .k-title .k-t-title,
${RF} > .k-title h1 {
  color:#edf6fa !important;
}
${RF} :is(.sf-cru-bay, .sf-cru-rail) {
  border:1px solid rgb(154 198 218 / .30) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
    linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58) !important;
}
/* Central diagnostic hangar bay bezel framing the ship schematic & 8 hardpoint callouts */
${RF} > .sf-cru-stage.orr-hull--on::before {
  display:block !important;
  content:"" !important;
  position:absolute !important;
  top:clamp(140px, 19.4vh, 210px) !important;
  bottom:clamp(146px, 20vh, 216px) !important;
  left:5% !important;
  right:5% !important;
  z-index:0 !important;
  pointer-events:none !important;
  border:1px solid rgb(154 198 218 / .30) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 160px, rgb(158 220 233 / .14) 160px 100%) top left / 100% 2px no-repeat,
    linear-gradient(rgb(158 220 233 / .04) 1px, transparent 1px) 0 0 / 32px 32px,
    linear-gradient(90deg, rgb(158 220 233 / .04) 1px, transparent 1px) 0 0 / 32px 32px,
    radial-gradient(circle at 50% 50%, rgb(18 44 62 / .40) 0%, rgb(7 16 24 / .86) 78%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 14px 32px rgb(0 0 0 / .58) !important;
}
${RF} > .sf-cru-stage.orr-hull--on > * {
  z-index:1;
}
@media (max-height:840px) {
  ${RF} > .sf-cru-stage.orr-hull--on::before {
    top:86px !important;
    bottom:88px !important;
    left:3.5% !important;
    right:3.5% !important;
  }
}

/* 1 — Hardpoint callouts around the hull schematic & list rows are recessed visor-glass module cards */
${RF} > .sf-cru-stage.orr-hull--on .sf-cru-row,
${RF} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row {
  border:1px solid rgb(154 198 218 / .28) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, rgb(158 220 233 / .42) 0 20px, transparent 20px 100%) top left / 100% 1px no-repeat,
    linear-gradient(160deg, rgb(12 26 38 / .92) 0%, rgb(8 17 26 / .96) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .12), 0 8px 20px rgb(0 0 0 / .52) !important;
  padding:6px 10px !important;
}
${RF} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row + .sf-cru-row {
  margin-top:4px !important;
}
${RF} > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit,
${RF} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row.is-lit {
  border:1px solid rgb(230 202 143 / .82) !important;
  background:linear-gradient(165deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 60%, rgb(13 28 40 / .95) 100%) !important;
  box-shadow:inset 0 2px 0 #e6ca8f, inset 0 0 18px rgb(224 181 94 / .12), 0 6px 18px rgb(0 0 0 / .5) !important;
  color:#fff1cf !important;
}

/* STRIP / FIT / SELL are crisp machined micro-buttons */
${RF} .sf-cru-act {
  border:1px solid rgb(158 220 233 / .35) !important;
  border-radius:2px !important;
  background:rgb(18 36 50 / .92) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14) !important;
  padding:3px 8px !important;
  color:#d8eaf2 !important;
  font-size:12px !important;
  font-weight:650 !important;
  letter-spacing:.12em !important;
  text-transform:uppercase !important;
}
${RF} .sf-cru-row.is-lit .sf-cru-act:not(:disabled),
${RF} .sf-cru-act:not(:disabled):is(:hover, :focus-visible) {
  border-color:#e6ca8f !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .30) 0%, rgb(224 181 94 / .14) 100%) !important;
  color:#fff1cf !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .28) !important;
}

/* 2 — the callout line wraps between whole segments; a spare name never orphans a single size letter (S/M/L) */
${RF} > .sf-cru-stage.orr-hull--on .orr-hp__line { flex-wrap:wrap !important; align-items:center !important; gap:4px 8px !important; }
${RF} > .sf-cru-stage.orr-hull--on .is-left .orr-hp__line { justify-content:flex-end; }
${RF} .orr-hp__item-thumb, ${RF} .orr-hp__spare-thumb { flex:none; }
${RF} .orr-hp__spares { white-space:normal !important; gap:4px 8px !important; }
${RF} .orr-hp__spare {
  display:inline-flex !important; flex-wrap:wrap !important; align-items:center !important; gap:2px 8px !important;
  padding:4px 9px 4px 5px !important; border:1px solid rgb(154 198 218 / .28) !important;
  border-radius:2px !important;
  background:rgb(10 22 33 / .92) !important; box-shadow:inset 0 1px 0 rgb(208 238 250 / .10) !important;
}
${RF} .orr-hp__spare-name { white-space:nowrap !important; }
${RF} .orr-hp__spare[aria-checked="true"] {
  border-color:rgb(230 202 143 / .82) !important;
  background:linear-gradient(165deg, rgb(224 181 94 / .22), rgb(13 28 40 / .95)) !important;
  color:#fff1cf !important;
}
${RF} .orr-hp__spare:is(:hover,:focus-visible) {
  border-color:#e6ca8f !important;
  color:#fff1cf !important;
  box-shadow:none !important;
}
${RF} > .sf-cru-stage.orr-hull--on .orr-hp__spare-stat { white-space:nowrap !important; }

/* Lighting a fitted hardpoint must not move its verbs underneath the pointer.
   The selected description and keyboard hint are visual annotations, not part
   of the measured callout. The schematic can therefore keep its placement. */
${RF} > .sf-cru-stage.orr-hull--on .orr-hp__description,
${RF} > .sf-cru-stage.orr-hull--on .orr-hp__contrast:not(.orr-hp__contrast--drawn) {
  position:absolute !important; top:100%; left:0; right:0;
}
${RF} > .sf-cru-stage.orr-hull--on .sf-cru-act { position:relative; }
${RF} > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-act:not(:disabled)::after {
  position:absolute !important; left:100%; top:0; white-space:nowrap;
}
${RF} > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-act:not(:focus-visible)::after { display:none !important; }
${RF} > .sf-cru-stage.orr-hull--on .is-left.sf-cru-row.is-lit .sf-cru-act:not(:disabled)::after {
  left:auto; right:100%;
}
/* Spare choices and their comparison stay in the same places when the Hand
   lights a row. Large lists retain the schematic's ordinary scroll fallback. */
${RF} > .sf-cru-stage.orr-hull--on .is-open .orr-hp__line { flex-direction:column; align-items:flex-start; }
${RF} > .sf-cru-stage.orr-hull--on .is-left.is-open .orr-hp__line { align-items:flex-end; }
${RF} > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spares { flex-direction:column; gap:2px; align-items:flex-start; }
${RF} > .sf-cru-stage.orr-hull--on .is-left.is-open .orr-hp__spares { align-items:flex-end; }
${RF} > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare { display:inline-flex !important; }
${RF} > .sf-cru-stage.orr-hull--on .is-open .orr-hp__scales { display:block !important; }
${RF} > .sf-cru-stage.orr-hull--on .is-open .sf-cru-act { margin-top:4px !important; align-self:auto; }

/* 3 — keycaps inside foot buttons */
${RF} .k-foot .sf-cru-kbd,
${RF} > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-act:not(:disabled)::after {
  background:rgb(9 20 30 / .85) !important; border:1px solid rgb(158 220 233 / .4) !important; border-radius:2px !important;
  box-shadow:none !important; padding:2px 6px !important; color:#9edce9 !important;
}
${RF} .k-foot .sf-cru-kbd { margin-left:10px !important; }

/* 4 — Authoritative chamfered gold-amber launch key (DONE — FLY OUT / LAUNCH ROUND) */
${RF} .sf-cru-launch,
${RF} .k-foot .k-word.k-word--primary,
${RF} .k-foot .k-word.k-word--primary:not(.is-lamp) {
  clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)) !important;
  border:1px solid #e6ca8f !important;
  border-radius:2px !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .30) 0%, rgb(224 181 94 / .14) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .30), 0 8px 22px rgb(0 0 0 / .55) !important;
  color:#fff1cf !important;
  font-size:16px !important;
  font-weight:700 !important;
  letter-spacing:.12em !important;
  text-transform:uppercase !important;
}
${RF} .k-foot .k-word.k-word--primary .sf-cru-label {
  color:#fff1cf !important;
}
${RF} .k-foot .k-word.k-word--primary .sf-cru-kbd {
  color:#ffe7b3 !important;
  border-color:rgb(230 202 143 / .55) !important;
}
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${RF} .k-foot .k-word.k-word--primary:not(.is-lamp) { font-size:17px !important; }
}

/* 5 — the next-round line wears the same voice as the armory's own */
${RF} > .k-title .sf-cru-preview {
  font:400 13px/1.45 var(--dp-face-body, 'Instrument Sans'), sans-serif !important;
  letter-spacing:.01em;
}

/* —— UI polish: short densify (list-mode hardpoints ∩ tall foot) ——
   At ≤560 tall the finish foot (Take the win / Keep going + keynotes) stacked to
   ~169px and left the list stage ~60px with overflow:visible, so open hardpoint
   rows painted under the opaque curtain (651/700×461 row∩foot mash ~39–42k;
   801×461 / 960×500 ~43–49k). Compress chrome, turn the stage into a real
   scrollport, and raise a fade apron so FIT verbs stay clear of the foot. */
@media (max-height:560px) {
  ${RF} {
    display:grid !important;
    grid-template-columns:minmax(0,1fr) !important;
    grid-template-rows:auto minmax(0,1fr) auto !important;
    gap:8px !important;
    padding:12px 18px 8px !important;
    overflow:hidden !important;
    height:100dvh !important;
    max-height:100dvh !important;
    align-content:stretch !important;
    box-sizing:border-box !important;
  }
  ${RF} > .k-title { margin:0 !important; padding:0 !important; min-width:0 !important; }
  ${RF} > .k-title .k-t-title, ${RF} > .k-title h1 {
    font-size:clamp(24px, 5.5vh, 32px) !important; line-height:.92 !important;
  }
  ${RF} > .k-title .sf-cru-sub {
    font-size:12px !important; margin-top:2px !important; line-height:1.3 !important;
    max-width:52ch !important;
  }
  ${RF} > .k-title .sf-cru-preview, ${RF} > .k-title .sf-cru-note {
    font-size:12px !important; margin-top:2px !important; line-height:1.3 !important;
    display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2;
    overflow:hidden !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) {
    position:relative !important; z-index:1 !important;
    min-height:0 !important; height:auto !important; max-height:100% !important;
    overflow:hidden !important;
    display:flex !important; flex-direction:column !important;
    padding-top:2px !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) > .sf-cru-rows {
    flex:1 1 auto !important; min-height:0 !important; max-height:100% !important;
    /* ui-polish-442: the list scrolls the lit hardpoint into view, so its top edge needs the same fade as
       its foot; at 960x540 the row above printed its STRIP / SELL verbs as a sliced line under the title. */
    overflow:auto !important; gap:0 !important; padding-bottom:6px !important;
    -webkit-mask-image:linear-gradient(180deg, transparent 0, #000 16px, #000 calc(100% - 18px), transparent 100%) !important;
    mask-image:linear-gradient(180deg, transparent 0, #000 16px, #000 calc(100% - 18px), transparent 100%) !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row {
    padding:6px 0 8px !important; column-gap:12px !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__contrast {
    font-size:12px !important; line-height:1.3 !important;
    display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2;
    overflow:hidden !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) .orr-hull-fitcount {
    position:static !important; left:auto !important; right:auto !important; bottom:auto !important;
    margin:0 0 4px !important; font-size:12px !important;
  }
  ${RF} > .k-foot {
    z-index:8 !important; position:relative !important; isolation:isolate;
    flex:none !important; grid-row:3 !important;
    margin:0 !important; padding:6px 0 4px !important;
    border-top:1px solid rgb(236 230 216 / .16) !important;
    background:rgb(5 7 10) !important;
    box-shadow:0 48px 0 0 rgb(5 7 10), 0 -28px 28px -2px rgb(5 7 10 / .97) !important;
  }
  ${RF} > .k-foot::before {
    content:'' !important; display:block !important; pointer-events:none !important;
    position:absolute !important; left:0 !important; right:0 !important; bottom:100% !important;
    height:22px !important;
    background:linear-gradient(180deg, transparent, rgb(5 7 10)) !important;
  }
  ${RF} .k-foot .k-words {
    position:relative; z-index:1;
    flex-wrap:wrap !important; gap:6px 12px !important; align-items:center !important;
    justify-content:flex-start !important; column-gap:12px !important;
  }
  ${RF} .k-foot .k-word {
    font-size:13px !important; min-height:32px !important; padding:0 10px !important;
  }
  ${RF} .k-foot .k-word.k-word--primary:not(.is-lamp) {
    font-size:14px !important; min-height:34px !important; padding:0 12px !important;
  }
  ${RF} .k-foot .sf-cru-kbd { margin-left:6px !important; font-size:12px !important; }
  ${RF} .k-foot .sf-cru-fine, ${RF} .k-foot .sf-cru-keynote {
    font-size:12px !important; line-height:1.25 !important; max-width:28ch !important;
    margin:0 !important;
  }
}
/* Very short / narrow-short: compact the verbs without withdrawing their consequences. */
@media (max-height:500px) {
  ${RF} > .k-foot { padding:4px 0 2px !important; }
  ${RF} .k-foot .k-word { min-height:30px !important; font-size:12px !important; }
  ${RF} .k-foot .k-word.k-word--primary:not(.is-lamp) { font-size:13px !important; min-height:32px !important; }
}
@media (min-width:641px) and (max-width:820px) and (max-height:560px) {
  ${RF} .k-foot .k-words { gap:6px 10px !important; }
  ${RF} .k-foot .k-word { font-size:12px !important; min-height:30px !important; padding:0 8px !important; white-space:nowrap !important; }
  ${RF} .k-foot .k-word.k-word--primary:not(.is-lamp) { font-size:13px !important; }
}
/* Phone portrait (390×844): height clears the ≤560 band, but the stacked finish foot
   still leaves list rows painting under Take the win / Keep going. Same scrollport + curtain. */
@media (max-width:560px) {
  ${RF} {
    display:grid !important;
    grid-template-columns:minmax(0,1fr) !important;
    grid-template-rows:auto minmax(0,1fr) auto !important;
    gap:8px !important;
    padding:12px 14px 8px !important;
    overflow:hidden !important;
    height:100dvh !important;
    max-height:100dvh !important;
    align-content:stretch !important;
    box-sizing:border-box !important;
  }
  ${RF} > .k-title .k-t-title, ${RF} > .k-title h1 {
    font-size:clamp(24px, 6vw, 32px) !important; line-height:.92 !important;
  }
  ${RF} > .k-title .sf-cru-sub { font-size:12px !important; margin-top:2px !important; }
  ${RF} > .k-title .sf-cru-preview, ${RF} > .k-title .sf-cru-note {
    font-size:12px !important; -webkit-line-clamp:2; line-clamp:2;
    display:-webkit-box !important; -webkit-box-orient:vertical; overflow:hidden !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) {
    min-height:0 !important; overflow:hidden !important;
    display:flex !important; flex-direction:column !important;
    /* the list opens scrolled to the lit hardpoint, so its first visible row's head sits a few px
       above the stage: the 2-line round forecast above it printed through that row (bench 2026-11-15) */
    padding-top:8px !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) > .sf-cru-rows {
    flex:1 1 auto !important; min-height:0 !important; overflow:auto !important;
    padding-bottom:6px !important;
    -webkit-mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
    mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row { padding:6px 0 8px !important; }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) .orr-hull-fitcount {
    position:static !important; margin:0 0 4px !important; font-size:12px !important;
  }
  ${RF} > .k-foot {
    z-index:8 !important; position:relative !important; isolation:isolate;
    flex:none !important; grid-row:3 !important;
    padding:6px 0 4px !important;
    border-top:1px solid rgb(236 230 216 / .16) !important;
    background:rgb(5 7 10) !important;
    box-shadow:0 48px 0 0 rgb(5 7 10), 0 -28px 28px -2px rgb(5 7 10 / .97) !important;
  }
  ${RF} > .k-foot::before {
    content:'' !important; display:block !important; pointer-events:none !important;
    position:absolute !important; left:0 !important; right:0 !important; bottom:100% !important;
    height:22px !important;
    background:linear-gradient(180deg, transparent, rgb(5 7 10)) !important;
  }
  ${RF} .k-foot .k-words {
    flex-wrap:wrap !important; gap:6px 10px !important; justify-content:flex-start !important;
  }
  ${RF} .k-foot .k-word { font-size:13px !important; min-height:32px !important; padding:0 10px !important; }
  ${RF} .k-foot .k-word.k-word--primary:not(.is-lamp) { font-size:14px !important; min-height:34px !important; }
}
/* The fine print names what ending, continuing or banking commits. Let each action
   wrap with its consequence; a bounded footer scrolls when all offers cannot fit. */
@media (max-height:560px), (max-width:560px) {
  ${RF} > .k-foot {
    min-height:0 !important; max-height:45dvh !important;
    overflow-y:auto !important; overflow-x:hidden !important;
    scroll-padding-block:8px;
  }
  ${RF} .k-foot .k-words {
    display:grid !important; width:100% !important; min-width:0 !important;
    grid-template-columns:repeat(auto-fit, minmax(min(16rem, 100%), 1fr)) !important;
    align-items:start !important;
  }
  ${RF} .k-foot .k-words > li { min-width:0 !important; }
  ${RF} .k-foot .k-word {
    max-width:100% !important; height:auto !important;
    white-space:normal !important; overflow-wrap:anywhere;
  }
  ${RF} .k-foot .sf-cru-keynote {
    max-width:none !important; margin:4px 0 0 !important;
    font-size:12px !important; line-height:1.35 !important;
    white-space:normal !important; overflow-wrap:anywhere;
  }
}

/* —— Laptop height (first-hour pass, 561-800 tall): the same scrollport the short band uses, with the
   type left at its full size. The list gets the room the preview paragraph and a three-row foot were
   taking; the preview keeps two lines (the whole sentence is the stage's own tooltip text), and the
   foot lays its offers side by side with each consequence beneath, so nothing is cut at the bottom. —— */
@media (min-width:761px) and (min-height:561px) and (max-height:800px) {
  ${RF} {
    display:grid !important; grid-template-columns:minmax(0,1fr) !important;
    grid-template-rows:auto minmax(0,1fr) auto !important; gap:10px !important;
    padding:14px 48px 10px !important; overflow:hidden !important;
    height:100dvh !important; max-height:100dvh !important; align-content:stretch !important; box-sizing:border-box !important;
  }
  ${RF} > .k-title { margin:0 !important; padding:0 !important; min-width:0 !important; }
  ${RF} > .k-title .k-t-title, ${RF} > .k-title h1 { font-size:clamp(30px, 5.2vh, 40px) !important; line-height:.95 !important; }
  ${RF} > .k-title .sf-cru-sub { margin-top:4px !important; font-size:14px !important; }
  ${RF} > .k-title .sf-cru-preview, ${RF} > .k-title .sf-cru-note {
    margin-top:3px !important; line-height:1.3 !important; max-width:110ch;
    display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2; overflow:hidden !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) {
    position:relative !important; z-index:1 !important; min-height:0 !important; height:auto !important; max-height:100% !important;
    overflow:hidden !important; display:flex !important; flex-direction:column !important; padding-top:2px !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) > .sf-cru-rows {
    flex:1 1 auto !important; min-height:0 !important; max-height:100% !important; overflow:auto !important; gap:0 !important; padding-bottom:6px !important;
    -webkit-mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
    mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
  }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) > .sf-cru-rows { display:grid !important; grid-template-columns:repeat(2, minmax(0,1fr)) !important; column-gap:36px !important; align-content:start !important; }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row { padding:6px 0 8px !important; }
  ${RF} > .sf-cru-stage:not(.orr-hull--on) .orr-hull-fitcount { position:static !important; margin:0 0 4px !important; }
  ${RF} > .k-foot {
    z-index:8 !important; position:relative !important; isolation:isolate; flex:none !important; grid-row:3 !important;
    margin:0 !important; padding:8px 0 4px !important; border-top:1px solid rgb(236 230 216 / .16) !important;
    background:rgb(5 7 10) !important; min-height:0 !important; max-height:42dvh !important; overflow-y:auto !important; overflow-x:hidden !important;
  }
  ${RF} .k-foot .k-words {
    display:grid !important; width:100% !important; min-width:0 !important; gap:6px 18px !important; justify-content:stretch !important;
    grid-template-columns:repeat(auto-fit, minmax(min(15rem, 100%), 1fr)) !important; align-items:start !important;
  }
  ${RF} .k-foot .k-words > li { min-width:0 !important; }
  ${RF} .k-foot .k-word { max-width:100% !important; height:auto !important; min-height:36px !important; white-space:normal !important; overflow-wrap:anywhere; }
  ${RF} .k-foot .sf-cru-keynote, ${RF} .k-foot .sf-cru-fine { max-width:none !important; margin:4px 0 0 !important; font-size:12px !important; line-height:1.35 !important; }
}

`;

// One more jig layout after the arrival window: the foot's settle transform is done (kit settle
// holds offset for delay+140ms; the screen's delays are 60/120ms), so the dial sizes itself to
// resting chrome and the ring's engraving clears the foot plate. The jig rebuilds its layer on
// every relayout and the screen's own MutationObserver re-dresses it (crucibleDraft.js:2004-2009),
// so nothing here needs to re-apply the dressing. Reduced motion never transforms, and a spare
// layout at rest is a no-op there.
const ARRIVAL_SETTLE_MS = 640;

function installPostArrivalRelayout() {
  const screen = crucibleRefitScreen;
  if (!screen || typeof screen.onShow !== 'function' || screen.__refitLayoutsArrival) return;
  screen.__refitLayoutsArrival = true;
  const { onShow, onHide } = screen;
  let timer = 0;
  screen.onShow = function () {
    const result = onShow.call(this);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      try {
        if (this._jig && typeof this._jig.relayout === 'function') this._jig.relayout();
      } catch { /* the layout is cosmetic; never break the screen over it */ }
    }, ARRIVAL_SETTLE_MS);
    return result;
  };
  screen.onHide = function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    return onHide.call(this);
  };
}

export function injectCrucibleRefitLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CRUCIBLE_REFIT_SCREEN_CSS;
    doc.head.appendChild(style);
  }
  installPostArrivalRelayout();
}
