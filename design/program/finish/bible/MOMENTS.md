<!-- LIFETIME: ACTIVE_PROGRAM -->
# MOMENTS — the thirty moments that define "finished"

The game is finished when a player can have each of these **naturally**: without a script steering
them, within the stated time, on the ordinary route. Each moment has an owner (the program/lane that
must make it possible), the systems it touches, a capture spec, pass criteria, and the typical failure.

**Status table:** the bottom of this file. Route walkers (master plan Q2) keep it current: who
captured it, where the clip is, the R11 score (QUALITY.md), date.

**Capture rules for every moment:** ordinary route (title → New Game/Continue/Swarm), Browser pane
visible, gameplay camera unless noted, 10–60 s clip plus 2–3 stills, no dev flags. A moment captured
once with a staged save is a **3**; captured by a fresh agent who didn't stage it is a **5**.

---

## Movement and verbs

### M1 — The perfect slingshot
*You swing around a rock on the Line at full speed and let go into a slingshot that flings you across
the screen faster than your engines can.*
- **Owners:** SWARM F (feel profile), VERBS (Line), CHAOS C3 (camera CH-50).
- **Systems:** Massline attach/winch/release, earned-speed governor (FEEL_CONTRACT A1–A3), camera pull-back, release sound/VFX.
- **Natural within:** 3 minutes of Adventure flight near rocks, or Swarm wave 1.
- **Pass:** the release speed is visibly ≥ 1.5× the ship's cruise; speed is kept (not braked away) for ≥ 2 s; the release has a snap (sound + flash at the anchor + rope whip); the camera widens. A viewer says "whoa".
- **Typical failure:** speed bleeds in a second; the rope stretches like a bungee; the release is silent.

### M2 — The heavy tow
*You tow a loose cargo pod away while being shot at, and its weight changes how you fly.*
- **Owners:** VERBS (Line tow), CHAOS C1 (CH-32 cargo), SHIPS (muscle stat).
- **Pass:** your turn radius visibly widens and acceleration drops with the load; the pod swings behind you and can hit things; dropping it gives an obvious lurch of freedom; the HUD shows at most one plain word about the load.
- **Typical failure:** the pod follows rigidly like a sticker; no change in handling; a tonnage number on screen.

### M3 — The web knot
*You web three enemies together and blow the knot up with one shot.*
- **Owners:** VERBS (web/Snarl), SWARM F/S.
- **Pass:** webbed ships are visibly tethered (glowing strands), their thrust fights each other (the knot wobbles), and one explosive hit kills all three with a chained pop. Readable without the HUD.
- **Typical failure:** web is a debuff icon; no physical tethering.

### M4 — The gravity well
*You drop a gravity well and watch debris, shots and enemies curve into it.*
- **Owners:** SWARM F (S1 yank), VERBS (Pull).
- **Pass:** projectiles bend visibly; light enemies get yanked in and collide (damage above the crumple threshold); debris spirals; the well has a distortion ring and a deep hum; after it ends, the pile is a target.
- **Typical failure:** bodies drift gently into a polite clump (the 45 WU/s convergence); no visible distortion.

### M5 — The ram
*You ram a smaller ship in a heavy hull and watch it crumple and spin away.*
- **Owners:** CHAOS C1 (CH-01, CH-02).
- **Pass:** the light ship takes damage proportional to the mass ratio, tumbles away with spin, sheds a part or two; you barely slow; crunch sound is heavy; small camera kick.
- **Typical failure:** both bounce like billiard balls; no damage; the player is hurt as much.

### M6 — The bowling strike (chase camera)
*You plow through a docking queue in the chase camera and send ships flying like bowling pins.*
- **Owners:** CHAOS C1 (CH-07), Velocity (stern view), CHAOS C2 (panic, reactions).
- **Natural within:** 5 minutes at Helios Station rush hour (Hotspot 2) in a Juggernaut-class ship.
- **Pass:** ≥ 4 queue ships scatter with spin; pile-on collisions between them; horns, swearing, panic; the station reacts (CH-18); heat rises. In chase camera the camera stays readable.
- **Typical failure:** queue ships are kinematic and don't move; the camera clips into hulls.

### M7 — Enemy as ammunition
*You throw an enemy into another enemy and kill both.*
- **Owners:** SWARM F (S1 bowling pins), VERBS (Line throw), SWARM S (credit + payoff).
- **Pass:** both die from the collision; the chain counts it; the payoff ladder fires (DOUBLE or PILE-UP).
- **Typical failure:** the 40 WU/s contact clamp eats the energy; the victim just nudges.

## The world reacts

### M8 — Road rage
*You clip a shuttle and it leans on its horn, swears at you, and follows you.*
- **Owners:** CHAOS C2 (CH-12, CH-13, CH-61).
- **Pass:** horn within 0.3 s; swerve; a ≤ 8-word bark; an aggressive personality tails you for ≥ 10 s and gives up believably (or rams you).
- **Typical failure:** a toast; no motion.

