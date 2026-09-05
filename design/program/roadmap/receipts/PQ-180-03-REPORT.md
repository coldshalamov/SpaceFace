<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-180.03 — Reference frames for every surface

```text
NOT DONE  PQ-180.03 — the harness that photographs every surface is finished and proven, and the check now tells the truth about what it has; the photographs themselves are owed to a machine no other lane is using.
WHAT I FOUND     The matrix had been grown from 60 frames to 480 and the frames looked right, but not one of them could ever have caught a regression: the game builds a new universe from the clock and the random number generator every time it launches, so every reference frame was a photograph of a galaxy no later run would ever see again — different prices, different contracts, different traffic — and the only way to make such a diff green is a floor wide enough to hide a real change inside.
WHAT I CHANGED   Every boot now types the same universe seed into the field a player types one into and proves the game took it before photographing anything; each committed frame records which universe it came from, so one from any other is reported missing and never diffed; four screens that were unreachable in the +40 % language pass and the comms fan now open on their real routes; and the check separates a frame nobody photographed from a screen nobody has built, failing on the first and billing the second to the packet that owes it.
WHAT YOU WILL FEEL   Nothing in play — this is the camera that watches the game, not the game. Once the photographs are taken, a change to any screen shows up as a named picture that differs, instead of waiting for somebody to notice it.
THE NUMBERS      reference frames the check counts as coverage | 0 of 480 (358 on disk, each a different universe) | 0 of 480 (60 on disk, all named stale) | 408 · surfaces in the matrix | 40 | 40 | 40 · modes x widths | 4 x 3 · surfaces the harness can open | 26 of 34 | 34 of 34 | 34 (six more have no screen to open) · baseline bytes | 292,112,059 (278.6 MB) | 18,014,799 (17.2 MB) · harness defects fixed | 0 | 11 · tests | 37 | 66
THE FRAMES       design/program/roadmap/receipts/pq-180-03/menu-phase-rest-twin-zero.png — the title screen, New Game and the Crucible door at 2560x1080, each byte-identical to its own rest twin (0.0000 %), which is the rest guard reading zero when nothing is moving.
NEXT             PQ-180.03 again, on an idle machine: `npm run capture:ui-matrix -- --update` (about 2.5 h), then `npm run check:visual-regression -- --calibrate --keep-temp`, then a plain `npm run check:visual-regression`.
```

## Why this is NOT DONE, in one paragraph

The done-when is "`check:visual-regression` covers every surface in the manifest — diff on change,
with a committed baseline". There was no version of this leaf that could reach that today, because
the 480 frames the packet was counting as coverage were 480 different galaxies, and a baseline that
cannot detect a change is not a baseline. Re-shooting it needs one uninterrupted run on a machine no
other lane is using: the frames land at about 15-20 s each when the machine is quiet and at 65 s each
under the load that was on it all morning — 2.5 hours against 8. Two other lanes were running sim
checks and a bench throughout, and a **partly** re-shot baseline is worse than none: a leftover frame
from the old era, diffed against a current capture, reads as a 5-40 % regression that nothing
distinguishes from a real one, and the calibration would bank that difference as the surface's floor.

So the baseline is left in a state that is honest and resumable rather than half-done. The 298 frames
that had never been committed were deleted — they were 298 different universes and 261 MB. The 60
that were already committed are left untouched and are reported `STALE`: on disk, never diffed, with
the command that re-shoots them. `check:visual-regression` prints
`reference-frame coverage: 0/480 frames over 40 shipping surfaces`, names all 408 shootable frames
with a per-surface command, bills the other 72 to `PQ-181`, `PQ-182` and `PQ-168`, and exits 1.
Whoever runs the capture next gets a truthful starting point and one command.

## The defect this leaf actually found

The matrix had already been grown from 60 frames to 480 and the frames looked correct. They could
not have caught anything.

`resetRunState` seeds a new game with `Date.now() ^ Math.random()` whenever New Game is launched with
the seed field blank (`src/main.js`). The capture harness always launched it blank. **Every boot
therefore built a different galaxy** — different market prices, different contracts, different
traffic, different missions, different everything a screen displays — so every reference frame was a
photograph of a universe no later run would ever see again.

A diff against that cannot detect a regression. It can only be made green by a per-surface floor wide
enough to hide a real change inside, which is precisely what the golden law in
`test/ui-frame-references/README.md` forbids. And nothing anywhere said so, because each individual
frame looked exactly right.

