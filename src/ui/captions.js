/**
 * PQ-165.01 — captions for every voiced bark and optional audio cues.
 * Presentation only. When accessibility.captions is off, records still exist
 * but must not be shown.
 */
import { BARKS, BARK_FACTIONS, BARK_SITUATIONS, barkFor } from '../data/barks.js';
import { enumerateBarkPipeline, resolveBarkVoice } from '../audio/barkVoice.js';
import { masslineInstrumentCaption, resolveMasslineInstrument } from '../audio/masslineInstrument.js';

export const CAPTIONS_SEED = 16501;

// `text` is a recognized localization field. The extractor does not read bare values,
// and it does not scan src/audio, so these rows are the inventory source for the
// accessibility cues and for MASSLINE_CAPTIONS.
export const ACCESSIBILITY_CAPTION_COPY = Object.freeze({
  well: Object.freeze({ text: 'Gravity well' }),
  repulsor: Object.freeze({ text: 'Repulsor deployed' }),
  cone: Object.freeze({ text: 'Cone deployed' }),
  skim: Object.freeze({ text: 'Skim sheet deployed' }),
  seed: Object.freeze({ text: 'Seed deployed' }),
  taut: Object.freeze({ text: 'Line taut' }),
  telegraph: Object.freeze({ text: 'Incoming telegraph' }),
});

export const MASSLINE_CAPTION_COPY = Object.freeze({
  attach: Object.freeze({ text: 'Massline attached.' }),
  strain: Object.freeze({ text: 'Massline strain.' }),
  reel: Object.freeze({ text: 'Massline reel.' }),
  release: Object.freeze({ text: 'Massline release.' }),
  break: Object.freeze({ text: 'Massline break.' }),
  bridle: Object.freeze({ text: 'Twin bridle chord.' }),
});

export const AUDIO_CUE_CAPTIONS = Object.freeze({
  well: ACCESSIBILITY_CAPTION_COPY.well.text,
  repulsor: ACCESSIBILITY_CAPTION_COPY.repulsor.text,
  cone: ACCESSIBILITY_CAPTION_COPY.cone.text,
  skim: ACCESSIBILITY_CAPTION_COPY.skim.text,
  seed: ACCESSIBILITY_CAPTION_COPY.seed.text,
  taut: ACCESSIBILITY_CAPTION_COPY.taut.text,
  tetherTaut: ACCESSIBILITY_CAPTION_COPY.taut.text,
  telegraph: ACCESSIBILITY_CAPTION_COPY.telegraph.text,
});

export function localizableCaptionMessages() {
  const out = [];
  for (const row of Object.values(ACCESSIBILITY_CAPTION_COPY)) out.push(row.text);
  for (const row of Object.values(MASSLINE_CAPTION_COPY)) out.push(row.text);
  return out;
}

export const ACCESSIBILITY_AUDIO_CUE_TABLE = Object.freeze({
  well: Object.freeze({
    id: 'a11y.well', kind: 'well', recipeId: 'sfx_field_deploy_well', caption: AUDIO_CUE_CAPTIONS.well,
  }),
  repulsor: Object.freeze({
    id: 'a11y.repulsor', kind: 'repulsor', recipeId: 'sfx_field_deploy_repulsor', caption: AUDIO_CUE_CAPTIONS.repulsor,
  }),
  cone: Object.freeze({
    id: 'a11y.cone', kind: 'cone', recipeId: 'sfx_field_deploy_cone', caption: AUDIO_CUE_CAPTIONS.cone,
  }),
  skim: Object.freeze({
    id: 'a11y.skim', kind: 'skim', recipeId: 'sfx_field_deploy_skim', caption: AUDIO_CUE_CAPTIONS.skim,
  }),
  seed: Object.freeze({
    id: 'a11y.seed', kind: 'seed', recipeId: 'sfx_field_deploy_seed', caption: AUDIO_CUE_CAPTIONS.seed,
  }),
  taut: Object.freeze({
    id: 'a11y.tether_taut', kind: 'taut', recipeId: 'sfx_doctrine_tether_spool', caption: AUDIO_CUE_CAPTIONS.taut,
  }),
  telegraph: Object.freeze({
    id: 'a11y.telegraph', kind: 'telegraph', recipeId: 'sfx_encounter_escalation', caption: AUDIO_CUE_CAPTIONS.telegraph,
  }),
});

function audioCuesOn(flagOrSettings) {
  if (typeof flagOrSettings === 'boolean') return flagOrSettings;
  if (!flagOrSettings) return true;
  const ac = flagOrSettings.accessibility || flagOrSettings;
  return ac.audioCues !== false;
}

