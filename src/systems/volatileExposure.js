// Placeholder for upstream's NXB-008 volatile-exposure system.
// Upstream ef0f3cd99 (SV-3) registered `volatileExposure` in src/core/registry.js
// but the system file itself was never committed there (foreign-hunk carry) —
// the dangling import bricks the bundle and every browser boot. This inert
// module keeps the branch bootable; when upstream lands the real
// src/systems/volatileExposure.js it replaces this file on merge.
export const volatileExposure = {
  id: 'volatileExposure',
  name: 'volatileExposure',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
  },

  destroy() {},

  update() {},
};
