import { requireCapitalBossEncounter } from '../data/encounters/capital-boss.js';
import { createCapitalBossFight,restoreCapitalBossFight,rebindCapitalBossFight,
  bindCapitalBossWing,stepCapitalBossFight,validFightId } from '../combat/capitalBossScore.js';
import { capitalOrderKey } from '../ai/capitalBossOrders.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const sort=(a,b)=>a<b?-1:a>b?1:0;
const CAPABILITIES={drive:'drive',weapon:'weapon',sensor:'sensor',tether:'tether_spool',power:'power'};
/** Converts the VERIFIED kernel.capabilities()/helpers.getCombatCapabilities result. */
export function observeCapitalBody(entity,capabilityView=null,previousPos=null) {
  if(!entity) return null;
  const capabilities=capabilityView?.capabilities||{};
  return {id:entity.id,alive:entity.alive!==false,hull:entity.hull,hullMax:entity.hullMax,
    pos:{x:entity.pos.x,z:entity.pos.z},previousPos:previousPos?{...previousPos}:null,
    radius:entity.radius||0,rot:entity.rot||0,
    // Temporary statuses may block an action family without destroying its subsystem.
    blockedActionTags:[...(capabilityView?.blockedActionTags||[])],
    disabled:Object.entries(CAPABILITIES).filter(([k])=>capabilities[k]===false).map(([,v])=>`subsystem_${v}`)};
}
/**
 * Simulation system. Required ports are owned by existing mission/world/lifecycle systems:
 *   observe(record,state,helpers) -> {boss,target,active,targets?}; positions are XZ.
 *   spawnWing(command,record,ctx) -> IDs, synchronously (max two, no retry/reward side effects).
 * No transform, hull, wallet, subsystem, or AI data write occurs here.
 */
