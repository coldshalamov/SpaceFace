<!-- LIFETIME: UNTIL ALL TEN ARE DONE OR RETIRED -->
# Ten centerpieces

The unification pass ([`UNIFICATION_LEDGER.md`](UNIFICATION_LEDGER.md)) made the interface
*consistent*. Consistent is not the ask. The ask is **gratuitously sleek** — an interface a player
would believe came from a studio.

Owner direction, 2026-09-22: find 5–10 centerpiece techniques, build them, and where one is a job
in itself, write the plan and hand it on. **Nothing cheap, nothing from the 90s, nothing
low-resolution.** No raster grain. No scratch overlays. No smudge PNGs blown up until the pixels
show. If a surface has texture it is *computed*, at the device's own resolution, every frame it
needs to be.

Runtime: Electron 43 → Chromium 136, and the browser route is Chromium-class. Everything below is
native platform, no new dependency. Intake §0 forbids a motion library on sim-tied motion
([`../../docs/OPEN_SOURCE_INTAKE.md`](../../docs/OPEN_SOURCE_INTAKE.md)); none of this needs one.

---

## The bar for a centerpiece

1. **Resolution-independent.** It is computed or vector. It is as sharp on a 4K panel as on a
   laptop. A raster texture stretched over a panel is the thing we are replacing.
2. **It is a material or a behaviour, not a decoration.** It answers to light, state or input.
3. **One place.** It lands in `src/ui/deckplate/`, so every screen gets it at once.
4. **It degrades.** Reduced motion, forced colours, and an old engine each get something correct.
5. **It costs nothing per frame it is not moving.** Compositor-only: transform, opacity, and
   properties the browser can animate off the main thread.

---

## The ten

| # | Centerpiece | Technique | Status |
|---|---|---|---|
| C1 | **Machined metal, computed** | CSS Houdini Paint Worklet | |
| C2 | **A key light you can move** | `@property` angle/number + animated gradients | |
| C3 | **Screens that morph, not cut** | View Transitions API | |
| C4 | **Type that thickens when you pick it** | Variable-font `wght`/`wdth` axes | |
| C5 | **Rows that resolve as they arrive** | `animation-timeline: view()` | |
| C6 | **Filament, not fade** | `@property` lamp current driving colour temperature | |
| C7 | **Numbers that roll** | Per-digit odometer on tabular numerals | |
| C8 | **Depth under the pointer** | Layer parallax, transform-only | |
| C9 | **A WebGL material pass** | Shared shader surface under the DOM | PLAN ONLY |
| C10 | **The interface inside the grade** | UI through the renderer's post chain | PLAN ONLY |

---

### C1 — Machined metal, computed

**The problem.** `--dp-plate-img` is three stacked CSS gradients. It reads as a smooth ramp, which
is why a plate looks like a rectangle rather than metal. The alternative the tree reached for was
`assets/ui/deckplate/tex/brushed.png` — a raster, which at 4K is a blurry smear and at 1× is a
repeating tile you can see.

**The technique.** A Houdini paint worklet (`CSS.paintWorklet`) draws the plate face at the
device's own resolution, every time it is painted. Anisotropic brushed grain along one axis, a
micro-bevel that follows the key light, and a very fine machining pattern — all procedural, all
seeded per element so two plates are not identical. `@property`-typed inputs make the grain
direction, density and lit-edge angle animatable.

**Acceptance.** No raster texture in the plate recipe. Zoom the bench to 200% and the grain is
finer, not bigger. `paint(dp-plate)` falls back to the current gradient recipe where the worklet is
unavailable (`@supports (background: paint(x))`).

### C2 — A key light you can move

**The problem.** Deckplate's thesis is one warm key from the top-left. Today that is a frozen
gradient. Light that never moves is a picture of light.

**The technique.** `@property --dp-key-angle { syntax: '<angle>' }` and `--dp-key-power
{ syntax: '<number>' }`. Because they are typed, the browser can interpolate them, so every
gradient built on them becomes animatable. A plate gains a specular band that rakes across it when
it takes focus. A screen can shift its key when the sector's temperature changes.

**Acceptance.** Focus a menu item: a highlight travels across the plate, once, in
`--dp-d-settle`. It is a compositor animation. Under reduced motion the light lands rather than
travels.

### C3 — Screens that morph, not cut

**The problem.** Every screen change is a hard swap. Console interfaces morph: the thing you
pressed becomes the thing you are looking at.

**The technique.** `document.startViewTransition()` in `screenManager`, with
`view-transition-name` on the nameplate, the standing column and the foot. Title → New Game keeps
the wordmark and slides the column; a station tab change cross-fades the workspace while the rail
holds still. Native, no library, and it is a no-op where unsupported.

**Acceptance.** Recording the title → new-game change shows the mark holding position while the
column changes under it. `motionReduce` takes the instant path.

### C4 — Type that thickens when you pick it

**The problem.** A selected menu item brightens. That is the web's answer. A crafted interface
changes the *letterform*.

**The technique.** Archivo is a variable font with `wght` 100–900 and **`wdth` 62–125**, and both
axes are already loaded. Transitioning `font-variation-settings` over `--dp-d-cut` makes a verb
widen and thicken as it takes focus, and an etched legend tighten as its instrument goes live.
Resolution-independent by definition, and it costs one font-variation interpolation.

