# 11 — Enforcement Machinery Specification

> **Manual control-plane specification.** Activate only for a named production-machinery packet.
> It is not permission policy for ordinary repository agents and must not turn normal feature work
> into submit-only, report-only, or controller-only behavior.

**Status:** DRAFT implementation contracts for the tooling that makes the production constitution mechanically binding.

The production constitution (00) and quality standard (07) are rules. Rules without enforcement
are documentation. This document specifies the actual tooling that enforces them — the machinery
that makes cheating structurally impossible rather than merely discouraged.

Every section here is a work-packet input. No single packet builds the whole control plane: the
section-to-packet ownership map in §9 is authoritative.

## 1. Campaign-state manager (`tools/production/campaign-manager.mjs`)

**Purpose:** read, validate, and write candidate state records that conform to
`campaign-state.schema.json`. This is the single source of truth for where every candidate is
in the state machine.

**API:**
- `load(packetId)` → returns the campaign state JSON for a packet, or null if none exists.
- `save(packetId, state)` → validates against the schema, computes the history `recordHash` from
  the previous hash + the new record fields, and writes atomically (temp file + rename).
- `transition(packetId, newState, { actor, actorRole, candidateHash, evidence })` → appends a
  history entry, recomputes the chain, validates, and saves. Refuses if the transition is
  illegal (see state graph in 02_ORCHESTRATOR_SPEC.md).
- `approve(packetId, { authorityId, reviewerVerdictArtifacts })` → the ONLY function that may set
  `APPROVED_CANDIDATE`. It parses and recomputes controller-wrapped verdict artifacts, binds all
  reviewers/gates/evidence to the current candidate/input manifest, proves author/session/family
  separation, and enforces zero open critical/major defects. Each of the six gate slots is either
  `pass` for the current candidate or `not_applicable` with a controller-owned quality-card waiver
  artifact; worker-declared N/A, `pending`, and missing detectors never satisfy approval.
- `recordIntegration(packetId, integrationReceipt)` → moves an approved candidate through
  `INTEGRATION_VALIDATION`; it rechecks stale inputs, delta/output hashes, and the live-tree result.
- `accept(packetId, { authorityId, integrationReceiptHash })` → the ONLY function that may set
  terminal `ACCEPTED`, and only from `INTEGRATION_VALIDATION` after the integrated live output is
  proved byte-identical to the reviewed candidate. A failed/stale integration never leaves a
  terminal accepted record.
- `listByState(state)` → returns all packet IDs in a given state.
- `listReady()` → returns only `SPECIFIED` packets whose recorded packet dependencies are currently
  `ACCEPTED` at the exact candidate/acceptance-record hashes, whose external-prerequisite artifacts
  still validate, and whose required lane is free. Prose `dependsOn` never creates readiness.

**Semantic trust layer:** JSON Schema is shape validation only. `check:campaign-state` also replays
legal history edges, recomputes the hash chain, verifies controller envelopes/served identities,
requires equality to one canonical candidate hash, validates contained regular evidence artifacts,
and replays immutable command receipts. Hash-shaped self-claims and existing source scripts are not
execution evidence.

**Integration:** `npm run campaign:status` prints a summary. `check:campaign-state` validates every
existing state file and every referenced artifact/receipt, and reports illegal or stale records.

**File location:** candidate states live in `.campaign/<packetId>/state.json`. The directory is
gitignored (ephemeral orchestration state) but its aggregate summary is not.

## 2. Packet compiler (`tools/production/compile-packet.mjs`)

**Purpose:** take a packet source (markdown with frontmatter) and compile it into a dispatchable
brief. This is the "brief compiler" from 02_ORCHESTRATOR_SPEC.md §3.

**Compilation steps:**
1. Parse the packet source and require coverage IDs, milestone, kind, lane, exact writable paths,
   machine-readable `dependsOn`, external prerequisites, author model/family, reviewer
   models/families, and quality-card hash. Missing fields fail; they never default to empty strings
   that disable checks. Resolve every dependency to an exact accepted candidate/record receipt in
   campaign state; unresolved dependencies may compile to `SPECIFIED` but cannot enter `listReady()`.
