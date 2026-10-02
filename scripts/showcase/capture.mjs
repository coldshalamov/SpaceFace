// Fitting showcase capture: boots the game once, then for every DEMOS entry stages the
// empty Helios corner, fits the item, drives the demo verb, records a webm clip of the
// canvas, and writes evidence {events, derived-diff, entity diffs} per item.
// Usage: node scripts/showcase/capture.mjs [--only=a,b] [--skip-clips] [--retry-failed]
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bootShowcase, saveClip, ROOT } from './lib/harness.mjs';
import { DEMOS } from './matrix.mjs';

// Clips land where the app serves them: assets/ui/fitting-media ships with the build
// (the assets/ui copy mapping), so the armory's <video> can load them by defId.
const OUT = path.join(ROOT, 'assets', 'ui', 'fitting-media');
const EVD = path.join(ROOT, 'media', 'fittings-evidence.json');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const only = args.only ? new Set(String(args.only).split(',')) : null;
const skipClips = !!args['skip-clips'];

await mkdir(OUT, { recursive: true });
let evidence = {};
try { evidence = JSON.parse(await readFile(EVD, 'utf8')); } catch (_) {}

const { page, browser, server } = await bootShowcase();
const sh = (expr, arg) => page.evaluate(expr, arg);
console.log('tech unlocked:', await sh(() => window.__showcase.unlockTech()));
const key = async (k, ms = 0) => { await page.keyboard.down(k); await page.waitForTimeout(140); await page.keyboard.up(k); if (ms) await page.waitForTimeout(ms); };
const down = async (k) => page.keyboard.down(k);
const up = async (k) => page.keyboard.up(k);

async function settle(ms) { await page.waitForTimeout(ms); }

