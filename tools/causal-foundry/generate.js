// Deterministic candidate generator. Same call, same scenes, same order.
// Numeric twins of a family share a signature and are rejected as trivial variants.

import { compileScene, geometryOf } from './compileScene.js';
import { executeScenario } from './execute.js';
import { hostileCount } from './factoryBridge.js';
import { bodyClassOf, evaluateCandidate, rankCandidates } from './evaluate.js';
import { deriveFired, deriveHappened } from './observe.js';
import { runnableAtoms } from './vocabulary.js';

const RUNNABLE = new Set(runnableAtoms().map((row) => row.id));

export function buildCandidates() {
  const out = [];
  const add = (family, scene) => {
    for (const id of scene.mechanics) {
      if (!RUNNABLE.has(id)) throw new Error(`generator used blocked atom ${id}`);
    }
    out.push({ family, scene: { ...scene, layout: family, summary: scene.id, title: scene.id } });
  };

  for (const dist of [80, 70, 100, 120]) {
    for (const seed of [1, 2, 3]) {
      add('gen-reel', {
        id: `gen.reel.d${dist}.s${seed}`,
        seed: 8000 + dist + seed,
        ticks: 150,
        mechanics: ['massline.reel', 'massline.tension'],
        player: { x: 0, z: 0, heading: 0 },
        bodies: [anchor(dist, 0, 800)],
        attachment: { target: 'anchor' },
        primary: { hold: true, reelFrom: 20 },
      });
    }
  }
  for (let n = 1; n <= 8; n++) {
    add('gen-payout', {
      id: `gen.payout.s${n}`,
      seed: 8100 + n,
      ticks: 100,
      mechanics: ['massline.payout', 'ship.thrust', 'massline.tension'],
      player: { x: 0, z: 0, heading: Math.PI },
      bodies: [anchor(80, 0, 800)],
      attachment: { target: 'anchor' },
      primary: { hold: true, payoutFrom: 12, moveZ: 1 },
    });
  }
  for (const speed of [70, 50, 90]) {
    for (const seed of [1, 2, 3]) {
      add('gen-orbit', {
        id: `gen.orbit.v${speed}.s${seed}`,
        seed: 8200 + speed + seed,
        ticks: 160,
        orbit: true,
        mechanics: ['massline.orbit', 'ship.thrust', 'massline.tension'],
        player: { x: 0, z: 0, vz: speed, heading: Math.PI / 2 },
        bodies: [anchor(90, 0, 800)],
        attachment: { target: 'anchor' },
        primary: { hold: true, moveZ: 0.6 },
      });
    }
  }
  for (let n = 1; n <= 6; n++) {
    add('gen-cut', {
      id: `gen.cut.s${n}`,
      seed: 8300 + n,
      ticks: 110,
        mechanics: ['massline.orbit', 'massline.cut'],
      player: { x: 0, z: 0, vz: 55, heading: Math.PI / 2 },
      bodies: [anchor(80, 0, 800)],
      attachment: { target: 'anchor' },
      primary: { tap: 28 + n },
    });
  }
  for (const speed of [90, 70, 110]) {
    for (const z of [0, 2]) {
      add('gen-shove', {
        id: `gen.shove.v${speed}.z${z}`,
        seed: 8400 + speed + z,
        ticks: 120,
        mechanics: ['ship.coast', 'physics.collision'],
        player: { x: 0, z: 0, vx: speed, heading: 0 },
        bodies: [rock(50, z)],
        primary: {},
      });
    }
  }
  for (let n = 1; n <= 8; n++) {
    add('gen-glance', {
      id: `gen.glance.s${n}`,
      seed: 8500 + n,
      ticks: 90,
      mechanics: ['ship.coast', 'physics.collision'],
      player: { x: 0, z: 0, vx: 70, vz: 18, heading: 0 },
      bodies: [pod('pod', 40, 3 + n)],
      primary: {},
    });
  }
  for (const x of [300, 280, 320]) {
    for (const seed of [1, 2, 3]) {
      add('gen-fire', {
        id: `gen.fire.x${x}.s${seed}`,
        seed: 8600 + x + seed,
        ticks: 80,
        mechanics: ['ship.thrust', 'weapons.fire'],
        player: { x: 0, z: 0, heading: 0 },
        bodies: [wasp(x, 0)],
        primary: { moveZ: 1, fire: true, aimAngle: 0 },
      });
    }
  }
  for (const turn of [1, 0.7, -1]) {
    for (const seed of [1, 2, 3]) {
      add('gen-turn', {
        id: `gen.turn.t${turn}.s${seed}`,
        seed: 8700 + Math.round(turn * 10) + seed,
        ticks: 90,
        mechanics: ['ship.thrust', 'ship.turn'],
        player: { x: 0, z: 0, heading: 0 },
        bodies: [],
        primary: { moveZ: 1, turnIntent: turn },
      });
    }
  }
  for (let n = 1; n <= 6; n++) {
    add('gen-boost', {
      id: `gen.boost.s${n}`,
      seed: 8800 + n,
      ticks: 120,
      mechanics: ['ship.boost', 'massline.tension', 'ship.thrust'],
      player: { x: 0, z: 0, heading: Math.PI },
      bodies: [anchor(110, 0, 2000, false)],
      attachment: { target: 'anchor' },
      primary: { hold: true, moveZ: 1, boost: true },
    });
  }
  for (const dist of [70, 60, 90]) {
    for (const seed of [1, 2]) {
      add('gen-tow', {
        id: `gen.tow.d${dist}.s${seed}`,
        seed: 8900 + dist + seed,
        ticks: 140,
        mechanics: ['massline.reel', 'massline.tension'],
        player: { x: 0, z: 0, heading: 0 },
        bodies: [pod('pod', dist, 0)],
        attachment: { target: 'pod' },
        primary: { hold: true, reelFrom: 20 },
      });
    }
  }
  for (const x of [48, 40, 60]) {
    for (const seed of [1, 2]) {
      add('gen-ram', {
        id: `gen.ram.x${x}.s${seed}`,
        seed: 9000 + x + seed,
        ticks: 100,
        mechanics: ['ship.thrust', 'physics.collision'],
        player: { x: 0, z: 0, heading: 0 },
        bodies: [rock(x, 0)],
        primary: { moveZ: 1 },
      });
    }
  }
  for (let n = 1; n <= 4; n++) {
    add('gen-static', {
      id: `gen.static.s${n}`,
      seed: 9100 + n,
      ticks: 150,
      mechanics: ['massline.reel', 'massline.tension'],
      player: { x: 0, z: 0, heading: 0 },
      bodies: [anchor(80, 0, 2000, false)],
      attachment: { target: 'anchor' },
      primary: { hold: true, reelFrom: 20 },
    });
  }
  for (let n = 1; n <= 4; n++) {
    add('gen-diagonal', {
      id: `gen.diagonal.s${n}`,
      seed: 9200 + n,
      ticks: 160,
      mechanics: ['massline.reel', 'massline.tension'],
      player: { x: 0, z: 0, heading: 0 },
      bodies: [anchor(55, 55, 800)],
      attachment: { target: 'anchor' },
      primary: { hold: true, reelFrom: 20 },
    });
  }
  for (let n = 1; n <= 6; n++) {
    add('gen-zero-reel', {
      id: `gen.zeroreel.s${n}`,
      seed: 9300 + n,
      ticks: 80,
      mechanics: ['massline.reel', 'massline.tension'],
      player: { x: 0, z: 0, heading: 0 },
      bodies: [anchor(80, 0, 800)],
      attachment: { target: 'anchor' },
      primary: { hold: true },
    });
  }
  for (let n = 1; n <= 4; n++) {
    add('gen-inert', {
      id: `gen.inert.s${n}`,
      seed: 9400 + n,
      ticks: 40,
      mechanics: ['ship.thrust', 'physics.collision'],
      player: { x: 0, z: 0, heading: 0 },
      bodies: [rock(80, 0), rock(80, 40, 'far')],
      primary: {},
    });
  }
  for (let n = 1; n <= 6; n++) {
    add('gen-coast-only', {
      id: `gen.coast.s${n}`,
      seed: 9500 + n,
      ticks: 60,
      mechanics: ['ship.coast'],
      player: { x: 0, z: 0, vx: 40 + n, heading: 0 },
      bodies: [],
      primary: {},
    });
  }
  for (let n = 1; n <= 4; n++) {
    add('gen-settle', {
      id: `gen.settle.s${n}`,
      seed: 9600 + n,
      ticks: 100,
      mechanics: ['ship.thrust', 'ship.coast'],
      player: { x: 0, z: 0, heading: 0 },
      bodies: [],
      primary: { moveZ: 1, thenAt: 30, then: { moveZ: 0 } },
    });
  }
  for (let n = 1; n <= 2; n++) {
    add('gen-overlap', {
      id: `gen.overlap.s${n}`,
      seed: 9700 + n,
      ticks: 40,
      mechanics: ['ship.thrust', 'physics.collision'],
      player: { x: 0, z: 0, heading: 0 },
      bodies: [rock(8, 0)],
      primary: { moveZ: 1 },
    });
  }
  return out;
}

