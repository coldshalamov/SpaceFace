# UI Frame Reference Matrix

The committed reference frames for **every shipping surface in the manifest**
(`scripts/ui-grammar-surfaces.mjs`), photographed from the running game.

| | |
|---|---|
| Surfaces | every row of `SHIPPING_SURFACES` — 40 as of PQ-180 .03 |
| Modes | `default`, `reduced-motion`, `forced-colors`, `pseudo-localized` |
| Widths | `1280x720`, `1920x1080`, `2560x1080` (the widths come from `scripts/ui-grammar-thresholds.mjs`; nothing else may declare them) |
| Full matrix | 40 × 4 × 3 = **480 frames** |
| File name | `<surface>-<mode>-<width>x<height>.png` |

The surface list is **not** written here. It is the manifest, and the frame plan is built from it, so
a surface added to the matrix is photographed by construction and the two can never drift.

## How the modes are produced

- `reduced-motion` and `forced-colors` are real media emulation —
  `page.emulateMedia({ reducedMotion: 'reduce' })` and `{ forcedColors: 'active' }` — not a class on
  the body.
- `pseudo-localized` boots the game's own pseudo-locale (`PSEUDO_LOCALE` in
  `src/localization/runtime.js`, `?locale=qps-ploc`), which expands strings by roughly the +40 %
  the grammar's floor names. A harness-invented locale would photograph the English fallback and
  call it a pass.

## One universe

Every frame in this directory is photographed in **the same galaxy**: universe seed **47**, the
repo's canonical fixture seed, typed into the `#sf-ng-seed` field on the New Game screen — the field
a player types one into — and then **read back out of the running game** before anything is shot. A
boot that did not take the seed fails instead of producing a frame.

This is not a nicety. `resetRunState` seeds a new game with `Date.now() ^ Math.random()` when that
field is left blank (`src/main.js`), so before this every boot built a **different** galaxy: different
market prices, different contracts, different traffic, different missions. Every reference frame was
a photograph of a universe no later run would ever see again. A diff against that cannot detect a
regression — it can only be made green by a floor wide enough to hide one inside — and nothing said
so, because the frames themselves looked perfect.

If you change the seed, the entire baseline has to be re-shot. It is not a knob either.

### provenance.json

`provenance.json` records which universe each committed frame was photographed in, and it is what
makes a partly re-shot baseline honest rather than dangerous. **A frame counts as coverage only while
its recorded seed matches the seed the harness shoots in.** Anything else — another seed, or no
record at all — is reported `STALE`, counted as missing, and **never diffed**.

That matters more than it sounds. A leftover frame from another universe, diffed against a current
capture, reads as a 5-40 % change that nothing distinguishes from a real regression, and the
calibration would then bank that difference as the surface's floor. It also means the baseline can be
re-shot a few surfaces at a time, across sessions and machines, and the check always says exactly
which frames are current:

```bash
npm run capture:ui-matrix -- --update --only=station-market
```

The record is written after every promoted frame, not at the end of the run: a full matrix takes
hours, and a record written only at the end turns any interruption into a baseline whose provenance
is unknown.

## Regenerate

```bash
# grow the baseline: writes ONLY frames that do not exist yet, prunes nothing
npm run capture:ui-matrix -- --fill-missing

# one surface, after fixing it
npm run capture:ui-matrix -- --fill-missing --only=station-market

# a full, deliberate rewrite of every reference (rare — read the golden law first)
npm run capture:ui-matrix -- --update
```

`--only=`, `--mode=` and `--viewport=` narrow what is **captured**. They can never narrow what is
**judged**: `check:visual-regression` always builds the full plan.

## What the check does

```bash
npm run check:visual-regression
```

1. **Coverage.** Every planned frame is present, or it is an explicit row naming the surface, its
   owner packet, its owner leaf and a per-surface remedy. A surface the harness cannot open is never
   silently dropped from the plan.
2. **Rest guard.** Every frame is shot twice through the same open, one 400 ms beat apart — the
   frame and its **rest twin**. A difference between them means the surface was still moving when it
   was called settled.
3. **Regression.** Every frame is diffed against its committed reference at a channel tolerance of
   `8/255`; a differing-pixel ratio above that surface's floor is red.

The rest twin replaced a second full capture pass when the matrix grew from 60 frames to 480. Both
ask "did this surface hold still"; the twin answers it directly, for one extra screenshot per frame,
instead of doubling a two-and-a-half hour run.

