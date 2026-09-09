<!-- LIFETIME: STABLE -->
# Physical Play — Technical Build Plan

**Status: BUILD PROPOSAL, NOT ADMITTED WORK.** This document converts
[`PHYSICAL_PLAY_GRAMMAR.md`](./PHYSICAL_PLAY_GRAMMAR.md) into an implementable order of operations. It
records what already exists, what actively contradicts the design, what foundational pieces are
missing, and the sequence that reaches the outcome with the fewest blocked packets.

Nothing here is committed scope until the lead assigns roadmap IDs. Companion document:
`PHYSICAL_PLAY_GRAMMAR.md` owns *what the game should do*; this file owns *what it costs and in what
order*.

Derived from a source audit at 2026-07-26. Every claim below is anchored to `file:line`; re-verify
before acting on any single row, and correct this file in the same pass if a claim has aged.

---

## 0.0 The quality bar

The owner's standard, in their words: **this game should be worth what a $30 Steam game is worth.**

That is a statement about *quality*, and it has been misread before. It does **not** mean build for the
Steam Deck — there is no Deck, and platform-specific work for one is wasted effort. It does not mean
build a store page. It means:

- **Do not accept a browser-game standard for anything.** The failure mode this bar exists to prevent
  is an agent producing something that technically satisfies a checklist and is visibly cheap.
- **Do not leave a step half-finished and move on.** Once an item is checked off, finding where the
  laziness crept in becomes exponentially harder — the receipt says done, the queue says integrated,
  and the defect is now buried under later work. **Finishing properly the first time is the cheapest
  path**, not the slow one.
- **Inference is available. Use it.** Depth of work is not the constraint here. If a task deserves
  three reviewers, a rebuilt asset, or an hour of play-testing, spend it. Shipping a mediocre version
  to save tokens is a false economy against a bar this high.

This is a personal project that may become open source or may be sold — that is undecided and does not
change the bar. Build it as though someone is going to pay for it, because the alternative is
rebuilding it later.

## 0. The headline finding

**Most of the first phase is wiring, not building.** The audit found four significant systems that are
fully written, tested in isolation, and called by nothing:

| System | Location | Callers |
|---|---|---|
| Massline acquisition preview (producer) | `src/systems/tetherGameplay.js:282-314` | **0** |
| Massline acquisition preview (HUD renderer) | `src/ui/masslineHud.js:175-227` | **0** |
| Previewed-candidate latch | `src/systems/tetherGameplay.js:316-341` | **0** |
| Massline-aware auto-target | `src/combat/autoTargetMode.js:265-304` | **0** |
| Fitting-feel panels (mass delta, handling profile, module risk) | `src/ui/panels/*.js` | check scripts only |

The single most-cited complaint about the game — that the Massline grabs the wrong thing — is caused
by the live latch path being **nearest-body-by-distance** (`tetherGameplay.js:343-384`) while a
swing-aware contextual scorer with a stability layer sits unused beside it
(`src/combat/masslineTargetScoring.js`). Plan the first phase around connection, not construction.

---

## 1. Seam map: what exists vs. what must be built

### 1.1 The state layer — ~70% built

**Exists.** `src/combat/statuses.js` is a complete deterministic status service: `schedule`/`advance`/
`clear` (`:6-95`), duration, four stacking modes (`:103-132`), periodic damage packets (`:62-86`),
immunity tags (`:9-17`), and — critically — **`interactions[]` with `consumeWith`/`apply`**
(`:151-166`), which is exactly the §2.4 cascade primitive. Definitions are pure data
(`src/data/combatDefs.js:117-157`). It ticks once per sim tick inside `actions.update` → `kernel.prePhysics`
(`src/combat/kernel.js:108-119`). Save round-trip already exists (`src/combat/persistence.js:267-309`).

**Missing.**

| Gap | Detail |
|---|---|
| Effect vocabulary is closed | `applyEffects` understands only `capabilities`, three named `multipliers`, and `blockedActionTags` (`src/combat/subsystems.js:55-62`). Pinned (effective mass), Unmoored (inverse mass), Primed (detonate-on-contact), and Snarled (N-body coupling) have no expressible effect kind, and all four need writes behind the SG-02 physics membrane (`src/core/physicsAuthority.js`). |
| NPC persistence | `src/combat/persistence.js:39-50, :56-57` builds refs only for the player and `flags.persistent` entities. Ordinary NPC statuses are dropped on save. |
| Determinism coverage | `src/core/simSnapshot.js:47-49` collapses `state.combat` to a beam count, so statuses are invisible to the replay hash. Free to change — and unprotected. |
| AI perception | Sensor frames expose `disabled`/`tethered`/`tags` (`src/systems/aiPorts.js:625, :718`) but not the status map. |
| Duplicate Spinning | `entity.data.tumble` (`src/systems/tumbleStates.js:141-143`) and `status_tumbling` (`combatDefs.js:118-126`) are the same fact stored twice, resynced by hand at `tumbleStates.js:177-181`, with three external readers. |

**Ordering constraint.** Derivation (Spinning from `angVel`, Breached from hull) must run **after
`physics` (slot 35) and before `combat` (36)**. Enforcement (Drifting zeroing thrust) must run **after
`aiPorts` (23) and before `weapons` (26)**, where `tumbleStates` (24) already sits. Those are two
different slots in `src/runtime/authoritativeSystemManifest.js:59-78`, so a layer that both derives
and enforces needs two systems or accepts a one-tick lag. Manifest lengths are asserted at
`test/authoritative-manifest.test.mjs:26-27`.

### 1.2 Presentation — the seam exists and is proven

**3D pose.** `e.pitch` is the exact precedent: a **render-owned** field written by
`src/render/renderer.js:2028-2054`, snapshotted for interpolation (`src/core/coreSystem.js:90`), and
**not in the save whitelist**. The mesh rig is already two-level — root takes yaw and position, the
inner `userData.hull` group takes roll and pitch (`renderer.js:1716-1731`) — and that group exists on
every ship path. The camera is already tilted 60° (`src/core/gameState.js:109`).

> Do **not** reuse `e.bank` for cosmetic roll. It is simulation-owned (`src/systems/flightV3.js:1108-1115`)
> and serialized (`src/save/saveSystem.js:58-59`).

**Off-plane is one line.** `renderer.js:1718` hard-pins `m.position.y = 0` every frame (also `:1557`,
`:1593` on build). That single pin gates tumbling drift, explosion displacement, and settled wrecks.

