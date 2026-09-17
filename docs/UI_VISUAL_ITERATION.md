<!-- LIFETIME: STABLE -->
# UI visual iteration — the look-first loop

How an agent improves a player-facing screen **without mangling it**: photograph it, judge the
pixels, change the owner file or its kit styling, photograph it again, and have independent eyes
check the result. Words about a screen are not evidence of how it looks; the fastest way to look is
the bench (`tools/ui-bench.html`, seconds, no boot). A capture is not a release gate — root
`AGENTS.md` §13 makes the still optional, in-session and for a purely visual claim — so use the loop
to see the work, not to satisfy a ritual.

Companion tools: `node scripts/ui-stills.mjs` (fast stills, this loop's instrument),
`node scripts/check-ui-layout.mjs` (geometric forensics: overlap, clip, offscreen, buried hover),
`node scripts/capture-ui-matrix.mjs` (the committed reference matrix — not needed for the loop).
Direction that outranks this document: `design/frontend/direction/FIELD_HARDWARE_PROGRAM.md` and
the approved frames under `design/frontend/direction/approved/`.

## 0. Look before you touch

```
node scripts/ui-bench.mjs --shot=pause      # any 2D screen over a still, in seconds (see below)
node scripts/ui-look.mjs --only=pause       # live route: clicks EVERY control, reports what each did
npm run ui:stills                           # menus + HUD, ~2.5 min, .devshots/ui-stills/
npm run ui:stills -- --only=title,pause      # exact surfaces
npm run ui:stills -- --set=station           # one group: menus,hud,instruments,station,crucible,works,deaths
npm run ui:stills -- --world --headed        # over the live 3D picture (HUD, world-lit screens)
npm run ui:stills -- --list                  # ids, groups, routes
```

Three instruments, in the order a pass uses them:

1. **The bench** (`tools/ui-bench.html`, served by `node scripts/ui-bench.mjs`): mounts the real
   screen module with a real `GameState` over a frozen still — seconds per look, and it logs what
   every control asked for. This is where composition, type, spacing, hover/focus and "does this
   verb do anything" get judged. Put any capture behind it with `&bg=<path>`; hide its furniture
   with `&chrome=0`. Synthetic state: never evidence about the live route.
2. **`ui:look`**: the live register. Opens the screen on the dev route (`?dev=screen:<id>`) and
   clicks every control, printing what each one actually did. A verb that does nothing, throws, or
   lands somewhere wrong is the first finding of a pass — before taste.
3. **`ui:stills`**: the honest picture, including `--world` for screens the world lights.

### Which instrument sees what (verified 2026-09-16)

| Surface family | Bench (`ui-bench`) | `ui-look` (live route) | `ui:stills` |
|---|---|---|---|
| Shell 2D: `mainMenu`, `newGame`, `pause`, `settings`, `saveLoad`, `help`, `codex`, `missionLog`, `credits`, `achievements`, `gameOver`, `techTree` | mounts, seconds | clicks every verb | yes |
| Instruments/works: `range`, `footprint`, `automation`, `base` | mounts | yes | yes |
| Crucible run: `crucible`, `crucibleDraft`, `crucibleRefit`, `crucibleResults` | mounts on synthetic state | needs a run first | yes (fixture) |
| Overlays: `replay`, `clips`, `sandbox`, photo mode | mounts (photo needs a live canvas) | yes | yes |
| HUD over the world: `flight`, `power-rail`, `comms-radial`, `wingman-radial` | not mountable (no live picture) | key entries only | `--world --headed` |
| Station: `station-dock` + every station tab | not mountable (needs a live berth) | yes (dock fixture) | yes |
| Maps: `chart`, `chart-galaxy` | not mountable (needs live geography) | yes | yes |
| `ship` | not mountable (needs a hull) | yes | yes |

The bench says so itself when asked for a live-only surface, and points at the command that can see
it. If a screen cannot be judged by any of the three instruments, that is a scaffolding finding —
report it, do not guess.

Read `contact-sheet.png` first for the whole picture, then the full-size PNGs for detail. Open the
still before deciding anything, and re-open the *after* still before claiming a fix.

## 1. Judge a still against four things

1. **Overlap and clipping** — text under a plate edge, a row cut by its panel, a label truncated
   mid-word, a control under the element it reveals. Those are defects, not taste.
2. **The direction's two tests** (`packets/_COMMON/02_ART_DIRECTION.md`): does it have the material
   and light truth of Asteroid Works; does it read as equipment a worker uses. A screen built from
   CSS borders and flat text fails both.
3. **Reachability floors** — every verb still visible and clickable, 12 px type floor, forced-colours
   and reduced-motion intact, focus visible. Never trade these for looks.
4. **Layout skeleton** — column, indent, hierarchy and spacing match the screen's register
   (POSTER / BENCH / EDGE). A screen that breaks its own grid is the "scrambled" report.

## 2. Change the owner, not the symptom

- One screen per pass. Find the owner file in `scripts/ui-grammar-surfaces.mjs` and edit there, or in
  the kit layer (`styles/kit.css`, `src/ui/kit/`). Never restyle by hand where the kit already owns
  the element (`src/ui/AGENTS.md`).
- No screen is *redesigned* before its frame is approved; a fix inside the current frame is a fix.
  If the change needs art direction, say so and stop at the frame boundary.
- Preserve accessibility and performance hooks. If a fix moves focus order, contrast, or the
  measured layout the checks own, run those checks.

## 3. Re-photograph the same surfaces

```
npm run ui:stills -- --only=<changed ids>
```

Compare against the previous still, not against memory. `--world --headed` shoots the same screens
over the live 3D picture when the world is part of the judgment.

## 4. Independent review — once per pass, at the end

Spawn **three reviewers in parallel** (Task tool) when the pass is finished, not after every edit.
Iterate alone until the after-still looks right and `ui:look` reports nothing broken; then get eyes
that have not seen the screen. Give them only: the still paths, the surface ids, the direction file,
and the two tests. They must be memoryless — never tell them what was changed or what to see.
(If the pass is a one-line fix inside an already-reviewed frame, the author's own before/after
comparison is the review; say so in the receipt instead of manufacturing ceremony.)

| Reviewer | Lane | Must return |
|---|---|---|
| A | Layout forensics | per-surface overlap/clip/offscreen rows with the two elements involved |
| B | Direction and craft | does the screen read as field hardware; name the three cheapest-looking elements |
| C | Legibility and reachability | type floor, contrast, focus/hover states, every verb reachable |

Rules for the reviewers: read the actual PNGs; no code changes; a finding must name the surface, the
element, and what is wrong. A reviewer who cannot open an image says so instead of guessing.

## 5. Consolidate, fix, verify

Keep findings that are real and inside the current frame; discard taste-only notes and anything the
approved frame contradicts. Fix, re-photograph, then run **one** verification of the geometric
claims:

```
npm run check:ui:layout -- --only=<changed ids>
node scripts/check-ui-layout.mjs --pixels --only=<changed ids>   # text vs the DRAWN ground
npm run check:baseline        # if the change could touch shared UI contracts
```

The `--pixels` pass screenshots the surface and measures each text element's worst-tile WCAG
contrast against the pixels actually drawn behind it (the gate writes the frame it judged to
`.devshots/ui-layout/<id>.pixels.png`). Geometry cannot see light words over a lit hull, and a DOM
contrast check cannot either — the background is the 3D picture, not a CSS colour. **Ground
caveat:** `check:ui:layout` opens surfaces on the neutral ground, so a screen that sits over the
live world must also be judged from `npm run ui:stills -- --world --headed --only=<ids>`; the
neutral-ground matrix is blind to world-contrast defects by construction.

The pass ends when the after-still is clean against §1 and the reviewers' real findings are closed
or explicitly handed to the right packet. Commit per pass by pathspec.

## 6. Stop conditions

Stop the loop when a still raises a **product or art-direction decision** (what should this screen
look like), when a fix needs a frame that does not exist, or when the next finding is a known open
packet (`PQ-162` station, `PQ-168` chart, `PQ-181` meta shell, `PQ-182` Crucible, `PQ-184` UI perf,
`PQ-194` the kit program). Report the exact blocker in one sentence and leave the screen as it was.
