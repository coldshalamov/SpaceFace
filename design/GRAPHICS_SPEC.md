# SpaceFace — Graphics, Look & Feel Overhaul (Ambitious, Skill-Driven)

> **Status:** DRAFT — set this as the goal and I'll implement it.
> **Author:** ZCode
> **Method:** Built on the repo's own game-design skills — `threejs-aaa-graphics-builder`
> (visual scorecard, implementation blueprint, model/render recipes), `game-designer`
> (game-feel framework, four-timescale loops), `game-ux-designer` (4-tier info hierarchy,
> feedback latency), `game-playtest` (observable test questions). Supersedes earlier drafts.
>
> ## The core rule (from the AAA graphics skill, non-negotiable)
> *"Do not make primitives look AAA by adding glow. First build authored forms, then
> materials, then lighting, then effects."*
>
> Earlier drafts of this spec started with post-processing/lighting. **That was backwards.**
> The visual scorecard lists as an **automatic failure**: "Fog, darkness, bloom, or particles
> hide missing authored geometry." We do forms first.

---

## 0. Asset vocabulary (corrected — no AI, no paid APIs)

The asset-sourcing gate in the AAA skill requires a credential probe before any "procedural
only" claim. **Probe result: all three generator keys MISSING**
(`TRIPO_API_KEY=MISSING`, `GEMINI_API_KEY=MISSING`, `ELEVENLABS_API_KEY=MISSING`). This is a
documented allowed skip reason. There will be **no AI generation, no paid APIs** in this work.
"Procedural" everywhere below means *math/code generating geometry and textures at runtime*.

That leaves three real asset sources:

| Source | What it is | When to use it |
|---|---|---|
| **Procedural (math)** | Three.js primitives + canvas textures + shaders, built in code | Scale, variety, connective tissue, anything where variety-per-effort is the value |
| **Hand-authored model** | A GLTF built in Blender (or sourced CC0), or a hand-coded high-detail mesh | Hero surfaces players stare at: player ship, signature weapons, boss |
| **Existing on-disk images** | `assets/` already has Bible images, ore heroes, ship concepts, FX, UI from a prior session | Texture references, sky plates, menu/loading art, material inspiration |

### The ratio principle (the user's framing — drives every per-surface decision)

> *Procedural is a force-multiplier for **scale** (bigger world, more variety, things that'd
> be labor-intensive for minimal benefit), not a substitute for **authored craft** on the
> things players stare at. Match the modern-AAA ratio, don't over-correct to "100%
> procedural."*

Modern AAA games lean heavily procedural for terrain, props, filler, background — and
hand-author the player character, signature weapons, boss, key environments. **We match that
ratio.** The per-surface matrix in §3 says which is which, with reasons.

---

## 1. Current-state visual scorecard (the baseline — measured, not vibes)

Scored against the 10-category rubric from `threejs-aaa-graphics-builder/visual-scorecard.md`,
0–3 scale. Honest baseline; most categories sit at 1 (basic styled).

```
Visual scorecard (CURRENT):
- Art direction:         1 — theme is mostly colors/fog; forms don't yet express identity
- Hero/player:           1 — basic primitive stack (box+cone+wings) with glow; no authored hull
- Obstacles/enemies:     1 — all 8 enemy types reuse 6 player hulls (recolored repeated silhouette)
- Rewards/interactables: 1 — gems are glowing octahedra (repeated object + simple glow)
- World/environment:     1 — themed but sparse; starfield + nebula sprites + entities, NO planets/bodies
- Materials/textures:    2 — has procedural greeble/panel/noise system; not yet applied with named roles
- Lighting/render:       1 — fog/bloom used as main style; NoToneMapping; no sun, no shadows
- VFX/motion:            2 — has event-driven pooled particles for boost/hit/pickup/shield
- UI/HUD:                2 — genre-specific HUD states exist; readability OK, not yet polished
- Performance evidence:  2 — diagnostics installed (window.__THREE_GAME_DIAGNOSTICS__); no perf wall
Average: 1.5
```

