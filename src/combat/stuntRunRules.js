// Explicit revision boundary for new PQ-146 records. Never applied to historical records.
import { normalizeGameSpeed } from '../core/timeEffects.js';
export const STUNT_RULE_REVISIONS=Object.freeze({balanceRevision:'pq146-threat-2',physicsRevision:'rapier-dynamic-pq146-2',scoringRevision:'2'});
export function stuntAssistProfile(state) { return state.settings?.gameplay?.stuntMoments==='flow'?'flow':'cinematic'; }
export function currentStuntRunRules(state,mode) {
  const run=state.run;
  const rules={...STUNT_RULE_REVISIONS,mode:run.practice===true?'practice':mode,arenaId:run.arenaId,difficulty:run.difficulty??'authored',
    loadoutRules:JSON.stringify({ruleset:run.ruleset,mutators:run.arenaMutators??[],starter:run.telemetry?.starterKitId??null,stake:run.telemetry?.swarmStake??null}),
    simulationAssistProfile:stuntAssistProfile(state)};
  const speed=normalizeGameSpeed(state.settings?.gameplay?.gameSpeed);
  if(speed<1)rules.simulationSpeedAssist=speed;
  return rules;
}
