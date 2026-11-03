# First sample: recovery to return

## Player-facing change

The ordinary B0 contract is installed by `missionStoryOps._installContract47aColdStart` as the
canonical `salvage_retrieval` (`campaign47a:b0:recovery`, contract ID `47-A`) with
`params.sampleRecovered: false`. The Mission Log already has a phase-aware next action, but its
shared objective and Continue recap previously fell through to generic “Deliver to Helios Station”
copy, and the command brief’s Where showed only the final berth.

The candidate’s pure `contract47aReadout` uses the canonical tag, mission type, authored contract ID,
owner-written sample flag, and mission destination fields. Before acquisition it says to recover the
assay sample at the marked recovery site in Helios Prime, then return it to Helios; Where names the
`47-A Recovery Site` and Helios destination. After a player yield at the resolved source, the readout
says to deliver the recovered sample to Helios Station and Where names that actual destination.
Mission ownership remains authoritative: the candidate does not set recovery, add cargo, grant credit,
complete the mission, or advance the campaign.

Continue also distinguishes `deadline_s: null` (no clock risk) from an actual numeric `deadline_s: 0`
(a due-now clock risk); `Number(null)` must not fabricate `Clock: 0s`.

## Evidence and limits

The exact PR #803 owner modules and CSS sidecar were loaded by a nonshipping Node overlay; the
candidate Mission Log/recap and tests were loaded with them. Remaining transitive dependencies came
from the sparse local source tree. `mission-log-truthful-47a.test.mjs`,
`inf-070-continue-recap.test.mjs`, and the original `registry-first-contact.test.mjs` pass **22/22**.
The new recovery cases resolve a non-null source, prove it matches the installed waypoint and yield
position, and call the actual `_onMiningYield` owner. They compare credits and campaign state before
and after, confirm the mission stays active, and distinguish the legitimate mining step from a
completed dock/delivery step. This is owner/component proof—not a full exact checkout, complete
Save/Continue envelope, browser render, or player acceptance.

The test fixture explicitly disables tutorial hint ownership to observe the mission owner waypoint.
It does **not** change or establish the ordinary tutorial release sequence; the staged tutorial / 47-A
overlap remains open and its screenshot is not proof of ordinary-path failure. Map code is unchanged:
the Local Map handoff carries the owner’s recovery position and centers there, while its Helios
`stationId` may leave the destination inspector selected. This inspector-selection question remains
open; no pin, selection, or Map writer was added.

## Fresh current-master overlap check

Remote master at check time was `1795763b47890d497c7673ea908e052afc64bba4`; comparison from PR #803
base `67c9e951081ff05117e7aabd37f706f60c500733` reports 74 commits ahead and no changes to the four
candidate paths. Current-master Git blob IDs are:

| Path | Current master blob |
| --- | --- |
| `src/ui/sim/missionRecap.js` | `2e91a56b498443eb6b9c3f960ead0d8d52fe31ae` |
| `src/ui/screens/missionLog.js` | `ec79db42e89dd8ca53a349292a685a7df9212377` |
| `test/mission-log-truthful-47a.test.mjs` | `083638898421acf27d3c9b4f498de7fe4910bd19` |
| `test/inf-070-continue-recap.test.mjs` | `1faffad791256be92170525813ae4ac52cb77bbe` |

The two test blobs also match remote commit `67c9…` and the exact original test copies retained under
`candidate/original67/test/`. The Mission Log/recap differences from `base-3b59be05` are PR #803’s
Registry-readout additions, absent on master—not newer master edits. Keep those Registry changes and
apply this four-path B0 delta atop the PR #803 head; do not replace whole files from stale sources.

## Broader goals remain open

This scoped first-sample readout does not close the stable goals
`SF-WORLD-DIRECTION`, `SF-SECTOR-COHERENCE`, `SF-LIVING-WORLD`, or `SF-GAME`. The current opening
experience plan explicitly leaves those markers open and calls for continuing outward along real
mission routes (`design/program/opening-experience-2026-10-27/STARTER_WORKDAY.md` and
`SWARM_OPENING.md`).