The harness now types seed **47** — the repo's canonical fixture seed — into `#sf-ng-seed`, the field
a player types one into, before the New Game screen is even photographed, and then **reads the seed
back out of the running game**. A boot that did not take it throws instead of producing a frame.
Typing into a field and trusting it is how this survived the first time.

The 358 frames that existed before this leaf were each shot in a different universe and are not
comparable with anything, so the baseline was re-shot under the pinned seed.

## The other defects fixed

| What was wrong | What it cost |
|---|---|
| **TDZ in the capture.** `uniqueCaptures` was read by two statements above the `const` that declares it, and `const` is not hoisted. | Every *complete* run threw a `ReferenceError` after the browser and server had been torn down — and `check:visual-regression`'s retry loop answered that by re-shooting the whole matrix three times. |
| **A boot failure aborted the matrix.** `openBootWithRetry` was called with no `try` inside the viewport loop. | One width failing to boot threw out of `captureUiMatrix` entirely and the check re-ran the entire capture. It now costs that width's frames, each named in its own row, and the next width still runs. |
| **The pseudo-localised route was declared unreachable.** Labels were matched by stripping accents, but `pseudoLocalize` maps `t→ŧ`, `d→đ`, `h→ħ`, `p→þ`, `b→ƀ`, `f→ƒ`, `m→ɱ`, `q→ʠ` — letters with a *stroke*, which have no NFD decomposition, so the normalizer deleted them outright. "Settings" renders as `⟦Šëëŧŧïïñğš⟧`, which normalizes to `seeiings`. | `settings`, `save-load`, `crucible-door` and `automation` lost their whole pseudo-localised column, 12 frames. Fixed by asking the game's own `pseudoLocalize` what the label becomes — never by loosening the matcher. |
| **The comms fan could never open** (handoff defect 2). The harness pushed a fabricated "Accord Patrol" onto `state.entityList` and pointed `player.targetId` at it. `entityById` resolves through `state.entities`, a **Map** the fake was never in; `contactKind` classifies on `data.ai.lawful` / `team === 2` / `ai.passive`, none of which the fake carried; and setting `targetId` at all **disables** the auto-acquire that would have found a real ship. The fan refuses to open on an empty action list. | All 12 comms-fan frames. Fixed by doing the opposite of the fabrication: clear the target and let the game acquire a real one. Helios Prime runs eighteen traffic ships a minute inside the 5,200 wu hail range. |
| **`--update` deleted good references.** The prune ran against what this run captured. | A transient timeout on one surface silently destroyed reference frames that take an hour to shoot, and the next run reported them missing with no idea why. It now prunes against the **plan**: stale means "no longer in the matrix", a question about the manifest and not about tonight's luck. |
| **A filter did not narrow the menu phase.** `normalizeFrameFilter` was applied twice and was not idempotent — `Array.isArray(new Set())` is false, so the second call turned every filter back into `null`. | Every filtered run also re-photographed the title and new-game screens. Harmless under `--fill-missing`; under `--update --only=X` it rewrote two references nobody asked to re-shoot. |
| **The check passed when an opener regressed.** The judge skipped a frame when *either* side was absent, and coverage only reads the reference directory. | An opener could break, produce nothing, and the check would print `PASS`. A reference with no candidate is now a red row saying the route regressed. |
| **Suspect floors were banked.** A surface that held still through its own open but disagreed with its reference had that disagreement written in as its floor, with a warning note attached. | That is a reference shot mid-motion being absorbed into the gate. The calibration now **refuses**: the floor does not move, the surface stays red, and the red is what makes someone re-shoot the reference. |

## Reachable, versus owed

`check:visual-regression` now draws a line the old one did not:

- a frame missing on a surface the harness **can open** is a failure;
- a frame missing on a surface with **no route into it at all** is reported in full, with its owner
  packet and leaf, and is not a failure.

Six surfaces are in the second group — `credits`, `statistics`, `photo-mode`, `crucible-lab`,
`localmap-legacy`, `starmap-legacy`; 72 frames — because they have no module or no route. Nobody can
photograph a screen that has not been built, and a gate that is red on arrival for that reason is a
gate agents learn to ignore, which is exactly what the 2026-09-04 handoff records about
`check:ui:grammar-matrix`. Those rows are a bill with a packet on it, not a pass.

A **fixture** entry is on the failing side of that line. A bus emit is honest enough to photograph a
surface; it is never evidence a player can reach it, and the grammar matrix keeps that reachability
cell red regardless.

## Boots

Three surfaces cannot share a boot, because opening them leaves the session somewhere else and every
frame taken afterwards would be a picture of that:

