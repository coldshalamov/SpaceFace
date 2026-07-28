# PQ-023 `gold-corridor-required-cues` — Phase 0 event and perception audit

- **Leaf:** `PQ-023.gold-corridor-required-cues`
- **Branch:** `claude/pq023-corridor-cues-20260728` (base `b6b6422d`)
- **Date:** 2026-07-28
- **Scope:** the six cue families the Gold Corridor (PQ-025) requires. Propulsion, camera language,
  HUD telemetry hierarchy, localized environment and generic aesthetic work are explicitly out.

This audit is **measured, not inferred**. Every "exists" and every "gap" row below is backed by a
probe that was executed at `b6b6422d`. Where a probe contradicted the leaf brief's stated
expectation, the measurement wins and the row says so.

---

## 1. Baseline gates at `b6b6422d`

| Gate | Result |
|---|---|
| `npm run check:presentation` | **PASS** (exit 0) |
| `npm run check:combat` | **PASS** (exit 0) |
| `npm run check:visual-stability` | **PASS** (exit 0) |

Baseline logs: `.devshots/pq023-cues/baseline-*.txt` (untracked).

### 47a golden-scenario cue baseline

`node scripts/sf-sim.mjs trace 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --events presentation:cueSuppressed`

```
presentationCue = 15
presentationCueSuppressed = 0
```

**47a never suppresses a presentation cue today.** This is the load-bearing golden-safety fact for
this leaf: any change to suppression/arbitration is a provable no-op in the golden scenario, because
there is no suppression decision in it to change. It also means family (f)'s failure is *not*
reproducible in 47a and requires a dedicated dense scenario (see §4).

`metrics` is not part of the hashed snapshot (`scripts/sf-sim.mjs:553` — `sha256` is computed from
`snapshot` alone), and `presentationAdapters` performs no writes to hashed simulation state, so the
presentation path is sim-inert by construction.

---

## 2. Current owners and consumers

### Owner events (authoritative truth producers)

| Family | Owner event | Emitter |
|---|---|---|
| weapon fire / impact / damage | `combat:damage` via `routeDamage` | `src/combat/damage.js`, `src/combat/kernel.js` |
| destruction | `entity:killed` | combat kernel |
| World Site damage | `worldSite:failureReceipt` | `src/systems/asteroidSites.js:498` |
| World Site recovery | `worldSite:operationReceipt` | `src/systems/asteroidSites.js:452` |

All four exist and are unambiguous. **No family is blocked on a missing owner event.**

### Presentation consumers

| Module | Role |
|---|---|
| `src/presentation/cueSchema.js` | semantic event envelope + dedupe key + relevance inference |
| `src/presentation/cueRecipes.js` | declarative recipe registry: `importance`, `dedupeWindowTicks`, `material`, 5 lanes, `budgets`, `tags` |
| `src/systems/presentationOrchestrator.js` | owner-event → cue mapping, dedupe window, per-tick lane budget |
| `src/systems/presentationAdapters.js` | cue → camera / vfx / audio / ui / accessibility output |
| `src/render/vfxProfiles.js` | weapon family, impact profile, projectile trail profile tables (PQ-010) |
| `src/render/combat/phasedExplosions.js` | destruction phase schedules + deterministic pattern mixer |
| `src/render/vfxAccessibility.js` | flash/motion policy applied to additive flashes |
| `src/render/worldSitePresentation.js` | World Site fixture controller |

---

## 3. Per-family findings

### (a) Combat / weapon readability — **LARGELY EXISTS**

PQ-010 delivered mechanical distinctness. `vfxProfiles.js` carries 10 weapon presentation families,
8 impact profiles with distinct `mode` / `primaryShape` / `life` / `fragmentCount`, and 9 projectile
trail classes with distinct `mode`, guarded by `assertProjectileTrailProfileContracts()`.

**Gap:** `flak` resolves to `WEAPON_PRESENTATION.flak = { family: 'kinetic', variant: 'flak' }`, and
`resolveImpactPresentationProfile` keys the impact profile on **family**, not variant. Flak therefore
shares the autocannon's impact profile byte-for-byte and is a pure recolor at the moment of impact —
the one place the leaf brief names it as needing to be distinct. Same structural issue for the
`torpedo`/`siege-lance` variants, which are handled only by a scalar `scale` multiplier (1.5 / 1.8).

