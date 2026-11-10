<!-- LIFETIME: HISTORICAL -->
# VFX quality and style audit — 2026-09-16

**Not a style guide.** Live law is [`VFX_TECHNIQUE_STANDARD.md`](./VFX_TECHNIQUE_STANDARD.md) and
[`VFX_LIFECYCLE_STANDARD.md`](./VFX_LIFECYCLE_STANDARD.md). `starfield.js` and `momentBeat.js`
named below as deletion candidates were removed on 2026-09-16.

**Scope.** Every player-facing runtime effect family in the live route: propulsion (player jet,
contrail, retro, RCS, NPC fleet drives, boost/dash, speed language), weapons and combat (bolts,
ribbons, muzzles, impacts, shields, explosions, beams, casings, scorches, distortion, energy
materials), field tools, massline, mining, travel cues, world-state tells (law heat, job
signatures, station/Ceres actions, momentum sink), loot/pickup, planet skim, and the background
stack. ~60 render modules read across three cluster audits; every headline finding below was
re-verified in source at HEAD `d94e8d995`+.

**Rubric.** The repo's own standards, not an imported taste: the eight-class matrix, rejection
register B1–B19, material/effect/LOD/composition rules M1–M4 / E1–E5 / L1–L3 / C1–C3 in
[`VFX_TECHNIQUE_STANDARD.md`](./VFX_TECHNIQUE_STANDARD.md); the five-stage lifecycle
(ignition → build → sustain → release → dead) in
[`VFX_LIFECYCLE_STANDARD.md`](./VFX_LIFECYCLE_STANDARD.md); construction statuses in
[`SOFT_CARD_INVENTORY.json`](./SOFT_CARD_INVENTORY.json). Each family is scored /10 on six axes:
construction compliance, lifecycle choreography, sustained motion, accessibility, perf hygiene,
and documented acceptance. Letter grades: **A** ≥ 9, **B+** 8–8.9, **B** 7–7.9, **C** 5–6.9,
**D** 3–4.9, **F** ≤ 2.

**Live gates re-run for this audit** (this tree): `check:vfx-force-language` 86/86,
`check:vfx-sleep` PASS, `check:vfx-techniques` PASS (10 entries). A code audit cannot grant the
visual-acceptance cells those gates deliberately do not cover; open cells are listed in §7.

---

## 1. Style categorization — the nine substrates actually in use

Every effect renders through one of nine material languages. This is the style map of the game.

| # | Style language | Construction | Families speaking it |
|---|---|---|---|
| S1 | **Swept-sheet plasma** (curved cross-section + grazing term + travelling wave) | 28 streamer sheets, 56 axial stations, `1/\|N·V\|` edge brightening, per-sheet reach/runout, HDR `toneMapped:false` | Player main jet, retro jets, drive forge collar |
| S2 | **Immutable world-space history recorder** | Pose samples in float data textures, GPU-derived age, dirty-only uploads, never advected | Player contrail |
| S3 | **Axial-billboard flipbook cards** (segmented plume geometry + flow flipbook material) | Instanced camera-facing cards with domain-warped flow, role-separated layers, **no view-dependent term** | NPC/fleet drives, RCS impulses |
| S4 | **Folded-surface force language** (lifecycle v2) | Instanced swept folded strips, per-kind GPU choreography, shared `effectLifecycle` envelopes | Field tools (Seed/Well/Repulsor/Cone/Skim), weapon discharge sources |
| S5 | **Baked density-film raymarch** | 12-frame 48³ offline-baked 3D density/temperature film, single-scatter march, manual depth | Explosion smoke/combustion buckets |
| S6 | **Structured swept impulse sheets** | `structuredBurstGeometry` curls/folds with shear response | Glow/ring buckets, arcade blades/arcs, travel cue sheets |
| S7 | **GPU-aged instanced mesh particles** (three.quarks, `RenderMode.Mesh`) | Lit/tumbling cones, hex glass, needles with temperature color tracks | Spall, shrapnel, casings, shield shards, venting, mining ejecta |
| S8 | **Velocity-oriented world streaks / spindles** | 3-plane volumetric spindles with analytic cross-sections; streak quads with core line + hard lateral cutoff | Energy bolts, shard streak cloud, loot heads/tails, momentum-sink dampers |
| S9 | **World-planar quads & shells** | Flat additive quads, lathe sheaths, instanced shader shells | Mining beam, beam cores, planet skim, shield bubble, distortion encode |

