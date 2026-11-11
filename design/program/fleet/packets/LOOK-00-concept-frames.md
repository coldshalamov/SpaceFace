# LOOK-00 — Three concept frames of the target look (senior agent, image generation)

**Senior agent (Codex).** Output: three images and a short note. No code.

## The brief (owner + lead, 2026-11-11)
The owner: much of the game is dark and hard to read, with sudden over-blooming neon strips; the mood
is depressing and bleak; it feels pulled in different directions.
The lead's art direction (`design/game/README.md` ruling 2): **a busy working harbour at golden hour,
not a tomb.** Warm and readable. Deep blue shadows, never black. Neon only as small accents on signs,
engines and running lights — never a wash. Glow is a budget: only true lights glow. Every hull, rock,
pickup and enemy reads against the background at a glance. Space can stay dark, but it is a deep,
rich blue-violet with visible nebula colour, not void.

## Reference
`.devshots/fleet/mine/wheel-held.png` — a real 1280×720 frame of the current game (Swarm, the Ricochet
Foundry, round 3): HUD on the left and corners, the player's ship in the centre, rocks, a ringed
planet, enemies. Keep the **same composition, camera angle, objects and HUD layout**; change only
light, colour, value and glow.

## Make
Three variations, each 1280×720 PNG, saved to `design/game/look/concepts/`:
1. `A-golden-harbour.png` — warm key light (late-afternoon gold), cool blue-violet shadows, rocks with
   warm lit faces, readable mid-tones, nebula in teal and amber.
2. `B-clear-day.png` — brighter and cleaner: near-white key light, saturated paint, lighter blue space;
   the most "arcade" of the three.
3. `C-warm-dusk.png` — closest to today's darkness but readable: deeper space, warm rim light on every
   hull, strong silhouettes, glow only on engines and lamps.
Also a fourth image `0-current.png`: the reference copied as-is, for side-by-side comparison.

## Note
`design/game/look/concepts/README.md`: one paragraph per frame — what changed in light, colour, value
and glow, and which settings in the game's look system (`src/data/lookMoods.js` — LOOK_BASE surface,
post and rig blocks; `src/data/sectorVisualProfiles.js` post exposure/bloom) would move to get there,
with your best estimate of the numbers. Commit the folder:
`git add -- design/game/look/concepts && git commit -m "look: three concept frames for the target look" -- design/game/look/concepts`.
