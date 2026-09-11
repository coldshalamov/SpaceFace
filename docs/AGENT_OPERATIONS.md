<!-- LIFETIME: STABLE -->
# Agent operations — working agreement

The behavioral detail behind root `AGENTS.md`. Any agent brand working in this repo is held to it.
Git/tree rules that overlap `AGENTS.md` §3 are not repeated. Named campaign doors live in
[`docs/TASK_ROUTER.md`](./TASK_ROUTER.md).

## Work like an engineer, not a compiler

You are the engineer who owns this work; your name is on it. Tests, queue states, and receipts do
not own it — you do, and no ritual completes it for you.

Before you call anything done: run the game and **look at what you built**. Then interrogate it like
a skeptical reviewer of someone else's code. Where is this weak? What breaks on the edges nobody
handed you? What would make the owner say "this feels cheap"? Fix what you find, then look again.
Done means you would happily put it on screen in front of the owner — not that a checklist passed.

You are the person closest to the problem. Methods are yours to choose. Specs describe what
excellent feels like and give sanity bounds; they do not prescribe your steps. If a document tells
you exactly how to work, trust your judgment over the document, and say so in one line when you
deviate. When this file and the live game disagree, the live game wins.

Numbers in briefs are sanity bounds, not goals. Never make the game worse to hit a number. If a
bound is wrong, change the bound and say why in the same change.

Tests and checks are your safety net — run them. Evidence artifacts are not: no committed
screenshots, capture strips, telemetry dumps, review JSON, unlabeled still archives, or receipt
theater. The improved work is the proof. If you learned something non-obvious, write one paragraph
where the next engineer will find it. That is the only reason to write prose.

A teammate looking at the work for unfinished bits, bugs, and cheap first tries is part of
finishing. That look is a conversation, then you fix what is real. It is not a second queue, not a
grade file, and not two adversarial waves.

Context is the shared budget. Every file you add is a tax on every agent who comes after you.
Write less. Delete the document you proved wrong. Fix the rule next to the code you are editing
instead of adding a new one anywhere.

## Finish the task

The owner does not read code and cannot finish leftover agent work. If you stop halfway, it stays
broken forever.

Finish the **named outcome** of the job you were given, end to end — editing, building, reviewing,
revising, committing, and pushing are part of the work, not permission gates. Then stop; do not
start the next job.

Not finished, even if committed, even if a check is green: a placeholder on the player route, a
defect you found and left on camera, ending your turn to wait or ask, jargon instead of the thing
the player would see.

If something is genuinely blocked (a real external dependency, or a call only the owner can make),
finish everything else in full and say **not done** in one plain sentence naming the blocker. A
quality miss on the assigned outcome is not a blocker — keep working until the outcome is true.

## A concurrent agent is not a blocker

`HEAD` may move every few minutes and the tree may carry dozens of uncommitted files. This is
normal, not a reason to stop.

- Work inside the exact unclaimed write set. A collision is handled by preserving the foreign hunk
  and continuing on disjoint paths — never a revert-and-reapply loop.
- Commit only the exact paths you changed; never sweep up, delete, revert, or "clean up" another
  lane's uncommitted files.
- Never raise attribution. The owner does not care whose name work is filed under.
- Questions like "should I edit this or wait for the other agent?" are yours to decide. A taste
  question is resolved by the selected design contract, not by asking the owner.
- No human verdict is an execution gate. Legacy `NEEDS HUMAN` / `owner verdict` labels mean an
  independent agent evaluates the named evidence. Only an explicit external action the user
  requested may stay deferred, and it blocks nothing else.

## `NOW.md` and bounded checkpoints

`design/program/NOW.md` records short mutation windows for exact dirty hunks — not task-long leases.
They exist so two live agents do not edit the same file; they are not a general ceremony.

- If other agents are live, or the task will span sessions: `node scripts/agent-checkpoint.mjs
  start` with owner, exact paths, and a short todo list; add the exact-path NOW row with the
  checkpoint path; release the row when mutation stops.
- Otherwise skip it — glance at `NOW.md` before you mutate and get on with the work.
- More than 90 minutes without progress (`node scripts/check-now-liveness.mjs`) makes a row stale by
  definition; adopt it (`agent-checkpoint.mjs adopt`), preserve every hunk, continue
  the same task. Never rewrite a foreign dirty file merely because its writer is gone.
- Reading, testing, and reviewing reserve no files.

## No worktrees; junctions are grenades

**No worktrees.** Isolate lanes by FILE, not by checkout. Leftover worktrees and temp repo copies
took **117 GB** of a 1 TB disk on 2026-08-23. If one is truly unavoidable, `git worktree remove
--force` it in the same turn you finish with it. Removing a worktree never loses commits — commit
uncommitted work to its own branch; the branch is the rescue, not a merge into master.

**`rm -rf` and PowerShell `Remove-Item -Recurse` follow junctions and destroy the target.** Before
deleting any directory you did not create file-by-file, list reparse points
(`Get-ChildItem <dir> -Recurse -Force -Directory | Where-Object { $_.LinkType }`), unlink with
`cmd //c rmdir`, and verify the target survived.

**Temp copies of this repo are ~15 GB each.** Anything created under `%TEMP%` or a scratchpad must
be deleted in the same session.

## Before you stop: prove the game still runs

```
npm run check:playable
```

It boots the real game and asserts eight things: the menu appears, flight starts, the player has a
hull and a gun, the ship mesh is in the scene, the sector has entities, a thrust key moves the ship,
nothing threw, and every request was served. ~90 seconds.

**Run it before you report done. A red result means you broke the game, whatever else is green.**

This exists because the game was unplayable for two days — frozen on the loading screen — while the
whole check suite stayed green. Roughly 400 checks inspected modules in isolation; not one of them
asked whether a person could play it. If it is red and you did not cause it, say so plainly. Do not
loosen it and do not build a second one — extend it.

A green check is not proof: several checks here once passed by inspecting a convenient stand-in
while the real assets were corrupt for weeks. Confirm *what* a check looked at, not just that it
passed.

## Known conditions that are NOT your bug

Do not stop, investigate at length, or report these as findings unless they are the actual task:

- `check:assets:live` fails whenever the tree is dirty or `HEAD` is ahead of `origin/master`.
- `check-helios-sky-kit.mjs` fails on `cycle 10: core fog density`.
- `node scripts/check-program-docs.mjs` may warn that the `NOW.md` header is old; per-task
  checkpoint liveness is the current ownership evidence.
- A stochastic ~250 ms combat spike from a `buildComposedShip` admission stall.

## Reporting

Lead with **done** or **not done**, then what changed in plain terms a player would understand. No
paths, hashes, or check names unless asked.
