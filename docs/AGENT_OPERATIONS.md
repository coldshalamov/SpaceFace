<!-- LIFETIME: STABLE -->
# Agent operations — working agreement in full

The behavioral detail behind root `AGENTS.md`. Any agent brand working in this repo is held to it;
root `AGENTS.md` routes here. Git/tree rules that overlap `AGENTS.md` §3 are not repeated.

## Finish the task

The owner does not read code and cannot finish leftover agent work. If you stop halfway, it stays
broken forever. That is not allowed.

Finish the **named outcome** of the job you were given. Then stop. Do not start the next job. Do not
hand back a half-built thing with a status report.

Finish end to end before you reply. Editing, restoring, building, reviewing, revising, committing,
and pushing are part of the work — not permission gates. Do them without asking.

**“Do this one job and stop” means finish that job completely, then do not start another.** It is
never permission to ship a half-finished version of the job you were given.

These are **not** finished, even if you committed, even if a check is green, even if a ledger exists:

- A “source candidate,” “revise,” “gates open,” or “not accepted” result when the brief said the
  current picture must not ship (a clay tube, a Mule rename, a placeholder, a broken play path).
- Reviews that listed defects, with those defects still on camera.
- Ending a turn to wait, to ask, or to “come back later.”
- Jargon (hashes, gate names, MTX rows, leaf IDs) instead of the thing the player would see or use.

If something is genuinely blocked (a real external dependency, or an art-direction call only the
owner can make), finish everything else in full and say **not done** in one plain sentence that names
the blocker. A quality miss on the assigned outcome is not a blocker — keep working until the outcome
is true, or until you can name a real stop in that one sentence.

Do not dump leftover technical work on the owner. They will move on, and it will stay broken.

## A concurrent agent is not a blocker

Another agent thread can appear in this repo at any time — `HEAD` may move every few minutes and the
working tree may carry dozens of uncommitted files from in-progress work. **This is a normal state of
the repo, not a hazard that justifies stopping.**

- Just do the work inside the exact unclaimed write set. A collision is handled by preserving the
  foreign hunk and continuing on disjoint paths; do not enter a revert-and-reapply loop.
- Scope commits to the exact paths you changed, so you never sweep up someone else's work.
- Never commit, delete, revert, or "clean up" another lane's uncommitted files.
- Never raise attribution. The owner does not care whose name work is filed under.

## Never ask the owner to weigh a technical risk

Questions like "should I edit this or wait for the other agent?" cannot be answered by someone who
cannot see either agent's work. Decide it yourself and act.

Stop only for genuinely destructive irreversible actions or a missing external authority that the
user explicitly required. A taste question is resolved by the selected design contract and an
independent agent review; it is not a reason to ask the owner for a verdict.

## `NOW.md` and bounded checkpoints

`design/program/NOW.md` records short mutation windows for exact dirty hunks. It is not a task-long
lease, a subsystem lane, or a reason to route around unfinished work.

Before the first patch:

1. Run `node scripts/agent-checkpoint.mjs start` with the task owner, exact paths, and 5–10 bounded
   todos. Keep each todo small enough to finish within 90 minutes. For a multi-task prompt, reserve
   only the current task plus at most four next tasks with repeated `--reserve` flags; do not reserve
   an entire roadmap.
2. Add the exact-path NOW row and include the checkpoint path
   `.codex/agent-checkpoints/<task>.json` in a backtick cell.
3. At each meaningful todo boundary, run `agent-checkpoint.mjs check`. This writes the todo's
   `completedAt` and `lastProgressAt`; it is event-based progress, not a periodic heartbeat.

`node scripts/check-now-liveness.mjs` uses `lastProgressAt` for checkpointed rows. More than 90
minutes without progress makes the row stale by definition. Any agent may adopt it after inspecting
the current diff: run `agent-checkpoint.mjs adopt`, preserve every existing hunk, continue the same
task, and remove the NOW row only when mutation stops. A checkpoint marked `DONE` with a row still
present is also stale and needs cleanup. Rows from before this protocol use the legacy claimed-path
mtime fallback and are reported as such; they do not create permanent ownership.

Never rewrite or revert a foreign dirty file merely because its prior agent is gone. Adoption changes
the owner of the existing work; it does not create a competing implementation. Reading, testing, and
reviewing reserve no files.

