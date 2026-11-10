# D — FLIGHT, SHIP IDENTITY, BUILDS & MINING (gold packets)

> **Lane:** clusters **H** (flight & ship identity, 133–150), **I** (ship builds & modules, 361–400),
> **J** (mining as spatial play, 151–170).
> **Destinations:** **BP-07.1** (flight / ship-mass addendum) · **BP-09.1** (builds / synergies addendum)
> · **BP-02 / mining fold** (mining-as-spatial-play; steady mining already shipped).
>
> **THE ONE FILTER (applied to every item below):** *a detail earns its place only if the player can
> **see** it, **predict** it, or **change** it. If none of the three, it's not detail — it's cost.*
>
> **The load-bearing discovery of this lane:** the ship-mass simulation is **already built and already
> deterministic** — it is simply **invisible**. `getDerivedStats()` (`src/systems/ships.js`) computes
> `totalMass = baseMass + Σ moduleMass`, a `massRatio`, and folds it through `speedMass / thrustMass /
> turnMass / inertia`, plus `bankFactor / √massRatio`. Every fitted cargo pod already makes the hull turn
> slower and bank flatter — the player just has no glyph, tooltip, or feedback telling them so. **The
> overwhelming majority of high-value work in this lane is SURFACE, not NEW.** We are not building a mass
> system; we are drawing the one the sim already runs.

---

## Ranking (this lane's 3 highest-impact packets)

Ranked by **(distance from a shipped system) × (visibility in first-15 / 47-A "Mass Discrepancy")**.
The mass sim is *maximally close* to shipped and *maximally central* to the 47-A slice — those win.

1. **MASS-FEEL — the handling-delta readout** (BP-07.1). Every fit already changes handling; nothing shows
   it. This is the single largest "invisible system" in the lane and it is the literal substrate of the
   47-A "the inertia is wrong for this manifest" moment. Pure UI over a shipped computation.
2. **LOADOUT-SILHOUETTE — sockets tell the build** (BP-09.1). `fittingsForView` + `ship:appearanceChanged`
   already rebuild the mesh on refit; hardpoints/drill/engineMounts anchors already exist. Surfacing
   *empty vs filled vs damaged* sockets makes "read the build at a glance" real in the first target-scan.
3. **SEAM-SIGHT — the mining rhythm made visible** (BP-02 fold). Seams, rich cores, fracture, bulk-haul and
   mining-noise are all shipped but the player mines a grey rock with no read on *where* to aim or *when*
   the core opens. First-mining is a first-15 beat; this is the glance layer over a deep shipped loop.

---

# BP-07.1 — FLIGHT & SHIP-MASS ADDENDUM

*Applies after Wave-2 flight-feel tuning. Everything here layers **on top of** `flightV3.js` /
`getDerivedStats` without touching either — new HUD/telemetry-reader files only.*

---

### MASS-FEEL — the handling-delta readout
- **name:** MASS-FEEL (loadout → handling, made visible)
- **fantasy:** "I bolted on the big cargo pod and I can *feel* my nose go heavy — the game shows me exactly how much."
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-07.1
- **reuses:** `getDerivedStats` (`ships.js` — `massRatio`, `turnRate`, `maxSpeed`, `inertia`, `bankFactor`),
  the outfitting screen, `flightRuntime.diagnostics` (`flightV3.js` already publishes `stopDistance`,
  `driftAngle`, `forwardSpeed`).
- **newFiles:** `src/ui/panels/massDelta.js` (a pure read-only panel that diffs derived stats before/after
  a hypothetical fit).
- **noTouch:** `src/systems/ships.js`, `src/systems/flightV3.js`, `src/ui/screens/outfit*.js` (orchestrator wires the mount point).
- **budget:** spawn:none · voice:none · draw:none (DOM panel, redrawn on `ship:statsChanged`).
- **rng:** none / pure UI.
- **acceptance:** in the outfit screen, hovering a module shows a Δ row: `Turn −7% · Top speed −3% ·
  Stop distance +14m · Bank −0.08`. Numbers come straight from a second `getDerivedStats` call with the
  candidate fitting spliced in; a check asserts the panel's Δ equals `derived(after) − derived(before)`.
