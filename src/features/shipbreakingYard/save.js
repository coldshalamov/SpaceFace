import { freshYardState, snapshotYardState } from './model.js';
import { SHIPBREAKING_YARD_SAVE_KEY as KEY } from './manifest.js';

const yardOwner = saveOwner => saveOwner?.registry?.get?.(KEY);

/** Uses the feature's ledger owner, including its synchronous native-pose/cut capture.
 * Does not serialize entities, money, combat attachments, or native handles twice. */
export function serializeShipbreakingYard(saveOwner) {
  const yard = yardOwner(saveOwner);
  if (yard?.serialize) return yard.serialize();
  const row = saveOwner?.state?.shipbreakingYard;
  return snapshotYardState(row || freshYardState(saveOwner?.state?.meta?.seed || 1));
}

/** Insert beside towlineTable in _saveCapturePlan, preserving the same key order below. */
export function shipbreakingYardSavePlanEntry(saveOwner) {
  return [KEY, () => serializeShipbreakingYard(saveOwner)];
}

/** yield* this beside towlineTable in _serializeDataSteps. */
export function* serializeShipbreakingYardSteps(saveOwner, data) {
  data[KEY] = serializeShipbreakingYard(saveOwner);
  yield 'serialize:shipbreakingYard';
}

/** Call before saved entities/combat are rebuilt. An absent key is an old, untouched yard.
 * Hydration stays suspended until the existing restore owner has restored exact originals. */
export function* restoreShipbreakingYardSteps(saveOwner, data) {
  const yard = yardOwner(saveOwner);
  if (yard?.deserialize) yard.deserialize(data?.[KEY]);
  yield 'shipbreaking-yard-restored';
}

/** Call after _restoreCombatSteps, beside the other afterContinue hooks. */
export function afterContinueShipbreakingYard(saveOwner) {
  yardOwner(saveOwner)?.afterContinue?.();
}
