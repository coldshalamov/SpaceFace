# Mutual aid has a receiving household

## Experience decision
The existing Frontier aid marker gives the carrier a destination name, but `_tickDebts` receives it at a center-distance boundary that was invisible. The earlier pickup increment made the marker physically carryable and staged it outside the creditor. This increment completes the readable handoff: a nonphysical receiving circle follows the actual debtor household, and that household explains that the marker belongs inside the circle, not against its solid walls. After real owner settlement, its response distinguishes carried aid from an ordinary supply delivery that covered the same obligation. A lost or expired marker closes its guide instead of leaving a false destination.

This extends the existing Book4/Frontier neighborhood route. It is not a new economy or new encounter chain, and does not claim to fill the opening while Lane B owns opening work. Fresh remote remains `f95de0eb1ba7560839209936afba48c7b96fe41a`; Lane B coordination reservation from `6ebfabe` is respected. No encounter/onboarding/first-hour/audio, held mission, asset-production or security/workflow path was edited.

## Exact ownership and implementation
Four paths: `src/systems/faction_frontier.js`, new `src/missions/frontierAidReceiving.js`, new `test/frontier-aid-receiving.test.mjs`, this note. Prior owner snapshot `/tmp/faction_frontier.before-aid-receiving.js`, SHA256 `be21323d1a088c65ca56f2db2e63a8d2a82ea379cafe91f6376f40cf31cdc971`. All prior Barn/provision/pickup hooks preserved; those remain dependencies, not new deliverables.

The owner calls the helper after `_tickDebts`, so it sees synchronous carried/lapsed state rather than inventing a receipt before settlement. The survival fast path also reconciles guides. Each new debt stores its recipient generation; fresh save remapping updates that generation only when the actual saved-ID stead mapping succeeds and the debt generation matches the pre-remap saved stead generation. A mismatch or missing trusted mapping explicitly invalidates the guide binding. An old debt with no stamp retains all old payment and arrival behavior, but gets no new guide or narration. No migration guesses a recipient from a recycled numeric ID.

The guide requires the living exact recipient and, while open, the exact living marker/aid ID/generation. Its radius is the same existing260WU plus current recipient radius. It is `physicsBody:false`, `collides:false`, untetherable, and does not move cargo. It updates with the actual recipient center and radius. Mode, sector, loss, generation mismatch, closed/deleted debt and orphaned guide remove it. A guide is an eligibility illustration, not a collision shield or safe corridor. Its solid-hull warning is deliberate.

Narration requires a local living undocked pilot within650WU of the actual recipient. The once-heard memory is on the existing serialized debt row, not a separate reward ledger. Arrival, carried/covered settlement and lapse are different lines. A settlement line reports the historical obligation being paid, not an assurance that a household can never become stranded again. Old closed records may later be garbage-collected by the existing owner; the helper never keeps obligations alive for narration.

## Verification
Command:
`node --test test/frontier-aid-receiving.test.mjs test/frontier-aid-pickup.test.mjs test/faction-frontier-expansion.test.mjs test/barn-first-provision.test.mjs`

Author result **52/52 passing**, including ten new tests. New checks cover real `_tickDebts` arrival at320WU with60WU frame, exactly-once existing payment, ordinary supply-covered alternative, no guide-authored cargo movement/payment, live radius/center updates, marker and recipient generation rejection, replaced homestead at the same ID, sector/menu/survival cleanup, docked pending voice, invalid contact-memory normalization, lapse and no replay after owner deserialize, orphan cleanup, and real fresh persistent entity restoration plus trusted recipient-generation rebind.

The fresh restoration test uses actual entity serialization and `_spawnPersistentEntities`, Frontier deserialize, saved-ID mapping and `save:loaded`; it is not just JSON-cloning a flag. The earlier native pickup/carry test also runs with the new production helper hook and remains green:383.95s, actual12t, one320-credit aid payment and31 impact events. This is regression evidence only; it does not newly prove rendered ring visibility, guide contact geometry or collision-free travel. The first new fixture assertion incorrectly compared a SimVector3 instance with a plain object; corrected to compare coordinate values, with no gameplay change.

## Acceptance limits and next work
This is reviewed/tested local source, not publication, integration or user acceptance. New guide-specific proofs are owner fixtures and fresh restoration seams, not full campaign discovery, rendered layout or UI/disk Continue. The prior route's31 contacts remain unresolved and explicitly prevent a clean-flight claim. Play the visible receiving ring at moved and restored households, inspect scanner/readability, and reduce those contacts before calling the carry polished. SF-GAME, SF-LIVING-WORLD and SF-SECTOR-COHERENCE remain open. No screenshot or new model claimed.

Review caught a genuine restore edge: blindly rebinding a debt to a same-ID replacement household could revive its guide after load. The final owner preserves the old saved stead generation, requires the debt to match it, and nulls mismatches. A ninth fresh-restore regression covers this replacement, including possible numeric-generation coincidence in a new simulation.

The tenth regression removes the recipient entry from the actual fresh saved-ID map while the numerical body survives; the presentation stamp is invalidated rather than accidentally trusted. Legacy debt mechanics remain unchanged.

Final independent read-only source/test review:52/52 pass, CRLF-aware diff check clean, both restore identity edges covered. Approved within the rendered/full Continue/31-contact limits above.
