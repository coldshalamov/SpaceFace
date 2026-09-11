# P20 — The UI stage (PQ-194.01, L-A) — gate zero

<!-- APPEND ONLY. Do not rewrite an entry above this line. -->

---

## 2026-09-10 · PQ-194.01 · claude-opus-5 (L-A)

**DONE** PQ-194.01 — the title, the docked station and the Crucible door now stand on a lit
three-dimensional world drawn by the game's own renderer, on one GPU context, at all three widths.

**WHAT I FOUND** Nothing in the game had a world behind it because the presentation frame simply
returned early whenever a screen was open, and the only 3D that ever appeared under a menu came from
a second WebGL context that this machine's Intel GPU refuses while docked — so the title shipped a
rotated PNG of a scout hull and the other two shipped nothing at all.

**WHAT I CHANGED** The frozen presentation frame now draws a small authored scene of its own with
the renderer the game already has (the simulation stays frozen — only the picture moves), a screen
declares which scene it stands on, and an authored still holds the frame until that scene is lit.

**WHAT YOU WILL FEEL** The title is a working hull seated on rock under a low sun, with a mast, a
worklight and cargo on the claim behind it and the sky going cold above the warm band — the picked
"Field at dusk" shot, running. Docking arrives into a lit bay with the gantry and your own hull in
it, and the Crucible door looks out over a foundry running hot instead of a flat panel.

### THE NUMBERS

| bar | before | after | target | seed |
|---|---|---|---|---|
| lit world behind `title` (`--world`, 1280/1920/2560) | 0 of 3 widths | **3 of 3** | 3 of 3 | UI matrix seed 424242, default mode |
| lit world behind `station-dock` | 0 of 3 | **3 of 3** | 3 of 3 | same |
| lit world behind `crucible-door` | 0 of 3 | **3 of 3** | 3 of 3 | same |
| WebGL contexts on the default route with a menu open | 2 (refused on Intel) | **1** | 1 | live boot, ANGLE (Intel, Intel(R) Graphics 0x00007D45, D3D11) |
| stage request → lit, title | n/a | **2.3 s – 3.3 s** to prepared | under the 15 s capture window | live boot, headed |
| first stage frame after the scene is revealed | 12.0 s stall (first build) | **0.27 s** | no visible stall | live boot, headed |
| stage cost in flight | n/a | **0 draws, 0 scene** (released on the first flight frame) | unchanged | runtime witness, below |
| `--world` frames that reported `data-k-ready="1"` | 0 of 9 | **9 of 9** | 9 of 9 | three boots, one per width |

Admission, measured on the live route: 7 props + the authored Kestrel for the title
(39 programs, 135 textures), 6 props + hull for the arena (51–54 programs, 183 textures), 3 props +
the player's own hull for the berth (111–112 programs, 122 textures).

Three separate causes of the first-frame stall were found and fixed, each measured:

1. Compiling a detached leaf (`compileAsync(leaf, camera, scene)`) builds the program against the
   lights that leaf can see — none — so every program relinked inside the first real draw. The
   scene is now added to the graph invisible and compiled as a scene. **12.0 s → 4.3 s.**
2. A program is keyed on the renderer's shadow flag, which was off at compile and on at draw.
   Matching it at compile time: **4.3 s → 4.1 s**, and it stops the relink being silent.
3. The shadow map builds its own depth material per caster material, and those are the one thing
   `compileAsync` cannot reach. One shared `customDepthMaterial` plus a single warm-up pass inside
   the load window: **4.1 s → 0.27 s.**

### FILES

- `src/render/uiStage.js` (new) — the stage: three authored scenes, the sky, the light rig, the
  admission and the one borrowed draw.
- `src/core/presentationFreeze.js` — comment, plus `canvasIsProtectedDuringFreeze()`. The foreign
  `sectorShellAdmission` hunk is preserved and is now also what stops the stage drawing mid-cook.
- `src/core/renderUpdatePhase.js` — the stage draw inside the frozen branch; release on the first
  flight frame.
- `src/ui/screenManager.js` — the only writer of `state.ui.stageRequest`, the plate insertion, and
  `data-k-ready` for a staged screen.
- `src/ui/views/menuFrames.js` — the title's PNG ship replaced by the authored plate.
- `src/ui/screens/crucible.js` — the door declares `arena-foundry`; its own `kReady='1'` removed.
- `src/ui/station/stationApp.js` — `createBerth` moved off the second WebGL context.
- `styles/kit.css` — plate, stage and scrim rules.
- `design/frontend/direction/receipts/P20-REPORT.md` — this receipt.

Outside the leaf's write set, each for one reason that gate zero cannot be honest without:

- `src/ui/screens/mainMenu.js` — it declares the title's stage, and it held the packet's **named
  fake**: `data-k-ready` was raised by a background image's `load` event, which is why every title
  capture ever taken was a photograph of a photograph. Six lines.
- `src/ui/station/stationScreen.js` — one line: the station def declares `berth`. The def lives
  here, not in `stationApp.js`.
