# REPORT — Field / Industrial-Tool / Planetary Readability Bible

**Session:** headless authoring pass, 2026-07-21 · worktree `C:\Users\93rob\sf-g0-design`
(branch `g0/design-bible-20260721`)
**Deliverable:** `design/vfx/FIELD_TOOL_READABILITY_BIBLE.md` (new, uncommitted per brief —
no `git add` of any kind was run).
**Brief:** `kimi-field-language.md` — constitution for PQ-012 (fields), PQ-016 (industrial
beam/payloads), PQ-013 (planetary skim/reentry), with hard rules on grounding, determinism,
and staying inside this worktree.

---

## 1. What I actually read (everything cited in the bible was opened)

**Canvases of taste (read in full):**
- `design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md` — the effect→game-meaning grammar,
  reduced-motion "legible static state, never blank" law, Ring Gauge "arc is the number,"
  Route Beam "flow must be real," one-voice/appear-then-fade discipline.
- `design/foundry/FACTION_SURFACE_LANGUAGE.md` — the Grey-read doctrine, the 60–150 px dorsal
  read, repair-practice vocabulary (used verbatim for the repair beam), faction anchor tokens.
  (Its machine-readable twin was located at
  `assets/ships/foundry/fleet_breadth_20260720/materials/material_profiles.json` — the brief's
  `design/foundry/material_profiles.json` path does not exist; the surface doc itself names the
  true path, so I cited the doc, not the JSON.)

**Render stack (read in full or to the cited lines):**
- `src/render/bloom.js` (full) — HalfFloat pipeline, bright-pass threshold 1.0, multi-scale
  pyramid, ACES in composite, bloom added after tonemap, optional multiplicative luma-keyed
  grade (`shadowBalance`/`highlightBalance`) that **defaults off**. The brief called the grade
  "multiplicative ASC-CDL … orange-teal"; what the code actually ships is the multiplicative
  shadow/highlight balance above plus sector key/rim lighting. The bible's §3.1 states the
  verified truth instead of parroting the brief, and palettes are prescribed to survive both
  the default and the graded path.
- `src/render/vfx.js` (~3,000 of 5,971 lines, every subsystem this bible touches: pools,
  mining beam/tick/yield, tether cable, doctrine tells, travel cues, collision consequence,
  energy cadence/update, `oreColor`, sprite texture builders) — pool caps, cadence constants,
  `_isReduced`, the vector-mine "radial SHOVE" precedent, the explosion pressure-phase
  anti-ring precedent.
- `src/render/energy/energyMaterials.js` (full) — the plume ("liquid blue fire"),
  energy-volume, and massline-ribbon material families; uniform contracts; two-layer
  core+halo construction.
- `src/render/vfxAccessibility.js` (full) — the FULL / REDUCED_MOTION / REDUCED_FLASH /
  REDUCED_BOTH profiles and `applyFlashAccessibility`; exact multipliers quoted in the bible.
- `src/render/visualFactory.js` (the `buildMassSeed` and `buildPayload` builders, full) —
  the frame-lock-containment-anchor language and the sealed-cargo-canister base.
