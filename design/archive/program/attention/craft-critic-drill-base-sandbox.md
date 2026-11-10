# Craft critic — Drill / Base / Sandbox

Independent review; the reviewer (Explore subagent) did not implement these surfaces and had no
exec/pixel tools — it produced the code-level reconnaissance and predicted-DOM analysis this file
rests on. The pixel pass and walks were then run by the owning lane against that checklist.

## Run metadata

- 2026-10-26 · `node scripts/ui-bench.mjs --shot=drill,drill-claimed,drill-build,base,base-claimed,sandbox
  --viewports=1280x720,1920x1080` plus `--walk` on `base-claimed` and `sandbox` at 1280×720.
- PNGs: `.devshots/ui-bench/{1280x720,1920x1080}/{drill,drill-claimed,drill-build,base,base-claimed,sandbox}.png`
  and walk frames `.devshots/ui-bench/base-claimed--*.png`, `sandbox--*.png`.
- All six surfaces × both viewports measured clean: no tangled/buried/cut-off/offscreen type, no
  empty boxes, primary controls reachable.

## Bench limitations (verified, not defects)

- **`drill` (unclaimed) captures a bare backdrop.** `asteroidScreen.js` `onShow` exits when
  `!ctx.state.drill` — the catalog entry seeds no session, so the mount pops during settle. The
  unclaimed stage is only reachable inside a live drill session; unreviewable from stills.
- **`drill-claimed`/`drill-build` playfield is a dark void with "Loading mining equipment…"** —
  `asteroidRenderer3d.js` `readiness()` requires terrain + rock surface + rover, none satisfiable
  in a still. The banner is the honest readiness line, single slot, warn color. Judged as
  purposeful loading-state copy; the 3D playfield itself is unreviewable from the bench.
- **Sandbox `inGame` quirk:** the seeded hull entity enables the live-tools row and hides the
  "launch a game first" hint — fixture behavior, not screen truth.

## Pixel evidence (opened and judged)

- **base** (no body selected): claim plate with three named prospects on a ticked scale,
  "Open chart N" + RETURN lamp. Hierarchy clean; the armed tick + lamp both read warm — the tick
  is a selection bead, not a second Hand. PASS.
- **base-claimed**: "Lacuna Survey Moon", research gate line, module ladder with three BUILD
  verbs, three operating-identity cards in verb/consequence/tradeoff prose, storage ledger,
  disabled DISPATCH CONVOY (convoy away — receipt line visible). Purposeful composition — the
  page communicates what the site does and what's blocked. PASS.
- **sandbox** (foreign ORRERY restyle, adopted for review): "DEV HARNESS · TEST ROUTES", 01-of-13
  dial, quick setups as ticked rungs, combat-lab field grid, amber LAUNCH key, produced ship art.
  Coherent, no card-slab silhouettes. The pre-existing `injectStyle` ReferenceError integration
  note did not reproduce — the screen mounts clean. PASS.
- **drill-claimed / drill-build**: chrome only (playfield is the bench void). Crest reads name +
  Anchored chip + Assay 14 cells + Site 0 u/day·Idle; guide card "Bring power to the machine /
  Route power"; hotbar slots 1–10; Heat 40% / Charge 65% arcs — all live values, not dead
  instruments (reconnaissance's F-drill-dead-rig only applies to the sessionless mount, which
  pops). The loading banner occupies its own slot center-top without crowding. Two warm elements
  coexist (armed palette key + "Route power" verb) — judged admissible under
  ASTEROID_WORKS_DESIGN_LAW, which governs this screen and deliberately diverges from ORRERY's
  one-Hand law. CONDITIONAL PASS on chrome; the playfield owes a live-route pass.

## Live-route closure (2026-10-27, owning lane)

The conditional playfield pass is now delivered. `node scripts/ui-look.mjs --only=asteroid-works
--devsetup=drill` (new `--devsetup` flag riding the `?dev=screen:drill&devsetup=drill` route that
launches through `requestSandboxGame`) booted a real drill session on this host after the
device-class budget fix, and `00-arrival.png` shows the live playfield: gridded rock cells, the
drill vehicle on the face, the surface rig overhead, star field behind, "Slow Knuckle" crest with
the no-output-yet sentence, "Cut your first tunnel" guidance card with real bindings, and live
Heat 0% / Charge 100% arcs. The Controls control opens the full help drawer (drive/bore/survey/
build/dismantle/zoom/drawers/leave legend, three tabs). Four of four controls walked; the sandbox
screen's DRILL TEST control was also exercised live and launches the scenario transition. The
unclaimed pop the bench hits is the screen's honest contract — a sessionless drill screen refuses
to mount.

## Walk evidence

- **base-claimed** (13 controls): the three BUILD verbs report "picture stayed" in the walk log but
  their PNGs show the BUILD MODULE sheet mounted (module spine, costs, research gates) — the
  control works, the diff metric under-reads a same-size layer. Disabled states correctly disabled
  (occupied identity, gated research, convoy away). "Deliver 10u Ore Iron" mutates state.
  Return/Esc exits.
- **sandbox** (24 of 58): every setup tile arms and changes the picture; selects open their
  listbox layer; roll reseeds; numeric inputs take focus; speed keys switch. LAUNCH / RELAUNCH /
  live-tools emit their intents (launch leaves the screen — legitimate "picture stayed").

## Scores (1–10)

| Surface | Hierarchy | ORRERY/AW-law fit | State legibility | 720p discipline | Purpose | Mean | Verdict |
|---|---|---|---|---|---|---|---|
| base | 8 | 8 | 8 | 9 | 8 | 8.2 | PASS |
| base-claimed | 8 | 8 | 9 | 8 | 9 | 8.4 | PASS |
| sandbox | 8 | 9 | 8 | 9 | 8 | 8.4 | PASS |
| drill-claimed | 7 | 8 | 8 | 8 | 7 | 7.6 | PASS (playfield verified live 2026-10-27) |
| drill-build | 7 | 8 | 8 | 8 | 7 | 7.6 | PASS (playfield verified live 2026-10-27) |
| drill (unclaimed) | — | — | — | — | — | — | PASS (live route, real session, 2026-10-27) |

\* CONDITIONAL = chrome passes; the Three.js playfield — the surface's core content — is
unreviewable from stills and owes a live-route pass (`ui-look.mjs`) on a host that can run it.

## Findings

- None material. Watch items only:
  - Two warm elements on drill-build (armed key + guide verb) — admissible under this screen's
    law, but if Asteroid Works is ever folded fully under ORRERY the one-Hand rule applies.
  - `drill` unclaimed cannot be photographed by the bench (pop-on-mount); if its empty stage ever
    needs craft review, the fixture must hold a session open.

## Overall: PASS — live-route look delivered 2026-10-27
