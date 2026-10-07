import type Scorm2004API from 'scorm-again/scorm2004';
import type {SCORMActivity} from '../shared/scorm-engine.ts';
import {reject} from './errors.ts';

/** Only the current manifest-mapped activity can write these stores. */
export function applySharedDataWrites(runtime: Scorm2004API, writes: unknown) {
  if (!writes || typeof writes !== 'object' || Array.isArray(writes) || Object.getPrototypeOf(writes) !== Object.prototype && Object.getPrototypeOf(writes) !== null) reject('INVALID_ARGUMENT', 'Exact shared data write object required');
  const entries = Object.entries(writes);
  const maps: NonNullable<SCORMActivity['sharedDataMaps']> = runtime.getSequencingState()?.currentActivity?.sharedDataMaps ?? [];
  if (entries.length > 64 || Buffer.byteLength(JSON.stringify(writes)) > 512 * 1024) reject('INVALID_ARGUMENT', 'Shared data write quota exceeded');
  for (const [id, store] of entries) {
    const index = maps.findIndex(m => m.targetID === id && m.writeSharedData);
    if (index < 0) reject('FORBIDDEN', 'Current SCO cannot write this shared data store');
    if (typeof store !== 'string' || store.length > 64000 || runtime.SetValue(`adl.data.${index}.store`, store) !== 'true') reject('INVALID_ARGUMENT', 'Shared data store value rejected');
  }
}

/** Do not disclose backing data that this activity cannot read in bootstrap JSON. */
export function sharedDataClientSnapshot(runtime: Scorm2004API) {
  const snapshot = JSON.parse(runtime.serializeSequencingState());
  const maps: NonNullable<SCORMActivity['sharedDataMaps']> = runtime.getSequencingState()?.currentActivity?.sharedDataMaps ?? [];
  const readable = new Set(maps.filter(m => m.readSharedData).map(m => m.targetID));
  snapshot.sharedData = Object.fromEntries(Object.entries(snapshot.sharedData ?? {}).filter(([id]) => readable.has(id)));
  return JSON.stringify(snapshot);
}