2. Resolve every angle-bracket placeholder, including spaces/hyphens such as `<PLAYER OUTCOME>`.
   Reject blank or boilerplate required sections even when no placeholder token remains.
3. Check role separation: the author model and the assigned reviewer models must differ in
   `modelFamily`. If the same family is assigned to both author and acceptor, **fail**.
4. Check lane exclusivity: if the packet's lease paths overlap with any currently-active lease
   (from reconciled campaign state and the dispatch journal), **fail** with the conflict. Missing or
   corrupt lease/dispatch state fails closed.
5. Check asset/render preflight: if the packet touches `assets/**` or `src/render/**`, verify no
   active graphics lock exists.
6. Validate the complete quality card. Player-facing mode attaches at least two distinct admired
   captures plus one distinct failure capture with media proof. Control-plane mode attaches at least
   two hash-bound good controls plus one hostile/failure fixture. Recompute contained regular-file
   path, bytes, SHA-256, producer/media proof, and provenance; reject duplicates, absolute/outside
   paths, or stale hashes. Write a context-manifest hash proving the same bundle is attached on
   initial and resumed dispatches.
7. Embed observatory thresholds: pull the relevant gates from `10_OBSERVATORY_HARD_GATES.md`
   and append them to the brief's acceptance section. Populate all six campaign gate slots; a gate
   absent from the packet list is `not_applicable` only when the controller quality card supplies a
   hash-bound waiver artifact. Otherwise it remains `pending` and blocks readiness/approval.
8. Compute `briefHash` and a controller-owned input manifest covering the brief, schemas, checks,
   gates, references, source artifacts, and every declared read dependency. Record both hashes in
   campaign state. Compute a dependency-snapshot hash over resolved accepted packet receipts and
   external prerequisite artifacts. Recheck all three before dispatch, every gate, and integration;
   reject self/cyclic dependencies.

**API:** `node tools/production/compile-packet.mjs <packet-source.md>`

**Integration:** `check:production-packets` requires every real production packet to compile.
Expected failures live only under the fixture tree; a real packet failing compilation can never be
counted as a passing assertion.

## 3. Campaign supervisor and dispatch journal (`tools/production/campaign-supervisor.mjs`)

**Purpose:** mechanically detect when the orchestrator collapses to solo work. This is the cure
for the "calls one agent, tinkers alone, quits early" failure mode.

**Mechanism:**
- `.campaign/dispatch-events.ndjson` is an append-only, hash-chained controller action journal.
  `.campaign/dispatch-log.json` is a derived projection validated against
  `dispatch-log.schema.json`, not a self-authored source of truth.
- Each event contains a controller artifact descriptor for an immutable typed receipt stored by
  content hash under `.campaign/dispatch-receipts/`. Replay reopens the contained regular file,
  verifies bytes/hash/action kind, and derives agent/model/family/session/brief/lane/status from the
  receipt; a hash without a resolvable artifact cannot project state.
- The controller wrapper records every major action (`dispatch`, `solo_action`, `agent_return`,
  `blocker_claim`, `blocker_audit`, `lane_change`, `compaction_resume`) before executing it. Manual
  `markSoloTurn()` calls are a compatibility/diagnostic path, not sufficient enforcement.
- `markDispatch(packetId, agent, model, family, sessionId, lane, briefHash)` records a verified
  process/session dispatch, resets the derived counter, and binds it to a compiled brief and lease.
- `markSoloTurn(actionKind, evidenceHash)` increments the derived counter. If it exceeds the budget,
  the next permitted controller action is a dispatch or a blocker audit; any other action records a
  permanent ignored violation and the production gate fails.
- `markBlockerClaim(packetId, typedEvidence)` does not reset the counter. A fresh independent
  `blocker_audit` must validate class, evidence existence/hash, ownership/tool state, and attempted
  remedies before the projection records `recorded_blocker` and resets it. A ten-character reason
  is not a blocker.
- Corrupt, missing-after-initialization, truncated, hash-invalid, or projection-mismatched logs fail
  closed. They are never silently replaced by an empty log.
- `status()` reconciles the journal against campaign states, live leases/PIDs, and agent returns;
  stale active packets or dead lease holders are defects, not dispatch credit.

