You are the S1 Phase-B **Stage 0** implementation agent for coldshalamov/SpaceFace — a Three.js space game (browser + Electron). This is IMPLEMENTATION work: extract a shared sim-driver lib, wire both consumers, verify, commit, push.

CHECKOUT: work on branch `devin/s1-sim-worker-spike` — pull latest before starting. Do NOT touch master or the perf branch. Commit to the spike branch and push.

CONTEXT: The S1 whole-sim-in-worker spike proved golden 47a sha256 e517a97b bit-identical inside worker_threads. Phase-B decomposed the remaining work into 9 flag-gated stages — read `design/perf/STRUCTURAL-HORIZON.md` (§W28 structural audit table) on branch `devin/1790796194-perf-w8-hitches` for the full plan; Stage 0 is:

**Extract ~290 LOC of 47a orchestration into `scripts/lib/simScenarioDriver.mjs` consumed by both the CLI and the worker.**

Scope (functions to extract — verify exact names/line numbers in the tree, they may have drifted):
- From `scripts/sf-sim-worker-spike.mjs` / `scripts/lib/wholeSimWorker.mjs` / `scripts/sf-sim.mjs` (whichever owns each): applyInput, applyTapeCommands, resolveScenarioEntity, resolveAttachmentRef, placeEntity, set47aTacticalActive, stage47aHandoffActors, update47aScenarioActorIntents, preparePhysicsBackend, reloadThroughSave, loadScenarioContract, hashSnapshot.
- The lib must be a pure module (no self-execute, no process.argv reads at import). Keep the existing import side-effect gates intact — wholeSimWorker imports the CLI's helpers today; after extraction both import the lib.
- Both `scripts/sf-sim.mjs` (CLI lane) and `scripts/lib/wholeSimWorker.mjs` (worker lane) consume the lib — no duplicated orchestration logic remains.
- Also: `entityIsJournaled` now lives in `src/world/presentationSources.js` (shared predicate, landed on the perf branch — check whether it merged here; if the spike worker still has its own predicate copy, rewire the worker to import `entityIsJournaled` from `../src/world/presentationSources.js` (or correct relative path) and delete the copy).

ENVIRONMENT: Windows Server 2022, Git Bash, no Python, no rg (use grep). Node 24 at `/c/hostedtoolcache/node/24.0.1/x64/node` — ONE node process at a time. SwiftShader box — never draw GPU conclusions from wall timings. Windows `timeout` is not GNU timeout. `gh` unavailable. NEVER create junctions inside git worktrees.

HARD CONTRACTS:
- Golden 47a sha256 `e517a97bd256045b0db0f96a7124a5abd539478a84ee305e36e1eb8479449dd3`, `deterministic:true` — bit-identical via the CLI AND via the worker spike run, after the refactor. Command: `/c/hostedtoolcache/node/24.0.1/x64/node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --hash --repeat 20 --reload-at 600` and the spike's worker entrypoint (find its invocation in scripts/sf-sim-worker-spike.mjs docs/header or package.json).
- `node --check` every touched file.
- Zero behavior change: this is a move-only refactor (modulo the entityIsJournaled rewiring). No fixing "bugs you notice" — report them instead.
- Refactor of script code only: nothing under src/ changes except deleting the spike's duplicate predicate.

VERIFY GATES (all must pass before push):
1. `node --check` clean on every touched file.
2. Golden 47a via CLI — bit-identical.
3. Golden 47a via the worker spike path — bit-identical (this is the real gate: the worker consumed the extracted lib).
4. grep: no remaining copy of the extracted functions outside the lib; the spike's own isEntityJournaled copy is gone if the shared one is reachable.

COMMIT + PUSH: one commit `s1(phaseB): stage 0 — shared sim-driver lib` with a body listing moved functions and gates. Push to `devin/s1-sim-worker-spike`.

REPORT: list files touched, functions moved, gate results (hashes), and any drift between the documented stage plan and what you actually found. If any function's exact extraction is blocked by a tangle that would change behavior, report it instead of forcing it.
