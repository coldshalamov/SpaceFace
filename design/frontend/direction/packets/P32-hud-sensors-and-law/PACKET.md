```yaml
packet: P32
title: Flight HUD, part two — the radar face, contacts, target panel, sector-law badge, reticle, the wanted temperature
lane: CODE
tool: local (Codex or Grok in the shared checkout, isolated by write set and mutex (no worktrees); the controller integrates)
dependsOn: [P31]
current: [flight, comms-radial, wingman-radial]
inputs: [design/frontend/direction/approved/frame-hud-resting.png, design/frontend/direction/approved/frame-hud-wanted.png, design/frontend/direction/approved/layer-hud-wanted.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P32-REPORT.md
mutex: [flight-hud]
```

# P32 — Flight HUD: sensors, law, temperature

## Objective

The right side of the approved HUD frames and the whole-frame **wanted** state: the **radar** as
a smoked-glass face in an etched bezel (P12 bezel/face PNG; rings and sweep as SVG; contact glyphs
from `radar-glyph-paths.json` drawn on the existing 2D canvas via `Path2D` — the canvas stays, its
drawing changes), the **contacts list** as engraved rows with class glyphs, distance numerals and
faction lights, the **target panel** on a small plate, the **sector-law badge** (crest well, safety
strip, two legends, one fine line), the etched **reticle set**, the **world tag**; and the
temperature machinery so that going wanted turns every backlight cold and every signal red across
the HUD at once (one sustained tone), and clearing returns it.

## Write set

`src/ui/radar.js`, `src/ui/targetPanel.js`, `src/ui/sectorLawPresenter.js`, `src/ui/hud.js`
(rightdock and overview sections), `src/ui/uiRoot.js` (reticle SVG only), `src/ui/glyphs.js`
(delegating to the kit), `src/ui/kit/temperature.js`, `styles/hud.css`, `styles/fh.css`.

## Checks and evidence

`npm run check:baseline` · `npm run check:ui:perf` · `npm run check:radar:perf` ·
`npm run check:ui-identity` · `node scripts/capture-ui-matrix.mjs --world --headed
--only=flight,comms-radial,wingman-radial --out=.devshots/frontend/P32` · a clip of going wanted
and clearing (drive the heat with the sandbox or a fixture).

## Acceptance

Captures pass the rubric beside both frames; the wanted transition changes the whole frame in one
400 ms move and holds; radar glyphs are distinct at 10 px; the canvas radar stays within its
performance check.

## The way this gets faked

Tinting the old radar; a sector-law paragraph on a plate; a wanted state that is a red badge.
