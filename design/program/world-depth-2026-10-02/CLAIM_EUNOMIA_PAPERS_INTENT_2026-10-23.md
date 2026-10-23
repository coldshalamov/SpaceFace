<!-- LIFETIME: DURABLE -->
# Claim: Eunomia papers service intent, 2026-10-23

Owner: dot's Eunomia implementation; root review/integration/publication. Allocated, not implemented or accepted. SF-LIVING-WORLD, SF-SECTOR-COHERENCE, SF-GAME and SF-PLAY-WORLD remain open.

## Reproduced behavior and design decision

Existing supported nearby jettisoned cargo washing at actual station_eunomia works through pirateDisguise, economy, legal stamps and ledger. Eight narcotics charge1613credits once, retain commodity and become legal under current game policy; classified salvage charges381 and remaps to ordinary salvage. Actual Save/Continue and leave/return preserve stamp, receipt and pod identity. Separate fresh pods do not inherit the stamp. Short-credit denial preserves stock/credits/pod/player receipt. These are bounded owner/API fixtures, not full flight/UI acceptance.

The concrete defect is automatic player payment for unrelated cargo: a foreign-merchant narcotics pod, not selected/towed/collected by the player, within200WU causes docking alone to debit5000→3387 and wash that foreign pod. Nearby processing is described in source, but checked design does not justify charging for unrelated cargo. Do not call an absent button itself a defect.

A bare ownership filter is unsafe: real Continue remapped player375→1 while persistent pod owner fields remained375; repeated saves lose the original remap history. Foreign-title stolen/towed cargo can also be legitimate service input. Do not introduce another saved custody registry or rewrite title to compensate.

Routine design decision: make washing an explicit per-pod quoted service under the existing owner. Docking, opening Market and requesting quotes are read-only. The player sees a current pod and exact cut, then deliberately confirms that pod. Legacy and foreign-title goods remain serviceable without inventing ownership. Current price/reputation/remap/title policy remains unchanged.

## Exact allocation

- src/systems/pirateDisguise.js: remove generic automatic docking charge; quote/confirm actions on existing dock:launder intent. Bounded transient owner-issued quote records bind actual player/pod/station objects and generations, sector/dock epoch, contents/title fingerprint and fee. No saved quote/custody schema or new economy writer.
- New src/ui/station/launderService.js: isolated service panel listing pod identity/units/title and explicit exact-price control; worker-safe request/reply and context/request identities.
- src/ui/station/screens/market.js: laundering-only onShow/refresh/dispose integration beside existing receipt. BUY/Sell handlers, trade quotes, click/time gates and PR463 protection unchanged.
- src/ui/dockArrival.js: truthful service guidance about choosing a nearby physical hot pod in Market,200WU range, quoted cut and unchanged ownership. No claim that only player-owned pods qualify.
- New focused owner and isolated UI/worker-event tests; existing PQ151/PQ177 laundering tests updated only to express deliberate confirmation while preserving fee/customs expectations.
- Scoped report and root-owned additive named package gate after review.

All45 open PR file lists were checked: no exact-path hits in these existing production/laundering-test files. Recheck before delivery. Save/attachment/traffic/mining/cargo/legality owners remain excluded. Before edits, enumerate existing intent/mutator callers and authored parcel/mission dependencies; do not strand an existing contract or invent another objective. Any additional path needs root scope review.

## Transaction and lifecycle contract

Confirm accepts only an owner-issued transient quote token, not UI pod ID/price/ownership assertions. Revalidate actual current live references/generations, station eligibility and docking context, range, quantity/commodity/legality/title fingerprint, current price/reputation and credits. Reject changed/stale/recycled quotes with no partial charge/stamp/receipt. Consume each confirmation once before mutation, preserving existing economy and ledger writers. Tokens cannot be reused after reset.

Invalidate pending quote/view state across dock/station/screen/sector changes, Close/Back, New Game and Continue. Stale worker replies cannot remount an obsolete panel or enable controls for a prior context. Save completed stamps/ledger through current owners; no new saved quote registry. Full hold does not bar washing a field pod, because this operation does not collect it.

Test supported own/legacy/foreign-title pods; unrequested unrelated cargo remains untouched; two nearby pods and one chosen confirmation; duplicate/stale/recycled IDs; fee/quantity/reputation/range changes; short-credit atomic refusal; Save/Continue and repeat-save; worker reply reordering; interrupted UI lifecycle. Use existing isolated DOM/event harness rather than full boot. Existing browser approval remains held; no bypass or fabricated rendered acceptance.

## Evidence and preservation

Baseline diagnostic and notes independently preserved/read back as3members,5251bytes,SHA2567b1c8bd7663ec91d3c5b57eb2afd41afe3d792567373cc17407b2ec626a5ff4c. Later remap findings are appended locally and require a subsequent recovery version. Ten relevant owner/data blobs matched public master45a97fdbda62611cc13001bd16790f8afa844753; full dependency closure audit was not renewed for the initial probe. Preserve that limitation.

No aggregate or test/anvil-receiver-delivery.test.mjs, no canonical dirty checkout/index mutation, no external execution tasks, browser retries, credentials, merge or deployment. Publish only reviewed coherent draft increment with exact remote verification. All older held operations remain unchanged.


## Exact-scope amendment,04:40 UTC

Allocate test/next-wave-law-06.test.mjs to replace the former automatic-market-wash expectation with deliberate confirmation while retaining fee/legality assertions. No open PR exact-path hit found.

Allocate only the delivered Tethys entrance-parcel sentence at current src/ui/station/barContacts.js line1174 to explain choosing a nearby pod and reviewing its cut in Market. PR480 has separate imports/contact-choice/Ilex reply hunks at lines6/563/718/1123; preserve them exactly, no broader contact edits. The actual world entrance unlock is cargo:caughtByNet delivery of unscanned contraband, independent of washing; no world/mission/unlock edit is allocated. Recheck exact current sources/owners before delivery.
