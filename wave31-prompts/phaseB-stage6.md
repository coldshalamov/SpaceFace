You are the S1 Phase-B **Stage 6** implementation agent for coldshalamov/SpaceFace — a Three.js space game (browser + Electron). This is IMPLEMENTATION work on the whole-sim-in-worker spike: **the flip** — the worker actually drives the sim ticks while the main lane accumulates, sends directives, and consumes transport frames. Verify, commit, push.

CHECKOUT: work on branch `devin/s1-sim-worker-spike` — pull latest before starting (HEAD `e4821af2b` = stage 5: simLaneCommands.js + newGameBoot.js, command ring with nav/mode/spawn/remove/promote + input-fold + settings allowlist + rpc handlers, eager-market-mint flag ON-by-default-in-spike with whole-run sha256 identical ON/OFF). Do NOT touch master or the perf branch. Commit to the spike branch and push.

CONTEXT: `design/perf/STRUCTURAL-HORIZON.md` (branch `devin/1790796194-perf-w8-hitches`) §W28 stage table — stage 6 reads: "**The flip** — `advanceSimulation`→directive send (accumulator math stays main; steps count crosses), `consumeLatestCompletedTick` reads transport ring, `SIM_LANE=main` revert flag | identical journal streams tick-for-tick + digest canary | HIGHEST". Stages 0–5 all landed and gated green; this is the stage the whole project exists for.

FOUR WORK ITEMS (A and B are the flip itself; C and D are the stage-4 measured regressions the flip inherits):

### A) The flip — worker drives sim ticks

Design (follow unless code proves it wrong — report deviations):
- Main side keeps the accumulator ONLY: `advanceSimulation`'s current rAF-accumulator math stays on main; per accumulated step the main posts a `{kind:'tick', dt, tick}` directive over the stage-1 command ring instead of executing `sim.step` locally. The WORKER executes the step, packs the snapshot (existing stage-3/4 transport: packed pose frame + journal + domain diffs), and posts it back.
- `consumeLatestCompletedTick` reads the transport ring and returns the newest COMPLETED tick reply (already the contract — verify the reply carries everything its current consumers read: journal events, pose columns, aux channel, domain diffs, tick index). A late reply re-presents the previous frame — never blocks the render lane.
- Interpolation alpha: the accumulator already computes alpha from local step timing — verify the alpha math survives when the step executes remotely (alpha is a main-side schedule quantity; the worker's execution latency must NOT enter it — if the current code feeds execution time into alpha, that's the one ordering change to make deliberately and document).
- `SIM_LANE=main` (or a `SIM_LANE` env/config flag the spike driver already honors) must restore today's in-process path byte-for-byte — the flip is flag-gated and independently revertable.
- The event bridge (stage 2), read model (stage 3), domain mirrors (stage 4), command ring + RPC + eager mint (stage 5) are already exercised by the spike runner — the flip is the LAST seam: verify each stage's probe still passes post-flip (the journal stream must be tick-for-tick identical to SIM_LANE=main on the same seed — digest canary: per-tick journal digest comparing worker-executed vs main-executed streams).

### B) Failure + ordering semantics at the flip