// --- demo verbs ---------------------------------------------------------------
const ACTS = {
  async shoot(page, spec, t) {
    // Combat-stick auto-aim resolves the locked hostile and writes the lead angle;
    // input.fire (LMB) is the trigger. Hover the canvas center so _m0 registers.
    await page.mouse.move(480, 270);
    await sh(() => window.__showcase.setAutoFire(true));
    await sh(() => window.__showcase.aimLockStart());
    await settle(600);
    await page.mouse.down();
    await settle(t - 600);
    await page.mouse.up();
    await sh(() => window.__showcase.aimLockStop());
  },
  async shoot_nose(page, spec, t) {
    // Spinal/launcher mounts can't gimbal to the lead angle — track the nearest
    // hostile with the nose while holding fire (launchers also need the lock window).
    await page.mouse.move(480, 270);
    await sh(() => window.__showcase.aimLockStart());
    const aimOnce = () => sh(() => {
      const s = window.__showcase;
      const st = window.SF.state;
      const pl = st.entities.get(st.playerId);
      if (!pl || !pl.pos) return;
      let best = null, bd = Infinity;
      for (const e of st.entities.values()) {
        if (!e || !e.alive || !e.pos || (e.type !== 'ship' && e.type !== 'drone')) continue;
        if (e.team === 0 || e.team === 2 || e.id === st.playerId) continue;
        const d = (e.pos.x - pl.pos.x) ** 2 + (e.pos.z - pl.pos.z) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) s.faceTo(best.pos.x, best.pos.z);
    });
    await settle(300);
    await aimOnce();
    await page.mouse.down();
    const end = Date.now() + t - 300;
    while (Date.now() < end) { await aimOnce(); await settle(500); }
    await page.mouse.up();
    await sh(() => window.__showcase.aimLockStop());
  },
  async shoot_inert(page, spec, t) {
    // No auto-aim on inert bodies: track the target's live screen position with the
    // cursor (as a pilot does) while LMB is held.
    const track = async () => {
      const pos = await sh(() => {
        const s = window.__showcase;
        const ids = s.spawnedIdsList ? s.spawnedIdsList() : [];
        for (const id of ids) {
          const e = s.entity(id);
          if (e && e.alive !== false) return s.screenPos(id);
        }
        return null;
      });
      if (pos) await page.mouse.move(Math.max(4, Math.min(956, pos.x)), Math.max(4, Math.min(536, pos.y)));
    };
    await track();
    await page.mouse.down();
    const end = Date.now() + t;
    while (Date.now() < end) { await track(); await settle(350); }
    await page.mouse.up();
  },
  async duo_line(page, spec, t) { return ACTS.shoot_inert(page, spec, t); },
  async bank(page, spec, t) { return ACTS.shoot_inert(page, spec, t); },
  async trait(page, spec, t) { return ACTS.shoot(page, spec, t); },
  async shield(page, spec, t) {
    // soak an inbound missile (scripted — NPC racks can't be scheduled); no
    // countermeasure key, the shield is the story
    await sh(() => window.__showcase.spawnMissile({ distance: 200, speed: 90 }));
    await settle(t);
  },
  async tether(page, spec, t) {
    // Held long enough for the massline grammar to register the latch edge.
    await down('Control'); await down('Space'); await settle(220); await up('Control');
    await settle(Math.floor(t * 0.4));
    await down('BracketLeft'); await settle(Math.floor(t * 0.35)); await up('BracketLeft');
    await up('Space');
  },
  async tether2(page, spec, t) {
    // Twin bridle: two latch presses so both lines go out to the pair on screen.
    // Each press is held — instantaneous presses fall under the grammar's edge window.
    await down('Control'); await down('Space'); await settle(220); await up('Space'); await up('Control');
    await settle(700);
    await down('Control'); await down('Space'); await settle(220); await up('Space'); await up('Control');
    await settle(Math.floor(t * 0.35));
    await down('BracketLeft'); await settle(Math.floor(t * 0.35)); await up('BracketLeft');
    await up('Space');
    await settle(Math.max(0, t - 1140 - Math.floor(t * 0.7)));
  },
  async tether_shoot(page, spec, t) {
    await down('Control'); await down('Space'); await settle(220); await up('Control');
    await settle(1500);
    await page.mouse.down();
    await settle(t - 2000);
    await page.mouse.up();
    await up('Space');
  },
  async burst(page, spec, t) {
    await down('KeyW'); await down('ShiftLeft');
    await settle(t);
    await up('ShiftLeft'); await up('KeyW');
  },
  async counter(page, spec, t) {
    // Fire a scripted inbound missile (NPC 'occasional' racks can't be scheduled), let it
    // close for a beat so the seeker is visibly homing, then pop the countermeasure.
    await sh(() => window.__showcase.spawnMissile({ distance: 720, speed: 170 }));
    const deadline = Date.now() + Math.min(9000, Math.floor(t * 0.55));
    while (Date.now() < deadline) {
      const close = await sh(() => {
        const st = window.SF.state;
        const pl = st.entities.get(st.playerId);
        const list = (st.entityIndex && st.entityIndex.projectiles) || [];
        for (const p of list) {
          const d = p.data || {};
          if (p.type === 'projectile' && p.alive && d.kind === 'missile' && d.targetId === st.playerId) {
            const dx = p.pos.x - pl.pos.x, dz = p.pos.z - pl.pos.z;
            if (Math.hypot(dx, dz) < 320) return true;
          }
        }
        return false;
      });
      if (close) break;
      await page.waitForTimeout(200);
    }
    await key('KeyX');
    await settle(Math.floor(t * 0.4));
  },
  async deploy(page, spec, t) {
    await settle(1500);
    await key(spec.key || 'Digit6');
    await settle(t - 1500);
  },
  async charge(page, spec, t) {
    await settle(1200);
    await key('KeyY');
    await settle(Math.floor(t * 0.45));
    await key('KeyR');
    await settle(t - 1200 - Math.floor(t * 0.45));
  },
  async cloak(page, spec, t) {
    await settle(1000);
    await key('Backquote');
    await settle(t - 1000);
  },
  async mine_ast(page, spec, t) {
    const pos = await sh(() => {
      const ids = window.__showcase.spawnedIdsList();
      return ids.length ? window.__showcase.screenPos(ids[0]) : null;
    });
    if (pos) await page.mouse.move(Math.max(4, Math.min(956, pos.x)), Math.max(4, Math.min(536, pos.y)));
    await page.waitForTimeout(250);
    await page.mouse.down({ button: 'right' });
    // hold the pointer lane on the asteroid (spawned bodies have no mesh root to pick)
    await sh(() => window.__showcase.mineRmbOn(window.__showcase.spawnedIdsList()[0]));
    await settle(t);
    await page.mouse.up({ button: 'right' });
    await sh(() => window.__showcase.mineRmbOff());
  },
  async scan(page, spec, t) {
    await settle(800);
    await key('KeyC');
    await settle(t - 800);
  },
  async fly(page, spec, t) {
    await down('KeyW');
    await settle(1500);
    await down('ShiftLeft');
    await settle(t - 1500);
    await up('ShiftLeft'); await up('KeyW');
  },
  async turn(page, spec, t) {
    await down('KeyA'); await settle(Math.floor(t * 0.35)); await up('KeyA');
    await down('KeyD'); await settle(Math.floor(t * 0.35)); await up('KeyD');
    await down('KeyQ'); await settle(Math.floor(t * 0.15)); await up('KeyQ');
    await down('KeyE'); await settle(Math.floor(t * 0.15)); await up('KeyE');
  },
  async dronebay(page, spec, t) { return ACTS.shoot(page, spec, t); },
  async flak(page, spec, t) {
    // PDS proves itself on an inbound warhead: scripted missile, then let the
    // point-defense servo track and intercept.
    await sh(() => window.__showcase.spawnMissile({ distance: 260, speed: 110 }));
    await settle(t);
  },
  async flak_wpn(page, spec, t) {
    // auto_turret mount engages on its own — same scripted missile, no trigger held
    await sh(() => window.__showcase.spawnMissile({ distance: 260, speed: 110 }));
    await settle(t);
  },
  async loot(page, spec, t) {
    // Magnet capture receipts are one-shot-per-pod — spawn the pods inside the act,
    // after evidenceReset, so the pull events land inside the witness window.
    await sh(() => {
      const s = window.__showcase;
      const pl = s.player();
      const dx = Math.cos(pl.rot), dz = Math.sin(pl.rot);
      for (let i = 0; i < 5; i++) {
        const d = 30 + i * 12;
        const side = (i % 2 ? 8 : -8);
        window.SF.helpers.spawnEntity({
          type: 'payload',
          pos: { x: pl.pos.x + dx * d + (-dz) * side, z: pl.pos.z + dz * d + dx * side },
          vel: { x: 0, z: 0 }, radius: 3, mass: 1, collides: false, team: 0,
          data: { kind: 'payload', payloadType: 'jettisoned_cargo', commodityId: 'cmdty_scrap_metal', amount: 2 },
        });
      }
    });
    await down('KeyW'); await settle(Math.floor(t * 0.6)); await up('KeyW');
    await settle(t - Math.floor(t * 0.6));
  },
  async ram(page, spec, t) {
    await sh(() => {
      const s = window.__showcase;
      const ids = s.spawnedIdsList();
      if (ids.length) { const e = s.entity(ids[0]); if (e) s.faceTo(e.pos.x, e.pos.z); }
    });
    await down('KeyW'); await down('ShiftLeft');
    await settle(t);
    await up('ShiftLeft'); await up('KeyW');
  },
  async swing(page, spec, t) {
    await down('Control'); await down('Space'); await settle(220); await up('Control');
    await settle(1500);
    await down('ShiftLeft'); await settle(Math.floor(t * 0.55)); await up('ShiftLeft');
    await up('Space');
  },
  async gyros(page, spec, t) {
    await down('KeyW'); await settle(Math.floor(t * 0.5)); await up('KeyW');
    await settle(t - Math.floor(t * 0.5));
  },
  async flail(page, spec, t) {
    // tow a heavy body on the line, then sweep it through the pack
    await down('Control'); await down('Space'); await settle(220); await up('Control');
    await settle(1200);
    await down('KeyA'); await settle(900); await up('KeyA');
    await down('KeyD'); await settle(900); await up('KeyD');
    await up('Space');
    await settle(Math.max(0, t - 3800));
  },
};

