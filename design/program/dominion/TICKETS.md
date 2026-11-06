<!-- LIFETIME: VOLATILE -->
# DOMINION work ledger — resources, machines, battlefield geometry as one system

Program directive: lead-agent execution of the DM factory/defense loop (this checkout).
Coordination law: root `AGENTS.md`, Finish README §3/§5, `design/program/NOW.md`. This file is a
scoped ledger, not a competing queue; Finish boards remain the backlog authority.

Base checkout: `3713cd0923d0eebe5fe920df5da3accc1546c775` (`master`), 2026-11-04.

## Foreign mutation windows respected (do not write)

- Dirty, unregistered: `src/systems/asteroidSites.js`, `drill.js`, `worldSiteRuntime.js`,
  `asteroidSiteReadModel.js`, `drillFieldModel.js`, `siteRadiatorReadModel.js`,
  `src/runtime/laneSystemFacades.js`, `src/render/weapons/contactMarks.js` + `scarDirection.js`,
  `src/ui/deckplate/screens.js`, `styles/prompt-deck.css`, `design/program/inference-memory.json`
  — a coherent worker-mirror read-model extraction; preserved untouched.
- NOW.md claims: `aiPorts.js`, `ai/perception.js` (Sol CLI); Finish status/docs + `NOW.md` +
  publication (Codex controller); shipping-prep ignored paths; ignored artifact paths.

## Gap map (evidence-backed; classification per scout reports, 2026-11-04)

| Capability | Class | Evidence |
|---|---|---|
| Adventure site journey (tether→drill→survey→BOM→install→lanes→production→courier→receipt→save) | SHIPPED AND WORKING | `asteroidSites.js`, `siteLogistics.js`, `siteProduction.js`, `industryPlanner.js`; `test/asteroid-sites.test.mjs`, `site-lane-network-contract.test.mjs` (conservation exhaustive) |
| Courier visual on off-sector launch | VERIFIED NOT A LIE | `_spawnCourierVisual` (`asteroidSites.js:2839`) early-returns when `world.currentSectorId !== site.sectorId`; economics resolve in `_resolvePods` regardless. The suspected unconditional off-sector spawn is refuted by live code. |
| Machine damage model (drill-site machines) | ABSENT (machines unattackable); PARTIAL at payload layer | `applyWorldSiteFailure` + `deliverRepairParts` cover fins/pods only; `SITE_MACHINES` has no hp |
| Bastion/defense bridge (claim defense) | PRESENT BUT THIN | `claims.js` `spec_bastion` + `claim:defenseEncounterRequested`; no site-level attack/defense |
| Fortify build→wallet→spawn→phase→clearance→teardown | SHIPPED AND WORKING | `swarmFortify.js` + `runSession.purchase` idempotent wallet; `test/swarm-fortify.test.mjs` (18 tests) |
| Four devices' physical effects | SHIPPED (verify per suite run) | Rapier-moved fields (test:438), turret canonical projectile+finite ammo, Tesla segment damage, repulsor cadence/heat |
| Enemy counterplay vs structures | SHIPPED | `_onSiegeSpawned`→`setEntityDoctrine` weakest-link targeting, corridor-bound |
| Player-orientable reflective structure | ABSENT — this program's first build | law exists (`plate`→`resolveRicochet`), authored Foundry plates exist, no player build |
| Optic-mirror bolt reflection | PRESENT, divergent path | `opticField.js` writes `entity.vel` directly, bypasses `queueProjectileContinuation` membrane (recorded, not fixed here) |
| 10-wave/boss Foundry acceptance | UNKNOWN (per Nov-4 integration record) | not re-measured this session |

## Tickets (data contract fields: id, baseSha, claimOwner, allowedPaths, forbiddenPaths,
playerOutcome, sourceOwners, dependencyIds, hypotheses, acceptanceChecks, negativeControls,
testCommands, evidencePaths, risks, status)

