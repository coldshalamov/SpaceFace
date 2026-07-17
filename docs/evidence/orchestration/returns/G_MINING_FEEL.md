# G — Mining feel juice (W4 / Fable §7)

**Date:** 2026-07-17 · **Owner:** Grok · **Spine:** `SpaceFace-depth-actualization` @ `grok/depth-player-route-actualization`  
**Scope:** Presentation-only first-five-minute mining readability. **No commit.**

## Verdict

**Polish yes, rewrite no.** Mining sim/VFX/audio already ship; the thin gap was *readable state callouts* on latch/seam and a first-drill wall of copy. Closed with shared teach vocabulary + flight HUD floaters + one short one-voice drill line.

## Fences honored

| Fence | Status |
|---|---|
| No `mining.js` / `drill.js` rewrite | Yes — not modified |
| No new GLB / thruster / material remaster | Yes |
| No `src/systems/input.js` thrash | Yes |
| No ore/economy retune | Yes |
| Existing mining authority / presentation cues | Unchanged cue IDs; choreography validation still green |

## What was thin (Fable: solid sim/VFX, thin teach)

| Surface | Before | After |
|---|---|---|
| Latch | `mining:start` → audio/VFX only (`mining.extraction.locked`) | Floating **CUTTER LOCK** (+ optional **MASS n%** from oreHP) |
| Seam bite | audio/presentation cue only | Floating **SEAM** while player holds mine group |
| Yield tick | already `+qty name` floater | Unchanged |
| First drill | multi-sentence wall via `_showHint('firstDrill', …)` | One line ≤12 words through same one-voice `_showHint` (once, then silence) |

## Diff summary

| File | Change |
|---|---|
| `src/presentation/miningChoreography.js` | Teach helpers: `miningLatchStateCallout`, `miningMassProgressLabel`, `firstDrillTeachLine`, word budget; validate includes thin-teach pins |
| `src/ui/floatingText.js` | `mining:start` + `mining:seamHit` floaters; styles `sf-ft--mining-lock` / `sf-ft--mining-seam` |
| `src/systems/onboarding.js` | firstDrill uses `firstDrillTeachLine(BINDINGS.drill.label)` |
| `scripts/check-onboarding.mjs` | Pins thin drill teach + floater wiring |
| `scripts/check-professional-mining-presentation.mjs` | Pins teach vocabulary + presentation-side only |

## Gates

```
npm run check:onboarding                         → GREEN (node scripts/check-onboarding.mjs)
node scripts/check-professional-mining-presentation.mjs → GREEN (ok:true)
```

- firstDrill line: `Drill active — cut ore veins, avoid gas. B exits.` (10 words)
- latch sample: `CUTTER LOCK · MASS 72%`
- `validateMiningChoreography().ok === true`
- `check:drill-smooth` not claimed fixed (pre-existing red per Fable; not exercised this slice)

## Failure class

N/A — no red product/harness failure; pure presentation polish.

## Residual

- No player-route capture/screenshots in this slice (no Electron/browser run).
- Seam floater gates on `state.input.fireGroup === 2` so drone/NPC seams stay silent.
- `check:professional-mining-presentation` is not yet a `package.json` npm alias (run via `node scripts/...` as above).
- Intentionally did **not** touch HUD hierarchy / `hud.js` (concurrent nav-HUD work on spine).

## Charter return block

```
LIVE AUDIT: mining feel presentation; COMMON_BUGS mining note is golden-stale only (no code path fix).
DIFF SUMMARY: miningChoreography teach helpers; floatingText latch/seam; onboarding firstDrill thin line; check-onboarding + professional-mining-presentation extended.
GATES: check-onboarding GREEN; check-professional-mining-presentation GREEN.
FAILURE CLASS: N/A.
PLAN DRIFT: none — W4 mining feel only; no mining rewrite / assets / input.
RESIDUAL: no visual capture; drill-smooth pre-existing red untouched.
```
