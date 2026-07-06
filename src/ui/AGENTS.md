# src/ui/ — Agent Notes

> The DOM/CSS overlay UI. Reads state for display, **emits intents only** — never mutates sim state.
> Read root `AGENTS.md` §HUD design rule + Wired Feature Policy first.

## Standing rules

- **Clean NON-diegetic HUD.** No first-person/visor/cockpit motifs — no screen-edge arcs, no helmet avatars, no pilot portraits. Standing user preference, non-negotiable across all spec suites.
- **No `backdrop-filter`** in CSS (prior perf pass). Use opaque `rgba(5,9,18,.88)` panels.
- **No new modal screens for things a HUD chip can say.** No text walls (>1 simultaneous text surface — arbiter/one-voice violation).
- **Damage numbers off by default** (toggle exists). Floating text is for money/loot/level-ups only.
- UI transitions 120-250ms ease-out. Screen pushes ≤250ms.
- Player-facing strings pass `check:player-facing-labels`. Comms barks ≤12 words, no exclamation marks outside genuine emergencies, station names/callsigns in CAPS.
- Respect `motionReduce`/`flashReduce` (`accessibility.js`): all shake/hit-stop/FOV effects ×0.25 or off.

## File quick reference

- `uiRoot.js` (64KB) — mounts `#ui-root`, screen lifecycle.
- `screenManager.js` — modal screen caching/switching (one visible).
- `hud.js` (90KB) — always-mounted flight HUD. **Has a good header — read it.** Layout, update split, the works.
- `radar.js` (33KB) — radar glyph/IFF pass.
- `targetPanel.js` — segmented bars + in-world target arcs.
- `comms.js` (30KB) — comms barks (one-voice arbiter).
- `alerts.js` / `toasts.js` / `floatingText.js` / `damageIndicators.js` — alert queue, toasts, floaters, damage numbers.
- `accessibility.js` — `motionReduce`/`flashReduce`.
- `input.js` / `bindings.js` / `controlPrompts.js` — UI input, key bindings, prompts. **`input.js` here is UI input; the LOCKED sim input contract is `src/systems/input.js` (lead-only).**
- `screens/*` — modal screens: `stationHub.js` (114KB!), `market.js`, `shipyard.js`, `outfitting.js`, `starmap.js`, `localmap.js`, `techTree.js`, `bar.js`, `missionLog.js`, `automationPanel.js`, etc.

## DOM layering (ARCHITECTURE §1.2)

```
canvas (z0) < vignette (z5) < hud (z10) < modal-backdrop (z90) < screens (z100) < toasts (z1000) < alerts (z1100)
```
`#ui-root` is `pointer-events:none`; interactive children opt back in with `pointer-events:auto`.

## Verification

`npm run check:ui-a11y`, `npm run check:wcag-contrast`, `npm run check:ui:perf` (frame sleep + radar perf + identity), `npm run check:player-facing-labels`, `npm run check:ui-identity`, `node scripts/check-ui-screen-imports.mjs`.

Known-red (per `design/CURRENT_BUILD_STATUS.md`): `check-ui-screen-imports` has failures in the dirty tree — fix or rebaseline before broad release claims.
