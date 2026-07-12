# PACKET PROD-001 — Packet compiler + campaign-state manager

packetId: PROD-001
milestone: M0 Wave A
status: REVISE — isolated candidate submitted but rejected by controller red-team; do not integrate
kind: control-plane
lane: sole code_mutation lease (you hold it via the SAFE-001 runner)
writablePaths: tools/production/campaign-manager.mjs, tools/production/compile-packet.mjs, scripts/check-campaign-state.mjs, scripts/check-production-packets.mjs, design/production/packets/examples/**
coverage: ALPHA_PROGRAM Task 0.5 (safe external candidate control plane)
dependsOn: SAFE-001@ACCEPTED
externalPrerequisites: fresh code lease and controller input-manifest receipt
authorModel: <BOUND_AT_COMPILE>
authorModelFamily: <BOUND_AT_COMPILE>
reviewerModels: <BOUND_AT_COMPILE>
reviewerModelFamilies: <BOUND_AT_COMPILE>
qualityCard: <BOUND_AT_COMPILE>
qualityCardHash: <BOUND_AT_COMPILE>
qualityCardMode: control_plane
gates: scope, technical, runtime, temporal, quality, operational
readDependencies: <BOUND_AT_COMPILE>

## Player outcome

Autonomous terminal-agent campaigns become resumable and independently verifiable: every candidate
has one legal, hash-chained state record; every dispatched brief is concrete (no placeholders, no
role conflicts). Without this, multi-agent production collapses into untracked chat state.

## You are a WORKER inside an isolated candidate workspace

- Your cwd is a SNAPSHOT COPY of the SpaceFace tree, not the live repo. There is no .git and no
  node_modules here. That is intentional (SAFE-001 containment). Do not fight it.
- Write ONLY within: tools/production/campaign-manager.mjs, tools/production/compile-packet.mjs,
  scripts/check-campaign-state.mjs, scripts/check-production-packets.mjs,
  design/production/packets/examples/**. Any write outside these paths is journaled and REJECTS
  your whole candidate mechanically.
- Do NOT edit package.json (shared file — the integrator wires npm scripts). Instead list the exact
  npm script entries you propose in your submission's `changes` array.
- Do NOT run git commands. Do NOT use absolute paths outside your cwd. Test your code by running
  `node scripts/check-campaign-state.mjs` and `node scripts/check-production-packets.mjs` directly
  (zero-dependency Node 24; no npm install available).
- Zero new dependencies. Plain ESM .mjs. Match the code style of tools/production/lib/*.mjs
  (read them first — you MUST reuse lib/util.mjs helpers: atomicWriteJson, readJson, sha256String,
  nowIso; do not duplicate them).

## Read first (all present in your workspace)

1. design/production/11_ENFORCEMENT_MACHINERY_SPEC.md §1 (campaign-state manager) and §2 (packet compiler)
2. design/production/02_ORCHESTRATOR_SPEC.md §2 (state machine + campaign control) and §3 (work packet)
3. design/production/schemas/campaign-state.schema.json (the exact record contract)
4. design/production/schemas/dispatch-log.schema.json (lane conflict source for the compiler)
5. design/production/templates/WORK_PACKET.md (packet source shape)
6. tools/production/lib/util.mjs and tools/production/lib/validate.mjs (style + reuse)

## Deliverable 1 — tools/production/campaign-manager.mjs

ESM module exporting:
- `load(controlRoot, packetId)` → state JSON from `<controlRoot>/<packetId>/state.json`, or null.
- `save(controlRoot, packetId, state)` → validates structurally against campaign-state.schema.json
  (write your own minimal validator in the same file or a small helper — required fields, enums,
  digest patterns, additionalProperties; model it on tools/production/lib/validate.mjs), recomputes
  and verifies the history hash chain, writes atomically via lib/util.mjs atomicWriteJson.
- `transition(controlRoot, packetId, to, { actor, actorRole, candidateHash, evidence })` → appends a
  history entry with `previousRecordHash` = last entry's `recordHash` and
  `recordHash` = sha256 of a canonical JSON serialization of {sequence, actor, actorRole, from, to,
  candidateHash, evidence, previousRecordHash}. Refuses illegal transitions. The legal graph
  (from 02_ORCHESTRATOR_SPEC §2):
  UNASSESSED→SPECIFIED→LEASED→AUTHORING→SUBMITTED→EVIDENCE_AUDIT→TECHNICAL_VALIDATION→
  RUNTIME_VALIDATION→OBSERVED_PLAY→OPERATIONAL_VALIDATION→BLIND_QUALITY_REVIEW→ACCEPTANCE_REVIEW→
  APPROVED_CANDIDATE→INTEGRATION_VALIDATION→ACCEPTED;
  any of the gate states (SUBMITTED..ACCEPTANCE_REVIEW) →REJECTED; REJECTED→AUTHORING;
  LEASED|AUTHORING→CONTINUATION_DUE; CONTINUATION_DUE→AUTHORING;
  LEASED|AUTHORING|CONTINUATION_DUE→BLOCKER_AUDIT; BLOCKER_AUDIT→AUTHORING|BLOCKED.
  No other edges. ACCEPTED and BLOCKED are terminal (no outgoing edges).
- `approve(controlRoot, packetId, { authorityId, reviewerVerdictArtifacts })` → the only path to
  APPROVED_CANDIDATE. It parses and validates controller envelopes and verdicts, recomputes every
  artifact, binds packetId/current candidate/input manifest, proves author/reviewer session and
  model-family separation, requires two distinct PASS critics, zero open critical/major defects,
  and all applicable gates pass.
- `recordIntegration(controlRoot, packetId, integrationReceipt)` → moves only
  APPROVED_CANDIDATE→INTEGRATION_VALIDATION after stale-input and candidate-output verification.
- `accept(controlRoot, packetId, { authorityId, integrationReceiptHash })` → the only terminal
  ACCEPTED transition. It recomputes the integration receipt and proves the live-tree result equals
  the reviewed candidate. A stale/failed integration leaves the campaign nonterminal.
- `listByState(controlRoot, state)` and `listReady(controlRoot)` (SPECIFIED packets).
- CLI when run directly: `node tools/production/campaign-manager.mjs status <controlRoot>` prints a
  one-line-per-packet summary.

## Deliverable 2 — tools/production/compile-packet.mjs

`node tools/production/compile-packet.mjs <packet-source.md> [--control-root <dir>] [--out <dir>]`:
1. Require packetId, milestone, kind, lane, writablePaths, coverage, machine-readable dependencies/
   external prerequisites, author model/family, reviewer models/families, quality-card path/hash,
   applicable gates, and declared read dependencies. Missing metadata fails; no empty/default value
   may disable dependency, role, lane, or reference checks.
2. FAIL listing exact unresolved angle-bracket tokens, including tokens with spaces/hyphens such as
   `<PLAYER OUTCOME>`, and fail blank/boilerplate required sections. The compiler resolves only its
   documented controller-bound tokens.
3. FAIL if authorModelFamily equals any reviewerModelFamily (role separation).
4. FAIL if writablePaths overlap any reconciled active lease/campaign lane. Missing/corrupt lease or
   dispatch state fails closed; it never becomes “no conflict.”
5. FAIL if writablePaths touch `assets/` or `src/render/` while `assets/ships/release.__lock/` or
   `assets/ships/release.__building/` exists in the tree root (graphics-lease preflight).
6. For player-facing/visual work, validate the full quality-card v2: at least two distinct admired
   plus one failure reference, contained regular media, recomputed bytes/hash/signature, provenance,
   and a context-manifest proving attachment to initial and resumed contexts.
7. Append the relevant observatory gate names/thresholds from
   design/production/10_OBSERVATORY_HARD_GATES.md when the packet declares `gates:` names.
8. Write the compiled brief, compute its hash, and create a controller input manifest over the
   brief, schemas, checks, gates, references, source artifacts, and every declared read dependency.
   Record both hashes in UNASSESSED→SPECIFIED history and recheck freshness at every later gate.
9. Resolve `dependsOn` into campaign-state receipts. `listReady()` returns the packet only when each
   dependency remains ACCEPTED at its exact candidate/acceptance-record hash, external prerequisite
   artifacts validate, and the required lane is free.

## Deliverable 3 — scripts/check-campaign-state.mjs

Fixture-driven check (build fixtures in a temp dir; never touch real .campaign):
- valid lifecycle UNASSESSED→…→APPROVED_CANDIDATE→INTEGRATION_VALIDATION→ACCEPTED passes only with
  two controller-wrapped PASS reviewers and a live integration receipt for the same candidate;
- illegal transition (e.g. AUTHORING→ACCEPTED) throws;
- tampered history (edited recordHash or gap in chain) is detected on load/save;
- approval/acceptance with one reviewer, same author/reviewer session under aliases, same-family
  reviewers, candidate/hash mismatch, missing/mutated/outside evidence, open major defect, pending
  gate, stale input, or failed integration throws and writes nothing;
- a delta manifest missing a deletion, corrupt lease/dispatch state, illegal history edge/sequence,
  or cross-hash ACCEPTED paperwork is rejected;
- unmet, rejected, stale-hash, self, and cyclic packet dependencies stay out of `listReady()`; a
  dependency changing after compilation invalidates the dependency-snapshot hash;
- worker-side states cannot set ACCEPTED via transition() (only accept() can).
Print `ok/FAIL` lines and exit nonzero on any failure (style: scripts/check-safe-agent-runner.mjs).

## Deliverable 4 — scripts/check-production-packets.mjs

Every `design/production/packets/*.md` packet (excluding fixture examples) must compile. Fixture
packets cover unresolved spaced placeholders, blank sections, family/session conflicts, missing
metadata, corrupt lease/log, duplicate/outside/stale references, missing failure reference, and a
valid packet. Include unmet/stale/cyclic dependency fixtures. A real production packet failing
compilation is always a check failure.

## Submission (MANDATORY — the runner rejects your candidate without it)

Write JSON to the path in env var SF_SUBMISSION_PATH conforming to
design/production/schemas/worker-submission.schema.json. status MUST be "submitted" (or
"needs_continuation" with a continuation record if you genuinely run out of capacity — never any
other word). The payload contains only evidence references and change summaries. The controller
wraps it as `worker-candidate-record.schema.json`, deriving served identity, input/delta/candidate
hashes, immutable command receipts, and cycle-ledger hash. Check source files are not execution
evidence and the worker never supplies authoritative cycle counts.

## Acceptance (done by the orchestrator, NOT you — do not claim it)

Your candidate is evaluated on: both check scripts pass when run by the controller in a fresh
workspace; the state machine enforces every precondition above; the compiler rejects every fixture
class; hash chain tamper detection works; zero writes outside your allowlist (mechanically journaled).
