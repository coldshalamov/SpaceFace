# X-05 draft — The Accountant

## Audit correction

"No content offers a crime after the rail" overstates it. **1207 THE WITNESSED PRICE**
(`src/data/encounters/1207-the-witnessed-price.js`) already wires the whole law pipeline in
Helios:

- **Pods.** It stages owner-stamped freight pods (`:154-176`).
- **Witness.** An SCN cutter stands at 280 wu, inside the 450 wu witness radius (`:50,194`).
- **Heat path.** A scooped pod runs `lawSecurity._reportStolenCargoPod` (`:2785`) →
  `reportIncident('payload_theft')` → `heat.js` `INCIDENT_HEAT_BY_KIND` (`:114`).
- **Murder.** Killing the cutter is adjudicated as homicide.

The hole is **scheduling**. 1207 is a weight-1 combat-deck draw with `cooldownS 2400` and no
guarantee, so most first sessions never meet it.

Two other doors are not crimes. The 344/367 custody pods are excluded from theft
(`freightCustodyPod`, `lawSecurity.js:2789`), and 367's "bait" choice prices nothing.

## Proposal: one trigger edit

Add to the 1207 `trigger`:

```js
earlyWindowGuaranteeDay: 2,
earlyDelayS: [120, 300],
```

The ladder becomes 344 d0 → 585 d0 → 367 d1 → **1207 d2** → 346 d2.

## Numbers

| check | result |
|---|---|
| 346's d2 window | [420,780] |
| gap from 1207's 300 s cap | 120 s, over the 45 s spacing law |
| sector-day overlap | none (FIRST_SESSION_MAP §2) |
| 1207's own `windowS 300` | closes before 346 opens |

Heat stays wholly `heat.js`, at one `THEFT_INCIDENT` per witnessed grab. The lawful side pays
1,400 cr on the kill receipt through the director's grant intent. Both prices are visible.

## Determinism and save

The planner is seeded per sector-day, so day-2 Helios digests change and need a deliberate
re-record ("1207 pinned d2"). Days 0–1 are untouched. Director `completed` outcomes already
persist, so no save field is added.

## Tests

- Update `first-session-places.test.mjs:112`. Across seeds 4242–4247, assert 1207 on d2 with
  `delay <= 300`, still clear of `yard_towout`.
- Run `node scripts/check-encounter-director.mjs`.
- Keep green: `rc-458-first-half-hour`, the 1207 tests, and the theft-witness tests.

## Coordination

Board row 462 (RC-CHASE) owns the witness machinery. This changes 1207 trigger data only.

**Verdict: shippable, S. The crime, the witness and the heat already ship.**