**Follow-on repairs required if off-plane lands.** `src/render/lod.js:45` forces `_v.set(pos.x, 0, pos.z)`
and discards Y, so off-plane entities get wrong LOD distance; `renderer.js:100` composes every contact
shadow with a constant flat `CONTACT_SHADOW_QUAT`, so a tumbling ship keeps an axis-aligned shadow.
Latent bug worth fixing en route: `src/render/partsLibrary.js:1839` carries only `rotation.x` across an
authored asset swap, so pitch snaps to zero on upgrade.

**Neon is an authoring problem, not a capability problem.** HDR is already end-to-end: ACES filmic tone
mapping (`renderer.js:702`), half-float targets (`src/render/bloom.js:486, :493`), a composite that
tonemaps *before* adding bloom (`bloom.js:395-401` — which is precisely the white-core /
saturated-halo behavior §9.2 asks for), shader-driven HDR energy volumes at intensity 2.4–6.5
(`src/render/energy/energyMaterials.js`), anisotropic sprite stretch already in the instanced pool
(`src/render/vfx.js:1014, :1047`, applied `:6539`), and particle `aTrailAxis`/`aTrailStretch`.

The work is retuning the ~35 hand-written handlers at `vfx.js:831-877` and lifting one ceiling:
`_bloomRadianceScale` (`vfx.js:5088-5095`) clamps energy radiance to `strength/0.35` in `[0,1]`, so
raising bloom strength past 0.35 buys nothing, and turning bloom off kills all energy radiance.

**State visuals bind at `renderer.js:1758-1766`**, an existing per-entity closure dispatch table.
`src/render/ships/shipDamage.js` is a working 5-state → reversible-visual driver attached from
`ships/shipKit.js:674` — clone it. To stay inside the frame-sleep invariant
(`scripts/check-vfx-frame-sleep.mjs:86-98`, which asserts seven named subsystem counters are exactly 0
when idle), gate persistent visuals behind a relevance check plus `_consumeCadence` with an explicit
`_sleep*()`, and **do not route them through `_updateEnergy`** — `sub.energy` is one of the seven.

**Screen-space refraction.** `src/render/post/spaceRenderGraph.js` already resolves scene colour,
depth, and normals into sampleable targets with getters (`:317-319`) and a reusable fullscreen quad
(`:468-472`), so a gravitic distortion pass is one render target and one quad. It is opt-in and
default-off (`gameState.js:15` `renderGraph: false`). Do not try to reinstate
`MeshPhysicalMaterial.transmission` — `src/render/canopyMaterialPolicy.js:10-12, :52` removed it
deliberately because it forces a second opaque scene pass.

### 1.3 Swarm — blocked by fixed-size pools, not by AI or physics

| Wall | Value | Location |
|---|---|---|
| Thruster VFX fleet | `FLEET_MAX_SHIPS = 10`, **fixed** `new Array(maxShips)` | `src/render/thruster/systems/familyFleet.js:18, :72-75`; mirrored `src/render/vfx.js:391` |
| Concurrent explosions | 24 | `src/render/vfx.js:451` |
| Spawn budget | `DEFAULT_MAX = 12`, `HARD_MAX = 40` | `src/systems/spawnBudget.js:23-25` |
| Ambient reservation | 8 of the 12 — leaving **4 encounter slots** | `src/systems/world.js:142` |
| Ship dynamic meshes | 96 | `scripts/probe-performance-profile.mjs:71` |

**The spatial-query trap.** `AI_SPATIAL_MIN_COLLIDABLES = 96` (`src/systems/aiPorts.js:30`): below that
threshold the code returns the whole collidables array and skips the hash (`:913-915`), making contact
resolution O(N²) per ship. The batched shared-superset path only engages at ≥96. **Thirty enemies sits
in the dead zone** — too many for O(N²) to be free, too few to trigger the optimization. This
compounds an already-failing budget: `spatialHash.queriesPerSecond` measures 62.9 against a budget of
55 (`probe-performance-profile.mjs:67`, `design/program/03_LIVE_ACCEPTANCE_MATRIX.md:105`). The cheapest
fix is lowering the threshold, not adding query sites.

**The encounter director is architecturally anti-swarm.** `MAX_MAJOR_PER_DAY 1` / `MAX_MINOR_PER_DAY 2`
(`src/systems/encounterDirector.js:75-77`), `MIN_GAP_S 30` (`:82`), and `:1479` returns `combat_busy`
so there is **never more than one combat encounter at a time**. Its stated premise (`:15`) is that
spending pressure *is* the pacing valve. A swarm is one encounter that spawns thirty, so this needs a
new shape tier, not new numbers.

**AI already handles being tethered — under the production stack only.** `tacticalAI`
(default per `gameState.js:21`) perceives `self.tethered` (`aiPorts.js:625`), scores escape at `+0.98`
(`src/ai/shipDecision.js:347`), steers `escapeTether` (`src/ai/maneuver.js:343-347`), and has a generic
deadlock detector that flips to `CLEAR_DEADLOCK` after N stationary ticks under commanded thrust
(`maneuver.js:129-140`). That produces legible flailing, not a stuck loop. Legacy `src/systems/ai.js`
has zero constraint awareness and would command thrust into the constraint forever.

Three caveats: `escapeTether` burns purely radially — the one direction a taut line perfectly cancels;
`aiPorts.js:446-447` indexes attachments by both `ownerId` and `targetId`, so an NPC firing its own
line reads as tethered; and `src/ai/combatDoctrine.js:406` scores tethered contacts at `-100` with
egress at `:235`, so **the swarm actively flees the web the player just built.**

### 1.4 Reward loop — already ~80% shipped

`src/systems/mining.js:546-618` is a velocity-inheriting homing vacuum: `MAGNET_RANGE 420`,
`MAGNET_ACCEL 900` wu/s², approach 100–280 wu/s, with a 1.35× close boost and direct-to-cargo
collection. It is explicitly built so combat flybys collect (`:582-584`). Kills already drop through
`src/systems/lootShards.js:43-67` (production-on per `src/runtime/runtimeProfiles.js:29`).

Missing for §4's dopamine loop: the reward arrives as a commodity into cargo rather than a counting
readout, the VFX is a cargo-pickup sprite rather than light, and the bulk value still sits in a parked
salvage wreck (`mining.js:637-648`) instead of in the magnet.

### 1.5 Progression — see grammar §8.1

Slot model with types, sizes, and fit validation exists (`src/systems/ships.js:38-39, :93-110`); mount
*position* is already a first-class slot property for weapons (`facing`, `ships.js:59-70`); every
module carries mass; the full mass → handling → Rapier pipeline exists. Missing: center of mass
derived from mount position (the field exists at `physicsAuthority.js:139` and is never computed),
retirement of `opMassBias` (`ships.js:252-260`) so mass is a truthful currency, and the Rig acquisition
paths.