- `src/render/combat/persistentBeams.js` (full) — normal-blend-core-plus-additive-sheath beam
  discipline ("a sustained connection needs a stable energy filament even against true black
  space") — adopted as the beam-family visibility law.
- `src/render/combat/phasedExplosions.js` (the pattern idiom and schedules) — the
  `explosionPattern01`/`mix32` deterministic-variation hash the bible's determinism section
  standardizes on.
- `src/render/thruster/systems/continuousPlume.js` (header/pool construction) — instanced
  batched plume layers, zero-per-frame-allocation contract.
- `src/render/vfxProfiles.js` (engine profile family, first ~100 lines) — per-engine plume
  character (`plumeSwirl`/`plumeFork`) precedent for per-device visual personality.
- `src/render/camera.js` (via targeted grep) — `DEFAULT_ZOOM = 72`, FOV 50, tilt 60: the
  "1×" the readability doctrine is judged at.
- `src/render/renderer.js` (light lines) — `SECTOR_LIGHT_INTENSITIES` and key/rim/fill wiring.
- `src/data/sectors.js`, `src/data/frontierRegions/*` (grep) — the sector lighting palettes
  that carry the orange-teal axis with `uGrade = 0`.
- `src/data/palettes.js` (grep) — faction `accent`/`emissive`/`thruster` fields used for
  payload ownership tokens.

**Systems / specs (read in full or to the cited lines):**
- `src/systems/massSeed.js` (full) — the phase-driven lifecycle, simTime-pure travel path,
  denial/event vocabulary the HUD companions mirror.
- `src/ui/massSeedHud.js` (full) — the status-pill + lock-marker idiom, exact reduced-motion
  setting reads (`settings.video.motionReduce` / `accessibility.motionPreference`).
- `src/ui/screens/settings.js` (grep) — the exact accessibility setting names:
  `accessibility.flashReduce`, `accessibility.motionPreference`, `video.motionReduce`.
- `design/spec3/SPEC3-F4-combat-weapons-ai.md` (full) — the field-weapon context (snare
  slow-field, impulse/vector-mine family) PQ-012 grows from.
- `design/ASTEROID_OPS_VISION.md` (full) — industrial laws 5/7 (aggregates, physical ports,
  no mining-laser collection of refined goods) and the Wave-4 Transfer Beam.
- `design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md` (STEP 12 / SF-14 in full,
  plus sling step references) — bands, staged reentry, escape windows, the eight forbidden
  shortcuts; all are now mechanical rejection conditions in bible §7.
- `design/program/atlas/01_DECISIONS.md` (full) — D5 travel-drive amendments (the
  velocity-tape ruling that binds §8), D7 velocity language ("measurement, not anime"), D9.9
  (no permanent panels).
- `design/program/roadmap/program-queue.json` (PQ-012/013/016 entries) — the packet
  definitions, checks, and evidence lists quoted in each scope section.
- `design/revamp/HUD_THREE_ANCHOR.md` (full) — the anchor layout the HUD companions fit into.
- `design/PERF_BUDGET.md` (targets and doctrine) — the 2.5 ms VFX budget and
  quality-preserving rules behind bible §10.

**Not read wholesale, per `design/AGENTS.md` routing:** `design/` beyond the listed files,
`.campaign/`, assets beyond the located manifest path, transcripts.

---

## 2. Self-audit — closest rejection condition per scope item, and why the spec survives

For each of the 8 scope items: the rejection condition my own spec comes closest to violating,
stated plainly, and the defense. Two sections are flagged as weaker than the rest.

### Item 1 — Inward field ("the Intake")
- **Closest violation:** §4.1 (h)(4)/(5) — *capture flash / core pulse without a sim event.*
  My spec leans on a "capture" event that **does not exist yet** — PQ-012 is planned, not
  implemented, so the kernel event vocabulary (`field.strength`, `capturedRate`, capture
  threshold crossings) is prescribed, not shipped. If the kernel lands without a discrete
  capture receipt, the core flash becomes guesswork and dies by its own rejection condition.
- **Why it survives:** the prescription is written as *the event is the trigger or there is
  no flash* — the rejection conditions are the contract the kernel must satisfy, which is the
  bible's job (PQ-012's brief explicitly asks for "readable VFX" with "physical ownership").
  The dormant-pose rule means a kernel that ships strength-only still yields a legal field
  (flow speed ∝ strength, no event flashes).

### Item 2 — Outward field ("the Plow")
- **Closest violation:** §4.2 (h)(5) — *berm expanding radially as a loop.* A standing,
  churning berm of lobed smoke sprites is the single easiest effect in this document to
  implement badly as an outward-cycling ring — which would simultaneously trip the generic-
  ring ban and the Intake/Plow discrimination rule. The churn budget (lobe count, opacity
  cycling) is the least numerically pinned spec in the field sections.
