# Barn: a household's first provision

## Experience decision and route
The Free Book 4 Barn route already lets the player assemble six physical modules, receive a validated completion receipt and return to a named homestead. `faction_frontier.js::_tickSiteSeeding` gives ordinary planted sites two supply pods, but the dedicated mission frame bypasses that planting branch. Its existing receiving contact could therefore explain provision without furnishing a local first activity. This increment gives a newly completed dedicated Barn one tangible first provision: an existing payload body, not a new model or a new mission reward system.

The player sees a named household's message and a scannable 10t crate outside the existing receiving ring. The crate can be caught with the starting Pelican's real Massline, moved and winched into the household. `_tickHomesteads` remains the sole intake/payment owner. Building the roof now leads to one small act of keeping it inhabited, rather than only another explanatory line. This is later-route work, not a claim to have filled the beginning of Adventure.

## Ownership and source
Fresh remote fetch retained origin/master `f95de0eb1ba7560839209936afba48c7b96fe41a`. Coordination commit `6ebfabe9811d0fbff327a6586d0cb2290ba8d26a` reserves Lane B opening/first-hour/encounter/audio paths; those are deliberately untouched. Parent approved this disjoint route after no exact active claim was found for `src/systems/faction_frontier.js`. No held mission, generated encounter, asset, workflow or credential path was edited.

Five-path candidate:
- `src/systems/faction_frontier.js`: preserves earlier Barn receiving/provision hooks; sets pending only on a newly validated dedicated completion and invokes the helper before ordinary intake.
- `src/missions/barnFirstProvision.js`: finite issuance and endpoint search.
- `test/barn-first-provision.test.mjs`: eight focused tests.
- `test/homestead-provision-contact.test.mjs`: only first test title and expected arrival copy updated for actual nearby supply.
- This evidence note.

Exact prior owner snapshot `/tmp/faction_frontier.before-first-provision.js`, SHA256 `51b42766f652eff46413bb48a94e0587418d8834eb3e64c0e035b77c9cab46f4`; prior test `/tmp/homestead-provision-contact.before-first-provision.mjs`, SHA256 `2c4d4b98d1c12fab6f5780de5de69d1bde003a957c429898a1dbce52c55b7655`. Prior `barnReceivingContact.js` and `homesteadProvisionContact.js` remain dependencies, not new changes.

## Finite physical law
Only a canonical completed mission-only frame with matching current generation/site/mission and matching full homestead record may issue. Ordinary adopted sites retain their existing two pods and receive no bonus. Older completed saves lacking the new pending flag do not retroactively mint stock. An existing compatible site supply closes the request rather than duplicating it. Issued state remains latched after consumption, loss or recycled numeric ID. Spawn failure retries; a bounded obstructed search waits. The three search radii are 320/420/520 WU, outside the existing 200 WU intake. Endpoint clearance is a bounded radius-based check, not proof of a safe travel corridor.

The existing intake accepts supply cargo within 200 WU without requiring tether, release or speed. This increment does not change that law, fabricate delivery receipts, or pay directly. Persistent body flags and Frontier's existing serialized bag carry the crate and issuance state.

## Verification and corrections
Command:
`node --test test/barn-first-provision.test.mjs test/homestead-provision-contact.test.mjs test/frontier-barn-mission.test.mjs test/faction-frontier-expansion.test.mjs`

Author result: **56/56 pass**, including eight focused tests. Coverage includes actual canonical Barn acceptance/completion, real ordinary-site adoption, 201-versus-200 intake boundary, exactly-once supply grant, stale frame admission, blocked endpoint, failed spawn retry, compatible stock, moved persistent entity serialization, pending/issued owner deserialize and missing/recycled crate suppression.

Native Rapier probe uses actual flight inputs, cursor catch, line progression and winch on the starting Pelican. After fixture placement of the six building modules to complete the Barn, neither player nor provision is teleported. The pilot approaches through an outside staging point, catches the actual 10t Rapier body and tows/winches it into real intake. Result **96.22 simulated seconds, 0 player/crate impact events, 10t actual native mass, one supply delivery**. Actual credits rise330:140 `frontier_supply:2:1` plus190 from the pre-existing hungry-lead verification `frontier_lead:lead:2:0`. The test captures all grant reasons and checks their exact sum;330 is not a newly authored supply reward.

Initial native assertion wrongly expected only140 credits and exposed the existing lead reward; corrected accounting, not gameplay. An initial170WU pilot endpoint reeled the crate into the pilot before intake, producing69 contacts. Moving the actual flight endpoint to140WU gives the clean final path without changing physical law or teleporting bodies.

## Limits and next action
This is source/local-test evidence, not rendered acceptance, publication, integration or user acceptance. The native test fixtures the completed construction, not the entire six-module build or a full campaign journey. Save coverage exercises the real entity serializer and Frontier owner deserialize in the same simulation; it does not prove fresh physical entity reconstruction or full disk Save/Continue. No visual screenshot or full environmental navigation guarantee is claimed. Next acceptance action is play the completed Barn, acquire this finite crate in the rendered game, then save/reload it both moved and consumed. Keep SF-GAME, SF-LIVING-WORLD and SF-SECTOR-COHERENCE open; this bounded activity does not complete them.

Independent read-only review: 56/56 reproduced, final source and evidence approved within these limits. CRLF-aware diff check passes; original owner line endings preserved.
