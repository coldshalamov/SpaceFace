# G — Claim path: public UI uses `resolvePlayerChoice`

**Date:** 2026-07-17  
**Branch:** `grok/depth-player-route-actualization`  
**Commit:** not committed (working tree only)  

## Goal

Player-facing claim must go through the same public API Tier-A harnesses use
(`uniqueWrecks.resolvePlayerChoice`), not only `bus.emit('uniqueWreck:choose')`.

## Changes

| Site | Behavior |
|---|---|
| `src/ui/recoveryEncounterPrompt.js` `choose()` (unique-wreck mode) | `registry.get('uniqueWrecks').resolvePlayerChoice(wreckId, choiceId, source)` when available; else `bus.emit('uniqueWreck:choose', …)` |
| `src/systems/missions.js` long-read fence (`long_read_fence` + `wreckChoiceId`) | same prefer/fallback pattern via `this.registry` |

`uniqueWrecks` still listens to `uniqueWreck:choose` → `_onChoose` for harnesses and partial boots.
`resolvePlayerChoice` is the same body (`_onChoose`).

## Proof

| Check | Result |
|---|---|
| `node --test test/depth-program-unique-wreck-choice.test.mjs test/recovery-encounter.test.mjs test/depth-program-r2-rumor-surfaces.test.mjs` | **17/17 pass** |
| Ad-hoc prompt smoke (registry present) | `resolvePlayerChoice` called; **no** bus emit |
| Ad-hoc prompt smoke (registry null) | fallback `uniqueWreck:choose` emit |

## Residual

- Capture/harness scripts under `scripts/` may still bus-emit for supporting evidence (F1-classified); primary matrix already uses public API.
- SP1 setpiece tests intentionally pass `registry.get: () => null` and exercise the bus fallback.
