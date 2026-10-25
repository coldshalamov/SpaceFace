# X-08 impl note — sling income: a thrown rock is the thrower's kill

`canCarryThrowCredit` widened to asteroid/wreck/payload (pods spawn as `payload` bodies).
Thrown non-tumbling bodies get a 240-tick `holdImpulseProvenance` in `_onThrow`; a second
provenance point on deliberate `tether:released` (≥25 wu/s, never `tether:broke`) covers the
plain sling cut. Kill → burst/bounty/incident/heat paths are unchanged — they already read
impulse provenance.

Re-pin (deliberate): `tumble-fling-throw-attribution` pod leg now expects the record.
Tests: `tumble-fling-attribution` 16/16 incl. 8 new; keep-green 32/34 — `wave-b10` fails at
runtime boot (foreign `salvageOutfits` crash + a pre-existing singleton init guard), not throw
code. No digest change — wave-b10 never reached gameplay.
