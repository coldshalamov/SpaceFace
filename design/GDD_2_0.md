# SPACEFACE 2.0 — Game Design Document

**Status: AUTHORITATIVE.** This document governs all design decisions. Where it conflicts with
`V2_MASTER_PLAN.md`, `HUD_REVAMP_DESIGN.md` (superseded — see §9), or `IMPROVEMENT_IDEAS.md`, this wins.
`ARCHITECTURE.md` remains the authoritative *technical* contract; nothing here violates it.

**Companion doc:** `design/BUILD_PLAN_2_0.md` — workstreams, owners, acceptance criteria.

---

## 1. Pitch

**Freelancer's living universe, played top-down, with physics you can feel.**
Mine, trade, fight, and take contracts across a faction-contested frontier — in a ship that moves
like a real mass, tethers onto anything, and slingshots around asteroids at full burn.

## 2. The core diagnosis (why 1.x doesn't land)

Recon of the codebase (2026-07) found a production-grade simulation — deterministic 60 Hz fixed-timestep
sim, supply/demand economy, 9-tier faction reputation, deterministic mission boards, versioned saves —
underneath an experience layer that fails it. Every complaint traces to the surface, not the core:

| Complaint | Root cause (evidence) | Fix section |
|---|---|---|
| "Really hard to fly" | Split attention: arrows steer the ship, mouse aims weapons independently (`src/systems/flight.js:169`) | §4 |
| "Choppy" | 59.5 avg fps but 54 ms worst-frame hitches (measured in preview); shader compile + spawn spikes, not sustained load | §10 |
| "Combat weak" | Damage model is fine; feedback is whispery, AI intent unreadable, no physics verbs | §6 |
| "Mining UX bad" | Beam-hold → ore balls scatter → chase. Magnet exists (`mining.js:270`) but weak; zero skill expression | §5 |
| "Confused what to do" | 5 simultaneous text sources in the first play second (measured); objectives whisper from a corner | §8 |
| "Map useless (???)" | Galaxy map fogs *charted civilization* behind discovery flags (`starmap.js:521`); "what's around me" is buried on N | §7 |
| "No depth in background" | Single skydome nebula; zero parallax layers between camera and backdrop | §9 |
| "Missing the fun physics stuff" | **A complete tether/grapple system exists and is wired to nothing** (`src/combat/attachments.js`, dormant) | §4.3 |

**2.0 is not an engine rewrite. It is a design-led experience overhaul on a proven engine.**
We keep: Three.js + Rapier, the flat-state/event-bus/registry architecture, the XZ-plane sim,
the economy/faction/mission/save cores, the check-script harness. We change how the game *feels,
reads, and teaches*.

## 3. Design pillars

Every change must serve at least one. When in doubt, cut.

1. **Momentum is the toy.** Mass, inertia, tethers, and impulses are the game's signature. If a
   feature can be expressed through physics instead of a menu, express it through physics.
2. **Read the battlefield at a glance.** Top-down is a *readability superpower*. Every entity, threat,
   and opportunity is identifiable in one screen glance — silhouette, color, motion all carry meaning.
3. **One voice at a time.** The game never says two things at once. Objectives, tutorials, comms, and
   alerts share a single attention budget with strict priority.
4. **The universe was here before you.** Charted space is charted. Traffic flies its own routes.
   Prices move without you. Discovery means *frontier and secrets*, not "the map is blank."

## 4. Flight & the physics verbs

### 4.1 Control scheme — "Helm Assist" (new default)

The 1.x scheme (↑↓ throttle, ←→ bank-steer, mouse aims weapons separately) demands split attention
and is the #1 cause of "hard to fly." Replace the *default* with the modern top-down standard:

