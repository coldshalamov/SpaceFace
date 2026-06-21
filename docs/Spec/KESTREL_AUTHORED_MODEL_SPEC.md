# SF-K0 Kestrel "BORROWED TIME" — Authored Model Specification

**Status:** Spec — awaiting an authored GLB to replace the procedural builder.
**Purpose:** Hand-off brief for a 3D modeler (human or AI). Specific enough that the result loads and
satisfies every automated contract; open enough that the modeler owns the sculpt. The game's graphics
are currently limited by *procedurally generated box-loft geometry*, not by the renderer. This spec
defines the authored-model deliverable that unblocks real visual quality.

> **The one-sentence brief:** Model a scrappy, personally-owned, hard-used frontier scout ship called
> the *Kestrel* — a 28 m "death ship that still starts every morning" — as a clean, game-ready glTF,
> and the rest of the pipeline is already wired to make it look great.

---

## 0. Why this exists (context for the modeler)

The Kestrel is currently built at runtime from `BoxGeometry`/`CylinderGeometry` and a lofted tube in
`src/render/ships/kestrelHero.js`. It reads as "Starfox / N64" because **no amount of post-processing
makes a box-loft look sculpted** — hard 90° box edges catch light as flat facets instead of crisp
machined bevels, and there are no baked surface details.

The renderer is *not* the bottleneck. It already has: PBR materials (`MeshStandardMaterial`), a PMREM
environment map baked from the live nebula backdrop (so chrome/metal reflects real space), 3-point
lighting (key 1.7 / rim 0.7 / fill 0.35) with 2048 PCFSoft shadow maps, UnrealBloom, ACES tone mapping,
contact shadows, and an LOD system. **A well-authored glTF dropped into this scene will look good.**

The deliverable defined here replaces the procedural builder's output with a loaded, authored model.

---

## 1. Hard contracts (non-negotiable — the automated checks assert these)

These are enforced by `scripts/check-kestrel-asset.mjs` + `check-kestrel-silhouette.mjs`. If the model
violates any of these, it will not pass CI. Everything else in this doc is guidance.

### 1.1 Coordinate system & units
- **Right-handed**, **+X = forward (nose)**, **+Y = up**, **+Z = starboard (right)**.
- **Units = metres.** Do not scale the root node; bake scale into the mesh.
- The model's **+X end is the nose.** The engine rotates the mesh by `-entity.rot` about Y, so +X
  always points where the ship flies.

### 1.2 Dimensions (world-space bounding box)
- **Length (X):** 24–32 m. **Target 28 m.**
- **Beam (Z):** ~14 m.
- **Height (Y):** ~6 m.
- The top-down **silhouette aspect (length / beam) must be between 1.5 and 2.8** (target ~2:1). This
  is asserted by rasterizing the silhouette to a 96 px thumbnail.
- **Silhouette reads (asserted):** forward is the long axis; broadest point near midship; prow tapers
  narrower than midship; single narrower aft (one drive, not a flat brick). Do **not** make a
  symmetric fore/aft dart — the nose must read as the nose.

### 1.3 Budget
- **Triangles: ≤ 25,000** (only TRIANGLES counted). Target 12–18k for the hero; LOD1/LOD2 are optional
  (see §4) but welcome.
- **GLB file size: ≤ 1,000,000 bytes (1 MB).** Texture compression (KTX2/ BasisU) is supported by the
  loader I will wire; otherwise keep textures 2K and JPEG-compressed.

### 1.4 The 7 sockets — REQUIRED as named Empty nodes

The combat, mining, VFX, and camera systems look these up **by node name**. They must be `Empty`
nodes (no geometry) at these exact **local translations** (relative to the model root), each carrying
the `forward` direction. Export them as bones/empties named exactly:

| Node name (exact) | Translation (x, y, z) | forward | Role |
|---|---|---|---|
| `SOCKET_Weapon_Front` | `(12.0, 0.82, 0)` | `(+1, 0, 0)` | weapon muzzle |
| `SOCKET_Mining_Front` | `(12.35, -0.98, 0)` | `(+1, 0, 0)` | mining emitter |
| `SOCKET_Engine_Main` | `(-12.75, -0.05, 0)` | `(-1, 0, 0)` | engine nozzle |
| `SOCKET_Utility_Dorsal` | `(-1.4, 1.95, 3.75)` | `(0, +1, 0)` | dorsal utility hardpoint |
| `SOCKET_Cargo_Ventral` | `(-0.8, -2.05, 0)` | `(0, -1, 0)` | ventral cargo bay |
| `SOCKET_Trail_Main` | `(-13.1, -0.05, 0)` | `(-1, 0, 0)` | engine trail VFX spawn |
| `SOCKET_Camera_Focus` | `(0, 0.3, 0)` | `(+1, 0, 0)` | chase-cam look-at |