// --- scene setters --------------------------------------------------------------
const SCENES = {
  async pack3(spec) { await sh((s) => window.__showcase.spawnPack({ count: 3, distance: s?.dist || 60, hostile: true, arcDeg: 70, jitter: 8 }), spec); },
  async pack5(spec) { await sh((s) => window.__showcase.spawnPack({ count: 5, distance: s?.dist || 55, hostile: true, arcDeg: 80, jitter: 8 }), spec); },
  async drones(spec) { await sh((s) => window.__showcase.spawnPack({ count: s?.n || 2, distance: s?.dist || 45, hostile: false, arcDeg: 20, jitter: 5 }), spec); },
  async duoLine(spec) {
    await sh(() => {
      const s = window.__showcase;
      const pl = s.player();
      const dx = Math.cos(pl.rot), dz = Math.sin(pl.rot);
      s.spawnPack({ count: 1, distance: 50, hostile: false, arcDeg: 0, jitter: 0 });
      s.spawnPack({ count: 1, distance: 80, hostile: false, arcDeg: 0, jitter: 0 });
    });
  },
  async wall(spec) {
    await sh(() => {
      const s = window.__showcase;
      s.spawnAsteroid({ distance: 45 });
      s.spawnPack({ count: 2, distance: 90, hostile: false, arcDeg: 15, jitter: 5 });
    });
  },
  async asteroid(spec) { await sh(() => window.__showcase.spawnAsteroid({ distance: 70 })); },
  async missiles(spec) {
    await sh(() => window.__showcase.spawnPack({ count: 2, distance: 160, hostile: true, enemyType: 'reaver_pirate', arcDeg: 50, jitter: 20 }));
  },
  async missilesClose(spec) {
    await sh(() => window.__showcase.spawnPack({ count: 2, distance: 110, hostile: true, enemyType: 'reaver_pirate', arcDeg: 50, jitter: 15 }));
  },
  // A big, slow, hostile tank dead ahead — the honest target for spinal mounts and
  // capital ordnance that can't chase a strafing swarmer.
  async bruiser(spec) {
    await sh((s) => window.__showcase.spawnPack({ count: 1, distance: s?.dist || 80, hostile: true, enemyType: 'bruiser_brawler', arcDeg: 0, jitter: 0 }), spec);
  },
  async payloads(spec) {
    await sh(() => {
      const s = window.__showcase;
      const pl = s.player();
      const dx = Math.cos(pl.rot), dz = Math.sin(pl.rot);
      for (let i = 0; i < 5; i++) {
        const d = 30 + i * 12;
        const side = (i % 2 ? 8 : -8);
        window.SF.helpers.spawnEntity({
          type: 'payload',
          pos: { x: pl.pos.x + dx * d + (-dz) * side, z: pl.pos.z + dz * d + dx * side },
          vel: { x: 0, z: 0 }, radius: 3, mass: 1, collides: false, team: 0,
          data: { kind: 'payload', payloadType: 'jettisoned_cargo', commodityId: 'cmdty_scrap_metal', amount: 2 },
        });
      }
    });
  },
};

