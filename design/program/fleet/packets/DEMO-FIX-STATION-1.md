# DEMO-FIX-STATION-1 — station screens: the review's code-level bugs

**For:** a builder agent (code, exact instructions). **Kind:** bug fixes found by an independent
review, each with evidence. Verify each against the code first, then fix it. Commit your own files.

1. **Controller B undocks instead of going back.** src/ui/input.js ~1650-1651: the pad cancel branch
   calls `undock()` for the station screen without asking the screen; the keyboard Escape path
   (~610) calls `def.onEscape(ev, ctx)` first, and the station's onEscape now returns from a door to
   the hub (app.back()). Fix: in the pad branch call `def.onEscape?.(null, ctx)` first and only fall
   through to the station's normal exit when it returns false (on the hub).
2. **Market says units for slots.** src/ui/station/screens/market.js syncHoldArc (~2245) passes
   `cap = cargo.slotCount` for a slotted hold, but holdArcHtml prints `${used} / ${cap} units` while
   the door head says 'Hold 0/12' in slots. Pass a unit word ('slots' when slotted, else 'units')
   into holdArcHtml and print it. Delete the dead `if (!routeIsActionable(t))` branch (~2439): it
   sits inside a map over `trades.filter(routeIsActionable)`.
3. **FEATURED badge reads as a list heading.** contracts.js ~809 and stationTabsLayouts.js ~785: the
   badge is absolutely placed above the type line in heading cyan. Put it on the type line
   ('BOUNTY HUNT · FEATURED') in the row's own small caps, in a quieter colour.
4. **ResizeObserver leak.** contracts.js ~705-711 creates an observer without keeping it, so
   dispose() (~1760) can't reach it. Store it, `disconnect()` it in dispose, cancel the pending fit frame.
5. **Two tests the station lane left red:**
   - test/lg-forecast-proof.test.mjs ~95: since 1a2bcba603 lastMoveCause returns `{ text: '' }`
     with no news and no perk. Rewrite to that rule; keep the event-driven asserts.
   - test/station-contracts-short-dossier.test.mjs: since f791a472da a safe job has no hold note and
     Accept is one press. Drive the hold-to-accept check with an offer that carries collateral; say
     the rule in the message.
6. **The bench can't shoot the hub.** scripts/lib/uiBenchCatalog.mjs ~117 and tools/ui-bench.js
   ~1221: 'station' now lands on Jobs (first-dock rule), and 'station-industry/factions/ledger' click
   `[data-nav=<tab>]` tiles that left the rail. Make the bench navigate through the station app's
   own navigate (find it in src/ui/station/stationApp.js), add a 'station-hub' shot (the four-door
   concourse), and fail loudly when a tab cannot be reached. Shoot
   `node scripts/ui-bench.mjs --shot=station-hub,station-market,station-contracts --viewports=1280x720 --out=.devshots/fleet/station1`
   and list the PNG paths in your receipt.

## You may edit
src/ui/input.js (the pad cancel branch only), src/ui/station/**, styles/station*,
scripts/lib/uiBenchCatalog.mjs, tools/ui-bench.js, and the two tests. Before editing a file run
`git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after.
Never git add -A, reset, stash, restore or checkout. Plain-English commit messages.

## Receipt
Protocol headings; per item fixed (commit) / rejected (why); tests run; PNG paths.