**Acceptance.** Hover a menu item: the word gains weight and width, it does not jump. Etched
legends on a live instrument sit at a different width from idle ones.

### C5 — Rows that resolve as they arrive

**The problem.** A 47-row market list appears all at once, fully formed. Long lists in shipped
games resolve as they enter the viewport.

**The technique.** `animation-timeline: view()` with `animation-range: entry`. The row's opacity
and a 6px rise are driven by its own position in the scroller — natively, on the compositor, with
no scroll listener and no IntersectionObserver.

**Acceptance.** Scrolling the market is smooth and rows materialise. No JS runs on scroll.
`prefers-reduced-motion` removes the timeline binding entirely.

### C6 — Filament, not fade

**The problem.** A lamp turning on is an opacity transition from 0.5 to 1. A filament does not do
that: it warms through colour before it reaches brightness.

**The technique.** `@property --dp-lamp-current { syntax: '<number>' }` from 0 to 1, driving a
`color-mix` across `--dp-lamp-dim → --dp-lamp → --dp-lamp-hot` *and* the bloom radius *and* a
faint warm cast on the plate beneath. One typed number, three coupled effects, interpolated by the
compositor.

**Acceptance.** A lamp coming up passes through amber before white. Turning off cools rather than
vanishes. Reduced motion: it cuts to the end state.

### C7 — Numbers that roll

**The problem.** Credits change from 18,400 to 17,608 by replacing the string.

**The technique.** Per-digit column translate on tabular numerals, staggered right-to-left, so the
digits that changed roll and the ones that did not sit still. `--dp-d-settle`, `--dp-ease-settle`.
A `dp-odometer` component in the hardware layer.

**Acceptance.** Buying something rolls the credits figure. The comma does not move. Reduced motion
sets the value.

### C8 — Depth under the pointer

**The problem.** The UI is a flat plane pasted on a 3D scene. There is no parallax between them, so
the scene reads as wallpaper.

**The technique.** One pointer listener on the screen root writes two custom properties; the
backdrop, the standing column and the foreground plates translate by different small amounts —
transform only, at most 8px, clamped, eased. The scene sits *behind* the interface instead of
under it.

**Acceptance.** Moving the pointer across the title screen separates the wordmark from the ship.
It is a compositor transform. `motionReduce` disables the listener, not just the animation.

---

## The two that are their own jobs

### C9 — A WebGL material pass under the DOM  (PLAN ONLY)

**Why it is not a session.** It is a second render surface with its own resize, residency,
colour-management and perf budget, and it has to compose correctly with a DOM that sits above it.

**The shape.** A single `<canvas>` pinned behind `#screens`, sharing the game's renderer (never a
second `WebGLRenderer` — see `src/ui/ship/shipScreen.js` for the shared-stage precedent). Screens
declare rectangles they want materialised; the pass renders anisotropic metal with a real BRDF, a
Fresnel edge on glass, and a cheap depth-of-field on the backdrop behind each panel. The DOM keeps
every control, every hit target and the whole accessibility tree; the canvas only paints surfaces.

**Steps.** (1) Prove one panel: a rect registry, one shader, one composite, measured against
`npm run check:ui:perf`. (2) Anisotropy + bevel matching `--dp-*` so the two layers agree.
(3) Backdrop DOF keyed to the panel rects. (4) Reduced-quality path and the `@supports` fallback to
C1's worklet. (5) Retire the gradient recipe only once the canvas is the default and measured.

**Risks.** A second canvas was already removed from this tree once for cost
(`perf-externalscheduling-was-a-second-canvas`). Read that before starting. Do not begin until C1
ships, because C1 is the fallback this depends on.

### C10 — The interface inside the grade  (PLAN ONLY)

**Why it is not a session.** It changes the composite order in `ARCHITECTURE.md` §1.2 and touches
the bloom pipeline.

**The shape.** Today the DOM sits on top of the finished frame, so the UI is outside the game's
colour grade and its lamps do not bloom. Route the interface into the renderer's post chain — the
HUD painted to a texture, composited before bloom and CAS — so a lamp actually blooms into the
scene and the whole picture shares one grade.

**Steps.** (1) Decide what stays outside: text must not be graded, or it loses contrast and fails
WCAG. The likely split is *lamps and plates inside, type outside*. (2) A HUD-to-texture path for
the lamp layer only. (3) Composite before `src/render/bloom.js`. (4) Prove contrast is unchanged
with `check:wcag-contrast` and legibility on the three brightest sector plates.

**Risks.** Grading text is how an interface fails accessibility. If the split cannot be made
cleanly, this centerpiece is wrong and should be retired rather than forced.

---

## What is explicitly not on this list

- **Raster overlays** — grain, scratches, smudge, scanlines. They are the 90s trick, and they are
  the first thing that breaks at 4K. `assets/ui/deckplate/tex/` should end this programme unused.
- **Chromatic aberration, heavy blur, neon glow.** The 2024 vibe-coded tells.
- **A motion library.** Intake §0, and none of the above needs one.
- **A second renderer or a UI framework.** ARCHITECTURE §1.2.
