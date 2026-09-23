<!-- LIFETIME: STABLE -->
# One photograph

The art direction for the SpaceFace interface. Written 2026-09-22 from two independent director
reviews — one from a full brief of the system, one that opened all twelve live screenshots — plus
the owner's own words, which turn out to have been misread.

This **supersedes `CENTERPIECES.md` §The ten**. That file's *bar for a centerpiece* and its two
multi-session plans (C9, C10) stand; its list of ten is replaced by §5 here. This tree's failure
mode is a direction document written and then abandoned beside the next one, so there is one.

The standard a screen is judged against is still [`THE_BAR.md`](THE_BAR.md). This is what to build.

---

## 0. The owner said two things and an agent merged them

This is the most important finding of the review, because it is why five programmes produced grey.

| When | What the owner said | About what |
|---|---|---|
| 2026-09-14 | *"a strange wood look that's not visible against the backdrop and also doesn't fit with this game; it would have to be more sleek and glass … maybe some slight neon look"*, *"sleek and modern"*, and the speed dial is *"like a car dashboard … anything like that should at least resemble an instrument in an advanced spaceship and maintain the illusion."* | **The flight HUD** |
| 2026-09-18 | *"real rock texture, warm directional light, a physical machine, almost no chrome."* | **The 3D world art** — praise |
| 2026-09-18 | *"a bit generic and simple for an A-list spaceship game."* | The interface — criticism |
| 2026-09-22 | *"bold and expressive, modern high resolution sleek … unique character per-screen but also a thematic commonality"*, *"gratuitous sleekness"*, *"nothing low resolution"* | The interface |
| 2026-09-22, later | *"free of any common CSS anti-patterns of old internet (mostly when CSS is pretending to be physical materials, it looks awful and we need either custom or downloaded assets for a lot of things)"*; *"advanced features to display and interact … the screens to make sense … without being too similar across the board"* | The interface — **overrules P4 and the MASS half of §1** |

**The later 09-22 ruling, read plainly.** CSS may not imitate a material. No gradient pretending to be
brushed steel, no bevel or inset shadow pretending to be a raised cap, no painted LED dot, no screw
or rivet, no texture tile, no fader cap, no procedural paint worklet machining a plate. Where the
interface genuinely wants an *object* — a hull, a crest, a commodity — it is a **produced asset**
(a render or an authored vector, at the resolution it is shown, never upsampled), or it is not
drawn. Everything else is the LIGHT half of this document, which the owner has now approved twice.
This does **not** reopen the raster nine-slices retired in step 0: a stretched bitmap is still the
smudge the owner named first. It narrows "mass" to real art.

What that retires below: **P4 entirely**; the MASS paragraph of §1 as a CSS technique; §3's
settings row ("switchgear: rockers, faders with detents" — the slider stays a *control*, its cap
stops being metal); and §8's protection of the slider's *material* (its track, ticks, fill and
thumb as geometry are still protected).

On 2026-09-18 an agent declared the 09-14 directive void — `hudStyles.js` calls the glass register
*"the tenth generic one-off"* — and installed the two 09-18 quotes in `deckplate/tokens.js` as
**"owner signals of record … the only two that exist."** The praise for the *world* became the law
for the *interface*, and the owner's only direct instruction about the interface was deleted.

Read correctly they were never in conflict:

> **The world is warm machined mass. The interface is sleek emitted light.**

Every owner statement fits that sentence. Root `AGENTS.md` §4 puts user direction above everything;
an agent may not retire an owner directive by declaring it does not exist. The 09-14 words are
restored as direction. What the 09-18 reset got *right* and keeps: no cyan wireframe, no visor, no
cockpit framing, no generic glass card. Those are fences on the execution, not a reversal.

---

## 1. The thesis

> **AMENDED 2026-09-22 (owner, §0): everything on the screen is either PRINTED or LIT.** The MASS half below is history — a printed field claims no material, so it cannot lie about one. §9 is the grammar that replaced it. Read this section for LIGHT, which stands.

> ~~**Everything on the screen is either the machine or the light it throws.**~~

Two substances. There is no third.

**MASS** — machined metal: a mount, a rail, a key you press, a nameplate. Mass is lit by the *same
key light as the world*, has thickness, casts a shadow, and is **rare**. An object earns mass by
consequence: UNDOCK is mass, a filter is not.

**LIGHT** — emission: numerals, readings, brackets, traces, fills, the focused word, a route line.
Light has no bevel and no edge. It blooms, it lands on the mass beside it, and on an authored stage
it lands on the world. This is where the sleekness lives.

A translucent panel is neither metal nor light, so it does not exist. A thin outline is neither. An
opacity fade is neither — mass does not fade, ink does not fade, **light dims**. A chip with a bevel
and no consequence is mass that lied.

Why not "machined hardware", the previous thesis: it names only the mass. So five passes built
mass — plates, bevels, chips — set words on top, and grey followed. Naming the other half gives the
interface the sleekness it was asked for and forces both halves to share one light, which is what
makes it part of the photograph instead of a sticker on it.

### Two temperatures, by place

A uniformly warm-on-gunmetal interface recreates the "wood look" the owner rejected, one layer up.

- **The lamp** — warm incandescent, dim `#8a6b3a` → live `#f2b950` → hot `#ffd98c`, driven red
  `#ff5038` for failure. It marks **what you can act on**. Unchanged from Deckplate.
- **The phosphor** — the ink of *emitted readings*, a cool white near `#dfeeff` with a faint cool
  halo (`rgb(150 210 255 / .22)`, 6–10px). It marks **what you read**: numerals, the HUD, the
  chart, prices. This is the owner's "slight neon" — a white core with a cool bloom, the way a tube
  reads.
- **Etched ink** — warm bone `#e8e2d4`, for legends printed *on mass*. Paint under the warm key.

**Fences, so phosphor cannot become the rejected cyan wireframe:** it is an ink, never a stroke
colour for shapes; nothing is drawn in it under 2px; no grid, no scanline, no visor, no corner
brackets framing the screen.

Docked: warm legends, cool readings, a bench, the cold bay behind. In flight: no bench — cool
readings over the world, one warm lamp on the thing you can do.

`src/ui/deckplate/` keeps its name. "Deckplate" is now the name of the **mass** substance.

---

## 2. What was actually wrong

Both directors, independently, on the same two things.

**Every screen is a list with a title; not one is an instrument.** The chart does not draw space.
The ship screen does not show the ship. The standing ladder is not a ladder. The codex entry is not
a document. Every body is label/value on the left, key/value on the right, buttons at the foot. The
type ramp proves it: **a 100px title, 11–14px labels, and nothing between**. The three places the
game *does* have a middle — `18,400`, `49`, `439` — are the strongest moments on every screen they
appear on. **The missing middle is load-bearing objects.**

