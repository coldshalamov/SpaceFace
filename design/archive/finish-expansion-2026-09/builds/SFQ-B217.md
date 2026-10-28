# SFQ-B217 — Close asset lifetime leaks

**Kind:** build-plan candidate. **State:** NOT ADMITTED. **Scope:** CORE_FINISH_OR_EXISTING_OUTCOME_REVALIDATION.

Program: [SFQ-P22 — Smoothness, residency and predictable work](../programs/22-performance.md). Native owner search: Current PERF_BUDGET / VM_LANES / D24–D36 and existing performance owners.

## Player outcome

Repeated travel/load/refit does not retain dead generations or GPU resources.

## Current-reality check

This audit did not measure frame time. Existing logs describe historical latency and resource issues, some already fixed pending validation. First reproduce the current route and attribute the cost; do not copy old perf diagnoses as new facts.

Source context: [S01](../audit/SOURCES.md#s01), [S08](../audit/SOURCES.md#s08), [S14](../audit/SOURCES.md#s14), [S20](../audit/SOURCES.md#s20), [S21](../audit/SOURCES.md#s21), [S22](../audit/SOURCES.md#s22). Reproduce the relevant current ordinary route. Reuse already-true work and retire stale active wording rather than rebuilding it.

## Preconditions and ownership

Package prerequisite outcomes: [SFQ-B001](SFQ-B001.md). These may already be implemented; verify their behavior rather than treating their local IDs as a sequential to-do list.

Candidate owner paths: `src/core/registry.js`, `src/core/loop.js`, `src/core/perfRuntime.js`, `src/render/renderer.js`, `src/render/precompile.js`, `src/render/assetLoader.js`. Resolve current selected functions and exact write boundaries during native adoption. A directory or old path is not an implementation contract.

## Implementation plan

Reproduce current D24-style route using actual loader/residency owners; inspect retaining paths and fix only demonstrated leaks.

First trace the existing input/operation path and define the observable change. Implement it inside the current owner, then wire only the missing acquisition, feedback and persistent-state links that the outcome requires. Preserve single writers and deliberate nonphysical opt-outs. Include the relevant model/effect/audio changes before claiming satisfaction.

## Ordinary scenes and production dependencies

[M19](../missions/M19.md), [M21](../missions/M21.md), [M36](../missions/M36.md). These briefs link their exact model and VFX/audio families. Reuse a current equivalent scene when it already asks the same physical question; no duplicate mission is required to validate a systemic fix.

## Acceptance

Repeated cycles plateau after expected caches, with source-generation ownership intact and no visible unloads.

Use the [scenario matrix](../quality/01_SCENARIO_MATRIX.md) for positive, negative and lifecycle cases. Run current relevant checks, and inspect actual moving/sounding gameplay for presentation changes. Save/transaction work needs repeated and interrupted cases, not only the happy path. Report only evidence actually obtained.

## Refuse and stop

No declaring an old fixed-pending-soak issue unfixed or clearing all caches constantly.

If the current outcome is already good, map this candidate to that evidence and select a genuinely useful next unit. If the idea is optional and cannot earn its cost, defer it without holding the finish hostage. No parallel framework or queue.

## Handoff

Current native ID, exact changed paths, player-visible result, focused checks, ordinary route actually exercised, independent review result, remaining concrete risk and next safe unit. Update current native status only; this static card is not a completion ledger.
