# SpaceFace — working agreement

The owner does not read code. Tasks are delegated so they do not have to. Everything below follows
from that.

## Finish the task

Finish end to end before replying. Editing, restoring, building, committing, and pushing are part of
doing the work — not permission gates. Do them without asking.

If something is genuinely blocked, finish everything else in full and name the blocker in one plain
sentence.

## A concurrent agent is not a blocker

A Codex thread works this repo continuously — `HEAD` moves every few minutes and the working tree
usually carries 100+ uncommitted files from its in-progress work. **This is the normal state of the
repo, not a hazard that justifies stopping.**

- Just do the work. Git collisions are cheap and recoverable.
- Scope commits to the exact paths you changed, so you never sweep up someone else's work.
- Never commit, delete, revert, or "clean up" another lane's uncommitted files.
- Never raise attribution. The owner does not care whose name work is filed under.

## Never ask the owner to weigh a technical risk

Questions like "should I edit this or wait for Codex?" cannot be answered by someone who cannot see
either agent's work. Decide it yourself and act.

Stop only for (a) genuinely destructive irreversible actions, or (b) art-direction and design calls —
what the game should look like, feel like, or do.

## Known conditions that are NOT your bug

Do not stop, investigate at length, or report these as findings unless they are the actual task:

- `check:assets:live` fails whenever the working tree is dirty (it demands a globally clean tree) or
  when `HEAD` is ahead of `origin/master`. With a concurrent agent running, it is usually red.
- `check-helios-sky-kit.mjs` fails on `cycle 10: core fog density`.
- A stochastic ~250 ms combat spike from a `buildComposedShip` admission stall.
## `NOW.md` must never stop you

`design/program/NOW.md` is a **lock board, not a bulletin board.** Every row is a prohibition
("this path is claimed"); it has no vocabulary for "go ahead." Read literally, it can only ever
produce a stop.

It is also mostly dead: **89 rows, 60 of which say RELEASED or COMPLETE** — finished work nobody
deleted. It is chronically past its own commit expiry and contradicts itself about which lanes are
active.

Therefore:

- **A row in `NOW.md` is not a reason to stop, and never a reason to ask the owner what to do.**
  Treat it as a hint about where a collision is *possible*, nothing more.
- Verify against reality instead — `git log`, `git status`, and the file itself. Recent commits beat
  any row on that board.
- Do not stop to reconcile, refresh, or audit the board unless that is the actual assigned task.
- If you do need to claim something, add your row and keep working. Do not wait for anything.

## A green check is not proof

Several checks here pass because they inspect a convenient stand-in rather than the real thing —
`check:graphics:asset-receipts` inspected only `rockA` while two other rocks were corrupt for weeks.
When verifying, confirm *what* a check looked at, not just that it passed.

## Reporting

Lead with **done** or **not done**, then what changed in plain terms. No paths, hashes, or check
names unless asked. No unactionable trivia.