Lookahead reservations are soft session intent, not queue state. `node scripts/program-dispatch.mjs
--next` skips fresh reservations; `--ready` shows them as annotations. At a task boundary, finish the
current checkpoint and create the next task checkpoint before mutating it. If a future reservation was
claimed by another live agent, re-plan the remaining four slots and continue elsewhere; never contest
it or revert its changes. A stale reservation expires with the same 90-minute checkpoint rule.

No human verdict is an execution gate. Legacy `NEEDS HUMAN`, `owner verdict`, and `human review`
labels mean that an independent agent must evaluate the named evidence and record KEEP/REVISE (or the
packet's equivalent) with a reviewer identity. Only an explicit external action requested by the user
may remain deferred, and it cannot block unrelated in-repo work.

## Do not use git worktrees here, and clean up after yourself

**No worktrees.** You are orchestrating one repo; isolate lanes by FILE, not by checkout. A worktree
of this repo costs 4-16 GB because `assets/` comes with it, and every one that is not removed stays
forever. On 2026-08-23 leftover worktrees and temp repo copies had taken **117 GB** of a 1 TB disk:
four registered worktrees, four orphaned copies under `C:\sf-agents`, a 14.8 GB "pristine" copy
inside a three-day-old session scratchpad, and two 15 GB copies in `%TEMP%`.

If you genuinely cannot avoid one, `git worktree remove --force` it in the same turn you finish with
it. Do not leave it for later; there is no later.

**Removing a worktree never loses commits.** The branch stays in `.git`. Check for *uncommitted*
work, commit that to its own branch, then delete. Do not merge another lane's branch into master to
"rescue" it — the branch is the rescue.

**A junction is a live grenade.** `rm -rf` and PowerShell `Remove-Item -Recurse` FOLLOW a junction
and destroy the TARGET — that is how this repo's `node_modules` was wiped once. Before deleting any
directory you did not create file-by-file:

```bash
# find reparse points first
powershell -Command "Get-ChildItem <dir> -Recurse -Force -Directory | Where-Object { $_.LinkType }"
# unlink a junction with rmdir, which removes only the link
cmd //c rmdir "<dir>\node_modules"
```

Then verify the target survived (`ls node_modules | wc -l`) before continuing.

**Temp copies of this repo are ~15 GB each.** Anything you create under `%TEMP%` or a scratchpad
that copies the repo must be deleted in the same session. Check `%TEMP%` for `sf-*`, `sfbase-*`,
`spaceface-*` leftovers.

## Before you stop: prove the game still runs

```
npm run check:playable
```

It boots the real game and asserts eight things: the menu appears, flight starts, the player has a
hull and a gun, the ship mesh is in the scene, the sector has entities, a thrust key moves the ship,
nothing threw, and every request was served. ~90 seconds.

**Run it before you report done. A red result means you broke the game, whatever else is green.**

This exists because the game was unplayable for two days — frozen on the loading screen, or loading
to a dead frame with no ship and no controls — while the whole check suite stayed green. Roughly 400
checks here inspect modules in isolation; not one of them booted the game and asked whether a person
could play it. One uncaught exception in boot was invisible to all of them.

If `check:playable` is red and you did not cause it, say so plainly and name what you found. Do not
"fix" it by loosening it, and do not build a second one — extend this one.

## A green check is not proof

Several checks here pass because they inspect a convenient stand-in rather than the real thing —
`check:graphics:asset-receipts` inspected only `rockA` while two other rocks were corrupt for weeks.
When verifying, confirm *what* a check looked at, not just that it passed.

## Known conditions that are NOT your bug

Do not stop, investigate at length, or report these as findings unless they are the actual task:

- `check:assets:live` fails whenever the working tree is dirty (it demands a globally clean tree) or
  when `HEAD` is ahead of `origin/master`. With a concurrent agent running, it is usually red.
- `check-helios-sky-kit.mjs` fails on `cycle 10: core fog density`.
- `node scripts/check-program-docs.mjs` may warn that the `NOW.md` header is old; per-task checkpoint
  liveness and `node scripts/check-now-liveness.mjs` are the current ownership evidence.
- A stochastic ~250 ms combat spike from a `buildComposedShip` admission stall.

## Reporting

Lead with **done** or **not done**, then what changed in plain terms. No paths, hashes, or check
names unless asked. No unactionable trivia.
