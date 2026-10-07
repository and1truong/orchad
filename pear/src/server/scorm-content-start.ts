import {createSCORMContentHost} from './scorm-content-host.ts';

const origin = process.env.PEAR_SCORM_CONTENT_ORIGIN ?? 'http://localhost:4315';
const host = process.env.PEAR_SCORM_CONTENT_BIND ?? '127.0.0.1';
const url = new URL(origin);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('SCORM foundation host is loopback-only until package security acceptance');
const app = createSCORMContentHost({pearOrigin: process.env.APP_ORIGIN ?? 'http://127.0.0.1:4314', contentOrigin: origin});
await app.listen({host, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80))});
console.log('Pear SCORM content host: ' + origin + ' (runtime disabled)');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {await app.close();});