- **Why it survives:** the berm is pinned to the shipped smoke-bucket idiom with fixed,
  seeded, resident lobe slots ("recycled in place"), and the anti-ring precedent is cited
  from the explosion pressure phase verbatim. The rejection condition is testable from a
  single motion capture: any lobe whose radius grows monotonically over a cycle fails.

### Item 3 — Directional clearing field ("the Sluice")
- **Closest violation:** §4.3 (h)(1) — *reads as a beam.* Two thin ribbons plus interior
  streaks is, at the narrowest corridor widths, one bad aspect ratio away from collapsing
  into the existing mining-beam silhouette. The spec's own 2-pixel floor (§2) bites here:
  below some corridor width the two banks are not resolvable at 72 wu.
- **Why it survives:** the spec makes asymmetry (flared mouth, exit fade, chevron point) the
  primary read rather than bank separation per se — three independent cues, two of which
  survive bank-merge. The honest residue: **this is the weakest field section.** A minimum
  corridor-width-to-radius constant is stated only through the mouth-flare ratio (1.4×); the
  implementing packet should expect to floor corridor width at ~8–10 wu and re-tune from
  captures. I could not derive that constant from shipped code because no corridor-like
  persistent effect exists in the tree today (the travel-corridor cue is a one-shot).

### Item 4 — Field boundary truth
- **Closest violation:** §4.4 (4) — *commitment margin <10% or >25% of R.* The 15% figure is
  a design judgment, not a shipped constant; nothing in the current tree pins a falloff
  margin because no bounded field exists yet. A reviewer could fairly call it arbitrary.
- **Why it survives:** it is stated as a *band* (10–25% legal, 15% nominal) whose failure
  modes are named (cliff/mush) and testable in captures, exactly the form the faction bible
  uses for roughness ranges. It is a taste ruling with mechanical teeth, presented as such —
  not smuggled in as a derived number. Flagged honestly as the softest number in the doc.

### Item 5 — Industrial beam contexts (PQ-016)
- **Closest violation:** §5 (1) — *same contact geometry recolored.* Extract inherits the
  shipped `_onMiningTick` contact wholesale ("formalize, keep, and name"), so extract-vs-cut
  discrimination rests heavily on kerf persistence and posture rather than a from-scratch
  extract contact. A lazy implementer could ship "mining beam + kerf toggle" and claim two
  contexts.
- **Why it survives:** the four contexts are separated in *three* channels (posture / contact
  geometry / material response), and the rejection conditions make two of the channels
  mechanically checkable from stills (ejecta presence/absence, kerf persistence, stitch
  accumulation, pulse direction). The repair context's faction-aware finish is the deepest
  spec in the doc because it rides the shipped faction repair practices. This section is one
  of the two strongest.

### Item 6 — Payload language
- **Closest violation:** §6 (3) — *destination thread without a live receiver.* The thread
  is the easiest element to leave on as decoration ("it looks cool"), and the mass-shadow is
  one relevance-gating bug away from always-on.
- **Why it survives:** both are specified as state-gated (thread exists only under a live
  delivery contract, mirroring Route Beam law; shadow follows the shipped trail-tier
  relevance gating). The grayscale ownership channel (transponder lit/unlit + collar count)
  is directly auditable. Moderate confidence; the destination thread's legibility at 1× is
  asserted, and is one of the things the four-capture protocol must actually prove.

### Item 7 — Planetary skim + reentry (PQ-013)
- **Closest violation:** §7.6 (2) — *plasma as a colored sphere/bloom blob.* The bow-shock
  sheath is a cone of plume material at planetary scale; scaled up naively, fbm volumes wash
  out into exactly the N64 blob SF-14 forbids. This is the highest-technical-risk
  prescription in the document: nothing in the shipped tree runs a plume volume at that size,
  so the "it survives the grade and the bloom at 1×" claim is extrapolation, not precedent.