- **failureModes:** could read flat if it's just raw numbers — pair each Δ with a one-word verb tag
  ("heavier", "twitchier", "sluggish"). Do NOT recompute in the panel with its own formula (would drift
  from the sim's truth); always call the real `getDerivedStats`.
- **size:** S

### MASS-PERSONALITY — the per-hull handling fingerprint
- **name:** MASS-PERSONALITY (each hull flies like itself)
- **fantasy:** "The Kestrel darts, the Ironback lumbers, the Hornet snaps — and I knew that before I bought them."
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-07.1
- **reuses:** `bankFactor` per hull (SHIPPED, visibly rolls via `updateBank` in `flightV3.js`), `handling`,
  `FLIGHT_CLASS_TUNING` (`ships.js`: scout/fighter/miner/hauler/capital accel·turn·inertia rows), the
  per-hull `driveId` → `PROPULSION_PROFILES` family (`propulsionCatalog.js`).
- **newFiles:** `src/ui/panels/handlingProfile.js` (a small radar/bar readout: Agility · Inertia · Top
  Speed · Brake, derived from the flightModel).
- **noTouch:** `ships.js`, `flightV3.js`, `data/ships.js`, `propulsionCatalog.js`.
- **budget:** spawn:none · voice:none · draw:none.
- **rng:** none / pure UI.
- **acceptance:** the shipyard card for each of the 13 hulls shows a distinct 4-axis fingerprint; a check
  asserts the bars are computed from `flightModel.angularAccel / inertia / maxSpeed / angularBrake` and
  differ between (e.g.) `ship_kestrel`, `ship_ironback`, `ship_hornet`.
- **failureModes:** if it invents its own "agility" number it will lie about actual flight. Derive strictly
  from the flightModel fields the sim uses. Keep it a *comparison* aid, not a stat dump.
- **size:** S

### DRIVE-VOICE — the drive family you can hear and see
- **name:** DRIVE-VOICE (torch vs reaction vs sail read differently)
- **fantasy:** "My new torch drive *spools* before it shoves — I hear the wind-up and time my burns around it."
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-07.1
- **reuses:** `PROPULSION_PROFILES` families (reaction / gravimetric / pulse_plate / torch / field_sail) and
  their authored `spoolUpS`, `minChargeS/maxChargeS`, `deploymentS`, `boostSpeedMult` (all SHIPPED in
  `propulsionCatalog.js`); the existing `ship:thrust` / `ship:boostStart` events + `flight:modeChanged`.
- **newFiles:** `src/render/driveSignature.js` (maps `profile.family` → plume shape/color + an audio-cue
  id; listens to the shipped thrust events).
- **noTouch:** `propulsionKernel.js`, `flightV3.js`, `audioSystem.js` (orchestrator registers the cue map).
- **budget:** spawn:none · voice:none (audio *cues*, not voiceArbiter lines) · draw:+0 (recolors the
  existing plume; no new draw call).
- **rng:** none.
- **acceptance:** switching the player's drive family changes plume silhouette + spool audio; the torch
  drive's `spoolUpS` produces an audible/visible wind-up before full thrust. Check: `driveSignature`
  resolves a distinct signature object for each of the 5 families.
- **failureModes:** overdoing audio → masks combat cues; route through the existing audio-priority so
  shield-break/lock never gets buried. Never spawn plume VFX unbounded — reuse the single plume node.
- **size:** M

### OVERLOAD-HANDLING — the "your hold is dragging you" warning
- **name:** OVERLOAD-HANDLING (cargo/armor over-mass is legible)
- **fantasy:** "I'm 90% full and the game warns me my brakes won't save me before that gate — so I dump or commit."
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-07.1
- **reuses:** `massRatio` + `stopDistance`/`stopTimeS` (already published to `flightRuntime.diagnostics` by
  `flightV3._publishPlayerDiagnostics`), `cargo.usedMass`, the flight HUD.
- **newFiles:** `src/ui/hud/massWarn.js` (a HUD tell that arms when `massRatio` crosses a hull-relative
  threshold and shows live stop-distance).
- **noTouch:** `flightV3.js`, `hud.js` (orchestrator injects the tell).
- **budget:** spawn:none · voice:none · draw:none.
- **rng:** none / pure UI.
- **acceptance:** loading cargo past a threshold surfaces a "HEAVY" HUD tell + a live stop-distance meter;
  jettisoning clears it. Check asserts the tell arms exactly when `derived.mass / baseMass` exceeds the
  threshold.
- **failureModes:** nagging when unloaded reads as noise — gate it to genuinely mass-limited states and let
  it decay. Do not block flight; it *informs*, never vetoes.
- **size:** S

### HULL-SCARS — persistent damage you can see until you pay
- **name:** HULL-SCARS (combat leaves marks; repair erases them)
- **fantasy:** "My hull's still scorched from the ambush two sectors back — the story's written on the plating."
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-07.1
- **reuses:** hull-fraction (`e.hull / e.hullMax`), the procedural hull builder's plating/greeble system
  (`visuals.tiers[].hints.plating`), `mod_repair_nanobots_m` OOC repair + dock repair events.
- **newFiles:** `src/render/hullScars.js` (a scar-decal overlay keyed to current hull fraction + a seeded
  scar layout).
- **noTouch:** `visualFactory.js`, `combat.js`, `ships.js`.
- **budget:** spawn:none · voice:none · draw:+0–1 (a decal layer on the existing mesh, LOD-culled).
- **rng:** seeded — scar placement from `hash32(seed, shipId, 'scars')`; never per-frame `Math.random` in sim.
- **acceptance:** taking hull damage adds visible scarring that persists across sectors/saves and clears on
  full repair. Check: scar count is a pure function of min-hull-fraction-since-repair (deterministic replay).
- **failureModes:** if scars scale with *current* hull they'd vanish as shields regen — key to the
  *lowest hull reached since last repair* so they persist. Cull at far LOD (perf).
- **size:** M

---

# BP-09.1 — SHIP BUILDS & MODULE SYNERGIES ADDENDUM

*Applies after Wave-2. The modules exist (`modules.js`); the mounts exist (`data/ships.js` visuals). This
addendum makes builds **legible** and gives synergies a **visible drawback** the player can predict.*

---

### LOADOUT-SILHOUETTE — sockets tell the build
- **name:** LOADOUT-SILHOUETTE (empty vs filled vs broken sockets)
- **fantasy:** "That hull's got a drill head, a full charge rack and a ram plate — it's a demolition rig, and I can see it."
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-09.1
- **reuses:** `fittingsForView` + `ship:appearanceChanged` (SHIPPED — mesh already rebuilds on refit),
  `visuals.hardpoints/engineMounts/drill/sensor` anchors, the role-kit modules (`mod_ram_plate`,
  `mod_winch_hd`, `mod_charge_rack`, `mod_drill_amp`).
- **newFiles:** `src/render/socketProps.js` (attaches a small prop mesh per *utility/mining* fitting at its
  authored anchor: ram-plate on the nose, charge-rack on the spine, drill on the drill anchor).
- **noTouch:** `visualFactory.js`, `ships.js`, `data/ships.js`.
- **budget:** spawn:none · voice:none · draw:+1–3 (small props, merged into the hull mesh at build time).
- **rng:** none.
- **acceptance:** fitting `mod_ram_plate` adds a visible nose plate; fitting `mod_charge_rack` adds a spine
  rack; unfitting removes it (via the existing `ship:appearanceChanged` rebuild). A check maps each
  visible-prop module id → an anchor and asserts the prop appears only when fitted.
- **failureModes:** over-cluttering the silhouette breaks "read at a glance" — cap visible props per hull
  (silhouette budget) and only surface the *identity-defining* modules, not every S utility.
- **size:** M

### BUILD-ID — the archetype badge the scan reveals
- **name:** BUILD-ID (control-scout / truck / stealth-miner / demolition …)
- **fantasy:** "I scan the hauler and the panel says 'Rammer-Truck' — I know how it fights before it moves."
- **pillar:** glance
- **wave/BP:** W3 / BP-09.1
- **reuses:** `data.fittings` (SHIPPED per entity), the scanner reveal loop (`scanner.js`), the target panel.
- **newFiles:** `src/systems/buildIdentity.js` (a pure classifier: given a fittings array → one archetype
  label from a static rule table, e.g. ram-plate + cargo → "Truck"; winch + brake → "Controller").
- **noTouch:** `scanner.js`, `combat.js`, target-panel UI (orchestrator wires the classifier output in).
- **budget:** spawn:none · voice:none · draw:none.
- **rng:** none (deterministic rule table over fittings).
- **acceptance:** scanning a fitted ship shows an archetype badge derived only from its modules; a check
  feeds the 13 hull default loadouts through the classifier and asserts stable, distinct labels.
- **failureModes:** a rule table that returns "Unknown" for most builds reads flat — ensure every legal
  loadout maps to *some* archetype (fallback by hull family). Keep it cosmetic/informational (contract §3.2:
  never couple to hostility).
- **size:** S

### SYNERGY-TELLS — modules that combine, and the cost of it
- **name:** SYNERGY-TELLS (ram+cargo = truck, with a visible drawback)
- **fantasy:** "Ram plate plus a loaded hold makes me a battering ram — but I turn like a barn door, and I feel it."
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-09.1
- **reuses:** SHIPPED synergy substrate — `mod_ram_plate` (`ramDamageDealtMult`/`ramSelfDamageMult`) +
  the mass→turn coupling; `mod_winch_hd` (`tetherReelRateMult`) + tether helm authority (`flightV3`
  `TETHER_HELM_*`); `mod_drill_amp` (`richCoreRingPctBonus`) + `miningNoise`; `mod_charge_rack`
  (`impulseChargeCapacity`). All already read by their systems.
- **newFiles:** `src/data/synergies.js` (a **data-only** table naming recognized module *pairs* → one
  fantasy line + the drawback line; consumed by BUILD-ID and MASS-FEEL panels).
- **noTouch:** `modules.js`, `mining.js`, `flightV3.js`, `combat.js` (no behavior change — the synergies
  already emerge from the shipped stat couplings; this only *names* them).
- **budget:** spawn:none · voice:none · draw:none.
- **rng:** none.
- **acceptance:** fitting a recognized pair (e.g. ram-plate + a cargo module) surfaces a "Synergy: Rammer-
  Truck — +ram damage, −turn rate" note in the outfit panel; the drawback half is the *actual* Δ from
  MASS-FEEL, not a claimed one. Check: every synergy row's drawback matches the derived-stat delta.
- **failureModes:** promising a synergy the sim doesn't actually produce = a lie the player catches. Only
  list pairs whose effect is *already* mechanically real. No new stat coupling in this packet.
- **size:** S

### MODULE-DRAWBACK-GLYPHS — the risk a fit carries, before you undock
- **name:** MODULE-DRAWBACK-GLYPHS (illegal / hot / loud / heavy)
- **fantasy:** "The smuggler hold glows contraband-red in my fitting list — I know customs will care."
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-09.1
- **reuses:** SHIPPED module flags — `mod_smuggler_hold` `legality:'contraband'` + `hiddenCargoPct`;
  `energyDraw` (over-draw = brownout risk); the `miningNoise` coupling for high-output mining; the
  `continuousDrain` aggregate already computed in `getDerivedStats`.
- **newFiles:** `src/ui/panels/moduleRisk.js` (renders a risk glyph strip per fitting from static flags +
  derived aggregates).
- **noTouch:** `modules.js`, `ships.js`, `economy.js`.
- **budget:** spawn:none · voice:none · draw:none.
- **rng:** none / pure UI.
- **acceptance:** the outfit list shows a "contraband" glyph on the smuggler hold and a "power-hungry"
  glyph when `continuousDrain` exceeds `capRegen`; a check asserts glyphs map to real flags/aggregates.
- **failureModes:** inventing drawbacks that don't exist in code (e.g. "prototype overheats" for a module
  with no heat model) — only surface risks the sim actually enforces. Everything else is DEFERRED gold-plating.