**Enforcement model:** the controller action wrapper, immutable event chain, and reconciliation are
the enforcement. A prompt asking the orchestrator to remember `markSoloTurn()` is only a bootstrap
aid. The current PROD-004 candidate demonstrates counter semantics but remains unaccepted until
corruption, forged blocker, stale-state, action-omission, and hash-chain fixtures pass.

**API:** the controller imports `recordAction()`, `projectDispatchState()`, and
`reconcileCampaigns()`. CLI `status` is read-only; manual mutation subcommands are fixture/debug
adapters and cannot create controller authority.

**Integration:** `check:dispatch-discipline` replays the action journal, compares the derived
projection, reconciles active packets/leases/processes, and fails on ignored or pending violations,
unaudited blockers, missing major actions, corruption, or stale state.

## 4. Observatory recorder (`src/observability/sessionObserver.js`)

**Purpose:** passively record a public-input play session as synchronized intent, execution, and
presentation streams without becoming gameplay authority or perturbing determinism.

**Live hook map (verified against the current V3/tactical path):**
- `src/core/registry.js`: call a guarded `afterInput(state)` immediately after `input.update`, an
  `afterSimStep(state)` after `core.lifetimeSweep`, and `onRenderFrame(state, frameDt, alpha)` after
  renderer diagnostics. Sampling input at end-of-tick is wrong because scanner,
  countermeasures, charges, and flight consume edge actions during the same tick.
- `src/main.js`: install boot-local `ctx.helpers.observatoryHooks` only when a runner-owned dev
  configuration exists; expose the recorder through the existing debug handle. Do not add an
  `state.options` field or serialize observatory state into saves.
- `src/core/eventTrace.js`: retain existing `snapshot()` behavior and add sequence-preserving
  `drain()`, dropped-count reporting, and an optional record callback. Silent trim is invalid for
  acceptance evidence.
- **Intent:** synchronously clone `registry.get('ai').stack.lastResult` from the live tactical stack
  (`src/systems/tacticalAI.js`, `src/ai/stack.js`). Optional full trace uses `src/ai/trace.js` and
  must be enabled identically in every paired run. `src/ai/explainability.js`, `ai:tactic`, and
  `ai:action` do not exist on the live path.
- **Execution:** use the existing combat trace plus `combat:fire`, `projectile:hit`,
  `entity:killed`, and `player:death`; mining receipts include `mining:richCoreCompleted` and
  `mining:bulkHaulDelivered`. Sample authoritative state after the lifetime sweep.
- **Presentation:** observe `presentation:cue` and `presentation:cueApplied`, raw render-frame
  duration, renderer diagnostics, and polled asset metadata. Record
  `authoredReadableFallbackRetained` as well as authored/fallback state; loader/LOD lifecycle events
  do not currently exist and must not be invented in a packet.

**Critical invariants:**
- The observer reads and drains; it never emits gameplay events, writes gameplay state, calls
  `state.rng`, or changes update order. Alignment uses `state.meta.seed`, `state.tick`, and
  `state.simTime`.
- Observer exceptions latch `observerFault`, invalidate the evidence, and never enter gameplay.
- Browser buffers are drained periodically by the Node runner. Any overflow, dropped record, rate
  shortfall, or observer fault makes the run `validForAcceptance:false`; a 10,000-record
  drop-oldest ring cannot represent a lossless twenty-minute session.
- The browser recorder never writes files. The Node runner owns containment, atomic publication,
  hashes, candidate/selection fingerprints, media validation, and the artifact directory.
- Observer-on/media-on, observer-on/media-off, and observer-off/media-off executions use one fixed
  seed/tape. Periodic/final canonical hashes and ordered deterministic receipts match across all
  three. Capture overhead is measured between the first two; observer overhead between the last
  two.
- OBS-001 may emit an explicit `observer_contract` session with media `pending` and
  `validForAcceptance:false`. Fake video/audio paths never make a schema-valid acceptance session;
  OBS-002 owns real mixed media.

