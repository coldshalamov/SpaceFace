# Neutral bounty chase: real refuge authority

Date: 2026-10-23. Follow-up to PR539 guild-choice fix, parent abf07a2ecd99295f2693cf7bc3a1fe0856e7020d. Status: reviewed source candidate, not accepted.

## World behavior
A quarry in actual Io Reach could previously end pursuit under supposed station guns at a jump-gate proxy or the outlaw mercantile station, neither of which supplies protection under engagementAuthority. A refuge is now a live named non-gate station with the existing lawful faction eligibility (including the existing Helios exception) and existing spatial protection. Shared LAWFUL_STATION_FACTIONS is reused. No shared authority, faction policy, Save schema or reward changes.

Spatial protection can belong to a neighboring lawful port. Therefore selection does not require the authority's first returned station to equal the candidate: legitimate overlapping lawful ports remain valid, while gates and outlaw facilities cannot borrow another port's jurisdiction to masquerade as a refuge. Non-finite query/candidate coordinates fail closed; legitimate zero remains valid. Existing scan range, strict arrival threshold at420WU, flight behavior, assisted gratitude and reputation rules are preserved. The earlier hunter-guild award fix remains intact.

## Tests and review
49 distinct cases pass:18 new refuge,4 existing gratitude,14 survival and13 guild-choice tests. Matched refuge baseline10/18 passes and8 fail; candidate18/18 passes. Independent review repeated that result and also ran13 guild+4 gratitude tests. Actual Io entities provide gate/outlaw/lawful controls; positioning, damage and death are fixtures, not flown acceptance.

Existing bounty-escape-gratitude positive fixtures omitted a faction from station_refuge. Original fixtures passed4/4 on baseline and1/4 on corrected production. The only compatibility edit labels that intended lawful refuge faction_free; every assertion remains unchanged,4/4 pass. New negatives cover actual gates/outlaws, overlapping protection, removed/dead/unnamed identities, nearest lawful alternatives,419/420 boundary, no-assistance and disqualifying damage, top-level identity/faction fallback, malformed inputs and valid zeros.

Bounded reviewer census across25 actual authored sector initializations found5–20 station-shaped entities and0–6 eligible lawful facilities. Conservative extra authority visits max114 per active quarry update, Io80. This is a bounded loop observation, not measured FPS or native-flight performance acceptance.

## Qualification and continuity limits
Current master3e5ef7a7719a6f637649d594fb6f5110096abb69 merged UI changes after the initial guild source qualification. The executed1010-input guild graph required exactly one override: constellationLayouts.js blob80c30c8bffbd303dd34faecbd4fd05482f4e701a. All other7 changed paths were absent; unchanged13+14 checks passed again. Refuge final graph has1012 effective inputs, sorted SHA256a553205c7e2150bfac1b15febaa075fb73c5a9fc5a7b7bb418bf9f2a70841be2. Qualification covers the executed closure, not the arbitrary filesystem or a rendered full boot.

Save retains settled player credits and standing but does not restore the unfinished fixture chase. Authored design describes an ambient glance encounter and does not establish a persistent-contract requirement. This patch does not claim an unfinished chase ledger or change shared Save/world owners.

## CI registration and commands
The initial PR539 package added check:bounty-choice-standing as an alias but omitted scripts.check registration. This follow-up explicitly appends both focused gate aliases to scripts.check, preserving all previous entries. The earlier workflow must not be cited as execution of that omitted gate. Next-head matrix inclusion and command/TAP results require separate remote verification.

Run npm run check:bounty-choice-standing and npm run check:bounty-refuge-authority. Named adjacent command: node --test test/bounty-quarry-survival.test.mjs. No aggregate local suite or excluded anvil receiver test was run. No merge, deployment, live-camera or player-acceptance claim. All larger goals stay open; next development priority is character/faction motivations grounded in actual lore and expressed through playable behavior.
