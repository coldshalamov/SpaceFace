<!-- LIFETIME: ACTIVE_PACKET -->
# LW-A3 — Rock interiors and manufactured terrain art kit

**Manifest status:** `planned`. **Depends on:** LW-00.
Status refers to this packet's named deliverable; source presence never implies route acceptance.
For LW-00 the deliverable is authoring tooling only. All other packets are future work.

## Player outcome / deliverable

Ship Nine-Mouth shell/quarry bell and Iron Maw surface/relief court/crane as coherent modular local terrain plus macro silhouette.

## Read and coordinate

Use [the shared implementation prompt](../AGENT_PROMPT.md), the [program](../05-IMPLEMENTATION-PROGRAM.md)
and the relevant sections of the [story](../02-WORLD-AND-STORY.md),
[systems](../03-SYSTEMS-AND-CONTRACTS.md) and [environment/assets](../04-SPACE-AND-ASSETS.md) bibles.
Existing work mapping: Forge/PICTURE + HAND/MACHINE integration; §30 and §34 scale/interiors.

```sh
node scripts/living-world.mjs --district=district_ceres_cathedral
node scripts/living-world.mjs --district=district_ashfall_iron_maw
```

**Source seams to inspect, not a blanket reservation:**

- `tools/blender/forge/`
- `assets/ships/`
- `src/render/`
- `src/data/sectorCoordinates.js`

Claim exact paths at implementation time under current repository rules. Reuse current owners;
create a narrow helper only when its responsibility is missing. Dependencies are outcome dependencies,
not permission gates; finish independent work when another packet's model is still being authored.
Art completion means delivered source/release assets, measured sockets and collision contracts, and representative runtime/native-proxy integration. Full ordinary district acceptance belongs to the dependent numbered gameplay packet; it is not a prerequisite for this art packet. Art and gameplay agents may implement concurrently against the same agreed interface. Blender-only or asset-viewer-only delivery is insufficient.

## Build the mechanism

Canonical IDs: place_lw_nine_mouth_shell, place_lw_quarry_bell, place_lw_maw_surface, place_lw_maw_relief_court, place_lw_maw_crane. Model the negative spaces and sockets first. Bake human/ship scale cues into architecture. Split roofs, structural chunks and detachable loads from the distant silhouette. Provide measured openings, collision shapes, material response and pivots; never use one bounding sphere as the traversable shell. Keep genuinely 3D stacked flight beyond this package's XZ contract.

## Representative integration and downstream scene

An actual ship with an actual tow fits through the lit aperture; the camera can remain outside walls; a headlight reads grooves on steel; a released panel moves as the same physical body.

The scene below is the downstream district goal. For this asset packet, demonstrate the model, moving parts, colliders, materials and sockets with the actual renderer and native physics/service adapters in a representative scene; record any full route behavior still owned by the dependent packet. Do not fabricate gameplay receipts to claim that route complete.

## Acceptance and failure cases

- Portal width/height and swept hull+load collision fixtures.
- Shared frame/origin and local-to-macro alignment.
- Normal camera/headlight/LOD entry/exit review with no popping or hidden solid shells.

Use the district JSON's named negative cases as well. Check interruption, death/destruction,
sector departure, pause, save/Continue, same-ID/different-generation objects and duplicate receipts
where applicable. Only the relevant owners may commit state. Evidence identifies exact source,
route and limitations; the existing game/asset acceptance owners remain authoritative.

## Reject these substitutes

Reject beautiful unenterable shells, an unbounded all-detail megamesh, a single texture plane and visual variants with unchanged collision/structure.

## Close with a useful handoff

Commit the exact changed paths and publish through the requested workflow. Name the normal entry
route and what a player can now do. Update the affected existing build-map/lane and this package's
manifest only after integration; include evidence for the claim actually made. Future agents should
inherit working source, not an unexplained screenshot or a green status manufactured by the packet.
