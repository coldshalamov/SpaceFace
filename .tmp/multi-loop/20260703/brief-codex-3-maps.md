# TASK: Information layer — key policy, charted-space discovery, scanner pulse (SpaceFace WS-B1+B2)

You are Codex in the SpaceFace repo. Read `design/GDD_2_0.md` §7 and `design/BUILD_PLAN_2_0.md` first.
Then read: `src/ui/bindings.js` (all), `src/ui/screens/starmap.js` (esp. `_isDiscovered` ~line 521),
`src/ui/screens/localmap.js`, `src/systems/world.js` (discovery state init), `src/data/sectors.js`,
`src/ui/screens/bar.js` (rumor/purchase plumbing), `ARCHITECTURE.md` event table.

## Build exactly this
1. **Key swap** in `src/ui/bindings.js`: `localmap` → key 'm' (label 'M'), `starmap` → key 'n' (label 'N').
   The bindings registry is the single source of truth — verify every prompt string updates by grepping for
   hardcoded "M" / "N" map references in src/ui and src/systems/onboarding.js prompt text; fix any you find
   (copy text only — do not restructure onboarding).
2. **UI rename**: starmap screen title becomes "NAV CHART" (player-facing strings only; module/file names unchanged).
3. **Charted-by-default discovery** in `src/systems/world.js` new-game init: every sector in
   `src/data/sectors.js` with security tier core or mid starts `{discovered: true}` in `state.world.discovery`.
   Frontier/anomaly/pirate-hidden sectors keep current behavior. Add a per-sector data flag
   `charted: true|false` in sectors.js (set it explicitly on every sector — core/mid true, frontier false)
   and drive init from the flag, NOT from security tier inference.
4. **Survey data purchase**: at bars in frontier-adjacent stations, a purchasable "Survey Data: <sector>"
   item (price scale with sector tier, use bar rumor purchase plumbing) that sets that sector discovered.
   Emit `map:sectorCharted {sectorId, source:'survey'}`.
5. **Scanner pulse** — new file `src/systems/scanner.js`, registry system:
   - Consumes LOCKED input contract `state.input.actions.scanPulse` (edge bool; guard with `?.`,
     test via sim harness; do NOT edit `src/systems/input.js`).
   - 8 s cooldown. On pulse: emit `scan:pulse {pos}`; mark asteroids within 1200 wu with
     `data.scanHighlightUntil = simTime + 20`; wrecks/cargo/anomalies within 1200 wu get
     `data.pingedUntil = simTime + 45`; hidden POIs (anomaly sites in sector def) within 2000 wu become
     "?" markers: push to `state.world.scanPings[sectorId]` (array of {id, pos, kind:'unknown'}).
   - Emit `scan:completed {sectorId, found:{asteroids:n, wrecks:n, anomalies:n}}` — the recon_scan mission
     objective in `src/systems/missions.js` already listens for `scan:completed`; confirm the payload shape
     it expects and match it exactly.
6. **Local map consumes it**: `localmap.js` renders scanPings as "?" markers and scan-highlighted asteroids
   with an ore-class glyph. Keep the existing render style; add, don't redesign.

## Constraints
- Do NOT touch: `src/systems/input.js`, `src/ui/hud.js`, `src/ui/uiRoot.js`, `styles/ui.css`,
  `src/render/**`, `src/systems/onboarding.js` beyond prompt-string copy fixes.
- Determinism: no RNG needed here; simTime comparisons only.
- Save compatibility: `state.world.scanPings` must serialize — follow how `state.world.discovery` is
  included in `src/save/saveSystem.js` scope and add scanPings alongside (this is the ONE save file edit allowed).

## Verify before you finish
```
npm run check:controls-discoverability && npm run check:starmap-objective && npm run check:localmap-routes && npm run check:mission-navigation && npm run check:sim && node scripts/check-data.mjs
```
Write the files. Print a 10-line summary max. Do not paste file contents.