- **size:** S

---

# BP-02 / MINING FOLD — MINING AS SPATIAL PLAY

*Steady per-tick mining, seams, fracture, rich cores, bulk-haul-via-tether, direct-to-cargo, and
mining-noise are **SHIPPED** (`mining.js`, `WORLD_OVERHAUL_2_1.md`). This fold **surfaces** that depth and
adds the few genuinely-new spatial verbs that pass the filter. Everything spawning hostiles is a
`spawnBudget` client.*

---

### SEAM-SIGHT — the mining rhythm made visible
- **name:** SEAM-SIGHT (aim the seam, feel the yield spike)
- **fantasy:** "I sweep the beam until the rock *chimes* and glows at the seam — that's where the ore is, and I hold it there."
- **pillar:** glance · momentum-toy
- **wave/BP:** W3 / BP-02 fold
- **reuses:** SHIPPED seams (`deriveAsteroidSeams`, `_seamYield`, `SEAM_YIELD_OFF 0.35` vs `1.0` on-seam),
  `mining:seamHit` / `mining:tick` (carries `seamHit`, `yieldMult`, `contactPos`), the beam-line render.
- **newFiles:** `src/render/seamGlints.js` (draws seam glints on the target rock + a beam-tip flare on
  `mining:seamHit`; audio cue on the seam-hit event).