Background speaks its own sanctioned dialect: sky-depth point sprites, authored impostor cards
(painted planets, comet), instanced flare atlas, and clip-proof deep-field projection — the only
place the soft-card exception legally lives.

**Coherence verdict.** S1/S2/S4/S5 are genuinely first-class designed languages. S3 and parts of
S9 are the stylistic debt: flat cards without a view term (B7-adjacent) carry the entire NPC
fleet's propulsion, and flat additive quads carry the mining beam. S6/S7/S8 are strong but
younger. The system reads as one game — shared HDR discipline, shared pooled admission, shared
accessibility profiles — with two visible seams: card-plumes beside sheet-plumes, and the
flipbook fallback beside the swept muzzle language.

---

## 2. Master ratings

Scores /10 → grade. "Gap" is the single highest-leverage deficiency per family.

### Engine-jet class

| Family | Style | Score | Grade | Gap |
|---|---|---:|---|---|
| Player main-drive jet | S1 | 9 | A | Reduced-motion/flash never reach the ribbon sheets (`motionScroll` computed and dead, `plasmaStream.js:913`; flash scales throat quads only, `:1034`) |
| Player contrail | S2 | 9 | A | No reduced-flash damping of trail radiance; O(n) `copyWithin` per sample |
| Boost/dash/ignition layer | S1 | 8 | B+ | Dead `shockAmp` terms (`plasmaStream.js:932-936`); no flash scaling |
| Retro/reverse jets | S1 | 7 | B | **No attack/release envelope** — pops off when reverse demand crosses 0.001 (`playerRetroVolume.js:25-41,266-269`) (B10) |
| RCS impulses | S3 | 8 | B+ | Flat cards, no view-dependent term (B7 near-miss); linear release |
| NPC/fleet drives | S3 | 7 | B | B7 near-miss family-wide (`flowFlipbookMaterial.js:114-146`); per-role extents uniform across instances (B18 minor); NPC RCS constructed but never fires |
| Volumetric raymarched plume | — | 5 | C | Benched reference (B12 by its own documentation); precompile-staging only |

### Flight-history class

| Family | Style | Score | Grade | Gap |
|---|---|---:|---|---|
| Speed streaks / velocity language | canvas2D overlay | 8 | B+ | Not GPU; no ignition choreography (by design — bands key on speed alone) |
| NPC engine trail surfaces | flat ribbon | 7 | B | **B7 violation**: 2-vertex-wide strip, pure side-gaussian, no view term (`engineTrailSurfaces.js:43-141,502`) |

### Heavy-impact class

| Family | Style | Score | Grade | Gap |
|---|---|---:|---|---|
| Destruction / explosion beats | S5+S6+S7 | 9.5 | A | Shared 24-event lifecycle cap could truncate a massacre |
| Energy bolts / projectiles | S8 | 9 | A | Cross-section pattern frozen (no time uniform; B16 near-miss, mitigated by smear) |
| Muzzle / discharge sources | S4 | 8.5 | B+ | Excellent ignition/extrusion/cooling via `sampleDischargeLifecycle` — for the five supported signatures only |
| **Flipbook fallback** (missile/beam/mine muzzles + **all impact flashes**) | procedural atlas card | **4** | **C−** | **B1** (hash/sin procedural atlas as final art, `flipbookAtlases.js:15-38`), **B2** (camera-facing quad, `flipbookPool.js:37-45`), **M4 violation** (8-step slideshow, no motion vectors, `flipbookPool.js:215`) |
| Impacts / sparks / spall | S7+S8 | 8 | B+ | Impact flash leans on the flipbook card above |
| Weapon ribbons / tracers | quad-strip history | 7 | B | Camera-facing cross-frame (`ribbonPool.js:218-223`, B2 moderate); full-buffer upload every active frame |
| Beams | S9 two-layer | 8 | B+ | Snaps to full width on birth (B10 near-miss); flat-quad carrier |
| Casings / ejecta | S7 lit matter | 8 | B+ | Double-eject overlap on the flipbook route (`presenter.js:252` + `vfx.js:2965-2967`) |
| Contact marks / scorch | S9 decal | 8 | B+ | No dedicated breach/weak-point choreography beyond scorch+venting |
| Mining beam + contact | S9 flat quads | 7 | B | **Most bare-emissive primitive in the hub** (additive `MeshBasicMaterial` pair, `vfx.js:7201-7225`) and **instant on/off** (`:7260-7265`) (B5/B10) |
| Dash / travel wakes | S6 | 8 | B+ | Inherently one-shot; several cues are single thin additive sheets |

