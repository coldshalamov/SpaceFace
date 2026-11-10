# X-07 draft — The Accountant

## Rejected

Any lockout, slowed radiator, or forfeit of the stored bonus is out. Owner ruling 2026-09-21
(`mining.js:192-198`) removed them, and `mining-beam-heat-no-lockout.test.mjs:149` pins "pegging
forfeits nothing". A bonus that decays while pegged is that same forfeit.

## The real hole

`_pulseOre` keeps accruing while the gauge is pegged (`mining.js:1175`). Holding through the whole
rock and releasing once pays `0.75 × total ore`, the same as perfect rhythm. Pegging dominates.

## Proposal: an opportunity cost, not a penalty

All changes are in `src/systems/mining.js`.

1. **The peg stops growing the pulse.** At `:1175` (`this._pulseOre += delivered`), accrue only
   while `beam.heat < beam.heatMax`. Extraction stays at full rate, the gauge never gates the
   beam, and nothing already stored is lost. The `:149` test releases on the first peg tick, so it still pays the full pulse at `depth 1`.
2. **Name the clean cut.** In `_resolveVent` (`:907`), set `clean = depth >= 0.85 && !pegged`.
   `this._pulsePegged` is a system-local flag, reset alongside `_pulseOre` (`:906`). Add `clean`
   to the `mining:ventBonus` payload as an additive field. In `src/ui/miningHud.js` `_renderSeam`
   (`:402`), show `CLEAN CUT` in the existing word slot for 1.2 s. No new DOM.

## Numbers

mk1 beam: heatRate 22, coolRate 55, heatMax 100. The peg is reached about 4.5 s into a 13 s rock.

- **Rhythm:** release near 95 and re-press near 60, about 1.6 s on and 0.6 s off at depth 0.87.
  The bonus is about **+65 %**.
- **Pegger:** 0.75 × 4.5/13, a bonus of about **+26 %**.

The spread is about **1.3×**, on top of the seam's ~3×.

## Determinism and save

Pegged holds pay less bonus, so mining digests need a deliberate re-record. There are no draws,
and the flag is never saved.

## Tests

- In `mining-beam-heat-no-lockout.test.mjs`, keep the three cases and add:
  - a 10 s pegged hold pays no more bonus than a first-peg release;
  - pegged extraction rate equals pre-peg extraction rate;
  - `clean` is true at depth 0.9 before the peg and false after it.
- Keep green: `mining-beam-pod-split-f12`.

**Verdict: shippable inside the ruling, S.**
