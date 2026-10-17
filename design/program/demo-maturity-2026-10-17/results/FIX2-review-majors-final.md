Implemented all four fixes. Each new regression failed before its fix and now passes.

- Nursery substrate can be moved with ordinary Massline controls; gentle stages re-home the rays, while rushed towing scatters them.
- Destroying Foundry ballast closes its prompt before the player leaves.
- A whole-unit cargo refusal sounds once even with fractional space remaining, then rearms when enough capacity is freed.
- Partial restitution receipts truthfully name the units still owed.

The nursery now follows measured physical towing instead of relying on a test-only event. The other fixes move prompt retirement before early returns, remember the refused cargo footprint, and select debt-specific receipt wording.

Exact edited files and focused results:

| Source files | Regression suite | Result |
|---|---|---|
| `src/systems/alienEcology.js`, `src/world/veilRayNursery.js` | `test/m24-move-the-nursery.test.mjs` | 5 passed |
| `src/systems/machineWork.js` | `test/m29-two-correct-orders.test.mjs` | 6 passed |
| `src/audio/audioSystem.js` | `test/inf-inst-36-full-hold-chirp.test.mjs` | 4 passed |
| `src/systems/missions.js` | `test/m13-pay-back-the-wake.test.mjs` | 4 passed |

Verification is **not entirely green**:

- Expanded affected/adjacent run: **130/131 passed**. The untouched `test/alienEcology.test.mjs:89` assumes Cinder Nursery appears first; the catalog returns Veil-Ray Nursery first. Left unchanged per scope.
- Adjacent Massline suite: **21/21 passed**.
- Sim comparison passed with equal uninterrupted/reload hashes. No goldens changed.
- Adventure player-truth reached gameplay but **failed player-control and VFX-coverage checks** on SwiftShader. [Verdict](C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/fix2-player-truth/verdict.md) · [Contact sheet](C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/fix2-player-truth/contact-sheet.jpg)

Edits remain uncommitted, as required by the campaign constraints.