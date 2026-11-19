# OVH-04 — A Swarm run lives in its own space

> **Pipeline (director, 2026-11-19) — overrides PROTOCOL.md on git:** make NO git writes (no add,
> commit, stash, reset, checkout, restore, worktree). Leave your edits in the working tree; the
> director harvests, reviews and commits them. Other agents keep uncommitted work in many files: edit
> surgically, never reformat, keep each file's line endings (most are CRLF). Anything that boots the
> game goes through `node scripts/fleet/game-lock.mjs run -- <cmd>`. Never run the whole test suite.

**Design:** `design/overhaul/04_SWARM.md` §6.1 and `design/overhaul/10_ENGINE.md` §3 — read both.
Swarm is its own mode (Crimsonland / Zombies): nothing of the Adventure campaign belongs in a run.

**Today:** a Swarm round runs inside the Helios sector and campaign life leaks in — the AFTERMATH
card, Helios ships counted as hostiles, Contract 47-A on the pause screen, the Swarm bot chasing
Helios traffic 16 k u away. Earlier fixes gated single symptoms (SWARM-LEAK-01, FIX-05;
`isSwarmGlass(state)` in `src/ui/swarmGlass.js`).

## Do

1. **Recon** (into the receipt): how a run is entered (`?swarmRound=N`, the Crucible route,
   `crucibleSetup`), which sector it loads, and every system that admits campaign entities,
   notices, objectives, comms voices or counts while a run is live.
2. **Build the structural fix**, your call as engine owner, within the load budget (a run must not
   load slower; INV-08 measured the Swarm-only load tax at 28.7 s): (a) a dedicated arena sector
   that keeps the Helios sky as a backdrop, or (b) a hard admission filter while the state is a
   Swarm run — campaign spawners, ambient traffic, missions/objectives, contract notices, comms
   voices, the pause screen's contract card, hostile counts. Prefer one owner-level gate over many
   symptom gates.
3. **Census test** `test/ovh-04-swarm-census.test.mjs` (headless; reuse the harness other swarm
   tests use to start a run): at round start list every live entity and every queued
   notice/objective/voice; assert only run-spawned bodies and arena-set props exist and nothing
   from the campaign is queued. Plus one assertion that an ordinary Helios start still has its
   traffic and its objective.
4. `npm run check:sim` before and after. If the golden moves, stop and report old/new hash and the
   cause — do not re-record.
5. One headed look through the lock:
   `node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --start-round=3 --out=.devshots/fleet/OVH-04`
   and name the frames in the receipt.

## Done when

The census passes; the pause screen in a run shows no contract; the round's hostile count equals the
run's own spawns; Swarm load is not slower (report the seconds you measured before and after);
Adventure start unchanged.

**Receipt:** what you chose and why; files changed; tests run with pass/fail; load before/after; frames.
