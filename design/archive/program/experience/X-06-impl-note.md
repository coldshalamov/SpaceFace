# X-06 v6 impl note — comms name the place

Twelve place-naming lines appended to V-01's shipped `SECTOR_GREETING_BARKS` (six Helios, six
Ceres — Checkpoint Niner, Smear Marker 7, Pit Line, Weigh-Point, Bay 7, Shift Bell 3; Weigh Pin,
Kettle Line, Second Measure, Flare Rack, Outpost/Refinery, Wreck Cathedral). No new export or
link: V-01's `patrol-greeting` substitution already serves the bank. Promise test
`x06-sector-place-greetings` verifies presence, verbatim place, real `pois/stations` name, ≤12
words; `sector-greeting-barks` stays green (no count pin). Localization regenerated.

Complete-with-evidence (devin-expu audit 2026-10-25): landed 1705814158 via the v6 amendment —
the twelve place-naming lines ride V-01's shipped `SECTOR_GREETING_BARKS` (verified
`barks.js:2933-2950`). `x06-sector-place-greetings` 1/1 green today. Audit residual (no
sector-keyed content) closed. Rejected draft scope (faction×sector schema, Tethys/Vesta cells,
pass-by hail site, Berth Four/Six vapor, 60-line bank) was adjudicated at plan time — no
remaining named sub-scope.
