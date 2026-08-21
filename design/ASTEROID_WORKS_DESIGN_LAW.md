<!-- LIFETIME: DURABLE -->
# Asteroid Works — Design Law

**Status:** binding design authority for the mining minigame (screen id `drill`), written from
the 2026-08-20 owner design session. This file is the **positive target**: it says what to
build, in enough words that an agent with no vision capability can still build the right
thing. The campaign law with the vanilla-collapse ban stays
[`design/program/ASTEROID_WORKS_PLAYFIELD.md`](./program/ASTEROID_WORKS_PLAYFIELD.md);
execution is [`PQ-130`](./program/roadmap/active/PQ-130.md). Where this file and any older
asteroid UI doc disagree, **this file wins** (see §13).

**The owner's core instruction, verbatim spirit:** the current HUD is "gray, bleak, and
vibe-coded, harsh fonts, everything about it is lame." The task is to **imagine the UI from
the ground up** — not to polish the existing console. A beautifully executed copy of the
current gunmetal shell is a failure ("a polished turd"). Delete the old visual language
entirely; build the one specified here.

---

## 0. How to use this file

- Building any part of this screen? Read §2 (rulings), §3 (art direction), and the section
  for your leaf. Copy hex values, px values, and ms values literally — they exist so that
  taste is not left to chance.
- **No-vision agents:** every element in §4–§9 has a "what a person sees" sentence. Build to
  that sentence plus the numbers. §11 lists invariants you can assert headlessly (DOM word
  counts, computed styles, projected-geometry checks) so you can verify without eyes.
- Nothing here changes sim laws (production, couriers, claims). The one sim-adjacent change
  this law orders is §2.3 (fog removal). Deeper mechanics (§12 stages 5–7) are future
  packets, not license to edit the sim now.

---

## 1. The game these screens serve (context, one page)

The minigame is the industry layer of SpaceFace's economy: mine and sell → first machines →
networks → drone export. Its design reduces to **four laws**, all fully visible on the board:

1. **Mine it once, or farm it forever.** Drilling a cell pays instantly and destroys it. A
   machine seated against a cell works it slowly, forever. Every valuable cell permanently
   asks: cash now or rate later.
2. **Machines feed through faces.** A machine only works the cells it touches; a hollowed
   cell feeds nothing, ever. Drilling strategy is surface area: expose faces, don't eat the
   seam. Approach a seam from its dead end.
3. **Geology is the tech tree.** Each rock type is an ability: metal seams feed extractors,
   sealed gas pockets tap as generator fuel (nicking one vents it in a damaging blast worth
   nothing), ice runs coolant, dense basalt anchors and heat-sinks heavy machines, deep
   exotics unlock top-tier fabrication.
4. **Tunnels are streets; rock is the radiator.** Power and goods route through bored
   corridors, so early digging is secretly the city plan. Machines shed heat into the solid
   rock they touch; a machine in a hollowed-out hall overheats and throttles.

**Anti-random tests** (any mechanic must pass all four): value is only destroyed by a cut the
player made · every yield is quoted before commitment · permanent consequences preview at
decision time · every passive failure has a named visible cause on the board.

**The money ladder** (for stage 5+ tuning): laser skim < drill runs < farming < refining <
drone export, each rung a strictly higher income slope; endgame ship prices meet the
drone-field curve, not the lucky-streak curve.

---

## 2. Owner rulings (2026-08-20 — settled, do not re-litigate)

1. **Perfect flat grid — in full 3D.** Cells are axis-aligned squares on screen, like a
   chess board: zero yaw, zero pitch, zero isometric read. Camera pans and zooms; it never
   rotates or tilts. (§11.1 makes this assertable.) **This is a camera rule, not a geometry
   rule.** The blocks stay fully 3D — the original beveled relief, thickness, cast shadows,
   real rock material; tunnels are lit cavities you look down into. *2026-08-21 owner
   correction after a build flattened the blocks into tiles: "you literally gutted all the 3d
   and made a cartoon … I never asked for that and it's objectively worse."* A flat tile, a
   flat color fill, a drawn outline, or a neon-glow icon standing in for an object is a
   failure. See §2.7.
2. **The board is ≥ 88% of the glass** in the default drive view. Chrome is the small set of
   objects in §6 and nothing else.
