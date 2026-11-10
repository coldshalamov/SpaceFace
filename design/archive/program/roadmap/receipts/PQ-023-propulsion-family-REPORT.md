# PQ-023 leaf — VP-220 propulsion family port

```yaml
packet: PQ-023
leaf: PQ-023.propulsion-vp220-port
scope: umbrella leaf 2 (Propulsion — idle/cruise/boost/RCS/socket families and heat/load response)
baseCommit: aca82bb0
sourceCommit: 74775bf8523fd28d46c06262ad2ddc39fcdc1c4d
candidateCommit: 2feedc581df623955ac57ff4a1d996822c07fc7d
integrationCommit: cdcbac32
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
review:
  discovery: independent candidate review + supervisor gate + controller diff review
  causalRereview: APPROVE
```

## What this leaf claims

Master's single-ship `ContinuousPlumeSystem` is generalized into a bounded **per-engine-family fleet**,
so NPC ships get real production propulsion presentation instead of the old-look trails. RCS impulse
and throttle response are extended to match, with segmented plume geometry and per-instance shader
dynamics.

**Not claimed:** headed Browser/Electron visual acceptance, or a matched performance capture. The
source branch's own harness demands that evidence and it does not exist. Visual acceptance is open.

## Provenance

Ported from `codex/vp220-propulsion-graphics` — a **single squashed commit** `74775bf8` on a branch
that is 1 ahead / **73 behind** master (a stale 2026-07-23 checkpoint). Cherry-picked, not merged.

Relationship to master: **EXTENDS, not forks.** `familyFleet.js:47` imports and constructs
`ContinuousPlumeSystem`; the export surface is identical on both refs.

### The two hard conflicts — both resolved MASTER-SIDE

Master's `8d55015d feat(thrusters): improve production plume coherence` (two days *after* the branch)
touched five of the same files. The branch's change is a mechanical uniform → per-instance-attribute
refactor; master's is numeric visual tuning. They collide line-for-line.

Resolving branch-side would have silently reverted master's entire coherence overhaul. Both conflicts
were taken master-side and the refactor re-applied on top as local bridges
(`float dynFlow = vFlowSpeed;` …), so uniforms correctly keep their `u*` names.

Verified by fixed-string test: **all 16** of master's `8d55015d` constants survive verbatim —
the quintic fade, `warp.x * 0.55`, `warpA * 0.34 + warpB * 0.14`, `mix(0.30, 1.0, roleSpread)`,
`axialPower = mix(0.42, 0.72, roleSpread)`, both dissipation smoothsteps, the dual-tap seam removal,
and the anisotropic `n1 = valueNoise(flowUv * vec2(1.45`. The retuned coefficient stands at
`vAlong * (2.9 + uNoiseScale * 0.85 + dynBoost * 2.4) + warp.x * 0.55`.

Both clean auto-merges were verified semantically rather than trusted: `continuousPlume.js` retains
`_socketPhase` **and its consumption site** (`slot.phase = this._socketPhase[s]`), and
`kestrelRecipes.js` retains all nine of master's retunes (`baseLength: 13.0`, `dissipation.at1: 1.45`,
lengthScale 0.44/1.06/1.34/1.70, widthScale 0.52, opacity 0.28, length.at0 0.34) alongside the
branch's `preferRoles` change.

`grep "VFX_ENERGY_PLUME_HZ\|_cadenceEnergyPlume" src/render/vfx.js` is **empty** — master's removal of
the cadence gate survived the stale branch copy.

## Controller decisions

### The idle-sleep perf invariant was ENFORCED, and it cost the branch's idle glow

The branch relaxed `scripts/check-vfx-frame-sleep.mjs`, flipping
`assert.equal(frame.energy, 0, …)` to `1` **and** replacing the `optionalSubsystemSum(frame) === 0`
assertion with a hand-rolled sum that excludes energy. That script is CI-wired through
`check:vfx-sleep` → `check:ui:perf`.

**Relaxing a performance invariant to make a port pass was refused.** The port instead makes the fleet
genuinely sleep: the wake signal is *thrust*, not admission —
`energy.plumeDrive = (diag.shipsActive - diag.idleShips) > 0 ? 1 : 0` — so a parked nearby ship cannot
pin the energy subsystem awake. `check-vfx-frame-sleep.mjs` is now **byte-identical to master** and the
gate exits 0.

**The accepted trade:** this removes the branch's always-on idle nozzle signature. Production plumes
appear on thrust/wake, exactly as master behaves today. This is **not a regression** — master has no
idle nozzle glow — it is a decision not to add an always-on effect that costs per-frame work at idle.
An idle glow can return later via a design that does not run the energy subsystem every idle frame.

