/**
 * Preserve the caller environment while ensuring Python validation never writes
 * tracked or untracked __pycache__ artifacts into the authoring tree.
 */
export function resolvePythonCommand(baseEnv = process.env) {
  return baseEnv.PYTHON || 'python';
}

export const PYTHON = process.env.PYTHON || 'python';

export function withPythonNoBytecodeEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    PYTHONDONTWRITEBYTECODE: '1',
  };
}
