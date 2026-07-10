# 02 — Terminal-Agent Orchestrator Specification

**Status:** DRAFT
**Primary orchestrator:** Codex
**High-volume asset executor:** Grok 4.5 with Blender MCP

## 1. Orchestrator responsibilities

Codex owns product synthesis, the coverage ledger, packet generation, resource scheduling,
independent verification, acceptance/rejection, integration order, and continuation. It should not
quietly take over implementation work assigned to terminal agents.

The Alpha topology is numeric and non-negotiable:

- at most **one** active mutating code lease across Claude, Codex, Grok, OpenCode, or agy;
- at most **one** active mutating Blender/asset lease;
- every remaining slot is read-only research, evidence, or review;
- frontend, gameplay, Kimi overflow, and general code are candidates for the same single code lease,
  not extra concurrent writers.

The scheduler is work-conserving within those limits. If a safe slot and a ready item exist, dispatch
it; if a mutation slot is occupied, fill spare slots with independent read-only work. Every idle slot
records its dependency, ownership, or safety reason.

## 2. Candidate state machine

```text
UNASSESSED
  → SPECIFIED
  → LEASED
  → AUTHORING
  → SUBMITTED
  → EVIDENCE_AUDIT
  → TECHNICAL_VALIDATION
  → RUNTIME_VALIDATION
  → OBSERVED_PLAY
  → OPERATIONAL_VALIDATION
  → BLIND_QUALITY_REVIEW
  → ACCEPTANCE_REVIEW
  → ACCEPTED

Any failed gate → REJECTED → AUTHORING
Unexpected exit/limit → CONTINUATION_DUE → AUTHORING
External blocker claim → BLOCKER_AUDIT → AUTHORING or BLOCKED
```

Only the orchestrator can set `ACCEPTED` or `BLOCKED`. Worker output schemas expose only
`submitted`, `needs_continuation`, or `external_blocker_claimed`.

Campaign control is a separate write authority. Before dispatch, the orchestrator hashes the
compiled brief, schemas, applicable checks, benchmark, starting candidate, and complete live-tree
input set. Only the controller writes campaign state. State transitions are append-only and hash
chained; acceptance is bound to one exact candidate hash, so any later candidate change returns the
item to `SUBMITTED`.

### Mutating-worker safety boundary

No auto-approved terminal worker may mutate the live SpaceFace tree. Post-hoc diff rejection cannot
repair destroyed uncommitted work. `SAFE-001` must first provide a write-enforcing transaction:

1. acquire the one code or one Blender lease and heartbeat it;
2. create an isolated candidate workspace from the exact live working-tree snapshot, including
   relevant uncommitted inputs, without a branch, stash, reset, or Git worktree;
3. expose only the packet's writable paths inside that workspace, with the control plane and source
   baseline read-only;
4. monitor the worker, process/session ID, heartbeat, and write journal; an attempted boundary
   violation terminates and rejects the candidate;
5. review and validate the candidate in isolation;
6. let a separate integrator copy/apply only hash-bound allowlisted outputs to the live tree after a
   stale-input check; any concurrent input change aborts integration.

An OS-enforced restricted process identity/ACL may replace the isolated snapshot only if destructive
fixture tests prove equivalent containment. Prompt instructions and `git diff` monitoring alone do
not qualify. Until `SAFE-001` passes, terminal agents are read-only or manually supervised without
autonomous mutation.

## 3. Work packet

Every packet contains:

1. Player outcome and exact coverage row(s).
2. Existing canonical foundation to reuse.
3. Single writer/authority and file lease.
4. Full implementation scope and explicit non-goals.
5. Technique/profile applicability decisions.
6. First vertical application.
7. Production family/variant coverage.
8. Technical checks and observer routes.
9. Evidence schema and artifact paths.
10. Rejection/continuation protocol.
11. Worker output JSON schema that cannot claim acceptance.

