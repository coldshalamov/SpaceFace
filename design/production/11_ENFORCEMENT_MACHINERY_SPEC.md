# 10 — Enforcement Machinery Specification

**Status:** DRAFT implementation contracts for the tooling that makes the production constitution mechanically binding.

The production constitution (00) and quality standard (07) are rules. Rules without enforcement
are documentation. This document specifies the actual tooling that enforces them — the machinery
that makes cheating structurally impossible rather than merely discouraged.

Every spec here is a work-packet input. PROD-001 builds and wires these tools.

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
- `accept(packetId, { authorityId, reviewerVerdictPaths })` → the ONLY function that may set
  `ACCEPTED`. It enforces: ≥2 reviewer PASS verdicts exist, no open critical/major defects, all
  six gate verdicts are `pass`. If any precondition fails, it throws and does not write.
- `listByState(state)` → returns all packet IDs in a given state.
- `listReady()` → returns all packets in `SPECIFIED` state (compiled, ready to dispatch).

**Integration:** `npm run campaign:status` prints a summary. `check:campaign-state` validates
every existing state file against the schema and reports any illegal records.

**File location:** candidate states live in `.campaign/<packetId>/state.json`. The directory is
gitignored (ephemeral orchestration state) but its aggregate summary is not.

## 2. Packet compiler (`tools/production/compile-packet.mjs`)

**Purpose:** take a packet source (markdown with frontmatter) and compile it into a dispatchable
brief. This is the "brief compiler" from 02_ORCHESTRATOR_SPEC.md §3.

**Compilation steps:**
1. Parse the packet source. Extract frontmatter (coverage IDs, milestone, lane, model, lease paths).
2. Resolve all `<PLACEHOLDER>` tokens. If any remain, **fail with the exact unresolved tokens**.
3. Check role separation: the author model and the assigned reviewer models must differ in
   `modelFamily`. If the same family is assigned to both author and acceptor, **fail**.
4. Check lane exclusivity: if the packet's lease paths overlap with any currently-active lease
   (from the dispatch log), **fail** with the conflict.
5. Check asset/render preflight: if the packet touches `assets/**` or `src/render/**`, verify no
   active graphics lock exists.
6. Embed reference captures: copy the packet's referenced reference images into the compiled
   brief as base64 or local paths so they are in-context at the worker's start. A packet for a
   visual task without at least 2 reference captures **fails compilation**.
7. Embed observatory thresholds: pull the relevant gates from `10_OBSERVATORY_HARD_GATES.md`
   and append them to the brief's acceptance section.
8. Compute `briefHash` (sha256 of the compiled brief). Record it in campaign state.

**API:** `node tools/production/compile-packet.mjs <packet-source.md>`

**Integration:** `check:production-packets` runs the compiler over every packet in
`design/production/packets/` and reports unresolved placeholders, role conflicts, or missing
references.

## 3. Dispatch discipline tracker (`tools/production/dispatch-log.mjs`)

**Purpose:** mechanically detect when the orchestrator collapses to solo work. This is the cure
for the "calls one agent, tinkers alone, quits early" failure mode.

**Mechanism:**
- The dispatch log is a single JSON file (`.campaign/dispatch-log.json`) validated against
  `dispatch-log.schema.json`.
- `markDispatch(packetId, agent, model, lane)` → resets `turnsSinceLastDispatch` to 0, increments
  `totalDispatches`, appends to `recentDispatches`.
- `markSoloTurn()` → increments `turnsSinceLastDispatch` and `totalSoloTurns`. If
  `turnsSinceLastDispatch > soloTurnBudget`, records a violation and prints:
  `⚠ DISPATCH VIOLATION: {N} solo turns since last dispatch. Dispatch now or record a blocker.`
- `markBlocker(packetId, reason)` → resets `turnsSinceLastDispatch` to 0 (a structured blocker is
  a valid alternative to dispatching). Records the blocker in `currentSprint.blockedPackets`.
- `status()` → prints the current dispatch discipline summary for quick grounding.

**Enforcement model:** The orchestrator is instructed (in the goal prompt) to call
`markSoloTurn()` before any non-dispatch action and `markDispatch()` after every dispatch. The
tool's output is the enforcement — when `turnsSinceLastDispatch` exceeds the budget, the warning
re-grounds the orchestrator after compaction because it reads the file, not its memory.

**API:** `node tools/production/dispatch-log.mjs status | mark-solo | mark-dispatch <id> <agent> <model> <lane> | mark-blocker <id> <reason>`

**Integration:** `check:dispatch-discipline` reads the log and fails CI if `totalSoloViolations`
with `actionTaken: "ignored"` > 0. This makes ignored violations a permanent, visible record.

## 4. Observatory recorder (`src/observability/sessionObserver.js`)

**Purpose:** passively record a play session as three synchronized streams (intent, execution,
presentation) without becoming a gameplay authority or affecting determinism.

**Hook points (reuse existing, do not duplicate):**
- **Intent stream:** subscribe to `ai:tactic`, `ai:action`, `ai:telegraph` (from
  `src/ai/explainability.js` AI trace), encounter director phase/choice events (from
  `src/systems/encounterDirector.js`), and mission objective changes.
