# LOAD-TIME-1 — the title in ten seconds, flying in twenty

**For:** a careful engineer. **Kind:** startup and loading performance. **One commit per cut.**

## Why

The first thing a $40 game does is start. The opening capture (2026-11-20, laptop under load)
measured **65 seconds to a usable title screen and 114 seconds to flying** after New Game; earlier
quiet-machine numbers were 38.5 s to the title and 34 to 105 s for a load. The bar on the owner's
laptop (15 W Core Ultra 7 155U, integrated graphics), quiet: **title usable in under 10 s cold and
under 4 s warm; New Game to first control in under 20 s; Swarm from the title to round 1 in under
15 s.** In the browser build and in Electron.

## Measure first

1. Add startup marks (the Performance API: `performance.mark` / `measure`) at every stage and one
   place that prints them as a table: process start (Electron) or navigation start, HTML parsed,
   first script evaluated, main bundle evaluated, title's first paint, title interactive, New Game
   pressed, simulation worker booted, world built, first frame of flight, first frame with the
   player's real ship model, authored-upgrade queue drained. Expose it as
   `window.__SF_BOOT_TIMELINE__` and as a line the capture tool can read
   (`scripts/capture-opening.mjs` reports "time to first control").
2. Write `scripts/probe-load-time.mjs`: cold and warm starts, three runs each, through the lock
   (`node scripts/fleet/game-lock.mjs run -- node scripts/probe-load-time.mjs`), printing the
   table and the slowest five resources and the five longest main-thread tasks during boot (a
   CPU profile through the Chrome DevTools Protocol is available from Playwright).
3. Attribute the time. For each stage say what it is spent on: fetching, parsing and evaluating
   JavaScript (some modules are over ten thousand lines; the English text catalogue alone is
   about 17,800 strings), decoding models and textures, compiling shaders, uploading to the GPU,
   building the world, the boot film, artificial holds and timers, waiting on the worker.

## Then cut, biggest first

Do what a current game does; keep the look.
- **Load only what the next screen needs.** The title needs the title: defer every module, catalogue
  and asset it does not use (dynamic `import()` at the point of use; split the text catalogue by
  screen; do not parse Adventure data to show a menu). Start the simulation worker and warm the
  first scene's assets in the background while the player is on the title, so pressing New Game
  finds most of it ready.
- **No artificial waits.** Find every timer, minimum display time, staged hold or "settle" delay in
  boot and in the New Game path (an earlier audit found the model-upgrade queue held about 22 s
  after first paint; part of that is fixed). Remove any that exist to look deliberate. A boot film
  is skippable on any key from its first frame and never blocks loading behind it.
- **Compile and decode off the critical path.** Compile only the shader programs the first scene
  draws, asynchronously (`KHR_parallel_shader_compile` is the pattern the engine already uses in
  places: `renderer.compileAsync`), and the rest behind the veil or after first control. Decode
  models and textures in workers. Never block first control on something off screen.
- **Cache what does not change.** In Electron: V8 code caching for the bundles, and whatever
  decoded or prepared asset caches the build already has, keyed by content hash so a second start
  skips the work. In the browser: correct cache headers from `server.js` and the service worker if
  one exists.
- **Show progress that is true.** The loading screen says what is happening in one plain line and
  its bar tracks real work; nothing sits at a frozen percentage.
- **First control early.** The player can fly as soon as the ship, the camera and the nearest
  bodies are real; distant dressing streams in afterwards without a hitch (the streaming work in
  commits fdc58b8503, 2b4ae4d07b, 8954fd5c79 guarantees a body you can hit is a body you can see).

## Prove

- `scripts/probe-load-time.mjs` before and after each cut, cold and warm, interleaved in the same
  session (this laptop's load varies two- to three-fold with other work: report ratios as well as
  seconds, and take a final set when the lock queue is empty).
- `node scripts/fleet/game-lock.mjs run -- npm run check:playable` stays 18 of 18.
- `npm run capture:opening -- --mode=adventure --minutes=3 --out=.devshots/capture/load-after`
  and the same for `--mode=swarm`: report "time to first control" and presses.
- In the receipt: the before and after tables, each cut with what it saved, anything you chose
  not to cut and why, and what the next biggest cost is.

## Files

Boot and loading code (`index.html`, `src/main.js` and the modules it pulls in at start, the title
and loading screens' data needs, `src/render/assetLoader.js` and the preload lists, `server.js`
cache headers, the Electron main process), `scripts/probe-load-time.mjs`, tests that pin boot
order. Shared files (`src/render/renderer.js`, `partsLibrary.js`, `src/main.js`): use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>`. Another engineer is working on the
main thread's per-frame draw cost in `src/render/renderer.js`: keep to the boot and load paths.
