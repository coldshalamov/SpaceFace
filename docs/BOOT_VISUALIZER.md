# Boot visualizer: native media, not another loading renderer

PR #190 follows the report that Smooth Boot animated the progress instrument but left the artistic visualizer frozen. It changes the artwork's execution path, not the game's readiness criteria.

## Why the earlier change did not solve it

The live SIGNAL / OVERPRINT implementation places an opaque WebGL canvas above the movie. That canvas depends on main-thread JavaScript. When module evaluation, initialization or a synchronous graphics operation blocks that thread, a perfectly healthy playing video underneath is invisible behind its frozen optical layer. Moving the progress ring to a worker does not fix the picture covering most of the screen.

There was also a split bootstrap: the entry started the original artwork bootstrap without awaiting it, while the game presenter could acquire a different artwork owner first. A worker could therefore run behind an unplayed video poster. More easing or more progress callbacks cannot repair either ownership/layering problem.

## Execution path

`index.html -> bootEntry.js -> shared native visualizer + existing ring -> bounded media-frame readiness -> main.js -> loadingPresenter.js -> same visualizer owner`

The original scenes, CONTINUUM sculptures, camera treatment, glyphs, grading and feedback are rendered offline using the existing `attachIntroSignalRemix` implementation. The shipped loading route plays the result directly as native H.264 video. It does not upload a video texture to a second WebGL context or redraw the visualizer through requestAnimationFrame.

The live renderer source and original movie are retained. The title route can still use its live optics. The native loading video carries `data-boot-native`; the optional live binder rejects that marker both when scanning and immediately before deferred initialization. Do not remove that exclusion.

## Ownership and failure behavior

`bootMediaPlayback.js` owns media selection, playback intent, frame proof, preferences and cleanup. `bootVisualizer.js` owns the per-document shared instance, DOM layering, visibility, clock and exceptional worker fallback. `loadingPresenter.js` owns progress and reveal, not movie time.

Starting an already-started owner is a no-op. Progress reports never seek, reload or restart the movie. Hide pauses it; Continue resumes the same owner and position. Only a real source/preference change seeks to preserve position in another variant. Late play rejections and callbacks are fenced by a generation token.

Startup normally observes two distinct presented media frames before admitting the large game import. A fulfilled play promise is not sufficient evidence. After proof, the controller stops requesting per-frame JavaScript callbacks: the media pipeline owns the frame clock. Older browsers use advancing decoded media time as the fallback proof.

A 2.5-second deadline prevents decoration from blocking the game indefinitely. It releases startup without claiming game readiness and leaves a late native movie able to recover. Probing/buffering/poster states get restrained CSS-transform drift. Slow networking alone never launches a competing live renderer.

A real normal-movie failure tries the preserved original movie once, then admits the existing 2D worker fallback with the covering video explicitly hidden. The reduced-flash variant never falls through to a flashier original. Reduced motion intentionally uses a still and disables drift. Hidden pages pause playback and decorative work. Final destroy cancels callbacks, timers, observers and listeners.

## Media and packaging

The four committed files are `assets/cinematics/boot-visualizer.mp4`, `boot-visualizer-quiet.mp4`, `boot-visualizer.jpg` and `boot-visualizer.manifest.json`. No user needs an encoder to play the game.

Both movies use 1280 x 720 at 24 fps, matching the live optical renderer's maximum canvas resolution. A circular 0.5-second dissolve produces a 17.5-second loop. Encoding uses H.264 Main, an 8 Mbit/s VBV ceiling, faststart metadata and a 19 MiB per-movie file gate. Grain-heavy footage must not silently become a 20-30 Mbit/s loading dependency. Only the selected variant is requested, rather than preloading both variants and the original movie together.

The existing release copy map already ships `styles` and `assets/cinematics` wholesale. The existing bundle rewrites the lightweight entry to `main.js`; tests exercise that actual rewrite. No package.json, lockfile, game simulation, asset-admission or GPU-readiness semantics change here.

Rebuild with Chrome, ffmpeg and the repository's Playwright tooling available:

```sh
node tools/cinematic/bake-boot-visualizer.mjs
node tools/cinematic/check-boot-media-assets.mjs
```

`BOOT_PLAYWRIGHT` can point to an installed Playwright ESM entry. The bake workflow runs offline and commits only generated assets to the dedicated fix branch; manual runs on other branches produce artifacts without publishing code. The hash manifest binds both artist modules, the original movie and the bake recipe to every generated output. The check rejects missing, stale, oversized, hash-mismatched or non-faststart media. Artist or recipe changes require a new bake; do not waive the provenance check.

## Reproducible regression checks

```sh
node --test test/boot-media*.test.mjs test/intro-signal-remix*.test.mjs
node tools/cinematic/check-boot-media-assets.mjs
node tools/cinematic/boot-media-proof.mjs --out /tmp/spaceface-boot-media
```

The proof starts the existing byte-range server on 127.0.0.1:8128 and mounts the real media owner, presenter, ring and event bus. Desktop is 1280 x 720; the reduced-motion viewport is 390 x 844. `BOOT_CHROME_PATH` selects a local Chrome executable; `BOOT_PROOF_URL` selects an existing fixture server.

It deliberately blocks page JavaScript for five seconds. DevTools screencast frames are accepted only when their timestamps fall strictly inside that interval. An artwork-only region, excluding the progress ring and clock, is compared pixel-by-pixel. Both native variants must keep changing; the original live optical overlay is run as the control and must reproduce the freeze. A worker heartbeat or a screenshot taken after the block is not accepted as proof.

Other checks exercise 300 progress events, hide, a visible Continue control, failure, frame-gated reveal, worker/ring reuse, runtime errors, mobile bounds and reduced-motion CSS. Unit tests cover rejected/late play promises, media errors, preference changes, source switching, deadline recovery, idempotence and cleanup. The old artistic score and binder tests remain; obsolete inline-entry assertions now test the real shared entry.

The `Boot media regression` workflow exports the source snapshot and actual timestamped screen captures, JSON results and screenshots. `Intro visualizer review` separately protects the retained artistic renderer. Generated review evidence is an artifact, not a runtime dependency.

For an environment that cannot navigate localhost, `--local-bytes` injects already-local source/media into a test page without changing browser policy. `--skip-live-baseline` is explicit when the host has no WebGL2. `--original-only` is a transport/controller diagnostic only: it does not validate the new baked movies and must not be reported as doing so.

## Scope and remaining risk

This proves resilience of the real loading presentation to a sustained JavaScript stall. The fixture's renderer frame counter is controlled, not a full gameplay renderer. It is not an end-to-end benchmark of the complete asset-heavy game, a cold-download bandwidth benchmark, or a guarantee against graphics-driver/GPU-process or whole-machine stalls. Native media still needs decoder/compositor resources.

The loop is now predetermined rather than interactively recomputed during loading; the authored appearance is retained, but optical source changes must be baked. Progress remains live and connected to real work. Neither moving artwork nor elapsed time authorizes 100 percent, flight, or a successful asset admission.

On a full checkout, exercise cold boot, New Game, Continue, failed load and repeated return-to-menu with the real assets, then run the existing launch-policy and release-bundle checks. If a target GPU still stalls the whole compositor, profile that separate driver/queue bottleneck and reduce admission burst size or move CPU preparation off-thread. Do not restore an opaque main-thread optical canvas over the native movie, skip readiness gates, or disguise a failed load as completion.
