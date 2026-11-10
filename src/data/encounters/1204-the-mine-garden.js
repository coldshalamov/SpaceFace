// CR-CHAIN / CR-ANVIL — THE MINE GARDEN. A Free Frontier freighter took a mine on the way through an
// ambush lane and spilled four cargo pods forward into the rest of the field: real armed Reach mines
// sown around its own deck load, and the Reach layer parked off the flank waiting for someone to
// come and pick. The freighter cannot go in after it. Everything in that field is loose mass:
//   • thread the gaps and Massline the pods home one by one (a mine snaps on any hull within reach);
//   • drop a gravity Well between the freighter and the field — it pulls every light body inside its
//     ring into one pile, pods AND mines (the mines are mass too; where you put the ring decides
//     which of them come out with the cargo);
//   • latch a mine and throw it back at the layer that sowed it (a thrown mine is a grenade against
//     any hull, its owner's included) or shoot the field clean.
// Flying on leaves the cargo in the field for the layer.
//
// Every judgement reads the world: pod positions against the freighter, the live Well emitters, the
// mines' own triggered flags, the freighter's and layer's hulls. Credits and rep go out as director
// intents; the outcome lands in story.depthProgramEncounters so the next garden knows who you were.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, dist, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';

export const encounterOrder = 1204;
export const trigger = deepFreeze({
  id: 'the_mine_garden',
  tier: 'minor',
  deck: 'civilian',
  weight: 0.85,
  zoneTypes: ['ambush_lane', 'derelict_field'],
  script: 'selfRegistered',
  pressureCost: 12,
  cooldownS: 1800,
  proximity: true,
  gates: { sectorIds: ['sector_pallas_drift', 'sector_ashfall_reach', 'sector_sker_haven', 'sector_proteus_well'] },
});

export const GARDEN = Object.freeze({
  windowS: 240,
  freighterBackWu: 200,    // the holed freighter sits this far behind the field's near edge
  recoverWu: 170,          // a pod this close to the freighter is aboard (the crew's own grapples)
  recoverNeed: 3,          // of 4 pods
  podAmount: 30,
  podUnitMass: 0.4,        // 12 mass each: light enough for a Well, a tow or a hull shove
  podRadius: 6,
  // Pods in the near half of the field, mines staggered around and beyond them (along, across) —
  // gaps a careful pilot threads; a Well ring at the near edge reaches the pods before most mines.
  pods: Object.freeze([[60, -30], [75, 30], [110, -10], [125, 45]]),
  mines: Object.freeze([[40, -140], [40, 140], [165, -60], [165, 70], [235, 0], [250, -120]]),
  layerAlongWu: 260,
  layerAcrossWu: 280,
  mineTriggerWu: 45,
  hurtFrac: 0.15,
  wellReachWu: 420,        // a Well emitter this close to the field counts as the player's tool
  pay: 90,                 // per pod aboard
  layerBonusRep: 2,        // the Free Frontier remembers a pilot who gave the Reach its own mine back
});

function hullFrac(e) {
  return e && Number(e.hullMax) > 0 ? Math.max(0, Number(e.hull) || 0) / Number(e.hullMax) : 0;
}

export function podsAboard(g, state) {
  const freighter = entityById(state, g.freighterId);
  if (!freighter || !freighter.pos) return 0;
  return g.podIds.filter((id) => {
    const pod = entityById(state, id);
    return alive(pod) && dist(pod.pos, freighter.pos) <= GARDEN.recoverWu;
  }).length;
}