**Nothing touches the edges and nothing touches the world.** A medium box in the upper-left 50–60%
of the frame with void to the right, on six of twelve. On the world screens the panels sit on the
render with no relationship to it.

And: zero states rendered as spreadsheets of zeros; the lamp is a 1px border that never glows;
three plate grammars and six button styles across twelve screens.

---

## 3. The invariant and the axis

### The invariant — what makes 42 screens one product

1. **One key light, shared with the world.** The stage writes its authored key direction and colour
   into `--dp-key-angle` / `--dp-key-color` at scene mount. Every bevel answers the same sun the
   ship does.
2. **Two substances**, mass and light, nothing else.
3. **One lamp, one failure red, one phosphor.** No green rule, no red button, no third hue.
4. **Two type voices** — Archivo etched/display, Instrument Sans reading — and **the numeral is the
   display moment**. The middle of the ramp is built out of numerals, not more labels.
5. **The frame** — one margin, one standing column, one rhythm. Already built.
6. **The attention lamp** — focus is a light source, everywhere, with the same falloff.
7. **The motion law** — *nothing arrives by fading in*. A cut is ≤120ms. Mass **moves** along or
   against the key. Light **warms and cools**. Numbers **roll**. Objects that persist between
   screens **travel**. Reduced motion cuts each to the same end state, and every state has a
   non-motion channel.
8. **Light makes a sound.** Cues bind to lamp events, not to screens.

### The axis — WEIGHT

The one axis a screen may differ on is **the fraction of the frame that is mass**: 0 is words of
light over the whole photograph, 1 is a bench of mounted instruments. How much world shows through
is a *consequence*, not a second axis — mass occludes, light does not. It is physically motivated:
a pilot's window has no hardware in it; a station's hardware is around you; a document is a lit
sheet.

Two things give a screen character on top of its weight:

- **The grade** — what the world behind it is doing: exposure, colour temperature, depth of field,
  vignette. Set on the stage, never in the DOM.
- **The signature object** — one instrument only that screen has.

| Family | Weight | Grade | Signature object |
|---|---|---|---|
| title | 0.05 | dusk field, warm subject / cold sky | logotype under the key; the focused menu word casts warm light onto the rock |
| motion-prompt | 0 | field, −1 stop | one filament warming as the question is asked |
| new-game | 0.1 | field, camera on the hull | three hulls in a lineup; the difficulty insignia as cast objects |
| credits | 0 | field, slow | a tape: names print and roll |
| game-over | 0.05 | last frame cooled ~1500K, every lamp at 0 | the cause of death as the single line of light |
| pause | 0.2 | held frame, −0.5 stop, focus racked to the hull | the HUD stays lit at dim current — the ship is still powered |
| settings | 0.6 | field, unchanged, *because the settings change it* | switchgear: rockers, faders with detents; a display slider changes the stage live |
| save/load | 0.3 | field | a strip of lit frames — each save's hull and sector as a still |
| help | 0.5 | field, dim | the key legend as mass: press a key and it lights |
| achievements | 0.3 | field | a wall of cast marks, earned ones lit |
| codex | 0.4 | field, −1 stop | a light table: entries as lit sheets |
| mission log | 0.4 | as codex | the manifest tape; the tracked row is the lit one; the timer is the biggest element |
| tech tree | 0.3 | as codex | traces of light on a plate; unlocking lights the trace |
| station shell | 0.7 | berth: warm key, cold rim | the milled nameplate and one machined tab rail — no chip tabs |
| market | 0.7 | berth | the board (phosphor odometers), the quote (a *real* demand curve), the console (one fader, two keys) |
| shipworks | 0.6 | berth, camera on the hull | the jig: leader lines from each socket to the hull's actual mount point |
| industry | 0.6 | berth | the flow: lines of light with rate between plants |
| contracts | 0.5 | berth | postings as lit sheets, each with its faction crest cast at 48px |
| factions | 0.5 | berth | the crest wall: fourteen 240px crests as cast objects; the ladder as a lit gauge |
| bar | 0.5 | berth, dimmer, warmer practicals | the low light; contacts as lit portraits |
| ledger | 0.6 | berth | the credits odometer at hero size; a printed tape |
| **flight HUD** | 0.05 | the live world | **optics** — integrity, speed, radar, brackets drawn as light; the ordnance dock is the only mass |
| chart | 0.15 | world → black glass, only its lights remain | **the map is the screen**: the system drawn as light |
| THE SHIP | 0.2 | world, camera on the hull | the jig without the station's mass |
| range | 0.4 | world, dim | the scope; the weapon's numbers roll as you fire |
| footprint | 0.1 | black glass | the economy as one lit graph filling the frame |
| crucible door | 0.2 | foundry, hot | the mode and arena marks at ~140px as cast objects; the seed as an odometer |
| crucible draft | 0.5 | foundry | the rack: choices as plates with their mark cast on them |
| crucible results | 0.05 | arena's last frame, cooled | the run's number rolling up at hero size |

**Weight discipline.** A 0.7 screen has three or four mass objects, not thirty. When a fourth thing
wants a bevel, it is light.

### The three studios, as principles

- **Bungie** — the interface is lit by the player's attention: the thing under focus is bright, its
  neighbourhood is lit with falloff, everything else recedes. → the attention lamp.
- **Rockstar** — a menu is a different *photograph of the same world*. Character comes from
  treatment: grade, time, depth of field. Never from a different panel. → the grade column.
- **Blizzard** — the interface is made of the world's materials at the world's fidelity, and each
  screen has a bespoke shape language. → mass calibrated against the Cycles renders; marks as cast
  objects.

---

## 4. Kill list

Delete, do not improve. Each is a test on a screenshot.

1. **The panel.** *(Amended 2026-09-22, §9.1: a floating card is still dead; ONE `.dp-sheet` per screen that touches a frame edge is the surface, where measurement says the world is too bright for words.)* Any rectangle of darkening with a visible inner edge over the world. *Can you
   point to where the dark starts?* Dead. Occlusion is a **vignette** — a gradient reaching the
   frame edge with no inner boundary — in the stage's grade.
2. **The chip.** The small bevelled button as the universal control: 8 market filters, 9 chart
   tabs, 17 pause buttons, 7 station tabs. *A bevel and no consequence?* Dead. A filter or a tab is
   a lit legend on a rail. A key is mass only when pressing it changes the world.
3. **The outline focus ring.** Replaced by the attention lamp plus a hard 2px bone bracket.
4. **Same weight everywhere.** *Is the most consequential control the heaviest object on the
   screen?* On market, UNDOCK, BUY and "Dismiss" are the same object. Fail.
5. **The fake instrument** — the "Stable demand" black box, the fitting rendered as a text
   schematic. An instrument shows real data as light or it is not on the screen.
6. **The essay** — the seven-line commodity paragraph. A reading is a number and a cause in one
   line; prose goes to the codex.
