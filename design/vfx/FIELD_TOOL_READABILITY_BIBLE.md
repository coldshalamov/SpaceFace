# FIELD / INDUSTRIAL-TOOL / PLANETARY READABILITY BIBLE

**Status:** taste constitution for PQ-012 (continuous field kernel), PQ-016 (contextual industrial
beam, payloads, receivers), PQ-013 (planetary sling/skim/harvest/reentry). Authored 2026-07-21.
**Consumers:** the implementers of those three packets, their reviewers, and any future field-effect
lane. This document extends — never replaces — `design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md`
(the effect→game-meaning grammar) and `design/foundry/FACTION_SURFACE_LANGUAGE.md` (the
surface-identity constitution and its Grey-read doctrine).

**Authority:** `ARCHITECTURE.md` > `design/GDD_2_0.md` > the activated packet specs
(`design/spec3/SPEC3-F4-combat-weapons-ai.md`, `design/ASTEROID_OPS_VISION.md`,
`design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md` STEP 12, `design/program/atlas/01_DECISIONS.md`)
> this doc. Where measured runtime evidence contradicts a prescription here, the evidence wins and
this doc is updated.

**Every claim below is grounded in code or canon that was opened while writing this.** The
verification column names the file; do not extend a prescription without opening its citation.

---

## 0. The constitution in nine laws

1. **A field is a machine, not an orb.** It has an intake or a piston, a working region, and an
   exhaust or a pile-up. Geometry carries the primary read; palette is redundant backup. The Mass
   Seed (`src/render/visualFactory.js` `buildMassSeed`, `userData.visualLanguage =
   'frame-lock-containment-anchor'`) is the precedent: a phase-driven FRAME device, deliberately
   not a glowing orb. Every effect in this bible is a member of that family.
2. **State = pose, event = pulse, never decoration.** An effect exists only where a game state
   changes it (COMMAND_DECK cross-cutting rule). A field that breathes on a timer, a beam that
   flickers at rest, a boundary that idles — all rejected. Motion the sim did not cause is the
   enemy the COMMAND_DECK bible already bans from the screens; it is banned from world-space too.
3. **Judged at 1× or not at all.** Everything is evaluated at the default chase camera
   (`src/render/camera.js`: `DEFAULT_ZOOM = 72` wu, FOV 50, tilt 60°) — the dorsal 60–150 px read
   FACTION_SURFACE_LANGUAGE governs by. Nothing refined at 4× zoom that is invisible at 1× ships.
4. **The boundary is drawn by behavior, never by a circle.** Finite radius is communicated by
   where flow starts, where material piles up, and where machine elements end — plus an
   articulation tell when the field engages a real entity. A HUD circle as the primary radius
   read is a rejected shortcut (see §4).
5. **Heat lives on the amber end, work lives on the teal end.** The surviving palette is the one
   already locked in `src/render/vfx.js` (tether load ramp `#39d0ff → #ffb35c → #ff5c5c`, doctrine
   tells, ore tints) and the sector lighting (`src/data/sectors.js` key/rim/fill palettes) — not a
   new hue system (see §3).
6. **The boundary never blooms.** Bloom smears (`src/render/bloom.js`: threshold 1.0, multi-scale
   pyramid halo). Anything the player must read as a crisp line — rims, banks, kerfs, seams — is
   authored below bloom threshold or in non-blooming materials. Glow belongs to cores and events.
7. **Direction is a property of form.** Inward vs outward vs through-flow are distinguished by
   silhouette (concave funnel vs convex dome vs banked corridor), by flow origin and
   acceleration structure, and by taper direction — with hue as a third redundant channel. Two of
   three channels must survive desaturation (§3.4, the Grey-read test).
8. **Accessibility preserves the information, not the effect.** Reduced-motion and reduced-flash
   variants keep pose, direction, staging, and state readable through the existing resolver
   (`src/render/vfxAccessibility.js` profiles FULL / REDUCED_MOTION / REDUCED_FLASH /
   REDUCED_BOTH). Degrade to a legible static state, never to blank, never to silence
   (COMMAND_DECK reduced-motion law).
9. **Budgets are telemetry, not wishes.** Every pooled count, cadence, and cap in this bible is
   either an existing shipped constant or a number the implementer must derive from measured
   frame telemetry (`design/PERF_BUDGET.md`: VFX owns 2.5 ms of the 16.7 ms frame) and record in
   the owning system's `inspect()` — never an arbitrary cap picked in prose.

---

## 1. Family tree — shared visual DNA

Everything in this bible derives from three shipped DNA strands. A new field effect that reaches
for a fourth, unrelated vocabulary is rejected at review.

```
SHARED DNA (all citations verified in tree)
│
├─ ENERGY-MATERIAL STRAND — src/render/energy/energyMaterials.js
│   HDR two-layer (hot core + turbulent halo) ShaderMaterials, fbm flow,
│   fresnel shell, optional scene-depth soft intersection; toneMapped:false,
│   additive; written into the HalfFloat pipeline so radiance >1 blooms.
│   ├─ createPlumeMaterial / createPlumeVolume  ("liquid blue fire" plume;
│   │    colorA #36c8ff → colorB #6a4cff defaults; uBoost heat ramp)
│   │    └─→ reentry bow-shock sheath (§7), skim plasma fringe (§7)
│   ├─ createMasslineRibbonMaterial  (aAlong/aSide ribbon; uPulseSpeed travel
│   │    pulse; uTension/uOverload/uReel state uniforms)
│   │    └─→ field filaments (§1–3), transfer conduit (§5), destination
│   │        thread (§6), annular band streaking (§7), corridor bank pulse (§3)
│   └─ createEnergyVolume  (hot core + halo pair, haloScale 1.28)
│        └─→ field sink core (§1), pressure dome (§2)
│
├─ FRAME-DEVICE STRAND — src/render/visualFactory.js buildMassSeed (PQ-011)
│   State = pose. Octahedron containment core, frame-lock gyro torus, four
│   folding struts, three anchor pylons, status beacon (dim → cyan active
│   0x9fe8ff/0x2fc4ef → amber warning 0xffc35c/0xef8a1e), travel chevrons.
│   Driven by entity.data.massSeedState.phase; eases are render-only.
│   ├─ strut/pylon deployment     └─→ field vane/rib/bank deploy + articulate (§1–4)
│   ├─ beacon as state lamp       └─→ field context beacon, beam port gauge (§5)
│   └─ travel chevrons            └─→ clearing-corridor direction banks (§3)
│
└─ POOLED-PARTICLE STRAND — src/render/vfx.js
    Bounded pools, zero per-frame allocation, cadence-gated subsystems:
    GPU point cloud (PARTICLE_CAP low/med/high = 1500/3000/4000),
    instanced sprite buckets (SPRITE_CAP 256: FLASH/RING/PUFF/FRESNEL/COMBUSTION),
    trail-streak pool (TRAIL_STREAK_CAP 96), normal-blended smoke bucket
    (makeSmokeTexture: lobed, superelliptical, non-circular by construction),
    PersistentCombatBeamPool (16 slots; normal-blend core + additive sheath,
    2 draws; src/render/combat/persistentBeams.js).
    ├─ trail streaks   └─→ flow filaments, cut kerf, payload mass-shadow
    ├─ smoke bucket    └─→ outward-field berm, storm band, reentry debris residue
    ├─ flash (state-triggered only)  └─→ capture pulse, push wave, detonation
    └─ event lights (EVENT_LIGHT_POOL_SIZE = 6 — shader cache key invariant;
         accessibility scales intensity, never adds/removes lights)
```

**Why these three and no more:** the energy strand owns *volume and heat*; the frame strand owns
*state and mechanism*; the pool strand owns *transient matter*. Between them they already render
the tether, the plume, the Mass Seed, mining, combat, and explosions as one coherent world. The
field family is these three strands braided, nothing else.

---

## 2. Readability at 1× — the doctrine

The known failure mode this section exists to kill: **refined at 4×, invisible at 1×.** An effect
authored while zoomed in, inspected in a still, and approved on a screenshot review that never ran
the default camera. Every prescription in this bible is written against the live framing, and the
review protocol below makes it mechanical.

**The framing of record** (`src/render/camera.js`): chase camera at `DEFAULT_ZOOM = 72` wu, FOV
50°, tilt 60°, position-follow only. Ships are 8–20 m; a fighter reads at the 60–150 px dorsal
scale FACTION_SURFACE_LANGUAGE uses as its governing read. Bloom and the optional grade are
downstream of everything (`src/render/bloom.js`).

**The five mechanical rules:**

1. **The 2-pixel floor.** No feature that carries primary gameplay meaning may be smaller than
   ~2 px at the framing of record (≈0.3–0.5 wu at zoom 72 — the same ≥0.3 m mip-survival rule
   the faction bible uses). Filament bundles, vanes, banks, and berms are sized to this floor;
   single streaks never carry meaning alone.
