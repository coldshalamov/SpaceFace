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

> **Everything on the screen is either the machine or the light it throws.**

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

1. **The panel.** Any rectangle of darkening with a visible inner edge over the world. *Can you
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

**P4 — Computed metal, for mass only, calibrated.** The worklet paints mounts, never light.
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
3. **The flight layer as light** (P5) — the owner's most specific complaint, twice stated.
4. **Factions** (P7) — a day's work, the largest visible jump per hour in the game.
5. **Undock** (§6), once 2 and 3 exist.
6. **Pause** (the chip grid becomes one rail of light), then the grade per family (P8), then the
   rest by weight.

---

## 8. What to protect

Named by both directors, and not to be knocked down while the rest is:

the stencil **wordmark**; the **title composition** (ship on rock, engine glow, planet as
counterweight); the **big bone numerals**, which are the middle of the type ramp; the **INTEGRITY
hull-silhouette dial**, the only drawn instrument in the game and the seed of P5; the **settings
sliders** (track, ticks, fill, thumb — the one physical control); the **round compass**;
**Crucible's nerve** (oversized title, red heat, the seed housing); the **station right rail's
idea** (one big number, four bars, two actions); the **faction colour rule**, the only place faction
identity enters the UI; the **chart header**, which titles the chart by where you are; and **the copy
voice** — *"One hull, one contract, the whole sky"*, *"Mass on accept: 12.4t. Authorization:
VALE, D."* — rated the product's second-best asset after the 3D, and currently better than the
layout it sits in.
