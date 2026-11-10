# Neutral bounty-hunter choice standing

Date: 2026-10-23. Public base: e648f4eac42d387253d46104ec7c5503428d11a3. Status: reviewed source candidate; not merged or accepted.

## Player consequence
The existing ambient neutral hunter/quarry choice promises a 200-credit collector cut and +4 standing with the hunter's guild. settleQuarryDown cleared every matching hunter's contractTargetId before looking up that guild, so the credit cut was paid but the direct guild award was lost. Capture the existing first-match faction before release. No amount, eligibility policy, event contract, registry, placement or Save schema is added. Existing faction spillover is retained; other guild standing may legitimately change through that owner.

The existing staged chase may occur during ordinary free flight, including Io. This is not a new Io-exclusive encounter. design/revamp/detail/B_traffic_pirates.md describes neutral quarry hunters and help/defend outcomes. The separate hostile bountyOnly encounter is not this neutral choice.

## Verification
Matched baseline: 6/13 passed, 7 failed. Candidate: 13/13 passed. Named adjacent bounty-quarry-survival suite: 14/14 passed, for 27 distinct cases total. Independent review repeated the baseline/candidate result and verified the only production change is moving faction lookup before release plus a comment.

Cases cover direct recipient versus ally spillover, matching versus unrelated hunters, multiple factions with existing first-match selection, absent/factionless hunters, unrelated death, duplicate death, separate legitimate contracts, surrendered quarry execution, defending the quarry, actual ambient staging followed by injected death, and Save/Continue limitations. Production economy, factions, world and Save owners were loaded. Combat death and player placement are fixture inputs, not flown combat.

Save retains settled credits and standing, but the selected-world fixture's unfinished chase entities are absent after Continue. This patch does not establish unfinished chase or bounty outcome-ledger persistence. The orphan replay check must not be mistaken for restored chase continuity. That gap remains open.

## Source qualification
The executed candidate graph contains 1,010 inputs, manifest raw SHA256 c5401e863d548b4db27592642a5a977870f591c2ae6a132ec899f88a66c0496c. Overlapping executed inputs match the verified 5491567666b94a74e01b0a1a5848af0b73d3d1e5 graph; its delta to e648 is documentation only. Additional production inputs independently matched e648 blobs: bountyHunters 1cdd6c306fda5e5af52d698693784b9212b1fb97; mineLayerVerb c549e2647bc13f0fcc67e7385e05200d1bddc860; countermeasures d7bcaea7f06fb0ae877bf989e84da5200a73cb9d; perception bd19d11b9b5d42483146600ac52a1df6b9fff8a1. This qualifies the executed ESM closure, not the whole arbitrary filesystem or rendered game.

## Reproduction and limits
Run npm run check:bounty-choice-standing in the repository. Adjacent command: node --test test/bounty-quarry-survival.test.mjs. No full aggregate suite or excluded anvil receiver test was run. No live camera, native flight, FPS, full-game or player acceptance claim. All larger game, living-world, sector-coherence and recovery goals stay open. Next: qualify pending chase Save/Continue behavior with the current owner before proposing persistence changes.