**Automatic failures present (must clear before any premium claim):**
- Hero asset is mostly default primitives plus glow ✗
- Obstacles are one repeated silhouette (recolored player hulls) ✗
- Rewards are a repeated glowing octahedron ✗
- Fog/bloom used as main style ✗

**Target:** every category ≥ 2, average ≥ 2.3 (the premium threshold). §14 maps each weak
category to the workstream that lifts it.

---

## 2. Implementation order (the blueprint's order, not mine)

From `implementation-blueprint.md` §"Implementation Order":

1. Score active screenshots & identify weakest three → **done (§1)**
2. Add material and diagnostic foundations
3. Decide per-surface: procedural / hand-authored / existing-image
4. Build hero/player + one complete obstacle/reward family
5. Add world prop kit + layered composition
6. Add lighting/render polish
7. Add event-driven VFX
8. Re-score screenshots
9. Optimize measured bottlenecks

Lighting/render polish is step **6**, not step 1. Forms and materials come first. This is the
single biggest correction from earlier drafts.

---

## 3. Per-surface asset decision matrix (the ratio principle, applied)

The asset-sourcing ledger the skill requires:

```
External asset sourcing (no AI / no paid APIs):
- Credential probe: TRIPO=MISSING, GEMINI=MISSING, ELEVENLABS=MISSING (allowed skip)

Per-surface:
- Hero/player ship:        HAND-AUTHORED — the #1 surface players stare at. Hand-coded
                           high-detail hull OR a CC0 GLTF. Authored-form pass.
- Signature weapons/turrets: HAND-AUTHORED — visible on hull (hardpoint system); must read as real
- Boss/Leviathan enemy:    HAND-AUTHORED — capital silhouette, multi-turret, the showpiece enemy
- Other enemies (7 types): PROCEDURAL — distinct authored silhouettes (§7) but code-built; variety is the value
- Mining lasers/engines:   PROCEDURAL — functional read matters more than authored detail
- Asteroids:               PROCEDURAL — already seeded-noise displaced; textbook procedural (variety at scale)
- Ore pickups:             HYBRID — 4 hero ores (Iron/Ice/Luminite/Xenium) get authored material
                           treatments via assets/ores/*_hero.jpg as texture ref; common ores stay procedural gems
- Planets:                 PROCEDURAL SHADER — fbm-noise sphere shader (§8); seeded per-sector variety
- Sun:                     PROCEDURAL — emissive sphere + lens flare; one per sector
- Stations:                PROCEDURAL — already greebled; upgrade detail (§9) but stay code-built
- Gates (just redone):     PROCEDURAL — vertical portal, greebled hull, pylons, hub (shipped this session)
- World props/debris:      PROCEDURAL — instanced debris, satellites, buoys; connective tissue
- Sky/menu/loading art:    EXISTING IMAGE — assets/bible/B-001.jpg, assets/cinematics/* on disk
- Material references:     EXISTING IMAGE — assets/bible/B-002..B-009 as texture/style guides
```

**Ratio check:** hero ship + signature weapons + boss + 4 hero ores are hand-authored. Enemies,
asteroids, planets, stations, gates, props, debris are procedural. Sky/menu use existing images.
That matches the modern-AAA ratio — authored where players look, procedural for the world.

---

## 4. Workstream A — Material & diagnostic foundation (blueprint step 2)

Before any new forms, establish the material language so every later model uses named roles
(from `implementation-blueprint.md` §"Material Library"):

- `src/render/materialLibrary.js` (new) — named roles instead of one-off colors:
  `bodyPrimary`, `bodySecondary`, `trim`, `hazard`, `reward`, `glass` (MeshPhysicalMaterial for
  cockpit/shield), `emissiveSignal`, `groundContact`, `decalDark`, `decalLight`.
- Port existing `hullMaterial`/`emissiveMaterial`/`stationMaterial` to use the library — keeps
  caching, adds named-role discipline.
- Procedural **trim sheets + decals** (panel lines, hazard stripes, faction glyphs, rivets,
  wear) via the existing `makeGreebleTexture` — the authored-detail multiplier that makes
  procedural hulls read as built, not extruded.