2. **Motion before glow, silhouette before hue, pose before both.** At 1× the player reads:
   what moved, in which direction, and what shape it made — color is the third channel. This is
   the D7 velocity-language doctrine (`design/program/atlas/01_DECISIONS.md` D7: "measurement,
   not anime"; at high speed the instruments and the world carry it, particles whisper) applied
   to field effects.
3. **One state change = one readable beat.** When a field engages, captures, pushes, or expires,
   that beat must be visible at 1× without the player watching for it: a deploy articulation, a
   capture pulse at the core, a berm bulge at the contact bearing. Ambient shimmer that competes
   with those beats is rejected (COMMAND_DECK signal-hierarchy constraint: state changes read
   above ambient atmosphere).
4. **The 5-second stranger test, world edition.** A stranger shown a 1× capture of each effect
   names it in one noun phrase: "the intake," "the plow," "the sluice," "the weld," "the plunge."
   If the name comes back "a glow," "a ring," "some particles" — rejected. This mirrors
   COMMAND_DECK §5's pass bar for screens.
5. **Review protocol.** Acceptance captures for any field/beam/skim effect: (a) 1× default
   camera, in motion, mid-state-change; (b) 1× desaturated; (c) 1× with `flashReduce` on;
   (d) 1× with `motionReduce` on. Four captures, all judged against this doc's per-item rejection
   conditions. A 4× beauty shot may be attached but decides nothing.

---

## 3. The palette within the grade

### 3.1 What the grade actually is (verified, not assumed)

The present pipeline (`src/render/bloom.js`):

- Scene renders into a HalfFloat RT; brights above `threshold = 1.0` extract into a 2-level
  downsample pyramid and composite back multi-scale (`BLOOM_PYRAMID_NORM = 1.5`, coarse weight
  0.36, default `strength 0.35`). **Anything with radiance > 1.0 radiates a halo.**
- ACES filmic (Narkowicz approximation) runs in the composite; bloom is added **after** tone
  mapping so strength stays perceptually linear.
- The optional color grade (`uGrade`, **default 0/off**) is multiplicative and luma-keyed:
  `shadowBalance (0.88, 0.98, 1.10)` cools shadows toward teal, `highlightBalance (1.10, 1.00,
  0.88)` warms highlights toward amber, saturation ×1.15. Because it is multiplicative, true
  black stays black.
- The standing orange-teal axis is delivered even with `uGrade = 0` by **sector lighting**
  (`src/render/renderer.js:68` `SECTOR_LIGHT_INTENSITIES = { ambient 0.85, key 1.7, rim 0.7,
  fill 0.35 }`; palettes in `src/data/sectors.js`): the core sector is neutral
  (`key 0xe8edf4 / rim 0x8fa4bf`), the belt runs warm (`key 0xffd59a / rim 0xb56d2f /
  fill 0xffb13d`), the fringe runs hot red-orange (`key 0xffb07a / rim 0xff3f2d`), the anomaly
  sector runs violet-green (`key 0xc8b6ff / rim 0x54ffb0`).

**Consequence for prescription:** warm materials get warmer and cool materials get pushed toward
teal under both the default sector lighting and the optional grade. Palette anchors below are
chosen to sit *stably* on one side of that axis — a hue that straddles the axis (muddy greens,
desaturated browns near mid-luma) flips meaning between sectors and is rejected.

### 3.2 The locked anchors

These are the only anchors this bible uses. All are already shipped tokens; the hex is the
canonical reference, and the "axis" column names where the optional grade and sector lighting
push it.

| Token | Hex | Shipped use (citation) | Axis position |
|---|---|---|---|
| Energy cyan | `#39d0ff` | tether cool (`vfx.js` `_tetherColorCool`), doctrine TETHER tell, travel palette primary | deep teal — stable |
| Cool white-blue | `#d7e6ff` | tether/rich-core secondary, travel secondary | teal, near-white |
| Hot cyan-white | `#a6f0ff` / `#eaffff` | flee flash, tether white-hot, Mass Seed beacon `0x9fe8ff` | teal highlight |
| Working-band ice | `#9fd8e8` | `oreColor` ice/water (`vfx.js:5782`) | pale teal |
| Utility green | `#40d090` | `oreColor` volatile/gas | mid — use sparingly, keep saturation high so the grade can't push it to mud |
| Amber | `#ffb35c` | tether warm (`_tetherColorWarm`), doctrine CHARGE tell, belt palette | orange — stable |
| Weld amber | `#d7862c` / `#ffc35c` | payload collar band, Mass Seed warning beacon | orange mid |
| Hot amber-white | `#fff2d0` / `#ffe0a8` | massline.throw flash, explosion cores | orange highlight |
| Danger red | `#ff5c5c` | tether hot (`_tetherColorHot`), doctrine FLYBY tell, interdiction | red-orange — stable |
| Ember red-orange | `#ff7040` / `#ff8840` | FLYBY event light, formation-break ring | red-orange |
| Resonator violet | `#8d66ff` / `#b060ff` | rich-core mining, resonator engine profile, `oreColor` crystal | off-axis cool — reserved for anomaly/exotic |
| Frame metal | `0x2b3138` / `0x3d4a57` | Mass Seed struts/gyro (MeshStandard, no bloom) | neutral dark |
| Payload shell | `0x46515a` | payload canister body | neutral mid |

**Ore/content tints** come from the shipped `oreColor()` (`src/render/vfx.js:5780`): iron/metal
`#c08040`, ice `#9fd8e8`, volatile `#40d090`, crystal `#b060ff`, silica `#c8c0a8`,
titanium/alloy `#c0c8d0`, copper `#d08050`, exotic `#ff60c0`, default `#d8a050`. Extract and
transfer contexts tint from this map only — a commodity the map can't name renders default amber.

### 3.3 Radiance discipline

- **Blooming (radiance > 1.0):** energy cores, capture/push event pulses, plasma sheath, beacon
  lamps. Authored through the energy strand with `intensity` in the shipped 2.2–6.5 range
  (`energyMaterials.js` defaults; massline ribbon `intensity 6.2` core / 2.8 halo in
  `vfx.js` `_initTetherCable`).
- **Non-blooming (radiance ≤ 1.0):** every crisp structural read — boundary pips, corridor banks,
  kerf lines, stitch rows, frame struts. Authored as `MeshBasicMaterial`/`MeshStandardMaterial`
  at ordinary color values, or additive quads at opacity ≤ 0.5 with un-boosted colors. **Law 6:
  the boundary never blooms.**
- **Event lights:** the pool is fixed at `EVENT_LIGHT_POOL_SIZE = 6` (`vfx.js:84`) because the
  count is a shader cache key; accessibility scales peak intensity at the choke point
  (`vfxAccessibility.js` `eventLightPeakScale`: reduced-motion 0, reduced-flash 0.24), never
  adds or removes lights.

### 3.4 The Grey-read test (per effect, mechanical)

Port of the faction bible's Grey-read doctrine: for each effect, state what survives full
desaturation. If the identity collapses without hue, the design is defective. Each item below
carries a **Grey-read:** line; a reviewer applies it by viewing capture (b) from §2's protocol.

---

## 4. The fields (PQ-012)

PQ-012 (`design/program/roadmap/program-queue.json:791`): "Implement bounded attractive,
repulsive, and clearing fields with physical ownership and readable VFX." The three effects
below are one family — the same sink/pressure/corridor machine in three poses — built from the
§1 strands. For each: (a) physical metaphor, (b) form language, (c) motion grammar, (d) palette,
(e) reduced-motion and reduced-flash variants, (f) Grey-read, (g) Three.js implementation,
(h) rejection conditions.

Shared vocabulary for all three:

- **The field's radius is R, its commitment margin is the outer 15% of R** (the falloff zone).
  Inside the margin, effect strength ramps 1→0; flow elements thin, shorten, and slow. The
  player reads "I am at the edge" because the machine visibly weakens there. Margin narrower
  than 10% of R reads as a cliff (unfair); wider than 25% reads as mush (no true edge) —
  both rejected (see §4.4, the boundary-truth section these three share).
- **The engagement tell.** When the sim reports an entity actually inside and affected, the
  nearest 2–3 boundary elements (pips, berm lobes, bank segments) articulate toward it — lean,
  brighten one step, or bulge at the contact bearing. The field *notices*. This is the direct,
  world-space replacement for a HUD circle, and it is state-driven: no affected entity, no
  articulation.
- **The dormant pose.** Deployed but inactive fields hold their frame at full extent with flow
  off and boundary elements at ~0.3 opacity: a parked machine, never a half-glowing orb.

### 4.1 Inward (attractive) field — "the Intake"

**(a) Physical metaphor.** A dredge intake / turbine impeller: matter and light are drawn
toward a center the way ore slides down a hopper. The read at gameplay distance is *peripheral
material accelerates inward and is consumed at a point*. It must never read as an explosion
running in reverse — the difference is the funnel: flow converges smoothly, accelerates, and
vanishes at a hot sink instead of erupting from one. FORBIDDEN by the mission brief: generic
expanding/contracting rings, a plain bloom sphere.

**(b) Form / silhouette.** Five to seven **spiral intake vanes** around a small faceted **sink
core** (Mass-Seed DNA: a dark octahedral knot, `0x2b3138` frame metal). Vanes are curved,
tapered, and all share one handedness — concave side facing the swirl direction — so the whole
reads as a pinwheel funnel at 1×. Vane geometry is densest near the core and thins outward;
their outer tips end *inside* R, at the commitment margin's inner edge. The boundary itself is
a ring of **separate rim pips** — short tapered shards aligned tangentially with visible gaps
between them, never a continuous circle. Silhouette discipline: CONCAVE funnel, spiral
handedness, pointed toward the middle. (Contrast §4.2's convex dome and straight ribs — the two
are distinguishable in peripheral vision by curvature alone.)

**(c) Motion grammar.** Stream filaments (short trail streaks) are born at the rim pips and
flow rim→core, accelerating: speed ∝ field strength × (1 − r/R falloff inverted), so they
visibly speed up as they converge — acceleration structure is the inward tell. Vanes
counter-rotate the swirl slowly (one rev per ~4 s, phase from sim time, seeded offset per
field). The core does **not** free-pulse: it flashes once per *capture* — a sim event where the
field actually pulls a mass unit across the core threshold (COMMAND_DECK event law: one pulse
per event, like Ping Ripple). On activation, vanes deploy outward from the core over ~0.35 s
(the Mass Seed strut-deployment ease, `visualFactory.js:3175`), which IS the on-state read; on
deactivation they fold home. Cadence: filament spawn/recycle at the shipped energy-plume
cadence (`VFX_ENERGY_PLUME_HZ = 30`), vane articulation at the seam-marker cadence
(`VFX_SEAM_MARKERS_HZ = 20`); drivers are `field.strength`, `field.capturedRate` from the
field kernel, never wall clock.

**(d) Palette.** Cool rim → hot point: filaments `#39d0ff` cooling to invisible at the margin,
core white-cyan `#a6f0ff → #eaffff` at radiance 4–6 (blooms; it is the sink, the one place
glow belongs). Rim pips `#d7e6ff` at ≤1.0 radiance — crisp, no halo. Hostile/trap variants
shift the *filament* hue to the amber end (`#ffb35c`) — the same doctrine-token swap the
FLYBY tell uses against the TETHER tell — while the core stays hot; hue is the third channel
and the silhouette stays the first.

**(e) Reduced-motion / reduced-flash.** Reduced-motion (`settings.video.motionReduce` or
`settings.accessibility.motionPreference === 'reduce'` — both read by the shipped HUD idiom in
`massSeedHud.js:73-75`): vanes hold full deploy, swirl stops; filaments become a static spiral
dash texture (dashes still taper inward — direction is pose, not motion); capture = one 200 ms
opacity step at the core, no scale change. Reduced-flash (`settings.video.flashReduce` or
`settings.accessibility.flashReduce`, resolved by `resolveVfxAccessibilityProfile`):
REDUCED_FLASH profile applies — core flash opacity ×0.3, size ×0.68, min life 0.1 s, event
light peak ×0.24 — and the capture beat holds a single 250 ms lit state instead of a flash.
**Preserved in both:** vane handedness, taper direction, capture timing. Lost: shimmer only.

**(f) Grey-read.** Spiral handedness; funnel convergence (line density increases toward the
center — filaments crowd as they approach the sink); the bright point where matter vanishes;
gapped rim pips. Inward vs outward is decided in grayscale by *which end of the flow is dense
and which end is pointed*: inward crowds and brightens toward the center; outward (§4.2)
crowds and brightens at the rim.

**(g) Three.js implementation.** Filaments: the trail-streak pool idiom
(`src/render/engineTrailSurfaces.js` + `vfx.js` `_spawnProjectileTrailStreak`) — instanced
streak quads with axis/stretch attributes, respawned at rim slots on a 30 Hz cadence; each
filament's velocity written from the field kernel's strength each step. Vanes: one
`InstancedMesh` of a low-poly curved wedge (≤24 tris each, 5–7 instances), articulated in the
same pass pattern as `buildMassSeed`'s struts (per-instance pose from phase, no per-frame
allocation — reuse a scratch quaternion). Core: `createEnergyVolume` from
`src/render/energy/energyMaterials.js`, small (core mix high, halo tight), driven by
`updateEnergyMaterial` with `time` from the vfx `_t` accumulator and `pulse` from capture
events only. Rim pips: instanced cones (the `buildMassSeed` chevron geometry idiom,
`ConeGeometry` 3-sided, rotated) in a gapped ring; nearest-pip articulation toward affected
entities written at 20 Hz from the kernel's affected-entity bearings. Closest existing
implementations to extend: `_initTetherCable` (instanced ribbon + anchor ring + per-frame pose
write, `vfx.js:2660`) and `buildMassSeed` (phase-pose articulation, `visualFactory.js:3074`).

