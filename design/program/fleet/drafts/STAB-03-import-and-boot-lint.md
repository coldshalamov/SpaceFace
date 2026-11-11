# STAB-03 — import and boot lint (draft for the lead)

**Queue row:** `STAB-03 import and boot lint` — Tier **S**. **Suggested size:** small
(one new script, one npm script line, one step in the gate, one test — ~4 files).
Recon date: 2026-11-10. All named files re-checked clean (foreign-diff check) on that date.

## 1. What the player must see

There is no EC spec doc for this row — it is an owner stability row. The spec is the queue
row itself plus the owner's directive. Quote it exactly:

- QUEUE.md, "Stability" section (owner, 2026-11-10): the game is
  **"glitchy, freezes, doesn't load sometimes, regresses constantly"**.
- QUEUE.md, row: **"a static check that every relative import resolves (the `.//` break),
  wired into `gate --quick`"**.

Player-facing meaning: the game loads every time. The incident this prevents already shipped
and bricked every boot: `src/core/newGamePlus.js:24` contained
`import { pluralWord } from './/numberFormat.js'` (committed at `448fef14e300`, fixed at
`5cb38b86aedf`). Mechanism, verified in the G17-01 worker receipt: the browser resolves
`.//numberFormat.js` to `/src/core//numberFormat.js`; the empty path segment survives in the
module's base URL, so numberFormat's own `../localization/sourceText.js` then resolved to
`/src/core/localization/sourceText.js` → **404 → "Failed to fetch dynamically imported
module: /src/main.js" → every boot dead** (both doors, all player-truth runs). Nothing in the
check chain caught it: `check:src-syntax` only parses (a `.//` specifier is legal syntax) and
`check-src-reachability`'s `statSync` resolution normalizes `//` away on disk.

## 2. Code facts

**What to build:** a static check that scans every module under `src/` and fails if any
relative import specifier either (a) is not a clean canonical specifier, or (b) does not
resolve to a file that exists. The `.//` case sits in (a): it resolved on disk yet broke the
browser URL space — a plain "does the file exist" scan would NOT have caught it.

Existing owners and seams:

- `scripts/check-src-syntax.mjs` — the sibling check and the right shape to copy. Walks every
  `src/**/*.js|.mjs` file (`listModuleFiles`, lines 25–36), exports pure functions, takes
  `--root <dir>` for testability (lines 57–65), has a main-guard at line 78, exits 0/1/2, and
  its failure message ties the check to the player-facing symptom ("Startup could not
  finish"). New script should mirror all of this.
- `scripts/check-src-reachability.mjs` — has the specifier regex ready-made:
  `IMPORT_RE` at line 43 catches `from 'x'`, `import 'x'`, `import('x')`, and
  `export * from 'x'`. Its `resolveSpecifier` (lines 59–64) appends `.js` when the exact
  path misses — **do not copy that fallback**: browsers fetch the specifier verbatim, and the
  4 real `.json` imports (below) would read as missing under it.
- `scripts/sync-modulepreload.mjs` — its own static-only `IMPORT_RE` at line 27 and
  importmap resolution at lines 39–52; already guards the `index.html` modulepreload list via
  `--check` inside `check:contracts` (package.json line 67). The new check does not need to
  cover index.html — bare specifiers are the importmap's job.
- `scripts/fleet/gate.mjs` — the wiring point. `STEPS` array at lines 26–30 spawns
  `npm run <script>` per step; `QUICK` flag at line 23; the quick slice at line 90
  (`QUICK ? STEPS.slice(0, 1) : STEPS`). Add a step such as
  `{ name: 'import-lint', args: ['run', 'check:src-imports'] }` first in `STEPS` and change
  the quick slice to `slice(0, 2)` so `gate --quick` runs lint + boot-adventure (full gate
  runs everything). A static lint takes seconds and is the cheapest break to catch — it
  should run before the boot in both modes.
- `package.json` — sibling npm scripts at lines 697–698 (`check:src-syntax`,
  `check:src-reachability`); `gate` at line 515; `check:contracts` at line 67 already chains
  the two sibling checks if the lead wants the new one there too.

**Specifier census in `src/` today** (~2,100 modules, ~11,894 relative import specifiers):

- Ordinary relative `.js` specifiers — the vast majority.
- 4 relative non-`.js` targets, all `.json` with `with { type: 'json' }`:
  `src/data/anvilOrchardBody.js:2`, `src/data/wreckCourt/variants.js:1`,
  `src/ui/radar.js:48`, `src/ui/screens/achievements.js:21`. Resolution must therefore test
  the specifier verbatim (`resolve(dirname(file), spec)` is a file), not "spec + .js".
- Bare specifiers (`three`, `three.quarks`, `@elemaudio/*`, `node:*`, event strings):
  out of scope — resolved by the index.html importmap or node.
- No `//`, `\`, absolute `/`, or extensionless relative specifiers exist today — a clean-tree
  pass is expected.
- Dynamic `import()` with non-literal arguments (template/variable) cannot be statically
  resolved; none were found with a quick grep, but the check should only examine string
  literals and ignore the rest (same posture as `sync-modulepreload.mjs` line 25–26).

**Suggested rules** (lead confirms): for each relative specifier, flag when

1. it does not match `^\.{1,2}/`, or
2. its `/`-split contains an empty segment or a `.` segment after the first position
   (catches `.//x`, `a//b`, `a/./b`), or it contains `\` — the canonical-specifier rule; or
3. `resolve(dirname(file), spec)` is not an existing file — the verbatim-target rule.

Flagged output should name `file → specifier` and repeat the one-line "this is what bricked
boot" sentence, following `check-src-syntax.mjs` lines 71–75.

## 3. Files a builder may edit

`git diff --stat` output was empty for every listed file at recon time (= clean):

- `scripts/check-src-imports.mjs` — **new** (name is the builder's to finalize; matches the
  `check-src-*` convention).
- `package.json` — clean. Add `"check:src-imports": "node scripts/check-src-imports.mjs"`.
- `scripts/fleet/gate.mjs` — clean. `STEPS` entry + quick slice.
- `test/src-imports.test.mjs` — **new** (name builder's choice).
- `scripts/AGENTS.md` — clean. Optional one-line routing entry beside the "Stability gate" line.
- `design/program/fleet/README.md` — clean. Optional one line under "The gate" saying
  `--quick` also runs the import lint.

## 4. Existing tests

- `grep -rln "check-src" test` → `test/src-syntax-gate.test.mjs` is the convention model:
  it `spawnSync`s the real CLI with `--root <tmp>` against a fixture tree
  (`mkdtempSync`), asserts a broken module is named + exit 1, a clean tree exits 0, and a
  missing `--root` never silently passes. Copy that structure.
- `test/src-reachability.baseline.json` is data for the reachability ratchet, not a test.

**One focused test to write** (`test/src-imports.test.mjs`): temp tree where
`a.js` does `import './b.js'` and `import 'three'` → passes (bare ignored);
`b.js` does `import './/c.js'` → fails, naming `b.js` and `.//c.js` — the regression case;
`d.js` does `import '../missing.js'` → fails; `e.js` does
`import './f.json' with { type: 'json' }` with `f.json` present → passes; missing `--root`
→ non-zero. Optional: a second case asserting `a/../b.js` or `a\b` is flagged if the lead
keeps the canonical rule strict.
Re-run `node --test test/src-syntax-gate.test.mjs` to confirm no shared-file regression.

## 5. How to see it

- `npm run check:src-imports` → `OK — <N> modules, <M> relative specifiers resolve` (exit 0).
- `npm run gate -- --quick` → `PASS import-lint <s>s` before `PASS boot-adventure`; a planted
  `.//` specifier in a temp `--root` tree makes the same command `FAIL import-lint` naming
  the file — no game boot, browser, or Electron needed for any of this.
- `node scripts/ui-bench.mjs --list` is irrelevant here (no UI surface).

## 6. Split

Not needed: ~2 new files + ~4 one-line/hunk edits, ~150–250 lines total.

## 7. Questions for the lead

1. Scope — `src/` only (the browser-served graph that broke), or also `scripts/`, `tools/`,
   `electron/` (node-resolved: a missing relative import there already throws loudly at run
   time)? Recon recommends `src/` only.
2. `--quick` semantics — proposal above makes quick = lint + boot-adventure (two steps). If
   the lead wants `--quick` to stay "boot only", the lint can instead run as an unconditional
   pre-step before the `STEPS` loop in both modes.
3. Should the check also join `check:contracts` (package.json:67) so it runs outside the
   fleet gate as well?
4. Severity — should non-canonical-but-resolvable specifiers (`.//`) be a hard FAIL
   (recommendation: yes — that exact form bricked boot) or a warning class?
5. Naming — `check:src-imports` / `scripts/check-src-imports.mjs` acceptable?