7. **The getting-started strip.** Onboarding is a lamp on the next thing to do.
8. **Hue leaks** — the green rules, the red LAUNCH, the cool "Low".
9. **The HUD cluster plate.** The object the owner named twice. Dead.
10. **Arrival by fade.** Including `transition.js`'s `dp-vt-body-in`. The root cross-fade stays only
    because it is a cut: cap both directions at 120ms.
11. **Raster nine-slices as material** — the seven raster kit folders. Retire as UI material;
    re-purpose the Cycles renders as the **calibration reference** the paint worklet is judged
    against. The kit's *vector* half — 263 icons, 44 marks, the logotype — is production and
    mandatory. Deckplate's "no `url()` in a material" stands.
12. **A glyph where a mark exists.** Any faction, mode, arena or difficulty under 48px when a
    produced mark exists.
13. **Pointer parallax** (was C8). A gimmick. Depth comes from world-anchored light moving with the
    world while mass stays fixed to the frame.
14. **Scroll-driven arrival** (was C5, shipped this session — to be removed). Rows are *lit* as the
    attention lamp reaches them, never faded in. A row resolving from transparent is a landing page.
15. **Developer strings on player screens.** The commit hash in the title and pause foot.

---

## 5. The centerpieces

Judged against `CENTERPIECES.md` §The bar, plus per-item floors: 12px / AA, a reduced-motion cut
with a second channel, a forced-colours variant, and it must read on the still-plate fallback.

**A correction I owe on my own commits.** I wrote "compositor-only" about registered custom
properties. That is wrong: registering a property makes it *interpolable*, not off-thread. Only
`transform` and `opacity` run on the compositor, plus paint-worklet inputs. A registered number
feeding a gradient, CSS math per child, or a `font-variation-settings` transition is main-thread
style recalc and paint every frame. That is acceptable on a menu screen when it is **bounded** (one
container) and **measured**; it is never acceptable in flight.

**P1 — The shared key.** Forward: the stage writes its authored key into `--dp-key-angle` /
`--dp-key-color` at scene mount (once per scene, never from the drifting camera). Reverse: the stage
carries one `PointLight` at the screen-projected position of the hottest lamp, coloured and driven
by that lamp's current, updated on lamp events. Moving focus down the title menu moves a warm glow
across the rock. *This is the moment the interface stops being a sticker.*

**P2 — The attention lamp.** Not a highlight state: a lamp above the focused item that lights its
neighbourhood with falloff — the plate around it, the rows either side, the ink beneath. Two
registered `<length>` properties on the container; children read their own distance. Bounded to the
focused container, measured before it ships, never in flight. Second channel: a hard 2px bone
bracket, always. Replaces every focus ring, hover fill and selected-row tint in the game.

**P3 — Filament lamps, with the cast and the click.** Keep `--dp-lamp-current` (shipped). Add: the
cast lands on the mass beneath and on the world; every crossing to live plays the cue; the legend
beside it changes word, so colour is never the only channel.

**P4 — SUPERSEDED by the owner, 2026-09-22 (§0).** *No gradient, worklet or CSS bevel may paint
metal. An object is a produced asset or it is light.* The original text is kept below only so the
history reads; do not build from it.

~~Computed metal, for mass only, calibrated.~~ The worklet paints mounts, never light.
Corrections to what shipped: feed it the scene's key; the tooth must read as grain at 400% and
vanish at 100%; **calibrate against `assets/ui/kit/assets/plates/` until a fresh reviewer cannot
tell the worklet plate from the Cycles render.** That is the Blizzard fidelity test and it is what
the retired rasters are now for. Paints on invalidation only — anything that moves is a separate
overlay element, never a worklet input.

**P5 — Emitted instruments; the flight layer is light.** Integrity, speed, radar, bracket and
objective drawn as light on one canvas at device resolution, with phosphor numerals in the DOM. The
ordnance dock is the only mass in flight. No backdrop-filter. Fences: no visor, no cockpit framing,
nothing under 2px, the radar is a lit sweep and contacts — not a compass rose. **This answers the
owner's 09-14 words directly.**

**P6 — World-anchored light.** Light may live at world positions; mass never does. Target brackets,
station labels, chart marks, and the **shipworks jig** — leader lines from each socket to the hull's
actual mount point — drawn at projected coordinates. DOM-to-DOM leaders use CSS anchor positioning.
The camera drifts, anchored light moves with the world, mass stays fixed: that is the depth, free.

**P7 — Marks as cast objects.** The 44 marks and the logotype rendered as *relief*: the body as a
masked plate lit by the shared key, the accent path as a lamp at the item's current. A crest at
240px on the factions wall is a cast badge under the sun, not an icon. **Cheapest transformation in
this document with the largest visible return** — 1 of 44 is currently wired.

**P8 — The grade is the transition; persist, do not morph.** Opening a screen changes the world's
light, not a panel's opacity: exposure, temperature, depth of field and vignette lerped over the
settle. View transitions restricted to objects that exist on *both* sides — the nameplate, the
credits lamp, the hull — which travel; regions cut.

**P9 — Numbers roll at a rate.** The rate is information, so it is sim-driven: digit strips animated
with WAAPI `transform` whose duration comes from the rate. The one form that genuinely runs on the
compositor.

**Superseded from the old list:** C4 variable-font *transitions* become a **snap between two
instances** on the lamp state (a width transition is layout + paint per frame, and it reflows a
column); width remains the nameplate's voice only. C5 and C8 are killed above.

---

## 6. The one thing

**Undock.** It happens every session, it is the seam between the two halves of the game, and it is
the thesis in one beat: mass moves, light warms, the world's grade changes, and one object travels
between two worlds.

One fact shapes it: the berth is a stage scene and flight is the live sim render. There is no lerp —
at some instant the canvas stops showing one and shows the other. That instant is a **renderer cut**,
and the sequence is built around hiding it: the world cools *before* the cut, the cut lands under
the DOM swap, the flight frame comes up *after*.

- **0ms** — UNDOCK, the heaviest key on the screen, goes hot with its click; the reverse point light
  jumps to it.
- **0–80ms** — every other bench lamp drops to current 0. A colour change, not an opacity fade.
- **80–400ms** — the mass retracts: board, quote, console, vitals and tab rail translate out *along
  the key's direction*, away from the sun. The nameplate stays.
- **120–400ms** — the world cools while it is still the berth: key colour toward the cold rim,
  exposure −0.4, bay practicals dimming.
- **380ms** — the nameplate's lamp drops. The last station light to go out. *This is the beat people
  will remember.*
- **400ms — the swap.** The retract finishes, the view transition fires, the station DOM unmounts,
  the HUD mounts with its lights at 0, and the renderer cuts in the same frame at reduced exposure
  so the cut lands dark rather than bright.
- **400–620ms** — the one traveller: the credits lamp moves from the ledger mount to its flight
  position and **cools from lamp to phosphor**. Everything else cuts.