**(h) Rejection conditions.**
1. Any continuous unbroken ring/circle geometry anywhere in the effect → reject (the brief's
   generic-ring ban, made mechanical).
2. Any element whose primary motion is radial expansion from or contraction to the center as a
   *loop* (rather than one-way flow or a single event pulse) → reject.
3. Filaments flowing outward from the core on an inward field → reject (direction inversion).
4. A capture flash with no corresponding kernel capture event → reject (rest-motion law 2).
5. Free-running core pulse, breathing vanes, or idle swirl visible while the field is dormant
   → reject.
6. Indistinguishable from §4.2 in a desaturated 1× still → reject (Grey-read failure).
7. Rim pips blooming (halo at capture review) → reject (law 6).

### 4.2 Outward (repulsive) field — "the Plow"

**(a) Physical metaphor.** A bow wave / a snowplow: pressure is generated at a hot core and
shoved outward; pushed matter decelerates with distance and *piles up at the boundary into a
standing berm*. The inward field consumes; the outward field heaps. That asymmetry — vanishing
sink vs accumulated berm — is what a player reads at 1× without any hue.

**(b) Form / silhouette.** A low, faceted **pressure dome** over the core — convex, armored,
icosahedral facets (NOT a smooth glow sphere: facets catch the sector key light so the dome
has a lighting read even with its shader dimmed). **Straight radial pressure ribs** run
core→rim across the dome, 6–9 of them, evenly spaced, ZERO curvature — the exact opposite of
§4.1's spiral vanes. At radius R sits the **berm**: a turbulent raised lip of lobed, unequal
segments (the smoke-texture idiom — lobed superellipse, never a clean annulus). The berm is
the boundary made of heaped matter; it is exactly at R and nowhere else. Silhouette: CONVEX
dome, straight spokes, piled lip.

