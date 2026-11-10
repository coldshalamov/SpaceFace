# Orchard harvest guidance — 2026-10-21

## Bounded player-facing increment

The ordinary Alin encounter previously supplied atmosphere, weather and safe/lost
pod observations, but did not explain how to discover the frame's component
selection or connect an original released pod to accepted player cargo. The repair
story is separate and unchanged.

The new optional companion now offers four short, finite explanations:

1. A real occupied socket: target the Orchard and use its existing component readout.
2. That exact selected socket: use the remapped World Site beam during calm.
3. A uniquely indexed, natively ready, unattached original pod: approach slowly,
   avoid the hot band and reserve the whole lot's actual hold volume.
4. An actual finalized player cargo receipt: acknowledge the accepted quantity and
   point toward checking Tethys's market buy price, without promising a price/reward.

Component selection is the existing clickable/focusable target-panel chip
(`targetPanel.js`, click or Enter/Space); there is no invented component keybind.
Beam labels come from `resolveActionLabel`. Captions have six seconds and begin
only when at least six seconds of calm remain. Priority 49 yields to existing
Alin loss/safe/repair barks (50) and weather alerts. No forced tutorial, selection,
release, purchase, cargo mutation, ownership grant or reward is added.

## Authority, persistence and cost

The registered bark director already owns the parent Alin encounter. The parent
constructs, updates and resets/destroys this companion through the same route.
Cargo initializes before that director. Its synchronous pickup listener finalizes
accepted/rejected amounts and finite retirement before the companion observes the
receipt. Orchard pods actually use the `ore` event kind and are already retired
when downstream observers run; the observer checks finalized accepted quantity,
player collector, original lot/commodity identity, delivered finite ledger and
actual hold quantity. An attempted, rejected, NPC or replayed retired pickup is
not an acknowledgment. No new authority token or outcome ledger is introduced.

Only four surfaced guidance flags and the first accepted `{lotId, units}` are
saved in player hints. Queued but unheard text is not consumed. Actual
Save/Continue tests restore an unheard acceptance and later suppress a heard one.
Malformed saved hint shapes are discarded, not interpreted as accepted cargo.

Decisions are capped at two per simulated second. Pod discovery requires the
existing ready, unique world-record index; there is no population-scan fallback.
Admission checks native readiness. Voice polling uses bounded finite-ledger reads
and cheap exact-life/body/facade/backend/authority checks, not native census scans.
Legitimate native motor publication can replace the finite row without truncating
an otherwise truthful caption; same-lot facts and current phase still must agree.

## Evidence and limits

- Source/functional: focused native custody, actual cargo/mining acceptance,
  real voice arbitration, motor publication and Save/Continue tests are present.
- Regression suite: **70/70 passed** on the sealed working source (14 focused
  harvest cases plus 56 adjacent cases). Command: `node --test` followed by
  these five paths: `test/orchard-harvest-guidance.test.mjs`,
  `test/anvil-orchard-alin-encounter.test.mjs`,
  `test/anvil-orchard-player-release.test.mjs`,
  `test/orchard-shift-recovery-encounter.test.mjs`, and
  `test/orchard-receiver-repair-hail.test.mjs`.
- Exact paths: two world modules, one new test and this note. Root owns test/import
  registration and public-only projection; no private ancestry may be pushed.
- No assets, runtime model activation, physics settings, custody mechanisms,
  traffic work, market prices, crew cargo or repair outcomes are changed.
- Visual: independent production-caption component review is separate; this
  source fixture is not a gameplay-camera capture or full ordinary flight proof.
- Performance: bounded-work regression, not target-device frame certification.
- Full Orchard, living-world and whole-game acceptance remain open. No repeated
  full-shift route is required or claimed by this bounded guidance increment.
