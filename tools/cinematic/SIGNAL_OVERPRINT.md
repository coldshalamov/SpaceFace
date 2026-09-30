# Signal / Overprint — preservation and review contract

This is an additive treatment of the existing intro, not permission to replace it.
Owner direction: retain the best terminal art, floating sculptures and authored
cinematic scenes; make a shorter, more abstract industrial-horror/cyberpunk loop.

## Protected source material

- `assets/cinematics/intro-visualizer.mp4` and `.jpg`: the existing six-shot movie.
- `tools/cinematic/intro-scene.js`: its authoring source and real game-model reuse.
- `src/ui/loadingSignalTableaux.js`: the finished CONTINUUM solid sculptures.
- `src/ui/loadingTerminalArt.js`: original continuous terminal feedback and fallback.

None of those files is modified by this treatment. `introSignalRemix.js` imports
CONTINUUM's actual renderer and reuses the terminal's curl derivative and character
ramp. It does not run three complete render engines simultaneously on the default
route. The full older terminal renderer remains available in the comparison viewer.

## Default route

`index.html` dynamically imports `introSignalRemixBoot.js` only after calling the
existing boot initializer. Import failures are caught. The binder recognizes the
existing boot movie and the cinematic-splash movie; it does not touch arbitrary
videos, Codex playback, audio, input dismissal or game state.

The original 32-second movie plays at `32 / 18` speed, without seeks or re-encoding.
A separate bounded WebGL2 optical pass layers moving sculpture exposures,
character-screen masks, curl-field filaments, cold-metal/copper grading, camera
pushes/drift/roll, splice-aligned slit-scan, colour registration and phosphor trails.
Live geometry carries the baked fade across the boundary. The footage repeats in
18 seconds; independent optical clocks continue, so the entire image does not
reset to the same composition every time.

Do not turn this into six unrelated effects presets or a centered model slideshow.
Keep recognizable subjects and dark resting areas among the interference. Changes
to timing or opacity should be evaluated in motion, not judged from one still.

## Resource and fallback boundaries

One movie decoder, one optical draw plus blit, two history buffers, and one existing
sculpture source updated at 12 Hz. Output is capped at 1280 by 720 and 30 Hz. These
are explicit limits, not verified frame times on integrated graphics. No GLB model
was remeshed, no new media downloaded and no gameplay subsystem was changed.

Allocation is deferred until playback; hidden hosts stop GPU work and pause video;
removal releases observers, textures, framebuffers, shaders and canvas. Context
failure reveals the unchanged movie and restores its old playback rate. Movie
failure still belongs to the original loading-art fallback path.

Initial reduced motion allocates no optical renderer. Live reduced-motion changes
hold a still. Reduced flash disables added splice/tear/temporal-grain and registration
effects, but does not remove lighting already baked into the original movie. This
is not a photosensitivity certification.

## See and test the real sources

From the repository root:

```sh
python tools/cinematic/signal-remix-server.py --open
node --test test/intro-signal-remix.test.mjs test/loading-boot-resilience.test.mjs test/loading-terminal-art.test.mjs test/loading-intro-grade.test.mjs test/startup-loading-presentation.test.mjs test/cinematic-input-fence.test.mjs
```

The comparison page switches between Overprint, Original film, Floating sculptures
and Terminal field. It uses the original media and code, not mock geometry. The
server implements byte ranges: a generic Python HTTP server can silently land on
frame zero after a movie seek. The capture runner checks actual source timestamps
and fails rather than approving six screenshots of frame zero.

`signal-remix-proof.mjs` runs against full Chrome (needed for the real H.264 movie),
records screenshots, validates lifecycle/viewport/fallback behavior, and records
one real-time software-rendered motion preview. The scoped GitHub workflow downloads
only the relevant code and movie, not the multi-gigabyte model library.

Focused local regression: 45 tests passed. Browser evidence is scoped to the real
intro hosts/compositor and the comparison page, not a full gameplay playtest. Before
claiming hardware performance, measure the normal game boot on the target GPU.

## Future-agent rule

Preserve first, treat second, compare third. Keep the original sources accessible;
change the optical layer or score for further polish. Do not delete or wholesale
replace the movie, its scenes, or either earlier renderer as an interpretation of
"improve the intro". Keep before/after captures and runtime tests with every change.
