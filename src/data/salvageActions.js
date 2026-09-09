// salvageActions.js - BP-01.1 SALVAGE_DISTINCT_FROM_MINING pure catalog.
//
// Wreck salvage should read as a puzzle verb, not just asteroid mining with a different mesh. This
// file is pure data plus pure helpers: parentType/wreck metadata -> action readout and deterministic
// salvage pool. The system layer annotates entities and handles timers.

export const SALVAGE_ACTIONS = Object.freeze({
  cut_panel: Object.freeze({
    id: 'cut_panel',
    verb: 'cut panels',
    label: 'Cut Panels',
    glyph: 'CUT',
    hint: 'Slice outer plating and pull scrap cleanly.',
    pool: Object.freeze({ cmdty_scrap_metal: 4 }),
  }),
  pull_module: Object.freeze({
    id: 'pull_module',
    verb: 'pull module',
    label: 'Pull Module',
    glyph: 'MOD',
    hint: 'Free a sealed subsystem before the beam chews it up.',
    pool: Object.freeze({ cmdty_salvage_electronics: 2 }),
  }),
  decode_blackbox: Object.freeze({
    id: 'decode_blackbox',
    verb: 'decode black box',
    label: 'Decode Black Box',
    glyph: 'LOG',
    hint: 'Hold scan long enough to recover a readable flight log.',
    pool: Object.freeze({ cmdty_salvage_electronics: 1, cmdty_scrap_metal: 1 }),
  }),
  vent_reactor: Object.freeze({
    id: 'vent_reactor',
    verb: 'vent reactor',
    label: 'Vent Reactor',
    glyph: 'VENT',
    hint: 'Vent the unstable core or tow it clear before it bursts.',
    pool: Object.freeze({ cmdty_fuel_cells: 1, cmdty_salvage_electronics: 1 }),
    unstable: true,
    timerS: 8,
    burstDamage: 18,
    counterplay: Object.freeze(['vent', 'tether-away']),
  }),
});

export const SALVAGE_ACTION_IDS = Object.freeze(Object.keys(SALVAGE_ACTIONS));

export function actionById(id) {
  return SALVAGE_ACTIONS[id] || null;
}

export function actionForWreck(entity) {
  const data = entity && entity.data || {};
  const parentType = data.parentType || data.kind || data.poiType || 'debris';
  if (data.unstableReactor === true || (data.unstableReactor && typeof data.unstableReactor === 'object') || parentType === 'reactor') {
    return SALVAGE_ACTIONS.vent_reactor;
  }
  if (parentType === 'communicator' || data.isCommunicator || data.wreckMissionId) return SALVAGE_ACTIONS.decode_blackbox;
  if (parentType === 'ship' || parentType === 'module' || parentType === 'military') return SALVAGE_ACTIONS.pull_module;
  return SALVAGE_ACTIONS.cut_panel;
}

export function poolForAction(actionOrId) {
  const action = typeof actionOrId === 'string' ? actionById(actionOrId) : actionOrId;
  const pool = action && action.pool || SALVAGE_ACTIONS.cut_panel.pool;
  return { ...pool };
}

export function actionReadoutForWreck(entity) {
  if (!entity) return null;
  const action = actionForWreck(entity);
  return {
    targetId: entity.id,
    id: action.id,
    actionId: action.id,
    verb: action.verb,
    label: action.label,
    glyph: action.glyph,
    hint: action.hint,
    unstable: !!action.unstable,
    counterplay: action.counterplay ? Array.from(action.counterplay) : [],
  };
}

export default SALVAGE_ACTIONS;
