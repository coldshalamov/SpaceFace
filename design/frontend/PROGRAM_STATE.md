# Frontend program — live checkpoint

**This file is the handoff. Update it at the end of every working session, before you run out of
context.** It exists because the program is 7 packets / 16 jobs and no single thread has the context
budget to finish them. Work is resumed across threads, so the state has to live on disk.

It is a CHECKPOINT, not a lock board. Nothing here is a reason to stop. Compare it against
`git log` and reality; recent commits beat this file.

Program spec: `CANONICAL_BUILD_MAP.md` §11.12 and `design/frontend/NEXT_JOBS.md` (J01–J16).

---

## Status

| Packet | Jobs | State |
|---|---|---|
| 1 | J04 snapshot lab, J01 data-state adoption | **DONE** |
| 2 | J05 iconography + 14 faction crests | **DONE** |
| 3 | J06 Power Rail | **DONE** |
| 3 | J07 HUD overhaul | **DONE** - all 6 bullets |
| 4 | J08 combat reticle + threat halo | **DONE `bea90b47`** — reticle shape modes, lock bloom, lead-pip convergence, `src/ui/threatHalo.js`; real-boot capture with live engagement. Drive-bys: stale `check-ui-identity` targetPanel rule repinned; sandbox `spawnEnemies` stamps `ai.spawnContext='encounter'` (combat cards were permanently neutered). |
| R | responsive / ultrawide (Phase-0 debt) | **DONE `0996a2e4`** — `--sf-safe-inset-x` + anchor rebase in all 3 cascade layers + `resolveObjectiveHudLayout` safe frame + `check:responsive` + `RESPONSIVE_STRATEGY.md`. Verified 320px inset at 2560×1080; 0 at ≤16:9. |
| 5a | J09 ship bands | **DONE `0f503607`** — handling/power/condition/capability on the F2 stage (`src/ui/ship/shipBandModels.js`); captured live. |
| 5b | J10 FOOTPRINT | **DONE `583f7893`** + goldens `ad8f5b0a` — provenance ledger (v14), phrase pin, board (F3), producers (economy:payBounty, faction:bribe), CLEAN/MARKED/WANTED. Advisor join-key corrections adopted (victim-id ACT↔INCIDENT, same-tick ACT↔STANDING, contraband merge). |
| 5c | J11 RANGE | **DONE `9d242df7`** — teaching integrator + 4 rungs (F4); toy verified flying under real input; TAKE IT TO THE RANGE door works. |
| 5d | J12 CHART | **DONE `06a8161c`** — real risk + sector-pair memo, model beacons, cargo deck (HERE hold-keyed), single-FILL channel law, events/holdings layers, WEATHER, rAF park, chart now PAUSES (ruling). Traffic layer DEFERRED (J12b). Review fixes: CRLF normalize localmap, 11 new sub-12px → 12px, null-market guard in buildModelBeacon (deck never rendered before it). |
| 5e | J13 loadout presets | **DONE `4dbd0257`** — one dry-run apply intent (free-grant path avoided), derived-stat label bank, per-hull cap 6, NO save bump (normalizer line; goldens untouched). Review fix: SAVE ungated for the flight host. Captured: save→'prospector' label→4 ghost bars→drawer DELETE. |
| 6a | J14 tactile feedback | **DONE `f85507a9`** — gaugeSettle (shieldRegenRate/inertia-bound), commsTrace (priority-envelope-driven, self-parking), two detent recipes via audio:cue. Review fix: 8.5px→12px. |
| 6b | J15 quick-comms radial | **DONE `6cd90065`** — Alt-held non-pausing fan (#sf-commsfan), offer-enumerated wedges, boolean-derived reason bank (first run correctly stopped on missing per-action reasons), hail deck drawer, prompt badge. Captured on a real fleeing-trader target. |
| 7 | J16 visual regression matrix | **DONE `06a45d31`** — capture:ui-matrix + check:visual-regression + 60 committed reference frames (test/ui-frame-references/, 18 MB). Full green check pass pending a quieter machine (concurrent-lane CPU starvation killed boots; every boot passes standalone). |

Landed this session: `bea90b47` `0f503607` `0996a2e4` `583f7893` `ad8f5b0a` `9d242df7` `06a8161c` `4dbd0257` `f85507a9` `6cd90065` `06a45d31`.

**PROGRAM COMPLETE (J08–J16 + responsive strategy), 2026-08-20.**

**Controller-loop notes for resuming threads:** worker = cursor-agent with the packet ON DISK at
`.devshots/packets/<job>.md` (8191-char command-line limit — never inline). Controller re-runs
every check, boots the real game for captures (no blind centre-click prologue on the browser
route — it hits a menu button; no `page.waitForFunction` timeouts without `.catch` + record),
pathspec-commits exactly its files (`git commit -- <paths>` — concurrent lanes stage into the
shared index), pushes master by name. **NEVER run `git checkout -- .`** — a mid-session one
destroyed the J10 worker's uncommitted tracked edits (recovered exactly from the cursor session
DB at `~/.cursor/chats/<dir>/<chat>/store.db` via ApplyPatch args) AND wiped a concurrent
loading lane's uncommitted work. Also: workers' `git add -N` (intent-to-add) turns a
checkout -- . into ZERO-BYTE files.

