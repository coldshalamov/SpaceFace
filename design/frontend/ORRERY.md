<!-- LIFETIME: ACTIVE_PROGRAM -->
# ORRERY — the SpaceFace interface, all the way through

**Status: THE frontend authority from 2026-09-22 (late).** Owner, verbatim, the same evening:

> *"it should be based on modern game HUDs in 2026 … they almost never use anything recognizably
> css, they custom make a lot of SVG assets, they create a work of art out of the frontend of their
> game and use advanced objects and not just the same boring cards, tables, borders … It needs to
> have a number of advanced 'Magic UI' type elements used and the UI needs to feel CLEAN and
> EXPENSIVE … it has to be maximally clean with cool effects and scroll animations and crazy
> unfolding and spinning elements, it has to feel like you're in some control cockpit in the future,
> it can't read like basic web design … make a plan all the way through … and execute the plan."*

This document is that plan. It replaces the per-screen restyle loop (Field Hardware → Deckplate →
One Photograph → Printed and Lit), which kept producing a better-painted version of the same boxes.
What survives from those programs is listed in §11; everything else here outranks them.

---

## 1. The idea in one paragraph

SpaceFace is a game about **mass, momentum and orbit** — you fling rocks, swing ships on a tether,
and trade across a belt that turns. So the interface is an **orrery**: a working astronomical
instrument made entirely of **light**. Every screen is an instrument that powers up when you arrive:
rings draw themselves and spin to rest with real inertia, a single amber **Hand** swings to whatever
you have chosen, scales tick in, telemetry decrypts, numbers roll like mechanical counters and
settle. Nothing is a box. Information sits on **rings, arcs, scales and leader lines** floating over
deep glass; objects are **produced art** (rendered hulls, painted stations, cut crests). It should
feel like the flight deck of a ship that was designed by people who care — clean, expensive, alive,
and impossible to mistake for a web page.

**The signature:** *the Hand.* One amber orrery arm, the only warm light in any screen, that points
at your current choice and swings (spring, overshoot, settle) when the choice changes. The title
menu, pause, the station's services, the crucible mode dial, the radial menus, the new-game hull
carousel — the Hand is how SpaceFace says "this one". Players will remember it.

## 2. What we are measured against

The bar is a screenshot that could sit beside these without embarrassment:

| Reference | What we take | What we do not take |
|---|---|---|
| **Armored Core VI** (garage, HUD) | Thin, bright vector lines; parts assembling on screen with mechanical motion; huge thin numerals; angled leader lines | Its grey-on-grey monotony |
| **Death Stranding 2** | Holographic calm; lines of light as the only material; elegant reveals; generous negative space | First-person framing |
| **Arknights: Endfield** | Industrial precision; technical scales and callouts; ruthless grid discipline; everything labelled like equipment | Square bordered panels |
| **Destiny 2 / Marathon** (Bungie) | Typographic confidence — a few fonts at dramatic scale contrast; cursor-driven light; kinetic graphic design | Marathon's "fontslop" noise — we keep ONE display voice |
| **Zenless Zone Zero / Metaphor: ReFantazio** | Menus as choreography: every transition authored, nothing just "appears" | Comic-sticker tone |
| **Helldivers 2** | Radial/stratagem input as a physical ritual; diegetic confirmation | Military terminal skin |
| **Elite Dangerous / EVE Photon** | Density that stays readable; orbital maps that feel like instruments | Orange-on-black wall of text |

The owner's standing rejections stay rejected (they are why earlier passes failed): **cyan wireframe
boxes; uppercase monospace labels with heavy tracking; cramped floating panels with the scene
bleeding round them; shadcn/neutral "cards"; any CSS impersonation of a material (bevels, brushed
metal, LED lenses, screws); first-person visor/windshield framing (screen-edge arcs around the
viewport, helmet avatars).** Rings and arcs in ORRERY are always *instruments anchored to content*
(a hull, a target, a menu, the radar) — never a frame around the player's view.

## 3. The language

### 3.1 Light is the only material
- **Lines** are emitted, not printed: a 1 px core (1.5 px when active, 3 px for gauge fills) plus a
  bloom. Crisp at any DPI (SVG, `vector-effect: non-scaling-stroke`). **The bloom is geometry, not a
  filter:** a second, wider stroke of the same path (4–6 px, 18–30 % alpha) drawn under the core.
  A live CSS/SVG `filter` (blur, drop-shadow) is allowed on menus over a paused world and **never in
  flight** — on the owner's iGPU a per-frame filter on HUD vectors would spend the whole HUD budget.
