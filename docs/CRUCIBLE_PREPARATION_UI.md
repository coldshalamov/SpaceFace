# Crucible preparation and visual armory

## Player flow

The existing `crucible` screen now presents two preparation steps. Encounter owns the mode,
stake and arena decision; Ship & kit previews the real starter or bare hull with its canonical
hardpoints. The original launch button still calls `requestCrucibleRun`, through the ordinary
New Game route. Swarm says **Open armory**; it does not pretend that launching a run means
combat starts before equipment is purchased. Quick play remains available.

Daily/weekly challenges, seeds, sharing, ghosts and records remain in a disclosure. Starter
unlock requirements remain authoritative. A Weapons Cold weekly challenge previews the same
weapon removal as the launch path. Hull thumbnails reuse existing produced posters rather
than allocating a second WebGL renderer.

The Swarm armory separates inspection from purchase. A card, keyboard arrow or number key
selects equipment; only Install/Purchase/Switch hull emits the existing purchase intent. A
fresh owner snapshot checks that the offer is still present, available and unpurchased and
that the run still waits in the draft phase. Prices and the run wallet remain visible;
unaffordable rows remain inspectable. The ship jig locates the destination/replacement and
Current build discloses the actual fitted inventory. The existing one-round demo control
is keyboard/pointer accessible rather than residing in an aria-hidden, pointer-inert aside.

Gauntlet's three-choice rearm and all simulation/economy/refit ownership remain unchanged.
No balancing, prices, rewards, arena generation, controls in flight or save schema changed.

## Assets and ownership

- `src/ui/orrery/equipmentGlyphs.js`: 28 authored 128-unit SVG equipment/mode families;
  semantic fallbacks, no external requests or icon-font dependency.
- `assets/ui/orrery/crucible-equipment.svg`: reusable symbol sheet with the identical geometry.
  The focused test checks parity with the runtime SVG source.
- `cruciblePreparation.js`: presentation adapter and pure canonical loadout view model.
- `crucibleArmory.js`: object inspector, run-wallet readout and purchase control.
- `cruciblePreparationLayouts.js`: scoped composition using existing Deckplate/ORRERY tokens.
- Screen files continue to own events. The adapters do not write credits, phase or fittings.

The short reveals honor the game's `sf-reduce-motion` setting. Illustrations are decorative;
controls carry accessible names and selected states. Mobile uses scrolling instead of shrinking
controls below useful size. Resize observers, timers and listeners are released on disposal;
the slot jig ignores late asynchronous drawing requests after destruction.

## Verification

```sh
node --test test/crucible-visual-preparation.test.mjs
node --test test/crucible-draft.test.mjs test/crucible-round-shop.test.mjs test/crucible-refit.test.mjs test/crucible-refit-focus.test.mjs test/crucible-refit-verbs.test.mjs test/crucible-prepared-loadout.test.mjs test/crucible-meta.test.mjs test/crucible-swarm.test.mjs
node scripts/check-crucible-preparation-ui.mjs
```

The browser check starts the repository's UI bench and cleans up its browser/server. Output
is ignored under `.devshots/crucible-preparation`; `--out=/tmp/crucible-ui` overrides it. It
checks real menu modules and draft/fitting owners, explicit purchases, demo trials, keyboard
navigation, search recovery, launch intent, the preserved Gauntlet rearm, reduced motion, and
1440×900 / 1280×800 / 390×844 layouts. The bench supplies a seeded run wallet; it is not a
full game bootstrap, live-wave playtest or integrated-GPU performance measurement.