### (b) Impacts and destruction phases — **EXISTS**

`EXPLOSION_SCHEDULES` provides `small` / `ordinary` / `capital` with 5–8 ordered phases and a
deterministic, allocation-free pattern mixer (`explosionPattern01`) that deliberately does not
consume simulation RNG. No structural gap. Only the reduced-mode hook of (d) is missing.

### (c) Damage and recovery — **PARTIALLY EXISTS; brief's strong claim DISPROVED**

Ship damage states exist (`src/render/ships/shipDamage.js`, `kestrelDamage.js`).

For the Wreck Cathedral, the leaf brief's expectation was that damage/recovery had no visual state at
all. **The probe disproved this** (`.devshots/pq023-cues/audit-probe-cathedral.mjs`):

```
hull status  healthy/damaged/recovered : stabilized / failed / stabilized
stageId      healthy/damaged/recovered : stabilized / dark   / stabilized
fixtures healthy : color #72c9d4  (opacity .92/.50/.64)
fixtures damaged : color #6594a6  (opacity .92/.50/.64)
VERDICT stage    : stage regresses stabilized -> dark
```

A hull failure un-completes the stage-gating operation, the stage regresses, and all three fixtures
change colour. Recovery restores it. So a damage/recovery visual **does** exist. Three real gaps
remain, each measured:

1. **Colour-only.** Opacity, scale, visibility and geometry are byte-identical between healthy and
   damaged. The entire signal is a hue shift `#72c9d4 → #6594a6`. This fails the leaf's noncolor
   requirement (e) outright.
2. **Per-component status is ignored.** Holding the stage constant and setting *every* fixture's own
   component to `failed` produces byte-identical fixtures:
   ```
   VERDICT : FAIL-AS-CLAIMED: per-component status is IGNORED —
             fixtures byte-identical when every component failed
   ```
   Root cause is `worldSitePresentation.js:86-87`, which tests key *existence*:
   ```js
   fixture.mount.visible = !fixture.componentId || !statuses
     || Object.prototype.hasOwnProperty.call(statuses, fixture.componentId);
   ```
   `projectWorldSitePresentation` (`worldSiteKernel.js:979-980`) fills `componentStatuses` with an
   entry for **every** component, so the predicate is vacuous and always true. Damage is visible only
   when it happens to un-complete a stage-gating operation; any non-gating component failure is
   entirely silent.
3. **No cue exists.** `presentationOrchestrator` has **zero** `worldSite` subscriptions (grep count:
   0). `worldSite:failureReceipt` and `worldSite:operationReceipt` reach no presentation lane — no
   caption, no audio, no HUD, no reduced-mode variant, no priority.

### (d) Reduced-motion / reduced-flash — **PARTIALLY EXISTS**

`vfxAccessibility.js` provides four frozen policies (`full`, `reduced-motion`, `reduced-flash`,
`reduced-motion-and-flash`) and `applyFlashAccessibility`. `presentationAdapters._applyCamera`
dampens camera trauma to 0.25 under `motionReduce`. `worldSitePresentation.update` honours
`reducedMotion` / `reducedFlash`.

**Gap:** the policy is applied only to generic additive flashes and camera trauma. Impact families
and explosion phases declare no reduced variants, and the cue contract carries no
`reducedMotionMode` / `reducedFlashMode` field, so a cue cannot state what its reduced form *is* —
only how much to scale it down.

### (e) Noncolor / no-audio equivalents — **PARTIAL, WITH A CRITICAL HOLE**

`presentationAdapters._applyAccessibility` supplies caption text plus a non-colour `shape` token
(`cross`/`arc`/`ring`/`bracket`/`diamond`/`split`/`pulse`) and an `assertive` flag. This is a real
noncolor + no-audio channel.

