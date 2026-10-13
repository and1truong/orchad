import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = resolve(process.argv[2] ?? fileURLToPath(new URL('./artifacts', import.meta.url)));
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
assert.equal(manifest.channel, 'preview');
assert.match(manifest.revision, /^[a-f0-9]{40}$/);
assert.deepEqual(Object.keys(manifest.artifacts).sort(), ['bridge-contract', 'coconut-desktop-kit', 'lime-companion', 'lime-extension']);
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' });
const npm = (args, cwd) => run('npm', args, cwd);
for (const artifact of Object.values(manifest.artifacts)) {
  assert.match(artifact.filename, /^[a-z0-9.-]+$/);
  const bytes = await readFile(join(output, artifact.filename));
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, `Checksum: ${artifact.filename}`);
}
run('sha256sum', ['--check', 'SHA256SUMS'], output);
// This directory has no Orchard source ancestor. All installs resolve from artifacts.
const consumer = await mkdtemp(join(tmpdir(), 'orchard-consumer-'));

async function install(directory) {
  const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
  for (const [path, entry] of Object.entries(lock.packages)) {
    assert(!path.startsWith('..'), `External lock entry: ${path}`);
    if (entry.link) assert.match(entry.resolved, /^vendor\/[a-z-]+$/);
    else if (entry.resolved) assert(!/^(file:|\.\.\/|\/)/.test(entry.resolved), `External local dependency: ${path}`);
  }
  npm(['ci', '--no-audit', '--no-fund'], directory);
  for (const name of Object.keys(manifest.packages)) {
    const linked = await realpath(join(directory, 'node_modules', name));
    assert(linked.startsWith(directory + sep), `Workspace escapes artifact: ${name}`);
  }
}

// Executed INSIDE the extracted artifact so imports cannot fall back to producer node_modules.
const smoke = String.raw`
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openRunner } from '@orchard/agent-durable';

const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const coconut = process.argv[2] === 'coconut';
const env = { ...process.env };
// Test processes must never inherit live gateway configuration or credentials.
for (const key of Object.keys(env)) if (/^(COCONUT|LIME)_/.test(key)) delete env[key];
if (coconut) env.COCONUT_MCP_PORT = String(port);
else { env.LIME_COMPANION_PORT = String(port); env.LIME_EXTENSION_ORIGINS = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; }
const child = spawn(process.execPath, [coconut ? 'host/sidecar.bundle.mjs' : 'cli.js'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
const messages = [];
let stderr = '';
child.stderr.on('data', x => stderr += x);
const lines = createInterface({ input: child.stdout });
lines.on('line', line => messages.push(coconut ? JSON.parse(line) : line));
const next = async predicate => {
  const deadline = Date.now() + 15000;
  for (;;) {
    const index = messages.findIndex(predicate);
    if (index >= 0) return messages.splice(index, 1)[0];
    if (child.exitCode !== null || Date.now() > deadline) throw Error('Packaged process failed: ' + stderr);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
const send = value => child.stdin.write(JSON.stringify(value) + '\n');
const endpoint = new URL('http://127.0.0.1:' + port + '/mcp');
let client;
try {
  await next(m => coconut ? m.kind === 'ready' : m.includes('Lime companion listening'));
  assert.equal((await fetch(endpoint)).status, 401);
  if (coconut) {
    send({ id: 'heartbeat', action: 'heartbeat' });
    assert.equal((await next(m => m.id === 'heartbeat')).kind, 'response');
    send({ id: 'pair', action: 'pair', name: 'release-smoke', scopes: ['read'], targetIds: [] });
    const pair = (await next(m => m.id === 'pair')).data;
    assert.equal(typeof pair.token, 'string');
    client = new Client({ name: 'release-smoke', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: 'Bearer ' + pair.token } } }));
    assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(), ['host_call_tool', 'host_get_context', 'host_list_targets', 'host_list_tools']);
    const result = (await client.callTool({ name: 'host_list_targets', arguments: {} })).structuredContent;
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.targets, []);
    assert.equal((await fetch(endpoint, { headers: { Authorization: 'Bearer ' + pair.token, Origin: 'https://evil.example' } })).status, 403);
  }
  // SQLite runtime dependencies must also work after leaving the producer tree.
  const runner = await openRunner({ storagePath: 'release-smoke.db' });
  try { assert.equal((await runner.status()).phase, 'idle'); } finally { await runner.close(); }
} finally {
  await client?.close();
  let code = child.exitCode, signal = child.signalCode;
  if (code === null && signal === null) {
    const stopped = once(child, 'exit');
    if (coconut) child.stdin.end(); else child.kill('SIGINT');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    [code, signal] = await stopped;
    clearTimeout(timer);
  }
  lines.close();
  assert.equal(code, 0, 'Packaged process shutdown: ' + signal + ' ' + stderr);
}
console.log('Isolated ' + process.argv[2] + ' process and SQLite smoke passed');
`;

