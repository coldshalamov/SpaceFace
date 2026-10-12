// Browser-safe Gallery entry on the already running production sim. Never imports proof/session boot.
import { createPhysicalVenue } from './venue.js';
import { getScenario, SCENARIOS } from './catalog.js';
import { validateScenario } from './validate.js';
import { judgeGallery, noteImpact, signatureOf } from './judge.js';
import { createLedger, normalizeLedger, recordScore, scoreRun } from './score.js';
const CHALLENGES = SCENARIOS.map(({ id, title, family, inference }) => ({ id, title, family, inference }));

export function createLiveGallery(ctx) {
  const { state, bus } = ctx;
  let venue = null, scenario = null, views = [], linesPending = false, spawnTick = 0;
  state.orbitalGalleryLedger = normalizeLedger(state.orbitalGalleryLedger);
  const api = {
    start(scenarioId = SCENARIOS[0].id) {
      const next = getScenario(scenarioId);
      if (!next) return { ok: false, reason: 'unknown-challenge' };
      const issues = validateScenario(next);
      if (issues.length) return { ok: false, reason: issues.join('; ') };
      if (state.mode !== 'flight') return { ok: false, reason: 'launch-flight-first' };
      ctx.registry?.get('kineticLeague')?.leave();
      api.leave();
      scenario = next;
      views = [{ id: 'pilot', role: 'pilot', ...next.player, alive: true },
        ...next.bodies.map(body => ({ ...body, id: body.role, alive: true,
          hardware: body.kind === 'anchor' || body.kind === 'bumper' }))];
      venue = createPhysicalVenue(ctx, { id: 'orbital-gallery', bodies: views,
        shipAt: next.player, fields: next.fields || [], markers: next.pockets });
      if (!venue.ok) { const result = venue; venue = null; return result; }
      const offset = volume => ({ ...volume, x: volume.x + venue.center.x, z: volume.z + venue.center.z });
      const roles = Object.fromEntries(venue.ids);
      state.orbitalGallery = {
        source: 'live', phase: 'live', scenarioId: next.id, family: next.family,
        inference: next.inference, limitTicks: next.limitTicks, roles,
        pockets: next.pockets.map(offset), hazards: (next.hazards || []).map(offset),
        spoils: next.spoils || [], spoiled: {},
        playStartTick: state.tick, boostTicks: 0, brakeTicks: 0, cuts: 0, contacts: 0,
        playerContactRoles: {}, approachSide: null, styleChip: state.rng(), result: null,
      };
      spawnTick = state.tick; linesPending = true;
      api.publish();
      bus?.emit('orbital-gallery:started', api.status());
      return { ok: true, scenarioId: next.id };
    },
    retry() { return scenario ? api.start(scenario.id) : { ok: false, reason: 'no-challenge' }; },
    next() {
      const index = scenario ? SCENARIOS.findIndex(row => row.id === scenario.id) : -1;
      return api.start(SCENARIOS[(index + 1) % SCENARIOS.length].id);
    },
    leave() {
      venue?.close(); venue = null;
      if (state.orbitalGallery?.source === 'live') delete state.orbitalGallery;
      if (state.physicsVenuePublic?.kind === 'gallery') {
        state.physicsVenuePublic = { kind: 'gallery', active: false, ledger: state.orbitalGalleryLedger };
      }
    },
    impact(payload) { if (venue) noteImpact(state, payload); },
    cut(payload) {
      const gallery = state.orbitalGallery;
      if (venue && gallery?.phase === 'live' && payload?.actorId === state.playerId
          && venue.owned.has(payload.targetId)
          && ['cut', 'pilot', 'throw_release', 'action_cut', 'tether_cut'].includes(payload.reason)) {
        gallery.cuts += 1;
      }
    },
    update(dt) {
      const gallery = state.orbitalGallery;
      if (!venue || gallery?.source !== 'live' || gallery.phase !== 'live') return;
      if (state.mode !== 'flight') return;
      if (linesPending && state.tick > spawnTick) {
        linesPending = false;
        for (const line of scenario.lines || []) {
          const owner = state.entities.get(gallery.roles[line.owner]);
          const target = state.entities.get(gallery.roles[line.target]);
          const made = venue.kernel.attachments.create({ defId: line.defId,
            ownerId: owner.id, targetId: target.id, restLength: line.restLength,
            sourceWorld: { ...owner.pos, y: 0 }, targetWorld: { ...target.pos, y: 0 } });
          if (!made.ok) {
            gallery.result = { won: false, reason: `line:${made.reason}`, tick: state.tick };
            gallery.phase = 'settled';
          }
        }
      }
      const input = state.input || {};
      if (input.boost) gallery.boostTicks += 1;
      if (input.brake || input.actions?.brake) gallery.brakeTicks += 1;
      // Judge the last completed Rapier solve. Existing actions owns the one Massline step.
      const result = judgeGallery(state);
      if (result && !result.scored) {
        result.score = scoreRun({ winTick: result.won ? result.tick - gallery.playStartTick : null,
          limitTicks: gallery.limitTicks, boostTicks: gallery.boostTicks,
          contacts: gallery.contacts, cuts: gallery.cuts, styleChip: gallery.styleChip });
        result.signature = signatureOf(gallery, result); result.scored = true;
        recordScore(state.orbitalGalleryLedger, scenario.id, result.score);
        bus?.emit('orbital-gallery:finished', api.status());
      }
      if (gallery.phase === 'live') { venue.read(views); venue.drive(views, dt); }
      api.publish();
    },
    status() {
      const gallery = state.orbitalGallery;
      if (!venue || gallery?.source !== 'live') return { active: false, challenges: CHALLENGES };
      return { active: true, id: scenario.id, title: scenario.title, phase: gallery.phase,
        instruction: scenario.inference, remainingSeconds: Math.max(0,
          (gallery.limitTicks - (state.tick - gallery.playStartTick)) / 60),
        result: gallery.result, pockets: gallery.pockets, roles: gallery.roles,
        best: state.orbitalGalleryLedger.best[scenario.id] || null };
    },
    publish() {
      const status = api.status();
      state.physicsVenuePublic = { kind: 'gallery', ...status, ledger: state.orbitalGalleryLedger };
    },
    serialize() { return normalizeLedger(state.orbitalGalleryLedger); },
    deserialize(raw) { api.leave(); state.orbitalGalleryLedger = normalizeLedger(raw); },
    newGame() { api.leave(); state.orbitalGalleryLedger = createLedger(); },
  };
  return api;
}
