# Swarm: make the first shop's choices and results truthful

## The player's preparation loop

After the first round, the Armory and Refit should describe the fight that the
run owner will actually plan, and show the confirmed result of a purchase or fit.
The previous preview only described the base ladder. For seed 4242, Helios, round
2 it always advertised clear 24 / concurrency 11, even when the chosen stake made
the real plan Exhibition 16/7, Veteran 28/13, or Ironbound 31/14. Contender with
Thick Pack produces 32/15. Those are different preparation decisions, not cosmetic
labels. This increment changes the readout, not enemy counts, prices or rewards.

Both screens now call the existing pure `planWave` with the same seed, arena,
next-wave difficulty, normalized mutators, build summary, stake and Threats used
by `survivalRun`. Authored zone/event copy remains on the ladder; quota, roster,
newcomer, boss and concurrent pressure come from the actual plan. The line says
`room cap`, not guaranteed admissions. An unavailable plan produces no invented
base forecast. Finite/invalid Circuit states do not get ordinary-Swarm copy;
the existing Circuit panel remains, and valid Overtime gets the ordinary forecast
that its runtime actually uses.

## Why a repaint alone was not enough

Worker-backed purchase/refit intents return later than the click. The old handler
refreshed immediately, before the result, while periodic refresh deliberately
returned early to preserve focus. A new result listener alone still found mixed
state: the owner snapshot (`survivalDraftPublic`) could be current while cold run
credits, modifiers and telemetry remained on later staggered signing slots.
Using the public reroll credit as a wallet-only workaround would have left the
forecast and build inconsistent, so this implementation does not do that.

The existing domain differ now supports urgent signing of registered descendant
leaves. The worker host applies it only for bounded shop/refit openings, results,
rejections and exact refund/bank reasons. A paused `steps:0` reply carries changed
run fields together with its receipt. Previous signatures remain: unchanged
values do not resend, lazy fields still publish on first observation, and ordinary
cadence resumes afterward. Generic combat awards and per-tick events do not force
this publication. No new balance, inventory, progression or purchase owner exists.

The host retains newer upstream `world.enterSerial`, terminal-mission and faction
standing publication changes. These are reconciled context, not new authored work
claimed by this increment. The Lane 1 Inbox records the scoped publisher hook.

## Visible-screen lifetime and input

Armory and Refit subscribe to existing canonical result events while shown, then
unbind on hide/dispose. Generation-token microtask coalescing prevents a stale
queued callback from repainting a hidden/reopened screen. Synchronous in-process
intents retain their immediate completed-result refresh without a second queued
refresh. Refit refreshes on show so a result received while hidden is read on
return. Existing periodic-refresh and focus-preservation behavior remain.

These listeners render authoritative state; they do not accept purchases, debit
credits, grant equipment or advance rounds. Rejections/refunds use their existing
notices. The first-shop forecast and these result updates share one reader rather
than introducing another shop simulation.

## Evidence and acceptance boundary

Owners changed: `src/ui/screens/crucibleDraft.js`,
`scripts/lib/simReadModel.mjs`, `scripts/lib/simWorkerHost.mjs`.
Tests: `test/swarm-shop-forecast.test.mjs` and
`test/swarm-shop-worker-publication.test.mjs`.

- 248 integrated opening tests pass. The actual survivalRun planning handler is
  compared to the preview, including stakes, Threats, build/mutators, later bosses,
  newcomers, valid Circuit and Overtime.
- Both actual screen refresh consumers, delayed/synchronous receipts, lifecycle
  rebinding and native differ → structured clone → facade/event replay are tested.
- A production native host with paused replies verifies phase, wave, credits,
  modifiers and telemetry accompany the same opening/result reply, including
  duplicate/no-change behavior, normal cadence afterward and hook teardown.
- 22 unchanged publisher/domain regression tests, 12 unchanged Mission Log cases,
  six production imports, services readiness, and 55 UI import/check assertions
  pass separately. No tests or goldens were weakened.

The warm local Node planner measurement (~0.033 ms/call in the sampled fixture)
only informed the decision not to add a cache. It is not a frame-rate improvement
or target-machine performance result. Full browser-worker purchase/refit play,
rendered layout, gamepad/touch focus, and stress performance remain acceptance
work. Existing local/shared tests and a draft PR do not close SF-GAME or the larger
world direction. Local agents retain all model production.
