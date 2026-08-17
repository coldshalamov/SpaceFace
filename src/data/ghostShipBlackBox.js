// Plan 53: the Ghost Ship's flight recorder. Runtime persists only the physical recovery receipt;
// this immutable catalog supplies the authored account when Codex projects that receipt.

export const GHOST_SHIP_SHAPE_ID = 'rare_ghost_ship';
export const GHOST_SHIP_BLACK_BOX_CARGO_PREFIX = 'rare_black_box:ghost:';

export const GHOST_SHIP_BLACK_BOX = Object.freeze({
  title: 'Ghost Ship — Returned Hail',
  shortTitle: 'Ghost recorder',
  storyPropKind: 'rare_ghost_ship',
  logs: Object.freeze([
    Object.freeze({ stamp: 'T-04:12', text: 'Drive cold. Crew gone from the board. The carrier keeps accepting hails.' }),
    Object.freeze({ stamp: 'T-03:58', text: 'No sender. No voice. It returns each call in our own cadence.' }),
    Object.freeze({ stamp: 'T-02:31', text: 'Xenium sample is not in the manifest. It is warm.' }),
    Object.freeze({ stamp: 'T-00:07', text: 'I killed the transmitter. The answer came back anyway.' }),
  ]),
  note: 'Field note: a loopback after transmitter shutdown is evidence, not a survivor. Scan the hull before extraction; the Xenium trace is the useful lead.',
});

export function ghostShipBlackBoxRecords(story = {}) {
  const records = new Map();
  const remember = (encounterId, source = {}) => {
    if (!encounterId || records.has(encounterId)) return;
    records.set(encounterId, Object.freeze({
      encounterId,
      cargoId: source.cargoId || `${GHOST_SHIP_BLACK_BOX_CARGO_PREFIX}${encounterId}`,
      sectorId: source.sectorId || null,
      zoneId: source.zoneId || null,
      recoveredAt: Number.isFinite(Number(source.at)) ? Number(source.at) : null,
      title: GHOST_SHIP_BLACK_BOX.title,
      logs: GHOST_SHIP_BLACK_BOX.logs,
      note: GHOST_SHIP_BLACK_BOX.note,
    }));
  };

  const history = story && story.flags && story.flags.rareSpawns
    && story.flags.rareSpawns.history;
  for (const receipt of Array.isArray(history) ? history : []) {
    if (!receipt || receipt.kind !== 'black_box' || receipt.shapeId !== GHOST_SHIP_SHAPE_ID) continue;
    remember(receipt.encounterId, receipt);
  }

  const cargo = Array.isArray(story && story.persistentCargo) ? story.persistentCargo : [];
  for (const cargoId of cargo) {
    const value = String(cargoId || '');
    if (!value.startsWith(GHOST_SHIP_BLACK_BOX_CARGO_PREFIX)) continue;
    remember(value.slice(GHOST_SHIP_BLACK_BOX_CARGO_PREFIX.length), { cargoId: value });
  }
  return Array.from(records.values());
}
