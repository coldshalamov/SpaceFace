# FB-089 — Every registered system sits on exactly one declared clock, never 60 Hz by omission

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: authoritativeSystemManifest.js
**Write-set:** `src/runtime/authoritativeSystemManifest.js`, `test/fb-system-clock-declared.test.mjs`

## The gap
`getSystemClock` in `src/runtime/authoritativeSystemManifest.js` defaults any id missing from `NEAR_CLOCK_IDS`
and `CALENDAR_CLOCK_IDS` to the table clock. A new system joins the 60 Hz tick by forgetting a line. Today
roughly 75 of ~140 registered ids run every tick regardless of distance or activity, and nothing asserts the
classification is complete.

## Why this direction
Inverting the default to NEAR would silently slow systems that need the table clock; a per-system cost
profiler is a diagnostic, not a fix. The honest mechanism is a manifest assertion plus an explicit sweep: each
id lands in one list on purpose, with the reason next to it.

## Mechanism
- Add a manifest assertion (run by the existing manifest test) that every id in `PRODUCTION_UPDATE_ORDER`
  appears in exactly one of TABLE (explicit new list), NEAR, or CALENDAR; a missing id fails the check with the
  id name.
- Classify the ~75 implicit table-clock ids explicitly. Move the pure observers and slow owners (barks already
  gate via `shouldOwnerThink`; readouts, ledgers, chronicler, achievements, ecology) to NEAR or CALENDAR where
  their own code shows no per-tick physics.
- Keep authority owners (physics, flight, weapons, tether, fields, AI stack) on TABLE explicitly. Record the
  reason per moved id in a comment, one line each.

## Done when
Seed 4242 Ceres arrival, 3600 ticks: sim step p50 drops measurably (record before/after from
`probe:runtime-witness`), goldens unchanged, and `test/fb-system-clock-declared.test.mjs` fails when an id is
added to the update order without a clock.

## Do not
Do not move any single writer of position, velocity, credits, rep, cargo, derived stats or heat off the table
clock. Do not change catch-up policy. Do not fix a per-tick cost by dropping the system's work.

## Focus test starting points
- `test/authoritative-manifest.test.mjs`
- `test/lifetime-sweep-quiet-clocks-skip.test.mjs`
- `test/sim-clock-catchup.test.mjs`
