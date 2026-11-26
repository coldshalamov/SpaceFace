/** Validate an optional release-build lease held by this process's direct parent.
 * An inherited lease is never released by the child. A malformed or foreign lease
 * must fail before the release builder touches any output.
 */
export function hasInheritedReleaseLock({ token, parentPid, actualParentPid, owner, isProcessRunning }) {
  if (token === undefined && parentPid === undefined) return false;
  if (typeof token !== 'string' || !token || typeof parentPid !== 'string' || !/^[1-9]\d*$/.test(parentPid)) {
    throw new Error('Invalid inherited SG-04 release lock credentials');
  }
  const pid = Number(parentPid);
  if (!Number.isSafeInteger(pid) || pid !== actualParentPid || owner?.pid !== pid
    || owner?.token !== token || typeof isProcessRunning !== 'function' || !isProcessRunning(pid)) {
    throw new Error('Inherited SG-04 release lock does not belong to the live direct parent');
  }
  return true;
}