export function createCapitalBossEncounters({observe,spawnWing}={}) {
  if(typeof observe!=='function'||typeof spawnWing!=='function')
    throw new TypeError('Capital bosses require explicit observation and mission-owned wing spawning');
  let ctx=null;const unsubs=[];
  const root=()=>{
    if(!ctx.state.capitalBossEncounters) ctx.state.capitalBossEncounters={version:1,fights:{},orders:{}};
    return ctx.state.capitalBossEncounters;
  };
  const runCommand=(c,r)=>{
    const store=root();
    if(c.type==='order') {
      store.orders[capitalOrderKey(c.entityId)]={fightId:r.fightId,scoreOwnsAttacks:true,
        suppressStockFire:c.suppressStockFire,heading:c.heading,forward:c.forward,brake:c.brake,phase:c.phase};
    } else if(c.type==='wingGate') {
      for(const order of c.orders) store.orders[capitalOrderKey(order.entityId)]={...order,fightId:r.fightId,scoreOwnsAttacks:false};
    } else if(c.type==='damage') {
      // This is the existing sole damage writer. It enforces shields, difficulty, invulnerability,
      // law, subsystem transitions, statuses and kills. Never replace with entity.hull -= ... .
      ctx.helpers.routeCombatDamage({attackerId:c.attackerId,targetId:c.targetId,packet:c.packet,origin:c.origin});
    } else if(c.type==='wingRequested') {
      const ids=spawnWing(c,r,ctx);
      if(!Array.isArray(ids)) throw new TypeError('spawnWing must synchronously return a bounded ID array');
      bindCapitalBossWing(r,c.wing.id,ids);
      for(const id of ids) if(id!=null) store.orders[capitalOrderKey(id)]={fightId:r.fightId,scoreOwnsAttacks:false,suppressStockFire:true};
    } else if(c.type==='voice') {
      const say=ctx.helpers.voice?.say;
      if(say) say.call(ctx.helpers.voice,{channel:c.priority,text:c.text,kind:'info',ttl:4,id:`capital:${r.fightId}`});
      else ctx.bus.emit('toast',{text:c.text,kind:'info',ttl:4});
    }
    // Presentation/telemetry are facts; they are not a second executor for damage or spawns.
    ctx.bus.emit(`capitalBoss:${c.type}`,c);
  };
  const system={
    name:'capitalBossEncounters',
    init(context) {
      if(ctx) throw new Error('Capital boss system already initialized');
      if(!context?.state||!context.bus?.on||!context.bus?.emit||!context.helpers?.routeCombatDamage)
        throw new TypeError('Initialize after combat kernel helpers and the event bus');
      ctx=context;root();
      const listen=(event,fn)=>{const off=ctx.bus.on(event,fn);if(typeof off==='function') unsubs.push(off);
        else if(typeof ctx.bus.off==='function') unsubs.push(()=>ctx.bus.off(event,fn));};
      listen('capitalBoss:start',p=>system.start(p));
      listen('capitalBoss:detach',p=>system.detach(p.fightId));
      // KILLED is a combat fact. DESTROYED may be virtualization/save restoration and is not death.
      listen('entity:killed',p=>{
        if(p?.id==null) return;
        for(const r of Object.values(root().fights)) {
          if(r.terminal) continue;
          if(p.id===r.bossId) r.bossKilled=true;
          if(p.id===r.targetId) r.targetKilled=true;
        }
      });
    },
    start({encounterId,fightId,bossId,targetId,mirror=1}) {
      if(!validFightId(fightId)) throw new TypeError('Invalid fight id');
      const store=root(),id=fightId,old=store.fights[id];
      if(old) {
        if(old.encounterId!==encounterId) throw new Error('Fight id reused for a different encounter');
        if(old.bossId!==bossId||old.targetId!==targetId) system.rebind(id,{bossId,targetId});
        return old;
      }
      if(Object.keys(store.fights).length>=16) throw new Error('Detach settled capital fights before creating another');
      if(Object.values(store.fights).filter(r=>!r.terminal).length>=3) throw new Error('At most three live capital fights');
      const r=createCapitalBossFight({encounterId,fightId,bossId,targetId,mirror,tick:ctx.state.tick});
      store.fights[id]=r;
      // Close the stock-fire gate BEFORE the first AI tick, not on the first authored cast.
      store.orders[capitalOrderKey(bossId)]={fightId:id,scoreOwnsAttacks:true,suppressStockFire:true,forward:0,brake:true,phase:'intro'};
      return r;
    },
    update(_dt,state=ctx?.state) {
      if(!ctx||state!==ctx.state) throw new TypeError('Capital system GameState mismatch');
      for(const id of Object.keys(root().fights).sort(sort)) {
        const r=root().fights[id];
        if(r.terminal) continue;
        const o=observe(r,state,ctx.helpers);
        if(!o||typeof o.active!=='boolean') throw new TypeError('observe must explicitly decide lifecycle activity');
        for(const c of stepCapitalBossFight(r,{...o,
          boss:r.bossKilled?{id:r.bossId,alive:false,hull:0}:o.boss,
          target:r.targetKilled?{id:r.targetId,alive:false,hull:0}:o.target,
          tick:state.tick,simTime:state.simTime})) runCommand(c,r);
      }
    },
    detach(fightId) {
      const store=root(),r=store.fights[String(fightId)];if(!r) return false;
      if(r.cast) ctx.bus.emit('capitalBoss:telegraphEnd',{fightId:r.fightId,castId:r.cast.id,reason:'detached'});
      // Removal/cleanup of entities is the mission owner’s decision, not ours.
      for(const [k,order] of Object.entries(store.orders)) if(order.fightId===r.fightId) delete store.orders[k];
      delete store.fights[String(fightId)];return true;
    },
    serialize() {return clone(root());},
    restore(data) {
      if(!data||data.version!==1||typeof data.fights!=='object'||!data.orders) throw new TypeError('Invalid capital system save');
      const fights={};
      if(Object.keys(data.fights).length>16) throw new TypeError('Capital save exceeds record budget');
      for(const [id,r] of Object.entries(data.fights)) {
        if(!validFightId(id)||id!==r.fightId) throw new TypeError('Capital save identity mismatch');
        fights[id]=restoreCapitalBossFight(r);
      }
      ctx.state.capitalBossEncounters={version:1,fights,orders:clone(data.orders)};
    },
    rebind(fightId,roles) {
      const r=root().fights[String(fightId)];if(!r) throw new Error('Unknown fight to rebind');
      for(const [k,v] of Object.entries(root().orders)) if(v.fightId===r.fightId) delete root().orders[k];
      // Rematerialization is not a same-position promise. Cancel the old world-space shot and
      // grant the normal resume warning; an in-place restore (no rebind) preserves exact timing.
      if(r.cast) ctx.bus.emit('capitalBoss:telegraphEnd',{fightId:r.fightId,castId:r.cast.id,reason:'rebound'});
      r.cast=null;r.suspended=true;r.phase='suspended';
      rebindCapitalBossFight(r,roles);
      root().orders[capitalOrderKey(r.bossId)]={fightId:r.fightId,scoreOwnsAttacks:true,suppressStockFire:true,forward:0,brake:true,phase:r.phase};
      for(const w of Object.values(r.wings)) for(const id of w.ids) if(id!=null) root().orders[capitalOrderKey(id)]={fightId:r.fightId,suppressStockFire:true,scoreOwnsAttacks:false};
    },
    destroy() {for(const off of unsubs.splice(0)) off();ctx=null;},
  };
  return system;
}
/** Select encounter-specific distance hysteresis without changing time while absent/docked. */
export function capitalBossInRange(record,boss,target) {
  if(!boss||!target) return false;
  const s=requireCapitalBossEncounter(record.encounterId).score;
  return Math.hypot(target.pos.x-boss.pos.x,target.pos.z-boss.pos.z)<=
    (record.started&&!record.suspended?s.suspendRadius:s.engageRadius);
}