**Do not add a seventh slot type.** `SLOT_TYPES` (`ships.js:39`) defines the canonical order that
indexes the positional `fittings[]` array in saves (`SAVE_SCHEMA.md:140, :273`). Adding one shifts
every index. Use the existing **utility** slot, which already scales 1 → 8 across the hull ladder.

---

## 2. Contradictions to resolve before implementation

Ordered by how much damage they do if left standing.

| # | Conflict | Resolution |
|---|---|---|
| 1 | **`GDD_2_0.md` §4.1 declares Helm Assist the default; the live default is `pilot`** (`src/core/gameState.js:25`, `src/systems/input.js:5-6`), and `src/save/saveSystem.js:3187` migrates helm-assist saves back. §4.3's tether bindings (RMB/G, scroll-to-winch, X to cut) match nothing in code. | Correct GDD §4.1 and §4.3 against `src/systems/input.js:220-314`. This is the top of the authority stack, so every wrong binding propagates to every agent indefinitely. |
| 2 | **`design/PERF_BUDGET.md:66, :68` makes reducing bloom a release blocker.** | Not actually a conflict — the rule forbids *lowering quality as a perf fix*. §9.2 changes technique without lowering quality. Add one clarifying clause so an agent does not read "not bloom" as "disable bloom". |
| 3 | **`design/vfx/FIELD_TOOL_READABILITY_BIBLE.md:761` requires field-tool arcs be "normal-composited, thin, desaturated, **not** additive white lasers"**, with a mandatory grey-read test (`:49, :1026`). This governs exactly the gravity instruments §1 and §5 propose. | **A genuine authority conflict and the biggest visual risk.** Resolve deliberately before any neon work: either the bible's readability contract wins for field tools and the neon language applies elsewhere, or the bible is amended with a new rule that preserves grey-read through *shape* rather than *saturation*. Do not let an agent discover this mid-packet. |
| 4 | **`design/revamp/REVAMP_MASTER.md:36` and `BP-02_COMBAT_CEILING.md:7` rank "dogfights with a ceiling — a skilled pilot wins outnumbered by flying, not stats" as a north-star objective.** | Directly opposed to swarm framing, and `BP-02` is the packet an agent would actually be handed for combat work. Re-brief or explicitly supersede. |
| 5 | **`design/revamp/BP-07_FLIGHT_TRAVERSAL.md:12, :19, :29`** carries brake-to-stop and tether-traversal as open checklist items. | Both are set aside in grammar §10. Correct or retire the rows. |
| 6 | **`design/BUILD_PLAN_2_0.md:75`** marks the Helm Assist scheme **DONE (2026-07-04)** including "Space brake". | A false completion claim that reads as settled. Correct it. |
| 7 | **PQ-026** ("inertial shunt, gravity mark, momentum sink") is ~70% the same content as Pinned/Unmoored, expressed as stats rather than states. **PQ-029** includes a tractor. **PQ-030**'s "transverse snare" is defined at `roadmap/03_SIGNATURE_SYSTEMS.md:60` as *counter-tether threats* — AI using tethers against the player — which `MASSLINE_PHYSICS_HANDOFF.md:32` separately forbids ("No new powers for enemies"). | Re-brief PQ-026 and PQ-029 against the grammar rather than duplicating them. Disambiguate PQ-030: player-side N-body coupling and enemy counter-tether are two different features sharing one word. |
| 8 | **PQ-031 (Twin Bridle)** — set aside in grammar §10. A second independent reason exists: `design/sequential-build-plan/_PACKET/03_COLLISION_AND_FLAG_MAP.md:81` flags it as crossing the atlas-owned jump-graph seam. | Retire to a rejected disposition citing both reasons. |
| 9 | **`design/sequential-build-plan/` is unregistered** — absent from `PLAN_REGISTRY.md`, `design/AGENTS.md`, and `docs/POLICY_MANIFEST.md`. It already contains SF-10 *"3 physics weapons + expendable-swarm rebalance"* sourced from `_PACKET/01_THE_USERS_OWN_WORDS.md:311`, plus the PQ↔T↔SF collision map. | **This is where the earlier design session went.** Register it, or keep re-deriving its conclusions. |

---

## 2.5 Inherited decisions to reverse

This repository was built largely by AI agents across many sessions. Some of its rules encode the
owner's real design intent and must be protected. Others are decisions an agent made once, in a
narrow context, that then got written into a test or a check and became permanent law — and are now
blocking the game the design calls for.

The repository already has a standard for telling these apart. `CANONICAL_BUILD_MAP.md:164` forbids
fossilizing taste "through CSS-property bans, palette allowlists, fixed technique counts, arbitrary
geometry ceilings, source-string scans, or 'never do X' prose that lacks an observed failure," and
`docs/POLICY_MANIFEST.md:44-58` sets a rule-admission test. Several shipped rules fail that standard.

**Each entry below states what the rule is, why it plausibly exists, and what it should be instead.**

### Reverse these

**1. Enemy AI flees the exact situation the game's signature verb creates.**
`src/ai/combatDoctrine.js:406` scores any tethered contact at `-100`, and `:235` makes an AI egress
when its target becomes tethered.

*Why it exists:* the commit is `c875aa40`, "fix(combat): make the opening fair and controllable," with
an empty body and no code comment. The plausible story is that during first-hour tuning, enemies
piling onto a tethered target made the opening feel unfair, and this was the quickest fix.

*Why it's wrong now:* it generalizes an opening-fairness tweak into permanent global doctrine, and its
effect is that **a web that catches eight ships makes all eight uninteresting to the rest of the
swarm, which then scatters.** It negates the headline mechanic. This has the highest
damage-to-justification ratio of anything found in the audit.

*What it should be:* delete the blanket penalty. If opening fairness needs protecting, scope it to the
tutorial encounter or to low-threat cohorts. Better: **invert it for most archetypes** — a tethered
ally should be a rescue objective and a tethered enemy should be a free kill. Both readings make the
tether more interesting than "everyone looks away."

**2. A test forbids visual richness by scanning source strings.**
`test/post-processing-restraint.test.mjs:26-32` fails the build if the background shader source
contains the strings `Micro-stars: hash speckle`, `A few distant galaxies`, `float bandMask`, or
`float breath`. **Two of those four patterns match comments, not code.** No observed failure is cited
anywhere.

*Why it exists:* someone got a washed-out, noisy background from an over-eager effect pass, removed it,
and pinned the removal so it couldn't come back.

*Why it's wrong now:* it is the textbook case the repo's own rule names — a source-string scan
enforcing taste. It permanently bans a category of visual work, it is trivially defeated by renaming a
variable, and it currently gates promoting the render graph to default (build plan item 15).

