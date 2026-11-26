# HUD-2 — the flight screen, second pass

**For:** a designer-builder with eyes. **Kind:** flight HUD polish. **Commit when the frames look
right.** The director judges your frames.

## Where the first pass stands

HUD-POWER-BAR (commit f10cd0fe03; receipt under `.devshots/fleet/runs/HUD-POWER-BAR.neon2.*/`)
landed the six-tile power bar and the quiet attention modes. The owner: "the HUD is looking
alright." The director opened the proof frames under `.devshots/hud-power-bar/after/` and these are
left. Shoot fresh frames first
(`node scripts/ui-bench.mjs --shot=flight,crucibleHud,flight-contacts,swarm-play --viewports=1280x720,1366x650,1920x1080 --out=.devshots/hud2/before`,
adding `?hudState=` fixtures as the first pass did) and look for more of the same.

1. **A stray empty square** sits just above the `Q More` pill (about x 640, y 609 at 1280×720 in
   `after/idle/1280x720/flight.png` and every other state). Find the element and remove or fill it.
2. **The objective card mixes units**: the title reads `Beacon 419 u` and the line under it
   `457 m · ETA 13s`, two different numbers for one place. One distance, in `m` or `km`, and the
   title is the thing's name ("Reach the beacon"), not a number.
3. **The news crawl is cut off** ("TRAGEDY AT HELIOS: RELIEF FREIGHTER LOS…"). It either fits, wraps
   to two lines, or scrolls once; it never ends in an ellipsis. In a fight it is hidden.
4. **The calm top-right chips float unevenly** (`Field Build Shift+B`, `COMMS`, `HAIL`,
   `RADIO-OFF` at 1366×650: three together, one far right in a different size). One row, one
   size, one style, right-aligned to the screen's safe edge; `Overhead [ \ ]` joins that row
   instead of hanging above the minimap.
5. **The ship panel** (the hull outline labelled `Hitch` / `Hornet` between the meters and the
   minimap) shows nothing a player uses. Make it earn its place: it shows where the hull was just
   hit (the side flashes), which hardpoints are firing or overheated, and what the Line is holding
   (a small tag: the thing's name and mass class). If that cannot be made readable at this size,
   remove the panel and give the space back.
6. **The Swarm round card** (top-left: round, hostile count, chain, score, kills, credits, level)
   prints seven numbers at equal weight. A player in a fight needs two: how much of this wave is
   left, and the chain. Make those large; fold the rest into one quiet line; show the wave's cast
   in plain words when a round starts ("Darts through a minefield") for three seconds.
7. **Prompts in the world** (`[ E ] DOCK AT STATION`, `F TOW` with a diamond): one prompt style,
   anchored near the thing it acts on, never over the power bar, never two at once. `F TOW` drew on
   top of the Line tile in `ROCK-LOOK…/after/foundry-play.png`.
8. **Floor-shop cards** in Swarm ("THE CRATE · 950 / Fits a random compatible gun…") appear
   mid-fight beside the gauges. They show only when the player is close to the pad and not under
   fire, and they anchor to the pad, not to the HUD.

9. **Fight headlines stack up.** In live frames the top of the screen carries a huge word
   ("SHIELD BACK", "SWARM WIPE", "COLLATERAL", "ROUND 02"), a chain number, "OVERDRIVE · GUNS",
   "TAP · STRIPPED · 1500", and a prompt ("FLYBY Break the beam", "INCOMING Sidestep or send it
   back") at once (open `.devshots/director/fable/vfx/pull/pull-c0-0250ms.png` and
   `…/vfx/bomb/bomb-c1-0000ms.png`). One headline at a time, smaller than today, for at most 1.5 s,
   never over the ship; the chain number lives in the round card; internal words ("TAP · STRIPPED",
   "COLLATERAL") become plain ones or go. A threat prompt appears only for the single most urgent
   threat and sits near the edge the threat comes from.
10. **The shield-collapse "glitch" covers the whole picture with horizontal stripes**
    (`sf-hud-glitch-overlay` in `src/ui/hud.js`; visible across
    `.devshots/director/fable/ai/frames/new-r1/f05.png`). It makes the game look low-resolution.
    Confine the effect to the shield meter and a brief flash of the screen edge; nothing may
    stripe or tint the 3D view.
11. **The round card names the cast.** The simulation now emits `encounter:castAnnounced` when a
    composed Swarm round begins (payload: `{wave, recipeId, line, answer, jobs[], groups[], tick}`;
    `line` is the cast in plain words, `answer` the best answer; job words in `ENEMY_JOB_WORDS`,
    `src/data/enemyJobs.js`). Show `line` on the round card as the round starts, with the job
    glyphs the minimap uses (`src/ui/map/tacticalMapGrammar.js`), for about three seconds; show
    `answer` only on a player's first few runs. If the event does not reach the main thread
    (check the event replay in `src/core/simLaneMain.js`), say so in your receipt.

Keep everything the first pass got right: the six tiles, state on the tile, the attention modes,
plain words, 12 px minimum type, keyboard, controller and touch reach.

## Prove

Before and after frames for each numbered item at 1280×720 and 1920×1080 (and 1366×650 for item 4).
`node scripts/ui-bench.mjs --shot=flight,crucibleHud --walk` reports no findings. The HUD tests the
first pass listed in its receipt pass, with any that pin a changed element rewritten. One live run
through the lock (`node scripts/fleet/game-lock.mjs run -- <probe>`) in each mode with two live
frames each. In the receipt: frame paths and files changed.

## Files

`src/ui/orrery/*` (flight cluster, visor instruments, skin, adapter), `src/ui/hud.js`,
`src/ui/hudMeta.js`, the objective card and news crawl sources, `src/ui/floatingText.js`, the
prompt sources, their CSS sources (regenerate sidecars with
`node scripts/lib/buildUiCssSidecars.mjs`), `tools/ui-bench.js`, tests. The minimap is being rebuilt
by MAPS-1: leave `src/ui/map/*` and `src/ui/radar.js` alone. For a shared file use
`bash scripts/fleet/own-commit.sh begin <file>` and `… commit "<message>" <files>`.
