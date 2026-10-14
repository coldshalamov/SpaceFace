# Reusable space asset bank

This is an authored construction library for SpaceFace. Its intended consumer is an agent or artist
composing a coherent place, machine, handled load or aftermath. It complements the existing Forge
fleet and place recipes; it does not replace their identities or automatically spawn objects.

## Delivery status is not the catalog

The initial PR #378 snapshot (`23308b914f84b0b34e14a2176a59cb8c5ffe6c95`) contains recipes, planned
coverage and validation tooling, but does not contain `assets/models/asset-bank/`. Do not interpret
catalog entries, recipe counts or this guide as evidence that exported models have shipped.
A delivered piece needs its committed GLBs and adjacent manifest; an accepted runtime piece also
needs the owning feature's visual, physical and performance evidence.

See [coverage and comparison](COVERAGE.md) for the commission and reuse decisions. Count distinct
asset IDs with verified exports, not LOD files, palette variants or proposed composition recipes.
Batch reports must distinguish recipe available, exported, structurally validated, visually reviewed
and runtime accepted. Never collapse those five states into a single "done" count.

## Start with a delivered piece

1. Find a family under `assets/models/asset-bank/`: structure, operations, cargo, natural or large.
   If that directory or the chosen piece is absent, export its Forge recipe first; it is not a
   runtime-loader fault. The authoring recipes live under `tools/blender/forge/asset_bank_*.py`.
2. Read the piece's adjacent JSON. It names the source recipe, description, dimensions/bounds,
   socket positions and directions, collision limitations, motion pivots and exact LOD hashes.
3. Load `_lod0.glb` for close composition; `_lod1.glb` and `_lod2.glb` are lower-detail candidates.
   Use the existing game's role-specific loading/LOD machinery when integrating. No bank-specific
   runtime loader or automatic world-population loop is introduced.
4. Treat metres and transforms as part of the interface. GLB and JSON are +X forward, +Y up,
   +Z starboard. Blender recipes use +X forward, +Y port, +Z up. Do not apply a second axis conversion.
5. Align socket positions and oppose their forward vectors while respecting their up vectors.
   Filename similarity does not prove mating compatibility, clearance or equal bore size.
6. Check collision metadata. `none` means no authored proxy; it never means a global convex hull
   is safe. Compound boxes are approximate and require assembly-specific clearance validation.
7. Read motion groups before animating. A rigid pivot is not a supplied animation clip or gameplay
   behavior. Verify any socket attached to a moving member follows that member.

## Reproduce and validate

Run the relevant recipe with Blender background mode, using its own documented arguments. The
canonical Forge source and texture set are required. Recipes use the shared
`tools/blender/forge/asset_bank_export.py` adapter, preserving Forge materials and LOD construction
while making library socket and collision contracts explicit.

From the repository root:

```sh
node --test test/reusable-asset-contract.test.mjs test/reusable-asset-bank.test.mjs
python test/asset_bank_cost_test.py
node scripts/check-reusable-asset-bank.mjs
```

The first command includes dependency-free contract fixtures and the existing real-GLB roundtrip
suite, which requires the repository's Node dependencies. The Python command checks exporter cost
arithmetic without importing Blender; it is not an export or visual test. The final command requires
actual exported assets. A missing/empty bank is a delivery gap, not a passing validation result.
Pass a family directory to the final command to validate a smaller batch.

The gate verifies byte/hash receipts, positive integer cost receipts, ordered LODs, finite reachable
geometry, complete triangle/index buffers, material assignment and declared bind-pose bounds.
Both the exporter and validator count each active-scene mesh occurrence, not merely unique mesh
definitions. This is a structural primitive count, not a measured GPU draw-call or frame-time budget.
Socket checks cover position, forward AND up in the active scene; detached sockets cannot satisfy
the interface. LOD filenames are portable basenames and GLB symlinks are rejected.

Bounds are a containing bind-pose envelope, with a small export/float tolerance. Coarser LODs may
shrink inside it. This gate does not certify moving-part sweep bounds, mating clearance, animation
coverage, topology quality or artistic acceptance.

## Integrate deliberately

These files are authoring-library candidates. They have not been registered as live places, assigned
new lore, accepted for all game cameras, or proven performant as an arbitrary massive assembly.
An integration task must use the existing parts/native-asset pipeline, preserve established entity
and socket identities, author the appropriate physical body, and satisfy the owning feature's normal
player-route and visual gates. Hundreds of available pieces do not justify loading hundreds at once.

For a coherent composition, choose a primary silhouette, a functional load path, a small set of
repeated joints, a visible working face and a clear approach/exit. If a batch supplies an
`assemblies.json`, validate its dependencies and transforms before building it. Proposed assembly
names describe arrangements, not new canonical factions or destinations.

## Highest-value continuation work

First deliver one small, coherent family end to end: committed LODs and manifests, freshly reimported
GLB contact sheets, a socket-mated example, collision clearance and a real game-camera capture.
Expand the catalog only after that path works; more recipe names cannot repair a broken export path.

Then add typed mating profiles (connector class, bore/size, permitted twist and clearance), moving
socket/pivot sweeps, and assembly-specific load/unload tests. Measure texture/GPU memory and scene
costs through the existing renderer on representative hardware before admitting large compositions.
Reuse the existing streaming/LOD owners rather than adding a second asset manager.

Make interrupted exports recoverable with scoped cleanup and atomic manifest publication, and bind
preview evidence to the same exported hashes validated by the CLI. Those remain follow-up tasks;
the structural validator alone does not implement or certify them.

## Evidence and provenance

The recipes are newly authored for this repository with existing Forge geometry/material tools.
External library links in the comparison document are coverage references; their models have not
been copied. Source previews and exported-package CPU renders must be labeled separately. Neither
is a live Three.js game-camera capture, GPU performance measurement or final artistic acceptance.

Retained contact sheets are review evidence bound to their candidate manifests. Intermediate renders
and diagnostics belong in `.devshots/`, not the product source tree. The repository's visual asset
production standard and existing family owners retain acceptance authority.