### M9 — Panic
*You start a fight near a station and civilians scatter.*
- **Owners:** CHAOS C2 (CH-11).
- **Pass:** a visible wave of fleeing ships spreads from the violence; some collide; queues break; a few hide behind the station; within 60 s of calm they cautiously return.
- **Typical failure:** everyone flees in one direction in formation; panic never ends.

### M10 — Vultures
*You spill a freighter's cargo and scavengers arrive within seconds and fight over it.*
- **Owners:** CHAOS C2 (CH-14), CHAOS C1 (CH-32).
- **Pass:** first scavenger arrives ≤ 20 s; at least two parties contest it; you can join, race or stop them.
- **Typical failure:** scavengers spawn on top of the cargo.

### M11 — Start a war
*You lure a pirate into a patrol and watch them fight each other.*
- **Owners:** CHAOS C2 (CH-17).
- **Pass:** the patrol engages the pirate on sight; reinforcements may arrive on both sides; the fight continues without you.
- **Typical failure:** factions ignore each other; or they only fight you.

### M12 — The witness
*You get seen, chase down the witness before they reach the police, and get away clean.*
- **Owners:** CHAOS C2 (CH-16), law/heat owners.
- **Pass:** a witness marker appears; the witness flies toward the nearest patrol/station; stopping them (block, tow, scare) prevents the heat rise; letting them arrive raises it visibly.
- **Typical failure:** witness is instant or invisible.

### M13 — The heat ladder
*You climb from one star of heat to five and see a new kind of pursuer at each step.*
- **Owners:** CHAOS C2 (CH-20, CH-22, CH-24).
- **Pass:** 1 cutter → 2 cutters + mines → 3 interceptor wing → 4 gunship + gate blockade → 5 capital ship + named hunters; each arrives from somewhere visible, with a sound cue.
- **Typical failure:** more of the same ship at each level.

### M14 — Losing them
*You lose the police by breaking line of sight in an asteroid field.*
- **Owners:** CHAOS C2 (CH-21).
- **Pass:** search cones on the radar; once out of every cone, a cooldown bar fills; re-entering a cone resets it; hiding spots are obvious in the world.
- **Typical failure:** heat decays on a timer regardless of what you do.

### M15 — The hijack
*You hijack a freighter mid-flight and fly away in it.*
- **Owners:** CHAOS C1 (CH-30).
- **Pass:** ≤ 5 s from latch to flying the new ship; the pilot pod ejects as a lifepod; your old ship parks and is recoverable; the freighter's handling and cargo are yours; the owner reports it.
- **Typical failure:** a menu; a long minigame; the old ship vanishes.

### M16 — The scar
*You come back to a station you wrecked and see the damage — and the repair crew.*
- **Owners:** CHAOS C1 (CH-03), CHAOS C2 (CH-65).
- **Pass:** broken modules missing or patched; repair tugs and drones working; the station PA mentions it; traffic patterns changed. Survives save/continue.
- **Typical failure:** everything reset on reload.

## Places and missions

### M17 — Arrival
*You arrive at a big place where something huge is happening and immediately want to mess with it.*
- **Owners:** HOTSPOTS lane, KIT K7, CHAOS.
- **Pass:** from the arrival vantage, the Hotspot's job is visibly in progress with a crowd; at least three things obviously invite interference (a queue, a load, a hazard); sound swells as you approach. R4 ≥ 4.
- **Typical failure:** a static model with a name tag.

### M18 — The unplanned solution
*You finish a mission in a way the designer didn't plan.*
- **Owners:** WORLD (W2, CH-40).
- **Pass:** the mission accepts any method that achieves the goal; route walkers find ≥ 3 distinct solutions for each of the forty levels.
- **Typical failure:** "use the Line to…" instructions; a scripted trigger only one method hits.

### M19 — Failing forward
*You fail a mission and it turns into a different, better situation.*
- **Owners:** WORLD, VISION ("failure should make better stories").
- **Pass:** the failure creates a new situation (salvage, a chase, restitution, a grudge) with a new objective; no "MISSION FAILED — RELOAD".
- **Typical failure:** a fail screen.

### M20 — The shortcut
*You win a race through live traffic by shortcutting through a gap you shouldn't fit.*
- **Owners:** CHAOS C3 (CH-41), Velocity, Hotspot 3 (Ring Circuit).
- **Pass:** races run through live traffic and structures; tight optional gaps exist and are worth time; rivals take risks too and crash.
- **Typical failure:** races on empty tracks.

### M21 — Loud heist
*You pull off a heist that goes loud and becomes an escape.*
- **Owners:** WORLD (heists), CHAOS C2 (heat).
- **Pass:** a quiet approach exists; detection flips the situation to loud with alarms, lockdown and pursuit; escaping with the loot is the new objective.
- **Typical failure:** detection = fail.

### M22 — The clever bounty
*You hunt a bounty who uses the terrain against you.*
- **Owners:** WORLD, BESTIARY (hunter doctrine), CHAOS.
- **Pass:** the target hides behind rocks, drops mines in a chokepoint, throws debris with a Line, or flees through traffic.
- **Typical failure:** the target circles and shoots.

