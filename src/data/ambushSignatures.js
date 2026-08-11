// BP-13/B14 Ambush Signatures.
//
// Passive, scannable tells for already-planned ambush shapes. These are warning props, not hostile
// spawns, and they carry the provenance of the encounter shape that made them appear.

export const AMBUSH_SIGNATURES = Object.freeze({
  ambush_snare: Object.freeze({
    id: 'disabled_beacon',
    label: 'Dead beacon',
    hint: 'Dead beacon: possible ambush. Scan and keep distance before crossing the lane.',
  }),
  field_anchor_controller: Object.freeze({
    id: 'anchor_spin_echo',
    label: 'Anchor spin echo',
    hint: 'Anchor spin echo: heavy controller likely staging a drag field. Keep room to break radius.',
  }),
  pirate_toll: Object.freeze({
    id: 'cargo_bait',
    label: 'Cargo bait',
    hint: 'Loose cargo bait: toll pirates may be watching the approach.',
  }),
  named_hunter: Object.freeze({
    id: 'callsign_shadow',
    label: 'Cold callsign echo',
    hint: 'Cold callsign echo: a named raider may be staging nearby.',
  }),
  bounty_hunter: Object.freeze({
    id: 'sensor_tripline',
    label: 'Sensor tripline',
    hint: 'Sensor tripline: hunter traffic may already have your vector.',
  }),
  distress_call: Object.freeze({
    id: 'false_distress_ping',
    label: 'False distress ping',
    hint: 'False distress ping: verify before committing to the rescue vector.',
  }),
});

export function ambushSignatureForShape(shapeId) {
  return AMBUSH_SIGNATURES[shapeId] || null;
}

export function hasAmbushSignature(shapeId) {
  return !!ambushSignatureForShape(shapeId);
}
