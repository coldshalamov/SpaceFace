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
/* 2 — the callout line wraps between whole segments; a spare is one unbreakable unit */
${RF} > .sf-cru-stage.orr-hull--on .orr-hp__line { flex-wrap:wrap !important; }
${RF} > .sf-cru-stage.orr-hull--on .orr-hp__spares { white-space:nowrap; }
${RF} > .sf-cru-stage.orr-hull--on .orr-hp__spare-stat { white-space:nowrap; }

/* 3 — keycaps are bare glyphs here, the library's own voice (pause foot, lit act's Enter) */
${RF} .k-foot .sf-cru-kbd,
${RF} > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-act:not(:disabled)::after {
  background:none !important; border:0 !important; border-radius:0 !important;
  box-shadow:none !important; padding:0 0 0 9px !important;
}
${RF} .k-foot .sf-cru-kbd { margin-left:10px !important; }

/* 4 — the primary verb leads by scale when no lamp carries it */
${RF} .k-foot .k-word.k-word--primary:not(.is-lamp) { font-size:19px !important; }
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${RF} .k-foot .k-word.k-word--primary:not(.is-lamp) { font-size:20px !important; }
}

/* 5 — the next-round line wears the same voice as the armory's own */
${RF} > .k-title .sf-cru-preview {
  font:400 13px/1.45 var(--dp-face-body, 'Instrument Sans'), sans-serif !important;
  letter-spacing:.01em;
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
