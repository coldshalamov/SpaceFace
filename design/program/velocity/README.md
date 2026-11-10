<!-- LIFETIME: VOLATILE -->
# Program VX / Velocity — stern-camera free flight

Owner directive: make "drive the ship from behind" a complete game experience. This folder is the
program's scoped work ledger (tickets, gate state, evidence index). Authority: the owner directive,
then `AGENTS.md`, `ARCHITECTURE.md`, Finish README; detail authority `docs/RACING_MODE.md` and
`design/program/RACING_FLIGHT_PROGRAM.md`. The Finish controller owns integration/publication;
this program builds verified exact-path changes and does not race it.

## G0 ground truth (HEAD 3713cd0923d0, 2026-11-04)

| Capability | Verdict | Evidence |
|---|---|---|
| Stern view toggle (\, LB+View, touch View, Settings Overhead/Racing/Auto) | SHIPPED AND WORKING | `src/ui/bindings.js:58`, `src/ui/racingControls.js:12`, `src/systems/racingSteer.js:80` |
| Same flight model both views | SHIPPED AND WORKING | `flightV3.js` never imports `resolveSteeringView` |
| Camera clearance (never-inside-solid) | SHIPPED AND WORKING, own-column only | `cameraGlide.js:355`; mid-ray occlusion unguarded |
| Stern-aware HUD/aim/target markers | SHIPPED AND WORKING | `flightViewProjection.js`, `hud.js:6057`, `4580-4629` |
| Hull-adaptive rig | PRESENT BUT THIN | floor `r*2.2`/`r*0.8` only, `camera.js:1585-1587` |
| Forward sight at speed | PRESENT BUT THIN | stern lead caps ~`lookAhead+32` ≈ 68 wu vs overhead ≤400 wu velocity lead |
| Circuits/contracts/rivals/ghosts/cups/drafting/set-pieces | SHIPPED AND WORKING | 9 circuits `raceLevels.js:308-449`; race-session only |
| Unscored free-drive route | ABSENT | every route is an active `type:'race'` mission; corridor banking is `racingSession`-locked (`newGameBoot.js:229`) |
| Persistent solid course furniture in Adventure | SHIPPED (substrate) | `_spawnPlaceProp` auto-solids census props (`solidDressing.js`); `physicalBody` one-offs are real bodies |
| Periodic machinery w/ collider in Adventure (Helios) | PRESENT BUT THIN | claim cracker cone cycle (720,-420); shutter is race-only; aperture Ceres-only |
| Depart-on-approach pursuit mission type | ABSENT | ingredients shipped: mission-pinned spawns, intent steering, flee/egress, matched-velocity holds, mid-phase params save, heat |
| Player collision damage | IMMUNE by design | `collisionConsequences.js:366`; consequence = momentum + recovery, not hull loss |

## Tickets

See `TICKETS.md`. Required fields per ticket: id, baseSha, claimOwner, allowedPaths,
forbiddenPaths, playerOutcome, sourceOwners, dependencyIds, hypotheses, acceptanceChecks,
negativeControls, testCommands, evidencePaths, risks, status.

## First slice (compulsory playable)

- **VX-A "Cracker Run" free-drive ring**, sector_helios_prime: plaza mouth SW of station_helios →
  industrial rib row on the yard edge → momentum chute past the claim cracker's timed cone →
  return apron. Unscored; persistent world furniture (census-solid props + nav buoys); reachable
  in ordinary Adventure flight, overhead or stern view.
- **VX-B "Blackout Courier"** pursuit mission (stage 2): authored offer → approach → courier
  visibly departs → chase crossing the ring geography (wide line vs rib shortcut) → intercept
  (matched-velocity hold or tether) → lawful/fence outcome → report.
- **VX-01** camera feel fix under measurement, not rewrite: forward-lead scaling at speed.

## Evidence

`EVIDENCE.md` — executed commands, exit statuses, captures, red-team verdicts, SHAs.

## Session 1 status (2026-11-04)

- **VX-02 IMPLEMENTED + focused-verified.** `src/data/vxFreeDriveRing.js` (17 census-solid
  structures + 17 ghost buoys + 13 lean reservation discs), `_spawnFreeDriveRing` + reservation
  feed in `src/systems/world.js` (+33 lines, additive only), `test/vx-free-drive-ring.test.mjs`
  7/7 green. `sf-sim run 47a` 720 ticks clean (materialize pipeline intact). G2 design attack
  (agent d5bf1602) ran BEFORE landing and caught a physically-impossible lane, a degenerate rib
  row, a live-body overlap with the Spare Keg, and a 2.5D "fly under" lie — all re-authored.
- **UNKNOWN (env-blocked):** live dressing-table/screenshot proof of the ring in a booted
  Helios session. Two successful boots confirmed dev route reaches `mode:flight` in Helios;
  first probe sampled before materialize finished, later boots timed out (headless software-GL
  + heavy foreign churn — 73 dirty paths, dev sim-worker bundle repeatedly failing mid-build).
  Re-probe on a settled tree: wait for `world.dressing.rows > 20`, then teleport + capture.
- **UNKNOWN (design attack leftovers):** cone-phase readability at approach distance (no
  external tell exists — needs lane lights or acceptance of blind timing); mouth silhouette
  shares `place_transponder_gate` with the Answering Buoy; starter-classroom mixing and
  sim-recording divergence (new reservations re-seat starter scatter) need a sim compare +
  onboarding route check before landing.
- **Not started:** VX-01 camera lead fix, VX-03 courier, VX-04 rivals, adversarial pass 2,
  matched perf, play stories.
