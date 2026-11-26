# DEMO-LOAD-1 — Swarm's loading never looks like a hang, and we know where the 40 s go

**For:** Devin SWE-2. **Kind:** measure, one UI fix, findings. Commit your own files.

From the title, one press of Swarm PLAY takes 41-46 s to live control on this machine (Intel
integrated GPU), and the loading bar sits frozen at 88-89 % 'LIGHTING THE SCENE' for ~25 s, which
a stranger reads as a hang (`.devshots/fleet/runs/DEMO-SWARM-LOOK-2.deepseek.*/RECEIPT.md` section 1
and its loading-phases table; `scripts/probe-first-swarm-minute.mjs` reports the phases). Again
takes 13-19 s (a full rebuild).

## Do
1. **Find where the time goes.** Trace the loading presenter's phases (src/ui/loadingPresenter.js,
   the boot/launch path in src/main.js and src/render/renderer.js warm-up: shader program compile,
   texture upload, scene build). Instrument with performance marks (behind a dev flag, or reuse the
   existing load telemetry) and run the probe twice through the game lock
   (`node scripts/fleet/game-lock.mjs run -- node scripts/probe-first-swarm-minute.mjs`): once as is
   (cold profile) and once with a persistent profile if the probe or the electron launcher supports
   it (warm GPU shader cache). Report a table: phase | cold s | warm s | what it waits on (file:line).
2. **Make the bar honest.** During the long phase the bar must move with real sub-progress (n of m
   programs compiled / textures uploaded / warm steps done) so it never sits still for more than
   ~1 s, and the phase label says what it is doing in plain words. No fake animation pretending to
   be progress.
3. **Findings, not restructuring.** List the top three costs with a concrete proposal each (for
   example: compile programs in parallel with KHR_parallel_shader_compile and poll; warm during the
   title idle; keep the arena warm across Again instead of rebuilding). Do NOT restructure the
   renderer's warm-up or materials yourself: another engineer is changing materials and draw
   batching in src/render right now.

## You may edit
src/ui/loadingPresenter.js, the loading-progress reporting hooks (small, additive) in src/main.js /
src/render/renderer.js, scripts/probe-first-swarm-minute.mjs (timing fields only), tests. Before
editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout. Wrap game boots in the game lock; never steal focus.

## Receipt
Protocol headings; the phase table (cold/warm); the bar fix (commit) with before/after frames; the
three proposals.
