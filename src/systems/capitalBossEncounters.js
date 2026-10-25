import { requireCapitalBossEncounter } from '../data/encounters/capital-boss.js';
import { LAST_ARGUMENT } from '../data/lastArgument.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { entityLocalPointToWorld } from '../combat/geometry.js';
import { capitalPlatePull, capitalPlateUnderLine } from '../combat/capitalPlates.js';
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
    // GOLD-COLOSSI: entering an act tears the plates whose shedOnAct is the act that just
    // ended — the rope is the faster route; the act shed guarantees the ladder.
    if(c.type==='actChanged') system._shedPlatesForAct(r,c.index);
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
      // Recovery also rewinds a fight the death INTERRUPTED before the score stepped to 'defeat':
      // when the boss's own authored hit lands the kill inside the score's step, the after-action
      // screen pauses the sim before the next tick, so the record is still live at the berth.
      listen('player:respawn',()=>system._rewindDefeatedFights('recovery',{interrupted:true}));
      listen('save:loaded',()=>{
        const player=ctx.state.entities&&typeof ctx.state.entities.get==='function'
          ?ctx.state.entities.get(ctx.state.playerId):null;
        // Heal only over a live hull: a missing player or an open wreck (recovery pending) waits
        // for player:respawn instead of re-arming a fight against a dead target.
        if(!player||player.alive===false||(player.flags&&player.flags.defeated)) return;
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
        system._stepPlates(r,state);
      }
    },
    // GOLD-COLOSSI: a plate is fight data until it tears — no per-tick pose, no new joint.
    // Swarm champions and the Last Argument keep their own lifecycles: their authored
    // plates are data-only and never spawn bodies here.
    _platesLive(r) {
      return !!(r && !r.terminal && Array.isArray(r.plates) && r.plates.length
        && typeof r.fightId === 'string' && !r.fightId.startsWith('swarm:')
        && r.encounterId !== LAST_ARGUMENT.scoreId);
    },
    _plateSpec(r, plateId) {
      let specs = null;
      try { specs = requireCapitalBossEncounter(r.encounterId).plates; } catch (_) { specs = null; }
      return Array.isArray(specs) ? specs.find((p) => p && p.id === plateId) || null : null;
    },
    // A capital is roped at its centre of mass, so the latch contact point names no plate; the
    // plate under the line is the one facing the pilot (src/combat/capitalPlates.js).
    _plateLatchNear(plateSpec, boss, attachment) {
      if(!plateSpec || !boss || !attachment) return false;
      const owner = ctx.state.entities && ctx.state.entities.get(attachment.ownerId);
      return capitalPlateUnderLine(plateSpec, boss, owner);
    },
    _plateAnchorWorld(plateSpec, boss) {
      const br = Math.max(1, Number(boss && boss.radius) || 20);
      return entityLocalPointToWorld(boss,
        { x: plateSpec.anchor.x * br, z: plateSpec.anchor.z * br });
    },
    _playerAttachmentOn(bossId, state) {
      const byId = state && state.combat && state.combat.attachments && state.combat.attachments.byId;
      if(!byId) return null;
      for (const id in byId) {
        const a = byId[id];
        if(a && a.state === 'active' && a.ownerId === state.playerId && a.targetId === bossId) return a;
      }
      return null;
    },
    _stampPlateCover(r, boss) {
      if(!boss || !boss.data) return;
      const cover = {};
      for (const rec of (r.plates || [])) {
        if(!rec || !rec.attached) continue;
        const spec = this._plateSpec(r, rec.id);
        if(spec && spec.covers) cover[spec.covers] = true;
      }
      boss.data.capitalPlateCover = Object.keys(cover).length ? cover : null;
    },
    _stepPlates(r, state) {
      if(!this._platesLive(r)) return;
      const boss = state.entities && state.entities.get(r.bossId);
      if(!boss || boss.alive === false || !boss.pos) { this._stampPlateCover(r, boss); return; }
      this._stampPlateCover(r, boss);
      const attachment = this._playerAttachmentOn(boss.id, state);
      // Raw line force as a fraction of a starter hull's full-burn pull — never tensionEstimate,
      // which is load against the near-unbreakable break rating and never leaves ~1e-3.
      const tension = capitalPlatePull(attachment);
      for (const rec of r.plates) {
        if(!rec || !rec.attached) continue;
        const spec = this._plateSpec(r, rec.id);
        if(!spec) { rec.attached = false; continue; }
        const strained = !!(attachment && tension >= spec.holdTension
          && this._plateLatchNear(spec, boss, attachment));
        rec.strainTicks = strained ? (rec.strainTicks | 0) + 1 : 0;
        if(rec.strainTicks >= 30) {
          this._tearPlate(r, boss, rec, spec, { attachment, cause: 'tether' });
        }
      }
    },
    _tearPlate(r, boss, rec, spec, { attachment = null, cause = 'tether' } = {}) {
      if(!rec || !rec.attached) return null;
      rec.attached = false; rec.strainTicks = 0;
      const spawn = ctx.helpers && ctx.helpers.spawnEntity;
      const world = this._plateAnchorWorld(spec, boss);
      const player = ctx.state.entities && ctx.state.entities.get(attachment && attachment.ownerId);
      // Separation runs down the line for a rope tear, radially off the boss for an act shed.
      let dx = world.x - boss.pos.x, dz = world.z - boss.pos.z;
      if(attachment && player && player.pos) { dx = world.x - player.pos.x; dz = world.z - player.pos.z; }
      const d = Math.hypot(dx, dz) || 1;
      const plate = spawn && spawn({
        type: 'wreck',
        pos: { x: world.x, z: world.z },
        vel: { x: Number(boss.vel && boss.vel.x) || 0, z: Number(boss.vel && boss.vel.z) || 0 },
        radius: spec.radius, mass: spec.mass,
        hull: 1, hullMax: 1, collides: true,
        physicsBody: { radius: spec.radius, dynamic: true },
        data: {
          kind: 'wreck', label: spec.label, scanLabel: spec.label, name: spec.label,
          masslineTetherable: true,
          capitalPlate: { fightId: r.fightId, bossId: r.bossId, plateId: spec.id, covers: spec.covers },
          // The aftermath armor-slab package keeps a torn plate reading as boss armor,
          // not generic debris — the same render path fracture pieces use.
          fractureVisual: { partId: 'place_aftermath_aft_armor_slab', label: spec.label },
          fractureVictimRadius: Number(boss.radius) || null,
          loot: [], salvagePool: { cmdty_scrap_metal: 2 }, salvageTimeLeft: 8,
        },
      });
      if(plate) {
        queuePhysicsImpulse(plate, { x: (dx / d) * spec.mass * 12, z: (dz / d) * spec.mass * 12 },
          { tag: 'capital_plate_tear', tick: ctx.state.tick, externalEffect: true });
      }
      // The player's line moves onto the freed slab through the sanctioned cut+create path —
      // never a silent rebind of a live joint.
      if(plate && attachment && cause === 'tether') {
        const svc = this._attachmentService();
        if(svc) {
          svc.cut(attachment.id, attachment.ownerId, 'capital_plate_tear');
          // Both ends at centre of mass — the same anchors a player latch on a dynamic wreck uses.
          svc.create({ defId: 'tether_standard', ownerId: attachment.ownerId, targetId: plate.id,
            sourceWorld: player && player.pos ? { x: player.pos.x, y: 0, z: player.pos.z } : undefined,
            targetWorld: { x: plate.pos.x, y: 0, z: plate.pos.z } });
        }
        // The rope tear names itself in the boss toast lane, the same receipt the act shed gets.
        const name = (requireCapitalBossEncounter(r.encounterId).score || {}).name || 'the boss';
        ctx.bus.emit('toast', {
          text: `You tear ${name}'s ${spec.label} free.`,
          kind: 'info', ttl: 4, channel: 'capitalBoss',
        });
      }
      this._stampPlateCover(r, boss);
      ctx.bus.emit('capitalBoss:plateTorn', {
        fightId: r.fightId, bossId: r.bossId, plateId: spec.id, label: spec.label,
        covers: spec.covers, cause, entityId: plate && plate.id != null ? plate.id : null,
      });
      return plate;
    },
    _shedPlatesForAct(r, newActIndex) {
      if(!this._platesLive(r)) return;
      const boss = ctx.state.entities && ctx.state.entities.get(r.bossId);
      if(!boss || boss.alive === false || !boss.pos) return;
      const shedAfter = newActIndex - 1; // shedOnAct N holds through act N and tears as it ends
      for (const rec of r.plates) {
        if(!rec || !rec.attached) continue;
        const spec = this._plateSpec(r, rec.id);
        if(!spec || spec.shedOnAct !== shedAfter) continue;
        const torn = this._tearPlate(r, boss, rec, spec, { cause: 'actShed' });
        if(torn) {
          const name = (requireCapitalBossEncounter(r.encounterId).score || {}).name || 'The boss';
          ctx.bus.emit('toast', {
            text: `${name} sheds its ${spec.label}.`,
            kind: 'info', ttl: 4, channel: 'capitalBoss',
          });
        }
      }
    },
    _attachmentService() {
      const registry = ctx.registry || (ctx.helpers && ctx.helpers.registry);
      const actions = registry && registry.get && registry.get('actions');
      if(actions && actions.kernel) return actions.kernel.attachments || null;
      const combat = registry && registry.get && registry.get('combat');
      return combat && combat.kernel ? combat.kernel.attachments || null : null;
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
    rewindAct(fightId,reason='retry',{interrupted=false}={}) {
      const store=root(),r=store.fights[String(fightId)];
      if(!r||r.bossKilled===true) return false;
      // `interrupted` (recovery only): a started, still non-terminal fight against the player
      // whose death the score never observed — the paused after-action screen froze it first.
      const live=interrupted&&r.terminal==null&&r.started===true&&r.targetId===ctx.state.playerId;
      if(r.terminal!=='defeat'&&!live) return false;
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
    _rewindDefeatedFights(reason,{interrupted=false}={}) {
      const fights=root().fights;
      const active=(ctx.state.missions&&Array.isArray(ctx.state.missions.active)&&ctx.state.missions.active)||[];
      for(const [id,r] of Object.entries(fights)) {
        if(!r||r.bossKilled===true) continue;
        if(r.terminal!=='defeat'&&!(interrupted&&r.terminal==null)) continue;
        const m=active.find(row=>row&&String(row.id)===String(r.fightId));
        if(!m||m.status!=='active') continue;
        system.rewindAct(id,reason,{interrupted});
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
