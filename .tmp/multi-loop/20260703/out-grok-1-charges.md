I'll read the design docs and reference systems first, then implement the two new modules and the sanity check.
Creating the two modules and the sanity-check script.
Charges were sticking to the thrower at spawn; I'll add a minimum separation check before owner-stick is allowed.
Sanity check passed. Spawning the verifier subagent for `/check-work`.
Tracing the impulse charges deliverables and verifying the implementation against the session scope.
Checking reference patterns, damage API usage, and whether GROK-1 modified any disallowed files.
## PHASE A: TRACE REVIEW

### 1. Request checklist (GROK-1 WS-D2 brief)

| # | Deliverable | Required |
|---|-------------|----------|
| 1 | `src/data/impulseCharges.js` with `IMPULSE_CHARGES.charge_standard` + documented impulse derivation | Yes |
| 2 | `src/systems/impulseCharges.js` — registry system: throw/stick/detonate, cargo, damage, impulse, events | Yes |
| 3 | **INTEGRATION NOTE** (≤10 lines): registry line, commodity def, payload assumptions | Yes |
| 4 | `.tmp/multi-loop/20260703/grok-charge-sim-check.mjs` sanity script | Yes |
| 5 | Run script, pass, report output | Yes |
| 6 | **Hard constraint:** new files only (no edits to existing repo files except `.tmp` script) | Yes |

### 2. What happened in session

From `out-grok-1-charges.md` trace:
- Read design docs and reference systems
- Created `src/data/impulseCharges.js`, `src/systems/impulseCharges.js`, and the sim script
- Fixed owner-stick-at-spawn (0.35s lockout before self-stick)
- Ran sanity check → PASS
- **Did not print the required INTEGRATION NOTE**

### 3. Current state verification

**Sim script (re-run):**
```
player Δvx: -14.286 drone Δvx: 35.714
grok-charge-sim-check: PASS
```

**File constraint:** GROK-1 deliverables are untracked new files only:
- `src/data/impulseCharges.js` ✓
- `src/systems/impulseCharges.js` ✓
- `.tmp/multi-loop/20260703/grok-charge-sim-check.mjs` ✓

Other modified files (`input.js`, `main.js`, UI, etc.) are from parallel workstreams (AGY-1/CODEX), not GROK-1.

---

## PHASE B: CODE REVIEW

### `src/data/impulseCharges.js` — PASS

- Exports `IMPULSE_CHARGES.charge_standard` with all required fields
- Impulse derivation documented with real ship masses (Pelican 32, Drifter 48)
- `impulse: 800` = 25 × 32 for tier-1 mid reference ✓
- `armTimeS: 6` correctly documented as **throw cooldown**, not post-stick arm delay ✓

### `src/systems/impulseCharges.js` — PASS (implementation)

| Requirement | Status |
|-------------|--------|
| Registry pattern (`name`, `init(ctx)`, `update(dt, state)`) matching `mining.js` | ✓ |
| Input: `state.input.actions?.chargeThrow` / `?.chargeDetonate` edge bools | ✓ |
| Throw from nose along `aimWorld`, inherits player velocity | ✓ |
| Stick to ship/drone/asteroid within `stickRadius`, parent + local offset | ✓ |
| Instant arm on stick (`d.armed = true`) | ✓ |
| 6s throw cooldown via `throwCdT` / `armTimeS` | ✓ |
| Max 4 active, oldest despawned | ✓ |
| F-detonate all armed charges, radial impulse + linear falloff | ✓ |
| Friendly fire: impulse on all entities incl. player; damage via `ignoreFriendlyFire` flag | ✓ |
| Cargo: `removeCargo(state, 'cmdty_impulse_charge', 1)` | ✓ |
| Damage: `scalarHitToDamagePacket` + `_routeDamage` (combat kernel pattern) | ✓ |
| Events: `charge:stuck`, `charge:thrown`, `charge:detonated`, `presentation:vfxCue`, `audio:cue` | ✓ |
| Self-plate trick: 0.35s owner-stick lockout | ✓ |
| Deterministic: no `Math.random` | ✓ |
| No Three.js imports | ✓ |
| Δv on `vx`/`vz` only | ✓ |

