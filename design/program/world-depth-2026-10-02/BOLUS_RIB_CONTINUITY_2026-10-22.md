# Loose Rib continuity across sector returns

## What changed

Loose Rib now preserves each original rib's native local pose and motion in bounded, versioned ecology-sector state. The record survives Save/Continue and sector retirement/return. Capture uses guarded, read-only access to validated native state; restoration happens when the body is constructed, not by writing live native physics state. Historical lodged behavior remains a one-time stop while allowing later towing. Explicit legacy migration, unavailable-state handling, and terminal destruction are covered. This increment does not change physics setters, geometry, radius, mass, rewards, or timing.

## Validation

- Focused continuity suite: 30/30 passing.
- Updated Save-envelope gate target pair: 11/11 passing, including the existing fidelity test and the new continuity suite.
- Independent lifecycle review: 6/6 targeted checks passing.
- Relative ESM dependency audit: 1,534 dependencies inspected, zero unauthorized overrides.

Commands used:

```sh
NODE_DISABLE_COMPILE_CACHE=1 node --preserve-symlinks --preserve-symlinks-main --test test/bolus-rib-continuity.test.mjs
NODE_DISABLE_COMPILE_CACHE=1 node --preserve-symlinks --preserve-symlinks-main --test test/save-envelope-fidelity.test.mjs test/bolus-rib-continuity.test.mjs
```

## Limits and next check

A whole-world native snapshot restore on the exact public baseline also falls back with `identity_or_contract_changed`; exact whole-world native snapshot restoration is not claimed. These headless and lifecycle checks do not establish ordinary gate-flight behavior, live camera framing, phone visuals, or player comprehension. Next, validate a normal gate flight and sector departure/return in-game, then inspect camera and phone presentation before making visual or full-game acceptance claims.
