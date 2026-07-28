#!/usr/bin/env node
// PQ-022.exterior-relay-collar — presentation stills of the authored claim relay on the ordinary
// Asteroid Ops exterior route.
//
// The relay is put in the world by the shipped production path (asteroidSites._ensureBeacon), on a
// real asteroid, in a real sector, through the ordinary spawn helper and the ordinary place loader.
// Nothing here fakes an entity or a second renderer path.
//
// Presentation only. No performance claim is made or implied: matched perf capture is blocked on
// the PQ-034 lease.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 41755);
assert.ok(Number.isInteger(PORT) && PORT > 0 && PORT <= 65_535, `invalid capture port: ${PORT}`);
const BASE = `http://127.0.0.1:${PORT}/`;
// .devshots/ is gitignored working output. Set SF_PQ022_CAPTURE_DIR to regenerate the durable
// copy retained under assets/ships/m5_claim_outposts/evidence/pq022-relay-collar/.
const OUT_REL = process.env.SF_PQ022_CAPTURE_DIR || '.devshots/pq022-relay-collar';
const OUT = resolve(ROOT, OUT_REL);
const PART_FILE = 'places/place_claim_outpost_relay.glb';

const shots = [
  { name: 'exterior-close.png', distance: 34, height: 12, lod: 'lod0' },
  { name: 'exterior-default.png', distance: 105, height: 38, lod: 'lod1' },
  { name: 'exterior-far.png', distance: 340, height: 120, lod: 'lod2' },
];

