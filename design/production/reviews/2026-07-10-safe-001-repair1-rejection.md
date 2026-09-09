# SAFE-001 repair-1 — blind review rejection record

**Date:** 2026-07-10
**Candidate:** `618dcb21184a7c472571e1d811f9ffff8862682d54596ec426ddd4323b40e852`
**Disposition:** REJECTED → repair-2
**Consequence:** autonomous terminal-worker mutation remains disabled

## Reviews obtained

| Reviewer | Family | Verdict | Envelope | Notes |
|---|---|---|---|---|
| grok-4.5 (grok CLI, plan mode, `--json-schema`-free) | xAI | **REJECT** | session `019f4d0e-2c2d-7e61-b915-e1dc5f44e0ca`, hash-bound, code-specific file:line citations | acceptance-valid REVIEW (engaged the real mechanism); payload `.campaign/SAFE-001/review2-grok-payload.json` |
| agy "Gemini 3.5 Pro" (agy CLI, plan mode) | Google | **NO VERDICT** | — | agent hung waiting on a phantom background task, timed out, produced 355 bytes with no JSON payload. Does not count. Re-dispatch on repair-2. |

Served-model note (per CAP-000 + prior drift record): neither CLI emits machine-verifiable
served-model metadata (agy has no JSON output; grok does not echo the configured model). Model
identity for grok's review is therefore controller-derived from what was observed and controlled:
invocation flag `--model grok-4.5`, session id above, exit 0, empty stderr. This is recorded as
evidence, not trusted from reviewer prose.

## Grounded defects (grok-4.5) — all verified against mechanism code

### CRITICAL

- **SAFE001R-HEAL-01** (technical) — Guard-heal journal is worker-writable and trust-on-read.
  `.campaign` is ACL-allowed (never OS-denied to the same-user worker); the control watch excludes
  the entire `guards/` subtree; the worker derives `.campaign/guards/<runId>.json` from
  `SF_WORKSPACE`+`SF_RUN_ID`; mid-run tamper detection uses the in-memory `aclRecord` so on-disk
  poison is invisible; on every exit `liftAclGuard` **re-reads** the journal and applies its
  `preSddl` via `setSddl`. A worker rewrites `preSddl` (or `healedAt`) → the runner applies
  attacker-controlled SDDLs to the live root on lift, or DoS-locks it. **VERIFIED** against
  `guard.mjs:35,88-89,164-184,318` and `run-agent.mjs:266,285,375-398`. F21 only tests a clean
  journal, so it misses this.
- **SAFE001R-CTRL-01** (technical) — Same root cause: `.campaign` OS-writable + over-broad watch
  exclusions let a worker write control-plane subtrees that matter (esp. `guards/`).

### MAJOR

- **SAFE001R-RECOVER-01** (runtime) — `recoverIntegration` renames staged files onto the live tree
  with **no mutation lease**, and runs on every runner start + `--heal`, before the runner's own
  lease. Concurrent recovery/integrator can race live publishes. (`integrate.mjs:247-250`;
  `run-agent.mjs:280-284`.)
- **SAFE001R-REALPATH-01** (technical) — Claimed realpath containment is **dead code**
  (`realCaseless` never called, `integrate.mjs:24-27`); `containedDestination` only string-prefixes
  `path.resolve`. A junction/symlink under the live root can redirect a publish outside it.
- **SAFE001R-POSIX-01** (runtime) — Posix descendant containment returns `contained:true` after one
  `process.kill(-rootPid)` with **no survivor verification** (`run-agent.mjs:151-154`); double-fork/
  `setsid` escapes a process-group kill. Fail-closed job path is Windows-only.
- **SAFE001R-ADS-01** (technical) — Journal walker uses `readdir`/`lstat` only and never enumerates
  NTFS alternate data streams; a worker can attach an ADS to an allowlisted output without changing
  the primary-stream hash. Path-colon checks catch only explicit `:` in walked names.

### MINOR

- **SAFE001R-WATCHMODE-01** (operational) — `--guard watch` and `--guard none` remain usable for
  `code_mutation`/`blender_mutation`, disabling prevention (and, for `none`, the control watch).
- **SAFE001R-PARITY-01** (quality) — F20 soft-skips when Ajv is unavailable rather than hard-failing.

## Required next evidence (grok) — folded into repair-2 fixtures

1. Hostile fixture: worker rewrites `guards/<runId>.json` `preSddl` then exits; assert lift does not
   apply worker SDDL and control-watch latches the guards write.
2. Hostile fixture: concurrent `recoverIntegration` vs `integrateCandidate` without exclusive lease
   fails closed.
3. Hostile fixture: liveRoot junction/symlink escape blocked by realpath containment.
4. Hostile fixture: ADS-only mutation rejected by the journal walker.
5. Posix: detached `setsid` daemon survivors fail containment closed.

## Controller disposition

Repair-2 must close all eight defects in mechanism code (not just fixtures) and add a hostile
fixture with a valid control for each of the five required-next items. A **new** candidateHash is
minted after the repair; the two fresh cross-family reviews must be re-run against that hash. Until
an accepted repair exists, no auto-approved terminal worker mutates SpaceFace through this runner.