> If your sculpt moves the nose/engine slightly, keep the *sockets* at these coordinates — they're
> gameplay anchors, not visual markers. The weapon fires from `SOCKET_Weapon_Front`; a misplaced
> socket means lasers spawn from empty space.

### 1.5 Runtime hook nodes (named groups the engine drives)

For the engine to animate/damage the model, name these nodes (Empties or groups; the engine finds them
by traversal). If omitted the ship still works but loses drive motion + damage reads:

- `HOOK_DriveFan` — a node the engine spins (turbine/impeller). Put it at the engine nozzle, axis = X.
- `HOOK_DriveCore` — the bright engine core mesh/group. Engine pulses its `emissiveIntensity`. **Must
  stay visible through critical damage.**
- `HOOK_DrivePlume` — the plume/glow mesh/group (transparent/additive). Engine scales + dims it with speed.
- `HOOK_NavLight_*` — one or more nav/sensor light meshes (emissive). The damage system dims/flickers
  these. Name at least 2 (`HOOK_NavLight_01`, `HOOK_NavLight_02`, ...).
- `HOOK_Secondary_*` — one or more "shed at critical damage" parts (a utility pod, an antenna, a panel).
  These go invisible when the ship is near death and reappear on repair.
- (optional) `HOOK_Decal_*` — flank decals (the BORROWED TIME stencil, shark teeth). The LOD system
  hides these at distance.

### 1.6 Manifest file (must accompany the GLB)