- `game-over` ends the run;
- `asteroid-works` parks the hull against a rock with a massline latched to it;
- `base` **flies to another sector** — the boot sector authors no claimable body at all — which would
  also point the station dock fixture at a sector that may have no station in it.

`game-over` needs one boot per mode, because after it there is nothing left to photograph. The other
two need a fresh boot only per *locale*: isolation is from other surfaces, not from another
photograph of themselves. Twelve boots rather than twenty-four.

## The two routes that had to be prepared, and how honestly

Neither invents an entity, and both press the key the player presses:

- **Asteroid Works** — the hull is flown alongside one of the seventy rocks the sector authors near
  spawn, latched with the real tether key, and then `b` is pressed and the approach the tether system
  reels in is waited out for real. The drill requires an active `tether_standard` within 220 wu of
  hull surface (`src/ui/input.js`; `DRILL_APPROACH_MAX_SURFACE_WU`, `src/systems/tetherGameplay.js`).
- **The claims board** — the boot sector authors no claimable body, so the harness flies the jump to
  a neighbour that does, through the world system's own `enterSector`, arrives beside the body Ceres
  Belt authors, and carries the 15,000 cr the claim costs against a 5,000 cr start. Then `u`, twice,
  because the screen registers lazily and a player presses twice.

What is arranged is a position and a bankroll — both things play arranges. What is not arranged is a
screen, an entity, or a route. Both preparations are bounded at 60 s, because `page.evaluate` has no
timeout of its own and the first run of the claims board spent twenty-five minutes inside one with
nothing printed.

## The handoff's two open defects

1. **The probe could not return to idle flight after a station or Crucible screen.** Already worked
   around in the tree when this leaf started: `escalateScreenExit` clears the dock flags and emits
   the *committed* `dock:undocked` that the confirm flow itself emits, which is the step the earlier
   `station:exitRequest` emit never reached. The station frames exist, so it works. What was wrong
   was the comment block above it, which still said "Escape only, three programmatic exits tried and
   rejected" directly above the code doing the programmatic undock. The comment was corrected to
   describe the mechanism and to keep recording the two approaches that genuinely are dead ends.
2. **`comms-radial` and `wingman-radial` timed out at 20 s.** `wingman-radial` was already fixed by
   the fleet seed. `comms-radial` is fixed here, for the reason in the table above.

## Provenance: what makes the baseline resumable

`test/ui-frame-references/provenance.json` records which universe each committed frame was
photographed in. **A frame counts as coverage only while its recorded seed matches the seed the
harness shoots in**; anything else is reported `STALE`, counted as missing, and never diffed.

Without it, a half-re-shot baseline is worse than an empty one, and this leaf would have had to
choose between an eight-hour uninterrupted run and deleting everything. With it, the baseline can be
re-shot a few surfaces at a time, across sessions and machines, and the check always says which
frames are current. The record is written after every promoted frame, not at the end of the run: a
full matrix takes hours, and a record written only at the end turns any interruption into a baseline
whose provenance is unknown.

`--fill-missing` honours it too: a frame that is present but from another universe is re-shot, not
kept, because otherwise the gap it represents stays invisible.

## Storage

Measured on this tree, on the frames that existed:

| | |
|---|---|
| Before | 358 frames, 292,112,059 bytes (278.6 MB) — 16x the committed baseline's 18.0 MB |
| After | 60 frames, 18,014,799 bytes (17.2 MB) — the 298 never-committed void frames deleted |
| Full matrix, projected | 408 shootable frames at the observed ~816 KB average ≈ **330 MB** |

The brief's rule fires well before that: keep the resolution the game rendered at, optimise
losslessly, state the number. `npm run optimize:ui-frame-references` does exactly that and was
measured first — **4.8 %** recovered across a six-frame sample (3.1 % to 10.4 %), every frame verified
pixel-identical after re-decoding, and one frame got *larger* and keeps the bytes it had. It matches
the 3.9-11.6 % the previous agent recorded and independently confirms their conclusion.

**One measurement is worth writing down because it looks like a win and is not.** `sharp.png({ effort })`
silently switches libvips to palette quantisation: a 50 % "saving" that is a 256-colour approximation
with per-channel errors up to 51. Anything that changes a pixel changes what the diff floors mean, so
the optimiser passes `palette: false` and re-decodes every frame to prove the bytes it writes are the
same picture, refusing loudly if they are not.

**330 MB in git is a real cost and it is the integrator's call**, not something to solve by
downscaling — the brief forbids that, and a smaller frame would not show the 12 px type floor the
matrix exists to measure. Git LFS is the obvious lever if it is wanted.

