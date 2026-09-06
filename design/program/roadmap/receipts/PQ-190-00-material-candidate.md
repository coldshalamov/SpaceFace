<!-- LIFETIME: PACKET_RECEIPT -->
# PQ-190.00 — material/preflight note for the changed camera-visible surfacing

Material inventory and implementation notes follow
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` and the substance-classification preflight in
`.grok/skills/spaceface-blender-material-truth/SKILL.md` §"Classify the substance before setting
Principled values" — that preflight applies to runtime material response, not only to Blender authoring.

State: `controller_reviewed`; independent action-read review is pending. The controller has reviewed
the current quiet flight, combat, shield, Massline, rover and off-thrust comparison frames.

---

## 0. Why response, not textures

Two measured facts set the whole shape of this candidate.

**(a) The role clamps in `authoredMaterialProfiles.js` never run on these six.** Every
roughness/metalness clamp in `applyAuthoredMaterialProfile` is guarded by `if (!authoredSurface)`,
where `authoredSurface = coverage.complete` (base + normal + roughness + metalness maps present).
Mapped structural materials retain their authored texture response. Existing renderer-side
response controls include:

| Lever | Current value | Applies to |
|---|---|---|
| `envMapIntensity` | **2.1** flat, **2.8** for `mechanical`/`drive` | every solid role |
| roughness breakup shader | ±0.16 low-frequency, one shared program key | hull/mechanical/accent/ceramic/radiator/service/docking |
| `dithering` | true | all |

The candidate separates response by substance. Whether that improves the matte-gray appearance
must be decided in the live camera comparison; uniform values alone do not establish a visual result.

**(b) `roughness` and `metalness` are multipliers over the authored map, not replacements.**
`partsLibrary.js:2905-2921` (`installSingleSamplePackedOrmShader`) emits
`roughnessFactor = roughness; roughnessFactor *= sfPackedOrmTexel.g;` and
`metalnessFactor = metalness; metalnessFactor *= sfPackedOrmTexel.b;` — the same contract as stock
three.js. The mapped structural materials commonly ship `metallicFactor = 1, roughnessFactor = 1`.
Scaling the factor therefore
**shifts the whole surface while preserving every texel of authored wear variance**. No map is
stripped, replaced, retinted, or re-baked anywhere in this candidate.

Consequence for the direction: "painted shell reads satin coating over metal; worn tool edges/glass
keep controlled highlights" is expressible entirely as a per-substance split of
(`envMapIntensity`, `roughness×`, `metalness×`) with the maps untouched. That is what the new
`src/render/industrialMaterialFamilies.js` encodes.

---

## 1. Inventory — the actual authored material names in the six items

Read directly out of the shipped release GLBs' JSON chunks. `bc/m/rgh/emis` are the glTF factors;
`maps` is the real texture set. `m=1.00 rgh=1.00 maps=[base,mr,nrm,ao]` means "response is 100%
texture-driven, factor slot free".

### 1.1 Player starter — `wholeships/kestrel.glb` (15.29 MB, 17 materials, 32 textures)

| Authored material | Authored response | Substance (preflight) |
|---|---|---|
| `Material_Hull` | `m=1 rgh=1` maps[base,mr,nrm,ao] | intact paint over plate → **dielectric** |
| `Material_ArmorDark` | `m=1 rgh=1` full maps | armour plate, coating partly lost |
| `Material_Accent_FrontierCyan` | `m=1 rgh=1` full maps | accent paint → dielectric |
| `Material_Accent_WarningOrange` | `m=1 rgh=1` full maps | warning paint → dielectric |
| `Material_RepairGreen` | `m=1 rgh=1` full maps | field repair primer, unpolished |
| `Material_BrushedMetal` | `m=1 rgh=1` full maps | bare directional steel → **metallic** |
| `Material_Mechanical` | `m=1 rgh=1` full maps | exposed hardware/fasteners → metallic |
| `Material_Radiator` | `m=1 rgh=1` full maps | thermal fin stack |
| `Material_EngineCeramic` | `m=1 rgh=1` full maps | refractory → **non-metal, dry** |
| `Material_Rubber` | `m=1 rgh=1` full maps | seal/gasket → non-metal, matte |
| `Material_Decal_Hazard` / `Material_Decal_Stencils` | full maps, `alpha=BLEND` | printed marking |
| `Material_V6_MarkingIvory` | `bc=[.5,.4,.24] m=0 rgh=1` no maps | painted stencil block |
| `Material_Glass_Canopy` | `bc α=.48 m=0 rgh=.14` `alpha=BLEND` | glass, **not dark polished metal** |
| `Material_Emissive_DriveCore` | `emis=[.65,.98,1]` **strength 12** | primary drive radiance |
| `Material_Emissive_Cyan` | `emis=[.04,.75,1]` strength 6 | nav/trim signal |
| `Material_Emissive_Orange` | `emis=[1,.18,.01]` strength 8 | hazard/trim signal |
| `COLLISION_HULL_MESH` | — | collision, never touched |

Named identity meshes present and preserved untouched: `HOOK_ARMOR_PORT`, `HOOK_DRIVE_CORE`,
`HOOK_NAV_PORT/STARBOARD`, `HOOK_SECONDARY_POD`, `HOOK_SENSOR_DISH`, `V6_DriveHotCore`,
`V5_EngineHeatShield_Port`, `V5_ThermalIntakeFace_Port`, `LOD0_HULL_Kestrel_PressureHull`,
`V7_HeroMark_DieLaughing`, `Cockpit_Recessed_Laminate`.

### 1.2 Contrasting enemy — `wholeships/ashline_rig.glb` (7.50 MB, 5 materials, 20 textures)

| Authored material | Authored response | Substance |
|---|---|---|
| `Material_Hull` | `m=1 rgh=1` full maps | **salvage plate, coating largely gone** → metallic |
| `Material_Mechanical` | `m=1 rgh=1` full maps | exposed rig hardware → metallic |
| `Material_Glass` | `bc α=.55` full maps, `emis=[.15,.01,.01]` | glass with a warm interior bleed |
| `Material_Cyan` | full maps, **`emis=[1,0.07,0.04]` str 2.10** | the name says cyan; **it emits warm red** |
| `Material_Warm` | full maps, `emis=[1,.38,.08]` str 1.35 | warm work light |

**`Material_Cyan` is not corrected.** Its authored emission is warm red and that IS the contrast the
direction asks for — the enemy rig reads warm against the Kestrel's cool cyan drive. Renaming or
re-hueing it would delete the warm/cool separation this leaf exists to prove.

LOD note: this GLB packs `LOD0_/LOD1_/LOD2_Merged_Material_*` in one file, so a single traverse
covers all three levels.

### 1.3 Useful solid object — `pods/pod_cargo_container.glb` (0.27 MB, 3 materials)

| Authored material | Authored response | Substance |
|---|---|---|
| `Cargo_Shell` → `Material_Hull` | `m=0.32 rgh=1` maps[base,mr,nrm,ao] | painted container shell → dielectric |
| `Cargo_ID_Plate` → `Material_Accent` | `bc=[.10,.42,.48] m=.04 rgh=.42` **no maps** | painted ID plate, satin |
| `..._Material_Mechanical_Merged` | `bc=[.05,.07,.09] m=.82 rgh=1.00` **no maps** | frame/fittings — currently a *fully rough* metal, i.e. a metal with no reflection at all, which is why the pod reads as a flat dark box rather than a substantial object |

### 1.4 Landmark — `places/place_station_trade_hub.glb` (75.39 MB, 12 materials, 30 textures)

Helios/Tethys/Reach/Drift trade hub (`src/data/sectorAnchors.js`, `frontierRegions/*`).

| Authored material | Authored response | Substance |
|---|---|---|
| `SF_HullDark_K0PBR` / `SF_HullMid_K0PBR` | `m=1 rgh=1` full maps | painted station plate → dielectric |
| `SF_Armor_K0PBR` | `m=1 rgh=1` full maps | bare armour plate → metallic |
| `SF_Machinery_K0PBR` | `m=1 rgh=1` full maps | machinery → metallic |
| `SF_ServiceAccess_PBR` | `m=1 rgh=1` full maps | service panel, worn coating |
| `SF_IndustrialMarking_PBR` | `m=1 rgh=1` full maps | printed marking |
| `SF_DockingContact_PBR` | `m=1 rgh=1` full maps | scuffed contact surface → metallic |
| `SF_Radiator_PBR` | `m=1 rgh=1` full maps | thermal fin |
| `SF_StructuralLight_PBR` | `m=1 rgh=1` full maps | structural work light |
| `SF_Window_PBR` | full maps, `emis=[.04,.56,.96]` | occupied window |
| `SF_AmberEmission` | `emis=[1,.32,.03]` str 7 | warm state emission |
| `SF_CyanEmission` | `emis=[.02,.75,1]` str 8 | cool state emission |

`COLLISION_HULL_Mesh`, `SFG02_SupportedRingBay_Mesh.000–023`, and the
`LOD0/LOD1/LOD2_HeliosGolden02_Batch_Mesh` + `HeliosGolden02_CommonBatch_Mesh` batches are structural
identity — untouched; the batch grouping is preserved (see §4).

### 1.5 Industrial machine — `works/place_works_refinery.glb` (3.15 MB, 6 materials)

| Authored material | Authored response | Substance |
|---|---|---|
| `Material_Refinery_LOD0` / `_LOD1` | `m=1 rgh=1` maps[base,mr,nrm] | rolled hot jacket + stack + tank → metallic |
| `Material_lamp_LOD0` / `_LOD1` | `bc=[.4,.32,.18] m=.02 rgh=.28` no maps, **no emissive** | status lamp lens |
| `Material_slit_LOD0` / `_LOD1` | `bc=[.03,.02,.02] m=0 rgh=.62` no maps, **no emissive** | furnace slit lens |

### 1.6 State effects — engine / shove / shield / loaded line

| Effect | Owner | State hook that already exists |
|---|---|---|
| Engine (player Kestrel) | `thruster/recipes/kestrelRecipes.js` + `ContinuousPlumeSystem` | recipe-owned; `schema.js` `LIVE_SEAM_FIELDS` documents `boostBlend: 'throttle continuous response (not binary)'` |
| Engine (NPC / ashline rig) | `vfx.js:_emitEngineTrail` + pooled streaks | `drive` (throttle 0–1.35), `boostBlend`, `cruiseBlend`, `glowT` (speed→white-hot) all live |
| Shove / heavy impact | `vfxProfiles.js` `IMPACT_PRESENTATION_PROFILES` | `concussion` = `concussive-slam`/`displacement-wave`, `mine` = `radial-shove`/`shockfront`; per-family mode, life, fragmentCount, lightPeak |
| Shield response | `vfx.js:3582 / 12472 / 13371` (**not in this write set**) | `hitShield` picks `shieldColor` over `profile.accentColor`; `brokeShield` is a separate trigger; `SPR_FRESNEL` rim ripple |
| Loaded Massline | `masslinePresentation.js` `resolveForceNeonScale` | `load`/`tension` drives `energy 1.15→2.50`, `lightPeak 1.2→2.8`, `coreWhite .15→.70`; `taut`/`throw`/`whip`/`tumble`/`impulse` each distinct; `flashReduce`/`motionReduce` fold to 45%/40%/35% |

---

## 2. The two defects found

### 2.1 The Refinery furnace cannot emit

`asteroidRenderer3d.js:4937-4943` already drives the furnace by state:

```js
if (rec.dyn.furnace) {
  const hot = running;                       // 'running' | 'throttled' | 'limited'
  const intensity = hot ? (motionReduce ? 1.5 : 1.25 + 0.55 * Math.sin(timeS * 5)) : 0.08;
  if (rec.dyn.setFurnaceIntensity) rec.dyn.setFurnaceIntensity(intensity);
```

and `setFurnaceIntensity` (`asteroidRenderer3d.js:421-423`) sets **`emissiveIntensity` only**.
`Material_slit_LOD0/LOD1` ship **no `emissiveFactor`**, so `GLTFLoader` leaves
`material.emissive = 0x000000` and nothing anywhere else assigns it —
`applyAuthoredMaterialProfile`'s emissive branches are all guarded by
`material.emissive.getHex() !== 0`. `emissiveIntensity × black = black`.

The current slit cannot emit with a black emissive colour. The lamp lens works because `setLamp(hex, i)`
assigns `emissive.setHex(hex)` explicitly.

Fix: assign the slit a chosen ember colour once, at the instance-owned bind. **The state map is
not touched** — Asteroid Works Law §5 ("machine starved/unpowered: THE MACHINE GOES DARK", the gold
want chip carries the fault, coral is lamp-only for `CORAL_FAULTS`) stays exactly as ruled. This
candidate colours the heat; it does not re-map the states.

### 2.2 The pooled engine streak has no radiance structure

Both streak lanes emitted `colour * (0.65 + streak * 0.55)`. The pedestal is **0.65 against a peak of
1.20** — 54% of the streak's brightness is present regardless of what the procedural sample says, so
the trail is a near-uniform glowing ribbon rather than a jet with a hot core and a falling tail. The
ribbon trail beside it has had that structure all along (filament, forked ribbons, arcs, tail
envelope, head boost); the pooled streak never did.

This is the packet's own "How agents get this wrong" line — *"design the source radiance first (a
thin bright core with structured falloff), reserve headroom for peaks"* — applied to the one lane
that lacked it.

Fix: `0.28 + streak * 0.72 + streak² * 0.20`. **The peak is identical at 1.20.** Contrast rises from
1.8:1 to 4.3:1. Nothing gets brighter, no bloom constant is touched, and because the streak colour is
already state-lerped upstream by boost/cruise/speed, the body contrast is what lets that state show.
One shared GLSL helper serves both lanes so they cannot drift apart.

---

## 3. Named material families (the derived reusable rules)

Eleven families in `src/render/industrialMaterialFamilies.js`. Each is a bounded response record; a
family is **only** (`envMapIntensity`, `roughness×`, `metalness×`, optional `emissiveIntensity`).

| Family | Substance | env | rgh× | met× | The read it buys |
|---|---|---|---|---|---|
| `painted_shell` | intact coating over plate (dielectric) | 1.15 | 1.06 | 0.55 | satin colour mass, not a mirror |
| `painted_shell_worn` | coating partly lost / field repair | 1.35 | 1.10 | 0.72 | paint that has been outside |
| `bare_structure` | armour + salvage plate (metallic) | 1.85 | 0.98 | 1.00 | solid metal mass, still not glossy |
| `worn_tool_metal` | machinery, brushed steel, fasteners | 2.55 | 0.86 | 1.00 | **controlled highlights on tool edges** |
| `thermal_ceramic` | refractory liner | 0.85 | 1.08 | 0.30 | dry, non-metal |
| `radiator_fin` | thermal fin stack | 1.70 | 0.94 | 1.00 | reads as a working radiator |
| `matte_seal` | rubber, gasket, hose | 0.55 | 1.12 | 0.15 | dead matte |
| `industrial_marking` | printed decal, stencil | 0.60 | 1.05 | 0.35 | markings do not shine |
| `controlled_glass` | canopy, window | 1.60 | 1.00 | 1.00 | **glass is not dark polished metal** |
| `state_emission_*` | every emissive lane (6 records) | — | — | — | see §3.1 |

A test pins that no family is dead data: every declared family is referenced by some asset's table.

### 3.0 One key, two resolutions — and what the coarse one costs

`partsLibrary.js` `sharedMaterialFor` renames shared materials
(`material.name = authoredMaterialName(...)` → a program-family token such as `SF_Shared_hull_hull`),
so the authored glTF name does NOT survive into the live graph on the ship route. What does survive
is `userData.spacefaceMaterialRole`, which `authoredMaterialProfiles.js` derives from that authored
name at load and which several live sites in `partsLibrary.js` already read.

The pass therefore resolves in two steps — exact authored name first, semantic role second — and
each asset's table declares both. The coarse step is honest about what it loses:

- **Kestrel:** role `hull` covers `Material_Hull`, `Material_ArmorDark`, `Material_Decal_Stencils`
  and `Material_V6_MarkingIvory`, so on the renamed path the armour plate and the stencils read as
  painted shell rather than bare structure / marking. Role `warning` covers both
  `Material_Accent_WarningOrange` and `Material_Decal_Hazard`.
- **ashline_rig, pod, station:** every table entry maps to the same family under either key, so the
  coarse path costs nothing there.

Where the authored name survives (the works route, and any path that does not go through
`sharedMaterialFor`) the precise mapping is used.

The whole point of the table is that `worn_tool_metal` (2.55) and `painted_shell` (1.15) differ by
**2.2×** where today they differ by 1.0×. That defines a satin/specular response split without changing the texture set;
the numeric ratio alone does not establish visual readability.

`envMapIntensity` values are anchored to the existing `SOLID_ENV_INTENSITY = 2.1` /
`SOLID_ENV_INTENSITY_METAL = 2.8` so no family exceeds today's ceiling — the change is
bounded against that ceiling. The hull families use 1.15/1.85 and tool metal uses 2.55. Overall
brightness and edge readability remain visual acceptance questions.

### 3.1 Attention levels, by state — not permanent equal glow

Today the Kestrel's trim signals sit at `emissiveIntensity` 2.2 (clamped from authored strength 6–8)
and the drive core at 3.2 (clamped from 12): a 1.45× separation between "nav light that is always on"
and "the drive that is currently making force". Three levels replace that:

| Level | Family | Target | Why |
|---|---|---|---|
| primary event | `state_emission.drive` | 3.20 (unchanged) | the drive keeps its peak |
| secondary body | `state_emission.trim` | **1.15** | nav/hazard trim stops competing with the event — headroom, not darkness |
| atmosphere | `state_emission.window` / `.structure` | 1.45 / 1.30 | occupied station, useful work light |
| state surface | `state_emission.warm` / `.cool` | 1.95 / 1.85 | amber/cyan station emission stays a saturated *statement* |

Only `emissiveIntensity` moves. **No authored emissive hue is changed anywhere**, including
`ashline_rig`'s misleadingly named warm-red `Material_Cyan` and the station window's cool blue.

---

## 4. What is preserved, and how it is enforced

| Contract | How this candidate keeps it |
|---|---|
| Textures / maps | never assigned, never cleared; `roughness`/`metalness` are factor multipliers over the packed ORM (`partsLibrary.js:2905`) |
| Cloned shader hooks | `onBeforeCompile` / `customProgramCacheKey` never read or written; no `material.clone()`, so the `cloneMaterialPreservingShaderHooks` contract is never entered |
| Shader programs (material pass) | only uniform-valued properties are set; **`needsUpdate` is never forced**, so no recompile against the roughness-breakup or packed-ORM hooks. A test asserts `material.version` stays 0 |
| Shader programs (streak lane) | the streak fragment source does change, so its program is new — but `createPrecompileTrailSurfaces` builds through the same live `createRibbonTrail`/`createTrailStreakPool` factories, so the precompile variant tracks it automatically and no cache key can drift. Both streak lanes share ONE `trailStreakRadiance` helper so they cannot diverge. `check:vfx-techniques` and `check:vfx-sleep` are green |
| Batching | shared materials are mutated *in place* and identically for every mesh that references them, so `spacefaceBatchKey` grouping stays consistent; no material is split or replaced |
| Node names, sockets, hooks | traversal is read-only over `object.material`; no rename, reparent, add, or remove |
| Dimensions, pivots, collision | no transform is written; `COLLISION_HULL_MESH` / `COLLISION_HULL_Mesh` carry no mapped material |
| Idempotence | first touch snapshots the authored values into `material.userData.sfIndustrialBase`; every later application derives from that snapshot, so `f(f(x)) === f(x)` and the change is reversible |
| Unrecognised assets | `resolveIndustrialAssetKey` returns `null` for anything not in the six-item table → the pass is a no-op. No global material-name guess is ever applied |
| Unrecognised materials | a material whose name is absent from that asset's table is skipped and left byte-identical |
| Per-frame cost | applied **once** at the authored swap / blueprint load. No per-frame traversal, no per-frame clone, no allocation in any update path |
| Disposal | no material or texture is created, so nothing new needs disposing; works instance materials keep their existing `worksInstanceOwned` disposal path |

---

## 5. Final implementation and controller disposition

The first review rejected the white engine band and opaque pastel shield. Those effects were
reworked before acceptance: `b6f77401` gives the engine a short hot throat, cyan plasma and separate
indigo wake strands; the shield uses twelve transparent panels, thin seams and local contact light.
The real hull remains visible through the shield. Both effects keep their existing render passes.
The trail CPU sampler now matches the live shader, with an independent numerical reference.

The material pass is limited to Kestrel, Ashline Rig, the cargo capsule and Helios trade hub. The
Works refinery receives an ember colour on its already state-driven furnace slit; its shared body
materials and geometry remain intact. The live weak-point event now produces a directional fan of
pooled shards and three seam streaks, with reduced size/opacity and slower motion for accessibility. Loaded Massline force and colour
response and the existing concussion/shove profiles were retained after visual review.

The controller personally reviewed the complete source diff and current frames. KEEP: solid hull
surfaces, restrained trim, a distinct engine wake, readable loaded line and transparent shield.
The small same-camera off-thrust comparison showed no material loss of hull shape or surface detail.
It is a static material diagnostic, not one of the normal-speed action captures; camera easing differed
by less than 0.0002 world units, with unchanged projection and geometry. It does not support a claim
that all previous hull darkness came from material constants.

## 6. Current player-route evidence

All paths below are relative to `.devshots/pq190-shipping-strips/`. Images were captured at the
shipping camera with HUD text hidden. The local manifests retain source identity and actual clocks.

| Route | Retained frames | Measured simulation/wall time | Controller finding |
|---|---|---|---|
| Quiet flight | `quiet-ordinary-flight/1788716297639/` | 1.0014 | Short white nozzle, cyan/indigo wake; the wake no longer paints a white band across the planet. |
| Dense firing | `pq190-dense/b6f77401-dirty-483e0387/shove_light-physics_toolkit-s4242/review-firing-8-1788717244080/` | 0.616 whole recording; 0.960 selected firing window | Real held-fire input, nearby opponents and firing traces. The earlier automatic selection chose pre-firing frames and was discarded for action review. |
| Loaded Massline | `pq190-dense/b6f77401-dirty-483e0387/rope_swing-massline_rig-s4242/review-sequential-8-1788716876302/` | accepted by the normal-speed capture runner | Bent line becomes taut gold; its shape stays distinct from the engine wake. |
| Rover | `rover-productive-site/1788716471161/` | 0.9927 | Actual ArrowDown/ArrowRight movement and drilling: rover moves from (14,2) to (15,3), one vein clears and bore bites advance. |
| Shield response | `dense-shield-response/1788717810079/` | 0.9995 | Live combat owner applies nonlethal shield damage; transparent panel shell appears and fades. |

The rover site fixture contains a producing extractor; the refinery is starved for iron. This is
not evidence of refinery production. Furnace state behaviour is covered by the focused renderer
contract. The controlled mixed scene (`controlled-style-scene/1788713702026/`) includes actual
Kestrel, Ashline Rig, cargo capsule and Helios owners with authored asset admission, not preview
substitutes. The off-thrust pair is under `.devshots/pq190-coast-material-ab/1788717162302/`.

Earlier shield recordings at 9–16% speed are retained as failed capture attempts, not accepted
motion evidence. The settled capture waits for the actual authored pipeline/GPU admission queues
and then records at 99.95%. The runtime witness recorded a 5.4-second admission outlier; that loading
cost remains a production-matrix finding, not a claim of smooth startup or of a shield shader cost.

## 7. Verification and remaining review

- `check:baseline`: all 15 groups passed in 54.312 seconds after the bloom admission repair.
- 23 industrial material tests and three weak-point receipt tests passed. Existing VFX technique
  and sleep gates passed; trail sampler parity is within 6.939e-18 of the independent reference.
- Current runtime witness: simulation-frame work remains the largest steady bucket (p95 23.2 ms),
  followed by presentation (10.1 ms), simulation step (9.8 ms), render (7.1 ms) and UI (2.9 ms).
  The source before/after comparison establishes no new top bucket; these are not matched-run
  performance improvement numbers. No default quality or authored geometry was reduced.
- The user explicitly delegated creative approval to this controller. This records the controller's
  KEEP under that authority, not a fabricated direct owner response to unseen images.
- Independent action-read findings will be appended before the queue leaf is closed. Other asset
  metadata and broader campaign failures remain owned by the campaign; old worker failures are
  not excused as somebody else's work.
