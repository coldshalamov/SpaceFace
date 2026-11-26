import { presentedAnchorXZ, presentedAnchorRot } from '../../render/presentedAnchor.js';
import { getConvoyRaidRuntime } from './runtime.js';
import { createSwitchbackPresentationFrame, writeSwitchbackPresentationFrame,
  createSwitchbackPresentation } from './presentation.js';
import { createSwitchbackInteractions } from './interactions.js';

const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

/**
 * A complete, optional production view owner for the existing VFX frame lane.
 * Creation owns no meshes until a real SWITCHBACK run exists. On scene rebuild,
 * the old resources are retired before the addon is attached to the new scene.
 *
 * Existing owner hooks (Codex applies them to the current tree):
 *   init:    this._switchback = createSwitchbackView({THREE,state:this.state,
 *              bus:this.bus,getDeck:getPromptDeck,toLocalXZ:this._combatBeamLocalizer});
 *   update:  this._switchback.update(); // after prepareFrame, before drawPreparedFrame
 *   destroy: this._switchback.dispose(); this._switchback=null;
 *
 * `getPromptDeck` is the real src/ui/promptDeck.js export. It is injected so the
 * feature's simulation public entry does not load or own the UI framework.
 */
export function createSwitchbackView({ THREE, state, bus, getDeck, toLocalXZ,
  getRuntime = getConvoyRaidRuntime } = {}) {
  if (!state || !THREE || typeof toLocalXZ !== 'function' || typeof getRuntime !== 'function') {
    throw new TypeError('SWITCHBACK view requires state, Three, the render localizer and runtime accessor.');
  }
  const interactions = createSwitchbackInteractions({ bus, getDeck });
  const frame = createSwitchbackPresentationFrame();
  const bodyPool = Array.from({ length: 6 }, () => ({}));
  const escortPool = Array.from({ length: 3 }, () => ({ id: '', x: 0, z: 0 }));
  const recoveryPool = Array.from({ length: 3 }, () => ({ ax: 0, az: 0, bx: 0, bz: 0 }));
  const presentedTrain = { targetId: '', bodies: [], couplers: [], route: null };
  const escortBodies = [];
  const recoveryLinks = [];
  const projectionOptions = { simTime: 0, visible: false, escortBodies, recoveryLinks };
  const player = { id: '', x: 0, z: 0, vx: 0, vz: 0, hp: 0, alive: false };
  const interactionInput = { raid: null, train: null, player, simTime: 0, mode: '' };
  let renderer = null, attachedScene = null, disposed = false, renderedRun = null;

  function entityFor(record, binding) {
    if (!binding || binding.entityId == null) return null;
    const entity = state.entities?.get(binding.entityId), tag = entity?.data?.convoyRaid;
    if (tag?.runId !== record.id || tag?.bodyId !== binding.bodyId
      || (binding.generation != null && entity.occupantGeneration !== binding.generation)) return null;
    return entity;
  }
  function retireRenderer() {
    renderer?.dispose(); renderer = null; attachedScene = null; renderedRun = null;
  }
  function hide() {
    frame.visible = frame.active = false;
    renderer?.update(frame, state.settings);
    interactionInput.raid = null; interactionInput.train = null;
    interactionInput.simTime = finite(state.simTime); interactionInput.mode = state.mode;
    interactions.update(interactionInput);
  }

  return {
    update() {
      if (disposed) return false;
      const scene = state.render?.scene;
      if (scene !== attachedScene && renderer) retireRenderer();
      // The worker lane mirrors authoritative plain state but has no main-thread runtime owner.
      const record = getRuntime(state)?.snapshot() || state.convoyRaid?.active;
      if (!record?.raid || !record.train || !scene || state.mode !== 'flight') { hide(); return false; }
      if (!renderer) {
        renderer = createSwitchbackPresentation(THREE, scene, { toLocalXZ }); attachedScene = scene;
      }
      const count = Math.min(6, record.train.bodies.length);
      const alpha = Math.max(0, Math.min(1, finite(state.render?.interpolationAlpha, 1)));
      presentedTrain.targetId = record.train.targetId;
      presentedTrain.couplers = record.train.couplers;
      presentedTrain.route = record.train.route;
      presentedTrain.bodies.length = count;
      for (let i = 0; i < count; i++) {
        const body = record.train.bodies[i], pose = bodyPool[i];
        Object.assign(pose, body);
        const entity = entityFor(record, record.bindings[body.id]);
        if (entity && entity.alive !== false && entity.hull > 0 && !body.lost) {
          // Use the game's exact snapshot interpolation helpers, so anchors
          // stay welded to the actual drawn hull at high speed and on rebases.
          presentedAnchorXZ(entity, alpha, pose);
          pose.angle = presentedAnchorRot(entity, alpha);
          pose.vx = finite(entity.vel?.x); pose.vz = finite(entity.vel?.z);
        } else { pose.lost = true; pose.hp = 0; }
        presentedTrain.bodies[i] = pose;
      }
      escortBodies.length = 0;
      for (let i = 0; i < Math.min(3, record.escortBindings.length); i++) {
        const binding = record.escortBindings[i], entity = entityFor(record, binding);
        if (!entity || entity.alive === false || !(entity.hull > 0)) continue;
        const pose = escortPool[escortBodies.length];
        pose.id = binding.bodyId; presentedAnchorXZ(entity, alpha, pose); escortBodies.push(pose);
      }
      recoveryLinks.length = 0;
      for (let i = 0; i < escortBodies.length; i++) {
        const escort = escortBodies[i], towing = record.recovery?.[escort.id];
        if (!towing) continue;
        for (let j = 0; j < presentedTrain.bodies.length; j++) {
          const body = presentedTrain.bodies[j];
          if (body.id !== towing.bodyId || body.lost) continue;
          const link = recoveryPool[recoveryLinks.length];
          link.ax = escort.x; link.az = escort.z; link.bx = body.x; link.bz = body.z;
          recoveryLinks.push(link); break;
        }
      }
      projectionOptions.simTime = finite(state.simTime);
      projectionOptions.visible = true;
      writeSwitchbackPresentationFrame(frame, record.raid, presentedTrain, projectionOptions);
      renderer.update(frame, state.settings);
      renderedRun = record.id;

      const entity = state.entities?.get(state.playerId);
      player.id = 'player'; player.x = finite(entity?.pos?.x); player.z = finite(entity?.pos?.z);
      player.vx = finite(entity?.vel?.x); player.vz = finite(entity?.vel?.z);
      player.hp = finite(entity?.hull); player.alive = !!entity && entity.alive !== false;
      interactionInput.raid = record.raid; interactionInput.train = record.train;
      interactionInput.simTime = finite(state.simTime);
      interactionInput.mode = state.timeScale === 0 ? 'paused' : state.mode;
      interactions.update(interactionInput);
      return true;
    },
    /** Existing HUD/receipt owner may read the same accessible, non-color facts. */
    readout() { return frame.visible ? frame.readout : null; },
    inspect() { return { disposed, runId: renderedRun, sceneAttached: !!attachedScene,
      ...(renderer?.inspect() || { physicalSegments: 0, cueSegments: 0 }), interaction: interactions.inspect() }; },
    dispose() {
      if (disposed) return;
      disposed = true; interactions.dispose(); retireRenderer();
      frame.visible = frame.active = false;
    },
  };
}
