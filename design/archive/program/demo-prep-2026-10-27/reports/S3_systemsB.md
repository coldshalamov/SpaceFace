# S3 systems B: crew, mass-signature, swarm-brood review (read-only)

Tree: master at c6d21662f7b plus the uncommitted cluster. Nothing edited, staged, committed or deleted.

## Verdicts

| Group | Files (diff vs HEAD) | Verdict | Basis |
|---|---|---|---|
| Crew | src/systems/crew.js (+~550), src/data/crew.js (+188), src/ui/crewPrompt.js (+62) | LAND | All crew tests pass. Ticked via update() (crew.js:240), subscribed in init() (crew.js:74-126). Roster hard-capped at CREW_CAP=4 (crew.js:271, 351). Payday accrues back pay during a strike and settles via the confirmation card (crew.js _payday, _resolveStrike). Credits move only through economy:chargeCredits/grantCredits. Prompt wiring: crewPrompt.js handles crew:decisionOffer and replies crew:decide, both of which crew.js handles. |
| Mass signature | src/systems/massSignature.js (+463 changed), src/data/massSignature.js (+78 changed) | LAND | Tests pass. update() at massSignature.js:195. Caps present: MAX_READS_PER_SCANNER=96, PULSE_REPORT_MAX_CONTACTS=16, MAX_LIT_S, MAX_QUIET_S. Removed export sweepRingFor has no consumers outside the file. SWEEP_SCANNER_PROFILES is still exported and used by characters/gateThreeRules.js and data/encounters/700-the-weighing.js. |
| Swarm brood strain | src/systems/swarmBrood.js (+107), src/data/swarmBroodLate.js (+146), src/systems/swarmJuice.js, src/render/broodPresentation.js | LAND (one nit) | All brood tests pass. Strain draws use the brood's own seeded mulberry32 stream and only start at wave 83 (SWARM_BROOD_STRAIN_FROM_WAVE), so earlier waves consume no extra draws. Nit: broodStrainBurst(i, credited) ends with `void credited;` (swarmBrood.js ~1940-1990), an unused parameter; drop it. |
| Small hunks | survivorPod.js (+18), worldSiteRuntime.js (+20), alienEcology.js (+20/-12), traffic.js, trafficJobOps.js, trafficTugOps.js | LAND | survivorPod: scan-label prefix guard, readable. worldSiteRuntime: siteStructuralPayloadMissing adds a per-tick residency check; the ceres test edit depends on it. alienEcology N03: see below. traffic/trafficJobOps: hitchhiking label now gated by massline2Flag('hitchhiking') (featureFlags.js:111, exists). Default route is safe: PRODUCTION_FEATURES sets hitchhiking true (runtimeProfiles.js:40) and featureFlags re-seeds to it at production boot (featureFlags.js:45). The legacy map (runtimeProfiles.js:101, false) is only the pre-reseed initial state. trafficTugOps: CHARON_SUPPLY import exists (charonSupplyReadout.js:5, key `salvor`). |

**alienEcology N03 (not a regression).** At HEAD the N03 flinch sat inside `for (const s of pulsing)` and required s.siteId === 'charon_pylon_field'. That site is a machine site (data/precursorMachines.js:360), not in ALIEN_SITES, so it could never appear in `pulsing`. The flinch was a dead wire. The new code (alienEcology.js ~1545-1575) runs on proximity to the machine site, inside the `pulsing.length` branch. Charon expanse has 5 alien sites, so it is reachable. Gap: no test references N03_pylon_pulse.

**Untracked files that must be added with the cluster:** src/data/bloomLadder.js, test/crew-expansion.test.mjs, test/mass-signature-expansion.test.mjs.

## Tests (each file run alone, serially, timeout 170 s)

