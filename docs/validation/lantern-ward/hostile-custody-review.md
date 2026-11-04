# Lantern Ward hostile custody review

## Verdict and provenance

**Independent execution sign-off: withheld.** This reviewer did not execute a custody test and did not independently reproduce an implementation failure. The executable evidence below comes from the parent's two-test native regression run, whose test source and actual output this reviewer inspected. It must not be described as a second independent passing run.

The parent requested an immediate bounded handoff after completing those tests. This report therefore closes the review with the available evidence and its limits. No implementation was changed. No browser operations were performed. No reviewer-owned process is running. `test/lantern-ward-custody.test.mjs` was not created; there is no additional reviewer test suite to integrate.

## Reviewed evidence

- Repository instructions and current task context: `AGENTS.md`, `NOW.md`.
- Production ownership and hardware: `src/systems/lanternWardWork.js`, `src/data/lanternWardHardware.js`.
- Existing native harness: `test/lantern-ward-world-life.test.mjs`.
- Parent's new regression source: `test/lantern-ward-unattended-law.test.mjs`.
- Parent's actual run output: `/tmp/lantern-unattended-law.log`.

The inspected parent run reports **2 tests passed, 0 failed, 0 skipped**, with total duration **16,707.189737 ms**. This reviewer did not rerun it or repeat the full Adventure stability test.

Current inspected source SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `src/systems/lanternWardWork.js` | `535e7a2d424699af7ef1260b6343e3e0fcd5dd8609b92478b9d36f15042ac9d9` |
| `src/data/lanternWardHardware.js` | `398a673f0de7a16ac654736171ffc83fcc1f78bbcd4fc8d88c45d5dddd1e825c` |

The current work-system hash differs from the initially assigned frozen hash `db793d8e187e1786fdb3fd053eca35d2d376372ab9bcac4fcae075368bd3f36f`. The parent reported parallel repairs. These inspection hashes identify the bytes read; they do not establish the exact source hashes used by the earlier recorded test process.

## Path 1: ignored seven-minute watch

**Supported by inspected parent regression evidence.** The test advances 25,000 native 60 Hz steps before checking that the ignored flag is still false, there is no service event, and the mast has moved less than one world unit. It then continues native stepping until the first service event, without setting the completion state or forcing the deadline.

The recorded result at **508.9166666665325 simulated seconds** has `installed: true`, `ignored: true`, `playerHelped: false`, `helpedBy: null`, one installation, and one maintenance service. It identifies the finite original lamp serial as `venn-family-lamp:01` and the committed receipt as `lantern-ward:venn-family-lamp:service:01`.

The test asserts retained object identity for both the original lamp and original cradle, physical mast displacement greater than 30 world units, exactly one emitted service event, and a completion receipt with `playerHelped: false` and `method: 'crew_installation'`. The log records mast position `(1604.84765625, -1151.8487548828125)`, lamp position `(1829.970947265625, -695.00439453125)`, and cradle position `(1829.9874267578125, -650.0050659179688)` in the horizontal world plane.

This establishes the parent's bounded native unattended progression and absence of player help credit in that receipt. A separate wallet, inventory, or economy reward assertion was not observed. Consequently this report does not expand receipt-level evidence into a claim that every possible reward channel was audited.

## Path 2: actual attachment and canonical witnessed cradle theft

**Supported for the cradle by inspected parent regression evidence.** The test constructs a native physics harness with the real combat attachment service and real law owner, supplies a station and an existing lawful patrol witness, and creates a genuine `tether_standard` attachment from the player to the original cradle. Positioning the fixture and witnesses is controlled test setup; it is not evidence of an ordinary player approach or control route.

Local attachment first sets the borrowed history while producing zero theft reports. The test then moves the player through queued physics impulses and reels the real tether until the yard theft boundary produces a report. The recorded theft occurs at **21.216666666666743 simulated seconds**, with cradle position `(1476.1298828125, -495.6537780761719)`.

The observed canonical receipt reports:

| Field | Recorded value |
| --- | --- |
| Owner/source | `lawSecurity` |
| Incident kind | `payload_theft` |
| Accepted | `true` |
| Validated witnessed theft | `true` |
| Report ID | `lantern-ward:theft:cradle:01` |
| Incident receipt ID | `law:incident:17w7bcp` |
| Offender stable ID | `player` |
| Payload stable ID | `lantern-ward:cradle` |
| Station | `station_helios` |
| Witness count | `3` |
| Witness stable IDs | `test:existing-patrol`, `station_helios`, `lantern-ward:tug` |
| Responder availability | `available` |
| Causal tick | `1273` |

The source asserts one accepted validated report, the correct cradle and station identities, at least one witness, and no second report over a further 180 steps (three simulated seconds). It also asserts that the original lamp and cradle objects remain present, that `history.cradleStolen` persists, and that `captureEntityRecord` followed by `spawnSpecFromRecord` preserves `lanternWardCustody.holder: 'player'` for the cradle.

## Remaining negative-check limits

These are missing qualification evidence, not independently reproduced implementation defects:

1. **Independent execution:** this reviewer ran zero tests. The parent's run remains one execution provenance.
2. **Original lamp theft:** the observed canonical incident is cradle theft. The recorded state has `lampStolen: false`; detached original-lamp theft and its own law receipt were not demonstrated by these two tests.
3. **Continue persistence:** the inspected assertion proves a cradle record-to-spawn-spec custody round trip. It does not exercise a fresh Continue runtime and subsequent theft or service behavior in that new runtime.
4. **Sale exploit:** no actual sale operation or sale rejection was exercised in the inspected two-test source. Object identity and a single report cannot alone prove absence of a sale exploit.
5. **Duplicate horizon:** duplicate law reporting was checked for three additional simulated seconds. That does not cover arbitrary long duration, release and reattachment, or reload transitions.
6. **Normal-route evidence:** the native harness uses explicit fixture positions and witnesses. This reviewer did not validate the ordinary player route, readability, or browser behavior.
7. **Source binding:** the supplied historical log does not record the inspected source hashes. No claim of immutable-source equivalence is made.

## Handoff

The parent's two passing regressions materially support native unattended service and witnessed cradle theft through the actual law owner. They do not support an unqualified claim that this independent hostile reviewer executed and passed both commissioned paths, including all original-lamp custody, Continue, and sale-exploit checks. Preserve those distinctions in final acceptance. No implementation fix is proposed or applied by this reviewer, and no process requires cleanup.
