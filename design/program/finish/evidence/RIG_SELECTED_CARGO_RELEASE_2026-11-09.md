# RATCHET: choose which original load to set loose

## Player activity
The rig field card's **Recovery · release** page now offers **Choose cargo to release**, rather than forcing the last captured load to be dropped. The secondary page names each currently native-secured body and its current physical mass. The pilot can shed an earlier heavy load to rebalance while keeping a later light load clamped. The existing maximum is three cargo bodies, so this page is bounded to five choices including Back and Keep flying. With no eligible restraint, Back and Leave remain available.

This cuts the selected existing restraint only. It never delivers, sells, rewards, teleports, replaces or erases cargo. The original keeps its position and momentum. Physically recovering or securing it again remains the existing gameplay.

## Exact scope and ownership
- `src/features/rigWorkshop/runtime.js`: single existing owner; selection page and one field-care entry.
- `test/rig-cargo-release-choice.test.mjs`: six focused tests.
- This evidence note.

Source was clean before editing; exact before copy `/tmp/rig-runtime.before-release-choice.js`. Fresh remote master `f95de0eb1ba7560839209936afba48c7b96fe41a`. Current NOW and peer claims checked; adventure_next is on separate homestead/Lio paths. Parent approved safe exact-identity release. All existing tender/Breakwater and other candidates preserved. No physical owner, save schema, prices, stock, assets, render or publication change.

The menu captures the active rig object, original body reference, positive occupant generation and exact cargo ID. Choosing revalidates all of them and the physical owner's current native restraint before invoking its existing release action. Broken restraints, changed rig, recycled life or replaced body refuse safely and show current choices. Existing mode and prompt-revision gates remain authoritative. The physical attachment owner is still the sole cutter.

## Verification
Author and independent reviewer **6/6 focused pass**; final expanded suite **40/40 pass**. Cases exercise the ordinary field→Recovery→selection path, exact earlier-heavy release with a later light load retained, Back/Leave, stale card, life change, active-machine change, broken native restraint, same-ID replacement and leaving flight.

A separate probe applies a real native impulse to the loaded rig, then traverses the actual presentation adapter into the release choice. The cut preserves the original's exact pose and velocity; subsequent native steps keep it moving while the other load remains secured. The deck host is headless and the impulse is a controlled test input, not pilot-thrust or visual acceptance. The first fixture used the display name `catcher` as a part key; corrected to canonical `collector` before passing. No game rule changed for that fixture error.

The actual feature capture/restore owner cold-restores both originals and only the surviving restraint, without recapturing the selected released body. This is a fresh native owner save seam, not full browser/disk Continue.

Commands:
```
node --test test/rig-cargo-release-choice.test.mjs
node --test test/rig-cargo-release-choice.test.mjs test/pro-experiences-rigWorkshop.test.mjs
```
Logs `/tmp/rig-release-focused.log` and `/tmp/rig-release-final.log`. Existing broader suite includes native ordinary flight and job routes, but this increment does not claim a new full job haul, assembly route, controller ergonomics, rendered layout or collision-free flight.
