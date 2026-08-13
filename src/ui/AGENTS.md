# src/ui/ — Agent Notes

> The DOM/CSS overlay UI. It reads state and emits gameplay intents. Explicit UI/input-owned
> selection state such as `state.player.targetId` is the narrow direct-write exception.
> Read root `AGENTS.md` §6 (hard engineering contracts) first.

## Standing rules

- **Clean NON-diegetic HUD.** No first-person/visor/cockpit motifs — no screen-edge arcs, no helmet avatars, no pilot portraits. Standing user preference, non-negotiable across all spec suites.
- Choose panels, blur, transparency, and surface treatment per screen; measure compositor cost and
  optimize the owning hot path without imposing a universal opaque-panel recipe.
- Match the interaction surface to the decision. Use persistent HUD, contextual cards, modal flows,
  or full screens where each produces the clearest player result; avoid duplicate simultaneous copy.
- Combat and economy feedback must remain configurable and legible. Existing defaults are baselines,
  not a ban on a better tested presentation.
- Motion timing and easing follow interaction purpose and reduced-motion settings; inherited
  millisecond ranges are reference values, not universal gates.
- Player-facing strings pass `check:player-facing-labels`. Voice and typography are judged for
  clarity, urgency, and character in context, not fixed word counts, capitalization, or punctuation.
- Respect `motionReduce`/`flashReduce` through `accessibility.js` and current checks. Reduction must
  materially reduce motion/flash; exact treatment is surface-specific.

## File quick reference

- `uiRoot.js` — mounts `#ui-root`, screen lifecycle.
- `screenManager.js` — modal screen caching/switching (one visible).
- `hud.js` — always-mounted flight HUD; its header documents layout/update ownership.
  Activated flight-HUD pass: `design/HUD_FLIGHT_ATTENTION.md`.
- `radar.js` — radar glyph/IFF pass.
- `targetPanel.js` — segmented bars + in-world target arcs.
- `comms.js` — comms barks (one-voice arbiter).
- `alerts.js` / `toasts.js` / `floatingText.js` / `damageIndicators.js` — alert queue, toasts, floaters, damage numbers.
- `accessibility.js` — `motionReduce`/`flashReduce`.
- `input.js` / `bindings.js` / `controlPrompts.js` — UI input, key bindings, prompts. `input.js` here
  is UI input; `src/systems/input.js` owns the sim input contract and requires task ownership,
  coordination, and focused rebind/input/sim validation.
- `screens/*` — modal screens including station, market, shipyard, outfitting, maps, tech tree,
  bar, mission log, and automation.

## DOM layering (ARCHITECTURE §1.2)

```
canvas (z0) < vignette (z5) < hud+receipts (z10–11) < modal-backdrop (z90) < screens (z100) < alerts (z1100)
```
`#ui-root` is `pointer-events:none`; interactive children opt back in with `pointer-events:auto`.
Receipts live in the HUD layer (`#toasts` reparented into `#hud`). Help/Settings own the bind sheet.

## Verification

`npm run check:ui-a11y`, `npm run check:wcag-contrast`, `npm run check:ui:perf` (frame sleep + radar perf + identity), `npm run check:player-facing-labels`, `npm run check:ui-identity`, `node scripts/check-ui-screen-imports.mjs`.

`check-ui-screen-imports` validates the current screen registry plus binding, reachability, and
one-voice contracts; do not hard-code its assertion count here. The active-objective panel
intentionally omits generic map-key copy. After `design/HUD_FLIGHT_ATTENTION.md`, first-use hints
are world-attached and the bind sheet lives in Help/Settings — do not revive a windshield key list
to satisfy one-voice.