- **Diagnostics:** renderer already exposes `window.__THREE_GAME_DIAGNOSTICS__`. Add
  per-surface diagnostics to model factories (mesh count, tris, collision proxy) per
  `model-recipes.md` §"Diagnostics Checklist".

**DoD:** material library exists; ≥5 named roles used across ships+stations; diagnostics report
mesh/tri/material counts per factory.

---

## 5. Workstream B — Hero player ship: authored form (blueprint step 4) ⭐

The #1 surface. Per `model-recipes.md` §"Hero Vehicle Recipe": *"Reject if the hero is mostly
a box with two cylinders and a glow."* Current `buildShipMesh` fighter IS a box + cone + wings
+ glow — automatic failure.

Build an authored hull with the recipe's parts:
- Core hull: tapered `BufferGeometry` or `ExtrudeGeometry` — **not a box.** A wedge with bevel.
- Nose: wedge + intake + sensor strip (named `noseSensor`).
- Cockpit: glass dome (`glass` material, MeshPhysicalMaterial) — beveled, faceted canopy.
- Engines: cylinders + nozzle rings + inner emissive discs + heat fins + trail sockets.
- Wings: extruded curved plates with trim lines (named `leftWing`, `rightWing`).
- Decals: panel lines, faction glyph, hazard ticks, bolts (the §A trim sheets).
- **State cues (3 minimum):** boost flares, shield shell, damage scorch, pickup glow, overheat-red.
- Collision proxy: separate capsule/box matching the gameplay footprint.
- **Hardpoint sockets** (named) — anchors for Workstream C.

Use `assets/ships/ship_fighter_player_concept.jpg` + `fighter_albedo_emissive.jpg` as
style/texture reference, `assets/bible/B-002_ship_materials.jpg` as material guide.

**DoD:** player ship reads as an authored vehicle silhouette (dark-shape test), not box+glow;
has 3+ state cues; named hardpoint set; collision proxy separate.

---

## 6. Workstream C — Visible hardpoint / module system (the player's core ask) ⭐⭐

Today `buildShipMesh` builds from `defId` only — equipped modules change zero pixels.

1. Each ship def gets `hardpoints[]` (named local-space anchors): `wing_L`, `wing_R`, `dorsal`,
   `rear`, `chin`, etc.
2. Each module/weapon def gets a `visual` recipe: `{ kind, size, ... }`.
3. `buildShipMesh(entity, loadout?)` walks equipped modules and attaches a small authored
   assembly at each hardpoint. ~7 recipes cover all 23 modules + 12 weapons:
   `cargoPod`, `shieldEmitter`, `engineNacelle`, `turret`, `miningLaser`, `missileRack`,
   `utilityAntenna`.
4. **Turrets are the showpiece** — authored rotating base + barrel tracking the current target.
   This is what makes loadouts feel real.
5. Outfitting screen gets a live 3D preview of the *current* loadout (reuse any shipyard viewer).

Per the ratio principle: **turrets and signature weapons are hand-authored** (visible, stared
at); cargo pods / utility antennas are procedural (functional read, not hero).

**DoD:** equipping any module visibly changes the ship; turrets track targets; outfitting
screen shows live loadout.

---

## 7. Workstream D — Enemy family: distinct silhouettes (blueprint step 4) ⭐

From `model-recipes.md` §"Obstacle And Enemy Families": *"Reject if all hazards are recolored
cubes/cones."* Currently all 8 enemies reuse 6 player hulls.

- Add a `silhouette` field to `enemies.js`; give each of the 8 types a **distinct authored
  silhouette** built procedurally (variety is the value, so procedural is correct):
  - **Wasp Swarmer** — tiny, asymmetric, spiked (read: disposable swarm).
  - **Lancer Sniper** — slim, long barrel, exposed cooling fins (read: keep distance).
  - **Bruiser Brawler** — bulky, armor plates, dark tint, turret nacelles (read: tanky).
  - **Interdictor** — angular, webbed, interceptor silhouette (read: fast pursuit).
  - **Marauder** — pirate greeble-heavy, asymmetric, exposed engines.
  - **Carrier** — wide hangar bay, escort drones orbiting (read: spawns adds).
  - **Leviathan (boss)** — **hand-authored** capital: multi-box spine + tower + sensor ring +
    4–6 turrets + damage-state smoke (wire existing `_emitDamageSmoke`). The showpiece enemy.
