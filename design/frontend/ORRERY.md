<!-- LIFETIME: ACTIVE_PROGRAM -->
# ORRERY — the SpaceFace interface, all the way through

**Historical direction (2026-09-22, late; amended 2026-10-30).** The original brief asked for a clean,
distinctive, futuristic cockpit interface, authored art, and expressive motion. Its dislike of generic
web styling records an aesthetic preference; it is not a ban on CSS, cards, tables, borders, framed
controls, or keycaps.

This document preserves the original visual direction and screen-by-screen ideas. The 2026-10-30
owner amendment below supersedes its retired recipes; current Finish assignments and player-facing
requirements govern implementation. The earlier Field Hardware → Deckplate → One Photograph →
Printed and Lit sequence is historical context, not a competing workflow.

> ### AMENDMENT 2026-10-30 (owner) — "less sloppy, more organized": read this before §2–§4
>
> Owner, same day, reviewing the live station (Bar, Market): the screens read as *a bunch of random
> elements slapped together* — no borders, monochrome buttons, arcs everywhere, tiny tracked
> low-resolution caps, truncated and lopsided text, and a credits figure that does not look like a
> money amount. Several of ORRERY's absolutes below produced exactly that, and they are **retired**.
> Where this block and a later section disagree, **this block wins**. The current visual guidance and
> review prompts are in [`STATION_STANDARD.md`](./STATION_STANDARD.md). Its examples are starting points;
> screen purpose, readable content, usable controls, and accessibility take priority over a recipe.
>
> | Earlier overreach | Current direction |
> |---|---|
> | Surface edges and framed controls | Hairlines, borders, cards, keycaps, and ruled panels are valid when they group content or make controls clear. Fake *materials* (bevels, brushed metal, screws, LED lenses) remain distinct from simple structure. |
> | One shape for quantities or choices | Bars, figures, steppers, lists, or arcs can fit different content. Reserve a ring for cases where its shape helps explain the value or interaction. |
> | One layout for actions and data | Use a table for genuinely tabular information and controls that look and behave pressable. Choose the layout and button hierarchy that make the screen's actions clear. |
> | Labels: caps, 12 px, tracking .10–.18em, `wdth` 62–112 (§3.4) | Prefer legible sentence-case labels, modest tracking, and type sizes suited to the viewport. Keep the 12 px floor enforced by `check-type-floor.mjs`; accessibility and actual readability govern above that floor. |
> | One thin hero numeral, Archivo 250 (§3.4) | Format money and quantities so units and magnitudes are immediately clear; tabular figures and fixed columns are useful defaults. |
> | Truncate with an ellipsis | Do not hide names or statuses when they are needed to act. Wrap or provide a clear full-text affordance. |
>
> **Retained as visual language, applied with context:** warm bone at rest, amber for the Hand or a
> primary action, red for threat, ice for data in motion, produced art for objects, reduced-motion and
> flash behavior, no `backdrop-filter` in flight, no first-person visor framing, and mono for figures
> rather than ordinary labels. `src/ui/orrery/stationStandard.js` is used by current station surfaces;
> that is not a claim that all screens or states have migrated or been reviewed.

---

## 1. The idea in one paragraph

SpaceFace is a game about **mass, momentum and orbit** — you fling rocks, swing ships on a tether,
and trade across a belt that turns. The interface can borrow from an astronomical instrument:
readings, routes, and selections may use rings, beams, scales, or motion when those forms clarify
the information. Produced art and considered typography help the world feel authored. These are
design possibilities, not requirements that every screen use the same geometry or choreography.

**A recurring motif:** *the Hand* is an amber pointer that can identify a current choice. Use it
where a pointer improves orientation; it is not required on every screen or the only valid way to
show selection.

## 2. Visual references from the original brief

The original brief looked to these games for inspiration. Their motifs are examples to adapt to
SpaceFace's player needs, not a visual scorecard or a requirement to match their style:

