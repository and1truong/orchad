import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, 'release/artifacts');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' });
const npm = (args, cwd) => run('npm', args, cwd);
const release = await json(join(root, 'release/version.json'));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release.version) || release.channel !== 'preview')
  throw Error('A valid preview release version is required');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `orchard-v${release.version}`)
  throw Error('Release tag must match release/version.json');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '';
if (process.env.GITHUB_REF_TYPE === 'tag' && dirty) throw Error('Tagged release source must be clean');
const packages = ['packages/bridge-contract', 'mango/packages/agent-client', 'packages/agent-durable'];
const manifests = await Promise.all(packages.map(path => json(join(root, path, 'package.json'))));
const versions = Object.fromEntries(manifests.map(p => [p.name, p.version]));

// Lime's existing prebuild builds all shared packages in dependency order.
// Consumers receive JS/declarations, not those sibling source trees.
npm(['run', 'build'], join(root, 'lime'));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(tmpdir(), 'orchard-package-'));
const artifacts = {};

async function copy(from, to, entries) {
  await mkdir(to, { recursive: true });
  for (const entry of entries) {
    await mkdir(resolve(to, entry, '..'), { recursive: true });
    await cp(join(from, entry), join(to, entry), { recursive: true });
  }
}

function internalDependencies(p) {
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, value] of Object.entries(p[field] ?? {})) {
      if (versions[name]) p[field][name] = versions[name];
      else if (/^(file:|link:|workspace:)/.test(value)) throw Error(`Unpackaged dependency: ${name}`);
    }
  }
  return p;
}

async function vendor(destination) {
  for (let i = 0; i < packages.length; i++) {
    const p = internalDependencies(structuredClone(manifests[i]));
    delete p.scripts;
    delete p.devDependencies;
    const target = join(destination, 'vendor', p.name.split('/')[1]);
    await copy(join(root, packages[i]), target, ['dist']);
    await cp(join(root, 'contract'), join(target, 'CONTRACT.md'));
    // README is optional for packages that have no individual guide yet.
    if ((await readdir(join(root, packages[i]))).includes('README.md'))
      await cp(join(root, packages[i], 'README.md'), join(target, 'README.md'));
    await save(join(target, 'package.json'), p);
  }
}

async function workspace(destination, p) {
  p = internalDependencies(p);
  p.private = true;
  p.workspaces = ['vendor/*'];
  p.engines = { node: '>=24' };
  await vendor(destination);
  await save(join(destination, 'package.json'), p);
  // The distributed lock includes only links INSIDE this artifact.
  npm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], destination);
}

function archive(key, directory) {
  const name = `orchard-${key}-${release.version}.tar.gz`;
  run('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-czf', join(output, name), '-C', stage, directory], root);
  artifacts[key] = name;
}

try {
  const bridge = join(stage, 'bridge-contract');
  await copy(join(root, packages[0]), bridge, ['dist', 'scenario']);
  await cp(join(root, 'contract'), join(bridge, 'CONTRACT.md'));
  const bridgePackage = structuredClone(manifests[0]);
  delete bridgePackage.scripts;
  delete bridgePackage.devDependencies;
  bridgePackage.files = ['dist', 'scenario', 'CONTRACT.md', 'README.md'];
  await cp(join(root, 'release/README.md'), join(bridge, 'README.md'));
  await save(join(bridge, 'package.json'), bridgePackage);
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', output], { cwd: bridge, encoding: 'utf8' }));
  artifacts['bridge-contract'] = packed[0].filename;

  const coconut = join(stage, 'coconut-desktop-kit');
  await copy(join(root, 'coconut'), coconut, [
    'src', 'host/bridge.js', 'host/policy.mjs', 'host/validation.mjs', 'host/mcp.mjs', 'host/durable.mjs', 'host/sidecar.mjs',
    'index.html', 'tsconfig.json', 'trusted-origin.txt', 'THREAT-MODEL.md',
    'scripts/gen-capabilities.mjs', 'scripts/package-sidecar.mjs',
    'src-tauri/src', 'src-tauri/icons', 'src-tauri/capabilities', 'src-tauri/permissions',
    'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/build.rs', 'src-tauri/tauri.conf.json',
  ]);
  const coconutPackage = await json(join(root, 'coconut/package.json'));
  coconutPackage.version = release.version;
  coconutPackage.scripts = {
    dev: 'vite --host 127.0.0.1 --port 1420',
    prebuild: 'npm run capabilities',
    build: 'tsc --noEmit && vite build',
    tauri: 'tauri',
    'package:sidecar': 'node scripts/package-sidecar.mjs',
    capabilities: 'node scripts/gen-capabilities.mjs',
  };
  await workspace(coconut, coconutPackage);
  await cp(join(root, 'contract'), join(coconut, 'CONTRACT.md'));
  await cp(join(root, 'release/README.md'), join(coconut, 'README.md'));
  await save(join(coconut, 'orchard-release.json'), { ...release, revision, dirty, packages: versions });
  archive('coconut-desktop-kit', 'coconut-desktop-kit');

  const extensionName = `orchard-lime-extension-${release.version}.zip`;
  const extensionManifest = await json(join(root, 'lime/dist/extension/manifest.json'));
  extensionManifest.version = release.version.split('-')[0];
  extensionManifest.version_name = `${release.version} (${release.channel})`;
  const extension = join(stage, 'lime-extension');
  await cp(join(root, 'lime/dist/extension'), extension, { recursive: true });
  await save(join(extension, 'manifest.json'), extensionManifest);
  await rm(join(output, extensionName), { force: true });
  run('zip', ['-X', '-q', '-r', join(output, extensionName), '.'], extension);
  artifacts['lime-extension'] = extensionName;

  const companion = join(stage, 'lime-companion');
  await copy(join(root, 'lime/dist/companion'), companion, ['cli.js']);
  const limePackage = await json(join(root, 'lime/package.json'));
  const companionPackage = {
    name: '@orchard/lime-companion', version: release.version, type: 'module',
    scripts: { start: 'node cli.js' }, dependencies: limePackage.dependencies,
  };
  delete companionPackage.dependencies.react;
  delete companionPackage.dependencies['react-dom'];
  await workspace(companion, companionPackage);
  await cp(join(root, 'lime/README.md'), join(companion, 'README.md'));
  await cp(join(root, 'contract'), join(companion, 'CONTRACT.md'));
  archive('lime-companion', 'lime-companion');

  const files = {};
  for (const [kind, filename] of Object.entries(artifacts)) {
    const bytes = await readFile(join(output, filename));
    files[kind] = { filename, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  await save(join(output, 'manifest.json'), { ...release, revision, dirty, node: '>=24', bridgeProtocol: '0.1', packages: versions, artifacts: files });
  const sums = Object.values(files).map(f => `${f.sha256}  ${f.filename}`);
  sums.push(`${createHash('sha256').update(await readFile(join(output, 'manifest.json'))).digest('hex')}  manifest.json`);
  await writeFile(join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
  console.log(`Preview artifacts: ${output}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
