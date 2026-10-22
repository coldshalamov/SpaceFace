# Drift departure/return r3 recovery

RECOVERY ONLY. This exact two-file patch extends the reviewed r2 test fixture with an optional production world/input lane and adds the return test. Gameplay source remains r2. Earlier recovery files are unchanged; this is not runtime integration, deployment or ordinary gameplay acceptance.

## Restore

In a separate clean clone, first restore ../coherent-radio/README.md and then ../drift-intake-r2/README.md in that order. The r2 recovery commit is 79dfc3737d9ea7bdafa72f877f948a38bd7af94d. Then run `python3 /absolute/path/to/drift-return-r3/restore.py /absolute/path/to/restored-clone`. The script verifies exact baseline fixture bytes and patch hash, applies the patch, and verifies both output hashes in outputs.json. No dependency installation or tests run automatically.

The source remains the r2 2,399-entry source manifest. Only test/fixtures/pallas-drift-native.mjs and test/pallas-drift-return.test.mjs change. The optional worldUpdates=true lane selects actual input/world owners in production order; default behavior stays unchanged. A fresh focused run is `node --test test/pallas-drift-return.test.mjs` after repository dependencies are available. Do not run test/anvil-receiver-delivery.test.mjs or aggregates including it.

## Recorded evidence

The independently reviewed success log records 1/1 passing, 51.3 seconds wall time. It was preserved without rerunning the test or overwriting captures. The default-lane check separately confirms input stays absent and world clock unticked for default fixture users.

Actual public world:requestJump completes Pallas to Sker to Pallas gate travel. ui:setCourse, production input and flightV3 fly the player to the pre-departure observation position. Original carrier identity/generation, finite section, native tow and tug-to-carrier custody receipt survive. There is no offscreen intake; the native Drift station reactivates, the carrier resumes hauling and intake occurs at simulation time 118.3833333333279.

The compact JSON traces preserve player/station/native observations, carrier/section identity, autopilot status and intake facts; travel events preserve both charge/start/arrive chains. Large returned-save captures, archives and redundant full source copies are intentionally omitted. They are not required to reconstruct the two-file change.

## Meaningful unsuccessful attempts

- Baseline: jump charge begins but stays in Pallas because the fixture omitted world.update.
- World owner only: real return entry is approximately 4.6 km from Drift. Waiting there does not resume physical intake. The eventual successful flight proves actual station reactivation rather than assuming it.
- Course without input owner: stale autopilot commands are interpreted as manual input on the next flight tick. The final optional lane includes the real input owner and requires course survival after two native ticks.

Logs, compact traces and prior no-course/missing-input test snapshots retain these distinctions. Temporary machine paths in evidence are sanitized. None of these fixture omissions is claimed as a gameplay-source defect.

## Explicit limits

Returned-route stock deltas, final receipt equality, wallet/cargo effects and duplicate-intake checks are not independently asserted in this r3 test; those protections rely on separate r2 coverage. Do not treat r3 as independent proof of them.

This is focused native production-owner/residency and resumption proof, not manually piloted travel, ordinary player-camera comprehension, visible receiving animation, native phone or performance acceptance. Existing roof/rim occlusion remains open. A shorter route than uninterrupted r2 is timing-sensitive evidence, not proof of a reef-force cause; no route-controller change was made.
