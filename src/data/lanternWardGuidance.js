// A read-only worksite briefing. The attended job owns phases, custody and work
// time; this projection never accepts a job, moves an original or settles credit.
const SEAT = 'The Venn receiving cup is northeast of the Apron cradle, beside the planted window. Match the three brass strokes on lamp and cup; the memorial plinth stays dark.';

export function lanternWardWorkGuidance(state) {
  const w = state?.npcJobs?.lanternWard;
  const result = (step, status, next, landmark = SEAT) => ({ step, status, lines: [next, landmark] });
  if (w?.version !== 1 || w.initialized !== true) {
    return result('checking', 'Worksite check pending', 'Give Nessa room to check the original lamp and its receiving cup. Hail again once the worksite is ready.');
  }
  // Destruction is durable. A route must never promise a respawn, replacement or
  // repair of a lost original, even if a restored phase still says "installed".
  if (w.objects?.lamp?.lost === true) {
    return result('lamp_lost', 'Original family lamp lost', 'The original Venn lamp was lost. A replacement lamp cannot complete this family circuit.', 'The household keeps its own receiving cup. The memorial plinth is a separate memorial, not a substitute.');
  }
  if (w.objects?.receiver?.lost === true) {
    return result('receiver_lost', 'Household receiving cup lost', 'The household receiving cup was lost. Keep the original lamp safe; Nessa cannot connect it to another fixture.');
  }
  if (w.receiverMissing === true) {
    return result('find_receiver', 'Household receiving cup unavailable in the Ward',
      'The original household receiving cup is unavailable here. Keep the original lamp safe; the same cup must return before Nessa can connect the family circuit.');
  }
  if (w.lampMissing === true) {
    return result('find_original', 'Original lamp unavailable in the Ward', 'The original Venn Family Lamp, Serial 01, is unavailable here. If it is still intact, return that same lamp to its household seat; another lamp cannot finish the work.');
  }
  if (w.phase === 'damaged') {
    return result('repair', 'Original contacts damaged · 1 electronics', 'Bring one ELECTRONICS unit in your hold. Keep the damaged original slow alongside Nessa and match speed, then hail her and choose FIT CONTACTS.');
  }
  if (w.phase === 'installed' && !w.needsReinstall) {
    return result('complete', 'Venn family circuit connected', 'The original lamp is connected in its own receiving cup. The empty cradle is free again.');
  }
  if (w.phase === 'connect') {
    const progress = Math.floor(Math.min(1, Math.max(0, Number.isFinite(w.workS) ? w.workS / 18 : 0)) * 100);
    return result('connect', `Attended connection · ${progress}%`, 'Keep the lamp steady and your Massline clear. Nessa is seating both contacts; moving the lamp or interrupting her attendance restarts this check.');
  }
  if (w.phase === 'brace') {
    return result('handoff', 'Lamp at the household · handoff pending', 'Settle the original beside its receiving cup and release your Massline. Leave Nessa room to brace and make the connection.');
  }
  if (w.needsReinstall || w.phase === 'displaced') {
    return result('reconnect', 'Family circuit interrupted · original needed', 'Bring the same lamp back to its household seat beside the Venn receiving cup and release your Massline once it is steady. Nessa must attend and reconnect it; the previous service remains recorded.');
  }
  if (w.phase === 'recovering') {
    return result('recovering', 'Nessa is recovering the loaded cradle', 'Nessa is catching up with the same cradle and lamp. Keep her approach clear; leave moved gear in the Ward so she can reach it.');
  }
  if (w.phase === 'transit') {
    return result('transit', 'Original lamp in transit', 'Nessa is moving the loaded cradle toward the household. Keep the service cut and her turning space clear; follow the original lamp to its cup.');
  }
  if (w.phase === 'interrupted') {
    return result('resume', 'Crew handoff interrupted', 'Away from the household, return the original lamp to its cradle. Beside the receiving cup, Nessa can take it directly. Settle the load and release your Massline so she can resume.');
  }
  if (w.objects?.cradle?.lost === true) {
    return result('cradle_lost', 'Procession cradle lost', 'The original lamp still needs its household seat, but the cradle was lost. If you can bring the same lamp alongside the receiving cup, Nessa can attend it there.');
  }
  if (w.cradleAway === true) {
    return result('return_cradle', 'Procession cradle away from the Ward', 'The cradle is away from the Ward. Bring it and the original lamp back together, or bring the lamp to its cup. An empty platform cannot finish the family circuit.');
  }
  if (w.phase === 'missing') {
    return result('unavailable', 'Service equipment unavailable', 'Service equipment or operator unavailable. Nessa needs the original lamp, its household cup and the working launch. Keep surviving gear safe. The household seat must wait.');
  }
  if (w.blocked === true || w.phase === 'blocked') {
    return result('choose_route', 'Two ways to bring the family lamp home', 'Use Line (Massline) to tow the fallen mast out of the passage and let Nessa carry the lamp. Or bring the original lamp to its cup: tow the loaded cradle around the open south rim, or lift the lamp itself. Release your line once the load is steady beside the cup.');
  }
  return result('ready', 'Passage clear · crew preparing', 'The service cut is clear. Leave the loaded cradle and Nessa room to turn; she will carry this same lamp to its household cup.');
}