- **Execution stream:** subscribe to `combat:fire`, `combat:hit`, `combat:damage`, `combat:death`
  (from event bus), mining events (`mining:seamHit`, `mining:coreRecovered`, `mining:bulkHaul`),
  economy events, and player position/velocity (sampled at 10Hz from physics, NOT from
  Math.random — use `state.simTime` for timestamps).
- **Presentation stream:** subscribe to `cue:fire` (from presentation orchestrator), camera mode
  changes, VFX requests, audio requests, and asset LOD/fallback transitions (from
  `src/render/partsLibrary.js` loader hooks). Sample frame timing from the render loop.

**Critical invariants:**
- The observer subscribes to events; it NEVER emits them.
- The observer reads `state.simTime` and `state.rng` for alignment; it NEVER writes them.
- Observer-on and observer-off must produce identical sim hashes. Enforced by gate
  `observer_determinism_drift` (see 09).
- The observer is gated behind `state.options.observatory === true`. Default off. Never serialized
  into saves.
- Buffer is bounded (ring buffer, max 10000 samples per stream). Old data is dropped, not leaked.

**Output:** writes the observatory artifact directory (see 04_GAMEPLAY_OBSERVATORY.md §7).

**Integration:** `npm run observe:session -- --route <route-id> --policy <policy> --seed <seed>`
runs a headless session with the observer on and produces the artifact bundle. `observe:session`
paired with `--no-capture` runs the identical input tape for authoritative performance.

## 5. Observatory gate runner (`scripts/check-observatory-gates.mjs`)

**Purpose:** run the hard-gate thresholds from `10_OBSERVATORY_HARD_GATES.md` against an
observatory session artifact and fail mechanically if any gate fires.

**Mechanism:**
1. Load the session artifact (timeline, perf samples, AI trace, asset exposure, findings).
2. For each gate the artifact has data for, evaluate the threshold.
3. Exit nonzero if any P0 gate fires. Print a structured report of all evaluated gates with
   their measurements, thresholds, and pass/fail status.
4. Unimplemented gates (no detector yet) report `pending`, never `pass`.

**Integration:** `check:observatory:<gate-name>` runs a single gate.
`check:observatory:all` runs all gates that have detectors implemented. Gates without detectors
report `pending` and do not contribute to pass/fail.

## 6. Blind review harness (`tools/production/blind-review.mjs`)

**Purpose:** prepare a blind review packet and record the verdict, enforcing author-anonymity and
the schema's structural constraints.

**Mechanism:**
1. Given a candidate hash, gather the candidate's evidence (renders, in-game frames, incident
   clips) and the contract (packet scope, reference panel).
2. Randomize the ordering of candidate/baseline/reference captures. Strip author identity, model,
   iteration count, self-score, and completion claims.
3. Write the blind packet to `.campaign/<packetId>/blind-review/<reviewId>/`.
4. Dispatch to a fresh cross-model reviewer session.
5. Record the verdict in the campaign state `reviewers` array. The verdict must validate against
   `blind-review-verdict.schema.json`.

**Integration:** `node tools/production/blind-review.mjs prepare <packetId>` and
`node tools/production/blind-review.mjs record <packetId> <verdict.json>`.

## 7. Asset pipeline validator repair (`scripts/check-asset-pipeline-contract.mjs` extension)

**Purpose:** implement ASSET-001/002 — the RED fixtures and repaired validators that catch
iteration-derived scores, excluded required views, false chamfer stamps, and neutral-map passes.

**New checks (added to `check:asset-pipeline-contract`):**
- `reject_iteration_derived_score` — fails if any campaign ledger's quality score correlates with
  iteration number rather than render analysis. Fixture: a ledger with monotonically increasing
  scores but identical render analysis.
- `require_all_views_in_pass_decision` — fails if a pass decision excludes any required view
  (lit_close_detail, nozzle, muzzle, runtime). Fixture: a pass with a failed close view excluded.
- `prove_chamfer_geometry` — fails if a chamfer claim has no measured source geometry (modifier
  or mesh data). Fixture: a stamped chamfer claim with no mesh evidence.
- `reject_neutral_map_pass` — fails if a base/normal/ORM map is near-flat (variance below
  threshold) where authored surface information is required by the asset profile. Fixture: a
  synthesized neutral normal map passing a texture-role check.
- `require_uv0_on_textured_meshes` — fails if a mesh has a material with texture role bindings but
  no TEXCOORD_0 attribute. (This was the live defect the first agent caught.)

**Integration:** these checks run as part of `check:art` and are RED-first (failing fixtures
written before the validator repair).

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

## 9. Build order

These tools are the first workstream (PROD-001 through PROD-004). They must exist before any
gameplay or asset campaign relies on them. Build order:

1. Campaign-state manager (§1) — everything else depends on it.
2. Packet compiler (§2) — dispatching depends on compiled packets.
3. Dispatch discipline tracker (§3) — anti-laziness enforcement, start immediately after §1.
4. Truth registry generator (§8) — grounds all decisions in current repo state.
5. Observatory recorder (§4) — the observatory gates depend on its output.
6. Observatory gate runner (§5) — needs §4's output.
7. Blind review harness (§6) — needs §1 and §2.
8. Asset validator repair (§7) — RED-first, gates all asset campaigns.

Items 1–4 can be built in parallel (different files, no dependencies). 5–6 are sequential.
7–8 are independent of 1–6 and can start immediately.