- **noTouch:** `mining.js`, `data/mining.js`, `vfx.js` (orchestrator registers the render hook).
- **budget:** spawn:none · voice:none (audio *cue*) · draw:+0–1 (glints on the one locked rock only).
- **rng:** none (seams are already seeded in the data layer).
- **acceptance:** the locked asteroid shows its seam points; landing the beam on one triggers a glint +
  chime and the yield visibly accelerates. Check: glint positions equal `seamWorldPoint(ast, seam)` for the
  rock's seams; off-seam vs on-seam yield ratio matches `SEAM_YIELD_OFF`.
- **failureModes:** showing seams on *every* rock in the field clutters the glance layer — reveal only on
  the soft-locked/scanned rock. Keep glints cheap (no per-rock VFX spawn).
- **size:** M

### CORE-BREACH — the rich-core timing window, telegraphed
- **name:** CORE-BREACH (the core opens — hit the beat)
- **fantasy:** "The rock cracks open on a glowing core and a window opens — I hold the beam and *nail* the timing for the motherlode."
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-02 fold
- **reuses:** SHIPPED rich-core loop (`_maybeExposeRichCore`, `richCorePlan` seeded via
  `hash32(seed, id, 'rich_core')`, `mining:richCoreExposed/ChargeStart/Completed/Fizzle`, the timing
  window `windowPct` + `mod_drill_amp richCoreRingPctBonus`).
