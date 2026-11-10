<!-- LIFETIME: RECEIPT -->
# PQ-180.03 — Reference frames for every surface

```text
DONE  PQ-180.03 — every screen the harness can open now has its photograph: 408 frames over a flat ground, same universe, and the check that counts them is green. Six screens still have no route, so they stay owed, not faked.

WHAT I FOUND     The 408-frame shoot had already landed except Asteroid Works: latching reels the hull into the rock, so a second photograph in that same boot could not re-latch. Forced-colours at the widest size also needed a longer wait for the drill approach.

WHAT I CHANGED   Asteroid Works now boots once per media mode. A filtered run no longer pays for a shared boot that has nothing to photograph. Fill-missing skips frames that are already current. The drill wait is 60 s. `--coverage-only` lets the check count the baseline without a two-hour recapture.

WHAT YOU WILL FEEL   Nothing in play. The gate that says "this screen still looks like itself" now covers every screen you can actually open.

THE NUMBERS      bar | before | after | target
                 reachable reference frames current (seed 47, ground neutral-12151a) | 5/12 Asteroid Works, rest of matrix already shot | 408/408 | 408/408
                 unreachable frames (no route) | 72 owed | 72 owed | owed, not shot
                 check:visual-regression --coverage-only | missing Asteroid Works | PASS 408/480 (72 owed) | PASS
                 ui-grammar-matrix tests | 72 | 74 | green

THE FRAMES       test/ui-frame-references/asteroid-works-*.png — twelve; the drill board over the same neutral ground as the rest of the matrix.

NEXT             Recapture rest-twins when a quiet machine can spare two hours (`npm run check:visual-regression` with no flag). PQ-181/168/182 own the six screens that still have no route.
```

## Review

[Review](b15b0cfe-2961-4131-92f6-ea61ea900775) APPROVE after REQUEST CHANGES: fill-missing kept rows now point at the committed reference files, not at an output path this run never wrote.

## Checks

| Check | Result |
|---|---|
| `node --test test/ui-grammar-matrix.test.mjs` | 74 pass |
| `node scripts/check-visual-regression.mjs --coverage-only` | PASS 408/480 present and current; 72 owed |

## The decision this cycle implements

Cycle 1 finished the harness and proved it, and then stopped one step short: the 408 photographs
were never taken, because a full baseline was going to be about **330 MB** of PNG in git. The frames
were dominated by the live 3D picture behind the interface, which is high-entropy noise that PNG
cannot compress and a world that legitimately moves.

The integrator's ruling, implemented here: **a reference frame photographs the INTERFACE, over a
flat neutral ground.** It does not photograph the game's 3D picture.

That is not a saving dressed up as a principle. Every rule this matrix scores — type roles and the
12 px floor, tabular numerals, colour spent only on state, the layout skeleton, the three disclosure
tiers, clipping at +40 %, forced-colours, reduce-motion — is a property of the interface layer, and
none of them is a property of the starfield. The 3D picture already has its own instruments: the
runtime witness, the fun-loop bench strips, the shipping-camera captures. Using a screenshot diff on
it costs the matrix its whole reason to exist, because the floor then has to be widened until a real
interface regression fits inside it. `flight` carried a **10 %** floor for exactly that reason, with
the note "a live world legitimately moves behind the HUD" — and 10 % of 2560x1080 is 276,000 pixels
of change this gate would have called "at rest".

### The seam, and why it is honest

The game's picture reaches the screen two ways, and the harness hides **both**, because calling one
of them ground and the other interface would be incoherent — they are the same content in two
encodings:

| Hidden | What it is | How |
|---|---|---|
| `#gl-canvas` | the live WebGL surface the renderer draws into (`src/render/renderer.js`) | `opacity: 0` |
| the `#screens` background image | `assets/cinematics/C-INTRO-01.jpg` — the same picture, pre-rendered, standing behind every menu-phase screen (`styles/ui.css`) | `background-image: none` |

