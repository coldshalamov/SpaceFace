# 02 — Terminal-Agent Orchestrator Specification

> **ACTIVATION SCOPE:** These leases, candidate states, dispatch rules, and role separations apply
> only to an explicitly activated production campaign. They are not general repository authority.
> In ordinary work, one agent may make the end-to-end code, asset-wiring, test, and documentation
> changes needed for a coherent result, while respecting actual concurrent ownership signals.

**Status:** DRAFT
**Primary orchestrator:** Codex
**High-volume asset executor:** Grok 4.5 with Blender MCP

## 1. Orchestrator responsibilities

Codex owns product synthesis, the coverage ledger, packet generation, resource scheduling,
independent verification, acceptance/rejection, integration order, and continuation. It should not
quietly take over implementation work assigned to terminal agents.

When this campaign controller is active, its writer topology is:

- at most **one** active mutating code lease across Claude, Codex, Grok, OpenCode, or agy;
- at most **one** active mutating Blender/asset lease;
- every remaining slot is read-only research, evidence, or review;
- frontend, gameplay, Kimi overflow, and general code are candidates for the same single code lease,
  not extra concurrent writers.

The scheduler is work-conserving within those limits. If a safe slot and a ready item exist, dispatch
it; if a mutation slot is occupied, fill spare slots with independent read-only work. Every idle slot
records its dependency, ownership, or safety reason.

Candidate state is controller-owned at `.campaign/<packetId>/state.json`; orchestration discipline
is separately owned at `.campaign/dispatch-log.json`. Keeping them separate avoids duplicating
scheduler truth in every packet. Before every major action, follow §5's dispatch-log protocol. After
compaction, re-read the constitution, quality standard, active packet state, and dispatch log before
another action.

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
  → APPROVED_CANDIDATE
  → INTEGRATION_VALIDATION
  → ACCEPTED

Any failed gate → REJECTED → AUTHORING
Unexpected exit/limit → CONTINUATION_DUE → AUTHORING
External blocker claim → BLOCKER_AUDIT → AUTHORING or BLOCKED
```

Only the controller/orchestrator can set `APPROVED_CANDIDATE`, `ACCEPTED`, or `BLOCKED`. Worker output schemas expose only
`submitted`, `needs_continuation`, or `external_blocker_claimed`.

Campaign control is a separate write authority. Before dispatch, the orchestrator hashes the
compiled brief, schemas, applicable checks, benchmark, starting candidate, and complete live-tree
input set. Only the controller writes campaign state. State transitions are append-only and hash
chained. `APPROVED_CANDIDATE` means the isolated candidate passed review; it is not acceptance.
`ACCEPTED` is legal only after stale-safe integration and live-tree verification prove the
integrated output hash equals the reviewed candidate hash. Any later candidate or input change
returns the item to `SUBMITTED` or aborts integration.

JSON Schema validates serialization shape only. A trusted controller semantic validator derives
authority and refuses a transition unless it can recompute and bind all of the following to one
canonical candidate hash: the controller-created input manifest, add/modify/delete delta manifest,
check receipts, artifacts, gate verdicts, reviewer verdicts, approval decision, integration receipt,
and final live-tree output. It also proves served author/reviewer identities from runner envelopes,
author/reviewer session separation, reviewer-family diversity, legal history edges/sequences/hash
chain, evidence containment/existence/hashes, and freshness at every gate. Self-claimed identity,
hash-shaped strings, and source check files never satisfy those checks.

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
not qualify. SAFE-001 is frozen under the 2026-07-12 controller waiver at 88/88 current fixtures.
Until future acceptance, auto-approved workers may not self-integrate. This does not block read-only
lanes, exclusive Blender authoring, or controller-supervised targeted live-tree integration and
commits under explicit ownership.

The following are trust-boundary requirements, not implementation suggestions:

- The worker process cannot write the controller-owned `.campaign` tree, lease records, snapshots,
  guard journals, run records, compiled briefs, or reviewer output. A submission drop-box is the
  only controller-defined ingress and is validated after the worker loses write authority.
- Heartbeat failure is fail-closed: latch the failure, kill the full worker process tree, reject the
  candidate, and keep guards active through post-exit stabilization. A caught-and-ignored heartbeat
  exception is a containment failure.
- Lease acquisition/reclaim is atomic and owner-token checked. Two contenders cannot both reclaim
  one expired lease; release cannot delete a successor's lease.
- Workspace walking rejects reparse points/symlinks, hardlinks to files outside the candidate
  boundary, Windows alternate data streams, device paths, and path/case aliases. Hashing a planted
  hardlink is not containment.
- Integration revalidates live-input hashes and candidate-output hashes immediately before each
  atomic publication under an integration lease. A pre-stage check followed by mutable staging is
  a TOCTOU failure. Partial multi-file publication must be recoverable and reported as rejection,
  never rounded up to integrated.
- Destructive fixtures cover control-plane writes, heartbeat loss, concurrent lease reclaim,
  detached/daemon descendants, hardlink/ADS escape, post-review mutation, staging races, and
  invalid submission evidence. Green happy-path fixtures do not waive a failed hostile fixture.

## 3. Work packet

Every packet contains:

1. Player outcome and exact coverage row(s).
2. Machine-readable packet dependencies and external prerequisite receipts.
3. Existing canonical foundation to reuse.
4. Single writer/authority and file lease.
5. Full implementation scope and explicit non-goals.
6. Technique/profile applicability decisions.
7. First vertical application.
8. Production family/variant coverage.
9. Technical checks and observer routes.
10. Evidence schema and artifact paths.
11. Rejection/continuation protocol.
12. Worker output JSON schema that cannot claim acceptance.

Before launch, a brief compiler rejects unresolved `<PLACEHOLDER>` tokens, empty asset IDs, broad
lane combinations, missing evidence paths, or a worker assigned both author and acceptor roles.
The compiled packet records its own hash in campaign state.

For every player-facing quality claim, the compiler copies/attaches the actual hash-bound reference
media into the worker's initial and resumed context: at least two admired examples for named
qualities plus one failure example. A prose link is insufficient. Pure control-plane packets use
`cardMode: control_plane` with at least two hash-bound good controls and one hostile/failure fixture;
they do not fake visual media or receive a reference-free exemption.

The machine contracts live in `design/production/schemas/`. Workers and critics write only their
restricted payloads; they cannot author identity, candidate hashes, cycle counts, or acceptance
authority. The controller wraps payloads with served model/session/process receipts and recomputed
manifest/artifact hashes. Structural JSON validity is necessary but not sufficient: the controller
enforces legal transitions, cross-record equality, reviewer family/session independence, lease
containment, gate order, evidence truth, and zero open critical/major defects.

## 4. Persistent terminal-agent execution

These are target runner invocations, not permission for a worker to self-integrate into the live
tree. A candidate `run-agent.mjs` passes 88/88 current destructive fixtures, but SAFE-001 remains
unaccepted and frozen with known P2 control-plane debt under the current controller waiver.
`$candidateWorkspace` is never the live tree; the controller may nevertheless integrate exact,
reviewed, ownership-safe outputs through the supervised workflow.

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
  C:\Users\93rob\AppData\Roaming\npm\opencode.cmd run --pure `
    --dir $candidateWorkspace --model opencode-go/kimi-k2.7-code `
    --variant $validatedVariant --format json --file $packet "Execute the attached packet."

node tools/production/run-agent.mjs --packet $packet --lease $leaseId --resume -- `
  C:\Users\93rob\AppData\Roaming\npm\opencode.cmd run --pure `
    --dir $candidateWorkspace --session $sessionId `
    --model opencode-go/kimi-k2.7-code --variant $validatedVariant --format json $rejectionPrompt