| Reference | Possible inspiration | Avoid when it harms clarity or fit |
|---|---|---|
| **Armored Core VI** (garage, HUD) | Thin, bright vector lines; parts assembling on screen with mechanical motion; huge thin numerals; angled leader lines | Its grey-on-grey monotony |
| **Death Stranding 2** | Holographic calm; lines of light as the only material; elegant reveals; generous negative space | First-person framing |
| **Arknights: Endfield** | Industrial precision; technical scales and callouts; considered alignment | Dense layouts where labels or grouping become hard to scan |
| **Destiny 2 / Marathon** (Bungie) | Typographic confidence — a few fonts at dramatic scale contrast; cursor-driven light; kinetic graphic design | Marathon's "fontslop" noise — we keep ONE display voice |
| **Zenless Zone Zero / Metaphor: ReFantazio** | Menus as choreography: every transition authored, nothing just "appears" | Comic-sticker tone |
| **Helldivers 2** | Radial/stratagem input as a physical ritual; diegetic confirmation | Military terminal skin |
| **Elite Dangerous / EVE Photon** | Density that stays readable; orbital maps that feel like instruments | Orange-on-black wall of text |

Avoid visual treatments that obscure information or imitate physical materials with decorative CSS
bevels, screws, or LED lenses. Rings and arcs can anchor information to content, but panels, tables,
and familiar controls are judged by how well they organize the particular screen. Avoid framing the
viewport like a first-person visor unless a screen's purpose calls for it.

## 3. The language

### 3.1 Light as a visual motif
- **Lines** can read as emitted light. SVG strokes and a wider, softer second stroke are one way to
  create that effect; choose weights and contrast for the actual display size.
  A live CSS/SVG `filter` (blur, drop-shadow) is allowed on menus over a paused world and **never in
  flight** — on the owner's iGPU a per-frame filter on HUD vectors would spend the whole HUD budget.
- **Glass** is one possible surface treatment: a deep tint (`--dp-glass`) with `backdrop-filter` only
  where the world behind is paused or static. A border, rule, or other edge treatment may be used
  when it improves grouping and remains readable. Avoid live-world blur that harms rendering.
- **Depth** can come from layering, parallax, or selective focus when those effects help orient the
  player and remain within the surface's rendering budget.

### 3.2 Geometry: choose the form that explains the content
Rings, arcs, beams, scales, ladders, leader lines, tables, and panels are all available forms. Use
the one that makes the information easiest to scan and the action easiest to understand. A ring can
make a circular relationship visible; a table can make comparisons easier; a scale can make ordered
values legible. Avoid adding geometry or motion without a clear purpose.

### 3.3 Colour and meaning
ORRERY adds to the **Deckplate token root** (`--dp-*`); it does not start a fifth token system.
Existing Deckplate tokens are reused wherever they already mean the right thing.

| Token | Value | Earlier intended use |
|---|---|---|
| `--dp-void` (new) | `#05070A` | the space behind the instrument |
| `--dp-glass` (new) | `rgb(8 11 16 / .62)` | the instrument's glass |
| `--dp-ink` / `-dim` / `-mute` (existing) | `#E8E2D4` / `#B7B4A6` / `#B0AEA6` | words and supporting structure where these values suit the content |
| `--dp-phos` (existing) | `#DFEEFF` | readings — the numbers the world tells you |
| `--dp-ice` (new) | `#8FCBFF` | A useful accent for information in motion, such as a travelling pulse or a route being computed. The Speed Dial uses a blue-shift ramp; its exact hues are implementation-specific. |
| `--dp-lamp` / `-hot` / `-dim` (existing) — alias `--dp-hand` | `#F2B950` / `#FFD98C` / `#8A6B3A` | Amber can identify a selected item or emphasize an important action; use it where it helps hierarchy |
| `--dp-danger` (existing) | `#FF5038` | **threat only**: hostile, incoming, loss, irreversible |