try {
  for (const kind of ['coconut-desktop-kit', 'lime-companion'])
    run('tar', ['-xzf', join(output, manifest.artifacts[kind].filename), '-C', consumer], output);
  const coconut = join(consumer, 'coconut-desktop-kit');
  const companion = join(consumer, 'lime-companion');
  await install(coconut);
  // Prove that a downstream app can change the single trusted origin without relaxing permissions.
  await writeFile(join(coconut, 'trusted-origin.txt'), 'http://127.0.0.1:3000\n');
  const configPath = join(coconut, 'src-tauri/tauri.conf.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.productName = 'OMD consumer smoke';
  config.identifier = 'dev.orchard.release-smoke';
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  npm(['run', 'build'], coconut);
  npm(['run', 'package:sidecar'], coconut);
  const capability = JSON.parse(await readFile(join(coconut, 'src-tauri/capabilities/guest-replies.json'), 'utf8'));
  assert.deepEqual(capability.remote.urls, ['http://127.0.0.1:3000/*']);
  await writeFile(join(coconut, 'consumer-smoke.mjs'), smoke);
  run(process.execPath, ['consumer-smoke.mjs', 'coconut'], coconut);
  await install(companion);
  await writeFile(join(companion, 'consumer-smoke.mjs'), smoke);
  run(process.execPath, ['consumer-smoke.mjs', 'lime'], companion);

  const bridge = join(consumer, 'bridge-consumer');
  await mkdir(bridge);
  await writeFile(join(bridge, 'package.json'), '{"private":true,"type":"module"}\n');
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', join(output, manifest.artifacts['bridge-contract'].filename)], bridge);
  run(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; import {Bounds,canonical} from '@orchard/bridge-contract'; import {runScenario} from '@orchard/bridge-contract/scenario/run-scenario.mjs'; assert.equal(Bounds.message,65536); assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2})); assert.equal(typeof runScenario,'function');`], bridge);

  const extension = join(consumer, 'lime-extension');
  run('unzip', ['-q', join(output, manifest.artifacts['lime-extension'].filename), '-d', extension], consumer);
  const mv3 = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  assert.equal(mv3.manifest_version, 3);
  assert.equal(mv3.version_name, `${manifest.version} (${manifest.channel})`);
  for (const entry of [mv3.background.service_worker, mv3.side_panel.default_path, 'sidepanel.js', 'sidepanel.css', 'app-request-relay.js'])
    assert((await readFile(join(extension, entry))).length > 0);
  if (process.env.GITHUB_OUTPUT && process.argv.includes('--keep'))
    await appendFile(process.env.GITHUB_OUTPUT, `desktop_kit=${coconut}\n`);
  console.log(`Clean consumer checks passed: ${consumer}`);
} finally {
  if (!process.argv.includes('--keep')) await rm(consumer, { recursive: true, force: true });
}
