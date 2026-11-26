# ROCK-LOOK-2 — finish the rocks: iron that reads as iron, Foundry debris that is crisp

**For:** a designer-builder with eyes. **Kind:** rock materials, second pass. **Commit when the
frames look right.** The director judges your frames.

## Where the first pass stands

ROCK-LOOK (commit 544d361c22; brief `design/program/fleet/packets/ROCK-LOOK.md`, receipt under
`.devshots/fleet/runs/ROCK-LOOK.neon2.*/RECEIPT.md`) fixed the silhouettes and the brown stone:
the common rocks now look like fractured quarry stone and the painted ships are gone from the sky.
The director opened the after-frames and three things are still wrong.

1. **Iron rocks read as blurry grey foil.** Open
   `.devshots/fleet/runs/ROCK-LOOK.neon2.2026-11-20T12-48-40/after/adventure-belt-metallic.png`:
   the two grey rocks below the ship have a smeared, low-resolution surface with soft pale patches,
   like crumpled plastic wrap. The brown rock at the top of the same frame is crisp. Iron should be
   the handsome one: dark, heavy, with sharp worn edges that catch light and visible grain and
   pitting at the size it is actually drawn. Find why its surface resolves so much softer than the
   stone (texture scale in world units, mip bias, the triplanar blend width, a missing detail
   layer, or the normal strength) and fix the cause. Ice, crystal and slag get the same check at
   the gameplay camera: no family may look softer than the common stone.
2. **A white square floats near the planet** in that same frame (a flat untextured card, upper
   right, left of the ringed planet). Find what draws it (a billboard, a marker, a backdrop card
   with a missing texture, a loading stand-in) and remove the cause.
3. **Foundry debris is still soft.** Open `…/after/foundry-play.png`: the icy lump at the left and
   the dark lump at the right still read as fuzzy shapes against the deck, and neither has a
   contact shadow. They are things the player ropes and throws: they need a hard silhouette, a lit
   side and a shadow side, and a shadow on the deck.

Also check, while the scenes are open:
- A rock in front of the planet reads at the same depth as the planet. Rocks near the camera need
  the foreground lighting and crispness that separates them from the painted backdrop.
- Rocks must not get more expensive to draw. State the shader cost before and after (the frame
  time of a belt view with about forty rocks on screen, measured back to back in one session), and
  keep triangle counts where the first pass left them or lower. If the first pass's shader is
  measurably slower than what it replaced, find the cheapest way to keep the look.

## Prove

Before and after frames at the gameplay camera: an Adventure belt with iron, ice and crystal rocks
in one view; the Foundry during play; a rock against the planet. Take them in as few game runs as
possible through the lock (`node scripts/fleet/game-lock.mjs run -- <probe>`); reuse the probe the
first pass left in its run folder. Open every PNG. In the receipt: frame paths, the cause of each
of the three faults, the frame-time comparison, files changed.

## Files

`src/render/rockTriplanar.js`, `src/render/objectSpaceGeology.js`, `src/render/rockSurfaceLibrary.js`,
the rock builders in `src/render/visualFactory.js`, `src/render/opticCellPresentation.js`,
`src/data/lookMoods.js`, whatever draws the white card, their tests. Other agents are editing
`src/render/renderer.js` and `partsLibrary.js`: use `bash scripts/fleet/own-commit.sh begin <file>`
before editing a shared file and `bash scripts/fleet/own-commit.sh commit "<message>" <files>`.