```yaml
- id: DM-03
  baseSha: 3713cd0923d0eebe5fe920df5da3accc1546c775
  claimOwner: devin-dominion
  allowedPaths: []            # verification only, no writes
  forbiddenPaths: [src/]
  playerOutcome: "In an ordinary Swarm run, all four Fortify devices build, work physically,
    take damage, repair/reload, and retire with the run."
  sourceOwners: [swarmFortify.js, swarmFortifyEffects.js, swarmSafety.js, data/swarmFortify.js]
  dependencyIds: []
  hypotheses: ["Existing suite already proves physical function; gaps are ordinary-route only."]
  acceptanceChecks: ["node --test test/swarm-fortify*.mjs test/foundry-plate-contract.test.mjs green"]
  negativeControls: ["wrong-phase build refused", "replay requestId no double charge",
    "blocked socket no ghost spawn", "run end retires bodies"]
  testCommands: ["node --test test/swarm-fortify.test.mjs test/swarm-fortify-effects.test.mjs
    test/swarm-fortify-screen.test.mjs test/swarm-fortify-visuals.test.mjs
    test/swarm-fortify-event-bridge.test.mjs test/swarm-fortify-run-publication.test.mjs
    test/foundry-plate-contract.test.mjs test/surface-contact.test.mjs"]
  evidencePaths: [test/swarm-fortify.test.mjs, test/swarm-fortify-effects.test.mjs]
  risks: ["suite red → genuine device defect, fix at owner not test"]
  status: done
  result: "54/54 green on the full block, then 62/62 after DM-04 additions. All four devices
    are proven physical actors: real Rapier field movement, real hostile projectiles damaging
    structure hulls, canonical kill receipts, wallet idempotency, lifecycle teardown.
    Ordinary-route 10-wave/boss acceptance remains UNKNOWN (not measured this session).
    Scout flag: gravity beacon field registration is fire-and-forget — a build can debit for
    an inert hull if the field owner refuses (>=6 player-owned fields or flag off). Logged,
    not fixed here."

- id: DM-04
  baseSha: 3713cd0923d0eebe5fe920df5da3accc1546c775
  claimOwner: devin-dominion
  allowedPaths:
    - src/data/swarmFortify.js
    - src/systems/swarmFortify.js
    - src/core/physics.js            # 2-line predicate extension only
    - src/ui/swarmFortifyPanel.js
    - src/ui/orrery/swarmFortifyLayouts.js
    - src/render/swarmFortifyVisuals.js
    - test/swarm-fortify-reflector.test.mjs   # new
    - design/program/dominion/
  forbiddenPaths:
    - src/systems/asteroidSites.js, src/systems/drill.js, src/systems/worldSiteRuntime.js
    - src/systems/aiPorts.js, src/ai/perception.js
    - src/runtime/laneSystemFacades.js, src/ui/deckplate/screens.js, styles/prompt-deck.css
    - design/program/NOW.md, design/program/finish/**
  playerOutcome: "During refit the player builds an oriented Reflector Fin at a fortify socket,
    sees its slab footprint, face direction and predicted bank before committing; a bank-capable
    shot follows a measurably different reflected path per facing; the fin is real cover,
    destructible, repairable, and retires with the run."
  sourceOwners: [swarmFortify.js, data/swarmFortify.js, data/foundryPlate.js (reuse),
    core/physics.js (receipt normal gate), combat/surfaceReflection.js (law, unchanged)]
  dependencyIds: [DM-03]
  hypotheses:
    - "data.surfaceMaterial:'plate' + foundry:bank-plate proxy gives canonical ricochet for
      traited shots through the live sweep; untraited shots take the wall as ordinary cover."
    - "Facing carried on the build request → entity.rot + OBB manifest = different contact
      normals = different reflected velocity for identical incoming shots."
  acceptanceChecks:
    - "same bank spec, two facings → different outgoing velocity via real sweep receipt"
    - "build/refusal/replay/phase negatives green; socket occupied; hull damage → repair works"
  negativeControls:
    - "non-plate material target does not reflect (debris device unchanged)"
    - "edge-on shot cannot amplify speed (reflect is |v|-preserving by construction)"
    - "duplicate requestId, wrong phase, blocked socket, destroyed fin stops reflecting"
    - "run end removes fin entities; no leaked collider"
  testCommands: ["node --test test/swarm-fortify-reflector.test.mjs test/swarm-fortify.test.mjs
    test/foundry-plate-contract.test.mjs test/surface-contact.test.mjs"]
  evidencePaths: [test/swarm-fortify-reflector.test.mjs]
  risks:
    - "sweep only true-normals for roomOwner plates → 2-line predicate extension required"
    - "visual rotation must track entity.rot; verify with visuals test not just math"
  status: implemented
  result: "reflector_fin shipped: oriented foundry:bank-plate proxy (48x16.9 slab, plate
    surface), 4 socket-relative facings, facing-aware build command + read model + panel
    picker + slab/bank-arrow preview + worker-bridge DTO fields + mirror-face visual kit.
    Focused suite 8/8 green incl. real production sweep -> physics receipt -> resolveRicochet
    with speed conservation and facing-dependent outgoing velocity. Full fortify block 62/62.
    ui-bench crucible-fortify shot + walk clean. Awaiting adversarial review."
```

## Deferred / blocked tickets (recorded, not dropped)

- **DM-01/DM-02 (site UX + forensic repair):** `BLOCKED-PATH` — every write path it needs is
  foreign-dirty (`asteroidSites.js`, `deckplate/screens.js`) or controller-owned. Read-only audit
  recorded above; courier-visual flag open. Resume after the read-model extraction lands.
- **DM-05 (economist) / DM-06 (UX craft) / DM-07 (perf) / DM-R1/R2 (adversarial):** scoped to
  DM-04's diff — red-team happens as reviewer subagent on the frozen diff (self-review labeled
  as such, independent reviewer where the tool allows).
- **DM-B two-wave laboratory:** partial — reflector + existing devices + siege doctrine give the
  mechanics; a seeded two-layout A/B fixture is the next ticket after DM-04 lands.