- **newFiles:** `src/ui/hud/coreWindow.js` (a radial timing meter that appears on `richCoreExposed` and
  resolves on completed/fizzle; the fizzle audio cue is already emitted by mining.js).
- **noTouch:** `mining.js`.
- **budget:** spawn:none · voice:none · draw:none (HUD ring).
- **rng:** seeded (all core rolls already use the seed/`state.rng`; UI reads, never rolls).
- **acceptance:** exposing a rich core shows a shrinking timing ring; releasing the beam mid-window pays the
  multiplier, off-window fizzles. Check: ring geometry tracks `chargeT / durationS` and the hit/miss matches
  `_resolveRichCore`'s `windowPct` band.
- **failureModes:** a window the player can't perceive reads as random loss — the ring must telegraph the
  band widened by `richCoreRingPctBonus` so the Drill Amp's benefit is *visible*. Don't add a second RNG roll.
- **size:** S

### TOW-THE-CHUNK — the big-chunk bulk-haul, surfaced as a physics verb
- **name:** TOW-THE-CHUNK (tether the boulder, haul it to the refinery)
- **fantasy:** "This chunk's too big to vacuum — I sink a tether into it and *drag* the whole boulder to the refinery for a bulk bounty."
- **pillar:** momentum-toy · world-was-here
- **wave/BP:** W3 / BP-02 fold
- **reuses:** SHIPPED bulk-haul (`isBulkHaulChunk`, `BULK_HAUL_MIN_U`, `mining:bulkRequiresTether` when a
  chunk is too massive to beam, `bulkHaulPayoutForChunk`, `_onDocked` refinery credit), the tether/massline
  attachment, the mass→handling coupling (a towed chunk should feel heavy — it already adds tether strain).
