import { localizeText } from '../localization/gameLocalization.js';

// Kept on a scanned UI surface so the existing extractor owns these public-route strings.
export const LOCALIZED_CORE_COPY = Object.freeze({
  newGame: { label: 'New Game' },
  continue: { label: 'Continue' },
  loadGame: { label: 'Load Game' },
  settings: { label: 'Settings' },
  signalArchive: { label: 'Signal Archive' },
  continueSummary: { label: 'Continue: {summary}' },
  noSave: { label: 'No save found - New Game opens Contract 47-A in Helios.' },
  pilotName: { label: 'Pilot name' },
  difficulty: { label: 'Difficulty' },
  firstMinutes: { label: 'First 15 minutes' },
  back: { label: 'Back' },
  launch: { label: 'Launch' },
  launching: { label: 'Launching...' },
  paused: { label: 'Paused' },
  flightBrief: { label: 'FLIGHT BRIEF' },
  resume: { label: 'Resume' },
  save: { label: 'Save' },
  load: { label: 'Load' },
  missionLog: { label: 'Mission Log ({key})' },
  operations: { label: 'Operations' },
  helpControls: { label: 'Help / Controls' },
  codex: { label: 'Codex' },
  mainMenu: { label: 'Main Menu' },
  quitGame: { label: 'Quit Game' },
  quit: { label: 'Quit' },
  tutorialObjective: { label: 'TUTORIAL OBJECTIVE' },
  currentObjective: { label: 'CURRENT OBJECTIVE' },
  nextAction: { label: 'NEXT ACTION' },
  trackContract: { label: '{key} Mission Log · track {contract}' },
  chooseStoryAction: { label: '{key} Mission Log · choose the next story action' },
  noGoalTrack: { label: 'NO GOAL MARKER · TRACK ONE CONTRACT' },
  noGoalSet: { label: 'NO GOAL MARKER · SET ONE IN MISSION LOG' },
});

export function coreText(id, values = {}) {
  const entry = LOCALIZED_CORE_COPY[id];
  return localizeText(entry ? entry.label : id, values);
}
