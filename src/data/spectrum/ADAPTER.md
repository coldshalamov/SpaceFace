# Spectrum adapter — unapplied

This file is the integration patch. It is **not applied**. No edit was made to
`scanner.js`, `signalInvestigationPrompt.js`, the registry, the save envelope,
or the research grant table. The system runs in tests by being passed to
`createSimulation({ systems: [scanner, spectrum] })`. Production boot will not
load it until the lines below land.

The running contract is already the one the prompt understands. A Spectrum row
is a `signal:scanResults` primary with `classification`, `manualInvestigation`,
`triangulation.bearingDeg`, and `pos` set to the **ship**, not the source.
`signalMetaText` in `src/ui/signalInvestigationPrompt.js` (the `record.triangulation`
branch, around lines 45–52) prints `BEARING … · FIX n/m` without a code change.
Choosing the verb emits `signal:investigate`. Spectrum handles ids that start
with `spectrum:` and answers with `signal:investigating`. It does **not** emit
`ui:setCourse`, `signal:investigated`, or `anomaly:triangulated`.

Do not add a Spectrum row to `RESEARCH_GRANTS` in `src/data/researchGrants.js`.
Completion is a receipt toast plus `spectrum:resolved`. The scanner keeps the
3 RP firsts.

## 1. Register the system

`src/core/registry.js`

- Import next to the scanner import (line 27):

```js
import { spectrum } from '../systems/spectrum/index.js';
```

- Lookup entry immediately after `['scanner', scanner]` (line 452):

```js
['spectrum', spectrum],
```

`src/runtime/nodeSystemFactoryTable.js`

- Same import, and the same lookup immediately after `['scanner', scanner]` (line 249).

`src/runtime/authoritativeSystemManifest.js`

- `PRODUCTION_INIT_ORDER`, in the scanner cluster (line 30), insert `'spectrum'` after `'scanner'`.
- `PRODUCTION_UPDATE_ORDER` (line 77), insert `'spectrum'` after `'scanner'`.
- `TABLE_CLOCK_IDS` (the block that starts at line 342). Spectrum must tick every step so a brake press is seen the same tick. The pulse itself is synchronous: scanner emits `scan:pulse` from `_pulse` (scanner.js around line 1151) and Spectrum's listener runs inside that emit, whichever clock the scanner is on.

`name` is already `'spectrum'`. No clock alias is required.

## 2. Save

`src/save/saveSystem.js` already persists `signalInvestigation` via `_callSerialize('scanner')` (lines 742, 901, and the matching deserialize near 5013). Add a sibling key that calls Spectrum's own `serialize` / `deserialize` (both exist on the system object):

```js
spectrum: this._callSerialize('spectrum'),
```

on the way out, and `this._callDeserialize('spectrum', data.spectrum)` on the way in.
Do not fold Spectrum samples into `signalInvestigation`. The scanner normalizer would drop them.

## 3. Arm a case

From a mission or a POI script, after the player is in flight:

```js
bus.emit('spectrum:arm', { caseId: 'spectrum_cold_parallax' });
```

Case ids are `spectrumCaseIds()` in `src/data/spectrum/scenarios.js`. Arming copies nothing about the hidden pose into the UI. The next real scanner pulse (`state.input.actions.scanPulse`, consumed by `scanner.update`) is the measurement.

## 4. Player verbs already on the bus

| Intent | Payload | When it succeeds |
|---|---|---|
| Scanner pulse | existing `scanPulse` action | Always the measurement. Spectrum ignores any `scan:pulse` whose `source` is not `player-scanner`. |
| `spectrum:focus` | `{ motionClass: 'DRIFTING' }` or `{ key: 'T2' }` or `{ chartLabel: 'BUOY APEX' }` | Pins which return the fix is about. |
| `spectrum:tow` | `{ propId, x, z }` | Player within 390 WU of the prop (massline `maxLength` default) and the throw itself ≤ 390. |
| Brake | existing `state.input.actions.brake` while speed ≤ 8 | After a fix, the ship is within 150 WU of both the lead point and the physical body. |

`tetherGameplay.js` should, when a latched body id is a Spectrum prop, emit `spectrum:tow` with the latch endpoint. That emit is the whole hook. Do not give tether a Spectrum import beyond the id check.

## 5. Draw

Each frame, if `state.spectrum` is armed:

```js
import { buildSpectrumFrame } from '../render/spectrum/frame.js';
import { publicSpectrum } from '../systems/spectrum/model.js';

const frame = buildSpectrumFrame(publicSpectrum(state.spectrum), propList);
```

`frame.rays` are 160 WU ticks. `frame.ellipse` is omitted until `revealed`. Extrude `frame.silhouettes` (from `assets/spectrum/props.json` / `src/data/spectrum/props.js`) on Y. Do not place a marker on an emitter pose read from `scenarios.js`.

## 6. Prompt

No prompt change is required for the bearing line. Optional, still unapplied: in `showResults` (`signalInvestigationPrompt.js` around line 88), if `row.spectrum` exists, the existing `detail` string is already one sentence. Do not add a second card.

## 7. Do not

- Pass the hidden pose into `recordAnomalyBearing` from scanner code. Spectrum already passes a point on the heard ray so the gate can run.
- Copy `fixedPos` onto a Spectrum row.
- Emit `signal:investigated` from a Spectrum solve. That event is the scanner's payout.
