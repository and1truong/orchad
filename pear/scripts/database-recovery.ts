// Operator CLI only; no application/agent route and no automatic production switch.
import {DatabaseSync} from 'node:sqlite';
import {backupPearDatabase, restorePearDatabase} from '../src/server/database-recovery.ts';
const [action, source, destination, ...extra] = process.argv.slice(2);
if (!['backup', 'restore'].includes(action) || !source || !destination || extra.length) throw Error('Usage: database-recovery.ts backup|restore SOURCE NEW_DESTINATION');
if (action === 'restore') console.log(JSON.stringify(await restorePearDatabase(source, destination)));
else {
  const db = new DatabaseSync(source, {readOnly: true});
  try {console.log(JSON.stringify(await backupPearDatabase(db, destination)));} finally {db.close();}
}
