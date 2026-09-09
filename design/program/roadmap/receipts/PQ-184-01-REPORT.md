<!-- LIFETIME: RECEIPT -->
# PQ-184.01 — Bounded list rendering and complete keyboard reach

DONE — The live Market mounts only its visible commodity cards through the shared production
virtual list. Stable commodity identity survives price updates, sorting and filtering; keyboard
focus follows the selected card through window changes. Implementation: `849dcbdd`, with exact
quantity quotes and reachable trade controls completed in `4e66a98b`.

The controller reviewed the live Market at 1920 and 1280 pixels, including the final 720p trade
console. The ordinary 45-commodity exchange mounts a bounded card window. The separate 47-item
market fixture also verified scrolling, selection and category filtering against real screen code.

On 2026-09-06 the headed Chrome component fixture mounted 2,000 rows through the same
`src/ui/virtualList.js` used by the Market. Across 120 frame-spaced updates after ten warmups,
window replacement plus the resulting forced layout averaged **1.35 ms**, p95 **2.00 ms**, max
**2.40 ms**. Peak descendant count was **98**, below the 1,500-node ceiling. This measures the
component update, not the whole game's frame time. End focused row 2,000 with correct accessible
position and total; Home returned to row 1. Sorting and filtering retained `item-123`; destruction
left zero children. Source SHA-256:
`45de6fc52205045e88b7ac7941541b7ea582d293b4aa20b46255db8b95f7512d`.

The 25 focused virtual-list tests cover keyboard traversal across all 2,000 rows, identity retention,
resize/hide/show, and cleanup. Market chart and intel checks pass, including actual economy quotes,
affordable Max quantities and transaction credit deltas. The earlier baseline, import and idle-sleep
checks pass; the obsolete v1 aggregate UI budget baseline is being replaced under PQ-184.02.

List scope follows actual growth: the Market's horizontal rail benefits from windowing; the ledger
already paginates twelve rows, contract and mission views are bounded by gameplay limits, and
results are a short fixed summary. The bounded Codex index is navigation into variable-height prose.
Those surfaces retain their existing bounded rendering instead of adding a second window manager.

Local evidence: `.devshots/next10-list-2000/report.json`, the controller's
`.tmp-pq184/list-2000-browser.mjs` fixture, and `.devshots/next10-shipworks-review/market-quantity.png`.