3. **No fog of war.** Every cell's material is visible from the first frame. The strategy
   lives in tunnel geometry, not information hiding. The survey/"unsurveyed strata"
   mechanic is removed from presentation: no anonymous cells, no survey-to-reveal loop.
   (Deep exotics are visible even when your drill can't reach them yet — visible aspiration
   is the upgrade advertisement.) Survey pulse may remain as a cosmetic assay ping or be
   deleted; it gates nothing.
4. **Ground-up UI.** The existing visual language — gunmetal grays, hazard stripes, tracked
   uppercase console type, hairline-bordered bays, left-accent log rows — is deleted, not
   restyled. §3 is the replacement. §10 lists the deletions explicitly.
5. **Word budget:** at most **15 words** of visible text in the default drive view (no
   hover, no drawer open). Information is carried by shape, color, motion, and sound;
   words confirm on demand.
6. **Events happen on the board** (§5), never as a permanently visible text log.
7. **Congruous 3D, never cartoon.** The mine is the flight game's own 3D world cut open.
   Rock cells are lit PBR stone built from the same surface approach as the flight
   asteroids (`src/render/rockSurfaceLibrary.js`), with the original beveled block geometry
   (`makeCellBlockGeos` as of commit 66d3787f or better) — never flat pads. Machines, the
   rover, the derrick and conduits are real objects: authored PBR models where they exist
   (`assets/incubator/everyday_space_kit/.../drill_platform*.glb`,
   `assets/ships/m5_claim_outposts/.../place_claim_outpost_{base,refinery,relay,bastion}.glb`,
   `assets/ships/m5_station_refinery/...`) or procedural meshes built to the flight world's
   quality bar — metal roughness/metalness, beveled edges, real proportions, shadows. No
   emissive rings, bars or halos; emissive only as small plausible lamps with a real light.
   Depth is sold by light: a raking warm key with cast shadows into cavities (key:fill ≈ 5:1,
   not a head-on fill), a cool fill from space, contact darkening in corners. A
   straight-down *perspective* camera with a narrow FOV (~30°) is allowed and encouraged —
   the board plane stays a perfect square grid while cavity walls gain visible depth.
   **The test:** put the still beside a flight still of a ship near an asteroid. If the mine
   looks like a different, cheaper game, the leaf failed.
   **Procedural stand-ins are scaffolding, never acceptance** (owner, 2026-08-21, on the live
   build: "the rover is like this 8-bit NES model inside this 3d world … you're intentionally
   cutting corners"). Every object in the mine is replaced by an authored asset through the
   flight ships' pipeline under `PQ-131`
   ([`ASTEROID_WORKS_ART_CAMPAIGN.md`](./program/ASTEROID_WORKS_ART_CAMPAIGN.md)); until then
   the screen is *implemented*, not accepted.

**Open owner decisions** (recorded defaults; build the default until overruled):

- **D1 — Geometry:** side-section (current: deep = down) vs crust-to-core plan view
  (deep = toward the asteroid's center; recommended long-term). **Interim: side-section.**
  Everything in this law except map generation and the entry camera survives a later swap.
- **D2 — Permanence:** a butchered seam/vented pocket stays butchered forever.
  **Interim: yes, permanent.**
- **D3 — Counterweight:** whether late-game compounding income attracts visible danger
  (defense/quiet-running answers) or stays a pure builder's game. **Interim: deferred to
  the economy stage; build nothing for it now.**

---

## 3. Art direction — "field equipment at dusk, not a military console"

### 3.1 The vibe, in words

The screen should feel like **well-made expedition equipment used in a warm pool of
work-light, surrounded by cold space**. Friendly precision — the pleasure of good tools —
not military severity. Reference feelings (do not clone art): the warm-dark coziness of
Dome Keeper, the touchable-instrument charm of Teenage Engineering hardware, the readable
warmth of Oxygen Not Included's panels, the clean product-design restraint the owner has
asked for everywhere ("refined, readable, modern surfaces").

**The vibe test** (apply to every styled build): put the new screenshot beside the old
console. If the new one still reads as *monochrome dark rectangles with thin borders and
shouting capital letters*, it failed, regardless of layout. Second test: **text removed, the
chrome should look like friendly physical equipment** — rounded plates, chunky gauges, lit
keys — never like a server dashboard.

### 3.2 Chrome palette (hex is law; defined as `--aw-*` tokens)

Warm dark neutrals — browns, not blue-grays. **The entire blue-gray family is banned from
this screen** (`#14171d`, `#1b2027`, `#0b1220`, `#2a303a`, `#0d0f13` and anything visually
adjacent).

| Token | Hex | Use |
|---|---|---|
| `--aw-bg` | `#171310` | drawer/scrim ground; the darkest chrome ever gets |
| `--aw-surface` | `#221c15` | plates, cards, the lens body |
| `--aw-raised` | `#2d251b` | pressable keys, chips |
| `--aw-line` | `#3a3126` | the rare soft edge (avoid borders; prefer shadow) |
| `--aw-ink` | `#f2e8d5` | primary text — warm bone, never white, never gray-blue |
| `--aw-ink-2` | `#bfae94` | secondary text, idle glyphs |
| `--aw-ink-3` | `#8a7a66` | disabled only |
| `--aw-gold` | `#ffb648` | attention, selection, goal, "wants input" |
| `--aw-mint` | `#7cd9a2` | running, valid, gain |
| `--aw-coral` | `#ff6242` | danger, damage, cost-you-can't-pay |
| `--aw-sky` | `#5cc8f2` | material flow ONLY (lane animation, flow dots) |

Depth comes from **soft shadow** (`0 2px 8px rgba(8,5,2,.5)`) and value steps, not from
borders or bevels. Color is semantic only; chrome surfaces themselves are the neutral
browns. Saturation is reserved for meaning, so the board (ore glints, gas warning, lamps)
always out-saturates the chrome.

### 3.3 Type — kill the console voice

- **UI face: Instrument Sans** (OFL; vendor woff2 into `styles/fonts/` with `@font-face`,
  weights 400/500/600; fallback `system-ui, "Segoe UI", sans-serif`). All labels, chips,
  drawer text. **Sentence case everywhere.**
- **Numerals: Spline Sans Mono** (OFL, weight 500, `tabular-nums`; fallback `ui-monospace,
  Consolas, monospace`). Numbers only — never labels or prose.
- **Identity: Bricolage Grotesque** (OFL, 600) in exactly one place: the asteroid's name in
  the crest, 20px. Nothing else uses it.
- **Laws:** no `text-transform: uppercase` anywhere on this screen (the current stylesheet
  has 14 such rules — delete them all). No `letter-spacing` above `.02em`. 12px floor on
  every rendered glyph. Labels 13–14px; numerals 13/15px; site name 20px.
- If font vendoring fails in an offline environment, ship the fallback stacks — **never**
  fall back to Saira/tracked-caps for this screen.

The old faces (Saira SemiCondensed tracked caps) are what the owner called "harsh fonts."
They do not appear on this screen again. (Structural rules of
[`INSTRUMENT_GRAMMAR.md`](./frontend/INSTRUMENT_GRAMMAR.md) — 12px floor, color-by-meaning,
motion-only-when-a-value-moves, enumerated text banks, one biggest element — still bind.
Its specific typefaces and cold token hues are superseded *for this screen*; if the owner
approves the built result, this becomes the candidate direction for the rest of the game.)

### 3.4 Shape language

Corner radius 8px on keys, 10px on cards, pill radius on chips, 6px on gauge tracks. Gauges
are **chunky** — 10–12px tall tracks with rounded caps and soft quarter ticks — instruments
you'd want to touch, not 3px hairlines. Keys are square-ish plates (46×46) that visibly
have three states (§6.3). Nothing blinks or pulses at idle; motion only when a value moves.

### 3.5 Board palette (the rock itself)

The interior is lit like a workshop at dusk: **warm key light inside the bore, cool
starlight rim outside** — that warm/cool split is the coziness and the depth cue. The screen
renders through the **game's shared grading/bloom pipeline** (the current private
stock-graded second pipeline is deleted; see PQ-130.01), so this palette is authored in
scene values and graded like the rest of SpaceFace.

| Subject | Base | Detail | What a person sees |
|---|---|---|---|
| Space behind the rock | `#0b0a12` | warm-white stars | the void; the asteroid has a real silhouette against it |
| Silicate matrix | `#7a6955` | speckle `#8b7a64`/`#695a48` | warm anonymous stone, the "neutral tile" |
| Dense basalt | `#453f3a` | banding `#3a3531` | clearly darker, heavy, banded — reads structural |
| Ice | `#b9d6d8` | crack sheen `#e6f5f6` | pale glassy blue, the one cold material |
| Iron seam | host `#6f5b48` | branching vein `#9a6f4a`, glints `#f0a24e` | rust-toned rock with a metallic branch running through it |
| Deep exotic | host `#352a4d` | lattice `#8f6ae0` | obviously-not-normal violet lattice; the visible prize |
| Gas pocket | host `#4a4a36` | dark center `#2b2d1f`, cracks `#d3e26a`, drifting wisps | a cracked, breathing cell — danger, never treasure |
| Bored tunnel | `#1f1a15` | lamp pools `rgba(255,182,72,.13)` | carved space with a floor; a street waiting for cables |
| Vented pocket | `#4a463f`, split open | none | dead, spent, permanently gray-green |

Every material differs in **three channels at once** — hue, surface pattern, inclusion
shape — so it survives squinting and color-blindness. New commodities follow the rule: one
hue family + one inclusion shape (iron = angular chips; define others when added).

**Seams render as bodies:** contiguous same-material cells share a brightened perimeter
outline (1px, the material's detail color at 60% alpha) and one small count chip at the
body's center at work zoom — mono 13px on a `--aw-surface` pill, e.g. `Fe 9`. Aiming the
drill at a seam cell draws the **split preview** instantly: the outline breaks into the two
resulting bodies with their new counts (`4 + 4`) for as long as the aim holds.

---

## 4. The board

- **Grid contract:** square cells, axis-aligned to the screen. At the default "work" zoom a
  cell is **96–128px** at 1920×1080 (≈14–18 columns visible). The camera follows the rover
  with a soft leash (rover stays within the middle 50% of the screen; camera eases at
  ≤ 6 cells/s, 120ms ease-out).
- **Two zoom registers, only two:** *work* (above) and *site* — the whole asteroid
  silhouette with ≥16px cells at 1920×1080 (the body is ~53 cells tall with its skirt, so at
  1280×720 the floor is ≥12px; measured 2026-08-21), networks readable as a diagram. Mouse wheel or a key snaps
  between registers with a 180ms eased zoom; there are detents, not freeform zoom.
- **The silhouette:** the asteroid's irregular cross-section boundary is visible against
  space at site zoom and at the edges of work zoom near the surface. The board is a body,
  not a wall-to-wall tile fill. The surface port/derrick sits where the shaft meets space.
- **The rover** is the only safety-yellow object in the world: livery `#ffd23f` with
  `#161008` chevrons, readable cab, tracks, and a drill boom that points at its facing.
  One cell, snapped. Its state is worn on its body: bit heats from `#9a6f4a` toward
  `#ff6242` glow as heat rises; a visible hopper on its back fills with chunks (5 fill
  stages); cooling vents a small steam puff. "What a person sees": a chunky friendly
  mining vehicle you find in under a second, that visibly gets hot and visibly gets full.
- **Bored cells** read as rooms: slightly darker floor, soft warm lamp pool where the rover
  or a machine sits. When cables/lanes exist they run along tunnel walls/floors (§7).

---

## 5. Board events (every one replaces a log line)

Rules: every sim event below gets a board expression + a sound. **None of them prints a
permanently visible text row.** The ledger drawer (§6.6) records history silently. Repeats
suppress: identical refusals within 5s do not replay their full effect.

| Event | What you see (timings are law) | What you hear |
|---|---|---|
| Ore extracted | 3–5 chunk sprites pop from the cell (60–120ms apart), arc ~250ms into the hopper; hopper fill ticks up; a floater `+2 Fe` (mono 13px, `--aw-gold`) rises 24px over 700ms and fades | soft mineral tick, pitch up with value |
| Bore progress | target cell cracks in 3 authored stages; debris motes; bit spins | grind loop, tone deepens with rock hardness (3 layers, crossfaded) |
| Gas pocket breached | 150ms yellow-green flash in the cell; vapor floods adjacent tunnel cells ~1.2s; camera kicks 4px for 180ms; screen-edge coral vignette 400ms; a visible scar/chip on the rover; the pocket becomes the vented texture permanently | sharp hiss-boom, then fading hiss |
| Locked material (MK gate) | bit skates off with 6–10 sparks over 300ms; an engraved `MK2` stamp fades in on the cell face 600ms and stays while aimed | dull clank |
| Hopper full | lid clunks shut; next chunk bounces off; crest hold gauge pulses gold once | wooden thock |
| Heat critical | bit glow saturates; heat gauge enters coral; steam vents on stop | rising whine, relief hiss |
| Machine placed | ghost snaps in with a 120ms settle; its lamp lights mint | firm mechanical seat |
| Machine starved/unpowered | machine goes dark; a small gold **want chip** floats above it showing the missing input's swatch or a power glyph | single soft chime, once |
| Courier launch | pod visibly slides up the shaft, clears the surface, burns toward the background station | soft launch thump |

---

## 6. Chrome inventory — these seven objects are the entire HUD

Day one shows only **6.1 + 6.2**. Everything else mounts when it first has something to say
(the palette with your first Core; lenses with your first machine; drawers always reachable
but closed). Chrome never reserves space for its future self: no empty bays, ever.

### 6.1 Crest (top strip, 40px, full width, `--aw-bg` at 92% opacity)
Left: asteroid name (Bricolage 20px `--aw-ink`) + claim state as a small pill chip (`No
claim` ink-2 / `Anchored` mint). Center: **one alert slot**, empty and invisible by default;
when live, one sentence-case line, colored by severity, with a small icon. Right: credits
(mono 15px) + hold gauge (96×10px, fill mint→gold as it fills) + the leave key. *A person
sees: a thin quiet strip like the top edge of a windshield — one name, one number, one
small gauge.*

### 6.2 Rig cluster (bottom-right, 16px margin, on a `--aw-surface` card, r10, shadow)
Two chunky gauges, 132×12px, rounded, quarter ticks: **Heat** (fills `#9a6f4a`→`--aw-coral`)
and **Charge** (`--aw-mint`, drains per bore). Labels 13px sentence case beside them. These
mirror what the rover's body already shows — gauge confirms, vehicle tells. *A person sees:
two friendly instrument bars, like a camera battery readout, not a cockpit wall.*

### 6.3 Build palette (earned; bottom edge, right of center; hidden until a Core is owned)
A row of 46×46 keys (r8, `--aw-raised`, soft shadow) that grows one key per unlocked
machine. Key anatomy: the machine's **silhouette glyph** 22px centered (same silhouette as
its board sprite — recognition transfers), hotkey numeral 12px in the corner (mono,
ink-2). Three states: **ready** (raised, glyph ink-2; hover lifts 1px and lightens),
**selected/armed** (gold ring + glyph gold), **unaffordable** (flat `--aw-surface`, glyph
ink-3; hover shows cost chip with the short amount in coral). Locked machines are
**absent** — no gray placeholder row. *A person sees: a short row of tactile lit keys, like
a hardware sampler, that gets longer as the game grows.*

### 6.4 Cursor lens (hover/aim readout; replaces the deleted context bay)
A compact card (max 260px, `--aw-surface`, r10, shadow) offset +18/+18 from the cursor,
flipping inside screen edges. Contents, in order: 22px rounded **swatch** sampling the
actual board material + name (14px) + assay numerals (mono 13px, e.g. `9 cells · 2u/cell`);
then a **chip row** of pill chips (20px tall, icon + word): `Bore 2u` · `Farm` · `Hazard` ·
`Locked Mk2` · `Splits seam`. At most **one** body line under the chips (e.g. machine cause:
`Starved — no silicate`). Appears after 150ms hover while driving; instantly in build mode.
Never more than two text lines. Tutorial copy never appears here. *A person sees: a little
field-notebook tag next to their cursor — a color, a number, two or three stamps.*

### 6.5 Overlay lens chips (earned; bottom-left, small pill row; appear with first machine)
Up to four toggles, one active at a time (`V` cycles; Tab belongs to the drawers, §6.6).
**No lens, and no build feedback, may paint a solid fill over a cell** — the owner saw flat green
valid-seat fills and a solid red blocked box on the live board (2026-08-21) and called them what
they are. Lenses and build feedback are edge, outline, lamp and line treatments on the 3D forms
(a thin mint edge glow or corner brackets for a valid seat, a thin coral edge + why-glyph plate
for a blocked one, ≤60 % alpha, 1.5–2 screen px); the "≤35 % tint" wording below is superseded: **Faces** (valid machine seats glow
mint; blocked faces show one why-glyph — auto-on while placing), **Heat** (thermal tint;
machines short of rock contact shimmer; ice reads cold), **Network** (cables bright,
lane flow animated `--aw-sky`, disconnected islands dimmed, starved machines pulse gold
once), **Plan** (seam outlines + counts + per-face rates + port income/min). Lenses tint at
≤ 35% alpha over a base board that never lies.

### 6.6 Drawers (bottom sheet, max 280px tall, 200ms ease; grabber handle)
`Ledger` (event history — the old manifest tape lives here, silent), `Site` (production
totals, courier log), `Help` (keys, taught once). A drawer never covers the middle of the
board and closes on Esc or outside click.

### 6.7 Build mode
Entered from a palette key or `B`. Gridlines strengthen ~15%; a cell cursor appears (2px
gold rounded square) driven by mouse or arrows; the ghost renders in the world with its
face contacts drawn on the actual neighboring cells; valid cells glow mint, invalid faces
show the why-glyph. Enter/click places (120ms settle), Esc backs out one level. Placement
is chess: deliberate, snapped, reversible until committed.

---

## 7. Networks on the board (presentation)

Cables render as a warm gold line (`--aw-gold` at 85%, 2px at work zoom) running along
tunnel walls between machines, with tiny node dots at junctions; powered machines carry a
small mint lamp. Lanes render on tunnel floors with slow flow dots (`--aw-sky`, ~1 dot/s at
work zoom) moving toward the port; the lane's buffer reads as dot density. The port stacks
visible crates as output accumulates. At site zoom the same drawing simplifies to a legible
diagram: lines, lamps, flows, one glance = what's running, what's dark, what's starved.

---

## 8. Sound

The mine currently plays in near-silence because entering the screen pauses the sim and the
pause path zeroes the music bus (`src/audio/audioSystem.js`; cue hookups in
`src/systems/presentationOrchestrator.js` return early for drill events). The fix is part
of this design, not an afterthought:

- The mine gets its **own bed**: low interior room tone + distant settling creaks — muffled,
  close, cozy-industrial. The flight score does not continue inside.
- Drill grind in 3 hardness layers, crossfaded by the target cell's material.
- Every §5 event's cue wired through the existing cue pipeline.
- Mix priority: hazard > payoff > machine state > ambience. One voice at a time for
  alert-class sounds.

---

## 9. Screen moments

- **Enter:** the camera pushes from the flight view into the rock face and lands at work
  zoom on the rover (≤ 700ms). No cut to a website.
- **First Core:** the build palette mounts with a small settle animation — the interface
  visibly grows because the site grew.
- **Return to a producing site:** the screen opens at **site zoom** so the first second
  reads status (lit / flowing / dark), then drops to work zoom on first input.
- **Damage:** edge vignette + camera kick (§5). Never a modal.
- **Exit:** retract pulls the camera back out through the shaft to flight.

---

## 10. Deletions (do these, don't restyle them)

The manifest rail and its accent-striped rows · the Site systems bay (Power/Export/Couriers
"—") · the Context bay (the mouseover text well) · the keybind dump · the cyan embed frame
and letterboxed inset · the black well beside the board · the hero screen title over the
rock · hazard-stripe decoration · all `text-transform: uppercase` rules · the tracked-caps
console voice (Saira on this screen) · the gunmetal `--ao-*` gray family · the survey
fog/"unsurveyed" presentation · the private second render pipeline's stock grade (unify
with the game's) · the dead 2D painter path. Their information moves per §5/§6; most of it
needed no replacement panel.

---

## 11. Measurable invariants (headless-assertable)

1. **Flatness:** projecting any cell's corners through the live camera, top edge y-delta
   ≤ 0.5px and left edge x-delta ≤ 0.5px; projected width/height within 2% of square.
2. **Sovereign board:** canvas client area ≥ 88% of window at 1920×1080 and 1280×720 in
   default drive view.
3. **Word budget:** visible DOM text under the screen root ≤ 15 words in default drive view
   (no hover, no drawer).
4. **Type:** no computed font-size < 12px; zero elements with computed
   `text-transform: uppercase`; no Saira in computed font-family on this screen.
5. **Palette ban:** no computed color/background in chrome equal to the banned blue-gray
   list (§3.2).
6. **No fog:** on a fresh seeded board, zero cells render the "unsurveyed/unknown"
   appearance; every non-bored cell's material identity is queryable and drawn.
7. **Cadence:** one tap ⇒ exactly one cell of displacement; a held key < 180ms ⇒ no second
   cell (update `scripts/check-drill-smooth.mjs` to assert this, replacing the 0.06s law).
8. **Events on the board:** `drill:yield` produces a floater/particle expression (overlay or
   renderer hook observable) and no new permanently-visible text row; a gas breach applies a
   nonzero camera kick within 200ms.
9. **Sound alive:** while screen `drill` is active, the music/ambience bus gain is > 0 and
   the drill grind cue plays during a bore.
10. **Stills for humans:** whole-theater captures at 1920×1080 and 1280×720 (default +
    reduced motion): seam-vs-plain rock, gas pocket, rover in a bore, lens open, palette
    states, site zoom of a producing site. A cropped cube is not evidence.

---

## 12. Stage map (what to build, in order)

Leaves `.01–.06` are admitted in `PQ-130` (re-aimed at this law); `.07–.10` are admitted
alongside them. Stages 5–7 are future packets — **do not** start them from this file.

| Unit | Delivers | Law sections |
|---|---|---|
| `PQ-130.01` Theater | Board sovereign ≥88%; console deleted to crest + rig cluster; flat grid + square pads; two-register camera; silhouette against space; **the §3 chrome reboot lands here** (tokens, fonts vendored, sentence case); one shared render/grading pipeline | §2, §3, §4, §6.1–6.2, §10 |
| `PQ-130.02` Surgical drive | tap = one cell, hold-delay cruise, visible bore bites; smoothness check rewritten | §4, §11.7 |
| `PQ-130.03` This rock | warm mineral board palette + dusk lighting (warm key inside, cool rim outside) **in full 3D (§2.7)**: measured face brightness to the §3.5 targets (the old face read ~18 L* too bright), 5:1 raking key, warm-bore/cool-space depth gradient, ±5% per-cell variance, no fog tint, no flat fills, no neon; straight-down perspective; original block relief | §2.7, §3.5 |
| `PQ-130.04` Cells speak | material three-channel identity; seams as outlined bodies with counts; split preview; **fog removal** (visibility gate off in `src/systems/drill.js` presentation) | §2.3, §3.5, §4 |
| `PQ-130.05` The vehicle | the safety-yellow rover, worn state (bit glow, hopper fill) | §4 |
| `PQ-130.06` Hover as instrument | the cursor lens; context bay deleted | §6.4 |
| `PQ-130.07` The sim speaks | every §5 event expressed on the board; ledger demoted to drawer | §5, §6.6 |
| `PQ-130.08` The mine's voice | §8 end to end (bed, grind layers, cues, un-zeroed bus) | §8 |
| `PQ-130.09` Build like chess | earned palette keys, ghost + valid-face glow + why-glyphs, cell cursor polish | §6.3, §6.7 |
| `PQ-130.10` The site reads | cables/lanes/lamps/want-chips/port crates/courier launch; Network + Faces lenses; site-zoom return | §7, §6.5, §9 |
| *(future packets)* | seam-size scaling, heat law plug-in (`siteThermalModel` is coded and parked), gas-tap power balance, import complements, economy curve, drones/field | §1 |

---

## 13. Precedence

This file supersedes, for this screen: the visual voice of
[`ASTEROID_OPS_UI_BRIEF.md`](./ASTEROID_OPS_UI_BRIEF.md) (gunmetal/amber/Saira console —
its layout was already unfrozen; its palette and type are now void), the survey/fog language
in [`ASTEROID_OPS_VISION.md`](./ASTEROID_OPS_VISION.md) and
[`ASTEROID_WORKS_PLAYFIELD.md`](./program/ASTEROID_WORKS_PLAYFIELD.md) §5.5, and the
type/token hues (not the structural rules) of
[`INSTRUMENT_GRAMMAR.md`](./frontend/INSTRUMENT_GRAMMAR.md). The campaign's §3
vanilla-collapse ban and §6 leaf discipline remain fully in force, with this file as the
positive target. `SCREENS_D` B.10 stays void.