- Worker crash / unhandled step exception → `onSimulationFailure` on main, fail-closed exactly like today's in-process throw (stage 7's backpressure depth is separate — don't build it, but don't paint it into a corner either).
- Tick ordering: the ring must guarantee directives apply in post order (single producer single consumer — verify, don't assume) and replies carry their request's tick index so main can drop any reply that isn't the newest (stale-tick discard).
- Reload-at-600 correctness: the 47a run does `--reload-at 600` — the worker must rebuild its sim from the same reload path the main lane uses today (deserialize → identical continue); verify the reload ticks resume with identical state (the journal digest canary must run THROUGH the reload boundary, not stop at 599).

### C) Mirror narrowing — stage-4's measured wire regression

Stage 4 shipped 39 mirrored roots over 151 leaf paths; the census shows ~12 sim-owned keys actually consumed by the render/UI lane. `domainDiffMs` mean 1.34 / p95 0.56 sits above the 0.3ms soft target; gate B p95 doubled on the W29 slow box (0.595ms vs 0.4 pre-stage-4).

- Build the consumed-key census concretely (don't trust the doc's ~12 — grep the render/UI lane for every `state.<root>` / `readModel.<root>` read path, enumerate them, keep the mirror only for consumed roots + paths). Target: ≤~15 roots; wire well under the current 10.4 KB/tick mean.
- Per-domain freshness budgets (stage-4's own suggestion): cold-band leaves already refresh ≤60 ticks — assign the remaining hot domains their needed cadence explicitly rather than uniform diffing.
- Keep `DOMAIN_EXPAND_PATHS` as the tuning knob; do NOT delete the machinery — narrow the default set.

### D) Fold-in: per-tick instrumentation gates (W30 hitches F2/F3 — spike-owned)

These live in `scripts/lib/wholeSimWorker.mjs` (spike file — yours to change):
- **F2 aux journal:** `diffAuxTables` currently diffs the whole aux domain per tick (O(aux rows) allocation every tick). Replace with a producer-side journal: a `dirtyPoseIds` second journal populated at the same sites that write pose/upserts, plus the far sweep's touched-ids — the diff pass then only reads journal-marked rows. The aux channel's OUTPUT must be byte-identical (same upserts/removals/order) — this is a producer-side accounting change, not a consumer change. If a producer site can't be journal-armed provably, keep the full diff for that family and say which.
- **F3 probe flag-gate:** `collectProbeBlock`/`diffDomains` run per tick unconditionally — gate them behind the probe flag (`--probe aux|domains|commands`) so production ticks skip the instrumentation allocation entirely. Verify each probe mode still passes WITH its flag (flag off = zero probe cost; flag on = identical probe behavior).

### E) W31-boot flip-hazard findings (main-lane audit of the render side, landed after this brief was written)

The W31 boot audit graded the render/main lane for post-flip hazards. Four findings — all M/H severity, all only bite post-flip, all yours to fix inside stage 6 (or stage 7 if the seam demands it — say which and why):

- **F1 (H):** `liveSectorFullExtrasStubs` enumerates `world.sectorContents/embodiment/residentSectors/alienEcology/dressing/farActors/aftermathWrecks` — none of them are among the stage-4 mirrored roots → post-flip the enumerate reads absent mirrors → silent early-return → the whole FULL-extras decode runway dies and the promote cohort decodes inside presented frames. Fix seam exists (`opts.bag`/`ctx.helpers.warmSectorFullExtras`): move the enumerate worker-side (or mirror the consumed roots — but watch item C's narrowing; a worker-side enumerate is the honest fix).
- **F2 (M):** `authoredCriticalVisualReadiness` reads mirrored `currentSectorId`/`mode`/`player` with no verdict hysteresis → one-tick window where the gate can release with the hub/runway contacts unauthored. Add a settle-verdict latch (require N consecutive authored ticks before release) or pin the gate to transport-frame completeness instead of mirror fields.
- **F3 (M):** onboarding `prepareStartingScene`/`_preparedCastIsAdoptable` uses object-identity compares and synchronous spawn returns → facade identity churn / mirror lag discards the prepared cast or skips staging. Re-key the adoptable check on stable ids (recordId/entityId), not object identity.
- **F4 (M):** warm-lease sector label defaults to mirrored `state.world.currentSectorId` → outgoing-sector mislabel evicts the warmed file (same class W23 fixed for the envelope lane). Carry the explicit sector label through the warm call site instead of reading the mirrored field.

HARD CONTRACTS:
- Golden sha256 on the spike runner must equal the main-lane golden for the same scenario — 47a baseline `f589bdd53360693b76d89ea54db2dd5816f45feb00c5f203d882a9637d729cdb` (re-baselined by upstream `9fac82f34`; if the spike runner's golden comparator still expects `e517a97b…`, update the comparator to the new baseline and note it), `deterministic:true`.
- Journal-stream tick-for-tick identity between `SIM_LANE=main` and the flipped path — the digest canary is the load-bearing proof.
- `node --check` every touched file.
- Main-lane (`SIM_LANE=main`) behavior byte-identical — the flag is the revert.
- Reload-at-600 deterministic through the boundary.
- SwiftShader box — never draw GPU conclusions from wall timings; p95 wire-cost numbers ARE the evidence for item C (report before/after means + p95s).

VERIFY GATES (all must pass before push):
1. `node --check` clean on every touched file.
2. Non-probe spike run (flipped): ALL PASS + golden bit-identical through reload-at-600.
3. `SIM_LANE=main` spike run (revert flag): ALL PASS + byte-identical journal stream vs flipped (the canary).
4. `--probe aux`, `--probe domains`, `--probe commands`: ALL PASS each (flag-gated per item D — verify flag-on parity AND flag-off zero-cost: report probe overhead bytes/measurements off vs on).
5. Narrowed-mirror wire report: mean + p95 KB/tick before and after item C; `domainDiffMs` mean/p95 before/after.
6. Digest canary: per-tick journal digest worker-vs-main equality across all 720 ticks including the 600 reload — report mismatch count (must be 0).

ENVIRONMENT: Windows Server 2022, Git Bash, no Python, no rg (use grep). Node 24 at `/c/hostedtoolcache/node/24.0.1/x64/node` — ONE node process at a time. `gh` unavailable. NEVER create junctions inside git worktrees. Tests: `/c/hostedtoolcache/node/24.0.1/x64/node test/<name>.test.mjs`.

COMMIT + PUSH: commit `s1(phaseB): stage 6 — the flip (worker-driven ticks, narrowed mirrors, probe gates)` with a body listing the directive/reply shapes, the SIM_LANE flag semantics, the narrowed root list, canary + gate output. Push to `devin/s1-sim-worker-spike`. If the work is too large for one lane, land A+B fully + commit, then C, then D — partial pushes fine while each commit's gates pass; say what's landed vs remaining.

REPORT: directive/reply shapes + ordering guarantees verified, SIM_LANE flag semantics + revert evidence, digest-canary results (0 mismatches?), narrowed root census (what's mirrored now vs the 39 before — with the grep evidence for each kept root), wire-cost before/after numbers, F2 journal coverage (which producers armed vs which kept full diff + why), F3 flag-gate verification, deviations, and what stage 7/8 still needs.
