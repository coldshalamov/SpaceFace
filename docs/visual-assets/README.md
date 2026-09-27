# SpaceFace graphics — front door

Rewritten 2026-09-27 by the graphics owner after the owner's review: the fleet read as "simply ok",
inconsistent, leather-and-scraped-tin surfaces, a box stuck on Hitch's nose. The old front door
routed every model through a stack of gates (G0–G7 records, five-cycle adversarial reviews,
hash-bound acceptance, per-asset material-truth preflights). It produced paperwork and a fleet
where every hull came from a different pipeline. The replacement is short on purpose.

## The rule

**Look at the real picture, fix what you see, keep one system.** The picture is the game's own
renderer, lights and post at the gameplay camera — not a Blender studio render, not a receipt.

## Routes

| Work | Go to |
|---|---|
| Any ship body (player, NPC, traffic, faction variant) | [`tools/blender/forge/FORGE.md`](../../tools/blender/forge/FORGE.md) — the one kit, look bar and publish command. No ship is built any other way. |
| Stations, places, props, wrecks, rocks | Until Forge covers them: keep each asset's existing builder, but meet the FORGE.md look bar (plan silhouette, three values, manufactured not noisy surfaces, nothing floating) and review with `scripts/fleet-look.mjs --files=places/<file>.glb`. |
| Runtime look (lighting, post, material response) | `src/render/` — `authoredMaterialProfiles.js`, `illustratedSurface.js`, `bloom.js`, `src/data/sectorVisualProfiles.js`. Change the shared layer when the defect is shared. |
| VFX (plumes, impacts, beams, trails) | [`VFX_TECHNIQUE_STANDARD.md`](VFX_TECHNIQUE_STANDARD.md), then [`VFX_LIFECYCLE_STANDARD.md`](VFX_LIFECYCLE_STANDARD.md). No soft square/disc stands in for an object; distant stars are the only exception. |
| Portraits / concept art | `assets/portraits/AGENTS.md`, `assets/concept/AGENTS.md` |

## Seeing the picture

```
node scripts/fleet-look.mjs --file=<release path or any .glb> --views=inspect,close,top   # one model, live pipeline
node scripts/fleet-look.mjs --fleet --views=close                                         # every live hull, contact sheet
node scripts/flight-look.mjs [--ship=ship_<id>]                                           # real New Game flight
```

Open the PNGs yourself. `close` is the chase camera at close zoom (the ship ≈ 450 px); `chase` is
the default 144 WU framing. A still is a working tool, not a deliverable: delete stale ones.

## What "done" means

A model is done when, at the gameplay camera, nothing obvious is wrong (floating parts, clipped or
z-fighting details, blown or muddy values, noisy surfaces, an unreadable silhouette), it is
unmistakably its job, and it holds its own next to the best hulls in the fleet. Technical validity
(the loader contract, manifests, packages, tests) is necessary and is automated by the publish
tools; it never substitutes for looking.

## Performance

Optimise cost without removing authored visuals: shared textures, one draw per material, honest
LODs, culling. Forge hulls use six shared texture images for the whole fleet.

## Older documents

`VISUAL_ASSET_PRODUCTION_STANDARD.md`, `ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`,
`MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md`, `FLYABLE_SHIP_WORKFLOW.md`, `AGENT_PROMPTS.md`,
`TEMPLATES.md` and the `.grok` material-truth skill are **reference only**. They are no longer gates
and never apply to Forge ship bodies. Useful craft ideas in them (chamfer every hard edge, recesses
read darker than casings, detail the camera cannot see does not count) are already in FORGE.md.
