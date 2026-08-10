<!-- LIFETIME: DURABLE (living audit — update as items land) -->
# Vision Alignment Plan — closing the gap between the build and VISION.md

**Provenance:** five parallel domain audits (combat/physics, visuals/VFX, living world,
rewards/progression, docs/planning) run 2026-08-10 against `design/VISION.md`. File/line references
were verified at audit time; re-verify a constant before editing it — code moves.

## The headline

**The build is much closer to the vision than it looks.** The core verbs exist and are wired to
production: weapon impulse + tumble torque on every hit, gravity fields (Well/Repulsor/Cone) as
Day-1 baseline verbs, Massline throw/whip damage, collision stagger/tumble control-loss, a
magnetized loot-shard fountain on kills, durable wrecks, ace pirates who return, a real
stock-elastic economy, and a law/dispatch system. TTK is already tuned fast (wasp ~3s), and the
active queue's top program is literally "Physics as Spectacle."

The dreariness and the missing "delightfully abusive" feel come from a small number of **specific
constants, gates, and never-wired connections** — not missing architecture.

## The Big Five unlocks (highest leverage, ordered)

### 1. Ship-into-ship collisions deal zero damage by default
`src/combat/impulseKernel.js` `SURFACE_DAMAGE_MULTIPLIER = { terrain: 1.15, structure: 1, debris: 0.8, craft: 0 }`.
Slamming an enemy into *terrain* kills; shoving enemy A into enemy B is a physics-only no-op unless
the player fitted `mod_ram_plate`. This single `craft: 0` blocks VISION.md's "thrown into other
enemies" beat for every non-Massline weapon. (Massline whip-throws already deal real damage via
`combat.js::onWhipImpact` — that path is healthy.) **Fix: give `craft` a real baseline (~0.5–0.7),
keep Ram Plate as a multiplier on top; then check the whip path doesn't double-count.**

### 2. The dreariness is encoded in constants
- Bloom is suppressed in **every** sector: base `DEFAULT_BLOOM_STRENGTH=0.35` (`src/render/bloom.js`),
  and every profile in `src/data/sectorVisualProfiles.js` *further* multiplies strength down
  (0.55–0.75×) and raises threshold (+0.16..0.28). No sector pushes above baseline. Net: ~0.19–0.26.
- The hero ship is warm-grey: `src/render/ships/kestrelHero.js` COLOR block (`shell:'#817b70'`,
  majority graphite/gunmetal assignments).
- Unfactioned NPC fallback hull is slate grey `#6b7280` (`src/render/partsLibrary.js::paletteFor`),
  and faction `hull` fields (the majority surface) are systematically paler than their vivid accents.
- Velocity trails are *deliberately* minimized by ADR "D7" (`src/render/velocityLanguage.js`):
  additive blending banned, alpha capped 0.20, streaks fade out at high speed — the direct inverse
  of VISION.md's "long velocity trails." **Overturning D7 is an owner call (logged below).**
- A full VFX library (`src/vfxnext/` — propulsion, reentry, fields, capital destruction) is authored
  but **never imported at runtime**; massline/impact families were hand-ported into
  `src/render/vfx.js` already and prove the porting template.

**Fix: flip every sector post block to strength ≥1 / threshold bias ≤0, raise the base, repaint
kestrelHero + faction/team-fallback hulls to saturated paint, then port the remaining vfxnext
families.** Camera juice (FOV punch, hit-stop) is already adequate — don't rebuild it.

