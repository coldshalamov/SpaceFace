<!-- LIFETIME: DURABLE -->
# CLOUD-07 · Two routes, an actual decision

**Existing parent:** 476. **Disposition:** proposed bounded slice; reverify current code and claims before dispatch.
**Contract:** [cloud workflow](../07_CLOUD_EXECUTION.md). **Evidence:** [source ledger](../09_EVIDENCE.md).

## Player result and evidence

The route planner already exposes pure fuel/hops Dijkstra and non-consuming machine-gate checks.
Make the existing map compare those two alternatives with understandable fuel/jumps and honest
per-leg risk/knowledge. Do not add another route algorithm or use side-effectful transit for preview.

**Verified entry points / owner trace:** `src/systems/routePlanner.js; existing src/ui/galaxyMap.js; current navigation read-model adapter`.
Some consumer coverage remains a hypothesis until traced. If this exact result is already present,
return the source/route evidence; do not duplicate it or count an audit as implementation.

## Write boundary and refusals

Edit the map's existing route summary and one pure comparison adapter, plus tests. Keep routePlanner,
world navigation, autopilot, toll settlement and PR459's Continue restoration read-only unless an
actual narrow contract defect is separately authorized. No graph/topology changes.

## Implementation sequence

1. Identify the normal map selection/preview/confirm chain. Compute fuel and hops candidates through
   the existing pure API using the same current drive and discovered graph.
2. Deduplicate identical paths. Compare total fuel and jump count; show gate/token requirements as
   requirements, never burn a handshake token merely to draw a route.
3. Report risk per leg or as a qualitative bottleneck, using only known inputs. Do not add per-leg
   probabilities or multiply survival odds without an established independence model.
4. Use actual intel provenance/age when available. If no observed timestamp exists, label an estimate
   rather than invent freshness. Do not reveal unknown intermediate sectors to decorate the comparison.
5. Selecting a candidate calls the existing confirmation path once; dismiss/cancel is inert. Revalidate
   affordability/access at execution because a preview is not a reservation.

## Regression and interruption cases

Same path from both modes; disconnected graph; start equals target; insufficient fuel; changed drive;
burnable/closed machine gate; missing discovery; stale/no intel; destination lost; cancel; repeated
confirm; Continue. Assert previews consume no token, fuel, credits or discovery state.

## Done when

An ordinary map selection shows distinct alternatives only when they exist, explains a real
tradeoff and commits the chosen route through the normal owner. Unknown risk remains unknown;
no optimistic price/fuel guarantee or hidden state mutation. Existing route/navigation tests remain.

Finish with exact base/head, changed paths, actual commands/results, ordinary entry and remaining
acceptance. One focused test suite is not whole-game acceptance. Keep the broader parent open.

## Copy-ready agent prompt

> Implement CLOUD-07 in the existing galaxy-map route summary. Compare existing fuel/hops routes,
> deduplicate identical choices and expose truthful costs/access/knowledge without spending anything.
> Keep world/autopilot restoration and PR459 untouched. Test non-consuming previews and stale/denied
> execution; publish a focused draft PR.
