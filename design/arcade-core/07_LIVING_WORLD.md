<!-- LIFETIME: DURABLE -->
# 07 — LIVING WORLD: populated islands, visible intent, bounded memory

Owner's correction to the earlier brainstorm is encoded here: **not one dense pocket.** The
Freelancer structure is the goal — wide space, real emptiness, populated islands of activity,
and the specific dread of being jumped in the middle of nowhere. What must grow is the
*quality of life inside the islands* and the *legibility of NPC intent everywhere*.

Huge machinery exists (`npcJobs.js`, `npcJobsRuntime.js`, `traffic.js` at 360 KB,
`livingPoiBehaviors.js`, `sectorActivityPockets.js`, `encounterDirector.js`). Per I-9: audit
what these actually produce in a live route before writing anything new.

## 1. The job chain, made physical and visible

The VISION chain is the acceptance standard for every populated island:

> miner reaches a seam → extracts → cargo accumulates → hauler arrives → cargo changes hands →
> hauler departs on a route → pirates notice valuable traffic → patrols respond → the player
> can intervene anywhere.

- Every NPC in an island has a **job, a current task, and a destination** — and all three are
  *visible in behavior*: a miner sits on a rock with its beam on; a hauler brakes, docks,
  waits, undocks, burns for the lane; a pirate shadows traffic at the edge of sensor range;
  a patrol flies an actual loop and actually intercepts.
- Work produces physical artifacts: ore chunks exist before pickup, cargo pods exist at
  handoff, dead things leave wrecks that get salvaged. No job is a pure timer with particles.
- NPC ships physically react to the world (I-3 honesty): near-misses cause avoidance burns,
  a spooked hauler dumps cargo, debris fields get routed around. The same physics the player
  weaponizes acts on everyone.

## 2. Ambient predation (the world moves without you)

- Pirates actually catch and rob a hauler now and then; patrols actually break it up; miners
  actually crack rocks. These are *simulated events with physical outcomes* (spilled cargo,
  a wreck, a fleeing pirate), not ambient theater.
- The player arriving mid-event — a robbery in progress, a salvage operation over a fresh
  wreck — is the standard island greeting. Intervene, exploit, or ignore: all valid.
- In empty space, silence is the feature. Rare long-range ambushes (danger model) land
  *because* there's nothing around.

## 3. Consequence memory — the GTA rule (I-7)

- **Radius + parties bounded:** a witnessed crime raises response from the witnessing faction
  *in that area*, full stop.
- **Decay:** leave the area for a defined window (tunable, order 5–15 min) and it cools to
  baseline. No permanent local lockouts from ordinary incidents.
- **No runaway chains:** response levels are capped; a response cannot itself spawn witnesses
  that re-escalate indefinitely. Escalation ladders have explicit terminal states
  (driven off / paid off / destroyed / forgotten).
- **Persistent reputation moves only on deliberate, large acts** (destroying a facility,
  repeated piracy against one faction), never from traffic accidents or single fights.
- Audit `lawSecurity.js`, `dangerModel.js`, `aceMemory.js`, `moralMemory.js` against these
  four rules; cap or delete any path that violates them.

## 4. Seeds for growth (handed to content agents)

Reusable NPC-type seeds to implement over time, each = job loop + visible tells + physical
artifacts + one player-exploitable weakness: miner, hauler, smuggler (runs scans), pirate
ambusher, pirate extortionist (demands toll), patrol, bounty hunter (hunts *you* when wanted),
salvager, scavenger (follows battles), prospector (surveys frontier), factory convoy (08),
refugee/event traffic. Each seed is one bounded packet; the chain (§1) is the acceptance
frame they plug into.

## Bans

- No decorative orbiters: an NPC that does nothing, goes nowhere, and reacts to nothing is a
  defect, not dressing.
- No omniscient response: factions react to what they could have witnessed (I-7).
- No runaway memory systems (I-7).
- No filling empty space to make it busy (I-6).

## Acceptance

- Bot observation route (camera parked in a starter belt island, 10 min): log every NPC job
  transition; assert the full miner→hauler→pirate/patrol chain occurs without player input;
  assert ≥ 1 ambient event with physical artifacts.
- Memory test: commit a witnessed minor crime → local response escalates → leave → after the
  decay window, response is baseline; no persistent faction hit.
- Human gate: owner watches an island for 5 minutes and answers "what are these people doing?"
  correctly from motion alone.
