import { requireCapitalBossEncounter } from '../data/encounters/capital-boss.js';
import { LAST_ARGUMENT } from '../data/lastArgument.js';
import { spawnSwarmCapitalBallast } from '../missions/capitalBossSpawn.js';
import { createCapitalBossFight,restoreCapitalBossFight,rebindCapitalBossFight,
  bindCapitalBossWing,stepCapitalBossFight,validFightId } from '../combat/capitalBossScore.js';
import { capitalOrderKey } from '../ai/capitalBossOrders.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { SUBSYSTEM_DEFS } from '../data/combatDefs.js';

// Same thrown-mass part tear missions.js applies to a contract capital. The router there is not
// exported and writes mission params, so a swarm champion — no mission row — emits the same
// combat:routeDamage packet from here. Mission fight ids are ignored, so that path stays the
// missions owner's and is not hit twice.
const THROWN_MASS_SUBSYSTEM_DAMAGE = 40;
const CAPITAL_SUBSYSTEM_BY_ID = new Map(SUBSYSTEM_DEFS.map((def) => [def.id, def]));
const THROWN_MASS_ROLE_FALLBACK = Object.freeze([
  'subsystem_drive', 'subsystem_weapon', 'subsystem_tether_spool',
]);

function thrownMassSubsystemOrder(capital, encounterId) {
  const stamped = capital && capital.data && capital.data.capitalSubsystemRoles;
  let roles = stamped;
  if (!roles) {
    try { roles = requireCapitalBossEncounter(encounterId).subsystemRoles; }
    catch (_) { roles = null; }
  }
  roles = roles || {};
  return [
    roles.thrusters || THROWN_MASS_ROLE_FALLBACK[0],
    roles.turrets || THROWN_MASS_ROLE_FALLBACK[1],
    roles.bays || THROWN_MASS_ROLE_FALLBACK[2],
  ];
}

function capitalSubsystemWorldPos(entity, subsystemId) {
  const def = CAPITAL_SUBSYSTEM_BY_ID.get(subsystemId);
  const center = def && def.volume && Array.isArray(def.volume.center) ? def.volume.center : [0, 0];
  const radius = Math.max(1, Number(entity && entity.radius) || 20);
  const lx = (Number(center[0]) || 0) * radius;
  const lz = (Number(center[1]) || 0) * radius;
  const rot = Number(entity && entity.rot) || 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: (entity && entity.pos && entity.pos.x || 0) + lx * cos - lz * sin,
    z: (entity && entity.pos && entity.pos.z || 0) + lx * sin + lz * cos,
  };
}