*What it should be:* delete lines 26-32 outright. Keep `:12-16` in modified form — the *clamping
contract* (bloom strength must not implicitly grade, vignette, or grain the frame) is a real resolver
invariant worth protecting; the zero-defaults are taste and should move to a settings default, not a
test.

**3. An idle-frame perf check asserts zero work rather than a budget, and has already refused a
feature.**
`scripts/check-vfx-frame-sleep.mjs:97` requires seven VFX subsystem counters to sum to **exactly 0**
when the scene is idle. Separately, `:75-84` asserts that `vfx.js` *source* contains specific private
method names like `_miningBeamActive()` and `_consumeCadence(`.

*Why it exists:* a legitimate goal. `design/PERF_BUDGET.md:48` gives VFX 2.5 ms of a 16.7 ms frame, and
an idle scene burning that budget is real waste.

*Why it's wrong now:* zero is not a budget. `design/program/roadmap/receipts/PQ-023-propulsion-family-REPORT.md:64-80`
and `NOW.md:35` record the consequence in the owner's own program: **"no always-on idle nozzle glow"** —
a visual feature was refused by this check, and the glow's actual frame cost was never measured. That
directly contradicts `CANONICAL_BUILD_MAP.md:33`, which says to treat ambitious graphics as part of the
feature rather than a luxury to suppress.

*What it should be:* rewrite the assertion as a measured ceiling — idle VFX under X ms and Y draw calls
against the stated budget — so a cheap persistent effect can pass on merit. Delete `:75-84` entirely;
pinning private method names protects nothing and fails CI on a rename with zero behavior change.

**4. A fixed array is documented as a hard cap on how many ships can have engines.**
`src/render/thruster/systems/familyFleet.js:18` sets `FLEET_MAX_SHIPS = 10` and allocates a fixed
`new Array(maxShips)` slot table. Ship eleven silently degrades to legacy streaks.

*Why it exists:* commit `343f0d7c`, "checkpoint VP-220 propulsion candidate." It is a buffer size
someone picked while prototyping, described in the comment as a "hard cap" it never needed to be. No
measurement is cited.

*What it should be:* a growable pool sized from telemetry, like every other pool in `vfx.js`. This is
the single hardest blocker on swarm framing and it is an allocation strategy, not a design decision.

**5. Systemic source-string policing across the check suite.**
The audit counted 145 source-regex assertions in `scripts/check-input-modalities.mjs` alone, 118 in
`check-professional-first-hour-one-voice.mjs`, 70 in `check-launch-policy.mjs`, and 60 each in three
more. `check-input-modalities.mjs` freezes the gamepad button map as regex — rebinding LT, R3, or LB
fails CI.

*Why it exists:* a real and important goal, stated at `check-input-modalities.mjs:5-6` — a refactor can
silently drop an input modality, leaving controls dead with no error anywhere.

*Why it's wrong now:* `docs/POLICY_MANIFEST.md:57` already says to prefer a behavioral regression over
source-string policing. The goal is admissible; the method makes the codebase rigid in exactly the
places this plan needs to change.

*What it should be:* convert the highest-traffic ones to behavioral tests — drive the input adapter and
assert the verb fires, rather than asserting the binding table's text. Start with
`check-input-modalities.mjs`, since the Rig slot work (Phase 5) will otherwise fight it directly.

**6. A 1,046-line VFX taste document that self-identifies as one.**
`design/vfx/FIELD_TOOL_READABILITY_BIBLE.md` declares itself a "taste constitution" at `:3` and states
at `:17` that its evidence base is code read while writing it — **not play evidence**. It mandates a
palette allowlist, a ≤6-draws-per-field ceiling, a 2px minimum, "boundary never blooms," and a
ten-step Fail→stop review ritual. It governs precisely the gravity instruments this plan expands.

*Why it exists:* a genuine and correct worry. Additive white lasers everywhere would destroy top-down
readability, and the grey-read test (does identity survive desaturation?) is a real accessibility idea
worth keeping.

*Why it's partly wrong:* it is scoped to PQ-012/013/016 and defers to measured evidence at `:13`, but it
reads like global law and will be cited as such. Its own Law 9 forbids arbitrary prose caps, and it
then spends a thousand lines writing them.

*What it should be — **ruled**, see grammar §9.2.1:* the neon direction wins and readability moves to a
different carrier. **Silhouette and motion encode what a thing is; colour and additive brightness
encode how much energy is present.** Each instrument gets a geometric signature identifiable with the
colour knocked out (Well = rings contracting, Repulsor = rings expanding, Cone = directional wedge,
Mass Seed = pulsing point, Skim = sweeping band), and brightness is then free.

Retained from the bible: the readability goal, the grey-read test as redefined (identity survives
desaturation — now via shape), and an **occlusion contract** — gameplay-critical objects must stay
visible through any effect, which `src/render/energy/energyMaterials.js` already supports through
depth-aware soft intersection.

Withdrawn: the palette allowlist, the ≤6-draws-per-field ceiling, the 2px floor, "boundary never
blooms," the non-additive mandate, and the ten-step review ritual. Mark them withdrawn in the file
rather than deleting it, so the reasoning survives.

### Protect these — they are real design intent, not agent drift

The audit found three rules that look restrictive and should be left alone. Do not "fix" them.

- **The player ship never tumbles** (`src/systems/tumbleStates.js:9-10`). Owner-sourced, cites a design
  principle and Escape Velocity's no-collision-damage precedent, properly enforced including a
  forged-state test. This is player-agency protection and it is correct.
- **"No new powers for enemies"** (`MASSLINE_PHYSICS_HANDOFF.md` §2). This is the owner's own words,
  quoted verbatim in the source, with the stated reason: *"they'll just grapple the shit out of me."*
  It is a real fear about a real failure mode. **Design counterplay that is not "enemies get tethers"** —
  shootable web hubs, mass-ratio resistance, cutting charges, and the web catching allies are all
  counterplay that respects this. The only change needed is moving the rule out of a `HISTORICAL`
  handoff (where `POLICY_MANIFEST.md` says it cannot direct implementation) into an authoritative
  surface, so its status stops being ambiguous.
- **Particle and sprite caps** (`src/render/vfx.js:179-182`). Measured, quality-tiered, player-settable,
  and wired to a stated budget. This is what a good limit looks like.

### One rule with the right intent and the wrong shape

**The encounter director's scarcity model.** `src/systems/encounterDirector.js:15` states the premise
plainly — "Spending pressure IS the pacing valve" — and `:75-77` labels the quotas as "the design."
That is real intent, and the surrounding comments make clear it was deliberate.