### `.tmp/multi-loop/20260703/grok-charge-sim-check.mjs` — PASS

- Imports system, fakes minimal state (player + drone 30 wu apart)
- Throw → stick → detonate flow works
- Asserts cargo consumed, charge stuck, both entities receive opposing impulse, charge despawned

### Gaps / issues

1. **Missing INTEGRATION NOTE** — explicit deliverable #3; not printed in session output or `out-grok-1-charges.md`
2. **Session output incomplete** — sim results not formally reported in output doc (script passes when run)
3. **BUILD_PLAN acceptance** mentions "knocks a drone into an asteroid" — brief's self-check only tests player+drone; acceptable per brief scope, but doesn't satisfy extended BUILD_PLAN acceptance criterion
4. **Minor:** VFX payload references `combat.explosion.small` but `combat.js` doesn't emit `presentation:vfxCue` directly; shape matches `missions.js` / `presentationAdapters.js` pattern — adequate

### Constraint compliance

| Constraint | Result |
|------------|--------|
| New files only | **PASS** (GROK-1 files only) |
| No Three.js | **PASS** |
| Registry pattern | **PASS** |
| `removeCargo` | **PASS** |
| Damage API (`scalarHitToDamagePacket` + `routeDamage`) | **PASS** |
| Input contract (read-only, `?.` guards) | **PASS** |
| Deterministic | **PASS** |

---

## Summary

**Core implementation is correct and complete.** Both modules satisfy GDD §4.4 mechanics, follow existing system patterns, pass the sanity script, and respect the "new files only" hard constraint.

**However**, the session did **not** deliver the required **INTEGRATION NOTE** (registry wiring line, commodity definition, payload assumptions) — an explicit numbered deliverable in the brief.

VERDICT: FAILImpulse charges are implemented as two standalone modules. The sanity script passes.

## Files created

1. **`src/data/impulseCharges.js`** — `charge_standard` with `impulse: 800` derived from Pelican mass 32 (25 × 32 wu/s Δv at contact).
2. **`src/systems/impulseCharges.js`** — throw / stick / detonate loop with cargo consumption, radial impulse, damage routing, and bus events.
3. **`.tmp/multi-loop/20260703/grok-charge-sim-check.mjs`** — throwaway sim harness.

## Sanity check output

```
player Δvx: -14.286 drone Δvx: 35.714
grok-charge-sim-check: PASS
```

## Check-work

The verifier confirmed implementation correctness (registry pattern, cargo API, damage routing, determinism, no Three.js, new-files-only). It flagged the missing **INTEGRATION NOTE** in the prior response — included below.

---

## INTEGRATION NOTE

1. **Registry** — In `src/core/registry.js`: `import { impulseCharges } from '../systems/impulseCharges.js';`
2. **SYSTEMS** — Add `impulseCharges` after `countermeasures` in the init array.
3. **UPDATE_ORDER** — Add `impulseCharges` after `countermeasures`, before `physics`.
4. **Commodity** — Add to `src/data/commodities.js`: `{ id: 'cmdty_impulse_charge', name: 'Impulse Charge', category: 'military', basePrice: 180, volPerU: 2, massPerU: 2.0, volatility: 0.25, elasticity: 0.5, legality: 'restricted' }`
5. **Input** — Claude wires `actions.chargeThrow` (LMB-alt) and `actions.chargeDetonate` (F) in `input.js`.
6. **VFX** — `presentation:vfxCue` uses the `presentationAdapters.js` shape (`id`, `lane`, `particles`, `lights`, `magnitude`, `position`, `material`, `sourceId`); `combat.js` does not emit this event directly.
7. **Damage** — `scalarHitToDamagePacket` + `routeDamage` with `flags: { ignoreFriendlyFire: true, allowAnyTarget: true }`.
8. **Owner-stick** — 0.35s lockout after throw so nose-spawned charges don’t stick to the thrower immediately; rear-plate self-stick still works afterward.
9. **Events** — `charge:thrown`, `charge:stuck`, `charge:detonated {pos, hits:[ids]}`, plus `presentation:vfxCue` and `audio:cue`.
