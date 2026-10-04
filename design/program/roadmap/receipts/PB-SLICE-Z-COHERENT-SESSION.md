# PB-SLICE-Z — SF-300: a coherent session connects work, risk and ownership

**Board row:** `build_map.md` #82 — the slice-chain capstone; composes the landed chain
(SF-289/290, SF-294/295 machinery and the NXI-169/171 shortage-board contract) into one
ordinary session instead of building new systems.
**Status:** implemented / route-unproven — the session is driven through the live owners in a
seeded `createSimulation` (economy + missions + economyContracts + lawSecurity); no headed
playthrough exists in this environment.

## The packet law check (equivalent-feature gate)

The capstone asked for one playable session where a useful job exposes a physical
complication, the player makes a build-dependent choice, and the consequence gives a reason
to return. The chain already lands every leg:

- **the job** — SF-290 (PB-SLICE-B): `starvedIndustryNeedFor` reads the real hopper and
  `_starvedIndustryOffer` posts the feed run on a reachable board;
- **the complication** — SF-289 (PB-SLICE-B): the Helios customs corridor reads the reader —
  hold the beam, outrun it, or stay out;
- **the consequence** — `cargo:delivered` → `applyFreightDelivery` → stock (PB-SLICE-B),
  `economy:shortageRelieved` citing `mission-delivery:<id>` (NXI-108), board rows re-quoted
  or retired from the live hopper (NXI-169/171), and `customsHotUntil` decaying on the
  scanner ledger (PB-SLICE-B).

Nothing was missing at the causal seams, so the unit is the packet's own required artifact:
**the capstone regression** — `test/pb-slice-z.test.mjs`, 7 cases binding the whole session
with an explicit before/after. No production files changed; a parallel mechanism would have
been a second system, which the packet forbids.

## The session the test pins

Broker = `station_coalition` (Helios Prime board without the first-trade latch); yard =
`station_ceres` (authored refinery in the neighbor sector); gate = `HELIOS_CUSTOMS_WEIR`.

1. **Lawful build (before→after):** starve the yard → dock → board posts the run naming the
   real input leg → accept loads sealed freight into the hold → the hull holds the beam
   (`weir_read` + `customs_weir` scan, no flag) → dock at the yard → `cargo:delivered` once,
   stock +lot, `mission:completed` once, `starvedIndustryNeedFor` → null, and the relief cue
   cites `mission-delivery:<id>`. Before/after: starving hopper → fed, throttled production →
   resumed (>3×).
2. **Return visit:** the fed line keeps producing while away; a next-epoch broker dock posts
   no stale emergency; a replayed delivery receipt republishes the canonical fact without
   re-moving stock or minting a second cue; a spent run cannot re-pay at a second dock.
3. **Runner build:** a hull above `readSpeed` (34 WU/s) streaks the corridor → one
   `speed_run` bolt → `customsHotUntil` = now+600 — the job still lands (the flag is the
   cost, not the contract). Repeat bolts re-base the same window, never compound; the flag
   decays on its own clock.
4. **The intentional mistake:** a mid-read bolt is a `read_bolt` — flagged, but the beam
   resolves the manifest it mostly kept (`customs_weir_bolt`); a shallow graze flags with
   nothing kept. The delivery still completes — imperfect continuation stays playable.
5. **The short arrival:** six sealed units spilled en route → dock → `partial_delivery`
   pays the delivered fraction, the hopper gains only what physically arrived, the yard is
   still starving — and the next-epoch broker dock re-posts the SAME shortage re-quoted from
   the live deficit. The reason to return is the unfinished work, not a replayed emergency.
6. **Counterexamples:** a yard fed by other means before the player commits retires its row
   — `acceptMission` refuses the stale premium with the named reason; routing around the
   gate flags and scans nothing; ignoring the row conjures nothing.

## Checks

- `node --test test/pb-slice-z.test.mjs` — **7/7**.
- Packet's named starting points: `test/m2-continuous-handoff.test.mjs` +
  `test/core-first-ten-minute-contract.test.mjs` — **18/18**;
  `test/save-growth-dock-trade-flat.test.mjs` — (soak; see board row for final count).
- Composed-seam adjacents: `test/pb-slice-b-weir-bolt-starved-yard.test.mjs`,
  `test/next-wave-nxb-043.test.mjs`, `test/nxi-108-shortage-relief.test.mjs`,
  `test/nxb-028-partial-delivery.test.mjs`, `test/customs-weir.test.mjs` — **42/42**.

## Notes

- `makeEntity` (the canonical builder) supplies the pilot hull — `SimVector3 prevPos` is
  required by `core.preStep`; fixture-authored bare objects throw there.
- The fast-hull bolt is "build-dependent" in the weir's own law: `entitySpeed > readSpeed`
  makes the read physically impossible — a hull that cannot beat 34 WU/s must hold the
  beam or route around. The test frames builds as what each hull can actually do.
- Foreign dirty files untouched; write-set was the new test, this receipt, and the board row.
