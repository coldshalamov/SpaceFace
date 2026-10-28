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

Complete-with-evidence (devin-expu audit 2026-10-25): landed 414d4ea94b (+e1bcea85ad,
b94e3aa323 review fixes — re-cut rock re-credits, real thrown-rock lawful kill through
collisionConsequences). `tumble-fling-attribution` 20/20 green today. Audit residual (thrown
rocks/wrecks/pods never credit the thrower) closed by the widened `canCarryThrowCredit` + the
240-tick flight hold + the deliberate-release provenance point (`tumbleStates.js:59,133,306-352,
737`). Deferred draft scope (Drifter's two first-use hints, `expiresOnFirstImpact`) was
adjudicated at plan time — no remaining named sub-scope.
