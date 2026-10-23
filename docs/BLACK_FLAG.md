# BLACK FLAG integration

Implementation branch: `feature/black-flag-shipjack`. This is a substantial integrated
work in progress, not acceptance of the full expansion commission.
[Player controls and discovery](BLACK_FLAG_PLAYER.md).

The starting inventory found real ship fitting/cargo swaps, surrender towing, law,
provenance, station Shipworks, missions and automation. Those owners remain authoritative.
The missing seam was transferring control between two living bodies without replacing
the incoming hull with the outgoing loadout or manufacturing clean title.

| Facts / responsibility | Source of truth |
|---|---|
| Owned membership, active index, fitting, module inventory and derived stats | `src/systems/ships.js`; transaction helper `shipControlTransfer.js` |
| Vessel identity, title, custody, sector-local footprint, bounded history | optional `player.shipjack`, normalized by `src/shipjack/model.js` |
| Readiness, incident contest, boarding pod, transfer dwell and rematerialization | `src/systems/shipjack.js` |
| Live poses and impulses / live subsystem damage and shutdown | existing physics authority / combat kernel |
| Quotes, inspection and disjoint valuation | `src/shipjack/market.js` |
| Physical yard jobs / ships-owned inventory mutations | `yardOperations.js` / `ownedOperations.js` |
| Paid finite retrieval and berth transport | `fleetOperations.js`; pure save normalization in `fleetPersistence.js` |
| Wages, board acceptance, objectives and completion | existing missions owner, `src/missions/blackFlagMissions.js` adapter |
| Credits / cargo / witnessed crime / existing lawful recovery | economy / cargo / lawSecurity / surrenderRecovery |
| Flight interaction / station registry | existing prompt deck plus `src/ui/blackFlag.js` / `blackFlagRegistry.js` |
| Authored encounters / equipment | `src/data/blackFlag.js` / `shipjackEquipment.js`, merged into canonical module catalog |

## Physical contract

The native target body becomes `playerId`; both bodies retain their exact poses, motion,
damage, cargo and module identities. The outgoing body loses player authority and becomes
a parked hull. The incoming body's traffic/world lease is released before its persistence
owner changes. Captured membership is provisional; registration is a separate transaction.
Ordinary station switching still uses the existing contract, with saved parked damage
restored rather than healed. Target locks, cruise, weapons and Massline have explicit
handoff policies. A persisted transfer journal rejects repeated commands. The diagnostic
kill switch is `state.flags.blackFlagControlTransfer = false` (or
`state.settings.gameplay.shipjackHandoff = false`).

The contest reads actual shields, drive/weapon capability, line of sight, relative speed,
spin and a generation-validated live Massline attachment. Entry speed is 14 WU/s with
18 WU/s hysteresis; service range is 115 WU. A service pod is a shootable mining-drone
body driven toward the moving aft port. It must match motion and dwell to open a finite
window. This is the physical timing stunt; broader stunt/device acceptance is unfinished.
Pulse isolation and temporary shutdown affect the combat/flight owners, not just a label.
An explicit moving-target rendezvous holds an 80–100 WU trailing position using bounded
thruster forces, real authority and resource demand. It matches velocity rather than parking
at absolute rest. Manual input cancels it; targets beyond the available flight envelope are
refused. A native Rapier fixture holds a ballistic 44 WU/s target inside the boarding bands.

## Conservation and persistence

Quotes fingerprint operative inventory, condition, title, lien, buyer demand and service
facts, expire in simulation time and are revalidated. Shell and installed-component value
are disjoint. Intact sale/return is blocked for the active hull and nonempty holds. Engine
extraction removes one exact instance and disables the real drive. Repair restores its
actual subsystem. Forgery consumes an actual module; it never erases title or WANTED.
Credit settlement uses economy's exact/full payment path and terminal receipts.

No optional section is allocated before an Adventure interaction. Other modes refuse
commands and content. Save restoration replaces optional state, including when loading
an older slot. No halfway control transfer is restorable. Locations use sector-local
coordinates; rematerialization converts once and applies bounded drift. Only the explicit
shipjack materialization owner can recreate a hull; ordinary world-owned targets stay
with the existing world owner.

Caps: 96 admitted vessels, 8 active attempts, 12 history entries/vessel, 32 claims,
96 recent receipts, 2,048 terminal identifiers, 8 yard jobs, 8 retrieval jobs. Saturated
identity/terminal stores refuse new admissions rather than forgetting owned property or
reopening paid operations. Full-save growth depends on actual assets and fittings.

## Intersections chosen

Ranked by visible choice, reuse and persistence relative to integration risk. The first
eight have concrete code paths and focused coverage; the remaining intersections were
considered but are not claimed as shipped systems.

1. Physical control handoff + cargo: leave a real ship with its own freight.
2. Component identity + drive authority: extracting an engine strands its source hull.
3. Title + canonical resale: fly hot property while honest yards refuse it.
4. Signature hardware + inspection grade: a false broadcast passes shallow checks only.
5. Crew terms + proof recorder: documented safe recovery improves its service payment.
6. Boarding + existing live drone physics: moving service-port attachment windows.
7. Fleet footprints + sector graph: finite paid retrieval rather than passive profit.
8. Mission receipts + prior world actions: recognize out-of-order recovery and extraction.
9. Named claimant memory + a later recovery contractor: not yet implemented.
10. Rival tug + contested custody: not yet implemented.
11. Insurance audit + deliberate damage evidence: not yet implemented.
12. Supply shocks + fence procurement: not yet implemented.