### 3. Pirates never hunt anyone but the player
`src/systems/traffic.js` "pirate" role is `archetype:'fleeing_trader'` (it *flees*);
`src/ai/engagementAuthority.js` hard-blocks hostility whenever either side is team 2; every
`retaliationTargetId` call site targets the player; every pirate faction doctrine has an empty
`firstFireAgainst` (and Pitborn sets `civilianHullsSacrosanct: true`). So the canonical chain
(miner → hauler → **pirates notice traffic** → patrols respond → player intervenes) breaks at its
most important link — while the response machinery (lawSecurity incidents/dispatch, killer-agnostic
`aftermathWrecks`, freight-loss economy pressure) is **already built and merely never triggered**.
**Fix: give raider-doctrine ships autonomous target acquisition against unescorted civilian traffic
+ a narrow engagementAuthority carve-out. Best effort-to-payoff ratio in the whole audit.**
Also: scripted convoy losses are economically silent (`encounterScripts.js` "No delivery, no
pressure") though ambient traffic already has the wiring; and killing a hauler yields ~0.042 heat
(no `shipClass` → 0.15 mult, sub-threshold heat zeroed every tick) so a headline crime produces no
WANTED — a two-line tuning bug.

### 4. The reward fountain pays pocket change
`lootShards` is ON in production and pickups magnetize correctly — but a kill drops ~20–30cr
against 220,000cr modules, and the *bulk* payout is parking on a wreck for an 8-second beam drain.
The dopamine loop exists; the economics and pacing bury it. `mod_sensor_array_l` carries a
`scanRpBonus` flag that is wired **nowhere** — research points (the currency that buys new verbs)
come only from mission-debrief menus. **Fix: raise shard EV substantially, add an instant
magnetized burst on wreck kills (keep beam-salvage for derelicts), wire `scanRpBonus`, and let
career-ladder steps grant modules/tech directly instead of only credits+rep.**

### 5. No swarms
`src/systems/spawnBudget.js` `DEFAULT_MAX = 12` concurrent hostiles sector-wide; encounter squads
mostly `[1,2]`–`[2,4]`. "Light enemies are almost ammunition" needs volume. **Fix: raise the cap
and bias light-archetype squads to [4,6]+; terrain philosophy (few big anchors) already protects
readability.**

## Owner calls needed (design decisions — do not decide these in a packet)

1. **ADR D7 velocity trails** — currently an explicit, reasoned anti-"cartoon" stance that directly
   contradicts VISION.md. Overturn, soften, or keep?
2. **Player collision immunity** — the player never takes hull damage from physical impacts
   (intentional, documented in `MASSLINE_PHYSICS_HANDOFF.md` §3.5). Keep as-is, or make "getting
   yourself into a terrible trajectory" cost hull, not just position?
3. **Enemies wielding the Massline** — `tether_control_raider` doctrine already grapples the player,
   contradicting the handoff doc's "no enemy powers" line. Recommend KEEP (it is exactly VISION's
   "specialists disrupt your plan") and update the handoff doc; needs the owner's yes.
4. **Fleet + insurance vs "my fucking ship"** — hulls today are fungible insured assets
   (`ownedShips[]`, deductible replace on death). A persistent-hull identity (scars, paint history,
   recognition) is a missing system; direction needed before building it.

## Suggested phasing

- **Phase 1 — pure tuning (constants/data only):** Big Five items 1, 2 (bloom+palette), 3 (hauler
  WANTED bug), 4 (shard EV), 5. Each is packet-sized and independently provable on the ordinary route.
- **Phase 2 — small systems:** pirate predation acquisition + engagement carve-out; convoy-loss
  economy wiring; instant wreck-burst salvage; `scanRpBonus`.
- **Phase 3 — bigger systems:** port remaining `vfxnext` families; restitution/recovery story beats
  from `aftermathWrecks` causality data; activity pockets in 2–3 more sectors; persistent-hull
  identity (pending owner call 4).
- The active queue already points the right way (`PHYSICS_AS_SPECTACLE_PROGRAM`, PQ-018/019/020/023/
  024/025/045). Route new units through the normal queue/packet machinery; use the INFERENCE lanes
  (`design/program/INFERENCE_LANES.md`) for the creative expansion passes.

## Doc contradictions found and fixed (2026-08-10)

VISION.md added to the authority chains in root `AGENTS.md`, `design/AGENTS.md`,
`CANONICAL_BUILD_MAP.md` §3, `design/program/PROGRAM_MAP.md`, and the banners of
`design/vision/00_CONSTITUTION.md` + `design/spec2/00_MASTER_TASTE.md`. GDD §6.1's in-world HP-arc
spec replaced with physical damage-telling. `BP-02_COMBAT_CEILING.md` and `REVAMP_MASTER.md` row 4
reframed from "dogfights with a ceiling" to physics-first combat. `00_CONSTITUTION.md` pillar 1
"Fair TTK" reworded. Remaining known stragglers: `MASSLINE_PHYSICS_HANDOFF.md` §2.2 "no enemy
powers" (pending owner call 3), `design/vision/GAME_DIRECTION_EXPANSION.md` authority header
(content already aligned).