**Rates and records:** applied input every fixed tick; state plus selected AI intent every third
tick (20 Hz); asset exposure at 10 Hz plus lifecycle changes; raw frame duration every render
frame; fixed-tick canonical hash checkpoints; declared event receipts losslessly. Wall offsets and
frame IDs are alignment metadata and are excluded from deterministic receipt hashes.

**Public route foundation:** reuse `scripts/lib/alphaLiveBaselineRoute.mjs` for visible New Game,
real keyboard/mouse flight, map interaction, physical approach, and `E` docking. Direct
spawn/damage/docking probes are supporting fixtures, never primary observatory evidence. The
observatory tape extends the current golden-tape shape with every effective input action and
ordered public UI actions; it never contains direct state/entity fixtures.

**Output:** the browser recorder exposes `drain()`; `scripts/lib/observatorySessionRunner.mjs`
writes the hash-bound artifact directory described by `04_GAMEPLAY_OBSERVATORY.md` §7.

**Integration:** `npm run observe:session -- --route <route-id> --policy <policy> --seed <seed>`
runs the public browser route. `check:observatory:passive`, `check:observatory:rates`,
`check:observatory:recording-health`, and `check:observatory:browser-pair` must pass before OBS-001
is accepted.

## 5. Observatory gate runner (`scripts/check-observatory-gates.mjs`)

**Purpose:** run the hard-gate thresholds from `10_OBSERVATORY_HARD_GATES.md` against an
observatory session artifact and fail mechanically if any gate fires.

**Mechanism:**
1. Load the session artifact (timeline, perf samples, AI trace, asset exposure, findings).
2. For each gate the artifact has data for, evaluate the threshold.
3. Exit nonzero if any applicable P0 gate fires. Print a structured report of all evaluated gates
   with measurements, thresholds, detector/benchmark hashes, and pass/fail status.
4. Unimplemented applicable gates report `pending`, never `pass`, and make the acceptance aggregate
   exit nonzero. A packet may explicitly mark a gate not applicable only through its compiled
   acceptance card with controller-owned evidence; the worker cannot self-waive it.

**Integration:** `check:observatory:<gate-name>` runs a single gate.
`check:observatory:all` runs the packet's complete applicable gate set. Any `fail`, `pending`, or
unproved applicability waiver makes the aggregate fail; partial detector development uses a
separate non-acceptance diagnostic command.

## 6. Blind review harness (`tools/production/blind-review.mjs`)

**Purpose:** prepare a blind review packet and record the verdict, enforcing author-anonymity and
the schema's structural constraints.

**Mechanism:**
1. Given a candidate hash, gather the candidate's evidence (renders, in-game frames, incident
   clips) and the contract (packet scope, reference panel).
2. Randomize the ordering of candidate/baseline/reference captures. Strip author identity, model,
   iteration count, self-score, and completion claims.
3. Write the blind packet to `.campaign/<packetId>/blind-review/<reviewId>/`.
4. Dispatch to a fresh cross-model reviewer session. The reviewer writes only the restricted
   `blind-review-payload.schema.json` payload and cannot assert its own model/family/session authority.
5. The controller records served model/family, actual session/run, author session, brief/candidate
   hashes, and process receipt in a signed/hash-bound envelope; it recomputes the payload/artifact
   hashes and writes `blind-review-verdict.schema.json` v2. Model drift or author-session reuse
   rejects the review. Only this wrapped artifact enters campaign state.

**Integration:** `node tools/production/blind-review.mjs prepare <packetId>` and
`node tools/production/blind-review.mjs record <packetId> <verdict.json>`.

## 7. Asset pipeline validator repair (`scripts/check-asset-pipeline-contract.mjs` extension)

**Purpose:** implement ASSET-001/002 — RED fixtures followed by repairs for causal evaluation,
required views, source-grounded geometry/material truth, real iteration work, and evidence
integrity.

**Causal acceptance invariants:**
- Machine scoring and acceptance functions cannot consume iteration/pass/phase numbers.
- Byte-identical canonical evidence hashes cannot produce different machine verdicts.
- Worker-authored `weighted`, `export_bar_ok`, iteration counts, and self-scores have zero
  acceptance authority. Correlation with iteration is forensic evidence, not a rejection rule:
  genuine improvement should correlate with iteration too.
