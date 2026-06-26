// Dev-only ship turntable preview. Guards behind ?dev=shippreview so it never loads in normal play.
// It builds each ship hull x its visual tiers directly via the
// visual factory (bypassing tech/credit gating), renders a single framed snapshot of each into the
// live scene, and POSTs the canvas pixels to the existing /__shot dev sink (server.js) so each hull
// lands in .devshots/ for visual verification — without having to unlock tech and fly each ship.
//
// This is a verification harness, not a shipped feature. It reuses the live renderer/scene/camera
// exposed on the render system (window.SF.state.render.*) and the public visual factory.
import * as THREE from 'three';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { wrapShipWithAuthoredParts } from './partsLibrary.js';

// Opt-in: ?dev=shippreview&authored=1 wraps each ship with the authored GLB-part boundary (the same
// path live gameplay uses) and waits for the async swap before snapshotting — so the turntable shows
// the textured authored hulls, not the procedural fallback. Default stays procedural for back-compat.
const PREVIEW_AUTHORED = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('authored') === '1';
function wrapIfAuthored(ent, mesh) {
  if (!PREVIEW_AUTHORED) return mesh;
  try { return wrapShipWithAuthoredParts(ent, mesh, { releaseMode: true }); }
  catch (_) { return mesh; }
}
// The authored upgrade is armed on first render (onBeforeRender) and completes asynchronously, so we
// must keep rendering frames while we wait for the GLB swap to land.
async function awaitAuthoredSwap(renderer, scene, cam) {
  if (!PREVIEW_AUTHORED) return;
  for (let i = 0; i < 80; i++) {
    renderer.render(scene, cam);
    await new Promise((r) => setTimeout(r, 60));
    // any ship boundary still loading?
    let pending = false;
    scene.traverse((o) => {
      const st = o.userData && o.userData.authoredAssetState;
      if (st === 'loading' || st === 'procedural-fallback') pending = true;
    });
    if (!pending) break;
  }
}

// Sample loadouts that push each hull into each of its visual tiers (Mk.I/II/III). We pick high-tier
// modules repeatedly so the summed tier crosses the minTier thresholds defined in ships.js visuals.
function sampleFittingsForTier(shipDef, wantTierName) {
  const slots = shipDef.slots || {};
  const fit = [];
  const order = ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility'];
  // a few high-tier defIds to inflate the summed tier for Mk.II/III
  const bigWeapon = WEAPONS.find((w) => w.size === 'L') || WEAPONS[0];
  const bigShield = MODULES.find((m) => m.slotType === 'shield') || MODULES[0];
  const bigEngine = MODULES.find((m) => m.slotType === 'engine') || MODULES[0];
  const miningMod = MODULES.find((m) => m.slotType === 'mining');
  for (const t of order) {
    const arr = slots[t] || [];
    for (const entry of arr) {
      const size = typeof entry === 'string' ? entry : (entry && entry.size) || 'S';
      let id = null;
      if (wantTierName === 'Mk.I') {
        // minimal: one weapon that fits, nothing else
        if (t === 'weapon') id = (WEAPONS.find((w) => w.size === size) || bigWeapon).id;
      } else if (wantTierName === 'Mk.II') {
        if (t === 'weapon') id = (WEAPONS.find((w) => w.size === size) || bigWeapon).id;
        if (t === 'shield') id = bigShield.id;
        if (t === 'engine') id = bigEngine.id;
      } else { // Mk.III and beyond — max out the tier sum
        if (t === 'weapon') id = (WEAPONS.find((w) => w.size === size) || bigWeapon).id;
        if (t === 'shield') id = bigShield.id;
        if (t === 'engine') id = bigEngine.id;
        if (t === 'mining' && miningMod) id = miningMod.id;
      }
      fit.push(id);
    }
  }
  return fit;
}

