# Tethys: one finite shipment, a physical Quiet Cache meeting

Base: public `0ebaf5d32603707ba765498e6c8c7b5c8eea2eb1`.

## Change

The existing eight-actor checkpoint/watch/cache/pursuit/logyard story remains. A genuinely fresh original runner now receives an explicitly authored six-unit stolen-goods manifest: three for the exchange, three retained for the later jettison. This is new inventory design, not a claim that historical saves contained six units or that a duplication exploit was demonstrated.

The canonical cargoManifest is the only stock authority. Core staged publication commits each one-unit debit before publication observers can see the physical pickup. True admission refusal retains stock; a committed pickup that is immediately destroyed remains spent. Durable phase-completion flags prevent replay from reallocating retained reserve. Refused exchange units stay aboard, including after the three-unit jettison. No parallel quantity counter or flat cargo bag was added.

Original stable hull/record/row identity and live-object checks reject recycled, relinquished, duplicate or malformed actors. A per-original-hull runtime guard spans both portions. Ordinary cargo acceptance and civilian manifest death spill use the same remaining manifest.

Two existing job-controlled hulls converge at separate positions beside the authored Quiet Cache. An ops-local recommission keeps the runner's original hauler circuit from dropping into ambient smuggler flight between terminal jobs. Existing physical feedback, lease and FLEE ownership remain authoritative; no actor pose or velocity writes were added. Failed job assignment restores only still-owned prior jobs. Restored original cast identity is rebound without spawning or reseeding; saved FLEE/lease states defer that rebind until normal release.

The shared scratch actor-lookup alias was reproduced against the exact public handoff method and fixed by retaining actual entity/record references. The old handoff used the keeper for both endpoints, so all three exchange pickups appeared there; this was a placement defect, not proof of infinite inventory exploitation.

## Evidence

- Existing intended three-plus-three regression passes unchanged.
- Focused finite tests cover refusal, cross-phase reentry, observer errors, committed-stage exceptions, synchronous ordinary death spill, identity loss, malformed/empty stock, world-record roundtrip, ordinary cargo acceptance, partial job refusal and post-release ownership replacement.
- Actual Save envelope serialize -> JSON -> public load API covers before exchange, partial refusal, after pickup, and empty stock. One partial case also loads `sf.save.quick` from RAM through the ordinary slot wrapper. The same cases exercise real world.enterSector soft and hard returns. All eight authored identities rebind. This is owner-level restore proof, not browser/menu Continue coverage.
- Selected native Rapier owners, in production relative ordering, physically produce three exchange pods at 125.10s and three reserve pods at 163.10s. Both original hulls are within 98 WU of Quiet Cache at exchange, speeds about 0.28 WU/s. Minimum radius-envelope margin is 4.007 WU.
- Each hull has nine actual native colliders. Rapier contactShape checks against the live pickup's authoritative collection sphere give minimum separation 7.365 WU and no overlap. Pickups are not SG02 rigid bodies; this is not a claim about nonexistent pod contact manifolds. Visible role assets differ from native collision skins and are reviewed separately.

## Qualification

Local execution overlays exact pinned public owners on an archived supporting module graph. It is not a full checkout of the public head, full production boot, or browser playtest. The native fixture includes the authored cast, station anchors and actual movement owners, not every world prop/system. Exact-tree hosted validation remains the publisher's responsibility.

The ordinary world-record cap discriminator refuses an uncaptured original and clears its identity; the finite emitter then fails closed without refilling the live manifest. Conservation is scoped to the original hull and its supported durable record. Existing record expiry can eventually forget an origin; no new global stock ledger or eternal identity guarantee is claimed.

The initial public-base return probe exposed a swallowed EventBus ReferenceError: `stationName` was missing from the extracted trafficJobOps import. A separately reviewed one-name import repair is included. The same actual return probe now explicitly observes logged ReferenceErrors, so a green custody assertion cannot conceal that failure. The original red evidence is retained; no courier behavior was changed.

`cargo_moved` remains an internal anti-softlock exchange-window seed, not a successful transfer receipt. Its only inspected downstream consumer is the pursuit prerequisite. Cycle news now reports a tense watch rather than falsely claiming a cargo dump on refusal/interruption. Existing timings and generic chain semantics are unchanged.

## Reproduction

The private recovery package includes exact source/patch representations, REVIEW-PINS.json, compressed public dependencies, and native-check.py. It loads the selected public owners in RAM and performs no canonical source edits.

- `node baseline-alias-repro.mjs`
- `TETHYS_TEST_PATTERN='finite Tethys' python native-check.py`
- `TETHYS_NATIVE=1 TETHYS_TEST_PATTERN='native Tethys physical' python native-check.py`
- `TETHYS_TEST_PATTERN='Tethys|TETHYS|handoff|runner|lookup' python native-check.py`

Production changes: trafficCausalChainOps.js; one genuine fresh-spawn initializer call in traffic.js; the two-original-slot target adapter in npcJobsRuntime.js; truthful Tethys cycle text/comments in sectorCausalChains.js; the missing stationName import in trafficJobOps.js. The adjacent authored-materialization ownership guard must be preserved during integration. No unrelated owner implementation is included.

## Exact-tree follow-up gates

Public package.json blob `51e0b8913eaff92bd7c39ac5dacb1d874fb6592e` defines `npm run check:npc-jobs`, `npm run check:save-schema`, and `npm run check:src-syntax`. These are relevant integration gates, not locally claimed results. The bounded new gameplay gate is `node --test --test-name-pattern='Tethys|TETHYS|handoff|runner|lookup' test/tethys-finite-shipment.test.mjs test/tethys-native-clearance.test.mjs test/traffic-sector-causal-chain.test.mjs`. No broad check run is represented as completed.

## Sealed result

At the final import-repaired source/test pins, one combined selected-owner batch passed **26/26**, with zero logged stationName ReferenceErrors. It includes the original three-plus-three and cycle-news regressions, the actual Save-envelope/one-RAM-slot matrix and soft/hard returns, and the native physical route/shape checks. Final compressed stdout SHA-256: `05c8fb3351af065b53ade44c84d83febded3e88707eaf4ded481afc0d83a7b3c`.

The import-negative discriminator uses `TETHYS_JOB_BASELINE=1 TETHYS_TEST_PATTERN='public Save envelope API' python native-check.py`; it fails the actual logged-error assertion (one swallowed ReferenceError, expected zero). This preserves the baseline failure instead of weakening the regression.

Independent final review at 2026-10-24 08:16:58 UTC also passed one complete batch: **26 passed, zero failed/skipped** (18 finite, one native, seven legacy), with all eight source/test output hashes rechecked afterward. Actual return logging was clean; stderr contained only the three intentionally throwing publication-observer cases.
