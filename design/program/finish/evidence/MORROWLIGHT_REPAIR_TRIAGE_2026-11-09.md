# Morrowlight: choose the protection repaired first

## Player interaction
The existing Prepare / service screen now offers balanced, hull-first, or armor-first
repair. Each books the unchanged one unsealed scrap for up to 20 combined hull/armor
points. A priority fills that deficit first and spills the rest of each work tick
into the other deficit. Balanced remains the default and uses the existing live
proportional allocation. This is a tactical allocation choice, not additional healing.

While a repair is booked, the same screen can redirect its remaining paid work to
any of these priorities, explicitly at no new charge. The original job, remainder,
paid resource and original hull binding remain intact. The native berth/range/speed
and Adventure-flight gate still applies. Emergency weld remains hull-only; refueling
is unchanged. Partial cancellation still spends the used supply; untouched cancellation
returns it through the existing cargo owner. No global repair or economy policy changes.

Five owned paths:
- `src/features/salvageTender/services.js`
- `src/features/salvageTender/runtime.js`
- `src/features/salvageTender/model.js`
- `test/tender-repair-triage.test.mjs`
- this note

Prior selective cargo and paid live-allocation changes are preserved. No assets,
renderer, shared UI presenter, economy owner, or other candidate paths were edited.

## Identity, save and resource safety
Redirection checks job ID, revision through the public runtime, the exact living
player object and generation, ship definition, active hull index, and owned vessel
identity. It cannot move prepaid work onto a replacement. Priority is a bounded
saved field; old/unknown values restore as balanced. Emergency/refuel do not acquire
repair priority. Only the existing station-services writer delivers hull/armor.

Both priority shares sum to at most the current per-tick paid amount. Full capacity
cannot consume unused work. Same-tick overflow goes to the other deficit, avoiding
a wasted partial step. Reentrant cargo callbacks cannot book twice. Sealed contract
scrap is excluded by the existing sellable-resource owner.

## Verification
Independent focused review: 5/5. Final author focused: 5/5, including stronger
assertion that the actual cargo callback attempted and failed nested booking.
Final author neighboring suite: 16/16:

```
node --test test/tender-repair-triage.test.mjs test/tender-live-repair-allocation.test.mjs test/tender-selective-recovery.test.mjs
```

New tests use the actual native berth, service owner, station-services delivery
writer, cargo owner and ordinary tender prompt adapter. They cover choosing hull
first, redirecting paid remainder to armor, preserving the 20-point combined cap,
spillover, refunds, stale cards/occupants, sealed supplies, invalid priorities,
callback reentry, and actual SaveSystem serialize/loadEnvelope into a fresh native
fixture without another scrap debit. Menus retain Back/Leave within the deck limit.

Expanded suite adds `test/pro-experiences-salvageTender.test.mjs`: 37/38.
The sole failure is its existing home-chart assertion at line 963: expected `jump`,
actual `route`. Substituting all three exact before source files via
`/tmp/tender-triage-before-loader.mjs` reproduces the same failure, 21/22.
No unrelated assertion was changed. Logs `/tmp/tender-triage-{expanded,before,final}.log`
and `/tmp/tender-triage-last5.log`.

Initial test fixture used noncanonical mode `moored`, so booking failed. Corrected
to the existing physical owner's `secured` mode; no production gate was weakened.

## Limits and provenance
The restored bench, supplies, damage and nearby pilot are fixture setup. This proves
native berth interaction and repair scheduling, not a new full-flight arrival,
restoration journey, rendered UI, pointer/gamepad usability or disk/load-screen
Continue. Fresh save-envelope restoration is tested, not a claim of full campaign
acceptance. No collision-free claim.

Source before snapshots `/tmp/tender-{services,runtime,model}.before-triage.js`.
Master inspected `f95de0eb1ba7560839209936afba48c7b96fe41a`; no publication performed.