export function captionRecordForBarkLine(text, extra = {}) {
  return {
    text: String(text || ''),
    channel: 'bark',
    hidden: extra.captions === false,
    ...extra,
  };
}

export function captionRecordsForAllBarkForLines() {
  const records = [];
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    if (!pack) continue;
    for (const situation of BARK_SITUATIONS) {
      const lines = pack[situation] || [];
      for (let i = 0; i < lines.length; i++) {
        const text = barkFor(factionId, situation, i);
        records.push(captionRecordForBarkLine(text, { factionId, situation, index: i }));
      }
    }
  }
  return records;
}

export function captionForBark(factionId, situation, rng) {
  const line = barkFor(factionId, situation, rng);
  const spoken = resolveBarkVoice({ factionId, situation, line });
  return {
    text: spoken.caption || line,
    channel: 'bark',
    factionId,
    situation,
    registerId: spoken.registerId,
  };
}

export function everyVoicedBarkCaptioned() {
  const fromBarkFor = captionRecordsForAllBarkForLines();
  if (!fromBarkFor.length || fromBarkFor.some((row) => !row.text)) return false;
  const rows = enumerateBarkPipeline();
  return rows.length > 0 && rows.every((row) => typeof row.caption === 'string' && row.caption.length > 0);
}

export function resolveAccessibilityCue(kind, flagOrSettings) {
  if (!audioCuesOn(flagOrSettings)) return null;
  const key = kind === 'tetherTaut' ? 'taut' : kind;
  return ACCESSIBILITY_AUDIO_CUE_TABLE[key] || null;
}

/**
 * Clock hour for the position that pans a cue. Same ship-local axes as
 * resolvePlayerDamageAudioSignature: nose is (cos rot, sin rot), positive pan is right.
 * 12 is ahead. A missing pose, or a source on the listener, has no direction.
 */
export function clockFromPanPosition(position, listener) {
  if (!position || !listener) return null;
  const lx = Number(listener.x);
  const lz = Number(listener.z);
  const sx = Number(position.x);
  const sz = Number(position.z);
  if (![lx, lz, sx, sz].every(Number.isFinite)) return null;
  const dx = sx - lx;
  const dz = sz - lz;
  const len = Math.hypot(dx, dz);
  if (!(len > 1e-6)) return null;
  const rot = Number(listener.rot) || 0;
  const forward = (dx * Math.cos(rot) + dz * Math.sin(rot)) / len;
  const right = (dx * -Math.sin(rot) + dz * Math.cos(rot)) / len;
  const degrees = (Math.atan2(right, forward) * 180 / Math.PI + 360) % 360;
  return Math.round(degrees / 30) % 12 || 12;
}

function withClockCaption(text, clock) {
  if (!clock || !text) return text;
  const base = String(text).replace(/[.\s]+$/, '');
  return `${base}, ${clock} o'clock.`;
}

export function audioCueCaption(kind, audioCuesFlag, place) {
  const cue = resolveAccessibilityCue(kind, audioCuesFlag);
  if (!cue) return null;
  const clock = place ? clockFromPanPosition(place.position, place.listener) : null;
  const text = clock ? withClockCaption(cue.caption, clock) : cue.caption;
  return clock
    ? { text, channel: 'cue', kind: cue.kind, clock }
    : { text, channel: 'cue', kind: cue.kind };
}

export function captionMasslineEvent(eventName, payload, captionsOn) {
  const voice = resolveMasslineInstrument({ event: eventName, payload });
  if (!voice) return null;
  const text = voice.caption || masslineInstrumentCaption(voice.event);
  if (captionsOn === false) return { text, hidden: true, channel: 'massline' };
  return { text, hidden: false, channel: 'massline' };
}

const UI_BLIP_IDS = new Set([
  'sfx_ui_open', 'sfx_ui_back', 'sfx_ui_tab', 'sfx_ui_confirm', 'sfx_ui_error', 'sfx_ui_hover',
]);

