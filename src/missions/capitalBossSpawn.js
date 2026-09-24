import { requireCapitalBossEncounter } from '../data/encounters/capital-boss.js';

/** Call INSIDE _spawnCapitalBossTargets, before helpers.spawnEntity(spec). Mutates a NEW spec, not GameState. */
export function decorateCapitalBossSpawnSpec(spec,actor,encounter,{missionId,index=0}={}) {
  if(!spec||!actor||!encounter?.score||!missionId) throw new TypeError('Capital spawn context missing');
  spec.data={...(spec.data||{}),capitalBossEncounterId:encounter.id,
    capitalBossActorKey:`${missionId}/${actor.role}/${index}`,missionPinned:true};
  // Verified combat/save persistence includes only player + flags.persistent entities.
  spec.flags={...(spec.flags||{}),persistent:true};
  if(actor.role==='capital_hull') {
    spec.data.ai={...(spec.data.ai||{}),combatDoctrineId:actor.combatDoctrineId,identityStock:true};
    spec.data.capitalScoreOwned=true;
    spec.flags={...(spec.flags||{}),invuln:false};
    // The missionTag remains m.id for mission ownership. Never replace it with a definition id.
  }
  return spec;
}
/** Authored offset helper for initial layout only; never call to move an existing actor. */
export function capitalBossBallastPosition(encounter,bossSpawn,index) {
  const offsets=encounter.score.arena.ballastOffsets;
  const [x,z]=offsets[index%offsets.length],heading=bossSpawn.rot||0,c=Math.cos(heading),s=Math.sin(heading);
  return {x:bossSpawn.pos.x+c*x-s*z,z:bossSpawn.pos.z+s*x+c*z};
}
/**
 * Invoke in the mission/world spawn owner. `ledger` belongs to that owner and must be saved.
 * Keys are durable slots; a null entityId is a tombstone, not permission to spawn again.
 * makeEnemySpawnSpec and spawnEntity are the same existing ports used by missions.js.
 */
export function spawnCapitalBossWing({command,record,boss,level=4,ledger,makeEnemySpawnSpec,spawnEntity}) {
  if(!ledger||typeof makeEnemySpawnSpec!=='function'||typeof spawnEntity!=='function'||!boss)
    throw new TypeError('Use the mission-owned spawn ports and durable ledger');
  const encounter=requireCapitalBossEncounter(record.encounterId);
  const wing=encounter.score.wings.find(w=>w.id===command.wing.id);
  if(!wing) throw new RangeError('Unknown capital wing');
  // Preflight all unissued specs before spawning any actor: a bad second archetype must not
  // leave the first actor alive without a returned receipt (and therefore without its fire gate).
  const plan=wing.members.map((member,index)=>{
    const slot=`${record.fightId}/${wing.id}/${index}`;
    if(Object.hasOwn(ledger,slot)) return {slot,index,spec:null};
    const angle=(boss.rot||0)+Math.PI+(index===0?-0.65:0.65);
    const pos={x:boss.pos.x+Math.cos(angle)*205,z:boss.pos.z+Math.sin(angle)*205};
    const spec=makeEnemySpawnSpec(member.archetype,level,pos,{startedTick:command.tick,
      motive:'capital_screen',engagementTrigger:'capital_boss_contract'});
    if(!spec||typeof spec!=='object') throw new TypeError('Native enemy factory returned no wing spec');
    spec.data={...(spec.data||{}),missionTag:record.fightId,physicalRole:`capital_wing_${wing.id}_${index}`,
      capitalBossWingKey:slot,missionPinned:true,
      ai:{...(spec.data?.ai||{}),combatDoctrineId:member.combatDoctrineId,identityStock:true,
        squadId:`${record.fightId}/${wing.id}`,doctrine:'balanced',formation:wing.formation,
        formationSpacing:wing.formationSpacing},
      capitalWingGrammar:wing.grammar,capitalWingRole:member.wingRole,capitalWingTwist:wing.twist};
    spec.flags={...(spec.flags||{}),persistent:true};
    delete spec.data.reinforcements;
    return {slot,index,spec};
  });
  return plan.map(({slot,index,spec})=>{
    // Recheck after preflight: a reentrant native callback may already have reserved this slot.
    if(Object.hasOwn(ledger,slot)) return ledger[slot].entityId??null;
    ledger[slot]={entityId:null,spawned:true,memberIndex:index};
    try {
      const entity=spawnEntity(spec);
      ledger[slot].entityId=entity?.id??null;
    } catch(error) {
      // Preserve a two-slot receipt even if a later native spawn fails. The successful member
      // still gets gated. This denial is durable and inspectable, never an unlimited retry.
      ledger[slot].error={name:String(error?.name||'Error').slice(0,80),
        message:String(error?.message||error).slice(0,240)};
    }
    return ledger[slot].entityId;
  });
}

/** Mission-owned issuance ledger: existing or consumed actors are never minted again on load.
 * A spawn that genuinely returns null is retryable; it never existed, so no resource was spent.
 * A successful spawn remains issued even when its runtime id later vanishes during virtualization.
 */
export function spawnCapitalActorOnce({ledger,spec,spawnEntity}) {
  const slot=spec?.data?.capitalBossActorKey;
  if(!ledger||!slot||typeof spawnEntity!=='function')throw new TypeError('Decorated actor and mission-owned ledger required');
  if(Object.hasOwn(ledger,slot))return null;
  ledger[slot]={state:'pending',entityId:null};
  let entity;
  try {entity=spawnEntity(spec);}catch(error){delete ledger[slot];throw error;}
  if(!entity){delete ledger[slot];return null;}
  ledger[slot]={state:'issued',entityId:entity.id};return entity;
}
/** Invoke after ALL saved mission entities are restored. Absence is not permission to respawn. */
export function resolveCapitalBossRoleBinding({record,targetId,entities}) {
  const byKey=new Map();
  for(const entity of entities||[]) {
    if(!entity||entity.alive===false)continue;
    const slot=entity.data?.capitalBossActorKey||entity.data?.capitalBossWingKey;
    if(!slot||!slot.startsWith(`${record.fightId}/`))continue;
    if(byKey.has(slot))throw new Error(`Duplicate durable capital slot: ${slot}`);
    byKey.set(slot,entity.id);
  }
  const bossId=byKey.get(`${record.fightId}/capital_hull/0`);
  if(bossId==null||targetId==null)return null;
  const definition=requireCapitalBossEncounter(record.encounterId),wingIds={};
  for(const id of Object.keys(record.wings)){
    const wing=definition.score.wings.find(w=>w.id===id);
    wingIds[id]=wing.members.map((_,i)=>byKey.get(`${record.fightId}/${id}/${i}`)??null);
  }
  return {bossId,targetId,wingIds};
}
