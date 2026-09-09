// scripts/lib/bench/scenarios/feel.impact_feedback.mjs — bar B9, "Impacts answer".
//
// LANE IMPACT (PQ-139). Drop-in module: the verb bench auto-discovers it, no shared file is edited.
//
// THE REAL-PATH LAW. Every number here comes out of the game's real path. The collisions are solved
// by the live `rapier-dynamic` physics authority booted through `../realPath.mjs`
// (`createAuthoritativeRuntime` + the live systems), and the exchanged momentum `dp` this scenario
// reads is the one `src/core/physics.js:emitPhysicsImpact` publishes — not a model of it. The
// hitstop, FOV and trauma numbers come from the SHIPPED decision function
// `resolveCollisionFeel` in `src/render/feel.js` — the same function the running game calls on
// every `physics:impact` — and the audio numbers from the SHIPPED `resolveCollisionCue` in
// `src/audio/audioSystem.js`, the same function `_onCollision` calls. Nothing here re-implements a
// rule it is measuring. `metrics.realPathProof` carries the runtime's own proof; a stand-in would
// report `sg02Ready: false`.
//
// WHY THE FEEL FUNCTION IS CALLED HERE RATHER THAN OBSERVED IN-SIM. `src/render/feel.js` is
// `{ nodeSafe: false, phase: 'render' }` in `src/runtime/authoritativeSystemManifest.js`, so it
// does not exist in any node runtime — headlessly there is no render frame to observe. The honest
// headless measurement is therefore: REAL physics produces the impact, and the SHIPPED decision
// function converts it. The applied beat at the shipping camera is proved separately by the headed
// capture cited in the receipt (`state.timeScale` per rendered frame during a real collision).
//
// Bar B9 (design/FEEL_CONTRACT.md):
//   "Every collision with deltaV >= 8 WU/s produces hitstop and camera trauma scaled by exchanged
//    momentum. Collision audio differs by >= one octave of pitch and >= 12 dB between a scout
//    kissing a rock and a freighter broadsiding a station. A Massline release has a time-domain snap."
import { bootRealPath } from '../realPath.mjs';
import { resolveCollisionFeel, COLLISION_DELTA_V_FLOOR } from '../../../../src/render/feel.js';
import { resolveCollisionCue } from '../../../../src/audio/audioSystem.js';
import { resolveMasslineFeelPunch } from '../../../../src/render/masslinePresentation.js';

// Closing speeds in WU/s. NOTE THE MEASURED FACT these produce: bar B9 is written in terms of the
// victim's deltaV, and against a real 4000-mass rock the live solver returns a hull deltaV far
// BELOW the closing speed (restitution plus the rock's mass) — 20 WU/s closing gives the hull under
// 8 WU/s, which is "touching", not an impact. So the ladder is driven at player-legible closing
// speeds and the bar is judged on the deltaV the physics actually returned, which is printed.
const CLOSING_SPEEDS = [20, 60, 150, 400];
const FEEL_CONTEXT = { playerDistance: 0, motionReduce: false, mode: 'flight' };