// Build a minimal ship entity the visual factory can consume (same shape makeShipEntitySpec makes,
// but without requiring the full sim). defId + data.{defId,fittings,weapons,miningBeam} is what the
// factory reads.
function makePreviewEntity(defId, fittings, shipDef, seedId, factionVariant) {
  const WPN = new Map(WEAPONS.map((w) => [w.id, w]));
  // backfill weapons runtime (facing from the slot) so hardpoint props place barrels correctly
  const slots = shipDef.slots || {};
  const weapons = [];
  let wIdx = 0;
  for (const entry of (slots.weapon || [])) {
    const facing = (typeof entry === 'object' && entry.facing) || 'front';
    const fid = fittings[wIdx];
    if (fid && WPN.has(fid)) weapons.push({ slotIndex: wIdx, defId: fid, facing, tracking: WPN.get(fid).tracking || 'fixed' });
    wIdx++;
  }
  // factionVariant overrides team/factionId so the paint profile (grime/chrome/nose-art) renders.
  //   null/undefined → player (faction_free). 'concord' → lawful chrome authority. 'pirate' → filthy.
  const fv = factionVariant || {};
  const team = fv.team != null ? fv.team : 0;
  const factionId = fv.factionId || 'faction_free';
  return {
    id: seedId, type: 'ship', team, factionId,
    pos: { x: 0, z: 0 }, rot: Math.PI * 0.15, prevPos: { x: 0, z: 0 }, prevRot: 0, bank: 0,
    radius: shipDef.collisionRadius || 14,
    data: {
      defId, fittings,
      weapons, miningBeam: fittings.some((f) => f && MODULES.find((m) => m.id === f && m.slotType === 'mining')) ? { tierId: 'beam_mk1' } : null,
    },
  };
}

/**
 * Run the turntable preview. Renders every ship hull × each of its visual tiers into .devshots/
 * via the live renderer. Safe to call once after boot; logs progress to the console.
 * @param {object} SF - the window.SF handle { state, registry, THREE }
 */
