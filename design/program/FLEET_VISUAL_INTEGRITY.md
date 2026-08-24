# Fleet Visual Integrity — complete ships, atomic publication, and continuous space

## Outcome

Normal play must never show a targetable ship as empty space, a drive plume with no hull, wings or
weapons detached from an absent body, or a star/debris field that jumps, vanishes, or runs away from
the camera.

This packet owns the cross-cutting proof. It does not replace the visual quality bar in
`docs/visual-assets/README.md`, the flyable remaster in `PQ-050`, or the exact runtime maps in
`src/render/partsLibrary.js`. It makes those systems converge on one non-negotiable player result:
**every live visual is complete when published and spatially continuous while visible.**

## Why this packet exists

The repository already had several correct pieces, but no single gate joined them:

- whole-ship identity can land after sector prefetch has captured an earlier plan;
- release files, render packages, runtime maps, prewarm sets, and entity selectors are separate
  authorities;
- a direct-authored boundary can legally exist as a zero-draw ownership substrate while targeting,
  weapons, trails, and HUD remain live;
- visual acceptance and technical GLB validity are different proofs;
- the procedural sky needs galactic-global coordinates while Three.js scene objects need
  floating-origin local coordinates;
- the parallax debris bands were moved as one modulo-wrapped group, so every instance could teleport
  together at a tile seam.

A green asset manifest does not prove a complete live ship. A green sim does not prove pixels. A
single screenshot does not prove temporal stability. This packet closes all three gaps.

## Current landed baseline

The live invisible-enemy ordering defect is already fixed on `master`: authored admission re-reads
the current entity identity after decode, required whole-ships fail a dedicated gate, and live empty
substrates are allowed to compose. Preserve these checks:

- `npm run check:live-whole-ship-admission`
- `test/live-whole-ship-admission.test.mjs`
- `test/live-ship-visual-package-coverage.test.mjs`
- the `AUTHORED HULL` step in `npm run check:playable`

This packet extends that protection from one reproduced hostile family to the entire live visual
population and adds the missing temporal-space proof.

---

## Program A — enumerate the real live fleet

Build one machine-readable census from runtime producers, not from prose inventories.

### Inputs

Enumerate every ship-like identity reachable from:

1. new-game defaults and purchased/equipped player ships;
2. scenario actors, including 47-A and every mission-authored `assetRef`;
3. combat pools, loot tables, silhouettes, bosses, reinforcements, and late spawns;
4. traffic roles and ambient occupations;
5. faction patrols, lawful response, civilians, wingmen, drones, and payload ships;
6. Crucible/wave-mode spawn recipes;
7. save/Continue restoration and sector-streamed entities;
8. debug or test routes that share the production renderer and can become player-facing.

### Required census row

For every identity, record:

- producer and selector fields (`defId`, `assetRef`, `lootTableId`, `trafficRole`, `silhouette`,
  faction/team where relevant);
- resolved visual representation: complete whole-ship, modular composition, or intentionally
  non-ship presentation;
- exact source GLB and release GLB, when authored;
- source-manifest ID, release-manifest ID, render-package ID/hash, and runtime map owner;
- prewarm/admission route;
- required LOD family and closest-available policy;
- whether a procedural substrate exists and whether it contains real drawables;
- normal-route reproduction that spawns the row.

### Gate

A row fails when any live selector resolves to no visual, to an unpackageable file, to a mismatched
asset ID, or to a zero-draw boundary that can reach a presented frame.

Do not repair a failed row by mapping it to an arbitrary generic hull. Correct the selector,
package, runtime map, or asset itself.

---

## Program B — atomic ship publication

A ship visual is a transaction, not a collection of asynchronously appearing parts.

### Publication law

At every presented frame a live ship boundary must be in exactly one of these states:

1. **complete procedural** — a coherent hull and all required readability surfaces are drawable;
2. **complete authored** — the selected authored body has at least one visible opaque structural
   hull leaf and its required stateful surfaces are bound;
3. **explicitly hidden by gameplay** — despawn, cloak, death transition, or camera cull owns the
   absence and publishes a named reason.

The forbidden state is **partial publication**: trails, sockets, weapons, fins, engines, shields,
nav lights, target markers, or damage effects visible while the structural body is absent.

### Commit protocol

- Keep the previous complete visual resident while authored decode, package admission, batching,
  material compilation, and GPU upload are pending.
- Build the replacement under a detached boundary.
- Validate structural drawability before swap:
  - nonempty visible opaque hull census;
  - finite nonzero bounds;
  - expected package generation/hash;
  - no loader diagnostic;
  - required whole-ship identity still matches the live entity;
  - residency owner is still active.
- Publish the replacement in one render-boundary commit.
- Retire the previous visual only after the authored root is attached and drawable.
- On failure, retain the previous complete visual and publish a hard diagnostic. Never expose the
  empty ownership substrate as the fallback.

### Required diagnostics

