<!-- LIFETIME: DURABLE -->
# 05 · An economy you can interfere with; a ship you can understand

**Parents:** 401–403, 465–466, 469, 480; existing PQ-142 capability work.
Comparison lenses: Factorio's legible production dependencies and X4's physical economic activity.
Borrow those relationships without converting SpaceFace into an empire manager.

## One finite chain first

Select one source → worker → carried lot → receiver → buyer → price/contract consequence already
supported by production owners. The Orchard and salvor PRs are active implementations, not empty
space for another chain. Reuse their accepted interfaces after integration; do not absorb drafts.

For each transfer, name durable lot/source identity, quantity, destination and receipt. Rejected
cargo remains owned somewhere; missing capacity is not permission to delete goods. A sale, internal
transfer, destruction and disposal are distinct outcomes. Price explanation must cite the actual
mover, not manufacture causality from a recent headline.

Useful conservation check for a bounded commodity interval:

`starting stock + actual production + external inflow = ending stock + actual consumption + destruction + external outflow`.

Choose the boundary explicitly. Currency has separate mint/sink rules; it is not automatically a
conserved commodity. Do not double-count a cargo lot in both a physical carrier and its durable
record. A valid ledger equality does not prove the carrier physically reached its destination.

## Implementation passes

**A · Honest work.** Existing producers report their effective capped rate and current blocking
reason. CLOUD-01 distinguishes released material from accepted player cargo. No predicted yield
is labelled collected.

**B · Shared recipes and routing.** Finish row 402 through existing recipe authorities and migration
contracts. Then row 403 can compose bounded drone routines. Programming a drone means choosing
from supported work verbs with explicit refusals, not adding arbitrary scripts to saved games.

**C · Consequences.** One disrupted or restored shipment affects a canonical stock/demand/contract
readout. Expose it through existing market/news surfaces. Prove that the displayed cause actually
contributes to the change; multiple causes remain multiple causes.

**D · Decisions.** CLOUD-07 compares existing route alternatives. Later convoy shares or forward
contracts remain row 480 scope with independently specified liability, expiry and settlement rules.
A tooltip is not implementation of a financial instrument.

## Fitting: capability and tradeoff, not another stat sheet

`shipCapabilities.js` already predicts tow class, slam survival, line load and field deployment
from live laws. CLOUD-08 improves how an existing fit preview compares those outcomes. It must not
invent a second calculator or pretend cargo mass changes a hard volume cap.

Use the same cargo, damage, flight model and operating state on both sides of a comparison. Show
one new possibility and one real sacrifice when one exists. A heavier fit may affect acceleration
without changing the governed yaw ceiling. Missing data is unknown, not zero. A nearly unbreakable
line must not be advertised as a routine rupture risk because a generic game would have one.

After a purchase, the normal fit/apply owner decides what is installed. The displayed after-state
must match that installed state; cancel leaves the old state unchanged. Do not attach a second
reward or autosave action to the preview.

## Long-lived identity

Keep hull history, earned markings, consequences and commitments in existing ship/deed owners.
Prototype one meaningful refit choice before imposing irreversible choices across the fleet.
Clearly explain permanence and recovery before purchase. Existing saved fits must remain valid.
Cosmetic changes need gameplay-camera evidence and asset-lane coordination; they are not part of
the ten source-only cloud packets.

## Acceptance and failure cases

Test full capacity, partial acceptance, denied/repeated order, stale quote, source exhaustion,
carrier loss, world departure and Continue at custody boundaries. Use seeded real owners, not a
mock exchange that always succeeds. Exercise a normal buy/fit/use and a normal mine/collect/deliver
route. A CPU allocation reduction is useful evidence but not proof of improved frame rate.