const EXPLICIT_RECIPE_CAPTIONS = Object.freeze({
  sfx_refusal_empty: Object.freeze({ text: 'No ammunition.', urgency: 'high', event: 'refusal.ammo' }),
  sfx_refusal_target: Object.freeze({ text: 'No valid target.', urgency: 'high', event: 'refusal.target' }),
  sfx_massline_deny: Object.freeze({ text: 'Action refused.', urgency: 'high', event: 'refusal' }),
  sfx_fuel_reserve: Object.freeze({ text: 'Fuel reserve.', urgency: 'warn', event: 'fuel.reserve' }),
  sfx_fuel_empty: Object.freeze({ text: 'Fuel empty.', urgency: 'high', event: 'fuel.empty' }),
  sfx_work_motor: Object.freeze({ text: 'Machine working.', urgency: 'normal', event: 'work.running' }),
  sfx_work_jam: Object.freeze({ text: 'Machine jammed.', urgency: 'warn', event: 'work.jam' }),
  sfx_anomaly_swell: Object.freeze({ text: 'Anomaly evidence.', urgency: 'normal', event: 'anomaly.evidence' }),
  sfx_kill_sine: Object.freeze({ text: 'Light kill.', urgency: 'high', event: 'kill.light' }),
  sfx_kill_noise: Object.freeze({ text: 'Heavy kill.', urgency: 'high', event: 'kill.heavy' }),
  'sfx.killSmall': Object.freeze({ text: 'Kill.', urgency: 'high', event: 'kill' }),
  sfx_kill_confirm: Object.freeze({ text: 'Kill confirmed.', urgency: 'high', event: 'kill.confirm' }),
  'sfx.killConfirmed': Object.freeze({ text: 'Kill confirmed.', urgency: 'high', event: 'kill.confirm' }),
  'sfx.killCapital': Object.freeze({ text: 'Capital destroyed.', urgency: 'high', event: 'kill.capital' }),
  sfx_massline_release: Object.freeze({ text: 'The line lets go.', urgency: 'normal', event: 'massline.release' }),
  'sfx.tetherSnap': Object.freeze({ text: 'The line snaps.', urgency: 'high', event: 'massline.break' }),
  sfx_firsthour_coldopen: Object.freeze({ text: 'The shift begins.', urgency: 'normal', event: 'onboarding.open' }),
  sfx_moment_stinger: Object.freeze({ text: 'A moment lands.', urgency: 'normal', event: 'onboarding.moment' }),
  sfx_accel_transition: Object.freeze({ text: 'Thrusters come up.', urgency: 'normal', event: 'flight.thrust' }),
  sfx_engine_thrust: Object.freeze({ text: 'Thrusters burning.', urgency: 'normal', event: 'flight.thrust' }),
  sfx_engine_boost: Object.freeze({ text: 'Boost engaged.', urgency: 'normal', event: 'flight.boost' }),
  sfx_boost_whoosh: Object.freeze({ text: 'Boost kick.', urgency: 'normal', event: 'flight.boost' }),
  sfx_brake_bite: Object.freeze({ text: 'Brakes bite.', urgency: 'warn', event: 'flight.brake' }),
  sfx_rcs_hiss: Object.freeze({ text: 'Attitude jets hiss.', urgency: 'normal', event: 'flight.rcs' }),
  sfx_mining_scan_pulse: Object.freeze({ text: 'Scanner pulse.', urgency: 'normal', event: 'mining.scan' }),
  sfx_mining_beam: Object.freeze({ text: 'Mining beam on.', urgency: 'normal', event: 'mining.beam' }),
  sfx_mining_impact: Object.freeze({ text: 'The rock chips.', urgency: 'normal', event: 'mining.impact' }),
  sfx_mining_cutter_lock: Object.freeze({ text: 'Beam locked on the seam.', urgency: 'normal', event: 'mining.lock' }),
  sfx_wpn_pulse_laser: Object.freeze({ text: 'Pulse laser fires.', urgency: 'high', event: 'weapon.pulse' }),
  sfx_bark_radio: Object.freeze({ text: 'The instructor speaks.', urgency: 'speech', event: 'comms.instructor' }),
  sfx_comms_key_click: Object.freeze({ text: 'Radio keys open.', urgency: 'speech', event: 'comms.key' }),
  sfx_comms_squelch_tail: Object.freeze({ text: 'Radio closes.', urgency: 'speech', event: 'comms.squelch' }),
  sfx_squelch_story: Object.freeze({ text: 'Story channel opens.', urgency: 'speech', event: 'comms.story' }),
  sfx_wanted_alert: Object.freeze({ text: 'You are wanted.', urgency: 'high', event: 'heat.wanted' }),
  sfx_wanted_clear: Object.freeze({ text: 'The warrant clears.', urgency: 'normal', event: 'heat.clear' }),
  'sfx.shieldBreak': Object.freeze({ text: 'Shields down.', urgency: 'high', event: 'shield.break' }),
  sfx_shield_blowout_discharge: Object.freeze({ text: 'Shields blow out.', urgency: 'high', event: 'shield.blowout' }),
  sfx_reactor_overload: Object.freeze({ text: 'The reactor runs away.', urgency: 'high', event: 'kill.overload' }),
  'sfx.tetherLatch': Object.freeze({ text: 'Massline attached.', urgency: 'normal', event: 'massline.attach' }),
  sfx_tether_latch_lock: Object.freeze({ text: 'The latch locks.', urgency: 'normal', event: 'massline.latch' }),
  sfx_tether_strain_creak: Object.freeze({ text: 'The line is straining.', urgency: 'warn', event: 'massline.strain' }),
  sfx_massline_reel_whine: Object.freeze({ text: 'The winch reels in.', urgency: 'normal', event: 'massline.reel' }),
  sfx_tether_crack: Object.freeze({ text: 'The cable cracks.', urgency: 'high', event: 'massline.crack' }),
  sfx_tether_twang: Object.freeze({ text: 'The line cuts free.', urgency: 'high', event: 'massline.cut' }),
  sfx_massline_throw: Object.freeze({ text: 'The throw leaves the hand.', urgency: 'normal', event: 'massline.throw' }),
  sfx_dock_clunk: Object.freeze({ text: 'Docking clamp seats.', urgency: 'normal', event: 'dock.clamp' }),
  sfx_undock_release: Object.freeze({ text: 'Leaving the dock.', urgency: 'normal', event: 'dock.undock' }),
  sfx_dock_capture: Object.freeze({ text: 'The capture lane holds.', urgency: 'normal', event: 'dock.capture' }),
  sfx_station_hum: Object.freeze({ text: 'The station hums.', urgency: 'normal', event: 'dock.hum' }),
  sfx_field_deploy_well: Object.freeze({ text: 'Gravity well deploys.', urgency: 'normal', event: 'field.well' }),
  sfx_field_deploy_repulsor: Object.freeze({ text: 'Repulsor deploys.', urgency: 'normal', event: 'field.repulsor' }),
  sfx_field_deploy_cone: Object.freeze({ text: 'Cone deploys.', urgency: 'normal', event: 'field.cone' }),
  sfx_encounter_escalation: Object.freeze({ text: 'Incoming telegraph.', urgency: 'high', event: 'encounter.telegraph' }),
  sfx_cash_register: Object.freeze({ text: 'Credits received.', urgency: 'normal', event: 'money.register' }),
  sfx_mission_accept: Object.freeze({ text: 'Mission accepted.', urgency: 'normal', event: 'mission.accept' }),
  sfx_mission_complete: Object.freeze({ text: 'Mission complete.', urgency: 'normal', event: 'mission.complete' }),
  'sfx.cruiseEngaged': Object.freeze({ text: 'Cruise engaged.', urgency: 'normal', event: 'cruise' }),
  sfx_field_loop_well: Object.freeze({ text: 'Gravity well holding.', urgency: 'normal', event: 'field.well' }),
  sfx_field_loop_repulsor: Object.freeze({ text: 'Repulsor holding.', urgency: 'normal', event: 'field.repulsor' }),
  sfx_field_loop_cone: Object.freeze({ text: 'Cone holding.', urgency: 'normal', event: 'field.cone' }),
});

