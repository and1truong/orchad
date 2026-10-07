import {DatabaseSync, backup} from 'node:sqlite';
import {openSync, closeSync, chmodSync, unlinkSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {CURRENT_SCHEMA_VERSION} from './database.ts';

function verified(db: DatabaseSync) {
  if (db.prepare('SELECT max(version) n FROM schema_version').get()?.n !== CURRENT_SCHEMA_VERSION) throw Error('Recovery requires the exact application schema');
  if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').get()) throw Error('Database recovery integrity check failed');
}

// Whole Pear database: SCORM state, receipts and official history share a transaction.
// SQLite's backup API includes a coherent WAL snapshot; never copy the live DB file.
export async function backupPearDatabase(source: DatabaseSync, destination: string) {
  verified(source);
  const path = resolve(destination), descriptor = openSync(path, 'wx', 0o600); closeSync(descriptor);
  try {
    await backup(source, path); chmodSync(path, 0o600);
    const check = new DatabaseSync(path, {readOnly: true}); try {verified(check);} finally {check.close();}
    return {schemaVersion: CURRENT_SCHEMA_VERSION, destination: path};
  } catch (error) {unlinkSync(path); throw error;}
}

// Restore into a NEW offline destination. Invalidate old browser/capability authority
// while preserving CMI, snapshots, immutable receipts/proofs and domain history.
export async function restorePearDatabase(source: string, destination: string) {
  const original = new DatabaseSync(resolve(source), {readOnly: true});
  try {await backupPearDatabase(original, destination);} finally {original.close();}
  const restored = new DatabaseSync(resolve(destination)); let ready = false;
  try {
    restored.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    try {
      restored.exec('DELETE FROM sessions; UPDATE scorm_engine_launches SET closed=1; COMMIT');
    } catch (error) {restored.exec('ROLLBACK'); throw error;}
    verified(restored);
    ready = true;
    return {schemaVersion: CURRENT_SCHEMA_VERSION, destination: resolve(destination), browserSessionsRevoked: true, scormCapabilitiesClosed: true};
  } finally {restored.close(); if (!ready) for (const suffix of ['', '-wal', '-shm']) rmSync(resolve(destination) + suffix, {force: true});}
}
