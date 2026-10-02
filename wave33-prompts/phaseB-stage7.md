You are the S1 Phase-B **Stage 7** implementation agent for coldshalamov/SpaceFace — a Three.js space game (browser + Electron). This is IMPLEMENTATION work on the whole-sim-in-worker spike, on branch `devin/s1-sim-worker-spike`. Stage 6 (the flip) landed review-clean: `SIM_LANE=worker` drives live sim ticks through the SPSC directive ring, main presents the newest completedTick only, `SIM_LANE=main` is the byte-identical revert. Stage 7 hardens the flip and kills its dominant wire tail. Verify, commit, push.

CHECKOUT: work on branch `devin/s1-sim-worker-spike` — pull latest before starting (HEAD = `7cc903a63` or later: stage-6 flip + independent-review fixes). Do NOT touch master or the perf branch. Commit to the spike branch and push.

CONTEXT: `design/perf/STRUCTURAL-HORIZON.md` (branch `devin/1790796194-perf-w8-hitches`) §W28 stage table + stage-6 measured notes — stage 7 reads: "Ring + backpressure — depth 8, starvation→`completed-tick queue overflow`→`onSimulationFailure` (fail-closed, mirroring main today); stage-6 carries: station-market mirror granularity (2.49 MB wire tail = dominant), WASM init + optional SAB". The stage-6 lane's own handoff says: "ring+backpressure depth-8 starvation→fail-closed (not built, not painted into a corner); WASM init + optional SAB; station-market mirror granularity is the biggest wire win left."

THREE WORK ITEMS:

### A) Ring + backpressure — fail-closed starvation bound

- The completed-tick reply ring (stage-6 PREFIX-drain consumer) gets a bounded depth: **8 outstanding completed ticks**. Today an unbounded queue would let a wedged main consumer accumulate silent lag; the contract is: when the queue hits depth 9 the sim fails closed exactly like an in-process step throw — `onSimulationFailure` with a `completed-tick queue overflow` style diagnostic, mirroring what main-lane does on a step exception today.
- Depth accounting must be honest: count outstanding replies the main lane has NOT yet drained (not posts, not directives — the completed-tick channel only). A drain that consumes the resolved prefix decrements correctly; a re-presented previous frame does NOT free a slot (the tick is still outstanding until consumed or superseded per the discard rule — if the current semantics drop stale replies, count those as freed; document whichever semantic you implement and why).
- Probe/gate: a hold-consume probe (consumer deliberately pauses draining) must throw/fail at depth 9 deterministically — report the gate evidence. With a live consumer, the bound must never trip in normal flight: the 720-tick 47a run must complete with 0 overflow events and report max observed depth (expect ≤3).
- Keep `SIM_LANE=main` untouched — in-process path has no ring, no backpressure; byte-identical.

### B) Station-market mirror granularity — kill the 2.49 MB wire tail

