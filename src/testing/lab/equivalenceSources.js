// Shared executor source tags — leaf module (no lab runner imports).
// Sealing itself is private to parent executors; these tags are diagnostic only.

export const EQUIVALENCE_EXECUTOR_SOURCES = Object.freeze({
  REPEAT: 'repeat-executor',
  SAVE_LOAD: 'save-load-executor',
  DIFFERENTIAL: 'differential-executor',
});
