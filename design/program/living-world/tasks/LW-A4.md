<!-- LIFETIME: ACTIVE_PACKET -->
# LW-A4 — Living growth and quiet ritual art kit

**Manifest status:** `planned`. **Depends on:** LW-00.
Status refers to this packet's named deliverable; source presence never implies route acceptance.
For LW-00 the deliverable is authoring tooling only. All other packets are future work.

## Player outcome / deliverable

Ship Greenwake bridges/greenhouse and Fourth Toll berth, integrating existing ecology and bell assets with persistent state and accessible signals.

## Read and coordinate

Use [the shared implementation prompt](../AGENT_PROMPT.md), the [program](../05-IMPLEMENTATION-PROGRAM.md)
and the relevant sections of the [story](../02-WORLD-AND-STORY.md),
[systems](../03-SYSTEMS-AND-CONTRACTS.md) and [environment/assets](../04-SPACE-AND-ASSETS.md) bibles.
Existing work mapping: Forge/PICTURE + EAR; §34 Understory/Choir.

```sh
node scripts/living-world.mjs --district=district_charon_memorial_gardens
node scripts/living-world.mjs --district=district_phoebe_fourth_toll
```

**Source seams to inspect, not a blanket reservation:**

- `tools/blender/forge/`
- `assets/ships/`
- `src/render/`
- `src/audio/`

Claim exact paths at implementation time under current repository rules. Reuse current owners;
create a narrow helper only when its responsibility is missing. Dependencies are outcome dependencies,
not permission gates; finish independent work when another packet's model is still being authored.
Art completion means delivered source/release assets, measured sockets and collision contracts, and representative runtime/native-proxy integration. Full ordinary district acceptance belongs to the dependent numbered gameplay packet; it is not a prerequisite for this art packet. Art and gameplay agents may implement concurrently against the same agreed interface. Blender-only or asset-viewer-only delivery is insufficient.

## Build the mechanism

Canonical IDs: place_lw_greenwake_bridge, place_lw_greenhouse_hull, place_lw_fourth_toll_berth. Growth has attachment roots, travel gaps and distinguishable benign/unsafe behavior; residents still look housed inside it. The bell berth has an intentional empty socket and an occupied repair face. Reuse the actual Struck Bell, BELLHOP and Shepherd bodies. Work animations follow native phases, never free-running completion loops.

## Representative integration and downstream scene

The pilot can see which filament carries a greenhouse, which gap is safe and where pruning matters. At Phoebe the missing fourth note is visible as a shared pause, while work resumes around it.

The scene below is the downstream district goal. For this asset packet, demonstrate the model, moving parts, colliders, materials and sockets with the actual renderer and native physics/service adapters in a representative scene; record any full route behavior still owned by the dependent packet. Do not fabricate gameplay receipts to claim that route complete.

## Acceptance and failure cases

- Growth-stage material/geometry/collision agreement.
- Visible work/cut/repair/empty states at gameplay camera.
- Muted/reduced-flash signals and correct spatial audio/occlusion.

Use the district JSON's named negative cases as well. Check interruption, death/destruction,
sector departure, pause, save/Continue, same-ID/different-generation objects and duplicate receipts
where applicable. Only the relevant owners may commit state. Evidence identifies exact source,
route and limitations; the existing game/asset acceptance owners remain authoritative.

## Reject these substitutes

Reject green material over an unchanged station, flashing noise as ecology, an audio-only puzzle and additional duplicate named bells/shepherds.

## Close with a useful handoff

Commit the exact changed paths and publish through the requested workflow. Name the normal entry
route and what a player can now do. Update the affected existing build-map/lane and this package's
manifest only after integration; include evidence for the claim actually made. Future agents should
inherit working source, not an unexplained screenshot or a green status manufactured by the packet.