- Stage-6's narrowed mirrors measured `economy.markets.station_*` leaf mirrors as the dominant tail: ship mean 7,818 B / p95 1,656 B but **max 2.49 MB** — whole-station market objects serialized on drift.
- Two candidate mechanisms — implement whichever measures better (or both flag-gated and A/B): (a) **commodity-granularity mirroring** — diff per `stationId.commodity` leaf instead of per-station object; (b) **station-lazy mirroring** — mirror station markets only for stations the render lane actually displays (the orrery/market panel's visible station set — census what UI reads; if it reads only the open/docked station plus nav markers, that's the set) with the rest shipped on-demand via the existing RPC channel or expanded path rules.
- Evidence required: wire stats before/after — mean KB/tick, p95, max bytes, and the station_* component specifically. Target: max ≤ ~64 KB except genuinely hot ticks (e.g. economy:tick burst — measure what it actually looks like; a periodic large-but-rare burst may be fine if p99 excludes it — report the distribution honestly, don't sandbag).
- The domain-diff probe (`--probe domains`) must stay green; mirrors must remain digest-consistent (no identity breaks on kept paths; removed paths must not be read by the render lane — prove by the same census method stage 6 used: grep the render/UI lane for every read path, keep what it consumes).

### C) WASM init + optional SAB journal

- `loadRapierCompatRuntime` must initialize worker-side for the flipped lane (physics runs in the worker under the flip — if it already does, verify and document; if it lazily inits on main and the worker inherits a stub, fix it). CSP bridge must verify in Electron — run whatever Electron/CSP smoke harness exists (`scripts/` electron checks; if none exists, document the gap and verify the module-level CSP assumptions manually: no eval, no inline, wasm-allowed).
- **Optional SAB journal double-buffer**: the packed pose frame + journal copy cost is the remaining fixed transport overhead (~0.2 ms baseline per the doc). Implement an opt-in SharedArrayBuffer double-buffer for the journal stream behind a flag (e.g. `SIM_SAB=1`), falling back cleanly when `crossOriginIsolated`/`SharedArrayBuffer` is unavailable — feature-detect, never assume. Measure copy-cost delta on the spike runner (report both lanes' numbers; SwiftShader box — structural byte counts matter, wall-clock is secondary).
- If SAB turns out to need COOP/COEP headers the dev server doesn't send, gate it off by detection and document the header requirement — do NOT change server headers in this stage.

HARD CONTRACTS:
- Golden sha256 on the spike runner must equal main-lane golden — 47a baseline `f589bdd53360693b76d89ea54db2dd5816f45feb00c5f203d882a9637d729cdb`, `deterministic:true`, flipped AND `SIM_LANE=main`.
- Digest canary: worker-vs-main journal digest equality across all 720 ticks through reload-600 — 0 mismatches.
- `node --check` every touched file.
- Every new mechanism flag-gated and independently revertable; `SIM_LANE=main` byte-identical.
- Fail-closed semantics: backpressure overflow → `onSimulationFailure`, identical failure surface to a step throw.
- SwiftShader box — never draw GPU conclusions from wall timings; wire-cost byte distributions are the evidence.

VERIFY GATES (all must pass before push):
1. `node --check` clean on every touched file.
2. Non-probe spike run (flipped): ALL PASS + golden bit-identical through reload-at-600; max observed ring depth reported.
3. `SIM_LANE=main` run: ALL PASS + byte-identical journal stream.
4. Hold-consume probe: deterministic overflow at depth 9 → `onSimulationFailure`.
5. `--probe aux`, `--probe domains`, `--probe commands`: ALL PASS each.
6. Wire report: mean/p95/max KB/tick + station_* component before/after item B.
7. SAB: feature-detection evidence (unavailable → clean fallback; available → copy-cost delta) — if unavailable on this box, a stub-level smoke test proving the fallback path is enough plus the detection code.

ENVIRONMENT: Windows Server 2022, Git Bash, no Python, no rg (use grep). Node 24 at `/c/hostedtoolcache/node/24.0.1/x64/node` — ONE node process at a time. `gh` unavailable. NEVER create junctions inside git worktrees. Tests: `/c/hostedtoolcache/node/24.0.1/x64/node test/<name>.test.mjs`.

COMMIT + PUSH: commit `s1(phaseB): stage 7 — ring backpressure, market-mirror granularity, WASM/SAB` with a body listing the depth-bound semantics, the mirror granularity choice + measurements, the SAB detection/fallback shape, and gate output. Push to `devin/s1-sim-worker-spike`. Partial pushes fine while each commit's gates pass — land A first, then B, then C; say what's landed vs remaining.

REPORT: depth-bound semantics + max observed depth + hold-consume gate evidence; mirror granularity choice with the census grep evidence + before/after wire distributions; WASM/CSP verification status; SAB availability + measured delta (or the documented reason it's off); deviations; what remains before the ship decision (default-flip A/B soak, real-browser verification, PR integration path).