**Known follow-ups (not blockers):** chart still carries ~80 pre-existing sub-12px leaf nodes
(pre-J12 debt; needs its own measured-rect type-floor pass like J07's); sim goldens now pin v14
hashes (any future save bump re-drifts them by construction — re-record from a clean git archive
per `ad8f5b0a`); `check:baseline` wall budget can exceed 90s purely under concurrent-lane CPU
load while staying 12/12 green.

### J07 — all six bullets landed

`ad4764b5` column lock + de-box + radar · `e22a5305` target card · `2eb41dbe` hull mark + comms tape

Verified in captured, measured frames at 1440x900 and 1280x720, not by check alone. Three defects
were invisible to every automated check and appeared only on screen or in a measured rect:

1. The "232px staggered card overhang" was really `.sf-target__bars` at a fixed 220px inside a
   212px content box. Chasing the packet's literal wording would have left it in place.
2. `.sf-schematic svg { height:100% }` out-specifies a plain class and never applied to the old
   `<img>` marks. It applies to an `<svg>`, and squashed the fill layer to the crop height,
   deforming the hull as damage came off.
3. The SVG `transform` ATTRIBUTE did not take effect on the hull group at all — it drew
   unrotated and outside its box. Only `getBoundingClientRect` on the path showed it. The
   rotation is a CSS transform with an explicit `transform-box` now, so it has one owner.

**Also cleared this session** (all were “clearly broken, so fix it”):

- Flight layer raised to its 12px type floor: ~105 sub-12px elements down to 7. Raising type
  alone broke three layouts (rail labels ran together, law headline wrapped into the band pill,
  target range numeral collided with its band word) — content gives way, type does not.
  Two passes were needed: five offenders live in their own modules' stylesheets, so re-measuring
  the rendered layer is the only thing that found them.
- `kestrel.glb` in the RELEASE tree had been overwritten by a 34 MB unprocessed build — no
  `spacefaceAsset` identity, no KTX2, no meshopt, 2.15x the manifest size. Restored the real
  16 MB artifact from HEAD; `check:bundle` and `check:render-package-pilots` are green
  (103 packages fresh). The source tree was never touched, so a real remaster still promotes.
- `check:wave15-flight-boot` was failing a race it set up against itself (15s gate against a
  10-12s cold boot, then clicking a not-yet-enabled button). Green.
- `server.js` left the shared player store unmounted, so `npm start` and the launcher saw
  DIFFERENT SAVE SETS and nothing said so. Defaults to the real save dir now.
- `GLTFLoader` revoked texture blob URLs before their loads settled, producing untextured
  materials whenever a load was torn down early.

**Still open, deliberately outside J07's scope:** the right dock runs ~700px tall against a
210px reserved rectangle — the sector-law receipt drives most of it, and shrinking it is a
content decision, not a layout one.

---|---|
| Right dock -> one 220px column | **DONE** |
| De-box to hairline corner brackets | **DONE** |
| Radar 180 -> 220, chevrons, capitals, threat rings | **DONE** |
| Comms button -> integrated frequency tape | **NOT DONE** — needs `hud.js` |
| Target panel -> threat badge + range bar | **NOT DONE** |
| Ship condition PNG -> dynamic hull wireframe | **NOT DONE** — needs `hud.js` |

The two remaining bullets both land on `src/ui/hud.js`, which carries the concurrent lane's two
`resolvePropulsionProfile(p, state)` hunks. Use the `git show HEAD:` / `hash-object` recipe.

**Packet 7 goes last.** It commits golden reference images. Taken before packets 3–6 change the UI,
every one of them needs re-baselining. Note `.devshots/` is git-ignored — committing references
needs a negated ignore rule or it silently commits nothing.

---

## Order, and what can run in parallel

Sequential (shared seam — all land on `src/ui/hud.js`): **J07 → Packet 4**.

Independently parallelisable (disjoint seams, safe in their own threads):
- **Packet 5** — station/screen modules
- **Packet 6** — comms + audio
- **Packet 7** — `scripts/`, but only after 3–6 land

---

## Resolve these BEFORE building (packet prompts cite paths that do not exist)

- `src/ui/audio.js` — **does not exist.** Find the real audio module before authoring:
  `grep -rln "AudioContext\|playSfx" src/`. Creating a second audio module beside an existing one
  is the failure mode.
- `src/ui/screens/footprint.js`, `src/ui/screens/range.js` — **do not exist.** Find the screen
  registry first: `grep -rn "SCREEN_MODULES" src/`.

**Packet prompts state premises that are sometimes false. Verify before acting.** Packet 2 claimed
two images were "unreferenced"; one was load-bearing in two places and deleting it blind would have
broken the build. Packet 3's stated measurements (232px dock stagger, 180px radar) DID verify —
check each claim, don't assume either way.

`assets/ui/hud/ship-condition-scout.png` is **referenced twice** in `hud.js` (~1076–1078). J07 says
to kill it — that means replacing those two `<img>` tags with vector hull art, not deleting a file.

---

## THE GAME WAS UNPLAYABLE AND EVERY CHECK WAS GREEN

2026-08-17. The owner reported the game frozen on the loading screen, or loading to a frame with no
ship, all vitals at 0, an empty roster and dead controls. Two days. Full check suite green.

**One throw at `src/main.js:107` caused both symptoms.** `startLoop` is at 215 and
`hideBootOverlay` at 228, so a single exception at 107 means no simulation tick AND no dismissed
overlay. The throw came from `createTerminalArtwork` initialising the boot canvas twice — once from
the inline module at `index.html:143`, once from `loadingPresenter.js`.
`transferControlToOffscreen()` is **irreversible**, so the second pass fell into a "graceful"
fallback that called `getContext('2d')` on a canvas it had already given away.

Now gated by **`npm run check:playable`** (`scripts/check-game-playable.mjs`) — boots the real game,
asserts menu / flight / pilot / hull mesh / world / controls / no-throw / no-404. It caught this on
its first run. **Run it before reporting done.** Also `npm run check:boot-resilience`, which pins the
three specific defects deterministically in milliseconds.

**It is NOT racy on the dev route.** Module scripts execute in document order, so the inline
bootstrap always wins the transfer and the presenter always throws. The apparent intermittency was
*which of the two uncommitted edits were present at the time* — `index.html` and
`loadingPresenter.js` were authored days apart. `build/web/index.html` (the packaged Electron route)
has no boot canvas at all and was never affected; only `npm start` / `npm run electron` hang.

That distinction matters practically: an early mutation test of `check:playable` came back green and
looked like the gate was decorative. It was not — the mutation had reverted only two of the three
guards, and the third (`__sfTransferred`) alone is enough to prevent the fatal call. Reverting all
three turns the gate red, 7 of 8. **When a mutation test says your check is decorative, first check
that the mutation actually restored the bug.**

Also fixed while here: `loadScenarioContract` (`main.js`) and `fetchSharedPlayerStore` were the only
unguarded awaits upstream of the handoff — no timeout, so a response that never settles hangs the
loading screen (or pins Continue at "Checking saves...") with no console output. Both now carry
`AbortSignal.timeout`.

The fixes are in the working tree only — the whole loading-terminal feature is another lane's
uncommitted work-in-progress and is not in `HEAD`. If that lane rewrites those files, re-apply:
per-canvas idempotence in `createTerminalArtwork`, a `__sfTransferred` flag so nothing calls
`getContext` after a transfer, and a try/catch in `createLoadingPresenter` so decoration can never
stop boot.

---

## Traps this program has already paid for

1. **`SEMANTIC_PALETTE` has two icon channels.** `.icon` is PLAIN TEXT — `hud.js` writes it via
   `setText()`/`textContent`. Assigning SVG markup prints a literal `<svg …>` across the combat HUD,
   **and `check:ui-identity` stays green while it happens.** `.glyph` is the vector/`innerHTML`
   channel. Match the channel to how you write to the DOM.
2. **A green check is not proof.** Confirm *what* it looked at. One verification here searched a
   directory that is deleted on build failure — it passed by inspecting nothing.
3. **Boot the real game.** Three real defects in the Power Rail (collided with the existing bottom
   deck, labels clipped off-screen, wrong colour throughout) were invisible to every check and every
   lab fixture. Recipe: `scripts/lib/load-playwright.mjs`, real `page.mouse.click` for the splash
   (a scripted `.click()` is swallowed), then New Game → Launch, then measure
   `getBoundingClientRect`. The in-app Browser pane cannot screenshot here ("not compositing").
4. **`el.dataset.x = ''` still matches `[data-x]`.** Use `delete el.dataset.x`.
5. **CSS inside a JS template literal must contain NO backticks** — even in a comment. It closes the
   string. `node --check` EVERY touched file.
6. **CRLF.** A formatter rewrote a file LF→CRLF and turned a 46-line diff into 736. Check line
   endings before staging.
7. **Concurrent lane.** `src/ui/hud.js` and others carry another agent's uncommitted hunks.
   `git add <path>` scopes to the FILE, not to your hunks. Recipe that works:
   `git show HEAD:<path> > base`, re-apply only your edits, `git hash-object -w`,
   `git update-index --cacheinfo 100644,<sha>,<path>`. Verify both directions afterward.
8. **Cross-file constants drift.** A CSS keyframe duplicating a JS constant must be pinned by a test
   that reads both. A comment has never prevented that drift here.
9. **Mutation-test your checks.** Break the code deliberately and confirm the check goes red. Two
   assertions written this session passed against correct code for the wrong reason. Every
   assertion added by J07 was mutation-verified; doing so caught a real clipping defect that had
   already been written and would otherwise have shipped.
10. **`radar.js` is LF at HEAD but the Edit tool wrote CRLF into it**, turning a 121-line change
    into a 1159-line diff. Check `git diff --numstat` against the line count you expect before
    staging, and compare to `git show HEAD:<path>`. `targetPanel.js` is genuinely CRLF at HEAD —
    preserve it.
11. **The target card is suppressed while a nav route is active** unless the target is hostile or an
    asteroid (`hud.js:4188`). A fresh save always has a route, so a probe that merely selects a
    contact measures a hidden card. Both halves of that gate are sim-owned and rewritten every
    tick — the AI restores `ai.passive`, nav re-derives `state.nav.waypoint` — so forcing them from
    a probe loses the race. Target an **asteroid**: `miningRelevant` is a bare type test nothing
    rewrites.
12. **Three cascade layers set the same HUD selector.** `injectHudCss`'s early block, its late
    override block ~600 lines below, and `styles/ui.css` — plus media queries. `.sf-mission-tracker`
    was de-boxed in one and silently re-plated by a trailing rule in another. Do not read one
    stylesheet and conclude anything; measure `getComputedStyle` in the running game.

---

## Known-red, NOT yours

- `sim-v3` in `check:baseline` — the concurrent lane has `test/47a.telemetry.v3.expected.json`
  uncommitted. Red before this work started. Baseline is **11/12** green; treat that as the target.
- `check:bundle` — fails on `kestrel.glb` package provenance, an uncommitted ship model from the
  concurrent lane. Unrelated to frontend work.
- `check:assets:live` fails whenever the tree is dirty. `check-helios-sky-kit` fails on cycle 10.

---

## Definition of done, per packet

1. The feature is **wired and reachable in the running game**, not just authored. An unmounted
   module is the "authored but never promoted" failure this repo keeps repeating.
2. Booted in real flight and looked at. Screenshot or measured rects.
3. Focused checks green, plus `check:baseline` back to its 11/12 baseline.
4. Committed, scoped to your own hunks.
5. **This file updated** before the thread ends.
