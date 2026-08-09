<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-045
leafId: PQ-045.retro-admission
acceptance: focused_green
disposition: PASS
candidateCommit: f66f6768
-->
# PQ-045.retro-admission — receipting the R5 Ceres implementation that landed unadmitted

## What this closes

The R5 Ceres reference pocket and its five-minute acceptance harness landed on master on 2026-08-08
across seven commits — `7fa9452b`, `8efbc4de`, `78300365`, `42d008cd`, `5a67a236`, `f050670b`,
`0f44b94b` — adding `src/data/sectorActivityPockets.js`, roughly 425 lines to `src/systems/traffic.js`,
changes to `src/systems/world.js`, sandbox wiring, and a ~7,400-line acceptance harness under
`scripts/lib/ceresFiveMinuteAcceptance.mjs`.

None of it was admitted. Verified at `f66f6768`:

| Control surface | R5 representation before this receipt |
|---|---|
| `program-queue.json` `tasks[]` | none across 44 rows |
| `program-queue.json` `dispatchUnits[]` | none across 101 units — every unit's `paths`/`checks` checked for `sectorActivityPockets`, `ceres-five-minute`, `traffic.js`, `sandboxSetup`: 0 hits |
| `design/program/NOW.md` | no lease; only historical PQ-020 rows |
| `receipts/` | none |
| Active packet | `PHYSICS_AS_SPECTACLE_PROGRAM.md` governs R5 but is **invisible to the validator** |

That last row is the structural defect. `PHYSICS_AS_SPECTACLE_PROGRAM.md` carries `lifecycle: claimed`
and references R5 in 20+ places, but `checkActivePackets()` filters to `/^PQ-\d{3}\.md$/`
(`scripts/check-program-docs.mjs:240`), so the file is never parsed. **The governing document for the
`R5 → five-minute Ceres gate → R8` dependency chain existed, and nothing in the repo could enforce or
check it.** PQ-045 gives that chain a machine-visible home as `dependsOn` edges.

## What was admitted

- `tasks[]` row **PQ-045**, `state: ready`, `canonical: ['R5','R5A']`, `aliases: ['R5']`,
  `dependsOn: ['PQ-020']`. The alias mechanism is the one PQ-020 (`aliases: ['SF-21']`) and PQ-025
  (`aliases: ['SF-33']`) already use; an earlier reading that the `/^PQ-\d{3}$/` id regex made R5
  unrepresentable was wrong — that regex constrains only the id token.
- Ten `dispatchUnits[]` leaves at priorities 250–259, ordered so the cheap high-value repairs precede
  any art promotion.

## Ordering, and why it is that way

`PQ-045.choreography-repair` is first and is the only `ready` implementation leaf. The Wave-0 baseline
established that `targetRef` **has no movement consumer**: `npcJobsRuntime._targetWaypointPos()`
resolves purely from the authored anchor+offset in `job.route` and never touches the entity a mark
names. Ceres actors therefore work **40.5 / 108.8 / 173.7 WU** away from the cargo pod, ore clast and
grave shard they claim to be working on, and no runtime path can close those gaps.

Promoting 27 selected assets onto that choreography would place production art around actors that are
miming. Every art leaf therefore depends on the repair and on `route-topology`.

## Coordination hazard recorded at admission

A concurrent lane owns `src/systems/npcJobsRuntime.js` — it was modified during this admission, has
committed three Ceres features (`446e4e06`, `fc5e54a0`, `f66f6768`), and has authored a comment there
stating its escort formation is *"deliberately one exact authored relationship, not a generic
targetRef movement language."*

That is a direct design conflict with `PQ-045.choreography-repair`. The unit's brief carries a
`COORDINATE FIRST` warning. This receipt does not resolve the conflict; it records it so the next
claimant does not discover it by clobbering.

## Verification

- `node scripts/program-dispatch.mjs --id PQ-045` resolves; queue schema and evidence validate.
- `npm run check:baseline` — **11/11 green**.
- No `src/` path was changed by this admission.

## Honest residuals

- `design/program/NOW.md` remains past its expiry; its full refresh is a separate integrator action
  over roughly 40 lease rows and is listed as A2 in
  [`ADMISSION_ROUTE.md`](../../../reference-sector/ADMISSION_ROUTE.md).
- No acceptance is claimed for the landed R5 code. It is now *admitted*, not *accepted*: the
  five-minute gate is still `PENDING` with both machine-evidence blobs missing.
- `PQ-045.human-review` cannot be closed by any agent.
