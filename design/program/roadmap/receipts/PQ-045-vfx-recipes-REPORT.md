<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-045
leafId: PQ-045.vfx-recipes
lifecycle: integrated
acceptance: focused_green
disposition: PASS
candidateCommit: self — the change, this receipt, and the queue row land in one commit (see git log)
-->
# PQ-045.vfx-recipes — five VFX NEXT recipes ported onto the live effect system

## What changed

All work is in `src/render/vfx.js` (the unit's only editable production file; +241/−12). Five
finished `src/vfxnext/` family recipes were ported as **structure onto the live pools** — the GPU
particle cloud, the instanced sprite buckets, the oriented trail-streak pool, and the existing
`_flashLight()` event-light pool. No vfxnext code ships (no import, no LightPool, no scheduler), and
`EVENT_LIGHT_POOL_SIZE = 6` is unchanged, so the `precompile.js` shader cache key is untouched. No
new shaders or geometry were written, so the three recorded invisible-effect traps (reversed
smoothstep, planar RingGeometry UVs, cross×cameraPosition NaN billboarding) cannot apply.

1. **impact_concussion** — signed branch: the concussion family's `concussive-slam` impact mode was
   declared in `vfxProfiles.js` since SF-10 but had no renderer branch and silently fell through to
   the autocannon default. `_onProjectileHit` now renders it: a compressed flash that *collapses*
   (`size0 > size1`) while the oriented shock front expands beneath it, a genuinely slower/dimmer
   trailing wash pair (two front speeds read as "a shock"), an impulse-band debris kick and wide
   spall cone thrown back along the approach, short trails on the largest fragments only, and slow
   surface dust. Axis-only branch: `_onCollisionConsequence` gains the collapsing core flash plus a
   slower second bar pair, bilateral and full-motion only, so the reduced-flash profile keeps its
   accepted two-bar structure and single-scaled accessibility transform.
2. **destruction_light** — `_emitDestructionLightBeats(entry, scale, reduced)` runs at ignition in
   both the generic and causal explosion emitters for non-capital kills: an engine flare-out jet
   that leaves through the stern along the hull's inherited velocity (10 deterministic sparks plus a
   collapsing blue-white flash), and 4 long-lived cinders that keep a firefight visible a second
   later. Deterministic off the entry serial (`explosionPattern01/Signed`, channels 26–31 — never
   `Math.random` in the explosion emitter), frozen palette records instead of shared color scratch,
   capital beat sheet untouched.
3. **massline_latch** — `_onTetherLatch` keeps the simultaneous both-end flash+light pair (the
   "connection was made" read) and adds the recipe's oriented structure: a contact streak at the
   anchor showing which way the line leaves it, one bright pulse streak that genuinely travels the
   chord ship→anchor in its 0.22 s life and dies at the anchor, and a spark disc thrown in the
   plane of contact (both perpendicular halves around the line axis) instead of an isotropic ball.