```

The runner closes worker stdin; OpenCode otherwise blocks indefinitely. Bare `opencode` is forbidden
because PATH resolves stale Chocolatey 1.14.33 rather than the pinned npm 1.17.13 binary.

agy resumes only with `--conversation $conversationId` obtained from the exact dispatch receipt.
`--continue` is forbidden because it races the machine-global last conversation. agy remains small
one-shot overflow until a controller-owned session capture/normalization path is accepted.

The controller captures session/conversation identity before accepting any result. Timeouts,
cancellation, and abnormal exit are controller events; they cannot become worker-reported success.
Autonomous approval is allowed only inside the proven write boundary.

Use two fresh read-only critic sessions from different model families for acceptance. Critics receive
the contract, references, and randomized candidate/baseline evidence, but not the author identity,
self-score, iteration count, or completion claim. A split or concrete P0/P1 gets a third adjudicator.

CLI schema flags are convenience, not authority. The runner validates every worker/reviewer output
against the controller schema and semantic envelope; Grok's live schema flag was not reliably
enforced, and OpenCode/agy expose none. Use `--best-of-n` only for read-only ideation/research or
isolated alternatives; never let parallel writers share the Blender session or dirty SpaceFace tree.

### Verified local command surfaces (2026-07-10)

- Claude Code 2.1.197 exposes `--model claude-fable-5`, `--effort max`, background agents,
  continuation/resume, custom agents, JSON output, and JSON Schema.
- Grok 0.2.93 exposes `grok-4.5`, continuation/resume, `--check`, inline agents, best-of-N, and JSON Schema.
- OpenCode's pinned npm 1.17.13 exposes `opencode-go/kimi-k2.7-code`, `--variant`, session
  continuation, attached files, and JSON event output; bare PATH currently resolves the stale
  Chocolatey 1.14.33 binary and must not be used.
- agy 1.1.1 exposes one-shot/interactive continuation and the currently available Gemini 3.5,
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

The work-conserving invariant is enforced by the target PROD-004 supervisor specified in
`11_ENFORCEMENT_MACHINERY_SPEC.md` §3. Its authority is an append-only hash-chained controller action
journal (`.campaign/dispatch-events.ndjson`); `.campaign/dispatch-log.json` is a reconciled derived
projection validated by `dispatch-event.schema.json` and `dispatch-log.schema.json`.

The controller wrapper records each major action before execution. It derives dispatch/solo counts,
audits typed blockers, and reconciles every nonterminal packet against a live process+heartbeat,
queued continuation deadline, or adjudicated blocker. A ready packet plus free permitted lane must
dispatch within the configured SLA or fail mechanically. Corrupt/missing journals, omitted actions,
pending/ignored violations, forged blockers, stale packets, and dead leases all fail closed.

The current manual `markSoloTurn`/`markDispatch` candidate is bootstrap-only and unaccepted. Until
the supervisor lands, the orchestrator follows its warnings but may not claim they prove discipline.

**After every compaction**, the controller reads and verifies the event-chain head, derived
projection, campaign states, live leases/PIDs, and queued continuations before another action. The
projection re-grounds context; the immutable journal and reconciliation—not the orchestrator's own
counter—are the structural cure for "calls one agent, tinkers alone, quits early."

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