### MISSING and shootable, versus OWED

A gap in the coverage table is one of two different things, and the check treats them differently:

| | | |
|---|---|---|
| **MISS** | the harness has an opener for this surface and the frame is not there | **the check fails** |
| **OWED** | nothing opens this surface at all — it has no module, or no route into it | reported in full, with its owner packet and leaf; **not a failure** |

Nobody can photograph a screen that has not been built. Credits, statistics, photo mode, the Crucible
lab and the two legacy maps are `entry.kind: 'none'` in the manifest and stay in the plan — 72 frames
across six surfaces — so the bill is visible and assigned. What they are not is a gate that is red on
arrival, because a gate that is always red is a gate agents learn to ignore. Building those screens
is `PQ-181` and `PQ-182` work; the day one of them gets a route, its row flips to MISS and the check
starts demanding frames for it.

A **fixture** entry is on the failing side of that line. A bus emit is honest enough to *photograph*
a surface, so a missing frame for one is a real gap. It is never evidence a *player* can reach it —
that is a separate cell, and the grammar matrix keeps it red regardless.

### Boots

Most surfaces share one boot per width and mode. Three cannot, because opening them leaves the
session somewhere else, and every frame taken afterwards would be a picture of that:

- `game-over` **ends the run**;
- `asteroid-works` parks the hull against a rock with a massline latched to it;
- `base` **flies to another sector** — the boot sector authors no claimable body — which would also
  point the station fixture at a sector that may have no station in it.

Those three are `destructive` / `isolatedBoot` in the manifest and get a boot each, per mode.

## The floors

`floors.json` holds one floor per surface. A floor is the **measured rest variance** of that
surface, widened by one stated rule:

```
floor = max(0.5%, ceilTo(measuredMaxRestVariance × 1.2, 0.5%))
```

Replayed against the five floors measured on 2026-08-20 the rule reproduces four of them exactly
(footprint 0.5 %, range 0.5 %, ship 3 %, chart 5 %) and would have given flight 10.5 % where 10 %
was written down. Those five stay **pinned** at the values they were measured at; the rule governs
every surface calibrated after them.

Each surface's rest variance is measured **twice per frame**:

- the frame against its own **rest twin** — did it hold still through one open? — and
- the frame against its **committed reference** — does the same route reproduce across a boot, a
  process and a day?

The worst frame of a surface across both samples is that surface's measured rest variance.

The second sample is the committed baseline on purpose. That is literally the comparison the gate
performs, so it is the variance a floor actually has to absorb; shooting a throwaway second pass to
ask the same question costs another full matrix — an hour of browser — while the frames the gate
judges against sit on disk unused. `--second-pass` still shoots one, for a tree whose baseline is
itself in doubt.

Holding both samples separately is also a **diagnosis**, and `floors.json` records both. A surface
whose rest-twin sample is small but whose cross-pass sample is large has not measured "a wide
surface" — it has measured **a reference that was shot mid-motion**, or under load from another lane.
The calibration flags those as `suspect` and prints the command to re-shoot them. Re-shoot the
reference; never bank the number as a floor.

```bash
# measures against the committed baseline; writes floors.json from what it measured
npm run check:visual-regression -- --calibrate

# shoot a genuine second pass instead of trusting the baseline
npm run check:visual-regression -- --calibrate --second-pass

# fold in capture directories that already exist (pass A, its rest twin, the cross sample)
npm run check:visual-regression -- --calibrate --from-dirs=<a>,<twin>,<cross>
```

A surface with no calibrated entry takes the strictest floor there is (0.5 %), never a loose
default: its real variance then shows up as a failure with a number attached, which is the
calibration.

## Golden Law

**Never regenerate these frames just to make a failing visual diff pass, and never widen a floor to
absorb a diff you have not explained.** Identify what changed first. The floors encode measured rest
variance on a clean tree; they are not knobs. If a frame fails calibration only while the machine is
loaded, re-shoot that frame — do not widen its floor.

## Storage

The baseline is stored at capture resolution, exactly as the game rendered it. Lossless re-encoding
was measured on this tree and rejected as not worth its cost: maximum-compression re-encoding with
adaptive filtering and the alpha channel stripped recovered 3.9–11.6 % per frame at 1.5–29 s each
(≈1.5 h for the matrix), and the repo's own PNG writer produces files 19–203 % *larger* than
Playwright's. The byte count of the committed baseline is recorded in
`design/program/roadmap/receipts/PQ-180-03-REPORT.md`.