function placeMine(d, state, opts) {
  const helpers = d.helpers || (state && state._helpers) || null;
  if (helpers && typeof helpers.placeMine === 'function') return helpers.placeMine(opts);
  const mines = d.registry && typeof d.registry.get === 'function' ? d.registry.get('mines') : null;
  if (mines && typeof mines.placeMine === 'function') return mines.placeMine(opts);
  return null;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const rng = d.stream(live, 'garden_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };          // freighter → field
    const p = { x: -u.z, z: u.x };
    const edge = { x: center.x, z: center.z };
    const at = (along, across) => ({ x: edge.x + u.x * along + p.x * across, z: edge.z + u.z * along + p.z * across });
    const prior = priorOutcome(state, live.shapeId);

    d.spawnShips(live, [
      { archetype: 'mule_trader', level: 1, role: 'freighter', factionId: 'faction_free', team: 2, context: 'civilian', passive: true,
        pos: at(-GARDEN.freighterBackWu, 0), hullFrac: 0.55, scanLabel: 'HOLED FREIGHTER — ITS CARGO IS IN THE MINEFIELD' },
      { archetype: 'wasp_swarmer', level: 1, role: 'layer', factionId: 'faction_reach', team: 1, passive: true,
        pos: at(GARDEN.layerAlongWu, GARDEN.layerAcrossWu), scanLabel: 'REACH MINE-LAYER — WAITING FOR A PICKER' },
    ]);
    const freighter = d.entsOf(live, 'freighter')[0];
    const layer = d.entsOf(live, 'layer')[0];
    if (!freighter || !layer) return d.abort(live, 'no_bodies');
    for (const e of [freighter, layer]) {
      e.vel = { x: 0, z: 0 };
      e.data = e.data || {};
      if (e.data.ai) e.data.ai.allowPassiveManeuver = false;
    }
    freighter.data.driveDead = true;

    const podIds = [];
    for (const [along, across] of GARDEN.pods) {
      const pod = d.spawnCargoPod(live, {
        pos: at(along, across), vel: { x: 0, z: 0 },
        commodityId: 'cmdty_medical', amount: GARDEN.podAmount, unitMass: GARDEN.podUnitMass, radius: GARDEN.podRadius,
        ownerName: 'the holed freighter', factionId: 'faction_free',
      });
      if (!pod) continue;
      pod.data.scanLabel = 'SPILLED CARGO POD — INSIDE THE MINEFIELD';
      pod.data.encounterId = live.id;
      podIds.push(pod.id);
    }
    const mineIds = [];
    for (const [along, across] of GARDEN.mines) {
      const mine = placeMine(d, state, {
        ownerId: layer.id, team: layer.team, factionId: 'faction_reach', pos: at(along, across),
        armDelayS: 0, triggerRadius: GARDEN.mineTriggerWu, telegraph: false,
      });
      if (!mine) continue;
      mine.data.encounterId = live.id;
      mine.data.scanLabel = 'REACH MINE — ARMED';
      if (Array.isArray(live.ids)) live.ids.push(mine.id);
      mineIds.push(mine.id);
    }
    if (podIds.length < GARDEN.pods.length || mineIds.length < 3) return d.abort(live, 'no_bodies');

    live.data.garden = {
      freighterId: freighter.id, layerId: layer.id, podIds, mineIds, edge, dir: u,
      freighterHull: hullFrac(freighter), wellSeen: false, latched: false,
      minesSpent: 0, layerDown: false, freighterMined: false,
      prior: prior ? prior.outcome : null, settled: false,
    };
    live.deadlineAt = d.now() + GARDEN.windowS;
    live.phase = 'sown';
    live.approach = { signal: 'cargo_in_minefield', contacts: podIds.length + mineIds.length + 2, t: d.now() };
    d.say(live, 'alert', prior && prior.outcome === 'abandoned'
      ? 'HOLED FREIGHTER: Hit the same Reach garden again and our deck is out in it. Last pilot through flew past. The mines are loose mass, same as the pods. Get us anything back.'
      : 'HOLED FREIGHTER: Took a mine and our deck spilled forward into the rest of the field. Medical cargo, four pods. We cannot go in. Pull them out, sweep them out, clear the mines — anything.',
    null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const g = live.data && live.data.garden;
    if (!g || g.settled) return;
    if (name === 'tetherAttached' && payload && g.podIds.includes(payload.targetId)) g.latched = true;
  },

  tick(d, live, state, now) {
    const g = live.data && live.data.garden;
    if (!g || g.settled || live.phase === 'done') return;
    const tether = state.player && state.player.tether;
    if (tether && tether.active && g.podIds.includes(tether.targetId)) g.latched = true;
    if (!g.wellSeen) {
      for (const e of state.entityList || []) {
        if (e && e.alive !== false && e.type === 'fieldEmitter' && e.data && e.data.fieldKind === 'well'
          && e.data.ownerId === state.playerId && dist(e.pos, g.edge) <= GARDEN.wellReachWu) { g.wellSeen = true; break; }
      }
    }
    // A mine leaves the field by snapping, by being shot, or by being thrown and going off; the
    // owner retires its entity the same tick, so "spent" is read as no longer a live mine.
    let spent = 0;
    for (const id of g.mineIds) {
      const m = entityById(state, id);
      if (!alive(m) || (m.data && m.data.triggered)) spent++;
    }
    g.minesSpent = spent;
    const freighter = entityById(state, g.freighterId);
    if (!alive(freighter) || g.freighterHull - hullFrac(freighter) >= GARDEN.hurtFrac) g.freighterMined = true;
    const layer = entityById(state, g.layerId);
    if (!g.layerDown && !alive(layer) && spent > 0) g.layerDown = true;
    live.phase = g.wellSeen ? 'swept' : (g.latched ? 'picking' : 'sown');

    const aboard = podsAboard(g, state);
    if (aboard >= GARDEN.recoverNeed) return this._settle(d, live, state, g, aboard, g.freighterMined ? 'gleaned_hurt' : 'gleaned');
    if (!alive(freighter)) return this._settle(d, live, state, g, aboard, 'lost');
    if (now >= live.deadlineAt) return this._settle(d, live, state, g, aboard, aboard > 0 ? 'partial' : 'abandoned');
  },

  _settle(d, live, state, g, aboard, outcome) {
    if (g.settled) return;
    g.settled = true;
    const via = g.wellSeen ? 'well' : (g.latched ? 'line' : 'shove');
    if (outcome === 'gleaned' || outcome === 'partial' || outcome === 'gleaned_hurt') {
      d.grant(GARDEN.pay * aboard, `the_mine_garden:${outcome}`);
      d.rep('faction_free', outcome === 'gleaned' ? 3 : 1, `the_mine_garden_${outcome}`);
    }
    if (g.layerDown) {
      d.rep('faction_free', GARDEN.layerBonusRep, 'the_mine_garden_layer_down');
      d.rep('faction_reach', -3, 'the_mine_garden_layer_down');
      publishSituationNews(d, live, 'REACH LAYER TAKEN BY ITS OWN GARDEN: a pilot pulled a mine out of a Reach field and threw it back at the ship that sowed it.');
    }
    if (outcome === 'gleaned' && via === 'well') {
      publishSituationNews(d, live, 'MINEFIELD SWEPT WITH A GRAVITY WELL: a passing pilot dropped a Well at the edge of a Reach garden and pulled a holed freighter\'s deck load out of it without going in.');
    } else if (outcome === 'gleaned_hurt') {
      publishSituationNews(d, live, 'FREIGHTER SALVAGED ITS DECK, THEN TOOK A SECOND MINE: the cargo came out of the Reach field with live mines riding along behind it.');
    } else if (outcome === 'abandoned') {
      publishSituationNews(d, live, 'MEDICAL CARGO LEFT IN A REACH MINEFIELD: a holed Free Frontier freighter waited four minutes for help that flew past.');
    }
    live.vars = { ...(live.vars || {}), via, aboard };
    return settleSituation(d, live, state, outcome, {
      via, aboard, minesSpent: g.minesSpent, layerDown: g.layerDown, freighterMined: g.freighterMined,
    });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'salvage', place: trigger.zoneTypes, twist: 'logic', actor: 'faction_free' },
  factionId: 'faction_free',
  title: 'THE MINE GARDEN',
  primaryLine: 'HOLED FREIGHTER: Took a mine and our deck spilled forward into the rest of the field. Medical cargo, four pods. We cannot go in. Pull them out, sweep them out, clear the mines — anything.',
  verbs: ['latch', 'tow', 'field', 'throw', 'shoot'],
  choices: [
    { id: 'pick', verb: 'latch', text: 'Thread the mines and Massline the pods out one at a time.' },
    { id: 'sweep', verb: 'field', text: 'Drop a gravity Well at the edge of the field and pull the loose mass out — mines included.' },
    { id: 'return', verb: 'throw', text: 'Latch a mine and throw it back at the Reach layer.' },
    { id: 'pass', verb: 'fly_on', text: 'Fly on and leave the cargo in the garden.' },
  ],
  civilian: { archetypes: ['mule_trader'], size: [1, 1], factionId: 'faction_free', context: 'civilian', team: 2, passive: true },
  bark: null,
  deadlineS: GARDEN.windowS,
  receipts: {
    gleaned: 'DECK RECOVERED — the freighter has its cargo back out of the garden. Paid per pod.',
    gleaned_hurt: 'RECOVERED, BUT A MINE CAME WITH IT — the freighter took a second hit at its own hatch. Paid per pod.',
    partial: 'SOME OF IT — the freighter takes what made it out and limps on. Paid per pod.',
    lost: 'FREIGHTER LOST — it never got its deck back.',
    abandoned: 'The cargo stays in the minefield. The layer will be along for it.',
  },
});
