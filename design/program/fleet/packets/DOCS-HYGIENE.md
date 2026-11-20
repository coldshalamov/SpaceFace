# DOCS-HYGIENE — remove the old orders so no agent obeys them again

**For:** a careful editor. **Kind:** documents, a few scripts and tests. No game code. **Commit when
done**, in the three commits named below.

## Why

The owner: agents "decided to interpret some prompt or discovery as a hard rule; they've accumulated
until the repo reached a gridlock… agents find them and step on them like landmines and next thing
you know they're tucking work away." The root `AGENTS.md` now holds the only rules. Your job is to
remove the old orders from everywhere else, while keeping every fact about the code.

**The test for every sentence you touch:** does it tell an agent to *wait, hold, park, queue, claim,
get a review or an approval, collect evidence to a quota, take work from a lane or a board, or stay
out of a file* — or does it state a fact about how the game's code works? Remove the first kind.
Keep the second kind word for word. When unsure, keep it.

## Commit 1 — nested AGENTS.md files

List them: `git ls-files "*AGENTS.md"` (ignore anything under `.dev/`). For each one except the root:

- Delete sentences and sections of the first kind (queues, lanes, `NOW.md` claims, the Finish
  Program, Master Lanes, "current program", review or verification quotas, "do not edit X without Y's
  sign-off", evidence or capture requirements, packet rituals).
- Keep module ownership facts ("X is the only writer of Y"), invariants, file maps, how to run the
  local checks, and known traps.
- If a file is left with no facts, delete the file.
- Do not add new rules. At most add one first line: `Rules: see the root AGENTS.md. This file lists
  facts about this folder.`

## Commit 2 — operating documents

1. `docs/AGENT_OPERATIONS.md`, `docs/POLICY_MANIFEST.md`, `docs/TASK_ROUTER.md`,
   `docs/AGENT_FAST_LOOP.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/AGENT_LESSONS.md`,
   `docs/ORIENTATION.md`, `docs/README.md`, `docs/REPOSITORY_HYGIENE.md`: apply the same test. Remove
   references that send a reader to the fleet queue, `NOW.md`, the Finish Program or lanes for
   assignments. Keep descriptions of tools, checks and the repo map. Where a page pointed at the
   queue for "current work", point it at `design/overhaul/12_PIPELINE.md` instead.
2. `design/program/fleet/QUEUE.md`: delete the sections "How to take work" and the lane table and the
   "No holds" paragraph (the banner at the top already says the states mean nothing). Leave the rows
   as history.
3. Add this banner as the first lines (after any leading `<!-- ... -->` line) of each file below that
   does not already contain `HISTORY-2026-11-20`:

   ```
   <!-- HISTORY-2026-11-20 -->
   > **History, not instructions (2026-11-20).** This file no longer assigns, orders or blocks any work.
   > Read it for facts about what was built or planned. The rule and the live board are in the root
   > `AGENTS.md` and `design/overhaul/12_PIPELINE.md`.
   ```

   Files: `design/AGENTS.md` if it survives commit 1; `design/PLAN_REGISTRY.md`;
   `design/program/02_REMAINING_WORK.md`; `design/program/06_RETAINED_FUTURE_BACKLOG.md`;
   `design/program/ORPHAN_HARVEST_PLAYBOOK.md`; `design/program/ORPHAN_HARVEST_LEDGER.md`;
   every `.md` directly inside `design/program/finish/` (not its subfolders);
   every `.md` inside `design/production/`; `design/combat-convergence/11_AGENT_ORCHESTRATION.md`;
   every `.md` directly inside `design/program-compass/`; `design/vision/06_OPERATING_MODEL.md`;
   `design/depth-program/PLANNER_PROMPT.md`; `design/depth-program/PLANNER_BRIEFING.md`;
   `design/game/10_THE_GAME.md` (banner text for this one: `> Where this page and
   design/overhaul/00_RULINGS.md disagree, the rulings win. Its last section ("no new plan
   documents") no longer applies.`); `.dev/pr-expansion/HANDOFF.md` if it is tracked.
   Keep each file's line endings as they are.
4. Do **not** edit anything in `design/overhaul/` or the root `AGENTS.md` / `CLAUDE.md`.

## Commit 3 — checks that police documents or process

Find scripts and tests whose only job is to check the wording or shape of plan documents, queues,
claims or agent process — not the game. Start from: `scripts/check-now-liveness.mjs`,
`scripts/check-plan-integrity.mjs`, `scripts/check-program-docs.mjs`, `scripts/program-dispatch.mjs`,
`scripts/lib/planFrontDoor.mjs`, `scripts/lib/programControlPlane.mjs`,
`test/plan-front-door.test.mjs`, `test/check-now-liveness-paths.test.mjs`, and search for more
(`grep -rln "QUEUE.md\|NOW.md\|MASTER_LANES\|build_map.md\|AGENTS.md" scripts test | head -80`).

For each candidate, read it and decide:

- **Delete** it only if it imports nothing from `src/` and asserts only on the contents of `.md`
  files, queue or plan tables, claim boards or agent process. Remove its entry from `package.json`
  scripts and from any aggregate (`check`, the gate list in `scripts/fleet/gate.mjs`, CI workflows
  under `.github/`), and remove now-dead imports.
- **Keep** it if it checks anything about the game, assets, saves, data tables, links between code
  files, or build output. A test that reads `build_map.md` for *design numbers the game must match*
  is a game check: keep it and say so.
- When a kept file only *mentions* one of those documents in a comment, leave it alone.

Then prove nothing dangles: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`,
`node --check` on every script you edited, and
`grep -rn "<each deleted file's basename>" package.json scripts test .github docs | head` shows no
remaining reference.

## Receipt

List, per commit: every file changed or deleted with one line saying what kind of rule was removed;
every candidate in commit 3 you kept and why; anything you were unsure about and left alone.