- **newFiles:** `src/ui/prompts/bulkHaulTag.js` (a world-space tag on over-`MIN_U` chunks reading
  "TETHER TO HAUL · {massU}u" + a refinery route hint on the map).
- **noTouch:** `mining.js`, `tether`/`combat.js`, `galaxyMap.js`.
- **budget:** spawn:none · voice:none · draw:+1 (a world label on the active chunk).
- **rng:** none.
- **acceptance:** beaming an oversized chunk emits `mining:bulkRequiresTether` and shows the tag; tethering
  + docking a refinery pays via `_onDocked`. Check already exists in spirit (`scripts/check-mining-2.mjs`);
  add an assert that the tag arms exactly when `bulkChunkMass(chunk) > BULK_HAUL_MIN_U`.
- **failureModes:** if the tag shows on every fracture chunk it's noise — only on chunks over the haul
  threshold. Reuse the existing tether; do not add a second drag mechanic.
- **size:** M

### LOUD-DRILL — mining noise that actually draws attention
- **name:** LOUD-DRILL (mine loud, get found)
- **fantasy:** "My industrial extractor is *screaming* across the belt — I watch the noise gauge climb and know pirates can hear me."
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-02 fold (spawn side is a BP-13 pirate-ecology client)
- **reuses:** SHIPPED `miningNoise` accumulator + `danger:miningNoise` event (fires at `MINING_NOISE_DANGER
  70`) — *currently emitted but not consumed*; `encounterDirector` + `spawnBudget` for the response.
- **newFiles:** `src/ui/hud/noiseGauge.js` (surfaces the shipped `state.player.miningNoise` 0–100 as a
  gauge). The *spawn response* to `danger:miningNoise` is authored in BP-13 as a `spawnBudget` client, not here.
- **noTouch:** `mining.js`, `encounterDirector.js`, `spawnBudget.js`.
- **budget:** spawn:none *in this packet* (the BP-13 client owns request/release; MAX 12, ambient headroom 8)
  · voice:none · draw:none.