- Each needs: unique silhouette, material cue for danger, telegraph from distance, collision proxy.

**DoD:** ≥3 readable enemy variants with unique silhouettes (scorecard threshold is 3); boss is
authored; every enemy reads differently at a glance.

---

## 8. Workstream E — Procedural planets + sun (blueprint step 5) ⭐

Sectors currently have zero spherical bodies. The "procedural planet" done right — procedural
is the correct call here (1–3 per sector × 10 sectors × variety = scale).

- **Planet mesh:** `IcosahedronGeometry(r, 5)` + custom `ShaderMaterial`.
- **Fragment shader:** domain-warped fbm (port canvas fbm from `canvasTextures.js` into GLSL)
  for continents + cloud octave. Day/night terminator from sector sun direction.
- **Atmosphere rim:** fresnel (`pow(1 - dot(N,V), 2.5)`) — same trick as the existing shield
  bubble shader. Layered glow halo sprite for bloom pickup.
- **Per-sector placement:** 1–3 planets, seeded by `sector.id` (deterministic — V2 §32 model).
  Deep sectors → gas giants; frontier → rocky; conflict → scorched/lava.
- **Sun body:** emissive sphere + corona noise shader + lens flare (Workstream G). The visible
  light source the render recipe demands.
- Use `assets/bible/B-013_nebula_mood.jpg` as the mood/atmosphere reference.

**DoD:** every sector has ≥1 planet + a sun; planets have day/night + atmosphere rim;
deterministic per sector.

---

## 9. Workstream F — World prop kit & layered composition (blueprint step 5)

From `model-recipes.md` §"World Prop Kit" + `implementation-blueprint.md` §"World Art Director":
*"Reject if the world is mostly stretched boxes or a flat plane."*

Build a reusable **prop kit** (instanced where possible) and layer the world:
- **Near layer:** debris panels, satellites, buoys, asteroid chunks — speed/scale cues.
- **Mid layer:** the play plane — asteroids, stations, gates, enemies (already exist).
- **Far layer:** planets (§8), nebula planes, parallax starfield (exists), distant station silhouettes.
- **Motion layer:** dust particles, engine trails, beam glows.

Add **contact shadows** (cheap dark radial decals under entities) — the render-recipe grounding
trick. Old spec skipped real shadows "for perf"; with the corrected premise we enable
`PCFSoftShadowMap` on the key light for hero/large entities, contact discs for the rest.

**DoD:** world reads as layered (near/mid/far/motion); ≥8 reusable prop parts; entities feel
grounded via shadows or contact discs.

---

## 10. Workstream G — Lighting & render polish (blueprint step 6)

**Now** post-processing is allowed — forms exist. Per `render-recipes.md`:

- **Vendor `three/addons`** first (the importmap points at `vendor/addons/` but the folder is
  empty — grab r160's `examples/jsm/`).
- **Tone mapping:** move from `NoToneMapping` to `ACESFilmicToneMapping` via `OutputPass`
  (update the documented invariant in `bloom.js:20-26` — tonemapping moves into the composite).
- **Sun + lens flare** (Lensflare from addons): one per sector, tinted from sector palette. The
  cinematic read.
- **Shadows:** `PCFSoftShadowMap` on the key light, hero/large casters only.
- **Post chain:** `EffectComposer` → `RenderPass` → `SSAOPass` (grounded feel) →
  `UnrealBloomPass` (authored emissives only, not all bright mats) → `OutputPass`. Keep old
  `bloom.js` as the `bloomEnabled=false` fallback.
- **Subtle film grain + chromatic aberration on impacts only**, vignette tied to `feel.js`
  damage state. Per render-recipe: *"compare with post enabled/disabled."*
- Fog tuned to reveal depth, not hide empty world.

**DoD:** ACES tone mapping live; sun + flare per sector; shadows on hero/large; post chain with
on/off comparison captured; scorecard "Lighting/render" hits 2.

---

## 11. Workstream H — Event-driven VFX & game feel (blueprint step 7 + game-designer §8)

VFX layer is already scorecard 2. Upgrade via the **game-feel framework** (game-designer §8):

- **3-stage particles** (anticipation/action/follow-through) per render-recipe: muzzle
  anticipation → impact → lingering smoke. Currently single-stage.
- **Muzzle lights on every fire** — `_flashLight` pool exists but only fires on "hero" events;
  wire it to every `combat:fire`. Every shot lights the firing hull.
- **Hitstop (game-designer §8):** 30–80ms freeze on significant impacts. `feel.js` has hit-stop
  — verify wired to *all* significant hits, not just player damage.
- **Screen shake discipline:** exponential decay, never linear; clamp intensity; gated by the
  existing `motionReduce` setting (accessibility, game-ux §1).
- **Camera work:** FOV punch on kills (the "that felt good" beat), pull-back on area effects.
  `feel.js` has FOV punch — extend to kills.
- **Capital damage smoke** — wire `_emitDamageSmoke` to hull% for mass > threshold (wounded
  capitals trail fire).
- **Engine ribbon trails** on large ships (tapering ribbon mesh > particle trail — cleaner).
- **Beam heat haze** — subtle distortion on mining/combat beams.

**Sound = 50% of feel (game-designer §8):** every visual event above must have a synced audio
cue within 1–2 frames. Audit `audioSystem.js` for coverage gaps (already has 15 RECIPES + 4
music stems per `check-data.mjs`).

**DoD:** 3-stage particles on impacts; muzzle lights on all fire; hitstop on all significant
hits; capital smoke; ribbon trails; kill FOV punch; every VFX event has synced audio.

---

## 12. Workstream I — UI/HUD polish (game-ux §3)

Apply the **4-tier information hierarchy** (game-ux §3):
- **Tier 1 (survival, always visible):** hull, shield, ammo, immediate threats — ≤4 elements,
  peripheral-vision positioned. Audit current HUD for clutter.
- **Tier 2 (tactical, on demand):** minimap, cooldowns, objective markers — appear when relevant.
- **Tier 3 (strategic, pause):** full map, inventory, stats — already screens.
- **Tier 4 (meta):** never overlay gameplay.

- **50ms feedback rule (game-ux §3):** every input must produce visible/audible feedback within
  50ms. Audit input→feedback latency.
- **Diegetic vs non-diegetic:** the radar is non-diegetic overlay — consider making the reticle
  + target brackets diegetic (in-world). Coordinate with art direction.
- **Accessibility (game-ux §1):** existing `settings.controls.bindings` (rebind grid) +
  `motionReduce` are good. Verify colorblind palette, scalable text, hold-vs-toggle options.
- **UI/world cohesion (implementation-blueprint):** UI colors/icons must echo gameplay materials
  (danger red, reward gold, shield cyan). Audit for mismatches.

**DoD:** HUD passes the 4-tier audit; ≤4 tier-1 elements; 50ms feedback verified; accessibility
options complete; UI echoes world material language.

---

## 13. Execution order & effort (blueprint-aligned)

| Step | Workstream | Blueprint phase | Effort | Payoff |
|---|---|---|---|---|
| 1 | **A — Material library + diagnostics** | step 2 | 1.5d | foundation |
| 2 | **B — Hero ship authored form** | step 4 | 2d | 🔥 #1 surface |
| 3 | **C — Visible hardpoints/modules** | step 4 | 1.5d | 🔥🔥 core ask |
| 4 | **D — Enemy silhouettes + boss** | step 4 | 2d | 🔥 distinct classes |
| 5 | **E — Procedural planets + sun** | step 5 | 2d | 🔥 the planet ask |
| 6 | **F — World prop kit + shadows** | step 5 | 1.5d | 🔥 grounded world |
| 7 | **G — Lighting + post chain** | step 6 | 1.5d | 🔥 cinematic |
| 8 | **H — VFX + game feel** | step 7 | 1.5d | 🔥 feel |
| 9 | **I — UI/HUD polish** | (ux) | 1d | readability |
| 10 | **Re-score + optimize** | steps 8–9 | 1d | gate to premium |

**~15.5 days focused.** Order is the blueprint's, not arbitrary: materials → forms → world →
lighting → VFX → re-score.

---

## 14. Definition of done — the premium gate (from the scorecard)

Per `visual-scorecard.md` §"Thresholds": **premium = every category ≥ 2, average ≥ 2.3.**

Target end state (each category lifted from §1's baseline):
```
- Art direction:         1→2 — theme affects forms, materials, UI, world, feedback
- Hero/player:           1→2 — authored silhouette, decals/trim, state cues, collision proxy (§B)
- Obstacles/enemies:     1→2 — three+ readable variants with telegraphs + material cues (§D)
- Rewards/interactables: 1→2 — two+ authored forms with idle/collect states (§C hero ores)
- World/environment:     1→2 — layered prop kit with fore/mid/back + scale cues (§E, §F)
- Materials/textures:    2→2 — named roles + procedural decals/trim/wear (§A)
- Lighting/render:       1→2 — intentional tone mapping, exposure, key/fill/rim, contact, depth (§G)
- VFX/motion:            2→3 — event-driven, 3-stage, high-impact, performant (§H)
- UI/HUD:                2→2 — genre HUD states, meters/icons, responsive fit (§I)
- Performance evidence:  2→3 — before/after metrics, bottleneck notes, budgets (step 10)
Average target: ~2.2→2.3 (premium threshold)
```

**Automatic failures to clear:** hero-is-primitives+glow ✗→✓ (§B); repeated enemy silhouette
✗→✓ (§D); repeated reward ✗→✓ (§C hero ores); fog/bloom-as-main-style ✗→✓ (§G real lighting +
authored forms).

**Per-workstream hard gates:** all 4 test gates pass; `node --check` clean on touched files;
server boots HTTP 200; new features gated behind `settings.video.*` knobs with sensible
defaults; `design/specs/10`'s "primitives only / no perf budget" framing updated to reflect
the corrected premise (old spec kept as historical context, marked superseded).

---

## 15. Playtest validation (game-playtest §1)

Before declaring premium, define **observable test questions** (not "is it fun"):
1. *Can a new player identify their ship vs enemy ships within 5 seconds?* (§B/§D silhouette distinction)
2. *Do players notice when a module they equip appears on their ship?* (§C)
3. *Can players read an enemy's threat class before engaging?* (§D telegraphs)
4. *Does combat feel weighty — do players flinch/react to hits?* (§H hitstop/shake)
5. *Do players look at planets/sun and read the sector as a place?* (§E)

Behavioral signals (positive/negative) defined per question per the playtest protocol. Minimum
5 testers; behavioral data > verbal; facilitator does not play.

---

## 16. What I will NOT do
- **AI generation or paid APIs** — none. Probe confirmed keys MISSING; user confirmed no spend.
- **Engine swap, bundler, or anything that breaks importmap + offline + Electron constraints.**
- **Promise "AAA."** Promise: every scorecard category ≥ 2, average ≥ 2.3, all automatic
  failures cleared — the skill's own premium threshold, measured not asserted.
- **Start with post-processing.** Forms first, per the core rule.

---

## 17. Open question (only one)
**Hero ship asset path:** (a) hand-code an authored high-detail hull in `visualFactory.js`
using ExtrudeGeometry/BufferGeometry + the material library, or (b) source a CC0 GLTF (Kenney/
Quaternius space kit) and vendor it + wire GLTFLoader. Both are "authored, not AI." Default if
you don't say: **(a) hand-coded** — keeps zero external dependencies and the artist is me.
Say "(b) Kenney" if you want me to vendor a CC0 pack for the hero ships.

Set this as the goal and I'll execute A→I + re-score, in blueprint order.
