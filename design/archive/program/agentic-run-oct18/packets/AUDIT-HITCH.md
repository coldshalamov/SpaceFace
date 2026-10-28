You are a READ-ONLY auditor inside the SpaceFace repo (a Three.js space game; 60 Hz fixed-timestep sim decoupled from rendering; flat GameState + event bus + system registry).

Your assigned workflow (build_map.md §1.8 coverage table): **Hitches and long-session stability**
Owner lane: THE MACHINE.
Hunt: main-thread stalls in sim code, allocation/GC churn in per-tick or per-frame paths, repeated setup that could be cached, unbounded scans over entity collections, resource/event-listener/timer leaks across dock/undock/jump/fight/save/load cycles, stale async callbacks.

HARD RULES — violate none:
- You may READ any file and run `node --test test/<file>.test.mjs` and non-browser `node scripts/check-*.mjs` / `npm run check:*` scripts.
- NEVER edit, create, delete, or rename any file. NEVER run any mutating git command (only status/diff/log/show). No `npm install`, no writes of any kind.
- NO browser/Electron/GPU probes — do not run scripts that launch Chrome/Chromium/Electron/playwright/puppeteer.
- The working tree is dirty with OTHER agents' live work (`src/render/**`, `src/systems/{mining,npcJobsRuntime,wingmen}.js` and more). If a suspicious file shows up in `git status --short`, mark the finding "foreign-lane file dirty" and keep auditing elsewhere.
- Judge with DETERMINISTIC counters, not timing: allocations per tick, arrays/Sets per frame, listener counts after N cycles, entity-list scan counts. Never claim ms/FPS numbers on this contended host.

METHOD:
1. Read root AGENTS.md and build_map.md §1.8 (line ~310-390) for the bar.
2. Likely owners: `src/core/` loop, `src/systems/*.js` per-tick functions, `src/render/*` per-frame paths (note render/* is foreign-dirty — still auditable but flag it), event listeners in `src/` (bus.on without off), setInterval/setTimeout without clear.
3. Rank findings by certainty: a `new Array`/`new Set`/`slice()` inside a registered `update(dt)` is a stronger finding than a hunch.
4. Report findings as markdown on stdout — your ONLY output.

FINDING FORMAT (repeat per finding, max 8 findings, only real ones):
```
### F-HITCH-NN
- symptom: <what the player experiences: hitch on dock, growing slowdown, etc.>
- severity: major|minor|polish
- route: <the cycle that triggers it>
- owner: <file:function/line>
- evidence: <the exact alloc/listen/scan site + counts if measurable>
- suggested_fix: <bounded fix — cache, hoist, pool, unsubscribe>
- confidence: high|medium|low
```
If you find nothing material, say so plainly — a clean verdict is a valid result. End with `VERDICT: <N findings / clean>` on its own line.
