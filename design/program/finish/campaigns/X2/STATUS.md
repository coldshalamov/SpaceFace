<!-- LIFETIME: CAMPAIGN -->
# X2 — Asset production: status

**State: GATED on the owner approving X1's lineup. No mass production has started.**
See [`../X1/LINEUP.md`](../X1/LINEUP.md) for the approval package.

## What is ready to run

- The Forge route: `tools/blender/forge/FORGE.md`, `publish.mjs`, `fleet-look.mjs`, `flight-look.mjs`.
- The X1 finish module (`src/render/arenaFinish.js`) as the prop value/material bar.
- The census in [`../X1/CENSUS.md`](../X1/CENSUS.md) with the B1–B7 break list and K1–K7 keep list.
- The acceptance loop: gameplay-camera capture + turntable + independent image review against
  `STYLE_BIBLE.md` + runtime manifest row + no frame-time regression (E10).

## First production batch (on approval)

1. **Seven arena kits** — authored GLB furniture for the law rooms (pylon, shutter, crusher, current
   mouth, cryo tank/manifold, storm pylon/relay, Foundry plate/gate/furnace), matching the X1 finish.
2. **Swarm enemy silhouettes** — from `src/data/swarmCharacter.js` (S7 sheet) through the Forge
   route; each archetype recognisable by shape + colour + motion with the HUD hidden.
3. **Boss break-up chunks** — authored fragments for the Iron Maw / Foreman / Regent deaths.
4. **Planets/backdrops** — a re-grade of the Helios sky giant's authored `lightAngle` (the open X1
   defect), and any new sector backdrop the style bible admits.
5. **Prop replacements** — `buildPayload` mounts an authored pod; any live station still on
   `buildStation` gets an authored archetype.
6. **Part visuals for Lane 4** — P4's socket mounter assets.
7. **The ship sheet's hangar scene** — the P1 backdrop.

## Blocker in one sentence

The owner must approve the X1 style bible and lineup before X2 mass production starts.
