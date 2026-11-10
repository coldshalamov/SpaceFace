# ui-polish-150: Market find field at narrow desktop windows

At desktop widths up to480px and heights from801px, Find takes a full-width row below the exchange legend. The count may wrap below the legend, keeping filtered results readable. The family strip and register follow the input.

Escape with a nonempty query clears Find and stays in Market. Escape with an empty query still reaches the existing Departure Check; closing that check restores Market. This uses the existing search, accessible name, filter, transaction and station-exit owners.

## Verification

The real Market and Station screen modules were mounted at390x844 and600x844 with the real createUiInput document router and station departure gate. The fixture used a manager adapter; it did not boot a game or execute trades.

Typed matching and empty queries, all eight family filters, keyboard clear, native search clear, query Escape, empty-query Escape and departure dismissal were exercised. At390px, the filtered legend changed from232-233px in a164px slot to164px; no result-count overflow remained. Query Escape no longer opened departure. Empty-query Escape and dismissal still worked. No page errors occurred. Final arrival, typed, empty, clear and recovery pictures were inspected.

The existing transient receipt can cover the Buy/Sell controls in the600px fixture after the deliberately emitted clear/departure sequence; this is not caused by the find layout and was not used as evidence of transaction reachability. Purchase, price and full-flight acceptance belong to the existing Market and integrated game checks.
