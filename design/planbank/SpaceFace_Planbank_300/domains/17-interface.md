# 17 — Functional ORRERY workflows, comprehension and accessibility

**Current lane:** THE INSTRUMENT — functional integration, not parallel redesign  
**Build-map connections:** Current ORRERY direction; PQ-163, PQ-164, PQ-165  
**15 proposed packets:** SF-241–SF-255

## Existing foundation, not a blank slate

ORRERY is the current visual authority. The lane owns redesign; minimal task-required functional UI changes are explicitly allowed. Do not revive retired generic card/table or printed-material visual briefs.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Screens compose existing ORRERY library elements. UI reads sim state and emits intents; no credits/cargo/physics writes. Preserve focus, pause ownership, remaps and reduced-motion semantics. Foreign dirty exact paths stay protected.

## Reusable implementation workflow

1. Read the live screen and its ORRERY primitives. Trace the user task to its canonical command/receipt, noting existing behavior before adding controls.
2. Specify information hierarchy, selection, confirmation, pending, refusal, success and return states. Add only information needed for the decision; do not redesign the surrounding screen.
3. Reuse the Hand, scales, arcs and current focus system. Update on meaningful state changes and keep layout/style work out of per-frame hot paths.
4. Make the action transactional: disable/announce pending state, handle stale data and restore focus to a valid target on close or removal.
5. Test empty/full/long content, remapped input, high DPI/viewport changes, reduced motion and an entity/item disappearing mid-selection. Walk every changed control.
6. Use current ui-bench shot IDs discovered from its manifest and inspect the real screen over the game. A mocked DOM route or unviewed PNG does not establish visual acceptance.

## Ordinary-route proof

Perform the named task from a normal screen entry using pointer and keyboard/controller focus, cancel it, reopen it and complete it while state changes underneath.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-14: Ui Ux Onboarding And Information](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-14_UI_UX_ONBOARDING_AND_INFORMATION.md)
- [WF-07: Progression Ships Builds And Infrastructure](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-241 — A trade confirmation that cannot lie about quantity](../plans/17-interface/SF-241-a-trade-confirmation-that-cannot-lie-about-quantity.md) — deepening
- [SF-242 — Shipworks explains a real capability tradeoff](../plans/17-interface/SF-242-shipworks-explains-a-real-capability-tradeoff.md) — deepening
- [SF-243 — Cargo custody visible at a transfer decision](../plans/17-interface/SF-243-cargo-custody-visible-at-a-transfer-decision.md) — deepening
- [SF-244 — A local-map selection that survives entity replacement](../plans/17-interface/SF-244-a-local-map-selection-that-survives-entity-replacement.md) — deepening
- [SF-245 — The map distinguishes a rumor from a route](../plans/17-interface/SF-245-the-map-distinguishes-a-rumor-from-a-route.md) — deepening
- [SF-246 — Mission progress points at the actual next action](../plans/17-interface/SF-246-mission-progress-points-at-the-actual-next-action.md) — deepening
- [SF-247 — Remapped controls appear at the moment of use](../plans/17-interface/SF-247-remapped-controls-appear-at-the-moment-of-use.md) — deepening
- [SF-248 — Focus returns to a meaningful place after a modal](../plans/17-interface/SF-248-focus-returns-to-a-meaningful-place-after-a-modal.md) — deepening
- [SF-249 — Disabled controls explain the missing condition](../plans/17-interface/SF-249-disabled-controls-explain-the-missing-condition.md) — deepening
- [SF-250 — A damaged ship remains readable without color](../plans/17-interface/SF-250-a-damaged-ship-remains-readable-without-color.md) — deepening
- [SF-251 — A draft choice explains what happens to the current fit](../plans/17-interface/SF-251-a-draft-choice-explains-what-happens-to-the-current-fit.md) — deepening
- [SF-252 — An alert that offers a usable recovery action](../plans/17-interface/SF-252-an-alert-that-offers-a-usable-recovery-action.md) — deepening
- [SF-253 — A long-content screen stays operable at small viewports](../plans/17-interface/SF-253-a-long-content-screen-stays-operable-at-small-viewports.md) — deepening
- [SF-254 — Reduced motion preserves mechanical timing](../plans/17-interface/SF-254-reduced-motion-preserves-mechanical-timing.md) — deepening
- [SF-255 — One functional UI change closes on the real player route](../plans/17-interface/SF-255-one-functional-ui-change-closes-on-the-real-player-route.md) — deepening

## Owner reading map

- [`src/ui/orrery`](https://github.com/coldshalamov/SpaceFace/tree/c92756afb46a9115d47e9d1757369678023efce4/src/ui/orrery)
- [`src/ui/station/screens/market.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/station/screens/market.js)
- [`src/ui/station/screens/shipworks.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/station/screens/shipworks.js)
- [`src/ui/screens/localmap.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/screens/localmap.js)
- [`src/ui/screenManager.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/screenManager.js)
- [`src/ui/hud.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/hud.js)
- [`src/ui/controlPrompts.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/controlPrompts.js)
- [`src/ui/accessibility.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/accessibility.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
