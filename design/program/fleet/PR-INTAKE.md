# PR intake — landing the open pull requests properly (lead program, 2026-11-14)

The owner asked for every open pull request to be reviewed, built the way a senior engineer would
build it, and landed on `master` with no regressions. The branches were written about a week ago by
weaker agents against an older `master`. **A branch is evidence of intent, never something to
preserve.** Keep what is right; where its foundation is wrong, replace the foundation — do not polish
around it. Packets named `PRI-*` belong to this program.

## Where things are

- Every PR head is a local ref: `refs/remotes/pull/<N>`. `gh` is not signed in — do not use it.
- Reviews already done (read the section your packet names):
  `.devshots/pr-intake/reviews/codex-dot-small.md`, `codex-dot-big.md`, `grunt-ec-a.md`, `grunt-ec-b.md`.
- The commission briefs (EC-S01…S25, G01…G21, A01…A07, Z01…Z04, C01) are in
  `design/program/experience-commissions/commissions/`. They are plans; `design/game/` decides.

## How to read and port a PR (workers)

Never `git merge`, `checkout`, `cherry-pick` or switch branches. Work file by file:

```bash
N=973; P=src/systems/economy.js
B=$(git merge-base HEAD refs/remotes/pull/$N)
git diff $B refs/remotes/pull/$N -- $P          # what the PR changed in this file
git show refs/remotes/pull/$N:$P                # the PR's whole file
```

- **File is new in the PR:** `git show refs/remotes/pull/$N:$P > $P`, then read it and fix it.
- **File exists on master:** three-way merge it, never overwrite it with the PR's older copy:

```bash
mkdir -p .devshots/pr-intake/tmp
git show $B:$P > .devshots/pr-intake/tmp/base.js
git show refs/remotes/pull/$N:$P > .devshots/pr-intake/tmp/theirs.js
git merge-file -p $P .devshots/pr-intake/tmp/base.js .devshots/pr-intake/tmp/theirs.js > .devshots/pr-intake/tmp/merged.js
echo "conflicts: $?"                            # 0 = clean; >0 = that many conflict blocks
```

  Read `merged.js`. Resolve each `<<<<<<<` block by hand keeping **both** sides' behaviour (master's
  side is newer and wins on structure). Only then copy it over `$P`. Every packet lists files that
  must be dropped, not ported (for example the stale "Ashline release repair": `src/render/renderer.js`,
  `src/render/renderPackageManifest.js`, `assets/ships/**`, `test/ashline-*.test.mjs` — master already
  has a newer version of that work).
- Do not bring over a PR's evidence/report markdown or its commission brief (the lead lands briefs).

## What "built properly" means here

1. One owner writes each piece of state; everyone else sends it an event or calls its method.
2. Simulation code (`src/systems`, `src/missions`, `src/data`, `src/core`, `src/features/*` runtime):
   `state.rng` and `state.simTime` only; no Three.js; no per-tick allocation or whole-entity-list scan
   on an update path — do the work on a transition (mission/sector/dock event) and keep a reference.
3. Old saves load: a missing new field is tolerated and normalised; nothing is minted twice on Continue.
4. The player can reach it by playing normally. A helper nothing calls is not shipped.
5. Words on screen are short. **A spoken line is eight words or fewer** (`design/game/13_JOBS_AND_HEISTS.md`:
   "Nobody briefs you in a menu if they can hail you from a window"); the objective and the world tag
   carry the instruction (`16_THE_STORY_SHOWN.md`, `20_THE_FIRST_HOUR.md`). A PR line that explains
   itself in a paragraph is cut to its point, in the speaker's voice. Where `design/game/` already
   writes the line for that moment, use that line exactly.
6. Tests drive the real owner with the payload the game really sends, and would fail on the old code.

## A busy file is never a reason to stop (owner, 2026-11-14 — overrides PROTOCOL rule 2 and any packet line that says "report Blocked" for a file with foreign changes)

Other agents have uncommitted edits all over this checkout. That does not stop you and it is not a
blocker to report. When a file you need already shows changes in `git diff` that are not yours:

```bash
bash scripts/fleet/own-commit.sh begin  <path> [<path> ...]        # before you edit it: remember it as it is
# ... make your edit in the file, alongside their lines; do not touch or "tidy" their lines ...
bash scripts/fleet/own-commit.sh commit "<message>" <path> [...]   # commits only what you changed since begin
```

The commit holds `HEAD` plus exactly your change; their edit stays in the working tree, uncommitted,
untouched. If your change and theirs are on the same lines the tool commits the whole file — that is
allowed. Use the same command for your clean files in the same commit (list every path). Never wait
on another agent, never leave a hunk unported, never write "deferred" or "blocked" because a file was
dirty or a program was running. If the game lock is held, do everything else first, then wait for it.
The only things that go under "Blocked" are things you tried and could not make work — with what you tried.

## Check budget (overrides any wider sweep a packet asks for)

This machine is shared and slow. Your packet's **named** test files are mandatory. A packet's
"then every existing test that names X" sweep is capped: run at most the **twelve** files closest to the
modules you edited, in one `node --test` call, and list the ones you left out. Any single test file or
call still running after **four minutes**: stop it, name it under "What I could not look at or verify",
and move on — never wait on it, never re-run it. Commit as soon as the named tests pass; do the capped
sweep after the commit and fix forward if it finds something you caused.

## Order (lead keeps this current)

Landed: #921 #923 #926(tests) #941 #1113, the ui-polish wall (see `.devshots/pr-intake/batch*-report.md`),
all commission briefs. In flight / queued: the `PRI-*` rows in `QUEUE.md`.