## Swarm

### M23 — The debut
*A new enemy type debuts alone and you learn what it does.*
- **Owners:** SWARM F (S7 debut rule), SWARM S (callout).
- **Pass:** the debut wave introduces the type as a small group, with a `NEW: <NAME>` callout and a clear first use of its power with a full tell.
- **Typical failure:** debut buried in a crowd.

### M24 — The trap
*You lure the horde into the arena's machinery.*
- **Owners:** SWARM F (S9, S19), ARENAS.
- **Pass:** the hazard telegraphs its cycle; enemies follow you into it; it kills a group; it can kill you too.
- **Typical failure:** hazards hurt only the player, or only enemies.

### M25 — The screen clear
*You clear a screen-filling tide with one combo and feel the slow-mo.*
- **Owners:** SWARM S (S13 payoff), SWARM F (S1, Brood).
- **Pass:** ≥ 20 Brood + some ships die within 1 s from one player cause; hit-stop, camera punch, PILE-UP callout, boom.
- **Typical failure:** no single cause can kill that many; the payoff fires for environmental deaths.

### M26 — The depot run
*You make a desperate run to the in-arena depot mid-wave to buy what you need.*
- **Owners:** SWARM S17.
- **Pass:** standing on the pad for 1.5 s is visibly dangerous; you buy without a menu pausing the game.
- **Typical failure:** the depot pauses play, or is safe.

### M27 — Boss with its own armour
*You beat the first boss by throwing its own armour back at it.*
- **Owners:** SWARM F/S (S14).
- **Pass:** a plate shed by the Line becomes a throwable body; throwing it at the weak spot does big damage; the death breaks the boss into chunks you keep using.
- **Typical failure:** a long HP-bar shootout.

### M28 — One more run
*You reach a new personal best and want to go again immediately.*
- **Owners:** SWARM S (Run Over, S4 quick restart).
- **Pass:** the Run Over screen names your best moment and what killed you; "Run it again" is one key; you're fighting again in ≤ 10 s.
- **Typical failure:** setup screens between you and the next run.

## Your ship

### M29 — Understanding
*You look at your ship and understand exactly what it's good at.*
- **Owners:** SHIP (P1).
- **Pass:** six plain stats, a build identity, a fantasy label (Skater/Juggernaut/Conjurer); the blind comprehension check passes.
- **Typical failure:** engineering numbers.

### M30 — The upgrade you see and feel
*You buy a part and see the difference on the hull and in how it flies.*
- **Owners:** KIT (K3), SHIP (P1/P2).
- **Pass:** the part appears on the hull; the stat delta was shown before buying; the first minute of flight feels different in the way promised.
- **Typical failure:** invisible part; no felt difference.

---

## The ten-minute tests

- **Adventure:** any 10 minutes of ordinary play near civilisation produces ≥ 3 of M1–M17 without the
  player trying. Route walkers run 5 random 10-minute sessions per sector with traffic.
- **Swarm:** any 10 minutes produces ≥ 5 of M1–M7 and M23–M28.

## Status

| # | Moment | Owner | Captured by | Clip | R11 | Date |
|---|---|---|---|---|---|---|
| M1 | The perfect slingshot | SWARM F / VERBS | | | | |
| M2 | The heavy tow | VERBS / CHAOS C1 | | | | |
| M3 | The web knot | VERBS / SWARM | | | | |
| M4 | The gravity well | SWARM F | | | | |
| M5 | The ram | CHAOS C1 | | | | |
| M6 | The bowling strike | CHAOS C1/C2 | | | | |
| M7 | Enemy as ammunition | SWARM F/S | | | | |
| M8 | Road rage | CHAOS C2 | | | | |
| M9 | Panic | CHAOS C2 | | | | |
| M10 | Vultures | CHAOS C2 | | | | |
| M11 | Start a war | CHAOS C2 | | | | |
| M12 | The witness | CHAOS C2 | | | | |
| M13 | The heat ladder | CHAOS C2 | | | | |
| M14 | Losing them | CHAOS C2 | | | | |
| M15 | The hijack | CHAOS C1 | | | | |
| M16 | The scar | CHAOS C1/C2 | | | | |
| M17 | Arrival | HOTSPOTS | | | | |
| M18 | The unplanned solution | WORLD | | | | |
| M19 | Failing forward | WORLD | | | | |
| M20 | The shortcut | CHAOS C3 | | | | |
| M21 | Loud heist | WORLD | | | | |
| M22 | The clever bounty | WORLD | | | | |
| M23 | The debut | SWARM | | | | |
| M24 | The trap | SWARM F | | | | |
| M25 | The screen clear | SWARM S | | | | |
| M26 | The depot run | SWARM S17 | | | | |
| M27 | Boss with its own armour | SWARM S14 | | | | |
| M28 | One more run | SWARM S | | | | |
| M29 | Understanding | SHIP | | | | |
| M30 | The upgrade you see and feel | KIT / SHIP | | | | |
