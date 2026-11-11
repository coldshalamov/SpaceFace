# Breakwater Spur: buy the departure fuel you can afford

## Playable change
At the existing commissioned Ceres cooperative berth, the normal dispatch offer now shows the full available repair/refuel amount and its exact price. When the pilot can afford some but not all of it, a second explicit choice offers that smaller amount. Ten credits can now buy three fuel for nine credits instead of merely failing an entire refill request. Hull work uses the same existing 0.9 CR/HP rounded debit; no rate, stock source, cargo, charter, construction or reward law changed.

## Ownership
Clean before editing: `src/features/breakwaterSpur/services.js`, `readModel.js`, `runtime.js`. New `test/breakwater-budget-service.test.mjs` and this note. Original CRLF retained. Before snapshots are `/tmp/breakwater-{services,readModel,runtime}.before-budget.js`. NOW and peer ownership checked; adventure_next works on Lio, separate from Breakwater. Parent approved this limited partial-service choice. Economy.js is claimed elsewhere and untouched. All earlier tender and other candidates preserved; no publication, assets or renderer work.

The quote helper shares the owner's existing rounded price. It searches whole units bounded by actual missing capacity and finite stock. The action uses the unit count held in the authoritative offered action, not a client-supplied count or a freshly increased wallet. More credits after opening cannot increase that purchase. If funds fall below the shown price, the existing exact charge refuses with no stock or healing. The owner still clamps the requested amount to current capacity/stock, and uses the existing station-service delivery writer. No deferred job or new persistent state is introduced.

## Evidence
Author and independent reviewer **5/5 focused pass**; expanded suite **73/73 pass**. Fresh remote master remains `f95de0eb1ba7560839209936afba48c7b96fe41a`. Five focused tests cover real dispatch action plus canonical economy/yard delivery, exhaustive small rounding boundaries, changed balance, finite stock, cargo preservation, same-offer reentrant callback rejection, and feature-owner serialization/deserialization after purchase. Serialization here is the existing owner seam, not full browser Continue.

Native approach: actual Flight V3 inputs move a Kestrel **149.096 WU in 18.75 s** from an initial approach fixture into the real site's 150 WU public action radius. An outside-range attempt refuses; the inside action buys three fuel, spends nine credits, and removes exactly three stock. The co-op commissioning and initial pilot position are fixtures, not a played construction or charter journey. No new collision-free, populated-world, rendered/menu-layout, device-input or complete campaign acceptance is claimed. First probe braked at an 80 WU lateral offset and stopped outside the circular gate; the final controller waits longer before braking. No game movement/gate law was changed to make the probe pass.

Commands:
```
node --test test/breakwater-budget-service.test.mjs
node --test test/breakwater-budget-service.test.mjs test/breakwater-spur.test.mjs test/breakwater-cargo-owner.test.mjs
```
Logs: `/tmp/breakwater-budget-focused.log`, `/tmp/breakwater-budget-final.log`. Independent reviewer inspects only this scoped source and tests. Existing async service receipts/stock persistence remain their original owners; the new choice has no independent wallet or inventory.

## Final menu review correction
The independent parent review found that two damaged-cartridge repairs, three jobs, four service choices and Leave made ten actions. The existing presenter clips at nine, dropping Leave. The fix deliberately does not change that shared presenter: crowded co-op menus now expose all jobs/cartridge repairs plus a fuel-and-hull submenu and Leave; the submenu carries all full/partial services plus Back and Leave, and a distinct page revision. Uncrowded menus remain direct.

The added sixth test runs the actual Breakwater prompt adapter with the real mounted promptDeck on the repository-style DOM fixture. It checks every rendered action ID, both menus, old-page revision rejection, keyboard Menu/Back/partial purchase/Leave routing and resulting credit/fuel state. The first fixture attempted a non-bubbling synthetic `.click()`; final routing uses the deck's actual keydown listener. This is mounted DOM/control-owner evidence, not a browser screenshot, layout judgment or mouse/gamepad proof. No shared presentation source changed.

Final author menu-inclusive suite: **89/89 pass**, command adds `test/breakwater-spur-presentation.test.mjs test/prompt-deck.test.mjs` to the combined command above. Log `/tmp/breakwater-budget-menu-final.log`. The earlier 5/5 and 73/73 describe the pre-overflow-correction checkpoint, not the final count.