function swarmChampionMassHit(kind, payload, bossId) {
  if (bossId == null || !payload) return false;
  if (kind === 'whip') {
    if (payload.victimId == null || payload.victimId !== bossId) return false;
    const rating = payload.rating;
    if (rating && rating !== 'solid' && rating !== 'crushing') return false;
    return true;
  }
  if (payload.payloadId == null) return false;
  return payload.aimTargetId === bossId || payload.payloadId === bossId;
}

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
  // Per swarm fight, not mission params. Detach drops it; a mission fight never reads it.
  const thrownMassHits=new Map();
  const routeSwarmThrownMass=(record,capital)=>{
    const order=thrownMassSubsystemOrder(capital,record.encounterId);
    const hits=thrownMassHits.get(record.fightId)||0;
    const subsystemId=order[hits%order.length];
    thrownMassHits.set(record.fightId,hits+1);
    const packet=scalarHitToDamagePacket({
      damage:THROWN_MASS_SUBSYSTEM_DAMAGE,
      damageType:'kinetic',
      pos:capitalSubsystemWorldPos(capital,subsystemId),
      subsystemShare:1,
      source:{kind:'thrown_mass',subsystemId},
    });
    packet.hit={...(packet.hit||{}),subsystemId,pos:packet.hit&&packet.hit.pos};
    packet.flags={ignoreFriendlyFire:true,allowAnyTarget:true};
    const request={
      attackerId:ctx.state.playerId,
      targetId:capital.id,
      packet,
      origin:{kind:'thrown_mass',id:capital.id,subsystemId},
    };
    // Same seam missions.js emits. The kernel's combat:routeDamage listener is the writer.
    ctx.bus.emit('combat:routeDamage',request);
  };
  const onSwarmMass=(kind,payload)=>{
    if(!ctx||!payload) return;
    const fights=ctx.state&&ctx.state.capitalBossEncounters&&ctx.state.capitalBossEncounters.fights;
    const entities=ctx.state&&ctx.state.entities;
    if(!fights||!entities||typeof entities.get!=='function') return;
    for(const id of Object.keys(fights)){
      if(typeof id!=='string'||!id.startsWith('swarm:')) continue;
      const record=fights[id];
      if(!record||record.terminal) continue;
      if(!swarmChampionMassHit(kind,payload,record.bossId)) continue;
      const capital=entities.get(record.bossId);
      if(!capital||capital.alive===false||!capital.pos) continue;
      routeSwarmThrownMass(record,capital);
    }
  };
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
      const bark=typeof c.wing?.bark==='string'?c.wing.bark.trim():'';
      if(bark) {
        const say=ctx.helpers.voice?.say;
        if(say) say.call(ctx.helpers.voice,{channel:'chatter',text:bark,kind:'info',ttl:4,id:`capital-wing:${r.fightId}:${c.wing.id}`});
        else ctx.bus.emit('toast',{text:bark,kind:'info',ttl:4,channel:'capitalBoss'});
      }
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
      // Swarm champions have no mission row. A mass hit tears the next named part. Contract
      // fights are not swarm: ids, so missions.js remains their only router.
      listen('tether:whipImpact',p=>onSwarmMass('whip',p));
      listen('massline:throw',p=>onSwarmMass('throw',p));
      // Row 463 retry act: a player defeat ends the score in 'defeat' and the terminal record is
      // never stepped again — a returning player used to find a permanently silent, braked boss
      // that still completed the mission when shot. Player respawn rewinds every such fight whose
      // mission is still active; a save:loaded heal covers older saves written mid-defeat.
      listen('player:respawn',()=>system._rewindDefeatedFights('recovery'));
      listen('save:loaded',()=>{
        const player=ctx.state.entities&&typeof ctx.state.entities.get==='function'
          ?ctx.state.entities.get(ctx.state.playerId):null;
        if(player&&player.alive===false) return;
        system._rewindDefeatedFights('save_loaded');
      });
    },
    start({encounterId,fightId,bossId,targetId,mirror=1}) {
      if(!validFightId(fightId)) throw new TypeError('Invalid fight id');
      const store=root(),id=fightId,old=store.fights[id];
      // A swarm champion's hull is already on the field. The throw-mass is not. The ledger
      // keeps a second start from doubling rocks, including ones the player already spent.
      const placeSwarmBallast=(liveBossId)=>{
        if(typeof id!=='string'||!id.startsWith('swarm:')) return;
        const spawn=ctx.helpers&&ctx.helpers.spawnEntity;
        if(typeof spawn!=='function') return;
        const boss=ctx.state.entities&&ctx.state.entities.get(liveBossId);
        if(!boss||boss.alive===false||!boss.pos) return;
        const ledgers=(store.swarmBallastLedgers??={});
        const ledger=(ledgers[id]??={});
        spawnSwarmCapitalBallast({
          fightId:id,encounter:requireCapitalBossEncounter(encounterId),boss,ledger,spawnEntity:spawn,
        });
      };
      if(old) {
        if(old.encounterId!==encounterId) throw new Error('Fight id reused for a different encounter');
        if(old.bossId!==bossId||old.targetId!==targetId) system.rebind(id,{bossId,targetId});
        placeSwarmBallast(old.bossId);
        return old;
      }
      if(Object.keys(store.fights).length>=16) throw new Error('Detach settled capital fights before creating another');
      if(Object.values(store.fights).filter(r=>!r.terminal).length>=3) throw new Error('At most three live capital fights');
      const r=createCapitalBossFight({encounterId,fightId,bossId,targetId,mirror,tick:ctx.state.tick});
      store.fights[id]=r;
      // Close the stock-fire gate BEFORE the first AI tick, not on the first authored cast.
      store.orders[capitalOrderKey(bossId)]={fightId:id,scoreOwnsAttacks:true,suppressStockFire:true,forward:0,brake:true,phase:'intro'};
      placeSwarmBallast(bossId);
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
    /**
     * Row 463: rewind a defeat-terminated fight back into its current act. Only a 'defeat'
     * terminal qualifies — the score reaches it solely from the target's death
     * (capitalBossScore.js finish('defeat')); victory/mutual terminals (a boss kill) never rewind.
     * The act replays from its opening (sequence cursor reset), hull damage the player dealt
     * stays dealt, and the fight re-arms suspended so the ordinary observe→resumed path restarts
     * it only when the player is back in range. Swarm champions and the Last Argument are
     * excluded: they have their own lifecycle owners.
     */
    rewindAct(fightId,reason='retry') {
      const store=root(),r=store.fights[String(fightId)];
      if(!r||r.terminal!=='defeat'||r.bossKilled===true) return false;
      if(typeof r.fightId==='string'&&r.fightId.startsWith('swarm:')) return false;
      if(r.encounterId===LAST_ARGUMENT.scoreId) return false;
      if(r.cast) ctx.bus.emit('capitalBoss:telegraphEnd',{fightId:r.fightId,castId:r.cast.id,reason:'rewind'});
      r.cast=null;r.terminal=null;r.targetKilled=false;
      r.sequence=0;r.actStartedAt=r.clock;r.phase='suspended';r.suspended=true;
      r.nextAt=r.clock;r.lastOrderSignature=null;r.lastWingGate=null;
      // The terminal order row must not stick: write the same suspended row step() would.
      store.orders[capitalOrderKey(r.bossId)]={fightId:r.fightId,scoreOwnsAttacks:true,
        suppressStockFire:true,forward:0,brake:true,phase:'suspended'};
      ctx.bus.emit('capitalBoss:actRetried',{fightId:r.fightId,actIndex:r.actIndex,reason});
      return true;
    },
    // Every defeat-terminal fight whose mission row is still live gets its act rewound. The
    // mission owner settles the contract; a settled or absent row leaves the hulk terminal.
    _rewindDefeatedFights(reason) {
      const fights=root().fights;
      const active=(ctx.state.missions&&Array.isArray(ctx.state.missions.active)&&ctx.state.missions.active)||[];
      for(const [id,r] of Object.entries(fights)) {
        if(!r||r.terminal!=='defeat'||r.bossKilled===true) continue;
        const m=active.find(row=>row&&String(row.id)===String(r.fightId));
        if(!m||m.status!=='active') continue;
        system.rewindAct(id,reason);
      }
    },
    detach(fightId) {
      const store=root(),r=store.fights[String(fightId)];if(!r) return false;
      if(r.cast) ctx.bus.emit('capitalBoss:telegraphEnd',{fightId:r.fightId,castId:r.cast.id,reason:'detached'});
      // Removal/cleanup of entities is the mission owner’s decision, not ours.
      for(const [k,order] of Object.entries(store.orders)) if(order.fightId===r.fightId) delete store.orders[k];
      thrownMassHits.delete(r.fightId);
      delete store.fights[String(fightId)];return true;
    },
    // Uninitialized owner (headless fixtures) serializes nothing — absent-owner semantics.
    serialize() {return ctx?clone(root()):undefined;},
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