But `:1479` enforces it by returning `combat_busy` whenever a combat encounter is live, which
**conflates "one scheduled encounter" with "one fight."** A swarm is one encounter that spawns thirty.
The pacing philosophy survives intact if the director gains a shape tier whose *budget* is large and
whose *frequency* is still governed by the same spending-pressure model. Do not raise the quotas; add
the tier.

---

## 3. Foundational pieces that are missing

Systems not named in the grammar doc that must exist for it to be buildable.

1. **A status effect-kind vocabulary.** Four of eight states need effect kinds that `applyEffects`
   cannot express (§1.1). This is the single largest engineering item in the design and it should be
   built once, deliberately, as a seam — not improvised per state.
2. **Physics-membrane paths for mass and damping.** Pinned and Unmoored require writing effective mass
   and angular damping, which only the physics system may do (`src/core/physicsAuthority.js`). Needs a
   command type alongside `writePhysicsControl` / `queuePhysicsImpulse`.
3. **An N-body attachment schema.** `maxAttachments: 1` (`src/data/combatDefs.js:259-263`) and
   `state.player.tether` as a single record (`tetherGameplay.js:653`) mean a Snarl hub has no
   representation. This gates every web mechanic.
4. **A per-entity signature field.** Hot has no home. Signature exists only as a player-only cloak
   radius (`src/systems/cloak.js:143-149`, unserialized) and a separate player-only WANTED heat
   (`src/systems/heat.js`). Stealth, seekers, and ambush all key off a field that does not exist.
5. **A status → AI perception channel.** One field in the `aiPorts` sensor frame, without which any new
   state is invisible to every enemy.
6. **NPC state persistence.** §1.1. Required by the grammar's own save constraint.
7. **A cheap "is the tree green" command.** See §5.

---

## 3.5 Protected tuning values, and how the planned work threatens them

Grammar §9.8 explains which parts of this game were tuned by hand and why. This is the constant-level
list. **An agent may not change any of these without playing the result and saying so in its receipt.**

| # | Value | Location |
|---|---|---|
| 1 | `COAST_HELM_YAW_MULT = 1.2` and its gate (throttle + boost only; strafe exempt) | `src/core/flight/propulsionKernel.js:32, :686-691` |
| 2 | `tether_standard` envelope: `breakTension 10500000`, `maxTension 10500000`, `maxImpulse 190000`, `maxYank 150000`, `graceTicks 4`, `snapImpulseNoise 0` | `src/data/combatDefs.js:234-236` |
| 3 | `tether_standard.spring`: `K 140, zeta 0.95, captureS 0.35, maxStretchRatio 1.44, reelSafeStretchRatio 1.32` | `combatDefs.js:241`, mirrored `src/core/sg02DynamicBodyOwner.js:54` |
| 4 | `automaticBreakPolicy: 'extreme_load_only'`, `overloadGraceS 1.1`, and the fail-closed gate | `combatDefs.js:243`, `src/combat/attachments.js:80-90` |
| 5 | `attachment_massline` break `10250 / 206.25 / 525` — keep both copies in lockstep | `combatDefs.js:211`, `src/core/constraints/masslineController.js:22-24` |
| 6 | Snap hardening: `tau 1.1`, `0.18 + 0.55·tension + 0.35·history`, cap `0.85`, `yankBudget ×(1+1.8·harden)`, `graceS ×(1+2.8·harden)` | `masslineController.js:138-146, :160` |
| 7 | `catastrophicRatio 1.75`, `overloadGraceS 0.22`, winch stall `clamp(1−max(0,r−0.65)/0.75, 0.08, 1)` | `masslineController.js:26, :25, :111` |
| 8 | Earned momentum: `MASSLINE_SLING_TAG_S 1.0`, `TRAVEL_DASH_TAG_S 1.0`, `MASSLINE_SLING_DECAY_TAU_S 6.0`, `MASSLINE_EARNED_ASSIST_SCALE 0.24`, `CLOAK_COAST_ASSIST_SCALE 0.28` | `src/systems/flightV3.js:63, :68-71` |
| 9 | Governor shape: cap formula, the `forward > baseCap` precondition, the `Math.max` combination, `brakeFloor = 0` under boost. **The unboosted overspeed brake stays.** | `propulsionKernel.js:272, :276, :293, :296, :304` |
| 10 | Per-drive `overspeedBrakeFraction` / `governorResponseS`: `0.28/0.85`, `0.24/0.95`, `0.16/1.3` | `src/core/flight/propulsionCatalog.js:51-52, :85-86, :119-120` |
| 11 | Travel ceilings 3.5 / 2.75 / 2.25 / 2.0 / 1.5, absolute `1200 wu/s`, `TRAVEL_RAMP_FULL_S 9`, taper floor `0.12`, disengage τ 5 | `propulsionKernel.js:48-54, :63, :66-72, :74` |
| 12 | **`NPC_INPUT_SLEW = 2.6`, and `applyMasslineFlightModifiers` staying inside `if (isPlayer)`** | `flightV3.js:41`, `:242-246` |
| 13 | Tether-loaded speed limits `10 / 160 / 260 / 260 / 420`, formula `base×1.75 + 40` | `sg02DynamicBodyOwner.js:44-48` |
| 14 | Bank set `5.2 / 10.5 / 0.42 / 100 / 0.22 / 0.06` | `flightV3.js:27-32` |
| 15 | `socket_tether_spool localPos [0.50, 0]` — **≥0.72 is a known break** of slingshot release energy | `combatDefs.js:259` |
| 16 | Boost/dash: `DASH_TAP_WINDOW 0.32`, `drainRate 40`, `regenRate 18`, `dashCost 28`, `dashCd 3`, re-arm hysteresis 35% | `flightV3.js:80, :84-88, :371` |
| 17 | Impact damage `1/1600`, `0.35`, `24`, `900`, `1/220`, `30`, and **the player never takes hull damage from a physical impact** | `src/systems/masslineImpactDamage.js:19-25, :3-5, :57` |

### Risk register — how each planned change could break the above

**Drifting (Phase 2) is the most dangerous item in the whole plan.** If it zeroes `input.throttle`, two
things happen silently: `coastHelmYawMultiplier` grants the disabled ship **+20% yaw authority**
(`propulsionKernel.js:686-691`), and `applySpeedGovernor` returns early and removes the speed cap
entirely (`:266`). A "disabled" ship becomes a nimble uncapped one. *Invariant to assert:* a Drifting
entity reports `telemetry.coastHelm === false`, and if it should decelerate it sets `brake`, not zero
throttle. Second trap: `brake` zeroes **all** manual translation (`:739-761`) — that was a deliberate
fix for a −21.6 wu/s backwards equilibrium, so assert that braking from cruise approaches zero
monotonically and never crosses it.