export function isUiBlipRecipe(recipeId) {
  return UI_BLIP_IDS.has(String(recipeId || ''));
}

function familyCaption(recipeId, recipe) {
  const family = (recipe && recipe.category) || 'cue';
  const words = String(recipeId || '')
    .replace(/^sfx[._]/, '')
    .replace(/[._]/g, ' ')
    .trim();
  const text = words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}.` : 'Cue.';
  const urgency = family === 'explosion' || family === 'weapon' ? 'high'
    : family === 'comms' ? 'speech' : 'normal';
  return { text, urgency, event: family };
}

/** FB-123 — every non-blip recipe resolves to a caption. Missing rows fall back to the family. */
export function captionForGameplayRecipe(recipeId, recipe, place) {
  if (!recipeId || isUiBlipRecipe(recipeId)) return null;
  const explicit = EXPLICIT_RECIPE_CAPTIONS[recipeId];
  const family = explicit || familyCaption(recipeId, recipe);
  const clock = place ? clockFromPanPosition(place.position, place.listener) : null;
  return Object.freeze({
    recipeId,
    text: clock ? withClockCaption(family.text, clock) : family.text,
    urgency: family.urgency,
    event: family.event,
    ...(clock ? { clock } : {}),
  });
}

export function fieldDeployCaption(kind, flagOrSettings) {
  if (flagOrSettings) {
    const ac = flagOrSettings.accessibility || flagOrSettings;
    if (ac.captions === false) return null;
  }
  const caption = AUDIO_CUE_CAPTIONS[kind];
  if (!caption) return null;
  return { text: caption, channel: 'cue', kind };
}

