# SpaceFace graphics — front door

Rewritten 2026-09-27 by the graphics owner after the owner's review: the fleet read as "simply ok",
inconsistent, leather-and-scraped-tin surfaces, a box stuck on Hitch's nose. The old front door
routed every model through a stack of gates (G0–G7 records, five-cycle adversarial reviews,
hash-bound acceptance, per-asset material-truth preflights). It produced paperwork and a fleet
where every hull came from a different pipeline. The replacement is short on purpose.

Graphics program (workflows, rules, backlog): [`design/program/GRAPHICS_PROGRAM.md`](../../design/program/GRAPHICS_PROGRAM.md); skill: `.claude/skills/forge-graphics/SKILL.md`.

## The rule

**Look at the real picture, fix what you see, keep one system.** The picture is the game's own
renderer, lights and post at the gameplay camera — not a Blender studio render, not a receipt.

## Routes

| Work | Go to |
|---|---|
| Any ship body (player, NPC, traffic, faction variant) | [`tools/blender/forge/FORGE.md`](../../tools/blender/forge/FORGE.md) — the one kit, look bar and publish command. No ship is built any other way. |
| Stations, places, props, wrecks, rocks | Until Forge covers them: keep each asset's existing builder, but meet the FORGE.md look bar (plan silhouette, three values, manufactured not noisy surfaces, nothing floating) and review with `scripts/fleet-look.mjs --files=places/<file>.glb`. |
| The vibe: lighting, shadows, grade, bloom, how every surface answers light | [`LOOK.md`](LOOK.md) — one owner (`src/data/lookMoods.js` + `src/render/look.js`), per-sector moods, and `scripts/look-bench.mjs` to judge a number by the picture. |
| Runtime look (material response per asset) | `src/render/` — `authoredMaterialProfiles.js`, `illustratedSurface.js`, `bloom.js`, `src/data/sectorVisualProfiles.js`. Change the shared layer when the defect is shared. |
| VFX (plumes, impacts, beams, trails) | [`VFX_TECHNIQUE_STANDARD.md`](VFX_TECHNIQUE_STANDARD.md), then [`VFX_LIFECYCLE_STANDARD.md`](VFX_LIFECYCLE_STANDARD.md). No soft square/disc stands in for an object; distant stars are the only exception. |
| Portraits / concept art | `assets/portraits/AGENTS.md`, `assets/concept/AGENTS.md` |
| **Authored 2D images (generated, cleaned, shipped as pixels)** — **owner ruling 2026-10-03: use them anywhere they look better than code-drawn 2D.** | A generated image is a first-class way to make planets, rock and ice surfaces, debris and effect sprites, trim sheets and livery decals, sky and dust, UI backdrops, plates, portraits, props and paperwork. Procedural drawing stays only where it beats a picture (things that must animate, scale or respond to game state). The working pattern is the one already used for `assets/ui/generated/<set>/` and `assets/background/quiet-planets.png`: a style-bible prompt per set, transparent or additive-on-black output, a `manifest.json` beside the set (generator, date, prompt, per-file subject, sha256, alphaFromSource), WebP/KTX2 export, an id→file map with a fallback to today's look, and a look at the real picture at the gameplay camera and at 32/64 px. Where this contradicts an older "no decals / no noise / reference-only" line (FORGE.md rules 3 and 6, the spacepunk markings README), this ruling wins; the surviving rules are in FORGE.md rule 6. **The working loop, the tools and every trap: [`tools/art/IMAGEGEN.md`](../../tools/art/IMAGEGEN.md). A generated image counts only when the live game loads it; concept art nothing loads is not a deliverable.** |

## Seeing the picture

```
node scripts/fleet-look.mjs --file=<release path or any .glb> --views=inspect,close,top   # one model, live pipeline
node scripts/fleet-look.mjs --fleet --views=close                                         # every live hull, contact sheet
node scripts/flight-look.mjs [--ship=ship_<id>]                                           # real New Game flight
node scripts/look-bench.mjs [--moods=…] [--vary=patches.json] [--cost]                    # the Look: moods x hulls, one sheet
```

`SF_GL=d3d11` in front of `fleet-look` / `flight-look` shoots on the machine's real GPU (seconds
per frame) instead of the software rasterizer. `look-bench` uses the GPU by default.

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
