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

## Seeing the UI before changing it

Two instruments, and the split between them is the rule:

| You want | Use | Cost |
|---|---|---|
| Look at a 2D screen, click every control, judge composition/type/spacing, iterate | `node scripts/ui-bench.mjs` → open `tools/ui-bench.html?screen=pause` (add `&bg=.devshots/ui-stills/flight.png`, `&chrome=0` for a clean frame), or `--shot=pause` for a PNG | seconds |
| Ask what a control DOES on the live route, or a screen the bench cannot mount | `node scripts/ui-look.mjs --only=<id>` | one boot |
| Judge a screen over the live world (HUD, chart, anything the world lights) | `npm run ui:stills -- --world --headed --only=<ids>` | ~1 min |

The bench mounts the **real** screen module with a real `GameState` and the real kit stylesheets over
a frozen still, and logs what each control asked for. It is a look instrument, never acceptance:
its state is synthetic, so a bench still proves composition, type, spacing, hover/focus and "does
this verb do anything", while the live route stays the evidence for behaviour. `ui-look` is the live
register — it clicks every control and prints what each one did (opened `<screen>`, raised a
confirm, repainted, or nothing at all). **A screen whose verb does nothing is a defect, not a style
question**, and it is the first thing to check.

Never restyle a screen without a still of it in hand; never claim a fix without the after-still. The
look-fix-look loop, the four judgment tests and the end-of-pass review step are
[`../../docs/UI_VISUAL_ITERATION.md`](../../docs/UI_VISUAL_ITERATION.md).

The full matrix is `npm run capture:ui-matrix`, and layout measurement is
`npm run check:ui:layout` (add `--pixels` to measure type against what is actually drawn behind it).

## Verification

`check:ui-a11y`, `check:wcag-contrast`, `check:ui:perf`, `check:player-facing-labels`,
`check:ui-identity`, `node scripts/check-ui-screen-imports.mjs`. Do not revive a windshield key list
to satisfy one-voice; Help/Settings owns the bind sheet.
