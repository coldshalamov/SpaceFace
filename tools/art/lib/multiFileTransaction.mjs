import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  open,
  readFile,
  rename as fsRename,
  rm,
  stat,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function transactionPath(destination, token, index, suffix) {
  return resolve(
    dirname(destination),
    `.${basename(destination)}.sf-file-set-${token}-${index}.${suffix}`,
  );
}

async function writeDurableExclusive(path, bytes) {
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function cleanup(records, removeFile, includeBackups) {
  const errors = [];
  for (const record of records) {
    const paths = [record.staged, ...(includeBackups ? [record.backup] : [])];
    for (const path of paths) {
      try {
        await removeFile(path, { force: true });
      } catch (error) {
        errors.push(`${path}: ${error.message}`);
      }
    }
  }
  return errors;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function currentSha256(path) {
  if (!await pathExists(path)) return null;
  return sha256(await readFile(path));
}

async function assertCurrentHashPrecondition(record) {
  if (!record.hasCurrentHashPrecondition) return;
  const actualCurrentSha256 = await currentSha256(record.destination);
  if (actualCurrentSha256 !== record.expectedCurrentSha256) {
    throw new Error(
      `current SHA-256 changed: expected ${record.expectedCurrentSha256 ?? '<missing>'}, `
      + `got ${actualCurrentSha256 ?? '<missing>'}`,
    );
  }
}

/**
 * Durably stage and validate an arbitrary same-volume file set before replacing
 * any destination. A descriptor may include `expectedCurrentSha256` (a digest,
 * or null when the destination must not exist) to reject stale publication.
 * Preconditions are checked as one batch after staged validation and immediately
 * before the first destination is moved. A failed promotion restores every
 * original in reverse order.
 */
export async function publishFileSetTransaction({ files, fileOps = {} } = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new TypeError('file-set publish requires at least one file descriptor');
  }
  files.forEach((file, index) => {
    if (typeof file?.path !== 'string' || file.path.trim().length === 0) {
      throw new TypeError(`file-set descriptor ${index} requires a non-empty path`);
    }
    if (!Object.prototype.hasOwnProperty.call(file, 'bytes') || file.bytes == null) {
      throw new TypeError(`file-set descriptor ${index} requires bytes`);
    }
    if (typeof file.validate !== 'function') {
      throw new TypeError(`file-set descriptor ${index} requires a staged-file validator`);
    }
    if (Object.prototype.hasOwnProperty.call(file, 'expectedCurrentSha256')) {
      const expected = file.expectedCurrentSha256;
      if (expected !== null && (typeof expected !== 'string' || !/^[0-9a-f]{64}$/i.test(expected))) {
        throw new TypeError(
          `file-set descriptor ${index} expectedCurrentSha256 must be a SHA-256 digest or null`,
        );
      }
    }
  });

  const destinations = files.map((file) => resolve(file.path.trim()));
  if (new Set(destinations.map((path) => path.toLowerCase())).size !== destinations.length) {
    throw new TypeError('file-set publish destinations must be distinct');
  }
  for (const destination of destinations) {
    if (await pathExists(destination) && (await stat(destination)).isDirectory()) {
      throw new TypeError(`file-set publish destination must be a file: ${destination}`);
    }
  }
  const devices = await Promise.all(destinations.map(async (path) => (await stat(dirname(path))).dev));
  if (new Set(devices.map(String)).size !== 1) {
    throw new Error(`file-set publish requires one filesystem device; got ${destinations.join(', ')}`);
  }

  const renameFile = fileOps.rename || fsRename;
  const removeFile = fileOps.remove || rm;
  const token = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const records = files.map((file, index) => ({
    destination: destinations[index],
    bytes: Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes),
    promotedSha256: sha256(Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes)),
    validate: file.validate,
    hasCurrentHashPrecondition: Object.prototype.hasOwnProperty.call(file, 'expectedCurrentSha256'),
    expectedCurrentSha256: typeof file.expectedCurrentSha256 === 'string'
      ? file.expectedCurrentSha256.toLowerCase()
      : file.expectedCurrentSha256,
    staged: transactionPath(destinations[index], token, index, 'tmp'),
    backup: transactionPath(destinations[index], token, index, 'bak'),
    backedUp: false,
    promoted: false,
  }));

  let phase = 'staging';
  let current = records[0];
  let primaryError = null;
  const rollbackErrors = [];
  try {
    for (const record of records) {
      current = record;
      await writeDurableExclusive(record.staged, record.bytes);
    }

    phase = 'validating';
    for (const record of records) {
      current = record;
      await record.validate(record.staged, await readFile(record.staged));
    }

    phase = 'checking current-hash preconditions';
    for (const record of records) {
      current = record;
      await assertCurrentHashPrecondition(record);
    }

    phase = 'promoting';
    for (const record of records) {
      current = record;
      // Narrow the batch-check race without moving any validation work into the
      // publication loop. A late conflict rolls back already-promoted records.
      await assertCurrentHashPrecondition(record);
      if (await pathExists(record.destination)) {
        await renameFile(record.destination, record.backup);
        record.backedUp = true;
      }
      await renameFile(record.staged, record.destination);
      record.promoted = true;
    }
  } catch (error) {
    primaryError = error;
    for (const record of [...records].reverse()) {
      try {
        if (record.promoted) {
          const currentPromotedSha256 = await currentSha256(record.destination);
          if (currentPromotedSha256 !== record.promotedSha256) {
            rollbackErrors.push(
              `${record.destination}: externally changed after promotion `
              + `(${record.promotedSha256} -> ${currentPromotedSha256 ?? '<missing>'}); `
              + `destination and backup retained`,
            );
            continue;
          }
          await removeFile(record.destination, { force: true });
        } else if (record.backedUp && await pathExists(record.destination)) {
          rollbackErrors.push(
            `${record.destination}: externally recreated after backup; destination and backup retained`,
          );
          continue;
        }
        if (record.backedUp) await renameFile(record.backup, record.destination);
      } catch (rollbackError) {
        rollbackErrors.push(`${record.backup} -> ${record.destination}: ${rollbackError.message}`);
      }
    }
  }

  if (primaryError) {
    const cleanupErrors = await cleanup(records, removeFile, rollbackErrors.length === 0);
    const rollbackDetail = rollbackErrors.length
      ? `rollback incomplete (${rollbackErrors.join('; ')}); backups retained`
      : 'original destinations restored';
    const cleanupDetail = cleanupErrors.length ? `; cleanup failed (${cleanupErrors.join('; ')})` : '';
    throw new Error(
      `file-set publish failed while ${phase} "${current.destination}": `
      + `${primaryError.message}; ${rollbackDetail}${cleanupDetail}`,
      { cause: primaryError },
    );
  }

  const cleanupErrors = await cleanup(records, removeFile, true);
  if (cleanupErrors.length) {
    throw new Error(`file-set publish completed but cleanup failed: ${cleanupErrors.join('; ')}`);
  }
  return destinations;
}