const DEMO_SCENE = {
  shoot: 'pack3', shoot_nose: 'bruiser', shoot_inert: 'drones', trait: 'pack3', duo_line: 'duoLine', bank: 'wall',
  tether: 'drones', tether2: 'drones2', tether_shoot: 'drones', burst: 'pack5',
  counter: 'missilesClose', deploy: 'pack3', charge: 'pack3', cloak: 'pack3',
  mine_ast: 'asteroid', scan: 'pack3', fly: null, turn: null,
  dronebay: 'pack3', flak: 'missilesClose', flak_wpn: 'missilesClose', loot: null,
  ram: 'drones1', shield: 'missilesClose', swing: 'drones', flail: 'drones', gyros: 'pack3', diagram: null,
};
// scene variant tweaks
SCENES.drones1 = async () => { await sh(() => window.__showcase.spawnPack({ count: 1, distance: 50, hostile: false, arcDeg: 0, jitter: 0 })); };
SCENES.drones2 = async () => { await sh(() => window.__showcase.spawnPack({ count: 2, distance: 50, hostile: false, arcDeg: 30, jitter: 8 })); };

async function derivedDiff(before, after) {
  const diffs = {};
  for (const [k, v] of Object.entries(after || {})) {
    if (v !== before?.[k]) diffs[k] = { from: before?.[k], to: v };
  }
  return diffs;
}

