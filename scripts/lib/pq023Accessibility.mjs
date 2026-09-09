export function setPq023AccessibilityPreference(settings, reduced) {
  if (!settings || typeof settings !== 'object') return null;
  const video = settings.video || (settings.video = {});
  const accessibility = settings.accessibility || (settings.accessibility = {});
  const enabled = reduced === true;

  accessibility.motionPreference = enabled ? 'reduce' : 'full';
  accessibility.flashReduce = enabled;
  video.motionReduce = enabled;

  return {
    motionPreference: accessibility.motionPreference,
    motionReduce: video.motionReduce,
    flashReduce: accessibility.flashReduce,
  };
}
