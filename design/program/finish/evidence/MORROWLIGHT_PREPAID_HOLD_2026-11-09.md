# Morrowlight: deliberately hold prepaid work

## Player choice
The existing service screen now offers **Pause prepaid work · keep the remainder**
while a booking exists. This stops work in place, without requiring the pilot to
fly away or cancel a partly spent supply. **Resume prepaid work · no new charge**
continues the same booking on its original ship. Repair priority remains independent:
the pilot may choose a priority while held, then resume when ready.

This is not cancellation, a refund, free work, or another booking. Repair, fuel and
the one-time emergency weld retain their existing finite amounts, rates, supply
costs, resource eligibility and cancellation behavior. Untouched cancellation still
returns its supply; partly used supply remains spent. Pausing alone returns nothing.

## Scope and ownership
Five paths: `src/features/salvageTender/services.js`, `runtime.js`, `model.js`,
`test/tender-prepaid-hold.test.mjs`, and this note. Earlier triage/selective recovery
changes remain intact. No physical delivery, cargo, economy, assets or renderer
owner was edited.

A strict saved `manualPaused` boolean distinguishes deliberate holds from automatic
range/speed/identity pauses. Returning to a valid berth never clears a manual hold.
Old or malformed values default to false, preserving automatic legacy behavior.
Pause/resume validates exact job ID and current bound living entity/generation,
ship definition, vessel ID and active-ship index. The runtime retains its revision,
busy and physical berth gates. There is no asynchronous resource transaction in
this control; it does not debit, credit or deliver anything.

## Verification
Independent focused **5/5**; final expanded **43/43**:

```
node --test test/tender-prepaid-hold.test.mjs test/tender-repair-triage.test.mjs test/tender-live-repair-allocation.test.mjs test/tender-selective-recovery.test.mjs test/pro-experiences-salvageTender.test.mjs
```

Log `/tmp/tender-hold-expanded.log`. New tests exercise actual native berth and
ordinary prompt adapter: begin repair, pause, run five seconds with exactly unchanged
hull/armor/work budget, then resume the same prepaid remainder to completion without
another debit. They verify stale menu refusal and bounded Back/Leave choices.
Review corrected the existing quote to “Finish or cancel”: held work still occupies
the service slot. The native deck regression attempts another service while held
and verifies refusal with the corrected reason, unchanged booking and cargo.
Final corrected focused 5/5 and expanded 43/43 reruns passed.

Other cases cover a manual hold surviving automatic berth interruption, normal
automatic resumption when no hold exists, untouched held-fuel refund exactly once,
partly used held repair remaining spent, wrong job/invalid boolean/replaced occupant,
one-time emergency-weld cancellation/completion, and real SaveSystem serialize /
loadEnvelope into a fresh native fixture with the hold still active until explicit
resume. Existing neighboring tests retain resource, reentry and total-work coverage.

The earlier unrelated map `route`/`jump` failure did not recur in the current expanded
suite. This increment does not modify or claim to fix that map behavior.

## Limits
The native fixture starts with a restored bench, nearby ship, supplies and known
damage. This is a real service scheduling/berth interaction, not a new complete
travel, restoration or combat route. Headless prompt-adapter checks are not rendered
browser, pointer or gamepad usability acceptance. Fresh save-envelope load is tested,
not the disk/load-screen Continue journey. No collision-free claim.

Before snapshots `/tmp/tender-{services,runtime,model}.before-hold.js`.
Master inspected `f95de0eb1ba7560839209936afba48c7b96fe41a`. No publication performed.