- **400–900ms** — the flight frame's exposure returns to nominal.
- **500–1200ms** — the HUD arrives as light, each with its cue: speed at 500 (rolling up from 0 as
  the sim pushes the ship off), integrity at 640, radar at 800 (its first sweep lights the
  contacts), objective at 1000. The ordnance dock — the only mass — slides in at 900 along the key.

Reduced motion: one cut at 0ms to the final state; the four cues still play in order; the legend
reads UNDOCKED. Docking is the mirror.

**The signature behaviour** — what the player feels every second rather than remembers — is the
attention lamp. Build the moment first because it proves the thesis in one beat; build the lamp
second because it is on every screen.

---

## 7. Order of work

**0. The material, done 2026-09-22.** Not on the original list because it was mistaken for a
styling preference. It was the floor under every other item: 142 raster nine-slice declarations
across eight stylesheets and seven screen files, now zero.

`keys/key.legend.rest.png` is 160x40 and was stretched across every station tab, every market
filter and every legend in the game. A 320x80 `@2x` sat beside it on disk and nothing referenced
it, so on the Electron app at devicePixelRatio 2 every key, plate, window and tile was a bitmap
upsampled 2x. That is the owner's "textures as smudges", and it was not a choice any screen made —
it was mandated by `assets/ui/kit/kit/fh.css`, whose header required produced bitmaps and forbade
gradients, shadows and borders as materials outright. The header is rewritten, the coverage test
that enforced it is inverted, and the recipes live in Deckplate tokens (`--dp-cap-*`,
`--dp-well-*`, `--dp-stock-*`, `--dp-pane-*`, `--dp-chan-*`) so a stylesheet class and a JS pin
resolve to the same material.

Two things worth keeping in mind for everything below. **Triage, not a swap**: replacing raster
bevels with computed bevels would have kept the chip at better resolution, so §4.2 decided per
class — legend became light, primary became mass. And **geometry is sacred**: a nine-slice paints
INTO the border box, so every site keeps its border at the original width and makes it transparent.
That is the only reason a change across 149 sites moved nothing.

Item 2's gate (a) is *not* closed by this. The pixel-sampling contrast audit is still unbuilt, and
killing the market's `#sx-panel` still waits on it.


1. **Title** — the shared key, forward and reverse (P1); the light-variant menu with the attention
   lamp (P2); the outline focus deleted. One screen, and the thesis is visible in the game's first
   frame.
2. **Market as the bench proof** — kill the panel and the chips; three mass objects; phosphor
   odometers; the vignette instead of the rectangle. Two named gates close it:
   **(a)** the berth is re-lit or re-framed until the hangar wall behind the standing column reads
   dark, and the glyph audit holds 4.5:1 **sampling the world's pixels behind every reading** — a
   vignette is not assumed to carry it, and bloom and text-shadow do not count toward contrast;
   **(b)** a performance recording of one focus change on the 47-row board shows the attention
   lamp's settle as a bounded main-thread cost, or its falloff is cut to the focused row and its two
   neighbours.
3. **The flight layer as light** (P5) — **DOM half DONE 2026-09-22.** The cluster plate (§4.9) is
   gone — it was declared three separate times in `hudStyles.js` and the last one silently won —
   along with nine card paints. Readings are phosphor; occlusion is a veil with no inner boundary;
   the hull dial and the power rail (the one permitted mass) are untouched. The register comment
   that had voided the owner's 09-14 words is corrected in the file. **Still open:** P5's canvas
   half. Flight owns no canvas today, so adding one is a new render surface and `ARCHITECTURE.md`
   §1.2 governs it. And nothing here is verified MOVING — the bench cannot play flight.
4. **Factions** (P7) — a day's work, the largest visible jump per hour in the game.
5. **Undock** (§6), once 2 and 3 exist.
6. **Pause** — **DONE 2026-09-22.** Seventeen chips in six groups became a rail of light with
   etched group heads and one lamp on RESUME; the light primitive gained the group head and the
   BANK (a verb sharing a wrapping line) to make seventeen verbs fit without a grid. The brief
   stopped being two panes of glass. Then the grade per family (P8), then the rest by weight.

---

### Where this stands, 2026-09-22

**Done:** the material (step 0), the title (1), factions' crests (4, partial), the flight DOM (3),
pause (6), and the contrast instrument that gate (a) was waiting on. Kill list: §4.2 the chip,
§4.3 the ring, §4.7 the getting-started strip, §4.9 the HUD plate, §4.11 raster nine-slices,
§4.15 developer strings. All 42 screens shoot clean, and every reading on every one of them clears
its WCAG floor measured against the composited frame.

**Open, in the order they are worth doing:**
1. **Market as the bench proof** (step 2). Gate (a)'s instrument now exists
   (`scripts/ui-contrast.mjs`) and the berth has its veil, so the panel kill is unblocked. Gate (b)
   — a performance recording of the attention lamp's settle on the 47-row board — is not measured.
2. **§4.6 the essay** — the seven-line commodity paragraph is still on the market.
3. **§4.5 the fake instrument** — the demand box lost its bezel and its smudge, but "Stable demand"
   is still a phrase where a reading should be.
4. **Undock** (step 5) and the grade per family (P8).
5. **§4.8 hue leaks** — the green rule under the pause brief's contract link is one.
6. The seven screens that pin material inline do so because `fh.css` is injected at first dock, so
   they render differently before and after one. That wants its own pass.

---

## 8. What to protect

Named by both directors, and not to be knocked down while the rest is:

the stencil **wordmark**; the **title composition** (ship on rock, engine glow, planet as
counterweight); the **big bone numerals**, which are the middle of the type ramp; the **INTEGRITY
hull-silhouette dial**, the only drawn instrument in the game and the seed of P5; the **settings
sliders** as a *control* (track, fill, value — their fader-cap material is retired, §9.1); the **round compass**;
**Crucible's nerve** (oversized title, red heat, the seed housing); the **station right rail's
idea** (one big number, four bars, two actions); the **faction colour rule**, the only place faction
identity enters the UI; the **chart header**, which titles the chart by where you are; and **the copy
voice** — *"One hull, one contract, the whole sky"*, *"Mass on accept: 12.4t. Authorization:
VALE, D."* — rated the product's second-best asset after the 3D, and currently better than the
layout it sits in.

---

## 9. Printed and lit — the grammar that replaced mass

Written 2026-09-22 by a design-direction pass (Fable) the hour the owner banned CSS material
imitation, then adjusted for execution: the Deckplate class names are KEPT and their bodies
rewritten (twenty files consume them); the material tokens are flattened at the root first so
every screen changes in one step; the sheet ships as its flat `rgb(8 9 12 / .90)` fallback until a
frame-time number clears `backdrop-filter`; the title's logotype keeps its gradient (§8 protects
it). Guards: `test/ui-no-material-imitation.test.mjs` is the hard one (the Deckplate root, zero
today); the broad rules in §9.5 are a ratchet over legacy sheets, never a red-on-day-one gate.

