# Salvor intake custody, 20 October 2026

## Outcome and scope
The former physical route cut seven units, Forge settled only five scrap, and traffic
cleared all seven. Reproduced with the unchanged native fixture at 158.333 seconds:
source 0, stock +5, hold 0. This was not end-to-end commodity conservation.

Forge is an existing fabrication station whose canonical commodity definitions consume
both scrap and salvage electronics. The correction admits only legal salvage consumed by
the actual refinery/fabrication receiver with an existing valid listing. It does not add
military salvage yards, buyers, prices, player payments, restricted-goods acceptance,
generic freight delivery, or a parallel custody ledger.

Economy records exact accepted lines in its existing durable intake receipt. Legacy
receipts without acceptedLines still mean scrap only. Traffic debits exactly those lines
through a synchronous, non-serialized owner handshake before any settlement notification.
Unsupported lines remain on the original cutter in its existing manifest, preserving lot
identity across Continue and far promotion. A remainder generation distinguishes a later
legitimate settlement from its already-settled original offer. An unsupported hold waits
honestly at the yard; it cannot overwrite its cargo with another cut. A now-supported
legacy remainder can resume the same yard's unload through normal maintenance.

Two continuation defects were also exposed, not hidden by the first green intake:
- Empty home APPROACH incorrectly restarted RETURN each time; pre-cut retargeting now
  applies to source APPROACH only, so an empty commission can finish and release its hull.
- A fresh commission can reuse the same WORK sequence. Cut and loaded-lot identity now
  include the already-existing durable source key or ordinary target key, not a recycled
  numeric entity ID. Old saved manifest and receipt identities are not rewritten.

## Reviewed validation evidence
- Historical baseline: native first haul cut7/accepted5/hold0, assertion5 != 7.
- Corrected native stationary/drifting first intakes:158.33/208.93 seconds, exactly5 scrap
  plus2 electronics, no remaining hold and no player payment.
- The same native actor (entity ID 6) completed two genuine deliveries: seven units at
  158.33 seconds, then four units at 398.03 seconds. Exactly two completed WORK intents
  produced two extractions, proving no silently failed first cut. Each finite source and
  hold emptied; exact per-cycle stock increased. Replaying the first receipt after the
  second delivery changed no stock. No cargo, receipt or source ledger was reset.
- Final wired check: npm run check:sim:salvor-work, 62/62 passed on canonical source.
  The identical 62 tests also passed on the reconstructed public-only tree (48 focused
  plus 14 native/PQ048/SF079), based on public b7bc0f7adba079751d80d68a9a0b2b828c65d487.
- Independent review passed 32 focused tests and verified 994 unique imported source
  paths against exact public Git blob hashes. All eleven proposal files matched their
  byte, SHA256 and Git blob manifest. Documentation-only sealing preserves tested code.
- Equal-sequence different-source commissions extract immediately with distinct work
  and manifest identities. Continue/retry of the same exhausted source cannot recut.
  Reordered line keys and harmless extra metadata remain compatible.
- Independent review reproduced and checked settlement-callback Continue, recursive
  unload, kill spilling only unsupported remainder, far/Continue/promotion, malformed
  acknowledgements and stale owner rejection. Equal-sequence second-source failure was
  independently reproduced and its source-bound fix verified.
- Synthetic monkeypatch throwing after the plain manifest-assignment helper completes is
  not a production-reachable callback boundary. No broad rollback engine was added.

## Delivery and continuation
Intended delivery is a narrow source-only successor to existing draft PR461 on public
b7bc0f7adba079751d80d68a9a0b2b828c65d487. No publication claimed yet. Reconstruct only
these reviewed deltas on that public predecessor, not canonical traffic with other lanes.
Do not merge master or deploy. All whole-game, asset, visual and acceptance goals remain
open. These focused native/contract checks are not whole-game visual acceptance.
