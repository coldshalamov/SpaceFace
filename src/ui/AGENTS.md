# src/ui/ — Agent Notes

DOM/CSS overlay. Reads state and emits gameplay intents. Narrow direct-write exception:
UI/input-owned selection such as `state.player.targetId`. Root `AGENTS.md` §6 first.
Frontend direction: `design/frontend/direction/FIELD_HARDWARE_PROGRAM.md` (2026-09-10; frames under
`design/frontend/direction/approved/` outrank prose). Do not style screens by hand: every visual
element is assembled from the produced kit under `assets/ui/kit/` (packet P21). Why:
`design/FRONTEND_DIRECTION.md` §14.

## Standing rules

- **Clean NON-diegetic HUD.** No visor/cockpit/helmet framing, screen-edge arcs, or pilot portraits.
- Choose panel treatment per screen; measure compositor cost. No universal opaque-panel recipe.
- Match the surface to the decision (HUD, card, modal, full screen). Avoid duplicate simultaneous copy.
- Combat and economy feedback stay configurable and legible.
- Motion follows purpose and `motionReduce`/`flashReduce` in `accessibility.js`.
- Player-facing strings pass `check:player-facing-labels`.

## Non-obvious owners

- `uiRoot.js` / `screenManager.js` — mount and one-visible-screen switching.
- `commandDeckRefit.js` — additive presentation/interaction layer (PR #113). Does not own transactions.
- `hud.js` — always-mounted flight HUD. Attention pass: `design/HUD_FLIGHT_ATTENTION.md`.
- `input.js` here is UI input; `src/systems/input.js` owns the sim contract.
- `asteroid/` is live Asteroid Works (`drill` screen). `screens/drill.js` is a helper, not the shell.
  Campaign: `design/program/ASTEROID_WORKS_PLAYFIELD.md` / `PQ-130`.

DOM layering (ARCHITECTURE §1.2): canvas z0 < vignette z5 < hud+receipts z10–11 < modal-backdrop z90
< screens z100 < alerts z1100. `#ui-root` is `pointer-events:none`; interactive children opt in.

## Verification

`check:ui-a11y`, `check:wcag-contrast`, `check:ui:perf`, `check:player-facing-labels`,
`check:ui-identity`, `node scripts/check-ui-screen-imports.mjs`. Do not revive a windshield key list
to satisfy one-voice; Help/Settings owns the bind sheet.
