# PROD-001 / PROD-004 controller red-team

**Date:** 2026-07-10
**Verdict:** both current isolated/tool candidates require revision; do not integrate or accept

## PROD-001 isolated candidate

The latest candidate under `.campaign/workspaces/PROD-001-1783669692690-8d9efe` was submitted but
fails the amended control contract:

- `accept()` checks that verdict paths exist but does not parse/validate/hash them or bind packet,
  candidate, reviewer records, gates, evidence, author session, served model, or reviewer families.
- Missing packet metadata silently defaults empty, disabling lane/role/coverage checks.
- Placeholder matching misses tokens containing spaces/hyphens from the real templates.
- Visual references require only two existing paths; duplicates, outside/absolute paths, no failure
  reference, stale hashes, wrong media, and missing provenance can pass.
- Corrupt lease/dispatch reads fail open.
- A real production packet failing compilation is explicitly counted as a passing expected failure.
- `sourceHash` covers only the packet file, not complete read inputs; candidate identity omits
  deletions; check source files can masquerade as execution evidence.
- Terminal `ACCEPTED` precedes integration, so stale/partial integration can fail after acceptance.

Disposition: **REJECTED/stale**. Resume/rebase the same implementer only after SAFE-001 acceptance,
using the amended `packets/PROD-001.md`. Required hostile fixtures include cross-hash acceptance,
same author/reviewer alias/session, outside/duplicate/mutated evidence, candidate mismatch, stale
input, deletion delta, corrupt control state, spaced placeholders, missing failure reference, and
failed integration. Acceptance is now
`APPROVED_CANDIDATE → INTEGRATION_VALIDATION → ACCEPTED`.

## PROD-004 manual tracker candidate

The current `dispatch-log.mjs`/21-assertion fixture candidate proves only self-reported counter
semantics:

- unreadable/corrupt log silently becomes an empty log;
- any ten-character prose blocker resets the counter;
- tool writes violation `pending` while the v1 JSON Schema forbids it;
- the check ignores omitted actions, pending violations, forged blockers, stale processes/leases,
  and ready+free dispatch SLA;
- the live projection itself is stale: returned/failed packets remain active and its code lease
  names a dead PID while packet/lane views disagree.
- after the target projection schema was upgraded to v2, the legacy 21/21 check still reported the
  stale v1 live log as clean, demonstrating that it does not load/validate the authoritative schema.
- the stale projection also shows later M1 work dispatched while SAFE/M0 prerequisites remain
  unaccepted and the recorded PID is dead; typed dependency receipts and `listReady()` filtering are
  required, not just a better counter.

Disposition: **REVISE**. `packets/PROD-004.md` replaces honor-system counting with a controller-owned
hash-chained action journal, derived v2 projection, typed blocker audit, process/lease/campaign
reconciliation, and a ready-lane SLA. Do not manually delete/reclaim the stale lease from this
review; the owner/controller must reconcile it.

## Simplifying trust rule

JSON Schema owns serialization shape. One controller semantic layer derives identity, authority,
freshness, evidence truth, cross-record hash equality, legal transitions, and integrated output.
Adding more self-asserted fields is not enforcement.
