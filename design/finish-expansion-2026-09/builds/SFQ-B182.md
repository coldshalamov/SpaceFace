# SFQ-B182 — Make each weapon family visibly distinct

**Kind:** build-plan candidate. **State:** NOT ADMITTED. **Scope:** CORE_FINISH_OR_EXISTING_OUTCOME_REVALIDATION.

Program: [SFQ-P19 — Force-readable VFX with materially distinct lifecycles](../programs/19-vfx.md). Native owner search: PQ-134 / PQ-139 / current material VFX owners; effect briefs F01–F32.

## Player outcome

A player recognizes a shove, coherent beam, ballistic hit and reactive material by motion and shape.

## Current-reality check

The current VFX standard explicitly rejects both generic ball-puffs and thin/frozen wire effects. It calls for substantial evolving material, unequal motion, local contact and persistent cooling. These tasks refine existing owners, not install another VFX engine.

Source context: [S01](../audit/SOURCES.md#s01), [S13](../audit/SOURCES.md#s13), [S21](../audit/SOURCES.md#s21). Reproduce the relevant current ordinary route. Reuse already-true work and retire stale active wording rather than rebuilding it.

## Preconditions and ownership

Package prerequisite outcomes: [SFQ-B001](SFQ-B001.md). These may already be implemented; verify their behavior rather than treating their local IDs as a sequential to-do list.

Candidate owner paths: `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`, `src/render/vfx.js`, `src/render/actionVfx.js`, `src/render/vfxProfiles.js`, `src/render/bombPresentation.js`, `src/render/vfx/statusMatterVfx.js`. Resolve current selected functions and exact write boundaries during native adoption. A directory or old path is not an implementation contract.

## Implementation plan

Use F04–F09 to differentiate contact, carried body, internal flow and termination in existing owners.

First trace the existing input/operation path and define the observable change. Implement it inside the current owner, then wire only the missing acquisition, feedback and persistent-state links that the outcome requires. Preserve single writers and deliberate nonphysical opt-outs. Include the relevant model/effect/audio changes before claiming satisfaction.

## Ordinary scenes and production dependencies

[M19](../missions/M19.md), [M23](../missions/M23.md), [M33](../missions/M33.md). These briefs link their exact model and VFX/audio families. Reuse a current equivalent scene when it already asks the same physical question; no duplicate mission is required to validate a systemic fix.

## Acceptance

The family remains identifiable without hue and with bloom disabled; repeated shots vary without changing gameplay.

Use the [scenario matrix](../quality/01_SCENARIO_MATRIX.md) for positive, negative and lifecycle cases. Run current relevant checks, and inspect actual moving/sounding gameplay for presentation changes. Save/transaction work needs repeated and interrupted cases, not only the happy path. Report only evidence actually obtained.

## Refuse and stop

No recolored common projectile or all-effects ribbon recipe.

If the current outcome is already good, map this candidate to that evidence and select a genuinely useful next unit. If the idea is optional and cannot earn its cost, defer it without holding the finish hostage. No parallel framework or queue.

## Handoff

Current native ID, exact changed paths, player-visible result, focused checks, ordinary route actually exercised, independent review result, remaining concrete risk and next safe unit. Update current native status only; this static card is not a completion ledger.
