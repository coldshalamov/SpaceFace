# Ordinary crew rescue: truthful repair and Continue

Status: implementation and native evidence, not whole-game or visual acceptance.
Goals remain open: SF-GAME, SF-LIVING-WORLD, SF-ORCHARD, SF-VISUALS, SF-PUBLISH and SF-RECOVER.

## Player outcome

An existing yard tender can break off its shift, physically reach an ordinary disabled worker,
match its drift, spend six continuous eligible seconds alongside, and ask the combat owner to
repair the drive. Only healthy combat state or a matching confirmed transition closes the repair.
A full Continue preserves the worker's disabled subsystem under its durable world/job identity,
reconstructs one tender request, and resumes the same interrupted shift after actual repair.
No new actor, reward, inventory, parallel combat ledger, or physics pose writer is introduced.

## Reproduced defects and repairs

- The old ten-second confirmation fallback reported `repaired` even while combat still said the
  drive was destroyed. It now reports `repair_unconfirmed`, releases the truck and leaves the
  casualty eligible for a later attempt. Separation and hot-site holds cannot bypass that timeout.
- Loading mid-response dropped control leases and abandoned the disabled worker. A bounded scan
  now derives standing requests from current combat truth, not stale saved entity IDs or leases.
- Disabled workers advanced their job clock without a working drive. Unleased disabled jobs retain
  their interrupted work; actual repair re-enters the existing threat-clear/resume machinery.
- The crew approach supplied world axes to a local-axis flight interface. It now uses ordinary
  authored thrust/RCS to match velocity and skirts intersecting station safety envelopes.
- Passive AI maneuver commands overwrote the tender's FlightV3 command at the later AI-port flush.
  Request and flush now yield only the exact current rescue participants, with live entity,
  generation, job and claim validation. Normal patrol/other AI remains eligible.
- Ordinary world-record workers were absent from semantic combat saves, so Continue silently
  healed them. The additive `worldJob` reference carries record/job/sector/ship identity and binds
  only to an unambiguous matching live worker and incoming saved job. Missing, defeated, replaced,
  mismatched, duplicate and finite-site identities fail closed. Existing player/persistent and
  specialized Ceres custody references retain their owners.
- Welding time formerly accumulated while separated or held off. Six seconds now means continuous
  proximity and low relative speed. Reentrant weld observers cannot redirect repair to a replaced
  actor or steal another controller's casualty. An unreachable first casualty cannot starve others.

## Evidence and commands

`npm run check:npc-jobs` includes the existing kernel/runtime suite and these crew tests. The leaf
is explicitly reached by the existing top-level `check` and CI partition expansion; no workflow
or deployment changes are needed.

- `test/npc-crew-rescue-continuity.test.mjs`: owner-boundary failures, missing confirmation,
  replacement IDs, foreign claims, starvation, continuous weld time and durable reference rejection.
- `test/npc-crew-response.test.mjs`: compatibility fixture with explicit mocked combat truth and
  intentionally assigned alongside poses; not a native movement claim.
- `test/npc-crew-rescue-native.test.mjs`: actual authored Ceres tender and seam surveyor, native
  Rapier movement, selected production owners in production order including world updates,
  actual combat disabled/enabled transitions, full save/load with numeric ID remapping,
  cargo/route preservation, one repair and resumed original job advancement.
- Damage setup is injected subsystem health plus the production transition scheduler. It is not
  evidence that a weapon physically hit the drive. No tender/casualty pose is manually assigned.
- The ordinary route welded at 78.000 s and combat confirmed repair at 78.0167 s. The full-save
  mid-approach route confirmed repair at 77.8333 s. Independent mid-weld Continue confirmed at
  79.050 s, including a restarted full weld after restoration.
- Before final packaging, the combined crew suite passed 21/21. Independent adjacent persistence,
  player recovery and finite custody regressions passed 19/19. Final native cargo/flush/progression additions passed 2/2 in 80.1 s while other checks ran;
  the existing CI partition contract passed 30/30. The complete seven-file `check:npc-jobs` leaf passed 100/100 in 72.95 s. Public reconstruction
  results must be recorded at the publication seal, not inferred from canonical results.

Set `CREW_RESCUE_POSES` when running the native test to export actual checkpoints, model-selection
inputs and source hashes for an offline render. Such a reconstruction is not a live game camera.

## Deliberately open limitations

The selected-owner native fixture is not a complete production session or physical-phone test.
Continue currently falls back to scalar restoration and then resumes native Rapier; exact native
snapshot adoption is not claimed. Ordinary moving/disabled crews beyond this tested route still
need broader world acceptance. The original close refinery hauler route yielded at 65.283 s when the authored
`traffic:ceresMinerHaulerHandoff` acquired the same still-live casualty at 65.2667 s.
It had no rescue repair by 150 s; this is legitimate foreign ownership transfer, not incarnation loss. An earlier world-unticked probe later redispatched
and repaired at 158.683 s; that is not a clean ordinary-world or single-response proof.

The tender's original spawn is only about 50 WU from a station with a 73 WU measured radial hull
bound, while the tender's bound is about 21 WU. Native ejection suggests a placement problem, but
radial-envelope overlap alone does not prove mesh penetration. Moving it to the existing exterior
berth would exceed the current 95 WU authored spawn band, so the attempted placement edit was
reverted rather than silently changing that invariant. Placement/contact evidence remains open.
The broader non-crew AI combat-drive authority mismatch is also not changed by this narrow lease
repair. No global zero-drive rule, merge, deployment, acceptance or whole-goal closure is asserted.

## Recovery incident

Execution tools disconnected on 2026-10-20 at 18:13:59 UTC, with failed existing-process polling and
handshake checks through 18:14. The current bounded source/tests, native poses and independent
mid-weld evidence were preserved outside the VM through Library. Execution recovered at 18:17.
The uncertain pre-interruption mutation was read back as absent before its bounded retry; tests
were restarted. An earlier empty final-suite log was not treated as a completed test.
