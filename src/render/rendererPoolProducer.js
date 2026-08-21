import { stampOpeningSubmissionPackage } from './openingSubmissionPlan.js';

/** Producer-owned recipe identity for the renderer's generated contact-shadow draw pool. */
export function stampContactShadowPoolPackage(mesh, capacity) {
  return stampOpeningSubmissionPackage(mesh, {
    schema: 'spaceface.contactShadowPoolProducer.v1',
    producer: 'contact-shadow-pool',
    geometry: 'circle-20',
    texture: 'radial-canvas-64',
    capacity,
  }, { producer: 'contact-shadow-pool', assetId: 'contact-shadow-pool' });
}

/** Producer-owned recipe identity for generated shield/nav auxiliary draw pools. */
export function stampShipAuxPoolPackage(mesh, kind, capacity) {
  const exactKind = String(kind || 'unknown');
  return stampOpeningSubmissionPackage(mesh, {
    schema: 'spaceface.shipAuxPoolProducer.v1',
    producer: `ship-aux-${exactKind}-pool`,
    geometry: exactKind === 'shield' ? 'shield-bubble-instanced' : 'nav-light-instanced',
    capacity,
  }, {
    producer: `ship-aux-${exactKind}-pool`,
    assetId: `ship-aux-${exactKind}-pool`,
  });
}
