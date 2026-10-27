// Opt-in connected native route + production Save/Continue + world reentry.
// Player starts near the colony; this is a bounded authored setup, not an
// ordinary player arrival or visual-acceptance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { charonSupplySaveFixture } from './charon-salvage-supply-save.mjs';
import { charonSupplyFacts, materializeCharonSupply, charonSupplyNativeDiagnostic } from '../../src/world/charonSalvageSupply.js';
if (process.env.CHARON_CONNECTED_PROOF === '1') {
  const f = charonSupplySaveFixture();
  try {
    f.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const physics = f.runtime.getSystem('physics');
    assert.equal(await physics.prepareBackend(f.state), true);
    const original = f.state.traffic.charonSalvageSupply,
      identities = [original.haulerId, original.salvorId];
    const out = process.env.CHARON_PROOF_DIR;
    if (out) fs.mkdirSync(out, {
      recursive: true
    });
    const capture = tag => {
      const facts = charonSupplyFacts(f.state),
        h = f.state.entities.get(facts.haulerId),
        r = f.state.entities.get(facts.salvorId),
        p = f.source();
      const actor = e => e && {
        id: e.id,
        life: e.occupantGeneration,
        pos: e.pos,
        vel: e.vel,
        rot: e.rot,
        hull: e.hull,
        data: e.data
      };
      const snapshot = {
        tree: process.env.PUBLIC_TREE,
        time: f.state.simTime,
        facts,
        hauler: actor(h),
        recipient: actor(r),
        pod: actor(p),
        native: charonSupplyNativeDiagnostic(f.owner, h, p)
      };
      if (out) fs.writeFileSync(`${out}/${tag}.json.gz`, gzipSync(JSON.stringify({
        snapshot,
        envelope: f.save.serialize(tag)
      })));
      console.log('CHARON_CHECKPOINT', JSON.stringify({
        tag,
        time: f.state.simTime,
        facts
      }));
    };
    let continued = false,
      approached = false;
    for (let i = 0; i < 60 * 360; i++) {
      f.runtime.step(1 / 60);
      const facts = charonSupplyFacts(f.state);
      assert.equal(['loose', 'aboard', 'delivered', 'consumed', 'player', 'other', 'lost'].reduce((n, k) => n + facts[k], 0), 6);
      if (!approached && facts.phase === 'collect') {
        capture('pre-approach');
        approached = true;
      }
      if (!continued && facts.aboard === 6) {
        capture('aboard-before-continue');
        const envelope = f.save.serialize('charon-native-aboard');
        assert.equal(f.save.loadEnvelope(envelope), true);
        assert.equal(charonSupplyFacts(f.state).aboard, 6);
        assert.equal(await physics.prepareBackend(f.state), true);
        continued = true;
        console.log('CHARON_CONNECTED_CONTINUED', JSON.stringify(charonSupplyFacts(f.state)));
      }
      if (i % 600 === 0) console.log('CHARON_CONNECTED', JSON.stringify({
        tick: i,
        facts,
        ready: physics._diag?.sg02Ready
      }));
      if (facts.phase === 'working') break;
    }
    capture('route-terminal');
    assert.equal(continued, true);
    assert.equal(charonSupplyFacts(f.state).consumed, 6);
    f.runtime.getSystem('world').enterSector('sector_dione_lane');
    f.runtime.getSystem('world').enterSector('sector_charon_expanse');
    const b = f.state.traffic.charonSalvageSupply,
      facts = charonSupplyFacts(f.state);
    assert.deepEqual([b.haulerId, b.salvorId], identities);
    assert.equal(facts.consumed, 6);
    assert.equal(facts.loose, 0);
    assert.equal(materializeCharonSupply(f.owner), false);
    assert.equal(f.state.entityList.filter(e => e.alive && e.data?.charonSupplyPod).length, 0);
    assert.ok(facts.salvorId);
    assert.ok(f.owner.helpers.npcJobs.get(f.state.entities.get(facts.salvorId).data.jobId));
    console.log('CHARON_CONNECTED_ASSERTED', JSON.stringify(facts));
  } finally {
    f.close();
  }
}
