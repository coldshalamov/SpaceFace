# G19-01 — The rope getting stronger is an event the player sees

**Commission:** EC-G19 One ladder. **Size:** medium. **Tier:** Devin (SWE-2 Max) or better.

## Why
The player's only progression is the Line (the rope) gaining a Class, I to VIII, by tonnes moved.
Today a class-up happens silently: the sim emits `line:classChanged` and only the radio
(`src/systems/bandRadio.js`) reacts. The player never learns they got stronger. Fix that.

## What the player must see (exact)
When the class goes up, all of this happens within one second:

1. **A centre-screen plate** for about 4 seconds, three lines:
   - `LINE CLASS III — CABLE` (class numeral, an em dash, the class name in capitals)
   - `You can now hold: loaded containers, Bruisers, a container string`
   - `New move: Whip — snap the line to fling what is on it without a swing`
2. **The cable on the ship visibly changes** to the new class's `cableWidth` and `cableColor` from
   `src/data/lineProgression.js` (`LINE_CLASSES[n].hardware`). Check whether the renderer already
   reads these (`src/render/lineVisualProfile.js`, `src/render/lineHardware.js`). If it does, only
   add a brief bright pulse along the cable at the moment of change (0.6 s). If it does not, make
   it read them.
3. A sound if the audio system has a fitting existing cue for a reward/unlock (search
   `src/data/audioRecipes.js` for `unlock`, `reward`, `level`); reuse it, do not author new audio.

Use this exact table (from the design doc 17 §1) as a new frozen export `LINE_CLASS_NAMES` in
`src/data/lineProgression.js`, keyed by class index:

| Index | Name | You can now hold | New move |
|---|---|---|---|
| 1 | Thread | pods, crates, Wasps, small rocks | Swing — latch and arc |
| 2 | Cord | fighters, medium rocks, a bus (just) | Throw — release is graded and named on screen |
| 3 | Cable | loaded containers, Bruisers, a container string | Whip — snap the line to fling what is on it without a swing |
| 4 | Hawser | crewed light ships, big rocks, doors | Anchor — plant yourself and hold against a pull |
| 5 | Chain | haulers, hot plates, heavies | Drag — tow at full boost |
| 6 | Girder | hulls off hooks, station modules | Tear — pull parts off something bigger than you |
| 7 | Span | sections of a capital wreck | Orbit — keep a body circling you as a shield, then send it |
| 8 | the Massline | a moonlet | Sling a moonlet |

(Class VIII's plate title is `LINE CLASS VIII — THE MASSLINE`.)

## Read first
- `src/systems/lineProgression.js` (lines ~160–185: `_recomputeClass` emits `line:classChanged`)
- `src/data/lineProgression.js` (`LINE_CLASSES`)
- `src/ui/discoveryPlate.js` — an existing centre plate. **Reuse it or its styling**; do not invent a
  new popup style. If it cannot show three lines, extend it minimally.
- How UI modules subscribe to bus events: look at how `discoveryPlate.js` is fed (grep for where it
  is imported and which event drives it).

## Files you may edit
- `src/data/lineProgression.js` (add `LINE_CLASS_NAMES` only; do not change thresholds)
- `src/ui/discoveryPlate.js` and its CSS file if it has one (grep `styles/` for its class names)
- one new file `src/ui/lineClassMoment.js` (the subscriber that turns the event into the plate)
- the single place that wires UI modules up (find where `discoveryPlate` is created/initialised);
  add one line to create yours. If that file has foreign changes (`git diff` non-empty), stop and
  report it as Blocked.
- `src/render/lineVisualProfile.js` / `src/render/lineHardware.js` only if step 2 needs it
- one new test `test/line-class-moment.test.mjs`

Do **not** edit `src/ui/hud.js` (another agent has uncommitted work there).

## Checks
1. `node --test test/line-class-moment.test.mjs` — your test must: build the subscriber with a fake
   bus and a fake plate, emit `line:classChanged` with `classIndex: 3`, and assert the plate got
   exactly the three lines above. Also assert all 8 rows of `LINE_CLASS_NAMES` exist.
2. `node --test test/line-progression*.test.mjs` (whatever exists matching that pattern) still passes.
3. If `node scripts/ui-bench.mjs --list` shows a shot containing the discovery plate, shoot it with
   `node scripts/ui-bench.mjs --shot=<id>` and open the PNG; report what you saw. If there is no
   such shot, say so in the receipt.

## Done when
Moving enough tonnage to cross a threshold puts the plate on screen with the right text, the cable
changes, and the checks pass. Commit message: `fleet(G19-01): the rope's class-up is an event on screen`.
