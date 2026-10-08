// Lived vignettes — one phase machine for externalOnly easter-egg encounters.
//
// The campaign director's day cap is not a place to pour more life: extra weighted shapes
// steal the three ambient slots and reshuffle every seeded schedule. These runtimes are
// requested explicitly (gates.externalOnly) and always resolve, so a civilian beat cannot
// sit in dir.live forever (stale retirement only covers combat).
//
// A runtime may write live.* and intent on hulls it spawned. Credits and reputation go
// through d.grant / d.rep. No Math.random, no wall clock.

const HOP_CAP = 12;
const MOTIONS = new Set(['hold', 'orbit', 'creep', 'ring', 'weave', 'depart', 'face']);

function clamp1(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

function steerToward(e, tx, tz, slow) {
  if (!e || !e.pos) return;
  const dx = tx - e.pos.x;
  const dz = tz - e.pos.z;
  const d2 = dx * dx + dz * dz;
  const data = e.data || (e.data = {});
  const intent = data.intent || (data.intent = {});
  intent.tx = tx;
  intent.tz = tz;
  intent.fire = false;
  const stop = slow || 80;
  if (d2 <= stop * stop) {
    intent.moveZ = 0;
    intent.moveX = 0;
    intent.aimAngle = e.rot || 0;
    return;
  }
  const len = Math.sqrt(d2) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const cf = Math.cos(e.rot || 0);
  const sf = Math.sin(e.rot || 0);
  intent.moveZ = clamp1(cf * ux + sf * uz);
  intent.moveX = clamp1(-sf * ux + cf * uz);
  intent.aimAngle = Math.atan2(dz, dx);
}

function phaseOf(byId, id) {
  return byId.get(id) || null;
}

function rememberSeen(state, id, outcome) {
  const dir = state && state.encounterDirector;
  if (!dir) return;
  if (!dir.stats || typeof dir.stats !== 'object') dir.stats = {};
  if (!dir.stats.livedSeen || typeof dir.stats.livedSeen !== 'object') dir.stats.livedSeen = {};
  dir.stats.livedSeen[id] = outcome || 'seen';
}

function applyMotion(d, live, motion, now) {
  const ships = d.entsOf(live);
  if (!ships.length || !motion) return;
  const origin = live.vars.motionOrigin || live.anchor || ships[0].pos;
  const t = now - (live.vars.motionT0 || now);
  if (motion === 'hold' || motion === 'face') {
    if (motion === 'face' && ships.length >= 2) {
      steerToward(ships[0], ships[1].pos.x, ships[1].pos.z, 110);
      steerToward(ships[1], ships[0].pos.x, ships[0].pos.z, 110);
      for (let i = 2; i < ships.length; i++) steerToward(ships[i], origin.x, origin.z, 70);
    } else {
      const player = d.player && d.player();
      const tx = player && player.pos ? player.pos.x : origin.x;
      const tz = player && player.pos ? player.pos.z : origin.z;
      for (const ship of ships) steerToward(ship, tx, tz, 160);
    }
    return;
  }
  if (motion === 'depart') {
    // The hailer is ships[0]. They leave. The rest hold the berth.
    for (let i = 1; i < ships.length; i++) steerToward(ships[i], origin.x, origin.z, 40);
    steerToward(ships[0], origin.x + 900, origin.z + 220, 60);
    return;
  }
  const speed = motion === 'orbit' ? 0.55 : motion === 'weave' ? 0.8 : motion === 'creep' ? 0.22 : 0.35;
  const radius = motion === 'ring' ? 220 : motion === 'creep' ? 40 : 160;
  for (let i = 0; i < ships.length; i++) {
    const ang = t * speed + (i / ships.length) * Math.PI * 2;
    const ox = motion === 'creep' ? origin.x + t * 28 : origin.x;
    const oz = motion === 'creep' ? origin.z + Math.sin(t * 0.4) * 30 : origin.z;
    const tx = ox + Math.cos(ang) * radius;
    const tz = oz + Math.sin(ang) * (motion === 'weave' ? radius * 0.45 : radius);
    steerToward(ships[i], tx, tz, motion === 'creep' ? 50 : 36);
  }
}

function runVerb(d, live, state, spec, phase) {
  const verb = phase.verb;
  if (verb === 'say') {
    const text = phase.line || '';
    if (text) {
      d.say(live, phase.channel || 'info', text, null, {
        literal: true,
        primary: phase.primary === true,
      });
    }
    return true;
  }
  if (verb === 'spawn') {
    const anchor = live.anchor || { x: 0, z: 0 };
    live.ids = live.ids || [];
    live.roles = live.roles || {};
    live.plan = live.plan || {};
    live.plan.ships = (spec.cast || []).map((member) => ({
      archetype: member.archetype,
      level: member.level || 2,
      pos: { x: anchor.x + (member.dx || 0), z: anchor.z + (member.dz || 0) },
      factionId: member.factionId || spec.factionId || 'faction_free',
      context: 'convoy_civilian',
      role: member.role,
      passive: true,
      team: 2,
      scanLabel: member.scanLabel || spec.title,
    }));
    const ids = d.spawnShips(live, live.plan.ships) || [];
    if (ids.length < (spec.cast || []).length) {
      d.abort(live, 'spawn_failed');
      return false;
    }
    return true;
  }
  if (verb === 'prop') {
    const anchor = live.anchor || { x: 0, z: 0 };
    const prop = d.spawnProp(live, {
      type: 'beacon',
      pos: { x: anchor.x + (phase.dx || 40), z: anchor.z + (phase.dz || -24) },
      radius: phase.radius || 8,
      mass: phase.mass || 40,
      scanLabel: phase.scanLabel || spec.title,
      storyPropKind: spec.id,
      tetherable: true,
    });
    if (!prop || prop.id == null) {
      d.abort(live, 'prop_failed');
      return false;
    }
    live.ids = live.ids || [];
    live.roles = live.roles || {};
    live.ids.push(prop.id);
    live.roles[prop.id] = phase.role || 'prop';
    if (prop.data) prop.data.masslineTetherable = true;
    return true;
  }
  if (verb === 'grant') {
    if (phase.amount > 0) d.grant(phase.amount, phase.reason || spec.id);
    return true;
  }
  if (verb === 'rep') {
    if (phase.factionId && phase.delta) d.rep(phase.factionId, phase.delta, phase.reason || spec.id);
    return true;
  }
  if (verb === 'resolve') {
    rememberSeen(state, spec.id, phase.outcome);
    d.resolve(live, phase.outcome || 'done', { speak: true });
    return false;
  }
  if (verb === 'abort') {
    d.abort(live, phase.reason || 'aborted');
    return false;
  }
  return true;
}

function hop(d, live, state, spec, byId) {
  let hops = 0;
  while (hops++ < HOP_CAP) {
    const phase = phaseOf(byId, live.vars.vPhase);
    if (!phase) return d.abort(live, 'bad_phase');
    if (phase.verb === 'offer' || phase.verb === 'motion') {
      live.phase = phase.id;
      live.vars.vAt = d.now();
      live.vars.motionT0 = d.now();
      live.vars.motionOrigin = live.anchor ? { x: live.anchor.x, z: live.anchor.z } : null;
      live.vars.motion = phase.motion || (phase.verb === 'motion' ? 'hold' : null);
      if (phase.verb === 'offer') {
        const ids = phase.choiceIds || (spec.choices || []).map((choice) => choice.id);
        live.deadlineAt = d.now() + (phase.windowS || 50);
        d.offerChoices(live, ids, spec.timeoutChoice, live.deadlineAt);
      } else {
        live.deadlineAt = d.now() + (phase.seconds || 6);
      }
      return;
    }
    const keep = runVerb(d, live, state, spec, phase);
    if (!keep) return;
    if (!phase.next) return d.abort(live, 'no_next');
    live.vars.vPhase = phase.next;
  }
  return d.abort(live, 'hop_cap');
}

export function compileVignette(spec) {
  if (!spec || typeof spec.id !== 'string' || !Array.isArray(spec.phases) || !spec.phases.length) {
    throw new Error('compileVignette: spec needs id and phases');
  }
  const byId = new Map(spec.phases.map((phase) => [phase.id, phase]));
  if (!byId.has(spec.start || spec.phases[0].id)) {
    throw new Error(`compileVignette ${spec.id}: missing start phase`);
  }
  for (const phase of spec.phases) {
    if (phase.motion && !MOTIONS.has(phase.motion)) {
      throw new Error(`compileVignette ${spec.id}: bad motion ${phase.motion}`);
    }
    if (phase.next && !byId.has(phase.next)) {
      throw new Error(`compileVignette ${spec.id}: dangling next ${phase.next}`);
    }
    if (phase.onChoice) {
      for (const dest of Object.values(phase.onChoice)) {
        if (!byId.has(dest)) throw new Error(`compileVignette ${spec.id}: dangling choice ${dest}`);
      }
    }
  }

  return Object.freeze({
    fire(d, live, state) {
      live.vars = live.vars || {};
      live.vars.vPhase = spec.start || spec.phases[0].id;
      live.vars.vAt = d.now();
      hop(d, live, state, spec, byId);
    },
    tick(d, live, state, now) {
      if (!live || live.phase === 'done') return;
      const phase = phaseOf(byId, live.vars && live.vars.vPhase);
      if (!phase) return;
      const motion = (live.vars && live.vars.motion) || phase.motion;
      if (motion) applyMotion(d, live, motion, now);
      if (phase.verb === 'offer' && now >= (live.deadlineAt || 0)) {
        this.choose(d, live, state, spec.timeoutChoice);
        return;
      }
      if (phase.verb === 'motion' && now >= (live.deadlineAt || 0)) {
        if (!phase.next) return d.abort(live, 'no_next');
        live.vars.vPhase = phase.next;
        hop(d, live, state, spec, byId);
      }
    },
    choose(d, live, state, choiceId) {
      if (!live || live.phase === 'done') return;
      const phase = phaseOf(byId, live.vars && live.vars.vPhase);
      if (!phase || phase.verb !== 'offer') return;
      const dest = phase.onChoice && phase.onChoice[choiceId];
      if (!dest) return;
      const choice = (spec.choices || []).find((row) => row.id === choiceId);
      if (choice && choice.playerLine) {
        d.say(live, 'info', choice.playerLine, null, { literal: true });
      }
      live.vars.vPhase = dest;
      hop(d, live, state, spec, byId);
    },
  });
}
