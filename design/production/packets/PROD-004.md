# PACKET PROD-004 — Automatic campaign supervisor and dispatch journal

packetId: PROD-004
milestone: M0 Wave A
kind: control-plane
lane: sole code_mutation lease through an ACCEPTED SAFE-001 runner
writablePaths: tools/production/campaign-supervisor.mjs, tools/production/dispatch-log.mjs, tools/production/lib/actionJournal.mjs, scripts/check-dispatch-discipline.mjs, design/production/schemas/dispatch-event.schema.json, design/production/schemas/dispatch-log.schema.json
coverage: ALPHA_PROGRAM Task 0.5 anti-early-stop enforcement
dependsOn: SAFE-001@ACCEPTED, PROD-001@ACCEPTED
externalPrerequisites: reconciled lease/process snapshot receipt
authorModel: <BOUND_AT_COMPILE>
authorModelFamily: <BOUND_AT_COMPILE>
reviewerModels: <BOUND_AT_COMPILE>
reviewerModelFamilies: <BOUND_AT_COMPILE>
qualityCard: <BOUND_AT_COMPILE>
qualityCardHash: <BOUND_AT_COMPILE>
qualityCardMode: control_plane
gates: scope, technical, runtime, temporal, quality, operational
readDependencies: <BOUND_AT_COMPILE>

## Outcome

The orchestrator cannot obtain process credit by remembering to increment its own counter, typing a
vague blocker, or leaving stale agents marked active. Every controller action is journaled before it
happens; the projection is derived; actual campaigns, processes, leases, continuations, and ready
lanes reconcile. Silence and unjustified stopping become machine failures.

## Required implementation

- Append controller actions to `.campaign/dispatch-events.ndjson` with strict sequence,
  previous-record hash, immutable typed receipt artifact descriptor, and computed record hash.
  Store receipts content-addressed under `.campaign/dispatch-receipts/`; append/lock atomically.
- Derive `.campaign/dispatch-log.json` v2 from a complete replay. Never trust or edit the projection
  as source state; never replace an unreadable journal with an empty one.
- Controller wrapper records `dispatch`, `solo_action`, `agent_return`, `blocker_claim`,
  `blocker_audit`, `lane_change`, `compaction_resume`, and `violation` before executing the action.
  A direct/manual mark is debug-only and carries no production authority.
- A blocker claim does not reset the solo budget. A fresh controller audit validates a typed blocker,
  contained hash-bound evidence, real ownership/tool/dependency state, and attempted remedies before
  a confirmed blocker earns reset credit.
- Reconcile every nonterminal campaign to exactly one of: live process + valid lease/heartbeat;
  queued continuation with deadline; or independently adjudicated BLOCKED. Returns/timeouts update
  packet/lane state and cannot remain active forever.
- A ready independent packet plus a free permitted lane has a configured dispatch SLA. Expiry emits
  a permanent violation and fails the gate; an idle slot needs a hash-bound dependency/safety reason.
- Compaction resume verifies journal chain/projection/campaign/lease snapshots before allowing the
  next action.

## Mandatory fixtures

1. valid action chain/projected counter;
2. corrupt, truncated, reordered, deleted, or hash-tampered event journal fails closed;
3. projection tamper/mismatch fails;
4. omitted solo action is detected by controller-wrapper action receipt reconciliation;
5. ten-character/vague/worker-self-authored blocker earns no reset;
6. missing/mutated/outside blocker evidence fails; confirmed independent blocker passes;
7. returned/timed-out/dead-PID packet cannot stay active or keep a lane leased;
8. expired heartbeat and successor lease ownership reconcile correctly;
9. ready+free packet exceeds dispatch SLA and fails; real dispatch within SLA passes;
10. pending/ignored violations fail acceptance; resolved dispatch or audited blocker records why;
11. compaction resume on stale campaign/lease snapshot is denied;
12. current v1 projection is reported migration-required, never silently treated as clean.
13. hand-written projector/validator and both authoritative JSON Schemas agree on every good/bad
    event/projection fixture; schema drift fails the check.
14. missing, mutated, wrong-kind, outside-root, or hash/size-invalid action receipts make replay fail;
    a valid receipt reproduces every projected identity/lane/status field.

## Acceptance

`node scripts/check-dispatch-discipline.mjs` replays all fixtures and a disposable multi-process
campaign simulation. The live gate is not green until the stale real dispatch projection/lease are
reconciled through the owner/controller protocol. Independent review proves the supervisor derives
authority from receipts rather than self-authored strings and enforces:

> every nonterminal packet = live process + valid heartbeat, queued resume with deadline, or
> adjudicated BLOCKED.

No production status is inferred from chat, transcript prose, or the existence of an agent name.
