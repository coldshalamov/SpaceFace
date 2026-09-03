// Crucible focus (PQ-135) — the arena stops wearing the campaign's clothes.
//
// WHY THIS EXISTS
// ---------------
// A screenshot of a live swarm wave, taken to see whether the mode reads as its own game, showed
// the fight surrounded by furniture from a different one: an AUTHORITY RECEIPT panel about station
// jurisdiction, a comms band tape with nobody to hail, a campaign mission tracker, a navigation
// readout pointing at a beacon in another sector, an objective line, a planet band pill. The owner's
// complaint about the Crucible was that it read as "a half-assed attempt to just spawn some enemies
// within the game", and this is a large part of why: every frame of it is framed as an errand
// inside the campaign rather than as a match.
//
// None of those panels can act on anything during a run. There is no jurisdiction in the arena, no
// station to hail, no mission, no waypoint, and heat is sealed at zero (see core/runSeal.js). They
// are not just noise, they are noise that says the wrong thing about what the player is doing.
//
// WHAT IT DOES NOT HIDE, and why
// ------------------------------
// Everything that is about the FIGHT stays: the reticle, hull and shield, the weapons row, the
// contacts strip (knowing what is behind you is the game), the field-tool rig (Seed/Well/Repulsor
// are the physics weapons this mode is built around), damage tells, and the Crucible's own readout.
//
// HOW IT IS BUILT
// ---------------
// Presentation only, and reversible by construction: it toggles ONE class on the UI root and ships
// one stylesheet that hides other owners' panels while that class is present. It never unmounts a
// panel, never edits another module's DOM, and never touches a system. When the run ends the class
// comes off and every panel returns exactly as it was — including if a run ends by the player
// quitting to the menu mid-fight.

import { isRunSealed } from '../core/runSeal.js';

export const CRUCIBLE_FOCUS_CLASS = 'sf-crucible-focus';
const STYLE_ID = 'sf-crucible-focus-style';

/**
 * The campaign-only panels. Each is another module's own root class; this file only ever hides
 * them, and only while a run is live.
 *
 * Kept as data so a test can assert the list rather than parse CSS, and so the reason for each
 * entry is written next to it.
 */
export const CRUCIBLE_HIDDEN_PANELS = Object.freeze([
  // THE TUTORIAL. A live run was showing "Status 1 / 10 — Thrust until speed passes forty" over the
  // top of wave one. Of everything on this list, this is the one that most makes the arena look
  // like somebody else's game.
  '#sf-onboarding',
  // Sector law: jurisdiction, authority receipts, "station protection prevented return fire".
  // There is no jurisdiction in an arena and nothing to stand down from.
  '#sf-sector-law',
  '.sf-law',
  // Campaign comms: the story log and its hails. Nobody in the Crucible is talking to you.
  '#sf-comms',
  '.sf-commtape',
  '.sf-band-hud',
  // The sector identity card — "Helios Prime · Solar Concord Navy · SECURE · trades:". The player
  // is in a match, not visiting a place.
  '#sf-sector-postcard',
  // The planet band pill and its heat figure. Heat is sealed at zero inside a run.
  '.sf-planet-root',
  // Campaign objective furniture: the beacon key on the radar and the off-screen goal arrow both
  // point at a waypoint in a sector the player is not in and cannot go to.
  '.sf-radar-objective-key',
  '.sf-objarrow',
  // Mission tracker, navigation readout and objective line. Only present when a campaign mission
  // is live, which it can be — a run is launched from a save that has one.
  '.sf-mission-tracker',
  '.sf-nav-readout',
  '.sf-obj',
]);

function styleText() {
  const selectors = CRUCIBLE_HIDDEN_PANELS
    .map((sel) => `.${CRUCIBLE_FOCUS_CLASS} ${sel}`)
    .join(',\n  ');
  return `
  /* Crucible focus: campaign furniture is hidden for the length of a run and returns after it.
     display:none rather than opacity, so nothing here can be clicked or read by a screen reader
     while it is meaningless. */
  ${selectors} { display: none !important; }
`;
}

/**
 * BODY, not #ui-root. These panels do not all share one host — the onboarding card, the comms feed,
 * the sector law dock and the postcard each mount wherever their own owner chose, some under
 * #ui-root and some under #hud. Body is the only ancestor all of them share, so it is the only
 * place one class can reach all of them without this file having to know any of that.
 */
function focusHost() {
  if (typeof document === 'undefined') return null;
  return document.body || null;
}

export const crucibleFocus = {
  name: 'crucibleFocus',
  id: 'crucibleFocus',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._applied = null;
  },

  destroy() {
    this._release();
  },

  newGame() {
    this._release();
  },

  update(dt, state) {
    // Headless contract: this is the whole of it. Node runs the sim with no document.
    if (typeof document === 'undefined') return;
    const st = state || this.state;
    // Only a SURVIVAL run dresses down the screen. A lab session keeps the ordinary HUD: it is a
    // workbench inside the campaign, not a match.
    const run = st && st.run;
    const wanted = !!(run && run.kind === 'survival' && isRunSealed(st));
    if (wanted === this._applied) return;
    this._applied = wanted;
    const root = focusHost();
    if (!root) return;
    if (wanted) this._injectCss();
    root.classList.toggle(CRUCIBLE_FOCUS_CLASS, wanted);
  },

  _release() {
    if (typeof document === 'undefined') return;
    this._applied = null;
    const root = focusHost();
    if (root) root.classList.remove(CRUCIBLE_FOCUS_CLASS);
  },

  _injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = styleText();
    document.head.appendChild(style);
  },
};

export default crucibleFocus;