Before launch, a brief compiler rejects unresolved `<PLACEHOLDER>` tokens, empty asset IDs, broad
lane combinations, missing evidence paths, or a worker assigned both author and acceptor roles.
The compiled packet records its own hash in campaign state.

The machine contracts live in `design/production/schemas/`. Workers and critics write only their
restricted submission/verdict records. Structural JSON validity is necessary but not sufficient:
the controller enforces legal transitions, SHA-256 recomputation, reviewer family/session
independence, lease containment, gate order, evidence existence, and zero open critical/major defects.

## 4. Persistent terminal-agent execution

These are target runner invocations, not permission to run mutating agents directly. `run-agent.mjs`
is delivered and destructively tested by `SAFE-001`; `$candidateWorkspace` is never the live tree.

### Grok 4.5 author

```powershell
$schema = Get-Content -Raw -LiteralPath design/production/schemas/worker-submission.schema.json
node tools/production/run-agent.mjs --packet $packet --lease $leaseId -- `
  grok --cwd $candidateWorkspace --model grok-4.5 --always-approve --check `
    --max-turns $campaignBudget --prompt-file $packet `
    --json-schema $schema --output-format json
```

On rejection, continue the same authoring session with the independent verdict and evidence:

```powershell
node tools/production/run-agent.mjs --packet $packet --lease $leaseId --resume -- `
  grok --cwd $candidateWorkspace --model grok-4.5 --resume $sessionId `
    --always-approve --check --max-turns $campaignBudget --single $rejectionPrompt `
    --json-schema $schema --output-format json
```

### Claude Fable 5 author/co-director

```powershell
$prompt = Get-Content -Raw -LiteralPath $packet
node tools/production/run-agent.mjs --packet $packet --lease $leaseId -- `
  claude --print --model claude-fable-5 --effort max --session-id $newSessionId `
    --json-schema $schema --output-format json $prompt

node tools/production/run-agent.mjs --packet $packet --lease $leaseId --resume -- `
  claude --print --model claude-fable-5 --effort max --resume $sessionId `
    --json-schema $schema --output-format json $rejectionPrompt
```

### OpenCode Kimi author

```powershell
node tools/production/run-agent.mjs --packet $packet --lease $leaseId -- `
  opencode run --dir $candidateWorkspace --model opencode-go/kimi-k2.7-code `
    --variant $validatedVariant --format json --file $packet "Execute the attached packet."

node tools/production/run-agent.mjs --packet $packet --lease $leaseId --resume -- `
  opencode run --dir $candidateWorkspace --session $sessionId --format json `
    $rejectionPrompt
```

agy uses `--conversation $conversationId`/`--continue`, but remains small one-shot overflow until
CAP-000 proves reliable session-ID capture and the runner can normalize its output to the worker
schema. It is not assigned a critical persistent lane merely because the CLI has a continue flag.

The controller captures session/conversation identity before accepting any result. Timeouts,
cancellation, and abnormal exit are controller events; they cannot become worker-reported success.
Autonomous approval is allowed only inside the proven write boundary.

Use two fresh read-only critic sessions from different model families for acceptance. Critics receive
the contract, references, and randomized candidate/baseline evidence, but not the author identity,
self-score, iteration count, or completion claim. A split or concrete P0/P1 gets a third adjudicator.

Use `--json-schema` for structured submissions and verdicts. Use `--best-of-n` only for read-only
ideation/research or isolated alternatives; never let parallel writers share the Blender session or
dirty SpaceFace tree.

### Verified local command surfaces (2026-07-10)

- Claude Code 2.1.197 exposes `--model claude-fable-5`, `--effort max`, background agents,
  continuation/resume, custom agents, JSON output, and JSON Schema.
- Grok 0.2.93 exposes `grok-4.5`, continuation/resume, `--check`, inline agents, best-of-N, and JSON Schema.
- OpenCode 1.17.13 exposes `opencode-go/kimi-k2.7-code`, `--variant`, session continuation, attached
  files, and JSON event output.