- **rng:** seeded (any spawn is via `encounterDirector`'s domain).
- **acceptance:** sustained mining fills the noise gauge; crossing 70 flips it to a warning state. The
  pirate-draw is a separate BP-13 packet that *consumes* `danger:miningNoise` through `spawnBudget`. Check:
  gauge value equals `state.player.miningNoise`; crossing 70 emits exactly once (already true in `_updateMiningNoise`).
- **failureModes:** wiring a spawn directly here would bypass `spawnBudget` (contract violation) — this
  packet is **surface only**; the spawn is deferred to the arbitrated BP-13 client. Quiet-vs-loud drill
  *upgrades* are DEFERRED (gold-plating) unless a noise-reducing module is added to `modules.js` by BP-09.
- **size:** S

### SPIN-AND-DRIFT — moving rocks as a skill check
- **name:** SPIN-AND-DRIFT (match the rock's motion to keep the beam on the seam)
- **fantasy:** "This rock's tumbling — I have to fly *with* its spin to keep my beam on the vein. Mining becomes flying."
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-02 fold
- **reuses:** SHIPPED asteroid `rot`/`angVel` (fracture chunks already get `angVel`; `seamWorldPoint`
  already rotates seams by `ast.rot`), the beam-line + seam-yield contact test, the flight model.
- **newFiles:** `src/data/asteroidMotion.js` (a **data-only** per-field flag table: some fields spawn rocks
  with a seeded spin/drift; consumed by the world spawner via a registration instruction, not an edit here).
- **noTouch:** `mining.js`, `world.js`, `data/mining.js` (orchestrator applies the spin at spawn from the flag).
- **budget:** spawn:none · voice:none · draw:none.
- **rng:** seeded — spin/drift magnitude from `hash32(seed, asteroidId, 'spin')`; sim never calls `Math.random`.
- **acceptance:** flagged fields spawn rotating/drifting rocks; because `seamWorldPoint` already rotates by
  `ast.rot`, the seam physically moves and the player must track it — richer yield rewards staying on it.
  Check: a spun rock's seam world-position changes over time and on-seam mult still resolves correctly.
- **failureModes:** fast spin on a big rock = unplayable; cap `angVel` by radius. This must not desync
  determinism — the spin is integrated by the existing physics from a seeded initial `angVel`, no per-frame roll.
- **size:** M

### FIELD-MEMORY — over-mined belts remember
- **name:** FIELD-MEMORY (a picked-clean field pays less; the frontier pays more)
- **fantasy:** "I've stripped this safe belt for hours and the yields are thinning — the good ore's out where it's dangerous."
- **pillar:** world-was-here · glance
- **wave/BP:** W3 / BP-02 fold
- **reuses:** SHIPPED `asteroid:destroyed` + `d.respawnAt` per-field respawn, `d.fieldId` (already stamped on
  chunks), `sectorZones` as the field substrate, the ore weighted-roll (`_rollOre`).
- **newFiles:** `src/systems/fieldDepletion.js` (a per-`fieldId` deterministic depletion counter that
  biases respawn richness down as extraction accumulates; publishes a "depleted/rich" read for the map).
- **noTouch:** `mining.js`, `world.js`, `galaxyMap.js` (orchestrator wires the depletion read into respawn + map).
- **budget:** spawn:none · voice:none · draw:none.
- **rng:** seeded — depletion is a pure function of accumulated extraction per `fieldId` (deterministic;
  save-persisted counter, no roll).
- **acceptance:** repeatedly mining one field lowers its subsequent yields/richness; the map surfaces a
  "depleted" vs "rich" tag per field. Check: depletion is a monotone function of total ore extracted from
  that `fieldId`; save/reload preserves it (deterministic replay).
- **failureModes:** punishing the player for mining at all reads bad — depletion must be *gradual* and
  *recoverable* (slow regen over time) so it's a spatial-economic nudge, not a wall. "Sell survey data of
  rich fields" is DEFERRED (needs a data-commodity path that doesn't exist yet).
- **size:** M

### FRAGILE-ORE — ram it and lose it
- **name:** FRAGILE-ORE (some cargo shatters on impact)
- **fantasy:** "Those raw crystals are worth a fortune *intact* — one careless collision and I'm hauling dust."
- **pillar:** momentum-toy · glance
- **wave/BP:** W3 / BP-02 fold
- **reuses:** SHIPPED ore `tags` (`crystal`, `rare`, `exotic` in `data/mining.js`), the collision/impact
  events (`combat.js` ram impulse), cargo value.
- **newFiles:** `src/systems/fragileCargo.js` (on a hard collision, applies a value/quantity haircut to
  fragile-tagged cargo; surfaces a "fragile — fly gently" cargo glyph).
- **noTouch:** `cargo.js`, `combat.js`, `mining.js`.
- **budget:** spawn:none · voice:none · draw:none.
- **rng:** seeded (any haircut roll uses a named sim domain; prefer a deterministic impact→loss curve, no roll).
- **acceptance:** carrying `crystal`/`gem`-tagged ore and taking a hard ram reduces its value; the cargo
  panel flags fragile stacks. Check: loss is a deterministic function of impact impulse; non-fragile cargo is
  untouched.
- **failureModes:** silent value loss feels like a bug — always pair with the glyph + a one-line toast on
  loss (via voiceArbiter, one voice). Keep the haircut small so it teaches, not punishes.
- **size:** S

---

## VALIDATED (already shipped — reframed, NOT rebuilt)

| Brainstorm item | Shipped system it already is |
|---|---|
| "steady per-tick mining / no silent-beam-then-dump" (J) | `applyMining` continuous ore delivery (`mining.js`; `WORLD_OVERHAUL_2_1.md §Mining`) |
| "loadout affects flight — cargo mass → accel, armor → turn" (H) | `getDerivedStats` mass→`speedMass/thrustMass/turnMass/inertia` coupling (SHIPPED; invisible → SURFACE via MASS-FEEL) |
| "ship-mass personality per hull — bank/roll" (H) | per-hull `bankFactor` + `updateBank` roll (`flightV3.js`), `FLIGHT_CLASS_TUNING` |
| "impulse charges as physics tools first" (H) | boost/dash impulse via `queuePhysicsImpulse` + `mod_charge_rack` (`flightV3.js`, `modules.js`) |
| "tether-stabilized seams / tether helm" (H,J) | `TETHER_HELM_*` authority in `flightV3.js` + `activeMineableTetherTarget` in `mining.js` |
| "direct-to-cargo / rich cores / fracture" (J) | `directToCargo`, `_maybeExposeRichCore`, `_fractureAsteroid` (SHIPPED; surfaced by CORE-BREACH/SEAM-SIGHT) |
| "visible hull modules rebuild on refit" (I) | `fittingsForView` + `ship:appearanceChanged` mesh rebuild (`ships.js`) |
| "module drawbacks — contraband hold" (I) | `mod_smuggler_hold legality:'contraband'` + `hiddenCargoPct` (`modules.js`; surfaced by MODULE-DRAWBACK-GLYPHS) |

## CUT / DEFER (no packet written)

| Item | Bucket | One-line reason |
|---|---|---|
| Used-ship market with quirks/history (ex-patrol, pirate-modified…) | DEFER | Named gold-plating in doctrine §8; wrong decade. |
| Newtonian trick medals (slingshots/drift-kills/tether-saves) | DEFER | Named gold-plating §8; a scoring meta-layer, not core legibility. |
| Training rings / flight-mastery contracts near Helios | DEFER | Named gold-plating §8; onboarding owns the first-15 proof ritual (cluster P). |
| Quiet-drill vs loud-drill *upgrade tree* | DEFER | Needs new modules + a noise-reduction stat; LOUD-DRILL surfaces the shipped gauge, that's the earned part. |
| Mining drones (recall/defend/upgrade/abandon) | DEFER | `mod_drone_bay_l` exists but a full drone-command loop is BP-06/BP-09 machinery, not a detail packet. |
| Named ships as rewards (unique hulls) | DEFER | Reward-design decision for BP-05/BP-09, not an anti-flatness detail. |
| Sell survey-data of rich fields as map commodity | DEFER | No map-data commodity/path exists; FIELD-MEMORY ships the *memory*, the resale is future work. |
| Black-market buyers for unlicensed ore / claim-jump rep with Drift | RESHAPE→BP-12/BP-13 | Economy/rep machinery lives in the causal-economy + pirate-ecology BPs; mining fold only surfaces the *noise/claim* tell. |
| Insurance grade from reckless collisions | DEFER | Economy meta-system; no insurance model shipped. |
| Shielded corporate claim-tag asteroids (hard-gated rocks) | RESHAPE | The *tell* (a claim glyph) is cheap and world-was-here; the *gating behavior* is BP-06 territory/access — fold the glyph into BP-11 station/territory, not here. |