async function runItem(id, spec) {
  const rec = { id, demo: spec.demo, ok: false, clip: null, events: {}, statDiff: {}, fitOk: null, errors: [] };
  try {
    if (spec.hull) {
      const r = await sh((h) => window.__showcase.hull(h), spec.hull);
      if (!r.ok) rec.errors.push(`hull:${spec.hull} -> ${JSON.stringify(r)}`);
    }
    await sh((s) => window.__showcase.stage({ zoom: s?.zoom || 90 }), spec);
    await settle(400);
    const before = await sh(() => window.__showcase.derived());
    await sh(() => window.__showcase.strip());
    for (const sid of spec.support || []) {
      const r = await sh((d) => window.__showcase.fit(d), sid);
      if (!r.ok) rec.errors.push(`support:${sid} -> ${r.reason}`);
    }
    const fit = await sh((d) => window.__showcase.fit(d), id);
    rec.fitOk = fit.ok;
    if (!fit.ok) rec.errors.push(`fit:${id} -> ${fit.reason}`);
    if (spec.demo === 'charge') await sh(() => window.__showcase.giveCharges(6));
    await settle(300);
    const after = await sh(() => window.__showcase.derived());
    rec.statDiff = await derivedDiff(before, after);
    // Flag-value fittings (filters, ecology kit, racks) contribute a use-time `mods`
    // entry rather than a derived field: read the fitted def's mods as the second proof.
    rec.mods = await sh((d) => window.__showcase.modsFor(d), id);
    const sceneName = DEMO_SCENE[spec.demo];
    if (sceneName && SCENES[sceneName]) await SCENES[sceneName](spec);
    await settle(500);
    await sh(() => window.__showcase.evidenceReset());
    const clipPath = path.join(OUT, `${id}.webm`);    const clipS = spec.clip || 8;
    if (!skipClips && spec.demo !== 'diagram') {
      await saveClip(page, clipPath, clipS, (p) => ACTS[spec.demo](p, spec, clipS * 1000));
      rec.clip = `assets/ui/fitting-media/${id}.webm`;
      const posterPath = clipPath.replace(/\.webm$/, '.png');
      try {
        execFileSync('C:/ProgramData/chocolatey/bin/ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.max(1, Math.floor(clipS / 2))), '-i', clipPath, '-frames:v', '1', posterPath]);
        rec.poster = `assets/ui/fitting-media/${id}.png`;
      } catch (e) { rec.errors.push(`poster: ${e.message}`); }
    } else {
      await ACTS[spec.demo]?.(page, spec, clipS * 1000);
    }
    const ev = await sh(() => window.__showcase.evidence());
    rec.events = ev.counts;
    rec.evidenceSamples = ev.samples;
    const evList = spec.ev || [];
    const evOk = evList.length ? evList.some((e) => (ev.counts[e] || 0) > 0) : true;
    // The stat is proven either by a derived-field diff (numbers that live on the hull)
    // or by the fitted def carrying the same key in its mods (use-time flags).
    const statOk = spec.stat ? (rec.statDiff[spec.stat] !== undefined
      || (rec.mods != null && rec.mods[spec.stat] != null && rec.mods[spec.stat] !== false)) : true;
    rec.ok = rec.fitOk !== false && evOk && statOk && (evList.length > 0 || !!spec.stat);
    // teardown
    await sh(() => window.__showcase.setAutoFire(false));
    await sh(() => window.__showcase.removeSpawned());
    await sh(() => window.__showcase.strip());
  } catch (e) {
    rec.errors.push(String(e?.message || e));
    try { await sh(() => window.__showcase.removeSpawned()); } catch (_) {}
  }
  return rec;
}

const ids = Object.keys(DEMOS).filter((id) => !only || only.has(id));
console.log(`capturing ${ids.length} items`);
for (const id of ids) {
  const t0 = Date.now();
  const rec = await runItem(id, DEMOS[id]);
  evidence[id] = rec;
  await writeFile(EVD, JSON.stringify(evidence, null, 1));
  console.log(`${rec.ok ? 'OK  ' : 'FAIL'} ${id} ${rec.demo} ${Math.round((Date.now() - t0) / 1000)}s ev=${Object.entries(rec.events).map(([k, v]) => `${k}:${v}`).join(',')} ${rec.errors.join('; ')}`);
}

await browser.close();
await server.close();
// Keep the shipped manifest honest: the UI only requests a clip when one exists.
const clipIds = Object.entries(evidence).filter(([, v]) => v.ok && v.clip).map(([k]) => k).sort();
await writeFile(
  path.join(ROOT, 'src', 'data', 'fittingMediaManifest.js'),
  '// GENERATED by scripts/showcase/capture.mjs — the fitting ids with a verified\n'
  + '// in-action clip + poster under assets/ui/fitting-media/. Do not hand-edit; rerun the\n'
  + '// showcase capture to refresh.\n'
  + `export const FITTING_MEDIA_IDS = new Set(${JSON.stringify(clipIds)});\n`,
);
console.log('done. evidence:', EVD, '| clips:', clipIds.length);