**Gravity wells (Phase 6)** push forward speed above `baseCap` with no earned tag, so the assisted
governor will spend a quarter of reverse authority fighting the well every tick — which reads to the
player as exactly the bogged-down feel the additive-speed tuning was built to remove. *Invariant:*
well-induced overspeed sets `physicsEarnedMomentum` (τ=6) rather than raising `baseCap`; assert
`COAST_HELM_YAW_MULT` and per-drive `overspeedBrakeFraction` are unchanged.

**Webs (Phase 6).** `masslineExtremeLoad` is opt-in **per endpoint, not per line**
(`attachments.js:84-85`) — one web node authored with that flag flips *every* line touching it to
auto-breaking, which would undo protected value #4 across the board. Also `entityMasslineForceScale`
caps at 4 (`:786-790`), so many lines times scale four can outrun the speed clamp. *Invariant:*
`automaticMasslineBreakAllowed(tether_standard, player, anyWebNode) === false`, and
`test/massline-normal-durability.test.mjs:84-111` still passes with N-body webs.

**Swarm rebalance (Phase 4).** Granting NPCs `applyMasslineFlightModifiers` "for parity" is the single
change that recreates the flung-enemy regression the owner describes. *Invariants:* no NPC frame ever
reports `governor.physicsEarned === true`; NPC steady-state speed ≤ `combatSpeed × boostSpeedMult`;
`NPC_INPUT_SLEW` stays at or above 2.6.

## 4. Order of operations

Sequenced so that each phase unblocks the next and no phase depends on an unresolved contradiction.

### Phase 0 — Truth and unblocking (must precede everything)

Nothing else is safely measurable until this lands.

- **Repair `check:sim:compare`.** It is red and sits at link 79 of the 97-link `npm run check` chain,
  which is a fail-fast `&&` sequence — so **18 downstream links including every flight, atlas, art,
  bundle, and gate-reachability gate are currently unreachable.** `design/program/NOW.md:35` asserts
  the opposite; correct it.
- **Add `check:save-schema` to the `check` chain.** It is red and appears only in the hardcoded smoke
  list (`scripts/check-ci-report.mjs:11-20`), so save-schema regressions are invisible to CI.
- **Add a real fast gate** (§5).
- **Close the preexisting-failure loophole** (§5).
- **Correct GDD §4.1/§4.3** and the stale binding claims in `BUILD_PLAN_2_0.md` and `BP-07`.
- **Resolve the field-tool readability conflict** (§2 row 3) before any visual work is scoped.
- **Register** `design/sequential-build-plan/`, this document, and the grammar doc in `PLAN_REGISTRY.md`.

### Phase 1 — Connect what is already built

Highest value per hour in the entire project. Almost no new code.

1. **Wire the Massline acquisition preview** — three call sites (grammar §7.1). The behavior change is
   switching the latch from nearest-wins to the scored candidate; budget feel-testing time for that,
   not implementation time.
2. **Repair auto-target** — reconcile the weapon target with the tether target; make the constrained
   fire solution apply when the player is inside rest length; solve lead per mount rather than once
   from the first weapon (grammar §11).
3. **Wire the three fitting-feel panels** into the outfitting screen.
4. **Delete the duplicate Spinning representation** — pick `status_tumbling`, remove `entity.data.tumble`
   and its three readers, drop the resync hack.
5. **Per-target flyby-focus cooldown, and stop the camera moving** (grammar §7.2).

*Exit criterion: the player can reliably tether what they meant to tether, and hit it while orbiting.*

### Phase 2 — State layer keystone

6. **Effect-kind vocabulary and physics-membrane paths** (§3 items 1–2). Build the seam first.
7. **Drifting** — `combatDefs.js:165` `movement: 0.25` → `0`, plus the tumble visual.
8. **The first chain end to end: disable → tow → capture** (grammar §2.4). Every other part ships.
9. **NPC status persistence** and the **AI perception channel** (§3 items 5–6).
10. **Save v12 → v13** — one migration entry, regenerate `SAVE_SCHEMA.md` via
    `scripts/generate-save-schema.mjs --write`.

*Exit criterion: one cascade the player did not author resolves on screen.*

### Phase 3 — Presentation

11. **3D pose** — generalize `_updateShipPitch` to `_updateShipPose` with render-owned roll and tumble
    fields (§1.2). Zero sim, zero save impact.
12. **Off-plane** — the `m.position.y` pin, then the required LOD and contact-shadow repairs.
13. **State → visual binding** at `renderer.js:1766`, cloning the `shipDamage.js` driver, frame-sleep
    compliant.
14. **Neon authoring pass** — retune the ~35 vfx handlers, lift the `_bloomRadianceScale` ceiling, swap
    radial sprites for stretched ones.
15. **Gravitic distortion** — one pass on `spaceRenderGraph`, which requires promoting `renderGraph` to
    default and reconciling its baked grade/vignette against `test/post-processing-restraint.test.mjs:12-16`.

### Phase 4 — Swarm

16. **Convert fixed-size presentation pools to pooled/growable** — `FLEET_MAX_SHIPS`, explosion cap.
17. **Lower `AI_SPATIAL_MIN_COLLIDABLES`** so the batched broadphase engages in the 12–95 band, and
    re-measure `spatialHash.queriesPerSecond` against its already-failing budget.
18. **A swarm encounter shape tier** that bypasses `combat_busy`, plus a spawn-budget path for it.
19. **Fix `combatDoctrine.js:406`** so enemies do not flee tethered contacts.
20. **Rebalance** — enemies die fast, hit soft. Includes revisiting per-kill wreck and pickup
    accumulation, which currently adds ~2.5 persistent collidable entities per kill.

### Phase 3.5 — Repair the mining loop before adding any sink to it

Grammar §9.5 documents three features that exist in the codebase and have been disconnected. These are
cheaper than anything else in the plan and they gate Phase 5: adding a Rig price list to an economy
whose faucet is one held button converts the game's best content into a grind.

15a. **Restore heat/vent.** `src/systems/mining.js:126-131` deletes the heat state every tick. The
     presentation cues (`cueRecipes.js:52-53`) and the audio (`audioSystem.js:417` `sfx_vent_chime`)
     are already written and waiting for an emitter.
15b. **Make bulk tether-haul reachable.** `BULK_HAUL_MIN_U = 20` against a maximum achievable chunk of
     ~8u means the payout path, the refinery dock handler, and the prompt have never executed. Prefer
     raising fracture yields over lowering the threshold — a visibly oversized chunk is more legible.
     This is the mining↔tether loop-lock the GDD calls inevitable and it has never once run.
15c. **Wire `danger:miningNoise` to `dangerModel.js`.** The meter accumulates and emits; nothing
     listens.
15d. **Make seams cost yield, not only time**, and fix the rich-core payout to be the multiplier its
     field name promises.
