// Story-spine contracts: every `campaign47a:` leg (B0 recovery first) is the story's own rail, not
// a job the pilot can walk away from. Abandoning one used to leave an empty log while comms still
// said the work remained open, and nothing reposted it. The Mission Log offers no Abandon word for
// these and missions.abandonMission refuses them, both reading this one definition.

export const STORY_SPINE_TAG_PREFIX = 'campaign47a:';

/** The sentence that stands in the Abandon slot (and the refusal toast). */
export const STORY_SPINE_KEEP_TEXT = 'Part of your story — it stays on your log.';

export function isStorySpineContract(m) {
  return !!m && typeof m.storyTag === 'string' && m.storyTag.startsWith(STORY_SPINE_TAG_PREFIX);
}