- A macro-cycle counts only when the source/candidate hash changes substantively and the next
  repair is traceable to a measured defect. Camera-only changes and padded rotating craft notes do
  not count.

**ASSET-001 RED checks:**
- `reject_iteration_causality` — identical canonical evidence with different iteration metadata
  yields the same verdict; source-AST fixtures reject acceptance functions that read iteration or
  phase.
- `require_all_views_in_pass_decision` — every profile-required view participates; engines also
  require the nozzle view. A failed excluded close view rejects the pass.
- `prove_chamfer_geometry` — hard-surface source inspection must prove sharp-edge coverage. A GLB
  extras stamp or finalizer claim is not proof. The existing exporter already validates before
  stamping; the live holes are incomplete sharp-edge coverage and claim fabrication by finalizers.
- `reject_neutral_map_pass` — required maps carry information and hash-bound source provenance;
  flat maps and noisy but provenance-free maps both fail.
- `require_uv0_on_textured_meshes` — every textured primitive, not only engines, has valid
  `TEXCOORD_0` storage and matching accessor counts.
- `require_declared_evidence` and `require_artifact_hash` — exact declared artifacts exist and are
  hash-bound; Markdown shorthand is not authority.
- `reject_padded_deficiencies` — clean analysis may report zero measured defects; synthetic filler
  does not satisfy a cycle quota.
- `require_substantive_source_delta` — unchanged source/candidate hashes with only camera/render
  changes do not count as a macro-cycle.

ASSET-001 adds detectors and fixtures only. Its fixture mode is green while its live-code mode
reports the exact nine known loopholes as RED. ASSET-002 repairs the shared validators, campaigns,
exporter, and finalizers; only then are the green truth checks wired once into the existing asset
aggregate. General alpha-evidence artifact hashing is EVID-001, not hidden inside an asset check.

## 8. Truth registry generator (`scripts/generate-truth-summary.mjs`)

**Purpose:** the "truth plane" — a single generated summary over existing evidence, manifests,
runtime maps, checks, and locks. NOT a new prose status doc. Prose docs consume this.

**Output:** `.campaign/truth-summary.json` containing:
- Git commit SHA and working-tree fingerprint (hash of `git status --porcelain`).
- Live backend selections (from `createGameState()` defaults).
- Named check results with timestamps (run `check:*` and capture pass/fail).
- Asset lifecycle state (from runtime asset map + ASSET_STATUS.json).
- Known P0/P1 defects (from ALPHA_PROGRAM.md P0/P1 register, parsed).
- Ownership leases (from `assets/ships/release.__lock/` and dispatch log lanes).

**Integration:** `npm run truth:generate` produces the summary.
`check:truth-drift` fails if the summary's worktree fingerprint doesn't match the current tree
(you're working from stale truth).

## 9. Target automated-controller build order

This is the dependency order for the future fully automated controller. It does not serialize or
block the live game program under the 2026-07-12 controller waiver. Section ownership and order:

1. **SAFE-001 future hardening** — external mutation boundary, frozen/waived in the current
   campaign; required before workers may self-integrate in a future automated campaign.
2. **PROD-001** — §1 campaign manager/semantic validator, then §2 packet compiler. The compiler
   depends on the state authority; these are not independent parallel writes.
3. **PROD-004** — §3 automatic campaign supervisor/action journal, after PROD-001 can describe real
   packets and states.
4. **PROD-002 → PROD-005** — read-only audit may run immediately; §8 truth registry consumes its
   verified results plus trusted campaign/dispatch state.
5. **EVID-001 + QUAL-001** — shared hash-bound artifacts, cards, and §6 blind-review harness after
   the trusted state/compiler foundation.
6. **ASSET-001 → ASSET-002** — §7 RED contract then live repair; no new asset campaign precedes it.
7. **OBS-001 → OBS-002 → OBS-003** — §4 recorder, real media, then §5 calibrated gate runner.

Independent read-only grounding/review can occupy spare slots throughout. Future automated mutation
follows the dependency order and single-writer lanes. Current supervised production may advance
non-overlapping gameplay and asset families in parallel, but “parallel” never means overlapping
writers or shallow acceptance.