15e. **Delete the duplicate ore price table.** `ORES[].baseValue` and `COMMODITIES[].basePrice`
     disagree, and the help screen reads the stale one — the game tells new players wrong prices.
15f. **Signpost the drill.** It is the game's deepest minigame, it is gated behind a live tether, and
     nothing tells the player either fact.

### Phase 3.6 — Audio: make mass audible

Grammar §9.6. The stack is strong; one hole sits under the central claim.

15g. **A material-pair impact matrix.** Every collision currently plays one recipe with volume mapped
     from impulse (`audioSystem.js:1256-1259`) at a fixed rate. Impulse should drive pitch as well as
     volume, combined mass should drive body, and the material pair should select timbre.
15h. **A derivative channel** so audio can read `Δstrain/Δt` and relative velocity — creak on load,
     whip on release, doppler on a passing mass. The tether hum already reads instantaneous strain
     correctly; this extends the same idea.
15i. **Sidechain the engine bed to impact magnitude**, and expose the five buses that exist rather
     than three sliders.

### Phase 4 — Swarm

*(renumbered — see items 16–20 above)*

### Phase 4.5 — HUD arbiter and trackpad safety

Grammar §9.7. Do this before adding Rig slots, because Rig slots add another permanent surface to a
screen that already has fifteen and no layout owner.

20a. **Fix the four trackpad hazards first** — normalize wheel deltas and add keyboard zoom
     (`input.js:502-504`), move RMB-hold mining off a sustained mouse-button hold (`input.js:987`),
     get the braking solution out of hover-only (`hud.js:948-949`), and stop Ctrl+drag colliding with
     the macOS right-click gesture (`hudLayout.js:41`). These are correctness, not polish.
20b. **Build a HUD surface arbiter** — the visual sibling of the existing message `voiceArbiter`.
     Surfaces declare a slot, a priority, and a relevance predicate.
20c. **Cut the duplicates**: heat appears three times, hull/shield twice, tether state three ways.
     Merge the three surfaces colliding in the bottom-center 118–146px band under one owner.
20d. **Decide the typography.** `styles/fonts.css` downloads IBM Plex Sans, IBM Plex Mono, and Saira
     Condensed; `--font` resolves to Segoe UI. Either use them or stop shipping them.

### Phase 5 — Rigs and progression

21. **Slot-indexed dispatch** replacing 1:1 verb→system coupling; reframe `Digit4`–`Digit8` as Rig
    slots over the existing utility slot type. Expect to fight `check-input-modalities.mjs` — convert
    it to behavioral assertions first (§2.5 item 5).
22. **Convert the six free instruments to fitted modules** with the §8.1 acquisition mix. Every
    mechanism already works — `buyModule`, the tech gate, `salvageOnly`, and the mass→handling
    pipeline. What is missing is data rows and one `grantModule` call in the career ladder.
23. **Center of mass from mount position**; retire `opMassBias` so mass is a truthful currency.
24. **A ladder reward kind that grants and teaches a Rig** — the "Taught" tier of §8.1, currently
    unimplemented (`careerLadders.js` contains no `grantModule` call).

### Phase 6 — New instruments

25. N-body attachment schema (§3 item 3), then **Snarl**, then **Capstan** with the faked wrap model.
26. **Modal tractor** — reuses the existing line-control axis-zeroing and `bulletTime`; needs a key,
    and no letter is currently free.
27. **Neutron slug**, **directional shield**, **structures and bounce**.

### Phase 6.5 — Mission condition language

Grammar §9.9. **This is the highest-value gameplay change in the entire plan and it is one array plus
one observer.** It should probably move earlier than its number suggests — everything downstream
(careers, set-pieces, story, faction work) currently collapses onto eleven verbs because it has to.

27a. **Add `conditions: [{event, predicate, count}]` to the mission schema**, evaluated by one generic
     observer subscribing to already-emitted bus events. Generalise the `attachClauses` allowlist
     pattern (`src/systems/contractClauses.js:42`) from five clauses on three events to N conditions.
27b. **Add a per-tick predicate slot** to `src/systems/missions.js:533`, which today evaluates nothing
     but the deadline.
27c. **Borrow the predicate vocabulary from `src/systems/encounterScripts.js`** — distance-and-hold,
     speed-below, centroid-radius, sustained-absence. Seventeen scripts of exactly the right shape
     already exist and are unreachable from the mission board.
27d. **Author the first ten physics-aware conditions** against the ~60 unevaluated events: tether
     strain held, cargo mass delivered, arrival under a speed, fragile cargo intact, run completed
     while cloaked, field cleared without firing.
27e. **Make risk tier a verb modifier**, not only a payout multiplier.

### Phase 6.6 — Faction, law, and world interlock

Grammar §9.10. Cheap, because the systems are built and simply do not read each other.

27f. **`lawSecurity.js:284` emits `faction:repDelta`.** One emit closes the largest hole in the design —
     today you can destroy a patrol inside a station's guns and lose zero standing with its owner.
27g. **Wire the faction read API into its consumers.** `priceMod()`, `dockAccess()`,
     `missionAvailable()`, `bribeCost()`, `getStanding()`, `getTier()`, `isAggro()`
     (`src/systems/factions.js:493-546`) have **zero importers**; three call sites re-read raw state and
     duplicate the formulas. Written, tuned, unused.
27h. **Feed `state.conflicts` and sector `owner` into `encounterDirector._accrue`**
     (`src/systems/encounterDirector.js:251`). There is a real offscreen war that flips sector
     ownership and it is invisible from the cockpit.
27i. **Surface faction power and conflict tension in the UI** — computed daily, displayed nowhere.
27j. **Give `knownContrabandStrikes` a forgiveness path** — currently a permanent ratchet with no decay.

### Phase 6.7 — Story as evidence

Grammar §9.11. Reframes a 137,000-word backlog into a tractable content pipeline.

27k. **Promote aftermath wrecks to authored ones.** `src/systems/aftermathWrecks.js` already marks where
     fights happened, and `src/data/uniqueWrecks.js:9` notes a `promoteToAuthored(lossLike)` adapter.
     Let a battle you fought become a rumor someone tells you later.
27l. **Make the codex written by play.** Today it is a static table gated on beat index; nothing the
     player does writes an entry. Moral debts, ace transitions, and salvage provenance should.
27m. **Gate canon characters on salvage history rather than beat number** — the pattern already exists
     (Dustwife Senna on `minUniqueWrecks: 3`).
27n. **Run wreck and moral-debt events through the Band's `eventKey` system** so the radio reports what
     you actually did.
27o. **Author more unique wrecks.** Twelve exist. This is the content unit that works — provenance, a
     hazard, a salvage-law position, and a two-way moral choice. Write forty more before writing
     another chapter.