export function structuralRejects() {
  return [
    {
      id: 'gen.impossible-profile',
      family: 'impossible',
      mechanics: ['ship.thrust', 'physics.collision'],
      fired: [],
      impossibleProfile: 'asteroid.nope',
      ticks: 30,
      entityCount: 2,
      hostileCount: 0,
      minSeparation: 40,
      overlap: false,
      playerAlive: false,
      finite: false,
      labOk: false,
      interventionAffordances: 0,
    },
  ];
}

export async function testCandidates() {
  const seen = new Set();
  const rows = [];
  for (const structural of structuralRejects()) {
    rows.push({
      ...evaluateCandidate(structural, { seenSignatures: seen }),
      traceHash: null,
      simulated: false,
    });
  }
  let simulated = 0;
  for (const candidate of buildCandidates()) {
    const doc = compileScene(candidate.scene);
    const run = await executeScenario(doc);
    simulated += 1;
    const geo = geometryOf(candidate.scene);
    const tape = candidate.scene.primary;
    const happened = deriveHappened(run.summary, tape);
    const fired = deriveFired(run.summary, tape, candidate.scene.mechanics);
    const report = {
      id: candidate.scene.id,
      family: candidate.family,
      mechanics: candidate.scene.mechanics,
      happened,
      fired,
      bodyClass: bodyClassOf(candidate.scene.bodies, run.summary, candidate.scene.attachment),
      ticks: candidate.scene.ticks,
      entityCount: geo.entityCount,
      hostileCount: hostileCount(candidate.scene),
      minSeparation: geo.minSeparation,
      overlap: geo.overlap,
      playerAlive: run.summary.playerAlive === true,
      finite: run.summary.finite === true,
      labOk: run.labOk === true,
      playerDisp: run.summary.playerDisp,
      restDelta: run.summary.restDelta,
      maxTension: run.summary.maxTension,
      interventionAffordances: 1,
    };
    const verdict = evaluateCandidate(report, { seenSignatures: seen });
    if (verdict.accepted) seen.add(verdict.signature);
    rows.push({
      ...verdict,
      traceHash: run.traceHash,
      simulated: true,
      scene: candidate.scene,
      labOk: run.labOk,
      error: run.labOk ? null : run.error,
    });
  }
  const templateFamilies = [...new Set(buildCandidates().map((candidate) => candidate.family))];
  return {
    simulated, simulatedVariants: simulated,
    templateCount: templateFamilies.length, templateFamilies,
    rows: rankCandidates(rows),
  };
}

function anchor(x, z, mass, dynamic) {
  return {
    alias: 'anchor',
    profile: mass <= 80 ? 'asteroid.light' : 'asteroid.heavy',
    role: 'lab_anchor',
    team: 2,
    x, z, mass, radius: 6,
    dynamic: dynamic === false ? false : undefined,
  };
}

function rock(x, z, alias = 'rock') {
  return {
    alias, profile: 'asteroid.heavy', role: 'obstacle', team: 2, x, z, mass: 400, radius: 8,
  };
}

function pod(alias, x, z) {
  return {
    alias, profile: 'asteroid.light', role: 'payload', team: 2, x, z, mass: 40, radius: 5,
  };
}

function wasp(x, z) {
  return {
    alias: 'wasp', profile: 'wasp_swarmer', role: 'hostile', team: 1,
    factionId: 'faction_reach', x, z, heading: Math.PI, radius: 12,
  };
}
