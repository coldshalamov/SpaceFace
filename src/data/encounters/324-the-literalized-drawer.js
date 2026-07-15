// 324 — THE LITERALIZED DRAWER. Hedberg steal: REF 44-C treated as a physical object
// — a derelict station where the code is a literal drawer you can stand in front of.
// One sharp angle, followed to its weird-but-internally-consistent conclusion. The
// bureaucracy made solid; the joke is that it was always this concrete and nobody
// noticed because noticing costs more than the drawer.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 324;
export const trigger = deepFreeze({
  id: 'side_literalized_drawer', tier: 'minor', deck: 'mystery', weight: 0.4,
  zoneTypes: ['anomaly_deep'], script: 'selfRegistered',
  pressureCost: 14, cooldownS: 86400, proximity: true, rare: true,
  gates: { uniqueOnce: true, storyBeatMin: 5 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h9;
export default defineEncounter(trigger, {
  title: 'THE LITERALIZED DRAWER', factionId: 'faction_free', noCombat: true, noCredits: true,
  primaryLine: 'STATION: Records annex, second tier. The drawer is third from the left, second row. The tape is yellowed. The label is REF 44-C. The drawer is unlocked. The drawer is full.',
  choices: [
    { id: 'open',    label: 'Open the drawer',       playerLine: 'Open it.' },
    { id: 'file',    label: 'File something in it',  playerLine: 'Add a page.' },
    { id: 'close',   label: 'Close the drawer',      playerLine: 'Leave it shut.' },
  ],
  timeoutChoice: 'close',
  receipts: {
    open:  'DRAWER OPENED — the papers are the filings. The filings are the crimes. The crimes are lawful. The drawer holds them. The drawer has held them for nineteen years. It will hold them for nineteen more.',
    file:  'PAGE FILED — your signature joins the column. REF 44-C. The drawer closes. The drawer does not judge the paper. The drawer is the only honest thing in the annex.',
    close: 'DRAWER LEFT CLOSED — it will be here next cycle. It is always here next cycle. The tape will be yellower. The label will not need re-taping. Everyone who files knows the drawer.',
  },
  graffitiOn: {
    open: { line: 'THE DRAWER IS UNLOCKED. IT HAS ALWAYS BEEN UNLOCKED.', where: 'bulkhead' },
  },
});