### 9.0 The thesis, corrected

> **Everything on the screen is either printed or lit.**

**PRINTED** — flat ink: a field of one colour with a hard geometric edge, type on it, a hairline
rule. No thickness, no light direction, no sheen. A *sign*, not a machine. Replaces "mass". A
control earns a printed field by being pressable; nothing else gets one.

**LIT** — emission, as ONE_PHOTOGRAPH §1 defines it: numerals, readings, traces, the lamp on what
you can act on. The only thing on the screen that blooms.

Depth is never faked. It comes from two real sources: the **world** behind the interface (and,
docked, seen *through* the one sheet) and **produced imagery** of real objects — hull renders,
crests, icons. Printed, lit, and the photograph. Nothing else.

Why this beats "mass": a bevel lies the moment the world's light moves, and the owner has said so
twice (the wood look, the screws). A printed sign never lies about its material because it claims
none — Destiny's flat chamfered fields, Blizzard's flat crests at scale, Rockstar's type on the
photograph are all printed-and-lit. P1's forward half (key light → bevels) dies with the bevels;
its reverse half (the hottest lamp casting a PointLight into the world) survives and is now the
only shared-light mechanic. The two temperatures, the veil, the attention lamp, the motion law,
the two type voices, the numeral as the display moment, one lamp + one red + one phosphor, 12px,
AA on composited pixels, reduced motion — all unchanged.

### 9.1 The grammar

#### The shape signature — the cut, and it carries state

One 45° chamfer on the **top-right** corner of every printed field that can be pressed:
`clip-path: polygon(0 0, calc(100% - var(--dp-cut)) 0, 100% var(--dp-cut), 100% 100%, 0 100%)`.
Things you *read* are never cut, so the grammar reads in 200 ms: **cut corner = you can press
it.** When the control is live or selected, the cut edge itself lights — a 2px `--dp-lamp`
diagonal (a rotated `::after` bar clipped to the corner) with `box-shadow: 0 0 8px
var(--dp-lamp-bloom)`. That replaces the LED pip as the one state mechanic: state is light on
geometry, not a dot. It is not the rejected visor/wireframe/cockpit because it is a corner on a
*field* — never a bracket around the screen, never a stroke, never cyan — and it points at the
world (top-right, away from the standing column), not at the player.

#### Tokens to add (all `--dp-`, no new root)

```
--dp-field:        rgb(10 12 16 / .84)     /* a printed field over the world; also the dropdown popover */
--dp-field-ink:    rgb(232 226 212 / .08)  /* the ghost field: ink at 8% (secondary keys, selected row) */
--dp-field-ink-hi: rgb(232 226 212 / .14)  /* its hover */
--dp-sheet:        rgb(8 9 12 / .78)       /* THE sheet — one per screen, backdrop-blurred */
--dp-sheet-w:      calc(var(--dp-col) * 1.25)
--dp-rule:         rgb(232 226 212 / .10)  /* hairline between rows, under heads */
--dp-rule-hi:      rgb(232 226 212 / .22)  /* a rail at rest */
--dp-cut:          calc(10px * var(--dp-s))
--dp-cut-sheet:    calc(18px * var(--dp-s))
--dp-key-h:        calc(56px * var(--dp-s))   /* primary */
--dp-key-h-2:      calc(40px * var(--dp-s))   /* secondary, destructive */
--dp-hint-h:       calc(var(--dp-u) * 5.5)    /* keyboard-key hint */
--dp-lamp-glow:    0 0 28px rgb(242 185 80 / .35), 0 0 6px rgb(242 185 80 / .22)
--dp-text-legible: 0 1px 0 rgb(0 0 0 / .5)    /* the ONLY black shadow: on type over the world */
```

Delete `--dp-cap-*`, `--dp-well-*`, `--dp-stock-*`, `--dp-pane-*`, `--dp-plate-*`,
`--dp-channel-*`, `--dp-key-sweep`, `--dp-key-pool`, `--dp-tex-*`, `--dp-glass-*`,
`--dp-mark-face`, `--dp-mark-shadow`, `--dp-etch-shadow`, `--dp-key`, `--dp-key-edge`,
`--dp-shade`, `--dp-shade-edge`, `--dp-metal-hi`. `--dp-metal-0..4` survive as flat fills only.

#### Allowed / banned — these are the guard regexes in §5

| Allowed | Banned |
|---|---|
| Flat fills, solid or one alpha | Any gradient that does not end in `transparent` (material ramps never do; light falloff always does) |
| 1px/2px hairlines in `--dp-rule*`, `--dp-ink`, `--dp-lamp` | `inset` in any `box-shadow` |
| `clip-path` geometry | Outer `box-shadow` in black/grey — no "lift"; outer shadows may only be lamp / phosphor / danger |
| Glow **on things that emit**: lamp fills, phosphor text, lit rails, the mark's accent | `drop-shadow()` in CSS (the mark's relief pair is a bevel) |
| The veil (a gradient to the frame edge, no inner boundary) | `repeating-*-gradient` stripes, texture tiles, `paint()` worklets, `border-image`, nine-slices |
| `backdrop-filter: blur()` on **`.dp-sheet` only**, one per screen, never in flight files | `radial-gradient(circle at …)` lenses (the LED), specular sweeps, smoked-glass tints |
| Produced imagery of a **real object** — Blender renders, the 44 marks, 263 icons, the logotype SVG, save thumbnails | A raster or gradient standing in for a *material*. "No `url()` in a material" ≠ "no images" |
| `text-shadow: var(--dp-text-legible)` on type over the world | Any other black `text-shadow`, including the blurred `0 0 18px rgb(0 0 0/.35)` in `light.js` |
| Archivo (display + etched), Instrument Sans (reading) | Spline Sans Mono / `monospace` anywhere in `src/ui` or `styles` — owner preference since 2026-08 |

**Backdrop-filter: in, docked and menu screens only, one sheet per screen.** A blur of the real
world is the one honest glass CSS can do — it computes the actual frame; a specular gradient
paints a fake one. It stays out of `src/ui/hud.js`, `src/ui/views/hud*.js`,
`src/ui/masslineHud.js`, `src/ui/views/velocityRailStyles.js`, `src/ui/views/hullIntegrityStyles.js`.

**Three edits the survivors need to pass their own guard** (they apply to pause automatically;
title takes one swap): `.dp-lit__item` and its hover/primary states drop the blurred black shadow
and use `var(--dp-text-legible)` plus their lamp glows; `.dp-figure__unit` uses
`var(--dp-text-legible)` instead of `--dp-etch-shadow`; `.dp-mark` loses its three
`drop-shadow` filters. The **wordmark's brass ramp and shadow move into the logotype SVG**
(`assets/ui/kit/marks/logotype/`) as an in-file `<linearGradient>` — it is produced imagery, not
CSS material — and the title swaps the CSS-filled text for that file. The primary verb's 7px lamp
bead is flat lamp with bloom, not a lens: it stays.