### ART DIRECTION CHANGE — low-tier compact silhouette

`kestrelRecipes.js` changes `accessibility.lowQuality.preferRoles` and `quality.low.layers` from
`['core','sheath']` to `['core','inner']`, with `check-rcs-jet-wiring.mjs` matched. No authored layer
is removed from the recipe; only which layer survives at low tier changes. Accepted as a low-tier
readability improvement. **Flagged for the user** — it is art direction, not a test tweak.

### CI reachability closed by the integrator

The ported tests were invocable but unreachable: `check:thruster:propulsion-family` was a leaf nothing
called, so the four new suites would never have run. The worker could not fix this (its packet forbade
`.github/**` and the aggregates). The integrator appended it to `check:presentation`, which is already
reached by `check` and already runs `check-sg08-render-vfx.mjs` — the script this port modified.

## Gates — run by the controller on master at the integration revision

| Gate | Result |
|---|---|
| Full thruster/vfx/rcs/propulsion/vp220 suite (14 files) | **137 pass / 0 fail** |
| `npm run check:presentation` (now including the vp220 leaf) | **exit 0** |
| `npm run check:sim:compare` | **`deterministic: true`, `hashEqual: true`** |
| `npm run check:visual-stability` | **exit 0**, `pageErrors: []` |
| `check-vfx-frame-sleep` / `check-rcs-jet-wiring` / `check-thruster-vfx-pack` / `check-vfx-trail-bind` / `check-sg08-render-vfx` | all exit 0 |

Master baseline before the port was 72/0 across ten files; it is now 137/0 across fourteen.

## No master test weakened

Three assertions were removed from `test/kestrel-production-thruster-bind.test.mjs`; all three are
legitimate. `/uBoostBlend \* 2\.4/` → `/dynBoost \* 2\.4/` is the mechanical rename. The
`new ContinuousPlumeSystem(` and `new RcsImpulseSystem(` assertions were **relocated** to
`fleetSource`, tracking the real ownership move into `familyFleet.js`, while `vfxSource` now
additionally asserts `new FamilyProductionFleet(` — net stronger. Master's `VFX_ENERGY_PLUME_HZ` /
`_cadenceEnergyPlume` `doesNotMatch` guards survive.

Two **branch-authored** artifacts were rewritten to match the activity-gated design (the P1 idle test
and `check-thruster-vfx-pack.mjs` cycle 14). Neither is a master test. All ten of master's original
vfx-pack cycles survive by id and name.

## Scope

23 paths plus one `package.json` line. No write to `assets/**`, `src/data/**`, `src/systems/**`,
`src/ui/**`, `styles/**`, or `.github/**` — the live Blender lane was never at risk.
`FLEET_MAX_SHIPS = 10` and `FLEET_SOCKETS_PER_SHIP = 2` unchanged. Zero `Math.random` in every new
thruster module; `vfx.js` cosmetic randomness is unchanged from master.

## Residuals

- **No headed Browser/Electron visual evidence and no matched performance capture.** The branch's own
  fail-closed harness (`scripts/lib/vp220-propulsion-acceptance.mjs`) requires ordered browser +
  electron temporal matrices and refuses prepare-only reports. That evidence does not exist.
  `check:visual-stability` (exit 0, no page errors) is a render smoke test, not visual acceptance.
- `scripts/check-thruster-vfx-pack.mjs` cycle 4 regex broadened to
  `/setShipDrive|opts\.boost = driveInfo\.boost/`. Master's literal still exists at `vfx.js:5423`, so
  the alternation is redundant today, but it is a looser gate going forward. Follow-up.
- `vfxProfiles.js:241` `resolveEngineProfile` now returns the frozen shared base rather than a fresh
  `{...base, id}`. Safe today (the sole caller passes `factionThruster`), but a future caller mutating
  the result would silently no-op. Follow-up.
- `$.acceptanceCriteria.authoritativeHash` shows an expected/actual mismatch in `check:sim:compare`
  output. Distinct from the sim hash; not attributable to this render-only port, but unconfirmed as
  pre-existing.

## Follow-ups (deliberately excluded)

1. Produce the Browser/Electron visual evidence the vp220 harness demands, then promote acceptance.
2. Decide whether an idle nozzle glow is wanted, and if so design one that does not wake the energy
   subsystem every idle frame.
3. Tighten the cycle-4 regex; restore a fresh object from `resolveEngineProfile`.
4. PQ-023 remains an **umbrella**. This closes leaf 2 only; six cue families remain.
