// Optional real-provider interoperability lane. Disposable original identities,
// loopback HTTP/dev-mode only; no production account, mail or model calls.
import {chromium, expect, type Page} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createApp} from '../src/server/app.ts';
import {openDatabase} from '../src/server/database.ts';
const image = 'quay.io/keycloak/keycloak:26.8.0@sha256:b0f60d489d51c5d113390bdf5461d4c06e6051be026c05549f2e1e10ec352bcc';
const container = 'pear-keycloak-' + crypto.randomUUID(), origin = 'http://127.0.0.1:4336', provider = 'http://127.0.0.1:4337';
const issuer = provider + '/realms/pear-original-acceptance', protocol = issuer + '/protocol/openid-connect';
const config = {issuer, authorizationEndpoint: protocol + '/auth', tokenEndpoint: protocol + '/token', jwksUri: protocol + '/certs', clientId: 'pear-original-browser'};
const run = promisify(execFile), env = {...process.env};
for (const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) delete env[key];
const docker = (...args: string[]) => run('docker', ['--host=unix:///var/run/docker.sock', ...args], {env, timeout: 180000, maxBuffer: 1024*1024});
const db = openDatabase(':memory:', true), accountsBefore = db.prepare('SELECT COUNT(*) n FROM accounts').get()!.n;
const adminSubject = '91ef9e50-f7c1-4f88-bcc0-706039947a11', learnerSubject = '91ef9e50-f7c1-4f88-bcc0-706039947a12';
db.prepare('INSERT INTO identity_links VALUES(?,?,?,?,?)').run('demo', issuer, adminSubject, 'admin', new Date().toISOString());
const realFetch = globalThis.fetch;
let observedSignedRole = false;
// Observe (never replace) the real provider response. Token bytes stay private.
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const response = await realFetch(...args);
  if (String(args[0]) === config.tokenEndpoint && response.ok) {
    const token = (await response.clone().json()).id_token;
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    observedSignedRole ||= claims.sub === learnerSubject && claims.role === 'admin';
  }
  return response;
};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined, app: Awaited<ReturnType<typeof createApp>>['app'] | undefined;
try {
  await docker('create', '--rm', '--name', container, '--memory=1g', '--cpus=2', '-p', '127.0.0.1:4337:8080', image, 'start-dev', '--import-realm', '--hostname', provider);
  await docker('cp', resolve('tests/fixtures/keycloak'), container + ':/opt/keycloak/data/import');
  await docker('start', container);
  let ready = false;
  for (let i=0; i<120; i++) {
    try {if ((await fetch(issuer + '/.well-known/openid-configuration', {signal: AbortSignal.timeout(1000)})).ok) {ready=true;break;}} catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(ready, 'real Keycloak must start');
  const metadata = await (await fetch(issuer + '/.well-known/openid-configuration')).json();
  assert.equal(metadata.issuer, issuer); assert.equal(metadata.token_endpoint, config.tokenEndpoint);
  ({app} = await createApp({db, origin, oidc: config, identityFixture: true, developmentAuth: false, staticRoot: resolve('dist')}));
  await app.listen({port: 4336, host: '127.0.0.1'});
  browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox']});
  const admin = await browser.newPage(), learner = await browser.newPage();
  async function signIn(page: Page, url: string, user: string) {
    await page.context().clearCookies(); await page.goto(url);
    await page.getByRole('button', {name: 'Continue with organization SSO', exact: true}).click();
    await page.locator('#username').fill(user); await page.locator('#password').fill('original-test-only');
    await page.locator('#kc-login').click();
    try {await page.waitForURL(origin + '/**');}
    catch (error) {const u = new URL(page.url()); console.error('Provider login page:', u.origin + u.pathname, await page.locator('body').innerText()); throw error;}
  }
  await signIn(learner, origin, 'wrong-identity');
  await expect(learner.locator('body')).toContainText('Organization sign-in failed');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM accounts').get()!.n, accountsBefore);
  await signIn(admin, origin, 'reviewed-admin');
  await admin.getByRole('button', {name: 'Administration', exact: true}).click();
  const invitations = admin.getByRole('region', {name: 'User invitations', exact: true});
  await invitations.getByLabel('Invited account ID', {exact:true}).fill('learner-a');
  await invitations.getByLabel('Invited issuer subject', {exact:true}).fill(learnerSubject);
  await invitations.getByLabel('Invitation email', {exact:true}).fill('original@example.test');
  await invitations.getByLabel('Invitation review reason', {exact:true}).fill('Human-reviewed real Keycloak sandbox');
  await invitations.getByRole('button', {name:'Create reviewed invitation',exact:true}).click();
  const url = await invitations.getByRole('link', {name:'Invitation link',exact:true}).getAttribute('href'); assert.ok(url);
  await signIn(learner, url, 'wrong-identity');
  await expect(learner.locator('body')).toContainText('Organization sign-in failed');
  assert.equal(db.prepare('SELECT state FROM user_invitations').get()!.state, 'pending');
  await signIn(learner, url, 'invited-learner');
  await expect(learner.getByRole('button', {name:'Sign out',exact:true})).toBeVisible();
  await expect(learner.getByRole('button', {name:'Administration',exact:true})).toHaveCount(0);
  assert.equal((await learner.evaluate(async () => (await (await fetch('/api/session')).json()).principal)).role, 'learner');
  assert.ok(observedSignedRole, 'real signed ID token must include the hostile role claim');
  assert.equal(db.prepare('SELECT state FROM user_invitations').get()!.state, 'accepted');
  await learner.goto(url); await learner.getByRole('button',{name:'Accept invitation with organization SSO',exact:true}).click();
  await expect(learner.getByRole('alert')).toContainText('Organization sign-in unavailable');
  const identity = admin.getByRole('region',{name:'Organization identity settings',exact:true});
  await identity.getByLabel('Existing account ID',{exact:true}).fill('learner-a');
  await identity.getByLabel('Issuer subject',{exact:true}).fill(learnerSubject);
  await identity.getByLabel('Identity mapping reason',{exact:true}).fill('Human-reviewed sandbox revocation');
  await identity.getByLabel('Identity mapping action',{exact:true}).selectOption('unlink');
  await identity.getByRole('button',{name:'Save reviewed identity mapping',exact:true}).click();
  await expect(identity.getByRole('status')).toContainText('target sessions revoked');
  assert.equal(await learner.evaluate(async () => (await fetch('/api/session')).status), 401);
  await learner.goto(origin); await learner.getByRole('button',{name:'Continue with organization SSO',exact:true}).click();
  // The live IdP still has its session. Pear must refuse it after unlinking.
  await expect(learner.locator('body')).toContainText('Organization sign-in failed');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM accounts').get()!.n, accountsBefore);
  await mkdir('artifacts', {recursive:true});
  await admin.screenshot({path:'artifacts/keycloak-reviewed-revocation.png',fullPage:true});
  await writeFile('artifacts/keycloak-report.json', JSON.stringify({passed:true,image,transport:'Real Docker Keycloak / Chromium / Pear HTTP / SQLite; loopback development profile',checks:['actual authorization-code/S256 PKCE/RS256/JWKS login','unmapped identity cannot provision an account','wrong subject cannot consume invitation','exact subject accepts once','signed role claim cannot grant Pear admin','human unlink invalidates Pear session and refuses retained IdP session'],productionTLS:false,providerLogout:'NOT IMPLEMENTED/NOT VERIFIED',externalRecipientDelivery:'NOT VERIFIED',go1Reference:'NOT VERIFIED'},null,2));
  console.log('Real Keycloak / Pear browser interoperability PASS');
} finally {
  globalThis.fetch = realFetch;
  await browser?.close(); app?.server.closeAllConnections(); await app?.close(); db.close();
  await docker('rm','-f',container).catch(() => {});
}