#### The primitives

Every one builds on a `light.js` survivor where one exists. "Bracket" = the existing 2px bone lead
bar from `dp-attend`. Sizes are `--dp-*` only.

| Primitive | Shape / fill / edge | Type | Rest → hover/focus → pressed → disabled → selected |
|---|---|---|---|
| **Primary action** (UNDOCK, LAUNCH, BUY — one per screen) | Printed field `--dp-lamp` flat, `--dp-key-h`, min-width `calc(var(--dp-col) * .52)`, the cut. No border. | Archivo 800 wdth 100, `--dp-fs-read`, uppercase, tracking .06em, colour `--dp-metal-0`. Key hint at trailing edge. | hover/focus `--dp-lamp-hot` + `--dp-lamp-glow` + bracket → pressed `--dp-lamp-dim` for `--dp-d-cut`, no translate → disabled: no fill, 1px `--dp-lamp-dim` hairline, text `--dp-ink-mute`, the reason printed beside it at `--dp-fs-data` |
| **Secondary action** | Ghost field `--dp-field-ink`, `--dp-key-h-2`, the cut. | Archivo 700 wdth 92, `--dp-fs-data`, uppercase, `--dp-ink` | hover `--dp-field-ink-hi` + cut edge lights → pressed field at .05 → disabled text `--dp-ink-mute`, field .04 |
| **Destructive** (ABANDON, DELETE SAVE, QUIT) | Ghost field + a 2px `--dp-danger` rule along the bottom edge. Red arrives on intent. | as secondary | hover: field `--dp-danger` flat, text `--dp-metal-0`, glow `--dp-danger-bloom` → pressed danger at 80% → disabled: rule `--dp-ink-mute` |
| **Tab / filter / segmented** | `dp-lit--fine` — words on a rail. 1px `--dp-rule-hi` rail under the group; the active word's segment is 2px `--dp-lamp` + `0 0 8px var(--dp-lamp-bloom)`. No box, no cut (navigation is not a command). Segmented choice (difficulty, OFF·ON) is the same object, evenly spaced. | Archivo etch `--dp-fs-etch`, tracking .14em, uppercase; rest `--dp-ink-dim`, active `--dp-ink` | hover `--dp-ink` → active segment lit → disabled `--dp-ink-mute`, no segment |
| **List row / selected** | `--dp-row`, 1px `--dp-rule` between rows. Selected: bracket + flat `--dp-field-ink` tint + name in `--dp-ink`; inside `dp-attend` the neighbours warm. | Name Instrument Sans 500 `--dp-fs-data` `--dp-ink-dim`; data cells `dp-phos` tabular | hover field at .05 → selected as stated → disabled `--dp-ink-mute`, no bracket |
| **Key-value readout** | No field. Label above or left, value right-aligned. | Label `--dp-fs-etch` tracked uppercase `--dp-ink-mute`; value `dp-phos` `--dp-fs-data`/`--dp-fs-body` tabular. A value you **set** is `--dp-lamp-hot`; a value you **read** is phosphor. | — |
| **Big numeral** | `dp-figure` (exists). Rolls (P9). | — | — |
| **Section head** | Etched label sitting on the left of a 1px `--dp-rule` rail that runs to the column's right edge. | `--dp-fs-etch`, tracking .18em, uppercase, `--dp-ink-mute` | — |
| **Slider** (supersedes ONE_PHOTOGRAPH §8) | Track 2px `--dp-rule-hi`; fill 2px `--dp-lamp`; detents 1px dots `--dp-rule-hi`. Thumb: a 2px × 18px `--dp-ink` bar at the fill's end. **The value rides inline right of the track** (where the % sits today) as a phosphor numeral at `--dp-fs-data` — no cap, no pitch change. | numeral `dp-phos` | hover/focus: bar and numeral go `--dp-lamp-hot` + glow → drag: numeral rolls → disabled: fill and numeral `--dp-ink-mute` |
| **Toggle** | The two-word segmented choice (OFF · ON). No pill. | as tab | — |
| **Text input / search** | No box. 2px bottom rail `--dp-rule-hi`; search has the icon left, key hint right. | Instrument Sans `--dp-fs-body` `--dp-ink`; placeholder `--dp-ink-mute` | focus: rail `--dp-lamp` + `0 0 8px var(--dp-lamp-bloom)`, caret lamp → disabled rail `--dp-rule` |
| **Keyboard-key hint** (ESC, F5, E) | 1px `--dp-rule-hi` hairline rectangle, `--dp-hint-h`, radius `--dp-r-plate`, no fill — a glyph from a manual, not a cap. | Archivo 700 `--dp-fs-etch` uppercase tracking .08em `--dp-ink-dim` | key physically down (where known): fill `--dp-lamp`, text `--dp-metal-0`, `--dp-d-cut` |
| **Dropdown** | Current value as a readout with a chevron icon; opens a **flat `--dp-field` popover** of rows beneath (no blur — it is not the sheet). No native `<select>` chrome. | value `--dp-ink`, chevron `--dp-ink-dim` | open: the value's rail lights |
| **The sheet** — only where the world behind is too bright for words, *measured* by `scripts/ui-contrast.mjs` | `.dp-sheet`: `--dp-sheet` flat + `backdrop-filter: blur(18px) saturate(1.05)`. **Must touch at least one frame edge** so it can never read as a floating card; the cut (`--dp-cut-sheet`) on its one free corner. No border, no inner rule, no head bar. One per screen. This is the amendment to ONE_PHOTOGRAPH §4.1: *a floating card is dead; a sheet on a frame edge is the surface.* | — | forced-colors: `Canvas`; no backdrop support: `rgb(8 9 12 / .90)` flat |
| **Mark** (`dp-mark`, 44 SVGs) | **Flat two-tone.** Body `currentColor` (ink, or the faction colour where that rule already applies); accent path `--dp-lamp-now`. Glow when lit comes from **one SVG `<filter id="dp-bloom">`** (`feGaussianBlur` + merge) defined once in `assets/ui/kit/marks/_sprite.svg` and referenced by `.dp-mark--lit .accent { filter: url(#dp-bloom) }` — one sprite edit, not 44 files. | — | lit: body `--dp-ink`, accent hot + bloom |
| **Icon** (263 kit icons) | Flat `currentColor`, 24/32/48 only, never scaled between sizes. | — | — |

`dp-attend`, `dp-veil`, `dp-lit`, `dp-phos`/`dp-figure` remain the spine.

### 9.2 The asset plan — ranked by visible return per hour