### Shield-response class

| Family | Style | Score | Grade | Gap |
|---|---|---:|---|---|
| Force fields (five tools, lifecycle v2) | S4 | 9 | A | Just landed (`d94e8d995`); boundary strips and cooling afterimage verified |
| Shield hits / failure | S9 shell + lattice | 8.5 | B+ | Idle shell static while visible (B16 near-miss); gaussian contact ring |
| Energy materials (volumes) | shader shells | 8.5 | B+ | Plume carrier remains a flowed cylinder (B3 near-miss, engineered against) |
| Distortion field | S9 encode | 7.5 | B+ | Well lensing frozen while active (B16 near-miss); composites only with `renderGraph` on |
| Armor breach / venting | decal + S7 | 8 | B+ | Venting is documented foreign work-in-progress |
| Momentum sink | S8 | 8 | B+ | Narrow visual ambition; 12 Hz cadence could flicker at mismatched refresh |
| Law-heat telegraph | lights + stamps | 9 | A | Bounded 3-of-6 light share; accessibility distinguishes combat flash from status cue |
| NPC job signatures | shared substrates | 9 | A | Colorblind readers lose the color channel (mitigated: meaning is countable cadence) |
| Station-side / Ceres actions | shared substrates | 8 | B+ | Narrower vocabularies; otherwise same discipline |

### Gas-smoke-dust, debris-cargo, massline, background

| Family | Style | Score | Grade | Gap |
|---|---|---:|---|---|
| Planet skim / reentry | S9 lathe+volume | 9 | A | None material; measured white-out gate respected |
| Loot magnet / pickup | S8 | 9 | A | None material; hard caps, table cull, true subsystem sleep |
| Tether cable + release arc | S9 ribbon | 9 | A | Minor: band flashes are plain additive cards |
| Massline presentation helpers | pixel-free intent | 9 | A | None |
| Background stack (deep field, stars, flares, comet, parallax) | sky dialect | 9 | A | Sky exception properly contained; zero-alloc update |
| Crucible ghost | translucent clone | 7 | B | No accessibility/easing polish |
| **starfield.js** (legacy) | point sprites | **2** | **F** | Deleted 2026-09-16 — dead module embodying the patterns the shipped system replaced |
| **momentBeat.js** | pure resolver | **3** | **D** | Deleted 2026-09-16 — orphaned duplicate of live `feel.js` beat logic |

---

## 3. Systemic strengths

1. **Pooled admission architecture.** Every substrate runs O(1) free stacks with
   priority-arbitrated oldest-steal eviction (`vfx.js:2222-2336`); quality migration retains
   top-priority residents. No camera-facing billboard path survives in the hub buckets
   (`_glowTex`/`_ringTex` null, `vfx.js:1753-1754`).
2. **Sleep discipline.** Two-tier relevance + cadence gates with self-tested contracts
   (`vfx.js:13102-13156`); dormant subsystems cost one boolean read. `check:vfx-sleep` green.
3. **The explosion grammar is the crown jewel.** Deterministic per-serial salts, authored
   multi-phase schedules (small 0.82 s → capital 3.4 s, 10 beats), baked volumetric combustion,
   lit tumbling debris, HDR ignition cores deliberately feeding bloom (`phasedExplosions.js`,
   `vfx.js:4783+`).
4. **Lifecycle v2 fields are the new bar.** Five-stage GPU envelopes, boundary-strip truth,
   no-target animation, allocation-free retained descriptors — the rest of the codebase now has
   a reference implementation for birth/sustain/retire.