- **Ship nose follows the mouse cursor** (rate-limited by ship turn stats — big ships lag the cursor;
  that's the feel of mass, keep it).
- **W / S** = forward / reverse thrust. **A / D** = lateral strafe thrusters.
- **Shift** = boost (hold) / dash (tap) — unchanged, it's already good.
- **Space** = **brake-to-stop** (flight computer counter-thrusts to kill velocity). Every arcade-space
  game that feels good has this. Currently missing.
- Weapons converge on the cursor. Gimballed weapons track within their arc; fixed weapons shoot
  along the nose. (Existing gimbal support in `resolveEnemyWeapon` covers this.)

The legacy scheme remains selectable in Settings ("Classic Throttle"). The three flight-assist levels
(`assisted` / `drift` / `newtonian` in `flightDynamics.js`) stay; **Z** toggles assist off in-flight
for drift turns — assist-off + tether is the skill ceiling (§4.3).

**Feel targets** (tune in flight lab, verify by hand): cursor→nose response begins < 50 ms;
scout-class ships reach 90°of turn in < 0.45 s; hauler-class in ~1.4 s; full stop from cruise
via Space in < 2.5 s with visible counter-thrust VFX.

### 4.2 Speed tiers (Freelancer's travel grammar)

| Tier | Engage | Feel | Notes |
|---|---|---|---|
| Combat thrust | default | precise, full agility | weapons free |
| Boost / dash | Shift | punchy, energy-limited | existing system, keep |
| **Cruise** | Tab (charge 3 s) | 4× speed, agility crushed, weapons offline | drops instantly on damage or mass-lock near large objects — this *is* the pirate-ambush mechanic |
| Lanes & gates | existing | fastest, on rails | existing jump/gate flow, keep |

Cruise replaces nothing — it fills the dead-time gap between local flight and gates that currently
makes systems feel large-but-empty. Interdiction events (§6.4) hook here.

### 4.3 The tether (wire the dormant system — flagship feature)

`src/combat/attachments.js` + `masslineController.js` already implement rope/winch constraints on
Rapier joints with tension telemetry and break thresholds. Wire them into play:

- **Hold RMB** (when mining beam not active) or **G**: fire tether at reticle target within 260 wu.
  Attaches to asteroids, wrecks, cargo pods, stations (anchor points), and ships.
- **Scroll while tethered** = winch in/out (`reel()` exists). **G again / X** = cut.
- **Slingshot:** tether to a massive body, burn perpendicular, cut at the tangent — conservation of
  momentum does the rest. Rapier joint physics already produces this for free; our job is *feedback*:
  taut-line hum rising with tension, cable brightens toward break threshold, release *whipcrack* cue.
- **Combat uses:** yank light ships (mass ratio < 0.6) out of formation; anchor to a heavy hull and
  orbit-strafe it; tether a mine/charge cluster and *sling* it.
- **Industry uses:** haul ore chunks (§5), tow wrecks to salvage yards (new contract type), rescue
  drifting ships (mission flavor that already exists in the bar-rumor system).
- **Counterplay:** enemy tether-cutters exist in `check:47a:counterplay` scripts — surface them.

Tether telegraphy: line renders as a bright energy filament with sag/tension animation; break
threshold shown as color shift (cyan → amber → red). No numbers needed.

### 4.4 Impulse charges ("blast plates")

New secondary equipment: **sticky impulse bombs**. LMB-alt lobs a charge that adheres to hulls,
asteroids, or *your own rear plate*; **F** detonates all armed charges — each applies a radial
impulse (Rapier `applyImpulse`), damage secondary.

- Stick 2 to your own tail-plate = improvised second dash while boost is drained (Highfleet-style
  desperation move, and the user's explicit ask).
- Stick to an asteroid = turn it into a slow-motion wrecking ball toward a pirate nest.
- Stick to an enemy = knock it into its own escort's firing line. Physics comedy is content.
- Balance: charges are *cheap but heavy cargo* (economy sink), 6-second arm cooldown, friendly-fire on.

### 4.5 Mass is meaning

Collision damage already scales with impact (`impactScale` per material). Amplify the read:
camera-shake trauma and hit-pause scale with momentum exchanged, not damage dealt. A freighter
shrugging a fighter off its bow should *feel* like a truck vs. a bicycle. Ramming builds become
viable via a `mod_ram_plate` module (cheap, low-tier, teaches "mass = weapon" early).

## 5. Mining 2.0 — from chore to minigame

Keep: beam tiers, heat, ore tables, pickups, deterministic yields. Replace the *interaction loop*:

1. **Seams.** Every asteroid spawns 1–4 glowing fracture seams (deterministic from sector seed).
   Beam damage on a seam = 100% yield; off-seam = 35%. Asteroids slowly rotate — hitting seams is
   now an *aim-and-position* skill, and asteroid rotation finally matters.
2. **Heat is a rhythm, not a cap.** Beam heat rises; releasing in the amber band (70–95) grants a
   2 s "vent bonus" (+25% extraction rate). Overheat still locks the beam. This converts "hold RMB"
   into pulse-timing — the NMS/DRG trick that makes mining hypnotic instead of numb.
3. **Crack, don't pop.** At 0 hull the asteroid *fractures along its seams* into 2–3 chunks +
   an ore burst that **auto-vacuums**: magnet range 250 → **420 wu**, accel 280 → **520**, and
   pickups within 60 wu of the beam line collect *directly to cargo* (`directToCargo` flag exists).
   **The ball-chase is dead.** If you can see it, you're already collecting it.
4. **Rich cores.** 15% of asteroids reveal a core on fracture: hold-and-release a **charged drill
   shot** inside a shrinking timing ring for 3–8× rare yield. Miss = core cracks to vapor (tension!).
   The drill screen (`drill.js`) becomes this minigame's tuning bench.
5. **Big chunks are tether cargo.** Chunks over 20 u don't fit the hold — tether-haul them to a
   station refinery (or your claim's depot) for a bulk payout. Mining teaches the tether; the tether
   feeds mining. This is the loop-lock that makes both features feel inevitable.
6. **Danger pacing.** Mining noise/light raises a visible "attention" meter — pirates interdict
   loud miners (hooks the existing `dangerModel.js`). Quiet pulse-mining stays safe; greed gets loud.

## 6. Combat 2.0 — readable, physical, juicy

The damage kernel (shield→armor→hull, resists, status) is sound. The overhaul is grammar and feedback.

### 6.1 Damage triangle (make the existing model legible)
- **Energy** strips shields fast, weak vs armor. **Kinetic** cracks armor, sheds vs shields.
  **Explosive** wrecks hull and pushes (physics!), intercepted by point-defense.
- Target readout shows three segmented bars (shield / armor / hull) — color-coded, always visible
  on the target panel and mirrored as thin arcs around the enemy silhouette in-world.

### 6.2 AI readability (they're not "weird," they're mute)
The archetype FSM (swarmer/sniper/brawler/pirate/capital) is solid. Add **intent telegraphy**:
- 0.5 s engine-flare + audio sting before an attack run; wind-up glow on heavy weapons before alpha.
- Flee is *visible*: dumping cargo, smoke trail, comms bark ("Breaking off—"). Kill the mystery.
- **Formations-lite:** patrols fly wedges (offset-slot steering, no new pathfinding — the
  `check:sg06:formation` convergence work already exists); breaking the leader scatters them for
  8 s of morale panic. Readable group behavior for one week of work.
- Comms barks routed through the existing comms system with a 1-per-4s global cap (§8's voice budget).

### 6.3 The juice contract (every hit answers)
All via existing pooled VFX/audio/floating-text systems — this is wiring + tuning, no new tech:
- Shield hits: hex-ripple decal + pitch-rising *tink*; shield-break: full-ring flash + bass drop +
  0.3 trauma + 60 ms hit-stop (respect `motionReduce`).
- Armor hits: sparks + chunk debris; hull hits: smoke + fire pinpoints that persist with damage state.
- Kills: interior flash → breakup → shockwave ring + camera punch; kill-confirm reticle pip + comms bark.
- Damage numbers: **off by default**, one toggle (they fight pillar 2; the bars + VFX carry the info).
- Player damage direction: existing radial damage indicators are good — raise their contrast 2×.

### 6.4 Encounter shapes (steal Freelancer's ambush grammar)
- **Interdiction:** cruise near pirate space can be tripped (mass-snare VFX, "SNARED" banner) —
  2 waves, or pay the "toll" via comms choice (FTL-style event card, feeds the faction/econ sim).
- **Patrol friction:** lawful patrols scan cargo (existing contraband system!) — running the scan is
  a chase minigame through the asteroid field using tether-slingshots. Systems already exist; this is
  an orchestration script.
- **Bounty targets** (mission board) spawn with named ships + escort formations + one gimmick each
  (tether-cutter, PD screen, ram plating) so bounties read as *characters*, not stat lumps.

## 7. The information layer — maps, sensors, targets

### 7.1 Key policy (the "M" complaint, solved by convention)
- **M** = **Local System Map** (what is around me — the thing every space game binds to M).
- **N** = Galaxy/Sector map (rebrand in UI as "NAV CHART"; N for Nav keeps muscle memory).
- **Tab** = cycle hostiles, **T** = target under cursor/nearest, **C** = scanner pulse, **V** = cruise
  (Tab was cruise in §4.2 — resolve: cruise on **V**, Tab stays targeting). Full sheet on F1.

### 7.2 Discovery policy — "charted space is charted"
Core + mid-security sectors ship **fully charted** (stations, gates, lanes, hazards visible on both
maps from minute zero). The ??? fog applies only to: frontier sectors (edge of the graph), anomaly
sites, hidden pirate bases, and rumor-gated POIs. Buyable **survey data** at bars reveals frontier
sectors (new credit sink, existing bar-rumor plumbing). Discovery becomes a *reward for reaching the
edge*, not a tax on opening the map.

### 7.3 Local map (M) — the tactical answer
Full-screen, ship-centered, zoomable (existing `localmap.js` is 80% there):
- All static POIs + sensor-range contacts with IFF color + motion vectors.
- Click any POI → set course; autopilot flies combat-thrust/cruise mix (existing nav routes).
- Overlay toggles: threat ranges, asteroid ore classes (post-scan), trade-lane traffic density.

### 7.4 Scanner pulse (C) — make the invisible legible
NMS-style radial ping (8 s cooldown): highlights mineable seams + ore class glyphs for 20 s, flags
wrecks/cargo/anomalies within 1200 wu, pings hidden POIs as "?" markers on the local map (the only
place ??? is allowed — as *bait*). One system, three loops served (mining, salvage, exploration).

### 7.5 Overview strip (EVE's one great UI idea, miniaturized)
Right-edge compact list of nearby contacts: IFF chip, class glyph, name, distance, closing-speed
arrow. Click = target. Sort: hostiles first, then by distance. Cap 8 rows + "+N more". This kills
"wtf is around me" *without* opening any map. Collapsible for purists.

### 7.6 Minimap (existing radar, kept honest)
The existing radar widget stays bottom-right, but: IFF colors from the accessibility palette,
off-screen objective arrows on its bezel, station/gate glyphs instead of anonymous dots.

## 8. Onboarding & the attention budget

### 8.1 One-voice rule (pillar 3, enforced in code)
A single **attention arbiter** gates all text surfaces. Priority: death/danger alerts > tutorial
step > mission objective update > comms chatter > flavor barks. Lower tiers queue; comms chatter
drops if stale. The measured 5-simultaneous-text-sources opening becomes: one modal (skippable),
then *silence*, then the first objective line. Nothing else speaks for 20 s.

### 8.2 First fifteen minutes (rework pacing, reuse beats)
Existing STEPS are right; the delivery is a wall. New pacing — each beat completes before the next
speaks, each teaches exactly one verb:

1. **Wake** (0:00) — engines only. One line: "Thrust to the beacon." Learn W + mouse-nose.
2. **The derelict** (1:30) — tether tutorial: latch, winch, feel the mass, slingshot past. One line each.
3. **First seam** (3:00) — scanner pulse → seams glow → pulse-mine → watch ore vacuum in. The vent-bonus
   chime teaches rhythm silently.
4. **The snare** (5:00) — scripted weak pirate interdicts; brake (Space), damage triangle on his shield;
   he flees at 30% hull (teaches flee-read). First kill juice payoff.
5. **Dock at Helios** (7:00) — auto-dock prompt; sell ore; buy the tier-1 module the mission rewards
   suggest; board shows *exactly one* recommended job (existing recommendation system).
6. **Choice** (12:00) — three jobs: haul (trade loop), bounty (combat loop), survey (explore loop).
   The player picks their game. Tutorial ends. HUD "?" hints stay contextual thereafter.

### 8.3 Professional shell
Wire the built--but-dormant: telemetry (`createTelemetry` — funnel data tells us where players stall),
accessibility (link `accessibility.css`, call `applyAccessibility()`, radar shape-redundancy).
Settings gets: control-scheme picker, damage-numbers toggle, screen-shake slider. F1 = full keybind
sheet (exists as help screen — bind it and say so on the HUD's first minute).

## 9. Visual direction — depth, identity, readability

Supersedes `HUD_REVAMP_DESIGN.md`'s visor concept (rejected: no first-person/cockpit motifs in a
third-person game — no screen-edge arcs, no helmet avatars, no diegetic visor framing).

### 9.1 Parallax depth stack (the "background has no depth" fix)
Between backdrop and play plane, add camera-relative parallax layers (all cheap, all pooled):
1. Skydome nebula (exists) — parallax ~0.
2. **Far dust sheets** (2–3 additive planes, factor 0.15–0.3) — huge soft nebula wisps.
3. **Mid debris field** (instanced micro-rocks/motes, factor 0.5–0.7) — occasional slow tumble.
4. **Near dust motes** (factor 1.2–1.5, subtle) — the layer that *sells speed* during boost/cruise.
5. Play plane: ships, asteroids, stations (contact shadows already ground them).
Boost/cruise stretch near-mote streaks (classic warp-speed read). Motion-reduce halves densities.

### 9.2 Sector identity (data-driven palettes)
Lighting recon scored palette data-driveness 2/5 — fix: per-sector `palette` block in `sectors.js`
(key/rim/fill light colors + nebula tint + fog color + dust hue). Core worlds: clean cyan/steel.
Mining belts: rust/amber haze. Pirate fringes: sodium-red murk. Anomaly space: violet/green wrongness.
One glance at the screen tells you *where you are* — that's Freelancer's system-identity trick.

### 9.3 Readability pass
- Ships get faction-hue rim-light + engine glow; hostiles carry warm signatures, friendlies cool
  (redundant with IFF glyphs for colorblind safety — palette already built in `accessibility.js`).
- The ambiguous giant translucent spheres (planet atmospheres?) get horizon-line treatment + label
  on approach; nothing on screen may be unidentifiable for more than one second (pillar 2).
- Bloom: selective on emissives only (engines, seams, tether, weapon cores). Current threshold 0.65
  is close; audit per-material emissive intensities instead of cranking post.

### 9.4 HUD 2.0 (clean, non-diegetic, hierarchical)
Design principles (full mockup in build plan WS-B):
- **Three anchors, not seven:** bottom-left ship status cluster (hull/shield schematic + energy/boost/
  heat micro-bars — exists, keep), bottom-right radar + overview strip, top-center *single-line*
  priority channel (the attention arbiter's output). Everything else appears contextually.
- Bottom text-strip (SPD/THR/CARGO/CR) is retired; speed becomes a compact dial by the schematic;
  credits/cargo live on a contextual chip that appears on change, then fades.
- Type discipline: one mono family, three sizes, uppercase only for labels; the existing cyan/amber/
  red semantic palette stays (it's good and a11y-vetted).
- Nothing pulses or glows at rest (pillar 3 for the eyes). Glow = state change.

### 9.5 Audio direction
Procedural synth stays (zero-asset is a shipping advantage). Add: engine hum layered by thrust tier,
tether tension whine, vent-bonus chime, shield-break bass drop, sector-tinted ambient pads (one per
palette class). All existing `audioRecipes.js` patterns.

## 10. Performance & hitch elimination

Target: zero >32 ms frames in normal play on mid hardware. Measured hitches (54 ms worst) attack list:
1. **Shader/pipeline precompile** at boot & sector-load behind the existing loading veil
   (`renderer.compileAsync` for all material×light combos; play a hidden one-frame VFX salvo to warm
   particle/sprite pipelines).
2. **Spawn amortization:** stagger wave spawns across frames (spawner already queues; enforce ≤2
   mesh-builds/frame); pre-build one pooled mesh per enemy archetype at sector load.
3. **GC audit:** heap-profile 10 min of play; kill per-frame allocations found in event emissions and
   UI string building (10 Hz HUD strings — precompute/memoize).
4. Keep the `backdrop-filter` removals from the working tree (GPU cost on every overlay).
5. Frame budget guardrail in CI: extend `check:perf` with a hitch-count assertion (no frame > 32 ms
   during scripted 60 s combat+mining run).

## 11. Economy & progression (mostly surfacing, not new sim)

The economy sim is the codebase's crown jewel — expose it:
- **Price memory on maps:** last-seen buy/sell per station overlays the nav chart (Elite's market
  data). "Best known margin" line on the market screen using *only* data the player has seen (no
  omniscience — exploration has trade value).
- **Ship ladder stays** (13 hulls); add the **role fantasy kits**: ram plating, tether-winch upgrades
  (haul mass ↑), charge racks (impulse bombs), drill amps. Physics verbs get their own progression lane.
- Contract ladder + collateral + faction gates already work — the *board UI* gets risk/reward/distance
  glyphs and one recommended job (recommendation engine exists).
- New sinks tied to new verbs: charge ammo, tether cable tiers, survey data, refinery fees for chunk
  hauling. All priced into `CONTENT_BIBLE` scales.

## 12. Explicitly out of scope for 2.0

No multiplayer. No engine swap. No true-3D flight (the XZ plane is a feature). No procedural galaxy
regen (fixed sector graph is right for Freelancer-style authored identity). No new ship hulls until
the six verb-kits ship. No voice acting. Automation/claims/tech-tree stay as-is this cycle beyond
UI polish — they're depth for later, breadth now.

## 13. Success criteria (how we know 2.0 landed)

Telemetry funnel (now wired): first-kill < 6 min median, first-trade < 10 min, session-2 return
signal via save-continue rate. Feel checklist (manual, per build): cursor-response test, brake test,
slingshot ring-out test (can a tester whip 180° around Helios anchor at full boost?), "one voice"
audit (record 10 min, count overlapping text events — must be 0), hitch counter = 0 over scripted run,
and the five-second test: paused screenshot → a stranger names every entity on screen.

---
*Written by Claude (lead design), 2026-07-03, from full-codebase recon + live play baseline.
Reference lineage: Freelancer (travel grammar, faction life, encounter shapes), EVE (economy surfacing,
overview), No Man's Sky (scanner, mining rhythm), Endless Sky (top-down flight assist), Subspace/
Continuum (newtonian skill ceiling), FTL (event cards), DRG (seam mining), Highfleet (impulse desperation).*
