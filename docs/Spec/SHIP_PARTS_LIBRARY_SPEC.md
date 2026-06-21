# SpaceFace Ship Parts Library — Specification & Authoring Brief

**Status:** Spec. This is the ambitious path: instead of one authored model, author a **reusable parts
library** that lifts *every* ship to near-authored quality through procedural kit-bashing. Standard
studio technique for ship variety at scale (No Man's Sky, Starfield generic ships, Elite Dangerous).

> **One-line brief for the modeler:** Author a library of ~24 high-quality, individually-modeled
> spaceship *parts* — cockpits, engines, weapons, fins, greeble kits — as game-ready glTF files. These
> are **not whole ships**; they are building blocks that the game's procedural assembler composes into
> every ship in the game. Your parts carry the quality; the assembler carries the variety.

---

## 0. The strategy (why a parts library, not one model)

A single authored Kestrel leaves the other 12 ships + all enemies looking "Starfox 64." Authoring every
ship by hand is unsustainable. The scalable move is **modular kit-bashing**: a curated library of
authored parts that compose.

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Authored parts │  +  │ Procedural hull  │  →  │  Every ship looks│
│  (the quality)  │     │  + assembly code │     │  authored-ish    │
│  (GLB library)  │     │  (the variety)   │     │  infinite variants│
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

This is also how the codebase already works conceptually: `visualFactory.js` has `weaponProp()`,
`engineProp()`, `miningProp()`, `shieldRingProp()` — currently procedural boxes. This spec upgrades those
to authored-GLB loaders and adds new part categories. **It's an evolution, not a rewrite.**

---

## 1. The two halves of the torch-pass

### Your half (the hard art): the parts library
Author the part GLBs in §3. Each is small (1–4k tris), self-contained, with its own baked texture set,
and exports **socket/mount empties** so the assembler can place it deterministically.

### My half (the integration): the kit-bash assembler
Once parts land I:
1. Add `GLTFLoader` to the runtime (none exists today — the current `kestrel_reference.glb` is never
   loaded, only parsed by a check script).
2. Build a `partsLibrary.js` loader/cache (per-part GLB → cached `THREE.Group`, instanced per-ship).
3. Refactor `weaponProp`/`engineProp`/`miningProp`/`shieldRingProp` + the 7 bespoke ship builders to
   **compose authored parts** instead of raw boxes.
4. Bind authored parts' `HOOK_` empties to the existing drive-motion / damage / LOD drivers (reuse
   `shipKit.js` `finalizeShip` + `shipDamage.js`).
5. Keep every check green; the contracts assert sockets + dimensions + assetIds, not topology.

---

## 2. Hard contracts (non-negotiable — enforced or required by the assembler)

### 2.1 Coordinate system & units (all parts)
- Right-handed, **+X forward, +Y up, +Z starboard, metres.**
- Every part's **origin = its mount point** (see §2.3). Do not offset the geometry from the origin.
- A part must look correct placed at world origin with no rotation.

### 2.2 Per-part budget
- **Triangles: 500–4,000** per part (cockpits/engines on the higher end; greebles/fins lower).
- **GLB size: ≤ 350 KB** per part (texture compression welcome; KTX2/BasisU supported).
- **Texture maps: 1K (1024²)** for small parts, 2K for hero parts (cockpit, main engine).
- Required maps: `baseColor` (sRGB), `normal` (tangent, OpenGL green-up), `ORM` (AO + Roughness +
  Metallic packed R/G/B — glTF standard), or separate. **No flat colors.**

### 2.3 Mount/rotation conventions (the assembler depends on these)

Each part exports **named Empty nodes** the assembler reads. The part's local origin is where it
attaches to the hull. Orientation conventions:

| Part category | Origin = | Forward (+X) points |
|---|---|---|
| Engine / nozzle | nozzle ring center, aft face | toward exhaust (−X outward) |
| Weapon / turret | muzzle base | toward muzzle (+X outward) |
| Cockpit / canopy | canopy root, hull deck | forward (+X) |
| Fin / wing / radiator | root edge | forward (+X) |
| Greeble / vent / hatch | attachment face | outward from face (normal +Y or ±Z) |
| Sensor / antenna | mount base | up (+Y) or forward (+X) |
| Landing gear / skid | contact point (ground) | up (+Y) |

Export these **named empties** where present (assembler attaches child parts / VFX to them):
- `MOUNT_Child` — optional child attachment point (e.g. an engine with a sub-nozzle).
- `HOOK_Emissive` — if the part has an emissive element the engine should pulse/dim (engine cores,
  nav lights, weapon charge glow). Assembler drives `emissiveIntensity`.
- `HOOK_Spin` — if the part has a spinning element (turbine fan, weapon barrel spin). Assembler
  rotates about X.
