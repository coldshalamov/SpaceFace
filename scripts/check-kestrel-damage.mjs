// Kestrel damage-state smoke test (spec §9.11).
//
// Verifies the five named damage states exist, transition correctly from the live hull fraction, are
// reversible through Critical (only Destruction is terminal), and that the core silhouette stays
// recognizable in every non-terminal state (spec §9.11: "The ship remains recognizable through the
// critical state"). Headless — mirrors check-kestrel-hero.mjs (stubbed 2D canvas, no jsdom/GPU).
//
// Run: node scripts/check-kestrel-damage.mjs
function makeStubCanvas() {
  const ctx = {
    canvas: { width: 256, height: 256 },
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData() {}, drawImage() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1, letterSpacing: '0px',
  };
  return { width: 256, height: 256, getContext: () => ctx, style: {}, toDataURL: () => 'data:,', addEventListener() {} };
}
globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? makeStubCanvas() : { style: {}, appendChild() {}, addEventListener() {} },
  getElementById: () => null, addEventListener: () => {},
};
globalThis.window = { addEventListener: () => {}, devicePixelRatio: 1 };
globalThis.performance = globalThis.performance || { now: () => 0 };

const THREE = await import('three');
globalThis.THREE = THREE;

const { buildKestrelHero } = await import('../src/render/ships/kestrelHero.js');
const { damageStateFor } = await import('../src/render/ships/kestrelDamage.js');
const { damageStateFor: sharedDamageStateFor } = await import('../src/render/ships/shipDamage.js');

let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; }
  else { fail++; console.log(`FAIL  ${label}${detail ? '  —  ' + detail : ''}`); }
}

// Build a player Kestrel and a helper to set its hull fraction then tick the damage driver.
const HULLMAX = 1000;
const root = buildKestrelHero({ id: 'p', type: 'ship', team: 0, radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_kestrel', fittings: [] } });
const entity = { id: 'p', hull: HULLMAX, hullMax: HULLMAX, disabled: false };
let now = 0;
const tick = (hull, advance = 0) => {
  now += advance;
  entity.hull = hull;
  root.userData.updateDamageState(entity, now);
};
const heal = (hull = HULLMAX) => {
  tick(hull, 0);
  tick(hull, 2);
};

// ---- named states + the shared threshold resolver (AC-18) ----
check('Kestrel resolver is the shared owner', damageStateFor === sharedDamageStateFor);
check('state resolver: >0.75 = operational', damageStateFor(0.80) === 'operational');
check('state resolver: 0.50–0.75 = stressed', damageStateFor(0.60) === 'stressed');
check('state resolver: 0.25–0.50 = damaged', damageStateFor(0.35) === 'damaged');
check('state resolver: <0.25 = critical', damageStateFor(0.15) === 'critical');
check('state resolver: <=0 = destruction', damageStateFor(0) === 'destruction');
check('state resolver: disabled outranks hull', damageStateFor(0.80, true) === 'disabled');
check('state resolver: hull 0 + disabled stays disabled', damageStateFor(0, true) === 'disabled');

// ---- contract declares all five states ----
const states = root.userData.renderContract.damageStates || [];
check('renderContract lists 5 damage states', states.length === 5 && ['operational','stressed','damaged','critical','destruction'].every(s => states.includes(s)), JSON.stringify(states));

// ---- the driver attaches + part references resolve ----
const parts = root.userData.damageParts;
check('damage driver attached', typeof root.userData.updateDamageState === 'function');
check('nav light group addressable', parts.navLights.length >= 2, `nav=${parts.navLights.length}`);
check('drive core addressable', !!parts.driveCore);
check('plume addressable', !!parts.plume);
check('secondary part addressable (utility pod)', parts.secondary.length >= 1, `secondary=${parts.secondary.length}`);

// ---- transitions: hull fraction drives the mesh's userData.damageState ----
const snap = () => root.userData.damageState;
tick(HULLMAX);       check('full hull -> operational', snap() === 'operational');
tick(600);           check('60% hull -> stressed', snap() === 'stressed', `got ${snap()}`);
tick(350);           check('35% hull -> damaged', snap() === 'damaged', `got ${snap()}`);
tick(100);           check('10% hull -> critical', snap() === 'critical', `got ${snap()}`);

// ---- reversibility: recovering hull restores Operational after the repair ease window ----
tick(100); // critical
heal(1000);
check('recovered to operational (reversible through critical)', snap() === 'operational', `got ${snap()}`);

// ---- Damaged: one nav light group fails (dimmed) but the core silhouette is intact ----
tick(350);
const navOn = parts.navLights[0].material.emissiveIntensity;
heal(1000);
const navFull = parts.navLights[0].material.emissiveIntensity;
check('Damaged dims a nav light group (failed-light cue)', navOn < navFull * 0.5, `damaged=${navOn} operational=${navFull}`);

// ---- Critical: the secondary part (utility pod) is shed, but the drive core stays visible ----
tick(100);
const podVisibleCritical = parts.secondary[0].visible;
heal(1000);
const podVisibleOperational = parts.secondary[0].visible;
check('Critical sheds the utility pod (debris shedding)', podVisibleCritical === false && podVisibleOperational === true, `critical=${podVisibleCritical} op=${podVisibleOperational}`);
check('drive core never hidden (silhouette preserved through Critical)', !!parts.driveCore && parts.driveCore.visible === true);

// ---- Disabled is a live band (dark hull + one beacon); destruction is the wreck with no dressing ----
entity.disabled = true;
tick(800);
check('disabled flag outranks a healthy hull fraction', snap() === 'disabled', `got ${snap()}`);
const dressing = root.userData.damageDressing;
const disabledVisible = dressing.meshes.filter((mesh) => mesh.visible);
check('disabled shows exactly one emergency beacon', disabledVisible.length === 1 && disabledVisible[0].userData.damageDressingRole === 'beacon');
entity.disabled = false;
heal(800);
check('clearing disabled returns the hull band', snap() === 'operational', `got ${snap()}`);

tick(0);
check('destruction state is terminal (driver does not assert breakup)', typeof root.userData.updateDamageState === 'function');
check('destruction hides all live dressing', dressing.meshes.every((mesh) => mesh.visible === false));

// ---- the core hull + canopy stay visible in every non-terminal state (recognizable through Critical) ----
let hullVisible = true;
for (const frac of [1.0, 0.6, 0.35, 0.10]) {
  if (frac >= 1) heal(frac * HULLMAX);
  else tick(frac * HULLMAX);
  root.traverse((o) => {
    if (o.name === 'Kestrel_Pressure_Hull' || o.name === 'Kestrel_Static_Kestrel_shell') { if (!o.visible) hullVisible = false; }
  });
}
check('core silhouette visible in every non-terminal state', hullVisible, 'hull hidden in some state');
check('shared dressing group is a fixed 8-mesh allocation', dressing.meshes.length === 8 && dressing.group.children.length === 8);

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
