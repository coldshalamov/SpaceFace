# X-05 draft — Drifter: Kettle Nine's pods, a tired pilot's crime

Persona: The Drifter. Row §1P 563. Audit: `X-05-audit.md`.

## Ground

Working people's crimes are small: a pallet left unwatched, a lift nobody will miss until the shift
board says otherwise. The law is live (stolen-pod door `lawSecurity.js:2785`, guaranteed Helios patrol
`traffic.js:1936`). What's missing is something worth stealing, sitting on the way home.

## The encounter (Helios, after the rail)

Drift hauler **Kettle Nine** blew a coupling short of the Ceres gate. It dumped two pods of fuel
cells (4u each, owner-stamped) and is coming back with a tug.

- Hail (comms, Drift register): *"Kettle Nine. Coupling blew, dumped two pods. Back in five."*
  Then: *"Sit on 'em till the tug shows? Hundred fifty."*
- **Guard** (within 300 wu, 90 s, pods untouched): `d.grant(150,'salvage_watch')` and
  `d.rep('faction_dmc',3)`. *"Tug's here. Hundred fifty sent. You're alright."*
- **Take them**: latch/collect hits the existing `_reportStolenCargoPod`, the patrol witnesses it
  inside 450 wu, and the player is WANTED. Kettle Nine: *"Saw your registry on the shift board. Hope
  eight units was worth it."* The cells sell lawfully at the Ceres glut, so the crime really pays.
  That's what makes it a choice.
- **Fly on**: nothing happens. Ordinary traffic may scoop them.

## Lands in

- New content module `src/data/encounters/<next-free-order>-kettle-nines-pods.js` via `defineEncounter`,
  modelled on `1206-the-fire-sale.js` (`script:'selfRegistered'`, crSituationKit). Trigger:
  `deck:'civilian'`, `zoneTypes:['trade_lane']`, gates `sectorIds:['sector_helios_prime']` +
  `requiresCompletedShape:'opening_hauler_raid'`, `earlyWindowGuaranteeDay:1`, `earlyDelayS:[660,900]`.
  That window clears 367's [180,420]; prove it with `check-encounter-director.mjs` (45 s spacing law).
- Pods are ordinary jettisoned cargo pickups with `ownerId` = the hauler, the shape
  `isJettisonedCargoPod`/`cargoPodOwnerId` already read. No new law code. `payload_theft` already exists.
- Pins: `first-session-places` (ladder), encounter-director check.

## Working life

The temptation has a name and a shift board. The patrol, the heat, and the 150 were already real.
