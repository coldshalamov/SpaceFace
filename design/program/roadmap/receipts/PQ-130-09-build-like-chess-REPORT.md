<!-- LIFETIME: RECEIPT -->
# PQ-130.09 Build like chess — receipt

**State:** done (2026-08-21). **Law:** design law §6.3, §6.7, §6.4 (ghost chips), §3.2–§3.4, §9 (first-Core mount), §11.3–§11.4.

## What shipped
- `src/ui/asteroid/buildPalette.js` rewritten as the **earned palette**; the 3×3 command card is gone.
  No DOM until this rock owns a Core (`sm_massline_core` installed or `site.anchored`); before that BUILD
  arms the Core implicitly (one legal build, no chrome spent on a non-choice). On the Core landing the
  row mounts with a 300 ms rise+fade (reduced-motion honoured; no replay on re-entry). One key per
  installable machine; the unique Core becomes **absent** once built — never a gray placeholder;
  Cable/Lane appear with the Core, Dismantle once any machine stands.
- Keys 46×46, r8, `--aw-raised`, 22px filled silhouette, 12px mono numeral, name only in the hover tip.
  States published on `data-key-state` and asserted in computed paint: **ready** (raised, ink-2, hover
  lifts 1px) · **armed** (gold ring + gold glyph) · **unaffordable** (flat surface, ink-3, hover reveals
  the shortfall in coral). Row anchored right of centre, grows leftward, 16px clear of the rig cluster.
- `asteroidController.js`: build cursor on the controller's own clock (tap = 1 cell, hold-to-repeat at
  a fixed cadence — measured by the check: 140 ms hold = 1 cell, 760 ms = 4); digits route in either mode
  when a key owns the index.
- `asteroidScreen.js`: palette mount/unmount + gating; the LAST transitional container deleted;
  `data-mode` and `data-cursor` published from frame one (a DRIVE-only session used to report
  `undefined`); input listeners bind **before** the renderer (a scene-construction throw used to leave a
  screen with no keys at all).
- `styles/asteroid-ops.css`: palette styles; fixed `.ast-screen button { background: none }` silently
  out-specifying the key rules (every unarmed plate rendered transparent).
- Blocked reasons come from the lens ghost card's existing bank (`No bore link`, `Bore it out first`,
  `A machine sits here`, `The rover is parked here`, `Drive the rover alongside`, `Needs a sealed
  pocket`, `One Core per asteroid`, `Missing materials`, `Outside the grid`, `Survey no longer
  matches`); the key stays armed on refusal.
- PQ-024 probe/lib/test re-aimed off the deleted context bay: four `.ast-inspector` assertions that
  would have passed against `''` forever now bind the crest chips; the stale-placement error reads the
  crest alert slot; the test bans the retired selectors outright.

## Evidence
- `check:asteroid-theater` green at 1920×1080 and 1280×720: no palette element before a Core (with a
  vacuity guard), 8 keys after, three states distinct in paint, no Core key, no rig overlap, names off
  the glass, word budget 8 → 9 of 15, cursor cadence measured. (The additive check/capture changes
  land with `.07`, which is editing the same two scripts.)
- pq024 survey-claim 22/22, claim-manifest 17/17; `check:playable` 14/14 (known CLEAN flake, rerun).
- Stills reviewed by the orchestrator: `09-palette.png` (armed extractor key, mint ghost, tooltip);
  agent stills `09b-ghost-blocked.png`, `09c-palette-unaffordable.png`.

## Handed to `.10` (renderer)
Mint valid-face glow on the board, why-glyphs drawn on invalid faces, ~15% gridline strengthening in
build mode. The lens ghost card is the why-channel meanwhile.
