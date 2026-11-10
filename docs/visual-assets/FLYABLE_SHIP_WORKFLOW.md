<!-- LIFETIME: STABLE -->
# Flyable ship workflow — one ship, chase camera, no cabin kits

This is how to remaster **one** player or NPC flyable ship. It exists because the Hornet
loop spent many cycles on seats and studio cameras the player never sees, and because
factory ships were assembled from glued boxes whose hidden faces still get drawn.

Camera law: [`ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`](./ADVANCED_MODEL_TECHNIQUE_CONTRACT.md) §0.5.
Review law: [`MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md`](./MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md).
Packet: `PQ-050`, one leaf = one ship.

Do not run this on Hitch/Kestrel.

Places, pods, and 47-A props use the **same bar and the same cameras**. A cargo
spindle or nav buoy that reads as a tube+ring next to Hitch is below the bar even
if ships are unfinished. The live object list and hitch-collision rules:
[`design/program/GRAPHICS_3D_CAMPAIGN.md`](../program/GRAPHICS_3D_CAMPAIGN.md).

---

## 1. Chunks (attack these in order; each is a shippable slice)

Never “do the whole MTX list.” Never “do the whole fleet.” One ship, one chunk,
chase-camera stills, then stop or continue.

| Chunk | Player-visible result | Do | Do not |
|---|---|---|---|
| **A. Skin** | Silhouette names the role at 144 WU | One lofted hull. Clay `play_chase`. | Parenting boxes onto a sausage |
| **B. Wells** | Canopy, drives, radiators read as dark holes from above | Boolean **subtract** holes into the skin | Modeling a seat, console, or walkable cabin |
| **C. Separate parts** | Only what must be another material or must move | Wings/nacelles as lofted bodies; glass as a shell | Bolts, joints, interior mating faces, hidden hull patches |
| **D. Surfaces** | Paint / metal / glass read at 144 WU | Unique UVs + bake on the **visible** shell | Micro-greeble to hide a bad silhouette |
| **E. Export cleanup** | Same picture, fewer wasted triangles/draws | Computer joins by material and reports chase-invisible faces | Agents hand-deleting faces |

A chunk that only exists in a `bay_interior` crop did not happen.

---

## 2. Reference images (required before modeling a mass)

Agents with image generation: generate a **component** sheet for the thing the
chase camera will see (wing planform, drive throat as a well, canopy as a framed
dark rectangle). Save it under that ship’s `reference/` with provenance.

Agents **without** image generation, in this order:

1. Use a reference file already in that ship’s `reference/` folder. If it exists, do not skip it.
2. Else run the Codex terminal handoff — Codex has image generation. Do not substitute a
   paragraph of prose for a picture.

```powershell
node .grok/skills/spaceface-blender-material-truth/scripts/request_imagegen_reference.mjs `
  --repo <repo> `
  --prompt <component-prompt.md> `
  --crop <authoritative-component-crop.png> `
  --component-reference-decision codex_handoff `
  --origin-capability-premise worker_lacks_image_generation `
  --output-dir <new-reference-bundle-inside-repo>
```

Law and fail-closed rules: [`AGENT_PROMPTS.md`](./AGENT_PROMPTS.md) § E.

Forbidden as reference work: whole-ship beauty redesigns, cockpit interiors, seats,
PBR/normal maps generated as if they were production textures.

---

## 3. How a ship should be built (so hidden faces do not exist)

Good: **one skin, holes cut in it.** The hull is a shell. Bays and throats are
booleans. Glass is a thin shell over a hole. Separate meshes exist only for a
different material or a moving part.

Bad: a hull box plus twenty smaller boxes parented to it. Each box has a face
against the hull. The hull has a patch under every box. The player never sees
those faces. The GPU still transforms them, and often shades them (overdraw).

Joining those boxes at export (Hornet already does `join` per material) **does
not delete** the hidden faces. It only reduces draw calls. The interior
triangles are still in the mesh.

Agents must not crawl the model deleting faces by eye. That is slow and they
will delete the wrong ones.

The computer can mark faces the **live chase camera never hits**. Report first;
delete only as an export step after a dry-run:

```text
blender --background --python tools/blender/chase_visible_faces.py -- --glb <exported.glb>
```

That script shoots rays from the real chase poses (60° tilt, D=144 and D=58,
eight headings). Faces with zero hits are *candidates*, not automatically gone.
Collision meshes and sockets are skipped. Do not run this as a quality close.

---

## 4. What actually hurts the frame (do not confuse these)

| Problem | What it is | What to do | What not to do |
|---|---|---|---|
| **Draw calls** | Each mesh+material is a GPU submit. Hitch source is 57 meshes / ~1800 triangles. Crowded fleets of unique hulls pay this. | Merge by material at export (already). Runtime static batch + opaque batching (`PQ-129.12`). | Lowering bloom, emptying the table |
| **Hidden triangles / overdraw** | Glued kits still contain interior faces; the hull under a part still shades, then a part shades on top. Cathedral already needed a depth prepass for this. | Build as a shell with holes; computer-mark chase-invisible faces; depth prepass only if a census names fill-rate | Agents deleting faces by hand; shrinking hail range |
| **Backfaces** | The underside of a closed box, facing the hull, is often already culled (`FrontSide`). | Keep closed surfaces FrontSide | Double-sided on a closed hull |
| **Tiny pieces at play size** | Fasteners and joints that are <1 px at 144 WU | Do not model them. LOD / tiny-on-glass (`PQ-129.14`) | Modeling a thousand bolts to look “manufactured” |
| **Cabin furniture** | Seats, yokes, walkable decks | Do not model. `outside_supported_view` | MTX-04 as a cockpit kit |

Measured hitch work already named the **scene submit / HDR present** as the pole,
not “too many seat triangles.” Interior-face cleanup is real and worth doing
**as a computer export step**, not as the campaign. Do not cut default quality
to hide a kit-bash mesh.

---

## 5. Done for one ship

- Chunks A–D have chase stills (`play_chase`, `play_chase_abeam`, `play_chase_close`).
- No seat/console/cabin kit.
- Export is joined by material. A chase-invisible-face report exists for the
  candidate (dry-run). Deletion is optional and reversible.
- Five reviewed chase cycles only if the packet requires them; a chunk can
  commit earlier if the stills at 144 WU actually improved.
- Hitch freeze set untouched. Only this ship wired.
