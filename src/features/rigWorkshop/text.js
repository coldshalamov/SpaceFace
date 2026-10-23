// Player explanations for refusals from the existing attachment/native owners.
// Internal reason codes are useful for tests; the pilot needs the next useful action.
const REASONS = Object.freeze({
  fit_a_new_frame: 'The old machine is lost. Fit a new keel frame at the bench, then rebuild around its saved name.',
  body_is_not_cargo: 'This body is machinery or infrastructure. Bring an owned cargo payload into the cradle instead.',
  connection_limit: 'This rig already has its full set of connections. Release a load before adding another.',
  body_limit: 'The workshop has reached its physical body limit. Recover or reuse the machinery already in the world.',
  approach_bench: 'Fly closer to the bench.',
  rig_missing: 'Select one of your two workshop rigs.',
  unknown_part: 'Choose one of the six parts on the bench.',
  unknown_mount: 'Choose a marked mounting face.',
  parent_missing: 'That part is gone. Choose a surviving part to build from.',
  return_rig_to_bench_and_stop: 'Tow this rig into the yard, cut mover power, and let it settle.',
  edit_pending: 'Let the current connection seat, or cancel it before starting another.',
  part_limit: 'Eight parts is the rig limit. Undo a fitting or recover a smaller layout.',
  no_reclaimed_parts: 'The reclaimed stock is empty. Undo the last fitting or deliver cargo for more stock.',
  clearance_blocked: 'The new part would overlap another body. Try another mounting face.',
  no_preview: 'Choose a part and a mounting face first.',
  preview_stale: 'The rig changed after this preview. Preview the connection again.',
  body_spawn_unavailable: 'The part could not enter the world. No stock was spent.',
  nothing_to_undo: 'There is no completed workshop edit to undo.',
  undo_identity_changed: 'That original part is no longer available to undo.',
  part_is_in_use: 'Another connection now depends on that part. Bring the assembly back for repair.',
  body_remove_unavailable: 'The original part is still in the world. No reclaimed stock was issued.',
  fit_a_tow_coupling: 'Fit a tow coupling, or use recovery on a surviving part.',
  approach_tow_coupling: 'Approach the rig’s tow coupling at low speed.',
  cargo_missing: 'The original cargo body is not here.',
  cargo_already_delivered: 'That original already has a paid delivery receipt.',
  cargo_not_owned: 'This cargo does not belong to your work order.',
  cargo_capacity: 'Every catcher is full. Deliver or release a load first.',
  cargo_already_coupled: 'The other rig already holds this original. Release that restraint before transferring it.',
  cargo_limit: 'The rig is carrying its maximum three bodies. Deliver or release a load.',
  rig_cargo_full: 'The rig is carrying its maximum three bodies. Deliver or release a load.',
  bring_cargo_inside_cradle_or_collector: 'Bring the open cradle or catcher close to the cargo, then secure it.',
  match_cargo_speed: 'Slow the approach. Cargo must be moving within 8 WU/s of the catcher.',
  cargo_not_captured: 'There is no secured cargo to release.',
  fit_a_powered_mover: 'Fit a powered mover before enabling assist.',
  wait_for_connections: 'Let the new connections seat before powering the rig.',
  couple_before_power: 'Couple your ship first. Mover assist follows your normal flight controls.',
  couple_rig_before_power: 'Couple your ship first. Mover assist follows your normal flight controls.',
  tow_surviving_parts_back_to_bench: 'Tow the surviving parts into the yard, cut power, and let them settle.',
  rig_already_sound: 'The surviving parts and connections are sound.',
  no_surviving_parts: 'No part survived. Fit a new keel at the bench using reclaimed stock; the machine keeps its name and history.',
  approach_a_surviving_part: 'Approach the marked original part to attach a recovery line.',
  native_admission_failed: 'The physical connection could not seat. Your unused stock is still on the bench.',
  physics_unavailable: 'The physical owner is not ready. Hold position and try again.',
  native_body_unavailable: 'This body is still entering the physical world. Hold position.',
  socket_occupied: 'That connection point is occupied. Release its load or choose another part.',
  owner_limit: 'This part is carrying too many connections. Spread the attachments across the rig.',
  target_missing: 'The target body is no longer available.',
  source_missing: 'The source body is no longer available.',
});
export function explainWorkshopReason(reason) {
  if (!reason) return 'The connection is ready.';
  const text = String(reason);
  if (REASONS[text]) return REASONS[text];
  if (!/^[a-z0-9_:-]+$/.test(text)) return text;
  return `The connection is unavailable (${text.replaceAll('_', ' ').replaceAll(':', ' · ')}). Move closer, slow down, and try another connection point.`;
}
export const PART_BUTTONS = Object.freeze({
  frame: 'Keel frame · spine', hitch: 'Tow coupling · hitch', cradle: 'Cargo cradle · carry',
  collector: 'Scrap catcher · collect', mover: 'Powered mover · thrust', bumper: 'Guard · protect',
});
