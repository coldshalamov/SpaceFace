# Repository audit: strengthen the encounters, not the inventory

## Conclusion

SpaceFace's source already contains much of what a generic expansion pitch would call missing: named characters, a witnessed-memory rival, physical enemy roles, civilian jobs, salvage consequences, alien fauna, precursor institutions, authored places, and a real planetary interaction. The strongest opportunity is to make this breadth easier to perceive, learn, care about, and revisit. That conclusion is an interpretation of the inspected source plus the user's reported experience, not a measured player-study result. [R02,R03,R05–R13]

The governing design question is: **What new decision, relationship, or discoverable consequence does this object create?** A new mesh with an old health bar does not qualify on its own.

## Existing strengths that must survive

The owner's vision explicitly couples physical agency with a working local world and asks for complex-looking outcomes from simple, dependable actions. The current engineering notes preserve XZ-plane simulation, fixed-timestep state, existing single writers, the selected tactical AI / flight path, Forge assets, and the ORRERY interface direction. The report therefore proposes additions to existing owners rather than a replacement engine, control scheme, UI shell or economy. [R02,R03,R04,R07,R14]

`enemies.js` already differentiates light throw-weight craft, ranged disengagers, escorts, raiders, a field anchor and tether specialist. Mirrorjaw and Forge Regent already use physical geometry/counterplay. New enemies here must add a distinct action problem, not relabel those rows. In particular, Scissorwake is an explicit engineered line-cut attack; it may not weaken ordinary Massline strength. [R05,R06,R14]

`alienFauna.js` already contains a noncombat drive grammar and a scan-sensitive Veil-Ray. `precursorMachines.js` already defines auditors, couriers and conservators under protocol state rather than normal faction reputation. The Anvil and Cinder Nursery already have map-visible identities. This plan expands encounters around these, rather than pretending they are new discoveries in the codebase. [R08,R12,R13]

## Gap diagnosis and response

| Experience question | Observed foundation | Proposed response | Confidence boundary |
|---|---|---|---|
| Can I tell what my chosen run item does? | Registered draft/supply/run systems and ORRERY direction | Pip & Spanner; later Sable's demonstrations | UI weakness is user-reported, not reproduced here |
| Can I read an approach before the dock refuses it? | Docking corridor and station broadcasts | Latch Nine | Specific new character is proposed; docking is not absent |
| Can I predict the consequence of taking this crate? | Claims, cargo, contact hails and provenance | Tally-3 and Pallet Jack | Full ownership flows require runtime tests |
| Does an enemy demand a different physical answer? | Existing specialists and attack doctrines | Scissorwake, Kilnback, Mothlight | New compositions/counters require playtesting |
| Does an escort have recoverable partial outcomes? | Traffic, missions and fragile cargo | Ilex Seed Ark | Existing mission inventory was not exhaustively searched |
| Will a familiar person recognize meaningful help? | BRACKET, rival memory, registered MORROW/VESPER | Towline Table; Red Kite's noncombat rivalry | Do not overwrite or duplicate existing personalities |
| Is working infrastructure physically understandable? | NPC jobs, actual transfers, machinery | Tethys Switchyard and Borrowed Sun | Reachability and frame time are unmeasured |
| Does a location invite a question? | Salvage and authored places | Last Shift, Thimble Door | These are proposed authored sequences, not missing engines |
| Can alien encounters reward observation rather than killing? | Fauna stimuli and machine protocols | Nursery, Borrowed Voice, Open-Hand Lock | Preserve revelation and canon gates |
| Can I point at a lasting consequence I helped cause? | Story, provenance and chronicler systems | Hundred-Hand Mile | Compose existing memory; do not build a second chronicle |

## What not to add

Do not add another generic drone companion, mystical precursor oracle, passive-money faction, reflective boss, parasite civilization, full-screen HUD redesign, or second planet with the Anvil's existing verb. Do not treat code absence as established merely because one search found nothing. Each packet contains an explicit overlap check. [R03,R06,R08,R10–R14]

Do not spend all twenty additions at once. No amount of content makes a frozen loading screen feel authored. Start with safe, high-frequency interface/service improvements while preserving a separate stability gate for camera, collision and streaming work. Performance failure is not permission to silently remove the art direction; reduce duplication, allocations and residency first. [R03]

## Comparative lessons, not reskins

Outer Wilds: connect an observable anomaly to a question the player can investigate. Applied to Last Shift and Borrowed Voice. [E01]

Into the Breach: visible intent can coexist with hard decisions when displacement, civilian stakes and interactions compound. Applied to the cutter and cargo thief; real-time warning windows must be tested rather than copied from turn-based play. [E02]

Hardspace: Shipbreaker: physical objects become engaging when inspection, handling and hazards form one chain. Applied to Tally, Ilex and the switchyard. [E03]

Hades: recurring characters can make repeated attempts meaningful through concise state-aware responses. Applied to Pip & Spanner and Red Kite, without copying their narrative or presenting every repeat as fresh content. [E04]

Endless Sky: several livelihoods can coexist without forcing one activity. Applied to alternative jobs, bypass routes, cargo rescue and optional story participation. [E05]

All adaptation choices above are design hypotheses. The acceptance tests specify how to try to falsify them. Sources and pinned links: `SOURCES.md`.