| # | Asset | Made how | Size (never upsampled) | Return | Hours |
|---|---|---|---|---|---|
| 1 | **Three starter hulls, hero view** (Hitch, Pelican, Wasp) | Blender via MCP: ¾ front-left, the world's key (warm top-left, cold rim right), transparent RGBA, Cycles 256 samples + denoise. **Resolve which GLB is the Hitch first** — the HUD calls the starter KESTREL, `find` shows `pelican_production_v1`/`wasp_production_v1` and no `hitch` folder; follow the hull id → GLB binding in the render track, do not assume. | 2400×1350 PNG (2× a 1200×675 slot) → `assets/ui/renders/hulls/<id>.hero@2x.png` + `manifest.json` with `cssWidth` | new-game lineup, save/load, game-over, codex ship entries | 1.5 |
| 2 | **Hull side elevations + mount JSON** | Same scene, orthographic side camera; export each socket Empty's screen-space UV to `<id>.mounts.json` `{ socket: [u, v] }` (sockets exist in `partsLibrary.js` / `kestrelHero.js`) | 2400×900 @2× | the shipworks jig | 1 |
| 3 | **Faction crests at scale** | 14 vectors exist; wire flat per §1 | SVG at 96/240 | factions wall, contracts, station head | 0.5 |
| 4 | **Commodity category pictograms** (8: raw ore, refined, industry, civilian, salvage, military, restricted, in-hold) | Hand-authored SVG, 2px stroke on a 48 grid, `currentColor` | 24/48 | market rows, hold | 1 |
| 5 | **Save thumbnails** | Not authored: capture the live canvas at save (`toDataURL` JPEG q.82) | 640×360 stored, shown at 320×180 | save/load strip; the empty preview frame becomes a real still | 1 (code) |
| 6 | **Ordnance / module art** | Kit icons at 48 now; renders of `assets/ships/release/parts/*` GLBs later, same scene | 48 now; 512 @2× later | shipworks slots, flight ordnance dock | 0.5 / 3 |
| 7 | **Difficulty insignia** | 4 SVGs exist; wire at 48px | SVG | new-game | 0.2 |
| 8 | **Codex illustrations** | Multi-session; every entry gets its system mark at 140px meanwhile | — | codex | plan |

The bar's portrait is a photograph while everything else is rendered; consistency is a separate
decision — noted, out of scope.

**The new-game black frame is not a missing image.** `stageHull.js` mounts a *live* WebGL stage
that renders black on the bench. Paint render #1 as the poster **first**; the live stage draws over
it when ready. Do not kill the stage; do not leave the bench black.

### 9.3 Per-screen signature instruments

#### First, the station shell — or six instruments sit in the same frame

Market, shipworks, industry, contracts, factions, bar and ledger look identical because the shell
is: an 80px title on a green rule, two onboarding rows, list / detail / the same credits card. So:

- **The credits card leaves every tab.** In the head band, right of the title (x≈1350–1880 is
  free at the title baseline): `18,400` as a `dp-figure` right-aligned at the title's cap height,
  and beneath it on the title's rule **four gauges in one row** (hull · fuel · hold · munitions:
  a 2px lamp fill on a `--dp-rule-hi` track with the reading beside it). REPAIR / RESUPPLY appear
  as ghost keys under the gauge that needs them, only when it does. The foot (tab rail · DOCKED ·
  COMMS · HELP · UNDOCK) is untouched. That frees the right 40% of the frame for each tab.
- The green title rule is a hue leak (§4.8) — gone; the title sits on 1px `--dp-rule`.
- The two onboarding rows collapse to one line of light with a lamp bead (§4.7).

#### The instruments

