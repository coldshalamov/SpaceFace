// Read-only identity for the mission owner's cargo-free restitution fallback.
// This describes the existing dock settlement. It never creates or completes a mission.
export function isReportInRestitution(mission) {
  const p = mission?.params;
  return !!(mission && mission.type === 'cargo_delivery'
    && mission.source === 'missionMutation' && mission.mutationTag === 'restitution'
    && typeof mission.mutatedFromMissionId === 'string' && mission.mutatedFromMissionId
    && p && p.replacesMissionId === mission.mutatedFromMissionId && !p.cmdtyId);
}
