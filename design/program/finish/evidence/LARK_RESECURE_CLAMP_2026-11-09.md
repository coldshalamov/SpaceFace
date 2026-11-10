# LARK: secure a released original for another pull

## Player action
Inspect a released LARK component and choose **RE-SECURE TRANSPORT CLAMP · NO REPAIR**.
The pilot must support that component with their own real MassLine, stay alongside,
bring the same two originals within 40 WU center-to-center without hull overlap,
match their relative velocity below 2 WU/s and stop spin below 0.4 rad/s. The request
uses the existing salvage-clamp owner at the current span, without moving either body.

This is a transport restraint for parking or towing the same claim, not restored
mount alignment, hull repair, new salvage or a payment. Release it again before
handing over the component. Broken couplings and every non-LARK/hazardous assembly
are excluded. The same original can be inspected, released and secured again; lost
or delivered originals cannot be recovered by this action. Existing saved connected /
released / broken state and span retain the decision; no new save schema or asset.

The ordinary part card and existing prompt adapter carry the action. The LARK part
card remains below the presenter's eight-choice limit with Back to Flying retained.
No presenter, renderer, model, payout or global attachment-owner code changed.

## Scope and authority
Four paths: `src/features/shipbreakingYard/physics.js`, `runtime.js`,
`test/shipbreaking-lark-resecure.test.mjs`, and this note. Both sources were clean
before this increment; earlier layout/model refit changes are untouched.

The physical adapter validates original object/generation bindings, native bodies,
claim state, live initiating pilot, support line and foreign custody. It reserves
saved connected intent before attachment creation's synchronous callback. Only an
active attachment on those exact original lives is accepted afterward; initiator,
mode, docking, sector, disposal, support and job/row identity are revalidated too.
Physical admission may still be pending, which the response explicitly says.

Independent review caught two initial callback gaps. The first omitted initiator /
mode changes after creation. The second let a callback cut the new line while the
caller still reported success. Both were corrected before publication. A pending
creation tracks preexisting attachment IDs; callback inspection can identify the
new record even after it was cut. It cannot silently create another line while that
request is pending. A callback save therefore records the canceled restraint as
terminal, not a connected intent that remints on restore. Failure cuts any new
constraint and leaves the original service clamp released; no payment or repair.

## Verification
Author **5/5 focused and 38/38 combined** pass. Five focused tests and the neighboring suite:

```
node --test test/shipbreaking-lark-resecure.test.mjs test/pro-experiences-shipbreakingYard.test.mjs test/shipbreaking-lark-refit.test.mjs
```

The real native test enters via the part-card adapter, recreates the restraint on
the original objects, verifies native admission, transmits an impulse from frame to
component, refuses delivery while attached, then releases it again. Hull and credits
stay unchanged. Other tests cover broken/foreign/moving/stale refusal, duplicate
request from `tether:attached`, a callback save hydrated into a fresh native yard,
player/payload generation changes, menu/dock/sector/disposal interruption, and actual
callback cancellation followed by fresh hydration without reminting the cut clamp.

Limits: this starts from a prepared accepted claim and places the pilot nearby;
the supporting MassLine is created through the actual attachment owner, not acquired
with a full pilot-input flight sequence. The movement probe uses a bounded impulse,
not a new flight/autopilot or collision-free route claim. Fresh feature snapshots
and native hydration are tested, not disk/load-screen Continue. The card adapter is
headless, not rendered visual/pointer/gamepad acceptance. Initial failures were an
incorrect test method/import and a foreign-line fixture before native admission;
fixing those did not weaken physical gates.

Before: `/tmp/yard-{physics,runtime}.before-resecure.js`.
Log: `/tmp/yard-resecure-final.log`.
No publication performed.
