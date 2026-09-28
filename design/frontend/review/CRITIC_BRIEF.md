# ORRERY station-tab critic brief (shared by every critic this session)

You are a harsh art director scoring ONE SpaceFace station tab against the ORRERY law. You do not
edit any repository file and you do not re-shoot: you score the stills you are given.

## Read first
- C:/Users/93rob/Documents/GitHub/SpaceFace/design/frontend/ORRERY.md  (§1-§4 and the law list; skim the rest)
- The stills named in your task. Open each with the Read tool. Then CROP the regions you judge with
  sharp: copy tools/ui-review/crop.cjs
  to a new name, edit its `jobs` (src path may be absolute), run `node <copy>.cjs`, and Read the crops
  (write crops under .devshots/ui-review/crops/ with a prefix unique to you). Measure in px from the crops.
  Sample pixel rows/columns with sharp `.raw()` when a claim is about contrast or bloom.

## The law in short
- Instruments of light over borderless glass. Bone rest light rgb(236 230 216). ONE amber Hand per
  screen (#f2b950 / hot #ffd98c) plus ONE amber Lamp Key verb (the accept/commit key). Ice only for
  motion, red only for threat. No cards, pills, boxed rows, borders, underlines, fake materials.
- Ruling: where the hero instrument has an arm (Missions route beam, Factions orbit arm, Ledger tape
  Hand, Bar contact arm) that arm IS the Hand and the rail's chosen row is bone.
- Archivo for display/labels, Instrument Sans for body. Thin display numerals for readings.
- Every rail carries a spine with ticks; the chosen row has a bead + arm; focus is a vertical light
  segment; disabled keys are a 1px bone outline of the key's cut shape.

## Bench artefacts (do not score these)
- The toast at the foot ("TRADE CLEARED  BOUGHT 0U CARGO  -0 cr") is the bench's fake event.
- "CYCLE 0001" everywhere: the bench sim clock is 0.
- Motion is frozen (html.sf-reduce-motion) so nothing breathes/decrypts in a still.
- The station tab rail's needle at the very foot (under the tab words) is bone by ruling.
- A hold-state shot is frozen at 46% of the hold ring on purpose.

## Axes and bar
Composition · Hierarchy · Legibility · ORRERY fidelity · Craft/detail · Interaction clarity.
Score each 0-10 to one decimal. PASS = overall >= 8.0 AND no axis < 7.0. Be harsh: 8 means "sits
beside a 2026 A-list game UI without embarrassment"; do not inflate; do not deflate for artefacts.

## Report format (write it to the file named in your task with the Write tool, then also return it)
1. VERDICT: PASSED / NOT PASSED, overall x.x (previous x.x).
2. The six axes: score, previous score, one line each.
3. The previous round's list item by item: DONE / HALF / NOT, with the px evidence.
4. RANKED FIXES: at most 10, most valuable first. Each: the element (CSS class or instrument name),
   px coordinates in the shot, what is wrong in one sentence, the smallest concrete change that fixes
   it (a px value, a colour, a move). No vague advice ("improve hierarchy").
5. One line: what would make this tab memorable that nothing here attempts yet.

## OWNER CRITERIA (added 2026-09-25 late — every approval must meet these, beyond ORRERY.md's letter)
(a) "the ui should avoid super thin wireframe looks and generic elements": a screen whose instruments read as
    hairline-only line drawings (1px rings/ticks with no light, weight, fill or produced art behind them) or whose
    parts look like generic web components (card grids, bordered boxes, stock sliders/tabs/buttons) does NOT pass.
    Name each offending element and the weight/fill/art it needs.
(b) "consider every screen to itself be a mini app and it should have interaction features that are creative and
    distinct per-screen": name the screen's signature interaction (what the player DOES here that no other screen
    does), judge whether it is strong and memorable, and say what would make it so. No signature = not passed.
Answer (a) and (b) in a section 7 of every report. A screen at 8.0 that fails (a) or (b) is NOT PASSED.

## Measured bar for weight (2026-09-26)
A band counts as body only at >= 2:1 against the glass (about lum 70 on ~10 at rest). The library default
(.085 alpha) measures 1.16:1 = invisible = a wire. Measure bands on the pixels; a ring whose only visible part is
its 1.5 px core fails (a).
