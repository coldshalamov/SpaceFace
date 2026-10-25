/** Import-boundary-pure additions for the shared production manifest. */
export const SHIPBREAKING_YARD_INIT_IDS = Object.freeze(['shipbreakingYard', 'shipbreakingYardBrowser']);
export const SHIPBREAKING_YARD_UPDATE_IDS = Object.freeze(['shipbreakingYard']);
export const SHIPBREAKING_YARD_TABLE_CLOCK_IDS = SHIPBREAKING_YARD_UPDATE_IDS;
export const SHIPBREAKING_YARD_FRESH_RUN_IDS = SHIPBREAKING_YARD_INIT_IDS;
export const SHIPBREAKING_YARD_CAPABILITIES = Object.freeze({
  shipbreakingYard: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'occupation' }),
  // nodeSafe:false is intentional: the worker registry excludes all Node-safe systems
  // from the main thread, including event-only systems. The deck and mixer stay here.
  shipbreakingYardBrowser: Object.freeze({ nodeSafe: false, phase: 'platform', capability: 'presentation' }),
});
export const SHIPBREAKING_YARD_MAIN_TO_SIM_EVENTS = Object.freeze(['shipbreakingYard:action']);
export const SHIPBREAKING_YARD_SAVE_KEY = 'shipbreakingYard';
