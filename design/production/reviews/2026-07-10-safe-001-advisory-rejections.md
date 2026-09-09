# SAFE-001 candidate — independent advisory rejection record

**Date:** 2026-07-10

**Status:** REJECTED for scheduling; not a schema-valid/hash-bound acceptance verdict

**Consequence:** autonomous terminal-worker mutation remains disabled

## Why this record exists

The ignored `.campaign` artifacts contain two useful independent hostile reviews of the current
SAFE-001 candidate. Neither review was wrapped by the accepted campaign controller, bound to an
immutable candidate hash, or validated as a final `blind-review-verdict` artifact. They therefore
cannot contribute acceptance quorum. They are still sufficient to reject and define repair
fixtures: acceptance never requires us to ignore a concrete defect merely because the review
envelope is incomplete.

## Review A — Gemini 3.5 Flash (agy)

Source: `.campaign/SAFE-001/review-agy.out.md`

Verdict: **REJECT**

Defects: **3 critical, 3 major, 3 minor**

| ID | Severity | Grounded defect |
|---|---|---|
| SAFE001-ESCAPE-01 | critical | `.campaign` is in the guard allowlist, so worker absolute-path writes can alter controller records/leases. |
| SAFE001-LEASE-01 | critical | heartbeat failure is swallowed and the worker keeps running without lease authority. |
| SAFE001-ESCAPE-02 | critical | guards lift after parent exit without proving detached descendants are dead. |
| SAFE001-LEASE-02 | major | expired-lease reclaim is non-atomic. |
| SAFE001-TOCTOU-01 | major | staged integration content is not revalidated immediately before publication. |
| SAFE001-ESCAPE-03 | major | external hardlinks can bypass workspace journal boundaries. |
| SAFE001-ESCAPE-04 | minor | NTFS ADS is not enumerated by the journal walker. |
| SAFE001-VALIDATE-01 | minor | evidence-path uniqueness is not enforced. |
| SAFE001-VALIDATE-02 | minor | continuation heartbeat accepts non-date strings. |

Kimi/OpenCode produced no verdict because the account balance was insufficient. It is not a
reviewer and is not counted.

## Review B — requested Fable 5 max; served-model drift observed

Terminal session: `25406693-e2c8-49cb-b6e9-a2ceaca35b53`

Command result: delivered full review, then exited `error_max_budget_usd` at $5.2078

Model evidence: initialization reported `claude-fable-5`; final review message was served as
`claude-opus-4-8` while its self-authored JSON said Fable. This identity mismatch is exactly why
model/session identity must come from controller envelopes rather than reviewer prose.

Verdict: **REJECT**

Defects: **2 critical, 6 major**, plus nonblocking validator/ACL-heal findings

| ID | Severity | Grounded defect |
|---|---|---|
| SAFE001-CONTAINMENT-01 | critical | worker can derive and write the unguarded control root, defeating leases/run/snapshot/integration records. |
| SAFE001-CONTAINMENT-02 | critical | same-user owner retains ACL authority and can remove the deny ACE before writing. |
| SAFE001-CONTAINMENT-03 | major | watch-only detection cannot restore destroyed uncommitted bytes and cannot qualify as prevention. |
| SAFE001-CONTAINMENT-04 | major | normal parent exit leaves detached descendants alive after guards lift. |
| SAFE001-CONTAINMENT-05 | major | auto-selected Git porcelain watch is blind to ignored live paths such as build/dist/control/evidence. |
| SAFE001-LEASE-01 | major | concurrent stale reclaim plus swallowed `LEASE_LOST` permits two writers. |
| SAFE001-INTEGRATION-01 | major | multi-file rename loop can crash half-applied without a final report or recovery. |
| SAFE001-INTEGRATION-02 | major | unnormalized output paths can escape live root if controller records are forged/consumed. |

Additional nonblocking findings still require fixtures: lifting the guard removes all deny ACEs for
the user (including pre-existing ones); submission source/candidate hashes are format-checked rather
than recomputed; ADS/junction/case/long-path behavior is unproved. After the controller schemas were
hardened, the old 44/44 suite still passed unchanged, proving it does not test runtime-validator /
source-schema parity; the repair must make that drift a hard failure.

## Controller disposition

The original 44/44 fixture result remains useful but is defeated. The repair authority is
`design/production/packets/SAFE-001-REPAIR.md`. It must cover every unioned defect above with a bad
fixture and a valid control, then obtain two fresh cross-family reviews whose controller envelopes,
served models, sessions, candidate hash, and verdict artifact hashes all validate. Until then:

- SAFE-001 is `REJECTED`, not “mostly complete.”
- No auto-approved terminal worker mutates SpaceFace through this runner.
- No current isolated candidate is integrated through its integrator.
- These advisory reviews block acceptance but do not satisfy acceptance quorum.
