<!-- LIFETIME: RECEIPT -->
# PQ-184.03 — Retire the legacy station hub

DONE — The default station uses explicit shared modules for departure, mission readiness,
services, trade, faction standings, bar contacts and ship records. The old stationHub, market,
bar, services, shipLedger and factions renderers are deleted. Implementation: `ce9ba29f`.

The migration preserves the actual station controls. Contracts show the correct destination and
physical freight requirement, insurance asks for confirmation before charging, the first-dock
handoff can be dismissed, and faction details scroll without covering the relationship display
at 1280 × 720. These fixes were controller-reviewed before the commit.

Direct verification: 52 live screen imports pass; 105 command-deck checks, three contract parity
checks, twelve station exit cases, and the 15-check baseline pass. UI effect and idle-sleep checks
pass. Controller viewed the current contract and faction screens, including the bottom of the
faction detail scroll, under `.devshots/next10-station-parity/` and
`.devshots/next10-factions-scroll/`.

The aggregate UI performance command reaches the budget validator but rejects the old v1
baseline. Replacing that measurement and meeting the hot-surface budget remain in PQ-184.02;
this receipt does not claim that separate leaf is complete.
