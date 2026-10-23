# Proteus Den first-arrival access guidance

Public base: 3095a835eb3dbda178d359bbb0541e3ee6124f4c, verified 2026-10-23.

The ordinary Den refusal previously said only “You. No.” at Quiet standing -1 or 0. The existing gate admits positive standing, including 1. This increment preserves that gate and its reason code, adding the requirement to the same refusal: “You. No. Earn positive Quiet standing before requesting a berth.” The actual faction screen labels the value Standing. No earning method, access exception, payment, faction change or new mechanic is implied.

Only the numeric below-floor branch for station_proteus / faction_quiet / floor 1 changes. Explicit denial codes, structural restrictions, explicit hostility and live debt grudges retain precedence. Other stations and explicit alternative thresholds remain unchanged.

Shipping paths:
- src/data/dockDeny.js
- test/proteus-den-access-guidance.test.mjs

Validation: writer and independent reviewer each passed 20/20 focused cases, with no skipped or cancelled cases. An additional 1,512 differential cases preserved admission and reasons except for the intended Proteus refusal text; exact inverse edits restored the public source baseline. Tests cover raw/live -1/0/1 boundaries; exact station and faction; explicit alternative floors; missing reputation; all earlier denial variants; later military/private restrictions; positive-standing hostile refusal; a real active debt-grudge record; and actual dockDenyBanner forwarding into UI state, dock:denied and voice.say, including debounce, admitted silence and listener cleanup. Source and test syntax checks pass.

The first run was 19/20 because the grudge fixture omitted outstanding player debt. Inspection of the actual stationConditions reader corrected the fixture to debt 121 against its existing untilPaidCr floor 120. Production grudge behavior was not changed. The corrected final run passes 20/20.

The shipping test runs as `node --test test/proteus-den-access-guidance.test.mjs`. Validation loaded 33 dependency modules whose SHA-256 values matched the immutable public base; dependencies were not accepted from an unqualified working tree. The focused default gate is `npm run check:proteus-den-access-guidance`, invoked once immediately after the working-margin gate in `scripts.check`.

Limits: the actual banner event handler, resolver and comms forwarding execute without mocking those owners, but no DOM rendering, browser, physical docking, native flight or full Save/Continue acceptance is claimed. Existing docking enforcement is untouched. No broad local suite, merge or deployment was run. The physical worksite watch-stop remains separate and unresolved; this change does not claim actors operate the frame.

Baseline dockDeny.js Git blob: c63a5408520c02d231c65da9a0036e7535737c81. Baseline SHA-256: 7f712ba253c9d486c929b1c51006c44356e9aa1e462fbe1894e4deab5d4d688c.


Publication receipts:
- Source SHA-256: `83e33a67b985df6ccb19a0adf27aa3cc1e41e801179c300b6a53f594307087db`.
- Test SHA-256: `987a358ac3465322ed03a6c920f74322ec608e4eeab8f3c598a7b7ea4c1db1a5`.
- Package SHA-256: `c1f0741ac821dd7815ac75b825e5a58c4653b330f4dc31b935ffb7944198849d`.
