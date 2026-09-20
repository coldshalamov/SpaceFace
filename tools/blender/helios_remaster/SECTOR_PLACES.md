# Helios places, equipment and aftermath

This authoring pass covers the 33 nonship models enumerated in
`sector_places.contract.json`. It preserves existing assets and replaces the weak
manufactured components identified in the controller's normal-camera review.

The city keeps its radial architecture and gains sheltered approach galleries.
Coalition architecture has actual service courts and supported cooling leaves.
The gate gains inward-facing induction shoes. Lane furniture retains its individual
silhouettes and gains rooted service housings, legible deep-blue enamel and clean
cast structural interfaces. Cargo eyes are rooted to the real roof, not a global
bounding-box height. The docking approach stays open.

Weapons share fabricated case shoulders, dark receiver openings and recessed
bores, while keeping separate mechanisms: rotary cluster, paired turret, exposed
accelerator rails, recoil sleeves, folded lance petals and pulse compression rings.
The original Gatling's floating heat disc was removed; six open barrels sit at
the actual barrel-cluster end. Sockets and collision transforms remain intact.

The six aftermath bodies required individual primary-component reconstruction:

- Cargo: folded corrugation, open I-frame, missing roof sheets and peeled seams.
- Cockpit: tapered pressure cheeks, broken glazing frame, torn deck and load runners.
- Engine: thin-walled bell and liner, segmented jacket, turbine stators and torn mounts.
- Tank: rolled pressure shell with an actual missing sheet, curled lips and formed saddles.
- Turret: paired armor cheeks, open recoil cradle and a broken bearing ring.
- Spar: exposed I-section, web stiffeners, sheared flange and receiver cheeks.

These manufacturing details are **ART EXTRAPOLATION** under the service-history
and salvage identities in `docs/worldbuilding/vibe/vibe-CANONICAL.md`,
`src/data/sectors.js` and the existing wreck pack's source builder. Retained
geometry, markings, sockets and collision remain the identity anchors.

## Reproduce the editable candidates

From the repository root, first run:

```
node tools/blender/helios_remaster/sector_places.prepare.mjs
```

This reads the pinned donor revision `463d9383855d99fce87e5ee6e59974fe5f2653c4`,
decodes Meshopt and KTX2 without changing the repository's source/release assets,
and writes Blender inputs under `.devshots/helios-remaster/sector-places/input`.
It requires the repository's glTF Transform dependencies and `ktx` on PATH.

Then run Blender 5.1, using a small thread count on the shared host:

```
blender --background --threads 3 --python tools/blender/helios_remaster/sector_places.py -- --build
```

Optional names after `--build` select individual models. Each export includes a
complete surfaced `.blend`, a GLB, a material/shape preflight, and a hash-bound
candidate report. The common exporter is `tools/blender/spaceface_export.py`.
`sector_places_aftermath.py` owns the six separately constructed wreck assemblies.

The builder keeps imported UVs, meaningful texture maps and independent solids.
Boolean cuts first isolate the connected manufactured shell, preserving unrelated
material-batched geometry. New layers are joined by substance, and shared assets
with LODs retain the new construction in their lower levels. Added cavity, coating,
nickel and optical materials have explicit portable surface/normal/AO bindings.
Every material carries `spacefaceRemasterGeometry=true`, which prevents the runtime
from stamping the old synthetic service wells over real construction.

Run `node tools/blender/helios_remaster/sector_places.audit.mjs` after final edits
to refresh exact candidate hashes and verify attachment transforms. This is a
technical check, **not** an artistic acceptance decision. The controller reviews
the source candidates in the actual Three material/post rig and promotes the
accepted sources through the normal manifest/release path. The six aftermath
files belong under `assets/incubator/wreck_aftermath_pack/source`; the remaining
27 belong under their existing `assets/ships/parts` family. Never copy a candidate
straight into a generated release folder.

The trade hub's raw authored GLB is 289,342,776 bytes, above GitHub's file limit.
After the raw candidate audit and its accepted shipping release are ready, run:

```
node tools/blender/helios_remaster/trade_hub_compact.mjs
```

This compares the uncompressed authored source with the current shipping release,
then writes an 82,073,572-byte candidate under
`.devshots/helios-remaster/trade-hub-compact/`. It reuses that release byte for byte,
including its existing geometry precision and cached KTX2 images; it introduces no
additional render change or encoding pass. The largest measured position difference
from the raw authored source is 1.51 mm. `trade_hub_compact.json` records the complete
comparison. The hub contract retains `rawAuthoredCandidate` and its hash separately
from the compact promotion candidate. Run the raw audit before this compact step;
its raw-export hash must not replace the accepted compact candidate mapping.

Root promotes the compact candidate to the authored source path and refreshes the
source-hash metadata while retaining the existing release bytes. The preserved raw
candidate and surfaced Blender file remain the editing inputs; the established
Meshopt/dequantize/KTX decode path also supports the compact source.

## Scene identity repair

The exporter clears Blender scene custom properties between imports and restores the original canonical contract to both asset extras and every scene. sector_places_metadata.py performs the same metadata-only correction on existing candidates. sector_places.metadata-repair.json records exact old/new hashes and unchanged geometry/image buffer hashes for root-owned selective promotion. It also records intentional weapon tint replacements and the three inherited smooth signal-lens normal-binding omissions. No blank maps were added.
