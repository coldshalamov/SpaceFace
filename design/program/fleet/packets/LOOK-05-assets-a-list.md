# LOOK-05 — Assets to the A-list bar: textures, wear, VFX sprites, clean models

**Owner, 2026-11-13** (screenshot of Swarm round 20): *"washed out and shitty … cheapo ms paint textures … no stupid obvious
model box pieces … a good model with some stupid looking cheap box tacked to the front … professional games need
professional textures … wear and tear and scratches and graffiti and little things … lighting used stylistically for mood."*
**The bar:** a modern 2026 A-list game (memory rule; `design/program/finish/bible/LOOK.md` value structure §3; design/game/18).
If a technique or asset would never ship in a real major game, it does not ship here. Scope: **everything a player sees in the
first sector (Helios / the 47-A opening) and in Swarm** — fix those first, everything else later.

## Tools you have
- **Codex image generation from the terminal** (owner-provided): `node "%APPDATA%\npm\node_modules\@openai\codex\bin\codex.js" exec -m gpt-6.1-sol -s danger-full-access -C <repo> "<prompt>"`
  (in Git Bash: `node "$APPDATA/npm/node_modules/@openai/codex/bin/codex.js" exec ...`). Codex can generate images — tileable
  textures, normal/height-friendly maps, transparent-background PNGs, sprite sheets, animated GIFs — and save them to paths you
  name. Prompt it with exact specs: purpose, size (power of two), tileable or not, transparent or not, palette and style
  (the LOOK bible: warm sodium key, indigo shadow, worn industrial, painted-not-plastic), and where to save. Verify each file
  (open it with Read), regenerate until it meets the bar. Write the prompts you used next to the assets (a small `PROMPTS.md`).
- The Forge route for 3D (`docs/visual-assets/README.md`, the `forge-graphics` skill) for model work.
- Live looks through the one-at-a-time lock: `scripts/fleet/looks/throw.mjs` (Swarm round N), `scripts/fleet/looks/round-text.mjs`,
  `scripts/fleet/looks/sector-shots.mjs`, `scripts/look-bench.mjs` (hull grid). **Batch your looks** — one run that shoots
  several things — the lock is shared by many agents.

## The four strands (one agent each)
**A · Rocks and terrain.** Every asteroid family in Helios and the Swarm arenas (`src/render/visualFactory.js` `astMaterial` /
`astDisplacedGeometry`, `rockSurfaceLibrary.js`, `rockFamilyLibrary.js`). Today: flat tan, low detail, "MS paint". Target:
rich geology — layered strata, fractures, mineral veins, dust in crevices, edge chipping, colour variation within a rock and
between families; ice reads as ice (opaque, satin, cool — ee273392), metal ore glints, crystal glows only at its seams. Generate
proper tileable albedo + normal + ORM sets per family through Codex, wire them through the existing libraries (no second path),
keep material count low (one material per family+variant, already cached).

**B · Hull wear, grime and decals.** Hulls in the first sector and Swarm enemies (`src/render/illustratedSurface.js` HULL_LAYOUT /
STENCIL GLSL, `src/data/*appearance*`, authored parts). Today: clean plastic. Target: edge wear on panel edges, scratches, soot
behind thrusters, grime in recesses, faction markings, hull numbers, hazard stripes, the odd graffiti tag — modest, believable,
per-faction. A decal/atlas set with transparent backgrounds from Codex, applied through the existing stencil/layout path.

**C · VFX sprites.** Muzzle flashes, impacts, sparks, smoke, debris dust, engine trails, explosions, shield hits, Line/tether
energy (`src/render/vfx*.js`, `assets/vfx/`, `assets/fx/`). Today: flat discs and pixelated gradients. Target: authored
flipbook sprite sheets (transparent PNG, power-of-two atlases) with real shapes — wisps, embers, shock rings, smoke billows —
HDR-bright cores that the bloom catches, soft-particle edges. Keep particle counts and overdraw within today's budget.

**D · Clean models.** Every hull/structure a player sees in the first sector and Swarm. Find the cheap tacked-on pieces —
untextured boxes, placeholder primitives, decoration scatter that reads as junk (`visualFactory.js` decoration/kitbash, authored
part wrapping `wrapShipWithAuthoredParts`, station modules). Remove, replace with a proper authored part, or integrate. Use the
look-bench hull grid before/after; list every model touched.

## Rules
Performance stays at least as good (owner leans to performance): texture sizes 512–1024 for world bodies, compressed where the
pipeline supports it, atlases over many small files, no new transparency where opaque works. Single owners — extend the
existing libraries/materials, never a parallel path. Before editing any file: `git status --short -- <file>` and
`git diff -- <file>`; preserve others' uncommitted work; LOOK-04 owns `lookMoods.js`, `look.js`, `bloom.js` (don't edit). Never
`git reset/restore/checkout/stash/clean/rebase`, never `git add -A`, never push. Commit exact paths, small commits:
`look(LOOK-05<A|B|C|D>): <what the player sees>`. Every strand ends with **before/after frames of the same moment** (round 3
and round 20 Swarm, the Helios opening) that you opened and judged honestly.