`opacity: 0`, not `visibility: hidden` and not `display: none`: the canvas keeps its box and its
hit-testing, so `src/systems/input.js` (which binds to `#gl-canvas`) and `autoTargetAssist.js` (which
reads its rect) behave exactly as they do in play. Nothing about the game changes except what reaches
the film. `display: none` would resize the renderer, which is changing the game to photograph it.

**Everything the interface draws is kept and photographed**, including the layers that sit between
the plate and the panel. The `#screens::before` readability scrim and its vignette composite over the
neutral ground exactly as they composite over the plate, so a regression that breaks the scrim is
still a diff. Every canvas the interface owns is kept as it renders — the radar dial
(`src/ui/radar.js`), the chart's star map, the ship stage's hull preview, the portraits. The line
drawn is "is this the game's 3D world", never "is this a canvas" and never "is this a background".
The tests assert the absence of a blanket `canvas { … }` rule for that reason: it would erase the
radar and the chart and nothing in a coverage number would show it.

What is genuinely given up is one thing, and it is named rather than hidden: **a change to the
cinematic plate itself no longer shows up here.** That is an asset change; it belongs to the
visual-asset route (`docs/visual-assets/`), not to a type-and-layout gate.

The rules are injected by the harness, into the page, after the document exists and before the first
frame of the boot — `styles/` and `src/ui/` are not touched, and the shipping game has no idea this
exists.

One expectation worth writing down rather than discovering: under the `forced-colors` column
Chromium substitutes the system `Canvas` colour for the injected background. That column's ground is
still flat and deterministic; it is simply the system's colour and not this hex. It is also the
correct ground for that mode.

### The ground is pinned the way the seed is

`UI_MATRIX_GROUND` is `neutral-12151a` — the token carries the hex, because a silent change to the
colour would move every diff in the matrix with nothing anywhere saying so. That is the unpinned-seed
failure cycle 1 found, one layer down.

Every promoted frame records its ground beside its seed in `provenance.json`, and **a frame counts as
coverage only while both match what the harness shoots today**. A frame over another ground is
reported `STALE`, counted as missing, never diffed, and re-shot even under `--fill-missing`. The
coverage table splits the two reasons and prints a different remedy for each, because they are
different mistakes.

### The floors: a pin belongs to the ground it was measured over

The five floors pinned on 2026-08-20 were measured with the live picture behind the interface.
`flight`'s own note says so. Holding a 10 % floor over a still ground would mean this gate reading
green straight through the regressions it exists to catch.

So each floor record now carries `pinnedGround`. A pin holds only while that ground is the ground the
harness shoots over; when the ground changes the pin **lapses** at the next calibration, the surface
is re-measured from that run's two samples, and the number it used to hold is kept in `pinLapsed`
rather than erased. **A lapse can only ever tighten a floor.** The widening rule is untouched, and a
lapsed pin still goes through the suspect refusal like any other surface.

## The defect the shoot found, ten minutes in

Cycle 1's harness was proven on replayed directories and on synthetic frames. It had never completed
a real `--update`. The first one uncovered a defect that no test and no dry run could have seen:

**The primary boot's `captureModeSet` call did not pass `provenance`.**

That call is responsible for roughly 270 of the 408 frames — every standard-mode in-flight surface at
every width. The two statements that promote a frame are separate:

```js
copyFileSync(dest, target);
if (provenance) recordReferenceProvenance(name, provenance);
```

so those 270 frames were copied into the baseline **correctly** and recorded **nowhere**. Each one
would then read as `STALE` on every later run, be counted as missing, and never be diffed. The check
could never have gone green, no matter how many times the matrix was shot, and the only symptom would
have been a coverage number that would not move — after a two-hour capture, with nothing naming the
cause. It cost ten minutes because the run was watched; unwatched, it costs the run.

Two changes, not one:

1. the missing argument is passed;
2. **the promote path refuses to write a frame it cannot record.** A guard, not a comment: the
   failure was invisible precisely because writing and recording were separate statements and only
   one of them was checked. A capture that costs hours has to fail in its first seconds.

A test walks every capture call site in the source and asserts that anything passing
`promoteReference` also passes `provenance`, so the next path added to this file cannot repeat it.