- agy 1.1.0 exposes one-shot/interactive continuation and the currently available Gemini 3.5,
  Gemini 3.1 Pro, Claude Sonnet 4.6 Thinking, Claude Opus 4.6 Thinking, and GPT-OSS 120B models.

## 5. Multi-agent production cell

| Lane | Default role | Concurrency rule |
|---|---|---|
| Product/spec synthesis | Codex + high-reasoning Claude | read-only until decision recorded |
| Blender authoring | Grok 4.5 + Blender MCP | exactly one lock holder |
| Frontend/3D/game-design implementation | high-reasoning Claude when available | may hold the sole code-mutation lease |
| General code implementation | Codex subagent / Claude / Grok by packet fit | may hold the sole code-mutation lease |
| Visual/code implementation overflow | OpenCode Kimi K2.7 Code | bounded candidate for the sole code-mutation lease |
| One-shot overflow | agy | small packet only; do not assign long critical path |
| Evidence/check runner | separate read-only agent/process | may parallel safely |
| Blind critic | two fresh cross-model sessions; third adjudicator on conflict | never edits candidate |

The capability matrix is provisional until the bake-off in `05_AGENT_CAPABILITY_MATRIX.md`.

### Work-conserving invariant

For every ready independent lane and free slot allowed by the numeric topology, the orchestrator
must dispatch or record the blocking dependency. It may not call one worker, wait, then absorb the
rest of the campaign itself. Major packets use an implementer, evidence verifier, two cross-model
critics, and an adjudicator when needed; call count alone never substitutes for distinct powers.

### Dispatch discipline enforcement (mechanical, anti-laziness)

The work-conserving invariant is a rule that agents abandon after compaction. It is enforced
mechanically by the dispatch discipline tracker (`tools/production/dispatch-log.mjs`, spec in
`11_ENFORCEMENT_MACHINERY_SPEC.md` §3) and the dispatch log schema
(`schemas/dispatch-log.schema.json`).

**Mandatory orchestrator discipline:**
1. Before every major action, read `.campaign/dispatch-log.json`.
2. If `turnsSinceLastDispatch > soloTurnBudget` (default 3), the next action MUST be a dispatch
   or a structured blocker record. Any other action is a process violation.
3. Call `markDispatch()` after every terminal-agent dispatch. Call `markSoloTurn()` before any
   non-dispatch action. Call `markBlocker()` when recording a dependency that prevents dispatch.
4. `totalSoloViolations` with `actionTaken: "ignored"` are permanent records and fail
   `check:dispatch-discipline`.

**After every compaction**, the orchestrator reads the dispatch log FIRST, before anything else.
The log's `recentDispatches` and `currentSprint` re-ground the orchestrator in what was happening,
replacing lost conversational context with durable state. This is the structural cure for the
"calls one agent, tinkers alone, quits early" failure mode: the counter survives compaction, the
prose rule does not.

## 6. Continuation and escalation

- The controller owns a heartbeat, process status, attempt count, relaunch count, failure signature,
  lease expiry, and continuation deadline for every active packet.
- A process exit, turn limit, timeout, invalid schema, or missing submission transitions to
  `CONTINUATION_DUE`; the controller resumes the exact session from the last hash-bound checkpoint.
- Rejection 1–2: the same authoring session receives exact defect IDs and evidence.
- Third materially similar rejection: a fresh diagnostic critic produces a repair/rebuild decision.
- Repeated structural failure returns to the last accepted stage; it does not become completion.
- An external blocker claim requires typed evidence and at least three recorded attempted remedies.
  The controller independently audits it; only the orchestrator can transition to `BLOCKED`.
- The lead may not replace this with local tinkering unless it explicitly becomes the implementer and
  assigns fresh evidence and review authorities.

## 7. Campaign completion

A packet may finish when its candidate is accepted. The overall campaign remains active until the
build-program milestone ledger and clean-wave requirements pass. A terminal agent exiting is never
evidence that the campaign is finished.
