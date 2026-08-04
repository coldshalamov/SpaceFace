<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-023
leafId: PQ-023.station-side-event-vfx
acceptance: focused_green
disposition: PASS
candidateCommit: 48e0bc74ec8ef4a75b144e9e8d8023b8072ebb46
-->

# PQ-023 station-side operation VFX receipt

```yaml
packet: PQ-023
dispatchUnit: PQ-023.station-side-event-vfx
candidateCommit: 48e0bc74ec8ef4a75b144e9e8d8023b8072ebb46
acceptance: focused_green
routeAcceptanceClaimed: false
nativePerformanceClaimed: false
headedLaunches: 0
```

## Outcome

The existing seeded station director already emitted four ordinary-world operations, but the render
route had no `station:sideEvent` consumer. The live VFX system now renders all four through one
fixed-capacity service using existing instanced sprite and trail substrates:

| Event | Non-color read |
|---|---|
| `hauler_dock` | paired heavy cargo rails and a dock lamp |
| `patrol_launch` | chevron strokes and a drive trace bound to the real patrol entity |
| `repair_drone` | crawler body, cooling stitch row, and accessibility-governed weld point |
| `cargo_tractor` | tractor, paired cargo pod rails, and a visible load-bearing tether |

The service owns six reusable records, updates active poses at 12 Hz, sleeps when empty, culls beyond
1,500 world units, deduplicates event IDs, expires records, and clears at sector/save boundaries.
Reduced motion retains static readable poses; weld flashes pass through the existing `SPR_FLASH`
accessibility policy.

## Adversarial corrections

Review found three real gaps before integration:

1. A destroyed real patrol could fall back to a cosmetic path and become a ghost. Bound patrol
   records now retire immediately when their entity is absent, dead, or pose-less.
2. Fabricated unit payloads did not prove the producer/consumer seam. A regression now drives the
   real `stationSideEventDirector._fire` payload into initialized VFX and proves the four-part cargo
   tractor composition.
3. The repair test stubbed the sprite allocator and therefore bypassed flash policy. It now inspects
   the real pooled `SPR_FLASH` record and proves reduced opacity and footprint.

## Focused evidence

- `node --test test/station-side-event-vfx.test.mjs`: **6/6 PASS** in 348 ms.
- `npm run check:station-side-events`: **PASS**.
- `npm run check:vfx-sleep`: **PASS**; idle mean **0.01711 ms** against the 0.25 ms ceiling.
- `git diff --check`: **PASS** before integration.

One initial focused correction run exposed only an incorrect test-side pool property name (`_s`);
the test was redirected to the real `_spr` pool and the same focused file was rerun. No Browser,
Electron, GPU, route, or broad-baseline evidence was spent.

## Boundaries

This closes the missing renderer seam and its deterministic lifecycle/accessibility contract. It
does not claim a headed art verdict, native frame-time gain, or a new simulation feature; event
occurrence, budgets, paths, and real patrol entities remain owned by the existing seeded director.
