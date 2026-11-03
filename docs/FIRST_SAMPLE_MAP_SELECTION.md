# First sample Map selection: recovery site → Helios

## Scope and provenance

This publication bundle contains a narrow proposed patch for
`coldshalamov/SpaceFace`, PR #803, exact head
`7b79a665cef1c3514b5ec89a3d7403da30fe04f6` (`dot/garden-first-return-20261102`). It is not a
GitHub write, merge, deployment, or full-game acceptance claim. The proposed diff is
`recovery-map.patch`; the four files in `publish/` are the byte-identical changed source/test
artifacts from that diff.

The source evidence confirms a selection mismatch in the opening 47-A recovery. Mission Log's
`missionMapAction` uses the matching mission owner's waypoint position to frame Local Map but also
passes the mission's eventual destination station. `resolveMapOpenTarget` resolves that station
before its positional fallback, and `galaxyMap.onShow` uses the resulting `openTarget` as the
selected inspector target. Thus the camera can frame the recovery site while the inspector selects
Helios. After the real sample-recovery owner transition, the navigation owner changes to the Helios
station waypoint; that destination selection should remain.

The code-only patch was checked against latest remote `master`
`59b3bb200d8e1830a99cddda63c5a5073c7b8b47`. `src/ui/galaxyMap.js` and `src/ui/mapAuthority.js`
are byte-identical across original base commit `67c9e951081ff05117e7aabd37f706f60c500733`, PR
head, and current master. Their original GitHub blob IDs are respectively
`b1b9f7cc1fcedc59acadf772ab60632ecc0688cd` and
`4b13db2af3668b65430a5a4590bfeb41013abc42`. Relevant Mission Log handoff/button functions are
byte-identical between PR head and current master, and the code-only patch applies cleanly to
current-master snapshots.

## Behavior change

- For canonical B0 only—recognized by the already-imported `contract47aReadout`,
  `sampleRecovered === false`, a finite matching owner waypoint, and the current sector—the Mission
  Log omits `stationId` and marks the Map intent `selectionTarget: 'active-waypoint'`.
- The existing Mission Log button encoder/decoder carries that optional one-shot marker in a data
  attribute. Caller provenance remains `source: 'missionLog'`.
- `mapAuthority` whitelists the marker and omits it from all default/legacy intents, so those
  normalized object shapes do not gain a `null` field.
- `galaxyMap` selects the waypoint only for an active mission, Local focus, finite explicit
  coordinates equal to the current matching mission waypoint, and current-sector agreement. An
  explicit station selection remains authoritative. Missing/malformed fixes, generic missions,
  unmarked intents, and focus-only Map opens retain existing behavior.
- After the actual sample yield, the mission returns to explicit Helios selection. A previously
  saved recovery-site intent no longer resolves to the stale waypoint after the owner transition.

The change introduces no persisted state, new module, B0 reader in `galaxyMap`, world/navigation
write, flag, model, reward, or workflow.

## Verification and limits

The production `test/mission-log-truthful-47a.test.mjs` passed **11/11** through the Node runtime
overlay in `.validation/`: changed files were loaded from exact 7b79 source plus this patch; the
mission-owner ports and recap helper used the staged PR #803 owner overlay; remaining dependencies
came from the older sparse checkout. Coverage includes actual button attributes/readback, Map
authority normalization and one-shot round trip, `applyMapOpenIntentToView`, `resolveMapOpenTarget`,
the real mining-yield recovery transition, the post-transition stale-intent case, explicit-station
precedence, invalid/mismatched/foreign waypoints, generic-mission fallback, focus-only opens, and
the default intent shape.

The adjacent existing B2 navigation and Scale 4 Map tests were run with both the patched overlay
and a control overlay using unmodified exact 7b79 files. Both runs were **3/11 pass, 8/11 fail with
the same assertion outputs** in the foreign/older sparse-checkout combination; these are baseline
limitations, not a claim that the wider tests pass. Full browser rendering is unavailable because
the existing Chromium attempt fails with a socket permission error.

The helper `routePreview.js` and overlay scripts under `.validation/` exist only to run the focused
test with sparse shared dependencies. They are not shipping changes. Only the four source/test paths
listed in `SHA256SUMS.tsv` are the changed code/test artifacts in this publication bundle.

Root integration repeat: the amended B0 suite plus Continue and Registry regression suites
passed **25/25** together using the same scoped overlay. This does not expand the runtime or
rendered acceptance claim above.
