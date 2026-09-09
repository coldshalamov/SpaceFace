import { randomUUID } from 'node:crypto';
import { access, open, readFile, rename as fsRename, rm, stat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
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
    `.${basename(destination)}.sf-transaction-${token}-${index}.${suffix}`,
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

async function cleanupRecords(records, { removeBackups }, removeFile) {
  const errors = [];
  for (const record of records) {
    for (const path of [record.staged, ...(removeBackups ? [record.backup] : [])]) {
      try {
        await removeFile(path, { force: true });
      } catch (error) {
        errors.push(`${path}: ${error.message}`);
      }
    }
  }
  return errors;
}

/**
 * Publish exactly two files through same-volume rename operations. Both payloads are
 * durably staged and validated before the first live destination changes. Each live
 * file is then backed up and immediately promoted; reverse rollback restores both.
 */
export async function publishTwoFileTransaction({ files, fileOps = {} } = {}) {
  if (!Array.isArray(files) || files.length !== 2) {
    throw new TypeError('two-file publish requires exactly two file descriptors');
  }
  files.forEach((file, index) => {
    if (typeof file?.path !== 'string' || file.path.trim().length === 0) {
      throw new TypeError(`two-file publish descriptor ${index} requires a non-empty path`);
    }
    if (!Object.prototype.hasOwnProperty.call(file, 'bytes') || file.bytes == null) {
      throw new TypeError(`two-file publish descriptor ${index} requires bytes`);
    }
    if (typeof file.validate !== 'function') {
      throw new TypeError(`two-file publish descriptor ${index} requires a staged-file validator`);
    }
  });
  const destinations = files.map((file) => resolve(file.path.trim()));
  if (new Set(destinations.map((path) => path.toLowerCase())).size !== 2) {
    throw new TypeError('two-file publish destinations must be distinct');
  }
  for (const destination of destinations) {
    if (await pathExists(destination) && (await stat(destination)).isDirectory()) {
      throw new TypeError(`two-file publish destination must be a file path, not a directory: ${destination}`);
    }
  }
  const devices = await Promise.all(destinations.map(async (path) => (await stat(dirname(path))).dev));
  if (new Set(devices.map(String)).size !== 1) {
    throw new Error(`two-file publish requires destination directories on one filesystem device; got ${destinations.join(', ')}`);
  }

  const renameFile = fileOps.rename || fsRename;
  const removeFile = fileOps.remove || rm;
  const token = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const records = files.map((file, index) => ({
    destination: destinations[index],
    bytes: Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes ?? ''),
    validate: file.validate,
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
      if (typeof record.validate === 'function') {
        await record.validate(record.staged, await readFile(record.staged));
      }
    }

    phase = 'promoting';
    for (const record of records) {
      current = record;
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
        if (record.promoted || record.backedUp) await removeFile(record.destination, { force: true });
        if (record.backedUp) await renameFile(record.backup, record.destination);
      } catch (rollbackError) {
        rollbackErrors.push(`${record.backup} -> ${record.destination}: ${rollbackError.message}`);
      }
    }
  }

  if (primaryError) {
    const cleanupErrors = await cleanupRecords(records, { removeBackups: rollbackErrors.length === 0 }, removeFile);
    const rollbackDetail = rollbackErrors.length
      ? `rollback incomplete (${rollbackErrors.join('; ')}); backups retained`
      : 'original destinations restored';
    const cleanupDetail = cleanupErrors.length ? `; cleanup failed (${cleanupErrors.join('; ')})` : '';
    throw new Error(
      `two-file publish failed while ${phase} "${current.destination}": ${primaryError.message}; ${rollbackDetail}${cleanupDetail}`,
      { cause: primaryError },
    );
  }

  const cleanupErrors = await cleanupRecords(records, { removeBackups: true }, removeFile);
  if (cleanupErrors.length) {
    throw new Error(`two-file publish completed but transaction cleanup failed: ${cleanupErrors.join('; ')}`);
  }
  return destinations;
}
