# Technique Menu — SpaceFace Authored Assets

This is a diagnostic menu, not a checklist or acceptance score. Use only the sections relevant to the
asset's observed defects, role, camera distance, and runtime contract. Do not add a technique merely to
check a box. Exact tolerances come from the live exporter/manifest or measurement, not this reference.

## Form and construction

- silhouette, proportion, orientation, and negative-space readability;
- macro/secondary/micro hierarchy appropriate to camera distance;
- plausible load paths, access, propulsion, weapons, docks, and attachment logic;
- direct modeling, modifiers, booleans, sculpting, retopology, instances, or geometry nodes as useful;
- stable transforms, scale, normals, pivots, and shading.

## Surface and materials

- UV layout and texel use appropriate to the asset and reuse strategy;
- trim sheets, decals, authored textures, vertex data, or procedural masks where they add value;
- normal/AO/ORM/emissive bakes when the runtime and visible result benefit;
- roughness and material-role separation that remain legible under representative lighting;
- wear, grime, markings, and damage only where story, construction, and scale justify them.

## Life and integration

- sockets and pivots aligned to actual runtime consumers;
- animation, bones, actions, shape keys, or state meshes only for behavior the game can use;
- appropriate LOD/HLOD, material sharing, batching/instancing compatibility, and culling bounds;
- exact metadata, naming, provenance, and release-path requirements from the live contract.

## Review questions

- Does the asset read correctly and distinctly at the real game camera?
- Do construction and materials look intentional rather than primitive, noisy, or generically procedural?
- Is important close detail present without spending cost on invisible work?
- Does every expensive or complex technique survive export and visibly improve the player-facing result?
- Is the authored result actually reachable on the normal route and technically valid?

The strongest answer may use many techniques or very few.