## Verification and open acceptance

Component resale is owned by `ships.sellModule`; pure quotes and inspection findings
come from `shipjack/componentProvenance.js`. Registry sends an exact-instance quote through
`ui:shipjack`. `player.moduleSales` stores at most 1,024 terminal receipts and fails closed
on malformed/saturated input. Save restoration clears absent journals, preventing a later
slot's sales from leaking into an earlier campaign. Honest yards reject disputed parts;
named fences pay a condition-based cut. Ordinary unfit, refit, yard extraction and shell
return preserve the first source, including after save/load. Installed parts remain
detectable by capable inspectors even in an otherwise clean hull.

Focused checks passed across state, combat, handoff, actual runtime owners, yards,
fleet retrieval, mission settlement and UI/content. Independent economic review found
ordinary resale bypassing title and station switching healing parked damage; both were
fixed with regressions. Actual save-envelope continuation also exposed an unusable receiving
port and dock suspension preventing ready extraction settlement; both were corrected. Job
quotes now bind economic facts rather than invalidating work on a narrative ledger notice.
The latest owned batch passed 122/122 Black Flag, public-dialog and surrender-recovery
checks (`node --test --test-concurrency=1 test/black-flag*.test.mjs
test/player-truth-first-light.test.mjs test/surrender-recovery.test.mjs`).
A 10,000-event normalization test produced 168,089 JSON bytes
under the configured caps. That is a bounded fixture, not a whole-save measurement.

Desktop and 390px touch station benches rendered and exercised quote/back controls.
Public menu-to-flight runs discovered the Empty Seat and exercised approach, scan, crew
terms, Massline, port access and helm claim. They exposed opener steering and a mismatched
handoff range, both corrected. Complete browser monetization/save/reload and illicit
prototype playthrough acceptance are still pending. No full-game performance claim.

The later public route isolated a real owner conflict: hailing an evacuated frame created
a crew surrender record, whose escape/despawn timer removed the prize. Empty frames now
skip that crew path; powerless crewed surrenderers retry escape only after actual drive
restoration. A recycled numeric body ID can no longer redirect the recovery course.
Lost physical signals retain a plain-language last-trajectory record without inventing
destruction, ownership changes or a paid recovery of an unconfirmed body. Tow requires
a generation-valid Massline to that exact hull, independently of peaceful crew terms.
The live scanner emits `scan:pulse`; custody and the flight panel now consume that actual
owner event. Dismissing a link and reselecting the same vessel reopens it. Unarmed fits
read as “no armed hardpoints” instead of reporting a healthy generic weapon subsystem
as a live gun.

Starter recovery keeps the real Mule and its real mass. A living, actually drive-disabled
hull with generation-valid peaceful recovery consent can accept a basic Massline as a
tow load. Rocks, powered defenders, armed autonomous frames, occlusion and stale actors
retain their gates. Scored selection and Ctrl-nearest revalidate the same rule; existing
scripted onboarding catches retain their exemption. Six native integration checks passed.
Two adjacent tether tests still fail identically with pre-change owner source: a missing
`root.remove` in a UI mock and a T04 fixture selecting station 52 instead of hostile 50.

The broad baseline run did not pass: golden hash mismatches, an unrelated automation
assertion and a Massline timeout remain. Committed HEAD also mismatched the V3 golden,
but feature snapshot equivalence has not been established. Player-truth failed at the
opening First light prompt, then a later candidate timed out during page navigation; its
public dialog handler was corrected, but the gate still has no gameplay acceptance.
Do not treat these as a passed gameplay landing gate.

Two causal continuations passed through checksum-valid `save.serialize()` → `loadEnvelope()`.
These are source integration fixtures, not browser transcripts:

- Lawful: hail Empty Seat → honor crew passage → secure its damaged frame → receive at
  Helios → save/load → return for 1,071 credits plus 300 employer wages → save/load → retry
  the return. Final: 6,371 credits from 5,000, one retained hull, seven original iron,
  no loose modules, claimant title returned; no second payout.
- Illicit: disable Blackbird → secure disputed custody → transfer the physical helm,
  leaving Hitch and seven iron → save/load → reverse into Hitch → deliver to Tethys
  Trade Hub → honest yard refuses sale/title → unload two electronics → repair the
  unique governor for 5,040 → extract that same instance for 1,120 → save/load → retry
  both services. Final: 4,440 credits from 10,000 plus 600 wages, two hulls, one repaired
  governor, retained freight, Blackbird's drive missing and title disputed.

Missing from the full commission: the complete four-act campaign; rival cutter custody
AI; counter-theft raids; insurance fraud and lender negotiation; recurring recovery-agent
careers; broad fleet employment; bespoke Forge clamp/cradle/cutter assets; comprehensive
normal-camera, mobile GPU, audio and end-to-end save acceptance. Twelve bounded job
patterns reuse real verbs; they are not eighteen independent new mechanics. The expansion
must remain a draft until these gaps and the player-truth gate are resolved.

Living-pilot NPC rescue remains incomplete. A native attempt using the existing SF-138
tender reached the port but left its passenger orbiting outside the authored 20 WU /
12 WU/s berth. The frame coupler deliberately applies radial force without transverse
frame matching (`sg02DynamicBodyOwner._applyFrameCoupler`). Unvalidated controller changes
were removed. Distress currently marks a truthful beacon; it does not advertise accepted
dispatch. Retained-hull reversal and player-controlled Massline towing remain available.
