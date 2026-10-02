// Showcase harness: boots the real game once in system Chrome, installs an in-page
// __showcase API for fitting items, spawning a demo scene, recording the WebGL canvas
// to webm, and collecting gameplay evidence (bus events + entity state diffs).
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../../lib/load-playwright.mjs';
import { acquireVisualProbeServer } from '../../lib/visualProbeServer.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CHROME = 'C:/devin/chrome/chrome-win64/chrome.exe';

export async function bootShowcase({ viewport = { width: 960, height: 540 }, headless = true } = {}) {
  if (!existsSync(CHROME)) throw new Error(`system chrome missing at ${CHROME}`);
  const server = await acquireVisualProbeServer({ root: ROOT });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless,
    executablePath: CHROME,
    args: [
      '--ignore-gpu-blocklist', '--enable-webgl', '--mute-audio',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await (await browser.newContext({ viewport })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 60_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Showcase', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    return sf?.state?.mode === 'flight' && !!sf?.state?.entities?.get(sf.state.playerId)?.mesh;
  }, null, { timeout: 120_000 });
  await installShowcaseApi(page);
  return { page, browser, server };
}

// Installed into the game page: window.__showcase.{fit,strip,hull,spawnPack,clear,evidence,record,info}
async function installShowcaseApi(page) {
  await page.evaluate(async () => {
    const sf = window.SF;
    const { WEAPONS } = await import('/src/data/weapons.js');
    const { MODULES } = await import('/src/data/modules.js');
    const { SHIPS } = await import('/src/data/ships.js');
    const { makeEnemySpawnSpec } = await import('/src/systems/combat.js');
    const { buildSlotList, makeShipEntitySpec } = await import('/src/systems/ships.js');

    const sys = (name) => sf.registry.get(name);
    const defs = (id) => [...WEAPONS, ...MODULES].find((d) => d.id === id) || null;
    const RANK = { S: 1, M: 2, L: 3 };
    const spawnedIds = new Set();
    const evCounts = Object.create(null);
    const evWatch = Object.create(null);
    let listening = false;

    function startListening() {
      if (listening) return;
      listening = true;
      const on = sf.bus.on.bind(sf.bus);
      for (const ev of [
        'combat:hit', 'combat:damage', 'combat:statusApplied', 'combat:statusExpired',
        'combat:kill', 'entity:killed',
        'projectile:hit', 'combat:shove', 'combat:tumbled', 'combat:weak', 'combat:warded',
        'combat:beamStop', 'combat:emp', 'combat:base', 'combat:outcome', 'combat:fire',
        'fields:hitchLatched', 'fields:hitchCut', 'fields:deployed', 'fields:ended',
        'fields:deployDenied', 'well:capture', 'well:fling',
        'hullBurst:hit', 'hullBurst:ended',
        'countermeasure:denied', 'countermeasure:deployed',
        'tether:latched', 'tether:attached', 'tether:latchDenied', 'tether:cut', 'tether:released',
        'tether:broke', 'tether:snagged', 'tether:whipSnap', 'tether:whipImpact', 'tether:reel',
        'massline:throw', 'massline:sweepImpact', 'massline:selfSling', 'massline:releaseWindow',
        'charge:thrown', 'charge:stuck', 'charge:detonated', 'charge:armed', 'charge:aftDropped', 'charge:combo',
        'tether:latchDenied', 'alienEcology:lureDropped', 'toast', 'alert',
        'cloak:engaged', 'cloak:dropped', 'cloak:burned',
        'weapons:mineDeployed', 'weapons:mineArmed', 'weapons:mineDetonated', 'weapons:mineExpired',
        'emergent:applied', 'emergent:contact',
        'scan:pulse', 'scan:completed', 'pds:intercept',
        'loot:drop', 'loot:magnetCaptured', 'cargo:changed', 'cargo:caughtByNet',
        'mining:start', 'mining:beamLocked', 'mining:yield', 'mining:tick', 'mining:seamHit',
        'shieldDown', 'hit',
      ]) {
        on(ev, (p) => {
          const c = (evCounts[ev] = (evCounts[ev] || 0) + 1);
          if (!evWatch[ev]) evWatch[ev] = [];
          if (evWatch[ev].length < 8) evWatch[ev].push({ c, p: summarizePayload(p) });
        });
      }
    }
    function summarizePayload(p) {
      if (!p || typeof p !== 'object') return p;
      const out = {};
      for (const k of ['targetId', 'attackerId', 'entityId', 'defId', 'weaponId', 'amount', 'kind', 'statusId', 'dmg', 'damageType', 'victimDefId', 'source', 'text', 'reason']) {
        if (p[k] !== undefined) out[k] = p[k];
      }
      return out;
    }

    function owned() {
      const p = sf.state.player;
      return p.ownedShips[p.activeShipIndex];
    }
    function activeShipDef() {
      const o = owned();
      return SHIPS.find((s) => s.id === o?.defId) || null;
    }
    function slotList() {
      const sd = activeShipDef();
      return sd ? buildSlotList(sd) : [];
    }

    const api = {
      // --- inventory / fitting -------------------------------------------------
      hull(defId) {
        const ships = sys('ships');
        if (!ships?.buyShip) return { ok: false, reason: 'no ships.buyShip' };
        const idx = ships.buyShip({ defId, grant: true, setActive: true });
        return { ok: idx >= 0 || idx === true, idx };
      },
      strip(keepTypes = ['engine', 'thruster']) {
        const ships = sys('ships');
        const o = owned();
        const slots = slotList();
        const out = [];
        for (const s of slots) {
          if (o.fittings[s.index] && !keepTypes.includes(s.type)) {
            ships.unfitModule({ slotIndex: s.index });
            out.push(s.index);
          }
        }
        return out;
      },
      fit(defId) {
        const ships = sys('ships');
        const def = defs(defId);
        if (!def) return { ok: false, reason: `unknown def ${defId}` };
        const o = owned();
        const slots = slotList().filter((s) => s.type === def.slotType && RANK[s.size] >= RANK[def.size]);
        if (!slots.length) return { ok: false, reason: `no ${def.slotType} slot >= ${def.size} on ${activeShipDef()?.id}` };
        const inv = sf.state.player.moduleInventory || [];
        let inst = inv.find((m) => m.defId === defId);
        if (!inst) {
          ships.grantModule({ defId, reason: 'sandbox' });
          inst = inv.find((m) => m.defId === defId);
        }
        if (!inst) return { ok: false, reason: 'grant failed' };
        const free = slots.find((s) => !o.fittings[s.index]);
        if (!free) return { ok: false, reason: `no free ${def.slotType} slot` };
        const ok = ships.fitModule({ slotIndex: free.index, instanceId: inst.instanceId });
        return { ok: !!ok, slotIndex: free.index, reason: ok ? '' : 'fitModule refused' };
      },
      unfit(slotIndex) { sys('ships').unfitModule({ slotIndex }); return true; },
      fitted() {
        const o = owned();
        const slots = slotList();
        return slots.filter((s) => o.fittings[s.index]).map((s) => ({ slot: s.index, type: s.type, size: s.size, defId: o.fittings[s.index] }));
      },
      hullDef() { return activeShipDef()?.id; },
      async unlockTech() {
        const { TECH_NODES } = await import('/src/data/tech.js');
        const ships = sys('ships');
        const economy = sys('economy');
        const p = sf.state.player;
        const totalRp = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0);
        p.researchPoints = (p.researchPoints || 0) + totalRp + 1000;
        const totalCredit = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
        if (economy?.grantCredits) economy.grantCredits(totalCredit + 500000, 'sandbox:tech');
        for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
          let progressed = false;
          for (const node of TECH_NODES) {
            if ((p.researchedNodes || []).includes(node.id)) continue;
            if (typeof ships.researchable === 'function' && !ships.researchable(node.id)) continue;
            if (ships.unlockTech(node.id, { silent: true })) progressed = true;
          }
          if (!progressed) break;
        }
        return (p.researchedNodes || []).length;
      },
      // --- scene ---------------------------------------------------------------
      teleport(x = 0, z = 0, rot = 0) {
        const pl = sf.state.entities.get(sf.state.playerId);
        pl.pos.x = x; pl.pos.z = z;
        pl.vel.x = 0; pl.vel.y = 0; pl.vel.z = 0;
        pl.rot = rot;
        if (pl.phys) { pl.phys.vel?.set?.(0, 0, 0); pl.phys.angVel?.set?.(0, 0, 0); }
        return true;
      },
      camera(zoom = 80) {
        const cam = sf.state.render?.cameraCtrl;
        if (!cam) return false;
        cam.setZoom(zoom);
        cam.snapToPlayer?.();
        return true;
      },
      faceTo(x, z) {
        const pl = sf.state.entities.get(sf.state.playerId);
        pl.rot = Math.atan2(z - pl.pos.z, x - pl.pos.x);
        return pl.rot;
      },
      holdThrust(onOff) {
        const inp = sf.state.input;
        if (inp?.keys) { inp.keys.KeyW = !!onOff; inp.keys.ArrowUp = !!onOff; }
        if (inp?.actions) inp.actions.thrust = !!onOff;
        return true;
      },
      player() {
        const pl = sf.state.entities.get(sf.state.playerId);
        return { pos: { ...pl.pos }, rot: pl.rot, hull: pl.hull, shield: pl.shield, derived: pl.data?.derived || pl.derived };
      },
      spawnPack({ count = 3, distance = 180, shipId = 'ship_kestrel', hostile = false, enemyType = 'wasp_swarmer', arcDeg = 60, jitter = 20 }) {
        const pl = sf.state.entities.get(sf.state.playerId);
        const px = pl?.pos?.x || 0, pz = pl?.pos?.z || 0;
        const out = [];
        const arc = (arcDeg * Math.PI) / 180;
        for (let i = 0; i < count; i++) {
          const a = pl.rot + (count > 1 ? (i / (count - 1) - 0.5) * arc : 0);
          const d = distance + (i % 3) * jitter;
          const pos = { x: px + Math.cos(a) * d, z: pz + Math.sin(a) * d };
          let spec;
          if (hostile) {
            spec = makeEnemySpawnSpec(enemyType, null, pos, {});
            if (spec.data?.ai) spec.data.ai.spawnContext = 'encounter';
          } else {
            spec = makeShipEntitySpec(shipId, { team: 2, factionId: 'faction_free', pos });
          }
          const e = sf.helpers.spawnEntity(spec);
          if (e) { spawnedIds.add(e.id); out.push(e.id); }
        }
        return out;
      },
      spawnAsteroid({ distance = 160, typeId = 'ast_metallic', oreHP = 280, radius = 16 } = {}) {
        const pl = sf.state.entities.get(sf.state.playerId);
        const px = pl?.pos?.x || 0, pz = pl?.pos?.z || 0;
        const a = pl.rot;
        const e = sf.helpers.spawnEntity({
          type: 'asteroid',
          pos: { x: px + Math.cos(a) * distance, y: 0, z: pz + Math.sin(a) * distance },
          radius, mass: 600, hull: oreHP, hullMax: oreHP,
          data: { typeId, oreHP, oreHPMax: oreHP },
        });
        if (e) { spawnedIds.add(e.id); return [e.id]; }
        return [];
      },
      // Force the pointer-mining input lane at a specific entity while RMB is held —
      // equivalent to a real pick landing on the body (spawned bodies carry no mesh root).
      mineRmbOn(id) {
        const inpSys = sf.registry.get('input');
        const inp = sf.state.input;
        clearInterval(window.__mineIv);
        window.__mineIv = setInterval(() => {
          if (!inp) return;
          inp.worldObjectTargetId = id;
          if (inpSys && inpSys._m2) inpSys._m2ToolLane = 'beam';
        }, 40);
        return true;
      },
      mineRmbOff() { clearInterval(window.__mineIv); window.__mineIv = null; },
      missileInbound() {
        const list = (sf.state.entityIndex && sf.state.entityIndex.projectiles) || sf.state.entityList || [];
        for (const p of list) {
          if (p.type !== 'projectile' || !p.alive) continue;
          const d = p.data || {};
          if (d.kind === 'missile' && d.targetId === sf.state.playerId) return true;
        }
        return false;
      },
      // Hand-built homing missile inbound on the player — deterministic threat for
      // countermeasure demos (NPC 'occasional' racks are too rare to schedule).
      spawnMissile({ distance = 750, speed = 170 } = {}) {
        const st = sf.state;
        const pl = st.entities.get(st.playerId);
        if (!pl) return null;
        const ang = pl.rot + Math.PI / 2;
        const pos = { x: pl.pos.x + Math.cos(ang) * distance, z: pl.pos.z + Math.sin(ang) * distance };
        const dx = pl.pos.x - pos.x, dz = pl.pos.z - pos.z;
        const len = Math.hypot(dx, dz) || 1;
        const e = (sf.helpers || st.helpers).spawnEntity({
          type: 'projectile',
          pos,
          rot: Math.atan2(dz, dx),
          vel: { x: (dx / len) * speed * 0.4, y: 0, z: (dz / len) * speed * 0.4 },
          radius: 3, mass: 0.1, team: 1, ttl: 20, collides: true,
          data: {
            kind: 'missile', damage: 70,
            damagePacket: { kinetic: 70, sources: ['missile'], statuses: [] },
            targetId: st.playerId, turnRate: 4.5,
            projSpeed: speed, projAccel: 120, armed: true,
          },
        });
        if (e) { spawnedIds.add(e.id); return e.id; }
        return null;
      },
      // Lock the player's gun target onto the nearest live hostile — the same pick
      // a pilot makes through the cursor lock (autoAim needs state.player.targetId).
      aimLockStart() {
        clearInterval(window.__aimIv);
        window.__aimIv = setInterval(() => {
          const st = sf.state;
          const pl = st.player;
          if (!pl) return;
          const p = st.entities.get(st.playerId);
          if (!p || !p.pos) return;
          let best = null, bd = Infinity;
          for (const e of st.entities.values()) {
            if (!e || !e.alive || !e.pos || (e.type !== 'ship' && e.type !== 'drone')) continue;
            if (e.team === 0 || e.team === 2) continue;
            const d = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
            if (d < bd) { bd = d; best = e; }
          }
          pl.targetId = best ? best.id : null;
        }, 120);
        return true;
      },
      aimLockStop() {
        clearInterval(window.__aimIv); window.__aimIv = null;
        const pl = sf.state.player;
        if (pl) pl.targetId = null;
      },
      screenPos(id) {
        const e = sf.state.entities.get(id);
        if (!e || !sf.helpers?.worldToScreen) return null;
        const out = sf.helpers.worldToScreen({ x: e.pos.x, y: e.pos.y || 0, z: e.pos.z });
        return out && { x: out.x, y: out.y };
      },
      removeSpawned() {
        for (const id of spawnedIds) { try { sf.helpers.removeEntity(id); } catch (_) {} }
        spawnedIds.clear();
      },
      spawnedIdsList() { return [...spawnedIds]; },
      giveCargo(commodityId, qty) {
        return import('/src/systems/cargo.js').then((m) => m.addCargo(sf.state, commodityId, qty)).then((r) => ({ ok: true, r }));
      },
      giveCharges(n = 6) {
        const p = sf.state.player;
        p.cargo = p.cargo || { items: {}, capacity: 999 };
        p.cargo.capacity = Math.max(p.cargo.capacity || 0, 999);
        const items = (p.cargo.items = p.cargo.items || {});
        items.cmdty_impulse_charge = (items.cmdty_impulse_charge || 0) + n;
        return items.cmdty_impulse_charge;
      },
      entity(id) {
        const e = sf.state.entities.get(id);
        if (!e) return null;
        return { id: e.id, defId: e.data?.defId, alive: e.alive !== false, hull: e.hull, shield: e.shield, statuses: e.statuses || e.data?.statuses || [], pos: { x: e.pos.x, z: e.pos.z }, vel: e.vel ? { x: e.vel.x, z: e.vel.z } : null };
      },
      // --- evidence ------------------------------------------------------------
      evidenceReset() {
        startListening();
        for (const k of Object.keys(evCounts)) delete evCounts[k];
        for (const k of Object.keys(evWatch)) delete evWatch[k];
        return true;
      },
      evidence() { return { counts: { ...evCounts }, samples: evWatch }; },
      // --- recording -----------------------------------------------------------
      _rec: null,
      recordStart({ fps = 24, videoBitsPerSecond = 2_500_000 } = {}) {
        const canvas = document.getElementById('gl-canvas');
        if (!canvas?.captureStream) return { ok: false, reason: 'no canvas.captureStream' };
        const stream = canvas.captureStream(fps);
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond });
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
        const done = new Promise((res) => { rec.onstop = () => res(new Blob(chunks, { type: 'video/webm' })); });
        api._rec = { rec, done };
        rec.start(250);
        return { ok: true, mime };
      },
      async recordStop() {
        const r = api._rec;
        if (!r) return { ok: false, reason: 'not recording' };
        api._rec = null;
        r.rec.stop();
        const blob = await r.done;
        const buf = await blob.arrayBuffer();
        return { ok: true, size: buf.byteLength, bytes: [...new Uint8Array(buf)] };
      },
      // --- staging -------------------------------------------------------------
      // Move the player to the measured-empty combat-lab corner of Helios Prime and
      // clear ambient bodies so the clip's backdrop is pure stage.
      stage({ zoom = 90 } = {}) {
        const world = sf.registry.get('world');
        if (sf.state.world.currentSectorId !== 'sector_helios_prime') world.enterSector('sector_helios_prime', {});
        const pl = sf.state.entities.get(sf.state.playerId);
        pl.pos.x = -1900; pl.pos.z = -2200;
        pl.vel.x = 0; pl.vel.y = 0; pl.vel.z = 0;
        pl.rot = 0;
        this.camera(zoom);
        // Remove non-player bodies within 600 WU of the stage so nothing wanders into frame.
        const rm = [];
        for (const e of sf.state.entities.values()) {
          if (!e.pos || e.id === sf.state.playerId) continue;
          const d = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
          if (d < 600) rm.push(e.id);
        }
        for (const id of rm) { try { sf.helpers.removeEntity(id); } catch (_) {} }
        return { removed: rm.length };
      },
      watchStart() {
        const st = sf.state;
        const arr = (window.__watch = []);
        let i = 0;
        window.__watchTimer = setInterval(() => {
          const p = st.player || {};
          const inp = st.input || {};
          const m = (inp.actions && inp.actions.massline) || {};
          arr.push({
            i: i++,
            tetherActive: !!(p.tether && p.tether.active),
            remoteActive: !!(p.remoteMassline && p.remoteMassline.active),
            targetId: p.tether && p.tether.targetId,
            phase: m.phase, latch: m.latch, cut: m.cut,
            mode: inp.tetherMode,
            held: inp.tetherHeld,
          });
          if (arr.length > 2000) window.__watchStop();
        }, 40);
      },
      watchStop() { clearInterval(window.__watchTimer); window.__watchTimer = null; return window.__watch; },
      derived() {
        const pl = sf.state.entities.get(sf.state.playerId);
        const d = pl?.data?.derived || pl?.derived || {};
        return {
          hull: d.hull, hullMax: d.hullMax, shield: d.shield, shieldMax: d.shieldMax,
          shieldRegenRate: d.shieldRegenRate, topSpeed: d.maxSpeed, thrust: d.thrust,
          turnRate: d.turnRate, boostMaxSpeed: d.flightModel?.boostMaxSpeed,
          boostMult: d.flightModel?.boostMult, weaponRangeMult: d.weaponRangeMult,
          weaponDmgMult: d.weaponDmgMult, weaponHeatDissipMult: d.weaponHeatDissipMult,
          weaponHeatDissipPct: d.weaponHeatDissipPct,
          radarRangeMult: d.radarRangeMult, radarRange: d.radarRange,
          tetherSpoolMult: d.tetherSpoolMult, tetherReelRateMult: d.tetherReelRateMult,
          masslineHeadId: d.masslineHeadId, magnetRange: d.magnetRange,
          lootMagnetRange: d.lootMagnetRange, swingDrive: d.swingDrive, towFlail: d.towFlail,
          hullBurstKind: d.hullBurstKind, hullBurstRank: d.hullBurstRank,
          jumpDriveTier: d.jumpDriveTier, hullRepairOOC: d.hullRepairOOC,
          droneBayCount: d.droneBayCount, cargoCap: d.cargoCap,
          chaffCount: d.chaffCount, ecmCount: d.ecmCount,
          damageReductionMult: d.damageReductionMult, hiddenCargoPct: d.hiddenCargoPct,
          scannerCloak: d.scannerCloak, ramDamageDealtMult: d.ramDamageDealtMult,
          scannerRadiusMult: d.scannerRadiusMult, pingPersistMult: d.pingPersistMult,
          impulseCharges: d.impulseCharges, chargeCapacity: d.chargeCapacity,
          massLoadFactor: d.massLoadFactor, operationalMass: d.operationalMass,
          miningSlotsFilled: d.miningSlotsFilled, miningSlotsTotal: d.miningSlotsTotal,
        };
      },
      input() {
        const inp = sf.state.input || {};
        return { autoFire: inp.autoFire, tetherMode: inp.tetherMode, fire: inp.fire, mine: inp.mine };
      },
      // The fitted def's own mods object — the flag-value check for fittings that
      // contribute a use-time flag (bio filters, ecology kit) instead of a derived stat.
      // Fittings are stored as defId strings on the active ship; the def table supplies
      // the mods. Returns null when the defId is not fitted at all.
      async modsFor(defId) {
        const p = sf.state && sf.state.player;
        const ship = p && Array.isArray(p.ownedShips) ? p.ownedShips[p.activeShipIndex] : null;
        const fits = ship && Array.isArray(ship.fittings) ? ship.fittings : (p && p.fittings) || [];
        const fitted = fits.some((f) => (typeof f === 'string' ? f : (f && (f.defId || f.id))) === defId);
        if (!fitted) return null;
        const [{ MODULES }, { WEAPONS }] = await Promise.all([
          import('/src/data/modules.js'), import('/src/data/weapons.js')]);
        const def = MODULES.find((d) => d.id === defId) || WEAPONS.find((d) => d.id === defId);
        return (def && def.mods) || (def ? {} : null);
      },
      setAutoFire(onOff) {
        const inp = sf.state.input;
        if (inp && typeof inp.autoFire === 'boolean' && inp.autoFire !== onOff) {
          inp.autoFire = onOff;
          if (!onOff && inp.autoAim) inp.autoAim.targetId = null;
        }
        return inp?.autoFire;
      },
      telemetry() { return sf.telemetry?.combatDiagnostics?.() || sf.telemetry?.() || null; },
      step(frames = 1) { sf.loop?.simStep?.(frames); return true; },
      simulate(ms) { sf.loop?.simulate?.(ms / 1000); return true; },
    };
    window.__showcase = api;
    return true;
  });
}

export async function saveClip(page, outPath, seconds, act) {
  const started = await page.evaluate(() => window.__showcase.recordStart());
  if (!started.ok) throw new Error(`recordStart failed: ${started.reason}`);
  const t0 = Date.now();
  if (act) await act(page);
  const remain = seconds * 1000 - (Date.now() - t0);
  if (remain > 0) await page.waitForTimeout(remain);
  const res = await page.evaluate(() => window.__showcase.recordStop());
  if (!res.ok) throw new Error(`recordStop failed: ${res.reason}`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, Buffer.from(res.bytes));
  return res.size;
}
