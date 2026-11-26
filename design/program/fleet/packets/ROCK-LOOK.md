# ROCK-LOOK — rocks are the hero art, not placeholders

**For:** a designer-builder with eyes. **Kind:** materials and shapes of rocks. **Commit when the
frames look right.** The director judges your frames.

## Why

In this game rocks are the ammunition: the player ropes them, throws them, ploughs them into
enemies. Today they are the worst-looking things on screen.

- **Adventure:** large asteroids draw as blue-white faceted geodesic balls — open
  `.devshots/director/fable/baseline/travel/f06.png`. Cause found: the `ast_metallic` rock is
  authored as a flat-shaded, barely displaced icosphere (`src/render/visualFactory.js` near :2403)
  with a high-metal finish (`src/render/rockTriplanar.js` near :32) that mirrors the nebula.
- **Swarm (the Foundry):** rock and debris props read as fuzzy brown translucent blobs — open
  `.devshots/director/fable/vfx/frames2/12-shove-0250.png`. They are wrapped as
  `PlaceProp_AuthoredAssetBoundary` in `src/render/partsLibrary.js` near :4153-4163; find the
  material that makes the fuzz.
- The owner calls placeholder-looking faceted rocks out by name, and the game's look guide is
  `design/overhaul/07_LOOK_AND_LIGHT.md` (read §2 and §6).

## Look first

Find how each rock family is built and shaded (`grep -n "ast_" src/render/visualFactory.js | head
-60`; `src/render/rockTriplanar.js`; the rock entries in the asset manifests under `assets/`; the
authored rock models named `place_rock_*` and `place_asteroid_*`). Shoot every rock family in a
neutral scene and in play. Use an existing rock or look probe if one exists
(`ls scripts/fleet/looks/`, `scripts/probe-asteroid-appear.mjs`); if you must boot the game, do it
through the lock (`node scripts/fleet/game-lock.mjs run -- <command>`) and take all your frames in
as few runs as possible. Open every PNG.

## Build

1. **No rock is a geometric primitive.** Every asteroid a player can see has a broken, weighty
   silhouette: displaced, faceted by fracture planes rather than by a sphere's triangles, with a few
   large forms and fine detail. Where authored rock models exist for a family, use them; where a
   family is procedural, raise the displacement and vary the base shape so no two neighbours match
   and none reads as a ball. Keep triangle counts sensible for something drawn dozens of times
   (state the counts).
2. **Rock is rock.** No mirror finish. Rough, low-metal stone with ore veins and crystal faces as
   the only bright or glossy parts, so the type of rock reads at a glance: iron, ice, crystal, slag,
   carbon. A metallic asteroid is dark iron with bright worn edges, not chrome.
3. **Lit to read.** A rock shows a lit side, a shadow side and a clear edge against space and
   against the Foundry deck. It must never blow out to white and never sink into the background.
4. **Foundry props are solid.** No translucent fuzz. Debris and rock props are opaque, crisp, and
   sit on the deck with a contact shadow.
5. **Keep the physics.** Do not change collision shapes, masses or ids. If a new silhouette departs
   visibly from the collision proxy, say so in your receipt.

6. **No ghost ships in the sky.** The Helios backdrop has flat painted cards of a derelict hauler and
   a relay mast (`helios-derelict-hauler`, `helios-relay-mast`, `way-of-life` in the sector's
   authored background layer; see `.devshots/director/fable/streaming/run-pick/pick.json` and
   `t3.png`, and `a0-spawn.png` in the baseline folder). They are drawn top-down at ship scale, so
   they read as dark-blue cut-out ships floating beside the player that can never be touched. Remove
   ship-like and structure-like cards from every sector's backdrop layer, or restyle them so they
   are unmistakably far away (several times larger than a ship, dim, hazed, no crisp top-down
   outline). The backdrop is for skies, planets and distant glow.

## Prove

Before and after frames of every rock family, alone and in play (an Adventure belt, the Foundry), at
the gameplay camera. In the receipt: frame paths, triangle counts per family before and after, and
what you changed per file. Update tests that pin the old materials.

## Files

`src/render/visualFactory.js` (rock builders only), `src/render/rockTriplanar.js`, the rock material
code you find, the rock rows of the asset manifests, their tests. Other agents are editing
`src/render/renderer.js` and `partsLibrary.js`: use `bash scripts/fleet/own-commit.sh` for any shared
file, and keep your edits inside rock code.
