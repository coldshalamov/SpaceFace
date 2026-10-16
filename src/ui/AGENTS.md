# src/ui/ — Agent Notes

DOM/CSS overlay. Reads state and emits gameplay intents. Narrow direct-write exception:
UI/input-owned selection such as `state.player.targetId`. Root `AGENTS.md` §6 first.
**ORRERY (`design/frontend/ORRERY.md`, `src/ui/orrery/`) over Deckplate (`src/ui/deckplate/`) is the live design system.**
Every colour, size, duration, face, and instrument recipe on a player surface comes from `--dp-*`
tokens (`src/ui/deckplate/tokens.js` + `src/ui/orrery/tokens.js`), the ORRERY instrument library
(`src/ui/orrery/`), and the shared `.dp-*` / `.k-*` / `.orr-*` classes. Adding another token root is
a defect. The active direction is [`../../design/frontend/ORRERY.md`](../../design/frontend/ORRERY.md)
(handoff & lane status: [`../../design/frontend/ORRERY_HANDOFF.md`](../../design/frontend/ORRERY_HANDOFF.md)).
`THE_BAR.md`, `ONE_PHOTOGRAPH.md`, and `FIELD_HARDWARE_PROGRAM.md` are superseded as direction (only
their no-fake-CSS-material law and the `12px` type floor in `scripts/check-type-floor.mjs` still bind).

Screen composition and responsive placement live in `src/ui/orrery/*Layouts.js` (and `src/ui/deckplate/screens.js`
for legacy Deckplate placements). When narrow viewports squeeze a column, condense `Archivo`'s
variable width (`"wdth" 82–100`) and letter-spacing (`.04–.08em`) rather than dropping below the
`12px` type floor (`node scripts/check-type-floor.mjs`).

## Standing rules

- **Clean NON-diegetic HUD.** No visor/cockpit/helmet framing, screen-edge arcs, or pilot portraits.
- Panel treatment comes from the system (`dp-plate`, `dp-glass`, `dp-mfd`): pick the material that
  fits the job, never mix a new one. Measure compositor cost; no `backdrop-filter` in flight.
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
