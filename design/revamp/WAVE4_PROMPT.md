# WAVE 4 PROMPT — THE UNIFIED EXECUTION TRACK — paste as the first message of a fresh session

> **How to use:** start a fresh coding session in the SpaceFace repo and say **"follow `design/revamp/WAVE4_PROMPT.md`"**
> (or paste everything below the line). This prompt supersedes the ad-hoc wave handoffs. It does NOT supersede the
> authority chain (`ARCHITECTURE.md` > `GDD_2_0.md` > `REVAMP_MASTER.md` §1–§15 > `PROGRESS.md` > `STATUS.md`).
>
> **What's different from WAVE2/WAVE3 prompts:** there is a **`PROGRESS.md` ledger** that is the single source of
> truth for task state. You read it, claim a row, do the work, stamp it done, and emit the next session's prompt
> from it. No re-deriving "what's next?" — the ledger's `next` column tells you.

---

You are running **Wave 4 of the SpaceFace revamp — the unified execution track** (REVAMP_MASTER §11). Optimize for
the most correct, verified result. This wave executes the T1–T9 tracks defined in `REVAMP_MASTER.md` §11.1 and
tracked row-by-row in `design/revamp/PROGRESS.md`.

## 0. THE LEDGER PROTOCOL (do this FIRST and LAST — non-negotiable)

**Before any code:**
1. `cat design/revamp/PROGRESS.md`. Find the lowest-numbered `NEXT` row in the track you're working.
2. Verify its `depends-on` are all `DONE`/`DONE-VALIDATED`. If not, pick a different row.
3. **Re-verify the row's claim against the working tree** — grep the file, run its check if it exists. The ledger
   is a snapshot; the tree is truth (`AGENTS.md §3`). If a `DONE` row is actually broken or missing, set it back
   to `NEXT` with a note in `STATUS.md` and pick something else.
4. **Claim the row:** set its `status` → `IN-FLIGHT`. **Commit the ledger edit immediately** so no parallel session
   picks the same row. (All work is on `master` — no feature branches per lead direction 2026-07-06.)

**After the work is verified:**
5. Run the row's `check`. It MUST pass (or, for doc-only rows, the file move/edit must be verifiably done).
6. **Stamp it done:** set `status` → `DONE`, clear `branch`, fill `check` with the actual passing command.
7. Update `STATUS.md` if it's a meaningful milestone.
8. **The next session's prompt is the row whose `id` matches this row's `next` column.** Emit it (see §6).

**Conflict rule:** if a row is `IN-FLIGHT`, its `files` are locked to that branch. Don't touch them. If you
accidentally collide, the earlier ledger commit wins; re-pick.

## 1. Read first (do not skip)
1. `AGENTS.md` §3 (uncommitted-tree trap), §5 (two implementations — know which is LIVE), §6 (standing policies), §7 (common-bug routing).
2. `design/revamp/REVAMP_MASTER.md` §9 (reconciliation — the hallucination corrections), §10 (working-tree truth), §11 (this track sequence), §15 (the release bar).
3. `design/revamp/DETAIL_DOCTRINE.md` — the constitution; the one filter (*see it, predict it, change it*) applies to every packet.
4. `design/revamp/PROGRESS.md` — **your work queue.**
5. `design/revamp/_BASELINE.md` — diff 47-A against this.

## 2. Scope — IN (the tracks; pick by the ledger)
- **T1 Verification scaffolding** — 3 check scripts for already-existing systems (encounter-director, one-voice, release-soak). New `scripts/` files only.
- **T2 Doc cleanup** — 8 stale-doc corrections. Zero code/assets.
- **T3 Finish massline** — rungs 04–24 of the ladder (01–03 done). Each rung is one atomic task with its own check.
- **T4 Wave 3 new BPs** — BP-11 → BP-12 → BP-01.1 → BP-13 (LAST). After T3 lands.
- **T5–T8** — addenda, assets, perf, narrative checks. Per ledger dependencies.

## 3. Scope — OUT (do NOT do these)
- **No destructive git** (`checkout .`, `reset --hard`, `stash`, `clean`, `restore` on tracked files). The tree has ~17k uncommitted lines.
- **No editing `test/*.expected.json` goldens** to make a check pass — fix the code, or flag for a deliberate re-record batch.
- **No quality reduction** to pass perf — no asset disables, no browser/desktop divergence (`AGENTS.md §6`).
- **No touching a row whose status is `IN-FLIGHT`** — its files are locked.
- **No rebuilding a `DONE-VALIDATED` system** — `encounterDirector.js`, `voiceArbiter.js`, `state.world.facts` all EXIST (REVAMP_MASTER §9.2).
- **No deleting `flight.js`/`ai.js`/`flightDynamics.js`** — they are CI-live/runtime-fallback, load-bearing (REVAMP_MASTER §9.3).

## 4. Stable contracts (from REVAMP_MASTER §3 — enforce in every subagent prompt)
Determinism (seeded domains; no `Math.random` in sim; VFX guarded by `typeof window` may use it) · `factionId` is
cosmetic + kill-rep only (hostility via `scanner.isHostileToPlayer`) · `spawnBudget` is the single ship-cap arbiter
(MAX 12) · `voiceArbiter` for all player-facing text (`ctx.helpers.voice.say`) · `sectorZones` is the placement
substrate · squads via `ai.squadId` · additive + guarded · merge protocol (lanes create NEW files + return
registration; you integrate hot files sequentially).

## 5. Sequencing & verification
- **Order:** follow the ledger. T1 + T2 are parallel-safe (disjoint files). T3 owns the massline/scenario lane alone. T4 starts after T3 lands.
- **Per-task verify:** the row's `check` passes + the nearest existing related check stays green. For code touching the sim, also diff `check:sim:compare` against `_BASELINE.md` (must still fail only on the documented 47-A projectile-collision precondition).
- **Honesty:** a check that just greps for a keyword is not honest. Write real assertions. Run the thing.

## 6. WHEN YOUR TASK IS VERIFIED-DONE — hand off (do this, don't skip)
1. Stamp the ledger row `DONE` (per §0). Commit.
2. If the task unlocked a `next` row, **the next session's prompt is this same `WAVE4_PROMPT.md`** — it self-continues because the ledger tells the next session what to pick. You do NOT need to author a new wave prompt unless you're crossing a major boundary (e.g. T3 → T4).
3. If you're crossing a major boundary OR you discovered the plan needs revision, update `REVAMP_MASTER.md` §10 (re-snapshot the working-tree truth) and/or §11 (the sequence), then tell the human.
4. Tell the human: which row you stamped DONE, its check result, and which row is next (by id).

## 7. If you hit a problem the ledger didn't anticipate
- A `DONE` row is actually broken → set it back to `NEXT`, note in `STATUS.md`, re-pick.
- A `NEXT` row's dependency isn't really met → mark it `BLOCKED` with the blocker in `depends-on`, re-pick.
- The plan itself is wrong (a hallucination the recon missed, a contradiction) → **stop, do not improvise**, update `REVAMP_MASTER.md` §9 (reconciliation) with the correction, and tell the human.

Be decisive, verify everything you claim, leave the tree clean and playable, and remember: **if the player can't
see it, predict it, or change it, it's not detail — it's cost.**
