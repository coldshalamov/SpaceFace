<!-- LIFETIME: DURABLE -->
# Visual bug sweep — 2026-08-30 (full-frontend polish pipeline)

Owner mandate: the pre-2026-08 identity (neon console, rails, glass, tracked labels) is
**poisonous and retired** — see `design/frontend/INSTRUMENT_GRAMMAR.md` §3/§4 (2026-08 revision),
which now binds every 2D surface. Features are kept; implementations were fixed. Screens were
**not** ripped out.

## The harness (this is how you see the frontend without playing)

- `node scripts/capture-screen-atlas.mjs` — one headless boot, every frontend surface
  (menus, new game, flight instruments, comms fan/deck, charts, ship/range/footprint,
  mission log, codex, tech tree, help, drill, pause, save/load, docked station + all seven
  destinations) → `.devshots/atlas/` + `manifest.json`. This is the pipeline's eyes.
- `node scripts/capture-ui-matrix.mjs` — the a11y-mode × viewport matrix (flight, chart,
  footprint, range, ship).
- Comms-fan probe: `.tmp/probe-commsfan.mjs` pattern (boot, stage a hailable contact,
  hold Alt, capture; keep the player parked beside the target or the contact flies out of
  hail range mid-capture).

## Root causes found (these regenerated the mess for ~20 prompts)

1. `design/frontend/INSTRUMENT_GRAMMAR.md` (pre-revision) **specified** the rejected look as
   binding. Rewritten §3/§4 (2026-08): neutral charcoal, one blue accent, Plex, bans on
   neon/rails/glass/tracking> .06em/glows/gradient fills. Per-screen docs carry supersession
   banners.
2. Three token generations stacked in `styles/ui.css` + ~44 module-injected stylesheets +
   canvas-drawn literals meant no single sweep could reach everything. Sweeps now cover:
   global tokens, `src/ui/**` hexes, canvas palettes (radar/IFF/factions/lenses), and
   letter-spacing in every injected stylesheet.
3. Screens ran private palettes (chart gold, menu cyan, station teal). All re-pointed to the
   global tokens.
4. Verification culture was check-scripts, not eyes. The atlas + adversarial image review is
   now the acceptance pass — several shipped defects (flex-crush ghost text, CSS-const
   shadowing that silently killed faction clicks, shine-through HUD) were invisible to all
   code checks.

## Fixed this pass (commits b1714237 → b44e4b03)

- Identity retheme everywhere; station/menu/chart private palettes unified; radar/IFF/canvas
  colors desaturated; DRIVE purple → accent; ~45 station glows stripped; rails retired.
- Comms fan: rebuild-storm flicker, hover-focus steal, quadruple "CHANNEL OPEN.", arc
  collisions — rebuilt as a stacking list that cannot collide.
- Real bugs fixed across the atlas: mission-log ghost text (flex-crush + overflow), faction
  clicks silently dead (`CSS` const shadowed the global), chooser/leads/recipe-rail clipping,
  market stats slivers, contracts gradient CTA + ticker flush-cut + duplicated readiness copy,
  save-row overlaps + dev-slot row, radar "RANG" shear, HUD shine-through (LOCAL CONTACTS and
  power-rail plates), faction caption contrast, bar contact-tab truncation, ledger
  pluralization, tech-tree divider clipping, help scroll affordance, footprint void +
  doubled verb, chart lens hues + duplicated WHERE YOU ARE + stray header strip.

## Open (real, needs a decision or a bigger budget)

1. **Missions tab attention card shears** — the Active Missions strip's amber attention card
   is clipped by the `.sx-ct` grid row budget (not the strip's own overflow). Needs the
   missions grid row revisited (content-sized row, or move the attention card into the
   dossier). Marked in `contracts.js` injected CSS.
2. **Ship screen "SOUND" verb** reads as audio jargon (it means hull-is-sound); consider
   rewording the condition verb bank. Top-edge fleet card clip is fixed; this wording is not.
3. **Footprint / ledger / bar empty states** are now honest and bounded, but the bar
   transcript idle view is still sparse on tall hosts.
4. **Pre-existing red checks, not from this pipeline** (verified byte-identical to HEAD at
   the time): `check:ui-a11y` pins a `screenManager.js` string HEAD lacks;
   `test/galaxy-map-inspector-stability.test.mjs` and `test/localization-reachability.test.mjs`
   (quitGame catalog entry) fail from other lanes' drift; `check:playable`'s isolated Electron
   harness could not load its own page all session (browser boots fine — probes + 60-frame
   matrix captured repeatedly).
