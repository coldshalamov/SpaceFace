const finite = (v, min=0) => Number.isFinite(v) && v>=min;
const integer = (v,min=0) => Number.isSafeInteger(v)&&v>=min;
const SUBSYSTEMS = new Set(['subsystem_drive','subsystem_weapon','subsystem_tether_spool','subsystem_power','subsystem_sensor']);
const CHANNELS = new Set(['kinetic','thermal','ion','plasma','phase']);
const REQUIREMENTS = new Set(['weapon','drive','tether_spool']);
const IDS = /^[a-z][a-z0-9_]*$/;
export function validateCapitalBossEncounter(e, vocabulary={}) {
  const errors=[];
  const check=(ok,message)=>{if(!ok) errors.push(message);};
  check(e && IDS.test(e.id),'encounter id');
  if(!e || !e.score) return {ok:false,errors:[...errors,'missing executable score']};
  const s=e.score,boss=e.actors?.find(a=>a.role==='capital_hull');
  check(s.version===1,'score.version');
  check(boss?.count===1&&finite(boss.hull,1)&&boss.shield===0&&boss.armor===0,'damageable capital actor');
  check(Array.isArray(s.acts)&&s.acts.length===3,'exactly three acts');
  check(Array.isArray(s.beats)&&s.beats.length>0,'nonempty score');
  for(const key of ['introTicks','transitionTicks','resumeTicks','voiceGapTicks']) check(integer(s[key],1),key);
  check(finite(s.engageRadius,1)&&s.suspendRadius>s.engageRadius,'engagement hysteresis');
  check(s.maxWingMembers===2,'two-wing-member ceiling');
  const beats=new Set();
  for(const b of s.beats||[]) {
    const id=`${e.id}/${b.id}`;
    check(IDS.test(b.id)&&!beats.has(b.id),`${id}: unique beat id`);beats.add(b.id);
    check(integer(b.trackTicks)&&integer(b.tellTicks,90)&&b.tellTicks-b.trackTicks>=90,`${id}: at least 90 locked tell ticks`);
    check(integer(b.activeTicks,1)&&b.activeTicks<=60&&integer(b.recoverTicks,90),`${id}: bounded active/recovery`);
    check(Array.isArray(b.requires)&&b.requires.length>0&&b.requires.every(x=>REQUIREMENTS.has(x)),`${id}: requirements`);
    check(b.counter?.length>15,`${id}: explicit counterplay`);
    check(Array.isArray(b.shapes)&&b.shapes.length>0&&b.shapes.length<=4,`${id}: bounded geometry`);
    for(const g of b.shapes||[]) {
      check(['lane','sector'].includes(g.kind)&&['hull','target'].includes(g.aim)&&Number.isFinite(g.heading),`${id}: shape`);
      if(g.kind==='lane') check(finite(g.start)&&g.end>g.start&&finite(g.width,1)&&Number.isFinite(g.lateral),`${id}: lane dimensions`);
      else check(finite(g.inner)&&g.outer>g.inner&&g.halfAngle>0&&g.halfAngle<=Math.PI,`${id}: sector dimensions`);
    }
    const p=b.packet;
    check(!!p&&p.penetration===0&&p.flags&&!Object.keys(p.flags).length,`${id}: no protection bypass`);
    check(Object.entries(p?.channels||{}).every(([k,v])=>CHANNELS.has(k)&&finite(v)),`${id}: damage channels`);
    for(const st of p?.statuses||[]) {
      check(integer(st.durationTicks,1)&&st.durationTicks<=120&&st.stacks===1,`${id}: bounded status`);
      if(vocabulary.statusIds) check(vocabulary.statusIds.has(st.id),`${id}: unknown status ${st.id}`);
    }
    if(b.expose) check(b.expose.status==='status_unmoored'&&integer(b.expose.durationTicks,1)&&
      b.expose.durationTicks<=b.recoverTicks,`${id}: honest physical exposure`);
  }
  if(s.rangeResponse) {
    check(finite(s.rangeResponse.minRange,1)&&s.rangeResponse.minRange<s.engageRadius,'range response threshold');
    check(beats.has(s.rangeResponse.beatId),'range response beat');
  }
  let prior=Infinity;
  const actIds=new Set();
  for(const act of s.acts||[]) {
    check(IDS.test(act.id)&&!actIds.has(act.id),`${e.id}: act id`);actIds.add(act.id);
    check(finite(act.enter?.hullAtMost)&&act.enter.hullAtMost<prior,`${act.id}: descending hull thresholds`);
    prior=act.enter?.hullAtMost;
    check((act.enter?.anyDisabled||[]).every(id=>SUBSYSTEMS.has(id)),`${act.id}: subsystem vocabulary`);
    check(Object.entries(act.disabledBarks||{}).every(([id,text])=>SUBSYSTEMS.has(id)&&typeof text==='string'&&text.length>15),`${act.id}: causal dialogue`);
    check(Array.isArray(act.pattern)&&act.pattern.length>0&&Array.isArray(act.opening),`${act.id}: executable sequence`);
    for(const id of [...(act.opening||[]),...(act.pattern||[])]) check(beats.has(id),`${act.id}: unknown beat ${id}`);
  }
  const wingIds=new Set();
  for(const w of s.wings||[]) {
    check(!wingIds.has(w.id)&&IDS.test(w.id),`${e.id}: unique wing`);wingIds.add(w.id);
    check(integer(w.atAct,0)&&w.atAct<3&&integer(w.ingressTicks,120),`${w.id}: ingress/act`);
    check(w.members?.length===2&&w.attackDuring==='recovery',`${w.id}: bounded pressure`);
    if(vocabulary.grammarIds) check(vocabulary.grammarIds.has(w.grammar),`${w.id}: unknown grammar`);
    if(vocabulary.twistIds) check(vocabulary.twistIds.has(w.twist),`${w.id}: unknown twist`);
    if(vocabulary.enemyIds) for(const m of w.members||[]) check(vocabulary.enemyIds.has(m.archetype),`${w.id}: unknown enemy`);
  }
  check((s.wings||[]).reduce((n,w)=>n+w.members.length,0)<=s.maxWingMembers,'finite total wing population');
  check(!JSON.stringify(e).match(/"(?:ignoreInvulnerability|ignoreFriendlyFire|invuln)":true/),'no immunity/authority bypass');
  return {ok:errors.length===0,errors};
}
export function assertCapitalBossEncounter(e,vocabulary) {
  const result=validateCapitalBossEncounter(e,vocabulary);
  if(!result.ok) throw new TypeError(`Invalid capital score: ${result.errors.join('; ')}`);
  return e;
}