A `kestrel_manifest.json` must sit beside the GLB. Schema (the check asserts exact field agreement
with the GLB, so generate it from the exported model, don't hand-write the metrics):

```jsonc
{
  "schemaVersion": 1,
  "assetId": "SF_K0_KESTREL_BORROWED_TIME",      // exact
  "displayName": "SF-K0 Kestrel / BORROWED TIME",
  "coordinateSystem": { "forward": "+X", "up": "+Y", "unit": "metre" },
  "runtimeSource": "authored",                    // was "src/render/ships/kestrelHero.js"
  "files": { "referenceModel": "kestrel.glb" },
  "metrics": {
    "geometry": { "meshCount": <N>, "triangleCount": <N>,
                  "boundsMin": [<x>,<y>,<z>], "boundsMax": [<x>,<y>,<z>] },
    "glb": { "triangles": <N>, "meshes": <N>, "nodes": <N>, "bytes": <N> }
  },
  "materials": [ /* ≥ 8 roles, each: name, color #hex, metallic 0..1, roughness 0..1, alpha 0..1, emissive #hex|null */ ],
  "sockets": [ /* the 7 from §1.4, each: name, translation[3], forward[3], role */ ]
}
```

The check asserts: `metrics.glb.triangles === actual GLB triangles`, `boundsMin/Max` match the
POSITION accessor min/max (±1e-3), and materials ≥ 8 with valid PBR ranges. **Generate metrics from
the file, don't estimate.**

---

## 2. Art direction — §8.1 Free Frontier grammar (the modeler owns the sculpt within this)

The Kestrel is the **reference ship** for the game's "Free Frontier / independent" faction grammar.
Verbatim from the canonical style guide:

> **Reading:** adapted, repaired, personally owned, difficult to replace.
> - protective pressure shells over visible mechanical structure
> - mismatched modules and local repairs
> - cyan identity paint used as broken stripes, sensor marks, and navigation cues
> - warm practical lights
> - hand-applied typography and old ownership evidence
> - moderate grime concentrated by cause
> - one or two visibly nonstandard systems

**Fiction:** *"A death ship that still starts every morning."* A Tier-0 scout / manual miner / courier.
Haunted ex-gangster runner nobody else would fly. Motto stenciled on the flank: **BORROWED TIME**,
mascot = a ghost service stencil, kill tally = 13.

### 2.1 The reads (what the silhouette must communicate)

- **3-second read (thumbnail):** guarded wedge hull · split shoulders · single axial cyan drive ·
  broken cyan centerline · paired sensor brow.
- **30-second read (close inspection):** port field-repair panel · starboard utility pod · landing
  skids · visible pulse weapon · visible mining emitter · BORROWED TIME stencil.
- **Wear rule (important — don't over-weather):** *Only contact, heat, service, leading-edge, and
  repair zones receive strong wear.* This is a personally-maintained ship, not a derelict. The owner
  keeps it flying. Grime is **concentrated by cause** (engine scorch, docking scrapes, foot-wear near
  hatches), not uniform filth.

### 2.2 Posture & character

This ship should feel like a **beat-up but loved personal truck**, not a sleek fighter and not a junk
pile. Think: a used spaceship equivalent of a maintained-but-old off-road vehicle with aftermarket
parts and a custom paint job. It has *character through asymmetry and repair*, not through spikes or
menace (that's a different faction).

---

## 3. Material & texture spec (the biggest quality lever — do the high-to-low bake)

The current model uses flat colors with procedural noise. **The single biggest upgrade is a proper
high-to-low bake.** Standard professional pipeline:

1. **Sculpt** a high-poly version (millions of tris): every panel line, rivet, gouge, welded seam,
   greeble, wear dent.
2. **Retopologize** to a clean low-poly game mesh (12–25k tris) with good edge flow and **chamfered
   edges**. (Chamfered/beveled edges that catch a highlight are *the* thing that reads as "machined
   metal" vs "flat box." Do not leave hard 90° edges on anything that should read as manufactured.)
3. **UV unwrap** the low-poly (single or few atlases; minimize seams on prominent faces).
4. **Bake** from high → low:
   - **Normal map** (tangent-space, OpenGL/green-up, 2K) — panel lines, greeble, bevels, dents.
   - **Ambient occlusion** (2K) — contact darkening in crevices, under overhangs, between panels.
   - **Curvature** (2K, optional but recommended) — edge wear masks, concave/convex masks.
   - **Metallic / Roughness** (2K) — paint chipping exposing bare metal, varied surface roughness
     (worn leading edges rougher, fresh paint smoother).
5. **Hand-paint the baseColor/albedo** at 2K (Substance Painter / ArmorPaint / Material Maker).

### 3.1 Material roles & palette (use these exact colors as the anchor; vary within them)

The existing model uses 13 named material roles. Match these (the manifest lists them); the hex values
are the **identity anchor**, but the *baked texture maps* carry the real variation on top:

| Role | Base color | metallic | roughness | Notes |
|---|---|---|---|---|
| `Shell_Aged_Warm_Gray` | `#817b70` | 0.18 | 0.58 | primary hull — aged ceramic paint over metal |
| `Shell_Replacement_Dark` | `#4e5050` | 0.28 | 0.62 | a mismatched replacement panel (darker, slightly different sheen) |
| `Mechanical_Graphite` | `#10161b` | 0.78 | 0.42 | exposed structure / sub-frame (bare metal, reads against painted shell) |
| `Load_Gunmetal` | `#252b30` | 0.88 | 0.29 | weapon/mount hardware (brighter metal, low roughness = sharp highlight) |
| `Frontier_Cyan` | `#4ecbe0` | 0.08 | 0.52 | identity paint — broken stripes, sensor marks, nav cues |
| `Canopy_Smoked` | `#061a22` | 0.08 | 0.14 | cockpit glass (transmission/clearcoat; see §3.2) — alpha 0.92, double-sided |
| `Sensor_Cyan` | `#a0eef8` | 0.05 | 0.18 | emissive sensor brow lights (`#8adce8`) |
| `Drive_Core` | `#e6fdff` | 0.02 | 0.16 | bright emissive engine core (`#ffffff`) |
| `Drive_Cyan` | `#4ecbe0` | 0.04 | 0.20 | emissive cyan drive glow (`#4ecbe0`) |
| `Practical_Amber` | `#e9a34a` | 0.04 | 0.38 | emissive warm practical lights (`#e9a34a`) |
| `Warning_Mustard` | `#c28b35` | 0.06 | 0.66 | hazard markings (non-emissive) |
| `Field_Repair_Sage` | `#53665a` | 0.22 | 0.72 | the port field-repair patch (mismatched green-grey) |
| `Oxidized_Rust` | `#6b3f2b` | 0.02 | 0.86 | neglected/oxidized thermal surfaces (per the wear rule) |

> **Metalness hierarchy matters:** the hull is mostly dielectric (low metalness = painted), while
> exposed hardware is high-metalness (bare metal). That contrast is what carries material readability.
> If everything is metalness 0.5 it reads as plastic.

### 3.2 Canopy glass (MeshPhysicalMaterial)

Use glTF transmission/clearcoat for the canopy: transmission ~0.6, thickness 0.5, ior 1.4, clearcoat
1.0. The renderer already supports this. A real refractive smoked canopy is a huge readability win.

---

## 4. LOD (optional but rewarded)

The engine has an LOD system (`lod0` / `lod1` / `lod2` at >300px / 100–300px / <100px). Exporting
glTF LODs (or separate `kestrel_lod1.glb` / `kestrel_lod2.glb`) lets me drop decals at lod1 and swap
to a coarser mesh at lod2. If you only deliver lod0, that's fine — I'll generate coarse LODs at
import. **Decals (`HOOK_Decal_*`) must be separable nodes** so lod1 can hide them.

---

## 5. Deliverable checklist

Hand back, in `assets/ships/kestrel/`:

- [ ] `kestrel.glb` — the authored model, ≤ 25k tris, ≤ 1 MB, +X forward, metres.
- [ ] `kestrel_manifest.json` — generated from the GLB, matching §1.6 exactly.
- [ ] (optional) `kestrel_lod1.glb`, `kestrel_lod2.glb`.
- [ ] (optional) source `.blend` for future iteration.

Verify yourself before handing back:
1. The 7 socket nodes exist at the exact translations in §1.4, named exactly.
2. Bounds are ~28 × 6 × 14 m; aspect 1.5–2.8.
3. ≤ 25k tris, ≤ 1 MB.
4. Normal + AO + metallic/roughness maps are present (not flat colors).
5. Edges are chamfered (no hard 90° on manufactured surfaces).
6. Opening the GLB in a glTF viewer, +X points to the nose and the silhouette reads as a guarded wedge.

---

## 6. What I (the code side) will wire once the GLB arrives — the torch

So the modeler knows the integration is handled. None of this exists yet; it is my deliverable:

1. **`GLTFLoader` into the runtime.** Add the Three.js GLTFLoader addon to `vendor/addons/` and a loader
   cache in the render system. Currently *no* `GLTFLoader` exists in the codebase — the existing
   `kestrel_reference.glb` is only ever parsed by a check script, never loaded by the game.
2. **Replace the procedural builder for the player Kestrel.** `visualOverrides.js` already intercepts
   the player Kestrel (`team:0`, `defId:'ship_kestrel'`) and routes it to `buildKestrelHero()`. I'll
   point that at the GLB loader instead, keeping the exact `assetId` (`SF_K0_KESTREL_BORROWED_TIME`).
3. **Bind the HOOK_ nodes** to the engine's drive-micro-motion / damage / LOD drivers (reuse the
   `shipDamage.js` + `finalizeShip` glue from `shipKit.js`). Named nodes → part buckets. The 7 sockets
   carry over from named empties (no coordinate rework needed).
4. **Preserve every check.** The 5 Kestrel checks (asset / hero / silhouette / damage / leak) must stay
   green. The asset check reads the GLB directly, so the model + manifest must satisfy §1; the others
   test runtime behavior, which I handle in code.
5. **Env-map wiring.** High-metalness materials in the GLB will automatically pick up the PMREM nebula
   reflection already baked in the renderer — no action needed from the modeler.

---

## 7. The ambition lever (for the modeler)

The contract above is the floor, not the ceiling. Within it, **push hard on craft**:
- Real panel topology with recessed seams and proud plates (not a smooth blob, not flat boxes).
- Asymmetric storytelling: the port side has a visibly different-color field-repair patch; the
  starboard has a nonstandard utility pod; one landing skid is newer than the others.
- A readable, hand-stenciled "BORROWED TIME" + ghost mascot + 13 kill tally on the flank (can be an
  emissive decal plane or baked into the albedo).
- A cockpit you can imagine sitting in: recessed, smoked glass, interior depth (a dark interior deck
  visible through the canopy).
- Surface micro-detail that catches the key/rim/fill lights: greebles, vents, access hatches, cable
  runs — but disciplined, concentrated on service/leading-edge zones per the wear rule.

The renderer will do the rest. A model with real bevels and a baked normal/AO map, lit by the existing
3-point setup under the PMREM nebula reflection, with bloom on the cyan drive — that is the jump from
"N64" to "indie/AA ship game."