27p. **Audit `src/story/campaign47a/embodiedMissions.js`** (450 lines, self-declared unregistered
     sidecar) for reusable material before authoring anything new.

### Phase 7 — The economy learns to explain itself

Grammar §9.5.5. Lower priority than the loop repair, higher than new content.

28. **Let player action leave a mark that outlives the 19-minute drift half-life** — convoy
    destruction, monopolies, and completed relay contracts should move equilibria, not stocks.
29. **Attribute every visible price move to a visible cause** through the existing news ticker and
    price-memory overlay.
30. **Turn down `CYCLE_WEIGHT`** so supply does more of the talking than the wave generator.

---

## 5. Agentic workflow changes

The audit found three process defects that will make the above fail regardless of design quality.

### 5.1 The preexisting-failure loophole — exact location and fix

The behavior ("this test fails but it's preexisting, so out of scope") is **protocol-compliant today**.
The permitting text is `design/program/roadmap/00_EXECUTION_PROTOCOL.md:151`:

> `OUT_OF_SCOPE` | valid defect outside the selected outcome/write budget | record follow-up; do not
> reopen current acceptance unless it invalidates the route

Reinforced by `:13` (`FAIL` is defined only for *in-scope* defects, so an out-of-scope red cannot
force a non-`PASS`), `:88` ("do not treat `package.json` as a menu"), `docs/VALIDATION_WORKFLOW.md:42`
("do not run the repository-wide `npm run check`"), and a duplicate of the disposition at
`VALIDATION_WORKFLOW.md:208`.

**The honest reason agents use it: there is no way to know whether a red predates them.** Phase A
(`00_EXECUTION_PROTOCOL.md:50-57`) records branch, HEAD, dirty paths, worktrees, and leases — never
check state. So `OUT_OF_SCOPE` is the only truthful disposition available.

**Fix, in `00_EXECUTION_PROTOCOL.md`, in three coupled parts:**

1. **Entry baseline obligation** — Phase A must capture the packet's declared L0–L2 commands plus a
   fast baseline gate at the candidate base, and persist the result with the fast-gate receipt.
2. **Red-check disposition** — a check red at exit but green at the recorded entry baseline is a
   `PRODUCT` failure *of this run*. A check red at entry must be repaired or carry an
   integrator-signed inheritance token; it is never a self-issued follow-up. Whether the test or the
   code is wrong is the agent's call to make and justify — but "leave it red" is not an outcome.
3. **Receipt fields** — add `entryBaseline` / `redAtExit` to the YAML at `:223-238` so
   `scripts/check-program-docs.mjs` can enforce it mechanically rather than by prose.

Then replace the duplicate at `docs/VALIDATION_WORKFLOW.md:208` with a link, so the rule has one owner.

This clears the rule-admission test at `docs/POLICY_MANIFEST.md:44-58` on the determinism clause —
`check:sim:compare` is a determinism gate and it is currently red.

### 5.2 There is no cheap way to know the tree is green

- `npm run check` is a **97-link `&&` chain** that reports the first failure and silently skips
  everything after it. It currently dies at link 79.
- `npm run check:all:smoke` is the only named fast tier and takes **7 m 37 s**, of which
  `check:flight:clean` alone is **6 minutes**.
- There is no `check:baseline`, `check:fast`, or `check:green`.

**Fix:** add a genuinely fast tier — target under 90 seconds, the `check:sim:compare` /
`check:save-schema` / `check:flight:v3` / `check:massline` / `check-ui-screen-imports` class,
explicitly excluding `check:flight:clean` — and name it in the `AGENTS.md` verification router as the
entry-state command §5.1 requires.

### 5.3 The packet model cannot express this work

- `CANONICAL_BUILD_MAP.md:95` instructs agents to **split** any packet needing several owners, and
  `00_EXECUTION_PROTOCOL.md:74` instructs them to **stop** on an unforeseen shared edit. The state
  layer keystone is sim + save + render + data + UI by construction, so the correct behavior under
  current rules is to stop roughly five times. A naive split also leaves intermediate commits where
  states exist but are invisible — a violation of the grammar's own constraint that an unseeable
  state is a bug.
- **Mutexes are metadata, not machinery.** `scripts/program-dispatch.mjs` contains zero occurrences of
  "mutex". A state keystone needs `physics-authority` + `renderer` + `save-schema` + `input` +
  `registry` + `hud-styles` — 6 of 12, blocking roughly two-thirds of the queue — and the only
  enforcement is prose in `NOW.md`.
- **Nothing reconciles a design document against live code before it becomes work.** Five claims in
  the first draft of the grammar doc were falsified by source. `06_RETAINED_FUTURE_BACKLOG.md:129`
  asks for a seam audit, but only for backlog rows.

**Fixes:**

1. Add a **`## Shared contract`** section to `design/program/roadmap/active/PACKET_TEMPLATE.md` (between
   "Live seams" and "Player route") letting one packet declare a seam landed first for N named
   consumer leaves, the mutex set held for the whole sequence, and a joint acceptance cell — so
   intermediate leaves can be `implemented/unproven` without a false `PASS`.
2. Make dispatch **mutex-aware**, and give it a concept of a mutex held across a sequence of leaves.
3. Make a **pre-admission seam audit mandatory** for any design document before its first packet.
   This document is an instance of one; the template should be the deliverable.

---

## 6. Folding into the program

| Action | Where |
|---|---|
| Register both new documents | `design/PLAN_REGISTRY.md` |
| Register `design/sequential-build-plan/` | `design/PLAN_REGISTRY.md`, `design/AGENTS.md:20-26` |
| Retire PQ-031 to a rejected disposition with both stated reasons | `program-queue.json:1549` |
| Re-brief PQ-026 and PQ-029 against the grammar rather than duplicating | `program-queue.json:1381, :1481` |
| Disambiguate PQ-030 (player N-body coupling vs. enemy counter-tether) | `program-queue.json:1514`, `roadmap/03_SIGNATURE_SYSTEMS.md:60` |
| Most of Phase 3 belongs to the existing PQ-023 umbrella (six cue families remain) | `program-queue.json:1220` |
| Correct GDD §4.1/§4.3; correct `BUILD_PLAN_2_0.md:75`; correct `BP-07:12, :19, :29` | those files |
| Correct the `check:sim:compare` status claim | `design/program/NOW.md:35` |

New packets to admit, in order: **Phase 0** as an integrator-owned repair batch; **Phase 1** as a single
"connect the Massline acquisition path" packet (it is one player outcome); **Phase 2** as a shared-contract
keystone once §5.3 exists. Phases 3–6 split naturally along existing owner boundaries.
