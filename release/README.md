# Versioned consumer artifacts (preview)

Orchard owns the generic hosts. A downstream application such as OMD owns its
domain bridge, web assets, desktop identity, guest startup/storage and final
installers. Consume a pinned release; do not copy the Orchard monorepo into the
application or depend on a moving `main` checkout.

## Assets

| Asset | Consumer |
| --- | --- |
| `orchard-bridge-contract-<package-version>.tgz` | Installable npm package with JS, declarations, canonical scenario and `CONTRACT.md`; no Orchard checkout needed. |
| `orchard-coconut-desktop-kit-<release-version>.tar.gz` | Curated Tauri host source, trusted React UI, MCP sidecar source, lockfiles and compiled internal packages. |
| `orchard-lime-extension-<release-version>.zip` | Built MV3 extension; extract and Load unpacked in Chrome. |
| `orchard-lime-companion-<release-version>.tar.gz` | Built CLI plus its internal packages and npm lockfile; no TypeScript build required. |
| `manifest.json`, `SHA256SUMS` | Release version, preview channel, source commit, package versions, sizes and hashes. |

The kit and companion use npm workspaces under `vendor/`, with exact internal
package versions. Only compiled JS/declarations and package metadata are shipped
for bridge-contract, agent-client and agent-durable. Their runtime dependencies
are resolved by each artifact's lockfile. No build hooks point to sibling repos;
no Mango server, Pear, Guava, fixtures, tests or `node_modules` are included.
Internal packages are not published to a registry by this workflow.

The release version is in `release/version.json`; internal package versions are
recorded separately. Never replace assets under an existing release version.
For an upgrade, select a new release version, verify its checksums, rebuild and
run the downstream app's integration/data-migration checks. Keep application data
outside an extracted artifact directory so replacing the kit cannot delete it.

## Consume in OMD

Download the named assets and checksum file from the same GitHub Release.
Verify the checksums before extracting or installing:

```sh
sha256sum --check SHA256SUMS
npm install --save-exact ./orchard-bridge-contract-0.1.0.tgz
mkdir -p .desktop
tar -xzf orchard-coconut-desktop-kit-0.1.0.tar.gz -C .desktop
cd .desktop/coconut-desktop-kit
npm ci
```

Requires Node **24+** (the durable runner uses Node SQLite), Rust stable and the
Tauri 2 prerequisites for the target OS. Keep the original downloaded archive,
manifest and hash pinned in the downstream build inputs; the generated directory
can be ignored by Git. `npm ci` installs external dependencies from the registry;
the archives do not contain Node or a full offline npm cache.

Configure these consumer-owned values before building:

- `trusted-origin.txt`: one bare HTTP(S) guest origin, for example
  `http://127.0.0.1:3000`. `npm run build` regenerates the guest capability from
  this value; Rust embeds the same value at compile time. Preserve the narrow
  guest reply permission and the separation of trusted host and guest WebViews.
- `src-tauri/tauri.conf.json`: application identifier, product name/version,
  window title, icons and installer targets for OMD.
- OMD's guest assets/server lifecycle: serve the OMD build at that origin and
  arrange its startup/shutdown in the downstream app. The kit supplies the host;
  it does **not** implement OMD's asset server or automatically import its browser
  notebook. Use OMD's export/import or a separately implemented migration.
- OMD's `window.agentBridgeV1`: implement describe/context/invoke using existing
  domain commands, atomic revision checks and idempotency. Native WebMCP alone
  does not implement this contract.

```sh
npm run build
npm run package:sidecar
npm run tauri -- dev
# After configuring and testing the target platform:
npm run tauri -- build
```

The existing native shell launches `node` from PATH. A self-contained OMD installer
must supply that runtime and adjust its launch path in the downstream integration.
Signing, notarization, auto-update, OMD startup and native end-to-end acceptance
are not supplied by these preview artifacts. The trusted UI still starts with
its existing explicit Open action. MCP scopes, consent and approvals are unchanged.

Lime stays a separate Chrome host; it is not embedded in Tauri. For its companion:

```sh
tar -xzf orchard-lime-companion-0.1.0.tar.gz
cd lime-companion
npm ci
LIME_EXTENSION_ORIGINS=chrome-extension://YOUR_EXTENSION_ID npm start
```

Then follow the companion's bundled README for pairing. These are unpacked
extension artifacts, not Chrome Web Store publication or signed browser packages.

## Produce and verify

On Linux, with Node 24+, `tar`, `zip` and `unzip`, install the producer's locked
dependencies, then build and verify the artifacts:

```sh
for directory in packages/bridge-contract mango packages/agent-durable coconut lime; do
  (cd "$directory" && npm ci)
done
node release/package.mjs
node release/check.mjs
```

The check verifies hashes, extracts into a new system temporary directory,
installs from distributed lockfiles, checks local links stay inside the artifact,
customizes the guest origin and app identity, rebuilds the trusted UI/sidecar,
starts real packaged processes, tests authenticated Coconut MCP with the official
SDK, denies unauthorized HTTP access and opens/closes the real SQLite runner.
It also installs the bridge tarball in a separate empty npm project and checks
the extension's declared files. It sends no inference requests. Process/transport
checks do not substitute for native WebView or Chrome acceptance.

The consumer-artifacts workflow runs these checks on PRs/main and compiles/tests
the extracted Rust host on Linux. A matching `orchard-v<release-version>` tag
also runs the existing full acceptance workflow, including native platform gates,
before creating a **draft prerelease** with the tested assets. It does not publish
an npm package, browser extension or production installer. This PR creates the
release machinery; no release is issued merely by opening or merging it.