**Gap:** it is driven by a hardcoded `CAPTIONS` table of **16 cue ids**, all tether/scenario/shield
weighted. Combat damage has **no caption at all** — `combat.damage.applied`, `combat.player.hit` and
`combat.near_miss` are absent, and `shapeForCue` falls through to the generic `'pulse'` for every
combat id. World Site damage/recovery has no cue and therefore no caption. `grep accessibilityText
src/` returns zero hits: the cue contract has no field for owner-supplied accessible text, so the
table cannot be extended from data.

### (f) Dense-scene prioritization — **DOES NOT EXIST; REPRODUCED**

Probe `.devshots/pq023-cues/audit-probe.mjs`, one tick, 8 flavor cues then one critical `tether.break`:

```
flavor emitted   : 3 / 8
critical emitted : false
suppressed       : mining.drill.contact(lane_budget:camera) x5,
                   tether.break(lane_budget:camera)
VERDICT          : FAIL-AS-CLAIMED: critical tether.break dropped by lane_budget
                   while 3 flavor cues survived
```

The mechanism is **sharper than the brief assumed**, and there are two compounding defects:

1. **`*.none` lane placeholders consume real budget.** `laneSet()` stamps `camera.none`,
   `audio.none`, `ui.none`, `accessibility.none` onto recipes that use no such channel, and
   `_suppressionReason` (`presentationOrchestrator.js:1235-1238`) charges budget for every declared
   lane without checking for the `.none` sentinel. The camera budget is 3, so **after 3 cues of any
   kind in one tick, every further cue is dropped** — even though the flavor cues declare
   `camera.none` and consume no camera. This is unambiguously a bug: the *adapter* already skips
   `.none` lanes (`_applyVfx` returns null on `vfx.none`, line 389); only the orchestrator's
   accounting disagrees.
2. **No priority reservation.** Suppression is strictly first-come-first-served within a tick. The
   critical `tether.break` (importance 0.92, tagged `critical`, and a member of
   `CRITICAL_SLICE_EVENT_IDS`) lost to three `mining.drill.contact` flavor cues (importance 0.46)
   purely on arrival order. The packet's requirement — "critical semantics survive channel
   reduction" — is not met.

---

## 4. Planned repair, and why it is golden-safe

| Family | Repair |
|---|---|
| (f) | Stop charging budget for `.none` lanes; split each lane cap into a **critical reserve + general pool** keeping `DEFAULT_LANE_BUDGETS_PER_TICK` totals identical. Critical cues draw reserve-first-then-general; flavor draws general only. |
| (c) | Bind per-component status to fixture state (non-colour: opacity/scale/visibility), and subscribe the orchestrator to `worldSite:failureReceipt` / `worldSite:operationReceipt`. |
| (e) | Add optional `accessibilityText` to the recipe contract, stamped onto the event by the orchestrator; extend captions for combat + world-site damage. |
| (d) | Add optional `reducedMotionMode` / `reducedFlashMode` to the recipe contract with per-family defaults. |
| (a) | Give `flak` its own impact profile so it is not a kinetic recolor. |
| (b) | Reduced-mode hook only; no rebuild. |

Reservation is chosen over sorting or deferral deliberately: `_emitCue` is a *streaming* API and
cannot sort cues that have not arrived yet, and buffering to tick-end would change emission ordering
into the adapters. Reservation is a no-op below saturation, so per-tick emission counts are unchanged
everywhere the lanes do not saturate — which, per §1, is everywhere in 47a.

The new contract fields are **optional with family defaults**. Making `validatePresentationRecipes`
require them would force edits to ~80 out-of-scope recipes, i.e. the whole PQ-023 umbrella rather
than this leaf.

## 5. Evidence strategy

Frame-sequence captures are the right evidence for (a), (b) and (c) — those claims are about what is
on screen. They are the **wrong** evidence for (f): a suppressed cue does not render, so a capture
shows the absence of a thing that cannot be pointed at. Family (f) is proved by a deterministic
suppression trace (cue id, tick, reason, before/after), not by a photograph.

## 6. Open rows (PQ-034 lease-blocked)

- Normal-route Browser/Electron evidence.
- Independent motion / normal-camera review.
- Matched target/floor performance capture.
- `milestone_accepted` upgrade — PQ-025's binding requires it; the integrator grants it after the
  headed set.
