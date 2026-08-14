// PQ-017 generic authored World Site presentation controller. This module owns only renderer
// objects attached to verified GLB sockets; it never writes simulation state or authored materials.

import * as THREE from 'three';
import { impairedDutyCycle, worldSiteConditionForStatus } from '../presentation/worldSiteDamageStates.js';

const TAU = Math.PI * 2;
const FULL_A11Y = Object.freeze({ reducedMotion: false, reducedFlash: false });

export function installWorldSitePresentation(root, entity, { THREE_NS = THREE } = {}) {
  const recipe = entity && entity.data && entity.data.worldSitePresentation;
  if (!root || !root.isObject3D || !validRecipe(recipe)) return null;
  const previous = root.userData && root.userData.worldSitePresentationController;
  if (previous && typeof previous.dispose === 'function') previous.dispose();

  const sockets = new Map();
  root.traverse((object) => {
    if (object && object.userData && object.userData.spacefaceSocket && !sockets.has(object.name)) {
      sockets.set(object.name, object);
    }
  });
  const fixtures = [];
  const fixtureById = new Map();
  const missingSockets = [];
  for (const spec of recipe.fixtures) {
    const socket = sockets.get(spec.socketId);
    if (!socket) {
      if (missingSockets.length < 12) missingSockets.push(spec.socketId);
      continue;
    }
    const geometry = fixtureGeometry(spec, THREE_NS);
    if (!geometry) continue;
    const material = new THREE_NS.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false,
      blending: THREE_NS.AdditiveBlending,
      toneMapped: false,
    });
    const mount = new THREE_NS.Group();
    mount.name = `WorldSitePresentation_${spec.id}`;
    mount.userData.worldSitePresentationOwned = true;
    mount.userData.animated = true;
    const mesh = new THREE_NS.Mesh(geometry, material);
    mesh.name = `WorldSiteFixture_${spec.id}`;
    mesh.userData.worldSitePresentationFixtureId = spec.id;
    mesh.renderOrder = 3;
    mount.add(mesh);
    socket.add(mount);
    const fixture = {
      id: spec.id,
      componentId: spec.componentId,
      spec,
      socket,
      mount,
      mesh,
      baseOpacity: spec.opacity,
      pulseRate: 0,
      pulseAmplitude: 0,
      rotateRate: 0,
    };
    fixtures.push(fixture);
    fixtureById.set(spec.id, fixture);
  }
  for (const animation of recipe.animations) {
    const fixture = fixtureById.get(animation.targetId);
    if (!fixture) continue;
    if (animation.kind === 'pulse') {
      fixture.pulseRate = animation.rate;
      fixture.pulseAmplitude = animation.amplitude;
    } else if (animation.kind === 'rotate') {
      fixture.rotateRate = animation.rate;
    }
  }

  let disposed = false;
  const controller = {
    update(liveEntity, simTime, a11y = FULL_A11Y) {
      if (disposed) return;
      const projection = liveEntity && liveEntity.data && liveEntity.data.worldSitePresentation || recipe;
      const statuses = projection && projection.componentStatuses || null;
      const time = Number.isFinite(simTime) ? simTime : 0;
      const reducedMotion = !!a11y.reducedMotion;
      const reducedFlash = !!a11y.reducedFlash;
      for (let i = 0; i < fixtures.length; i += 1) {
        const fixture = fixtures[i];
        // PQ-023 family (c): bind the fixture to its OWN component's status. The previous guard
        // tested key existence against a map projectWorldSitePresentation always fills for every
        // component, so it was vacuous and every fixture rendered identically no matter what had
        // failed. Condition is carried by opacity and scale (both survive greyscale and
        // forced-colors) so damage is never a colour-only signal.
        const status = fixture.componentId && statuses ? statuses[fixture.componentId] : null;
        const condition = worldSiteConditionForStatus(status);
        fixture.mount.visible = true;
        // A damaged fixture must not also idle-pulse as if healthy.
        const impaired = condition.stutter > 0;
        const pulse = !impaired && !reducedMotion && !reducedFlash && fixture.pulseRate > 0
          ? Math.sin(time * fixture.pulseRate * TAU) * fixture.pulseAmplitude
          : 0;
        const duty = impairedDutyCycle(time, condition.stutter, reducedMotion || reducedFlash);
        fixture.mount.scale.setScalar((1 + pulse) * condition.scaleMul);
        const base = reducedFlash
          ? Math.max(0.55, fixture.baseOpacity * 0.82)
          : fixture.baseOpacity * (1 + pulse * 0.38);
        fixture.mesh.material.opacity = base * condition.opacityScale * duty;
        fixture.mount.rotation.y = !reducedMotion && !impaired && fixture.rotateRate > 0
          ? time * fixture.rotateRate
          : 0;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let i = 0; i < fixtures.length; i += 1) {
        const fixture = fixtures[i];
        fixture.socket.remove(fixture.mount);
        fixture.mesh.geometry.dispose();
        fixture.mesh.material.dispose();
      }
      if (root.userData.worldSitePresentationController === controller) {
        delete root.userData.worldSitePresentationController;
        delete root.userData.disposeWorldSitePresentation;
      }
    },
    diagnostics() {
      return {
        installed: fixtures.length,
        missingSockets: [...new Set(missingSockets)],
        disposed,
      };
    },
  };
  root.userData.worldSitePresentationController = controller;
  root.userData.disposeWorldSitePresentation = () => controller.dispose();
  controller.update(entity, 0, FULL_A11Y);
  return controller;
}

function fixtureGeometry(spec, THREE_NS) {
  if (spec.kind === 'status-light') return new THREE_NS.SphereGeometry(spec.radius, 12, 8);
  if (spec.kind === 'ring') return new THREE_NS.TorusGeometry(spec.radius, spec.tube, 8, 24);
  if (spec.kind === 'bar') return new THREE_NS.BoxGeometry(spec.size[0], spec.size[1], spec.size[2]);
  return null;
}

function validRecipe(recipe) {
  return !!recipe && recipe.schemaVersion === 1
    && Array.isArray(recipe.fixtures) && recipe.fixtures.length <= 12
    && Array.isArray(recipe.animations) && recipe.animations.length <= 12;
}

export default installWorldSitePresentation;
