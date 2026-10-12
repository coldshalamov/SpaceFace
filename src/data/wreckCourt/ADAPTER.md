# Wreck Court adapter (unapplied)

Do not apply this while another lane owns the files below. The court runs without it: `openCourt` / `act` / `file` are the playable path, and `buildAdventureOffer` is the offer shape. Nothing here writes credits, heat, reputation, cargo, or the save envelope.

## Early case, existing adventure flow

`wc_desperate_rescue` ("The Burn That Broke the Tug") is the case that should appear from a loss-investigation communicator. No new menu. No `choice` tree. The offer type is the existing `recon_scan`.

### 1. Mark the point — `src/systems/lossInvestigation.js`

In the promote path, after the entity is stamped (the block ending near line 169, where `ent.data.wreckMissionId` and `ent.data.lossInvestigation` are set), also set:

```javascript
point.wreckCourtCaseId = 'wc_desperate_rescue';
point.wreckCourtSeed = (rec.lossId && hash32(rec.lossId, 'wreckCourt')) >>> 0 || 1;
```

`hash32` is already the repo hasher (`src/core/rng.js`). One promoted loss, one seed. Do not offer the other eleven cases from this seam; they stay anthology entries opened by the same `openCourt({ caseId, seed })`.

### 2. Emit the court offer instead of a salvage choice — `src/systems/salvage.js` `_offerFromPoint`

Add a top-level import in `salvage.js` (not an inline import):

```javascript
import { buildAdventureOffer } from './wreckCourt.js';
```

In `_offerFromPoint`, after the `_offerAlreadyKnown` return (line 1128) and instead of `_buildOffer(mission, point)` when `point.wreckCourtCaseId` is set:

```javascript
const court = buildAdventureOffer(point.wreckCourtSeed || 1);
const station = this._wreckStation(point);
const offer = {
  ...court,
  id: `salvage_${point.id}`,
  offerId: `salvage_${point.id}`,
  stationId: station ? station.id : null,
  sectorId: point.sectorId,
  zoneId: point.zoneId,
  params: {
    ...court.params,
    salvagePointId: point.id,
    wreckPos: { x: point.pos.x, z: point.pos.z },
    wreckSectorId: point.sectorId,
  },
  pos: { x: point.pos.x, z: point.pos.z },
  choice: null,
};
if (offer.stationId) this.bus.emit('mission:offered', offer);
```

Do not copy `mission.choice` onto this offer. Do not add the case to `WRECK_MISSIONS`.

### 3. Opening the scene

When the player reaches `params.wreckPos` and scans, the host calls:

```javascript
import { openCourtFromOffer, act, publicView, serializeCourt } from './wreckCourt.js';
const session = openCourtFromOffer(offer);
```

Verbs map onto tools the player already has:

| Court verb | Existing control |
|---|---|
| `scan` | scan action, mode chosen by the instrument |
| `position` | flight; the session records the ship XZ |
| `grapple` / `tow` | massline latch and force |
| `bringPod` | massline tow onto the assay buoy |
| `compare` / `reconstruct` / `file` | court notebook, not a dialogue UI |

`wreckCourt.update` is a no-op. Do not add a registry row.

### 4. Single writers

On `ruling.status === 'accepted'`, dispatch intents and stop:

- `ruling.intents.economy` → economy credit intent. Amount and payee are on the ruling. The court does not call the economy writer.
- `ruling.intents.heat` → heat/law intent when non-null.
- `ruling.intents.worldFacts` → story/world fact intent. Not a direct ledger write.

An `unaccepted` ruling has amount 0 and does not stamp the scene.

### 5. Save

Persist `serializeCourt(session)` as an opaque blob the save owner stores. Schema version is `WRECK_COURT_SCHEMA_VERSION` (1). Restore with `restoreCourt(blob)`, which rematerializes the incident from `caseId` + `seed` and replays the verb log. Do not fold court fields into the global save schema in the same edit as unrelated save work.

### 6. Draw

`presentCourt(publicView(session))` returns extruded meshes (positions, normals, indices) from `assets/wreck-court/variants.json`. These are code-native silhouettes, not Forge GLBs. Promoting them into `assets/ships/parts/parts_manifest.json` and `src/render/partsLibrary.js` is a later art pass; do not do it as a side effect of wiring the offer.

### 7. What not to touch

`src/core/**`, flight, the ORRERY screens, `build_map.md`, and the global save schema. The hearing set-piece in `_offerHearing` (emit near line 275) can keep firing for other losses. Only a point with `wreckCourtCaseId` takes the court offer.
