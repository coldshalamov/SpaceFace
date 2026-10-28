<!-- LIFETIME: ACTIVE_PACKET -->
# LW-A2 — Garrison and inhabited-wreck art kit

**Manifest status:** `planned`. **Depends on:** LW-00.
Status refers to this packet's named deliverable; source presence never implies route acceptance.
For LW-00 the deliverable is authoring tooling only. All other packets are future work.

## Player outcome / deliverable

Ship Niner hangar, COUNTERSIGN, ferry habitat and wreck-throat families with truthful occupied/empty/damaged states and usable openings.

## Read and coordinate

Use [the shared implementation prompt](../AGENT_PROMPT.md), the [program](../05-IMPLEMENTATION-PROGRAM.md)
and the relevant sections of the [story](../02-WORLD-AND-STORY.md),
[systems](../03-SYSTEMS-AND-CONTRACTS.md) and [environment/assets](../04-SPACE-AND-ASSETS.md) bibles.
Existing work mapping: Forge/PICTURE; §34 Concord/Quiet faction identity.

```sh
node scripts/living-world.mjs --district=district_dione_niner_bastion
node scripts/living-world.mjs --district=district_pallas_widows_run
```

**Source seams to inspect, not a blanket reservation:**

- `tools/blender/forge/`
- `assets/ships/`
- `src/render/ships/`
- `src/render/`

Claim exact paths at implementation time under current repository rules. Reuse current owners;
create a narrow helper only when its responsibility is missing. Dependencies are outcome dependencies,
not permission gates; finish independent work when another packet's model is still being authored.
Art completion means delivered source/release assets, measured sockets and collision contracts, and representative runtime/native-proxy integration. Full ordinary district acceptance belongs to the dependent numbered gameplay packet; it is not a prerequisite for this art packet. Art and gameplay agents may implement concurrently against the same agreed interface. Blender-only or asset-viewer-only delivery is insufficient.

## Build the mechanism

Canonical new IDs: place_lw_niner_hangar, ship_lw_countersign, place_lw_ferry_habitat, place_lw_wreck_throat. COUNTERSIGN derives from the Warden/service family; retain recognizable mass and propulsion while adding exposed clamp arms and service weakness. Hangar architecture exposes finite berths and side cuts. Ferry habitat distinguishes occupied core from removable scrap. Wreck throats are different usable passages, not variants whose only difference is paint.

## Representative integration and downstream scene

The player reads the coveted machine from outside the base, sees how to enter its court, and can tell an inhabited ferry from salvage before shooting it.

The scene below is the downstream district goal. For this asset packet, demonstrate the model, moving parts, colliders, materials and sockets with the actual renderer and native physics/service adapters in a representative scene; record any full route behavior still owned by the dependent packet. Do not fabricate gameplay receipts to claim that route complete.

## Acceptance and failure cases

- Current source/release identity and attachment-socket validation.
- Representative overhead/stern views with player/load silhouette.
- Native blocker/collider/damage-state agreement.

Use the district JSON's named negative cases as well. Check interruption, death/destruction,
sector departure, pause, save/Continue, same-ID/different-generation objects and duplicate receipts
where applicable. Only the relevant owners may commit state. Evidence identifies exact source,
route and limitations; the existing game/asset acceptance owners remain authoritative.

## Reject these substitutes

Reject a tank-shaped spaceship with no cargo mechanic, a closed hanger collider over an open mouth, unseen occupied collateral and disconnected tubes as ship silhouettes.

## Close with a useful handoff

Commit the exact changed paths and publish through the requested workflow. Name the normal entry
route and what a player can now do. Update the affected existing build-map/lane and this package's
manifest only after integration; include evidence for the claim actually made. Future agents should
inherit working source, not an unexplained screenshot or a green status manufactured by the packet.
