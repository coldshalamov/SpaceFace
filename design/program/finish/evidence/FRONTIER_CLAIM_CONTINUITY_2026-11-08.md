# Keep the salvage haul the pilot has actually taken up

## Experience decision
The previous household salvage scene had a real limitation: an ordinary unpinned ambient hulk is absent from the persistent-entity snapshot, so even a pilot actively carrying it could lose the physical job on loading a save. This increment preserves the specific haul after an authenticated player attachment takes it up. Background hulks do not all become durable, and no free replacement is manufactured.

The pilot can catch a filed hulk, move it, save its actual position and return to that same body and claim. The player may need to catch it again; this does not promise restoration of the live line. Actual settlement still consumes the hulk through the existing owner and pays once. If the claim lapses or is jumped while the body survives, this scene releases only its own retention, so an old claim does not permanently pin an abandoned wreck.

Fresh remote remains `f95de0eb1ba7560839209936afba48c7b96fe41a`; Lane B remains reserved. This is disjoint continuity for the current Frontier physical scene, not newly completed opening content. No reserved/held source, new assets/models, publication, worktree or security/workflow changes.

## Exact ownership and law
Four paths: isolated `src/systems/faction_frontier.js` hooks, new `src/missions/frontierClaimContinuity.js`, new `test/frontier-claim-continuity.test.mjs`, this note. Before owner `/tmp/faction_frontier.before-salvage-carry-save.js`, SHA256 `feb0bcac2837a4e1a84b93e1e13d6c85ee58edc20b1726ed594da43d967908c3`. All earlier Frontier scene helpers and save-generation mapping are preserved dependencies.

Only an already-open claim with exact living wreck identity/tag/generation can be retained. It must have a current active player attachment whose ID, owner, target and both occupant generations match the live player and wreck. A historical throw field, target ID alone or wrong-generation line is insufficient. Existing persistent/pinned/mission/world-record bodies are not adopted by this helper. In particular, no global protected-content admission exception is introduced.

Retention sets the existing persistent flag and an exact claim retention tag; no body mass, pose, force, payment, claim radius or expiry changes. Existing save entity serialization and Frontier ID/generation rebinding carry it forward. Open claims keep the body through subsequent release of the line. Settlement removes the body as before. Lapse/jump releases only the same live generation carrying this helper's exact tag; a later mission/world owner is not unpinned. The retained bit on the claim is historical bookkeeping, not a second physical actor.

## Verification
Command:
`node --test test/frontier-claim-continuity.test.mjs test/frontier-salvage-choice.test.mjs test/faction-frontier-expansion.test.mjs test/frontier-aid-receiving.test.mjs`

Author **51/51 pass**. Four new tests cover no retention before a real attachment, wrong target generation rejection, actual moved-body serialization, no reward from retention, own-body release on lapse/jump, recycled-body/later-mission preservation, protected/world-owned rejection, and native save/restore/re-catch/settlement. Existing tests still prove unhandled ambient hulks are omitted and lapse honestly; retaining a carried hulk does not contradict that background behavior.

Native test uses starting Pelican flight, real cursor attachment and actual line progression. Two stationary homesteads and a12t eligible hulk are fixture-established; after boot neither pilot nor hulk is teleported. The pilot catches and tows partway, saves at **60.25 simulated seconds**, serializes persistent entities/Frontier, and disposes that native simulation. A fresh Rapier simulation boots the player at the saved pose; actual `_spawnPersistentEntities`, saved-ID map and `save:loaded` rebuild the saved hulk and claimant bindings. The restored hulk position matches the saved position. The pilot recatches it through normal input and physically delivers it. Final **92.30 simulated seconds**, one260-credit claim payment and no surviving retained duplicate. There is **one post-restore relevant impact**, so this is not a contact-free claim. Pre-restore contacts are not counted by this test's post-restore observer.

This proves the entity/owner/native restoration route, not a full UI/disk Continue, serialized attachment restoration, a campaign reached without fixtures, or rendered acceptance. Expiry uses the saved simulation clock in the harness; no elapsed real-time promise is made. CRLF-aware diff check passes.

## Remaining acceptance
Use the rendered game's actual save/load UI during a real carried claim, inspect the returned hulk and receiving choices, and verify recatching is clear to the player. World-record salvage is deliberately excluded from this new retention helper and follows its existing world owner. No screenshot, publication, integrated build or user acceptance is claimed. SF-GAME, SF-LIVING-WORLD and SF-SECTOR-COHERENCE remain open.

Independent review found a bounded malformed-save/ledger-eviction gap: if normalization drops a retained claim row without running its close path, a body can retain this scene's tag/persistent flag as an orphan. This increment does not guess ownership and unpin such bodies globally. Normal settlement/lapse/jump paths are tested; conservative orphan-retention reconciliation remains explicit follow-up work, and arbitrary malformed/evicted-ledger recovery is not accepted here.

Final independent read-only review approved the bounded source/tests/evidence:51/51 pass, with orphan-retention recovery, UI/disk Continue and tether restoration still unaccepted.
