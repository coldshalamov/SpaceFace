# TEST-DEBT-1 — failing tests told the truth or get rewritten

**For:** a careful engineer. **Kind:** test repair, small. **One commit per test file.** This brief
may be run several times in a row by a seat with a short turn limit: start by running
`git log --oneline -40 | grep "TEST-DEBT"` and skip any file already handled.

## Why

Agents landing work today reported the same test files already failing before their changes. A
red test nobody trusts hides real breakage. Each one is either pinning a rule the game has
deliberately changed (rewrite the test to the new rule, with the rule in its message), or it has
found a real bug (fix the code, smallest change), or it checks a document or process step (delete
it). Decide per file; never weaken an assertion just to make it pass.

The rules that changed today are in `design/overhaul/00_RULINGS.md` (R13 to R24) and in the commit
messages of the last two days (`git log --oneline -120`). The big ones: no involuntary slow
motion; being hit never changes steering; field-of-view changes only for the player's own boost
and jump, through the camera gate; no enemy fire holds or shooter caps; every simulation system
runs on a fixed cadence and steps are never shed; the Line is on RMB and F; plain wording (Line
not Massline, Swarm not Crucible, m and m/s); the station opens on an arrival page with doors;
whole-ship level of detail is on.

## The list (run each with `node --test <file>`; never the whole suite)

- `test/ovh-06a-camera-discipline.test.mjs` (2 failures)
- `test/pq-139-00-collision-feel.test.mjs` (6)
- `test/b5-impact-channel-spread.test.mjs`, `test/b5-slam-vs-nudge.test.mjs` (2 each)
- `test/pq-159-00-impact-kick.test.mjs`, `test/feel-shove-bars.test.mjs`,
  `test/camera-occluders.test.mjs`
- `test/hero-maneuvers.test.mjs` (2: spawn distance and key binding)
- `test/al-set-1-trailer-clips.test.mjs` (2)
- `test/time-effects.test.mjs` (a source check on main.js)
- `test/finish-e3-mode-scoped-sim-and-lod.test.mjs` ("validateSystemModeDeclarations")
- `test/worker-paused-save-completion.test.mjs` (worker save-restore)
- `test/tactical-map-second-generation.test.mjs` (label truncation; the maps lead may already
  have fixed it: check first)
- `test/five-powers-merge-4242.test.mjs` (line 40: the Line's keyboard key; the combat lead may
  already have fixed it: check first)
- `test/variance-adjustment-berth.test.mjs` (stale source-text search)
- `npm run check:camera` and `npm run check:presentation` (one item each)

For each: run it, read the failing assertion and the code it tests, decide which of the three
cases it is, act, run it again, commit with the message
`TEST-DEBT: <file> — <rewritten to rule X | fixed bug Y | deleted, checked a document>`.

If the fix needs a change in a file another agent is editing this hour (`src/render/feel.js`,
`src/systems/flightV3.js`, `src/systems/powerVerbs.js`, anything under `src/render/vfx/`,
`src/ui/map/`, `src/ui/station/`, `src/systems/economy*.js`, `src/systems/cargo.js`), do not edit
it: write the finding in your receipt and move on.

## Receipt

A table: file, which case, what you did, commit. Then anything that looks like a real bug you
could not fix, with the file and line.
