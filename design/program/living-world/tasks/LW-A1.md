<!-- LIFETIME: ACTIVE_PACKET -->
# LW-A1 — Habitation and civic machinery art kit

**Manifest status:** `planned`. **Depends on:** LW-00.
Status refers to this packet's named deliverable; source presence never implies route acceptance.
For LW-00 the deliverable is authoring tooling only. All other packets are future work.

## Player outcome / deliverable

Ship the 15-ID catalog's civic subset: lamp cradle, Switchyard truss and impulse shunter, plus targeted dressing/articulation improvements to existing habitat/passenger assets.

## Read and coordinate

Use [the shared implementation prompt](../AGENT_PROMPT.md), the [program](../05-IMPLEMENTATION-PROGRAM.md)
and the relevant sections of the [story](../02-WORLD-AND-STORY.md),
[systems](../03-SYSTEMS-AND-CONTRACTS.md) and [environment/assets](../04-SPACE-AND-ASSETS.md) bibles.
Existing work mapping: Forge and existing PICTURE lane; §34 rows512,514,543.

```sh
node scripts/living-world.mjs --district=district_helios_lantern_ward
node scripts/living-world.mjs --district=district_tethys_switchyard
```

**Source seams to inspect, not a blanket reservation:**

- `tools/blender/forge/`
- `assets/ships/`
- `src/render/`
- `src/data/everydaySpaceKitDressing.js`

Claim exact paths at implementation time under current repository rules. Reuse current owners;
create a narrow helper only when its responsibility is missing. Dependencies are outcome dependencies,
not permission gates; finish independent work when another packet's model is still being authored.
Art completion means delivered source/release assets, measured sockets and collision contracts, and representative runtime/native-proxy integration. Full ordinary district acceptance belongs to the dependent numbered gameplay packet; it is not a prerequisite for this art packet. Art and gameplay agents may implement concurrently against the same agreed interface. Blender-only or asset-viewer-only delivery is insufficient.

## Build the mechanism

Use the exact 15-model crosswalk in the environment bible. This packet also owns OR-A23, the shared human-work assembly kit: carrying, bracing, tool contact, waiting and departure poses for visible dock crews and tethered EVA service. It is a shared component dependency, not a sixteenth district model ID or a new walking-city simulation. One representative native service phase must drive its motion. Civic subset IDs: place_lw_lantern_cradle, place_lw_switchyard_truss, ship_lw_impulse_shunter. Existing habitat_pod, shuttle_dock, passenger_platform and transfer_arm are reuse bases, not invitations to make replacements. Shape the silhouettes and empty passage space before detail. Deliver source, LODs, transforms, sockets, collision proxies, material roles, damage states and genuine work articulation through the normal release pipeline.

## Representative integration and downstream scene

At normal camera size a pilot can distinguish home, dock and goods receiver; understand where a cradle takes a lamp; and see the shunter's couplers and payload. Nobody needs a debug label to identify the working face.

The scene below is the downstream district goal. For this asset packet, demonstrate the model, moving parts, colliders, materials and sockets with the actual renderer and native physics/service adapters in a representative scene; record any full route behavior still owned by the dependent packet. Do not fabricate gameplay receipts to claim that route complete.

## Acceptance and failure cases

- Forge/source/release manifest and actual asset identity checks.
- Gameplay-camera material/light/scale review.
- Socket/collider/LOD and articulation integration with native job phase.

Use the district JSON's named negative cases as well. Check interruption, death/destruction,
sector departure, pause, save/Continue, same-ID/different-generation objects and duplicate receipts
where applicable. Only the relevant owners may commit state. Evidence identifies exact source,
route and limitations; the existing game/asset acceptance owners remain authoritative.

## Reject these substitutes

Reject asset-only success without a representative runtime integration, duplicate runtime IDs, decorative moving arms unrelated to work and arbitrary triangle prestige targets.

## Close with a useful handoff

Commit the exact changed paths and publish through the requested workflow. Name the normal entry
route and what a player can now do. Update the affected existing build-map/lane and this package's
manifest only after integration; include evidence for the claim actually made. Future agents should
inherit working source, not an unexplained screenshot or a green status manufactured by the packet.
