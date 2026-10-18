import assert from 'node:assert/strict';
import test from 'node:test';
import { makeEntity } from '../src/core/entity.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';

async function embedded({ dynamic = true, separation = 3, tethered = false, ship = 'ship_kestrel', legacyFan = false, enterCoincidence = false } = {}) {
  const player = makeEntity({ ...makeShipEntitySpec(ship, { pos: { x: 0, z: 0 } }), isPlayer: true });
  player.id = 1; player.vel = { x: 60, z: 0 };
  if (legacyFan) {
    const manifest = resolveCollisionProxyManifest(player), verts = manifest.planarPolygon;
    player.physicsBody = { ...player.physicsBody, collisionProxyManifest: {
      ...manifest, id: 'embedded-legacy-fan', planarPolygon: undefined,
      convexParts: verts.map((a, i) => ({ id: `triangle${i}`, points: [{x:0,z:0},a,verts[(i+1)%verts.length]] })),
    } };
  }
  const rock = makeEntity({ type: 'asteroid', pos: { x: separation, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 320, alive: true, collides: true, hull: 1000, hullMax: 1000,
    physicsBody: { radius: 8, mass: 320, dynamic }, data: { typeId: 'ast_common_rock', isChunk: true } });
  rock.id = 2;
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities([player, rock]);
    if (enterCoincidence) {
      const rec = owner.records.get(2), position = owner.records.get(1).body.translation();
      rec.body.setTranslation(position, true);
      rec._bodyPoseX = rec.kinematics.x = rock.pos.x = position.x;
      rec._bodyPoseZ = rec.kinematics.z = rock.pos.z = position.z;
    }
    if (tethered) owner.createAttachment({ attachmentId: 'held', defId: 'tether_standard',
      ownerId: player.id, targetId: rock.id, sourceWorld: player.pos, targetWorld: rock.pos, restLength: 18 });
    let nearest = Infinity, furthest = 0, contacts = 0;
    for (let i = 0; i < 300; i++) {
      owner.step(1 / 60);
      const a = owner.records.get(1).body.translation(), b = owner.records.get(2).body.translation();
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      nearest = Math.min(nearest, d); furthest = Math.max(furthest, d);
      contacts += owner.drainContactImpacts().length;
    }
    return { dynamic, separation, tethered, ship, legacyFan, enterCoincidence, nearest, furthest, contacts,
      final: Math.hypot(player.pos.x-rock.pos.x,player.pos.z-rock.pos.z),
      player: { ...player.pos }, rock: { ...rock.pos },
      nativePlayer: owner.records.get(1).body.translation(), nativeRock: owner.records.get(2).body.translation() };
  } finally { owner.dispose(); }
}

test('deeply overlapping measured ship and rock recover actual native separation', async t => {
  for (const options of [{}, { dynamic: false }, { ship: 'ship_hornet' }, { tethered: true },
    { legacyFan: true }, { enterCoincidence: true }, { legacyFan: true, enterCoincidence: true },
    { tethered: true, enterCoincidence: true }]) {
    const result = await embedded(options);
    t.diagnostic(JSON.stringify(result));
    assert.ok(result.final > 2, 'the native bodies must not remain concentrically welded');
  }
});