export const scenario = {
  id: 'feel.impact_feedback',
  label: 'B9 Impacts answer — hitstop/trauma by exchanged momentum, audio by mass, release snap',

  async run(seed) {
    const eventTrace = [];
    const cases = [];

    const host = await bootRealPath({
      seed,
      systems: ['actions', 'flightV3', 'physics'],
      hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free' }],
    });

    let proof = null;
    try {
      proof = host.proof();
      const player = host.player;
      // A real static rock, the bar's own "kissing a rock" body.
      const rock = host.spawnObstacle({ pos: { x: 0, z: 600 }, radius: 40, mass: 4000, hull: 4000 });

      const impacts = [];
      host.bus.on('physics:impact', (p) => { if (p) impacts.push({ ...p, tick: host.state.tick }); });

      for (const closing of CLOSING_SPEEDS) {
        impacts.length = 0;
        // Initial condition: the hull is placed 2 s of travel short of the rock and given the
        // closing speed. The CONTACT itself — separation, restitution, the impulse and the `dp`
        // receipt — is solved entirely by the live physics authority.
        const standoff = rock.pos.z - (rock.radius + (player.radius || 10) + closing * 2);
        player.pos.x = rock.pos.x;
        player.pos.z = standoff;
        player.vel.x = 0;
        player.vel.z = closing;
        if (player.prevPos) { player.prevPos.x = player.pos.x; player.prevPos.z = player.pos.z; }

        const stepped = host.step(240, {
          after: () => (impacts.length ? false : undefined),
        });

        const first = impacts[0] || null;
        const dp = first ? Number(first.dp) || 0 : 0;
        // deltaV the way the live feel layer derives it: the exchanged momentum over the mass of
        // the movable body. The rock is static, so the hull carries all of it.
        const mass = Math.max(0.1, Number(player.mass) || 1);
        const deltaV = first && Number.isFinite(first.playerDeltaV) && first.playerDeltaV > 0
          ? first.playerDeltaV
          : dp / mass;
        const feel = first ? resolveCollisionFeel(first, { ...FEEL_CONTEXT, deltaV }) : null;

        eventTrace.push({
          tick: first ? first.tick : host.state.tick,
          simTime: host.state.simTime,
          type: 'bench:impact',
          closing,
          dp: round(dp, 3),
          deltaV: round(deltaV, 4),
          hitstopMs: feel ? round(feel.hsDur * 1000, 2) : 0,
          trauma: feel ? round(feel.trauma, 4) : 0,
        });

        cases.push({
          closingSpeed: closing,
          ticksToContact: stepped,
          impactCount: impacts.length,
          dp: round(dp, 3),
          deltaV: round(deltaV, 4),
          hitstopMs: feel ? round(feel.hsDur * 1000, 2) : 0,
          fovDeg: feel ? round(feel.fov, 3) : 0,
          trauma: feel ? round(feel.trauma, 4) : 0,
          tier: feel ? feel.id : null,
        });

        // Settle before the next case.
        player.vel.x = 0;
        player.vel.z = 0;
        host.step(30);
      }
    } finally {
      host.dispose();
    }

    // ---- audio clause: the bar's two named cases, through the SHIPPED selection function ----
    // "a scout kissing a rock" — the lightest hull in src/data/ships.js (mass 16) brushing a rock.
    const kiss = resolveCollisionCue({ dp: 120, impulse: 120, massA: 16, typeA: 'ship', massB: null, typeB: 'asteroid' });
    // "a freighter broadsiding a station" — the heavy hauler (mass 200) into an immovable station.
    const broadside = resolveCollisionCue({ dp: 24000, impulse: 24000, massA: 200, typeA: 'ship', massB: null, typeB: 'station' });
    const octaves = Math.abs(Math.log2(kiss.rate / broadside.rate));
    const decibels = 20 * Math.log10(broadside.gain / kiss.gain);

    // ---- release-snap clause: the SHIPPED massline punch table ----
    const razor = resolveMasslineFeelPunch({ type: 'tether.release.razor' }, { mode: 'flight' });
    const releaseSnapMs = razor ? round(razor.hsDur * 1000, 2) : 0;

    const hitstops = cases.map((c) => c.hitstopMs);
    const monotone = hitstops.every((v, i) => i === 0 || v >= hitstops[i - 1]);
    // The bar's clause is "every collision with deltaV >= 8 WU/s produces hitstop and trauma".
    // A contact BELOW that floor is touching, and answering it would be the bug. So the verdict is:
    // every case the physics put above the floor answered, none below it did, and the answers are
    // monotone with at least two distinct magnitudes.
    const above = cases.filter((c) => c.deltaV >= COLLISION_DELTA_V_FLOOR);
    const below = cases.filter((c) => c.deltaV < COLLISION_DELTA_V_FLOOR);
    const distinct = new Set(above.map((c) => c.hitstopMs)).size;
    const answered = above.length >= 2
      && above.every((c) => c.hitstopMs > 0 && c.trauma > 0)
      && below.every((c) => c.hitstopMs === 0 && c.trauma === 0)
      && distinct >= 2;
    const spread = above.length >= 2 && above[0].hitstopMs > 0
      ? round(above[above.length - 1].hitstopMs / above[0].hitstopMs, 3)
      : 0;

    return {
      eventTrace,
      metrics: {
        realPathProof: proof,
        closingSpeeds: CLOSING_SPEEDS,
        cases,
        audio: {
          kiss: { recipeId: kiss.recipeId, rate: round(kiss.rate, 4), gain: round(kiss.gain, 4), tier: kiss.tier },
          broadside: { recipeId: broadside.recipeId, rate: round(broadside.rate, 4), gain: round(broadside.gain, 4), tier: broadside.tier },
          octaves: round(octaves, 3),
          decibels: round(decibels, 2),
        },
        releaseSnapMs,
        hitstopMonotone: monotone,
        hitstopSpread: spread,
        bars: [
          {
            bar: 'B9',
            label: 'hitstop at the shipping camera, real contact at 20/60/150 WU/s closing (ms)',
            value: cases.map((c) => `${c.closingSpeed}closing/dV${c.deltaV}=${c.hitstopMs}ms`).join(' | '),
            unit: 'ms',
            met: answered && monotone,
            note: 'zero at every speed before PQ-139.00 — feel.js had no collision subscription at all',
          },
          {
            bar: 'B9',
            label: 'camera trauma, same three contacts',
            value: cases.map((c) => `dV${c.deltaV}=${c.trauma}`).join(' | '),
            unit: 'trauma',
            met: answered,
            note: 'zero at every speed before PQ-139.00',
          },
          {
            bar: 'B9',
            label: 'collision audio pitch, scout-on-rock vs freighter-on-station',
            value: round(octaves, 2),
            unit: 'octaves',
            met: octaves >= 1,
          },
          {
            bar: 'B9',
            label: 'collision audio loudness, same two cases',
            value: round(decibels, 1),
            unit: 'dB',
            met: decibels >= 12,
          },
          {
            bar: 'B9',
            label: 'Massline razor release time-domain snap',
            value: releaseSnapMs,
            unit: 'ms',
            met: releaseSnapMs > 0,
            note: 'hard-coded 0 on all nine branches before PQ-139.00',
          },
        ],
      },
    };
  },
};

function round(v, places) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
