// Wave G9 — one key brings the current objective back after it leaves the screen.

export function createObjectiveRecall() {
  return { text: '', snapshot: '', dismissed: false, pinned: false };
}

export function rememberObjective(memory, line) {
  if (!memory || memory.dismissed) return memory;
  const text = String(line || '');
  if (text) memory.text = text;
  return memory;
}

export function dismissObjective(memory) {
  memory.dismissed = true;
  memory.pinned = false;
  memory.snapshot = memory.text;
  return memory.snapshot;
}

export function recallObjective(memory) {
  memory.dismissed = false;
  memory.pinned = true;
  if (memory.snapshot) memory.text = memory.snapshot;
  return memory.text;
}

export function objectiveVisible(memory, liveShow) {
  if (!memory) return !!liveShow;
  if (memory.pinned) return !!memory.text;
  if (memory.dismissed) return false;
  return !!liveShow;
}