- `assets/ui/backdrops/backdrop-title.jpg`, `assets/ui/backdrops/backdrop-crucible-door.jpg` (new) —
  the authored fallback stills, re-encoded from S1's committed Blender plates (77 KB and 153 KB).
- `design/program/NOW.md` — the mutation row.

No file on the run's forbidden list was touched. `src/render/renderer.js` is named in the P20 packet
as "the hook only"; it is forbidden this run, and the hook was not needed — `runRenderUpdatePhase`
already receives the render system, and `render.renderer` is the context.

### CHECKS

| command | result |
|---|---|
| `node scripts/capture-ui-matrix.mjs --world --headed --only=title,station-dock,crucible-door --viewport=1920 --mode=default --out=.devshots/frontend/P20` | **PASS** — 3/3 frames, "every kit screen reported data-k-ready=1" |
| same at `--viewport=1280` | **PASS** — 3/3 |
| same at `--viewport=2560` | **PASS** — 3/3 |
| all nine frames opened and looked at | **PASS** — lit world in every one |
| `node scripts/capture-ui-matrix.mjs --headed --only=title,crucible-door` (no `--world`) | **PASS** — both show the authored plate, neither is black |
| `node --test test/secondary-preview-webgl.test.mjs test/first-flight-gpu-hold.test.mjs` | **PASS** — 11/11 |
| `node scripts/check-ui-screen-imports.mjs` | **PASS** — 52 ok, 0 fail |
| `npm run probe:runtime-witness` | see the row added below |
| `npm run check:baseline` | see the row added below |

Entry baseline was run before the first mutation, but only its tail survived the capture, so the
reds it is known to have carried are `sim` and `sim-v3` (the 47-A authoritative-hash drift named in
`_COMMON.md`). The exit run is the complete list, and every red on it is accounted for below.

### HOW THE CAPTURE IS KNOWN NOT TO BE THE PLATE

The named fake is "a static PNG of a ship with `data-k-ready=1`", and the fallback plate is exactly
that kind of image, so the flag alone cannot settle it. Three independent things do:

1. `window.__SF_UI_STAGE__()` reports the stage's own state. Read on the live route at each surface:
   `{scene:'title-field', status:'live', hullDrawn:true, props:7/7, contexts:1}`,
   `{scene:'arena-foundry', status:'live', props:6/6}`,
   `{scene:'berth', status:'live', props:3/3}` — with `data-k-stage="live"` on the screen root.
2. The plate and the live scene are visibly different pictures of the same place. Compare the
   no-`--world` title frame with the `--world` one: different rock silhouette, different hull pose,
   a mast at frame left in the plate and a worklight tower at frame right in the stage.
3. The camera drifts. Two frames of the same surface taken a beat apart are not identical.

A status of `plate` or `unavailable` also raises `data-k-ready`, deliberately — when the stage
cannot be seen, the authored still IS the final picture and the screen is ready to photograph. It
is recorded in the report so a reviewer can always tell the two apart.

### UNPROVEN

- **Real Intel hardware, but one machine.** The boot log for every capture reads
  `ANGLE (Intel, Intel(R) Graphics (0x00007D45), D3D11)`, so this ran on the integrated GPU the
  second-context preview refuses. Other drivers are untested.
- **Non-default capture modes.** `reduced-motion`, `forced-colors` and `pseudo-localized` were not
  shot; the leaf's done-when names the default mode. Reduced motion is honoured in code (the drift
  clock stops) but is unphotographed.
- **P16's sets.** `title-field`, `berth` and `arena-foundry` are composed from committed authored
  place parts and the authored whole-ship hulls, as the packet's "prove the machinery first"
  clause asks. P16's rendered sets swap into the same three scene ids.
- **The Shipworks tab** still opens its own preview mount over the berth; `P35` retires it.
- **Pause / chart / ship in flight** keep the held flight frame (`held-world` draws nothing), which
  is the correct picture and was not changed.
- **The station's panels** are opaque by their own stylesheets, so the berth is seen around them
  rather than through them. Opening them up is `P33`/`P34`'s surface work, not gate zero's.
- The **settings-hop rebuild cost** (title → settings → title re-requests the scene) is not measured.

### CLOSING EVIDENCE (same session, after the captures)

**`npm run probe:runtime-witness` — flight frame cost.** `Verdict: presenting`, `mode: flight`,
`hitch samples: 0` in the sample tail, `canvas hashes: 3 unique 3` (the picture is moving).
Presentation p95 11.4 ms / render p95 9.2 ms / ui p95 3.1 ms on
`ANGLE (Intel, Intel(R) Graphics (0x00007D45), D3D11)`. GPU geometries held flat at **228** and GPU
textures at **139** across the whole flight run — the stage's set is not resident in flight, which
is the direct reading of the release. A live read during flight in the same boot returned
`{resident:false, scene:null, lastScene:'title-field', frames:0}` with `renderer.info.render.calls`
0 at that instant, so the stage draws nothing once a run starts. The `glGetProgramiv` console
warnings in the report are pre-existing: they appear in `.devshots/runtime-witness/
report-claude-baseline-prior.md` as well.