**One extension (owner, 2026-10-04): the map's ground and the minimap's contacts carry colour.** The owner
asked for "more contrast, colour coding and glow" on the Chart and the radar, because both read as bone
wireframes in play. The answer is scoped: the Chart's GROUND (each holder's territory wash, the border where
two holders meet, border posts, lane tints, a halo on each token; `src/ui/orrery/chartWorld.js`) and the
radar's CONTACTS (class hues with a halo; `src/ui/radar.js`) may be colour. Every structure, word, rail and
key on both stays bone. Two lines hold: **amber stays the Hand** (the course, the objective) and **red stays
threat** (a war front, danger haze, hostile contacts). A faction whose own hue sat on either is re-tinted for
the ground (Meridian's gold → yellow-lime, Reach's crimson → rose, Drift/Pitborn rust softened); the
crests and the rest of the interface keep their authored colours. Glow is geometry (gradient washes and
pre-rendered sprites), never a filter in flight.

**Color is contextual.** The owner favored warm bone for resting interface structure, amber for a
selected or primary action, red for threat, and ice for information in motion. Use those meanings
consistently where they apply, while keeping text, status, and controls clear in context.

An earlier review noted that using amber for too many unrelated elements made threat harder to
distinguish. The current owner guidance favors warm bone for resting structure, amber for a selected
or primary action, and red for threat; apply those meanings in context rather than as a one-accent
rule.

### 3.4 Type
The project includes **Archivo**, **Instrument Sans**, and **Spline Sans Mono**. Their existing roles
can provide a useful starting point: display type for headings, a readable body face, and mono for
codes or data where alignment helps. Choose size, weight, case, and spacing for the content and
viewport. Keep text readable and retain the project type-floor check; it is a floor, not a target
size or a prescribed label style. Format money and quantities so units and magnitudes are clear.

### 3.5 Motion has mass
Motion can echo the game's physical character when it helps explain a state change. Springs are one
useful option; use other transitions or still layouts when they communicate more clearly or cost less.
| Preset | Spring (stiffness / damping, mass 1) | Use |
|---|---|---|
| **swing** | 170 / 16 (slight overshoot) | the Hand, radial selection, carousels |
| **settle** | 260 / 28 (no overshoot) | panels arriving, rings coming to rest |
| **snap** | 420 / 38 | focus, hover, press feedback |
| **drift** | linear 0.4°/s | idle rotation of outer rings |
Arrival choreography and the spring values above are examples from an earlier design pass, not
timing requirements. Respect the user's reduced-motion setting and ensure important state remains
clear without animation.

### 3.6 Make the primary action clear
The **Lamp Key** is an available treatment for a prominent action. Use a clear hierarchy and an
appropriate control for the action; irreversible actions need confirmation or another suitable
protection, but neither a particular shape nor one-action-per-screen rule is required.

## 4. The ORRERY library — reusable examples

The library collects reusable interface elements from the original ORRERY direction. Reuse a
component when it fits the screen and preserves its behavior; a screen may use another pattern when
that better serves its purpose. The catalogue is a reference, not a required inventory or visual
acceptance checklist.

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
| 10 | **Lamp Key** | Shimmer / Shine / Ripple button | one possible treatment for an emphasized action; optional hold ring | where it fits the screen |
| 11 | **Hold Ring** | Destiny hold-to-confirm | an arc fills round a key while held | undock with risk, sell ship, abandon run, overwrite save |
| 12 | **Glass** | Glassmorphism done right, Progressive Blur | tinted blur with contextual edge treatment | behind text over the world |
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

## 6. Screen ideas

The following compositions record design intent from the original pass. Treat them as options to
adapt to the current screen, player task, and implementation; none of the named shapes or effects is
mandatory. Preserve useful information hierarchy and controls even when changing the visual form.

A screen may have a **hero instrument** — a memorable focal element — when it helps the player read
that screen. Screens can share a visual language without requiring the same composition.

### Flight
- **The Cluster** (bottom-left, one instrument, replacing ~8 boxes): the hull's top silhouette at
  the centre of a ring stack — shield (outer), armour, hull (inner) as Arc Gauges; energy and heat as
  two opposed arcs; speed as the **Speed Dial** (`speedDial.js`, upper-left of the Cluster): 50 lit
  blades on a 240° sweep, the numeral at its pivot, the reference speed as a gate at blade 30 and the
  travel drive's V-MAX as the last blade, a needle with a wake that stretches under acceleration, and
  boost as the charge arc inside it. Its tint follows the speed; the gate throws one ring when first
  crossed; a faint streak ring turns faster as the hull does.
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