4. **massline_tension** — `_updateTetherCable`: the overload spark shed is now rate-accumulated
   (the chance-per-frame version it replaces spawned ~2× as much at 120 Hz as at 60 Hz), drawn from
   the mid-span rather than anywhere on the line, and ejected along the contact plane with
   load-scaled speed. New: endpoint stress flashes fire only past the overload gate
   (`TETHER_OVERLOAD_LOAD` 0.88, the recipe's top decile), cadence-throttled at ~11 Hz and
   alternating ends. Width, color ramp, and shiver already carry the live load read and are
   unchanged.
5. **massline_release** — on the break path (`_onTetherSnap`), the target-end spark burst now obeys
   the released body's actual retained velocity: directions collapse into the recipe's 0.55 rad cone
   around it, speeds add the momentum term, and spark-trail stretch scales with that speed. Counts,
   endpoint positions, and the quality-scaled 14/18/22 per-end budget are unchanged
   (acceptance-pinned); a target at rest keeps the uniform burst; the source end keeps the uniform
   recoil read.

## Deliberate adaptations and exclusions

- **The rated clean release (`_onTetherReleaseRated`) got no particle spray.** Its accepted R3B
  grammar — paired endpoint flashes plus the one actual-velocity streak — is pinned at zero added
  particles/lights by `check-massline-arc-render.mjs`, and that silence is itself the authored read.
  The recipe's loud momentum beat lives on the break path, where the live grammar embraces it.
  (An earlier draft of this port sprayed there; the pinned check caught it — 27 particles vs 0 —
  and the port moved to the break path.)
- **Palettes stay with the live grammar owners.** The lab's violet massline ramp and the recipe
  light intensities are lab-currency; the live cyan→amber→red tension ramp, classification colors,
  and weapon-family colors are acceptance-pinned. What travels is structure, timing, counts, and
  causality branching.
- **speed_extreme is out of scope** (rejected by the unit): `velocityLanguage.js` owns speed
  language and its one sanctioned exceptional-speed output is already spent.
- **The recipe's beat scheduler did not travel.** The concussion trailing wash is approximated with
  two simultaneous fronts at different speeds/lifetimes; destruction_light's flare-out fires inside
  the existing ignition phase.
- **The destruction_light size-ladder debris** was not ported over the pinned phased debris fan;
  the flare-out and cinders are the recipe's ship-specific beats the live path lacked.

## What passed (final candidate)

| Proof | Result |
|---|---|
| `npm run check:baseline` | PASS — 11/11 (includes the 26-check massline aggregate) |
| `check:presentation` → `check:vfx:trail-instancing` (node + WebGL) | PASS (17 programs stable, no shader recompiles) |
| `check:presentation` → `check-presentation-cues.mjs` | PASS |
| `check:presentation` → `check-sg08-mix-profile.mjs` | PASS (`ok: true`) |
| `check:presentation` → `check-sg08-render-vfx.mjs` | PASS |
| `check:presentation` → `check:thruster:propulsion-family` | PASS — 65/65 |
| Focused VFX/massline/explosion tests (18 files) | PASS — 125/125 |
| `check-vfx-frame-sleep.mjs` | PASS — idle frame mean 0.0118 ms vs 0.25 ms ceiling; tether wake/sleep clean |
| Out-of-repo structural probes (temp dir, not committed) | PASS — latch orientation/pulse timing, concussion collapse + two-speed fronts, axis-branch bilateral structure, flare-out determinism + capital exclusion, snap momentum cone (mean cos 0.95) with pinned 22/22 budgets, tension shed 58@60 Hz vs 57@120 Hz |

## What was NOT proven

- **No Browser/Electron visual capture.** Headed route evidence for the Ceres gate belongs to
  `PQ-045.five-minute-h1`, which alone holds the `browser-gpu`/validation-broker ledger for this
  packet. This leaf proves pooled structure, timing, budgets, and determinism, not on-screen beauty.
- **`check-sg08-golden-trace.mjs` is red at entry and remains red with the identical fingerprint**:
  it expects the 47-A `tether:broken` source event at tick 116 and the deterministic sim now emits it
  at tick 190, beyond the checker's own documented ±60 re-record tolerance. The drift predates this
  unit (verified on the unmodified HEAD tree; the golden fixture last moved in July), the trace
  harness (`sf-sim.mjs`) never imports `vfx.js`, and the fixture is outside this unit's write set —
  so it cannot be and was not "fixed" here. It needs a deliberate golden re-record by its owner.
- Reduced-motion/flash behavior is preserved through the existing auto-transforms and reduced
  branches but was not re-captured on a real GPU route.
- Performance: no new per-frame allocation (frozen color records, reused scratch, preallocated
  cable fields), no new lights (pool of 6 unchanged), event-driven or cadence/accumulator-gated
  emission only, idle sleep behavior verified. No matched dense-combat capture was run; that
  evidence class belongs to the five-minute gate.

## Follow-ups deliberately excluded

- Re-recording `test/47a.presentation.expected.json` (sim-side golden drift; not this unit's file).
- Porting `impact_normal`, `explosion_heavy`, thruster/speed/field/reentry families (not in the
  unit's five-recipe scope; speed_extreme explicitly rejected).
- Any vfxnext scheduler, LightPool, or shader substrate migration.
