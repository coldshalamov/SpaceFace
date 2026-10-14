# Reusable space asset bank

This is a growing library of authored construction pieces for SpaceFace. Its intended consumer is an
agent or artist composing a coherent place, machine, handled load or aftermath. It complements the
existing Forge fleet and place recipes; it does not replace their identities or automatically spawn
new objects into the game.

See [coverage and comparison](COVERAGE.md) for the researched inventory, reuse decisions and complete
commission. The five batch manifests document the pieces actually exported. Count distinct asset IDs,
not LOD files, palette variants or composition recipes.

## Start with a piece

1. Find a family in `assets/models/asset-bank/`: structure, operations, cargo, natural or large.
2. Read the piece's adjacent JSON. It names the source recipe, description, dimensions/bounds,
   socket positions and directions, collision limitations, motion pivots and exact LOD hashes.
3. Load `_lod0.glb` for close composition; `_lod1.glb` and `_lod2.glb` are lower-detail candidates.
   Use the existing game's role-specific loading/LOD machinery when integrating. No bank-specific
   runtime loader or automatic world-population loop is introduced.
4. Treat metres and transforms as part of the interface. GLB and JSON are +X forward, +Y up,
   +Z starboard. Blender recipes use +X forward, +Y port, +Z up. Do not apply a second axis conversion.
5. Align socket positions and oppose their forward vectors while respecting their up vectors.
   Do not assume filename similarity proves mating compatibility, clearance or equal bore size.
6. Check collision metadata. `none` means no authored proxy; it never means a global convex hull
   is safe. Compound boxes are approximate and require assembly-specific clearance validation.
7. Read motion groups before animating. A rigid pivot is not a supplied animation clip or gameplay
   behavior. Verify any socket attached to a moving member follows that member.

## Reproduce and validate

Run the recipe named in the piece's `source` field with Blender background mode. Batch-specific
commands are recorded in their manifests. The canonical Forge source and texture set are required.
Recipes use the shared `tools/blender/forge/asset_bank_export.py` adapter, preserving Forge materials
and LOD construction while making library socket and collision contracts explicit.

Run `node scripts/check-reusable-asset-bank.mjs` from the repository root to check all exported
pieces. Pass a family directory to inspect a smaller batch. The validator reads the actual GLBs,
checks source receipts, primitive/triangle counts, finite geometry, ordered LODs, material assignment,
exported socket poses, unit declarations and collision metadata. Its adversarial tests run with
`node --test test/reusable-asset-bank.test.mjs`.

## Integrate deliberately

These files are authoring-library candidates. They have not been registered as live places, assigned
new lore, accepted for all game cameras, or proven performant as an arbitrary massive assembly.
An integration task must use the existing parts/native-asset pipeline, preserve established entity
and socket identities, author the appropriate physical body, and satisfy the owning feature's normal
player-route and visual gates. Hundreds of available pieces do not justify loading hundreds at once.

For a coherent composition, choose a primary silhouette, a functional load path, a small set of
repeated joints, a visible working face and a clear approach/exit. Build the example recipes in
`assemblies.json` only once their dependencies and transforms are validated. Their names describe
possible arrangements, not new canonical factions or destinations.

## Evidence and provenance

The recipes are newly authored for this repository with existing Forge geometry/material tools.
External library links in the comparison document are coverage references; their models have not
been copied. Source previews and exported-package CPU renders are labeled separately. Neither is a
live Three.js game-camera capture, GPU performance measurement or final artistic acceptance.

Retained contact sheets are useful review evidence bound to their candidate manifests. Intermediate
renders and diagnostics belong in `.devshots/`, not the product source tree. The repository's visual
asset production standard and existing family owners retain acceptance authority.
