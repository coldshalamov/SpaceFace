# src/ui/ — Agent Notes

DOM/CSS overlay. Reads state and emits gameplay intents. Narrow direct-write exception:
UI/input-owned selection such as `state.player.targetId`. Root `AGENTS.md` §6 first.
**Deckplate (`src/ui/deckplate/`) is the design system.** Every colour, size, radius, duration, face
and panel recipe on a player surface comes from `--dp-*` and the `.dp-*` classes; a screen assembles
them and never restyles them. Adding a token root is the defect — this tree grew four of them
(`--k-` 926 declarations, `--sf-` 501, `--fh-` 420, `--dp-` 112) because each programme wrote system
number five instead of finishing system number four. The standard is
[`../../design/frontend/THE_BAR.md`](../../design/frontend/THE_BAR.md); progress and order are
[`../../design/frontend/UNIFICATION_LEDGER.md`](../../design/frontend/UNIFICATION_LEDGER.md).

A screen owning a stylesheet is a defect. Screen-specific CSS is *placement* and belongs in
`deckplate/screens.js`; material never does. The produced renders under `assets/ui/kit/` remain the
texture budget — retire the `--fh-` tokens, not the assets. Historical direction, for context only:
`design/frontend/direction/FIELD_HARDWARE_PROGRAM.md`.

## Standing rules

- **Clean NON-diegetic HUD.** No visor/cockpit/helmet framing, screen-edge arcs, or pilot portraits.
- Choose panel treatment per screen; measure compositor cost. No universal opaque-panel recipe.
- Match the surface to the decision (HUD, card, modal, full screen). Avoid duplicate simultaneous copy.
- **Flight transient routing (HUD_FLIGHT_ATTENTION):** a timed decision with verbs → the prompt
  deck; a fact/result → a receipt line (`toasts.js` / `admitReceipt`); continuous state → a HUD
  instrument; an alarm → `alerts.js`; a moment → its own presenter. Never a new hand-styled card.
- Combat and economy feedback stay configurable and legible.
- Motion follows purpose and `motionReduce`/`flashReduce` in `accessibility.js`.
- Player-facing strings pass `check:player-facing-labels`.

## Non-obvious owners

- `uiRoot.js` / `screenManager.js` — mount and one-visible-screen switching.
- `promptDeck.js` — the ONE flight decision surface (ladder, z 20, Digit1-9, gamepad, lifecycle).
  The encounter / lawful-inspection / parley / signal / recovery / customs modules are thin
  adapters that normalize their bus events into `offerDecision` specs; they own no DOM, no keys,
  no placement. Receipts never go on the deck. Styling: `styles/prompt-deck.css` on the glass
  tokens (no backdrop-filter — flight floor §7).
- `commandDeckRefit.js` — additive presentation/interaction layer (PR #113). Does not own transactions.
- `hud.js` — always-mounted flight HUD. Attention pass: `design/HUD_FLIGHT_ATTENTION.md`.
- `input.js` here is UI input; `src/systems/input.js` owns the sim contract.
- `asteroid/` is live Asteroid Works (`drill` screen). `screens/drill.js` is a helper, not the shell.
  Campaign: `design/program/ASTEROID_WORKS_PLAYFIELD.md` / `PQ-130`.

DOM layering (ARCHITECTURE §1.2): canvas z0 < vignette z5 < hud+receipts z10–11 < prompt-deck z20
< modal-backdrop z90 < screens z100 < alerts z1100. `#ui-root` is `pointer-events:none`;
interactive children opt in.

## Seeing the UI before changing it

The iteration system is [`../../docs/UI_VISUAL_ITERATION.md`](../../docs/UI_VISUAL_ITERATION.md). You are the reviewer: open the PNG in the same pass, and walk every control on the screens you changed.

```
node scripts/ui-bench.mjs --shot=pause
node scripts/ui-bench.mjs --shot=station-market --walk
node scripts/ui-bench.mjs --list
```

The bench mounts the real screen module with a real `GameState` over a frozen still. It does not boot the game. Synthetic state is evidence of composition, type, spacing, hover, and what a control asks for. Behaviour on the live route, for a screen the bench cannot mount, is `node scripts/ui-look.mjs --only=<id>`.

A control that does nothing visible is a defect. Layout measurement for a check is `npm run check:ui:layout`.

## Verification

`check:ui-a11y`, `check:wcag-contrast`, `check:ui:perf`, `check:player-facing-labels`,
`check:ui-identity`, `node scripts/check-ui-screen-imports.mjs`. Do not revive a windshield key list
to satisfy one-voice; Help/Settings owns the bind sheet.
