# Market: one confirmed order until its outcome is known

## Player experience

The opening's earned credits need a dependable first purchase. Previously the Market removed its
confirmed-terms stamp immediately after emitting a trade and unlocked after 80 ms. A delayed worker
could still be processing that order when the same screen accepted another request. A partial-fill
receipt could also lose the quantity the player had confirmed.

The Market now keeps one identified order, its commodity, side, quantity, price limit and original
station until an authoritative outcome is known. While it is pending, another click cannot create
another order. A matching completion permits a later intentional purchase with a fresh ID. The
existing short click guard remains for immediate completions; its timer cannot unlock a request
that is still outstanding.

If confirmation is lost or delayed, the UI says the result is unknown. **Retry order** retries the
original confirmed order with the same ID and terms. It can complete that original purchase if it
never committed; it is not a read-only status query. The existing economy journal returns a stored
result for a committed ID without another mutation. The UI never silently starts a new-ID order
to recover an uncertain one.

Pending selection and quantity remain identifiable through hide/reopen. If recovery happens at a
different station or while undocked, the retry-context refusal is not presented as proof that the
original order failed. The order stays unknown and the screen directs the player to the original
station. A price refusal for an uncommitted order instead retains the authoritative quote for the
player to review and confirm again.

Both full rendering and the receipt-only update path give the retry control its correct Lamp Key
word and accessible label. This fixes a real implementation mismatch where the enabled retry could
still carry the static “Buy 1” or “Sell 1” label.

## Existing owners, not a new transaction system

- [Market screen](../src/ui/station/screens/market.js): retains the pending intent, uses the existing
  `economyTrade` RPC in worker mode, and preserves the synchronous `ui:buy`/`ui:sell` path in main
  mode. Exactly one transport is chosen per submission. A disconnected worker does not fall back
  to another execution transport.
- [Receipt presenter](../src/ui/station/tradeReceipt.js): only a matching identified terminal result
  consumes identified confirmed terms. Legacy one-use terms retain their existing behavior. A
  partial receipt can name the confirmed quantity instead of silently replacing it with the fill.
- [Station app](../src/ui/station/stationApp.js): owns ordinary and recovered receipt presentation.
  Market recovery uses a presentation-only event, never a forged `economy:tradeCompleted` signal.
  Market IDs are displayed once and known retired Market IDs are suppressed. This new deduplication
  does not suppress unrelated deterministic Adventure IDs in a new world.

The economy, cargo, worker host and transport implementations are unchanged. They remain the sole
writers of credits, cargo and stock. IDs use platform entropy plus the existing lane-token mechanism;
candidates are checked against the mirrored committed journal when available. If bounded generation
cannot prepare a fresh ID, nothing is sent. This is UI correlation metadata, not simulation RNG or
an authentication credential.

Reset retires the screen's old pending token. Late old success/failure cannot consume or unlock a
newer confirmation. A main-lane silent outcome remains unknown unless the existing committed journal
or a matching terminal result establishes its outcome. The UI does not invent a refusal or payment.

## The earlier CI failure was a different problem

Three retained `check:market-first-loop` traces actually completed their purchases despite the
failed browser polling assertion:

| Source checkpoint | Owner completion | Credits | Cargo / stock |
| --- | --- | --- | --- |
| `7b79a665` | 6300.255 ms | 5000 → 4964 | +1 iron / −1 stock |
| `4c8ea7d4` | 119.225 ms | 5000 → 4968 | +1 iron / −1 stock |
| `8430713f` | 6077.630 ms | 5000 → 4966 | +1 iron / −1 stock |

Those observations used the main lane and include multi-second main-thread long tasks. Browser
and host clocks have different origins; DOM text is not proof of paint. This change does not claim
to fix that hitch, a failed economic calculation, or the broader startup/save failures. No timeout
was increased to turn those checks green.

The distinct worker-UI issue was reproduced through the actual parent Market handler: after 115 ms
without a terminal reply it forwarded a second identical `ui:buy` without an intent ID. That proves
duplicate pending requests, not an observed real-worker double charge.

## Verification

Root independently repeated the final affected suite: **33/33 passed**.

- `test/next-wave-nxi-098.test.mjs`: 21 mounted-Market/component cases, including delayed replies,
  partial terms, refusal/requote, re-entry, reset/stale IDs, honest retry labels, same-ID recovery,
  original-station recovery, and click-guard lifetime.
- `test/pb-wire-trade.test.mjs`: 7 cases. Six original behavioral tests are unchanged. One obsolete
  inline-source regex was replaced with actual owner/receipt behavior; mounted stamp-before-send
  coverage is in the NXI file rather than pinned to a particular assignment string.
- `test/pb-trade-residue.test.mjs`: 1 case.
- `test/economy-trade-receipts.test.mjs`: 4 cases.

The untouched-parent Market positive control also passes **1/1**, reproducing the old duplicate
pending request. Syntax checks pass. The replay case uses actual `economy.handleTrade`/`execute`
and verifies credits, cargo and stock move once when a committed same-ID result is recovered.

Local tests use a targeted, nonshipping resolver overlay. The modified UI owners are candidates;
the following unmodified support owners are exact parent `aaa56d04bb43f3dc35afdd6a3c995514b246d022`:

- Economy: `b8a0d9ecf8777ee9dadaa7d58be2d2aa83d72cd1`.
- Cargo: `35cec946f2adcbae75a89497dda06c5404af1f59`.
- Missions: `106b37a0d7810b80658916cee566fdbdc71c72be`.
- Station-market profile: `6889565bf4e60b9c27a17f0a59586f8bc64ef0da`.

Critical linked cargo-custody, trade-planning/math, commodities, trade-truth and lane-command helpers
also match the parent blobs. Remaining transitive dependencies are sparse ports. Earlier runs using
an older Economy port are historical, not the final proof. A broad static import graph was inspected
but not copied into another repository or used to claim a full build.

The actual Market screen is mounted in the fixture DOM. The real Worker host and browser are not
mounted. StationApp receipt helpers and its source-extracted reset callback/import binding are
tested, not a full StationApp mount. Hosted CI already includes the affected NXI file; exact new-head
results must be recorded separately. No workflow or gate was changed.

## Acceptance gaps and next evidence

- Exercise the ordinary delayed-worker route in a reachable, authorized HTTP(S) preview of the exact
  source, including keyboard/gamepad/touch, hide/reopen and actual painted receipts. The current
  cloud browser cannot reach the assistant workspace's loopback bench; data URLs are explicitly
  prohibited by its URL policy. No workaround changed those restrictions.
- Run full Save/Continue and native transport lifecycle checks. Source/component coverage is not a
  complete game-save or lost-worker-packet guarantee.
- Measure long-session save growth: the existing committed-intent journal is durable and unpruned.
  Giving Market orders IDs adds records. This change does not prune that owner or claim performance
  acceptance.
- Diagnose the original main-thread hitch with a complete valid profile and painted-frame evidence,
  rather than inferring a renderer cause from an incomplete profile.

SF-WORLD-DIRECTION, SF-SECTOR-COHERENCE, SF-LIVING-WORLD and SF-GAME remain open. This closes a
specific source-level first-purchase coordination gap; draft publication and passing component tests
do not make the whole game integrated, deployed or accepted.

Final source recheck: master `60c02a50fce543877459c4980f03216be9dd3b1c` has the same five
owned source/test baseline blobs as parent aaa56d. The current Economy, Cargo and lane-command
owners also retain the tested parent blob identities. No newer owned-path edit was overwritten.