| Screen | The one signature instrument | What the player does with it | Composition (why it differs from its neighbours) | When |
|---|---|---|---|---|
| **Market** | **The quote**: the real price history from `economy.js` `entry.history` on a `<canvas>` at devicePixelRatio — 2px phosphor trace, galactic average a 1px dashed `--dp-phos-dim` rule, station buy/sell as two lamp ticks on the right axis | Hover: a vertical hairline crosshair with the price at that time riding it as a phosphor numeral. **Quantity is drag-to-scrub**: press-drag horizontally on the quantity numeral (or arrow keys) runs 0→max with the total rolling live; the affordability limit is a lamp tick on the scrub rail. BUY/SELL is one primary whose word follows the mode segment. | The board is the one sheet on the left edge, 47 rows. The quote is light in the centre with **no surface**. The console is a foot band; the clipped Buy/Sell/Average/Demand row becomes four readouts inside it. The seven-line paragraph → one line, number and cause (§4.6). | **this session** |
| **Shipworks / THE SHIP** | **The jig**: the side elevation at 2× centred (~60% of frame width), each socket a lamp bead at its `mounts.json` UV, a 2px light leader from bead to slot row on the right | Hover a row *or* a bead: leader and bead go hot; stat deltas print beside the readouts (`+12` lamp, `−4` danger). Click: compatible hardware opens as rows beneath. THE SHIP keeps drag-to-orbit on the live stage; the render is its poster. | The hull owns the centre; MASS/ENERGY/SHIELD… become one phosphor strip *under* it. 439 / +12/S / STOWED stay as the display moment. The text schematic and dotted connectors are deleted. | **this session** |
| **New game** | **The lineup**: three hero renders side by side *are* the segmented choice | Click/arrow between hulls; the chosen one lights (cut edge, name in ink), the others hold at `--dp-ink-mute`; its four numbers print under it as phosphor and **roll** on change. Difficulty: the four insignia at 48px. Seed: a phosphor odometer, NEW SEED a ghost key. | A horizontal band, not a left-hand form. LAUNCH bottom-right, the only lamp. | **this session** |
| **Settings** | **Live preview**: the world behind the screen *is* the preview | Exposure, bloom, DoF change the stage live under the sheet (`_set(ctx,'video',key,v,persist)` already applies `bloomStrength` live — verify the stage behind settings answers the same path in one grep before building; if it does not, demote to next and ship the slider only); audio sliders play the channel's sample on release. | A narrow sheet on the left edge (`--dp-sheet-w`); the rest is the world. No plate, no faders. | **this session** |
| **Chart** | **The map is the screen** (ONE_PHOTOGRAPH §3) | Hover any mark: crosshair + distance/ETA riding the cursor; click selects; double-click lays a course. Lenses become one row of words on a rail across the top. The nine-tab detail appears **only on selection**, as the one sheet on the right edge. | Kill the LENSES sheet and the empty CARGO DECK band. The clipped POSITION/TRACKING readout becomes a foot band across the frame. | **this session** |
| **Tech tree** | **Traces of light**: the tree as SVG — nodes printed fields with the cut, edges 1px `--dp-rule-hi` | Hover a node: the path back to the root lights 2px lamp with bloom; unlocking runs the light along the trace (`stroke-dashoffset`, `--dp-d-settle`; reduced motion: cut). Cost is a phosphor numeral in the node; researched nodes keep the cut edge lit. | The tree fills and pans the frame; the detail sheet on the right edge only on selection. | **this session** |
| Contracts | Postings as printed sheets, faction crest at 96px, pay as the display numeral | Hover: the route draws on an inline mini-chart; ACCEPT is the lamp | A grid of postings, not a list | next |
| Industry | The flow: inputs → plant → output, three columns joined by lit traces carrying the rate | Hover a trace: units/run and time; START RUN is the lamp | Horizontal flow | next |
| Factions | The crest wall: 14 at 96px, selected at 240px; the standing ladder as a **lit gauge** (vertical rail, tiers as ticks, standing as the lamp bead) | Hover a tier: what it unlocks | Wall left, gauge centre | next |
| Ledger | The credits odometer at hero size; entries as a printed tape | Hover an entry: the cause | Tape | next |
| Crucible draft | The rack: choices as printed fields with the mode/arena mark at 140px | Hover: mark lights, modifiers print | Three cards across | next |
| Save/load | A strip of lit stills (#5) | Hover: hull, sector, time | Horizontal strip | next |
| Flight HUD | P5 canvas half — plan and fences unchanged | — | — | **multi-session, plan exists** |
| Codex | A light table of illustrated entries | — | — | **multi-session — write the plan** (needs #8) |

Pause is done; title needs only the logotype swap in §1. Otherwise do not touch them.

### 9.4 Knock-down list — delete, do not restyle

- `src/ui/deckplate/hardware.js` — the whole file. Any *layout* it owned moves to `layout.js`.
- `src/ui/deckplate/materials.js` — `dp-rivets`, every plate bevel; keep flat-fill helpers only.
- `src/ui/deckplate/paint/plate-worklet.js` and the `paint.js` registration of `dp-plate`.
- `KEY_LED_*` and the brushed layer under every key style in `src/ui/deckplate/screens.js`.
- `assets/ui/deckplate/tex/*.png`, `assets/ui/deckplate/hw/*.svg` — off the runtime path. The raster
  folders `assets/ui/kit/assets/{keys,plates,windows,tapes,tiles,strips,wear,sockets,gauges,lights,badges,controls,radar}/`
  stay on disk as reference only; nothing may reference them.
- `assets/ui/kit/kit/fh.css` first-dock injection — why seven screens render differently before
  and after a dock. Fold survivors into Deckplate; delete the injection.
- The station credits card, the green title rule, the two onboarding rows.
- The shipworks text schematic; the "Take it to the range · Record · Select a slot" foot until
  those verbs show an outcome under `--walk`.
- The market "Stable demand" box, the paragraph, the FEWER/MORE/MAX chips.
- The settings plate, fader caps and detents.
- The new-game empty frame; the codex placeholder glyph; the save/load empty preview frame; the
  achievements LOCKED chips (an unearned achievement is its mark, unlit).
- The chart's LENSES sheet, CARGO DECK band, and nine-tab sheet at rest.
- `dp-mark`'s three `drop-shadow` filters; `light.js`'s blurred black text-shadows.
- Every `inset` box-shadow, black outer box-shadow, and non-transparent gradient — by the guard.

The grammar checks (`ui-grammar-surfaces.mjs`, `ui-grammar-thresholds.mjs`,
`check-ui-grammar-matrix.mjs`) measure floors — 12px, DOM count, frame cost, data states — and
require no hardware class; nothing there fights this. Inspect the kit's coverage test under
`assets/ui/kit/tools/` (ONE_PHOTOGRAPH §7.0 says it was inverted once) and delete it if it still
counts raster materials.

### 9.5 Guard rules — a test the next agent cannot argue with

Scope `src/ui/**` and `styles/**`. Add as `scripts/check-ui-printed.mjs`, wired into
`check:baseline`; case-insensitive regexes.

**The ratchet.** Legacy sheets (`kit.css`, `ui.css`, `station.css`, `hudStyles.js`, ~12k lines)
are aliased-while-in-flight per THE_BAR §1, not deleted today, so a hard guard is red on day one
and gets disabled. Commit `scripts/ui-printed-baseline.json` — per-file violation counts per rule
— and fail only when any file's count **rises** or a file absent from the baseline has a count
above zero. Files on the §4 knock-down list must be absent from the tree. Deckplate files start at
zero.

1. **No inset.** `box-shadow\s*:[^;]*\binset\b`.
2. **Outer shadows are light.** Every `box-shadow` colour must be `rgb((242 185 80|255 217 140|255 226 178|150 210 255|255 80 56)\b` or a `--dp-(lamp|phos|danger)` token; `rgb\(0 0 0`, `#000`, or a grey hex in a `box-shadow` fails.
3. **Gradients fall off.** Every `(linear|radial|conic)-gradient\(` must contain `transparent` or `/ 0)`. No exemptions — the wordmark's ramp lives in its SVG.
4. **No stripes, lenses, paint.** `repeating-(linear|radial)-gradient`, `paint\(`, `border-image`, `radial-gradient\(circle at`.
5. **No CSS drop-shadow.** `drop-shadow\(` fails; SVG `<filter>` via `filter: url(#…)` is the glow path.
6. **Text shadows.** `text-shadow` may contain black only as `var(--dp-text-legible)` or the literal `0 1px 0 rgb(0 0 0 / .5)`; any other `rgb\(0 0 0` in a `text-shadow` fails.
7. **Images are objects.** `url\(` allowed only for `#` fragments, `data:image/svg`, or paths under `/assets/ui/kit/icons/`, `/assets/ui/kit/marks/`, `/assets/ui/renders/`; any other `url(` in `background`, `mask`, `border-image` fails.
8. **Raster scale.** Every file under `assets/ui/renders/` must be in `manifest.json` with `cssWidth`, and pixel width ≥ 2 × `cssWidth`.
9. **Backdrop-filter.** Only in a rule whose selector contains `.dp-sheet`; absent from the five flight files named in §1. The bench counts `.dp-sheet` elements per surface: more than one fails.
10. **Dead tokens and classes.** `--dp-(cap|well|stock|pane|plate|channel|tex|glass|rivet|key-sweep|key-pool|mark-face|mark-shadow|etch-shadow)\b`, `dp-(rivets|bezel|keycap|placard|hw-)`.
11. **Fonts.** `monospace|Spline Sans Mono`.
12. **Hue.** Any `#[0-9a-f]{3,8}\b` or `rgb\(` literal in `src/ui/**` outside `src/ui/deckplate/tokens.js` fails. Faction colours enter only through the existing runtime read of `src/data/palettes.js`, which is outside the scan. Greens die by construction.
13. **Existing floors stay:** `check-type-floor` (12px), `check-wcag-contrast` and `scripts/ui-contrast.mjs` (AA on composited pixels — the sheet at .78 over the bright hangar wall is *measured*; bloom does not count), reduced-motion on every transition, forced-colours on every primitive.

Ship the guard and the baseline in the same commit as the knock-down, or the screws come back.
