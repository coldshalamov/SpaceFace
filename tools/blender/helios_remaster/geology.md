# Helios geology authoring

Helios has 42 starter-field and 28 outer-field `ast_common_rock` asteroids. The
world owner selects `place_asteroid_seamed` only for the first rock in each field;
the remaining rocks use the five procedural common geometries. Rescue-rock aliases
also use that common family. The individual rock A/B/C and graffiti GLBs are not
first-sector work in this campaign.

The procedural family retains its existing silhouettes. Its object-space geology
now gives a dominant dark structural break, bounded cool ferrite shoulders, and
quieter material grain. Root reviewed all five in the actual factory/illustration
pipeline and accepted their shape and mineral hierarchy.

The surveyed seamed landmark replaces its entire old corrugated host with the
shipping common-rock shear-fault construction, sized inside the frozen original
envelope. `geology.host.mjs` exports the actual factory geometry, pigment and UVs;
Blender constructs one coherent stone host with the common-rock maps, dry ORM and
restrained normal response. There are no separate top caps or retained wrinkled
lower mantle. Far LODs simplify this same mass.

Root accepted the coherent host in revision3. Revision4 replaces the remaining
projecting alteration ribbons with a broad two-branch fault, locally cut 0.48 m
into that accepted mass. Five low copper/teal mineral faces sit inside the
original surface; far LOD uses three. There are no pale rim ribbons or spikes.
The retained survey pins, routed cable, plate and registered lettering fit the
surface. Semantic markers, pivot and scan socket keep exact source transforms.
Mineral remains nonemissive with restrained mapped gloss. The final native costs
are 1,770 / 1,230 / 362 triangles and 5 / 5 / 4 material batches, below the inputs.
After Boolean separation the builder retains each batch's populated UV layer as
UV0; otherwise Blender can put an empty donor layer ahead of the stone mapping.
The export check rejects collapsed host coordinates and white fallback pigment.

Root accepted the complete final geometry and materials after viewing
`.devshots/tuneup/remaster-geology-r4-uv.png`, bound to candidate SHA256
`799ca30e0e6a674b7fa7c27a78f8706fc09efd75ffc0d3e147bbe6aab2574209`.
The scoped promotion wrapper is `.devshots/helios-remaster/geology/promotion.json`.
Source/release promotion remains root-owned; no further worker edits are pending.

Rebuild:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --threads 3 --python tools/blender/helios_remaster/geology.py
```

The builder is repeatable after promotion: it reads the frozen source from commit
`6371ef8d493987eaba2e5a94b64e20e6e26cf3ca` if the canonical GLB has changed, and
checks its SHA before authoring. It never writes shipping files. The complete
surfaced scene, packed textures, three LODs, exact markers, candidate GLB and report
are in `.devshots/helios-remaster/geology/`.

Root promotion map, after root's exact-candidate visual acceptance:

| Candidate | Canonical source |
| --- | --- |
| `.devshots/helios-remaster/geology/place_asteroid_seamed.glb` | `assets/ships/parts/places/place_asteroid_seamed.glb` |
| `.devshots/helios-remaster/geology/place_asteroid_seamed.blend` | `assets/ships/parts/blender/place_asteroid_seamed_authored.blend` |

Root owns source manifest metrics, generated release GLB, release package metadata,
and source/release validation. No shipping source or metadata was changed by this
worker. The candidate report binds hashes, input/output bounds, native LOD costs,
and the preserved root/marker transforms. There is no separate collision mesh in
this source; the unchanged asteroid entity radius and landmark metadata retain the
gameplay collision/scan contract.

For actual runtime art review, open the existing tuneup gallery and call:

```js
await (await import('/.devshots/helios-remaster/geology/gallery.mjs')).showGeology({ candidate: true })
```

The five common rocks still use the real visual factory. The sixth uses the exact
candidate bytes with production authored material profiles and shared illustration
lighting. The gallery owns no runtime cache assets; `window.geologyReview.dispose()`
removes only its review roots. Candidate art acceptance belongs to root, not this
builder's successful export or the numeric receipt.