| Test | Result |
|---|---|
| crew-expansion | 29/29 pass |
| crew-446 | 12/12 pass |
| mass-signature-expansion | 29/29 pass |
| swarm-late-strain | 13/13 pass |
| swarm-brood | 17/17 pass |
| swarm-brood-bosses | 9/9 pass |
| swarm-brood-families | 10/10 pass |
| swarm-late-brood-reserve | 5/5 pass |
| swarm-late-roster-band | 9/9 pass |
| swarm-late-roster-band3 | 13/13 pass |
| w-concord-515 (massSignature) | 11/11 pass |
| w-stealth-513-mass-signature | 8/8 pass |
| ceres-workfleet-production-cycle | TIMEOUT at 170 s (exit 124), no assertion output. Re-run with 600 s cap started 17:10 UTC, still running at 17:12 UTC. Output: S3_ceres_rerun.full.txt; exit code will be in S3_ceres_rerun.exit. Not an assertion failure. |

No assertion failed anywhere. The ceres edit adds `runtime.step(DT)` (test line 68) before the site assertions. DT is defined at line 11. The edit matches the per-tick residency change in worldSiteRuntime.js.

## Wiring

- Crew: registry.js:760; authoritativeSystemManifest.js lines 67, 165, 321. Save: serialize wired at saveSystem.js:983 and :1185. Restore wired at saveSystem.js:7111.
- Mass signature: registry.js:669; manifest lines 62, 139, 492. No serialize() method, so sensor ledgers are runtime-only and not saved. Nothing new is persisted.
- Swarm brood: not a registry system. Created by swarmArena.js:51 (createBroodEngine). Strain state is fixed-size (affix = Uint8Array(CAP)). Not in saveSystem; arena persistence not checked.
- Events with no listener in src/: crew:strike, crew:salvage, crew:promoted, crew:quit, crew:wagesPaid, crew:hireDenied, crew:demandSettled, crew:strikeSettled, sensors:signatureReport, sensors:playerLit, sensors:playerUnlit, sensors:quietCoast, sensors:playerSignature, swarm:broodBurst, ecology:setpiece. Telemetry or future HUD hooks, not a defect. Not checked whether the player sees these some other way.

## Defect read

- Added lines in all 15 files: no Math.random, Date.now, performance.now, console.*, TODO, FIXME, XXX or debugger.
- Symbols in scope: routePlayerDamage (swarmBrood.js:1429), playerMass (:756), finite (:195), slot (:714), STRAIN_TINTS (broodPresentation.js:271, with color at :263). All resolve.
- Credits: no direct writes to player.credits in the changed files.
- Recursion, shadowed handlers, unbounded arrays: not exhaustively checked. The new lists I saw are bounded (CREW_CAP, declinedIds deduped against the candidate roster, lostIds deduped).

## bloomLadder.js

- Nothing imports it. The only code reference is the comment at src/data/swarmBrood.js:583. No test references it.
- What it is: 440 lines, not the 567 in the brief. Exports BLOOM_LADDER (23 rows, tiers 0-6), bloomLadderFamily/ForBrood/ForSpecies, the BLOOM_* cascade timings, BLOOM_TIDE_* and bloomTidePlan (deterministic from sectorId and seq), HOST_SHADOW_PATTERNS, and a bloomLadderIssues() validator. Its header names two consumers: swarmBrood.js and src/systems/faction_bloom.js.
- Complete? No.
  - faction_bloom.js does not exist.
  - Its own validator returns 3 issues: row 1 (lostcalls) has no fight language; mourning_kite (row 21) and archive_crab (row 22) have non-monotone tiers.
  - swarmBrood.js does not import it. It duplicates the numbers as BROOD_* constants. The values I compared match (panic mass 90, scatter 1.5-2.5 s, reform 1.3, cascade radius 220, aggression 4.0, grief 5.0 with ring 30, thrash 2.2 with radius 14). So the comment "the adventure runtime reads the same numbers" is untrue today.
- Someone else's file: design/program/agentic-run-oct20/out/R399/protected.txt lists it as untracked, so another run may be mid-work.
- What should consume it: swarmBrood.js should import the timings from bloomLadder.js in place of its BROOD_* duplicates, the three validator issues should be fixed, and faction_bloom.js should be built to read BLOOM_LADDER and bloomTidePlan. Land the file with the import, or delete the comment.
