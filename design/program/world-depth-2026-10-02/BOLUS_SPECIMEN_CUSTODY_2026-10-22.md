# Bolus finite-specimen custody

## Outcome and scope

Four authored bezoars and one Milk Cyst preserve bounded physical custody across Save/Continue and world-owned residency retirement. The change uses existing ecology-sector state and keeps the original authored specimens. It does not add bodies, collectible units, rewards, geometry, AI, native-physics writes, or changes to world or Save engines. Existing Loose Rib continuity and geometry remain intact.

## Behavior and safeguards

Each specimen is tracked by a stable key in existing ecology-sector flags. Save state contains bounded pose, velocity, hull, provenance and terminal custody data, not native handles. Capture observes validated native state read-only. Specimens never drive native motion.

Identity and home-sector checks prevent recycled, retagged or mismatched runtime objects from taking custody. Missing or malformed state is handled conservatively; malformed rows quarantine only the corresponding specimen. Loss and unavailable states remain terminal for the current run/save, preventing accidental rematerialization. New Game and actual Save restore follow existing lifecycle boundaries. Rewards remain independent of anatomical custody.

The existing rib return contract is unchanged. The test fixture uses an explicitly authorized any-target damage API for terminal-destruction coverage; default weapons still reject fauna, and no weapon-damageability claim is made.

## Validation

- Exact public PR source regression: 75/75 named tests passed, including 9 new specimen-custody cases and 66 existing cases.
- Named Save-envelope gate: 26/26 passed; these checks overlap the regression and are not additional distinct coverage.
- Independent review: 24/24 targeted continuity/specimen/geometry checks and 2/2 Save-envelope checks passed, with additional edge checks for terminal latching, duplicate prevention and inherited-record rejection.
- The candidate dependencies were reconciled to the exact public PR source before these final runs.

Focused command used for the named regression:

```sh
NODE_DISABLE_COMPILE_CACHE=1 node --preserve-symlinks --preserve-symlinks-main --test test/bolus-specimen-custody.test.mjs test/bolus-rib-continuity.test.mjs test/bolus-rib-geometry.test.mjs test/bolus-cut.test.mjs test/bolus-lore.test.mjs test/bolus-play.test.mjs test/bolus-render-lifetime.test.mjs test/sfq-b122-fauna-motion.test.mjs test/sfq-b175-fauna-body-expression.test.mjs test/save-envelope-fidelity.test.mjs
```

## Evidence limits

The checks exercise native/API fixtures and Save/residency boundaries. They do not establish ordinary in-game flight, protected-tether gate crossing, phone or live-camera presentation, player comprehension, or exact whole-world native snapshot acceptance. Existing whole-world restore may still use scalar fallback with `identity_or_contract_changed`; that separate limitation is not changed by this increment. No browser, phone, or newly changed visual asset is part of this increment.