5. **Accessibility is first-class, not bolted on.** Four frozen profiles threaded through ~20
   spawn sites; per-family reduced cadences; combat flash zeroed while status cues keep a calm
   floor; reduced-motion freezes clocks rather than deleting silhouettes.
6. **World-state tells are research-driven.** Job signatures encode meaning in countable blink
   cadence with a measured 300 wu visibility bubble — a far-field language, not decoration.

## 4. Systemic weaknesses (ranked by leverage)

1. **The flipbook fallback is the worst shipped surface (B1+B2+M4).** Procedural hash atlas,
   camera-facing quads, 8-frame slideshow — and it is live for missile/torpedo/beam/mine muzzles
   and every impact flash. The swept-source language exists; these four recipes and the impact
   role just haven't migrated. Highest visual ROI available.
2. **The flat-card family (B7).** NPC fleet drives, RCS impulses, NPC trail ribbons, and the
   weapon-ribbon cross-frame all render camera-facing cards with no view-dependent term. The
   player jet demonstrates the fix (curved cross-section + `1/|N·V|`); the fix has not
   propagated to the fleet.
3. **Player-thruster accessibility gap.** `motionScroll` is computed and never consumed
   (`plasmaStream.js:913`); reduced-flash reaches only the throat quads. The best-looking effect
   in the game ignores two accessibility axes its own code computes.
4. **Pop-in holdouts (B10).** Mining beam on/off is instant (`vfx.js:7260-7265`); beams snap to
   full width; retro release rides physics decay. Everything else in the repo envelopes.
5. **Acceptance debt.** `vfx-sprite-puffs` has been `pending-visual-acceptance` since 2026-09-07;
   the structured-vfx candidate's normal-game visual and integrated-GPU cost cells are still
   open (`VFX_UPGRADE_2026-09-07.md` §"Ordered continuation" items 1–2). Code quality is ahead
   of observed quality.
6. **Dead weight.** `starfield.js` and `momentBeat.js` deleted 2026-09-16. Remaining: the benched volumetric stack, the
   force-hidden snake layer, dead `shockAmp`/`reel`/forge-aim paths. Each is a style-regression
   hazard or review noise.
7. **Minor duplication.** Double casing ejection on the flipbook route; legacy trail-streak seam.

## 5. Priority queue

1. Migrate the four flipbook recipes + impact-flash role onto the swept-source/baked-film path
   (deletes the last B1/B2/M4 surface). Owner: `weapons/presenter.js:183-185`,
   `flipbookAtlases.js`.
2. Close the `vfx-sprite-puffs` visual-acceptance cell on the normal route (the 2026-09-07
   continuation list, items 1–2: crowded-camera captures, integrated-GPU profile).
3. Wire reduced-motion/flash into the player ribbon sheets (consume `motionScroll`; scale
   `uRadiance` under flash profiles).
4. Add a view-dependent term (or curved cross-section) to `flowFlipbookMaterial` and
   `engineTrailSurfaces` — the single change that lifts three families from B to B+/A.
5. Envelope the mining beam (0.05–0.1 s attack/release on width/radiance) and beam birth width.
6. ~~Delete `starfield.js` and `momentBeat.js`~~ done 2026-09-16; remaining: strip the dead snake/shock/reel paths.
7. Give retro jets the same spool envelope the main drive has.

## 6. Verification status

Green today: `check:vfx-force-language` 86/86, `check:vfx-sleep`, `check:vfx-techniques`
(10 entries), soft-card inventory complete ratchet. **Not established by this audit** (and
deliberately not claimable from code): normal-game visual acceptance of the structured-burst /
density-film candidate, integrated-GPU frame-time under dense combat, and colorblind review of
cadence-coded tells. Those remain the open cells from `VFX_UPGRADE_2026-09-07.md`; nothing in
this audit retroactively closes them.

## 7. Method note

Three independent read-only cluster audits (propulsion; weapons/combat; hub/world/background)
with file:line evidence, followed by source re-verification of every headline claim at HEAD.
Scores are engineering-quality judgments against the repo's own published rubric; they are not
a substitute for the shipping-camera motion review the technique standard requires.