- **Glass** is the only surface: a deep tint (`--dp-glass`) with `backdrop-filter: blur(18px)
  saturate(1.15)` **only where the world behind is paused or static**, edges dissolved by a gradient
  mask. **Glass never has a border.** Its edge is implied by corner ticks, a scale, or nothing.
- **Depth** comes from parallax (3 layers: far ring field, instrument plane, near callouts) and from
  depth-of-field — when a menu opens over the world, the world scales to 0.985, blurs and dims.

### 3.2 Geometry: circles, arcs and scales
- Anything that shows *a quantity* is an **arc** (gauges, cooldowns, standing, progress, timers).
- Anything that shows *a set of choices* sits on a **ring or arc rail** when there are ≤ 9 of them,
  on a **ladder** (a vertical scale with tick marks, items hanging off it) when there are more.
- Anything that shows *a relationship* is a **beam**: a line of light between two things, with a
  travelling pulse showing direction (routes, dependencies, cargo flow, a contract's origin → berth).
- Anything that labels *a point on an object* is a **leader line** with an elbow at 45°, laid out by a
  collision-free solver (labels never touch dots, connectors or each other).
- Straight edges appear only as **scales** (rulers with ticks) and the owner's **45° cut** on the one
  primary key (§3.6). No rectangles with borders, anywhere, ever. Tables become ladders or
  instruments; a genuinely tabular screen (the market exchange) uses a borderless ladder table with
  a light cursor and pictograms.

### 3.3 Colour: warm light, one hand, one alarm
ORRERY adds to the **Deckplate token root** (`--dp-*`); it does not start a fifth token system.
Existing Deckplate tokens are reused wherever they already mean the right thing.

| Token | Value | Meaning — and the only meaning |
|---|---|---|
| `--dp-void` (new) | `#05070A` | the space behind the instrument |
| `--dp-glass` (new) | `rgb(8 11 16 / .62)` | the instrument's glass |
| `--dp-ink` / `-dim` / `-mute` (existing) | `#E8E2D4` / `#B7B4A6` / `#B0AEA6` | words; **and the rest-state light of every ring, scale and rule** (at 14–40 % alpha) |
| `--dp-phos` (existing) | `#DFEEFF` | readings — the numbers the world tells you |
| `--dp-ice` (new) | `#8FCBFF` | **data in motion only**: a beam's travelling pulse, the lattice's event ripple, a route being computed. Never a structural line, never a ring at rest, never a box. |
| `--dp-lamp` / `-hot` / `-dim` (existing) — alias `--dp-hand` | `#F2B950` / `#FFD98C` / `#8A6B3A` | **the Hand**: yours, chosen, actionable. At most one amber *thing* leads each screen |
| `--dp-danger` (existing) | `#FF5038` | **threat only**: hostile, incoming, loss, irreversible |

**Why the rest light is warm bone, not blue.** The owner's recorded rejection is "hard cyan
wireframe on black reads as generic AI sci-fi". Blue hairlines at rest would be that look however
beautifully they move. ORRERY's instrument light is the warm white of the station practicals the
3D world is lit by; the cold note appears only when information is *moving*. The Phase 0 direction
proof (§7) shoots the composed screen both ways once before the library commits — bone-at-rest is
the default, and blue-at-rest only wins if the critic scores it clearly higher and it does not read
as the rejected look.

The critics' 2026-09-18 note (amber was spent on everything, so danger had no channel) is resolved
by decree: red is reserved for threat; amber for the Hand and the one primary verb; bone carries all
ambient instrument light.

### 3.4 Type
Three faces already vendored (offline-safe): **Archivo** (variable width 62–125, weight 100–900),
**Instrument Sans**, **Spline Sans Mono**.
- **Display:** Archivo, width 125, weight 800, tight tracking (−0.01em). Screen titles, hero words.
- **Numerals:** Archivo, width 100, **weight 250**, tabular, at hero sizes (64–144 px). Thin, huge,
  bright numerals are the single most "expensive" typographic signal in modern HUDs.
- **Labels:** Archivo, width 112, weight 600, caps, tracking .10em, 11–12 px, `--dp-ink-dim`.
  (Not monospace. The owner rejected mono labels.)
- **Body:** Instrument Sans 400/500, 14–17 px, line-height 1.45, `--dp-ink`.
- **Codes only** (seeds, build codes, share codes): Spline Sans Mono.
Scale contrast is the tool: a screen pairs one 96 px thin numeral with 12 px labels, not five
medium sizes.

### 3.5 Motion has mass
SpaceFace is a physics game, so its interface moves like objects with mass — springs, never
easing curves on transforms.
| Preset | Spring (stiffness / damping, mass 1) | Use |
|---|---|---|
| **swing** | 170 / 16 (slight overshoot) | the Hand, radial selection, carousels |
| **settle** | 260 / 28 (no overshoot) | panels arriving, rings coming to rest |
| **snap** | 420 / 38 | focus, hover, press feedback |
| **drift** | linear 0.4°/s | idle rotation of outer rings |
Arrival choreography (every screen): **0 ms** glass fades in + world DOF → **60 ms** rings draw
(stroke-dashoffset, 420 ms) and spin in from −30° with *settle* → **180 ms** scales tick in (28 ms
stagger) → **240 ms** labels decrypt (220 ms) → **300 ms** numerals roll to value → **360 ms** the
Hand swings to the current choice. Leaving is the reverse in 180 ms. **Reduced motion:** every
state is reached instantly; drift and beams stop; decrypt and rolls resolve at once. This is a hard
gate, not a nicety (existing `motionReduce` + the OS hint, asked once — PQ-210.07).

### 3.6 The one primary verb
The owner's lamp survives as ORRERY's only filled shape: the **Lamp Key** — amber field, dark ink,
one 45° cut top-right, a slow sheen that crosses it every 6 s, a ripple ring on press, and for an
irreversible verb a **hold ring** (press and hold; an arc fills round the key; release early to
cancel). One Lamp Key per screen at most.

## 4. The ORRERY library — the showpiece elements

The 2020s interface vocabulary (Magic UI, Aceternity, React Bits, Motion Primitives, and the game
interfaces in §2) translated into instruments. **Every element exists once, in the library, with a
showcase entry. Screens compose; screens never hand-roll chrome.** That rule is what stops the drift.

| # | Element | Web/game lineage | In SpaceFace it is… | Used on |
|---|---|---|---|---|
| 1 | **Orbit Ring** | Orbiting Circles, Spinning Text | concentric rings with tick scales, circular type and slow drift | title emblem, lock ring, radar, station hub, loading |
| 2 | **The Hand** | radial selectors, AC6 | the amber arm that swings (spring) to the current choice | every ring/arc menu |
| 3 | **Arc Gauge** | Animated Circular Progress | a quantity as an arc with a ghost delta and a bloom head | hull/shield/heat/energy, cooldowns, standing, timers |
| 4 | **Decrypt Text** | HyperText / Decrypted Text | telemetry resolving: glyph noise settles into the word | every label on arrival, changed values, undiscovered codex |
| 5 | **Counter** | Number Ticker | per-digit rolling columns that settle with *settle* | credits, prices, score, damage, distance |
| 6 | **Beam** | Animated Beam, Tracing Beam | a line of light between two anchors with a travelling pulse | routes, tech links, contract flow, cargo, tethers |
| 7 | **Leader Callout** | AC6 part callouts | elbowed leader + label, placed by a collision-free solver | shipworks jig, codex plates, hull hotspots, tutorials |
| 8 | **Scale** | Endfield rulers | a ruled line with major/minor ticks and floating value cursor | speed tape, sliders, timelines, ladders |
| 9 | **Ladder** | list → instrument | a vertical scale; items hang off ticks; a light cursor rides it | long lists: commodities, contracts, codex, saves |
| 10 | **Lamp Key** | Shimmer / Shine / Ripple button | the one primary verb: amber, 45° cut, sheen, ripple, optional hold ring | one per screen |
| 11 | **Hold Ring** | Destiny hold-to-confirm | an arc fills round a key while held | undock with risk, sell ship, abandon run, overwrite save |
| 12 | **Glass** | Glassmorphism done right, Progressive Blur | borderless tinted blur, edges dissolved progressively | behind text over the world |
| 13 | **Spotlight** | Magic Card, Spotlight | the cursor carries a soft inspection light across glass and rings | all menus (off under reduced motion) |
| 14 | **Sensor Lattice** | Flickering Grid, Interactive Dot Pattern | a canvas dot field that brightens around the cursor and pulses on events | chart, codex, tech tree, loading |
| 15 | **Perspective Floor** | Retro Grid | a lit receding grid floor with a horizon glow | crucible door, results, sandbox |
| 16 | **Light Rays** | Aurora, Light Rays | volumetric rays behind a hero element | title, game over, results |
| 17 | **Drift Field** | Particles, Meteors, Hyperspeed | slow particles; streak on launch/jump | title, loading, launch transition |
| 18 | **Radial Menu** | Helldivers stratagems, pie menus | segments on a ring, the Hand, keys/sticks map to angles | comms, wingman, ordnance quick-pick, pause |
| 19 | **Orbit Carousel** | 3D carousel, Focus Cards | items ride an elliptical orbit; the chosen one comes forward, others recede and dim | new-game hulls, crucible builds, shipworks modules |
| 20 | **Tilt Plate** | 3D Card Effect | produced art tilts toward the cursor with a moving sheen | hulls, portraits, crests, arena art |
| 21 | **Dock Rail** | macOS Dock magnification | service glyphs on a curved rail that magnify under the cursor | station services |
| 22 | **Ticker Tape** | Marquee | an endless tape of news/comms on a scale line | market news, comms tape, ledger |
| 23 | **Lens** | Lens / Magnifier | a circular magnifier of the chart under the cursor | chart, tech tree |
| 24 | **Unfold** | Box Reveal, Blur-in, dialog morph | panels unfold from the element that summoned them (origin-aware) | tooltips, dossiers, confirmations |
| 25 | **Stagger** | Animated List, Blur Fade | lists arrive item by item, blur → sharp | every list |
| 26 | **Scroll Reveal** | Text Reveal, Scroll Progress | long text resolves line by line as it scrolls; a progress arc | codex, briefings, credits |
| 27 | **Morph Word** | Morphing Text, Word Rotate | a word that morphs between states | BUY↔SELL, SWARM↔GAUNTLET, mode names |
| 28 | **Signal Toasts** | Animated List, Sonner | notifications stack on a rail with spring and decay arcs | toasts, alerts |
| 29 | **Threat Channel** | damage indicators, chromatic hit | red arcs round the ship toward hostiles, edge chevrons off-screen, a brief red split on hit | flight, crucible |
| 30 | **Waveform** | audio visualiser | voice bars on comms, breathing with the line | comms, bar |
| 31 | **Exploded Schematic** | AC6 assembly | a rendered hull with parts that slide out on selection, leader-labelled | shipworks, my ship |
| 32 | **Reticle Cursor** | Smooth Cursor | a small ringed cursor with lag, snaps to targets | all menus (system cursor kept under reduced motion / on request) |
| 33 | **Salvage Burst** | Confetti, Cool Mode | shards burst along an arc on a reward, then fall into the counter | purchase, payout, level-up, record |
| 34 | **Warp Transition** | Warp Background | the instrument folds into a point and the world streaks in | menu → flight, jump |

**Engineering shape** (`src/ui/orrery/`):
- `tokens.js` — the few new §3 tokens (`--dp-void`, `--dp-glass`, `--dp-ice`, `--dp-hand`,
  `--dp-bloom-*`, motion and geometry constants) **added to the Deckplate root**; no fifth token
  system — the 2026-09-22 unification holds.
- `motion.js` — one spring solver, one rAF scheduler (budgeted, visibility-gated, paused when the
  screen is hidden or the tab is backgrounded), reduced-motion switch, WAAPI helpers, stagger.
- `svg.js` — generators: ring, arc, scale, leader, beam path, circular text; shared `<defs>` (bloom
  filter, beam gradient) injected once.
- `text.js` — decrypt, counter, typewriter, morph.
- `fx/` — lattice, floor, rays, drift: **one shared canvas per screen**, paused off-screen, never in
  flight except the threat channel.
- `components/` — the 34 elements as functions returning DOM with a `.dispose()`.
- `layout.js` — collision-free label solver (leader callouts, radar, chart labels).
- **Showcase:** `tools/orrery.html`, bench shot `orrery` — every element in rest / hover / active /
  disabled / reduced-motion. It is the visual contract and the first thing a reviewer opens.

## 5. The assets we produce

Real objects are produced art. Nothing below is drawn with CSS.

| Set | Count | How | Where it shows |
|---|---|---|---|
| **Hull renders** — hero, starboard side, top | 14 hulls × 3 = 42 | Blender 5.1 Cycles, the game's own GLBs, collision shell hidden (pipeline proven on the 3 starters, 2026-09-22) | new game, load, shipworks, my ship, hangar, for-sale |
| **Hull silhouettes** (top view) | 14 player + ~12 NPC classes | top render → alpha mask → SVG path (ImageMagick + tracer) | radar contacts, contact list, lock ring |
| **Station establishing art** | 32 stations | Codex image generation, one style bible prompt (16:9, cinematic concept, warm sodium practicals, dark space, no text) | station hub backdrop, chart inspector, contracts destination |
| **Faction crests** | 14 | Codex image generation, transparent, flat bone-white geometric marks (pipeline proven 2026-09-22); cleaned + exported @2x WebP and a mono SVG trace | factions crest wall, contacts, contracts, chart |
| **Crucible arena key art** | 5 | Codex generation, 21:9 | crucible door mode/arena carousel, loading |
| **Codex plates** | ~16 categories | Codex generation, one style bible | codex reader |
| **Mission type glyphs** | 17 | hand-authored SVG, the ORRERY icon hand (24 grid, 1.35 stroke) | contracts ladder, chart, log |
| **Station service glyphs** | 8 | hand-authored SVG | dock rail |
| **HUD ordnance / fieldwork / rig glyphs** | ~28 | redraw of the existing icon set in the ORRERY hand | ordnance arc, crucible |
| **Commodity pictograms** | 14 | hand-authored SVG — **done** 2026-09-22 | market, hold, cargo |
| **The emblem** | 1 | hand-authored SVG: the SpaceFace orrery mark (rings, the Hand, the logotype on a circular path) | title, loading, credits, favicon |
| **Contact portraits** | existing set | already produced | bar, comms roundel |
| **Save thumbnails** | runtime | the renderer captures a frame on save | save/load filmstrip |

Every generated image is kept with its prompt, seed/model and date in a manifest beside it
(`assets/ui/generated/<set>/manifest.json`), sized for display at 2×, WebP.

## 6. Every screen

Each screen has a **hero instrument** — the thing its screenshot is remembered by — so screens share
a grammar without looking alike.

### Flight (always on)
- **The Cluster** (bottom-left, one instrument, replacing ~8 boxes): the hull's top silhouette at
  the centre of a ring stack — shield (outer), armour, hull (inner) as Arc Gauges; energy and heat as
  two opposed arcs; speed as a 96 px thin numeral on a curved Scale with the reference tick; boost
  as a charge arc.
- **Ordnance Arc**: the weapon/fieldwork/rig keys ride an arc hugging the Cluster's right side,
  each with its cooldown arc and key hint; the armed one lit by the Hand.
- **Objective**: a compass tape top-centre with the objective's bearing marker and a Counter for
  distance.
- **Radar Orrery** (bottom-right): range rings, a sweep, contacts as class silhouettes, the Hand
  pointing at the objective bearing.
- **Lock Ring**: world-space rings round the target (rotating ticks, distance Counter, lead pip).
- **Threat Channel**: red arcs round your hull toward hostiles; red chevrons at the screen edge for
  off-screen ones; a 90 ms red split on hit.
- **Encounter decisions** unfold as a Radial Menu near the Cluster with a countdown arc; keys 1–3.
- **Signal Toasts** on a right rail. Comms: portrait roundel + Waveform.
- Hard rule: the flight HUD adds ≤ 0.8 ms script per frame, writes DOM only on change, animates
  transforms/opacity only, no backdrop-filter over live flight.

### Title / main menu
The **Emblem** huge behind the logotype, drifting; Light Rays; Drift Field. The menu is an arc rail
to the right of the emblem; the Hand swings to the hovered item; each item decrypts on arrival.
Continue shows its save's hull render and a Counter of credits.

### Loading
The Emblem spins up; the load's real stages are ticks round the outer ring (never a timer); the
existing signal tableaux play inside the ring.

### Pause
World DOF; a compact Orbit Ring of verbs with the Hand; Resume is the Lamp Key.

### New game
The three starter hulls on an **Orbit Carousel** (hero renders, Tilt Plate); the chosen one's stats
as Arc Gauges round it; pilot name typed with Decrypt; difficulty as a four-stop dial with the Hand;
Launch is the Lamp Key → Warp Transition.

### Crucible door → draft/armory → refit → results
- Door: Perspective Floor, arena key art on an Orbit Carousel, mode as a dial with the Hand, starter
  builds as Focus-card orbit, seed as a mechanical Counter, Launch as Lamp Key with sheen.
- Armory: offers fanned as a hand of Tilt Plates on an arc; price Counters; buy = ripple + Salvage
  Burst into the purse.
- Refit: an Exploded Schematic of the run hull with hardpoint callouts.
- Results: Light Rays behind the round numeral; score Counter; build code Decrypt; the run told as a
  Tracing-Beam timeline; Run it again = Lamp Key.

### Station
- **Hub**: the station's establishing art as the world; the station name huge; services on an Orbit
  Ring round the name with the Hand; a Dock Rail along the bottom for direct travel between tabs;
  purse Counter; each tab arrives with a ring swing.
- **Market**: the price instrument (trace drawn as a Beam, crosshair Lens), commodities on a Ladder
  with pictograms, BUY↔SELL Morph Word, **quantity as a rotary dial of light you drag to spin**,
  total as a Counter, trade = Lamp Key → Salvage Burst.
- **Contracts**: a mini orrery with the route as a Beam from here to the berth, the ladder of offers,
  the dossier Unfolds with Decrypt; Accept = Lamp Key (Hold Ring when collateral is at risk).
- **Shipworks**: Exploded Schematic of the side render — select a slot and the part slides out with
  leader callouts; compatible modules on an Orbit Carousel; stat deltas as ghost arcs.
- **Bar**: the portrait as cinema (exists), dialogue typed, replies as focus plates, Waveform.
- **Factions**: the 14 crests on an Orbit Ring, standing as arcs from red (hostile) through bone to
  amber (allied), the chosen crest large on a Tilt Plate with its lore scroll-revealed.
- **Industry**: production chains as Beams between node glyphs, flow pulses showing throughput.
- **Ledger**: a Ticker Tape of transactions and Arc-gauge summaries.

### Chart
The galaxy as an orrery — sectors on orbital tracks (the ring can drift), jump lanes as Beams with
direction pulses, the Sensor Lattice behind, a Lens under the cursor, the route as an amber Beam, the
inspector Unfolds from the chosen body with its station art.

### Meta
- **Tech tree**: a constellation — nodes as stars, links as Beams; unlocking sweeps light down the
  link; the Lens.
- **Codex**: an archive — a Ladder index, plates with generated art, lore via Scroll Reveal,
  undiscovered entries Decrypt-scrambled.
- **Mission log**: a Tracing-Beam timeline.
- **Settings**: every change previews live in a miniature Cluster/HUD beside the list; sliders are
  Scales with a light cursor.
- **Save/Load**: a filmstrip of save thumbnails on a curved rail; facts Decrypt.
- **Achievements**: medal Arc Gauges on a ring grid.
- **Credits**: Scroll Reveal over the Drift Field.
- **Game over**: the world in slow motion, Light Rays cooled to red, the cause as a Decrypt line,
  restore = Lamp Key.
- **Radials** (comms, wingman): Radial Menu with the Hand.
- Remaining screens (drill/asteroid works, base, automation, replay, clips, sandbox, range,
  footprint) compose the same library in Phase 7.

## 7. Build order

Each phase ends only when its gates (§8) pass. Phases follow the demo path.

| Phase | Delivers | Why first |
|---|---|---|
| **0a Direction proof** | `src/ui/orrery/` core (tokens, motion, svg, text), the elements the flight HUD needs (Orbit Ring, the Hand, Arc Gauge, Counter, Decrypt Text, Scale, Radial Menu, Signal Toasts, Threat Channel, Lock Ring), the showcase page + bench shot, **and the composed flight HUD** — shot, critic-scored ≥ 8/10 against §2, bone-at-rest vs blue-at-rest decided on the real screen | a library no one has seen composed is how drift starts; the flight HUD is seen for the whole demo and is overlapping today |
| **0b Library complete** | the remaining elements (fx canvases, beams, carousel, tilt, dock rail, lens, scroll reveal, warp, bursts), the guard test | every later screen composes from it |
| **1 Flight HUD finish** | Objective tape, Radar Orrery, encounter radial, comms Waveform, crucible layer, perf + reduced-motion gates | the rest of flight |
| **2 First impression** | Emblem, title, loading, pause, new game (+ 42 hull renders) | the first 30 seconds |
| **3 Crucible** | door, armory, refit, results, crucible HUD layer (+ arena art) | the demo's first five minutes |
| **4 Station** | hub, market, contracts, shipworks, bar, factions, industry, ledger (+ 32 station arts, 14 crests, glyph sets) | the adventure half |
| **5 Chart** | orrery galaxy, local map, route beams, lens | routing |
| **6 Meta** | tech tree, codex (+ plates), mission log, settings, save/load, achievements, credits, game over, radials | completeness |
| **7 The rest** | drill, base, automation, replay, clips, sandbox, range, footprint, dialogs | no screen left in the old look |

Asset production runs in parallel with code from Phase 0 (it is mostly waiting on renders and
generations).

## 8. Gates — how a phase is "done"

1. **Bench shots** at 1920×1080 and 1366×768 (`node scripts/ui-bench.mjs --shot=<id>`), opened and
   looked at, plus a short motion capture of the arrival choreography for the hero instrument.
2. **Legibility**: `node scripts/ui-contrast.mjs` — every reading ≥ 4.5:1 on composited pixels.
3. **Every control works**: `--walk`; keyboard and gamepad reach everything; focus is visible.
4. **Critic** (from Phase 0a on): an independent agent scores the shots against §2's references on six axes — *clean,
   expensive, non-generic, coherent, alive, legible* — bar **8/10, no axis below 7**. Below bar means
   iterate on structure, not paint.
5. **Performance** on the owner's iGPU class: menus hold 60 fps; the flight HUD ≤ 0.8 ms/frame.
6. **Reduced motion**: every screen reaches every state instantly with motion off.
7. **Guard** (`test/ui-orrery-guard.test.mjs`, ratcheting): screen code may not declare borders,
   border-radius cards, box-shadow panels or raw `<table>` chrome outside `src/ui/orrery/`; every
   library element has a showcase entry; the no-material-imitation guard stays.

## 9. What must not happen again

- **Restyling boxes.** If a screen still has its old boxes after its phase, the phase is not done.
- **A second system.** ORRERY lives on the Deckplate token root; old kit/fh/orbital sheets are
  retired screen by screen as each screen moves, and deleted when nothing references them.
- **Effects without meaning.** Every element in §4 has an in-fiction job. A beam shows a real
  relationship; a counter rolls because the number changed; the Hand points at a real choice.
- **Effects that cost the game.** Motion is budgeted; FX canvases pause off-screen; flight gets no
  menu FX.
- **Relaying a lane's "done".** Every agent's output is re-shot and looked at by the lead.

## 10. Execution notes

- Screens keep their controllers, data and bindings; ORRERY replaces their view templates and
  styles. Tests that pin behaviour stay; tests that pin old markup are updated to the new contract in
  the same commit, with the reason.
- Parallel work: once Phase 0 lands, screen phases can run as separate agents, one screen family
  each, composing only library elements; the lead reviews every shot.
- Codex image generation: `codex exec -m gpt-5.5 -c model_reasoning_effort=low --skip-git-repo-check
  -s workspace-write "<prompt> … save as <file>"` in an asset folder; transparent backgrounds work
  (proven 2026-09-22). Generate in grids when a set must match, then cut.
- Hull renders: the headless Blender script (session scratch `render_hull.py`, to be moved to
  `tools/renders/render_hull.py`) — hero/side/top, collision shells hidden, marks projected.

## 11. What survives from earlier programs

**What the last program got wrong, so no one repeats it.** "Printed and lit" (2026-09-22) read the
owner's "no CSS pretending to be materials" as "flat and thin": it stripped fills, bevels *and*
detail until the owner said the detail was disappearing and quality was going backwards. No fake
materials is not the same as flat. ORRERY's depth comes from **light, glass, parallax, motion and
produced art** — richer than before, never plainer.

- The owner law **no CSS material imitation** (2026-09-22) and its guard.
- The **Deckplate token root** as the one token system (ORRERY extends it).
- The **Lamp Key** (amber, dark ink, 45° cut) as the one primary verb.
- **Produced art for objects**: hull renders, portraits, commodity pictograms already made.
- The **bench** (`ui-bench`), **contrast** (`ui-contrast`) and **walk** tooling.
- The demo defect ledger (`design/program/DEMO_READINESS_2026-09-20.md` §6) — rows on screens that
  ORRERY rebuilds close when the rebuilt screen passes its gates.