- **Why it survives (conditionally):** the spec pins named techniques (two-layer
  `createPlumeVolume`, tongue breakup, fresnel shell, depth-soft intersection, tether-ramp
  hue) and makes the blob a mechanical reject; the staged silhouette sequence carries the
  read even if the plasma texture itself must be tuned down. **This is the weakest technical
  section and I say so plainly:** it needs an early visual spike in the PQ-013 packet with
  the four-capture protocol before any polish pass, and the heat-scalar → `uBoost` mapping
  will need live tuning, not paper values.

### Item 8 — HUD companions
- **Closest violation:** §8.4 (1)/(5) — *new permanent panel / instrument that reveals and
  stays.* A band pill that is visible whenever a planet is near is, in practice, a permanent
  panel near any planet — and PQ-013 is explicitly a place the player lingers.
- **Why it survives:** the spec binds every surface to the D5 velocity-tape ruling verbatim
  (reveal only while load-bearing, fade completely, motionReduce kills animation not
  information), routes the commit cue through the one-voice channel, and puts all three
  surfaces in the existing transient-chip socket rather than new chrome. This section is the
  other strongest, because every mechanism it uses is already shipped precedent (massSeedHud
  pill, chipShow, Ring Gauge law, BRAKE NOW pattern).

---

## 3. Honest weaknesses (unranked)

1. **The kernel does not exist yet.** Every field prescription assumes PQ-012 event/state
   vocabulary (strength, falloff exponent, capture/push/clear receipts, affected-entity
   bearings). The bible deliberately writes these as contracts-with-rejection-teeth rather
   than as descriptions of shipped behavior, but until the kernel lands, sections 4.1–4.4
   are unverifiable against live state. The mission framing (a taste constitution *for* the
   packets) licenses this; it is still the document's largest structural exposure.
2. **Two numbers are taste rulings, not derivations:** the 15% commitment margin (item 4)
   and the corridor mouth-flare 1.4× (item 3). Both are banded and capture-testable, but a
   reviewer should know they are argued, not measured. Everything else numeric in the doc is
   a shipped constant quoted from code.
3. **The planetary plasma scale-up is unproven in-tree** (item 7). Flagged in its audit row;
   it is the one place I prescribed beyond demonstrated technique, and it is gated behind a
   required early visual spike.
4. **Bloom behavior of the new non-blooming boundary materials is asserted, not captured.**
   The "boundary never blooms" law follows from the shipped bright-pass threshold (1.0) and
   material intensities quoted, but no capture in this pass proves a pip ring at 1× stays
   crisp under `uGrade = 1` + belt-sector lighting. First implementation pass should capture
   exactly that.
5. **I did not run the game's check suite.** This was a documentation deliverable in a
   worktree with no code changes; no checks apply to the diff itself. The bible's own
   acceptance protocols (§2 four-capture rule) are prescribed for the implementing packets,
   not executed here.

## 4. Compliance with the hard rules

- Worked only inside `C:\Users\93rob\sf-g0-design`. No other worktree touched.
- No `git add` / `commit` / `checkout` / `reset` / `clean` / `stash` was run at any point
  (verified: the only git command issued was `git status --short` + `git branch --show-current`
  at session start). Deliverables are uncommitted and untracked for the lead to review.
- Every prescription is grounded in opened files; citations name file and, where useful,
  line/symbol. The one brief-supplied path that did not exist
  (`design/foundry/material_profiles.json`) is reported above with the true location.
- All animation prescriptions are specifiable from seed/simTime via the shipped
  `explosionPattern01` integer-hash idiom or sim-published timestamps; the bible's §9 makes
  `Math.random()` in new emitters a mechanical reject.

DESIGN_BIBLE_OK