Every failed publication must name:

- entity ID and current selector fingerprint;
- requested file and asset ID;
- loaded whole-ship inventory;
- source/release/render-package status;
- admission state and abort reason;
- whether a complete previous visual remained visible;
- exact check that failed.

### Tests

Add fixtures for:

- identity assigned before wrap;
- identity assigned during the first decode;
- identity changed twice before composition;
- mid-flight spawn absent from sector prediction;
- Continue/load with cold caches;
- context restoration;
- sector exit during decode;
- required GLB missing, corrupt, unpackageable, or hash-mismatched;
- LOD1/2 absent while LOD0 is valid;
- package ready but no visible opaque structural leaf;
- authored replacement rejected while procedural predecessor remains complete.

---

## Program C — runtime visual completeness proof

Static registry checks are necessary and insufficient. Exercise the real renderer.

### Fleet gallery harness

Create a deterministic Browser and Electron route that spawns every census row in bounded batches.
For each ship capture:

- chase camera at the normal 144 WU framing;
- tight legal 58 WU framing;
- front-quarter, rear-quarter, side, and top-reading headings produced by rotating the ship, not by
  substituting a studio camera;
- idle, thrust, turn/bank, firing, shield hit, damaged, LOD transition, and death/cleanup states;
- cold load, warm load, sector stream-in, Continue, and WebGL context restore where supported.

### Machine assertions

For every sampled presented frame:

- targetable live ship has a visible structural root;
- opaque hull pixel/leaf census is nonzero;
- bounds are finite and exceed a role-appropriate minimum screen footprint;
- no required material is a failed shader or invisible material;
- no isolated accessory is farther from the structural bounds than its authored mount tolerance;
- no one-frame transition produces zero structural drawables;
- LOD changes preserve a connected silhouette and do not flash between unrelated generations;
- entity, target marker, collision envelope, and visual root stay spatially coherent.

### Temporal acceptance

Sample at least 360 consecutive presented frames for each stress batch. Record identities per frame,
not just screenshots. Fail on:

- one or more blank-body frames;
- body generation alternating between two packages;
- bounds collapsing to zero or exploding;
- parts appearing before the body or surviving after disposal;
- shader/material compilation failure;
- WebGL errors or missing asset requests;
- a full-band background/debris displacement inconsistent with camera travel.

`npm run check:visual-stability` should consume this census or call the new harness as a required
sub-gate rather than testing only a favored subset.

---

## Program D — Blender/model remediation for failed assets

Use this only when runtime proof shows that the selected GLB genuinely lacks acceptable geometry or
surfacing. Do not send loader defects into Blender.

Every failed model goes through `docs/visual-assets/README.md`,
`VISUAL_ASSET_PRODUCTION_STANDARD.md`, `ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`, the material-truth
skill, and the applicable adversarial review workflow.

### Highest-quality form instructions

1. **One coherent structural body.** Build a continuous pressure hull or believable open-frame
   structure. Do not assemble a ship from floating cards, disconnected lofts, decorative hoops, or
   accessories that only imply a missing body.
2. **Load paths.** Wings, fins, nacelles, engines, weapon pylons, armor, cargo structures, and sensor
   masts must visibly transfer force into primary structure. Intersections are authored joints, not
   accidental mesh overlap.
3. **Closed silhouette.** No daylight through unintended seams; no inverted normals, zero-area faces,
   nonmanifold cracks, coplanar flicker layers, or open backfaces visible from the chase camera.
4. **Role-readable massing.** Interceptor, hauler, tender, barge, patrol ship, and capital hull must
   be distinguishable at 144 WU before paint, labels, bloom, or UI explain them.
5. **Depth at play size.** Canopy wells, engine throats, intakes, armor breaks, machinery recesses,
   and major panel steps must survive the shipping camera. Tiny greebles do not substitute for
   primary/secondary form.
6. **Deliberate asymmetry.** Use asymmetry only where fiction supports maintenance, cargo, damage,
   sensors, or mission equipment. Random attached boxes are not authored complexity.
7. **Transforms and axes.** Apply transforms; use `+X forward, +Y up, +Z starboard`; verify scale,
   origin, and mirrored tangent handedness before export.
8. **Materials by physical role.** Author distinct hull, armor, exposed mechanical, canopy, heat-
   affected, emissive signal, drive, warning, and damage responses where the fiction needs them.
   No visible zone inherits a DCC default. Normal maps are OpenGL green-up; ORM is R=AO,
   G=roughness, B=metallic.
9. **Canopy truth.** The canopy must sit in a real opening/well, have plausible framing and thickness,
   and remain readable under the live physical-canopy policy. A glass blob placed on unbroken hull
   skin fails.
10. **Drive truth.** Thruster throats are modeled volumes with depth and internal structure; glowing
    disks or toruses are not engines. Verify plume/socket direction against `+X forward`.
