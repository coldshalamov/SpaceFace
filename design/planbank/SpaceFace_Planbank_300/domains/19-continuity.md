# 19 — Save continuity, interruption safety and durable player trust

**Current lane:** THE MACHINE / THE HAND / THE LONG GAME  
**Build-map connections:** PQ-164, PQ-165, PQ-186; CV-SO  
**15 proposed packets:** SF-271–SF-285

## Existing foundation, not a blank slate

Save import already validates before destructive restore and enforces bounds. Current transitions use branded/latest-wins ownership; nav and world records have stable identity helpers. Continuity plans strengthen edge paths instead of replacing this architecture.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Preserve atomic restore, settings normalization, transient request ownership and one shared Browser/Electron game path. Never use the real player save directory in tests or loosen import safety to accept malformed data.

## Reusable implementation workflow

1. Map persistent versus transient fields and their sole owners. Read existing migration/restore sequencing and current tests before adding any new saved field.
2. Specify the interrupted state, the intended recovery and the exact loser/winner semantics for concurrent requests. Prefer reconstructible derived state to serialization.
3. Implement candidate validation and idempotent commit/cleanup through the existing owner. Preserve previous live state until a new restore is valid.
4. Restore user-facing context such as selected destination and actionable refusal without replaying expired one-shot effects or stale held input.
5. Test malformed/old saves, interleaved transitions, destroyed/recycled entity IDs, storage refusal and repeated resume in isolated slots. Verify exact resources and receipts.
6. Complete the route through Browser and the same game path used by Electron where available. Report untested shell behavior honestly; no separate gameplay logic is allowed.

## Ordinary-route proof

Perform the actual player action, interrupt at its meaningful boundary, load or resume through normal entry, then continue the same task without duplicate rewards or lost input.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-18: Design Recovery And Simplification](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-18_DESIGN_RECOVERY_AND_SIMPLIFICATION.md)
- [WF-19: Technical Production And Performance Scaling](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-19_TECHNICAL_PRODUCTION_AND_PERFORMANCE_SCALING.md)
- [WF-14: Ui Ux Onboarding And Information](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-14_UI_UX_ONBOARDING_AND_INFORMATION.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-271 — Latest valid route wins an interleaved load](../plans/19-continuity/SF-271-latest-valid-route-wins-an-interleaved-load.md) — deepening
- [SF-272 — A rejected save leaves the current game intact](../plans/19-continuity/SF-272-a-rejected-save-leaves-the-current-game-intact.md) — deepening
- [SF-273 — An interrupted cargo handoff conserves the same lot](../plans/19-continuity/SF-273-an-interrupted-cargo-handoff-conserves-the-same-lot.md) — deepening
- [SF-274 — Site reconstruction preserves work, not stale machinery phases](../plans/19-continuity/SF-274-site-reconstruction-preserves-work-not-stale-machinery-phases.md) — deepening
- [SF-275 — Pause requests release only their own hold](../plans/19-continuity/SF-275-pause-requests-release-only-their-own-hold.md) — deepening
- [SF-276 — Focus loss cannot leave a weapon or helm held](../plans/19-continuity/SF-276-focus-loss-cannot-leave-a-weapon-or-helm-held.md) — deepening
- [SF-277 — Durable navigation does not target a recycled entity](../plans/19-continuity/SF-277-durable-navigation-does-not-target-a-recycled-entity.md) — deepening
- [SF-278 — Once-only rewards survive repeated resume](../plans/19-continuity/SF-278-once-only-rewards-survive-repeated-resume.md) — deepening
- [SF-279 — Destruction clears attachments before identity can be reused](../plans/19-continuity/SF-279-destruction-clears-attachments-before-identity-can-be-reused.md) — deepening
- [SF-280 — Old saves migrate a new feature without inventing progress](../plans/19-continuity/SF-280-old-saves-migrate-a-new-feature-without-inventing-progress.md) — deepening
- [SF-281 — A failed save is visible without destroying the previous slot](../plans/19-continuity/SF-281-a-failed-save-is-visible-without-destroying-the-previous-slot.md) — deepening
- [SF-282 — Shared Browser and Electron continuation stays one game](../plans/19-continuity/SF-282-shared-browser-and-electron-continuation-stays-one-game.md) — deepening
- [SF-283 — Restoring a scene does not replay yesterday's spectacle](../plans/19-continuity/SF-283-restoring-a-scene-does-not-replay-yesterday-s-spectacle.md) — deepening
- [SF-284 — Save bounds preserve important world consequences](../plans/19-continuity/SF-284-save-bounds-preserve-important-world-consequences.md) — deepening
- [SF-285 — An interrupted failure leads back to a playable recovery](../plans/19-continuity/SF-285-an-interrupted-failure-leads-back-to-a-playable-recovery.md) — deepening

## Owner reading map

- [`src/save/saveSystem.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/save/saveSystem.js)
- [`src/save/migrations.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/save/migrations.js)
- [`src/core/runTransitionGuard.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/runTransitionGuard.js)
- [`src/core/timeEffects.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/timeEffects.js)
- [`src/ui/screenManager.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/screenManager.js)
- [`src/systems/input.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/input.js)
- [`src/systems/worldSiteRuntime.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/worldSiteRuntime.js)
- [`src/core/entity.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/core/entity.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
