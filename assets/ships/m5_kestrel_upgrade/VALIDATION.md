# Validation contract

The candidate build must report all of the following before promotion review:

- LOD0/1/2 present, monotonic, and total stored geometry under the 32k structural guard.
- `Material_Hull` body at least 800 triangles.
- Nine stable unsuffixed gameplay sockets.
- UV and real MikkTSpace tangent attributes on every renderable primitive.
- No embedded plume mesh.
- No more than 20 draws per LOD.
- Separate non-emissive paint/decal/glass roles and bounded explicit emissive roles.
- Held-out game, rear, top, side, 160 px, and dark-sky bloom evidence.

The generic `spaceface_export.py --validate-only` command applies the 15k single-part budget to the
sum of all stored LODs and therefore rejects both this multi-LOD candidate and the already-live K0
shape. It is not the wholeship acceptance gate. `build_kestrel_upgrade.py` uses the existing K0
production whole-ship rules: near LOD quality plus a 32k total stored-geometry guard.

No goldens, manifests, release assets, live assets, or renderer files are modified by this lane.