**(c) Motion grammar.** Pressure pulses are born at the core and travel core→rim along the
ribs, decelerating as they go (the inverse acceleration structure of §4.1 — matter *stalls*
at the margin instead of accelerating through it). The berm churns in place: fbm scroll,
lobes cycling opacity/scale in a standing wave, **never radial expansion** — it is a standing
pile, not a shockwave. The dome itself kicks once per sim *push impulse* event (a repulsive
tick that actually moves an entity): a single outward pressure wave travels the ribs and the
berm bulges at the contact bearing — the vector-mine detonation precedent
(`vfx.js` `_presentationStyle` 'combat.vectorMine.detonate': "a fast cool-blue radial SHOVE
(an impulse front driven outward), deliberately a punch-flash burst rather than a primary
ring"). Cadence: rib pulse speed ∝ field strength; dome kick is event-driven only; berm churn
is a 20–30 Hz cosmetic scroll.

**(d) Palette.** The INVERSE gradient of the Intake: hot core → cool rim. Core `#fff2d0 →
#ffb35c` (massline.throw / CHARGE tokens) at radiance 4–5; ribs cooling through `#ffc878` to
`#39d0ff` at the rim; berm `#d7e6ff`-tinted smoke at ordinary (non-blooming) intensity —
heaped matter is matte, not radiant. Both fields live inside the locked tokens; the gradient
*direction* is the palette-level discriminator and it survives the grade because it is a
luma/luminance structure, not a hue bet.

**(e) Reduced-motion / reduced-flash.** Reduced-motion: ribs hold static with their outward
taper; berm renders as a static lobed band (same lobed mask, scroll frozen); push impulse = a
300 ms opacity ramp on ribs+berm at the contact bearing — no traveling wave, but the *side*
and *timing* of the push still read. Reduced-flash: REDUCED_FLASH profile — dome kick scaled
(opacity ×0.3, event light ×0.24), berm churn amplitude halved, no white core peak (cap at
amber `#ffb35c`). **Preserved:** convexity, straight ribs, berm location, push bearing. The
REDUCED_BOTH profile (`vfxAccessibility.js:25`) governs combined mode: event lights off
entirely — the berm bulge alone must carry the push, which is why the bulge is geometry
(scale), not light.

**(f) Grey-read.** Convex dome silhouette; straight radial spokes; the bright *rim* (berm)
against a bright *core* with a darker middle; flow born at center, stalling at rim. Versus the
Intake in grayscale: bright point + converging crowding + spiral vs bright lip + diverging
stall + straight spokes. No hue required.

**(g) Three.js implementation.** Dome: low-poly `IcosahedronGeometry(r, 1)` hemisphere with a
`createEnergyMaterial` halo-config layer (core ≈ 0.18, fresnel-driven shell — the
`createEnergyVolume` halo recipe in `energyMaterials.js:448`) plus a MeshStandard facet shell
underneath for the lighting read. Ribs: instanced streak quads from the same trail-streak
family as §4.1's filaments, configured radial, pulse phase from sim time — or a thin
`createMasslineRibbonMaterial` strip per rib with `uTension` mapped from field strength and
the traveling `uPulseSpeed` proportional to push rate (the shipped ribbon already does
direction-of-travel pulse; reuse it verbatim). Berm: the normal-blended smoke bucket
(`makeSmokeTexture`, `vfx.js:5840`) — 8–14 lobed `SPR_PUFF` sprites held resident in a fixed
seeded arrangement around R, recycled in place, churn via the pool's existing age/opacity
curve; per-lobe bulge at the affected bearing written at 20 Hz. Push wave: one radial
`SPR_FLASH` burst, event-triggered. Closest existing implementations: the tether glow/band
layering (`vfx.js:2697-2737`) for ribs, the explosion `pressure` phase's broken vapor shears
(`vfx.js:2449`: "The gaps and unequal segment lengths prevent the cue from rebuilding a
ring") for the berm.

**(h) Rejection conditions.**
1. Any spiral or curved vane geometry → reject (that is the Intake's silhouette; curvature
   confusion fails the two-field discrimination requirement).
2. A continuous clean annulus at R → reject (berm must be lobed/gapped; the explosion
   pressure-phase anti-ring precedent).
3. Gradient direction inverted (hot rim, cold core) → reject.
4. Dome breathing on a timer with no push event → reject (law 2).
5. Berm expanding radially as a loop (it is a standing pile; churn in place only) → reject.
6. Push kick with no corresponding kernel impulse event → reject.
7. Indistinguishable from §4.1 in a desaturated 1× still → reject.

### 4.3 Directional clearing field — "the Sluice"

**(a) Physical metaphor.** A canal lock / a snowplow corridor: a bounded lane whose contents
are driven one way, end to end. The read at gameplay distance is *flow with a direction* —
a corridor with a mouth and an exit, not a beam (which is a source→contact line) and not a
ring (which has no direction at all).

**(b) Form / silhouette.** Two parallel **banks** flanking a clear lane, each bank a row of
**chevron segments all pointing downstream** (Mass Seed travel-chevron DNA,
`visualFactory.js:3139`: 3-sided cones, rotated flat). The mouth end flares (banks 1.4× lane
width apart); the exit end converges and stops — the corridor has a finite length as well as
width (PQ-012 fields are bounded), and the exit fade is the falloff read: bank segment opacity
steps down over the last 20% of length. Interior: longitudinal streak filaments running mouth
→ exit. Asymmetry is load-bearing: a uniform tube reads as a beam; the flared mouth + chevron
point + exit fade make it a *corridor with a current*.

**(c) Motion grammar.** Chevrons carry a traveling pulse downstream (the massline ribbon's
`uPulseSpeed` idiom — pulse travels along `aAlong`; shipped on the tether cable at
`vfx.js:2684`). Filaments flow mouth→exit at speed ∝ clearing rate. When the corridor is
rotating (sweeping), the leading bank runs one opacity step brighter than the trailing bank
— differential pressure, readable as a windshield-wiper pressure face; when angular velocity
is zero the banks match. When the field actively clears an object, one push wave travels the
full corridor length once (event, not loop). All cadence quantities from the kernel:
clear rate, sweep angular velocity, clear events.

**(d) Palette.** The utility-teal lane family: banks `#39d0ff`, chevrons `#d7e6ff` with a
single white `#eaffff` pulse traveling them; leading-bank differential is +0.15 opacity, same
hue. Hostile/hazard corridors swap to `#ffb35c` (the FLYBY-vs-TETHER token swap, third time
this bible reuses it — hue swaps are cheap BECAUSE form does the work). The travel
infrastructure tokens (`vfx.js` `_travelPalette` default `{ primary '#39d0ff', secondary
'#d7e6ff' }`, used for gate approach/corridor continuity) are deliberately echoed: a clearing
field is the same family of truth as a travel lane — directed, infrastructural, teal.

**(e) Reduced-motion / reduced-flash.** Reduced-motion: chevron pulse freezes (static lit
chevrons, still pointing); filaments become static lane dashes; leading/trailing differential
persists (it is pose); clear events become a single downstream opacity step per bank segment,
sequenced mouth→exit over 300 ms (sequenced *steps*, not a wave). Reduced-flash:
REDUCED_FLASH profile on the clear wave and event lights. **Preserved:** chevron point,
mouth/exit asymmetry, flow direction, clear timing.

**(f) Grey-read.** Two banks + interior lane (never a single line); chevron pointing; flared
mouth vs faded exit; dashes inside the lane. In grayscale it cannot be confused with the
Intake (radial), the Plow (radial), or a beam (no banks).

**(g) Three.js implementation.** Banks: two thin `createMasslineRibbonMaterial` strips (the
`_initTetherCable` band construction, `vfx.js:2715`, is the direct ancestor) with chevron
`InstancedMesh` overlays (cone idiom from `buildMassSeed`); filaments: trail-streak pool;
push wave: one sequenced set of `SPR_FLASH` at bank points, event-driven. The whole corridor
is one articulated group driven from the kernel's corridor transform — repositioned, never
rebuilt, per tick (no per-frame allocation; scratch objects per `vfx.js` conventions).
Closest existing implementation: the tether cable + travel-vector wake
(`vfx.js:2036` `_spawnTravelVectorWake` — rows of particles laid along a direction) and the
`travel.corridor.continuity` cue (`vfx.js:1964`, three rings laid along the direction —
this bible replaces *that* ring idiom with banks for persistent corridors; the cue itself is
a one-shot and stays).

**(h) Rejection conditions.**
1. Reads as a beam (single source→target line, no banks) → reject.
2. Reads as a ring or arc segment → reject.
3. Chevrons pointing against filament flow → reject (direction contradiction).
4. No mouth/exit asymmetry (uniform tube) → reject.
5. Banks at full opacity past the exit fade zone, or corridor with no visible end → reject
   (boundedness is a PQ-012 requirement: "bounded … fields").
6. Traveling pulse present while the field is dormant → reject (law 2).

### 4.4 Field boundary truth (shared by all three)

The mission: all three fields have a FINITE radius gameplay depends on; the boundary must be
readable without a HUD circle.

**The doctrine — the boundary is drawn by behavior:**
- **Intake:** the rim pips (gapped shards) + the sudden birth of filaments at the rim.
  Inside R: flow exists. Outside: undisturbed space. The pip ring is where the machine ends.
- **Plow:** the berm — heaped matter at exactly R, lobed and standing. The pile is the wall.
- **Sluice:** the banks themselves, with the exit fade as the length boundary.
- **All three:** the commitment margin (outer 15% of R) thins/shortens/slows every flow
  element; and the engagement tell articulates the 2–3 nearest boundary elements toward any
  entity the kernel reports as affected.

**Falloff communication.** Falloff is drawn as *gradient of effort*, not as a transparency
ramp on a circle: filament density/lifetime/velocity scale with local field strength, so the
player sees the field *get weaker* toward the edge. Where the kernel publishes an exact
falloff exponent, the visual density curve mirrors it within ±10% — the picture must not lie
about the math (the Ring Gauge law from COMMAND_DECK §1.6: the arc *is* the number, and
gauges that lie about the sim value are forbidden).

**Dormant and denied states.** Dormant: frame deployed, flow off, boundary elements at ~0.3
opacity. Denied (kernel refuses activation — cooldown, obstruction, ownership): no world
effect at all beyond a one-beat frame shudder; the REASON is the HUD's job (§8), never a
world-space red flash.

**Palette discipline for boundary elements.** Boundary geometry (pips, berm lobes, banks,
chevrons) is ALWAYS non-blooming: ordinary color values, radiance ≤ 1.0, per law 6 and §3.3.
Only cores, capture/push events, and beacons may cross the bloom threshold. A boundary that
halos is a boundary that lies about where it is.

**Reduced-motion / reduced-flash for the boundary read.** Reduced-motion: the commitment
margin becomes a static two-step thinning (flow elements render at two densities — full
inside 0.85 R, sparse in the margin — instead of a continuous animated gradient); the
engagement tell becomes a HELD lean of the nearest elements (articulation pose kept, no
travel); dormant stays a static 0.3-opacity pose. Reduced-flash: nothing about the boundary
uses flash by construction — engagement articulation is pose + one opacity step, so
REDUCED_FLASH changes nothing structural; event pulses on the boundary (push wave reaching
the rim) scale per the profile (opacity ×0.3, min life 0.1 s).

**Grey-read for the boundary.** The boundary survives desaturation by construction: it is
made of geometry presence/absence (pips vs empty space, berm vs no berm, banks vs open
field), opacity steps, and flow thinning — zero hue channels.

**Rejection conditions.**
1. A HUD circle/ring UI element as the primary radius read → reject (the brief's explicit
   ban: "without a HUD circle").
2. Any continuous unbroken line as the boundary → reject (reads as UI, not machine).
3. Boundary elements at full opacity on a dormant field → reject.
4. Commitment margin <10% or >25% of R → reject (cliff / mush).
5. Visual density curve contradicting the kernel falloff by inspection (thin core, dense rim
   on an inverse-square-ish field) → reject.
6. Engagement tell present with no affected entity → reject (state-driven or nothing).

---

## 5. Industrial beam contexts (PQ-016) — one device, four truthful behaviors

PQ-016 (`program-queue.json:933`): "Make the industrial beam cut, extract, repair, or transfer
according to truthful target components and physical payloads." Sources:
`design/ASTEROID_OPS_VISION.md` (law 7: persistence is physical; the mining laser never
collects refined goods; Transfer Beam lands in Wave 4) and BUILD_PLAN_CORRECTED STEP 10/12.

**The doctrine — the beam is a tool with a hand, a tip, and the work it leaves.** Four
contexts share one beam body (one device) but differ in three legible channels: **source
posture** (how the ship holds the tool), **contact behavior** (what the tip does to the
material), and **material response** (what the target does back — chips, melt, seam closure,
fill). FORBIDDEN by the brief and now by law: one generic mining animation recolored four
ways; a colored circle or bloom blob at the contact point.

**The shared beam body.** Extend the shipped mining beam (`vfx.js:2517` `_initMiningBeam`:
flat ribbon quad + wider glow underlay, additive, ore-tinted) by graduating its core to the
`createMasslineRibbonMaterial` family so all four contexts share the aAlong pulse idiom and
pulse direction reads flow direction: **extract** pulses travel target→ship; **transfer**
source→destination; **cut** has no travel pulse (a taut, thin, steady filament); **repair**
emits one slow pulse per stitch. The combat-beam pool's two-layer construction
(`persistentBeams.js`: normal-blend core "a sustained connection needs a stable energy
filament even against true black space", additive sheath at 2.8× width) is the structural
precedent for a beam that must read at 1× without depending on bloom.

### 5.1 CUT — "the Kerf"

- **Source posture:** braced and weapon-adjacent. The beam is held taut, THIN (≤0.5× extract
  width), perfectly straight, ship squared to the work face. No bow, no feed sag.
- **Contact behavior:** a hot white point that travels *along* the surface at cut speed,
  leaving a **persistent glowing kerf line** behind it that cools white → blue-white → dark
  over ~2 s. The kerf is geometry (a trail-streak laid along the cut path), not a sprite —
  the rail family's penetration-streak precedent (`vfx.js:1547`: "Rail contact leaves a
  narrow axial cut fixed at the contact").
- **Material response:** spall flakes thrown from the *far* side of the cut (small trail
  streaks, 2–4 per cut event, seeded directions); when the cut completes, the severed segment
  drifts free (sim owns the separation; the kerf's cooling gradient marks where it happened).
- **Palette:** tip `#fffaf0` white-hot (event light, peak scaled by profile), kerf
  `#c0c8d0 → #70808a` (titanium/cool-metal tokens from the kinetic impact family).
- **Grey-read:** the thin straight beam, the bright moving point, the persistent dark-edged
  line cooling behind it. A cut leaves *evidence* — that is its identity.

### 5.2 EXTRACT — "the Pit"

- **Source posture:** loose and feeding. Beam thicker (1.0×, the shipped mining width), a
  slight bow allowed (the tether's slack-bow DNA, `vfx.js:2653`), contact wanders subtly
  within the work pocket (seeded drift, ±0.5 wu — deterministic per §9).
- **Contact behavior:** the churning **molten pit** — formalize the shipped
  `_onMiningTick` (`vfx.js:3734`): hot white→ore sparks fanning away from the face
  (12–22 per tick, burst-scaled), slow embers, ore-chip chunks, contact flash, ore-tinted
  event light. This is the shipped vocabulary, kept and named.
- **Material response:** the pit's glow *cools as the pocket depletes* — a state-driven
  depletion read (kernel reports remaining yield fraction; pit flash opacity and spark count
  scale with it). Depletion is the information; a pit that glows identically on a spent rock
  is a lie (COMMAND_DECK: effects bound to real state or nothing).
- **Palette:** `oreColor(target)` per the shipped map; embers `#ffb040 → #401800` (shipped).
- **Grey-read:** the thick bowed beam, the fan of ejecta *away* from the face, the churning
  bright pit. Extract is the only context with heavy ejecta — presence of spray IS the read.

### 5.3 REPAIR — "the Stitch"

- **Source posture:** close and slow. Beam short, held nearly perpendicular to the seam, tip
  dwelling at each weld point before stepping — a darning motion, not a sweeping one.
- **Contact behavior:** a traveling **stitch row** — small weld points appearing in sequence
  along the repair seam, each a brief hot spot that joins a line of cooling predecessors
  (instanced weld beads, the faction-language `weld_seam`/`wear_weld_ring` DNA from
  FACTION_SURFACE_LANGUAGE's kit families and repair practices). Cadence: one weld point per
  kernel repair tick; the row grows at the truthful repair rate.
- **Material response:** the seam closes behind the tip — a cooling gradient from hot
  (just-welded) to the target's hull tone, honoring the target's faction repair practice
  where one exists (FACTION_SURFACE_LANGUAGE §8 per faction: a Drift hull gets a proud riveted
  seam read, a Concord hull a near-invisible flush seam — same stitch behavior, authored
  finish per faction profile). **NO ejecta.** Repair adds material; the absence of spray is
  the tell against extract.
- **Palette:** weld point `#ffc35c → #ffb35c` (Mass Seed warning amber family), cooling
  toward hull tone; no event light beyond a single low peak per stitch (0.5× cut's).
- **Grey-read:** short perpendicular beam, the stepped dwell, the growing dotted line, no
  spray. Stitch vs kerf in grayscale: kerf is a continuous cooling cut with far-side spall;
  stitch is a dashed accumulating line with none.

### 5.4 TRANSFER — "the Conduit"

- **Source posture:** taut and level. The beam is a *pipe*, not a tool: constant width,
  straight, with a collar flare at both endpoints (the payload collar idiom,
  `buildPayload` `0xd7862c` torus collars, `visualFactory.js:3222`).
- **Contact behavior:** no tip work at all — instead, **pulses of content travel the
  conduit** in the transfer direction (massline ribbon `uPulseSpeed` mapped to transfer
  rate; pulse density ∝ live throughput). The destination end has a **port gauge**: a
  port-shaped frame (chevron-ring, not a circle) that fills as the receiver fills — the Ring
  Gauge law (the arc is the number) in frame-device form.
- **Material response:** the SOURCE visibly depletes (its pit/glow/payload shade cools per
  §5.2's depletion rule) while the destination's port gauge fills; both ends are truthful
  because the kernel owns both inventories (single-writer contract: cargo owner settles, per
  ASTEROID_OPS law 5/7 — aggregates and physical ports, never item teleport).
- **Palette:** conduit base `#39d0ff`; content pulses tinted by `oreColor(commodity)`; port
  gauge `#d7e6ff` frame, fill in content tint.
- **Grey-read:** constant-width level conduit, collars at both ends, one-way pulse traffic, a
  filling port frame. Direction is carried by pulse travel AND by which end depletes — two
  channels, both hue-free.

### Reduced-motion / reduced-flash (beam family, all four contexts)

- **Reduced-motion:** the beam body holds steady (no flicker — the shipped mining beam's
  `Math.sin` opacity/width pulses are cosmetic-only and are the first things suppressed);
  cut's kerf appears as a static cooling line behind a dwelling tip (tip travel is sim-truth
  and stays, since the cut position IS gameplay); extract's pit holds its churn texture
  without spray *velocity* variation (sparks spawn but inherit no random-speed spread —
  count still scales with depletion); repair's stitch row accumulates identically (it is
  state, not motion); transfer's conduit pulses become static dashes that still point.
  Preserved in every context: posture, contact geometry, material response, direction.
- **Reduced-flash:** `applyFlashAccessibility` on every flash-class element (cut tip,
  pit contact flash, weld points) via the shipped REDUCED_FLASH profile (opacity ×0.3,
  size ×0.68, min life 0.1 s, event light ×0.24); the kerf/stitch accumulation reads are
  untouched because they are persistent geometry, not flash. The four contexts remain
  distinguishable with flash flattened because their identity lives in geometry and
  response, not in burst brightness.

### Beam-family rejection conditions (mechanical)

1. The same contact sprite/particle arrangement recolored across two contexts → reject
   (contact geometry must differ: kerf line / molten pit / stitch row / port gauge).
2. A circular sprite, ring, or bloom blob at any contact point → reject (the brief's ban,
   made mechanical).
3. Extract with no ejecta, or repair WITH ejecta → reject (material-response inversion).
4. Cut without a persistent kerf (no evidence left) → reject.
5. Transfer pulses traveling toward the source, or both ends filling → reject.
6. Depletion/fill visuals not driven by the kernel's inventory values → reject (lies).
7. Beam core dependent on bloom for visibility at 1× (kill bloom in review: core must
   survive, per the persistentBeams normal-blend-core precedent) → reject.

---

## 6. Payload language — mass, ownership, destination in transit

PQ-016 payloads are physical (ASTEROID_OPS law 7: "no output without a cargo interface";
courier pods are shipped). **The physical metaphor is freight, not magic:** a payload in
transit is a shipped crate on a lane — it has heft, an owner, and a consignee, and all three
are painted on the crate, not in a tooltip. The shipped canister (`buildPayload`,
`visualFactory.js:3208`: cylinder + two collar toroids + octahedral transponder,
`visualLanguage = 'sealed-cargo-canister'`) is the base body. In transit it must answer
three questions at 1×:

**MASS — read by geometry and wake.**
- Canister scale already tracks entity radius (`g.scale.setScalar(R)`); preserve and exploit
  it: heavy payloads are SINGLE large canisters, light shipments are clusters of 2–4 small
  ones (count is a mass read).
- The **mass shadow**: a short dense wake (trail-streak pool, low opacity, desaturated) whose
  length ∝ payload momentum (mass × speed, read from the entity each frame). Heavy things
  drag longer shadows. This is D7 applied to cargo: velocity and inertia carried by the
  world's behavior, not a number.

**OWNERSHIP — read by collar + transponder state.**
- Transponder hue = owner faction accent/emissive token (`src/data/palettes.js`
  FACTION_PALETTES carry `accent`/`emissive`/`thruster` per faction — e.g. Concord
  `emissive '#3A78FF'`, Drift `'#C9772E'`). Player-owned = cyan `#8eeaff` (shipped
  transponder default).
- Redundancy beyond hue: collar count/style by owner class (player/HAZARD-free carrier = two
  collars, the shipped build; faction courier = one collar + faction tint; derelict/unowned =
  NO transponder emission and dark collars — "cold cargo," readable as loot-or-trap at a
  glance). Lit vs unlit transponder is the grayscale ownership channel.

**DESTINATION — read by the thread.**
- A thin **destination thread** (1–2 px at 1×) from payload to its receiver, present ONLY
  while a delivery contract is live: a narrow `createMasslineRibbonMaterial` strip with the
  shipped marching-pulse idiom traveling TOWARD the destination (the Route Beam law from
  COMMAND_DECK §1.8: beams only where flow is real and active; a plotted-but-inactive route
  is a static dashed line — here, no route, no thread at all).
- The thread exists to pair payload with receiver in a crowded field; it attaches to the port
  gauge (§5.4) at the receiving end. No receiver → no thread → the payload reads as adrift.

**Motion grammar.** Only three things move, all sim-driven: the canister itself (physics
owns it — ballistic drift, never cosmetic bobbing); the mass shadow, respawned at 20–30 Hz
with length recomputed from live momentum each frame (speed and mass from the entity — a
slowing heavy load's shadow shrinks as it brakes); and the thread's marching pulse, speed
∝ contract throughput where the receiver reports one, else a constant slow crawl. Nothing
else animates: no idle spin, no bob, no "look at me" shimmer — freight that performs is set
dressing, and law 2 rejects it.

**Palette anchors (all shipped tokens):** shell `0x46515a`, collar band `0xd7862c`,
transponder `0x8eeaff` / emissive `0x2abbd8` (the shipped `buildPayload` values); owner
tints from `FACTION_PALETTES` `accent`/`emissive` only; mass shadow desaturated `#70808a`
family (the cool-metal impact token), opacity ≤ 0.3, never blooming — freight does not glow.

**Reduced-motion/flash:** mass shadow static-length (still momentum-derived); thread pulse
frozen to static dashes that still point (dash taper toward destination); transponder never
strobes in either mode — ownership is a held state, not a blink.

**Grey-read:** size + wake length (mass); collar count + transponder lit/unlit (ownership);
thread existence + dash taper (destination). All three questions answerable with hue removed.

**Implementation:** extend `buildPayload` with per-instance collar variants and the mass
shadow (trail-streak pool entries recycled at 20–30 Hz); thread = one thin ribbon from the
massline family, updated with the tether-cable pattern (`_updateTetherCable`'s per-frame
endpoint write into preallocated buffers). Closest existing implementations: `buildPayload`
(body), `_initTetherCable` (thread), engine-trail relevance gating (`vfx.js:180-187`) for the
shadow's quality tiers.

**Rejection conditions.**
1. Payload with no size/mass or wake/momentum correlation → reject.
2. Ownership carried by hue alone (no lit/unlit + collar-structure redundancy) → reject.
3. Destination thread on a payload with no live receiver (decorative line) → reject.
4. Thread pulse traveling away from the destination → reject.
5. Transponder strobing as decoration (ownership is held state) → reject.

---

## 7. Planetary skim + reentry (PQ-013) — atmosphere language

PQ-013 (`program-queue.json:825`) binds one Atlas planet to physics, atmosphere, sling, skim
harvest, enemy reentry, recovery, persistence. The governing design text is
BUILD_PLAN_CORRECTED STEP 12 (SF-14): annular density bands (outer / working / storm /
reentry), yield = path × density through an explicit collector device, staged reentry
Skim→Commit→Breakup→Descent→Aftermath, healthy enemies often escape a marginal pass, player
recovery via emergency burn costing capacitor/heat/momentum, and the explicit forbidden list —
no invisible damage circle, no instant kill on radius crossing, no N64-tier plasma, no
teleport recovery.

**DNA rule:** everything here is the plume/energy strand scaled to planetary drama. The
planet already ships an additive atmosphere shell (`src/render/planetFactory.js`: the
ATMSHELL construction — "a transparent, slightly-larger sphere rendered additively OUTSIDE
the planet disk … backface-only so it forms a glowing ring"). The skim language hangs off that
shell; nothing introduces a second, unrelated atmosphere look.

### 7.1 The skim corridor — "the Bands"

- **Form.** The working altitude is an annular **shear layer** hugging the atmosphere shell:
  long, thin, fast flow streaks parallel to the limb (D7's band-1 "sparse fine motes" scaled
  to planetary size — normal-composited, thin, desaturated, *not* additive white lasers).
  Bands are distinguished by BEHAVIOR, concentric but never confused: **outer band** — thin,
  sparse streaks, low density; **working band** — dense long streaks plus visible **harvest
  motes**: bright flecks that drift from the streak field toward the collector device (yield
  = path × density made visible: motes are born at rate ∝ local density × collector speed
  through the band, and they flow to the collector's intake — a §4.1-style mini-funnel on the
  ship's collector); **storm band** — lobed, broken, rolling streak segments with gaps (the
  berm's lobed idiom, larger and meaner); **reentry band** — no streaks at all: a smooth,
  ominous brightening of the shell (the plasma onset zone, §7.2).
- **Boundaries.** Band edges are density/behavior steps in the streaking itself plus a hue
  step (below) — the same "behavior draws the boundary" law as §4.4, at planetary scale. No
  painted circles on the planet.
- **Palette.** Working band `#9fd8e8 → #d7e6ff` (ice/cool tokens — harvest reads as cold
  work); storm band `#ffb35c` broken by `#ff7040` lobes; reentry band the tether-hot ramp
  `#ffb35c → #ff5c5c` reserved strictly for plasma onset. The collector funnel is teal
  `#39d0ff` (utility, like all intake machines in this bible).
- **Grey-read:** streak density and lobing per band; harvest motes converging on the
  collector; the smooth glow of the reentry band vs the texture of the others.

### 7.2 Heat and plasma buildup — "the Sheath"

- **Form.** As the ship (or an enemy) works the lower bands, a **bow-shock sheath** forms
  AHEAD of the hull: the plume's hot mouth pushed out in front of the ship — a cone of
  `createPlumeMaterial` volume wrapping the velocity vector, starting as a thin teal
  ionization line at the nose, closing over the hull as heat builds. This is the plume DNA
  literally inverted (exhaust behind → compression ahead) and is why the effect reads as
  family instead of as a new gimmick.
- **State truth.** One sim heat scalar drives everything: hue runs the SHIPPED tether-load
  ramp (`#39d0ff → #ffb35c → #ff5c5c`, `vfx.js:2796-2798` — the player already knows this
  ramp from the massline), sheath coverage runs 0→full wrap, and `uBoost` on the plume
  material maps heat 0..1 (the material already ships a boost-driven heat gradient with
  white-hot mouth, `energyMaterials.js:300-305`). The heat read and the HUD heat arc (§8)
  show the same number (gauges must not lie).
- **Plasma.** Commit-level heat ignites plasma: the sheath becomes a two-layer plume volume
  (core+halo, `createPlumeVolume` construction) with ragged tongue breakup at its trailing
  edge — named techniques only (SF-14's "no N64-tier plasma"): fbm-driven flame body,
  fresnel shell, depth-soft intersection against the atmosphere shell, radiance 4–6 so it
  blooms like the thruster it descends from.

### 7.3 Enemy reentry consequence — "the Plunge" (staged)

Per SF-14: Skim → Commit → Breakup → Descent → Aftermath, with escape windows preserved.
Each stage is a distinct silhouette + state, never a recolor:

1. **Skim** — the ionization line appears at the enemy's nose; they can still pull out
   (healthy enemies often do — SF-14's counterplay rule). Read: a thin line + slight streak
   deflection around them.
2. **Commit** — the sheath closes over them, amber; escape still possible with a hard burn.
   Read: the sheath silhouette, unmistakable vs the line stage.
3. **Breakup** — white-hot; parts shed. Reuse the phased-explosion idiom
   (`src/render/combat/phasedExplosions.js`: the `breakup` phase's short hot seam cuts +
   displaced combustion pockets, scheduled by `EXPLOSION_SCHEDULES`) scaled down to a
   trailing sequence — pieces peel off along the descent path, deterministically patterned
   per §9.
4. **Descent** — a falling ember trail curving toward the limb (streaks + smoke residue,
   normal-blended so it reads as debris, not fireworks).
5. **Aftermath** — a brief storm-band disturbance at the plunge point (lobes kicked, then
   settling) + drifting residue. The band *remembers* for a few seconds, then the machine
   of the planet goes on.

### 7.4 Reduced-motion / reduced-flash / Grey-read

- **Reduced-flash (the hard case the mission names):** REDUCED_FLASH profile — sheath/plasma
  opacity ×0.3, size ×0.68; NO white-hot peak (cap at amber `#ffb35c`); parts-shed count
  halved; event light peaks ×0.24. **Preserved:** band boundaries, sheath coverage silhouette,
  the five stage silhouettes and their ORDER, harvest mote flow. The reentry read is carried
  by staging and shape, which flash reduction cannot remove.
- **Reduced-motion:** band streaks hold as a long-exposure static field (streak texture
  present, scroll frozen); sheath gradient held as a static nose-glow ramp; stage transitions
  as opacity steps; harvest motes as a static dotted drift path. Preserved: everything
  positional and staged. Lost: scroll and flicker only.
- **Grey-read:** band behavior (density/lobing), sheath cone silhouette + coverage, stage
  silhouettes (line → closed cone → shedding cone → ember trail → kicked lobes).

### 7.5 Implementation

- Band streaking: one annular ribbon per band with `createMasslineRibbonMaterial` (`aAlong`
  wraps the annulus; pulse = flow direction; `uTension` from band density), plus streak-pool
  motes for the harvest drift. Keep the planet's additive shell untouched; bands render just
  outside it (renderOrder above the shell, depth-test on — the energy strand's depth-soft
  path, `bindEnergyDepth`, exists for exactly this).
- Sheath: cone/open-cone geometry + `createPlumeMaterial`, `uBoost` = sim heat, time from the
  vfx `_t` accumulator; two-layer via `createPlumeVolume` when plasma ignites.
- Stages: a `PhasedExplosionLifecycle`-style scheduler (the shipped class is the precedent —
  bounded capacity, phase events, deterministic layout) for Breakup parts; Descent via streak
  + smoke buckets.
- Collector funnel: a scaled §4.1 Intake (3 vanes, tight funnel) mounted on the ship's
  collector, motes flowing into it — family reuse, not a bespoke effect.
- **Acceptance evidence** required by SF-14 includes browser+Electron captures near and far;
  add this bible's §2 four-capture protocol (1×, desaturated, reduced-flash, reduced-motion).

### 7.6 Rejection conditions

1. Any instant consequence on a radius crossing (damage circle behavior) → reject (SF-14
   forbidden #2/#3; stages with escape windows or nothing).
2. Plasma as a colored sphere, sprite blob, or bloom disc → reject (SF-14 forbidden #5;
   sheath must be a plume-family volume with breakup structure).
3. Skim/reentry materials NOT from the energy/plume strand → reject (orphan effect; law 1).
4. Harvest yield with no visible mote flow toward the collector → reject (yield is path ×
   density; the picture must show the path).
5. Heat hue ramp inconsistent with the tether ramp (player must relearn the scale) → reject.
6. A stage that is only a recolor of the previous stage → reject (silhouette per stage).
7. Recovery via visual teleport/fade → reject (SF-14 forbidden #7: emergency burn is the
   only sanctioned look — a visible, costly, plume-flared burn).

---

## 8. HUD companions — the minimal non-diegetic state language

The HUD's job is ONLY what world-space form cannot carry: **exact numbers, denial reasons,
and expiry.** Everything positional, directional, and staged stays in the world. The standing
constraints: non-diegetic surfaces (no cockpit/visor/helmet framing — root AGENTS.md §6, the
permanent HUD contract), the three-anchor layout (`design/revamp/HUD_THREE_ANCHOR.md`:
bottom-left vitals + contextual column, bottom-center action bar + transient chips,
bottom-right tactical stack, top-center one-voice), the appear-then-fade contextual chip
idiom (`chipShow(key, 4000)` precedent), and the D5 velocity-tape ruling
(`design/program/atlas/01_DECISIONS.md` D5 Amendment 2 — the binding precedent for this
section: *a contextual instrument reveals only while its information is load-bearing, fades
back out completely, and `motionReduce` suppresses the animation without suppressing the
information*).

### 8.1 Fields — a contextual chip, not a panel

- **Where:** bottom-center cluster, the established transient-chip socket (cargo/credits/role
  chips already live there).
- **What:** field-kind glyph + state word + the ONE number that matters: `"INTAKE — ARMED"`,
  `"PLOW — ENGAGED"`, `"SLUICE — SWEEPING"`, or the denial reason in words: `"INTAKE DENIED
  — COOLDOWN 4s"`, `"PLOW DENIED — OBSTRUCTED"`. Denial reasons are text because the world
  cannot say *why*; the Mass Seed pill (`massSeedHud.js`: `"Mass seed recharging — 7s"`) is
  the exact precedent, including its cooldown/warning styling classes.
- **When:** appears on deploy/engage/deny, holds while the field is active, fades completely
  on expiry (the tape ruling). No persistent field panel, ever.

### 8.2 Beam — a context pill with a fill arc

- **What:** the context word (`CUT` / `EXTRACT` / `REPAIR` / `TRANSFER`) + target name +
  a small fill arc showing the truthful progress quantity (pocket depletion for extract,
  repair completion for repair, transfer fraction for transfer, cut completion for cut) —
  COMMAND_DECK §1.6 Ring Gauge DNA: the arc IS the number; it snaps to sim truth, never
  eased past it by >100 ms (the input-answer law).
- **When:** appears on beam start, fades on beam stop. Same chip socket as fields — one
  socket, one active tool readout at a time (one-voice discipline).

### 8.3 Skim / reentry — a band pill + heat arc + the escape cue

- **Band pill:** names the CURRENT BAND in words — `"WORKING BAND"`, `"STORM BAND"`,
  `"REENTRY BAND — COMMIT WINDOW"` — bottom-center chip, appear/fade with band occupancy.
  The world shows the band's texture; the pill disambiguates the exact band for players who
  can't yet read the texture. (Training-wheels surface: it may be suppressed by a settings
  flag once the player disables assist readouts — but it ships on.)
- **Heat arc:** one continuous arc on the existing status cluster (not a fourth anchor),
  showing the same sim heat scalar the sheath shows (§7.2 — the two never disagree).
- **The escape/commit cue:** at reentry Commit, a one-voice line (`"BURN NOW OR BREAK UP"`)
  through the top-center channel — the D5 arrival "BRAKE NOW" precedent applied to the
  plunge. It fires once per commit, routes through the attention arbiter, and never repeats.

### 8.4 HUD rejection conditions

1. Any new permanent panel or fourth anchor → reject (D9.9: progressive disclosure is the
   remedy, not more panels).
2. Cockpit/visor/helmet framing, screen-edge arcs, pilot avatars → reject (root contract).
3. A number that could be an arc, or an arc that lies about the sim value (>100 ms stale,
   eased past truth) → reject (COMMAND_DECK §5/§1.6).
4. HUD restating position/direction/stage that the world already shows (a boundary circle, a
   minimap dot, a "plasma warning" while the sheath is visibly closed) → reject — duplicate
   read; "every system speaks once."
5. An instrument that reveals and then STAYS → reject (the tape ruling: fade completely).
6. Denial with no reason text (a bare buzz) → reject; the reason is the HUD's whole job.
7. `motionReduce` suppressing the *information* along with the animation → reject (the D5
   amendment's explicit clause).

---

## 9. Determinism contract

The mission's hard rule: anything animated must be specifiable from seed/simTime; no wall
clock, no unseeded randomness. How that binds each layer, with the shipped idioms to reuse:

- **Sim truth (fields/beam/skim state):** all gameplay-readable state comes from the kernel
  systems, which run on `state.rng` / `state.simTime` per the root architecture contract
  (root AGENTS.md §2/§6; the Mass Seed's travel path is the model: "a pure function of
  (deployedAt, spawnPos, dir, travelSpeed, travelTimeS) evaluated against state.simTime. No
  rng, no wall clock, no accumulation drift" — `src/systems/massSeed.js:21-23`).
- **Presentation variation (this bible's layouts):** jitter on filament spawn slots, berm
  lobe arrangement, vane phase offsets, mote scatter, and breakup part shedding use the
  **integer-hash pattern idiom** shipped for explosions: `explosionPattern01(serial, phase,
  index, channel)` / `explosionPatternSigned` (`src/render/combat/phasedExplosions.js:35-47`
  — a mix32 integer hash, allocation-free, repeatable per event serial, "presentation-only
  and deliberately does not consume simulation RNG"). Field effects hash `(fieldId, element,
  channel)` the same way. **No `Math.random()` in any new emitter on these lanes.** (vfx.js
  may use Math.random for legacy cosmetic bursts per its module contract; the field/beam/
  skim/payload work in this bible is gameplay-readable presentation and holds the stricter
  line.)
- **Time:** gameplay-visible phase (deploy eases, stage schedules, corridor sweeps, heat
  ramps) derives from sim-published timestamps (simTime/tick deadlines — the doctrine-tell
  precedent: "state.tick / startTick / deadlineTick (pause/tab render dt must not consume
  the pre-consequence window)", `vfx.js:192-193`). Purely cosmetic scroll (fbm flow, churn)
  may use the vfx frame accumulator `_t` exactly as the shipped energy materials do
  (`updateEnergyMaterial` with `time: this._t`, `vfx.js:4570`), because it encodes no
  gameplay information.
- **Deterministic replay evidence:** PQ-012/013/016 all carry `npm run check:sim:compare`
  gates (`program-queue.json` checks arrays); presentation variation via the pattern idiom
  keeps capture-stable silhouettes across runs, which is what makes this bible's §2 review
  captures reviewable at all.

**Rejection conditions (determinism).**
1. Any `Math.random()` in a new field/beam/skim/payload emitter → reject; hash via the
   pattern idiom.
2. Any gameplay-readable phase or schedule driven by `performance.now()` / wall clock →
   reject (cosmetic `_t` scroll exempt, per above).
3. Any presentation draw on `state.rng` (the sim stream) → reject; the pattern idiom exists
   precisely so presentation never consumes sim entropy.

---

## 10. Performance contract

Budgets here are **telemetry-derived or shipped constants**, per law 9 and PERF_BUDGET
(VFX owns 2.5 ms of the 16.7 ms frame; p95/p99/hitch gates, not average FPS).

- **Pooling and allocation.** Everything lives in the §1 pool strand or new bounded pools
  built on the same patterns: SoA state, free-stack allocation, slot recycling, scratch
  objects, zero per-frame allocation in update loops (the `vfx.js` `_spawnParticle` /
  `_syncParticleQuality` patterns; `persistentBeams.js`: "Slots are rewritten in place; no
  objects or typed arrays are allocated by update()").
- **Instancing.** Vanes/ribs/chevrons/berm lobes/pips/stitch beads: `InstancedMesh` or the
  shipped instanced streak/sprite pools. Per-field draw calls budget: ≤6 (frame, filaments,
  boundary, core volume ×2, event flash reuse) — the tether cable ships 6 roots
  (mesh/glow/band/anchor/anchorCore/targetHalo) and is the structural ceiling precedent.
- **Cadence gating.** Subsystem Hz pattern from `vfx.js`: seam markers 20 Hz, ribbon trails
  30 Hz, energy plume 30 Hz, projectile trails 45 Hz, plus relevance sleep ("slept when
  inactive"). Field/beam/skim subsystems adopt: boundary articulation 20 Hz, filaments
  30 Hz, HUD chips event-driven (DOM updates only on text/state change, the `massSeedHud`
  `_lastPillText` guard pattern). Inactive fields sleep (dormant pose, zero particle emit).
- **Counts.** Particle/sprite counts per effect derive from the shipped caps
  (PARTICLE_CAP 1500/3000/4000 by `particleQuality`, SPRITE_CAP 256, TRAIL_STREAK_CAP 96,
  QUALITY_BURST 0.55/0.8/1.0 scaling) — new effects budget as *shares* of those pools
  (e.g. a field's filaments ≤ 1/8 of the streak pool) and must state their share in the
  implementing system's `inspect()` (the `vfx.inspect()` precedent: liveParticles,
  subsystems.lastFrame counters). If a share is exceeded in telemetry, the implementing
  packet shrinks the share — quality scales by pool share and relevance tier (the
  engine-trail TRAIL_TIER gating, `vfx.js:180-187`), never by deleting the effect's
  identifying geometry.
- **Bloom discipline.** Non-blooming boundary materials keep the pyramid cheap; event
  flashes are brief and pooled; no new fullscreen passes are introduced anywhere in this
  bible.
- **Lights.** `EVENT_LIGHT_POOL_SIZE = 6` is a shader cache key (vfx.js:80-84); field/beam
  events scale peak intensity via the accessibility profile and never request additional
  lights.

**Rejection conditions (performance).**
1. Any per-frame allocation in an update path (new arrays/objects/THREE temporaries) →
   reject.
2. A field effect that keeps emitting while dormant or offscreen-relevance-gated → reject
   (sleep pattern violation).
3. Per-field draw calls > 6 without a measured justification recorded in the packet →
   reject.
4. Pool shares unstated in `inspect()` or exceeded in telemetry → reject.
5. Any new visible light beyond the event-light pool → reject (shader recompile invariant).

---

## 11. Global review checklist (apply mechanically, in order)

1. Name it in one noun phrase from a 1× capture (§2 rule 4). Fail → stop.
2. Grey-read: identity survives desaturation (each §'s Grey-read line). Fail → stop.
3. Direction truth: flow/pulse/travel direction matches the sim quantity it pictures
   (inward converges, outward diverges, corridor has a current, transfer goes one way,
   thread points at the receiver). Fail → stop.
4. State truth: every pulse/flash/wave maps to a named sim event; nothing loops at rest.
   Fail → stop.
5. Boundary truth: radius/falloff readable with no HUD circle; margin 10–25% of R; boundary
   never blooms. Fail → stop.
6. Accessibility: reduced-motion keeps pose/stage/direction; reduced-flash keeps staging and
   silhouettes (opacity/size/light scaled per `vfxAccessibility.js` profiles). Fail → stop.
7. Determinism: pattern-idiom variation, simTime/tick schedules, no Math.random, no wall
   clock, no state.rng in presentation. Fail → stop.
8. Performance: pools/shares/cadence declared in `inspect()`, ≤6 draws per field, sleep when
   dormant. Fail → stop.
9. Palette: anchors from §3.2 only; gradient direction correct per effect; survives both
   `uGrade 0` sector lighting and the optional grade. Fail → stop.
10. Family: built from the §1 strands; no orphan vocabulary; Mass Seed read as kin, not as
    coincidence. Fail → stop.

*(End of bible. The report alongside this file — `REPORT.md` at the worktree root — audits
this document against its own rejection conditions.)*