- `SOCKET_*` — parts may declare their own sub-sockets (a weapon with a `SOCKET_Muzzle`).

---

## 3. The parts manifest (what to author)

Grouped by category. **Tier the effort:** P0 = needed for a visible jump across all ships; P1 =
multiplies variety; P2 = polish. Aim for P0 + a few P1 to start; the assembler degrades gracefully on
missing parts.

### 3.1 COCKPITS / CANOPIES (P0 — 3 variants) — highest readability impact
A ship's cockpit is its "face." Currently flat boxes. Author 3 canopy styles with **smoked refractive
glass + visible interior deck + framing**:
- `cockpit_dome` — bubble canopy (scout/courier; the Kestrel uses this).
- `cockpit_slab` — armored bridge (authority/corporate; Concord/Meridian).
- `cockpit_recessed` — flush sensor slot (smuggler/alien; Quiet/Vael).
Each: transmission/clearcoat glass (transmission ~0.6, ior 1.4, clearcoat 1.0), a dark interior deck
mesh inside so depth reads through the glass, and a frame ring. ~2–3k tris, 2K maps.

### 3.2 ENGINES / DRIVE NOZZLES (P0 — 4 variants) — the "alive" center of every ship
Currently flat emissive cylinders. Author real nozzles with **interior turbine/impeller detail + a
bright core + heat discoloration**:
- `engine_ion_small` — single small ion nozzle (scouts/couriers).
- `engine_ion_twin` — twin-pack (fighters/interdictors).
- `engine_industrial` — crude rough industrial nozzle (miners/barges; scorched, asymmetric wear).
- `engine_resonator` — alien/nozzle-less resonant glow facet (Vael).
Each exports `HOOK_Emissive` (the core) + `HOOK_Spin` (the turbine) + `MOUNT_Child` (plume attaches
here). The assembler attaches the speed-reactive plume VFX. ~2–4k tris, 2K maps.

### 3.3 WEAPONS / TURRETS (P1 — 4 variants)
Currently `weaponProp()` is a box. Author:
- `weapon_pulse_cannon` — fixed-forward pulse cannon (Kestrel/Concord).
- `weapon_heavy_cannon` — oversized pirate cannon (Reaver) — asymmetric, bolted.
- `weapon_turret_dual` — dual-mount turret (Meridian/Drift).
- `weapon_lance` — long sniper lance (Vael) — crystalline.
Each exports `SOCKET_Muzzle` (where the laser VFX spawns) + `HOOK_Emissive` (charge glow). ~1–3k tris.

### 3.4 WINGS / FINS / RADIATORS (P1 — 4 variants)
Author planform parts that read as real airframe/thermal surfaces:
- `fin_wedge` — angled combat wing (fighters).
- `fin_radiator_grid` — vented thermal radiator (corporate/industrial).
- `fin_swept_smuggler` — low-profile blade wing (Quiet).
- `fin_crystalline` — hex-facet alien plane (Vael).
Each: thin profile, beveled leading edges (the highlight read), optional `HOOK_Emissive` edge lights.

### 3.5 STRUCTURAL / GREEBLE KITS (P1 — 5 packs)
The "detail multiplier." Author small attachment packs the assembler scatters on hull decks:
- `greeble_vents` — vent slats + intakes (5–8 pieces).
- `greeble_hatches` — access hatches + bolted plates (5–8 pieces).
- `greeble_pipes` — cable runs + coolant pipes (4–6 pieces).
- `greeble_rcs` — reaction-control thruster quads (3–4 pieces).
- `greeble_antennas` — sensor masts + comm arrays (4–6 pieces).
Each piece ≤ 500 tris, share a 1K atlas per pack. These replace the procedural `scatterGreeble()`.

### 3.6 LANDING GEAR / SKIDS (P2 — 2 variants)
- `skid_trio` — three landing skids (Free Frontier; one visibly newer = storytelling).
- `skid_quad` — four heavy gear (industrial/corporate).