## Checks

| Check | Result |
|---|---|
| `npm run check:baseline` | **14/14 green**, 45.8 s wall against a 90 s budget. An earlier run showed 24/26 with two `check:47a` children over their wall budget; both were re-run on an idle machine and are green — they were contention from other lanes, not assertions. |
| `node --test test/ui-grammar-matrix.test.mjs` | **66/66 green** (37 before this leaf). |
| `npm run check:visual-regression` | **Exits 1, correctly.** `reference-frame coverage: 0/480 frames over 40 shipping surfaces`; 408 shootable frames named with a per-surface command; 72 owed to `PQ-181`/`PQ-182`/`PQ-168`; 358 stale frames named and never diffed. Run against replayed capture directories, since the full capture could not complete — see "Why this is NOT DONE". |
| `npm run check:ui:grammar-matrix` | Exits non-zero **by design** in its `--static` form: it measures 0 surfaces without a browser, and the 2026-09-04 handoff records that it is deliberately in no gate. 754 failing cells, all owned. |
| Calibration dry run | The `--calibrate` path was exercised end to end on synthetic frames before committing to a two-hour capture. It correctly left a pinned surface alone, and correctly **refused** a surface whose rest twin was 0.05 % but whose reference differed by 9 %, printing the re-shoot command instead of banking the floor. |

A stale frame on a shootable surface **fails** the check: `stale` is a kind of missing, so it lands in
`missingReachable` and the exit rule reads it there. That is why the 60 frames still on disk do not
buy a green run, and why re-shooting 40 of them would leave the other 20 red — which is the point.

## Files

**Changed**

- `scripts/capture-ui-matrix.mjs` — the pinned seed and its read-back guard; provenance recording;
  the TDZ fix; per-viewport and per-mode boot-failure containment; `isolatedBoot`; the pseudo-locale
  label candidates; the comms fan, drill and claims-board preparations, each bounded at 60 s; the
  idempotent filter; plan-based pruning; the corrected `escalateScreenExit` comment.
- `scripts/check-visual-regression.mjs` — rewritten around the shared judge; the calibration takes its
  cross sample from the committed baseline and refuses suspect floors; one capture attempt instead of
  three; a guard against capturing into the reference directory.
- `scripts/lib/ui-grammar-measure.mjs` — a surface with no route no longer gets a remedy telling you
  to photograph it.
- `scripts/ui-grammar-surfaces.mjs` — `isolatedBoot` on `asteroid-works` and `base`, with the entry
  details saying exactly what the harness arranges.
- `test/ui-grammar-matrix.test.mjs` — 29 new assertions.
- `test/ui-frame-references/README.md` — the one-universe rule, provenance, MISS versus OWED, boots.
- `package.json` — `optimize:ui-frame-references`.

**Added**

- `scripts/lib/ui-frame-regression.mjs` — coverage, floors, the diff, the shared judge, the exit rule.
- `scripts/optimize-ui-frame-references.mjs`
- `test/ui-frame-references/floors.json`
- `design/program/roadmap/receipts/pq-180-03/menu-phase-rest-twin-zero.png`

**Deleted** — 298 never-committed reference frames (261 MB), each a different universe. The 60
already-committed frames are untouched and reported stale.

Everything new is `git add -N`. Nothing is staged, nothing is committed, and `design/program/NOW.md`
and `program-queue.json` are untouched.

## Unfinished, and why

1. **The baseline itself.** 408 shootable frames, owed to an idle machine. The command is in `NEXT`.
2. **The floors for the 35 uncalibrated surfaces** stay at the strictest floor there is (0.5 %),
   which is the documented behaviour for an uncalibrated surface — its real variance then shows up as
   a failure with a number attached, which is the calibration. Calibrating needs two full passes and
   therefore waits on the baseline. The five floors measured on 2026-08-20 stay pinned; note that
   they were measured across random universes, so they are upper bounds and will likely tighten.
3. **The Asteroid Works and claims-board openers are built but not proven at scale.** The comms fan
   is proven — it produced a real frame with real wedges. Those two were smoke-tested twice and both
   attempts were starved by other lanes before finishing; their preparations are bounded at 60 s, so
   a failure costs one surface and names itself rather than stalling a run.
4. **`test/ui-grammar-baseline.json` is not re-recorded.** It is an observation record from a *headed*
   measured run at 08:14 today; the reference-frame cells have gone green since. Re-recording it
   needs another headed run, which is `PQ-180.00`'s instrument, not this leaf's.