These phases describe the original rollout plan. Apply the current Finish assignment and its player-facing
done condition; §8 offers relevant verification ideas, not universal gates.

| Phase | Delivers | Why first |
|---|---|---|
| **0a Direction proof** | `src/ui/orrery/` core (tokens, motion, svg, text), the elements the flight HUD needs (Orbit Ring, the Hand, Arc Gauge, Counter, Decrypt Text, Scale, Radial Menu, Signal Toasts, Threat Channel, Lock Ring), the showcase page + bench shot, **and the composed flight HUD** — inspect the real screen and retain what serves its play purpose; bone-at-rest vs blue-at-rest is a design choice | a library no one has seen composed is how drift starts; the flight HUD is seen for the whole demo and is overlapping today |
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

## 8. Verification guidance

1. **Inspect the relevant screen and states** (`node scripts/ui-bench.mjs --shot=<id>` can help). Choose
   viewports and captures that answer the change in question; no fixed screenshot count applies.
2. **Legibility**: `node scripts/ui-contrast.mjs` — every reading ≥ 4.5:1 on composited pixels.
3. **Every control works**: `--walk`; keyboard and gamepad reach everything; focus is visible.
4. **Review**: use independent feedback to identify concrete issues in comprehension, control use,
   accessibility, and polish. There is no numeric score or score threshold; feedback informs the change.
5. **Performance** on the owner's iGPU class: menus hold 60 fps; the flight HUD ≤ 0.8 ms/frame.
6. **Reduced motion**: every screen reaches every state instantly with motion off.
7. **Visual-system checks**: keep the no-fake-materials guidance and useful library coverage. Do not
   treat borders, panels, tables, or familiar controls as defects solely by their form; judge whether they
   serve the screen and remain usable.

## 9. Lessons from the original rollout

These notes describe issues encountered during the 2026 rollout. Use them as prompts to check for
actual problems; they are not universal implementation or review rules.

- **Unfocused restyling.** A visual change should improve a concrete player-facing need, rather than
  reproduce a previous screen's treatment by default.
- **A second system.** ORRERY lives on the Deckplate token root; old kit/fh/orbital sheets are
  retired screen by screen as each screen moves, and deleted when nothing references them.
- **Effects without meaning.** Every element in §4 has an in-fiction job. A beam shows a real
  relationship; a counter rolls because the number changed; the Hand points at a real choice.
- **Effects that cost the game.** Motion is budgeted; FX canvases pause off-screen; flight gets no
  menu FX.
- **Unverified changes.** Use the check that answers the current claim; a screenshot is useful when
  it resolves a visual question, not as a fixed ritual.

## 10. Implementation notes from the original rollout

These notes record useful ownership and migration patterns from that work; current Finish ownership
and assignment instructions take precedence.

- Screens keep their controllers, data and bindings; ORRERY replaces their view templates and
  styles. Tests that pin behaviour stay; tests that pin old markup are updated to the new contract in
  the same commit, with the reason.
- Screen families can be worked on independently when path ownership is clear and shared interfaces
  are coordinated.
- Codex image generation: `codex exec -m gpt-5.5 -c model_reasoning_effort=low --skip-git-repo-check
  -s workspace-write "<prompt> … save as <file>"` in an asset folder; transparent backgrounds work
  (proven 2026-09-22). Generate in grids when a set must match, then cut.
- Hull renders: the headless Blender script (session scratch `render_hull.py`, to be moved to
  `tools/renders/render_hull.py`) — hero/side/top, collision shells hidden, marks projected.

## 11. Historical notes from earlier programs

The September 2026 rollout learned that removing fake material effects does not require flattening
the interface or removing useful detail. Produced art, the shared Deckplate token system, and the
Lamp Key are part of the project's visual history; use the key where it clarifies an action rather
than treating its old shape as mandatory. The `ui-bench`, `ui-contrast`, and control-walk tools can
answer relevant review questions. This section's former phase/ledger workflow is not current; the
Finish Program defines today's assignments and acceptance checks.
