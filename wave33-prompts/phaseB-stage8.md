# S1 Phase-B — Stage 8: browser production wiring + real-browser flip verification

Work in the existing worktree `C:\Users\Administrator\repos\SpaceFace-s1` on branch `devin/s1-sim-worker-spike`. Stage 7 landed at `4fd38209c` — pull first. Commit on the spike branch and push. Do NOT merge to the perf branch or master.

## Context (what already exists — read before writing anything)

Stages 0–7 are complete and independently reviewed APPROVE. The spike driver `scripts/sf-sim-worker-spike.mjs` runs the FULL game sim off-main in node `worker_threads`: `SIM_LANE=worker` posts `{kind:'init'|'tick'|'finalize'|'shutdown'}` directives through `scripts/lib/wholeSimWorker.mjs` → platform-neutral `createSimHost` in `scripts/lib/simWorkerHost.mjs` → `src/core/simWorker.js` (rapier WASM is verified live worker-side). Replies arrive ordered on an SPSC channel; the driver owns `advanceFixedTimestep` (imported from `src/core/simulationRunner.js`), drains only the resolved prefix into the bounded completedTick ring (capacity from `DEFAULT_COMPLETED_TICK_CAPACITY`, fail-closed `completed-tick queue overflow` at depth ≥ capacity), and presents the newest completedTick — a late reply re-presents the previous frame.

Gates that already pass and MUST NOT regress: golden hash bit-identical flipped AND main (`f589bdd53360693b76d89ea54db2dd5816f45feb00c5f203d882a9637d729cdb`, `--repeat 20 --reload-at 600`), worker-vs-main digest canary 720/720, fail-closed crash parity, ring bound ≤ undrained completedTicks, commodity-granular market mirrors (wire max 253KB, clone ≤6.1ms, 0/1877 mismatches), opt-in SAB journal (`--sab`, 365 packs / 0 fallbacks), Electron CSP green (no eval).

Stage-5 census (`design/perf/` docs + spike report) classifies the synchronous main→sim surface: `quote()` is the only mutating read (remediated: evented execution + read-model), ~20 command conversions enumerated, registry-locator is the facade seam. The read model v2 mirrors 39 roots via path-granular diffing.

The browser production path (`src/core/loop.js` → `createPresentationRunner` → `createSimulationRunner`) already owns the SAME completedTick ring, snapshot fence, and presentation publisher — it just executes `registry.step` inline on main instead of posting directives to a Worker.

## Deliverable

### A. Browser Worker adapter (twin of `scripts/lib/wholeSimWorker.mjs`)
- New `src/core/wholeSimBrowserWorker.js`: module worker that self-hosts `createSimHost` — `self.onmessage` dispatching init/tick/finalize/shutdown to the host, posting replies in order. Reuse the host's reply envelope shape byte-for-byte.
- Worker construction: `new Worker(new URL('./wholeSimBrowserWorker.js', import.meta.url), { type: 'module' })`. Verify the served path works under BOTH the dev server and Electron's static root (the app serves `src/` modules already; confirm no build step is needed or add the file to whatever manifest/index requires it).
- SAB journal: reuse `sabFeatureAvailable`/`createSabJournalArena` — in the browser, SAB requires COOP/COEP. Keep the browser lane on the fallback (postMessage transfer) channel; SAB stays opt-in and must degrade cleanly when headers are absent (it already does — verify, don't force it).

### B. Main-side client + flip wiring
- A `simLane` runtime flag resolved once at boot: URL param `?simLane=worker` overrides; default `main`. `?simSab=1` for the opt-in SAB lane (only if COOP/COEP present, else warn+fallback).
- Route `createSimulationRunner`'s step execution: when `simLane==='worker'`, replace inline `registry.step` with the directive-post + prefix-drain pattern from the spike driver. The completedTick ring, journal, inputCommandSnapshots, and presentation consumption path stay IDENTICAL — the worker is a transport, not a new runner. The `completed-tick queue overflow` fail-closed bound applies unchanged.
- Sim-owned state reads on main (entities, world, marketHistory rpc, etc.) must go through the stage-4 read-model mirrors while flipped — same `state` facade shape, mirror-backed. Use the stage-5 census to enumerate what the live render lane + UI actually read; everything covered gets mirrors, anything NOT covered must be surfaced in the report as a gap (do not leave silent main-side reads of worker-owned objects — those objects don't exist on main when flipped).
- Shutdown ordering: worker lane must dispose on `game:new`/run-reset/restore boundaries identically to the headless driver (generation-bracketed).

### C. Verification (all required — this is the ship gate)
1. Node golden: `node scripts/sf-sim-worker-spike.mjs --ticks 720 --seed 47 --inputs test/47a.inputs.json --reload-at 600 --expected-hash f589bdd53360693b76d89ea54db2dd5816f45feb00c5f203d882a9637d729cdb` on `--sim-lane main` AND `--sim-lane worker` AND `--sab` — all bit-identical, 0 fallbacks.
2. Real browser: `node scripts/check-game-playable.mjs` on `main` lane AND `?simLane=worker` (the lane flag must reach the page — extend the check to accept/forward a URL param, or write a small playwright runner). Assert: boots, New Game launches, frames present, HUD live, zero console errors.
3. If environment permits (`check-game-playable.mjs --electron` — real GPU + strict CSP): run it on both lanes. If the Electron runtime can't provision here, document that and rely on the dev-server run.
4. Worker-specific browser evidence: a playwright assertion that frames continue advancing while the worker is mid-tick — e.g. instrument a long sim frame or use the existing diagnostics to show `frame.presented` advanced during a presentedTick gap. Keep it simple and honest; a red here is a finding, not a blocker to hide.

### D. Report + docs
- Update `design/perf/STRUCTURAL-HORIZON.md` stage-8 row: implementation summary, gate results, remaining gap list (any uncovered main-side sim reads), and the honest ship assessment (default-flip candidates / blockers).
- Report format: one summary, per-item verdict + evidence, then a gap list. State explicitly if anything fails — do not paper over.

## Hard rules
- Zero visible quality degradation. Bit-identical sim determinism.
- Fail closed: any worker error/timeout produces the same error surface as main lane — never a hung frame or half-applied tick.
- No new production dependencies. No changes to master-facing files that aren't part of the flip path (this branch stays mergeable).
- If you find the stage-5 census missed a synchronous reader that can't go through mirrors, STOP and report — do not silently keep a main→worker sync call.