export async function runShipPreview(SF) {
  const state = SF.state;
  const renderer = state.render && state.render.renderer;
  const scene = state.render && state.render.scene;
  const cam = state.render && state.render.camera;
  const factory = (state.render && state.render.vf) || null;
  if (!renderer || !scene || !cam) { console.warn('[shipPreview] render handle missing'); return; }
  // wait for the PMREM env-map bake (the renderer starts it ~120ms after boot) so chrome/authority
  // hulls actually mirror the nebula instead of rendering matte in the preview.
  for (let i = 0; i < 40 && !state.render.envMap; i++) await new Promise((r) => setTimeout(r, 100));
  console.log('[shipPreview] envMap', state.render.envMap ? 'ready' : 'not ready (chrome will be matte)');
  // re-create the factory if not exposed (it normally lives on the render system privately)
  let vf = factory;
  if (!vf) {
    const mod = await import('./visualFactory.js');
    vf = mod.createVisualFactory();
  }

  // pause the sim loop's scene mutation by hiding all existing entities temporarily
  const hidden = [];
  for (const child of scene.children) { if (child.userData && child.userData.kind) { child.visible = false; hidden.push(child); } }

  const tmp = new THREE.Group(); scene.add(tmp);
  // set up a clean preview framing: top-down-ish 3/4 view
  const prevPos = cam.position.clone(); const prevLook = (cam.userData && cam.userData.target ? cam.userData.target.clone() : null);

  let count = 0;
  for (const shipDef of SHIPS) {
    const tiers = (shipDef.visuals && shipDef.visuals.tiers) || [{ name: 'Mk.I' }];
    for (const tierRow of tiers) {
      const fittings = sampleFittingsForTier(shipDef, tierRow.name);
      const ent = makePreviewEntity(shipDef.id, fittings, shipDef, count + 1);
      let mesh = null;
      try { mesh = vf.build(ent); } catch (err) { console.warn('[shipPreview] build failed', shipDef.id, err); continue; }
      if (!mesh) continue;
      mesh = wrapIfAuthored(ent, mesh);
      // frame it: radius-based distance so big capitals still fit
      const R = ent.radius;
      tmp.add(mesh);
      // turntable angle: a rear 3/4 elevated view (matches the chase camera roughly)
      mesh.rotation.y = -ent.rot;
      const D = R * 3.2;
      cam.position.set(-D * 0.6, D * 0.7, -D * 0.8);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      // authored mode: render-poll until the GLB-part swap lands before snapshotting
      await awaitAuthoredSwap(renderer, scene, cam);
      // warm up textures: CanvasTextures need a render pass (or initTexture) to upload to the GPU
      // before they're visible. Force-upload every texture reachable from the mesh, then render a few
      // frames with a delay so async image decode completes before the snapshot.
      mesh.traverse((c) => {
        const m = c.material;
        if (!m) return;
        const maps = [m.map, m.normalMap, m.roughnessMap, m.emissiveMap];
        for (const t of maps) { if (t && renderer.initTexture) { try { renderer.initTexture(t); } catch (_) {} } }
      });
      renderer.render(scene, cam);
      await new Promise((res) => setTimeout(res, 80));
      renderer.render(scene, cam);
      await new Promise((res) => setTimeout(res, 60));
      renderer.render(scene, cam);
      const name = `${shipDef.id.replace('ship_', '')}_${tierRow.name.replace('.', '')}`;
      try {
        const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
        await fetch('/__shot?name=' + name, { method: 'POST', body: url });
        console.log('[shipPreview] shot', name);
        count++;
      } catch (err) { console.warn('[shipPreview] snapshot failed', name, err); }
      tmp.remove(mesh);
      // dispose the per-entity graph (cached geo/mat/tex are left alone by design)
      mesh.traverse((c) => { if (c.geometry) c.geometry.dispose && c.geometry.dispose(); });
    }
  }

  // ---- FACTION VARIANTS PASS — render representative hulls under different faction personalities
  //       to verify the dirty-outlaw vs clean-authority vs filthy-pirate art-direction contrast.
  //       Uses the top tier so the most detail/grime/chrome is visible.
  const factionVariants = [
    { tag: 'outlaw',  team: 2, factionId: 'faction_free' },    // independent outlaw (player-equivalent, but team!=0 so it uses the faction palette not PLAYER_PAL)
    { tag: 'concord', team: 2, factionId: 'faction_scn' },     // lawful chrome authority
    { tag: 'meridian', team: 2, factionId: 'faction_mts' },    // corporate chrome
    { tag: 'pirate',  team: 1, factionId: 'faction_reach' },   // filthy tagged pirate
    { tag: 'smuggler', team: 2, factionId: 'faction_quiet' },  // grimy tagged smuggler
  ];
  const variantHulls = ['ship_kestrel', 'ship_bastion'];   // a small hull + a warship
  for (const defId of variantHulls) {
    const shipDef = SHIPS.find((s) => s.id === defId);
    if (!shipDef) continue;
    const tiers = (shipDef.visuals && shipDef.visuals.tiers) || [{ name: 'Mk.I' }];
    const topTier = tiers[tiers.length - 1];
    const fittings = sampleFittingsForTier(shipDef, topTier.name);
    for (const fv of factionVariants) {
      // the player's own Kestrel (team 0) gets the canonical haunted-runner look separately:
      if (defId === 'ship_kestrel' && fv.tag === 'outlaw') continue; // already captured as kestrel_MkIII
      const ent = makePreviewEntity(defId, fittings, shipDef, count + 1, fv);
      let mesh = null;
      try { mesh = vf.build(ent); } catch (err) { console.warn('[shipPreview] variant build failed', defId, fv.tag, err); continue; }
      if (!mesh) continue;
      const R = ent.radius; tmp.add(mesh); mesh.rotation.y = -ent.rot;
      const D = R * 3.2;
      cam.position.set(-D * 0.6, D * 0.7, -D * 0.8); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
      mesh.traverse((c) => {
        const m = c.material; if (!m) return;
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.emissiveMap, m.envMap]) {
          if (t && renderer.initTexture) { try { renderer.initTexture(t); } catch (_) {} }
        }
      });
      renderer.render(scene, cam); await new Promise((res) => setTimeout(res, 80));
      renderer.render(scene, cam); await new Promise((res) => setTimeout(res, 60));
      renderer.render(scene, cam);
      const baseName = defId.replace('ship_', '');
      const name = `${baseName}_${fv.tag}_${topTier.name.replace('.', '')}`;
      try {
        const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
        await fetch('/__shot?name=' + name, { method: 'POST', body: url });
        console.log('[shipPreview] variant shot', name); count++;
      } catch (err) { console.warn('[shipPreview] variant snapshot failed', name, err); }
      tmp.remove(mesh);
      mesh.traverse((c) => { if (c.geometry) c.geometry.dispose && c.geometry.dispose(); });
    }
  }

  // ---- WORLD ASSETS PASS — capture stations, gates, asteroids, and sector scenes under the new
  //       nebula tints + cinematic post grade to verify the whole-world art direction reads.
  const worldShots = [];

  // stations + gates across factions (grimy outpost vs chrome core)
  const worldVariants = [
    { tag: 'concord', factionId: 'faction_scn' },   // chrome authority core station
    { tag: 'frontier', factionId: 'faction_free' }, // grimy frontier outpost
    { tag: 'pirate', factionId: 'faction_reach' },  // filthy pirate den
  ];
  for (const wv of worldVariants) {
    const stationEnt = {
      id: count + 1, type: 'station', team: 2, factionId: wv.factionId, radius: 42,
      pos: { x: 0, z: 0 }, rot: 0,
      data: { stationId: 'preview', dockRadius: 72, services: ['market'] },
    };
    let mesh = null; try { mesh = vf.build(stationEnt); } catch (err) { console.warn('[world] station', wv.tag, err); continue; }
    if (mesh) { worldShots.push({ mesh, name: `world_station_${wv.tag}`, R: 42 }); }
    // gate variant
    const gateEnt = Object.assign({}, stationEnt, { id: count + 100, data: { isGate: true, dockRadius: 72 } });
    let gmesh = null; try { gmesh = vf.build(gateEnt); } catch (err) { console.warn('[world] gate', wv.tag, err); }
    if (gmesh) { worldShots.push({ mesh: gmesh, name: `world_gate_${wv.tag}`, R: 42 }); }
  }

  // asteroids — the neon ore types
  const astTypes = ['ast_common_rock', 'ast_metallic', 'ast_crystalline', 'ast_rare_exotic', 'ast_icy'];
  for (const typeId of astTypes) {
    const astEnt = { id: count + 500, type: 'asteroid', radius: 12, pos: { x: 0, z: 0 }, rot: 0, data: { typeId } };
    let mesh = null; try { mesh = vf.build(astEnt); } catch (err) { console.warn('[world] ast', typeId, err); continue; }
    if (mesh) { worldShots.push({ mesh, name: `world_${typeId}`, R: 12 }); }
  }

  // render + snapshot each world asset
  for (const ws of worldShots) {
    tmp.add(ws.mesh); ws.mesh.rotation.y = 0;
    const R = ws.R; const D = R * 3.2;
    cam.position.set(-D * 0.6, D * 0.7, -D * 0.8); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    ws.mesh.traverse((c) => {
      const m = c.material; if (!m) return;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.emissiveMap, m.envMap]) {
        if (t && renderer.initTexture) { try { renderer.initTexture(t); } catch (_) {} }
      }
    });
    renderer.render(scene, cam); await new Promise((res) => setTimeout(res, 80));
    renderer.render(scene, cam); await new Promise((res) => setTimeout(res, 60));
    renderer.render(scene, cam);
    try {
      const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
      await fetch('/__shot?name=' + ws.name, { method: 'POST', body: url });
      console.log('[shipPreview] world shot', ws.name); count++;
    } catch (err) { console.warn('[shipPreview] world snapshot failed', ws.name, err); }
    tmp.remove(ws.mesh);
    ws.mesh.traverse((c) => { if (c.geometry) c.geometry.dispose && c.geometry.dispose(); });
  }

  // ---- PLANET PASS — capture habitable (night-side city lights) + dead + lava planets under the
  //       new neon-noir palettes. Rotate each so ~half is in shadow so city lights + terminator read.
  let planetFactory = null;
  try { planetFactory = (await import('./planetFactory.js')).createPlanetFactory(); } catch (_) {}
  if (planetFactory && planetFactory.buildPlanetMesh) {
    const planetTypes = [
      { type: 'terran', radius: 60, name: 'world_planet_terran' },     // amber city lights on coasts
      { type: 'oceanic', radius: 60, name: 'world_planet_oceanic' },   // cyan city lights
      { type: 'dead', radius: 60, name: 'world_planet_dead' },         // noir desaturated grey-blue
      { type: 'lava', radius: 60, name: 'world_planet_lava' },         // neon red glow
      { type: 'scorched', radius: 60, name: 'world_planet_scorched' }, // scorched rust
    ];
    for (const ps of planetTypes) {
      let mesh = null;
      try { mesh = planetFactory.buildPlanetMesh(ps.type, ps.radius, count * 7 + 13); } catch (err) { console.warn('[planet]', ps.type, err); continue; }
      if (!mesh) continue;
      tmp.add(mesh);
      // rotate so the sun (fixed key-light dir) leaves a clear night side facing camera
      mesh.rotation.y = Math.PI * 0.55;
      const D = ps.radius * 3.0;
      cam.position.set(-D * 0.5, D * 0.45, -D * 0.9); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
      renderer.render(scene, cam); await new Promise((res) => setTimeout(res, 80));
      renderer.render(scene, cam); await new Promise((res) => setTimeout(res, 60));
      renderer.render(scene, cam);
      try {
        const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
        await fetch('/__shot?name=' + ps.name, { method: 'POST', body: url });
        console.log('[shipPreview] planet shot', ps.name); count++;
      } catch (err) { console.warn('[shipPreview] planet snapshot failed', ps.name, err); }
      tmp.remove(mesh);
    }
  }

  // ---- PROJECTILE PASS — capture neon energy bolts (player cyan + hostile red) up close to verify
  //       the chromatic-fringe plasma look reads through bloom.
  const boltVariants = [
    { team: 0, name: 'world_bolt_player' },   // cyan plasma (player)
    { team: 1, name: 'world_bolt_hostile' },  // hot red plasma (hostile)
  ];
  for (const bv of boltVariants) {
    const boltEnt = { id: count + 700, type: 'projectile', team: bv.team, radius: 2.2,
      pos: { x: 0, z: 0 }, rot: 0, data: { kind: 'energy' } };
    let mesh = null; try { mesh = vf.build(boltEnt); } catch (err) { console.warn('[bolt]', bv.name, err); continue; }
    if (!mesh) continue;
    tmp.add(mesh); mesh.rotation.y = 0;
    const D = 14; cam.position.set(-D * 0.4, D * 0.3, -D * 0.9); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    mesh.traverse((c) => {
      const m = c.material; if (!m) return;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.emissiveMap, m.envMap]) {
        if (t && renderer.initTexture) { try { renderer.initTexture(t); } catch (_) {} }
      }
    });
    renderer.render(scene, cam); await new Promise((res) => setTimeout(res, 80));
    renderer.render(scene, cam); await new Promise((res) => setTimeout(res, 60));
    renderer.render(scene, cam);
    try {
      const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
      await fetch('/__shot?name=' + bv.name, { method: 'POST', body: url });
      console.log('[shipPreview] bolt shot', bv.name); count++;
    } catch (err) { console.warn('[shipPreview] bolt snapshot failed', bv.name, err); }
    tmp.remove(mesh);
    mesh.traverse((c) => { if (c.geometry) c.geometry.dispose && c.geometry.dispose(); });
  }

  // restore
  scene.remove(tmp);
  for (const child of hidden) child.visible = true;
  cam.position.copy(prevPos);
  if (prevLook) cam.lookAt(prevLook);
  console.log('[shipPreview] done — %d shots in .devshots/', count);
}
