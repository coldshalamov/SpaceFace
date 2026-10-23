# Morrowlight acceptance evidence

Candidate base: `34310c836bf80216b869331c54b777c231a637ee`.

## Executed checks

On 2026-10-23, with Node **24.19.0** and the repository-pinned Rapier **0.19.3** and Three **0.186.1**:

```sh
node --test --test-isolation=none test/pro-experiences-salvageTender.test.mjs
```

**19 tests passed, 0 failed, 0 skipped** (final run: 4.73 seconds including imports). The direct invocation below also runs the same `node:test` cases and is suitable for Node versions without the isolation option:

```sh
node test/pro-experiences-salvageTender.test.mjs
```

Existing owner baselines were also run successfully:

```sh
node --test test/cargo-lifecycle.test.mjs test/economy-credits-safe-integer.test.mjs
node --test test/sg02-native-save-duplicate-record.test.mjs
```

These three existing test files passed. Dependencies and hydrated exact-base generated modules are verification inputs, not candidate changes.

## Exercised behavior

The focused host uses the real simulation, canonical cargo and economy owners, station-service delivery writer, combat damage/attachments, native Rapier backend, and canonical save envelope. Most route tests steer using finite forces through `writePhysicsControl`; recovery and relocation never set body positions after spawning.

A separate feasibility regression uses the actual `NEW_GAME` Hitch and default fittings, the `ships` owner, Flight V3, `tetherGameplay`, native Rapier and production feature flags. Its only flight commands are a 0.10-second forward tap followed by neutral input. It moves the same 90-mass tender at least 60 m, reaches the claim gate below 8 m/s within 12 seconds, and completes the 45-credit claim. The normal player tether mirror is active and the ships remain farther apart than their combined radii throughout. This check uses no injected forces or pose writes after spawning. Process feature flags are restored after the case.

- Ordinary timed Adventure discovery and encounter decline preserve one original opportunity. Inspection, refusal, acceptance, suspension, return and resumption do not silently grant ownership. Native cancellation cuts the feature's own line while preserving a manual tool's line.
- A zero-credit expedition takes a partial load from the original emergency locker, recovers the barge through its native tow, claims stage one with recovered electronics, uses its finite emergency weld and fuel pump, restores stage two and repairs, travels to the outer crate, returns, and restores stage three. Stage three doubles actual repair rate and carries a stocked original pod on a real attachment.
- Relocation moves the same tender and pod more than 90 m and secures a new berth, preserving cargo/manifest identities. A second expedition records another return without repeated arrival awards while remaining nearby.
- Full holds preserve unaccepted cargo. Empty sources stay empty. Insufficient credits, sealed freight, stale decision closures and nested cargo callbacks cannot complete or charge a duplicate restoration.
- Paid services pause off-sector and cannot transfer to another live hull of the same model. Untouched supply refunds once; partially delivered work does not refund its consumed supply.
- Real combat damage leaves the original disabled hull repairable; a canonical scrap patch reactivates it. Removed originals do not respawn, and repeated lookups reject copied identity markers on a replacement occupant.
- Actual `world._onSetCourse` consumes feature payloads: local marks retain manual steering and bind the live target; remote home navigation uses the sector route branch. Production promptDeck decisions, untargeted scan completion, New Game and disposal are covered.
- Actual galaxy-map course/action helpers consume the map adapters: sector-local drawing agrees with global navigation coordinates, local targets retain their stable identity, duplicate remembered/live contacts are removed without mutation, remote homes produce a sector route, and missing originals cannot bind a copied replacement.
- Canonical synchronous saves preserve partial paid work. Capture-plan and generator key order/sidecar agree. Cold asynchronous parse/validate/Continue restores an active tow and rack with remapped identities; pending native joints remain pending rather than becoming lost cargo. Repeated Continue does not clone bodies or redeliver completed work.
- Real Three object lifecycles verify all three visible equipment stages, presented-transform rebinding, reduced motion/flash, late/missing asset responses and cleanup. Local audio/caption routing, mute, throttle and unsubscription are exercised.

## Limits and local acceptance

This is focused production-owner evidence, not a production registry run or full player-truth verdict. The source-only context omits authored binaries and goldens. The presentation checks use injected asset leases with real Three objects; they do not decode the shipped GLBs, render pixels, measure deck clearances, or listen to audio. Browser/Electron controls, complete world/AI interactions, frame pacing, solver warm-start bit identity, and campaign-length balance remain unmeasured.

After the scoped adapters are registered as described in `INTEGRATION.md`, local acceptance should exercise the ordinary Adventure route with the shipped assets, inspect the three equipment states and native pod clearance, save while towing and while servicing, cold Continue, and run the required player-truth gate/contact sheet. No golden files were changed and no visual approval is claimed.
