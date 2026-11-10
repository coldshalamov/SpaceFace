# Keep flying the same attempt as practice

## Player outcome
The existing Counterweight registrar/progress card offers **Continue as practice · forfeit payout**. A second explicit confirmation permanently forfeits this attempt's payout and ghost recording. The copy states that existing practice times, medals and course unlocks still count. Back retains the paid attempt. No reset, repair, refund or time suspension occurs: the same original native bodies, lines, damage, clock and resources continue.

This preserves the existing practice law, not a new unranked mode. A later fresh scored attempt may still earn the existing unpaid first-completion award. The conversion cannot turn back into a paid attempt. Confirmation expires after 30 simulation seconds, checks exact attempt, pilot and cohort lives, and is cleared on mode/pause/dock/save lifecycle events. Both saved practice flags commit before any publication callback. Menus have at most three choices; the confirmation has two and Back uses the adapter's cancel affordance.

## Exact scope
- `src/features/counterweightCircuit/runtime.js`
- `src/features/counterweightCircuit/readModel.js`
- `src/features/counterweightCircuit/prompts.js`
- `test/counterweight-live-practice.test.mjs`
- this evidence note

Three source paths were clean before editing. Before snapshots: `/tmp/counterweight-{runtime,readModel,prompts}.before-forfeit.js`. Existing mixed/CRLF line endings retained. No scoring, physics, payout, save-schema, assets or renderer changes; no publication. NOW liveness reported no active mutation claims; parallel Adventure worker's Helios paths are disjoint.

## Verification
Focused seven tests pass: native object/line/resource retention, consent expiry/events and stale identity/death/venue/dock rejection, callback reentry plus atomic serialization, existing interrupted-restore semantics, matched native pilot tow, real result owner no-payout via explicitly injected receiver witness, and actual prompt-adapter confirmation/Back/stale-card routing.

Combined command:
```
node --test test/counterweight-live-practice.test.mjs test/counterweight-circuit-live.test.mjs test/counterweight-circuit-authority.test.mjs test/counterweight-circuit-persistence.test.mjs test/counterweight-circuit-briefing-loop.test.mjs test/counterweight-circuit-prompt-ownership.test.mjs
```
Final combined: 48 pass / 49, one inherited native Soft Berth seating failure. Logs `/tmp/counterweight-forfeit-combined.log`, `/tmp/counterweight-forfeit-focused.log`. Whitespace check with CRLF recognized passes; default Git check calls retained carriage returns trailing whitespace.

The native test runs the same 600 frames (10 seconds) of bounded pilot-only force control with and without conversion. Load travels over 20 WU, native attachment remains active, and resulting pilot/load positions, load velocity, hull and leg are exactly identical. Initial accepted-course/nearby-pilot/native-line setup is a fixture; this is not an F-acquisition or full campaign proof. No collision-free claim or impact census.

## Failed experiment and acceptance gaps
The first new full Soft Berth tow experiment failed to seat after 5200 frames, leaving leg 1 running. The original neighboring ranked test fails identically in the current checkout. Exact-before substitution of all three changed source files reproduces the original failure using `/tmp/counterweight-forfeit-before-loader.mjs`, logged `/tmp/counterweight-forfeit-before-native.log`. No course or collision law was weakened and no expected golden was changed. The accepted native claim is deliberately narrowed to matched unchanged physical towing; full native receiver completion is still unverified. Payment suppression at completion is tested through the real owner with an explicitly injected receiver observation, not claimed as a successful native seat.

An earlier new fixture incorrectly checked `attachment.active`; corrected to the actual owner field `attachment.state === 'active'`. Independent review requested disclosure of ghost loss, now explicit, and actual adapter routing, now covered.

Existing Continue policy intentionally marks interrupted attempts unconfirmed rather than restoring a partially witnessed run. Tests exercise owner serialization/deserialization and that policy; not a full disk/UI Continue. Headless prompt adapter is not rendered/pointer/gamepad acceptance. Confirmation leaves physics live, as explicitly disclosed.
