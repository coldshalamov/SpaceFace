# Primary natural-route source validator note

**Slice:** extend `scripts/lib/naturalRoute.mjs` with primary-only static source check.

## What landed

| Export | Role |
|---|---|
| `validateNaturalRouteSources` | Unchanged base fail-closed table (bus inject / teleport / mode writes). Used by Tier-A driver and supporting paths as before. |
| `PRIMARY_NATURAL_ROUTE_FORBIDDEN` | Primary **delta** patterns |
| `validatePrimaryNaturalRouteSources` | Base table + primary delta |

Primary delta fails closed when harness sources contain:

- `surfaceAuthoredPrimaryCarrier`
- `moduleInventory.push` (scan/module inventory inject)
- `_surfaceCanonicalRumor`
- `_onChoose`
- (also `scanRequirement` special-case inject)

## Supporting vs primary

- **Supporting** (e.g. `npm run check:depth-program:r2:natural-d10`) may still use **CI seeds** (`D10_CI_SEEDS` / `ciSeedsFor`) and controlled injects for state-machine regression. It does **not** call `validatePrimaryNaturalRouteSources`.
- **Primary** acceptance must use held-out seeds and public earn paths. When present, `scripts/lib/primaryNaturalRouteContract.mjs` wraps this export as `validatePrimaryHarnessSources` and adds seed-policy (no `D10_CI_SEEDS` as `MATRIX_SEEDS`).

## Gates (local)

```
node scripts/lib/naturalRoute.mjs
npm run check:depth-program:r2:natural-d10
```

No commit in this slice.
