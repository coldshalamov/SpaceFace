# PLANT-NEXT — Build the next world reaction from the plant list (repeatable)

**Tier:** S (any worker). **Size:** small. This packet is reusable: every run builds ONE row.

`design/program/INFERENCE_PLANTS.md` holds 100 small, written moments ("plants") that make the world
react to the player: a civilian swerves and shouts, a station flashes its lamps, a fridge drifts in
the belt. Each row says exactly what happens. You build one, exactly as written.

## Pick your row
1. Read the "Rules for every plant" section at the top of `INFERENCE_PLANTS.md` and obey it.
2. Take the **first row whose State is `OPEN`** in sections A, B or C (physical plants). Take a
   section-E radio line only if the last two plants shipped (check `git log --oneline -20`) were both
   physical.
3. Skip a row if it needs a place, person or object that does not exist in the code yet
   (`grep -rn "<the name>" src/data src/world` finds nothing) — write `SKIP <reason>` in your receipt
   and take the next row.
4. Claim it: change its State cell to `CLAIMED <your backend name> <today's date>` and commit that one
   file alone: `git commit -m "plant: claim PL-nn" -- design/program/INFERENCE_PLANTS.md`.

## Build it
- Find where the trigger happens (`grep -rn` for the event: kills `entity:killed`, impacts
  `physics:impact`, shoves `combat:hitstunImpulse`, docking `dock:docked`, traffic in
  `src/systems/traffic*.js`). Existing small reactions to copy the shape of:
  `src/systems/roadRage.js` (PL-05, wired into traffic as an ops mixin),
  `src/systems/bandRadio.js` (radio lines), `src/systems/trafficNearMiss.js`.
- Sim code: `state.simTime` and `state.rng` only; no Three.js outside `src/render/`.
- Allowed files: at most one existing system file, one existing render file if the plant must be
  seen, one new `src/systems/<camelName>.js`, one new `test/<kebab-name>.test.mjs`, and the plant list.
  `git diff -- <file>` before editing each existing file.

## Check and record
1. A focused test that drives the trigger and asserts the reaction, and asserts it does NOT happen
   when the row's condition is not met (wrong distance, wrong target, too soon to repeat).
2. `node --test test/<your test>.test.mjs` passes.
3. Commit the code: `plant: <what now happens> (PL-nn)`.
4. Record: `node scripts/inference-record.mjs --kind plant --id PL-nn --player "<one sentence>" --evidence "<test file and result>"`
   (`--help` first). Set the row's State to `SHIPPED <hash>` in a second commit.

The receipt's "What I could not verify" must say plainly that nobody saw it on screen, unless you did.

## Hard rule — emit only your own events (added 2026-11-12 after PL-02 and PL-04)
A plant emits **only events it defines** (`<plantName>:…` / its exported `*_EVENT` constants) plus `bark:triggered` and
`comms:log`. **Never emit another owner's event to describe an NPC** — `dock:undocked`, `dock:docked`, `pickup:collected`,
`entity:killed`, `cargo:*`, `mission:*`, `combat:*`, `tether:*` are read by missions, economy, saves, onboarding and audio as
**the player's** action. Before you emit any event, `grep -rn "on('<event>'" src` and read who listens. Your test must assert
those events are NOT fired. Anything the player should see needs a renderer/HUD listener for your own event (the sim runs in
a worker; `ent.data` set in the sim does not reach the drawn entity) — PL-01's `traffic:nearMissFlash` listener in
`src/render/renderer.js` is the pattern.

## Hard rule — no minted ships (added 2026-11-12 after PL-09 was reverted, a756f3c3)
A plant that needs a ship to act (a tug, a salvor, a hauler) **leases an existing job-owned hull through the NPC job seam**
(`this.helpers.npcJobs` — read FIX-R2 824b9b9b and PL-03's salvor dispatch 7c744edb for the pattern). Never build an entity
spec by hand, never give an entity an id (ids are numeric and assigned by the owner), and when the reaction ends the hull
returns to its job (release the lease) — nothing a plant touches may linger. If no suitable hull exists in range, the plant
does nothing (`SKIP` in the receipt).