**`npm run check:baseline` — exit.** Red: `pq020-ceres-topology`, `save-schema`, `sim`, `sim-v3`.
`sim`/`sim-v3` (47-A authoritative hash) and `pq020-ceres-topology` are named in `_COMMON.md` as
pre-existing. `save-schema` drifts entirely inside `$.player.*` and is generated from
`src/core/gameState.js` + `src/save/`, all foreign dirty work this leaf never touched; nothing in
the generated schema mentions the stage.

**One red was mine, and is fixed.** `check:vfx-techniques` failed with
`unlisted soft-card constructions: src/render/uiStage.js` — the stage's sky carries a point-sprite
star field, and that check is a completeness ratchet, not a taste ban. The star field is exactly the
`bg-l3-stars` exception the visual standard already allows (tiny, bright, at sky depth, never in the
flight path), so `src/render/uiStage.js` was added to that existing entry in
`docs/visual-assets/SOFT_CARD_INVENTORY.json` — a two-line change, no new exception id.
`node scripts/check-vfx-techniques.mjs` now reads `PASS  check:vfx-techniques  10 entries, 10 files`.

**Also run:** `check:type-floor` PASS · `check:ui-effects` PASS · `check:command-deck-ui` PASS ·
`check:wcag-contrast` PASS · `check:colour-tokens` FAIL on `styles/ui.css:104-105` only — another
lane's uncommitted shield-blowout keyframes, no `styles/kit.css` line is flagged.

**Files, addendum:** `docs/visual-assets/SOFT_CARD_INVENTORY.json` (two lines, the star-sky
exception), and the evidence under `.devshots/frontend/P20/` (nine `--world` frames).

### CORRECTION AND FINAL CHECKS (same session, after review)

**A defect found in review, fixed.** `createBerth.show()` re-requests the `berth` scene with the
player's `hullDefId`, but `presentUiStage` only rebuilt on a change of SCENE id — so a stage that
had already built kept whatever hull it was first asked for, and the berth would have shown the
starter Kestrel for the rest of the session no matter which ship the player flew. The stage now
records the hull file it was built for and releases on a mismatch as well as on a scene swap, and
`__SF_UI_STAGE__()` reports `hullFile` so the answer is readable rather than assumed. The nine
capture frames are unaffected: the first-session route flies the Kestrel, so kestrel→kestrel takes
the no-rebuild path. A dock probe re-run after the fix returns
`{scene:'berth', hullFile:'wholeships/kestrel.glb', status:'live', props:3/3, contexts:1}`.

Correcting the FILES note above: the ScreenManager owns the **lifecycle** of
`state.ui.stageRequest` — which screen has a stage and when it is cleared. A staged screen may
re-request its own scene with a different hull, which the berth does; nothing else writes it.

**The rest of the PQ-194 check list.** `npm run check:responsive` **PASS**
("safe-box anchors and stage clamp contract verified") · `npm run check:ui-a11y` **PASS**.

`npm run check:ui:perf` and `npm run check:bundle` were **not run and are a named gap, not a pass**.
Adding any file under `src/ui` makes the UI budget baseline stale by construction, so those two
cannot go green from inside this leaf however they are run; the baseline re-shoot is `P42`'s sweep.
The stage itself is not UI-thread work — it is one draw inside the presentation frame, on screens
where the simulation is stopped — and the runtime witness above is the measurement that does apply.

**Addendum to UNPROVEN:** the hull-swap rebuild is code-verified and probe-verified for the
identity case; a **non-starter hull standing in the berth is unphotographed**, because reaching one
needs a refit on the live route (`P35`).

---

## 2026-09-11 · controller recapture (01a08d61)

Independent `capture-ui-matrix --world --headed --only=title,station-dock,crucible-door` at
1280 / 1920 / 2560 into `.devshots/frontend/P20-ctrl/`. **9 of 9 frames produced.** Every frame
was opened and looked at. The title is a working hull on rock under dusk with a worklight and cargo
— not the fallback plate (the plate is a different camera and a brighter nose light). Dock shows the
berth hull and gantry around the panels. The Crucible door looks out over a foundry with trusses,
a radiator bank and a hull in the corner. Camera drift is visible between the worker stills and
this recapture.

`data-k-ready` missed on three frames (title 1920, title 2560, crucible-door 2560). That is a
capture-timing defect, not the named fake: those photographs still show a lit three-dimensional
world, not a static PNG. Station-dock reported ready at all three widths.

Controller node checks, re-run after the recapture: `secondary-preview-webgl` +
`first-flight-gpu-hold` **11/11**, `check:vfx-techniques` **PASS**, `check:ui-screen-imports`
**52 ok / 0 fail**. `package.json` `three.quarks` hunk is foreign and is not in this commit.

**Controller disposition: accept-with-notes.** Gate zero holds. The ready-flag race on ultrawide
title/crucible is residual capture hygiene, not a black canvas and not a plate.