await mkdir(OUT, { recursive: true });
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  await waitForServer();
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => sessionStorage.setItem('sf.cinematicSeen', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'the relay must be shown on the canonical player route');
  await page.waitForFunction(() => window.SF && window.SF.bus && window.SF.state, null, { timeout: 30_000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'PQ-022 Relay Collar', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => window.SF?.state?.mode === 'flight', null, { timeout: 120_000 });

  // Anchor a claim on a real rock and let the shipped exterior projection place the relay.
  const placement = await page.evaluate(async () => {
    const { asteroidSites, makeSiteRecord } = await import('/src/systems/asteroidSites.js');
    const state = window.SF.state;
    const rock = state.entityList.find((entity) => entity?.type === 'asteroid' && entity.alive !== false);
    if (!rock) return { error: 'no asteroid in the current sector' };
    if (!asteroidSites.ctx) return { error: 'asteroidSites is not initialized on the live route' };
    const site = makeSiteRecord({
      id: 'site_pq022_relay_collar',
      asteroidId: rock.id,
      sectorId: state.world.currentSectorId,
      fieldId: rock.data?.fieldId || 'field_1',
      createdT: state.simTime,
    });
    site.anchored = true;
    asteroidSites._ensureBeacon(site);
    const relay = state.entityList.find((entity) => entity?.data?.siteBeacon === site.id);
    if (!relay) return { error: 'the exterior projection spawned no relay' };
    window.__pq022RelayId = relay.id;
    return {
      relayId: relay.id,
      rockId: rock.id,
      rockRadius: rock.radius,
      sectorId: state.world.currentSectorId,
      placeId: relay.data.placeId,
      placeScale: relay.data.placeScale,
      worldDressing: relay.data.worldDressing === true,
      collides: relay.collides === true,
      contactRingDistance: Math.hypot(relay.pos.x - rock.pos.x, relay.pos.z - rock.pos.z),
    };
  });
  assert.ok(!placement.error, `exterior placement failed: ${placement.error}`);
  assert.equal(placement.placeId, 'place_claim_outpost_relay');

  // The authored asset must be admitted through the ordinary place loader — no fallback substrate.
  await page.waitForFunction((partFile) => {
    const state = window.SF?.state;
    const relay = state?.entityList?.find((entity) => entity?.id === window.__pq022RelayId);
    const data = relay?.mesh?.userData || {};
    return data.authoredAssetState === 'authored'
      && data.authoredReadableFallbackRetained === false
      && Object.values(data.authoredSlots || {}).flat().some((url) => String(url).includes(partFile));
  }, PART_FILE, { timeout: 120_000 });

  const report = [];
  for (const shot of shots) {
    const capture = await page.evaluate(({ distance, height, lod }) => {
      const state = window.SF.state;
      const relay = state.entityList.find((entity) => entity?.id === window.__pq022RelayId);
      const root = relay.mesh;
      const camera = state.render.camera;
      const Vector3 = camera.position.constructor;
      const target = new Vector3();
      root.getWorldPosition(target);
      const offset = new Vector3(distance * 0.72, height, distance * 0.58);
      camera.position.copy(target).add(offset);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      camera.near = 0.1;
      camera.far = Math.max(camera.far || 0, 8000);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      root.traverse((object) => {
        if (typeof object.userData?.updateLod === 'function') object.userData.updateLod(lod);
      });
      if (typeof state.render.warmPostProcess === 'function') state.render.warmPostProcess();
      else state.render.renderer.render(state.render.scene, camera);
      const dataUrl = state.render.renderer.domElement.toDataURL('image/png');

      // Scale truth. buildPlacePropRoot stamps the authored child, not the boundary, so walk to it.
      let authored = null;
      root.traverse((object) => {
        if (authored == null && Number.isFinite(object.userData?.authoredWorldScale)) authored = object;
      });
      const Box3 = window.SF.THREE.Box3;
      const size = new Box3().setFromObject(root).getSize(new Vector3());
      // Extent of only what this LOD actually draws, which is what the still shows.
      const visible = new Box3();
      root.traverse((object) => {
        if (!object.isMesh || !object.visible) return;
        let node = object;
        let shown = true;
        while (node && node !== root) { if (!node.visible) { shown = false; break; } node = node.parent; }
        if (shown) visible.expandByObject(object);
      });
      const visibleSize = visible.isEmpty() ? null : visible.getSize(new Vector3());
      return {
        dataUrl,
        lod,
        mode: state.mode,
        authoredAssetState: root.userData.authoredAssetState,
        authoredVisualRoot: root.userData.authoredVisualRoot,
        authoredReadableFallbackRetained: root.userData.authoredReadableFallbackRetained,
        authoredSlots: root.userData.authoredSlots,
        authoredWorldScale: authored?.userData?.authoredWorldScale ?? null,
        authoredSourceEnvelope: authored?.userData?.authoredSourceEnvelope ?? null,
        authoredVisualBounds: authored?.userData?.visualBounds ?? null,
        worldSizeM: [size.x, size.y, size.z],
        visibleSizeM: visibleSize ? [visibleSize.x, visibleSize.y, visibleSize.z] : null,
        cameraDistance: camera.position.distanceTo(target),
      };
    }, shot);
    assert.match(capture.dataUrl, /^data:image\/png;base64,/);
    const bytes = Buffer.from(capture.dataUrl.slice(capture.dataUrl.indexOf(',') + 1), 'base64');
    await writeFile(resolve(OUT, shot.name), bytes);
    delete capture.dataUrl;
    assert.equal(capture.authoredAssetState, 'authored', `${shot.name}: authored asset must be admitted`);
    report.push({ file: `${OUT_REL}/${shot.name}`, bytes: bytes.length, ...capture });
  }

  // Material truth. The stills read as flat grey forms, so record objectively whether the authored
  // KTX2 maps are actually bound at the game camera or whether that flatness is the authored look.
  const materials = await page.evaluate(() => {
    const state = window.SF.state;
    const relay = state.entityList.find((entity) => entity?.id === window.__pq022RelayId);
    const seen = new Map();
    relay.mesh.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      for (const material of [].concat(object.material)) {
        if (seen.has(material.uuid)) continue;
        const slot = (key) => {
          const texture = material[key];
          if (!texture) return null;
          return {
            compressed: texture.isCompressedTexture === true,
            width: texture.image?.width ?? null,
            height: texture.image?.height ?? null,
            colorSpace: texture.colorSpace ?? null,
          };
        };
        seen.set(material.uuid, {
          name: material.name,
          type: material.type,
          color: material.color ? `#${material.color.getHexString()}` : null,
          metalness: material.metalness ?? null,
          roughness: material.roughness ?? null,
          map: slot('map'),
          normalMap: slot('normalMap'),
          roughnessMap: slot('roughnessMap'),
          metalnessMap: slot('metalnessMap'),
          aoMap: slot('aoMap'),
          emissiveMap: slot('emissiveMap'),
        });
      }
    });
    return [...seen.values()];
  });

  // Renderer residency at the moment the relay is still live. This is a REFERENCE READING ONLY --
  // it is not a disposal proof: nothing here re-reads after a despawn frame, and resource
  // high-water/cleanup is explicitly an open row blocked on the PQ-034 lease.
  const preDespawnSnapshot = await page.evaluate(() => {
    const state = window.SF.state;
    const relay = state.entityList.find((entity) => entity?.id === window.__pq022RelayId);
    const memory = state.render.renderer.info.memory;
    return {
      note: 'reference reading while the relay is live; NOT a disposal measurement',
      relayId: relay.id,
      geometries: memory.geometries,
      textures: memory.textures,
    };
  });

  await writeFile(resolve(OUT, 'manifest.json'), `${JSON.stringify({
    schema: 'spaceface.pq022RelayCollarCapture.v1',
    leafId: 'PQ-022.exterior-relay-collar',
    assetId: 'SF_PLACE_CLAIM_OUTPOST_RELAY',
    partId: 'place_claim_outpost_relay',
    sourceSha256: 'a93c7b4d8fd23fa925fb99c025a544dacf13716e374261b8c487399c2196fda8',
    releaseSha256: 'dc07ebef0ea61a45e778ecbb8a9ac4dfda4e71e4970433337e0ead084fffdcc2',
    route: BASE,
    routeDescription: 'canonical player route -> new game (seed 47) -> flight -> asteroidSites._ensureBeacon on a live rock',
    viewport: [1440, 900],
    claim: 'presentation stills only; no performance measurement is made or implied',
    blockedOnPq034Lease: ['headed Browser/Electron acceptance', 'independent visual verdict', 'matched performance'],
    placement,
    materials,
    preDespawnSnapshot,
    captures: report,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ placement, captures: report }, null, 2));
  console.log(`[pq022-relay-collar] PASS ${report.length} exterior stills -> ${OUT_REL}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch (_) {
    return chromium.launch({ headless: true });
  }
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`server did not become ready at ${BASE}`);
}
