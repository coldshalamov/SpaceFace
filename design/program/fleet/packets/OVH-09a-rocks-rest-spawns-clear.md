# OVH-09a — Loose rocks rest; spawns are clear

> **Pipeline (director, 2026-11-19) — overrides PROTOCOL.md on git:** make NO git writes (no add,
> commit, stash, reset, checkout, restore, worktree). Leave your edits in the working tree; the
> director harvests, reviews and commits them. Other agents keep uncommitted work in many files: edit
> surgically, never reformat, keep each file's line endings (most are CRLF). Never run the whole
> test suite; anything that boots the game goes through `node scripts/fleet/game-lock.mjs run -- <cmd>`.

**Design:** `design/overhaul/03_COMBAT.md` §5 items 1–2 (ruling R11, the calm world). The owner:
NPCs are "constantly crashing into each other and triggering chain reactions of pinball crashing and
everything's exploding." Physics stays honest; the world is calm because nothing starts moving or
appears on a collision course by itself.

## Do

1. **Loose rocks rest.** Field rocks (Adventure sector fields and the Swarm arena) spawn with zero
   linear velocity; spin stays presentation-only; they sleep (no integration) until something
   touches them. Find every field-rock spawner (`grep -rn` for rock/asteroid spawn and initial
   velocity) and list each in the receipt with what you changed.
2. **Spawns are clear.** One shared helper (e.g. `src/systems/spawnClearance.js`) that every NPC and
   rock spawner calls: clearance radius = 2 × body radius + 40 WU against live bodies, plus a 2 s
   straight-line predicted path from the spawn velocity; on failure it retries at another candidate
   point (bounded retries, deterministic through `state.rng`) instead of spawning onto a body or a
   collision course. Swarm gate arrivals keep arriving through their gates.
3. **Tests:** `test/ovh-09a-rocks-rest.test.mjs` (a field rock at spawn has zero linear velocity and
   is asleep; it wakes when hit) and `test/ovh-09a-spawn-clearance.test.mjs` (a spawn request onto an
   occupied point lands clear; the retry is deterministic for a seed; a clear request is unchanged).
4. **Determinism:** `state.rng` / `state.simTime` only. Run `npm run check:sim` before and after; if
   the golden hash moves, do not re-record — report old/new hash and which change moved it.

**Files:** the spawners you find, the new helper, the two tests. **Not:** `src/ai/maneuver.js`,
`src/systems/aiPorts.js`, `src/ai/reflexes.js`, `src/data/weapons.js` (other builders are in them).
Codex is building OVH-04 (a Swarm run in its own space) at the same time: do not edit sector/arena
loading or Swarm run-entry code; if a spawner you need lives there, list it in the receipt instead.

**Done when:** both tests pass; check:sim result reported; the receipt lists every spawner and
whether it now checks clearance.
