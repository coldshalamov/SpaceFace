<!-- LIFETIME: RECEIPT -->
# PQ-177.07 — Mining operations stop at real limits

DONE — A programmed miner cuts finite ore, carries its own shipment, flies around station solids,
and sells only what the destination currently wants. The Operations card puts gross cut, stored
cargo, the limiting stage, realised sale and operating cost together. An empty field stops an empty
worker; a partial load still returns home. Fuel exhaustion preserves the purchased drone and cargo.

The controller reviewed and patched the delegated implementation before acceptance. The substantive
changes are in `53bbad10`, `fc5bbb7e` and `6e00bee6`. The first-visible bloom upload exposed by the
live route was fixed separately in `fd399adc`; the opening check was retained.

The 2026-09-06 live browser route passed at 1920×1080, followed by the station route at 1366×768.
Controlled progression supplied a Ranger, Drone Bay L and research, then construction, programming
and refueling went through the visible Operations controls. Extraction, physical flight, stock
pressure and settlement used their production owners:

- One 14-HP ore body yielded exactly one unit. Its delivery paid **73 credits** at the real arrival
  quote, exhausted the body and left the worker visibly **No rock to cut**, with zero operating cost.
- A second unit reached an explicitly oversupplied depot and stayed in the drone's shipment.
  The board showed **Depot is full of this ore**; no second sale was invented. Normal station demand
  continued throughout the trip. The fixture supplied stock through the economy owner.
- Empty fuel made the worker visibly stranded. Refuel restored fuel while preserving its identity,
  program, purchased equipment and unsold cargo.
- A refinery changed from missing Iron Ore to producing 30 units/minute when its feeder supplied
  the required 60 units/minute. Its authored world object survived sector departure and return
  without duplication. The complete route finished in 144 seconds with no page, console or network
  errors. Texture-serialization warnings were reported separately; this is not a warning-free claim.

All **87 automation tests** pass, including competing machines against finite destination intake,
bounded extraction and fuel use, duplicate settlement, a JSON save round trip, old fuel-empty
machines, and empty versus partially loaded workers. The **15/15 baseline** passed in 54.3 seconds,
including save-schema and repeated deterministic sim/reload checks. The startup repair's 39 focused
tests also pass.

The replacement constraint applies to this representative programmed-miner route. Unrelated
trader/outpost safeguards remain scoped to their own operations; this leaf does not claim that every
economy route has been rebalanced. No raids, equipment deletion or maintenance punishment were added.

Evidence: `.devshots/next10-drone-bloom-admission.log`,
`.devshots/acceptance/automation-outpost/` (nine player-route screenshots and the opening receipt),
`.devshots/next10-automation-depleted.log`, and `.devshots/next10-baseline-after-bloom.log`.