11. **LOD as authored silhouette.** Produce LOD0/1/2 from screen-space review. Preserve primary
    silhouette, canopy, major drives, and role-defining equipment. Never let a missing LOD request
    blank the body; use closest-available policy.
12. **Sockets and hooks.** Seat every `HOOK_*`, `SOCKET_*`, and `MOUNT_*` on final geometry. Validate
    weapons, drives, nav lights, damage zones, cargo/pods, collision, and camera-facing markers.
13. **Bounds and collision.** Recompute from the final body. Bounds must include role-defining
    extremities without being dominated by accidental hidden geometry.
14. **Export hygiene.** No external texture references, hidden accidental collections, unnamed
    semantic nodes, duplicate material identities, unsupported extensions, unapplied scale, or
    source-only assets on a release route.
15. **Exact-candidate review.** Bind G0-G7 evidence and chase-camera stills to the candidate hash.
    Technical validity cannot mark G1/G2/G4 accepted. Record `KEEP`, `REVISE`, `REVERT`, or
    `BLOCKED`; unresolved P0/P1 defects keep the asset out of live whole-ship maps.

### Model acceptance commands

Run the exact current asset pipeline and inspect the generated release artifact, then:

- asset structure/audit and classification checks;
- release-manifest and render-package parity;
- asset reachability and live-load checks;
- fleet gallery cold/warm/stream/Continue/context cases;
- representative scene performance without lowering quality or entity count;
- independent chase-camera visual review against the exact release hash.

---

## Program E — continuous backgrounds and debris

### Coordinate law

- Simulation and procedural world identity use galactic-global XZ.
- Three.js roots, camera matrices, and submitted entity poses use frame-local XZ.
- A floating-origin rebase changes representation, never world identity.

### Deep-field implementation

`SpaceBackground` must use global camera XZ for:

- layer UVs and high-speed stream integration;
- star/flare wrap membership;
- planet/wormhole grids and parallax;
- distant authored structure placement;
- region noise/tint sampling.

Its root and compositor ray origin must remain locked to the frame-local camera. Sector entry and
resize projection must temporarily evaluate in the same global frame as procedural anchors, then
restore the live camera matrix.

### Debris implementation

Do not modulo-translate an entire finite asteroid/debris group. Keep one instanced draw per band,
center the group on the local camera, and wrap each instance in the vertex shader from global focus.
This preserves draw count, static matrices, GPU spin, and density while removing synchronized tile
teleports.

### Continuity tests

Prove all of the following:

- ordinary travel through multiple tile periods;
- exact floating-origin threshold crossing;
- diagonal crossing on both axes;
- sector transition with and without a rebase in the same frame;
- jump/teleport rejection in velocity integration;
- pause/resume and reduced motion;
- resize and dynamic resolution;
- Continue/load and WebGL context restoration.

Measure consecutive screen-space positions. A rebase frame may not move a star, hero body, distant
structure, or debris instance by more than the motion implied by actual galactic camera travel.

Focused gates:

```text
npm run check:parallax
node --test test/space-background-frame-coordinates.test.mjs
npm run check:sector-visual-transition
npm run check:visual-stability
npm run check:playable
```

A headed natural-route rebase capture remains mandatory before final promotion because DOM and unit
assertions cannot see a WebGL one-frame flash.

---

## Execution slices

### Slice 1 — runtime continuity repair

Own only the background coordinate adapter, per-instance debris wrap, and focused tests. Preserve
quality, counts, materials, and draw-call topology.

### Slice 2 — fleet census and hard package gate

Generate the live selector census. Extend package/admission checks until every row is covered and a
new row cannot enter the fleet without source/release/package/runtime/prewarm proof.

### Slice 3 — atomic publication

Instrument structural drawability and keep the prior complete visual until the replacement commits.
Negative-test every failure class.

### Slice 4 — Browser/Electron fleet gallery

Drive every census row through cold/warm/stream/Continue/context cases and publish temporal receipts.

### Slice 5 — asset remediation queue

For each remaining failed row, classify the owner:

- selector/map defect;
- release/package defect;
- loader/admission defect;
- LOD/socket/material contract defect;
- actual Blender form/surfacing defect.

Only the last class enters Blender. Produce one exact asset or repeated manufactured family at a
time, complete the visual standard, then rerun the gallery.

### Slice 6 — promotion

Promotion requires:

- zero uncovered live identities;
- zero blank or partial ship frames in Browser and Electron;
- zero missing/failed release requests;
- zero full-field background/debris discontinuities;
- all remediated assets accepted at exact hashes;
- no performance regression hidden by quality, density, or entity-count reductions;
- durable diagnostics and negative-tested gates.

## Definition of done

The task is done only when a player can traverse, fight, stream sectors, Continue a save, and recover
a WebGL context without ever seeing a targetable empty ship, a body assembled over multiple visible
frames, or a background/debris layer discontinuity. Plans, manifests, valid GLBs, and isolated stills
are evidence inputs—not the result.