### 3.7 CARGO / UTILITY PODS (P2 — 3 variants)
- `pod_utility` — dorsal utility pod (the Kestrel's nonstandard system).
- `pod_cargo_container` — standardized container (Meridian; stackable).
- `pod_repair_patch` — bolted field-repair panel (Free Frontier / pirate).

### 3.8 Total target
**~24 parts** across categories. Each is small and fast to author; the library compounds.

---

## 4. Material & texture spec (the quality lever — do the high-to-low bake)

The current ships use flat colors + procedural noise. **The bake is what kills the "Starfox" look.**
Per-part standard pipeline:

1. **Sculpt** high-poly (1–5M tris): every panel line, rivet, gouge, weld seam, greeble.
2. **Retopologize** to low-poly (per §2.2) with **chamfered/beveled edges on every manufactured
   surface.** *(This is the #1 readability lever: a beveled edge catches a crisp highlight line that
   reads instantly as "machined metal." A raw box's hard 90° edge catches light as a flat facet. Every
   ship today is boxes → every edge is razor → the "cheap" look.)*
3. **UV unwrap**, single atlas per part.
4. **Bake** high → low:
   - **Normal** (tangent, OpenGL, green-up) — panel lines, greeble, bevels, dents.
   - **Ambient Occlusion** — contact darkening in crevices, under overhangs. *(Critical for depth
     read; currently zero AO on any ship.)*
   - **Curvature** (optional) — edge-wear + convex/concave masks.
5. **Hand-paint baseColor + metallic/roughness** (Substance Painter / ArmorPaint / Material Maker).
   - **Metalness hierarchy:** hulls are dielectric (metalness ~0.15–0.3 = painted); exposed hardware
     is high-metalness (~0.7–0.9 = bare metal). The contrast carries material readability.

### 4.1 Palette anchors (the game's identity; vary within these per part)
Anchors the assembler tints per faction (so one cockpit part recolors across all 7 factions):
- Hull base (paintable): a neutral grey/tan the assembler multiplies by faction hue.
- Accent/emissive cyan `#4ecbe0` (Free Frontier), gold `#F2B233` (Meridian), crimson `#D8334A`
  (Reach), blue `#3A78FF` (Concord), teal `#2FCFA0` (Vael), violet `#7A5FB0` (Quiet).
- Keep emissive elements as separate materials/vertex-color-masked so the assembler can key them to
  faction emissive color.

> **Tintability contract:** separate the part's base hull material from its accent/emissive material so
> the assembler can recolor per faction. A single-material part is fine for alien/non-faction items.

---

## 5. LOD (optional, rewarded)
Per-part lod1/lod2 meshes (or separate `*_lod1.glb`). The assembler drops to lod1 at <300px and lod2 at
<100px. Without these I generate coarse LODs at import.

---

## 6. Deliverable & layout

```
assets/ships/parts/
  cockpits/    cockpit_dome.glb  cockpit_slab.glb  cockpit_recessed.glb
  engines/     engine_ion_small.glb  engine_ion_twin.glb  engine_industrial.glb  engine_resonator.glb
  weapons/     weapon_pulse_cannon.glb  weapon_heavy_cannon.glb  weapon_turret_dual.glb  weapon_lance.glb
  fins/        fin_wedge.glb  fin_radiator_grid.glb  fin_swept_smuggler.glb  fin_crystalline.glb
  greebles/    greeble_vents.glb  greeble_hatches.glb  greeble_pipes.glb  greeble_rcs.glb  greeble_antennas.glb
  gear/        skid_trio.glb  skid_quad.glb
  pods/        pod_utility.glb  pod_cargo_container.glb  pod_repair_patch.glb
  parts_manifest.json   ← a registry: part id, category, mount, sockets, hooks, tris, faction-tintable
```

`parts_manifest.json` is the registry the assembler reads. Per part:
```jsonc
{
  "id": "engine_ion_small", "category": "engines", "file": "engines/engine_ion_small.glb",
  "tris": 2400, "tintable": { "hull": "Material_Hull", "accent": "Material_Accent" },
  "hooks": ["HOOK_Emissive", "HOOK_Spin"], "mount": "MOUNT_Child", "sockets": []
}
```

---

## 7. Verify-before-handoff checklist (per part)
1. Origin = mount point; +X forward; metres.
2. Opens in a glTF viewer at origin, no rotation, looking correct.
3. ≤ budget tris/bytes; normal + AO + metallic/roughness present (no flat colors).
4. Manufactured edges chamfered (no hard 90°).
5. Named hooks/sockets/mount empties present and correctly placed.
6. Tintable materials named so the assembler can recolor per faction.

---

## 8. The ambition signal (for the modeler)

This is a **studio-grade modular pipeline**, not "make me one ship." The goal is that *no ship in the
game looks procedural* — because the parts are authored, and the assembly is invisible. The contract
above is the floor. Within it, push on:
- **Beveled, chamfered everything** (the #1 lever — real edge highlights).
- **Sculpted + baked detail** (panel lines, rivets, welds, gouges — not procedural noise).
- **Real material contrast** (painted dielectric hull vs bare-metal hardware).
- **Storytelling through asymmetry** within each part (a slightly-worn leading edge, an off-center bolt
  pattern) that compounds when assembled into hundreds of variants.
- **Refractive smoked canopy glass with interior depth** — the single highest-readability part type.

The renderer will do the rest: it already has PBR, a PMREM nebula reflection, 3-point lighting with
2048 PCFSoft shadows, UnrealBloom, ACES tone mapping, and an LOD system. Authored parts dropped into
that pipeline are the jump from "Starfox 64" to "indie/AA ship game."
