# SPEC2/04 — A UNIVERSE THAT WAS HERE BEFORE YOU (encounters, traffic, sector dressing)

**Owner lane:** sim/content agent. Read `spec2/00_MASTER_TASTE.md`. Pillar 4 is this spec's law.
**Files:** `src/systems/{traffic,aiEncounter,missions,world}.js`, `src/data/{sectors,missions}.js`,
new `src/systems/encounterDirector.js`, new `scripts/check-encounter-director.mjs`.

## 1. Encounter director (one owner for "something happens")
A registry system rolling a WEIGHTED encounter budget per sector visit (deterministic:
`hash32(seed, sectorId, dayIndex)`): max 1 major + 2 minor encounters per 10 min of presence;
NEVER during docking, tutorial beats, or within 30 s of the last encounter (cooldown owned here).
All encounters announce themselves through ONE one-voice line + a world telegraph, never a modal.

## 2. Encounter shapes v1 (Freelancer's grammar, our physics verbs)
- **Interdiction (minor→major by rep):** only while cruising through pirate-influence sectors.
  Mass-snare VFX ahead (violet rings collapsing, 1.2 s warning — a skilled player can V-drop and
  veer), cruise drops ('SNARED'), 2–4 pirates in a wedge. Comms toll offer within 3 s: pay
  `min(12% cargo value, 400 cr)` or fight. Paying feeds the faction/econ sim (existing rep hooks).
  Fighting: killing the leader scatters (shipped morale system).
- **Patrol scan (minor, lawful space):** patrol matches your vector ("Cut thrust for scan."),
  15 s scan beam. Clean → "Clear. Fly safe." + tiny rep gain. Contraband → dump-or-run chase
  (existing contraband/chase systems; running through asteroid fields with tether-slingshots is
  the intended counterplay — no new mechanics, just spacing: chase spawns 3 pursuers max).
- **Distress call (minor):** wreck + survivor pod OR ambush bait (70/30, deterministic roll).
  Rescue = tow pod with tether to any station (tether-haul contract plumbing from C3).
- **Named bounty (major):** mission-board bounties spawn a NAMED ship (name pool per faction) with
  one gimmick loadout: tether-cutter (cuts your line at 8 s intervals), PD screen (missiles die,
  use guns/charges), or ram-plate (he WANTS collision — stay lateral). Gimmick stated on the board
  ("Countermeasures: massline cutter."). Kill → unique salvage drop + faction ripple.
- **Convoy (ambient, not an encounter):** 2 freighters + 1 escort on lane routes (traffic system
  exists) — attackable; escorts call sector patrol response within 20 s (danger model hook).

## 3. Sector set dressing (make palette classes PLACES — data + light spawning only)
Per palette class, world.js spawns ambient dressing (non-interactive where noted):
- **core:** lane beacons every 400 wu along trade lanes (emissive cyan), 1–2 billboard frames near
  stations (station-name marquee, unlit backs), patrol wings every ~3 min.
- **belt:** dust-fog patches (existing fog + local density bump), slow conveyor barges (traffic
  skin), mining drones pecking at rocks (visual loop only), klaxon ping when blasting charges near
  a claimed rock (claims system exists).
- **fringe:** dead hulks (wreck entities, salvageable), flickering nav buoys (30% emissive duty
  cycle — allowed motion: state change is 'broken'), pirate graffiti decal on the odd asteroid.
- **anomaly:** slow violet particle updrafts, one 'whisper' comms line per 5 min from CHN UNKNOWN
  (ambient tier, one-voice), sensor ghosts (radar blips that vanish on approach — flagged so the
  overview strip renders them hollow).

## 4. Numbers that keep it alive but not busy
Ambient traffic density: core 6–9 concurrent NPCs in sensor range, belt 3–5, fringe 1–3, anomaly
0–1. Encounter budget weights per class: core {patrol .5, distress .3, convoy ambient}, belt
{distress .4, interdiction .3, patrol .3}, fringe {interdiction .5, bounty .3, distress .2},
anomaly {distress .2, whisper-only .8}. All rolls via state.rng — determinism holds.

## 5. Acceptance assertions (`scripts/check-encounter-director.mjs`)
1. 30-min scripted soak per palette class: encounter counts within budget; zero encounters during
   dock/tutorial; min-gap ≥ 30 s always.
2. Interdiction fires only during cruise in pirate-influence sectors; warning precedes snare by
   ≥ 1.0 s; V-drop + 90° veer within the warning avoids it in the scripted probe.
3. Toll payment moves credits, rep, and clears hostility (assert all three).
4. Determinism: same seed → identical encounter log across 2 runs + reload (`check:sim:compare`
   pattern); `check:sg06:ai` and `check:balance` stay green.
5. Every encounter emits exactly one one-voice line (trace audit) — no modals.
